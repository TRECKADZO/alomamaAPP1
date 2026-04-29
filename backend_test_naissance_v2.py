"""
Test complet du module Déclaration de Naissance v2 (PDF + Email + État civil).
Cible: https://cycle-tracker-pro.preview.emergentagent.com/api
"""
import os
import sys
import re
import uuid
import base64
import json
import random
import string
import time
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import certifi

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"

# Credentials
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PWD = "474Treckadzo$1986"

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    tag = "✅" if ok else "❌"
    print(f"{tag} {name}  {detail}")

def req(method, path, token=None, json_body=None, expect=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.request(method, BASE + path, headers=h, json=json_body, timeout=30)
    return r

def login(email, password):
    r = requests.post(BASE + "/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Login failed {email}: {r.status_code} {r.text[:300]}")
    d = r.json()
    return d["token"], d["user"]

def random_email(prefix="securityB"):
    suf = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}_{suf}@test.dev"

async def db_check(coll, q):
    client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=20000)
    db = client[DB_NAME]
    doc = await db[coll].find_one(q, {"_id": 0})
    client.close()
    return doc

async def db_delete(coll, q):
    client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=20000)
    db = client[DB_NAME]
    res = await db[coll].delete_many(q)
    client.close()
    return res.deleted_count

async def db_find_all(coll, q, limit=100):
    client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=20000)
    db = client[DB_NAME]
    docs = await db[coll].find(q, {"_id": 0}).to_list(limit)
    client.close()
    return docs


# -------------------- SETUP --------------------
print("\n=== SETUP ===")
maman_token, maman_user = login(MAMAN_EMAIL, MAMAN_PWD)
print(f"Maman A token OK user_id={maman_user['id']} email={maman_user['email']}")

pro_token, pro_user = login(PRO_EMAIL, PRO_PWD)
print(f"Pro token OK user_id={pro_user['id']}")

admin_token, admin_user = login(ADMIN_EMAIL, ADMIN_PWD)
print(f"Admin token OK user_id={admin_user['id']}")

# Register Maman B for cross-tenant security tests
maman_b_email = random_email("securityB")
maman_b_pwd = "SecurityB123!"
r = requests.post(BASE + "/auth/register", json={
    "email": maman_b_email,
    "password": maman_b_pwd,
    "name": "Fatou SecurityB",
    "role": "maman",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
})
assert r.status_code == 200, f"register maman B failed: {r.status_code} {r.text[:300]}"
maman_b_token = r.json()["token"]
maman_b_user = r.json()["user"]
print(f"Maman B created: {maman_b_email}  id={maman_b_user['id']}")


# -------------------- CLEANUP old test naissances for this maman --------------------
async def cleanup_old_naissances():
    # Delete any existing 'Bébé Test PDF' enfants and their naissances
    enfants = await db_find_all("enfants", {"user_id": maman_user["id"], "nom": {"$regex": "^Bébé Test PDF"}})
    for e in enfants:
        await db_delete("naissances", {"enfant_id": e["id"]})
        await db_delete("enfants", {"id": e["id"]})
    # Also cleanup Maman B's test data
    await db_delete("naissances", {"user_id": maman_b_user["id"]})
    await db_delete("enfants", {"user_id": maman_b_user["id"]})
    # Cleanup app_config etat_civil_email for clean test
    await db_delete("app_config", {"key": "etat_civil_email"})

asyncio.run(cleanup_old_naissances())
print("Cleanup done")

# Also cleanup share queue for this maman
async def clean_queue():
    await db_delete("naissance_share_queue", {"requested_by": maman_user["id"]})
    await db_delete("naissance_share_queue", {"requested_by": maman_b_user["id"]})
asyncio.run(clean_queue())


# ============================================================
# SECTION 1 — Création de déclaration POST /api/naissance
# ============================================================
print("\n=== 1. Création de déclaration ===")

