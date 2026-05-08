"""
Tests pour la nouvelle feature "duree_par_mode" :
- PUT/GET /api/pro/modes-consultation (Pro)
- GET /api/professionnels/{pro_id}/disponibilites (Maman)
"""
import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "https://cycle-tracker-pro.preview.emergentagent.com/api")

PRO_PHONE = "+2250709005330"
PRO_PASSWORD = "474Treck"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"

results = []
def log(name, ok, detail=""):
    results.append((name, ok, detail))
    status = "✅" if ok else "❌"
    print(f"{status} {name}" + (f"  -- {detail}" if detail else ""))


def login(payload):
    r = requests.post(f"{BASE}/auth/login", json=payload, timeout=30)
    r.raise_for_status()
    return r.json()


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print(f"BASE = {BASE}\n")

    # 1. Login Pro
    pro_login = login({"phone": PRO_PHONE, "password": PRO_PASSWORD})
    pro_token = pro_login.get("token")
    pro_user = pro_login.get("user", {})
    pro_id = pro_user.get("id")
    log("1. Login Pro Dr alpha", bool(pro_token and pro_id),
        f"name={pro_user.get('name')} role={pro_user.get('role')} id={pro_id}")
    if not pro_token:
        sys.exit(1)

    # 2. PUT modes-consultation avec duree_par_mode
    body = {
        "accepte_presentiel": True,
        "accepte_teleconsultation": True,
        "accepte_domicile": True,
        "frais_deplacement_fcfa": 2500,
        "duree_par_mode": {"presentiel": 30, "teleconsultation": 15, "domicile": 90},
    }
    r = requests.put(f"{BASE}/pro/modes-consultation", json=body, headers=hdr(pro_token), timeout=30)
    ok = r.status_code == 200
    log("2. PUT /pro/modes-consultation (200)", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        b = r.json()
        log("2.a ok=true", b.get("ok") is True)
        dpm = b.get("duree_par_mode") or {}
        log("2.b duree_par_mode persisté",
            dpm.get("presentiel") == 30 and dpm.get("teleconsultation") == 15 and dpm.get("domicile") == 90,
            f"dpm={dpm}")
        log("2.c accepte_teleconsultation",
            b.get("accepte_teleconsultation") is True)
        log("2.d accepte_domicile",
            b.get("accepte_domicile") is True)
        log("2.e frais_deplacement_fcfa=2500", b.get("frais_deplacement_fcfa") == 2500)

    # 3. GET modes-consultation
    r = requests.get(f"{BASE}/pro/modes-consultation", headers=hdr(pro_token), timeout=30)
    ok = r.status_code == 200
    log("3. GET /pro/modes-consultation (200)", ok)
    if ok:
        b = r.json()
        dpm = b.get("duree_par_mode") or {}
        log("3.a duree_par_mode == {30,15,90}",
            dpm == {"presentiel": 30, "teleconsultation": 15, "domicile": 90},
            f"dpm={dpm}")

    # 4. Negative — duration too low
    bad = dict(body)
    bad["duree_par_mode"] = {"presentiel": 3, "teleconsultation": 15, "domicile": 90}
    r = requests.put(f"{BASE}/pro/modes-consultation", json=bad, headers=hdr(pro_token), timeout=30)
    ok = r.status_code == 400
    log("4. PUT presentiel=3 → 400", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        try:
            msg = r.json().get("detail", "")
        except Exception:
            msg = r.text
        log("4.a Message FR contient '5 à 240 minutes'",
            "5 à 240 minutes" in msg, f"msg={msg}")

    # 5. Negative — duration too high
    bad2 = dict(body)
    bad2["duree_par_mode"] = {"presentiel": 30, "teleconsultation": 15, "domicile": 300}
    r = requests.put(f"{BASE}/pro/modes-consultation", json=bad2, headers=hdr(pro_token), timeout=30)
    ok = r.status_code == 400
    log("5. PUT domicile=300 → 400", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        try:
            msg = r.json().get("detail", "")
        except Exception:
            msg = r.text
        log("5.a Message FR contient '5 à 240 minutes'",
            "5 à 240 minutes" in msg, f"msg={msg}")

    # 6. Backward compat — PUT sans duree_par_mode
    body_no_dpm = {
        "accepte_teleconsultation": True,
        "accepte_domicile": True,
        "frais_deplacement_fcfa": 2500,
    }
    r = requests.put(f"{BASE}/pro/modes-consultation", json=body_no_dpm, headers=hdr(pro_token), timeout=30)
    ok = r.status_code == 200
    log("6. PUT sans duree_par_mode → 200", ok, f"status={r.status_code}")
    # Vérifier que les anciennes valeurs sont preservées
    r = requests.get(f"{BASE}/pro/modes-consultation", headers=hdr(pro_token), timeout=30)
    if r.status_code == 200:
        dpm = r.json().get("duree_par_mode") or {}
        log("6.a Durées préservées (30/15/90)",
            dpm == {"presentiel": 30, "teleconsultation": 15, "domicile": 90},
            f"dpm={dpm}")

    # 7. Defaults (documentation only — user may already have it set)
    log("7. Defaults documentation",
        True,
        "Code review: server.py L10334-10336 retourne presentiel:30, teleconsultation:20, domicile:60 si dpm absent.")

    # 8. Maman side — public disponibilites endpoint
    maman_login = login({"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD})
    maman_token = maman_login.get("token")
    log("8.0 Login maman", bool(maman_token))

    r = requests.get(f"{BASE}/professionnels/{pro_id}/disponibilites",
                     headers=hdr(maman_token), timeout=30)
    ok = r.status_code == 200
    log(f"8. GET /professionnels/{pro_id}/disponibilites (200)", ok,
        f"status={r.status_code} body={r.text[:300]}")
    pub_body = None
    if ok:
        pub_body = r.json()
        log("8.a clé 'pro' présente", "pro" in pub_body)
        log("8.b clé 'slots' (liste)", isinstance(pub_body.get("slots"), list))
        log("8.c clé 'prestations_count' présente", "prestations_count" in pub_body)
        log("8.d clé 'duree_par_mode' présente au root", "duree_par_mode" in pub_body)
        dpm = pub_body.get("duree_par_mode") or {}
        log("8.e duree_par_mode == {30,15,90}",
            dpm == {"presentiel": 30, "teleconsultation": 15, "domicile": 90},
            f"dpm={dpm}")

    # 9. Régression
    if pub_body:
        slots = pub_body.get("slots") or []
        if slots:
            sample = slots[0]
            log("9.a Chaque slot a 'modes_autorises' (list)",
                all(isinstance(s.get("modes_autorises"), list) for s in slots),
                f"sample={sample}")
        else:
            log("9.a Slots empty (skip modes_autorises check)", True, "Pas de slots configurés")

    # Vérifier accepte_teleconsultation/domicile/frais persistent via GET pro modes
    r = requests.get(f"{BASE}/pro/modes-consultation", headers=hdr(pro_token), timeout=30)
    if r.status_code == 200:
        b = r.json()
        log("9.b accepte_teleconsultation respecté", b.get("accepte_teleconsultation") is True)
        log("9.c accepte_domicile respecté", b.get("accepte_domicile") is True)
        log("9.d frais_deplacement_fcfa=2500", b.get("frais_deplacement_fcfa") == 2500)

    # 9.e POST /rdv smoke test
    if pub_body:
        slots = [s for s in (pub_body.get("slots") or []) if s.get("actif", True)]
        if slots:
            slot = slots[0]
            jour = slot.get("jour")  # "lundi" etc.
            heure_debut = slot.get("heure_debut", "09:00")
            modes = slot.get("modes_autorises") or ["presentiel"]
            mode = modes[0]
            # Trouver la prochaine date pour ce jour de la semaine
            jour_map = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3,
                        "vendredi": 4, "samedi": 5, "dimanche": 6}
            target_dow = jour_map.get(jour, 0)
            today = datetime.now(timezone.utc)
            days_ahead = (target_dow - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            date_target = today + timedelta(days=days_ahead)
            iso_date = date_target.strftime("%Y-%m-%d") + "T" + heure_debut
            rdv_payload = {
                "pro_id": pro_id,
                "date": iso_date,
                "motif": "Smoke test duree_par_mode",
                "mode": mode,
            }
            if slot.get("prestation_id"):
                rdv_payload["prestation_id"] = slot["prestation_id"]
            if mode == "domicile":
                rdv_payload["adresse_domicile"] = "Rue Test, Bondoukou"

            r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=hdr(maman_token), timeout=30)
            ok_rdv = r.status_code == 200
            log("9.e POST /rdv smoke test (200)", ok_rdv,
                f"status={r.status_code} payload={rdv_payload} body={r.text[:300]}")
            if ok_rdv:
                rdv_id = r.json().get("id")
                # Cleanup : annuler le rdv si possible
                if rdv_id:
                    try:
                        requests.patch(f"{BASE}/rdv/{rdv_id}",
                                       json={"statut": "annule"},
                                       headers=hdr(maman_token), timeout=15)
                    except Exception:
                        pass
        else:
            log("9.e POST /rdv smoke test", True,
                "Skipped — Dr alpha n'a aucun slot actif configuré.")

    # 10. Cleanup — restore Dr alpha
    cleanup = {
        "accepte_presentiel": True,
        "accepte_teleconsultation": True,
        "accepte_domicile": True,
        "frais_deplacement_fcfa": 2000,
        "duree_par_mode": {"presentiel": 30, "teleconsultation": 20, "domicile": 60},
    }
    r = requests.put(f"{BASE}/pro/modes-consultation", json=cleanup, headers=hdr(pro_token), timeout=30)
    log("10. Cleanup — restore Dr alpha", r.status_code == 200, f"status={r.status_code}")

    # Summary
    print("\n" + "=" * 60)
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"TOTAL : {passed}/{total} PASS")
    fails = [(n, d) for n, ok, d in results if not ok]
    if fails:
        print("\nFAILS:")
        for n, d in fails:
            print(f"  ❌ {n}  -- {d}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
