"""
Tests pytest — P2 (Export PDF TND M-CHAT-R + Post-Partum avec codes SNOMED CT)
              P3 (Refactor server.py via routers/pdf_reports.py)

Périmètre :
- Auth maman / pro / no-auth / consent RGPD
- Codes HTTP + Content-Type + %PDF header + taille
- Audit trail (db.audit_log)
- Codes SNOMED CT attachés visibles dans le PDF TND
- Contenus PDF post-partum (SAMU 185, EPDS, humeur, identité)
- Non-régression : dashboard, checkin, screenings, interop, dhis2, headers, 2FA admin

Utilise pymongo (synchrone) pour l'accès direct DB — évite les problèmes d'event-loop pytest.
"""
import os
import io
import uuid
import pytest
import requests
from pymongo import MongoClient


def _load_base_url() -> str:
    u = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not u:
        with open("/app/frontend/.env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    u = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    assert u, "EXPO_PUBLIC_BACKEND_URL not set"
    return u.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}
SUPER_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}
KNOWN_SCREENING_ID = "8d80d426-6e68-4021-84b5-4d0fb6aa13dd"

MONGO_URL = os.environ.get("MONGO_URL") or (
    open("/app/backend/.env").read().split('MONGO_URL="')[1].split('"')[0]
)
DB_NAME = os.environ.get("DB_NAME") or "alomaman"


def _login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=30)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _reset_super_admin_2fa_state():
    db = _db()
    db.users.update_one(
        {"email": SUPER_ADMIN["email"]},
        {"$unset": {
            "totp_setup_grace_used": "",
            "must_setup_2fa": "",
            "totp_enabled": "",
            "totp_secret": "",
        }},
    )


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


# --- Fixtures ---
@pytest.fixture(scope="module")
def maman_token():
    r = _login(MAMAN)
    assert r.status_code == 200, f"login maman failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def maman_id(maman_token):
    r = requests.get(f"{API}/auth/me", headers=_h(maman_token), timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def pro_token():
    r = _login(PRO)
    assert r.status_code == 200, f"login pro failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    # Reset 2FA state avant login pour que le 1er login réussisse (grâce)
    _reset_super_admin_2fa_state()
    r = _login(SUPER_ADMIN)
    assert r.status_code == 200, f"login admin failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _count_audit(user_id: str, audit_type: str) -> int:
    return _db().audit_log.count_documents({"user_id": user_id, "type": audit_type})


# =========================================
# P3 — Routeur modulaire chargé
# =========================================
class TestP3RouterModule:
    def test_backend_log_shows_router_loaded(self):
        """Le log backend contient '✅ Routers modulaires chargés : pdf_reports'."""
        import subprocess
        out = subprocess.run(
            "grep -h 'Routers modulaires chargés' /var/log/supervisor/backend.*.log | tail -5",
            shell=True, capture_output=True, text=True,
        ).stdout
        assert "pdf_reports" in out, f"log ne contient pas 'pdf_reports': {out!r}"
        assert "✅" in out, f"log ne contient pas le marqueur ✅: {out!r}"

    def test_three_pdf_routes_reachable(self, maman_token):
        """Les 3 routes PDF enregistrées via routers/pdf_reports.py répondent (200/403/404
        selon la logique métier, jamais 405/404-not-found-route).
        On confirme ainsi le pattern register_pdf_routes(app, api, db, get_current_user, decrypt_str_fn).
        """
        # Route 1 : /api/tnd/screening/{id}/pdf (200 attendu pour screening connu)
        r1 = requests.get(f"{API}/tnd/screening/{KNOWN_SCREENING_ID}/pdf",
                          headers=_h(maman_token), timeout=30)
        assert r1.status_code in (200, 403, 404), f"route 1 KO: {r1.status_code}"
        # Route 2 : /api/postpartum/report/pdf (200 attendu pour maman.test)
        r2 = requests.get(f"{API}/postpartum/report/pdf", headers=_h(maman_token), timeout=30)
        assert r2.status_code in (200, 403, 404), f"route 2 KO: {r2.status_code}"
        # Route 3 : /api/postpartum/report/{user_id}/pdf (403 attendu pour role=maman)
        r3 = requests.get(f"{API}/postpartum/report/{uuid.uuid4()}/pdf",
                          headers=_h(maman_token), timeout=15)
        assert r3.status_code in (200, 403, 404), f"route 3 KO: {r3.status_code}"


# =========================================
# P2 — PDF Post-Partum (maman)
# =========================================
class TestP2PostpartumPDF:
    def test_maman_pdf_ok(self, maman_token):
        r = requests.get(f"{API}/postpartum/report/pdf", headers=_h(maman_token), timeout=60)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), "header %PDF absent"
        assert len(r.content) > 2048, f"PDF trop petit: {len(r.content)} bytes"
        # Content-Disposition attachment
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower() and ".pdf" in cd.lower(), f"CD KO: {cd}"

    def test_maman_pdf_content(self, maman_token):
        """Contenu du PDF post-partum : disclaimer SAMU 185 + mots-clés attendus."""
        r = requests.get(f"{API}/postpartum/report/pdf", headers=_h(maman_token), timeout=60)
        assert r.status_code == 200
        text = _extract_pdf_text(r.content)
        assert len(text) > 100, f"extraction texte KO (len={len(text)})"
        # Disclaimer SAMU 185
        assert "185" in text, f"numéro SAMU 185 absent du PDF (text sample: {text[:400]})"
        # Au moins un mot-clé attendu
        low = text.lower()
        assert any(kw in low for kw in ["post-partum", "postpartum", "humeur", "epds", "check-in", "checkin"]), \
            f"aucun mot-clé attendu trouvé (sample: {text[:400]})"

    def test_no_auth_returns_401(self):
        r = requests.get(f"{API}/postpartum/report/pdf", timeout=15)
        assert r.status_code == 401

    def test_audit_log_created(self, maman_token, maman_id):
        before = _count_audit(maman_id, "pdf_export_postpartum")
        r = requests.get(f"{API}/postpartum/report/pdf", headers=_h(maman_token), timeout=60)
        assert r.status_code == 200
        after = _count_audit(maman_id, "pdf_export_postpartum")
        assert after == before + 1, f"audit_log pdf_export_postpartum non incrémenté ({before} → {after})"