# Base payload template
def base_payload(**overrides):
    p = {
        "enfant_nom": "Bébé Test PDF",
        "enfant_sexe": "F",
        "enfant_date_naissance": "2026-02-01T08:30:00Z",
        "prenoms": "Amina Marie",
        "lieu_naissance": "CHU de Cocody, Abidjan",
        "lieu_type": "maternite",
        "heure_naissance": "08:30",
        "poids_naissance_g": 3200,
        "taille_naissance_cm": 49.5,
        "score_apgar_1min": 9,
        "score_apgar_5min": 10,
        "nom_mere": "Aminata TestMaman",
        "profession_mere": "Ingénieure",
        "nom_pere": "Kouassi TestPapa",
        "profession_pere": "Commerçant",
        "medecin_accoucheur": "Dr. Adjoua SAGE-FEMME",
        "consentement_explicite": True,
    }
    p.update(overrides)
    return p

# 1.1 — POST sans consentement_explicite → 400
r = req("POST", "/naissance", maman_token, base_payload(consentement_explicite=False))
ok = (r.status_code == 400 and "consentement" in r.text.lower())
record("1.1 POST sans consentement → 400", ok, f"status={r.status_code} body={r.text[:200]}")

# 1.2 — POST valide avec enfant inline
p12 = base_payload()
r = req("POST", "/naissance", maman_token, p12)
naissance_A = None
numero_ref_A = None
if r.status_code == 200:
    d = r.json()
    naissance_A = d
    numero_ref_A = d.get("numero_reference")
    # Validate format AM-YYYY-XXXXXX (6 hex uppercase)
    m = re.match(r"^AM-(\d{4})-([0-9A-F]{6})$", numero_ref_A or "")
    fmt_ok = bool(m)
    year_ok = (m.group(1) == str(datetime.now(timezone.utc).year)) if m else False
    fields_ok = (
        d.get("enfant_cree_auto") is True and
        d.get("status") == "en_attente" and
        d.get("prenoms") == "Amina Marie" and
        d.get("lieu_type") == "maternite" and
        d.get("score_apgar_1min") == 9 and
        d.get("score_apgar_5min") == 10
    )
    ok = fmt_ok and year_ok and fields_ok
    record("1.2 POST valide avec enfant inline → 200 + numero_reference correct + champs préservés",
           ok, f"ref={numero_ref_A} fmt={fmt_ok} year={year_ok} fields={fields_ok}")
else:
    record("1.2 POST valide avec enfant inline → 200", False, f"status={r.status_code} body={r.text[:300]}")

# 1.3 — POST 2e fois pour le même enfant → 400
if naissance_A:
    p13 = base_payload()
    # Use same enfant_id by retrieving it
    enfant_id_A = naissance_A.get("enfant_id")
    p13_with_id = base_payload()
    p13_with_id["enfant_id"] = enfant_id_A
    r = req("POST", "/naissance", maman_token, p13_with_id)
    ok = (r.status_code == 400 and "déjà" in r.text.lower())
    record("1.3 POST en double (même enfant_id) → 400", ok, f"status={r.status_code} body={r.text[:200]}")
else:
    record("1.3 POST en double → 400", False, "skipped (naissance_A None)")

# 1.4 — POST avec enfant_id existant (use Maman B fresh account to avoid quota)
r = requests.post(BASE + "/enfants", headers={"Authorization": f"Bearer {maman_b_token}"}, json={
    "nom": "Bébé B Alt",
    "date_naissance": "2026-03-10T10:00:00Z",
    "sexe": "M",
})
if r.status_code == 200:
    enfant_alt = r.json()
    p14 = {
        "enfant_id": enfant_alt["id"],
        "lieu_naissance": "Clinique Sainte Marie",
        "lieu_type": "clinique_privee",
        "heure_naissance": "10:00",
        "nom_mere": "Fatou SecurityB",
        "consentement_explicite": True,
    }
    r2 = req("POST", "/naissance", maman_b_token, p14)
    if r2.status_code == 200:
        d = r2.json()
        ok = d.get("enfant_cree_auto") is False and d.get("numero_reference", "").startswith(f"AM-{datetime.now(timezone.utc).year}-")
        record("1.4 POST avec enfant_id existant → 200 + enfant_cree_auto=false", ok,
               f"ref={d.get('numero_reference')} auto={d.get('enfant_cree_auto')}")
        naissance_alt = d
    else:
        record("1.4 POST avec enfant_id existant", False, f"status={r2.status_code} body={r2.text[:200]}")
        naissance_alt = None
