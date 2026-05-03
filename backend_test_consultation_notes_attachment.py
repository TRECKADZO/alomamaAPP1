"""
Backend test — Pro → Maman consultation notes WITH attachment (PDF + IMAGE)
Endpoints: POST/GET /api/pro/consultation-notes, GET /api/enfants/{eid}/notes
"""
import os
import sys
import time
import asyncio
import requests
from typing import Optional

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"

PDF_DATA_URI = "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago="
JPEG_DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="

results = []


def log(ok, msg, extra=None):
    icon = "✅" if ok else "❌"
    print(f"{icon} {msg}")
    if extra:
        print(f"   {extra}")
    results.append((ok, msg))


def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    r.raise_for_status()
    j = r.json()
    return j["token"], j["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("=" * 70)
    print("PRO→MAMAN CONSULTATION NOTES WITH ATTACHMENT TEST")
    print("=" * 70)

    # === STEP 1: Login both ===
    try:
        maman_tok, maman = login(MAMAN_EMAIL, MAMAN_PWD)
        log(True, f"Login maman OK — id={maman['id']}, name={maman.get('name')}")
    except Exception as e:
        log(False, f"Login maman FAILED: {e}")
        return

    try:
        pro_tok, pro = login(PRO_EMAIL, PRO_PWD)
        log(True, f"Login pro OK — id={pro['id']}, name={pro.get('name')}")
    except Exception as e:
        log(False, f"Login pro FAILED: {e}")
        return

    # === STEP 1a: GET /enfants → create one if none ===
    r = requests.get(f"{BASE}/enfants", headers=H(maman_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"GET /enfants failed: {r.status_code} {r.text[:200]}")
        return
    enfants = r.json()
    log(True, f"GET /enfants → {len(enfants)} enfant(s)")
    if not enfants:
        body = {"nom": "Bébé Test", "date_naissance": "2025-01-15", "sexe": "M"}
        r = requests.post(f"{BASE}/enfants", json=body, headers=H(maman_tok), timeout=30)
        if r.status_code != 200:
            log(False, f"POST /enfants failed: {r.status_code} {r.text[:200]}")
            return
        enfant = r.json()
        log(True, f"POST /enfants → created enfant_id={enfant['id']}")
    else:
        enfant = enfants[0]
        log(True, f"Using existing enfant_id={enfant['id']} (nom={enfant.get('nom')})")
    enfant_id = enfant["id"]

    # === STEP 1b: ensure at least 1 RDV between this pro and maman ===
    # Check existing RDV first
    r = requests.get(f"{BASE}/rdv", headers=H(maman_tok), timeout=30)
    rdvs = r.json() if r.status_code == 200 else []
    matching = [x for x in rdvs if x.get("pro_id") == pro["id"]]
    if matching:
        rdv = matching[0]
        log(True, f"Already has RDV with target pro — rdv_id={rdv['id']} status={rdv.get('status')}")
    else:
        body = {
            "pro_id": pro["id"],
            "date": "2026-08-20T10:00",
            "motif": "Setup test consultation note",
            "type_consultation": "pediatrie",
            "mode": "presentiel",
        }
        r = requests.post(f"{BASE}/rdv", json=body, headers=H(maman_tok), timeout=30)
        if r.status_code != 200:
            log(False, f"POST /rdv failed: {r.status_code} {r.text[:300]}")
            return
        rdv = r.json()
        log(True, f"Created RDV id={rdv['id']}")
        # Confirm as Pro
        r = requests.patch(
            f"{BASE}/rdv/{rdv['id']}/status",
            params={"status_val": "confirme"},
            headers=H(pro_tok),
            timeout=30,
        )
        if r.status_code == 200:
            log(True, "RDV confirmed by Pro")
        else:
            log(False, f"RDV confirm by Pro failed: {r.status_code} {r.text[:200]}")

    # === Count notifications BEFORE creating notes ===
    r = requests.get(f"{BASE}/notifications", headers=H(maman_tok), timeout=30)
    notifs_before = r.json() if r.status_code == 200 else []
    notifs_before_consult = [n for n in notifs_before if n.get("type") == "consultation_note"]
    log(True, f"Notifications maman BEFORE: total={len(notifs_before)}, consultation_note={len(notifs_before_consult)}")

    note_ids = []  # for cleanup

    # === STEP 2: POST /pro/consultation-notes WITH PDF ===
    print("\n--- STEP 2: POST consultation-notes with PDF attachment ---")
    payload = {
        "patient_id": enfant_id,
        "diagnostic": "Rhume léger",
        "traitement": "Paracétamol 60 mg/kg/j",
        "notes": "Revoir si fièvre > 48h",
        "attachment_base64": PDF_DATA_URI,
        "attachment_name": "ordonnance.pdf",
        "attachment_mime": "application/pdf",
    }
    r = requests.post(f"{BASE}/pro/consultation-notes", json=payload, headers=H(pro_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"POST /pro/consultation-notes (PDF) failed: {r.status_code} {r.text[:500]}")
        return
    note_pdf = r.json()
    note_ids.append(note_pdf["id"])
    print(f"   Response keys: {sorted(note_pdf.keys())}")

    # Verify required fields
    required = ["id", "pro_name", "patient_id", "patient_type", "enfant_id", "maman_id",
                "diagnostic", "traitement", "notes", "attachment_base64", "attachment_name",
                "attachment_mime", "created_at"]
    missing = [f for f in required if f not in note_pdf]
    log(not missing, f"All required fields present: {required}", f"missing={missing}" if missing else None)

    # patient_type should be 'enfant'
    log(note_pdf.get("patient_type") == "enfant", f"patient_type='enfant' (got '{note_pdf.get('patient_type')}')")
    log(note_pdf.get("enfant_id") == enfant_id, f"enfant_id matches ({note_pdf.get('enfant_id')})")
    log(note_pdf.get("maman_id") == maman["id"], f"maman_id matches ({note_pdf.get('maman_id')})")
    log(note_pdf.get("pro_name") == pro.get("name"), f"pro_name='{note_pdf.get('pro_name')}'")

    # Verify clear text — must NOT start with enc_v1: or enc::
    def is_encrypted(v):
        if not v:
            return False
        return v.startswith("enc_v1:") or v.startswith("enc::")

    for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
        v = note_pdf.get(f)
        log(not is_encrypted(v), f"Field '{f}' is in CLEAR text (not encrypted)",
            f"value preview={str(v)[:60]}..." if v else "value is None/empty")

    log(note_pdf.get("diagnostic") == "Rhume léger", "diagnostic exact match")
    log(note_pdf.get("traitement") == "Paracétamol 60 mg/kg/j", "traitement exact match")
    log(note_pdf.get("notes") == "Revoir si fièvre > 48h", "notes exact match")
    log(note_pdf.get("attachment_base64") == PDF_DATA_URI,
        f"attachment_base64 exact match (data URI complet)",
        f"got={str(note_pdf.get('attachment_base64'))[:60]}")
    log(note_pdf.get("attachment_name") == "ordonnance.pdf", "attachment_name correct")
    log(note_pdf.get("attachment_mime") == "application/pdf", "attachment_mime correct")

    # === STEP 3: GET /enfants/{eid}/notes as MAMAN ===
    print("\n--- STEP 3: GET /enfants/{eid}/notes as MAMAN ---")
    r = requests.get(f"{BASE}/enfants/{enfant_id}/notes", headers=H(maman_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"GET /enfants/{{eid}}/notes (maman) failed: {r.status_code} {r.text[:300]}")
    else:
        notes_maman = r.json()
        log(True, f"GET /enfants/{{eid}}/notes (maman) → {len(notes_maman)} note(s)")
        target = next((n for n in notes_maman if n.get("id") == note_pdf["id"]), None)
        log(target is not None, "Created PDF note appears in MAMAN's list")
        if target:
            for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
                v = target.get(f)
                log(not is_encrypted(v), f"  [maman] '{f}' is CLEAR (not enc_v1:/enc::)",
                    f"preview={str(v)[:50]}" if v else "empty")
            log(target.get("attachment_base64") == PDF_DATA_URI,
                "  [maman] attachment_base64 matches original data URI")
            log(target.get("attachment_name") == "ordonnance.pdf", "  [maman] attachment_name present")
            log(target.get("attachment_mime") == "application/pdf", "  [maman] attachment_mime present")

    # === STEP 4: GET /enfants/{eid}/notes as PRO ===
    print("\n--- STEP 4: GET /enfants/{eid}/notes as PRO ---")
    r = requests.get(f"{BASE}/enfants/{enfant_id}/notes", headers=H(pro_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"GET /enfants/{{eid}}/notes (pro) failed: {r.status_code} {r.text[:300]}")
    else:
        notes_pro = r.json()
        log(True, f"GET /enfants/{{eid}}/notes (pro) → {len(notes_pro)} note(s)")
        target = next((n for n in notes_pro if n.get("id") == note_pdf["id"]), None)
        log(target is not None, "Created PDF note appears in PRO's list")
        if target:
            for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
                v = target.get(f)
                log(not is_encrypted(v), f"  [pro] '{f}' is CLEAR")

    # === STEP 5: POST WITHOUT attachment ===
    print("\n--- STEP 5: POST consultation-notes WITHOUT attachment ---")
    payload2 = {"patient_id": enfant_id, "diagnostic": "Contrôle ok", "notes": "RAS"}
    r = requests.post(f"{BASE}/pro/consultation-notes", json=payload2, headers=H(pro_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"POST without attachment failed: {r.status_code} {r.text[:300]}")
    else:
        note2 = r.json()
        note_ids.append(note2["id"])
        att = note2.get("attachment_base64")
        log(att is None or att == "", f"attachment_base64 is null/empty (got {att!r})")
        log(not is_encrypted(note2.get("diagnostic")), f"diagnostic clear: {note2.get('diagnostic')!r}")
        log(note2.get("diagnostic") == "Contrôle ok", "diagnostic exact match")

    # === STEP 6: POST WITH IMAGE attachment ===
    print("\n--- STEP 6: POST with IMAGE (jpeg) attachment ---")
    payload3 = {
        "patient_id": enfant_id,
        "diagnostic": "Eczéma",
        "attachment_base64": JPEG_DATA_URI,
        "attachment_name": "lesion.jpg",
        "attachment_mime": "image/jpeg",
    }
    r = requests.post(f"{BASE}/pro/consultation-notes", json=payload3, headers=H(pro_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"POST with image failed: {r.status_code} {r.text[:300]}")
    else:
        note3 = r.json()
        note_ids.append(note3["id"])
        log(note3.get("attachment_base64") == JPEG_DATA_URI, "image data URI preserved exactly")
        log(note3.get("attachment_name") == "lesion.jpg", "attachment_name='lesion.jpg'")
        log(note3.get("attachment_mime") == "image/jpeg", "attachment_mime='image/jpeg'")
        log(not is_encrypted(note3.get("diagnostic")), f"diagnostic clear: {note3.get('diagnostic')!r}")

    # === STEP 7: Verify MAMAN sees 3 new "Nouvelle note médicale" notifications ===
    print("\n--- STEP 7: Verify maman has 3 new consultation_note notifications ---")
    r = requests.get(f"{BASE}/notifications", headers=H(maman_tok), timeout=30)
    if r.status_code != 200:
        log(False, f"GET /notifications failed: {r.status_code}")
    else:
        notifs_after = r.json()
        notifs_after_consult = [n for n in notifs_after if n.get("type") == "consultation_note"]
        delta = len(notifs_after_consult) - len(notifs_before_consult)
        log(delta >= 3, f"Got {delta} new consultation_note notifications (expected ≥3)",
            f"before={len(notifs_before_consult)}, after={len(notifs_after_consult)}")
        # verify title contains 'note médicale'
        new_consults = notifs_after_consult[:3] if delta >= 3 else notifs_after_consult
        for i, n in enumerate(new_consults):
            t = n.get("title", "")
            b = n.get("body", "")
            log("note médicale" in t.lower(), f"  notif[{i}].title contains 'note médicale': {t!r}")
            pro_name = pro.get("name", "")
            log(pro_name in b, f"  notif[{i}].body contains pro name '{pro_name}': {b!r}")

    # === STEP 8: DB verification — ciphertext at rest ===
    print("\n--- STEP 8: MongoDB direct check (ciphertext at rest) ---")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "alomaman")

        async def check_db():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            doc = await db.consultation_notes.find_one({"id": note_pdf["id"]}, {"_id": 0})
            client.close()
            return doc

        doc_db = asyncio.run(check_db())
        if doc_db:
            print(f"   DB doc fields: {sorted(doc_db.keys())}")
            for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
                v = doc_db.get(f)
                pref = (v or "")[:10] if isinstance(v, str) else ""
                # Encryption prefix is 'enc_v1:' (per encryption.py)
                is_enc = isinstance(v, str) and v.startswith("enc_v1:")
                log(is_enc, f"  DB '{f}' starts with 'enc_v1:' (encrypted at rest)",
                    f"prefix={pref!r}")
        else:
            log(False, "Could not find note in DB")
    except Exception as e:
        log(False, f"DB check failed: {e}")

    # === Cleanup ===
    print("\n--- CLEANUP ---")
    for nid in note_ids:
        try:
            r = requests.delete(f"{BASE}/pro/consultation-notes/{nid}", headers=H(pro_tok), timeout=30)
            print(f"   delete note {nid} → {r.status_code}")
        except Exception as e:
            print(f"   delete note {nid} ERROR: {e}")

    # Summary
    print("\n" + "=" * 70)
    passed = sum(1 for ok, _ in results if ok)
    failed = sum(1 for ok, _ in results if not ok)
    print(f"RESULT: {passed}/{passed+failed} PASS, {failed} FAIL")
    print("=" * 70)
    if failed:
        print("\nFAILED CHECKS:")
        for ok, msg in results:
            if not ok:
                print(f"  ❌ {msg}")
    return failed == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
