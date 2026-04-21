"""À lo Maman backend API tests (pytest)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://health-prestation.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@alomaman.com", "password": "Admin123!"}
MAMAN = {"email": "maman@test.com", "password": "Maman123!"}
PRO = {"email": "pro@test.com", "password": "Pro123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_ctx():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def maman_ctx():
    return _login(MAMAN)


@pytest.fixture(scope="module")
def pro_ctx():
    return _login(PRO)


# -------- Health & Auth --------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_admin(self, admin_ctx):
        assert admin_ctx["user"]["role"] == "admin"
        assert "token" in admin_ctx

    def test_login_maman(self, maman_ctx):
        assert maman_ctx["user"]["role"] == "maman"

    def test_login_pro(self, pro_ctx):
        assert pro_ctx["user"]["role"] == "professionnel"

    def test_login_bad_credentials(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@alomaman.com", "password": "WRONG"}, timeout=10)
        assert r.status_code == 401

    def test_me_with_token(self, maman_ctx):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == "maman@test.com"
        assert "_id" not in r.json()

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_register_new_user(self):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test123!", "name": "Test User", "role": "maman", "phone": "+22890000000"
        }, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "maman"
        assert data["user"]["email"] == email
        assert "token" in data

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "maman@test.com", "password": "Test123!", "name": "Dup", "role": "maman"
        }, timeout=10)
        assert r.status_code == 400

    def test_register_pro_with_specialite(self):
        email = f"TEST_pro_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test123!", "name": "Pro Test",
            "role": "professionnel", "specialite": "Gynécologue"
        }, timeout=10)
        assert r.status_code == 200


# -------- Professionnels listing --------
class TestPros:
    def test_list_pros(self, maman_ctx):
        r = requests.get(f"{API}/professionnels", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        pros = r.json()
        assert isinstance(pros, list) and len(pros) >= 3
        # all returned pros should have specialite
        assert all(p.get("role") != "admin" for p in pros)


# -------- Grossesse --------
class TestGrossesse:
    def test_create_grossesse_maman(self, maman_ctx):
        r = requests.post(f"{API}/grossesse", json={
            "date_debut": "2025-06-01", "date_terme": "2026-03-01",
            "symptomes": ["nausées"], "notes": "test"
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["active"] is True
        assert "_id" not in r.json()

    def test_get_grossesse(self, maman_ctx):
        r = requests.get(f"{API}/grossesse", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["active"] is True

    def test_grossesse_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/grossesse", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- Enfants --------
class TestEnfants:
    enfant_id = None

    def test_create_enfant(self, maman_ctx):
        r = requests.post(f"{API}/enfants", json={
            "nom": "TEST_Petit", "date_naissance": "2024-01-15", "sexe": "F", "poids_kg": 3.2
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["nom"] == "TEST_Petit"
        assert "_id" not in data
        TestEnfants.enfant_id = data["id"]

    def test_list_enfants(self, maman_ctx):
        r = requests.get(f"{API}/enfants", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert any(e["id"] == TestEnfants.enfant_id for e in r.json())

    def test_add_vaccin(self, maman_ctx):
        assert TestEnfants.enfant_id
        r = requests.post(f"{API}/enfants/{TestEnfants.enfant_id}/vaccins", json={
            "nom": "BCG", "date": "2024-01-16", "fait": True
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any(v["nom"] == "BCG" for v in r.json()["vaccins"])

    def test_enfants_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/enfants", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- RDV flow --------
class TestRdv:
    rdv_id = None
    pro_id = None

    def test_list_pros_and_pick(self, maman_ctx):
        r = requests.get(f"{API}/professionnels", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        pros = [p for p in r.json() if p["email"] == "pro@test.com"]
        assert len(pros) == 1
        TestRdv.pro_id = pros[0]["id"]

    def test_maman_creates_rdv(self, maman_ctx):
        assert TestRdv.pro_id
        r = requests.post(f"{API}/rdv", json={
            "pro_id": TestRdv.pro_id, "date": "2026-02-01T10:00:00Z", "motif": "TEST Consultation"
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "en_attente"
        TestRdv.rdv_id = data["id"]

    def test_pro_lists_rdv(self, pro_ctx):
        r = requests.get(f"{API}/rdv", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any(rdv["id"] == TestRdv.rdv_id for rdv in r.json())

    def test_pro_confirms_rdv(self, pro_ctx):
        assert TestRdv.rdv_id
        # query param style
        r = requests.patch(f"{API}/rdv/{TestRdv.rdv_id}/status?status_val=confirme",
                           headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        # verify via list
        r2 = requests.get(f"{API}/rdv", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        target = next((x for x in r2.json() if x["id"] == TestRdv.rdv_id), None)
        assert target is not None
        assert target["status"] == "confirme"

    def test_maman_cant_change_status(self, maman_ctx):
        assert TestRdv.rdv_id
        r = requests.patch(f"{API}/rdv/{TestRdv.rdv_id}/status?status_val=annule",
                           headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- Messagerie --------
class TestMessages:
    def test_maman_sends_to_pro(self, maman_ctx, pro_ctx):
        pro_id = pro_ctx["user"]["id"]
        r = requests.post(f"{API}/messages", json={"to_id": pro_id, "content": "TEST bonjour docteur"},
                          headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert "_id" not in r.json()

    def test_conversations(self, pro_ctx):
        r = requests.get(f"{API}/messages/conversations", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_thread(self, maman_ctx, pro_ctx):
        pro_id = pro_ctx["user"]["id"]
        r = requests.get(f"{API}/messages/{pro_id}", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any("TEST bonjour" in m["content"] for m in r.json())


# -------- Communauté --------
class TestCommunity:
    post_id = None

    def test_list_posts(self, maman_ctx):
        r = requests.get(f"{API}/community", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_create_post(self, maman_ctx):
        r = requests.post(f"{API}/community", json={
            "title": "TEST_Question", "content": "Bonjour", "category": "general"
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        TestCommunity.post_id = r.json()["id"]

    def test_like_post(self, maman_ctx):
        assert TestCommunity.post_id
        r = requests.post(f"{API}/community/{TestCommunity.post_id}/like",
                          headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert len(r.json()["likes"]) == 1

    def test_comment_post(self, pro_ctx):
        assert TestCommunity.post_id
        r = requests.post(f"{API}/community/{TestCommunity.post_id}/comment",
                          json={"content": "TEST reply"},
                          headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any(c["content"] == "TEST reply" for c in r.json()["comments"])


# -------- Reminders --------
class TestReminders:
    rid = None

    def test_create_reminder(self, maman_ctx):
        r = requests.post(f"{API}/reminders", json={
            "title": "TEST rappel", "due_at": "2026-02-01T08:00:00Z", "note": "prise de médoc"
        }, headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        TestReminders.rid = r.json()["id"]

    def test_list_reminders(self, maman_ctx):
        r = requests.get(f"{API}/reminders", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any(x["id"] == TestReminders.rid for x in r.json())

    def test_toggle_reminder(self, maman_ctx):
        r = requests.patch(f"{API}/reminders/{TestReminders.rid}",
                           headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["done"] is True


# -------- Admin --------
class TestAdmin:
    def test_admin_stats(self, admin_ctx):
        r = requests.get(f"{API}/admin/stats", headers=_auth_headers(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        for k in ["users", "mamans", "professionnels", "rdv", "enfants", "posts", "messages"]:
            assert k in data and isinstance(data[k], int)

    def test_admin_users(self, admin_ctx):
        r = requests.get(f"{API}/admin/users", headers=_auth_headers(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 4
        assert all("password_hash" not in u and "_id" not in u for u in users)

    def test_admin_stats_forbidden_for_maman(self, maman_ctx):
        r = requests.get(f"{API}/admin/stats", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_admin_users_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/admin/users", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- Pro-specific --------
class TestProEndpoints:
    def test_pro_patients(self, pro_ctx):
        r = requests.get(f"{API}/pro/patients", headers=_auth_headers(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_pro_patients_forbidden_for_maman(self, maman_ctx):
        r = requests.get(f"{API}/pro/patients", headers=_auth_headers(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- AI Chat --------
class TestAiChat:
    def test_ai_chat_french(self, maman_ctx):
        session_id = f"TEST_{uuid.uuid4().hex[:8]}"
        r = requests.post(f"{API}/ai/chat", json={
            "session_id": session_id, "message": "Bonjour, quels aliments éviter pendant la grossesse ?"
        }, headers=_auth_headers(maman_ctx["token"]), timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "response" in data and isinstance(data["response"], str)
        assert len(data["response"]) > 20
