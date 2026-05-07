"""Phase 2 — Test Carnet Export (PDF + FHIR JSON)
Endpoints under test:
  - GET /api/enfants/{enfant_id}/carnet/export/pdf
  - GET /api/enfants/{enfant_id}/carnet/export/fhir
Validates: status, content-type, content-disposition, PDF magic header, size,
RBAC (cross-maman 403, pro w/o RDV 403, pro w/ RDV 200), FHIR Bundle
type=document, audit log entry export Carnet.pdf.
"""

import sys
import random
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN = ("maman.test@alomaman.dev", "Test1234!")
PRO = ("pro.test@alomaman.dev", "Test1234!")
CHILD_ID = "e41c8152-305e-4014-a4f8-4459d955a6cf"

results = []

def log(name, ok, detail=""):
    results.append((name, ok, detail))
    sym = "✅" if ok else "❌"
    print(f"{sym} {name}  {detail}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    r.raise_for_status()
    body = r.json()
    return body["token"], body["user"]


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def main():
    # 1. Login
    t_maman, u_maman = login(*MAMAN)
    t_pro, u_pro = login(*PRO)
    log("Login MAMAN", True, f"id={u_maman['id']}")
    log("Login PRO", True, f"id={u_pro['id']}")

    # =================================================================
    # 2. Maman → PDF export 200
    # =================================================================
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/export/pdf", headers=auth(t_maman), timeout=60)
    log("PDF Maman → HTTP 200", r.status_code == 200, f"status={r.status_code}")
    ct = r.headers.get("Content-Type", "")
    log("PDF Maman → Content-Type=application/pdf", ct.startswith("application/pdf"), f"ct={ct}")
    cd = r.headers.get("Content-Disposition", "")
    log(
        "PDF Maman → Content-Disposition attachment+filename carnet_*.pdf",
        "attachment" in cd and "filename=carnet_" in cd and cd.endswith(".pdf"),
        f"cd={cd}",
    )
    body = r.content
    log("PDF Maman → starts with %PDF-", body[:5] == b"%PDF-", f"head={body[:8]!r}")
    log("PDF Maman → size > 1KB", len(body) > 1024, f"size={len(body)}")

    # =================================================================
    # 3. Cross-maman → 403
    # =================================================================
    # Register a fresh maman if not already there (use unique phone+email per run)
    suffix = random.randint(1000, 9999)
    other_email = f"carnet.export.other{suffix}@alomaman.dev"
    other_pass = "Test1234!"
    other_phone = f"+2250703{suffix:04d}"
    rr = requests.post(
        f"{BASE}/auth/register",
        json={
            "email": other_email,
            "password": other_pass,
            "name": "Awa Otra",
            "role": "maman",
            "phone": other_phone,
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        },
        timeout=30,
    )
    if rr.status_code == 200:
        t_other = rr.json()["token"]
    else:
        print(f"  (register other-maman status={rr.status_code} body={rr.text[:200]})")
        # already existed
        t_other, _ = login(other_email, other_pass)
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/export/pdf", headers=auth(t_other), timeout=30)
    log("PDF Other-Maman → 403", r.status_code == 403, f"status={r.status_code} body={r.text[:120]}")

    # =================================================================
    # 4. PRO without RDV - we need a pro account that has NO rdv with maman
    # The known pro pro.test has a confirmed RDV per test_result.md → should be 200
    # Create a NEW pro to test "no RDV"
    new_pro_email = f"carnet.export.newpro{suffix}@alomaman.dev"
    new_pro_pass = "Test1234!"
    new_pro_phone = f"+2250704{suffix:04d}"
    rr = requests.post(
        f"{BASE}/auth/register",
        json={
            "email": new_pro_email,
            "password": new_pro_pass,
            "name": "Dr Sans RDV",
            "role": "professionnel",
            "phone": new_pro_phone,
            "specialite": "généraliste",
            "accepte_cgu": True,
            "accepte_politique_confidentialite": True,
            "accepte_donnees_sante": True,
        },
        timeout=30,
    )
    if rr.status_code == 200:
        t_new_pro = rr.json()["token"]
    else:
        t_new_pro, _ = login(new_pro_email, new_pro_pass)
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/export/pdf", headers=auth(t_new_pro), timeout=30)
    log("PDF Pro-no-RDV → 403", r.status_code == 403, f"status={r.status_code} body={r.text[:120]}")

    # 5. Pro WITH RDV (pro.test has a RDV with maman.test per existing tests)
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/export/pdf", headers=auth(t_pro), timeout=60)
    log("PDF Pro-with-RDV → HTTP 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        log("PDF Pro-with-RDV → application/pdf", r.headers.get("Content-Type", "").startswith("application/pdf"))
        log("PDF Pro-with-RDV → starts %PDF-", r.content[:5] == b"%PDF-")

    # =================================================================
    # 6. FHIR JSON export (Maman) → 200, Bundle type=document
    # =================================================================
    r = requests.get(f"{BASE}/enfants/{CHILD_ID}/carnet/export/fhir", headers=auth(t_maman), timeout=30)
    log("FHIR Maman → HTTP 200", r.status_code == 200, f"status={r.status_code}")
    ct = r.headers.get("Content-Type", "")
    log("FHIR Maman → Content-Type JSON", "application/json" in ct, f"ct={ct}")
    try:
        bundle = r.json()
    except Exception as exc:
        log("FHIR Maman → JSON parse", False, f"err={exc}")
        bundle = {}
    log("FHIR Maman → resourceType=Bundle", bundle.get("resourceType") == "Bundle", f"resourceType={bundle.get('resourceType')}")
    log("FHIR Maman → bundle.type=document", bundle.get("type") == "document", f"type={bundle.get('type')}")
    entries = bundle.get("entry") or []
    log("FHIR Maman → entries non-empty", len(entries) >= 1, f"len={len(entries)}")

    # Compare structure with /fhir/everything/{enfant_id}
    r2 = requests.get(f"{BASE}/fhir/everything/{CHILD_ID}", headers=auth(t_maman), timeout=30)
    if r2.status_code == 200:
        b2 = r2.json()
        same_type = b2.get("resourceType") == bundle.get("resourceType") and b2.get("type") == bundle.get("type")
        same_count = len(b2.get("entry") or []) == len(entries)
        log("FHIR == /fhir/everything (resourceType+type)", same_type, f"this={bundle.get('type')} vs that={b2.get('type')}")
        log("FHIR == /fhir/everything (entry count)", same_count, f"this={len(entries)} that={len(b2.get('entry') or [])}")

    # =================================================================
    # 7. Audit log shows export Carnet.pdf
    # =================================================================
    r = requests.get(f"{BASE}/audit-log/me?limit=200", headers=auth(t_maman), timeout=30)
    log("Audit log /me → 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        events = r.json().get("events") or []
        match = [
            e for e in events
            if e.get("action") == "export"
            and e.get("resource_type") == "Carnet.pdf"
            and e.get("resource_id") == CHILD_ID
        ]
        log("Audit log has export Carnet.pdf event", len(match) >= 1, f"matches={len(match)} total_events={len(events)}")
        # The maman's audit log contains events on HER resources (so includes PRO accesses too).
        # Verify at least one event was triggered BY the maman herself.
        own = [e for e in match if e.get("user_id") == u_maman["id"]]
        log("Audit log has export by maman herself", len(own) >= 1, f"by_maman={len(own)}")

    # Summary
    print("\n=== SUMMARY ===")
    ok = sum(1 for _, p, _ in results if p)
    fail = [n for n, p, _ in results if not p]
    print(f"PASS: {ok}/{len(results)}")
    if fail:
        print("FAILED:")
        for n in fail:
            print(f"  - {n}")
        sys.exit(1)


if __name__ == "__main__":
    main()
