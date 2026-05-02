"""
Backend test — Téléconsultation TIME-WINDOW logic
Tests the new window-enforcement on:
  - GET  /api/teleconsultation/status/{rdv_id}
  - POST /api/teleconsultation/agora-token/{rdv_id}
  - POST /api/teleconsultation/ring/{rdv_id}
  - POST /api/teleconsultation/room/{rdv_id}
"""
import os
import sys
import time
import json
import asyncio
from datetime import datetime, timedelta, timezone

import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}

# Test results accumulator
PASSES = []
FAILS = []


def ok(label):
    PASSES.append(label)
    print(f"  ✅ {label}")


def ko(label, info=""):
    FAILS.append(f"{label} :: {info}")
    print(f"  ❌ {label} :: {info}")


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]


def auth_h(t):
    return {"Authorization": f"Bearer {t}"}


async def update_rdv_in_db(rdv_id: str, fields: dict):
    """Direct DB update — used to set status manually (bypassing pro PATCH which sends notifs)."""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "alomaman")
    cli = AsyncIOMotorClient(mongo_url)
    db = cli[db_name]
    res = await db.rdv.update_one({"id": rdv_id}, {"$set": fields})
    cli.close()
    return res.modified_count


def db_update_rdv(rdv_id, fields):
    return asyncio.get_event_loop().run_until_complete(update_rdv_in_db(rdv_id, fields))


async def cleanup_rdv_ids(ids):
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "alomaman")
    cli = AsyncIOMotorClient(mongo_url)
    db = cli[db_name]
    if ids:
        await db.rdv.delete_many({"id": {"$in": ids}})
    cli.close()


def db_cleanup(ids):
    asyncio.get_event_loop().run_until_complete(cleanup_rdv_ids(ids))


def get_pro_id_for_maman(maman_token):
    r = requests.get(f"{BASE}/professionnels", headers=auth_h(maman_token), timeout=20)
    r.raise_for_status()
    pros = r.json()
    # Use the test pro
    for p in pros:
        if p.get("email") == PRO["email"]:
            return p["id"]
    # fallback first pro
    return pros[0]["id"] if pros else None


def create_rdv(maman_token, pro_id, date_iso, duree_minutes=30):
    payload = {
        "pro_id": pro_id,
        "date": date_iso,
        "motif": "Test fenêtre téléconsultation",
        "type_consultation": "prenatale",
        "mode": "teleconsultation",
    }
    r = requests.post(f"{BASE}/rdv", headers=auth_h(maman_token), json=payload, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"create_rdv failed: {r.status_code} {r.text}")
    body = r.json()
    rdv_id = body["id"]
    # Backend default duree may not be 30. Force duree_minutes via direct DB.
    db_update_rdv(rdv_id, {"duree_minutes": duree_minutes})
    return rdv_id


def set_status(rdv_id, status):
    db_update_rdv(rdv_id, {"status": status})


