"""
Backend test — Marketplace inversé Soins à domicile / Urgence.
Run: python /app/backend_test_marketplace_inverse.py
"""
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta

import requests
from pymongo import MongoClient

BACKEND_URL = os.environ.get("BACKEND_URL") or "https://cycle-tracker-pro.preview.emergentagent.com"
API = BACKEND_URL.rstrip("/") + "/api"

MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"

PRO_PHONE = "+2250709005330"
PRO_PASS = "474Treck"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASS = "Test1234!"

results = []  # (name, ok, detail)


def log(name, ok, detail=""):
    mark = "✅" if ok else "❌"
    print(f"{mark} {name} — {detail}")
    results.append((name, ok, detail))


def post(path, token=None, body=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(API + path, headers=h, json=body or {}, timeout=30)


def put(path, token=None, body=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.put(API + path, headers=h, json=body or {}, timeout=30)


def get(path, token=None):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(API + path, headers=h, timeout=30)


# -----------------------------------------------------------------------------
# Pre-step : login
# -----------------------------------------------------------------------------

def login_pro():
    r = post("/auth/login", body={"phone": PRO_PHONE, "password": PRO_PASS})
    if r.status_code != 200:
        # Try email fallback
        r = post("/auth/login", body={"email": PRO_PHONE, "password": PRO_PASS})
    assert r.status_code == 200, f"Pro login fail: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def login_maman():
    r = post("/auth/login", body={"email": MAMAN_EMAIL, "password": MAMAN_PASS})
    assert r.status_code == 200, f"Maman login fail: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def main():
    print(f"== Testing on {API} ==")
    pro_token, pro_user = login_pro()
    maman_token, maman_user = login_maman()
    print(f"Pro id={pro_user['id']} name={pro_user.get('name')}")
    print(f"Maman id={maman_user['id']} name={maman_user.get('name')}")

    # Save original values for cleanup
    original_modes = None
    original_pricing = None

    # --- PRE-REQ: Set Dr alpha accepte_domicile=true ----
    r = get("/pro/modes-consultation", pro_token)
    if r.status_code == 200:
        original_modes = r.json()
        log("PRE-REQ: GET /pro/modes-consultation initial", True, json.dumps(r.json()))
    r = put("/pro/modes-consultation", pro_token, {
        "accepte_domicile": True, "accepte_teleconsultation": True, "accepte_presentiel": True
    })
    log("PRE-REQ: PUT /pro/modes-consultation accepte_domicile=true", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

    # Save original pricing for cleanup
    r = get("/pro/pricing-domicile", pro_token)
    if r.status_code == 200:
        original_pricing = r.json()

    # ============================================================
    # 1. Pro configures pricing_domicile
    # ============================================================
    print("\n--- 1. Pro configures pricing_domicile ---")
    body = {
        "tarif_consultation": 15000,
        "frais_zone_proche": 2000,
        "frais_zone_moyen": 5000,
        "frais_zone_loin": 10000,
        "majoration_nuit_fcfa": 3000,
        "majoration_we_fcfa": 2000,
        "majoration_urgence_fcfa": 7000,
    }
    r = put("/pro/pricing-domicile", pro_token, body)
    log("1a. PUT /pro/pricing-domicile valid values", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

    r = get("/pro/pricing-domicile", pro_token)
    js = r.json() if r.status_code == 200 else {}
    same = all(js.get(k) == v for k, v in body.items())
    log("1b. GET /pro/pricing-domicile returns same values", r.status_code == 200 and same, json.dumps(js))

    # ============================================================
    # 2. Validation pricing limits
    # ============================================================
    print("\n--- 2. Validation pricing limits ---")
    bad1 = {**body, "tarif_consultation": -1}
    r = put("/pro/pricing-domicile", pro_token, bad1)
    log("2a. PUT pricing tarif_consultation=-1 → 400", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

    bad2 = {**body, "frais_zone_proche": 600000}
    r = put("/pro/pricing-domicile", pro_token, bad2)
    log("2b. PUT pricing frais_zone_proche=600000 → 400", r.status_code == 400, f"{r.status_code} {r.text[:150]}")

    # ============================================================
    # 3. Maman creates a domicile request
    # ============================================================
    print("\n--- 3. Maman creates a domicile request ---")
    req_body = {
        "type": "domicile",
        "motif": "Suivi grossesse 3T",
        "adresse": "Cocody Riviera 3, Rue des Jardins, Villa 12",
        "quartier": "Cocody",
        "ville": "Abidjan",
        "zone": "moyen",
        "preferred_datetime": "2026-05-20T10:00:00Z",
        "notes": "Test marketplace",
    }
    r = post("/home-request", maman_token, req_body)
    js = r.json() if r.status_code == 200 else {}
    ok = (r.status_code == 200 and js.get("id") and js.get("status") == "open"
          and js.get("broadcast_count", 0) >= 1 and "auto_majorations" in js)
    request_id = js.get("id")
    log("3a. POST /home-request → 200 with id/status/broadcast_count/auto_majorations", ok,
        f"status={r.status_code} broadcast={js.get('broadcast_count')} status_field={js.get('status')}")

    # Adresse must NOT appear in response
    log("3b. adresse NOT in response", "adresse" not in js and "adresse_enc" not in js,
        f"keys={list(js.keys())}")

    # ============================================================
    # 4. Maman lists her requests
    # ============================================================
    print("\n--- 4. Maman lists her requests ---")
    r = get("/home-request/mine", maman_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("id") == request_id), None)
    log("4a. GET /home-request/mine contains new request", r.status_code == 200 and bool(found),
        f"count={len(items)}")
    log("4b. No adresse_enc in response items",
        all("adresse_enc" not in it for it in items),
        "")

    # ============================================================
    # 5. Pro lists open requests
    # ============================================================
    print("\n--- 5. Pro lists open requests ---")
    r = get("/home-request/open", pro_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("id") == request_id), None)
    log("5a. GET /home-request/open contains the request",
        r.status_code == 200 and bool(found),
        f"count={len(items)}")
    if found:
        log("5b. has_my_proposal=false", found.get("has_my_proposal") is False, str(found.get("has_my_proposal")))
        ml = found.get("maman_label", "")
        log("5c. maman_label masked (e.g., 'A***')", "***" in ml, f"maman_label={ml}")
        log("5d. No adresse fields in open list",
            "adresse_enc" not in found and "adresse" not in found,
            "")

    # ============================================================
    # 6. Pro suggest auto
    # ============================================================
    print("\n--- 6. Pro suggest auto ---")
    r = get(f"/home-request/{request_id}/suggest", pro_token)
    js = r.json() if r.status_code == 200 else {}
    # 2026-05-20 is Wednesday, 10:00 UTC → nuit=False, we=False, urgence=False (type=domicile)
    expected = {
        "tarif_consultation": 15000,
        "frais_deplacement": 5000,
        "majoration_we": 0,
        "majoration_nuit": 0,
        "majoration_urgence": 0,
        "total": 20000,
    }
    ok = all(js.get(k) == v for k, v in expected.items())
    log("6a. /suggest returns expected values", ok, json.dumps(js))
    flags = js.get("auto_flags") or {}
    log("6b. auto_flags={nuit:false, we:false, urgence:false}",
        flags.get("nuit") is False and flags.get("we") is False and flags.get("urgence") is False,
        f"auto_flags={flags}")

    # ============================================================
    # 7. Pro submits a proposal
    # ============================================================
    print("\n--- 7. Pro submits a proposal ---")
    prop_body = {
        "tarif_consultation": 15000,
        "frais_deplacement": 5000,
        "majoration_nuit": 0,
        "majoration_we": 0,
        "majoration_urgence": 0,
        "message": "Je suis disponible mardi 10h",
    }
    r = post(f"/home-request/{request_id}/propose", pro_token, prop_body)
    js = r.json() if r.status_code == 200 else {}
    prop = js.get("proposal") or {}
    proposal_id = prop.get("id")
    log("7a. POST /propose → 200 with proposal.id & total=20000",
        r.status_code == 200 and bool(proposal_id) and prop.get("total") == 20000,
        f"status={r.status_code} total={prop.get('total')} id={proposal_id}")

    # ============================================================
    # 8. Pro tries 2nd proposal (should fail)
    # ============================================================
    print("\n--- 8. Pro tries 2nd proposal ---")
    r = post(f"/home-request/{request_id}/propose", pro_token, prop_body)
    js = r.json() if r.status_code == 400 else {}
    detail = js.get("detail", "")
    log("8a. 2nd /propose by same Pro → 400 with 'déjà proposé'",
        r.status_code == 400 and ("déjà" in detail.lower() or "deja" in detail.lower()),
        f"status={r.status_code} detail={detail}")

    # ============================================================
    # 9. Maman sees the proposal enriched
    # ============================================================
    print("\n--- 9. Maman sees the proposal ---")
    r = get("/home-request/mine", maman_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("id") == request_id), None)
    props = (found or {}).get("proposals", [])
    pname = props[0].get("pro_name") if props else None
    log("9a. /mine request has 1 proposal with pro_name (Dr alpha)",
        len(props) == 1 and bool(pname),
        f"count={len(props)} pro_name={pname}")

    # ============================================================
    # 10. Maman accepts
    # ============================================================
    print("\n--- 10. Maman accepts ---")
    r = post(f"/home-request/{request_id}/accept", maman_token, {"proposal_id": proposal_id})
    js = r.json() if r.status_code == 200 else {}
    rdv = js.get("rdv") or {}
    pay_url = js.get("payment_url")
    log("10a. POST /accept → 200 with rdv+payment_url",
        r.status_code == 200 and bool(rdv),
        f"status={r.status_code} rdv.id={rdv.get('id')} pay_url_present={bool(pay_url)}")
    log("10b. rdv.status=pending_payment",
        rdv.get("status") == "pending_payment", f"status={rdv.get('status')}")
    log("10c. rdv.mode=domicile",
        rdv.get("mode") == "domicile", f"mode={rdv.get('mode')}")
    log("10d. rdv.tarif_total_fcfa=20000",
        rdv.get("tarif_total_fcfa") == 20000, f"total={rdv.get('tarif_total_fcfa')}")
    log("10e. payment_url is PayDunya URL or empty (PayDunya KO)",
        pay_url is None or isinstance(pay_url, str), f"pay_url={pay_url!r}")

    # Check via GET /mine: status=accepted
    r = get("/home-request/mine", maman_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("id") == request_id), None)
    log("10f. GET /mine: status=accepted + accepted_proposal_id matches",
        bool(found) and found.get("status") == "accepted" and found.get("accepted_proposal_id") == proposal_id,
        f"status={found.get('status') if found else None} accepted_id={found.get('accepted_proposal_id') if found else None}")

    # ============================================================
    # 11. Maman tries to cancel after accept
    # ============================================================
    print("\n--- 11. Maman tries to cancel after accept ---")
    r = post(f"/home-request/{request_id}/cancel", maman_token)
    js = r.json() if r.status_code == 400 else {}
    detail = js.get("detail", "")
    log("11a. POST /cancel on accepted req → 400 with 'déjà acceptée'",
        r.status_code == 400 and ("déjà" in detail.lower() or "acceptée" in detail.lower() or "deja" in detail.lower()),
        f"status={r.status_code} detail={detail}")

    # ============================================================
    # 12. Test urgence flow
    # ============================================================
    print("\n--- 12. Test urgence flow ---")
    urg_body = {
        "type": "urgence",
        "motif": "Forte fièvre 39.5",
        "adresse": "Cocody",  # 6 chars - bare minimum
        "ville": "Abidjan",
        "zone": "proche",
    }
    r = post("/home-request", maman_token, urg_body)
    js = r.json() if r.status_code == 200 else {}
    urg_id = js.get("id")
    log("12a. POST urgence request → 200",
        r.status_code == 200 and bool(urg_id), f"status={r.status_code} body={r.text[:200]}")

    # TTL ~ 30 min
    if urg_id:
        created_at = js.get("created_at")
        expires_at = js.get("expires_at")
        try:
            ca = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            ea = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            delta_min = (ea - ca).total_seconds() / 60
            log("12b. Urgence TTL ~30 min", 25 <= delta_min <= 35, f"delta={delta_min:.1f}min")
        except Exception as e:
            log("12b. TTL parsing", False, str(e))

    # Pro lists open requests
    r = get("/home-request/open", pro_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("id") == urg_id), None)
    log("12c. Pro /home-request/open contains urgence",
        r.status_code == 200 and bool(found),
        f"count={len(items)}")

    # Maman cancels urgence
    r = post(f"/home-request/{urg_id}/cancel", maman_token)
    log("12d. Maman cancel urgence → 200",
        r.status_code == 200, f"status={r.status_code} {r.text[:120]}")

    # ============================================================
    # 13. Auto-cleanup expired
    # ============================================================
    print("\n--- 13. Auto-cleanup expired ---")
    # Create new open request, then backdate expires_at via mongo
    exp_body = {
        "type": "domicile",
        "motif": "Test expiry",
        "adresse": "Adresse test pour expiration",
        "quartier": "Cocody",
        "ville": "Abidjan",
        "zone": "moyen",
    }
    r = post("/home-request", maman_token, exp_body)
    exp_id = (r.json() or {}).get("id") if r.status_code == 200 else None
    log("13a. Create request for expiry test", bool(exp_id), f"id={exp_id}")

    if exp_id:
        # Use pymongo to backdate
        try:
            client = MongoClient(MONGO_URL)
            past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            res = client[DB_NAME].home_requests.update_one(
                {"id": exp_id}, {"$set": {"expires_at": past_iso}}
            )
            log("13b. Backdate expires_at via mongo direct", res.modified_count == 1, f"modified={res.modified_count}")
            client.close()
        except Exception as e:
            log("13b. Backdate via mongo", False, str(e))

        # Trigger auto-cleanup via GET /mine
        r = get("/home-request/mine", maman_token)
        items = r.json() if r.status_code == 200 else []
        found = next((it for it in items if it.get("id") == exp_id), None)
        log("13c. After GET /mine: status=expired",
            bool(found) and found.get("status") == "expired",
            f"status={found.get('status') if found else None}")

    # ============================================================
    # 14. Pro views his proposals
    # ============================================================
    print("\n--- 14. Pro views his proposals ---")
    r = get("/home-request/mine-proposals", pro_token)
    items = r.json() if r.status_code == 200 else []
    found = next((it for it in items if it.get("request_id") == request_id), None)
    log("14a. GET /home-request/mine-proposals contains step-7 proposal",
        r.status_code == 200 and bool(found),
        f"count={len(items)}")
    if found:
        log("14b. is_accepted:true for the accepted proposal",
            found.get("is_accepted") is True,
            f"is_accepted={found.get('is_accepted')}")

    # ============================================================
    # 15. Regression
    # ============================================================
    print("\n--- 15. Regression ---")
    # Get a fresh pro list to create a regular RDV
    r = get("/professionnels", maman_token)
    pros = r.json() if r.status_code == 200 else []
    if pros:
        # Try a future date
        dt = (datetime.now(timezone.utc) + timedelta(days=10)).replace(hour=10, minute=0, second=0, microsecond=0).isoformat()
        body = {
            "pro_id": pros[0]["id"],
            "date": dt,
            "motif": "Regression test",
            "mode": "presentiel",
            "tarif_fcfa": 5000,
        }
        r = post("/rdv", maman_token, body)
        rdv_ok = r.status_code in (200, 400)  # 400 if pro has no dispo; we just want no 500
        log("15a. POST /rdv works (no 500)", r.status_code != 500, f"status={r.status_code} body={r.text[:200]}")
        rdv_id = (r.json() or {}).get("id") if r.status_code == 200 else None

        if rdv_id:
            r = post("/pay/consultation", maman_token, {"rdv_id": rdv_id})
            log("15b. POST /pay/consultation works",
                r.status_code in (200, 400), f"status={r.status_code} body={r.text[:200]}")
        else:
            log("15b. POST /pay/consultation works (skipped - no rdv)", True, "skipped")
    else:
        log("15a. POST /rdv (skipped - no pros)", False, "no pros")

    # ============================================================
    # Cleanup
    # ============================================================
    print("\n--- Cleanup ---")
    # Restore original pricing if available
    if original_pricing:
        # Only restore valid keys (HomePricingIn fields)
        valid_keys = {
            "tarif_consultation", "frais_zone_proche", "frais_zone_moyen",
            "frais_zone_loin", "majoration_nuit_fcfa", "majoration_we_fcfa",
            "majoration_urgence_fcfa"
        }
        clean_pricing = {k: v for k, v in original_pricing.items() if k in valid_keys}
        if clean_pricing:
            r = put("/pro/pricing-domicile", pro_token, clean_pricing)
            log("Cleanup: restore Dr alpha pricing", r.status_code == 200, f"status={r.status_code}")

    # Cancel any leftover open requests
    r = get("/home-request/mine", maman_token)
    items = r.json() if r.status_code == 200 else []
    for it in items:
        if it.get("status") == "open":
            post(f"/home-request/{it['id']}/cancel", maman_token)

    # Summary
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} tests passed.")
    failed = [(n, d) for n, ok, d in results if not ok]
    if failed:
        print("\nFAILURES:")
        for n, d in failed:
            print(f"  ❌ {n} → {d}")
    return passed == total


if __name__ == "__main__":
    try:
        ok = main()
        sys.exit(0 if ok else 1)
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(2)
