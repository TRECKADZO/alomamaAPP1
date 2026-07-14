"""
Router — Annuaire des établissements sanitaires privés autorisés (E-DEPPS MSP CI).
Phase 1 MVP : liste + recherche + filtres. Prêt pour import CSV complet (657 lignes).
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pathlib import Path
from fastapi import Depends, HTTPException
from pydantic import BaseModel
import json, unicodedata

ROOT = Path(__file__).resolve().parent.parent
_DATASET_CACHE: Dict[str, Any] = {}


def _load_dataset() -> Dict[str, Any]:
    global _DATASET_CACHE
    if _DATASET_CACHE:
        return _DATASET_CACHE
    # Charger le fichier fusionné complet (PDF + Excel officiels)
    for filename in ("etablissements_ci_full.json", "etablissements_ci.json"):
        try:
            with open(ROOT / "data" / filename, "r", encoding="utf-8") as f:
                _DATASET_CACHE = json.load(f)
                if _DATASET_CACHE.get("etablissements"):
                    break
        except Exception:
            continue
    if not _DATASET_CACHE:
        _DATASET_CACHE = {"meta": {}, "specialites_metier": {}, "etablissements": []}
    return _DATASET_CACHE


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


class SeedResponse(BaseModel):
    ok: bool
    inserted: int
    skipped: int


def register_etablissements_routes(app, api, db, get_current_user, require_roles_fn):

    async def _seed_if_empty():
        """Seed la collection au 1er démarrage."""
        count = await db.etablissements_officiels.count_documents({})
        if count > 0:
            return {"already_seeded": True, "count": count}
        data = _load_dataset()
        docs = []
        for i, e in enumerate(data.get("etablissements", [])):
            docs.append({
                "id": f"esp_{i+1:04d}",
                **e,
                "source": "E-DEPPS MSP CI",
                "verified": True,
                "created_at": datetime.utcnow().isoformat(),
            })
        if docs:
            await db.etablissements_officiels.insert_many(docs)
        return {"already_seeded": False, "inserted": len(docs)}

    @api.get("/etablissements")
    async def list_etablissements(
        q: Optional[str] = None,
        region: Optional[str] = None,
        commune: Optional[str] = None,
        categorie: Optional[str] = None,
        specialite: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ):
        """
        Liste des établissements officiels autorisés E-DEPPS.
        Filtres : recherche libre (q), région, commune, catégorie, spécialité métier.
        Accessible SANS auth (annuaire public).
        """
        await _seed_if_empty()

        query: Dict[str, Any] = {}
        if region: query["region"] = {"$regex": f"^{region}$", "$options": "i"}
        if commune: query["commune"] = {"$regex": commune, "$options": "i"}
        if categorie: query["categorie"] = {"$regex": categorie, "$options": "i"}
        if specialite: query["specialites_metier"] = specialite

        cursor = db.etablissements_officiels.find(query, {"_id": 0}).skip(max(0, offset)).limit(min(limit, 500))
        items = await cursor.to_list(min(limit, 500))

        if q:
            qn = _norm(q)
            items = [e for e in items if
                     qn in _norm(e.get("nom", "")) or
                     qn in _norm(e.get("adresse", "")) or
                     qn in _norm(e.get("commune", "")) or
                     qn in _norm(e.get("responsable", ""))]

        total = await db.etablissements_officiels.count_documents(query)
        return {"count": len(items), "total": total, "items": items}

    @api.get("/etablissements/meta")
    async def etablissements_meta():
        """Métadonnées + liste des régions/communes/catégories/spécialités disponibles."""
        await _seed_if_empty()
        regions = await db.etablissements_officiels.distinct("region")
        communes = await db.etablissements_officiels.distinct("commune")
        categories = await db.etablissements_officiels.distinct("categorie")
        data = _load_dataset()
        return {
            "total": await db.etablissements_officiels.count_documents({}),
            "regions": sorted([r for r in regions if r]),
            "communes": sorted([c for c in communes if c]),
            "categories": sorted([c for c in categories if c]),
            "specialites_metier": data.get("specialites_metier", {}),
            "source": "Ministère de la Santé Côte d'Ivoire · E-DEPPS Juin 2026",
        }

    @api.get("/etablissements/{id}")
    async def get_etablissement(id: str):
        """Détail d'un établissement."""
        e = await db.etablissements_officiels.find_one({"id": id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Établissement introuvable")
        return e

    class ImportBatchIn(BaseModel):
        etablissements: List[Dict[str, Any]]
        replace: bool = False

    @api.post("/admin/etablissements/import")
    async def admin_import(payload: ImportBatchIn, user=Depends(require_roles_fn("super_admin"))):
        """
        Import CSV/JSON en masse (super_admin uniquement).
        Utilisé pour charger les 657 établissements officiels depuis un CSV nettoyé.
        """
        if payload.replace:
            await db.etablissements_officiels.delete_many({})
        docs = []
        for i, e in enumerate(payload.etablissements):
            if not e.get("nom") or not e.get("commune"):
                continue
            docs.append({
                "id": e.get("id") or f"esp_{i+1:04d}",
                "nom": e.get("nom"),
                "categorie": e.get("categorie", "Non classifié"),
                "region": e.get("region", ""),
                "district_sanitaire": e.get("district_sanitaire", ""),
                "commune": e.get("commune", ""),
                "adresse": e.get("adresse", ""),
                "date_autorisation": e.get("date_autorisation", ""),
                "specialites_metier": e.get("specialites_metier", []),
                "responsable": e.get("responsable", ""),
                "source": "E-DEPPS MSP CI",
                "verified": True,
                "imported_at": datetime.utcnow().isoformat(),
                "imported_by": user["id"],
            })
        if not docs:
            return {"ok": False, "inserted": 0, "error": "Aucun établissement valide"}
        await db.etablissements_officiels.insert_many(docs)
        return {"ok": True, "inserted": len(docs), "replaced": payload.replace}

    async def _log_orientation(user, context, level_or_type, commune, items):
        """Enregistre l'orientation dans orient_logs (pour analytics UNICEF/Ministère)."""
        try:
            await db.orient_logs.insert_one({
                "user_id": user.get("id"),
                "user_role": user.get("role"),
                "context": context,  # 'tnd' | 'postpartum'
                "level": level_or_type,
                "commune": commune or "",
                "user_ville": (user.get("ville") or ""),
                "user_region": (user.get("region") or ""),
                "items_shown": len(items or []),
                "specialites_targetees": list({sp for e in (items or []) for sp in (e.get("specialites_metier") or [])}),
                "regions_touchees": list({e.get("region") for e in (items or []) if e.get("region")}),
                "communes_touchees": list({e.get("commune") for e in (items or []) if e.get("commune")}),
                "created_at": datetime.utcnow().isoformat(),
            })
        except Exception:
            pass  # ne bloque jamais la réponse principale

    @api.get("/etablissements/orient/tnd/{level}")
    async def orient_tnd(level: str, commune: Optional[str] = None, limit: int = 5, user=Depends(get_current_user)):
        """
        Orientation automatique après dépistage TND.
        Suggère les établissements pédiatriques les plus proches.
        Enregistre l'orientation dans orient_logs (pour analytics).
        """
        await _seed_if_empty()
        q: Dict[str, Any] = {"specialites_metier": "Pédiatrie"}
        if level == "high_risk":
            # Prioriser les cliniques et centres médicaux (plateau technique)
            q["categorie"] = {"$in": ["Clinique Médicale", "Centre Médical", "Centre Médical Spécialisé en Psychiatrie"]}
        if commune:
            q["commune"] = {"$regex": commune, "$options": "i"}
        items = await db.etablissements_officiels.find(q, {"_id": 0}).limit(limit).to_list(limit)
        # Fallback : élargir à toute la région si aucun dans la commune
        if not items and commune:
            items = await db.etablissements_officiels.find(
                {"specialites_metier": "Pédiatrie"}, {"_id": 0}
            ).limit(limit).to_list(limit)
        await _log_orientation(user, "tnd", level, commune, items)
        return {"count": len(items), "level": level, "items": items}

    @api.get("/etablissements/orient/postpartum/{alert_type}")
    async def orient_postpartum(alert_type: str, commune: Optional[str] = None, limit: int = 5, user=Depends(get_current_user)):
        """
        Orientation automatique après alerte post-partum.
        - alert_type=depression → Psychiatrie + Maternité
        - alert_type=medical → Maternité + Clinique
        Enregistre l'orientation dans orient_logs (pour analytics).
        """
        await _seed_if_empty()
        if alert_type == "depression":
            q: Dict[str, Any] = {"specialites_metier": {"$in": ["Psychiatrie", "Maternité"]}}
        else:
            q = {"specialites_metier": "Maternité"}
        if commune:
            q["commune"] = {"$regex": commune, "$options": "i"}
        items = await db.etablissements_officiels.find(q, {"_id": 0}).limit(limit).to_list(limit)
        if not items and commune:
            del q["commune"]
            items = await db.etablissements_officiels.find(q, {"_id": 0}).limit(limit).to_list(limit)
        await _log_orientation(user, "postpartum", alert_type, commune, items)
        return {"count": len(items), "alert_type": alert_type, "items": items}

    @api.get("/admin/etablissements/stats")
    async def admin_stats(user=Depends(require_roles_fn("admin", "super_admin"))):
        """Statistiques pour dashboard admin + rapports UNICEF/Ministère."""
        await _seed_if_empty()
        total = await db.etablissements_officiels.count_documents({})
        by_region: Dict[str, int] = {}
        by_category: Dict[str, int] = {}
        async for d in db.etablissements_officiels.aggregate([{"$group": {"_id": "$region", "count": {"$sum": 1}}}]):
            by_region[d["_id"] or "?"] = d["count"]
        async for d in db.etablissements_officiels.aggregate([{"$group": {"_id": "$categorie", "count": {"$sum": 1}}}]):
            by_category[d["_id"] or "?"] = d["count"]
        maternite_count = await db.etablissements_officiels.count_documents({"specialites_metier": "Maternité"})
        pediatrie_count = await db.etablissements_officiels.count_documents({"specialites_metier": "Pédiatrie"})
        return {
            "total": total,
            "by_region": by_region,
            "by_category": by_category,
            "maternal_health_coverage": {
                "maternite": maternite_count,
                "pediatrie": pediatrie_count,
                "total_relevant": maternite_count + pediatrie_count,
            },
        }

    @api.post("/etablissements/{id}/geocode")
    async def geocode_etablissement(id: str, user=Depends(get_current_user)):
        """
        Géolocalise un établissement via Nominatim (OpenStreetMap gratuit).
        Utilise adresse + commune + Côte d'Ivoire comme requête.
        Résultat mis en cache dans le doc.
        """
        e = await db.etablissements_officiels.find_one({"id": id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Établissement introuvable")
        if e.get("lat") and e.get("lon"):
            return e  # déjà géocodé
        import httpx as _httpx
        from urllib.parse import quote
        parts = [e.get("adresse"), e.get("commune"), e.get("region"), "Côte d'Ivoire"]
        query = ", ".join([p for p in parts if p])
        base = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "AloMaman/1.0 (sante maternelle CI)", "Accept": "application/json"}
        try:
            async with _httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                # Encoder manuellement pour supporter les accents
                url = f"{base}?q={quote(query)}&format=json&limit=1&countrycodes=ci"
                r = await client.get(url)
                data = r.json() if r.status_code == 200 else []
                if not data:
                    q2 = ", ".join([p for p in [e.get("commune"), e.get("region"), "Côte d'Ivoire"] if p])
                    url2 = f"{base}?q={quote(q2)}&format=json&limit=1&countrycodes=ci"
                    r2 = await client.get(url2)
                    data = r2.json() if r2.status_code == 200 else []
                if not data:
                    raise HTTPException(404, f"Coordonnées introuvables pour: {query[:80]}")
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                display = data[0].get("display_name", "")
        except HTTPException:
            raise
        except Exception as ex:
            raise HTTPException(502, f"Nominatim indisponible: {str(ex)[:100]}")
        # Sauvegarde
        await db.etablissements_officiels.update_one(
            {"id": id},
            {"$set": {"lat": lat, "lon": lon, "geocoded_display": display, "geocoded_at": datetime.utcnow().isoformat()}},
        )
        e["lat"] = lat
        e["lon"] = lon
        e["geocoded_display"] = display
        return e

    return {"registered": [
        "/etablissements", "/etablissements/meta", "/etablissements/{id}",
        "/etablissements/orient/tnd/{level}", "/etablissements/orient/postpartum/{type}",
        "/etablissements/{id}/geocode",
        "/admin/etablissements/import", "/admin/etablissements/stats",
        "/etablissements/{id}/claim", "/etablissements/claims",
    ]}


def register_pro_claim_routes(app, api, db, get_current_user, require_roles_fn):
    """
    Phase 4 — Espace Pro self-service : réclamation d'un établissement + vérification croisée.
    Un professionnel de santé peut demander à devenir "gestionnaire" d'un établissement listé.
    L'admin valide/rejette après vérification croisée (identifiants MSP, diplôme, etc.).
    """
    from pydantic import BaseModel
    from typing import Optional
    from uuid import uuid4

    class ClaimIn(BaseModel):
        etablissement_id: str
        nom_complet: str
        specialite: str
        numero_ordre: str  # Numéro Ordre National (Médecins, Sages-femmes, etc.)
        piece_identite: Optional[str] = None  # base64 (facultatif)
        justificatif_exercice: Optional[str] = None  # base64
        message: Optional[str] = ""

    @api.post("/etablissements/{id}/claim")
    async def claim_establishment(id: str, payload: ClaimIn, user=Depends(get_current_user)):
        """Un pro demande à devenir gestionnaire d'un établissement autorisé."""
        # Vérifier que l'établissement existe
        e = await db.etablissements_officiels.find_one({"id": id}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Établissement introuvable")
        # Vérifier qu'aucune réclamation n'existe déjà de ce user pour cet établissement
        existing = await db.pro_claims.find_one({"etablissement_id": id, "user_id": user["id"], "status": {"$ne": "rejected"}})
        if existing:
            raise HTTPException(400, "Une réclamation existe déjà pour cet établissement")
        # Vérification croisée automatique : nom de l'établissement contient-il le nom du pro ?
        # (Certains centres portent le nom du fondateur — auto-approbation possible)
        cross_check_score = 0
        if payload.nom_complet.upper() in e.get("nom", "").upper():
            cross_check_score += 40
        if e.get("responsable") and payload.nom_complet.upper() in e["responsable"].upper():
            cross_check_score += 50
        # Numéro d'ordre respectant le format CI (ex. CI-MED-XXXX, CI-SF-XXXX)
        import re as _re
        if _re.match(r"^CI-(MED|SF|IDE|PHA|DENT)-\d{4,6}$", payload.numero_ordre.upper()):
            cross_check_score += 30

        claim = {
            "id": str(uuid4()),
            "etablissement_id": id,
            "etablissement_nom": e["nom"],
            "user_id": user["id"],
            "user_email": user.get("email"),
            "nom_complet": payload.nom_complet,
            "specialite": payload.specialite,
            "numero_ordre": payload.numero_ordre,
            "piece_identite": payload.piece_identite,
            "justificatif_exercice": payload.justificatif_exercice,
            "message": (payload.message or "")[:1000],
            "cross_check_score": cross_check_score,
            "status": "auto_approved" if cross_check_score >= 70 else "pending",
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.pro_claims.insert_one(claim)

        # Si auto-approuvé, mettre à jour le doc établissement
        if claim["status"] == "auto_approved":
            await db.etablissements_officiels.update_one(
                {"id": id},
                {"$addToSet": {"gestionnaires": user["id"]}, "$set": {"has_pro_manager": True}},
            )

        claim.pop("_id", None)
        claim.pop("piece_identite", None)
        claim.pop("justificatif_exercice", None)
        return {
            "ok": True,
            "status": claim["status"],
            "cross_check_score": cross_check_score,
            "message": (
                "✅ Auto-approuvé grâce à la vérification croisée (score >= 70)"
                if claim["status"] == "auto_approved"
                else "🕒 En attente de validation admin. Réponse sous 48-72h."
            ),
            "claim_id": claim["id"],
        }

    @api.get("/etablissements/claims/me")
    async def my_claims(user=Depends(get_current_user)):
        """Mes réclamations d'établissements."""
        items = await db.pro_claims.find(
            {"user_id": user["id"]},
            {"_id": 0, "piece_identite": 0, "justificatif_exercice": 0},
        ).sort("created_at", -1).to_list(20)
        return {"count": len(items), "claims": items}

    @api.get("/admin/pro_claims")
    async def admin_list_claims(
        status: Optional[str] = None,
        user=Depends(require_roles_fn("admin", "super_admin")),
    ):
        """Liste des réclamations pro (admin)."""
        q = {}
        if status: q["status"] = status
        items = await db.pro_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"count": len(items), "claims": items}

    class ClaimReviewIn(BaseModel):
        decision: str  # "approve" | "reject"
        admin_note: Optional[str] = ""

    @api.post("/admin/pro_claims/{claim_id}/review")
    async def admin_review_claim(
        claim_id: str,
        payload: ClaimReviewIn,
        user=Depends(require_roles_fn("admin", "super_admin")),
    ):
        """Admin valide ou rejette une réclamation."""
        claim = await db.pro_claims.find_one({"id": claim_id})
        if not claim:
            raise HTTPException(404, "Réclamation introuvable")
        new_status = "approved" if payload.decision == "approve" else "rejected"
        await db.pro_claims.update_one(
            {"id": claim_id},
            {"$set": {
                "status": new_status,
                "admin_note": (payload.admin_note or "")[:500],
                "reviewed_by": user["id"],
                "reviewed_at": datetime.utcnow().isoformat(),
            }},
        )
        if new_status == "approved":
            await db.etablissements_officiels.update_one(
                {"id": claim["etablissement_id"]},
                {"$addToSet": {"gestionnaires": claim["user_id"]}, "$set": {"has_pro_manager": True}},
            )
        return {"ok": True, "status": new_status}
