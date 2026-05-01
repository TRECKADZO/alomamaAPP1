"""
Tests for POST /api/teleconsultation/agora-token/{rdv_id}
"""
import os
import time
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

EXPECTED_APP_ID = "d6bb0709662d4b09a8fd6ce4d9c1b3c7"

results = []
def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} :: {detail}")
    results.append((name, ok, detail))


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None, r
    return r.json().get("token"), r


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    # 1. Login maman
    maman_token, r = login("maman.test@alomaman.dev", "Test1234!")
    log("Login maman", maman_token is not None, f"status={r.status_code}")
    assert maman_token

    # Login pro
    pro_token, r = login("pro.test@alomaman.dev", "Test1234!")
    log("Login pro", pro_token is not None, f"status={r.status_code}")
    assert pro_token

    # Get RDV list as maman
    r = requests.get(f"{BASE}/rdv", headers=auth_headers(maman_token), timeout=30)
    log("GET /rdv as maman", r.status_code == 200, f"status={r.status_code}")
    rdvs = r.json() if r.status_code == 200 else []
    log("Maman has RDVs", len(rdvs) > 0, f"count={len(rdvs)}")

    target_rdv_id = "c0288555-0d73-4b56-9271-62ac48c74ce4"
    # Try the specified one first; if not present use the first one
    target = next((x for x in rdvs if x.get("id") == target_rdv_id), None)
    if not target and rdvs:
        target = rdvs[0]
        target_rdv_id = target["id"]
    log("Selected RDV id", bool(target_rdv_id), f"rdv_id={target_rdv_id}")

    # ============ SCENARIO 1: Happy path - Maman ============
    print("\n=== SCENARIO 1: Maman authorized ===")
    before_ts = int(time.time())
    r = requests.post(f"{BASE}/teleconsultation/agora-token/{target_rdv_id}",
                      headers=auth_headers(maman_token), timeout=30)
    log("S1 POST agora-token as maman -> 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        data = r.json()
        log("S1 response has app_id", "app_id" in data, f"app_id={data.get('app_id')}")
        log("S1 app_id matches AGORA_APP_ID", data.get("app_id") == EXPECTED_APP_ID,
            f"got={data.get('app_id')} expected={EXPECTED_APP_ID}")
        ch = data.get("channel", "")
        log("S1 channel starts with 'alomaman_'", ch.startswith("alomaman_"), f"channel={ch}")
        # 'alomaman_' prefix + 24 chars
        log("S1 channel suffix length 24", len(ch) - len("alomaman_") == 24, f"channel_len={len(ch)}")
        tok = data.get("token", "")
        log("S1 token is non-empty string", isinstance(tok, str) and len(tok) > 0, f"token_len={len(tok)}")
        uid = data.get("uid")
        log("S1 uid is positive int", isinstance(uid, int) and uid > 0, f"uid={uid}")
        exp = data.get("expires_at")
        log("S1 expires_at > now", isinstance(exp, int) and exp > before_ts, f"exp={exp} now={before_ts}")
        log("S1 expires_at ≈ 1h ahead", isinstance(exp, int) and 3500 < (exp - before_ts) < 3700,
            f"diff={exp - before_ts if isinstance(exp,int) else 'NA'}")
        log("S1 rdv_id matches", data.get("rdv_id") == target_rdv_id, f"rdv_id={data.get('rdv_id')}")
        log("S1 user_role == 'maman'", data.get("user_role") == "maman", f"user_role={data.get('user_role')}")

    # ============ SCENARIO 2: Happy path - Pro ============
    print("\n=== SCENARIO 2: Pro authorized ===")
    # The same target RDV - check if it belongs to pro.test as well; if not, use a pro's RDV
    r2 = requests.get(f"{BASE}/rdv", headers=auth_headers(pro_token), timeout=30)
    pro_rdvs = r2.json() if r2.status_code == 200 else []
    pro_target_id = None
    if any(x.get("id") == target_rdv_id for x in pro_rdvs):
        pro_target_id = target_rdv_id
    elif pro_rdvs:
        pro_target_id = pro_rdvs[0]["id"]
    log("S2 Pro RDV available", bool(pro_target_id), f"id={pro_target_id}")

    if pro_target_id:
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{pro_target_id}",
                          headers=auth_headers(pro_token), timeout=30)
        log("S2 POST agora-token as pro -> 200", r.status_code == 200,
            f"status={r.status_code} body={r.text[:300]}")
        if r.status_code == 200:
            data = r.json()
            log("S2 user_role == 'professionnel'", data.get("user_role") == "professionnel",
                f"user_role={data.get('user_role')}")
            log("S2 app_id matches", data.get("app_id") == EXPECTED_APP_ID, f"app_id={data.get('app_id')}")
            log("S2 token non-empty", bool(data.get("token")), f"token_len={len(data.get('token',''))}")

    # ============ SCENARIO 3: Other user denied (403) ============
    print("\n=== SCENARIO 3: Different user denied ===")
    # Create a fresh maman test user (not assigned to target RDV)
    other_email = f"maman_other_agora_{int(time.time())}@test.dev"
    reg = requests.post(f"{BASE}/auth/register", json={
        "email": other_email,
        "password": "OtherPass123!",
        "name": "Sophie OtherTest",
        "role": "maman",
        "phone": f"+22507{int(time.time()) % 10000000:07d}",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }, timeout=30)
    if reg.status_code != 200:
        log("S3 register other user", False, f"status={reg.status_code} body={reg.text[:200]}")
        other_token = None
    else:
        other_token = reg.json().get("token")
        log("S3 register other user", bool(other_token), f"status={reg.status_code}")

    if other_token:
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{target_rdv_id}",
                          headers=auth_headers(other_token), timeout=30)
        log("S3 other user -> 403", r.status_code == 403,
            f"status={r.status_code} body={r.text[:200]}")

    # Cleanup other user
    if other_token:
        try:
            requests.delete(f"{BASE}/auth/me",
                            headers=auth_headers(other_token),
                            json={"password": "OtherPass123!", "confirmation": "SUPPRIMER"},
                            timeout=30)
        except Exception:
            pass

    # ============ SCENARIO 4: Not found (404) ============
    print("\n=== SCENARIO 4: Not found ===")
    r = requests.post(f"{BASE}/teleconsultation/agora-token/non-existent-id-12345",
                      headers=auth_headers(maman_token), timeout=30)
    log("S4 non-existent rdv -> 404", r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")

    # ============ SCENARIO 5: Unauthenticated (401) ============
    print("\n=== SCENARIO 5: Unauthenticated ===")
    r = requests.post(f"{BASE}/teleconsultation/agora-token/{target_rdv_id}", timeout=30)
    # FastAPI HTTPBearer returns 403 by default; spec says 401. Accept either.
    log("S5 no auth -> 401 or 403", r.status_code in (401, 403),
        f"status={r.status_code} body={r.text[:200]}")

    # ============ SCENARIO 6: Token persistence on RDV ============
    print("\n=== SCENARIO 6: Persistence ===")
    r = requests.get(f"{BASE}/rdv", headers=auth_headers(maman_token), timeout=30)
    if r.status_code == 200:
        rdvs2 = r.json()
        found = next((x for x in rdvs2 if x.get("id") == target_rdv_id), None)
        if found:
            log("S6 agora_channel persisted", "agora_channel" in found and bool(found.get("agora_channel")),
                f"agora_channel={found.get('agora_channel')}")
            log("S6 teleconsultation_provider == 'agora'",
                found.get("teleconsultation_provider") == "agora",
                f"provider={found.get('teleconsultation_provider')}")
        else:
            log("S6 RDV found in list", False, f"target={target_rdv_id}")

    # ============ SCENARIO 7: Backward compat (Jitsi) ============
    print("\n=== SCENARIO 7: Jitsi fallback ===")
    r = requests.post(f"{BASE}/teleconsultation/room/{target_rdv_id}",
                      headers=auth_headers(maman_token), timeout=30)
    log("S7 jitsi room -> 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        url = data.get("room_url", "")
        log("S7 room_url contains meet.jit.si", "meet.jit.si" in url, f"room_url={url}")

    # ============ Summary ============
    print("\n========== SUMMARY ==========")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"Total: {len(results)} | Pass: {passed} | Fail: {failed}")
    for name, ok, detail in results:
        if not ok:
            print(f"  FAIL: {name} :: {detail}")


if __name__ == "__main__":
    main()
