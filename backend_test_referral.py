"""
Backend test: Système de PARRAINAGE
Tests the referral system end-to-end on the production API.
"""
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"

# Unique suffix for test filleules (avoid collisions on reruns)
SUFFIX = str(int(time.time()))[-6:]
FILLEULE1_EMAIL = f"filleule1.test.{SUFFIX}@alomaman.dev"
FILLEULE2_EMAIL = f"filleule2.test.{SUFFIX}@alomaman.dev"
FILLEULE3_EMAIL = f"filleule3.test.{SUFFIX}@alomaman.dev"
NO_PARRAIN_EMAIL = f"noparrain.test.{SUFFIX}@alomaman.dev"
PRO_REF_EMAIL = f"pro.ref.test.{SUFFIX}@alomaman.dev"
PWD = "Test1234!"

results = []
created_emails = []  # to cleanup

def log(title, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {title}{(' — ' + detail) if detail else ''}")
    results.append({"title": title, "ok": bool(ok), "detail": detail})

def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    if r.status_code != 200:
        return None, r
    return r.json().get("token"), r

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

def register(payload):
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=30)
    return r

# ===== STEP 0: Login maman parrain =====
print("\n===== STEP 0: Login maman parrain =====")
token_maman, r = login(MAMAN_EMAIL, MAMAN_PWD)
if not token_maman:
    log("Login maman.test", False, f"status={r.status_code} body={r.text[:200]}")
    print("ABORT: cannot login maman")
    sys.exit(1)
log("Login maman.test", True)

# ===== STEP 1: GET /referral/me =====
print("\n===== STEP 1: GET /referral/me =====")
r = requests.get(f"{BASE}/referral/me", headers=auth_headers(token_maman), timeout=30)
if r.status_code != 200:
    log("GET /referral/me → 200", False, f"status={r.status_code} body={r.text[:200]}")
    sys.exit(1)
data = r.json()
log("GET /referral/me → 200", True)

# Verify shape
required_keys = ["referral_code", "referrals_count", "days_earned", "filleules", "share_url", "share_text", "next_milestone", "rewards_info"]
missing = [k for k in required_keys if k not in data]
log("GET /referral/me contains all required keys", not missing, f"missing={missing} | got={list(data.keys())}")

MAMAN1_CODE = data.get("referral_code")
ok_code = MAMAN1_CODE and isinstance(MAMAN1_CODE, str) and len(MAMAN1_CODE) == 6 and MAMAN1_CODE == MAMAN1_CODE.upper()
log("referral_code is 6 uppercase chars", ok_code, f"code={MAMAN1_CODE}")

log("referrals_count is int", isinstance(data.get("referrals_count"), int), f"val={data.get('referrals_count')}")
log("days_earned is int", isinstance(data.get("days_earned"), int), f"val={data.get('days_earned')}")
log("filleules is list", isinstance(data.get("filleules"), list), f"val={data.get('filleules')}")
log("share_url includes code", MAMAN1_CODE and MAMAN1_CODE in (data.get("share_url") or ""), f"share_url={data.get('share_url')}")
log("next_milestone is obj (or None)", data.get("next_milestone") is None or isinstance(data.get("next_milestone"), dict), "")
log("rewards_info is obj", isinstance(data.get("rewards_info"), dict), "")

# Snapshot initial counters for later comparison
INITIAL_COUNT = data.get("referrals_count", 0)
INITIAL_DAYS = data.get("days_earned", 0)
print(f"  → MAMAN1_CODE={MAMAN1_CODE}, referrals_count={INITIAL_COUNT}, days_earned={INITIAL_DAYS}")

# Snapshot premium_until for restoration
r = requests.get(f"{BASE}/auth/me", headers=auth_headers(token_maman), timeout=30)
me_before = r.json() if r.status_code == 200 else {}
INITIAL_PREMIUM = me_before.get("premium", False)
INITIAL_PREMIUM_UNTIL = me_before.get("premium_until")
print(f"  → premium={INITIAL_PREMIUM}, premium_until={INITIAL_PREMIUM_UNTIL}")

# ===== STEP 2: POST /referral/validate-code with valid code =====
print("\n===== STEP 2: POST /referral/validate-code with valid code =====")
r = requests.post(f"{BASE}/referral/validate-code", json={"code": MAMAN1_CODE}, timeout=30)
log("validate-code valid → 200", r.status_code == 200, f"status={r.status_code}")
d = r.json() if r.status_code == 200 else {}
log("validate-code returns valid=true", d.get("valid") is True, f"body={d}")
log("validate-code returns parrain_name", bool(d.get("parrain_name")), f"parrain_name={d.get('parrain_name')}")

