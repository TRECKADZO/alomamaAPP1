"""
Tests backend pour le module "Suivi du Développement & Dépistage TND (M-CHAT-R)"
Endpoints :
  - GET    /api/tnd/questions              (public)
  - POST   /api/tnd/screening              (maman/pro)
  - GET    /api/tnd/screenings/{enfant_id} (auth)
  - GET    /api/tnd/screening/{screening_id} (auth)
"""
import os
import sys
import json
import requests
from datetime import datetime, timezone

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"

results = []


def log(name, ok, detail=""):
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}{(' — ' + detail) if detail else ''}")
    results.append((ok, name, detail))


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    # ============================================================
    # 1) GET /tnd/questions (public, no auth)
    # ============================================================
    print("\n--- 1) GET /tnd/questions (public) ---")
    r = requests.get(f"{BASE}/tnd/questions", timeout=15)
    log("GET /tnd/questions 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    qs = data.get("questions") or []
    log("total = 20", data.get("total") == 20, f"total={data.get('total')}")
    log("version = M-CHAT-R v1.0 FR", data.get("version") == "M-CHAT-R v1.0 FR", f"version={data.get('version')}")
    log("len(questions) == 20", len(qs) == 20, f"len={len(qs)}")
    # Vérifier chaque question
    ids_ok = all(qs[i]["id"] == i + 1 for i in range(20))
    log("ids 1..20", ids_ok)
    has_fr = all(isinstance(q.get("fr"), str) and len(q["fr"]) > 5 for q in qs)
    log("chaque question a un libellé 'fr'", has_fr)
    crit_ok = all(q.get("critical_answer") in ("yes", "no") for q in qs)
    log("critical_answer dans ('yes','no')", crit_ok)
    weighted_ok = all(isinstance(q.get("weighted"), bool) for q in qs)
    log("weighted est bool", weighted_ok)
    weighted_true_ids = sorted([q["id"] for q in qs if q["weighted"]])
    log("weighted=true uniquement Q2,Q5,Q12", weighted_true_ids == [2, 5, 12], f"got={weighted_true_ids}")

    # ============================================================
    # 2) Login Maman + recover enfant_id
    # ============================================================
    print("\n--- 2) Login Maman + recover enfant_id ---")
    token_maman, user_maman = login(MAMAN_EMAIL, MAMAN_PASS)
    log("Login maman", True, f"user_id={user_maman['id']}")

    r = requests.get(f"{BASE}/enfants", headers=headers(token_maman), timeout=15)
    log("GET /enfants 200", r.status_code == 200)
    enfants = r.json() if r.status_code == 200 else []
    if not enfants:
        # Créer un enfant
        body = {
            "nom": "Adjoa TestTND",
            "date_naissance": "2024-05-01",
            "sexe": "F",
            "poids_kg": 9.5,
            "taille_cm": 72.0,
        }
        r2 = requests.post(f"{BASE}/enfants", headers=headers(token_maman), json=body, timeout=15)
        log("POST /enfants (création enfant test)", r2.status_code == 200, f"status={r2.status_code} {r2.text[:200]}")
        enfants = [r2.json()]
    enfant_id = enfants[0]["id"]
    log("enfant_id sélectionné", True, f"enfant_id={enfant_id}")

    # ============================================================
    # 3) POST /tnd/screening - All non-risk (score=0, level=faible)
    # ============================================================
    print("\n--- 3) POST /tnd/screening (faible) ---")
    answers_faible = {
        "1": "yes", "2": "no", "3": "yes", "4": "yes", "5": "no",
        "6": "yes", "7": "yes", "8": "yes", "9": "yes", "10": "yes",
        "11": "yes", "12": "no", "13": "yes", "14": "yes", "15": "yes",
        "16": "yes", "17": "yes", "18": "yes", "19": "yes", "20": "yes",
    }
    r = requests.post(
        f"{BASE}/tnd/screening",
        headers=headers(token_maman),
        json={"enfant_id": enfant_id, "answers": answers_faible},
        timeout=20,
    )
    log("POST /tnd/screening (faible) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        doc_faible = r.json()
        log("score == 0", doc_faible.get("score") == 0, f"score={doc_faible.get('score')}")
        log("level == 'faible'", doc_faible.get("level") == "faible", f"level={doc_faible.get('level')}")
        recos = doc_faible.get("recommandations") or {}
        log("recommandations.title contient '🟢 Risque faible'", recos.get("title") == "🟢 Risque faible", f"title={recos.get('title')}")
        log("recommandations.actions length >= 2", len(recos.get("actions") or []) >= 2, f"len={len(recos.get('actions') or [])}")
        screening_id_faible = doc_faible.get("id")
    else:
        doc_faible = None
        screening_id_faible = None

    # ============================================================
    # 4) POST /tnd/screening - score modéré (~5 risk points)
    # ============================================================
    print("\n--- 4) POST /tnd/screening (modere) ---")
    # critical_answer pour chaque question :
    # Q1=no, Q2=yes, Q3=no, Q4=no, Q5=yes, Q6=no, Q7=no, Q8=no, Q9=no, Q10=no,
    # Q11=no, Q12=yes, Q13=no, Q14=no, Q15=no, Q16=no, Q17=no, Q18=no, Q19=no, Q20=no
    # On déclenche 5 réponses à risque (Q1=no, Q3=no, Q4=no, Q6=no, Q7=no), reste non-risque
    answers_modere = {
        "1": "no",   # risque (critical=no)
        "2": "no",   # non-risque
        "3": "no",   # risque
        "4": "no",   # risque
        "5": "no",   # non-risque
        "6": "no",   # risque
        "7": "no",   # risque
        "8": "yes",  # non-risque
        "9": "yes",  # non-risque
        "10": "yes", # non-risque
        "11": "yes", # non-risque
        "12": "no",  # non-risque
        "13": "yes", # non-risque
        "14": "yes", # non-risque
        "15": "yes", # non-risque
        "16": "yes", # non-risque
        "17": "yes", # non-risque
        "18": "yes", # non-risque
        "19": "yes", # non-risque
        "20": "yes", # non-risque
    }
    r = requests.post(
        f"{BASE}/tnd/screening",
        headers=headers(token_maman),
        json={"enfant_id": enfant_id, "answers": answers_modere},
        timeout=20,
    )
    log("POST /tnd/screening (modere) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        doc_mod = r.json()
        log("score modere (3-7)", 3 <= doc_mod.get("score", 0) <= 7, f"score={doc_mod.get('score')}")
        log("level == 'modere'", doc_mod.get("level") == "modere", f"level={doc_mod.get('level')}")

    # ============================================================
    # 5) POST /tnd/screening - score élevé (10+ + Q2 critique)
    # ============================================================
    print("\n--- 5) POST /tnd/screening (eleve avec Q2 critique) ---")
    answers_eleve = {
        "1": "no",     # risque
        "2": "yes",    # risque + critique
        "3": "no",     # risque
        "4": "no",     # risque
        "5": "no",     # non-risque
        "6": "no",     # risque
        "7": "no",     # risque
        "8": "no",     # risque
        "9": "no",     # risque
        "10": "no",    # risque
        "11": "no",    # risque
        "12": "no",    # non-risque
        "13": "no",    # risque
        "14": "no",    # risque
        "15": "yes",   # non-risque
        "16": "yes",   # non-risque
        "17": "yes",   # non-risque
        "18": "yes",   # non-risque
        "19": "yes",   # non-risque
        "20": "yes",   # non-risque
    }
    r = requests.post(
        f"{BASE}/tnd/screening",
        headers=headers(token_maman),
        json={"enfant_id": enfant_id, "answers": answers_eleve},
        timeout=20,
    )
    log("POST /tnd/screening (eleve) 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        doc_el = r.json()
        log("score eleve (>=8)", doc_el.get("score", 0) >= 8, f"score={doc_el.get('score')}")
        log("level == 'eleve'", doc_el.get("level") == "eleve", f"level={doc_el.get('level')}")
        critical_risk = doc_el.get("critical_risk") or []
        log("critical_risk contient 2", 2 in critical_risk, f"critical_risk={critical_risk}")

    # ============================================================
    # 6) GET /tnd/screenings/{enfant_id} — sorted by created_at desc
    # ============================================================
    print("\n--- 6) GET /tnd/screenings/{enfant_id} ---")
    r = requests.get(f"{BASE}/tnd/screenings/{enfant_id}", headers=headers(token_maman), timeout=15)
    log("GET /tnd/screenings 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        arr = r.json()
        log("array length >= 3", isinstance(arr, list) and len(arr) >= 3, f"len={len(arr) if isinstance(arr,list) else 'na'}")
        # vérifier tri desc
        if isinstance(arr, list) and len(arr) >= 2:
            d0 = arr[0].get("created_at", "")
            d1 = arr[1].get("created_at", "")
            log("sorted desc by created_at", d0 >= d1, f"{d0} vs {d1}")

    # ============================================================
    # 7) GET /tnd/screening/{screening_id} — return doc
    # ============================================================
    print("\n--- 7) GET /tnd/screening/{screening_id} ---")
    if screening_id_faible:
        r = requests.get(f"{BASE}/tnd/screening/{screening_id_faible}", headers=headers(token_maman), timeout=15)
        log("GET /tnd/screening/{id} 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            d = r.json()
            log("doc.id == screening_id", d.get("id") == screening_id_faible)
            log("doc.level présent", "level" in d)
    else:
        log("GET /tnd/screening/{id} — skipped (création faible KO)", False)

    # ============================================================
    # 8) Validation : < 16 answered → 400
    # ============================================================
    print("\n--- 8) Validation < 16 answers ---")
    answers_short = {str(i): "yes" for i in range(1, 11)}  # only 10 answers
    r = requests.post(
        f"{BASE}/tnd/screening",
        headers=headers(token_maman),
        json={"enfant_id": enfant_id, "answers": answers_short},
        timeout=15,
    )
    log("POST /tnd/screening < 16 → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 400:
        detail = (r.json() or {}).get("detail", "")
        log("message 'Veuillez répondre à au moins 16'", "16" in detail and "questions" in detail.lower(), f"detail={detail}")

    # ============================================================
    # 9) Sécurité : enfant n'appartenant pas à la maman → 403
    # ============================================================
    print("\n--- 9) Sécurité — GET screenings of foreign enfant_id ---")
    # Créer un enfant pour un autre compte ; mais on n'a pas de compte facile.
    # On va créer un nouveau compte maman temporaire.
    import uuid as _uuid
    test_email = f"tnd.security.{_uuid.uuid4().hex[:8]}@alomaman.dev"
    register_body = {
        "email": test_email,
        "password": "Test1234!",
        "name": "Maman Sécurité Test",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = requests.post(f"{BASE}/auth/register", json=register_body, timeout=20)
    log("Création maman secondaire", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        token_b = r.json()["token"]
        # Créer un enfant pour cette nouvelle maman
        r2 = requests.post(
            f"{BASE}/enfants",
            headers=headers(token_b),
            json={"nom": "Enfant Sec", "date_naissance": "2024-01-01", "sexe": "M"},
            timeout=15,
        )
        log("Création enfant pour maman secondaire", r2.status_code == 200, f"status={r2.status_code}")
        if r2.status_code == 200:
            foreign_enfant_id = r2.json()["id"]
            # Tentative maman1 d'accéder aux screenings de l'enfant maman2 → 403
            r3 = requests.get(f"{BASE}/tnd/screenings/{foreign_enfant_id}", headers=headers(token_maman), timeout=15)
            log("GET /tnd/screenings d'un enfant étranger → 403", r3.status_code == 403, f"status={r3.status_code} body={r3.text[:200]}")

    # Récap
    total = len(results)
    passed = sum(1 for r, *_ in results if r)
    print(f"\n=========== RÉSULTATS : {passed}/{total} PASS ===========")
    failures = [(n, d) for ok, n, d in results if not ok]
    if failures:
        print("\nÉCHECS :")
        for n, d in failures:
            print(f"  ❌ {n}{(' — ' + d) if d else ''}")
    return passed == total


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
