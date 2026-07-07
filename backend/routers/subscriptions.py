"""
Service d'abonnements — MongoDB (adapté du modèle SQLAlchemy fourni).

Gère activation, renouvellement, annulation et statut des abonnements Premium.
Collection MongoDB : `subscriptions`
  {
    id: uuid,
    user_id: str,
    plan: "monthly" | "annual" | "premium_mensuel" | "premium_annuel",
    status: "active" | "expired" | "cancelled",
    start_date: iso,
    end_date: iso,
    paydunya_invoice_token: str,
    payment_method: "paydunya" | "manual" | "trial",
    auto_renew: bool,
    created_at: iso,
    updated_at: iso,
  }
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from uuid import uuid4
import logging

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _duration_days(plan: str) -> int:
    p = (plan or "").lower()
    if p in ("annual", "yearly", "annuel", "premium_annuel"):
        return 365
    return 30  # monthly par défaut


async def activate_subscription(
    db,
    user_id: str,
    plan: str,
    invoice_token: str,
    payment_method: str = "paydunya",
    duration_days: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Active ou renouvelle un abonnement après un paiement réussi.
    Désactive automatiquement les abonnements précédents.
    Met aussi à jour le doc user (`premium=True`, `premium_until`) pour compat avec is_premium_active.
    """
    try:
        now = datetime.now(timezone.utc)
        days = duration_days if duration_days else _duration_days(plan)
        end = now + timedelta(days=days)

        # 1. Expirer les anciens abonnements actifs
        await db.subscriptions.update_many(
            {"user_id": user_id, "status": "active"},
            {"$set": {"status": "expired", "updated_at": now.isoformat()}},
        )

        # 2. Créer le nouveau
        sub = {
            "id": str(uuid4()),
            "user_id": user_id,
            "plan": plan,
            "status": "active",
            "start_date": now.isoformat(),
            "end_date": end.isoformat(),
            "paydunya_invoice_token": invoice_token,
            "payment_method": payment_method,
            "auto_renew": False,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.subscriptions.insert_one(sub)

        # 3. Sync doc user (compat is_premium_active existant)
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"premium": True, "premium_until": end.isoformat(), "current_plan": plan}},
        )

        logger.info(f"[subscription] Activé user={user_id} plan={plan} token={invoice_token} fin={end.date()}")
        sub.pop("_id", None)
        return {"ok": True, "subscription": sub}
    except Exception as e:
        logger.error(f"[subscription] Erreur activation user={user_id}: {e}")
        return {"ok": False, "error": str(e)}


async def get_active_subscription(db, user_id: str) -> Optional[Dict[str, Any]]:
    """Renvoie l'abonnement actif non expiré."""
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "status": "active", "end_date": {"$gt": _now_iso()}},
        {"_id": 0},
        sort=[("end_date", -1)],
    )
    return sub


async def check_subscription_status(db, user_id: str) -> Dict[str, Any]:
    """Statut synthétique de l'abonnement pour l'écran de facturation."""
    sub = await get_active_subscription(db, user_id)
    if not sub:
        # Fallback : compat avec l'ancien modèle (users.premium_until sans doc subscription)
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "premium": 1, "premium_until": 1, "current_plan": 1}) or {}
        pu = u.get("premium_until")
        if u.get("premium") and pu:
            try:
                end_dt = datetime.fromisoformat(pu.replace("Z", "+00:00"))
                if end_dt > datetime.now(timezone.utc):
                    days = (end_dt - datetime.now(timezone.utc)).days
                    return {
                        "has_active_subscription": True,
                        "plan": u.get("current_plan") or "legacy_premium",
                        "start_date": None,
                        "end_date": pu,
                        "days_remaining": max(0, days),
                        "payment_method": "legacy",
                        "source": "user_doc",
                    }
            except Exception:
                pass
        return {
            "has_active_subscription": False,
            "plan": None,
            "end_date": None,
            "days_remaining": 0,
        }

    try:
        end_dt = datetime.fromisoformat(sub["end_date"].replace("Z", "+00:00"))
    except Exception:
        end_dt = datetime.now(timezone.utc)
    days_remaining = (end_dt - datetime.now(timezone.utc)).days

    return {
        "has_active_subscription": True,
        "plan": sub["plan"],
        "start_date": sub["start_date"],
        "end_date": sub["end_date"],
        "days_remaining": max(0, days_remaining),
        "payment_method": sub.get("payment_method"),
        "auto_renew": sub.get("auto_renew", False),
        "source": "subscription_doc",
    }


