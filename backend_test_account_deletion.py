"""
Backend test for DELETE /api/auth/me — GDPR / Google Play account deletion.

Scenarios:
1) Pre-setup: register a fresh maman + seed grossesse, grossesse_tracking, enfants, reminders.
2) DELETE without auth → 401/403
3) DELETE auth, missing body → 422
4) DELETE confirmation="autre chose" → 400
5) DELETE confirmation="SUPPRIMER", wrong password → 401
6) DELETE confirmation="SUPPRIMER", correct password → 200, deleted_collections has grossesses, grossesse_tracking, enfants ≥1
7) Token reuse → 401; login same email → 401; data gone (verified by logging in fresh user, but main verification: no doc remains via direct mongo lookup).
8) Super admin protection → 403
9) Anonymization of payments — insert fake payment before deletion, verify anonymized=true, user_email=None.
"""
import os
import sys
import uuid
import json
import time
import requests
from datetime import datetime, timezone

BACKEND = "https://cycle-tracker-pro.preview.emergentagent.com/api"

# Mongo direct (for verification + payment seed)
import certifi
from pymongo import MongoClient
mongo_url = "mongodb+srv://boidigsproplus_db_user:oPMDOqgDvGPgusG2@cluster0.5oe7rzd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
mc = MongoClient(mongo_url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=20000)
db = mc["alomaman"]


PASS = []
FAIL = []


def ok(name, cond, detail=""):
    if cond:
        PASS.append(name)
        print(f"  ✅ {name}")
    else:
        FAIL.append((name, detail))
        print(f"  ❌ {name} — {detail}")


def step(title):
    print(f"\n=== {title} ===")


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------------------------- PRE-SETUP --------------------------
step("1) Pre-setup: register fresh maman + seed data")
suffix = uuid.uuid4().hex[:8]
email = f"gdpr_maman_{suffix}@test.alomaman.com"
password = "GdprTest123!"
name = "Awa Konaté"

