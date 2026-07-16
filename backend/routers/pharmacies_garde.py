"""
Router — Pharmacies de Garde en Côte d'Ivoire (hebdomadaire).

Source officielle : https://www.pharmacies-de-garde.ci
Mise à jour hebdomadaire (Samedi → Vendredi).

Collections MongoDB :
- pharmacies_garde : liste des pharmacies pour la période courante
- pharmacies_garde_meta : métadonnées (période, date de scrape, nb pharmacies)
- pharmacies_garde_history : historique des scrapes (audit)
"""
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Query
from math import radians, cos, sin, asin, sqrt
import re
import unicodedata
import logging
import asyncio

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Coordonnées approximatives (centre) des communes d'Abidjan
# et des principales villes de Côte d'Ivoire.
# Source : Nominatim OSM + connaissances géographiques CI.
# ─────────────────────────────────────────────────────────────
COMMUNE_COORDINATES: Dict[str, Tuple[float, float]] = {
    # Abidjan communes
    "ABOBO": (5.4308, -4.0182),
    "ADJAME": (5.3600, -4.0250),
    "ATTECOUBE": (5.3300, -4.0480),
    "COCODY": (5.3577, -3.9836),
    "KOUMASSI": (5.3020, -3.9550),
    "MARCORY": (5.2917, -3.9917),
    "PLATEAU": (5.3239, -4.0210),
    "PORT-BOUET": (5.2543, -3.9260),
    "PORT BOUET": (5.2543, -3.9260),
    "PORT-BOUET / VRIDI / GONZAQUEVILLE": (5.2543, -3.9260),
    "TREICHVILLE": (5.2917, -4.0093),
    "YOPOUGON": (5.3413, -4.0862),
    "ANYAMA": (5.4938, -4.0517),
    "BINGERVILLE": (5.3556, -3.8836),
    "SONGON": (5.3400, -4.2000),
    "ABATTA": (5.3800, -3.8500),
    "AKOUEDO": (5.3660, -3.9100),
    "ANANI": (5.2700, -3.9500),
    "ADJOUFFOU": (5.2600, -3.9400),
    "GONZAQ": (5.2600, -3.9400),
    "GONZAQUEVILLE": (5.2600, -3.9400),
    "RIVIERA": (5.3800, -3.9500),
    "ANGRE": (5.3900, -3.9700),
    "II PLATEAUX": (5.3700, -3.9800),
    "II PLATEAUX ET ANGRE": (5.3800, -3.9750),
    "PALMERAIE EXTENSION": (5.3850, -3.9250),
    "ABOBODOUME": (5.3400, -4.0700),
    "LOCODJORO": (5.3350, -4.0650),
    "WILLIAMSVILLE": (5.3550, -4.0300),
    "VRIDI": (5.2500, -3.9800),
    "PK23": (5.4400, -4.1300),
    "ALEPE": (5.5000, -3.6600),
    "MONTEZO": (5.5000, -3.7000),
    "BROFODOUME": (5.5000, -4.1000),

    # Grandes villes intérieur
    "ABENGOUROU": (6.7300, -3.4900),
    "ABOISSO": (5.4700, -3.2050),
    "ADIAKE": (5.2900, -3.3050),
    "ADZOPE": (6.1050, -3.8600),
    "AGBOVILLE": (5.9250, -4.2150),
    "AGNIBILEKROU": (7.1300, -3.2050),
    "AKOUPE": (6.3900, -3.8850),
    "ALLOKOI PK23": (5.4400, -4.1300),
    "BONDOUKOU": (8.0400, -2.8000),
    "BONOUA": (5.2700, -3.5950),
    "BOUAFLE": (6.9800, -5.7500),
    "BOUAKE": (7.6900, -5.0300),
    "DABOU": (5.3230, -4.3770),
    "DALOA": (6.8770, -6.4500),
    "DANANE": (7.2600, -8.1550),
    "DIEGONEFLA": (6.1900, -5.4400),
    "DIMBOKRO": (6.6440, -4.7080),
    "DIVO": (5.8380, -5.3570),
    "DUEKOUE": (6.7420, -7.3480),
    "FERKESSEDOUGOU": (9.5920, -5.1970),
    "GAGNOA": (6.1330, -5.9500),
    "GRAND-BASSAM": (5.2000, -3.7300),
    "GRAND-BEREBY": (4.6300, -6.9200),
    "GUIGLO": (6.5470, -7.4900),
    "ISSIA": (6.4900, -6.5850),
    "KATIOLA": (8.1350, -5.1000),
    "KORHOGO": (9.4580, -5.6290),
    "LAKOTA": (5.8500, -5.6800),
    "MAN": (7.4100, -7.5540),
    "ODIENNE": (9.5030, -7.5640),
    "SAN-PEDRO": (4.7480, -6.6360),
    "SASSANDRA": (4.9500, -6.0800),
    "SINFRA": (6.6100, -5.9200),
    "SOUBRE": (5.7830, -6.6000),
    "TABOU": (4.4230, -7.3520),
    "TIASSALE": (5.8980, -4.8280),
    "TOUMODI": (6.5560, -5.0170),
    "VAVOUA": (7.3800, -6.4780),
    "YAMOUSSOUKRO": (6.8200, -5.2740),
}

