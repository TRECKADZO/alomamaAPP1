"""
Phase 2 Backend tests — À lo Maman

Scenarios (per review request):
  1) Auto-reminders on POST /cycle
  2) Auto-reminders on POST /contraception (by method)
  3) GET /enfants/{id}/croissance-oms (OMS curves + CMU number)
  4) POST /naissance with auto-create enfant
  5) POST /tele-echo with structured report
  6) Resources smoke
  7) Regression: Register consent still blocks

Run:  python /app/backend_test_phase2.py
"""
import os
import sys
import json
import time
import uuid
import base64
from datetime import datetime, timedelta, timezone

import requests

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN = ("maman@test.com", "Maman123!")
PRO = ("pro@test.com", "Pro123!")
PRO2 = ("pediatre@test.com", "Pro123!")  # second pro for tele-echo 404 test
ADMIN = ("klenakan.eric@gmail.com", "474Treckadzo$1986")

results = []  # list of (case_id, name, ok, detail)


def record(case_id, name, ok, detail=""):
    results.append((case_id, name, ok, detail))
    tag = "✅ PASS" if ok else "❌ FAIL"
    print(f"{tag} [{case_id}] {name}" + (f" — {detail}" if detail else ""))


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def delete_auto_reminders(token, prefix):
    """Delete all reminders whose source starts with <prefix>."""
    r = requests.get(f"{BASE}/reminders", headers=H(token), timeout=30)
    if r.status_code != 200:
        return 0
    count = 0
    for rem in r.json():
        src = rem.get("source") or ""
        if src.startswith(prefix):
            rr = requests.delete(f"{BASE}/reminders/{rem['id']}", headers=H(token), timeout=30)
            if rr.status_code in (200, 204):
                count += 1
    return count


def get_auto_reminders(token, prefix):
    r = requests.get(f"{BASE}/reminders", headers=H(token), timeout=30)
    r.raise_for_status()
    return [x for x in r.json() if (x.get("source") or "").startswith(prefix)]


