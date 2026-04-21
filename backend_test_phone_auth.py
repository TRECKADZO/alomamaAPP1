#!/usr/bin/env python3
"""Phone auth tests for À lo Maman backend.

Tests: register/login by phone, by email, with both, error cases, duplicates.
"""
import os
import sys
import time
import requests

BASE = os.environ.get("BACKEND_URL", "http://localhost:8001/api")

# Unique suffix per run so re-running is idempotent regarding emails.
SUFFIX = str(int(time.time()))[-6:]

PASS = 0
FAIL = 0
failures = []


def check(name, cond, info=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"[PASS] {name}")
    else:
        FAIL += 1
        failures.append((name, info))
        print(f"[FAIL] {name} :: {info}")


def post(path, json_body):
    r = requests.post(BASE + path, json=json_body, timeout=15)
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    return r.status_code, data


# ---------------- 1. Register phone only ----------------
# Use a phone we can reliably identify. To avoid collisions with prior test runs,
# inject SUFFIX digits into the last block.
# Review spec: "+225 07 08 09 10 11" -> normalized "+22507080910" (per review text;
# note: actual normalization keeps ALL digits, so we just report the normalized value).
phone_raw_1 = f"+225 07 08 09 {SUFFIX[:2]} {SUFFIX[2:4]}"
status, data = post("/auth/register", {
    "phone": phone_raw_1,
    "password": "Test123!",
    "name": "Mama Test Phone",
    "role": "maman",
})
check("1. Register phone-only returns 200", status == 200, f"status={status} data={data}")
token_1 = data.get("token") if isinstance(data, dict) else None
user_1 = data.get("user") if isinstance(data, dict) else None
check("1. Register phone-only returns token", bool(token_1))
check("1. Register phone-only returns user", bool(user_1))
normalized_phone_1 = user_1.get("phone") if user_1 else None
check(
    "1. user.phone has no spaces",
    normalized_phone_1 is not None and " " not in normalized_phone_1,
    f"phone={normalized_phone_1!r}",
)
check(
    "1. user.phone starts with +225",
    normalized_phone_1 is not None and normalized_phone_1.startswith("+225"),
    f"phone={normalized_phone_1!r}",
)
# Also check the review-claimed exact format "+22507080910..." (digits only after +)
import re as _re
digits_only_ok = bool(normalized_phone_1 and _re.fullmatch(r"\+\d+", normalized_phone_1))
check(
    "1. user.phone contains only '+' and digits",
    digits_only_ok,
    f"phone={normalized_phone_1!r}",
)
print(f"   -> normalized phone registered = {normalized_phone_1!r}")


# ---------------- 2. Register email only ----------------
email_2 = f"phonetest2_{SUFFIX}@test.com"
status, data = post("/auth/register", {
    "email": email_2,
    "password": "Test123!",
    "name": "Email Test",
    "role": "famille",
})
check("2. Register email-only returns 200", status == 200, f"status={status} data={data}")
check(
    "2. Register email-only returns token+user",
    isinstance(data, dict) and data.get("token") and data.get("user"),
)
if isinstance(data, dict) and data.get("user"):
    check(
        "2. Register email-only user.email is set",
        data["user"].get("email") == email_2,
        f"email={data['user'].get('email')!r}",
    )
    check(
        "2. Register email-only role=famille",
        data["user"].get("role") == "famille",
    )


# ---------------- 3. Register email AND phone ----------------
email_3 = f"both_{SUFFIX}@test.com"
phone_3 = f"+225080910{SUFFIX[:2]}"  # unique-ish
status, data = post("/auth/register", {
    "email": email_3,
    "phone": phone_3,
    "password": "Test123!",
    "name": "Both",
    "role": "professionnel",
})
check("3. Register email+phone returns 200", status == 200, f"status={status} data={data}")
if isinstance(data, dict) and data.get("user"):
    u = data["user"]
    check("3. user.email == submitted email", u.get("email") == email_3, f"got={u.get('email')!r}")
    check("3. user.phone is normalized (no spaces)", u.get("phone") and " " not in u["phone"], f"got={u.get('phone')!r}")
    check("3. user.role == professionnel", u.get("role") == "professionnel")


# ---------------- 4. Register with neither email nor phone ----------------
status, data = post("/auth/register", {
    "password": "Test123!",
    "name": "NoId",
    "role": "maman",
})
check("4. Register without email+phone returns 400", status == 400, f"status={status} data={data}")
detail_4 = (data.get("detail") if isinstance(data, dict) else "") or ""
check(
    "4. Error message is 'Email ou téléphone requis'",
    "Email ou t" in detail_4 and "requis" in detail_4.lower(),
    f"detail={detail_4!r}",
)


# ---------------- 5. Login by phone ----------------
status, data = post("/auth/login", {
    "phone": normalized_phone_1,
    "password": "Test123!",
})
check("5. Login by phone returns 200", status == 200, f"status={status} data={data}")
check(
    "5. Login by phone returns token+user",
    isinstance(data, dict) and data.get("token") and data.get("user"),
)
if isinstance(data, dict) and data.get("user"):
    check(
        "5. Login by phone returns same user (id match)",
        data["user"].get("id") == (user_1 or {}).get("id"),
    )


# ---------------- 6. Login with poorly-formatted phone (spaces) ----------------
# Reconstruct the raw input with spaces — same phone as registered in step 1
status, data = post("/auth/login", {
    "phone": phone_raw_1,  # original with spaces
    "password": "Test123!",
})
check("6. Login by spaced phone returns 200", status == 200, f"status={status} data={data}")
if isinstance(data, dict) and data.get("user"):
    check(
        "6. Login by spaced phone → same user",
        data["user"].get("id") == (user_1 or {}).get("id"),
    )


# ---------------- 7. Login by email (regression, seeded account) ----------------
status, data = post("/auth/login", {
    "email": "maman@test.com",
    "password": "Maman123!",
})
check("7. Login seeded maman@test.com returns 200", status == 200, f"status={status} data={data}")
check(
    "7. Login by email returns token+user",
    isinstance(data, dict) and data.get("token") and data.get("user"),
)


# ---------------- 8. Duplicate phone ----------------
status, data = post("/auth/register", {
    "phone": phone_raw_1,  # already registered in step 1
    "password": "Test123!",
    "name": "Duplicate",
    "role": "maman",
})
check("8. Duplicate phone returns 400", status == 400, f"status={status} data={data}")
detail_8 = (data.get("detail") if isinstance(data, dict) else "") or ""
check(
    "8. Error message is 'Ce numéro est déjà utilisé'",
    "déjà utilis" in detail_8 or "deja utilis" in detail_8.lower(),
    f"detail={detail_8!r}",
)


# ---------------- 9. Login wrong password (phone) ----------------
status, data = post("/auth/login", {
    "phone": normalized_phone_1,
    "password": "wrong",
})
check("9. Login wrong password returns 401", status == 401, f"status={status} data={data}")


# ---------------- Summary ----------------
print()
print("=" * 60)
print(f"TOTAL: {PASS + FAIL}  PASS: {PASS}  FAIL: {FAIL}")
if failures:
    print("\nFailures:")
    for n, info in failures:
        print(f"  - {n} :: {info}")

sys.exit(0 if FAIL == 0 else 1)
