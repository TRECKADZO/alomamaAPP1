#!/usr/bin/env python3
"""
Backend tests for the Grossesse + Premium module.

All endpoints under /api/grossesse-plus/* are tested:
  - Public weekly content (no auth)
  - Dashboard (Premium-only)
  - Setup grossesse (ddr / dpa)
  - Medical tracking + automated alerts
  - Journal (notes, photos, mood)
  - Contractions counter + advice analysis
  - Trousseau (default 17 items + save state)
  - Consent (granular sharing)
  - Breathing exercises
  - CPN schedule
  - Declarer naissance (creates enfant + closes grossesse)
  - Premium gating ACL

Reads REACT_APP_BACKEND_URL/EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env.
Reads MONGO_URL from /app/backend/.env (for premium toggle and cleanup).
"""

import asyncio
import os
import sys
import json
import base64
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from motor.motor_asyncio import AsyncIOMotorClient


def load_env(path: str) -> dict:
    out = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return out


fe = load_env("/app/frontend/.env")
be = load_env("/app/backend/.env")
BASE = (
    fe.get("EXPO_PUBLIC_BACKEND_URL")
    or fe.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8001"
)
API = BASE.rstrip("/") + "/api"
MONGO_URL = be.get("MONGO_URL")
DB_NAME = be.get("DB_NAME", "alomaman")

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"


# ---------- helpers --------------------------------------------------------
RESULTS = []  # list of (name, status, detail)


def record(name: str, ok: bool, detail: str = ""):
    RESULTS.append((name, ok, detail))
    emoji = "✅" if ok else "❌"
    print(f"{emoji} {name}" + (f"  — {detail}" if detail else ""))


def login(email: str, password: str) -> Optional[str]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        print(f"   login failed for {email}: {r.status_code} {r.text[:200]}")
        return None
    return r.json().get("token")


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_user(token: str) -> dict:
    return requests.get(f"{API}/auth/me", headers=auth(token), timeout=20).json()


# ---------- async DB helpers ----------------------------------------------
async def set_premium(maman_id: str, value: bool, days: int = 30):
    cli = AsyncIOMotorClient(MONGO_URL)
    try:
        db = cli[DB_NAME]
        if value:
            until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
            await db.users.update_one({"id": maman_id}, {"$set": {"premium": True, "premium_until": until}})
        else:
            await db.users.update_one({"id": maman_id}, {"$set": {"premium": False}})
    finally:
        cli.close()


