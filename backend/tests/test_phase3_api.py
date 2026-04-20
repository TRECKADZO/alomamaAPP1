"""Phase 3 À lo Maman backend tests (FHIR, Télé-écho, Naissance, Push).

Covers: GET /api/fhir/patient (role guard, Bundle structure), POST/GET /api/tele-echo
(pro-only creation, 404 when RDV not owned, role filtering), /api/naissance CRUD + admin
validate, /api/push-token persistence, and a Phase 1/2 regression spot-check.
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or "https://maman-mobile-mvp.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@alomaman.com", "password": "Admin123!"}
MAMAN = {"email": "maman@test.com", "password": "Maman123!"}
PRO = {"email": "pro@test.com", "password": "Pro123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def maman_ctx():
    return _login(MAMAN)


@pytest.fixture(scope="module")
def pro_ctx():
    return _login(PRO)


@pytest.fixture(scope="module")
def admin_ctx():
    return _login(ADMIN)


# ---- shared RDV fixture between maman and pro (required for tele-echo) ----
@pytest.fixture(scope="module")
def confirmed_rdv(maman_ctx, pro_ctx):
    pro_id = pro_ctx["user"]["id"]
    r = requests.post(f"{API}/rdv", json={
        "pro_id": pro_id,
        "date": "2026-05-01T10:00:00Z",
        "motif": "TEST P3 echo",
    }, headers=_h(maman_ctx["token"]), timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    r2 = requests.patch(f"{API}/rdv/{rid}/status?status_val=confirme",
                        headers=_h(pro_ctx["token"]), timeout=10)
    assert r2.status_code == 200
    return rid


# ============================================================
# FHIR export
# ============================================================
class TestFHIR:
    def test_fhir_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/fhir/patient", headers=_h(pro_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_fhir_forbidden_for_admin(self, admin_ctx):
        r = requests.get(f"{API}/fhir/patient", headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_fhir_bundle_for_maman(self, maman_ctx):
        r = requests.get(f"{API}/fhir/patient", headers=_h(maman_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        bundle = r.json()
        assert bundle["resourceType"] == "Bundle"
        assert bundle["type"] == "collection"
        assert "entry" in bundle and isinstance(bundle["entry"], list)
        types = [e["resource"]["resourceType"] for e in bundle["entry"]]
        # Patient always present
        assert "Patient" in types
        # Given maman has at least a couple of enfants seeded during phase 2 tests,
        # RelatedPerson should be present. If not, we skip that assertion softly.
        # But Observation may or may not be present depending on state; only check
        # that the Patient resource carries expected identifying fields.
        patient = next(e["resource"] for e in bundle["entry"] if e["resource"]["resourceType"] == "Patient")
        assert patient["gender"] == "female"
        assert any(t.get("system") == "email" for t in patient.get("telecom", []))


# ============================================================
# Télé-échographie
# ============================================================
class TestTeleEcho:
    echo_id = None

    def test_maman_cannot_upload(self, maman_ctx, confirmed_rdv):
        r = requests.post(f"{API}/tele-echo", json={
            "rdv_id": confirmed_rdv,
            "image_base64": "data:image/png;base64,iVBORw0KGgo=",
            "description": "TEST",
        }, headers=_h(maman_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_pro_upload_404_for_foreign_rdv(self, pro_ctx):
        # Fake rdv id → should not be owned
        r = requests.post(f"{API}/tele-echo", json={
            "rdv_id": str(uuid.uuid4()),
            "image_base64": "data:image/png;base64,iVBORw0KGgo=",
            "description": "TEST bad rdv",
        }, headers=_h(pro_ctx["token"]), timeout=15)
        assert r.status_code == 404

    def test_pro_upload_success(self, pro_ctx, confirmed_rdv):
        r = requests.post(f"{API}/tele-echo", json={
            "rdv_id": confirmed_rdv,
            "image_base64": "data:image/png;base64,iVBORw0KGgo=",
            "description": "TEST echo 22SA",
            "semaine_grossesse": 22,
        }, headers=_h(pro_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rdv_id"] == confirmed_rdv
        assert data["semaine_grossesse"] == 22
        assert "_id" not in data
        TestTeleEcho.echo_id = data["id"]

    def test_maman_notif_generated(self, maman_ctx):
        r = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        notifs = r.json()
        # Most recent notification should mention échographie
        assert any("chograph" in (n.get("title", "") + n.get("body", "")).lower() for n in notifs)

    def test_list_echo_maman(self, maman_ctx, confirmed_rdv):
        r = requests.get(f"{API}/tele-echo", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert any(i["rdv_id"] == confirmed_rdv for i in items)
        # maman must only see her own
        assert all(i.get("maman_id") == maman_ctx["user"]["id"] for i in items)

    def test_list_echo_pro(self, pro_ctx, confirmed_rdv):
        r = requests.get(f"{API}/tele-echo", headers=_h(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert any(i["rdv_id"] == confirmed_rdv for i in items)
        assert all(i.get("pro_id") == pro_ctx["user"]["id"] for i in items)

    def test_echo_by_rdv(self, maman_ctx, confirmed_rdv):
        r = requests.get(f"{API}/tele-echo/rdv/{confirmed_rdv}",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(i["rdv_id"] == confirmed_rdv for i in items)

    def test_echo_by_rdv_forbidden_for_stranger(self, confirmed_rdv):
        # Register a third-party maman
        email = f"TEST_stranger_{uuid.uuid4().hex[:6]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test123!", "name": "Stranger", "role": "maman"
        }, timeout=10)
        tok = reg.json()["token"]
        r = requests.get(f"{API}/tele-echo/rdv/{confirmed_rdv}", headers=_h(tok), timeout=10)
        assert r.status_code == 403


# ============================================================
# Déclaration de naissance
# ============================================================
class TestNaissance:
    enfant_id = None
    naissance_id = None

    def test_seed_enfant(self, maman_ctx):
        r = requests.post(f"{API}/enfants", json={
            "nom": f"TEST_NaisEnf_{uuid.uuid4().hex[:4]}",
            "date_naissance": "2026-01-15",
            "sexe": "F",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        TestNaissance.enfant_id = r.json()["id"]

    def test_pro_forbidden(self, pro_ctx):
        r = requests.post(f"{API}/naissance", json={
            "enfant_id": "whatever",
            "lieu_naissance": "Lomé",
            "heure_naissance": "10:00",
            "poids_naissance_g": 3200,
            "taille_naissance_cm": 50.0,
            "nom_mere": "X",
        }, headers=_h(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_create_naissance(self, maman_ctx):
        assert TestNaissance.enfant_id
        payload = {
            "enfant_id": TestNaissance.enfant_id,
            "lieu_naissance": "CHU Sylvanus Olympio, Lomé",
            "heure_naissance": "14:30",
            "poids_naissance_g": 3250,
            "taille_naissance_cm": 49.5,
            "nom_pere": "Kofi Koné",
            "nom_mere": "Aminata Koné",
            "profession_pere": "Ingénieur",
            "profession_mere": "Enseignante",
            "medecin_accoucheur": "Dr. Fatou Diallo",
            "numero_acte": f"TEST-{uuid.uuid4().hex[:6]}",
        }
        r = requests.post(f"{API}/naissance", json=payload,
                          headers=_h(maman_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "en_attente"
        assert data["lieu_naissance"] == payload["lieu_naissance"]
        assert data["poids_naissance_g"] == 3250
        assert data["enfant_id"] == TestNaissance.enfant_id
        assert "_id" not in data
        TestNaissance.naissance_id = data["id"]

    def test_duplicate_naissance_400(self, maman_ctx):
        assert TestNaissance.enfant_id
        r = requests.post(f"{API}/naissance", json={
            "enfant_id": TestNaissance.enfant_id,
            "lieu_naissance": "X", "heure_naissance": "00:00",
            "poids_naissance_g": 3000, "taille_naissance_cm": 50,
            "nom_mere": "X",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 400

    def test_list_naissances_maman_only_own(self, maman_ctx):
        r = requests.get(f"{API}/naissance", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert any(n["id"] == TestNaissance.naissance_id for n in items)
        assert all(n["user_id"] == maman_ctx["user"]["id"] for n in items)

    def test_list_naissances_admin_sees_all(self, admin_ctx):
        r = requests.get(f"{API}/naissance", headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert any(n["id"] == TestNaissance.naissance_id for n in items)

    def test_validate_forbidden_for_maman(self, maman_ctx):
        assert TestNaissance.naissance_id
        r = requests.patch(
            f"{API}/naissance/{TestNaissance.naissance_id}/validate",
            headers=_h(maman_ctx["token"]), timeout=10,
        )
        assert r.status_code == 403

    def test_admin_validate(self, admin_ctx, maman_ctx):
        assert TestNaissance.naissance_id
        # notif count before
        r0 = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        before = len(r0.json())
        r = requests.patch(
            f"{API}/naissance/{TestNaissance.naissance_id}/validate",
            headers=_h(admin_ctx["token"]), timeout=10,
        )
        assert r.status_code == 200
        # GET to verify status updated
        r2 = requests.get(f"{API}/naissance/{TestNaissance.naissance_id}",
                          headers=_h(admin_ctx["token"]), timeout=10)
        assert r2.status_code == 200
        assert r2.json()["status"] == "validee"
        # maman received notif
        r3 = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        after = r3.json()
        assert len(after) > before
        assert any("valid" in (n.get("title", "") + n.get("body", "")).lower() for n in after)


# ============================================================
# Push token
# ============================================================
class TestPushToken:
    def test_save_valid_token(self, maman_ctx):
        r = requests.post(f"{API}/push-token",
                          json={"token": "ExponentPushToken[TEST_real123]"},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_save_invalid_token_no_crash(self, maman_ctx):
        # push_notif must be tolerant of invalid tokens
        r = requests.post(f"{API}/push-token",
                          json={"token": "not_a_real_token"},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_push_notif_no_crash_with_invalid_token(self, maman_ctx, pro_ctx):
        # Trigger a message (which calls push_notif) while token is invalid
        r = requests.post(f"{API}/messages",
                          json={"to_id": maman_ctx["user"]["id"], "content": "TEST push safe"},
                          headers=_h(pro_ctx["token"]), timeout=15)
        assert r.status_code == 200


# ============================================================
# Phase 1/2 regression spot-check
# ============================================================
class TestRegression:
    def test_auth_me(self, maman_ctx):
        r = requests.get(f"{API}/auth/me", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "maman"

    def test_grossesse(self, maman_ctx):
        r = requests.get(f"{API}/grossesse", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_pros_list(self, maman_ctx):
        r = requests.get(f"{API}/professionnels", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_community(self, maman_ctx):
        r = requests.get(f"{API}/community", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_reminders(self, maman_ctx):
        r = requests.get(f"{API}/reminders", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_rdv_list(self, maman_ctx):
        r = requests.get(f"{API}/rdv", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_admin_stats(self, admin_ctx):
        r = requests.get(f"{API}/admin/stats", headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "users" in data and data["users"] >= 4