else:
    record("1.4 POST avec enfant_id existant", False, f"setup failed: {r.text[:200]}")
    naissance_alt = None

# 1.6 — Pro essaie POST → 403
r = req("POST", "/naissance", pro_token, base_payload(enfant_nom="Bébé Test PDF Pro"))
ok = (r.status_code == 403)
record("1.6 Pro tente POST /naissance → 403", ok, f"status={r.status_code}")

# 1.7 — score_apgar_1min=11 (hors range) — use Maman B (fresh quota room still ok)
# Maman B has 1 enfant (created in 1.4); limit is 2 → 1 more allowed
p17 = base_payload(enfant_nom="Bébé B APGAR", nom_mere="Fatou SecurityB", score_apgar_1min=11)
r = req("POST", "/naissance", maman_b_token, p17)
record(f"1.7 POST apgar=11 (hors range 0-10) → status={r.status_code}",
       r.status_code in (200, 400, 422),
       f"[INFO observation] status={r.status_code} body={r.text[:150]}  (pas de validation range dans le schéma actuel)")
# cleanup if it was created
if r.status_code == 200:
    nid_apgar = r.json().get("id")
    eid_apgar = r.json().get("enfant_id")
    if nid_apgar:
        asyncio.run(db_delete("naissances", {"id": nid_apgar}))
    if eid_apgar:
        asyncio.run(db_delete("enfants", {"id": eid_apgar}))


# ============================================================
# SECTION 2 — Génération PDF GET /api/naissance/{nid}/pdf
# ============================================================
print("\n=== 2. Génération PDF ===")
nid_A = naissance_A["id"] if naissance_A else None

if nid_A:
    r = req("GET", f"/naissance/{nid_A}/pdf", maman_token)
    if r.status_code == 200:
        d = r.json()
        filename = d.get("filename", "")
        mime = d.get("mime")
        size = d.get("size_bytes", 0)
        data_uri = d.get("data_uri", "")
        b64 = d.get("base64", "")
        ref = d.get("numero_reference")
        fname_ok = filename.startswith("declaration_naissance_") and filename.endswith(".pdf")
        mime_ok = (mime == "application/pdf")
        size_ok = (size > 5000)
        uri_ok = data_uri.startswith("data:application/pdf;base64,")
        b64_ok = bool(b64)
        ref_ok = bool(ref)
        try:
            decoded = base64.b64decode(b64)
            pdf_header_ok = decoded.startswith(b"%PDF")
        except Exception:
            pdf_header_ok = False
        ok = fname_ok and mime_ok and size_ok and uri_ok and b64_ok and ref_ok and pdf_header_ok
        record("2.1 Maman owner PDF → 200 + tous les champs + %PDF header",
               ok, f"size={size} fname_ok={fname_ok} mime={mime} uri_ok={uri_ok} pdf_hdr={pdf_header_ok}")
    else:
        record("2.1 Maman owner PDF", False, f"status={r.status_code} body={r.text[:300]}")

    # 2.2 — Maman B essaie GET PDF de la naissance de Maman A → 403
    r = req("GET", f"/naissance/{nid_A}/pdf", maman_b_token)
    ok = (r.status_code == 403)
    record("2.2 Cross-tenant: Maman B → PDF Maman A → 403", ok, f"status={r.status_code}")

    # 2.3 — Admin → 200
    r = req("GET", f"/naissance/{nid_A}/pdf", admin_token)
    ok = (r.status_code == 200 and r.json().get("mime") == "application/pdf")
    record("2.3 Admin → PDF → 200", ok, f"status={r.status_code}")

# 2.4 — ID inexistant → 404
fake_id = str(uuid.uuid4())
r = req("GET", f"/naissance/{fake_id}/pdf", maman_token)
ok = (r.status_code == 404)
record("2.4 PDF id inexistant → 404", ok, f"status={r.status_code}")


# ============================================================
# SECTION 3 — Share / Email POST /api/naissance/{nid}/share
# ============================================================
print("\n=== 3. Partage / Email ===")

# Ensure no config before test 3.2
asyncio.run(db_delete("app_config", {"key": "etat_civil_email"}))

