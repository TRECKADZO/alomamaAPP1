"""
Tests pytest pour le socle d'interopérabilité santé publique À lo Maman :
- SNOMED CT (codification clinique)
- DHIS2 (export données agrégées)
- Hub interop générique (SIH, DPI, Santé CIV, OpenELIS, mSupply, PACS)

Objectif : tout doit être testable & prêt à recevoir les vraies clés API du MSP CI.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://cycle-tracker-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed ({creds['email']}): {r.status_code} {r.text}"
    return r.json()


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_ctx():
    return _login(SUPER_ADMIN)


@pytest.fixture(scope="module")
def maman_ctx():
    return _login(MAMAN)


# =================================================================
# SNOMED CT
# =================================================================
class TestSnomed:
    def test_meta_public_no_auth(self):
        # /snomed/meta est public
        r = requests.get(f"{API}/snomed/meta", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "meta" in data
        assert "domains" in data
        assert "concept_count" in data
        assert data["concept_count"] == 240, f"Attendu 240 concepts, reçu {data['concept_count']}"
        assert len(data["domains"]) == 8, f"Attendu 8 domaines, reçu {len(data['domains'])}"

    def test_search_fievre(self, maman_ctx):
        r = requests.get(f"{API}/snomed/search", params={"q": "fievre"},
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] > 0
        displays = [x["display"] for x in data["results"]]
        # Doit contenir Fièvre + variantes
        assert any("Fièvre" in d for d in displays), f"Displays: {displays}"

    def test_search_eclampsie_returns_code(self, maman_ctx):
        r = requests.get(f"{API}/snomed/search", params={"q": "eclampsie"},
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        codes = [x["code"] for x in r.json()["results"]]
        assert "15938005" in codes, f"Code 15938005 (Éclampsie) absent : {codes}"

    def test_search_bcg_vaccination_domain(self, maman_ctx):
        r = requests.get(f"{API}/snomed/search",
                         params={"q": "BCG", "domain": "vaccination"},
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] > 0
        for res in data["results"]:
            assert res["domain"] == "vaccination", f"Résultat hors domaine : {res}"

    def test_concept_detail_fievre(self, maman_ctx):
        r = requests.get(f"{API}/snomed/concept/386661006",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["code"] == "386661006"
        assert "Fièvre" in data["display"] or "Fièvre" in data.get("display_en", "")

    def test_concept_unknown_404(self, maman_ctx):
        r = requests.get(f"{API}/snomed/concept/999999999999",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 404

    def test_attach_missing_entity_returns_404(self, maman_ctx):
        payload = {
            "entity_type": "dmp_consultation",
            "entity_id": "TEST_NONEXISTENT_ID_ZZZ",
            "codes": [{"system": "http://snomed.info/sct", "code": "386661006",
                       "display": "Fièvre", "domain": "symptom"}],
        }
        r = requests.post(f"{API}/snomed/attach", json=payload,
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 404, f"Attendu 404, reçu {r.status_code} {r.text}"


# =================================================================
# DHIS2
# =================================================================
class TestDhis2:
    def test_indicators_list(self, admin_ctx):
        r = requests.get(f"{API}/dhis2/indicators",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 15
        assert len(data["indicators"]) == 15
        uids = [i["uid"] for i in data["indicators"]]
        # Sanity : CPN 1, naissances, EPDS, TND, BCG doivent être présents
        assert "ALM0CPN1000" in uids
        assert "ALMNAISSDEC" in uids
        assert "ALMEPDSHIGH" in uids
        assert "ALMTNDPOSIT" in uids
        assert "ALMVACBCG00" in uids

    def test_indicators_forbidden_for_maman(self, maman_ctx):
        r = requests.get(f"{API}/dhis2/indicators",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_preview_monthly(self, admin_ctx):
        payload = {"period_type": "monthly", "year": 2026, "num": 7}
        r = requests.post(f"{API}/dhis2/preview", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["period"] == "202607"
        assert data["total_indicators"] == 15
        assert len(data["rows"]) == 15
        for row in data["rows"]:
            assert "uid" in row and "value" in row
            assert isinstance(row["value"], int)

    def test_export_dxf2(self, admin_ctx):
        payload = {"period_type": "monthly", "year": 2026, "num": 7}
        r = requests.post(f"{API}/dhis2/export/dxf2", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Format DXF2 : dataSet, period, orgUnit, dataValues[]
        assert "dataSet" in data
        assert data["period"] == "202607"
        assert "orgUnit" in data
        assert "dataValues" in data
        assert len(data["dataValues"]) == 15
        for dv in data["dataValues"]:
            assert "dataElement" in dv
            assert "value" in dv
            assert isinstance(dv["value"], str)  # DHIS2 impose string

    def test_export_csv(self, admin_ctx):
        payload = {"period_type": "monthly", "year": 2026, "num": 7}
        r = requests.post(f"{API}/dhis2/export/csv", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["row_count"] == 15
        lines = data["csv"].split("\n")
        assert lines[0] == "dataelement,period,orgunit,value,comment"
        assert len(lines) == 16  # 1 header + 15 data

    def test_dhis2_config_maman_forbidden(self, maman_ctx):
        r = requests.post(f"{API}/dhis2/config",
                          json={"base_url": "https://dhis2.fake.ci", "api_token": "TEST"},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_dhis2_config_save_super_admin(self, admin_ctx):
        payload = {
            "base_url": "https://dhis2.fake.msp.ci",
            "api_token": "TEST_FAKE_TOKEN_ABC123",
            "org_unit_uid": "TEST_CI_ORGUNIT",
            "dataset_uid": "ALM0DATASET",
        }
        r = requests.post(f"{API}/dhis2/config", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_dhis2_config_get_hides_credentials(self, admin_ctx):
        r = requests.get(f"{API}/dhis2/config",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("configured") is True
        assert "base_url" in data
        assert "password" not in data  # jamais le password en clair
        assert "api_token" not in data  # jamais le token en clair
        # doit contenir has_password / has_token comme boolean
        assert "has_token" in data
        assert data["has_token"] is True

    def test_dhis2_history(self, admin_ctx):
        r = requests.get(f"{API}/dhis2/history",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        # Doit contenir au moins nos exports précédents (dxf2, csv)
        assert data["count"] >= 2


# =================================================================
# Hub Interop générique
# =================================================================
class TestInterop:
    EXPECTED_SYSTEMS = ["sih_national", "dpi_national", "sante_civ", "openelis", "msupply", "pacs"]

    def test_list_systems(self, admin_ctx):
        r = requests.get(f"{API}/interop/systems",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 6, f"Attendu 6 systèmes, reçu {data['count']}"
        ids = [s["id"] for s in data["systems"]]
        for expected in self.EXPECTED_SYSTEMS:
            assert expected in ids, f"Système manquant : {expected}"

    def test_list_systems_maman_forbidden(self, maman_ctx):
        r = requests.get(f"{API}/interop/systems",
                         headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_save_config_valid_system(self, admin_ctx):
        payload = {
            "system_id": "sih_national",
            "base_url": "https://sih.fake.msp.ci",
            "username": "TEST_USER",
            "password": "TEST_PWD_FAKE_123",
            "extra": {"facility_id": "TEST_FAC_01"},
        }
        r = requests.post(f"{API}/interop/config", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_save_config_invalid_system(self, admin_ctx):
        payload = {
            "system_id": "unknown_system_xyz",
            "base_url": "https://fake.example.com",
        }
        r = requests.post(f"{API}/interop/config", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 400, f"Attendu 400, reçu {r.status_code}"

    def test_get_config_hides_credentials(self, admin_ctx):
        r = requests.get(f"{API}/interop/config/sih_national",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("configured") is True
        assert data.get("base_url") == "https://sih.fake.msp.ci"
        assert data.get("has_password") is True
        # jamais le password en clair
        assert "password" not in data
        assert "password_enc" not in data

    def test_config_maman_forbidden(self, maman_ctx):
        r = requests.post(f"{API}/interop/config",
                          json={"system_id": "sih_national", "base_url": "https://x.y"},
                          headers=_h(maman_ctx["token"]), timeout=10)
        assert r.status_code == 403

    def test_connection_test_fake_url_no_crash(self, admin_ctx):
        # URL fictive : doit échouer proprement sans crash
        r = requests.post(f"{API}/interop/test/sih_national",
                          headers=_h(admin_ctx["token"]), timeout=30)
        assert r.status_code == 200, f"Ne doit pas crasher, reçu {r.status_code} : {r.text}"
        data = r.json()
        assert "http_status" in data
        assert "target" in data
        # URL fictive => status <400 impossible => ok=False
        assert data["ok"] is False
        # http_status doit être soit 0 (erreur réseau), soit un code d'erreur HTTP >=400
        assert data["http_status"] == 0 or data["http_status"] >= 400 or data["http_status"] == -1

    def test_get_config_unknown_returns_configured_false(self, admin_ctx):
        r = requests.get(f"{API}/interop/config/pacs",
                         headers=_h(admin_ctx["token"]), timeout=10)
        assert r.status_code == 200
        # pacs n'a jamais été configuré
        assert r.json().get("configured") is False
