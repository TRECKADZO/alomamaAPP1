"""Test role-aware Premium plans endpoints."""
import requests
import sys

BASE = "https://health-prestation.preview.emergentagent.com/api"

CREDS = {
    "maman": ("maman@test.com", "Maman123!"),
    "pro": ("pro@test.com", "Pro123!"),
    "centre": ("centre1@test.com", "Centre123!"),
    "admin": ("klenakan.eric@gmail.com", "474Treckadzo$1986"),
}

results = []


def log(ok, name, detail=""):
    results.append((ok, name, detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("-- " + detail) if detail else "")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def test_public_plans():
    r = requests.get(f"{BASE}/plans", timeout=20)
    log(r.status_code == 200, "GET /plans returns 200", f"status={r.status_code}")
    data = r.json()
    log("plans" in data and "durations" in data, "GET /plans has plans+durations keys", str(list(data.keys())))
    plans = data.get("plans", {})
    for k in ["maman", "professionnel", "centre_sante"]:
        ok = k in plans
        log(ok, f"GET /plans has key '{k}'")
        if ok:
            p = plans[k]
            missing = [f for f in ("code","label","base_price_fcfa","color","icon","description","features","free_limits") if f not in p]
            log(not missing, f"plans.{k} has required fields", f"missing={missing}")
    durs = data.get("durations", [])
    months_list = sorted([d.get("months") for d in durs])
    log(months_list == [1,3,6,12], "GET /plans durations = [1,3,6,12]", f"got={months_list}")


def test_plans_me_for(role_key, expected_code, expected_base, expected_quotes):
    email, pw = CREDS[role_key]
    tok = login(email, pw)
    r = requests.get(f"{BASE}/plans/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    log(r.status_code == 200, f"GET /plans/me [{role_key}] 200", f"status={r.status_code}")
    data = r.json()
    plan = data.get("plan")
    log(plan is not None, f"GET /plans/me [{role_key}] plan present")
    if plan:
        log(plan.get("code") == expected_code, f"plans/me[{role_key}].plan.code={expected_code}", f"got={plan.get('code')}")
        log(plan.get("base_price_fcfa") == expected_base, f"plans/me[{role_key}].base_price={expected_base}", f"got={plan.get('base_price_fcfa')}")
    quotes = data.get("quotes", [])
    log(len(quotes) == 4, f"plans/me[{role_key}] has 4 quotes", f"got={len(quotes)}")
    by_month = {q["months"]: q["amount"] for q in quotes}
    for months, expected_amount in expected_quotes.items():
        got = by_month.get(months)
        log(got == expected_amount, f"plans/me[{role_key}] {months}mo amount={expected_amount}", f"got={got}")


def test_plans_me_admin():
    tok = login(*CREDS["admin"])
    r = requests.get(f"{BASE}/plans/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    log(r.status_code == 200, "GET /plans/me [admin] 200", f"status={r.status_code}")
    data = r.json()
    log(data.get("plan") is None, "GET /plans/me [admin] plan is null", f"plan={data.get('plan')}")
    log(data.get("quotes") == [], "GET /plans/me [admin] quotes empty", f"quotes={data.get('quotes')}")


def test_pay_subscribe(role_key, months, expected_amount, expected_plan_code):
    tok = login(*CREDS[role_key])
    r = requests.post(
        f"{BASE}/pay/subscribe",
        headers={"Authorization": f"Bearer {tok}"},
        json={"months": months},
        timeout=30,
    )
    log(r.status_code == 200, f"POST /pay/subscribe [{role_key}, {months}mo] 200", f"status={r.status_code} body={r.text[:200]}")
    data = r.json()
    doc = data.get("payment", {})
    log(doc.get("amount") == expected_amount, f"pay/subscribe[{role_key},{months}] amount={expected_amount}", f"got={doc.get('amount')}")
    log(doc.get("plan") == expected_plan_code, f"pay/subscribe[{role_key},{months}] plan={expected_plan_code}", f"got={doc.get('plan')}")
    log(doc.get("role") == ("professionnel" if role_key=="pro" else ("centre_sante" if role_key=="centre" else "maman")), f"pay/subscribe[{role_key}] role field correct", f"got={doc.get('role')}")
    log(doc.get("months") == months, f"pay/subscribe[{role_key}] months={months}", f"got={doc.get('months')}")
    # PayDunya may be unconfigured: success=false but doc saved with status=error is OK
    if data.get("success") is False:
        log(doc.get("status") in ("error", "pending"), f"pay/subscribe[{role_key}] doc saved (status=error acceptable)", f"status={doc.get('status')} err={doc.get('error')}")
    else:
        log(doc.get("status") == "pending", f"pay/subscribe[{role_key}] status=pending when success", f"got={doc.get('status')}")


def test_pay_subscribe_admin_forbidden():
    tok = login(*CREDS["admin"])
    r = requests.post(
        f"{BASE}/pay/subscribe",
        headers={"Authorization": f"Bearer {tok}"},
        json={"months": 1},
        timeout=30,
    )
    log(r.status_code == 403, "POST /pay/subscribe [admin] 403", f"status={r.status_code} body={r.text[:200]}")


def main():
    print("=== Public /plans ===")
    test_public_plans()

    print("\n=== /plans/me per role ===")
    # maman quotes
    test_plans_me_for(
        "maman", "maman", 2000,
        {1: 2000, 3: 5700, 6: 10800, 12: 19200},
    )
    # pro quotes
    test_plans_me_for(
        "pro", "pro", 10000,
        {1: 10000, 3: 28500, 6: 54000, 12: 96000},
    )
    # centre quotes
    test_plans_me_for(
        "centre", "centre", 25000,
        {1: 25000, 3: 71250, 6: 135000, 12: 240000},
    )
    # admin has no plan
    test_plans_me_admin()

    print("\n=== /pay/subscribe ===")
    test_pay_subscribe("maman", 1, 2000, "maman")
    test_pay_subscribe("pro", 3, 28500, "pro")
    test_pay_subscribe("centre", 12, 240000, "centre")
    test_pay_subscribe_admin_forbidden()

    print("\n=== Summary ===")
    ok = sum(1 for r in results if r[0])
    total = len(results)
    print(f"{ok}/{total} passed")
    failed = [(n,d) for (o,n,d) in results if not o]
    if failed:
        print("FAILED:")
        for n,d in failed:
            print(" -", n, d)
        sys.exit(1)


if __name__ == "__main__":
    main()
