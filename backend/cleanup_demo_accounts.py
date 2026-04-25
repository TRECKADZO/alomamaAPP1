"""
Cleanup script — supprime tous les comptes de démo et leurs données associées.
GARDE intact le super admin (klenakan.eric@gmail.com).

Usage : python /app/backend/cleanup_demo_accounts.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "alomaman")

DEMO_EMAILS = [
    "maman@test.com",
    "pro@test.com",
    "pediatre@test.com",
    "sagefemme@test.com",
    "admin@alomaman.com",
    "centre1@test.com",
    "papa1@test.com",
    "papa@test.com",  # variante éventuelle
]

# Toutes les collections qui contiennent des docs liés à un user_id
USER_LINKED_COLLECTIONS = [
    "grossesses", "enfants", "rdv", "messages", "posts", "post_comments",
    "cycles", "contraception", "reminders", "notifications", "quotas",
    "tele_echo", "consultation_notes", "documents", "prestations",
    "plans_naissance", "maison_securisee_state", "quiz_results",
    "premium_subscriptions", "cmu_history", "famille_links",
    "pro_centre_links", "pro_disponibilites", "pro_clients",
    "fhir_exports",
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1) Trouver tous les users à supprimer (par email)
    cursor = db.users.find({"email": {"$in": DEMO_EMAILS}}, {"_id": 0, "id": 1, "email": 1, "role": 1, "name": 1})
    demo_users = await cursor.to_list(100)

    if not demo_users:
        print("✅ Aucun compte de démo trouvé. Rien à faire.")
        return

    print(f"🔍 {len(demo_users)} compte(s) de démo trouvé(s) :")
    for u in demo_users:
        print(f"  - {u.get('email')} ({u.get('role')}) — {u.get('name')}")

    user_ids = [u["id"] for u in demo_users]
    user_emails = [u["email"] for u in demo_users]

    # 2) Sécurité : NE PAS toucher au super admin
    super_email = os.environ.get("SUPER_ADMIN_EMAIL", "klenakan.eric@gmail.com")
    if super_email in user_emails:
        print(f"⛔ ABORT — Le super admin {super_email} est dans la liste, on annule par sécurité.")
        return

    # 3) Supprimer dans toutes les collections liées
    print("\n🧹 Nettoyage des données associées...")
    total_deleted = 0
    for coll_name in USER_LINKED_COLLECTIONS:
        try:
            r = await db[coll_name].delete_many({"user_id": {"$in": user_ids}})
            if r.deleted_count > 0:
                print(f"  • {coll_name}: {r.deleted_count} doc(s) supprimé(s)")
                total_deleted += r.deleted_count
        except Exception as e:
            print(f"  ⚠️ {coll_name}: {e}")

    # 4) Cas spéciaux : pro_id, centre_id, target_user_id, sender_id, receiver_id
    extra_filters = {
        "rdv": [{"pro_id": {"$in": user_ids}}, {"centre_id": {"$in": user_ids}}],
        "messages": [{"sender_id": {"$in": user_ids}}, {"receiver_id": {"$in": user_ids}}, {"to_user_id": {"$in": user_ids}}],
        "consultation_notes": [{"pro_id": {"$in": user_ids}}],
        "tele_echo": [{"pro_id": {"$in": user_ids}}],
        "prestations": [{"pro_id": {"$in": user_ids}}],
        "pro_disponibilites": [{"pro_id": {"$in": user_ids}}],
        "pro_clients": [{"pro_id": {"$in": user_ids}}, {"client_id": {"$in": user_ids}}],
        "famille_links": [{"famille_user_id": {"$in": user_ids}}, {"maman_user_id": {"$in": user_ids}}],
        "pro_centre_links": [{"pro_id": {"$in": user_ids}}, {"centre_id": {"$in": user_ids}}],
        "post_comments": [{"author_id": {"$in": user_ids}}],
    }
    print("\n🧹 Nettoyage des références croisées...")
    for coll, filters in extra_filters.items():
        for f in filters:
            try:
                r = await db[coll].delete_many(f)
                if r.deleted_count > 0:
                    print(f"  • {coll} ({list(f.keys())[0]}): {r.deleted_count} doc(s)")
                    total_deleted += r.deleted_count
            except Exception:
                pass

    # 5) Tokens push expo de ces utilisateurs
    try:
        await db.users.update_many({"id": {"$in": user_ids}}, {"$unset": {"push_token": ""}})
    except Exception:
        pass

    # 6) Enfin, supprimer les users
    print("\n👤 Suppression des comptes utilisateurs...")
    r = await db.users.delete_many({"email": {"$in": user_emails}, "is_super_admin": {"$ne": True}})
    print(f"  ✅ {r.deleted_count} compte(s) utilisateur supprimé(s)")

    print(f"\n🎉 Cleanup terminé. Total : {total_deleted} document(s) lié(s) + {r.deleted_count} compte(s).")
    print(f"   Le super admin {super_email} est conservé intact.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
