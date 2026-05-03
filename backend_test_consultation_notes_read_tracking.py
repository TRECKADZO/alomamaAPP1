"""
Test FINAL des 3 nouveaux endpoints consultation-notes:
  - GET  /api/mes-consultation-notes/unread-count
  - POST /api/mes-consultation-notes/{id}/mark-read
  - POST /api/mes-consultation-notes/mark-all-read
  - GET  /api/pro/mes-notes-ecrites
"""
import os
import time
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}

results = []
latencies = []


def _req(method, path, token=None, json=None, expect=200, name=""):
    url = BASE + path
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    try:
        r = requests.request(method, url, headers=headers, json=json, timeout=30)
    except Exception as e:
        results.append((name, False, f"Network error: {e}"))
        return None, None
    lat = (time.time() - t0) * 1000
    latencies.append(lat)
    ok = r.status_code == expect
    try:
        body = r.json()
    except Exception:
        body = r.text
    results.append((name, ok, f"{r.status_code} (expected {expect}) | {str(body)[:200]} | {lat:.0f}ms"))
    return r.status_code, body


def login(creds, label):
    url = BASE + "/auth/login"
    r = requests.post(url, json=creds, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Login {label} failed: {r.status_code} {r.text}")
    j = r.json()
    print(f"✅ Login {label} OK: user_id={j['user']['id']}")
    return j["token"], j["user"]


def main():
    print(f"Testing against: {BASE}\n")

    # Login both users
    maman_tok, maman_user = login(MAMAN, "maman")
    pro_tok, pro_user = login(PRO, "pro")
    maman_id = maman_user["id"]
    pro_id = pro_user["id"]

    # ------ TEST 1: unread-count (maman + pro) ------
    print("\n=== TEST 1: GET /mes-consultation-notes/unread-count ===")
    sc, body = _req("GET", "/mes-consultation-notes/unread-count", token=maman_tok, expect=200,
                    name="1a) unread-count maman → 200 {count: N>=0}")
    initial_unread = 0
    if body and isinstance(body, dict) and "count" in body:
        initial_unread = body["count"]
        results.append(("1a) contains 'count' key", True, f"count={body['count']}"))
    else:
        results.append(("1a) contains 'count' key", False, f"{body}"))

    sc, body = _req("GET", "/mes-consultation-notes/unread-count", token=pro_tok, expect=200,
                    name="1b) unread-count pro → 200 {count: 0}")
    if body and isinstance(body, dict) and body.get("count") == 0:
        results.append(("1b) pro count==0", True, "OK"))
    else:
        results.append(("1b) pro count==0", False, f"{body}"))

    # ------ TEST 2: create 2 notes as pro for maman ------
    print("\n=== TEST 2: Setup — POST /pro/consultation-notes x2 ===")
    sc, body = _req("POST", "/pro/consultation-notes", token=pro_tok,
                    json={"patient_id": maman_id, "diagnostic": "Test1"},
                    expect=200, name="2a) POST note1")
    note1_id = body.get("id") if isinstance(body, dict) else None
    if note1_id:
        results.append(("2a) note1 id retrieved", True, note1_id))
    else:
        results.append(("2a) note1 id retrieved", False, f"{body}"))

    sc, body = _req("POST", "/pro/consultation-notes", token=pro_tok,
                    json={"patient_id": maman_id, "diagnostic": "Test2"},
                    expect=200, name="2b) POST note2")
    note2_id = body.get("id") if isinstance(body, dict) else None
    if note2_id:
        results.append(("2b) note2 id retrieved", True, note2_id))
    else:
        results.append(("2b) note2 id retrieved", False, f"{body}"))

    if not (note1_id and note2_id):
        print("\n❌ FATAL: cannot proceed without both note IDs")
        return print_summary()

    # Verify read_by_maman=false via GET /mes-consultation-notes
    sc, body = _req("GET", "/mes-consultation-notes", token=maman_tok, expect=200,
                    name="2c) GET /mes-consultation-notes (maman)")
    found1 = found2 = None
    if isinstance(body, list):
        for n in body:
            if n.get("id") == note1_id:
                found1 = n
            if n.get("id") == note2_id:
                found2 = n
    if found1 and found1.get("read_by_maman") is False:
        results.append(("2d) note1.read_by_maman=false", True, "OK"))
    else:
        results.append(("2d) note1.read_by_maman=false", False, f"{found1}"))
    if found2 and found2.get("read_by_maman") is False:
        results.append(("2e) note2.read_by_maman=false", True, "OK"))
    else:
        results.append(("2e) note2.read_by_maman=false", False, f"{found2}"))

    # ------ TEST 3: count >= 2 ------
    print("\n=== TEST 3: GET /mes-consultation-notes/unread-count after create ===")
    sc, body = _req("GET", "/mes-consultation-notes/unread-count", token=maman_tok, expect=200,
                    name="3) unread-count after 2 new notes")
    new_count = body.get("count") if isinstance(body, dict) else -1
    if new_count >= 2:
        results.append(("3) count>=2", True, f"count={new_count}"))
    else:
        results.append(("3) count>=2", False, f"count={new_count} (expected >=2)"))

    # ------ TEST 4: mark-read note1 ------
    print("\n=== TEST 4: POST /mes-consultation-notes/{note1}/mark-read ===")
    sc, body = _req("POST", f"/mes-consultation-notes/{note1_id}/mark-read", token=maman_tok,
                    expect=200, name="4a) mark-read note1 → 200")
    if isinstance(body, dict) and body.get("ok") is True:
        results.append(("4a) body.ok=true", True, "OK"))
    else:
        results.append(("4a) body.ok=true", False, f"{body}"))

    sc, body = _req("GET", "/mes-consultation-notes", token=maman_tok, expect=200,
                    name="4b) GET /mes-consultation-notes after mark-read")
    n1_after = None
    if isinstance(body, list):
        for n in body:
            if n.get("id") == note1_id:
                n1_after = n
                break
    if n1_after and n1_after.get("read_by_maman") is True and n1_after.get("read_at"):
        results.append(("4c) note1.read_by_maman=true + read_at present",
                        True, f"read_at={n1_after.get('read_at')}"))
    else:
        results.append(("4c) note1.read_by_maman=true + read_at present", False, f"{n1_after}"))

    sc, body = _req("GET", "/mes-consultation-notes/unread-count", token=maman_tok, expect=200,
                    name="4d) unread-count after mark-read")
    after_count = body.get("count") if isinstance(body, dict) else -1
    if after_count == new_count - 1:
        results.append(("4e) count decreased by 1", True, f"{new_count} → {after_count}"))
    else:
        results.append(("4e) count decreased by 1", False, f"expected {new_count-1}, got {after_count}"))

    # ------ TEST 5: mark-read fake id → 404 ------
    print("\n=== TEST 5: mark-read fake id ===")
    sc, body = _req("POST", "/mes-consultation-notes/NON-EXISTENT-FAKE-ID-12345/mark-read",
                    token=maman_tok, expect=404, name="5) mark-read fake → 404")
    if isinstance(body, dict) and "Note introuvable" in str(body.get("detail", "")):
        results.append(("5) detail='Note introuvable'", True, "OK"))
    else:
        results.append(("5) detail='Note introuvable'", False, f"{body}"))

    # ------ TEST 6: mark-read as pro → 403 ------
    print("\n=== TEST 6: mark-read as pro → 403 ===")
    sc, body = _req("POST", f"/mes-consultation-notes/{note1_id}/mark-read", token=pro_tok,
                    expect=403, name="6) mark-read as pro → 403")
    if isinstance(body, dict) and "mamans" in str(body.get("detail", "")).lower():
        results.append(("6) detail mentions 'mamans'", True, f"{body.get('detail')}"))
    else:
        results.append(("6) detail mentions 'mamans'", False, f"{body}"))

    # ------ TEST 7: mark-all-read ------
    print("\n=== TEST 7: POST /mes-consultation-notes/mark-all-read ===")
    sc, body = _req("POST", "/mes-consultation-notes/mark-all-read", token=maman_tok,
                    expect=200, name="7a) mark-all-read → 200")
    if isinstance(body, dict) and body.get("ok") is True and body.get("marked", 0) >= 1:
        results.append(("7a) ok=true + marked>=1", True, f"marked={body.get('marked')}"))
    else:
        results.append(("7a) ok=true + marked>=1", False, f"{body}"))

    sc, body = _req("GET", "/mes-consultation-notes/unread-count", token=maman_tok, expect=200,
                    name="7b) unread-count after mark-all-read")
    final_count = body.get("count") if isinstance(body, dict) else -1
    if final_count == 0:
        results.append(("7c) count=0 after mark-all", True, "OK"))
    else:
        results.append(("7c) count=0 after mark-all", False, f"count={final_count}"))

    # ------ TEST 8: GET /pro/mes-notes-ecrites ------
    print("\n=== TEST 8: GET /pro/mes-notes-ecrites (pro) ===")
    sc, body = _req("GET", "/pro/mes-notes-ecrites", token=pro_tok, expect=200,
                    name="8a) GET /pro/mes-notes-ecrites → 200")
    if isinstance(body, list) and len(body) >= 2:
        results.append(("8b) list has >=2 notes", True, f"len={len(body)}"))

        # Check sort (created_at DESC)
        dates = [n.get("created_at") for n in body if n.get("created_at")]
        if dates == sorted(dates, reverse=True):
            results.append(("8c) sorted by created_at DESC", True, "OK"))
        else:
            results.append(("8c) sorted by created_at DESC", False, f"{dates[:5]}"))

        # Find our two notes
        n1 = next((n for n in body if n.get("id") == note1_id), None)
        n2 = next((n for n in body if n.get("id") == note2_id), None)

        required_fields = ["id", "concerne", "maman_nom", "enfant_nom",
                           "read_by_maman", "diagnostic", "traitement", "notes",
                           "date", "created_at"]
        for label, n in [("note1", n1), ("note2", n2)]:
            if n:
                missing = [f for f in required_fields if f not in n]
                if not missing:
                    results.append((f"8d-{label}) all required fields present", True, "OK"))
                else:
                    results.append((f"8d-{label}) all required fields present", False, f"missing={missing}"))
                # diagnostic/traitement/notes must be clear (not enc_v1)
                for f in ("diagnostic", "traitement", "notes"):
                    val = n.get(f) or ""
                    if isinstance(val, str) and val.startswith("enc_v1:"):
                        results.append((f"8e-{label}.{f} clear text", False, "still encrypted"))
                    else:
                        results.append((f"8e-{label}.{f} clear text", True, f"val={val!r}"))
                # read_by_maman should be True for both (mark-all-read done)
                if n.get("read_by_maman") is True:
                    results.append((f"8f-{label}.read_by_maman=true", True, "OK"))
                else:
                    results.append((f"8f-{label}.read_by_maman=true", False, f"{n.get('read_by_maman')}"))
            else:
                results.append((f"8d-{label}) present in list", False, "not found"))
    else:
        results.append(("8b) list has >=2 notes", False, f"{body}"))

    # ------ TEST 9: Security ------
    print("\n=== TEST 9: Security checks ===")
    sc, body = _req("GET", "/pro/mes-notes-ecrites", token=maman_tok, expect=403,
                    name="9a) GET /pro/mes-notes-ecrites as maman → 403")
    # unauth
    sc, body = _req("GET", "/pro/mes-notes-ecrites", token=None, expect=401,
                    name="9b) GET /pro/mes-notes-ecrites no Bearer → 401")

    # ------ TEST 10: Cleanup ------
    print("\n=== TEST 10: Cleanup DELETE notes ===")
    _req("DELETE", f"/pro/consultation-notes/{note1_id}", token=pro_tok, expect=200,
         name="10a) DELETE note1")
    _req("DELETE", f"/pro/consultation-notes/{note2_id}", token=pro_tok, expect=200,
         name="10b) DELETE note2")

    print_summary()


def print_summary():
    print("\n" + "=" * 90)
    print("SUMMARY")
    print("=" * 90)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        icon = "✅" if ok else "❌"
        print(f"{icon} {name}: {detail}")
    print("=" * 90)
    print(f"TOTAL: {passed}/{len(results)} PASS, {len(failed)} FAIL")
    if latencies:
        avg = sum(latencies) / len(latencies)
        print(f"Avg latency: {avg:.0f}ms over {len(latencies)} HTTP calls (min={min(latencies):.0f}, max={max(latencies):.0f})")
    if failed:
        print("\nFAILURES:")
        for name, _, detail in failed:
            print(f"  ❌ {name}: {detail}")


if __name__ == "__main__":
    main()
