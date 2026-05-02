"""
Backend test — Upgraded GET /api/pro/patient/{patient_id}/carnet
Scenarios from the review request (2026-04-29):
  1. Maman dossier with `grossesse` info
  2. Drill-down to enfant via `?via_parent={maman_id}` using maman's token
  3. Security: child not belonging to that maman → 403
  4. Security: no via_parent + child id with maman token → 403
  5. Security: token expired → 403 (also with via_parent)
  6. Audit log written with `via_parent` field
  7. Backward compat: token granted directly for enfant_id (no via_parent) and for maman_id (no via_parent)

NOTE: review wording mentions POST /api/pro/demandes & /api/maman/demandes/{id}/validate.
These endpoints DO NOT EXIST in /app/backend/server.py. The actual flow is:
  POST /api/pro/patient/recherche  (creates the demande)
  POST /api/partage/demande/{id}/valider (maman validates)
  GET  /api/pro/demandes/mes-demandes (pro retrieves access_token)
"""
import os
import sys
import time
import secrets
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("BACKEND_URL", "https://cycle-tracker-pro.preview.emergentagent.com") + "/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASS = "Test1234!"

passes, fails = [], []


def ok(label):
    print(f"  ✅ {label}")
    passes.append(label)


def fail(label, info=""):
    print(f"  ❌ {label} -- {info}")
    fails.append((label, info))


def hdr(t):
    print(f"\n=== {t} ===")


def login(email, pwd):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


