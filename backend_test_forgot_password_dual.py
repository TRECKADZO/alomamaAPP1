#!/usr/bin/env python3
"""
Backend test: forgot-password dual-identifier (email OR phone) flow.
Endpoint base: REACT_APP/EXPO_PUBLIC_BACKEND_URL + /api
"""
import os
import sys
import time
import random
import string
import json
from typing import Optional

import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PASS = 0
FAIL = 0
FAILURES = []


def check(label: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        FAILURES.append(f"{label} :: {detail}")
        print(f"  ❌ {label} :: {detail}")


def rnd(n=4):
    return "".join(random.choices(string.digits, k=n))


def post(path, body, token=None, expect=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(url, json=body, headers=headers, timeout=30)
    try:
        data = r.json()
    except Exception:
        data = {"_text": r.text}
    return r.status_code, data


def get(path, token=None):
    url = f"{BASE}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(url, headers=headers, timeout=30)
    try:
        data = r.json()
    except Exception:
        data = {"_text": r.text}
    return r.status_code, data


def register(email=None, phone=None, name="Test User", password="Pass123!",
             role="maman"):
    body = {
        "password": password,
        "name": name,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    return post("/auth/register", body)


def login(email=None, phone=None, password=""):
    body = {"password": password}
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    return post("/auth/login", body)


def delete_account(token, password):
    url = f"{BASE}/auth/me"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"password": password, "confirmation": "SUPPRIMER"}
    r = requests.delete(url, headers=headers, json=body, timeout=30)
    try:
        data = r.json()
    except Exception:
        data = {}
    return r.status_code, data


def main():
    print("=" * 80)
    print("Forgot-Password DUAL identifier (email OR phone) — Backend Test")
    print(f"BASE: {BASE}")
    print("=" * 80)

    suffix = rnd(4)

    # ------------------------------------------------------------------
    # Setup: fresh users
    # ------------------------------------------------------------------
    print("\n[1] Setup — create fresh users")
    user_a = {
        "email": f"emailtest_{suffix}@alomaman.com",
        "phone": f"+22507999{suffix}",
        "name": f"Marie Dupont {suffix}",
        "password": "OldPass123!",
    }
    user_b_phone = f"+22507888{suffix}"
    user_b = {
        "phone": user_b_phone,
        "name": f"Jean Martin {suffix}",
        "password": "OldPass123!",
    }
    user_c_phone = f"+22507777{suffix}"
    user_c = {
        "phone": user_c_phone,
        "name": f"Awa Traore {suffix}",
        "password": "OldPass123!",
    }
    user_d = {
        "email": f"backcompat_{suffix}@alomaman.com",
        "name": f"Sara Compat {suffix}",
        "password": "OldPass123!",
    }

    sc, body = register(email=user_a["email"], phone=user_a["phone"],
                        name=user_a["name"], password=user_a["password"])
    check(f"Register user A (email+phone) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_a_initial = body.get("token") if sc == 200 else None

    sc, body = register(phone=user_b["phone"], name=user_b["name"],
                        password=user_b["password"])
    check(f"Register user B (phone-only) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_b_initial = body.get("token") if sc == 200 else None

    sc, body = register(phone=user_c["phone"], name=user_c["name"],
                        password=user_c["password"])
    check(f"Register user C (phone-only, for backcompat phone test) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_c_initial = body.get("token") if sc == 200 else None

    sc, body = register(email=user_d["email"], name=user_d["name"],
                        password=user_d["password"])
    check(f"Register user D (email-only, for backcompat email test) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_d_initial = body.get("token") if sc == 200 else None

    # ------------------------------------------------------------------
    # 2) Test EMAIL identifier
    # ------------------------------------------------------------------
    print("\n[2] EMAIL identifier flow (user A)")

    # 2a) request with identifier=email + correct name
    sc, body = post("/auth/forgot-password/request",
                    {"identifier": user_a["email"], "name": user_a["name"]})
    check("2a) request {identifier=email, correct name} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("2a) verified=True",
          bool(body.get("verified")) is True, f"body={body}")
    code_a = body.get("code")
    check("2a) code present (6 digits)",
          isinstance(code_a, str) and len(code_a) == 6 and code_a.isdigit(),
          f"code={code_a!r}")
    check("2a) identifier_kind == 'email'",
          body.get("identifier_kind") == "email",
          f"identifier_kind={body.get('identifier_kind')}")

    # 2b) wrong name -> verified=False
    sc, body = post("/auth/forgot-password/request",
                    {"identifier": user_a["email"], "name": "Wrong Name XYZ"})
    check("2b) request {email, wrong name} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("2b) verified=False",
          body.get("verified") is False, f"body={body}")

    # 2c) unknown email
    sc, body = post("/auth/forgot-password/request",
                    {"identifier": f"unknown_{suffix}@nope.com", "name": "X Y"})
    check("2c) request {unknown email} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("2c) verified=False (unknown email)",
          body.get("verified") is False, f"body={body}")

    # 2d) verify with correct code
    sc, body = post("/auth/forgot-password/verify",
                    {"identifier": user_a["email"], "code": code_a})
    check("2d) verify {email, correct code} -> 200",
          sc == 200, f"sc={sc} body={body}")
    reset_token_a = body.get("reset_token")
    check("2d) reset_token present",
          bool(reset_token_a) and isinstance(reset_token_a, str) and len(reset_token_a) > 10,
          f"reset_token={reset_token_a}")

    # 2e) reset
    new_email_pwd = "NewEmailPwd!"
    sc, body = post("/auth/forgot-password/reset",
                    {"reset_token": reset_token_a, "new_password": new_email_pwd})
    check("2e) reset -> 200",
          sc == 200, f"sc={sc} body={body}")

    # 2f) login with email + new password
    sc, body = login(email=user_a["email"], password=new_email_pwd)
    check("2f) login (email + new password) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_a_new = body.get("token") if sc == 200 else None

    # ------------------------------------------------------------------
    # 3) Test PHONE identifier
    # ------------------------------------------------------------------
    print("\n[3] PHONE identifier flow (user B)")

    # 3a)
    sc, body = post("/auth/forgot-password/request",
                    {"identifier": user_b["phone"], "name": user_b["name"]})
    check("3a) request {identifier=phone, correct name} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("3a) verified=True",
          body.get("verified") is True, f"body={body}")
    code_b = body.get("code")
    check("3a) code present (6 digits)",
          isinstance(code_b, str) and len(code_b) == 6 and code_b.isdigit(),
          f"code={code_b!r}")
    check("3a) identifier_kind == 'phone'",
          body.get("identifier_kind") == "phone",
          f"identifier_kind={body.get('identifier_kind')}")

    # 3b) verify
    sc, body = post("/auth/forgot-password/verify",
                    {"identifier": user_b["phone"], "code": code_b})
    check("3b) verify {phone, correct code} -> 200",
          sc == 200, f"sc={sc} body={body}")
    reset_token_b = body.get("reset_token")
    check("3b) reset_token present",
          bool(reset_token_b), f"reset_token={reset_token_b}")

    # 3c) reset
    new_phone_pwd = "NewPhonePwd!"
    sc, body = post("/auth/forgot-password/reset",
                    {"reset_token": reset_token_b, "new_password": new_phone_pwd})
    check("3c) reset -> 200", sc == 200, f"sc={sc} body={body}")

    # 3d) login with phone + new password
    sc, body = login(phone=user_b["phone"], password=new_phone_pwd)
    check("3d) login (phone + new password) -> 200",
          sc == 200, f"sc={sc} body={body}")
    token_b_new = body.get("token") if sc == 200 else None

    # ------------------------------------------------------------------
    # 4) Backward compat
    # ------------------------------------------------------------------
    print("\n[4] Backward compatibility (old payload formats)")

    # 4a) {phone, name} old format
    sc, body = post("/auth/forgot-password/request",
                    {"phone": user_c["phone"], "name": user_c["name"]})
    check("4a) request OLD {phone, name} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("4a) verified=True (old phone format)",
          body.get("verified") is True, f"body={body}")
    check("4a) identifier_kind == 'phone'",
          body.get("identifier_kind") == "phone",
          f"identifier_kind={body.get('identifier_kind')}")

    # 4b) {email, name} old format -> auto-detected as email
    sc, body = post("/auth/forgot-password/request",
                    {"email": user_d["email"], "name": user_d["name"]})
    check("4b) request OLD {email, name} -> 200",
          sc == 200, f"sc={sc} body={body}")
    check("4b) verified=True (old email format)",
          body.get("verified") is True, f"body={body}")
    check("4b) identifier_kind == 'email'",
          body.get("identifier_kind") == "email",
          f"identifier_kind={body.get('identifier_kind')}")

    # ------------------------------------------------------------------
    # 5) Validation
    # ------------------------------------------------------------------
    print("\n[5] Validation (missing identifier)")

    # 5a) request without any identifier -> 400
    sc, body = post("/auth/forgot-password/request", {"name": "X Y"})
    check("5a) request without identifier -> 400",
          sc == 400, f"sc={sc} body={body}")

    # 5b) verify without any identifier -> 400
    sc, body = post("/auth/forgot-password/verify", {"code": "123456"})
    check("5b) verify without identifier -> 400",
          sc == 400, f"sc={sc} body={body}")

    # ------------------------------------------------------------------
    # CLEANUP — delete all test users
    # ------------------------------------------------------------------
    print("\n[CLEANUP] Delete test users")

    # User A — login with new pwd then delete
    if token_a_new:
        sc, _ = delete_account(token_a_new, new_email_pwd)
        check(f"Cleanup: delete user A ({user_a['email']})",
              sc == 200, f"sc={sc}")

    # User B — login with new pwd then delete
    if token_b_new:
        sc, _ = delete_account(token_b_new, new_phone_pwd)
        check(f"Cleanup: delete user B ({user_b['phone']})",
              sc == 200, f"sc={sc}")

    # User C — old password unchanged
    if token_c_initial:
        sc, _ = delete_account(token_c_initial, user_c["password"])
        check(f"Cleanup: delete user C ({user_c['phone']})",
              sc == 200, f"sc={sc}")

    # User D — old password unchanged
    if token_d_initial:
        sc, _ = delete_account(token_d_initial, user_d["password"])
        check(f"Cleanup: delete user D ({user_d['email']})",
              sc == 200, f"sc={sc}")

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------
    print()
    print("=" * 80)
    print(f"RESULT: {PASS} PASS / {FAIL} FAIL")
    if FAIL:
        print("Failures:")
        for f in FAILURES:
            print(f"  - {f}")
    print("=" * 80)
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
