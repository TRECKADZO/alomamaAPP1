"""Test the new Dossier endpoints:
 - GET /api/dossier (maman only)
 - POST /api/dossier/share
 - GET /api/dossier/public/{token} (public, no auth)
 - Regression: /api/fhir/patient
 - Non-maman (admin) → 403 on /api/dossier
"""
import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://health-prestation.preview.emergentagent.com/api"

MAMAN = {"email": "maman@test.com", "password": "Maman123!"}
ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name} — {detail}")


def main():
    # ---- Login maman ----
    try:
        maman_token, maman_user = login(MAMAN)
        record("login_maman", True, f"user id={maman_user['id']} role={maman_user['role']}")
    except AssertionError as e:
        record("login_maman", False, str(e))
        return

    # ---- 1) GET /dossier as maman ----
    r = requests.get(f"{BASE}/dossier", headers={"Authorization": f"Bearer {maman_token}"}, timeout=30)
    if r.status_code != 200:
        record("GET_dossier_maman_200", False, f"{r.status_code} {r.text[:200]}")
    else:
        body = r.json()
        expected_keys = {"patient", "grossesse", "enfants", "rdv", "cycles", "generated_at"}
        missing = expected_keys - set(body.keys())
        record("GET_dossier_maman_200_keys", not missing, f"missing={missing} keys={list(body.keys())}")
        # patient fields
        p = body.get("patient") or {}
        patient_fields = {"id", "nom", "email", "phone", "ville", "region"}
        missing_p = patient_fields - set(p.keys())
        record("GET_dossier_patient_fields", not missing_p,
               f"missing={missing_p} patient_keys={list(p.keys())}")
        # sanity
        record("GET_dossier_patient_id_matches_user",
               p.get("id") == maman_user["id"], f"patient.id={p.get('id')} user.id={maman_user['id']}")

    # ---- 2) POST /dossier/share ----
    r = requests.post(f"{BASE}/dossier/share", headers={"Authorization": f"Bearer {maman_token}"}, timeout=30)
    share_token = None
    share_url = None
    if r.status_code != 200:
        record("POST_dossier_share_200", False, f"{r.status_code} {r.text[:200]}")
    else:
        body = r.json()
        has_fields = {"token", "url", "expires_at"}.issubset(body.keys())
        record("POST_dossier_share_fields", has_fields, f"keys={list(body.keys())}")
        share_token = body.get("token")
        share_url = body.get("url")
        # expires_at ~7 days
        try:
            exp = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            delta_days = (exp - now).total_seconds() / 86400.0
            ok = 6.5 <= delta_days <= 7.5
            record("POST_dossier_share_expires_7d", ok, f"delta_days={delta_days:.3f}")
        except Exception as e:
            record("POST_dossier_share_expires_7d", False, f"parse error: {e}")
        # url contains path
        url_ok = bool(share_url) and share_token and f"/api/dossier/public/{share_token}" in share_url
        record("POST_dossier_share_url_contains_token", url_ok, f"url={share_url}")

    # ---- 3) GET /dossier/public/{token} (no auth) ----
    if share_token:
        r = requests.get(f"{BASE}/dossier/public/{share_token}", timeout=30)
        if r.status_code != 200:
            record("GET_dossier_public_200", False, f"{r.status_code} {r.text[:200]}")
        else:
            body = r.json()
            expected_keys = {"patient", "grossesse", "enfants", "rdv", "cycles", "generated_at"}
            missing = expected_keys - set(body.keys())
            record("GET_dossier_public_keys", not missing,
                   f"missing={missing} keys={list(body.keys())}")
            # Public must work without Authorization header (we didn't send one).
            record("GET_dossier_public_no_auth_needed", True, "200 without Authorization header")
    else:
        record("GET_dossier_public_200", False, "no share_token obtained in step 2")

    # ---- 3b) Bogus token → 404 ----
    r = requests.get(f"{BASE}/dossier/public/bogus-token-xxx-yyy-1234", timeout=30)
    record("GET_dossier_public_bogus_404", r.status_code == 404,
           f"status={r.status_code} body={r.text[:120]}")

    # ---- 4) Regression: GET /fhir/patient as maman ----
    r = requests.get(f"{BASE}/fhir/patient", headers={"Authorization": f"Bearer {maman_token}"}, timeout=30)
    if r.status_code != 200:
        record("GET_fhir_patient_200", False, f"{r.status_code} {r.text[:200]}")
    else:
        body = r.json()
        record("GET_fhir_patient_200",
               body.get("resourceType") == "Bundle",
               f"resourceType={body.get('resourceType')} entries={len(body.get('entry', []))}")

    # ---- 5) Non-maman (admin) → 403 on /dossier ----
    try:
        admin_token, admin_user = login(ADMIN)
        record("login_admin", True, f"role={admin_user['role']}")
    except AssertionError as e:
        record("login_admin", False, str(e))
        admin_token = None

    if admin_token:
        r = requests.get(f"{BASE}/dossier", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        record("GET_dossier_admin_403",
               r.status_code == 403,
               f"status={r.status_code} body={r.text[:160]}")

    # ---- Summary ----
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n=== SUMMARY: {passed}/{total} checks PASS ===")
    for n, ok, d in results:
        if not ok:
            print(f"  FAIL: {n} — {d}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
