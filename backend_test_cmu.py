"""
Backend tests for CMU (Couverture Maladie Universelle) feature + updated RDV pricing.

Runs against the public preview URL.
"""
import os
import sys
import time
import uuid
import json
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN = {"email": "maman@test.com", "password": "Maman123!"}
PRO = {"email": "pro@test.com", "password": "Pro123!"}
ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}

PASSED = 0
FAILED = 0
FAILURES = []


def _check(label, cond, detail=""):
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  — {label}")
    else:
        FAILED += 1
        FAILURES.append(f"{label} :: {detail}")
        print(f"  FAIL  — {label}  ::  {detail}")


def _login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"Login failed for {creds['email']}: {r.status_code} {r.text}")
    return r.json()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print("=== Login all users ===")
    m = _login(MAMAN)
    maman_token = m["token"]
    maman_id = m["user"]["id"]
    print(f"maman id={maman_id}")

    p = _login(PRO)
    pro_token = p["token"]
    pro_id = p["user"]["id"]
    print(f"pro id={pro_id}")

    a = _login(ADMIN)
    admin_token = a["token"]

    # ------------------------------------------------------------------
    # 0) Cleanup: make sure maman starts with no CMU
    # ------------------------------------------------------------------
    print("\n=== 0) Cleanup pre-state ===")
    requests.delete(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    requests.patch(f"{BASE}/pro/cmu", json={"accepte_cmu": False}, headers=_auth(pro_token), timeout=15)

    # ------------------------------------------------------------------
    # 1) CMU Maman endpoints
    # ------------------------------------------------------------------
    print("\n=== 1) CMU Maman endpoints ===")
    # 1a) GET /cmu/me fresh
    r = requests.get(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    _check("GET /cmu/me fresh maman returns 200", r.status_code == 200, f"code={r.status_code} body={r.text[:200]}")
    body = r.json() if r.status_code == 200 else {}
    _check("GET /cmu/me fresh maman → cmu={}", body.get("cmu") == {}, f"body={body}")
    _check("GET /cmu/me fresh maman → statut=absent", body.get("statut") == "absent", f"statut={body.get('statut')}")

    # 1b) POST with invalid numero → 400
    r = requests.post(
        f"{BASE}/cmu/me",
        headers=_auth(maman_token),
        json={"numero": "123", "nom_complet": "Aminata Koné"},
        timeout=15,
    )
    _check("POST /cmu/me invalid numero=123 → 400", r.status_code == 400, f"code={r.status_code} body={r.text[:200]}")

    # 1c) POST valid with date_validite in future → statut=actif
    payload_valid = {
        "numero": "0102030405",
        "nom_complet": "Aminata Koné",
        "date_delivrance": "2024-01-15",
        "date_validite": "2099-01-15",
        "beneficiaires": [
            {"nom": "Bébé Test", "numero_cmu": "0102030406", "relation": "enfant"}
        ],
    }
    r = requests.post(f"{BASE}/cmu/me", headers=_auth(maman_token), json=payload_valid, timeout=15)
    _check("POST /cmu/me valid 10-digit numero + future validity → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        _check("POST /cmu/me statut=actif", body.get("statut") == "actif", f"statut={body.get('statut')}")
        _check("POST /cmu/me cmu.numero persisted=0102030405", body.get("cmu", {}).get("numero") == "0102030405", f"cmu={body.get('cmu')}")
        _check("POST /cmu/me beneficiaires persisted", len(body.get("cmu", {}).get("beneficiaires") or []) == 1, "missing beneficiaire")

    # 1d) POST with date_validite in past → statut=expire
    r = requests.post(
        f"{BASE}/cmu/me",
        headers=_auth(maman_token),
        json={"numero": "0102030405", "nom_complet": "Aminata Koné", "date_validite": "2020-01-01"},
        timeout=15,
    )
    _check("POST /cmu/me past date_validite → statut=expire", r.status_code == 200 and r.json().get("statut") == "expire", f"resp={r.text[:200]}")

    # 1e) POST without date_validite → statut=non_verifie
    r = requests.post(
        f"{BASE}/cmu/me",
        headers=_auth(maman_token),
        json={"numero": "0102030405", "nom_complet": "Aminata Koné"},
        timeout=15,
    )
    _check("POST /cmu/me no date_validite → statut=non_verifie", r.status_code == 200 and r.json().get("statut") == "non_verifie", f"resp={r.text[:200]}")

    # 1f) GET /cmu/me as pro → 403
    r = requests.get(f"{BASE}/cmu/me", headers=_auth(pro_token), timeout=15)
    _check("GET /cmu/me as pro → 403", r.status_code == 403, f"code={r.status_code} body={r.text[:200]}")

    # 1g) DELETE /cmu/me then GET → cmu={}
    r = requests.delete(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    _check("DELETE /cmu/me → ok", r.status_code == 200 and r.json().get("ok") is True, f"resp={r.text[:200]}")
    r = requests.get(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    _check("GET /cmu/me after delete → cmu={}", r.status_code == 200 and r.json().get("cmu") == {}, f"resp={r.text[:200]}")

    # Restore maman CMU actif for subsequent tests
    r = requests.post(f"{BASE}/cmu/me", headers=_auth(maman_token), json=payload_valid, timeout=15)
    assert r.status_code == 200 and r.json().get("statut") == "actif"

    # ------------------------------------------------------------------
    # 2) Pro CMU toggle
    # ------------------------------------------------------------------
    print("\n=== 2) Pro CMU toggle ===")
    r = requests.patch(f"{BASE}/pro/cmu", headers=_auth(pro_token), json={"accepte_cmu": True}, timeout=15)
    _check("PATCH /pro/cmu accepte_cmu=true → 200", r.status_code == 200 and r.json().get("accepte_cmu") is True, f"resp={r.text[:200]}")

    r = requests.get(f"{BASE}/auth/me", headers=_auth(pro_token), timeout=15)
    # Note: serialize_user doesn't explicitly return accepte_cmu. Let's check both possibilities.
    me = r.json() if r.status_code == 200 else {}
    has_field = "accepte_cmu" in me and me.get("accepte_cmu") is True
    _check("GET /auth/me shows accepte_cmu=true (serialize_user)", has_field, f"me keys={list(me.keys())}  accepte_cmu={me.get('accepte_cmu')}")

    # PATCH as maman → 403
    r = requests.patch(f"{BASE}/pro/cmu", headers=_auth(maman_token), json={"accepte_cmu": True}, timeout=15)
    _check("PATCH /pro/cmu as maman → 403", r.status_code == 403, f"code={r.status_code}")

    # ------------------------------------------------------------------
    # 3) Prestation with CMU
    # ------------------------------------------------------------------
    print("\n=== 3) Prestation with CMU ===")
    # clean up previous prestations we might have created
    r = requests.get(f"{BASE}/pro/prestations", headers=_auth(pro_token), timeout=15)
    existing = r.json() if r.status_code == 200 else []
    for p in existing:
        if p.get("nom", "").startswith("Consultation prénatale CMU") or p.get("nom", "").startswith("Consultation simple NOCMU"):
            requests.delete(f"{BASE}/pro/prestations/{p['id']}", headers=_auth(pro_token), timeout=15)

    prest_payload = {
        "nom": "Consultation prénatale CMU",
        "prix_fcfa": 10000,
        "duree_min": 30,
        "cmu_prise_en_charge": True,
        "cmu_taux": 0.70,
    }
    r = requests.post(f"{BASE}/pro/prestations", headers=_auth(pro_token), json=prest_payload, timeout=15)
    _check("POST /pro/prestations CMU=true → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    prest_cmu = r.json() if r.status_code == 200 else {}
    prest_cmu_id = prest_cmu.get("id")
    _check("Prestation CMU id returned", bool(prest_cmu_id), f"body={prest_cmu}")
    _check("Prestation cmu_prise_en_charge=true", prest_cmu.get("cmu_prise_en_charge") is True, f"body={prest_cmu}")
    _check("Prestation cmu_taux=0.70", prest_cmu.get("cmu_taux") == 0.70, f"body={prest_cmu}")

    # Public list as maman
    r = requests.get(f"{BASE}/pros/{pro_id}/prestations", headers=_auth(maman_token), timeout=15)
    ok = False
    if r.status_code == 200:
        for it in r.json():
            if it.get("id") == prest_cmu_id and it.get("cmu_prise_en_charge") is True:
                ok = True
                break
    _check("Public prestations visible with cmu_prise_en_charge=true", ok, f"body={r.text[:300]}")

    # Also create a non-CMU prestation for negative case
    prest_no_payload = {
        "nom": "Consultation simple NOCMU",
        "prix_fcfa": 8000,
        "duree_min": 20,
        "cmu_prise_en_charge": False,
    }
    r = requests.post(f"{BASE}/pro/prestations", headers=_auth(pro_token), json=prest_no_payload, timeout=15)
    assert r.status_code == 200, f"prestation-no failed: {r.text}"
    prest_no = r.json()
    prest_no_id = prest_no.get("id")
    _check("Prestation NON-CMU created", prest_no.get("cmu_prise_en_charge") is False, f"body={prest_no}")

    # ------------------------------------------------------------------
    # 4) RDV creation with CMU applied
    # ------------------------------------------------------------------
    print("\n=== 4) RDV creation with CMU applied ===")
    # Ensure maman CMU is actif (restored above)
    rdv_payload = {
        "pro_id": pro_id,
        "date": "2026-05-15T10:00",
        "motif": "test CMU",
        "prestation_id": prest_cmu_id,
        "tarif_fcfa": 99999,  # should be overridden by prestation price
    }
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json=rdv_payload, timeout=20)
    _check("POST /rdv with CMU prestation → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    rdv_cmu = r.json() if r.status_code == 200 else {}
    rdv_cmu_id = rdv_cmu.get("id")
    _check("RDV tarif_fcfa = 10000 (prestation wins)", rdv_cmu.get("tarif_fcfa") == 10000, f"tarif={rdv_cmu.get('tarif_fcfa')}")
    _check("RDV cmu_applique=true", rdv_cmu.get("cmu_applique") is True, f"doc={rdv_cmu}")
    _check("RDV cmu_taux=0.70", rdv_cmu.get("cmu_taux") == 0.70, f"cmu_taux={rdv_cmu.get('cmu_taux')}")
    _check("RDV cmu_montant_fcfa=7000", rdv_cmu.get("cmu_montant_fcfa") == 7000, f"cmu_montant={rdv_cmu.get('cmu_montant_fcfa')}")
    _check("RDV reste_a_charge_fcfa=3000", rdv_cmu.get("reste_a_charge_fcfa") == 3000, f"reste={rdv_cmu.get('reste_a_charge_fcfa')}")
    _check("RDV cmu_numero=0102030405", rdv_cmu.get("cmu_numero") == "0102030405", f"cmu_numero={rdv_cmu.get('cmu_numero')}")

    # Pay consultation - amount should be 3000
    r = requests.post(f"{BASE}/pay/consultation", headers=_auth(maman_token), json={"rdv_id": rdv_cmu_id}, timeout=30)
    _check("POST /pay/consultation for CMU rdv → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    pay_body = r.json() if r.status_code == 200 else {}
    payment = pay_body.get("payment") or {}
    _check("Payment.amount = 3000 (reste_a_charge)", payment.get("amount") == 3000, f"payment.amount={payment.get('amount')} payment={payment}")

    # ------------------------------------------------------------------
    # 5) Negative CMU cases
    # ------------------------------------------------------------------
    print("\n=== 5) Negative CMU cases ===")
    # 5a) RDV with non-CMU prestation → cmu_applique=false, reste_a_charge=tarif
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
        "pro_id": pro_id,
        "date": "2026-05-16T09:00",
        "motif": "no-CMU prestation",
        "prestation_id": prest_no_id,
    }, timeout=20)
    _check("POST /rdv with non-CMU prestation → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    rdv_noprest = r.json() if r.status_code == 200 else {}
    _check("non-CMU prestation → cmu_applique=false", rdv_noprest.get("cmu_applique") is False, f"doc={rdv_noprest}")
    _check("non-CMU prestation → reste_a_charge=tarif", rdv_noprest.get("reste_a_charge_fcfa") == rdv_noprest.get("tarif_fcfa"), f"doc={rdv_noprest}")

    # 5b) Toggle pro accepte_cmu=false → CMU RDV should have cmu_applique=false
    requests.patch(f"{BASE}/pro/cmu", headers=_auth(pro_token), json={"accepte_cmu": False}, timeout=15)
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
        "pro_id": pro_id,
        "date": "2026-05-17T10:00",
        "motif": "pro-refuse-CMU",
        "prestation_id": prest_cmu_id,
    }, timeout=20)
    _check("POST /rdv pro refuse CMU → 200", r.status_code == 200)
    rdv_pro_off = r.json() if r.status_code == 200 else {}
    _check("pro accepte_cmu=false → cmu_applique=false", rdv_pro_off.get("cmu_applique") is False, f"doc={rdv_pro_off}")

    # 5c) Delete maman CMU, toggle pro accepte_cmu back true, create RDV → cmu_applique=false
    requests.delete(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    requests.patch(f"{BASE}/pro/cmu", headers=_auth(pro_token), json={"accepte_cmu": True}, timeout=15)
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
        "pro_id": pro_id,
        "date": "2026-05-18T11:00",
        "motif": "maman-sans-CMU",
        "prestation_id": prest_cmu_id,
    }, timeout=20)
    _check("POST /rdv maman no CMU → 200", r.status_code == 200)
    rdv_absent = r.json() if r.status_code == 200 else {}
    _check("maman CMU absent → cmu_applique=false", rdv_absent.get("cmu_applique") is False, f"doc={rdv_absent}")

    # 5d) Re-set maman CMU with past date_validite, create RDV → cmu_applique=false
    requests.post(
        f"{BASE}/cmu/me",
        headers=_auth(maman_token),
        json={"numero": "0102030405", "nom_complet": "Aminata Koné", "date_validite": "2020-01-01"},
        timeout=15,
    )
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
        "pro_id": pro_id,
        "date": "2026-05-19T11:00",
        "motif": "maman-CMU-expire",
        "prestation_id": prest_cmu_id,
    }, timeout=20)
    _check("POST /rdv maman CMU expire → 200", r.status_code == 200)
    rdv_expire = r.json() if r.status_code == 200 else {}
    _check("maman CMU expire → cmu_applique=false", rdv_expire.get("cmu_applique") is False, f"doc={rdv_expire}")

    # ------------------------------------------------------------------
    # 6) Pro facturation CMU
    # ------------------------------------------------------------------
    print("\n=== 6) Pro facturation CMU ===")
    # Restore maman CMU actif + pro accepte_cmu=true; create 2 RDV CMU
    r = requests.post(f"{BASE}/cmu/me", headers=_auth(maman_token), json=payload_valid, timeout=15)
    assert r.status_code == 200 and r.json().get("statut") == "actif"
    requests.patch(f"{BASE}/pro/cmu", headers=_auth(pro_token), json={"accepte_cmu": True}, timeout=15)

    extra_cmu_ids = []
    for i in range(2):
        r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
            "pro_id": pro_id,
            "date": f"2026-06-0{i+1}T10:00",
            "motif": f"facturation-cmu-{i+1}",
            "prestation_id": prest_cmu_id,
        }, timeout=20)
        if r.status_code == 200:
            extra_cmu_ids.append(r.json().get("id"))
    _check("Created 2 CMU RDV for facturation", len(extra_cmu_ids) == 2, f"ids={extra_cmu_ids}")

    r = requests.get(f"{BASE}/pro/facturation-cmu", headers=_auth(pro_token), timeout=20)
    _check("GET /pro/facturation-cmu → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    fac = r.json() if r.status_code == 200 else {}
    _check("facturation-cmu total_rdv ≥ 3 (1 from step 4 + 2 new)", fac.get("total_rdv", 0) >= 3, f"body={fac}")
    for k in ("total_brut_fcfa", "total_cmu_du_fcfa", "total_reste_a_charge_fcfa", "rdvs"):
        _check(f"facturation-cmu has key {k}", k in fac, f"keys={list(fac.keys())}")
    if fac.get("rdvs"):
        first = fac["rdvs"][0]
        _check("facturation rdv enriched with maman_nom", "maman_nom" in first and first.get("maman_nom"), f"first={first}")
        _check("facturation rdv enriched with numero_cmu", first.get("numero_cmu") == "0102030405", f"first.numero_cmu={first.get('numero_cmu')}")

    # CSV
    r = requests.get(f"{BASE}/pro/facturation-cmu/csv", headers=_auth(pro_token), timeout=20)
    _check("GET /pro/facturation-cmu/csv → 200", r.status_code == 200, f"code={r.status_code}")
    ctype = r.headers.get("content-type", "")
    _check("CSV content-type text/csv", "text/csv" in ctype, f"ctype={ctype}")
    csv_text = r.text if r.status_code == 200 else ""
    lines = csv_text.strip().splitlines()
    _check("CSV has header + data rows", len(lines) >= 2 and "Date" in lines[0] and "Patiente" in lines[0], f"first line={lines[0] if lines else None}")

    # As maman → 403
    r = requests.get(f"{BASE}/pro/facturation-cmu", headers=_auth(maman_token), timeout=15)
    _check("GET /pro/facturation-cmu as maman → 403", r.status_code == 403, f"code={r.status_code}")

    # ------------------------------------------------------------------
    # 7) Admin CMU stats
    # ------------------------------------------------------------------
    print("\n=== 7) Admin CMU stats ===")
    r = requests.get(f"{BASE}/admin/cmu/stats", headers=_auth(admin_token), timeout=20)
    _check("GET /admin/cmu/stats → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    stats = r.json() if r.status_code == 200 else {}
    # Spec expected keys: total_mamans, mamans_avec_cmu, mamans_pct_cmu, total_pros, pros_acceptant_cmu,
    #                    rdv_cmu_total, total_cmu_du_fcfa, total_brut_cmu_fcfa
    # Actual code returns: mamans_total/pros_total instead of total_mamans/total_pros
    expected_keys_spec = ["total_mamans", "mamans_avec_cmu", "mamans_pct_cmu", "total_pros",
                          "pros_acceptant_cmu", "rdv_cmu_total", "total_cmu_du_fcfa", "total_brut_cmu_fcfa"]
    for k in expected_keys_spec:
        _check(f"admin/cmu/stats has key '{k}' (spec)", k in stats, f"stats keys={list(stats.keys())}")

    # As maman → 403
    r = requests.get(f"{BASE}/admin/cmu/stats", headers=_auth(maman_token), timeout=15)
    _check("GET /admin/cmu/stats as maman → 403", r.status_code == 403, f"code={r.status_code}")

    # ------------------------------------------------------------------
    # 8) Regression
    # ------------------------------------------------------------------
    print("\n=== 8) Regression ===")
    r = requests.post(f"{BASE}/auth/login", json=MAMAN, timeout=15)
    _check("POST /auth/login maman still works", r.status_code == 200, f"code={r.status_code}")

    r = requests.get(f"{BASE}/professionnels", headers=_auth(maman_token), timeout=15)
    _check("GET /professionnels → 200", r.status_code == 200 and isinstance(r.json(), list) and len(r.json()) >= 1, f"len={len(r.json()) if r.status_code==200 else r.text[:200]}")

    r = requests.get(f"{BASE}/pro/revenus", headers=_auth(pro_token), timeout=15)
    _check("GET /pro/revenus → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:200]}")
    rev = r.json() if r.status_code == 200 else {}
    for k in ("total_brut_fcfa", "total_commission_fcfa", "total_net_fcfa", "pending_count", "is_premium",
              "current_commission_rate", "premium_rate", "standard_rate"):
        _check(f"pro/revenus has key {k}", k in rev, f"keys={list(rev.keys())}")

    # RDV creation WITHOUT prestation_id still works (uses payload.tarif_fcfa default)
    r = requests.post(f"{BASE}/rdv", headers=_auth(maman_token), json={
        "pro_id": pro_id,
        "date": "2026-07-10T09:00",
        "motif": "regression - no prestation_id",
    }, timeout=20)
    _check("POST /rdv without prestation_id → 200", r.status_code == 200, f"code={r.status_code} body={r.text[:300]}")
    body = r.json() if r.status_code == 200 else {}
    _check("RDV no prestation → prestation_nom is null (no crash)", "prestation_nom" in body and body.get("prestation_nom") is None, f"doc={body}")
    _check("RDV no prestation → tarif_fcfa=10000 (default)", body.get("tarif_fcfa") == 10000, f"doc={body}")
    reg_rdv_id = body.get("id")

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------
    print("\n=== 9) Cleanup ===")
    # Delete created prestations
    if prest_cmu_id:
        requests.delete(f"{BASE}/pro/prestations/{prest_cmu_id}", headers=_auth(pro_token), timeout=15)
    if prest_no_id:
        requests.delete(f"{BASE}/pro/prestations/{prest_no_id}", headers=_auth(pro_token), timeout=15)
    # Reset maman CMU (delete so it's clean)
    requests.delete(f"{BASE}/cmu/me", headers=_auth(maman_token), timeout=15)
    # Restore pro accepte_cmu=false
    requests.patch(f"{BASE}/pro/cmu", headers=_auth(pro_token), json={"accepte_cmu": False}, timeout=15)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total = PASSED + FAILED
    print(f"\n{'='*60}\nSUMMARY: {PASSED}/{total} PASSED, {FAILED} FAILED\n{'='*60}")
    if FAILURES:
        print("\nFAILURES:")
        for f in FAILURES:
            print(f"  - {f}")
    sys.exit(0 if FAILED == 0 else 1)


if __name__ == "__main__":
    main()
