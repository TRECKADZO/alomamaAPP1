"""
Tests for the 2FA (TOTP) mobile login flow — iteration 21.

Scenarios covered:
1. Login WITHOUT 2FA (maman.test) → returns { token, user } directly.
2. Login for a user WITH totp_enabled but NO totp_code sent → returns
   { requires_2fa: true, user_id, email, message } (HTTP 200).
3. Same user with an INVALID totp_code → HTTP 401.
4. Same user with a VALID totp_code → returns { token, user }.
5. TWO_FACTOR_ENFORCEMENT env is set to "on" in backend/.env (regression).

The pro.test@alomaman.dev account is temporarily enrolled in TOTP via a direct
MongoDB update, then reset to its pre-test state during teardown.
"""

import os
import time
from typing import Iterator

import pyotp
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

BACKEND_ENV = dotenv_values("/app/backend/.env")
FRONTEND_ENV = dotenv_values("/app/frontend/.env")

BASE_URL = (
    FRONTEND_ENV.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or ""
).rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set in /app/frontend/.env")

MONGO_URL = BACKEND_ENV.get("MONGO_URL") or os.environ["MONGO_URL"]
DB_NAME = BACKEND_ENV.get("DB_NAME") or os.environ.get("DB_NAME", "alomaman")

PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def api_client() -> Iterator[requests.Session]:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    s.close()


@pytest.fixture(scope="module")
def pro_totp_secret(db) -> Iterator[str]:
    """Provision TOTP for pro.test then restore original fields after tests."""
    original = db.users.find_one({"email": PRO_EMAIL})
    assert original is not None, f"Missing seed user {PRO_EMAIL}"

    secret = pyotp.random_base32()
    db.users.update_one(
        {"email": PRO_EMAIL},
        {"$set": {
            "totp_secret": secret,
            "totp_enabled": True,
            "mfa_enabled": True,
        }},
    )
    yield secret

    # Teardown: restore prior state exactly
    unset = {}
    set_ = {}
    for k in ("totp_secret", "totp_enabled", "mfa_enabled"):
        if k in original:
            set_[k] = original[k]
        else:
            unset[k] = ""
    update: dict = {}
    if set_:
        update["$set"] = set_
    if unset:
        update["$unset"] = unset
    if update:
        db.users.update_one({"email": PRO_EMAIL}, update)


# ---------------------------------------------------------------------------
# Env / regression check
# ---------------------------------------------------------------------------

def test_two_factor_enforcement_env_is_on():
    """Regression: TWO_FACTOR_ENFORCEMENT must be 'on' (or unset) in backend/.env."""
    val = (BACKEND_ENV.get("TWO_FACTOR_ENFORCEMENT") or "on").strip().strip('"').lower()
    assert val not in ("off", "false", "0", "disabled", "no"), (
        f"TWO_FACTOR_ENFORCEMENT must not be off, got: {val!r}"
    )


# ---------------------------------------------------------------------------
# 1) Login WITHOUT 2FA — must still return token normally
# ---------------------------------------------------------------------------

def test_login_without_2fa_returns_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"], data
    assert "user" in data and data["user"]["email"] == MAMAN_EMAIL
    assert data["user"].get("role") == "maman"
    assert "requires_2fa" not in data


# ---------------------------------------------------------------------------
# 2) Login for TOTP-enabled user WITHOUT code -> requires_2fa
# ---------------------------------------------------------------------------

def test_login_totp_enabled_missing_code_requires_2fa(api_client, pro_totp_secret):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PRO_EMAIL, "password": PRO_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("requires_2fa") is True, data
    assert data.get("email") == PRO_EMAIL
    assert data.get("user_id"), data
    assert "token" not in data
    assert "message" in data


# ---------------------------------------------------------------------------
# 3) Login for TOTP-enabled user with INVALID code -> 401
# ---------------------------------------------------------------------------

def test_login_totp_wrong_code_returns_401(api_client, pro_totp_secret):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": PRO_EMAIL,
            "password": PRO_PASSWORD,
            "totp_code": "000000",
        },
        timeout=15,
    )
    assert r.status_code == 401, r.text
    body = r.json()
    assert "detail" in body
    assert "2fa" in body["detail"].lower() or "invalide" in body["detail"].lower()


# ---------------------------------------------------------------------------
# 4) Login with VALID TOTP code -> token
# ---------------------------------------------------------------------------

def test_login_totp_valid_code_returns_token(api_client, pro_totp_secret):
    # Generate a fresh OTP (retry once if we happen to land on a boundary)
    otp = pyotp.TOTP(pro_totp_secret).now()
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": PRO_EMAIL,
            "password": PRO_PASSWORD,
            "totp_code": otp,
        },
        timeout=15,
    )
    if r.status_code == 401:
        # Retry once with a fresh code (edge of the 30s window)
        time.sleep(1)
        otp = pyotp.TOTP(pro_totp_secret).now()
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": PRO_EMAIL,
                "password": PRO_PASSWORD,
                "totp_code": otp,
            },
            timeout=15,
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("token"), data
    assert data.get("user", {}).get("email") == PRO_EMAIL
    assert "requires_2fa" not in data

    # Bonus: use the token against /auth/me
    me = api_client.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {data['token']}"},
        timeout=15,
    )
    assert me.status_code == 200, me.text
    assert me.json().get("email") == PRO_EMAIL


# ---------------------------------------------------------------------------
# 5) Regression: bad password on TOTP-enabled user still 401 (no requires_2fa leak)
# ---------------------------------------------------------------------------

def test_login_bad_password_still_401(api_client, pro_totp_secret):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": PRO_EMAIL, "password": "wrong-password"},
        timeout=15,
    )
    assert r.status_code == 401
    body = r.json()
    assert body.get("requires_2fa") is not True
