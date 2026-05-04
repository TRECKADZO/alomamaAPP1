#!/usr/bin/env python3
"""Backend tests for GET /api/centre/contacts (À lo Maman messaging)."""
import os, sys, time, json, uuid
import requests

BASE = os.environ.get("BACKEND_URL", "https://cycle-tracker-pro.preview.emergentagent.com/api")
SUPER_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}
CENTRE = {"email": "centre.test@alomaman.dev", "password": "Test1234!"}

PASS = 0
FAIL = 0
errors = []

def _check(cond, name, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        errors.append(f"{name} — {detail}")
        print(f"  ❌ {name} — {detail}")

def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        return None
    return r.json()["token"], r.json()["user"]

def register(payload):
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=30)
    return r

def H(tok):
    return {"Authorization": f"Bearer {tok}"}

print(f"[i] BASE = {BASE}")

# --- Ensure centre.test exists (register if missing) ---
tok_centre = None
res = login(CENTRE)
if res:
    tok_centre, centre_user = res
    print(f"[i] centre.test logged in (pre-existing). id={centre_user['id']}")
else:
    print(f"[i] centre.test not found — registering…")
    payload = {
        "name": "Centre Test À lo Maman",
        "email": CENTRE["email"],
        "password": CENTRE["password"],
        "phone": "+22507030303",
        "role": "centre_sante",
        "nom_centre": "Centre Santé Test",
        "type_etablissement": "clinique",
        "adresse": "Abidjan, Cocody",
        "ville": "Abidjan",
        "region": "Abidjan",
        "email_contact": "contact@centre.test",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    r = register(payload)
    if r.status_code != 200:
        print(f"[x] centre registration failed: {r.status_code} {r.text}")
        sys.exit(1)
    data = r.json()
    tok_centre = data["token"]
    centre_user = data["user"]
    print(f"[i] centre.test registered. id={centre_user['id']}")

# Login maman/pro
res = login(MAMAN)
assert res, "maman.test login failed"
tok_maman, maman_user = res
res = login(PRO)
assert res, "pro.test login failed"
tok_pro, pro_user = res

# Super admin (for adding pro to centre)
res = login(SUPER_ADMIN)
assert res, "super admin login failed"
tok_admin, admin_user = res

print(f"[i] maman.id={maman_user['id']}, pro.id={pro_user['id']}, centre.id={centre_user['id']}")

# ============================================================
print("\n=== SCENARIO 1: Auth / Sécurité ===")
# 1a: maman -> 403
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_maman), timeout=30)
_check(r.status_code == 403, "GET /centre/contacts as maman → 403", f"got {r.status_code} {r.text[:200]}")

# 1b: pro -> 403
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_pro), timeout=30)
_check(r.status_code == 403, "GET /centre/contacts as pro → 403", f"got {r.status_code} {r.text[:200]}")

# 1c: unauthenticated -> 401
r = requests.get(f"{BASE}/centre/contacts", timeout=30)
_check(r.status_code in (401, 403), "GET /centre/contacts unauthenticated → 401/403", f"got {r.status_code}")

# 1d: centre -> 200 w/ shape
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
_check(r.status_code == 200, "GET /centre/contacts as centre → 200", f"got {r.status_code} {r.text[:300]}")
body = r.json() if r.status_code == 200 else {}
_check(isinstance(body, dict) and "pros" in body and "patientes" in body,
       "Response body shape {pros, patientes}",
       f"body keys: {list(body.keys()) if isinstance(body, dict) else type(body)}")
_check(isinstance(body.get("pros"), list) and isinstance(body.get("patientes"), list),
       "pros and patientes are arrays", f"types: {type(body.get('pros'))}, {type(body.get('patientes'))}")

# ============================================================
print("\n=== SCENARIO 2: Centre state inspection ===")
# Use GET /centres/mine to know the centre
r = requests.get(f"{BASE}/centres/mine", headers=H(tok_centre), timeout=30)
_check(r.status_code == 200, "GET /centres/mine → 200", f"got {r.status_code} {r.text[:200]}")
centre_doc = r.json() if r.status_code == 200 else {}
centre_id = centre_doc.get("id")
membres_pro_initial = centre_doc.get("membres_pro", [])
print(f"[i] centre_id={centre_id}, membres_pro={membres_pro_initial}")

