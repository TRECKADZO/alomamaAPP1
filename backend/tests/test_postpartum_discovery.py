"""
Tests for the new 'Moi Aussi' discovery mode (iter 5).
- /postpartum/conjoint/current-message MUST return discovery_mode=true with S1 message when no active postpartum (instead of 404)
- /postpartum/fiches accessible without auth
- /postpartum/testimonials accessible with login only (no setup required)
- /postpartum/conjoint/checklist accessible with maman role (no setup required)
- /postpartum/checkin still 404 if no setup
- /postpartum/dashboard still 404 if no setup
"""
import os
import uuid
import pytest
import requests


def _load_base_url() -> str:
    u = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not u:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.strip().startswith("EXPO_PUBLIC_BACKEND_URL="):
                        u = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass
    assert u, "EXPO_PUBLIC_BACKEND_URL not set"
    return u.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def maman_active_headers():
    """Existing maman with active postpartum (week_pp around 11)."""
    tok = _login(MAMAN_EMAIL, MAMAN_PASS)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def fresh_maman_headers():
    """Brand new maman without any postpartum setup."""
    email = f"TEST_disc_{uuid.uuid4().hex[:8]}@alomaman.dev"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Test1234!",
        "name": "TEST_DISC_Maman", "role": "maman",
        "phone": f"+225070{uuid.uuid4().hex[:7]}",
        "cgu_accepted": True, "consent_data": True,
        "accepte_cgu": True, "accepte_politique_confidentialite": True, "accepte_donnees_sante": True,
    }, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("token") or _login(email, "Test1234!")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestConjointCurrentMessageDiscovery:
    """The CORE change: current-message no longer 404s when there's no active postpartum."""

    def test_no_setup_returns_discovery_mode_with_s1(self, fresh_maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/current-message",
                         headers=fresh_maman_headers, timeout=15)
        assert r.status_code == 200, f"expected 200 (discovery), got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("discovery_mode") is True, f"discovery_mode must be true: {d}"
        assert d.get("week_pp") is None, f"week_pp must be None in discovery mode: {d}"
        # The S1 message (week=1 in CONJOINT_WEEKLY_MESSAGES is the first)
        assert d.get("message_week") == 1, f"message_week must be 1 (first available): {d}"
        assert isinstance(d.get("message_to_partner"), str) and len(d["message_to_partner"]) > 10

    def test_active_setup_returns_normal_message(self, maman_active_headers):
        r = requests.get(f"{API}/postpartum/conjoint/current-message",
                         headers=maman_active_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("discovery_mode") is False, f"discovery_mode must be false: {d}"
        assert isinstance(d.get("week_pp"), int) and d["week_pp"] >= 0
        assert isinstance(d.get("message_week"), int)
        assert isinstance(d.get("message_to_partner"), str) and len(d["message_to_partner"]) > 10


class TestFichesPublic:
    def test_fiches_no_auth(self):
        """GET /postpartum/fiches must be accessible without Authorization header."""
        r = requests.get(f"{API}/postpartum/fiches", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        # Spec says 14 fiches in request; original tests said >=8. Let's check >=14.
        assert len(items) >= 14, f"expected >=14 fiches, got {len(items)}"
        for it in items:
            assert "week" in it and "title" in it and "tip" in it


class TestNoSetupAccessibility:
    """Without an active postpartum setup, universal sections must remain accessible."""

    def test_testimonials_list_no_setup(self, fresh_maman_headers):
        r = requests.get(f"{API}/postpartum/testimonials", headers=fresh_maman_headers, timeout=15)
        assert r.status_code == 200, f"testimonials should be accessible without setup: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)

    def test_conjoint_checklist_no_setup(self, fresh_maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/checklist", headers=fresh_maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert len(items) == 9

    def test_conjoint_messages_no_setup(self, fresh_maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/messages", headers=fresh_maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert len(r.json().get("messages", [])) >= 5


class TestNoSetupStillBlocksPersonal:
    """Personal data endpoints must still reject when no postpartum is set up (intact validation)."""

    def test_checkin_blocked_without_setup(self, fresh_maman_headers):
        r = requests.post(f"{API}/postpartum/checkin", headers=fresh_maman_headers, json={
            "mood": 3, "physical_symptoms": [], "mental_symptoms": [],
            "free_text": "TEST_disc no setup yet",
        }, timeout=15)
        assert r.status_code in (400, 404), f"checkin without setup must fail: {r.status_code} {r.text}"

    def test_dashboard_404_without_setup(self, fresh_maman_headers):
        r = requests.get(f"{API}/postpartum/dashboard", headers=fresh_maman_headers, timeout=15)
        assert r.status_code == 404, f"dashboard must 404 without setup: {r.status_code}"
