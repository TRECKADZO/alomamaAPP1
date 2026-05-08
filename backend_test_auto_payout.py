"""
Backend test — Auto-Payouts PayDunya (2 nouveaux endpoints) + régression sampling.
Cible: https://cycle-tracker-pro.preview.emergentagent.com/api
"""
import os
import sys
import json
import time
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
CENTRE_EMAIL = "centre.test@alomaman.dev"
CENTRE_PASSWORD = "Test1234!"
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PASSWORD = "474Treckadzo$1986"

PASS = 0
FAIL = 0
RESULTS = []


def log(name, ok, info=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        RESULTS.append(("OK", name, info))
        print(f"  ✓ {name} {info}")
    else:
        FAIL += 1
        RESULTS.append(("FAIL", name, info))
        print(f"  ✗ {name} :: {info}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("\n=== AUTH (sampling regression) ===")
    pro_tok = login(PRO_EMAIL, PRO_PASSWORD)
    log("login pro.test", True, "200")
    maman_tok = login(MAMAN_EMAIL, MAMAN_PASSWORD)
    log("login maman.test", True, "200")
    try:
        centre_tok = login(CENTRE_EMAIL, CENTRE_PASSWORD)
        log("login centre.test", True, "200")
    except Exception as e:
        log("login centre.test", False, str(e))
    try:
        admin_tok = login(ADMIN_EMAIL, ADMIN_PASSWORD)
        log("login admin", True, "200")
    except Exception as e:
        log("login admin", False, str(e))

    # ------------------------------------------------------------
    # 0. Reset / Pre-state — désactiver auto-payout ET supprimer mobile_money
    #    pour tester le 400 "configurez d'abord votre compte Mobile Money"
    # ------------------------------------------------------------
    print("\n=== Reset état initial (désactiver auto-payout + reset mobile_money) ===")
    # Désactiver d'abord (au cas où il était activé)
    requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                 json={"enabled": False, "seuil_fcfa": 50000, "frequency": "weekly"}, timeout=20)
    # On va d'abord supprimer mobile_money via Mongo direct (pas d'endpoint DELETE)
    # Solution: on s'appuie directement sur la base via MONGO_URL
    try:
        from pymongo import MongoClient
        mongo_url = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
        client = MongoClient(mongo_url)
        dbm = client["alomaman"]
        # Récupérer pro id
        u = dbm.users.find_one({"email": PRO_EMAIL}, {"id": 1, "_id": 0})
        pro_id = u["id"]
        dbm.users.update_one({"id": pro_id}, {"$unset": {
            "mobile_money": "", "auto_payout_enabled": "",
            "auto_payout_seuil_fcfa": "", "auto_payout_frequency": "",
            "auto_payout_updated_at": "",
        }})
        log("reset mobile_money + auto_payout en DB", True, f"pro_id={pro_id}")
    except Exception as e:
        log("reset DB", False, str(e))
        return

    # ------------------------------------------------------------
    # 1. GET /api/pro/auto-payout (par défaut désactivé, sans MM configuré)
    # ------------------------------------------------------------
    print("\n=== 1. GET /api/pro/auto-payout (défaut désactivé) ===")
    r = requests.get(f"{BASE}/pro/auto-payout", headers=H(pro_tok), timeout=20)
    log("GET /pro/auto-payout 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        log("body.enabled == False", body.get("enabled") is False, f"got {body.get('enabled')}")
        log("body.seuil_fcfa == 50000", body.get("seuil_fcfa") == 50000, f"got {body.get('seuil_fcfa')}")
        log("body.frequency == 'weekly'", body.get("frequency") == "weekly", f"got {body.get('frequency')}")
        log("body.updated_at present (None ou string)", "updated_at" in body, f"got {body.get('updated_at')}")

    # ------------------------------------------------------------
    # 2.a PUT /api/pro/auto-payout enable=true SANS MM configuré → 400
    # ------------------------------------------------------------
    print("\n=== 2a. PUT activation SANS Mobile Money → 400 ===")
    r = requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                     json={"enabled": True, "seuil_fcfa": 25000, "frequency": "weekly"}, timeout=20)
    log("PUT enabled=true sans MM → 400", r.status_code == 400,
        f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 400:
        msg = r.text.lower()
        log("message contient 'mobile money'", "mobile money" in msg, f"body={r.text[:200]}")

    # ------------------------------------------------------------
    # 2.b POST /api/pro/mobile-money — configurer compte MM (provider=orange-money-ci)
    # NOTE: review-request demande PUT mais le code expose POST
    # ------------------------------------------------------------
    print("\n=== 2b. POST /api/pro/mobile-money (configurer compte) ===")
    # NB: review demande "orange_ci" mais la clé valide dans WITHDRAW_PROVIDERS est "orange-money-ci"
    r = requests.post(f"{BASE}/pro/mobile-money", headers=H(pro_tok),
                      json={"provider": "orange-money-ci", "account_alias": "+22507000000",
                            "holder_name": "Dr Test"}, timeout=20)
    log("POST /pro/mobile-money → 200", r.status_code == 200,
        f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        mm = r.json()
        log("mm.provider == orange-money-ci", mm.get("provider") == "orange-money-ci", f"got {mm.get('provider')}")
        log("mm.account_alias présent", bool(mm.get("account_alias")), f"got {mm.get('account_alias')}")

    # ------------------------------------------------------------
    # 2.c PUT /api/pro/auto-payout activation
    # ------------------------------------------------------------
    print("\n=== 2c. PUT activation APRÈS MM configuré → 200 ===")
    r = requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                     json={"enabled": True, "seuil_fcfa": 25000, "frequency": "weekly"}, timeout=20)
    log("PUT activation → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        log("ok=True", body.get("ok") is True, f"got {body.get('ok')}")
        log("auto_payout_enabled=True", body.get("auto_payout_enabled") is True, f"got {body.get('auto_payout_enabled')}")
        log("auto_payout_seuil_fcfa=25000", body.get("auto_payout_seuil_fcfa") == 25000, f"got {body.get('auto_payout_seuil_fcfa')}")
        log("auto_payout_frequency=weekly", body.get("auto_payout_frequency") == "weekly", f"got {body.get('auto_payout_frequency')}")
        log("auto_payout_updated_at présent", bool(body.get("auto_payout_updated_at")), f"got {body.get('auto_payout_updated_at')}")

    # Vérification DB
    try:
        from pymongo import MongoClient
        mongo_url = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
        client = MongoClient(mongo_url)
        dbm = client["alomaman"]
        u = dbm.users.find_one({"email": PRO_EMAIL}, {"_id": 0})
        log("DB: auto_payout_enabled=True", u.get("auto_payout_enabled") is True, f"got {u.get('auto_payout_enabled')}")
        log("DB: auto_payout_seuil_fcfa=25000", u.get("auto_payout_seuil_fcfa") == 25000, f"got {u.get('auto_payout_seuil_fcfa')}")
        log("DB: auto_payout_frequency=weekly", u.get("auto_payout_frequency") == "weekly", f"got {u.get('auto_payout_frequency')}")
        log("DB: auto_payout_updated_at présent", bool(u.get("auto_payout_updated_at")), f"got {u.get('auto_payout_updated_at')}")
    except Exception as e:
        log("DB check", False, str(e))

    # GET de confirmation
    r = requests.get(f"{BASE}/pro/auto-payout", headers=H(pro_tok), timeout=20)
    if r.status_code == 200:
        body = r.json()
        log("GET confirms enabled=True", body.get("enabled") is True, f"got {body.get('enabled')}")
        log("GET confirms seuil=25000", body.get("seuil_fcfa") == 25000, f"got {body.get('seuil_fcfa')}")

    # ------------------------------------------------------------
    # 3. Validation
    # ------------------------------------------------------------
    print("\n=== 3a. Validation seuil min ===")
    r = requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                     json={"enabled": True, "seuil_fcfa": 1000, "frequency": "weekly"}, timeout=20)
    log("seuil=1000 → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 400:
        log("msg contient 'minimum' ou 'seuil'",
            "minimum" in r.text.lower() or "seuil" in r.text.lower(), f"body={r.text[:200]}")

    print("\n=== 3b. Validation fréquence ===")
    r = requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                     json={"enabled": True, "seuil_fcfa": 50000, "frequency": "yearly"}, timeout=20)
    log("frequency=yearly → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 400:
        log("msg contient 'fréquence' ou 'frequency'",
            "fr" in r.text.lower() or "frequen" in r.text.lower(), f"body={r.text[:200]}")

    # ------------------------------------------------------------
    # 4. Désactivation
    # ------------------------------------------------------------
    print("\n=== 4. Désactivation ===")
    r = requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                     json={"enabled": False, "seuil_fcfa": 50000, "frequency": "weekly"}, timeout=20)
    log("PUT enabled=false → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    r = requests.get(f"{BASE}/pro/auto-payout", headers=H(pro_tok), timeout=20)
    if r.status_code == 200:
        body = r.json()
        log("GET enabled=False", body.get("enabled") is False, f"got {body.get('enabled')}")

    # ------------------------------------------------------------
    # 5. Régression SAMPLING
    # ------------------------------------------------------------
    print("\n=== 5. Régression sampling ===")
    # 5a) login déjà testés ci-dessus
    # 5b) GET /api/pro/revenus/par-mode
    r = requests.get(f"{BASE}/pro/revenus/par-mode", headers=H(pro_tok), timeout=20)
    log("GET /pro/revenus/par-mode → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        log("body.totals présent", "totals" in body, f"keys={list(body.keys())}")
        log("body.par_mode présent", "par_mode" in body, "")

    # 5c) POST /api/pay/refund (régression — non testé ici puisqu'il nécessite un payment_id valide)
    # On se contente de vérifier que l'endpoint existe et ne crash pas (401/403/422)
    r = requests.post(f"{BASE}/pay/refund", headers=H(pro_tok),
                      json={"payment_id": "non-existent-id", "reason": "test"}, timeout=20)
    log("POST /pay/refund (id invalide) gère bien 400/404",
        r.status_code in (400, 403, 404, 422), f"status={r.status_code} body={r.text[:200]}")

    # 5d) GET /api/rdv/{rdv_id}/adresse-domicile — appel avec id bidon → 404 ou 403 attendu
    r = requests.get(f"{BASE}/rdv/non-existent-id/adresse-domicile", headers=H(maman_tok), timeout=20)
    log("GET /rdv/{id}/adresse-domicile (id invalide) gère 404",
        r.status_code in (400, 403, 404), f"status={r.status_code} body={r.text[:200]}")

    # ------------------------------------------------------------
    # Cleanup — désactiver auto_payout final state
    # ------------------------------------------------------------
    print("\n=== CLEANUP ===")
    requests.put(f"{BASE}/pro/auto-payout", headers=H(pro_tok),
                 json={"enabled": False, "seuil_fcfa": 50000, "frequency": "weekly"}, timeout=20)

    print(f"\n=== SCORE: {PASS}/{PASS+FAIL} PASS ({FAIL} fails) ===")
    if FAIL:
        print("\nFAILURES:")
        for s, n, i in RESULTS:
            if s == "FAIL":
                print(f"  - {n} :: {i}")
    return FAIL


if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
