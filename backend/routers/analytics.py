"""
Router Analytics UNICEF/Ministère (Phase 5 « Trouver un Pro »).

Fournit un tableau de bord stratégique pour :
- Mesurer la couverture santé maternelle par région
- Détecter les déserts médicaux (communes avec mamans mais sans maternité)
- Suivre l'impact réel de l'app (orientations effectuées)
- Fournir un export CSV pour partenaires B2B

Endpoints (admin only) :
  GET /api/admin/analytics/etablissements?period=30d|90d|all
  GET /api/admin/analytics/etablissements/export.csv?period=all
"""
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.responses import Response
import csv
import io


def register_analytics_routes(app, api, db, require_roles_fn):

    def _period_start(period: str) -> Optional[datetime]:
        """Convertit '1d' / '7d' / '30d' / '90d' / 'all' en datetime UTC de départ."""
        now = datetime.now(timezone.utc)
        return {
            "1d": now - timedelta(days=1),
            "7d": now - timedelta(days=7),
            "30d": now - timedelta(days=30),
            "90d": now - timedelta(days=90),
        }.get(period)

    async def _compute_analytics(period: str = "30d"):
        """Agrège les KPIs Phase 5."""
        etabs = db.etablissements_officiels
        users = db.users
        claims = db.pro_claims
        logs = db.orient_logs

        # --- 1) Couverture globale
        total_etabs = await etabs.count_documents({})
        geocoded = await etabs.count_documents({"lat": {"$exists": True, "$ne": None}})
        maternite_count = await etabs.count_documents({"specialites_metier": "Maternité"})
        pediatrie_count = await etabs.count_documents({"specialites_metier": "Pédiatrie"})
        psychiatrie_count = await etabs.count_documents({"specialites_metier": "Psychiatrie"})

        # --- 2) Par région (top toutes régions)
        by_region_pipeline = [
            {"$group": {
                "_id": "$region",
                "total": {"$sum": 1},
                "maternite": {"$sum": {"$cond": [{"$in": ["Maternité", {"$ifNull": ["$specialites_metier", []]}]}, 1, 0]}},
                "pediatrie": {"$sum": {"$cond": [{"$in": ["Pédiatrie", {"$ifNull": ["$specialites_metier", []]}]}, 1, 0]}},
                "psychiatrie": {"$sum": {"$cond": [{"$in": ["Psychiatrie", {"$ifNull": ["$specialites_metier", []]}]}, 1, 0]}},
                "geocoded": {"$sum": {"$cond": [{"$ne": ["$lat", None]}, 1, 0]}},
            }},
            {"$sort": {"total": -1}},
        ]
        by_region = []
        async for r in etabs.aggregate(by_region_pipeline):
            reg = r["_id"]
            if not reg or reg in ("?", "De"):  # filtrer les valeurs parasites
                continue
            by_region.append({
                "region": reg,
                "total": r["total"],
                "maternite": r.get("maternite", 0),
                "pediatrie": r.get("pediatrie", 0),
                "psychiatrie": r.get("psychiatrie", 0),
                "geocoded": r.get("geocoded", 0),
            })

        # --- 3) Par commune (heatmap top 30 pour focus visuel)
        by_commune_pipeline = [
            {"$match": {"commune": {"$ne": ""}}},
            {"$group": {
                "_id": "$commune",
                "total": {"$sum": 1},
                "maternite": {"$sum": {"$cond": [{"$in": ["Maternité", {"$ifNull": ["$specialites_metier", []]}]}, 1, 0]}},
                "pediatrie": {"$sum": {"$cond": [{"$in": ["Pédiatrie", {"$ifNull": ["$specialites_metier", []]}]}, 1, 0]}},
            }},
            {"$sort": {"total": -1}},
            {"$limit": 30},
        ]
        by_commune = []
        async for r in etabs.aggregate(by_commune_pipeline):
            by_commune.append({
                "commune": r["_id"] or "?",
                "total": r["total"],
                "maternite": r.get("maternite", 0),
                "pediatrie": r.get("pediatrie", 0),
            })

        # --- 4) Utilisateurs mamans par ville (heatmap demande)
        mamans_by_ville = {}
        async for u in users.find(
            {"role": "maman", "ville": {"$exists": True, "$ne": None}},
            {"ville": 1, "_id": 0},
        ):
            v = (u.get("ville") or "").strip()
            if v:
                mamans_by_ville[v] = mamans_by_ville.get(v, 0) + 1

        # --- 5) Déserts médicaux : commune avec ≥3 mamans MAIS 0 maternité
        # (croiser mamans_by_ville avec les maternités par commune)
        maternite_communes = set()
        async for e in etabs.find({"specialites_metier": "Maternité", "commune": {"$ne": ""}}, {"commune": 1, "_id": 0}):
            maternite_communes.add((e.get("commune") or "").strip().lower())

        deserts = []
        for ville, count in mamans_by_ville.items():
            if count >= 3 and ville.strip().lower() not in maternite_communes:
                deserts.append({"commune": ville, "mamans": count, "maternite": 0})
        deserts.sort(key=lambda x: -x["mamans"])

        # --- 6) Régions sous-dotées (<2 maternités)
        underserved_regions = [r for r in by_region if r["maternite"] < 2 and r["total"] > 0]

        # --- 7) Orientations effectuées (période)
        period_start = _period_start(period)
        orient_filter = {}
        if period_start is not None:
            orient_filter["created_at"] = {"$gte": period_start.isoformat()}

        total_orientations = await logs.count_documents(orient_filter)
        orient_tnd = await logs.count_documents({**orient_filter, "context": "tnd"})
        orient_postpartum = await logs.count_documents({**orient_filter, "context": "postpartum"})

        # Orientations par région (touchées)
        orient_by_region_pipeline = [
            {"$match": orient_filter} if orient_filter else {"$match": {}},
            {"$unwind": "$regions_touchees"},
            {"$group": {"_id": "$regions_touchees", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        orient_by_region = []
        async for r in logs.aggregate(orient_by_region_pipeline):
            if r["_id"]:
                orient_by_region.append({"region": r["_id"], "count": r["count"]})

        # Orientations TND vs Postpartum par niveau
        orient_by_level_pipeline = [
            {"$match": orient_filter} if orient_filter else {"$match": {}},
            {"$group": {"_id": {"context": "$context", "level": "$level"}, "count": {"$sum": 1}}},
        ]
        orient_by_level = []
        async for r in logs.aggregate(orient_by_level_pipeline):
            orient_by_level.append({
                "context": r["_id"].get("context") or "?",
                "level": r["_id"].get("level") or "?",
                "count": r["count"],
            })

        # --- 8) Claims pro par statut
        claims_by_status = {}
        async for r in claims.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]):
            claims_by_status[r["_id"] or "?"] = r["count"]

        total_claims = await claims.count_documents({})

        # --- 9) Impact / résumé
        total_mamans = await users.count_documents({"role": "maman"})
        total_pros = await users.count_documents({"role": "professionnel"})
        total_centres = await users.count_documents({"role": "centre_sante"})

        return {
            "period": period,
            "period_start": period_start.isoformat() if period_start else None,
            "generated_at": datetime.now(timezone.utc).isoformat(),

            "coverage": {
                "total_etablissements": total_etabs,
                "geocoded": geocoded,
                "geocoded_pct": round(geocoded * 100 / total_etabs, 1) if total_etabs else 0,
                "maternite": maternite_count,
                "pediatrie": pediatrie_count,
                "psychiatrie": psychiatrie_count,
                "source": "E-DEPPS MSP CI (Ministère de la Santé)",
            },

            "by_region": by_region,
            "by_commune_top30": by_commune,

            "user_demand": {
                "total_mamans": total_mamans,
                "total_pros": total_pros,
                "total_centres": total_centres,
                "mamans_by_ville_top": sorted(
                    [{"commune": k, "mamans": v} for k, v in mamans_by_ville.items()],
                    key=lambda x: -x["mamans"],
                )[:20],
            },

            "desert_medical": {
                "threshold_mamans": 3,
                "communes": deserts[:30],
                "count": len(deserts),
            },

            "underserved_regions": underserved_regions,

            "orientations": {
                "total": total_orientations,
                "tnd": orient_tnd,
                "postpartum": orient_postpartum,
                "by_region_top20": orient_by_region,
                "by_level": orient_by_level,
            },

            "pro_claims": {
                "total": total_claims,
                "by_status": claims_by_status,
            },
        }

    @api.get("/admin/analytics/etablissements")
    async def analytics_etablissements(
        period: str = "30d",
        user=Depends(require_roles_fn("admin", "super_admin")),
    ):
        """
        KPIs stratégiques Phase 5 (UNICEF/Ministère).
        period : 7d | 30d | 90d | all
        """
        if period not in ("1d", "7d", "30d", "90d", "all"):
            raise HTTPException(400, "period doit être 1d, 7d, 30d, 90d ou all")
        data = await _compute_analytics(period)
        return data

    @api.get("/admin/analytics/etablissements/export.csv")
    async def analytics_etablissements_csv(
        period: str = "all",
        user=Depends(require_roles_fn("admin", "super_admin")),
    ):
        """Export CSV pour partenaires UNICEF/Ministère."""
        data = await _compute_analytics(period)

        buf = io.StringIO()
        writer = csv.writer(buf)

        # Section 1 : Couverture globale
        writer.writerow(["=== COUVERTURE GLOBALE ==="])
        writer.writerow(["Total établissements", data["coverage"]["total_etablissements"]])
        writer.writerow(["Géocodés", data["coverage"]["geocoded"], f"{data['coverage']['geocoded_pct']}%"])
        writer.writerow(["Maternités", data["coverage"]["maternite"]])
        writer.writerow(["Pédiatries", data["coverage"]["pediatrie"]])
        writer.writerow(["Psychiatries", data["coverage"]["psychiatrie"]])
        writer.writerow(["Source", data["coverage"]["source"]])
        writer.writerow([])

        # Section 2 : Couverture par région
        writer.writerow(["=== COUVERTURE PAR REGION ==="])
        writer.writerow(["Région", "Total", "Maternité", "Pédiatrie", "Psychiatrie", "Géocodés"])
        for r in data["by_region"]:
            writer.writerow([r["region"], r["total"], r["maternite"], r["pediatrie"], r["psychiatrie"], r["geocoded"]])
        writer.writerow([])

        # Section 3 : Déserts médicaux
        writer.writerow(["=== DESERTS MEDICAUX (mamans>=3 sans maternité) ==="])
        writer.writerow(["Commune", "Nb mamans utilisatrices", "Maternités disponibles"])
        for d in data["desert_medical"]["communes"]:
            writer.writerow([d["commune"], d["mamans"], d["maternite"]])
        writer.writerow([])

        # Section 4 : Régions sous-dotées
        writer.writerow(["=== REGIONS SOUS-DOTEES (<2 maternités) ==="])
        writer.writerow(["Région", "Total établissements", "Maternités"])
        for r in data["underserved_regions"]:
            writer.writerow([r["region"], r["total"], r["maternite"]])
        writer.writerow([])

        # Section 5 : Orientations
        writer.writerow([f"=== ORIENTATIONS ({data['period']}) ==="])
        writer.writerow(["Total", data["orientations"]["total"]])
        writer.writerow(["TND (dépistages neurodev)", data["orientations"]["tnd"]])
        writer.writerow(["Post-Partum (alertes)", data["orientations"]["postpartum"]])
        writer.writerow([])
        writer.writerow(["Région touchée", "Occurrences"])
        for r in data["orientations"]["by_region_top20"]:
            writer.writerow([r["region"], r["count"]])
        writer.writerow([])

        # Section 6 : Utilisation par les mamans
        writer.writerow(["=== HEATMAP DEMANDE (mamans par commune) ==="])
        writer.writerow(["Commune", "Nb mamans"])
        for u in data["user_demand"]["mamans_by_ville_top"]:
            writer.writerow([u["commune"], u["mamans"]])
        writer.writerow([])

        # Section 7 : Claims
        writer.writerow(["=== CLAIMS PRO ==="])
        writer.writerow(["Total", data["pro_claims"]["total"]])
        for status, count in data["pro_claims"]["by_status"].items():
            writer.writerow([status, count])

        # Footer
        writer.writerow([])
        writer.writerow(["Généré le", data["generated_at"]])
        writer.writerow(["Généré par", user.get("email"), user.get("id")])
        writer.writerow(["Application", "À lo Maman", "Version 2026-Q3"])

        content = buf.getvalue()
        filename = f"alomaman_analytics_{data['period']}_{datetime.now().strftime('%Y%m%d')}.csv"
        return Response(
            content="\ufeff" + content,  # BOM UTF-8 pour Excel
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