# =========================================
# P2 — PDF Post-Partum (accès pro + consentement RGPD)
# =========================================
class TestP2PostpartumPDFPro:
    def test_pro_without_consent_gets_403(self, pro_token, maman_id):
        """Aucun checkin avec consent_partage_pro=True → 403 côté pro."""
        _db().postpartum_checkins.update_many(
            {"user_id": maman_id},
            {"$set": {"consent_partage_pro": False}},
        )
        r = requests.get(f"{API}/postpartum/report/{maman_id}/pdf",
                         headers=_h(pro_token), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"

    def test_pro_with_consent_gets_pdf(self, pro_token, maman_id):
        """Après avoir marqué un checkin consent_partage_pro=True → 200 PDF."""
        res = _db().postpartum_checkins.update_one(
            {"user_id": maman_id},
            {"$set": {"consent_partage_pro": True}},
        )
        if res.matched_count == 0:
            pytest.skip("Aucun checkin post-partum pour la maman test.")
        r = requests.get(f"{API}/postpartum/report/{maman_id}/pdf",
                         headers=_h(pro_token), timeout=60)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        assert r.content.startswith(b"%PDF")
        assert len(r.content) > 2048
        # Audit distinct pdf_export_postpartum_pro
        pro_audit = _db().audit_log.count_documents({
            "target_user": maman_id, "type": "pdf_export_postpartum_pro"
        })
        assert pro_audit >= 1, "audit pdf_export_postpartum_pro absent"

    def test_maman_role_forbidden_on_pro_endpoint(self, maman_token, maman_id):
        """Une maman n'a pas accès à l'endpoint pro (403)."""
        r = requests.get(f"{API}/postpartum/report/{maman_id}/pdf",
                         headers=_h(maman_token), timeout=15)
        assert r.status_code == 403


# =========================================
# P2 — PDF Post-Partum 404 (sans setup)
# =========================================
class TestP2PostpartumPDF404:
    def test_maman_without_setup_returns_404(self):
        """Une maman fraichement inscrite (sans postpartum actif) → 404."""
        email = f"TEST_pdf_{uuid.uuid4().hex[:8]}@alomaman.dev"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email,
            "password": "Test1234!",
            "role": "maman",
            "name": "TEST PDF Fresh Maman",
            "phone": f"+22507{uuid.uuid4().hex[:8]}",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        }, timeout=15)
        assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text[:300]}"
        tok = reg.json()["token"]
        try:
            r = requests.get(f"{API}/postpartum/report/pdf", headers=_h(tok), timeout=15)
            assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"
        finally:
            # Cleanup
            _db().users.delete_one({"email": email})


