#!/usr/bin/env python3
"""
Tests for NEW additions to the Grossesse + Premium module:
  A. New medical alerts (paludisme, anémie, pré-éclampsie combinée)
  B. AES-256 encryption at rest for tracking.notes and journal.content/photo_base64
  C. Auto-generated CPN reminders (source='grossesse_plus_cpn')
  D. Regression checks
"""
import os
import sys
import json
import asyncio
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BACKEND_URL = "https://cycle-tracker-pro.preview.emergentagent.com/api"
EMAIL = "maman.test@alomaman.dev"
PASSWORD = "Test1234!"

results = []  # (test_num, label, status, detail)


def rec(num, label, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((num, label, status, detail))
    icon = "✅" if ok else "❌"
    print(f"{icon} [{num}] {label}: {status}" + (f" — {detail}" if detail else ""))


def login():
    r = requests.post(f"{BACKEND_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def ensure_active_grossesse(token):
    """Ensure maman has an active grossesse around 2025-12-01 (~SA 24)."""
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/setup",
        headers=headers(token),
        json={"source": "ddr", "date_debut": "2025-12-01T00:00:00Z"},
        timeout=30,
    )
    if r.status_code != 200:
        print(f"⚠️ setup failed: {r.status_code} {r.text}")
    return r


async def get_mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "alomaman")
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


