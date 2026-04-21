"""
Backend tests — Phase 5 : CENTRE, ADMIN, FAMILLE shared view, QUESTIONS SPÉCIALISTES
Runs against http://localhost:8001/api
"""
import sys
import httpx

BASE = "http://localhost:8001/api"

ADMIN = ("admin@alomaman.com", "Admin123!")
MAMAN = ("maman@test.com", "Maman123!")
PRO = ("pro@test.com", "Pro123!")
CENTRE = ("centre1@test.com", "Centre123!")
PAPA = ("papa1@test.com", "Papa123!")

results = []


def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} — {detail}")
    results.append((name, ok, detail))


def login(email, password):
    r = httpx.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        return None, r
    return r.json(), r


def register(payload):
    r = httpx.post(f"{BASE}/auth/register", json=payload, timeout=20)
    return r


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------
# Ensure all 5 accounts exist
# --------------------------------------------------------------------
def ensure_account(email, password, register_payload):
    data, r = login(email, password)
    if data:
        return data
    # Try to register
    rr = register(register_payload)
    if rr.status_code not in (200, 201):
        log(f"register {email}", False, f"{rr.status_code} {rr.text[:200]}")
        return None
    return rr.json()


admin_data, _ = login(*ADMIN)
maman_data, _ = login(*MAMAN)
pro_data, _ = login(*PRO)

if not admin_data:
    log("admin login", False, "cannot login admin — abort")
    sys.exit(1)
if not maman_data:
    log("maman login", False, "cannot login maman — abort")
    sys.exit(1)
if not pro_data:
    log("pro login", False, "cannot login pro — abort")
    sys.exit(1)

centre_reg_payload = {
    "email": CENTRE[0],
    "password": CENTRE[1],
    "name": "Centre Test Manager",
    "role": "centre_sante",
    "phone": "+22890000010",
    "nom_centre": "Clinique Test Phase5",
    "type_etablissement": "clinique_privee",
    "adresse": "12 Rue de Lomé",
    "ville": "Lomé",
    "region": "Maritime",
    "email_contact": CENTRE[0],
}
centre_data = ensure_account(CENTRE[0], CENTRE[1], centre_reg_payload)
if not centre_data:
    sys.exit(1)

papa_reg_payload = {
    "email": PAPA[0],
    "password": PAPA[1],
    "name": "Papa Test",
    "role": "famille",
    "phone": "+22890000020",
}
papa_data = ensure_account(PAPA[0], PAPA[1], papa_reg_payload)
if not papa_data:
    sys.exit(1)

admin_tok = admin_data["token"]
maman_tok = maman_data["token"]
pro_tok = pro_data["token"]
centre_tok = centre_data["token"]
papa_tok = papa_data["token"]

maman_user = maman_data["user"]
pro_user = pro_data["user"]


# --------------------------------------------------------------------
# CENTRE endpoints
# --------------------------------------------------------------------
print("\n=== CENTRE endpoints ===")

r = httpx.get(f"{BASE}/centre/membres", headers=auth_headers(centre_tok), timeout=20)
log("1. GET /centre/membres", r.status_code == 200 and isinstance(r.json(), list),
    f"status={r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")

r = httpx.get(f"{BASE}/centre/rdv", headers=auth_headers(centre_tok), timeout=20)
log("2. GET /centre/rdv", r.status_code == 200 and isinstance(r.json(), list),
    f"status={r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")

r = httpx.get(f"{BASE}/centre/tarifs", headers=auth_headers(centre_tok), timeout=20)
ok3 = r.status_code == 200 and isinstance(r.json(), list)
log("3. GET /centre/tarifs (initial)", ok3, f"status={r.status_code} body={r.json() if r.status_code == 200 else r.text[:100]}")

tarifs_body = [
    {"acte": "Consultation prénatale", "prix_fcfa": 15000, "description": "30 min"},
    {"acte": "Échographie 2D", "prix_fcfa": 25000, "description": "Doppler inclus"},
]
r = httpx.put(f"{BASE}/centre/tarifs", json=tarifs_body, headers=auth_headers(centre_tok), timeout=20)
ok4 = r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) == 2
log("4. PUT /centre/tarifs", ok4, f"status={r.status_code} saved={len(r.json()) if r.status_code == 200 else '?'}")

r = httpx.get(f"{BASE}/centre/tarifs", headers=auth_headers(centre_tok), timeout=20)
if r.status_code == 200:
    js = r.json()
    ok5 = len(js) == 2 and all("id" in t and t.get("prix_fcfa") and t.get("acte") for t in js)
else:
    ok5 = False
log("5. GET /centre/tarifs (after PUT)", ok5, f"{r.json() if r.status_code == 200 else r.text[:100]}")

