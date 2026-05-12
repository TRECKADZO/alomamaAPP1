#!/usr/bin/env python3
"""
Test EXTENSION marketplace inversé : type=urgence multi-modes
(presentiel | teleconsultation | domicile)
"""
import requests
import json
import sys

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PRO_PHONE = "+2250709005330"
PRO_PASSWORD = "474Treck"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"

results = []
def log(name, ok, msg=""):
    mark = "✅" if ok else "❌"
    results.append((name, ok, msg))
    print(f"{mark} {name}: {msg}")

def jpost(url, body, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.post(BASE + url, json=body, headers=h, timeout=30)
    return r

def jget(url, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.get(BASE + url, headers=h, timeout=30)
    return r

def jput(url, body, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    r = requests.put(BASE + url, json=body, headers=h, timeout=30)
    return r


# ---------- 1) Login both users ----------
print("\n=== 1) Login both users ===")

r = jpost("/auth/login", {"phone": PRO_PHONE, "password": PRO_PASSWORD})
if r.status_code == 200 and r.json().get("token"):
    pro_token = r.json()["token"]
    pro_user = r.json().get("user", {})
    log("Pro login", True, f"id={pro_user.get('id')} role={pro_user.get('role')}")
else:
    log("Pro login", False, f"status={r.status_code} body={r.text[:200]}")
    sys.exit(1)

r = jpost("/auth/login", {"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD})
if r.status_code == 200 and r.json().get("token"):
    maman_token = r.json()["token"]
    maman_user = r.json().get("user", {})
    log("Maman login", True, f"id={maman_user.get('id')} role={maman_user.get('role')}")
else:
    log("Maman login", False, f"status={r.status_code} body={r.text[:200]}")
    sys.exit(1)


# ---------- 2) Urgence mode=presentiel sans adresse ----------
print("\n=== 2) Urgence mode=presentiel sans adresse ===")
body = {"type": "urgence", "mode": "presentiel", "motif": "Forte fièvre 39", "ville": "Abidjan"}
r = jpost("/home-request", body, maman_token)
if r.status_code == 200:
    j = r.json()
    request_id_A = j.get("id")
    checks = {
        "mode=presentiel": j.get("mode") == "presentiel",
        "zone=None": j.get("zone") is None,
        "no adresse_enc": "adresse_enc" not in j,
        "broadcast_count>=1": (j.get("broadcast_count") or 0) >= 1,
        "id present": bool(request_id_A),
    }
    ok = all(checks.values())
    log("Urgence presentiel (no address)", ok, f"id={request_id_A} {checks}")
else:
    log("Urgence presentiel (no address)", False, f"status={r.status_code} body={r.text[:300]}")
    request_id_A = None


# ---------- 3) Urgence mode=teleconsultation sans adresse ----------
print("\n=== 3) Urgence mode=teleconsultation sans adresse ===")
body = {"type": "urgence", "mode": "teleconsultation", "motif": "Conseil rapide allaitement", "ville": "Abidjan"}
r = jpost("/home-request", body, maman_token)
if r.status_code == 200:
    j = r.json()
    request_id_B = j.get("id")
    ok = j.get("mode") == "teleconsultation" and bool(request_id_B)
    log("Urgence teleconsultation (no address)", ok, f"id={request_id_B} mode={j.get('mode')}")
else:
    log("Urgence teleconsultation (no address)", False, f"status={r.status_code} body={r.text[:300]}")
    request_id_B = None


# ---------- 4) Urgence mode=domicile SANS adresse (should fail) ----------
print("\n=== 4) Urgence mode=domicile sans adresse (must fail 400) ===")
body = {"type": "urgence", "mode": "domicile", "motif": "Test sans adresse", "ville": "Abidjan"}
r = jpost("/home-request", body, maman_token)
if r.status_code == 400 and "Adresse requise" in r.text:
    log("Urgence domicile no address → 400 'Adresse requise'", True, f"body={r.text[:200]}")
else:
    log("Urgence domicile no address → 400 'Adresse requise'", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 5) Type=domicile forces mode=domicile ----------
print("\n=== 5) Type=domicile force mode=domicile ===")
body = {"type": "domicile", "mode": "presentiel", "motif": "Suivi 2T", "adresse": "Cocody RA Lot12", "ville": "Abidjan", "zone": "moyen"}
r = jpost("/home-request", body, maman_token)
if r.status_code == 200:
    j = r.json()
    request_id_C = j.get("id")
    ok = j.get("mode") == "domicile" and bool(request_id_C)
    log("Type=domicile forces mode=domicile", ok, f"id={request_id_C} mode={j.get('mode')} zone={j.get('zone')}")
else:
    log("Type=domicile forces mode=domicile", False, f"status={r.status_code} body={r.text[:300]}")
    request_id_C = None


# ---------- 6) Pro sets pricing then /suggest on urgence presentiel ----------
print("\n=== 6) Pro PUT pricing + GET /suggest on urgence presentiel ===")
pricing_body = {
    "tarif_consultation": 15000,
    "frais_zone_proche": 2000,
    "frais_zone_moyen": 5000,
    "frais_zone_loin": 10000,
    "majoration_nuit_fcfa": 3000,
    "majoration_we_fcfa": 2000,
    "majoration_urgence_fcfa": 7000,
}
r = jput("/pro/pricing-domicile", pricing_body, pro_token)
if r.status_code == 200:
    log("PUT /pro/pricing-domicile", True, f"saved")
else:
    log("PUT /pro/pricing-domicile", False, f"status={r.status_code} body={r.text[:200]}")

if request_id_A:
    r = jget(f"/home-request/{request_id_A}/suggest", pro_token)
    if r.status_code == 200:
        j = r.json()
        # Total = 15000 + 0 + auto majorations (nuit/we if applicable) + urgence(7000)
        checks = {
            "frais_deplacement=0": j.get("frais_deplacement") == 0,
            "zone=None": j.get("zone") is None,
            "mode=presentiel": j.get("mode") == "presentiel",
            "tarif_consultation=15000": j.get("tarif_consultation") == 15000,
            "majoration_urgence=7000": j.get("majoration_urgence") == 7000,
        }
        # total = 15000 + 0 + maj_nuit + maj_we + 7000
        expected_total = 15000 + j.get("majoration_nuit", 0) + j.get("majoration_we", 0) + 7000
        checks["total matches"] = j.get("total") == expected_total
        ok = all(checks.values())
        log("Suggest urgence presentiel", ok, f"{checks} actual_total={j.get('total')} expected={expected_total}")
    else:
        log("Suggest urgence presentiel", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 7) Pro /suggest on urgence teleconsultation ----------
print("\n=== 7) Pro /suggest on urgence teleconsultation ===")
if request_id_B:
    r = jget(f"/home-request/{request_id_B}/suggest", pro_token)
    if r.status_code == 200:
        j = r.json()
        checks = {
            "frais_deplacement=0": j.get("frais_deplacement") == 0,
            "mode=teleconsultation": j.get("mode") == "teleconsultation",
        }
        ok = all(checks.values())
        log("Suggest urgence teleconsultation", ok, f"{checks} body={j}")
    else:
        log("Suggest urgence teleconsultation", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 8) Pro propose on urgence presentiel ----------
print("\n=== 8) Pro propose on urgence presentiel ===")
proposal_id_A = None
if request_id_A:
    body = {
        "tarif_consultation": 15000,
        "frais_deplacement": 0,
        "majoration_nuit": 0,
        "majoration_we": 0,
        "majoration_urgence": 7000,
        "message": "Disponible dans 15 min au cabinet",
    }
    r = jpost(f"/home-request/{request_id_A}/propose", body, pro_token)
    if r.status_code == 200:
        j = r.json()
        prop = j.get("proposal", {})
        proposal_id_A = prop.get("id")
        ok = prop.get("total") == 22000 and bool(proposal_id_A)
        log("Propose urgence presentiel", ok, f"total={prop.get('total')} proposal_id={proposal_id_A}")
    else:
        log("Propose urgence presentiel", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 9) Maman accept presentiel urgence ----------
print("\n=== 9) Maman accept presentiel urgence ===")
if request_id_A and proposal_id_A:
    body = {"proposal_id": proposal_id_A}
    r = jpost(f"/home-request/{request_id_A}/accept", body, maman_token)
    if r.status_code == 200:
        j = r.json()
        rdv = j.get("rdv", {})
        checks = {
            "rdv.mode=presentiel": rdv.get("mode") == "presentiel",
            "rdv.adresse_domicile_enc=None": rdv.get("adresse_domicile_enc") is None,
            "rdv.tarif_total_fcfa=22000": rdv.get("tarif_total_fcfa") == 22000,
            "payment_url present": bool(j.get("payment_url")),
        }
        ok = all(checks.values())
        log("Accept urgence presentiel", ok, f"{checks}")
    else:
        log("Accept urgence presentiel", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 10) Regression — domicile classique /suggest ----------
print("\n=== 10) Regression domicile classique /suggest ===")
if request_id_C:
    r = jget(f"/home-request/{request_id_C}/suggest", pro_token)
    if r.status_code == 200:
        j = r.json()
        checks = {
            "frais_deplacement=5000": j.get("frais_deplacement") == 5000,
            "zone=moyen": j.get("zone") == "moyen",
            "mode=domicile": j.get("mode") == "domicile",
        }
        ok = all(checks.values())
        log("Suggest domicile classique (regression)", ok, f"{checks} body={j}")
    else:
        log("Suggest domicile classique (regression)", False, f"status={r.status_code} body={r.text[:300]}")


# ---------- 11) Cleanup ----------
print("\n=== 11) Cleanup (cancel open requests) ===")
for rid in [request_id_B, request_id_C]:
    if rid:
        r = jpost(f"/home-request/{rid}/cancel", {}, maman_token)
        log(f"Cancel {rid[:8]}", r.status_code == 200, f"status={r.status_code}")


# ---------- Summary ----------
print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"TOTAL: {passed}/{total} PASS")
print("=" * 60)
for name, ok, msg in results:
    mark = "✅" if ok else "❌"
    print(f"{mark} {name}")

sys.exit(0 if passed == total else 1)