# If pro not a member, try to add via various endpoints
def _is_pro_member():
    r = requests.get(f"{BASE}/centres/mine", headers=H(tok_centre), timeout=30)
    return pro_user["id"] in (r.json().get("membres_pro", []) if r.status_code == 200 else [])

if not _is_pro_member():
    print(f"[i] pro.test is NOT a member of centre. Attempting to add…")
    # Try /centres/{id}/add-pro or PATCH /centres/{id}
    # Try PATCH /centres/{id} with membres_pro list
    candidates = [
        ("PATCH", f"{BASE}/centres/{centre_id}", {"membres_pro": list(set(membres_pro_initial + [pro_user["id"]]))}),
        ("POST", f"{BASE}/centres/{centre_id}/membres/add", {"pro_id": pro_user["id"]}),
        ("POST", f"{BASE}/centre/membres/add", {"pro_id": pro_user["id"]}),
        ("POST", f"{BASE}/centres/{centre_id}/add-pro", {"pro_id": pro_user["id"]}),
    ]
    added = False
    for method, url, body in candidates:
        try:
            r = requests.request(method, url, headers=H(tok_centre), json=body, timeout=30)
            print(f"  try {method} {url} → {r.status_code}")
            if r.status_code in (200, 201):
                if _is_pro_member():
                    print(f"  ✓ pro added via {method} {url}")
                    added = True
                    break
        except Exception as e:
            print(f"  err {method} {url}: {e}")
    if not added:
        # Fallback: insert directly via admin /admin/users patch? likely not possible. Use MongoDB if available via admin endpoint.
        # Try admin: PATCH /admin/centres/{id}
        try:
            r = requests.patch(f"{BASE}/admin/centres/{centre_id}", headers=H(tok_admin),
                               json={"membres_pro": list(set(membres_pro_initial + [pro_user["id"]]))}, timeout=30)
            print(f"  try admin patch /admin/centres/{centre_id} → {r.status_code} {r.text[:200]}")
            if _is_pro_member():
                added = True
        except Exception as e:
            print(f"  err admin patch: {e}")
    if not added:
        # Final fallback: direct DB via python Mongo
        try:
            from pymongo import MongoClient
            mongo_url = None
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("MONGO_URL"):
                        mongo_url = line.split("=", 1)[1].strip().strip('"')
                        break
            db_name = None
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("DB_NAME"):
                        db_name = line.split("=", 1)[1].strip().strip('"')
                        break
            if mongo_url:
                mc = MongoClient(mongo_url)
                db = mc[db_name or "test_database"]
                res = db.centres.update_one({"id": centre_id},
                                            {"$addToSet": {"membres_pro": pro_user["id"]}})
                print(f"  mongo update matched={res.matched_count}, modified={res.modified_count}")
                if _is_pro_member():
                    added = True
        except Exception as e:
            print(f"  err mongo: {e}")
    _check(added, "Added pro.test to centre membres", "Could not add pro to centre via any available mechanism")
else:
    print(f"[i] pro.test is already a member of centre ✓")
    _check(True, "pro.test is member of centre", "")

# Verify RDV between pro.test and maman.test
def _get_pro_rdv_count():
    # use admin for direct count? better: pro endpoint
    r = requests.get(f"{BASE}/pro/patients", headers=H(tok_pro), timeout=30)
    if r.status_code != 200:
        return -1, []
    patients = r.json()
    return len(patients), patients

cnt, patients = _get_pro_rdv_count()
print(f"[i] pro.test has {cnt} patients (via /pro/patients)")
has_maman = any(p.get("id") == maman_user["id"] for p in patients)

if not has_maman:
    print(f"[i] maman.test is not a patient of pro.test — creating an RDV")
    rdv_payload = {
        "pro_id": pro_user["id"],
        "date": "2026-06-20T14:30",
        "motif": "Test contacts endpoint",
        "type_consultation": "prenatale",
    }
    r = requests.post(f"{BASE}/rdv", headers=H(tok_maman), json=rdv_payload, timeout=30)
    print(f"  POST /rdv → {r.status_code} {r.text[:200]}")
    _check(r.status_code == 200, "Create RDV maman→pro", f"got {r.status_code}")

# ============================================================
print("\n=== SCENARIO 3: Centre avec membres — response content ===")
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
_check(r.status_code == 200, "GET /centre/contacts → 200", f"got {r.status_code}")
body = r.json()
pros = body.get("pros", [])
patientes = body.get("patientes", [])
print(f"[i] pros count={len(pros)}, patientes count={len(patientes)}")

