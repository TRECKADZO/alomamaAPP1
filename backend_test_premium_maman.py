"""
Tests for the 7 NEW Premium MAMAN promises in /app/backend/server.py.

Endpoints under test:
  1. GET  /api/maman/storage
  2. GET  /api/partenaires/offres
  3. GET  /api/ecoute/contacts
  4. POST /api/ecoute/sessions
  5. POST /api/famille/join (quota proches max=4 Premium / 0 free)
  6. POST /api/ai/rappels-contextuels (and GET liste)
  7. Regression: /api/auth/login, /api/enfants, /api/ai/chat (5/mois maman free)

Run:
  python /app/backend_test_premium_maman.py
"""

from __future__ import annotations
import os
import sys
import json
import uuid
import asyncio
import random
import string
from datetime import datetime, timezone, timedelta

import requests
from motor.motor_asyncio import AsyncIOMotorClient

# ---- Configuration ----------------------------------------------------------
BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PWD = "474Treckadzo$1986"

MAMAN_TEST_EMAIL = "maman.test@alomaman.dev"
MAMAN_TEST_PWD = "Test1234!"

# Two ad-hoc mamans for premium / free split (re-used between runs if exist)
MAMAN_FREE_EMAIL = "maman.free.premiumtest@alomaman.dev"
MAMAN_FREE_PWD = "Test1234!"
MAMAN_PREM_EMAIL = "maman.prem.premiumtest@alomaman.dev"
MAMAN_PREM_PWD = "Test1234!"

# ---- Mongo (for state mutation) --------------------------------------------
MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"
mongo = AsyncIOMotorClient(MONGO_URL)
db = mongo[DB_NAME]


# ---- Helpers ---------------------------------------------------------------
PASSED = []
FAILED = []


def _check(label: str, ok: bool, detail: str = "") -> bool:
    if ok:
        PASSED.append(label)
        print(f"  ✅ {label}")
    else:
        FAILED.append(f"{label} — {detail}")
        print(f"  ❌ {label} — {detail}")
    return ok


def _login(email: str, pwd: str) -> str | None:
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": email, "password": pwd},
        timeout=30,
    )
    if r.status_code != 200:
        print(f"   ⚠️ Login failed for {email}: {r.status_code} {r.text[:200]}")
        return None
    return r.json()["token"]


def _register_maman(email: str, name: str, pwd: str = "Test1234!") -> str | None:
    r = requests.post(
        f"{BASE}/auth/register",
        json={
            "email": email,
            "password": pwd,
            "name": name,
            "role": "maman",
            "phone": f"+22507{random.randint(10000000, 99999999)}",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        },
        timeout=30,
    )
    if r.status_code == 200:
        return r.json()["token"]
    # Already exists ? Try login.
    if r.status_code == 400 and ("existe" in r.text.lower() or "déjà" in r.text.lower()):
        return _login(email, pwd)
    print(f"   ⚠️ Register failed for {email}: {r.status_code} {r.text[:200]}")
    return None


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _set_premium(email: str, premium: bool):
    upd = {"premium": premium}
    if premium:
        upd["premium_until"] = (
            datetime.now(timezone.utc) + timedelta(days=30)
        ).isoformat()
    else:
        upd["premium_until"] = None
    await db.users.update_one({"email": email}, {"$set": upd})


async def _purge_ai_for(email: str):
    u = await db.users.find_one({"email": email}, {"id": 1})
    if u:
        await db.ai_messages.delete_many({"user_id": u["id"]})


async def _purge_rappels_for(email: str):
    u = await db.users.find_one({"email": email}, {"id": 1})
    if u:
        await db.rappels_ia.delete_many({"maman_id": u["id"]})


async def _purge_ecoute_for(email: str):
    u = await db.users.find_one({"email": email}, {"id": 1})
    if u:
        await db.ecoute_sessions.delete_many({"maman_id": u["id"]})


