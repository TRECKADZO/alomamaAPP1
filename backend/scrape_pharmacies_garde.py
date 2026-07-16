"""
Scraper — Pharmacies de Garde Côte d'Ivoire (hebdomadaire).

Source : https://www.pharmacies-de-garde.ci/liste-des-pharmacies-de-garde-en-cote-divoire/

Extrait les 2 tables (Abidjan + Intérieur) via l'API DataTables sous-jacente.
Persiste dans MongoDB (collection: pharmacies_garde + pharmacies_garde_meta + pharmacies_garde_history).

Usage :
    python scrape_pharmacies_garde.py           # scrape + persist
    from scrape_pharmacies_garde import scrape_and_persist
"""
import os
import re
import sys
import hashlib
import logging
import asyncio
import unicodedata
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx
from bs4 import BeautifulSoup

# Import des utilitaires du router
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from routers.pharmacies_garde import (
    _norm,
    _coords_for_commune,
    _extract_phones,
    _extract_responsable,
)

logger = logging.getLogger(__name__)

SOURCE_URL = "https://www.pharmacies-de-garde.ci/liste-des-pharmacies-de-garde-en-cote-divoire/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AloMaman-Scraper/1.0; +https://alomaman.dev)",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

MOIS_FR = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5,
    "juin": 6, "juillet": 7, "août": 8, "aout": 8, "septembre": 9,
    "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12,
}


def _parse_period(text: str) -> Dict[str, Any]:
    """
    Extrait la période depuis un titre comme :
      'Pharmacies de garde en Côte d'Ivoire du Samedi 11 Juillet au Vendredi 17 Juillet 2026'
    Retourne : { periode, periode_debut (ISO), periode_fin (ISO) }
    """
    if not text:
        return {"periode": None, "periode_debut": None, "periode_fin": None}
    # Regex de type : "du (\w+ \d+ \w+) au (\w+ \d+ \w+ \d{4})"
    m = re.search(
        r"du\s+\w+\s+(\d{1,2})\s+([A-Za-zéèêûàâîï]+)\s+(\d{4})?\s+au\s+\w+\s+(\d{1,2})\s+([A-Za-zéèêûàâîï]+)\s+(\d{4})",
        text,
        re.IGNORECASE,
    )
    if not m:
        # Fallback : essaye sans "du"
        m = re.search(
            r"(\d{1,2})\s+([A-Za-zéèêûàâîï]+)\s+au\s+\w+\s+(\d{1,2})\s+([A-Za-zéèêûàâîï]+)\s+(\d{4})",
            text,
            re.IGNORECASE,
        )
    if not m:
        return {"periode": text.strip(), "periode_debut": None, "periode_fin": None}
    try:
        groups = m.groups()
        if len(groups) == 6:
            d1, mois1, an1, d2, mois2, an2 = groups
        else:
            d1, mois1, d2, mois2, an2 = groups
            an1 = an2
        an1 = an1 or an2
        mois1_num = MOIS_FR.get(mois1.lower().replace("é", "e").replace("è", "e").replace("û", "u").replace("ï", "i"))
        mois2_num = MOIS_FR.get(mois2.lower().replace("é", "e").replace("è", "e").replace("û", "u").replace("ï", "i"))
        if not mois1_num or not mois2_num:
            return {"periode": text.strip(), "periode_debut": None, "periode_fin": None}
        debut = datetime(int(an1), mois1_num, int(d1), tzinfo=timezone.utc)
        fin = datetime(int(an2), mois2_num, int(d2), 23, 59, 59, tzinfo=timezone.utc)
        return {
            "periode": f"Du {debut.strftime('%d/%m/%Y')} au {fin.strftime('%d/%m/%Y')}",
            "periode_debut": debut.isoformat(),
            "periode_fin": fin.isoformat(),
        }
    except Exception as e:
        logger.warning(f"parse_period fallback: {e}")
        return {"periode": text.strip(), "periode_debut": None, "periode_fin": None}


