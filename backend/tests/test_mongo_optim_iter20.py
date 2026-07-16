"""
Iter 20 — Backend MongoDB optimisation tests.

Validates:
  1. GET /api/community — pagination + projection (no heavy base64 fields)
  2. GET /api/enfants   — no `photo` / `mesures`, but `numero_cmu` / `allergies` decrypted
  3. GET /api/messages/{other_id} — chronological asc, limit, before= filter
  4. Regression GET /api/etablissements/nearby (Maternité ≥ 20)
  5. Startup log clean (/var/log/supervisor/backend.err.log)
"""

import os
import re
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
else:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL missing from env")

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"

# Heavy fields that MUST NOT appear in projected list responses
HEAVY_COMMUNITY_FIELDS = {"image_full", "image_base64", "media", "attachment_base64", "content_full"}
HEAVY_ENFANT_FIELDS = {"photo", "mesures"}


# ------------------------- Fixtures -----------------------------------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, pwd):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="session")
def maman_token(api):
    return _login(api, MAMAN_EMAIL, MAMAN_PWD)["token"]


@pytest.fixture(scope="session")
def pro_login(api):
    return _login(api, PRO_EMAIL, PRO_PWD)


@pytest.fixture(scope="session")
def maman_headers(maman_token):
    return {"Authorization": f"Bearer {maman_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def pro_headers(pro_login):
    return {"Authorization": f"Bearer {pro_login['token']}", "Content-Type": "application/json"}


# ------------------------- 1. /api/community --------------------------
class TestCommunity:
    def test_default_returns_list(self, api, maman_headers):
        r = api.get(f"{BASE_URL}/api/community", headers=maman_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list)

    def test_no_heavy_fields_in_projection(self, api, maman_headers):
        r = api.get(f"{BASE_URL}/api/community", headers=maman_headers, timeout=30)
        assert r.status_code == 200
        posts = r.json()
        for p in posts:
            leaked = HEAVY_COMMUNITY_FIELDS & set(p.keys())
            assert not leaked, f"Post {p.get('id')} leaks heavy fields: {leaked}"
            # Sanity: allowed keys present when post exists
            for expected in ("id", "user_id", "title", "content", "created_at"):
                assert expected in p, f"Missing projected field {expected} in {p.keys()}"

    def test_pagination_limit_10(self, api, maman_headers):
        r = api.get(f"{BASE_URL}/api/community?limit=10&skip=0", headers=maman_headers, timeout=30)
        assert r.status_code == 200
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) <= 10

    def test_pagination_skip_works(self, api, maman_headers):
        # Best-effort test — if <=1 post, we still get 200
        r0 = api.get(f"{BASE_URL}/api/community?limit=5&skip=0", headers=maman_headers, timeout=30)
        r1 = api.get(f"{BASE_URL}/api/community?limit=5&skip=5", headers=maman_headers, timeout=30)
        assert r0.status_code == 200 and r1.status_code == 200
        ids0 = {p["id"] for p in r0.json()}
        ids1 = {p["id"] for p in r1.json()}
        # If both pages non-empty, they should not overlap
        if ids0 and ids1:
            assert ids0.isdisjoint(ids1), "skip=5 returned same ids as skip=0"


