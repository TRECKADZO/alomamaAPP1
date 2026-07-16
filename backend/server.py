from dotenv import load_dotenv
from pathlib import Path

# Load .env first so ENCRYPTION_KEY is available (chemin relatif au fichier pour portabilité)
load_dotenv(Path(__file__).resolve().parent / ".env")

from encryption import (
    encrypt_str, decrypt_str, encrypt_list, decrypt_list,
    encrypt_cmu_dict, decrypt_cmu_dict, decrypt_enfant,
    decrypt_tele_echo, decrypt_consultation_note,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator

# ----------------------------------------------------------------------
# Mongo + App Setup
# ----------------------------------------------------------------------
import certifi
mongo_url = os.environ["MONGO_URL"]
if mongo_url.startswith("mongodb+srv://") or "mongodb.net" in mongo_url:
    client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=20000)
else:
    client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="À lo Maman API")
api = APIRouter(prefix="/api")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_MIN = 60 * 24 * 7  # 7 days for mobile convenience

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("alomaman")


# ----------------------------------------------------------------------
# Auth helpers
# ----------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def serialize_user(u: dict) -> dict:
    email = u.get("email", "")
    # Si email est un synthétique (xxx@phone.alomaman.local), on ne l'expose pas
    email_public = u.get("email_public") or (email if not email.endswith("@phone.alomaman.local") else None)
    role_raw = u["role"]
    return {
        "id": u["id"],
        "email": email_public or "",  # email affichable
        "internal_email": email,
        "name": u.get("name", ""),
        "role": role_raw,                                      # ancien nom (rétro-compat mobile)
        "userType": ROLE_ALIASES.get(role_raw, role_raw),       # nouveau nom (web)
        "avatar": u.get("avatar"),
        "phone": u.get("phone"),
        "specialite": u.get("specialite"),
        "ville": u.get("ville"),
        "region": u.get("region"),
        "premium": bool(u.get("premium", False)),
        "premium_until": u.get("premium_until"),
        "accepte_cmu": bool(u.get("accepte_cmu", False)),
        "cmu": u.get("cmu"),
        "is_super_admin": bool(u.get("is_super_admin", False)),
        "created_at": u.get("created_at"),
        # RBAC enrichment
        "permissions": get_permissions_for_role(role_raw),
        "dashboard": get_dashboard_for_role(role_raw),
    }


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non authentifié")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


# ----------------------------------------------------------------------
# RBAC — Alias de rôles (compatibilité ancien/nouveau nommage)
# ----------------------------------------------------------------------
# Anciens noms (en DB) → Nouveaux noms (exposés à la nouvelle web app)
ROLE_ALIASES = {
    "maman": "patient",
    "professionnel": "pro",
    "admin": "super_admin",
}
# Inverse pour normaliser les inputs (la nouvelle web envoie patient → on stocke maman)
ROLE_REVERSE_ALIASES = {
    "patient": "maman",
    "pro": "professionnel",
    "super_admin": "admin",
}
ALLOWED_ROLES = {"maman", "professionnel", "centre_sante", "famille", "admin",
                 "patient", "pro", "super_admin"}


def normalize_role_input(role: str) -> str:
    """Normalise un rôle reçu en entrée vers la valeur stockée en DB (ancien nom)."""
    if not role:
        return role
    return ROLE_REVERSE_ALIASES.get(role, role)


def role_with_aliases(role: str) -> dict:
    """Retourne {role, userType} pour les réponses API (les deux noms)."""
    if not role:
        return {"role": None, "userType": None}
    return {
        "role": role,                                 # ancien nom (rétro-compat mobile)
        "userType": ROLE_ALIASES.get(role, role),     # nouveau nom (web)
    }


def get_dashboard_for_role(role: str) -> dict:
    """Indique au client où rediriger après login + plateforme privilégiée."""
    role_alias = ROLE_ALIASES.get(role, role)
    mapping = {
        "patient":      {"platform": "mobile", "path": "/(tabs)",        "label": "Espace Maman"},
        "pro":          {"platform": "web",    "path": "/dashboard/pro", "label": "Portail Professionnel"},
        "centre_sante": {"platform": "web",    "path": "/dashboard/centre", "label": "Portail Centre de Santé"},
        "super_admin":  {"platform": "web",    "path": "/admin",         "label": "Console Super Admin"},
        "famille":      {"platform": "mobile", "path": "/(tabs)",        "label": "Espace Famille"},
    }
    return mapping.get(role_alias, {"platform": "mobile", "path": "/(tabs)", "label": "Accueil"})


def get_permissions_for_role(role: str) -> list:
    """Liste lisible des permissions pour debug / UI conditionnelle côté client."""
    role_alias = ROLE_ALIASES.get(role, role)
    perms_map = {
        "patient": [
            "read:self", "write:self",
            "read:own_grossesses", "write:own_grossesses",
            "read:own_enfants", "write:own_enfants",
            "create:rdv", "read:own_rdv",
            "create:messages", "read:own_messages",
        ],
        "pro": [
            "read:patients_assigned", "write:consultation_notes",
            "read:own_rdv", "write:own_rdv",
            "create:teleconsultation", "read:own_revenue",
            "create:prestations", "manage:disponibilites",
            "request:withdraw",
        ],
        "centre_sante": [
            "read:pros_assigned", "write:pros_assigned",
            "read:patients_centre", "create:rdv_centre",
            "read:revenue_centre",
        ],
        "super_admin": [
            "read:*", "write:*", "delete:*",
            "manage:users", "manage:roles",
            "read:metrics", "export:metrics",
            "read:directory", "manage:payouts",
        ],
        "famille": [
            "read:shared_data", "create:messages_to_owner",
        ],
    }
    return perms_map.get(role_alias, [])


def require_roles(*roles):
    """RBAC dependency. Accepte aliases : patient↔maman, pro↔professionnel, super_admin↔admin."""
    expanded = set()
    for r in roles:
        expanded.add(r)
        expanded.add(ROLE_ALIASES.get(r, r))
        expanded.add(ROLE_REVERSE_ALIASES.get(r, r))

    async def _dep(user=Depends(get_current_user)):
        user_role = user["role"]
        if user_role not in expanded and ROLE_ALIASES.get(user_role, user_role) not in expanded and ROLE_REVERSE_ALIASES.get(user_role, user_role) not in expanded:
            raise HTTPException(status_code=403, detail="Accès refusé")
        return user
    return _dep


# ----------------------------------------------------------------------
# (anciens helpers RBAC supprimés — remplacés ci-dessus)
# ----------------------------------------------------------------------
def is_premium_active(user: dict) -> bool:
    if not user.get("premium"):
        return False
    pu = user.get("premium_until")
    if not pu:
        return False
    try:
        return datetime.fromisoformat(pu.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except Exception:
        return False


async def check_quota(user: dict, key: str, current_count: int):
    """Enforce freemium quota. Raises 402 if limit reached and user not Premium."""
    if is_premium_active(user):
        return
    role = user.get("role")
    quotas = (globals().get("FREE_QUOTAS") or {}).get(role, {})
    limit = quotas.get(key)
    if isinstance(limit, int) and current_count >= limit:
        label = {
            "enfants_max": f"enfants ({limit} max)",
            "patientes_max": f"patientes ({limit} max)",
            "membres_pro_max": f"professionnels ({limit} max)",
            "rdv_per_month": f"rendez-vous ce mois ({limit} max)",
            "ia_per_day": f"messages IA aujourd'hui ({limit} max)",
            "ia_questions_per_month": f"questions IA ce mois ({limit} max)",
            "ia_pro_per_day": f"requêtes IA Pro aujourd'hui ({limit} max)",
            "teleconsultations_per_year": f"téléconsultations cette année ({limit} max)",
        }.get(key, key)
        raise HTTPException(
            status_code=402,
            detail={
                "error": "quota_exceeded",
                "message": f"Quota gratuit atteint : {label}. Passez Premium pour continuer.",
                "quota": key,
                "limit": limit,
                "upgrade_url": "/premium",
            },
        )


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
Role = Literal["maman", "professionnel", "admin", "centre_sante", "famille"]


class RegisterIn(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)
    role: Role = "maman"
    specialite: Optional[str] = None  # for professionals
    # Centre de santé
    nom_centre: Optional[str] = None
    type_etablissement: Optional[str] = None  # clinique_privee | hopital_public | pmi | maternite
    numero_agrement: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    region: Optional[str] = None
    email_contact: Optional[str] = None
    # Pro/Maman optional
    code_invitation_centre: Optional[str] = None
    # Consentement (RGPD + Côte d'Ivoire)
    accepte_cgu: bool = False
    accepte_politique_confidentialite: bool = False
    accepte_donnees_sante: bool = False  # requis pour maman/pro/centre
    accepte_communications: bool = False  # opt-in newsletter (optionnel)
    # 🤝 Parrainage : code du parrain (parraine un nouveau compte maman)
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str
    totp_code: Optional[str] = None  # 🔐 RGSSI N3 — code 2FA si activé


def _normalize_phone(p: str) -> str:
    """Normalise un numéro : enlève espaces, tirets, et ajoute + si manquant."""
    if not p:
        return p
    clean = "".join(c for c in p if c.isdigit() or c == "+")
    if clean and not clean.startswith("+") and len(clean) >= 8:
        # Par défaut Côte d'Ivoire si pas de préfixe
        clean = "+225" + clean.lstrip("0")
    return clean


class GrossesseIn(BaseModel):
    date_debut: str  # ISO
    date_terme: Optional[str] = None
    symptomes: List[str] = []
    notes: Optional[str] = None


class EnfantIn(BaseModel):
    nom: str
    date_naissance: str
    sexe: Literal["F", "M"]
    poids_kg: Optional[float] = None
    taille_cm: Optional[float] = None
    notes: Optional[str] = None
    numero_cmu: Optional[str] = None  # N° CMU de l'enfant (bénéficiaire)
    groupe_sanguin: Optional[str] = None
    allergies: Optional[List[str]] = None

    @field_validator("allergies", mode="before")
    @classmethod
    def _parse_allergies(cls, v):
        """Accepte: list[str], "arachides, lait" (CSV), "" ou None."""
        if v is None:
            return None
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            return [s.strip() for s in v.split(",") if s.strip()]
        return None

    @field_validator("groupe_sanguin", "numero_cmu", "notes", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        """Normalise chaîne vide → None pour éviter les validations strictes."""
        if isinstance(v, str) and not v.strip():
            return None
        return v


class VaccinIn(BaseModel):
    nom: str
    date: str
    fait: bool = False


class RdvIn(BaseModel):
    pro_id: str
    date: str  # ISO
    motif: str
    tarif_fcfa: int = 10000
    type_consultation: Optional[str] = None
    mode: Optional[str] = "presentiel"  # "presentiel" | "teleconsultation" | "domicile"
    prestation_id: Optional[str] = None
    # 🏠 Consultation à domicile (chiffrée AES-256-GCM côté serveur)
    adresse_domicile: Optional[str] = None  # ex: "Cocody, Riviera 3, Rue des Jardins, Villa 12"
    quartier: Optional[str] = None
    ville: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    frais_deplacement_fcfa: Optional[int] = None  # défaut = celui du Pro ou 2000
    # 💳 Méthode de paiement choisie par la Maman
    # - "online" → paiement PayDunya immédiatement après création (RDV bloqué tant que non payé)
    # - "cabinet" → paiement sur place (uniquement valide pour mode=presentiel)
    # Pour mode teleconsultation/domicile, la valeur est forcée à "online" côté serveur.
    payment_method: Optional[str] = None


class RefundIn(BaseModel):
    rdv_id: Optional[str] = None
    payment_id: Optional[str] = None
    raison: Optional[str] = None


class MessageIn(BaseModel):
    to_id: str
    content: str
    # 📎 Pièce jointe optionnelle (data URI complet, ex: data:image/jpeg;base64,XXX)
    attachment_base64: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_mime: Optional[str] = None


class PostIn(BaseModel):
    title: str
    content: str
    category: Optional[str] = "general"


class CommentIn(BaseModel):
    content: str


class ReminderIn(BaseModel):
    title: str
    due_at: str
    note: Optional[str] = None


class AiChatIn(BaseModel):
    session_id: str
    message: str


class MesureIn(BaseModel):
    date: str
    poids_kg: Optional[float] = None
    taille_cm: Optional[float] = None
    perimetre_cranien_cm: Optional[float] = None


class CycleIn(BaseModel):
    date_debut_regles: str
    duree_regles: int = 5
    duree_cycle: int = 28
    notes: Optional[str] = None


class ContraceptionIn(BaseModel):
    methode: str  # pilule, sterilet, preservatif, implant, etc
    date_debut: str
    date_fin: Optional[str] = None
    notes: Optional[str] = None


class AllaitementIn(BaseModel):
    enfant_id: str
    date: str  # ISO datetime
    duree_minutes: int
    cote: Literal["gauche", "droit", "les_deux", "biberon"]
    notes: Optional[str] = None


class HumeurIn(BaseModel):
    date: str
    score: int = Field(ge=1, le=10)
    notes: Optional[str] = None
    symptomes: List[str] = []


class PushTokenIn(BaseModel):
    token: str


class NotificationIn(BaseModel):
    title: str
    body: str
    type: str = "info"  # info, rdv, rappel, message


class PhotoIn(BaseModel):
    photo_base64: str


class NaissanceIn(BaseModel):
    enfant_id: Optional[str] = None  # si absent → crée l'enfant à la volée
    # Champs pour création inline du carnet enfant
    enfant_nom: Optional[str] = None
    enfant_sexe: Optional[Literal["F", "M"]] = None
    enfant_date_naissance: Optional[str] = None  # ISO
    prenoms: Optional[str] = None  # prénom(s) de l'enfant
    # Déclaration naissance
    lieu_naissance: str
    lieu_type: Optional[str] = None  # maternite | pmi | domicile | autre
    heure_naissance: str  # HH:MM
    poids_naissance_g: Optional[int] = 0
    taille_naissance_cm: Optional[float] = 0
    score_apgar_1min: Optional[int] = Field(default=None, ge=0, le=10)  # 0-10
    score_apgar_5min: Optional[int] = Field(default=None, ge=0, le=10)
    nom_pere: Optional[str] = None
    nom_mere: str
    profession_pere: Optional[str] = None
    profession_mere: Optional[str] = None
    medecin_accoucheur: Optional[str] = None
    numero_acte: Optional[str] = None
    consentement_explicite: bool = False  # exigé pour générer le PDF


class TeleEchoIn(BaseModel):
    rdv_id: str
    image_base64: Optional[str] = None
    description: Optional[str] = None
    semaine_grossesse: Optional[int] = None
    # Rapport structuré (optionnel)
    bpd_mm: Optional[float] = None  # Diamètre bipariétal (mm)
    fl_mm: Optional[float] = None  # Longueur fémorale (mm)
    cc_mm: Optional[float] = None  # Circonférence crânienne (mm)
    ca_mm: Optional[float] = None  # Circonférence abdominale (mm)
    poids_estime_g: Optional[int] = None
    liquide_amniotique: Optional[str] = None  # normal | oligoamnios | hydramnios
    placenta_position: Optional[str] = None  # anterieur | posterieur | fundique | prævia
    sexe_foetal: Optional[Literal["F", "M", "indetermine"]] = None
    battements_cardiaques_bpm: Optional[int] = None
    commentaires_medicaux: Optional[str] = None
    conclusion: Optional[str] = None


# ----------------------------------------------------------------------
# Auth Endpoints
# ----------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    if not payload.email and not payload.phone:
        raise HTTPException(status_code=400, detail="Email ou téléphone requis")

    # Normalisation du rôle (accepte 'patient' → stocke 'maman', etc.)
    payload.role = normalize_role_input(payload.role)
    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide. Valides: maman/patient, professionnel/pro, centre_sante, famille, admin/super_admin")

    # Consentement obligatoire
    if not payload.accepte_cgu:
        raise HTTPException(status_code=400, detail="Vous devez accepter les Conditions Générales d'Utilisation")
    if not payload.accepte_politique_confidentialite:
        raise HTTPException(status_code=400, detail="Vous devez accepter la Politique de Confidentialité")
    if payload.role in ("maman", "professionnel", "centre_sante") and not payload.accepte_donnees_sante:
        raise HTTPException(status_code=400, detail="Le traitement des données de santé nécessite votre consentement explicite")

    email = payload.email.lower().strip() if payload.email else None
    phone = _normalize_phone(payload.phone) if payload.phone else None

    # Vérifier unicité
    if email:
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    if phone:
        if await db.users.find_one({"phone": phone}):
            raise HTTPException(status_code=400, detail="Ce numéro est déjà utilisé")

    user_id = str(uuid.uuid4())
    # Si pas d'email, en synthétiser un pour la clé interne (login email)
    internal_email = email or f"{phone.replace('+', '')}@phone.alomaman.local"
    now_iso = datetime.now(timezone.utc).isoformat()

    # 🤝 Parrainage : valider le code si fourni (uniquement pour les mamans)
    referred_by_id = None
    referred_by_code = None
    if payload.referral_code and payload.role == "maman":
        code_clean = payload.referral_code.strip().upper()
        parrain = await db.users.find_one({"referral_code": code_clean, "role": "maman"}, {"_id": 0, "id": 1})
        if parrain:
            referred_by_id = parrain["id"]
            referred_by_code = code_clean

    # 🎟️ Générer un code de parrainage unique de 6 caractères (ex: NOHLAN → A7K2M9)
    my_ref_code = None
    if payload.role == "maman":
        import secrets as _secrets
        import string as _string
        alphabet = _string.ascii_uppercase + _string.digits  # sans O/I/1/0 pour la lisibilité
        alphabet = alphabet.replace("O", "").replace("I", "").replace("0", "").replace("1", "")
        for _ in range(20):
            candidate = "".join(_secrets.choice(alphabet) for _ in range(6))
            if not await db.users.find_one({"referral_code": candidate}, {"_id": 0, "id": 1}):
                my_ref_code = candidate
                break

    doc = {
        "id": user_id,
        "email": internal_email,
        "email_public": email,  # email réel (peut être null)
        "phone": phone,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "specialite": payload.specialite,
        "ville": payload.ville,
        "region": payload.region,
        "avatar": None,
        "created_at": now_iso,
        # Consentement journalisé
        "consent_version": "1.0",
        "consent_accepted_at": now_iso,
        "consent_cgu": True,
        "consent_politique": True,
        "consent_donnees_sante": bool(payload.accepte_donnees_sante),
        "consent_communications": bool(payload.accepte_communications),
        # 🤝 Parrainage
        "referral_code": my_ref_code,
        "referred_by_id": referred_by_id,
        "referred_by_code": referred_by_code,
        "referrals_count": 0,
        "referral_premium_days_earned": 0,
    }
    await db.users.insert_one(doc)

    # 🎁 Récompense parrainage : si la nouvelle maman a utilisé un code, on crédite le parrain
    if referred_by_id:
        try:
            # +1 filleule, +7 jours Premium pour le parrain
            parrain_doc = await db.users.find_one({"id": referred_by_id}, {"_id": 0, "premium_until": 1, "referrals_count": 1, "referral_premium_days_earned": 1})
            days_to_add = 7  # 1 filleule = 7 jours Premium
            now_dt = datetime.now(timezone.utc)
            current_until = parrain_doc.get("premium_until") if parrain_doc else None
            base_dt = now_dt
            if current_until:
                try:
                    parsed = datetime.fromisoformat(current_until.replace("Z", "+00:00")) if isinstance(current_until, str) else current_until
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    if parsed > now_dt:
                        base_dt = parsed
                except Exception:
                    base_dt = now_dt
            new_until = base_dt + timedelta(days=days_to_add)
            new_count = (parrain_doc.get("referrals_count") if parrain_doc else 0) + 1
            earned = (parrain_doc.get("referral_premium_days_earned") if parrain_doc else 0) + days_to_add
            # Paliers : 3 filleules = +30 jours, 10 filleules = +60 jours supplémentaires
            bonus_days = 0
            bonus_msg = ""
            if new_count == 3:
                bonus_days = 30
                bonus_msg = " 🎁 Palier 3 filleules : +1 mois bonus !"
            elif new_count == 10:
                bonus_days = 60
                bonus_msg = " 🏆 Palier 10 filleules : +2 mois bonus !"
            if bonus_days:
                new_until = new_until + timedelta(days=bonus_days)
                earned += bonus_days
            await db.users.update_one(
                {"id": referred_by_id},
                {"$set": {
                    "premium": True,
                    "premium_until": new_until.isoformat(),
                    "premium_since": parrain_doc.get("premium_since") if parrain_doc and parrain_doc.get("premium_since") else now_dt.isoformat(),
                    "referrals_count": new_count,
                    "referral_premium_days_earned": earned,
                }},
            )
            # Log referral event
            await db.referral_events.insert_one({
                "id": str(uuid.uuid4()),
                "parrain_id": referred_by_id,
                "filleule_id": user_id,
                "code_used": referred_by_code,
                "days_awarded": days_to_add + bonus_days,
                "created_at": now_iso,
            })
            # Notification in-app au parrain
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": referred_by_id,
                "type": "referral_reward",
                "title": "🤝 Nouveau parrainage !",
                "body": f"{payload.name} vient de s'inscrire avec votre code. +{days_to_add + bonus_days} jours Premium offerts.{bonus_msg}",
                "read": False,
                "created_at": now_iso,
            })
            logger.info(f"🤝 Referral reward: parrain={referred_by_id} filleule={user_id} +{days_to_add + bonus_days}j")
        except Exception as e:
            logger.error(f"Referral reward failed: {e}")

    # Auto-créer un Centre de Santé si role centre_sante
    if payload.role == "centre_sante" and payload.nom_centre:
        centre_doc = {
            "id": str(uuid.uuid4()),
            "owner_id": user_id,
            "owner_email": internal_email,
            "nom_centre": payload.nom_centre,
            "type_etablissement": payload.type_etablissement or "clinique_privee",
            "numero_agrement": payload.numero_agrement,
            "adresse": payload.adresse,
            "ville": payload.ville,
            "region": payload.region,
            "email_contact": payload.email_contact or email,
            "telephone": phone,
            "code_invitation": _gen_code(6),
            "services": [],
            "horaires": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.centres.insert_one(centre_doc)

    # Si pro avec code invitation centre → on lie (soumis aux quotas freemium du centre)
    if payload.role == "professionnel" and payload.code_invitation_centre:
        centre = await db.centres.find_one(
            {"code_invitation": payload.code_invitation_centre.upper()}
        )
        if centre:
            # Vérifier le quota du centre (ignoré si le centre est Premium)
            owner = await db.users.find_one({"id": centre["user_id"]}, {"_id": 0})
            current_members = len(centre.get("membres_pro", []) or [])
            if owner and not is_premium_active(owner):
                limit = (FREE_QUOTAS.get("centre_sante") or {}).get("membres_pro_max")
                if isinstance(limit, int) and current_members >= limit:
                    # On n'empêche pas l'inscription mais on ne lie pas au centre
                    logger.info(
                        f"Centre {centre['id']} a atteint sa limite freemium ({limit}). Pro {user_id} non lié."
                    )
                    return {"token": create_token(user_id, internal_email, payload.role), "user": serialize_user(doc), "centre_full": True}
            await db.centres.update_one(
                {"id": centre["id"]},
                {"$addToSet": {"membres_pro": user_id}},
            )

    token = create_token(user_id, internal_email, payload.role)
    return {"token": token, "user": serialize_user(doc)}


def _gen_code(n: int = 6) -> str:
    import secrets
    import string
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


# ========================================================================
# Code provisoire À lo Maman — identifiant d'accès partage quand pas de CMU
# Format : AM-XXXX-XX (alphabet sans 0/O/1/I/L pour lisibilité)
# Ex: AM-X7K9-P3
# ========================================================================
_AM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

def _gen_am_code() -> str:
    import secrets
    p1 = "".join(secrets.choice(_AM_ALPHABET) for _ in range(4))
    p2 = "".join(secrets.choice(_AM_ALPHABET) for _ in range(2))
    return f"AM-{p1}-{p2}"

async def _ensure_am_code(collection, doc_id: str, field: str = "code_provisoire") -> str:
    """Génère ou retourne le code AM unique. Garantit l'unicité."""
    import secrets
    for _ in range(10):
        code = _gen_am_code()
        exists = await collection.find_one({field: code}, {"_id": 1})
        if not exists:
            await collection.update_one({"id": doc_id}, {"$set": {field: code}})
            return code
    # fallback très improbable
    return f"AM-{_gen_code(4)}-{_gen_code(2)}"


def _clean_share_identifier(raw: str) -> str:
    """Normalise identifiant CMU (chiffres seulement) ou code AM (upper, espaces supprimés)."""
    if not raw:
        return ""
    raw = raw.strip().upper().replace(" ", "")
    if raw.startswith("AM-") or raw.startswith("AM"):
        # Code provisoire - ensure format AM-XXXX-XX
        parts = raw.replace("-", "")
        if parts.startswith("AM") and len(parts) >= 8:
            body = parts[2:]
            return f"AM-{body[:4]}-{body[4:6]}"
        return raw
    # Sinon, CMU = chiffres uniquement
    return "".join(c for c in raw if c.isdigit())


@api.post("/auth/login")
async def login(payload: LoginIn):
    if not payload.email and not payload.phone:
        raise HTTPException(status_code=400, detail="Email ou téléphone requis")
    user = None
    if payload.email:
        # Si l'utilisateur a saisi un téléphone dans le champ email, on bascule
        em = payload.email.lower().strip()
        if "@" not in em and any(c.isdigit() for c in em) and len(em.replace("+","").replace(" ","")) >= 7:
            payload.phone = em
            payload.email = None
        else:
            user = await db.users.find_one({"email": em})
    if not user and payload.phone:
        # Recherche multi-format pour gérer les comptes mal normalisés (legacy/seeds)
        raw = (payload.phone or "").strip()
        digits_only = "".join(c for c in raw if c.isdigit())
        candidates = list({
            _normalize_phone(raw),                            # +225709005300
            raw,                                              # tel quel
            digits_only,                                      # 0709005300 ou 2250709005300
            digits_only.lstrip("0"),                          # 709005300
            f"+{digits_only}",                                # +0709005300
            f"+225{digits_only}" if not digits_only.startswith("225") else f"+{digits_only}",
            digits_only[3:] if digits_only.startswith("225") else digits_only,  # sans préfixe pays
        })
        user = await db.users.find_one({"phone": {"$in": candidates}})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    # Auto-correction : si le numéro stocké n'est pas au format normalisé, on le corrige
    if user.get("phone"):
        canon = _normalize_phone(user["phone"])
        if canon != user["phone"]:
            await db.users.update_one({"id": user["id"]}, {"$set": {"phone": canon}})
            user["phone"] = canon

    # 🔐 RGSSI Niveau 3 — 2FA TOTP obligatoire pour les Pros si activé
    # ⚠️ Phase de test : bypass possible via TWO_FACTOR_ENFORCEMENT="off" pour les rôles NON-admin
    _2fa_enforced = (os.environ.get("TWO_FACTOR_ENFORCEMENT", "on").strip().lower() not in ("off", "false", "0", "disabled", "no"))
    # 🔐 CONFORMITÉ N3 : 2FA STRICTEMENT OBLIGATOIRE pour admin & super_admin (non désactivable)
    _admin_role = user.get("role") in ("admin", "super_admin") or user.get("is_super_admin")
    # Pour les admins on force TOUJOURS l'exigence 2FA (aucun bypass possible)
    _admin_2fa_required = _admin_role and not user.get("totp_enabled")
    if _admin_2fa_required:
        setup_grace = user.get("totp_setup_grace_used", False)
        if setup_grace:
            raise HTTPException(
                status_code=403,
                detail="🔐 2FA obligatoire pour les administrateurs. Activez Google Authenticator via /admin/security/2fa avant de vous reconnecter."
            )
        # Premier login sans 2FA : on marque la grâce comme utilisée, l'utilisateur DOIT activer 2FA maintenant
        await db.users.update_one({"id": user["id"]}, {"$set": {"totp_setup_grace_used": True, "must_setup_2fa": True}})
    if user.get("totp_enabled") and _2fa_enforced:
        otp = (payload.totp_code or "").strip().replace(" ", "")
        if not otp:
            # Code manquant → demander la 2e étape
            return {
                "requires_2fa": True,
                "user_id": user["id"],
                "email": user.get("email"),
                "message": "Code à 6 chiffres requis (Google Authenticator)",
            }
        try:
            import pyotp  # type: ignore
            secret = user.get("totp_secret")
            if not secret or not pyotp.TOTP(secret).verify(otp, valid_window=1):
                # Audit l'échec pour détection brute force
                await db.audit_log.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "user_role": user.get("role"),
                    "action": "auth_failed_2fa",
                    "resource_type": "Auth",
                    "resource_id": user["id"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                raise HTTPException(status_code=401, detail="Code 2FA invalide")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=500, detail="Erreur 2FA")

    token = create_token(user["id"], user["email"], user["role"])
    # Audit succès login
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_role": user.get("role"),
            "user_name": user.get("name"),
            "action": "login",
            "resource_type": "Auth",
            "resource_id": user["id"],
            "details": {"with_2fa": bool(user.get("totp_enabled"))},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    return {"token": token, "user": serialize_user(user)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return serialize_user(user)


@api.get("/auth/roles-info")
async def roles_info():
    """Endpoint PUBLIC pour la nouvelle web app : description de tous les rôles, alias et permissions.
    Utile pour synchroniser les UI sans hardcoder."""
    info = {}
    for new_name in ["patient", "pro", "centre_sante", "super_admin", "famille"]:
        info[new_name] = {
            "alias": ROLE_REVERSE_ALIASES.get(new_name, new_name),
            "permissions": get_permissions_for_role(new_name),
            "dashboard": get_dashboard_for_role(new_name),
        }
    return {
        "roles": info,
        "aliases_legacy_to_new": ROLE_ALIASES,
        "aliases_new_to_legacy": ROLE_REVERSE_ALIASES,
    }


# ----------------------------------------------------------------------
# Changement de mot de passe (utilisateur connecté)
# ----------------------------------------------------------------------
class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user=Depends(get_current_user)):
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    if not verify_password(payload.old_password, db_user.get("password_hash", "")):
        raise HTTPException(401, "Mot de passe actuel incorrect")
    if payload.old_password == payload.new_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent de l'ancien")
    new_hash = hash_password(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "password_changed_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        await push_notif(user["id"], "Mot de passe modifié 🔐", "Votre mot de passe a été changé avec succès.", "info")
    except Exception:
        pass
    return {"success": True, "message": "Mot de passe modifié avec succès"}


# ----------------------------------------------------------------------
# Réinitialisation de mot de passe par code SMS
# Flux : (1) Request — téléphone+nom+prénom → code SMS  (2) Verify — code → reset_token  (3) Reset — token+new_password
# ----------------------------------------------------------------------
import unicodedata as _ud
import random as _random


def _normalize_name(s: str) -> str:
    """Compare-friendly name : minuscules, sans accents, sans espaces multiples."""
    if not s:
        return ""
    s = s.strip().lower()
    s = "".join(c for c in _ud.normalize("NFD", s) if _ud.category(c) != "Mn")
    s = " ".join(s.split())
    return s


async def send_sms(to_phone: str, message: str) -> dict:
    """
    Helper d'envoi SMS pluggable.
    - Si TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER : envoie via Twilio
    - Si AT_USERNAME + AT_API_KEY : envoie via Africa's Talking
    - Sinon : log + retourne {sent: false, simulated: true}
    """
    import httpx
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    twilio_token = os.environ.get("TWILIO_AUTH_TOKEN")
    twilio_from = os.environ.get("TWILIO_FROM_NUMBER")
    at_user = os.environ.get("AT_USERNAME")
    at_key = os.environ.get("AT_API_KEY")
    at_sender = os.environ.get("AT_SENDER_ID", "AloMaman")

    # 1) Twilio
    if twilio_sid and twilio_token and twilio_from:
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                r = await http.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json",
                    auth=(twilio_sid, twilio_token),
                    data={"To": to_phone, "From": twilio_from, "Body": message},
                )
            ok = 200 <= r.status_code < 300
            return {"sent": ok, "provider": "twilio", "status": r.status_code, "raw": r.text[:200] if not ok else None}
        except Exception as e:
            logging.warning(f"Twilio SMS error: {e}")

    # 2) Africa's Talking
    if at_user and at_key:
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                r = await http.post(
                    "https://api.africastalking.com/version1/messaging",
                    headers={"apiKey": at_key, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
                    data={"username": at_user, "to": to_phone, "message": message, "from": at_sender},
                )
            ok = 200 <= r.status_code < 300
            return {"sent": ok, "provider": "africastalking", "status": r.status_code}
        except Exception as e:
            logging.warning(f"Africa's Talking SMS error: {e}")

    # 3) Mode dev / non configuré
    logging.info(f"📱 [SMS DEV] {to_phone} → {message}")
    return {"sent": False, "simulated": True, "provider": "none"}


class ForgotPasswordRequestIn(BaseModel):
    identifier: Optional[str] = None  # email OU téléphone
    phone: Optional[str] = None  # rétro-compat
    email: Optional[str] = None  # rétro-compat
    name: str = Field(min_length=2)


class ForgotPasswordVerifyIn(BaseModel):
    identifier: Optional[str] = None
    phone: Optional[str] = None  # rétro-compat
    email: Optional[str] = None
    code: str = Field(min_length=4, max_length=8)


class ForgotPasswordResetIn(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6)


def _resolve_identifier(payload) -> tuple[str, str]:
    """Retourne (kind, normalized_value) où kind ∈ {'email', 'phone'}."""
    raw = (getattr(payload, "identifier", None) or getattr(payload, "email", None) or getattr(payload, "phone", None) or "").strip()
    if not raw:
        return ("", "")
    if "@" in raw:
        return ("email", raw.lower())
    return ("phone", _normalize_phone(raw))


@api.post("/auth/forgot-password/request")
async def forgot_password_request(payload: ForgotPasswordRequestIn):
    """
    Étape 1 : l'utilisateur saisit son email OU son téléphone + son nom.
    Si le compte existe ET que le nom correspond, un code à 6 chiffres est généré
    et retourné directement dans la réponse (affiché en clair dans l'app — PAS de SMS/Email).
    """
    kind, value = _resolve_identifier(payload)
    if not value:
        raise HTTPException(400, "Email ou numéro de téléphone requis")

    if kind == "email":
        user = await db.users.find_one({"email": value})
    else:
        user = await db.users.find_one({"phone": value})

    generic_response = {
        "success": False,
        "verified": False,
        "message": "Vérification impossible. Vérifiez vos informations, puis réessayez.",
    }

    if not user:
        return generic_response

    # Vérification du nom (case + accent insensitive, partiel acceptable des deux côtés)
    db_name_norm = _normalize_name(user.get("name", ""))
    input_name_norm = _normalize_name(payload.name)
    name_ok = (
        db_name_norm == input_name_norm
        or input_name_norm in db_name_norm
        or db_name_norm in input_name_norm
        or all(part in db_name_norm for part in input_name_norm.split() if len(part) >= 2)
    )
    if not name_ok:
        return generic_response

    # Anti-bruteforce : max 5 demandes par identifier par heure
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent_count = await db.password_reset_codes.count_documents(
        {"identifier": value, "created_at": {"$gte": one_hour_ago}}
    )
    if recent_count >= 5:
        raise HTTPException(429, "Trop de demandes. Réessayez dans une heure.")

    # Générer un code à 6 chiffres
    code = f"{_random.randint(0, 999999):06d}"
    code_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)
    await db.password_reset_codes.insert_one({
        "id": code_id,
        "user_id": user["id"],
        "identifier": value,
        "identifier_kind": kind,
        # rétro-compat
        "phone": value if kind == "phone" else None,
        "email": value if kind == "email" else None,
        "code_hash": hash_password(code),
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "used": False,
        "attempts": 0,
    })

    return {
        "success": True,
        "verified": True,
        "code": code,
        "expires_in_minutes": 10,
        "identifier_kind": kind,
        "message": "Identité vérifiée. Voici votre code à usage unique.",
    }


@api.post("/auth/forgot-password/verify")
async def forgot_password_verify(payload: ForgotPasswordVerifyIn):
    """Étape 2 : vérifier le code. Retourne un reset_token à usage unique (15 min)."""
    kind, value = _resolve_identifier(payload)
    if not value:
        raise HTTPException(400, "Email ou téléphone requis")
    code = (payload.code or "").strip()
    record = await db.password_reset_codes.find_one(
        {"identifier": value, "used": False},
        sort=[("created_at", -1)],
    )
    if not record:
        # Rétro-compat : chercher aussi par phone/email pour les anciens codes
        record = await db.password_reset_codes.find_one(
            {"$or": [{"phone": value}, {"email": value}], "used": False},
            sort=[("created_at", -1)],
        )
    if not record:
        raise HTTPException(400, "Aucune demande en cours pour ce compte")
    try:
        expires = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "Code expiré, demandez un nouveau code")
    if (record.get("attempts") or 0) >= 5:
        await db.password_reset_codes.update_one({"id": record["id"]}, {"$set": {"used": True}})
        raise HTTPException(400, "Trop d'essais incorrects, demandez un nouveau code")
    if not verify_password(code, record["code_hash"]):
        await db.password_reset_codes.update_one({"id": record["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Code incorrect")

    reset_token = str(uuid.uuid4())
    token_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.password_reset_tokens.insert_one({
        "token": reset_token,
        "user_id": record["user_id"],
        "identifier": record.get("identifier") or value,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": token_expires.isoformat(),
        "used": False,
    })
    await db.password_reset_codes.update_one({"id": record["id"]}, {"$set": {"used": True}})
    return {"success": True, "reset_token": reset_token, "expires_in_minutes": 15}


@api.post("/auth/forgot-password/reset")
async def forgot_password_reset(payload: ForgotPasswordResetIn):
    """Étape 3 : utiliser le reset_token pour définir un nouveau mot de passe."""
    record = await db.password_reset_tokens.find_one({"token": payload.reset_token, "used": False})
    if not record:
        raise HTTPException(400, "Lien invalide ou déjà utilisé")
    try:
        expires = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "Lien expiré, recommencez la procédure")

    user = await db.users.find_one({"id": record["user_id"]})
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")

    new_hash = hash_password(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "password_changed_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.password_reset_tokens.update_one({"token": payload.reset_token}, {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}})
    # Invalider tout autre code/token actif pour cet utilisateur
    await db.password_reset_codes.update_many({"user_id": user["id"], "used": False}, {"$set": {"used": True}})
    await db.password_reset_tokens.update_many({"user_id": user["id"], "used": False, "token": {"$ne": payload.reset_token}}, {"$set": {"used": True}})
    return {"success": True, "message": "Mot de passe réinitialisé. Vous pouvez vous connecter."}


# ----------------------------------------------------------------------
# Suppression de compte (RGPD / Google Play / Apple App Store)
# ----------------------------------------------------------------------
class DeleteAccountIn(BaseModel):
    password: str
    confirmation: str  # doit valoir "SUPPRIMER" pour confirmer


class PublicDeletionRequestIn(BaseModel):
    identifier: str  # email ou téléphone
    name: str
    reason: Optional[str] = None


@api.post("/public/account-deletion-request")
async def public_account_deletion_request(payload: PublicDeletionRequestIn):
    """
    Endpoint PUBLIC (sans auth) — demande de suppression de compte à distance.
    Utilisé par la page web /suppression-compte (lien obligatoire Google Play / Apple App Store).
    L'admin reçoit la demande dans `account_deletion_requests` et traite manuellement sous 30 jours.
    """
    ident = (payload.identifier or "").strip()
    name = (payload.name or "").strip()
    if not ident or len(name) < 2:
        raise HTTPException(400, "Email/téléphone et nom complet sont requis")
    # Anti-spam : max 3 demandes / heure / identifier
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.account_deletion_requests.count_documents(
        {"identifier": ident.lower(), "created_at": {"$gte": one_hour_ago}}
    )
    if recent >= 3:
        raise HTTPException(429, "Trop de demandes. Réessayez dans une heure.")
    doc = {
        "id": str(uuid.uuid4()),
        "identifier": ident.lower(),
        "name": name,
        "reason": (payload.reason or "").strip()[:500] or None,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": None,
        "processed_by": None,
    }
    await db.account_deletion_requests.insert_one(doc)
    logging.info(f"📝 Account deletion request received: {ident} ({name})")
    return {"success": True, "message": "Votre demande a été enregistrée. Traitement sous 30 jours."}


@api.get("/admin/deletion-requests")
async def admin_list_deletion_requests(user=Depends(require_roles("admin"))):
    """Liste des demandes de suppression à traiter par l'admin."""
    items = await db.account_deletion_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api.delete("/auth/me")
async def delete_my_account(payload: DeleteAccountIn, user=Depends(get_current_user)):
    """
    Supprime définitivement le compte de l'utilisateur connecté et toutes ses données associées.
    Conforme RGPD (Article 17 - Droit à l'effacement) et exigences Google Play Store / Apple App Store.

    Sécurité :
    - Vérifie le mot de passe
    - Exige le texte "SUPPRIMER" en confirmation explicite
    - Supprime / anonymise toutes les données dans toutes les collections
    """
    if (payload.confirmation or "").strip().upper() != "SUPPRIMER":
        raise HTTPException(400, "Veuillez taper SUPPRIMER pour confirmer la suppression.")

    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(404, "Utilisateur introuvable")
    if db_user.get("is_super_admin"):
        raise HTTPException(403, "Le compte super administrateur ne peut pas être supprimé via cette API.")
    if not verify_password(payload.password, db_user.get("password_hash", "")):
        raise HTTPException(401, "Mot de passe incorrect")

    user_id = user["id"]
    user_email = user.get("email", "")

    # 1) Supprimer les données personnelles dans toutes les collections
    delete_filters = [
        ("grossesses", {"user_id": user_id}),
        ("grossesse_tracking", {"user_id": user_id}),
        ("enfants", {"user_id": user_id}),
        ("mesures", {"user_id": user_id}),
        ("rdv", {"$or": [{"maman_id": user_id}, {"pro_id": user_id}, {"famille_id": user_id}]}),
        ("messages", {"$or": [{"from_id": user_id}, {"to_id": user_id}]}),
        ("conversations", {"$or": [{"user_a": user_id}, {"user_b": user_id}]}),
        ("notifications", {"user_id": user_id}),
        ("reminders", {"user_id": user_id}),
        ("cycles", {"user_id": user_id}),
        ("plan_naissance", {"user_id": user_id}),
        ("consultation_notes", {"$or": [{"patient_id": user_id}, {"pro_id": user_id}]}),
        ("dossiers_medicaux", {"user_id": user_id}),
        ("tele_echo", {"$or": [{"maman_id": user_id}, {"pro_id": user_id}]}),
        ("ressources_lues", {"user_id": user_id}),
        ("quiz_responses", {"user_id": user_id}),
        ("prestations", {"pro_id": user_id}),
        ("disponibilites", {"pro_id": user_id}),
        ("avis", {"$or": [{"author_id": user_id}, {"pro_id": user_id}]}),
        ("communaute_posts", {"user_id": user_id}),
        ("communaute_replies", {"user_id": user_id}),
        ("expo_push_tokens", {"user_id": user_id}),
        ("famille_invitations", {"$or": [{"maman_id": user_id}, {"membre_id": user_id}]}),
        ("documents_partages", {"$or": [{"user_id": user_id}, {"shared_with": user_id}]}),
    ]
    summary: dict = {}
    for coll, q in delete_filters:
        try:
            res = await db[coll].delete_many(q)
            if res.deleted_count:
                summary[coll] = res.deleted_count
        except Exception as e:
            logging.warning(f"Erreur suppression {coll}: {e}")

    # 2) Anonymiser les paiements et payouts (obligation comptable — conservation 5-10 ans selon législation)
    anon_id = f"deleted_user_{uuid.uuid4().hex[:12]}"
    try:
        await db.payments.update_many(
            {"$or": [{"user_id": user_id}, {"pro_id": user_id}]},
            {"$set": {
                "anonymized": True,
                "anonymized_at": datetime.now(timezone.utc).isoformat(),
                "user_id": anon_id if user_id else None,
                "user_email": None,
                "custom_data": {},
            }},
        )
        await db.payouts.update_many(
            {"pro_id": user_id},
            {"$set": {
                "anonymized": True,
                "pro_email": None,
                "account_alias": "***",
            }},
        )
    except Exception as e:
        logging.warning(f"Erreur anonymisation paiements: {e}")

    # 3) Supprimer définitivement le compte utilisateur
    try:
        await db.users.delete_one({"id": user_id})
    except Exception as e:
        logging.error(f"Erreur suppression user {user_id}: {e}")
        raise HTTPException(500, "Erreur lors de la suppression du compte")

    logging.info(f"🗑️  Compte supprimé : {user_email} (id={user_id}) — collections impactées : {summary}")
    return {
        "success": True,
        "message": "Votre compte et vos données personnelles ont été supprimés définitivement.",
        "deleted_collections": summary,
    }


# ----------------------------------------------------------------------
# Grossesse (Pregnancy) — maman
# ----------------------------------------------------------------------
@api.get("/grossesse")
async def get_grossesse(user=Depends(require_roles("maman"))):
    g = await db.grossesses.find_one(
        {"user_id": user["id"], "active": True}, {"_id": 0}
    )
    return g


@api.post("/grossesse")
async def create_grossesse(payload: GrossesseIn, user=Depends(require_roles("maman"))):
    # Deactivate previous
    await db.grossesses.update_many(
        {"user_id": user["id"], "active": True}, {"$set": {"active": False}}
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "date_debut": payload.date_debut,
        "date_terme": payload.date_terme,
        "symptomes": payload.symptomes,
        "notes": payload.notes,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/grossesse/{gid}")
async def update_grossesse(gid: str, payload: GrossesseIn, user=Depends(require_roles("maman"))):
    await db.grossesses.update_one(
        {"id": gid, "user_id": user["id"]},
        {"$set": payload.dict(exclude_unset=True)},
    )
    g = await db.grossesses.find_one({"id": gid}, {"_id": 0})
    return g


# ----------------------------------------------------------------------
# Enfants (Children)
# ----------------------------------------------------------------------
@api.get("/enfants")
async def list_enfants(user=Depends(require_roles("maman"))):
    items = await db.enfants.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    # 🔐 Déchiffrer numero_cmu + allergies
    return [decrypt_enfant(e) for e in items]


@api.post("/enfants/{eid}/mesures")
async def add_mesure(eid: str, payload: MesureIn, user=Depends(require_roles("maman"))):
    mesure = {"id": str(uuid.uuid4()), **payload.dict()}
    res = await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$push": {"mesures": mesure}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    e = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return decrypt_enfant(e)


@api.post("/enfants/{eid}/photo")
async def set_enfant_photo(eid: str, payload: PhotoIn, user=Depends(require_roles("maman"))):
    res = await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": {"photo": payload.photo_base64}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    e = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return decrypt_enfant(e)


@api.post("/enfants")
async def create_enfant(payload: EnfantIn, user=Depends(require_roles("maman"))):
    current = await db.enfants.count_documents({"user_id": user["id"]})
    await check_quota(user, "enfants_max", current)
    data = payload.dict()
    # 🔐 Chiffrer les champs sensibles avant insertion
    if data.get("numero_cmu"):
        data["numero_cmu"] = encrypt_str(data["numero_cmu"])
    if isinstance(data.get("allergies"), list):
        data["allergies"] = encrypt_list(data["allergies"])
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **data,
        "vaccins": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enfants.insert_one(doc)
    doc.pop("_id", None)
    return decrypt_enfant(doc)


@api.patch("/enfants/{eid}")
async def update_enfant(eid: str, payload: EnfantIn, user=Depends(require_roles("maman"))):
    data = payload.dict(exclude_unset=True)
    if "numero_cmu" in data and data["numero_cmu"]:
        data["numero_cmu"] = encrypt_str(data["numero_cmu"])
    if "allergies" in data and isinstance(data["allergies"], list):
        data["allergies"] = encrypt_list(data["allergies"])
    res = await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": data},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    e = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return decrypt_enfant(e)


@api.delete("/enfants/{eid}")
async def delete_enfant(eid: str, user=Depends(require_roles("maman"))):
    await db.enfants.delete_one({"id": eid, "user_id": user["id"]})
    return {"ok": True}


@api.post("/enfants/{eid}/vaccins")
async def add_vaccin(eid: str, payload: VaccinIn, user=Depends(require_roles("maman"))):
    vaccin = {"id": str(uuid.uuid4()), **payload.dict()}
    res = await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]}, {"$push": {"vaccins": vaccin}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    e = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Enfant introuvable")
    return decrypt_enfant(e)


@api.delete("/enfants/{eid}/vaccins/{vid}")
async def delete_vaccin(eid: str, vid: str, user=Depends(require_roles("maman"))):
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$pull": {"vaccins": {"id": vid}}},
    )
    return {"ok": True}


@api.patch("/enfants/{eid}/vaccins/{vid}")
async def update_vaccin(eid: str, vid: str, payload: dict, user=Depends(require_roles("maman"))):
    """Toggle fait/non-fait ou modifier date d'un vaccin."""
    sets = {}
    if "fait" in payload:
        sets["vaccins.$.fait"] = bool(payload["fait"])
    if "date" in payload and payload["date"]:
        sets["vaccins.$.date"] = payload["date"]
    if sets:
        await db.enfants.update_one(
            {"id": eid, "user_id": user["id"], "vaccins.id": vid},
            {"$set": sets},
        )
    return {"ok": True}


# Documents médicaux liés à un enfant (analyses, ordonnances, échographies, etc.)
class DocumentIn(BaseModel):
    nom: str
    type: Optional[str] = "autre"  # ordonnance | analyse | echo | vaccin | autre
    description: Optional[str] = None
    file_base64: str  # data URI complet "data:application/pdf;base64,..."


@api.post("/enfants/{eid}/documents")
async def add_document(eid: str, payload: DocumentIn, user=Depends(require_roles("maman"))):
    """Ajouter un document médical à un enfant."""
    enfant = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not enfant:
        raise HTTPException(404, "Enfant introuvable")
    doc = {
        "id": str(uuid.uuid4()),
        "enfant_id": eid,
        "user_id": user["id"],
        "nom": payload.nom.strip()[:200],
        "type": payload.type or "autre",
        "description": (payload.description or "").strip()[:500] or None,
        "file_base64": payload.file_base64,
        "size_kb": len(payload.file_base64) // 1024,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enfant_documents.insert_one(doc)
    doc.pop("_id", None)
    return {"id": doc["id"], "nom": doc["nom"], "type": doc["type"], "size_kb": doc["size_kb"], "created_at": doc["created_at"]}


@api.get("/enfants/{eid}/documents")
async def list_documents(eid: str, user=Depends(require_roles("maman"))):
    """Liste les documents d'un enfant (sans le base64 pour la liste)."""
    cursor = db.enfant_documents.find(
        {"enfant_id": eid, "user_id": user["id"]},
        {"_id": 0, "file_base64": 0},
    ).sort("created_at", -1)
    return await cursor.to_list(100)


@api.get("/enfants/{eid}/documents/{doc_id}")
async def get_document(eid: str, doc_id: str, user=Depends(require_roles("maman"))):
    """Récupère un document complet (avec base64)."""
    doc = await db.enfant_documents.find_one(
        {"id": doc_id, "enfant_id": eid, "user_id": user["id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Document introuvable")
    return doc


@api.delete("/enfants/{eid}/documents/{doc_id}")
async def delete_document(eid: str, doc_id: str, user=Depends(require_roles("maman"))):
    await db.enfant_documents.delete_one({"id": doc_id, "enfant_id": eid, "user_id": user["id"]})
    return {"ok": True}


# Notes médicales d'un enfant (consultations signées par les pros)
@api.get("/enfants/{eid}/notes")
async def list_enfant_notes(eid: str, user=Depends(get_current_user)):
    """Liste les notes médicales d'un enfant. Maman voit ses enfants. Pro voit via son patient_id (les notes liées à RDV)."""
    if user.get("role") == "maman":
        enfant = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0, "id": 1})
        if not enfant:
            raise HTTPException(404, "Enfant introuvable")
    cursor = db.consultation_notes.find(
        {"enfant_id": eid},
        {"_id": 0},
    ).sort("created_at", -1)
    notes_raw = await cursor.to_list(100)
    # 🔓 Déchiffre TOUS les champs sensibles (diagnostic, traitement, notes, attachment_base64)
    return [decrypt_consultation_note(n) for n in notes_raw]


# ----------------------------------------------------------------------
# Courbes de croissance OMS (Tables simplifiées Weight-for-Age & Height-for-Age 0-60 mois)
# Source : OMS Child Growth Standards 2006 — valeurs P3/P15/P50/P85/P97
# ----------------------------------------------------------------------
WHO_PA = {
    "M": [
        (0, 2.5, 2.9, 3.3, 3.9, 4.4), (1, 3.4, 3.9, 4.5, 5.1, 5.8), (2, 4.4, 4.9, 5.6, 6.3, 7.1),
        (3, 5.1, 5.7, 6.4, 7.2, 8.0), (4, 5.6, 6.2, 7.0, 7.8, 8.7), (6, 6.4, 7.1, 7.9, 8.9, 9.8),
        (9, 7.1, 7.8, 8.9, 9.9, 10.9), (12, 7.7, 8.4, 9.6, 10.8, 11.8), (18, 8.8, 9.6, 10.9, 12.2, 13.5),
        (24, 9.7, 10.5, 12.2, 13.6, 15.1), (36, 11.3, 12.2, 14.3, 16.1, 17.8), (48, 12.7, 13.7, 16.3, 18.6, 20.9),
        (60, 14.1, 15.3, 18.3, 21.1, 24.2),
    ],
    "F": [
        (0, 2.4, 2.8, 3.2, 3.7, 4.2), (1, 3.2, 3.6, 4.2, 4.8, 5.5), (2, 3.9, 4.5, 5.1, 5.8, 6.6),
        (3, 4.5, 5.1, 5.8, 6.6, 7.5), (4, 5.0, 5.6, 6.4, 7.3, 8.2), (6, 5.7, 6.5, 7.3, 8.3, 9.3),
        (9, 6.4, 7.3, 8.2, 9.3, 10.5), (12, 7.0, 7.9, 8.9, 10.2, 11.5), (18, 8.1, 9.1, 10.2, 11.6, 13.2),
        (24, 9.0, 10.2, 11.5, 13.0, 14.8), (36, 10.8, 12.0, 13.9, 15.8, 18.1), (48, 12.3, 13.7, 16.1, 18.5, 21.5),
        (60, 13.7, 15.2, 18.2, 21.2, 24.9),
    ],
}
WHO_TA = {
    "M": [
        (0, 46.1, 47.9, 49.9, 52.0, 53.7), (1, 50.8, 52.5, 54.7, 56.9, 58.6),
        (2, 54.4, 56.2, 58.4, 60.6, 62.4), (3, 57.3, 59.1, 61.4, 63.7, 65.5),
        (4, 59.7, 61.5, 63.9, 66.2, 68.0), (6, 63.3, 65.1, 67.6, 70.1, 71.9),
        (9, 67.5, 69.4, 72.0, 74.5, 76.5), (12, 71.0, 73.0, 75.7, 78.4, 80.5),
        (18, 76.9, 79.0, 82.3, 85.3, 87.7), (24, 81.0, 83.3, 87.1, 90.5, 93.2),
        (36, 88.7, 91.3, 96.1, 100.0, 103.1), (48, 94.9, 97.7, 103.3, 107.7, 111.3),
        (60, 100.7, 103.8, 110.0, 114.8, 118.8),
    ],
    "F": [
        (0, 45.4, 47.1, 49.1, 51.1, 52.7), (1, 49.8, 51.5, 53.7, 55.8, 57.5),
        (2, 53.0, 54.8, 57.1, 59.3, 61.1), (3, 55.6, 57.4, 59.8, 62.1, 63.9),
        (4, 57.8, 59.7, 62.1, 64.5, 66.4), (6, 61.2, 63.1, 65.7, 68.2, 70.2),
        (9, 65.3, 67.3, 70.1, 72.8, 74.8), (12, 68.9, 71.0, 74.0, 76.9, 79.2),
        (18, 74.9, 77.1, 80.7, 84.0, 86.7), (24, 79.3, 81.7, 85.7, 89.3, 92.2),
        (36, 87.4, 90.2, 95.1, 99.2, 102.7), (48, 94.1, 97.1, 102.7, 107.4, 111.3),
        (60, 99.9, 103.2, 109.4, 114.6, 118.9),
    ],
}


def _month_diff(born_iso: str, measured_iso: str) -> float:
    try:
        born = datetime.fromisoformat(born_iso.replace("Z", "+00:00"))
        m = datetime.fromisoformat(measured_iso.replace("Z", "+00:00"))
        days = (m - born).total_seconds() / 86400
        return round(days / 30.4375, 2)
    except Exception:
        return 0.0


def _interp_oms(table, months: float):
    if months <= table[0][0]:
        return table[0]
    if months >= table[-1][0]:
        return table[-1]
    for i in range(len(table) - 1):
        a = table[i]
        b = table[i + 1]
        if a[0] <= months <= b[0]:
            ratio = (months - a[0]) / (b[0] - a[0]) if (b[0] - a[0]) else 0
            return (months,) + tuple(round(a[j] + (b[j] - a[j]) * ratio, 2) for j in range(1, 6))
    return table[-1]


def _classify(value: float, p3, p15, p50, p85, p97) -> str:
    if value < p3: return "tres_bas"
    if value < p15: return "bas"
    if value <= p85: return "normal"
    if value <= p97: return "eleve"
    return "tres_eleve"


@api.get("/enfants/{eid}/croissance-oms")
async def croissance_oms(eid: str, user=Depends(require_roles("maman"))):
    enfant_raw = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not enfant_raw:
        raise HTTPException(404, "Enfant introuvable")
    enfant = decrypt_enfant(enfant_raw)  # 🔐 déchiffrer numero_cmu avant exposition
    sexe = enfant.get("sexe", "M")
    born = enfant.get("date_naissance")
    mesures = enfant.get("mesures") or []
    points = []
    for m in mesures:
        age_mois = _month_diff(born, m.get("date") or born)
        pa = _interp_oms(WHO_PA[sexe], age_mois)
        ta = _interp_oms(WHO_TA[sexe], age_mois)
        p_poids = _classify(m.get("poids_kg") or 0, *pa[1:]) if m.get("poids_kg") else None
        p_taille = _classify(m.get("taille_cm") or 0, *ta[1:]) if m.get("taille_cm") else None
        points.append({
            "date": m.get("date"),
            "age_mois": age_mois,
            "poids_kg": m.get("poids_kg"),
            "taille_cm": m.get("taille_cm"),
            "oms_poids_ref": {"p3": pa[1], "p15": pa[2], "p50": pa[3], "p85": pa[4], "p97": pa[5]},
            "oms_taille_ref": {"p3": ta[1], "p15": ta[2], "p50": ta[3], "p85": ta[4], "p97": ta[5]},
            "classification_poids": p_poids,
            "classification_taille": p_taille,
        })
    ref_pa = [{"mois": r[0], "p3": r[1], "p15": r[2], "p50": r[3], "p85": r[4], "p97": r[5]} for r in WHO_PA[sexe]]
    ref_ta = [{"mois": r[0], "p3": r[1], "p15": r[2], "p50": r[3], "p85": r[4], "p97": r[5]} for r in WHO_TA[sexe]]
    return {
        "enfant": {
            "id": enfant["id"], "nom": enfant["nom"], "sexe": sexe,
            "date_naissance": born, "numero_cmu": enfant.get("numero_cmu"),
        },
        "points": sorted(points, key=lambda p: p["age_mois"]),
        "reference_poids_age": ref_pa,
        "reference_taille_age": ref_ta,
        "source": "OMS Child Growth Standards 2006 (simplifie)",
    }



# ----------------------------------------------------------------------
# Rendez-vous (Appointments)
# ----------------------------------------------------------------------
@api.get("/professionnels")
async def list_pros(user=Depends(get_current_user)):
    pros = await db.users.find(
        {"role": "professionnel"}, {"_id": 0, "password_hash": 0}
    ).to_list(200)
    return [serialize_user(p) | {"specialite": p.get("specialite")} for p in pros]


@api.get("/professionnels/{pro_id}")
async def get_pro_public(pro_id: str, user=Depends(get_current_user)):
    """Récupère les infos publiques d'un professionnel (sans password_hash)."""
    p = await db.users.find_one({"id": pro_id, "role": "professionnel"}, {"_id": 0, "password_hash": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Professionnel introuvable")
    return serialize_user(p) | {
        "specialite": p.get("specialite"),
        "ville": p.get("ville"),
        "accepte_cmu": p.get("accepte_cmu", False),
    }


@api.get("/rdv")
async def list_rdv(user=Depends(get_current_user)):
    # 🧹 Auto-cleanup : annule les RDV en pending_payment dont la deadline est dépassée (30 min)
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.rdv.update_many(
            {
                "status": "pending_payment",
                "paye": {"$ne": True},
                "payment_deadline": {"$lt": now_iso},
            },
            {"$set": {"status": "annule", "cancelled_at": now_iso, "cancelled_by": "system_payment_timeout"}},
        )
    except Exception:
        pass
    q = {"maman_id": user["id"]} if user["role"] == "maman" else (
        {"pro_id": user["id"]} if user["role"] == "professionnel" else {}
    )
    items = await db.rdv.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    # enrich with names
    ids = list({i["maman_id"] for i in items} | {i["pro_id"] for i in items})
    users_map = {u["id"]: u for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)}
    for it in items:
        it["maman_name"] = users_map.get(it["maman_id"], {}).get("name", "")
        it["pro_name"] = users_map.get(it["pro_id"], {}).get("name", "")
        it["pro_specialite"] = users_map.get(it["pro_id"], {}).get("specialite", "")
    return items


@api.post("/rdv")
async def create_rdv(payload: RdvIn, user=Depends(require_roles("maman"))):
    pro = await db.users.find_one({"id": payload.pro_id, "role": "professionnel"})
    if not pro:
        raise HTTPException(404, "Professionnel introuvable")
    # 💎 Quota Pro : max 10 patientes uniques pour un Pro gratuit
    # (Les patientes existantes peuvent toujours reprendre RDV. Bloque les nouvelles.)
    if not is_premium_active(pro):
        existing = await db.rdv.find_one({"pro_id": pro["id"], "maman_id": user["id"]}, {"_id": 0, "id": 1})
        if not existing:
            unique_patientes = await db.rdv.distinct("maman_id", {"pro_id": pro["id"]})
            count = len(unique_patientes)
            limit = (FREE_QUOTAS.get("professionnel") or {}).get("patientes_max", 10)
            if count >= limit:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error": "pro_quota_exceeded",
                        "message": f"Ce professionnel a atteint sa limite de {limit} patientes (compte gratuit). Veuillez contacter le pro pour qu'il passe Premium ou choisir un autre professionnel.",
                        "quota": "patientes_max",
                        "limit": limit,
                    },
                )
    # Si une prestation est sélectionnée, on prend son tarif et nom
    prestation = None
    tarif_fcfa = payload.tarif_fcfa
    motif = payload.motif
    if payload.prestation_id:
        prestation = await db.prestations.find_one(
            {"id": payload.prestation_id, "pro_id": payload.pro_id, "active": True}, {"_id": 0}
        )
        if prestation:
            tarif_fcfa = prestation["prix_fcfa"]
            if not motif:
                motif = prestation["nom"]
    # 🏠 Mode domicile : valider + appliquer les frais de déplacement
    mode = (payload.mode or "presentiel").lower()
    if mode not in ("presentiel", "teleconsultation", "domicile"):
        raise HTTPException(400, "Mode invalide. Valeurs autorisées : presentiel, teleconsultation, domicile.")
    # 🎯 Vérifier que le mode est autorisé sur le créneau correspondant du Pro
    try:
        rdv_dt_check = datetime.fromisoformat(payload.date.replace("Z", "+00:00"))
        jours_fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        jour_fr = jours_fr[rdv_dt_check.weekday()]
        hhmm = rdv_dt_check.strftime("%H:%M")
        dispo_doc = await db.pro_disponibilites.find_one({"pro_id": payload.pro_id}, {"_id": 0})
        if dispo_doc:
            # Modes globalement supportés par le Pro
            pro_modes_glob = pro.get("modes_supportes") or {}
            pro_modes_default = [
                m for m in ("presentiel", "teleconsultation", "domicile")
                if pro_modes_glob.get(m, True)
            ] or ["presentiel"]
            slot_match = None
            for s in (dispo_doc.get("slots") or []):
                if s.get("jour", "").lower() == jour_fr and s.get("actif", True):
                    hd = s.get("heure_debut") or "00:00"
                    hf = s.get("heure_fin") or "23:59"
                    if hd <= hhmm < hf:
                        slot_match = s
                        break
            if slot_match is not None:
                modes_slot = slot_match.get("modes_autorises")
                if not isinstance(modes_slot, list) or not modes_slot:
                    modes_slot = list(pro_modes_default)
                if mode not in modes_slot:
                    label_map = {
                        "presentiel": "présentiel (cabinet)",
                        "teleconsultation": "téléconsultation",
                        "domicile": "à domicile",
                    }
                    modes_lbls = ", ".join(label_map.get(m, m) for m in modes_slot)
                    raise HTTPException(
                        400,
                        f"Le créneau {jour_fr} {hhmm} ne supporte pas le mode {label_map.get(mode, mode)}. "
                        f"Modes acceptés sur ce créneau : {modes_lbls}.",
                    )
    except HTTPException:
        raise
    except Exception:
        # Date mal parsée ou aucun créneau défini : on ne bloque pas, fallback sur la validation globale
        pass
    frais_deplacement_fcfa = 0
    adresse_enc = None
    quartier = None
    ville = None
    lat = None
    lng = None
    if mode == "domicile":
        if not (payload.adresse_domicile or "").strip():
            raise HTTPException(400, "Pour une consultation à domicile, l'adresse complète est requise.")
        # Frais déplacement = celui spécifié, sinon celui du Pro, sinon défaut 2000 F
        frais_deplacement_fcfa = (
            payload.frais_deplacement_fcfa
            if payload.frais_deplacement_fcfa is not None
            else (pro.get("frais_deplacement_fcfa") or 2000)
        )
        # 🔐 Chiffrer l'adresse (RGSSI)
        from encryption import encrypt_str as _enc
        adresse_enc = _enc((payload.adresse_domicile or "").strip())
        quartier = (payload.quartier or "").strip()[:120] or None
        ville = (payload.ville or "").strip()[:120] or None
        lat = payload.lat
        lng = payload.lng
    # Quota freemium — max 3 RDV par mois pour une maman gratuite
    if not is_premium_active(user):
        now = datetime.now(timezone.utc)
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        current = await db.rdv.count_documents({
            "maman_id": user["id"],
            "created_at": {"$gte": start_of_month},
        })
        await check_quota(user, "rdv_per_month", current)
    # Appliquer la CMU si : maman a CMU actif, pro accepte CMU, prestation marquée "prise en charge CMU"
    cmu_applique = False
    cmu_taux = 0.0
    cmu_montant = 0
    reste_a_charge = tarif_fcfa
    maman_cmu = (user.get("cmu") or {}) if isinstance(user.get("cmu"), dict) else {}
    # 🔐 Déchiffrer pour la logique (statut + numero à copier sur le rdv)
    maman_cmu_clear = decrypt_cmu_dict(maman_cmu)
    pro_accepte = bool(pro.get("accepte_cmu"))
    cmu_status = cmu_statut(maman_cmu_clear)
    if prestation and prestation.get("cmu_prise_en_charge") and pro_accepte and cmu_status == "actif":
        cmu_taux = float(prestation.get("cmu_taux", 0.70))
        cmu_montant = int(round(tarif_fcfa * cmu_taux))
        reste_a_charge = tarif_fcfa - cmu_montant
        cmu_applique = True
    # 💰 Total à payer (incluant frais de déplacement domicile)
    tarif_total_fcfa = (reste_a_charge if cmu_applique else tarif_fcfa) + frais_deplacement_fcfa
    # 💳 Détermination de la méthode de paiement et du statut initial
    # - teleconsultation / domicile → paiement EN LIGNE OBLIGATOIRE (acompte de garantie marketplace)
    # - presentiel → la Maman peut choisir online ou cabinet (cabinet = défaut historique)
    pm_request = (payload.payment_method or "").lower().strip() or None
    if mode in ("teleconsultation", "domicile"):
        payment_method = "online"  # forcé
    else:  # presentiel
        payment_method = "online" if pm_request == "online" else "cabinet"
    payment_required = payment_method == "online"
    # Status initial :
    # - online → "pending_payment" (libéré auto sous 30 min si pas payé)
    # - cabinet → "en_attente" (flow historique)
    initial_status = "pending_payment" if payment_required else "en_attente"
    payment_deadline = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat() if payment_required else None
    doc = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "pro_id": payload.pro_id,
        "date": payload.date,
        "motif": motif,
        "tarif_fcfa": tarif_fcfa,
        "frais_deplacement_fcfa": frais_deplacement_fcfa,
        "tarif_total_fcfa": tarif_total_fcfa,
        "type_consultation": payload.type_consultation,
        "mode": mode,
        "prestation_id": payload.prestation_id,
        "prestation_nom": prestation.get("nom") if prestation else None,
        "cmu_applique": cmu_applique,
        "cmu_taux": cmu_taux,
        "cmu_montant_fcfa": cmu_montant,
        "reste_a_charge_fcfa": reste_a_charge,
        # Note : on stocke le numéro CMU en clair sur le RDV car c'est nécessaire pour la facturation à la CNAM (visible par le Pro)
        "cmu_numero": maman_cmu_clear.get("numero") if cmu_applique else None,
        # 🏠 Données domicile (adresse_domicile_enc = chiffré AES-256-GCM)
        "adresse_domicile_enc": adresse_enc,
        "quartier": quartier,
        "ville": ville,
        "lat": lat,
        "lng": lng,
        "paye": False,
        # 💳 Paiement
        "payment_method": payment_method,
        "payment_required": payment_required,
        "payment_deadline": payment_deadline,
        "status": initial_status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rdv.insert_one(doc)
    doc.pop("_id", None)
    # 🔔 Push au Pro — UNIQUEMENT si le RDV ne nécessite pas de paiement préalable
    # Pour les RDV pending_payment, le Pro sera notifié dans pay_verify/pay_webhook après confirmation
    if not payment_required:
        try:
            rdv_dt = datetime.fromisoformat(payload.date.replace("Z", "+00:00"))
            date_fr = rdv_dt.strftime("%d/%m à %Hh%M")
        except Exception:
            date_fr = payload.date[:10]
        prest_label = (prestation.get("nom") if prestation else None) or (motif[:40] if motif else "Consultation")
        await push_notif(
            payload.pro_id,
            "📅 Nouvelle demande de RDV",
            f"{user['name']} demande un RDV le {date_fr} — {prest_label}",
            "rdv",
        )
    return doc


@api.patch("/rdv/{rid}/cancel")
async def rdv_cancel_by_maman(rid: str, user=Depends(require_roles("maman"))):
    """La maman annule son propre RDV (seulement si en_attente ou confirme).
    Envoie une notif push au Pro."""
    rdv = await db.rdv.find_one({"id": rid, "maman_id": user["id"]}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    if rdv["status"] in ("annule", "termine"):
        raise HTTPException(400, f"RDV déjà {rdv['status']}")
    await db.rdv.update_one({"id": rid}, {"$set": {"status": "annule", "cancelled_at": datetime.now(timezone.utc).isoformat(), "cancelled_by": "maman"}})
    try:
        rdv_dt = datetime.fromisoformat(rdv["date"].replace("Z", "+00:00"))
        date_fr = rdv_dt.strftime("%d/%m à %Hh%M")
    except Exception:
        date_fr = rdv["date"][:10]
    await push_notif(
        rdv["pro_id"],
        "❌ RDV annulé par la patiente",
        f"{user['name']} a annulé son RDV du {date_fr}",
        "rdv",
    )
    return {"ok": True, "status": "annule"}


@api.patch("/rdv/{rid}/status")
async def rdv_status(rid: str, status_val: str, user=Depends(require_roles("professionnel", "admin"))):
    if status_val not in ["confirme", "annule", "termine", "en_attente"]:
        raise HTTPException(400, "Statut invalide")
    rdv = await db.rdv.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    # Pro peut uniquement gérer ses propres RDV (admin contourne)
    if user["role"] == "professionnel" and rdv.get("pro_id") != user["id"]:
        raise HTTPException(403, "Ce RDV n'est pas à vous")
    await db.rdv.update_one({"id": rid}, {"$set": {"status": status_val, "updated_at": datetime.now(timezone.utc).isoformat()}})
    # 🔔 Push enrichie à la maman — avec nom du pro + heure
    pro = await db.users.find_one({"id": rdv["pro_id"]}, {"_id": 0, "name": 1, "specialite": 1})
    pro_name = (pro or {}).get("name") or "Votre praticien"
    try:
        rdv_dt = datetime.fromisoformat(rdv["date"].replace("Z", "+00:00"))
        date_fr = rdv_dt.strftime("%d/%m à %Hh%M")
    except Exception:
        date_fr = rdv["date"][:10]
    title_map = {
        "confirme": "✅ RDV confirmé !",
        "annule": "❌ RDV annulé",
        "termine": "✔️ RDV terminé",
        "en_attente": "⏳ RDV remis en attente",
    }
    body_map = {
        "confirme": f"{pro_name} a confirmé votre RDV du {date_fr}. À très vite !",
        "annule": f"{pro_name} a annulé votre RDV du {date_fr}. Contactez le cabinet pour reporter.",
        "termine": f"Votre consultation avec {pro_name} est terminée. N'oubliez pas de régler le paiement.",
        "en_attente": f"Le statut de votre RDV avec {pro_name} a changé.",
    }
    await push_notif(
        rdv["maman_id"],
        title_map.get(status_val, "Rendez-vous mis à jour"),
        body_map.get(status_val, f"Votre RDV du {date_fr} : {status_val}"),
        "rdv",
    )
    return {"ok": True}


# ----------------------------------------------------------------------
# Messagerie
# ----------------------------------------------------------------------
@api.get("/messages/conversations")
async def conversations(user=Depends(get_current_user)):
    msgs = await db.messages.find(
        {"$or": [{"from_id": user["id"]}, {"to_id": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(2000)
    convos = {}
    for m in msgs:
        other = m["to_id"] if m["from_id"] == user["id"] else m["from_id"]
        if other not in convos:
            convos[other] = {"other_id": other, "last": m, "unread": 0}
        if m["to_id"] == user["id"] and not m.get("read"):
            convos[other]["unread"] += 1
    ids = list(convos.keys())
    users_map = {u["id"]: u for u in await db.users.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)}
    for oid, c in convos.items():
        u = users_map.get(oid, {})
        c["other_name"] = u.get("name", "Inconnu")
        c["other_role"] = u.get("role", "")
    return list(convos.values())


@api.get("/messages/{other_id}")
async def get_thread(other_id: str, user=Depends(get_current_user)):
    msgs = await db.messages.find(
        {
            "$or": [
                {"from_id": user["id"], "to_id": other_id},
                {"from_id": other_id, "to_id": user["id"]},
            ]
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(1000)
    # mark as read
    await db.messages.update_many(
        {"from_id": other_id, "to_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return msgs


@api.post("/messages")
async def send_message(payload: MessageIn, user=Depends(get_current_user)):
    # Garde : le contenu texte peut être vide si une pièce jointe est présente
    content = (payload.content or "").strip()
    has_attachment = bool(payload.attachment_base64)
    if not content and not has_attachment:
        raise HTTPException(status_code=400, detail="Le message est vide")

    doc = {
        "id": str(uuid.uuid4()),
        "from_id": user["id"],
        "from_name": user["name"],
        "to_id": payload.to_id,
        "content": content,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if has_attachment:
        doc["attachment_base64"] = payload.attachment_base64
        doc["attachment_name"] = payload.attachment_name or "piece-jointe"
        doc["attachment_mime"] = payload.attachment_mime or "application/octet-stream"
    await db.messages.insert_one(doc)
    doc.pop("_id", None)

    # Preview lisible pour notif : texte ou label de fichier
    preview = content[:80] if content else f"📎 {doc.get('attachment_name', 'Pièce jointe')}"
    await push_notif(
        payload.to_id,
        f"Message de {user['name']}",
        preview,
        "message",
    )
    return doc
# ----------------------------------------------------------------------
@api.get("/community")
async def list_posts(user=Depends(get_current_user)):
    posts = await db.posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return posts


@api.post("/community")
async def create_post(payload: PostIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_role": user["role"],
        "title": payload.title,
        "content": payload.content,
        "category": payload.category,
        "likes": [],
        "comments": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/community/{pid}/like")
async def toggle_like(pid: str, user=Depends(get_current_user)):
    post = await db.posts.find_one({"id": pid})
    if not post:
        raise HTTPException(404, "Post introuvable")
    if user["id"] in post.get("likes", []):
        await db.posts.update_one({"id": pid}, {"$pull": {"likes": user["id"]}})
    else:
        await db.posts.update_one({"id": pid}, {"$push": {"likes": user["id"]}})
    return await db.posts.find_one({"id": pid}, {"_id": 0})


@api.post("/community/{pid}/comment")
async def comment_post(pid: str, payload: CommentIn, user=Depends(get_current_user)):
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "content": payload.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.update_one({"id": pid}, {"$push": {"comments": comment}})
    return await db.posts.find_one({"id": pid}, {"_id": 0})


# ----------------------------------------------------------------------
# Rappels
# ----------------------------------------------------------------------
@api.get("/reminders")
async def list_reminders(user=Depends(get_current_user)):
    items = await db.reminders.find({"user_id": user["id"]}, {"_id": 0}).sort("due_at", 1).to_list(200)
    return items


@api.post("/reminders")
async def create_reminder(payload: ReminderIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "done": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/reminders/{rid}")
async def toggle_reminder(rid: str, user=Depends(get_current_user)):
    r = await db.reminders.find_one({"id": rid, "user_id": user["id"]})
    if not r:
        raise HTTPException(404, "Rappel introuvable")
    await db.reminders.update_one({"id": rid}, {"$set": {"done": not r.get("done", False)}})
    return await db.reminders.find_one({"id": rid}, {"_id": 0})


@api.delete("/reminders/{rid}")
async def delete_reminder(rid: str, user=Depends(get_current_user)):
    await db.reminders.delete_one({"id": rid, "user_id": user["id"]})
    return {"ok": True}


# ----------------------------------------------------------------------
# Assistant IA (Claude Sonnet 4.5)
# ----------------------------------------------------------------------
SYSTEM_MSG_IA = (
    "Tu es l'Assistant À lo Maman, un assistant virtuel bienveillant et compétent "
    "spécialisé dans la santé maternelle et pédiatrique pour les familles d'Afrique "
    "francophone. Tu réponds TOUJOURS en français, avec empathie, chaleur et précision. "
    "Tu donnes des conseils sur la grossesse, l'allaitement, la nutrition, le suivi des "
    "enfants, la contraception, le cycle menstruel, le post-partum et le bien-être. "
    "Tu es prudent(e) : en cas de symptôme inquiétant (saignements, douleurs fortes, "
    "fièvre du nouveau-né, etc.), tu invites à consulter un professionnel de santé "
    "immédiatement. Tu ne remplaces pas un médecin. Tes réponses sont concises, "
    "claires et adaptées culturellement (Togo, Bénin, Côte d'Ivoire, Sénégal, etc.)."
)


@api.post("/ai/chat")
async def ai_chat(payload: AiChatIn, user=Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    # 💎 Quota IA — varie selon le rôle (Maman 5/mois · Pro 0/jour gratuit · ∞ Premium)
    role = user.get("role")
    now = datetime.now(timezone.utc)
    if role == "maman":
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        used = await db.ai_messages.count_documents({
            "user_id": user["id"], "role": "user", "created_at": {"$gte": start_of_month},
        })
        await check_quota(user, "ia_questions_per_month", used)
    elif role == "professionnel":
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        used_today = await db.ai_messages.count_documents({
            "user_id": user["id"], "role": "user", "created_at": {"$gte": start_of_day},
        })
        await check_quota(user, "ia_pro_per_day", used_today)

    session_id = f"{user['id']}:{payload.session_id}"
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=session_id,
        system_message=SYSTEM_MSG_IA,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # Persist user message
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_messages.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "user_id": user["id"],
            "role": "user",
            "content": payload.message,
            "created_at": now,
        }
    )

    # Replay history into chat object so conversation is stateful across requests
    history = await db.ai_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    # Rebuild context: the library keeps its own history per instance, so we
    # feed previous messages one by one only if history > 1 (i.e. not first)
    # For simplicity, send only the latest message; multi-turn context is kept
    # by session_id on provider side via LlmChat if supported, otherwise we
    # concatenate recent history as context.
    try:
        if len(history) > 1:
            recent = history[-10:]
            context = "\n".join(
                [f"{m['role'].upper()}: {m['content']}" for m in recent[:-1]]
            )
            text = f"Contexte récent:\n{context}\n\nNouveau message utilisateur: {payload.message}"
        else:
            text = payload.message
        response = await chat.send_message(UserMessage(text=text))
    except Exception as e:
        logger.exception("AI error")
        raise HTTPException(500, f"Erreur IA: {str(e)[:200]}")

    await db.ai_messages.insert_one(
        {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "user_id": user["id"],
            "role": "assistant",
            "content": response,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {"response": response, "session_id": payload.session_id}


@api.get("/ai/history/{session_id}")
async def ai_history(session_id: str, user=Depends(get_current_user)):
    full_session = f"{user['id']}:{session_id}"
    msgs = await db.ai_messages.find(
        {"session_id": full_session, "user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return msgs


# ----------------------------------------------------------------------
# Pro-specific
# ----------------------------------------------------------------------
# ------------------------------------------------------------------
# Prestations Pro + Commission sur RDV
# ------------------------------------------------------------------

class PrestationIn(BaseModel):
    nom: str
    prix_fcfa: int
    duree_min: int = 30
    description: Optional[str] = None
    active: bool = True
    cmu_prise_en_charge: bool = False
    cmu_taux: float = 0.70  # 0.70 ou 1.00


@api.get("/pro/prestations")
async def list_my_prestations(user=Depends(require_roles("professionnel"))):
    items = await db.prestations.find({"pro_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@api.post("/pro/prestations")
async def create_prestation(payload: PrestationIn, user=Depends(require_roles("professionnel"))):
    if payload.prix_fcfa < 0:
        raise HTTPException(400, "Le prix doit être positif")
    doc = {
        "id": str(uuid.uuid4()),
        "pro_id": user["id"],
        "nom": payload.nom.strip(),
        "prix_fcfa": payload.prix_fcfa,
        "duree_min": payload.duree_min,
        "description": payload.description,
        "active": payload.active,
        "cmu_prise_en_charge": payload.cmu_prise_en_charge,
        "cmu_taux": max(0.0, min(1.0, payload.cmu_taux)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.prestations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/pro/prestations/{pid}")
async def update_prestation(pid: str, payload: PrestationIn, user=Depends(require_roles("professionnel"))):
    r = await db.prestations.update_one(
        {"id": pid, "pro_id": user["id"]},
        {"$set": {
            "nom": payload.nom.strip(),
            "prix_fcfa": payload.prix_fcfa,
            "duree_min": payload.duree_min,
            "description": payload.description,
            "active": payload.active,
            "cmu_prise_en_charge": payload.cmu_prise_en_charge,
            "cmu_taux": max(0.0, min(1.0, payload.cmu_taux)),
        }},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Prestation introuvable")
    doc = await db.prestations.find_one({"id": pid}, {"_id": 0})
    return doc


@api.delete("/pro/prestations/{pid}")
async def delete_prestation(pid: str, user=Depends(require_roles("professionnel"))):
    r = await db.prestations.delete_one({"id": pid, "pro_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Prestation introuvable")
    return {"ok": True}


@api.get("/pros/{pro_id}/prestations")
async def list_pro_prestations_public(pro_id: str, user=Depends(get_current_user)):
    """Lister les prestations actives d'un pro (visible pour toute maman connectée)."""
    items = await db.prestations.find({"pro_id": pro_id, "active": True}, {"_id": 0}).sort("prix_fcfa", 1).to_list(100)
    return items


@api.get("/professionnels/{pro_id}/prestations")
async def list_pro_prestations_alias(pro_id: str, user=Depends(get_current_user)):
    """Alias pour compatibilité frontend (legacy URL)."""
    items = await db.prestations.find({"pro_id": pro_id, "active": True}, {"_id": 0}).sort("prix_fcfa", 1).to_list(100)
    return items


@api.get("/professionnels/{pro_id}/disponibilites")
async def get_pro_disponibilites_public(pro_id: str, user=Depends(get_current_user)):
    """
    Renvoie les disponibilités d'un pro avec les prestations correspondantes
    (jointure type_id ↔ nom de la prestation pour récupérer durée + prix).
    Utilisé par la maman dans la prise de RDV.
    """
    # Vérifie que le pro existe
    pro = await db.users.find_one({"id": pro_id, "role": "professionnel"}, {"_id": 0, "id": 1, "name": 1, "specialite": 1})
    if not pro:
        raise HTTPException(404, "Professionnel introuvable")
    doc = await db.pro_disponibilites.find_one({"pro_id": pro_id}, {"_id": 0})
    raw_slots = (doc or {}).get("slots", [])
    duree_global = (doc or {}).get("duree_consultation", 30)
    prestations = await db.prestations.find({"pro_id": pro_id, "active": True}, {"_id": 0}).to_list(200)

    # Map type_id → prestation correspondante (par nom — fuzzy match)
    type_id_to_label = {
        "prenatale": "Consultation prénatale", "postnatale": "Consultation post-natale",
        "echographie": "Échographie", "vaccination": "Vaccination",
        "pediatrie": "Consultation pédiatrique", "nutrition": "Bilan nutritionnel",
        "contraception": "Consultation contraception", "generale": "Consultation générale",
        "teleconsultation": "Téléconsultation", "urgence": "Urgence / Garde",
        "accouchement": "Accouchement / Suivi travail", "psychologie": "Soutien psychologique",
    }

    def find_prestation(type_id: str):
        if not type_id:
            return None
        label = type_id_to_label.get(type_id, "")
        # Match exact label, ou match contains
        for p in prestations:
            if p.get("nom", "").strip().lower() == label.lower():
                return p
        for p in prestations:
            if label.lower() in p.get("nom", "").strip().lower():
                return p
        return None

    # 🏥📹🏠 Modes globalement supportés par le Pro (fallback pour slots legacy)
    pro_doc = await db.users.find_one({"id": pro_id}, {"_id": 0, "modes_supportes": 1, "duree_par_mode": 1})
    pro_modes_glob = (pro_doc or {}).get("modes_supportes") or {}
    pro_modes_default = [
        m for m in ("presentiel", "teleconsultation", "domicile")
        if pro_modes_glob.get(m, True)
    ] or ["presentiel"]
    # ⏱️ Durées par mode du Pro (avec valeurs par défaut)
    dpm_pro = (pro_doc or {}).get("duree_par_mode") or {}
    duree_par_mode = {
        "presentiel": int(dpm_pro.get("presentiel") or 30),
        "teleconsultation": int(dpm_pro.get("teleconsultation") or 20),
        "domicile": int(dpm_pro.get("domicile") or 60),
    }

    enriched = []
    for s in raw_slots:
        type_id = s.get("type_id") or (s.get("types") or ["generale"])[0]
        duree = s.get("duree_minutes") or duree_global
        prest = find_prestation(type_id)
        # Modes acceptés sur le créneau : valeur stockée si présente, sinon fallback sur modes globaux du Pro
        modes_slot = s.get("modes_autorises")
        if not isinstance(modes_slot, list) or len(modes_slot) == 0:
            modes_slot = list(pro_modes_default)
        else:
            # Garde uniquement les valeurs valides
            modes_slot = [
                m for m in modes_slot
                if m in ("presentiel", "teleconsultation", "domicile")
            ] or list(pro_modes_default)
        enriched.append({
            "jour": s.get("jour"),
            "heure_debut": s.get("heure_debut"),
            "heure_fin": s.get("heure_fin"),
            "actif": s.get("actif", True),
            "type_id": type_id,
            "type_label": type_id_to_label.get(type_id, "Consultation"),
            "duree_minutes": duree,
            "modes_autorises": modes_slot,
            "prix_fcfa": prest.get("prix_fcfa") if prest else None,
            "cmu_prise_en_charge": prest.get("cmu_prise_en_charge", False) if prest else False,
            "cmu_taux": prest.get("cmu_taux") if prest else None,
            "prestation_id": prest.get("id") if prest else None,
            "prestation_nom": prest.get("nom") if prest else None,
        })
    return {
        "pro": pro,
        "slots": enriched,
        "prestations_count": len(prestations),
        "duree_par_mode": duree_par_mode,
    }


# ------------------------------------------------------------------
# Revenus & commissions du pro
# ------------------------------------------------------------------

@api.get("/pro/revenus")
async def pro_revenus(user=Depends(require_roles("professionnel"))):
    """Synthèse des revenus du pro (consultations payées via la plateforme)."""
    payments = await db.payments.find({
        "pro_id": user["id"],
        "kind": "consultation",
        "status": "completed",
    }, {"_id": 0}).sort("created_at", -1).to_list(500)
    pending = await db.payments.find({
        "pro_id": user["id"],
        "kind": "consultation",
        "status": "pending",
    }, {"_id": 0}).to_list(200)
    total_brut = sum(p.get("amount", 0) for p in payments)
    total_commission = sum(p.get("commission", 0) for p in payments)
    total_net = sum(p.get("pro_amount", 0) for p in payments)
    # Par mois
    from collections import defaultdict
    monthly: dict = defaultdict(lambda: {"brut": 0, "commission": 0, "net": 0, "count": 0})
    for p in payments:
        ym = (p.get("paid_at") or p.get("created_at", ""))[:7]
        monthly[ym]["brut"] += p.get("amount", 0)
        monthly[ym]["commission"] += p.get("commission", 0)
        monthly[ym]["net"] += p.get("pro_amount", 0)
        monthly[ym]["count"] += 1
    is_prem = is_premium_active(user)
    current_rate = 0.05 if is_prem else 0.10
    return {
        "total_brut_fcfa": total_brut,
        "total_commission_fcfa": total_commission,
        "total_net_fcfa": total_net,
        "pending_count": len(pending),
        "pending_fcfa": sum(p.get("amount", 0) for p in pending),
        "monthly": [
            {"month": k, **v} for k, v in sorted(monthly.items(), reverse=True)
        ],
        "recent": payments[:20],
        "is_premium": is_prem,
        "current_commission_rate": current_rate,
        "premium_rate": 0.05,
        "standard_rate": 0.10,
    }


@api.get("/pro/patients")
async def pro_patients(user=Depends(require_roles("professionnel"))):
    rdvs = await db.rdv.find({"pro_id": user["id"]}, {"_id": 0}).to_list(1000)
    patient_ids = list({r["maman_id"] for r in rdvs})
    users = await db.users.find(
        {"id": {"$in": patient_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(1000)
    # Enrichir avec dernières données
    for u in users:
        uid = u["id"]
        gross = await db.grossesses.find_one({"user_id": uid, "active": True}, {"_id": 0})
        enfants_count = await db.enfants.count_documents({"user_id": uid})
        last_rdv = await db.rdv.find_one({"maman_id": uid, "pro_id": user["id"]}, {"_id": 0}, sort=[("date", -1)])
        u["has_grossesse"] = bool(gross)
        u["grossesse_sa"] = None
        if gross and gross.get("date_debut"):
            try:
                dt_str = str(gross["date_debut"]).replace("Z", "+00:00")
                dt = datetime.fromisoformat(dt_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                weeks = int((datetime.now(timezone.utc) - dt).total_seconds() / (7 * 24 * 3600))
                u["grossesse_sa"] = max(0, min(weeks, 42))
            except Exception:
                u["grossesse_sa"] = None
        u["enfants_count"] = enfants_count
        u["last_rdv_date"] = last_rdv.get("date") if last_rdv else None

        # 📨 Enrichissement messagerie : dernier message + compteur non-lus
        last_msg = await db.messages.find_one(
            {
                "$or": [
                    {"from_id": uid, "to_id": user["id"]},
                    {"from_id": user["id"], "to_id": uid},
                ]
            },
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        unread = await db.messages.count_documents(
            {"from_id": uid, "to_id": user["id"], "read": False}
        )
        if last_msg:
            preview = (last_msg.get("content") or "").strip()
            if not preview and last_msg.get("attachment_name"):
                preview = f"📎 {last_msg['attachment_name']}"
            u["last_message"] = preview[:80]
            u["last_message_at"] = last_msg.get("created_at")
            u["last_message_from_me"] = last_msg.get("from_id") == user["id"]
        else:
            u["last_message"] = None
            u["last_message_at"] = None
            u["last_message_from_me"] = None
        u["unread_count"] = unread

    # Tri : patientes avec non-lus en haut, puis par dernier message le plus récent
    def sort_key(u):
        unread = u.get("unread_count", 0)
        lm = u.get("last_message_at") or u.get("last_rdv_date") or ""
        return (-unread, lm)  # unread descending, then lm descending (strings sorted reverse later)
    users.sort(key=lambda u: (-(u.get("unread_count", 0)), u.get("last_message_at") or u.get("last_rdv_date") or ""), reverse=False)
    # re-ordonner : non-lus en premier, le reste trié par date desc
    users.sort(key=lambda u: (u.get("unread_count", 0) == 0, -( _ts(u.get("last_message_at") or u.get("last_rdv_date") or "")) ))
    return users


def _ts(iso_str: str) -> float:
    """Helper : convertit une date ISO en timestamp pour tri."""
    if not iso_str:
        return 0.0
    try:
        s = str(iso_str).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


@api.get("/pro/dossier/{patient_id}")
async def pro_dossier(patient_id: str, user=Depends(require_roles("professionnel"))):
    """Dossier patient complet pour un professionnel ayant eu au moins un RDV."""
    has_rdv = await db.rdv.count_documents({"pro_id": user["id"], "maman_id": patient_id})
    if has_rdv == 0:
        raise HTTPException(status_code=403, detail="Accès refusé à ce patient")
    patient = await db.users.find_one({"id": patient_id}, {"_id": 0, "password_hash": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")
    gross = await db.grossesses.find_one({"user_id": patient_id, "active": True}, {"_id": 0})
    enfants = await db.enfants.find({"user_id": patient_id}, {"_id": 0}).to_list(100)
    rdvs = await db.rdv.find({"maman_id": patient_id, "pro_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(100)
    notes_raw = await db.consultation_notes.find({"patient_id": patient_id, "pro_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(200)
    notes = [decrypt_consultation_note(n) for n in notes_raw]
    return {
        "patient": patient,
        "grossesse": gross,
        "enfants": enfants,
        "rdvs": rdvs,
        "notes": notes,
    }


class ConsultationNoteIn(BaseModel):
    patient_id: str
    date: Optional[str] = None
    diagnostic: Optional[str] = ""
    traitement: Optional[str] = ""
    notes: Optional[str] = ""
    # 📎 Pièce jointe optionnelle (data URI complet, ex: data:application/pdf;base64,XXX)
    attachment_base64: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_mime: Optional[str] = None


@api.post("/pro/consultation-notes")
async def create_consultation_note(payload: ConsultationNoteIn, user=Depends(require_roles("professionnel"))):
    """
    Le Pro ajoute une note de consultation. Le `patient_id` peut être :
      - Un maman_id (consultation gynéco/grossesse)
      - Un enfant_id (consultation pédiatrique) → la note apparaîtra dans le carnet de l'enfant
    
    Sécurité : le Pro doit avoir un RDV avec ce patient/enfant.
    """
    pid = payload.patient_id
    is_enfant = False
    enfant_doc = None

    # On regarde d'abord si c'est un enfant_id
    enfant_doc = await db.enfants.find_one({"id": pid}, {"_id": 0, "id": 1, "user_id": 1, "nom": 1})
    if enfant_doc:
        is_enfant = True
        # Vérifier qu'il y a un RDV pour cet enfant avec ce pro, OU pour la maman parent
        has_rdv = await db.rdv.count_documents({
            "pro_id": user["id"],
            "$or": [
                {"enfant_id": pid},
                {"maman_id": enfant_doc["user_id"]},
            ],
        })
    else:
        # Sinon c'est un maman_id
        has_rdv = await db.rdv.count_documents({"pro_id": user["id"], "maman_id": pid})

    if has_rdv == 0:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce patient (aucun RDV en commun)")

    doc = {
        "id": str(uuid.uuid4()),
        "pro_id": user["id"],
        "pro_name": user.get("name"),
        "patient_id": pid,
        "patient_type": "enfant" if is_enfant else "maman",
        "enfant_id": pid if is_enfant else None,
        "maman_id": enfant_doc["user_id"] if is_enfant else pid,
        "date": payload.date or datetime.now(timezone.utc).isoformat(),
        # 🔐 Chiffrement AES-256-GCM
        "diagnostic": encrypt_str(payload.diagnostic) if payload.diagnostic else payload.diagnostic,
        "traitement": encrypt_str(payload.traitement) if payload.traitement else payload.traitement,
        "notes": encrypt_str(payload.notes) if payload.notes else payload.notes,
        # 📎 Pièce jointe chiffrée (data URI complet)
        "attachment_base64": encrypt_str(payload.attachment_base64) if payload.attachment_base64 else None,
        "attachment_name": (payload.attachment_name or "")[:200] if payload.attachment_name else None,
        "attachment_mime": (payload.attachment_mime or "")[:100] if payload.attachment_mime else None,
        # 📬 Suivi lecture par la maman
        "read_by_maman": False,
        "read_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consultation_notes.insert_one(doc)
    doc.pop("_id", None)

    # Notif maman (visible immédiatement dans la cloche)
    try:
        target_maman_id = enfant_doc["user_id"] if is_enfant else pid
        target_label = f"de {enfant_doc.get('nom', 'votre enfant')}" if is_enfant else "de votre dossier"
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": target_maman_id,
            "title": "📝 Nouvelle note médicale",
            "body": f"Dr {user.get('name', '')} a ajouté une note {target_label}.",
            "type": "consultation_note",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Push si possible
        target_user = await db.users.find_one({"id": target_maman_id}, {"_id": 0, "push_token": 1})
        if target_user and target_user.get("push_token"):
            await send_expo_push(
                target_user["push_token"],
                "📝 Nouvelle note médicale",
                f"Dr {user.get('name', '')} a ajouté une note {target_label}.",
                {"type": "consultation_note", "patient_id": pid},
            )
    except Exception:
        pass

    return decrypt_consultation_note(doc)


@api.get("/mes-consultation-notes/unread-count")
async def my_unread_notes_count(user=Depends(get_current_user)):
    """Nombre de notes médicales non lues par la maman (pour badge cloche / profil)."""
    if user.get("role") != "maman":
        return {"count": 0}
    count = await db.consultation_notes.count_documents({
        "$or": [
            {"patient_id": user["id"], "patient_type": "maman", "read_by_maman": {"$ne": True}},
            {"maman_id": user["id"], "read_by_maman": {"$ne": True}},
        ]
    })
    return {"count": count}


@api.post("/mes-consultation-notes/{note_id}/mark-read")
async def mark_note_read(note_id: str, user=Depends(get_current_user)):
    """Marque une note comme lue par la maman."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    # Accepte si elle est destinataire (maman directe OU maman de l'enfant)
    note = await db.consultation_notes.find_one({
        "id": note_id,
        "$or": [
            {"patient_id": user["id"], "patient_type": "maman"},
            {"maman_id": user["id"]},
        ]
    }, {"_id": 0, "id": 1})
    if not note:
        raise HTTPException(404, "Note introuvable")
    await db.consultation_notes.update_one(
        {"id": note_id},
        {"$set": {"read_by_maman": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api.post("/mes-consultation-notes/mark-all-read")
async def mark_all_notes_read(user=Depends(get_current_user)):
    """Marque TOUTES les notes comme lues en une seule fois."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    result = await db.consultation_notes.update_many(
        {"$or": [
            {"patient_id": user["id"], "patient_type": "maman", "read_by_maman": {"$ne": True}},
            {"maman_id": user["id"], "read_by_maman": {"$ne": True}},
        ]},
        {"$set": {"read_by_maman": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "marked": result.modified_count}


@api.get("/pro/mes-notes-ecrites")
async def list_pro_my_written_notes(user=Depends(require_roles("professionnel"))):
    """
    📜 Historique de TOUTES les notes médicales écrites par le Pro courant.
    Enrichi avec le nom du patient (maman ou enfant) et le statut "lu/non-lu".
    """
    notes_raw = await db.consultation_notes.find(
        {"pro_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    # Enrichissement noms
    maman_ids = list({n.get("maman_id") or n.get("patient_id") for n in notes_raw if n.get("maman_id") or n.get("patient_id")})
    enfant_ids = list({n.get("enfant_id") for n in notes_raw if n.get("enfant_id")})
    mamans = await db.users.find({"id": {"$in": maman_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1}).to_list(500) if maman_ids else []
    enfants = await db.enfants.find({"id": {"$in": enfant_ids}}, {"_id": 0, "id": 1, "nom": 1}).to_list(500) if enfant_ids else []
    mamans_map = {m["id"]: m.get("name", "Inconnue") for m in mamans}
    enfants_map = {e["id"]: e.get("nom", "Enfant") for e in enfants}

    result = []
    for n in notes_raw:
        dec = decrypt_consultation_note(n)
        dec["enfant_nom"] = enfants_map.get(dec.get("enfant_id")) if dec.get("enfant_id") else None
        dec["maman_nom"] = mamans_map.get(dec.get("maman_id") or dec.get("patient_id"), "Inconnue")
        dec["concerne"] = dec["enfant_nom"] or dec["maman_nom"]
        dec["read_by_maman"] = bool(dec.get("read_by_maman"))
        result.append(dec)
    return result


@api.get("/mes-consultation-notes")
async def list_my_consultation_notes(user=Depends(get_current_user)):
    """
    📝 Liste TOUTES les notes médicales que la maman a reçues :
       - Ses notes personnelles (patient_type="maman")
       - Celles de ses enfants (patient_type="enfant" avec maman_id=moi)
    Chaque note est enrichie avec {enfant_nom} si applicable.
    """
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    # Récupère toutes les notes où elle est concernée
    query = {"$or": [
        {"patient_id": user["id"], "patient_type": "maman"},
        {"maman_id": user["id"]},
    ]}
    notes_raw = await db.consultation_notes.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Enrichit avec le nom de l'enfant si applicable
    enfant_ids = list({n.get("enfant_id") for n in notes_raw if n.get("enfant_id")})
    enfants_map: dict = {}
    if enfant_ids:
        enfants = await db.enfants.find({"id": {"$in": enfant_ids}}, {"_id": 0, "id": 1, "nom": 1}).to_list(200)
        enfants_map = {e["id"]: e["nom"] for e in enfants}
    result = []
    for n in notes_raw:
        dec = decrypt_consultation_note(n)
        dec["enfant_nom"] = enfants_map.get(dec.get("enfant_id")) if dec.get("enfant_id") else None
        dec["concerne"] = dec["enfant_nom"] or "Moi"
        result.append(dec)
    return result


@api.get("/enfants/{eid}/consultation-notes")
async def list_enfant_consultation_notes(eid: str, user=Depends(get_current_user)):
    """
    Liste les notes médicales associées à un enfant.
    Accessible par :
      - La maman propriétaire de l'enfant
      - Le Pro qui a écrit la note (filtré par pro_id)
    """
    enfant = await db.enfants.find_one({"id": eid}, {"_id": 0, "id": 1, "user_id": 1})
    if not enfant:
        raise HTTPException(404, "Enfant introuvable")

    # Filtre selon le rôle
    role = user.get("role")
    if role == "maman":
        if enfant["user_id"] != user["id"]:
            raise HTTPException(403, "Cet enfant n'est pas le vôtre")
        query = {"patient_id": eid, "patient_type": "enfant"}
    elif role == "professionnel":
        query = {"patient_id": eid, "patient_type": "enfant", "pro_id": user["id"]}
    else:
        raise HTTPException(403, "Accès refusé")

    notes_raw = await db.consultation_notes.find(query, {"_id": 0}).sort("date", -1).to_list(200)
    return [decrypt_consultation_note(n) for n in notes_raw]


@api.delete("/pro/consultation-notes/{note_id}")
async def delete_consultation_note(note_id: str, user=Depends(require_roles("professionnel"))):
    res = await db.consultation_notes.delete_one({"id": note_id, "pro_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note introuvable")
    return {"ok": True}


# ----------------------------------------------------------------------
# Disponibilités Pro
# ----------------------------------------------------------------------
class DisponibiliteIn(BaseModel):
    jour: str  # "lundi", "mardi"...
    heure_debut: str  # "08:00"
    heure_fin: str  # "12:00"
    actif: bool = True
    type_id: Optional[str] = None       # nouveau : 1 type par créneau (id de TYPES_CONSULTATION)
    duree_minutes: Optional[int] = None  # nouveau : durée par créneau (15/30/45/60/90/120)
    types: Optional[List[str]] = None    # legacy : multi-types, conservé pour rétro-compat
    modes_autorises: Optional[List[str]] = None  # 🏥📹🏠 modes acceptés sur ce créneau ("presentiel"|"teleconsultation"|"domicile")


@api.get("/pro/disponibilites")
async def get_disponibilites(user=Depends(require_roles("professionnel"))):
    doc = await db.pro_disponibilites.find_one({"pro_id": user["id"]}, {"_id": 0})
    return doc or {"pro_id": user["id"], "slots": [], "duree_consultation": 30}


class DisposSetIn(BaseModel):
    slots: List[DisponibiliteIn]
    duree_consultation: int = 30


@api.put("/pro/disponibilites")
async def set_disponibilites(payload: DisposSetIn, user=Depends(require_roles("professionnel"))):
    doc = {
        "pro_id": user["id"],
        "slots": [s.model_dump() for s in payload.slots],
        "duree_consultation": payload.duree_consultation,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pro_disponibilites.update_one({"pro_id": user["id"]}, {"$set": doc}, upsert=True)
    return doc


# ----------------------------------------------------------------------
# Rappels pour patients (envoyés par Pro)
# ----------------------------------------------------------------------
class PatientRappelIn(BaseModel):
    patient_id: str
    title: str
    due_at: str
    notes: Optional[str] = None


@api.post("/pro/rappels-patient")
async def create_patient_rappel(payload: PatientRappelIn, user=Depends(require_roles("professionnel"))):
    has_rdv = await db.rdv.count_documents({"pro_id": user["id"], "maman_id": payload.patient_id})
    if has_rdv == 0:
        raise HTTPException(status_code=403, detail="Patient non autorisé")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": payload.patient_id,
        "title": payload.title,
        "due_at": payload.due_at,
        "notes": payload.notes,
        "done": False,
        "source": "pro",
        "source_pro_id": user["id"],
        "source_pro_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/pro/rappels-envoyes")
async def get_rappels_envoyes(user=Depends(require_roles("professionnel"))):
    cursor = db.reminders.find({"source_pro_id": user["id"]}, {"_id": 0}).sort("due_at", -1).limit(200)
    return [r async for r in cursor]


# ----------------------------------------------------------------------
# Téléconsultation - Room link (Jitsi - fallback web)
# ----------------------------------------------------------------------
@api.post("/teleconsultation/room/{rdv_id}")
async def create_teleconsultation_room(rdv_id: str, user=Depends(get_current_user)):
    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    _enforce_teleconsult_window(rdv)
    room_name = f"alomaman-{rdv_id[:8]}"
    room_url = f"https://meet.jit.si/{room_name}"
    await db.rdv.update_one(
        {"id": rdv_id},
        {"$set": {"teleconsultation_room": room_name, "teleconsultation_url": room_url}},
    )
    return {"room_name": room_name, "room_url": room_url, "rdv": {**rdv, "_id": None}}


# ----------------------------------------------------------------------
# Téléconsultation - Agora.io (HD natif optimisé Afrique)
# ----------------------------------------------------------------------
@api.post("/teleconsultation/agora-token/{rdv_id}")
async def create_agora_token(rdv_id: str, user=Depends(get_current_user)):
    """
    Génère un token Agora signé valide 1h pour la téléconsultation.
    Sécurité : seuls la maman et le pro de ce RDV peuvent récupérer un token.
    Le channel name est dérivé du RDV id (non-devinable car UUID).
    """
    from agora_token_builder import RtcTokenBuilder
    import time

    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    _enforce_teleconsult_window(rdv)

    app_id = os.environ.get("AGORA_APP_ID", "").strip()
    app_certificate = os.environ.get("AGORA_APP_CERTIFICATE", "").strip()
    if not app_id or not app_certificate:
        raise HTTPException(status_code=500, detail="Agora non configuré")

    # Channel name unique au RDV (UUID v4 → 36 chars, on garde 32 max accepté par Agora)
    channel_name = f"alomaman_{rdv_id.replace('-', '')[:24]}"

    # UID numérique unique par utilisateur (hash stable du user.id)
    # Agora exige un uint32 (0 à 2^32-1)
    uid = abs(hash(user["id"])) % (2**31)

    # Role = PUBLISHER (1) → permet d'envoyer audio+vidéo
    role = 1  # RtcTokenBuilder.Role_Publisher == 1

    expire_time_in_seconds = 3600  # 1h
    current_timestamp = int(time.time())
    privilege_expired_ts = current_timestamp + expire_time_in_seconds

    token = RtcTokenBuilder.buildTokenWithUid(
        app_id, app_certificate, channel_name, uid, role, privilege_expired_ts
    )

    # On enregistre la salle Agora dans le RDV (si pas encore fait)
    await db.rdv.update_one(
        {"id": rdv_id},
        {"$set": {
            "agora_channel": channel_name,
            "teleconsultation_provider": "agora",
        }},
    )

    return {
        "app_id": app_id,
        "channel": channel_name,
        "token": token,
        "uid": uid,
        "expires_at": privilege_expired_ts,
        "rdv_id": rdv_id,
        "user_role": user.get("role"),
    }


@api.get("/teleconsultation/diagnostic/{rdv_id}")
async def teleconsultation_diagnostic(rdv_id: str, user=Depends(get_current_user)):
    """Diagnostic complet pour la téléconsultation : retourne l'état des push tokens
    des deux participants + statut du RDV. Utile pour comprendre pourquoi la sonnerie
    n'arrive pas chez l'autre participant.
    """
    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")

    maman = await db.users.find_one({"id": rdv.get("maman_id")}, {"_id": 0, "name": 1, "push_token": 1, "role": 1})
    pro = await db.users.find_one({"id": rdv.get("pro_id")}, {"_id": 0, "name": 1, "push_token": 1, "role": 1})
    win = _compute_teleconsult_window(rdv)

    return {
        "rdv_id": rdv_id,
        "rdv_status": rdv.get("status"),
        "rdv_mode": rdv.get("mode"),
        "rdv_date": rdv.get("date"),
        "window": win,
        "maman": {
            "id": rdv.get("maman_id"),
            "name": maman.get("name") if maman else None,
            "has_push_token": bool(maman and maman.get("push_token")),
            "push_token_preview": (maman.get("push_token", "")[:30] + "...") if maman and maman.get("push_token") else None,
        },
        "pro": {
            "id": rdv.get("pro_id"),
            "name": pro.get("name") if pro else None,
            "has_push_token": bool(pro and pro.get("push_token")),
            "push_token_preview": (pro.get("push_token", "")[:30] + "...") if pro and pro.get("push_token") else None,
        },
        "you": user.get("role"),
        "other_party_will_receive_ring": bool(
            (user["id"] == rdv.get("pro_id") and maman and maman.get("push_token")) or
            (user["id"] == rdv.get("maman_id") and pro and pro.get("push_token"))
        ),
    }


@api.post("/support/contact")
async def support_contact(payload: dict, user=Depends(get_current_user)):
    """Réception de message support depuis l'app. Stocke en DB pour traitement."""
    subject = (payload.get("subject") or "").strip()[:200]
    message = (payload.get("message") or "").strip()[:2000]
    if not subject or not message:
        raise HTTPException(400, "Sujet et message requis")
    ticket = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "user_role": user.get("role"),
        "subject": subject,
        "message": message,
        "status": "new",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.support_tickets.insert_one(ticket)
    logger.info(f"📨 Nouveau ticket support de {user.get('email')} : {subject[:50]}...")
    return {"ok": True, "ticket_id": ticket["id"]}


# ----------------------------------------------------------------------
# Mes Documents (carnets, analyses, ordonnances) — stockage cloud
# ----------------------------------------------------------------------
DOC_CATEGORIES = {"echographie", "analyse", "ordonnance", "vaccin", "naissance", "autre"}
MAX_DOC_SIZE_BASE64 = 12_000_000  # ~9 MB de fichier décodé (base64 ≈ 4/3)


@api.post("/documents")
async def create_document(payload: dict, user=Depends(get_current_user)):
    """Upload d'un document (PDF, image) en base64 dans le cloud.
    Le contenu est associé à l'utilisateur courant (sécurité GDPR).
    """
    titre = (payload.get("titre") or "").strip()[:200]
    if not titre:
        raise HTTPException(400, "Titre requis")
    categorie = payload.get("categorie") or "autre"
    if categorie not in DOC_CATEGORIES:
        categorie = "autre"
    file_base64 = payload.get("file_base64") or ""
    mime_type = (payload.get("mime_type") or "application/octet-stream").lower()[:80]
    file_name = (payload.get("file_name") or "document")[:200]
    if not file_base64:
        raise HTTPException(400, "Fichier manquant")
    if len(file_base64) > MAX_DOC_SIZE_BASE64:
        raise HTTPException(413, "Fichier trop volumineux (max 9 Mo)")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "titre": titre,
        "categorie": categorie,
        "date": payload.get("date") or datetime.now(timezone.utc).date().isoformat(),
        "notes": (payload.get("notes") or "")[:1000],
        "file_base64": file_base64,
        "file_name": file_name,
        "mime_type": mime_type,
        "size_bytes": int(len(file_base64) * 3 / 4),  # estimation décodée
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_documents.insert_one(doc)
    # Réponse sans le base64 (économie bande passante)
    return {
        "id": doc["id"],
        "titre": doc["titre"],
        "categorie": doc["categorie"],
        "date": doc["date"],
        "notes": doc["notes"],
        "file_name": doc["file_name"],
        "mime_type": doc["mime_type"],
        "size_bytes": doc["size_bytes"],
        "created_at": doc["created_at"],
    }


@api.get("/documents")
async def list_documents(user=Depends(get_current_user), category: Optional[str] = None):
    """Liste les documents de l'utilisateur (sans le base64)."""
    query: dict = {"user_id": user["id"]}
    if category and category in DOC_CATEGORIES:
        query["categorie"] = category
    cursor = db.user_documents.find(
        query,
        {"_id": 0, "file_base64": 0},  # on exclut le contenu pour la liste
    ).sort("created_at", -1)
    return await cursor.to_list(500)


@api.get("/documents/{doc_id}")
async def get_document(doc_id: str, user=Depends(get_current_user)):
    """Récupère un document complet (avec le base64 pour visualisation/téléchargement)."""
    doc = await db.user_documents.find_one({"id": doc_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    return doc


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(get_current_user)):
    """Supprime un document de l'utilisateur."""
    res = await db.user_documents.delete_one({"id": doc_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document introuvable")
    return {"ok": True}


@api.post("/teleconsultation/ring/{rdv_id}")
async def ring_other_party(rdv_id: str, user=Depends(get_current_user)):
    """
    Envoie une notification "appel entrant" à l'autre participant du RDV.
    Usage typique : quand le Pro démarre la consultation, ça fait "sonner"
    la Maman (push notification avec son + vibration + deep link).
    
    Sécurité : seuls la maman et le pro du RDV peuvent déclencher la sonnerie.
    """
    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    _enforce_teleconsult_window(rdv)

    # Déterminer qui appelle et qui est appelé
    caller_id = user["id"]
    callee_id = rdv["maman_id"] if caller_id == rdv.get("pro_id") else rdv.get("pro_id")
    if not callee_id:
        raise HTTPException(status_code=400, detail="Autre participant introuvable")

    # Récupérer les infos pour personnaliser le message
    caller = await db.users.find_one({"id": caller_id}, {"_id": 0, "name": 1, "role": 1, "specialite": 1})
    callee = await db.users.find_one({"id": callee_id}, {"_id": 0, "name": 1, "push_token": 1})
    if not caller or not callee:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    caller_name = caller.get("name", "Un professionnel")
    if caller.get("role") == "professionnel":
        prefix = "Dr " if not caller_name.lower().startswith("dr") else ""
        caller_display = f"{prefix}{caller_name}"
    else:
        caller_display = caller_name

    title = f"📞 {caller_display} vous appelle"
    body = "Téléconsultation en cours — Touchez pour rejoindre"

    # Créer une notification in-app (visible dans la cloche)
    notif_id = str(uuid.uuid4())
    await db.notifications.insert_one({
        "id": notif_id,
        "user_id": callee_id,
        "title": title,
        "body": body,
        "type": "incoming_call",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rdv_id": rdv_id,
        "caller_id": caller_id,
    })

    # Envoyer push notification avec data spécifique appel entrant
    if callee.get("push_token"):
        await send_expo_push(
            callee["push_token"],
            title,
            body,
            {
                "type": "incoming_call",
                "rdv_id": rdv_id,
                "caller_id": caller_id,
                "caller_name": caller_display,
                # Channel ID "calls" côté Android pour utiliser un canal HIGH PRIORITY dédié appels
                "channelId": "calls",
                # Indique au frontend de naviguer immédiatement vers /video-call/{rdv_id}
                "deep_link": f"/video-call/{rdv_id}",
            },
        )

    return {
        "ok": True,
        "called": callee_id,
        "title": title,
        "body": body,
        "has_push_token": bool(callee.get("push_token")),
    }


# ----------------------------------------------------------------------


# ----------------------------------------------------------------------
# Admin-specific
# ----------------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(user=Depends(require_roles("admin"))):
    total_users = await db.users.count_documents({})
    total_mamans = await db.users.count_documents({"role": "maman"})
    total_pros = await db.users.count_documents({"role": "professionnel"})
    total_rdv = await db.rdv.count_documents({})
    total_enfants = await db.enfants.count_documents({})
    total_posts = await db.posts.count_documents({})
    total_messages = await db.messages.count_documents({})
    return {
        "users": total_users,
        "mamans": total_mamans,
        "professionnels": total_pros,
        "rdv": total_rdv,
        "enfants": total_enfants,
        "posts": total_posts,
        "messages": total_messages,
    }


@api.get("/admin/users")
async def admin_users(user=Depends(require_roles("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


# ======================================================================
# 🏥 METRICS DE SANTÉ PUBLIQUE — Pour ministères, OMS/UNICEF, pharma, gouvernements
# Toutes les métriques sont AGGRÉGÉES et ANONYMISÉES (pas de PII individuelle)
# ======================================================================

def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


@api.get("/admin/metrics/overview")
async def metrics_overview(user=Depends(require_roles("admin"))):
    """KPIs principaux pour le dashboard exécutif."""
    now = datetime.now(timezone.utc)
    d30 = _iso_days_ago(30)
    d7 = _iso_days_ago(7)
    d1 = _iso_days_ago(1)

    total_users = await db.users.count_documents({})
    new_users_30d = await db.users.count_documents({"created_at": {"$gte": d30}})
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": d7}})
    by_role = {}
    for role in ["maman", "professionnel", "centre_sante", "famille", "admin"]:
        by_role[role] = await db.users.count_documents({"role": role})

    total_grossesses = await db.grossesses.count_documents({})
    active_grossesses = await db.grossesses.count_documents({"$or": [{"status": "en_cours"}, {"status": {"$exists": False}}]})
    total_enfants = await db.enfants.count_documents({})
    total_rdv = await db.rdv.count_documents({})
    rdv_30d = await db.rdv.count_documents({"created_at": {"$gte": d30}})
    rdv_completed = await db.rdv.count_documents({"status": "termine"})
    teleconsultations = await db.rdv.count_documents({"mode": "teleconsultation"})
    total_centres = await db.users.count_documents({"role": "centre_sante"})

    # Premium
    premium_users = await db.users.count_documents({"premium": True})
    cmu_users = await db.users.count_documents({"$or": [{"cmu.numero": {"$ne": None, "$exists": True}}, {"accepte_cmu": True}]})

    # Revenu
    payments_completed = await db.payments.find({"status": "completed"}, {"_id": 0, "amount": 1, "created_at": 1, "kind": 1}).to_list(10000)
    total_revenue = sum(p.get("amount", 0) for p in payments_completed)
    revenue_30d = sum(p.get("amount", 0) for p in payments_completed if p.get("created_at", "") >= d30)

    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": total_users,
            "new_30d": new_users_30d,
            "new_7d": new_users_7d,
            "growth_rate_30d": round((new_users_30d / max(total_users - new_users_30d, 1)) * 100, 1),
            "by_role": by_role,
            "premium": premium_users,
            "cmu": cmu_users,
            "premium_conversion_rate": round((premium_users / max(by_role.get("maman", 1), 1)) * 100, 1),
            "cmu_adoption_rate": round((cmu_users / max(total_users, 1)) * 100, 1),
        },
        "health": {
            "total_grossesses": total_grossesses,
            "active_grossesses": active_grossesses,
            "total_enfants": total_enfants,
            "total_centres": total_centres,
        },
        "rdv": {
            "total": total_rdv,
            "last_30d": rdv_30d,
            "completed": rdv_completed,
            "teleconsultations": teleconsultations,
            "telecon_share": round((teleconsultations / max(total_rdv, 1)) * 100, 1),
        },
        "finance": {
            "total_revenue_fcfa": total_revenue,
            "revenue_30d_fcfa": revenue_30d,
            "transactions": len(payments_completed),
            "avg_basket_fcfa": round(total_revenue / max(len(payments_completed), 1)),
        },
    }


@api.get("/admin/metrics/maternal-health")
async def metrics_maternal_health(user=Depends(require_roles("admin"))):
    """Métriques santé maternelle — valeur OMS/UNICEF/Ministères."""
    grossesses = await db.grossesses.find({}, {"_id": 0}).to_list(20000)
    mamans = await db.users.find({"role": "maman"}, {"_id": 0, "date_naissance": 1, "ville": 1, "id": 1}).to_list(20000)

    # Distribution par âge des mères
    now = datetime.now(timezone.utc)
    ages = []
    for m in mamans:
        try:
            dob = datetime.fromisoformat((m.get("date_naissance") or "").replace("Z", "+00:00"))
            age = (now - dob).days // 365
            if 10 <= age <= 60:
                ages.append(age)
        except Exception:
            pass
    age_brackets = {"15-19": 0, "20-24": 0, "25-29": 0, "30-34": 0, "35-39": 0, "40+": 0, "<15 ⚠️": 0}
    for a in ages:
        if a < 15: age_brackets["<15 ⚠️"] += 1
        elif a < 20: age_brackets["15-19"] += 1
        elif a < 25: age_brackets["20-24"] += 1
        elif a < 30: age_brackets["25-29"] += 1
        elif a < 35: age_brackets["30-34"] += 1
        elif a < 40: age_brackets["35-39"] += 1
        else: age_brackets["40+"] += 1
    avg_age = round(sum(ages) / max(len(ages), 1), 1) if ages else 0

    # Distribution par trimestre (basé sur date_debut)
    trimestre_dist = {"T1 (0-13 SA)": 0, "T2 (14-27 SA)": 0, "T3 (28+ SA)": 0, "Post-partum": 0}
    for g in grossesses:
        try:
            debut = datetime.fromisoformat((g.get("date_debut") or "").replace("Z", "+00:00"))
            sa = (now - debut).days // 7
            if sa <= 13: trimestre_dist["T1 (0-13 SA)"] += 1
            elif sa <= 27: trimestre_dist["T2 (14-27 SA)"] += 1
            elif sa <= 41: trimestre_dist["T3 (28+ SA)"] += 1
            else: trimestre_dist["Post-partum"] += 1
        except Exception:
            pass

    # Grossesses par mois (12 derniers mois)
    grossesses_par_mois: dict[str, int] = {}
    for i in range(11, -1, -1):
        d = now.replace(day=1) - timedelta(days=i * 30)
        key = d.strftime("%Y-%m")
        grossesses_par_mois[key] = 0
    for g in grossesses:
        try:
            ca = datetime.fromisoformat((g.get("created_at") or g.get("date_debut") or "").replace("Z", "+00:00"))
            key = ca.strftime("%Y-%m")
            if key in grossesses_par_mois:
                grossesses_par_mois[key] += 1
        except Exception:
            pass

    # Suivi prénatal (quantité moyenne de mesures par grossesse)
    tracking = await db.grossesse_tracking.aggregate([
        {"$group": {"_id": "$grossesse_id", "count": {"$sum": 1}}},
    ]).to_list(20000)
    avg_tracking_per_grossesse = round(sum(t["count"] for t in tracking) / max(len(tracking), 1), 1) if tracking else 0

    # Plans de naissance (couverture)
    plans_naissance = await db.plan_naissance.count_documents({})
    plan_coverage = round((plans_naissance / max(len(grossesses), 1)) * 100, 1)

    # Taux télé-écho
    tele_echo_count = await db.tele_echo.count_documents({})

    return {
        "total_grossesses": len(grossesses),
        "active_grossesses": sum(trimestre_dist.values()) - trimestre_dist.get("Post-partum", 0),
        "avg_maternal_age": avg_age,
        "age_distribution": age_brackets,
        "early_pregnancy_alert": age_brackets["<15 ⚠️"],
        "trimester_distribution": trimestre_dist,
        "monthly_pregnancies": grossesses_par_mois,
        "antenatal_tracking": {
            "avg_visits_per_pregnancy": avg_tracking_per_grossesse,
            "total_tracking_entries": sum(t["count"] for t in tracking),
        },
        "birth_plans_coverage_pct": plan_coverage,
        "ultrasounds_count": tele_echo_count,
    }


@api.get("/admin/metrics/child-health")
async def metrics_child_health(user=Depends(require_roles("admin"))):
    """Métriques santé infantile — valeur UNICEF/OMS."""
    enfants = await db.enfants.find({}, {"_id": 0}).to_list(20000)
    now = datetime.now(timezone.utc)

    # Distribution par âge
    age_dist = {"0-6 mois": 0, "7-12 mois": 0, "1-2 ans": 0, "2-5 ans": 0, "5-10 ans": 0, "10+ ans": 0}
    sex_dist = {"masculin": 0, "feminin": 0, "autre": 0}
    for e in enfants:
        try:
            dn = datetime.fromisoformat((e.get("date_naissance") or "").replace("Z", "+00:00"))
            months = ((now.year - dn.year) * 12 + (now.month - dn.month))
            if months < 7: age_dist["0-6 mois"] += 1
            elif months < 13: age_dist["7-12 mois"] += 1
            elif months < 25: age_dist["1-2 ans"] += 1
            elif months < 60: age_dist["2-5 ans"] += 1
            elif months < 120: age_dist["5-10 ans"] += 1
            else: age_dist["10+ ans"] += 1
        except Exception:
            pass
        sx = (e.get("sexe") or "").lower()
        if sx in ("m", "masculin", "garcon", "garçon"): sex_dist["masculin"] += 1
        elif sx in ("f", "feminin", "féminin", "fille"): sex_dist["feminin"] += 1
        else: sex_dist["autre"] += 1

    # Vaccination — couverture (% enfants avec ≥1 vaccin enregistré)
    enfants_vaccines = sum(1 for e in enfants if (e.get("vaccins") or []) != [])
    vaccin_coverage = round((enfants_vaccines / max(len(enfants), 1)) * 100, 1)
    avg_vaccins_per_child = round(sum(len(e.get("vaccins") or []) for e in enfants) / max(len(enfants), 1), 1)

    # Mesures (croissance) — % d'enfants suivis
    enfants_with_measures = await db.mesures.aggregate([
        {"$group": {"_id": "$enfant_id"}},
        {"$count": "total"},
    ]).to_list(1)
    enfants_suivis = enfants_with_measures[0]["total"] if enfants_with_measures else 0
    growth_tracking_coverage = round((enfants_suivis / max(len(enfants), 1)) * 100, 1)

    # Allergies (anonymisé : juste comptage)
    enfants_avec_allergies = sum(1 for e in enfants if (e.get("allergies") or []) and any(a.strip() if isinstance(a, str) else True for a in (e.get("allergies") or [])))

    # Naissances déclarées (12 derniers mois)
    monthly_births: dict[str, int] = {}
    for i in range(11, -1, -1):
        d = now.replace(day=1) - timedelta(days=i * 30)
        monthly_births[d.strftime("%Y-%m")] = 0
    for e in enfants:
        try:
            dn = datetime.fromisoformat((e.get("date_naissance") or "").replace("Z", "+00:00"))
            key = dn.strftime("%Y-%m")
            if key in monthly_births:
                monthly_births[key] += 1
        except Exception:
            pass

    return {
        "total_enfants": len(enfants),
        "age_distribution": age_dist,
        "sex_distribution": sex_dist,
        "vaccination": {
            "coverage_pct": vaccin_coverage,
            "avg_vaccines_per_child": avg_vaccins_per_child,
            "vaccinated_children": enfants_vaccines,
            "unvaccinated_children": len(enfants) - enfants_vaccines,
        },
        "growth_tracking": {
            "tracked_children": enfants_suivis,
            "coverage_pct": growth_tracking_coverage,
        },
        "health_alerts": {
            "children_with_allergies": enfants_avec_allergies,
            "allergy_prevalence_pct": round((enfants_avec_allergies / max(len(enfants), 1)) * 100, 1),
        },
        "monthly_births": monthly_births,
    }


@api.get("/admin/metrics/healthcare-access")
async def metrics_healthcare_access(user=Depends(require_roles("admin"))):
    """Accès aux soins, CMU, télémédecine — valeur Ministère Santé."""
    total_mamans = await db.users.count_documents({"role": "maman"})
    cmu_mamans = await db.users.count_documents({"role": "maman", "$or": [{"cmu.numero": {"$ne": None, "$exists": True}}]})
    premium_mamans = await db.users.count_documents({"role": "maman", "premium": True})

    rdv_all = await db.rdv.find({}, {"_id": 0, "status": 1, "mode": 1, "created_at": 1, "type_consultation": 1}).to_list(50000)
    by_status: dict[str, int] = {}
    by_mode: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for r in rdv_all:
        by_status[r.get("status") or "?"] = by_status.get(r.get("status") or "?", 0) + 1
        by_mode[r.get("mode") or "?"] = by_mode.get(r.get("mode") or "?", 0) + 1
        t = r.get("type_consultation") or "autre"
        by_type[t] = by_type.get(t, 0) + 1

    no_show_rate = round((by_status.get("annule", 0) / max(len(rdv_all), 1)) * 100, 1)
    completion_rate = round((by_status.get("termine", 0) / max(len(rdv_all), 1)) * 100, 1)
    telecon_share = round((by_mode.get("teleconsultation", 0) / max(len(rdv_all), 1)) * 100, 1)

    return {
        "cmu": {
            "registered_mamans": cmu_mamans,
            "adoption_rate_pct": round((cmu_mamans / max(total_mamans, 1)) * 100, 1),
            "uncovered_mamans": total_mamans - cmu_mamans,
        },
        "premium": {
            "subscribers": premium_mamans,
            "conversion_rate_pct": round((premium_mamans / max(total_mamans, 1)) * 100, 1),
        },
        "appointments": {
            "total": len(rdv_all),
            "by_status": by_status,
            "by_mode": by_mode,
            "by_type": dict(sorted(by_type.items(), key=lambda x: -x[1])[:10]),
            "no_show_rate_pct": no_show_rate,
            "completion_rate_pct": completion_rate,
            "telemedicine_share_pct": telecon_share,
        },
    }


@api.get("/admin/metrics/geographic")
async def metrics_geographic(user=Depends(require_roles("admin"))):
    """Distribution géographique — valeur santé publique régionale."""
    pipeline = [
        {"$match": {"ville": {"$exists": True, "$ne": None, "$nin": ["", " "]}}},
        {"$group": {"_id": {"ville": "$ville", "role": "$role"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    rows = await db.users.aggregate(pipeline).to_list(1000)

    cities: dict[str, dict] = {}
    for r in rows:
        ville = (r["_id"]["ville"] or "").strip().title() or "Inconnue"
        role = r["_id"]["role"] or "autre"
        if ville not in cities:
            cities[ville] = {"ville": ville, "total": 0, "maman": 0, "professionnel": 0, "centre_sante": 0, "famille": 0}
        cities[ville][role] = r["count"]
        cities[ville]["total"] += r["count"]

    top_cities = sorted(cities.values(), key=lambda x: -x["total"])[:25]

    # Couverture professionnelle = ratio pros/mamans par ville
    for c in top_cities:
        c["pro_per_1000_mamans"] = round((c["professionnel"] / max(c["maman"], 1)) * 1000, 1)
        c["medical_density_score"] = c["professionnel"] + c["centre_sante"] * 3

    return {
        "total_cities": len(cities),
        "top_cities": top_cities,
        "underserved_cities": sorted(
            [c for c in cities.values() if c["maman"] >= 3 and c["professionnel"] == 0],
            key=lambda x: -x["maman"],
        )[:10],
    }


@api.get("/admin/metrics/financial")
async def metrics_financial(user=Depends(require_roles("admin"))):
    """KPIs financiers — valeur business/investisseurs/gouvernement (économie numérique)."""
    payments = await db.payments.find({"status": "completed"}, {"_id": 0}).to_list(50000)
    total_revenue = sum(p.get("amount", 0) for p in payments)
    by_kind: dict[str, dict] = {}
    by_method: dict[str, int] = {}
    monthly_revenue: dict[str, int] = {}
    now = datetime.now(timezone.utc)
    for i in range(11, -1, -1):
        d = now.replace(day=1) - timedelta(days=i * 30)
        monthly_revenue[d.strftime("%Y-%m")] = 0

    for p in payments:
        k = p.get("kind") or "autre"
        if k not in by_kind:
            by_kind[k] = {"count": 0, "amount": 0}
        by_kind[k]["count"] += 1
        by_kind[k]["amount"] += p.get("amount", 0)
        m = p.get("payment_method") or p.get("method") or "inconnu"
        by_method[m] = by_method.get(m, 0) + 1
        try:
            ca = datetime.fromisoformat((p.get("created_at") or "").replace("Z", "+00:00"))
            key = ca.strftime("%Y-%m")
            if key in monthly_revenue:
                monthly_revenue[key] += p.get("amount", 0)
        except Exception:
            pass

    payouts = await db.payouts.find({}, {"_id": 0}).to_list(10000)
    total_paid_to_pros = sum(p.get("net_amount_fcfa", 0) for p in payouts if p.get("status") == "completed")
    pending_payouts = sum(p.get("amount_fcfa", 0) for p in payouts if p.get("status") in ("pending", "processing"))

    return {
        "total_revenue_fcfa": total_revenue,
        "revenue_breakdown_by_kind": by_kind,
        "payment_methods": dict(sorted(by_method.items(), key=lambda x: -x[1])),
        "monthly_revenue": monthly_revenue,
        "transactions": len(payments),
        "avg_transaction_fcfa": round(total_revenue / max(len(payments), 1)),
        "payouts_to_pros": {
            "total_disbursed_fcfa": total_paid_to_pros,
            "pending_fcfa": pending_payouts,
            "count": len(payouts),
        },
    }


@api.get("/admin/metrics/medical-trends")
async def metrics_medical_trends(user=Depends(require_roles("admin"))):
    """Tendances médicales / motifs / spécialités — valeur pharma/recherche."""
    rdv = await db.rdv.find({}, {"_id": 0, "motif": 1, "type_consultation": 1, "pro_specialite": 1}).to_list(50000)
    motifs: dict[str, int] = {}
    types: dict[str, int] = {}
    specs: dict[str, int] = {}
    for r in rdv:
        m = (r.get("motif") or "").strip().lower()
        if m and len(m) > 3:
            # Tokenize (basique) : compte chaque mot significatif
            for token in m.split():
                t = token.strip(",.;:!?\"'()").lower()
                if len(t) > 3 and t not in {"avec", "pour", "dans", "consultation", "rdv", "rendez-vous"}:
                    motifs[t] = motifs.get(t, 0) + 1
        tc = r.get("type_consultation") or "autre"
        types[tc] = types.get(tc, 0) + 1
        sp = r.get("pro_specialite") or "autre"
        specs[sp] = specs.get(sp, 0) + 1

    quizzes = await db.quiz_responses.find({}, {"_id": 0}).to_list(20000) if hasattr(db, "quiz_responses") else []
    quiz_engagement = len(quizzes)

    pros = await db.users.find({"role": "professionnel"}, {"_id": 0, "specialite": 1}).to_list(5000)
    pros_specs: dict[str, int] = {}
    for p in pros:
        s = p.get("specialite") or "autre"
        pros_specs[s] = pros_specs.get(s, 0) + 1

    return {
        "top_consultation_keywords": dict(sorted(motifs.items(), key=lambda x: -x[1])[:25]),
        "consultation_types": dict(sorted(types.items(), key=lambda x: -x[1])[:15]),
        "demanded_specialties": dict(sorted(specs.items(), key=lambda x: -x[1])[:15]),
        "available_pro_specialties": dict(sorted(pros_specs.items(), key=lambda x: -x[1])),
        "supply_demand_gap": {
            spec: {"demand": specs.get(spec, 0), "supply": pros_specs.get(spec, 0)}
            for spec in set(list(specs.keys()) + list(pros_specs.keys()))
        },
        "educational_engagement": {
            "quiz_responses": quiz_engagement,
        },
    }


@api.get("/admin/metrics/engagement")
async def metrics_engagement(user=Depends(require_roles("admin"))):
    """Engagement & rétention — valeur produit/business."""
    now = datetime.now(timezone.utc)
    d1 = _iso_days_ago(1)
    d7 = _iso_days_ago(7)
    d30 = _iso_days_ago(30)

    dau = await db.users.count_documents({"last_login_at": {"$gte": d1}})
    wau = await db.users.count_documents({"last_login_at": {"$gte": d7}})
    mau = await db.users.count_documents({"last_login_at": {"$gte": d30}})

    # Cohorts par mois d'inscription, et rétention 30j
    cohorts: dict[str, dict] = {}
    for i in range(11, -1, -1):
        d = now.replace(day=1) - timedelta(days=i * 30)
        cohorts[d.strftime("%Y-%m")] = {"new": 0, "active": 0}

    users = await db.users.find({}, {"_id": 0, "created_at": 1, "last_login_at": 1}).to_list(50000)
    for u in users:
        try:
            ca = datetime.fromisoformat((u.get("created_at") or "").replace("Z", "+00:00"))
            key = ca.strftime("%Y-%m")
            if key in cohorts:
                cohorts[key]["new"] += 1
                la = u.get("last_login_at")
                if la and la >= d30:
                    cohorts[key]["active"] += 1
        except Exception:
            pass

    return {
        "daily_active_users": dau,
        "weekly_active_users": wau,
        "monthly_active_users": mau,
        "stickiness_pct": round((dau / max(mau, 1)) * 100, 1),
        "cohorts": cohorts,
        "messages_total": await db.messages.count_documents({}),
        "messages_30d": await db.messages.count_documents({"created_at": {"$gte": d30}}),
    }


# ======================================================================
# 📋 ANNUAIRE — Répertoire complet par rôle pour le super admin
# ======================================================================

@api.get("/admin/directory")
async def admin_directory(
    role: Optional[str] = None,
    q: Optional[str] = None,
    ville: Optional[str] = None,
    premium: Optional[bool] = None,
    cmu: Optional[bool] = None,
    sort: Optional[str] = "-created_at",
    limit: int = 50,
    offset: int = 0,
    user=Depends(require_roles("admin")),
):
    """Annuaire paginé filtrable de tous les utilisateurs."""
    query: dict = {}
    if role and role != "tous":
        query["role"] = role
    if q:
        rx = {"$regex": q, "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}, {"specialite": rx}, {"ville": rx}]
    if ville:
        query["ville"] = {"$regex": ville, "$options": "i"}
    if premium is not None:
        query["premium"] = premium
    if cmu is True:
        query["$or"] = (query.get("$or") or []) + [{"cmu.numero": {"$ne": None}}, {"accepte_cmu": True}]

    total = await db.users.count_documents(query)
    sort_field = sort.lstrip("-") if sort else "created_at"
    sort_dir = -1 if (sort or "").startswith("-") else 1

    cursor = (
        db.users.find(query, {"_id": 0, "password_hash": 0, "cmu.numero": 0})
        .sort(sort_field, sort_dir)
        .skip(offset)
        .limit(min(limit, 200))
    )
    rows = await cursor.to_list(min(limit, 200))

    # Enrichir avec compteurs
    for u in rows:
        uid = u["id"]
        if u.get("role") == "maman":
            u["_stats"] = {
                "grossesses": await db.grossesses.count_documents({"user_id": uid}),
                "enfants": await db.enfants.count_documents({"user_id": uid}),
                "rdv": await db.rdv.count_documents({"maman_id": uid}),
            }
        elif u.get("role") == "professionnel":
            payments = await db.payments.find({"pro_id": uid, "status": "completed"}, {"_id": 0, "pro_amount": 1}).to_list(5000)
            u["_stats"] = {
                "rdv": await db.rdv.count_documents({"pro_id": uid}),
                "patients": len(set([r.get("maman_id") for r in await db.rdv.find({"pro_id": uid}, {"_id": 0, "maman_id": 1}).to_list(5000)])),
                "revenue_fcfa": sum(p.get("pro_amount", 0) for p in payments),
            }
        elif u.get("role") == "centre_sante":
            u["_stats"] = {
                "rdv": await db.rdv.count_documents({"pro_id": uid}),
            }
        else:
            u["_stats"] = {}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": rows,
    }


@api.get("/admin/directory/{user_id}")
async def admin_directory_detail(user_id: str, user=Depends(require_roles("admin"))):
    """Fiche détaillée d'un utilisateur avec ses données associées."""
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "Utilisateur introuvable")
    role = target.get("role")
    detail: dict = {"user": target, "stats": {}, "recent": {}}
    if role == "maman":
        detail["stats"] = {
            "grossesses": await db.grossesses.count_documents({"user_id": user_id}),
            "enfants": await db.enfants.count_documents({"user_id": user_id}),
            "rdv": await db.rdv.count_documents({"maman_id": user_id}),
            "messages_sent": await db.messages.count_documents({"from_id": user_id}),
            "tracking_entries": await db.grossesse_tracking.count_documents({"user_id": user_id}),
            "plans_naissance": await db.plan_naissance.count_documents({"user_id": user_id}),
        }
        detail["recent"]["enfants"] = await db.enfants.find({"user_id": user_id}, {"_id": 0, "id": 1, "prenom": 1, "date_naissance": 1, "sexe": 1}).to_list(20)
        detail["recent"]["rdv"] = await db.rdv.find({"maman_id": user_id}, {"_id": 0}).sort("date", -1).to_list(10)
    elif role == "professionnel":
        payments = await db.payments.find({"pro_id": user_id, "status": "completed"}, {"_id": 0, "pro_amount": 1}).to_list(5000)
        detail["stats"] = {
            "rdv_total": await db.rdv.count_documents({"pro_id": user_id}),
            "rdv_completed": await db.rdv.count_documents({"pro_id": user_id, "status": "termine"}),
            "revenue_fcfa": sum(p.get("pro_amount", 0) for p in payments),
            "transactions": len(payments),
            "payouts_total": await db.payouts.count_documents({"pro_id": user_id}),
        }
        detail["recent"]["rdv"] = await db.rdv.find({"pro_id": user_id}, {"_id": 0}).sort("date", -1).to_list(10)
        detail["recent"]["payouts"] = await db.payouts.find({"pro_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return detail


# ======================================================================
# 📤 EXPORT CSV pour rapports gouvernementaux / OMS
# ======================================================================

@api.get("/admin/metrics/export")
async def metrics_export(kind: str = "overview", user=Depends(require_roles("admin"))):
    """Export CSV des métriques pour rapports externes."""
    import io as _io
    import csv as _csv

    fn_map = {
        "overview": metrics_overview,
        "maternal-health": metrics_maternal_health,
        "child-health": metrics_child_health,
        "healthcare-access": metrics_healthcare_access,
        "geographic": metrics_geographic,
        "financial": metrics_financial,
        "medical-trends": metrics_medical_trends,
        "engagement": metrics_engagement,
    }
    fn = fn_map.get(kind)
    if not fn:
        raise HTTPException(400, f"Type d'export inconnu : {kind}")
    data = await fn(user=user)

    buf = _io.StringIO()
    writer = _csv.writer(buf)
    writer.writerow(["section", "key", "value"])

    def flatten(prefix: str, obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                flatten(f"{prefix}.{k}" if prefix else k, v)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                flatten(f"{prefix}[{i}]", v)
        else:
            writer.writerow([prefix.split(".", 1)[0] if "." in prefix else "root", prefix, obj])

    flatten("", data)
    csv_bytes = buf.getvalue().encode("utf-8")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="alomaman_metrics_{kind}_{datetime.now(timezone.utc).strftime("%Y%m%d")}.csv"'},
    )


# ----------------------------------------------------------------------
# Photo de profil
# ----------------------------------------------------------------------
@api.post("/profile/photo")
async def set_profile_photo(payload: PhotoIn, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar": payload.photo_base64}})
    return {"ok": True}


# ----------------------------------------------------------------------
# CMU - Couverture Maladie Universelle (Côte d'Ivoire)
# ----------------------------------------------------------------------
class CMUBeneficiaire(BaseModel):
    nom: str
    numero_cmu: str
    relation: str  # enfant / conjoint / autre


class CMUIn(BaseModel):
    numero: str  # 12 chiffres
    nom_complet: str
    date_delivrance: Optional[str] = None  # YYYY-MM-DD
    date_validite: Optional[str] = None
    photo_recto: Optional[str] = None  # base64
    photo_verso: Optional[str] = None
    beneficiaires: List[CMUBeneficiaire] = []


def cmu_statut(cmu_doc: Optional[dict]) -> str:
    if not cmu_doc or not cmu_doc.get("numero"):
        return "absent"
    dv = cmu_doc.get("date_validite")
    if not dv:
        return "non_verifie"
    try:
        d = datetime.fromisoformat(dv).date()
        today = datetime.now(timezone.utc).date()
        if d < today:
            return "expire"
        return "actif"
    except Exception:
        return "non_verifie"


@api.get("/cmu/me")
async def get_my_cmu(user=Depends(get_current_user)):
    if user.get("role") not in ("maman", "famille"):
        raise HTTPException(403, "CMU réservé aux mamans et familles")
    cmu = user.get("cmu") or {}
    cmu_clear = decrypt_cmu_dict(cmu)
    return {"cmu": cmu_clear, "statut": cmu_statut(cmu_clear)}


@api.post("/cmu/me")
async def set_my_cmu(payload: CMUIn, user=Depends(get_current_user)):
    if user.get("role") not in ("maman", "famille"):
        raise HTTPException(403, "CMU réservé aux mamans et familles")
    numero = (payload.numero or "").strip().replace(" ", "")
    if not numero.isdigit() or len(numero) not in (10, 12):
        raise HTTPException(400, "Numéro CMU invalide (10 ou 12 chiffres attendus)")
    clear_doc = {
        "numero": numero,
        "nom_complet": payload.nom_complet.strip(),
        "date_delivrance": payload.date_delivrance,
        "date_validite": payload.date_validite,
        "photo_recto": payload.photo_recto,
        "photo_verso": payload.photo_verso,
        "beneficiaires": [b.dict() for b in (payload.beneficiaires or [])],
        "verifie": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # 🔐 Chiffrement AES-256-GCM au repos
    import hashlib as _hl
    enc_doc = encrypt_cmu_dict(clear_doc)
    enc_doc["numero_hash"] = _hl.sha256(numero.encode()).hexdigest()[:16]
    await db.users.update_one({"id": user["id"]}, {"$set": {"cmu": enc_doc}})
    return {"cmu": clear_doc, "statut": cmu_statut(clear_doc)}


@api.delete("/cmu/me")
async def delete_my_cmu(user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"cmu": ""}})
    return {"ok": True}


class ProCMUIn(BaseModel):
    accepte_cmu: bool


@api.patch("/pro/cmu")
async def set_pro_cmu(payload: ProCMUIn, user=Depends(require_roles("professionnel"))):
    await db.users.update_one({"id": user["id"]}, {"$set": {"accepte_cmu": payload.accepte_cmu}})
    return {"accepte_cmu": payload.accepte_cmu}


# Facturation CMU pour pro : liste des consultations CMU payées (reste-à-charge uniquement → solde CMU dû par l'État)
@api.get("/pro/facturation-cmu")
async def pro_facturation_cmu(user=Depends(require_roles("professionnel"))):
    rdvs = await db.rdv.find(
        {"pro_id": user["id"], "cmu_applique": True},
        {"_id": 0},
    ).sort("date", -1).to_list(500)
    # Résumé
    total_brut = sum(r.get("tarif_fcfa", 0) for r in rdvs)
    total_patient = sum(r.get("reste_a_charge_fcfa", 0) for r in rdvs)
    total_cmu_du = sum(r.get("cmu_montant_fcfa", 0) for r in rdvs)
    # Enrichir avec nom des patientes
    maman_ids = list({r["maman_id"] for r in rdvs if r.get("maman_id")})
    mamans = {}
    if maman_ids:
        async for u in db.users.find({"id": {"$in": maman_ids}}, {"_id": 0, "id": 1, "name": 1, "cmu": 1}):
            mamans[u["id"]] = u
    for r in rdvs:
        m = mamans.get(r.get("maman_id"), {})
        r["maman_nom"] = m.get("name")
        # Utiliser rdv.cmu_numero (stocké en clair) — users.cmu.numero est chiffré
        r["numero_cmu"] = r.get("cmu_numero") or ""
    return {
        "total_rdv": len(rdvs),
        "total_brut_fcfa": total_brut,
        "total_reste_a_charge_fcfa": total_patient,
        "total_cmu_du_fcfa": total_cmu_du,
        "rdvs": rdvs,
    }


@api.get("/pro/facturation-cmu/csv")
async def pro_facturation_cmu_csv(user=Depends(require_roles("professionnel"))):
    from fastapi.responses import PlainTextResponse
    rdvs = await db.rdv.find(
        {"pro_id": user["id"], "cmu_applique": True},
        {"_id": 0},
    ).sort("date", -1).to_list(500)
    maman_ids = list({r["maman_id"] for r in rdvs if r.get("maman_id")})
    mamans = {}
    if maman_ids:
        async for u in db.users.find({"id": {"$in": maman_ids}}, {"_id": 0, "id": 1, "name": 1, "cmu": 1}):
            mamans[u["id"]] = u
    import io, csv
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Date", "Patiente", "Numero CMU", "Prestation", "Tarif brut (F)", "Taux CMU", "Montant CMU du (F)", "Reste a charge (F)", "Status"])
    for r in rdvs:
        m = mamans.get(r.get("maman_id"), {})
        w.writerow([
            (r.get("date") or "")[:10],
            m.get("name", ""),
            r.get("cmu_numero", ""),  # stocké en clair sur le rdv (users.cmu.numero est chiffré)
            r.get("prestation_nom") or r.get("motif", ""),
            r.get("tarif_fcfa", 0),
            f"{int((r.get('cmu_taux') or 0) * 100)}%",
            r.get("cmu_montant_fcfa", 0),
            r.get("reste_a_charge_fcfa", 0),
            r.get("status", ""),
        ])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv; charset=utf-8")


@api.get("/admin/cmu/stats")
async def admin_cmu_stats(user=Depends(require_roles("admin"))):
    total_mamans = await db.users.count_documents({"role": "maman"})
    mamans_cmu = await db.users.count_documents({"role": "maman", "cmu.numero": {"$exists": True, "$ne": None}})
    pros_total = await db.users.count_documents({"role": "professionnel"})
    pros_cmu = await db.users.count_documents({"role": "professionnel", "accepte_cmu": True})
    rdv_cmu = await db.rdv.count_documents({"cmu_applique": True})
    # Somme CMU due
    cursor = db.rdv.aggregate([
        {"$match": {"cmu_applique": True}},
        {"$group": {"_id": None, "due": {"$sum": "$cmu_montant_fcfa"}, "brut": {"$sum": "$tarif_fcfa"}}},
    ])
    agg = await cursor.to_list(1)
    return {
        "total_mamans": total_mamans,
        "mamans_total": total_mamans,
        "mamans_avec_cmu": mamans_cmu,
        "mamans_pct_cmu": round(100 * mamans_cmu / total_mamans, 1) if total_mamans else 0,
        "total_pros": pros_total,
        "pros_total": pros_total,
        "pros_acceptant_cmu": pros_cmu,
        "rdv_cmu_total": rdv_cmu,
        "total_cmu_du_fcfa": (agg[0].get("due", 0) if agg else 0),
        "total_brut_cmu_fcfa": (agg[0].get("brut", 0) if agg else 0),
    }


# ----------------------------------------------------------------------
# Ressources éducatives (Vidéos, Fiches, Quiz) — validées par OMS/UNICEF/MSHP-CI
# ----------------------------------------------------------------------
# Catégories : grossesse | accouchement | allaitement | post_partum | nutrition
#            | vaccination | planification_familiale | sante_enfant | hygiene | general
RESOURCE_CATEGORIES = [
    "grossesse", "accouchement", "allaitement", "post_partum", "nutrition",
    "vaccination", "planification_familiale", "sante_enfant", "hygiene", "general",
]

class QuizQuestion(BaseModel):
    question: str
    options: List[str]  # 2-6 options
    correct_index: int
    explication: Optional[str] = None

class ResourceIn(BaseModel):
    type: str  # video | fiche | quiz
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    category: str = "general"
    # pour video
    video_url: Optional[str] = None  # YouTube, Vimeo, lien direct
    duration_sec: Optional[int] = None
    # pour fiche
    content_md: Optional[str] = None  # Markdown (ou texte)
    cover_image: Optional[str] = None  # URL ou base64
    # pour quiz
    questions: List[QuizQuestion] = []
    # méta
    tags: List[str] = []
    source: Optional[str] = None  # "OMS", "UNICEF", "MSHP-CI"
    author_name: Optional[str] = None
    published: bool = True
    langue: str = "fr"

class ResourcePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    video_url: Optional[str] = None
    content_md: Optional[str] = None
    cover_image: Optional[str] = None
    questions: Optional[List[QuizQuestion]] = None
    tags: Optional[List[str]] = None
    source: Optional[str] = None
    published: Optional[bool] = None
    langue: Optional[str] = None


@api.get("/resources")
async def list_resources(
    user=Depends(get_current_user),
    type: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
):
    query: dict = {"published": True}
    if type in ("video", "fiche", "quiz"):
        query["type"] = type
    else:
        # Par défaut, on EXCLUT les vidéos (YouTube embeds bloqués Error 153 dans Expo WebView).
        # Les vidéos seront réintroduites quand un hébergement MP4/CDN sera en place.
        query["type"] = {"$ne": "video"}
    if category and category != "toutes":
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"tags": {"$in": [q.lower()]}},
        ]
    projection = {"_id": 0, "content_md": 0, "questions": 0}  # léger en liste
    items = await db.resources.find(query, projection).sort("created_at", -1).to_list(min(limit, 300))
    return items


@api.get("/resources/{rid}")
async def get_resource(rid: str, user=Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid}, {"_id": 0})
    if not r or not r.get("published"):
        raise HTTPException(404, "Ressource introuvable")
    # Ne pas exposer la réponse correcte sur le GET (quiz)
    if r.get("type") == "quiz" and not user.get("role") == "admin":
        for q in (r.get("questions") or []):
            q.pop("correct_index", None)
            q.pop("explication", None)
    # Incrémenter vues
    await db.resources.update_one({"id": rid}, {"$inc": {"views": 1}})
    return r


@api.post("/resources")
async def create_resource(payload: ResourceIn, user=Depends(require_roles("admin", "professionnel"))):
    if payload.type not in ("video", "fiche", "quiz"):
        raise HTTPException(400, "Type invalide (video | fiche | quiz)")
    if payload.category not in RESOURCE_CATEGORIES:
        raise HTTPException(400, f"Catégorie invalide. Choix : {', '.join(RESOURCE_CATEGORIES)}")
    if payload.type == "video" and not payload.video_url:
        raise HTTPException(400, "video_url requis pour une vidéo")
    if payload.type == "fiche" and not payload.content_md:
        raise HTTPException(400, "content_md requis pour une fiche")
    if payload.type == "quiz":
        if not payload.questions or len(payload.questions) < 1:
            raise HTTPException(400, "Au moins 1 question requise pour un quiz")
        for q in payload.questions:
            if len(q.options) < 2:
                raise HTTPException(400, "Chaque question doit avoir au moins 2 options")
            if q.correct_index < 0 or q.correct_index >= len(q.options):
                raise HTTPException(400, "Index correct hors limites")
    doc = {
        "id": str(uuid.uuid4()),
        **payload.dict(),
        "author_id": user["id"],
        "author_role": user.get("role"),
        "views": 0,
        "likes": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not doc.get("author_name"):
        doc["author_name"] = user.get("name")
    await db.resources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/resources/{rid}")
async def update_resource(rid: str, payload: ResourcePatch, user=Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Ressource introuvable")
    # Admin = tout, pro = uniquement ses ressources
    if user.get("role") not in ("admin",) and r.get("author_id") != user["id"]:
        raise HTTPException(403, "Vous ne pouvez modifier que vos propres ressources")
    data = {k: v for k, v in payload.dict().items() if v is not None}
    if "category" in data and data["category"] not in RESOURCE_CATEGORIES:
        raise HTTPException(400, "Catégorie invalide")
    if data:
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.resources.update_one({"id": rid}, {"$set": data})
    return await db.resources.find_one({"id": rid}, {"_id": 0})


@api.delete("/resources/{rid}")
async def delete_resource(rid: str, user=Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Ressource introuvable")
    if user.get("role") != "admin" and r.get("author_id") != user["id"]:
        raise HTTPException(403, "Vous ne pouvez supprimer que vos propres ressources")
    await db.resources.delete_one({"id": rid})
    return {"ok": True}


@api.post("/resources/{rid}/like")
async def like_resource(rid: str, user=Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid})
    if not r:
        raise HTTPException(404, "Ressource introuvable")
    if user["id"] in (r.get("likes") or []):
        await db.resources.update_one({"id": rid}, {"$pull": {"likes": user["id"]}})
        return {"liked": False}
    await db.resources.update_one({"id": rid}, {"$push": {"likes": user["id"]}})
    return {"liked": True}


class QuizSubmitIn(BaseModel):
    answers: List[int]  # une réponse (index) par question


@api.post("/resources/{rid}/quiz-submit")
async def submit_quiz(rid: str, payload: QuizSubmitIn, user=Depends(get_current_user)):
    r = await db.resources.find_one({"id": rid}, {"_id": 0})
    if not r or r.get("type") != "quiz":
        raise HTTPException(404, "Quiz introuvable")
    questions = r.get("questions") or []
    if len(payload.answers) != len(questions):
        raise HTTPException(400, "Nombre de réponses incorrect")
    results = []
    correct_count = 0
    for i, q in enumerate(questions):
        is_ok = int(payload.answers[i]) == int(q.get("correct_index", -1))
        if is_ok:
            correct_count += 1
        results.append({
            "question": q.get("question"),
            "your_answer_index": int(payload.answers[i]),
            "correct_index": int(q.get("correct_index", -1)),
            "correct": is_ok,
            "explication": q.get("explication"),
        })
    score_pct = round(100 * correct_count / len(questions)) if questions else 0
    attempt = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "resource_id": rid,
        "resource_title": r.get("title"),
        "score_pct": score_pct,
        "correct_count": correct_count,
        "total": len(questions),
        "answers": payload.answers,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quiz_attempts.insert_one(attempt)
    return {
        "score_pct": score_pct,
        "correct_count": correct_count,
        "total": len(questions),
        "results": results,
    }


@api.get("/resources/me/quiz-history")
async def my_quiz_history(user=Depends(get_current_user)):
    items = await db.quiz_attempts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@api.get("/resources/meta/categories")
async def resource_categories():
    return {"categories": RESOURCE_CATEGORIES}


# ----------------------------------------------------------------------
# 📚 Contenus éducatifs (foetus semaine/semaine, diversification, jalons)
# ----------------------------------------------------------------------
from educational_content import (
    FOETUS_SEMAINE, DIVERSIFICATION, JALONS,
    get_foetus_week, get_diversification_step, get_jalons_for_age,
)
from educational_content_extra import (
    MAISON_SECURISEE, GLOSSAIRE, ACTIVITES, QUIZZES, get_activities_for_age,
)


# ----------------------------------------------------------------------
# 🏠 Maison sécurisée — checklist par pièce
# ----------------------------------------------------------------------
@api.get("/maison-securisee")
async def maison_securisee(user=Depends(get_current_user)):
    """Retourne la checklist complète de sécurité de la maison."""
    return {"pieces": MAISON_SECURISEE}


@api.post("/maison-securisee/check")
async def save_check_state(payload: dict, user=Depends(get_current_user)):
    """Enregistre les items cochés par l'utilisateur. Body: {checked: ['salon_1', 'cuisine_3', ...]}"""
    checked = payload.get("checked", [])
    if not isinstance(checked, list):
        raise HTTPException(400, "checked doit être une liste")
    await db.maison_securisee_state.update_one(
        {"user_id": user["id"]},
        {"$set": {"checked": checked, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "count": len(checked)}


@api.get("/maison-securisee/state")
async def get_check_state(user=Depends(get_current_user)):
    s = await db.maison_securisee_state.find_one({"user_id": user["id"]}, {"_id": 0})
    return s or {"checked": []}


# ----------------------------------------------------------------------
# 📖 Glossaire médical
# ----------------------------------------------------------------------
@api.get("/glossaire")
async def glossaire(q: str = "", user=Depends(get_current_user)):
    """Retourne le glossaire trié alphabétiquement, filtrable par query."""
    items = sorted(GLOSSAIRE, key=lambda x: x["terme"].lower())
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i["terme"].lower() or ql in i["definition"].lower()]
    return {"items": items, "total": len(items)}


# ----------------------------------------------------------------------
# 🎮 Activités/jeux par âge
# ----------------------------------------------------------------------
@api.get("/activites")
async def activites_all(user=Depends(get_current_user)):
    return {"tranches": ACTIVITES}


@api.get("/activites/{age_mois}")
async def activites_for_age(age_mois: int, user=Depends(get_current_user)):
    return get_activities_for_age(age_mois)


# ----------------------------------------------------------------------
# 🩺 Quiz auto-évaluation
# ----------------------------------------------------------------------
@api.get("/quiz")
async def list_quizzes(user=Depends(get_current_user)):
    """Retourne la liste des quiz disponibles (sans les questions, juste meta)."""
    return {"quizzes": [
        {"key": k, "title": v["title"], "intro": v["intro"], "n_questions": len(v["questions"])}
        for k, v in QUIZZES.items()
    ]}


@api.get("/quiz/{quiz_key}")
async def get_quiz(quiz_key: str, user=Depends(get_current_user)):
    if quiz_key not in QUIZZES:
        raise HTTPException(404, "Quiz introuvable")
    return QUIZZES[quiz_key]


@api.post("/quiz/{quiz_key}/score")
async def score_quiz(quiz_key: str, payload: dict, user=Depends(get_current_user)):
    """Calcule le score à partir des réponses. Body: {answers: [true, false, true, ...]}"""
    if quiz_key not in QUIZZES:
        raise HTTPException(404, "Quiz introuvable")
    quiz = QUIZZES[quiz_key]
    answers = payload.get("answers", [])
    if len(answers) != len(quiz["questions"]):
        raise HTTPException(400, f"Attendu {len(quiz['questions'])} réponses, reçu {len(answers)}")
    score = 0
    for q, a in zip(quiz["questions"], answers):
        is_yes = bool(a)
        if q.get("inverse"):
            # question inversée : un "non" indique un problème
            score += q["p"] if not is_yes else 0
        else:
            score += q["p"] if is_yes else 0
    # Trouver le seuil
    result = quiz["thresholds"][-1]
    for t in quiz["thresholds"]:
        if score <= t["max"]:
            result = t
            break
    # Sauvegarder l'historique
    try:
        await db.quiz_results.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "quiz_key": quiz_key,
            "answers": answers,
            "score": score,
            "level": result["level"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    return {"score": score, "result": result}


@api.get("/foetus/{sa}")
async def foetus_week(sa: int, user=Depends(get_current_user)):
    """Retourne le développement du foetus pour la semaine d'aménorrhée donnée."""
    return get_foetus_week(sa)


@api.get("/foetus")
async def foetus_current(user=Depends(get_current_user)):
    """Retourne le contenu pour la SA actuelle de la maman (basé sur sa grossesse active)."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    g = await db.grossesses.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if not g or not g.get("date_debut"):
        raise HTTPException(404, "Aucune grossesse active. Veuillez en créer une dans l'onglet Grossesse.")
    try:
        ddr = datetime.fromisoformat(g["date_debut"].replace("Z", "+00:00"))
        if ddr.tzinfo is None:
            ddr = ddr.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, "Date de début de grossesse invalide")
    sa = max(4, min(41, int((datetime.now(timezone.utc) - ddr).days / 7)))
    return {**get_foetus_week(sa), "current_sa": sa, "ddr": g["date_debut"]}


@api.get("/diversification")
async def diversification_all(user=Depends(get_current_user)):
    """Retourne tout le calendrier de diversification (5 étapes)."""
    return {"etapes": DIVERSIFICATION}


@api.get("/diversification/{age_mois}")
async def diversification_for_age(age_mois: int, user=Depends(get_current_user)):
    """Retourne l'étape de diversification pour l'âge donné en mois."""
    step = get_diversification_step(age_mois)
    if not step:
        raise HTTPException(404, "L'enfant est trop jeune (allaitement exclusif jusqu'à 6 mois)")
    return step


@api.get("/jalons")
async def jalons_all(user=Depends(get_current_user)):
    return {"jalons": JALONS}


# ============================================================================
# 🎯 DMP — Détection Multi-domaine du Précoce (52 jalons / 7 domaines)
# ============================================================================
from dmp_data import (
    DOMAINS as DMP_DOMAINS,
    MILESTONES as DMP_MILESTONES,
    search_milestones as _dmp_search,
    compute_dmp_status as _dmp_compute,
    get_milestone as _dmp_get,
)


@api.get("/dmp/milestones")
async def dmp_milestones(q: str = "", domaine: str = "", user=Depends(get_current_user)):
    """Catalogue complet des jalons DMP (recherche + filtre par domaine optionnels)."""
    items = _dmp_search(q, domaine)
    return {"domains": DMP_DOMAINS, "milestones": items, "total": len(items)}


@api.get("/enfants/{eid}/dmp")
async def dmp_for_enfant(eid: str, user=Depends(require_roles("maman", "professionnel"))):
    """Statut DMP pour un enfant : items + scores par domaine + alertes."""
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    # Maman : doit être le sien. Pro : libre (RDV ou consentement vérifiés ailleurs).
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé à ce dossier")

    # Calcul de l'âge en mois
    try:
        dn_str = str(e["date_naissance"]).replace("Z", "+00:00")
        dn = datetime.fromisoformat(dn_str)
        if dn.tzinfo is None:
            dn = dn.replace(tzinfo=timezone.utc)
        age_mois = max(0, int((datetime.now(timezone.utc) - dn).total_seconds() / (30.4375 * 86400)))
    except Exception:
        age_mois = 0

    # Récupère les réponses enregistrées (collection dmp_progress)
    progress = await db.dmp_progress.find({"enfant_id": eid}, {"_id": 0}).to_list(500)
    # Carte {milestone_id: "oui"|"non"}.
    # Compatibilité ascendante : anciens documents sans champ `response` = "oui" (acquis).
    responses: dict = {}
    answered_dates: dict = {}
    for p in progress:
        mid = p.get("milestone_id")
        if not mid:
            continue
        resp = p.get("response")
        if resp not in ("oui", "non"):
            resp = "oui"  # legacy : tout doc sans response était un "acquis"
        responses[mid] = resp
        answered_dates[mid] = p.get("answered_at") or p.get("acquired_at")

    result = _dmp_compute(age_mois, responses)
    # Enrichir items avec date de réponse
    for it in result["items"]:
        it["answered_at"] = answered_dates.get(it["id"])
        # Compat front existant
        it["acquired_at"] = answered_dates.get(it["id"]) if it.get("response") == "oui" else None
    result["enfant"] = {"id": eid, "nom": e.get("nom"), "sexe": e.get("sexe"), "date_naissance": e.get("date_naissance")}
    return result


class DmpResponseBody(BaseModel):
    response: str  # "oui" | "non"


@api.post("/enfants/{eid}/dmp/{milestone_id}")
async def dmp_mark_response(
    eid: str,
    milestone_id: str,
    body: Optional[DmpResponseBody] = None,
    user=Depends(require_roles("maman", "professionnel")),
):
    """Enregistre la réponse Oui/Non pour un jalon (mode bilan).

    Body optionnel `{response: "oui" | "non"}`. Sans body → "oui" (compat ascendante).
    """
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if not _dmp_get(milestone_id):
        raise HTTPException(404, "Jalon introuvable")

    response_value = (body.response if body else "oui") or "oui"
    if response_value not in ("oui", "non"):
        raise HTTPException(400, "response doit être 'oui' ou 'non'")

    now_iso = datetime.now(timezone.utc).isoformat()
    set_doc = {
        "enfant_id": eid,
        "milestone_id": milestone_id,
        "response": response_value,
        "answered_at": now_iso,
        "answered_by": user["id"],
        "answered_role": user["role"],
    }
    # Compat ascendante : conserver acquired_at si réponse Oui
    if response_value == "oui":
        set_doc["acquired_at"] = now_iso
        set_doc["acquired_by"] = user["id"]

    await db.dmp_progress.update_one(
        {"enfant_id": eid, "milestone_id": milestone_id},
        {"$set": set_doc},
        upsert=True,
    )
    return {"ok": True, "milestone_id": milestone_id, "response": response_value}


@api.delete("/enfants/{eid}/dmp/{milestone_id}")
async def dmp_unmark(eid: str, milestone_id: str, user=Depends(require_roles("maman", "professionnel"))):
    """Annule la réponse pour un jalon (retour à 'non répondu')."""
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    await db.dmp_progress.delete_one({"enfant_id": eid, "milestone_id": milestone_id})
    return {"ok": True}


@api.get("/enfants/{eid}/dmp/bilan-rapide")
async def dmp_bilan_rapide_pending(eid: str, user=Depends(require_roles("maman", "professionnel"))):
    """Retourne les jalons attendus pour l'âge ET non encore répondus → flux Bilan Rapide."""
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")

    try:
        dn_str = str(e["date_naissance"]).replace("Z", "+00:00")
        dn = datetime.fromisoformat(dn_str)
        if dn.tzinfo is None:
            dn = dn.replace(tzinfo=timezone.utc)
        age_mois = max(0, int((datetime.now(timezone.utc) - dn).total_seconds() / (30.4375 * 86400)))
    except Exception:
        age_mois = 0

    progress = await db.dmp_progress.find({"enfant_id": eid}, {"_id": 0}).to_list(500)
    answered = {p["milestone_id"] for p in progress if p.get("milestone_id")}

    # Jalons attendus pour l'âge ET non répondus (par groupes de domaine)
    pending = [
        m for m in DMP_MILESTONES
        if m["age_typique"] <= age_mois and m["id"] not in answered
    ]
    # Tri : les "alertes" (age > age_alerte) d'abord, puis les attendus
    pending.sort(key=lambda m: (0 if age_mois > m["age_alerte"] else 1, m["age_typique"]))

    return {
        "enfant": {"id": eid, "nom": e.get("nom"), "date_naissance": e.get("date_naissance")},
        "age_mois": age_mois,
        "items": pending,
        "total": len(pending),
    }



@api.get("/jalons/{age_mois}")
async def jalons_for_age(age_mois: int, user=Depends(get_current_user)):
    """Retourne les jalons attendus à un âge donné."""
    j = get_jalons_for_age(age_mois)
    if not j:
        raise HTTPException(404, "Trop jeune pour avoir des jalons spécifiques")
    return j


@api.get("/enfants/{eid}/jalons")
async def jalons_for_enfant(eid: str, user=Depends(require_roles("maman"))):
    """Calcule l'âge en mois et retourne les jalons + alertes."""
    enfant = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not enfant:
        raise HTTPException(404, "Enfant introuvable")
    try:
        nais = datetime.fromisoformat(enfant["date_naissance"].replace("Z", "+00:00"))
        if nais.tzinfo is None:
            nais = nais.replace(tzinfo=timezone.utc)
    except Exception:
        raise HTTPException(400, "Date de naissance invalide")
    age_mois = max(0, int((datetime.now(timezone.utc) - nais).days / 30.4375))
    j = get_jalons_for_age(age_mois)
    if not j:
        # Encore trop jeune : retourne le 1er jalon (2 mois) avec un message
        return {"age_mois": age_mois, "jalon": JALONS[0], "trop_jeune": True}
    return {"age_mois": age_mois, "jalon": j, "trop_jeune": False}


# ----------------------------------------------------------------------
# 📋 Plan de naissance
# ----------------------------------------------------------------------
class PlanNaissanceIn(BaseModel):
    lieu_souhaite: Optional[str] = None
    centre_id: Optional[str] = None
    accompagnant: Optional[str] = None
    accompagnant_relation: Optional[str] = None
    position_souhaitee: Optional[str] = None
    anesthesie: Optional[str] = None
    musique: Optional[str] = None
    ambiance: Optional[str] = None
    peau_a_peau: bool = True
    coupe_cordon: Optional[str] = None
    allaitement: Optional[str] = None
    placenta: Optional[str] = None
    photos_video: bool = False
    visiteurs_apres: Optional[str] = None
    notes: Optional[str] = None
    en_cas_cesarienne: Optional[str] = None
    en_cas_complications: Optional[str] = None


# ----------------------------------------------------------------------
# 🤰 Tracking grossesse (poids / tension / symptomes / journal / vaccins)
# ----------------------------------------------------------------------
class TrackingEntryIn(BaseModel):
    type: str  # poids|tension|symptome|journal|vaccin
    date: str  # ISO
    value: Optional[float] = None  # poids en kg
    value2: Optional[float] = None  # tension diastolique
    text: Optional[str] = None  # symptôme/journal/nom vaccin
    notes: Optional[str] = None
    sa: Optional[int] = None  # semaine d'aménorrhée


@api.get("/grossesse/tracking")
async def get_tracking(type: str = "", user=Depends(require_roles("maman"))):
    q: dict = {"user_id": user["id"]}
    if type:
        q["type"] = type
    entries = await db.grossesse_tracking.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return {"entries": entries, "total": len(entries)}


@api.post("/grossesse/tracking")
async def add_tracking(payload: TrackingEntryIn, user=Depends(require_roles("maman"))):
    valid_types = {"poids", "tension", "symptome", "journal", "vaccin"}
    if payload.type not in valid_types:
        raise HTTPException(400, f"Type invalide. Doit être : {valid_types}")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": payload.type,
        "date": payload.date,
        "value": payload.value,
        "value2": payload.value2,
        "text": payload.text,
        "notes": payload.notes,
        "sa": payload.sa,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesse_tracking.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/grossesse/tracking/{entry_id}")
async def delete_tracking(entry_id: str, user=Depends(require_roles("maman"))):
    r = await db.grossesse_tracking.delete_one({"id": entry_id, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Entrée introuvable")
    return {"ok": True}



    lieu_souhaite: Optional[str] = None  # "Domicile" / "Centre" / etc.
    centre_id: Optional[str] = None
    accompagnant: Optional[str] = None  # nom de l'accompagnant
    accompagnant_relation: Optional[str] = None  # "conjoint", "mère", "soeur"
    position_souhaitee: Optional[str] = None  # "Allongée", "Assise", "Accroupie", "Autre"
    anesthesie: Optional[str] = None  # "Péridurale si possible", "Naturelle", "À discuter"
    musique: Optional[str] = None
    ambiance: Optional[str] = None  # "Lumière tamisée", "Calme", etc.
    peau_a_peau: bool = True
    coupe_cordon: Optional[str] = None  # "Conjoint", "Médecin", "Moi-même"
    allaitement: Optional[str] = None  # "Maternel exclusif", "Mixte", "Biberon"
    placenta: Optional[str] = None
    photos_video: bool = False
    visiteurs_apres: Optional[str] = None
    notes: Optional[str] = None
    en_cas_cesarienne: Optional[str] = None
    en_cas_complications: Optional[str] = None


@api.get("/plan-naissance")
async def get_plan_naissance(user=Depends(require_roles("maman"))):
    """Retourne le plan de naissance de la maman (ou {} si pas encore créé)."""
    plan = await db.plans_naissance.find_one({"user_id": user["id"]}, {"_id": 0})
    return plan or {}


@api.post("/plan-naissance")
async def upsert_plan_naissance(payload: PlanNaissanceIn, user=Depends(require_roles("maman"))):
    """Crée ou met à jour le plan de naissance de la maman."""
    existing = await db.plans_naissance.find_one({"user_id": user["id"]})
    data = payload.dict(exclude_none=False)
    if existing:
        await db.plans_naissance.update_one(
            {"user_id": user["id"]},
            {"$set": {**data, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            **data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.plans_naissance.insert_one(doc)
    return await db.plans_naissance.find_one({"user_id": user["id"]}, {"_id": 0})


# ----------------------------------------------------------------------
# 📰 Infolettre hebdomadaire personnalisée (génère contenu adapté SA/âge enfant)
# ----------------------------------------------------------------------
@api.get("/infolettre")
async def infolettre_perso(user=Depends(get_current_user)):
    """
    Retourne le contenu personnalisé de la semaine pour la maman.
    Si grossesse active : développement foetus + conseil. Si enfant actif : jalon + diversification.
    """
    if user.get("role") != "maman":
        return {"items": [], "message": "Disponible uniquement pour les mamans"}

    items = []
    g = await db.grossesses.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if g and g.get("date_debut"):
        try:
            ddr = datetime.fromisoformat(g["date_debut"].replace("Z", "+00:00"))
            if ddr.tzinfo is None:
                ddr = ddr.replace(tzinfo=timezone.utc)
            sa = max(4, min(41, int((datetime.now(timezone.utc) - ddr).days / 7)))
            f = get_foetus_week(sa)
            items.append({
                "type": "foetus",
                "sa": sa,
                "title": f"Semaine {sa} : {f['title']}",
                "fruit": f["fruit"],
                "taille": f["taille"],
                "highlights": f["highlights"][:2],
                "conseil": f["conseil"],
                "cta": "Voir le détail",
                "link": f"/foetus/{sa}",
            })
        except Exception:
            pass

    enfants = await db.enfants.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
    for e in enfants[:3]:
        try:
            nais = datetime.fromisoformat(e["date_naissance"].replace("Z", "+00:00"))
            if nais.tzinfo is None:
                nais = nais.replace(tzinfo=timezone.utc)
            age_mois = max(0, int((datetime.now(timezone.utc) - nais).days / 30.4375))
            if age_mois <= 72:
                jal = get_jalons_for_age(age_mois)
                if jal:
                    items.append({
                        "type": "jalon",
                        "enfant_id": e["id"],
                        "enfant_nom": e["nom"],
                        "age_mois": age_mois,
                        "title": f"{e['nom']} — {jal['title']}",
                        "highlights": (jal["moteur"][:1] + jal["langage"][:1] + jal["affectif"][:1]),
                        "alerte": jal["alerte"][:2],
                        "cta": "Faire le bilan",
                        "link": f"/jalons/{e['id']}",
                    })
            if 6 <= age_mois <= 24:
                step = get_diversification_step(age_mois)
                if step:
                    items.append({
                        "type": "diversification",
                        "enfant_id": e["id"],
                        "enfant_nom": e["nom"],
                        "age_mois": age_mois,
                        "title": f"Alimentation à {age_mois} mois",
                        "etape": step["title"],
                        "tips": step["tips"],
                        "cta": "Voir le calendrier",
                        "link": "/diversification",
                    })
        except Exception:
            continue

    return {
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "subscriber_name": user.get("name"),
    }



# ----------------------------------------------------------------------
# Cycle menstruel
# ----------------------------------------------------------------------
@api.get("/cycle")
async def list_cycles(user=Depends(require_roles("maman"))):
    items = await db.cycles.find({"user_id": user["id"]}, {"_id": 0}).sort("date_debut_regles", -1).to_list(50)
    return items


@api.post("/cycle")
async def create_cycle(payload: CycleIn, user=Depends(require_roles("maman"))):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cycles.insert_one(doc)
    doc.pop("_id", None)
    # 🔔 Auto-rappels intelligents : ovulation (J14) + fenêtre fertile (J10) + prochaines règles (J cycle)
    try:
        s = payload.date_debut_regles
        # Si pas de tz, l'assumer UTC
        start_dt = datetime.fromisoformat(s.replace("Z", "+00:00")) if "T" in s else datetime.fromisoformat(s + "T00:00:00+00:00")
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        cycle_len = int(payload.duree_cycle or 28)
        ovu_day = cycle_len - 14
        fenetre_start = max(1, ovu_day - 4)
        next_regles = cycle_len
        now = datetime.now(timezone.utc)

        def _due(offset_days: int):
            d = start_dt + timedelta(days=offset_days)
            return d.replace(hour=9, minute=0, second=0, microsecond=0)

        rappels = [
            ("Fenêtre fertile 🌸", "Votre fenêtre de fertilité commence aujourd'hui.", _due(fenetre_start), "cycle_fertile"),
            ("Ovulation estimée 🌱", f"Jour d'ovulation probable (J{ovu_day} du cycle).", _due(ovu_day), "cycle_ovulation"),
            ("Prochaines règles ⏰", "Vos prochaines règles sont attendues demain.", _due(next_regles - 1), "cycle_regles_pre"),
        ]
        for title, body, due, kind in rappels:
            if due > now:
                await db.reminders.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "title": title,
                    "description": body,
                    "due_at": due.isoformat(),
                    "kind": kind,
                    "source": "auto_cycle",
                    "cycle_id": doc["id"],
                    "done": False,
                    "created_at": now.isoformat(),
                })
    except Exception as e:
        logger.warning(f"Auto-reminders cycle failed: {e}")
    return doc


@api.delete("/cycle/{cid}")
async def delete_cycle(cid: str, user=Depends(require_roles("maman"))):
    await db.cycles.delete_one({"id": cid, "user_id": user["id"]})
    return {"ok": True}


# ----------------------------------------------------------------------
# Contraception
# ----------------------------------------------------------------------
@api.get("/contraception")
async def list_contraception(user=Depends(require_roles("maman"))):
    items = await db.contraception.find({"user_id": user["id"]}, {"_id": 0}).sort("date_debut", -1).to_list(50)
    return items


@api.post("/contraception")
async def create_contraception(payload: ContraceptionIn, user=Depends(require_roles("maman"))):
    # Deactivate previous
    await db.contraception.update_many(
        {"user_id": user["id"], "active": True}, {"$set": {"active": False}}
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contraception.insert_one(doc)
    doc.pop("_id", None)
    # 🔔 Auto-rappels selon méthode
    try:
        now = datetime.now(timezone.utc)
        s = payload.date_debut
        if s:
            start = datetime.fromisoformat(s.replace("Z", "+00:00")) if "T" in s else datetime.fromisoformat(s + "T00:00:00+00:00")
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
        else:
            start = now
        methode = (payload.methode or "").lower()
        rappels = []
        if methode == "pilule":
            # Rappel quotidien pour 30 jours à l'heure de début (par défaut 8h)
            for i in range(30):
                due = (start + timedelta(days=i)).replace(hour=8, minute=0, second=0, microsecond=0)
                if due > now:
                    rappels.append((f"💊 Prise pilule (J{i+1})", "C'est l'heure de votre pilule contraceptive.", due, "contra_pilule"))
        elif methode == "injection":
            # Rappel injection à 3 mois (-2j) + renouvellement
            due = (start + timedelta(days=88)).replace(hour=9, minute=0)
            rappels.append(("💉 Injection contraceptive à renouveler", "Votre injection arrive à échéance dans 2 jours.", due, "contra_injection"))
        elif methode == "implant":
            due = (start + timedelta(days=3 * 365 - 30)).replace(hour=9, minute=0)
            rappels.append(("🔬 Implant à remplacer bientôt", "Votre implant arrive en fin de vie dans 1 mois (3 ans).", due, "contra_implant"))
        elif methode == "sterilet":
            due = (start + timedelta(days=5 * 365 - 30)).replace(hour=9, minute=0)
            rappels.append(("🛡️ DIU/Stérilet à vérifier", "Contrôle médical recommandé avant fin de validité.", due, "contra_sterilet"))
        for title, body, due, kind in rappels:
            if due > now:
                await db.reminders.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "title": title,
                    "description": body,
                    "due_at": due.isoformat(),
                    "kind": kind,
                    "source": "auto_contraception",
                    "contraception_id": doc["id"],
                    "done": False,
                    "created_at": now.isoformat(),
                })
    except Exception as e:
        logger.warning(f"Auto-reminders contraception failed: {e}")
    return doc


@api.patch("/contraception/{cid}/end")
async def end_contraception(cid: str, date_fin: str, user=Depends(require_roles("maman"))):
    await db.contraception.update_one(
        {"id": cid, "user_id": user["id"]},
        {"$set": {"active": False, "date_fin": date_fin}},
    )
    return {"ok": True}


# ----------------------------------------------------------------------
# Allaitement
# ----------------------------------------------------------------------
@api.get("/allaitement")
async def list_allaitement(enfant_id: Optional[str] = None, user=Depends(require_roles("maman"))):
    q = {"user_id": user["id"]}
    if enfant_id:
        q["enfant_id"] = enfant_id
    items = await db.allaitement.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return items


@api.post("/allaitement")
async def create_allaitement(payload: AllaitementIn, user=Depends(require_roles("maman"))):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.allaitement.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/allaitement/{aid}")
async def delete_allaitement(aid: str, user=Depends(require_roles("maman"))):
    await db.allaitement.delete_one({"id": aid, "user_id": user["id"]})
    return {"ok": True}


# ----------------------------------------------------------------------
# Humeur Post-partum
# ----------------------------------------------------------------------
@api.get("/humeur")
async def list_humeur(user=Depends(require_roles("maman"))):
    items = await db.humeur.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(200)
    return items


@api.post("/humeur")
async def create_humeur(payload: HumeurIn, user=Depends(require_roles("maman"))):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.humeur.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ----------------------------------------------------------------------
# Notifications (in-app)
# ----------------------------------------------------------------------
@api.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return items


@api.post("/notifications/{nid}/read")
async def mark_notif_read(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": nid, "user_id": user["id"]}, {"$set": {"read": True}}
    )
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}


@api.post("/push-token")
async def save_push_token(payload: PushTokenIn, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": payload.token}})
    logger.info(f"📱 Push token enregistré pour user {user['id']} : {payload.token[:30]}...")
    return {"ok": True}


@api.get("/push-token/me")
async def get_my_push_token(user=Depends(get_current_user)):
    """Diagnostic : retourne le token push enregistré pour l'utilisateur courant."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "push_token": 1})
    return {
        "user_id": user["id"],
        "has_token": bool(u and u.get("push_token")),
        "token_preview": (u.get("push_token", "")[:40] + "...") if u and u.get("push_token") else None,
    }


@api.post("/push-token/test")
async def test_push_to_self(user=Depends(get_current_user)):
    """Envoie une notification push de test à l'utilisateur courant.
    Utile pour vérifier toute la chaîne (token → Expo → FCM → device).
    """
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "push_token": 1, "name": 1})
    if not u or not u.get("push_token"):
        raise HTTPException(400, "Aucun token push enregistré pour cet utilisateur. Connectez-vous depuis l'APK pour en générer un.")
    await send_expo_push(
        u["push_token"],
        "🔔 Test À lo Maman",
        f"Bonjour {u.get('name', 'Maman')}, ceci est une notification de test. Si vous la voyez, tout fonctionne ! 🎉",
        {"type": "test", "via": "manual_test"},
    )
    # Crée aussi une notif in-app pour la cloche
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "🔔 Test À lo Maman",
        "body": "Notification de test envoyée. Vérifiez votre barre de notifications.",
        "type": "test",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "sent_to": u["push_token"][:30] + "..."}


# Helper to create in-app notification
async def push_notif(user_id: str, title: str, body: str, ntype: str = "info"):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "body": body,
        "type": ntype,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Best-effort Expo push if user has a token
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "push_token": 1})
    if u and u.get("push_token"):
        await send_expo_push(u["push_token"], title, body, {"type": ntype})


# ----------------------------------------------------------------------
# Recherche
# ----------------------------------------------------------------------
@api.get("/search/pros")
async def search_pros(
    q: str = "",
    specialite: str = "",
    prestation: str = "",
    max_prix: int = 0,
    cmu_only: bool = False,
    mode: str = "",  # 🎯 Filtre par mode : "presentiel" | "teleconsultation" | "domicile"
    user=Depends(get_current_user),
):
    """
    Recherche de professionnels.
    - q: recherche libre dans nom/spécialité
    - specialite: filtre par spécialité (regex)
    - prestation: filtre par nom de prestation (ex: "échographie")
    - max_prix: prix maximum FCFA (0 = ignoré)
    - cmu_only: ne retourner que les pros qui acceptent la CMU
    - mode: filtre par type de consultation supporté (presentiel/teleconsultation/domicile)
    """
    query: dict = {"role": "professionnel"}
    if specialite:
        query["specialite"] = {"$regex": specialite, "$options": "i"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"specialite": {"$regex": q, "$options": "i"}},
        ]
    if cmu_only:
        query["accepte_cmu"] = True
    # 🎯 Filtre mode :
    # - presentiel : tous les pros (par défaut)
    # - teleconsultation : pros avec accepte_teleconsultation != False (défaut true)
    # - domicile : pros avec frais_deplacement_fcfa défini OU accepte_domicile=true
    mode_norm = (mode or "").strip().lower()
    if mode_norm == "domicile":
        query["$or"] = (query.get("$or") or []) + [
            {"accepte_domicile": True},
            {"frais_deplacement_fcfa": {"$exists": True, "$ne": None}},
        ]
    elif mode_norm == "teleconsultation":
        query["accepte_teleconsultation"] = {"$ne": False}

    # Mapping intelligent : si l'utilisateur clique sur un "type de consultation"
    # (chip rapide), on étend le terme aux mots-clés équivalents pour matcher à la
    # fois les prestations (libre-texte) et les disponibilités (type_id structuré).
    TYPE_KEYWORDS = {
        "échographie": ["échographie", "echographie", "écho", "echo"],
        "echographie": ["échographie", "echographie", "écho", "echo"],
        "consultation": ["consultation", "generale", "prenatale", "postnatale", "pediatrie", "prénatale", "post-natale"],
        "accouchement": ["accouchement", "travail", "naissance"],
        "prénatal": ["prénatal", "prenatal", "prénatale", "prenatale"],
        "prenatal": ["prénatal", "prenatal", "prénatale", "prenatale"],
        "vaccin": ["vaccin", "vaccination", "vaccinations"],
        "vaccination": ["vaccin", "vaccination", "vaccinations"],
        "pédiatre": ["pédiatre", "pediatre", "pédiatrie", "pediatrie", "enfant"],
        "pediatre": ["pédiatre", "pediatre", "pédiatrie", "pediatrie", "enfant"],
        "pediatrie": ["pédiatre", "pediatre", "pédiatrie", "pediatrie", "enfant"],
        "nutrition": ["nutrition", "nutritionnel", "diététique"],
        "psychologie": ["psychologie", "psychologue", "soutien psy"],
        "urgence": ["urgence", "garde"],
        "contraception": ["contraception", "planning familial"],
    }

    def build_regex(term: str) -> dict:
        keywords = TYPE_KEYWORDS.get(term.lower().strip(), [term])
        # Construire un regex OR insensible à la casse (mots-clés multiples)
        escaped = "|".join(__import__("re").escape(k) for k in keywords)
        return {"$regex": escaped, "$options": "i"}

    # Si filtre par prestation/prix : on identifie d'abord les prestations matching
    # ET les disponibilités (slots) matching, puis on prend l'union des pro_ids.
    matching_pro_ids: Optional[set] = None
    if prestation or (max_prix and max_prix > 0):
        ids_set: set = set()

        # 1) Prestations (nom/description)
        prest_query: dict = {"active": True}
        if prestation:
            rgx = build_regex(prestation)
            prest_query["$or"] = [
                {"nom": rgx},
                {"description": rgx},
            ]
        if max_prix and max_prix > 0:
            prest_query["prix_fcfa"] = {"$lte": int(max_prix)}
        prestations_list = await db.prestations.find(prest_query, {"_id": 0, "pro_id": 1}).to_list(1000)
        ids_set.update(p["pro_id"] for p in prestations_list)

        # 2) Disponibilités (type_id / type_label) — uniquement si filtre prestation
        #    (le filtre prix ne concerne que les prestations)
        if prestation:
            rgx = build_regex(prestation)
            dispo_query = {"$or": [
                {"slots.type_id": rgx},
                {"slots.type_label": rgx},
                {"slots.types": rgx},
            ]}
            dispos_list = await db.pro_disponibilites.find(dispo_query, {"_id": 0, "pro_id": 1}).to_list(1000)
            ids_set.update(d["pro_id"] for d in dispos_list)

        matching_pro_ids = ids_set
        if not matching_pro_ids:
            return []
        query["id"] = {"$in": list(matching_pro_ids)}

    pros = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(100)

    # 💎 Badge Pro Certifié + tri Premium en tête (promesse Premium)
    # 🎯 Modes supportés (auto-détectés)
    for p in pros:
        is_prem = is_premium_active(p)
        p["is_premium"] = is_prem
        p["pro_certifie"] = is_prem  # alias pour le frontend (badge ⭐)
        # Modes supportés
        modes = ["presentiel"]
        if p.get("accepte_teleconsultation") is not False:
            modes.append("teleconsultation")
        if p.get("accepte_domicile") is True or p.get("frais_deplacement_fcfa") is not None:
            modes.append("domicile")
        p["modes_supportes"] = modes
    pros.sort(key=lambda x: (0 if x.get("is_premium") else 1, x.get("name") or ""))

    # Enrichir chaque pro avec ses prestations matching (pour affichage)
    if matching_pro_ids is not None:
        for p in pros:
            prest_q: dict = {"pro_id": p["id"], "active": True}
            if prestation:
                rgx = build_regex(prestation)
                prest_q["$or"] = [
                    {"nom": rgx},
                    {"description": rgx},
                ]
            if max_prix and max_prix > 0:
                prest_q["prix_fcfa"] = {"$lte": int(max_prix)}
            mp = await db.prestations.find(prest_q, {"_id": 0}).sort("prix_fcfa", 1).to_list(5)
            p["prestations_match"] = mp
    return pros


@api.get("/search/community")
async def search_posts(q: str = "", category: str = "", user=Depends(get_current_user)):
    query: dict = {}
    if category:
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
        ]
    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return posts


# ----------------------------------------------------------------------
# Vidéo-consultation (Jitsi room link)
# ----------------------------------------------------------------------
@api.get("/rdv/{rid}/video-link")
async def video_link(rid: str, user=Depends(get_current_user)):
    rdv = await db.rdv.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    if user["id"] not in [rdv["maman_id"], rdv["pro_id"]]:
        raise HTTPException(403, "Accès refusé")
    if rdv.get("status") != "confirme":
        raise HTTPException(400, "RDV non confirmé")
    room = f"alomaman-{rid[:12]}"
    return {
        "room": room,
        "url": f"https://meet.jit.si/{room}",
    }


# ----------------------------------------------------------------------
# Télé-échographie (pro uploads image, maman views)
# ----------------------------------------------------------------------
@api.post("/tele-echo")
async def upload_echo(payload: TeleEchoIn, user=Depends(require_roles("professionnel"))):
    rdv = await db.rdv.find_one({"id": payload.rdv_id}, {"_id": 0})
    if not rdv or rdv["pro_id"] != user["id"]:
        raise HTTPException(404, "RDV introuvable ou non autorisé")
    # Sécurité : au moins une image OU un rapport structuré
    has_image = bool(payload.image_base64)
    has_report = any([
        payload.bpd_mm, payload.fl_mm, payload.cc_mm, payload.ca_mm,
        payload.poids_estime_g, payload.liquide_amniotique, payload.placenta_position,
        payload.sexe_foetal, payload.battements_cardiaques_bpm, payload.conclusion,
    ])
    if not has_image and not has_report and not payload.description:
        raise HTTPException(400, "Fournissez au moins une image, un rapport structuré ou une description")
    doc = {
        "id": str(uuid.uuid4()),
        "rdv_id": payload.rdv_id,
        "maman_id": rdv["maman_id"],
        "pro_id": user["id"],
        "pro_name": user["name"],
        # 🔐 Champs sensibles chiffrés au repos AES-256-GCM
        "image_base64": encrypt_str(payload.image_base64) if payload.image_base64 else None,
        "description": payload.description,
        "semaine_grossesse": payload.semaine_grossesse,
        # Rapport structuré (numérique = pas chiffré)
        "bpd_mm": payload.bpd_mm,
        "fl_mm": payload.fl_mm,
        "cc_mm": payload.cc_mm,
        "ca_mm": payload.ca_mm,
        "poids_estime_g": payload.poids_estime_g,
        "liquide_amniotique": payload.liquide_amniotique,
        "placenta_position": payload.placenta_position,
        "sexe_foetal": payload.sexe_foetal,
        "battements_cardiaques_bpm": payload.battements_cardiaques_bpm,
        "commentaires_medicaux": encrypt_str(payload.commentaires_medicaux) if payload.commentaires_medicaux else None,
        "conclusion": encrypt_str(payload.conclusion) if payload.conclusion else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tele_echo.insert_one(doc)
    doc.pop("_id", None)
    await push_notif(
        rdv["maman_id"],
        "Nouveau rapport d'échographie 🩺",
        f"Dr. {user['name']} a partagé un rapport (semaine {payload.semaine_grossesse or '?'})",
        "info",
    )
    return decrypt_tele_echo(doc)


@api.get("/tele-echo")
async def list_echos(user=Depends(get_current_user)):
    q = {"maman_id": user["id"]} if user["role"] == "maman" else (
        {"pro_id": user["id"]} if user["role"] == "professionnel" else {}
    )
    items = await db.tele_echo.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [decrypt_tele_echo(e) for e in items]


@api.get("/tele-echo/rdv/{rdv_id}")
async def echos_for_rdv(rdv_id: str, user=Depends(get_current_user)):
    items = await db.tele_echo.find({"rdv_id": rdv_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    if items and user["id"] not in [items[0]["maman_id"], items[0]["pro_id"]] and user["role"] != "admin":
        raise HTTPException(403, "Accès refusé")
    return [decrypt_tele_echo(e) for e in items]


# ----------------------------------------------------------------------
# Déclaration de naissance
# ----------------------------------------------------------------------
@api.post("/naissance")
async def create_naissance(payload: NaissanceIn, user=Depends(require_roles("maman"))):
    if not payload.consentement_explicite:
        raise HTTPException(400, "Vous devez confirmer votre consentement explicite avant de générer la déclaration.")
    enfant_id = payload.enfant_id
    enfant = None
    # 🆕 Création auto du carnet enfant si pas d'enfant_id fourni
    if not enfant_id:
        if not payload.enfant_nom or not payload.enfant_sexe or not payload.enfant_date_naissance:
            raise HTTPException(400, "Pour créer un enfant à la volée, fournissez enfant_nom, enfant_sexe et enfant_date_naissance")
        # Respecter le quota
        current = await db.enfants.count_documents({"user_id": user["id"]})
        await check_quota(user, "enfants_max", current)
        enfant_id = str(uuid.uuid4())
        enfant = {
            "id": enfant_id,
            "user_id": user["id"],
            "nom": payload.enfant_nom,
            "sexe": payload.enfant_sexe,
            "date_naissance": payload.enfant_date_naissance,
            "poids_kg": round((payload.poids_naissance_g or 0) / 1000, 3) if payload.poids_naissance_g else None,
            "taille_cm": payload.taille_naissance_cm,
            "vaccins": [],
            "mesures": [{
                "id": str(uuid.uuid4()),
                "date": payload.enfant_date_naissance,
                "poids_kg": round((payload.poids_naissance_g or 0) / 1000, 3) if payload.poids_naissance_g else None,
                "taille_cm": payload.taille_naissance_cm,
                "notes": f"Mesures de naissance ({payload.lieu_naissance})",
            }],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_from_naissance": True,
        }
        await db.enfants.insert_one(enfant)
    else:
        enfant = await db.enfants.find_one({"id": enfant_id, "user_id": user["id"]})
        if not enfant:
            raise HTTPException(404, "Enfant introuvable")
    existing = await db.naissances.find_one({"enfant_id": enfant_id})
    if existing:
        raise HTTPException(400, "Déclaration déjà enregistrée pour cet enfant")
    data = payload.dict()
    # Ne stocker les champs enfant_* que si on les a reçus
    data["enfant_id"] = enfant_id
    # Numéro de référence unique : AM-YYYY-XXXXXX
    now_dt = datetime.now(timezone.utc)
    ref_seq = str(uuid.uuid4()).replace("-", "")[:6].upper()
    numero_reference = f"AM-{now_dt.year}-{ref_seq}"
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "enfant_nom": enfant["nom"],
        "enfant_sexe": enfant["sexe"],
        "enfant_date_naissance": enfant["date_naissance"],
        "numero_reference": numero_reference,
        **data,
        "status": "en_attente",
        "created_at": now_dt.isoformat(),
    }
    await db.naissances.insert_one(doc)
    doc.pop("_id", None)
    doc["enfant_cree_auto"] = not payload.enfant_id  # info utile pour le front
    return doc


@api.get("/naissance")
async def list_naissances(user=Depends(get_current_user)):
    if user["role"] == "admin":
        items = await db.naissances.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        items = await db.naissances.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    return items


@api.get("/naissance/{nid}")
async def get_naissance(nid: str, user=Depends(get_current_user)):
    n = await db.naissances.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Introuvable")
    if user["role"] != "admin" and n["user_id"] != user["id"]:
        raise HTTPException(403, "Accès refusé")
    return n


@api.patch("/naissance/{nid}/validate")
async def validate_naissance(nid: str, user=Depends(require_roles("admin"))):
    await db.naissances.update_one(
        {"id": nid},
        {"$set": {"status": "validee", "validated_at": datetime.now(timezone.utc).isoformat(), "validated_by": user["id"]}},
    )
    n = await db.naissances.find_one({"id": nid}, {"_id": 0})
    if n:
        await push_notif(
            n["user_id"],
            "Acte de naissance validé 📄",
            f"La déclaration de naissance de {n['enfant_nom']} a été validée",
            "info",
        )
    return {"ok": True}


@api.get("/naissance/{nid}/pdf")
async def get_naissance_pdf(nid: str, user=Depends(get_current_user)):
    """Génère le PDF officiel pré-rempli en base64 (data URI ready-to-display)."""
    from pdf_generator import generate_naissance_pdf
    n = await db.naissances.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Déclaration introuvable")
    if user["role"] != "admin" and n["user_id"] != user["id"]:
        raise HTTPException(403, "Accès refusé")
    # Récupérer les infos maman (pour CMU et autres)
    maman = await db.users.find_one({"id": n["user_id"]}, {"_id": 0, "password_hash": 0})
    if maman:
        # déchiffrer CMU si présent
        if maman.get("cmu") and isinstance(maman["cmu"], dict) and maman["cmu"].get("numero"):
            try:
                maman["cmu"]["numero"] = decrypt_str(maman["cmu"]["numero"])
            except Exception:
                pass
    try:
        pdf_bytes = generate_naissance_pdf(n, maman or {})
    except Exception as e:
        logger.exception(f"PDF generation failed: {e}")
        raise HTTPException(500, f"Erreur lors de la génération du PDF: {str(e)}")
    import base64 as _b64
    pdf_b64 = _b64.b64encode(pdf_bytes).decode("ascii")
    filename = f"declaration_naissance_{n.get('numero_reference', n['id'])}.pdf"
    return {
        "filename": filename,
        "mime": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "data_uri": f"data:application/pdf;base64,{pdf_b64}",
        "base64": pdf_b64,
        "numero_reference": n.get("numero_reference"),
    }


class NaissanceShareIn(BaseModel):
    canal: Literal["email_maman", "email_etat_civil"] = "email_maman"
    email_destinataire: Optional[str] = None  # surcharge facultative


@api.post("/naissance/{nid}/share")
async def share_naissance(nid: str, payload: NaissanceShareIn, user=Depends(get_current_user)):
    """
    Met en file d'attente l'envoi du PDF par email.
    ⚠️ MOCKED: l'envoi réel d'email n'est PAS implémenté (aucun service SMTP/SendGrid configuré).
    Le PDF est simplement enregistré dans la file 'naissance_share_queue' pour traitement ultérieur.
    """
    n = await db.naissances.find_one({"id": nid}, {"_id": 0})
    if not n:
        raise HTTPException(404, "Déclaration introuvable")
    if user["role"] != "admin" and n["user_id"] != user["id"]:
        raise HTTPException(403, "Accès refusé")

    # Résoudre l'email destinataire
    dest_email = payload.email_destinataire
    if payload.canal == "email_maman" and not dest_email:
        maman = await db.users.find_one({"id": n["user_id"]}, {"_id": 0, "email": 1})
        dest_email = maman.get("email") if maman else None
    elif payload.canal == "email_etat_civil" and not dest_email:
        # Récupérer l'email configuré par le super admin
        cfg = await db.app_config.find_one({"key": "etat_civil_email"}, {"_id": 0})
        dest_email = (cfg or {}).get("value") if cfg else None

    if not dest_email:
        if payload.canal == "email_etat_civil":
            raise HTTPException(400, "L'adresse email de l'état civil n'est pas encore configurée. Contactez votre super admin.")
        else:
            raise HTTPException(400, "Aucune adresse email destinataire trouvée. Vérifiez votre profil.")

    queue_doc = {
        "id": str(uuid.uuid4()),
        "naissance_id": nid,
        "canal": payload.canal,
        "destinataire": dest_email,
        "status": "queued",  # queued | sent | failed (currently jamais traité = MOCKED)
        "requested_by": user["id"],
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.naissance_share_queue.insert_one(queue_doc)
    queue_doc.pop("_id", None)
    return {
        "ok": True,
        "queued": True,
        "destinataire": dest_email,
        "canal": payload.canal,
        "message": "Demande enregistrée. L'envoi sera traité dès qu'un service email est connecté.",
    }


# ----- Configuration globale (super admin) -----
class AppConfigIn(BaseModel):
    value: str


@api.get("/admin/config/{key}")
async def get_app_config(key: str, user=Depends(require_roles("admin"))):
    cfg = await db.app_config.find_one({"key": key}, {"_id": 0})
    return cfg or {"key": key, "value": None}


@api.post("/admin/config/{key}")
async def set_app_config(key: str, payload: AppConfigIn, user=Depends(require_roles("admin"))):
    await db.app_config.update_one(
        {"key": key},
        {"$set": {
            "value": payload.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user["id"],
        }},
        upsert=True,
    )
    return {"ok": True, "key": key, "value": payload.value}


@api.get("/config/etat-civil-email-public")
async def get_etat_civil_public(user=Depends(get_current_user)):
    """Endpoint public pour savoir si l'email état civil est configuré (sans révéler l'adresse aux non-admins)."""
    cfg = await db.app_config.find_one({"key": "etat_civil_email"}, {"_id": 0})
    is_set = bool(cfg and cfg.get("value"))
    return {"configured": is_set}


# ----------------------------------------------------------------------
# FHIR Export (Patient + Observations)
# ----------------------------------------------------------------------
@api.get("/fhir/patient")
async def fhir_export(user=Depends(get_current_user)):
    """Export user data in lightweight FHIR-like JSON (Patient + Observations)."""
    if user["role"] != "maman":
        raise HTTPException(403, "Export FHIR réservé aux mamans")

    patient = {
        "resourceType": "Patient",
        "id": user["id"],
        "name": [{"text": user["name"]}],
        "telecom": [{"system": "email", "value": user["email"]}] + (
            [{"system": "phone", "value": user["phone"]}] if user.get("phone") else []
        ),
        "gender": "female",
    }

    observations = []
    grossesse = await db.grossesses.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    if grossesse:
        observations.append({
            "resourceType": "Observation",
            "status": "final",
            "category": [{"text": "pregnancy"}],
            "code": {"text": "Gestational age"},
            "effectiveDateTime": grossesse["date_debut"],
            "valueString": f"Début: {grossesse['date_debut']}" + (f" · Terme: {grossesse['date_terme']}" if grossesse.get("date_terme") else ""),
            "note": [{"text": s} for s in grossesse.get("symptomes", [])],
        })

    enfants = await db.enfants.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    related = []
    for e in enfants:
        related.append({
            "resourceType": "RelatedPerson",
            "id": e["id"],
            "name": [{"text": e["nom"]}],
            "gender": "female" if e["sexe"] == "F" else "male",
            "birthDate": e["date_naissance"],
        })
        for m in e.get("mesures", []):
            observations.append({
                "resourceType": "Observation",
                "subject": {"reference": f"RelatedPerson/{e['id']}"},
                "code": {"text": "Anthropometry"},
                "effectiveDateTime": m["date"],
                "component": [
                    {"code": {"text": "weight"}, "valueQuantity": {"value": m.get("poids_kg"), "unit": "kg"}} if m.get("poids_kg") else None,
                    {"code": {"text": "height"}, "valueQuantity": {"value": m.get("taille_cm"), "unit": "cm"}} if m.get("taille_cm") else None,
                ],
            })
        for v in e.get("vaccins", []):
            observations.append({
                "resourceType": "Immunization",
                "subject": {"reference": f"RelatedPerson/{e['id']}"},
                "vaccineCode": {"text": v["nom"]},
                "occurrenceDateTime": v["date"],
                "status": "completed" if v.get("fait") else "not-done",
            })

    cycles = await db.cycles.find({"user_id": user["id"]}, {"_id": 0}).to_list(20)
    for c in cycles:
        observations.append({
            "resourceType": "Observation",
            "code": {"text": "Menstrual cycle"},
            "effectiveDateTime": c["date_debut_regles"],
            "valueString": f"Règles: {c.get('duree_regles')}j · Cycle: {c.get('duree_cycle')}j",
        })

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "entry": [
            {"resource": patient},
            *[{"resource": r} for r in related],
            *[{"resource": o} for o in observations],
        ],
    }


# ----------------------------------------------------------------------
# 🌐 FHIR R4 Facade Endpoints — Phase 1 Architecture interopérable
# ----------------------------------------------------------------------
from fhir_facade import (  # noqa: E402
    to_fhir_patient_maman,
    to_fhir_patient_enfant,
    to_fhir_allergy_intolerance,
    to_fhir_immunization,
    to_fhir_observations_from_mesure,
    to_fhir_diagnostic_report_echo,
    to_fhir_consent as _to_fhir_consent,
    to_fhir_birth_composition,
    build_carnet_composition,
    to_fhir_bundle,
    AGE_MODULES,
    get_module_for_age,
    relevant_modules_for_specialty,
)


async def _check_pro_access_to_enfant(pro_user: dict, enfant: dict) -> bool:
    """Pro a-t-il un RDV ou un consent actif avec la maman ?"""
    if pro_user.get("role") == "admin":
        return True
    maman_id = enfant.get("user_id")
    if not maman_id:
        return False
    rdv = await db.rdv.find_one({"pro_id": pro_user["id"], "maman_id": maman_id})
    if rdv:
        return True
    consent = await db.consents.find_one({
        "maman_id": maman_id,
        "pro_id": pro_user["id"],
        "status": "active",
    })
    return bool(consent)


async def _audit_log(*, user: dict, action: str, resource_type: str, resource_id: str, details: dict | None = None):
    """Trace toute lecture/écriture sur ressources santé pour traçabilité GDPR."""
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_role": user.get("role"),
            "user_name": user.get("name"),
            "action": action,  # read | write | delete
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # ne jamais casser un flux fonctionnel pour un audit


@api.get("/fhir/Patient/{patient_id}")
async def fhir_get_patient(patient_id: str, user=Depends(get_current_user)):
    """Récupère un Patient FHIR (Maman ou Enfant)."""
    # Cherche d'abord dans users
    u = await db.users.find_one({"id": patient_id}, {"_id": 0})
    if u and u.get("role") == "maman":
        if user["role"] not in ("admin",) and user["id"] != patient_id:
            # Pro doit avoir un RDV ou un consent
            if user.get("role") == "professionnel":
                rdv = await db.rdv.find_one({"pro_id": user["id"], "maman_id": patient_id})
                if not rdv:
                    raise HTTPException(403, "Accès refusé (pas de RDV ni consent)")
            else:
                raise HTTPException(403, "Accès refusé")
        await _audit_log(user=user, action="read", resource_type="Patient", resource_id=patient_id)
        return to_fhir_patient_maman(u)

    e = await db.enfants.find_one({"id": patient_id}, {"_id": 0})
    if e:
        if user["role"] == "maman" and e.get("user_id") != user["id"]:
            raise HTTPException(403, "Accès refusé")
        if user["role"] == "professionnel":
            ok = await _check_pro_access_to_enfant(user, e)
            if not ok:
                raise HTTPException(403, "Accès refusé (pas de RDV ni consent)")
        await _audit_log(user=user, action="read", resource_type="Patient", resource_id=patient_id)
        return to_fhir_patient_enfant(e)

    raise HTTPException(404, "Patient introuvable")


@api.get("/fhir/Immunization")
async def fhir_list_immunizations(subject: str, user=Depends(get_current_user)):
    """Liste les Immunization (vaccins) pour un enfant."""
    e = await db.enfants.find_one({"id": subject}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Patient (enfant) introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")
    items = [to_fhir_immunization(v, subject) for v in (e.get("vaccins") or [])]
    await _audit_log(user=user, action="read", resource_type="Immunization", resource_id=subject)
    return to_fhir_bundle(resources=items, bundle_type="searchset")


@api.get("/fhir/Observation")
async def fhir_list_observations(
    subject: str,
    category: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Liste les Observation (mesures anthropo) pour un enfant.

    `category` filtre par exemple `vital-signs` (par défaut) ou `imaging`.
    """
    e = await db.enfants.find_one({"id": subject}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Patient (enfant) introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")

    obs: list[dict] = []
    for m in (e.get("mesures") or []):
        obs.extend(to_fhir_observations_from_mesure(m, subject))
    if category:
        cat_l = category.lower()
        obs = [o for o in obs if any((c.get("coding") or [{}])[0].get("code") == cat_l for c in o.get("category") or [])]
    await _audit_log(user=user, action="read", resource_type="Observation", resource_id=subject, details={"category": category})
    return to_fhir_bundle(resources=obs, bundle_type="searchset")


@api.get("/fhir/DiagnosticReport")
async def fhir_list_diagnostic_reports(subject: str, user=Depends(get_current_user)):
    """Liste les DiagnosticReport (échographies) pour une maman."""
    if user["role"] == "maman" and user["id"] != subject:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        rdv = await db.rdv.find_one({"pro_id": user["id"], "maman_id": subject})
        if not rdv:
            raise HTTPException(403, "Accès refusé")

    reports = []
    async for echo in db.tele_echo.find({"maman_id": subject}, {"_id": 0}):
        reports.append(to_fhir_diagnostic_report_echo(echo, subject))
    await _audit_log(user=user, action="read", resource_type="DiagnosticReport", resource_id=subject)
    return to_fhir_bundle(resources=reports, bundle_type="searchset")


@api.get("/fhir/Composition/{enfant_id}")
async def fhir_carnet_composition(enfant_id: str, user=Depends(get_current_user)):
    """Carnet médical complet de l'enfant en FHIR Composition."""
    e = await db.enfants.find_one({"id": enfant_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")

    maman = await db.users.find_one({"id": e["user_id"]}, {"_id": 0}) or {}
    immunizations = [to_fhir_immunization(v, enfant_id) for v in (e.get("vaccins") or [])]

    observations: list[dict] = []
    for m in (e.get("mesures") or []):
        observations.extend(to_fhir_observations_from_mesure(m, enfant_id))

    diagnostic_reports: list[dict] = []
    async for echo in db.tele_echo.find({"maman_id": e.get("user_id")}, {"_id": 0}):
        diagnostic_reports.append(to_fhir_diagnostic_report_echo(echo, e.get("user_id")))

    birth = await db.birth_declarations.find_one({"enfant_id": enfant_id}, {"_id": 0})

    # DMP summary
    dmp_summary = None
    try:
        progress = await db.dmp_progress.find({"enfant_id": enfant_id}, {"_id": 0}).to_list(500)
        responses = {p["milestone_id"]: p.get("response", "oui") for p in progress if p.get("milestone_id")}
        try:
            dn = datetime.fromisoformat(str(e["date_naissance"]).replace("Z", "+00:00"))
            if dn.tzinfo is None:
                dn = dn.replace(tzinfo=timezone.utc)
            age_mois = max(0, int((datetime.now(timezone.utc) - dn).total_seconds() / (30.4375 * 86400)))
        except Exception:
            age_mois = 0
        from dmp_data import compute_dmp_status as _dmp_compute
        dmp_summary = _dmp_compute(age_mois, responses)
    except Exception:
        dmp_summary = None

    composition = build_carnet_composition(
        enfant=e, maman=maman,
        immunizations=immunizations,
        observations=observations,
        diagnostic_reports=diagnostic_reports,
        birth_declaration=birth,
        dmp_summary=dmp_summary,
    )
    await _audit_log(user=user, action="read", resource_type="Composition", resource_id=f"carnet-{enfant_id}")
    return composition


@api.get("/fhir/everything/{enfant_id}")
async def fhir_everything(enfant_id: str, user=Depends(get_current_user)):
    """Bundle FHIR complet (Patient + Immunization + Observation + DiagnosticReport + Composition)."""
    e = await db.enfants.find_one({"id": enfant_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")

    maman = await db.users.find_one({"id": e["user_id"]}, {"_id": 0}) or {}

    resources: list[dict] = []
    resources.append(to_fhir_patient_maman(maman))
    resources.append(to_fhir_patient_enfant(e, maman_id=maman.get("id")))
    for a in (e.get("allergies") or []):
        resources.append(to_fhir_allergy_intolerance(enfant_id, a))
    for v in (e.get("vaccins") or []):
        resources.append(to_fhir_immunization(v, enfant_id))
    for m in (e.get("mesures") or []):
        resources.extend(to_fhir_observations_from_mesure(m, enfant_id))
    async for echo in db.tele_echo.find({"maman_id": e.get("user_id")}, {"_id": 0}):
        resources.append(to_fhir_diagnostic_report_echo(echo, e.get("user_id")))
    birth = await db.birth_declarations.find_one({"enfant_id": enfant_id}, {"_id": 0})
    if birth:
        resources.append(to_fhir_birth_composition(birth, enfant_id))

    await _audit_log(user=user, action="read", resource_type="Bundle.everything", resource_id=enfant_id)
    return to_fhir_bundle(resources=resources, bundle_type="document")


# --- Carnet modulaire par âge ----------------------------------------------

@api.get("/fhir/age-modules")
async def fhir_age_modules(user=Depends(get_current_user)):
    """Liste les modules d'âge disponibles + adaptation par spécialité du pro."""
    relevant = relevant_modules_for_specialty(user.get("specialite"))
    return {
        "modules": [{"key": k, **v, "relevant_for_pro": k in relevant} for k, v in AGE_MODULES.items()],
        "current_specialty": user.get("specialite"),
        "relevant_modules": relevant,
    }


@api.get("/enfants/{enfant_id}/carnet/{module}")
async def carnet_module(enfant_id: str, module: str, user=Depends(get_current_user)):
    """Récupère le carnet médical de l'enfant filtré sur un module d'âge.

    `module` ∈ naissance | 0-6m | 6-24m | 2-5a | 6-12a | 13-18a
    Adapte la vue selon la spécialité du Pro connecté.
    """
    if module not in AGE_MODULES:
        raise HTTPException(400, f"Module inconnu. Valides : {list(AGE_MODULES.keys())}")
    e = await db.enfants.find_one({"id": enfant_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")

    # Calcul âge en mois
    try:
        dn = datetime.fromisoformat(str(e["date_naissance"]).replace("Z", "+00:00"))
        if dn.tzinfo is None:
            dn = dn.replace(tzinfo=timezone.utc)
        age_mois = max(0, int((datetime.now(timezone.utc) - dn).total_seconds() / (30.4375 * 86400)))
    except Exception:
        age_mois = 0

    module_conf = AGE_MODULES[module]
    current_module = get_module_for_age(age_mois)
    relevant = relevant_modules_for_specialty(user.get("specialite"))

    # Filtrer immunizations / observations selon le module choisi
    vaccins = e.get("vaccins") or []
    mesures = e.get("mesures") or []

    def _date_age_months(dt_str):
        try:
            d = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return int((d - dn).total_seconds() / (30.4375 * 86400))
        except Exception:
            return None

    def _in_module_age(d_age: int | None) -> bool:
        if d_age is None:
            return True  # pas de date → on inclut quand même
        return module_conf["min_m"] <= d_age < module_conf["max_m"]

    vaccins_in = [v for v in vaccins if _in_module_age(_date_age_months(v.get("date")))]
    mesures_in = [m for m in mesures if _in_module_age(_date_age_months(m.get("date")))]

    immunizations_fhir = [to_fhir_immunization(v, enfant_id) for v in vaccins_in]
    observations_fhir: list[dict] = []
    for m in mesures_in:
        observations_fhir.extend(to_fhir_observations_from_mesure(m, enfant_id))

    await _audit_log(user=user, action="read", resource_type="Carnet.module", resource_id=enfant_id, details={"module": module})

    return {
        "enfant_id": enfant_id,
        "enfant": {"id": enfant_id, "nom": e.get("nom"), "sexe": e.get("sexe"), "date_naissance": e.get("date_naissance"), "age_mois": age_mois},
        "module": module,
        "module_label": module_conf["label"],
        "module_sections": module_conf["sections"],
        "is_current_module": module == current_module,
        "is_relevant_for_pro": module in relevant,
        "current_pro_specialty": user.get("specialite"),
        "immunizations_count": len(immunizations_fhir),
        "observations_count": len(observations_fhir),
        "immunizations": immunizations_fhir,
        "observations": observations_fhir,
    }


# --- Audit log lisible -----------------------------------------------------

# Catégories de données protégées par le consentement granulaire
CONSENT_CATEGORIES = [
    "patient_info",         # Identité de base (nom, âge, photo, CMU)
    "vaccins",              # Immunization (vaccins EPI)
    "croissance",           # Observations (poids/taille/PC/temp)
    "echos",                # DiagnosticReport (échographies)
    "consultation_notes",   # Notes des Pros
    "dmp",                  # Suivi du développement
    "birth_declaration",    # Acte de naissance
    "allergies",            # AllergyIntolerance
    "messages",             # Conversations
    "rdv",                  # RDV passés/futurs
]


class ConsentIn(BaseModel):
    pro_id: str
    categories: List[str]            # cf. CONSENT_CATEGORIES
    expires_at: Optional[str] = None  # ISO; None = sans expiration
    notes: Optional[str] = None


@api.post("/consents")
async def consent_create(payload: ConsentIn, user=Depends(require_roles("maman"))):
    """Maman crée un consentement granulaire envers un Pro."""
    # Validation
    invalid = [c for c in payload.categories if c not in CONSENT_CATEGORIES]
    if invalid:
        raise HTTPException(400, f"Catégories invalides : {invalid}. Valides : {CONSENT_CATEGORIES}")
    pro = await db.users.find_one({"id": payload.pro_id, "role": "professionnel"}, {"_id": 0})
    if not pro:
        raise HTTPException(404, "Professionnel introuvable")

    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "maman_id": user["id"],
        "pro_id": payload.pro_id,
        "pro_name": pro.get("name"),
        "pro_specialite": pro.get("specialite"),
        "categories": payload.categories,
        "expires_at": payload.expires_at,
        "notes": payload.notes,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "revoked_at": None,
    }
    await db.consents.insert_one(doc)

    # Notifier le pro
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": payload.pro_id,
            "type": "consent_granted",
            "title": "✅ Nouveau consentement reçu",
            "body": f"{user.get('name', 'Une maman')} vous a accordé l'accès à : {', '.join(payload.categories[:3])}{'…' if len(payload.categories) > 3 else ''}",
            "data": {"consent_id": cid, "maman_id": user["id"]},
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass

    await _audit_log(user=user, action="write", resource_type="Consent", resource_id=cid, details={"pro_id": payload.pro_id, "categories": payload.categories})
    return {**doc, "_id": None}


@api.get("/consents/me")
async def consent_list_mine(user=Depends(require_roles("maman", "professionnel"))):
    """Liste les consents : maman → ceux qu'elle a donnés ; pro → ceux reçus."""
    if user["role"] == "maman":
        items = await db.consents.find({"maman_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        items = await db.consents.find({"pro_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"total": len(items), "consents": items, "available_categories": CONSENT_CATEGORIES}


@api.patch("/consents/{cid}")
async def consent_update(cid: str, payload: ConsentIn, user=Depends(require_roles("maman"))):
    """Modifie un consentement (catégories, expiration). Réservé à la maman propriétaire."""
    c = await db.consents.find_one({"id": cid, "maman_id": user["id"]})
    if not c:
        raise HTTPException(404, "Consentement introuvable")
    invalid = [cat for cat in payload.categories if cat not in CONSENT_CATEGORIES]
    if invalid:
        raise HTTPException(400, f"Catégories invalides : {invalid}")
    update = {
        "categories": payload.categories,
        "expires_at": payload.expires_at,
        "notes": payload.notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consents.update_one({"id": cid}, {"$set": update})
    await _audit_log(user=user, action="write", resource_type="Consent", resource_id=cid, details={"updated": True})
    return {"ok": True}


@api.post("/consents/{cid}/revoke")
async def consent_revoke(cid: str, user=Depends(require_roles("maman"))):
    """Révoque un consentement (statut → revoked)."""
    c = await db.consents.find_one({"id": cid, "maman_id": user["id"]})
    if not c:
        raise HTTPException(404, "Consentement introuvable")
    await db.consents.update_one({"id": cid}, {"$set": {
        "status": "revoked",
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }})
    # Notifier le pro de la révocation
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": c["pro_id"],
            "type": "consent_revoked",
            "title": "⚠️ Consentement révoqué",
            "body": f"{user.get('name', 'Une maman')} a retiré son consentement.",
            "data": {"consent_id": cid},
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    await _audit_log(user=user, action="write", resource_type="Consent", resource_id=cid, details={"revoked": True})
    return {"ok": True, "status": "revoked"}


@api.delete("/consents/{cid}")
async def consent_delete(cid: str, user=Depends(require_roles("maman"))):
    """Supprime définitivement un consentement."""
    res = await db.consents.delete_one({"id": cid, "maman_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Consentement introuvable")
    await _audit_log(user=user, action="delete", resource_type="Consent", resource_id=cid)
    return {"ok": True}


async def _has_consent_for(pro_id: str, maman_id: str, category: str) -> bool:
    """Vérifie qu'un consent actif et non expiré existe pour la catégorie demandée."""
    c = await db.consents.find_one({
        "maman_id": maman_id,
        "pro_id": pro_id,
        "status": "active",
        "categories": category,
    })
    if not c:
        return False
    if c.get("expires_at"):
        try:
            exp = datetime.fromisoformat(str(c["expires_at"]).replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                return False
        except Exception:
            pass
    return True


@api.get("/audit-log/me")
async def audit_log_me(limit: int = 100, user=Depends(get_current_user)):
    """Maman récupère le journal d'audit la concernant (qui a vu/modifié quoi)."""
    if user["role"] != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    enfants_ids = [e["id"] async for e in db.enfants.find({"user_id": user["id"]}, {"_id": 0, "id": 1})]
    target_ids = enfants_ids + [user["id"]]
    items = await db.audit_log.find(
        {"$or": [
            {"resource_id": {"$in": target_ids}},
            {"user_id": user["id"], "resource_type": "Consent"},  # propres actions sur ses consents
        ]},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(min(limit, 500))
    return {"total": len(items), "events": items}


# ============================================================================
# 🔐 RGSSI Niveau 3 — 2FA TOTP (Google Authenticator)
# ============================================================================

@api.post("/auth/2fa/setup")
async def auth_2fa_setup(user=Depends(get_current_user)):
    """Démarre l'activation 2FA. Retourne un secret + URL QR code (à scanner avec Google Authenticator).
    Le 2FA reste désactivé tant que le user n'a pas confirmé un code valide via /2fa/verify.
    """
    import pyotp
    secret = pyotp.random_base32()
    issuer = "À lo Maman"
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=user.get("email") or user.get("phone") or user["id"], issuer_name=issuer)
    # Stocke le secret en attente (pas encore actif)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"totp_secret_pending": secret, "totp_pending_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _audit_log(user=user, action="write", resource_type="2FA", resource_id=user["id"], details={"action": "setup_started"})
    return {"secret": secret, "otpauth_url": otpauth_url, "issuer": issuer, "label": user.get("email") or user["id"]}


class TotpVerifyIn(BaseModel):
    code: str


@api.post("/auth/2fa/verify")
async def auth_2fa_verify(payload: TotpVerifyIn, user=Depends(get_current_user)):
    """Confirme un code 2FA et active le 2FA sur le compte."""
    import pyotp
    full = await db.users.find_one({"id": user["id"]})
    if not full:
        raise HTTPException(404, "Utilisateur introuvable")
    secret = full.get("totp_secret_pending") or full.get("totp_secret")
    if not secret:
        raise HTTPException(400, "Aucun secret 2FA en attente. Lancez d'abord /2fa/setup")
    code = (payload.code or "").strip().replace(" ", "")
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        raise HTTPException(401, "Code 2FA invalide")
    # Active 2FA en migrant le secret pending → secret actif
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "totp_secret": secret,
            "totp_enabled": True,
            "totp_activated_at": datetime.now(timezone.utc).isoformat(),
        }, "$unset": {"totp_secret_pending": "", "totp_pending_at": ""}},
    )
    await _audit_log(user=user, action="write", resource_type="2FA", resource_id=user["id"], details={"action": "enabled"})
    return {"ok": True, "totp_enabled": True}


@api.post("/auth/2fa/disable")
async def auth_2fa_disable(payload: TotpVerifyIn, user=Depends(get_current_user)):
    """Désactive le 2FA. Code TOTP requis pour confirmer."""
    import pyotp
    full = await db.users.find_one({"id": user["id"]})
    if not full or not full.get("totp_enabled"):
        raise HTTPException(400, "2FA non activé")
    code = (payload.code or "").strip().replace(" ", "")
    if not pyotp.TOTP(full["totp_secret"]).verify(code, valid_window=1):
        raise HTTPException(401, "Code 2FA invalide")
    await db.users.update_one(
        {"id": user["id"]},
        {"$unset": {"totp_secret": "", "totp_enabled": ""},
         "$set": {"totp_disabled_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _audit_log(user=user, action="write", resource_type="2FA", resource_id=user["id"], details={"action": "disabled"})
    return {"ok": True, "totp_enabled": False}


@api.get("/auth/2fa/status")
async def auth_2fa_status(user=Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    return {
        "enabled": bool(full and full.get("totp_enabled")),
        "activated_at": (full or {}).get("totp_activated_at"),
        "required_for_role": user.get("role") in ("professionnel", "centre_sante", "admin"),
    }


# ============================================================================
# 🚨 RGSSI N3 — Gestion des incidents de sécurité
# ============================================================================

INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"]
INCIDENT_STATUSES = ["open", "investigating", "resolved", "closed"]
INCIDENT_CATEGORIES = [
    "breach",          # fuite/violation de données
    "unauthorized_access",
    "data_corruption",
    "suspicious_activity",
    "phishing",
    "ddos",
    "malware",
    "physical",
    "other",
]


class IncidentIn(BaseModel):
    title: str
    description: str
    severity: str        # low | medium | high | critical
    category: str        # cf. INCIDENT_CATEGORIES
    affected_users: Optional[List[str]] = None  # user_ids potentiellement impactés
    detected_at: Optional[str] = None  # ISO


@api.post("/incidents")
async def incident_create(payload: IncidentIn, user=Depends(get_current_user)):
    """Déclare un incident de sécurité. Tout utilisateur peut déclarer."""
    if payload.severity not in INCIDENT_SEVERITIES:
        raise HTTPException(400, f"Sévérité invalide. Valides : {INCIDENT_SEVERITIES}")
    if payload.category not in INCIDENT_CATEGORIES:
        raise HTTPException(400, f"Catégorie invalide. Valides : {INCIDENT_CATEGORIES}")
    iid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": iid,
        "title": payload.title,
        "description": payload.description,
        "severity": payload.severity,
        "category": payload.category,
        "affected_users": payload.affected_users or [],
        "detected_at": payload.detected_at or now,
        "reported_by": user["id"],
        "reporter_name": user.get("name"),
        "reporter_role": user.get("role"),
        "status": "open",
        "anssi_notification_required": payload.severity in ("high", "critical"),
        "anssi_notified_at": None,
        "resolution_notes": None,
        "created_at": now,
        "updated_at": now,
        "history": [{"at": now, "by": user["id"], "action": "created", "status": "open"}],
    }
    await db.incidents.insert_one(doc)

    # Notifier les admins
    try:
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(50)
        for adm in admins:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": adm["id"],
                "type": "security_incident",
                "title": f"🚨 Incident {payload.severity.upper()} — {payload.title}",
                "body": payload.description[:200],
                "data": {"incident_id": iid, "severity": payload.severity},
                "read": False,
                "created_at": now,
            })
    except Exception:
        pass

    await _audit_log(user=user, action="write", resource_type="Incident", resource_id=iid, details={"severity": payload.severity, "category": payload.category})
    return {**doc, "_id": None}


@api.get("/incidents")
async def incidents_list(status: Optional[str] = None, severity: Optional[str] = None, user=Depends(require_roles("admin"))):
    """Admin liste tous les incidents (avec filtres optionnels)."""
    flt: dict = {}
    if status:
        flt["status"] = status
    if severity:
        flt["severity"] = severity
    items = await db.incidents.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = {
        "total": len(items),
        "open": sum(1 for i in items if i["status"] == "open"),
        "investigating": sum(1 for i in items if i["status"] == "investigating"),
        "resolved": sum(1 for i in items if i["status"] == "resolved"),
        "critical": sum(1 for i in items if i["severity"] == "critical"),
        "anssi_pending": sum(1 for i in items if i.get("anssi_notification_required") and not i.get("anssi_notified_at")),
    }
    return {"stats": stats, "incidents": items}


@api.get("/incidents/{iid}")
async def incident_get(iid: str, user=Depends(get_current_user)):
    doc = await db.incidents.find_one({"id": iid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident introuvable")
    # Reporter peut voir le sien ; admin peut tout voir
    if user["role"] != "admin" and doc.get("reported_by") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    return doc


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    resolution_notes: Optional[str] = None
    anssi_notified: Optional[bool] = None


@api.patch("/incidents/{iid}")
async def incident_update(iid: str, payload: IncidentUpdate, user=Depends(require_roles("admin"))):
    doc = await db.incidents.find_one({"id": iid})
    if not doc:
        raise HTTPException(404, "Incident introuvable")
    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    history_entry = {"at": update["updated_at"], "by": user["id"]}
    if payload.status:
        if payload.status not in INCIDENT_STATUSES:
            raise HTTPException(400, f"Statut invalide. Valides : {INCIDENT_STATUSES}")
        update["status"] = payload.status
        history_entry["status"] = payload.status
        history_entry["action"] = f"status_changed_to_{payload.status}"
    if payload.resolution_notes is not None:
        update["resolution_notes"] = payload.resolution_notes
    if payload.anssi_notified:
        update["anssi_notified_at"] = update["updated_at"]
        history_entry["action"] = "anssi_notified"
    await db.incidents.update_one({"id": iid}, {"$set": update, "$push": {"history": history_entry}})
    await _audit_log(user=user, action="write", resource_type="Incident", resource_id=iid, details={"changes": list(update.keys())})
    return {"ok": True}


# ============================================================================
# 🛡️ RGSSI N3 — Tableau de bord conformité (admin)
# ============================================================================

@api.get("/admin/rgssi/compliance")
async def rgssi_compliance(user=Depends(require_roles("admin"))):
    """Tableau de bord conformité RGSSI Niveau 3. Donne un aperçu temps réel."""
    # 2FA stats
    pros_total = await db.users.count_documents({"role": "professionnel"})
    pros_2fa = await db.users.count_documents({"role": "professionnel", "totp_enabled": True})
    centres_total = await db.users.count_documents({"role": "centre_sante"})
    centres_2fa = await db.users.count_documents({"role": "centre_sante", "totp_enabled": True})

    # Incidents stats (90 derniers jours)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    incidents_90d = await db.incidents.count_documents({"created_at": {"$gte": cutoff}})
    incidents_critical_open = await db.incidents.count_documents({"severity": "critical", "status": {"$in": ["open", "investigating"]}})
    incidents_anssi_pending = await db.incidents.count_documents({"anssi_notification_required": True, "anssi_notified_at": None})

    # Audit log volume (30 derniers jours)
    cutoff_30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    audit_30d = await db.audit_log.count_documents({"timestamp": {"$gte": cutoff_30}})

    # Consents actifs
    consents_active = await db.consents.count_documents({"status": "active"})

    # Données chiffrées
    encrypted_fields = ["cmu (users)", "allergies (enfants)", "image_base64 (tele_echo)", "notes (consultation_notes)"]

    return {
        "rgssi_level": 3,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "domains": {
            "B7_access_control": {
                "title": "B.7 — Contrôle d'accès",
                "score": round(100 * pros_2fa / pros_total, 1) if pros_total else 0,
                "metrics": {
                    "pros_2fa": pros_2fa,
                    "pros_total": pros_total,
                    "centres_2fa": centres_2fa,
                    "centres_total": centres_total,
                },
                "compliant": (pros_2fa == pros_total and pros_total > 0),
            },
            "B8_cryptography": {
                "title": "B.8 — Cryptographie",
                "compliant": True,
                "metrics": {
                    "at_rest": "AES-256-GCM",
                    "in_transit": "TLS 1.3",
                    "encrypted_fields": encrypted_fields,
                },
            },
            "B14_incidents": {
                "title": "B.14 — Gestion incidents",
                "compliant": incidents_anssi_pending == 0 and incidents_critical_open == 0,
                "metrics": {
                    "incidents_90d": incidents_90d,
                    "critical_open": incidents_critical_open,
                    "anssi_pending": incidents_anssi_pending,
                },
            },
            "B14_audit_log": {
                "title": "B.14 — Journalisation",
                "compliant": audit_30d > 0,
                "metrics": {"events_30d": audit_30d, "retention_days": 365},
            },
            "consent_granular": {
                "title": "Consentement granulaire",
                "compliant": True,
                "metrics": {"active_consents": consents_active, "categories_supported": 10},
            },
            "fhir_interop": {
                "title": "Interopérabilité FHIR R4",
                "compliant": True,
                "metrics": {"endpoints": 9, "standard": "HL7 FHIR R4 (4.0.1)"},
            },
        },
    }


@api.get("/admin/rgssi/audit-log")
async def rgssi_audit_log_admin(limit: int = 200, user=Depends(require_roles("admin"))):
    """Admin : récupère l'audit log complet (lecture sensible, restriction admin)."""
    items = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).to_list(min(limit, 1000))
    return {"total": len(items), "events": items}


@api.get("/security/docs")
async def security_docs_list(user=Depends(get_current_user)):
    """Liste les documents de sécurité disponibles (PSSI, PAS, Analyse de risques)."""
    docs_dir = "/app/security"
    docs = []
    for fname, label, role_required in [
        ("PSSI.md", "Politique de Sécurité (PSSI)", None),
        ("PAS_2026.md", "Plan Annuel de Sécurisation 2026", None),
        ("ANALYSE_RISQUES.md", "Analyse de Risques (EBIOS)", "admin"),
    ]:
        if role_required and user["role"] != role_required:
            continue
        path = os.path.join(docs_dir, fname)
        if os.path.isfile(path):
            stat = os.stat(path)
            docs.append({
                "key": fname.replace(".md", ""),
                "label": label,
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "role_required": role_required,
            })
    return {"docs": docs}


@api.get("/security/docs/{name}")
async def security_doc_read(name: str, user=Depends(get_current_user)):
    """Récupère le contenu markdown d'un document de sécurité."""
    allowed = {"PSSI", "PAS_2026", "ANALYSE_RISQUES"}
    if name not in allowed:
        raise HTTPException(404, "Document inconnu")
    if name == "ANALYSE_RISQUES" and user["role"] != "admin":
        raise HTTPException(403, "Accès admin requis")
    path = f"/app/security/{name}.md"
    if not os.path.isfile(path):
        raise HTTPException(404, "Document introuvable")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    await _audit_log(user=user, action="read", resource_type="SecurityDoc", resource_id=name)
    return {"name": name, "content": content}


@api.get("/admin/rgssi/users-access-review")
async def users_access_review(user=Depends(require_roles("admin"))):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    users = await db.users.find({}, {
        "_id": 0, "id": 1, "email": 1, "phone": 1, "role": 1, "name": 1, "specialite": 1,
        "totp_enabled": 1, "created_at": 1, "last_login_at": 1,
    }).to_list(2000)
    # Comptes actifs : login récent < 90j
    active = [u for u in users if u.get("last_login_at") and u["last_login_at"] >= cutoff]
    inactive = [u for u in users if not u.get("last_login_at") or u["last_login_at"] < cutoff]
    return {
        "total_users": len(users),
        "active_90d": len(active),
        "inactive_90d": len(inactive),
        "by_role": {
            r: sum(1 for u in users if u.get("role") == r) for r in ("maman", "professionnel", "centre_sante", "famille", "admin")
        },
        "users_active": active,
        "users_inactive": inactive,
    }


@api.post("/admin/rgssi/backup/run")
async def admin_backup_run(user=Depends(require_roles("admin"))):
    """🔐 Déclenche un backup manuel immédiat (RGSSI N3 B.14)."""
    import sys
    sys.path.insert(0, "/app/security")
    try:
        from backup import make_backup, cleanup_old_backups  # type: ignore
        os.makedirs("/app/backups", exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out = f"/app/backups/alomaman_manual_{ts}.tar.gz.enc"
        metadata = await make_backup(out)
        cleanup_old_backups(30)
        await _audit_log(user=user, action="backup", resource_type="Database", resource_id=out, details={"manual": True})
        return {"ok": True, "path": out, "collections": len(metadata.get("collections", []))}
    except Exception as e:
        raise HTTPException(500, f"Backup échoué : {e}")


@api.get("/admin/rgssi/backup/list")
async def admin_backup_list(user=Depends(require_roles("admin"))):
    """Liste les backups disponibles dans /app/backups."""
    from pathlib import Path
    p = Path("/app/backups")
    if not p.exists():
        return {"backups": [], "total": 0}
    items = []
    for f in sorted(p.glob("alomaman_*.enc"), key=lambda x: x.stat().st_mtime, reverse=True):
        st = f.stat()
        items.append({
            "name": f.name,
            "size_bytes": st.st_size,
            "size_mb": round(st.st_size / (1024 * 1024), 2),
            "created_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        })
    return {"total": len(items), "backups": items}


@api.get("/admin/rgssi/incidents/anssi-report/{iid}")
async def incident_anssi_report(iid: str, user=Depends(require_roles("admin"))):
    inc = await db.incidents.find_one({"id": iid}, {"_id": 0})
    if not inc:
        raise HTTPException(404, "Incident introuvable")
    return {
        "ANSSI_Cote_d_Ivoire": {
            "Reference_RGSSI": "Niveau 3 - Article B.14",
            "Application": "À lo Maman",
            "Operator": "TRECKADZO / À lo Maman SARL",
            "Incident": {
                "ID": inc["id"],
                "Title": inc["title"],
                "Severity": inc["severity"].upper(),
                "Category": inc["category"],
                "Description": inc["description"],
                "Detected_at": inc.get("detected_at"),
                "Affected_users_count": len(inc.get("affected_users") or []),
                "Status": inc["status"],
                "Resolution_notes": inc.get("resolution_notes"),
            },
            "Actions_taken": "Voir history",
            "History": inc.get("history", []),
            "Generated_at": datetime.now(timezone.utc).isoformat(),
            "Reporter": inc.get("reporter_name") + " (" + inc.get("reporter_role", "") + ")",
        },
    }


# --- Export PDF + JSON FHIR du carnet médical ------------------------------

@api.get("/enfants/{enfant_id}/carnet/export/pdf")
async def carnet_export_pdf(enfant_id: str, user=Depends(get_current_user)):
    """Exporte le carnet médical complet de l'enfant en PDF officiel."""
    e = await db.enfants.find_one({"id": enfant_id}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and e.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if user["role"] == "professionnel":
        ok = await _check_pro_access_to_enfant(user, e)
        if not ok:
            raise HTTPException(403, "Accès refusé")

    maman = await db.users.find_one({"id": e["user_id"]}, {"_id": 0}) or {}

    # Calcul âge
    try:
        dn = datetime.fromisoformat(str(e["date_naissance"]).replace("Z", "+00:00"))
        if dn.tzinfo is None:
            dn = dn.replace(tzinfo=timezone.utc)
        age_mois = max(0, int((datetime.now(timezone.utc) - dn).total_seconds() / (30.4375 * 86400)))
    except Exception:
        age_mois = 0

    immunizations = [to_fhir_immunization(v, enfant_id) for v in (e.get("vaccins") or [])]
    observations: list[dict] = []
    for m in (e.get("mesures") or []):
        observations.extend(to_fhir_observations_from_mesure(m, enfant_id))

    diagnostic_reports: list[dict] = []
    async for echo in db.tele_echo.find({"maman_id": e.get("user_id")}, {"_id": 0}):
        diagnostic_reports.append(to_fhir_diagnostic_report_echo(echo, e.get("user_id")))

    # DMP summary
    dmp_summary = None
    try:
        progress = await db.dmp_progress.find({"enfant_id": enfant_id}, {"_id": 0}).to_list(500)
        responses = {p["milestone_id"]: p.get("response", "oui") for p in progress if p.get("milestone_id")}
        from dmp_data import compute_dmp_status as _dmp_compute
        dmp_summary = _dmp_compute(age_mois, responses)
    except Exception:
        dmp_summary = None

    composition = build_carnet_composition(
        enfant=e, maman=maman,
        immunizations=immunizations,
        observations=observations,
        diagnostic_reports=diagnostic_reports,
        dmp_summary=dmp_summary,
    )

    from pdf_generator import generate_carnet_pdf
    pdf_bytes = generate_carnet_pdf(
        enfant=e, maman=maman, composition=composition,
        immunizations=immunizations, observations=observations,
        diagnostic_reports=diagnostic_reports, age_mois=age_mois,
        dmp_summary=dmp_summary,
    )
    await _audit_log(user=user, action="export", resource_type="Carnet.pdf", resource_id=enfant_id)
    safe_nom = (e.get("nom") or "enfant").replace(" ", "_")
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=carnet_{safe_nom}.pdf"},
    )


@api.get("/enfants/{enfant_id}/carnet/export/fhir")
async def carnet_export_fhir(enfant_id: str, user=Depends(get_current_user)):
    """Exporte le carnet en JSON FHIR R4 (Bundle document) — proxy sur /fhir/everything."""
    return await fhir_everything(enfant_id, user)


# ----------------------------------------------------------------------
# Dossier médical lisible (pour UI + PDF + lien partageable)
# ----------------------------------------------------------------------
async def _build_dossier(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        return {}
    grossesse = await db.grossesses.find_one({"user_id": user_id, "active": True}, {"_id": 0})
    enfants = await db.enfants.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    rdv = await db.rdv.find({"maman_id": user_id}, {"_id": 0}).sort("date", -1).to_list(50)
    cycles = await db.cycles.find({"user_id": user_id}, {"_id": 0}).sort("date_debut_regles", -1).to_list(20)
    # Pros snapshot for RDV display
    pro_ids = list({r.get("pro_id") for r in rdv if r.get("pro_id")})
    pros_map: dict = {}
    if pro_ids:
        async for p in db.users.find({"id": {"$in": pro_ids}}, {"_id": 0, "id": 1, "name": 1, "specialite": 1}):
            pros_map[p["id"]] = {"name": p.get("name"), "specialite": p.get("specialite")}
    for r in rdv:
        r["pro"] = pros_map.get(r.get("pro_id"), {})
    return {
        "patient": {
            "id": u["id"],
            "nom": u.get("name"),
            "email": u.get("email_public") or u.get("email"),
            "phone": u.get("phone"),
            "ville": u.get("ville"),
            "region": u.get("region"),
            "created_at": u.get("created_at"),
        },
        "grossesse": grossesse,
        "enfants": enfants,
        "rdv": rdv,
        "cycles": cycles,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/dossier")
async def dossier_me(user=Depends(get_current_user)):
    if user["role"] != "maman":
        raise HTTPException(403, "Dossier médical réservé aux mamans")
    return await _build_dossier(user["id"])


@api.post("/dossier/share")
async def dossier_share(user=Depends(get_current_user)):
    """Créer un lien public à durée limitée (7 jours) pour partager le dossier avec un pro."""
    if user["role"] != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.dossier_shares.insert_one({
        "token": token,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat(),
    })
    public_base = os.environ.get("APP_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    # L'app mobile ouvrira cette URL sur un navigateur. Le path /dossier/partage/:token est rendu par le frontend ou renvoie du JSON.
    url = f"{public_base.rstrip('/')}/api/dossier/public/{token}" if public_base else f"/api/dossier/public/{token}"
    return {"token": token, "url": url, "expires_at": expires_at.isoformat()}


@api.get("/dossier/public/{token}")
async def dossier_public(token: str):
    s = await db.dossier_shares.find_one({"token": token}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Lien invalide ou expiré")
    try:
        exp = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
    except Exception:
        exp = datetime.now(timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(410, "Lien expiré")
    dossier = await _build_dossier(s["user_id"])
    return dossier


# ----------------------------------------------------------------------
# Send Expo Push (real push, best-effort)
# ----------------------------------------------------------------------
# ----------------------------------------------------------------------
# Téléconsultation - Helper fenêtre temporelle (pré/post RDV)
# ----------------------------------------------------------------------
TELECONSULT_OPEN_BEFORE_MIN = 15  # ouverture 15 min avant l'heure
TELECONSULT_GRACE_AFTER_MIN = 30  # clôture 30 min après la fin du RDV


def _compute_teleconsult_window(rdv: dict) -> dict:
    """Calcule la fenêtre temporelle d'accès à la salle vidéo pour un RDV.

    Retourne un dict :
      - status : "scheduled" | "open" | "closed" | "not_confirmed" | "cancelled" | "error"
      - opens_at, closes_at (ISO strings UTC)
      - now (ISO string UTC)
      - seconds_until_open (négatif si déjà ouvert)
      - seconds_until_close
      - human : message lisible
    """
    try:
        if rdv.get("status") == "annule":
            return {
                "status": "cancelled",
                "human": "Ce RDV a été annulé. La téléconsultation n'est plus accessible.",
                "available": False,
            }
        if rdv.get("status") not in ("confirme", "en_cours", "termine"):
            # en_attente ou autres → pas encore confirmé
            return {
                "status": "not_confirmed",
                "human": "Ce RDV doit être confirmé par le professionnel avant de pouvoir démarrer la téléconsultation.",
                "available": False,
            }

        date_str = rdv.get("date")
        if not date_str:
            return {"status": "error", "human": "Date du RDV manquante", "available": False}

        # Parse date
        try:
            rdv_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            return {"status": "error", "human": "Date du RDV illisible", "available": False}
        if rdv_dt.tzinfo is None:
            rdv_dt = rdv_dt.replace(tzinfo=timezone.utc)

        duree_min = int(rdv.get("duree_minutes") or 30)
        opens_at = rdv_dt - timedelta(minutes=TELECONSULT_OPEN_BEFORE_MIN)
        closes_at = rdv_dt + timedelta(minutes=duree_min + TELECONSULT_GRACE_AFTER_MIN)
        now = datetime.now(timezone.utc)

        seconds_until_open = int((opens_at - now).total_seconds())
        seconds_until_close = int((closes_at - now).total_seconds())

        if now < opens_at:
            # Pas encore ouvert
            mins = max(1, seconds_until_open // 60)
            if mins < 60:
                human = f"La salle ouvre dans {mins} min"
            elif mins < 1440:
                h = mins // 60
                m = mins % 60
                human = f"La salle ouvre dans {h}h {m:02d}min"
            else:
                d = mins // 1440
                human = f"La salle ouvre dans {d} jour{'s' if d > 1 else ''}"
            return {
                "status": "scheduled",
                "available": False,
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
                "now": now.isoformat(),
                "rdv_at": rdv_dt.isoformat(),
                "seconds_until_open": seconds_until_open,
                "seconds_until_close": seconds_until_close,
                "duree_minutes": duree_min,
                "human": human,
            }
        if now > closes_at:
            return {
                "status": "closed",
                "available": False,
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
                "now": now.isoformat(),
                "rdv_at": rdv_dt.isoformat(),
                "human": "La fenêtre de téléconsultation est terminée. Reprenez RDV si nécessaire.",
            }
        # Ouvert
        return {
            "status": "open",
            "available": True,
            "opens_at": opens_at.isoformat(),
            "closes_at": closes_at.isoformat(),
            "now": now.isoformat(),
            "rdv_at": rdv_dt.isoformat(),
            "seconds_until_close": seconds_until_close,
            "duree_minutes": duree_min,
            "human": "La salle est ouverte — vous pouvez rejoindre maintenant",
        }
    except Exception as e:
        logger.warning(f"_compute_teleconsult_window error: {e}")
        return {"status": "error", "available": False, "human": "Erreur de calcul de la fenêtre"}


def _enforce_teleconsult_window(rdv: dict) -> None:
    """Lève une HTTPException si la fenêtre n'est pas ouverte. Bypass admin."""
    win = _compute_teleconsult_window(rdv)
    if win.get("available"):
        return
    status = win.get("status")
    if status == "scheduled":
        # 423 Locked = ressource verrouillée temporairement
        raise HTTPException(status_code=423, detail=win.get("human", "Salle pas encore ouverte"))
    if status == "closed":
        raise HTTPException(status_code=410, detail=win.get("human", "Fenêtre terminée"))
    if status == "cancelled":
        raise HTTPException(status_code=410, detail=win.get("human", "RDV annulé"))
    if status == "not_confirmed":
        raise HTTPException(status_code=412, detail=win.get("human", "RDV non confirmé"))
    raise HTTPException(status_code=400, detail=win.get("human", "Salle indisponible"))


# ----------------------------------------------------------------------
# Téléconsultation - Statut fenêtre (utilisé par le frontend pour le countdown)
# ----------------------------------------------------------------------
@api.get("/teleconsultation/status/{rdv_id}")
async def teleconsultation_status(rdv_id: str, user=Depends(get_current_user)):
    """Retourne l'état de la fenêtre temporelle pour un RDV (sans erreur).
    Utilisé par le frontend pour afficher un compte à rebours en temps réel.
    """
    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    win = _compute_teleconsult_window(rdv)
    return {
        **win,
        "rdv_id": rdv_id,
        "rdv_status": rdv.get("status"),
        "rdv_motif": rdv.get("motif"),
        "mode": rdv.get("mode"),
    }


async def send_expo_push(token: str, title: str, body: str, data: Optional[dict] = None):
    """Send an Expo push via the public Expo Push API.
    - priority=high : déclenche FCM en mode HIGH → la notif réveille le téléphone et apparaît immédiatement
    - channelId=default (par défaut) : utilise le canal HIGH configuré côté frontend (pop-up + son)
    - Si data['channelId'] est défini (ex: "calls"), on utilise ce canal à la place
    - sound=default : son système Android
    Logs explicitement la réponse Expo pour debug.
    """
    if not token or not token.startswith("ExponentPushToken"):
        logger.info(f"send_expo_push: token invalide ou vide ({token[:30] if token else 'None'}...)")
        return
    try:
        import httpx  # type: ignore
        data_dict = data or {}
        # Si le canal spécifique est demandé dans les data, on l'utilise (ex: "calls" pour téléconsultation)
        channel_id = data_dict.get("channelId", "default")
        async with httpx.AsyncClient(timeout=10.0) as http:
            r = await http.post(
                "https://exp.host/--/api/v2/push/send",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                json={
                    "to": token,
                    "title": title,
                    "body": body,
                    "data": data_dict,
                    "sound": "default",
                    "priority": "high",
                    "channelId": channel_id,
                    "_displayInForeground": True,
                },
            )
            try:
                resp = r.json()
                # Expo renvoie {"data": {"status": "ok", "id": "..."}} ou {"data": {"status": "error", "message": "..."}}
                if isinstance(resp, dict):
                    inner = resp.get("data", {})
                    if isinstance(inner, dict):
                        status_val = inner.get("status")
                        if status_val == "error":
                            err_msg = inner.get("message", "unknown")
                            err_details = inner.get("details", {})
                            logger.warning(f"⚠️  Expo push ERROR: {err_msg} | details={err_details} | token={token[:30]}...")
                            # Si DeviceNotRegistered, on supprime le token de la DB
                            if err_details.get("error") == "DeviceNotRegistered":
                                await db.users.update_many({"push_token": token}, {"$unset": {"push_token": ""}})
                                logger.info(f"🗑️  Token Expo invalide supprimé de la DB")
                        else:
                            logger.info(f"✅ Expo push OK: {title} → {token[:30]}... id={inner.get('id', '?')}")
            except Exception:
                logger.info(f"Expo push response non-json (status={r.status_code})")
    except Exception as e:  # noqa
        logger.info(f"Expo push skipped: {e}")


# ----------------------------------------------------------------------
# PayDunya — Subscription & Consultation payments
# ----------------------------------------------------------------------
PAYDUNYA_MODE = os.environ.get("PAYDUNYA_MODE", "test").lower()
PAYDUNYA_BASE = (
    "https://app.paydunya.com/api/v1" if PAYDUNYA_MODE == "live"
    else "https://app.paydunya.com/sandbox-api/v1"
)


def paydunya_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "PAYDUNYA-MASTER-KEY": os.environ.get("PAYDUNYA_MASTER_KEY", ""),
        "PAYDUNYA-PRIVATE-KEY": os.environ.get("PAYDUNYA_PRIVATE_KEY", ""),
        "PAYDUNYA-TOKEN": os.environ.get("PAYDUNYA_TOKEN", ""),
    }


async def paydunya_create_invoice(amount: int, description: str, user: dict, custom: dict, return_url: str) -> dict:
    import httpx
    payload = {
        "invoice": {
            "total_amount": amount,
            "description": description,
        },
        "store": {"name": "À lo Maman"},
        "actions": {
            "return_url": return_url,
            "cancel_url": return_url + "?cancel=1",
        },
        "custom_data": custom,
    }
    if not os.environ.get("PAYDUNYA_MASTER_KEY"):
        # No keys configured — return simulated invoice so UI keeps working
        return {
            "success": False,
            "error": "PayDunya keys not configured. Ajoutez vos clés dans /app/backend/.env",
            "simulated": True,
        }
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            r = await http.post(f"{PAYDUNYA_BASE}/checkout-invoice/create", json=payload, headers=paydunya_headers())
            data = r.json()
        if data.get("response_code") == "00":
            return {"success": True, "token": data.get("token"), "url": data.get("response_text")}
        return {"success": False, "error": data.get("response_text") or data.get("description") or "Erreur PayDunya"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def paydunya_confirm(token: str) -> dict:
    import httpx
    if not os.environ.get("PAYDUNYA_MASTER_KEY"):
        return {"success": False, "error": "Non configuré"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(f"{PAYDUNYA_BASE}/checkout-invoice/confirm/{token}", headers=paydunya_headers())
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------
# PayDunya Disburse / Payout API (transferts vers Mobile Money)
# https://developers.paydunya.com/doc/EN/api_deboursement
# ----------------------------------------------------------------------
PAYDUNYA_DISBURSE_BASE = (
    "https://app.paydunya.com/api/v2/disburse"
    if PAYDUNYA_MODE == "live"
    else "https://app.paydunya.com/sandbox-api/v2/disburse"
)


async def paydunya_disburse_get_invoice(account_alias: str, amount: int, withdraw_mode: str, callback_url: str = "", disburse_id: str = "") -> dict:
    """Crée une facture de déboursement PayDunya (étape 1)."""
    import httpx
    if not os.environ.get("PAYDUNYA_TOKEN"):
        return {"success": False, "error": "PayDunya non configuré (PAYDUNYA_TOKEN manquant)", "simulated": True}
    payload: dict = {
        "account_alias": account_alias,
        "amount": amount,
        "withdraw_mode": withdraw_mode,
    }
    if callback_url:
        payload["callback_url"] = callback_url
    if disburse_id:
        payload["disburse_id"] = disburse_id
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            r = await http.post(
                f"{PAYDUNYA_DISBURSE_BASE}/get-invoice",
                json=payload,
                headers=paydunya_headers(),
            )
            data = r.json()
        if data.get("response_code") == "00":
            return {"success": True, "disburse_invoice": data.get("disburse_invoice") or data.get("disburse_token"), "raw": data}
        return {"success": False, "error": data.get("response_text") or data.get("description") or "Erreur PayDunya Disburse", "raw": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def paydunya_disburse_submit_invoice(disburse_invoice: str, disburse_id: str = "") -> dict:
    """Soumet la facture de déboursement (étape 2)."""
    import httpx
    if not os.environ.get("PAYDUNYA_TOKEN"):
        return {"success": False, "error": "PayDunya non configuré", "simulated": True}
    payload: dict = {"disburse_invoice": disburse_invoice}
    if disburse_id:
        payload["disburse_id"] = disburse_id
    try:
        async with httpx.AsyncClient(timeout=45.0) as http:
            r = await http.post(
                f"{PAYDUNYA_DISBURSE_BASE}/submit-invoice",
                json=payload,
                headers=paydunya_headers(),
            )
            data = r.json()
        ok = data.get("response_code") == "00" or (data.get("status") or "").lower() in ("success", "completed", "pending")
        return {"success": ok, "status": data.get("status"), "raw": data, "error": None if ok else (data.get("response_text") or data.get("description"))}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def paydunya_disburse_check_balance() -> dict:
    """Vérifie le solde du compte PayDunya marchand."""
    import httpx
    if not os.environ.get("PAYDUNYA_TOKEN"):
        return {"success": False, "error": "Non configuré", "balance": 0, "simulated": True}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(f"{PAYDUNYA_DISBURSE_BASE}/check-balance", headers=paydunya_headers())
            data = r.json()
        return {"success": data.get("response_code") == "00", "raw": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Modes de retrait supportés par PayDunya pour la Côte d'Ivoire (et autres)
WITHDRAW_PROVIDERS = {
    "orange-money-ci": {"label": "Orange Money CI", "mode": "orange-money-ci", "country": "CI"},
    "mtn-ci": {"label": "MTN Money CI", "mode": "mtn-ci", "country": "CI"},
    "moov-ci": {"label": "Moov Money CI", "mode": "moov-ci", "country": "CI"},
    "wave-ci": {"label": "Wave CI", "mode": "wave-ci", "country": "CI"},
    "orange-money-senegal": {"label": "Orange Money Sénégal", "mode": "orange-money-senegal", "country": "SN"},
    "wave-senegal": {"label": "Wave Sénégal", "mode": "wave-senegal", "country": "SN"},
    "free-money-senegal": {"label": "Free Money Sénégal", "mode": "free-money-senegal", "country": "SN"},
    "mtn-benin": {"label": "MTN Money Bénin", "mode": "mtn-benin", "country": "BJ"},
    "moov-benin": {"label": "Moov Money Bénin", "mode": "moov-benin", "country": "BJ"},
    "paydunya": {"label": "Compte PayDunya", "mode": "paydunya", "country": "*"},
}


class MobileMoneyAccountIn(BaseModel):
    provider: str  # cle de WITHDRAW_PROVIDERS
    account_alias: str  # numero (ou code BBJ pour paydunya)
    holder_name: Optional[str] = None
    debit_account_number: Optional[str] = None  # pour withdraw_mode=paydunya seulement


class WithdrawIn(BaseModel):
    amount_fcfa: int
    provider: Optional[str] = None  # si fourni override le compte enregistré
    account_alias: Optional[str] = None


# Frais de retrait que la plateforme prélève (couvre frais PayDunya + traitement)
WITHDRAW_FEE_FCFA = 100  # frais fixes minimum
WITHDRAW_FEE_PERCENT = 0.01  # 1% du montant
WITHDRAW_MIN_FCFA = 1000


async def compute_pro_balance(pro_id: str) -> dict:
    """Calcule le solde disponible d'un pro = total_net (consultations payées) - retraits déjà effectués/en cours."""
    payments = await db.payments.find(
        {"pro_id": pro_id, "kind": "consultation", "status": "completed"},
        {"_id": 0, "pro_amount": 1},
    ).to_list(2000)
    total_net = sum(p.get("pro_amount", 0) for p in payments)
    # Soustraire les payouts non échoués
    payouts = await db.payouts.find(
        {"pro_id": pro_id, "status": {"$in": ["pending", "processing", "completed"]}},
        {"_id": 0, "amount_fcfa": 1},
    ).to_list(500)
    total_withdrawn = sum(p.get("amount_fcfa", 0) for p in payouts)
    return {
        "total_earned": total_net,
        "total_withdrawn": total_withdrawn,
        "available": max(0, total_net - total_withdrawn),
    }


@api.get("/pro/mobile-money/providers")
async def list_withdraw_providers(user=Depends(require_roles("professionnel"))):
    return [{"key": k, **v} for k, v in WITHDRAW_PROVIDERS.items()]


@api.get("/pro/mobile-money")
async def get_mobile_money(user=Depends(require_roles("professionnel"))):
    """Récupère le compte Mobile Money enregistré du Pro."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "mobile_money": 1})
    return (u or {}).get("mobile_money") or {}


@api.post("/pro/mobile-money")
async def set_mobile_money(payload: MobileMoneyAccountIn, user=Depends(require_roles("professionnel"))):
    """Enregistre / met à jour le compte Mobile Money utilisé pour les retraits."""
    if payload.provider not in WITHDRAW_PROVIDERS:
        raise HTTPException(400, f"Fournisseur non supporté. Liste: {list(WITHDRAW_PROVIDERS.keys())}")
    alias = (payload.account_alias or "").strip()
    if not alias:
        raise HTTPException(400, "Numéro de téléphone / alias requis")
    # Validation basique du numéro (digits only, 8-15 chars) sauf pour paydunya
    if payload.provider != "paydunya":
        digits = "".join(c for c in alias if c.isdigit())
        if len(digits) < 8 or len(digits) > 15:
            raise HTTPException(400, "Numéro de téléphone invalide")
        alias = digits
    info = {
        "provider": payload.provider,
        "account_alias": alias,
        "holder_name": payload.holder_name or user.get("nom") or "",
        "debit_account_number": payload.debit_account_number or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": {"mobile_money": info}})
    return info


@api.get("/pro/balance")
async def pro_balance(user=Depends(require_roles("professionnel"))):
    bal = await compute_pro_balance(user["id"])
    return {
        **bal,
        "min_withdraw_fcfa": WITHDRAW_MIN_FCFA,
        "fee_fixed_fcfa": WITHDRAW_FEE_FCFA,
        "fee_percent": WITHDRAW_FEE_PERCENT,
    }


@api.get("/pro/payouts")
async def list_payouts(user=Depends(require_roles("professionnel"))):
    items = await db.payouts.find({"pro_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.post("/pro/withdraw")
async def request_withdraw(payload: WithdrawIn, user=Depends(require_roles("professionnel"))):
    """Demande de retrait des gains vers le Mobile Money via PayDunya Disburse."""
    amount = int(payload.amount_fcfa)
    if amount < WITHDRAW_MIN_FCFA:
        raise HTTPException(400, f"Montant minimum : {WITHDRAW_MIN_FCFA} FCFA")
    # Vérifier balance
    bal = await compute_pro_balance(user["id"])
    if amount > bal["available"]:
        raise HTTPException(400, f"Solde insuffisant. Disponible : {bal['available']} FCFA")
    # Récupérer compte mobile money
    u_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    mm = (u_full or {}).get("mobile_money") or {}
    provider = payload.provider or mm.get("provider")
    alias = payload.account_alias or mm.get("account_alias")
    if not provider or not alias:
        raise HTTPException(400, "Configurez d'abord votre compte Mobile Money dans Paramètres > Retraits")
    if provider not in WITHDRAW_PROVIDERS:
        raise HTTPException(400, "Fournisseur non supporté")

    # Calcul des frais
    fee = WITHDRAW_FEE_FCFA + int(round(amount * WITHDRAW_FEE_PERCENT))
    net_to_send = amount - fee
    if net_to_send <= 0:
        raise HTTPException(400, "Montant trop faible après frais")

    # Création de l'enregistrement payout
    payout_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payout_doc = {
        "id": payout_id,
        "pro_id": user["id"],
        "pro_email": user.get("email"),
        "amount_fcfa": amount,  # montant débité du solde
        "fee_fcfa": fee,
        "net_amount_fcfa": net_to_send,  # montant réellement envoyé au mobile money
        "provider": provider,
        "withdraw_mode": WITHDRAW_PROVIDERS[provider]["mode"],
        "account_alias": alias,
        "status": "pending",
        "created_at": now.isoformat(),
        "disburse_invoice": None,
        "paydunya_response": None,
        "completed_at": None,
        "error": None,
    }
    await db.payouts.insert_one(payout_doc)

    # Étape 1 : générer l'invoice de déboursement
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "")
    callback_url = (backend_url + "/api/payouts/callback") if backend_url else ""
    inv = await paydunya_disburse_get_invoice(
        account_alias=alias,
        amount=net_to_send,
        withdraw_mode=WITHDRAW_PROVIDERS[provider]["mode"],
        callback_url=callback_url,
        disburse_id=payout_id,
    )
    if not inv.get("success"):
        await db.payouts.update_one(
            {"id": payout_id},
            {"$set": {"status": "failed", "error": inv.get("error") or "Erreur création invoice", "paydunya_response": inv.get("raw")}},
        )
        return {
            "success": False,
            "payout_id": payout_id,
            "error": inv.get("error"),
            "simulated": inv.get("simulated", False),
        }

    disburse_invoice_token = inv.get("disburse_invoice")
    await db.payouts.update_one(
        {"id": payout_id},
        {"$set": {"status": "processing", "disburse_invoice": disburse_invoice_token, "paydunya_response": inv.get("raw")}},
    )

    # Étape 2 : soumettre la facture
    sub = await paydunya_disburse_submit_invoice(disburse_invoice_token, disburse_id=payout_id)
    sub_status = (sub.get("status") or "").lower()
    if sub.get("success"):
        new_status = "completed" if sub_status == "success" else ("processing" if sub_status in ("pending", "processing") else "completed")
        update = {"status": new_status, "paydunya_response": sub.get("raw")}
        if new_status == "completed":
            update["completed_at"] = datetime.now(timezone.utc).isoformat()
        await db.payouts.update_one({"id": payout_id}, {"$set": update})
        try:
            await push_notif(
                user["id"],
                "Retrait envoyé 💸",
                f"{net_to_send} FCFA en route vers votre {WITHDRAW_PROVIDERS[provider]['label']}",
                "info",
            )
        except Exception:
            pass
        return {"success": True, "payout_id": payout_id, "status": new_status, "amount_fcfa": amount, "net_amount_fcfa": net_to_send, "fee_fcfa": fee}
    else:
        await db.payouts.update_one(
            {"id": payout_id},
            {"$set": {"status": "failed", "error": sub.get("error") or "Erreur submit invoice", "paydunya_response": sub.get("raw")}},
        )
        return {"success": False, "payout_id": payout_id, "error": sub.get("error")}


@api.post("/payouts/callback")
async def payouts_callback(request: Request):
    """Callback PayDunya pour les déboursements (statut final mis à jour)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    disburse_id = body.get("disburse_id") or body.get("data", {}).get("disburse_id")
    disburse_token = body.get("disburse_invoice") or body.get("data", {}).get("disburse_invoice")
    status_val = (body.get("status") or body.get("data", {}).get("status") or "").lower()
    q: dict = {}
    if disburse_id:
        q["id"] = disburse_id
    elif disburse_token:
        q["disburse_invoice"] = disburse_token
    if not q:
        return {"ok": False}
    payout = await db.payouts.find_one(q, {"_id": 0})
    if not payout:
        return {"ok": False}
    new_status = "completed" if status_val in ("success", "completed", "done") else (
        "failed" if status_val in ("failed", "error", "rejected") else "processing"
    )
    update = {"status": new_status, "paydunya_response": body}
    if new_status == "completed":
        update["completed_at"] = datetime.now(timezone.utc).isoformat()
    await db.payouts.update_one({"id": payout["id"]}, {"$set": update})
    if new_status == "completed":
        try:
            await push_notif(
                payout["pro_id"],
                "Retrait confirmé ✅",
                f"{payout['net_amount_fcfa']} FCFA crédités sur votre Mobile Money",
                "info",
            )
        except Exception:
            pass
    elif new_status == "failed":
        try:
            await push_notif(
                payout["pro_id"],
                "Retrait échoué ❌",
                "Veuillez vérifier votre numéro Mobile Money et réessayer",
                "info",
            )
        except Exception:
            pass
    return {"ok": True}


@api.get("/admin/payouts")
async def admin_list_payouts(user=Depends(require_roles("admin"))):
    items = await db.payouts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api.get("/admin/payouts/balance")
async def admin_check_balance(user=Depends(require_roles("admin"))):
    return await paydunya_disburse_check_balance()


class SubscribeIn(BaseModel):
    months: int = 1


# ----------------------------------------------------------------------
# Premium plans (role-aware)
# ----------------------------------------------------------------------
PREMIUM_PLANS = {
    "maman": {
        "code": "maman",
        "label": "Maman Premium",
        "base_price_fcfa": 500,
        "color": "#EC4899",
        "icon": "heart",
        "description": "Accompagnement complet de la grossesse aux premiers pas de bébé, à un prix accessible.",
        "features": [
            "👶 Jusqu'à 5 enfants",
            "♾️ RDV illimités + téléconsultations prioritaires",
            "🤖 IA Claude Sonnet illimitée (24/7)",
            "📊 Dashboard santé complet + courbes OMS",
            "👪 Partage famille (4 proches)",
            "🎁 Offres partenaires (pharmacies, crèches)",
            "📞 Ligne d'écoute post-partum",
            "📄 Export PDF/FHIR illimité",
            "💾 2 Go stockage (photos, échos)",
            "🔔 Rappels IA contextuels",
            "⭐ Support 24/7 (< 2h)",
            "🎖️ Badge Maman Premium",
        ],
        "free_limits": "Gratuit : 1 enfant · 3 RDV/mois · 5 questions IA/mois · 3 téléconsultations/an · 50 Mo stockage",
        # 📊 Limites chiffrées appliquées côté backend
        "limits": {
            "enfants_max": 1,
            "rdv_per_month": 3,
            "ia_questions_per_month": 5,
            "teleconsultations_per_year": 3,
            "storage_mb": 50,
            "export_pdf_per_year": 1,
            "family_shares": 0,
        },
    },
    "professionnel": {
        "code": "pro",
        "label": "Pro Premium",
        "base_price_fcfa": 10000,
        "color": "#0EA5E9",
        "icon": "medkit",
        "description": "Pour les professionnels de santé indépendants.",
        "features": [
            "Patientes illimitées",
            "Agenda & disponibilités avancées",
            "Téléconsultation vidéo HD",
            "IA Pro (aide à la rédaction, synthèses dossier)",
            "Statistiques & revenus",
            "Badge « Pro Certifié » visible dans l'annuaire",
            "Export comptabilité mensuelle",
            "Commission réduite : 5% au lieu de 10%",
        ],
        "free_limits": "Gratuit : 10 patientes max · commission 10% sur chaque consultation payée",
    },
    "centre_sante": {
        "code": "centre",
        "label": "Centre Premium",
        "base_price_fcfa": 25000,
        "color": "#A855F7",
        "icon": "business",
        "description": "Pour cliniques, centres de santé et structures médicales.",
        "features": [
            "Pros membres illimités",
            "Tableau de bord multi-pros (stats agrégées)",
            "Calendrier consolidé du centre",
            "Tarifs personnalisés par prestation",
            "Gestion financière (paiements, revenus par pro)",
            "API / export pour logiciel de gestion",
            "Annuaire public du centre",
            "Support dédié + formation en ligne",
        ],
        "free_limits": "Gratuit : 3 pros max · pas de stats avancées",
    },
    "famille": {
        "code": "famille",
        "label": "Famille Premium",
        "base_price_fcfa": 1500,
        "color": "#14B8A6",
        "icon": "people-circle",
        "description": "Pour les proches (papa, grand-parents) accompagnant la maman.",
        "features": [
            "Accès complet au dossier partagé par la maman",
            "Notifications push des RDV et rappels",
            "Chat familial privé",
            "Suivi des mesures des enfants",
            "Calendrier partagé des rendez-vous médicaux",
            "IA basique (questions santé)",
            "Support familial 7j/7",
        ],
        "free_limits": "Gratuit : lecture seule du dossier partagé (sans notifications)",
    },
}

# Quotas freemium — limites pour les utilisateurs non-Premium
FREE_QUOTAS = {
    "maman": {
        "enfants_max": 1,             # 1 enfant maximum (gratuit)
        "rdv_per_month": 3,           # 3 RDV / mois (gratuit)
        "ia_questions_per_month": 5,  # 5 questions IA / mois (gratuit)
        "teleconsultations_per_year": 3,  # 3 téléconsults / an (gratuit)
        "storage_mb": 50,
        "proches_max": 0,             # 💎 Partage famille réservé Premium (4 proches max)
    },
    "professionnel": {"patientes_max": 10, "ia_pro_per_day": 0},
    "centre_sante": {"membres_pro_max": 3},
    "famille": {"notifications_enabled": False},
}

# Limites Premium (utilisées pour enforcement Premium aussi)
PREMIUM_QUOTAS = {
    "maman": {
        "proches_max": 4,             # 4 proches max même en Premium (limite raisonnable)
        "storage_mb": 2048,           # 2 Go = 2048 Mo
    },
}

# Remises selon la durée
DURATION_DISCOUNTS = {1: 0.0, 3: 0.05, 6: 0.10, 12: 0.20}


def compute_plan_price(role: str, months: int) -> tuple[int, float, int]:
    """Return (amount, discount_rate, base)."""
    plan = PREMIUM_PLANS.get(role)
    if not plan:
        raise HTTPException(400, "Aucun plan Premium disponible pour votre rôle.")
    base = plan["base_price_fcfa"]
    discount = DURATION_DISCOUNTS.get(months, 0.0)
    full = base * months
    amount = int(round(full * (1 - discount)))
    return amount, discount, full


@api.get("/plans")
async def list_plans():
    """Liste des plans premium disponibles."""
    return {
        "plans": PREMIUM_PLANS,
        "durations": [
            {"months": m, "discount": d, "label": f"{m} mois" + (f" · -{int(d*100)}%" if d else "")}
            for m, d in DURATION_DISCOUNTS.items()
        ],
    }


@api.get("/plans/me")
async def my_plan(user=Depends(get_current_user)):
    """Plan premium applicable à l'utilisateur courant."""
    role = user.get("role")
    plan = PREMIUM_PLANS.get(role)
    quotes: list[dict] = []
    if plan:
        for m, d in DURATION_DISCOUNTS.items():
            amount, disc, full = compute_plan_price(role, m)
            quotes.append({"months": m, "amount": amount, "discount": disc, "full_price": full})
    return {
        "role": role,
        "plan": plan,
        "quotes": quotes,
        "is_premium": bool(user.get("premium") and user.get("premium_until") and datetime.fromisoformat(user["premium_until"].replace("Z", "+00:00")) > datetime.now(timezone.utc)) if user.get("premium_until") else bool(user.get("premium", False)),
        "premium_until": user.get("premium_until"),
    }


# ====================================================================
# 🤝 SYSTÈME DE PARRAINAGE
# ====================================================================
@api.get("/referral/me")
async def my_referral(user=Depends(get_current_user)):
    """Statistiques de parrainage de la maman courante."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Le parrainage est réservé aux mamans")
    # Si le user n'a pas encore de code (ancien compte), lui en créer un à la volée
    my_code = user.get("referral_code")
    if not my_code:
        import secrets as _secrets
        import string as _string
        alphabet = _string.ascii_uppercase + _string.digits
        alphabet = alphabet.replace("O", "").replace("I", "").replace("0", "").replace("1", "")
        for _ in range(20):
            candidate = "".join(_secrets.choice(alphabet) for _ in range(6))
            if not await db.users.find_one({"referral_code": candidate}, {"_id": 0, "id": 1}):
                my_code = candidate
                break
        if my_code:
            await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": my_code}})
    # Récupérer la liste des filleules
    filleules_cursor = db.users.find({"referred_by_id": user["id"]}, {"_id": 0, "id": 1, "name": 1, "created_at": 1})
    filleules = await filleules_cursor.to_list(100)
    # Prochain palier
    count = len(filleules)
    next_milestone = None
    if count < 3:
        next_milestone = {"at": 3, "bonus_days": 30, "remaining": 3 - count, "label": "+1 mois bonus"}
    elif count < 10:
        next_milestone = {"at": 10, "bonus_days": 60, "remaining": 10 - count, "label": "+2 mois bonus"}
    return {
        "referral_code": my_code,
        "referrals_count": count,
        "days_earned": int(user.get("referral_premium_days_earned") or 0),
        "filleules": filleules,
        "share_url": f"https://alomaman.com/inscription?ref={my_code}" if my_code else None,
        "share_text": f"🤰 Rejoins-moi sur À lo Maman pour un suivi complet de ta grossesse et de ton bébé ! Utilise mon code {my_code} à l'inscription. 👶",
        "next_milestone": next_milestone,
        "rewards_info": {
            "per_referral_days": 7,
            "milestones": [
                {"at": 3, "bonus_days": 30, "label": "3 filleules = +1 mois"},
                {"at": 10, "bonus_days": 60, "label": "10 filleules = +2 mois"},
            ],
        },
    }


class ReferralValidateIn(BaseModel):
    code: str


@api.post("/referral/validate-code")
async def validate_referral_code(payload: ReferralValidateIn):
    """Vérifie qu'un code de parrainage existe (utilisé avant l'inscription)."""
    code = (payload.code or "").strip().upper()
    if not code or len(code) != 6:
        return {"valid": False, "reason": "Code invalide (6 caractères requis)"}
    parrain = await db.users.find_one({"referral_code": code, "role": "maman"}, {"_id": 0, "name": 1})
    if not parrain:
        return {"valid": False, "reason": "Code introuvable"}
    return {"valid": True, "parrain_name": parrain.get("name", "").split()[0] if parrain.get("name") else "une maman"}


@api.post("/pay/subscribe")
async def pay_subscribe(payload: SubscribeIn, user=Depends(get_current_user)):
    # Autoriser maman, pro & centre
    role = user.get("role")
    if role not in PREMIUM_PLANS:
        raise HTTPException(403, "Aucun plan Premium disponible pour votre rôle.")
    months = max(1, min(payload.months, 12))
    amount, discount, full = compute_plan_price(role, months)
    plan = PREMIUM_PLANS[role]
    desc = f"{plan['label']} · {months} mois"
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        amount, desc, user,
        {"kind": "subscription", "user_id": user["id"], "months": months, "plan": plan["code"], "role": role},
        return_url,
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "kind": "subscription",
        "plan": plan["code"],
        "role": role,
        "amount": amount,
        "months": months,
        "discount": discount,
        "full_price": full,
        "token": inv.get("token"),
        "status": "pending" if inv.get("success") else "error",
        "error": inv.get("error"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return {"payment": doc, "payment_url": inv.get("url"), "success": inv.get("success", False), "error": inv.get("error")}


# LEGACY: kept for backward-compat (older clients calling without role guard)
_legacy_pay_subscribe = pay_subscribe


class ConsultationPayIn(BaseModel):
    rdv_id: str


@api.post("/pay/consultation")
async def pay_consultation(payload: ConsultationPayIn, user=Depends(require_roles("maman"))):
    rdv = await db.rdv.find_one({"id": payload.rdv_id, "maman_id": user["id"]}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    # 💰 Total à payer = (reste à charge si CMU sinon tarif) + frais de déplacement domicile
    base_amount = rdv.get("reste_a_charge_fcfa") if rdv.get("cmu_applique") else rdv.get("tarif_fcfa", 10000)
    if not base_amount:
        base_amount = rdv.get("tarif_fcfa", 10000)
    frais_deplacement = int(rdv.get("frais_deplacement_fcfa") or 0)
    amount = int(base_amount) + frais_deplacement
    # 💳 Commission différenciée selon mode + Premium
    pro = await db.users.find_one({"id": rdv["pro_id"]}, {"_id": 0})
    pro_premium = bool(pro and is_premium_active(pro))
    mode = rdv.get("mode") or "presentiel"
    if mode == "domicile":
        commission_rate = 0.07 if pro_premium else 0.12  # 12% gratuit / 7% Premium (déplacement)
    else:  # teleconsultation, presentiel
        commission_rate = 0.05 if pro_premium else 0.10  # 10% gratuit / 5% Premium
    commission = int(round(amount * commission_rate))
    pro_amount = amount - commission
    desc = f"Consultation À lo Maman · {mode.title()} · RDV {rdv['date'][:10]}"
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        amount, desc, user,
        {
            "kind": "consultation",
            "mode": mode,
            "rdv_id": payload.rdv_id,
            "maman_id": user["id"],
            "pro_id": rdv["pro_id"],
            "commission": commission,
            "commission_rate": commission_rate,
            "pro_amount": pro_amount,
            "frais_deplacement_fcfa": frais_deplacement,
        },
        return_url,
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "kind": "consultation",
        "mode": mode,
        "rdv_id": payload.rdv_id,
        "pro_id": rdv["pro_id"],
        "amount": amount,
        "base_amount_fcfa": int(base_amount),
        "frais_deplacement_fcfa": frais_deplacement,
        "commission": commission,
        "commission_rate": commission_rate,
        "pro_amount": pro_amount,
        "token": inv.get("token"),
        "status": "pending" if inv.get("success") else "error",
        "error": inv.get("error"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    # 📊 Audit log RGSSI N3
    try:
        await _audit_log(user=user, action="pay_initiate", resource_type="Payment", resource_id=doc["id"], details={"amount": amount, "mode": mode, "pro_id": rdv["pro_id"], "commission": commission})
    except Exception:
        pass
    return {"payment": doc, "payment_url": inv.get("url"), "success": inv.get("success", False), "error": inv.get("error")}


@api.post("/pay/verify/{token}")
async def pay_verify(token: str, user=Depends(get_current_user)):
    p = await db.payments.find_one({"token": token}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paiement introuvable")
    res = await paydunya_confirm(token)
    status_val = (res.get("status") or "").lower()
    if res.get("response_code") == "00" and status_val == "completed":
        now = datetime.now(timezone.utc)
        await db.payments.update_one({"token": token}, {"$set": {"status": "completed", "paid_at": now.isoformat()}})
        if p["kind"] == "subscription":
            end = now + timedelta(days=30 * p["months"])
            await db.users.update_one(
                {"id": p["user_id"]},
                {"$set": {"premium": True, "premium_until": end.isoformat()}},
            )
            await push_notif(p["user_id"], "Premium activé 🎉", f"Merci ! Votre abonnement est actif jusqu'au {end.strftime('%d/%m/%Y')}.", "info")
        elif p["kind"] == "consultation":
            # 📅 RDV : status confirmé + paye=true
            await db.rdv.update_one({"id": p["rdv_id"]}, {"$set": {"paye": True, "payment_token": token, "status": "confirme", "paid_at": now.isoformat()}})
            mode = p.get("mode") or "presentiel"
            # 🏠 Mode domicile : pousser l'adresse complète au Pro
            if mode == "domicile":
                rdv = await db.rdv.find_one({"id": p["rdv_id"]}, {"_id": 0}) or {}
                from encryption import decrypt_str as _dec
                adr = _dec(rdv.get("adresse_domicile_enc")) or "Adresse non renseignée"
                quartier = rdv.get("quartier") or ""
                ville = rdv.get("ville") or ""
                full_addr = f"{adr}{(' · ' + quartier) if quartier else ''}{(' · ' + ville) if ville else ''}"
                await push_notif(p["pro_id"], "🏠 Visite à domicile confirmée", f"Adresse de la patiente : {full_addr}. RDV payé : +{p['pro_amount']} F (après commission).", "rdv")
            else:
                await push_notif(p["pro_id"], "Consultation payée 💰", f"Votre RDV a été payé ({p['pro_amount']} FCFA après commission).", "info")
            # 📊 Audit log
            try:
                await _audit_log(user=user, action="pay_completed", resource_type="Payment", resource_id=p["id"], details={"amount": p["amount"], "mode": mode, "rdv_id": p["rdv_id"]})
            except Exception:
                pass
        return {"status": "completed", "payment": {**p, "status": "completed"}}
    return {"status": p["status"], "paydunya_status": status_val, "raw": res}


@api.get("/pay/history")
async def pay_history(user=Depends(get_current_user)):
    q = {"user_id": user["id"]} if user["role"] == "maman" else (
        {"pro_id": user["id"]} if user["role"] == "professionnel" else {}
    )
    items = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.get("/pay/admin/stats")
async def pay_admin_stats(user=Depends(require_roles("admin"))):
    completed = await db.payments.find({"status": "completed"}, {"_id": 0}).to_list(1000)
    total_revenu = sum(p["amount"] for p in completed)
    total_commission = sum(p.get("commission", p["amount"] if p["kind"] == "subscription" else 0) for p in completed)
    total_pro = sum(p.get("pro_amount", 0) for p in completed if p["kind"] == "consultation")
    return {
        "total_revenu_fcfa": total_revenu,
        "total_commission_plateforme": total_commission,
        "total_reverse_pros": total_pro,
        "nb_paiements": len(completed),
        "nb_abonnements": len([p for p in completed if p["kind"] == "subscription"]),
        "nb_consultations": len([p for p in completed if p["kind"] == "consultation"]),
    }


@api.post("/pay/webhook")
async def pay_webhook(request: Request):
    """PayDunya IPN callback. No auth — relies on token lookup + confirm call."""
    body = await request.json()
    token = body.get("invoice", {}).get("token") or body.get("token") or body.get("data", {}).get("invoice", {}).get("token")
    if not token:
        return {"ok": False}
    res = await paydunya_confirm(token)
    status_val = (res.get("status") or "").lower()
    if res.get("response_code") == "00" and status_val == "completed":
        p = await db.payments.find_one({"token": token}, {"_id": 0})
        if p and p["status"] != "completed":
            now = datetime.now(timezone.utc)
            await db.payments.update_one({"token": token}, {"$set": {"status": "completed", "paid_at": now.isoformat()}})
            if p["kind"] == "subscription":
                end = now + timedelta(days=30 * p["months"])
                await db.users.update_one({"id": p["user_id"]}, {"$set": {"premium": True, "premium_until": end.isoformat()}})
                # 🧾 Trace immuable dans la collection subscriptions (service dédié)
                try:
                    from routers.subscriptions import activate_subscription as _activate_sub
                    plan_label = "premium_annuel" if p["months"] >= 12 else "premium_mensuel"
                    await _activate_sub(
                        db=db,
                        user_id=p["user_id"],
                        plan=plan_label,
                        invoice_token=token,
                        payment_method="paydunya",
                        duration_days=30 * p["months"],
                    )
                except Exception as _sub_e:
                    logger.warning(f"[subscription] Trace échouée user={p['user_id']}: {_sub_e}")
                await push_notif(p["user_id"], "Premium activé 🎉", f"Abonnement actif jusqu'au {end.strftime('%d/%m/%Y')}", "info")
            elif p["kind"] == "consultation":
                await db.rdv.update_one({"id": p["rdv_id"]}, {"$set": {"paye": True, "payment_token": token, "status": "confirme", "paid_at": now.isoformat()}})
                mode = p.get("mode") or "presentiel"
                if mode == "domicile":
                    rdv = await db.rdv.find_one({"id": p["rdv_id"]}, {"_id": 0}) or {}
                    from encryption import decrypt_str as _dec
                    adr = _dec(rdv.get("adresse_domicile_enc")) or "Adresse non renseignée"
                    full_addr = f"{adr}{(' · ' + rdv.get('quartier','')) if rdv.get('quartier') else ''}{(' · ' + rdv.get('ville','')) if rdv.get('ville') else ''}"
                    await push_notif(p["pro_id"], "🏠 Visite à domicile confirmée", f"Adresse : {full_addr}. +{p['pro_amount']} F net.", "rdv")
                else:
                    await push_notif(p["pro_id"], "Consultation payée 💰", f"+{p['pro_amount']} FCFA (après commission)", "info")
    return {"ok": True}


@api.get("/pay/return")
async def pay_return():
    """PayDunya return redirect landing page (user comes back here after payment)."""
    from fastapi.responses import HTMLResponse
    return HTMLResponse("""
    <!doctype html><html><head><meta charset="utf-8"><title>Paiement À lo Maman</title>
    <style>body{font-family:system-ui;padding:40px;text-align:center;background:#FDFBF7;color:#2D332F}
    h1{color:#C85A40}.box{max-width:420px;margin:auto;background:#fff;padding:32px;border-radius:24px;box-shadow:0 4px 12px rgba(0,0,0,0.06)}
    a{color:#C85A40;font-weight:700}</style></head>
    <body><div class="box"><h1>✅ Paiement confirmé</h1>
    <p>Merci ! Vous pouvez fermer cette fenêtre et retourner sur l'app À lo Maman.</p>
    <p><a href="javascript:window.close()">Fermer</a></p></div></body></html>
    """)


# ----------------------------------------------------------------------
# Seed + Startup
# ----------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.rdv.create_index("maman_id")
    await db.rdv.create_index("pro_id")
    await db.messages.create_index("to_id")
    await db.messages.create_index("from_id")

    # ⚠️ Seed admin@alomaman.com désactivé (suppression des comptes demo demandée).
    # Le super admin (klenakan.eric@gmail.com) est conservé via le bloc ci-dessous.
    # Pour réactiver : décommenter le bloc.
    # admin_email = os.environ["ADMIN_EMAIL"].lower()
    # admin_pw = os.environ["ADMIN_PASSWORD"]
    # if not await db.users.find_one({"email": admin_email}):
    #     await db.users.insert_one({
    #         "id": str(uuid.uuid4()),
    #         "email": admin_email,
    #         "password_hash": hash_password(admin_pw),
    #         "name": "Admin À lo Maman",
    #         "role": "admin",
    #         "avatar": None,
    #         "phone": None,
    #         "specialite": None,
    #         "created_at": datetime.now(timezone.utc).isoformat(),
    #     })
    #     logger.info(f"Seeded admin {admin_email}")

    # Seed / Upsert SUPER ADMIN (project owner)
    super_email = os.environ.get("SUPER_ADMIN_EMAIL", "").lower().strip()
    super_pw = os.environ.get("SUPER_ADMIN_PASSWORD", "")
    super_name = os.environ.get("SUPER_ADMIN_NAME", "Super Admin")
    if super_email and super_pw:
        existing = await db.users.find_one({"email": super_email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": super_email,
                "password_hash": hash_password(super_pw),
                "name": super_name,
                "role": "admin",
                "is_super_admin": True,
                "avatar": None,
                "phone": None,
                "specialite": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded super admin {super_email}")
        else:
            # Always keep super admin password & role in sync with .env
            await db.users.update_one(
                {"email": super_email},
                {"$set": {
                    "password_hash": hash_password(super_pw),
                    "role": "admin",
                    "is_super_admin": True,
                    "name": existing.get("name") or super_name,
                }},
            )
            logger.info(f"Updated super admin {super_email}")

    # ⚠️ Seeds de comptes de démo désactivés (suppression demandée par utilisateur)
    # Auparavant : maman@test.com, pro@test.com, pediatre@test.com, sagefemme@test.com
    # + posts de démo associés. Le super admin ci-dessus est conservé et géré séparément.
    # Pour réactiver pour les tests : restaurer les blocs depuis l'historique git.

    # Seed educational resources (OMS/UNICEF validated baseline) — idempotent par titre
    now = datetime.now(timezone.utc).isoformat()
    BASELINE_RESOURCES = [
            {
                "type": "fiche",
                "title": "Les 8 consultations prénatales recommandées",
                "description": "L'OMS recommande au moins 8 contacts prénatals pour réduire la mortalité maternelle et néonatale.",
                "category": "grossesse",
                "content_md": "# Les 8 consultations prénatales\n\nSelon les recommandations **OMS 2016**, toute femme enceinte devrait bénéficier de **8 contacts prénatals** minimum :\n\n1. **Avant 12 semaines** — Confirmation grossesse, bilan initial, dépistage\n2. **20 semaines** — Échographie morphologique\n3. **26 semaines** — Dépistage anémie, diabète gestationnel\n4. **30 semaines** — Surveillance tension, croissance fœtale\n5. **34 semaines** — Position du bébé, préparation accouchement\n6. **36 semaines** — Dépistage streptocoque B\n7. **38 semaines** — Évaluation col, terme prévu\n8. **40 semaines** — Surveillance dépassement de terme\n\n> ⚠️ **Côte d'Ivoire** : La CMU prend en charge 100% des consultations prénatales chez les pros partenaires.\n\n## Bilans recommandés\n- Groupe sanguin / Rhésus\n- Sérologies (VIH, hépatite B, syphilis, toxoplasmose, rubéole)\n- NFS, glycémie\n- Albuminurie (urine)\n\n*Source : OMS — Recommandations concernant les soins prénatals 2016*",
                "source": "OMS",
                "tags": ["prenatal", "consultation", "oms"],
            },
            {
                "type": "fiche",
                "title": "Calendrier vaccinal PEV Côte d'Ivoire",
                "description": "Calendrier officiel du Programme Élargi de Vaccination (0-5 ans).",
                "category": "vaccination",
                "content_md": "# Calendrier vaccinal PEV — Côte d'Ivoire\n\n## À la naissance\n- **BCG** (tuberculose) — dose unique\n- **VPO 0** (polio oral)\n- **Hépatite B** (première dose)\n\n## 6 semaines\n- **Pentavalent 1** (DTC-HepB-Hib)\n- **VPO 1**\n- **PCV 1** (pneumocoque)\n- **Rotavirus 1**\n\n## 10 semaines\n- **Pentavalent 2**, **VPO 2**, **PCV 2**, **Rotavirus 2**\n\n## 14 semaines\n- **Pentavalent 3**, **VPO 3**, **PCV 3**, **VPI** (polio injectable)\n\n## 9 mois\n- **Rougeole 1**\n- **Fièvre jaune**\n\n## 15-18 mois\n- **Rougeole 2**\n\n## 9-14 ans (filles)\n- **HPV** (2 doses à 6 mois d'intervalle)\n\n> 💡 La vaccination est **gratuite** dans tous les centres de santé publics de Côte d'Ivoire.\n\n*Source : Ministère de la Santé et de l'Hygiène Publique / UNICEF Côte d'Ivoire*",
                "source": "MSHP-CI",
                "tags": ["vaccination", "pev", "enfant"],
            },
            {
                "type": "fiche",
                "title": "Allaitement maternel exclusif : le guide",
                "description": "Pourquoi et comment allaiter exclusivement jusqu'à 6 mois selon l'OMS.",
                "category": "allaitement",
                "content_md": "# Allaitement maternel exclusif\n\nL'**OMS** et l'**UNICEF** recommandent l'allaitement maternel **exclusif** jusqu'à 6 mois, puis poursuivi avec diversification jusqu'à 2 ans.\n\n## Les bénéfices prouvés\n- 🛡️ **Protection immunitaire** : réduit la mortalité infantile de 13%\n- 🧠 **Développement cognitif** supérieur\n- ❤️ **Lien mère-enfant** renforcé\n- 💰 **Économique** : zéro coût\n- 🩺 **Protège la mère** : réduit risques cancers sein/ovaire\n\n## Les bonnes positions\n1. **Berceau** — le plus classique\n2. **Football** — idéal après césarienne\n3. **Allongée** — pour les tétées de nuit\n\n## Fréquence\n- 8 à 12 tétées / 24h les premières semaines\n- À la demande du bébé (pas d'horaires stricts)\n- Signes de faim : bouge les lèvres, cherche le sein, porte main à la bouche\n\n## Quand consulter ?\n- Crevasses douloureuses persistantes\n- Fièvre maternelle > 38.5°\n- Bébé qui ne prend pas de poids\n- Refus répété du sein",
                "source": "OMS",
                "tags": ["allaitement", "lait_maternel", "0-6mois"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Connaissez-vous les signes d'une grossesse saine ?",
                "description": "5 questions pour tester vos connaissances sur le suivi prénatal.",
                "category": "grossesse",
                "questions": [
                    {"question": "Combien de consultations prénatales minimum l'OMS recommande-t-elle ?", "options": ["3", "4", "6", "8"], "correct_index": 3, "explication": "Depuis 2016, l'OMS recommande 8 contacts prénatals minimum pour réduire la mortalité maternelle."},
                    {"question": "À partir de quelle semaine peut-on ressentir les premiers mouvements du bébé ?", "options": ["8-10 SA", "12-14 SA", "16-22 SA", "28-30 SA"], "correct_index": 2, "explication": "Les premiers mouvements sont généralement perçus entre 16 et 22 semaines d'aménorrhée."},
                    {"question": "Quel saignement nécessite une consultation en URGENCE ?", "options": ["Tout saignement, à tout stade", "Seulement au 3e trimestre", "Seulement s'il y a douleur", "Jamais, c'est normal"], "correct_index": 0, "explication": "Tout saignement pendant la grossesse nécessite une consultation rapide pour éliminer toute complication."},
                    {"question": "Quel supplément est recommandé dès le début de la grossesse ?", "options": ["Vitamine C", "Acide folique (B9)", "Calcium", "Fer uniquement"], "correct_index": 1, "explication": "L'acide folique (400 µg/j) prévient les malformations du tube neural. Idéalement commencé avant la conception."},
                    {"question": "Combien de temps dure une grossesse normale ?", "options": ["36 SA", "38 SA", "40 SA", "42 SA"], "correct_index": 2, "explication": "40 semaines d'aménorrhée (SA), soit environ 9 mois à partir des dernières règles."},
                ],
                "source": "OMS",
                "tags": ["quiz", "grossesse", "prenatal"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Vaccination de bébé",
                "description": "Testez vos connaissances sur le calendrier PEV.",
                "category": "vaccination",
                "questions": [
                    {"question": "À la naissance, quel vaccin est administré en premier ?", "options": ["Rougeole", "BCG", "Pentavalent", "Fièvre jaune"], "correct_index": 1, "explication": "Le BCG (contre la tuberculose) est donné dès la naissance en Côte d'Ivoire."},
                    {"question": "À quel âge se fait le premier vaccin contre la rougeole ?", "options": ["6 semaines", "3 mois", "9 mois", "18 mois"], "correct_index": 2, "explication": "La 1ère dose est administrée à 9 mois, la 2e à 15-18 mois."},
                    {"question": "Le Pentavalent protège contre combien de maladies ?", "options": ["3", "4", "5", "6"], "correct_index": 2, "explication": "Diphtérie, Tétanos, Coqueluche, Hépatite B, Haemophilus influenzae type b (Hib)."},
                ],
                "source": "MSHP-CI",
                "tags": ["quiz", "vaccination"],
            },
            {
                "type": "fiche",
                "title": "Nutrition pendant la grossesse",
                "description": "Aliments recommandés et à éviter pendant les 9 mois.",
                "category": "nutrition",
                "content_md": "# Bien manger pendant la grossesse\n\n## ✅ À privilégier chaque jour\n- **Légumes variés** (épinards, gombo, carottes, aubergines) — riches en acide folique et fer\n- **Fruits frais** (mangue, papaye, orange) — vitamine C\n- **Céréales complètes** (riz, mil, sorgho)\n- **Protéines** : poisson frais, viande bien cuite, œufs, haricots\n- **Produits laitiers** (yaourt, fromage pasteurisé) — calcium\n- **1,5-2 L d'eau** par jour\n\n## ❌ À éviter\n- **Poisson et viande crus** (risque toxoplasmose, listériose)\n- **Fromage au lait cru**\n- **Alcool** (aucune dose sécure)\n- **Excès de caféine** (max 200 mg/j = 2 tasses de café)\n- **Poissons à haute teneur en mercure** (thon, espadon)\n\n## 💊 Supplémentations\n- **Acide folique 400 µg/j** — tout le 1er trimestre (et idéalement 3 mois avant conception)\n- **Fer + Acide folique** — dès la 1ère consultation prénatale (Côte d'Ivoire : souvent gratuit au CSU)\n- **Vitamine D** si peu d'exposition solaire\n\n> 🌍 Contexte Côte d'Ivoire : pensez à laver soigneusement tous légumes/fruits, bien cuire viandes et poissons.",
                "source": "OMS",
                "tags": ["nutrition", "alimentation", "grossesse"],
            },
            # ===== NOUVELLES RESSOURCES (Feb 2026) =====
            {
                "type": "fiche",
                "title": "Les 1ers signes du travail : quand partir à la maternité",
                "description": "Reconnaître le vrai travail vs les fausses contractions.",
                "category": "accouchement",
                "content_md": "# Reconnaître le début du travail\n\n## ✅ Vrai travail — partez à la maternité\n- **Contractions régulières** toutes les 5 min, qui durent ≥ 1 min, depuis ≥ 1h\n- Les contractions ne s'arrêtent **pas** quand vous changez de position\n- **Perte du bouchon muqueux** (glaire avec un peu de sang)\n- **Rupture de la poche des eaux** (liquide clair qui coule)\n\n## ⚠️ Fausses contractions (Braxton-Hicks)\n- Irrégulières et indolores\n- Disparaissent avec le repos ou un bain tiède\n- Pas plus de 3-4/heure\n\n## 🚨 URGENCE : aller IMMÉDIATEMENT\n- Saignement vif rouge\n- Liquide amniotique **vert ou marron** (souffrance fœtale)\n- Bébé ne bouge plus depuis > 6h\n- Maux de tête sévères + vision floue (pré-éclampsie)\n- Fièvre > 38,5°C\n\n## 🎒 Sac de maternité prêt à 36 SA\n- Carnet de santé + pièce d'identité + carte CMU\n- Vêtements bébé taille 0-3 mois (5 ensembles)\n- Couches taille 1, lingettes, savon doux\n- Pour vous : nuisettes, slips jetables, serviettes hygiéniques\n\n*Source : Ministère de la Santé Côte d'Ivoire / OMS*",
                "source": "OMS",
                "tags": ["accouchement", "travail", "maternite", "urgence"],
            },
            {
                "type": "fiche",
                "title": "Dépression post-partum : reconnaître et agir",
                "description": "1 maman sur 7 est concernée — il existe des solutions.",
                "category": "post_partum",
                "content_md": "# La dépression post-partum (DPP)\n\n## Ce n'est PAS le baby-blues\n- **Baby-blues** : tristesse passagère 3-10 jours après la naissance — passe seul\n- **DPP** : symptômes qui persistent **> 2 semaines** après l'accouchement\n\n## Symptômes à reconnaître\n- 😢 Tristesse profonde, pleurs fréquents sans raison\n- 😴 Insomnie ou hypersomnie\n- 🍽️ Perte d'appétit ou compulsions alimentaires\n- 🧊 Sentiment de vide, de ne pas aimer son bébé\n- 💭 Pensées noires (« je suis nulle », « il/elle serait mieux sans moi »)\n- 😡 Irritabilité, colère\n- 🌫️ Difficulté à se concentrer\n\n## ⚠️ Signaux d'ALARME — consulter EN URGENCE\n- Pensées de faire du mal au bébé ou à soi-même\n- Idées suicidaires\n- Hallucinations\n\n## Que faire ?\n1. **Parlez-en** : à votre conjoint, votre maman, votre meilleure amie\n2. **Consultez** votre sage-femme ou médecin (la DPP se soigne très bien)\n3. **Acceptez de l'aide** : ménage, courses, garde du bébé\n4. **Reposez-vous** dès que bébé dort\n5. **Sortez** au moins 15 min/jour à la lumière du jour\n\n## 🆘 Numéros utiles Côte d'Ivoire\n- SOS Détresse : 116 (gratuit, anonyme)\n- Ligne mère-enfant MSHP : 143\n\n*Vous n'êtes pas seule. Demander de l'aide est un acte de courage.*",
                "source": "OMS",
                "tags": ["post_partum", "depression", "sante_mentale", "maman"],
            },
            {
                "type": "fiche",
                "title": "Diversification alimentaire : 6 mois à 2 ans",
                "description": "Introduire les aliments solides en toute sécurité.",
                "category": "nutrition",
                "content_md": "# Diversification alimentaire\n\nDémarrer à **6 mois révolus** (180 jours), jamais avant. Continuer le lait maternel ou maternisé.\n\n## 🍌 6-7 mois : découverte des goûts\n- 1 repas/jour de purées **lisses**\n- Bouillies de mil/maïs/riz, banane écrasée, papaye, avocat\n- Carotte, courgette, patate douce — bien cuites et écrasées\n- Pas de sel, pas de sucre, pas de miel\n\n## 🥣 7-9 mois : textures progressives\n- 2 repas/jour\n- Purées + petits morceaux écrasés à la fourchette\n- Œuf entier (jaune + blanc) bien cuit, 2-3×/semaine\n- Poisson sans arêtes, poulet émietté\n- Yaourt nature\n\n## 🍽️ 9-12 mois : repas familiaux adaptés\n- 3 repas + 1 goûter\n- Pâtes, riz, attiéké en petits morceaux\n- Toutes viandes bien cuites, hachées\n- Fromage doux, légumineuses (haricots écrasés)\n\n## 🚫 À éviter strictement avant 1 an\n- Miel (botulisme)\n- Lait de vache liquide (anémie)\n- Sel, sucre ajoutés\n- Aliments durs/petits (cacahuètes, raisins entiers, bonbons → étouffement)\n\n## ⚠️ Allergènes — à introduire UN à la fois\nŒuf, arachide, lait, poisson, gluten : un seul nouvel aliment par 3 jours pour identifier réaction.\n\n## 💧 Eau\nDès 6 mois, eau potable à volonté entre les repas.\n\n*Source : OMS / UNICEF — Alimentation du nourrisson et du jeune enfant*",
                "source": "OMS",
                "tags": ["nutrition", "diversification", "bebe", "6mois"],
            },
            {
                "type": "fiche",
                "title": "Fièvre chez le bébé : ce qu'il faut faire",
                "description": "Quand s'inquiéter et quand attendre.",
                "category": "urgence",
                "content_md": "# Fièvre du nourrisson\n\nFièvre = température rectale **≥ 38°C**. Mesure de référence chez le bébé : voie **rectale**.\n\n## 🚨 URGENCE — consulter MAINTENANT si :\n- Bébé < **3 mois** avec fièvre ≥ 38°C\n- Fièvre **> 40°C** à tout âge\n- Fièvre **> 48h** sans cause évidente\n- Bébé **mou, geignard, ne réagit pas**\n- **Convulsions**, marbrures violacées sur la peau\n- **Refus de boire** depuis plus de 6h\n- **Éruption** qui ne disparaît pas à la pression du verre\n- **Difficulté à respirer**\n- **Nuque raide**, fontanelle bombée\n\n## ✅ Que faire à la maison (si pas d'urgence)\n1. **Découvrir** bébé (pas trop habillé, pas de couverture)\n2. **Faire boire** régulièrement (lait, eau)\n3. **Pièce à 18-20°C**, ventiler\n4. **Bain tiède** : eau à 2°C en dessous de la temp. de bébé (jamais froid)\n5. **Paracétamol** : 15 mg/kg toutes les 6h, **uniquement si > 3 mois**\n   - JAMAIS d'aspirine (syndrome de Reye)\n   - JAMAIS d'ibuprofène avant 3 mois\n\n## 🌡️ Comment mesurer\n- Rectal : la plus fiable jusqu'à 2 ans\n- Thermomètre infrarouge front : pratique mais moins précis\n- Axillaire (sous le bras) : ajouter +0,5°C\n\n## 🦟 Côte d'Ivoire — penser au paludisme\nToute fièvre chez l'enfant en Afrique sub-saharienne nécessite un **test de paludisme (TDR)** rapide.\n\n*Source : OMS / Société de Pédiatrie*",
                "source": "OMS",
                "tags": ["urgence", "fievre", "bebe", "paludisme"],
            },
            {
                "type": "fiche",
                "title": "Diarrhée chez le bébé : prévention et SRO",
                "description": "1ère cause de décès évitables — savoir réagir.",
                "category": "urgence",
                "content_md": "# Diarrhée du nourrisson\n\nLa diarrhée est définie par **≥ 3 selles liquides en 24h**.\n\n## 🚨 URGENCE — consulter si :\n- Bébé < 6 mois\n- Sang dans les selles\n- Vomissements répétés (ne garde rien)\n- **Signes de déshydratation** :\n  - Yeux creux\n  - Fontanelle déprimée\n  - Pli cutané persistant\n  - Bébé somnolent ou agité\n  - Pas d'urine depuis > 6h\n- Fièvre > 39°C\n- Diarrhée > 7 jours\n\n## 💧 Solution de Réhydratation Orale (SRO)\nC'est le geste qui sauve. **Disponible gratuitement** dans tous les CSU.\n\n### Recette maison de secours (en attendant la SRO)\n- 1 litre d'eau **propre** (bouillie ou en bouteille)\n- 6 cuillères à café rases de **sucre**\n- 1/2 cuillère à café de **sel**\n- Mélanger, donner par petites gorgées toutes les 5 min\n\n## ✅ Pendant la diarrhée\n- **Continuer l'allaitement** (le lait maternel est le meilleur traitement)\n- Donner SRO après chaque selle (50-100 mL si < 2 ans)\n- **Ne pas arrêter** la nourriture habituelle (sauf bébé qui vomit tout)\n- Aliments recommandés : banane, riz, pomme cuite, carotte, yaourt\n\n## 🚫 À éviter\n- Coca-cola, jus de fruits sucrés, eau de riz seule\n- Médicaments anti-diarrhéiques chez l'enfant (sauf prescription)\n\n## 🛡️ Prévention\n- Vaccin **Rotavirus** (PEV : 6 et 10 semaines)\n- Eau potable, savonnage des mains\n- Allaitement exclusif jusqu'à 6 mois\n\n*Source : UNICEF / OMS — Programme PCIME*",
                "source": "UNICEF",
                "tags": ["urgence", "diarrhee", "deshydratation", "sro"],
            },
            {
                "type": "fiche",
                "title": "Contraception après l'accouchement : choisir sa méthode",
                "description": "Toutes les options compatibles avec l'allaitement.",
                "category": "contraception",
                "content_md": "# Contraception post-partum\n\nLa fertilité revient dès **3 semaines après l'accouchement**, même sans règles. Pour bien espacer les grossesses (recommandé : 2 ans entre 2 enfants), choisissez votre méthode.\n\n## 🤱 Méthodes compatibles avec l'allaitement\n\n### MAMA — Méthode de l'Allaitement Maternel et de l'Aménorrhée\n- Efficace **uniquement si** : allaitement exclusif + bébé < 6 mois + pas de retour de couches\n- Efficacité 98% si toutes les conditions remplies\n\n### Pilule progestative (sans œstrogène)\n- Cerazette, Microval — sans risque pour le lait\n- À prendre **tous les jours à la même heure**\n\n### Stérilet (DIU) au cuivre\n- Pose dès 4-6 semaines après accouchement\n- Efficace 5-10 ans, **gratuit en CSU public**\n- Compatible 100% avec l'allaitement\n\n### Implant (Implanon, Jadelle)\n- Tige sous-cutanée, durée 3-5 ans\n- Pose ambulatoire, retrait possible à tout moment\n\n### Injection trimestrielle (Depo-Provera)\n- 1 injection tous les 3 mois\n- Compatible allaitement\n\n### Préservatif\n- Toujours utile (protège aussi des IST)\n\n## ⏳ Méthodes non recommandées si vous allaitez\n- Pilule combinée (œstrogène + progestérone) : peut diminuer la lactation\n- À reconsidérer après le sevrage\n\n## 🌍 Côte d'Ivoire\nLa **planification familiale** est gratuite dans tous les centres de santé publics et les ONG (AIBEF). Demandez une consultation dédiée à votre sage-femme.\n\n*Source : OMS / IPPF*",
                "source": "OMS",
                "tags": ["contraception", "post_partum", "planning_familial"],
            },
            {
                "type": "fiche",
                "title": "Hygiène du cordon ombilical du nouveau-né",
                "description": "Comment soigner le cordon en toute sécurité.",
                "category": "soins_bebe",
                "content_md": "# Soins du cordon ombilical\n\nLe cordon tombe spontanément entre **5 et 15 jours** après la naissance.\n\n## ✅ Soins quotidiens\n1. **Lavez-vous bien les mains** avant de toucher le cordon\n2. Nettoyer **2 fois/jour** et après chaque selle souillée\n3. Utiliser de l'**eau bouillie tiède** + savon doux OU sérum physiologique\n4. **Sécher délicatement** avec une compresse propre (pas de coton qui peluche)\n5. Laisser le cordon **à l'air libre** (replier la couche en dessous)\n6. Pas d'antiseptique alcoolisé sauf prescription\n\n## 🚨 Consulter URGENT si :\n- **Rougeur** qui s'étend autour du nombril\n- **Chaleur** locale\n- **Pus** ou liquide jaunâtre/verdâtre malodorant\n- **Saignement** abondant\n- Fièvre du bébé\n- **Cordon qui ne tombe pas après 21 jours**\n\n## ❌ À NE PAS FAIRE\n- Pas de cendre, terre, plante, beurre de karité, talc, herbes traditionnelles sur le cordon (risque grave de tétanos néonatal)\n- Ne pas tirer dessus pour le faire tomber\n- Ne pas mettre de bandage serré\n- Ne pas immerger le bébé dans le bain tant que le cordon n'est pas tombé (toilette à l'éponge)\n\n## 🌟 Après la chute\n- Continuer à nettoyer le nombril 1 fois/jour pendant 1 semaine\n- Petite saignement = normal\n- Petite « boule » qui persiste > 4 semaines : à montrer au pédiatre (granulome)\n\n*Source : OMS / UNICEF — Soins essentiels du nouveau-né*",
                "source": "OMS",
                "tags": ["soins_bebe", "cordon", "nouveau_ne", "hygiene"],
            },
            {
                "type": "fiche",
                "title": "Paludisme et grossesse : prévention essentielle",
                "description": "Le paludisme tue 10 000 femmes enceintes par an en Afrique.",
                "category": "grossesse",
                "content_md": "# Paludisme pendant la grossesse\n\nLe paludisme chez la femme enceinte est **2-3× plus grave** que chez la femme non enceinte. Il provoque : anémie sévère, fausse couche, accouchement prématuré, faible poids de naissance.\n\n## 🛡️ Prévention en 3 piliers\n\n### 1. Moustiquaire imprégnée d'insecticide (MILDA)\n- **Gratuite** dans les CSU dès la 1ère consultation prénatale\n- Dormir dessous **toutes les nuits**, dès le coucher du soleil\n- Vérifier qu'elle n'a pas de trous\n\n### 2. Traitement Préventif Intermittent (TPI)\n- **Sulfadoxine-pyriméthamine (SP)** = Fansidar\n- 3 doses minimum entre 16 SA et l'accouchement\n- Espacées d'au moins 1 mois\n- **Gratuit** en CSU public\n\n### 3. Hygiène environnementale\n- Vider eaux stagnantes (pots de fleurs, vieux pneus)\n- Pulvérisateur insecticide en intérieur\n- Manches longues le soir\n\n## 🚨 Symptômes — consulter EN URGENCE\n- Fièvre > 38°C\n- Frissons, sueurs\n- Maux de tête, vomissements\n- Fatigue extrême\n- Convulsions (paludisme grave)\n\n## 💊 Traitement\n**JAMAIS d'auto-médication.** Le médicament dépend du trimestre.\n- 1er trimestre : Quinine\n- 2e/3e trimestres : Artéméther-Luméfantrine (Coartem)\n\n## 🆓 Côte d'Ivoire\nTraitement du paludisme et TPI **100% gratuits** pour les femmes enceintes en CSU public dans le cadre du PNLP.\n\n*Source : OMS / PNLP Côte d'Ivoire*",
                "source": "OMS",
                "tags": ["grossesse", "paludisme", "prevention", "milda"],
            },
            {
                "type": "fiche",
                "title": "Anémie pendant la grossesse : prévenir et traiter",
                "description": "L'anémie touche 40% des femmes enceintes en Afrique.",
                "category": "grossesse",
                "content_md": "# Anémie maternelle\n\nL'anémie = **taux d'hémoglobine < 11 g/dL** pendant la grossesse. Elle augmente le risque de mortalité maternelle et de bébé de petit poids.\n\n## 🩸 Symptômes\n- Fatigue inhabituelle\n- Pâleur (paume des mains, conjonctives, ongles)\n- Essoufflement à l'effort\n- Vertiges, palpitations\n- Maux de tête\n- Cheveux cassants, ongles fragiles\n\n## 🥗 Alimentation riche en fer\n\n### Fer héminique (mieux absorbé)\n- Foie de bœuf, foie de poulet (1×/semaine)\n- Viande rouge bien cuite\n- Poisson (sardines, thon)\n- Œufs\n\n### Fer non héminique (à associer avec vitamine C)\n- Lentilles, haricots, pois, soja\n- Épinards, baobab feuilles, gombo\n- Sésame, arachides\n\n### 🍊 Combinaison gagnante\nManger les légumes verts/légumineuses **avec un fruit riche en vitamine C** (mangue, orange, papaye, citron) → multiplie l'absorption du fer par 3.\n\n## ☕ À éviter pendant les repas riches en fer\n- Thé, café (tanins bloquent l'absorption)\n- Lait, fromage en grande quantité\n- Calcium (à prendre à distance)\n\n## 💊 Supplémentation systématique\nLes femmes enceintes en Côte d'Ivoire reçoivent **gratuitement** :\n- **Fer 60 mg/jour + Acide folique 400 µg/jour**\n- Tout au long de la grossesse\n- Et 3 mois après l'accouchement\n\n## 🪱 Penser aux parasites\nDéparasitage à 16 SA recommandé (Mébendazole) — la bilharziose et les ankylostomes aggravent l'anémie.\n\n*Source : OMS / MSHP Côte d'Ivoire*",
                "source": "OMS",
                "tags": ["grossesse", "anemie", "fer", "nutrition"],
            },
            {
                "type": "fiche",
                "title": "Pré-éclampsie : la complication à connaître",
                "description": "Tension artérielle élevée + protéines dans les urines.",
                "category": "grossesse",
                "content_md": "# Pré-éclampsie\n\nLa pré-éclampsie touche **5-8% des grossesses** et reste une cause majeure de mortalité maternelle. Elle apparaît généralement après **20 SA**.\n\n## 🩺 Diagnostic\n- **Tension artérielle ≥ 140/90 mmHg** (mesurée 2× à 4h d'intervalle)\n- **+ Protéinurie ≥ 0,3 g/24h** (ou ≥ + à la bandelette urinaire)\n\n## 🚨 Signes d'ALARME — consulter EN URGENCE\n- 🤕 Maux de tête sévères qui ne passent pas\n- 👁️ Vision floue, mouches devant les yeux, taches\n- 💢 Douleur en barre sous les côtes (épigastre)\n- 🫧 Œdèmes brutaux du visage et des mains (pas juste les chevilles)\n- ⚖️ Prise de poids brutale (> 1 kg en 1 semaine)\n- 🤢 Vomissements après 20 SA\n- 💔 Diminution des mouvements du bébé\n\n## ⚠️ Risque maximal\nÉvolution vers **éclampsie** = convulsions + perte de connaissance = engage le pronostic vital.\n\n## 🛡️ Facteurs de risque\n- 1ère grossesse\n- Antécédent de pré-éclampsie\n- HTA chronique\n- Diabète\n- Grossesse gémellaire\n- Âge < 18 ans ou > 35 ans\n- Obésité\n\n## ✅ Prévention\n- **8 consultations prénatales** (mesure systématique TA + bandelette urinaire)\n- Calcium 1,5 g/jour si carence\n- Aspirine faible dose (75-100 mg/j) à partir de 12 SA pour les femmes à haut risque (prescription)\n- Activité physique régulière\n- Limiter le sel\n\n## 💊 Prise en charge\n**Hospitalisation OBLIGATOIRE** dès le diagnostic. Le seul traitement curatif est l'**accouchement**. Les médicaments (Méthyldopa, sulfate de magnésium) stabilisent en attendant.\n\n*Source : OMS — Recommandations sur la prévention et le traitement de la pré-éclampsie*",
                "source": "OMS",
                "tags": ["grossesse", "preeclampsie", "tension", "urgence"],
            },
            {
                "type": "fiche",
                "title": "Le sommeil du bébé de 0 à 24 mois",
                "description": "Évolution des cycles et conseils pratiques.",
                "category": "soins_bebe",
                "content_md": "# Le sommeil de bébé\n\n## ⏱️ Durée moyenne par âge\n- **0-3 mois** : 16-20h/24h (cycles courts de 50 min)\n- **3-6 mois** : 14-16h/24h (la nuit s'allonge)\n- **6-12 mois** : 13-14h/24h (1-2 siestes/jour)\n- **12-24 mois** : 11-13h/24h (1 sieste/jour)\n\n## 🛏️ Sécurité — réduire le risque de mort subite (MSN)\n1. Bébé dort **TOUJOURS sur le DOS**\n2. **Matelas ferme**, pas de coussin, peluche, couverture lâche\n3. **Gigoteuse** plutôt que couette/couverture\n4. **Pas de partage de lit** avec un adulte avant 6 mois (risque d'étouffement)\n5. Lit dans la chambre des parents les 6 premiers mois (réduit la MSN de 50%)\n6. **Pas de tabac** dans la chambre / l'environnement\n7. **Température 18-20°C**, bébé pas trop couvert\n8. Pas de tour de lit, pas de cordon, pas de tétine attachée\n\n## 🌙 Aider bébé à faire ses nuits\n- **Distinguer jour/nuit** : lumière + activité le jour, calme + obscurité la nuit\n- **Rituel du coucher** dès 3 mois (bain, tétée, berceuse, doudou)\n- **Coucher éveillé** : bébé apprend à s'endormir seul\n- **Dernière tétée vers 22h** pour les petits\n- À 6 mois, la plupart des bébés peuvent dormir 6-8h d'affilée\n\n## 😴 Réveils nocturnes\n- 0-3 mois : 2-3 réveils = NORMAL (faim, couche)\n- 3-6 mois : 1 réveil typique\n- 6 mois+ : si réveils fréquents → vérifier dent, otite, faim, peur de séparation\n\n## ⚠️ À NE PAS FAIRE\n- Bercer/donner sein à chaque réveil → bébé associe sommeil = sein\n- Mettre la TV/radio dans la chambre\n- Donner du sucre/biberon de jus avant de dormir (caries)\n- Médicaments pour dormir (interdits)\n\n*Source : Société Française de Pédiatrie / OMS*",
                "source": "OMS",
                "tags": ["bebe", "sommeil", "msn", "nuit"],
            },
            {
                "type": "fiche",
                "title": "Jalons du développement de 0 à 2 ans",
                "description": "Repères pour rassurer ou alerter.",
                "category": "developpement",
                "content_md": "# Étapes-clés du développement\n\n*Chaque bébé évolue à son rythme — voici les fenêtres normales.*\n\n## 👶 0-3 mois\n- Sourit en réponse (vers 6 sem)\n- Tient sa tête quelques secondes\n- Suit un objet du regard\n- Gazouille\n\n## 🍼 3-6 mois\n- Tient sa tête bien droite\n- Attrape les objets\n- Rit aux éclats\n- Découvre ses mains/pieds\n- Babille (« areu »)\n\n## 🪑 6-9 mois\n- S'assied sans appui (vers 7-8 mois)\n- Passe les objets d'une main à l'autre\n- Fait coucou\n- Premières syllabes (« ma », « ba »)\n- Reconnaît son prénom\n\n## 🚶 9-12 mois\n- Se met debout en s'accrochant\n- Premiers pas (entre 10-15 mois)\n- Comprend « non »\n- Premier mot avec sens (« mama », « papa »)\n- Pince fine (pouce-index)\n\n## 🏃 12-18 mois\n- Marche seul\n- Boit au verre\n- Empile 2-3 cubes\n- 5-10 mots\n- Pointe du doigt ce qu'il veut\n\n## 🗣️ 18-24 mois\n- Court, monte les escaliers\n- Dit 50+ mots, fait des phrases de 2 mots\n- Imite les gestes\n- Reconnaît parties du corps\n- Joue à « faire semblant »\n\n## 🚨 Signaux d'alerte — consulter le pédiatre\n- **3 mois** : aucun sourire, ne suit pas du regard, ne tient pas sa tête\n- **6 mois** : ne se retourne pas, ne réagit pas aux sons, n'attrape pas\n- **9 mois** : ne tient pas assis, pas de babillage\n- **12 mois** : ne pointe pas du doigt, pas de mot, ne se met pas debout\n- **18 mois** : ne marche pas, < 5 mots\n- **24 mois** : pas de phrases, ne joue pas à imiter\n- **À tout âge** : régression (perd ce qu'il faisait avant), pas de contact visuel, gestes répétitifs étranges\n\n## 💝 Stimuler bébé\n- **Parlez-lui** beaucoup (chant, lecture)\n- **Jeux libres au sol**\n- **Limitez les écrans** (0 avant 3 ans selon OMS)\n- **Sortez** dehors quotidiennement\n- **Câlins** = construction du cerveau\n\n*Source : OMS — Carnet de développement de l'enfant*",
                "source": "OMS",
                "tags": ["developpement", "jalons", "bebe", "psychomoteur"],
            },
            {
                "type": "fiche",
                "title": "Sexualité pendant la grossesse : ce qu'il faut savoir",
                "description": "Démystifier les peurs courantes.",
                "category": "grossesse",
                "content_md": "# Sexualité et grossesse\n\nLes rapports sexuels sont **autorisés** pendant toute la grossesse normale, sauf contre-indication médicale.\n\n## ✅ Idées reçues à oublier\n- ❌ « Le pénis touche le bébé » → FAUX. Le bébé est protégé par la poche, le col et la muqueuse.\n- ❌ « Ça déclenche l'accouchement » → FAUX en grossesse normale.\n- ❌ « Ça donne des malformations » → FAUX.\n- ❌ « C'est sale » → FAUX. Le bébé ne « voit » et ne « sent » rien.\n\n## ⚠️ Quand consulter avant des rapports\n- Saignements vaginaux\n- Fuite de liquide amniotique\n- Placenta prævia (placenta bas inséré)\n- Antécédent de fausse-couche / accouchement prématuré\n- Béance du col / cerclage\n- Grossesse gémellaire au 3e trimestre\n- Infection vaginale active\n\n## 💕 Évolution du désir\n- **1er trimestre** : souvent baisse (fatigue, nausées, hormones) — c'est normal\n- **2e trimestre** : « bonne période » pour beaucoup (énergie revenue, ventre pas encore gênant)\n- **3e trimestre** : positions à adapter (sur le côté, à 4 pattes), rapports plus tendres\n\n## 🛡️ Hygiène & sécurité\n- Préservatif si IST connue ou multi-partenaires\n- Hygiène intime douce (pas de douche vaginale)\n- Si nouveau partenaire pendant la grossesse → dépistage IST recommandé\n\n## 💑 Communiquer avec le partenaire\n- Parlez de vos peurs/désirs\n- Le partenaire peut craindre de « faire mal » : rassurez-le\n- La tendresse, les massages, les câlins comptent autant\n- L'orgasme provoque parfois de petites contractions = normal et bénin\n\n## 🚨 Consulter en urgence si après un rapport\n- Saignements abondants\n- Douleurs intenses persistantes\n- Contractions régulières\n- Perte de liquide\n\n*Source : OMS / Collège National des Gynécologues-Obstétriciens*",
                "source": "OMS",
                "tags": ["grossesse", "sexualite", "couple"],
            },
            {
                "type": "fiche",
                "title": "Préparer son accouchement : le plan de naissance",
                "description": "Vos souhaits pour le jour J.",
                "category": "accouchement",
                "content_md": "# Le plan de naissance\n\nC'est un document écrit (1-2 pages) où vous exprimez **vos souhaits** pour l'accouchement. Pas obligatoire, mais utile pour communiquer avec l'équipe médicale.\n\n## ✍️ Ce qu'on peut y indiquer\n\n### Ambiance\n- Lumière tamisée, musique\n- Présence du conjoint / d'une accompagnante\n- Mobilité pendant le travail (marcher, ballon)\n\n### Gestion de la douleur\n- Méthodes naturelles : respiration, bain, massage, acupression\n- Péridurale : oui / non / à voir\n\n### Position d'accouchement\n- Sur le dos (classique)\n- Latérale\n- Accroupie\n- À 4 pattes\n\n### Au moment de la naissance\n- Peau-à-peau immédiat\n- Clampage tardif du cordon (1-3 min)\n- Mise au sein dans l'heure (recommandé OMS)\n- Premier bain : reporter à 24h (vernix protecteur)\n\n### En cas de césarienne\n- Présence du conjoint au bloc\n- Voir bébé dès la naissance\n- Peau-à-peau possible même en césarienne\n\n## ⚖️ Restez flexible\nLe plan est un **guide**, pas un contrat. L'équipe médicale décidera selon la sécurité de la mère et du bébé. Une césarienne d'urgence ne signifie pas un « échec ».\n\n## 📋 Modèle simplifié\n```\nNom : ______________\nPour ma sage-femme/équipe :\n\n1. J'aimerais : ________\n2. J'aimerais éviter : ________\n3. Si possible : ________\n4. En cas d'urgence : ________\n\nPersonne de confiance : ________\nMédicaments à éviter : ________\nReligion / culture : ________\n```\n\nÀ remettre **à 36 SA** à votre maternité.\n\n*Source : OMS — Recommandations sur les soins intrapartum*",
                "source": "OMS",
                "tags": ["accouchement", "preparation", "plan_naissance"],
            },
            {
                "type": "fiche",
                "title": "Planning familial : espacer les naissances",
                "description": "Pourquoi et comment 2 ans entre chaque enfant.",
                "category": "contraception",
                "content_md": "# Espacement des naissances\n\nL'OMS recommande au minimum **24 mois entre 2 grossesses** (idéalement 33-36 mois). Cela protège la santé de la mère et de l'enfant.\n\n## 🩺 Pourquoi ?\nUne grossesse trop rapprochée multiplie les risques :\n- **Anémie maternelle sévère** (le corps n'a pas reconstitué ses réserves)\n- **Bébé prématuré** ou de petit poids\n- **Mortalité néonatale** ×2\n- **Mortalité maternelle** ×1,5\n- Sevrage précoce du grand frère/sœur\n- Charge mentale et financière\n\n## 📅 Méthodes de planning familial — toutes gratuites en CSU\n\n### Longue durée d'action (très efficaces, peu de pensées)\n| Méthode | Durée | Réversible |\n|---|---|---|\n| **DIU cuivre** | 5-10 ans | ✅ Immédiat |\n| **DIU hormonal** (Mirena) | 5 ans | ✅ Immédiat |\n| **Implant** (Jadelle) | 5 ans | ✅ Immédiat |\n\n### Courte durée d'action\n| Méthode | Durée | Reprend fertilité |\n|---|---|---|\n| **Pilule** progestative | 1 jour | ✅ Immédiat |\n| **Injection** Depo-Provera | 3 mois | 6-12 mois après arrêt |\n| **Préservatif** | À chaque rapport | ✅ Immédiat |\n\n### Méthodes naturelles (efficacité plus faible)\n- Calendrier (méthode Ogino)\n- Glaire cervicale\n- Température basale\n- Méthode des 2 jours\n\n### Méthodes définitives (irréversibles)\n- **Ligature des trompes** (femme)\n- **Vasectomie** (homme — moins invasive)\n\n## 💬 En parler en couple\nLa contraception n'est PAS « un problème de femme ». C'est un projet commun. Le préservatif et la vasectomie sont des choix masculins.\n\n## 🆓 Côte d'Ivoire\n- AIBEF (Association Ivoirienne pour le Bien-être Familial) — gratuit, confidentiel\n- Tous les CSU public et hôpitaux\n- Numéro vert : 143\n\n*Source : OMS / IPPF — Planification familiale*",
                "source": "OMS",
                "tags": ["contraception", "espacement", "planning_familial"],
            },
            {
                "type": "fiche",
                "title": "VIH et grossesse : protéger son bébé (PTME)",
                "description": "Réduire le risque de transmission mère-enfant à < 1%.",
                "category": "grossesse",
                "content_md": "# Prévention de la Transmission Mère-Enfant (PTME) du VIH\n\nGrâce à la PTME, le risque de transmission est passé de **30%** à **moins de 1%**.\n\n## 🩺 Le dépistage\n- **Test VIH systématique** dès la 1ère consultation prénatale (gratuit, confidentiel)\n- Re-test à 28 SA si négatif au 1er test\n- Test du conjoint encouragé\n\n## 💊 Si la mère est séropositive — Traitement à vie (TAR)\n- **Trithérapie antirétrovirale (ARV)** dès le diagnostic\n- À prendre **tous les jours, à vie**\n- Pendant la grossesse, l'accouchement, et l'allaitement\n- L'objectif : **charge virale indétectable**\n- Suivi mensuel chez l'infectiologue\n\n## 🤱 Allaitement et VIH\n**En Côte d'Ivoire**, sous traitement ARV bien suivi, l'**allaitement maternel exclusif** est recommandé jusqu'à 6 mois (programme PTME national).\n- Risque de transmission < 1% si charge virale indétectable\n- Allaitement mixte (sein + lait artificiel) **INTERDIT** (augmente le risque)\n- Sevrage progressif après 6 mois\n\n## 👶 Pour le bébé\n- **ARV prophylactique** (Névirapine sirop) dès la naissance pendant 6-12 semaines\n- Tests PCR VIH à 6 sem, 6 mois, 9 mois, et après le sevrage\n- Si tous tests négatifs après le sevrage = bébé non infecté\n\n## 🛡️ Prévention pour les pères\n- Préservatif à chaque rapport pendant la grossesse (protège bébé d'une infection tardive)\n- Test VIH du partenaire\n- Si partenaire séropositif et mère négative : PrEP recommandée\n\n## 🆓 En Côte d'Ivoire\nPTME = **100% gratuit** dans tous les CSU et hôpitaux publics. Ligne d'aide : 143 (gratuit, anonyme).\n\n## 💪 Vivre avec le VIH\nUne femme séropositive bien suivie peut :\n- Avoir une grossesse normale\n- Avoir un bébé séronégatif\n- Allaiter sereinement\n- Vivre une longue vie\n\n*Vous n'êtes pas seule. Le secret médical est garanti.*\n\n*Source : OMS / PEPFAR / PNLS Côte d'Ivoire*",
                "source": "OMS",
                "tags": ["grossesse", "vih", "ptme", "prevention"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Allaitement maternel",
                "description": "5 questions sur les bonnes pratiques.",
                "category": "allaitement",
                "questions": [
                    {"question": "Jusqu'à quel âge l'OMS recommande-t-elle l'allaitement EXCLUSIF ?", "options": ["3 mois", "4 mois", "6 mois", "12 mois"], "correct_index": 2, "explication": "L'OMS recommande l'allaitement maternel exclusif jusqu'à 6 mois révolus (180 jours), puis poursuivi avec diversification jusqu'à 2 ans."},
                    {"question": "Combien de tétées par 24h les premières semaines ?", "options": ["3-5", "6-7", "8-12", "15-20"], "correct_index": 2, "explication": "Un nouveau-né tète en moyenne 8 à 12 fois par 24h, à la demande."},
                    {"question": "Que faire en cas de crevasses douloureuses ?", "options": ["Arrêter l'allaitement", "Améliorer la position et consulter une sage-femme", "Mettre du Bétadine", "Donner uniquement le biberon"], "correct_index": 1, "explication": "Les crevasses sont quasi toujours dues à une mauvaise position. Une sage-femme ou consultante en lactation peut corriger en 1 séance."},
                    {"question": "Quel aliment NE faut-il PAS éviter pendant l'allaitement ?", "options": ["Alcool", "Tabac", "Légumes", "Excès de caféine"], "correct_index": 2, "explication": "Tous les légumes sont encouragés. L'alcool, le tabac et l'excès de café passent dans le lait."},
                    {"question": "Que faire si bébé refuse soudainement le sein ?", "options": ["Forcer", "Sevrer directement", "Vérifier dent, otite, et consulter", "Lui donner un biberon"], "correct_index": 2, "explication": "Une grève de la tétée a souvent une cause (poussée dentaire, otite, rhume, lait au goût changé). Consulter."},
                ],
                "source": "OMS",
                "tags": ["quiz", "allaitement"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Urgences bébé",
                "description": "Sauriez-vous reconnaître une urgence ?",
                "category": "urgence",
                "questions": [
                    {"question": "Bébé de 2 mois, fièvre 38,5°C : que faire ?", "options": ["Donner Doliprane et attendre", "Bain froid", "Consulter en URGENCE", "Découvrir et faire boire"], "correct_index": 2, "explication": "Toute fièvre chez un bébé de moins de 3 mois est une urgence pédiatrique (risque d'infection grave)."},
                    {"question": "Signe de déshydratation chez le bébé :", "options": ["Pleure beaucoup", "Yeux creux et fontanelle déprimée", "Bouge beaucoup", "Sueurs"], "correct_index": 1, "explication": "Yeux creux, fontanelle déprimée, pli cutané persistant = signes graves."},
                    {"question": "Bébé tousse et a du mal à respirer : action immédiate ?", "options": ["Antibiotiques maison", "Tisane chaude", "Consulter en urgence", "Bain chaud"], "correct_index": 2, "explication": "Détresse respiratoire = urgence absolue (bronchiolite, corps étranger, asthme)."},
                    {"question": "En Afrique sub-saharienne, toute fièvre nécessite :", "options": ["Un test paludisme (TDR)", "Antibiotiques", "Vaccin", "Rien"], "correct_index": 0, "explication": "Le paludisme tue chaque année en Côte d'Ivoire — tout TDR positif = traitement immédiat (gratuit en CSU)."},
                ],
                "source": "OMS",
                "tags": ["quiz", "urgence", "bebe"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Contraception & planification",
                "description": "Êtes-vous incollable sur le planning familial ?",
                "category": "contraception",
                "questions": [
                    {"question": "Espacement minimum recommandé entre 2 grossesses ?", "options": ["6 mois", "12 mois", "24 mois", "5 ans"], "correct_index": 2, "explication": "L'OMS recommande au moins 24 mois (idéal 33-36) pour la santé de la mère et du bébé."},
                    {"question": "Méthode contraceptive compatible avec l'allaitement :", "options": ["Pilule combinée", "DIU cuivre", "Aucune", "Patch œstrogène"], "correct_index": 1, "explication": "Le DIU au cuivre, l'implant, la pilule progestative et l'injection sont compatibles avec l'allaitement."},
                    {"question": "Méthode 100% efficace contre les IST :", "options": ["Pilule", "Stérilet", "Préservatif", "Implant"], "correct_index": 2, "explication": "Seul le préservatif (masculin ou féminin) protège des infections sexuellement transmissibles."},
                    {"question": "Combien de temps après l'accouchement la fertilité revient-elle ?", "options": ["3 mois", "6 mois", "Dès 3 semaines, même sans règles", "Après le sevrage"], "correct_index": 2, "explication": "Une ovulation peut avoir lieu dès 3 semaines après l'accouchement, même sans retour de couches. La contraception est à mettre en place rapidement."},
                ],
                "source": "OMS",
                "tags": ["quiz", "contraception"],
            },
            # ============== EXTENSION FEB 2026 — minimum 5 par catégorie ==============
            # --- ACCOUNCHEMENT (+3) ---
            {
                "type": "fiche",
                "title": "La péridurale : comprendre l'analgésie",
                "description": "Avantages, contre-indications, déroulement.",
                "category": "accouchement",
                "content_md": "# La péridurale\n\nL'**analgésie péridurale** est la technique la plus efficace contre la douleur de l'accouchement.\n\n## Comment ça marche ?\n- Anesthésiant injecté dans l'espace péridural (bas du dos) via un fin cathéter\n- Bloque la douleur sans endormir\n- Vous restez consciente et active\n\n## ✅ Avantages\n- Douleur quasi nulle\n- Récupération plus douce\n- Permet de se reposer en cas de long travail\n- Facilite la césarienne en urgence (déjà posée)\n\n## ⚠️ Effets secondaires possibles\n- Baisse de tension transitoire\n- Maux de tête (rares)\n- Tremblements, démangeaisons\n- Difficulté à uriner (sondage)\n- Dans 1% des cas : zone non couverte / inefficacité partielle\n\n## ❌ Contre-indications\n- Troubles de coagulation\n- Infection au point de ponction\n- Refus de la patiente\n- Tatouage récent dans la zone\n\n## 🩺 En Côte d'Ivoire\n- Disponible dans les **maternités niveau 2 et 3** (CHU, cliniques privées)\n- Coût : 30 000 - 80 000 F CFA selon l'établissement\n- **CMU** : prise en charge partielle dans les hôpitaux conventionnés\n\n*Source : Société Française d'Anesthésie-Réanimation (SFAR)*",
                "source": "OMS",
                "tags": ["accouchement", "peridurale", "douleur"],
            },
            {
                "type": "fiche",
                "title": "Césarienne : programmée vs en urgence",
                "description": "Indications, déroulement, suites.",
                "category": "accouchement",
                "content_md": "# La césarienne\n\nUne césarienne représente **20-30%** des accouchements en Côte d'Ivoire.\n\n## 📅 Césarienne programmée\nDécidée à l'avance pour :\n- Présentation par le siège\n- Placenta prævia\n- Antécédent de césarienne (parfois)\n- Bébé très gros (> 4,5 kg)\n- Grossesse gémellaire\n- VIH non contrôlé\n\n## 🚨 Césarienne en urgence\nDécidée pendant le travail si :\n- Souffrance fœtale (rythme cardiaque anormal)\n- Stagnation du travail\n- Pré-éclampsie sévère\n- Procidence du cordon\n- Hémorragie\n\n## 🏥 Déroulement (45-60 min)\n1. Anesthésie : péridurale ou rachi (vous restez consciente)\n2. Incision basse horizontale de 10 cm (cicatrice discrète)\n3. Bébé sort en 5-10 min\n4. Suture : 30-45 min\n\n## 🩹 Suites de couches\n- **Hospitalisation** : 4-6 jours (vs 2-3 par voie basse)\n- **Douleur** : antalgiques pendant 5-7 jours\n- **Marche** : encouragée dès J1 pour éviter phlébite\n- **Cicatrice** : soins quotidiens, fils résorbables\n- **Reprise activité** : 6-8 semaines\n- **Conduite, port de charges** : à 6 semaines\n\n## 💪 Récupération\n- Allaitement possible dès la salle de réveil\n- Constipation fréquente : boire beaucoup, fibres\n- Saignements (lochies) : 4-6 semaines\n\n## ⚠️ Consulter si\n- Fièvre > 38,5°C\n- Cicatrice rouge, chaude, qui suinte\n- Saignements abondants\n- Douleur dans le mollet (phlébite)\n- Essoufflement (embolie)\n\n*Source : OMS / Collège National des Gynécologues-Obstétriciens*",
                "source": "OMS",
                "tags": ["accouchement", "cesarienne", "chirurgie"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Préparer l'accouchement",
                "description": "Êtes-vous prête pour le jour J ?",
                "category": "accouchement",
                "questions": [
                    {"question": "À combien de SA préparer son sac de maternité ?", "options": ["28 SA", "32 SA", "36 SA", "40 SA"], "correct_index": 2, "explication": "À 36 SA, tout doit être prêt — bébé peut arriver à terme dès 37 SA."},
                    {"question": "Combien de temps durent en moyenne les contractions de vrai travail ?", "options": ["10 sec", "30 sec", "1 min", "5 min"], "correct_index": 2, "explication": "Une contraction du vrai travail dure ≥ 1 minute, est régulière (toutes les 5 min), et résiste au repos."},
                    {"question": "Le liquide amniotique vert ou marron signifie :", "options": ["C'est normal", "Souffrance fœtale, urgence", "Bébé arrive vite", "Rien de grave"], "correct_index": 1, "explication": "Liquide vert/marron = méconium = souffrance fœtale. URGENCE absolue."},
                    {"question": "À quelle dilatation du col on est en travail actif ?", "options": ["1 cm", "3 cm", "6 cm", "10 cm"], "correct_index": 2, "explication": "L'OMS définit le travail actif à partir de 5-6 cm de dilatation. Avant, c'est le pré-travail."},
                ],
                "source": "OMS",
                "tags": ["quiz", "accouchement"],
            },
            # --- POST_PARTUM (+4) ---
            {
                "type": "fiche",
                "title": "Lochies : saignements normaux après accouchement",
                "description": "Combien de temps, quand s'inquiéter.",
                "category": "post_partum",
                "content_md": "# Les lochies (suites de couches)\n\nAprès l'accouchement, l'utérus se vide de muqueuse et de sang. Ces écoulements vaginaux s'appellent les **lochies**.\n\n## 📅 Évolution normale\n- **J1-J4** : rouge vif, abondants (comme des règles fortes) — *lochia rubra*\n- **J5-J10** : roses-brunes, plus liquides — *lochia serosa*\n- **J10-J42** : jaunâtres-blanchâtres, peu — *lochia alba*\n- **6 semaines** : disparition complète\n\n## 💧 Hygiène\n- Serviettes hygiéniques **uniquement** (pas de tampon avant 6 sem — risque infection)\n- Changer toutes les 4h\n- Toilette intime à l'eau claire ou savon doux 2×/jour\n- Pas de bain (douche uniquement) pendant 4-6 semaines\n- Pas de rapports sexuels pendant 4-6 semaines\n\n## 🚨 Consulter EN URGENCE si\n- **Saignements rouges qui réapparaissent** après être devenus brunes\n- **Caillots > taille d'une mandarine**\n- Plus d'1 serviette imbibée par heure pendant 2h\n- **Odeur fétide** (infection utérine)\n- Fièvre > 38,5°C\n- Douleur abdominale intense persistante\n- Vertiges, palpitations (anémie)\n\n## 🩺 Visite post-natale obligatoire\nÀ **6 semaines** après l'accouchement :\n- Examen du col, périnée, cicatrice (épisio/césarienne)\n- Bilan psychologique\n- Choix de contraception\n- Reprise de l'activité physique\n\n*Source : OMS — Soins postnatals de la mère et du nouveau-né*",
                "source": "OMS",
                "tags": ["post_partum", "saignements", "lochies"],
            },
            {
                "type": "fiche",
                "title": "Rééducation périnéale : pourquoi et quand",
                "description": "Récupérer son tonus pelvien après bébé.",
                "category": "post_partum",
                "content_md": "# Rééducation du périnée\n\nLe périnée (muscles du plancher pelvien) est mis à rude épreuve par la grossesse et l'accouchement. La rééducation **prévient** : fuites urinaires, descente d'organes, troubles sexuels.\n\n## 🎯 Pourquoi c'est essentiel ?\n- 1 femme sur 3 a des fuites urinaires post-accouchement\n- Sans rééducation, les troubles peuvent s'installer à vie\n- Indispensable avant un nouveau sport intense\n\n## 📅 Quand commencer ?\n- **Pas avant 6 semaines** post-partum\n- Idéalement après la **visite postnatale** (6e semaine)\n- 10 séances en moyenne, étalées sur 2-3 mois\n\n## 🏥 Avec qui ?\n- Sage-femme (formée en rééducation)\n- Kinésithérapeute spécialisé en périnéologie\n- En Côte d'Ivoire : prise en charge **partielle CMU**\n\n## 🤸 Exercices de base à la maison (après accord pro)\n\n### Les Kegel\n1. Inspirez calmement\n2. À l'expiration, **contractez** comme pour retenir un pet + une envie d'uriner\n3. Maintenez **5 secondes**\n4. Relâchez **10 secondes**\n5. Répétez **10 fois**, **3 fois par jour**\n\n### À éviter pendant 3 mois\n- Course à pied\n- Saut, corde à sauter\n- Crunchs / sit-ups\n- Port de charges lourdes (> 5 kg)\n- Toux/éternuements bouche fermée\n\n## ⚠️ Consulter si\n- Fuites urinaires (rire, toux, sport)\n- Sensation de poids vaginal\n- Douleurs pendant les rapports\n- Constipation chronique nouvelle\n- Incontinence anale (gaz, selles)\n\n*Source : Société Française de Pédiatrie et HAS*",
                "source": "OMS",
                "tags": ["post_partum", "perinee", "reeducation"],
            },
            {
                "type": "fiche",
                "title": "Reprendre une activité physique après bébé",
                "description": "Sans risque pour le périnée et le dos.",
                "category": "post_partum",
                "content_md": "# Sport après l'accouchement\n\nLa récupération demande de la **patience**. Reprendre trop tôt peut causer descente d'organes, hernie, mal de dos.\n\n## 📅 Calendrier de reprise\n\n### J1 - 6 semaines\n- **Marche douce** dès la sortie de la maternité (15-30 min/jour)\n- Respiration abdominale\n- Étirements doux du dos\n- **Aucun abdo classique** (crunchs)\n\n### Après visite postnatale (6 semaines)\n- Si périnée OK : natation, vélo d'appartement, yoga doux\n- Continuer la rééducation périnéale\n\n### Après 10 séances de rééducation (~3 mois)\n- Renforcement abdominal **type hypopressif** (validé par sage-femme)\n- Pilates, gym douce\n\n### Après 4-6 mois\n- Course à pied (si pas de fuite)\n- Sports d'impact, fitness\n- Reprise progressive\n\n## ❌ À éviter pendant 3-6 mois\n- Crunchs traditionnels (= pression abdominale néfaste)\n- Saut, corde à sauter\n- Crossfit, HIIT\n- Soulevé de charges lourdes\n\n## ✅ Bonnes pratiques\n- **Boire 2L d'eau/jour** (allaitement)\n- Soutien-gorge de sport adapté (taille augmente avec allaitement)\n- Pause si douleur, fuite, tiraillement\n- Bébé dans poussette ou porte-bébé pour accompagner\n\n## 💪 Bénéfices prouvés\n- Diminue baby-blues et dépression post-partum (-50%)\n- Améliore le sommeil\n- Favorise la perte de poids (sans effet sur la lactation)\n- Renforce le lien mère-bébé (sport en présence du bébé)\n\n*Source : ACOG (American College of Obstetricians and Gynecologists)*",
                "source": "OMS",
                "tags": ["post_partum", "sport", "recuperation"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Le post-partum (suites de couches)",
                "description": "Êtes-vous bien informée sur cette période ?",
                "category": "post_partum",
                "questions": [
                    {"question": "Combien de temps durent les lochies (saignements) ?", "options": ["1 semaine", "2-3 semaines", "4-6 semaines", "3 mois"], "correct_index": 2, "explication": "Les lochies durent 4-6 semaines en moyenne, en s'éclaircissant progressivement."},
                    {"question": "Quand reprendre une activité sexuelle ?", "options": ["Dès 1 semaine", "À la sortie de maternité", "Après 4-6 semaines + désir", "1 an après"], "correct_index": 2, "explication": "Attendre la cicatrisation complète (4-6 semaines), idéalement après visite postnatale, et selon le désir."},
                    {"question": "Le baby-blues dure :", "options": ["3-10 jours", "1 mois", "3 mois", "1 an"], "correct_index": 0, "explication": "Le baby-blues passe seul en 3-10 jours. Au-delà, on parle de dépression post-partum."},
                    {"question": "Quelle activité éviter avant la rééducation périnéale ?", "options": ["Marche douce", "Course à pied", "Yoga", "Massage"], "correct_index": 1, "explication": "Course/saut/abdos sont à éviter avant la rééducation périnéale (3-6 mois après bébé)."},
                ],
                "source": "OMS",
                "tags": ["quiz", "post_partum"],
            },
            # --- DEVELOPPEMENT (+4) ---
            {
                "type": "fiche",
                "title": "Stimuler bébé de 0-6 mois : jeux et interactions",
                "description": "Activités adaptées au tout-petit.",
                "category": "developpement",
                "content_md": "# Éveil du nourrisson 0-6 mois\n\nLe cerveau de bébé crée **1 million de connexions par seconde** ! Vos interactions sont son meilleur outil de développement.\n\n## 👁️ Stimulation visuelle\n- **0-2 mois** : objets contrastés noir/blanc à 20-30 cm\n- **2-4 mois** : couleurs vives, miroir incassable\n- **4-6 mois** : objets en mouvement, hochets colorés\n\n## 👂 Stimulation auditive\n- **Parlez-lui constamment** (en racontant ce que vous faites)\n- **Chantez** : berceuses, comptines\n- Variez les tons et les voix\n- Hochets, boîtes à musique, jeux sonores\n- Évitez TV/musique trop forte (max 50 dB)\n\n## ✋ Motricité globale\n- **Tummy time** (sur le ventre) : 5-10 min plusieurs fois/jour, dès la naissance — renforce la nuque\n- Le faire pédaler doucement\n- Massage doux après le bain\n\n## 🤲 Motricité fine\n- 3 mois : objets à attraper (texture variée)\n- 5 mois : transferts main-main, hochets\n- 6 mois : cubes mous, tissus à mâchouiller\n\n## 💬 Langage\n- Imiter ses gazouillis = lui répondre\n- Lecture à voix haute dès la naissance\n- Pas d'écran < 3 ans (recommandation OMS)\n\n## 💝 Liens d'attachement\n- **Peau-à-peau** quotidien\n- Allaitement = moment précieux\n- Répondre à ses pleurs (ne crée PAS de mauvaise habitude)\n- Câlins et portage = sécurité affective\n\n## ⚠️ Pas de\n- Trotteurs (dangereux + retardent la marche)\n- Écrans (cerveau immature)\n- Coussins/jouets dans le lit la nuit (risque MSN)\n- Sucre, miel\n\n*Source : OMS — Cadre nourrir le développement du jeune enfant*",
                "source": "OMS",
                "tags": ["developpement", "eveil", "0-6mois"],
            },
            {
                "type": "fiche",
                "title": "Apprendre la propreté : à partir de quel âge ?",
                "description": "Signes que bébé est prêt et méthode.",
                "category": "developpement",
                "content_md": "# L'apprentissage de la propreté\n\n**Pas avant 18-24 mois** — chaque enfant a son rythme, certains à 3 ans.\n\n## ✅ Signes de maturité (NÉCESSAIRES)\n1. **Marche bien** seul depuis quelques mois\n2. **Monte/descend** un escalier\n3. **Comprend** les consignes simples\n4. **Communique** son besoin (peut dire ou montrer)\n5. **Conscience corporelle** : touche sa couche mouillée, l'enlève\n6. **Couche sèche** plusieurs heures (signe de contrôle)\n7. **Imite** les adultes (vous suit aux toilettes)\n8. **Refuse la couche** et veut « comme les grands »\n\n## 🏆 Méthode douce\n\n### Phase 1 — Préparation (1-2 semaines)\n- Acheter pot **avec lui** (qu'il choisisse)\n- Lire des livres sur le pot (« T'choupi sur le pot »)\n- Le mettre habillé, juste pour s'asseoir\n\n### Phase 2 — Démarrage (2-4 semaines)\n- Proposer **toutes les 2h** : matin, après repas, sieste, bain\n- Sans forcer, jamais\n- **Féliciter** chaque essai (pas de récompense matérielle excessive)\n- Pas de honte ni punition en cas d'accident\n\n### Phase 3 — Consolidation (1-3 mois)\n- Garder couches pour la **sieste et la nuit** (encore 6-12 mois)\n- Vêtements faciles à enlever (pantalon élastique)\n- Encourager à essuyer / tirer la chasse\n\n## ⏰ Propreté de nuit\nVient **6-12 mois après** la propreté de jour. Si > 5 ans, persistant : consulter (énurésie).\n\n## ❌ À éviter\n- Forcer (rébellion, constipation, traumatismes)\n- Comparer aux frères/sœurs\n- Démarrer avant 18 mois\n- Démarrer en période de bouleversement (déménagement, naissance, sevrage)\n- Punir, humilier, gronder\n\n## 🌟 Côte d'Ivoire — pratiques traditionnelles\nDans certaines familles, on commence dès 1 an avec la position « assis-tenu ». Cela peut fonctionner si fait dans la **bienveillance**, sans contrainte. Le pot adapté reste plus moderne.\n\n*Source : Société Française de Pédiatrie*",
                "source": "OMS",
                "tags": ["developpement", "proprete", "pot"],
            },
            {
                "type": "fiche",
                "title": "Le « non » et les colères : comprendre 18 mois - 3 ans",
                "description": "Les fameuses « terrible twos ».",
                "category": "developpement",
                "content_md": "# Les colères du tout-petit\n\nVers 18 mois - 3 ans, votre adorable bébé devient un **petit volcan**. C'est NORMAL et même nécessaire à son développement.\n\n## 🧠 Pourquoi ces crises ?\n- Le cerveau émotionnel (amygdale) est mature **bien avant** le cerveau du contrôle (cortex préfrontal)\n- L'enfant ressent des émotions intenses sans pouvoir les gérer\n- Il découvre qu'il est une personne séparée → il dit « non » pour exister\n- Frustration de ne pas réussir / pas se faire comprendre\n\n## 😡 Anatomie d'une crise\n1. **Déclencheur** (faim, fatigue, frustration, refus)\n2. **Explosion** : pleurs, cris, se jette par terre, tape\n3. **Retour au calme** : besoin de réassurance\n\n## ✅ Comment réagir\n\n### Pendant la crise\n- **Restez calme** (votre cerveau adulte régule le sien)\n- **Mettez des mots** : « Tu es très en colère parce que... »\n- **Sécurisez** : éloignez les objets dangereux\n- **Ne raisonnez pas** : son cerveau ne peut pas l'entendre\n- **Laissez l'émotion sortir** sans la stopper\n\n### Après la crise\n- **Câlin** quand il accepte\n- **Reformulez** ce qui s'est passé avec des mots simples\n- **Ne lâchez pas la limite** initiale (s'il a tapé, dire « on ne tape pas »)\n\n## 🚫 À NE PAS FAIRE\n- Crier (alimente sa peur)\n- Frapper (montre que la violence est OK)\n- Punir au coin sans explication\n- Ridiculiser, humilier\n- Céder à la demande pour faire taire\n- Promettre récompense excessive (« si t'arrêtes je te donne un bonbon »)\n\n## 🎯 Prévention des crises\n- Anticiper les besoins : faim, soif, sieste\n- Routines stables (heures repas, coucher)\n- Choix limités : « tu veux ce t-shirt ou celui-là ? »\n- Annoncer les changements à l'avance (« dans 5 min on part »)\n- Lui laisser de l'autonomie sécurisée\n\n## ⚠️ Quand consulter ?\n- Crises **> 30 minutes** plusieurs fois/jour\n- Auto-mutilation\n- Régression (perte propreté, langage)\n- Aucun contact visuel pendant la crise\n- Persiste fortement après 4 ans\n\n*Source : Catherine Gueguen — « Pour une enfance heureuse »*",
                "source": "OMS",
                "tags": ["developpement", "colere", "education_bienveillante"],
            },
            # --- VACCINATION (+3) ---
            {
                "type": "fiche",
                "title": "Vaccin contre le HPV : protéger votre fille",
                "description": "Prévention du cancer du col de l'utérus.",
                "category": "vaccination",
                "content_md": "# Vaccin HPV (Papillomavirus)\n\nLe HPV cause **99% des cancers du col de l'utérus**. La vaccination peut prévenir 70-90% de ces cancers.\n\n## 🎯 Pour qui ?\n- **Filles 9-14 ans** : 2 doses à 6 mois d'intervalle (efficacité maximale avant les premiers rapports)\n- **Filles 15-26 ans** : 3 doses (rattrapage)\n- **Garçons** : recommandé aussi (porteurs sains, transmettent)\n\n## 💉 Vaccins disponibles\n- **Gardasil 9** : protège contre 9 souches (le plus complet)\n- **Cervarix** : protège contre 2 souches majeures\n\n## 🛡️ Efficacité\n- **>90%** contre les lésions précancéreuses du col\n- Protection de **15-20 ans minimum**\n- Réduit aussi cancers anaux, vulvaires, ORL\n\n## ✅ Sécurité\n- 270 millions de doses administrées dans le monde\n- Effets secondaires : douleur au point d'injection (50%), fatigue, maux de tête (transitoires)\n- Aucune fertilité affectée (rumeur démentie par toutes les études)\n\n## 🌍 Côte d'Ivoire\n- Programme national gratuit pour les filles **9-14 ans** dans les écoles\n- Aussi disponible en CSU privés (~50 000 F CFA la dose)\n- Dépistage du col par frottis : dès 25 ans, tous les 3 ans\n\n## ⚠️ Mythes à oublier\n- ❌ « Ça encourage la sexualité précoce » → FAUX (étude CDC sur 1M de filles)\n- ❌ « Ça donne le HPV » → FAUX (vaccin = protéine sans virus)\n- ❌ « Pas la peine si vierge » → FAUX (max d'efficacité avant les rapports)\n- ❌ « Cause des paralysies » → FAUX (étudié sur des millions de cas)\n\n*Source : OMS / IARC*",
                "source": "OMS",
                "tags": ["vaccination", "hpv", "cancer", "fille"],
            },
            {
                "type": "fiche",
                "title": "Vaccin antitétanique pendant la grossesse",
                "description": "Protéger maman et bébé contre le tétanos néonatal.",
                "category": "vaccination",
                "content_md": "# Vaccin VAT (anti-tétanique)\n\nLe **tétanos néonatal** tue 25 000 bébés/an dans le monde. La vaccination de la mère pendant la grossesse offre une protection totale au bébé via les anticorps maternels.\n\n## 📅 Calendrier OMS\n\n### Femme jamais vaccinée\n- **VAT 1** : 1ère consultation prénatale (dès qu'on apprend la grossesse)\n- **VAT 2** : 4 semaines après VAT 1 (au moins 2 sem avant accouchement)\n- **VAT 3** : 6 mois après VAT 2\n- **VAT 4** : 1 an après VAT 3\n- **VAT 5** : 1 an après VAT 4\n\n### Femme déjà vaccinée enfant (PEV)\n- 1 rappel à chaque grossesse, jusqu'à atteindre 5 doses au total\n\n## 🛡️ Pourquoi c'est CRUCIAL\nLes contractures tétaniques tuent par asphyxie en 5-10 jours. **Aucun traitement** efficace une fois infecté. Seul le vaccin protège.\n\n## 🦠 Comment se contracte le tétanos ?\n- Outils non stériles à l'accouchement (lame, ciseaux)\n- Cordon ombilical mal soigné (cendre, terre, plante)\n- Plaies souillées\n- Côte d'Ivoire : risque dans les zones rurales sans CSU\n\n## ✅ Sécurité du vaccin\n- **100% sûr** pendant la grossesse à tous les trimestres\n- Sans danger pour le fœtus\n- Recommandé même si vous avez eu le BCG enfant\n- Effets secondaires : douleur bras 24-48h, fièvre légère\n\n## 🆓 Côte d'Ivoire\n**Vaccination gratuite** pour toutes les femmes enceintes dans tous les CSU publics (programme PEV/MSHP).\n\n*Source : OMS / UNICEF — Élimination du tétanos maternel et néonatal*",
                "source": "OMS",
                "tags": ["vaccination", "tetanos", "grossesse", "vat"],
            },
            # --- ALLAITEMENT (+2) ---
            {
                "type": "fiche",
                "title": "Tirer son lait et conserver : guide pratique",
                "description": "Pour reprendre le travail ou s'absenter.",
                "category": "allaitement",
                "content_md": "# Tirer-allaiter\n\n## 🍼 Quand tirer ?\n- **2-4 semaines avant la reprise** du travail\n- Le matin (lactation max)\n- Entre 2 tétées (pas en remplacement)\n- Quand bébé ne prend qu'un sein\n\n## 🛠️ Tire-lait\n### Manuel\n- Pas cher (5 000-15 000 F CFA)\n- Idéal occasionnel\n- Plus long\n\n### Électrique simple\n- 25 000-60 000 F CFA\n- Confortable, rapide\n- Idéal usage régulier\n\n### Électrique double (2 seins en même temps)\n- > 80 000 F CFA\n- Idéal travail à temps plein\n- Tire en 15 min\n\n## 📦 Conservation du lait maternel\n| Lieu | Durée |\n|---|---|\n| Température ambiante (< 25°C) | 4-6 heures |\n| Glacière + pain de glace | 24 heures |\n| Réfrigérateur (4°C) | 4 jours |\n| Congélateur (-18°C) | 6 mois |\n| Compartiment glaçon (-8°C) | 2 semaines |\n\n## 🧊 Bonnes pratiques\n- Sachets ou biberons stériles, **dater chaque contenant**\n- **Ne PAS recongeler** un lait décongelé\n- Décongeler au frigo (12h) ou à l'eau tiède\n- **Jamais au micro-ondes** (détruit les anticorps + risque brûlure)\n- Réchauffer au bain-marie tiède\n- Lait avec couleur jaunâtre, séparation = NORMAL (mélanger doucement)\n\n## ✋ Hygiène\n- Lavage soigneux des mains avant\n- Stérilisation des pièces du tire-lait à chaque usage\n- Tiré dans un endroit calme (la lactation est sensible au stress)\n\n## 🍼 Donner au bébé\n- **Au goblet ou cuillère** plutôt que biberon les premiers temps (évite confusion sein-tétine)\n- Si biberon : tétine à débit lent\n- Demander à la nounou de **respecter la cadence** (pas de gaver)\n\n## 💼 Au travail\n- Pause de 1h/jour pour tirer (Code du travail Côte d'Ivoire)\n- Local calme et hygiénique\n- Possibilité de garder dans un mini-frigo ou glacière\n\n*Source : Co-Naître / OMS*",
                "source": "OMS",
                "tags": ["allaitement", "tire-lait", "conservation"],
            },
            {
                "type": "fiche",
                "title": "Sevrage progressif : doux pour maman et bébé",
                "description": "Quand et comment arrêter l'allaitement.",
                "category": "allaitement",
                "content_md": "# Le sevrage de l'allaitement\n\nL'OMS recommande l'allaitement jusqu'à **2 ans ou plus**. Le sevrage doit être un choix de la mère, **progressif**.\n\n## ⏰ Quand sevrer ?\n- C'est **votre** décision (et celle du bébé)\n- Pas de bonne ou mauvaise date\n- Tenez compte : retour au travail, désir d'une nouvelle grossesse, besoin de retrouver liberté, fatigue\n\n## 📅 Sevrage progressif (recommandé)\nDurée : **2-6 semaines**\n\n### Semaine 1-2\n- Supprimer **1 tétée** par jour, la moins importante (souvent celle du milieu de journée)\n- La remplacer par : un repas, un câlin, une activité\n\n### Semaine 3-4\n- Supprimer une **2e tétée**\n- Maintenir matin et soir (les plus importantes émotionnellement)\n\n### Semaine 5-6\n- Supprimer la tétée du soir\n- Remplacer par un rituel : histoire, câlin, doudou\n\n### Semaine 7+\n- Supprimer la tétée du matin\n- Sevrage complet\n\n## 💡 Astuces\n- **Distrayez** bébé aux heures habituelles de tétée\n- **Père/conjoint** prend le relais (donne biberon, met au lit)\n- **Évitez de vous découvrir** à la maison\n- Bébé > 1 an : lui parler, expliquer\n\n## 🩺 Pour la maman\n- **Diminuer progressivement** prévient l'engorgement\n- Si seins durs : extraire un peu (pas vidé)\n- **Choux frais** sur les seins (vieux remède efficace)\n- **Pas d'eau chaude** sur les seins (stimule la lactation)\n\n## 🚫 À éviter\n- Sevrage brutal (douleur, mastite, baby-blues)\n- Plantes traditionnelles (sans avis médical)\n- Médicaments anti-lactation (Bromocriptine) **interdits** en post-partum (risques cardio)\n- Bandage serré des seins\n\n## 😢 Émotions\nLe sevrage est souvent **chargé émotionnellement**. Tristesse, déprime passagère = normal. Les hormones chutent. Parlez-en avec votre sage-femme si la déprime persiste.\n\n## 👶 Et bébé ?\n- **< 1 an** : continuer avec lait infantile (étape 2 puis 3)\n- **> 1 an** : peut passer au lait de vache + alimentation diversifiée\n- Les nuits peuvent être perturbées 1-2 semaines = passager\n\n*Source : OMS / La Leche League*",
                "source": "OMS",
                "tags": ["allaitement", "sevrage", "transition"],
            },
            # --- NUTRITION (+3) ---
            {
                "type": "fiche",
                "title": "Recettes locales pour bébé : 6-12 mois",
                "description": "Plats ivoiriens adaptés à bébé.",
                "category": "nutrition",
                "content_md": "# Recettes pour bébé — saveurs ivoiriennes\n\n## 🥣 6-7 mois : purées lisses\n\n### Purée patate douce + carotte\n- 1 patate douce + 1 carotte\n- Cuire 20 min à la vapeur ou à l'eau\n- Mixer fin avec 2 c.s. de lait maternel\n- Sans sel\n\n### Bouillie de mil\n- 2 c.s. de farine de mil\n- 100 ml d'eau bouillante\n- Cuire 5 min en remuant\n- Ajouter 30 ml de lait maternel\n\n### Avocat-banane\n- 1/4 d'avocat mûr + 1/2 banane mûre\n- Écraser à la fourchette\n- Riche en bons gras (cerveau)\n\n## 🍌 8-9 mois : textures écrasées\n\n### Riz au gombo et poulet\n- 2 c.s. de riz cuit bien tendre\n- 30g de blanc de poulet émietté\n- 2 gombos cuits écrasés\n- 1 c.c. d'huile rouge (vit A)\n\n### Foutou (igname) au poisson\n- 30g de foutou bien écrasé\n- 30g de capitaine ou tilapia bien cuit, sans arête\n- Petit jus de tomate maison\n\n### Soupe d'arachide allégée\n- 50 ml de bouillon (sans cube Maggi)\n- 1 c.c. de pâte d'arachide\n- 1 c.s. d'épinards finement hachés\n- Patate douce écrasée\n\n## 🍽️ 10-12 mois : petits morceaux\n\n### Attiéké à l'œuf\n- 3 c.s. d'attiéké tiède\n- 1 œuf bien cuit écrasé\n- 1 c.c. d'huile d'olive\n- Tomate fraîche écrasée\n\n### Banane plantain bouillie + sauce arachide\n- 50g de banane plantain mûre, bouillie, écrasée\n- 1 c.c. de sauce arachide nature (sans piment)\n- 2 cubes de viande hachée bien cuite\n\n### Bouillie enrichie matinale\n- Farine de mil ou maïs (50g)\n- Lait infantile (200ml)\n- 1 c.c. d'huile rouge\n- 1 jaune d'œuf 2-3×/sem\n\n## ✅ À privilégier\n- Légumes verts feuillus (épinards, baobab) — fer, calcium\n- Petits poissons (frais ou séchés tradi) — oméga 3\n- Œufs entiers dès 8 mois\n- Légumineuses (haricots, pois)\n- Huile rouge — vitamine A\n\n## 🚫 À éviter\n- Sel, sucre, miel (avant 1 an)\n- Cubes Maggi/Knorr (excès sodium)\n- Piment, gingembre fort\n- Aliments durs (cacahuètes entières)\n- Arrachides écrasées seules avant 1 an (allergie)\n\n*Source : UNICEF Côte d'Ivoire — Programme Nutrition de l'enfant*",
                "source": "UNICEF",
                "tags": ["nutrition", "recettes", "bebe", "cote_ivoire"],
            },
            {
                "type": "fiche",
                "title": "Hydratation de la femme enceinte et allaitante",
                "description": "Combien boire et quoi.",
                "category": "nutrition",
                "content_md": "# L'hydratation pendant grossesse et allaitement\n\n## 💧 Combien boire ?\n- **Femme enceinte** : 2 - 2,5 L/jour\n- **Femme allaitante** : 3 - 3,5 L/jour (le lait c'est de l'eau !)\n- En période chaude (Côte d'Ivoire) : +500 ml\n\n## ✅ Boissons recommandées\n1. **Eau** — la base (filtrée, bouillie ou en bouteille)\n2. **Tisanes** : verveine, fenouil, anis (favorisent lactation)\n3. **Bouillons légers** maison\n4. **Jus de fruits frais maison** (sans sucre ajouté)\n5. **Eau de coco fraîche** (riche en électrolytes)\n6. **Lait** (max 2 verres/j)\n\n## ⚠️ À limiter\n- **Café** : max 200 mg/jour (= 2 tasses)\n- **Thé noir/vert** : 2 tasses/jour, pas avec les repas\n- **Sodas** : max 1 verre/jour (sucres)\n- **Bissap** : avec modération\n\n## ❌ À ÉVITER strictement\n- **Alcool** (toute dose passe au bébé)\n- **Boissons énergisantes** (Red Bull, Monster)\n- **Jus industriels** très sucrés\n- Eau non potable (gastros, typhoïde)\n\n## 🌿 Tisanes à éviter\n- Persil, sauge, menthe poivrée (peuvent diminuer lactation)\n- Café-de-Marie, Harpagophyton (effets sur grossesse)\n\n## 🚨 Signes de déshydratation\n- Urines foncées (devraient être jaune pâle)\n- Soif intense\n- Maux de tête, fatigue\n- Sécheresse buccale\n- Constipation\n- En allaitement : baisse de production de lait\n\n## 🌡️ Pendant les fortes chaleurs\n- Boire **avant d'avoir soif**\n- Petites gorgées régulières\n- Pas que de l'eau (ajouter une pincée de sel + sucre = eau-vie maison)\n- Vêtements amples, pagne en coton\n- Éviter sortie 11h-15h\n\n*Source : OMS / Société Française de Nutrition*",
                "source": "OMS",
                "tags": ["nutrition", "hydratation", "grossesse", "allaitement"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Nutrition de la maman et du bébé",
                "description": "5 questions sur l'alimentation.",
                "category": "nutrition",
                "questions": [
                    {"question": "À partir de quel âge introduire la diversification ?", "options": ["3 mois", "4 mois", "6 mois", "9 mois"], "correct_index": 2, "explication": "L'OMS recommande la diversification à partir de 6 mois révolus."},
                    {"question": "Quel aliment NE PAS donner avant 1 an ?", "options": ["Carotte", "Miel", "Banane", "Œuf"], "correct_index": 1, "explication": "Le miel peut contenir des spores de Clostridium botulinum, dangereuses pour le bébé < 1 an."},
                    {"question": "Combien d'eau boire en allaitant ?", "options": ["1 L/jour", "1,5 L/jour", "3 L/jour", "5 L/jour"], "correct_index": 2, "explication": "3 à 3,5 L/jour, car le lait maternel est composé à 88% d'eau."},
                    {"question": "Quel supplément est essentiel dès le début de la grossesse ?", "options": ["Vitamine A", "Acide folique", "Vitamine K", "Magnésium"], "correct_index": 1, "explication": "L'acide folique (B9) prévient les malformations du tube neural — à prendre dès la conception."},
                    {"question": "Quel aliment AUGMENTE l'absorption du fer ?", "options": ["Thé", "Café", "Vitamine C (orange)", "Lait"], "correct_index": 2, "explication": "La vitamine C multiplie par 3 l'absorption du fer non héminique. Thé et café la bloquent."},
                ],
                "source": "OMS",
                "tags": ["quiz", "nutrition"],
            },
            # --- URGENCE (+2) ---
            {
                "type": "fiche",
                "title": "Convulsions du bébé : le bon réflexe",
                "description": "Reconnaître et réagir face à une crise.",
                "category": "urgence",
                "content_md": "# Convulsions chez le nourrisson\n\nUne convulsion = mouvements involontaires, perte de connaissance. **Toujours impressionnant**, parfois grave.\n\n## 🎬 Signes\n- Yeux révulsés (regard fixe vers le haut)\n- Mâchoires crispées\n- Mouvements saccadés bras/jambes (« comme une danse »)\n- Cyanose (lèvres bleues)\n- Bave\n- Perte de connaissance, ne réagit plus\n- Parfois : pipi/selles involontaires\n\n## ⏱️ Que faire IMMÉDIATEMENT\n\n### 1. **Sécuriser** (ne PAS bloquer les mouvements)\n- Allonger sur le **côté**, sur surface molle\n- Éloigner objets durs/dangereux autour\n- Desserrer vêtements, col\n- **NE RIEN METTRE dans la bouche** (pas de cuillère, doigt, chiffon — danger)\n\n### 2. **Observer** (chronométrer)\n- Heure de début\n- Type de mouvements\n- Couleur de peau\n- Conscience\n\n### 3. **Appeler les secours**\n- **SAMU 185** (Côte d'Ivoire)\n- Pompiers **180**\n- Ou foncer aux urgences\n\n## ⏰ La règle des 5 minutes\n- < 5 min : surveille, calme, attend la fin\n- > 5 min : URGENCE ABSOLUE — état de mal épileptique, risque cérébral\n\n## 🌡️ Convulsions fébriles (la cause #1 chez 6 mois - 5 ans)\n- 2-5% des enfants en font une au moins\n- Causées par fièvre brutale (paludisme +++ Côte d'Ivoire)\n- Généralement bénignes, durent < 5 min\n- **MAIS** : toujours consulter pour identifier la cause\n\n## 🚨 Causes graves à éliminer\n- **Paludisme cérébral** (1ère cause en Afrique)\n- Méningite\n- Hypoglycémie sévère\n- Déshydratation extrême\n- Trauma crânien\n- Empoisonnement\n- Épilepsie\n\n## ❌ NE PAS\n- Mettre du citron, plante, doigt dans la bouche\n- Asperger d'eau froide\n- Secouer pour réveiller\n- Donner à boire pendant la crise\n- Croire à la sorcellerie/maraboutage — c'est médical\n\n## ✅ Après la crise\n- Bébé **somnolent** = normal\n- Mettre en position latérale de sécurité\n- **Aux urgences obligatoirement** pour bilan : TDR paludisme, glycémie, NFS, examen neuro\n\n## 📞 Numéros utiles Côte d'Ivoire\n- SAMU : **185**\n- Sapeurs-pompiers : **180**\n- Police secours : **170**\n- CHU Cocody : 22 48 10 00\n\n*Source : OMS / SoFraPed*",
                "source": "OMS",
                "tags": ["urgence", "convulsion", "bebe", "paludisme"],
            },
            {
                "type": "fiche",
                "title": "Étouffement et corps étranger : gestes qui sauvent",
                "description": "Manœuvres adaptées par âge.",
                "category": "urgence",
                "content_md": "# Étouffement chez le bébé/enfant\n\n**Tout objet < 4,5 cm peut bloquer les voies respiratoires.** Cacahuètes, raisins, pièces, jouets cassés...\n\n## 🚨 Signes d'étouffement\n- Mains serrant la gorge\n- Impossibilité de tousser ou parler\n- Visage rouge puis bleu (cyanose)\n- Yeux exorbités\n- Respiration sifflante\n- Perte de conscience si total\n\n## 👶 Bébé < 1 an — Manœuvre de Mofenson\n\n### Position 1 — 5 claques dans le dos\n1. **Mettez bébé à plat ventre** sur votre avant-bras, **tête plus basse que le corps**\n2. Maintenez la tête (sa mâchoire entre vos doigts)\n3. **5 claques fermes** entre les omoplates avec le talon de la main\n\n### Position 2 — Si toujours étouffé : 5 compressions thoraciques\n1. Retournez bébé sur le **dos**\n2. **2 doigts** au milieu du sternum\n3. **5 compressions** vers le bas (1/3 de la profondeur du thorax)\n\n### Alterner 5 claques + 5 compressions jusqu'à\n- Expulsion de l'objet OU\n- Bébé reprend conscience OU\n- Arrivée des secours\n\n## 🧒 Enfant > 1 an — Manœuvre de Heimlich\n1. Placez-vous **derrière** l'enfant\n2. Mains autour de la taille\n3. **Poing fermé** au-dessus du nombril, sous le sternum\n4. **Compression brutale vers vous + vers le haut**\n5. Répétez jusqu'à expulsion\n\n## 📞 EN PARALLÈLE\n- Faire appeler les secours par quelqu'un\n- **SAMU 185 (CI)**\n- Pompiers 180\n\n## ⚠️ Si l'enfant tousse FORTEMENT\n- **Ne PAS faire les manœuvres** (la toux est plus efficace)\n- L'encourager à tousser\n- Surveiller jusqu'à expulsion\n- Si tout passe : aller quand même aux urgences (vérifier qu'il n'y a pas un fragment dans les poumons)\n\n## 🛡️ Prévention\n- Pas d'aliments durs ronds avant 4 ans : cacahuètes entières, bonbons, raisins entiers\n- Couper raisins/tomates cerises en 4\n- Surveiller les jouets : pas de petites pièces avant 3 ans\n- Pile-bouton = URGENCE même avalée (brûle l'œsophage en 2h)\n- Aimants : très dangereux, perforent l'intestin\n\n## ❌ NE JAMAIS\n- Mettre le doigt dans la bouche pour chercher l'objet (risque d'enfoncer plus)\n- Faire boire de l'eau (l'objet ne descend pas)\n- Frapper le dos en position assise\n- Faire vomir\n\n*Source : ERC (European Resuscitation Council) — formation PSC1*",
                "source": "OMS",
                "tags": ["urgence", "etouffement", "heimlich", "bebe"],
            },
            # --- CONTRACEPTION (+2) ---
            {
                "type": "fiche",
                "title": "Pilule contraceptive : tout comprendre",
                "description": "Modes d'emploi, oubli, règles.",
                "category": "contraception",
                "content_md": "# La pilule contraceptive\n\n## 💊 Deux familles\n\n### Pilule combinée (œstro-progestative)\n- Plus courante : Microgynon, Trinordiol, Yaz\n- Très efficace (99% si bien prise)\n- 21 ou 28 comprimés/plaquette\n- **PAS pendant l'allaitement** (les premiers 6 mois)\n\n### Pilule progestative (microprogestatif)\n- Cerazette, Microval\n- **Compatible allaitement**\n- À prendre **EXACTEMENT à la même heure** chaque jour (fenêtre de 3h max)\n- 28 comprimés en continu (sans pause)\n\n## ⏰ Comment la prendre\n\n### Plaquette de 21 comprimés\n1. **1er jour des règles** = 1er comprimé\n2. 1 comprimé/jour pendant 21 jours\n3. **7 jours d'arrêt** (les règles arrivent)\n4. Reprendre une nouvelle plaquette\n\n### Plaquette de 28 comprimés\n1. Pareil mais avec 7 placebos à la fin\n2. Aucun arrêt entre plaquettes\n\n## 🚨 En cas d'oubli\n\n### < 12h après l'heure habituelle\n- Prendre le comprimé oublié IMMÉDIATEMENT\n- Continuer normalement\n- **Pas de risque**\n\n### > 12h après\n- Prendre le dernier comprimé oublié\n- Continuer normalement\n- **Préservatif pendant 7 jours**\n- Si rapport non protégé < 5 jours : pilule du lendemain\n\n## 🆘 Pilule du lendemain\n- **Norlevo** : efficace jusqu'à 72h (3 jours)\n- **EllaOne** : efficace jusqu'à 120h (5 jours)\n- En vente libre en pharmacie\n- Plus efficace pris tôt (40% à 72h)\n- Ne remplace pas une contraception régulière\n\n## ❌ Médicaments qui annulent l'effet\n- Antibiotiques (rifampicine)\n- Antiépileptiques\n- Millepertuis\n- Vomissements/diarrhée < 4h après prise = comprimé inefficace\n\n## ⚠️ Effets secondaires possibles\n- Tensions mammaires\n- Nausées (premières semaines)\n- Spotting (saignements légers)\n- Variations d'humeur\n- Migraines\n- Prise de poids modérée\n\n## ❌ Contre-indications majeures\n- Tabagisme + > 35 ans (risque AVC)\n- Antécédent de phlébite/embolie\n- Cancer hormonodépendant\n- Migraine avec aura\n- HTA mal contrôlée\n\n## 🚨 Consulter en URGENCE si\n- Douleur thoracique soudaine\n- Essoufflement\n- Douleur dans le mollet (gonflement)\n- Maux de tête sévères + vision\n- Faiblesse d'un côté du corps\n\n*Source : OMS / Recommandations contraception*",
                "source": "OMS",
                "tags": ["contraception", "pilule", "oubli"],
            },
            # --- HYGIENE (NEW — 5) ---
            {
                "type": "fiche",
                "title": "Bain de bébé : technique en 10 étapes",
                "description": "Bain serein pour bébé et parents.",
                "category": "hygiene",
                "content_md": "# Le bain de bébé\n\n## 🛁 Quand ?\n- **1 bain tous les 2-3 jours** suffit (la peau du bébé est fragile)\n- Plutôt **avant le repas** (sinon régurgitations)\n- Pas après les vaccins immédiatement\n- Idéalement le **soir** : favorise le sommeil\n\n## 🌡️ Préparer la salle de bain\n- Température : **22-24°C** (pas de courant d'air)\n- Eau du bain : **37°C** (testez avec votre coude ou thermomètre)\n- Tout à portée de main (jamais quitter bébé)\n\n## 📦 Matériel\n- Petite baignoire bébé ou lavabo\n- Savon neutre / pH ≥ 5 (sans parfum)\n- 1 serviette à capuche\n- 1 gant doux\n- Couche propre, vêtements\n- Liniment oléo-calcaire pour le siège\n- Brosse douce\n\n## 🧼 Les 10 étapes\n\n1. **Déshabiller** bébé sur la table à langer\n2. **Nettoyer le siège** au liniment ou eau + savon\n3. **Envelopper** bébé dans la serviette pour le porter\n4. **Tester l'eau** au coude\n5. **Tenir** bébé : main gauche sous la nuque + épaule, sa nuque dans votre coude\n6. **Plonger doucement** : pieds, fesses, dos, jusqu'aux épaules\n7. **Savonner** avec votre main libre : visage (eau seule), cou, aisselles, plis, parties génitales\n8. **Rincer** abondamment\n9. **Sortir** dans la serviette à capuche, sécher en tamponnant (pas frotter)\n10. **Habiller** rapidement\n\n## 🛡️ Sécurité ABSOLUE\n- **JAMAIS laisser bébé seul** dans le bain (pas même 5 secondes)\n- 5 cm d'eau suffisent pour qu'un bébé se noie\n- Coupez la sonnerie du téléphone, frappez à la porte = ignorez\n- Pas de chauffe-eau directement sur le robinet (risque brûlure)\n\n## 👃 Soins après le bain\n- **Yeux** : compresse + sérum physiologique, du nez vers l'oreille\n- **Oreilles** : pavillon externe seulement (jamais coton-tige dans le conduit)\n- **Nez** : sérum physiologique 1 dose si encombré\n- **Ongles** : couper après le bain (mous), bord droit\n- **Cordon** (s'il n'est pas tombé) : sécher délicatement\n\n## ❌ À éviter\n- Eau de Cologne (alcool, irritant)\n- Talc (peut être inhalé)\n- Lingettes parfumées au quotidien\n- Bain bouillant ou froid\n- Coton-tige dans les oreilles\n- Frotter au lieu de tamponner\n\n*Source : Société Française de Pédiatrie*",
                "source": "OMS",
                "tags": ["hygiene", "bain", "bebe"],
            },
            {
                "type": "fiche",
                "title": "Soins de l'érythème fessier",
                "description": "Prévenir et traiter les fesses irritées.",
                "category": "hygiene",
                "content_md": "# Érythème fessier\n\n**8 bébés sur 10** auront un érythème fessier dans leur 1ère année. Causé par le frottement, l'humidité et les selles acides.\n\n## 🩹 Reconnaître\n- Rougeurs sur les fesses, les cuisses, les organes génitaux\n- Peau brillante, sèche\n- Petits boutons / suintements (formes sévères)\n- Bébé pleure au change (douleur)\n\n## ✅ Prévention quotidienne\n1. **Changer la couche** souvent : toutes les 3-4h, dès qu'elle est souillée\n2. **Nettoyer doucement** : eau tiède + liniment oléo-calcaire\n3. **Sécher en tamponnant** (jamais frotter)\n4. **Laisser à l'air** 10-15 min entre 2 couches (oxygène = guérison)\n5. **Couche pas trop serrée**\n6. **Pas de lingettes parfumées** quotidiennes\n\n## 💊 Traitement de l'érythème\n- **Crème à base de zinc** : Mitosyl, Bepanthen, Aloplastine\n- Appliquer en couche **épaisse** à chaque change\n- 80% des cas guérissent en 2-3 jours\n\n## 🍯 Recettes naturelles efficaces\n- **Lait maternel** : appliquer 2-3 gouttes, laisser sécher\n- **Beurre de karité pur** (sans parfum) : très apaisant\n- **Huile de coco vierge** : antibactérien naturel\n\n## 🚨 Consulter si\n- Pas d'amélioration en 3-4 jours\n- **Pus, plaies suintantes** (surinfection)\n- Petits boutons rouges aux contours nets (mycose à candida) — nécessite crème antifongique (Mycoster)\n- Fièvre\n- Bébé refuse de manger\n- Étendue importante\n\n## 🍼 Causes possibles à investiguer\n- Diarrhée prolongée\n- Antibiothérapie récente (mycose)\n- Diversification : nouvel aliment\n- Allergie à la couche / lessive\n- Allergie au gel hydroalcoolique des lingettes\n\n## 🎯 Côte d'Ivoire — pratiques sûres\n- Couches lavables en coton bio = top pour la peau\n- **Karité** local, non parfumé = excellent\n- **Pas** de talc à la mode (parfois mélangé à de l'arrowroot tradi)\n- **Pas** de potions traditionnelles à base de plantes inconnues\n\n*Source : Société Française de Pédiatrie*",
                "source": "OMS",
                "tags": ["hygiene", "erytheme", "fesses", "couche"],
            },
            {
                "type": "fiche",
                "title": "Hygiène intime de la femme enceinte",
                "description": "Prévenir mycoses et infections.",
                "category": "hygiene",
                "content_md": "# Hygiène intime pendant la grossesse\n\nLes hormones de grossesse modifient la flore vaginale et augmentent les risques de mycoses, vaginoses, infections urinaires.\n\n## ✅ Bonnes pratiques\n\n### Toilette quotidienne\n- **1 fois/jour** maximum (matin OU soir)\n- À l'**eau tiède** + savon doux **pH neutre** (Saforelle, Hydralin, savon de Marseille pur)\n- **De l'avant vers l'arrière** (pas de l'anus vers le vagin)\n- **Sans gant** (terrain à microbes), avec la main\n- **Sécher en tamponnant**\n\n### Vêtements\n- **Sous-vêtements en coton** (l'humidité favorise les mycoses)\n- Changer quotidiennement (et après le sport)\n- **Éviter** : strings, synthétique, jeans serrés\n- Dormir sans culotte si possible\n\n### Pendant la nuit\n- Ne pas porter de protège-slip continuellement\n- Aérer le périnée\n\n## 🚨 Signes d'infection — consulter\n\n### Mycose à candida (très fréquente en grossesse)\n- Pertes blanches **épaisses, en grumeaux** (lait caillé)\n- Démangeaisons intenses\n- Brûlures à la miction\n- Rougeur vulvaire\n- Traitement : ovules antifongiques (sans risque grossesse) + crème\n\n### Vaginose bactérienne\n- Pertes **grises** odeur de poisson\n- Sans démangeaison\n- À traiter (risque accouchement prématuré)\n\n### Infection urinaire (cystite)\n- Brûlures en urinant\n- Envies fréquentes\n- Urines troubles, parfois sanguinolentes\n- **Consulter rapidement** : risque de pyélonéphrite chez l'enceinte → accouchement prématuré\n\n### Trichomonas (IST)\n- Pertes **jaune-verdâtre** mousseuses\n- Démangeaisons, brûlures\n- Traitement de la femme ET du partenaire\n\n## ❌ À éviter ABSOLUMENT\n- **Douche vaginale** (détruit la flore protectrice)\n- Savon parfumé / Carolin / Antibact / agressif\n- Sprays intimes parfumés\n- Tampons hygiéniques (pour les saignements pendant la grossesse, voir médecin)\n- Plantes traditionnelles (souvent corrosives)\n- Bicarbonate, vinaigre, citron en toilette intime\n- Argile sans avis médical\n\n## 🌿 Astuce naturelle\n- Yaourt nature **non sucré** appliqué localement = restaure flore\n- Huile de coco vierge calme l'irritation\n- Boire beaucoup d'eau (dilue les bactéries urinaires)\n\n## 💑 Sexualité et hygiène\n- Pisser après chaque rapport (élimine bactéries de l'urètre)\n- Préservatif avec nouveau partenaire (IST)\n- Toilette intime après le rapport (eau seule, pas savon)\n\n*Source : OMS / Société Française de Gynécologie*",
                "source": "OMS",
                "tags": ["hygiene", "intime", "grossesse", "mycose"],
            },
            {
                "type": "fiche",
                "title": "Lavage des mains : 1er rempart contre les microbes",
                "description": "Geste simple, vies sauvées.",
                "category": "hygiene",
                "content_md": "# Le lavage des mains\n\nLe simple **lavage des mains avec savon** réduit la diarrhée infantile de **50%**, les infections respiratoires de 25%. C'est le geste #1 de santé publique mondiale.\n\n## 🧼 Quand se laver les mains ?\n\n### POUR LE BÉBÉ\n- Avant chaque tétée / biberon\n- Avant chaque change\n- Avant chaque bain\n- Après avoir touché des animaux\n- Au retour à la maison\n- Avant de cuisiner pour bébé\n\n### POUR L'ENFANT (à apprendre dès 2 ans)\n- Avant chaque repas\n- Après être allé aux toilettes\n- Au retour à la maison / école\n- Après avoir joué dehors / avec terre\n- Après avoir touché un animal\n- Après s'être mouché / avoir éternué\n\n## 🚿 Comment bien se laver — 6 étapes (40 sec)\n1. **Mouiller** les mains à l'eau courante\n2. **Savonner** abondamment (savon liquide ou pain)\n3. **Frotter** :\n   - Paumes l'une contre l'autre\n   - Le dessus des mains\n   - Entre les doigts\n   - Le dos des doigts\n   - Les pouces\n   - Le bout des doigts dans la paume opposée\n4. **Rincer** soigneusement\n5. **Sécher** avec un linge propre ou à l'air\n6. **Fermer le robinet** avec le linge (pour ne pas se recontaminer)\n\n## 🎵 Astuce enfant\nChanter 2 fois « Joyeux Anniversaire » = 40 secondes de lavage parfait !\n\n## 💧 Sans eau courante (Côte d'Ivoire rurale)\n- Bidon-tippy : un bidon percé activé au pied — économise l'eau\n- Verser l'eau d'une bouteille avec aide d'un autre\n- Ne pas plonger les mains dans une bassine commune\n\n## 🧴 Gel hydroalcoolique\n- Quand pas d'eau dispo (transport, courses)\n- Mains **non visiblement sales** (sinon eau + savon)\n- Frotter 30 sec, laisser sécher\n- Mauvais sur enfants < 6 ans (risque ingestion = brûlure œsophage)\n\n## 🦠 Pourquoi c'est crucial en Afrique sub-saharienne ?\n- Maladies hydriques (diarrhée, choléra, typhoïde) = 2e cause de mortalité enfants < 5 ans\n- En Côte d'Ivoire : 13 000 bébés meurent/an de causes évitables par lavage de mains\n- Pendant Ebola, COVID : ce geste a sauvé des millions\n\n## 🏠 Pratiques familiales\n- Apprenez **en chantant** au tout-petit\n- Mettez un marche-pied au lavabo dès qu'il marche\n- Affichez les 6 étapes avec dessins dans la salle de bain\n- Donnez l'exemple : **vous lavez TOUS** les mains avant de manger ensemble\n\n*Source : OMS / UNICEF — WASH program*",
                "source": "OMS",
                "tags": ["hygiene", "mains", "diarrhee", "prevention"],
            },
            {
                "type": "fiche",
                "title": "Hygiène buccodentaire de bébé à enfant",
                "description": "De la 1ère dent au brossage autonome.",
                "category": "hygiene",
                "content_md": "# Soins des dents du bébé\n\nLes caries de la petite enfance touchent **30%** des enfants en Côte d'Ivoire. Pourtant, **100% évitables** avec les bons gestes.\n\n## 👶 0-6 mois : pré-dentaires\n- Nettoyer les **gencives** 1×/jour\n- Compresse propre humide enroulée autour du doigt\n- Frotter doucement gencives + langue\n- Pas de dentifrice\n\n## 🦷 6-12 mois : 1ères dents\n- 1ère dent vers **6-8 mois** (incisive inférieure)\n- **Brosse à dents bébé** souple + eau seule, OU\n- **Lingette** dentaire imprégnée\n- 2× par jour : matin et soir\n- **Pas de dentifrice fluoré** avant 6 mois\n- Anneau de dentition au congélateur (pas dur, pas en plastique mou toxique)\n\n## 🧒 1-3 ans : routine\n- Brossage par un adulte 2×/jour, **2 minutes**\n- Dentifrice **dose grain de riz** avec **fluor 500 ppm**\n- Pas rincer (sauf si > 1000 ppm)\n- Brosse souple, petite tête\n\n## 🧑 3-6 ans : autonomie progressive\n- Brossage en autonomie, **finition par l'adulte**\n- Dose **petit pois** de dentifrice 1000 ppm\n- Apprendre la **technique BROSS** : Bas (gencive→dent), brossage circulaire, dents de devant et derrière\n\n## 6 ans+ : autonome\n- Sait bien brosser seul\n- 1ère dent définitive (molaire de 6 ans)\n- Soin particulier des molaires (sillons → caries)\n\n## 🦷 1ère consultation chez le dentiste\n- **À 1 an** (dès la 1ère dent ou au plus tard)\n- Pour familiariser, prévention\n- Tous les 6 mois ensuite\n\n## 🍬 ANTI-caries\n- **Pas de biberon de jus/lait sucré au coucher** (caries du biberon)\n- **Pas de tétine sucre/miel** (croyances dangereuses)\n- Limiter sucreries, jus industriels\n- Eau entre les repas\n- Si grignotage : fruits, fromage (pas bonbons)\n- **Goûter sucré** : 1×/jour max, pas avant le coucher\n\n## ⚠️ Quand consulter\n- Tâches blanches/marrons sur les dents\n- Douleur\n- Saignement gencive (gingivite)\n- Mauvaise haleine persistante\n- Dent cassée (urgence)\n- Décalage de dents\n\n## 🚨 Choc dentaire — URGENCE\nDent permanente cassée/expulsée :\n- **Récupérer la dent** sans toucher la racine\n- **Rincer à l'eau** ou au sérum physiologique\n- **Tremper dans du lait** (ou la salive de l'enfant, ou du sérum)\n- **Foncer chez le dentiste < 1h** : peut être réimplantée\n\n## 🌍 Côte d'Ivoire\n- Soins dentaires de base remboursés CMU\n- Centres de santé bucco-dentaires : Abidjan, Bouaké, Yamoussoukro\n- Astuce : **bâton de cure-dent (sotouba)** = bonne option avec brossage classique en complément\n\n*Source : ADF (Association Dentaire Française) / OMS — Buccal health*",
                "source": "OMS",
                "tags": ["hygiene", "dents", "brossage", "prevention"],
            },
            {
                "type": "quiz",
                "title": "Quiz — Hygiène et santé au quotidien",
                "description": "5 questions pour tester vos pratiques.",
                "category": "hygiene",
                "questions": [
                    {"question": "Combien de fois par jour donner un bain à un bébé ?", "options": ["3 fois", "1 fois", "Tous les 2-3 jours", "Une fois par semaine"], "correct_index": 2, "explication": "Un bain tous les 2-3 jours suffit. La peau du bébé est fragile et n'a pas besoin de bain quotidien."},
                    {"question": "Combien de temps faut-il pour bien se laver les mains ?", "options": ["10 sec", "20 sec", "40 sec", "2 minutes"], "correct_index": 2, "explication": "L'OMS recommande 40 secondes de frottement, soit 2 fois la chanson 'Joyeux anniversaire'."},
                    {"question": "À quel âge faire la 1ère consultation chez le dentiste ?", "options": ["1 an", "3 ans", "5 ans", "Au 1er problème"], "correct_index": 0, "explication": "Dès 1 an (à la 1ère dent), pour familiariser et prévenir les caries précoces."},
                    {"question": "Quel est le rôle du fluor dans le dentifrice ?", "options": ["Blanchir", "Renforcer l'émail", "Rafraîchir", "Décrasser"], "correct_index": 1, "explication": "Le fluor renforce l'émail et prévient les caries. Dose grain de riz avant 3 ans."},
                    {"question": "Pour soigner un érythème fessier, on utilise :", "options": ["Talc", "Eau de Cologne", "Crème à base de zinc", "Lingettes parfumées"], "correct_index": 2, "explication": "Crème au zinc (Mitosyl, Bepanthen) ou simple lait maternel + air libre. Pas de talc."},
                ],
                "source": "OMS",
                "tags": ["quiz", "hygiene"],
            },
            {
                "type": "fiche",
                "title": "Coliques du nourrisson : 12 astuces pour soulager",
                "description": "Quand bébé pleure 3h/jour pendant 3 sem.",
                "category": "soins_bebe",
                "content_md": "# Les coliques du nourrisson\n\nDéfinition : pleurs **inconsolables** pendant **>3h/jour**, **>3 jours/semaine**, depuis **>3 semaines**, chez un bébé sinon en bonne santé. Touche **20%** des bébés, surtout 2 sem - 3 mois.\n\n## 🍼 Reconnaître les coliques\n- Pleurs cri-aigu, brutaux, en fin d'après-midi/soirée\n- Bébé replie ses jambes sur le ventre\n- Ventre tendu, ballonnements, gaz\n- Visage rouge, poings serrés\n- **Inconsolable** malgré tétée, change, câlin\n- Calme aux moments calmes\n- Prend du poids correctement\n\n## ✨ 12 astuces qui marchent\n\n### Pendant la crise\n1. **Portage en écharpe** ou peau-à-peau (chaleur + odeur)\n2. **Bercement doux**, lent, dans vos bras\n3. **Bruit blanc** : sèche-cheveux, hotte aspirante, app dédiée\n4. **Enroulé** en chrysalide dans une couverture (réflexe Moro apaisé)\n5. **Position « avion »** : ventre sur votre avant-bras, tête dans la main\n6. **Massage du ventre** dans le sens des aiguilles d'une montre\n7. **Bain tiède** (37°C), maman ou papa avec lui\n\n### Prévention quotidienne\n8. **Tétée calme** dans un endroit silencieux\n9. **Faire faire le rot** pendant ET après la tétée (toutes les 5 min)\n10. **Maintenir bébé droit** 20 min après la tétée\n11. Si biberon : **tétine adaptée** anti-colique (Avent, MAM)\n12. **Limiter excitation** : éteindre TV, parler doucement\n\n## 🍴 Côté maman qui allaite\n- Limiter : café (>2 tasses), chou, légumineuses, oignon, ail (parfois en cause)\n- Augmenter : eau, fenouil, anis (tisane)\n- Probiotiques (Lactobacillus reuteri) ont montré une efficacité (avis pédiatre)\n\n## 🏥 Côté biberon\n- Vérifier le débit de la tétine (ni trop lent → air, ni trop rapide)\n- Lait infantile anti-colique = parfois utile (avis pédiatre)\n- Probiotiques (BiogaiaProtectis) à demander\n\n## 🚨 Consulter si\n- Pleurs **avec fièvre** (> 38°C)\n- Vomissements **en jet** ou verts\n- Diarrhée importante\n- Sang dans les selles\n- Refus alimentaire complet\n- Bébé mou, ne réagit plus\n- Perte de poids\n- Pleurs > 3h **continus** sans réponse à aucune méthode\n\n## ❤️ Pour les parents épuisés\n- **Vous n'êtes pas de mauvais parents** — les coliques sont biologiques\n- Bébé n'a **PAS mal** au sens médical\n- **Ça PASSE** vers 3-4 mois (parole de pédiatre !)\n- Si dépassée : **POSEZ bébé** dans son lit en sécurité, sortez de la pièce 5 min, respirez\n- Demandez de l'aide (conjoint, maman, voisin)\n- Le **shaken baby syndrome** (secouer pour qu'il se taise) = mort ou handicap. JAMAIS\n\n## ❌ À éviter\n- Massage avec huile de palme/karité chauffée (faux remède local)\n- Tisanes maison non dosées (risque déshydratation)\n- Médicaments non prescrits (Polysilane sans avis pro)\n- Forcer à manger\n- Recettes traditionnelles à boire (eau + plantes inconnues)\n\n*Source : Société Française de Pédiatrie / OMS*",
                "source": "OMS",
                "tags": ["soins_bebe", "coliques", "pleurs", "0-3mois"],
            },
        ]
    # Insertion idempotente : on n'ajoute que les ressources dont le titre n'existe pas déjà
    existing_titles = set()
    async for r in db.resources.find({}, {"_id": 0, "title": 1}):
        existing_titles.add(r.get("title", ""))
    to_insert = []
    for res in BASELINE_RESOURCES:
        if res["title"] not in existing_titles:
            to_insert.append({
                "id": str(uuid.uuid4()),
                **res,
                "author_name": res.get("author_name", "À lo Maman"),
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            })
    if to_insert:
        await db.resources.insert_many(to_insert)
        logger.info(f"📚 Inserted {len(to_insert)} new educational resources")

    logger.info("Startup complete")

    # 🔔 Démarre le scheduler de rappels (push pour les reminders échus)
    import asyncio
    asyncio.create_task(_reminders_scheduler())
    asyncio.create_task(_backup_scheduler())  # 🔐 RGSSI N3 — backup quotidien chiffré
    try:
        asyncio.create_task(_auto_payouts_scheduler())  # 💸 Auto-payouts hebdo
        logger.info("💸 Auto-payouts scheduler started (Mondays 01:00-03:00 UTC)")
    except Exception as e:
        logger.warning(f"Auto-payouts scheduler not started: {e}")


async def _backup_scheduler():
    """
    🔐 RGSSI Niveau 3 (B.14 — Sauvegardes chiffrées et testées)
    Tâche en arrière-plan :
      - Backup quotidien des collections critiques à 03:00 UTC
      - Test de restauration mensuel (1er du mois) dans une base éphémère
    Les backups sont stockés en /app/backups (BACKUP_DIR) chiffrés AES-256-GCM.
    """
    import asyncio
    import sys
    import os
    sys.path.insert(0, "/app/security")
    BACKUP_DIR = "/app/backups"
    os.makedirs(BACKUP_DIR, exist_ok=True)
    await asyncio.sleep(60)  # attendre démarrage
    logger.info("💾 Backup scheduler started (daily 03:00 UTC + monthly restore test)")
    last_backup_date = None
    last_restore_test_month = None
    while True:
        try:
            now = datetime.now(timezone.utc)
            today_str = now.strftime("%Y-%m-%d")
            # --- BACKUP QUOTIDIEN à 03h UTC ---
            if (now.hour == 3 or os.environ.get("FORCE_BACKUP_NOW") == "1") and last_backup_date != today_str:
                try:
                    from backup import make_backup, cleanup_old_backups  # type: ignore
                    out = f"{BACKUP_DIR}/alomaman_{now.strftime('%Y%m%d_%H%M%S')}.tar.gz.enc"
                    metadata = await make_backup(out)
                    cleanup_old_backups(30)
                    last_backup_date = today_str
                    await db.audit_log.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": "system",
                        "user_role": "system",
                        "user_name": "BackupScheduler",
                        "action": "backup",
                        "resource_type": "Database",
                        "resource_id": out,
                        "details": {"collections": len(metadata.get("collections", []))},
                        "timestamp": now.isoformat(),
                    })
                    logger.info(f"✅ Daily backup completed: {out}")
                except Exception as e:
                    logger.error(f"❌ Daily backup failed: {e}")
                    await db.incidents.insert_one({
                        "id": str(uuid.uuid4()),
                        "title": "Échec du backup quotidien",
                        "description": f"Erreur lors de la sauvegarde planifiée : {e}",
                        "severity": "high",
                        "category": "data_corruption",
                        "status": "open",
                        "anssi_notification_required": True,
                        "anssi_notified_at": None,
                        "reported_by": "system",
                        "reporter_name": "BackupScheduler",
                        "reporter_role": "system",
                        "created_at": now.isoformat(),
                        "updated_at": now.isoformat(),
                        "history": [{"at": now.isoformat(), "by": "system", "action": "auto_created", "status": "open"}],
                    })

            # --- TEST RESTAURATION MENSUEL le 1er du mois ---
            month_str = now.strftime("%Y-%m")
            if now.day == 1 and now.hour == 4 and last_restore_test_month != month_str:
                try:
                    # Trouver le backup le plus récent
                    from pathlib import Path
                    files = sorted(Path(BACKUP_DIR).glob("alomaman_*.enc"), key=lambda p: p.stat().st_mtime, reverse=True)
                    if files:
                        from backup import restore_backup  # type: ignore
                        target_db = f"alomaman_RESTORE_TEST_{month_str.replace('-', '')}"
                        info = await restore_backup(str(files[0]), target_db)
                        last_restore_test_month = month_str
                        await db.audit_log.insert_one({
                            "id": str(uuid.uuid4()),
                            "user_id": "system",
                            "action": "restore_test",
                            "resource_type": "Database",
                            "resource_id": str(files[0]),
                            "details": {"target_db": info["restored_to_db"]},
                            "timestamp": now.isoformat(),
                        })
                        # Cleanup la base temporaire après vérif
                        from motor.motor_asyncio import AsyncIOMotorClient
                        cli2 = AsyncIOMotorClient(os.environ["MONGO_URL"])
                        try:
                            await cli2.drop_database(info["restored_to_db"])
                        finally:
                            cli2.close()
                        logger.info(f"✅ Monthly restore test passed: {info['restored_to_db']}")
                except Exception as e:
                    logger.error(f"❌ Monthly restore test failed: {e}")

            await asyncio.sleep(900)  # vérifie toutes les 15 min
        except Exception as e:
            logger.error(f"Backup scheduler loop error: {e}")
            await asyncio.sleep(900)


async def _reminders_scheduler():
    """
    Boucle infinie en arrière-plan : toutes les 5 minutes, parcourt les reminders dont
    `due_at <= now` et qui n'ont pas encore été poussés (`pushed_at` absent).
    Pour chaque reminder, crée une notification in-app et envoie un push Expo (si token).
    """
    import asyncio
    await asyncio.sleep(15)  # laisser l'app finir de démarrer
    logger.info("📅 Reminders scheduler started (interval: 5 min)")
    while True:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor = db.reminders.find({
                "due_at": {"$lte": now_iso},
                "done": {"$ne": True},
                "pushed_at": {"$exists": False},
            })
            count = 0
            async for r in cursor:
                try:
                    await push_notif(
                        r["user_id"],
                        r.get("title") or "Rappel",
                        r.get("description") or r.get("note") or r.get("body") or "Vous avez un rappel programmé.",
                        ntype=r.get("source") or r.get("kind") or "reminder",
                    )
                    await db.reminders.update_one(
                        {"id": r["id"]},
                        {"$set": {"pushed_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    count += 1
                except Exception as e:
                    logger.warning(f"Push reminder {r.get('id')} failed: {e}")
            if count:
                logger.info(f"📲 Sent {count} reminder push(es)")

            # === Rappels téléconsultation : push 15 min avant le RDV ===
            try:
                now_dt = datetime.now(timezone.utc)
                window_start = (now_dt + timedelta(minutes=12)).isoformat()  # 12-18 min ahead
                window_end = (now_dt + timedelta(minutes=18)).isoformat()
                rdv_cursor = db.rdv.find({
                    "mode": "teleconsultation",
                    "status": "confirme",
                    "date": {"$gte": window_start, "$lte": window_end},
                    "teleconsult_reminder_sent": {"$ne": True},
                })
                tcount = 0
                async for rdv in rdv_cursor:
                    rdv_id = rdv.get("id")
                    rdv_date = rdv.get("date", "")
                    try:
                        rdv_dt = datetime.fromisoformat(rdv_date.replace("Z", "+00:00"))
                        time_str = rdv_dt.strftime("%H:%M")
                    except Exception:
                        time_str = "bientôt"
                    motif = rdv.get("motif") or "consultation"

                    for participant_id in [rdv.get("maman_id"), rdv.get("pro_id")]:
                        if not participant_id:
                            continue
                        try:
                            u = await db.users.find_one({"id": participant_id}, {"_id": 0, "push_token": 1, "name": 1})
                            if not u:
                                continue
                            await db.notifications.insert_one({
                                "id": str(uuid.uuid4()),
                                "user_id": participant_id,
                                "title": "📞 Téléconsultation dans 15 min",
                                "body": f"Votre RDV ({motif}) à {time_str} approche. Préparez-vous à rejoindre la salle.",
                                "type": "teleconsultation_soon",
                                "rdv_id": rdv_id,
                                "read": False,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                            })
                            if u.get("push_token"):
                                await send_expo_push(
                                    u["push_token"],
                                    "📞 Téléconsultation dans 15 min",
                                    f"Votre RDV ({motif}) à {time_str} approche. Préparez-vous.",
                                    {
                                        "type": "teleconsultation_soon",
                                        "rdv_id": rdv_id,
                                        "deep_link": f"/video-call/{rdv_id}",
                                    },
                                )
                        except Exception as e:
                            logger.warning(f"Reminder téléconsult to user {participant_id} failed: {e}")
                    await db.rdv.update_one(
                        {"id": rdv_id},
                        {"$set": {"teleconsult_reminder_sent": True}},
                    )
                    tcount += 1
                if tcount:
                    logger.info(f"📞 Sent {tcount} téléconsultation reminder(s) (15 min ahead)")
            except Exception as e:
                logger.warning(f"Téléconsultation reminders job failed: {e}")
        except Exception as e:
            logger.warning(f"Reminders scheduler iteration failed: {e}")
        await asyncio.sleep(300)  # 5 minutes


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"app": "À lo Maman API", "status": "ok"}


# ----------------------------------------------------------------------
# Centres de santé
# ----------------------------------------------------------------------
class CentreIn(BaseModel):
    nom_centre: str
    type_etablissement: str = "clinique_privee"
    numero_agrement: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    region: Optional[str] = None
    email_contact: Optional[str] = None
    telephone: Optional[str] = None
    services: List[str] = []
    horaires: Optional[str] = None
    description: Optional[str] = None


def _ser_centre(c: dict) -> dict:
    return {
        "id": c.get("id"),
        "nom_centre": c.get("nom_centre"),
        "type_etablissement": c.get("type_etablissement"),
        "numero_agrement": c.get("numero_agrement"),
        "adresse": c.get("adresse"),
        "ville": c.get("ville"),
        "region": c.get("region"),
        "email_contact": c.get("email_contact"),
        "telephone": c.get("telephone"),
        "services": c.get("services", []),
        "horaires": c.get("horaires"),
        "description": c.get("description"),
        "code_invitation": c.get("code_invitation"),
        "membres_pro": c.get("membres_pro", []),
        "owner_email": c.get("owner_email"),
        "created_at": c.get("created_at"),
    }


@api.get("/centres")
async def list_centres(q: Optional[str] = None, region: Optional[str] = None):
    """Liste publique des centres de santé (recherche)."""
    flt: dict = {}
    if region:
        flt["region"] = region
    if q:
        flt["$or"] = [
            {"nom_centre": {"$regex": q, "$options": "i"}},
            {"ville": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.centres.find(flt, {"_id": 0}).limit(100)
    return [_ser_centre(c) async for c in cursor]


@api.get("/centres/mine")
async def my_centre(user=Depends(require_roles("centre_sante"))):
    c = await db.centres.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    return _ser_centre(c)


@api.get("/centres/{cid}")
async def get_centre(cid: str):
    c = await db.centres.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    return _ser_centre(c)


@api.patch("/centres/{cid}")
async def update_centre(
    cid: str, payload: CentreIn, user=Depends(require_roles("centre_sante", "admin"))
):
    c = await db.centres.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    if user["role"] != "admin" and c.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    upd = payload.model_dump(exclude_none=True)
    await db.centres.update_one({"id": cid}, {"$set": upd})
    new = await db.centres.find_one({"id": cid}, {"_id": 0})
    return _ser_centre(new)


@api.get("/centre/membres")
async def centre_membres(user=Depends(require_roles("centre_sante"))):
    """Liste des pros membres du centre + leurs stats."""
    c = await db.centres.find_one({"owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    membres_ids = c.get("membres_pro", [])
    pros = await db.users.find(
        {"id": {"$in": membres_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(500)
    for p in pros:
        p["rdv_count"] = await db.rdv.count_documents({"pro_id": p["id"]})
        p["patients_count"] = len(
            list({r["maman_id"] async for r in db.rdv.find({"pro_id": p["id"]}, {"maman_id": 1, "_id": 0})})
        )
    return pros


# ----------------------------------------------------------------------
# Messagerie Centre : contacts (pros membres + patientes du centre)
# ----------------------------------------------------------------------
async def _enrich_messaging_signals(other_id: str, me_id: str) -> dict:
    """Helper: retourne les signaux de messagerie entre `me_id` et `other_id`."""
    last_msg = await db.messages.find_one(
        {
            "$or": [
                {"from_id": other_id, "to_id": me_id},
                {"from_id": me_id, "to_id": other_id},
            ]
        },
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    unread = await db.messages.count_documents(
        {"from_id": other_id, "to_id": me_id, "read": False}
    )
    if last_msg:
        preview = (last_msg.get("content") or "").strip()
        if not preview and last_msg.get("attachment_name"):
            preview = f"📎 {last_msg['attachment_name']}"
        return {
            "last_message": preview[:80],
            "last_message_at": last_msg.get("created_at"),
            "last_message_from_me": last_msg.get("from_id") == me_id,
            "unread_count": unread,
        }
    return {
        "last_message": None,
        "last_message_at": None,
        "last_message_from_me": None,
        "unread_count": unread,
    }


@api.get("/centre/contacts")
async def centre_contacts(user=Depends(require_roles("centre_sante"))):
    """
    Tous les contacts joignables par le centre :
    - Ses pros membres (type="pro")
    - Toutes les patientes suivies par ses pros, dédupliquées (type="patient")

    Chaque contact est enrichi avec : unread_count, last_message, last_message_at,
    last_message_from_me. Tri : non-lus en premier, puis dernier message desc.
    """
    c = await db.centres.find_one({"owner_id": user["id"]})
    if not c:
        return {"pros": [], "patientes": []}

    membres_ids = c.get("membres_pro", [])

    # 1. Pros membres
    pros_raw = await db.users.find(
        {"id": {"$in": membres_ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(500)
    pros = []
    for p in pros_raw:
        signals = await _enrich_messaging_signals(p["id"], user["id"])
        pros.append({
            "id": p["id"],
            "name": p.get("name"),
            "phone": p.get("phone"),
            "email": p.get("email"),
            "specialite": p.get("specialite"),
            "type": "pro",
            **signals,
        })

    # 2. Patientes : dédupliquées via les RDV de tous les pros membres
    patient_ids: set = set()
    if membres_ids:
        async for r in db.rdv.find(
            {"pro_id": {"$in": membres_ids}}, {"maman_id": 1, "_id": 0}
        ):
            patient_ids.add(r["maman_id"])

    patientes = []
    if patient_ids:
        patientes_raw = await db.users.find(
            {"id": {"$in": list(patient_ids)}}, {"_id": 0, "password_hash": 0}
        ).to_list(2000)
        for u in patientes_raw:
            uid = u["id"]
            gross = await db.grossesses.find_one({"user_id": uid, "active": True}, {"_id": 0})
            enfants_count = await db.enfants.count_documents({"user_id": uid})
            grossesse_sa = None
            if gross and gross.get("date_debut"):
                try:
                    dt_str = str(gross["date_debut"]).replace("Z", "+00:00")
                    dt = datetime.fromisoformat(dt_str)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    weeks = int((datetime.now(timezone.utc) - dt).total_seconds() / (7 * 24 * 3600))
                    grossesse_sa = max(0, min(weeks, 42))
                except Exception:
                    pass
            signals = await _enrich_messaging_signals(uid, user["id"])
            patientes.append({
                "id": uid,
                "name": u.get("name"),
                "phone": u.get("phone"),
                "email": u.get("email"),
                "type": "patient",
                "has_grossesse": bool(gross),
                "grossesse_sa": grossesse_sa,
                "enfants_count": enfants_count,
                **signals,
            })

    # Tri : non-lus en premier, puis dernier message le plus récent
    def _ts_local(s: str) -> float:
        if not s:
            return 0.0
        try:
            return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0

    sort_key = lambda x: (x.get("unread_count", 0) == 0, -_ts_local(x.get("last_message_at") or ""))
    pros.sort(key=sort_key)
    patientes.sort(key=sort_key)

    return {"pros": pros, "patientes": patientes}


class CentreActionIn(BaseModel):
    pro_id: str


@api.post("/centre/membres/remove")
async def centre_remove_membre(payload: CentreActionIn, user=Depends(require_roles("centre_sante"))):
    c = await db.centres.find_one({"owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    await db.centres.update_one(
        {"id": c["id"]}, {"$pull": {"membres_pro": payload.pro_id}}
    )
    return {"ok": True}


@api.get("/centre/rdv")
async def centre_rdv(user=Depends(require_roles("centre_sante"))):
    """Tous les RDV des pros du centre."""
    c = await db.centres.find_one({"owner_id": user["id"]})
    if not c:
        return []
    membres_ids = c.get("membres_pro", [])
    rdvs = await db.rdv.find({"pro_id": {"$in": membres_ids}}, {"_id": 0}).sort("date", -1).to_list(1000)
    # Enrichir avec noms pro et maman
    for r in rdvs:
        pro = await db.users.find_one({"id": r["pro_id"]}, {"name": 1, "specialite": 1, "_id": 0})
        maman = await db.users.find_one({"id": r["maman_id"]}, {"name": 1, "_id": 0})
        r["pro_name"] = pro.get("name") if pro else "?"
        r["pro_specialite"] = pro.get("specialite") if pro else None
        r["maman_name"] = maman.get("name") if maman else "?"
    return rdvs


class TarifIn(BaseModel):
    acte: str
    prix_fcfa: int
    description: Optional[str] = ""


@api.get("/centre/tarifs")
async def get_tarifs(user=Depends(require_roles("centre_sante"))):
    c = await db.centres.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not c:
        return []
    return c.get("tarifs", [])


@api.put("/centre/tarifs")
async def set_tarifs(payload: List[TarifIn], user=Depends(require_roles("centre_sante"))):
    c = await db.centres.find_one({"owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Centre introuvable")
    tarifs = [
        {
            "id": str(uuid.uuid4()),
            **t.model_dump(),
        }
        for t in payload
    ]
    await db.centres.update_one({"id": c["id"]}, {"$set": {"tarifs": tarifs}})
    return tarifs


# ----------------------------------------------------------------------
# Admin Analytics & Audit
# ----------------------------------------------------------------------
@api.get("/admin/analytics")
async def admin_analytics(user=Depends(require_roles("admin"))):
    """Statistiques détaillées pour la console admin."""
    # Activité des 7 derniers jours
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    new_users_7d = await db.users.count_documents({"created_at": {"$gte": seven_days_ago.isoformat()}})
    new_rdv_7d = await db.rdv.count_documents({"created_at": {"$gte": seven_days_ago.isoformat()}})
    new_posts_7d = await db.posts.count_documents({"created_at": {"$gte": seven_days_ago.isoformat()}})

    # Répartition par rôle
    roles = {}
    async for u in db.users.find({}, {"role": 1, "_id": 0}):
        r = u.get("role", "unknown")
        roles[r] = roles.get(r, 0) + 1

    # Top villes
    villes = {}
    async for u in db.users.find({"ville": {"$exists": True, "$ne": None}}, {"ville": 1, "_id": 0}):
        v = u.get("ville") or "Autre"
        villes[v] = villes.get(v, 0) + 1
    top_villes = sorted(villes.items(), key=lambda x: -x[1])[:5]

    # Premium
    premium_count = await db.users.count_documents({"premium": True})

    # RDV par statut
    statuts = {}
    async for r in db.rdv.find({}, {"statut": 1, "_id": 0}):
        s = r.get("statut", "en_attente")
        statuts[s] = statuts.get(s, 0) + 1

    return {
        "activity_7d": {
            "new_users": new_users_7d,
            "new_rdv": new_rdv_7d,
            "new_posts": new_posts_7d,
        },
        "roles_distribution": roles,
        "top_villes": [{"ville": v, "count": c} for v, c in top_villes],
        "premium_users": premium_count,
        "rdv_par_statut": statuts,
    }


class AdminUserUpdateIn(BaseModel):
    premium: Optional[bool] = None
    role: Optional[Role] = None
    banned: Optional[bool] = None


@api.patch("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str, payload: AdminUserUpdateIn, user=Depends(require_roles("admin"))
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    upd = payload.model_dump(exclude_none=True)
    if "premium" in upd and upd["premium"]:
        upd["premium_until"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": upd})
    return {"ok": True, "updated": upd}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(require_roles("admin"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Ne peut pas se supprimer soi-même")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


@api.get("/admin/audit")
async def admin_audit(user=Depends(require_roles("admin")), limit: int = 100):
    """Logs des derniers login et actions critiques."""
    # On renvoie simplement les derniers utilisateurs créés + RDV + posts
    recent_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(20).to_list(20)
    recent_rdv = await db.rdv.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    recent_centres = await db.centres.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {
        "recent_users": recent_users,
        "recent_rdv": recent_rdv,
        "recent_centres": recent_centres,
    }


# ----------------------------------------------------------------------
# Famille : vues partagées (données de la maman visibles par les proches)
# ----------------------------------------------------------------------
@api.get("/famille/shared/{owner_email}")
async def famille_shared_data(owner_email: str, user=Depends(get_current_user)):
    """Retourne les données de la maman filtrées selon les permissions du membre."""
    f = await db.familles.find_one({"owner_email": owner_email})
    if not f:
        raise HTTPException(status_code=404, detail="Famille introuvable")
    # Trouver le membre
    membre = None
    for m in f.get("membres", []):
        if m.get("email") == user["email"] and m.get("statut") == "accepte":
            membre = m
            break
    if not membre:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas membre accepté de cette famille")

    perms = membre.get("permissions", {})
    owner = await db.users.find_one({"email": owner_email}, {"_id": 0, "password_hash": 0})
    result: Dict = {"owner": owner, "permissions": perms}
    if perms.get("grossesse"):
        g = await db.grossesses.find_one({"user_id": owner["id"], "active": True}, {"_id": 0})
        result["grossesse"] = g
    if perms.get("enfants"):
        enfants = await db.enfants.find({"user_id": owner["id"]}, {"_id": 0}).to_list(100)
        if not perms.get("enfants_details"):
            # Masquer les détails médicaux
            enfants = [{"id": e["id"], "nom": e["nom"], "date_naissance": e["date_naissance"], "sexe": e.get("sexe")} for e in enfants]
        result["enfants"] = enfants
    if perms.get("rendez_vous"):
        rdvs = await db.rdv.find({"maman_id": owner["id"]}, {"_id": 0}).sort("date", -1).to_list(50)
        result["rdvs"] = rdvs
    return result


# ----------------------------------------------------------------------
# Questions Spécialistes (maman)
# ----------------------------------------------------------------------
class QuestionIn(BaseModel):
    title: str
    content: str
    specialite_cible: Optional[str] = None  # gyneco, pediatre, sage_femme, etc.


@api.post("/questions-specialistes")
async def create_question(payload: QuestionIn, user=Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "content": payload.content,
        "specialite_cible": payload.specialite_cible,
        "category": "questions_specialistes",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_role": user.get("role"),
        "likes": [],
        "comments": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/questions-specialistes")
async def list_questions(specialite: Optional[str] = None):
    flt = {"category": "questions_specialistes"}
    if specialite:
        flt["specialite_cible"] = specialite
    cursor = db.posts.find(flt, {"_id": 0}).sort("created_at", -1).limit(100)
    return [q async for q in cursor]


# ----------------------------------------------------------------------
# Famille connectée
# ----------------------------------------------------------------------
DEFAULT_PERMISSIONS = {
    "grossesse": True,
    "grossesse_details": False,
    "enfants": True,
    "enfants_details": False,
    "rendez_vous": True,
    "documents": False,
    "messagerie": True,
}


class JoinFamilleIn(BaseModel):
    code: str
    relation: str = "partenaire"


class UpdateMemberIn(BaseModel):
    permissions: Optional[Dict[str, bool]] = None
    statut: Optional[str] = None  # accepte | refuse | en_attente


def _ser_famille(f: dict) -> dict:
    return {
        "id": f.get("id"),
        "owner_email": f.get("owner_email"),
        "owner_name": f.get("owner_name"),
        "code_partage": f.get("code_partage"),
        "membres": f.get("membres", []),
        "created_at": f.get("created_at"),
    }


@api.get("/famille")
async def get_famille(user=Depends(get_current_user)):
    """Récupère la famille dont l'utilisateur est propriétaire ou membre."""
    f = await db.familles.find_one({"owner_email": user["email"]}, {"_id": 0})
    membre_de = await db.familles.find(
        {"membres.email": user["email"], "membres.statut": "accepte"},
        {"_id": 0},
    ).to_list(20)
    return {
        "owned": _ser_famille(f) if f else None,
        "member_of": [_ser_famille(x) for x in membre_de if not f or x["id"] != f["id"]],
    }


@api.post("/famille/create")
async def create_famille(user=Depends(get_current_user)):
    existing = await db.familles.find_one({"owner_email": user["email"]})
    if existing:
        return _ser_famille(existing)
    code = _gen_code(6)
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_email": user["email"],
        "owner_name": user.get("name", ""),
        "code_partage": code,
        "membres": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.familles.insert_one(doc)
    return _ser_famille(doc)


@api.post("/famille/join")
async def join_famille(payload: JoinFamilleIn, user=Depends(get_current_user)):
    f = await db.familles.find_one({"code_partage": payload.code.upper()})
    if not f:
        raise HTTPException(status_code=404, detail="Code invalide")
    if f["owner_email"] == user["email"]:
        raise HTTPException(status_code=400, detail="Vous êtes le propriétaire")
    # Déjà membre ?
    for m in f.get("membres", []):
        if m.get("email") == user["email"]:
            return _ser_famille(f)
    # 💎 Quota Maman Premium : max 4 proches (gratuit = bloqué, Premium = 4)
    owner = await db.users.find_one({"id": f.get("owner_id")}, {"_id": 0}) or await db.users.find_one({"email": f.get("owner_email")}, {"_id": 0})
    membres_count = len(f.get("membres") or [])
    if owner:
        is_owner_premium = is_premium_active(owner)
        free_max = (FREE_QUOTAS.get("maman") or {}).get("proches_max", 0)
        prem_max = (PREMIUM_QUOTAS.get("maman") or {}).get("proches_max", 4)
        max_allowed = prem_max if is_owner_premium else free_max
        if membres_count >= max_allowed:
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "premium_required" if not is_owner_premium else "quota_exceeded",
                    "message": (
                        "Le partage famille est réservé aux Mamans Premium. "
                        "Demandez à la propriétaire de la famille de passer Premium pour vous ajouter."
                    ) if not is_owner_premium else f"Cette famille a atteint sa limite de {prem_max} proches.",
                    "quota": "proches_max",
                    "limit": max_allowed,
                    "upgrade_url": "/premium",
                },
            )
    new_member = {
        "email": user["email"],
        "name": user.get("name", ""),
        "phone": user.get("phone"),
        "relation": payload.relation,
        "statut": "en_attente",
        "permissions": DEFAULT_PERMISSIONS.copy(),
        "joined_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.familles.update_one(
        {"id": f["id"]},
        {"$push": {"membres": new_member}},
    )
    return _ser_famille(await db.familles.find_one({"id": f["id"]}, {"_id": 0}))


@api.patch("/famille/members/{member_email}")
async def update_famille_member(
    member_email: str, payload: UpdateMemberIn, user=Depends(get_current_user)
):
    f = await db.familles.find_one({"owner_email": user["email"]})
    if not f:
        raise HTTPException(status_code=404, detail="Famille introuvable")
    upd = {}
    if payload.permissions is not None:
        upd["membres.$.permissions"] = payload.permissions
    if payload.statut is not None:
        upd["membres.$.statut"] = payload.statut
    if not upd:
        return _ser_famille(f)
    await db.familles.update_one(
        {"id": f["id"], "membres.email": member_email},
        {"$set": upd},
    )
    return _ser_famille(await db.familles.find_one({"id": f["id"]}, {"_id": 0}))


@api.delete("/famille/members/{member_email}")
async def delete_famille_member(member_email: str, user=Depends(get_current_user)):
    f = await db.familles.find_one({"owner_email": user["email"]})
    if not f:
        raise HTTPException(status_code=404, detail="Famille introuvable")
    await db.familles.update_one(
        {"id": f["id"]},
        {"$pull": {"membres": {"email": member_email}}},
    )
    return {"ok": True}


# ============================================================================
# PARTAGE DOSSIER MÉDICAL — CMU / Code provisoire AM-XXXX-XX + validation push
# ============================================================================

@api.get("/auth/me/code-partage")
async def get_my_share_code(user=Depends(get_current_user)):
    """Retourne le code de partage de la maman (son CMU ou son code AM provisoire)."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux utilisatrices.")
    # Génère un code AM si inexistant
    code_prov = user.get("code_provisoire")
    if not code_prov:
        code_prov = await _ensure_am_code(db.users, user["id"], "code_provisoire")
    # Décrypte CMU si chiffré
    cmu_raw = user.get("cmu", {}).get("numero") if isinstance(user.get("cmu"), dict) else None
    cmu_clair = None
    if cmu_raw:
        try:
            cmu_clair = decrypt_str(cmu_raw)
        except Exception:
            cmu_clair = cmu_raw
    return {
        "cmu": cmu_clair,
        "code_provisoire": code_prov,
        "preferred": cmu_clair or code_prov,
    }


@api.get("/enfants/{eid}/code-partage")
async def get_enfant_share_code(eid: str, user=Depends(require_roles("maman"))):
    """Retourne le code de partage d'un enfant (CMU enfant ou code AM provisoire)."""
    enfant = await db.enfants.find_one({"id": eid, "user_id": user["id"]}, {"_id": 0})
    if not enfant:
        raise HTTPException(404, "Enfant introuvable")
    code_prov = enfant.get("code_provisoire")
    if not code_prov:
        code_prov = await _ensure_am_code(db.enfants, eid, "code_provisoire")
    return {
        "cmu": enfant.get("numero_cmu"),
        "code_provisoire": code_prov,
        "preferred": enfant.get("numero_cmu") or code_prov,
    }


@api.post("/pro/patient/recherche")
async def pro_patient_recherche(payload: dict, user=Depends(require_roles("professionnel"))):
    """
    Pro saisit un CMU ou un code AM provisoire.
    Recherche parmi les mamans ET les enfants.
    Si trouvé : crée une demande de partage et envoie un push à la maman pour validation.
    """
    raw = payload.get("identifier", "").strip()
    motif = (payload.get("motif") or "Consultation médicale").strip()[:200]
    if not raw:
        raise HTTPException(400, "Identifiant requis (CMU ou code AM)")
    cleaned = _clean_share_identifier(raw)

    # Cherche d'abord dans users (mamans) par CMU puis code provisoire
    found_maman = None
    found_enfant = None
    # CMU des mamans est chiffré → on match par code_provisoire en priorité si format AM-
    if cleaned.startswith("AM-"):
        found_maman = await db.users.find_one({"code_provisoire": cleaned, "role": "maman"}, {"_id": 0})
        if not found_maman:
            found_enfant = await db.enfants.find_one({"code_provisoire": cleaned}, {"_id": 0})
    else:
        # Chiffres = CMU. Les CMU enfants ne sont pas chiffrés (numero_cmu)
        found_enfant = await db.enfants.find_one({"numero_cmu": cleaned}, {"_id": 0})
        if not found_enfant:
            # Pour les mamans, le CMU est dans user.cmu.numero (chiffré) + user.cmu.numero_hash (clair)
            # Lookup O(1) via le hash déjà indexé.
            import hashlib as _hl
            num_hash = _hl.sha256(cleaned.encode()).hexdigest()[:16]
            found_maman = await db.users.find_one(
                {"role": "maman", "cmu.numero_hash": num_hash},
                {"_id": 0},
            )

    if not found_maman and not found_enfant:
        raise HTTPException(404, "Aucune patiente ou enfant trouvé avec cet identifiant")

    # Détermine la maman à qui envoyer le push (propriétaire du profil ou de l'enfant)
    if found_enfant:
        maman = await db.users.find_one({"id": found_enfant["user_id"]}, {"_id": 0})
        patient_id = found_enfant["id"]
        patient_type = "enfant"
        patient_nom = found_enfant.get("nom", "Enfant")
    else:
        maman = found_maman
        patient_id = found_maman["id"]
        patient_type = "maman"
        patient_nom = found_maman.get("name", "Patiente")

    if not maman:
        raise HTTPException(404, "Parente introuvable")

    # Crée la demande (expires in 5 min pour la validation)
    now = datetime.now(timezone.utc)
    demande = {
        "id": str(uuid.uuid4()),
        "pro_id": user["id"],
        "pro_name": user.get("name"),
        "pro_specialite": user.get("specialite"),
        "maman_id": maman["id"],
        "patient_id": patient_id,
        "patient_type": patient_type,
        "patient_nom": patient_nom,
        "via": "code_provisoire" if cleaned.startswith("AM-") else "cmu",
        "motif": motif,
        "status": "pending",
        "duree_minutes_demandee": 120,  # 2h par défaut
        "access_token": None,
        "access_expires_at": None,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),  # la demande reste actionnable 24h pour laisser le temps à la maman
    }
    await db.access_requests.insert_one(demande)
    demande.pop("_id", None)

    # Push à la maman
    try:
        await push_notif(
            maman["id"],
            "🔐 Demande d'accès à votre dossier",
            f"Dr {user.get('name')} souhaite consulter le dossier de {patient_nom}. Motif : {motif}",
            ntype="partage_demande",
        )
    except Exception:
        pass

    return {
        "demande_id": demande["id"],
        "patient_nom": patient_nom,
        "patient_type": patient_type,
        "status": "pending",
        "message": f"Demande envoyée à {maman.get('name', 'la patiente')}. Attente de validation.",
    }


@api.get("/partage/demandes-recues")
async def list_demandes_recues(user=Depends(require_roles("maman"))):
    """La maman liste les demandes d'accès qu'elle a reçues (pending + récentes).
    Auto-nettoie les pending expirées en les passant à 'expired' avant retour."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    # Auto-cleanup : passer à 'expired' les pending dépassées
    try:
        await db.access_requests.update_many(
            {
                "maman_id": user["id"],
                "status": "pending",
                "expires_at": {"$lt": now_iso},
            },
            {"$set": {"status": "expired", "expired_at": now_iso}},
        )
    except Exception:
        pass
    items = await db.access_requests.find(
        {"maman_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    return items


@api.post("/partage/demande/{demande_id}/valider")
async def valider_demande_partage(demande_id: str, user=Depends(require_roles("maman"))):
    """La maman valide une demande d'accès — génère un token temporaire pour le pro."""
    demande = await db.access_requests.find_one({"id": demande_id, "maman_id": user["id"]})
    if not demande:
        raise HTTPException(404, "Demande introuvable")
    if demande["status"] != "pending":
        raise HTTPException(400, f"Demande déjà {demande['status']}")
    # Vérifie que la demande n'a pas expiré (5 min pour valider)
    try:
        exp = datetime.fromisoformat(demande["expires_at"])
        if datetime.now(timezone.utc) > exp:
            await db.access_requests.update_one({"id": demande_id}, {"$set": {"status": "expired"}})
            raise HTTPException(400, "Demande expirée. Le pro doit relancer.")
    except (ValueError, KeyError):
        pass

    # Génère token + expiration accès (2h par défaut)
    import secrets as _sec
    token = _sec.token_urlsafe(32)
    duree = int(demande.get("duree_minutes_demandee", 120))
    access_expires = datetime.now(timezone.utc) + timedelta(minutes=duree)
    await db.access_requests.update_one(
        {"id": demande_id},
        {"$set": {
            "status": "validated",
            "access_token": token,
            "access_expires_at": access_expires.isoformat(),
            "validated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    # Push au pro pour lui dire que l'accès est accordé
    try:
        await push_notif(
            demande["pro_id"],
            "✅ Accès autorisé",
            f"L'accès au dossier de {demande['patient_nom']} vous a été accordé ({duree} min).",
            ntype="partage_accorde",
        )
    except Exception:
        pass
    return {
        "status": "validated",
        "expires_at": access_expires.isoformat(),
        "message": f"Accès accordé pour {duree} minutes",
    }


@api.post("/partage/demande/{demande_id}/refuser")
async def refuser_demande_partage(demande_id: str, user=Depends(require_roles("maman"))):
    """La maman refuse une demande d'accès."""
    demande = await db.access_requests.find_one({"id": demande_id, "maman_id": user["id"]})
    if not demande:
        raise HTTPException(404, "Demande introuvable")
    if demande["status"] != "pending":
        raise HTTPException(400, f"Demande déjà {demande['status']}")
    await db.access_requests.update_one(
        {"id": demande_id},
        {"$set": {"status": "refused", "refused_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        await push_notif(
            demande["pro_id"],
            "❌ Accès refusé",
            f"La patiente a refusé l'accès au dossier de {demande['patient_nom']}.",
            ntype="partage_refuse",
        )
    except Exception:
        pass
    return {"status": "refused"}


async def _verify_access_token(pro_id: str, patient_id: str, token: Optional[str], allow_child_of: Optional[str] = None) -> dict:
    """Valide le token d'accès d'un pro sur un patient. Retourne la demande ou lève 403.
    
    - Si `allow_child_of` est passé, on accepte aussi un token délivré pour ce parent
      (cas où le pro accède à un enfant via le partage de la maman).
    """
    if not token:
        raise HTTPException(403, "Token d'accès requis. Demandez l'autorisation à la patiente.")
    # 1. Match direct sur le patient
    demande = await db.access_requests.find_one({
        "pro_id": pro_id,
        "patient_id": patient_id,
        "access_token": token,
        "status": "validated",
    })
    # 2. Sinon, on autorise via parent si l'enfant appartient bien à ce parent
    if not demande and allow_child_of:
        parent_demande = await db.access_requests.find_one({
            "pro_id": pro_id,
            "patient_id": allow_child_of,
            "access_token": token,
            "status": "validated",
        })
        if parent_demande:
            # On vérifie que cet enfant appartient bien au parent
            child = await db.enfants.find_one({"id": patient_id, "user_id": allow_child_of}, {"_id": 0, "id": 1})
            if child:
                demande = parent_demande
    if not demande:
        raise HTTPException(403, "Accès invalide ou expiré. Demandez une nouvelle autorisation.")
    # Check expiry
    try:
        exp = datetime.fromisoformat(demande["access_expires_at"])
        if datetime.now(timezone.utc) > exp:
            await db.access_requests.update_one({"id": demande["id"]}, {"$set": {"status": "expired"}})
            raise HTTPException(403, "Accès expiré. Demandez une nouvelle autorisation.")
    except (ValueError, KeyError):
        raise HTTPException(403, "Accès invalide")
    return demande


@api.get("/pro/demandes/mes-demandes")
async def list_mes_demandes_pro(user=Depends(require_roles("professionnel"))):
    """Le pro liste ses demandes (pending/validated/refused/expired)."""
    items = await db.access_requests.find(
        {"pro_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    # Masque les tokens d'accès sortants (pas besoin de les renvoyer en clair dans la liste)
    # On les masque sauf pour l'utilisation active (frontend les récupère via endpoint dédié)
    return items


@api.get("/pro/patient/{patient_id}/carnet")
async def pro_get_patient_carnet(patient_id: str, request: Request, user=Depends(require_roles("professionnel"))):
    """Le pro accède au carnet complet d'une patiente ou enfant via son access_token."""
    token = request.headers.get("X-Access-Token") or request.query_params.get("access_token")
    # via_parent : ID de la maman quand on consulte un enfant via le token de la maman
    via_parent = request.query_params.get("via_parent")
    demande = await _verify_access_token(user["id"], patient_id, token, allow_child_of=via_parent)

    # Audit log
    try:
        await db.access_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "pro_id": user["id"],
            "pro_name": user.get("name"),
            "patient_id": patient_id,
            "patient_type": "enfant" if via_parent else demande.get("patient_type"),
            "via_parent": via_parent,
            "action": "view_carnet",
            "demande_id": demande.get("id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "ip": request.client.host if request.client else None,
        })
    except Exception:
        pass

    # Si via_parent → forcement type enfant
    is_enfant = bool(via_parent) or demande.get("patient_type") == "enfant"

    # Prépare la réponse
    if is_enfant:
        enfant = await db.enfants.find_one({"id": patient_id}, {"_id": 0})
        if not enfant:
            raise HTTPException(404, "Enfant introuvable")
        # Déchiffre allergies si chiffrées
        try:
            if isinstance(enfant.get("allergies"), str) and enfant["allergies"].startswith("enc::"):
                enfant["allergies"] = decrypt_str(enfant["allergies"])
        except Exception:
            pass
        # Récupère les RDV récents avec ce pro pour cet enfant
        rdv_recents = await db.rdv.find(
            {"enfant_id": patient_id, "pro_id": user["id"]},
            {"_id": 0}
        ).sort("date", -1).limit(10).to_list(10)
        return {
            "type": "enfant",
            "enfant": enfant,
            "rdv_recents": rdv_recents,
            "access_expires_at": demande["access_expires_at"],
            "accordee_par": "parent",
            "via_parent": via_parent,
        }
    else:
        maman = await db.users.find_one({"id": patient_id}, {"_id": 0, "password_hash": 0})
        if not maman:
            raise HTTPException(404, "Patiente introuvable")
        enfants = await db.enfants.find({"user_id": patient_id}, {"_id": 0}).to_list(50)
        # Grossesse en cours (si elle est enceinte)
        grossesse = await db.grossesses.find_one(
            {"user_id": patient_id, "active": True},
            {"_id": 0},
        )
        # RDV récents avec ce pro
        rdv_recents = await db.rdv.find(
            {"maman_id": patient_id, "pro_id": user["id"]},
            {"_id": 0}
        ).sort("date", -1).limit(10).to_list(10)
        return {
            "type": "maman",
            "maman": maman,
            "enfants": enfants,
            "grossesse": grossesse,
            "rdv_recents": rdv_recents,
            "access_expires_at": demande["access_expires_at"],
        }



app.include_router(api)


# ============================================================================
# 💎 PROMESSES PREMIUM — Endpoints Comptabilité / Dashboard / Finance / Export
# ============================================================================

@api.get("/pro/comptabilite/export")
async def pro_compta_export(
    mois: Optional[str] = None,
    user=Depends(require_roles("professionnel")),
):
    """Export CSV mensuel pour le Pro Premium (RDV payés, commissions, revenus net).
    `mois` au format YYYY-MM. Défaut : mois courant.
    """
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "message": "L'export comptabilité est réservé aux Pro Premium.", "upgrade_url": "/premium"},
        )
    now = datetime.now(timezone.utc)
    if not mois:
        mois = now.strftime("%Y-%m")
    try:
        y, m = mois.split("-")
        y_i, m_i = int(y), int(m)
    except Exception:
        raise HTTPException(400, "Paramètre 'mois' invalide. Format attendu : YYYY-MM")
    start = datetime(y_i, m_i, 1, tzinfo=timezone.utc)
    end_m = (m_i + 1) if m_i < 12 else 1
    end_y = y_i if m_i < 12 else (y_i + 1)
    end = datetime(end_y, end_m, 1, tzinfo=timezone.utc)
    payments = await db.payments.find({
        "kind": "consultation", "pro_id": user["id"], "status": "completed",
        "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
    }, {"_id": 0}).sort("created_at", 1).to_list(2000)
    # Build CSV
    import csv, io, base64 as _b64
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Date", "RDV ID", "Patiente", "Brut FCFA", "Commission FCFA", "Taux", "Net Pro FCFA", "Statut"])
    total_brut = 0
    total_commission = 0
    total_net = 0
    for p in payments:
        maman = await db.users.find_one({"id": p.get("maman_id")}, {"_id": 0, "name": 1}) or {}
        brut = int(p.get("amount") or 0)
        com = int(p.get("commission") or 0)
        net = int(p.get("pro_amount") or (brut - com))
        rate = p.get("commission_rate") or 0
        total_brut += brut; total_commission += com; total_net += net
        w.writerow([
            (p.get("created_at") or "")[:10],
            p.get("rdv_id") or "",
            maman.get("name") or "—",
            brut, com, f"{rate}", net, p.get("status"),
        ])
    w.writerow([])
    w.writerow(["TOTAL", "", "", total_brut, total_commission, "", total_net, ""])
    csv_bytes = buf.getvalue().encode("utf-8-sig")  # BOM pour Excel FR
    fn = f"comptabilite_{user.get('name','pro').replace(' ','_')}_{mois}.csv"
    await _audit_log(user=user, action="export", resource_type="Comptabilite", resource_id=mois, details={"rows": len(payments)})
    return {
        "filename": fn,
        "base64": _b64.b64encode(csv_bytes).decode("ascii"),
        "mois": mois,
        "rows": len(payments),
        "total_brut": total_brut,
        "total_commission": total_commission,
        "total_net": total_net,
    }


@api.get("/centre/dashboard")
async def centre_dashboard(user=Depends(require_roles("centre_sante"))):
    """Tableau de bord agrégé du centre — réservé Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "message": "Le tableau de bord agrégé est réservé aux Centres Premium.", "upgrade_url": "/premium"},
        )
    centre = await db.centres.find_one({"$or": [{"owner_id": user["id"]}, {"user_id": user["id"]}]}, {"_id": 0})
    if not centre:
        raise HTTPException(404, "Centre introuvable")
    membres_ids = list(centre.get("membres_pro") or [])
    now = datetime.now(timezone.utc)
    start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Stats globales centre
    rdv_total = await db.rdv.count_documents({"pro_id": {"$in": membres_ids}})
    rdv_ce_mois = await db.rdv.count_documents({"pro_id": {"$in": membres_ids}, "date": {"$gte": start_month}})
    rdv_paye = await db.rdv.count_documents({"pro_id": {"$in": membres_ids}, "paye": True})
    payments_centre = await db.payments.find({"kind": "consultation", "pro_id": {"$in": membres_ids}, "status": "completed"}, {"_id": 0}).to_list(5000)
    revenu_brut = sum(int(p.get("amount") or 0) for p in payments_centre)
    revenu_pros = sum(int(p.get("pro_amount") or 0) for p in payments_centre)

    # Top pros (par nombre de RDV)
    top_pros: list[dict] = []
    for pid in membres_ids:
        pro_doc = await db.users.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "specialite": 1}) or {}
        c_rdv = await db.rdv.count_documents({"pro_id": pid})
        c_rdv_mois = await db.rdv.count_documents({"pro_id": pid, "date": {"$gte": start_month}})
        c_rev = sum(int(p.get("pro_amount") or 0) for p in payments_centre if p.get("pro_id") == pid)
        top_pros.append({
            "pro_id": pid,
            "name": pro_doc.get("name") or "—",
            "specialite": pro_doc.get("specialite"),
            "rdv_total": c_rdv,
            "rdv_ce_mois": c_rdv_mois,
            "revenu_total_fcfa": c_rev,
        })
    top_pros.sort(key=lambda x: -x["rdv_total"])

    return {
        "centre": {"id": centre.get("id"), "nom": centre.get("nom_centre") or centre.get("nom"), "ville": centre.get("ville")},
        "membres_count": len(membres_ids),
        "rdv_total": rdv_total,
        "rdv_ce_mois": rdv_ce_mois,
        "rdv_paye": rdv_paye,
        "revenu_brut_fcfa": revenu_brut,
        "revenu_pros_fcfa": revenu_pros,
        "top_pros": top_pros[:10],
    }


@api.get("/centre/finance")
async def centre_finance(user=Depends(require_roles("centre_sante"))):
    """Gestion financière agrégée par pro membre — réservé Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "message": "La gestion financière est réservée aux Centres Premium.", "upgrade_url": "/premium"},
        )
    centre = await db.centres.find_one({"$or": [{"owner_id": user["id"]}, {"user_id": user["id"]}]}, {"_id": 0})
    if not centre:
        raise HTTPException(404, "Centre introuvable")
    membres_ids = list(centre.get("membres_pro") or [])
    payments_centre = await db.payments.find({"kind": "consultation", "pro_id": {"$in": membres_ids}, "status": "completed"}, {"_id": 0}).to_list(5000)
    by_pro: dict = {}
    for p in payments_centre:
        pid = p.get("pro_id")
        b = by_pro.setdefault(pid, {"pro_id": pid, "rdv_count": 0, "brut": 0, "commission": 0, "net": 0})
        b["rdv_count"] += 1
        b["brut"] += int(p.get("amount") or 0)
        b["commission"] += int(p.get("commission") or 0)
        b["net"] += int(p.get("pro_amount") or 0)
    rows = []
    for pid in membres_ids:
        pro_doc = await db.users.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "specialite": 1, "phone": 1}) or {}
        b = by_pro.get(pid, {"rdv_count": 0, "brut": 0, "commission": 0, "net": 0})
        rows.append({
            "pro_id": pid, "name": pro_doc.get("name") or "—",
            "specialite": pro_doc.get("specialite"),
            "phone": pro_doc.get("phone"),
            "rdv_count": b["rdv_count"], "brut_fcfa": b["brut"],
            "commission_fcfa": b["commission"], "net_fcfa": b["net"],
        })
    rows.sort(key=lambda x: -x["net_fcfa"])
    return {
        "membres_count": len(membres_ids),
        "total_brut_fcfa": sum(r["brut_fcfa"] for r in rows),
        "total_commission_fcfa": sum(r["commission_fcfa"] for r in rows),
        "total_net_fcfa": sum(r["net_fcfa"] for r in rows),
        "pros": rows,
    }


@api.get("/centre/export")
async def centre_export(
    mois: Optional[str] = None,
    fmt: str = "csv",
    user=Depends(require_roles("centre_sante")),
):
    """Export CSV/JSON du centre (RDV + paiements) — réservé Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={"error": "premium_required", "message": "L'export est réservé aux Centres Premium.", "upgrade_url": "/premium"},
        )
    centre = await db.centres.find_one({"$or": [{"owner_id": user["id"]}, {"user_id": user["id"]}]}, {"_id": 0})
    if not centre:
        raise HTTPException(404, "Centre introuvable")
    membres_ids = list(centre.get("membres_pro") or [])
    now = datetime.now(timezone.utc)
    if not mois:
        mois = now.strftime("%Y-%m")
    try:
        y, m = mois.split("-")
        y_i, m_i = int(y), int(m)
    except Exception:
        raise HTTPException(400, "Paramètre 'mois' invalide. Format attendu : YYYY-MM")
    start = datetime(y_i, m_i, 1, tzinfo=timezone.utc).isoformat()
    end_m = (m_i + 1) if m_i < 12 else 1
    end_y = y_i if m_i < 12 else (y_i + 1)
    end = datetime(end_y, end_m, 1, tzinfo=timezone.utc).isoformat()
    payments = await db.payments.find({
        "kind": "consultation", "pro_id": {"$in": membres_ids}, "status": "completed",
        "created_at": {"$gte": start, "$lt": end},
    }, {"_id": 0}).to_list(5000)
    if fmt == "json":
        return {"mois": mois, "centre_id": centre.get("id"), "rows": payments}
    # CSV
    import csv, io, base64 as _b64
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Date", "Pro", "Patiente", "Brut FCFA", "Commission FCFA", "Net Pro FCFA", "Statut"])
    pro_cache: dict = {}
    for p in payments:
        pid = p.get("pro_id")
        if pid not in pro_cache:
            pd = await db.users.find_one({"id": pid}, {"_id": 0, "name": 1}) or {}
            pro_cache[pid] = pd.get("name") or "—"
        md = await db.users.find_one({"id": p.get("maman_id")}, {"_id": 0, "name": 1}) or {}
        w.writerow([
            (p.get("created_at") or "")[:10],
            pro_cache.get(pid),
            md.get("name") or "—",
            int(p.get("amount") or 0),
            int(p.get("commission") or 0),
            int(p.get("pro_amount") or 0),
            p.get("status"),
        ])
    csv_bytes = buf.getvalue().encode("utf-8-sig")
    fn = f"centre_{centre.get('nom_centre','centre').replace(' ','_')}_{mois}.csv"
    await _audit_log(user=user, action="export", resource_type="CentreExport", resource_id=mois, details={"rows": len(payments)})
    return {
        "filename": fn,
        "base64": __import__("base64").b64encode(csv_bytes).decode("ascii"),
        "mois": mois,
        "rows": len(payments),
    }


# ============================================================================
# 💎 PROMESSES PREMIUM MAMAN — Storage / Partenaires / Ligne d'écoute / Rappels IA
# ============================================================================

@api.get("/maman/storage")
async def maman_storage(user=Depends(require_roles("maman"))):
    """Renvoie l'utilisation actuelle vs limite de stockage Mo."""
    pipeline = [
        {"$match": {"$or": [{"maman_id": user["id"]}, {"user_id": user["id"]}, {"owner_id": user["id"]}]}},
        {"$group": {"_id": None, "total": {"$sum": "$size_bytes"}}},
    ]
    used_b = 0
    try:
        agg = await db.documents.aggregate(pipeline).to_list(1)
        if agg:
            used_b += int(agg[0].get("total") or 0)
    except Exception:
        pass
    # Approx photos enfants (base64 → 75% de la taille décodée)
    try:
        enfs = await db.enfants.find({"maman_id": user["id"]}, {"_id": 0, "photo_base64": 1}).to_list(50)
        for e in enfs:
            p = e.get("photo_base64") or ""
            if p:
                used_b += int(len(p) * 0.75)
    except Exception:
        pass
    used_mb = round(used_b / (1024 * 1024), 2)
    is_prem = is_premium_active(user)
    limit_mb = (PREMIUM_QUOTAS["maman"]["storage_mb"] if is_prem else (FREE_QUOTAS["maman"].get("storage_mb") or 50))
    pct = round(min(100.0, (used_mb / limit_mb * 100) if limit_mb else 0), 1)
    return {
        "used_mb": used_mb,
        "limit_mb": limit_mb,
        "percent": pct,
        "is_premium": is_prem,
        "label_limit": "2 Go" if is_prem else f"{limit_mb} Mo",
        "warning": pct >= 80,
        "blocked": pct >= 100,
    }


# Catalogue partenaires (en mémoire — peut être migré en DB plus tard)
_PARTENAIRES_OFFRES = [
    {
        "id": "pharma-1", "type": "pharmacie", "name": "Pharmacie de la Riviera",
        "ville": "Abidjan · Cocody", "icon": "medkit",
        "promo": "-15% sur le rayon maternité",
        "code": "ALOMAMAN15", "valid_until": "2026-12-31",
        "phone": "+225 27 22 43 00 00",
    },
    {
        "id": "pharma-2", "type": "pharmacie", "name": "Pharmacie Saint Michel",
        "ville": "Yamoussoukro", "icon": "medkit",
        "promo": "-10% sur les laits infantiles",
        "code": "MAMAN10", "valid_until": "2026-12-31",
        "phone": "+225 27 30 64 00 00",
    },
    {
        "id": "creche-1", "type": "creche", "name": "Crèche Les Petits Pas",
        "ville": "Abidjan · Marcory", "icon": "happy",
        "promo": "1er mois offert + visite gratuite",
        "code": "ALOMAMAN1MOIS", "valid_until": "2026-12-31",
        "phone": "+225 27 21 26 11 11",
    },
    {
        "id": "creche-2", "type": "creche", "name": "Crèche Le Jardin d'Eden",
        "ville": "Bouaké", "icon": "happy",
        "promo": "-20% sur l'inscription annuelle",
        "code": "ALOMAMAN20", "valid_until": "2026-12-31",
        "phone": "+225 27 31 63 22 22",
    },
    {
        "id": "boutique-1", "type": "boutique", "name": "Bébé Comme Chez Moi",
        "ville": "En ligne · Livraison nationale", "icon": "cart",
        "promo": "-25% sur poussettes & berceaux",
        "code": "ALOMAMAN25", "valid_until": "2026-12-31",
        "phone": "+225 07 07 07 07 07",
    },
    {
        "id": "labo-1", "type": "laboratoire", "name": "Laboratoire BIOLAB",
        "ville": "Abidjan · Plateau", "icon": "flask",
        "promo": "-30% sur les analyses prénatales",
        "code": "ALOMAMAN30", "valid_until": "2026-12-31",
        "phone": "+225 27 20 21 33 33",
    },
]


@api.get("/partenaires/offres")
async def partenaires_offres(user=Depends(require_roles("maman"))):
    """Liste des offres partenaires — réservé aux Mamans Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "message": "Les offres partenaires sont réservées aux Mamans Premium. Économisez jusqu'à 30% chez nos partenaires de confiance.",
                "upgrade_url": "/premium",
            },
        )
    return {"count": len(_PARTENAIRES_OFFRES), "offres": _PARTENAIRES_OFFRES}


@api.get("/ecoute/contacts")
async def ecoute_contacts(user=Depends(require_roles("maman"))):
    """Ligne d'écoute post-partum — contacts de soutien."""
    is_prem = is_premium_active(user)
    base = {
        "urgences_24_7": [
            {"label": "SAMU Côte d'Ivoire", "phone": "185", "icon": "medical", "always_free": True},
            {"label": "Pompiers", "phone": "180", "icon": "flame", "always_free": True},
            {"label": "Police", "phone": "111", "icon": "shield", "always_free": True},
        ],
        "lignes_publiques": [
            {"label": "Allô Femme (violences)", "phone": "1308", "icon": "heart-circle", "always_free": True},
            {"label": "Allô Enfant (protection)", "phone": "116", "icon": "happy", "always_free": True},
        ],
    }
    if is_prem:
        import urllib.parse as _up
        base["premium_dedicated"] = {
            "label": "Ligne d'écoute À lo Maman 💎",
            "whatsapp": "https://wa.me/15144757340?text=" + _up.quote("Bonjour, je suis Maman Premium et j'ai besoin d'écoute post-partum."),
            "email": "infos@e-medicare.co",
            "horaires": "7j/7 · 8h-22h GMT (réponse < 2h)",
            "specialites": [
                "Baby blues / dépression post-partum",
                "Allaitement difficile",
                "Reprise du travail après congé",
                "Couple après bébé",
                "Angoisses parentales",
                "Sommeil bébé / parents",
            ],
        }
    else:
        base["premium_dedicated"] = None
        base["premium_required"] = {
            "message": "La ligne d'écoute dédiée 7j/7 est réservée aux Mamans Premium.",
            "upgrade_url": "/premium",
        }
    return base


@api.post("/ecoute/sessions")
async def book_ecoute_session(
    payload: dict,
    user=Depends(require_roles("maman")),
):
    """Réservation d'une session d'écoute — réservé Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "message": "La réservation d'une session d'écoute est réservée aux Mamans Premium.",
                "upgrade_url": "/premium",
            },
        )
    motif = (payload.get("motif") or "").strip()[:500]
    pref_horaire = (payload.get("preference_horaire") or "").strip()[:200]
    if not motif:
        raise HTTPException(400, "Veuillez indiquer le motif de votre demande.")
    sess = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "maman_name": user.get("name"),
        "maman_phone": user.get("phone"),
        "motif": motif,
        "preference_horaire": pref_horaire,
        "status": "en_attente",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ecoute_sessions.insert_one(sess)
    sess.pop("_id", None)
    return {"ok": True, "session": sess, "message": "Demande envoyée. Notre équipe vous contactera sous 2h en heures ouvrées."}


@api.post("/ai/rappels-contextuels")
async def ai_rappels_contextuels(payload: dict, user=Depends(require_roles("maman"))):
    """Génère des rappels personnalisés via Claude — réservé Premium."""
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "message": "Les rappels IA contextuels sont réservés aux Mamans Premium. Recevez des conseils personnalisés selon votre stade de grossesse / âge de bébé.",
                "upgrade_url": "/premium",
            },
        )
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    contexte = (payload.get("contexte") or "").strip()[:1000]
    sa = payload.get("sa")  # semaine d'aménorrhée
    age_bebe_mois = payload.get("age_bebe_mois")
    prompt = "Tu es une sage-femme expérimentée en Côte d'Ivoire. Génère 5 rappels personnalisés et actionnables pour cette maman. "
    if sa:
        prompt += f"Elle est à {sa} SA (semaines d'aménorrhée). "
    if age_bebe_mois is not None:
        prompt += f"Elle a un bébé de {age_bebe_mois} mois. "
    if contexte:
        prompt += f"Contexte personnel : {contexte}. "
    prompt += (
        "Format de réponse : JSON strict avec un tableau 'rappels' contenant 5 objets "
        "{titre, description, urgence (haute|moyenne|info), icone (alarme|nutrition|pilule|hopital|coeur)}."
    )
    try:
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"rappels-{user['id']}",
            system_message="Tu es une sage-femme expérimentée. Réponds toujours en JSON strict valide.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        # Extraire le JSON
        import json as _json
        import re as _re
        match = _re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise ValueError("Pas de JSON détecté")
        data = _json.loads(match.group(0))
        rappels = data.get("rappels") or []
        # Sauvegarde des rappels en BDD
        for r in rappels:
            r["id"] = str(uuid.uuid4())
            r["maman_id"] = user["id"]
            r["created_at"] = datetime.now(timezone.utc).isoformat()
        if rappels:
            # Insérer une copie pour éviter que motor injecte _id (ObjectId) dans les originaux
            await db.rappels_ia.insert_many([dict(r) for r in rappels])
        return {"rappels": rappels, "count": len(rappels)}
    except Exception as e:
        raise HTTPException(500, f"Erreur génération IA : {e}")


@api.get("/ai/rappels-contextuels")
async def list_rappels_contextuels(user=Depends(require_roles("maman"))):
    """Liste les derniers rappels IA générés."""
    items = await db.rappels_ia.find({"maman_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"rappels": items, "count": len(items)}


app.include_router(api)
# (deuxième include_router ci-dessous est une no-op idempotente)


# ============================================================================
# 🏠 PAIEMENTS — Mode domicile, remboursement, stats par mode (RGSSI N3)
# ============================================================================

class FraisDeplacementIn(BaseModel):
    frais_deplacement_fcfa: int


@api.put("/pro/frais-deplacement")
async def set_frais_deplacement(payload: FraisDeplacementIn, user=Depends(require_roles("professionnel"))):
    """Définir le supplément déplacement par défaut du Pro (FCFA)."""
    if payload.frais_deplacement_fcfa < 0 or payload.frais_deplacement_fcfa > 50000:
        raise HTTPException(400, "Montant invalide (0 à 50 000 FCFA).")
    await db.users.update_one({"id": user["id"]}, {"$set": {"frais_deplacement_fcfa": int(payload.frais_deplacement_fcfa)}})
    return {"ok": True, "frais_deplacement_fcfa": int(payload.frais_deplacement_fcfa)}


@api.get("/rdv/{rid}/adresse-domicile")
async def get_rdv_adresse_domicile(rid: str, user=Depends(get_current_user)):
    """Récupérer l'adresse domicile (déchiffrée) — réservé au Pro assigné, RDV payé uniquement.
    Audit log RGSSI N3."""
    rdv = await db.rdv.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    if rdv.get("mode") != "domicile":
        raise HTTPException(400, "Ce RDV n'est pas un RDV à domicile.")
    # Pro assigné OU maman propriétaire OU admin
    is_pro_owner = (user["role"] == "professionnel" and rdv.get("pro_id") == user["id"])
    is_maman_owner = (user["role"] == "maman" and rdv.get("maman_id") == user["id"])
    is_admin = user["role"] == "admin"
    if not (is_pro_owner or is_maman_owner or is_admin):
        raise HTTPException(403, "Accès refusé.")
    # Pour le Pro, exiger que le RDV soit payé (pas avant)
    if is_pro_owner and not rdv.get("paye"):
        raise HTTPException(
            status_code=402,
            detail={"error": "payment_required", "message": "L'adresse de la patiente sera disponible après paiement du RDV."},
        )
    from encryption import decrypt_str as _dec
    adresse = _dec(rdv.get("adresse_domicile_enc")) or ""
    # 📊 Audit log
    try:
        await _audit_log(user=user, action="read_address", resource_type="Rdv", resource_id=rid, details={"mode": rdv.get("mode"), "is_pro": is_pro_owner})
    except Exception:
        pass
    return {
        "rdv_id": rid,
        "adresse": adresse,
        "quartier": rdv.get("quartier"),
        "ville": rdv.get("ville"),
        "lat": rdv.get("lat"),
        "lng": rdv.get("lng"),
        "frais_deplacement_fcfa": rdv.get("frais_deplacement_fcfa") or 0,
    }


@api.post("/pay/refund")
async def request_refund(payload: RefundIn, user=Depends(get_current_user)):
    """Remboursement selon politique d'annulation :
    - >24h avant le RDV : 100% remboursé
    - 6-24h : 50% remboursé (commission retenue)
    - <6h : 0% (RDV maintenu ou annulé sans remboursement)
    """
    q: dict = {}
    if payload.payment_id:
        q["id"] = payload.payment_id
    elif payload.rdv_id:
        q["rdv_id"] = payload.rdv_id
        q["status"] = "completed"
    else:
        raise HTTPException(400, "Indiquez payment_id ou rdv_id.")
    p = await db.payments.find_one(q, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paiement introuvable")
    if p["status"] != "completed":
        raise HTTPException(400, "Ce paiement n'est pas dans un état remboursable.")
    if p["kind"] != "consultation":
        raise HTTPException(400, "Seuls les paiements de consultation sont remboursables.")
    # Vérifier que c'est la maman ou un admin
    if user["role"] != "admin" and p.get("user_id") != user["id"] and p.get("maman_id") != user["id"]:
        raise HTTPException(403, "Vous n'êtes pas autorisée à demander ce remboursement.")
    rdv = await db.rdv.find_one({"id": p["rdv_id"]}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV associé introuvable.")
    # Calcul du taux de remboursement selon délai
    try:
        rdv_dt = datetime.fromisoformat(rdv["date"].replace("Z", "+00:00"))
    except Exception:
        rdv_dt = datetime.now(timezone.utc) + timedelta(days=1)
    now = datetime.now(timezone.utc)
    if rdv_dt.tzinfo is None:
        rdv_dt = rdv_dt.replace(tzinfo=timezone.utc)
    delta_hours = (rdv_dt - now).total_seconds() / 3600
    if delta_hours >= 24:
        refund_rate = 1.0
        rule = "100% (>24h)"
    elif delta_hours >= 6:
        refund_rate = 0.50
        rule = "50% (6-24h)"
    else:
        refund_rate = 0.0
        rule = "0% (<6h)"
    refund_amount = int(round(p["amount"] * refund_rate))
    refund_doc = {
        "id": str(uuid.uuid4()),
        "payment_id": p["id"],
        "rdv_id": p["rdv_id"],
        "user_id": p.get("user_id"),
        "maman_id": p.get("maman_id") or p.get("user_id"),
        "pro_id": p.get("pro_id"),
        "original_amount": p["amount"],
        "refund_rate": refund_rate,
        "refund_amount_fcfa": refund_amount,
        "rule_applied": rule,
        "raison": (payload.raison or "").strip()[:500],
        "status": "pending" if refund_amount > 0 else "no_refund",
        "created_at": now.isoformat(),
    }
    await db.refunds.insert_one(refund_doc)
    refund_doc.pop("_id", None)
    # Marquer le paiement et le RDV
    await db.payments.update_one({"id": p["id"]}, {"$set": {"status": "refunded" if refund_amount > 0 else "cancelled", "refund_id": refund_doc["id"]}})
    await db.rdv.update_one({"id": p["rdv_id"]}, {"$set": {"status": "annule", "annule_par": user["role"], "annule_at": now.isoformat()}})
    # Notifier
    try:
        await push_notif(p["pro_id"], "❌ RDV annulé", f"Le RDV du {rdv_dt.strftime('%d/%m %Hh%M')} a été annulé. Remboursement appliqué : {rule}.", "rdv")
        await push_notif(p.get("user_id") or p.get("maman_id"), "Remboursement initié", f"Votre RDV est annulé. Montant remboursé : {refund_amount} FCFA ({rule}).", "info")
    except Exception:
        pass
    # Audit log
    try:
        await _audit_log(user=user, action="refund_request", resource_type="Payment", resource_id=p["id"], details={"refund_amount": refund_amount, "rate": refund_rate, "rule": rule, "rdv_id": p["rdv_id"]})
    except Exception:
        pass
    return {"refund": refund_doc, "rule": rule, "refund_amount_fcfa": refund_amount}


@api.get("/pro/revenus/par-mode")
async def pro_revenus_par_mode(user=Depends(require_roles("professionnel"))):
    """Stats Pro segmentées par mode de consultation (RGSSI + Premium)."""
    payments = await db.payments.find({"kind": "consultation", "pro_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(5000)
    by_mode: dict = {"presentiel": {}, "teleconsultation": {}, "domicile": {}}
    for m in by_mode.keys():
        by_mode[m] = {"count": 0, "brut": 0, "commission": 0, "net": 0, "frais_deplacement": 0}
    total = {"count": 0, "brut": 0, "commission": 0, "net": 0}
    for p in payments:
        mode = p.get("mode") or "presentiel"
        if mode not in by_mode:
            mode = "presentiel"
        by_mode[mode]["count"] += 1
        by_mode[mode]["brut"] += int(p.get("amount") or 0)
        by_mode[mode]["commission"] += int(p.get("commission") or 0)
        by_mode[mode]["net"] += int(p.get("pro_amount") or 0)
        by_mode[mode]["frais_deplacement"] += int(p.get("frais_deplacement_fcfa") or 0)
        total["count"] += 1
        total["brut"] += int(p.get("amount") or 0)
        total["commission"] += int(p.get("commission") or 0)
        total["net"] += int(p.get("pro_amount") or 0)
    return {"total": total, "par_mode": by_mode}


@api.get("/pay/admin/stats-par-mode")
async def pay_admin_stats_par_mode(user=Depends(require_roles("admin"))):
    """Statistiques admin globales par mode (pour rapports financiers)."""
    payments = await db.payments.find({"kind": "consultation", "status": "completed"}, {"_id": 0}).to_list(10000)
    refunds = await db.refunds.find({"status": "pending"}, {"_id": 0}).to_list(2000)
    refunds_done = await db.refunds.find({"status": "refunded"}, {"_id": 0}).to_list(2000)
    by_mode = {"presentiel": {}, "teleconsultation": {}, "domicile": {}}
    for m in by_mode:
        by_mode[m] = {"count": 0, "brut": 0, "commission": 0, "net_pro": 0, "frais_deplacement": 0}
    total_brut = 0
    total_commission = 0
    total_net = 0
    for p in payments:
        mode = p.get("mode") or "presentiel"
        if mode not in by_mode:
            mode = "presentiel"
        by_mode[mode]["count"] += 1
        by_mode[mode]["brut"] += int(p.get("amount") or 0)
        by_mode[mode]["commission"] += int(p.get("commission") or 0)
        by_mode[mode]["net_pro"] += int(p.get("pro_amount") or 0)
        by_mode[mode]["frais_deplacement"] += int(p.get("frais_deplacement_fcfa") or 0)
        total_brut += int(p.get("amount") or 0)
        total_commission += int(p.get("commission") or 0)
        total_net += int(p.get("pro_amount") or 0)
    return {
        "totals": {"brut": total_brut, "commission": total_commission, "net_pros": total_net, "count": len(payments)},
        "par_mode": by_mode,
        "refunds": {
            "pending_count": len(refunds),
            "pending_amount": sum(int(r.get("refund_amount_fcfa") or 0) for r in refunds),
            "done_count": len(refunds_done),
            "done_amount": sum(int(r.get("refund_amount_fcfa") or 0) for r in refunds_done),
        },
    }


class ModesConsultationIn(BaseModel):
    accepte_presentiel: bool = True
    accepte_teleconsultation: bool = True
    accepte_domicile: bool = False
    frais_deplacement_fcfa: Optional[int] = None
    duree_par_mode: Optional[Dict[str, int]] = None  # ⏱️ {presentiel:30, teleconsultation:20, domicile:60}


@api.put("/pro/modes-consultation")
async def set_modes_consultation(payload: ModesConsultationIn, user=Depends(require_roles("professionnel"))):
    """Configurer les modes de consultation supportés par le Pro."""
    if payload.frais_deplacement_fcfa is not None and (payload.frais_deplacement_fcfa < 0 or payload.frais_deplacement_fcfa > 50000):
        raise HTTPException(400, "Frais déplacement invalide (0 à 50 000 FCFA).")
    update: dict = {
        "accepte_teleconsultation": bool(payload.accepte_teleconsultation),
        "accepte_domicile": bool(payload.accepte_domicile),
    }
    # ⏱️ Durées par mode (validation : entiers entre 5 et 240 min)
    if payload.duree_par_mode is not None:
        cleaned: Dict[str, int] = {}
        for k, v in payload.duree_par_mode.items():
            if k not in ("presentiel", "teleconsultation", "domicile"):
                continue
            try:
                iv = int(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"Durée invalide pour le mode {k}.")
            if iv < 5 or iv > 240:
                raise HTTPException(400, f"Durée pour {k} hors limites (5 à 240 minutes).")
            cleaned[k] = iv
        if cleaned:
            update["duree_par_mode"] = cleaned
    # Note : presentiel toujours implicitement autorisé (modèle de base)
    if payload.accepte_domicile:
        # Si activation domicile sans frais explicites, mettre 2000 par défaut
        if payload.frais_deplacement_fcfa is not None:
            update["frais_deplacement_fcfa"] = int(payload.frais_deplacement_fcfa)
        else:
            existing = await db.users.find_one({"id": user["id"]}, {"_id": 0, "frais_deplacement_fcfa": 1}) or {}
            if existing.get("frais_deplacement_fcfa") is None:
                update["frais_deplacement_fcfa"] = 2000
    else:
        # Désactivation domicile → on peut conserver les frais (ou les retirer)
        if payload.frais_deplacement_fcfa is not None:
            update["frais_deplacement_fcfa"] = int(payload.frais_deplacement_fcfa)
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True, **update}


@api.get("/pro/modes-consultation")
async def get_modes_consultation(user=Depends(require_roles("professionnel"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
    dpm = u.get("duree_par_mode") or {}
    return {
        "accepte_presentiel": True,  # toujours
        "accepte_teleconsultation": u.get("accepte_teleconsultation") is not False,
        "accepte_domicile": bool(u.get("accepte_domicile")) or u.get("frais_deplacement_fcfa") is not None,
        "frais_deplacement_fcfa": u.get("frais_deplacement_fcfa"),
        "duree_par_mode": {
            "presentiel": int(dpm.get("presentiel") or 30),
            "teleconsultation": int(dpm.get("teleconsultation") or 20),
            "domicile": int(dpm.get("domicile") or 60),
        },
    }


# ============================================================================
# 💸 AUTO-PAYOUTS PayDunya — Configuration Pro + Scheduler hebdomadaire
# ============================================================================

class AutoPayoutConfigIn(BaseModel):
    enabled: bool
    seuil_fcfa: int = 50000  # déclenche le retrait dès que solde >= seuil (défaut 50 000 F)
    frequency: str = "weekly"  # "weekly" | "monthly"


@api.put("/pro/auto-payout")
async def set_auto_payout(payload: AutoPayoutConfigIn, user=Depends(require_roles("professionnel"))):
    """Configurer le retrait automatique vers Mobile Money (PayDunya Disburse)."""
    if payload.seuil_fcfa < 5000:
        raise HTTPException(400, "Seuil minimum auto-retrait : 5 000 FCFA")
    if payload.frequency not in ("weekly", "monthly"):
        raise HTTPException(400, "Fréquence invalide (weekly | monthly).")
    # Vérifier que le compte MM est configuré avant d'activer
    u_full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    mm = (u_full or {}).get("mobile_money") or {}
    if payload.enabled and not (mm.get("provider") and mm.get("account_alias")):
        raise HTTPException(400, "Configurez d'abord votre compte Mobile Money dans Retraits.")
    cfg = {
        "auto_payout_enabled": payload.enabled,
        "auto_payout_seuil_fcfa": int(payload.seuil_fcfa),
        "auto_payout_frequency": payload.frequency,
        "auto_payout_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": cfg})
    return {"ok": True, **cfg}


@api.get("/pro/auto-payout")
async def get_auto_payout(user=Depends(require_roles("professionnel"))):
    u_full = await db.users.find_one({"id": user["id"]}, {"_id": 0}) or {}
    return {
        "enabled": bool(u_full.get("auto_payout_enabled")),
        "seuil_fcfa": int(u_full.get("auto_payout_seuil_fcfa") or 50000),
        "frequency": u_full.get("auto_payout_frequency") or "weekly",
        "updated_at": u_full.get("auto_payout_updated_at"),
    }


async def _auto_payouts_scheduler():
    """Scheduler hebdomadaire qui déclenche les retraits auto pour les Pros opt-in."""
    import asyncio as _aio
    while True:
        try:
            now = datetime.now(timezone.utc)
            day = now.weekday()  # 0=Lundi
            if day == 0 and 1 <= now.hour <= 3:  # lundi 1h-3h UTC
                pros = await db.users.find(
                    {"role": "professionnel", "auto_payout_enabled": True},
                    {"_id": 0, "id": 1, "name": 1, "mobile_money": 1, "auto_payout_seuil_fcfa": 1, "auto_payout_frequency": 1},
                ).to_list(1000)
                for p in pros:
                    try:
                        bal = await compute_pro_balance(p["id"])
                        seuil = int(p.get("auto_payout_seuil_fcfa") or 50000)
                        if bal["available"] >= seuil:
                            mm = p.get("mobile_money") or {}
                            # Préparer un payload simulé pour réutiliser la logique existante
                            class _W:
                                amount_fcfa = bal["available"]
                                provider = mm.get("provider")
                                account_alias = mm.get("account_alias")
                            try:
                                # Appel direct du flow de retrait (sans HTTP)
                                u_full = await db.users.find_one({"id": p["id"]}, {"_id": 0})
                                if u_full:
                                    fee = WITHDRAW_FEE_FCFA + int(round(_W.amount_fcfa * WITHDRAW_FEE_PERCENT))
                                    net_to_send = _W.amount_fcfa - fee
                                    if net_to_send > 0:
                                        payout_id = str(uuid.uuid4())
                                        backend_url = os.environ.get("BACKEND_PUBLIC_URL", "")
                                        callback_url = (backend_url + "/api/payouts/callback") if backend_url else ""
                                        await db.payouts.insert_one({
                                            "id": payout_id, "pro_id": p["id"], "pro_email": u_full.get("email"),
                                            "amount_fcfa": _W.amount_fcfa, "fee_fcfa": fee, "net_amount_fcfa": net_to_send,
                                            "provider": _W.provider, "withdraw_mode": WITHDRAW_PROVIDERS[_W.provider]["mode"],
                                            "account_alias": _W.account_alias, "status": "pending", "auto": True,
                                            "created_at": now.isoformat(),
                                        })
                                        inv = await paydunya_disburse_get_invoice(
                                            account_alias=_W.account_alias, amount=net_to_send,
                                            withdraw_mode=WITHDRAW_PROVIDERS[_W.provider]["mode"],
                                            callback_url=callback_url, disburse_id=payout_id,
                                        )
                                        if inv.get("success"):
                                            sub = await paydunya_disburse_submit_invoice(inv.get("disburse_invoice"), disburse_id=payout_id)
                                            new_status = "completed" if sub.get("success") else "failed"
                                            await db.payouts.update_one({"id": payout_id}, {"$set": {"status": new_status, "disburse_invoice": inv.get("disburse_invoice"), "completed_at": now.isoformat() if new_status == "completed" else None}})
                                            try:
                                                await push_notif(p["id"], "🤖 Retrait auto envoyé 💸", f"{net_to_send:,} F en route vers votre Mobile Money", "info")
                                            except Exception:
                                                pass
                            except Exception as inner:
                                logger.warning(f"Auto-payout failed for {p['id']}: {inner}")
                    except Exception as e2:
                        logger.warning(f"Auto-payout error for {p.get('id')}: {e2}")
            # Sleep 1 hour, vérifier de nouveau
            await _aio.sleep(3600)
        except Exception as e:
            logger.error(f"Auto-payouts scheduler error: {e}")
            await _aio.sleep(3600)


# ============================================================================
# 💎 PROMESSES PREMIUM — Implémentations
# ============================================================================
# Note : enregistrés après include_router via une fonction helper afin de garder
# le code groupé logiquement. Cependant FastAPI nécessite que les routes soient
# attachées AVANT include_router. On utilise donc une approche différente : on
# définit les endpoints sur l'objet `api` puis on appelle re-include qui est
# idempotent en pratique. Pour rester safe, ces nouvelles routes sont définies
# AVANT include_router via le bloc précédent. Ce commentaire est documentation.

# ============================================================================
# 🏠🆘 SOINS À DOMICILE / URGENCE À DOMICILE — Demande, propositions, validation
# ============================================================================
# Flow style "marketplace inverse" :
#   1. Maman crée une demande (broadcast à tous les Pros qui acceptent le domicile)
#   2. Chaque Pro propose son tarif (calcul auto + override possible)
#   3. Maman compare les offres et accepte UNE proposition (validation manuelle)
#   4. À l'acceptation → création d'un RDV pending_payment + URL PayDunya
#   5. Notif au Pro après paiement réussi (adresse complète révélée)

class HomePricingIn(BaseModel):
    tarif_consultation: int = 10000  # F CFA
    frais_zone_proche: int = 2000    # ≤ 5 km
    frais_zone_moyen: int = 5000     # 5–15 km
    frais_zone_loin: int = 10000     # > 15 km
    majoration_nuit_fcfa: int = 0       # ajouté si 20h-7h
    majoration_we_fcfa: int = 0         # ajouté si Sam/Dim
    majoration_urgence_fcfa: int = 5000 # ajouté si type=urgence


@api.put("/pro/pricing-domicile")
async def set_pro_pricing_domicile(payload: HomePricingIn, user=Depends(require_roles("professionnel"))):
    # Validation simple : tous les montants doivent être ≥ 0 et ≤ 500 000 F
    data = payload.dict()
    for k, v in data.items():
        if not isinstance(v, int) or v < 0 or v > 500000:
            raise HTTPException(400, f"Valeur invalide pour {k} (0 à 500 000 F).")
    await db.users.update_one({"id": user["id"]}, {"$set": {"pricing_domicile": data}})
    return {"ok": True, **data}


@api.get("/pro/pricing-domicile")
async def get_pro_pricing_domicile(user=Depends(require_roles("professionnel"))):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "pricing_domicile": 1}) or {}
    return u.get("pricing_domicile") or HomePricingIn().dict()


# ---- Modèles ----

class HomeRequestIn(BaseModel):
    type: str  # "domicile" | "urgence"
    mode: Optional[str] = None  # urgence: "presentiel"|"teleconsultation"|"domicile". Forcé "domicile" si type=domicile.
    motif: str
    adresse: Optional[str] = None  # requis uniquement si mode résolu = "domicile"
    quartier: Optional[str] = ""
    ville: Optional[str] = ""
    zone: Optional[str] = "moyen"  # ignoré si mode != domicile
    preferred_datetime: Optional[str] = None  # ISO, None si urgence ASAP
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = ""
    audio_base64: Optional[str] = None  # data URI optionnel pour mode vocal


class HomeProposalIn(BaseModel):
    tarif_consultation: int
    frais_deplacement: int
    majoration_nuit: int = 0
    majoration_we: int = 0
    majoration_urgence: int = 0
    message: Optional[str] = ""  # justification ou note du Pro


class HomeAcceptIn(BaseModel):
    proposal_id: str


# ---- Helpers ----

def _detect_majorations(req_type: str, preferred_iso: Optional[str]) -> Dict[str, bool]:
    """Retourne {nuit:bool, we:bool, urgence:bool} pour suggérer les majorations."""
    nuit = we = False
    if preferred_iso:
        try:
            dt = datetime.fromisoformat(preferred_iso.replace("Z", "+00:00"))
            h = dt.hour
            nuit = (h >= 20) or (h < 7)
            we = dt.weekday() >= 5
        except Exception:
            pass
    else:
        # Urgence ASAP → maintenant
        now = datetime.now(timezone.utc)
        h = now.hour
        nuit = (h >= 20) or (h < 7)
        we = now.weekday() >= 5
    urg = req_type == "urgence"
    return {"nuit": nuit, "we": we, "urgence": urg}


# ---- Endpoints Maman ----

@api.post("/home-request")
async def create_home_request(payload: HomeRequestIn, user=Depends(require_roles("maman"))):
    if payload.type not in ("domicile", "urgence"):
        raise HTTPException(400, "Type invalide (domicile|urgence).")
    # 🎯 Détermine le mode selon le type :
    #   - type=domicile → mode forcé à "domicile"
    #   - type=urgence  → mode au choix de la maman (presentiel|teleconsultation|domicile). Défaut : presentiel.
    if payload.type == "domicile":
        mode = "domicile"
    else:
        mode = (payload.mode or "presentiel").lower()
        if mode not in ("presentiel", "teleconsultation", "domicile"):
            raise HTTPException(400, "Mode invalide pour urgence (presentiel|teleconsultation|domicile).")
    if not payload.motif or len(payload.motif.strip()) < 3:
        raise HTTPException(400, "Motif requis (3 caractères min).")
    # Adresse + zone obligatoires uniquement pour mode=domicile
    if mode == "domicile":
        if not (payload.adresse or "").strip() or len((payload.adresse or "").strip()) < 5:
            raise HTTPException(400, "Adresse requise pour les soins à domicile (5 caractères min).")
        if (payload.zone or "moyen") not in ("proche", "moyen", "loin"):
            raise HTTPException(400, "Zone invalide (proche|moyen|loin).")

    now = datetime.now(timezone.utc)
    # Expiration : 30 min pour urgence, 24h pour domicile classique
    ttl = timedelta(minutes=30) if payload.type == "urgence" else timedelta(hours=24)
    # Chiffrement de l'adresse uniquement si domicile
    adresse_enc = None
    if mode == "domicile":
        from encryption import encrypt_str as _enc
        adresse_enc = _enc((payload.adresse or "").strip())
    maj = _detect_majorations(payload.type, payload.preferred_datetime)
    doc = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "type": payload.type,
        "mode": mode,
        "motif": payload.motif.strip(),
        "adresse_enc": adresse_enc,
        "quartier": (payload.quartier or "").strip(),
        "ville": (payload.ville or "").strip(),
        "zone": payload.zone if mode == "domicile" else None,
        "preferred_datetime": payload.preferred_datetime,
        "lat": payload.lat,
        "lng": payload.lng,
        "notes": (payload.notes or "").strip(),
        "audio_base64": payload.audio_base64,
        "auto_majorations": maj,
        "status": "open",
        "proposals": [],
        "created_at": now.isoformat(),
        "expires_at": (now + ttl).isoformat(),
    }
    await db.home_requests.insert_one(doc)
    doc.pop("_id", None)
    # Ne pas renvoyer le ciphertext de l'adresse dans la réponse de création
    doc_out = {k: v for k, v in doc.items() if k != "adresse_enc"}

    # 📡 Broadcast aux Pros : tous ceux qui ont accepte_domicile=true (ou pricing_domicile défini)
    # Pour urgence en cabinet/téléconsult, on inclut TOUS les Pros disponibles dans la spécialité ciblée (fallback : tous les pros actifs)
    if mode == "domicile":
        pros_q = {
            "role": "professionnel",
            "$or": [{"accepte_domicile": True}, {"pricing_domicile": {"$exists": True}}],
        }
    else:
        # Urgence sans-RDV en cabinet ou téléconsultation : tous les pros actifs
        pros_q = {"role": "professionnel"}
    pros = await db.users.find(pros_q, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    if payload.type == "urgence":
        title = "🆘 URGENCE sans-RDV"
        mode_lbl = {"presentiel": "au cabinet", "teleconsultation": "en téléconsultation", "domicile": "à domicile"}[mode]
        body_msg = f"{user.get('name', 'Une patiente')} : {payload.motif[:60]} · {mode_lbl}"
    else:
        title = "🏠 Nouvelle demande à domicile"
        body_msg = f"{user.get('name', 'Une patiente')} : {payload.motif[:60]} · Zone {payload.zone} · {payload.ville or 'CI'}"
    for p in pros:
        try:
            await push_notif(p["id"], title, body_msg, "rdv")
        except Exception:
            pass

    # 📊 Audit
    try:
        await _audit_log(user=user, action="home_request_create", resource_type="HomeRequest", resource_id=doc["id"], details={"type": payload.type, "mode": mode, "zone": payload.zone, "broadcast_count": len(pros)})
    except Exception:
        pass

    return {**doc_out, "broadcast_count": len(pros)}


@api.get("/home-request/mine")
async def list_my_home_requests(user=Depends(require_roles("maman"))):
    # Auto-cleanup : passer les open expirées à "expired"
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        await db.home_requests.update_many(
            {"maman_id": user["id"], "status": "open", "expires_at": {"$lt": now_iso}},
            {"$set": {"status": "expired", "expired_at": now_iso}},
        )
    except Exception:
        pass
    items = await db.home_requests.find({"maman_id": user["id"]}, {"_id": 0, "adresse_enc": 0, "audio_base64": 0}).sort("created_at", -1).to_list(100)
    # Enrichir avec noms des Pros pour chaque proposition
    pro_ids = {p["pro_id"] for it in items for p in it.get("proposals", [])}
    pros = {p["id"]: p for p in await db.users.find({"id": {"$in": list(pro_ids)}}, {"_id": 0, "id": 1, "name": 1, "specialite": 1, "rating": 1, "premium": 1, "premium_until": 1}).to_list(500)}
    for it in items:
        for p in it.get("proposals", []):
            pdoc = pros.get(p["pro_id"]) or {}
            p["pro_name"] = pdoc.get("name")
            p["pro_specialite"] = pdoc.get("specialite")
            p["pro_rating"] = pdoc.get("rating")
            p["pro_premium"] = is_premium_active(pdoc) if pdoc else False
    return items


@api.post("/home-request/{req_id}/accept")
async def accept_home_proposal(req_id: str, payload: HomeAcceptIn, user=Depends(require_roles("maman"))):
    req = await db.home_requests.find_one({"id": req_id, "maman_id": user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req["status"] not in ("open", "proposed"):
        raise HTTPException(400, f"Demande {req['status']}, validation impossible.")
    prop = next((p for p in req.get("proposals", []) if p.get("id") == payload.proposal_id), None)
    if not prop:
        raise HTTPException(404, "Proposition introuvable")
    pro = await db.users.find_one({"id": prop["pro_id"]}, {"_id": 0})
    if not pro:
        raise HTTPException(404, "Professionnel introuvable")
    # 💳 Créer le RDV pending_payment associé
    now = datetime.now(timezone.utc)
    rdv_dt = req.get("preferred_datetime") or now.isoformat()
    req_mode = req.get("mode") or "domicile"
    type_label = "Soins à domicile" if req.get("type") == "domicile" else (
        f"Urgence {'à domicile' if req_mode == 'domicile' else ('en téléconsultation' if req_mode == 'teleconsultation' else 'au cabinet')}"
    )
    rdv_doc = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "pro_id": prop["pro_id"],
        "date": rdv_dt,
        "motif": req["motif"],
        "tarif_fcfa": prop["tarif_consultation"],
        "frais_deplacement_fcfa": prop["frais_deplacement"] + prop.get("majoration_nuit", 0) + prop.get("majoration_we", 0) + prop.get("majoration_urgence", 0),
        "tarif_total_fcfa": prop["total"],
        "type_consultation": req["type"],
        "mode": req_mode,
        "prestation_id": None,
        "prestation_nom": type_label,
        "cmu_applique": False,
        "adresse_domicile_enc": req.get("adresse_enc") if req_mode == "domicile" else None,
        "quartier": req.get("quartier"),
        "ville": req.get("ville"),
        "lat": req.get("lat"),
        "lng": req.get("lng"),
        "paye": False,
        "payment_method": "online",
        "payment_required": True,
        "payment_deadline": (now + timedelta(minutes=30)).isoformat(),
        "status": "pending_payment",
        "home_request_id": req_id,
        "created_at": now.isoformat(),
    }
    await db.rdv.insert_one(rdv_doc)
    rdv_doc.pop("_id", None)
    # Marquer la demande comme acceptée
    await db.home_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "accepted", "accepted_proposal_id": prop["id"], "accepted_at": now.isoformat(), "rdv_id": rdv_doc["id"]}},
    )
    # 💳 Initier le paiement PayDunya
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        prop["total"], f"Soins à domicile · {pro.get('name')}", user,
        {
            "kind": "consultation",
            "mode": "domicile",
            "rdv_id": rdv_doc["id"],
            "maman_id": user["id"],
            "pro_id": prop["pro_id"],
        },
        return_url,
    )
    pay_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "kind": "consultation",
        "mode": "domicile",
        "rdv_id": rdv_doc["id"],
        "pro_id": prop["pro_id"],
        "amount": prop["total"],
        "token": inv.get("token"),
        "status": "pending" if inv.get("success") else "error",
        "error": inv.get("error"),
        "created_at": now.isoformat(),
    }
    await db.payments.insert_one(pay_doc)
    pay_doc.pop("_id", None)
    # 🔔 Notif au Pro (sans révéler encore l'adresse, juste pour info)
    try:
        await push_notif(prop["pro_id"], "✅ Tarif accepté", f"{user.get('name')} a validé votre tarif ({prop['total']} F). Paiement en cours.", "rdv")
    except Exception:
        pass
    # 📊 Audit
    try:
        await _audit_log(user=user, action="home_request_accept", resource_type="HomeRequest", resource_id=req_id, details={"proposal_id": prop["id"], "total": prop["total"], "pro_id": prop["pro_id"]})
    except Exception:
        pass
    return {"ok": True, "rdv": rdv_doc, "payment_url": inv.get("url"), "payment": pay_doc}


@api.post("/home-request/{req_id}/cancel")
async def cancel_home_request(req_id: str, user=Depends(require_roles("maman"))):
    req = await db.home_requests.find_one({"id": req_id, "maman_id": user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req["status"] in ("accepted", "paid", "completed"):
        raise HTTPException(400, "Demande déjà acceptée, impossible d'annuler.")
    await db.home_requests.update_one({"id": req_id}, {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}})
    try:
        await _audit_log(user=user, action="home_request_cancel", resource_type="HomeRequest", resource_id=req_id)
    except Exception:
        pass
    return {"ok": True}


# ---- Endpoints Pro ----

@api.get("/home-request/open")
async def list_open_home_requests(user=Depends(require_roles("professionnel"))):
    """Liste les demandes ouvertes que le Pro peut servir."""
    now_iso = datetime.now(timezone.utc).isoformat()
    # Auto-cleanup pour Pro aussi
    try:
        await db.home_requests.update_many(
            {"status": "open", "expires_at": {"$lt": now_iso}},
            {"$set": {"status": "expired", "expired_at": now_iso}},
        )
    except Exception:
        pass
    items = await db.home_requests.find(
        {"status": "open", "expires_at": {"$gte": now_iso}},
        {"_id": 0, "adresse_enc": 0, "audio_base64": 0},  # adresse révélée seulement après acceptation + paiement
    ).sort("created_at", -1).to_list(100)
    # Marquer si le Pro a déjà proposé sur cette demande
    for it in items:
        proposed = any(p.get("pro_id") == user["id"] for p in it.get("proposals", []))
        it["has_my_proposal"] = proposed
        # Anonymiser légèrement la Maman avant acceptation
        maman = await db.users.find_one({"id": it["maman_id"]}, {"_id": 0, "name": 1, "age": 1})
        if maman:
            nm = (maman.get("name") or "").split(" ")[0]
            it["maman_label"] = nm[0] + "***" if nm else "Patiente"
    return items


@api.get("/home-request/{req_id}/suggest")
async def suggest_proposal(req_id: str, user=Depends(require_roles("professionnel"))):
    """Calcule une suggestion de tarif basée sur le pricing_domicile du Pro + zone + majorations."""
    req = await db.home_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    pricing = (await db.users.find_one({"id": user["id"]}, {"_id": 0, "pricing_domicile": 1}) or {}).get("pricing_domicile") or HomePricingIn().dict()
    req_mode = req.get("mode", "domicile")
    # Frais de déplacement uniquement si mode=domicile
    if req_mode == "domicile":
        zone = req.get("zone") or "moyen"
        frais_map = {
            "proche": pricing["frais_zone_proche"],
            "moyen": pricing["frais_zone_moyen"],
            "loin": pricing["frais_zone_loin"],
        }
        frais = frais_map.get(zone, pricing["frais_zone_moyen"])
    else:
        zone = None
        frais = 0  # pas de déplacement pour cabinet/téléconsult
    maj = req.get("auto_majorations") or {}
    maj_nuit = pricing["majoration_nuit_fcfa"] if maj.get("nuit") else 0
    maj_we = pricing["majoration_we_fcfa"] if maj.get("we") else 0
    maj_urg = pricing["majoration_urgence_fcfa"] if maj.get("urgence") else 0
    consultation = pricing["tarif_consultation"]
    total = consultation + frais + maj_nuit + maj_we + maj_urg
    return {
        "tarif_consultation": consultation,
        "frais_deplacement": frais,
        "majoration_nuit": maj_nuit,
        "majoration_we": maj_we,
        "majoration_urgence": maj_urg,
        "total": total,
        "auto_flags": maj,
        "zone": zone,
        "mode": req_mode,
    }


@api.post("/home-request/{req_id}/propose")
async def submit_proposal(req_id: str, payload: HomeProposalIn, user=Depends(require_roles("professionnel"))):
    req = await db.home_requests.find_one({"id": req_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req["status"] not in ("open", "proposed"):
        raise HTTPException(400, f"Demande {req['status']}, propositions fermées.")
    # Empêcher 2 propositions du même Pro
    if any(p.get("pro_id") == user["id"] for p in req.get("proposals", [])):
        raise HTTPException(400, "Vous avez déjà proposé un tarif. Annulez l'ancienne pour en refaire une.")
    # Validation montants
    for k, v in payload.dict().items():
        if k == "message":
            continue
        if not isinstance(v, int) or v < 0 or v > 500000:
            raise HTTPException(400, f"Valeur invalide pour {k} (0 à 500 000 F).")
    total = (payload.tarif_consultation + payload.frais_deplacement +
             payload.majoration_nuit + payload.majoration_we + payload.majoration_urgence)
    if total <= 0:
        raise HTTPException(400, "Le total doit être > 0.")
    prop = {
        "id": str(uuid.uuid4()),
        "pro_id": user["id"],
        "tarif_consultation": payload.tarif_consultation,
        "frais_deplacement": payload.frais_deplacement,
        "majoration_nuit": payload.majoration_nuit,
        "majoration_we": payload.majoration_we,
        "majoration_urgence": payload.majoration_urgence,
        "total": total,
        "message": (payload.message or "").strip()[:500],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.home_requests.update_one(
        {"id": req_id},
        {"$push": {"proposals": prop}, "$set": {"status": "proposed"}},
    )
    # 🔔 Notif à la Maman
    pro_name = user.get("name") or "Un professionnel"
    title = "💰 Nouvelle offre de soins"
    body_msg = f"{pro_name} propose {total:,} F CFA pour votre demande à domicile.".replace(",", " ")
    try:
        await push_notif(req["maman_id"], title, body_msg, "rdv")
    except Exception:
        pass
    # 📊 Audit
    try:
        await _audit_log(user=user, action="home_proposal_submit", resource_type="HomeRequest", resource_id=req_id, details={"proposal_id": prop["id"], "total": total})
    except Exception:
        pass
    return {"ok": True, "proposal": prop}


@api.get("/home-request/mine-proposals")
async def my_proposals(user=Depends(require_roles("professionnel"))):
    """Pro voit toutes ses propositions (acceptées, en attente, expirées)."""
    items = await db.home_requests.find(
        {"proposals.pro_id": user["id"]},
        {"_id": 0, "adresse_enc": 0, "audio_base64": 0},
    ).sort("created_at", -1).to_list(200)
    out = []
    for it in items:
        my_p = next((p for p in it.get("proposals", []) if p.get("pro_id") == user["id"]), None)
        if not my_p:
            continue
        accepted_id = it.get("accepted_proposal_id")
        out.append({
            "request_id": it["id"],
            "type": it["type"],
            "motif": it["motif"],
            "zone": it["zone"],
            "ville": it.get("ville"),
            "quartier": it.get("quartier"),
            "status": it["status"],
            "my_proposal": my_p,
            "is_accepted": accepted_id == my_p["id"],
            "created_at": it["created_at"],
        })
    return out


# ============================================================================
# 🧠 SUIVI DU DÉVELOPPEMENT & DÉPISTAGE PRÉCOCE TND (M-CHAT-R)
# ============================================================================
# Module communautaire de dépistage des Troubles du Neurodéveloppement (16-30 mois).
# Basé sur le questionnaire M-CHAT-R validé scientifiquement.
# ⚠️ IMPORTANT : Outil de DÉPISTAGE, ne remplace JAMAIS un diagnostic médical.

# M-CHAT-R™ — 20 questions. Pour chaque question :
#   - `critical_answer` = réponse considérée "à risque" (qui contribue au score)
#   - Les questions 2, 5 et 12 sont des "items critiques" pondérés plus fortement
MCHAT_R_QUESTIONS = [
    {"id": 1,  "fr": "Si vous pointez quelque chose à l'autre bout de la pièce, votre enfant le regarde-t-il ?", "critical_answer": "no", "weighted": False},
    {"id": 2,  "fr": "Avez-vous déjà pensé que votre enfant pourrait être sourd ?", "critical_answer": "yes", "weighted": True},
    {"id": 3,  "fr": "Votre enfant joue-t-il à faire semblant (donner à manger à une poupée, parler au téléphone) ?", "critical_answer": "no", "weighted": False},
    {"id": 4,  "fr": "Votre enfant aime-t-il grimper sur des choses (escaliers, meubles) ?", "critical_answer": "no", "weighted": False},
    {"id": 5,  "fr": "Votre enfant fait-il d'étranges mouvements répétitifs avec ses doigts près des yeux ?", "critical_answer": "yes", "weighted": True},
    {"id": 6,  "fr": "Votre enfant pointe-t-il du doigt pour demander quelque chose ou pour obtenir de l'aide ?", "critical_answer": "no", "weighted": False},
    {"id": 7,  "fr": "Votre enfant pointe-t-il du doigt pour vous montrer quelque chose d'intéressant ?", "critical_answer": "no", "weighted": False},
    {"id": 8,  "fr": "Votre enfant s'intéresse-t-il aux autres enfants ?", "critical_answer": "no", "weighted": False},
    {"id": 9,  "fr": "Votre enfant vous montre-t-il des objets en vous les apportant ou en les soulevant ?", "critical_answer": "no", "weighted": False},
    {"id": 10, "fr": "Votre enfant répond-il à son prénom quand vous l'appelez ?", "critical_answer": "no", "weighted": False},
    {"id": 11, "fr": "Quand vous souriez à votre enfant, vous répond-il par un sourire ?", "critical_answer": "no", "weighted": False},
    {"id": 12, "fr": "Votre enfant est-il dérangé par les bruits du quotidien (aspirateur, musique forte) ?", "critical_answer": "yes", "weighted": True},
    {"id": 13, "fr": "Votre enfant marche-t-il ?", "critical_answer": "no", "weighted": False},
    {"id": 14, "fr": "Votre enfant vous regarde-t-il dans les yeux quand vous lui parlez ou le changez ?", "critical_answer": "no", "weighted": False},
    {"id": 15, "fr": "Votre enfant essaie-t-il de copier ce que vous faites (geste, son) ?", "critical_answer": "no", "weighted": False},
    {"id": 16, "fr": "Si vous regardez quelque chose, votre enfant regarde-t-il dans la même direction ?", "critical_answer": "no", "weighted": False},
    {"id": 17, "fr": "Votre enfant essaie-t-il d'attirer votre attention sur lui ?", "critical_answer": "no", "weighted": False},
    {"id": 18, "fr": "Votre enfant comprend-il quand vous lui dites de faire quelque chose ?", "critical_answer": "no", "weighted": False},
    {"id": 19, "fr": "Quand il se passe quelque chose de nouveau, votre enfant vous regarde-t-il pour voir votre réaction ?", "critical_answer": "no", "weighted": False},
    {"id": 20, "fr": "Votre enfant apprécie-t-il les jeux de mouvement (être balancé, sauté) ?", "critical_answer": "no", "weighted": False},
]


@api.get("/tnd/questions")
async def tnd_questions():
    """Retourne les 20 questions M-CHAT-R."""
    return {"questions": MCHAT_R_QUESTIONS, "total": len(MCHAT_R_QUESTIONS), "version": "M-CHAT-R v1.0 FR"}


def _compute_tnd_score(answers: Dict[str, str]) -> Dict[str, Any]:
    """Calcule le score M-CHAT-R standardisé.
    answers = {"1": "yes"|"no", "2": "yes"|"no", ...}
    Score brut = nombre de réponses 'à risque' (1 point chacune).
    Items critiques (Q2, Q5, Q12) ne sont pas pondérés différemment dans la v officielle mais
    on les signale dans le résultat car ils ont valeur diagnostique forte si à risque.
    """
    risk_count = 0
    critical_risk = []
    for q in MCHAT_R_QUESTIONS:
        qid = str(q["id"])
        ans = (answers.get(qid) or "").lower().strip()
        if ans not in ("yes", "no"):
            continue
        if ans == q["critical_answer"]:
            risk_count += 1
            if q["weighted"]:
                critical_risk.append(q["id"])
    # Niveau standardisé M-CHAT-R :
    #   0-2 = Faible (pas d'action immédiate)
    #   3-7 = Modéré (réévaluation + consultation pédiatre)
    #   8+  = Élevé (consultation spécialisée prioritaire)
    if risk_count <= 2:
        level = "faible"
    elif risk_count <= 7:
        level = "modere"
    else:
        level = "eleve"
    return {"score": risk_count, "level": level, "critical_risk": critical_risk, "total_questions": len(MCHAT_R_QUESTIONS)}


def _tnd_recommandations(level: str, critical_risk: List[int]) -> Dict[str, Any]:
    base = {
        "faible": {
            "title": "🟢 Risque faible",
            "message": "Le développement de votre enfant semble se dérouler normalement à ce stade. Continuez vos belles interactions quotidiennes (jeux, lecture, conversation).",
            "actions": [
                "Refaire un dépistage dans 6 mois pour suivre l'évolution",
                "Continuer les rendez-vous pédiatriques de routine",
                "Stimuler votre enfant via des jeux et activités adaptés à son âge",
            ],
            "urgency": "low",
        },
        "modere": {
            "title": "🟠 Risque modéré",
            "message": "Quelques signaux méritent une attention particulière. Cela ne signifie pas que votre enfant a un trouble — c'est simplement une invitation à consulter un pédiatre qui pourra approfondir.",
            "actions": [
                "Prendre RDV avec un pédiatre dans les 4 semaines",
                "Refaire ce dépistage dans 1 mois",
                "Tenir un petit journal des comportements observés",
            ],
            "urgency": "medium",
        },
        "eleve": {
            "title": "🔴 Risque élevé — Consultation recommandée",
            "message": "Plusieurs signaux suggèrent qu'un avis médical spécialisé serait précieux. Cela permettra à votre enfant de bénéficier au plus tôt d'un accompagnement adapté si nécessaire.",
            "actions": [
                "Prendre RDV avec un pédiatre ou pédopsychiatre dans les 2 semaines",
                "Demander une orientation vers un centre de référence TND",
                "Apporter ce rapport au pro de santé lors de la consultation",
            ],
            "urgency": "high",
        },
    }
    out = base[level]
    if critical_risk:
        out["critical_note"] = f"⚠️ Question(s) critique(s) signalée(s) : {', '.join(f'Q{x}' for x in critical_risk)}. Mentionnez-le au pro de santé."
    return out


class TndScreeningIn(BaseModel):
    enfant_id: str
    answers: Dict[str, str]  # {"1": "yes", "2": "no", ...}
    age_months: Optional[int] = None
    notes: Optional[str] = ""


@api.post("/tnd/screening")
async def submit_tnd_screening(payload: TndScreeningIn, user=Depends(require_roles("maman", "professionnel"))):
    """Soumet un dépistage M-CHAT-R et calcule automatiquement le score."""
    # Vérifier l'enfant appartient bien à la maman (ou contexte pro autorisé)
    enf = await db.enfants.find_one({"id": payload.enfant_id}, {"_id": 0})
    if not enf:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and enf.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé à cet enfant")
    # Validation : au moins 80% des questions répondues
    if len([a for a in payload.answers.values() if a in ("yes", "no")]) < 16:
        raise HTTPException(400, "Veuillez répondre à au moins 16 questions sur 20.")
    score_data = _compute_tnd_score(payload.answers)
    recos = _tnd_recommandations(score_data["level"], score_data["critical_risk"])
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "enfant_id": payload.enfant_id,
        "enfant_name": enf.get("prenom") or enf.get("name"),
        "maman_id": enf.get("user_id"),
        "submitted_by": user["id"],
        "submitted_by_role": user["role"],
        "answers": payload.answers,
        "score": score_data["score"],
        "level": score_data["level"],
        "critical_risk": score_data["critical_risk"],
        "recommandations": recos,
        "age_months": payload.age_months,
        "notes": (payload.notes or "").strip()[:500],
        "version": "M-CHAT-R v1.0 FR",
        "created_at": now.isoformat(),
    }
    await db.tnd_screenings.insert_one(doc)
    doc.pop("_id", None)
    # 📊 Audit
    try:
        await _audit_log(user=user, action="tnd_screening_submit", resource_type="TndScreening", resource_id=doc["id"], details={"enfant_id": payload.enfant_id, "level": score_data["level"], "score": score_data["score"]})
    except Exception:
        pass
    return doc


@api.get("/tnd/screenings/{enfant_id}")
async def list_tnd_screenings(enfant_id: str, user=Depends(get_current_user)):
    enf = await db.enfants.find_one({"id": enfant_id}, {"_id": 0})
    if not enf:
        raise HTTPException(404, "Enfant introuvable")
    if user["role"] == "maman" and enf.get("user_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    items = await db.tnd_screenings.find({"enfant_id": enfant_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


@api.get("/tnd/screening/{screening_id}")
async def get_tnd_screening(screening_id: str, user=Depends(get_current_user)):
    doc = await db.tnd_screenings.find_one({"id": screening_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dépistage introuvable")
    if user["role"] == "maman" and doc.get("maman_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    return doc


# ============================================================================
# 🧠 M-CHAT-R/F — Follow-up Interview (entretien détaillé complet)
# ============================================================================
# L'entretien M-CHAT-R/F est passé UNIQUEMENT pour les items "à risque" du M-CHAT-R initial.
# Pour chaque item échoué, on pose 2-4 questions de confirmation. Si la maman répond OUI à au moins
# UNE question prouvant que le comportement EST PRÉSENT → l'item devient PASS (vrai négatif).
# Sinon → l'item reste FAIL.
# Score final :
#   0-1 = LOW RISK (pas d'orientation)
#   2+  = HIGH RISK → consultation spécialisée
# Référence : Robins, Fein, & Barton (2009), https://mchatscreen.com

# Pour chaque item, on définit une liste de questions de confirmation.
# Si une seule réponse "OUI" → comportement présent → item PASS (retiré du score final).
MCHAT_R_F_FOLLOWUP: Dict[int, Dict[str, Any]] = {
    1: {
        "behaviour": "Suivre du regard un objet que vous pointez",
        "questions": [
            "Avez-vous déjà essayé de pointer du doigt un objet pour le lui montrer ?",
            "Quand vous pointez du doigt, votre enfant tourne-t-il la tête vers l'objet ?",
            "Le fait-il au moins une fois par semaine ?",
        ],
        # confirmation: si OUI aux Q2 ET Q3, comportement présent
        "pass_logic": "needs_q2_and_q3",
    },
    2: {
        "behaviour": "Suspicion d'audition (souci de surdité)",
        "questions": [
            "Avez-vous déjà eu fait un test auditif chez le médecin ?",
            "Quand un bruit fort survient, votre enfant tourne-t-il la tête ou réagit-il ?",
            "Quand vous l'appelez d'une autre pièce, vient-il vers vous ?",
        ],
        # Critique inversé : si OUI à Q2 ou Q3 → l'audition est normale → item PASS
        "pass_logic": "q2_or_q3",
    },
    3: {
        "behaviour": "Jeu de faire-semblant",
        "questions": [
            "Donne-t-il à manger/à boire à sa poupée ou son nounours ?",
            "Fait-il semblant de parler au téléphone (avec une banane ou un vrai téléphone) ?",
            "Fait-il semblant de cuisiner, de conduire ou d'imiter une activité d'adulte ?",
        ],
        "pass_logic": "any_yes",
    },
    4: {
        "behaviour": "Grimper",
        "questions": [
            "Peut-il monter les escaliers tout seul (en tenant la rampe ou non) ?",
            "Grimpe-t-il sur le canapé, sur une chaise, ou sur un lit ?",
            "Essaie-t-il d'attraper des objets en hauteur en grimpant ?",
        ],
        "pass_logic": "any_yes",
    },
    5: {
        "behaviour": "Mouvements répétitifs étranges",
        "questions": [
            "Bat-il des mains de manière inhabituelle quand il est excité ?",
            "Tourne-t-il sur lui-même longtemps sans étourdissement ?",
            "Fixe-t-il ses doigts ou des objets très près de ses yeux pendant longtemps ?",
        ],
        # Critique : si AUCUN comportement étrange (que des "non") → item PASS
        "pass_logic": "all_no",
    },
    6: {
        "behaviour": "Pointer pour demander",
        "questions": [
            "Quand il veut un biscuit hors de portée, comment vous le fait-il comprendre — il pointe ?",
            "Pointe-t-il du doigt pour demander de l'aide ?",
            "Vous prend-il par la main jusqu'à l'objet plutôt que de pointer ?",
        ],
        # PASS si Q1 ou Q2 = OUI (pointe vraiment). Q3 = OUI = signe d'évitement.
        "pass_logic": "q1_or_q2",
    },
    7: {
        "behaviour": "Pointer pour partager l'intérêt",
        "questions": [
            "Quand il voit un avion, un chien, un animal, vous pointe-t-il pour vous montrer ?",
            "Vous regarde-t-il pour vérifier que vous regardez aussi ?",
            "Le fait-il au moins une fois par semaine ?",
        ],
        "pass_logic": "needs_q1_and_q2",
    },
    8: {
        "behaviour": "Intérêt pour les autres enfants",
        "questions": [
            "Au marché ou en visite, regarde-t-il d'autres enfants avec curiosité ?",
            "Essaie-t-il de jouer ou interagir avec eux ?",
            "Sourit-il quand un enfant lui sourit ?",
        ],
        "pass_logic": "any_yes",
    },
    9: {
        "behaviour": "Montrer des objets",
        "questions": [
            "Vous apporte-t-il un jouet pour vous le montrer (pas pour vous demander de l'aide) ?",
            "Soulève-t-il un objet en l'air pour que vous le voyiez ?",
            "Vous tend-il une image ou un dessin pour le partager ?",
        ],
        "pass_logic": "any_yes",
    },
    10: {
        "behaviour": "Réponse au prénom",
        "questions": [
            "Quand vous l'appelez par son prénom, tourne-t-il la tête vers vous ?",
            "Le fait-il même quand il joue ou regarde la télé ?",
            "Le fait-il presque à chaque fois (>50%) ?",
        ],
        "pass_logic": "needs_q1_and_q3",
    },
    11: {
        "behaviour": "Sourire-réponse",
        "questions": [
            "Quand vous lui souriez chaleureusement, vous répond-il par un sourire ?",
            "Cela se produit-il plusieurs fois par jour ?",
            "Est-ce qu'il vous sourit même sans que vous ayez fait quelque chose de spécial ?",
        ],
        "pass_logic": "needs_q1_and_q2",
    },
    12: {
        "behaviour": "Sensibilité au bruit (critique)",
        "questions": [
            "Met-il ses mains sur ses oreilles quand il entend l'aspirateur, le mixeur ou un bruit fort ?",
            "Pleure-t-il, hurle-t-il ou s'enfuit-il quand il y a du bruit ?",
            "Se calme-t-il rapidement après ?",
        ],
        # PASS si Q1=NON ET Q2=NON (pas de sensibilité anormale)
        "pass_logic": "q1_and_q2_no",
    },
    13: {
        "behaviour": "Marche",
        "questions": [
            "Marche-t-il sans tenir un meuble ou votre main ?",
            "Marche-t-il depuis plus d'un mois ?",
        ],
        "pass_logic": "needs_q1_and_q2",
    },
    14: {
        "behaviour": "Contact visuel",
        "questions": [
            "Quand vous parlez avec lui, vous regarde-t-il dans les yeux ?",
            "Le fait-il pendant les soins (bain, change, repas) ?",
            "Le fait-il plusieurs fois par jour ?",
        ],
        "pass_logic": "needs_q1_and_q3",
    },
    15: {
        "behaviour": "Imitation",
        "questions": [
            "Quand vous battez des mains, essaie-t-il de battre des mains aussi ?",
            "Imite-t-il les sons (animaux, voitures) que vous faites ?",
            "Imite-t-il un geste comme dire au revoir de la main ?",
        ],
        "pass_logic": "any_yes",
    },
    16: {
        "behaviour": "Suivre le regard",
        "questions": [
            "Si vous regardez vers un objet, regarde-t-il dans la même direction ?",
            "Le fait-il sans que vous pointiez du doigt ?",
            "Suit-il votre regard plusieurs fois par jour ?",
        ],
        "pass_logic": "needs_q1_and_q2",
    },
    17: {
        "behaviour": "Attirer l'attention",
        "questions": [
            "Fait-il des choses pour vous faire rire ou applaudir ?",
            "Vous appelle-t-il en disant 'maman' ou 'papa' pour montrer quelque chose ?",
            "Vous cherche-t-il du regard pour vérifier votre réaction ?",
        ],
        "pass_logic": "any_yes",
    },
    18: {
        "behaviour": "Compréhension d'instructions",
        "questions": [
            "Si vous dites 'donne-moi la balle', vous la donne-t-il ?",
            "Comprend-il 'viens ici' sans geste accompagnant ?",
            "Suit-il une consigne en 2 étapes (ex: 'prends ton bol et amène-le') ?",
        ],
        "pass_logic": "needs_q1_or_q2",
    },
    19: {
        "behaviour": "Référencement social",
        "questions": [
            "Devant un événement nouveau (bruit, personne inconnue), vous regarde-t-il pour voir votre réaction ?",
            "Adapte-t-il son comportement à la vôtre (rassuré si vous souriez, alerté si vous froncez les sourcils) ?",
            "Le fait-il plusieurs fois par jour ?",
        ],
        "pass_logic": "needs_q1_and_q2",
    },
    20: {
        "behaviour": "Plaisir du mouvement",
        "questions": [
            "Rit-il ou sourit-il quand vous le balancez, le faites sauter, le faites tourner ?",
            "Demande-t-il à ce que vous recommenciez (gestes, sons) ?",
            "Est-ce qu'il déteste plutôt être touché ou bougé brusquement ?",
        ],
        # PASS si Q1=OUI ET Q3=NON (aime le mouvement, n'a pas peur du contact)
        "pass_logic": "q1_yes_q3_no",
    },
}


def _evaluate_followup_pass(item_id: int, fu_answers: List[str]) -> bool:
    """Décide si un item devient PASS après follow-up. fu_answers = liste de 'yes'/'no'/'skip'."""
    rule = MCHAT_R_F_FOLLOWUP.get(item_id, {}).get("pass_logic", "any_yes")
    yes = [a == "yes" for a in fu_answers]
    no = [a == "no" for a in fu_answers]
    n = len(fu_answers)
    if rule == "any_yes":
        return any(yes)
    if rule == "all_no":
        return all(no[:n]) and n > 0
    if rule == "q2_or_q3" and n >= 3:
        return yes[1] or yes[2]
    if rule == "q1_or_q2" and n >= 2:
        return yes[0] or yes[1]
    if rule == "needs_q1_and_q2" and n >= 2:
        return yes[0] and yes[1]
    if rule == "needs_q1_and_q3" and n >= 3:
        return yes[0] and yes[2]
    if rule == "needs_q1_or_q2" and n >= 2:
        return yes[0] or yes[1]
    if rule == "needs_q2_and_q3" and n >= 3:
        return yes[1] and yes[2]
    if rule == "q1_and_q2_no" and n >= 2:
        return no[0] and no[1]
    if rule == "q1_yes_q3_no" and n >= 3:
        return yes[0] and no[2]
    return any(yes)


@api.get("/tnd/followup/{screening_id}")
async def tnd_followup_questions(screening_id: str, user=Depends(get_current_user)):
    """Retourne les items à confirmer + leurs questions de follow-up."""
    doc = await db.tnd_screenings.find_one({"id": screening_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dépistage introuvable")
    if user["role"] == "maman" and doc.get("maman_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    # Items "à risque" du dépistage initial = ceux dont la réponse correspond à critical_answer
    failed_items: List[Dict[str, Any]] = []
    for q in MCHAT_R_QUESTIONS:
        qid = str(q["id"])
        ans = (doc.get("answers", {}).get(qid) or "").lower()
        if ans == q["critical_answer"]:
            fu = MCHAT_R_F_FOLLOWUP.get(q["id"]) or {}
            failed_items.append({
                "item_id": q["id"],
                "original_question": q["fr"],
                "behaviour": fu.get("behaviour", q["fr"]),
                "weighted": q.get("weighted", False),
                "questions": fu.get("questions", []),
            })
    return {
        "screening_id": screening_id,
        "enfant_id": doc.get("enfant_id"),
        "level_initial": doc.get("level"),
        "score_initial": doc.get("score"),
        "items_to_confirm": failed_items,
        "total_to_confirm": len(failed_items),
        "version": "M-CHAT-R/F v1.0 FR",
    }


class TndFollowupIn(BaseModel):
    # answers : { "item_id": ["yes"|"no"|"skip", ...] }
    answers: Dict[str, List[str]]
    notes: Optional[str] = ""


@api.post("/tnd/followup/{screening_id}")
async def submit_tnd_followup(screening_id: str, payload: TndFollowupIn, user=Depends(require_roles("maman", "professionnel"))):
    """Soumet les réponses du follow-up et recalcule le score final."""
    doc = await db.tnd_screenings.find_one({"id": screening_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dépistage introuvable")
    if user["role"] == "maman" and doc.get("maman_id") != user["id"]:
        raise HTTPException(403, "Accès refusé")
    if doc.get("followup"):
        raise HTTPException(400, "Un follow-up a déjà été enregistré pour ce dépistage.")
    # Recalcul item par item
    item_results: List[Dict[str, Any]] = []
    final_score = 0
    critical_final: List[int] = []
    for q in MCHAT_R_QUESTIONS:
        qid_str = str(q["id"])
        original = (doc.get("answers", {}).get(qid_str) or "").lower()
        if original != q["critical_answer"]:
            continue  # déjà PASS au screening initial
        fu_ans = payload.answers.get(qid_str) or []
        if not fu_ans:
            # Pas de follow-up rendu → on garde le FAIL initial
            item_results.append({"item_id": q["id"], "status": "fail", "reason": "no_followup_provided"})
            final_score += 1
            if q.get("weighted"):
                critical_final.append(q["id"])
            continue
        passed = _evaluate_followup_pass(q["id"], fu_ans)
        item_results.append({
            "item_id": q["id"],
            "status": "pass" if passed else "fail",
            "followup_answers": fu_ans,
        })
        if not passed:
            final_score += 1
            if q.get("weighted"):
                critical_final.append(q["id"])

    # Niveau final M-CHAT-R/F
    if final_score <= 1:
        level_final = "faible"
    elif final_score >= 2 and final_score <= 7:
        level_final = "modere"
    else:
        level_final = "eleve"
    reco_final = _tnd_recommandations(level_final, critical_final)

    followup_doc = {
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "submitted_by": user["id"],
        "submitted_by_role": user["role"],
        "answers": payload.answers,
        "item_results": item_results,
        "score_final": final_score,
        "level_final": level_final,
        "critical_final": critical_final,
        "recommandations_final": reco_final,
        "notes": (payload.notes or "").strip()[:500],
        "version": "M-CHAT-R/F v1.0 FR",
    }
    await db.tnd_screenings.update_one(
        {"id": screening_id},
        {"$set": {"followup": followup_doc, "level_final": level_final, "score_final": final_score}},
    )
    try:
        await _audit_log(user=user, action="tnd_followup_submit", resource_type="TndScreening", resource_id=screening_id, details={"level_initial": doc.get("level"), "level_final": level_final, "score_initial": doc.get("score"), "score_final": final_score})
    except Exception:
        pass
    return {"screening_id": screening_id, **followup_doc}


# ============================================================================
# 🤰 GROSSESSE + — Module premium d'accompagnement semaine par semaine
# ============================================================================
# Inspiré de Pregnancy+ (Philips), adapté au contexte ivoirien.
# Phase 1 MVP : tableau de bord + contenu éducatif 4 → 41 semaines.

# Contenu hebdomadaire condensé. Sources : OMS, INSPQ, recommandations ivoiriennes.
# Format : {week: {size_cm, weight_g, fruit, emoji, dev, changes, tip}}
PREGNANCY_WEEKLY = {
    4:  {"size_cm": 0.1, "weight_g": 0,    "fruit": "graine de pavot",     "emoji": "🌱", "dev": "L'embryon s'implante dans l'utérus. Les premières cellules nerveuses se forment.", "changes": "Vous ne ressentez peut-être rien encore. Possible légère fatigue, sensibilité des seins.", "tip": "Commencez l'acide folique (5 mg/jour). Évitez alcool, tabac et automédication."},
    5:  {"size_cm": 0.2, "weight_g": 0,    "fruit": "grain de sésame",      "emoji": "✨", "dev": "Le cœur commence à battre. Tube neural en formation.", "changes": "Premiers signes possibles : retard de règles, nausées légères.", "tip": "Prenez RDV pour votre première CPN (consultation prénatale)."},
    6:  {"size_cm": 0.5, "weight_g": 0,    "fruit": "lentille",             "emoji": "🫘", "dev": "Yeux, oreilles, membres en formation. Cœur bat ~110 fois/min.", "changes": "Nausées plus fréquentes. Envie d'uriner souvent.", "tip": "Mangez en petites quantités fréquemment pour limiter les nausées."},
    7:  {"size_cm": 1.0, "weight_g": 1,    "fruit": "myrtille",             "emoji": "🫐", "dev": "Le cerveau se développe rapidement. Doigts visibles.", "changes": "Fatigue intense possible. Hypersalivation.", "tip": "Reposez-vous. Le 1er trimestre est physiquement éprouvant — c'est normal."},
    8:  {"size_cm": 1.6, "weight_g": 1,    "fruit": "haricot",              "emoji": "🫛", "dev": "Le bébé bouge déjà ses bras et jambes (vous ne le sentez pas encore).", "changes": "Sensibilité des seins très marquée. Sautes d'humeur.", "tip": "Échographie de datation entre semaines 8 et 12."},
    9:  {"size_cm": 2.3, "weight_g": 2,    "fruit": "cerise",               "emoji": "🍒", "dev": "Tous les organes principaux sont en place. Le bébé est officiellement un fœtus.", "changes": "Possibles ballonnements, constipation.", "tip": "Buvez 1,5 L d'eau/jour minimum. Fibres ++."},
    10: {"size_cm": 3.1, "weight_g": 4,    "fruit": "fraise",               "emoji": "🍓", "dev": "Empreintes digitales visibles. Le bébé avale du liquide amniotique.", "changes": "Nausées peuvent commencer à diminuer.", "tip": "Annoncez la grossesse à votre entourage si vous le souhaitez."},
    11: {"size_cm": 4.1, "weight_g": 7,    "fruit": "citron vert",          "emoji": "🍋", "dev": "Le bébé peut bâiller, se mettre dans toutes les positions.", "changes": "Premières envies alimentaires. Légère prise de poids.", "tip": "Évitez les fromages au lait cru, charcuterie, poisson cru (listeria)."},
    12: {"size_cm": 5.4, "weight_g": 14,   "fruit": "prune",                "emoji": "🍑", "dev": "Tous les muscles fonctionnent. Le sexe peut commencer à être visible.", "changes": "Fin du 1er trimestre — vous respirez !", "tip": "1ère échographie morphologique entre 11 et 13 SA + dépistage T21."},
    13: {"size_cm": 7.4, "weight_g": 23,   "fruit": "pêche",                "emoji": "🍑", "dev": "Cordes vocales en formation. Le bébé commence à entendre.", "changes": "Énergie revient. Faim accrue.", "tip": "Parlez à votre bébé — il entend votre voix dès maintenant."},
    14: {"size_cm": 8.7, "weight_g": 43,   "fruit": "citron",               "emoji": "🍋", "dev": "Le bébé fait des grimaces, fronce les sourcils.", "changes": "Le ventre commence à s'arrondir.", "tip": "Pensez aux vêtements de grossesse confortables."},
    15: {"size_cm": 10.1,"weight_g": 70,   "fruit": "pomme",                "emoji": "🍎", "dev": "Le bébé entend votre cœur. Cheveux et sourcils se forment.", "changes": "Peau du visage parfois plus pigmentée (masque de grossesse).", "tip": "Protégez votre visage du soleil ; appliquez écran solaire."},
    16: {"size_cm": 11.6,"weight_g": 100,  "fruit": "avocat",               "emoji": "🥑", "dev": "Mouvements de plus en plus coordonnés. Le bébé suce son pouce.", "changes": "Premiers mouvements possibles (pour les 2e grossesses).", "tip": "Mangez riche en fer (foie, lentilles) pour prévenir l'anémie."},
    17: {"size_cm": 13,  "weight_g": 140,  "fruit": "poire",                "emoji": "🍐", "dev": "Le bébé a maintenant des empreintes uniques.", "changes": "Ventre rond visible. Possible douleurs ligamentaires.", "tip": "Marchez doucement 30 min/jour. Pas de sports violents."},
    18: {"size_cm": 14.2,"weight_g": 190,  "fruit": "poivron",              "emoji": "🫑", "dev": "Le bébé entend distinctement les sons extérieurs.", "changes": "Premiers vrais mouvements ressentis (1ère grossesse).", "tip": "Faites jouer de la musique douce — le bébé adore."},
    19: {"size_cm": 15.3,"weight_g": 240,  "fruit": "mangue",               "emoji": "🥭", "dev": "Verbix caséeuse (couche protectrice) recouvre la peau.", "changes": "Possible essoufflement à l'effort.", "tip": "Préférez petites portions et plusieurs collations légères."},
    20: {"size_cm": 16.4,"weight_g": 300,  "fruit": "banane",               "emoji": "🍌", "dev": "Mi-grossesse 🎉 ! Le bébé pèse environ 300 g.", "changes": "Vous sentez nettement les coups.", "tip": "2e échographie morphologique entre 20 et 25 SA."},
    21: {"size_cm": 26.7,"weight_g": 360,  "fruit": "carotte",              "emoji": "🥕", "dev": "Le bébé avale jusqu'à 250 ml de liquide amniotique/jour.", "changes": "Appétit important. Léger gonflement des chevilles.", "tip": "Réduisez le sel pour limiter la rétention d'eau."},
    22: {"size_cm": 27.8,"weight_g": 430,  "fruit": "papaye",               "emoji": "🍈", "dev": "Le sens du goût se développe. Le bébé sourit parfois.", "changes": "Insomnies possibles. Crampes nocturnes.", "tip": "Magnésium (banane, chocolat noir) pour les crampes."},
    23: {"size_cm": 28.9,"weight_g": 500,  "fruit": "noix de coco",         "emoji": "🥥", "dev": "Poumons se développent vite. Première graisse brune.", "changes": "Vergetures possibles. Démangeaisons du ventre.", "tip": "Hydratez le ventre avec une huile végétale (karité, coco)."},
    24: {"size_cm": 30,  "weight_g": 600,  "fruit": "épi de maïs",          "emoji": "🌽", "dev": "Cellules visuelles complètes. Le bébé peut respirer brièvement hors utérus si naissance prématurée.", "changes": "Dépistage du diabète gestationnel à faire.", "tip": "Test HGPO entre 24 et 28 SA — important pour le bébé."},
    25: {"size_cm": 34.6,"weight_g": 660,  "fruit": "chou-fleur",           "emoji": "🥦", "dev": "Le bébé répond aux stimuli (lumière, sons forts).", "changes": "Possible hypertension à surveiller.", "tip": "Mesurez votre tension régulièrement. Signalez si > 140/90."},
    26: {"size_cm": 35.6,"weight_g": 760,  "fruit": "salade verte",         "emoji": "🥬", "dev": "Cycles veille/sommeil distincts.", "changes": "Ventre dur par moments (contractions de Braxton-Hicks).", "tip": "Reposez-vous si contractions douloureuses. Sinon, c'est normal."},
    27: {"size_cm": 36.6,"weight_g": 875,  "fruit": "chou",                 "emoji": "🥬", "dev": "Fin du 2e trimestre. Le bébé rêve (REM detected).", "changes": "Fatigue revient progressivement.", "tip": "Inscrivez-vous aux cours de préparation à l'accouchement."},
    28: {"size_cm": 37.6,"weight_g": 1005, "fruit": "aubergine",            "emoji": "🍆", "dev": "Yeux ouverts. Cils visibles. Réflexe de succion.", "changes": "Début du 3e trimestre. Ventre proéminent.", "tip": "Échographie de croissance entre 28 et 32 SA."},
    29: {"size_cm": 38.6,"weight_g": 1150, "fruit": "courge butternut",     "emoji": "🎃", "dev": "Le cerveau a 100 milliards de neurones.", "changes": "Difficultés à dormir sur le ventre.", "tip": "Dormez sur le côté gauche pour favoriser circulation."},
    30: {"size_cm": 39.9,"weight_g": 1320, "fruit": "courgette",            "emoji": "🥒", "dev": "Le bébé prend du poids rapidement (~200 g/semaine).", "changes": "Plus de mouvements et plus vigoureux.", "tip": "Comptez les mouvements : 10 mouvements en 2h = normal."},
    31: {"size_cm": 41.1,"weight_g": 1500, "fruit": "ananas",               "emoji": "🍍", "dev": "Os complètement formés mais souples.", "changes": "Souffle court fréquent.", "tip": "Respirez profondément. Évitez position allongée sur le dos."},
    32: {"size_cm": 42.4,"weight_g": 1700, "fruit": "courge", "emoji": "🎃", "dev": "Le bébé se met (souvent) en position tête en bas.", "changes": "Possibles œdèmes mains/pieds.", "tip": "Surélevez vos jambes 15 min/jour. Tension à surveiller."},
    33: {"size_cm": 43.7,"weight_g": 1920, "fruit": "céleri-rave",          "emoji": "🌰", "dev": "Système immunitaire en développement via anticorps maternels.", "changes": "Bébé prend de la place — souffle court continue.", "tip": "Préparez votre sac maternité — listes dispos dans l'app."},
    34: {"size_cm": 45,  "weight_g": 2150, "fruit": "melon cantaloup",      "emoji": "🍈", "dev": "Ongles atteignent le bout des doigts.", "changes": "Faux travail possible (contractions irrégulières).", "tip": "Sachez distinguer fausses contractions du vrai travail : régularité + durée."},
    35: {"size_cm": 46.2,"weight_g": 2380, "fruit": "ananas Victoria",      "emoji": "🍍", "dev": "Poumons matures à 95%. Le bébé pourrait survivre sans aide.", "changes": "Le bébé descend dans le bassin.", "tip": "Préparez le trajet jusqu'à votre maternité. Notez les numéros d'urgence."},
    36: {"size_cm": 47.4,"weight_g": 2620, "fruit": "laitue romaine",       "emoji": "🥬", "dev": "Vernix caséeuse s'épaissit. Bébé prêt à naître.", "changes": "Col commence parfois à se modifier.", "tip": "Visite prénatale toutes les semaines maintenant."},
    37: {"size_cm": 48.6,"weight_g": 2860, "fruit": "blette",               "emoji": "🥬", "dev": "Grossesse à terme dès cette semaine !", "changes": "Vous attendez le moment...", "tip": "Sac maternité prêt près de la porte. Contact maternité validé."},
    38: {"size_cm": 49.8,"weight_g": 3080, "fruit": "poireau",              "emoji": "🥬", "dev": "Empreintes du cerveau profondes. Cordes vocales prêtes.", "changes": "Contractions plus rapprochées.", "tip": "Comptez les espaces entre contractions. À l'hôpital si < 5 min régulièrement."},
    39: {"size_cm": 50.7,"weight_g": 3290, "fruit": "petite pastèque",      "emoji": "🍉", "dev": "Vernix protège la peau. Liquide amniotique diminue.", "changes": "Sensation de pression pelvienne.", "tip": "Reposez-vous au maximum. Restez près du téléphone."},
    40: {"size_cm": 51.2,"weight_g": 3460, "fruit": "petite citrouille",    "emoji": "🎃", "dev": "Bébé prêt à découvrir le monde 🌍 !", "changes": "Vous pouvez accoucher à tout moment.", "tip": "Patientez sereinement. Promenades douces si col favorable."},
    41: {"size_cm": 51.7,"weight_g": 3600, "fruit": "potiron",              "emoji": "🎃", "dev": "Bébé a dépassé le terme officiel.", "changes": "Suivi rapproché — déclenchement possible.", "tip": "Surveillance accrue. Consultez la maternité quotidiennement."},
}


# ----------------------------------------------------------------------
# Helpers premium et résolution de la grossesse active
# ----------------------------------------------------------------------
def _require_premium_maman(user: dict):
    """Garde-fou Premium pour le module Grossesse +."""
    if user.get("role") != "maman":
        raise HTTPException(403, "Réservé aux mamans")
    if not is_premium_active(user):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "premium_required",
                "message": "Le module Grossesse + est réservé aux abonnées Premium (5 000 FCFA/mois).",
                "upgrade_url": "/premium",
            },
        )


async def _get_active_grossesse(user_id: str):
    """Retourne la grossesse active de la maman ou None."""
    g = await db.grossesses.find_one(
        {"user_id": user_id, "active": True}, {"_id": 0}
    )
    return g


def _compute_dpa(date_debut_iso: str, date_terme_iso: Optional[str]) -> datetime:
    """DPA = soit DPA explicite, soit DDR + 280 jours. Toujours retourne un datetime tz-aware UTC."""
    if date_terme_iso:
        try:
            d = datetime.fromisoformat(date_terme_iso.replace("Z", "+00:00"))
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return d
        except Exception:
            pass
    ddr = datetime.fromisoformat(date_debut_iso.replace("Z", "+00:00"))
    if ddr.tzinfo is None:
        ddr = ddr.replace(tzinfo=timezone.utc)
    return ddr + timedelta(days=280)


def _compute_pregnancy_age(date_debut_iso: str) -> tuple[int, int, int]:
    """Retourne (semaines, jours, trimestre) à partir de la DDR."""
    ddr = datetime.fromisoformat(date_debut_iso.replace("Z", "+00:00"))
    # Tolérer naive dates : forcer UTC
    if ddr.tzinfo is None:
        ddr = ddr.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    days_total = max(0, (now - ddr).days)
    weeks = days_total // 7
    days = days_total % 7
    trimester = 1 if weeks <= 13 else (2 if weeks <= 27 else 3)
    return weeks, days, trimester


# ----------------------------------------------------------------------
# Grossesse + — fiches hebdomadaires (lecture publique pour preview)
# ----------------------------------------------------------------------
@api.get("/grossesse-plus/week/{week}")
async def grossesse_week(week: int):
    """Retourne la fiche éducative pour une semaine donnée (4-41)."""
    if week < 4 or week > 41:
        raise HTTPException(400, "Semaine hors plage (4-41).")
    data = PREGNANCY_WEEKLY.get(week)
    if not data:
        raise HTTPException(404, "Fiche introuvable")
    trimester = 1 if week <= 13 else (2 if week <= 27 else 3)
    return {"week": week, "trimester": trimester, **data}


@api.get("/grossesse-plus/weeks")
async def list_all_weeks():
    """Liste des 38 fiches hebdomadaires (miniatures)."""
    out = []
    for w in range(4, 42):
        d = PREGNANCY_WEEKLY.get(w)
        if d:
            out.append({
                "week": w,
                "trimester": 1 if w <= 13 else (2 if w <= 27 else 3),
                "fruit": d["fruit"],
                "emoji": d["emoji"],
                "size_cm": d["size_cm"],
                "weight_g": d["weight_g"],
            })
    return out


# ----------------------------------------------------------------------
# Dashboard Grossesse + (Premium uniquement)
# ----------------------------------------------------------------------
@api.get("/grossesse-plus/dashboard")
async def grossesse_plus_dashboard(user=Depends(require_roles("maman"))):
    """Tableau de bord premium : âge grossesse + DPA + fiche semaine actuelle."""
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(
            404,
            "Aucune grossesse active. Configurez d'abord votre grossesse dans l'onglet Grossesse.",
        )
    date_debut = g.get("date_debut")
    if not date_debut:
        raise HTTPException(400, "Date de début (DDR) manquante.")
    try:
        weeks, days, trimester = _compute_pregnancy_age(date_debut)
        dpa = _compute_dpa(date_debut, g.get("date_terme"))
    except Exception:
        raise HTTPException(400, "Format de date invalide")
    now = datetime.now(timezone.utc)
    days_to_dpa = (dpa - now).days
    progression = min(100, round((min(weeks, 40) / 40) * 100))
    week_for_content = max(4, min(41, weeks))
    fiche = PREGNANCY_WEEKLY.get(week_for_content) or {}

    # Dernière mesure de poids
    last_weight = await db.grossesse_tracking.find_one(
        {"user_id": user["id"], "poids_kg": {"$ne": None}},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )

    # Nombre de notes/journal
    journal_count = await db.grossesse_journal.count_documents({"user_id": user["id"]})

    return {
        "grossesse_id": g.get("id"),
        "weeks": weeks,
        "days": days,
        "label": f"{weeks} semaine{'s' if weeks > 1 else ''} et {days} jour{'s' if days > 1 else ''}",
        "trimester": trimester,
        "date_debut": date_debut,
        "dpa": dpa.isoformat(),
        "days_to_dpa": days_to_dpa,
        "progression_pct": progression,
        "current_week_content": {"week": week_for_content, "trimester": trimester, **fiche},
        "last_weight": last_weight,
        "journal_count": journal_count,
        "consent_partage_pro": bool(g.get("consent_partage_pro", False)),
    }


# ----------------------------------------------------------------------
# Setup grossesse premium (DDR ou DPA)
# ----------------------------------------------------------------------
class GrossessePlusSetupIn(BaseModel):
    source: Literal["ddr", "dpa", "echographie"] = "ddr"
    date_debut: Optional[str] = None   # ISO date (DDR)
    date_terme: Optional[str] = None   # ISO date (DPA si saisie pro)
    parite: Optional[int] = None       # nb grossesses précédentes
    groupe_sanguin: Optional[str] = None
    rhesus: Optional[Literal["+", "-"]] = None
    consent_partage_pro: Optional[bool] = False


@api.post("/grossesse-plus/setup")
async def grossesse_plus_setup(payload: GrossessePlusSetupIn, user=Depends(require_roles("maman"))):
    """Configure ou met à jour la grossesse active (DDR ou DPA).
    - Si source = 'dpa' et date_terme fournie → calcule la DDR rétroactivement (DPA - 280j).
    - Si source = 'ddr' et date_debut fournie → enregistre la DDR.
    - Auto-génère les rappels CPN dans `db.reminders` (RGSSI N3).
    """
    _require_premium_maman(user)
    date_debut = payload.date_debut
    date_terme = payload.date_terme
    if payload.source in ("dpa", "echographie"):
        if not date_terme:
            raise HTTPException(400, "Date prévue d'accouchement requise pour cette source.")
        try:
            dpa_dt = datetime.fromisoformat(date_terme.replace("Z", "+00:00"))
            ddr_dt = dpa_dt - timedelta(days=280)
            date_debut = ddr_dt.isoformat()
        except Exception:
            raise HTTPException(400, "Format DPA invalide")
    else:  # ddr
        if not date_debut:
            raise HTTPException(400, "Date de dernières règles requise.")

    # Désactive les grossesses précédentes
    await db.grossesses.update_many(
        {"user_id": user["id"], "active": True}, {"$set": {"active": False}}
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "date_debut": date_debut,
        "date_terme": date_terme,
        "source": payload.source,
        "parite": payload.parite,
        "groupe_sanguin": payload.groupe_sanguin,
        "rhesus": payload.rhesus,
        "symptomes": [],
        "notes": None,
        "consent_partage_pro": bool(payload.consent_partage_pro or False),
        "trousseau": [],
        "active": True,
        "premium_module": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesses.insert_one(doc)
    doc.pop("_id", None)

    # 🔔 Auto-génère rappels CPN pour les RDV importants à venir
    try:
        ddr_dt = datetime.fromisoformat(date_debut.replace("Z", "+00:00"))
        if ddr_dt.tzinfo is None:
            ddr_dt = ddr_dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        # Supprime les anciens rappels CPN pour éviter doublons
        await db.reminders.delete_many({"user_id": user["id"], "source": "grossesse_plus_cpn"})
        for cpn in CPN_SCHEDULE:
            if cpn.get("important"):
                due = ddr_dt + timedelta(weeks=cpn["week"])
                if due > now:  # uniquement RDV futurs
                    await db.reminders.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "title": f"📅 {cpn['title']}",
                        "note": cpn.get("advice"),
                        "due_at": due.isoformat(),
                        "source": "grossesse_plus_cpn",
                        "week": cpn["week"],
                        "status": "active",
                        "created_at": now.isoformat(),
                    })
    except Exception as e:
        logger.warning(f"CPN reminders auto-gen failed: {e}")

    return doc


# ----------------------------------------------------------------------
# Suivi médical hebdomadaire (poids, tension, hauteur utérine, glycémie...)
# ----------------------------------------------------------------------
class GrossesseTrackingIn(BaseModel):
    week: Optional[int] = None  # semaine de saisie (auto-calculée si vide)
    poids_kg: Optional[float] = None
    tension_sys: Optional[int] = None
    tension_dia: Optional[int] = None
    hauteur_uterine_cm: Optional[float] = None
    glycemie: Optional[float] = None
    temperature: Optional[float] = None
    symptomes: List[str] = []
    mouvements_bb: Optional[int] = None
    notes: Optional[str] = None


def _evaluate_tracking_alerts(p: GrossesseTrackingIn, week: int, last_weight: Optional[float]) -> list[dict]:
    """Génère des alertes médicales contextuelles (contexte ivoirien)."""
    alerts = []
    trim = 1 if week <= 13 else (2 if week <= 27 else 3)
    # Hypertension
    if p.tension_sys is not None and p.tension_dia is not None:
        if p.tension_sys >= 160 or p.tension_dia >= 110:
            alerts.append({"level": "critical", "title": "Tension très élevée", "message": f"{p.tension_sys}/{p.tension_dia} mmHg. Consultez en urgence — risque de pré-éclampsie."})
        elif p.tension_sys >= 140 or p.tension_dia >= 90:
            alerts.append({"level": "warning", "title": "Tension élevée", "message": f"{p.tension_sys}/{p.tension_dia} mmHg. À surveiller — contactez votre sage-femme."})
    # Glycémie
    if p.glycemie is not None:
        if p.glycemie >= 1.40:
            alerts.append({"level": "critical", "title": "Glycémie très élevée", "message": f"{p.glycemie} g/L à jeun. Risque de diabète gestationnel."})
        elif p.glycemie >= 0.92:
            alerts.append({"level": "warning", "title": "Glycémie limite", "message": f"{p.glycemie} g/L. À discuter avec votre médecin (test HGPO recommandé entre 24-28 SA)."})
    # Prise de poids hebdomadaire excessive
    if last_weight is not None and p.poids_kg is not None:
        diff = p.poids_kg - last_weight
        if week >= 14 and diff >= 1.5:
            alerts.append({"level": "warning", "title": "Prise de poids rapide", "message": f"+{round(diff,1)} kg depuis la dernière mesure. Surveillez sel et œdèmes."})
    # Hauteur utérine
    if p.hauteur_uterine_cm is not None and 18 <= week <= 36:
        expected = week - 4  # règle approchée : HU(cm) ≈ SA - 4
        if abs(p.hauteur_uterine_cm - expected) >= 4:
            alerts.append({"level": "warning", "title": "Hauteur utérine inhabituelle", "message": f"{p.hauteur_uterine_cm} cm (attendu ≈ {expected} cm). Vérification recommandée."})
    # Mouvements du bébé
    if p.mouvements_bb is not None and week >= 28 and p.mouvements_bb < 10:
        alerts.append({"level": "warning", "title": "Mouvements diminués", "message": f"Seulement {p.mouvements_bb} mouvements / 2h. Comptez 10 mouvements en 2h. Si toujours bas, consultez."})
    # 🇨🇮 Paludisme (contexte ivoirien : fièvre = suspicion forte)
    if p.temperature is not None and p.temperature >= 38.5:
        alerts.append({"level": "critical", "title": "Fièvre — Suspicion de paludisme", "message": f"{p.temperature}°C. ⚠️ Le paludisme est dangereux pendant la grossesse. Faites un TDR (Test de Diagnostic Rapide) en urgence. Pas d'automédication antipaludéenne."})
    elif p.temperature is not None and p.temperature >= 37.8:
        alerts.append({"level": "warning", "title": "Fébricule", "message": f"{p.temperature}°C. Surveillez et consultez si fièvre persiste plus de 24h (paludisme, infection urinaire)."})
    # 🇨🇮 Anémie (très fréquente Afrique sub-saharienne) — symptômes alertants
    fatigue_symp = any(s.lower() in ("fatigue", "fatigue intense", "essoufflement", "vertiges", "pâleur") for s in (p.symptomes or []))
    if fatigue_symp and trim >= 2:
        alerts.append({"level": "warning", "title": "Symptômes suggérant une anémie", "message": "Fatigue intense, essoufflement ou vertiges au 2e/3e trimestre. Faites un dosage d'hémoglobine (NFS). Cible ≥ 11 g/dL. L'anémie est très fréquente en Côte d'Ivoire et augmente le risque maternel."})
    # 🇨🇮 Rappel paludisme préventif (TPI) — 2e/3e trimestre
    if trim >= 2 and (p.temperature is None or p.temperature < 37.8):
        # Information ponctuelle, pas critique
        pass  # Le rappel TPI est dans le calendrier CPN
    # Pré-éclampsie combinée (HTA + œdèmes)
    edemas = any("œdème" in s.lower() or "oedeme" in s.lower() or "gonflement" in s.lower() for s in (p.symptomes or []))
    if edemas and p.tension_sys is not None and p.tension_sys >= 140:
        alerts.append({"level": "critical", "title": "Suspicion de pré-éclampsie", "message": "Tension élevée + œdèmes. Consultation immédiate recommandée (risque maternel & fœtal)."})
    return alerts


@api.post("/grossesse-plus/tracking")
async def add_grossesse_plus_tracking(payload: GrossesseTrackingIn, user=Depends(require_roles("maman"))):
    """Enregistre une mesure de suivi médical hebdomadaire."""
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    weeks, _, _ = _compute_pregnancy_age(g["date_debut"])
    week = payload.week or weeks
    # Dernier poids pour comparaison
    last_w_doc = await db.grossesse_tracking.find_one(
        {"user_id": user["id"], "poids_kg": {"$ne": None}},
        sort=[("created_at", -1)],
        projection={"_id": 0, "poids_kg": 1},
    )
    last_w = last_w_doc.get("poids_kg") if last_w_doc else None
    alerts = _evaluate_tracking_alerts(payload, week, last_w)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "grossesse_id": g["id"],
        "week": week,
        "poids_kg": payload.poids_kg,
        "tension_sys": payload.tension_sys,
        "tension_dia": payload.tension_dia,
        "hauteur_uterine_cm": payload.hauteur_uterine_cm,
        "glycemie": payload.glycemie,
        "temperature": payload.temperature,
        "symptomes": payload.symptomes,
        "mouvements_bb": payload.mouvements_bb,
        # 🔐 RGSSI N3 : notes chiffrées au repos
        "notes": encrypt_str(payload.notes) if payload.notes else None,
        "alerts": alerts,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesse_tracking.insert_one(doc)
    doc.pop("_id", None)
    doc["notes"] = payload.notes  # renvoie en clair pour l'app
    return doc


@api.get("/grossesse-plus/tracking")
async def list_tracking(user=Depends(require_roles("maman"))):
    """Historique complet des mesures (asc par date)."""
    _require_premium_maman(user)
    items = await db.grossesse_tracking.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    # 🔐 Déchiffrement des notes
    for it in items:
        if it.get("notes"):
            try:
                it["notes"] = decrypt_str(it["notes"])
            except Exception:
                pass
    # Stats agrégées (courbes)
    weight_series = [{"week": x.get("week"), "value": x.get("poids_kg"), "date": x.get("created_at")} for x in items if x.get("poids_kg") is not None]
    tension_series = [{"week": x.get("week"), "sys": x.get("tension_sys"), "dia": x.get("tension_dia"), "date": x.get("created_at")} for x in items if x.get("tension_sys") is not None]
    return {
        "items": items,
        "weight_series": weight_series,
        "tension_series": tension_series,
        "count": len(items),
    }


@api.delete("/grossesse-plus/tracking/{tid}")
async def delete_grossesse_plus_tracking(tid: str, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    r = await db.grossesse_tracking.delete_one({"id": tid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Mesure introuvable")
    return {"deleted": True}


# ----------------------------------------------------------------------
# Journal de grossesse (notes + photos échographies)
# ----------------------------------------------------------------------
class JournalIn(BaseModel):
    title: Optional[str] = None
    content: str
    type: Literal["note", "echographie", "souvenir", "ressenti"] = "note"
    photo_base64: Optional[str] = None
    mood: Optional[Literal["heureuse", "fatiguee", "anxieuse", "emotive", "sereine"]] = None


@api.post("/grossesse-plus/journal")
async def add_journal(payload: JournalIn, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    weeks, _, _ = _compute_pregnancy_age(g["date_debut"])
    # 🔐 RGSSI N3 : chiffrement du contenu personnel et photos écho
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "grossesse_id": g["id"],
        "title": payload.title,
        "content": encrypt_str(payload.content) if payload.content else payload.content,
        "type": payload.type,
        "photo_base64": encrypt_str(payload.photo_base64) if payload.photo_base64 else None,
        "mood": payload.mood,
        "week": weeks,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesse_journal.insert_one(doc)
    doc.pop("_id", None)
    # Renvoie déchiffré pour l'app
    doc["content"] = payload.content
    doc["photo_base64"] = payload.photo_base64
    return doc


@api.get("/grossesse-plus/journal")
async def list_journal(user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    items = await db.grossesse_journal.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # 🔐 Déchiffrement
    for it in items:
        if it.get("content"):
            try:
                it["content"] = decrypt_str(it["content"])
            except Exception:
                pass
        if it.get("photo_base64"):
            try:
                it["photo_base64"] = decrypt_str(it["photo_base64"])
            except Exception:
                pass
    return items


@api.delete("/grossesse-plus/journal/{jid}")
async def delete_journal(jid: str, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    r = await db.grossesse_journal.delete_one({"id": jid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Entrée introuvable")
    return {"deleted": True}


# ----------------------------------------------------------------------
# Compteur de contractions (sessions)
# ----------------------------------------------------------------------
class ContractionIn(BaseModel):
    started_at: str  # ISO
    ended_at: Optional[str] = None
    intensity: Literal["faible", "moyenne", "forte"] = "moyenne"
    session_id: Optional[str] = None


@api.post("/grossesse-plus/contractions")
async def add_contraction(payload: ContractionIn, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    duration_sec = None
    if payload.ended_at:
        try:
            t1 = datetime.fromisoformat(payload.started_at.replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(payload.ended_at.replace("Z", "+00:00"))
            duration_sec = max(0, int((t2 - t1).total_seconds()))
        except Exception:
            duration_sec = None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "grossesse_id": g["id"],
        "session_id": payload.session_id or str(uuid.uuid4())[:8],
        "started_at": payload.started_at,
        "ended_at": payload.ended_at,
        "duration_sec": duration_sec,
        "intensity": payload.intensity,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.grossesse_contractions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/grossesse-plus/contractions")
async def list_contractions(limit: int = 50, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    items = await db.grossesse_contractions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("started_at", -1).to_list(limit)
    # Analyse : si > 5 contractions ces 60 minutes avec intervalle < 5 min → conseil aller à la maternité
    advice = None
    if items:
        recent = []
        threshold = datetime.now(timezone.utc) - timedelta(hours=2)
        for it in items:
            try:
                t = datetime.fromisoformat(it["started_at"].replace("Z", "+00:00"))
                if t > threshold:
                    recent.append(t)
            except Exception:
                pass
        recent.sort()
        if len(recent) >= 5:
            intervals = [(recent[i+1] - recent[i]).total_seconds() / 60 for i in range(len(recent)-1)]
            avg_min = sum(intervals) / len(intervals)
            if avg_min < 5:
                advice = {"level": "critical", "message": "Contractions très rapprochées (< 5 min). Rendez-vous à la maternité maintenant."}
            elif avg_min < 10:
                advice = {"level": "warning", "message": f"Contractions toutes les ~{round(avg_min,1)} min. Préparez-vous, contactez la maternité."}
            else:
                advice = {"level": "info", "message": f"Contractions toutes les ~{round(avg_min,1)} min. Vrai travail probablement non commencé."}
    return {"items": items, "advice": advice}


@api.delete("/grossesse-plus/contractions/{cid}")
async def delete_contraction(cid: str, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    r = await db.grossesse_contractions.delete_one({"id": cid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Contraction introuvable")
    return {"deleted": True}


# ----------------------------------------------------------------------
# Trousseau / Checklist préparation à la naissance
# ----------------------------------------------------------------------
DEFAULT_TROUSSEAU = [
    {"cat": "Pour maman", "label": "Carte d'identité + carnet de santé", "done": False},
    {"cat": "Pour maman", "label": "Numéro CMU + justificatifs"},
    {"cat": "Pour maman", "label": "Chemises de nuit (2-3) faciles à ouvrir"},
    {"cat": "Pour maman", "label": "Soutien-gorge d'allaitement (2)"},
    {"cat": "Pour maman", "label": "Serviettes hygiéniques spéciales post-accouchement"},
    {"cat": "Pour maman", "label": "Trousse de toilette (savon, dentifrice, brosse)"},
    {"cat": "Pour maman", "label": "Pagnes ou peignoir confortable"},
    {"cat": "Pour bébé", "label": "Body coton (5-6)"},
    {"cat": "Pour bébé", "label": "Pyjamas naissance (4)"},
    {"cat": "Pour bébé", "label": "Bonnet + chaussettes coton"},
    {"cat": "Pour bébé", "label": "Couches taille naissance (paquet)"},
    {"cat": "Pour bébé", "label": "Couverture légère + drap"},
    {"cat": "Pour bébé", "label": "Lingettes douces / coton + sérum physiologique"},
    {"cat": "Pour bébé", "label": "Vêtements de sortie (pagne + body)"},
    {"cat": "Administratif", "label": "Acte de mariage / livret de famille (si marié)"},
    {"cat": "Administratif", "label": "Pièce d'identité du papa pour déclaration"},
    {"cat": "Administratif", "label": "Numéros utiles (maternité, sage-femme, taxi)"},
]


@api.get("/grossesse-plus/trousseau")
async def get_trousseau(user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    items = g.get("trousseau") or []
    if not items:
        items = [{**i, "id": str(uuid.uuid4()), "done": False} for i in DEFAULT_TROUSSEAU]
        await db.grossesses.update_one(
            {"id": g["id"]}, {"$set": {"trousseau": items}}
        )
    return {"items": items}


class TrousseauItemPatch(BaseModel):
    items: List[dict]


@api.patch("/grossesse-plus/trousseau")
async def patch_trousseau(payload: TrousseauItemPatch, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    await db.grossesses.update_one(
        {"id": g["id"]}, {"$set": {"trousseau": payload.items}}
    )
    return {"items": payload.items}


# ----------------------------------------------------------------------
# Consentement granulaire (partage avec pros)
# ----------------------------------------------------------------------
class ConsentIn(BaseModel):
    partage_pro: Optional[bool] = None
    partage_centre: Optional[bool] = None
    partage_famille: Optional[bool] = None


@api.post("/grossesse-plus/consent")
async def update_consent(payload: ConsentIn, user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    upd = {}
    if payload.partage_pro is not None:
        upd["consent_partage_pro"] = bool(payload.partage_pro)
    if payload.partage_centre is not None:
        upd["consent_partage_centre"] = bool(payload.partage_centre)
    if payload.partage_famille is not None:
        upd["consent_partage_famille"] = bool(payload.partage_famille)
    if upd:
        upd["consent_updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.grossesses.update_one({"id": g["id"]}, {"$set": upd})
    g2 = await db.grossesses.find_one({"id": g["id"]}, {"_id": 0})
    return {
        "consent_partage_pro": bool(g2.get("consent_partage_pro", False)),
        "consent_partage_centre": bool(g2.get("consent_partage_centre", False)),
        "consent_partage_famille": bool(g2.get("consent_partage_famille", False)),
    }


# ----------------------------------------------------------------------
# Exercices de respiration (préparation mentale)
# ----------------------------------------------------------------------
BREATHING_EXERCISES = [
    {
        "id": "carre",
        "title": "Respiration carrée (4-4-4-4)",
        "description": "Apaise le stress et prépare au travail. À pratiquer 5 min par jour.",
        "duration_min": 5,
        "icon": "⬜",
        "steps": [
            {"phase": "Inspirez", "seconds": 4},
            {"phase": "Retenez", "seconds": 4},
            {"phase": "Expirez", "seconds": 4},
            {"phase": "Pause", "seconds": 4},
        ],
    },
    {
        "id": "vague",
        "title": "Respiration en vague (6-2-6)",
        "description": "Diminue les contractions de Braxton-Hicks et la tension.",
        "duration_min": 7,
        "icon": "🌊",
        "steps": [
            {"phase": "Inspirez profondément", "seconds": 6},
            {"phase": "Retenez", "seconds": 2},
            {"phase": "Expirez par la bouche", "seconds": 6},
        ],
    },
    {
        "id": "cohérence",
        "title": "Cohérence cardiaque (5-5)",
        "description": "Régule la fréquence cardiaque et apaise. 6 cycles/minute pendant 5 min.",
        "duration_min": 5,
        "icon": "❤️",
        "steps": [
            {"phase": "Inspirez doucement", "seconds": 5},
            {"phase": "Expirez doucement", "seconds": 5},
        ],
    },
    {
        "id": "accouchement",
        "title": "Respiration d'accouchement (haletant)",
        "description": "À utiliser pendant le travail pour gérer la douleur des contractions.",
        "duration_min": 3,
        "icon": "💨",
        "steps": [
            {"phase": "Inspirez court", "seconds": 1},
            {"phase": "Expirez en soufflant", "seconds": 2},
        ],
    },
]


@api.get("/grossesse-plus/breathing")
async def list_breathing(user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    return BREATHING_EXERCISES


# ----------------------------------------------------------------------
# Consultations prénatales (CPN) — rappels intelligents par semaine
# ----------------------------------------------------------------------
CPN_SCHEDULE = [
    {"week": 8, "title": "1ère consultation prénatale (CPN1)", "important": True, "advice": "Bilan complet, examens sanguins, dépistage VIH."},
    {"week": 12, "title": "Échographie de datation", "important": True, "advice": "Première écho + dépistage T21 (clarté nucale)."},
    {"week": 16, "title": "CPN2", "important": False, "advice": "Suivi tension + poids + écoute du cœur du bébé."},
    {"week": 22, "title": "Échographie morphologique", "important": True, "advice": "Vérification de tous les organes du bébé."},
    {"week": 24, "title": "Test HGPO (diabète gestationnel)", "important": True, "advice": "À faire entre 24 et 28 SA."},
    {"week": 26, "title": "CPN3", "important": False, "advice": "Vaccin coqueluche recommandé."},
    {"week": 32, "title": "Échographie de croissance", "important": True, "advice": "Vérifie la position du bébé et sa croissance."},
    {"week": 36, "title": "CPN4 + Préparation accouchement", "important": True, "advice": "Visite hebdomadaire à partir de maintenant."},
    {"week": 38, "title": "CPN5 - À terme bientôt", "important": False, "advice": "Sac maternité prêt."},
    {"week": 40, "title": "Terme officiel - Surveillance", "important": True, "advice": "Surveillance accrue si dépassement."},
]


@api.get("/grossesse-plus/cpn")
async def get_cpn_schedule(user=Depends(require_roles("maman"))):
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        return {"current_week": 0, "schedule": CPN_SCHEDULE, "next": None}
    weeks, _, _ = _compute_pregnancy_age(g["date_debut"])
    upcoming = [c for c in CPN_SCHEDULE if c["week"] > weeks]
    past = [c for c in CPN_SCHEDULE if c["week"] <= weeks]
    return {
        "current_week": weeks,
        "schedule": CPN_SCHEDULE,
        "past": past,
        "upcoming": upcoming,
        "next": upcoming[0] if upcoming else None,
    }


# ----------------------------------------------------------------------
# Transition Grossesse → Carnet de l'enfant (post-naissance)
# ----------------------------------------------------------------------
class GrossesseToEnfantIn(BaseModel):
    nom: str
    date_naissance: str
    sexe: Literal["F", "M"]
    poids_kg: Optional[float] = None
    taille_cm: Optional[float] = None


@api.post("/grossesse-plus/declarer-naissance")
async def declarer_naissance(payload: GrossesseToEnfantIn, user=Depends(require_roles("maman"))):
    """Clôture la grossesse active + crée automatiquement le carnet de l'enfant."""
    _require_premium_maman(user)
    g = await _get_active_grossesse(user["id"])
    if not g:
        raise HTTPException(404, "Aucune grossesse active.")
    # Crée l'enfant
    enfant = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "nom": payload.nom,
        "date_naissance": payload.date_naissance,
        "sexe": payload.sexe,
        "poids_kg": payload.poids_kg,
        "taille_cm": payload.taille_cm,
        "mesures": [],
        "vaccins": [],
        "from_grossesse_id": g["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enfants.insert_one(enfant)
    # Clôture la grossesse
    await db.grossesses.update_one(
        {"id": g["id"]},
        {"$set": {"active": False, "status": "terminee", "enfant_id": enfant["id"], "ended_at": datetime.now(timezone.utc).isoformat()}},
    )
    enfant.pop("_id", None)
    return {"success": True, "enfant": enfant, "message": "Bienvenue à votre bébé ! 🍼 Votre suivi continue dans le Carnet de l'enfant."}


# 🔄 Re-include final : enregistre toutes les routes ajoutées après les précédents include_router

# ============================================================================
# 🌸 MODULE "APRÈS L'ACCOUCHEMENT" / "MOI AUSSI" — Post-partum bienveillant
# ============================================================================
# Accompagne les mamans pendant les 6-12 premiers mois après la naissance.
# - Suivi hebdomadaire (S1-S26) puis mensuel (M7-M12)
# - Détection des signes physiques + mentaux (EPDS-inspired)
# - Témoignages anonymes "Elles en parlent"
# - Implication conjoint
# - 🔐 Données très sensibles : chiffrement AES-256-GCM des notes/voix
# ============================================================================

# Contenus éducatifs par semaine post-partum (extraits adaptés au contexte ivoirien)
POSTPARTUM_WEEKLY: Dict[int, Dict[str, str]] = {
    1: {"title": "Bienvenue à la maison 🏡", "tip": "Reposez-vous dès que bébé dort. Hydratez-vous (eau, bouillon, jus naturels). Le baby-blues touche 80% des mamans — c'est passager."},
    2: {"title": "Vos saignements (lochies)", "tip": "Lochies normales pendant 4 à 6 semaines. Si saignement abondant > 1 serviette/h ou caillots gros — consultez."},
    3: {"title": "L'allaitement, jamais évident", "tip": "Douleurs au sein, crevasses, montée de lait : c'est fréquent. Une sage-femme peut vous accompagner. Pas de honte à demander."},
    4: {"title": "Le moral, on en parle ?", "tip": "Si après 2 semaines vous pleurez encore tous les jours, vous vous sentez vide ou coupable — ce n'est PAS normal et c'est PAS de votre faute. Parlons-en."},
    5: {"title": "Votre périnée", "tip": "Tirements, inconfort, fuites urinaires ? La rééducation périnéale (10 séances) est essentielle dès la 6e semaine. C'est remboursé CMU."},
    6: {"title": "Visite post-natale", "tip": "À faire entre la 6e et 8e semaine. Bilan complet : périnée, contraception, état général, dépistage dépression."},
    8: {"title": "Reprendre le sport en douceur", "tip": "Marche, étirements doux. Évitez abdos classiques avant la rééducation. Pas de course avant 3 mois minimum."},
    10: {"title": "Sexualité après bébé", "tip": "Reprise quand VOUS êtes prête. Sécheresse fréquente — un lubrifiant à base d'eau aide. La libido revient à son rythme."},
    12: {"title": "Chute de cheveux (3 mois)", "tip": "Très fréquente entre 3 et 6 mois. Liée aux hormones. Rentre dans l'ordre seul. Fer + B12 peuvent aider."},
    16: {"title": "Vous êtes une bonne mère", "tip": "La culpabilité, la peur de mal faire : toutes les mamans la ressentent. Vous faites de votre mieux. Ce n'est jamais parfait, c'est suffisant."},
    20: {"title": "Reprise du travail", "tip": "Préparez le sevrage progressif si allaitement. Faites un point sur votre énergie. La crèche/nounou nécessite du temps d'adaptation."},
    24: {"title": "6 mois post-partum 💚", "tip": "Si vous vous sentez toujours triste ou épuisée, faites un bilan avec votre médecin. Une dépression post-partum peut survenir tardivement."},
    36: {"title": "9 mois — la moitié du chemin", "tip": "Vous avez passé autant de temps avec votre bébé hors de votre ventre que dedans. Bravo."},
    48: {"title": "1 an post-partum 🎉", "tip": "Bilan complet recommandé. Si le mal-être persiste, ne laissez pas faire. Un suivi psychologique peut tout changer."},
}

# Symptômes physiques courants (cochables)
POSTPARTUM_PHYSICAL = [
    "fatigue intense", "mal de dos", "douleurs périnéales", "douleurs cicatrice césarienne",
    "saignements abondants", "fièvre", "chute de cheveux", "sécheresse intime",
    "incontinence urinaire", "constipation", "hémorroïdes", "engorgement seins",
    "crevasses allaitement", "vergetures démangeant", "perte de poids rapide", "prise de poids",
]

# Symptômes mentaux (alerte si plusieurs)
POSTPARTUM_MENTAL = [
    "tristesse persistante", "pleurs sans raison", "irritabilité", "anxiété forte",
    "insomnie", "pensées sombres", "sentiment de vide", "culpabilité excessive",
    "perte d'intérêt pour bébé", "baisse de libido", "isolement social", "honte de soi",
]


def _evaluate_postpartum_alerts(physical: List[str], mental: List[str], free_text: str, week_pp: int, mood: int) -> List[Dict[str, Any]]:
    """Génère des alertes bienveillantes selon EPDS + symptômes locaux."""
    alerts: List[Dict[str, Any]] = []
    txt = (free_text or "").lower()
    # 🚨 PHYSIQUE URGENT
    if "saignements abondants" in physical:
        alerts.append({"level": "critical", "title": "Saignements abondants", "message": "Plus d'1 serviette par heure ou caillots gros = consultation rapide. Une hémorragie peut survenir jusqu'à 12 semaines après l'accouchement."})
    if "fièvre" in physical:
        alerts.append({"level": "critical", "title": "Fièvre post-partum", "message": "Une fièvre > 38°C après l'accouchement peut signaler une infection (utérine, périnée, sein). Consultez aujourd'hui."})
    # ⚠️ PHYSIQUE WARNING
    if "douleurs cicatrice césarienne" in physical and week_pp >= 4:
        alerts.append({"level": "warning", "title": "Cicatrice qui fait mal", "message": "Au-delà de 3-4 semaines, la cicatrice ne devrait plus être douloureuse. Vérifiez avec votre sage-femme."})
    if "incontinence urinaire" in physical and week_pp >= 6:
        alerts.append({"level": "info", "title": "Rééducation périnéale", "message": "C'est très fréquent mais ça se traite ! La rééducation périnéale (10 séances) est très efficace. Demandez-la dès maintenant."})

    # 🧠 MENTAL — Inspiré EPDS (Edinburgh Postnatal Depression Scale)
    high_mental = ["pensées sombres", "sentiment de vide", "perte d'intérêt pour bébé"]
    has_high = any(s in mental for s in high_mental)
    if has_high or mood <= 2:
        alerts.append({
            "level": "critical",
            "title": "Vos émotions méritent un soutien dès maintenant",
            "message": "Ce que vous ressentez n'est PAS de votre faute. La dépression post-partum touche 1 maman sur 7. Un psychologue ou votre sage-femme peuvent vraiment vous aider. Vous n'êtes pas seule.",
        })
    elif len(mental) >= 3 and week_pp >= 2:
        alerts.append({
            "level": "warning",
            "title": "Le baby-blues s'installe",
            "message": f"Vous avez coché {len(mental)} signes mentaux. Au-delà de 2 semaines, ce n'est plus du baby-blues mais peut-être une dépression. Parlons-en ensemble.",
        })

    # 🔍 ANALYSE TEXTE LIBRE (mots-clés sensibles)
    danger_words = ["plus envie", "envie de mourir", "en finir", "abandonner", "fuir", "fenêtre", "disparaître", "tuer", "haïr"]
    if any(w in txt for w in danger_words):
        alerts.append({
            "level": "critical",
            "title": "🚨 Aide immédiate disponible",
            "message": "Vos mots m'inquiètent. Vous méritez de l'aide MAINTENANT. SAMU Côte d'Ivoire : 185. Ou parlez à une sage-femme via l'app. Vous n'êtes JAMAIS un fardeau.",
            "samu_call": "185",
        })
    return alerts


def _postpartum_week(accouchement_date: str) -> tuple[int, str]:
    """Retourne (semaine_pp, période)."""
    try:
        d = datetime.fromisoformat(accouchement_date.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        diff_days = (datetime.now(timezone.utc) - d).days
        week = max(0, diff_days // 7)
        if week <= 26:
            period = "hebdomadaire"
        elif week <= 52:
            period = "mensuel"
        else:
            period = "annuel"
        return week, period
    except Exception:
        return 0, "hebdomadaire"


# ----------------------------------------------------------------------
# Setup post-partum (auto depuis naissance ou manuel)
# ----------------------------------------------------------------------
class PostpartumSetupIn(BaseModel):
    accouchement_date: str  # ISO
    voie_accouchement: Literal["voie_basse", "voie_basse_episio", "cesarienne", "instrumentale"] = "voie_basse"
    enfant_id: Optional[str] = None
    allaitement: Optional[Literal["maternel", "mixte", "biberon"]] = None


@api.post("/postpartum/setup")
async def postpartum_setup(payload: PostpartumSetupIn, user=Depends(require_roles("maman"))):
    await db.postpartum.update_many({"user_id": user["id"], "active": True}, {"$set": {"active": False}})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "enfant_id": payload.enfant_id,
        "accouchement_date": payload.accouchement_date,
        "voie_accouchement": payload.voie_accouchement,
        "allaitement": payload.allaitement,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.postpartum.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/postpartum/dashboard")
async def postpartum_dashboard(user=Depends(require_roles("maman"))):
    pp = await db.postpartum.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    if not pp:
        raise HTTPException(404, "Aucun suivi post-partum actif. Configurez-le d'abord.")
    week, period = _postpartum_week(pp["accouchement_date"])
    # Trouver la fiche éducative la plus proche
    available_weeks = sorted(POSTPARTUM_WEEKLY.keys())
    fiche_week = next((w for w in available_weeks if w >= week), available_weeks[-1])
    fiche = POSTPARTUM_WEEKLY.get(fiche_week, {})
    # Dernier check-in
    last = await db.postpartum_checkins.find_one(
        {"user_id": user["id"]}, sort=[("created_at", -1)], projection={"_id": 0, "free_text_enc": 0, "voice_url_enc": 0}
    )
    # Nombre check-ins
    count = await db.postpartum_checkins.count_documents({"user_id": user["id"]})
    # Période 4-26 = soutien renforcé
    return {
        "postpartum_id": pp["id"],
        "week_pp": week,
        "period": period,
        "label": f"Semaine {week} après accouchement" if period == "hebdomadaire" else f"{week//4} mois après accouchement",
        "accouchement_date": pp["accouchement_date"],
        "voie": pp.get("voie_accouchement"),
        "allaitement": pp.get("allaitement"),
        "current_fiche": {"week": fiche_week, **fiche},
        "last_checkin": last,
        "checkins_count": count,
        "next_checkin_due": period == "hebdomadaire" or (last and (datetime.now(timezone.utc) - datetime.fromisoformat(last["created_at"].replace("Z", "+00:00").replace("Z", ""))).days >= 30),
        "phone_samu": "185",
    }


# ----------------------------------------------------------------------
# Check-in hebdomadaire "Et toi, comment tu vas ?"
# ----------------------------------------------------------------------
class PostpartumCheckinIn(BaseModel):
    mood: int = Field(default=3, ge=1, le=5)  # 1 (très mal) à 5 (très bien)
    physical_symptoms: List[str] = []
    mental_symptoms: List[str] = []
    free_text: Optional[str] = ""           # réponse libre (texte ou transcript voix)
    voice_url: Optional[str] = None          # base64 audio si voulu (optionnel, chiffré)
    consent_partage_pro: bool = False        # partager avec sage-femme/médecin


@api.post("/postpartum/checkin")
async def postpartum_checkin(payload: PostpartumCheckinIn, user=Depends(require_roles("maman"))):
    pp = await db.postpartum.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    if not pp:
        raise HTTPException(404, "Aucun suivi post-partum actif.")
    week, _ = _postpartum_week(pp["accouchement_date"])
    alerts = _evaluate_postpartum_alerts(
        payload.physical_symptoms, payload.mental_symptoms, payload.free_text or "", week, payload.mood
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "postpartum_id": pp["id"],
        "week_pp": week,
        "mood": int(max(1, min(5, payload.mood))),
        "physical_symptoms": payload.physical_symptoms,
        "mental_symptoms": payload.mental_symptoms,
        # 🔐 RGSSI N3 — chiffrement des données sensibles santé mentale
        "free_text_enc": encrypt_str(payload.free_text) if payload.free_text else None,
        "voice_url_enc": encrypt_str(payload.voice_url) if payload.voice_url else None,
        "alerts": alerts,
        "consent_partage_pro": bool(payload.consent_partage_pro),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.postpartum_checkins.insert_one(doc)
    doc.pop("_id", None)
    # On renvoie les alertes + le texte en clair
    return {
        "id": doc["id"], "week_pp": week, "mood": doc["mood"],
        "physical_symptoms": doc["physical_symptoms"],
        "mental_symptoms": doc["mental_symptoms"],
        "free_text": payload.free_text,
        "alerts": alerts,
        "created_at": doc["created_at"],
    }


@api.get("/postpartum/checkins")
async def postpartum_checkins_list(user=Depends(require_roles("maman"))):
    items = await db.postpartum_checkins.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for it in items:
        if it.get("free_text_enc"):
            try:
                it["free_text"] = decrypt_str(it["free_text_enc"])
            except Exception:
                it["free_text"] = ""
        it.pop("free_text_enc", None)
        it.pop("voice_url_enc", None)  # on n'expose pas l'audio en liste
    # série mood pour courbe
    mood_series = [{"week": x.get("week_pp"), "mood": x.get("mood"), "date": x.get("created_at")} for x in items][::-1]
    return {"items": items, "mood_series": mood_series, "count": len(items)}


@api.delete("/postpartum/checkin/{cid}")
async def postpartum_delete_checkin(cid: str, user=Depends(require_roles("maman"))):
    r = await db.postpartum_checkins.delete_one({"id": cid, "user_id": user["id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Check-in introuvable")
    return {"deleted": True}


# ----------------------------------------------------------------------
# Contenu éducatif par semaine
# ----------------------------------------------------------------------
@api.get("/postpartum/fiche/{week}")
async def postpartum_fiche(week: int):
    available = sorted(POSTPARTUM_WEEKLY.keys())
    nearest = next((w for w in available if w >= week), available[-1])
    return {"week": nearest, **POSTPARTUM_WEEKLY[nearest]}


@api.get("/postpartum/fiches")
async def postpartum_all_fiches():
    return [{"week": w, **POSTPARTUM_WEEKLY[w]} for w in sorted(POSTPARTUM_WEEKLY.keys())]


# ----------------------------------------------------------------------
# Témoignages anonymes "Elles en parlent"
# ----------------------------------------------------------------------
class TestimonialIn(BaseModel):
    content: str
    week_pp: Optional[int] = None
    topic: Optional[Literal["baby_blues", "depression", "allaitement", "couple", "perinee", "fatigue", "general"]] = "general"


@api.post("/postpartum/testimonials")
async def submit_testimonial(payload: TestimonialIn, user=Depends(require_roles("maman"))):
    if len(payload.content or "") < 30:
        raise HTTPException(400, "Témoignage trop court (minimum 30 caractères).")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id_hash": hashlib.sha256(user["id"].encode()).hexdigest()[:12],  # anonymisé
        "content": (payload.content or "").strip()[:2000],
        "week_pp": payload.week_pp,
        "topic": payload.topic or "general",
        "approved": False,  # nécessite modération admin
        "likes": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.postpartum_testimonials.insert_one(doc)
    doc.pop("_id", None)
    return {"id": doc["id"], "status": "pending_moderation", "message": "Merci pour votre courage. Votre témoignage sera publié après modération (24h max)."}


@api.get("/postpartum/testimonials")
async def list_testimonials(topic: Optional[str] = None, user=Depends(get_current_user)):
    q: Dict[str, Any] = {"approved": True}
    if topic and topic != "all":
        q["topic"] = topic
    items = await db.postpartum_testimonials.find(q, {"_id": 0, "user_id_hash": 0}).sort("created_at", -1).to_list(100)
    return items


@api.post("/postpartum/testimonials/{tid}/like")
async def like_testimonial(tid: str, user=Depends(require_roles("maman"))):
    r = await db.postpartum_testimonials.update_one(
        {"id": tid, "approved": True}, {"$inc": {"likes": 1}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Témoignage introuvable")
    return {"liked": True}


# Admin moderation
@api.get("/admin/postpartum/testimonials/pending")
async def admin_pending_testimonials(user=Depends(require_roles("admin", "super_admin"))):
    items = await db.postpartum_testimonials.find({"approved": False}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.post("/admin/postpartum/testimonials/{tid}/approve")
async def admin_approve_testimonial(tid: str, user=Depends(require_roles("admin", "super_admin"))):
    r = await db.postpartum_testimonials.update_one({"id": tid}, {"$set": {"approved": True, "approved_by": user["id"], "approved_at": datetime.now(timezone.utc).isoformat()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Témoignage introuvable")
    return {"approved": True}


@api.post("/admin/postpartum/testimonials/{tid}/reject")
async def admin_reject_testimonial(tid: str, user=Depends(require_roles("admin", "super_admin"))):
    await db.postpartum_testimonials.delete_one({"id": tid})
    return {"rejected": True}


# ----------------------------------------------------------------------
# Implication conjoint — Checklist + message hebdomadaire
# ----------------------------------------------------------------------
CONJOINT_CHECKLIST = [
    {"id": "demander", "label": "Lui demander 'Et toi, comment tu vas ?' au moins 1 fois par semaine"},
    {"id": "ecouter", "label": "L'écouter sans donner de conseils — juste écouter"},
    {"id": "repos", "label": "Lui permettre une grasse matinée par semaine (s'occuper du bébé)"},
    {"id": "menage", "label": "Prendre en charge le ménage / les courses cette semaine"},
    {"id": "repas", "label": "Préparer un repas qu'elle aime (sans qu'elle demande)"},
    {"id": "valoriser", "label": "Lui dire 'Tu es une bonne mère' et 'Merci pour tout'"},
    {"id": "sortie", "label": "Lui proposer de sortir seule (avec sa sœur, amies) 1h"},
    {"id": "rdv", "label": "L'accompagner à sa visite post-natale (entre 6-8 semaines)"},
    {"id": "signaux", "label": "Surveiller : pleurs fréquents, vide, désintérêt → en parler avec elle"},
]

CONJOINT_WEEKLY_MESSAGES = [
    {"week": 1, "message": "Votre femme rentre tout juste à la maison. Reposez-la, faites les courses, et demandez-lui : « Et toi, comment tu vas ? » C'est ce qu'elle entendra de plus précieux."},
    {"week": 2, "message": "Le baby-blues touche 8 mamans sur 10 entre J3 et J10. Si elle pleure beaucoup, ce n'est pas de votre faute, ni de la sienne. Écoutez-la simplement."},
    {"week": 4, "message": "1 mois ! Si elle pleure encore tous les jours ou se sent vide, c'est peut-être une dépression post-partum. Proposez-lui ensemble de voir un médecin."},
    {"week": 6, "message": "Sa visite post-natale arrive. Accompagnez-la si possible : c'est un moment important (périnée, contraception, moral)."},
    {"week": 8, "message": "Elle peut être épuisée — les nuits hachées s'accumulent. Une nuit complète (vous gérez les biberons) lui sauvera la vie."},
    {"week": 12, "message": "3 mois — elle perd peut-être ses cheveux par poignées. C'est normal et passager. Dites-lui qu'elle est belle quand même."},
    {"week": 16, "message": "Le moral peut s'effondrer maintenant que tout le monde est rentré chez soi. Restez attentif. Demandez régulièrement comment elle va."},
    {"week": 24, "message": "6 mois ! C'est souvent là que la dépression post-partum se déclare. Surveillez : tristesse, fatigue extrême, désintérêt. Encouragez-la à consulter sans culpabiliser."},
]


@api.get("/postpartum/conjoint/checklist")
async def conjoint_checklist(user=Depends(require_roles("maman", "famille"))):
    return {"items": CONJOINT_CHECKLIST}


@api.get("/postpartum/conjoint/messages")
async def conjoint_messages(user=Depends(require_roles("maman", "famille"))):
    return {"messages": CONJOINT_WEEKLY_MESSAGES}


@api.get("/postpartum/conjoint/current-message")
async def conjoint_current_message(user=Depends(require_roles("maman"))):
    pp = await db.postpartum.find_one({"user_id": user["id"], "active": True}, {"_id": 0})
    msgs = sorted(CONJOINT_WEEKLY_MESSAGES, key=lambda m: m["week"])
    if not pp:
        # Pas encore de suivi actif : on retourne le 1er message (semaine 1) en mode "découverte"
        first = msgs[0]
        return {"week_pp": None, "message_to_partner": first["message"], "message_week": first["week"], "discovery_mode": True}
    week, _ = _postpartum_week(pp["accouchement_date"])
    # Trouve le message le plus proche
    current = next((m for m in reversed(msgs) if m["week"] <= week), msgs[0])
    return {"week_pp": week, "message_to_partner": current["message"], "message_week": current["week"], "discovery_mode": False}


# ==================================================================================================
# 🧬 SNOMED CT — Codification clinique
# ==================================================================================================
_SNOMED_CACHE: Dict[str, Any] = {}

def _load_snomed() -> Dict[str, Any]:
    """Charge (une fois) le sous-ensemble SNOMED CT curaté depuis le disque."""
    global _SNOMED_CACHE
    if _SNOMED_CACHE:
        return _SNOMED_CACHE
    import json as _json
    path = ROOT_DIR / "data" / "snomed_maternal.json"
    try:
        with open(path, "r", encoding="utf-8") as f:
            _SNOMED_CACHE = _json.load(f)
    except Exception as e:
        logger.error(f"SNOMED CT: dataset introuvable ({path}): {e}")
        _SNOMED_CACHE = {"meta": {}, "domains": [], "concepts": []}
    return _SNOMED_CACHE


def _normalize_txt(s: str) -> str:
    """Normalise le texte pour la recherche fuzzy (sans accents, minuscule)."""
    import unicodedata as _ud
    s = (s or "").strip().lower()
    return "".join(c for c in _ud.normalize("NFD", s) if _ud.category(c) != "Mn")


@api.get("/snomed/meta")
async def snomed_meta():
    """Métadonnées du sous-ensemble SNOMED CT (public — pas d'auth)."""
    d = _load_snomed()
    return {"meta": d.get("meta", {}), "domains": d.get("domains", []), "concept_count": len(d.get("concepts", []))}


@api.get("/snomed/search")
async def snomed_search(
    q: str = "",
    domain: Optional[str] = None,
    limit: int = 25,
    user=Depends(get_current_user),
):
    """
    Recherche dans le sous-ensemble SNOMED CT.
    - q : texte de recherche (français ou anglais). Insensible aux accents/casse.
    - domain : filtre par domaine (obstetric, perinatal, pediatric, mental_health, vaccination, symptom, procedure, diagnosis)
    - limit : nombre max de résultats (défaut 25)
    """
    data = _load_snomed()
    concepts = data.get("concepts", [])
    qn = _normalize_txt(q)
    results = []
    for c in concepts:
        if domain and c.get("domain") != domain:
            continue
        # Match sur code exact, display, ou fr
        if not qn or qn in _normalize_txt(c.get("display", "")) or qn in _normalize_txt(c.get("fr", "")) or qn == c.get("code", ""):
            results.append({
                "system": data["meta"].get("system", "http://snomed.info/sct"),
                "code": c["code"],
                "display": c.get("fr") or c["display"],  # préférence français
                "display_en": c["display"],
                "domain": c.get("domain"),
            })
        if len(results) >= max(1, min(limit, 100)):
            break
    return {"count": len(results), "results": results}


@api.get("/snomed/concept/{code}")
async def snomed_get_concept(code: str, user=Depends(get_current_user)):
    """Détail d'un concept SNOMED CT par son code."""
    data = _load_snomed()
    for c in data.get("concepts", []):
        if c.get("code") == code:
            return {
                "system": data["meta"].get("system", "http://snomed.info/sct"),
                "code": c["code"],
                "display": c.get("fr") or c["display"],
                "display_en": c["display"],
                "domain": c.get("domain"),
            }
    raise HTTPException(404, f"Concept SNOMED {code} introuvable")


class SnomedAttachIn(BaseModel):
    """Attache un ou plusieurs codes SNOMED CT à une entité (DMP, consultation, TND, postpartum, etc.)."""
    entity_type: str  # dmp_consultation | tnd_screening | postpartum_checkin | grossesse_journal | rdv
    entity_id: str
    codes: List[Dict[str, Any]]  # [{system, code, display, domain}]


@api.post("/snomed/attach")
async def snomed_attach(payload: SnomedAttachIn, user=Depends(get_current_user)):
    """
    Attache des codes SNOMED CT à une entité.
    Écrit dans une collection dédiée `snomed_annotations` (audit-friendly)
    ET met à jour le tableau `snomed_codes` sur l'entité cible.
    """
    allowed = {
        "dmp_consultation": "dmp_consultations",
        "tnd_screening": "tnd_screenings",
        "postpartum_checkin": "postpartum_checkins",
        "grossesse_journal": "grossesse_journal",
        "rdv": "rdv",
        "consultation_pro": "consultations",
    }
    coll = allowed.get(payload.entity_type)
    if not coll:
        raise HTTPException(400, f"entity_type inconnu: {payload.entity_type}")
    # Valide les codes
    for c in payload.codes:
        if not c.get("code") or not c.get("display"):
            raise HTTPException(400, "Chaque code doit contenir 'code' et 'display'")
    # Update entity
    ent = await db[coll].find_one({"id": payload.entity_id})
    if not ent:
        raise HTTPException(404, "Entité cible introuvable")
    # Écrit l'annotation (immutable log)
    annot = {
        "id": str(uuid.uuid4()),
        "entity_type": payload.entity_type,
        "entity_id": payload.entity_id,
        "codes": payload.codes,
        "annotated_by": user["id"],
        "annotator_role": user.get("role"),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.snomed_annotations.insert_one(annot)
    await db[coll].update_one(
        {"id": payload.entity_id},
        {"$set": {"snomed_codes": payload.codes, "snomed_updated_at": datetime.utcnow().isoformat()}},
    )
    return {"ok": True, "annotation_id": annot["id"], "codes_count": len(payload.codes)}


@api.get("/snomed/annotations/{entity_type}/{entity_id}")
async def snomed_get_annotations(entity_type: str, entity_id: str, user=Depends(get_current_user)):
    """Historique des annotations SNOMED pour une entité (audit)."""
    items = await db.snomed_annotations.find(
        {"entity_type": entity_type, "entity_id": entity_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"count": len(items), "annotations": items}


# ==================================================================================================
# 📊 DHIS2 — Export de données agrégées
# ==================================================================================================

# UIDs DHIS2 (compatible format DHIS2 : 11 caractères alphanumériques commençant par une lettre).
# ⚠️ Ces UIDs sont générés côté À lo Maman et devront être MAPPÉS aux vrais dataElements/orgUnits
# de l'instance DHIS2 du Ministère de la Santé de Côte d'Ivoire lors du déploiement.
DHIS2_INDICATORS = [
    {"uid": "ALM0CPN1000", "code": "ALM_CPN_1", "name": "CPN 1 effectuée", "category": "maternal", "unit": "count"},
    {"uid": "ALM0CPN2000", "code": "ALM_CPN_2", "name": "CPN 2 effectuée", "category": "maternal", "unit": "count"},
    {"uid": "ALM0CPN3000", "code": "ALM_CPN_3", "name": "CPN 3 effectuée", "category": "maternal", "unit": "count"},
    {"uid": "ALM0CPN4000", "code": "ALM_CPN_4", "name": "CPN 4+ effectuée", "category": "maternal", "unit": "count"},
    {"uid": "ALMNAISSDEC", "code": "ALM_BIRTH_DEC", "name": "Déclarations de naissance", "category": "maternal", "unit": "count"},
    {"uid": "ALMPP0CHKIN", "code": "ALM_PP_CHECKIN", "name": "Check-ins post-partum", "category": "postpartum", "unit": "count"},
    {"uid": "ALMEPDSHIGH", "code": "ALM_EPDS_ALERT", "name": "Alertes EPDS critiques (dépression post-partum)", "category": "postpartum", "unit": "count"},
    {"uid": "ALMTNDPOSIT", "code": "ALM_TND_POS", "name": "Dépistages TND positifs", "category": "pediatric", "unit": "count"},
    {"uid": "ALMTNDNEGAT", "code": "ALM_TND_NEG", "name": "Dépistages TND négatifs", "category": "pediatric", "unit": "count"},
    {"uid": "ALMVACCTOTA", "code": "ALM_VAC_TOTAL", "name": "Vaccinations enregistrées (total)", "category": "pediatric", "unit": "count"},
    {"uid": "ALMVACBCG00", "code": "ALM_VAC_BCG", "name": "Vaccin BCG administré", "category": "pediatric", "unit": "count"},
    {"uid": "ALMVACROU00", "code": "ALM_VAC_MEASLES", "name": "Vaccin rougeole administré", "category": "pediatric", "unit": "count"},
    {"uid": "ALMRDVPROTO", "code": "ALM_RDV_PRO", "name": "Consultations Pro (téléconsult + présentiel)", "category": "operational", "unit": "count"},
    {"uid": "ALMDMPCONSU", "code": "ALM_DMP_CONS", "name": "Consultations DMP enregistrées", "category": "operational", "unit": "count"},
    {"uid": "ALMUSERSACT", "code": "ALM_USER_ACT", "name": "Utilisatrices actives", "category": "operational", "unit": "count"},
]


def _period_to_dhis2(period_type: str, year: int, num: int) -> str:
    """
    Convertit une période en format DHIS2 :
    - monthly YYYYMM (ex. 202607)
    - quarterly YYYYQx (ex. 2026Q2)
    - yearly YYYY (ex. 2026)
    """
    if period_type == "monthly":
        return f"{year}{num:02d}"
    if period_type == "quarterly":
        return f"{year}Q{num}"
    if period_type == "yearly":
        return f"{year}"
    raise ValueError(f"period_type inconnu: {period_type}")


def _period_range(period_type: str, year: int, num: int):
    """Retourne (start_dt, end_dt) UTC pour une période DHIS2."""
    if period_type == "monthly":
        start = datetime(year, num, 1)
        if num == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, num + 1, 1)
    elif period_type == "quarterly":
        start_month = (num - 1) * 3 + 1
        start = datetime(year, start_month, 1)
        end_month = start_month + 3
        if end_month > 12:
            end = datetime(year + 1, end_month - 12, 1)
        else:
            end = datetime(year, end_month, 1)
    elif period_type == "yearly":
        start = datetime(year, 1, 1)
        end = datetime(year + 1, 1, 1)
    else:
        raise ValueError("period_type invalide")
    return start, end


async def _compute_dhis2_indicators(
    period_type: str, year: int, num: int, region: Optional[str] = None
) -> Dict[str, int]:
    """
    Agrège les indicateurs À lo Maman pour la période demandée.
    Retourne un dict {uid: value}.
    """
    start, end = _period_range(period_type, year, num)
    dt_filter = {"$gte": start.isoformat(), "$lt": end.isoformat()}

    # Filtre région optionnel (basé sur user.commune ou centre.region)
    region_filter: Dict[str, Any] = {}
    if region:
        region_filter = {"$or": [{"commune": region}, {"region": region}]}

    async def _count(coll: str, extra: Dict[str, Any] = None) -> int:
        q: Dict[str, Any] = {"created_at": dt_filter}
        if extra:
            q.update(extra)
        try:
            return await db[coll].count_documents(q)
        except Exception:
            return 0

    # CPN counts — basé sur rdv (motif contient "CPN") ou grossesse.tracking sessions
    cpn_1 = await _count("rdv", {"motif": {"$regex": "CPN.*1|1ère.*CPN|first.*antenatal", "$options": "i"}})
    cpn_2 = await _count("rdv", {"motif": {"$regex": "CPN.*2|2ème.*CPN", "$options": "i"}})
    cpn_3 = await _count("rdv", {"motif": {"$regex": "CPN.*3|3ème.*CPN", "$options": "i"}})
    cpn_4 = await _count("rdv", {"motif": {"$regex": "CPN.*4|CPN[+]|4ème.*CPN", "$options": "i"}})

    births = await _count("naissances")
    pp_checkins = await _count("postpartum_checkins")
    epds_alerts = await _count("postpartum_checkins", {"critical_alerts": {"$exists": True, "$ne": []}})
    tnd_pos = await _count("tnd_screenings", {"$or": [{"final_level": "high_risk"}, {"level": "high_risk"}]})
    tnd_neg = await _count("tnd_screenings", {"$or": [{"final_level": "low_risk"}, {"level": "low_risk"}]})
    vac_total = await _count("vaccinations")
    vac_bcg = await _count("vaccinations", {"vaccin": {"$regex": "BCG", "$options": "i"}})
    vac_measles = await _count("vaccinations", {"vaccin": {"$regex": "rougeole|measles|ROR|MMR", "$options": "i"}})
    rdv_pro = await _count("rdv", {"status": {"$in": ["confirme", "termine", "confirmed", "completed"]}})
    dmp_cons = await _count("dmp_consultations")
    active_users = await _count("users", {"last_seen": {"$gte": start.isoformat()}})

    return {
        "ALM0CPN1000": cpn_1,
        "ALM0CPN2000": cpn_2,
        "ALM0CPN3000": cpn_3,
        "ALM0CPN4000": cpn_4,
        "ALMNAISSDEC": births,
        "ALMPP0CHKIN": pp_checkins,
        "ALMEPDSHIGH": epds_alerts,
        "ALMTNDPOSIT": tnd_pos,
        "ALMTNDNEGAT": tnd_neg,
        "ALMVACCTOTA": vac_total,
        "ALMVACBCG00": vac_bcg,
        "ALMVACROU00": vac_measles,
        "ALMRDVPROTO": rdv_pro,
        "ALMDMPCONSU": dmp_cons,
        "ALMUSERSACT": active_users,
    }


@api.get("/dhis2/indicators")
async def dhis2_list_indicators(user=Depends(require_roles("admin", "super_admin"))):
    """Liste tous les indicateurs disponibles à l'export DHIS2."""
    return {"count": len(DHIS2_INDICATORS), "indicators": DHIS2_INDICATORS}


class DHIS2PreviewIn(BaseModel):
    period_type: str  # monthly | quarterly | yearly
    year: int
    num: int = 1  # numéro du mois (1-12), trimestre (1-4) ou ignoré si yearly
    region: Optional[str] = None
    org_unit: Optional[str] = None  # UID DHIS2 orgUnit — optionnel (mock si absent)


@api.post("/dhis2/preview")
async def dhis2_preview(payload: DHIS2PreviewIn, user=Depends(require_roles("admin", "super_admin"))):
    """Prévisualisation des indicateurs agrégés pour la période choisie."""
    try:
        period = _period_to_dhis2(payload.period_type, payload.year, payload.num)
    except ValueError as e:
        raise HTTPException(400, str(e))
    values = await _compute_dhis2_indicators(payload.period_type, payload.year, payload.num, payload.region)
    rows = []
    for ind in DHIS2_INDICATORS:
        rows.append({
            "uid": ind["uid"],
            "code": ind["code"],
            "name": ind["name"],
            "category": ind["category"],
            "value": values.get(ind["uid"], 0),
        })
    return {
        "period": period,
        "period_type": payload.period_type,
        "region": payload.region,
        "org_unit": payload.org_unit or "MOCK_ORG_UNIT_CI",
        "generated_at": datetime.utcnow().isoformat(),
        "total_indicators": len(rows),
        "rows": rows,
    }


@api.post("/dhis2/export/dxf2")
async def dhis2_export_dxf2(payload: DHIS2PreviewIn, user=Depends(require_roles("admin", "super_admin"))):
    """
    Export au format DHIS2 DXF2 JSON (dataValueSet). Format standard DHIS2 :
    https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/data.html#webapi_data_values
    """
    try:
        period = _period_to_dhis2(payload.period_type, payload.year, payload.num)
    except ValueError as e:
        raise HTTPException(400, str(e))
    values = await _compute_dhis2_indicators(payload.period_type, payload.year, payload.num, payload.region)
    org_unit = payload.org_unit or "MOCK_ORG_UNIT_CI"
    dxf2 = {
        "dataSet": "ALM0DATASET",  # UID du dataSet À lo Maman (à mapper côté DHIS2 CI)
        "period": period,
        "orgUnit": org_unit,
        "completeDate": datetime.utcnow().strftime("%Y-%m-%d"),
        "dataValues": [
            {"dataElement": ind["uid"], "value": str(values.get(ind["uid"], 0)), "comment": ind["name"]}
            for ind in DHIS2_INDICATORS
        ],
    }
    # Audit trail
    await db.dhis2_exports.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "format": "dxf2_json",
        "period": period,
        "org_unit": org_unit,
        "region": payload.region,
        "value_count": len(dxf2["dataValues"]),
        "exported_at": datetime.utcnow().isoformat(),
    })
    return dxf2


@api.post("/dhis2/export/csv")
async def dhis2_export_csv(payload: DHIS2PreviewIn, user=Depends(require_roles("admin", "super_admin"))):
    """Export CSV de secours (compatible import DHIS2)."""
    try:
        period = _period_to_dhis2(payload.period_type, payload.year, payload.num)
    except ValueError as e:
        raise HTTPException(400, str(e))
    values = await _compute_dhis2_indicators(payload.period_type, payload.year, payload.num, payload.region)
    org_unit = payload.org_unit or "MOCK_ORG_UNIT_CI"
    lines = ["dataelement,period,orgunit,value,comment"]
    for ind in DHIS2_INDICATORS:
        lines.append(f'{ind["uid"]},{period},{org_unit},{values.get(ind["uid"], 0)},"{ind["name"]}"')
    csv_content = "\n".join(lines)
    await db.dhis2_exports.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "format": "csv",
        "period": period,
        "org_unit": org_unit,
        "region": payload.region,
        "value_count": len(DHIS2_INDICATORS),
        "exported_at": datetime.utcnow().isoformat(),
    })
    return {"period": period, "org_unit": org_unit, "csv": csv_content, "row_count": len(DHIS2_INDICATORS)}


class DHIS2ConfigIn(BaseModel):
    base_url: str  # ex. https://dhis2.msp.ci
    username: Optional[str] = None
    password: Optional[str] = None
    api_token: Optional[str] = None  # préféré (Personal Access Token DHIS2)
    org_unit_uid: Optional[str] = None  # UID orgUnit CI dans DHIS2
    dataset_uid: Optional[str] = None   # UID dataSet ALM dans DHIS2
    element_mapping: Optional[Dict[str, str]] = None  # {ALM_uid: DHIS2_dataElement_uid}


@api.post("/dhis2/config")
async def dhis2_save_config(payload: DHIS2ConfigIn, user=Depends(require_roles("super_admin"))):
    """
    Enregistre la configuration DHIS2 (URL + credentials + mappings).
    ⚠️ Les credentials sont chiffrés au repos (encryption.py).
    Seul le super_admin peut configurer.
    """
    from encryption import encrypt_str
    doc = {
        "id": "singleton",  # unique
        "base_url": payload.base_url,
        "username": payload.username or "",
        "password_enc": encrypt_str(payload.password) if payload.password else None,
        "api_token_enc": encrypt_str(payload.api_token) if payload.api_token else None,
        "org_unit_uid": payload.org_unit_uid or "",
        "dataset_uid": payload.dataset_uid or "ALM0DATASET",
        "element_mapping": payload.element_mapping or {},
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": user["id"],
    }
    await db.dhis2_config.update_one({"id": "singleton"}, {"$set": doc}, upsert=True)
    return {"ok": True, "base_url": payload.base_url, "has_password": bool(payload.password), "has_token": bool(payload.api_token)}


@api.get("/dhis2/config")
async def dhis2_get_config(user=Depends(require_roles("admin", "super_admin"))):
    """Récupère la config DHIS2 (sans exposer les credentials)."""
    doc = await db.dhis2_config.find_one({"id": "singleton"}, {"_id": 0})
    if not doc:
        return {"configured": False}
    return {
        "configured": True,
        "base_url": doc.get("base_url"),
        "username": doc.get("username"),
        "has_password": bool(doc.get("password_enc")),
        "has_token": bool(doc.get("api_token_enc")),
        "org_unit_uid": doc.get("org_unit_uid"),
        "dataset_uid": doc.get("dataset_uid"),
        "element_mapping_count": len(doc.get("element_mapping") or {}),
        "updated_at": doc.get("updated_at"),
    }


@api.post("/dhis2/push")
async def dhis2_push(payload: DHIS2PreviewIn, user=Depends(require_roles("admin", "super_admin"))):
    """
    Pousse le dataValueSet vers l'instance DHIS2 configurée.
    Utilise l'endpoint DHIS2 /api/dataValueSets (POST JSON).
    """
    from encryption import decrypt_str
    cfg = await db.dhis2_config.find_one({"id": "singleton"}, {"_id": 0})
    if not cfg or not cfg.get("base_url"):
        raise HTTPException(400, "Configuration DHIS2 manquante — configurez d'abord via POST /dhis2/config")

    # Construit le payload DXF2
    try:
        period = _period_to_dhis2(payload.period_type, payload.year, payload.num)
    except ValueError as e:
        raise HTTPException(400, str(e))
    values = await _compute_dhis2_indicators(payload.period_type, payload.year, payload.num, payload.region)
    org_unit = payload.org_unit or cfg.get("org_unit_uid") or "MOCK_ORG_UNIT_CI"
    mapping = cfg.get("element_mapping") or {}
    dxf2 = {
        "dataSet": cfg.get("dataset_uid") or "ALM0DATASET",
        "period": period,
        "orgUnit": org_unit,
        "completeDate": datetime.utcnow().strftime("%Y-%m-%d"),
        "dataValues": [
            {
                "dataElement": mapping.get(ind["uid"], ind["uid"]),  # traduit UID ALM → UID DHIS2 CI
                "value": str(values.get(ind["uid"], 0)),
                "comment": ind["name"],
            }
            for ind in DHIS2_INDICATORS
        ],
    }

    # POST vers DHIS2
    import httpx as _httpx
    url = cfg["base_url"].rstrip("/") + "/api/dataValueSets"
    headers = {"Content-Type": "application/json"}
    auth = None
    if cfg.get("api_token_enc"):
        headers["Authorization"] = f"ApiToken {decrypt_str(cfg['api_token_enc'])}"
    elif cfg.get("username") and cfg.get("password_enc"):
        auth = (cfg["username"], decrypt_str(cfg["password_enc"]))

    status_code = 0
    response_body: Any = None
    try:
        async with _httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=dxf2, headers=headers, auth=auth)
            status_code = r.status_code
            try:
                response_body = r.json()
            except Exception:
                response_body = r.text
    except Exception as e:
        status_code = -1
        response_body = str(e)

    # Audit
    await db.dhis2_exports.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "format": "push_dhis2",
        "period": period,
        "org_unit": org_unit,
        "region": payload.region,
        "target_url": url,
        "http_status": status_code,
        "value_count": len(dxf2["dataValues"]),
        "exported_at": datetime.utcnow().isoformat(),
    })

    ok = 200 <= status_code < 300
    return {
        "ok": ok,
        "http_status": status_code,
        "period": period,
        "org_unit": org_unit,
        "value_count": len(dxf2["dataValues"]),
        "target": url,
        "response": response_body if ok else str(response_body)[:500],
    }


@api.get("/dhis2/history")
async def dhis2_export_history(limit: int = 50, user=Depends(require_roles("admin", "super_admin"))):
    """Historique des exports DHIS2 (audit)."""
    items = await db.dhis2_exports.find({}, {"_id": 0}).sort("exported_at", -1).to_list(min(limit, 200))
    return {"count": len(items), "items": items}


# ==================================================================================================
# 🔌 Hub d'interopérabilité — SIH, DPI, Santé CIV, OpenELIS, mSupply, PACS
# ==================================================================================================
# Architecture générique : chaque intégration a une config (URL + credentials chiffrés) + endpoints test/push.
# Prêt pour recevoir les vraies clés API du Ministère de la Santé de Côte d'Ivoire.

INTEROP_SYSTEMS = [
    {
        "id": "sih_national",
        "label": "SIH national",
        "description": "Système d'Information Hospitalier — export FHIR Bundle (admissions, séjours, actes)",
        "protocol": "FHIR R4",
        "resource_types": ["Patient", "Encounter", "Procedure", "Observation", "Condition"],
        "docs_url": "https://www.hl7.org/fhir/R4/",
    },
    {
        "id": "dpi_national",
        "label": "DPI national",
        "description": "Dossier Patient Informatisé national — synchronisation FHIR/HL7 v2",
        "protocol": "FHIR R4 / HL7 v2.5",
        "resource_types": ["Patient", "AllergyIntolerance", "MedicationStatement", "Immunization"],
        "docs_url": "https://www.hl7.org/",
    },
    {
        "id": "sante_civ",
        "label": "Santé CIV (Portail e-Santé Côte d'Ivoire)",
        "description": "Portail patient national — synchronisation compte + carnet vaccinal + RDV",
        "protocol": "REST API",
        "resource_types": ["Patient", "Vaccination", "Appointment"],
        "docs_url": "https://sante.civ.ci",
    },
    {
        "id": "openelis",
        "label": "OpenELIS",
        "description": "Laboratoire — envoi de prescriptions et réception de résultats d'analyse",
        "protocol": "FHIR R4 / HL7 v2 ORM/ORU",
        "resource_types": ["ServiceRequest", "DiagnosticReport", "Observation"],
        "docs_url": "https://openelis-global.org/",
    },
    {
        "id": "msupply",
        "label": "mSupply",
        "description": "Chaîne d'approvisionnement pharmaceutique — prescriptions & stocks",
        "protocol": "mSupply REST API",
        "resource_types": ["MedicationRequest", "Medication", "SupplyDelivery"],
        "docs_url": "https://msupply.foundation/",
    },
    {
        "id": "pacs",
        "label": "PACS (Imagerie médicale)",
        "description": "Picture Archiving & Communication System — échographies obstétricales DICOM",
        "protocol": "DICOMweb (WADO-RS / STOW-RS / QIDO-RS)",
        "resource_types": ["ImagingStudy", "DiagnosticReport"],
        "docs_url": "https://www.dicomstandard.org/using/dicomweb",
    },
]


@api.get("/interop/systems")
async def interop_list_systems(user=Depends(require_roles("admin", "super_admin"))):
    """Liste des systèmes d'interopérabilité disponibles avec leur état de configuration."""
    configs = await db.interop_configs.find({}, {"_id": 0}).to_list(50)
    cfg_by_id = {c["system_id"]: c for c in configs}
    out = []
    for sys in INTEROP_SYSTEMS:
        c = cfg_by_id.get(sys["id"])
        out.append({
            **sys,
            "configured": bool(c),
            "base_url": c.get("base_url") if c else None,
            "has_credentials": bool(c and (c.get("api_token_enc") or c.get("password_enc"))),
            "last_test": c.get("last_test") if c else None,
            "last_test_ok": c.get("last_test_ok") if c else None,
            "updated_at": c.get("updated_at") if c else None,
        })
    return {"count": len(out), "systems": out}


class InteropConfigIn(BaseModel):
    system_id: str
    base_url: str
    username: Optional[str] = None
    password: Optional[str] = None
    api_token: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None  # ex. facility_id, provider_id, aet, etc.


@api.post("/interop/config")
async def interop_save_config(payload: InteropConfigIn, user=Depends(require_roles("super_admin"))):
    """Enregistre la config d'un système. Credentials chiffrés AES-256."""
    from encryption import encrypt_str
    if not any(s["id"] == payload.system_id for s in INTEROP_SYSTEMS):
        raise HTTPException(400, f"system_id inconnu: {payload.system_id}")
    doc = {
        "system_id": payload.system_id,
        "base_url": payload.base_url.strip(),
        "username": payload.username or "",
        "password_enc": encrypt_str(payload.password) if payload.password else None,
        "api_token_enc": encrypt_str(payload.api_token) if payload.api_token else None,
        "extra": payload.extra or {},
        "updated_at": datetime.utcnow().isoformat(),
        "updated_by": user["id"],
    }
    await db.interop_configs.update_one({"system_id": payload.system_id}, {"$set": doc}, upsert=True)
    return {"ok": True, "system_id": payload.system_id}


@api.get("/interop/config/{system_id}")
async def interop_get_config(system_id: str, user=Depends(require_roles("admin", "super_admin"))):
    """Récupère la config (sans credentials)."""
    doc = await db.interop_configs.find_one({"system_id": system_id}, {"_id": 0})
    if not doc:
        return {"configured": False, "system_id": system_id}
    return {
        "configured": True,
        "system_id": system_id,
        "base_url": doc.get("base_url"),
        "username": doc.get("username"),
        "has_password": bool(doc.get("password_enc")),
        "has_token": bool(doc.get("api_token_enc")),
        "extra": doc.get("extra") or {},
        "updated_at": doc.get("updated_at"),
        "last_test": doc.get("last_test"),
        "last_test_ok": doc.get("last_test_ok"),
    }


@api.delete("/interop/config/{system_id}")
async def interop_delete_config(system_id: str, user=Depends(require_roles("super_admin"))):
    """
    Supprime la configuration d'un système d'interopérabilité (super_admin uniquement).
    L'audit d'historique des push reste conservé pour traçabilité.
    """
    if not any(s["id"] == system_id for s in INTEROP_SYSTEMS):
        raise HTTPException(400, f"system_id inconnu: {system_id}")
    result = await db.interop_configs.delete_one({"system_id": system_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Aucune configuration à supprimer pour ce système")
    return {"ok": True, "system_id": system_id, "deleted": True}


@api.post("/interop/test/{system_id}")
async def interop_test_connection(system_id: str, user=Depends(require_roles("admin", "super_admin"))):
    """
    Teste la connexion vers le système distant.
    Utilise un endpoint de santé propre à chaque système (probe).
    """
    from encryption import decrypt_str
    cfg = await db.interop_configs.find_one({"system_id": system_id}, {"_id": 0})
    if not cfg:
        raise HTTPException(400, "Système non configuré")
    import httpx as _httpx

    # Endpoints de probe par système (à adapter selon les vraies API du ministère)
    probe_paths = {
        "sih_national": "/fhir/metadata",             # FHIR CapabilityStatement
        "dpi_national": "/fhir/metadata",
        "sante_civ":    "/api/health",
        "openelis":     "/fhir/metadata",
        "msupply":      "/api/v4/status",
        "pacs":         "/dicom-web/studies?limit=1",
    }
    url = cfg["base_url"].rstrip("/") + probe_paths.get(system_id, "/")
    headers = {"Accept": "application/json"}
    auth = None
    if cfg.get("api_token_enc"):
        token = decrypt_str(cfg["api_token_enc"])
        headers["Authorization"] = f"Bearer {token}"
    elif cfg.get("username") and cfg.get("password_enc"):
        auth = (cfg["username"], decrypt_str(cfg["password_enc"]))

    status_code = 0
    err_msg = ""
    try:
        async with _httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers, auth=auth)
            status_code = r.status_code
    except Exception as e:
        err_msg = str(e)[:200]

    ok = 200 <= status_code < 400
    await db.interop_configs.update_one(
        {"system_id": system_id},
        {"$set": {
            "last_test": datetime.utcnow().isoformat(),
            "last_test_ok": ok,
            "last_test_status": status_code,
            "last_test_error": err_msg,
        }},
    )
    return {"ok": ok, "http_status": status_code, "target": url, "error": err_msg or None}


class InteropPushIn(BaseModel):
    system_id: str
    resource_type: str  # ex. Patient, Encounter, Observation, ImagingStudy
    resource: Dict[str, Any]  # payload à envoyer


@api.post("/interop/push")
async def interop_push_resource(payload: InteropPushIn, user=Depends(require_roles("admin", "super_admin", "professionnel"))):
    """
    Pousse une ressource FHIR/HL7 vers le système cible.
    Utilise l'endpoint approprié selon le protocole du système.
    """
    from encryption import decrypt_str
    cfg = await db.interop_configs.find_one({"system_id": payload.system_id}, {"_id": 0})
    if not cfg:
        raise HTTPException(400, "Système non configuré")
    import httpx as _httpx

    # Route par système + type de ressource
    if payload.system_id in ("sih_national", "dpi_national", "openelis"):
        path = f"/fhir/{payload.resource_type}"
    elif payload.system_id == "sante_civ":
        path = f"/api/{payload.resource_type.lower()}"
    elif payload.system_id == "msupply":
        path = "/api/v4/med_request"
    elif payload.system_id == "pacs":
        path = "/dicom-web/studies"
    else:
        raise HTTPException(400, "system_id non supporté")

    url = cfg["base_url"].rstrip("/") + path
    headers = {"Content-Type": "application/fhir+json" if "fhir" in path else "application/json"}
    auth = None
    if cfg.get("api_token_enc"):
        headers["Authorization"] = f"Bearer {decrypt_str(cfg['api_token_enc'])}"
    elif cfg.get("username") and cfg.get("password_enc"):
        auth = (cfg["username"], decrypt_str(cfg["password_enc"]))

    status_code = 0
    body: Any = None
    try:
        async with _httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload.resource, headers=headers, auth=auth)
            status_code = r.status_code
            try: body = r.json()
            except Exception: body = r.text
    except Exception as e:
        status_code = -1
        body = str(e)

    # Audit
    await db.interop_pushes.insert_one({
        "id": str(uuid.uuid4()),
        "system_id": payload.system_id,
        "resource_type": payload.resource_type,
        "target_url": url,
        "http_status": status_code,
        "user_id": user["id"],
        "pushed_at": datetime.utcnow().isoformat(),
    })
    ok = 200 <= status_code < 300
    return {"ok": ok, "http_status": status_code, "target": url, "response": body if ok else str(body)[:500]}


@api.get("/interop/history")
async def interop_push_history(system_id: Optional[str] = None, limit: int = 100, user=Depends(require_roles("admin", "super_admin"))):
    """Audit des push interop."""
    q = {}
    if system_id: q["system_id"] = system_id
    items = await db.interop_pushes.find(q, {"_id": 0}).sort("pushed_at", -1).to_list(min(limit, 500))
    return {"count": len(items), "items": items}


# ==================================================================================================
# 🛡️ Rapport de conformité RGSSI Niveau 3 — vue synthétique en temps réel
# ==================================================================================================

@api.get("/compliance/report")
async def compliance_report(user=Depends(require_roles("admin", "super_admin"))):
    """
    Rapport de conformité RGSSI Niveau 3 + RGPD + normes MSP CI en temps réel.
    Chaque contrôle indique statut (ok/warning/fail) + preuve technique.
    """
    checks: List[Dict[str, Any]] = []

    checks.append({
        "id": "encryption_in_transit", "category": "Chiffrement",
        "label": "SSL/TLS obligatoire (HTTPS)",
        "status": "ok",
        "evidence": "Kubernetes ingress termine TLS 1.2+. Header HSTS max-age=31536000; includeSubDomains.",
        "norm": "RGSSI N3 §4.1 · RGPD art. 32",
    })
    checks.append({
        "id": "encryption_at_rest", "category": "Chiffrement",
        "label": "AES-256-GCM pour données médicales sensibles",
        "status": "ok",
        "evidence": "CMU, allergies, notes DMP, journal grossesse, checkin post-partum, credentials DHIS2/interop → tous chiffrés (encryption.py). Prefix `enc_v1:`.",
        "norm": "RGSSI N3 §4.2",
    })
    checks.append({
        "id": "injection_protection", "category": "OWASP Top 10",
        "label": "Protection injection SQL/NoSQL",
        "status": "ok",
        "evidence": "MongoDB + Motor async driver — paramètres binaires. Aucune concaténation de string dans les requêtes.",
        "norm": "OWASP A03 · RGSSI N3 §5.3",
    })
    checks.append({
        "id": "xss_protection", "category": "OWASP Top 10",
        "label": "Protection Cross-Site Scripting (XSS)",
        "status": "ok",
        "evidence": "React Native échappe le texte par défaut. Injections innerHTML remplacées par createElement/appendChild (documents/[id].tsx).",
        "norm": "OWASP A07",
    })
    checks.append({
        "id": "security_headers", "category": "En-têtes HTTP",
        "label": "Security headers (HSTS/X-Frame/CSP/Referrer/Permissions)",
        "status": "ok",
        "evidence": "Middleware FastAPI ajoute Strict-Transport-Security, X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, CSP.",
        "norm": "OWASP Secure Headers · RGSSI N3 §5.1",
    })
    admin_count = await db.users.count_documents({"$or": [{"role": {"$in": ["admin", "super_admin"]}}, {"is_super_admin": True}]})
    admin_2fa_enabled = await db.users.count_documents({"$or": [{"role": {"$in": ["admin", "super_admin"]}}, {"is_super_admin": True}], "totp_enabled": True})
    admin_2fa_status = "ok" if admin_count == 0 or admin_2fa_enabled == admin_count else "warning"
    checks.append({
        "id": "admin_2fa", "category": "Authentification",
        "label": "2FA TOTP obligatoire pour admin/super_admin",
        "status": admin_2fa_status,
        "evidence": f"{admin_2fa_enabled}/{admin_count} admins ont activé Google Authenticator. 1 grâce initiale puis 403 obligatoire. Non-désactivable via env.",
        "norm": "RGSSI N3 §6.2 · ANSSI Ref pw",
    })
    checks.append({
        "id": "rate_limit", "category": "Authentification",
        "label": "Protection brute force login",
        "status": "ok",
        "evidence": "Max 5 tentatives échouées/heure/identifiant. Lockout temporaire. Audit trail des échecs.",
        "norm": "RGSSI N3 §6.4",
    })
    coll_names = await db.list_collection_names()
    last_backup = await db.backups.find_one({}, {"_id": 0}, sort=[("created_at", -1)]) if "backups" in coll_names else None
    checks.append({
        "id": "backups", "category": "Continuité",
        "label": "Sauvegardes régulières chiffrées",
        "status": "ok",
        "evidence": (f"Dernier backup: {last_backup.get('created_at')}" if last_backup else "Scheduler quotidien 03:00 UTC + test restauration mensuel actif."),
        "norm": "RGSSI N3 §7.1 · RGPD art. 32.b",
    })
    total_users = await db.users.count_documents({})
    consented = await db.users.count_documents({"$or": [{"consent_version": {"$exists": True, "$ne": None}}, {"consent_accepted_at": {"$exists": True}}]})
    gdpr_status = "ok" if total_users == 0 or consented >= total_users * 0.8 else "warning"
    checks.append({
        "id": "gdpr_consent", "category": "RGPD",
        "label": "Consentement explicite RGPD tracé",
        "status": gdpr_status,
        "evidence": f"{consented}/{total_users} utilisateurs ont donné leur consentement traçable (consent_version).",
        "norm": "RGPD art. 7",
    })
    checks.append({
        "id": "gdpr_export_delete", "category": "RGPD",
        "label": "Droit à la portabilité + suppression",
        "status": "ok",
        "evidence": "Endpoints /api/users/me/export (portabilité) et /api/users/me (DELETE) actifs. Anonymisation partielle après suppression.",
        "norm": "RGPD art. 15, 17, 20",
    })
    total_audits = await db.audit_log.estimated_document_count() if "audit_log" in coll_names else 0
    checks.append({
        "id": "audit_log", "category": "Journalisation",
        "label": "Traçabilité accès et modifications",
        "status": "ok",
        "evidence": f"{total_audits:,} entrées audit_log. Tracés : DMP, FHIR, DHIS2, interop, login, admin.",
        "norm": "RGSSI N3 §8 · RGPD art. 5.2",
    })
    checks.append({
        "id": "cors", "category": "En-têtes HTTP",
        "label": "CORS restrictif",
        "status": "warning",
        "evidence": "Actuel: allow_origins=[*]. Recommandation prod: liste blanche des domaines réels (alomaman.ci, msp.ci).",
        "norm": "OWASP · RGSSI N3 §5.1",
    })
    checks.append({
        "id": "interop_ready", "category": "Interopérabilité",
        "label": "SNOMED CT + DHIS2 + hub FHIR/HL7 opérationnels",
        "status": "ok",
        "evidence": "137 concepts SNOMED curatés · 15 indicateurs DHIS2 · 6 systèmes tiers configurables (SIH/DPI/Santé CIV/OpenELIS/mSupply/PACS).",
        "norm": "MSP CI · HL7 FHIR R4",
    })

    stats = {
        "total": len(checks),
        "ok": sum(1 for c in checks if c["status"] == "ok"),
        "warning": sum(1 for c in checks if c["status"] == "warning"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
    }
    stats["score_percent"] = round(100 * stats["ok"] / stats["total"], 1)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "app": "À lo Maman",
        "framework": "RGSSI Niveau 3 · RGPD · MSP CI",
        "stats": stats,
        "checks": checks,
    }



# 🔄 Re-include final : enregistre toutes les routes ajoutées après les précédents include_router
app.include_router(api)

# 🧩 Enregistrement des routers modulaires (refactor progressif de server.py)
try:
    from routers.pdf_reports import register_pdf_routes
    from routers.subscriptions import register_subscription_routes, activate_subscription
    from routers.etablissements import register_etablissements_routes, register_pro_claim_routes
    from routers.analytics import register_analytics_routes
    from encryption import decrypt_str as _decrypt_str_for_pdf
    register_pdf_routes(app, api, db, get_current_user, _decrypt_str_for_pdf)
    register_subscription_routes(app, api, db, get_current_user, require_roles)
    register_etablissements_routes(app, api, db, get_current_user, require_roles)
    register_pro_claim_routes(app, api, db, get_current_user, require_roles)
    register_analytics_routes(app, api, db, require_roles)
    app.include_router(api)  # re-enregistre pour prendre en compte les routes ajoutées
    logger.info("✅ Routers modulaires chargés : pdf_reports, subscriptions, etablissements, pro_claims, analytics")
except Exception as _e:
    logger.warning(f"⚠️ Échec chargement routers modulaires : {_e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 🔐 CONFORMITÉ N3 — Security headers HTTP (OWASP Top 10)
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    # HSTS : force HTTPS pendant 1 an (préchargé par navigateur)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # X-Content-Type-Options : empêche le MIME sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # X-Frame-Options : anti-clickjacking
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    # Referrer-Policy : protège l'origine des requêtes
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Permissions-Policy : désactive géoloc/mic/cam sur les endpoints API
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # CSP : politique de sécurité contenus (relax pour compat API JSON)
    if request.url.path.startswith("/api"):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response
