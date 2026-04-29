"""
Security retest for /api/enfants/{eid}/* endpoints (data-leak fix).
Verifies cross-tenant isolation: maman B must NOT be able to mutate or
read maman A's enfants via id-only access.

Endpoints under test:
  - POST   /api/enfants/{eid}/mesures
  - POST   /api/enfants/{eid}/photo
  - PATCH  /api/enfants/{eid}
  - POST   /api/enfants/{eid}/vaccins

All MUST return 404 when called by a non-owner, and the response body
MUST NOT contain the owner's nom / numero_cmu / allergies.
"""
import os
import json
import uuid
import time
import sys

import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

# ---------- maman A (persistent test account) ----------
MAMAN_A_EMAIL = "maman.test@alomaman.dev"
MAMAN_A_PASS = "Test1234!"

# ---------- maman B (registered fresh per run) ----------
RND = uuid.uuid4().hex[:8]
MAMAN_B_EMAIL = f"security_b_{RND}@test.alomaman.dev"
MAMAN_B_PASS = "SecB!Pass2026"
MAMAN_B_NAME = "Brigitte Test SecurityB"
MAMAN_B_PHONE = f"+22507{RND[:8]}"

# ---------- A1 sensitive data we'll plant ----------
A1_NOM = f"Aïcha-Sec-{RND}"
A1_CMU = "9988776655"
A1_ALLERGIES = ["arachides", "lait_de_vache"]


def jprint(label, r):
    try:
        body = r.json()
    except Exception:
        body = r.text
    print(f"[{label}] {r.status_code} {json.dumps(body, ensure_ascii=False)[:400]}")
    return body


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        print(f"LOGIN FAIL {email}: {r.status_code} {r.text}")
        sys.exit(1)
    return r.json()["token"]


