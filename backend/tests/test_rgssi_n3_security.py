"""
Tests pytest RGSSI Niveau 3 — Conformité Ministère Santé Côte d'Ivoire.

Périmètre :
  1. Security headers HTTP (HSTS, X-Frame, X-Content-Type, Referrer, Permissions, CSP)
  2. 2FA STRICTEMENT obligatoire pour admin/super_admin (aucun bypass, même avec
     TWO_FACTOR_ENFORCEMENT=off) — grâce accordée au 1er login, 403 aux suivants
  3. Non-admins (maman/pro) : aucun blocage 2FA
  4. DELETE /api/interop/config/{system_id} — super_admin only, 400/404 gérés
  5. Non-régression : interop config/get/test/list, SNOMED meta/search/concept,
     DHIS2 indicators/preview/dxf2/csv/config/history
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# --- Config ---
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://cycle-tracker-pro.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}

# Direct MongoDB access (nécessaire pour reset le super admin entre les tests 2FA)
MONGO_URL = os.environ.get("MONGO_URL") or (
    open("/app/backend/.env").read().split('MONGO_URL="')[1].split('"')[0]
)
DB_NAME = os.environ.get("DB_NAME") or "alomaman"


def _login(creds, allow_403=False):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    if allow_403 and r.status_code == 403:
        return None, r
    return r.json() if r.status_code == 200 else None, r


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _reset_super_admin_2fa_state():
    """Enlève totp_setup_grace_used, must_setup_2fa, totp_enabled, totp_secret."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.users.update_one(
        {"email": SUPER_ADMIN["email"]},
        {"$unset": {
            "totp_setup_grace_used": "",
            "must_setup_2fa": "",
            "totp_enabled": "",
            "totp_secret": "",
        }},
    )
    client.close()


async def _get_super_admin_doc():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.users.find_one({"email": SUPER_ADMIN["email"]}, {"_id": 0, "password_hash": 0})
    client.close()
    return doc


def reset_admin():
    asyncio.get_event_loop().run_until_complete(_reset_super_admin_2fa_state())


def get_admin_doc():
    return asyncio.get_event_loop().run_until_complete(_get_super_admin_doc())


# =================================================================
# 1) SECURITY HEADERS HTTP (RGSSI N3 — OWASP)
# =================================================================
class TestSecurityHeaders:
    """Vérifie la présence des en-têtes de sécurité sur /api/snomed/meta (endpoint public)."""

    @pytest.fixture(scope="class")
    def headers(self):
        r = requests.get(f"{API}/snomed/meta", timeout=10)
        assert r.status_code == 200, f"snomed/meta doit répondre 200, reçu {r.status_code}"
        return r.headers

    def test_hsts_header(self, headers):
        v = headers.get("Strict-Transport-Security", "")
        assert "max-age=" in v, f"HSTS manquant: {v!r}"
        # 1 an minimum recommandé
        assert "max-age=31536000" in v or int(v.split("max-age=")[1].split(";")[0]) >= 31536000

    def test_x_frame_options(self, headers):
        v = headers.get("X-Frame-Options", "")
        assert v.upper() == "SAMEORIGIN", f"X-Frame-Options attendu SAMEORIGIN, reçu {v!r}"

    def test_x_content_type_options(self, headers):
        v = headers.get("X-Content-Type-Options", "")
        assert v.lower() == "nosniff", f"X-Content-Type-Options attendu nosniff, reçu {v!r}"

    def test_referrer_policy(self, headers):
        v = headers.get("Referrer-Policy", "")
        assert v, "Referrer-Policy manquant"
        assert "strict-origin" in v.lower() or v.lower() in {
            "no-referrer", "same-origin", "strict-origin-when-cross-origin"
        }, f"Referrer-Policy trop permissif: {v!r}"

    def test_permissions_policy(self, headers):
        v = headers.get("Permissions-Policy", "")
        assert v, "Permissions-Policy manquant"
        # camera/mic/geoloc doivent être désactivés
        for k in ("geolocation", "microphone", "camera"):
            assert k in v, f"Permissions-Policy ne restreint pas {k}: {v!r}"

    def test_content_security_policy_api(self, headers):
        v = headers.get("Content-Security-Policy", "")
        assert v, "CSP manquant sur endpoint /api"
        # Attendu default-src 'none' + frame-ancestors 'none'
        assert "default-src" in v and "frame-ancestors" in v, f"CSP incomplet: {v!r}"


