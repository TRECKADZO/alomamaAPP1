"""
Backend tests for password management endpoints in À lo Maman.

Endpoints under test:
- POST /api/auth/change-password (authenticated)
- POST /api/auth/forgot-password/request
- POST /api/auth/forgot-password/verify
- POST /api/auth/forgot-password/reset

Run:
    python /app/backend_test_password_mgmt.py
"""
import requests
import time
import uuid

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PASS = "✅"
FAIL = "❌"
results = []


def log(name, ok, detail=""):
    mark = PASS if ok else FAIL
    results.append((name, ok, detail))
    print(f"{mark} {name}{(' — ' + detail) if detail else ''}")


def assert_eq(name, actual, expected, extra=""):
    ok = actual == expected
    log(name, ok, f"expected={expected} got={actual} {extra}".strip())
    return ok


def assert_in(name, needle, haystack, extra=""):
    ok = needle in (haystack or "")
    log(name, ok, f"needle={needle!r} got={haystack!r} {extra}".strip())
    return ok


def register(email, phone, name, password, role="maman"):
    return requests.post(f"{BASE}/auth/register", json={
        "email": email,
        "phone": phone,
        "password": password,
        "name": name,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }, timeout=20)


def delete_user(token, password):
    try:
        r = requests.delete(
            f"{BASE}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": password, "confirmation": "SUPPRIMER"},
            timeout=20,
        )
        return r.status_code == 200
    except Exception:
        return False


# =============================================================================
# TEST 1: POST /api/auth/change-password
# =============================================================================
print("\n========== TEST 1: /auth/change-password ==========")
suffix1 = uuid.uuid4().hex[:8]
email_1 = f"changepwd_{suffix1}@test.alomaman.com"
name_1 = "Mariam Diabaté"
pwd1_old = "OldPass123!"
pwd1_new = "NewPass456!"

r = register(email_1, None, name_1, pwd1_old)
assert_eq("1.0 register user1", r.status_code, 200, r.text[:120])
data_1 = r.json() if r.status_code == 200 else {}
token_1 = data_1.get("token")

# 1a) No auth
r = requests.post(f"{BASE}/auth/change-password", json={
    "old_password": pwd1_old, "new_password": pwd1_new,
}, timeout=15)
log("1a no auth → 401/403", r.status_code in (401, 403), f"got={r.status_code}")

# 1b) Wrong old_password
r = requests.post(f"{BASE}/auth/change-password",
    headers={"Authorization": f"Bearer {token_1}"},
    json={"old_password": "WrongPass!9", "new_password": pwd1_new},
    timeout=15,
)
ok_b = r.status_code == 401
detail_b = ""
try:
    detail_b = (r.json() or {}).get("detail", "")
except Exception:
    detail_b = r.text
log("1b wrong old_password → 401", ok_b, f"got={r.status_code} detail={detail_b!r}")
assert_in("1b detail contient 'incorrect'", "incorrect", detail_b.lower() if isinstance(detail_b, str) else "")

# 1c) old == new → 400
r = requests.post(f"{BASE}/auth/change-password",
    headers={"Authorization": f"Bearer {token_1}"},
    json={"old_password": pwd1_old, "new_password": pwd1_old},
    timeout=15,
)
ok_c = r.status_code == 400
try:
    detail_c = (r.json() or {}).get("detail", "")
except Exception:
    detail_c = r.text
log("1c old==new → 400", ok_c, f"got={r.status_code} detail={detail_c!r}")
assert_in("1c detail contient 'différent'", "différent", detail_c if isinstance(detail_c, str) else "")

# 1d) new_password too short → 422
r = requests.post(f"{BASE}/auth/change-password",
    headers={"Authorization": f"Bearer {token_1}"},
    json={"old_password": pwd1_old, "new_password": "abc"},
    timeout=15,
)
log("1d new_password trop court → 422", r.status_code == 422, f"got={r.status_code}")

# 1e) Valid change
r = requests.post(f"{BASE}/auth/change-password",
    headers={"Authorization": f"Bearer {token_1}"},
    json={"old_password": pwd1_old, "new_password": pwd1_new},
    timeout=15,
)
ok_e = r.status_code == 200
body_e = r.json() if ok_e else {}
log("1e valid change → 200", ok_e, f"got={r.status_code} body={body_e}")
assert_eq("1e response.success=true", body_e.get("success"), True)

# 1f) Login with old password → 401
r = requests.post(f"{BASE}/auth/login",
    json={"email": email_1, "password": pwd1_old}, timeout=15)
log("1f login ancien mot de passe → 401", r.status_code == 401, f"got={r.status_code}")

