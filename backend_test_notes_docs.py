"""
Backend tests for À lo Maman — Bug fix session:
  TASK 1: Notes médicales Pro pour ENFANT (chiffrement AES-256)
  TASK 2: Upload de document dans le carnet enfant
  REGRESSION: maman login, pro login, /professionnels, /pro/patients
"""
import os
import sys
import json
import time
import base64
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PW = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PW = "Test1234!"

results = []
def log(name, ok, details=""):
    tag = "✅" if ok else "❌"
    print(f"{tag} {name}" + (f" — {details}" if details else ""))
    results.append((name, ok, details))

def req(method, path, token=None, json_body=None, params=None, expect_ok=True):
    url = BASE + path
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.request(method, url, headers=headers, json=json_body, params=params, timeout=40)
    return r


# -----------------------------------------------------------------------------
# 1. LOGIN
# -----------------------------------------------------------------------------
print("\n=== SETUP — Logins ===")
r = req("POST", "/auth/login", json_body={"email": MAMAN_EMAIL, "password": MAMAN_PW})
log("Login maman", r.status_code == 200, f"{r.status_code}")
if r.status_code != 200:
    print(r.text); sys.exit(1)
mm = r.json()
maman_token = mm["token"]
maman_id = mm["user"]["id"]

r = req("POST", "/auth/login", json_body={"email": PRO_EMAIL, "password": PRO_PW})
log("Login pro", r.status_code == 200, f"{r.status_code}")
if r.status_code != 200:
    print(r.text); sys.exit(1)
pp = r.json()
pro_token = pp["token"]
pro_id = pp["user"]["id"]

print(f"    maman_id={maman_id}")
print(f"    pro_id={pro_id}")

