"""
Phase 3 — AES-256-GCM at-rest encryption backend tests for À lo Maman.
Covers: CMU, enfant, tele-echo, consultation notes round-trip (API clear vs DB encrypted),
legacy plaintext fallback, RDV CMU pricing regression, admin stats, encryption key persistence,
and smoke regression on rest of API.
"""
import os
import re
import sys
import base64
import uuid
import json
import time
from datetime import datetime, timezone

import requests
from pymongo import MongoClient
from dotenv import dotenv_values

# ---- Config ----
FRONT_ENV = dotenv_values("/app/frontend/.env")
BACK_ENV = dotenv_values("/app/backend/.env")
BASE = (FRONT_ENV.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/") + "/api"
MONGO_URL = BACK_ENV.get("MONGO_URL") or os.getenv("MONGO_URL")
DB_NAME = BACK_ENV.get("DB_NAME") or os.getenv("DB_NAME") or "alomaman"
ENC_PREFIX = "enc_v1:"

assert BASE.startswith("http"), f"Bad BASE: {BASE}"
print(f"[cfg] BASE={BASE}")
print(f"[cfg] DB_NAME={DB_NAME}")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]

# ---- Test state ----
results = []  # list[(case_id, name, passed, detail)]

def record(case, name, passed, detail=""):
    results.append((case, name, passed, detail))
    tag = "PASS" if passed else "FAIL"
    print(f"[{tag}] {case} :: {name}  {('- ' + detail) if detail else ''}")

def expect(case, name, cond, detail=""):
    record(case, name, bool(cond), detail)
    return bool(cond)

# ---- HTTP helpers ----
sess = requests.Session()

def login(email, password):
    r = sess.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]