async def _purge_familles_for(email: str):
    await db.familles.delete_many({"owner_email": email})


# =============================================================================
# CASE 1 — GET /api/maman/storage
# =============================================================================
async def case_1_storage(maman_token: str, email: str):
    print("\n🅰 CASE 1 — GET /api/maman/storage")
    # Free path
    await _set_premium(email, False)
    r = requests.get(f"{BASE}/maman/storage", headers=_h(maman_token), timeout=30)
    _check("1.1 GET /maman/storage (free) status=200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        keys = {"used_mb", "limit_mb", "percent", "is_premium", "label_limit", "warning", "blocked"}
        _check("1.2 Free response has all required keys", keys.issubset(data.keys()), f"got keys={list(data.keys())}")
        _check("1.3 Free is_premium=False", data.get("is_premium") is False, str(data.get("is_premium")))
        _check("1.4 Free limit_mb=50", data.get("limit_mb") == 50, str(data.get("limit_mb")))
        _check("1.5 Free label_limit='50 Mo'", data.get("label_limit") == "50 Mo", str(data.get("label_limit")))
    # Premium path
    await _set_premium(email, True)
    r2 = requests.get(f"{BASE}/maman/storage", headers=_h(maman_token), timeout=30)
    _check("1.6 GET /maman/storage (premium) status=200", r2.status_code == 200, f"{r2.status_code} {r2.text[:200]}")
    if r2.status_code == 200:
        data = r2.json()
        _check("1.7 Premium is_premium=True", data.get("is_premium") is True, str(data.get("is_premium")))
        _check("1.8 Premium limit_mb=2048", data.get("limit_mb") == 2048, str(data.get("limit_mb")))
        _check("1.9 Premium label_limit='2 Go'", data.get("label_limit") == "2 Go", str(data.get("label_limit")))


# =============================================================================
# CASE 2 — GET /api/partenaires/offres
# =============================================================================
async def case_2_partenaires(maman_token: str, email: str):
    print("\n🅱 CASE 2 — GET /api/partenaires/offres")
    # Free path expects 402 premium_required
    await _set_premium(email, False)
    r = requests.get(f"{BASE}/partenaires/offres", headers=_h(maman_token), timeout=30)
    _check("2.1 GET /partenaires/offres (free) → 402", r.status_code == 402, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 402:
        body = r.json()
        det = body.get("detail") if isinstance(body.get("detail"), dict) else body
        _check("2.2 detail.error='premium_required'", det.get("error") == "premium_required", str(det))
        _check("2.3 detail.upgrade_url present", bool(det.get("upgrade_url")), str(det.get("upgrade_url")))

    # Premium path
    await _set_premium(email, True)
    r2 = requests.get(f"{BASE}/partenaires/offres", headers=_h(maman_token), timeout=30)
    _check("2.4 GET /partenaires/offres (premium) → 200", r2.status_code == 200, f"{r2.status_code} {r2.text[:200]}")
    if r2.status_code == 200:
        body = r2.json()
        _check("2.5 has count + offres[]", "count" in body and "offres" in body, str(list(body.keys())))
        offres = body.get("offres") or []
        _check("2.6 6 offres pharmacies/crèches/boutiques/labos", len(offres) == 6 and body.get("count") == 6, f"got count={body.get('count')} len={len(offres)}")
        if offres:
            o0 = offres[0]
            req = {"id", "type", "name", "ville", "icon", "promo", "code", "valid_until", "phone"}
            missing = req - set(o0.keys())
            _check(f"2.7 Each offer contains required keys (sample idx 0 has all)", not missing, f"missing={missing}, keys={list(o0.keys())}")
            # Verify all offers have all keys
            all_ok = all(req.issubset(o.keys()) for o in offres)
            _check("2.8 All 6 offers have full schema", all_ok, "")
            # Types coverage
            types = {o["type"] for o in offres}
            _check("2.9 Types include pharmacie/creche/boutique/laboratoire", types.issuperset({"pharmacie", "creche", "boutique", "laboratoire"}), f"types={types}")


# =============================================================================
# CASE 3 — GET /api/ecoute/contacts
# =============================================================================
async def case_3_ecoute_contacts(maman_token: str, email: str):
    print("\n🅲 CASE 3 — GET /api/ecoute/contacts")
    # Free path
    await _set_premium(email, False)
    r = requests.get(f"{BASE}/ecoute/contacts", headers=_h(maman_token), timeout=30)
    _check("3.1 GET /ecoute/contacts (free) → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        _check("3.2 urgences_24_7 has 3 entries", len(body.get("urgences_24_7") or []) == 3, str(len(body.get("urgences_24_7") or [])))
        # SAMU 185, Pompiers 180, Police 111
        u = body.get("urgences_24_7") or []
        phones = {x.get("phone"): x.get("label") for x in u}
        _check("3.3 SAMU 185", phones.get("185", "").lower().startswith("samu"), str(phones))
        _check("3.4 Pompiers 180", "pompiers" in (phones.get("180") or "").lower(), str(phones))
        _check("3.5 Police 111", "police" in (phones.get("111") or "").lower(), str(phones))
        lp = body.get("lignes_publiques") or []
        ph2 = {x.get("phone"): x.get("label") for x in lp}
        _check("3.6 Allô Femme 1308", "1308" in ph2, str(ph2))
        _check("3.7 Allô Enfant 116", "116" in ph2, str(ph2))
        _check("3.8 premium_dedicated=null (free)", body.get("premium_dedicated") is None, str(body.get("premium_dedicated")))
        pr = body.get("premium_required") or {}
        _check("3.9 premium_required has message+upgrade_url", "message" in pr and "upgrade_url" in pr, str(pr))

    # Premium path
    await _set_premium(email, True)
    r2 = requests.get(f"{BASE}/ecoute/contacts", headers=_h(maman_token), timeout=30)
    _check("3.10 GET /ecoute/contacts (premium) → 200", r2.status_code == 200, f"{r2.status_code} {r2.text[:200]}")
    if r2.status_code == 200:
        body = r2.json()
        pd = body.get("premium_dedicated") or {}
        req = {"label", "phone", "whatsapp", "email", "horaires", "specialites"}
        _check("3.11 premium_dedicated has all keys", req.issubset(pd.keys()), f"keys={list(pd.keys())}")
        _check("3.12 specialites is non-empty list", isinstance(pd.get("specialites"), list) and len(pd["specialites"]) > 0, str(pd.get("specialites")))


# =============================================================================
# CASE 4 — POST /api/ecoute/sessions
# =============================================================================
async def case_4_ecoute_sessions(maman_token: str, email: str):
    print("\n🅳 CASE 4 — POST /api/ecoute/sessions")
    # Free path → 402
    await _set_premium(email, False)
    r = requests.post(f"{BASE}/ecoute/sessions", headers=_h(maman_token), json={"motif": "test"}, timeout=30)
    _check("4.1 POST /ecoute/sessions (free) → 402", r.status_code == 402, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 402:
        det = r.json().get("detail") or {}
        _check("4.2 detail.error='premium_required'", det.get("error") == "premium_required", str(det))

    # Premium path
    await _set_premium(email, True)
    # No motif → 400
    r2 = requests.post(f"{BASE}/ecoute/sessions", headers=_h(maman_token), json={}, timeout=30)
    _check("4.3 Premium POST without motif → 400", r2.status_code == 400, f"{r2.status_code} {r2.text[:200]}")

    # Valid POST
    r3 = requests.post(
        f"{BASE}/ecoute/sessions",
        headers=_h(maman_token),
        json={"motif": "Baby blues persistant", "preference_horaire": "matin"},
        timeout=30,
    )
    _check("4.4 Premium POST with motif → 200", r3.status_code == 200, f"{r3.status_code} {r3.text[:200]}")
    if r3.status_code == 200:
        body = r3.json()
        _check("4.5 response has ok+session+message", all(k in body for k in ("ok", "session", "message")), str(list(body.keys())))
        sess = body.get("session") or {}
        _check("4.6 session.status='en_attente'", sess.get("status") == "en_attente", str(sess.get("status")))
        _check("4.7 session.motif preserved", sess.get("motif") == "Baby blues persistant", str(sess.get("motif")))
        _check("4.8 session.preference_horaire preserved", sess.get("preference_horaire") == "matin", str(sess.get("preference_horaire")))

        # DB verification
        u = await db.users.find_one({"email": email}, {"id": 1})
        if u:
            doc = await db.ecoute_sessions.find_one({"id": sess.get("id")})
            _check("4.9 DB ecoute_sessions has new entry", doc is not None and doc.get("status") == "en_attente", str(doc))

    # Cleanup
    await _purge_ecoute_for(email)


# =============================================================================
# CASE 5 — Quota proches famille (4 Premium / 0 free)
# =============================================================================
async def case_5_famille_quota():
    print("\n🅴 CASE 5 — Quota proches famille (4 max Premium / 0 free)")
    # Owner: maman.test  (we'll wipe & recreate her famille)
    owner_email = MAMAN_TEST_EMAIL
    await _purge_familles_for(owner_email)

    owner_token = _login(owner_email, MAMAN_TEST_PWD)
    if not owner_token:
        _check("5.0 Owner login", False, "Cannot login owner")
        return

    # 1. Owner non-Premium creates a famille
    await _set_premium(owner_email, False)
    r = requests.post(f"{BASE}/famille/create", headers=_h(owner_token), timeout=30)
    _check("5.1 Owner free creates famille → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    if r.status_code != 200:
        return
    code = r.json().get("code_partage")
    _check("5.2 Famille code_partage 6 chars", isinstance(code, str) and len(code) == 6, str(code))

    # Create 5 ad-hoc joiners (mamans)
    joiners = []
    for i in range(5):
        em = f"famquota{i}.{uuid.uuid4().hex[:6]}@alomaman.dev"
        tk = _register_maman(em, f"Joiner{i} Test")
        if tk:
            joiners.append((em, tk))

    if len(joiners) < 5:
        _check("5.3 5 joiner accounts created", False, f"only {len(joiners)} created")
        # fall through, attempt with whatever we got

    # 2. With owner free → first join from joiner #0 should be 402 (quota=0)
    if joiners:
        em0, tk0 = joiners[0]
        rj = requests.post(
            f"{BASE}/famille/join",
            headers=_h(tk0),
            json={"code": code, "relation": "papa"},
            timeout=30,
        )
        _check("5.4 Join with free owner → 402 premium_required", rj.status_code == 402, f"{rj.status_code} {rj.text[:300]}")
        if rj.status_code == 402:
            det = rj.json().get("detail") or {}
            _check("5.5 detail.error='premium_required' (free owner)", det.get("error") == "premium_required", str(det))

    # 3. Mark owner Premium → first 4 joins succeed, 5th fails
    await _set_premium(owner_email, True)

    if len(joiners) >= 4:
        for i in range(4):
            em, tk = joiners[i]
            rr = requests.post(
                f"{BASE}/famille/join",
                headers=_h(tk),
                json={"code": code, "relation": ["papa", "grand-mere", "tante", "soeur"][i]},
                timeout=30,
            )
            _check(f"5.6.{i+1} Join #{i+1} (premium owner) → 200", rr.status_code == 200, f"{rr.status_code} {rr.text[:300]}")

    if len(joiners) >= 5:
        em5, tk5 = joiners[4]
        rr5 = requests.post(
            f"{BASE}/famille/join",
            headers=_h(tk5),
            json={"code": code, "relation": "oncle"},
            timeout=30,
        )
        _check("5.7 5th join → 402 quota_exceeded (limit=4)", rr5.status_code == 402, f"{rr5.status_code} {rr5.text[:300]}")
        if rr5.status_code == 402:
            det = rr5.json().get("detail") or {}
            _check("5.8 detail.error='quota_exceeded'", det.get("error") == "quota_exceeded", str(det))
            _check("5.9 detail.limit=4", det.get("limit") == 4, str(det))
            _check("5.10 detail.quota='proches_max'", det.get("quota") == "proches_max", str(det))

    # Cleanup
    await _purge_familles_for(owner_email)
    for em, _tk in joiners:
        try:
            await db.users.delete_one({"email": em})
        except Exception:
            pass


# =============================================================================
# CASE 6 — POST /api/ai/rappels-contextuels
# =============================================================================
async def case_6_rappels_ia(maman_token: str, email: str):
    print("\n🅵 CASE 6 — POST /api/ai/rappels-contextuels")
    # Free → 402
    await _set_premium(email, False)
    r = requests.post(
        f"{BASE}/ai/rappels-contextuels",
        headers=_h(maman_token),
        json={"contexte": "Je suis à 28 SA", "sa": 28},
        timeout=30,
    )
    _check("6.1 POST rappels-contextuels (free) → 402", r.status_code == 402, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 402:
        det = r.json().get("detail") or {}
        _check("6.2 detail.error='premium_required'", det.get("error") == "premium_required", str(det))

    # Premium → 200 with 5 rappels (calls Claude)
    await _set_premium(email, True)
    await _purge_rappels_for(email)
    r2 = requests.post(
        f"{BASE}/ai/rappels-contextuels",
        headers=_h(maman_token),
        json={"contexte": "Je suis à 28 SA", "sa": 28},
        timeout=120,
    )
    _check("6.3 POST rappels-contextuels (premium) → 200", r2.status_code == 200, f"{r2.status_code} {r2.text[:300]}")
    if r2.status_code == 200:
        body = r2.json()
        rappels = body.get("rappels") or []
        _check("6.4 5 rappels generated", len(rappels) == 5, f"got {len(rappels)}")
        _check("6.5 count==5", body.get("count") == 5, str(body.get("count")))
        if rappels:
            r0 = rappels[0]
            req = {"titre", "description", "urgence", "icone"}
            missing = req - set(r0.keys())
            _check("6.6 Each rappel has titre/description/urgence/icone", not missing, f"missing={missing}, keys={list(r0.keys())}")
            urgences_ok = all(rr.get("urgence") in ("haute", "moyenne", "info") for rr in rappels)
            _check("6.7 urgence values in {haute,moyenne,info}", urgences_ok, str([rr.get('urgence') for rr in rappels]))

    # GET liste
    r3 = requests.get(f"{BASE}/ai/rappels-contextuels", headers=_h(maman_token), timeout=30)
    _check("6.8 GET rappels-contextuels → 200", r3.status_code == 200, f"{r3.status_code}")
    if r3.status_code == 200:
        body = r3.json()
        _check("6.9 GET retourne liste avec count>=5", isinstance(body.get("rappels"), list) and body.get("count", 0) >= 5, str(body.get("count")))

    # Cleanup
    await _purge_rappels_for(email)


# =============================================================================
# CASE 7 — Régression
# =============================================================================
async def case_7_regression(maman_token: str, email: str):
    print("\n🅶 CASE 7 — Régression")
    # Login admin
    admin_token = _login(ADMIN_EMAIL, ADMIN_PWD)
    _check("7.1 Login ADMIN", admin_token is not None, "")
    # Login pro
    pro_token = _login("pro.test@alomaman.dev", "Test1234!")
    _check("7.2 Login PRO", pro_token is not None, "")
    # Login centre
    centre_token = _login("centre.test@alomaman.dev", "Test1234!")
    _check("7.3 Login CENTRE", centre_token is not None, "")
    # Login maman (separate)
    mtok = _login(email, MAMAN_TEST_PWD)
    _check("7.4 Login MAMAN", mtok is not None, "")

    # GET /enfants for MAMAN → 200
    r = requests.get(f"{BASE}/enfants", headers=_h(mtok), timeout=30)
    _check("7.5 GET /enfants (maman) → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

    # AI chat MAMAN Premium → 200 (illimité)
    await _set_premium(email, True)
    rc = requests.post(
        f"{BASE}/ai/chat",
        headers=_h(mtok),
        json={"session_id": "test-prem", "message": "Bonjour, j'ai mal au dos à 28SA, est-ce normal ?"},
        timeout=120,
    )
    _check("7.6 POST /ai/chat (maman premium) → 200", rc.status_code == 200, f"{rc.status_code} {rc.text[:200]}")

    # AI chat MAMAN gratuite — purger ai_messages, créer compte ad-hoc free
    free_email = f"freeia.{uuid.uuid4().hex[:6]}@alomaman.dev"
    free_tok = _register_maman(free_email, "FreeIA Test")
    if free_tok:
        await _set_premium(free_email, False)
        await _purge_ai_for(free_email)
        ok_count = 0
        last_status = None
        for i in range(6):
            rr = requests.post(
                f"{BASE}/ai/chat",
                headers=_h(free_tok),
                json={"session_id": f"free-{i}", "message": f"Question {i}: comment éviter les nausées ?"},
                timeout=120,
            )
            last_status = rr.status_code
            if rr.status_code == 200:
                ok_count += 1
            else:
                break
        _check("7.7 Maman free: 5 first AI chats → 200", ok_count == 5, f"ok_count={ok_count}, last_status={last_status}")
        # 6th
        rr6 = requests.post(
            f"{BASE}/ai/chat",
            headers=_h(free_tok),
            json={"session_id": "free-6", "message": "Question 6: c'est encore moi"},
            timeout=120,
        )
        _check("7.8 Maman free: 6th AI chat → 402", rr6.status_code == 402, f"{rr6.status_code} {rr6.text[:200]}")
        if rr6.status_code == 402:
            det = rr6.json().get("detail") or {}
            _check("7.9 quota=ia_questions_per_month, limit=5", det.get("quota") == "ia_questions_per_month" and det.get("limit") == 5, str(det))

        # cleanup
        await _purge_ai_for(free_email)
        await db.users.delete_one({"email": free_email})


# =============================================================================
# Main
# =============================================================================
async def main():
    print("=" * 70)
    print("Premium MAMAN endpoints — backend tests")
    print(f"BASE: {BASE}")
    print("=" * 70)

    # Login MAMAN test
    maman_token = _login(MAMAN_TEST_EMAIL, MAMAN_TEST_PWD)
    if not maman_token:
        print("❌ FATAL: cannot login maman.test")
        sys.exit(1)

    try:
        await case_1_storage(maman_token, MAMAN_TEST_EMAIL)
        await case_2_partenaires(maman_token, MAMAN_TEST_EMAIL)
        await case_3_ecoute_contacts(maman_token, MAMAN_TEST_EMAIL)
        await case_4_ecoute_sessions(maman_token, MAMAN_TEST_EMAIL)
        await case_5_famille_quota()
        await case_6_rappels_ia(maman_token, MAMAN_TEST_EMAIL)
        await case_7_regression(maman_token, MAMAN_TEST_EMAIL)
    finally:
        # Restore maman.test to non-Premium (default state)
        await _set_premium(MAMAN_TEST_EMAIL, False)

    total = len(PASSED) + len(FAILED)
    print("\n" + "=" * 70)
    print(f"SCORE: {len(PASSED)}/{total} PASS — {len(FAILED)} FAIL")
    print("=" * 70)
    if FAILED:
        print("\nFAILURES:")
        for f in FAILED:
            print(f"  • {f}")
        sys.exit(1)
    print("\n✅ All Premium MAMAN tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