async def ensure_grossesse(maman_id: str, date_debut_iso: str):
    """Idempotent: réactive une grossesse active avec la DDR voulue, désactive les autres."""
    cli = AsyncIOMotorClient(MONGO_URL)
    try:
        db = cli[DB_NAME]
        await db.grossesses.update_many(
            {"user_id": maman_id, "active": True}, {"$set": {"active": False}}
        )
        import uuid as _uuid
        doc = {
            "id": str(_uuid.uuid4()),
            "user_id": maman_id,
            "date_debut": date_debut_iso,
            "date_terme": None,
            "source": "ddr",
            "active": True,
            "premium_module": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.grossesses.insert_one(doc)
        return doc["id"]
    finally:
        cli.close()


async def cleanup_test_data(maman_id: str):
    """Restore initial state: grossesse active date_debut=2025-12-01, premium on, no new enfants/journal/tracking/contractions created by the test."""
    cli = AsyncIOMotorClient(MONGO_URL)
    try:
        db = cli[DB_NAME]
        # Drop everything created during this test run
        await db.grossesse_tracking.delete_many({"user_id": maman_id})
        await db.grossesse_journal.delete_many({"user_id": maman_id})
        await db.grossesse_contractions.delete_many({"user_id": maman_id})
        # Delete the test-created enfant
        await db.enfants.delete_many({"user_id": maman_id, "nom": {"$regex": "^Bébé Test"}})
        # Disable all grossesses and recreate the original one
        await db.grossesses.delete_many({"user_id": maman_id})
        import uuid as _uuid
        await db.grossesses.insert_one({
            "id": str(_uuid.uuid4()),
            "user_id": maman_id,
            "date_debut": "2025-12-01",
            "date_terme": "2026-09-08",
            "source": "ddr",
            "active": True,
            "premium_module": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Re-enable premium
        until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.users.update_one(
            {"id": maman_id},
            {"$set": {"premium": True, "premium_until": until}},
        )
    finally:
        cli.close()


# ============== TESTS ======================================================
def test_public_weekly():
    print("\n========== 1. PUBLIC WEEKLY CONTENT ==========")
    r = requests.get(f"{API}/grossesse-plus/week/12", timeout=20)
    ok = r.status_code == 200 and all(
        k in r.json() for k in ("size_cm", "weight_g", "fruit", "emoji", "dev", "changes", "tip", "trimester")
    )
    record("GET /grossesse-plus/week/12 returns full fiche", ok,
           f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:80]}")

    r = requests.get(f"{API}/grossesse-plus/week/3", timeout=20)
    record("GET /grossesse-plus/week/3 → 400 (out of range)", r.status_code == 400, f"status={r.status_code}")

    r = requests.get(f"{API}/grossesse-plus/week/42", timeout=20)
    record("GET /grossesse-plus/week/42 → 400 (out of range)", r.status_code == 400, f"status={r.status_code}")

    r = requests.get(f"{API}/grossesse-plus/weeks", timeout=20)
    weeks_list = r.json() if r.status_code == 200 else []
    record(
        "GET /grossesse-plus/weeks returns 38 weeks (4→41)",
        r.status_code == 200 and isinstance(weeks_list, list) and len(weeks_list) == 38
        and weeks_list[0]["week"] == 4 and weeks_list[-1]["week"] == 41,
        f"count={len(weeks_list)}",
    )


def test_dashboard(maman_token: str, pro_token: str):
    print("\n========== 2. DASHBOARD (PREMIUM GATING) ==========")
    # Premium maman → 200
    r = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    keys_ok = all(k in body for k in ("weeks", "days", "dpa", "days_to_dpa", "progression_pct", "current_week_content"))
    record(
        "GET /grossesse-plus/dashboard (Premium maman) → 200 with all keys",
        r.status_code == 200 and keys_ok,
        f"status={r.status_code} weeks={body.get('weeks')} dpa={body.get('dpa', '')[:10]} progression={body.get('progression_pct')}",
    )

    # No auth → 401/403
    r2 = requests.get(f"{API}/grossesse-plus/dashboard", timeout=20)
    record(
        "GET /grossesse-plus/dashboard (no auth) → 401/403",
        r2.status_code in (401, 403),
        f"status={r2.status_code}",
    )

    # Pro user → 403 (role check)
    r3 = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(pro_token), timeout=20)
    record(
        "GET /grossesse-plus/dashboard (pro user) → 403",
        r3.status_code == 403,
        f"status={r3.status_code}",
    )


def test_dashboard_non_premium(maman_token: str, maman_id: str):
    # Disable premium temporarily and verify 402 with detail.error=premium_required
    print("\n----- Disable premium + check 402 -----")
    asyncio.run(set_premium(maman_id, False))
    # Re-login? Token still works because user is fetched from DB on each request.
    r = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(maman_token), timeout=20)
    ok_status = r.status_code == 402
    body = {}
    err = None
    try:
        body = r.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            err = detail.get("error")
    except Exception:
        pass
    record(
        "GET /grossesse-plus/dashboard (non-premium maman) → 402 with detail.error='premium_required'",
        ok_status and err == "premium_required",
        f"status={r.status_code} err={err}",
    )

    # Also verify tracking gated
    r2 = requests.get(f"{API}/grossesse-plus/tracking", headers=auth(maman_token), timeout=20)
    record(
        "GET /grossesse-plus/tracking (non-premium maman) → 402",
        r2.status_code == 402,
        f"status={r2.status_code}",
    )

    # Re-enable premium
    asyncio.run(set_premium(maman_id, True))


