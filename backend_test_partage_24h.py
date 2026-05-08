#!/usr/bin/env python3
"""
Test : TTL 24h pour les demandes d'accès dossier médical (partage)
+ auto-cleanup des pending expirées.
"""
import os
import sys
import time
import json
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
PRO_PHONE = "+2250709005330"
PRO_PASSWORD = "474Treck"

MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"

results = []


def log(name, ok, detail=""):
    icon = "✅" if ok else "❌"
    line = f"{icon} {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    results.append((ok, name, detail))


def post(path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{BASE}{path}", headers=headers, json=body or {}, timeout=30)


def get(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE}{path}", headers=headers, timeout=30)


def main():
    # 1. SETUP : login Pro + Maman
    print("\n=== 1. SETUP ===")
    r = post("/auth/login", body={"phone": PRO_PHONE, "password": PRO_PASSWORD})
    if r.status_code != 200:
        log("Login Pro", False, f"HTTP {r.status_code} {r.text[:200]}")
        return False
    pro_data = r.json()
    pro_token = pro_data.get("token")
    pro_user = pro_data.get("user", {})
    log("Login Pro (Dr alpha via phone)", bool(pro_token),
        f"role={pro_user.get('role')} name={pro_user.get('name')}")

    r = post("/auth/login", body={"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD})
    if r.status_code != 200:
        log("Login Maman", False, f"HTTP {r.status_code} {r.text[:200]}")
        return False
    maman_data = r.json()
    maman_token = maman_data.get("token")
    maman_user = maman_data.get("user", {})
    log("Login Maman", bool(maman_token),
        f"role={maman_user.get('role')} id={maman_user.get('id')}")

    # 2. Récupérer le code de partage de la maman (CMU ou code provisoire)
    r = get("/auth/me/code-partage", token=maman_token)
    if r.status_code != 200:
        log("GET /auth/me/code-partage", False, f"HTTP {r.status_code} {r.text[:200]}")
        return False
    code_share = r.json()
    preferred = code_share.get("preferred")
    log("GET /auth/me/code-partage (Maman)", bool(preferred),
        f"cmu={code_share.get('cmu')} code_prov={code_share.get('code_provisoire')} preferred={preferred}")

    if not preferred:
        log("Code de partage disponible", False, "ni CMU ni code_provisoire")
        return False

    # 2b. Cleanup : marquer toutes les demandes pending existantes pour cette maman
    # comme refused (pour partir d'une base propre)
    cleanup_existing = []
    r = get("/partage/demandes-recues", token=maman_token)
    if r.status_code == 200:
        for d in r.json():
            if d.get("status") == "pending":
                cleanup_existing.append(d.get("id"))
    print(f"   (cleanup pré-test : {len(cleanup_existing)} pending existantes à refuser)")
    for did in cleanup_existing:
        post(f"/partage/demande/{did}/refuser", token=maman_token)

    # 3. PRO CRÉE UNE DEMANDE
    print("\n=== 3. PRO CRÉE LA DEMANDE D'ACCÈS ===")
    motif = "Suivi grossesse"
    r = post("/pro/patient/recherche", token=pro_token,
             body={"identifier": preferred, "motif": motif})
    if r.status_code != 200:
        log("POST /pro/patient/recherche", False, f"HTTP {r.status_code} {r.text[:300]}")
        return False
    body = r.json()
    demande_id = body.get("demande_id")
    log("POST /pro/patient/recherche", bool(demande_id),
        f"demande_id={demande_id} status={body.get('status')} patient_type={body.get('patient_type')}")

    if not demande_id:
        return False

    # 4. VÉRIFIER TTL 24h
    print("\n=== 4. VÉRIFIER TTL 24h ===")
    r = get("/partage/demandes-recues", token=maman_token)
    if r.status_code != 200:
        log("GET /partage/demandes-recues", False, f"HTTP {r.status_code} {r.text[:200]}")
        return False
    demandes = r.json()
    log("GET /partage/demandes-recues", isinstance(demandes, list),
        f"count={len(demandes) if isinstance(demandes, list) else 'NA'}")

    target = next((d for d in demandes if d.get("id") == demande_id), None)
    if not target:
        log("Demande retrouvée dans liste maman", False, "introuvable")
        return False
    log("Demande retrouvée dans liste maman", True,
        f"status={target.get('status')} pro_name={target.get('pro_name')}")

    created_at = target.get("created_at")
    expires_at = target.get("expires_at")
    if not (created_at and expires_at):
        log("Champs created_at + expires_at présents", False,
            f"created={created_at} expires={expires_at}")
        return False

    try:
        created = datetime.fromisoformat(created_at)
        expires = datetime.fromisoformat(expires_at)
    except Exception as e:
        log("Parse ISO created/expires", False, str(e))
        return False

    delta = expires - created
    delta_h = delta.total_seconds() / 3600.0
    # Doit être ≈ 24h (entre 23h59 et 24h01)
    in_range = 23.98 <= delta_h <= 24.02
    log("TTL ≈ 24h (vs ancien 15min)", in_range,
        f"delta={delta_h:.4f}h ({delta.total_seconds():.0f}s) — created={created_at} expires={expires_at}")

    # 5. VALIDATION
    print("\n=== 5. VALIDATION (status validated + access_token) ===")
    r = post(f"/partage/demande/{demande_id}/valider", token=maman_token)
    if r.status_code != 200:
        log("POST /partage/demande/{id}/valider", False, f"HTTP {r.status_code} {r.text[:200]}")
        return False
    val_body = r.json()
    log("POST /partage/demande/{id}/valider → 200", True,
        f"status={val_body.get('status')} expires_at={val_body.get('expires_at')}")
    log("Réponse status='validated'", val_body.get("status") == "validated",
        f"got={val_body.get('status')}")

    # Vérifier dans GET /partage/demandes-recues que access_token est présent
    r = get("/partage/demandes-recues", token=maman_token)
    after = next((d for d in r.json() if d.get("id") == demande_id), None)
    has_token = bool(after and after.get("access_token"))
    log("access_token généré (dans demandes-recues)", has_token,
        f"token_len={len(after.get('access_token') or '') if after else 'NA'}")
    log("status='validated' persisté en DB", after and after.get("status") == "validated",
        f"status_db={after.get('status') if after else 'NA'}")

    # Validation idempotence : tenter de re-valider → 400
    r = post(f"/partage/demande/{demande_id}/valider", token=maman_token)
    log("Re-validation déjà validée → 400", r.status_code == 400,
        f"HTTP {r.status_code} body={r.text[:120]}")

    # 6. AUTO-CLEANUP : créer une nouvelle demande, antidater expires_at via mongo, vérifier auto-cleanup
    print("\n=== 6. AUTO-CLEANUP DES PENDING EXPIRÉES ===")
    r = post("/pro/patient/recherche", token=pro_token,
             body={"identifier": preferred, "motif": "Test cleanup"})
    if r.status_code != 200:
        log("Création 2e demande pour test cleanup", False, f"HTTP {r.status_code}")
    else:
        cleanup_demande_id = r.json().get("demande_id")
        log("Création 2e demande pour test cleanup", True, f"id={cleanup_demande_id}")

        # Manipulation directe mongo : passer expires_at à 1h dans le passé
        try:
            mc = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
            db = mc[DB_NAME]
            past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            res = db.access_requests.update_one(
                {"id": cleanup_demande_id},
                {"$set": {"expires_at": past_iso}}
            )
            log("Mongo : antidate expires_at de cleanup_demande", res.modified_count == 1,
                f"modified={res.modified_count} new_expires={past_iso}")
            mc.close()
        except Exception as e:
            log("Mongo direct manipulation", False, str(e))
            cleanup_demande_id = None

        if cleanup_demande_id:
            # Maintenant GET /partage/demandes-recues doit auto-cleanup vers 'expired'
            r = get("/partage/demandes-recues", token=maman_token)
            after = next((d for d in r.json() if d.get("id") == cleanup_demande_id), None)
            is_expired = after and after.get("status") == "expired"
            log("Auto-cleanup → status='expired' après GET /demandes-recues",
                is_expired, f"status={after.get('status') if after else 'NA'} expired_at={after.get('expired_at') if after else None}")

    # 7. REFUSER FLOW
    print("\n=== 7. REFUSER FLOW ===")
    r = post("/pro/patient/recherche", token=pro_token,
             body={"identifier": preferred, "motif": "Test refus"})
    if r.status_code != 200:
        log("Création demande pour test refus", False, f"HTTP {r.status_code}")
    else:
        refus_id = r.json().get("demande_id")
        log("Création 3e demande pour test refus", True, f"id={refus_id}")

        r = post(f"/partage/demande/{refus_id}/refuser", token=maman_token)
        log("POST /partage/demande/{id}/refuser → 200", r.status_code == 200,
            f"HTTP {r.status_code} body={r.text[:120]}")
        if r.status_code == 200:
            body = r.json()
            log("Réponse status='refused'", body.get("status") == "refused",
                f"got={body.get('status')}")
            r2 = get("/partage/demandes-recues", token=maman_token)
            after = next((d for d in r2.json() if d.get("id") == refus_id), None)
            log("status='refused' persisté en DB", after and after.get("status") == "refused",
                f"status_db={after.get('status') if after else 'NA'}")

    # 8. RÉGRESSION : autres endpoints partage
    print("\n=== 8. RÉGRESSION ===")
    r = get("/auth/me/code-partage", token=maman_token)
    log("GET /auth/me/code-partage (régression)", r.status_code == 200,
        f"HTTP {r.status_code}")

    # GET /enfants (utilisé indirectement)
    r = get("/enfants", token=maman_token)
    log("GET /enfants (régression)", r.status_code == 200, f"HTTP {r.status_code}")

    # 9. VERIFICATION VIA MONGO QUE TTL = 24h SUR DOC PERSISTÉ
    print("\n=== 9. VÉRIFICATION DIRECTE MONGO (TTL 24h persisté) ===")
    try:
        mc = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
        db = mc[DB_NAME]
        doc = db.access_requests.find_one({"id": demande_id})
        if doc:
            c = datetime.fromisoformat(doc["created_at"])
            e = datetime.fromisoformat(doc["expires_at"])
            d_h = (e - c).total_seconds() / 3600.0
            log("Mongo direct : delta(expires-created) ≈ 24h", 23.98 <= d_h <= 24.02,
                f"delta={d_h:.4f}h")
        mc.close()
    except Exception as ex:
        log("Mongo verification", False, str(ex))

    # 10. CLEANUP : refuser toutes les pending restantes créées pendant le test
    print("\n=== 10. CLEANUP ===")
    r = get("/partage/demandes-recues", token=maman_token)
    if r.status_code == 200:
        for d in r.json():
            if d.get("status") == "pending" and d.get("pro_id") == pro_user.get("id"):
                post(f"/partage/demande/{d.get('id')}/refuser", token=maman_token)
        log("Cleanup pending restantes", True, "OK")

    # SUMMARY
    print("\n" + "=" * 70)
    passed = sum(1 for ok, _, _ in results if ok)
    total = len(results)
    print(f"📊 RÉSULTAT GLOBAL : {passed}/{total} PASS")
    if passed < total:
        print("\n❌ ÉCHECS :")
        for ok, name, detail in results:
            if not ok:
                print(f"  - {name} — {detail}")
    return passed == total


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
