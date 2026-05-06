#!/usr/bin/env python3
"""
Backend tests — DMP Oui/Non responses + Bilan rapide.

Covers:
 - POST /enfants/{eid}/dmp/{milestone_id} with body {response: "oui"|"non"}
 - Legacy compat (no body → "oui")
 - Invalid response value → 400
 - Invalid milestone → 404
 - Cross-maman → 403
 - DELETE → clears response
 - GET /enfants/{eid}/dmp → response field, statuts (acquis/non_acquis/alerte/en_cours/trop_jeune),
   couverture {repondus, attendus, pct}, domain.non_acquis count
 - GET /enfants/{eid}/dmp/bilan-rapide — pending list sorted late-first
 - Pro access OK on existing RDV child
 - Legacy dmp_progress doc without `response` → reported as "oui"
"""
import os
import sys
import time
import json
import uuid
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PW = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PW = "Test1234!"

CHILD_ID = "e41c8152-305e-4014-a4f8-4459d955a6cf"

PASS, FAIL = [], []

def check(cond, name, detail=""):
    if cond:
        PASS.append(name)
        print(f"  OK   {name}")
    else:
        FAIL.append(f"{name} — {detail}")
        print(f"  FAIL {name} — {detail}")


def login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def h(t):
    return {"Authorization": f"Bearer {t}"}


def register_random_maman(nickname):
    email = f"{nickname}_{int(time.time())}@test.alomaman.dev"
    body = {
        "email": email,
        "password": "Test1234!",
        "name": f"Maman {nickname.capitalize()}",
        "role": "maman",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    r = requests.post(f"{BASE}/auth/register", json=body, timeout=15)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def section(name):
    print(f"\n── {name} ──")


def cleanup_child_dmp(token):
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(token), timeout=15)
    if r.status_code != 200:
        return
    items = r.json().get("items") or []
    for it in items:
        if it.get("response") is not None:
            requests.delete(f"{BASE}/enfants/{CHILD_ID}/dmp/{it['id']}", headers=h(token), timeout=15)


