#!/usr/bin/env python3
"""Retest pro/patients and pro/dossier after the fix."""
import requests
import sys
from datetime import datetime, timezone

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
# User said http://localhost:8001/api — try that first, fallback to public
CANDIDATES = ["http://localhost:8001/api", "https://cycle-tracker-pro.preview.emergentagent.com/api"]


def pick_base():
    for b in CANDIDATES:
        try:
            r = requests.get(f"{b}/community", timeout=5)
            if r.status_code in (200, 401):
                return b
        except Exception:
            continue
    return CANDIDATES[0]


def login(base, email, pw):
    r = requests.post(f"{base}/auth/login", json={"email": email, "password": pw}, timeout=15)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    base = pick_base()
    print(f"Using BASE = {base}")

    # Login maman to ensure grossesse + enfant exist
    m_tok, m_user = login(base, "maman@test.com", "Maman123!")
    print(f"maman login OK id={m_user['id']}")

    # Ensure active grossesse
    g = requests.get(f"{base}/grossesse", headers=h(m_tok), timeout=10).json()
    if not g:
        r = requests.post(f"{base}/grossesse", headers=h(m_tok),
                          json={"date_debut": "2025-08-01T00:00:00Z", "symptomes": ["nausees"], "notes": "test"},
                          timeout=10)
        print(f"seeded grossesse: {r.status_code}")
    else:
        print(f"existing grossesse found date_debut={g.get('date_debut')}")

    # Ensure at least one enfant
    enfants = requests.get(f"{base}/enfants", headers=h(m_tok), timeout=10).json()
    if not enfants:
        r = requests.post(f"{base}/enfants", headers=h(m_tok),
                          json={"nom": "Amina", "date_naissance": "2023-05-12", "sexe": "F", "poids_kg": 12.3, "taille_cm": 85.0},
                          timeout=10)
        print(f"seeded enfant: {r.status_code}")
    else:
        print(f"existing enfants count={len(enfants)}")

    # Login pro
    p_tok, p_user = login(base, "pro@test.com", "Pro123!")
    print(f"pro login OK id={p_user['id']}")

    # Ensure pro has a RDV with maman (needed for access)
    rdvs = requests.get(f"{base}/rdv", headers=h(p_tok), timeout=10).json()
    has_link = any(r.get("maman_id") == m_user["id"] for r in rdvs)
    if not has_link:
        r = requests.post(f"{base}/rdv", headers=h(m_tok),
                          json={"pro_id": p_user["id"], "date": "2025-12-20T10:00:00Z",
                                "motif": "Consultation prénatale", "tarif_fcfa": 15000},
                          timeout=10)
        print(f"created RDV: {r.status_code}")
    else:
        print("rdv link exists")

    # TEST 1: GET /pro/patients
    r = requests.get(f"{base}/pro/patients", headers=h(p_tok), timeout=15)
    assert r.status_code == 200, f"/pro/patients failed: {r.status_code} {r.text}"
    patients = r.json()
    print(f"\n=== /pro/patients returned {len(patients)} patient(s) ===")
    target = next((p for p in patients if p["id"] == m_user["id"]), None)
    assert target, "maman@test.com not found in /pro/patients"
    print(f"  - {target['name']} ({target['email']})")
    print(f"    has_grossesse={target.get('has_grossesse')}")
    print(f"    grossesse_sa={target.get('grossesse_sa')}")
    print(f"    enfants_count={target.get('enfants_count')}")
    print(f"    last_rdv_date={target.get('last_rdv_date')}")

    t1_pass = (
        target.get("has_grossesse") is True
        and isinstance(target.get("grossesse_sa"), int)
        and target.get("grossesse_sa") >= 15
        and target.get("enfants_count", 0) >= 1
    )
    print(f"  TEST 1 /pro/patients: {'PASS' if t1_pass else 'FAIL'}")

    # TEST 2: GET /pro/dossier/{patient_id}
    r = requests.get(f"{base}/pro/dossier/{m_user['id']}", headers=h(p_tok), timeout=15)
    assert r.status_code == 200, f"/pro/dossier failed: {r.status_code} {r.text}"
    dossier = r.json()
    print(f"\n=== /pro/dossier/{m_user['id'][:8]}... ===")
    print(f"  patient.name = {dossier.get('patient', {}).get('name')}")
    print(f"  grossesse = {dossier.get('grossesse') is not None} "
          f"(date_debut={dossier.get('grossesse', {}).get('date_debut') if dossier.get('grossesse') else None})")
    print(f"  enfants count = {len(dossier.get('enfants', []))}")
    print(f"  rdvs count = {len(dossier.get('rdvs', []))}")
    print(f"  notes count = {len(dossier.get('notes', []))}")

    t2_pass = (
        dossier.get("grossesse") is not None
        and isinstance(dossier.get("enfants"), list)
        and len(dossier.get("enfants")) >= 1
    )
    print(f"  TEST 2 /pro/dossier: {'PASS' if t2_pass else 'FAIL'}")

    print("\n========== SUMMARY ==========")
    print(f"  /pro/patients enrichment: {'PASS' if t1_pass else 'FAIL'}")
    print(f"  /pro/dossier content   : {'PASS' if t2_pass else 'FAIL'}")
    sys.exit(0 if (t1_pass and t2_pass) else 1)


if __name__ == "__main__":
    main()
