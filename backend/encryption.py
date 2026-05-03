"""
Chiffrement au repos AES-256-GCM pour les données médicales sensibles.

Fields encrypted:
- users.cmu.numero, users.cmu.nom_complet, users.cmu.beneficiaires[].numero_cmu, users.cmu.beneficiaires[].nom
- enfants.numero_cmu, enfants.allergies
- tele_echo.image_base64
- consultation_notes.diagnostic, consultation_notes.traitement, consultation_notes.notes

Format du ciphertext : "enc_v1:" + base64(nonce[12] + ciphertext + tag[16])
Le préfixe "enc_v1:" permet de distinguer les données chiffrées des données legacy.
"""
import os
import base64
import logging
import secrets
from typing import Any, Optional, List
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

ENC_PREFIX = "enc_v1:"
_cached_key: Optional[bytes] = None


def _get_or_create_key() -> bytes:
    """Récupère la clé de chiffrement depuis l'env, en génère une si absente."""
    global _cached_key
    if _cached_key is not None:
        return _cached_key
    key_b64 = os.getenv("ENCRYPTION_KEY")
    if not key_b64:
        # Génération automatique (32 bytes = 256 bits) + persist dans .env
        new_key = AESGCM.generate_key(bit_length=256)
        key_b64 = base64.urlsafe_b64encode(new_key).decode()
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", ".env")
        if not os.path.exists(env_path):
            env_path = "/app/backend/.env"
        try:
            with open(env_path, "a") as f:
                f.write(f"\nENCRYPTION_KEY=\"{key_b64}\"\n")
            logger.warning(f"🔐 Clé de chiffrement AES-256-GCM auto-générée et sauvegardée dans {env_path}")
        except Exception as e:
            logger.error(f"Impossible de persister ENCRYPTION_KEY : {e}. La clé ne survivra pas au redémarrage.")
        os.environ["ENCRYPTION_KEY"] = key_b64
    _cached_key = base64.urlsafe_b64decode(key_b64)
    return _cached_key


def encrypt_str(plaintext: Optional[str]) -> Optional[str]:
    """Chiffre une chaîne. Retourne None si l'entrée est None/vide."""
    if plaintext is None or plaintext == "":
        return plaintext
    if isinstance(plaintext, str) and plaintext.startswith(ENC_PREFIX):
        return plaintext  # déjà chiffré
    try:
        key = _get_or_create_key()
        aesgcm = AESGCM(key)
        nonce = secrets.token_bytes(12)
        ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
        return ENC_PREFIX + base64.b64encode(nonce + ct).decode("ascii")
    except Exception as e:
        logger.error(f"encrypt_str failed: {e}")
        return plaintext  # fallback plaintext (ne bloque pas la sauvegarde)


def decrypt_str(ciphertext: Optional[str]) -> Optional[str]:
    """Déchiffre. Si la valeur n'est pas préfixée, retourne tel quel (legacy data)."""
    if ciphertext is None or ciphertext == "":
        return ciphertext
    if not isinstance(ciphertext, str) or not ciphertext.startswith(ENC_PREFIX):
        return ciphertext  # plaintext legacy
    try:
        key = _get_or_create_key()
        aesgcm = AESGCM(key)
        blob = base64.b64decode(ciphertext[len(ENC_PREFIX):])
        nonce, ct = blob[:12], blob[12:]
        return aesgcm.decrypt(nonce, ct, associated_data=None).decode("utf-8")
    except Exception as e:
        logger.error(f"decrypt_str failed: {e}")
        return None


def encrypt_list(items: Optional[List[str]]) -> Optional[List[str]]:
    if not items:
        return items
    return [encrypt_str(x) for x in items]


def decrypt_list(items: Optional[List[str]]) -> Optional[List[str]]:
    if not items:
        return items
    return [decrypt_str(x) for x in items]


# --------------- Helpers par collection ---------------

def encrypt_cmu_dict(cmu: dict) -> dict:
    """Chiffre les champs sensibles d'un objet cmu dict. Retourne un nouveau dict."""
    if not cmu:
        return cmu
    out = dict(cmu)
    if "numero" in out:
        out["numero"] = encrypt_str(out.get("numero"))
    if "nom_complet" in out:
        out["nom_complet"] = encrypt_str(out.get("nom_complet"))
    if isinstance(out.get("beneficiaires"), list):
        out["beneficiaires"] = [
            {
                **b,
                "numero_cmu": encrypt_str(b.get("numero_cmu")) if b.get("numero_cmu") else b.get("numero_cmu"),
                "nom": encrypt_str(b.get("nom")) if b.get("nom") else b.get("nom"),
            }
            for b in out["beneficiaires"]
        ]
    return out


def decrypt_cmu_dict(cmu: Any) -> Any:
    """Déchiffre transparenment un cmu dict retourné aux clients."""
    if not cmu or not isinstance(cmu, dict):
        return cmu
    out = dict(cmu)
    if "numero" in out:
        out["numero"] = decrypt_str(out.get("numero"))
    if "nom_complet" in out:
        out["nom_complet"] = decrypt_str(out.get("nom_complet"))
    if isinstance(out.get("beneficiaires"), list):
        out["beneficiaires"] = [
            {
                **b,
                "numero_cmu": decrypt_str(b.get("numero_cmu")) if b.get("numero_cmu") else b.get("numero_cmu"),
                "nom": decrypt_str(b.get("nom")) if b.get("nom") else b.get("nom"),
            }
            for b in out["beneficiaires"]
        ]
    return out


def decrypt_enfant(enfant: Any) -> Any:
    if not enfant or not isinstance(enfant, dict):
        return enfant
    out = dict(enfant)
    if out.get("numero_cmu"):
        out["numero_cmu"] = decrypt_str(out["numero_cmu"])
    if isinstance(out.get("allergies"), list):
        out["allergies"] = [decrypt_str(x) if isinstance(x, str) else x for x in out["allergies"]]
    return out


def decrypt_tele_echo(echo: Any) -> Any:
    if not echo or not isinstance(echo, dict):
        return echo
    out = dict(echo)
    if out.get("image_base64"):
        out["image_base64"] = decrypt_str(out["image_base64"])
    if out.get("conclusion"):
        out["conclusion"] = decrypt_str(out["conclusion"])
    if out.get("commentaires_medicaux"):
        out["commentaires_medicaux"] = decrypt_str(out["commentaires_medicaux"])
    return out


def decrypt_consultation_note(note: Any) -> Any:
    if not note or not isinstance(note, dict):
        return note
    out = dict(note)
    for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
        if out.get(f):
            out[f] = decrypt_str(out[f])
    return out