# ===== STEP 3: POST /referral/validate-code with unknown code =====
print("\n===== STEP 3: POST /referral/validate-code with unknown code (AAAAAA) =====")
r = requests.post(f"{BASE}/referral/validate-code", json={"code": "AAAAAA"}, timeout=30)
log("validate-code unknown → 200", r.status_code == 200, f"status={r.status_code}")
d = r.json() if r.status_code == 200 else {}
log("valid=false + reason='Code introuvable'", d.get("valid") is False and d.get("reason") == "Code introuvable", f"body={d}")

# ===== STEP 4: POST /referral/validate-code with short code =====
print("\n===== STEP 4: POST /referral/validate-code with short code 'ab' =====")
r = requests.post(f"{BASE}/referral/validate-code", json={"code": "ab"}, timeout=30)
log("validate-code short → 200", r.status_code == 200, f"status={r.status_code}")
d = r.json() if r.status_code == 200 else {}
log("valid=false + reason='Code invalide (6 caractères requis)'",
    d.get("valid") is False and d.get("reason") == "Code invalide (6 caractères requis)",
    f"body={d}")

# ===== STEP 5: Register filleule1 with referral_code =====
print("\n===== STEP 5: Register filleule1 with referral_code =====")
payload1 = {
    "name": "Filleule Test1",
    "email": FILLEULE1_EMAIL,
    "password": PWD,
    "role": "maman",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
    "referral_code": MAMAN1_CODE,
}
r = register(payload1)
ok = r.status_code in (200, 201)
log("Register filleule1 with referral_code → 200/201", ok, f"status={r.status_code} body={r.text[:300]}")
if ok:
    created_emails.append(FILLEULE1_EMAIL)
    body = r.json()
    f1_token = body.get("token")
    f1_user = body.get("user") or {}
    # Verify referred_by_code on user
    log("filleule1.user.referred_by_code == MAMAN1_CODE",
        f1_user.get("referred_by_code") == MAMAN1_CODE,
        f"referred_by_code={f1_user.get('referred_by_code')}")
    # Filleule should have her own referral_code
    log("filleule1.user.referral_code exists & 6 chars",
        f1_user.get("referral_code") and len(f1_user.get("referral_code")) == 6,
        f"code={f1_user.get('referral_code')}")
    # And different from parrain's
    log("filleule1.referral_code != MAMAN1_CODE",
        f1_user.get("referral_code") != MAMAN1_CODE,
        f"filleule1_code={f1_user.get('referral_code')}")

    # Verify via GET /referral/me (login as filleule)
    r2 = requests.get(f"{BASE}/referral/me", headers=auth_headers(f1_token), timeout=30)
    log("GET /referral/me for filleule1 → 200", r2.status_code == 200, f"status={r2.status_code}")
    if r2.status_code == 200:
        f1_ref = r2.json()
        log("filleule1 has own referral_code via /referral/me",
            f1_ref.get("referral_code") and len(f1_ref.get("referral_code")) == 6,
            f"code={f1_ref.get('referral_code')}")
        log("filleule1 referrals_count=0 initially",
            f1_ref.get("referrals_count") == 0,
            f"count={f1_ref.get('referrals_count')}")
else:
    f1_token = None
    f1_user = {}

# ===== STEP 6: Verify parrain reward =====
print("\n===== STEP 6: Verify parrain reward =====")
r = requests.get(f"{BASE}/referral/me", headers=auth_headers(token_maman), timeout=30)
log("GET /referral/me after 1 filleule → 200", r.status_code == 200)
d = r.json() if r.status_code == 200 else {}
log(f"referrals_count increased by 1 (from {INITIAL_COUNT} to {INITIAL_COUNT+1})",
    d.get("referrals_count") == INITIAL_COUNT + 1,
    f"got={d.get('referrals_count')}")
log(f"days_earned = INITIAL + 7 ({INITIAL_DAYS + 7})",
    d.get("days_earned") == INITIAL_DAYS + 7,
    f"got={d.get('days_earned')}")
filleules_names = [f.get("name") for f in (d.get("filleules") or [])]
log("filleules[] contains 'Filleule Test1'", "Filleule Test1" in filleules_names, f"filleules={filleules_names}")

