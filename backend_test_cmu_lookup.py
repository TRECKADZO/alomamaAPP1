"""
Retest Test 7 — CMU encrypted lookup via /api/pro/patient/recherche
Verifies O(1) hash lookup fix + /api/auth/me/code-partage returns clear CMU.
"""
import requests, secrets, sys, json, time

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

def _p(label, ok, body=None, status=None):
    mark = "✅" if ok else "❌"
    if status is not None:
        print(f"{mark} {label} [HTTP {status}]")
    else:
        print(f"{mark} {label}")
    if body is not None and (not ok or isinstance(body, dict)):
        try:
            print("   ↳", json.dumps(body, ensure_ascii=False)[:500])
        except Exception:
            print("   ↳", str(body)[:500])

def main():
    rnd = secrets.token_hex(3)
    maman_phone = f"+225070{secrets.randbelow(10**7):07d}"
    pro_phone   = f"+225050{secrets.randbelow(10**7):07d}"
    maman_email = f"cmu_maman_{rnd}@test.alomaman.com"
    pro_email   = f"cmu_pro_{rnd}@test.alomaman.com"
    password    = "TestCMU!2026"
    cmu_numero  = "225000000001"  # 12 digits
    maman_name  = "Adjoa Yao"
    pro_name    = "Dr Kouakou Konan"

    # 1) Register Maman
    r = requests.post(f"{BASE}/auth/register", json={
        "email": maman_email, "phone": maman_phone, "password": password,
        "name": maman_name, "role": "maman",
        "accepte_cgu": True, "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True, "accepte_communications": False,
    }, timeout=30)
    ok1 = r.status_code == 200 and "token" in r.json()
    _p("1) Register maman", ok1, r.json() if r.status_code != 200 else {"id": r.json().get("user", {}).get("id")}, r.status_code)
    if not ok1:
        return 1
    maman_token = r.json()["token"]
    maman_id = r.json()["user"]["id"]
    maman_h = {"Authorization": f"Bearer {maman_token}"}

    # 2) Set CMU
    r = requests.post(f"{BASE}/cmu/me", json={
        "numero": cmu_numero,
        "nom_complet": maman_name,
        "date_validite": "2099-01-15",
        "beneficiaires": [],
    }, headers=maman_h, timeout=30)
    ok2 = r.status_code == 200 and r.json().get("statut") == "actif" and r.json().get("cmu", {}).get("numero") == cmu_numero
    _p("2) POST /cmu/me", ok2, r.json(), r.status_code)
    if not ok2:
        return cleanup_fail(maman_h, None)

    # 2b) GET /cmu/me → clair
    r = requests.get(f"{BASE}/cmu/me", headers=maman_h, timeout=30)
    ok2b = r.status_code == 200 and r.json().get("cmu", {}).get("numero") == cmu_numero
    _p("2b) GET /cmu/me returns clear numero", ok2b, r.json(), r.status_code)

    # 2c) GET /auth/me/code-partage → CMU en clair (pas enc_v1:)
    r = requests.get(f"{BASE}/auth/me/code-partage", headers=maman_h, timeout=30)
    body = r.json() if r.status_code == 200 else {}
    cmu_val = body.get("cmu")
    ok2c = (
        r.status_code == 200
        and cmu_val == cmu_numero
        and not (isinstance(cmu_val, str) and cmu_val.startswith("enc_v1:"))
        and body.get("preferred") == cmu_numero
    )
    _p("2c) GET /auth/me/code-partage returns CLEAR CMU (no enc_v1: prefix)", ok2c, body, r.status_code)

    # 3) Register Pro
    r = requests.post(f"{BASE}/auth/register", json={
        "email": pro_email, "phone": pro_phone, "password": password,
        "name": pro_name, "role": "professionnel",
        "specialite": "gynecologie",
        "accepte_cgu": True, "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True, "accepte_communications": False,
    }, timeout=30)
    ok3 = r.status_code == 200 and "token" in r.json()
    _p("3) Register pro", ok3, {"id": r.json().get("user", {}).get("id")} if r.status_code == 200 else r.json(), r.status_code)
    if not ok3:
        return cleanup_fail(maman_h, None)
    pro_token = r.json()["token"]
    pro_id = r.json()["user"]["id"]
    pro_h = {"Authorization": f"Bearer {pro_token}"}

    # 4) POST /pro/patient/recherche with the CMU
    r = requests.post(f"{BASE}/pro/patient/recherche",
                      json={"identifier": cmu_numero, "motif": "Test CMU lookup"},
                      headers=pro_h, timeout=30)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    ok4 = (
        r.status_code == 200
        and body.get("patient_type") == "maman"
        and body.get("patient_nom") == maman_name
        and isinstance(body.get("demande_id"), str) and len(body["demande_id"]) > 0
    )
    _p("4) POST /pro/patient/recherche with clean CMU → patient_type=maman", ok4, body, r.status_code)

    # 5) Edge case: CMU with spaces
    spaced = "225 000 000 001"
    r = requests.post(f"{BASE}/pro/patient/recherche",
                      json={"identifier": spaced, "motif": "Test CMU avec espaces"},
                      headers=pro_h, timeout=30)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    ok5 = (
        r.status_code == 200
        and body.get("patient_type") == "maman"
        and body.get("patient_nom") == maman_name
    )
    _p("5) POST /pro/patient/recherche with '225 000 000 001' (spaces normalized)", ok5, body, r.status_code)

    # 6) Edge case: wrong CMU → 404
    r = requests.post(f"{BASE}/pro/patient/recherche",
                      json={"identifier": "999999999999", "motif": "Test CMU invalide"},
                      headers=pro_h, timeout=30)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
    ok6 = r.status_code == 404
    _p("6) POST /pro/patient/recherche with '999999999999' → 404", ok6, body, r.status_code)

    # Cleanup
    del_payload = {"password": password, "confirmation": "SUPPRIMER"}
    rd1 = requests.delete(f"{BASE}/auth/me", json=del_payload, headers=maman_h, timeout=30)
    rd2 = requests.delete(f"{BASE}/auth/me", json=del_payload, headers=pro_h, timeout=30)
    _p("7) Cleanup maman DELETE /auth/me", rd1.status_code == 200, rd1.json() if rd1.status_code != 200 else None, rd1.status_code)
    _p("7) Cleanup pro DELETE /auth/me", rd2.status_code == 200, rd2.json() if rd2.status_code != 200 else None, rd2.status_code)

    results = [ok1, ok2, ok2b, ok2c, ok3, ok4, ok5, ok6]
    print(f"\nTOTAL: {sum(results)}/{len(results)} PASS")
    return 0 if all(results) else 2

def cleanup_fail(maman_h, pro_h):
    try:
        if maman_h: requests.delete(f"{BASE}/auth/me", json={"password":"TestCMU!2026","confirmation":"SUPPRIMER"}, headers=maman_h, timeout=15)
        if pro_h: requests.delete(f"{BASE}/auth/me", json={"password":"TestCMU!2026","confirmation":"SUPPRIMER"}, headers=pro_h, timeout=15)
    except Exception:
        pass
    return 1

if __name__ == "__main__":
    sys.exit(main())