# Coordonnées par défaut = centre d'Abidjan
DEFAULT_COORDS = (5.3599, -4.0083)


def _norm(s: str) -> str:
    """Normalise (accents supprimés, upper, trim)."""
    if not s:
        return ""
    s = s.strip().upper()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _coords_for_commune(commune: str) -> Tuple[float, float]:
    """Retourne les coordonnées lat/lon du centre d'une commune/ville."""
    key = _norm(commune)
    if key in COMMUNE_COORDINATES:
        return COMMUNE_COORDINATES[key]
    # Recherche partielle (ex : "PORT-BOUET / VRIDI" → "PORT-BOUET")
    for k, v in COMMUNE_COORDINATES.items():
        if k in key or key in k:
            return v
    return DEFAULT_COORDS


def _extract_phones(contact: str) -> List[str]:
    """Extrait les numéros de téléphone depuis 'M. DUPONT - TEL. 07 12 34 56 78'."""
    if not contact:
        return []
    # Cherche les patterns 8 à 12 chiffres avec espaces
    digits = re.findall(r"(?:\+?225\s?)?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}", contact)
    phones: List[str] = []
    for d in digits:
        clean = re.sub(r"[^\d+]", "", d)
        if clean.startswith("225") and len(clean) >= 10:
            clean = "+" + clean
        elif not clean.startswith("+") and len(clean) == 10:
            clean = "+225" + clean
        elif not clean.startswith("+") and len(clean) == 8:
            clean = "+225" + clean
        if clean not in phones:
            phones.append(clean)
    return phones


def _extract_responsable(contact: str) -> str:
    """Extrait le nom du responsable (avant '- TEL' ou '. TEL')."""
    if not contact:
        return ""
    # Sépare sur "TEL", "- Tel", etc.
    parts = re.split(r"\s*-?\s*T[EÉ]L\.?\s*", contact, flags=re.IGNORECASE)
    if parts:
        return parts[0].strip(" -.")
    return contact.strip()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dLat = radians(lat2 - lat1)
    dLon = radians(lon2 - lon1)
    a = sin(dLat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon / 2) ** 2
    return round(2 * R * asin(sqrt(a)), 2)


