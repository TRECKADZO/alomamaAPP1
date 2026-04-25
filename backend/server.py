from dotenv import load_dotenv
from pathlib import Path

# Load .env first so ENCRYPTION_KEY is available
load_dotenv("/app/backend/.env")

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
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

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
    return {
        "id": u["id"],
        "email": email_public or "",  # email affichable
        "internal_email": email,
        "name": u.get("name", ""),
        "role": u["role"],
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


def require_roles(*roles):
    async def _dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Accès refusé")
        return user
    return _dep


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


class LoginIn(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str


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
    mode: Optional[str] = "presentiel"  # "presentiel" | "teleconsultation"
    prestation_id: Optional[str] = None


class MessageIn(BaseModel):
    to_id: str
    content: str


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
    # Déclaration naissance
    lieu_naissance: str
    heure_naissance: str  # HH:MM
    poids_naissance_g: int
    taille_naissance_cm: float
    nom_pere: Optional[str] = None
    nom_mere: str
    profession_pere: Optional[str] = None
    profession_mere: Optional[str] = None
    medecin_accoucheur: Optional[str] = None
    numero_acte: Optional[str] = None


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
    }
    await db.users.insert_one(doc)

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


@api.post("/auth/login")
async def login(payload: LoginIn):
    if not payload.email and not payload.phone:
        raise HTTPException(status_code=400, detail="Email ou téléphone requis")
    user = None
    if payload.email:
        email = payload.email.lower().strip()
        user = await db.users.find_one({"email": email})
    if not user and payload.phone:
        phone = _normalize_phone(payload.phone)
        user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    token = create_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": serialize_user(user)}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return serialize_user(user)


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
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$push": {"mesures": mesure}},
    )
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    return decrypt_enfant(e)


@api.post("/enfants/{eid}/photo")
async def set_enfant_photo(eid: str, payload: PhotoIn, user=Depends(require_roles("maman"))):
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": {"photo": payload.photo_base64}},
    )
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
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
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": data},
    )
    e = await db.enfants.find_one({"id": eid}, {"_id": 0})
    return decrypt_enfant(e)


@api.delete("/enfants/{eid}")
async def delete_enfant(eid: str, user=Depends(require_roles("maman"))):
    await db.enfants.delete_one({"id": eid, "user_id": user["id"]})
    return {"ok": True}


@api.post("/enfants/{eid}/vaccins")
async def add_vaccin(eid: str, payload: VaccinIn, user=Depends(require_roles("maman"))):
    vaccin = {"id": str(uuid.uuid4()), **payload.dict()}
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]}, {"$push": {"vaccins": vaccin}}
    )
    return await db.enfants.find_one({"id": eid}, {"_id": 0})


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


@api.get("/rdv")
async def list_rdv(user=Depends(get_current_user)):
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
    # Quota freemium — max 10 RDV par mois pour une maman gratuite
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
    doc = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "pro_id": payload.pro_id,
        "date": payload.date,
        "motif": motif,
        "tarif_fcfa": tarif_fcfa,
        "type_consultation": payload.type_consultation,
        "mode": payload.mode or "presentiel",
        "prestation_id": payload.prestation_id,
        "prestation_nom": prestation.get("nom") if prestation else None,
        "cmu_applique": cmu_applique,
        "cmu_taux": cmu_taux,
        "cmu_montant_fcfa": cmu_montant,
        "reste_a_charge_fcfa": reste_a_charge,
        # Note : on stocke le numéro CMU en clair sur le RDV car c'est nécessaire pour la facturation à la CNAM (visible par le Pro)
        "cmu_numero": maman_cmu_clear.get("numero") if cmu_applique else None,
        "paye": False,
        "status": "en_attente",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rdv.insert_one(doc)
    doc.pop("_id", None)
    await push_notif(
        payload.pro_id,
        "Nouveau rendez-vous",
        f"{user['name']} demande un RDV le {payload.date[:10]} — {payload.motif[:60]}",
        "rdv",
    )
    return doc