# 1g) Login with new password → 200 + token
r = requests.post(f"{BASE}/auth/login",
    json={"email": email_1, "password": pwd1_new}, timeout=15)
ok_g = r.status_code == 200
token_1_new = (r.json() or {}).get("token") if ok_g else None
log("1g login nouveau mot de passe → 200", ok_g and bool(token_1_new), f"got={r.status_code}")
if token_1_new:
    token_1 = token_1_new


# =============================================================================
# TEST 2/3/4: Flux forgot-password (request → verify → reset)
# =============================================================================
print("\n========== TEST 2: /auth/forgot-password/request ==========")
suffix2 = uuid.uuid4().hex[:6]
phone_2 = f"+225071122{suffix2[:4]}"  # ensure unique-ish but starts with +225
name_2 = "Aïsha Koné"
pwd2_old = "OldP@ss"
pwd2_new = "ResetPwd789!"
# Email is mandatory unless phone provided; we have phone but better also have email for delete via login afterwards
email_2 = f"forgotpwd_{suffix2}@test.alomaman.com"

r = register(email_2, phone_2, name_2, pwd2_old)
assert_eq("2.0 register user2 (phone+email)", r.status_code, 200, r.text[:200])
data_2 = r.json() if r.status_code == 200 else {}
token_2 = data_2.get("token")

# Wait briefly to ensure DB writes propagate
time.sleep(0.3)

# 2a) Unknown phone → 200 generic
unknown_phone = f"+225999{uuid.uuid4().hex[:7]}"
r = requests.post(f"{BASE}/auth/forgot-password/request",
    json={"phone": unknown_phone, "name": "Inexistant Personne"}, timeout=15)
ok_2a = r.status_code == 200
body_2a = r.json() if ok_2a else {}
log("2a téléphone inconnu → 200 generic", ok_2a, f"got={r.status_code} body={body_2a}")
log("2a NO dev_code dans réponse", "dev_code" not in body_2a, f"body={body_2a}")
assert_in("2a message générique", "Si le compte existe", body_2a.get("message", ""))

# 2b) Known phone, wrong name → 200 generic (security)
r = requests.post(f"{BASE}/auth/forgot-password/request",
    json={"phone": phone_2, "name": "Toto Tata"}, timeout=15)
ok_2b = r.status_code == 200
body_2b = r.json() if ok_2b else {}
log("2b mauvais nom → 200 generic", ok_2b, f"got={r.status_code} body={body_2b}")
log("2b NO dev_code (sécurité)", "dev_code" not in body_2b, f"body={body_2b}")

# 2c) Known phone + correct name (lowercase, no accent) → 200 + dev_code
r = requests.post(f"{BASE}/auth/forgot-password/request",
    json={"phone": phone_2, "name": "aisha kone"}, timeout=15)
ok_2c = r.status_code == 200
body_2c = r.json() if ok_2c else {}
dev_code_main = body_2c.get("dev_code") if ok_2c else None
log("2c bon téléphone+nom (lower/sans accent) → 200", ok_2c, f"got={r.status_code}")
log("2c body contient dev_code (6 chiffres)", bool(dev_code_main and len(dev_code_main) == 6 and dev_code_main.isdigit()),
    f"dev_code={dev_code_main!r}")

# 2d) Known phone + first-name only (with accent)
r = requests.post(f"{BASE}/auth/forgot-password/request",
    json={"phone": phone_2, "name": "Aïsha"}, timeout=15)
ok_2d = r.status_code == 200
body_2d = r.json() if ok_2d else {}
dev_code_2d = body_2d.get("dev_code") if ok_2d else None
log("2d prénom seul → 200 + dev_code", ok_2d and bool(dev_code_2d), f"got={r.status_code} dev_code={dev_code_2d!r}")

# 2e) Anti-bruteforce: continue calling. We've already created 2 codes (2c, 2d).
# Limit is >=5 in last hour → 429. Make 4 more = 6 total to trigger.
# IMPORTANT: keep updating latest_dev_code from every successful request so that
# the verify step (test 3) uses the most recent unused code (the only one find_one will
# match against).
got_429 = False
attempt_results = []
latest_dev_code_running = dev_code_2d or dev_code_main  # current latest
for i in range(1, 5):  # 4 more calls = 6 total
    r = requests.post(f"{BASE}/auth/forgot-password/request",
        json={"phone": phone_2, "name": "Aïsha Koné"}, timeout=15)
    attempt_results.append(r.status_code)
    if r.status_code == 200:
        try:
            dc = (r.json() or {}).get("dev_code")
            if dc:
                latest_dev_code_running = dc
        except Exception:
            pass
    if r.status_code == 429:
        got_429 = True
        try:
            d = (r.json() or {}).get("detail", "")
        except Exception:
            d = r.text
        log(f"2e {i+2}e appel → 429 'Trop de demandes'", True, f"detail={d!r}")
        break