# 6. POST /centre/membres/remove (no error even for pro not in list)
r = httpx.post(f"{BASE}/centre/membres/remove", json={"pro_id": "00000000-0000-0000-0000-000000000000"},
               headers=auth_headers(centre_tok), timeout=20)
log("6. POST /centre/membres/remove (non-existent pro)", r.status_code == 200, f"status={r.status_code}")

# Role check: maman trying centre endpoints should 403
r = httpx.get(f"{BASE}/centre/tarifs", headers=auth_headers(maman_tok), timeout=20)
log("6b. maman→/centre/tarifs 403", r.status_code == 403, f"status={r.status_code}")


# --------------------------------------------------------------------
# ADMIN endpoints
# --------------------------------------------------------------------
print("\n=== ADMIN endpoints ===")

r = httpx.get(f"{BASE}/admin/analytics", headers=auth_headers(admin_tok), timeout=30)
ok7 = False
if r.status_code == 200:
    j = r.json()
    ok7 = (
        "activity_7d" in j and isinstance(j["activity_7d"], dict)
        and all(k in j["activity_7d"] for k in ("new_users", "new_rdv", "new_posts"))
        and "roles_distribution" in j and isinstance(j["roles_distribution"], dict)
        and "top_villes" in j and isinstance(j["top_villes"], list)
        and "premium_users" in j
        and "rdv_par_statut" in j and isinstance(j["rdv_par_statut"], dict)
    )
log("7. GET /admin/analytics structure", ok7, f"status={r.status_code} keys={list(r.json().keys()) if r.status_code == 200 else r.text[:120]}")

r = httpx.get(f"{BASE}/admin/audit", headers=auth_headers(admin_tok), timeout=20)
ok8 = False
if r.status_code == 200:
    j = r.json()
    ok8 = all(k in j for k in ("recent_users", "recent_rdv", "recent_centres"))
log("8. GET /admin/audit", ok8, f"status={r.status_code}")

# 9. PATCH /admin/users/{user_id} premium true → premium_until set 30d ahead
target_uid = maman_user["id"]
r = httpx.patch(f"{BASE}/admin/users/{target_uid}", json={"premium": True},
                headers=auth_headers(admin_tok), timeout=20)
