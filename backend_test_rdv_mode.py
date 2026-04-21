"""Quick regression: RdvIn.mode field (presentiel | teleconsultation)."""
import requests
import sys

BASE = "https://health-prestation.preview.emergentagent.com/api"

def main():
    results = []
    def ok(label, cond, detail=""):
        mark = "PASS" if cond else "FAIL"
        results.append((mark, label, detail))
        print(f"[{mark}] {label} {detail}")

    # 1. Login
    r = requests.post(f"{BASE}/auth/login", json={"email": "maman@test.com", "password": "Maman123!"})
    ok("Login maman@test.com", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print(r.text)
        return 1
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}

    # Get a pro
    r = requests.get(f"{BASE}/professionnels", headers=H)
    ok("GET /professionnels", r.status_code == 200 and len(r.json()) > 0)
    pros = r.json()
    pro_id = pros[0]["id"]

    # 2. POST /rdv mode=teleconsultation
    r = requests.post(f"{BASE}/rdv", headers=H, json={
        "pro_id": pro_id,
        "date": "2026-06-10T11:00",
        "motif": "Test mode teleconsultation",
        "type_consultation": "prenatale",
        "mode": "teleconsultation",
    })
    ok("POST /rdv mode=teleconsultation → 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        ok("  returned mode='teleconsultation'", body.get("mode") == "teleconsultation", f"got mode={body.get('mode')}")
        rdv1_id = body.get("id")
    else:
        rdv1_id = None

    # 3. POST /rdv mode=presentiel
    r = requests.post(f"{BASE}/rdv", headers=H, json={
        "pro_id": pro_id,
        "date": "2026-06-11T11:00",
        "motif": "Test mode presentiel",
        "mode": "presentiel",
    })
    ok("POST /rdv mode=presentiel → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        ok("  returned mode='presentiel'", body.get("mode") == "presentiel", f"got mode={body.get('mode')}")
        rdv2_id = body.get("id")
    else:
        rdv2_id = None

    # 4. POST /rdv WITHOUT mode → default presentiel
    r = requests.post(f"{BASE}/rdv", headers=H, json={
        "pro_id": pro_id,
        "date": "2026-06-12T11:00",
        "motif": "Test default mode",
    })
    ok("POST /rdv no mode → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        ok("  default mode='presentiel'", body.get("mode") == "presentiel", f"got mode={body.get('mode')}")
        rdv3_id = body.get("id")
    else:
        rdv3_id = None

    # 5. GET /rdv → verify all rdvs have 'mode'
    r = requests.get(f"{BASE}/rdv", headers=H)
    ok("GET /rdv → 200", r.status_code == 200)
    rdvs = r.json()
    created_ids = {i for i in [rdv1_id, rdv2_id, rdv3_id] if i}
    found = {rd["id"]: rd for rd in rdvs if rd["id"] in created_ids}
    ok("  All 3 created RDVs present in GET /rdv", len(found) == len(created_ids),
       f"created={len(created_ids)} found={len(found)}")
    for rid, rd in found.items():
        ok(f"  RDV {rid[:8]} has 'mode' field", "mode" in rd, f"mode={rd.get('mode')}")
    if rdv1_id and rdv1_id in found:
        ok("  rdv1 mode=teleconsultation persisted", found[rdv1_id].get("mode") == "teleconsultation",
           f"got {found[rdv1_id].get('mode')}")
    if rdv2_id and rdv2_id in found:
        ok("  rdv2 mode=presentiel persisted", found[rdv2_id].get("mode") == "presentiel",
           f"got {found[rdv2_id].get('mode')}")
    if rdv3_id and rdv3_id in found:
        ok("  rdv3 default mode=presentiel persisted", found[rdv3_id].get("mode") == "presentiel",
           f"got {found[rdv3_id].get('mode')}")

    fails = [r for r in results if r[0] == "FAIL"]
    print("\n==========================")
    print(f"TOTAL: {len(results)} | PASS: {len(results)-len(fails)} | FAIL: {len(fails)}")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
