"""
Phase 3 — Granular Consent endpoints test
Endpoints under test:
  POST   /api/consents
  GET    /api/consents/me
  PATCH  /api/consents/{cid}
  POST   /api/consents/{cid}/revoke
  DELETE /api/consents/{cid}
Plus regression on GET /api/fhir/Patient/{maman_id} and GET /api/audit-log/me.
"""
import os
import sys
import json
from datetime import datetime, timezone, timedelta
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PWD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PWD = "Test1234!"

EXPECTED_CATEGORIES = {
    "patient_info", "vaccins", "croissance", "echos", "consultation_notes",
    "dmp", "birth_declaration", "allergies", "messages", "rdv",
}

results = []
def rec(name, ok, detail=""):
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name} :: {detail}")
    results.append((ok, name, detail))


def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    r.raise_for_status()
    return r.json()


def H(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print("=" * 70)
    print("AUTH")
    print("=" * 70)
    maman = login(MAMAN_EMAIL, MAMAN_PWD)
    pro = login(PRO_EMAIL, PRO_PWD)
    maman_token = maman["token"]; maman_id = maman["user"]["id"]
    pro_token = pro["token"]; pro_id = pro["user"]["id"]
    rec("login MAMAN", True, f"id={maman_id}")
    rec("login PRO", True, f"id={pro_id}")

    # Cleanup any pre-existing consents from previous runs (delete all of maman's consents)
    pre = requests.get(f"{BASE}/consents/me", headers=H(maman_token), timeout=20)
    if pre.status_code == 200:
        for c in pre.json().get("consents", []):
            requests.delete(f"{BASE}/consents/{c['id']}", headers=H(maman_token), timeout=20)

    expires_iso = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    print("=" * 70)
    print("1) POST /consents (CREATE)")
    print("=" * 70)

    # 1a) PRO trying to create → 403
    r = requests.post(f"{BASE}/consents", headers=H(pro_token),
                      json={"pro_id": pro_id, "categories": ["vaccins"], "expires_at": expires_iso},
                      timeout=20)
    rec("1a PRO POST /consents → 403", r.status_code == 403, f"http={r.status_code} body={r.text[:120]}")

    # 1b) Invalid category
    r = requests.post(f"{BASE}/consents", headers=H(maman_token),
                      json={"pro_id": pro_id, "categories": ["vaccins", "INVALID_X"], "expires_at": expires_iso},
                      timeout=20)
    rec("1b invalid category → 400", r.status_code == 400, f"http={r.status_code} body={r.text[:160]}")

    # 1c) pro_id inexistant → 404
    r = requests.post(f"{BASE}/consents", headers=H(maman_token),
                      json={"pro_id": "non-existent-pro-id-xxxx", "categories": ["vaccins"], "expires_at": expires_iso},
                      timeout=20)
    rec("1c pro_id inexistant → 404", r.status_code == 404, f"http={r.status_code} body={r.text[:120]}")

    # 1d) MAMAN crée un consent valide
    payload = {
        "pro_id": pro_id,
        "categories": ["vaccins", "croissance"],
        "expires_at": expires_iso,
        "notes": "Pédiatre de confiance",
    }
    r = requests.post(f"{BASE}/consents", headers=H(maman_token), json=payload, timeout=20)
    rec("1d MAMAN POST /consents → 200", r.status_code == 200, f"http={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        print("ABORT: cannot continue without consent")
        return _summary()
    doc = r.json()
    cid = doc.get("id")
    rec("1d.id present", bool(cid), f"id={cid}")
    rec("1d.status=active", doc.get("status") == "active", f"status={doc.get('status')}")
    rec("1d.maman_id matches", doc.get("maman_id") == maman_id, f"maman_id={doc.get('maman_id')}")
    rec("1d.pro_id matches", doc.get("pro_id") == pro_id, f"pro_id={doc.get('pro_id')}")
    rec("1d.categories", set(doc.get("categories", [])) == {"vaccins", "croissance"},
        f"categories={doc.get('categories')}")
    rec("1d.pro_name present", bool(doc.get("pro_name")), f"pro_name={doc.get('pro_name')}")
    rec("1d.pro_specialite present", bool(doc.get("pro_specialite")),
        f"pro_specialite={doc.get('pro_specialite')}")

    # 1e) Verify notification of type 'consent_granted' for pro
    r = requests.get(f"{BASE}/notifications", headers=H(pro_token), timeout=20)
    notifs = r.json() if r.status_code == 200 else []
    if isinstance(notifs, dict):
        notifs = notifs.get("notifications", [])
    granted = [n for n in notifs if n.get("type") == "consent_granted"
               and (n.get("data") or {}).get("consent_id") == cid]
    rec("1e notification type=consent_granted created for pro",
        len(granted) >= 1, f"found={len(granted)} (total notifs={len(notifs)})")

    print("=" * 70)
    print("2) GET /consents/me")
    print("=" * 70)

    r = requests.get(f"{BASE}/consents/me", headers=H(maman_token), timeout=20)
    rec("2a GET /consents/me as MAMAN → 200", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        rec("2a.total>=1", body.get("total", 0) >= 1, f"total={body.get('total')}")
        rec("2a.available_categories=10",
            isinstance(body.get("available_categories"), list)
            and set(body["available_categories"]) == EXPECTED_CATEGORIES,
            f"avail={body.get('available_categories')}")
        my_consent = next((c for c in body.get("consents", []) if c.get("id") == cid), None)
        rec("2a.consent in list", my_consent is not None, f"found={bool(my_consent)}")
        if my_consent:
            for f in ["pro_name", "pro_specialite", "status", "categories",
                      "maman_id", "pro_id", "created_at"]:
                rec(f"2a.consent has '{f}'", f in my_consent and my_consent.get(f) is not None,
                    f"value={my_consent.get(f)}")

    r = requests.get(f"{BASE}/consents/me", headers=H(pro_token), timeout=20)
    rec("2b GET /consents/me as PRO → 200", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        rec("2b.consent received by PRO",
            any(c.get("id") == cid for c in body.get("consents", [])),
            f"total={body.get('total')}")

    print("=" * 70)
    print("3) PATCH /consents/{cid}")
    print("=" * 70)

    # 3a) update to ['vaccins'] only
    r = requests.patch(f"{BASE}/consents/{cid}", headers=H(maman_token),
                       json={"pro_id": pro_id, "categories": ["vaccins"], "expires_at": expires_iso},
                       timeout=20)
    rec("3a PATCH update categories=['vaccins'] → 200", r.status_code == 200,
        f"http={r.status_code} body={r.text[:160]}")

    # GET to verify
    r = requests.get(f"{BASE}/consents/me", headers=H(maman_token), timeout=20)
    if r.status_code == 200:
        my = next((c for c in r.json().get("consents", []) if c.get("id") == cid), None)
        rec("3a.GET shows categories=['vaccins']",
            my and my.get("categories") == ["vaccins"], f"categories={my and my.get('categories')}")

    # 3b) PATCH invalid category
    r = requests.patch(f"{BASE}/consents/{cid}", headers=H(maman_token),
                       json={"pro_id": pro_id, "categories": ["INVALID_Z"], "expires_at": expires_iso},
                       timeout=20)
    rec("3b PATCH invalid category → 400", r.status_code == 400,
        f"http={r.status_code} body={r.text[:120]}")

    # 3c) PATCH another maman's consent → 404
    # Create an ad-hoc maman to attempt cross-tenant access
    other_email = f"maman_consents_{int(datetime.now().timestamp())}@test.dev"
    reg = requests.post(f"{BASE}/auth/register", json={
        "email": other_email,
        "password": "Test1234!",
        "name": "Maman OtherConsents",
        "role": "maman",
        "phone": f"+22507{int(datetime.now().timestamp()) % 10000000:07d}",
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
    }, timeout=20)
    other_token = None
    if reg.status_code == 200:
        other_token = reg.json()["token"]
        r = requests.patch(f"{BASE}/consents/{cid}", headers=H(other_token),
                           json={"pro_id": pro_id, "categories": ["vaccins"], "expires_at": expires_iso},
                           timeout=20)
        rec("3c PATCH other maman's consent → 404", r.status_code == 404,
            f"http={r.status_code} body={r.text[:120]}")
    else:
        rec("3c setup other maman", False, f"register failed http={reg.status_code} {reg.text[:160]}")

    print("=" * 70)
    print("4) POST /consents/{cid}/revoke")
    print("=" * 70)

    r = requests.post(f"{BASE}/consents/{cid}/revoke", headers=H(maman_token), timeout=20)
    rec("4a revoke → 200", r.status_code == 200, f"http={r.status_code} body={r.text[:160]}")
    if r.status_code == 200:
        rec("4a.status=revoked", r.json().get("status") == "revoked", f"body={r.json()}")

    # GET again → status='revoked'
    r = requests.get(f"{BASE}/consents/me", headers=H(maman_token), timeout=20)
    if r.status_code == 200:
        my = next((c for c in r.json().get("consents", []) if c.get("id") == cid), None)
        rec("4b.GET shows status='revoked'", my and my.get("status") == "revoked",
            f"status={my and my.get('status')}")
        rec("4b.revoked_at populated", my and my.get("revoked_at") is not None,
            f"revoked_at={my and my.get('revoked_at')}")

    # Notification consent_revoked for pro
    r = requests.get(f"{BASE}/notifications", headers=H(pro_token), timeout=20)
    notifs = r.json() if r.status_code == 200 else []
    if isinstance(notifs, dict):
        notifs = notifs.get("notifications", [])
    revoked = [n for n in notifs if n.get("type") == "consent_revoked"
               and (n.get("data") or {}).get("consent_id") == cid]
    rec("4c notification consent_revoked created for pro",
        len(revoked) >= 1, f"found={len(revoked)}")

    print("=" * 70)
    print("5) Audit log check (write Consent for the maman)")
    print("=" * 70)

    r = requests.get(f"{BASE}/audit-log/me", headers=H(maman_token), timeout=20)
    rec("5a GET /audit-log/me → 200", r.status_code == 200, f"http={r.status_code}")
    if r.status_code == 200:
        events = r.json().get("events", []) if isinstance(r.json(), dict) else r.json()
        consent_writes = [e for e in events
                          if e.get("action") == "write"
                          and e.get("resource_type") == "Consent"
                          and e.get("resource_id") == cid
                          and e.get("user_id") == maman_id]
        rec("5a.audit has write/Consent for cid",
            len(consent_writes) >= 1, f"found={len(consent_writes)}")

    # Create a NEW consent with categories=['vaccins'] — and verify audit log captures it
    payload2 = {"pro_id": pro_id, "categories": ["vaccins"], "expires_at": expires_iso}
    r = requests.post(f"{BASE}/consents", headers=H(maman_token), json=payload2, timeout=20)
    cid2 = None
    if r.status_code == 200:
        cid2 = r.json().get("id")
        rec("5b create new consent → 200", True, f"cid2={cid2}")
        # audit
        r2 = requests.get(f"{BASE}/audit-log/me", headers=H(maman_token), timeout=20)
        if r2.status_code == 200:
            events = r2.json().get("events", []) if isinstance(r2.json(), dict) else r2.json()
            hits = [e for e in events
                    if e.get("action") == "write"
                    and e.get("resource_type") == "Consent"
                    and e.get("resource_id") == cid2
                    and e.get("user_id") == maman_id]
            rec("5b.audit has write/Consent for new cid2",
                len(hits) >= 1, f"found={len(hits)}")
    else:
        rec("5b create new consent", False, f"http={r.status_code} body={r.text[:160]}")

    print("=" * 70)
    print("6) DELETE /consents/{cid}")
    print("=" * 70)

    r = requests.delete(f"{BASE}/consents/{cid}", headers=H(maman_token), timeout=20)
    rec("6a DELETE → 200", r.status_code == 200, f"http={r.status_code}")
    # Verify absent
    r = requests.get(f"{BASE}/consents/me", headers=H(maman_token), timeout=20)
    if r.status_code == 200:
        absent = all(c.get("id") != cid for c in r.json().get("consents", []))
        rec("6b consent absent in GET", absent, f"absent={absent}")

    # Cleanup cid2 if exists
    if cid2:
        requests.delete(f"{BASE}/consents/{cid2}", headers=H(maman_token), timeout=20)

    print("=" * 70)
    print("7) REGRESSION existing endpoints")
    print("=" * 70)

    r = requests.get(f"{BASE}/fhir/Patient/{maman_id}", headers=H(maman_token), timeout=20)
    rec("7a GET /fhir/Patient/{maman_id} as MAMAN → 200", r.status_code == 200,
        f"http={r.status_code} resourceType={r.json().get('resourceType') if r.status_code == 200 else r.text[:120]}")
    if r.status_code == 200:
        rec("7a.resourceType=Patient", r.json().get("resourceType") == "Patient",
            f"rt={r.json().get('resourceType')}")

    r = requests.get(f"{BASE}/audit-log/me", headers=H(maman_token), timeout=20)
    rec("7b GET /audit-log/me → 200", r.status_code == 200, f"http={r.status_code}")

    # Cleanup the ad-hoc other maman if registered
    if other_token:
        try:
            requests.delete(f"{BASE}/auth/me", headers=H(other_token),
                            json={"password": "Test1234!", "confirmation": "SUPPRIMER"}, timeout=20)
        except Exception:
            pass

    return _summary()


def _summary():
    passed = sum(1 for ok, _, _ in results if ok)
    total = len(results)
    print()
    print("=" * 70)
    print(f"SUMMARY: {passed}/{total} PASS")
    print("=" * 70)
    fails = [(n, d) for ok, n, d in results if not ok]
    if fails:
        print("FAILURES:")
        for n, d in fails:
            print(f"  - {n} :: {d}")
    return passed, total


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback; traceback.print_exc()
        sys.exit(1)