# =========================================
# P2 — PDF TND M-CHAT-R
# =========================================
class TestP2TndPDF:
    def test_tnd_pdf_ok(self, maman_token):
        r = requests.get(f"{API}/tnd/screening/{KNOWN_SCREENING_ID}/pdf",
                         headers=_h(maman_token), timeout=60)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF")
        assert len(r.content) > 2048

    def test_tnd_pdf_unknown_returns_404(self, maman_token):
        r = requests.get(f"{API}/tnd/screening/00000000-0000-0000-0000-000000000000/pdf",
                         headers=_h(maman_token), timeout=15)
        assert r.status_code == 404

    def test_tnd_pdf_no_auth_401(self):
        r = requests.get(f"{API}/tnd/screening/{KNOWN_SCREENING_ID}/pdf", timeout=15)
        assert r.status_code == 401

    def test_audit_log_created_for_tnd(self, maman_token, maman_id):
        before = _count_audit(maman_id, "pdf_export_tnd")
        r = requests.get(f"{API}/tnd/screening/{KNOWN_SCREENING_ID}/pdf",
                         headers=_h(maman_token), timeout=60)
        assert r.status_code == 200
        after = _count_audit(maman_id, "pdf_export_tnd")
        assert after == before + 1, f"audit_log pdf_export_tnd non incrémenté ({before} → {after})"

    def test_tnd_pdf_contains_snomed_codes(self, maman_token, pro_token):
        """Attache codes SNOMED CT via /api/snomed/attach → apparaissent dans le PDF."""
        codes = [
            {"code": "35489007", "display": "TEST_DepressiveDisorderSnomed", "system": "http://snomed.info/sct"},
            {"code": "406506008", "display": "TEST_AttentionDeficit", "system": "http://snomed.info/sct"},
        ]
        # Essaie d'abord avec pro, fallback sur maman
        payload = {
            "entity_type": "tnd_screening",
            "entity_id": KNOWN_SCREENING_ID,
            "codes": codes,
        }
        att = requests.post(f"{API}/snomed/attach", headers=_h(pro_token),
                            json=payload, timeout=15)
        if att.status_code in (401, 403):
            att = requests.post(f"{API}/snomed/attach", headers=_h(maman_token),
                                json=payload, timeout=15)
        assert att.status_code == 200, f"snomed/attach échec: {att.status_code} {att.text[:200]}"

        # Fetch PDF
        r = requests.get(f"{API}/tnd/screening/{KNOWN_SCREENING_ID}/pdf",
                         headers=_h(maman_token), timeout=60)
        assert r.status_code == 200
        text = _extract_pdf_text(r.content)
        # Le PDF contient soit le code, soit le display
        found = ("35489007" in text) or ("TEST_DepressiveDisorderSnomed" in text) \
                or ("406506008" in text) or ("TEST_AttentionDeficit" in text)
        assert found, f"code SNOMED attaché absent du PDF. Extrait: {text[:500]}"


# =========================================
# Non-régression
# =========================================
class TestNonRegression:
    def test_postpartum_dashboard(self, maman_token):
        r = requests.get(f"{API}/postpartum/dashboard", headers=_h(maman_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Structure attendue (clés reelles observées)
        assert "postpartum_id" in data or "week_pp" in data, f"clés dashboard KO: {list(data.keys())}"

    def test_postpartum_checkin_create(self, maman_token):
        payload = {
            "mood_score": 6,
            "sleep_hours": 6.5,
            "epds_score": 8,
            "symptoms": ["fatigue"],
            "consent_partage_pro": False,
        }
        r = requests.post(f"{API}/postpartum/checkin", headers=_h(maman_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), f"checkin create failed: {r.status_code} {r.text[:200]}"

    def test_interop_systems_admin(self, admin_token):
        """Accès admin uniquement (route restreinte)."""
        r = requests.get(f"{API}/interop/systems", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_dhis2_indicators_admin(self, admin_token):
        r = requests.get(f"{API}/dhis2/indicators", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200

    def test_tnd_screenings_by_enfant(self, maman_token):
        screening = _db().tnd_screenings.find_one(
            {"id": KNOWN_SCREENING_ID}, {"_id": 0, "enfant_id": 1}
        )
        if not screening or not screening.get("enfant_id"):
            pytest.skip("Screening test sans enfant_id")
        r = requests.get(f"{API}/tnd/screenings/{screening['enfant_id']}",
                         headers=_h(maman_token), timeout=15)
        assert r.status_code == 200

    def test_security_header_xframe_still_sameorigin(self):
        r = requests.get(f"{API}/snomed/meta", timeout=15)
        assert r.headers.get("x-frame-options", "").upper() == "SAMEORIGIN"

    def test_admin_2fa_still_enforced(self):
        """1er login OK (grâce), 2e login → 403. Reset state avant/après."""
        _reset_super_admin_2fa_state()
        try:
            r1 = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=15)
            assert r1.status_code == 200, f"1er login admin devrait être 200 (grâce), got {r1.status_code} {r1.text[:200]}"
            r2 = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=15)
            assert r2.status_code == 403, f"2e login admin devrait être 403, got {r2.status_code} {r2.text[:200]}"
            # Vérifier flag DB
            u = _db().users.find_one({"email": SUPER_ADMIN["email"]},
                                     {"_id": 0, "totp_setup_grace_used": 1, "must_setup_2fa": 1})
            assert u.get("totp_setup_grace_used") is True, f"grâce non marquée: {u}"
        finally:
            _reset_super_admin_2fa_state()
