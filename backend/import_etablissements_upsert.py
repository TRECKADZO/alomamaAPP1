"""
Import upsert des établissements fusionnés dans MongoDB.
- Préserve les entrées existantes (avec leur géocodage lat/lon)
- Ajoute les nouveaux depuis le JSON fusionné
- Clé de dédup : (nom_normalisé, district_normalisé)

Usage :
    python3 import_etablissements_upsert.py
"""
import asyncio
import json
import os
import unicodedata
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "etablissements_ci_full.json"


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    col = db.etablissements_officiels

    data = json.loads(DATA_FILE.read_text())
    etabs = data.get("etablissements", [])
    print(f"Fichier source: {len(etabs)} établissements")

    # Cursor sur l'existant
    existing = {}
    async for e in col.find({}, {"_id": 0}):
        key = (_norm(e.get("nom", "")), _norm(e.get("district_sanitaire", "")))
        existing[key] = e
    print(f"Base actuelle: {len(existing)} établissements")

    inserted = 0
    updated = 0
    kept_geocoded = 0
    max_id_num = 0
    for e in existing.values():
        try:
            n = int(str(e.get("id", "esp_0")).split("_")[-1])
            max_id_num = max(max_id_num, n)
        except Exception:
            pass

    for e in etabs:
        key = (_norm(e.get("nom", "")), _norm(e.get("district_sanitaire", "")))
        now = datetime.utcnow().isoformat()

        if key in existing:
            # Mettre à jour uniquement les champs manquants (préserver lat/lon)
            existing_doc = existing[key]
            update_fields = {}
            for field in ("nature", "niveau_intervention", "date_autorisation",
                          "commune", "adresse", "categorie", "specialites_metier",
                          "region"):
                current_val = existing_doc.get(field)
                new_val = e.get(field)
                is_empty = current_val in (None, "", [], {})
                if is_empty and new_val:
                    update_fields[field] = new_val
            if update_fields:
                update_fields["updated_at"] = now
                await col.update_one({"id": existing_doc["id"]}, {"$set": update_fields})
                updated += 1
            if existing_doc.get("lat"):
                kept_geocoded += 1
        else:
            # Nouveau
            max_id_num += 1
            doc = {
                "id": f"esp_{max_id_num:04d}",
                **e,
                "source": "E-DEPPS MSP CI",
                "verified": True,
                "created_at": now,
            }
            await col.insert_one(doc)
            inserted += 1

    total_after = await col.count_documents({})
    geoc_after = await col.count_documents({"lat": {"$exists": True, "$ne": None}})
    print("\n✅ Import upsert terminé")
    print(f"   Existants préservés     : {len(existing)}")
    print(f"   dont géocodés           : {kept_geocoded}")
    print(f"   Nouveaux insérés        : {inserted}")
    print(f"   Anciens enrichis        : {updated}")
    print(f"   TOTAL EN BASE APRÈS     : {total_after}")
    print(f"   Géocodés en base après  : {geoc_after}")
    print(f"   À géocoder (nouveaux)   : {total_after - geoc_after}")


if __name__ == "__main__":
    asyncio.run(main())