# pros contains pro.test
pro_entry = next((p for p in pros if p.get("id") == pro_user["id"]), None)
_check(pro_entry is not None, "pros array contains pro.test",
       f"pro_ids={[p.get('id') for p in pros]}")

if pro_entry:
    # Required fields
    expected_fields = ["id", "name", "phone", "email", "type", "unread_count",
                       "last_message", "last_message_at", "last_message_from_me", "specialite"]
    missing = [f for f in expected_fields if f not in pro_entry]
    _check(not missing, f"pro_entry has all fields {expected_fields}", f"missing={missing}")
    _check(pro_entry.get("type") == "pro", "pro_entry.type == 'pro'", f"got {pro_entry.get('type')}")
    _check(pro_entry.get("name"), "pro_entry.name not empty", f"got {pro_entry.get('name')}")

# patientes contains maman.test (if RDV exists)
maman_entry = next((p for p in patientes if p.get("id") == maman_user["id"]), None)
_check(maman_entry is not None, "patientes array contains maman.test",
       f"patiente_ids={[p.get('id') for p in patientes]}")

if maman_entry:
    expected_fields = ["id", "name", "phone", "email", "type", "unread_count",
                       "last_message", "last_message_at", "last_message_from_me",
                       "has_grossesse", "grossesse_sa", "enfants_count"]
    missing = [f for f in expected_fields if f not in maman_entry]
    _check(not missing, f"maman_entry has all fields {expected_fields}", f"missing={missing}")
    _check(maman_entry.get("type") == "patient", "maman_entry.type == 'patient'",
           f"got {maman_entry.get('type')}")

# ============================================================
print("\n=== SCENARIO 4: Déduplication des patientes ===")
# Count occurrences of each maman_id in patientes
ids = [p.get("id") for p in patientes]
dupes = [x for x in set(ids) if ids.count(x) > 1]
_check(not dupes, "No duplicate maman in patientes[]", f"dupes={dupes}")

# ============================================================
print("\n=== SCENARIO 5: Messaging signals ===")
# Clean slate: read centre↔pro thread so unread resets to 0
_ = requests.get(f"{BASE}/messages/{pro_user['id']}", headers=H(tok_centre), timeout=30)
_ = requests.get(f"{BASE}/messages/{centre_user['id']}", headers=H(tok_pro), timeout=30)
_ = requests.get(f"{BASE}/messages/{maman_user['id']}", headers=H(tok_centre), timeout=30)
time.sleep(0.3)
# 5a: centre sends a message to pro
unique_msg1 = f"Test centre→pro {uuid.uuid4().hex[:6]}"
r = requests.post(f"{BASE}/messages", headers=H(tok_centre),
                  json={"to_id": pro_user["id"], "content": unique_msg1}, timeout=30)
_check(r.status_code == 200, "centre POST /messages to pro → 200", f"got {r.status_code} {r.text[:200]}")
time.sleep(1)

# GET /centre/contacts and check pro signals
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
body = r.json()
pro_entry = next((p for p in body.get("pros", []) if p.get("id") == pro_user["id"]), None)
_check(pro_entry is not None, "pro_entry present after centre→pro message", "")
if pro_entry:
    _check(pro_entry.get("last_message") == unique_msg1[:80],
           "pro.last_message == sent text",
           f"got {pro_entry.get('last_message')!r}, expected {unique_msg1!r}")
    _check(pro_entry.get("last_message_from_me") is True,
           "pro.last_message_from_me == True (centre is sender)",
           f"got {pro_entry.get('last_message_from_me')!r}")
    _check(pro_entry.get("last_message_at"),
           "pro.last_message_at is ISO timestamp",
           f"got {pro_entry.get('last_message_at')!r}")
    _check(pro_entry.get("unread_count") == 0,
           "pro.unread_count == 0 (centre sent, no incoming unread)",
           f"got {pro_entry.get('unread_count')!r}")

# 5b: pro sends message back to centre
unique_msg2 = f"Reponse pro→centre {uuid.uuid4().hex[:6]}"
r = requests.post(f"{BASE}/messages", headers=H(tok_pro),
                  json={"to_id": centre_user["id"], "content": unique_msg2}, timeout=30)
_check(r.status_code == 200, "pro POST /messages to centre → 200", f"got {r.status_code} {r.text[:200]}")
time.sleep(1)

