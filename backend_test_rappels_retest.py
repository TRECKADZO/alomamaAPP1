"""
Targeted retest: POST /api/ai/rappels-contextuels (Premium MAMAN path)
After fix that prevents ObjectId leak from insert_many.
"""
import os
import sys
import json
import requests

BASE_URL = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"

results = []

def record(name, ok, info=""):
    status = "PASS" if ok else "FAIL"
    results.append((status, name, info))
    print(f"[{status}] {name} — {info}")

def main():
    # 1. Login
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        record("Login MAMAN Premium", False, f"status={r.status_code} body={r.text[:300]}")
        return
    data = r.json()
    token = data.get("token")
    user = data.get("user") or {}
    record("Login MAMAN Premium", bool(token), f"user.id={user.get('id')} role={user.get('role')} premium={user.get('premium')}")
    headers = {"Authorization": f"Bearer {token}"}

    # Confirm Premium via /auth/me
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=30)
    me = r.json() if r.status_code == 200 else {}
    is_premium = bool(me.get("premium")) or bool(me.get("is_premium"))
    record("MAMAN is Premium (auth/me)", is_premium, f"premium={me.get('premium')} premium_until={me.get('premium_until')}")

    # 2. POST /ai/rappels-contextuels — should now return 200 (no 500)
    payload = {"contexte": "Je suis à 28 SA, premier bébé", "sa": 28}
    r = requests.post(f"{BASE_URL}/ai/rappels-contextuels", json=payload, headers=headers, timeout=120)
    record("POST /ai/rappels-contextuels returns 200 (was 500)", r.status_code == 200, f"status={r.status_code} body[:200]={r.text[:200]}")
    if r.status_code != 200:
        return

    body = r.json()

    # 3. Body shape
    record("Response has 'rappels' key", "rappels" in body, f"keys={list(body.keys())}")
    record("Response has 'count' key", "count" in body, f"count={body.get('count')}")

    rappels = body.get("rappels") or []
    record("rappels is a list", isinstance(rappels, list), f"type={type(rappels).__name__}")
    record("count == 5", body.get("count") == 5 and len(rappels) == 5, f"count={body.get('count')} len(rappels)={len(rappels)}")

    # 4. Validate each rappel structure
    required_fields = ["titre", "description", "urgence", "icone"]
    all_ok = True
    for i, rappel in enumerate(rappels):
        for f in required_fields:
            if f not in rappel:
                record(f"rappel[{i}] missing '{f}'", False, f"keys={list(rappel.keys())}")
                all_ok = False
        # Critical: NO _id (ObjectId) in response
        if "_id" in rappel:
            record(f"rappel[{i}] LEAKS '_id' field", False, f"_id={rappel.get('_id')!r}")
            all_ok = False
    record("All rappels contain {titre,description,urgence,icone} and NO _id", all_ok, f"checked {len(rappels)} items")

    # 5. Verify entire JSON is serializable (no ObjectId leak anywhere)
    try:
        json.dumps(body)
        record("Full response is JSON-serializable (no ObjectId leak)", True, "json.dumps OK")
    except (TypeError, ValueError) as e:
        record("Full response is JSON-serializable (no ObjectId leak)", False, f"err={e}")

    # 6. GET /ai/rappels-contextuels — verify persistence
    r = requests.get(f"{BASE_URL}/ai/rappels-contextuels", headers=headers, timeout=30)
    record("GET /ai/rappels-contextuels returns 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        gbody = r.json()
        gitems = gbody.get("rappels") or []
        record("GET returns persisted rappels (count >= 5)", len(gitems) >= 5, f"count={gbody.get('count')} len={len(gitems)}")
        # Ensure no _id in GET either
        leaks = [i for i, it in enumerate(gitems) if "_id" in it]
        record("GET response has no _id leak", len(leaks) == 0, f"leak indices={leaks}")
        # Confirm shape on first item
        if gitems:
            first = gitems[0]
            for f in required_fields + ["id", "maman_id", "created_at"]:
                if f not in first:
                    record(f"GET first item missing '{f}'", False, f"keys={list(first.keys())}")

    # Summary
    print("\n=== SUMMARY ===")
    fails = [r for r in results if r[0] == "FAIL"]
    print(f"Total: {len(results)}  PASS: {len(results)-len(fails)}  FAIL: {len(fails)}")
    if fails:
        print("FAILED:")
        for s, n, info in fails:
            print(f"  - {n} :: {info}")
        sys.exit(1)
    else:
        print("ALL PASS")


if __name__ == "__main__":
    main()