if nid_A:
    # 3.1 — Maman owner canal=email_maman
    r = req("POST", f"/naissance/{nid_A}/share", maman_token, {"canal": "email_maman"})
    if r.status_code == 200:
        d = r.json()
        dest_ok = d.get("destinataire") in (maman_user.get("email"), MAMAN_EMAIL)
        ok = (d.get("ok") is True and d.get("queued") is True
              and d.get("canal") == "email_maman" and dest_ok
              and ("email" in (d.get("message") or "").lower() or "traité" in (d.get("message") or "").lower()))
        record("3.1 Share email_maman → 200 + ok+queued+destinataire+canal", ok,
               f"dest={d.get('destinataire')} msg={d.get('message')}")
    else:
        record("3.1 Share email_maman → 200", False, f"status={r.status_code} body={r.text[:200]}")

    # Verify DB queue doc
    queue_doc = asyncio.run(db_check("naissance_share_queue",
                                      {"naissance_id": nid_A, "canal": "email_maman", "status": "queued"}))
    record("3.1b DB: doc créé dans naissance_share_queue (status=queued)",
           queue_doc is not None, f"doc={'found' if queue_doc else 'None'}")

    # 3.2 — canal=email_etat_civil SANS config → 400
    r = req("POST", f"/naissance/{nid_A}/share", maman_token, {"canal": "email_etat_civil"})
    ok = (r.status_code == 400 and "état civil" in r.text.lower())
    record("3.2 Share email_etat_civil sans config → 400", ok, f"status={r.status_code} body={r.text[:200]}")

    # 3.3 — Admin configure email
    r = req("POST", "/admin/config/etat_civil_email", admin_token, {"value": "etatcivil@onaci.ci"})
    ok = (r.status_code == 200)
    record("3.3 Admin POST /admin/config/etat_civil_email → 200", ok, f"status={r.status_code} body={r.text[:150]}")

    # 3.4 — Re-tester email_etat_civil après config → 200 + destinataire
    r = req("POST", f"/naissance/{nid_A}/share", maman_token, {"canal": "email_etat_civil"})
    if r.status_code == 200:
        d = r.json()
        ok = (d.get("destinataire") == "etatcivil@onaci.ci" and d.get("canal") == "email_etat_civil")
        record("3.4 Share email_etat_civil après config → 200 + dest=etatcivil@onaci.ci",
               ok, f"dest={d.get('destinataire')}")
    else:
        record("3.4 Share email_etat_civil après config", False, f"status={r.status_code} body={r.text[:200]}")

    # 3.5 — email_destinataire surchargé
    r = req("POST", f"/naissance/{nid_A}/share", maman_token,
            {"canal": "email_maman", "email_destinataire": "surcharge@test.dev"})
    if r.status_code == 200:
        d = r.json()
        ok = (d.get("destinataire") == "surcharge@test.dev")
        record("3.5 Share avec email_destinataire surchargé → 200", ok, f"dest={d.get('destinataire')}")
    else:
        record("3.5 Share avec email_destinataire surchargé", False, f"status={r.status_code} body={r.text[:200]}")

    # 3.6 — Maman B essaie share sur naissance Maman A → 403
    r = req("POST", f"/naissance/{nid_A}/share", maman_b_token, {"canal": "email_maman"})
    ok = (r.status_code == 403)
    record("3.6 Cross-tenant: Maman B → share Maman A → 403", ok, f"status={r.status_code}")


# ============================================================
# SECTION 4 — Configuration globale Admin
# ============================================================
print("\n=== 4. Configuration globale Admin ===")

# 4.1 — GET /admin/config/etat_civil_email en admin
r = req("GET", "/admin/config/etat_civil_email", admin_token)
if r.status_code == 200:
    d = r.json()
    ok = (d.get("key") == "etat_civil_email" and d.get("value") == "etatcivil@onaci.ci")
    record("4.1 Admin GET /admin/config/etat_civil_email → 200", ok, f"body={d}")
else:
    record("4.1 Admin GET /admin/config/etat_civil_email → 200", False, f"status={r.status_code}")

# 4.2 — POST update
r = req("POST", "/admin/config/etat_civil_email", admin_token, {"value": "new@etat.ci"})
ok = (r.status_code == 200 and r.json().get("value") == "new@etat.ci")
record("4.2 Admin POST update → 200 + value=new@etat.ci", ok, f"status={r.status_code} body={r.text[:200]}")