reg_payload = {
    "email": email,
    "password": password,
    "name": name,
    "role": "maman",
    "accepte_cgu": True,
    "accepte_politique_confidentialite": True,
    "accepte_donnees_sante": True,
    "accepte_communications": False,
}
r = requests.post(f"{BACKEND}/auth/register", json=reg_payload, timeout=30)
ok("register fresh maman", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
data = r.json()
token = data["token"]
user_id = data["user"]["id"]
print(f"  user_id={user_id}")

# Seed grossesse
r = requests.post(f"{BACKEND}/grossesse", headers=H(token), json={"date_debut": "2026-01-01"})
ok("seed grossesse", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
grossesse_id = r.json().get("id") if r.status_code == 200 else None

# Seed grossesse_tracking
r = requests.post(
    f"{BACKEND}/grossesse/tracking",
    headers=H(token),
    json={"type": "poids", "date": "2026-04-25", "value": 65.0},
)
ok("seed grossesse_tracking", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
tracking_id = r.json().get("id") if r.status_code == 200 else None

# Seed enfant
r = requests.post(
    f"{BACKEND}/enfants",
    headers=H(token),
    json={"prenom": "Test Enfant", "nom": "Test Enfant", "date_naissance": "2025-01-01", "sexe": "F"},
)
ok("seed enfant", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
enfant_id = r.json().get("id") if r.status_code == 200 else None

# Seed reminder (proxy for "preferences" — there's no /notifications/preferences endpoint)
r = requests.post(
    f"{BACKEND}/reminders",
    headers=H(token),
    json={"title": "Préférence test", "due_at": "2026-12-01T10:00:00Z"},
)
ok("seed reminder", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

# Insert a fake payment for anonymization test
fake_payment = {
    "id": str(uuid.uuid4()),
    "user_id": user_id,
    "amount": 1000,
    "status": "completed",
    "kind": "consultation",
    "user_email": email,
    "created_at": datetime.now(timezone.utc).isoformat(),
}
db.payments.insert_one(fake_payment)
fake_payment_id = fake_payment["id"]
print(f"  inserted fake payment id={fake_payment_id}")

# Verify seed data present in DB
g_count = db.grossesses.count_documents({"user_id": user_id})
t_count = db.grossesse_tracking.count_documents({"user_id": user_id})
e_count = db.enfants.count_documents({"user_id": user_id})
print(f"  pre-delete: grossesses={g_count} grossesse_tracking={t_count} enfants={e_count}")
ok("pre-delete grossesses ≥ 1", g_count >= 1, f"got {g_count}")
ok("pre-delete grossesse_tracking ≥ 1", t_count >= 1, f"got {t_count}")
ok("pre-delete enfants ≥ 1", e_count >= 1, f"got {e_count}")


# -------------------------- 2) DELETE without auth --------------------------
step("2) DELETE /auth/me without auth → 401/403")
r = requests.delete(
    f"{BACKEND}/auth/me",
    json={"password": password, "confirmation": "SUPPRIMER"},
    timeout=30,
)
ok("no-auth DELETE returns 401/403", r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}")


# -------------------------- 3) Missing body --------------------------
step("3) DELETE with auth but missing body → 422")
r = requests.delete(f"{BACKEND}/auth/me", headers=H(token), timeout=30)
ok("missing body → 422", r.status_code == 422, f"{r.status_code} {r.text[:200]}")


# -------------------------- 4) Wrong confirmation --------------------------
step("4) DELETE confirmation='autre chose' → 400")
r = requests.delete(
    f"{BACKEND}/auth/me",
    headers=H(token),
    json={"password": password, "confirmation": "autre chose"},
    timeout=30,
)
ok("bad confirmation → 400", r.status_code == 400, f"{r.status_code} {r.text[:200]}")
detail = (r.json() or {}).get("detail", "") if r.headers.get("content-type", "").startswith("application/json") else ""
ok("400 detail mentions SUPPRIMER", "SUPPRIMER" in str(detail), f"detail={detail}")


# -------------------------- 5) Wrong password --------------------------
step("5) DELETE confirmation='SUPPRIMER', wrong password → 401")
r = requests.delete(
    f"{BACKEND}/auth/me",
    headers=H(token),
    json={"password": "WrongPass!2026", "confirmation": "SUPPRIMER"},
    timeout=30,
)
ok("wrong password → 401", r.status_code == 401, f"{r.status_code} {r.text[:200]}")
detail = (r.json() or {}).get("detail", "") if r.headers.get("content-type", "").startswith("application/json") else ""
ok("401 detail mentions Mot de passe", "Mot de passe" in str(detail), f"detail={detail}")


# -------------------------- 6) Successful deletion --------------------------
step("6) DELETE correct password + SUPPRIMER → 200")
r = requests.delete(
    f"{BACKEND}/auth/me",
    headers=H(token),
    json={"password": password, "confirmation": "SUPPRIMER"},
    timeout=60,
)
ok("delete success status=200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
body = r.json() if r.status_code == 200 else {}
ok("response.success == true", body.get("success") is True, f"{body}")
ok("response has message", isinstance(body.get("message"), str) and len(body.get("message", "")) > 0)
deleted = body.get("deleted_collections", {})
ok("deleted_collections is dict", isinstance(deleted, dict), f"{deleted}")
ok("deleted_collections has grossesses ≥ 1", deleted.get("grossesses", 0) >= 1, f"deleted={deleted}")
ok(
    "deleted_collections has grossesse_tracking ≥ 1",
    deleted.get("grossesse_tracking", 0) >= 1,
    f"deleted={deleted}",
)
ok("deleted_collections has enfants ≥ 1", deleted.get("enfants", 0) >= 1, f"deleted={deleted}")
print(f"  deleted_collections = {deleted}")


# -------------------------- 7) Verify gone --------------------------
step("7) Verify user/data is GONE")
# 7a) /auth/me with old token → user introuvable → 401
r = requests.get(f"{BACKEND}/auth/me", headers=H(token), timeout=30)
ok("GET /auth/me with old token → 401/403", r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}")

# 7b) login same email/password → 401
r = requests.post(f"{BACKEND}/auth/login", json={"email": email, "password": password})
ok("login deleted user → 401/404", r.status_code in (401, 404), f"{r.status_code} {r.text[:200]}")

# 7c) Direct Mongo verification
ok(
    "users collection: user gone",
    db.users.count_documents({"id": user_id}) == 0,
    f"still present",
)
ok(
    "grossesses: deleted",
    db.grossesses.count_documents({"user_id": user_id}) == 0,
)
ok(
    "grossesse_tracking: deleted",
    db.grossesse_tracking.count_documents({"user_id": user_id}) == 0,
)
ok(
    "enfants: deleted",
    db.enfants.count_documents({"user_id": user_id}) == 0,
)
ok(
    "reminders: deleted",
    db.reminders.count_documents({"user_id": user_id}) == 0,
)


# -------------------------- 9) Anonymized payment --------------------------
step("9) Verify payments anonymized")
pay = db.payments.find_one({"id": fake_payment_id})
ok("payment doc still exists", pay is not None, "missing")
if pay:
    print(f"  payment doc keys: anonymized={pay.get('anonymized')} user_email={pay.get('user_email')} user_id={pay.get('user_id')}")
    ok("payment.anonymized == True", pay.get("anonymized") is True, f"got {pay.get('anonymized')}")
    ok("payment.user_email is None", pay.get("user_email") is None, f"got {pay.get('user_email')}")
    ok(
        "payment.user_id replaced (≠ original)",
        pay.get("user_id") != user_id,
        f"got {pay.get('user_id')}",
    )

# Cleanup the anonymized payment
db.payments.delete_one({"id": fake_payment_id})


# -------------------------- 8) Super admin protection --------------------------
step("8) Super admin cannot self-delete via API")
admin_email = "klenakan.eric@gmail.com"
admin_password = "474Treckadzo$1986"
r = requests.post(f"{BACKEND}/auth/login", json={"email": admin_email, "password": admin_password})
ok("super admin login", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
admin_token = r.json().get("token") if r.status_code == 200 else None

if admin_token:
    r = requests.delete(
        f"{BACKEND}/auth/me",
        headers=H(admin_token),
        json={"password": admin_password, "confirmation": "SUPPRIMER"},
        timeout=30,
    )
    ok("super admin DELETE /auth/me → 403", r.status_code == 403, f"{r.status_code} {r.text[:200]}")
    detail = (r.json() or {}).get("detail", "") if r.headers.get("content-type", "").startswith("application/json") else ""
    ok(
        "403 message mentions super administrateur",
        "super administrateur" in str(detail),
        f"detail={detail}",
    )
    # Verify super admin still exists
    still = db.users.find_one({"email": admin_email})
    ok("super admin user still exists in DB", still is not None, "MISSING — CRITICAL")
    if still:
        ok(
            "super admin still flagged is_super_admin",
            still.get("is_super_admin") is True,
            f"flag={still.get('is_super_admin')}",
        )

# -------------------------- Summary --------------------------
print("\n" + "=" * 70)
print(f"PASS: {len(PASS)}")
print(f"FAIL: {len(FAIL)}")
if FAIL:
    print("\nFailures:")
    for n, d in FAIL:
        print(f"  - {n}: {d}")
sys.exit(0 if not FAIL else 1)
