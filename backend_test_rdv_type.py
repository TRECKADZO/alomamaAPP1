"""
Test for /api/rdv endpoint with optional `type_consultation` field.
Also runs a quick regression on /api/grossesse, /api/enfants, /api/reminders.
"""
import os
import sys
import requests

BASE = os.environ.get("BACKEND_URL", "https://cycle-tracker-pro.preview.emergentagent.com") + "/api"
MAMAN_EMAIL = "maman@test.com"
MAMAN_PASSWORD = "Maman123!"

results = []


def record(name, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name} :: {detail}")
    results.append((name, ok, detail))


def main():
    # 1) Login
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": MAMAN_EMAIL, "password": MAMAN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        record("login maman", False, f"status={r.status_code} body={r.text[:200]}")
        return
    token = r.json().get("token")
    record("login maman", bool(token), f"token_len={len(token) if token else 0}")
    H = {"Authorization": f"Bearer {token}"}

    # 2) Get a pro_id
    r = requests.get(f"{BASE}/professionnels", headers=H, timeout=30)
    pros = r.json() if r.status_code == 200 else []
    if not pros:
        record("GET /professionnels", False, f"status={r.status_code} no pros")
        return
    pro_id = pros[0]["id"]
    record(
        "GET /professionnels",
        True,
        f"count={len(pros)} pro_id={pro_id} name={pros[0].get('name')}",
    )

    # 3) POST /rdv with type_consultation=prenatale
    body1 = {
        "pro_id": pro_id,
        "date": "2026-05-15T10:30",
        "motif": "test consultation",
        "type_consultation": "prenatale",
    }
    r = requests.post(f"{BASE}/rdv", headers=H, json=body1, timeout=30)
    ok = r.status_code == 200
    doc1 = r.json() if ok else {}
    type_returned = doc1.get("type_consultation") if ok else None
    record(
        "POST /rdv WITH type_consultation=prenatale",
        ok and type_returned == "prenatale",
        f"status={r.status_code} type_consultation={type_returned} id={doc1.get('id')}",
    )
    rdv1_id = doc1.get("id")

    # 4) POST /rdv WITHOUT type_consultation (backward compat)
    body2 = {
        "pro_id": pro_id,
        "date": "2026-05-16T11:00",
        "motif": "rdv sans type consultation",
    }
    r = requests.post(f"{BASE}/rdv", headers=H, json=body2, timeout=30)
    ok = r.status_code == 200
    doc2 = r.json() if ok else {}
    record(
        "POST /rdv WITHOUT type_consultation (backward compat)",
        ok,
        f"status={r.status_code} type_consultation={doc2.get('type_consultation')} id={doc2.get('id')}",
    )

    # 5) GET /rdv — verify new RDV contains type_consultation field
    r = requests.get(f"{BASE}/rdv", headers=H, timeout=30)
    ok = r.status_code == 200
    items = r.json() if ok else []
    created = next((i for i in items if i.get("id") == rdv1_id), None)
    has_type_key = (created is not None) and ("type_consultation" in created)
    type_val_ok = bool(created) and created.get("type_consultation") == "prenatale"
    record(
        "GET /rdv includes type_consultation on created doc",
        ok and has_type_key and type_val_ok,
        f"status={r.status_code} found={bool(created)} has_key={has_type_key} value={created.get('type_consultation') if created else None}",
    )

    # Regression: GET /grossesse, /enfants, /reminders
    for ep in ("/grossesse", "/enfants", "/reminders"):
        r = requests.get(f"{BASE}{ep}", headers=H, timeout=30)
        ok = r.status_code == 200
        record(
            f"GET {ep}",
            ok,
            f"status={r.status_code} body_preview={str(r.json())[:120] if ok else r.text[:120]}",
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Exception: {e}")
        sys.exit(1)
    failed = [r for r in results if not r[1]]
    print("\n==== SUMMARY ====")
    print(f"Total: {len(results)}  Passed: {len(results) - len(failed)}  Failed: {len(failed)}")
    for name, ok, detail in results:
        print(f"  {'OK' if ok else 'KO'}  {name} :: {detail}")
    sys.exit(0 if not failed else 1)