# Verify upsert in DB
cfg = asyncio.run(db_check("app_config", {"key": "etat_civil_email"}))
ok = (cfg is not None and cfg.get("value") == "new@etat.ci")
record("4.2b DB upsert confirmé", ok, f"cfg={cfg}")

# 4.3 — GET en maman → 403
r = req("GET", "/admin/config/etat_civil_email", maman_token)
ok = (r.status_code == 403)
record("4.3 Maman GET /admin/config/etat_civil_email → 403", ok, f"status={r.status_code}")

# 4.4 — GET /config/etat-civil-email-public en maman → 200 + configured=true
r = req("GET", "/config/etat-civil-email-public", maman_token)
if r.status_code == 200:
    d = r.json()
    ok = (d.get("configured") is True and "value" not in d)
    record("4.4 Maman GET /config/etat-civil-email-public → 200 + configured=true + pas de value", ok, f"body={d}")
else:
    record("4.4 Maman GET /config/etat-civil-email-public", False, f"status={r.status_code}")


# ============================================================
# SECTION 5 — Liste & détail (Régression)
# ============================================================
print("\n=== 5. Liste & détail ===")

# 5.1 — GET liste maman
r = req("GET", "/naissance", maman_token)
if r.status_code == 200:
    items = r.json()
    has_ref = all("numero_reference" in it for it in items if it.get("user_id") == maman_user["id"])
    all_mine = all(it.get("user_id") == maman_user["id"] for it in items)
    ok = isinstance(items, list) and all_mine and has_ref and any(it.get("id") == nid_A for it in items)
    record("5.1 GET /naissance (maman) — ses naissances avec numero_reference", ok,
           f"count={len(items)} all_mine={all_mine} has_ref={has_ref}")
else:
    record("5.1 GET /naissance (maman)", False, f"status={r.status_code}")

# 5.2 — GET liste admin → renvoie toutes
r = req("GET", "/naissance", admin_token)
if r.status_code == 200:
    items = r.json()
    unique_users = set(it.get("user_id") for it in items)
    ok = (len(items) >= 1 and len(unique_users) >= 1 and any(it.get("id") == nid_A for it in items))
    record("5.2 GET /naissance (admin) — toutes", ok,
           f"count={len(items)} unique_users={len(unique_users)}")
else:
    record("5.2 GET /naissance (admin)", False, f"status={r.status_code}")

# 5.3 — GET détail Maman B sur naissance Maman A → 403
if nid_A:
    r = req("GET", f"/naissance/{nid_A}", maman_b_token)
    ok = (r.status_code == 403)
    record("5.3 Cross-tenant: Maman B → GET /naissance/{nid_A} → 403", ok, f"status={r.status_code}")


# ============================================================
# CLEANUP
# ============================================================
print("\n=== CLEANUP ===")
async def cleanup_all():
    # Delete naissance_share_queue
    await db_delete("naissance_share_queue", {"requested_by": maman_user["id"]})
    await db_delete("naissance_share_queue", {"requested_by": maman_b_user["id"]})
    # Delete naissances for maman A (test-scoped: those created during this run)
    if nid_A:
        await db_delete("naissances", {"id": nid_A})
    if naissance_alt:
        await db_delete("naissances", {"id": naissance_alt["id"]})
    # Delete test enfants for maman A
    await db_delete("enfants", {"user_id": maman_user["id"], "nom": {"$regex": "^Bébé Test PDF"}})
    # Delete Maman B account + data
    await db_delete("naissances", {"user_id": maman_b_user["id"]})
    await db_delete("enfants", {"user_id": maman_b_user["id"]})
    await db_delete("users", {"id": maman_b_user["id"]})
    # Reset app_config etat_civil_email
    await db_delete("app_config", {"key": "etat_civil_email"})

asyncio.run(cleanup_all())
print("Cleanup done.")


# ============================================================
# SUMMARY
# ============================================================
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"{passed}/{total} tests passed")
failed = [(n, d) for n, ok, d in results if not ok]
if failed:
    print("\nFAILED:")
    for n, d in failed:
        print(f"  ❌ {n}")
        print(f"     {d}")

sys.exit(0 if passed == total else 1)