async def cancel_subscription(db, user_id: str) -> Dict[str, Any]:
    """Annule l'abonnement actif (accès conservé jusqu'à end_date, mais pas de renouvellement)."""
    try:
        now_iso = _now_iso()
        result = await db.subscriptions.update_many(
            {"user_id": user_id, "status": "active"},
            {"$set": {"status": "cancelled", "auto_renew": False, "cancelled_at": now_iso, "updated_at": now_iso}},
        )
        # On garde l'accès jusqu'à premium_until pour ne pas pénaliser (bonne pratique UX)
        # mais on désactive l'auto-renouvellement.
        return {"ok": True, "cancelled_count": result.modified_count}
    except Exception as e:
        logger.error(f"[subscription] Erreur annulation user={user_id}: {e}")
        return {"ok": False, "error": str(e)}


async def renew_subscription(db, user_id: str, plan: str, invoice_token: str) -> Dict[str, Any]:
    """Renouvelle manuellement l'abonnement (utile après un paiement de renouvellement)."""
    return await activate_subscription(
        db=db, user_id=user_id, plan=plan, invoice_token=invoice_token, payment_method="paydunya"
    )


async def list_user_subscriptions(db, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Historique complet (le plus récent en premier)."""
    items = await db.subscriptions.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("start_date", -1).to_list(min(limit, 200))
    return items


# ==================================================================================================
# Endpoints REST (montés via register_subscription_routes)
# ==================================================================================================

class CancelReasonIn(BaseModel):
    reason: Optional[str] = None


def register_subscription_routes(app, api, db, get_current_user, require_roles_fn):
    """
    Enregistre les endpoints /api/subscription/* sur le router existant.
    """

    @api.get("/subscription/status")
    async def _status(user=Depends(get_current_user)):
        """Statut de l'abonnement de l'utilisateur connecté."""
        return await check_subscription_status(db, user["id"])

    @api.get("/subscription/history")
    async def _history(user=Depends(get_current_user)):
        """Historique des abonnements de l'utilisateur connecté."""
        items = await list_user_subscriptions(db, user["id"])
        return {"count": len(items), "subscriptions": items}

    @api.post("/subscription/cancel")
    async def _cancel(payload: CancelReasonIn, user=Depends(get_current_user)):
        """Annule l'abonnement actif (garde l'accès jusqu'à end_date)."""
        result = await cancel_subscription(db, user["id"])
        if payload.reason:
            await db.audit_log.insert_one({
                "type": "subscription_cancel",
                "user_id": user["id"],
                "reason": payload.reason[:200],
                "created_at": _now_iso(),
            })
        if not result.get("ok"):
            raise HTTPException(500, result.get("error", "Erreur annulation"))
        return result

    # ---------- Endpoints admin ----------
    @api.get("/admin/subscriptions")
    async def _admin_list(
        status: Optional[str] = None,
        plan: Optional[str] = None,
        limit: int = 100,
        user=Depends(require_roles_fn("admin", "super_admin")),
    ):
        """Liste toutes les souscriptions (filtres statut/plan) — admin."""
        q: Dict[str, Any] = {}
        if status: q["status"] = status
        if plan: q["plan"] = plan
        items = await db.subscriptions.find(q, {"_id": 0}).sort("start_date", -1).to_list(min(limit, 500))
        return {"count": len(items), "subscriptions": items}

    @api.get("/admin/subscriptions/stats")
    async def _admin_stats(user=Depends(require_roles_fn("admin", "super_admin"))):
        """Statistiques d'abonnements pour dashboard admin."""
        now_iso = _now_iso()
        active = await db.subscriptions.count_documents({"status": "active", "end_date": {"$gt": now_iso}})
        expired = await db.subscriptions.count_documents({"status": "expired"})
        cancelled = await db.subscriptions.count_documents({"status": "cancelled"})
        total = await db.subscriptions.count_documents({})
        by_plan: Dict[str, int] = {}
        async for doc in db.subscriptions.aggregate([
            {"$match": {"status": "active"}},
            {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
        ]):
            by_plan[doc["_id"] or "unknown"] = doc["count"]
        # Legacy premium (users.premium=True sans doc subscription)
        legacy = await db.users.count_documents({
            "premium": True,
            "premium_until": {"$gt": now_iso},
        })
        return {
            "total": total,
            "active": active,
            "expired": expired,
            "cancelled": cancelled,
            "by_plan": by_plan,
            "legacy_premium_users": legacy,
        }

    return {"registered": [
        "/subscription/status",
        "/subscription/history",
        "/subscription/cancel",
        "/admin/subscriptions",
        "/admin/subscriptions/stats",
    ]}
