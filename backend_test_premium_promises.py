"""
Backend tests for the 8 Premium Promises (À lo Maman).

Tests cover:
  1. Quota IA Maman 5/mois (POST /api/ai/chat) — 6th call → 402 quota_exceeded
  2. Quota IA Pro 0/jour gratuit (POST /api/ai/chat) — 1st call non-Premium → 402
     and 200 for Premium.
  3. Quota Pro patientes_max=10 (POST /api/rdv) — new maman beyond 10 unique → 402
     pro_quota_exceeded; existing maman → 200.
  4. Badge Pro Certifié (GET /api/search/pros) — fields is_premium / pro_certifie,
     Premium pros sorted first.
  5. Pro comptabilité export (GET /api/pro/comptabilite/export)
     — Premium 200, non-Premium 402, mois invalide 400, defaults to current month.
  6. Centre dashboard (GET /api/centre/dashboard) — Premium 200, non-Premium 402.
  7. Centre finance (GET /api/centre/finance) — Premium 200, non-Premium 402.
  8. Centre export (GET /api/centre/export) — csv/json, Premium 200, non-Premium 402,
     mois invalide 400.

Plus a quick regression block (login all roles, GET /enfants for maman).
"""

import os
import sys
import asyncio
import base64
import json
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import requests
from motor.motor_asyncio import AsyncIOMotorClient

# -----------------------------------------------------------------------------
BASE = os.environ.get("BACKEND_URL", "https://cycle-tracker-pro.preview.emergentagent.com").rstrip("/") + "/api"
TIMEOUT = 30

CRED = {
    "maman": ("maman.test@alomaman.dev", "Test1234!"),
    "pro": ("pro.test@alomaman.dev", "Test1234!"),
    "centre": ("centre.test@alomaman.dev", "Test1234!"),
    "admin": ("klenakan.eric@gmail.com", "474Treckadzo$1986"),
}

MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"


PASS = "\u2705"
FAIL = "\u274c"

results: list[tuple[bool, str]] = []


def log(ok: bool, msg: str):
    prefix = PASS if ok else FAIL
    print(f"{prefix} {msg}")
    results.append((ok, msg))


def login(email: str, pw: str) -> tuple[str, dict]:
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=TIMEOUT)
    if r.status_code != 200:
        raise RuntimeError(f"Login failed for {email}: {r.status_code} {r.text}")
    data = r.json()
    return data["token"], data["user"]


