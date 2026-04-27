#!/usr/bin/env python3
"""
Backend tests for the new disponibilites / prestations endpoints:

  PUT  /api/pro/disponibilites  (now supports per-slot type_id + duree_minutes)
  GET  /api/pro/disponibilites
  GET  /api/professionnels/{pro_id}/prestations  (alias of /pros/{pro_id}/prestations)
  GET  /api/professionnels/{pro_id}/disponibilites  (enriched with prestation join)
"""
import os
import sys
import time
import json
import random
import string
import requests

BACKEND = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://cycle-tracker-pro.preview.emergentagent.com",
).rstrip("/")
API = f"{BACKEND}/api"

PASS, FAIL = 0, 0
FAILED = []


def step(label):
    print(f"\n=== {label} ===")


def ok(msg):
    global PASS
    PASS += 1
    print(f"  ✅ {msg}")


def ko(msg, ctx=None):
    global FAIL
    FAIL += 1
    FAILED.append(msg)
    print(f"  ❌ {msg}")
    if ctx is not None:
        try:
            txt = ctx if isinstance(ctx, str) else json.dumps(ctx, ensure_ascii=False)[:600]
        except Exception:
            txt = str(ctx)[:600]
        print(f"     ctx: {txt}")


def rnd(n=6):
    return "".join(random.choices(string.digits, k=n))


def auth_register(role, name, email=None, phone=None, password="TestPwd123!", **extra):
    payload = {
        "name": name,
        "email": email,
        "phone": phone,
        "password": password,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }
    payload.update(extra)
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    return r