# ------------------------- 2. /api/enfants ----------------------------
class TestEnfants:
    def test_no_photo_no_mesures(self, api, maman_headers):
        r = api.get(f"{BASE_URL}/api/enfants", headers=maman_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        enfants = r.json()
        assert isinstance(enfants, list)
        for e in enfants:
            leaked = HEAVY_ENFANT_FIELDS & set(e.keys())
            assert not leaked, f"Enfant {e.get('id')} still exposes {leaked}"

    def test_numero_cmu_and_allergies_decrypted(self, api, maman_headers):
        # Ensure there is at least one enfant with numero_cmu/allergies encrypted then read
        r = api.get(f"{BASE_URL}/api/enfants", headers=maman_headers, timeout=30)
        assert r.status_code == 200
        enfants = r.json()

        target = None
        for e in enfants:
            if e.get("numero_cmu") or e.get("allergies"):
                target = e
                break

        if not target:
            # Create one to validate decryption path
            payload = {
                "nom": "TESTENC",
                "prenom": f"TEST_ENC_{uuid.uuid4().hex[:6]}",
                "sexe": "F",
                "date_naissance": "2024-01-15",
                "numero_cmu": "CMU-1234567",
                "allergies": "arachide, pollen",
            }
            rc = api.post(f"{BASE_URL}/api/enfants", headers=maman_headers, json=payload, timeout=30)
            assert rc.status_code in (200, 201), f"Create enfant failed: {rc.status_code} {rc.text[:200]}"
            created = rc.json()

            # Re-fetch list
            r = api.get(f"{BASE_URL}/api/enfants", headers=maman_headers, timeout=30)
            enfants = r.json()
            target = next((e for e in enfants if e.get("id") == created.get("id")), None)
            assert target is not None, "Newly created enfant not found in list"

        # Now validate content: not a gcm:... encrypted blob, real cleartext
        cmu = target.get("numero_cmu") or ""
        allergies = target.get("allergies")

        # Cleartext heuristic: does not start with the encryption sentinel
        assert not (isinstance(cmu, str) and cmu.startswith("gcm:")), f"numero_cmu not decrypted: {cmu[:30]}"

        # allergies may be a list[str] or a str depending on schema
        if isinstance(allergies, list):
            joined = ", ".join(str(x) for x in allergies)
            assert not any(str(x).startswith("gcm:") for x in allergies), (
                f"allergies (list) not decrypted: {allergies}"
            )
            if joined:
                assert re.search(r"[A-Za-z]", joined), f"allergies looks broken: {allergies!r}"
        else:
            allergies_s = allergies or ""
            assert not (isinstance(allergies_s, str) and allergies_s.startswith("gcm:")), (
                f"allergies not decrypted: {allergies_s[:30]}"
            )
            if allergies_s:
                assert re.search(r"[A-Za-z]", allergies_s), f"allergies looks broken: {allergies_s!r}"

        # And should look like plausible plaintext (contains a letter or digit)
        if cmu:
            assert re.search(r"[A-Za-z0-9]", cmu), f"numero_cmu looks broken: {cmu!r}"


# ------------------------- 3. /api/messages/{other_id} ----------------
class TestMessagesThread:
    @pytest.fixture(scope="class")
    def other_id(self, api, maman_headers, pro_login):
        # Pro user id
        r = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {pro_login['token']}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        return r.json()["id"]

    @pytest.fixture(scope="class")
    def seeded_messages(self, api, maman_headers, pro_headers, other_id):
        # Send a couple of messages so the thread is not empty
        me_pro = api.get(f"{BASE_URL}/api/auth/me", headers=pro_headers, timeout=30).json()
        me_maman = api.get(f"{BASE_URL}/api/auth/me", headers=maman_headers, timeout=30).json()
        # Send from maman → pro
        m1 = api.post(
            f"{BASE_URL}/api/messages",
            headers=maman_headers,
            json={"to_id": me_pro["id"], "content": f"TEST_iter20_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert m1.status_code in (200, 201), m1.text[:200]
        # Send from pro → maman
        m2 = api.post(
            f"{BASE_URL}/api/messages",
            headers=pro_headers,
            json={"to_id": me_maman["id"], "content": f"TEST_iter20_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert m2.status_code in (200, 201), m2.text[:200]
        return [m1.json(), m2.json()]

    def test_thread_default(self, api, maman_headers, other_id, seeded_messages):
        r = api.get(f"{BASE_URL}/api/messages/{other_id}", headers=maman_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        msgs = r.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 2

    def test_thread_limit_20(self, api, maman_headers, other_id, seeded_messages):
        r = api.get(f"{BASE_URL}/api/messages/{other_id}?limit=20", headers=maman_headers, timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) <= 20

    def test_thread_sorted_chronological_asc(self, api, maman_headers, other_id, seeded_messages):
        r = api.get(f"{BASE_URL}/api/messages/{other_id}?limit=50", headers=maman_headers, timeout=30)
        assert r.status_code == 200
        msgs = r.json()
        if len(msgs) >= 2:
            dates = [m["created_at"] for m in msgs]
            assert dates == sorted(dates), f"Messages not chronological asc: {dates}"

    def test_thread_before_filter(self, api, maman_headers, other_id, seeded_messages):
        # Very old cutoff: expect empty list
        r = api.get(
            f"{BASE_URL}/api/messages/{other_id}?before=2000-01-01T00:00:00",
            headers=maman_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        msgs = r.json()
        assert msgs == [], f"before=2000 should be empty, got {len(msgs)}"

        # Future cutoff: should return the seeded ones
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r2 = api.get(
            f"{BASE_URL}/api/messages/{other_id}?limit=20&before={future}",
            headers=maman_headers,
            timeout=30,
        )
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)
        assert len(r2.json()) >= 2


# ------------------------- 4. Regression /nearby ----------------------
class TestNearbyRegression:
    def test_maternite_5km_min_20(self, api):
        r = api.get(
            f"{BASE_URL}/api/etablissements/nearby"
            "?lat=5.3453&lon=-4.0072&radius_km=5&specialite=Maternité",
            timeout=45,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Support both {items, total_in_radius} and bare list shapes
        if isinstance(data, dict):
            total = data.get("total_in_radius") or data.get("total") or len(data.get("items", []))
            items = data.get("items", [])
        else:
            items = data
            total = len(items)
        assert total >= 20, f"Expected ≥20 maternités, got {total}"
        # Items sorted by distance asc when present
        if items and all("distance_km" in it for it in items[:3]):
            first3 = [it["distance_km"] for it in items[:3]]
            assert first3 == sorted(first3), f"Not sorted asc: {first3}"


# ------------------------- 5. Startup log clean -----------------------
class TestStartupLogs:
    def test_no_errors_on_backend_err_log(self):
        path = "/var/log/supervisor/backend.err.log"
        if not os.path.exists(path):
            pytest.skip(f"{path} missing")
        with open(path, "r", errors="ignore") as f:
            # Read last 400 lines
            lines = f.readlines()[-400:]
        content = "".join(lines)
        # Uvicorn/INFO logs go to err.log; only fail on real tracebacks / ERROR keyword lines
        bad_markers = ["Traceback (most recent call last)", "CRITICAL", "Exception in ASGI"]
        found = [m for m in bad_markers if m in content]
        assert not found, f"Backend err log contains fatal markers: {found}\nTail:\n{content[-2000:]}"