ok9 = False
detail9 = ""
if r.status_code == 200:
    # Re-fetch user via admin/users or /admin/audit... use direct query via admin/users
    ur = httpx.get(f"{BASE}/admin/users", headers=auth_headers(admin_tok), timeout=20)
    if ur.status_code == 200:
        users = ur.json()
        u = next((x for x in users if x["id"] == target_uid), None)
        if u and u.get("premium") is True and u.get("premium_until"):
            from datetime import datetime, timezone, timedelta
            try:
                pu = datetime.fromisoformat(u["premium_until"].replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                days = (pu - now).days
                ok9 = 28 <= days <= 31
                detail9 = f"premium_until={u['premium_until']} days_ahead={days}"
            except Exception as e:
                detail9 = f"parse error: {e}"
        else:
            detail9 = f"premium={u.get('premium') if u else 'no user'} premium_until={u.get('premium_until') if u else '?'}"
log("9. PATCH /admin/users premium=true", ok9, detail9 or f"status={r.status_code}")

# 10. PATCH /admin/users/{user_id} role → "maman"
r = httpx.patch(f"{BASE}/admin/users/{target_uid}", json={"role": "maman"},
                headers=auth_headers(admin_tok), timeout=20)
ok10 = False
if r.status_code == 200:
    ur = httpx.get(f"{BASE}/admin/users", headers=auth_headers(admin_tok), timeout=20)
    if ur.status_code == 200:
        u = next((x for x in ur.json() if x["id"] == target_uid), None)
        ok10 = bool(u and u.get("role") == "maman")
log("10. PATCH /admin/users role=maman", ok10, f"status={r.status_code}")

# 11. Role check: maman→/admin/analytics 403
r = httpx.get(f"{BASE}/admin/analytics", headers=auth_headers(maman_tok), timeout=20)
log("11. maman→/admin/analytics 403", r.status_code == 403, f"status={r.status_code}")


# --------------------------------------------------------------------
# FAMILLE shared view
# --------------------------------------------------------------------
print("\n=== FAMILLE shared view ===")

# 12a. Maman creates famille + ensure papa joined + accepted
# Create maman's famille (idempotent)
r = httpx.post(f"{BASE}/famille/create", headers=auth_headers(maman_tok), timeout=20)
if r.status_code != 200:
    log("12. maman /famille/create", False, f"status={r.status_code} {r.text[:150]}")
    sys.exit(1)
fam = r.json()
code_partage = fam.get("code_partage")
print(f"    maman famille code={code_partage}")

# Check if papa is already a member
already_member = any(m.get("email") == PAPA[0] for m in fam.get("membres", []))
if not already_member:
    rj = httpx.post(f"{BASE}/famille/join", json={"code": code_partage, "relation": "partenaire"},
                    headers=auth_headers(papa_tok), timeout=20)
    if rj.status_code != 200:
        log("    papa join", False, f"{rj.status_code} {rj.text[:150]}")

# Maman accepts papa + sets permissions
r = httpx.patch(f"{BASE}/famille/members/{PAPA[0]}",
                json={"statut": "accepte", "permissions": {"grossesse": True, "enfants": True, "rendez_vous": True}},
                headers=auth_headers(maman_tok), timeout=20)
log("12. setup papa accepted+permissions", r.status_code == 200, f"status={r.status_code}")

# 13. Papa GET /famille/shared/maman@test.com
r = httpx.get(f"{BASE}/famille/shared/{MAMAN[0]}", headers=auth_headers(papa_tok), timeout=20)
ok13 = False
detail13 = ""
if r.status_code == 200:
    sd = r.json()
    has_owner = "owner" in sd and sd["owner"] is not None
    has_perms = "permissions" in sd
    # grossesse + enfants + rdvs keys present (because permissions true)
    has_gross = "grossesse" in sd
    has_enfants = "enfants" in sd
    has_rdvs = "rdvs" in sd
    ok13 = has_owner and has_perms and has_gross and has_enfants and has_rdvs
    detail13 = f"owner={bool(sd.get('owner'))}, keys={list(sd.keys())}"
else:
    detail13 = f"status={r.status_code} {r.text[:150]}"
log("13. GET /famille/shared/maman@test.com (all perms)", ok13, detail13)

# 14. Disable grossesse → should NOT include grossesse key
r = httpx.patch(f"{BASE}/famille/members/{PAPA[0]}",
                json={"permissions": {"grossesse": False, "enfants": True, "rendez_vous": True}},
                headers=auth_headers(maman_tok), timeout=20)
r = httpx.get(f"{BASE}/famille/shared/{MAMAN[0]}", headers=auth_headers(papa_tok), timeout=20)
ok14 = False
detail14 = ""
if r.status_code == 200:
    sd = r.json()
    ok14 = "grossesse" not in sd and "enfants" in sd and "rdvs" in sd
    detail14 = f"keys={list(sd.keys())}"
log("14. grossesse perm=False → no grossesse key", ok14, detail14)

# Re-enable grossesse for cleanliness
httpx.patch(f"{BASE}/famille/members/{PAPA[0]}",
            json={"permissions": {"grossesse": True, "enfants": True, "rendez_vous": True}},
            headers=auth_headers(maman_tok), timeout=20)

# 15. Unauthorized GET /famille/shared/pro@test.com → 404 or 403
r = httpx.get(f"{BASE}/famille/shared/{PRO[0]}", headers=auth_headers(papa_tok), timeout=20)
ok15 = r.status_code in (403, 404)
log("15. GET /famille/shared/pro@test.com → 403/404", ok15, f"status={r.status_code}")


# --------------------------------------------------------------------
# QUESTIONS SPÉCIALISTES
# --------------------------------------------------------------------
print("\n=== QUESTIONS SPÉCIALISTES ===")

q_body = {"title": "Test q", "content": "Test body", "specialite_cible": "gyneco"}
r = httpx.post(f"{BASE}/questions-specialistes", json=q_body, headers=auth_headers(maman_tok), timeout=20)
created_q = None
if r.status_code == 200:
    created_q = r.json()
    ok16 = created_q.get("title") == "Test q" and created_q.get("specialite_cible") == "gyneco" and "id" in created_q
else:
    ok16 = False
log("16. POST /questions-specialistes", ok16, f"status={r.status_code} id={created_q.get('id') if created_q else '?'}")

r = httpx.get(f"{BASE}/questions-specialistes", headers=auth_headers(maman_tok), timeout=20)
ok17 = False
if r.status_code == 200 and isinstance(r.json(), list):
    ids = [q.get("id") for q in r.json()]
    ok17 = created_q is None or created_q["id"] in ids
log("17. GET /questions-specialistes (list)", ok17, f"status={r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")

r = httpx.get(f"{BASE}/questions-specialistes?specialite=gyneco", headers=auth_headers(maman_tok), timeout=20)
ok18 = False
if r.status_code == 200:
    items = r.json()
    ok18 = all(q.get("specialite_cible") == "gyneco" for q in items) and len(items) >= 1
log("18. GET /questions-specialistes?specialite=gyneco", ok18,
    f"status={r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")


# --------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------
print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"RESULT: {passed}/{total} passed")
for name, ok, detail in results:
    if not ok:
        print(f"  FAIL: {name} — {detail}")
sys.exit(0 if passed == total else 1)
