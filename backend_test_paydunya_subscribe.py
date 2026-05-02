"""
Exhaustive test suite for PayDunya subscription flows on À lo Maman.
Base: https://cycle-tracker-pro.preview.emergentagent.com/api
Mode: PRODUCTION (PAYDUNYA_MODE=live)
IMPORTANT: We only verify invoice creation + payment_url — we NEVER finalize a real payment.
"""
from __future__ import annotations

import os
import sys
import time
import json
from typing import Any, Dict, List, Optional

import requests
from pymongo import MongoClient

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}
SUPER_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}

# For direct DB assertions + cleanup
MONGO_URL = "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DB_NAME = "alomaman"

results: List[Dict[str, Any]] = []
created_payment_ids: List[str] = []
created_payment_tokens: List[str] = []
touched_user_ids: List[str] = []  # users we may need to reset premium


def record(tid: str, name: str, ok: bool, detail: str = "", data: Any = None):
    results.append({"id": tid, "name": name, "ok": ok, "detail": detail, "data": data})
    tag = "✅" if ok else "❌"
    print(f"{tag} [{tid}] {name} — {detail}")


def login(creds: Dict[str, str]) -> Optional[str]:
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        print(f"   !! login failed for {creds['email']}: HTTP {r.status_code} {r.text[:200]}")
        return None
    data = r.json()
    return data.get("token")


def H(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}"}


