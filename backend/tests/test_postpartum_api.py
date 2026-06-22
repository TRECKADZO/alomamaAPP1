"""
Backend tests for Postpartum 'Moi Aussi' module.
Tests setup, dashboard, check-ins (EPDS alerts), fiches, testimonials (CRUD + moderation),
conjoint checklist/messages, and AES-256 encryption of free_text_enc in DB.
"""
import os
import pytest
import requests
import time

def _load_base_url() -> str:
    u = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not u:
        # Read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
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
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PASS = "474Treckadzo$1986"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def maman_headers():
    tok = _login(MAMAN_EMAIL, MAMAN_PASS)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN_EMAIL, ADMIN_PASS)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def stranger_maman_headers():
    """Register a fresh maman to test 401/403 and setup flow."""
    import uuid
    email = f"TEST_pp_{uuid.uuid4().hex[:8]}@alomaman.dev"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Test1234!", "name": "TEST_PP_Maman", "role": "maman",
        "phone": f"+225070{uuid.uuid4().hex[:7]}",
        "cgu_accepted": True, "consent_data": True,
        "accepte_cgu": True, "accepte_politique_confidentialite": True, "accepte_donnees_sante": True,
    }, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or _login(email, "Test1234!")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "_email": email}


# ----------- Dashboard / Setup -----------
class TestPostpartumDashboard:
    def test_dashboard_existing(self, maman_headers):
        r = requests.get(f"{API}/postpartum/dashboard", headers=maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("postpartum_id", "week_pp", "label", "current_fiche", "phone_samu"):
            assert k in d, f"missing {k}"
        assert d["phone_samu"] == "185"
        assert isinstance(d["week_pp"], int) and d["week_pp"] >= 0
        assert "week" in d["current_fiche"]

    def test_dashboard_404_for_new_user(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        r = requests.get(f"{API}/postpartum/dashboard", headers=hdr, timeout=15)
        assert r.status_code == 404, r.text

    def test_setup_creates_postpartum(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        r = requests.post(f"{API}/postpartum/setup", headers=hdr, json={
            "accouchement_date": "2025-11-01T00:00:00Z",
            "voie_accouchement": "voie_basse",
            "allaitement": "maternel",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["voie_accouchement"] == "voie_basse"
        assert d["active"] is True
        assert "id" in d
        assert "_id" not in d

        # Verify dashboard now returns 200
        r2 = requests.get(f"{API}/postpartum/dashboard", headers=hdr, timeout=15)
        assert r2.status_code == 200, r2.text


# ----------- Check-ins / EPDS alerts -----------
class TestPostpartumCheckins:
    def test_checkin_critical_alerts(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        # Use stranger account which is now set up
        payload = {
            "mood": 1,
            "physical_symptoms": ["fièvre", "saignements abondants"],
            "mental_symptoms": ["pensées sombres"],
            "free_text": "TEST_pp je n'ai plus envie de rien continuer",
            "consent_partage_pro": False,
        }
        r = requests.post(f"{API}/postpartum/checkin", headers=hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["mood"] == 1
        alerts = d.get("alerts", [])
        critical = [a for a in alerts if a.get("level") == "critical"]
        assert len(critical) >= 3, f"expected >=3 critical alerts, got {len(critical)}: {alerts}"
        titles = " ".join(a["title"] for a in critical).lower()
        assert "saignements" in titles
        assert "fièvre" in titles or "fievre" in titles
        # SAMU phone for danger words
        assert any(a.get("samu_call") == "185" for a in critical)

    def test_checkin_normal_mood_no_critical(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        r = requests.post(f"{API}/postpartum/checkin", headers=hdr, json={
            "mood": 4, "physical_symptoms": [], "mental_symptoms": [], "free_text": "TEST_pp ça va plutôt bien aujourd'hui",
        }, timeout=15)
        assert r.status_code == 200, r.text
        alerts = r.json().get("alerts", [])
        critical = [a for a in alerts if a.get("level") == "critical"]
        assert len(critical) == 0, f"unexpected critical alerts: {critical}"

    def test_checkin_persists_and_list_mood_series(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        r = requests.get(f"{API}/postpartum/checkins", headers=hdr, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] >= 2
        assert isinstance(d["mood_series"], list)
        assert all("mood" in p and "week" in p for p in d["mood_series"])
        # Verify free_text was decrypted back to plaintext for the list
        items = d["items"]
        any_text = [it for it in items if it.get("free_text") and "TEST_pp" in it["free_text"]]
        assert len(any_text) >= 2, "free_text not decrypted back in list response"
        # Verify free_text_enc not exposed
        for it in items:
            assert "free_text_enc" not in it
            assert "voice_url_enc" not in it

    def test_delete_checkin(self, stranger_maman_headers):
        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        # Create new for deletion
        r = requests.post(f"{API}/postpartum/checkin", headers=hdr, json={
            "mood": 3, "physical_symptoms": [], "mental_symptoms": [], "free_text": "TEST_pp delete me",
        }, timeout=15)
        cid = r.json()["id"]
        r2 = requests.delete(f"{API}/postpartum/checkin/{cid}", headers=hdr, timeout=15)
        assert r2.status_code == 200, r2.text
        # 404 on second delete
        r3 = requests.delete(f"{API}/postpartum/checkin/{cid}", headers=hdr, timeout=15)
        assert r3.status_code == 404


# ----------- Fiches éducatives -----------
class TestPostpartumFiches:
    def test_list_all_fiches(self, maman_headers):
        # GET /fiches is public per code (no Depends)
        r = requests.get(f"{API}/postpartum/fiches", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 8, f"expected >=8 weekly fiches, got {len(items)}"
        for it in items:
            assert "week" in it

    def test_fiche_by_week(self, maman_headers):
        r = requests.get(f"{API}/postpartum/fiche/4", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "week" in d

    def test_fiche_huge_week_returns_last(self, maman_headers):
        r = requests.get(f"{API}/postpartum/fiche/9999", timeout=15)
        assert r.status_code == 200


# ----------- Témoignages anonymes -----------
class TestPostpartumTestimonials:
    _created_id = None

    def test_submit_testimonial_min_length(self, maman_headers):
        r = requests.post(f"{API}/postpartum/testimonials", headers=maman_headers, json={
            "content": "too short", "topic": "general",
        }, timeout=15)
        assert r.status_code == 400

    def test_submit_and_moderate(self, maman_headers, admin_headers):
        content = "TEST_pp_testimonial — un texte assez long pour passer la validation des 30 caractères et plus."
        r = requests.post(f"{API}/postpartum/testimonials", headers=maman_headers, json={
            "content": content, "topic": "baby_blues", "week_pp": 4,
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending_moderation"
        TestPostpartumTestimonials._created_id = d["id"]

        # Admin approve
        r2 = requests.post(f"{API}/admin/postpartum/testimonials/{d['id']}/approve",
                           headers=admin_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("approved") is True

        # List shows it now
        r3 = requests.get(f"{API}/postpartum/testimonials?topic=baby_blues", headers=maman_headers, timeout=15)
        assert r3.status_code == 200
        items = r3.json()
        assert any(it.get("id") == d["id"] for it in items)
        # user_id_hash anonymized
        for it in items:
            assert "user_id_hash" not in it

    def test_like_testimonial(self, maman_headers):
        tid = TestPostpartumTestimonials._created_id
        assert tid, "previous test must have created an approved testimonial"
        r = requests.post(f"{API}/postpartum/testimonials/{tid}/like", headers=maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("liked") is True

    def test_like_unknown_returns_404(self, maman_headers):
        r = requests.post(f"{API}/postpartum/testimonials/__nope__/like", headers=maman_headers, timeout=15)
        assert r.status_code == 404

    def test_admin_pending_list(self, admin_headers):
        r = requests.get(f"{API}/admin/postpartum/testimonials/pending", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ----------- Conjoint -----------
class TestPostpartumConjoint:
    def test_checklist_9_items(self, maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/checklist", headers=maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 9
        assert all("id" in it and "label" in it for it in items)

    def test_messages_list(self, maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/messages", headers=maman_headers, timeout=15)
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) >= 5
        assert all("week" in m and "message" in m for m in msgs)

    def test_current_message(self, maman_headers):
        r = requests.get(f"{API}/postpartum/conjoint/current-message", headers=maman_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "week_pp" in d and "message_to_partner" in d and "message_week" in d


# ----------- Role guards -----------
class TestPostpartumRoleGuards:
    def test_unauthenticated_blocked(self):
        r = requests.get(f"{API}/postpartum/dashboard", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_cannot_setup(self, admin_headers):
        r = requests.post(f"{API}/postpartum/setup", headers=admin_headers, json={
            "accouchement_date": "2025-11-01T00:00:00Z", "voie_accouchement": "voie_basse",
        }, timeout=15)
        assert r.status_code == 403


# ----------- Chiffrement at rest -----------
class TestPostpartumEncryption:
    def test_free_text_encrypted_in_db(self, stranger_maman_headers):
        """Check that the stored doc in DB has free_text_enc with enc_v1: prefix, not plaintext."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ["DB_NAME"]

        hdr = {k: v for k, v in stranger_maman_headers.items() if k != "_email"}
        # Get user id from /auth/me
        me = requests.get(f"{API}/auth/me", headers=hdr, timeout=15).json()
        uid = me["id"]

        async def check():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            docs = await db.postpartum_checkins.find({"user_id": uid}).to_list(20)
            client.close()
            return docs

        docs = asyncio.get_event_loop().run_until_complete(check())
        assert len(docs) >= 1, "no postpartum_checkins in DB for stranger maman"
        # Find one that has free_text_enc set
        encs = [d.get("free_text_enc") for d in docs if d.get("free_text_enc")]
        assert encs, "no free_text_enc present in any check-in"
        for enc in encs:
            assert isinstance(enc, str) and enc.startswith("enc_v1:"), f"free_text_enc not encrypted: {enc[:40]}"
        # Ensure no doc has a plaintext "free_text" field (the API returns it but doesn't store it)
        for d in docs:
            assert "free_text" not in d or d.get("free_text") in (None, ""), \
                f"plaintext free_text leaked into DB doc: {d.get('free_text')}"