def H(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
async def db_setup_premium(client, premium: dict[str, bool]):
    """premium = {'pro': True/False, 'centre': True/False}"""
    db = client[DB_NAME]
    in30 = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    for role_key, want in premium.items():
        email = CRED[role_key][0]
        if want:
            await db.users.update_one({"email": email}, {"$set": {"premium": True, "premium_until": in30}})
        else:
            await db.users.update_one({"email": email}, {"$set": {"premium": False}, "$unset": {"premium_until": ""}})


async def db_clear_ai_messages(user_id: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.ai_messages.delete_many({"user_id": user_id})
    client.close()


async def db_get_user_id(email: str) -> str:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    client.close()
    return u["id"] if u else ""


async def db_count_unique_patientes(pro_id: str) -> int:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    ids = await db.rdv.distinct("maman_id", {"pro_id": pro_id})
    client.close()
    return len(ids)


# -----------------------------------------------------------------------------
def section(title: str):
    print(f"\n{'='*70}\n{title}\n{'='*70}")


# =============================================================================
# CASE 1 — Quota IA Maman 5/mois
# =============================================================================
async def test_case1_quota_maman():
    section("CASE 1 — Quota IA Maman 5/mois (POST /api/ai/chat)")
    token, user = login(*CRED["maman"])
    maman_id = user["id"]

    # Wipe AI messages for this maman so we have a clean slate
    await db_clear_ai_messages(maman_id)
    log(True, f"Cleared db.ai_messages for maman_id={maman_id[:8]}…")

    sid = "test-quota-premium"
    payload = {"session_id": sid, "message": "Bonjour, j'ai une petite question."}

    # 5 calls should pass
    for i in range(1, 6):
        r = requests.post(f"{BASE}/ai/chat", headers=H(token), json=payload, timeout=60)
        ok = r.status_code == 200
        log(ok, f"1.{i} POST /ai/chat (maman call #{i}) → status={r.status_code} (expected 200)")
        if not ok:
            try:
                print("   body:", r.json())
            except Exception:
                print("   body:", r.text[:300])
            return  # abort case if backend choked

    # 6th call → 402 quota_exceeded
    r = requests.post(f"{BASE}/ai/chat", headers=H(token), json=payload, timeout=60)
    ok = r.status_code == 402
    log(ok, f"1.6 POST /ai/chat call #6 → status={r.status_code} (expected 402)")
    if not ok:
        try:
            print("   body:", r.json())
        except Exception:
            print("   body:", r.text[:300])
        return
    body = r.json()
    detail = body.get("detail") or {}
    log(detail.get("error") == "quota_exceeded",
        f"1.7 detail.error == 'quota_exceeded' (got {detail.get('error')!r})")
    log(detail.get("quota") == "ia_questions_per_month",
        f"1.8 detail.quota == 'ia_questions_per_month' (got {detail.get('quota')!r})")
    log(detail.get("limit") == 5,
        f"1.9 detail.limit == 5 (got {detail.get('limit')!r})")

    # Cleanup so we don't impact other case
    await db_clear_ai_messages(maman_id)
    log(True, "Cleanup: db.ai_messages cleared again for maman.")


# =============================================================================
# CASE 2 — Quota IA Pro 0/jour gratuit
# =============================================================================
async def test_case2_quota_pro():
    section("CASE 2 — Quota IA Pro 0/jour gratuit (POST /api/ai/chat)")

    # 2a — non-Premium pro → 402 immediately
    client = AsyncIOMotorClient(MONGO_URL)
    await db_setup_premium(client, {"pro": False})
    pro_id = await db_get_user_id(CRED["pro"][0])
    db = client[DB_NAME]
    await db.ai_messages.delete_many({"user_id": pro_id})

    token_pro, _ = login(*CRED["pro"])
    payload = {"session_id": "pro-test-quota", "message": "Bonjour."}
    r = requests.post(f"{BASE}/ai/chat", headers=H(token_pro), json=payload, timeout=60)
    ok = r.status_code == 402
    log(ok, f"2.1 Pro non-Premium first /ai/chat → status={r.status_code} (expected 402)")
    if r.status_code == 402:
        d = (r.json() or {}).get("detail") or {}
        log(d.get("error") == "quota_exceeded",
            f"2.2 detail.error == 'quota_exceeded' (got {d.get('error')!r})")
        log(d.get("quota") == "ia_pro_per_day",
            f"2.3 detail.quota == 'ia_pro_per_day' (got {d.get('quota')!r})")
        log(d.get("limit") == 0,
            f"2.4 detail.limit == 0 (got {d.get('limit')!r})")
    else:
        try:
            print("   body:", r.json())
        except Exception:
            print("   body:", r.text[:400])

    # 2b — Pro becomes Premium → 200
    await db_setup_premium(client, {"pro": True})
    token_pro2, _ = login(*CRED["pro"])  # token reissue not needed but harmless
    r2 = requests.post(f"{BASE}/ai/chat", headers=H(token_pro2), json=payload, timeout=60)
    ok2 = r2.status_code == 200
    log(ok2, f"2.5 Pro Premium /ai/chat → status={r2.status_code} (expected 200)")
    if not ok2:
        try:
            print("   body:", r2.json())
        except Exception:
            print("   body:", r2.text[:400])

    # cleanup ai messages
    await db.ai_messages.delete_many({"user_id": pro_id})
    client.close()


# =============================================================================
# CASE 3 — Quota Pro patientes_max=10
# =============================================================================
async def test_case3_quota_patientes():
    section("CASE 3 — Quota Pro patientes_max=10 (POST /api/rdv)")

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    pro_id = await db_get_user_id(CRED["pro"][0])
    log(bool(pro_id), f"3.0 Pro id resolved : {pro_id[:8]}…")

    # Mark Pro as NON-Premium first
    await db_setup_premium(client, {"pro": False})

    # Count unique patientes
    unique_count = await db_count_unique_patientes(pro_id)
    log(True, f"3.1 Initial unique patientes for pro = {unique_count}")

    # Login maman
    token_maman, maman_user = login(*CRED["maman"])
    maman_id = maman_user["id"]

    # 3a — Existing maman creates RDV (should always be 200)
    has_existing = await db.rdv.find_one({"pro_id": pro_id, "maman_id": maman_id}, {"_id": 0, "id": 1})
    if not has_existing:
        # bootstrap: create one rdv so maman becomes "existing"
        d_iso = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r0 = requests.post(f"{BASE}/rdv", headers=H(token_maman),
                           json={"pro_id": pro_id, "date": d_iso, "motif": "Bootstrap existing patiente"},
                           timeout=TIMEOUT)
        log(r0.status_code == 200,
            f"3.2 Bootstrap RDV for maman.test (existing patiente) → {r0.status_code}")
        unique_count = await db_count_unique_patientes(pro_id)

    # Try create RDV as existing maman — must always pass
    d_iso = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    r = requests.post(f"{BASE}/rdv", headers=H(token_maman),
                      json={"pro_id": pro_id, "date": d_iso, "motif": "Suivi (existing patiente)"},
                      timeout=TIMEOUT)
    log(r.status_code == 200, f"3.3 Existing maman creates RDV → {r.status_code} (expected 200)")
    if r.status_code != 200:
        try: print("   body:", r.json())
        except Exception: print("   body:", r.text[:300])

    # 3b — Build up to 10 unique patientes if needed, then try a NEW one
    unique_count = await db_count_unique_patientes(pro_id)
    print(f"   Currently unique patientes for pro = {unique_count}")
    created_emails: list[str] = []
    target = 10
    while unique_count < target:
        # Register a brand-new maman, then create RDV
        suffix = f"{datetime.now().timestamp():.0f}{unique_count}"
        email = f"maman_quota_{suffix}@alomaman.dev"
        password = "Test1234!"
        rr = requests.post(f"{BASE}/auth/register", json={
            "email": email, "password": password, "name": f"Maman Quota {unique_count}",
            "phone": f"+22507{unique_count:08d}",
            "role": "maman",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        }, timeout=TIMEOUT)
        if rr.status_code != 200:
            log(False, f"   Could not register filler maman {email} : {rr.status_code} {rr.text[:120]}")
            break
        t = rr.json()["token"]
        d_iso = (datetime.now(timezone.utc) + timedelta(days=4 + unique_count)).isoformat()
        rr2 = requests.post(f"{BASE}/rdv", headers=H(t),
                            json={"pro_id": pro_id, "date": d_iso,
                                  "motif": f"Filler #{unique_count}"},
                            timeout=TIMEOUT)
        if rr2.status_code != 200:
            log(False, f"   Filler RDV {unique_count} → {rr2.status_code} {rr2.text[:120]}")
            break
        created_emails.append(email)
        unique_count = await db_count_unique_patientes(pro_id)
        print(f"   Now unique patientes = {unique_count}")

    log(unique_count >= target,
        f"3.4 Reached unique patientes >= {target} → got {unique_count}")

    # 3c — Now register YET ANOTHER fresh maman → should be blocked with 402
    suffix = f"{datetime.now().timestamp():.0f}-X"
    email_new = f"maman_quota_blocked_{suffix}@alomaman.dev"
    rr = requests.post(f"{BASE}/auth/register", json={
        "email": email_new, "password": "Test1234!",
        "name": "Maman Blocked", "phone": "+22507990099",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }, timeout=TIMEOUT)
    if rr.status_code == 200:
        token_new = rr.json()["token"]
        d_iso = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
        r3 = requests.post(f"{BASE}/rdv", headers=H(token_new),
                           json={"pro_id": pro_id, "date": d_iso, "motif": "Tentative blocked"},
                           timeout=TIMEOUT)
        log(r3.status_code == 402,
            f"3.5 New maman beyond quota → {r3.status_code} (expected 402)")
        if r3.status_code == 402:
            d = (r3.json() or {}).get("detail") or {}
            log(d.get("error") == "pro_quota_exceeded",
                f"3.6 detail.error == 'pro_quota_exceeded' (got {d.get('error')!r})")
            log(d.get("quota") == "patientes_max",
                f"3.7 detail.quota == 'patientes_max' (got {d.get('quota')!r})")
            log(d.get("limit") == 10,
                f"3.8 detail.limit == 10 (got {d.get('limit')!r})")
        created_emails.append(email_new)
    else:
        log(False, f"3.5 Could not register the 'blocked' test maman : {rr.status_code}")

    # 3d — Mark pro as Premium and confirm new maman can now book
    await db_setup_premium(client, {"pro": True})
    suffix = f"{datetime.now().timestamp():.0f}-P"
    email_prem = f"maman_quota_prem_{suffix}@alomaman.dev"
    rr = requests.post(f"{BASE}/auth/register", json={
        "email": email_prem, "password": "Test1234!",
        "name": "Maman Premium-Test", "phone": "+22507990199",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }, timeout=TIMEOUT)
    if rr.status_code == 200:
        t_prem = rr.json()["token"]
        d_iso = (datetime.now(timezone.utc) + timedelta(days=25)).isoformat()
        r4 = requests.post(f"{BASE}/rdv", headers=H(t_prem),
                           json={"pro_id": pro_id, "date": d_iso, "motif": "Premium pro bypass"},
                           timeout=TIMEOUT)
        log(r4.status_code == 200,
            f"3.9 New maman + Premium pro → {r4.status_code} (expected 200)")
        created_emails.append(email_prem)

    # Cleanup created mamans + their rdvs
    if created_emails:
        # delete ALL rdvs by these mamans first
        for em in created_emails:
            u = await db.users.find_one({"email": em}, {"_id": 0, "id": 1})
            if u:
                await db.rdv.delete_many({"maman_id": u["id"]})
        await db.users.delete_many({"email": {"$in": created_emails}})
        log(True, f"Cleanup: removed {len(created_emails)} test mamans + their rdvs.")

    client.close()


# =============================================================================
# CASE 4 — Badge Pro Certifié
# =============================================================================
async def test_case4_badge():
    section("CASE 4 — Badge Pro Certifié (GET /api/search/pros)")

    client = AsyncIOMotorClient(MONGO_URL)
    await db_setup_premium(client, {"pro": True})  # ensure Pro test is premium
    client.close()

    token_maman, _ = login(*CRED["maman"])
    r = requests.get(f"{BASE}/search/pros", headers=H(token_maman), timeout=TIMEOUT)
    log(r.status_code == 200, f"4.1 GET /search/pros → {r.status_code} (expected 200)")
    if r.status_code != 200:
        try: print("   body:", r.json())
        except Exception: print("   body:", r.text[:300])
        return

    pros = r.json()
    log(isinstance(pros, list) and len(pros) > 0,
        f"4.2 Response is non-empty list (n={len(pros) if isinstance(pros, list) else 'N/A'})")

    # All pros must have is_premium and pro_certifie
    bad = [p for p in pros if "is_premium" not in p or "pro_certifie" not in p]
    log(len(bad) == 0,
        f"4.3 Every pro contains both 'is_premium' and 'pro_certifie' (missing on {len(bad)})")

    # Both must be bools
    not_bool = [p for p in pros if not isinstance(p.get("is_premium"), bool) or not isinstance(p.get("pro_certifie"), bool)]
    log(len(not_bool) == 0,
        f"4.4 'is_premium' and 'pro_certifie' are booleans (bad={len(not_bool)})")

    # pro_certifie should equal is_premium per code
    mismatch = [p for p in pros if p.get("is_premium") != p.get("pro_certifie")]
    log(len(mismatch) == 0,
        f"4.5 pro_certifie alias matches is_premium for every pro (mismatch={len(mismatch)})")

    # Sort: all premium first
    seen_non_prem = False
    well_sorted = True
    for p in pros:
        if not p.get("is_premium"):
            seen_non_prem = True
        elif seen_non_prem:
            well_sorted = False
            break
    log(well_sorted,
        "4.6 Premium pros sorted before non-Premium (is_premium=true first)")

    # Test pro should be in list and Premium
    target = next((p for p in pros if p.get("email") == CRED["pro"][0] or p.get("name") == "Dr Konan TestPro"), None)
    if target:
        log(target.get("is_premium") is True,
            f"4.7 pro.test (Dr Konan TestPro) is_premium=True (got {target.get('is_premium')})")
        # Premium ones should be at the top — find first non-premium index
        first_np = next((i for i, p in enumerate(pros) if not p.get("is_premium")), len(pros))
        idx = pros.index(target)
        log(idx < first_np,
            f"4.8 pro.test appears in the Premium top zone (idx={idx}, first_np_idx={first_np})")
    else:
        log(False, "4.7 pro.test not found in /search/pros response")


# =============================================================================
# CASE 5 — Pro comptabilité export
# =============================================================================
async def test_case5_compta_export():
    section("CASE 5 — GET /api/pro/comptabilite/export")

    client = AsyncIOMotorClient(MONGO_URL)

    # Ensure Pro is Premium
    await db_setup_premium(client, {"pro": True})
    token_pro, _ = login(*CRED["pro"])

    # 5.1 — with valid mois
    r = requests.get(f"{BASE}/pro/comptabilite/export?mois=2026-05",
                     headers=H(token_pro), timeout=TIMEOUT)
    log(r.status_code == 200, f"5.1 Premium Pro mois=2026-05 → {r.status_code} (expected 200)")
    if r.status_code == 200:
        body = r.json()
        for k in ("filename", "base64", "mois", "rows", "total_brut", "total_commission", "total_net"):
            log(k in body, f"5.1.{k} key '{k}' present in response")
        log(body.get("mois") == "2026-05",
            f"5.2 mois echoed correctly = {body.get('mois')!r}")
        # decode base64 → check CSV header
        try:
            decoded = base64.b64decode(body["base64"]).decode("utf-8-sig", errors="replace")
            log(decoded.startswith("Date;RDV ID;Patiente;Brut FCFA;"),
                f"5.3 CSV header starts with 'Date;RDV ID;Patiente;Brut FCFA;…' (got: {decoded[:60]!r})")
        except Exception as e:
            log(False, f"5.3 base64 decode failed: {e}")

    # 5.4 — without mois → uses current
    r2 = requests.get(f"{BASE}/pro/comptabilite/export",
                      headers=H(token_pro), timeout=TIMEOUT)
    cur_mois = datetime.now(timezone.utc).strftime("%Y-%m")
    log(r2.status_code == 200,
        f"5.4 Premium Pro w/o mois → {r2.status_code} (expected 200)")
    if r2.status_code == 200:
        log(r2.json().get("mois") == cur_mois,
            f"5.5 mois defaults to current ({cur_mois}, got {r2.json().get('mois')})")

    # 5.6 — invalid mois
    r3 = requests.get(f"{BASE}/pro/comptabilite/export?mois=invalid",
                      headers=H(token_pro), timeout=TIMEOUT)
    log(r3.status_code == 400,
        f"5.6 mois='invalid' → {r3.status_code} (expected 400)")

    # 5.7 — non-Premium → 402
    await db_setup_premium(client, {"pro": False})
    token_pro2, _ = login(*CRED["pro"])
    r4 = requests.get(f"{BASE}/pro/comptabilite/export?mois=2026-05",
                      headers=H(token_pro2), timeout=TIMEOUT)
    log(r4.status_code == 402,
        f"5.7 Non-Premium Pro → {r4.status_code} (expected 402)")
    if r4.status_code == 402:
        d = (r4.json() or {}).get("detail") or {}
        log(d.get("error") == "premium_required",
            f"5.8 detail.error == 'premium_required' (got {d.get('error')!r})")

    # restore for further tests
    await db_setup_premium(client, {"pro": True})
    client.close()


# =============================================================================
# CASE 6 — Centre dashboard
# =============================================================================
async def test_case6_centre_dashboard():
    section("CASE 6 — GET /api/centre/dashboard")

    client = AsyncIOMotorClient(MONGO_URL)

    # Premium centre
    await db_setup_premium(client, {"centre": True})
    token_c, _ = login(*CRED["centre"])
    r = requests.get(f"{BASE}/centre/dashboard", headers=H(token_c), timeout=TIMEOUT)
    log(r.status_code == 200, f"6.1 Premium Centre dashboard → {r.status_code} (expected 200)")
    if r.status_code == 200:
        body = r.json()
        for k in ("centre", "membres_count", "rdv_total", "rdv_ce_mois",
                  "rdv_paye", "revenu_brut_fcfa", "revenu_pros_fcfa", "top_pros"):
            log(k in body, f"6.1.{k} key '{k}' present")
        # centre sub-keys
        if isinstance(body.get("centre"), dict):
            for k in ("id", "nom"):
                log(k in body["centre"], f"6.2.{k} centre.{k} present")
        log(isinstance(body.get("top_pros"), list),
            "6.3 top_pros is a list")
        # sort check
        tps = body.get("top_pros") or []
        sorted_ok = all(tps[i]["rdv_total"] >= tps[i + 1]["rdv_total"] for i in range(len(tps) - 1))
        log(sorted_ok, f"6.4 top_pros sorted by rdv_total DESC (n={len(tps)})")

    # Non-Premium → 402
    await db_setup_premium(client, {"centre": False})
    token_c2, _ = login(*CRED["centre"])
    r2 = requests.get(f"{BASE}/centre/dashboard", headers=H(token_c2), timeout=TIMEOUT)
    log(r2.status_code == 402,
        f"6.5 Non-Premium Centre dashboard → {r2.status_code} (expected 402)")
    if r2.status_code == 402:
        d = (r2.json() or {}).get("detail") or {}
        log(d.get("error") == "premium_required",
            f"6.6 detail.error == 'premium_required' (got {d.get('error')!r})")

    # restore Premium
    await db_setup_premium(client, {"centre": True})
    client.close()


# =============================================================================
# CASE 7 — Centre finance
# =============================================================================
async def test_case7_centre_finance():
    section("CASE 7 — GET /api/centre/finance")

    client = AsyncIOMotorClient(MONGO_URL)
    await db_setup_premium(client, {"centre": True})

    token_c, _ = login(*CRED["centre"])
    r = requests.get(f"{BASE}/centre/finance", headers=H(token_c), timeout=TIMEOUT)
    log(r.status_code == 200, f"7.1 Premium Centre finance → {r.status_code} (expected 200)")
    if r.status_code == 200:
        body = r.json()
        for k in ("membres_count", "total_brut_fcfa", "total_commission_fcfa", "total_net_fcfa", "pros"):
            log(k in body, f"7.1.{k} key '{k}' present")
        if isinstance(body.get("pros"), list):
            ok_each = True
            for p in body["pros"]:
                for k in ("pro_id", "name", "specialite", "phone", "rdv_count", "brut_fcfa", "commission_fcfa", "net_fcfa"):
                    if k not in p:
                        ok_each = False
                        break
            log(ok_each, f"7.2 Each entry of 'pros' contains required keys (n={len(body['pros'])})")

    # Non-Premium → 402
    await db_setup_premium(client, {"centre": False})
    token_c2, _ = login(*CRED["centre"])
    r2 = requests.get(f"{BASE}/centre/finance", headers=H(token_c2), timeout=TIMEOUT)
    log(r2.status_code == 402,
        f"7.3 Non-Premium Centre finance → {r2.status_code} (expected 402)")

    await db_setup_premium(client, {"centre": True})
    client.close()


# =============================================================================
# CASE 8 — Centre export
# =============================================================================
async def test_case8_centre_export():
    section("CASE 8 — GET /api/centre/export")

    client = AsyncIOMotorClient(MONGO_URL)
    await db_setup_premium(client, {"centre": True})

    token_c, _ = login(*CRED["centre"])

    # 8.1 — csv
    r = requests.get(f"{BASE}/centre/export?mois=2026-05&fmt=csv",
                     headers=H(token_c), timeout=TIMEOUT)
    log(r.status_code == 200, f"8.1 Premium centre csv → {r.status_code} (expected 200)")
    if r.status_code == 200:
        body = r.json()
        for k in ("filename", "base64", "mois", "rows"):
            log(k in body, f"8.1.{k} key '{k}' present")
        try:
            decoded = base64.b64decode(body["base64"]).decode("utf-8-sig", errors="replace")
            log(decoded.startswith("Date;Pro;Patiente;"),
                f"8.2 CSV header starts with 'Date;Pro;Patiente;…' (got: {decoded[:50]!r})")
        except Exception as e:
            log(False, f"8.2 base64 decode failed: {e}")

    # 8.3 — json
    r2 = requests.get(f"{BASE}/centre/export?mois=2026-05&fmt=json",
                      headers=H(token_c), timeout=TIMEOUT)
    log(r2.status_code == 200, f"8.3 Premium centre json → {r2.status_code} (expected 200)")
    if r2.status_code == 200:
        body = r2.json()
        for k in ("mois", "centre_id", "rows"):
            log(k in body, f"8.3.{k} key '{k}' present")
        log(body.get("mois") == "2026-05", f"8.4 mois echoed = {body.get('mois')!r}")
        log(isinstance(body.get("rows"), list), "8.5 rows is a list")

    # 8.6 — invalid mois
    r3 = requests.get(f"{BASE}/centre/export?mois=invalid",
                      headers=H(token_c), timeout=TIMEOUT)
    log(r3.status_code == 400, f"8.6 mois='invalid' → {r3.status_code} (expected 400)")

    # 8.7 — non-Premium → 402
    await db_setup_premium(client, {"centre": False})
    token_c2, _ = login(*CRED["centre"])
    r4 = requests.get(f"{BASE}/centre/export?mois=2026-05&fmt=csv",
                      headers=H(token_c2), timeout=TIMEOUT)
    log(r4.status_code == 402, f"8.7 Non-Premium centre export → {r4.status_code} (expected 402)")
    if r4.status_code == 402:
        d = (r4.json() or {}).get("detail") or {}
        log(d.get("error") == "premium_required",
            f"8.8 detail.error == 'premium_required' (got {d.get('error')!r})")

    await db_setup_premium(client, {"centre": True})
    client.close()


# =============================================================================
# REGRESSION
# =============================================================================
async def test_regression():
    section("REGRESSION — login all roles + /enfants for maman")

    for role, (em, pw) in CRED.items():
        r = requests.post(f"{BASE}/auth/login", json={"email": em, "password": pw}, timeout=TIMEOUT)
        ok = r.status_code == 200 and r.json().get("token")
        log(bool(ok), f"R.1 {role}: POST /auth/login → {r.status_code} + token present")

    token_m, _ = login(*CRED["maman"])
    r2 = requests.get(f"{BASE}/enfants", headers=H(token_m), timeout=TIMEOUT)
    log(r2.status_code == 200, f"R.2 GET /enfants (maman) → {r2.status_code} (expected 200)")


# =============================================================================
async def main():
    print(f"BASE={BASE}")
    # quick reachability
    try:
        rr = requests.get(f"{BASE}/auth/login", timeout=10)
        print(f"Reachability: GET /auth/login → {rr.status_code}")
    except Exception as e:
        print(f"WARN reach: {e}")

    try:
        await test_case1_quota_maman()
    except Exception as e:
        log(False, f"CASE 1 unhandled exception: {e}")
    try:
        await test_case2_quota_pro()
    except Exception as e:
        log(False, f"CASE 2 unhandled exception: {e}")
    try:
        await test_case3_quota_patientes()
    except Exception as e:
        log(False, f"CASE 3 unhandled exception: {e}")
    try:
        await test_case4_badge()
    except Exception as e:
        log(False, f"CASE 4 unhandled exception: {e}")
    try:
        await test_case5_compta_export()
    except Exception as e:
        log(False, f"CASE 5 unhandled exception: {e}")
    try:
        await test_case6_centre_dashboard()
    except Exception as e:
        log(False, f"CASE 6 unhandled exception: {e}")
    try:
        await test_case7_centre_finance()
    except Exception as e:
        log(False, f"CASE 7 unhandled exception: {e}")
    try:
        await test_case8_centre_export()
    except Exception as e:
        log(False, f"CASE 8 unhandled exception: {e}")
    try:
        await test_regression()
    except Exception as e:
        log(False, f"REGRESSION unhandled exception: {e}")

    # Reset Pro and Centre to Premium=True at end (review request indicated they
    # should be Premium for general testing; cases temporarily flip them)
    client = AsyncIOMotorClient(MONGO_URL)
    await db_setup_premium(client, {"pro": True, "centre": True})
    client.close()

    # Summary
    pa = sum(1 for ok, _ in results if ok)
    fa = sum(1 for ok, _ in results if not ok)
    print(f"\n{'='*70}\nFINAL: {pa}/{pa+fa} PASS — {fa} FAIL\n{'='*70}")
    if fa:
        print("\nFAILURES:")
        for ok, m in results:
            if not ok:
                print(f"  {FAIL} {m}")
    return 0 if fa == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
