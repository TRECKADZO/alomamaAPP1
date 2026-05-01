"""
Test push notification debug & test endpoints on À lo Maman backend.
Endpoints tested:
  - GET /api/push-token/me
  - POST /api/push-token
  - POST /api/push-token/test
  - Backwards compat : push_notif() via RDV creation
"""
import os
import time
import subprocess
import httpx
from datetime import datetime, timedelta, timezone

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}
FAKE_TOKEN = "ExponentPushToken[ABC123FAKE_TOKEN_XYZ]"

PASS = 0
FAIL = 0
FAILS = []


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILS.append(f"{label} :: {detail}")
        print(f"  ❌ {label} :: {detail}")


def login(creds):
    r = httpx.post(f"{BASE}/auth/login", json=creds, timeout=30.0)
    r.raise_for_status()
    return r.json()["token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("=" * 70)
    print("PUSH NOTIFICATION DEBUG ENDPOINTS TEST SUITE")
    print("=" * 70)

    # --- Login maman ---
    print("\n[1] Login maman…")
    tok_maman = login(MAMAN)
    check("Maman login OK", bool(tok_maman))

    # --- 1. GET /push-token/me (initial) ---
    print("\n[2] GET /push-token/me (état initial)")
    r = httpx.get(f"{BASE}/push-token/me", headers=auth(tok_maman), timeout=30.0)
    check("GET /push-token/me returns 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    check("Response has user_id", "user_id" in body, str(body))
    check("Response has has_token", "has_token" in body, str(body))
    check("Response has token_preview", "token_preview" in body, str(body))
    initial_has = body.get("has_token", False)
    print(f"    → user_id={body.get('user_id')}, has_token={initial_has}, token_preview={body.get('token_preview')}")

    # --- 2. POST /push-token ---
    print("\n[3] POST /push-token (register fake token)")
    r = httpx.post(f"{BASE}/push-token", json={"token": FAKE_TOKEN}, headers=auth(tok_maman), timeout=30.0)
    check("POST /push-token returns 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    check("POST /push-token response {ok:true}", body.get("ok") is True, str(body))

    # --- 3. GET /push-token/me (after register) ---
    print("\n[4] GET /push-token/me after register")
    r = httpx.get(f"{BASE}/push-token/me", headers=auth(tok_maman), timeout=30.0)
    check("GET /push-token/me returns 200", r.status_code == 200)
    body = r.json() if r.status_code == 200 else {}
    check("has_token == true after register", body.get("has_token") is True, str(body))
    preview = body.get("token_preview") or ""
    expected_prefix = "ExponentPushToken[ABC123FAKE_TOKEN_X"
    check(
        f"token_preview starts with '{expected_prefix}'",
        preview.startswith(expected_prefix),
        f"got preview={preview!r}",
    )

    # --- 4. POST /push-token/test ---
    print("\n[5] POST /push-token/test (fake token → will fail at Expo)")
    # grab log offset right before so we can scan after
    try:
        log_size_before = os.path.getsize("/var/log/supervisor/backend.out.log")
    except Exception:
        log_size_before = 0
    r = httpx.post(f"{BASE}/push-token/test", headers=auth(tok_maman), timeout=30.0)
    check("POST /push-token/test returns 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    check("test response {ok:true}", body.get("ok") is True, str(body))
    sent_to = body.get("sent_to", "")
    check(
        "sent_to starts with 'ExponentPushToken['",
        sent_to.startswith("ExponentPushToken["),
        f"got sent_to={sent_to!r}",
    )

    # Give time for Expo push call + DB cleanup
    time.sleep(3)

    # --- Check backend logs ---
    print("\n[6] Backend logs (send_expo_push response)")
    try:
        result = subprocess.run(
            ["tail", "-n", "300", "/var/log/supervisor/backend.out.log"],
            capture_output=True, text=True, timeout=5,
        )
        log_recent = result.stdout + "\n" + subprocess.run(
            ["tail", "-n", "300", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception as e:
        log_recent = ""
        print(f"    (could not read logs: {e})")

    has_ok = "✅ Expo push OK" in log_recent
    has_err = "⚠️  Expo push ERROR" in log_recent or "⚠️ Expo push ERROR" in log_recent
    check(
        "Backend logged either '✅ Expo push OK' OR '⚠️ Expo push ERROR'",
        has_ok or has_err,
        f"neither marker found in recent logs (ok={has_ok}, err={has_err})",
    )
    has_dnr = "DeviceNotRegistered" in log_recent
    if has_dnr:
        print("    → Detected DeviceNotRegistered in logs → token should have been auto-cleared")

    # --- 5. GET /push-token/me (token should be cleared if DNR) ---
    print("\n[7] GET /push-token/me after test (expect has_token=false if DNR)")
    r = httpx.get(f"{BASE}/push-token/me", headers=auth(tok_maman), timeout=30.0)
    check("GET /push-token/me returns 200", r.status_code == 200)
    body = r.json() if r.status_code == 200 else {}
    if has_dnr:
        check(
            "Token auto-cleared after DeviceNotRegistered (has_token=false)",
            body.get("has_token") is False,
            f"has_token={body.get('has_token')} token_preview={body.get('token_preview')}",
        )
    else:
        # If Expo didn't report DNR, token may still be registered — report but don't fail
        print(f"    (Expo did not report DeviceNotRegistered; has_token={body.get('has_token')})")

    # --- 6. Edge case: POST /push-token/test without token ---
    print("\n[8] Edge case: POST /push-token/test without registered token")
    # Create fresh user to guarantee no token
    fresh_email = f"push_test_{int(time.time())}@test.alomaman.dev"
    reg_body = {
        "email": fresh_email,
        "password": "TestPush123!",
        "name": "Push Test User",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = httpx.post(f"{BASE}/auth/register", json=reg_body, timeout=30.0)
    if r.status_code != 200:
        print(f"    (could not register fresh user: {r.status_code} {r.text[:200]})")
        tok_fresh = None
    else:
        tok_fresh = r.json()["token"]
    if tok_fresh:
        # Ensure no token
        g = httpx.get(f"{BASE}/push-token/me", headers=auth(tok_fresh), timeout=30.0).json()
        check("Fresh user has no push token", g.get("has_token") is False, str(g))

        r = httpx.post(f"{BASE}/push-token/test", headers=auth(tok_fresh), timeout=30.0)
        check(
            "POST /push-token/test returns 400 for user with no token",
            r.status_code == 400,
            f"got {r.status_code} {r.text[:200]}",
        )
        msg = ""
        try:
            msg = r.json().get("detail", "")
        except Exception:
            pass
        check(
            "400 detail contains 'Aucun token push enregistré'",
            "Aucun token push enregistré" in msg,
            f"detail={msg!r}",
        )

        # Cleanup fresh user
        try:
            httpx.request(
                "DELETE", f"{BASE}/auth/me",
                headers=auth(tok_fresh),
                json={"password": "TestPush123!", "confirmation": "SUPPRIMER"},
                timeout=30.0,
            )
        except Exception:
            pass

    # --- 7. Regression : push_notif() helper via RDV creation ---
    print("\n[9] Regression: creating a RDV should create an in-app notification for the pro")
    # Login pro to get their id
    tok_pro = login(PRO)
    me_pro = httpx.get(f"{BASE}/auth/me", headers=auth(tok_pro), timeout=30.0).json()
    pro_id = me_pro.get("id")
    check("Pro user id retrieved", bool(pro_id))

    # Count pro notifications before
    notifs_before = httpx.get(f"{BASE}/notifications", headers=auth(tok_pro), timeout=30.0)
    count_before = len(notifs_before.json()) if notifs_before.status_code == 200 else 0

    # Maman creates RDV with pro
    future_date = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    r = httpx.post(
        f"{BASE}/rdv",
        json={"pro_id": pro_id, "date": future_date, "motif": "Test notif push", "tarif_fcfa": 5000},
        headers=auth(tok_maman),
        timeout=30.0,
    )
    check("POST /rdv returns 200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    rdv_id = r.json().get("id") if r.status_code == 200 else None

    time.sleep(1)
    notifs_after = httpx.get(f"{BASE}/notifications", headers=auth(tok_pro), timeout=30.0)
    count_after = len(notifs_after.json()) if notifs_after.status_code == 200 else 0
    check(
        f"Pro notifications count grew ({count_before} → {count_after})",
        count_after > count_before,
        f"before={count_before} after={count_after}",
    )

    # Cleanup: delete the RDV
    if rdv_id:
        try:
            httpx.delete(f"{BASE}/rdv/{rdv_id}", headers=auth(tok_maman), timeout=30.0)
        except Exception:
            pass

    # ============================================================================
    print("\n" + "=" * 70)
    print(f"RESULT: {PASS} PASS / {FAIL} FAIL")
    print("=" * 70)
    if FAILS:
        print("\nFAILURES:")
        for f in FAILS:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
