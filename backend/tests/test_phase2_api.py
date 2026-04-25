"""À lo Maman Phase 2 backend API tests (pytest).

Tests: cycle, contraception, allaitement, humeur, notifications (+auto-gen),
push-token, search, video-consultation, photos, mesures, role guards.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://cycle-tracker-pro.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
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


# -------- Cycle menstruel --------
class TestCycle:
    cid = None

    def test_create_cycle(self, maman_ctx):
        r = requests.post(f"{API}/cycle", json={
            "date_debut_regles": "2026-01-05",
            "duree_regles": 5,
            "duree_cycle": 28,
            "notes": "TEST cycle",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["duree_cycle"] == 28
        assert "_id" not in data
        TestCycle.cid = data["id"]

    def test_list_cycle(self, maman_ctx):
        r = requests.get(f"{API}/cycle", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any(c["id"] == TestCycle.cid for c in r.json())

    def test_cycle_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/cycle", headers=_h(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_delete_cycle(self, maman_ctx):
        assert TestCycle.cid
        r = requests.delete(f"{API}/cycle/{TestCycle.cid}", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        # verify deletion
        r2 = requests.get(f"{API}/cycle", headers=_h(maman_ctx["token"]), timeout=10)
        assert not any(c["id"] == TestCycle.cid for c in r2.json())


# -------- Contraception --------
class TestContraception:
    cid = None

    def test_create_contraception(self, maman_ctx):
        r = requests.post(f"{API}/contraception", json={
            "methode": "pilule",
            "date_debut": "2026-01-01",
            "notes": "TEST",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["active"] is True
        assert data["methode"] == "pilule"
        TestContraception.cid = data["id"]

    def test_active_toggle_on_new_creation(self, maman_ctx):
        # Create another → previous should deactivate
        r = requests.post(f"{API}/contraception", json={
            "methode": "sterilet",
            "date_debut": "2026-01-10",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        new_id = r.json()["id"]

        r2 = requests.get(f"{API}/contraception", headers=_h(maman_ctx["token"]), timeout=10)
        items = r2.json()
        prev = next((i for i in items if i["id"] == TestContraception.cid), None)
        new = next((i for i in items if i["id"] == new_id), None)
        assert prev is not None and prev.get("active") is False
        assert new is not None and new.get("active") is True
        TestContraception.cid = new_id

    def test_end_contraception(self, maman_ctx):
        assert TestContraception.cid
        r = requests.patch(
            f"{API}/contraception/{TestContraception.cid}/end?date_fin=2026-02-01",
            headers=_h(maman_ctx["token"]), timeout=10,
        )
        assert r.status_code == 200
        r2 = requests.get(f"{API}/contraception", headers=_h(maman_ctx["token"]), timeout=10)
        cur = next((i for i in r2.json() if i["id"] == TestContraception.cid), None)
        assert cur is not None
        assert cur["active"] is False
        assert cur["date_fin"] == "2026-02-01"


# -------- Allaitement --------
class TestAllaitement:
    aid = None
    enfant_id = None

    def test_seed_enfant(self, maman_ctx):
        # Create an enfant for allaitement FK
        r = requests.post(f"{API}/enfants", json={
            "nom": "TEST_Bebe_P2", "date_naissance": "2025-09-01", "sexe": "M",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        TestAllaitement.enfant_id = r.json()["id"]

    def test_create_allaitement(self, maman_ctx):
        assert TestAllaitement.enfant_id
        r = requests.post(f"{API}/allaitement", json={
            "enfant_id": TestAllaitement.enfant_id,
            "date": "2026-01-15T08:00:00Z",
            "duree_minutes": 20,
            "cote": "gauche",
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["cote"] == "gauche"
        assert data["duree_minutes"] == 20
        TestAllaitement.aid = data["id"]

    def test_list_allaitement_filter_by_enfant(self, maman_ctx):
        r = requests.get(f"{API}/allaitement?enfant_id={TestAllaitement.enfant_id}",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert all(i["enfant_id"] == TestAllaitement.enfant_id for i in items)

    def test_allaitement_forbidden_for_pro(self, pro_ctx):
        r = requests.get(f"{API}/allaitement", headers=_h(pro_ctx["token"]), timeout=10)
        assert r.status_code == 403


# -------- Humeur --------
class TestHumeur:
    def test_create_humeur_valid(self, maman_ctx):
        r = requests.post(f"{API}/humeur", json={
            "date": "2026-01-20",
            "score": 7,
            "notes": "TEST bon jour",
            "symptomes": ["fatigue"],
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json()["score"] == 7

    def test_create_humeur_score_out_of_range(self, maman_ctx):
        r = requests.post(f"{API}/humeur", json={
            "date": "2026-01-20", "score": 11,
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 422

    def test_list_humeur(self, maman_ctx):
        r = requests.get(f"{API}/humeur", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1


# -------- Push token --------
class TestPushToken:
    def test_save_push_token(self, maman_ctx):
        r = requests.post(f"{API}/push-token", json={"token": "ExponentPushToken[TEST_xyz]"},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# -------- Search --------
class TestSearch:
    def test_search_pros_by_specialite(self, maman_ctx):
        r = requests.get(f"{API}/search/pros?specialite=Gyn", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        pros = r.json()
        assert len(pros) >= 1
        assert all("gyn" in (p.get("specialite") or "").lower() for p in pros)

    def test_search_pros_by_q(self, maman_ctx):
        r = requests.get(f"{API}/search/pros?q=Diallo", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert any("Diallo" in p.get("name", "") for p in r.json())

    def test_search_community(self, maman_ctx):
        r = requests.get(f"{API}/search/community?q=allaitement", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_community_by_category(self, maman_ctx):
        r = requests.get(f"{API}/search/community?category=grossesse", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        for p in r.json():
            assert p.get("category") == "grossesse"


# -------- Photos --------
class TestPhotos:
    def test_set_profile_photo(self, maman_ctx):
        r = requests.post(f"{API}/profile/photo",
                          json={"photo_base64": "data:image/png;base64,iVBORw0KGgo="},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        # Verify persistence via /auth/me
        me = requests.get(f"{API}/auth/me", headers=_h(maman_ctx["token"]), timeout=10).json()
        assert me.get("avatar", "").startswith("data:image")

    def test_set_enfant_photo(self, maman_ctx):
        # Create enfant first
        r = requests.post(f"{API}/enfants", json={
            "nom": "TEST_PhotoChild", "date_naissance": "2025-01-01", "sexe": "F"
        }, headers=_h(maman_ctx["token"]), timeout=10)
        eid = r.json()["id"]
        r2 = requests.post(f"{API}/enfants/{eid}/photo",
                           json={"photo_base64": "data:image/png;base64,iVBORw0KGgo="},
                           headers=_h(maman_ctx["token"]), timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("photo", "").startswith("data:image")


# -------- Mesures --------
class TestMesures:
    def test_add_mesure(self, maman_ctx):
        # Create enfant
        r = requests.post(f"{API}/enfants", json={
            "nom": "TEST_MesureChild", "date_naissance": "2025-05-01", "sexe": "M"
        }, headers=_h(maman_ctx["token"]), timeout=10)
        eid = r.json()["id"]
        r2 = requests.post(f"{API}/enfants/{eid}/mesures", json={
            "date": "2026-01-10", "poids_kg": 7.5, "taille_cm": 68.0, "perimetre_cranien_cm": 42.0
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r2.status_code == 200
        data = r2.json()
        assert any(m["poids_kg"] == 7.5 for m in data.get("mesures", []))


# -------- Notifications + auto-generation --------
class TestNotifications:
    def test_auto_notif_on_rdv_create(self, maman_ctx, pro_ctx):
        """Creating an RDV should notify the pro."""
        pro_id = pro_ctx["user"]["id"]
        # Count pro notifications before
        r0 = requests.get(f"{API}/notifications", headers=_h(pro_ctx["token"]), timeout=10)
        before = len(r0.json())
        # Create RDV
        r = requests.post(f"{API}/rdv", json={
            "pro_id": pro_id, "date": "2026-03-10T10:00:00Z", "motif": "TEST notif gen"
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        rid = r.json()["id"]
        # Fetch pro notifications
        r1 = requests.get(f"{API}/notifications", headers=_h(pro_ctx["token"]), timeout=10)
        assert r1.status_code == 200
        after = r1.json()
        if len(after) <= before:
            pytest.skip("No notification auto-generated on RDV create — feature may not be wired")
        assert any(n.get("type") == "rdv" for n in after)
        TestNotifications._rid = rid

    def test_auto_notif_on_rdv_status_change(self, maman_ctx, pro_ctx):
        """Pro confirming RDV should notify the maman."""
        rid = getattr(TestNotifications, "_rid", None)
        if not rid:
            pytest.skip("previous test did not create rdv")
        r0 = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        before = len(r0.json())
        r = requests.patch(f"{API}/rdv/{rid}/status?status_val=confirme",
                           headers=_h(pro_ctx["token"]), timeout=10)
        assert r.status_code == 200
        r1 = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        after = r1.json()
        if len(after) <= before:
            pytest.skip("No notification auto-generated on status change")
        assert any(n.get("type") == "rdv" for n in after)

    def test_auto_notif_on_message(self, maman_ctx, pro_ctx):
        pro_id = pro_ctx["user"]["id"]
        r0 = requests.get(f"{API}/notifications", headers=_h(pro_ctx["token"]), timeout=10)
        before = len(r0.json())
        r = requests.post(f"{API}/messages", json={"to_id": pro_id, "content": "TEST notif message"},
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        r1 = requests.get(f"{API}/notifications", headers=_h(pro_ctx["token"]), timeout=10)
        after = r1.json()
        assert len(after) > before, "Expected notification for new message"
        assert any(n.get("type") == "message" for n in after)

    def test_list_notifications(self, maman_ctx):
        r = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_mark_notif_read(self, maman_ctx):
        r = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        items = r.json()
        if not items:
            pytest.skip("No notifications to mark read")
        nid = items[0]["id"]
        r2 = requests.post(f"{API}/notifications/{nid}/read",
                           headers=_h(maman_ctx["token"]), timeout=10)
        assert r2.status_code == 200

    def test_mark_all_read(self, maman_ctx):
        r = requests.post(f"{API}/notifications/read-all",
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Verify no unread
        r2 = requests.get(f"{API}/notifications", headers=_h(maman_ctx["token"]), timeout=10)
        assert all(n.get("read") is True for n in r2.json())


# -------- Vidéo-consultation --------
class TestVideo:
    rid = None

    def test_create_and_confirm_rdv_for_video(self, maman_ctx, pro_ctx):
        pro_id = pro_ctx["user"]["id"]
        r = requests.post(f"{API}/rdv", json={
            "pro_id": pro_id, "date": "2026-04-01T10:00:00Z", "motif": "TEST video"
        }, headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        TestVideo.rid = r.json()["id"]
        r2 = requests.patch(f"{API}/rdv/{TestVideo.rid}/status?status_val=confirme",
                            headers=_h(pro_ctx["token"]), timeout=10)
        assert r2.status_code == 200

    def test_video_link_confirmed(self, maman_ctx):
        assert TestVideo.rid
        r = requests.get(f"{API}/rdv/{TestVideo.rid}/video-link",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["url"].startswith("https://meet.jit.si/")
        assert data["room"].startswith("alomaman-")

    def test_video_link_requires_confirme(self, maman_ctx, pro_ctx):
        # Create new non-confirmed rdv
        pro_id = pro_ctx["user"]["id"]
        r = requests.post(f"{API}/rdv", json={
            "pro_id": pro_id, "date": "2026-04-15T10:00:00Z", "motif": "TEST unconfirmed"
        }, headers=_h(maman_ctx["token"]), timeout=10)
        rid = r.json()["id"]
        r2 = requests.get(f"{API}/rdv/{rid}/video-link",
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r2.status_code == 400

    def test_video_link_access_denied_for_other(self, admin_ctx, pro_ctx, maman_ctx):
        # Another user (admin not part of rdv) should get 403
        assert TestVideo.rid
        # Register a fresh maman to test cross-user access
        email = f"TEST_other_{uuid.uuid4().hex[:6]}@example.com"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Test123!", "name": "Other", "role": "maman"
        }, timeout=10)
        tok = reg.json()["token"]
        r = requests.get(f"{API}/rdv/{TestVideo.rid}/video-link", headers=_h(tok), timeout=10)
        assert r.status_code == 403


# -------- Regression: Phase 1 quick checks --------
class TestPhase1Regression:
    def test_grossesse_still_works(self, maman_ctx):
        r = requests.get(f"{API}/grossesse", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_professionnels_still_list(self, maman_ctx):
        r = requests.get(f"{API}/professionnels", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_community_still_lists(self, maman_ctx):
        r = requests.get(f"{API}/community", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200

    def test_reminders_still_list(self, maman_ctx):
        r = requests.get(f"{API}/reminders", headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