log("2e 429 obtenu sur ≤6 appels", got_429, f"statuses={attempt_results}")
print(f"  → latest dev_code after 2e: {latest_dev_code_running!r}")


# =============================================================================
# TEST 3: /auth/forgot-password/verify
# =============================================================================
print("\n========== TEST 3: /auth/forgot-password/verify ==========")
# The verify endpoint always uses the MOST RECENT unused code for that phone.
# We've made several requests in test 2 — the latest dev_code is the one matching
# the most recent code in DB.
latest_dev_code = latest_dev_code_running
print(f"  → using dev_code captured from most recent successful request: {latest_dev_code!r}")

# 3a) Wrong code 999999 → 400 "Code incorrect"
r = requests.post(f"{BASE}/auth/forgot-password/verify",
    json={"phone": phone_2, "code": "999999"}, timeout=15)
ok_3a = r.status_code == 400
try:
    detail_3a = (r.json() or {}).get("detail", "")
except Exception:
    detail_3a = r.text
# Caveat: if our wrong guess equals the actual most-recent code (1/1M), it would succeed.
# Should not happen practically.
log("3a mauvais code → 400 'Code incorrect'", ok_3a, f"got={r.status_code} detail={detail_3a!r}")
assert_in("3a detail contient 'incorrect'", "incorrect", (detail_3a or "").lower())

# 3b) Correct code → 200 with reset_token
r = requests.post(f"{BASE}/auth/forgot-password/verify",
    json={"phone": phone_2, "code": latest_dev_code}, timeout=15)
ok_3b = r.status_code == 200
body_3b = r.json() if ok_3b else {}
reset_token = body_3b.get("reset_token") if ok_3b else None
log("3b bon code → 200 + reset_token", ok_3b and bool(reset_token), f"got={r.status_code} body={body_3b}")
log("3b reset_token UUID-like (>20 chars)", bool(reset_token and len(reset_token) >= 20), f"reset_token={reset_token!r}")

# 3c) Reuse same code after success
# After 3b that code is marked used. find_one then picks the next-most-recent unused
# code (from earlier requests). Submitting the same code value will not match its hash.
# Expect: 400 (Code incorrect on different record, OR "Aucune demande" if it's the only code).
r = requests.post(f"{BASE}/auth/forgot-password/verify",
    json={"phone": phone_2, "code": latest_dev_code}, timeout=15)
ok_3c = r.status_code == 400
try:
    detail_3c = (r.json() or {}).get("detail", "")
except Exception:
    detail_3c = r.text
log("3c réutilisation du code → 400", ok_3c, f"got={r.status_code} detail={detail_3c!r}")

# 3d) After 5 failed attempts → code invalidated, 6th → "Trop d'essais"
# We're now hitting the next-most-recent unused code. Each wrong attempt increments
# its `attempts`. After the wrong submission in 3c, attempts=1 on it. So 4 more
# wrong → attempts=5; the 5th submission still returns "Code incorrect" (incrementing
# to 5 inside if-block); then 6th submission → "Trop d'essais incorrects".
# Total wrong calls including 3c: need to reach 6 wrong calls overall.
trop_essais_seen = False
trop_msg = ""
for i in range(1, 7):  # up to 6 more wrong attempts
    r = requests.post(f"{BASE}/auth/forgot-password/verify",
        json={"phone": phone_2, "code": "111111"}, timeout=15)
    if r.status_code == 400:
        try:
            d = (r.json() or {}).get("detail", "")
        except Exception:
            d = r.text
        if "essais" in (d or "").lower() or "trop" in (d or "").lower():
            trop_essais_seen = True
            trop_msg = d
            print(f"  → after {i} more wrong attempts: 400 '{d}'")
            break
        else:
            print(f"  attempt {i}: 400 detail={d!r}")
    else:
        print(f"  attempt {i}: status={r.status_code}")
        break
log("3d invalidation après 5 essais → 'Trop d'essais'", trop_essais_seen, f"msg={trop_msg!r}")

# 3e) Non-existent phone → 400 "Aucune demande en cours"
ne_phone = f"+225888{uuid.uuid4().hex[:7]}"
r = requests.post(f"{BASE}/auth/forgot-password/verify",
    json={"phone": ne_phone, "code": "123456"}, timeout=15)
ok_3e = r.status_code == 400
try:
    detail_3e = (r.json() or {}).get("detail", "")
except Exception:
    detail_3e = r.text
