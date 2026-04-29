"""
Tests for review request 2026:
1) Recherche Pro avec mapping intelligent + endpoint single Pro
2) Mesures bébé — POST /api/enfants/{eid}/mesures
3) Reminders (rappel patient avec heure)
"""
import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"

results = []
fail_count = 0


def rec(name, ok, detail=""):
    global fail_count
    results.append((ok, name, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}: {detail}")
    if not ok:
        fail_count += 1


def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    r.raise_for_status()
    return r.json()


def auth_headers(tok):
    return {"Authorization": f"Bearer {tok}"}


def register(email, pwd, name, role="maman", phone=None, specialite=None):
    payload = {
        "email": email,
        "password": pwd,
        "name": name,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    if phone:
        payload["phone"] = phone
    if specialite:
        payload["specialite"] = specialite
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=20)
    if r.status_code != 200:
        return None
    return r.json()


# =============== SECTION 1 — Recherche Pro ===============
print("\n=== Section 1: Recherche Pro ===\n")

maman = login(MAMAN_EMAIL, MAMAN_PWD)
maman_tok = maman["token"]
maman_id = maman["user"]["id"]
H_MAMAN = auth_headers(maman_tok)

pro_login = login(PRO_EMAIL, PRO_PWD)
pro_tok = pro_login["token"]
pro_id = pro_login["user"]["id"]
H_PRO = auth_headers(pro_tok)

# Ensure pro has a "consultation" prestation OR a disponibilité with type_id=consultation
# Create a basic prestation "Consultation pédiatrique" if missing
def ensure_pro_setup():
    # List pro's prestations
    r = requests.get(f"{BASE}/pro/prestations", headers=H_PRO, timeout=20)
    if r.status_code != 200:
        rec("ensure pro setup — list prestations", False, f"{r.status_code} {r.text[:120]}")
        return
    prestations = r.json()
    has_consult = any("consultation" in (p.get("nom") or "").lower() for p in prestations)
    has_echo = any("écho" in (p.get("nom") or "").lower() or "echo" in (p.get("nom") or "").lower() for p in prestations)
    has_pediatre = any("pédiatr" in (p.get("nom") or "").lower() or "pediatr" in (p.get("nom") or "").lower() or "pédiatre" in (p.get("specialite") or "").lower() for p in prestations)
    if not has_consult:
        body = {"nom": "Consultation générale", "duree_min": 30, "prix_fcfa": 10000, "active": True, "description": "Consultation médicale standard"}
        r = requests.post(f"{BASE}/pro/prestations", headers=H_PRO, json=body, timeout=20)
        rec("seed: créer prestation Consultation", r.status_code == 200, f"status={r.status_code}")
    if not has_echo:
        body = {"nom": "Échographie obstétricale", "duree_min": 30, "prix_fcfa": 30000, "active": True, "description": "Échographie 2D"}
        r = requests.post(f"{BASE}/pro/prestations", headers=H_PRO, json=body, timeout=20)
        rec("seed: créer prestation Échographie", r.status_code == 200, f"status={r.status_code}")
    if not has_pediatre:
        body = {"nom": "Consultation pédiatrique", "duree_min": 30, "prix_fcfa": 8000, "active": True, "description": "Consultation enfant"}
        r = requests.post(f"{BASE}/pro/prestations", headers=H_PRO, json=body, timeout=20)
        rec("seed: créer prestation Pédiatrique", r.status_code == 200, f"status={r.status_code}")

ensure_pro_setup()

# Test 1a: prestation=consultation
r = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"prestation": "consultation"}, timeout=20)
ok = r.status_code == 200 and len(r.json()) >= 1
rec("GET /search/pros?prestation=consultation ≥1", ok, f"status={r.status_code} count={len(r.json()) if r.status_code==200 else 'ERR'}")

# Test 1b: prestation=pédiatre
r = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"prestation": "pédiatre"}, timeout=20)
ok = r.status_code == 200 and len(r.json()) >= 1
rec("GET /search/pros?prestation=pédiatre ≥1", ok, f"status={r.status_code} count={len(r.json()) if r.status_code==200 else 'ERR'}")

# Test 1c: prestation=échographie & max_prix=50000 → should include
r = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"prestation": "échographie", "max_prix": 50000}, timeout=20)
data = r.json() if r.status_code == 200 else []
ok = r.status_code == 200 and len(data) >= 1
rec("GET /search/pros?prestation=échographie&max_prix=50000 ≥1", ok, f"status={r.status_code} count={len(data)}")