def register(email, password, name, role="maman", phone=None):
    body = {
        "email": email,
        "password": password,
        "name": name,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    if phone:
        body["phone"] = phone
    r = requests.post(f"{BASE_URL}/auth/register", json=body, timeout=15)
    if r.status_code != 200:
        # try login if already exists
        try:
            return login(email, password)
        except Exception as e:
            raise RuntimeError(f"Register {email} failed: {r.status_code} {r.text} || login also failed: {e}")
    return r.json()["token"], r.json()["user"]


def main():
    # ---------- 1) login maman & pro ----------
    hdr("LOGIN")
    try:
        m_token, m_user = login(MAMAN_EMAIL, MAMAN_PASS)
        ok(f"Login maman → id={m_user['id']}")
    except Exception as e:
        fail("Login maman", str(e)); return
    try:
        p_token, p_user = login(PRO_EMAIL, PRO_PASS)
        ok(f"Login pro → id={p_user['id']}")
    except Exception as e:
        fail("Login pro", str(e)); return

    maman_id = m_user["id"]
    pro_id = p_user["id"]

    # ---------- 2) ensure maman has a grossesse ----------
    hdr("PRE-SETUP: grossesse for maman")
    body = {
        "date_debut": "2025-12-01",
        "date_terme": "2026-09-08",
        "symptomes": [],
        "notes": f"Test grossesse {datetime.now(timezone.utc).isoformat()}",
    }
    r = requests.post(f"{BASE_URL}/grossesse", json=body, headers=auth_h(m_token), timeout=15)
    if r.status_code == 200:
        ok(f"POST /grossesse OK id={r.json().get('id')}")
        grossesse_doc = r.json()
    else:
        fail("POST /grossesse", f"{r.status_code} {r.text[:200]}"); return

    # ---------- 3) ensure maman has at least 1 child ----------
    hdr("PRE-SETUP: enfants for maman")
    r = requests.get(f"{BASE_URL}/enfants", headers=auth_h(m_token), timeout=15)
    enfants = r.json() if r.status_code == 200 else []
    child_id = None
    if enfants:
        child_id = enfants[0]["id"]
        ok(f"Maman has {len(enfants)} enfant(s) — using {child_id}")
    else:
        body = {
            "nom": "Petit Test Enfant",
            "date_naissance": "2024-06-15",
            "sexe": "F",
            "poids_kg": 10.5,
            "taille_cm": 75,
        }
        r = requests.post(f"{BASE_URL}/enfants", json=body, headers=auth_h(m_token), timeout=15)
        if r.status_code != 200:
            fail("Create child for maman", f"{r.status_code} {r.text[:200]}"); return
        child_id = r.json()["id"]
        ok(f"Created child {child_id}")

    # ---------- 4) pro creates an access request for the maman ----------
    hdr("CREATE ACCESS REQUEST (pro → maman)")
    # Use the AM code provisoire to avoid CMU dependency
    r = requests.get(f"{BASE_URL}/auth/me/code-partage", headers=auth_h(m_token), timeout=15)
    if r.status_code != 200:
        fail("GET /auth/me/code-partage", f"{r.status_code} {r.text[:200]}"); return
    sharing = r.json()
    am_code = sharing.get("code_provisoire") or sharing.get("preferred")
    ok(f"Maman code partage = {am_code}")

    r = requests.post(
        f"{BASE_URL}/pro/patient/recherche",
        json={"identifier": am_code, "motif": "Suivi grossesse trimestre 2"},
        headers=auth_h(p_token),
        timeout=15,
    )
    if r.status_code != 200:
        fail("POST /pro/patient/recherche", f"{r.status_code} {r.text[:200]}"); return
    recherche_resp = r.json()
    demande_id = recherche_resp.get("demande_id")
    ok(f"Demande créée id={demande_id} status={recherche_resp.get('status')}")

    # ---------- 5) maman validates ----------
    hdr("MAMAN VALIDATES")
    r = requests.post(
        f"{BASE_URL}/partage/demande/{demande_id}/valider",
        headers=auth_h(m_token),
        timeout=15,
    )
    if r.status_code != 200:
        fail("POST /partage/demande/{id}/valider", f"{r.status_code} {r.text[:200]}"); return
    ok(f"Demande validated, expires_at={r.json().get('expires_at')}")

    # ---------- 6) pro retrieves access_token ----------
    hdr("PRO RETRIEVES TOKEN")
    r = requests.get(f"{BASE_URL}/pro/demandes/mes-demandes", headers=auth_h(p_token), timeout=15)
    if r.status_code != 200:
        fail("GET /pro/demandes/mes-demandes", f"{r.status_code} {r.text[:200]}"); return
    demandes = r.json()
    target = next((d for d in demandes if d.get("id") == demande_id), None)
    if not target:
        fail("Find target demande in /pro/demandes/mes-demandes"); return
    access_token = target.get("access_token")
    if not access_token:
        fail("access_token absent from validated demande"); return
    ok(f"Pro got access_token (len={len(access_token)}), patient_type={target.get('patient_type')}")

    headers_pro = auth_h(p_token) | {"X-Access-Token": access_token}

    # ============================================================
    # SCENARIO 1: Maman dossier with grossesse info
    # ============================================================
    hdr("SCENARIO 1 — GET /pro/patient/{maman_id}/carnet (maman dossier with grossesse)")
    r = requests.get(f"{BASE_URL}/pro/patient/{maman_id}/carnet", headers=headers_pro, timeout=15)
    if r.status_code != 200:
        fail("Carnet maman 200", f"{r.status_code} {r.text[:300]}")
    else:
        ok("HTTP 200")
        body = r.json()
        if body.get("type") == "maman":
            ok("response.type == 'maman'")
        else:
            fail("response.type", f"got {body.get('type')}")
        if isinstance(body.get("maman"), dict) and body["maman"].get("id") == maman_id:
            ok("response.maman is dict with correct id")
        else:
            fail("response.maman missing or wrong id")
        if isinstance(body.get("enfants"), list):
            ok(f"response.enfants is a list (len={len(body['enfants'])})")
        else:
            fail("response.enfants missing/not a list")
        # ⚠️ NEW field — most important check
        if body.get("grossesse") is not None and isinstance(body.get("grossesse"), dict):
            g = body["grossesse"]
            ok(f"response.grossesse present: date_debut={g.get('date_debut')}, date_terme={g.get('date_terme')}")
        else:
            fail("response.grossesse MISSING (NEW field)",
                 f"Expected dict with date_debut/date_terme, got {body.get('grossesse')!r}. "
                 "Likely root cause: server.py L7034 queries db.grossesse (singular) but the actual collection is db.grossesses (plural).")
        if isinstance(body.get("rdv_recents"), list):
            ok(f"response.rdv_recents is list (len={len(body['rdv_recents'])})")
        else:
            fail("response.rdv_recents missing")
        if body.get("access_expires_at"):
            ok(f"response.access_expires_at present: {body['access_expires_at']}")
        else:
            fail("response.access_expires_at missing")

    # ============================================================
    # SCENARIO 2: Drill-down to child via via_parent
    # ============================================================
    hdr("SCENARIO 2 — GET /pro/patient/{child_id}/carnet?via_parent={maman_id}")
    r = requests.get(
        f"{BASE_URL}/pro/patient/{child_id}/carnet",
        headers=headers_pro,
        params={"via_parent": maman_id},
        timeout=15,
    )
    if r.status_code != 200:
        fail("Carnet enfant via_parent 200", f"{r.status_code} {r.text[:300]}")
    else:
        ok("HTTP 200")
        body = r.json()
        if body.get("type") == "enfant":
            ok("response.type == 'enfant'")
        else:
            fail("response.type", f"got {body.get('type')}")
        if isinstance(body.get("enfant"), dict) and body["enfant"].get("id") == child_id:
            ok("response.enfant is dict with correct id")
        else:
            fail("response.enfant missing or wrong id", str(body.get("enfant")))
        if body.get("via_parent") == maman_id:
            ok("response.via_parent == maman_id")
        else:
            fail("response.via_parent", f"got {body.get('via_parent')}")
        if isinstance(body.get("rdv_recents"), list):
            ok(f"response.rdv_recents is list (len={len(body['rdv_recents'])})")
        else:
            fail("response.rdv_recents missing")
        if body.get("accordee_par") == "parent":
            ok("response.accordee_par == 'parent'")
        else:
            fail("response.accordee_par", f"got {body.get('accordee_par')}")

    # ============================================================
    # SCENARIO 3: Security — child belonging to another maman
    # ============================================================
    hdr("SCENARIO 3 — child2 not belonging to maman1 (should 403)")
    rnd = secrets.token_hex(4)
    maman2_email = f"maman2_{rnd}@test.alomaman.dev"
    try:
        m2_token, m2_user = register(maman2_email, "Test1234!", f"Maman Two {rnd}", role="maman")
        ok(f"Registered maman2 id={m2_user['id']}")
    except Exception as e:
        fail("Register maman2", str(e))
        m2_token = None
    if m2_token:
        body = {
            "nom": "Enfant Two",
            "date_naissance": "2024-08-01",
            "sexe": "M",
        }
        r = requests.post(f"{BASE_URL}/enfants", json=body, headers=auth_h(m2_token), timeout=15)
        if r.status_code == 200:
            child2_id = r.json()["id"]
            ok(f"Created child2 id={child2_id}")
            # Try with maman1's token + via_parent=maman1_id but accessing child2
            r = requests.get(
                f"{BASE_URL}/pro/patient/{child2_id}/carnet",
                headers=headers_pro,
                params={"via_parent": maman_id},
                timeout=15,
            )
            if r.status_code == 403:
                ok(f"403 received as expected — {r.json().get('detail')}")
            else:
                fail("Expected 403 for cross-maman child", f"got {r.status_code}: {r.text[:200]}")
        else:
            fail("Create child2", f"{r.status_code} {r.text[:200]}")

    # ============================================================
    # SCENARIO 4: No via_parent — token only valid for maman, not for child
    # ============================================================
    hdr("SCENARIO 4 — child_id without via_parent param (should 403)")
    r = requests.get(f"{BASE_URL}/pro/patient/{child_id}/carnet", headers=headers_pro, timeout=15)
    if r.status_code == 403:
        ok(f"403 received as expected — {r.json().get('detail')}")
    else:
        fail("Expected 403 for child without via_parent", f"got {r.status_code}: {r.text[:200]}")

    # ============================================================
    # SCENARIO 6: audit log with via_parent
    # ============================================================
    hdr("SCENARIO 6 — verify access_audit_log row with via_parent")
    # Trigger one more drill-down to make sure log was inserted
    r = requests.get(
        f"{BASE_URL}/pro/patient/{child_id}/carnet",
        headers=headers_pro,
        params={"via_parent": maman_id},
        timeout=15,
    )
    if r.status_code == 200:
        ok("Re-triggered drill-down 200")
    # Check Mongo directly
    try:
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        # find db name from backend env
        from dotenv import dotenv_values
        cfg = dotenv_values("/app/backend/.env")
        db_name = cfg.get("DB_NAME", "alomaman")
        mongo_url = cfg.get("MONGO_URL")
        if mongo_url and mongo_url != os.environ.get("MONGO_URL"):
            mc.close()
            mc = MongoClient(mongo_url)
        col = mc[db_name]["access_audit_log"]
        recent = list(col.find(
            {"pro_id": pro_id, "patient_id": child_id, "via_parent": maman_id},
            {"_id": 0},
        ).sort("timestamp", -1).limit(3))
        if recent:
            ok(f"Found {len(recent)} audit row(s) with via_parent={maman_id}")
            r0 = recent[0]
            for k in ("pro_id", "patient_id", "via_parent", "action", "timestamp"):
                if k not in r0:
                    fail(f"audit.{k} missing")
            if r0.get("action") == "view_carnet":
                ok("audit.action == 'view_carnet'")
            else:
                fail("audit.action", f"got {r0.get('action')}")
            if r0.get("patient_type") == "enfant":
                ok("audit.patient_type == 'enfant'")
            else:
                fail("audit.patient_type", f"got {r0.get('patient_type')}")
        else:
            fail("No audit row found in db.access_audit_log with expected filter")
        mc.close()
    except Exception as e:
        fail("Mongo audit-log check", str(e))

    # ============================================================
    # SCENARIO 7a: Backward compat — token directly for enfant_id (no via_parent)
    # ============================================================
    hdr("SCENARIO 7a — direct enfant token (existing flow)")
    # Need an enfant code partage
    r = requests.get(f"{BASE_URL}/enfants/{child_id}/code-partage", headers=auth_h(m_token), timeout=15)
    if r.status_code != 200:
        fail("GET /enfants/{id}/code-partage", f"{r.status_code} {r.text[:200]}")
    else:
        e_code = r.json().get("code_provisoire") or r.json().get("preferred")
        ok(f"Enfant code-partage = {e_code}")
        # Pro recherche → enfant
        r = requests.post(
            f"{BASE_URL}/pro/patient/recherche",
            json={"identifier": e_code, "motif": "Carnet enfant direct"},
            headers=auth_h(p_token),
            timeout=15,
        )
        if r.status_code == 200 and r.json().get("patient_type") == "enfant":
            d2_id = r.json()["demande_id"]
            ok(f"Demande créée pour enfant id={d2_id}")
            # Maman validates
            r = requests.post(
                f"{BASE_URL}/partage/demande/{d2_id}/valider",
                headers=auth_h(m_token), timeout=15,
            )
            if r.status_code == 200:
                ok("Maman validates enfant demande")
                # Get token
                r = requests.get(f"{BASE_URL}/pro/demandes/mes-demandes", headers=auth_h(p_token), timeout=15)
                d2 = next((d for d in r.json() if d["id"] == d2_id), None)
                if d2 and d2.get("access_token"):
                    h2 = auth_h(p_token) | {"X-Access-Token": d2["access_token"]}
                    r = requests.get(f"{BASE_URL}/pro/patient/{child_id}/carnet", headers=h2, timeout=15)
                    if r.status_code == 200 and r.json().get("type") == "enfant" and not r.json().get("via_parent"):
                        ok("Direct enfant carnet 200, type=enfant, via_parent=None")
                    else:
                        fail("Direct enfant carnet", f"{r.status_code} {r.text[:200]}")
                else:
                    fail("d2.access_token missing")
            else:
                fail("Validate enfant demande", f"{r.status_code} {r.text[:200]}")
        else:
            fail("POST /pro/patient/recherche for enfant", f"{r.status_code} {r.text[:200]}")

    # ============================================================
    # SCENARIO 7b: Backward compat — direct maman token (already proven by SCENARIO 1) 
    # ============================================================
    hdr("SCENARIO 7b — direct maman token (no via_parent) — already validated in SCENARIO 1")
    ok("Same call as Scenario 1 demonstrates direct maman flow works")

    # ============================================================
    # SCENARIO 5: Token expired
    # ============================================================
    hdr("SCENARIO 5 — expired token (should 403)")
    # We force-expire the token by updating the access_expires_at in Mongo
    try:
        from pymongo import MongoClient
        from dotenv import dotenv_values
        cfg = dotenv_values("/app/backend/.env")
        mongo_url = cfg.get("MONGO_URL")
        db_name = cfg.get("DB_NAME", "alomaman")
        mc = MongoClient(mongo_url) if mongo_url else MongoClient()
        ar = mc[db_name]["access_requests"]
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        res = ar.update_one({"id": demande_id}, {"$set": {"access_expires_at": past, "status": "validated"}})
        if res.modified_count == 1:
            ok("Forced demande expiry in Mongo")
            # call carnet maman
            r = requests.get(f"{BASE_URL}/pro/patient/{maman_id}/carnet", headers=headers_pro, timeout=15)
            if r.status_code == 403:
                ok(f"Expired direct → 403 — {r.json().get('detail')}")
            else:
                fail("Expired direct should be 403", f"got {r.status_code}: {r.text[:200]}")
            # call carnet via_parent
            r = requests.get(
                f"{BASE_URL}/pro/patient/{child_id}/carnet",
                headers=headers_pro, params={"via_parent": maman_id}, timeout=15,
            )
            if r.status_code == 403:
                ok(f"Expired via_parent → 403 — {r.json().get('detail')}")
            else:
                fail("Expired via_parent should be 403", f"got {r.status_code}: {r.text[:200]}")
        else:
            fail("Force-expire demande in Mongo")
        mc.close()
    except Exception as e:
        fail("Token expiry test", str(e))

    # ---------- summary ----------
    hdr("SUMMARY")
    print(f"\n  ✅ Pass: {len(passes)}")
    print(f"  ❌ Fail: {len(fails)}")
    for label, info in fails:
        print(f"    - {label}: {info}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
