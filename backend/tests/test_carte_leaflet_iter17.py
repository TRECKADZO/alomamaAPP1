"""
Tests for /api/etablissements/nearby (Leaflet map endpoint) — Iter 17
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback used only if unset — should NEVER happen
    BASE_URL = "https://cycle-tracker-pro.preview.emergentagent.com"

API = f"{BASE_URL}/api"

# Coord Abidjan (Plateau)
ABJ_LAT = 5.3453
ABJ_LON = -4.0072


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── /nearby route order (declared BEFORE /{id})
class TestNearbyRouteOrdering:
    def test_nearby_not_captured_by_id_route(self, session):
        r = session.get(f"{API}/etablissements/nearby", params={"lat": 5.3, "lon": -4.0})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        # If it were captured by /{id}, we'd have {"detail":"Établissement introuvable"}
        assert "items" in data, f"Missing items key. Body={data}"
        assert "user_position" in data
        assert "radius_km" in data


# ── Nearby with specialite Maternite (Abidjan center 5km)
class TestNearbyMaternity:
    def test_returns_maternities_within_5km_abidjan(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 5, "specialite": "Maternité", "limit": 50},
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        items = data["items"]
        # >=20 expected per spec
        assert data["total_in_radius"] >= 20, f"Only {data['total_in_radius']} maternities found in 5km (expected >=20)"
        assert isinstance(items, list)
        assert data["count"] <= data["total_in_radius"]
        assert data["radius_km"] == 5.0
        assert data["user_position"] == {"lat": ABJ_LAT, "lon": ABJ_LON}

    def test_distance_km_and_travel_min_car_present(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 5, "specialite": "Maternité", "limit": 10},
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) > 0
        for it in items:
            assert "distance_km" in it, f"Missing distance_km in {it.get('nom')}"
            assert isinstance(it["distance_km"], (int, float))
            assert it["distance_km"] <= 5.0
            assert "travel_min_car" in it
            assert isinstance(it["travel_min_car"], int)

    def test_items_sorted_by_distance_ascending(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 5, "specialite": "Maternité", "limit": 20},
        )
        items = r.json()["items"]
        distances = [it["distance_km"] for it in items]
        assert distances == sorted(distances), f"Items not sorted asc: {distances}"


# ── Text search
class TestNearbyTextSearch:
    def test_search_query_maternite_filters_by_name(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 2, "q": "maternite"},
        )
        assert r.status_code == 200, r.text[:200]
        items = r.json()["items"]
        # note: q applies regex on nom / commune / adresse (case-insensitive)
        # since Mongo regex is not accent-insensitive, "maternite" may miss "maternité".
        # We only check the returned items match the substring somewhere.
        if len(items) > 0:
            for it in items:
                blob = (it.get("nom", "") + " " + it.get("commune", "") + " " + it.get("adresse", "")).lower()
                assert "maternite" in blob or "maternité" in blob, f"Item does not match q='maternite': {it.get('nom')}"


# ── CMU filter
class TestNearbyCMU:
    def test_cmu_true_returns_zero_or_only_cmu(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 1, "cmu": "true"},
        )
        assert r.status_code == 200
        data = r.json()
        # Expected: 0 (no cmu_accepted=true seeded)
        for it in data["items"]:
            assert it.get("cmu_accepted") is True


# ── /etablissements/{id} still works
class TestGetById:
    def test_get_esp_abidjan_1_0001_or_first(self, session):
        # Try to get first item id then GET it
        r = session.get(f"{API}/etablissements", params={"limit": 1})
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert len(items) > 0, "No etablissements in DB"
        target_id = items[0]["id"]

        r2 = session.get(f"{API}/etablissements/{target_id}")
        assert r2.status_code == 200, f"GET /{target_id} failed: {r2.text[:200]}"
        detail = r2.json()
        assert detail["id"] == target_id
        assert "nom" in detail


# ── Consistency: count <= total_in_radius <= limit
class TestNearbyConsistency:
    def test_count_le_total_in_radius(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 10, "limit": 5},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] <= data["total_in_radius"]
        assert data["count"] <= 5

    def test_categorie_filter(self, session):
        r = session.get(
            f"{API}/etablissements/nearby",
            params={"lat": ABJ_LAT, "lon": ABJ_LON, "radius_km": 10, "categorie": "Clinique Médicale", "limit": 30},
        )
        assert r.status_code == 200
        items = r.json()["items"]
        for it in items:
            assert it.get("categorie") == "Clinique Médicale"