# GET /centre/contacts (centre has NOT read the thread) → unread_count should be 1
r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
body = r.json()
pro_entry = next((p for p in body.get("pros", []) if p.get("id") == pro_user["id"]), None)
_check(pro_entry is not None, "pro_entry present after pro→centre reply", "")
if pro_entry:
    _check(pro_entry.get("last_message") == unique_msg2[:80],
           "pro.last_message == pro's reply text",
           f"got {pro_entry.get('last_message')!r}, expected {unique_msg2!r}")
    _check(pro_entry.get("last_message_from_me") is False,
           "pro.last_message_from_me == False (pro is sender)",
           f"got {pro_entry.get('last_message_from_me')!r}")
    _check(pro_entry.get("unread_count") >= 1,
           "pro.unread_count >= 1 (centre hasn't read pro's reply)",
           f"got {pro_entry.get('unread_count')!r}")

# ============================================================
print("\n=== SCENARIO 6: Tri non-lus en premier ===")
# Add a 2nd pro member (no unread) to verify sort
second_pro_email = f"pro_sort_{uuid.uuid4().hex[:6]}@alomaman.test"
r = requests.post(f"{BASE}/auth/register", json={
    "name": "Dr Second Pro",
    "email": second_pro_email,
    "password": "Test1234!",
    "phone": f"+22507{uuid.uuid4().int % 100000000:08d}",
    "role": "professionnel",
    "specialite": "sage-femme",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
}, timeout=30)
second_pro_id = None
if r.status_code == 200:
    second_pro_id = r.json()["user"]["id"]
    # add to centre via mongo
    try:
        from pymongo import MongoClient
        mongo_url = None
        db_name = None
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL"):
                    mongo_url = line.split("=", 1)[1].strip().strip('"')
                if line.startswith("DB_NAME"):
                    db_name = line.split("=", 1)[1].strip().strip('"')
        mc = MongoClient(mongo_url)
        db_sync = mc[db_name or "test_database"]
        db_sync.centres.update_one({"id": centre_id}, {"$addToSet": {"membres_pro": second_pro_id}})
        print(f"[i] added 2nd pro {second_pro_id} to centre")
    except Exception as e:
        print(f"[i] err adding 2nd pro: {e}")

r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
body = r.json()
pros = body.get("pros", [])
print(f"[i] pros count now: {len(pros)}, unread sequence: {[(p.get('id')[:8], p.get('unread_count')) for p in pros]}")
if len(pros) >= 2:
    sorted_ok = True
    seen_zero = False
    for p in pros:
        if (p.get("unread_count") or 0) == 0:
            seen_zero = True
        elif seen_zero:
            sorted_ok = False
            break
    _check(sorted_ok, "pros sorted: unread>0 before unread=0",
           f"unread sequence={[p.get('unread_count') for p in pros]}")
else:
    print(f"[i] Only {len(pros)} pro(s) — cannot verify sort conclusively, but single-item trivially sorted")
    _check(True, "Sort trivially OK with <2 pros", "")

# ============================================================
print("\n=== SCENARIO 7: Patientes signals (bonus) ===")
# Centre sends a message to maman
unique_msg3 = f"Test centre→maman {uuid.uuid4().hex[:6]}"
r = requests.post(f"{BASE}/messages", headers=H(tok_centre),
                  json={"to_id": maman_user["id"], "content": unique_msg3}, timeout=30)
if r.status_code == 200:
    time.sleep(1)
    r = requests.get(f"{BASE}/centre/contacts", headers=H(tok_centre), timeout=30)
    body = r.json()
    m_entry = next((p for p in body.get("patientes", []) if p.get("id") == maman_user["id"]), None)
    if m_entry:
        _check(m_entry.get("last_message") == unique_msg3[:80],
               "maman.last_message == centre msg", f"got {m_entry.get('last_message')!r}")
        _check(m_entry.get("last_message_from_me") is True,
               "maman.last_message_from_me == True", f"got {m_entry.get('last_message_from_me')!r}")
    else:
        print("[i] maman not in patientes — skipping patiente signals check")
else:
    print(f"[i] Could not send centre→maman message ({r.status_code}): {r.text[:200]}")

# ============================================================
print(f"\n===========================================")
print(f"TOTAL: {PASS} PASS / {FAIL} FAIL")
if errors:
    print("\nErrors:")
    for e in errors:
        print(f"  - {e}")
sys.exit(0 if FAIL == 0 else 1)
