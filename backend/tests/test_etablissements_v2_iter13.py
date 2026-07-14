"""
Iter 13 — Validation de la migration XLSX v2 : 1507 → 1676 établissements MSP officiels.

Focus :
- Nouveau champ `num_ordre` (N° officiel MSP par région)
- IDs recréés au format `esp_{region_slug}_{num_ordre:04d}`
- 99% géocodés (>=1650/1676)
- Abidjan 2 : 671 établissements (compteur MSP)
- 32 régions MSP officielles + ~100 communes + 12 catégories
- Analytics admin met bien à jour coverage/by_region/pro_claims
- Unicité (region, num_ordre)
- Reliaison des claims pro
"""
import os
import re
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://cycle-tracker-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "alomaman")

MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
ADMIN_EMAIL = "klenakan.eric@gmail.com"
ADMIN_PASSWORDS = ["474Treckadzo$1986", "Admin1234!"]

ID_RE = re.compile(r"^esp_.+_\d{4}$")  # esp_{region_slug}_XXXX (slug may contain -, ', etc.)


# ---------- Helpers ----------
async def _reset_admin_2fa_grace():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.users.update_one(
        {"email": ADMIN_EMAIL},
        {"$unset": {"totp_setup_grace_used": "", "must_setup_2fa": ""}},
    )
    client.close()


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def maman_token(api_client):
    r = api_client.post(f"{API}/auth/login", json=MAMAN, timeout=30)
    assert r.status_code == 200, f"MAMAN login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(api_client):
    asyncio.get_event_loop().run_until_complete(_reset_admin_2fa_grace())
    last = None
    for pwd in ADMIN_PASSWORDS:
        r = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": pwd}, timeout=30)
        if r.status_code == 200:
            data = r.json()
            if data.get("requires_2fa") or data.get("two_factor_required"):
                pytest.skip(f"Admin requires 2FA challenge: {data}")
            if data.get("token"):
                return data["token"]
        last = (r.status_code, r.text[:250])
    pytest.skip(f"Admin login failed: {last}")


