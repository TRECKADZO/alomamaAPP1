"""
Routes PDF — génération à la demande des rapports médicaux.
Extrait de server.py dans le cadre du refactor modulaire.
"""
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

router = APIRouter(prefix="/api", tags=["pdf"])


def register_pdf_routes(app, api, db, get_current_user, decrypt_str_fn):
    """
    Enregistre les routes PDF sur le router principal.
    Injecté depuis server.py pour éviter les imports circulaires.
    - app : instance FastAPI
    - api : APIRouter existant (celui incluant toutes les routes /api)
    - db  : instance Motor AsyncIOMotorDatabase
    - get_current_user : dependency d'auth
    - decrypt_str_fn : fonction de déchiffrement (encryption.decrypt_str)
    """
    from pdf_generator import generate_tnd_pdf, generate_postpartum_pdf

    async def _decrypt_checkin(checkin: dict) -> dict:
        """Déchiffre les champs sensibles d'un check-in post-partum."""
        out = dict(checkin)
        for encrypted_key, plain_key in [("free_text_enc", "free_text"), ("voice_url_enc", "voice_url")]:
            val = out.get(encrypted_key)
            if val:
                try:
                    out[plain_key] = decrypt_str_fn(val)
                except Exception:
                    out[plain_key] = "[déchiffrement impossible]"
        return out

    @api.get("/tnd/screening/{screening_id}/pdf")
    async def tnd_screening_pdf(screening_id: str, user=Depends(get_current_user)):
        """
        Génère le PDF du rapport M-CHAT-R d'un dépistage TND.
        Accessible : parent référent de l'enfant OU pro rattaché au centre.
        """
        screening = await db.tnd_screenings.find_one({"id": screening_id}, {"_id": 0})
        if not screening:
            raise HTTPException(404, "Dépistage TND introuvable")

        enfant = await db.enfants.find_one({"id": screening.get("enfant_id")}, {"_id": 0}) or {}
        # Contrôle d'accès
        if user["id"] not in (enfant.get("user_id"), screening.get("user_id")) and user.get("role") not in ("professionnel", "admin", "super_admin"):
            raise HTTPException(403, "Accès refusé")

        maman = await db.users.find_one({"id": enfant.get("user_id") or screening.get("user_id")}, {"_id": 0}) or {}
        followup = screening.get("follow_up")

        # Génère
        pdf_bytes = generate_tnd_pdf(screening, enfant, maman, followup)

        # Audit
        await db.audit_log.insert_one({
            "type": "pdf_export_tnd",
            "resource_id": screening_id,
            "user_id": user["id"],
            "size_bytes": len(pdf_bytes),
            "created_at": datetime.utcnow().isoformat(),
        })

        filename = f"tnd_{enfant.get('prenom', 'enfant')}_{screening_id[:8]}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @api.get("/postpartum/report/pdf")
    async def postpartum_report_pdf(user=Depends(get_current_user)):
        """
        Génère le PDF du rapport post-partum de la maman connectée.
        Chiffre AES-256 déchiffré côté serveur pour le rapport (immutable en base).
        """
        postpartum = await db.postpartum.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
        if not postpartum:
            raise HTTPException(404, "Aucun suivi post-partum actif")

        checkins_raw = await db.postpartum_checkins.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(100)
        # Déchiffre pour le rapport (usage éphémère en mémoire)
        checkins = [await _decrypt_checkin(ch) for ch in checkins_raw]

        maman = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
        enfant = None
        if postpartum.get("enfant_id"):
            enfant = await db.enfants.find_one({"id": postpartum["enfant_id"]}, {"_id": 0})

        pdf_bytes = generate_postpartum_pdf(postpartum, checkins, maman, enfant)

        await db.audit_log.insert_one({
            "type": "pdf_export_postpartum",
            "resource_id": postpartum.get("id"),
            "user_id": user["id"],
            "checkins_count": len(checkins),
            "size_bytes": len(pdf_bytes),
            "created_at": datetime.utcnow().isoformat(),
        })

        filename = f"postpartum_{maman.get('name', 'maman').replace(' ', '_')}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @api.get("/postpartum/report/{user_id}/pdf")
    async def postpartum_report_pro_pdf(user_id: str, user=Depends(get_current_user)):
        """
        Version PRO : accès au rapport post-partum d'une maman (pro uniquement, avec consentement).
        """
        if user.get("role") not in ("professionnel", "admin", "super_admin"):
            raise HTTPException(403, "Réservé aux professionnels de santé")

        postpartum = await db.postpartum.find_one({"user_id": user_id, "active": True}, {"_id": 0})
        if not postpartum:
            raise HTTPException(404, "Suivi introuvable")

        # Vérification consentement (au moins un check-in avec consent_partage_pro=True)
        has_consent = await db.postpartum_checkins.find_one(
            {"user_id": user_id, "consent_partage_pro": True}, {"_id": 1}
        )
        if not has_consent:
            raise HTTPException(403, "Consentement de la maman requis pour l'accès pro")

        checkins_raw = await db.postpartum_checkins.find(
            {"user_id": user_id, "consent_partage_pro": True}, {"_id": 0}
        ).sort("created_at", 1).to_list(100)
        checkins = [await _decrypt_checkin(ch) for ch in checkins_raw]
        maman = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
        enfant = await db.enfants.find_one({"id": postpartum.get("enfant_id")}, {"_id": 0}) if postpartum.get("enfant_id") else None

        pdf_bytes = generate_postpartum_pdf(postpartum, checkins, maman, enfant)

        await db.audit_log.insert_one({
            "type": "pdf_export_postpartum_pro",
            "resource_id": postpartum.get("id"),
            "user_id": user["id"],
            "target_user": user_id,
            "size_bytes": len(pdf_bytes),
            "created_at": datetime.utcnow().isoformat(),
        })

        filename = f"postpartum_pro_{user_id[:8]}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return {"registered": ["/tnd/screening/{id}/pdf", "/postpartum/report/pdf", "/postpartum/report/{user_id}/pdf"]}
