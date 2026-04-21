"""
Backend tests — Prestations Pro + Commission dynamique.
Covers:
 1) Prestations CRUD (Pro)
 2) Prestations publiques (active only, sorted by price)
 3) RDV avec prestation_id (tarif de prestation prioritaire)
 4) Commission dynamique (10% standard, 5% premium)
 5) Endpoint /pro/revenus
 6) Plans descriptions incluent commission details
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://maman-rdv-booking.preview.emergentagent.com/api"

PRO_EMAIL = "pro@test.com"
PRO_PW = "Pro123!"
MAMAN_EMAIL = "maman@test.com"
MAMAN_PW = "Maman123!"
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PW = "474Treckadzo$1986"

results = []


def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    results.append({"name": name, "ok": ok, "detail": detail})


def auth(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        print(f"LOGIN FAIL {email} → {r.status_code} {r.text[:200]}")
        sys.exit(2)
    data = r.json()
    return data["token"], data["user"]


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    # === 0) Logins
    pro_token, pro_user = auth(PRO_EMAIL, PRO_PW)
    log("Login pro@test.com", bool(pro_token), f"id={pro_user['id']}")
    maman_token, maman_user = auth(MAMAN_EMAIL, MAMAN_PW)
    log("Login maman@test.com", bool(maman_token), f"id={maman_user['id']}")
    admin_token, admin_user = auth(ADMIN_EMAIL, ADMIN_PW)
    log("Login admin", bool(admin_token), f"role={admin_user['role']}")

    pro_id = pro_user["id"]

    # === Clean up any existing prestations on this pro to start clean ===
    r = requests.get(f"{BASE}/pro/prestations", headers=H(pro_token), timeout=30)
    for p in r.json():
        requests.delete(f"{BASE}/pro/prestations/{p['id']}", headers=H(pro_token), timeout=30)

    # === 1) Prestations CRUD (Pro)
    print("\n--- 1) Prestations CRUD (Pro) ---")
    payload1 = {
        "nom": "Consultation prénatale",
        "prix_fcfa": 15000,
        "duree_min": 45,
        "description": "Suivi mensuel",
        "active": True,
    }
    r = requests.post(f"{BASE}/pro/prestations", headers=H(pro_token), json=payload1, timeout=30)
    ok = r.status_code == 200 and "id" in r.json()
    log("POST /pro/prestations returns 200 with id", ok, f"status={r.status_code} body={r.text[:200]}")
    prest1 = r.json() if ok else None

    r = requests.get(f"{BASE}/pro/prestations", headers=H(pro_token), timeout=30)
    items = r.json()
    found = any(p["id"] == prest1["id"] for p in items) if prest1 else False
    log("GET /pro/prestations contains created prestation", found, f"count={len(items)}")

    upd = {
        "nom": "Consultation prénatale Premium",
        "prix_fcfa": 20000,
        "duree_min": 45,
        "description": "Suivi approfondi",
        "active": True,
    }
    r = requests.patch(
        f"{BASE}/pro/prestations/{prest1['id']}",
        headers=H(pro_token),
        json=upd,
        timeout=30,
    )
    ok = r.status_code == 200 and r.json().get("prix_fcfa") == 20000 and r.json().get("nom") == "Consultation prénatale Premium"
    log("PATCH /pro/prestations/{id} updates prix_fcfa+nom", ok, f"status={r.status_code} body={r.text[:200]}")

    r = requests.delete(f"{BASE}/pro/prestations/{prest1['id']}", headers=H(pro_token), timeout=30)
    ok = r.status_code == 200 and r.json().get("ok") is True
    log("DELETE /pro/prestations/{id}", ok, f"status={r.status_code}")

    r = requests.get(f"{BASE}/pro/prestations", headers=H(pro_token), timeout=30)
    items = r.json()
    ok = all(p["id"] != prest1["id"] for p in items)
    log("After DELETE, prestation not in GET /pro/prestations", ok, f"count={len(items)}")

    # === 2) Prestations publiques (maman voit seulement actives, tri par prix)
    print("\n--- 2) Prestations publiques (Maman) ---")
    # Create 2 active + 1 inactive
    p_active1 = requests.post(
        f"{BASE}/pro/prestations",
        headers=H(pro_token),
        json={"nom": "Consultation prénatale", "prix_fcfa": 15000, "duree_min": 45, "description": "Suivi mensuel", "active": True},
        timeout=30,
    ).json()
    p_active2 = requests.post(
        f"{BASE}/pro/prestations",
        headers=H(pro_token),
        json={"nom": "Échographie", "prix_fcfa": 25000, "duree_min": 30, "description": "Écho morphologique", "active": True},
        timeout=30,
    ).json()
    p_inactive = requests.post(
        f"{BASE}/pro/prestations",
        headers=H(pro_token),
        json={"nom": "Test archivée", "prix_fcfa": 5000, "duree_min": 20, "description": "inactive", "active": False},
        timeout=30,
    ).json()

    r = requests.get(f"{BASE}/pros/{pro_id}/prestations", headers=H(maman_token), timeout=30)
    ok = r.status_code == 200
    pub = r.json() if ok else []
    log("GET /pros/{pro_id}/prestations (maman) 200", ok, f"status={r.status_code}")
    # Should be 2 entries (only active)
    ok = len(pub) == 2
    log("Public prestations returns only active (count=2)", ok, f"count={len(pub)} names={[p.get('nom') for p in pub]}")
    # Sorted ASC by prix_fcfa
    prices = [p["prix_fcfa"] for p in pub]
    ok = prices == sorted(prices)
    log("Public prestations sorted by prix_fcfa ASC", ok, f"prices={prices}")

    # Also confirm inactive not in list
    ok = all(p["id"] != p_inactive["id"] for p in pub)
    log("Inactive prestation not in public list", ok)

    # === 3) RDV avec prestation_id → tarif de la prestation prévaut
    print("\n--- 3) RDV avec prestation_id ---")
    # Use p_active1 (15000, "Consultation prénatale")
    body = {
        "pro_id": pro_id,
        "date": "2026-05-20T10:00",
        "motif": "Test",
        "type_consultation": "prenatale",
        "prestation_id": p_active1["id"],
        "tarif_fcfa": 99999,  # deliberately wrong
    }
    r = requests.post(f"{BASE}/rdv", headers=H(maman_token), json=body, timeout=30)
    ok = r.status_code == 200
    rdv = r.json() if ok else {}
    log("POST /rdv with prestation_id returns 200", ok, f"status={r.status_code} body={r.text[:300]}")
    ok = rdv.get("tarif_fcfa") == 15000
    log("RDV.tarif_fcfa = 15000 (prestation price wins over 99999)", ok, f"got={rdv.get('tarif_fcfa')}")
    ok = rdv.get("prestation_id") == p_active1["id"]
    log("RDV.prestation_id set", ok, f"got={rdv.get('prestation_id')}")
    ok = rdv.get("prestation_nom") == "Consultation prénatale"
    log("RDV.prestation_nom = 'Consultation prénatale'", ok, f"got={rdv.get('prestation_nom')}")
    rdv_for_payment = rdv

    # === 4) Commission dynamique
    print("\n--- 4) Commission dynamique ---")

    # Ensure pro is NOT premium first (clear via admin PATCH if possible)
    # Admin endpoint to modify user
    r_set_nopremium = requests.patch(
        f"{BASE}/admin/users/{pro_id}",
        headers=H(admin_token),
        json={"premium": False, "premium_until": None},
        timeout=30,
    )
    print(f"    admin set pro premium=False → {r_set_nopremium.status_code} {r_set_nopremium.text[:150]}")

    # Create a fresh RDV with tarif 10000 (not linked to prestation to avoid override)
    rdv2_body = {
        "pro_id": pro_id,
        "date": "2026-05-21T11:00",
        "motif": "Commission std test",
        "type_consultation": "prenatale",
        "tarif_fcfa": 10000,
    }
    r = requests.post(f"{BASE}/rdv", headers=H(maman_token), json=rdv2_body, timeout=30)
    ok = r.status_code == 200
    rdv2 = r.json() if ok else {}
    log("Create RDV tarif=10000 for commission test (no prestation)", ok, f"status={r.status_code} tarif={rdv2.get('tarif_fcfa')}")

    # Call /pay/consultation
    r = requests.post(
        f"{BASE}/pay/consultation",
        headers=H(maman_token),
        json={"rdv_id": rdv2["id"]},
        timeout=30,
    )
    ok = r.status_code == 200
    body = r.json() if ok else {}
    payment_std = body.get("payment", {}) if ok else {}
    log("POST /pay/consultation (pro standard) 200", ok, f"status={r.status_code} body={r.text[:250]}")
    log(
        "Standard commission=1000 (10%)",
        payment_std.get("commission") == 1000,
        f"got={payment_std.get('commission')}",
    )
    log(
        "Standard commission_rate=0.10",
        abs(float(payment_std.get("commission_rate", 0)) - 0.10) < 1e-6,
        f"got={payment_std.get('commission_rate')}",
    )
    log(
        "Standard pro_amount=9000",
        payment_std.get("pro_amount") == 9000,
        f"got={payment_std.get('pro_amount')}",
    )

    # Now make pro premium via admin PATCH
    future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    r_set = requests.patch(
        f"{BASE}/admin/users/{pro_id}",
        headers=H(admin_token),
        json={"premium": True, "premium_until": future},
        timeout=30,
    )
    ok = r_set.status_code == 200
    log("Admin PATCH pro premium=True", ok, f"status={r_set.status_code} body={r_set.text[:200]}")

    # Verify via /auth/me as pro
    r_me = requests.get(f"{BASE}/auth/me", headers=H(pro_token), timeout=30)
    pro_me = r_me.json() if r_me.status_code == 200 else {}
    print(f"    pro /auth/me premium={pro_me.get('premium')} until={pro_me.get('premium_until')}")

    if pro_me.get("premium") and pro_me.get("premium_until"):
        # Create another RDV tarif=10000
        rdv3_body = {
            "pro_id": pro_id,
            "date": "2026-05-22T12:00",
            "motif": "Commission premium test",
            "type_consultation": "prenatale",
            "tarif_fcfa": 10000,
        }
        r = requests.post(f"{BASE}/rdv", headers=H(maman_token), json=rdv3_body, timeout=30)
        ok = r.status_code == 200
        rdv3 = r.json() if ok else {}
        log("Create RDV tarif=10000 for premium commission test", ok, f"tarif={rdv3.get('tarif_fcfa')}")

        r = requests.post(
            f"{BASE}/pay/consultation",
            headers=H(maman_token),
            json={"rdv_id": rdv3["id"]},
            timeout=30,
        )
        ok = r.status_code == 200
        body = r.json() if ok else {}
        payment_prem = body.get("payment", {}) if ok else {}
        log("POST /pay/consultation (pro Premium) 200", ok, f"status={r.status_code} body={r.text[:250]}")
        log(
            "Premium commission=500 (5%)",
            payment_prem.get("commission") == 500,
            f"got={payment_prem.get('commission')}",
        )
        log(
            "Premium commission_rate=0.05",
            abs(float(payment_prem.get("commission_rate", 0)) - 0.05) < 1e-6,
            f"got={payment_prem.get('commission_rate')}",
        )
        log(
            "Premium pro_amount=9500",
            payment_prem.get("pro_amount") == 9500,
            f"got={payment_prem.get('pro_amount')}",
        )
    else:
        log("Pro was not upgraded to premium (skipping premium commission check)", False, "admin PATCH did not persist premium")

    # === 5) Endpoint /pro/revenus ===
    print("\n--- 5) Endpoint /pro/revenus ---")
    r = requests.get(f"{BASE}/pro/revenus", headers=H(pro_token), timeout=30)
    ok = r.status_code == 200
    rev = r.json() if ok else {}
    log("GET /pro/revenus 200", ok, f"status={r.status_code} body={r.text[:300]}")
    required = [
        "total_brut_fcfa",
        "total_commission_fcfa",
        "total_net_fcfa",
        "pending_count",
        "pending_fcfa",
        "monthly",
        "recent",
        "is_premium",
        "current_commission_rate",
        "premium_rate",
        "standard_rate",
    ]
    missing = [k for k in required if k not in rev]
    log("Revenus response has all required fields", not missing, f"missing={missing}")
    # values numeric (not None)
    numeric_keys = ["total_brut_fcfa", "total_commission_fcfa", "total_net_fcfa", "pending_count", "pending_fcfa", "current_commission_rate", "premium_rate", "standard_rate"]
    bad = [k for k in numeric_keys if rev.get(k) is None or not isinstance(rev.get(k), (int, float))]
    log("Revenus numeric fields not null", not bad, f"bad={bad}  values={ {k: rev.get(k) for k in numeric_keys} }")
    log(
        "premium_rate=0.05",
        abs(float(rev.get("premium_rate", 0)) - 0.05) < 1e-6,
        f"got={rev.get('premium_rate')}",
    )
    log(
        "standard_rate=0.10",
        abs(float(rev.get("standard_rate", 0)) - 0.10) < 1e-6,
        f"got={rev.get('standard_rate')}",
    )
    log(
        "monthly is array",
        isinstance(rev.get("monthly"), list),
        f"type={type(rev.get('monthly')).__name__}",
    )
    log(
        "recent is array",
        isinstance(rev.get("recent"), list),
        f"type={type(rev.get('recent')).__name__}",
    )

    # === 6) Plan descriptions ===
    print("\n--- 6) /plans descriptions ---")
    r = requests.get(f"{BASE}/plans", timeout=30)
    ok = r.status_code == 200
    plans_body = r.json() if ok else {}
    log("GET /plans 200", ok, f"status={r.status_code}")
    prof_plan = plans_body.get("plans", {}).get("professionnel", {})
    features = prof_plan.get("features", [])
    ok = any("Commission réduite : 5% au lieu de 10%" in f for f in features)
    log("plans.professionnel.features contains 'Commission réduite : 5% au lieu de 10%'", ok, f"features={features}")
    free_limits = prof_plan.get("free_limits", "")
    ok = "commission 10%" in free_limits.lower() and "consultation" in free_limits.lower()
    log("plans.professionnel.free_limits mentions commission 10% on consultations", ok, f"free_limits={free_limits}")

    # === Clean up created data ===
    print("\n--- Cleanup ---")
    for pid in [p_active1.get("id"), p_active2.get("id"), p_inactive.get("id")]:
        if pid:
            try:
                requests.delete(f"{BASE}/pro/prestations/{pid}", headers=H(pro_token), timeout=15)
            except Exception:
                pass
    # Reset pro to NOT premium to leave environment clean
    try:
        requests.patch(
            f"{BASE}/admin/users/{pro_id}",
            headers=H(admin_token),
            json={"premium": False, "premium_until": None},
            timeout=15,
        )
    except Exception:
        pass

    # === Summary ===
    print("\n=== SUMMARY ===")
    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    print(f"{passed}/{total} PASS")
    failed = [r for r in results if not r["ok"]]
    if failed:
        print("Failed checks:")
        for f in failed:
            print(f"  - {f['name']} — {f['detail']}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