def register(email, password, name, phone):
    payload = {
        "email": email,
        "password": password,
        "name": name,
        "phone": phone,
        "role": "maman",
        "ville": "Abidjan",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    r = requests.post(f"{BASE}/auth/register", json=payload, timeout=20)
    if r.status_code != 200:
        print(f"REGISTER FAIL {email}: {r.status_code} {r.text}")
        sys.exit(1)
    return r.json()["token"]


def hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def contains_leak(body, leak_strings):
    """Return list of strings present in body."""
    if body is None:
        return []
    s = json.dumps(body, ensure_ascii=False) if not isinstance(body, str) else body
    found = []
    for needle in leak_strings:
        if needle and needle in s:
            found.append(needle)
    return found


def main():
    results = []  # list of (name, ok, info)

    def record(name, ok, info=""):
        mark = "PASS" if ok else "FAIL"
        results.append((name, ok, info))
        print(f"  → {mark}: {name} {info}")

    print("\n=== STEP 1 — Login Maman A ===")
    token_a = login(MAMAN_A_EMAIL, MAMAN_A_PASS)
    print("Maman A token OK")

    print("\n=== STEP 2 — Create child A1 with sensitive data ===")
    payload = {
        "nom": A1_NOM,
        "date_naissance": "2024-06-15",
        "sexe": "F",
        "poids_kg": 4.2,
        "taille_cm": 55,
        "numero_cmu": A1_CMU,
        "allergies": A1_ALLERGIES,
        "groupe_sanguin": "O+",
    }
    r = requests.post(f"{BASE}/enfants", headers=hdr(token_a), json=payload, timeout=20)
    body_a1 = jprint("create A1", r)
    if r.status_code != 200:
        print("Cannot create A1 — abort")
        sys.exit(1)
    a1_id = body_a1["id"]
    record("Setup: child A1 created with sensitive fields", True, f"id={a1_id}")

    # Confirm decryption returned clear data for owner
    record(
        "Setup: A1 GET (owner) returns clear nom/numero_cmu/allergies",
        body_a1.get("nom") == A1_NOM
        and body_a1.get("numero_cmu") == A1_CMU
        and isinstance(body_a1.get("allergies"), list)
        and "arachides" in (body_a1.get("allergies") or []),
    )

    print("\n=== STEP 3 — Register fresh Maman B ===")
    token_b = register(MAMAN_B_EMAIL, MAMAN_B_PASS, MAMAN_B_NAME, MAMAN_B_PHONE)
    print("Maman B token OK")

    leak_strings = [A1_NOM, A1_CMU, "arachides", "lait_de_vache"]

    # ---- TEST 1: POST /enfants/{a1_id}/mesures by maman B ----
    print("\n=== TEST 1 — POST /enfants/{eid}/mesures by NON-OWNER ===")
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/mesures",
        headers=hdr(token_b),
        json={"date": "2026-04-29", "poids_kg": 5.1, "taille_cm": 60},
        timeout=20,
    )
    body = jprint("B→A1 mesures", r)
    record("T1.a status==404", r.status_code == 404, f"got {r.status_code}")
    leaks = contains_leak(body, leak_strings)
    record("T1.b body has no leak", len(leaks) == 0, f"leaks={leaks}")

    # ---- TEST 2: POST /enfants/{a1_id}/photo by maman B ----
    print("\n=== TEST 2 — POST /enfants/{eid}/photo by NON-OWNER ===")
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/photo",
        headers=hdr(token_b),
        json={"photo_base64": "data:image/png;base64,AAAA"},
        timeout=20,
    )
    body = jprint("B→A1 photo", r)
    record("T2.a status==404", r.status_code == 404, f"got {r.status_code}")
    leaks = contains_leak(body, leak_strings)
    record("T2.b body has no leak", len(leaks) == 0, f"leaks={leaks}")

    # ---- TEST 3: PATCH /enfants/{a1_id} by maman B ----
    print("\n=== TEST 3 — PATCH /enfants/{eid} by NON-OWNER ===")
    r = requests.patch(
        f"{BASE}/enfants/{a1_id}",
        headers=hdr(token_b),
        json={
            "nom": "PWNED",
            "date_naissance": "2024-06-15",
            "sexe": "F",
            "numero_cmu": "0000000000",
        },
        timeout=20,
    )
    body = jprint("B→A1 patch", r)
    record("T3.a status==404", r.status_code == 404, f"got {r.status_code}")
    leaks = contains_leak(body, leak_strings)
    record("T3.b body has no leak", len(leaks) == 0, f"leaks={leaks}")

    # ---- TEST 4: POST /enfants/{a1_id}/vaccins by maman B ----
    print("\n=== TEST 4 — POST /enfants/{eid}/vaccins by NON-OWNER ===")
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/vaccins",
        headers=hdr(token_b),
        json={"nom": "BCG", "date": "2025-01-15", "fait": True},
        timeout=20,
    )
    body = jprint("B→A1 vaccins", r)
    record("T4.a status==404", r.status_code == 404, f"got {r.status_code}")
    leaks = contains_leak(body, leak_strings)
    record("T4.b body has no leak", len(leaks) == 0, f"leaks={leaks}")

    # ---- TEST 5: Verify A1 untouched in DB by re-fetching as owner ----
    print("\n=== TEST 5 — Owner GET /enfants confirms A1 unchanged ===")
    r = requests.get(f"{BASE}/enfants", headers=hdr(token_a), timeout=20)
    if r.status_code == 200:
        items = r.json()
        a1 = next((e for e in items if e["id"] == a1_id), None)
        if a1 is None:
            record("T5.a A1 still in owner list", False, "missing")
        else:
            record("T5.a A1 still in owner list", True)
            record("T5.b nom unchanged (no PWN)", a1.get("nom") == A1_NOM, f"nom={a1.get('nom')}")
            record(
                "T5.c numero_cmu unchanged",
                a1.get("numero_cmu") == A1_CMU,
                f"numero_cmu={a1.get('numero_cmu')}",
            )
            record(
                "T5.d allergies unchanged",
                isinstance(a1.get("allergies"), list)
                and "arachides" in (a1.get("allergies") or [])
                and "lait_de_vache" in (a1.get("allergies") or []),
                f"allergies={a1.get('allergies')}",
            )
            # Also verify maman B didn't add a vaccin/mesure/photo
            mesures = a1.get("mesures") or []
            vaccins = a1.get("vaccins") or []
            photo = a1.get("photo")
            record(
                "T5.e no extra mesures from B",
                not any(m.get("date") == "2026-04-29" and m.get("poids_kg") == 5.1 for m in mesures),
                f"mesures_count={len(mesures)}",
            )
            record(
                "T5.f no extra vaccins from B",
                not any(v.get("nom") == "BCG" and v.get("date") == "2025-01-15" for v in vaccins),
                f"vaccins_count={len(vaccins)}",
            )
            record(
                "T5.g no photo set by B",
                photo != "data:image/png;base64,AAAA",
                f"photo_set={'yes' if photo else 'no'}",
            )
    else:
        record("T5.a owner GET /enfants 200", False, f"got {r.status_code}")

    # ---- REGRESSION: legit owner POST/PATCH still works ----
    print("\n=== TEST 6 — Owner POST/PATCH regression ===")
    # 6a POST mesures by owner
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/mesures",
        headers=hdr(token_a),
        json={"date": "2026-04-29", "poids_kg": 5.5, "taille_cm": 61},
        timeout=20,
    )
    body = jprint("A→A1 mesures", r)
    record("T6.a owner POST mesures 200", r.status_code == 200, f"got {r.status_code}")
    record(
        "T6.b owner mesures response decrypts numero_cmu",
        isinstance(body, dict) and body.get("numero_cmu") == A1_CMU,
    )

    # 6b POST vaccins by owner
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/vaccins",
        headers=hdr(token_a),
        json={"nom": "BCG", "date": "2025-01-15", "fait": True},
        timeout=20,
    )
    body = jprint("A→A1 vaccins", r)
    record("T6.c owner POST vaccins 200", r.status_code == 200, f"got {r.status_code}")
    record(
        "T6.d owner vaccins response decrypts allergies",
        isinstance(body, dict)
        and isinstance(body.get("allergies"), list)
        and "arachides" in (body.get("allergies") or []),
    )

    # 6c POST photo by owner
    r = requests.post(
        f"{BASE}/enfants/{a1_id}/photo",
        headers=hdr(token_a),
        json={"photo_base64": "data:image/png;base64,OWNERPHOTO"},
        timeout=20,
    )
    body = jprint("A→A1 photo", r)
    record("T6.e owner POST photo 200", r.status_code == 200, f"got {r.status_code}")
    record(
        "T6.f owner photo response decrypts numero_cmu",
        isinstance(body, dict) and body.get("numero_cmu") == A1_CMU,
    )

    # 6d PATCH by owner
    r = requests.patch(
        f"{BASE}/enfants/{a1_id}",
        headers=hdr(token_a),
        json={
            "nom": A1_NOM + "-upd",
            "date_naissance": "2024-06-15",
            "sexe": "F",
            "numero_cmu": A1_CMU,
            "allergies": A1_ALLERGIES,
        },
        timeout=20,
    )
    body = jprint("A→A1 patch", r)
    record("T6.g owner PATCH 200", r.status_code == 200, f"got {r.status_code}")
    record(
        "T6.h owner PATCH response shows updated nom + clear cmu",
        isinstance(body, dict)
        and body.get("nom") == A1_NOM + "-upd"
        and body.get("numero_cmu") == A1_CMU,
    )

    # ---- Bonus: 404 on totally unknown id by owner ----
    print("\n=== TEST 7 — Owner with bogus id gets 404 ===")
    bogus = str(uuid.uuid4())
    r = requests.post(
        f"{BASE}/enfants/{bogus}/mesures",
        headers=hdr(token_a),
        json={"date": "2026-04-29"},
        timeout=20,
    )
    record("T7.a owner bogus id mesures 404", r.status_code == 404, f"got {r.status_code}")

    # ---- Cleanup ----
    print("\n=== CLEANUP ===")
    # Delete A1 (so test data doesn't accumulate on persistent maman A)
    r = requests.delete(f"{BASE}/enfants/{a1_id}", headers=hdr(token_a), timeout=20)
    print(f"delete A1: {r.status_code}")
    # Delete maman B account via DELETE /auth/me (GDPR)
    r = requests.request(
        "DELETE",
        f"{BASE}/auth/me",
        headers=hdr(token_b),
        json={"password": MAMAN_B_PASS, "confirmation": "SUPPRIMER"},
        timeout=20,
    )
    print(f"delete maman B account: {r.status_code}")

    # ---- Summary ----
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print("\n" + "=" * 70)
    print(f"RESULT: {passed}/{total} passed")
    if passed != total:
        print("\nFAILED CASES:")
        for name, ok, info in results:
            if not ok:
                print(f"  - {name} :: {info}")
    print("=" * 70)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