# -----------------------------------------------------------------------------
# 2. ENSURE AT LEAST 1 ENFANT
# -----------------------------------------------------------------------------
print("\n=== SETUP — Enfant ===")
r = req("GET", "/enfants", token=maman_token)
log("GET /enfants", r.status_code == 200, f"{r.status_code}")
enfants = r.json() if r.status_code == 200 else []
if not enfants:
    r = req("POST", "/enfants", token=maman_token, json_body={
        "nom": "Bébé Test",
        "date_naissance": "2025-01-15",
        "sexe": "M",
    })
    log("POST /enfants (create Bébé Test)", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    enfant = r.json()
else:
    enfant = enfants[0]
    log("Reuse existing enfant", True, f"id={enfant['id']} nom={enfant.get('nom')}")
enfant_id = enfant["id"]
print(f"    enfant_id={enfant_id} nom={enfant.get('nom')}")

# -----------------------------------------------------------------------------
# 3. ENSURE A RDV BETWEEN THIS PRO & MAMAN
# -----------------------------------------------------------------------------
print("\n=== SETUP — RDV ===")
r = req("GET", "/rdv", token=maman_token)
log("GET /rdv (maman)", r.status_code == 200, f"{r.status_code}")
rdvs = r.json() if r.status_code == 200 else []
# Filter for a RDV with this specific pro
matching = [x for x in rdvs if x.get("pro_id") == pro_id]
if not matching:
    # create one
    from datetime import datetime, timezone, timedelta
    future = (datetime.now(timezone.utc) + timedelta(days=3)).replace(microsecond=0).isoformat()
    body = {
        "pro_id": pro_id,
        "date": future,
        "motif": "test consultation notes/docs",
    }
    r = req("POST", "/rdv", token=maman_token, json_body=body)
    log("POST /rdv (create new one)", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        sys.exit(1)
    rdv = r.json()
else:
    rdv = matching[0]
    log("Reuse existing RDV with pro", True, f"rdv_id={rdv['id']} status={rdv.get('status')}")
rdv_id = rdv["id"]
print(f"    rdv_id={rdv_id}")


# -----------------------------------------------------------------------------
# 4. TASK 1 — Notes médicales Pro pour ENFANT
# -----------------------------------------------------------------------------
print("\n=== TASK 1 — Consultation notes for ENFANT ===")

# (c) Pro creates a note for the enfant
note_body = {
    "patient_id": enfant_id,
    "diagnostic": "Bronchiolite légère",
    "traitement": "Sérum + paracétamol",
    "notes": "Surveiller fièvre 48h",
}
r = req("POST", "/pro/consultation-notes", token=pro_token, json_body=note_body)
ok = r.status_code == 200
log("1c. POST /pro/consultation-notes (patient=enfant)", ok, f"{r.status_code} {r.text[:300] if not ok else ''}")
if not ok:
    print("FAIL — cannot proceed with TASK 1 tests")
else:
    note = r.json()
    # Validate response shape: decrypted fields, patient_type, maman_id
    checks = [
        ("note.id present", bool(note.get("id"))),
        ("patient_type=='enfant'", note.get("patient_type") == "enfant"),
        ("maman_id==maman_id", note.get("maman_id") == maman_id),
        ("patient_id==enfant_id", note.get("patient_id") == enfant_id),
        ("diagnostic decrypted (plaintext)", note.get("diagnostic") == "Bronchiolite légère"),
        ("traitement decrypted", note.get("traitement") == "Sérum + paracétamol"),
        ("notes decrypted", note.get("notes") == "Surveiller fièvre 48h"),
        ("not encrypted prefix", not (isinstance(note.get("diagnostic"), str) and note["diagnostic"].startswith("enc"))),
    ]
    for n, ok2 in checks:
        log(f"1c.{n}", ok2)
    note_id = note["id"]

# (d) Pro tries to create a note for a non-existent patient_id → 403
bogus = {
    "patient_id": "non-existent-uuid-xyz",
    "diagnostic": "X",
    "traitement": "Y",
    "notes": "Z",
}
r = req("POST", "/pro/consultation-notes", token=pro_token, json_body=bogus)
ok = r.status_code == 403 and "RDV" in (r.json().get("detail", "") if r.status_code == 403 else "")
log("1d. POST /pro/consultation-notes bogus patient → 403 aucun RDV", ok, f"{r.status_code} detail={r.text[:200]}")

# (e) Pro GET notes for the enfant → filtered by pro_id (should see HIS note)
r = req("GET", f"/enfants/{enfant_id}/consultation-notes", token=pro_token)
ok = r.status_code == 200
log("1e. GET /enfants/{eid}/consultation-notes (as Pro)", ok, f"{r.status_code}")
if ok:
    notes_pro = r.json()
    has_my_note = any(n.get("id") == note_id for n in notes_pro) if 'note_id' in dir() else False
    # All notes must belong to this pro_id
    all_mine = all(n.get("pro_id") == pro_id for n in notes_pro)
    log("1e. Pro sees his note in list", has_my_note, f"count={len(notes_pro)}")
    log("1e. All returned notes have pro_id==this pro", all_mine)
    # Verify decrypted
    if notes_pro:
        n0 = next((n for n in notes_pro if n.get("id") == note_id), notes_pro[0])
        log("1e. diagnostic decrypted in list", n0.get("diagnostic") == "Bronchiolite légère")

# (f) Maman GET notes for her enfant → must return same note, decrypted
r = req("GET", f"/enfants/{enfant_id}/consultation-notes", token=maman_token)
ok = r.status_code == 200
log("1f. GET /enfants/{eid}/consultation-notes (as Maman)", ok, f"{r.status_code}")
if ok:
    notes_maman = r.json()
    has_my_note = any(n.get("id") == note_id for n in notes_maman) if 'note_id' in dir() else False
    log("1f. Maman sees the pro note", has_my_note, f"count={len(notes_maman)}")
    if notes_maman:
        n0 = next((n for n in notes_maman if n.get("id") == note_id), notes_maman[0])
        log("1f. diagnostic plaintext", n0.get("diagnostic") == "Bronchiolite légère")
        log("1f. traitement plaintext", n0.get("traitement") == "Sérum + paracétamol")
        log("1f. notes plaintext", n0.get("notes") == "Surveiller fièvre 48h")
        # must NOT start with "enc::" or "enc_v1:"
        val = str(n0.get("diagnostic") or "")
        log("1f. not starting with enc::/enc_v1:", not (val.startswith("enc::") or val.startswith("enc_v1:")))


# -----------------------------------------------------------------------------
# 5. TASK 2 — Enfant documents (PDF)
# -----------------------------------------------------------------------------
print("\n=== TASK 2 — Enfant documents ===")

# Fake small PDF base64 data URI
fake_pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
fake_b64 = base64.b64encode(fake_pdf_bytes).decode()
data_uri = f"data:application/pdf;base64,{fake_b64}"

# (b) POST document
body = {
    "nom": "Echographie test",
    "type": "echo",
    "description": "Test upload",
    "file_base64": data_uri,
}
r = req("POST", f"/enfants/{enfant_id}/documents", token=maman_token, json_body=body)
ok = r.status_code == 200
log("2b. POST /enfants/{eid}/documents", ok, f"{r.status_code} {r.text[:200] if not ok else ''}")
if ok:
    d = r.json()
    log("2b. response.id present", bool(d.get("id")))
    log("2b. response.nom=='Echographie test'", d.get("nom") == "Echographie test")
    log("2b. response.type=='echo'", d.get("type") == "echo")
    log("2b. response.size_kb present", isinstance(d.get("size_kb"), int))
    log("2b. response.created_at present", bool(d.get("created_at")))
    log("2b. NO file_base64 in response", "file_base64" not in d)
    doc_id = d["id"]

# (c) GET list
r = req("GET", f"/enfants/{enfant_id}/documents", token=maman_token)
ok = r.status_code == 200
log("2c. GET /enfants/{eid}/documents (list)", ok, f"{r.status_code}")
if ok:
    docs = r.json()
    log("2c. list contains new doc", any(x.get("id") == doc_id for x in docs), f"count={len(docs)}")
    log("2c. no file_base64 in any list item", all("file_base64" not in x for x in docs))

# (d) GET single
r = req("GET", f"/enfants/{enfant_id}/documents/{doc_id}", token=maman_token)
ok = r.status_code == 200
log("2d. GET /enfants/{eid}/documents/{id} (full)", ok, f"{r.status_code}")
if ok:
    full = r.json()
    log("2d. file_base64 present in detail", bool(full.get("file_base64")))
    log("2d. file_base64 matches upload", full.get("file_base64") == data_uri)

# (e) Auth guard: list without Bearer → 401
r = requests.get(BASE + f"/enfants/{enfant_id}/documents", timeout=30)
ok = r.status_code in (401, 403)
log("2e. GET /enfants/{eid}/documents WITHOUT Bearer → 401/403", ok, f"{r.status_code}")

# (f) GDPR: Pro tries to access enfant documents → 403
r = req("GET", f"/enfants/{enfant_id}/documents", token=pro_token)
ok = r.status_code == 403
log("2f. GET /enfants/{eid}/documents as Pro → 403", ok, f"{r.status_code} {r.text[:150]}")

# (g) DELETE
r = req("DELETE", f"/enfants/{enfant_id}/documents/{doc_id}", token=maman_token)
ok = r.status_code == 200
log("2g. DELETE document (maman)", ok, f"{r.status_code}")
if ok:
    r = req("GET", f"/enfants/{enfant_id}/documents", token=maman_token)
    ok2 = r.status_code == 200 and all(x.get("id") != doc_id for x in r.json())
    log("2g. list no longer contains deleted doc", ok2)


# -----------------------------------------------------------------------------
# 6. REGRESSION
# -----------------------------------------------------------------------------
print("\n=== REGRESSION ===")

r = req("POST", "/auth/login", json_body={"email": MAMAN_EMAIL, "password": MAMAN_PW})
log("Regression: maman login", r.status_code == 200, f"{r.status_code}")

r = req("POST", "/auth/login", json_body={"email": PRO_EMAIL, "password": PRO_PW})
log("Regression: pro login", r.status_code == 200, f"{r.status_code}")

r = req("GET", "/professionnels", token=maman_token)
log("Regression: GET /professionnels", r.status_code == 200, f"{r.status_code} count={len(r.json()) if r.status_code==200 else '-'}")

r = req("GET", "/pro/patients", token=pro_token)
log("Regression: GET /pro/patients (as Pro)", r.status_code == 200, f"{r.status_code} count={len(r.json()) if r.status_code==200 else '-'}")


# -----------------------------------------------------------------------------
# 7. Cleanup consultation note created for the enfant
# -----------------------------------------------------------------------------
print("\n=== CLEANUP ===")
try:
    if 'note_id' in dir():
        r = req("DELETE", f"/pro/consultation-notes/{note_id}", token=pro_token)
        log("Cleanup: delete consultation_note", r.status_code == 200, f"{r.status_code}")
except Exception as e:
    print(f"cleanup error: {e}")


# -----------------------------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------------------------
print("\n" + "=" * 70)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"SUMMARY: {passed}/{total} passed")
fails = [(n, d) for (n, ok, d) in results if not ok]
if fails:
    print("\nFailures:")
    for n, d in fails:
        print(f"  ❌ {n} — {d}")
sys.exit(0 if passed == total else 1)
