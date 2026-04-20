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
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ----------------------------------------------------------------------
# Mongo + App Setup
# ----------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
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
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u["role"],
        "avatar": u.get("avatar"),
        "phone": u.get("phone"),
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
Role = Literal["maman", "professionnel", "admin"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=2)
    role: Role = "maman"
    phone: Optional[str] = None
    specialite: Optional[str] = None  # for professionals


class LoginIn(BaseModel):
    email: EmailStr
    password: str


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


# ----------------------------------------------------------------------
# Auth Endpoints
# ----------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "phone": payload.phone,
        "specialite": payload.specialite,
        "avatar": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id, email, payload.role)
    return {"token": token, "user": serialize_user(doc)}


@api.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
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
        "status": "en_attente",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rdv.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/rdv/{rid}/status")
async def rdv_status(rid: str, status_val: str, user=Depends(require_roles("professionnel", "admin"))):
    if status_val not in ["confirme", "annule", "termine", "en_attente"]:
        raise HTTPException(400, "Statut invalide")
    await db.rdv.update_one({"id": rid}, {"$set": {"status": status_val}})
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
    return users


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


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
