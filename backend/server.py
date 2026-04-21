from dotenv import load_dotenv
from pathlib import Path

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


class VaccinIn(BaseModel):
    nom: str
    date: str
    fait: bool = False


class RdvIn(BaseModel):
    pro_id: str
    date: str  # ISO
    motif: str
    tarif_fcfa: int = 10000


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
    enfant_id: str
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
    image_base64: str
    description: Optional[str] = None
    semaine_grossesse: Optional[int] = None


# ----------------------------------------------------------------------
# Auth Endpoints
# ----------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    if not payload.email and not payload.phone:
        raise HTTPException(status_code=400, detail="Email ou téléphone requis")

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
        "created_at": datetime.now(timezone.utc).isoformat(),
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

    # Si pro avec code invitation centre → on lie
    if payload.role == "professionnel" and payload.code_invitation_centre:
        centre = await db.centres.find_one(
            {"code_invitation": payload.code_invitation_centre.upper()}
        )
        if centre:
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
    return items


@api.post("/enfants/{eid}/mesures")
async def add_mesure(eid: str, payload: MesureIn, user=Depends(require_roles("maman"))):
    mesure = {"id": str(uuid.uuid4()), **payload.dict()}
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$push": {"mesures": mesure}},
    )
    return await db.enfants.find_one({"id": eid}, {"_id": 0})


@api.post("/enfants/{eid}/photo")
async def set_enfant_photo(eid: str, payload: PhotoIn, user=Depends(require_roles("maman"))):
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": {"photo": payload.photo_base64}},
    )
    return await db.enfants.find_one({"id": eid}, {"_id": 0})


@api.post("/enfants")
async def create_enfant(payload: EnfantIn, user=Depends(require_roles("maman"))):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.dict(),
        "vaccins": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.enfants.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/enfants/{eid}")
async def update_enfant(eid: str, payload: EnfantIn, user=Depends(require_roles("maman"))):
    await db.enfants.update_one(
        {"id": eid, "user_id": user["id"]},
        {"$set": payload.dict(exclude_unset=True)},
    )
    return await db.enfants.find_one({"id": eid}, {"_id": 0})


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
    doc = {
        "id": str(uuid.uuid4()),
        "maman_id": user["id"],
        "pro_id": payload.pro_id,
        "date": payload.date,
        "motif": payload.motif,
        "tarif_fcfa": payload.tarif_fcfa,
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
    notes = await db.consultation_notes.find({"patient_id": patient_id, "pro_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(200)
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
        "diagnostic": payload.diagnostic,
        "traitement": payload.traitement,
        "notes": payload.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consultation_notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


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
async def search_pros(q: str = "", specialite: str = "", user=Depends(get_current_user)):
    query = {"role": "professionnel"}
    if specialite:
        query["specialite"] = {"$regex": specialite, "$options": "i"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"specialite": {"$regex": q, "$options": "i"}},
        ]
    pros = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(100)
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
    doc = {
        "id": str(uuid.uuid4()),
        "rdv_id": payload.rdv_id,
        "maman_id": rdv["maman_id"],
        "pro_id": user["id"],
        "pro_name": user["name"],
        "image_base64": payload.image_base64,
        "description": payload.description,
        "semaine_grossesse": payload.semaine_grossesse,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tele_echo.insert_one(doc)
    doc.pop("_id", None)
    await push_notif(
        rdv["maman_id"],
        "Nouvelle image d'échographie 🩺",
        f"Dr. {user['name']} a partagé une image (semaine {payload.semaine_grossesse or '?'})",
        "info",
    )
    return doc


@api.get("/tele-echo")
async def list_echos(user=Depends(get_current_user)):
    q = {"maman_id": user["id"]} if user["role"] == "maman" else (
        {"pro_id": user["id"]} if user["role"] == "professionnel" else {}
    )
    items = await db.tele_echo.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@api.get("/tele-echo/rdv/{rdv_id}")
async def echos_for_rdv(rdv_id: str, user=Depends(get_current_user)):
    items = await db.tele_echo.find({"rdv_id": rdv_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    if items and user["id"] not in [items[0]["maman_id"], items[0]["pro_id"]] and user["role"] != "admin":
        raise HTTPException(403, "Accès refusé")
    return items


# ----------------------------------------------------------------------
# Déclaration de naissance
# ----------------------------------------------------------------------
@api.post("/naissance")
async def create_naissance(payload: NaissanceIn, user=Depends(require_roles("maman"))):
    enfant = await db.enfants.find_one({"id": payload.enfant_id, "user_id": user["id"]})
    if not enfant:
        raise HTTPException(404, "Enfant introuvable")
    existing = await db.naissances.find_one({"enfant_id": payload.enfant_id})
    if existing:
        raise HTTPException(400, "Déclaration déjà enregistrée pour cet enfant")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "enfant_nom": enfant["nom"],
        "enfant_sexe": enfant["sexe"],
        "enfant_date_naissance": enfant["date_naissance"],
        **payload.dict(),
        "status": "en_attente",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.naissances.insert_one(doc)
    doc.pop("_id", None)
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


@api.post("/pay/subscribe")
async def pay_subscribe(payload: SubscribeIn, user=Depends(require_roles("maman"))):
    months = max(1, min(payload.months, 12))
    amount = 2000 * months
    desc = f"Abonnement À lo Maman Premium · {months} mois"
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        amount, desc, user, {"kind": "subscription", "user_id": user["id"], "months": months}, return_url
    )
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "kind": "subscription",
        "amount": amount,
        "months": months,
        "token": inv.get("token"),
        "status": "pending" if inv.get("success") else "error",
        "error": inv.get("error"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    return {"payment": doc, "payment_url": inv.get("url"), "success": inv.get("success", False), "error": inv.get("error")}


class ConsultationPayIn(BaseModel):
    rdv_id: str


@api.post("/pay/consultation")
async def pay_consultation(payload: ConsultationPayIn, user=Depends(require_roles("maman"))):
    rdv = await db.rdv.find_one({"id": payload.rdv_id, "maman_id": user["id"]}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    amount = rdv.get("tarif_fcfa", 10000)
    commission = amount // 10  # 10%
    pro_amount = amount - commission
    desc = f"Consultation À lo Maman · RDV {rdv['date'][:10]}"
    return_url = f"{os.environ.get('APP_URL', '')}/api/pay/return"
    inv = await paydunya_create_invoice(
        amount, desc, user,
        {"kind": "consultation", "rdv_id": payload.rdv_id, "maman_id": user["id"], "pro_id": rdv["pro_id"], "commission": commission, "pro_amount": pro_amount},
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

    logger.info("Startup complete")


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