# Verify premium status via /auth/me
r = requests.get(f"{BASE}/auth/me", headers=auth_headers(token_maman), timeout=30)
log("GET /auth/me → 200", r.status_code == 200)
me = r.json() if r.status_code == 200 else {}
log("user.premium == true", me.get("premium") is True, f"premium={me.get('premium')}")
pu = me.get("premium_until")
if pu:
    try:
        pu_dt = datetime.fromisoformat(pu.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta_days = (pu_dt - now).total_seconds() / 86400.0
        log("premium_until > now + 6 days", delta_days > 6, f"delta_days={delta_days:.2f}")
    except Exception as e:
        log("premium_until parseable", False, f"err={e}")
else:
    log("premium_until present", False, "missing")

# Notifications
r = requests.get(f"{BASE}/notifications", headers=auth_headers(token_maman), timeout=30)
log("GET /notifications → 200", r.status_code == 200)
notifs = r.json() if r.status_code == 200 else []
# Some backends return {items:[]} or []
if isinstance(notifs, dict):
    notifs = notifs.get("items") or notifs.get("notifications") or []
notif_match = [n for n in notifs if ("🤝" in (n.get("title") or "") or "Nouveau parrainage" in (n.get("title") or ""))]
log("Notification '🤝 Nouveau parrainage !' present",
    len(notif_match) >= 1,
    f"count={len(notif_match)} total_notifs={len(notifs)}")
# Body mentions +7
if notif_match:
    last = notif_match[0]
    log("Notification body mentions '+7 jours Premium' or similar",
        "+7" in (last.get("body") or "") or "7 jours" in (last.get("body") or ""),
        f"body={last.get('body')}")

# ===== STEP 7: Multiple referrals — palier 3 =====
print("\n===== STEP 7: Create 2 more filleules (total 3) =====")
for idx, email in enumerate([FILLEULE2_EMAIL, FILLEULE3_EMAIL], start=2):
    payload = {
        "name": f"Filleule Test{idx}",
        "email": email,
        "password": PWD,
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "referral_code": MAMAN1_CODE,
    }
    r = register(payload)
    ok = r.status_code in (200, 201)
    log(f"Register filleule{idx} → 200/201", ok, f"status={r.status_code}")
    if ok:
        created_emails.append(email)

# Fetch after 3rd referral
r = requests.get(f"{BASE}/referral/me", headers=auth_headers(token_maman), timeout=30)
log("GET /referral/me after 3 filleules → 200", r.status_code == 200)
d = r.json() if r.status_code == 200 else {}
log(f"referrals_count = {INITIAL_COUNT + 3}",
    d.get("referrals_count") == INITIAL_COUNT + 3,
    f"got={d.get('referrals_count')}")
# Expected days_earned = INITIAL_DAYS + 7*3 + 30 = INITIAL_DAYS + 51
expected_days = INITIAL_DAYS + 7 * 3 + 30
log(f"days_earned = INITIAL + 51 ({expected_days})",
    d.get("days_earned") == expected_days,
    f"got={d.get('days_earned')}")

# Notification palier
r = requests.get(f"{BASE}/notifications", headers=auth_headers(token_maman), timeout=30)
notifs = r.json() if r.status_code == 200 else []
if isinstance(notifs, dict):
    notifs = notifs.get("items") or notifs.get("notifications") or []
palier_match = [n for n in notifs if "Palier 3 filleules" in (n.get("body") or "") or "Palier 3 filleules" in (n.get("title") or "")]
log("Notification '🎁 Palier 3 filleules : +1 mois bonus !' present (in title or body)",
    len(palier_match) >= 1,
    f"count={len(palier_match)}")

# ===== STEP 8: Error cases =====
print("\n===== STEP 8: Error cases =====")
# 8a: Register with invalid referral_code → user created, referred_by_id null
print("\n----- 8a: Invalid referral_code (ZZZZZZ) -----")
payload_noref = {
    "name": "No Parrain Test",
    "email": NO_PARRAIN_EMAIL,
    "password": PWD,
    "role": "maman",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
    "referral_code": "ZZZZZZ",
}
r = register(payload_noref)
ok = r.status_code in (200, 201)
log("Register with invalid code → success", ok, f"status={r.status_code} body={r.text[:200]}")
if ok:
    created_emails.append(NO_PARRAIN_EMAIL)
    body = r.json()
    user = body.get("user") or {}
    log("referred_by_id is null", user.get("referred_by_id") in (None, ""), f"val={user.get('referred_by_id')}")
    log("referred_by_code is null", user.get("referred_by_code") in (None, ""), f"val={user.get('referred_by_code')}")

# 8b: Register pro with referral_code → ignored
print("\n----- 8b: role=professionnel + referral_code → ignored -----")
payload_pro = {
    "name": "Dr Pro Ref Test",
    "email": PRO_REF_EMAIL,
    "password": PWD,
    "role": "professionnel",
    "specialite": "gynecologue",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
    "referral_code": MAMAN1_CODE,
}
r = register(payload_pro)
ok = r.status_code in (200, 201)
log("Register pro with referral_code → success", ok, f"status={r.status_code} body={r.text[:200]}")
if ok:
    created_emails.append(PRO_REF_EMAIL)
    body = r.json()
    user = body.get("user") or {}
    # Pro should have referred_by_id=null (referral_code only valid for mamans per code L530)
    log("Pro.referred_by_id is null (parrainage ignoré pour role pro)",
        user.get("referred_by_id") in (None, ""),
        f"val={user.get('referred_by_id')}")

# 8c: GET /referral/me with pro role → 403
print("\n----- 8c: GET /referral/me as Pro → 403 -----")
if ok:
    pro_token, _ = login(PRO_REF_EMAIL, PWD)
    if pro_token:
        r = requests.get(f"{BASE}/referral/me", headers=auth_headers(pro_token), timeout=30)
        log("GET /referral/me as Pro → 403", r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")
        msg = ""
        try:
            msg = r.json().get("detail", "")
        except Exception:
            pass
        log("Detail message mentions 'réservé aux mamans'",
            "mamans" in msg.lower(), f"detail={msg}")

# ===== STEP 9: Plans & limits for maman gratuit =====
print("\n===== STEP 9: GET /plans/me as filleule1 (maman gratuit) =====")
if f1_token:
    r = requests.get(f"{BASE}/plans/me", headers=auth_headers(f1_token), timeout=30)
    log("GET /plans/me → 200", r.status_code == 200, f"status={r.status_code}")
    d = r.json() if r.status_code == 200 else {}
    plan = d.get("plan") or {}
    limits = plan.get("limits") or {}
    log("plan.limits.enfants_max == 1", limits.get("enfants_max") == 1, f"val={limits.get('enfants_max')}")
    log("plan.limits.rdv_per_month == 3", limits.get("rdv_per_month") == 3, f"val={limits.get('rdv_per_month')}")
    log("plan.limits.ia_questions_per_month == 5", limits.get("ia_questions_per_month") == 5, f"val={limits.get('ia_questions_per_month')}")
    fl = plan.get("free_limits") or ""
    log("plan.free_limits contains '1 enfant'", "1 enfant" in fl, f"free_limits={fl}")
else:
    log("GET /plans/me skipped (no f1_token)", False, "filleule1 registration failed")

# ===== CLEANUP =====
print("\n===== CLEANUP =====")
# Use super admin to cleanup test accounts via DB or DELETE /auth/me
# Easiest: login as each filleule and DELETE /auth/me
for email in list(created_emails):
    try:
        tok, _ = login(email, PWD)
        if tok:
            r = requests.delete(f"{BASE}/auth/me",
                                headers=auth_headers(tok),
                                json={"password": PWD, "confirmation": "SUPPRIMER"},
                                timeout=30)
            if r.status_code in (200, 204):
                print(f"  ✓ Deleted {email}")
            else:
                print(f"  ! Delete {email} failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"  ! Delete {email} error: {e}")

# Reset maman parrain's counters via direct DB so subsequent tests remain idempotent
# Use MongoDB direct access
try:
    import pymongo
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "alomaman_db")
    # Try to find MONGO_URL from backend .env
    with open("/app/backend/.env") as fh:
        for line in fh:
            if line.startswith("MONGO_URL="):
                mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    cli = pymongo.MongoClient(mongo_url)
    # Use first db if DB_NAME not specified
    db = cli[db_name] if db_name else cli.get_default_database()
    res = db.users.update_one(
        {"email": MAMAN_EMAIL.lower()},
        {"$set": {
            "referrals_count": INITIAL_COUNT,
            "referral_premium_days_earned": INITIAL_DAYS,
            "premium": bool(INITIAL_PREMIUM),
            "premium_until": INITIAL_PREMIUM_UNTIL,
        }},
    )
    print(f"  ✓ Reset maman.test counters (modified={res.modified_count})")
    # Also delete referral_events linked to deleted filleules (best effort: by parrain_id)
    maman_doc = db.users.find_one({"email": MAMAN_EMAIL.lower()}, {"id": 1})
    if maman_doc:
        # only delete events whose filleule_id no longer exists in users
        cursor = db.referral_events.find({"parrain_id": maman_doc["id"]}, {"id": 1, "filleule_id": 1})
        removed = 0
        for ev in cursor:
            if not db.users.find_one({"id": ev.get("filleule_id")}, {"id": 1}):
                db.referral_events.delete_one({"id": ev["id"]})
                removed += 1
        print(f"  ✓ Removed {removed} orphan referral_events")
        # Delete referral notifications for the maman (parrain)
        notif_res = db.notifications.delete_many({"user_id": maman_doc["id"], "type": "referral_reward"})
        print(f"  ✓ Deleted {notif_res.deleted_count} referral notifications")
except Exception as e:
    print(f"  ! Mongo cleanup skipped: {e}")

# ===== SUMMARY =====
print("\n" + "=" * 60)
passed = sum(1 for r in results if r["ok"])
failed = sum(1 for r in results if not r["ok"])
print(f"TOTAL: {passed}/{passed+failed} PASS")
if failed:
    print("\nFAILED TESTS:")
    for r in results:
        if not r["ok"]:
            print(f"  ❌ {r['title']}: {r['detail']}")
print("=" * 60)
sys.exit(0 if failed == 0 else 1)
