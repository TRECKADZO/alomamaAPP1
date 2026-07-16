"""
Géocodage approximatif par centroïde de commune / district / région.
Utilise les 322 établissements déjà géocodés (via Nominatim) comme référence
pour attribuer des coordonnées approximatives aux nouveaux imports.

Approche :
  1. Calcule le centroïde (moyenne lat/lon) de chaque commune, district, région
  2. Pour chaque non-géocodé, applique le centroïde le plus spécifique disponible
     (commune > district > région) avec un léger offset aléatoire (~50m) pour éviter
     que tous les points se superposent
  3. Marque `geocode_source = "approximate"` pour les distinguer des Nominatim

Usage :
    python3 geocode_by_centroid.py
"""
import asyncio
import os
import random
import unicodedata
from collections import defaultdict
from datetime import datetime

from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).resolve().parent / ".env")


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Coordonnées de secours pour les principales régions/districts CI (fallback)
FALLBACK_COORDS = {
    "abidjan": (5.3453, -4.0072),
    "abidjan 1": (5.4152, -4.0430),  # Yopougon/Abobo côté Nord-Ouest
    "abidjan 2": (5.3453, -3.9803),  # Cocody/Marcory/Plateau
    "abobo": (5.4262, -4.0247),
    "yopougon": (5.3411, -4.0787),
    "cocody": (5.3599, -3.9820),
    "plateau": (5.3260, -4.0209),
    "marcory": (5.2911, -3.9866),
    "koumassi": (5.2916, -3.9459),
    "port-bouet": (5.2557, -3.9265),
    "port bouet": (5.2557, -3.9265),
    "port bouët": (5.2557, -3.9265),
    "attecoube": (5.3339, -4.0421),
    "attécoubé": (5.3339, -4.0421),
    "treichville": (5.3038, -4.0087),
    "bingerville": (5.3546, -3.9002),
    "anyama": (5.4934, -4.0512),
    "songon": (5.3125, -4.2547),
    "adjame": (5.3653, -4.0206),
    "adjamé": (5.3653, -4.0206),
    "yamoussoukro": (6.8276, -5.2893),
    "bouake": (7.6907, -5.0303),
    "bouaké": (7.6907, -5.0303),
    "gagnoa": (6.1315, -5.9506),
    "daloa": (6.8908, -6.4508),
    "san-pedro": (4.7485, -6.6363),
    "san pedro": (4.7485, -6.6363),
    "korhogo": (9.4581, -5.6297),
    "man": (7.4126, -7.5545),
    "abengourou": (6.7297, -3.4964),
    "dabou": (5.3242, -4.3775),
    "grand-bassam": (5.2144, -3.7361),
    "grand bassam": (5.2144, -3.7361),
    "aboisso": (5.4667, -3.2000),
    "soubre": (5.7833, -6.6000),
    "soubré": (5.7833, -6.6000),
    "divo": (5.8380, -5.3568),
    "toumodi": (6.5546, -5.0169),
    "sassandra": (4.9500, -6.0833),
    "seguela": (7.9585, -6.6708),
    "séguéla": (7.9585, -6.6708),
    "danane": (7.2597, -8.1547),
    "danané": (7.2597, -8.1547),
    "guiglo": (6.5433, -7.4919),
    "duekoue": (6.7419, -7.3494),
    "duékoué": (6.7419, -7.3494),
    "ferkessedougou": (9.5936, -5.1953),
    "ferkessédougou": (9.5936, -5.1953),
    "boundiali": (9.5225, -6.4808),
    "odienne": (9.5000, -7.5667),
    "odienné": (9.5000, -7.5667),
    "bondoukou": (8.0402, -2.7997),
    "agboville": (5.9333, -4.2167),
    "adzope": (6.1000, -3.8667),
    "adzopé": (6.1000, -3.8667),
    "bocanda": (7.0667, -4.5000),
    "dimbokro": (6.6500, -4.7000),
    "issia": (6.4917, -6.5833),
    "vavoua": (7.3833, -6.4667),
    "buyo": (6.2500, -7.0333),
    "tabou": (4.4231, -7.3528),
    "biankouma": (7.7333, -7.6167),
    "sinfra": (6.6167, -5.9167),
    "bouafle": (6.9833, -5.7500),
    "bouaflé": (6.9833, -5.7500),
    "sinematiali": (9.5872, -5.4000),
    "sinématiali": (9.5872, -5.4000),
    "ouangolodougou": (9.9639, -5.1481),
    "katiola": (8.1333, -5.1000),
    "tiassale": (5.8983, -4.8253),
    "tiassalé": (5.8983, -4.8253),
    "grand-lahou": (5.1425, -5.0139),
    "lakota": (5.8500, -5.6833),
    "meagui": (5.9500, -6.6500),
    "méagui": (5.9500, -6.6500),
    "bongouanou": (6.6500, -4.2000),
    "abou": (5.3300, -3.9800),
    "kouassi-datekro": (7.8500, -3.1500),
    "arrah": (6.6704, -3.9782),
    "daoukro": (7.0575, -3.9666),
    "prikro": (7.5622, -3.8347),
    "bondoukou": (8.0402, -2.7997),
    "koun-fao": (7.5333, -3.1500),
    "tanda": (7.8036, -3.1706),
    "mankono": (8.0603, -6.1900),
    "dabakala": (8.3667, -4.4333),
    "dianra": (8.4667, -6.1833),
    "cote d'ivoire": (7.5400, -5.5471),  # centroïde pays
    "côte d'ivoire": (7.5400, -5.5471),
}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    col = db.etablissements_officiels

    # 1) Calculer les centroïdes depuis les géocodés existants
    commune_pts = defaultdict(list)
    district_pts = defaultdict(list)
    region_pts = defaultdict(list)

    async for e in col.find({"lat": {"$exists": True, "$ne": None}}, {"_id": 0}):
        try:
            lat, lon = float(e["lat"]), float(e["lon"])
        except (TypeError, ValueError):
            continue
        if e.get("commune"):
            commune_pts[_norm(e["commune"])].append((lat, lon))
        if e.get("district_sanitaire"):
            district_pts[_norm(e["district_sanitaire"])].append((lat, lon))
        if e.get("region"):
            region_pts[_norm(e["region"])].append((lat, lon))

    def centroid(pts):
        if not pts:
            return None
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    commune_c = {k: centroid(v) for k, v in commune_pts.items()}
    district_c = {k: centroid(v) for k, v in district_pts.items()}
    region_c = {k: centroid(v) for k, v in region_pts.items()}

    print(f"Centroïdes : {len(commune_c)} communes · {len(district_c)} districts · {len(region_c)} régions")

    # 2) Attribuer aux non-géocodés
    random.seed(42)
    updated = 0
    failed = 0
    async for e in col.find({"lat": {"$exists": False}}, {"_id": 0}):
        c_key = _norm(e.get("commune", ""))
        d_key = _norm(e.get("district_sanitaire", ""))
        r_key = _norm(e.get("region", ""))

        coord = None
        source = None
        if c_key and c_key in commune_c:
            coord = commune_c[c_key]; source = "centroid_commune"
        elif d_key and d_key in district_c:
            coord = district_c[d_key]; source = "centroid_district"
        elif r_key and r_key in region_c:
            coord = region_c[r_key]; source = "centroid_region"
        else:
            # fallback : dictionnaire manuel
            for key in (c_key, d_key, r_key):
                if key in FALLBACK_COORDS:
                    coord = FALLBACK_COORDS[key]
                    source = "fallback_dict"
                    break
            if not coord:
                # Chercher un match partiel
                for key, val in FALLBACK_COORDS.items():
                    if key and c_key and (key in c_key or c_key in key):
                        coord = val; source = "fallback_partial"; break
                    if key and d_key and (key in d_key or d_key in key):
                        coord = val; source = "fallback_partial"; break

        if coord:
            # Offset aléatoire ~30-100m pour éviter les superpositions
            jitter_lat = random.uniform(-0.0008, 0.0008)
            jitter_lon = random.uniform(-0.0008, 0.0008)
            await col.update_one(
                {"id": e["id"]},
                {"$set": {
                    "lat": coord[0] + jitter_lat,
                    "lon": coord[1] + jitter_lon,
                    "geocode_source": source,
                    "geocode_approximate": True,
                    "geocoded_at": datetime.utcnow().isoformat(),
                }},
            )
            updated += 1
        else:
            failed += 1

    total = await col.count_documents({})
    geoc = await col.count_documents({"lat": {"$exists": True, "$ne": None}})
    print(f"\n✅ Terminé")
    print(f"   Mis à jour     : {updated}")
    print(f"   Sans coord     : {failed}")
    print(f"   Total en base  : {total} · Géocodés {geoc} ({geoc*100//total}%)")


if __name__ == "__main__":
    asyncio.run(main())
