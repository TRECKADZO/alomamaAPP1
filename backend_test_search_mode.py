"""
Test du filtre `mode` sur GET /api/search/pros.
Review request: vérifier modes_supportes, is_premium, pro_certifie + filtres mode.
"""
import os
import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN = ("maman.test@alomaman.dev", "Test1234!")
PRO = ("pro.test@alomaman.dev", "Test1234!")
CENTRE = ("centre.test@alomaman.dev", "Test1234!")
ADMIN = ("klenakan.eric@gmail.com", "474Treckadzo$1986")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def headers(token):
    return {"Authorization": f"Bearer {token}"}


passed = 0
failed = 0
issues = []


def check(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        issues.append(label)
        print(f"  ✗ {label}")


def main():
    print("=" * 70)
    print("TEST: Filtre mode sur GET /api/search/pros")
    print("=" * 70)

    # Login MAMAN
    print("\n[Setup] Login MAMAN")
    tok = login(*MAMAN)
    h = headers(tok)
    print(f"  ✓ token obtenu")

    # =====================================================
    # 1. Sans filtre mode
    # =====================================================
    print("\n[1] GET /search/pros sans filtre mode")
    r = requests.get(f"{BASE}/search/pros", headers=h, timeout=30)
    check(r.status_code == 200, f"1.1 Status 200 (got {r.status_code})")
    pros = r.json() if r.status_code == 200 else []
    check(isinstance(pros, list), "1.2 Réponse est une liste")
    check(len(pros) > 0, f"1.3 Liste non vide ({len(pros)} pros)")

    if pros:
        all_have_is_premium = all(isinstance(p.get("is_premium"), bool) for p in pros)
        check(all_have_is_premium, "1.4 Chaque pro a is_premium: bool")

        all_have_certifie = all(isinstance(p.get("pro_certifie"), bool) for p in pros)
        check(all_have_certifie, "1.5 Chaque pro a pro_certifie: bool")

        all_have_modes = all(
            isinstance(p.get("modes_supportes"), list) and
            all(isinstance(m, str) for m in p.get("modes_supportes", []))
            for p in pros
        )
        check(all_have_modes, "1.6 Chaque pro a modes_supportes: array of strings")

        all_have_presentiel = all("presentiel" in (p.get("modes_supportes") or []) for p in pros)
        check(all_have_presentiel, "1.7 Tous les pros incluent 'presentiel' dans modes_supportes")

        # Sample log
        sample = pros[0]
        print(f"     Sample: name={sample.get('name')!r}, is_premium={sample.get('is_premium')}, "
              f"pro_certifie={sample.get('pro_certifie')}, modes_supportes={sample.get('modes_supportes')}")

    # =====================================================
    # 2. mode=presentiel
    # =====================================================
    print("\n[2] GET /search/pros?mode=presentiel")
    r = requests.get(f"{BASE}/search/pros", params={"mode": "presentiel"}, headers=h, timeout=30)
    check(r.status_code == 200, f"2.1 Status 200 (got {r.status_code})")
    pros2 = r.json() if r.status_code == 200 else []
    check(isinstance(pros2, list), "2.2 Réponse liste")
    check(len(pros2) > 0, f"2.3 Liste non vide ({len(pros2)} pros)")
    if pros2:
        all_pres = all("presentiel" in (p.get("modes_supportes") or []) for p in pros2)
        check(all_pres, "2.4 Tous ont 'presentiel' dans modes_supportes")

    # =====================================================
    # 3. mode=teleconsultation
    # =====================================================
    print("\n[3] GET /search/pros?mode=teleconsultation")
    r = requests.get(f"{BASE}/search/pros", params={"mode": "teleconsultation"}, headers=h, timeout=30)
    check(r.status_code == 200, f"3.1 Status 200 (got {r.status_code})")
    pros3 = r.json() if r.status_code == 200 else []
    check(isinstance(pros3, list), "3.2 Réponse liste")
    print(f"     {len(pros3)} pros retournés en mode teleconsultation")
    if pros3:
        all_tele_ok = all(p.get("accepte_teleconsultation") is not False for p in pros3)
        check(all_tele_ok, "3.3 Tous ont accepte_teleconsultation != false")

        all_tele_in_modes = all("teleconsultation" in (p.get("modes_supportes") or []) for p in pros3)
        check(all_tele_in_modes, "3.4 Tous ont 'teleconsultation' dans modes_supportes")

    # =====================================================
    # 4. mode=domicile
    # =====================================================
    print("\n[4] GET /search/pros?mode=domicile")
    r = requests.get(f"{BASE}/search/pros", params={"mode": "domicile"}, headers=h, timeout=30)
    check(r.status_code == 200, f"4.1 Status 200 (got {r.status_code})")
    pros4 = r.json() if r.status_code == 200 else []
    check(isinstance(pros4, list), "4.2 Réponse liste (vide acceptée)")
    print(f"     {len(pros4)} pros retournés en mode domicile")
    if pros4:
        all_dom_cond = all(
            (p.get("accepte_domicile") is True) or (p.get("frais_deplacement_fcfa") is not None)
            for p in pros4
        )
        check(all_dom_cond, "4.3 Tous ont accepte_domicile=True OU frais_deplacement_fcfa configuré")

        all_dom_in_modes = all("domicile" in (p.get("modes_supportes") or []) for p in pros4)
        check(all_dom_in_modes, "4.4 Tous ont 'domicile' dans modes_supportes")
    else:
        check(True, "4.3 Liste vide (pas d'erreur) — acceptable")

    # =====================================================
    # 5. Combinaisons
    # =====================================================
    print("\n[5] Combinaisons de filtres")
    r = requests.get(f"{BASE}/search/pros", params={"mode": "domicile", "specialite": "pediatre"}, headers=h, timeout=30)
    check(r.status_code == 200, f"5.1 mode=domicile&specialite=pediatre → 200 (got {r.status_code})")
    body = r.json() if r.status_code == 200 else None
    check(isinstance(body, list), "5.2 Réponse est une liste")
    if isinstance(body, list):
        print(f"     {len(body)} pros retournés (domicile+pediatre)")

    r = requests.get(f"{BASE}/search/pros", params={"mode": "teleconsultation", "cmu_only": "true"}, headers=h, timeout=30)
    check(r.status_code == 200, f"5.3 mode=teleconsultation&cmu_only=true → 200 (got {r.status_code})")
    body2 = r.json() if r.status_code == 200 else None
    check(isinstance(body2, list), "5.4 Réponse est une liste")
    if isinstance(body2, list):
        print(f"     {len(body2)} pros retournés (teleconsultation+cmu_only)")
        if body2:
            all_cmu = all(p.get("accepte_cmu") is True for p in body2)
            check(all_cmu, "5.5 Tous ont accepte_cmu=true")
            all_tele = all(p.get("accepte_teleconsultation") is not False for p in body2)
            check(all_tele, "5.6 Tous ont accepte_teleconsultation != false")

    # =====================================================
    # 6. Régression
    # =====================================================
    print("\n[6] Régression")
    for label, creds in [("MAMAN", MAMAN), ("PRO", PRO), ("CENTRE", CENTRE), ("ADMIN", ADMIN)]:
        try:
            r = requests.post(f"{BASE}/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=30)
            check(r.status_code == 200, f"6.{label}.login → 200 (got {r.status_code})")
        except Exception as e:
            check(False, f"6.{label}.login exception: {e}")

    r = requests.get(f"{BASE}/search/pros", params={"cmu_only": "true"}, headers=h, timeout=30)
    check(r.status_code == 200, f"6.cmu_only sans mode → 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()
        check(isinstance(body, list), "6.cmu_only réponse liste")
        if isinstance(body, list):
            print(f"     {len(body)} pros retournés (cmu_only sans mode)")

    # =====================================================
    # SUMMARY
    # =====================================================
    print("\n" + "=" * 70)
    total = passed + failed
    print(f"SCORE: {passed}/{total} ({100 * passed / total:.0f}%)")
    if failed > 0:
        print(f"FAILED ({failed}):")
        for i in issues:
            print(f"  - {i}")
    print("=" * 70)
    return failed == 0


if __name__ == "__main__":
    ok = main()
    raise SystemExit(0 if ok else 1)
