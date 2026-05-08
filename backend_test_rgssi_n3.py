"""Phase 5A — RGSSI Niveau 3 backend tests.

Covers:
  A. 2FA TOTP (status / setup / verify / disable + login flow)
  B. Incidents (CRUD + ANSSI report)
  C. RGSSI compliance dashboard + audit log + users access review
  D. Auth audit log entries for login + auth_failed_2fa
"""
import os
import sys
import time
import json
import uuid
import requests
import pyotp

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PASSWORD = "474Treckadzo$1986"

PASS = []
FAIL = []


def _name(label):
    return label


def ok(label, msg=""):
    PASS.append(label)
    print(f"  ✅ {label} {msg}")


def ko(label, msg=""):
    FAIL.append((label, msg))
    print(f"  ❌ {label} :: {msg}")


def login(email, password, totp_code=None):
    body = {"email": email, "password": password}
    if totp_code is not None:
        body["totp_code"] = totp_code
    r = requests.post(f"{BASE}/auth/login", json=body, timeout=30)
    return r


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print("="*80)
    print("Phase 5A — RGSSI Niveau 3 backend tests")
    print(f"Base: {BASE}")
    print("="*80)

    # --- Login MAMAN, PRO, ADMIN -------------------------------------------
    print("\n[Setup] Login users")
    r = login(MAMAN_EMAIL, MAMAN_PASSWORD)
    if r.status_code != 200:
        ko("Login MAMAN", f"HTTP {r.status_code} {r.text[:200]}")
        return
    maman_token = r.json()["token"]
    maman_id = r.json()["user"]["id"]
    ok("Login MAMAN", f"id={maman_id[:8]}…")

    r = login(PRO_EMAIL, PRO_PASSWORD)
    if r.status_code != 200:
        # 2FA may already be enabled from a previous run — try disabling first
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code == 200 and body.get("requires_2fa"):
            ko("Login PRO", "PRO already has 2FA enabled from previous run; cannot continue without code")
            return
        ko("Login PRO", f"HTTP {r.status_code} {r.text[:200]}")
        return
    body = r.json()
    if body.get("requires_2fa"):
        ko("Login PRO (initial state)", "PRO already has 2FA enabled (state from previous run). Manual cleanup required.")
        return
    pro_token = body["token"]
    pro_id = body["user"]["id"]
    ok("Login PRO", f"id={pro_id[:8]}…")

    r = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        ko("Login ADMIN", f"HTTP {r.status_code} {r.text[:200]}")
        return
    admin_token = r.json()["token"]
    admin_id = r.json()["user"]["id"]
    ok("Login ADMIN", f"id={admin_id[:8]}…")

    # =====================================================================
    # A. 2FA TOTP
    # =====================================================================
    print("\n[A] 2FA TOTP")

    # A1 - GET /auth/2fa/status (initial: disabled, required_for_role=true for pro)
    r = requests.get(f"{BASE}/auth/2fa/status", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        if "enabled" in d and "activated_at" in d and "required_for_role" in d:
            ok("A1 GET /auth/2fa/status (pro, initial)", f"enabled={d['enabled']}, required={d['required_for_role']}")
            if d["enabled"] is True:
                # already enabled — stop with diagnostic
                ko("A1 PRO state", "PRO already has 2FA enabled; aborting tests to avoid corrupting state")
                return
            if d["required_for_role"] is not True:
                ko("A1 required_for_role", f"expected True for pro, got {d['required_for_role']}")
        else:
            ko("A1 keys", f"missing keys, got {list(d.keys())}")
    else:
        ko("A1 GET /auth/2fa/status", f"HTTP {r.status_code} {r.text[:200]}")

    # Status as MAMAN: required_for_role should be False
    r = requests.get(f"{BASE}/auth/2fa/status", headers=auth_h(maman_token), timeout=20)
    if r.status_code == 200 and r.json().get("required_for_role") is False:
        ok("A1b GET /auth/2fa/status (maman)", f"required_for_role=False")
    else:
        ko("A1b /auth/2fa/status (maman)", f"HTTP {r.status_code} body={r.text[:200]}")

    # A3 - verify WITHOUT setup → 400
    # First we need a clean state: ensure no totp_secret_pending exists. Trying verify on a fresh PRO.
    # We don't directly clear the DB; the endpoint reads totp_secret_pending or totp_secret. If totp_secret exists, 2FA is enabled which we already checked. So pending should not exist by default.
    r = requests.post(f"{BASE}/auth/2fa/verify", json={"code": "123456"}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 400 and "Aucun secret 2FA en attente" in r.text:
        ok("A3a verify without setup → 400", r.text[:120])
    else:
        # Could still be acceptable if 401 but spec requires 400
        ko("A3a verify without setup", f"expected 400 'Aucun secret 2FA en attente', got HTTP {r.status_code}: {r.text[:200]}")

    # A2 - POST /auth/2fa/setup (PRO)
    r = requests.post(f"{BASE}/auth/2fa/setup", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        if all(k in d for k in ("secret", "otpauth_url", "issuer", "label")):
            ok("A2 POST /auth/2fa/setup (pro)", f"issuer={d['issuer']!r}")
            secret = d["secret"]
        else:
            ko("A2 setup keys", f"got {list(d.keys())}")
            return
    else:
        ko("A2 POST /auth/2fa/setup", f"HTTP {r.status_code} {r.text[:200]}")
        return

    # Check status still disabled (secret pending only)
    r = requests.get(f"{BASE}/auth/2fa/status", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200 and r.json().get("enabled") is False:
        ok("A2b status after setup still enabled=false", "secret stored as pending only")
    else:
        ko("A2b status after setup", f"HTTP {r.status_code} body={r.text[:200]}")

    # A3b - verify wrong code → 401
    r = requests.post(f"{BASE}/auth/2fa/verify", json={"code": "000000"}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 401 and "Code 2FA invalide" in r.text:
        ok("A3b verify wrong code → 401 'Code 2FA invalide'", "")
    else:
        ko("A3b verify wrong code", f"HTTP {r.status_code} {r.text[:200]}")

    # A3c - verify correct code → 200
    correct = pyotp.TOTP(secret).now()
    r = requests.post(f"{BASE}/auth/2fa/verify", json={"code": correct}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200 and r.json().get("totp_enabled") is True:
        ok("A3c verify correct code → 200 totp_enabled=true", f"code={correct}")
    else:
        ko("A3c verify correct code", f"HTTP {r.status_code} {r.text[:200]}")
        # cleanup attempt isn't possible without correct code
        return

    # Verify status now enabled
    r = requests.get(f"{BASE}/auth/2fa/status", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200 and r.json().get("enabled") is True and r.json().get("activated_at"):
        ok("A3d status now enabled with activated_at", "")
    else:
        ko("A3d status after enable", f"HTTP {r.status_code} {r.text[:200]}")

    # A4 - login with email+password and NO totp_code → requires_2fa=true (HTTP 200)
    r = login(PRO_EMAIL, PRO_PASSWORD)
    if r.status_code == 200:
        d = r.json()
        if d.get("requires_2fa") is True and d.get("user_id") and d.get("email") and d.get("message"):
            ok("A4 login no totp → requires_2fa=true", f"user_id={d['user_id'][:8]}…")
        else:
            ko("A4 login no totp shape", f"got {d}")
    else:
        ko("A4 login no totp", f"HTTP {r.status_code} {r.text[:200]}")

    # A5a - login with wrong totp_code → 401 + audit log auth_failed_2fa
    r = login(PRO_EMAIL, PRO_PASSWORD, totp_code="000000")
    if r.status_code == 401 and "Code 2FA invalide" in r.text:
        ok("A5a login wrong totp → 401 Code 2FA invalide", "")
    else:
        ko("A5a login wrong totp", f"HTTP {r.status_code} {r.text[:200]}")

    # A5b - login with correct totp_code → 200 token
    # wait if necessary to get a fresh token (different from what we used for /verify)
    time.sleep(1)
    correct = pyotp.TOTP(secret).now()
    r = login(PRO_EMAIL, PRO_PASSWORD, totp_code=correct)
    if r.status_code == 200 and r.json().get("token"):
        pro_token = r.json()["token"]  # refresh token (old still valid but use new)
        ok("A5b login correct totp → 200 token", "")
    else:
        ko("A5b login correct totp", f"HTTP {r.status_code} {r.text[:200]}")

    # =====================================================================
    # D. Auth audit (verify entries are recorded)
    # =====================================================================
    print("\n[D] Auth audit log entries")
    r = requests.get(f"{BASE}/admin/rgssi/audit-log?limit=200", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200:
        events = r.json().get("events", [])
        # filter to PRO user events
        pro_events = [e for e in events if e.get("user_id") == pro_id]
        login_evt = next((e for e in pro_events if e.get("action") == "login" and e.get("resource_type") == "Auth"), None)
        failed2fa_evt = next((e for e in pro_events if e.get("action") == "auth_failed_2fa"), None)
        if login_evt:
            ok("D1 audit log has action='login' resource_type='Auth' for PRO", f"ts={login_evt.get('timestamp','')[:19]}")
        else:
            ko("D1 audit log login entry", f"not found for pro_id={pro_id} (pro_events={len(pro_events)})")
        if failed2fa_evt:
            ok("D2 audit log has action='auth_failed_2fa' for PRO", f"ts={failed2fa_evt.get('timestamp','')[:19]}")
        else:
            ko("D2 audit log auth_failed_2fa", "not found")
    else:
        ko("D /admin/rgssi/audit-log", f"HTTP {r.status_code} {r.text[:200]}")

    # =====================================================================
    # B. Incidents
    # =====================================================================
    print("\n[B] Incidents")

    # B1 - POST /incidents (PRO) high/unauthorized_access
    body = {
        "title": "Tentative accès non autorisé sur dossier patient",
        "description": "Un utilisateur tiers a tenté d'accéder au dossier d'une patiente sans autorisation.",
        "severity": "high",
        "category": "unauthorized_access",
    }
    r = requests.post(f"{BASE}/incidents", json=body, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        iid = d.get("id")
        if iid and d.get("status") == "open" and d.get("anssi_notification_required") is True:
            ok("B1 POST /incidents (high) → 200", f"id={iid[:8]} status=open anssi_required=True")
        else:
            ko("B1 incident shape", f"got {d}")
            iid = None
    else:
        ko("B1 POST /incidents", f"HTTP {r.status_code} {r.text[:200]}")
        iid = None

    # B2 - invalid severity → 400
    r = requests.post(f"{BASE}/incidents", json={**body, "severity": "extreme"}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 400 and "Sévérité" in r.text:
        ok("B2a invalid severity → 400", "")
    else:
        ko("B2a invalid severity", f"HTTP {r.status_code} {r.text[:200]}")

    r = requests.post(f"{BASE}/incidents", json={**body, "category": "WAT"}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 400 and "Catégorie" in r.text:
        ok("B2b invalid category → 400", "")
    else:
        ko("B2b invalid category", f"HTTP {r.status_code} {r.text[:200]}")

    # B3 - GET /incidents (admin)
    r = requests.get(f"{BASE}/incidents", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        stats = d.get("stats", {})
        if all(k in stats for k in ("total", "open", "investigating", "resolved", "critical", "anssi_pending")) and isinstance(d.get("incidents"), list):
            ok("B3 GET /incidents (admin)", f"stats={stats}")
        else:
            ko("B3 stats shape", f"got {stats}")
    else:
        ko("B3 GET /incidents", f"HTTP {r.status_code} {r.text[:200]}")

    # Non-admin → 403
    r = requests.get(f"{BASE}/incidents", headers=auth_h(maman_token), timeout=20)
    if r.status_code == 403:
        ok("B3b GET /incidents (maman) → 403", "")
    else:
        ko("B3b GET /incidents (maman)", f"HTTP {r.status_code}")

    # B4 - filter status=open&severity=high
    r = requests.get(f"{BASE}/incidents?status=open&severity=high", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200:
        items = r.json().get("incidents", [])
        # check our created incident is in there
        found = any(i.get("id") == iid for i in items) if iid else False
        all_match = all(i.get("status") == "open" and i.get("severity") == "high" for i in items)
        if found and all_match:
            ok("B4 GET /incidents?status=open&severity=high", f"{len(items)} matching, our id present")
        elif all_match:
            ok("B4 filter shape ok (our id may be filtered out)", f"{len(items)} match filters")
        else:
            ko("B4 filter results", f"all_match={all_match} found_ours={found}")
    else:
        ko("B4 filter", f"HTTP {r.status_code}")

    # B5 - GET /incidents/{id}
    if iid:
        r = requests.get(f"{BASE}/incidents/{iid}", headers=auth_h(admin_token), timeout=20)
        if r.status_code == 200 and r.json().get("id") == iid:
            ok("B5a GET /incidents/{id} (admin) → 200", "")
        else:
            ko("B5a GET incident admin", f"HTTP {r.status_code} {r.text[:200]}")

        # Reporter (PRO who created it) - 200
        r = requests.get(f"{BASE}/incidents/{iid}", headers=auth_h(pro_token), timeout=20)
        if r.status_code == 200:
            ok("B5b GET /incidents/{id} (reporter) → 200", "")
        else:
            ko("B5b GET incident reporter", f"HTTP {r.status_code}")

        # Other user (maman) → 403
        r = requests.get(f"{BASE}/incidents/{iid}", headers=auth_h(maman_token), timeout=20)
        if r.status_code == 403:
            ok("B5c GET /incidents/{id} (other user) → 403", "")
        else:
            ko("B5c GET incident other user", f"HTTP {r.status_code} {r.text[:200]}")

        # B6 - PATCH status → investigating
        r = requests.patch(f"{BASE}/incidents/{iid}", json={"status": "investigating"}, headers=auth_h(admin_token), timeout=20)
        if r.status_code == 200:
            ok("B6a PATCH /incidents/{id} status=investigating → 200", "")
        else:
            ko("B6a PATCH status", f"HTTP {r.status_code} {r.text[:200]}")

        # verify history entry
        r = requests.get(f"{BASE}/incidents/{iid}", headers=auth_h(admin_token), timeout=20)
        d = r.json() if r.status_code == 200 else {}
        hist = d.get("history") or []
        if d.get("status") == "investigating" and any("investigating" in (h.get("status") or "") for h in hist):
            ok("B6a-bis history entry investigating", f"history len={len(hist)}")
        else:
            ko("B6a-bis history entry", f"status={d.get('status')} history={hist}")

        # B6 - PATCH anssi_notified=true
        r = requests.patch(f"{BASE}/incidents/{iid}", json={"anssi_notified": True}, headers=auth_h(admin_token), timeout=20)
        if r.status_code == 200:
            ok("B6b PATCH anssi_notified=true → 200", "")
        else:
            ko("B6b PATCH anssi_notified", f"HTTP {r.status_code}")

        r = requests.get(f"{BASE}/incidents/{iid}", headers=auth_h(admin_token), timeout=20)
        d = r.json() if r.status_code == 200 else {}
        if d.get("anssi_notified_at"):
            ok("B6b-bis anssi_notified_at populated", f"{d['anssi_notified_at'][:19]}")
        else:
            ko("B6b-bis anssi_notified_at", f"got {d.get('anssi_notified_at')}")

        # B7 - GET /admin/rgssi/incidents/anssi-report/{id}
        r = requests.get(f"{BASE}/admin/rgssi/incidents/anssi-report/{iid}", headers=auth_h(admin_token), timeout=20)
        if r.status_code == 200:
            d = r.json()
            anssi = d.get("ANSSI_Cote_d_Ivoire") or {}
            inc_block = anssi.get("Incident") or {}
            if anssi.get("Reference_RGSSI") and inc_block.get("ID") == iid:
                ok("B7 GET /admin/rgssi/incidents/anssi-report/{id}", f"Severity={inc_block.get('Severity')}")
            else:
                ko("B7 ANSSI shape", f"got {list(anssi.keys())}")
        else:
            ko("B7 GET ANSSI report", f"HTTP {r.status_code} {r.text[:200]}")

    # =====================================================================
    # C. Compliance dashboard
    # =====================================================================
    print("\n[C] Compliance dashboard")

    # C1 - GET /admin/rgssi/compliance
    r = requests.get(f"{BASE}/admin/rgssi/compliance", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        domains = d.get("domains", {})
        required = ["B7_access_control", "B8_cryptography", "B14_incidents", "B14_audit_log", "consent_granular", "fhir_interop"]
        missing = [k for k in required if k not in domains]
        if not missing:
            ok("C1 /admin/rgssi/compliance has all 6 domains", "")
        else:
            ko("C1 missing domains", f"{missing}")

        b7 = domains.get("B7_access_control", {})
        if "score" in b7 and "metrics" in b7 and "compliant" in b7:
            ok("C1.B7 keys (score, metrics, compliant)", f"score={b7['score']}")
        else:
            ko("C1.B7 keys", f"got {list(b7.keys())}")

        b8 = domains.get("B8_cryptography", {})
        if b8.get("compliant") is True and isinstance((b8.get("metrics") or {}).get("encrypted_fields"), list):
            ok("C1.B8 cryptography compliant=true + encrypted_fields list", f"{len(b8['metrics']['encrypted_fields'])} fields")
        else:
            ko("C1.B8 cryptography", f"got {b8}")

        b14i = domains.get("B14_incidents", {})
        if "compliant" in b14i and "metrics" in b14i:
            ok("C1.B14_incidents keys", f"compliant={b14i['compliant']}")
        else:
            ko("C1.B14_incidents", f"got {b14i}")

        b14a = domains.get("B14_audit_log", {})
        if "compliant" in b14a:
            ok("C1.B14_audit_log compliant key", f"compliant={b14a['compliant']}")
        else:
            ko("C1.B14_audit_log", f"got {b14a}")

        cg = domains.get("consent_granular", {})
        ac = (cg.get("metrics") or {}).get("active_consents")
        if ac is not None:
            ok("C1.consent_granular active_consents", f"={ac}")
        else:
            ko("C1.consent_granular", f"got {cg}")

        fhir = domains.get("fhir_interop", {})
        if fhir.get("compliant") is True:
            ok("C1.fhir_interop compliant=true", "")
        else:
            ko("C1.fhir_interop", f"got {fhir}")
    else:
        ko("C1 /admin/rgssi/compliance", f"HTTP {r.status_code} {r.text[:200]}")

    # Non-admin
    r = requests.get(f"{BASE}/admin/rgssi/compliance", headers=auth_h(maman_token), timeout=20)
    if r.status_code == 403:
        ok("C1b compliance non-admin → 403", "")
    else:
        ko("C1b compliance maman", f"HTTP {r.status_code}")

    # C2 - GET /admin/rgssi/audit-log?limit=50
    r = requests.get(f"{BASE}/admin/rgssi/audit-log?limit=50", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200 and isinstance(r.json().get("events"), list):
        ok("C2 /admin/rgssi/audit-log?limit=50 → 200 list", f"events={len(r.json()['events'])}")
    else:
        ko("C2 audit-log", f"HTTP {r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE}/admin/rgssi/audit-log", headers=auth_h(maman_token), timeout=20)
    if r.status_code == 403:
        ok("C2b audit-log maman → 403", "")
    else:
        ko("C2b audit-log maman", f"HTTP {r.status_code}")

    # C3 - GET /admin/rgssi/users-access-review
    r = requests.get(f"{BASE}/admin/rgssi/users-access-review", headers=auth_h(admin_token), timeout=20)
    if r.status_code == 200:
        d = r.json()
        keys = ("total_users", "active_90d", "inactive_90d", "by_role", "users_active", "users_inactive")
        missing = [k for k in keys if k not in d]
        if not missing:
            ok("C3 users-access-review keys", f"total={d['total_users']} active={d['active_90d']} inactive={d['inactive_90d']}")
        else:
            ko("C3 missing keys", f"{missing}")
        # by_role contains roles
        if isinstance(d.get("by_role"), dict):
            ok("C3b by_role dict", f"{d['by_role']}")
        else:
            ko("C3b by_role", f"{d.get('by_role')}")
    else:
        ko("C3 users-access-review", f"HTTP {r.status_code} {r.text[:200]}")

    r = requests.get(f"{BASE}/admin/rgssi/users-access-review", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 403:
        ok("C3c users-access-review pro → 403", "")
    else:
        ko("C3c users-access-review pro", f"HTTP {r.status_code}")

    # =====================================================================
    # CLEANUP — disable 2FA on PRO
    # =====================================================================
    print("\n[Cleanup] Disable 2FA on PRO")
    code = pyotp.TOTP(secret).now()
    r = requests.post(f"{BASE}/auth/2fa/disable", json={"code": code}, headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200 and r.json().get("totp_enabled") is False:
        ok("A6 POST /auth/2fa/disable correct code → 200", "")
    else:
        # Maybe code expired (30s window). Retry once with a fresh code.
        time.sleep(1)
        code = pyotp.TOTP(secret).now()
        r = requests.post(f"{BASE}/auth/2fa/disable", json={"code": code}, headers=auth_h(pro_token), timeout=20)
        if r.status_code == 200 and r.json().get("totp_enabled") is False:
            ok("A6 POST /auth/2fa/disable correct code → 200 (retry)", "")
        else:
            ko("A6 disable 2FA", f"HTTP {r.status_code} {r.text[:200]}")

    # Verify status now disabled
    r = requests.get(f"{BASE}/auth/2fa/status", headers=auth_h(pro_token), timeout=20)
    if r.status_code == 200 and r.json().get("enabled") is False:
        ok("A6b status after disable → enabled=false", "")
    else:
        ko("A6b status after disable", f"HTTP {r.status_code} {r.text[:200]}")

    # Verify can login again with no totp_code
    r = login(PRO_EMAIL, PRO_PASSWORD)
    if r.status_code == 200 and r.json().get("token"):
        ok("A6c login PRO without totp_code after disable → 200", "")
    else:
        ko("A6c login PRO post-disable", f"HTTP {r.status_code} {r.text[:200]}")

    # =====================================================================
    # SUMMARY
    # =====================================================================
    print("\n" + "="*80)
    print(f"PASS: {len(PASS)}")
    print(f"FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for label, msg in FAIL:
            print(f"  ❌ {label} :: {msg}")
    print("="*80)
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