# And max_prix=10000 → should EXCLUDE the 30000 echo prestation (or return only those <=10000)
r2 = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"prestation": "échographie", "max_prix": 10000}, timeout=20)
data2 = r2.json() if r2.status_code == 200 else []
# Verify all prestations_match are <=10000 if pros are returned
all_ok = True
for p in data2:
    for m in p.get("prestations_match") or []:
        if m.get("prix_fcfa", 0) > 10000:
            all_ok = False
rec("GET /search/pros prestation=écho&max_prix=10000 filtre prix actif", r2.status_code == 200 and all_ok, f"status={r2.status_code} count={len(data2)} all_under_10k={all_ok}")

# Test 1d: cmu_only=true (just need to ensure 200; no specific count constraint since pro may not accept CMU)
r = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"cmu_only": "true"}, timeout=20)
ok = r.status_code == 200
data = r.json() if ok else []
all_cmu = all(p.get("accepte_cmu") is True for p in data)
rec("GET /search/pros?cmu_only=true filtre actif", ok and (len(data) == 0 or all_cmu), f"status={r.status_code} count={len(data)} all_accepte_cmu={all_cmu}")

# Test 1e: q=Dr → recherche libre nom/spécialité
r = requests.get(f"{BASE}/search/pros", headers=H_MAMAN, params={"q": "Dr"}, timeout=20)
data = r.json() if r.status_code == 200 else []
ok = r.status_code == 200 and len(data) >= 1
rec("GET /search/pros?q=Dr ≥1", ok, f"status={r.status_code} count={len(data)}")

# Test 1f: GET /professionnels/{pro_id} valid → 200
r = requests.get(f"{BASE}/professionnels/{pro_id}", headers=H_MAMAN, timeout=20)
ok = r.status_code == 200
body = r.json() if ok else {}
required_keys = {"id", "name", "specialite", "ville", "accepte_cmu"}
missing = required_keys - set(body.keys())
no_pwd = "password_hash" not in body
rec("GET /professionnels/{valid_id} 200 + champs requis", ok and not missing and no_pwd,
    f"status={r.status_code} missing_keys={missing} no_password_hash={no_pwd}")

# Test 1g: inexistant id
r = requests.get(f"{BASE}/professionnels/inexistant-id-zzz", headers=H_MAMAN, timeout=20)
rec("GET /professionnels/inexistant-id → 404", r.status_code == 404, f"status={r.status_code}")

# Test 1h: maman_id (pas un pro) → 404
r = requests.get(f"{BASE}/professionnels/{maman_id}", headers=H_MAMAN, timeout=20)
rec("GET /professionnels/{maman_id} → 404", r.status_code == 404, f"status={r.status_code}")


# =============== SECTION 2 — Mesures bébé ===============
print("\n=== Section 2: Mesures bébé ===\n")

# Get/create enfant
r = requests.get(f"{BASE}/enfants", headers=H_MAMAN, timeout=20)
enfants = r.json() if r.status_code == 200 else []
print(f"   maman a {len(enfants)} enfant(s) existant(s)")

# Create a new enfant for clean testing
new_enfant_payload = {
    "nom": "Bébé Test Mesures",
    "date_naissance": "2026-01-10T00:00:00Z",
    "sexe": "F",
    "poids_kg": 3.2,
    "taille_cm": 50,
}
r = requests.post(f"{BASE}/enfants", headers=H_MAMAN, json=new_enfant_payload, timeout=20)
if r.status_code == 200:
    enfant = r.json()
    enfant_id = enfant["id"]
    rec("POST /enfants → 200", True, f"id={enfant_id[:8]}…")
elif r.status_code == 402:
    # quota — réutiliser un existant
    if enfants:
        enfant_id = enfants[0]["id"]
        rec("POST /enfants → 402 quota, réutilise existant", True, f"id={enfant_id[:8]}…")
    else:
        rec("POST /enfants impossible et aucun existant", False, f"{r.status_code} {r.text[:120]}")
        enfant_id = None
else:
    rec("POST /enfants", False, f"{r.status_code} {r.text[:120]}")
    enfant_id = None

