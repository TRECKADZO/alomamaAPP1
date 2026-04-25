"""
Backend tests — endpoints éducatifs / plan-naissance / infolettre
À lo Maman — review du 2026
"""
import os
import sys
import requests
from datetime import datetime, timedelta, timezone

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

CRED_MAMAN = {"email": "maman@test.com", "password": "Maman123!"}
CRED_PRO = {"email": "pro@test.com", "password": "Pro123!"}
CRED_ADMIN = {"email": "klenakan.eric@gmail.com", "password": "474Treckadzo$1986"}

PASS = []
FAIL = []


def log(name, ok, detail=""):
    icon = "[OK]" if ok else "[XX]"
    print(f"{icon} {name}{(' :: ' + detail) if detail else ''}")
    (PASS if ok else FAIL).append(f"{name} :: {detail}")


def hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def login(cred):
    r = requests.post(f"{BASE}/auth/login", json=cred, timeout=30)
    if r.status_code != 200:
        print(f"!!! LOGIN FAIL {cred['email']}: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    return r.json()["token"]


def main():
    print("=" * 80)
    print("Educational endpoints / plan-naissance / infolettre tests")
    print("=" * 80)

    t_maman = login(CRED_MAMAN)
    t_pro = login(CRED_PRO)
    t_admin = login(CRED_ADMIN)
    print(f"Tokens acquired (maman/pro/admin)")

    # ============================
    # 1) GET /foetus/{sa}
    # ============================
    print("\n--- 1) /foetus/{sa} ---")

    r = requests.get(f"{BASE}/foetus/20", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("1a /foetus/20 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        keys = {"sa", "taille", "poids", "fruit", "title", "highlights", "conseil"}
        log("1a keys present", keys.issubset(b.keys()), f"missing={keys - set(b.keys())}")
        log("1a sa==20", b.get("sa") == 20, f"sa={b.get('sa')}")
        log("1a title 'Mi-parcours'", "Mi-parcours" in (b.get("title") or ""),
            f"title={b.get('title')!r}")

    r = requests.get(f"{BASE}/foetus/4", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("1b /foetus/4 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        log("1b sa==4", b.get("sa") == 4, f"sa={b.get('sa')}")
        log("1b title 'Bienvenue'", "Bienvenue" in (b.get("title") or ""),
            f"title={b.get('title')!r}")

    r = requests.get(f"{BASE}/foetus/1", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200 and r.json().get("sa") == 4
    log("1c /foetus/1 clamp→4", ok,
        f"status={r.status_code} sa={r.json().get('sa') if r.ok else None}")

    r = requests.get(f"{BASE}/foetus/50", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200 and r.json().get("sa") == 41
    log("1d /foetus/50 clamp→41", ok,
        f"status={r.status_code} sa={r.json().get('sa') if r.ok else None}")

    # ============================
    # 2) GET /foetus (auto SA)
    # ============================
    print("\n--- 2) /foetus (auto SA) ---")

    # Ensure maman has a grossesse active (date_debut ~14 SA = ~98 days ago)
    target_sa = 14
    date_debut = (datetime.now(timezone.utc) - timedelta(days=target_sa * 7 + 2)).date().isoformat()
    rg = requests.post(f"{BASE}/grossesse", headers=hdr(t_maman),
                       json={"date_debut": date_debut}, timeout=30)
    log("2-setup POST /grossesse", rg.status_code == 200,
        f"status={rg.status_code} date_debut={date_debut}")

    r = requests.get(f"{BASE}/foetus", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("2a maman /foetus 200", ok, f"status={r.status_code} body={r.text[:200]}")
    if ok:
        b = r.json()
        cs = b.get("current_sa")
        log("2a current_sa int 4..41", isinstance(cs, int) and 4 <= cs <= 41,
            f"current_sa={cs}")
        log("2a ddr present", b.get("ddr") is not None, f"ddr={b.get('ddr')}")
        # foetus keys
        for k in ("sa", "taille", "poids", "fruit", "title", "highlights", "conseil"):
            log(f"2a key {k}", k in b, "")

    r = requests.get(f"{BASE}/foetus", headers=hdr(t_admin), timeout=30)
    log("2c admin /foetus 403", r.status_code == 403,
        f"status={r.status_code} body={r.text[:120]}")

    r = requests.get(f"{BASE}/foetus", headers=hdr(t_pro), timeout=30)
    log("2d pro /foetus 403", r.status_code == 403,
        f"status={r.status_code} body={r.text[:120]}")

    # ============================
    # 3) /diversification + /diversification/{age_mois}
    # ============================
    print("\n--- 3) /diversification ---")

    r = requests.get(f"{BASE}/diversification", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("3a /diversification 200", ok, f"status={r.status_code}")
    if ok:
        et = r.json().get("etapes", [])
        log("3a etapes len==5", len(et) == 5, f"len={len(et)}")
        log("3a etape[0]=='6 mois'", et and et[0].get("etape") == "6 mois",
            f"first={et[0].get('etape') if et else None}")
        log("3a etape[-1]=='18-24 mois'", et and et[-1].get("etape") == "18-24 mois",
            f"last={et[-1].get('etape') if et else None}")

    r = requests.get(f"{BASE}/diversification/8", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("3b /diversification/8 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        log("3b title 'Plus de saveurs'", "Plus de saveurs" in (b.get("title") or ""),
            f"title={b.get('title')!r}")
        log("3b age_min==7", b.get("age_min") == 7, f"age_min={b.get('age_min')}")
        log("3b age_max==8", b.get("age_max") == 8, f"age_max={b.get('age_max')}")

    r = requests.get(f"{BASE}/diversification/20", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("3c /diversification/20 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        title = b.get("title") or ""
        log("3c title 'gourmet'", "gourmet" in title.lower(), f"title={title!r}")

    r = requests.get(f"{BASE}/diversification/3", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 404
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        pass
    log("3d /diversification/3 404", ok, f"status={r.status_code} detail={detail!r}")
    log("3d detail 'allaitement exclusif'", "allaitement exclusif" in detail.lower(),
        f"detail={detail!r}")

    # ============================
    # 4) /jalons + /jalons/{age} + /enfants/{eid}/jalons
    # ============================
    print("\n--- 4) /jalons ---")

    r = requests.get(f"{BASE}/jalons", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("4a /jalons 200", ok, f"status={r.status_code}")
    if ok:
        jl = r.json().get("jalons", [])
        log("4a jalons len==11", len(jl) == 11, f"len={len(jl)}")
        ages = [j.get("age_mois") for j in jl]
        expected_ages = {2, 4, 6, 9, 12, 18, 24, 36, 48, 60, 72}
        log("4a ages set", set(ages) == expected_ages,
            f"got={sorted(ages)}")

    for ag in (12, 24, 72):
        r = requests.get(f"{BASE}/jalons/{ag}", headers=hdr(t_maman), timeout=30)
        ok = r.status_code == 200
        log(f"4b/c/d /jalons/{ag} 200", ok, f"status={r.status_code}")
        if ok:
            b = r.json()
            log(f"4 age_mois=={ag}", b.get("age_mois") == ag,
                f"age_mois={b.get('age_mois')}")
            log(f"4 title contains '{ag} mois'",
                f"{ag} mois" in (b.get("title") or ""),
                f"title={b.get('title')!r}")

    # 4e: get/create an enfant for maman, age ~13 months
    r = requests.get(f"{BASE}/enfants", headers=hdr(t_maman), timeout=30)
    enfants = r.json() if r.status_code == 200 else []
    print(f"  4e existing enfants count={len(enfants)}")

    # For test 4f we need an enfant aged ~13 months exactly (so jalon=12)
    # We'll create a new test child for 4f and another for 4g
    created_eids = []

    dob_13mo = (datetime.now(timezone.utc) - timedelta(days=13 * 30.4375 + 2)).date().isoformat()
    rc = requests.post(f"{BASE}/enfants", headers=hdr(t_maman),
                       json={"nom": "Test Bilan 13mo", "date_naissance": dob_13mo,
                             "sexe": "F"}, timeout=30)
    if rc.status_code == 200:
        eid_13 = rc.json().get("id")
        created_eids.append(eid_13)
        log("4e POST enfant 13mo", True, f"id={eid_13}")
    else:
        eid_13 = None
        log("4e POST enfant 13mo", False, f"status={rc.status_code} body={rc.text[:200]}")

    if eid_13:
        r = requests.get(f"{BASE}/enfants/{eid_13}/jalons", headers=hdr(t_maman),
                         timeout=30)
        ok = r.status_code == 200
        log("4f /enfants/{eid}/jalons 200", ok,
            f"status={r.status_code} body={r.text[:200]}")
        if ok:
            b = r.json()
            log("4f age_mois≈13", abs((b.get("age_mois") or 0) - 13) <= 1,
                f"age_mois={b.get('age_mois')}")
            log("4f jalon.age_mois==12",
                (b.get("jalon") or {}).get("age_mois") == 12,
                f"jalon.age_mois={(b.get('jalon') or {}).get('age_mois')}")
            log("4f trop_jeune==False", b.get("trop_jeune") is False,
                f"trop_jeune={b.get('trop_jeune')}")

    # 4g: newborn 1 month
    dob_1mo = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    rc = requests.post(f"{BASE}/enfants", headers=hdr(t_maman),
                       json={"nom": "Test Newborn", "date_naissance": dob_1mo,
                             "sexe": "M"}, timeout=30)
    if rc.status_code == 200:
        eid_nb = rc.json().get("id")
        created_eids.append(eid_nb)
        r = requests.get(f"{BASE}/enfants/{eid_nb}/jalons", headers=hdr(t_maman),
                         timeout=30)
        ok = r.status_code == 200
        log("4g newborn jalons 200", ok, f"status={r.status_code}")
        if ok:
            b = r.json()
            log("4g trop_jeune==True", b.get("trop_jeune") is True,
                f"trop_jeune={b.get('trop_jeune')}")
            log("4g jalon.age_mois==2",
                (b.get("jalon") or {}).get("age_mois") == 2,
                f"jalon.age_mois={(b.get('jalon') or {}).get('age_mois')}")
    else:
        log("4g POST enfant newborn", False,
            f"status={rc.status_code} body={rc.text[:200]}")

    # ============================
    # 5) /plan-naissance
    # ============================
    print("\n--- 5) /plan-naissance ---")

    r = requests.get(f"{BASE}/plan-naissance", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("5a GET /plan-naissance 200", ok, f"status={r.status_code}")
    initial_plan = r.json() if ok else {}
    print(f"  initial plan keys: {list(initial_plan.keys())[:6]}...")

    full_payload = {
        "lieu_souhaite": "Clinique Aurore Abidjan",
        "accompagnant": "Mon mari",
        "accompagnant_relation": "conjoint",
        "position_souhaitee": "Allongée sur le côté",
        "anesthesie": "Péridurale si possible",
        "peau_a_peau": True,
        "allaitement": "Allaitement maternel exclusif",
        "coupe_cordon": "Mon conjoint",
        "photos_video": False,
        "notes": "Je préfère un environnement calme",
    }
    r = requests.post(f"{BASE}/plan-naissance", headers=hdr(t_maman),
                      json=full_payload, timeout=30)
    ok = r.status_code == 200
    log("5b POST /plan-naissance 200", ok,
        f"status={r.status_code} body={r.text[:200]}")
    if ok:
        b = r.json()
        for k, v in full_payload.items():
            log(f"5b field {k}", b.get(k) == v, f"got={b.get(k)!r}")
        log("5b id present", bool(b.get("id")), f"id={b.get('id')}")
        log("5b user_id present", bool(b.get("user_id")), "")
        log("5b created_at present", bool(b.get("created_at")), "")
        log("5b updated_at present", bool(b.get("updated_at")), "")
        first_updated_at = b.get("updated_at")

    r = requests.get(f"{BASE}/plan-naissance", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("5c GET /plan-naissance after POST 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        log("5c lieu_souhaite persisted",
            b.get("lieu_souhaite") == "Clinique Aurore Abidjan",
            f"got={b.get('lieu_souhaite')!r}")
        log("5c notes persisted",
            b.get("notes") == "Je préfère un environnement calme",
            f"got={b.get('notes')!r}")

    # 5d: idempotent update
    import time
    time.sleep(1.1)  # ensure updated_at differs
    r = requests.post(f"{BASE}/plan-naissance", headers=hdr(t_maman),
                      json={"lieu_souhaite": "Maternité du CHU"}, timeout=30)
    ok = r.status_code == 200
    log("5d POST update 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        log("5d lieu_souhaite updated",
            b.get("lieu_souhaite") == "Maternité du CHU",
            f"got={b.get('lieu_souhaite')!r}")
        log("5d updated_at changed",
            b.get("updated_at") != first_updated_at,
            f"old={first_updated_at} new={b.get('updated_at')}")
        # other Optional fields → None
        log("5d notes reset (Optional → None)",
            b.get("notes") is None,
            f"notes={b.get('notes')!r}")
        log("5d accompagnant reset",
            b.get("accompagnant") is None,
            f"accompagnant={b.get('accompagnant')!r}")

    # 5e: pro POST → 403
    r = requests.post(f"{BASE}/plan-naissance", headers=hdr(t_pro),
                      json={"lieu_souhaite": "X"}, timeout=30)
    log("5e pro POST 403", r.status_code == 403,
        f"status={r.status_code} body={r.text[:120]}")

    # 5f: admin GET → 403
    r = requests.get(f"{BASE}/plan-naissance", headers=hdr(t_admin), timeout=30)
    log("5f admin GET 403", r.status_code == 403,
        f"status={r.status_code} body={r.text[:120]}")

    # ============================
    # 6) /infolettre
    # ============================
    print("\n--- 6) /infolettre ---")

    r = requests.get(f"{BASE}/infolettre", headers=hdr(t_maman), timeout=30)
    ok = r.status_code == 200
    log("6a maman /infolettre 200", ok,
        f"status={r.status_code} body[:300]={r.text[:300]}")
    if ok:
        b = r.json()
        items = b.get("items", [])
        log("6a items present", isinstance(items, list), f"items_type={type(items)}")
        log("6a items.length>=1", len(items) >= 1, f"len={len(items)}")
        log("6a generated_at present", bool(b.get("generated_at")),
            f"generated_at={b.get('generated_at')}")
        log("6a subscriber_name present", "subscriber_name" in b,
            f"subscriber_name={b.get('subscriber_name')!r}")
        types_present = {it.get("type") for it in items}
        print(f"  item types: {types_present}")
        log("6a foetus item present (grossesse active)",
            "foetus" in types_present, f"types={types_present}")
        log("6a jalon item present (enfant)",
            "jalon" in types_present, f"types={types_present}")
        # diversification appears if any enfant 6-24mo. Our 13-month child qualifies.
        log("6a diversification item present (enfant 13mo)",
            "diversification" in types_present, f"types={types_present}")
        # foetus payload keys
        foetus_items = [it for it in items if it.get("type") == "foetus"]
        if foetus_items:
            f = foetus_items[0]
            for k in ("sa", "fruit", "taille", "highlights", "conseil"):
                log(f"6a foetus item key {k}", k in f, "")
            log("6a foetus highlights len==2",
                isinstance(f.get("highlights"), list) and len(f["highlights"]) == 2,
                f"len={len(f.get('highlights') or [])}")
        jalon_items = [it for it in items if it.get("type") == "jalon"]
        if jalon_items:
            jl = jalon_items[0]
            for k in ("enfant_id", "age_mois", "alerte"):
                log(f"6a jalon item key {k}", k in jl, "")
            log("6a jalon alerte is array",
                isinstance(jl.get("alerte"), list), "")

    # 6b pro
    r = requests.get(f"{BASE}/infolettre", headers=hdr(t_pro), timeout=30)
    ok = r.status_code == 200
    log("6b pro /infolettre 200", ok, f"status={r.status_code}")
    if ok:
        b = r.json()
        log("6b items=[] for pro", b.get("items") == [], f"items={b.get('items')}")
        log("6b message 'Disponible uniquement pour les mamans'",
            b.get("message") == "Disponible uniquement pour les mamans",
            f"message={b.get('message')!r}")

    # 6c admin
    r = requests.get(f"{BASE}/infolettre", headers=hdr(t_admin), timeout=30)
    ok = r.status_code == 200
    log("6c admin /infolettre 200", ok, f"status={r.status_code}")
    if ok:
        log("6c items=[] for admin", r.json().get("items") == [],
            f"items={r.json().get('items')}")

    # ============================
    # 7) Régression sanity
    # ============================
    print("\n--- 7) Régression sanity ---")
    for cred, name, tok in [(CRED_MAMAN, "maman", t_maman),
                             (CRED_PRO, "pro", t_pro),
                             (CRED_ADMIN, "admin", t_admin)]:
        rl = requests.post(f"{BASE}/auth/login", json=cred, timeout=30)
        log(f"7 login {name}", rl.status_code == 200, f"status={rl.status_code}")
        rm = requests.get(f"{BASE}/auth/me", headers=hdr(tok), timeout=30)
        log(f"7 /auth/me {name}", rm.status_code == 200, f"status={rm.status_code}")

    for ep in ["/grossesse", "/enfants", "/rdv", "/dossier"]:
        r = requests.get(f"{BASE}{ep}", headers=hdr(t_maman), timeout=30)
        log(f"7 maman GET {ep}", r.status_code == 200, f"status={r.status_code}")

    r = requests.get(f"{BASE}/search/pros", headers=hdr(t_maman), timeout=30)
    log("7 GET /search/pros (no param)",
        r.status_code == 200 and isinstance(r.json(), list),
        f"status={r.status_code} type={type(r.json()).__name__ if r.ok else None}")

    # ============================
    # CLEANUP — delete created enfants
    # ============================
    print("\n--- CLEANUP ---")
    for eid in created_eids:
        rd = requests.delete(f"{BASE}/enfants/{eid}", headers=hdr(t_maman), timeout=30)
        print(f"  DELETE enfant {eid} → {rd.status_code}")

    # Note: plan-naissance/grossesse left in DB intentionally per usual test pattern.

    # ============================
    # SUMMARY
    # ============================
    print("\n" + "=" * 80)
    print(f"PASS: {len(PASS)}  |  FAIL: {len(FAIL)}")
    print("=" * 80)
    if FAIL:
        print("\n=== FAILURES ===")
        for f in FAIL:
            print(f"  [FAIL] {f}")
    sys.exit(0 if not FAIL else 1)


if __name__ == "__main__":
    main()
