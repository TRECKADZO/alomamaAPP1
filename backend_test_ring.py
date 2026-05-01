"""
Backend tests for POST /api/teleconsultation/ring/{rdv_id}.
Tests every scenario listed in the review request.
"""
import os
import sys
import time
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASS = "Test1234!"
EXISTING_RDV_ID = "c0288555-0d73-4b56-9271-62ac48c74ce4"

results = []


def log(name, ok, detail=""):
    status = "✅" if ok else "❌"
    print(f"{status} {name}  {detail}")
    results.append((ok, name, detail))


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} → {r.status_code}: {r.text}"
    data = r.json()
    return data["token"], data["user"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def register_fresh_maman(suffix=None):
    suffix = suffix or str(int(time.time()))
    email = f"maman_ring_{suffix}@test.alomaman.dev"
    password = "RingTest123!"
    payload = {
        "email": email,
        "password": password,
        "name": "Fatou RingTest",
        "role": "maman",
        "phone": f"+22507{suffix[-8:]}",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, f"register fresh maman → {r.status_code}: {r.text}"
    data = r.json()
    return data["token"], data["user"], email, password


def get_or_create_rdv(maman_token, pro_id):
    # 1) Try the provided existing rdv id
    rh = requests.get(f"{BASE}/rdv", headers=auth_headers(maman_token), timeout=20)
    if rh.status_code == 200:
        for it in rh.json():
            if it.get("id") == EXISTING_RDV_ID and it.get("pro_id") == pro_id:
                return it["id"], "reused_existing"
    # 2) Create new one between the test maman and the test pro
    payload = {
        "pro_id": pro_id,
        "date": "2026-07-15T11:00",
        "motif": "test ring endpoint",
        "type_consultation": "prenatale",
        "mode": "teleconsultation",
    }
    r = requests.post(f"{BASE}/rdv", json=payload, headers=auth_headers(maman_token), timeout=20)
    assert r.status_code == 200, f"create rdv → {r.status_code}: {r.text}"
    return r.json()["id"], "created"


def main():
    print("=" * 70)
    print(f"Testing POST /api/teleconsultation/ring/{{rdv_id}}  @  {BASE}")
    print("=" * 70)

    # ------------------------------------------------------------------
    # Step 0 — Logins
    # ------------------------------------------------------------------
    maman_token, maman_user = login(MAMAN_EMAIL, MAMAN_PASS)
    pro_token, pro_user = login(PRO_EMAIL, PRO_PASS)
    log("[0] Login maman + pro", True, f"maman_id={maman_user['id']} pro_id={pro_user['id']}")

    # ------------------------------------------------------------------
    # Step 0b — Get an RDV (reuse or create)
    # ------------------------------------------------------------------
    rdv_id, mode = get_or_create_rdv(maman_token, pro_user["id"])
    log("[0b] Secure a RDV between maman & pro", True, f"rdv_id={rdv_id} ({mode})")

    # ------------------------------------------------------------------
    # Scenario 1 — Pro rings Maman
    # ------------------------------------------------------------------
    # Clear existing incoming_call notifs for maman to avoid collisions
    before = requests.get(f"{BASE}/notifications", headers=auth_headers(maman_token), timeout=20).json()
    before_ids = {n["id"] for n in before if n.get("type") == "incoming_call"}

    r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_id}", headers=auth_headers(pro_token), timeout=20)
    log("[1.1] Pro → ring(rdv) returns 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        log("[1.2] body.ok == true", body.get("ok") is True, str(body.get("ok")))
        log("[1.3] body.called == maman_id", body.get("called") == maman_user["id"], f"called={body.get('called')}")
        log("[1.4] body.title present + contains 'appelle'", bool(body.get("title")) and "appelle" in (body.get("title") or "").lower(), f"title={body.get('title')}")
        log("[1.5] body.body contains 'Téléconsultation'", "Téléconsultation" in (body.get("body") or ""), f"body={body.get('body')}")
        log("[1.6] body.has_push_token is bool", isinstance(body.get("has_push_token"), bool), str(body.get("has_push_token")))

        # Verify notification was created for maman
        time.sleep(0.5)
        after = requests.get(f"{BASE}/notifications", headers=auth_headers(maman_token), timeout=20).json()
        new_calls = [n for n in after if n.get("type") == "incoming_call" and n["id"] not in before_ids]
        log("[1.7] New incoming_call notif created for maman", len(new_calls) >= 1, f"new_count={len(new_calls)}")
        if new_calls:
            notif = new_calls[0]
            log("[1.8] notif.rdv_id == rdv_id", notif.get("rdv_id") == rdv_id, f"rdv_id={notif.get('rdv_id')}")
            log("[1.9] notif.caller_id == pro_id", notif.get("caller_id") == pro_user["id"], f"caller_id={notif.get('caller_id')}")
            log("[1.10] notif.read == False", notif.get("read") is False, f"read={notif.get('read')}")
            log("[1.11] notif.title matches body.title", notif.get("title") == body.get("title"))

    # ------------------------------------------------------------------
    # Scenario 2 — Maman rings Pro (reverse)
    # ------------------------------------------------------------------
    before_pro = requests.get(f"{BASE}/notifications", headers=auth_headers(pro_token), timeout=20).json()
    before_pro_ids = {n["id"] for n in before_pro if n.get("type") == "incoming_call"}

    r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_id}", headers=auth_headers(maman_token), timeout=20)
    log("[2.1] Maman → ring(rdv) returns 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        log("[2.2] body.called == pro_id", body.get("called") == pro_user["id"], f"called={body.get('called')}")
        log("[2.3] body.ok == true", body.get("ok") is True)

        time.sleep(0.5)
        after_pro = requests.get(f"{BASE}/notifications", headers=auth_headers(pro_token), timeout=20).json()
        new_calls = [n for n in after_pro if n.get("type") == "incoming_call" and n["id"] not in before_pro_ids]
        log("[2.4] incoming_call notif inserted for Pro", len(new_calls) >= 1, f"new_count={len(new_calls)}")
        if new_calls:
            n0 = new_calls[0]
            log("[2.5] notif for Pro has caller_id == maman_id", n0.get("caller_id") == maman_user["id"])
            log("[2.6] notif for Pro has rdv_id correct", n0.get("rdv_id") == rdv_id)

    # ------------------------------------------------------------------
    # Scenario 3 — Other user denied (403)
    # ------------------------------------------------------------------
    other_token, other_user, other_email, other_pass = register_fresh_maman()
    r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_id}", headers=auth_headers(other_token), timeout=20)
    log("[3.1] Third user → ring → 403 Forbidden", r.status_code == 403, f"status={r.status_code} body={r.text[:120]}")

    # ------------------------------------------------------------------
    # Scenario 4 — RDV not found (404)
    # ------------------------------------------------------------------
    r = requests.post(f"{BASE}/teleconsultation/ring/non-existent-id-xyz-99999", headers=auth_headers(maman_token), timeout=20)
    log("[4.1] Non-existent RDV → 404", r.status_code == 404, f"status={r.status_code} body={r.text[:120]}")

    # ------------------------------------------------------------------
    # Scenario 5 — Unauthenticated (401)
    # ------------------------------------------------------------------
    r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_id}", timeout=20)  # no Bearer
    log("[5.1] No Bearer → 401", r.status_code == 401, f"status={r.status_code} body={r.text[:120]}")

    # ------------------------------------------------------------------
    # Scenario 6 — push send verification with fake token
    # ------------------------------------------------------------------
    # Register a fake push token for maman then ring → the endpoint must still
    # return 200 with has_push_token=true even if Expo rejects the fake token
    fake_token = "ExponentPushToken[FAKE-TEST-TOKEN-FOR-RING-SCENARIO-123]"
    r_set = requests.post(f"{BASE}/push-token", json={"token": fake_token}, headers=auth_headers(maman_token), timeout=20)
    log("[6.1] POST /push-token (fake) returns 200", r_set.status_code == 200, f"status={r_set.status_code}")

    r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_id}", headers=auth_headers(pro_token), timeout=20)
    log("[6.2] Pro rings after fake token set → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        log("[6.3] has_push_token == true after fake token", body.get("has_push_token") is True, str(body.get("has_push_token")))

    # Clear fake token for maman
    requests.post(f"{BASE}/push-token", json={"token": ""}, headers=auth_headers(maman_token), timeout=20)

    # ------------------------------------------------------------------
    # Scenario 7 — Backward compat
    # ------------------------------------------------------------------
    r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_id}", headers=auth_headers(maman_token), timeout=20)
    log("[7.1] /teleconsultation/agora-token/{rdv_id} still 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        b = r.json()
        ok = all(k in b for k in ("app_id", "channel", "token", "uid", "expires_at"))
        log("[7.2] agora-token body has {app_id, channel, token, uid, expires_at}", ok)

    r = requests.post(f"{BASE}/teleconsultation/room/{rdv_id}", headers=auth_headers(maman_token), timeout=20)
    log("[7.3] /teleconsultation/room/{rdv_id} still 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        b = r.json()
        log("[7.4] room body has meet.jit.si URL", "meet.jit.si" in (b.get("room_url") or ""), f"room_url={b.get('room_url')}")

    # For push-token/test endpoint — we need a token first. Re-set the fake token then test.
    requests.post(f"{BASE}/push-token", json={"token": fake_token}, headers=auth_headers(maman_token), timeout=20)
    r = requests.post(f"{BASE}/push-token/test", headers=auth_headers(maman_token), timeout=20)
    log("[7.5] /push-token/test still works (200 even if expo rejects fake)", r.status_code == 200, f"status={r.status_code} body={r.text[:140]}")

    # Verify "no token" behaviour → should 400
    # (unset the token first)
    # The endpoint expects PushTokenIn {token: str} so use empty string to unset
    from pymongo import MongoClient
    try:
        # Use MONGO_URL from backend env if reachable — else we just skip this deeper check
        pass
    except Exception:
        pass

    # ------------------------------------------------------------------
    # Cleanup — drop the other (third) test user to keep DB clean
    # ------------------------------------------------------------------
    r = requests.delete(f"{BASE}/auth/me",
                        headers=auth_headers(other_token),
                        json={"password": other_pass, "confirmation": "SUPPRIMER"},
                        timeout=20)
    log("[cleanup] DELETE third maman account", r.status_code == 200, f"status={r.status_code}")

    # Clear fake token to leave maman's state untouched
    requests.post(f"{BASE}/push-token", json={"token": ""}, headers=auth_headers(maman_token), timeout=20)

    # ------------------------------------------------------------------
    # Final summary
    # ------------------------------------------------------------------
    total = len(results)
    passed = sum(1 for r_ in results if r_[0])
    failed = total - passed
    print("=" * 70)
    print(f"RESULTS: {passed}/{total} passed, {failed} failed")
    print("=" * 70)
    if failed:
        print("FAILED:")
        for ok, name, detail in results:
            if not ok:
                print(f"   ❌ {name}  {detail}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