def parse_iso(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


# ===================================================================
# CASE 1 — Auto-reminders on POST /cycle
# ===================================================================
def case_1_cycle(token):
    cid = "1"
    # Clean slate
    delete_auto_reminders(token, "auto_cycle")

    # 1a — Standard 28 day cycle starting 2026-07-01
    start = "2026-07-01"
    r = requests.post(f"{BASE}/cycle", headers=H(token),
                      json={"date_debut_regles": start, "duree_cycle": 28}, timeout=30)
    if r.status_code != 200:
        record(cid + "a", "POST /cycle 28d (2026-07-01) → 200", False, f"status={r.status_code} body={r.text[:200]}")
        return
    cycle28 = r.json()
    record(cid + "a", "POST /cycle 28d (2026-07-01) → 200", True, f"id={cycle28.get('id')}")

    # Read auto reminders
    reminders = get_auto_reminders(token, "auto_cycle")
    kinds = {rem.get("kind") for rem in reminders}
    expected_kinds = {"cycle_fertile", "cycle_ovulation", "cycle_regles_pre"}
    record(cid + "b", "3 auto_cycle reminders with expected kinds",
           len(reminders) == 3 and kinds == expected_kinds,
           f"count={len(reminders)} kinds={kinds}")

    # Verify due_at dates approximately
    by_kind = {rem["kind"]: rem for rem in reminders}
    # fertile: cycle_len=28 → ovu_day=14 → fenetre_start=10 → due=2026-07-11 09:00
    # ovulation: J14 → due=2026-07-15 09:00
    # regles_pre: J27 (J=next_regles-1=28-1=27) → due=2026-07-28 09:00
    expected = {
        "cycle_fertile": "2026-07-11",
        "cycle_ovulation": "2026-07-15",
        "cycle_regles_pre": "2026-07-28",
    }
    all_ok = True
    details = []
    for kind, exp_date in expected.items():
        rem = by_kind.get(kind)
        if not rem:
            all_ok = False
            details.append(f"{kind}=MISSING")
            continue
        dt = parse_iso(rem["due_at"])
        got = dt.strftime("%Y-%m-%d") if dt else "?"
        if got != exp_date:
            all_ok = False
            details.append(f"{kind}: expected {exp_date}, got {got}")
    record(cid + "c", "Reminder due_at dates match (fertile J10=07-11, ovu J14=07-15, regles J27=07-28)",
           all_ok, "; ".join(details) or "all match")

    # 1d — Edge: duree_cycle=21 → ovu=7, fenetre=3, all future → 3 reminders
    delete_auto_reminders(token, "auto_cycle")
    r = requests.post(f"{BASE}/cycle", headers=H(token),
                      json={"date_debut_regles": "2026-08-01", "duree_cycle": 21}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_cycle")
    record(cid + "d", "POST /cycle duree_cycle=21 future date → 3 reminders",
           ok_status and len(reminders) == 3,
           f"status={r.status_code} reminders={len(reminders)}")

    # Edge: Verify due dates for 21d cycle → fertile J3 (08-04), ovu J7 (08-08), regles J20 (08-21)
    by_kind = {rem["kind"]: rem for rem in reminders}
    exp21 = {
        "cycle_fertile": "2026-08-04",
        "cycle_ovulation": "2026-08-08",
        "cycle_regles_pre": "2026-08-21",
    }
    all_ok = True
    details = []
    for kind, exp_date in exp21.items():
        rem = by_kind.get(kind)
        if not rem:
            all_ok = False
            details.append(f"{kind}=MISSING")
            continue
        dt = parse_iso(rem["due_at"])
        got = dt.strftime("%Y-%m-%d") if dt else "?"
        if got != exp_date:
            all_ok = False
            details.append(f"{kind}: expected {exp_date}, got {got}")
    record(cid + "e", "21-day cycle due dates (J3/J7/J20)",
           all_ok, "; ".join(details) or "all match")

    # 1f — Edge: past date → no reminders
    delete_auto_reminders(token, "auto_cycle")
    r = requests.post(f"{BASE}/cycle", headers=H(token),
                      json={"date_debut_regles": "2020-01-01", "duree_cycle": 28}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_cycle")
    record(cid + "f", "POST /cycle with PAST date → 0 auto reminders",
           ok_status and len(reminders) == 0,
           f"status={r.status_code} reminders={len(reminders)}")

    # Final clean up
    delete_auto_reminders(token, "auto_cycle")


# ===================================================================
# CASE 2 — Auto-reminders on POST /contraception (by method)
# ===================================================================
def case_2_contraception(token):
    cid = "2"
    delete_auto_reminders(token, "auto_contraception")

    # 2a — pilule → 30 daily reminders
    r = requests.post(f"{BASE}/contraception", headers=H(token),
                      json={"methode": "pilule", "date_debut": "2026-07-01"}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_contraception")
    kinds = {rem.get("kind") for rem in reminders}
    record(cid + "a", "contraception pilule → 30 contra_pilule reminders",
           ok_status and len(reminders) == 30 and kinds == {"contra_pilule"},
           f"status={r.status_code} count={len(reminders)} kinds={kinds}")

    # 2b — injection → 1 reminder at J88 (2026-09-27)
    delete_auto_reminders(token, "auto_contraception")
    r = requests.post(f"{BASE}/contraception", headers=H(token),
                      json={"methode": "injection", "date_debut": "2026-07-01"}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_contraception")
    detail = ""
    if len(reminders) == 1:
        dt = parse_iso(reminders[0]["due_at"])
        got = dt.strftime("%Y-%m-%d") if dt else "?"
        # 2026-07-01 + 88d = 2026-09-27
        ok = (got == "2026-09-27" and reminders[0]["kind"] == "contra_injection")
        detail = f"due_at={got}"
    else:
        ok = False
        detail = f"count={len(reminders)}"
    record(cid + "b", "contraception injection → 1 reminder at J88 (2026-09-27)",
           ok_status and ok, detail)

    # 2c — implant → 1 reminder at 3y-30d = 1065d
    delete_auto_reminders(token, "auto_contraception")
    r = requests.post(f"{BASE}/contraception", headers=H(token),
                      json={"methode": "implant", "date_debut": "2026-07-01"}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_contraception")
    expected_date = (datetime(2026, 7, 1) + timedelta(days=3 * 365 - 30)).strftime("%Y-%m-%d")
    if len(reminders) == 1:
        dt = parse_iso(reminders[0]["due_at"])
        got = dt.strftime("%Y-%m-%d") if dt else "?"
        ok = (got == expected_date and reminders[0]["kind"] == "contra_implant")
        detail = f"due_at={got} expected={expected_date}"
    else:
        ok = False
        detail = f"count={len(reminders)}"
    record(cid + "c", f"contraception implant → 1 reminder at {expected_date} (3y-30d)",
           ok_status and ok, detail)

    # 2d — sterilet → 1 reminder at 5y-30d = 1795d
    delete_auto_reminders(token, "auto_contraception")
    r = requests.post(f"{BASE}/contraception", headers=H(token),
                      json={"methode": "sterilet", "date_debut": "2026-07-01"}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_contraception")
    expected_date = (datetime(2026, 7, 1) + timedelta(days=5 * 365 - 30)).strftime("%Y-%m-%d")
    if len(reminders) == 1:
        dt = parse_iso(reminders[0]["due_at"])
        got = dt.strftime("%Y-%m-%d") if dt else "?"
        ok = (got == expected_date and reminders[0]["kind"] == "contra_sterilet")
        detail = f"due_at={got} expected={expected_date}"
    else:
        ok = False
        detail = f"count={len(reminders)}"
    record(cid + "d", f"contraception sterilet → 1 reminder at {expected_date} (5y-30d)",
           ok_status and ok, detail)

    # 2e — naturel (unknown) → 0 reminders, no error
    delete_auto_reminders(token, "auto_contraception")
    r = requests.post(f"{BASE}/contraception", headers=H(token),
                      json={"methode": "naturel", "date_debut": "2026-07-01"}, timeout=30)
    ok_status = r.status_code == 200
    reminders = get_auto_reminders(token, "auto_contraception")
    record(cid + "e", "contraception methode='naturel' → 200 & 0 reminders",
           ok_status and len(reminders) == 0,
           f"status={r.status_code} count={len(reminders)}")

    # Cleanup
    delete_auto_reminders(token, "auto_contraception")


# ===================================================================
# CASE 3 — GET /enfants/{id}/croissance-oms
# ===================================================================
def case_3_croissance(token_maman, token_pro):
    cid = "3"
    created_ids = []

    # Create enfant Test OMS
    r = requests.post(f"{BASE}/enfants", headers=H(token_maman), json={
        "nom": "Test OMS",
        "date_naissance": "2024-06-01",
        "sexe": "F",
        "poids_kg": 3.2,
        "taille_cm": 50,
        "numero_cmu": "0102030406",
    }, timeout=30)
    if r.status_code != 200:
        record(cid + "a", "POST /enfants Test OMS → 200", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    enf = r.json()
    eid = enf["id"]
    created_ids.append(eid)
    record(cid + "a", "POST /enfants Test OMS (numero_cmu) → 200", True, f"id={eid}")

    # Add 3 mesures
    mesures = [
        {"date": "2024-09-01", "poids_kg": 5.8},
        {"date": "2025-06-01", "poids_kg": 8.9},
        {"date": "2026-06-01", "poids_kg": 11.5},
    ]
    all_ok = True
    for m in mesures:
        rr = requests.post(f"{BASE}/enfants/{eid}/mesures", headers=H(token_maman), json=m, timeout=30)
        if rr.status_code != 200:
            all_ok = False
    record(cid + "b", "Added 3 mesures to enfant", all_ok)

    # GET croissance-oms
    r = requests.get(f"{BASE}/enfants/{eid}/croissance-oms", headers=H(token_maman), timeout=30)
    if r.status_code != 200:
        record(cid + "c", "GET /enfants/{id}/croissance-oms → 200", False,
               f"status={r.status_code} body={r.text[:200]}")
        return eid
    data = r.json()
    record(cid + "c", "GET /enfants/{id}/croissance-oms → 200", True)

    # Shape: enfant
    enf_obj = data.get("enfant") or {}
    shape_ok = all(k in enf_obj for k in ("id", "nom", "sexe", "date_naissance", "numero_cmu"))
    cmu_ok = enf_obj.get("numero_cmu") == "0102030406"
    record(cid + "d", "Response.enfant has {id,nom,sexe,date_naissance,numero_cmu='0102030406'}",
           shape_ok and cmu_ok,
           f"enfant_keys={list(enf_obj.keys())} cmu={enf_obj.get('numero_cmu')}")

    # Shape: points
    points = data.get("points") or []
    points_ok = isinstance(points, list) and len(points) >= 3
    each_ok = True
    bad_point = None
    for p in points:
        if not isinstance(p.get("age_mois"), (int, float)):
            each_ok = False
            bad_point = f"age_mois type {type(p.get('age_mois'))}"
            break
        ref = p.get("oms_poids_ref") or {}
        if not all(k in ref for k in ("p3", "p15", "p50", "p85", "p97")):
            each_ok = False
            bad_point = f"oms_poids_ref keys={list(ref.keys())}"
            break
        cls = p.get("classification_poids")
        if cls not in ("tres_bas", "bas", "normal", "eleve", "tres_eleve", None):
            each_ok = False
            bad_point = f"classification_poids={cls}"
            break
    record(cid + "e", "points[] structure valid (age_mois float, oms_poids_ref 5 keys, classification valid)",
           points_ok and each_ok, bad_point or f"count={len(points)}")

    # reference_poids_age length == 13 with keys
    ref_pa = data.get("reference_poids_age") or []
    ref_pa_ok = len(ref_pa) == 13 and all(
        all(k in r for k in ("mois", "p3", "p15", "p50", "p85", "p97")) for r in ref_pa
    )
    record(cid + "f", "reference_poids_age len==13 with all percentile keys", ref_pa_ok,
           f"len={len(ref_pa)}")

    # reference_taille_age length == 13
    ref_ta = data.get("reference_taille_age") or []
    ref_ta_ok = len(ref_ta) == 13
    record(cid + "g", "reference_taille_age len==13", ref_ta_ok, f"len={len(ref_ta)}")

    # source string contains "OMS"
    src = data.get("source", "")
    record(cid + "h", "source contains 'OMS'", "OMS" in src, f"source='{src}'")

    # As pro → expect 403 (route uses require_roles('maman'))
    r = requests.get(f"{BASE}/enfants/{eid}/croissance-oms", headers=H(token_pro), timeout=30)
    record(cid + "i", "Pro → GET /enfants/{id}/croissance-oms → 403",
           r.status_code == 403, f"status={r.status_code}")

    # Invalid id → 404
    r = requests.get(f"{BASE}/enfants/nonexistent-id-abcdef/croissance-oms",
                     headers=H(token_maman), timeout=30)
    record(cid + "j", "Invalid enfant id → 404", r.status_code == 404, f"status={r.status_code}")

    # Enfant with only poids_kg (no mesures) → points empty, ref tables 13
    r = requests.post(f"{BASE}/enfants", headers=H(token_maman), json={
        "nom": "Test OMS Empty",
        "date_naissance": "2024-06-01",
        "sexe": "M",
        "poids_kg": 3.3,
    }, timeout=30)
    if r.status_code == 200:
        eid2 = r.json()["id"]
        created_ids.append(eid2)
        rr = requests.get(f"{BASE}/enfants/{eid2}/croissance-oms", headers=H(token_maman), timeout=30)
        if rr.status_code == 200:
            data2 = rr.json()
            empty_ok = (len(data2.get("points") or []) == 0
                        and len(data2.get("reference_poids_age") or []) == 13
                        and len(data2.get("reference_taille_age") or []) == 13)
            record(cid + "k", "Enfant without mesures → points=[] and refs len==13",
                   empty_ok,
                   f"points={len(data2.get('points') or [])}, ref_pa={len(data2.get('reference_poids_age') or [])}")
        else:
            record(cid + "k", "Enfant without mesures → croissance-oms 200", False,
                   f"status={rr.status_code}")
    else:
        record(cid + "k", "Create second enfant (no mesures)", False, f"status={r.status_code}")

    return created_ids


# ===================================================================
# CASE 4 — POST /naissance with auto-create enfant
# ===================================================================
def case_4_naissance(token_maman, existing_enfant_id):
    cid = "4"
    created_enfants = []
    created_naissances = []

    # Count enfants before
    r = requests.get(f"{BASE}/enfants", headers=H(token_maman), timeout=30)
    n_before = len(r.json()) if r.status_code == 200 else 0

    # 4a — POST /naissance WITHOUT enfant_id, WITH enfant_nom/sexe/date → 200 w/ enfant_cree_auto=true
    nom_unique = f"Bébé Auto {uuid.uuid4().hex[:6]}"
    payload = {
        "enfant_nom": nom_unique,
        "enfant_sexe": "M",
        "enfant_date_naissance": "2026-03-01",
        "lieu_naissance": "CHU Treichville",
        "heure_naissance": "14:30",
        "poids_naissance_g": 3100,
        "taille_naissance_cm": 49,
        "nom_mere": "Maman Test",
    }
    r = requests.post(f"{BASE}/naissance", headers=H(token_maman), json=payload, timeout=30)
    if r.status_code != 200:
        record(cid + "a", "POST /naissance (auto-create) → 200", False,
               f"status={r.status_code} body={r.text[:300]}")
    else:
        body = r.json()
        ok = bool(body.get("enfant_cree_auto")) and body.get("enfant_nom") == nom_unique
        created_naissances.append(body.get("id"))
        if body.get("enfant_id"):
            created_enfants.append(body["enfant_id"])
        record(cid + "a", "POST /naissance (auto-create) → 200 w/ enfant_cree_auto=true",
               ok, f"enfant_cree_auto={body.get('enfant_cree_auto')} nom={body.get('enfant_nom')}")

    # Verify enfants N+1 + newest matches
    r = requests.get(f"{BASE}/enfants", headers=H(token_maman), timeout=30)
    enfants = r.json() if r.status_code == 200 else []
    new_one = next((e for e in enfants if e.get("nom") == nom_unique), None)
    ok = (len(enfants) == n_before + 1 and new_one is not None)
    if new_one:
        ok = ok and (
            new_one.get("poids_kg") == 3.1
            and new_one.get("taille_cm") == 49
            and isinstance(new_one.get("mesures"), list) and len(new_one["mesures"]) == 1
            and new_one.get("created_from_naissance") is True
        )
    record(cid + "b", f"GET /enfants now N+1 w/ auto-enfant (poids_kg=3.1, taille=49, 1 mesure, created_from_naissance=True)",
           ok, f"before={n_before}, now={len(enfants)}, found={new_one is not None}")

    # 4c — POST /naissance without enfant_id AND without enfant_nom → 400
    payload_bad = {
        "lieu_naissance": "CHU Test",
        "heure_naissance": "10:00",
        "poids_naissance_g": 3000,
        "taille_naissance_cm": 48.0,
        "nom_mere": "Maman Test",
    }
    r = requests.post(f"{BASE}/naissance", headers=H(token_maman), json=payload_bad, timeout=30)
    record(cid + "c", "POST /naissance without enfant_id AND without enfant_nom → 400",
           r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # 4d — POST /naissance with existing enfant_id (legacy flow) → 200
    if existing_enfant_id:
        # First, check if a naissance already exists for it
        payload_legacy = {
            "enfant_id": existing_enfant_id,
            "lieu_naissance": "CHU Legacy",
            "heure_naissance": "09:00",
            "poids_naissance_g": 3200,
            "taille_naissance_cm": 50.0,
            "nom_mere": "Maman Test",
        }
        r = requests.post(f"{BASE}/naissance", headers=H(token_maman), json=payload_legacy, timeout=30)
        legacy_ok = r.status_code == 200
        if legacy_ok:
            created_naissances.append(r.json().get("id"))
        record(cid + "d", "POST /naissance with existing enfant_id (legacy) → 200",
               legacy_ok, f"status={r.status_code}")

        # 4e — 2nd call for SAME enfant_id → 400 (déjà enregistrée)
        r = requests.post(f"{BASE}/naissance", headers=H(token_maman), json=payload_legacy, timeout=30)
        record(cid + "e", "2nd POST /naissance for same enfant_id → 400 'déjà enregistrée'",
               r.status_code == 400 and "déjà" in r.text.lower(),
               f"status={r.status_code} body={r.text[:200]}")

    return created_enfants, created_naissances


# ===================================================================
# CASE 5 — POST /tele-echo with structured report
# ===================================================================
def case_5_tele_echo(token_maman, token_pro, token_pro2):
    cid = "5"
    created_echos = []
    created_rdvs = []

    # Get maman user + pro IDs
    me_maman = requests.get(f"{BASE}/auth/me", headers=H(token_maman), timeout=30).json()
    me_pro = requests.get(f"{BASE}/auth/me", headers=H(token_pro), timeout=30).json()
    me_pro2 = requests.get(f"{BASE}/auth/me", headers=H(token_pro2), timeout=30).json()
    pro_id = me_pro["id"]
    pro2_id = me_pro2["id"]

    # maman creates 2 rdvs (1 with pro, 1 with pro2)
    r = requests.post(f"{BASE}/rdv", headers=H(token_maman), json={
        "pro_id": pro_id, "date": "2026-08-15T10:00", "motif": "Écho 2T",
        "type_consultation": "prenatale",
    }, timeout=30)
    if r.status_code != 200:
        record(cid + "setup_rdv1", "Setup RDV with pro", False, f"status={r.status_code} body={r.text[:200]}")
        return created_echos, created_rdvs
    rdv1_id = r.json()["id"]
    created_rdvs.append(rdv1_id)

    r = requests.post(f"{BASE}/rdv", headers=H(token_maman), json={
        "pro_id": pro2_id, "date": "2026-08-16T10:00", "motif": "Contrôle",
        "type_consultation": "prenatale",
    }, timeout=30)
    if r.status_code == 200:
        rdv2_id = r.json()["id"]
        created_rdvs.append(rdv2_id)
    else:
        rdv2_id = None

    # 5a — POST /tele-echo full structured report
    full_payload = {
        "rdv_id": rdv1_id,
        "bpd_mm": 55.2, "fl_mm": 42.1, "cc_mm": 200.0, "ca_mm": 180.0,
        "poids_estime_g": 1850,
        "liquide_amniotique": "normal",
        "placenta_position": "anterieur",
        "sexe_foetal": "F",
        "battements_cardiaques_bpm": 145,
        "conclusion": "Grossesse évolutive normale",
        "semaine_grossesse": 22,
        "description": "Écho 2nd trimestre",
    }
    r = requests.post(f"{BASE}/tele-echo", headers=H(token_pro), json=full_payload, timeout=30)
    if r.status_code != 200:
        record(cid + "a", "POST /tele-echo full structured → 200", False,
               f"status={r.status_code} body={r.text[:300]}")
    else:
        body = r.json()
        created_echos.append(body.get("id"))
        persisted_ok = all(
            body.get(k) == v for k, v in full_payload.items() if k not in ("rdv_id",)
        )
        record(cid + "a", "POST /tele-echo (structured report) → 200 w/ all fields persisted",
               persisted_ok,
               f"bpd={body.get('bpd_mm')} poids={body.get('poids_estime_g')} conclusion='{body.get('conclusion')}'")

    # 5b — POST /tele-echo with ONLY image_base64
    img_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII="
    r = requests.post(f"{BASE}/tele-echo", headers=H(token_pro), json={
        "rdv_id": rdv1_id,
        "image_base64": img_b64,
    }, timeout=30)
    if r.status_code != 200:
        record(cid + "b", "POST /tele-echo image-only → 200", False,
               f"status={r.status_code} body={r.text[:300]}")
    else:
        created_echos.append(r.json().get("id"))
        record(cid + "b", "POST /tele-echo image-only → 200", True)

    # 5c — POST /tele-echo with rdv_id but no image/description/structured → 400
    r = requests.post(f"{BASE}/tele-echo", headers=H(token_pro), json={
        "rdv_id": rdv1_id,
    }, timeout=30)
    record(cid + "c", "POST /tele-echo empty → 400 'Fournissez au moins…'",
           r.status_code == 400 and "fournissez" in r.text.lower(),
           f"status={r.status_code} body={r.text[:200]}")

    # 5d — POST /tele-echo with rdv_id belonging to ANOTHER pro → 404
    if rdv2_id:
        r = requests.post(f"{BASE}/tele-echo", headers=H(token_pro), json={
            "rdv_id": rdv2_id,
            "conclusion": "Tentative non autorisée",
        }, timeout=30)
        record(cid + "d", "POST /tele-echo for foreign rdv → 404",
               r.status_code == 404, f"status={r.status_code} body={r.text[:200]}")
    else:
        record(cid + "d", "POST /tele-echo for foreign rdv → 404",
               False, "Could not create RDV with pro2")

    return created_echos, created_rdvs


# ===================================================================
# CASE 6 — Resources smoke
# ===================================================================
def case_6_resources(token):
    cid = "6"

    # 6a — GET /resources ≥ 8 seeded
    r = requests.get(f"{BASE}/resources", headers=H(token), timeout=30)
    if r.status_code != 200:
        record(cid + "a", "GET /resources → 200", False, f"status={r.status_code}")
        return
    items = r.json()
    record(cid + "a", f"GET /resources ≥ 8 seeded (got {len(items)})",
           len(items) >= 8, f"count={len(items)}")

    # 6b — GET /resources?type=quiz → 2
    r = requests.get(f"{BASE}/resources?type=quiz", headers=H(token), timeout=30)
    quizzes = r.json() if r.status_code == 200 else []
    record(cid + "b", f"GET /resources?type=quiz → 2 (got {len(quizzes)})",
           r.status_code == 200 and len(quizzes) == 2,
           f"status={r.status_code} count={len(quizzes)}")

    # 6c — GET /resources?category=nutrition ≥ 1
    r = requests.get(f"{BASE}/resources?category=nutrition", headers=H(token), timeout=30)
    nut = r.json() if r.status_code == 200 else []
    record(cid + "c", f"GET /resources?category=nutrition ≥ 1 (got {len(nut)})",
           r.status_code == 200 and len(nut) >= 1,
           f"status={r.status_code} count={len(nut)}")

    # 6d — POST /resources/{quiz_id}/quiz-submit
    if quizzes:
        quiz_id = quizzes[0]["id"]
        # Fetch quiz detail to know question count
        qr = requests.get(f"{BASE}/resources/{quiz_id}", headers=H(token), timeout=30)
        if qr.status_code == 200:
            qd = qr.json()
            n = len(qd.get("questions") or [])
            answers = [0] * n  # submit 0 for all
            r = requests.post(f"{BASE}/resources/{quiz_id}/quiz-submit",
                              headers=H(token),
                              json={"answers": answers},
                              timeout=30)
            if r.status_code != 200:
                record(cid + "d", "POST /resources/{quiz_id}/quiz-submit → 200", False,
                       f"status={r.status_code} body={r.text[:200]}")
            else:
                body = r.json()
                ok = (isinstance(body.get("score_pct"), int) and isinstance(body.get("results"), list)
                      and len(body["results"]) == n)
                record(cid + "d", f"quiz-submit returns score_pct + results array ({n} Qs)",
                       ok, f"score_pct={body.get('score_pct')} results_len={len(body.get('results') or [])}")
        else:
            record(cid + "d", "GET quiz detail", False, f"status={qr.status_code}")
    else:
        record(cid + "d", "quiz-submit", False, "no quiz found")


# ===================================================================
# CASE 7 — Regression: Register consent still blocks
# ===================================================================
def case_7_consent():
    cid = "7"
    # 7a — Register without accepte_cgu → 400
    email = f"consent-test-{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "email": email,
        "password": "Pass1234!",
        "name": "Consent Test",
        "role": "maman",
        "accepte_cgu": False,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=30)
    record(cid + "a", "Register without accepte_cgu → 400",
           r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # 7b — Register with cgu + politique + donnees_sante → 200
    email2 = f"consent-ok-{uuid.uuid4().hex[:8]}@test.com"
    payload2 = {
        "email": email2,
        "password": "Pass1234!",
        "name": "Consent OK",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = requests.post(f"{BASE}/auth/register", json=payload2, timeout=30)
    record(cid + "b", "Register full consent → 200",
           r.status_code == 200, f"status={r.status_code}")


# ===================================================================
# CLEANUP
# ===================================================================
def cleanup(token_maman, token_pro, enfant_ids, echo_ids, rdv_ids):
    # Delete auto reminders (safe)
    try:
        delete_auto_reminders(token_maman, "auto_cycle")
        delete_auto_reminders(token_maman, "auto_contraception")
    except Exception:
        pass
    # Delete enfants
    for eid in enfant_ids or []:
        try:
            requests.delete(f"{BASE}/enfants/{eid}", headers=H(token_maman), timeout=15)
        except Exception:
            pass
    # Note: naissance / tele-echo / rdv don't expose DELETE endpoints for maman→ skipping


# ===================================================================
# MAIN
# ===================================================================
def main():
    print("=" * 70)
    print(f"Phase 2 backend tests against {BASE}")
    print("=" * 70)

    try:
        tok_maman, _ = login(*MAMAN)
        tok_pro, _ = login(*PRO)
        tok_pro2, _ = login(*PRO2)
    except Exception as e:
        print(f"❌ Auth failed: {e}")
        sys.exit(1)

    print("\n--- CASE 1: Auto-reminders on POST /cycle ---")
    case_1_cycle(tok_maman)

    print("\n--- CASE 2: Auto-reminders on POST /contraception ---")
    case_2_contraception(tok_maman)

    print("\n--- CASE 3: GET /enfants/{id}/croissance-oms ---")
    created_enfants_case3 = case_3_croissance(tok_maman, tok_pro) or []

    # For case 4d/e, we need an enfant WITHOUT an existing naissance.
    # The 2nd enfant from case3 (Test OMS Empty) is fresh, so use it.
    existing_enfant_id = created_enfants_case3[1] if len(created_enfants_case3) >= 2 else \
                         (created_enfants_case3[0] if created_enfants_case3 else None)

    print("\n--- CASE 4: POST /naissance with auto-create enfant ---")
    created_enfants_case4, created_naissances = case_4_naissance(tok_maman, existing_enfant_id)

    print("\n--- CASE 5: POST /tele-echo with structured report ---")
    created_echos, created_rdvs = case_5_tele_echo(tok_maman, tok_pro, tok_pro2)

    print("\n--- CASE 6: Resources smoke ---")
    case_6_resources(tok_maman)

    print("\n--- CASE 7: Regression Register consent ---")
    case_7_consent()

    # CLEANUP
    print("\n--- CLEANUP ---")
    all_enfants = (created_enfants_case3 or []) + (created_enfants_case4 or [])
    cleanup(tok_maman, tok_pro, all_enfants, created_echos, created_rdvs)

    # SUMMARY
    print("\n" + "=" * 70)
    total = len(results)
    passed = sum(1 for _, _, ok, _ in results if ok)
    print(f"RESULTS: {passed}/{total} PASS")
    print("=" * 70)
    failed = [(c, n, d) for c, n, ok, d in results if not ok]
    if failed:
        print("FAILED:")
        for c, n, d in failed:
            print(f"  ❌ [{c}] {n} — {d}")
    else:
        print("ALL PASS ✅")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
