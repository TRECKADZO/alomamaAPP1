"""
backup.py — Sauvegarde chiffrée À lo Maman
==========================================
Script de sauvegarde des collections MongoDB avec chiffrement AES-256-GCM.
Conformité RGSSI Niveau 3 (B.14 — Sauvegardes chiffrées et testées).

Utilisation :
  python backup.py                              # backup standard (collections santé)
  python backup.py --output /tmp/backup.tar.gz.enc
  python backup.py --restore /tmp/backup.tar.gz.enc --target-db ALOMAMAN_RESTORE

Le chiffrement utilise la même clé que `encryption.py` (`ENCRYPTION_KEY` env).
Les backups sont compressés (.tar.gz) puis chiffrés (.enc).

Rotation : par défaut conserve les 30 derniers backups dans `BACKUP_DIR`.
"""
from __future__ import annotations
import os
import sys
import json
import argparse
import tarfile
import io
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Charge la même clé que encryption.py
sys.path.insert(0, os.path.dirname(__file__))
from encryption import encrypt_value, decrypt_value  # type: ignore  # noqa: E402

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "alomaman")
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/app/backups"))
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Collections santé critiques à sauvegarder en priorité (RGSSI VM1-VM5)
CRITICAL_COLLECTIONS = [
    "users",
    "enfants",
    "grossesse",
    "tele_echo",
    "vaccinations",
    "consultation_notes",
    "consents",
    "audit_log",
    "incidents",
    "rdv",
    "messages",
    "dmp_progress",
    "birth_declarations",
    "reminders",
    "cycles",
    "documents",
]


async def dump_collection(client: AsyncIOMotorClient, db_name: str, coll: str) -> bytes:
    """Sérialise une collection en JSON compact."""
    db = client[db_name]
    docs = []
    async for d in db[coll].find({}, {"_id": 0}):
        docs.append(d)
    return json.dumps(docs, ensure_ascii=False, default=str).encode("utf-8")


async def make_backup(output_path: str) -> dict:
    """Sauvegarde toutes les collections critiques dans un .tar.gz chiffré."""
    if not MONGO_URL:
        raise RuntimeError("MONGO_URL absent du .env")

    client = AsyncIOMotorClient(MONGO_URL)
    try:
        # Construction du tar en mémoire
        mem = io.BytesIO()
        with tarfile.open(fileobj=mem, mode="w:gz") as tar:
            metadata = {
                "version": "1.0",
                "schema": "alomaman.backup.v1",
                "db": DB_NAME,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "rgssi_level": 3,
                "encryption": "AES-256-GCM",
                "collections": [],
            }

            for coll in CRITICAL_COLLECTIONS:
                try:
                    data = await dump_collection(client, DB_NAME, coll)
                    info = tarfile.TarInfo(name=f"{coll}.json")
                    info.size = len(data)
                    info.mtime = int(datetime.now(timezone.utc).timestamp())
                    tar.addfile(info, io.BytesIO(data))
                    count = len(json.loads(data.decode("utf-8")))
                    metadata["collections"].append({"name": coll, "count": count, "size_bytes": len(data)})
                    print(f"  ✓ {coll}: {count} docs ({len(data)} bytes)")
                except Exception as e:
                    print(f"  ✗ {coll}: {e}")
                    metadata["collections"].append({"name": coll, "error": str(e)})

            # Add metadata
            meta_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")
            mi = tarfile.TarInfo(name="_metadata.json")
            mi.size = len(meta_bytes)
            mi.mtime = int(datetime.now(timezone.utc).timestamp())
            tar.addfile(mi, io.BytesIO(meta_bytes))

        mem.seek(0)
        raw = mem.read()
        # Chiffrement AES-256-GCM via encryption.py
        encrypted_b64 = encrypt_value(raw.decode("latin-1"))  # encryption.py prend str
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(encrypted_b64)
        size_kb = len(encrypted_b64) / 1024
        print(f"\n✅ Backup chiffré écrit : {output_path} ({size_kb:.1f} KB)")
        return metadata
    finally:
        client.close()


async def restore_backup(backup_path: str, target_db: str | None = None) -> dict:
    """Restaure un backup chiffré dans une base (différente recommandée pour test)."""
    if not MONGO_URL:
        raise RuntimeError("MONGO_URL absent")

    with open(backup_path, "r", encoding="utf-8") as f:
        encrypted_b64 = f.read()
    raw = decrypt_value(encrypted_b64).encode("latin-1")
    mem = io.BytesIO(raw)

    client = AsyncIOMotorClient(MONGO_URL)
    try:
        db = client[target_db or f"{DB_NAME}_RESTORE_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"]
        with tarfile.open(fileobj=mem, mode="r:gz") as tar:
            metadata = None
            for member in tar.getmembers():
                f = tar.extractfile(member)
                if not f:
                    continue
                content = f.read()
                if member.name == "_metadata.json":
                    metadata = json.loads(content)
                    continue
                coll = member.name.replace(".json", "")
                docs = json.loads(content)
                if docs:
                    await db[coll].insert_many(docs)
                    print(f"  ✓ {coll}: {len(docs)} docs restaurés dans {db.name}")
        return {"restored_to_db": db.name, "metadata": metadata}
    finally:
        client.close()


def cleanup_old_backups(keep: int = 30):
    """Supprime les backups au-delà de `keep`."""
    files = sorted(BACKUP_DIR.glob("alomaman_*.enc"), key=os.path.getmtime, reverse=True)
    for old in files[keep:]:
        try:
            old.unlink()
            print(f"  🗑 supprimé : {old.name}")
        except Exception:
            pass


async def main():
    parser = argparse.ArgumentParser(description="À lo Maman — Backup chiffré RGSSI N3")
    parser.add_argument("--output", help="Chemin du fichier backup (défaut auto)")
    parser.add_argument("--restore", help="Chemin du backup à restaurer (test PRA)")
    parser.add_argument("--target-db", help="Base de destination pour la restauration")
    parser.add_argument("--keep", type=int, default=30, help="Nombre de backups à conserver")
    args = parser.parse_args()

    if args.restore:
        print(f"🔄 Restauration depuis {args.restore}...")
        info = await restore_backup(args.restore, args.target_db)
        print(f"✅ Restauration terminée : {info}")
        return

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = args.output or str(BACKUP_DIR / f"alomaman_{ts}.tar.gz.enc")
    print(f"💾 Sauvegarde chiffrée → {out}")
    metadata = await make_backup(out)
    cleanup_old_backups(args.keep)
    print(f"\n📊 {len(metadata['collections'])} collections sauvegardées.")


if __name__ == "__main__":
    asyncio.run(main())