if enfant_id:
    # Snapshot mesures count avant ajouts
    r = requests.get(f"{BASE}/enfants", headers=H_MAMAN, timeout=20)
    e_before = next((e for e in r.json() if e["id"] == enfant_id), {})
    before_count = len(e_before.get("mesures") or [])

    # Ajout mesure 1
    m1 = {"date": "2026-02-10T08:00:00Z", "poids_kg": 7.5, "taille_cm": 68, "perimetre_cranien_cm": 42}
    r = requests.post(f"{BASE}/enfants/{enfant_id}/mesures", headers=H_MAMAN, json=m1, timeout=20)
    rec("POST /enfants/{id}/mesures (m1) 200", r.status_code == 200, f"status={r.status_code}")

    # Ajout mesure 2 (1 mois plus tard)
    m2 = {"date": "2026-03-10T08:00:00Z", "poids_kg": 8.3, "taille_cm": 70.5, "perimetre_cranien_cm": 43}
    r = requests.post(f"{BASE}/enfants/{enfant_id}/mesures", headers=H_MAMAN, json=m2, timeout=20)
    rec("POST /enfants/{id}/mesures (m2) 200", r.status_code == 200, f"status={r.status_code}")

    # Vérifier GET /enfants
    r = requests.get(f"{BASE}/enfants", headers=H_MAMAN, timeout=20)
    enfants_after = r.json()
    e_after = next((e for e in enfants_after if e["id"] == enfant_id), {})
    mesures_after = e_after.get("mesures") or []
    after_count = len(mesures_after)
    has_two_new = after_count >= before_count + 2
    rec("GET /enfants — mesures[] contient les 2 entries ajoutées", has_two_new,
        f"before={before_count} after={after_count}")

    # Vérifier que les champs (date, poids_kg, taille_cm, perimetre_cranien_cm) sont préservés
    last_two = mesures_after[-2:] if len(mesures_after) >= 2 else mesures_after
    fields_ok = True
    for m_in, m_out in zip([m1, m2], last_two):
        for k in ["date", "poids_kg", "taille_cm", "perimetre_cranien_cm"]:
            if m_out.get(k) != m_in.get(k):
                fields_ok = False
    rec("Champs (date, poids, taille, périmètre) préservés", fields_ok,
        f"last_two={last_two}")

    # GET /enfants/{id}/croissance-oms
    r = requests.get(f"{BASE}/enfants/{enfant_id}/croissance-oms", headers=H_MAMAN, timeout=20)
    if r.status_code != 200:
        rec("GET /croissance-oms 200", False, f"status={r.status_code} body={r.text[:120]}")
    else:
        data = r.json()
        points = data.get("points") or []
        # On ne sait pas si l'enfant existait avec d'autres mesures — vérifier au moins 2 points.
        ok = len(points) >= 2
        rec("GET /croissance-oms — points ≥ 2", ok, f"len(points)={len(points)}")
        # Vérifier age_mois calculé + classifications non vides pour les 2 dernières
        last_pts = points[-2:]
        ok2 = all(
            p.get("age_mois") is not None and p.get("age_mois") >= 0
            and p.get("classification_poids") and p.get("classification_taille")
            for p in last_pts
        )
        rec("Points: age_mois calculé + classifications non vides", ok2,
            f"last_pts={[(p.get('age_mois'), p.get('classification_poids'), p.get('classification_taille')) for p in last_pts]}")

    # Sécurité 1 : autre maman essaie POST mesure sur cet enfant
    other_email = "other.maman.test@alomaman.dev"
    other_pwd = "OtherTest1234!"
    other = None
    try:
        other = login(other_email, other_pwd)
    except Exception:
        other = register(other_email, other_pwd, "Autre Maman Test", "maman", phone="+22507030399")
        if other and other.get("token"):
            pass
        else:
            other = None

    if other:
        H_OTHER = auth_headers(other["token"])
        r = requests.post(f"{BASE}/enfants/{enfant_id}/mesures", headers=H_OTHER, json=m1, timeout=20)
        # On accepte 403 ou 404 ; le code actuel utilise update_one qui ne match pas → l'enfant find_one retournera l'enfant DEFAULT (or None)
        # Actually code: update_one + find_one(no user_id filter) → returns the original enfant unmodified. So response is 200 but mesure NOT added.
        # We test: must NOT add a mesure (count unchanged on owner side) AND ideally 403/404.
        added_for_other = r.status_code == 200
        # Re-check count on owner side
        r2 = requests.get(f"{BASE}/enfants", headers=H_MAMAN, timeout=20)
        e_check = next((e for e in r2.json() if e["id"] == enfant_id), {})
        count_after_attempt = len(e_check.get("mesures") or [])
        no_leak = count_after_attempt == after_count
        ok_secure = r.status_code in (403, 404) or (added_for_other and no_leak is True and count_after_attempt == after_count)
        # Strict: spec says expect 403/404
        strict_secure = r.status_code in (403, 404)
        rec("Sécurité: autre maman POST mesure → 403/404 (strict)", strict_secure,
            f"status={r.status_code} no_leak={no_leak} owner_count_after={count_after_attempt}")
    else:
        rec("Sécurité: autre maman setup", False, "Impossible de créer/login l'autre maman")

    # Sécurité 2 : Pro essaie POST mesure → 403 (require_roles maman)
    r = requests.post(f"{BASE}/enfants/{enfant_id}/mesures", headers=H_PRO, json=m1, timeout=20)
    rec("Sécurité: Pro POST mesure → 403", r.status_code == 403, f"status={r.status_code}")

    # Cleanup test enfant
    requests.delete(f"{BASE}/enfants/{enfant_id}", headers=H_MAMAN, timeout=20)