def register_pharmacies_garde_routes(app, api, db, get_current_user, require_roles_fn):
    """Enregistre les routes /api/pharmacies/garde/*"""

    @api.get("/pharmacies/garde")
    async def list_pharmacies_garde(
        zone: Optional[str] = Query(None, description="'abidjan' | 'interieur' | None (toutes)"),
        commune: Optional[str] = Query(None, description="Filtre par commune/ville"),
        q: Optional[str] = Query(None, description="Recherche libre (nom pharmacie / commune)"),
        limit: int = 500,
        offset: int = 0,
    ):
        """
        Liste des pharmacies de garde de la semaine courante.
        Accessible SANS auth (annuaire public).
        """
        query: Dict[str, Any] = {}
        if zone in ("abidjan", "interieur"):
            query["zone"] = zone
        if commune:
            # Recherche partielle (ex : "cocody" → matche "COCODY - RIVIERA" et "COCODY II PLATEAUX")
            query["commune_norm"] = {"$regex": _norm(commune), "$options": "i"}

        cursor = db.pharmacies_garde.find(query, {"_id": 0}).skip(max(0, offset)).limit(min(limit, 1000))
        items = await cursor.to_list(min(limit, 1000))

        if q:
            qn = _norm(q)
            items = [p for p in items if
                     qn in _norm(p.get("nom", "")) or
                     qn in _norm(p.get("commune", "")) or
                     qn in _norm(p.get("responsable", ""))]

        # Récupère la période
        meta = await db.pharmacies_garde_meta.find_one({"key": "current"}, {"_id": 0}) or {}

        total = await db.pharmacies_garde.count_documents(query)
        return {
            "count": len(items),
            "total": total,
            "items": items,
            "periode": meta.get("periode"),
            "periode_debut": meta.get("periode_debut"),
            "periode_fin": meta.get("periode_fin"),
            "last_updated": meta.get("last_updated"),
            "source": meta.get("source", "https://www.pharmacies-de-garde.ci"),
        }

    @api.get("/pharmacies/garde/nearby")
    async def nearby_pharmacies_garde(
        lat: float = Query(..., description="Latitude"),
        lon: float = Query(..., description="Longitude"),
        radius_km: float = Query(10.0, ge=0.5, le=200.0),
        limit: int = 50,
    ):
        """Pharmacies de garde à proximité d'une position GPS."""
        cursor = db.pharmacies_garde.find({}, {"_id": 0})
        items = await cursor.to_list(2000)
        near = []
        for p in items:
            if p.get("lat") is None or p.get("lon") is None:
                continue
            d = _haversine_km(lat, lon, p["lat"], p["lon"])
            if d <= radius_km:
                p2 = dict(p)
                p2["distance_km"] = d
                # Estimation temps voiture : 30 km/h moyen en ville
                p2["travel_min_car"] = round((d / 30.0) * 60)
                near.append(p2)
        near.sort(key=lambda x: x["distance_km"])
        meta = await db.pharmacies_garde_meta.find_one({"key": "current"}, {"_id": 0}) or {}
        return {
            "count": len(near[:limit]),
            "items": near[:limit],
            "periode": meta.get("periode"),
            "periode_debut": meta.get("periode_debut"),
            "periode_fin": meta.get("periode_fin"),
        }

    @api.get("/pharmacies/garde/current-week")
    async def current_week_info():
        """Métadonnées de la semaine en cours (période, dernière mise à jour)."""
        meta = await db.pharmacies_garde_meta.find_one({"key": "current"}, {"_id": 0}) or {}
        count_abj = await db.pharmacies_garde.count_documents({"zone": "abidjan"})
        count_int = await db.pharmacies_garde.count_documents({"zone": "interieur"})
        communes_abj = await db.pharmacies_garde.distinct("commune", {"zone": "abidjan"})
        communes_int = await db.pharmacies_garde.distinct("commune", {"zone": "interieur"})
        return {
            "periode": meta.get("periode"),
            "periode_debut": meta.get("periode_debut"),
            "periode_fin": meta.get("periode_fin"),
            "last_updated": meta.get("last_updated"),
            "source": meta.get("source", "https://www.pharmacies-de-garde.ci"),
            "total_abidjan": count_abj,
            "total_interieur": count_int,
            "total": count_abj + count_int,
            "communes_abidjan": sorted([c for c in communes_abj if c]),
            "villes_interieur": sorted([v for v in communes_int if v]),
        }

    @api.get("/pharmacies/garde/{id}")
    async def get_pharmacie(id: str):
        """Fiche détaillée d'une pharmacie de garde."""
        item = await db.pharmacies_garde.find_one({"id": id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Pharmacie non trouvée")
        return item

    @api.post("/pharmacies/garde/refresh")
    async def refresh_pharmacies_garde(user=Depends(get_current_user)):
        """
        Force le refresh de la liste depuis la source officielle.
        ADMIN ONLY.
        """
        if user.get("role") not in ("admin", "super_admin") and not user.get("is_super_admin"):
            raise HTTPException(status_code=403, detail="Réservé aux administrateurs")

        try:
            # Import lazy pour éviter les cycles
            from scrape_pharmacies_garde import scrape_and_persist
            result = await scrape_and_persist(db)
            return {
                "ok": True,
                "message": "Liste mise à jour depuis la source officielle",
                **result,
            }
        except Exception as e:
            logger.error(f"Refresh pharmacies_garde failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Erreur scraping : {str(e)}")

    @api.get("/admin/pharmacies/garde/history")
    async def admin_pharmacies_history(user=Depends(get_current_user), limit: int = 20):
        """Historique des scrapes (audit) — ADMIN ONLY."""
        if user.get("role") not in ("admin", "super_admin") and not user.get("is_super_admin"):
            raise HTTPException(status_code=403, detail="Réservé aux administrateurs")
        cursor = db.pharmacies_garde_history.find({}, {"_id": 0}).sort("scraped_at", -1).limit(min(limit, 50))
        items = await cursor.to_list(min(limit, 50))
        return {"count": len(items), "items": items}

    # ─────────────────────────────────────────────────────────────
    # Historique utilisateur — pharmacies consultées / appelées
    # ─────────────────────────────────────────────────────────────
    @api.post("/pharmacies/garde/{id}/track")
    async def track_pharmacy_view(id: str, action: str = "view", user=Depends(get_current_user)):
        """
        Enregistre une consultation de pharmacie par l'utilisateur.
        action : "view" (ouverture fiche), "call" (bouton appeler), "directions" (itinéraire)
        """
        if action not in ("view", "call", "directions"):
            raise HTTPException(status_code=400, detail="Action invalide")
        item = await db.pharmacies_garde.find_one({"id": id}, {"_id": 0, "id": 1, "nom": 1, "commune": 1, "zone": 1, "telephone_primary": 1, "lat": 1, "lon": 1})
        if not item:
            raise HTTPException(status_code=404, detail="Pharmacie non trouvée")
        entry = {
            "user_id": user["id"],
            "pharmacie_id": id,
            "action": action,
            "at": datetime.now(timezone.utc).isoformat(),
            "snapshot": item,  # snapshot au moment de l'action (résilient si retirée plus tard)
        }
        await db.pharmacies_garde_user_history.insert_one(entry)
        # Cap : garder les 100 dernières par user
        count = await db.pharmacies_garde_user_history.count_documents({"user_id": user["id"]})
        if count > 100:
            to_delete = await db.pharmacies_garde_user_history.find({"user_id": user["id"]}, {"_id": 1}).sort("at", 1).to_list(count - 100)
            for d in to_delete:
                await db.pharmacies_garde_user_history.delete_one({"_id": d["_id"]})
        return {"ok": True}

    @api.get("/pharmacies/garde/me/history")
    async def my_pharmacies_history(user=Depends(get_current_user), limit: int = 30):
        """Historique personnel des pharmacies consultées."""
        cursor = db.pharmacies_garde_user_history.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("at", -1).limit(min(limit, 100))
        items = await cursor.to_list(min(limit, 100))
        # Dédupliquer par pharmacie_id (garder le plus récent)
        seen = set()
        unique = []
        for it in items:
            pid = it.get("pharmacie_id")
            if pid not in seen:
                seen.add(pid)
                unique.append(it)
        return {"count": len(unique), "items": unique}

    logger.info("✅ Router pharmacies_garde enregistré")