@api.patch("/rdv/{rid}/status")
async def rdv_status(rid: str, status_val: str, user=Depends(require_roles("professionnel", "admin"))):
    if status_val not in ["confirme", "annule", "termine", "en_attente"]:
        raise HTTPException(400, "Statut invalide")
    rdv = await db.rdv.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    await db.rdv.update_one({"id": rid}, {"$set": {"status": status_val}})
    label = {"confirme": "confirmé ✅", "annule": "annulé ❌", "termine": "terminé ✓", "en_attente": "remis en attente"}.get(status_val, status_val)
    await push_notif(
        rdv["maman_id"],
        "Rendez-vous mis à jour",
        f"Votre RDV du {rdv['date'][:10]} a été {label}",
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
    doc = {
        "id": str(uuid.uuid4()),
        "from_id": user["id"],
        "from_name": user["name"],
        "to_id": payload.to_id,
        "content": payload.content,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    await push_notif(
        payload.to_id,
        f"Message de {user['name']}",
        payload.content[:80],
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
            weeks = int((datetime.now(timezone.utc) - datetime.fromisoformat(gross["date_debut"].replace("Z", "+00:00"))).total_seconds() / (7 * 24 * 3600))
            u["grossesse_sa"] = max(0, min(weeks, 42))
        u["enfants_count"] = enfants_count
        u["last_rdv_date"] = last_rdv.get("date") if last_rdv else None
    return users


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


@api.post("/pro/consultation-notes")
async def create_consultation_note(payload: ConsultationNoteIn, user=Depends(require_roles("professionnel"))):
    has_rdv = await db.rdv.count_documents({"pro_id": user["id"], "maman_id": payload.patient_id})
    if has_rdv == 0:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce patient")
    doc = {
        "id": str(uuid.uuid4()),
        "pro_id": user["id"],
        "pro_name": user.get("name"),
        "patient_id": payload.patient_id,
        "date": payload.date or datetime.now(timezone.utc).isoformat(),
        # 🔐 Chiffrement AES-256-GCM
        "diagnostic": encrypt_str(payload.diagnostic) if payload.diagnostic else payload.diagnostic,
        "traitement": encrypt_str(payload.traitement) if payload.traitement else payload.traitement,
        "notes": encrypt_str(payload.notes) if payload.notes else payload.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consultation_notes.insert_one(doc)
    doc.pop("_id", None)
    return decrypt_consultation_note(doc)


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
# Téléconsultation - Room link (Jitsi)
# ----------------------------------------------------------------------
@api.post("/teleconsultation/room/{rdv_id}")
async def create_teleconsultation_room(rdv_id: str, user=Depends(get_current_user)):
    rdv = await db.rdv.find_one({"id": rdv_id})
    if not rdv:
        raise HTTPException(status_code=404, detail="RDV introuvable")
    if user["id"] not in [rdv.get("maman_id"), rdv.get("pro_id")]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    room_name = f"alomaman-{rdv_id[:8]}"
    room_url = f"https://meet.jit.si/{room_name}"
    await db.rdv.update_one(
        {"id": rdv_id},
        {"$set": {"teleconsultation_room": room_name, "teleconsultation_url": room_url}},
    )
    return {"room_name": room_name, "room_url": room_url, "rdv": {**rdv, "_id": None}}


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
    return {"ok": True}


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
    user=Depends(get_current_user),
):
    """
    Recherche de professionnels.
    - q: recherche libre dans nom/spécialité
    - specialite: filtre par spécialité (regex)
    - prestation: filtre par nom de prestation (ex: "échographie")
    - max_prix: prix maximum FCFA (0 = ignoré)
    - cmu_only: ne retourner que les pros qui acceptent la CMU
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

    # Si filtre par prestation/prix : on identifie d'abord les prestations matching
    matching_pro_ids: Optional[set] = None
    if prestation or (max_prix and max_prix > 0):
        prest_query: dict = {"active": True}
        if prestation:
            prest_query["$or"] = [
                {"nom": {"$regex": prestation, "$options": "i"}},
                {"description": {"$regex": prestation, "$options": "i"}},
            ]
        if max_prix and max_prix > 0:
            prest_query["prix_fcfa"] = {"$lte": int(max_prix)}
        prestations = await db.prestations.find(prest_query, {"_id": 0, "pro_id": 1}).to_list(1000)
        matching_pro_ids = {p["pro_id"] for p in prestations}
        if not matching_pro_ids:
            return []
        query["id"] = {"$in": list(matching_pro_ids)}

    pros = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(100)

    # Enrichir chaque pro avec ses prestations matching (pour affichage)
    if matching_pro_ids is not None:
        for p in pros:
            prest_q: dict = {"pro_id": p["id"], "active": True}
            if prestation:
                prest_q["$or"] = [
                    {"nom": {"$regex": prestation, "$options": "i"}},
                    {"description": {"$regex": prestation, "$options": "i"}},
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
            "poids_kg": round(payload.poids_naissance_g / 1000, 3) if payload.poids_naissance_g else None,
            "taille_cm": payload.taille_naissance_cm,
            "vaccins": [],
            "mesures": [{
                "id": str(uuid.uuid4()),
                "date": payload.enfant_date_naissance,
                "poids_kg": round(payload.poids_naissance_g / 1000, 3) if payload.poids_naissance_g else None,
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
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "enfant_nom": enfant["nom"],
        "enfant_sexe": enfant["sexe"],
        "enfant_date_naissance": enfant["date_naissance"],
        **data,
        "status": "en_attente",
        "created_at": datetime.now(timezone.utc).isoformat(),
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
async def send_expo_push(token: str, title: str, body: str, data: Optional[dict] = None):
    """Send an Expo push via the public Expo Push API. Silently no-ops on failure."""
    if not token or not token.startswith("ExponentPushToken"):
        return
    try:
        import httpx  # type: ignore
        async with httpx.AsyncClient(timeout=5.0) as http:
            await http.post(
                "https://exp.host/--/api/v2/push/send",
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                json={"to": token, "title": title, "body": body, "data": data or {}, "sound": "default"},
            )
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


class SubscribeIn(BaseModel):
    months: int = 1


# ----------------------------------------------------------------------
# Premium plans (role-aware)
# ----------------------------------------------------------------------
PREMIUM_PLANS = {
    "maman": {
        "code": "maman",
        "label": "Maman Premium",
        "base_price_fcfa": 2000,
        "color": "#EC4899",
        "icon": "heart",
        "description": "Accompagnement complet de la grossesse aux premiers pas de bébé.",
        "features": [
            "Assistant IA (Claude Sonnet) illimité",
            "Téléconsultations prioritaires",
            "Export PDF/FHIR du dossier illimité",
            "Stockage photos & échographies",
            "Rappels santé automatisés (vaccins, RDV)",
            "Contenus éducatifs Premium",
            "Support 24/7",
        ],
        "free_limits": "Gratuit : 2 enfants · 10 RDV/mois · IA basique",
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
    "maman": {"enfants_max": 2, "rdv_per_month": 10, "ia_per_day": 10},
    "professionnel": {"patientes_max": 10, "ia_pro_per_day": 0},
    "centre_sante": {"membres_pro_max": 3},
    "famille": {"notifications_enabled": False},
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
    # Si CMU appliqué, on paie uniquement le reste-à-charge
    amount = rdv.get("reste_a_charge_fcfa") if rdv.get("cmu_applique") else rdv.get("tarif_fcfa", 10000)
    if not amount:
        amount = rdv.get("tarif_fcfa", 10000)
    # Commission dynamique : 5% si Pro Premium, sinon 10%
    pro = await db.users.find_one({"id": rdv["pro_id"]}, {"_id": 0})
    commission_rate = 0.05 if (pro and is_premium_active(pro)) else 0.10
    commission = int(round(amount * commission_rate))
    pro_amount = amount - commission
    desc = f"Consultation À lo Maman · RDV {rdv['date'][:10]}"
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        amount, desc, user,
        {"kind": "consultation", "rdv_id": payload.rdv_id, "maman_id": user["id"], "pro_id": rdv["pro_id"], "commission": commission, "commission_rate": commission_rate, "pro_amount": pro_amount},
        return_url,
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "kind": "consultation",
        "rdv_id": payload.rdv_id,
        "pro_id": rdv["pro_id"],
        "amount": amount,
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
            await db.rdv.update_one({"id": p["rdv_id"]}, {"$set": {"paye": True, "payment_token": token}})
            await push_notif(p["pro_id"], "Consultation payée 💰", f"Votre RDV a été payé ({p['pro_amount']} FCFA après commission).", "info")
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
                await push_notif(p["user_id"], "Premium activé 🎉", f"Abonnement actif jusqu'au {end.strftime('%d/%m/%Y')}", "info")
            elif p["kind"] == "consultation":
                await db.rdv.update_one({"id": p["rdv_id"]}, {"$set": {"paye": True, "payment_token": token}})
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

    # Seed admin
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": "Admin À lo Maman",
            "role": "admin",
            "avatar": None,
            "phone": None,
            "specialite": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin {admin_email}")

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

    # Seed test maman
    if not await db.users.find_one({"email": "maman@test.com"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "maman@test.com",
            "password_hash": hash_password("Maman123!"),
            "name": "Aminata Koné",
            "role": "maman",
            "avatar": None,
            "phone": "+228 90 00 00 01",
            "specialite": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Seed test professionnels
    pros_seed = [
        ("pro@test.com", "Pro123!", "Dr. Fatou Diallo", "Gynécologue-Obstétricienne"),
        ("pediatre@test.com", "Pro123!", "Dr. Kofi Mensah", "Pédiatre"),
        ("sagefemme@test.com", "Pro123!", "Mme. Aïsha Traoré", "Sage-femme"),
    ]
    for email, pw, name, spec in pros_seed:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "password_hash": hash_password(pw),
                "name": name,
                "role": "professionnel",
                "avatar": None,
                "phone": None,
                "specialite": spec,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # Seed a couple of community posts
    if await db.posts.count_documents({}) == 0:
        maman = await db.users.find_one({"email": "maman@test.com"})
        pro = await db.users.find_one({"email": "pro@test.com"})
        if maman and pro:
            now = datetime.now(timezone.utc).isoformat()
            await db.posts.insert_many([
                {
                    "id": str(uuid.uuid4()),
                    "user_id": maman["id"],
                    "user_name": maman["name"],
                    "user_role": "maman",
                    "title": "Nausées du 1er trimestre 🤰",
                    "content": "Bonjour les mamans ! Comment avez-vous géré les nausées matinales ? Je cherche des astuces naturelles.",
                    "category": "grossesse",
                    "likes": [],
                    "comments": [],
                    "created_at": now,
                },
                {
                    "id": str(uuid.uuid4()),
                    "user_id": pro["id"],
                    "user_name": pro["name"],
                    "user_role": "professionnel",
                    "title": "Conseils allaitement 🤱",
                    "content": "N'hésitez pas à poser vos questions sur l'allaitement maternel. L'OMS recommande l'allaitement exclusif jusqu'à 6 mois.",
                    "category": "allaitement",
                    "likes": [],
                    "comments": [],
                    "created_at": now,
                },
            ])

    # Seed educational resources (OMS/UNICEF validated baseline)
    if await db.resources.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await db.resources.insert_many([
            {
                "id": str(uuid.uuid4()),
                "type": "fiche",
                "title": "Les 8 consultations prénatales recommandées",
                "description": "L'OMS recommande au moins 8 contacts prénatals pour réduire la mortalité maternelle et néonatale.",
                "category": "grossesse",
                "content_md": "# Les 8 consultations prénatales\n\nSelon les recommandations **OMS 2016**, toute femme enceinte devrait bénéficier de **8 contacts prénatals** minimum :\n\n1. **Avant 12 semaines** — Confirmation grossesse, bilan initial, dépistage\n2. **20 semaines** — Échographie morphologique\n3. **26 semaines** — Dépistage anémie, diabète gestationnel\n4. **30 semaines** — Surveillance tension, croissance fœtale\n5. **34 semaines** — Position du bébé, préparation accouchement\n6. **36 semaines** — Dépistage streptocoque B\n7. **38 semaines** — Évaluation col, terme prévu\n8. **40 semaines** — Surveillance dépassement de terme\n\n> ⚠️ **Côte d'Ivoire** : La CMU prend en charge 100% des consultations prénatales chez les pros partenaires.\n\n## Bilans recommandés\n- Groupe sanguin / Rhésus\n- Sérologies (VIH, hépatite B, syphilis, toxoplasmose, rubéole)\n- NFS, glycémie\n- Albuminurie (urine)\n\n*Source : OMS — Recommandations concernant les soins prénatals 2016*",
                "source": "OMS",
                "tags": ["prenatal", "consultation", "oms"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "fiche",
                "title": "Calendrier vaccinal PEV Côte d'Ivoire",
                "description": "Calendrier officiel du Programme Élargi de Vaccination (0-5 ans).",
                "category": "vaccination",
                "content_md": "# Calendrier vaccinal PEV — Côte d'Ivoire\n\n## À la naissance\n- **BCG** (tuberculose) — dose unique\n- **VPO 0** (polio oral)\n- **Hépatite B** (première dose)\n\n## 6 semaines\n- **Pentavalent 1** (DTC-HepB-Hib)\n- **VPO 1**\n- **PCV 1** (pneumocoque)\n- **Rotavirus 1**\n\n## 10 semaines\n- **Pentavalent 2**, **VPO 2**, **PCV 2**, **Rotavirus 2**\n\n## 14 semaines\n- **Pentavalent 3**, **VPO 3**, **PCV 3**, **VPI** (polio injectable)\n\n## 9 mois\n- **Rougeole 1**\n- **Fièvre jaune**\n\n## 15-18 mois\n- **Rougeole 2**\n\n## 9-14 ans (filles)\n- **HPV** (2 doses à 6 mois d'intervalle)\n\n> 💡 La vaccination est **gratuite** dans tous les centres de santé publics de Côte d'Ivoire.\n\n*Source : Ministère de la Santé et de l'Hygiène Publique / UNICEF Côte d'Ivoire*",
                "source": "MSHP-CI",
                "tags": ["vaccination", "pev", "enfant"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "fiche",
                "title": "Allaitement maternel exclusif : le guide",
                "description": "Pourquoi et comment allaiter exclusivement jusqu'à 6 mois selon l'OMS.",
                "category": "allaitement",
                "content_md": "# Allaitement maternel exclusif\n\nL'**OMS** et l'**UNICEF** recommandent l'allaitement maternel **exclusif** jusqu'à 6 mois, puis poursuivi avec diversification jusqu'à 2 ans.\n\n## Les bénéfices prouvés\n- 🛡️ **Protection immunitaire** : réduit la mortalité infantile de 13%\n- 🧠 **Développement cognitif** supérieur\n- ❤️ **Lien mère-enfant** renforcé\n- 💰 **Économique** : zéro coût\n- 🩺 **Protège la mère** : réduit risques cancers sein/ovaire\n\n## Les bonnes positions\n1. **Berceau** — le plus classique\n2. **Football** — idéal après césarienne\n3. **Allongée** — pour les tétées de nuit\n\n## Fréquence\n- 8 à 12 tétées / 24h les premières semaines\n- À la demande du bébé (pas d'horaires stricts)\n- Signes de faim : bouge les lèvres, cherche le sein, porte main à la bouche\n\n## Quand consulter ?\n- Crevasses douloureuses persistantes\n- Fièvre maternelle > 38.5°\n- Bébé qui ne prend pas de poids\n- Refus répété du sein",
                "source": "OMS",
                "tags": ["allaitement", "lait_maternel", "0-6mois"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "video",
                "title": "Comment positionner bébé pour l'allaitement — UNICEF",
                "description": "Démonstration officielle des bonnes positions d'allaitement.",
                "category": "allaitement",
                "video_url": "https://www.youtube.com/watch?v=OsE76lQMAcw",
                "duration_sec": 240,
                "source": "UNICEF",
                "tags": ["video", "allaitement", "position"],
                "author_name": "UNICEF",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "video",
                "title": "Les signes d'alarme pendant la grossesse",
                "description": "Quand consulter en urgence : saignements, douleurs, œdèmes.",
                "category": "grossesse",
                "video_url": "https://www.youtube.com/watch?v=F3jbxn_ejEc",
                "duration_sec": 360,
                "source": "OMS",
                "tags": ["video", "urgence", "grossesse"],
                "author_name": "OMS",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "quiz",
                "title": "Quiz — Connaissez-vous les signes d'une grossesse saine ?",
                "description": "5 questions pour tester vos connaissances sur le suivi prénatal.",
                "category": "grossesse",
                "questions": [
                    {
                        "question": "Combien de consultations prénatales minimum l'OMS recommande-t-elle ?",
                        "options": ["3", "4", "6", "8"],
                        "correct_index": 3,
                        "explication": "Depuis 2016, l'OMS recommande 8 contacts prénatals minimum pour réduire la mortalité maternelle.",
                    },
                    {
                        "question": "À partir de quelle semaine peut-on ressentir les premiers mouvements du bébé ?",
                        "options": ["8-10 SA", "12-14 SA", "16-22 SA", "28-30 SA"],
                        "correct_index": 2,
                        "explication": "Les premiers mouvements sont généralement perçus entre 16 et 22 semaines d'aménorrhée.",
                    },
                    {
                        "question": "Quel saignement nécessite une consultation en URGENCE ?",
                        "options": [
                            "Tout saignement, à tout stade",
                            "Seulement au 3e trimestre",
                            "Seulement s'il y a douleur",
                            "Jamais, c'est normal",
                        ],
                        "correct_index": 0,
                        "explication": "Tout saignement pendant la grossesse nécessite une consultation rapide pour éliminer toute complication.",
                    },
                    {
                        "question": "Quel supplément est recommandé dès le début de la grossesse ?",
                        "options": ["Vitamine C", "Acide folique (B9)", "Calcium", "Fer uniquement"],
                        "correct_index": 1,
                        "explication": "L'acide folique (400 µg/j) prévient les malformations du tube neural. Idéalement commencé avant la conception.",
                    },
                    {
                        "question": "Combien de temps dure une grossesse normale ?",
                        "options": ["36 SA", "38 SA", "40 SA", "42 SA"],
                        "correct_index": 2,
                        "explication": "40 semaines d'aménorrhée (SA), soit environ 9 mois à partir des dernières règles.",
                    },
                ],
                "source": "OMS",
                "tags": ["quiz", "grossesse", "prenatal"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "quiz",
                "title": "Quiz — Vaccination de bébé",
                "description": "Testez vos connaissances sur le calendrier PEV.",
                "category": "vaccination",
                "questions": [
                    {
                        "question": "À la naissance, quel vaccin est administré en premier ?",
                        "options": ["Rougeole", "BCG", "Pentavalent", "Fièvre jaune"],
                        "correct_index": 1,
                        "explication": "Le BCG (contre la tuberculose) est donné dès la naissance en Côte d'Ivoire.",
                    },
                    {
                        "question": "À quel âge se fait le premier vaccin contre la rougeole ?",
                        "options": ["6 semaines", "3 mois", "9 mois", "18 mois"],
                        "correct_index": 2,
                        "explication": "La 1ère dose est administrée à 9 mois, la 2e à 15-18 mois.",
                    },
                    {
                        "question": "Le Pentavalent protège contre combien de maladies ?",
                        "options": ["3", "4", "5", "6"],
                        "correct_index": 2,
                        "explication": "Diphtérie, Tétanos, Coqueluche, Hépatite B, Haemophilus influenzae type b (Hib).",
                    },
                ],
                "source": "MSHP-CI",
                "tags": ["quiz", "vaccination"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "type": "fiche",
                "title": "Nutrition pendant la grossesse",
                "description": "Aliments recommandés et à éviter pendant les 9 mois.",
                "category": "nutrition",
                "content_md": "# Bien manger pendant la grossesse\n\n## ✅ À privilégier chaque jour\n- **Légumes variés** (épinards, gombo, carottes, aubergines) — riches en acide folique et fer\n- **Fruits frais** (mangue, papaye, orange) — vitamine C\n- **Céréales complètes** (riz, mil, sorgho)\n- **Protéines** : poisson frais, viande bien cuite, œufs, haricots\n- **Produits laitiers** (yaourt, fromage pasteurisé) — calcium\n- **1,5-2 L d'eau** par jour\n\n## ❌ À éviter\n- **Poisson et viande crus** (risque toxoplasmose, listériose)\n- **Fromage au lait cru**\n- **Alcool** (aucune dose sécure)\n- **Excès de caféine** (max 200 mg/j = 2 tasses de café)\n- **Poissons à haute teneur en mercure** (thon, espadon)\n\n## 💊 Supplémentations\n- **Acide folique 400 µg/j** — tout le 1er trimestre (et idéalement 3 mois avant conception)\n- **Fer + Acide folique** — dès la 1ère consultation prénatale (Côte d'Ivoire : souvent gratuit au CSU)\n- **Vitamine D** si peu d'exposition solaire\n\n> 🌍 Contexte Côte d'Ivoire : pensez à laver soigneusement tous légumes/fruits, bien cuire viandes et poissons.",
                "source": "OMS",
                "tags": ["nutrition", "alimentation", "grossesse"],
                "author_name": "À lo Maman",
                "author_role": "admin",
                "published": True,
                "langue": "fr",
                "views": 0,
                "likes": [],
                "created_at": now,
            },
        ])

    logger.info("Startup complete")

    # 🔔 Démarre le scheduler de rappels (push pour les reminders échus)
    import asyncio
    asyncio.create_task(_reminders_scheduler())


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


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