# =================================================================
# Run all tests
# =================================================================
def main():
    print("=" * 70)
    print("Logging in as", EMAIL)
    token, user = login()
    user_id = user["id"]
    print("user_id:", user_id, "role:", user.get("role"), "premium:", user.get("premium"))

    # Ensure premium + active grossesse
    ensure_active_grossesse(token)

    # =============================================================
    # A. New medical alerts
    # =============================================================
    print("\n--- A. NEW MEDICAL ALERTS ---")

    created_tracking_ids = []

    # Test 1 — temperature 39.0 → critical "paludisme"
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"temperature": 39.0},
        timeout=30,
    )
    ok = r.status_code == 200
    if ok:
        body = r.json()
        created_tracking_ids.append(body.get("id"))
        alerts = body.get("alerts", [])
        crit = [a for a in alerts if a.get("level") == "critical" and "paludisme" in (a.get("title") or "").lower()]
        ok = bool(crit)
        rec(1, "POST tracking temp=39.0 → critical with 'paludisme'", ok,
            f"alerts={alerts}")
    else:
        rec(1, "POST tracking temp=39.0", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 2 — temperature 37.9 → warning "Fébricule"
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"temperature": 37.9},
        timeout=30,
    )
    ok = r.status_code == 200
    if ok:
        body = r.json()
        created_tracking_ids.append(body.get("id"))
        alerts = body.get("alerts", [])
        warn = [a for a in alerts if a.get("level") == "warning" and "fébricule" in (a.get("title") or "").lower()]
        ok = bool(warn)
        rec(2, "POST tracking temp=37.9 → warning 'Fébricule'", ok, f"alerts={alerts}")
    else:
        rec(2, "POST tracking temp=37.9", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 3 — symptomes fatigue+essoufflement (trim 2/3) → warning anémie
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"symptomes": ["fatigue", "essoufflement"]},
        timeout=30,
    )
    ok = r.status_code == 200
    if ok:
        body = r.json()
        created_tracking_ids.append(body.get("id"))
        alerts = body.get("alerts", [])
        warn = [a for a in alerts if a.get("level") == "warning" and "anémie" in (a.get("title") or "").lower()]
        ok = bool(warn)
        rec(3, "POST tracking symptomes=fatigue+essoufflement → warning 'anémie'", ok,
            f"alerts={alerts}")
    else:
        rec(3, "POST tracking symptomes fatigue+essoufflement", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 4 — œdèmes + tension 145/92 → critical pré-éclampsie combinée
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"symptomes": ["œdèmes"], "tension_sys": 145, "tension_dia": 92},
        timeout=30,
    )
    ok = r.status_code == 200
    if ok:
        body = r.json()
        created_tracking_ids.append(body.get("id"))
        alerts = body.get("alerts", [])
        crit = [a for a in alerts if a.get("level") == "critical" and "pré-éclampsie" in (a.get("title") or "").lower()]
        ok = bool(crit)
        rec(4, "POST tracking œdèmes+145/92 → critical 'pré-éclampsie' combinée", ok,
            f"alerts={alerts}")
    else:
        rec(4, "POST tracking œdèmes+145/92", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 5 — symptomes nausées only with week=8 → no anemia warning
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"symptomes": ["nausées"], "week": 8},
        timeout=30,
    )
    ok = r.status_code == 200
    if ok:
        body = r.json()
        created_tracking_ids.append(body.get("id"))
        alerts = body.get("alerts", [])
        anemia = [a for a in alerts if "anémie" in (a.get("title") or "").lower()]
        ok = (len(anemia) == 0)
        rec(5, "POST tracking nausées 1st trim → NO anémie warning", ok, f"alerts={alerts}")
    else:
        rec(5, "POST tracking nausées 1st trim", False, f"HTTP {r.status_code} {r.text[:200]}")

    # =============================================================
    # B. AES-256 Encryption at rest
    # =============================================================
    print("\n--- B. AES-256 ENCRYPTION AT REST ---")

    SECRET_NOTES = "Mes notes très privées"

    # Test 6 — POST notes → response has clear notes
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/tracking",
        headers=headers(token),
        json={"notes": SECRET_NOTES},
        timeout=30,
    )
    ok = r.status_code == 200
    tid_notes = None
    if ok:
        body = r.json()
        tid_notes = body.get("id")
        created_tracking_ids.append(tid_notes)
        ok = (body.get("notes") == SECRET_NOTES)
        rec(6, "POST tracking notes → response has CLEAR notes", ok,
            f"got notes={body.get('notes')!r}")
    else:
        rec(6, "POST tracking notes", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 7 — GET /tracking returns clear notes
    r = requests.get(f"{BACKEND_URL}/grossesse-plus/tracking", headers=headers(token), timeout=30)
    ok = r.status_code == 200
    if ok:
        items = r.json().get("items", [])
        # find item with notes == clear
        matching = [it for it in items if it.get("notes") == SECRET_NOTES]
        ok = bool(matching)
        rec(7, "GET /tracking returns clear (decrypted) notes", ok,
            f"matching_count={len(matching)} (total={len(items)})")
    else:
        rec(7, "GET /tracking", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 8 — verify raw notes in MongoDB are ENCRYPTED
    async def check_mongo_notes():
        client, db = await get_mongo_db()
        try:
            raw = await db.grossesse_tracking.find_one(
                {"user_id": user_id, "notes": {"$ne": None}},
                sort=[("created_at", -1)],
            )
            return raw
        finally:
            client.close()

    raw_doc = asyncio.run(check_mongo_notes())
    if raw_doc:
        raw_notes = raw_doc.get("notes")
        print(f"  RAW DB notes value: {raw_notes!r}")
        is_encrypted = (
            isinstance(raw_notes, str)
            and raw_notes != SECRET_NOTES
            and (raw_notes.startswith("enc_v1:") or raw_notes.startswith("gAAAAA"))
            and len(raw_notes) >= 30
        )
        rec(8, "DB raw notes is ENCRYPTED (not plaintext)", is_encrypted,
            f"raw={raw_notes!r}")
    else:
        rec(8, "DB raw notes is ENCRYPTED", False, "no tracking doc with notes found")

    # Test 9 — Journal: content encrypted at rest, clear on GET
    JOURNAL_CONTENT = "Premier coup de pied"
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/journal",
        headers=headers(token),
        json={"content": JOURNAL_CONTENT, "type": "souvenir"},
        timeout=30,
    )
    ok = r.status_code == 200
    journal_id = None
    if ok:
        body = r.json()
        journal_id = body.get("id")
        # check response decrypted
        ok = body.get("content") == JOURNAL_CONTENT

    # check raw db
    async def check_journal():
        client, db = await get_mongo_db()
        try:
            raw = await db.grossesse_journal.find_one({"id": journal_id})
            return raw
        finally:
            client.close()

    if journal_id:
        raw_j = asyncio.run(check_journal())
        raw_content = raw_j.get("content") if raw_j else None
        print(f"  RAW DB journal.content: {raw_content!r}")
        is_encrypted = (
            isinstance(raw_content, str)
            and raw_content != JOURNAL_CONTENT
            and (raw_content.startswith("enc_v1:") or raw_content.startswith("gAAAAA"))
        )
        # GET /journal
        rg = requests.get(f"{BACKEND_URL}/grossesse-plus/journal", headers=headers(token), timeout=30)
        gets_clear = False
        if rg.status_code == 200:
            for it in rg.json():
                if it.get("id") == journal_id and it.get("content") == JOURNAL_CONTENT:
                    gets_clear = True
                    break
        rec(9, "Journal: content encrypted at rest, GET returns clear", is_encrypted and gets_clear,
            f"raw={raw_content!r}, gets_clear={gets_clear}")
    else:
        rec(9, "Journal content encryption", False, f"POST failed: HTTP {r.status_code} {r.text[:200]}")

    # Test 10 — Journal with photo_base64
    PHOTO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA"
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/journal",
        headers=headers(token),
        json={"content": "Echo", "type": "echographie", "photo_base64": PHOTO_B64},
        timeout=30,
    )
    ok = r.status_code == 200
    photo_journal_id = None
    if ok:
        body = r.json()
        photo_journal_id = body.get("id")

    async def check_journal_photo():
        client, db = await get_mongo_db()
        try:
            return await db.grossesse_journal.find_one({"id": photo_journal_id})
        finally:
            client.close()

    if photo_journal_id:
        raw_j = asyncio.run(check_journal_photo())
        raw_photo = raw_j.get("photo_base64") if raw_j else None
        print(f"  RAW DB journal.photo_base64 (first 80): {(raw_photo or '')[:80]!r}")
        photo_encrypted = (
            isinstance(raw_photo, str)
            and raw_photo != PHOTO_B64
            and (raw_photo.startswith("enc_v1:") or raw_photo.startswith("gAAAAA"))
        )
        # GET should return clear
        rg = requests.get(f"{BACKEND_URL}/grossesse-plus/journal", headers=headers(token), timeout=30)
        gets_photo_clear = False
        if rg.status_code == 200:
            for it in rg.json():
                if it.get("id") == photo_journal_id and it.get("photo_base64") == PHOTO_B64:
                    gets_photo_clear = True
                    break
        rec(10, "Journal: photo_base64 encrypted at rest, GET returns clear",
            photo_encrypted and gets_photo_clear,
            f"raw_starts={(raw_photo or '')[:30]!r}, gets_clear={gets_photo_clear}")
    else:
        rec(10, "Journal photo_base64 encryption", False, f"POST failed: HTTP {r.status_code} {r.text[:200]}")

    # =============================================================
    # C. Auto-generated CPN reminders
    # =============================================================
    print("\n--- C. AUTO CPN REMINDERS ---")

    # Test 11 — setup with ddr=2025-12-01 → grossesse created
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/setup",
        headers=headers(token),
        json={"source": "ddr", "date_debut": "2025-12-01T00:00:00Z"},
        timeout=30,
    )
    ok = r.status_code == 200 and r.json().get("active") is True
    rec(11, "POST setup ddr=2025-12-01 → grossesse created (active=true)", ok,
        f"HTTP {r.status_code}")

    # Test 12 — GET /reminders contains grossesse_plus_cpn reminders
    r = requests.get(f"{BACKEND_URL}/reminders", headers=headers(token), timeout=30)
    if r.status_code == 200:
        rems = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        cpn_rems = [x for x in rems if x.get("source") == "grossesse_plus_cpn"]
        now = datetime.now(timezone.utc)
        # check all due_at in future
        all_future = True
        bad = []
        for x in cpn_rems:
            try:
                due_str = x.get("due_at") or ""
                due_dt = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
                if due_dt.tzinfo is None:
                    due_dt = due_dt.replace(tzinfo=timezone.utc)
                if due_dt <= now:
                    all_future = False
                    bad.append(due_str)
            except Exception as e:
                all_future = False
                bad.append(f"parse_err:{e}")
        all_titles_pref = all((x.get("title") or "").startswith("📅 ") for x in cpn_rems)
        # Check HGPO (week 24) or écho (week 22/32)
        has_target = any(
            "hgpo" in (x.get("title") or "").lower()
            or "échographie" in (x.get("title") or "").lower()
            or "echographie" in (x.get("title") or "").lower()
            for x in cpn_rems
        )
        ok = bool(cpn_rems) and all_future and all_titles_pref and has_target
        rec(12, "GET /reminders has grossesse_plus_cpn (future, '📅 ' prefix, HGPO/écho)",
            ok,
            f"count={len(cpn_rems)} all_future={all_future} bad={bad} prefix_ok={all_titles_pref} has_target={has_target}")
        cpn_count_first = len(cpn_rems)
    else:
        rec(12, "GET /reminders", False, f"HTTP {r.status_code} {r.text[:200]}")
        cpn_count_first = 0

    # Test 13 — setup again with same DDR → no duplicates
    r = requests.post(
        f"{BACKEND_URL}/grossesse-plus/setup",
        headers=headers(token),
        json={"source": "ddr", "date_debut": "2025-12-01T00:00:00Z"},
        timeout=30,
    )
    setup_ok = r.status_code == 200
    if setup_ok:
        r2 = requests.get(f"{BACKEND_URL}/reminders", headers=headers(token), timeout=30)
        rems2 = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        cpn_rems2 = [x for x in rems2 if x.get("source") == "grossesse_plus_cpn"]
        cpn_count_second = len(cpn_rems2)
        ok = (cpn_count_second == cpn_count_first) and cpn_count_second > 0
        rec(13, "Re-setup same DDR → CPN reminders deleted+recreated (no duplicates)",
            ok,
            f"first={cpn_count_first} second={cpn_count_second}")
    else:
        rec(13, "Re-setup same DDR", False, f"HTTP {r.status_code}")

    # =============================================================
    # D. Regression checks
    # =============================================================
    print("\n--- D. REGRESSION CHECKS ---")

    # Test 14 — dashboard
    r = requests.get(f"{BACKEND_URL}/grossesse-plus/dashboard", headers=headers(token), timeout=30)
    if r.status_code == 200:
        body = r.json()
        has_keys = all(k in body for k in ("weeks", "dpa", "progression_pct"))
        rec(14, "GET /grossesse-plus/dashboard 200 with weeks/dpa/progression", has_keys,
            f"weeks={body.get('weeks')} dpa={body.get('dpa')} progression_pct={body.get('progression_pct')}")
    else:
        rec(14, "GET /grossesse-plus/dashboard", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 15 — cpn
    r = requests.get(f"{BACKEND_URL}/grossesse-plus/cpn", headers=headers(token), timeout=30)
    if r.status_code == 200:
        body = r.json()
        ok = "schedule" in body and "next" in body
        rec(15, "GET /grossesse-plus/cpn returns schedule + next", ok,
            f"current_week={body.get('current_week')} next={body.get('next')}")
    else:
        rec(15, "GET /grossesse-plus/cpn", False, f"HTTP {r.status_code} {r.text[:200]}")

    # Test 16 — Full lifecycle: setup → tracking → journal → contractions → trousseau → declare
    print("\n  Lifecycle...")
    lc_errors = []

    # setup
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/setup", headers=headers(token),
                     json={"source": "ddr", "date_debut": "2025-12-01T00:00:00Z"}, timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"setup HTTP {r.status_code}")
    # tracking
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/tracking", headers=headers(token),
                     json={"poids_kg": 62.0, "tension_sys": 110, "tension_dia": 70}, timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"tracking HTTP {r.status_code}")
    # journal
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/journal", headers=headers(token),
                     json={"content": "Lifecycle test", "type": "note"}, timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"journal HTTP {r.status_code}")
    # contractions
    start = datetime.now(timezone.utc).isoformat()
    end = (datetime.now(timezone.utc).replace(microsecond=0)).isoformat()
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/contractions", headers=headers(token),
                     json={"started_at": start, "ended_at": end, "intensity": "moyenne"}, timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"contractions HTTP {r.status_code} {r.text[:200]}")
    # trousseau
    r = requests.get(f"{BACKEND_URL}/grossesse-plus/trousseau", headers=headers(token), timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"trousseau HTTP {r.status_code}")
    # declare-naissance
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/declarer-naissance", headers=headers(token),
                     json={"nom": "Bébé Test Lifecycle", "sexe": "F", "date_naissance": "2026-08-30"},
                     timeout=30)
    if r.status_code != 200:
        lc_errors.append(f"declarer-naissance HTTP {r.status_code} {r.text[:200]}")

    rec(16, "Full lifecycle: setup → tracking → journal → contractions → trousseau → declarer-naissance",
        not lc_errors,
        f"errors={lc_errors}" if lc_errors else "all 200")

    # =============================================================
    # CLEANUP: restore grossesse active for future runs
    # =============================================================
    print("\n--- CLEANUP ---")

    # Re-setup grossesse so subsequent tests still have an active grossesse
    r = requests.post(f"{BACKEND_URL}/grossesse-plus/setup", headers=headers(token),
                     json={"source": "ddr", "date_debut": "2025-12-01T00:00:00Z"}, timeout=30)
    print(f"  Re-setup grossesse: HTTP {r.status_code}")

    # Cleanup test tracking entries
    for tid in created_tracking_ids:
        if tid:
            requests.delete(f"{BACKEND_URL}/grossesse-plus/tracking/{tid}", headers=headers(token), timeout=10)
    print(f"  Deleted {len(created_tracking_ids)} tracking entries")

    # Cleanup test journal entries
    for jid in [journal_id, photo_journal_id]:
        if jid:
            requests.delete(f"{BACKEND_URL}/grossesse-plus/journal/{jid}", headers=headers(token), timeout=10)
    print("  Deleted test journal entries")

    # =============================================================
    # SUMMARY
    # =============================================================
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for x in results if x[2] == "PASS")
    failed = sum(1 for x in results if x[2] == "FAIL")
    for num, label, status, detail in results:
        icon = "✅" if status == "PASS" else "❌"
        print(f"{icon} [{num}] {label}: {status}")
        if status == "FAIL" and detail:
            print(f"     → {detail}")
    print(f"\nTOTAL: {passed} PASS / {failed} FAIL / {len(results)} TOTAL")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