def test_setup(maman_token: str):
    print("\n========== 3. SETUP GROSSESSE ==========")
    # DDR source
    r = requests.post(
        f"{API}/grossesse-plus/setup",
        headers=auth(maman_token),
        json={"source": "ddr", "date_debut": "2026-01-01"},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /grossesse-plus/setup {source=ddr, date_debut=2026-01-01} → 200, active=True",
        r.status_code == 200 and body.get("active") is True and body.get("source") == "ddr",
        f"status={r.status_code} active={body.get('active')} date_debut={body.get('date_debut')}",
    )

    # DPA source (retroactive DDR = DPA-280j)
    r2 = requests.post(
        f"{API}/grossesse-plus/setup",
        headers=auth(maman_token),
        json={"source": "dpa", "date_terme": "2026-10-15"},
        timeout=20,
    )
    body2 = r2.json() if r2.status_code == 200 else {}
    expected_ddr = (datetime.fromisoformat("2026-10-15") - timedelta(days=280)).date().isoformat()
    ddr_field = (body2.get("date_debut") or "")[:10]
    record(
        "POST /grossesse-plus/setup {source=dpa, date_terme=2026-10-15} → 200, DDR ≈ DPA-280j",
        r2.status_code == 200 and ddr_field == expected_ddr,
        f"status={r2.status_code} ddr={ddr_field} expected={expected_ddr}",
    )

    # Missing date for ddr → 400
    r3 = requests.post(
        f"{API}/grossesse-plus/setup",
        headers=auth(maman_token),
        json={"source": "ddr"},
        timeout=20,
    )
    record(
        "POST /grossesse-plus/setup {source=ddr} without date_debut → 400",
        r3.status_code == 400,
        f"status={r3.status_code}",
    )

    # Missing date_terme for dpa → 400
    r4 = requests.post(
        f"{API}/grossesse-plus/setup",
        headers=auth(maman_token),
        json={"source": "dpa"},
        timeout=20,
    )
    record(
        "POST /grossesse-plus/setup {source=dpa} without date_terme → 400",
        r4.status_code == 400,
        f"status={r4.status_code}",
    )