# =============== SECTION 3 — Reminders (rappel patient avec heure) ===============
print("\n=== Section 3: Reminders ===\n")

# Vérifier qu'il existe un RDV maman <-> pro ; sinon créer
r = requests.get(f"{BASE}/rdv", headers=H_PRO, timeout=20)
pro_rdvs = r.json() if r.status_code == 200 else []
existing_with_maman = [x for x in pro_rdvs if x.get("maman_id") == maman_id]

if not existing_with_maman:
    # Créer un RDV en tant que maman
    body = {
        "pro_id": pro_id,
        "date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        "motif": "Test rappel patient",
        "tarif_fcfa": 10000,
    }
    r = requests.post(f"{BASE}/rdv", headers=H_MAMAN, json=body, timeout=20)
    rec("Créer RDV maman→pro pour autoriser rappel", r.status_code == 200, f"status={r.status_code}")

# Test 3a: POST /pro/rappels-patient
due_at = "2026-02-20T14:30:00.000Z"
body = {
    "patient_id": maman_id,
    "title": "Prise médicament",
    "due_at": due_at,
    "notes": "Prendre paracétamol matin",
}
r = requests.post(f"{BASE}/pro/rappels-patient", headers=H_PRO, json=body, timeout=20)
ok = r.status_code == 200
created = r.json() if ok else {}
rec("POST /pro/rappels-patient 200", ok, f"status={r.status_code}")
rec("Rappel due_at préserve l'heure (T14:30)", "T14:30" in (created.get("due_at") or ""),
    f"due_at={created.get('due_at')}")

# Test 3b: GET /pro/rappels-envoyes
r = requests.get(f"{BASE}/pro/rappels-envoyes", headers=H_PRO, timeout=20)
sent_list = r.json() if r.status_code == 200 else []
match = next((x for x in sent_list if x.get("title") == "Prise médicament" and x.get("user_id") == maman_id), None)
ok = bool(match) and "T14:30" in (match.get("due_at") or "")
rec("GET /pro/rappels-envoyes — heure préservée (T14:30)", ok,
    f"found={bool(match)} due_at={match.get('due_at') if match else None}")

# Test 3c: maman GET /reminders → le rappel apparaît avec due_at exact
r = requests.get(f"{BASE}/reminders", headers=H_MAMAN, timeout=20)
maman_rems = r.json() if r.status_code == 200 else []
match_m = next((x for x in maman_rems if x.get("title") == "Prise médicament" and (x.get("due_at") or "").startswith("2026-02-20T14:30")), None)
rec("GET /reminders (maman) — rappel avec heure exacte", bool(match_m),
    f"found={bool(match_m)} due_at={match_m.get('due_at') if match_m else None}")

# Test 3d: Sécurité — Pro essaie avec patient_id sans RDV avec lui
# Use another fresh maman without RDV with this pro
isolated_email = f"isolated_{int(datetime.now().timestamp())}@alomaman.dev"
iso = register(isolated_email, "Test1234!", "Maman Isolée", "maman", phone=f"+225070000{int(datetime.now().timestamp()) % 10000:04d}")
if iso and iso.get("user", {}).get("id"):
    iso_id = iso["user"]["id"]
    body = {
        "patient_id": iso_id,
        "title": "Spam test",
        "due_at": "2026-03-01T10:00:00Z",
        "notes": "ne devrait pas être créé",
    }
    r = requests.post(f"{BASE}/pro/rappels-patient", headers=H_PRO, json=body, timeout=20)
    rec("Sécurité: Pro POST rappel pour maman sans RDV → 403", r.status_code == 403,
        f"status={r.status_code}")
    # Cleanup: delete the isolated maman account
    try:
        requests.delete(f"{BASE}/auth/me",
                        headers=auth_headers(iso["token"]),
                        json={"password": "Test1234!", "confirmation": "SUPPRIMER"},
                        timeout=20)
    except Exception:
        pass
else:
    rec("Sécurité: setup maman isolée", False, "register failed")

# =============== Summary ===============
print("\n=== SUMMARY ===")
total = len(results)
passed = sum(1 for ok, _, _ in results if ok)
print(f"Passed: {passed}/{total}, Failed: {fail_count}")
if fail_count:
    print("\nFailures:")
    for ok, name, det in results:
        if not ok:
            print(f"  - {name} :: {det}")
sys.exit(0 if fail_count == 0 else 1)
