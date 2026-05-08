"""
Backend test : Modes de consultation par créneau (modes_autorises)
Cible : PUT /api/pro/disponibilites + GET /api/pro/disponibilites
        + GET /api/professionnels/{pro_id}/disponibilites
        + POST /api/rdv (validation par slot)
        + GET /api/search/pros (régression)

Base URL : EXPO_PUBLIC_BACKEND_URL (frontend/.env) + /api
"""
from __future__ import annotations
import sys
from datetime import datetime, timedelta, timezone

import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

PRO_PHONE = "+2250709005330"
PRO_PASSWORD = "474Treck"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"


PASS, FAIL = [], []


def ok(msg: str):
    PASS.append(msg)
    print(f"  OK {msg}")


def ko(msg: str):
    FAIL.append(msg)
    print(f"  KO {msg}")


def login(payload: dict) -> tuple[str, dict]:
    r = requests.post(f"{BASE}/auth/login", json=payload, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login failed {payload}: {r.status_code} {r.text}")
    body = r.json()
    return body["token"], body["user"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def next_weekday(target_idx: int) -> datetime:
    """target_idx: 0=Mon, 1=Tue, ..."""
    today = datetime.now(timezone.utc).date()
    days_ahead = (target_idx - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return datetime.combine(today + timedelta(days=days_ahead), datetime.min.time())


def main():
    print("=" * 70)
    print(f"BASE = {BASE}")
    print("=" * 70)

    # 1) Login Pro
    print("\n[1] LOGIN PRO (Dr alpha)")
    try:
        pro_token, pro_user = login({"phone": PRO_PHONE, "password": PRO_PASSWORD})
        ok(f"login Pro OK id={pro_user['id']} role={pro_user.get('role')} premium={pro_user.get('is_premium')}")
        if pro_user.get("role") != "professionnel":
            ko(f"Pro user has wrong role: {pro_user.get('role')}")
    except Exception as e:
        ko(f"login Pro: {e}")
        return _summary()

    pro_id = pro_user["id"]

    print("\n[1b] LOGIN MAMAN")
    try:
        maman_token, maman_user = login({"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD})
        ok(f"login Maman OK id={maman_user['id']} role={maman_user.get('role')}")
    except Exception as e:
        ko(f"login Maman: {e}")
        return _summary()

    # 2) PUT disponibilites avec restrictions de mode
    print("\n[2] PUT /api/pro/disponibilites avec modes_autorises")
    body = {
        "slots": [
            {
                "jour": "lundi",
                "heure_debut": "08:00",
                "heure_fin": "12:00",
                "actif": True,
                "type_id": "generale",
                "duree_minutes": 30,
                "modes_autorises": ["presentiel"],
            },
            {
                "jour": "mardi",
                "heure_debut": "14:00",
                "heure_fin": "17:00",
                "actif": True,
                "type_id": "generale",
                "duree_minutes": 30,
                "modes_autorises": ["teleconsultation", "domicile"],
            },
        ],
        "duree_consultation": 30,
    }
    r = requests.put(f"{BASE}/pro/disponibilites", json=body, headers=auth(pro_token), timeout=30)
    if r.status_code == 200:
        ok("PUT disponibilites HTTP 200")
        try:
            persisted = r.json()
            slots = persisted.get("slots") or []
            if len(slots) == 2:
                ok("2 slots renvoyés")
            else:
                ko(f"slots count = {len(slots)} (expected 2)")
            if slots and slots[0].get("modes_autorises") == ["presentiel"]:
                ok("slot lundi modes_autorises == ['presentiel']")
            else:
                ko(f"slot lundi modes_autorises = {slots[0].get('modes_autorises') if slots else None}")
            if len(slots) > 1 and slots[1].get("modes_autorises") == ["teleconsultation", "domicile"]:
                ok("slot mardi modes_autorises == ['teleconsultation','domicile']")
            else:
                ko(f"slot mardi modes_autorises = {slots[1].get('modes_autorises') if len(slots) > 1 else None}")
        except Exception as e:
            ko(f"parsing response: {e}")
    else:
        ko(f"PUT disponibilites: {r.status_code} {r.text}")

    # 3) GET own disponibilites
    print("\n[3] GET /api/pro/disponibilites (Pro)")
    r = requests.get(f"{BASE}/pro/disponibilites", headers=auth(pro_token), timeout=30)
    if r.status_code == 200:
        ok("GET disponibilites HTTP 200")
        d = r.json()
        slots = d.get("slots") or []
        if len(slots) == 2:
            ok("2 slots persistés")
        else:
            ko(f"slots count after GET = {len(slots)}")
        if slots and slots[0].get("modes_autorises") == ["presentiel"]:
            ok("[GET own] slot lundi modes_autorises intact")
        else:
            ko(f"[GET own] slot lundi modes_autorises = {slots[0].get('modes_autorises') if slots else None}")
        if len(slots) > 1 and slots[1].get("modes_autorises") == ["teleconsultation", "domicile"]:
            ok("[GET own] slot mardi modes_autorises intact")
        else:
            ko(f"[GET own] slot mardi modes_autorises = {slots[1].get('modes_autorises') if len(slots) > 1 else None}")
    else:
        ko(f"GET disponibilites: {r.status_code} {r.text}")

    # 4) GET public disponibilites (vue Maman)
    print("\n[4] GET /api/professionnels/{pro_id}/disponibilites (Maman)")
    r = requests.get(f"{BASE}/professionnels/{pro_id}/disponibilites", headers=auth(maman_token), timeout=30)
    if r.status_code == 200:
        ok("GET public disponibilites HTTP 200")
        d = r.json()
        slots = d.get("slots") or []
        slot_lundi = next((s for s in slots if s.get("jour") == "lundi" and s.get("heure_debut") == "08:00"), None)
        slot_mardi = next((s for s in slots if s.get("jour") == "mardi" and s.get("heure_debut") == "14:00"), None)
        if slot_lundi and slot_lundi.get("modes_autorises") == ["presentiel"]:
            ok("[Maman view] slot lundi modes_autorises = ['presentiel']")
        else:
            ko(f"[Maman view] slot lundi modes_autorises = {slot_lundi.get('modes_autorises') if slot_lundi else None}")
        if slot_mardi and set(slot_mardi.get("modes_autorises") or []) == {"teleconsultation", "domicile"}:
            ok("[Maman view] slot mardi modes_autorises = ['teleconsultation','domicile']")
        else:
            ko(f"[Maman view] slot mardi modes_autorises = {slot_mardi.get('modes_autorises') if slot_mardi else None}")
    else:
        ko(f"GET public disponibilites: {r.status_code} {r.text}")

    # 5) Negative test : RDV mode domicile sur slot lundi
    monday = next_weekday(0)
    monday_dt = monday.replace(hour=9, minute=0, second=0, microsecond=0)
    monday_iso = monday_dt.strftime("%Y-%m-%dT%H:%M:%S")
    print(f"\n[5] POST /api/rdv lundi {monday_iso} mode='domicile' (slot autorise presentiel only)")
    rdv_payload = {
        "pro_id": pro_id,
        "date": monday_iso,
        "motif": "Test mode domicile interdit",
        "mode": "domicile",
        "adresse_domicile": "Cocody Riviera 3",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    if r.status_code == 400:
        ok("[5] HTTP 400 attendu")
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = (body.get("detail") if isinstance(body, dict) else "") or r.text
        if "domicile" in detail.lower():
            ok(f"[5] message contient 'domicile' : {detail[:200]}")
        else:
            ko(f"[5] message ne contient pas 'domicile' : {detail[:200]}")
    else:
        ko(f"[5] HTTP attendu 400, recu {r.status_code} {r.text[:200]}")

    # 6) Negative test 2 : mode teleconsultation sur slot lundi
    print(f"\n[6] POST /api/rdv lundi 09:00 mode='teleconsultation'")
    rdv_payload = {
        "pro_id": pro_id,
        "date": monday_iso,
        "motif": "Test tele sur slot presentiel",
        "mode": "teleconsultation",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    if r.status_code == 400:
        ok("[6] HTTP 400 attendu")
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = (body.get("detail") if isinstance(body, dict) else "") or r.text
        if "téléconsultation" in detail.lower() or "teleconsultation" in detail.lower():
            ok(f"[6] message contient teleconsultation : {detail[:200]}")
        else:
            ko(f"[6] message ne mentionne pas teleconsultation : {detail[:200]}")
    else:
        ko(f"[6] HTTP attendu 400, recu {r.status_code} {r.text[:200]}")

    # 7) Positive test : mode presentiel sur slot lundi
    print(f"\n[7] POST /api/rdv lundi 09:00 mode='presentiel' (slot OK)")
    rdv_payload = {
        "pro_id": pro_id,
        "date": monday_iso,
        "motif": "Test presentiel autorise",
        "mode": "presentiel",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    rdv_lundi_id = None
    if r.status_code == 200:
        ok("[7] HTTP 200 RDV cree")
        body = r.json()
        rdv_lundi_id = body.get("id")
        if body.get("mode") == "presentiel":
            ok(f"[7] mode persiste = 'presentiel' (rdv_id={rdv_lundi_id})")
        else:
            ko(f"[7] mode persiste = {body.get('mode')}")
    else:
        ko(f"[7] HTTP attendu 200, recu {r.status_code} {r.text[:300]}")

    # 8) Positive test 2 : mode domicile sur slot mardi 14:30
    tuesday = next_weekday(1)
    tuesday_dt = tuesday.replace(hour=14, minute=30, second=0, microsecond=0)
    tuesday_iso = tuesday_dt.strftime("%Y-%m-%dT%H:%M:%S")
    print(f"\n[8] POST /api/rdv mardi {tuesday_iso} mode='domicile'")
    rdv_payload = {
        "pro_id": pro_id,
        "date": tuesday_iso,
        "motif": "Test domicile autorise",
        "mode": "domicile",
        "adresse_domicile": "Cocody Riviera lot 12",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    rdv_mardi_id = None
    if r.status_code == 200:
        ok("[8] HTTP 200 RDV domicile cree")
        body = r.json()
        rdv_mardi_id = body.get("id")
        if body.get("mode") == "domicile":
            ok(f"[8] mode persiste = 'domicile' (rdv_id={rdv_mardi_id})")
        else:
            ko(f"[8] mode persiste = {body.get('mode')}")
    else:
        ko(f"[8] HTTP attendu 200, recu {r.status_code} {r.text[:300]}")

    # 9) Negative test 3 : mardi 14:30 mode presentiel
    print(f"\n[9] POST /api/rdv mardi {tuesday_iso} mode='presentiel' (slot tele/domicile only)")
    rdv_payload = {
        "pro_id": pro_id,
        "date": tuesday_iso,
        "motif": "Test presentiel interdit sur mardi",
        "mode": "presentiel",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    if r.status_code == 400:
        ok("[9] HTTP 400 attendu")
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = (body.get("detail") if isinstance(body, dict) else "") or r.text
        if "présentiel" in detail.lower() or "presentiel" in detail.lower():
            ok(f"[9] message contient 'presentiel' : {detail[:200]}")
        else:
            ko(f"[9] message ne mentionne pas presentiel : {detail[:200]}")
    else:
        ko(f"[9] HTTP attendu 400, recu {r.status_code} {r.text[:200]}")

    # 10) Régression — slot legacy SANS modes_autorises
    print("\n[10] PUT disponibilites slot SANS modes_autorises (legacy fallback)")
    body = {
        "slots": [
            {
                "jour": "mercredi",
                "heure_debut": "09:00",
                "heure_fin": "12:00",
                "actif": True,
                "type_id": "generale",
                "duree_minutes": 30,
            }
        ],
        "duree_consultation": 30,
    }
    r = requests.put(f"{BASE}/pro/disponibilites", json=body, headers=auth(pro_token), timeout=30)
    if r.status_code == 200:
        ok("[10] PUT legacy slot HTTP 200")
    else:
        ko(f"[10] PUT legacy slot: {r.status_code} {r.text[:200]}")

    wednesday = next_weekday(2)
    wednesday_dt = wednesday.replace(hour=10, minute=0, second=0, microsecond=0)
    wednesday_iso = wednesday_dt.strftime("%Y-%m-%dT%H:%M:%S")
    rdv_payload = {
        "pro_id": pro_id,
        "date": wednesday_iso,
        "motif": "Test fallback legacy",
        "mode": "presentiel",
    }
    r = requests.post(f"{BASE}/rdv", json=rdv_payload, headers=auth(maman_token), timeout=30)
    rdv_legacy_id = None
    if r.status_code == 200:
        ok("[10] POST /rdv presentiel sur slot legacy -> 200 (fallback OK)")
        rdv_legacy_id = r.json().get("id")
    elif r.status_code == 402:
        body = r.json()
        if (body.get("detail") or {}).get("quota") == "rdv_per_month":
            ok("[10] quota maman freemium atteint (rdv_per_month) - non regression backend")
        else:
            ko(f"[10] HTTP 402 inattendu : {r.text[:200]}")
    else:
        ko(f"[10] HTTP attendu 200, recu {r.status_code} {r.text[:300]}")

    # 11) Régression /search/pros?mode=teleconsultation
    print("\n[11] GET /api/search/pros?mode=teleconsultation (regression)")
    r = requests.get(f"{BASE}/search/pros", params={"mode": "teleconsultation"}, headers=auth(maman_token), timeout=30)
    if r.status_code == 200:
        body = r.json()
        if isinstance(body, list):
            ok(f"[11] HTTP 200 - {len(body)} pros")
        elif isinstance(body, dict) and isinstance(body.get("items"), list):
            ok(f"[11] HTTP 200 - {len(body['items'])} pros (cle items)")
        else:
            ko(f"[11] body inattendu: {type(body)}")
    else:
        ko(f"[11] /search/pros: {r.status_code} {r.text[:200]}")

    # CLEANUP
    print("\n[CLEANUP] PUT disponibilites par defaut")
    body = {
        "slots": [
            {
                "jour": "lundi",
                "heure_debut": "08:00",
                "heure_fin": "12:00",
                "actif": True,
                "type_id": "generale",
                "duree_minutes": 30,
                "modes_autorises": ["presentiel", "teleconsultation", "domicile"],
            }
        ],
        "duree_consultation": 30,
    }
    r = requests.put(f"{BASE}/pro/disponibilites", json=body, headers=auth(pro_token), timeout=30)
    if r.status_code == 200:
        ok("[CLEANUP] disponibilites Dr alpha restaurees")
    else:
        ko(f"[CLEANUP] PUT default: {r.status_code} {r.text[:200]}")

    # Cleanup RDV
    print("\n[CLEANUP] DELETE des RDV crees")
    for rid, label in [(rdv_lundi_id, "lundi"), (rdv_mardi_id, "mardi"), (rdv_legacy_id, "mercredi")]:
        if rid:
            r = requests.delete(f"{BASE}/rdv/{rid}", headers=auth(maman_token), timeout=20)
            if r.status_code in (200, 204, 404):
                ok(f"[CLEANUP] RDV {label} supprime ({r.status_code})")
            else:
                ko(f"[CLEANUP] suppression RDV {label}: {r.status_code} {r.text[:120]}")

    return _summary()


def _summary():
    print("\n" + "=" * 70)
    print(f"PASS = {len(PASS)}    FAIL = {len(FAIL)}")
    print("=" * 70)
    if FAIL:
        print("\nEchecs :")
        for m in FAIL:
            print(f"  - {m}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