# ---------- Run tests ----------
def main():
    print("=" * 70)
    print("Téléconsultation TIME-WINDOW backend tests")
    print(f"BASE = {BASE}")
    print("=" * 70)

    # Login
    maman_token, maman_user = login(MAMAN)
    pro_token, pro_user = login(PRO)
    ok(f"Login maman + pro (maman_id={maman_user['id'][:8]}, pro_id={pro_user['id'][:8]})")

    pro_id = pro_user["id"]

    # Build dates
    now = datetime.now(timezone.utc)
    iso_in_2h = (now + timedelta(hours=2)).isoformat()
    iso_now_plus_5min = (now + timedelta(minutes=5)).isoformat()  # ensures inside 15-min-before window
    iso_3h_ago = (now - timedelta(hours=3)).isoformat()
    iso_now_plus_5min_b = (now + timedelta(minutes=5)).isoformat()  # for cancelled scenario
    iso_now_plus_5min_c = (now + timedelta(minutes=5)).isoformat()  # for en_attente scenario

    created_ids = []

    try:
        # Scenario 1: RDV in 2h, confirme (status scheduled)
        rdv_2h = create_rdv(maman_token, pro_id, iso_in_2h, duree_minutes=30)
        set_status(rdv_2h, "confirme")
        created_ids.append(rdv_2h)

        # Scenario 2: RDV now+5min, confirme (status open)
        rdv_now = create_rdv(maman_token, pro_id, iso_now_plus_5min, duree_minutes=30)
        set_status(rdv_now, "confirme")
        created_ids.append(rdv_now)

        # Scenario 3: RDV 3h ago, confirme (status closed). Window: opens=-3h-15min, closes=-3h+30+30=-2h. Now > closes_at.
        rdv_past = create_rdv(maman_token, pro_id, iso_3h_ago, duree_minutes=30)
        set_status(rdv_past, "confirme")
        created_ids.append(rdv_past)

        # Scenario 4: RDV now+5min but cancelled
        rdv_cancelled = create_rdv(maman_token, pro_id, iso_now_plus_5min_b, duree_minutes=30)
        set_status(rdv_cancelled, "annule")
        created_ids.append(rdv_cancelled)

        # Scenario 5: RDV now+5min but en_attente
        rdv_pending = create_rdv(maman_token, pro_id, iso_now_plus_5min_c, duree_minutes=30)
        # default status is en_attente, no need to change
        created_ids.append(rdv_pending)

        ok(f"Created 5 test RDVs: 2h-future={rdv_2h[:8]}, now={rdv_now[:8]}, past={rdv_past[:8]}, cancelled={rdv_cancelled[:8]}, pending={rdv_pending[:8]}")

        # =========================================================
        # SCENARIO 1: Status endpoint - RDV in 2h, confirmed
        # =========================================================
        print("\n[1] Status endpoint - RDV in 2h (confirmed)")
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_2h}", headers=auth_h(maman_token), timeout=20)
        if r.status_code != 200:
            ko("1.0 status returns 200", f"{r.status_code} {r.text}")
        else:
            body = r.json()
            print(f"     body: {json.dumps({k: v for k, v in body.items() if k not in ('rdv_motif',)}, indent=2)[:400]}")
            if body.get("status") == "scheduled":
                ok("1.1 status='scheduled'")
            else:
                ko("1.1 status='scheduled'", f"got status={body.get('status')}")
            if body.get("available") is False:
                ok("1.2 available=false")
            else:
                ko("1.2 available=false", f"got {body.get('available')}")
            sec = body.get("seconds_until_open")
            if sec and 6000 <= sec <= 6700:
                ok(f"1.3 seconds_until_open ~6300 (got {sec})")
            elif sec and sec > 0:
                ok(f"1.3 seconds_until_open > 0 (got {sec}, range loose)")
            else:
                ko("1.3 seconds_until_open > 0", f"got {sec}")
            if body.get("human") and "ouvre" in body.get("human", "").lower():
                ok(f"1.4 human contains 'ouvre' ('{body.get('human')}')")
            else:
                ko("1.4 human readable", f"got '{body.get('human')}'")

        # =========================================================
        # SCENARIO 2: Status endpoint - RDV NOW (within window)
        # =========================================================
        print("\n[2] Status endpoint - RDV in 5 min (within window)")
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_now}", headers=auth_h(maman_token), timeout=20)
        if r.status_code != 200:
            ko("2.0 status returns 200", f"{r.status_code} {r.text}")
        else:
            body = r.json()
            if body.get("status") == "open":
                ok("2.1 status='open'")
            else:
                ko("2.1 status='open'", f"got status={body.get('status')} | body={body}")
            if body.get("available") is True:
                ok("2.2 available=true")
            else:
                ko("2.2 available=true", f"got {body.get('available')}")
            if body.get("human") and "ouverte" in body.get("human", "").lower():
                ok(f"2.3 human contains 'ouverte' ('{body.get('human')}')")
            else:
                ko("2.3 human readable", f"got '{body.get('human')}'")

        # =========================================================
        # SCENARIO 3: Status endpoint - RDV in past
        # =========================================================
        print("\n[3] Status endpoint - RDV 3h ago (closed)")
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_past}", headers=auth_h(maman_token), timeout=20)
        if r.status_code != 200:
            ko("3.0 status returns 200", f"{r.status_code} {r.text}")
        else:
            body = r.json()
            if body.get("status") == "closed":
                ok("3.1 status='closed'")
            else:
                ko("3.1 status='closed'", f"got status={body.get('status')}")
            if body.get("available") is False:
                ok("3.2 available=false")
            else:
                ko("3.2 available=false", f"got {body.get('available')}")
            if body.get("human") and ("terminée" in body.get("human", "").lower() or "fenêtre" in body.get("human", "").lower()):
                ok(f"3.3 human says 'terminée' ('{body.get('human')}')")
            else:
                ko("3.3 human readable", f"got '{body.get('human')}'")

        # =========================================================
        # SCENARIO 4: Status endpoint - RDV cancelled
        # =========================================================
        print("\n[4] Status endpoint - RDV cancelled")
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_cancelled}", headers=auth_h(maman_token), timeout=20)
        if r.status_code != 200:
            ko("4.0 status returns 200", f"{r.status_code} {r.text}")
        else:
            body = r.json()
            if body.get("status") == "cancelled":
                ok("4.1 status='cancelled'")
            else:
                ko("4.1 status='cancelled'", f"got status={body.get('status')}")
            if body.get("available") is False:
                ok("4.2 available=false")
            else:
                ko("4.2 available=false", f"got {body.get('available')}")

        # =========================================================
        # SCENARIO 5: Status endpoint - RDV en_attente (not confirmed)
        # =========================================================
        print("\n[5] Status endpoint - RDV en_attente (not confirmed)")
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_pending}", headers=auth_h(maman_token), timeout=20)
        if r.status_code != 200:
            ko("5.0 status returns 200", f"{r.status_code} {r.text}")
        else:
            body = r.json()
            if body.get("status") == "not_confirmed":
                ok("5.1 status='not_confirmed'")
            else:
                ko("5.1 status='not_confirmed'", f"got status={body.get('status')}")
            if body.get("available") is False:
                ok("5.2 available=false")
            else:
                ko("5.2 available=false", f"got {body.get('available')}")

        # =========================================================
        # SCENARIO 6: Agora-token blocked when not in window (RDV in 2h)
        # =========================================================
        print("\n[6] POST agora-token on RDV in 2h → expect 423")
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_2h}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 423:
            ok(f"6.1 agora-token returns 423 Locked (detail='{r.json().get('detail')}')")
        else:
            ko("6.1 agora-token=423", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 7: Agora-token allowed when in window
        # =========================================================
        print("\n[7] POST agora-token on RDV in 5 min (open) → expect 200")
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_now}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 200:
            body = r.json()
            if all(k in body for k in ["app_id", "channel", "token", "uid", "expires_at"]):
                ok(f"7.1 agora-token=200 with {{app_id,channel,token,uid,expires_at}} (channel={body.get('channel')})")
            else:
                ko("7.1 agora-token full payload", f"missing keys, body={body}")
        else:
            ko("7.1 agora-token=200", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 8: Agora-token blocked when cancelled (410)
        # =========================================================
        print("\n[8] POST agora-token on cancelled RDV → expect 410")
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_cancelled}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 410:
            ok(f"8.1 agora-token returns 410 Gone (detail='{r.json().get('detail')}')")
        else:
            ko("8.1 agora-token=410", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 9: Agora-token blocked when not confirmed (412)
        # =========================================================
        print("\n[9] POST agora-token on en_attente RDV → expect 412")
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_pending}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 412:
            ok(f"9.1 agora-token returns 412 Precondition Failed (detail='{r.json().get('detail')}')")
        else:
            ko("9.1 agora-token=412", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 9.b: Agora-token blocked when RDV is in past (closed) → 410
        # =========================================================
        print("\n[9.b] POST agora-token on past RDV → expect 410")
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_past}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 410:
            ok(f"9.b.1 agora-token returns 410 (closed) (detail='{r.json().get('detail')}')")
        else:
            ko("9.b.1 agora-token=410", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 10: Ring endpoint - same checks
        # =========================================================
        print("\n[10] POST ring — out of window / in window / cancelled / not_confirmed")
        # 10a — RDV in 2h → 423
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_2h}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 423:
            ok("10a ring on scheduled RDV → 423")
        else:
            ko("10a ring=423", f"got {r.status_code} {r.text}")
        # 10b — RDV now → 200
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_now}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 200 and r.json().get("ok") is True:
            ok("10b ring on open RDV → 200 ok=true")
        else:
            ko("10b ring=200", f"got {r.status_code} {r.text}")
        # 10c — cancelled → 410
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_cancelled}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 410:
            ok("10c ring on cancelled RDV → 410")
        else:
            ko("10c ring=410", f"got {r.status_code} {r.text}")
        # 10d — en_attente → 412
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_pending}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 412:
            ok("10d ring on en_attente RDV → 412")
        else:
            ko("10d ring=412", f"got {r.status_code} {r.text}")
        # 10e — past → 410
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_past}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 410:
            ok("10e ring on past RDV → 410")
        else:
            ko("10e ring=410", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 11: Jitsi room endpoint - same checks
        # =========================================================
        print("\n[11] POST room — out of window / in window / cancelled / not_confirmed")
        # 11a — RDV in 2h → 423
        r = requests.post(f"{BASE}/teleconsultation/room/{rdv_2h}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 423:
            ok("11a room on scheduled RDV → 423")
        else:
            ko("11a room=423", f"got {r.status_code} {r.text}")
        # 11b — RDV now → 200
        r = requests.post(f"{BASE}/teleconsultation/room/{rdv_now}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 200 and "room_url" in r.json():
            ok(f"11b room on open RDV → 200 room_url={r.json().get('room_url')}")
        else:
            ko("11b room=200", f"got {r.status_code} {r.text}")
        # 11c — cancelled → 410
        r = requests.post(f"{BASE}/teleconsultation/room/{rdv_cancelled}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 410:
            ok("11c room on cancelled RDV → 410")
        else:
            ko("11c room=410", f"got {r.status_code} {r.text}")
        # 11d — en_attente → 412
        r = requests.post(f"{BASE}/teleconsultation/room/{rdv_pending}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 412:
            ok("11d room on en_attente RDV → 412")
        else:
            ko("11d room=412", f"got {r.status_code} {r.text}")

        # =========================================================
        # SCENARIO 12: Auth and authorization
        # =========================================================
        print("\n[12] Auth & authorization checks")
        # 12a — Without Bearer (status endpoint) → 401/403
        r = requests.get(f"{BASE}/teleconsultation/status/{rdv_now}", timeout=20)
        if r.status_code in (401, 403):
            ok(f"12a status without bearer → {r.status_code}")
        else:
            ko("12a status without bearer → 401/403", f"got {r.status_code} {r.text}")
        # 12b — Without Bearer (agora-token) → 401/403
        r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_now}", timeout=20)
        if r.status_code in (401, 403):
            ok(f"12b agora-token without bearer → {r.status_code}")
        else:
            ko("12b agora-token without bearer → 401/403", f"got {r.status_code} {r.text}")
        # 12c — Without Bearer (ring) → 401/403
        r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_now}", timeout=20)
        if r.status_code in (401, 403):
            ok(f"12c ring without bearer → {r.status_code}")
        else:
            ko("12c ring without bearer → 401/403", f"got {r.status_code} {r.text}")
        # 12d — Without Bearer (room) → 401/403
        r = requests.post(f"{BASE}/teleconsultation/room/{rdv_now}", timeout=20)
        if r.status_code in (401, 403):
            ok(f"12d room without bearer → {r.status_code}")
        else:
            ko("12d room without bearer → 401/403", f"got {r.status_code} {r.text}")

        # 12e — User not in RDV → 403 on status endpoint
        # Register a fresh maman
        ts = int(time.time())
        third = {
            "name": "Fatou TestThird",
            "email": f"third_window_{ts}@test.alomaman.dev",
            "phone": f"+22507{ts % 10000000:07d}",
            "password": "Third1234!",
            "role": "maman",
            "ville": "Abidjan",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        }
        rr = requests.post(f"{BASE}/auth/register", json=third, timeout=20)
        if rr.status_code != 200:
            ko("12e register third maman", f"{rr.status_code} {rr.text}")
            third_token = None
        else:
            third_token = rr.json()["token"]
            # 12e — third maman → status of rdv_now → 403
            r = requests.get(f"{BASE}/teleconsultation/status/{rdv_now}", headers=auth_h(third_token), timeout=20)
            if r.status_code == 403:
                ok("12e status by third party → 403")
            else:
                ko("12e status by third party → 403", f"got {r.status_code} {r.text}")
            # 12f — third maman → agora on rdv_now → 403
            r = requests.post(f"{BASE}/teleconsultation/agora-token/{rdv_now}", headers=auth_h(third_token), timeout=20)
            if r.status_code == 403:
                ok("12f agora-token by third party → 403")
            else:
                ko("12f agora-token by third party → 403", f"got {r.status_code} {r.text}")
            # 12g — ring by third → 403
            r = requests.post(f"{BASE}/teleconsultation/ring/{rdv_now}", headers=auth_h(third_token), timeout=20)
            if r.status_code == 403:
                ok("12g ring by third party → 403")
            else:
                ko("12g ring by third party → 403", f"got {r.status_code} {r.text}")
            # 12h — room by third → 403
            r = requests.post(f"{BASE}/teleconsultation/room/{rdv_now}", headers=auth_h(third_token), timeout=20)
            if r.status_code == 403:
                ok("12h room by third party → 403")
            else:
                ko("12h room by third party → 403", f"got {r.status_code} {r.text}")
            # cleanup third maman
            try:
                requests.delete(
                    f"{BASE}/auth/me",
                    headers=auth_h(third_token),
                    json={"password": "Third1234!", "confirmation": "SUPPRIMER"},
                    timeout=20,
                )
            except Exception:
                pass

        # 12i — non-existent rdv → 404 on status
        r = requests.get(f"{BASE}/teleconsultation/status/non-existent-xyz-123", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 404:
            ok("12i status with bad rdv_id → 404")
        else:
            ko("12i status with bad rdv_id → 404", f"got {r.status_code} {r.text}")
        # 12j — bad rdv on agora-token → 404
        r = requests.post(f"{BASE}/teleconsultation/agora-token/non-existent-xyz-123", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 404:
            ok("12j agora-token with bad rdv_id → 404")
        else:
            ko("12j agora-token with bad rdv_id → 404", f"got {r.status_code} {r.text}")
        # 12k — ring 404
        r = requests.post(f"{BASE}/teleconsultation/ring/non-existent-xyz-123", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 404:
            ok("12k ring with bad rdv_id → 404")
        else:
            ko("12k ring with bad rdv_id → 404", f"got {r.status_code} {r.text}")
        # 12l — room 404
        r = requests.post(f"{BASE}/teleconsultation/room/non-existent-xyz-123", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 404:
            ok("12l room with bad rdv_id → 404")
        else:
            ko("12l room with bad rdv_id → 404", f"got {r.status_code} {r.text}")

    finally:
        # Cleanup test RDVs
        if created_ids:
            db_cleanup(created_ids)
            print(f"\n🧹 Cleanup: deleted {len(created_ids)} test RDVs")

    # Summary
    print("\n" + "=" * 70)
    print(f"RESULT: {len(PASSES)}/{len(PASSES) + len(FAILS)} PASS")
    print("=" * 70)
    if FAILS:
        print("\n❌ FAILURES:")
        for f in FAILS:
            print(f"   - {f}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
