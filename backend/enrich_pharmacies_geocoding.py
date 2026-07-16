#!/usr/bin/env python3
"""
Enrichissement Nominatim des pharmacies de garde.

Depuis le scraper initial, chaque pharmacie a des coordonnées commune-level (centre).
Ce script tente de raffiner via Nominatim OpenStreetMap en cherchant le NOM de la pharmacie
+ commune + Côte d'Ivoire. Si trouvé, met à jour lat/lon avec la précision réelle.

Respect du rate limit Nominatim : 1 req/seconde.

Usage :
    python enrich_pharmacies_geocoding.py           # enrichit toutes les pharmacies
    python enrich_pharmacies_geocoding.py --force   # re-géocode même celles déjà enrichies
"""
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import quote
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")
import httpx


NOMINATIM = "https://nominatim.openstreetmap.org/search"
HEADERS = {"User-Agent": "AloMaman-PharmaciesGarde/1.0", "Accept": "application/json"}


async def geocode_one(client: httpx.AsyncClient, p: dict) -> dict | None:
    """Tente 2 requêtes : d'abord nom + commune, puis commune seule."""
    nom = (p.get("nom") or "").strip()
    commune = (p.get("commune") or "").strip()
    # Nettoie le nom : "PHARMACIE" est trop générique. Garder les mots distinctifs.
    # Ex: "PHARMACIE DU RAIL" → chercher aussi "DU RAIL COCODY Côte d'Ivoire"
    queries = []
    if nom:
        queries.append(f"{nom}, {commune}, Côte d'Ivoire")
    if commune:
        queries.append(f"{commune}, Côte d'Ivoire")

    for query in queries:
        if not query.strip(", "):
            continue
        try:
            url = f"{NOMINATIM}?q={quote(query)}&format=json&limit=1&countrycodes=ci"
            r = await client.get(url, headers=HEADERS, timeout=15.0)
            data = r.json() if r.status_code == 200 else []
            if data:
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                # Filtre : reste bien en Côte d'Ivoire
                if 3.8 <= lat <= 11.0 and -8.9 <= lon <= -2.5:
                    return {
                        "lat": lat,
                        "lon": lon,
                        "geocoded_display": data[0].get("display_name", ""),
                        "geocode_source": "nominatim_precise" if query == queries[0] else "nominatim_commune",
                        "geocoded_at": datetime.now(timezone.utc).isoformat(),
                    }
        except Exception as e:
            print(f"    ⚠ {p.get('id')} err: {str(e)[:80]}", file=sys.stderr)
        # 1.1s entre chaque appel Nominatim
        await asyncio.sleep(1.1)
    return None


async def main():
    force = "--force" in sys.argv
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    query = {} if force else {"geocode_source": {"$exists": False}}
    todo = await db.pharmacies_garde.find(query, {"_id": 0}).to_list(None)
    total = len(todo)
    if total == 0:
        print("✅ Aucune pharmacie à enrichir. Utilisez --force pour re-géocoder.")
        return

    print(f"📍 {total} pharmacies à enrichir via Nominatim OSM (rate limit: 1 req/s)")
    print(f"   Durée estimée : ~{total * 2.2 / 60:.1f} min")

    ok, ko = 0, 0
    async with httpx.AsyncClient() as http:
        for i, p in enumerate(todo, 1):
            geo = await geocode_one(http, p)
            if geo:
                await db.pharmacies_garde.update_one({"id": p["id"]}, {"$set": geo})
                ok += 1
            else:
                # Marque quand même comme "tenté" pour éviter de retenter
                await db.pharmacies_garde.update_one(
                    {"id": p["id"]},
                    {"$set": {"geocode_source": "fallback_commune", "geocoded_at": datetime.now(timezone.utc).isoformat()}},
                )
                ko += 1
            if i % 10 == 0:
                print(f"  {i}/{total} · OK={ok} · fallback={ko}")

    print(f"✅ Terminé : {ok}/{total} enrichis via Nominatim · {ko} en fallback commune")


if __name__ == "__main__":
    asyncio.run(main())
