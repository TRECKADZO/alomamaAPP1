"""
Backend tests for À lo Maman — Pro role new endpoints.
Target: https://maman-rdv-booking.preview.emergentagent.com/api
"""
import os
import sys
import uuid
import requests

BASE = os.environ.get("BACKEND_URL", "https://maman-rdv-booking.preview.emergentagent.com/api")

PRO_EMAIL = "pro@test.com"
PRO_PW = "Pro123!"
MAMAN_EMAIL = "maman@test.com"
MAMAN_PW = "Maman123!"
ADMIN_EMAIL = "admin@alomaman.com"
ADMIN_PW = "Admin123!"


results = []

def record(name, ok, detail=""):
    icon = "OK " if ok else "FAIL"
    msg = f"[{icon}] {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    results.append((ok, name, detail))
    return ok


def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    print(f"=== Testing PRO endpoints @ {BASE} ===\n")

    try:
        pro_tok, pro_user = login(PRO_EMAIL, PRO_PW)
        record("Login pro@test.com", True, f"id={pro_user['id']}")
    except Exception as e:
        record("Login pro@test.com", False, str(e))
        return

    try:
        maman_tok, maman_user = login(MAMAN_EMAIL, MAMAN_PW)
        record("Login maman@test.com", True, f"id={maman_user['id']}")
    except Exception as e:
        record("Login maman@test.com", False, str(e))
        return

    try:
        sagefemme_tok, _ = login("sagefemme@test.com", "Pro123!")
    except Exception:
        sagefemme_tok = None

    # Seed a RDV maman→pro if none
    r = requests.get(f"{BASE}/rdv", headers=h(maman_tok), timeout=30)
    rdvs_maman = r.json() if r.status_code == 200 else []
    has_rdv_with_pro = any(x for x in rdvs_maman if x.get("pro_id") == pro_user["id"])
    if not has_rdv_with_pro:
        rr = requests.post(
            f"{BASE}/rdv",
            headers=h(maman_tok),
            json={
                "pro_id": pro_user["id"],
                "date": "2026-05-15T10:00:00Z",
                "motif": "Suivi grossesse - consultation test",
                "tarif_fcfa": 10000,
            },
            timeout=30,
        )
        if rr.status_code == 200:
            record("Create RDV maman→pro (seed)", True, f"rdv_id={rr.json().get('id')}")
        else:
            record("Create RDV maman→pro (seed)", False, f"{rr.status_code} {rr.text[:200]}")
    else:
        record("Maman already has RDV with pro", True)

    # Ensure maman has a grossesse + enfant to verify enrichment
    r = requests.get(f"{BASE}/grossesse", headers=h(maman_tok), timeout=30)
    if r.status_code == 200 and not r.json():
        rr = requests.post(
            f"{BASE}/grossesse",
            headers=h(maman_tok),
            json={"date_debut": "2026-01-01T00:00:00Z", "date_terme": "2026-10-10T00:00:00Z", "symptomes": ["nausees"]},
            timeout=30,
        )
        record("Seed grossesse for maman", rr.status_code == 200, f"status={rr.status_code}")

    r = requests.get(f"{BASE}/enfants", headers=h(maman_tok), timeout=30)
    if r.status_code == 200 and len(r.json()) == 0:
        rr = requests.post(
            f"{BASE}/enfants",
            headers=h(maman_tok),
            json={"nom": "Kofi Test", "date_naissance": "2024-01-15", "sexe": "M", "poids_kg": 3.2, "taille_cm": 50},
            timeout=30,
        )
        record("Seed enfant for maman", rr.status_code == 200, f"status={rr.status_code}")

    # ==== 1. GET /pro/patients (enriched) ====
    r = requests.get(f"{BASE}/pro/patients", headers=h(pro_tok), timeout=30)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    patients = r.json() if ok else []
    if ok:
        if not patients:
            record("GET /pro/patients (enriched)", False, "list empty; expected maman as patient")
        else:
            p0 = next((p for p in patients if p.get("id") == maman_user["id"]), patients[0])
            required = ["has_grossesse", "grossesse_sa", "enfants_count", "last_rdv_date"]
            missing = [f for f in required if f not in p0]
            if missing:
                record("GET /pro/patients enriched fields", False, f"missing {missing}")
            else:
                record(
                    "GET /pro/patients enriched fields present",
                    True,
                    f"n={len(patients)} sample={ {k:p0.get(k) for k in required} }",
                )
                # Deeper check: should reflect actual data in DB
                exp_gross = True
                exp_enfants_min = 1
                if p0.get("has_grossesse") != exp_gross or (p0.get("enfants_count") or 0) < exp_enfants_min:
                    record(
                        "Enrichment values reflect DB (has_grossesse + enfants_count)",
                        False,
                        f"has_grossesse={p0.get('has_grossesse')} enfants_count={p0.get('enfants_count')} (expected True and >=1)",
                    )
                else:
                    record("Enrichment values reflect DB (has_grossesse + enfants_count)", True)
                if not p0.get("last_rdv_date"):
                    record("Enrichment last_rdv_date populated", False, "last_rdv_date is null")
                else:
                    record("Enrichment last_rdv_date populated", True, f"last_rdv_date={p0.get('last_rdv_date')}")
    else:
        record("GET /pro/patients", False, f"{r.status_code} {r.text[:200]}")

    patient_id = None
    for p in patients:
        if p.get("id") == maman_user["id"]:
            patient_id = p["id"]
            break
    if not patient_id and patients:
        patient_id = patients[0]["id"]

    # ==== 2. GET /pro/dossier/{patient_id} ====
    if patient_id:
        r = requests.get(f"{BASE}/pro/dossier/{patient_id}", headers=h(pro_tok), timeout=30)
        if r.status_code == 200:
            d = r.json()
            keys = {"patient", "grossesse", "enfants", "rdvs", "notes"}
            missing = keys - set(d.keys())
            if missing:
                record("GET /pro/dossier shape", False, f"missing keys {missing}")
            else:
                record(
                    "GET /pro/dossier shape",
                    True,
                    f"rdvs={len(d.get('rdvs') or [])} enfants={len(d.get('enfants') or [])} grossesse={bool(d.get('grossesse'))}",
                )
                # Deeper: we expect grossesse + at least 1 enfant
                dossier_ok = bool(d.get("grossesse")) and len(d.get("enfants") or []) >= 1
                if not dossier_ok:
                    record(
                        "Dossier contains grossesse + enfants",
                        False,
                        f"grossesse={bool(d.get('grossesse'))} enfants={len(d.get('enfants') or [])} (expected both populated)",
                    )
                else:
                    record("Dossier contains grossesse + enfants", True)
        else:
            record("GET /pro/dossier/{patient_id}", False, f"{r.status_code} {r.text[:200]}")
    else:
        record("GET /pro/dossier/{patient_id}", False, "no patient_id available")

    fake_id = str(uuid.uuid4())
    r = requests.get(f"{BASE}/pro/dossier/{fake_id}", headers=h(pro_tok), timeout=30)
    record(
        "GET /pro/dossier (no-rdv/unknown patient → 403/404)",
        r.status_code in (403, 404),
        f"status={r.status_code}",
    )

    # ==== 3. POST /pro/consultation-notes ====
    note_id = None
    if patient_id:
        body = {
            "patient_id": patient_id,
            "date": "2026-04-20",
            "diagnostic": "Anémie légère",
            "traitement": "Fer 80mg x2/j",
            "notes": "Revoir dans 1 mois",
        }
        r = requests.post(f"{BASE}/pro/consultation-notes", headers=h(pro_tok), json=body, timeout=30)
        if r.status_code == 200 and r.json().get("id"):
            note_id = r.json()["id"]
            jd = r.json()
            ok_fields = (
                jd.get("diagnostic") == "Anémie légère"
                and jd.get("traitement") == "Fer 80mg x2/j"
                and jd.get("pro_id") == pro_user["id"]
            )
            record("POST /pro/consultation-notes", ok_fields, f"id={note_id}")
        else:
            record("POST /pro/consultation-notes", False, f"{r.status_code} {r.text[:200]}")

    # ==== 4. dossier should list the note ====
    if patient_id and note_id:
        r = requests.get(f"{BASE}/pro/dossier/{patient_id}", headers=h(pro_tok), timeout=30)
        if r.status_code == 200:
            notes = r.json().get("notes") or []
            found = any(n.get("id") == note_id for n in notes)
            record("Dossier now contains new note", found, f"notes_count={len(notes)}")
        else:
            record("Dossier recheck", False, f"{r.status_code}")

    # ==== 5. DELETE /pro/consultation-notes/{id} ====
    if note_id:
        r = requests.delete(f"{BASE}/pro/consultation-notes/{note_id}", headers=h(pro_tok), timeout=30)
        ok = r.status_code == 200 and r.json().get("ok") is True
        record("DELETE /pro/consultation-notes/{id}", ok, f"status={r.status_code}")
        if ok and patient_id:
            r2 = requests.get(f"{BASE}/pro/dossier/{patient_id}", headers=h(pro_tok), timeout=30)
            notes = r2.json().get("notes") or []
            record("Deleted note removed from dossier", not any(n.get("id") == note_id for n in notes))

    # ==== 6. GET /pro/disponibilites initial ====
    r = requests.get(f"{BASE}/pro/disponibilites", headers=h(pro_tok), timeout=30)
    if r.status_code == 200:
        d = r.json()
        ok = "slots" in d and "duree_consultation" in d and d.get("pro_id") == pro_user["id"]
        record(
            "GET /pro/disponibilites (initial shape)",
            ok,
            f"slots={len(d.get('slots') or [])} duree={d.get('duree_consultation')}",
        )
    else:
        record("GET /pro/disponibilites (initial)", False, f"{r.status_code} {r.text[:200]}")

    # ==== 7. PUT /pro/disponibilites ====
    new_dispos = {
        "slots": [
            {"jour": "lundi", "heure_debut": "08:00", "heure_fin": "12:00", "actif": True},
            {"jour": "mercredi", "heure_debut": "14:00", "heure_fin": "18:00", "actif": True},
        ],
        "duree_consultation": 30,
    }
    r = requests.put(f"{BASE}/pro/disponibilites", headers=h(pro_tok), json=new_dispos, timeout=30)
    if r.status_code == 200:
        d = r.json()
        ok = len(d.get("slots") or []) == 2 and d.get("duree_consultation") == 30
        record("PUT /pro/disponibilites", ok, f"saved {len(d.get('slots') or [])} slots")
    else:
        record("PUT /pro/disponibilites", False, f"{r.status_code} {r.text[:200]}")

    # ==== 8. GET after PUT ====
    r = requests.get(f"{BASE}/pro/disponibilites", headers=h(pro_tok), timeout=30)
    if r.status_code == 200:
        d = r.json()
        slots = d.get("slots") or []
        jours = sorted([s.get("jour") for s in slots])
        ok = jours == ["lundi", "mercredi"] and d.get("duree_consultation") == 30
        record("GET /pro/disponibilites after PUT", ok, f"jours={jours}")
    else:
        record("GET /pro/disponibilites after PUT", False, f"{r.status_code}")

    # ==== 9. POST /pro/rappels-patient ====
    rappel_id = None
    if patient_id:
        body = {
            "patient_id": patient_id,
            "title": "Prise de fer",
            "due_at": "2026-05-01",
            "notes": "2 comprimés/jour",
        }
        r = requests.post(f"{BASE}/pro/rappels-patient", headers=h(pro_tok), json=body, timeout=30)
        if r.status_code == 200:
            jd = r.json()
            rappel_id = jd.get("id")
            ok = (
                jd.get("source") == "pro"
                and jd.get("source_pro_id") == pro_user["id"]
                and jd.get("title") == "Prise de fer"
                and jd.get("user_id") == patient_id
            )
            record(
                "POST /pro/rappels-patient",
                ok,
                f"source={jd.get('source')} src_pro_id_ok={jd.get('source_pro_id')==pro_user['id']}",
            )
        else:
            record("POST /pro/rappels-patient", False, f"{r.status_code} {r.text[:200]}")

    # ==== 10. GET /reminders as maman ====
    if rappel_id and patient_id == maman_user["id"]:
        r = requests.get(f"{BASE}/reminders", headers=h(maman_tok), timeout=30)
        if r.status_code == 200:
            items = r.json() or []
            found = any(x.get("id") == rappel_id for x in items)
            record("Rappel appears in maman GET /reminders", found, f"n={len(items)}")
        else:
            record("Rappel appears in maman GET /reminders", False, f"{r.status_code}")

    # ==== 11. GET /pro/rappels-envoyes ====
    r = requests.get(f"{BASE}/pro/rappels-envoyes", headers=h(pro_tok), timeout=30)
    if r.status_code == 200:
        items = r.json() or []
        found = rappel_id is None or any(x.get("id") == rappel_id for x in items)
        record("GET /pro/rappels-envoyes", found, f"n={len(items)}")
    else:
        record("GET /pro/rappels-envoyes", False, f"{r.status_code}")

    # ==== 12. POST /teleconsultation/room/{rdv_id} ====
    r = requests.get(f"{BASE}/rdv", headers=h(pro_tok), timeout=30)
    pro_rdvs = r.json() if r.status_code == 200 else []
    target_rdv = pro_rdvs[0] if pro_rdvs else None
    if target_rdv:
        rid = target_rdv["id"]
        r = requests.post(f"{BASE}/teleconsultation/room/{rid}", headers=h(pro_tok), timeout=30)
        if r.status_code == 200:
            jd = r.json()
            ok = bool(jd.get("room_name")) and bool(jd.get("room_url"))
            record("POST /teleconsultation/room (as pro)", ok, f"room={jd.get('room_name')}")
            r2 = requests.get(f"{BASE}/rdv", headers=h(pro_tok), timeout=30)
            updated = next((x for x in r2.json() if x.get("id") == rid), {})
            record(
                "RDV updated with teleconsultation_url",
                updated.get("teleconsultation_url") == jd.get("room_url"),
                f"url={updated.get('teleconsultation_url')}",
            )
        else:
            record("POST /teleconsultation/room (as pro)", False, f"{r.status_code} {r.text[:200]}")

        if sagefemme_tok:
            r = requests.post(f"{BASE}/teleconsultation/room/{rid}", headers=h(sagefemme_tok), timeout=30)
            record("Teleconsultation unrelated user → 403", r.status_code == 403, f"status={r.status_code}")
    else:
        record("POST /teleconsultation/room", False, "no rdv available for pro")

    # ==== 13. Role checks ====
    for path, method, body in [
        ("/pro/patients", "GET", None),
        ("/pro/disponibilites", "GET", None),
        ("/pro/rappels-envoyes", "GET", None),
        ("/pro/consultation-notes", "POST", {"patient_id": "x", "diagnostic": "t"}),
    ]:
        if method == "GET":
            r = requests.get(f"{BASE}{path}", headers=h(maman_tok), timeout=30)
        else:
            r = requests.post(f"{BASE}{path}", headers=h(maman_tok), json=body, timeout=30)
        record(f"Role check: maman on {method} {path} → 403", r.status_code == 403, f"status={r.status_code}")

    # ==== 14. Regression ====
    r = requests.get(f"{BASE}/grossesse", headers=h(maman_tok), timeout=30)
    record("Regression GET /grossesse (maman)", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{BASE}/enfants", headers=h(maman_tok), timeout=30)
    record("Regression GET /enfants (maman)", r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")
    r = requests.get(f"{BASE}/community", headers=h(maman_tok), timeout=30)
    record("Regression GET /community", r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")
    r = requests.get(f"{BASE}/rdv", headers=h(pro_tok), timeout=30)
    record("Regression GET /rdv (pro)", r.status_code == 200 and isinstance(r.json(), list), f"status={r.status_code}")
    try:
        login(ADMIN_EMAIL, ADMIN_PW)
        record("Regression admin login", True)
    except Exception as e:
        record("Regression admin login", False, str(e))

    # Summary
    passed = sum(1 for r_, _, _ in results if r_)
    total = len(results)
    print(f"\n=== {passed}/{total} passed ===")
    if passed < total:
        print("\nFailures:")
        for ok, name, detail in results:
            if not ok:
                print(f"  FAIL {name} — {detail}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
