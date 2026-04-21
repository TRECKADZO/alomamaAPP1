"""
Test: Famille Premium plan + Freemium quotas (enfants + rdv) + Quota error format + regressions.
Target: https://health-prestation.preview.emergentagent.com/api
"""
import os
import sys
import uuid
import requests

BASE = "https://health-prestation.preview.emergentagent.com/api"

results = []  # list of (name, ok, detail)


def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    prefix = "PASS" if ok else "FAIL"
    print(f"[{prefix}] {name}" + (f" — {detail}" if detail else ""))


def login(email=None, phone=None, password=""):
    body = {"password": password}
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    r = requests.post(f"{BASE}/auth/login", json=body, timeout=30)
    return r


def authed(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    # ---------------------------------------------------------------
    # 1) GET /api/plans (public) — must include famille entry now
    # ---------------------------------------------------------------
    r = requests.get(f"{BASE}/plans", timeout=30)
    if r.status_code != 200:
        rec("GET /plans returns 200", False, f"status={r.status_code} body={r.text[:200]}")
        return
    data = r.json()
    plans = data.get("plans", {})
    rec("GET /plans returns 200 with plans dict", True, f"keys={list(plans.keys())}")
    # 4 plans expected
    rec(
        "GET /plans has 4 role-plans (maman, pro, centre, famille)",
        set(plans.keys()) == {"maman", "professionnel", "centre_sante", "famille"},
        f"got={sorted(plans.keys())}",
    )
    fam = plans.get("famille") or {}
    rec("plans.famille.base_price_fcfa == 1500", fam.get("base_price_fcfa") == 1500, f"got={fam.get('base_price_fcfa')}")
    rec("plans.famille.label == 'Famille Premium'", fam.get("label") == "Famille Premium", f"got={fam.get('label')}")
    rec("plans.famille.icon == 'people-circle'", fam.get("icon") == "people-circle", f"got={fam.get('icon')}")
    rec("plans.famille.code == 'famille'", fam.get("code") == "famille", f"got={fam.get('code')}")

    # ---------------------------------------------------------------
    # 2) Famille account — /plans/me and /pay/subscribe
    # ---------------------------------------------------------------
    # Try both seeded credentials: review said papa@test.com / Papa123!, but seeded is papa1@test.com.
    famille_token = None
    for em in ["papa@test.com", "papa1@test.com"]:
        r = login(email=em, password="Papa123!")
        if r.status_code == 200:
            famille_token = r.json()["token"]
            famille_email = em
            famille_user = r.json()["user"]
            rec(f"Login famille ({em})", True, f"role={famille_user.get('role')}")
            break
    if not famille_token:
        # Fallback: register a new famille account
        uniq = uuid.uuid4().hex[:6]
        body = {
            "email": f"papa.test.{uniq}@test.com",
            "password": "Papa123!",
            "name": "Papa Test",
            "role": "famille",
        }
        r = requests.post(f"{BASE}/auth/register", json=body, timeout=30)
        if r.status_code != 200:
            rec("Register fallback famille", False, f"{r.status_code} {r.text[:200]}")
            return
        famille_token = r.json()["token"]
        famille_user = r.json()["user"]
        famille_email = body["email"]
        rec(f"Register fallback famille ({famille_email})", True)

    # GET /plans/me as famille
    r = requests.get(f"{BASE}/plans/me", headers=authed(famille_token), timeout=30)
    if r.status_code != 200:
        rec("GET /plans/me as famille", False, f"{r.status_code} {r.text[:200]}")
    else:
        pd = r.json()
        pl = pd.get("plan") or {}
        rec("GET /plans/me famille → plan.code == 'famille'", pl.get("code") == "famille", f"got={pl.get('code')}")
        # Quotes
        quotes = pd.get("quotes", [])
        q1 = next((q for q in quotes if q["months"] == 1), None)
        rec("GET /plans/me famille 1mo quote.amount == 1500", q1 and q1.get("amount") == 1500, f"got={q1}")

    # POST /pay/subscribe as famille months=1
    r = requests.post(f"{BASE}/pay/subscribe", headers=authed(famille_token), json={"months": 1}, timeout=45)
    if r.status_code != 200:
        rec("POST /pay/subscribe famille months=1", False, f"{r.status_code} {r.text[:200]}")
    else:
        body = r.json()
        pay = body.get("payment", {})
        rec("POST /pay/subscribe famille → payment.amount == 1500", pay.get("amount") == 1500, f"got={pay.get('amount')}")
        rec("POST /pay/subscribe famille → payment.plan == 'famille'", pay.get("plan") == "famille", f"got={pay.get('plan')}")
        rec("POST /pay/subscribe famille → payment.role == 'famille'", pay.get("role") == "famille", f"got={pay.get('role')}")

    # ---------------------------------------------------------------
    # 3) Freemium quota on /enfants (maman limit = 2)
    # ---------------------------------------------------------------
    # Login seeded maman
    r = login(email="maman@test.com", password="Maman123!")
    if r.status_code != 200:
        rec("Login maman@test.com", False, f"{r.status_code} {r.text[:200]}")
        return
    maman_token = r.json()["token"]
    maman_user = r.json()["user"]
    is_prem = bool(maman_user.get("premium"))
    rec("Login maman@test.com", True, f"premium={is_prem}")

    target_token = maman_token
    fresh_email = None
    if is_prem:
        # Create a fresh non-premium maman
        uniq = uuid.uuid4().hex[:8]
        fresh_email = f"test.quota.{uniq}@test.com"
        body = {
            "email": fresh_email,
            "password": "Test123!",
            "name": "Test Quota",
            "role": "maman",
        }
        r = requests.post(f"{BASE}/auth/register", json=body, timeout=30)
        if r.status_code != 200:
            rec("Register fresh non-premium maman for quota test", False, f"{r.status_code} {r.text[:200]}")
            return
        target_token = r.json()["token"]
        rec(f"Register fresh non-premium maman {fresh_email}", True)

    # Clean existing enfants
    r = requests.get(f"{BASE}/enfants", headers=authed(target_token), timeout=30)
    if r.status_code == 200:
        existing = r.json()
        for e in existing:
            requests.delete(f"{BASE}/enfants/{e['id']}", headers=authed(target_token), timeout=30)
        rec(f"Cleared {len(existing)} pre-existing enfants", True)

    # Create 2 (within quota)
    payloads = [
        {"nom": "Fatoumata Koné", "date_naissance": "2024-01-15", "sexe": "F", "poids_kg": 3.2, "taille_cm": 50},
        {"nom": "Moussa Koné", "date_naissance": "2023-07-20", "sexe": "M", "poids_kg": 3.5, "taille_cm": 52},
    ]
    for i, p in enumerate(payloads, 1):
        r = requests.post(f"{BASE}/enfants", headers=authed(target_token), json=p, timeout=30)
        rec(f"POST /enfants #{i} within quota → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # 3rd enfant → expect 402 with proper detail
    p3 = {"nom": "Aïcha Koné", "date_naissance": "2025-02-10", "sexe": "F"}
    r = requests.post(f"{BASE}/enfants", headers=authed(target_token), json=p3, timeout=30)
    rec("POST /enfants 3rd → 402", r.status_code == 402, f"status={r.status_code} body={r.text[:300]}")
    try:
        detail = r.json().get("detail", {})
    except Exception:
        detail = {}
    rec("402 detail.error == 'quota_exceeded'", isinstance(detail, dict) and detail.get("error") == "quota_exceeded", f"got={detail}")
    rec("402 detail.quota == 'enfants_max'", isinstance(detail, dict) and detail.get("quota") == "enfants_max", f"got={detail.get('quota') if isinstance(detail, dict) else detail}")
    rec("402 detail.limit == 2", isinstance(detail, dict) and detail.get("limit") == 2, f"got={detail.get('limit') if isinstance(detail, dict) else detail}")
    rec(
        "402 detail.message contains 'Premium'",
        isinstance(detail, dict) and "Premium" in (detail.get("message") or ""),
        f"got={detail.get('message') if isinstance(detail, dict) else detail}",
    )
    rec(
        "402 detail.upgrade_url == '/premium'",
        isinstance(detail, dict) and detail.get("upgrade_url") == "/premium",
        f"got={detail.get('upgrade_url') if isinstance(detail, dict) else detail}",
    )

    # Cleanup fresh maman enfants (best-effort)
    if fresh_email:
        r = requests.get(f"{BASE}/enfants", headers=authed(target_token), timeout=30)
        if r.status_code == 200:
            for e in r.json():
                requests.delete(f"{BASE}/enfants/{e['id']}", headers=authed(target_token), timeout=30)

    # Also clean up seeded maman's test enfants so tests remain idempotent
    if not is_prem:
        r = requests.get(f"{BASE}/enfants", headers=authed(maman_token), timeout=30)
        if r.status_code == 200:
            for e in r.json():
                if e.get("nom", "").endswith("Koné") or "Test" in e.get("nom", ""):
                    requests.delete(f"{BASE}/enfants/{e['id']}", headers=authed(maman_token), timeout=30)

    # ---------------------------------------------------------------
    # 4) Freemium quota on RDV (maman) — just verify 1 RDV works; rdv_per_month=10
    # ---------------------------------------------------------------
    # Use a fresh maman to keep RDV counts controlled
    uniq = uuid.uuid4().hex[:8]
    rdv_email = f"test.rdv.{uniq}@test.com"
    body = {"email": rdv_email, "password": "Test123!", "name": "Test RDV", "role": "maman"}
    r = requests.post(f"{BASE}/auth/register", json=body, timeout=30)
    if r.status_code != 200:
        rec("Register fresh maman for RDV quota test", False, f"{r.status_code} {r.text[:200]}")
    else:
        rdv_token = r.json()["token"]
        rec(f"Register fresh maman {rdv_email}", True)
        # Get a pro
        r = requests.get(f"{BASE}/professionnels", headers=authed(rdv_token), timeout=30)
        if r.status_code == 200 and r.json():
            pro_id = r.json()[0]["id"]
            # Create 2 RDV (well below 10 limit)
            from datetime import datetime, timezone
            for i in range(2):
                rdv_body = {
                    "pro_id": pro_id,
                    "date": f"2026-0{5+i}-15T10:30",
                    "motif": f"Consultation de suivi #{i+1}",
                    "type_consultation": "prenatale",
                }
                rr = requests.post(f"{BASE}/rdv", headers=authed(rdv_token), json=rdv_body, timeout=30)
                rec(f"POST /rdv #{i+1} under quota → 200", rr.status_code == 200, f"status={rr.status_code} body={rr.text[:200]}")
        else:
            rec("GET /professionnels (for rdv quota)", False, f"status={r.status_code}")

    # ---------------------------------------------------------------
    # 5) Regression
    # ---------------------------------------------------------------
    # (a) Admin /plans/me — plan=null expected
    r = login(email="klenakan.eric@gmail.com", password="474Treckadzo$1986")
    if r.status_code != 200:
        rec("Login super admin", False, f"{r.status_code} {r.text[:200]}")
    else:
        admin_token = r.json()["token"]
        rec("Login super admin klenakan.eric@gmail.com", True)
        r = requests.get(f"{BASE}/plans/me", headers=authed(admin_token), timeout=30)
        if r.status_code != 200:
            rec("Admin GET /plans/me 200", False, f"{r.status_code} {r.text[:200]}")
        else:
            ap = r.json()
            rec("Admin /plans/me → plan is None", ap.get("plan") is None, f"plan={ap.get('plan')}")
            rec("Admin /plans/me → quotes is []", ap.get("quotes") == [], f"quotes={ap.get('quotes')}")

    # (b) POST /pay/subscribe still works for maman, pro, centre
    r = login(email="maman@test.com", password="Maman123!")
    if r.status_code == 200:
        tok = r.json()["token"]
        r = requests.post(f"{BASE}/pay/subscribe", headers=authed(tok), json={"months": 1}, timeout=45)
        ok = r.status_code == 200 and (r.json().get("payment", {}).get("amount") == 2000)
        rec("Regression: maman /pay/subscribe m=1 → amount 2000", ok, f"status={r.status_code} body={r.text[:200]}")

    r = login(email="pro@test.com", password="Pro123!")
    if r.status_code == 200:
        tok = r.json()["token"]
        r = requests.post(f"{BASE}/pay/subscribe", headers=authed(tok), json={"months": 1}, timeout=45)
        ok = r.status_code == 200 and (r.json().get("payment", {}).get("amount") == 10000)
        rec("Regression: pro /pay/subscribe m=1 → amount 10000", ok, f"status={r.status_code} body={r.text[:200]}")

    r = login(email="centre1@test.com", password="Centre123!")
    if r.status_code == 200:
        tok = r.json()["token"]
        r = requests.post(f"{BASE}/pay/subscribe", headers=authed(tok), json={"months": 1}, timeout=45)
        ok = r.status_code == 200 and (r.json().get("payment", {}).get("amount") == 25000)
        rec("Regression: centre /pay/subscribe m=1 → amount 25000", ok, f"status={r.status_code} body={r.text[:200]}")

    # Summary
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed}/{total} PASS")
    for n, ok, d in results:
        if not ok:
            print(f"  FAIL — {n} :: {d}")
    print("=" * 70)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