def test_tracking(maman_token: str, maman_id: str):
    print("\n========== 4. MEDICAL TRACKING + ALERTS ==========")
    # Reset to known good grossesse (so weekly age aligns ~SA 23 from 2025-12-01)
    asyncio.run(ensure_grossesse(maman_id, "2025-12-01"))

    # Wipe past tracking from previous test runs (use pymongo sync client)
    import pymongo
    pc = pymongo.MongoClient(MONGO_URL)
    pc[DB_NAME].grossesse_tracking.delete_many({"user_id": maman_id})
    pc.close()

    # Tension warning 145/92
    r = requests.post(
        f"{API}/grossesse-plus/tracking",
        headers=auth(maman_token),
        json={"poids_kg": 62.5, "tension_sys": 145, "tension_dia": 92},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts") or []
    has_warn = any(a.get("level") == "warning" and "Tension élevée" in a.get("title", "") for a in alerts)
    record(
        "POST /tracking 145/92 → 200, warning alert 'Tension élevée'",
        r.status_code == 200 and has_warn,
        f"status={r.status_code} alerts={[(a.get('level'), a.get('title')) for a in alerts]}",
    )

    # Tension critical 165/115
    r = requests.post(
        f"{API}/grossesse-plus/tracking",
        headers=auth(maman_token),
        json={"tension_sys": 165, "tension_dia": 115},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts") or []
    has_crit = any(a.get("level") == "critical" and "Tension très élevée" in a.get("title", "") for a in alerts)
    record(
        "POST /tracking 165/115 → CRITICAL 'Tension très élevée'",
        r.status_code == 200 and has_crit,
        f"status={r.status_code} alerts={[(a.get('level'), a.get('title')) for a in alerts]}",
    )

    # Glycemie critical 1.45
    r = requests.post(
        f"{API}/grossesse-plus/tracking",
        headers=auth(maman_token),
        json={"glycemie": 1.45},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts") or []
    has_glycemie = any(a.get("level") == "critical" and "Glycémie" in a.get("title", "") for a in alerts)
    record(
        "POST /tracking glycemie=1.45 → CRITICAL glycémie alert",
        r.status_code == 200 and has_glycemie,
        f"status={r.status_code} alerts={[(a.get('level'), a.get('title')) for a in alerts]}",
    )

    # Fever critical 38.7
    r = requests.post(
        f"{API}/grossesse-plus/tracking",
        headers=auth(maman_token),
        json={"temperature": 38.7},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts") or []
    has_fever = any(a.get("level") == "critical" and "Fièvre" in a.get("title", "") for a in alerts)
    record(
        "POST /tracking temperature=38.7 → CRITICAL 'Fièvre'",
        r.status_code == 200 and has_fever,
        f"status={r.status_code} alerts={[(a.get('level'), a.get('title')) for a in alerts]}",
    )

    # Rapid weight gain: first POST already created poids=62.5; now 64.5 (+2 kg) → warning
    r = requests.post(
        f"{API}/grossesse-plus/tracking",
        headers=auth(maman_token),
        json={"poids_kg": 64.5},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    alerts = body.get("alerts") or []
    has_wgain = any(a.get("level") == "warning" and "Prise de poids" in a.get("title", "") for a in alerts)
    record(
        "POST /tracking poids 62.5 → 64.5 (+2kg) → warning 'Prise de poids rapide'",
        r.status_code == 200 and has_wgain,
        f"status={r.status_code} alerts={[(a.get('level'), a.get('title')) for a in alerts]}",
    )

    # GET tracking
    r = requests.get(f"{API}/grossesse-plus/tracking", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    record(
        "GET /grossesse-plus/tracking returns items + weight_series + tension_series",
        r.status_code == 200 and all(k in body for k in ("items", "weight_series", "tension_series"))
        and isinstance(body["items"], list) and len(body["items"]) >= 5,
        f"status={r.status_code} count={body.get('count')} weight_series={len(body.get('weight_series', []))} tension_series={len(body.get('tension_series', []))}",
    )

    # DELETE the last tracking
    items = body.get("items") or []
    if items:
        tid = items[-1]["id"]
        r = requests.delete(f"{API}/grossesse-plus/tracking/{tid}", headers=auth(maman_token), timeout=20)
        record(
            f"DELETE /grossesse-plus/tracking/{tid[:8]}…",
            r.status_code == 200 and r.json().get("deleted") is True,
            f"status={r.status_code}",
        )


def test_journal(maman_token: str):
    print("\n========== 5. JOURNAL ==========")
    r = requests.post(
        f"{API}/grossesse-plus/journal",
        headers=auth(maman_token),
        json={"content": "Premier mouvement ressenti aujourd'hui ! 🥰", "type": "souvenir", "mood": "heureuse"},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /journal souvenir mood=heureuse",
        r.status_code == 200 and body.get("type") == "souvenir" and body.get("mood") == "heureuse",
        f"status={r.status_code}",
    )

    fake_jpg = base64.b64encode(b"\xff\xd8\xff\xe0fakejpgdata").decode()
    photo_b64 = f"data:image/jpeg;base64,{fake_jpg}"
    r = requests.post(
        f"{API}/grossesse-plus/journal",
        headers=auth(maman_token),
        json={"content": "Echo morpho 22 SA", "type": "echographie", "photo_base64": photo_b64},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /journal echographie + photo_base64",
        r.status_code == 200 and body.get("photo_base64") == photo_b64 and body.get("type") == "echographie",
        f"status={r.status_code}",
    )

    # Empty content → validation error (Pydantic Field accepts empty string by default,
    # but the route checks content : str (required, no min_length) so empty string is allowed
    # functionally. Let's verify the actual behaviour.
    r = requests.post(
        f"{API}/grossesse-plus/journal",
        headers=auth(maman_token),
        json={"content": ""},
        timeout=20,
    )
    record(
        "POST /journal empty content (note: model has no min_length validation)",
        r.status_code in (200, 400, 422),
        f"status={r.status_code} (informational — backend allows empty content)",
    )

    # GET journal
    r = requests.get(f"{API}/grossesse-plus/journal", headers=auth(maman_token), timeout=20)
    items = r.json() if r.status_code == 200 else []
    record(
        "GET /journal returns list desc by created_at",
        r.status_code == 200 and isinstance(items, list) and len(items) >= 2,
        f"status={r.status_code} count={len(items)}",
    )

    # DELETE last one
    if items:
        jid = items[0]["id"]
        r = requests.delete(f"{API}/grossesse-plus/journal/{jid}", headers=auth(maman_token), timeout=20)
        record(
            f"DELETE /journal/{jid[:8]}…",
            r.status_code == 200 and r.json().get("deleted") is True,
            f"status={r.status_code}",
        )


def test_contractions(maman_token: str, maman_id: str):
    print("\n========== 6. CONTRACTIONS COUNTER ==========")
    # Wipe via pymongo
    import pymongo
    pc = pymongo.MongoClient(MONGO_URL)
    pc[DB_NAME].grossesse_contractions.delete_many({"user_id": maman_id})
    pc.close()

    # Single contraction with duration 45s
    started = datetime.now(timezone.utc) - timedelta(minutes=25)
    ended = started + timedelta(seconds=45)
    r = requests.post(
        f"{API}/grossesse-plus/contractions",
        headers=auth(maman_token),
        json={"started_at": started.isoformat(), "ended_at": ended.isoformat(), "intensity": "moyenne"},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /contractions duration=45s, intensity=moyenne",
        r.status_code == 200 and body.get("duration_sec") == 45 and body.get("intensity") == "moyenne",
        f"status={r.status_code} duration_sec={body.get('duration_sec')}",
    )

    # 5 more contractions, intervals ~3min apart (all in last 25 min) → critical advice
    base = datetime.now(timezone.utc) - timedelta(minutes=22)
    for i in range(5):
        st = base + timedelta(minutes=i * 3)
        en = st + timedelta(seconds=50)
        requests.post(
            f"{API}/grossesse-plus/contractions",
            headers=auth(maman_token),
            json={"started_at": st.isoformat(), "ended_at": en.isoformat(), "intensity": "forte"},
            timeout=20,
        )

    r = requests.get(f"{API}/grossesse-plus/contractions", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    advice = body.get("advice") or {}
    record(
        "GET /contractions with 5+ rapid contractions → advice.level='critical'",
        r.status_code == 200 and advice.get("level") == "critical",
        f"status={r.status_code} advice={advice}",
    )

    items = body.get("items") or []
    if items:
        cid = items[0]["id"]
        r = requests.delete(f"{API}/grossesse-plus/contractions/{cid}", headers=auth(maman_token), timeout=20)
        record(
            f"DELETE /contractions/{cid[:8]}…",
            r.status_code == 200 and r.json().get("deleted") is True,
            f"status={r.status_code}",
        )


def test_trousseau(maman_token: str, maman_id: str):
    print("\n========== 7. TROUSSEAU ==========")
    # Reset trousseau in DB
    import pymongo
    pc = pymongo.MongoClient(MONGO_URL)
    pc[DB_NAME].grossesses.update_many(
        {"user_id": maman_id, "active": True}, {"$set": {"trousseau": []}}
    )
    pc.close()

    r = requests.get(f"{API}/grossesse-plus/trousseau", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    items = body.get("items") or []
    record(
        "GET /trousseau first call → 17 default items",
        r.status_code == 200 and len(items) == 17 and all("id" in it for it in items),
        f"status={r.status_code} count={len(items)}",
    )

    # Modify some items
    modified = [{**it, "done": (i < 5)} for i, it in enumerate(items)]
    r = requests.patch(
        f"{API}/grossesse-plus/trousseau",
        headers=auth(maman_token),
        json={"items": modified},
        timeout=20,
    )
    record(
        "PATCH /trousseau saves done flags",
        r.status_code == 200 and len(r.json().get("items") or []) == 17,
        f"status={r.status_code}",
    )

    r = requests.get(f"{API}/grossesse-plus/trousseau", headers=auth(maman_token), timeout=20)
    items2 = r.json().get("items") if r.status_code == 200 else []
    done_count = sum(1 for it in items2 if it.get("done"))
    record(
        "GET /trousseau after PATCH preserves state (5 done)",
        r.status_code == 200 and done_count == 5,
        f"status={r.status_code} done={done_count}",
    )


def test_consent(maman_token: str):
    print("\n========== 8. CONSENT ==========")
    r = requests.post(
        f"{API}/grossesse-plus/consent",
        headers=auth(maman_token),
        json={"partage_pro": True},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /consent {partage_pro: true}",
        r.status_code == 200 and body.get("consent_partage_pro") is True,
        f"status={r.status_code} body={body}",
    )

    # Dashboard reflects it
    r = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    record(
        "GET /dashboard reflects consent_partage_pro=true",
        r.status_code == 200 and body.get("consent_partage_pro") is True,
        f"status={r.status_code} consent_partage_pro={body.get('consent_partage_pro')}",
    )

    # Combo
    r = requests.post(
        f"{API}/grossesse-plus/consent",
        headers=auth(maman_token),
        json={"partage_centre": True, "partage_famille": False},
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    record(
        "POST /consent combo {partage_centre: true, partage_famille: false}",
        r.status_code == 200
        and body.get("consent_partage_centre") is True
        and body.get("consent_partage_famille") is False
        and body.get("consent_partage_pro") is True,  # still True
        f"status={r.status_code} body={body}",
    )


def test_breathing(maman_token: str):
    print("\n========== 9. BREATHING ==========")
    r = requests.get(f"{API}/grossesse-plus/breathing", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else []
    ids = [e.get("id") for e in body] if isinstance(body, list) else []
    record(
        "GET /breathing → 4 exercises (carre, vague, cohérence, accouchement) with steps[]",
        r.status_code == 200
        and isinstance(body, list)
        and len(body) == 4
        and set(ids) == {"carre", "vague", "cohérence", "accouchement"}
        and all(isinstance(e.get("steps"), list) and len(e["steps"]) >= 1 for e in body),
        f"status={r.status_code} ids={ids}",
    )


def test_cpn(maman_token: str):
    print("\n========== 10. CPN SCHEDULE ==========")
    r = requests.get(f"{API}/grossesse-plus/cpn", headers=auth(maman_token), timeout=20)
    body = r.json() if r.status_code == 200 else {}
    schedule = body.get("schedule") or []
    next_rdv = body.get("next") or {}
    current_week = body.get("current_week")
    past = body.get("past") or []
    # current_week=23 expected from 2025-12-01 DDR
    cw_ok = isinstance(current_week, int) and 20 <= current_week <= 26
    next_week_ok = isinstance(next_rdv.get("week"), int) and next_rdv["week"] > (current_week or 0)
    past_ok = all(p["week"] <= (current_week or 0) for p in past)
    record(
        "GET /cpn → current_week≈23, 10 schedule items, next upcoming, past correct",
        r.status_code == 200
        and len(schedule) == 10
        and cw_ok
        and next_week_ok
        and past_ok,
        f"status={r.status_code} current_week={current_week} next.week={next_rdv.get('week')} past_count={len(past)}",
    )


def test_declarer_naissance(maman_token: str, maman_id: str):
    print("\n========== 11. DECLARER NAISSANCE ==========")
    payload = {"nom": "Bébé Test Naissance", "sexe": "F", "date_naissance": "2026-08-15"}
    r = requests.post(
        f"{API}/grossesse-plus/declarer-naissance",
        headers=auth(maman_token),
        json=payload,
        timeout=20,
    )
    body = r.json() if r.status_code == 200 else {}
    enfant = body.get("enfant") or {}
    record(
        "POST /declarer-naissance → 200 + enfant created",
        r.status_code == 200 and body.get("success") is True and enfant.get("nom") == "Bébé Test Naissance",
        f"status={r.status_code} enfant_id={enfant.get('id', '')[:8]}",
    )

    # GET /enfants should include new baby
    r = requests.get(f"{API}/enfants", headers=auth(maman_token), timeout=20)
    arr = r.json() if r.status_code == 200 else []
    has_baby = any(e.get("nom") == "Bébé Test Naissance" for e in arr)
    record(
        "GET /enfants includes new baby",
        r.status_code == 200 and has_baby,
        f"status={r.status_code} count={len(arr)} has_baby={has_baby}",
    )

    # Dashboard now 404 (no active grossesse)
    r = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(maman_token), timeout=20)
    record(
        "GET /dashboard after declarer-naissance → 404",
        r.status_code == 404,
        f"status={r.status_code}",
    )

    # Re-create grossesse (cleanup will reset, but doing it here too)
    r = requests.post(
        f"{API}/grossesse-plus/setup",
        headers=auth(maman_token),
        json={"source": "ddr", "date_debut": "2025-12-01"},
        timeout=20,
    )
    record(
        "Re-setup grossesse {ddr: 2025-12-01} → 200",
        r.status_code == 200,
        f"status={r.status_code}",
    )


def test_premium_acl(pro_token: str, maman_token: str, maman_id: str):
    print("\n========== 12. PREMIUM GATING ACL ==========")
    # Pro user on /dashboard → 403
    r = requests.get(f"{API}/grossesse-plus/dashboard", headers=auth(pro_token), timeout=20)
    record(
        "Pro account on /dashboard → 403 (role != maman)",
        r.status_code == 403,
        f"status={r.status_code}",
    )

    # Disable maman premium
    asyncio.run(set_premium(maman_id, False))
    r = requests.get(f"{API}/grossesse-plus/tracking", headers=auth(maman_token), timeout=20)
    err = None
    try:
        d = r.json().get("detail")
        if isinstance(d, dict):
            err = d.get("error")
    except Exception:
        pass
    record(
        "Non-premium maman /tracking → 402 with detail.error='premium_required'",
        r.status_code == 402 and err == "premium_required",
        f"status={r.status_code} err={err}",
    )
    # Restore
    asyncio.run(set_premium(maman_id, True))


# ===========================================================================
def main() -> int:
    print(f"Base URL: {BASE}")
    print(f"API:      {API}")

    maman_token = login(MAMAN_EMAIL, MAMAN_PASSWORD)
    pro_token = login(PRO_EMAIL, PRO_PASSWORD)
    if not maman_token or not pro_token:
        print("❌ Login failed — aborting.")
        return 1
    me = get_user(maman_token)
    maman_id = me["id"]
    print(f"Logged in as maman: {me.get('email')} ({maman_id})  premium={me.get('premium')}  premium_until={me.get('premium_until')}")

    try:
        test_public_weekly()
        test_dashboard(maman_token, pro_token)
        test_dashboard_non_premium(maman_token, maman_id)
        test_setup(maman_token)
        # Re-create a fresh grossesse for following tests (setup ddr 2026-01-01 was applied last)
        asyncio.run(ensure_grossesse(maman_id, "2025-12-01"))
        test_tracking(maman_token, maman_id)
        test_journal(maman_token)
        test_contractions(maman_token, maman_id)
        test_trousseau(maman_token, maman_id)
        test_consent(maman_token)
        test_breathing(maman_token)
        test_cpn(maman_token)
        test_declarer_naissance(maman_token, maman_id)
        test_premium_acl(pro_token, maman_token, maman_id)
    finally:
        # Cleanup: restore maman DB to original state
        print("\n========== CLEANUP ==========")
        asyncio.run(cleanup_test_data(maman_id))
        print("✔ Cleanup done: original grossesse 2025-12-01 restored, premium ON, test data deleted.")

    print("\n========== SUMMARY ==========")
    total = len(RESULTS)
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    print(f"PASS: {passed}/{total}")
    failed = [(n, d) for n, ok, d in RESULTS if not ok]
    if failed:
        print("\nFAILED:")
        for n, d in failed:
            print(f"  ❌ {n}  — {d}")
    return 0 if passed == total else 2


if __name__ == "__main__":
    sys.exit(main())