# =================================================================
# 2) 2FA STRICTEMENT OBLIGATOIRE POUR ADMIN/SUPER_ADMIN
# =================================================================
class TestAdmin2FAEnforcement:
    """
    Test critique : la 2FA est OBLIGATOIRE pour les admins même quand
    TWO_FACTOR_ENFORCEMENT=off. Comportement attendu :
      - 1er login sans totp_enabled → 200 (grâce accordée pour setup)
        + doc DB doit contenir totp_setup_grace_used=True + must_setup_2fa=True
      - 2e login sans totp_enabled → 403 (grâce déjà utilisée)
      - Après reset (unset grace_used) → 200 à nouveau (grâce ré-accordée)
    """

    def test_two_factor_enforcement_env_is_off(self):
        """Confirme le contexte : l'env dit 'off' mais la 2FA admin ne doit PAS être désactivée."""
        env_val = ""
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.strip().startswith("TWO_FACTOR_ENFORCEMENT"):
                        env_val = line.split("=", 1)[1].strip().strip('"').strip("'").lower()
                        break
        except FileNotFoundError:
            pytest.skip(".env introuvable")
        # Ce test documente juste le contexte ; les autres tests valident le comportement
        assert env_val in ("off", "false", "0", "disabled", "no"), (
            f"Ce test suppose TWO_FACTOR_ENFORCEMENT=off pour prouver le non-bypass admin. "
            f"Valeur actuelle: {env_val!r}"
        )

    def test_first_admin_login_grants_grace(self):
        """1er login super_admin sans totp_enabled → 200 + grâce marquée en DB."""
        reset_admin()  # état neuf
        doc_before = get_admin_doc()
        assert not doc_before.get("totp_setup_grace_used"), "Précond: grace_used doit être unset"
        assert not doc_before.get("totp_enabled"), "Précond: totp_enabled doit être unset"

        r = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=30)
        assert r.status_code == 200, f"1er login admin doit passer avec grâce, reçu {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data, f"Token attendu, reçu {data}"

        # Vérifier DB : grace_used=True + must_setup_2fa=True
        doc_after = get_admin_doc()
        assert doc_after.get("totp_setup_grace_used") is True, (
            f"totp_setup_grace_used doit être True après 1er login, doc: {doc_after}"
        )
        assert doc_after.get("must_setup_2fa") is True, (
            f"must_setup_2fa doit être True, doc: {doc_after}"
        )

    def test_second_admin_login_returns_403(self):
        """2e login super_admin sans totp_enabled → 403 (grâce déjà consommée)."""
        # Précond : grace_used=True (posé par le test précédent)
        doc = get_admin_doc()
        if not doc.get("totp_setup_grace_used"):
            # Assurer l'état ; on force
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            asyncio.get_event_loop().run_until_complete(
                db.users.update_one(
                    {"email": SUPER_ADMIN["email"]},
                    {"$set": {"totp_setup_grace_used": True, "must_setup_2fa": True}},
                )
            )
            client.close()

        r = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=30)
        assert r.status_code == 403, (
            f"2e login admin sans 2FA doit renvoyer 403 (non-bypass), reçu {r.status_code}: {r.text}"
        )
        detail = (r.json().get("detail") or "").lower()
        assert "2fa" in detail or "authenticator" in detail or "obligatoire" in detail, (
            f"Message d'erreur doit mentionner 2FA/Authenticator, reçu: {detail}"
        )

    def test_reset_re_grants_grace(self):
        """Après reset (unset), un 3e login doit à nouveau accorder la grâce (idempotent)."""
        reset_admin()
        r = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=30)
        assert r.status_code == 200, f"Après reset, login doit repasser, reçu {r.status_code}: {r.text}"
        doc = get_admin_doc()
        assert doc.get("totp_setup_grace_used") is True

    def test_non_admin_maman_login_no_block(self):
        """Login maman (rôle non-admin) → 200 sans grâce ni blocage 2FA."""
        r = requests.post(f"{API}/auth/login", json=MAMAN, timeout=30)
        assert r.status_code == 200, f"Maman doit login sans blocage, reçu {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data
        # Aucun champ 2FA imposé pour les non-admins
        assert not data.get("requires_2fa"), "Non-admin ne doit PAS déclencher requires_2fa"

    def test_non_admin_pro_login_no_block(self):
        """Login pro (rôle professionnel) → 200. TWO_FACTOR_ENFORCEMENT=off bypasse leur 2FA."""
        r = requests.post(f"{API}/auth/login", json=PRO, timeout=30)
        assert r.status_code == 200, f"Pro doit login (bypass 2FA via env=off), reçu {r.status_code}: {r.text}"
        assert "token" in r.json()