def auth_login(email, password):
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    return r


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print(f"Backend: {API}")

    # ------------------------------------------------------------
    # 0. Setup: create Pro + Maman accounts
    # ------------------------------------------------------------
    step("0. Setup: create test Pro + Maman accounts")

    suffix = rnd(6)
    pro_email = f"dr_kouassi_{suffix}@test.alomaman.com"
    pro_phone = f"+22507{rnd(8)}"
    pro_password = "ProPwd2026!"
    pro_name = "Dr. Mariam Kouassi"

    r = auth_register(
        "professionnel",
        pro_name,
        email=pro_email,
        phone=pro_phone,
        password=pro_password,
        specialite="gynecologue",
    )
    if r.status_code == 200 and r.json().get("token"):
        pro_token = r.json()["token"]
        pro_user = r.json()["user"]
        pro_id = pro_user["id"]
        ok(f"Pro registered: {pro_email} (id={pro_id[:8]}…)")
    else:
        ko(f"Pro register failed: {r.status_code}", r.text)
        return

    maman_email = f"aminata_kone_{suffix}@test.alomaman.com"
    maman_phone = f"+22501{rnd(8)}"
    maman_password = "MamanPwd2026!"
    r = auth_register(
        "maman",
        "Aminata Koné",
        email=maman_email,
        phone=maman_phone,
        password=maman_password,
    )
    if r.status_code == 200 and r.json().get("token"):
        maman_token = r.json()["token"]
        maman_user = r.json()["user"]
        ok(f"Maman registered: {maman_email}")
    else:
        ko(f"Maman register failed: {r.status_code}", r.text)
        return

    # ------------------------------------------------------------
    # 1. PUT /api/pro/disponibilites (with new fields)
    # ------------------------------------------------------------
    step("1. PUT /api/pro/disponibilites with type_id + duree_minutes")

    put_payload = {
        "duree_consultation": 30,
        "slots": [
            {
                "jour": "lundi",
                "heure_debut": "08:00",
                "heure_fin": "12:00",
                "actif": True,
                "type_id": "echographie",
                "duree_minutes": 45,
                "types": ["echographie"],
            },
            {
                "jour": "mardi",
                "heure_debut": "14:00",
                "heure_fin": "17:00",
                "actif": True,
                "type_id": "prenatale",
                "duree_minutes": 30,
                "types": ["prenatale"],
            },
        ],
    }
    r = requests.put(
        f"{API}/pro/disponibilites",
        json=put_payload,
        headers=headers(pro_token),
        timeout=30,
    )
    if r.status_code == 200:
        body = r.json()
        if isinstance(body.get("slots"), list) and len(body["slots"]) == 2:
            ok("PUT 200 with 2 slots returned")
            slot0 = body["slots"][0]
            slot1 = body["slots"][1]
            # New fields persisted
            if slot0.get("type_id") == "echographie" and slot0.get("duree_minutes") == 45:
                ok("Slot[0] (lundi) has type_id=echographie & duree_minutes=45")
            else:
                ko(
                    f"Slot[0] missing or wrong type_id/duree_minutes: type_id={slot0.get('type_id')}, duree_minutes={slot0.get('duree_minutes')}",
                    slot0,
                )
            if slot1.get("type_id") == "prenatale" and slot1.get("duree_minutes") == 30:
                ok("Slot[1] (mardi) has type_id=prenatale & duree_minutes=30")
            else:
                ko(
                    f"Slot[1] missing or wrong type_id/duree_minutes: type_id={slot1.get('type_id')}, duree_minutes={slot1.get('duree_minutes')}",
                    slot1,
                )
            # Legacy types still preserved
            if slot0.get("types") == ["echographie"]:
                ok("Legacy slot.types still preserved on PUT response")
            else:
                ko("Legacy types not preserved", slot0)
            if body.get("duree_consultation") == 30:
                ok("duree_consultation=30 persisted at root")
            else:
                ko(f"duree_consultation wrong: {body.get('duree_consultation')}")
        else:
            ko("PUT 200 but slots payload malformed", body)
    else:
        ko(f"PUT /pro/disponibilites failed: {r.status_code}", r.text)

    # GET pro/disponibilites - verify
    r = requests.get(
        f"{API}/pro/disponibilites", headers=headers(pro_token), timeout=30
    )
    if r.status_code == 200:
        body = r.json()
        slots = body.get("slots", [])
        if len(slots) == 2:
            s0 = slots[0]
            s1 = slots[1]
            if (
                s0.get("type_id") == "echographie"
                and s0.get("duree_minutes") == 45
                and s1.get("type_id") == "prenatale"
                and s1.get("duree_minutes") == 30
            ):
                ok("GET /pro/disponibilites returns type_id + duree_minutes correctly")
            else:
                ko("GET /pro/disponibilites missing type_id/duree_minutes", slots)
        else:
            ko(f"GET returned {len(slots)} slots, expected 2", body)
    else:
        ko(f"GET /pro/disponibilites failed: {r.status_code}", r.text)

    # ------------------------------------------------------------
    # 2. POST /pro/prestations + GET /professionnels/{id}/prestations
    # ------------------------------------------------------------
    step("2. Prestations: create + GET /professionnels/{id}/prestations alias")

    # Create prestations as pro
    presta_payloads = [
        {"nom": "Échographie", "prix_fcfa": 25000, "duree_min": 45, "active": True},
        {
            "nom": "Consultation prénatale",
            "prix_fcfa": 10000,
            "duree_min": 30,
            "active": True,
        },
        {
            "nom": "Vaccination",
            "prix_fcfa": 5000,
            "duree_min": 15,
            "active": False,  # inactive — should NOT appear in list
        },
    ]
    presta_ids = []
    echographie_presta_id = None
    for pp in presta_payloads:
        r = requests.post(
            f"{API}/pro/prestations",
            json=pp,
            headers=headers(pro_token),
            timeout=30,
        )
        if r.status_code == 200 and r.json().get("id"):
            pid = r.json()["id"]
            presta_ids.append(pid)
            if pp["nom"] == "Échographie":
                echographie_presta_id = pid
            ok(f"Prestation '{pp['nom']}' created (id={pid[:8]}…)")
        else:
            ko(f"POST /pro/prestations '{pp['nom']}' failed: {r.status_code}", r.text)

    # GET /pros/{pro_id}/prestations as maman (legacy)
    r = requests.get(
        f"{API}/pros/{pro_id}/prestations",
        headers=headers(maman_token),
        timeout=30,
    )
    legacy_list = []
    if r.status_code == 200 and isinstance(r.json(), list):
        legacy_list = r.json()
        ok(f"Legacy GET /pros/{{id}}/prestations returns list of {len(legacy_list)}")
    else:
        ko(f"Legacy /pros/{{id}}/prestations failed: {r.status_code}", r.text)

    # GET /professionnels/{pro_id}/prestations (NEW alias)
    r = requests.get(
        f"{API}/professionnels/{pro_id}/prestations",
        headers=headers(maman_token),
        timeout=30,
    )
    if r.status_code == 200 and isinstance(r.json(), list):
        items = r.json()
        ok(f"NEW alias GET /professionnels/{{id}}/prestations returns list of {len(items)}")
        # Should contain only ACTIVE (2 items)
        if len(items) == 2:
            ok("Alias returns only active prestations (2)")
        else:
            ko(f"Alias should return 2 active prestations, got {len(items)}", items)
        # Sorted by prix_fcfa ASC
        prices = [it.get("prix_fcfa") for it in items]
        if prices == sorted(prices):
            ok(f"Alias sorted by prix_fcfa ASC: {prices}")
        else:
            ko(f"Alias NOT sorted by price: {prices}")
        # Same content as legacy
        if [it.get("id") for it in items] == [it.get("id") for it in legacy_list]:
            ok("Alias /professionnels/.. == legacy /pros/.. (same items, same order)")
        else:
            ko(
                "Alias differs from legacy",
                {
                    "alias_ids": [it.get("id") for it in items],
                    "legacy_ids": [it.get("id") for it in legacy_list],
                },
            )
    else:
        ko(f"NEW /professionnels/{{id}}/prestations failed: {r.status_code}", r.text)

    # Auth required
    r = requests.get(f"{API}/professionnels/{pro_id}/prestations", timeout=30)
    if r.status_code in (401, 403):
        ok(f"Auth required on alias (no token → {r.status_code})")
    else:
        ko(f"Alias should require auth, got {r.status_code}", r.text)

    # ------------------------------------------------------------
    # 3. GET /api/professionnels/{pro_id}/disponibilites (enriched)
    # ------------------------------------------------------------
    step("3. GET /api/professionnels/{pro_id}/disponibilites (enriched join)")

    r = requests.get(
        f"{API}/professionnels/{pro_id}/disponibilites",
        headers=headers(maman_token),
        timeout=30,
    )
    if r.status_code == 200:
        body = r.json()
        # 'pro' object
        pro_obj = body.get("pro")
        if isinstance(pro_obj, dict) and pro_obj.get("id") == pro_id and pro_obj.get("name") == pro_name:
            ok(f"Response contains pro object {{id, name='{pro_name}', specialite}}")
        else:
            ko("pro object missing or wrong", pro_obj)
        # slots[]
        slots = body.get("slots")
        if isinstance(slots, list) and len(slots) == 2:
            ok(f"Response contains {len(slots)} enriched slots")
            # First slot — echographie → should join with the Échographie prestation
            sE = next(
                (s for s in slots if s.get("type_id") == "echographie"), None
            )
            if sE:
                checks = {
                    "type_id": ("echographie", sE.get("type_id")),
                    "type_label": ("Échographie", sE.get("type_label")),
                    "duree_minutes": (45, sE.get("duree_minutes")),
                    "prix_fcfa": (25000, sE.get("prix_fcfa")),
                    "prestation_id": (echographie_presta_id, sE.get("prestation_id")),
                    "prestation_nom": ("Échographie", sE.get("prestation_nom")),
                }
                for k, (exp, got) in checks.items():
                    if got == exp:
                        ok(f"  echographie slot.{k} = {got!r}")
                    else:
                        ko(f"  echographie slot.{k} expected {exp!r}, got {got!r}", sE)
            else:
                ko("No slot with type_id=echographie returned", slots)

            # Second slot — prenatale → should join with Consultation prénatale
            sP = next((s for s in slots if s.get("type_id") == "prenatale"), None)
            if sP:
                if sP.get("prix_fcfa") == 10000:
                    ok("  prenatale slot.prix_fcfa = 10000 (joined with Consultation prénatale)")
                else:
                    ko(
                        f"  prenatale slot.prix_fcfa expected 10000, got {sP.get('prix_fcfa')}",
                        sP,
                    )
                if sP.get("prestation_nom") == "Consultation prénatale":
                    ok("  prenatale slot.prestation_nom = 'Consultation prénatale'")
                else:
                    ko(
                        f"  prenatale slot.prestation_nom: got {sP.get('prestation_nom')!r}",
                        sP,
                    )
                if sP.get("duree_minutes") == 30:
                    ok("  prenatale slot.duree_minutes = 30")
                else:
                    ko(f"  prenatale slot.duree_minutes: got {sP.get('duree_minutes')}", sP)
            else:
                ko("No slot with type_id=prenatale returned", slots)
        else:
            ko(f"slots[] missing or wrong length: {len(slots) if slots else 0}", body)

        # prestations_count
        if body.get("prestations_count") == 2:
            ok("prestations_count=2 (only active counted)")
        else:
            ko(f"prestations_count expected 2, got {body.get('prestations_count')}")
    else:
        ko(f"GET /professionnels/{pro_id}/disponibilites failed: {r.status_code}", r.text)

    # ------------------------------------------------------------
    # 3.e Fuzzy match — rename to "Échographie pelvienne 3D"
    # ------------------------------------------------------------
    step("3e. Fuzzy match — rename Échographie → 'Échographie pelvienne 3D'")
    # NOTE: PATCH /pro/prestations/{pid} expects the full PrestationIn body (not partial)
    r = requests.patch(
        f"{API}/pro/prestations/{echographie_presta_id}",
        json={
            "nom": "Échographie pelvienne 3D",
            "prix_fcfa": 25000,
            "duree_min": 45,
            "active": True,
        },
        headers=headers(pro_token),
        timeout=30,
    )
    if r.status_code == 200:
        ok("PATCH prestation nom='Échographie pelvienne 3D' OK")
        r2 = requests.get(
            f"{API}/professionnels/{pro_id}/disponibilites",
            headers=headers(maman_token),
            timeout=30,
        )
        if r2.status_code == 200:
            sE = next(
                (s for s in r2.json().get("slots", []) if s.get("type_id") == "echographie"),
                None,
            )
            if sE and sE.get("prestation_id") == echographie_presta_id and sE.get("prix_fcfa") == 25000:
                ok(f"Fuzzy match still finds prestation (nom='{sE.get('prestation_nom')}', prix={sE.get('prix_fcfa')})")
            else:
                ko("Fuzzy match (contains 'Échographie') failed", sE)
        else:
            ko(f"GET after rename failed: {r2.status_code}", r2.text)
    else:
        ko(f"PATCH prestation nom failed: {r.status_code}", r.text)

    # ------------------------------------------------------------
    # 3.f Legacy slot (no type_id, only types: ['prenatale']) — fallback duree
    # ------------------------------------------------------------
    step("3f. Legacy slot (no type_id, only types[]) — fallback to duree_consultation")
    legacy_payload = {
        "duree_consultation": 60,  # fallback duree
        "slots": [
            {
                "jour": "mercredi",
                "heure_debut": "09:00",
                "heure_fin": "12:00",
                "actif": True,
                # NO type_id, NO duree_minutes — legacy only
                "types": ["prenatale"],
            },
        ],
    }
    r = requests.put(
        f"{API}/pro/disponibilites",
        json=legacy_payload,
        headers=headers(pro_token),
        timeout=30,
    )
    if r.status_code == 200:
        ok("PUT legacy-only slot accepted (200)")
        r2 = requests.get(
            f"{API}/professionnels/{pro_id}/disponibilites",
            headers=headers(maman_token),
            timeout=30,
        )
        if r2.status_code == 200:
            slots = r2.json().get("slots", [])
            if len(slots) == 1:
                s = slots[0]
                if s.get("type_id") == "prenatale":
                    ok("Legacy slot: type_id derived from types[0]='prenatale'")
                else:
                    ko(f"Legacy slot type_id should be 'prenatale', got {s.get('type_id')!r}", s)
                if s.get("duree_minutes") == 60:
                    ok("Legacy slot: duree_minutes falls back to duree_consultation=60")
                else:
                    ko(
                        f"Legacy slot duree_minutes should be 60 (fallback), got {s.get('duree_minutes')}",
                        s,
                    )
                # prestation join still works
                if s.get("prestation_nom") == "Consultation prénatale" and s.get("prix_fcfa") == 10000:
                    ok("Legacy slot: prestation join still works (prenatale → Consultation prénatale 10000)")
                else:
                    ko(
                        "Legacy slot prestation join failed",
                        {"prestation_nom": s.get("prestation_nom"), "prix_fcfa": s.get("prix_fcfa")},
                    )
            else:
                ko(f"Expected 1 legacy slot, got {len(slots)}", r2.json())
        else:
            ko(f"GET after legacy PUT failed: {r2.status_code}", r2.text)
    else:
        ko(f"PUT legacy slot failed: {r.status_code}", r.text)

    # ------------------------------------------------------------
    # 3.g 404 if pro_id not found
    # ------------------------------------------------------------
    step("3g. 404 if pro_id not found")
    bogus_id = "nonexistent-pro-id-" + rnd(8)
    r = requests.get(
        f"{API}/professionnels/{bogus_id}/disponibilites",
        headers=headers(maman_token),
        timeout=30,
    )
    if r.status_code == 404:
        ok(f"Bogus pro_id → 404 (detail: {r.json().get('detail')})")
    else:
        ko(f"Bogus pro_id should return 404, got {r.status_code}", r.text)

    # Auth required for /disponibilites endpoint
    r = requests.get(
        f"{API}/professionnels/{pro_id}/disponibilites", timeout=30
    )
    if r.status_code in (401, 403):
        ok(f"Auth required on /disponibilites alias (no token → {r.status_code})")
    else:
        ko(f"/disponibilites alias should require auth, got {r.status_code}", r.text)

    # ------------------------------------------------------------
    # CLEANUP — delete created accounts (best-effort)
    # ------------------------------------------------------------
    step("Cleanup")
    for token, password, label in [
        (pro_token, pro_password, "pro"),
        (maman_token, maman_password, "maman"),
    ]:
        try:
            r = requests.request(
                "DELETE",
                f"{API}/auth/me",
                headers=headers(token),
                json={"confirmation": "SUPPRIMER", "password": password},
                timeout=30,
            )
            if r.status_code == 200:
                ok(f"DELETE /auth/me {label} OK")
            else:
                print(f"  ⚠️ cleanup {label}: {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"  ⚠️ cleanup {label}: {e}")

    # ------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------
    print(f"\n=== SUMMARY ===\nPASS: {PASS}\nFAIL: {FAIL}")
    if FAILED:
        print("\nFailed checks:")
        for f in FAILED:
            print(f"  - {f}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
