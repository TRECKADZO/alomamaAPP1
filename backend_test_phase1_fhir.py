"""
Backend tests — Phase 1 FHIR R4 Facade + Carnet Modulaire + Audit Log.

Target: https://cycle-tracker-pro.preview.emergentagent.com/api
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASS = "Test1234!"

CHILD_ID = "e41c8152-305e-4014-a4f8-4459d955a6cf"


passes: list[str] = []
fails: list[str] = []


def _check(cond, label):
    (passes if cond else fails).append(label)
    print(("✅ " if cond else "❌ ") + label)
    return cond


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    j = r.json()
    return j["token"], j["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print(f"=== Phase 1 FHIR Facade tests against {BASE} ===\n")

    # ----- LOGIN
    try:
        m_tok, maman = _login(MAMAN_EMAIL, MAMAN_PASS)
        p_tok, pro = _login(PRO_EMAIL, PRO_PASS)
    except Exception as e:
        print(f"FATAL: cannot login: {e}")
        sys.exit(1)

    maman_id = maman["id"]
    pro_id = pro["id"]
    print(f"Maman id={maman_id}; Pro id={pro_id}; specialite={pro.get('specialite')}\n")

    # Make sure the Pro has a RDV with the maman so access is granted.
    rdv_existing = None
    rl = requests.get(f"{BASE}/rdv", headers=_hdr(m_tok), timeout=15)
    if rl.ok:
        for r in rl.json():
            if r.get("pro_id") == pro_id:
                rdv_existing = r
                break
    if not rdv_existing:
        print("[setup] No RDV maman↔pro found, creating one…")
        rc = requests.post(
            f"{BASE}/rdv",
            json={
                "pro_id": pro_id,
                "date": "2026-09-15T10:30",
                "motif": "fhir test",
                "type_consultation": "prenatale",
                "mode": "presentiel",
            },
            headers=_hdr(m_tok),
            timeout=15,
        )
        if rc.ok:
            rdv_existing = rc.json()
            print(f"[setup] RDV created: id={rdv_existing.get('id')}")
        else:
            print(f"[setup] RDV create failed: {rc.status_code} {rc.text[:200]}")

    # Make sure the maman has a CMU so we can validate the identifier section
    cmu_st = requests.get(f"{BASE}/cmu/me", headers=_hdr(m_tok), timeout=10)
    cmu_already = bool(cmu_st.ok and (cmu_st.json().get("cmu") or {}).get("numero"))
    if not cmu_already:
        cset = requests.post(
            f"{BASE}/cmu/me",
            json={
                "numero": "0102030405",
                "nom_complet": "Aminata TestMaman",
                "date_validite": "2099-01-15",
                "beneficiaires": [],
            },
            headers=_hdr(m_tok),
            timeout=10,
        )
        print(f"[setup] CMU set: {cset.status_code}")

    # Make sure there is at least one Observation by adding a mesure (idempotent-ish: just add a fresh one)
    try:
        add_mes = requests.post(
            f"{BASE}/enfants/{CHILD_ID}/mesures",
            json={"poids_kg": 6.4, "taille_cm": 62.0, "perimetre_cranien_cm": 41.0, "date": "2026-04-01"},
            headers=_hdr(m_tok),
            timeout=10,
        )
        print(f"[setup] add mesure: {add_mes.status_code}")
    except Exception:
        pass

    # ----- 1. GET /api/fhir/Patient/{patient_id} ---------------------------
    print("\n--- [1] GET /api/fhir/Patient/{patient_id} ---")

    # 1a Maman fetches herself
    r = requests.get(f"{BASE}/fhir/Patient/{maman_id}", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"1a Maman→self 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Patient", f"1a resourceType=Patient (got {j.get('resourceType')})")
        _check(j.get("gender") == "female", f"1a gender=female (got {j.get('gender')})")
        idents = j.get("identifier") or []
        ids_systems = [i.get("system") for i in idents]
        _check(
            "http://alomaman.com/fhir/identifier/patient-id" in ids_systems,
            f"1a identifier patient-id present (systems={ids_systems})",
        )
        _check(
            "http://alomaman.com/fhir/identifier/cmu" in ids_systems,
            f"1a identifier cmu present (systems={ids_systems})",
        )
        # Sample for traceability
        print(f"   sample: resourceType={j.get('resourceType')} | gender={j.get('gender')}")
        print(f"   identifiers: {json.dumps(idents, ensure_ascii=False)[:240]}")

    # 1b Maman fetches her child
    r = requests.get(f"{BASE}/fhir/Patient/{CHILD_ID}", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"1b Maman→enfant 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Patient", "1b enfant resourceType=Patient")
        _check(j.get("gender") in ("female", "male", "unknown"), f"1b enfant gender={j.get('gender')}")
        link = j.get("link") or []
        ref = (link[0].get("other") or {}).get("reference") if link else None
        _check(ref == f"Patient/{maman_id}", f"1b enfant link[0].other.reference == Patient/{{maman_id}} (got {ref})")
        print(f"   sample enfant: name={j.get('name')} | birthDate={j.get('birthDate')}")

    # 1c Maman fetches another maman → 403
    other_email = f"maman2.{uuid.uuid4().hex[:6]}@alomaman.dev"
    rreg = requests.post(
        f"{BASE}/auth/register",
        json={
            "email": other_email,
            "password": "Test1234!",
            "name": "Marie Test2",
            "role": "maman",
            "phone": f"+22507{uuid.uuid4().int % 10**8:08d}",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        },
        timeout=15,
    )
    other_id = None
    if rreg.ok:
        other_id = rreg.json()["user"]["id"]
        print(f"[setup] Other maman registered: id={other_id}")
        r = requests.get(f"{BASE}/fhir/Patient/{other_id}", headers=_hdr(m_tok), timeout=15)
        _check(r.status_code == 403, f"1c Maman→other maman id 403 (got {r.status_code})")
    else:
        print(f"[setup] Other maman register failed: {rreg.status_code} {rreg.text[:160]}")

    # 1d Pro fetches Maman with RDV
    r = requests.get(f"{BASE}/fhir/Patient/{maman_id}", headers=_hdr(p_tok), timeout=15)
    _check(r.status_code == 200, f"1d Pro→maman (with RDV) 200 (got {r.status_code})")
    if r.ok:
        _check(r.json().get("resourceType") == "Patient", "1d Pro→maman resourceType=Patient")

    # 1e Pro fetches another maman without RDV
    if other_id:
        r = requests.get(f"{BASE}/fhir/Patient/{other_id}", headers=_hdr(p_tok), timeout=15)
        _check(r.status_code == 403, f"1e Pro→other maman (no RDV) 403 (got {r.status_code})")

    # ----- 2. GET /api/fhir/Immunization?subject={enfant_id} ---------------
    print("\n--- [2] GET /api/fhir/Immunization ---")
    r = requests.get(f"{BASE}/fhir/Immunization", params={"subject": CHILD_ID}, headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"2a 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Bundle", "2a resourceType=Bundle")
        _check(j.get("type") == "searchset", f"2a type=searchset (got {j.get('type')})")
        entries = j.get("entry") or []
        for ent in entries:
            res = ent.get("resource") or {}
            if res.get("resourceType") != "Immunization":
                _check(False, f"2a entry resourceType != Immunization → {res.get('resourceType')}")
                break
        else:
            _check(True, f"2a all {len(entries)} entries are Immunization")
        if entries:
            r0 = entries[0]["resource"]
            print(f"   sample: status={r0.get('status')} | vaccineCode={r0.get('vaccineCode')}")
            _check(
                bool((r0.get("vaccineCode") or {}).get("coding")),
                "2a vaccineCode.coding present",
            )

    # ----- 3. GET /api/fhir/Observation?subject={enfant_id} ----------------
    print("\n--- [3] GET /api/fhir/Observation ---")
    r = requests.get(f"{BASE}/fhir/Observation", params={"subject": CHILD_ID}, headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"3a 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Bundle", "3a resourceType=Bundle")
        _check(j.get("type") == "searchset", f"3a type=searchset (got {j.get('type')})")
        codes_seen = set()
        ok_loinc = True
        for ent in (j.get("entry") or []):
            res = ent.get("resource") or {}
            if res.get("resourceType") != "Observation":
                ok_loinc = False
                break
            coding = ((res.get("code") or {}).get("coding") or [{}])[0]
            if coding.get("system") != "http://loinc.org":
                ok_loinc = False
                break
            codes_seen.add(coding.get("code"))
        _check(ok_loinc, "3a every Observation has code.coding[0].system=http://loinc.org")
        print(f"   LOINC codes seen: {codes_seen}")
        # at least one anthropometric code expected since we added a mesure with weight/height/PC
        expected_subset = {"29463-7", "8302-2", "9843-4"}
        _check(bool(codes_seen & expected_subset), f"3a expected ≥1 of {expected_subset} present")

    # 3b category=imaging (should be empty for child anthropometry)
    r = requests.get(
        f"{BASE}/fhir/Observation",
        params={"subject": CHILD_ID, "category": "imaging"},
        headers=_hdr(m_tok),
        timeout=15,
    )
    _check(r.status_code == 200, f"3b ?category=imaging 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        # category=imaging should yield 0 observations for child mesures (which are vital-signs)
        ok = True
        for ent in (j.get("entry") or []):
            res = ent.get("resource") or {}
            cats = res.get("category") or []
            cat0 = ((cats[0].get("coding") or [{}])[0] if cats else {}).get("code")
            if cat0 != "imaging":
                ok = False
                break
        _check(ok, f"3b imaging filter: only imaging entries (count={len(j.get('entry') or [])})")

    # ----- 4. GET /api/fhir/DiagnosticReport?subject={maman_id} ------------
    print("\n--- [4] GET /api/fhir/DiagnosticReport ---")
    r = requests.get(
        f"{BASE}/fhir/DiagnosticReport",
        params={"subject": maman_id},
        headers=_hdr(m_tok),
        timeout=15,
    )
    _check(r.status_code == 200, f"4a Maman 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Bundle", "4a resourceType=Bundle")
        _check(j.get("type") == "searchset", "4a type=searchset")
        for ent in (j.get("entry") or []):
            res = ent.get("resource") or {}
            if res.get("resourceType") != "DiagnosticReport":
                _check(False, f"4a entry not DiagnosticReport ({res.get('resourceType')})")
                break
        else:
            _check(True, f"4a all entries are DiagnosticReport (count={len(j.get('entry') or [])})")
        if (j.get("entry") or []):
            r0 = j["entry"][0]["resource"]
            _check("contained" in r0, "4a contained Observations present")

    # 4b unauthorized (other maman)
    if other_id:
        r = requests.get(
            f"{BASE}/fhir/DiagnosticReport",
            params={"subject": maman_id},
            headers=_hdr(_login(other_email, "Test1234!")[0]) if other_id else None,
            timeout=15,
        )
        _check(r.status_code == 403, f"4b other maman → 403 (got {r.status_code})")

    # ----- 5. GET /api/fhir/Composition/{enfant_id} ------------------------
    print("\n--- [5] GET /api/fhir/Composition/{enfant_id} ---")
    r = requests.get(f"{BASE}/fhir/Composition/{CHILD_ID}", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"5a 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Composition", f"5a resourceType=Composition (got {j.get('resourceType')})")
        type_coding = ((j.get("type") or {}).get("coding") or [{}])[0]
        _check(type_coding.get("system") == "http://loinc.org", f"5a type.coding[0].system=loinc.org (got {type_coding.get('system')})")
        section_titles = [s.get("title") for s in (j.get("section") or [])]
        print(f"   sections: {section_titles}")
        # Identité always present
        _check("Identité" in section_titles, "5a section 'Identité' present")
        # Vaccinations & Croissance present if there is data
        _check(
            any("Vaccination" in (t or "") for t in section_titles),
            f"5a section Vaccinations present (titles={section_titles})",
        )
        _check(
            any("Croissance" in (t or "") for t in section_titles),
            f"5a section Croissance present (titles={section_titles})",
        )

    # ----- 6. GET /api/fhir/everything/{enfant_id} -------------------------
    print("\n--- [6] GET /api/fhir/everything/{enfant_id} ---")
    r = requests.get(f"{BASE}/fhir/everything/{CHILD_ID}", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"6a 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Bundle", "6a resourceType=Bundle")
        _check(j.get("type") == "document", f"6a type=document (got {j.get('type')})")
        entries = j.get("entry") or []
        types = [(e.get("resource") or {}).get("resourceType") for e in entries]
        print(f"   resourceTypes: {types}")
        _check(types.count("Patient") >= 2, f"6a ≥2 Patients (maman+enfant) — found {types.count('Patient')}")
        _check("Immunization" in types, "6a ≥1 Immunization in everything bundle")
        _check("Observation" in types, "6a ≥1 Observation in everything bundle")

    # ----- 7. GET /api/fhir/age-modules ------------------------------------
    print("\n--- [7] GET /api/fhir/age-modules ---")
    r = requests.get(f"{BASE}/fhir/age-modules", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"7a 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        modules = j.get("modules") or []
        keys = [m.get("key") for m in modules]
        expected_keys = ["naissance", "0-6m", "6-24m", "2-5a", "6-12a", "13-18a"]
        _check(keys == expected_keys, f"7a keys order = {expected_keys} (got {keys})")
        relevant = j.get("relevant_modules") or []
        _check(isinstance(relevant, list) and len(relevant) >= 1, f"7a relevant_modules adapted (got {relevant})")
    # 7b as Pro
    r = requests.get(f"{BASE}/fhir/age-modules", headers=_hdr(p_tok), timeout=15)
    _check(r.status_code == 200, "7b Pro 200")
    if r.ok:
        j = r.json()
        print(f"   pro specialite={pro.get('specialite')} → relevant={j.get('relevant_modules')}")

    # ----- 8. GET /api/enfants/{enfant_id}/carnet/{module} -----------------
    print("\n--- [8] GET /api/enfants/{enfant_id}/carnet/{module} ---")
    expected_carnet_keys = {
        "enfant", "module", "module_label", "module_sections",
        "is_current_module", "immunizations_count", "observations_count",
        "immunizations", "observations",
    }
    for mod in ["naissance", "0-6m", "6-24m", "2-5a", "6-12a", "13-18a"]:
        r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/{mod}", headers=_hdr(m_tok), timeout=15)
        _check(r.status_code == 200, f"8 module={mod} 200 (got {r.status_code})")
        if r.ok:
            j = r.json()
            missing = expected_carnet_keys - set(j.keys())
            _check(not missing, f"8 module={mod}: required keys present (missing={missing})")
            _check(j.get("module") == mod, f"8 module={mod}: response.module matches")
            _check(isinstance(j.get("immunizations"), list), f"8 module={mod}: immunizations is list")
            _check(isinstance(j.get("observations"), list), f"8 module={mod}: observations is list")

    # 8b invalid module
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/invalid_xxx", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 400, f"8b invalid module → 400 (got {r.status_code})")

    # 8c unauthorized (other maman)
    if other_id:
        other_tok, _ = _login(other_email, "Test1234!")
        r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/0-6m", headers=_hdr(other_tok), timeout=15)
        _check(r.status_code == 403, f"8c other maman → 403 (got {r.status_code})")

    # ----- 9. GET /api/audit-log/me ----------------------------------------
    print("\n--- [9] GET /api/audit-log/me ---")
    r = requests.get(f"{BASE}/audit-log/me", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"9a Maman 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        events = j.get("events") or []
        _check(isinstance(events, list) and len(events) > 0, f"9a events list non-empty (count={len(events)})")
        if events:
            ev = events[0]
            for f in ("action", "resource_type", "resource_id", "timestamp", "user_id"):
                _check(f in ev, f"9a event has key '{f}'")
            _check(ev.get("user_id") == maman_id, f"9a event.user_id == maman_id (got {ev.get('user_id')})")
            _check(ev.get("action") == "read", f"9a event.action == read (got {ev.get('action')})")
            print(f"   sample event: {json.dumps(ev, ensure_ascii=False)[:300]}")

    # 9b Pro → 403
    r = requests.get(f"{BASE}/audit-log/me", headers=_hdr(p_tok), timeout=15)
    _check(r.status_code == 403, f"9b Pro → 403 (got {r.status_code})")

    # ----- 10. Backward compatibility — legacy /fhir/patient ---------------
    print("\n--- [10] GET /api/fhir/patient (legacy) ---")
    r = requests.get(f"{BASE}/fhir/patient", headers=_hdr(m_tok), timeout=15)
    _check(r.status_code == 200, f"10a legacy 200 (got {r.status_code})")
    if r.ok:
        j = r.json()
        _check(j.get("resourceType") == "Bundle", f"10a legacy resourceType=Bundle (got {j.get('resourceType')})")
        _check(j.get("type") == "collection", f"10a legacy type=collection (got {j.get('type')})")

    # ----- CLEANUP ---------------------------------------------------------
    if other_id:
        try:
            other_tok, _ = _login(other_email, "Test1234!")
            r = requests.delete(f"{BASE}/auth/me", headers=_hdr(other_tok), timeout=10)
            print(f"\n[cleanup] DELETE /auth/me other maman → {r.status_code}")
        except Exception as e:
            print(f"\n[cleanup] failed to delete other maman: {e}")

    # ----- SUMMARY ---------------------------------------------------------
    total = len(passes) + len(fails)
    print("\n" + "=" * 60)
    print(f"PASS: {len(passes)}/{total}")
    print(f"FAIL: {len(fails)}/{total}")
    if fails:
        print("\nFailures:")
        for f in fails:
            print(f"  - {f}")
    sys.exit(0 if not fails else 1)


if __name__ == "__main__":
    main()