def main():
    section("0. Login MAMAN + PRO")
    maman_token = login(MAMAN_EMAIL, MAMAN_PW)
    pro_token = login(PRO_EMAIL, PRO_PW)
    me_m = requests.get(f"{BASE}/auth/me", headers=h(maman_token), timeout=10).json()
    me_p = requests.get(f"{BASE}/auth/me", headers=h(pro_token), timeout=10).json()
    check(me_m.get("role") == "maman", "Maman logged in")
    check(me_p.get("role") == "professionnel", "Pro logged in")

    section("1. Clean DMP state + initial GET /dmp")
    cleanup_child_dmp(maman_token)
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15)
    check(r.status_code == 200, "Initial GET /dmp 200")
    initial = r.json()
    age_mois = initial.get("age_mois")
    print(f"     child age_mois={age_mois}")
    check(isinstance(age_mois, int) and 2 <= age_mois <= 6, "child age ~3 months", f"got {age_mois}")
    check("couverture" in initial, "couverture field present")
    cov0 = initial["couverture"]
    check(set(cov0.keys()) == {"repondus", "attendus", "pct"}, "couverture keys", f"keys={list(cov0.keys())}")
    check(cov0["repondus"] == 0, "initial couverture.repondus == 0", f"got {cov0['repondus']}")
    dom0 = initial.get("domains") or []
    check(all("non_acquis" in d for d in dom0), "each domain has non_acquis field")
    items0 = initial.get("items") or []
    check(all(it.get("response") is None for it in items0), "all items response=None initially")

    section("2. POST response='oui' for mg_tient_tete → acquis")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/mg_tient_tete",
        headers=h(maman_token),
        json={"response": "oui"}, timeout=15,
    )
    check(r.status_code == 200, "POST oui 200", f"status={r.status_code} body={r.text[:200]}")
    j = r.json()
    check(j.get("ok") is True and j.get("milestone_id") == "mg_tient_tete" and j.get("response") == "oui",
          "POST oui response body", f"got {j}")

    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "mg_tient_tete"), None)
    check(it is not None, "mg_tient_tete in items")
    check(it["response"] == "oui", "mg_tient_tete.response=oui", f"got {it.get('response')}")
    check(it["statut"] == "acquis", "mg_tient_tete.statut=acquis", f"got {it.get('statut')}")
    check(it.get("acquis") is True, "mg_tient_tete.acquis=true (compat)")
    check(r2["couverture"]["repondus"] == 1, "couverture.repondus=1",
          f"got {r2['couverture']}")
    dom_mg = next((d for d in r2["domains"] if d["key"] == "moteur_global"), None)
    check(dom_mg and dom_mg["acquis"] >= 1, "moteur_global.acquis >= 1", f"got {dom_mg}")

    section("3. POST response='non' for mg_retournement (typique=5, alerte=7) — age=3 → non_acquis")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/mg_retournement",
        headers=h(maman_token),
        json={"response": "non"}, timeout=15,
    )
    check(r.status_code == 200 and r.json().get("response") == "non", "POST non 200+body",
          f"status={r.status_code} body={r.text[:200]}")
    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "mg_retournement"), None)
    check(it and it["response"] == "non", "mg_retournement.response=non")
    check(it and it["statut"] == "non_acquis", "mg_retournement.statut=non_acquis (age<=alerte)",
          f"got {it.get('statut') if it else None}")

    section("4. POST 'non' for lr_reagit_voix (typique=3,alerte=5) — age=3, 3<=5 → non_acquis")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/lr_reagit_voix",
        headers=h(maman_token),
        json={"response": "non"}, timeout=15,
    )
    check(r.status_code == 200, "POST 200")
    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "lr_reagit_voix"), None)
    check(it and it["statut"] == "non_acquis",
          "lr_reagit_voix statut=non_acquis", f"got {it.get('statut') if it else None}")

    section("5. POST 'non' for se_sourire_social (typique=2,alerte=4) — age=3 → non_acquis")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/se_sourire_social",
        headers=h(maman_token),
        json={"response": "non"}, timeout=15,
    )
    check(r.status_code == 200, "POST 200")
    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "se_sourire_social"), None)
    check(it and it["statut"] == "non_acquis",
          "se_sourire_social statut=non_acquis", f"got {it.get('statut') if it else None}")

    # Couverture : repondus counts only milestones whose age_typique <= age_mois AND response in oui/non
    # Answered: mg_tient_tete (3<=3 yes), mg_retournement (5>3 NO), lr_reagit_voix (3<=3 yes), se_sourire_social (2<=3 yes)
    # → repondus = 3
    cov = r2["couverture"]
    print(f"     couverture={cov}")
    check(cov["repondus"] == 3, "couverture.repondus=3 (expected-age answered only)",
          f"got {cov['repondus']}")
    check(cov["pct"] > 0, "couverture.pct > 0")
    dom_mg = next(d for d in r2["domains"] if d["key"] == "moteur_global")
    dom_lr = next(d for d in r2["domains"] if d["key"] == "langage_receptif")
    dom_se = next(d for d in r2["domains"] if d["key"] == "social_emotionnel")
    check(dom_mg["non_acquis"] == 1, "moteur_global.non_acquis=1", f"got {dom_mg['non_acquis']}")
    check(dom_lr["non_acquis"] == 1, "langage_receptif.non_acquis=1", f"got {dom_lr['non_acquis']}")
    check(dom_se["non_acquis"] == 1, "social_emotionnel.non_acquis=1", f"got {dom_se['non_acquis']}")

    section("6. Invalid response='maybe' → 400")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/mg_tient_tete",
        headers=h(maman_token), json={"response": "maybe"}, timeout=15,
    )
    check(r.status_code == 400, "POST maybe → 400", f"status={r.status_code} body={r.text[:200]}")

    section("7. Invalid milestone_id → 404")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/this_does_not_exist",
        headers=h(maman_token), json={"response": "oui"}, timeout=15,
    )
    check(r.status_code == 404, "POST invalid milestone → 404", f"status={r.status_code}")

    section("8. POST WITHOUT body → legacy compat, defaults to 'oui'")
    requests.delete(f"{BASE}/enfants/{CHILD_ID}/dmp/mf_suit_objet", headers=h(maman_token), timeout=15)
    r = requests.post(f"{BASE}/enfants/{CHILD_ID}/dmp/mf_suit_objet", headers=h(maman_token), timeout=15)
    check(r.status_code == 200, "POST no body 200", f"status={r.status_code} body={r.text[:200]}")
    check(r.json().get("response") == "oui", "POST no body → response=oui (legacy)",
          f"got {r.json()}")
    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "mf_suit_objet"), None)
    check(it and it["response"] == "oui" and it["statut"] == "acquis",
          "GET mf_suit_objet response=oui statut=acquis",
          f"got {it}")

    section("9. DELETE clears response, goes back to default")
    r = requests.delete(f"{BASE}/enfants/{CHILD_ID}/dmp/mg_tient_tete", headers=h(maman_token), timeout=15)
    check(r.status_code == 200, "DELETE 200")
    r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
    it = next((i for i in r2["items"] if i["id"] == "mg_tient_tete"), None)
    check(it and it["response"] is None, "mg_tient_tete.response=None after DELETE",
          f"got response={it.get('response') if it else 'N/A'}")
    check(it and it["statut"] in ("en_cours", "trop_jeune"),
          "statut back to en_cours/trop_jeune", f"got {it.get('statut') if it else None}")

    section("10. GET /dmp/bilan-rapide — only expected-age unanswered items, sorted late-first")
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp/bilan-rapide", headers=h(maman_token), timeout=15)
    check(r.status_code == 200, "GET bilan-rapide 200", f"status={r.status_code} body={r.text[:200]}")
    br = r.json()
    check(set(br.keys()) >= {"enfant", "age_mois", "items", "total"},
          "bilan-rapide top-level keys", f"keys={list(br.keys())}")
    check(br.get("age_mois") == age_mois, "age_mois same as /dmp")
    ids_pending = [it["id"] for it in br["items"]]
    print(f"     pending ids={ids_pending}")
    check("mg_tient_tete" in ids_pending, "mg_tient_tete in pending (just deleted)")
    check("mf_suit_objet" not in ids_pending, "mf_suit_objet NOT in pending (already answered)")
    check("lr_reagit_voix" not in ids_pending, "lr_reagit_voix NOT in pending")
    check("se_sourire_social" not in ids_pending, "se_sourire_social NOT in pending")
    check("mg_retournement" not in ids_pending, "mg_retournement NOT in pending (typique>age)")
    check(all(it["age_typique"] <= age_mois for it in br["items"]),
          "all pending have age_typique <= age_mois")
    non_late = [it for it in br["items"] if not (age_mois > it["age_alerte"])]
    typiques = [it["age_typique"] for it in non_late]
    check(typiques == sorted(typiques), "non-late pending sorted by age_typique asc",
          f"got {typiques}")

    section("11. Answer all remaining pending → bilan-rapide becomes empty")
    for it in br["items"]:
        requests.post(f"{BASE}/enfants/{CHILD_ID}/dmp/{it['id']}", headers=h(maman_token),
                      json={"response": "oui"}, timeout=15)
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp/bilan-rapide", headers=h(maman_token), timeout=15).json()
    check(r["total"] == 0 and r["items"] == [], "bilan-rapide empty after answering all",
          f"got total={r['total']} items_len={len(r['items'])}")

    section("12. PRO access works")
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(pro_token), timeout=15)
    check(r.status_code == 200, "GET /dmp as PRO 200", f"status={r.status_code} body={r.text[:200]}")
    r = requests.post(
        f"{BASE}/enfants/{CHILD_ID}/dmp/mg_retournement",
        headers=h(pro_token), json={"response": "oui"}, timeout=15,
    )
    check(r.status_code == 200 and r.json().get("response") == "oui",
          "POST /dmp as PRO (change non→oui) 200",
          f"status={r.status_code} body={r.text[:200]}")
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp/bilan-rapide", headers=h(pro_token), timeout=15)
    check(r.status_code == 200, "GET bilan-rapide as PRO 200")

    section("13. Different MAMAN → 403 everywhere")
    other_token, other_user = register_random_maman("other_dmp")
    try:
        r = requests.post(
            f"{BASE}/enfants/{CHILD_ID}/dmp/mg_tient_tete",
            headers=h(other_token), json={"response": "oui"}, timeout=15,
        )
        check(r.status_code == 403, "POST as other maman → 403", f"status={r.status_code}")
        r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(other_token), timeout=15)
        check(r.status_code == 403, "GET /dmp as other maman → 403", f"status={r.status_code}")
        r = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp/bilan-rapide", headers=h(other_token), timeout=15)
        check(r.status_code == 403, "GET bilan-rapide as other maman → 403", f"status={r.status_code}")
    finally:
        try:
            requests.request(
                "DELETE", f"{BASE}/auth/me",
                headers=h(other_token),
                json={"password": "Test1234!", "confirmation": "SUPPRIMER"}, timeout=15,
            )
        except Exception:
            pass

    section("14. Legacy dmp_progress doc (no `response`) → reported as 'oui'")
    try:
        from pymongo import MongoClient
        import re
        env = {}
        with open("/app/backend/.env") as f:
            for line in f:
                m = re.match(r"^\s*([A-Z_]+)\s*=\s*(.+?)\s*$", line.strip())
                if m:
                    env[m.group(1)] = m.group(2).strip('"').strip("'")
        mongo_url = env.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = env.get("DB_NAME", "alomaman")
        mc = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
        mdb = mc[db_name]
        legacy_mid = "co_objet_cache_partiel"  # typique=7 → trop_jeune by default at age 3
        mdb.dmp_progress.delete_many({"enfant_id": CHILD_ID, "milestone_id": legacy_mid})
        mdb.dmp_progress.insert_one({
            "enfant_id": CHILD_ID,
            "milestone_id": legacy_mid,
            "acquired_at": "2025-01-01T00:00:00+00:00",
            "acquired_by": "legacy",
        })
        r2 = requests.get(f"{BASE}/enfants/{CHILD_ID}/dmp", headers=h(maman_token), timeout=15).json()
        it = next((i for i in r2["items"] if i["id"] == legacy_mid), None)
        check(it and it["response"] == "oui", "legacy doc (no response) → reported as 'oui'",
              f"got response={it.get('response') if it else None}")
        check(it and it["statut"] == "acquis", "legacy doc → statut=acquis",
              f"got statut={it.get('statut') if it else None}")
        mdb.dmp_progress.delete_many({"enfant_id": CHILD_ID, "milestone_id": legacy_mid})
    except Exception as e:
        FAIL.append(f"legacy doc test skipped — {e}")
        print(f"  FAIL legacy doc test exception: {e}")

    # Final cleanup
    cleanup_child_dmp(maman_token)

    print("\n" + "=" * 60)
    print(f"PASS: {len(PASS)}  |  FAIL: {len(FAIL)}")
    print("=" * 60)
    if FAIL:
        print("\nFailures:")
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