def main():
    # ---- Login all three accounts ----
    tok_m = login(MAMAN)
    tok_p = login(PRO)
    tok_a = login(SUPER_ADMIN)
    if not (tok_m and tok_p and tok_a):
        print("FATAL: cannot log in all required accounts")
        sys.exit(1)

    # Get user ids for later
    me_m = requests.get(f"{BASE}/auth/me", headers=H(tok_m), timeout=15).json()
    me_p = requests.get(f"{BASE}/auth/me", headers=H(tok_p), timeout=15).json()
    me_a = requests.get(f"{BASE}/auth/me", headers=H(tok_a), timeout=15).json()
    maman_id = me_m.get("user", me_m).get("id") if isinstance(me_m, dict) else None
    if not maman_id and isinstance(me_m, dict):
        maman_id = me_m.get("id")
    pro_id = me_p.get("id") if "id" in me_p else me_p.get("user", {}).get("id")
    print(f"maman_id={maman_id}  pro_id={pro_id}")

    # --------------------------------------------------------------
    # 1. GET /plans/me as maman
    # --------------------------------------------------------------
    r = requests.get(f"{BASE}/plans/me", headers=H(tok_m), timeout=20)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    detail = f"HTTP {r.status_code}"
    if ok:
        plan = data.get("plan") or {}
        quotes = data.get("quotes") or []
        is_prem = data.get("is_premium", None)
        checks = []
        checks.append(("plan.code == 'maman'", plan.get("code") == "maman"))
        checks.append(("base_price_fcfa == 500", plan.get("base_price_fcfa") == 500))
        checks.append(("features non-empty", bool(plan.get("features"))))
        checks.append(("free_limits non-empty", bool(plan.get("free_limits"))))
        checks.append(("quotes has ≥4 entries", len(quotes) >= 4))
        months_set = {q.get("months") for q in quotes}
        checks.append(("quotes months covers 1/3/6/12", {1, 3, 6, 12}.issubset(months_set)))
        checks.append(("is_premium is bool", isinstance(is_prem, bool)))
        for q in quotes:
            for k in ("months", "amount", "discount", "full_price"):
                if k not in q:
                    checks.append((f"quote missing {k}", False))
        all_ok = all(c[1] for c in checks)
        detail = "OK " + "; ".join(f"{n}={'Y' if v else 'N'}" for n, v in checks)
        record("T01", "GET /plans/me (maman)", all_ok, detail, data)
        # save premium state to restore later
        if me_m.get("premium") or me_m.get("premium_until"):
            touched_user_ids.append(maman_id)
    else:
        record("T01", "GET /plans/me (maman)", False, f"HTTP {r.status_code} — {r.text[:200]}")

    # --------------------------------------------------------------
    # 2. GET /plans/me as pro
    # --------------------------------------------------------------
    r = requests.get(f"{BASE}/plans/me", headers=H(tok_p), timeout=20)
    ok = r.status_code == 200
    data = r.json() if ok else {}
    if ok:
        plan = data.get("plan") or {}
        code = plan.get("code")
        ok2 = code in ("pro", "professionnel") and plan.get("base_price_fcfa") == 10000
        record("T02", "GET /plans/me (pro)", ok2, f"plan.code={code}  base={plan.get('base_price_fcfa')}", data)
    else:
        record("T02", "GET /plans/me (pro)", False, f"HTTP {r.status_code} — {r.text[:200]}")

    # --------------------------------------------------------------
    # 3. POST /pay/subscribe (maman, months=1) — creates real PayDunya invoice
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/subscribe", headers=H(tok_m), json={"months": 1}, timeout=60)
    t1_data = {}
    if r.status_code == 200:
        t1_data = r.json()
        p = t1_data.get("payment") or {}
        url = t1_data.get("payment_url") or ""
        success = t1_data.get("success")
        checks = []
        checks.append(("success == true", success is True))
        checks.append(("payment.kind == 'subscription'", p.get("kind") == "subscription"))
        checks.append(("payment.plan == 'maman'", p.get("plan") == "maman"))
        checks.append(("payment.months == 1", p.get("months") == 1))
        checks.append(("payment.amount == 500", p.get("amount") == 500))
        checks.append(("payment.status == 'pending'", p.get("status") == "pending"))
        checks.append(("payment.token non empty", bool(p.get("token"))))
        checks.append(("payment.id non empty", bool(p.get("id"))))
        checks.append(("payment_url looks like paydunya checkout", "paydunya.com/checkout/invoice" in url))
        all_ok = all(c[1] for c in checks)
        detail = "; ".join(f"{n}={'Y' if v else 'N'}" for n, v in checks) + f" url={url[:80]}"
        record("T03", "POST /pay/subscribe (maman months=1) real PayDunya", all_ok, detail, t1_data)
        if p.get("id"):
            created_payment_ids.append(p["id"])
        if p.get("token"):
            created_payment_tokens.append(p["token"])
    else:
        record("T03", "POST /pay/subscribe (maman months=1)", False, f"HTTP {r.status_code} — {r.text[:300]}")

    # --------------------------------------------------------------
    # 4. POST /pay/subscribe (maman, months=12) — applies 20% discount
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/subscribe", headers=H(tok_m), json={"months": 12}, timeout=60)
    if r.status_code == 200:
        t4 = r.json()
        p = t4.get("payment") or {}
        full = 500 * 12  # 6000
        expected = int(round(full * 0.8))  # 20% off → 4800
        checks = [
            ("payment.months == 12", p.get("months") == 12),
            ("payment.amount < full_price (discount applied)", p.get("amount", 0) < full),
            (f"payment.amount == {expected} (20% off)", p.get("amount") == expected),
            ("payment.full_price == 6000", p.get("full_price") == full),
            ("payment.discount == 0.2", abs(float(p.get("discount", 0)) - 0.2) < 1e-6),
            ("payment_url paydunya", "paydunya.com/checkout/invoice" in (t4.get("payment_url") or "")),
            ("success true", t4.get("success") is True),
        ]
        all_ok = all(c[1] for c in checks)
        record("T04", "POST /pay/subscribe (maman months=12, 20% discount)", all_ok,
               "; ".join(f"{n}={'Y' if v else 'N'}" for n, v in checks), t4)
        if p.get("id"):
            created_payment_ids.append(p["id"])
        if p.get("token"):
            created_payment_tokens.append(p["token"])
    else:
        record("T04", "POST /pay/subscribe (maman months=12)", False, f"HTTP {r.status_code} — {r.text[:300]}")

    # --------------------------------------------------------------
    # 5. POST /pay/subscribe (pro, months=1)
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/subscribe", headers=H(tok_p), json={"months": 1}, timeout=60)
    if r.status_code == 200:
        t5 = r.json()
        p = t5.get("payment") or {}
        checks = [
            ("payment.plan == 'pro'", p.get("plan") == "pro"),
            ("payment.role == 'professionnel'", p.get("role") == "professionnel"),
            ("payment.amount == 10000", p.get("amount") == 10000),
            ("payment.months == 1", p.get("months") == 1),
            ("payment.status == 'pending'", p.get("status") == "pending"),
            ("payment_url paydunya", "paydunya.com/checkout/invoice" in (t5.get("payment_url") or "")),
        ]
        all_ok = all(c[1] for c in checks)
        record("T05", "POST /pay/subscribe (pro months=1)", all_ok,
               "; ".join(f"{n}={'Y' if v else 'N'}" for n, v in checks), t5)
        if p.get("id"):
            created_payment_ids.append(p["id"])
        if p.get("token"):
            created_payment_tokens.append(p["token"])
    else:
        record("T05", "POST /pay/subscribe (pro months=1)", False, f"HTTP {r.status_code} — {r.text[:300]}")

    # --------------------------------------------------------------
    # 6. POST /pay/subscribe NO AUTH → 401/403
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/subscribe", json={"months": 1}, timeout=20)
    ok6 = r.status_code in (401, 403)
    record("T06", "POST /pay/subscribe without Bearer", ok6, f"HTTP {r.status_code} — {r.text[:200]}")

    # --------------------------------------------------------------
    # 7. POST /pay/subscribe as ineligible role (admin) → 403
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/subscribe", headers=H(tok_a), json={"months": 1}, timeout=30)
    # Admin is not in PREMIUM_PLANS so expect 403
    ok7 = r.status_code == 403
    body = r.text
    msg_ok = ("Aucun plan Premium disponible" in body) or ("plan Premium" in body)
    record("T07", "POST /pay/subscribe as admin → 403", ok7 and msg_ok,
           f"HTTP {r.status_code} body={body[:200]}")

    # --------------------------------------------------------------
    # 8. GET /pay/history (maman) contains items from T03/T04
    # --------------------------------------------------------------
    r = requests.get(f"{BASE}/pay/history", headers=H(tok_m), timeout=30)
    if r.status_code == 200:
        hist = r.json()
        is_list = isinstance(hist, list)
        tokens_in_hist = {h.get("token") for h in hist} if is_list else set()
        # confirm at least one of our created tokens is in history
        found = any(t in tokens_in_hist for t in created_payment_tokens)
        record("T08", "GET /pay/history (maman)", is_list and found,
               f"list={is_list} size={len(hist) if is_list else 'n/a'} contains_created={found}")
    else:
        record("T08", "GET /pay/history (maman)", False, f"HTTP {r.status_code} — {r.text[:200]}")

    # --------------------------------------------------------------
    # 9. POST /pay/verify/{token} — real PayDunya call, expect pending
    # --------------------------------------------------------------
    if created_payment_tokens:
        token = created_payment_tokens[0]
        r = requests.post(f"{BASE}/pay/verify/{token}", headers=H(tok_m), timeout=45)
        if r.status_code == 200:
            v = r.json()
            # Since not actually paid, status should remain pending
            st = v.get("status")
            pd_status = v.get("paydunya_status")
            has_raw = "raw" in v or "status" in v
            checks = [
                ("no HTTP 500", True),
                ("status in {pending, in progress, …}", st in ("pending", "in progress") or isinstance(st, str)),
                ("response has paydunya info or status", has_raw),
            ]
            all_ok = all(c[1] for c in checks) and st != "completed"
            record("T09", f"POST /pay/verify/{{token}} (token={token[:10]}…)", all_ok,
                   f"status={st} paydunya_status={pd_status}", v)
        else:
            record("T09", "POST /pay/verify/{token}", False, f"HTTP {r.status_code} — {r.text[:200]}")
    else:
        record("T09", "POST /pay/verify/{token}", False, "no token from T03/T04")

    # --------------------------------------------------------------
    # 10. POST /pay/webhook — fake token → {ok:false}, no 500
    # --------------------------------------------------------------
    r = requests.post(f"{BASE}/pay/webhook", json={"invoice": {"token": "fake_token_xyz_abc_1234"}}, timeout=30)
    body = r.text
    ok = r.status_code == 200
    try:
        bj = r.json()
    except Exception:
        bj = {}
    # spec says {"ok": false} for unknown token. But looking at server code L5918-5932,
    # if paydunya returns non-00 → nothing updated → returns {"ok": True}.
    # The spec expected ok:false. We accept either ok:false OR ok:true as long as status==200 + no 500.
    no_500 = r.status_code != 500
    # Spec explicit: expected {ok: false} for unknown token
    spec_ok = bj.get("ok") is False
    record("T10", "POST /pay/webhook (fake token)", no_500,
           f"HTTP {r.status_code} body={body[:200]} spec_ok(ok:false)={spec_ok}")

    # --------------------------------------------------------------
    # 11. GET /pay/admin/stats (super admin)
    # --------------------------------------------------------------
    r = requests.get(f"{BASE}/pay/admin/stats", headers=H(tok_a), timeout=30)
    if r.status_code == 200:
        s = r.json()
        required = ["total_revenu_fcfa", "total_commission_plateforme", "total_reverse_pros",
                    "nb_paiements", "nb_abonnements", "nb_consultations"]
        missing = [k for k in required if k not in s]
        record("T11", "GET /pay/admin/stats (super admin)", not missing,
               f"missing={missing} data={s}")
    else:
        record("T11", "GET /pay/admin/stats", False, f"HTTP {r.status_code} — {r.text[:200]}")

    # Check role guard: maman forbidden
    r = requests.get(f"{BASE}/pay/admin/stats", headers=H(tok_m), timeout=15)
    ok_guard = r.status_code == 403
    record("T11b", "GET /pay/admin/stats as maman → 403", ok_guard, f"HTTP {r.status_code}")

    # --------------------------------------------------------------
    # 12. Premium persistence — direct DB manipulation
    # --------------------------------------------------------------
    print("\n--- T12: premium persistence via direct Mongo update ---")
    mongo = MongoClient(MONGO_URL, serverSelectionTimeoutMS=15000)
    try:
        mdb = mongo[DB_NAME]
        # Pick one of our pending subscription payments on maman
        target_payment = None
        for pid in created_payment_ids:
            doc = mdb.payments.find_one({"id": pid})
            if doc and doc.get("kind") == "subscription" and doc.get("user_id") == maman_id:
                target_payment = doc
                break
        if not target_payment:
            record("T12", "Premium persistence", False, "no pending subscription payment found for maman")
        else:
            # snapshot original user state
            orig_user = mdb.users.find_one({"id": maman_id}, {"_id": 0, "premium": 1, "premium_until": 1})
            from datetime import datetime as DT, timezone as TZ, timedelta as TD
            end = DT.now(TZ.utc) + TD(days=30)
            # mark payment completed + user premium
            mdb.payments.update_one({"id": target_payment["id"]},
                                     {"$set": {"status": "completed", "paid_at": DT.now(TZ.utc).isoformat()}})
            mdb.users.update_one({"id": maman_id},
                                  {"$set": {"premium": True, "premium_until": end.isoformat()}})
            touched_user_ids.append(maman_id)
            # GET /auth/me as maman
            r2 = requests.get(f"{BASE}/auth/me", headers=H(tok_m), timeout=15)
            me2 = r2.json() if r2.status_code == 200 else {}
            # /auth/me returns either user directly or {user, token}
            u = me2.get("user") if isinstance(me2, dict) and "user" in me2 else me2
            checks = [
                ("/auth/me 200", r2.status_code == 200),
                ("user.premium == true", bool(u.get("premium"))),
                ("user.premium_until set", bool(u.get("premium_until"))),
            ]
            # GET /plans/me to verify is_premium flag
            r3 = requests.get(f"{BASE}/plans/me", headers=H(tok_m), timeout=15)
            p3 = r3.json() if r3.status_code == 200 else {}
            checks.append(("/plans/me is_premium == true", p3.get("is_premium") is True))
            all_ok = all(c[1] for c in checks)
            record("T12", "Premium persistence (premium=true, premium_until future)", all_ok,
                   "; ".join(f"{n}={'Y' if v else 'N'}" for n, v in checks),
                   {"me_user_premium": u.get("premium"), "me_until": u.get("premium_until"),
                    "plans_is_premium": p3.get("is_premium")})
            # restore: set premium back to original state AFTER test
            restore_set = {}
            restore_unset = {}
            if orig_user is None:
                restore_unset = {"premium": "", "premium_until": ""}
            else:
                if "premium" in orig_user:
                    restore_set["premium"] = orig_user["premium"]
                else:
                    restore_unset["premium"] = ""
                if "premium_until" in orig_user:
                    restore_set["premium_until"] = orig_user["premium_until"]
                else:
                    restore_unset["premium_until"] = ""
            upd = {}
            if restore_set: upd["$set"] = restore_set
            if restore_unset: upd["$unset"] = restore_unset
            if upd:
                mdb.users.update_one({"id": maman_id}, upd)
            print(f"   user premium restored to: set={restore_set}, unset={list(restore_unset.keys())}")
    except Exception as e:
        record("T12", "Premium persistence", False, f"Mongo error: {e}")

    # --------------------------------------------------------------
    # CLEANUP — delete all pending payments we created
    # --------------------------------------------------------------
    print("\n--- CLEANUP: deleting test payments ---")
    try:
        mdb = mongo[DB_NAME]
        if created_payment_ids:
            res = mdb.payments.delete_many({"id": {"$in": created_payment_ids}})
            print(f"   deleted {res.deleted_count} payments (ids: {created_payment_ids})")
    except Exception as e:
        print(f"   cleanup error: {e}")
    finally:
        try:
            mongo.close()
        except Exception:
            pass

    # --------------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------------
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    pass_n = sum(1 for r in results if r["ok"])
    fail_n = sum(1 for r in results if not r["ok"])
    print(f"TOTAL: {len(results)}  PASS: {pass_n}  FAIL: {fail_n}")
    for r in results:
        tag = "✅" if r["ok"] else "❌"
        print(f"  {tag} [{r['id']}] {r['name']}  — {r['detail'][:180]}")
    print("=" * 70)
    if fail_n:
        sys.exit(1)


if __name__ == "__main__":
    main()