def _parse_table(table: BeautifulSoup, zone: str) -> List[Dict[str, Any]]:
    """Extrait les lignes d'un tableau HTML de pharmacies de garde."""
    rows = []
    for tr in table.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < 3:
            continue
        commune, nom, contact = cells[0], cells[1], cells[2]
        # Filtre les lignes vides ou d'entête
        if not nom or not commune:
            continue
        if "PHARMACIE" not in nom.upper() and "OFFICINE" not in nom.upper():
            # Peut-être une pharmacie sans le mot dans le nom, on garde quand même si commune connue
            pass
        phones = _extract_phones(contact)
        responsable = _extract_responsable(contact)
        lat, lon = _coords_for_commune(commune)
        # ID stable = hash(zone + commune + nom)
        _id_key = f"{zone}|{_norm(commune)}|{_norm(nom)}"
        pharm_id = "pg_" + hashlib.sha1(_id_key.encode("utf-8")).hexdigest()[:16]
        rows.append({
            "id": pharm_id,
            "zone": zone,
            "commune": commune.strip(),
            "commune_norm": _norm(commune),
            "nom": nom.strip(),
            "responsable": responsable,
            "contact_raw": contact.strip(),
            "telephones": phones,
            "telephone_primary": phones[0] if phones else None,
            "lat": lat,
            "lon": lon,
            "source": SOURCE_URL,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return rows


async def scrape_pharmacies() -> Dict[str, Any]:
    """
    Fetch + parse la page source. Retourne un dict :
      { periode, periode_debut, periode_fin, abidjan: [...], interieur: [...] }
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=HEADERS) as client:
        # DataTables charge parfois les données via un endpoint AJAX. Ici on tente d'abord le HTML brut.
        r = await client.get(SOURCE_URL)
        r.raise_for_status()
        html = r.text

    soup = BeautifulSoup(html, "html.parser")

    # Titre = période
    title_txt = ""
    for h in soup.find_all(["h1", "h2", "h3"]):
        t = h.get_text(strip=True)
        if "pharmacies de garde" in t.lower() and ("au " in t.lower() or "du " in t.lower()):
            title_txt = t
            break
    period = _parse_period(title_txt)

    # Trouve les tables. La page en a 2.
    tables = soup.find_all("table")
    abidjan_rows: List[Dict[str, Any]] = []
    interieur_rows: List[Dict[str, Any]] = []

    for tbl in tables:
        # Analyse l'entête pour déterminer si Abidjan ou Intérieur
        header_text = ""
        thead = tbl.find("thead")
        if thead:
            header_text = thead.get_text(" ", strip=True).upper()
        first_row = tbl.find("tr")
        if not header_text and first_row:
            header_text = first_row.get_text(" ", strip=True).upper()

        # Détection : entête contient "ABIDJAN" ou "VILLE"
        if "ABIDJAN" in header_text or "QUARTIER" in header_text:
            zone = "abidjan"
        elif "VILLE" in header_text or "INTERIEUR" in header_text or "INTÉRIEUR" in header_text:
            zone = "interieur"
        else:
            # Heuristique : contenu de la première cellule
            sample_cell = ""
            body = tbl.find("tbody")
            first_tr = body.find("tr") if body else None
            if first_tr:
                td = first_tr.find("td")
                sample_cell = td.get_text(strip=True).upper() if td else ""
            if any(c in sample_cell for c in ("ABOBO", "COCODY", "YOPOUGON", "MARCORY")):
                zone = "abidjan"
            else:
                zone = "interieur"

        rows = _parse_table(tbl, zone)
        if zone == "abidjan":
            abidjan_rows.extend(rows)
        else:
            interieur_rows.extend(rows)

    return {
        **period,
        "abidjan": abidjan_rows,
        "interieur": interieur_rows,
    }


async def scrape_and_persist(db) -> Dict[str, Any]:
    """
    Scrape + persist dans MongoDB.
    - Remplace la collection `pharmacies_garde` (données de la semaine courante)
    - Update `pharmacies_garde_meta`
    - Ajoute un audit dans `pharmacies_garde_history`
    """
    logger.info("🔄 Scraping pharmacies de garde depuis %s", SOURCE_URL)
    data = await scrape_pharmacies()
    all_docs = data["abidjan"] + data["interieur"]

    if not all_docs:
        raise RuntimeError("Aucune pharmacie trouvée dans la source — scraping échoué")

    # Snapshot précédent pour diff
    previous_count = await db.pharmacies_garde.count_documents({})
    previous_ids = set()
    if previous_count > 0:
        async for p in db.pharmacies_garde.find({}, {"id": 1, "_id": 0}):
            previous_ids.add(p.get("id"))

    # Reset + insert
    await db.pharmacies_garde.delete_many({})
    if all_docs:
        await db.pharmacies_garde.insert_many(all_docs)

    now = datetime.now(timezone.utc).isoformat()
    meta_doc = {
        "key": "current",
        "periode": data.get("periode"),
        "periode_debut": data.get("periode_debut"),
        "periode_fin": data.get("periode_fin"),
        "last_updated": now,
        "source": SOURCE_URL,
        "count_abidjan": len(data["abidjan"]),
        "count_interieur": len(data["interieur"]),
        "total": len(all_docs),
    }
    await db.pharmacies_garde_meta.update_one(
        {"key": "current"}, {"$set": meta_doc}, upsert=True
    )

    # Diff : nouveaux / disparus
    new_ids = {d["id"] for d in all_docs}
    added = list(new_ids - previous_ids)
    removed = list(previous_ids - new_ids)

    audit = {
        "scraped_at": now,
        "periode": data.get("periode"),
        "total": len(all_docs),
        "count_abidjan": len(data["abidjan"]),
        "count_interieur": len(data["interieur"]),
        "previous_count": previous_count,
        "added_count": len(added),
        "removed_count": len(removed),
        "source": SOURCE_URL,
    }
    await db.pharmacies_garde_history.insert_one(audit)

    # Cap history à 12 snapshots (3 mois)
    hist_count = await db.pharmacies_garde_history.count_documents({})
    if hist_count > 12:
        to_delete = await db.pharmacies_garde_history.find({}, {"_id": 1}).sort("scraped_at", 1).to_list(hist_count - 12)
        for d in to_delete:
            await db.pharmacies_garde_history.delete_one({"_id": d["_id"]})

    logger.info(
        "✅ Pharmacies de garde : %d Abidjan + %d Intérieur = %d (période: %s)",
        len(data["abidjan"]), len(data["interieur"]), len(all_docs), data.get("periode")
    )
    return {
        "total": len(all_docs),
        "count_abidjan": len(data["abidjan"]),
        "count_interieur": len(data["interieur"]),
        "periode": data.get("periode"),
        "periode_debut": data.get("periode_debut"),
        "periode_fin": data.get("periode_fin"),
        "added": len(added),
        "removed": len(removed),
    }


async def main():
    """CLI : python scrape_pharmacies_garde.py"""
    from dotenv import load_dotenv
    load_dotenv()
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    result = await scrape_and_persist(db)
    print("=" * 60)
    print("Résultat du scraping :")
    for k, v in result.items():
        print(f"  {k}: {v}")
    print("=" * 60)
    client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    asyncio.run(main())