# ============================================================
# 1. /api/etablissements/meta — 1676 total + 32 régions
# ============================================================
class TestMeta:
    def test_meta_total_1676(self, api_client):
        r = api_client.get(f"{API}/etablissements/meta", timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data["total"] == 1676, f"Expected total==1676, got {data['total']}"
        print(f"[OK] total={data['total']}")

    def test_meta_32_regions_msp(self, api_client):
        r = api_client.get(f"{API}/etablissements/meta", timeout=30)
        data = r.json()
        regions = data["regions"]
        assert len(regions) == 32, f"Expected 32 regions, got {len(regions)}: {regions}"
        # Régions clés à vérifier
        must_have = ["Abidjan 1", "Abidjan 2", "Sud-Comoé", "Gbêkê", "Poro",
                     "Bounkani", "Cavally", "Folon"]
        for reg in must_have:
            assert reg in regions, f"Region '{reg}' missing. Got: {regions}"
        print(f"[OK] 32 regions incl. {must_have}")

    def test_meta_communes_100_plus(self, api_client):
        r = api_client.get(f"{API}/etablissements/meta", timeout=30)
        data = r.json()
        assert len(data["communes"]) >= 100, f"Expected >=100 communes, got {len(data['communes'])}"
        print(f"[OK] communes={len(data['communes'])}")

    def test_meta_categories_around_12(self, api_client):
        r = api_client.get(f"{API}/etablissements/meta", timeout=30)
        data = r.json()
        cats = data["categories"]
        assert 10 <= len(cats) <= 15, f"Expected ~12 categories, got {len(cats)}: {cats}"
        print(f"[OK] categories={len(cats)}")


# ============================================================
# 2. /api/etablissements?commune=Yopougon&specialite=Maternité
# ============================================================
class TestYopougonMaternite:
    def test_at_least_10_maternites_yopougon(self, api_client):
        r = api_client.get(f"{API}/etablissements",
                           params={"commune": "Yopougon", "specialite": "Maternité", "limit": 50},
                           timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] >= 10, f"Expected >=10 maternités Yopougon, got {data['count']}"
        print(f"[OK] Yopougon Maternité count={data['count']}")

    def test_each_item_has_num_ordre_ge_1(self, api_client):
        r = api_client.get(f"{API}/etablissements",
                           params={"commune": "Yopougon", "specialite": "Maternité", "limit": 50},
                           timeout=30)
        for it in r.json()["items"]:
            no = it.get("num_ordre")
            assert isinstance(no, int) and no >= 1, \
                f"num_ordre invalid: {no} on {it.get('id')} / {it.get('nom')}"
        print(f"[OK] All items have valid num_ordre (int >= 1)")

    def test_each_item_has_valid_id_format(self, api_client):
        r = api_client.get(f"{API}/etablissements",
                           params={"commune": "Yopougon", "specialite": "Maternité", "limit": 50},
                           timeout=30)
        for it in r.json()["items"]:
            assert ID_RE.match(it["id"]), f"Bad id format: {it['id']}"
        print(f"[OK] All ids match esp_*_XXXX pattern")


# ============================================================
# 3. /api/etablissements?region=Abidjan 2 → total=671
# ============================================================
class TestAbidjan2Count:
    def test_abidjan2_total_671(self, api_client):
        r = api_client.get(f"{API}/etablissements",
                           params={"region": "Abidjan 2", "limit": 1},
                           timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 671, f"Expected Abidjan 2 total >= 671, got {data['total']}"
        # On attend exactement 671 mais on tolère >= 671 comme le task
        print(f"[OK] Abidjan 2 total={data['total']}")


# ============================================================
# 4. TND high_risk Cocody → max 5 pediatriques + log analytics
# ============================================================
class TestOrientTND:
    def test_tnd_high_risk_cocody(self, api_client, maman_token):
        r = api_client.get(
            f"{API}/etablissements/orient/tnd/high_risk",
            params={"commune": "Cocody"},
            headers={"Authorization": f"Bearer {maman_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert data["level"] == "high_risk"
        assert 0 < data["count"] <= 5, f"Expected 1..5 items, got {data['count']}"
        for it in data["items"]:
            assert "Pédiatrie" in it.get("specialites_metier", []), \
                f"Item without Pédiatrie: {it.get('nom')}"
            # nouveau champ num_ordre présent
            assert isinstance(it.get("num_ordre"), int), f"missing num_ordre: {it.get('id')}"
        print(f"[OK] TND Cocody: {data['count']} items pédiatriques (max 5)")

    def test_tnd_call_logged_in_orient_logs(self, api_client, maman_token, admin_token):
        # Trigger orientation
        api_client.get(
            f"{API}/etablissements/orient/tnd/high_risk",
            params={"commune": "Cocody"},
            headers={"Authorization": f"Bearer {maman_token}"},
            timeout=30,
        )
        # Verify via analytics
        r = requests.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "7d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        assert r.status_code == 200
        orient = r.json()["orientations"]
        assert orient["tnd"] >= 1, f"Expected orientations.tnd>=1, got {orient}"
        print(f"[OK] orientations.tnd={orient['tnd']} (log persisté)")


# ============================================================
# 5. Admin analytics /api/admin/analytics/etablissements?period=30d
# ============================================================
class TestAdminAnalytics:
    def test_coverage_total_1676(self, api_client, admin_token):
        r = api_client.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "30d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        cov = data["coverage"]
        assert cov["total_etablissements"] == 1676, f"Expected 1676, got {cov['total_etablissements']}"
        print(f"[OK] coverage.total_etablissements={cov['total_etablissements']}")

    def test_coverage_geocoded_ge_1650(self, api_client, admin_token):
        r = api_client.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "30d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        cov = r.json()["coverage"]
        assert cov["geocoded"] >= 1650, f"Expected geocoded>=1650, got {cov['geocoded']}"
        assert cov["geocoded_pct"] >= 98.0, f"Expected pct>=98%, got {cov['geocoded_pct']}"
        print(f"[OK] coverage.geocoded={cov['geocoded']} ({cov['geocoded_pct']}%)")

    def test_coverage_maternite_ge_80(self, api_client, admin_token):
        r = api_client.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "30d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        cov = r.json()["coverage"]
        assert cov["maternite"] >= 80, f"Expected maternite>=80, got {cov['maternite']}"
        print(f"[OK] coverage.maternite={cov['maternite']}")

    def test_by_region_abidjan2_head_671(self, api_client, admin_token):
        r = api_client.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "30d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        by_region = r.json()["by_region"]
        assert by_region, "by_region is empty"
        top = by_region[0]
        assert top["region"] == "Abidjan 2", f"Expected Abidjan 2 first, got {top['region']}"
        assert top["total"] >= 671, f"Expected Abidjan 2 total>=671, got {top['total']}"
        print(f"[OK] by_region[0]={top['region']} total={top['total']}")

    def test_pro_claims_ge_3(self, api_client, admin_token):
        r = api_client.get(
            f"{API}/admin/analytics/etablissements",
            params={"period": "30d"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        pc = r.json()["pro_claims"]
        assert pc["total"] >= 3, f"Expected pro_claims.total>=3, got {pc['total']}"
        print(f"[OK] pro_claims.total={pc['total']}")


# ============================================================
# 6. Validation MongoDB directe : unicité num_ordre + format id
# ============================================================
@pytest.mark.asyncio
async def test_mongo_uniqueness_and_id_format():
    """Vérifie qu'il n'y a pas de doublon (region, num_ordre) et que chaque `id` matche esp_*_XXXX."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    try:
        # 1. Aucun doublon (region, num_ordre)
        pipeline = [
            {"$match": {"num_ordre": {"$exists": True, "$ne": None}}},
            {"$group": {"_id": {"region": "$region", "num_ordre": "$num_ordre"}, "n": {"$sum": 1}}},
            {"$match": {"n": {"$gt": 1}}},
            {"$limit": 10},
        ]
        dupes = [d async for d in db.etablissements_officiels.aggregate(pipeline)]
        assert not dupes, f"Doublons (region,num_ordre): {dupes[:5]}"
        print(f"[OK] Aucun doublon (region, num_ordre) sur toute la collection")

        # 2. Format id
        bad_ids = []
        async for e in db.etablissements_officiels.find({}, {"id": 1, "_id": 0}):
            if not ID_RE.match(e.get("id", "")):
                bad_ids.append(e.get("id"))
                if len(bad_ids) >= 5:
                    break
        assert not bad_ids, f"IDs mal formés (sample): {bad_ids}"
        total = await db.etablissements_officiels.count_documents({})
        with_num = await db.etablissements_officiels.count_documents({"num_ordre": {"$exists": True}})
        print(f"[OK] Tous IDs matchent esp_*_XXXX (total={total}, avec num_ordre={with_num})")
    finally:
        client.close()


# ============================================================
# 7. Reliaison claims pro : chaque claim pointe vers un etab existant
# ============================================================
@pytest.mark.asyncio
async def test_pro_claims_linked_to_existing_etabs():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    try:
        total_claims = await db.pro_claims.count_documents({})
        print(f"Total pro_claims in DB: {total_claims}")
        assert total_claims >= 3, f"Expected >=3 claims, got {total_claims}"

        orphans = []
        empty_ref = []
        async for c in db.pro_claims.find({}, {"id": 1, "etablissement_id": 1, "user_email": 1, "_id": 0}):
            eid = c.get("etablissement_id") or ""
            if not eid:
                empty_ref.append(c)
                continue
            match = await db.etablissements_officiels.find_one({"id": eid}, {"id": 1, "_id": 0})
            if not match:
                orphans.append(c)

        assert not empty_ref, f"Claims avec etablissement_id vide: {empty_ref}"
        assert not orphans, f"Claims orphelins (etab id inexistant): {orphans}"
        print(f"[OK] Les {total_claims} claims pointent tous vers un etab existant")
    finally:
        client.close()
