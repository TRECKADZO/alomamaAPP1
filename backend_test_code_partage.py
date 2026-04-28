"""
Backend test for Code-partage medical record sharing flow (CMU + AM provisional code).
Tests the new endpoints:
  - GET /auth/me/code-partage
  - GET /enfants/{eid}/code-partage
  - POST /pro/patient/recherche
  - GET /partage/demandes-recues
  - POST /partage/demande/{id}/valider
  - POST /partage/demande/{id}/refuser
  - GET /pro/demandes/mes-demandes
  - GET /pro/patient/{patient_id}/carnet  (with X-Access-Token)
"""
import os
import re
import sys
import time
import random
import requests
from pathlib import Path

# Read backend URL from frontend .env
FRONTEND_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"') + "/api"
        break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not found"
print(f"🔗 BASE_URL = {BASE_URL}\n")

# ---------- helpers ----------
PASSED = 0
FAILED = 0
FAILURES = []


def check(name, cond, detail=""):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  ✅ {name}")
    else:
        FAILED += 1
        FAILURES.append(f"{name} :: {detail}")
        print(f"  ❌ {name} :: {detail}")


def req(method, path, token=None, extra_headers=None, **kwargs):
    url = f"{BASE_URL}{path}"
    headers = kwargs.pop("headers", {}) or {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    return requests.request(method, url, headers=headers, timeout=30, **kwargs)


AM_RE = re.compile(r"^AM-[A-Z2-9]{4}-[A-Z2-9]{2}$")
FORBIDDEN_CHARS = set("01ILO")


def gen_phone():
    # CI phone: +22507 + 8 digits
    return "+22507" + "".join(str(random.randint(0, 9)) for _ in range(8))


# ---------- SETUP ----------
print("=" * 70)
print("SETUP — Register maman + pro")
print("=" * 70)

maman_phone = gen_phone()
pro_phone = gen_phone()
maman_password = "MamanTest123!"
pro_password = "ProTest123!"

r = req("POST", "/auth/register", json={
    "name": "Aminata Kone",
    "phone": maman_phone,
    "password": maman_password,
    "role": "maman",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
})
check("Register maman → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
assert r.status_code == 200
maman_data = r.json()
maman_token = maman_data["token"]
maman_id = maman_data["user"]["id"]
print(f"  → maman_id={maman_id}, phone={maman_phone}")

r = req("POST", "/auth/register", json={
    "name": "Dr Jean",
    "phone": pro_phone,
    "password": pro_password,
    "role": "professionnel",
    "specialite": "pédiatre",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
})
check("Register pro → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
assert r.status_code == 200
pro_data = r.json()
pro_token = pro_data["token"]
pro_id = pro_data["user"]["id"]
print(f"  → pro_id={pro_id}, phone={pro_phone}")


# ---------- TEST 1 ----------
print("\n" + "=" * 70)
print("TEST 1 — GET /auth/me/code-partage")
print("=" * 70)

r = req("GET", "/auth/me/code-partage", token=maman_token)
check("T1.1 Maman: GET /auth/me/code-partage → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
check("T1.2 Response has key 'cmu'", "cmu" in body)
check("T1.3 Response has key 'code_provisoire'", "code_provisoire" in body)
check("T1.4 Response has key 'preferred'", "preferred" in body)
check("T1.5 cmu is null (not set yet)", body.get("cmu") is None, f"cmu={body.get('cmu')}")
code_m_1 = body.get("code_provisoire", "")
check("T1.6 code_provisoire matches AM-XXXX-XX format",
      bool(AM_RE.match(code_m_1)), f"code={code_m_1}")
check("T1.7 code_provisoire has no forbidden chars (0,1,I,L,O)",
      not any(c in FORBIDDEN_CHARS for c in code_m_1.replace("AM-", "").replace("-", "")),
      f"code={code_m_1}")
check("T1.8 preferred == code_provisoire when no CMU",
      body.get("preferred") == code_m_1, f"preferred={body.get('preferred')} code={code_m_1}")

# Second call should return same code
r = req("GET", "/auth/me/code-partage", token=maman_token)
body2 = r.json() if r.status_code == 200 else {}
check("T1.9 Second call returns SAME code (persistence)",
      body2.get("code_provisoire") == code_m_1,
      f"call1={code_m_1} call2={body2.get('code_provisoire')}")

# Pro should be 403
r = req("GET", "/auth/me/code-partage", token=pro_token)
check("T1.10 As pro → 403", r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")


# ---------- TEST 2 ----------
print("\n" + "=" * 70)
print("TEST 2 — POST /enfants + GET /enfants/{eid}/code-partage")
print("=" * 70)

r = req("POST", "/enfants", token=maman_token, json={
    "nom": "Bébé Kone",
    "date_naissance": "2024-01-01",
    "sexe": "F",
})
check("T2.1 Create enfant → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
assert r.status_code == 200
enfant_id = r.json()["id"]
print(f"  → enfant_id={enfant_id}")

r = req("GET", f"/enfants/{enfant_id}/code-partage", token=maman_token)
check("T2.2 GET /enfants/{eid}/code-partage → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
check("T2.3 Response has 'cmu' key", "cmu" in body)
check("T2.4 Response has 'code_provisoire' key", "code_provisoire" in body)
check("T2.5 Response has 'preferred' key", "preferred" in body)
check("T2.6 cmu is null for new enfant", body.get("cmu") is None, f"cmu={body.get('cmu')}")
code_e_1 = body.get("code_provisoire", "")
check("T2.7 enfant code_provisoire matches AM-XXXX-XX",
      bool(AM_RE.match(code_e_1)), f"code={code_e_1}")
check("T2.8 enfant code starts with AM-",
      code_e_1.startswith("AM-"), f"code={code_e_1}")
check("T2.9 preferred == code_provisoire when no CMU on enfant",
      body.get("preferred") == code_e_1)

# Second call → same code
r = req("GET", f"/enfants/{enfant_id}/code-partage", token=maman_token)
body_again = r.json() if r.status_code == 200 else {}
check("T2.10 Second call returns same enfant code",
      body_again.get("code_provisoire") == code_e_1)

# Verify maman and enfant codes are DIFFERENT
check("T2.11 Maman code ≠ enfant code",
      code_m_1 != code_e_1, f"maman={code_m_1} enfant={code_e_1}")


# ---------- TEST 3 ----------
print("\n" + "=" * 70)
print("TEST 3 — Flow de partage (pro recherche)")
print("=" * 70)

# Search by maman's AM code
r = req("POST", "/pro/patient/recherche", token=pro_token, json={
    "identifier": code_m_1,
    "motif": "Consultation 3e trimestre",
})
check("T3.1 Recherche par maman AM code → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
demande_id_maman = body.get("demande_id")
check("T3.2 Response has demande_id", bool(demande_id_maman))
check("T3.3 patient_nom is Aminata Kone",
      body.get("patient_nom") == "Aminata Kone", f"got={body.get('patient_nom')}")
check("T3.4 patient_type == 'maman'",
      body.get("patient_type") == "maman", f"got={body.get('patient_type')}")
check("T3.5 status == 'pending'",
      body.get("status") == "pending", f"got={body.get('status')}")
check("T3.6 Response has message key", "message" in body)

# Search by enfant's AM code
r = req("POST", "/pro/patient/recherche", token=pro_token, json={
    "identifier": code_e_1,
    "motif": "Suivi bébé",
})
check("T3.7 Recherche par enfant AM code → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
demande_id_enfant = body.get("demande_id")
check("T3.8 Response has demande_id", bool(demande_id_enfant))
check("T3.9 patient_nom == 'Bébé Kone'",
      body.get("patient_nom") == "Bébé Kone", f"got={body.get('patient_nom')}")
check("T3.10 patient_type == 'enfant'",
      body.get("patient_type") == "enfant", f"got={body.get('patient_type')}")
check("T3.11 status == 'pending'", body.get("status") == "pending")

# Invalid identifier
r = req("POST", "/pro/patient/recherche", token=pro_token, json={
    "identifier": "AM-FAKE-00",
    "motif": "test",
})
check("T3.12 Recherche invalide 'AM-FAKE-00' → 404",
      r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")


# ---------- TEST 4 ----------
print("\n" + "=" * 70)
print("TEST 4 — Maman voit et valide/refuse")
print("=" * 70)

r = req("GET", "/partage/demandes-recues", token=maman_token)
check("T4.1 GET /partage/demandes-recues → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
demandes = r.json() if r.status_code == 200 else []
check("T4.2 Response is array",
      isinstance(demandes, list), f"type={type(demandes)}")
check("T4.3 Demandes contain at least 2 pending",
      sum(1 for d in demandes if d.get("status") == "pending") >= 2,
      f"count_pending={sum(1 for d in demandes if d.get('status') == 'pending')}")
ids_found = {d.get("id") for d in demandes}
check("T4.4 Demande maman is present",
      demande_id_maman in ids_found)
check("T4.5 Demande enfant is present",
      demande_id_enfant in ids_found)

# Valider maman's demande
r = req("POST", f"/partage/demande/{demande_id_maman}/valider", token=maman_token)
check("T4.6 Valider demande maman → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
check("T4.7 status=='validated'",
      body.get("status") == "validated", f"got={body.get('status')}")
check("T4.8 has expires_at", bool(body.get("expires_at")))
check("T4.9 has message", bool(body.get("message")))

# Refuser enfant's demande
r = req("POST", f"/partage/demande/{demande_id_enfant}/refuser", token=maman_token)
check("T4.10 Refuser demande enfant → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
print(f"  body={body}")
check("T4.11 status=='refused'",
      body.get("status") == "refused", f"got={body.get('status')}")


# ---------- TEST 5 ----------
print("\n" + "=" * 70)
print("TEST 5 — Pro accède au dossier")
print("=" * 70)

r = req("GET", "/pro/demandes/mes-demandes", token=pro_token)
check("T5.1 GET /pro/demandes/mes-demandes → 200",
      r.status_code == 200, f"status={r.status_code}")
pro_demandes = r.json() if r.status_code == 200 else []
check("T5.2 Response is array",
      isinstance(pro_demandes, list))
# find validated one (maman)
validated = [d for d in pro_demandes if d.get("id") == demande_id_maman]
check("T5.3 Maman demande present in pro list",
      len(validated) == 1)
valid_token_maman = validated[0].get("access_token") if validated else None
check("T5.4 Validated demande has access_token",
      bool(valid_token_maman), f"token={valid_token_maman}")
check("T5.5 Validated demande status=='validated'",
      validated[0].get("status") == "validated" if validated else False)

refused = [d for d in pro_demandes if d.get("id") == demande_id_enfant]
check("T5.6 Enfant demande present in pro list (refused)",
      len(refused) == 1)
check("T5.7 Refused demande status=='refused'",
      refused[0].get("status") == "refused" if refused else False)
check("T5.8 Refused demande has NO access_token",
      refused[0].get("access_token") is None if refused else False)

# Access maman's carnet WITH valid token
r = req("GET", f"/pro/patient/{maman_id}/carnet",
        token=pro_token,
        extra_headers={"X-Access-Token": valid_token_maman})
check("T5.9 GET /pro/patient/{maman_id}/carnet with valid token → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
check("T5.10 type == 'maman'", body.get("type") == "maman", f"got={body.get('type')}")
check("T5.11 has 'maman' object", bool(body.get("maman")))
check("T5.12 has 'enfants' array",
      isinstance(body.get("enfants"), list))
check("T5.13 has 'access_expires_at'", bool(body.get("access_expires_at")))

# Access WITHOUT token
r = req("GET", f"/pro/patient/{maman_id}/carnet", token=pro_token)
check("T5.14 GET /pro/patient/{maman_id}/carnet without token → 403",
      r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")

# Access WITH wrong token
r = req("GET", f"/pro/patient/{maman_id}/carnet",
        token=pro_token,
        extra_headers={"X-Access-Token": "this-is-a-fake-token-xxxxx"})
check("T5.15 GET /pro/patient/{maman_id}/carnet with WRONG token → 403",
      r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")

# Access enfant's carnet (refused demande → no valid token)
r = req("GET", f"/pro/patient/{enfant_id}/carnet",
        token=pro_token,
        extra_headers={"X-Access-Token": "refused-no-token-xxxx"})
check("T5.16 GET /pro/patient/{enfant_id}/carnet with fake/refused token → 403",
      r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")


# ---------- TEST 6 ----------
print("\n" + "=" * 70)
print("TEST 6 — Format strict AM codes")
print("=" * 70)

for code, label in [(code_m_1, "maman"), (code_e_1, "enfant")]:
    check(f"T6 — {label} code '{code}' matches ^AM-[A-Z2-9]{{4}}-[A-Z2-9]{{2}}$",
          bool(AM_RE.match(code)), f"code={code}")
    check(f"T6 — {label} code has NO forbidden chars (0,1,I,L,O)",
          not any(c in FORBIDDEN_CHARS for c in code),
          f"code={code}")


# ---------- TEST 7 ----------
print("\n" + "=" * 70)
print("TEST 7 — Unicité CMU chiffré (lookup by encrypted CMU)")
print("=" * 70)

# Set CMU on maman (12 digits as per review spec)
cmu_numero = "225000000001"
r = req("POST", "/cmu/me", token=maman_token, json={
    "numero": cmu_numero,
    "nom_complet": "Aminata Kone",
    "date_validite": "2099-01-15",
    "beneficiaires": [],
})
check("T7.1 POST /cmu/me (12 digits) → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")

# Pro search by CMU number
r = req("POST", "/pro/patient/recherche", token=pro_token, json={
    "identifier": cmu_numero,
    "motif": "Test CMU lookup",
})
print(f"  POST /pro/patient/recherche identifier={cmu_numero} → status={r.status_code} body={r.text[:300]}")
check("T7.2 Recherche par CMU (chiffré en DB) → 200",
      r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
body = r.json() if r.status_code == 200 else {}
check("T7.3 patient_type == 'maman' via CMU lookup",
      body.get("patient_type") == "maman", f"got={body.get('patient_type')}")
check("T7.4 patient_nom matches maman name",
      body.get("patient_nom") == "Aminata Kone", f"got={body.get('patient_nom')}")


# ---------- CLEANUP ----------
print("\n" + "=" * 70)
print("CLEANUP — Delete both accounts")
print("=" * 70)

r = req("DELETE", "/auth/me", token=maman_token, json={
    "password": maman_password,
    "confirmation": "SUPPRIMER",
})
check("CLEANUP.1 DELETE maman → 200", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")

r = req("DELETE", "/auth/me", token=pro_token, json={
    "password": pro_password,
    "confirmation": "SUPPRIMER",
})
check("CLEANUP.2 DELETE pro → 200", r.status_code == 200,
      f"status={r.status_code} body={r.text[:200]}")


# ---------- SUMMARY ----------
print("\n" + "=" * 70)
print(f"RESULTS: {PASSED} passed, {FAILED} failed (total {PASSED + FAILED})")
print("=" * 70)
if FAILURES:
    print("\nFAILURES:")
    for f in FAILURES:
        print(f"  ✗ {f}")
sys.exit(0 if FAILED == 0 else 1)
