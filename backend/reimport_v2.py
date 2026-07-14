"""
Import propre v2 :
  1. Sauvegarde les lat/lon Nominatim précis des 322 anciens (matching par nom+région)
  2. Wipe la collection etablissements_officiels
  3. Réimporte les 1676 depuis le nouveau JSON avec num_ordre unique
  4. Réapplique les lat/lon Nominatim précis sauvegardés
  5. Réapplique le géocodage centroïde par commune/district pour les nouveaux

Résultat attendu : 1676 établissements dont ~96% géocodés.
"""
import asyncio
import json
import os
import random
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "etablissements_ci_xlsx.json"


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Coordonnées de secours (mêmes que geocode_by_centroid.py)
FALLBACK_COORDS = {
    "abidjan": (5.3453, -4.0072), "abidjan 1": (5.4152, -4.0430), "abidjan 2": (5.3453, -3.9803),
    "abobo": (5.4262, -4.0247), "yopougon": (5.3411, -4.0787), "cocody": (5.3599, -3.9820),
    "plateau": (5.3260, -4.0209), "marcory": (5.2911, -3.9866), "koumassi": (5.2916, -3.9459),
    "port-bouet": (5.2557, -3.9265), "port bouet": (5.2557, -3.9265), "port bouët": (5.2557, -3.9265),
    "attecoube": (5.3339, -4.0421), "attécoubé": (5.3339, -4.0421), "treichville": (5.3038, -4.0087),
    "bingerville": (5.3546, -3.9002), "anyama": (5.4934, -4.0512), "songon": (5.3125, -4.2547),
    "adjame": (5.3653, -4.0206), "adjamé": (5.3653, -4.0206), "yamoussoukro": (6.8276, -5.2893),
    "bouake": (7.6907, -5.0303), "bouaké": (7.6907, -5.0303), "gagnoa": (6.1315, -5.9506),
    "daloa": (6.8908, -6.4508), "san-pedro": (4.7485, -6.6363), "san pedro": (4.7485, -6.6363),
    "korhogo": (9.4581, -5.6297), "man": (7.4126, -7.5545), "abengourou": (6.7297, -3.4964),
    "dabou": (5.3242, -4.3775), "grand-bassam": (5.2144, -3.7361), "grand bassam": (5.2144, -3.7361),
    "aboisso": (5.4667, -3.2000), "soubre": (5.7833, -6.6000), "soubré": (5.7833, -6.6000),
    "divo": (5.8380, -5.3568), "toumodi": (6.5546, -5.0169), "sassandra": (4.9500, -6.0833),
    "seguela": (7.9585, -6.6708), "séguéla": (7.9585, -6.6708), "danane": (7.2597, -8.1547),
    "danané": (7.2597, -8.1547), "guiglo": (6.5433, -7.4919), "duekoue": (6.7419, -7.3494),
    "duékoué": (6.7419, -7.3494), "ferkessedougou": (9.5936, -5.1953), "ferkessédougou": (9.5936, -5.1953),
    "boundiali": (9.5225, -6.4808), "odienne": (9.5000, -7.5667), "odienné": (9.5000, -7.5667),
    "bondoukou": (8.0402, -2.7997), "agboville": (5.9333, -4.2167), "adzope": (6.1000, -3.8667),
    "adzopé": (6.1000, -3.8667), "bocanda": (7.0667, -4.5000), "dimbokro": (6.6500, -4.7000),
    "issia": (6.4917, -6.5833), "vavoua": (7.3833, -6.4667), "buyo": (6.2500, -7.0333),
    "tabou": (4.4231, -7.3528), "biankouma": (7.7333, -7.6167), "sinfra": (6.6167, -5.9167),
    "bouafle": (6.9833, -5.7500), "bouaflé": (6.9833, -5.7500), "katiola": (8.1333, -5.1000),
    "tiassale": (5.8983, -4.8253), "tiassalé": (5.8983, -4.8253), "grand-lahou": (5.1425, -5.0139),
    "lakota": (5.8500, -5.6833), "meagui": (5.9500, -6.6500), "méagui": (5.9500, -6.6500),
    "bongouanou": (6.6500, -4.2000), "arrah": (6.6704, -3.9782), "daoukro": (7.0575, -3.9666),
    "prikro": (7.5622, -3.8347), "koun-fao": (7.5333, -3.1500), "tanda": (7.8036, -3.1706),
    "mankono": (8.0603, -6.1900), "dabakala": (8.3667, -4.4333), "cote d'ivoire": (7.5400, -5.5471),
    "côte d'ivoire": (7.5400, -5.5471),
}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    col = db.etablissements_officiels

    # 1) Sauvegarder les lat/lon PRÉCIS (source Nominatim) des anciens
    print("Étape 1/5 : Sauvegarde des coordonnées Nominatim précises…")
    precise_geo = {}  # (nom_norm, region_norm) → (lat, lon)
    async for e in col.find(
        {"lat": {"$exists": True}, "geocode_source": {"$ne": "centroid_commune"}},
        {"_id": 0, "nom": 1, "region": 1, "lat": 1, "lon": 1, "geocode_source": 1},
    ):
        if e.get("geocode_source") in ("centroid_commune", "centroid_district", "centroid_region",
                                        "fallback_dict", "fallback_partial"):
            continue  # ignorer les approximatifs
        key = (_norm(e["nom"]), _norm(e.get("region", "")))
        precise_geo[key] = (e["lat"], e["lon"])
    print(f"   {len(precise_geo)} coordonnées Nominatim précises sauvegardées")

    # 2) Sauvegarder les claims existantes pour ne pas les perdre
    #    (ils pointent sur etablissement_id — on va recréer la table mais on va
    #     conserver les claims tels quels ; les IDs vont changer donc on les orphelinne
    #     ↦ mieux vaut faire matching par nom+region pour re-lier)
    print("\nÉtape 2/5 : Sauvegarde des claims pro existantes…")
    claim_map = {}  # (nom_norm, region_norm) → [claims]
    old_ids_to_nom = {}
    async for e in col.find({}, {"_id": 0, "id": 1, "nom": 1, "region": 1}):
        old_ids_to_nom[e["id"]] = (_norm(e.get("nom", "")), _norm(e.get("region", "")))
    async for c_ in db.pro_claims.find({}, {"_id": 0}):
        key = old_ids_to_nom.get(c_.get("etablissement_id"))
        if key:
            claim_map.setdefault(key, []).append(c_)
    print(f"   {sum(len(v) for v in claim_map.values())} claims pro à relier")

    # 3) Wipe et réimport
    print("\nÉtape 3/5 : Wipe + réimport 1676 établissements…")
    await col.delete_many({})

    data = json.loads(DATA_FILE.read_text())
    etabs = data.get("etablissements", [])

    inserted = 0
    matched_precise = 0
    now = datetime.now(timezone.utc).isoformat()
    for e in etabs:
        num = e.get("num_ordre", 0)
        region_key = _norm(e.get("region", ""))
        etab_id = f"esp_{region_key.replace(' ', '_')[:15]}_{num:04d}"
        doc = {
            "id": etab_id,
            **{k: v for k, v in e.items() if k != "num_ordre"},
            "num_ordre": num,
            "source": "E-DEPPS MSP CI",
            "verified": True,
            "created_at": now,
        }
        # Matcher un geocodage précis existant
        key = (_norm(e["nom"]), _norm(e.get("region", "")))
        if key in precise_geo:
            lat, lon = precise_geo[key]
            doc["lat"] = lat
            doc["lon"] = lon
            doc["geocode_source"] = "nominatim_precise"
            doc["geocode_approximate"] = False
            matched_precise += 1

        await col.insert_one(doc)
        inserted += 1

    print(f"   {inserted} établissements insérés · {matched_precise} avec géocodage Nominatim précis")

    # 4) Géocodage centroïde par commune/district pour ceux sans coordonnées
    print("\nÉtape 4/5 : Géocodage centroïde des nouveaux…")
    # Calculer les centroïdes depuis les précis restants
    commune_pts, district_pts, region_pts = defaultdict(list), defaultdict(list), defaultdict(list)
    async for e in col.find({"lat": {"$exists": True}}, {"_id": 0}):
        try:
            lat, lon = float(e["lat"]), float(e["lon"])
        except (TypeError, ValueError):
            continue
        if e.get("commune"): commune_pts[_norm(e["commune"])].append((lat, lon))
        if e.get("district_sanitaire"): district_pts[_norm(e["district_sanitaire"])].append((lat, lon))
        if e.get("region"): region_pts[_norm(e["region"])].append((lat, lon))

    def centroid(pts):
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) if pts else None

    commune_c = {k: centroid(v) for k, v in commune_pts.items()}
    district_c = {k: centroid(v) for k, v in district_pts.items()}
    region_c = {k: centroid(v) for k, v in region_pts.items()}
    print(f"   Centroïdes : {len(commune_c)} communes · {len(district_c)} districts · {len(region_c)} régions")

    random.seed(42)
    updated = 0
    failed = 0
    async for e in col.find({"lat": {"$exists": False}}, {"_id": 0}):
        c_key = _norm(e.get("commune", ""))
        d_key = _norm(e.get("district_sanitaire", ""))
        r_key = _norm(e.get("region", ""))

        coord = None
        source = None
        if c_key and c_key in commune_c: coord, source = commune_c[c_key], "centroid_commune"
        elif d_key and d_key in district_c: coord, source = district_c[d_key], "centroid_district"
        elif r_key and r_key in region_c: coord, source = region_c[r_key], "centroid_region"
        else:
            for key in (c_key, d_key, r_key):
                if key in FALLBACK_COORDS:
                    coord, source = FALLBACK_COORDS[key], "fallback_dict"
                    break
            if not coord:
                for key, val in FALLBACK_COORDS.items():
                    if (c_key and (key in c_key or c_key in key)) or (d_key and (key in d_key or d_key in key)):
                        coord, source = val, "fallback_partial"
                        break

        if coord:
            await col.update_one(
                {"id": e["id"]},
                {"$set": {
                    "lat": coord[0] + random.uniform(-0.0008, 0.0008),
                    "lon": coord[1] + random.uniform(-0.0008, 0.0008),
                    "geocode_source": source,
                    "geocode_approximate": True,
                    "geocoded_at": now,
                }},
            )
            updated += 1
        else:
            failed += 1

    total = await col.count_documents({})
    geoc = await col.count_documents({"lat": {"$exists": True, "$ne": None}})
    print(f"   {updated} nouveaux géocodés · {failed} sans coord")

    # 5) Relier les claims aux nouveaux IDs
    print("\nÉtape 5/5 : Reliaison des claims pro…")
    relied = 0
    lost = 0
    for (nom_key, region_key), claims in claim_map.items():
        # Trouver le nouvel établissement correspondant
        matches = []
        async for e in col.find(
            {"region": {"$exists": True}}, {"_id": 0, "id": 1, "nom": 1, "region": 1},
        ):
            if _norm(e["nom"]) == nom_key and _norm(e.get("region", "")) == region_key:
                matches.append(e)
                break
        if matches:
            new_id = matches[0]["id"]
            for c_ in claims:
                await db.pro_claims.update_one(
                    {"claim_id": c_["claim_id"]},
                    {"$set": {"etablissement_id": new_id, "etablissement_nom": matches[0]["nom"]}},
                )
                relied += 1
        else:
            lost += len(claims)

    print(f"   {relied} claims relinkés · {lost} orphelins")

    # ── Résumé
    print(f"\n{'='*60}")
    print(f"🎯 IMPORT COMPLET")
    print(f"   TOTAL en base    : {total} (cible 1676)")
    print(f"   Géocodés         : {geoc} ({geoc*100//total}%)")
    print(f"   Nominatim précis : {matched_precise}")
    print(f"   Centroïdes       : {geoc - matched_precise}")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