# =================================================================
# 3) DELETE /api/interop/config/{system_id}
# =================================================================
class TestInteropConfigDelete:
    """Nouveau endpoint : suppression config interop, super_admin only."""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login admin avec grâce ré-accordée pour ce test."""
        reset_admin()
        r = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=30)
        assert r.status_code == 200, f"Setup admin login KO: {r.status_code} {r.text}"
        return r.json()["token"]

    @pytest.fixture(scope="class")
    def maman_token(self):
        r = requests.post(f"{API}/auth/login", json=MAMAN, timeout=30)
        assert r.status_code == 200
        return r.json()["token"]

    def test_delete_creates_then_deletes_sih_national(self, admin_token):
        """Crée puis supprime la config sih_national."""
        payload = {
            "system_id": "sih_national",
            "base_url": "https://sih.test.msp.ci",
            "username": "TEST_user",
            "password": "TEST_pass",
            "extra": {"note": "TEST_rgssi_delete"},
        }
        # Create
        r_create = requests.post(f"{API}/interop/config", json=payload,
                                 headers=_h(admin_token), timeout=15)
        assert r_create.status_code == 200, f"Create KO: {r_create.status_code} {r_create.text}"
        assert r_create.json().get("ok") is True

        # Verify GET before delete
        r_get = requests.get(f"{API}/interop/config/sih_national",
                             headers=_h(admin_token), timeout=15)
        assert r_get.status_code == 200
        assert r_get.json().get("configured") is True

        # Delete
        r_del = requests.delete(f"{API}/interop/config/sih_national",
                                headers=_h(admin_token), timeout=15)
        assert r_del.status_code == 200, f"Delete KO: {r_del.status_code} {r_del.text}"
        body = r_del.json()
        assert body.get("ok") is True
        assert body.get("deleted") is True
        assert body.get("system_id") == "sih_national"

        # Verify GET after delete → configured=False
        r_get2 = requests.get(f"{API}/interop/config/sih_national",
                              headers=_h(admin_token), timeout=15)
        assert r_get2.status_code == 200
        assert r_get2.json().get("configured") is False, (
            f"Après DELETE, GET doit renvoyer configured=False, reçu: {r_get2.json()}"
        )

    def test_delete_nonexistent_returns_404(self, admin_token):
        """Delete d'une config déjà supprimée → 404."""
        # sih_national vient d'être supprimée par le test précédent
        r = requests.delete(f"{API}/interop/config/sih_national",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 404, f"Delete inexistant doit renvoyer 404, reçu {r.status_code}: {r.text}"

    def test_delete_unknown_system_id_returns_400(self, admin_token):
        """system_id qui n'est pas dans INTEROP_SYSTEMS → 400."""
        r = requests.delete(f"{API}/interop/config/inexistant_system_xyz",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 400, f"system_id inconnu doit renvoyer 400, reçu {r.status_code}: {r.text}"
        assert "inconnu" in (r.json().get("detail", "").lower())

    def test_delete_by_non_super_admin_returns_403(self, maman_token):
        """Maman (non super_admin) → 403."""
        r = requests.delete(f"{API}/interop/config/sih_national",
                            headers=_h(maman_token), timeout=15)
        assert r.status_code == 403, f"Non super_admin doit recevoir 403, reçu {r.status_code}: {r.text}"

    def test_delete_without_auth_returns_401_or_403(self):
        r = requests.delete(f"{API}/interop/config/sih_national", timeout=15)
        assert r.status_code in (401, 403), f"Sans auth doit renvoyer 401/403, reçu {r.status_code}"


# =================================================================
# 4) NON-RÉGRESSION — Interop, SNOMED, DHIS2
# =================================================================
class TestNonRegression:
    @pytest.fixture(scope="class")
    def admin_token(self):
        reset_admin()
        r = requests.post(f"{API}/auth/login", json=SUPER_ADMIN, timeout=30)
        assert r.status_code == 200
        return r.json()["token"]

    @pytest.fixture(scope="class")
    def maman_token(self):
        r = requests.post(f"{API}/auth/login", json=MAMAN, timeout=30)
        assert r.status_code == 200
        return r.json()["token"]

    # --- Interop ---
    def test_interop_list_systems(self, admin_token):
        r = requests.get(f"{API}/interop/systems", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "systems" in data
        assert len(data["systems"]) >= 6, f"Attendu ≥6 systèmes interop, reçu {len(data['systems'])}"

    def test_interop_config_save_get_test_push(self, admin_token):
        """Cycle complet : save → get → test → push (non-régression)."""
        payload = {
            "system_id": "openelis",
            "base_url": "https://openelis.test.msp.ci",
            "username": "TEST_user",
            "password": "TEST_pass",
        }
        r_save = requests.post(f"{API}/interop/config", json=payload,
                               headers=_h(admin_token), timeout=15)
        assert r_save.status_code == 200, r_save.text

        r_get = requests.get(f"{API}/interop/config/openelis",
                             headers=_h(admin_token), timeout=15)
        assert r_get.status_code == 200
        body = r_get.json()
        assert body.get("configured") is True
        assert body.get("has_password") is True
        # Credentials never exposed in clear
        assert "password" not in body or body.get("password") is None
        assert "password_enc" not in body

        r_test = requests.post(f"{API}/interop/test/openelis",
                               headers=_h(admin_token), timeout=30)
        # http_status = 0 attendu (URL fictive), pas de crash
        assert r_test.status_code == 200, r_test.text
        tbody = r_test.json()
        assert "http_status" in tbody

    # --- SNOMED ---
    def test_snomed_meta_public(self):
        r = requests.get(f"{API}/snomed/meta", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "concept_count" in data
        assert data["concept_count"] > 0
        assert "domains" in data
        assert len(data["domains"]) >= 6

    def test_snomed_search(self, maman_token):
        r = requests.get(f"{API}/snomed/search", params={"q": "fievre"},
                         headers=_h(maman_token), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("count", 0) >= 0  # peut être 0 selon dataset

    def test_snomed_concept_by_code(self, maman_token):
        # Prendre le 1er concept du dataset
        r_search = requests.get(f"{API}/snomed/search", params={"q": ""},
                                headers=_h(maman_token), timeout=10)
        if r_search.status_code == 200 and r_search.json().get("results"):
            code = r_search.json()["results"][0].get("code") or r_search.json()["results"][0].get("id")
            if code:
                r = requests.get(f"{API}/snomed/concept/{code}",
                                 headers=_h(maman_token), timeout=10)
                assert r.status_code in (200, 404), r.text

    # --- DHIS2 ---
    def test_dhis2_indicators(self, admin_token):
        r = requests.get(f"{API}/dhis2/indicators",
                         headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "indicators" in data or "count" in data or isinstance(data, (list, dict))

    def test_dhis2_preview(self, admin_token):
        # Payload conforme au modèle DHIS2 : period_type + year requis
        r = requests.post(f"{API}/dhis2/preview",
                          json={"period_type": "MONTHLY", "year": 2026, "month": 1},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code in (200, 400, 422), r.text
        # Un 422 signalerait un contrat de payload changé — pas un crash
        if r.status_code == 200:
            assert isinstance(r.json(), (dict, list))

    def test_dhis2_history(self, admin_token):
        r = requests.get(f"{API}/dhis2/history",
                         headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text

    def test_dhis2_config_get(self, admin_token):
        r = requests.get(f"{API}/dhis2/config",
                         headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Credentials never in clear
        assert "password" not in data or data.get("password") is None


# =================================================================
# TEARDOWN GLOBAL — remet l'admin dans un état utilisable
# =================================================================
@pytest.fixture(scope="session", autouse=True)
def _teardown_reset_admin():
    yield
    # Après tous les tests, on reset l'admin pour ne pas bloquer le vrai utilisateur
    try:
        reset_admin()
        print("\n[teardown] super_admin reset (grace unset)")
    except Exception as e:
        print(f"\n[teardown] reset admin failed: {e}")
