"""
Tests for /api/grossesse/tracking CRUD endpoint.
Usage: python3 /app/backend_test_tracking.py
"""
import os
import sys
import json
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PASS, FAIL = 0, 0
FAILS: list = []


def check(name: str, cond: bool, detail: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"✅ {name}")
    else:
        FAIL += 1
        FAILS.append(f"{name} :: {detail}")
        print(f"❌ {name} :: {detail}")


def jpost(path, token=None, body=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(BASE + path, headers=h, json=body or {}, timeout=30)


def jget(path, token=None, params=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(BASE + path, headers=h, params=params, timeout=30)


def jdel(path, token=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(BASE + path, headers=h, timeout=30)


def main():
    # ------------------------------------------------------------------
    # Setup test maman
    # ------------------------------------------------------------------
    maman_email = "test_grossesse@test.com"
    maman_password = "Test123!"
    register_body = {
        "email": maman_email,
        "password": maman_password,
        "name": "Test Maman Tracking",
        "role": "maman",
        # note: backend uses "accepte_*" fields per RegisterIn model
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = jpost("/auth/register", body=register_body)
    if r.status_code == 200:
        print(f"  → maman registered: {maman_email}")
        token = r.json()["token"]
    elif r.status_code == 400 and ("déjà" in r.text.lower() or "deja" in r.text.lower()):
        # already exists, log in
        rr = jpost("/auth/login", body={"email": maman_email, "password": maman_password})
        check("Login existing maman", rr.status_code == 200, f"status={rr.status_code} body={rr.text[:200]}")
        if rr.status_code != 200:
            print("Cannot proceed without maman token")
            return
        token = rr.json()["token"]
        print(f"  → maman already existed, logged in")
    else:
        print(f"register status={r.status_code} body={r.text[:300]}")
        check("Setup maman register", False, r.text[:200])
        return

    # Create grossesse (idempotent: deactivate previous)
    rg = jpost("/grossesse", token=token, body={"date_debut": "2026-01-01"})
    check("Setup: POST /grossesse", rg.status_code == 200, f"status={rg.status_code} body={rg.text[:200]}")

    # ------------------------------------------------------------------
    # Tracking grossesse - POST tests
    # ------------------------------------------------------------------
    created_ids: list = []

    # 1. POST poids
    body = {"type": "poids", "date": "2026-04-25", "value": 65.5}
    r = jpost("/grossesse/tracking", token=token, body=body)
    ok = r.status_code == 200
    check("1. POST tracking type=poids returns 200", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        d = r.json()
        check("1b. response has id", "id" in d and d["id"], f"got {d.keys()}")
        check("1c. response.user_id present", "user_id" in d and d["user_id"], "")
        check("1d. response.type=poids", d.get("type") == "poids", f"got {d.get('type')}")
        check("1e. response.date=2026-04-25", d.get("date") == "2026-04-25", f"got {d.get('date')}")
        check("1f. response.value=65.5", d.get("value") == 65.5, f"got {d.get('value')}")
        check("1g. response.created_at present", bool(d.get("created_at")), "")
        if d.get("id"):
            created_ids.append(d["id"])

    # 2. POST tension
    body = {"type": "tension", "date": "2026-04-25", "value": 12.5, "value2": 8.0}
    r = jpost("/grossesse/tracking", token=token, body=body)
    ok = r.status_code == 200
    check("2. POST tracking type=tension returns 200", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        d = r.json()
        check("2b. type=tension value=12.5 value2=8.0",
              d.get("type") == "tension" and d.get("value") == 12.5 and d.get("value2") == 8.0,
              f"got {d}")
        if d.get("id"):
            created_ids.append(d["id"])

    # 3. POST symptome
    body = {"type": "symptome", "date": "2026-04-25", "text": "Nausées matinales"}
    r = jpost("/grossesse/tracking", token=token, body=body)
    ok = r.status_code == 200
    check("3. POST tracking type=symptome returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        check("3b. type=symptome text persisted",
              d.get("type") == "symptome" and d.get("text") == "Nausées matinales",
              f"got {d}")
        if d.get("id"):
            created_ids.append(d["id"])

    # 4. POST journal
    body = {"type": "journal", "date": "2026-04-25", "text": "Journée fatigante"}
    r = jpost("/grossesse/tracking", token=token, body=body)
    ok = r.status_code == 200
    check("4. POST tracking type=journal returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        check("4b. type=journal text persisted",
              d.get("type") == "journal" and d.get("text") == "Journée fatigante", f"got {d}")
        if d.get("id"):
            created_ids.append(d["id"])

    # 5. POST vaccin
    body = {"type": "vaccin", "date": "2026-04-25", "text": "Vaccin coqueluche"}
    r = jpost("/grossesse/tracking", token=token, body=body)
    ok = r.status_code == 200
    check("5. POST tracking type=vaccin returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        check("5b. type=vaccin text persisted",
              d.get("type") == "vaccin" and d.get("text") == "Vaccin coqueluche", f"got {d}")
        if d.get("id"):
            created_ids.append(d["id"])

    # 6. POST invalid type → 400
    body = {"type": "invalid", "date": "2026-04-25"}
    r = jpost("/grossesse/tracking", token=token, body=body)
    check("6. POST invalid type returns 400", r.status_code == 400, f"status={r.status_code}")
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    detail_str = str(detail).lower()
    has_types_mention = any(t in detail_str for t in ["poids", "tension", "symptome", "journal", "vaccin", "type"])
    check("6b. detail mentions valid types", has_types_mention, f"detail={detail}")

    # 7. GET all tracking
    r = jget("/grossesse/tracking", token=token)
    ok = r.status_code == 200
    check("7. GET tracking returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        check("7b. body has 'entries' list",
              isinstance(d.get("entries"), list), f"got {type(d.get('entries'))}")
        # Should have 5 items (we created exactly 5)
        # Note: there may be leftovers from previous runs if not cleaned
        check("7c. total >= 5",
              isinstance(d.get("total"), int) and d["total"] >= 5, f"total={d.get('total')}")
        # Test sort by date desc
        entries = d.get("entries", [])
        if len(entries) >= 2:
            dates = [e.get("date", "") for e in entries]
            sorted_desc = all(dates[i] >= dates[i + 1] for i in range(len(dates) - 1))
            check("7d. entries sorted by date desc", sorted_desc, f"dates={dates[:5]}")

    # 8. GET ?type=poids → total=1, type=poids
    r = jget("/grossesse/tracking", token=token, params={"type": "poids"})
    ok = r.status_code == 200
    check("8. GET tracking?type=poids returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        # All entries returned should be type=poids
        all_poids = all(e.get("type") == "poids" for e in d.get("entries", []))
        check("8b. all entries are type=poids", all_poids, f"types={[e.get('type') for e in d.get('entries', [])]}")
        # Should be 1 (since this run created exactly 1 poids entry, but if reruns exist there may be more)
        check("8c. total >= 1", d.get("total", 0) >= 1, f"total={d.get('total')}")
        if d.get("entries"):
            check("8d. entries[0].type=poids",
                  d["entries"][0].get("type") == "poids",
                  f"got {d['entries'][0].get('type')}")

    # 9. GET ?type=tension → entries[0] with value=12.5 and value2=8.0
    r = jget("/grossesse/tracking", token=token, params={"type": "tension"})
    ok = r.status_code == 200
    check("9. GET tracking?type=tension returns 200", ok, f"status={r.status_code}")
    if ok:
        d = r.json()
        entries = d.get("entries", [])
        check("9b. at least 1 tension entry", len(entries) >= 1, f"got {len(entries)} entries")
        if entries:
            check("9c. entries[0] has value=12.5 and value2=8.0",
                  entries[0].get("value") == 12.5 and entries[0].get("value2") == 8.0,
                  f"got value={entries[0].get('value')} value2={entries[0].get('value2')}")

    # 10. DELETE first created id
    first_id = created_ids[0] if created_ids else None
    if first_id:
        r = jdel(f"/grossesse/tracking/{first_id}", token=token)
        ok = r.status_code == 200
        check(f"10. DELETE first tracking id={first_id[:8]}...", ok, f"status={r.status_code}")
        if ok:
            check("10b. response {ok:true}", r.json().get("ok") is True, f"got {r.json()}")

    # 11. GET → total decreased
    r = jget("/grossesse/tracking", token=token)
    if r.status_code == 200:
        d = r.json()
        # We expect 4 left from the 5 we created in this run, but reruns may have leftovers
        # Just check that the deleted id is gone
        ids_present = [e.get("id") for e in d.get("entries", [])]
        check("11. After DELETE, total reflects removal (deleted id not present)",
              first_id not in ids_present,
              f"deleted_id_still_present={first_id in ids_present}")

    # 12. DELETE non-existent → 404
    fake_id = "non-existent-id-123456"
    r = jdel(f"/grossesse/tracking/{fake_id}", token=token)
    check("12. DELETE non-existent id returns 404", r.status_code == 404, f"status={r.status_code}")

    # ------------------------------------------------------------------
    # SECURITY tests
    # ------------------------------------------------------------------
    # 13. Admin login → GET /grossesse/tracking → 403
    admin_login = jpost("/auth/login", body={"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"})
    if admin_login.status_code != 200:
        print(f"⚠️  Admin login failed: {admin_login.status_code} {admin_login.text[:200]}")
        check("13. Admin login OK", False, f"status={admin_login.status_code}")
    else:
        admin_token = admin_login.json()["token"]
        check("13a. Admin login OK", True)
        r = jget("/grossesse/tracking", token=admin_token)
        check("13b. Admin GET /grossesse/tracking returns 403",
              r.status_code == 403, f"status={r.status_code} body={r.text[:200]}")

    # 14. POST without token → 401/403
    r = requests.post(BASE + "/grossesse/tracking",
                      json={"type": "poids", "date": "2026-04-25", "value": 60},
                      timeout=30)
    check("14. POST without token returns 401/403",
          r.status_code in (401, 403), f"status={r.status_code} body={r.text[:200]}")

    # ------------------------------------------------------------------
    # Cleanup: delete remaining tracking entries created this run
    # ------------------------------------------------------------------
    for tid in created_ids[1:]:  # first one already deleted
        try:
            jdel(f"/grossesse/tracking/{tid}", token=token)
        except Exception:
            pass

    # Summary
    print("\n" + "=" * 60)
    print(f"PASS: {PASS}    FAIL: {FAIL}")
    if FAILS:
        print("\nFailures:")
        for f in FAILS:
            print(f"  • {f}")
    print("=" * 60)
    return FAIL == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