def req(method, path, token=None, **kw):
    headers = kw.pop("headers", {}) or {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return sess.request(method, f"{BASE}{path}", headers=headers, timeout=60, **kw)


# ====================================================================
# CASE 7 — Encryption key persistence
# ====================================================================
def case7_encryption_key():
    try:
        with open("/app/backend/.env", "r") as f:
            content = f.read()
        lines = [l for l in content.splitlines() if l.strip().startswith("ENCRYPTION_KEY")]
        expect("7", "ENCRYPTION_KEY count == 1", len(lines) == 1, f"found {len(lines)} entries")
        m = re.search(r'ENCRYPTION_KEY\s*=\s*["\']?([^"\'\s]+)', content)
        expect("7", "ENCRYPTION_KEY present", bool(m))
        if m:
            val = m.group(1)
            try:
                raw = base64.urlsafe_b64decode(val + "==")
                expect("7", "ENCRYPTION_KEY decodes to 32 bytes", len(raw) == 32, f"len={len(raw)}")
            except Exception as e:
                expect("7", "ENCRYPTION_KEY valid b64url", False, str(e))
    except Exception as e:
        expect("7", "Read .env", False, str(e))


# ====================================================================
# CASE 1 — CMU encryption round-trip (maman)
# ====================================================================
def case1_cmu(maman_token, maman_user):
    # Ensure clean state
    req("DELETE", "/cmu/me", token=maman_token)
    payload = {
        "numero": "0102030405",
        "nom_complet": "Aminata Koné",
        "date_delivrance": "2024-01-15",
        "date_validite": "2099-01-15",
        "beneficiaires": [
            {"nom": "Bébé Test", "numero_cmu": "0102030406", "relation": "enfant"}
        ],
    }
    r = req("POST", "/cmu/me", token=maman_token, json=payload)
    ok = expect("1", "POST /cmu/me 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if not ok:
        return
    data = r.json()
    cmu = data.get("cmu") or {}
    expect("1", "POST response cmu.numero clear", cmu.get("numero") == "0102030405", f"got={cmu.get('numero')}")
    expect("1", "POST response cmu.nom_complet clear", cmu.get("nom_complet") == "Aminata Koné", f"got={cmu.get('nom_complet')}")
    benefs = cmu.get("beneficiaires") or []
    expect("1", "POST response beneficiaires[0].numero_cmu clear",
           len(benefs) == 1 and benefs[0].get("numero_cmu") == "0102030406",
           f"benefs={benefs}")
    expect("1", "POST response beneficiaires[0].nom clear",
           len(benefs) == 1 and benefs[0].get("nom") == "Bébé Test",
           f"benefs={benefs}")
    expect("1", "POST statut == actif", data.get("statut") == "actif", f"statut={data.get('statut')}")

    # GET /cmu/me
    r = req("GET", "/cmu/me", token=maman_token)
    expect("1", "GET /cmu/me 200", r.status_code == 200)
    if r.status_code == 200:
        gc = r.json().get("cmu") or {}
        expect("1", "GET cmu.numero clear", gc.get("numero") == "0102030405", f"got={gc.get('numero')}")
        expect("1", "GET cmu.nom_complet clear", gc.get("nom_complet") == "Aminata Koné")
        gb = gc.get("beneficiaires") or []
        expect("1", "GET beneficiaires[0].numero_cmu clear",
               len(gb) == 1 and gb[0].get("numero_cmu") == "0102030406")
        expect("1", "GET statut == actif", r.json().get("statut") == "actif")

    # DB direct check
    udoc = db.users.find_one({"email": "maman@test.com"})
    if not udoc:
        expect("1", "DB maman doc present", False, "not found")
        return
    dbcmu = udoc.get("cmu") or {}
    expect("1", "DB cmu.numero is encrypted (enc_v1:)",
           isinstance(dbcmu.get("numero"), str) and dbcmu["numero"].startswith(ENC_PREFIX) and dbcmu["numero"] != "0102030405",
           f"value={dbcmu.get('numero')[:30] if dbcmu.get('numero') else None}")
    expect("1", "DB cmu.nom_complet is encrypted",
           isinstance(dbcmu.get("nom_complet"), str) and dbcmu["nom_complet"].startswith(ENC_PREFIX))
    db_benefs = dbcmu.get("beneficiaires") or []
    expect("1", "DB beneficiaires[0].numero_cmu encrypted",
           len(db_benefs) == 1 and isinstance(db_benefs[0].get("numero_cmu"), str) and db_benefs[0]["numero_cmu"].startswith(ENC_PREFIX))
    expect("1", "DB beneficiaires[0].nom encrypted",
           len(db_benefs) == 1 and isinstance(db_benefs[0].get("nom"), str) and db_benefs[0]["nom"].startswith(ENC_PREFIX))
    nh = dbcmu.get("numero_hash")
    expect("1", "DB cmu.numero_hash present (16 hex chars)",
           isinstance(nh, str) and len(nh) == 16 and all(c in "0123456789abcdef" for c in nh),
           f"hash={nh}")
    expect("1", "DB cmu.date_validite stored clear",
           dbcmu.get("date_validite") == "2099-01-15", f"got={dbcmu.get('date_validite')}")


# ====================================================================
# CASE 2 — Enfant encryption round-trip (maman)
# ====================================================================
def case2_enfant(maman_token):
    payload = {
        "nom": "Enfant AES Test",
        "date_naissance": "2025-01-01",
        "sexe": "F",
        "numero_cmu": "0102030407",
        "allergies": ["arachides", "lait"],
        "groupe_sanguin": "A+",
    }
    r = req("POST", "/enfants", token=maman_token, json=payload)
    ok = expect("2", "POST /enfants 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if not ok:
        return None
    ent = r.json()
    eid = ent.get("id")
    expect("2", "POST enfant response numero_cmu clear", ent.get("numero_cmu") == "0102030407", f"got={ent.get('numero_cmu')}")
    expect("2", "POST enfant response allergies clear",
           ent.get("allergies") == ["arachides", "lait"], f"got={ent.get('allergies')}")
    expect("2", "POST enfant response groupe_sanguin clear",
           ent.get("groupe_sanguin") == "A+", f"got={ent.get('groupe_sanguin')}")

    # GET list
    r = req("GET", "/enfants", token=maman_token)
    expect("2", "GET /enfants 200", r.status_code == 200)
    if r.status_code == 200:
        match = next((e for e in r.json() if e.get("id") == eid), None)
        expect("2", "GET /enfants contains new enfant", match is not None)
        if match:
            expect("2", "GET /enfants numero_cmu clear", match.get("numero_cmu") == "0102030407")
            expect("2", "GET /enfants allergies clear", match.get("allergies") == ["arachides", "lait"])

    # GET croissance-oms
    r = req("GET", f"/enfants/{eid}/croissance-oms", token=maman_token)
    expect("2", "GET croissance-oms 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        expect("2", "GET croissance-oms enfant.numero_cmu clear",
               (data.get("enfant") or {}).get("numero_cmu") == "0102030407",
               f"got={data.get('enfant')}")

    # PATCH numero_cmu — NOTE: PATCH endpoint uses EnfantIn (required fields),
    # so we must include nom/date_naissance/sexe to pass Pydantic validation.
    r = req("PATCH", f"/enfants/{eid}", token=maman_token, json={
        "nom": "Enfant AES Test",
        "date_naissance": "2025-01-01",
        "sexe": "F",
        "numero_cmu": "0102030408",
    })
    expect("2", "PATCH /enfants 200", r.status_code == 200, f"body={r.text[:200]}")
    if r.status_code == 200:
        patched = r.json()
        expect("2", "PATCH response numero_cmu clear and updated",
               patched.get("numero_cmu") == "0102030408", f"got={patched.get('numero_cmu')}")

    # DB direct check
    dbe = db.enfants.find_one({"id": eid})
    if not dbe:
        expect("2", "DB enfant doc present", False)
        return eid
    expect("2", "DB enfant numero_cmu encrypted (enc_v1:) not plaintext",
           isinstance(dbe.get("numero_cmu"), str) and dbe["numero_cmu"].startswith(ENC_PREFIX) and dbe["numero_cmu"] != "0102030408",
           f"got={str(dbe.get('numero_cmu'))[:30]}")
    alls = dbe.get("allergies") or []
    expect("2", "DB enfant allergies[0] encrypted",
           len(alls) == 2 and isinstance(alls[0], str) and alls[0].startswith(ENC_PREFIX),
           f"got={alls[:1]}")
    expect("2", "DB enfant groupe_sanguin stored clear",
           dbe.get("groupe_sanguin") == "A+", f"got={dbe.get('groupe_sanguin')}")
    return eid


# ====================================================================
# CASE 3 — Tele-echo encryption round-trip
# ====================================================================
def case3_tele_echo(maman_token, pro_token, pro_user):
    # Find an rdv with this pro
    r = req("GET", "/rdv", token=pro_token)
    rdv_id = None
    if r.status_code == 200:
        for rd in r.json():
            if rd.get("pro_id") == pro_user["id"]:
                rdv_id = rd.get("id")
                break
    if not rdv_id:
        # Create one as maman
        # future date
        future_date = "2026-08-20T10:00"
        r = req("POST", "/rdv", token=maman_token, json={
            "pro_id": pro_user["id"], "date": future_date, "motif": "Echo test Phase3"
        })
        if r.status_code == 200:
            rdv_id = r.json().get("id")
    expect("3", "RDV id available for tele-echo", rdv_id is not None)
    if not rdv_id:
        return None

    img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    conclusion = "Grossesse évolutive normale à 22 semaines"
    commentaires = "RAS"
    payload = {
        "rdv_id": rdv_id,
        "image_base64": img,
        "conclusion": conclusion,
        "commentaires_medicaux": commentaires,
        "bpd_mm": 55.2,
        "poids_estime_g": 1850,
    }
    r = req("POST", "/tele-echo", token=pro_token, json=payload)
    ok = expect("3", "POST /tele-echo 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if not ok:
        return None
    te = r.json()
    echo_id = te.get("id")
    expect("3", "POST response image_base64 clear", te.get("image_base64") == img)
    expect("3", "POST response conclusion clear", te.get("conclusion") == conclusion)
    expect("3", "POST response commentaires_medicaux clear", te.get("commentaires_medicaux") == commentaires)
    expect("3", "POST response bpd_mm clear numeric", te.get("bpd_mm") == 55.2)

    # GET /tele-echo as pro
    r = req("GET", "/tele-echo", token=pro_token)
    if r.status_code == 200:
        m = next((e for e in r.json() if e.get("id") == echo_id), None)
        expect("3", "GET tele-echo (pro) contains new echo", m is not None)
        if m:
            expect("3", "GET tele-echo (pro) image clear", m.get("image_base64") == img)
            expect("3", "GET tele-echo (pro) conclusion clear", m.get("conclusion") == conclusion)
            expect("3", "GET tele-echo (pro) commentaires clear", m.get("commentaires_medicaux") == commentaires)

    # GET /tele-echo as maman
    r = req("GET", "/tele-echo", token=maman_token)
    if r.status_code == 200:
        m = next((e for e in r.json() if e.get("id") == echo_id), None)
        expect("3", "GET tele-echo (maman) contains new echo", m is not None)
        if m:
            expect("3", "GET tele-echo (maman) image clear", m.get("image_base64") == img)
            expect("3", "GET tele-echo (maman) conclusion clear", m.get("conclusion") == conclusion)

    # GET /tele-echo/rdv/{rdv_id}
    r = req("GET", f"/tele-echo/rdv/{rdv_id}", token=pro_token)
    expect("3", "GET /tele-echo/rdv/{id} 200", r.status_code == 200)
    if r.status_code == 200 and r.json():
        m = r.json()[0]
        expect("3", "GET /tele-echo/rdv image clear", m.get("image_base64") == img)
        expect("3", "GET /tele-echo/rdv conclusion clear", m.get("conclusion") == conclusion)

    # DB direct check
    dbe = db.tele_echo.find_one({"id": echo_id})
    if not dbe:
        expect("3", "DB tele_echo doc present", False)
        return echo_id
    expect("3", "DB tele_echo image_base64 encrypted",
           isinstance(dbe.get("image_base64"), str) and dbe["image_base64"].startswith(ENC_PREFIX))
    expect("3", "DB tele_echo conclusion encrypted",
           isinstance(dbe.get("conclusion"), str) and dbe["conclusion"].startswith(ENC_PREFIX))
    expect("3", "DB tele_echo commentaires_medicaux encrypted",
           isinstance(dbe.get("commentaires_medicaux"), str) and dbe["commentaires_medicaux"].startswith(ENC_PREFIX))
    expect("3", "DB tele_echo bpd_mm numeric clear", dbe.get("bpd_mm") == 55.2)
    expect("3", "DB tele_echo rdv_id clear", dbe.get("rdv_id") == rdv_id)
    return echo_id


# ====================================================================
# CASE 4 — Consultation notes encryption
# ====================================================================
def case4_consult_notes(pro_token, maman_user):
    payload = {
        "patient_id": maman_user["id"],
        "diagnostic": "Anémie ferriprive légère",
        "traitement": "Tardyferon 1/j",
        "notes": "À revoir dans 4 semaines",
    }
    r = req("POST", "/pro/consultation-notes", token=pro_token, json=payload)
    ok = expect("4", "POST /pro/consultation-notes 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if not ok:
        return None
    nd = r.json()
    note_id = nd.get("id")
    expect("4", "POST note diagnostic clear", nd.get("diagnostic") == "Anémie ferriprive légère")
    expect("4", "POST note traitement clear", nd.get("traitement") == "Tardyferon 1/j")
    expect("4", "POST note notes clear", nd.get("notes") == "À revoir dans 4 semaines")

    # GET dossier
    r = req("GET", f"/pro/dossier/{maman_user['id']}", token=pro_token)
    expect("4", "GET /pro/dossier/{id} 200", r.status_code == 200, f"body={r.text[:200]}")
    if r.status_code == 200:
        notes = r.json().get("notes") or []
        m = next((n for n in notes if n.get("id") == note_id), None)
        expect("4", "GET dossier contains the new note", m is not None)
        if m:
            expect("4", "GET dossier note diagnostic clear", m.get("diagnostic") == "Anémie ferriprive légère")
            expect("4", "GET dossier note traitement clear", m.get("traitement") == "Tardyferon 1/j")
            expect("4", "GET dossier note notes clear", m.get("notes") == "À revoir dans 4 semaines")

    # DB check
    dbn = db.consultation_notes.find_one({"id": note_id})
    if not dbn:
        expect("4", "DB consultation_notes doc present", False)
        return note_id
    expect("4", "DB note diagnostic encrypted",
           isinstance(dbn.get("diagnostic"), str) and dbn["diagnostic"].startswith(ENC_PREFIX))
    expect("4", "DB note traitement encrypted",
           isinstance(dbn.get("traitement"), str) and dbn["traitement"].startswith(ENC_PREFIX))
    expect("4", "DB note notes encrypted",
           isinstance(dbn.get("notes"), str) and dbn["notes"].startswith(ENC_PREFIX))
    return note_id


# ====================================================================
# CASE 5 — CMU pricing logic after encryption
# ====================================================================
def case5_cmu_pricing(maman_token, pro_token, pro_user):
    # Pro activates accepte_cmu=true
    r = req("PATCH", "/pro/cmu", token=pro_token, json={"accepte_cmu": True})
    expect("5", "PATCH /pro/cmu accepte_cmu=true", r.status_code == 200, f"body={r.text[:200]}")

    # Create a prestation with CMU
    r = req("POST", "/pro/prestations", token=pro_token, json={
        "nom": "Consultation CMU Phase3", "prix_fcfa": 10000, "duree_min": 30,
        "active": True, "cmu_prise_en_charge": True, "cmu_taux": 0.70,
    })
    ok = expect("5", "POST /pro/prestations 200", r.status_code == 200, f"body={r.text[:200]}")
    if not ok:
        return None, None
    prest_id = r.json().get("id")

    # Maman POST /rdv with this prestation
    r = req("POST", "/rdv", token=maman_token, json={
        "pro_id": pro_user["id"],
        "date": "2026-09-10T10:00",
        "motif": "Consultation CMU Phase3",
        "prestation_id": prest_id,
    })
    ok = expect("5", "POST /rdv (CMU) 200", r.status_code == 200, f"body={r.text[:300]}")
    if not ok:
        return prest_id, None
    rdv = r.json()
    rdv_id = rdv.get("id")
    expect("5", "RDV cmu_applique=True", rdv.get("cmu_applique") is True, f"rdv={rdv}")
    expect("5", "RDV cmu_numero == 0102030405 (decrypted from maman cmu)",
           rdv.get("cmu_numero") == "0102030405", f"got={rdv.get('cmu_numero')}")
    expect("5", "RDV cmu_taux == 0.70", rdv.get("cmu_taux") == 0.70)
    expect("5", "RDV cmu_montant_fcfa == 7000", rdv.get("cmu_montant_fcfa") == 7000)
    expect("5", "RDV reste_a_charge_fcfa == 3000", rdv.get("reste_a_charge_fcfa") == 3000)

    # GET /pro/facturation-cmu
    r = req("GET", "/pro/facturation-cmu", token=pro_token)
    expect("5", "GET /pro/facturation-cmu 200", r.status_code == 200, f"body={r.text[:300]}")
    if r.status_code == 200:
        data = r.json()
        my_rdv = next((x for x in (data.get("rdvs") or []) if x.get("id") == rdv_id), None)
        expect("5", "facturation-cmu contains new rdv", my_rdv is not None)
        if my_rdv:
            # NOTE: the spec says rdvs[].numero_cmu should be '0102030405' (clear).
            # But /pro/facturation-cmu enriches from users.cmu.numero which is now encrypted!
            # This is a likely BUG to report.
            expect("5", "facturation-cmu rdvs[].numero_cmu == '0102030405' (clear)",
                   my_rdv.get("numero_cmu") == "0102030405",
                   f"got={my_rdv.get('numero_cmu')}")
    return prest_id, rdv_id


# ====================================================================
# CASE 6 — Legacy plaintext data fallback
# ====================================================================
def case6_legacy(maman_token, maman_user):
    legacy_id = "legacy-phase3-test"
    now = datetime.now(timezone.utc).isoformat()
    # Cleanup any stale
    db.enfants.delete_one({"id": legacy_id})
    db.enfants.insert_one({
        "id": legacy_id,
        "user_id": maman_user["id"],
        "nom": "Legacy Enfant",
        "date_naissance": "2024-01-01",
        "sexe": "M",
        "numero_cmu": "LEGACY123",
        "allergies": ["legacy_plaintext"],
        "created_at": now,
    })
    r = req("GET", "/enfants", token=maman_token)
    expect("6", "GET /enfants 200", r.status_code == 200)
    if r.status_code == 200:
        m = next((e for e in r.json() if e.get("id") == legacy_id), None)
        expect("6", "Legacy enfant returned", m is not None)
        if m:
            expect("6", "Legacy numero_cmu returned as-is (LEGACY123)",
                   m.get("numero_cmu") == "LEGACY123", f"got={m.get('numero_cmu')}")
            expect("6", "Legacy allergies returned as-is",
                   m.get("allergies") == ["legacy_plaintext"], f"got={m.get('allergies')}")
    # Cleanup
    db.enfants.delete_one({"id": legacy_id})


# ====================================================================
# CASE 8 — Regression smoke
# ====================================================================
def case8_regression(tokens):
    for role, tok in tokens.items():
        r = req("GET", "/auth/me", token=tok)
        expect("8", f"GET /auth/me [{role}] 200", r.status_code == 200, f"status={r.status_code}")

    # resources
    r = req("GET", "/resources", token=tokens["maman"])
    expect("8", "GET /resources 200", r.status_code == 200 and isinstance(r.json(), list))
    # professionnels
    r = req("GET", "/professionnels", token=tokens["maman"])
    expect("8", "GET /professionnels 200", r.status_code == 200 and isinstance(r.json(), list))
    # rdv
    r = req("GET", "/rdv", token=tokens["maman"])
    expect("8", "GET /rdv 200 (maman)", r.status_code == 200)
    # enfants/{id}/croissance-oms — need an existing enfant
    r = req("GET", "/enfants", token=tokens["maman"])
    if r.status_code == 200 and r.json():
        eid = r.json()[0]["id"]
        r2 = req("GET", f"/enfants/{eid}/croissance-oms", token=tokens["maman"])
        expect("8", "GET /enfants/{id}/croissance-oms 200", r2.status_code == 200)
    # admin CMU stats
    admin_token, _ = login("klenakan.eric@gmail.com", "474Treckadzo$1986")
    r = req("GET", "/admin/cmu/stats", token=admin_token)
    ok = expect("8", "GET /admin/cmu/stats 200", r.status_code == 200, f"body={r.text[:200]}")
    if ok:
        data = r.json()
        for k in ["total_mamans", "mamans_avec_cmu", "total_pros", "pros_acceptant_cmu"]:
            expect("8", f"/admin/cmu/stats has key {k}", k in data, f"keys={list(data.keys())}")
        expect("8", "/admin/cmu/stats mamans_avec_cmu >= 1 (post-encryption count still works)",
               (data.get("mamans_avec_cmu") or 0) >= 1, f"mamans_avec_cmu={data.get('mamans_avec_cmu')}")


# ====================================================================
# Cleanup helpers
# ====================================================================
def cleanup(maman_token, pro_token, enfant_id, echo_id, note_id, prest_id, rdv_id, pro_user):
    # Reset pro accepte_cmu
    try:
        req("PATCH", "/pro/cmu", token=pro_token, json={"accepte_cmu": False})
    except Exception:
        pass
    # Maman CMU
    try:
        req("DELETE", "/cmu/me", token=maman_token)
    except Exception:
        pass
    # Delete test enfant
    if enfant_id:
        try:
            req("DELETE", f"/enfants/{enfant_id}", token=maman_token)
        except Exception:
            pass
        db.enfants.delete_one({"id": enfant_id})
    # Delete tele-echo
    if echo_id:
        db.tele_echo.delete_one({"id": echo_id})
    # Delete note
    if note_id:
        db.consultation_notes.delete_one({"id": note_id})
    # Delete prestation + test rdv
    if prest_id:
        try:
            req("DELETE", f"/pro/prestations/{prest_id}", token=pro_token)
        except Exception:
            pass
        db.prestations.delete_one({"id": prest_id})
    if rdv_id:
        db.rdv.delete_one({"id": rdv_id})


# ====================================================================
# Main
# ====================================================================
def main():
    print("=" * 80)
    print("Phase 3 — AES-256-GCM at-rest encryption backend tests")
    print("=" * 80)

    case7_encryption_key()

    maman_token, maman_user = login("maman@test.com", "Maman123!")
    pro_token, pro_user = login("pro@test.com", "Pro123!")
    centre_token, _ = login("centre1@test.com", "Centre123!")
    famille_token, _ = login("papa1@test.com", "Papa123!")

    case1_cmu(maman_token, maman_user)
    enfant_id = case2_enfant(maman_token)
    echo_id = case3_tele_echo(maman_token, pro_token, pro_user)
    note_id = case4_consult_notes(pro_token, maman_user)
    prest_id, rdv_id = case5_cmu_pricing(maman_token, pro_token, pro_user)
    case6_legacy(maman_token, maman_user)
    case8_regression({
        "maman": maman_token, "pro": pro_token,
        "centre": centre_token, "famille": famille_token,
    })

    # Cleanup
    cleanup(maman_token, pro_token, enfant_id, echo_id, note_id, prest_id, rdv_id, pro_user)

    print("=" * 80)
    total = len(results)
    passed = sum(1 for x in results if x[2])
    failed = total - passed
    print(f"RESULTS: {passed}/{total} PASS ; {failed} FAIL")
    if failed:
        print("\nFailed tests:")
        for case, name, ok, det in results:
            if not ok:
                print(f"  ❌ [{case}] {name} :: {det}")
    print("=" * 80)
    return failed


if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
