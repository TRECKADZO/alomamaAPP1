"""
Backend tests for À lo Maman API — focused on new Centre de santé and Famille roles/endpoints.
"""
import os
import sys
import uuid
import requests

BASE = os.environ.get("BACKEND_URL") or "https://maman-mobile-mvp.preview.emergentagent.com"
API = f"{BASE}/api"

# Unique suffix so tests are idempotent across runs
SUFFIX = uuid.uuid4().hex[:6]

CENTRE_EMAIL = f"centre1+{SUFFIX}@test.com"
CENTRE_PW = "Centre123!"
PAPA_EMAIL = f"papa1+{SUFFIX}@test.com"
PAPA_PW = "Papa123!"
NEW_PRO_EMAIL = f"newpro+{SUFFIX}@test.com"
NEW_PRO_PW = "Pro123!"

MAMAN_EMAIL = "maman@test.com"
MAMAN_PW = "Maman123!"

results = []


def log(name, ok, info=""):
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {name}" + (f" — {info}" if info else "")
    print(line)
    results.append((name, ok, info))
    return ok


def post(path, token=None, json=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(f"{API}{path}", json=json, headers=headers, timeout=30)


def get(path, token=None, params=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{API}{path}", params=params, headers=headers, timeout=30)


def patch(path, token=None, json=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.patch(f"{API}{path}", json=json, headers=headers, timeout=30)


def delete(path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.delete(f"{API}{path}", headers=headers, timeout=30)


def main():
    # -------------------------------------------------------------
    # 1. Register Centre de santé
    # -------------------------------------------------------------
    payload = {
        "role": "centre_sante",
        "name": "Admin Centre Test",
        "email": CENTRE_EMAIL,
        "password": CENTRE_PW,
        "nom_centre": "Clinique Test Mobile",
        "type_etablissement": "clinique_privee",
        "adresse": "Rue 12, Yopougon",
        "ville": "Abidjan",
        "region": "Lagunes",
        "email_contact": "contact@cliniquetest.ci",
        "phone": "+22501234567",
    }
    r = post("/auth/register", json=payload)
    ok = r.status_code == 200
    centre_token = None
    centre_user_id = None
    if ok:
        data = r.json()
        centre_token = data.get("token")
        u = data.get("user", {})
        centre_user_id = u.get("id")
        ok = bool(centre_token) and u.get("role") == "centre_sante"
    log("1. Register Centre de santé (role=centre_sante, token+user)", ok,
        f"status={r.status_code} body={r.text[:200]}")

    # -------------------------------------------------------------
    # 2. Register Famille
    # -------------------------------------------------------------
    r = post("/auth/register", json={
        "role": "famille", "name": "Père Test",
        "email": PAPA_EMAIL, "password": PAPA_PW,
    })
    ok = r.status_code == 200
    papa_token = None
    if ok:
        data = r.json()
        papa_token = data.get("token")
        ok = bool(papa_token) and data.get("user", {}).get("role") == "famille"
    log("2. Register Famille (role=famille)", ok,
        f"status={r.status_code} body={r.text[:200]}")

    # -------------------------------------------------------------
    # 3. GET /centres/mine as centre_sante — verifies auto-created centre + code_invitation
    # -------------------------------------------------------------
    centre_id = None
    centre_code = None
    if centre_token:
        r = get("/centres/mine", token=centre_token)
        ok = r.status_code == 200
        if ok:
            c = r.json()
            centre_id = c.get("id")
            centre_code = c.get("code_invitation")
            ok = bool(centre_id) and bool(centre_code) and len(centre_code) == 6
        log("3. GET /centres/mine (auto-created centre with 6-char code)", ok,
            f"status={r.status_code} code_invitation={centre_code}")
    else:
        log("3. GET /centres/mine", False, "skipped — no centre_token")

    # -------------------------------------------------------------
    # 4. GET /centres (public, with q + region filters)
    # -------------------------------------------------------------
    r = get("/centres")
    ok = r.status_code == 200 and isinstance(r.json(), list)
    found = False
    if ok:
        found = any(c.get("id") == centre_id for c in r.json())
    log("4a. GET /centres (public list contains new centre)", ok and found,
        f"status={r.status_code} found={found}")

    r = get("/centres", params={"q": "Clinique"})
    ok = r.status_code == 200 and any(c.get("id") == centre_id for c in r.json())
    log("4b. GET /centres?q=Clinique matches new centre", ok,
        f"status={r.status_code}")

    r = get("/centres", params={"region": "Lagunes"})
    ok = r.status_code == 200 and any(c.get("id") == centre_id for c in r.json())
    log("4c. GET /centres?region=Lagunes matches new centre", ok,
        f"status={r.status_code}")

    # -------------------------------------------------------------
    # 5. GET /centres/{id} public
    # -------------------------------------------------------------
    if centre_id:
        r = get(f"/centres/{centre_id}")
        ok = r.status_code == 200 and r.json().get("id") == centre_id
        log("5. GET /centres/{id} (public detail)", ok, f"status={r.status_code}")
    else:
        log("5. GET /centres/{id}", False, "no centre_id")

    # -------------------------------------------------------------
    # 6. PATCH /centres/{id} as owner
    # -------------------------------------------------------------
    if centre_id and centre_token:
        patch_body = {
            "nom_centre": "Clinique Test Mobile",
            "services": ["Maternité", "Échographie"],
            "horaires": "Lun-Ven 8h-17h",
        }
        r = patch(f"/centres/{centre_id}", token=centre_token, json=patch_body)
        ok = r.status_code == 200
        if ok:
            c = r.json()
            ok = c.get("services") == ["Maternité", "Échographie"] and c.get("horaires") == "Lun-Ven 8h-17h"
        log("6. PATCH /centres/{id} as owner (update services+horaires)", ok,
            f"status={r.status_code} body={r.text[:200]}")
    else:
        log("6. PATCH /centres/{id}", False, "missing id/token")

    # -------------------------------------------------------------
    # Login as maman
    # -------------------------------------------------------------
    r = post("/auth/login", json={"email": MAMAN_EMAIL, "password": MAMAN_PW})
    ok = r.status_code == 200
    maman_token = r.json().get("token") if ok else None
    log("Login maman@test.com (regression)", ok, f"status={r.status_code}")

    # -------------------------------------------------------------
    # 7. POST /famille/create as maman — idempotent
    # -------------------------------------------------------------
    code_partage = None
    if maman_token:
        # Clean existing famille to test fresh create? The API is idempotent, so keeping existing is fine.
        r = post("/famille/create", token=maman_token)
        ok = r.status_code == 200
        f1 = r.json() if ok else {}
        code_partage = f1.get("code_partage")
        ok = ok and bool(code_partage) and len(code_partage) == 6
        log("7a. POST /famille/create (returns 6-char code_partage)", ok,
            f"status={r.status_code} code={code_partage}")

        # call again
        r = post("/famille/create", token=maman_token)
        ok = r.status_code == 200 and r.json().get("code_partage") == code_partage
        log("7b. POST /famille/create idempotent (same code)", ok,
            f"status={r.status_code}")
    else:
        log("7. POST /famille/create", False, "no maman_token")

    # -------------------------------------------------------------
    # 8. GET /famille as maman
    # -------------------------------------------------------------
    if maman_token:
        r = get("/famille", token=maman_token)
        ok = r.status_code == 200
        if ok:
            data = r.json()
            owned = data.get("owned") or {}
            ok = owned.get("code_partage") == code_partage and isinstance(owned.get("membres"), list)
        log("8. GET /famille as maman (owned.code_partage + membres list)", ok,
            f"status={r.status_code}")

    # -------------------------------------------------------------
    # 9. POST /famille/join as papa
    # -------------------------------------------------------------
    if papa_token and code_partage:
        r = post("/famille/join", token=papa_token,
                 json={"code": code_partage, "relation": "partenaire"})
        ok = r.status_code == 200
        if ok:
            f = r.json()
            members = f.get("membres", [])
            match = next((m for m in members if m.get("email") == PAPA_EMAIL), None)
            ok = bool(match) and match.get("statut") == "en_attente"
        log("9. POST /famille/join as papa (statut=en_attente)", ok,
            f"status={r.status_code} body={r.text[:200]}")
    else:
        log("9. POST /famille/join", False, "missing papa_token or code")

    # -------------------------------------------------------------
    # 10. GET /famille as maman — should now have 1 member
    # -------------------------------------------------------------
    if maman_token:
        r = get("/famille", token=maman_token)
        ok = r.status_code == 200
        if ok:
            owned = r.json().get("owned") or {}
            membres = owned.get("membres", [])
            match = next((m for m in membres if m.get("email") == PAPA_EMAIL), None)
            ok = bool(match) and match.get("statut") == "en_attente"
        log("10. GET /famille as maman (member papa en_attente)", ok,
            f"status={r.status_code}")

    # -------------------------------------------------------------
    # 11. PATCH /famille/members/{email} — statut + permissions
    # -------------------------------------------------------------
    if maman_token:
        r = patch(f"/famille/members/{PAPA_EMAIL}", token=maman_token,
                  json={"statut": "accepte"})
        ok = r.status_code == 200
        if ok:
            membres = r.json().get("membres", [])
            match = next((m for m in membres if m.get("email") == PAPA_EMAIL), None)
            ok = bool(match) and match.get("statut") == "accepte"
        log("11a. PATCH /famille/members (statut=accepte)", ok,
            f"status={r.status_code}")

        r = patch(f"/famille/members/{PAPA_EMAIL}", token=maman_token,
                  json={"permissions": {"grossesse": False, "enfants": True}})
        ok = r.status_code == 200
        if ok:
            membres = r.json().get("membres", [])
            match = next((m for m in membres if m.get("email") == PAPA_EMAIL), None)
            perms = (match or {}).get("permissions") or {}
            ok = perms.get("grossesse") is False and perms.get("enfants") is True
        log("11b. PATCH /famille/members (permissions updated)", ok,
            f"status={r.status_code} perms={perms if ok else 'N/A'}")

    # -------------------------------------------------------------
    # 12. GET /famille as papa — member_of should contain maman's family
    # -------------------------------------------------------------
    if papa_token:
        r = get("/famille", token=papa_token)
        ok = r.status_code == 200
        if ok:
            member_of = r.json().get("member_of") or []
            ok = any(f.get("code_partage") == code_partage for f in member_of)
        log("12. GET /famille as papa (member_of contains maman family)", ok,
            f"status={r.status_code}")

    # -------------------------------------------------------------
    # 13. DELETE /famille/members/{email}
    # -------------------------------------------------------------
    if maman_token:
        r = delete(f"/famille/members/{PAPA_EMAIL}", token=maman_token)
        ok = r.status_code == 200
        # verify gone
        r2 = get("/famille", token=maman_token)
        if r2.status_code == 200:
            membres = (r2.json().get("owned") or {}).get("membres", [])
            removed = not any(m.get("email") == PAPA_EMAIL for m in membres)
            ok = ok and removed
        log("13. DELETE /famille/members (removal works)", ok,
            f"status={r.status_code}")

    # -------------------------------------------------------------
    # 14. Regression — login existing Maman/Pro (already did maman above)
    # -------------------------------------------------------------
    r = post("/auth/login", json={"email": "pro@test.com", "password": "Pro123!"})
    ok = r.status_code == 200 and r.json().get("user", {}).get("role") == "professionnel"
    log("14a. Regression login pro@test.com", ok, f"status={r.status_code}")

    # Register new maman as regression
    maman_new_email = f"maman+{SUFFIX}@test.com"
    r = post("/auth/register", json={
        "role": "maman", "name": "Nouvelle Maman",
        "email": maman_new_email, "password": "Maman123!",
    })
    ok = r.status_code == 200 and r.json().get("user", {}).get("role") == "maman"
    log("14b. Regression register role=maman", ok, f"status={r.status_code}")

    # -------------------------------------------------------------
    # 15. Register Pro with code_invitation_centre
    # -------------------------------------------------------------
    if centre_code and centre_id:
        r = post("/auth/register", json={
            "role": "professionnel",
            "name": "Dr. Invité",
            "email": NEW_PRO_EMAIL,
            "password": NEW_PRO_PW,
            "specialite": "Gynécologue",
            "code_invitation_centre": centre_code,
        })
        ok = r.status_code == 200
        pro_id = r.json().get("user", {}).get("id") if ok else None
        log("15a. Register Pro with code_invitation_centre", ok,
            f"status={r.status_code}")

        # Verify centre.membres_pro contains pro_id
        if centre_token and pro_id:
            r = get("/centres/mine", token=centre_token)
            ok2 = r.status_code == 200
            if ok2:
                membres_pro = r.json().get("membres_pro", [])
                ok2 = pro_id in membres_pro
            log("15b. Centre membres_pro contains new pro", ok2,
                f"membres_pro={r.json().get('membres_pro') if r.status_code==200 else 'N/A'}")
    else:
        log("15. Pro with code invitation", False, "no centre code")

    # -------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    failures = [(n, i) for n, ok, i in results if not ok]
    if failures:
        print("\nFailures:")
        for n, i in failures:
            print(f"  - {n}: {i}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