log("3e téléphone inexistant → 400", ok_3e, f"got={r.status_code} detail={detail_3e!r}")
assert_in("3e detail contient 'Aucune demande'", "Aucune demande", detail_3e if isinstance(detail_3e, str) else "")


# =============================================================================
# TEST 4: /auth/forgot-password/reset
# =============================================================================
print("\n========== TEST 4: /auth/forgot-password/reset ==========")

# 4a) Wrong/random reset_token → 400 "Lien invalide"
r = requests.post(f"{BASE}/auth/forgot-password/reset",
    json={"reset_token": str(uuid.uuid4()), "new_password": pwd2_new}, timeout=15)
ok_4a = r.status_code == 400
try:
    detail_4a = (r.json() or {}).get("detail", "")
except Exception:
    detail_4a = r.text
log("4a token aléatoire → 400 'Lien invalide'", ok_4a, f"got={r.status_code} detail={detail_4a!r}")
assert_in("4a detail contient 'Lien invalide'", "Lien invalide", detail_4a if isinstance(detail_4a, str) else "")

# 4b) new_password too short → 422
r = requests.post(f"{BASE}/auth/forgot-password/reset",
    json={"reset_token": reset_token or "x", "new_password": "abc"}, timeout=15)
log("4b new_password trop court → 422", r.status_code == 422, f"got={r.status_code}")

# 4c) Valid reset
r = requests.post(f"{BASE}/auth/forgot-password/reset",
    json={"reset_token": reset_token, "new_password": pwd2_new}, timeout=15)
ok_4c = r.status_code == 200
body_4c = r.json() if ok_4c else {}
log("4c reset valide → 200", ok_4c, f"got={r.status_code} body={body_4c}")
assert_eq("4c response.success=true", body_4c.get("success"), True)

# 4d) Reuse same reset_token → 400 "déjà utilisé" or "Lien invalide"
r = requests.post(f"{BASE}/auth/forgot-password/reset",
    json={"reset_token": reset_token, "new_password": "AnotherPwd987!"}, timeout=15)
ok_4d = r.status_code == 400
try:
    detail_4d = (r.json() or {}).get("detail", "")
except Exception:
    detail_4d = r.text
log("4d réutilisation du token → 400", ok_4d, f"got={r.status_code} detail={detail_4d!r}")
# The endpoint queries find_one({"token", "used": False}) — after success, used=true, so
# the endpoint returns "Lien invalide ou déjà utilisé". Accept either substring.
log("4d detail mentionne 'déjà' ou 'Lien invalide'",
    ("déjà" in (detail_4d or "")) or ("Lien invalide" in (detail_4d or "")),
    f"detail={detail_4d!r}")

# 4e) Login old password → 401
r = requests.post(f"{BASE}/auth/login",
    json={"email": email_2, "password": pwd2_old}, timeout=15)
log("4e login ancien mot de passe → 401", r.status_code == 401, f"got={r.status_code}")

# 4f) Login new password → 200 + token
r = requests.post(f"{BASE}/auth/login",
    json={"email": email_2, "password": pwd2_new}, timeout=15)
ok_4f = r.status_code == 200
token_2_new = (r.json() or {}).get("token") if ok_4f else None
log("4f login nouveau mot de passe → 200 + token", ok_4f and bool(token_2_new), f"got={r.status_code}")
if token_2_new:
    token_2 = token_2_new

# 4g) Old reset codes invalidated: try verify with another code → fail
# All unused codes for user2 should now be marked used. Verify any code → "Aucune demande en cours".
r = requests.post(f"{BASE}/auth/forgot-password/verify",
    json={"phone": phone_2, "code": "000000"}, timeout=15)
ok_4g = r.status_code == 400
try:
    detail_4g = (r.json() or {}).get("detail", "")
except Exception:
    detail_4g = r.text
log("4g anciens codes invalidés → 400", ok_4g, f"got={r.status_code} detail={detail_4g!r}")
assert_in("4g detail contient 'Aucune demande'", "Aucune demande", detail_4g if isinstance(detail_4g, str) else "")


# =============================================================================
# CLEANUP
# =============================================================================
print("\n========== CLEANUP ==========")
ok_del1 = delete_user(token_1, pwd1_new)
log("cleanup user1 supprimé", ok_del1)
ok_del2 = delete_user(token_2, pwd2_new)
log("cleanup user2 supprimé", ok_del2)


# =============================================================================
# SUMMARY
# =============================================================================
print("\n========== RÉSULTATS ==========")
n_pass = sum(1 for _, ok, _ in results if ok)
n_total = len(results)
print(f"{n_pass}/{n_total} PASS")
if n_pass < n_total:
    print("\nFailures:")
    for name, ok, detail in results:
        if not ok:
            print(f"  ❌ {name}: {detail}")
