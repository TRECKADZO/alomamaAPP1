#!/usr/bin/env python3
"""
Backend tests for DMP (Détection Multi-domaine du Précoce) module.
Tests: GET /api/dmp/milestones, GET/POST/DELETE /api/enfants/{eid}/dmp[/{milestone_id}]
"""
import os
import sys
import time
import json
import uuid
from datetime import datetime, timedelta, timezone

import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"

PASS = []
FAIL = []


def check(label, cond, detail=""):
    if cond:
        PASS.append(label)
        print(f"  ✅ {label}")
    else:
        FAIL.append((label, detail))
        print(f"  ❌ {label} — {detail}")


def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    r.raise_for_status()
    body = r.json()
    return body["token"], body["user"]


def register(email, pwd, role="maman", **extra):
    payload = {
        "email": email,
        "password": pwd,
        "name": extra.get("name", "Test User"),
        "phone": extra.get("phone", f"+22507{int(time.time())%10000000:07d}"),
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    payload.update({k: v for k, v in extra.items() if k not in ("name", "phone")})
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=30)
    if r.status_code != 200:
        print("Register failed:", r.status_code, r.text)
    r.raise_for_status()
    body = r.json()
    return body["token"], body["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("\n=== LOGIN ===")
    maman_tok, maman_u = login(MAMAN_EMAIL, MAMAN_PWD)
    check("Login maman", bool(maman_tok))
    pro_tok, pro_u = login(PRO_EMAIL, PRO_PWD)
    check("Login pro", bool(pro_tok))

    # ======================================================================
    print("\n=== 1. GET /api/dmp/milestones ===")
    # Endpoint requires auth. We'll always pass a token.
    r = requests.get(f"{BASE}/dmp/milestones", headers=H(maman_tok), timeout=30)
    check("GET /dmp/milestones status=200", r.status_code == 200, f"got {r.status_code} {r.text[:200]}")
    data = r.json() if r.status_code == 200 else {}
    check("Response has 'domains' with 7 items", isinstance(data.get("domains"), list) and len(data["domains"]) == 7,
          f"got {len(data.get('domains', []))}")
    check("Response has 'milestones' with 52 items", isinstance(data.get("milestones"), list) and len(data["milestones"]) == 52,
          f"got {len(data.get('milestones', []))}")
    check("Response has 'total'==52", data.get("total") == 52, f"got {data.get('total')}")

    # Each milestone shape
    if data.get("milestones"):
        m0 = data["milestones"][0]
        required = ["id", "domaine", "titre", "description", "age_typique", "age_alerte", "emoji"]
        missing = [k for k in required if k not in m0]
        check("Milestone shape has required keys", not missing, f"missing: {missing}")

    # Test filter q=marche
    r = requests.get(f"{BASE}/dmp/milestones?q=marche", headers=H(maman_tok), timeout=30)
    check("GET ?q=marche status=200", r.status_code == 200)
    mdata = r.json()
    marche_items = mdata.get("milestones", [])
    check("q=marche returns >=1 items", len(marche_items) >= 1, f"got {len(marche_items)}")
    # all items should contain 'marche' in title or description
    all_match = all(
        "marche" in (m["titre"] + " " + m["description"]).lower()
        for m in marche_items
    )
    check("q=marche all items contain 'marche'", all_match)
    check("q=marche total matches len", mdata.get("total") == len(marche_items))

    # Test filter domaine=cognitif
    r = requests.get(f"{BASE}/dmp/milestones?domaine=cognitif", headers=H(maman_tok), timeout=30)
    check("GET ?domaine=cognitif status=200", r.status_code == 200)
    cog = r.json().get("milestones", [])
    check("domaine=cognitif returns ~7 items", len(cog) == 7, f"got {len(cog)}")
    check("domaine=cognitif all items are cognitif",
          all(m["domaine"] == "cognitif" for m in cog))

    # AND filter
    r = requests.get(f"{BASE}/dmp/milestones?q=compte&domaine=cognitif", headers=H(maman_tok), timeout=30)
    check("GET q=compte & domaine=cognitif status=200", r.status_code == 200)
    both = r.json().get("milestones", [])
    check("AND filter returns at least 1", len(both) >= 1, f"got {len(both)}")
    check("AND filter items match both criteria",
          all(m["domaine"] == "cognitif" and "compte" in (m["titre"] + " " + m["description"]).lower() for m in both))

    # ======================================================================
    print("\n=== 2. Setup: fresh maman + 24mo enfant (existing maman_test has quota used) ===")
    # Register a fresh maman dedicated to DMP 24-mo tests
    dmp_maman_email = f"dmp_maman_{int(time.time())}@test.alomaman.dev"
    dmp_maman_tok, dmp_maman_u = register(
        dmp_maman_email, "Test1234!", role="maman",
        name="DMP TestMaman",
        phone=f"+22507{int(time.time()*7)%10000000:07d}",
    )
    check("Register fresh DMP maman", bool(dmp_maman_tok))

    # Create 24mo enfant for this maman (quota allows 1 free enfant)
    target_age_days = 730  # ~24 months
    dn = (datetime.now(timezone.utc) - timedelta(days=target_age_days)).date().isoformat()
    payload = {
        "nom": f"DMP Test Enfant {int(time.time())}",
        "sexe": "F",
        "date_naissance": dn,
    }
    r = requests.post(f"{BASE}/enfants", headers=H(dmp_maman_tok), json=payload, timeout=30)
    check("POST /enfants to create ~24mo enfant", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    enfant = r.json()
    created_enfant_id = enfant["id"]
    eid = enfant["id"]
    # All owner-related tests below use dmp_maman_tok
    owner_tok = dmp_maman_tok
    print(f"  → using enfant_id={eid}, nom={enfant.get('nom')}, dn={enfant.get('date_naissance')}")

    # ======================================================================
    print("\n=== 3. GET /api/enfants/{eid}/dmp as maman owner ===")
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    check("GET /enfants/{eid}/dmp status=200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    dmp = r.json() if r.status_code == 200 else {}

    check("Response has age_mois", "age_mois" in dmp)
    check("Response has items (52)", isinstance(dmp.get("items"), list) and len(dmp["items"]) == 52,
          f"got {len(dmp.get('items', []))}")
    check("Response has domains (7)", isinstance(dmp.get("domains"), list) and len(dmp["domains"]) == 7)
    check("Response has alertes (list)", isinstance(dmp.get("alertes"), list))
    check("Response has score_global key", "score_global" in dmp)
    check("Response has enfant.id", dmp.get("enfant", {}).get("id") == eid)

    age_mois = dmp.get("age_mois", 0)
    print(f"  → age_mois={age_mois}")

    # Each item has statut in {acquis, en_cours, alerte, trop_jeune}
    allowed_statuts = {"acquis", "en_cours", "alerte", "trop_jeune"}
    statuts_ok = all(it.get("statut") in allowed_statuts for it in dmp.get("items", []))
    check("All items have valid statut", statuts_ok)

    # Initially all acquis should be false
    all_not_acquired = all(it.get("acquis") is False for it in dmp.get("items", []))
    check("Initially all items acquis=False", all_not_acquired)

    # For age>=alerte threshold and not acquired, statut=alerte
    if age_mois >= 18:
        mg_marche = next((it for it in dmp["items"] if it["id"] == "mg_marche_seul"), None)
        # age_alerte=18
        if mg_marche:
            expected_statut = "alerte" if age_mois > 18 else ("en_cours" if age_mois >= 13 else "trop_jeune")
            check(f"mg_marche_seul has correct statut (age={age_mois}, alerte=18) → {expected_statut}",
                  mg_marche["statut"] == expected_statut,
                  f"got {mg_marche['statut']}")
        le_premier = next((it for it in dmp["items"] if it["id"] == "le_premier_mot"), None)
        if le_premier:
            # age_alerte=18
            expected = "alerte" if age_mois > 18 else "en_cours" if age_mois >= 13 else "trop_jeune"
            check(f"le_premier_mot has correct statut (age={age_mois}) → {expected}",
                  le_premier["statut"] == expected,
                  f"got {le_premier['statut']}")

    # Items with age_typique > age_mois => trop_jeune (unless acquired, but nothing acquired yet)
    too_young_items = [it for it in dmp["items"] if it["age_typique"] > age_mois]
    all_too_young_status = all(it["statut"] == "trop_jeune" for it in too_young_items)
    check(f"All items with age_typique>{age_mois} have statut=trop_jeune",
          all_too_young_status,
          f"violations: {[it['id'] for it in too_young_items if it['statut'] != 'trop_jeune'][:5]}")

    # Score global for no acquired == 0 (when there are attendus items)
    check("score_global == 0 when no acquired and attendus exist",
          dmp.get("score_global") == 0 or dmp.get("score_global") is None,
          f"got {dmp.get('score_global')}")

    # alertes list contains expected items for age 24
    alert_ids = {a["id"] for a in dmp.get("alertes", [])}
    if age_mois >= 24:
        # Expect mg_assis_seul (age_alerte=10), mg_marche_seul (18), le_premier_mot (18) to be in alerts
        expected_in = ["mg_assis_seul", "mg_marche_seul", "le_premier_mot"]
        missing = [x for x in expected_in if x not in alert_ids]
        check("alertes contains expected items for 24mo enfant", not missing, f"missing: {missing}")

    # ======================================================================
    print("\n=== 4. GET /enfants/{eid}/dmp as DIFFERENT maman → 403 ===")
    other_email = f"dmp_other_{int(time.time())}@test.alomaman.dev"
    other_tok, other_u = register(other_email, "Test1234!", role="maman",
                                  name="Mariam TestOther",
                                  phone=f"+22507{int(time.time()*10)%10000000:07d}")
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(other_tok), timeout=30)
    check("GET /dmp as other maman → 403", r.status_code == 403, f"got {r.status_code} {r.text[:120]}")

    # ======================================================================
    print("\n=== 5. GET /enfants/inexistant-id/dmp → 404 ===")
    r = requests.get(f"{BASE}/enfants/inexistant-id-xyz/dmp", headers=H(owner_tok), timeout=30)
    check("GET /dmp invalid enfant_id → 404", r.status_code == 404, f"got {r.status_code}")

    # ======================================================================
    print("\n=== 6. GET /dmp as pro → 200 ===")
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(pro_tok), timeout=30)
    check("GET /dmp as pro → 200", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")

    # ======================================================================
    print("\n=== 7. POST /enfants/{eid}/dmp/mg_court ===")
    r = requests.post(f"{BASE}/enfants/{eid}/dmp/mg_court", headers=H(owner_tok), timeout=30)
    check("POST mg_court status=200", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
    body = r.json() if r.status_code == 200 else {}
    check("POST response ok=true", body.get("ok") is True)
    check("POST response milestone_id=mg_court", body.get("milestone_id") == "mg_court")

    # Idempotency
    r2 = requests.post(f"{BASE}/enfants/{eid}/dmp/mg_court", headers=H(owner_tok), timeout=30)
    check("POST mg_court again (idempotent) 200", r2.status_code == 200, f"got {r2.status_code}")

    # Invalid milestone_id
    r3 = requests.post(f"{BASE}/enfants/{eid}/dmp/XXX_invalid", headers=H(owner_tok), timeout=30)
    check("POST invalid milestone_id → 404", r3.status_code == 404, f"got {r3.status_code}")

    # POST as non-owner maman
    r4 = requests.post(f"{BASE}/enfants/{eid}/dmp/mg_tient_tete", headers=H(other_tok), timeout=30)
    check("POST as non-owner maman → 403", r4.status_code == 403, f"got {r4.status_code}")

    # ======================================================================
    print("\n=== 8. GET after POST: mg_court should be acquis ===")
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    dmp2 = r.json() if r.status_code == 200 else {}
    mg_court = next((it for it in dmp2.get("items", []) if it["id"] == "mg_court"), None)
    check("mg_court acquis=True", mg_court and mg_court.get("acquis") is True)
    check("mg_court statut=acquis", mg_court and mg_court.get("statut") == "acquis")
    check("mg_court acquired_at is ISO string",
          mg_court and isinstance(mg_court.get("acquired_at"), str) and "T" in mg_court["acquired_at"],
          f"got {mg_court.get('acquired_at') if mg_court else None}")

    # ======================================================================
    print("\n=== 9. DELETE /enfants/{eid}/dmp/mg_court ===")
    r = requests.delete(f"{BASE}/enfants/{eid}/dmp/mg_court", headers=H(owner_tok), timeout=30)
    check("DELETE mg_court → 200", r.status_code == 200)

    # After delete, GET → acquis=False
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    dmp3 = r.json()
    mg_court_after = next((it for it in dmp3.get("items", []) if it["id"] == "mg_court"), None)
    check("After DELETE, mg_court acquis=False", mg_court_after and mg_court_after.get("acquis") is False)

    # DELETE non-existent (never acquired) → 200 (idempotent)
    r = requests.delete(f"{BASE}/enfants/{eid}/dmp/mg_tient_tete", headers=H(owner_tok), timeout=30)
    check("DELETE never-acquired milestone → 200 (idempotent)", r.status_code == 200)

    # ======================================================================
    print("\n=== 10. Score & alerts logic (24mo) ===")
    # Ensure nothing acquired for this test
    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    dmp_clean = r.json()
    # cleanup any lingering acquired
    for it in dmp_clean.get("items", []):
        if it.get("acquis"):
            requests.delete(f"{BASE}/enfants/{eid}/dmp/{it['id']}", headers=H(owner_tok), timeout=10)

    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    dmp_zero = r.json()
    check("score_global=0 with 0 acquired (enfant 24mo)", dmp_zero.get("score_global") == 0, f"got {dmp_zero.get('score_global')}")
    # Known alerts for 24mo: age_alerte < 24 means age_mois > age_alerte triggers
    expected_alertes_ids = {"mg_assis_seul", "mg_marche_seul", "le_premier_mot"}
    got_alert_ids = {a["id"] for a in dmp_zero.get("alertes", [])}
    missing = expected_alertes_ids - got_alert_ids
    check("alertes contains mg_assis_seul, mg_marche_seul, le_premier_mot",
          not missing, f"missing: {missing}; got: {sorted(got_alert_ids)}")

    # Acquire all milestones expected at ≤ 24 months → score_global should be 100 and alertes empty
    ms_expected = [m for m in dmp_zero.get("items", []) if m["age_typique"] <= age_mois]
    print(f"  → acquiring {len(ms_expected)} expected milestones (age_typique<={age_mois})…")
    acquired_list = []
    for m in ms_expected:
        rp = requests.post(f"{BASE}/enfants/{eid}/dmp/{m['id']}", headers=H(owner_tok), timeout=15)
        if rp.status_code == 200:
            acquired_list.append(m["id"])

    r = requests.get(f"{BASE}/enfants/{eid}/dmp", headers=H(owner_tok), timeout=30)
    dmp_full = r.json()
    check("After acquiring all expected milestones, score_global=100",
          dmp_full.get("score_global") == 100, f"got {dmp_full.get('score_global')}")
    check("After acquiring all expected milestones, alertes=[]",
          dmp_full.get("alertes") == [], f"got {len(dmp_full.get('alertes', []))} alerts")

    # ======================================================================
    print("\n=== CLEANUP ===")
    for mid in acquired_list:
        requests.delete(f"{BASE}/enfants/{eid}/dmp/{mid}", headers=H(owner_tok), timeout=10)
    if created_enfant_id:
        r = requests.delete(f"{BASE}/enfants/{created_enfant_id}", headers=H(owner_tok), timeout=15)
        print(f"  → deleted test enfant: {r.status_code}")
    # Delete other maman
    r = requests.delete(f"{BASE}/auth/me",
                        headers=H(other_tok),
                        json={"password": "Test1234!", "confirmation": "SUPPRIMER"},
                        timeout=30)
    print(f"  → deleted other maman: {r.status_code}")

    # ======================================================================
    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)} | FAIL: {len(FAIL)}")
    if FAIL:
        print("\nFAILED CHECKS:")
        for lbl, det in FAIL:
            print(f"  ❌ {lbl} — {det}")
        sys.exit(1)
    print("ALL PASS ✅")


if __name__ == "__main__":
    main()
