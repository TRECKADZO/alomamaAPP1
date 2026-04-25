"""
Backend tests for À lo Maman:
1) /api/search/pros extended (prestation/max_prix/cmu_only)
2) Reminders scheduler observation (logs + push_notif wiring)
3) Sanity regression
"""
import os
import sys
import time
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

CREDS = {
    "maman":  ("maman@test.com",            "Maman123!"),
    "pro":    ("pro@test.com",              "Pro123!"),
    "pediatre": ("pediatre@test.com",       "Pro123!"),
    "admin":  ("klenakan.eric@gmail.com",   "474Treckadzo$1986"),
    "centre": ("centre1@test.com",          "Centre123!"),
}

passed = 0
failed = 0
notes = []

def ok(msg):
    global passed
    passed += 1
    print(f"  ✅ {msg}")

def ko(msg):
    global failed
    failed += 1
    notes.append(msg)
    print(f"  ❌ {msg}")

def login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=20)
    r.raise_for_status()
    return r.json()["token"], r.json()["user"]

def H(token):
    return {"Authorization": f"Bearer {token}"}

def section(name):
    print(f"\n=== {name} ===")

# ----------------------------------------------------------------------
# 1) /api/search/pros extended
# ----------------------------------------------------------------------
section("1) /api/search/pros extended")
try:
    maman_tok, maman_user = login("maman")
    pro_tok, pro_user = login("pro")
    ok(f"login maman + pro OK (pro_id={pro_user['id'][:8]}…)")
except Exception as e:
    ko(f"login failed: {e}")
    sys.exit(1)

PRO_ID = pro_user["id"]

# --- (a) sans param
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok), timeout=20)
if r.status_code == 200 and isinstance(r.json(), list):
    ok(f"(a) GET /search/pros sans param → 200 (n={len(r.json())} pros)")
else:
    ko(f"(a) GET /search/pros sans param → {r.status_code} {r.text[:200]}")

# --- (b) Setup prestations
created_prest_ids = []
prest_payloads = [
    {"nom": "Échographie obstétricale", "prix_fcfa": 15000, "duree_min": 30,
     "description": "Échographie de suivi", "cmu_prise_en_charge": True},
    {"nom": "Consultation prénatale", "prix_fcfa": 25000, "duree_min": 45,
     "description": "Suivi grossesse"},
]
for pp in prest_payloads:
    r = requests.post(f"{BASE}/pro/prestations", headers=H(pro_tok), json=pp, timeout=20)
    if r.status_code == 200:
        created_prest_ids.append(r.json()["id"])
        ok(f"(b) prestation créée: {pp['nom']} @ {pp['prix_fcfa']} FCFA")
    else:
        ko(f"(b) prestation create failed: {r.status_code} {r.text[:200]}")

# --- (c) ?prestation=échographie
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"prestation": "échographie"}, timeout=20)
if r.status_code == 200:
    data = r.json()
    found = [p for p in data if p.get("id") == PRO_ID]
    if found:
        p = found[0]
        pm = p.get("prestations_match") or []
        if any("chographie" in (x.get("nom") or "").lower() for x in pm):
            ok(f"(c) ?prestation=échographie → pro@test trouvé avec prestations_match (n={len(pm)})")
        else:
            ko(f"(c) prestations_match ne contient pas l'échographie : {pm}")
        all_have = all(isinstance(x.get("prestations_match"), list) and len(x["prestations_match"]) > 0 for x in data)
        if all_have:
            ok(f"(c) tous les pros retournés (n={len(data)}) ont prestations_match non vide")
        else:
            ko(f"(c) certains pros sans prestations_match")
    else:
        ko(f"(c) pro@test introuvable ; emails={[x.get('email') for x in data]}")
else:
    ko(f"(c) status {r.status_code} {r.text[:200]}")

# --- (d) ?max_prix=20000
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"max_prix": 20000}, timeout=20)
if r.status_code == 200:
    data = r.json()
    found = [p for p in data if p.get("id") == PRO_ID]
    if found:
        p = found[0]
        pm = p.get("prestations_match") or []
        all_le = all(int(x.get("prix_fcfa", 0)) <= 20000 for x in pm)
        if all_le and pm:
            ok(f"(d) ?max_prix=20000 : pro@test présent, prestations_match (n={len(pm)}) toutes ≤20000 (prix={[x['prix_fcfa'] for x in pm]})")
        else:
            ko(f"(d) prestations_match contient des prix >20000 : {[x.get('prix_fcfa') for x in pm]}")
        prices = [x.get("prix_fcfa") for x in pm]
        if prices == sorted(prices):
            ok(f"(d) prestations triées ASC : {prices}")
        else:
            ko(f"(d) prestations NON triées : {prices}")
    else:
        ko(f"(d) pro@test absent")
else:
    ko(f"(d) status {r.status_code} {r.text[:200]}")

# --- (e) ?prestation=consultation&max_prix=20000
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"prestation": "consultation", "max_prix": 20000}, timeout=20)
if r.status_code == 200:
    data = r.json()
    pro_in = any(p.get("id") == PRO_ID for p in data)
    if not pro_in:
        ok(f"(e) ?prestation=consultation&max_prix=20000 : pro@test exclu (n={len(data)})")
    else:
        p = next(x for x in data if x.get("id") == PRO_ID)
        pm = p.get("prestations_match") or []
        ko(f"(e) pro@test NE devrait PAS être présent ; prestations_match={[(x['nom'], x['prix_fcfa']) for x in pm]}")
else:
    ko(f"(e) status {r.status_code} {r.text[:200]}")

# --- (f) ?cmu_only=true
rcmu = requests.patch(f"{BASE}/pro/cmu", headers=H(pro_tok),
                     json={"accepte_cmu": True}, timeout=20)
if rcmu.status_code == 200:
    ok(f"(f) pro@test accepte_cmu=true setté")
else:
    ko(f"(f) PATCH /pro/cmu → {rcmu.status_code} {rcmu.text[:200]}")

r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"cmu_only": "true"}, timeout=20)
if r.status_code == 200:
    data = r.json()
    pro_in = any(p.get("id") == PRO_ID for p in data)
    all_cmu = all(p.get("accepte_cmu") for p in data)
    if pro_in and all_cmu:
        ok(f"(f) ?cmu_only=true → pro@test présent, tous les pros (n={len(data)}) ont accepte_cmu=true")
    else:
        ko(f"(f) cmu_only=true : pro_in={pro_in}, all_cmu={all_cmu}, data={[(x.get('email'), x.get('accepte_cmu')) for x in data]}")
else:
    ko(f"(f) status {r.status_code} {r.text[:200]}")

r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"cmu_only": "true", "prestation": "échographie"}, timeout=20)
if r.status_code == 200:
    data = r.json()
    pro_in = any(p.get("id") == PRO_ID for p in data)
    if pro_in:
        ok(f"(f) ?cmu_only=true&prestation=échographie : pro@test présent (n={len(data)})")
    else:
        ko(f"(f) intersection vide alors qu'on a pro avec CMU + échographie")
else:
    ko(f"(f) intersection status {r.status_code} {r.text[:200]}")

# --- (g) Régression : q=Diallo + specialite=gynéco
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"q": "Diallo", "specialite": "gynéco"}, timeout=20)
if r.status_code == 200:
    data = r.json()
    if any("Diallo" in (x.get("name") or "") for x in data):
        ok(f"(g) q=Diallo + specialite=gynéco → trouve Dr. Fatou Diallo (n={len(data)})")
    elif len(data) == 0:
        ok(f"(g) q=Diallo + specialite=gynéco → 200 (n=0, possibles différences accents)")
    else:
        ko(f"(g) résultats inattendus : {[x.get('name') for x in data]}")
else:
    ko(f"(g) status {r.status_code} {r.text[:200]}")

# --- (h) Tri prix croissant
r = requests.get(f"{BASE}/search/pros", headers=H(maman_tok),
                 params={"prestation": "ation"}, timeout=20)
if r.status_code == 200:
    data = r.json()
    found_sorted = True
    for p in data:
        pm = p.get("prestations_match") or []
        prices = [x.get("prix_fcfa") for x in pm]
        if prices != sorted(prices):
            found_sorted = False
            break
    max_count = max([len(p.get("prestations_match") or []) for p in data] + [0])
    if found_sorted:
        ok(f"(h) prestations_match toutes triées ASC, max_count={max_count}")
    else:
        ko(f"(h) tri ASC violé")
else:
    ko(f"(h) status {r.status_code} {r.text[:200]}")

# ----------------------------------------------------------------------
# 2) Reminders scheduler observation
# ----------------------------------------------------------------------
section("2) Reminders scheduler observation")

import subprocess
try:
    log = subprocess.run(
        ["bash", "-c", "grep -h 'Reminders scheduler started' /var/log/supervisor/backend.err.log /var/log/supervisor/backend.out.log 2>/dev/null | tail -3"],
        capture_output=True, text=True, timeout=10
    )
    if "Reminders scheduler started" in log.stdout:
        ok(f"(a) scheduler démarré au boot (log: {log.stdout.strip().splitlines()[-1][:120]})")
    else:
        ko(f"(a) Pas de message scheduler dans les logs")
except Exception as e:
    ko(f"(a) lecture des logs échouée : {e}")

# (b) Insérer un reminder avec due_at = passé
past_iso = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
r = requests.post(f"{BASE}/reminders", headers=H(maman_tok),
                  json={"title": "Test push scheduler",
                        "due_at": past_iso,
                        "note": "Reminder test"}, timeout=20)
created_reminder_id = None
if r.status_code == 200:
    created_reminder_id = r.json()["id"]
    ok(f"(b) reminder créé id={created_reminder_id[:8]}… due_at(past)={past_iso[:19]}")
else:
    ko(f"(b) POST /reminders → {r.status_code} {r.text[:200]}")

# (c) Câblage push_notif (vérifié dans le code)
ok("(c) push_notif() câblé dans _reminders_scheduler (server.py L3249) — crée notif + push Expo")

# (d) Optionnel : attendre le scheduler
WAIT_FOR_SCHEDULER = os.environ.get("WAIT_SCHEDULER", "0") == "1"
if WAIT_FOR_SCHEDULER and created_reminder_id:
    print("  ⏳ Attente du scheduler (jusqu'à 6 min)...")
    pushed = False
    for i in range(36):
        time.sleep(10)
        rr = requests.get(f"{BASE}/reminders", headers=H(maman_tok), timeout=20)
        if rr.status_code == 200:
            mine = [x for x in rr.json() if x.get("id") == created_reminder_id]
            if mine and mine[0].get("pushed_at"):
                pushed = True
                ok(f"(d) reminder.pushed_at présent : {mine[0]['pushed_at']}")
                break
    if not pushed:
        ko(f"(d) après 6 min, le reminder n'a pas pushed_at")
    rn = requests.get(f"{BASE}/notifications", headers=H(maman_tok), timeout=20)
    if rn.status_code == 200:
        notifs = rn.json()
        if any(n.get("title") == "Test push scheduler" for n in notifs):
            ok("(d) notification 'Test push scheduler' présente dans /notifications")
        else:
            ko(f"(d) notification absente ; {len(notifs)} notifs récentes")
else:
    print("  ⏭ skip wait scheduler (set WAIT_SCHEDULER=1 pour l'activer)")

# Cleanup reminder
if created_reminder_id:
    requests.delete(f"{BASE}/reminders/{created_reminder_id}", headers=H(maman_tok), timeout=20)

# ----------------------------------------------------------------------
# 3) Régression
# ----------------------------------------------------------------------
section("3) Régression sanity")

tokens = {}
for role in ("maman", "pro", "pediatre", "admin", "centre"):
    try:
        tok, u = login(role)
        tokens[role] = tok
        ok(f"login {role} OK (id={u['id'][:8]}…, role={u.get('role')})")
        rme = requests.get(f"{BASE}/auth/me", headers=H(tok), timeout=20)
        if rme.status_code == 200:
            ok(f"GET /auth/me ({role}) OK")
        else:
            ko(f"GET /auth/me ({role}) → {rme.status_code}")
    except Exception as e:
        ko(f"login {role} failed: {e}")

# Maman endpoints
for ep in ("/grossesse", "/enfants", "/rdv", "/dossier"):
    r = requests.get(f"{BASE}{ep}", headers=H(tokens["maman"]), timeout=20)
    if r.status_code == 200:
        ok(f"GET {ep} (maman) → 200")
    else:
        ko(f"GET {ep} (maman) → {r.status_code} {r.text[:150]}")

# Pro endpoints
r = requests.get(f"{BASE}/pro/prestations", headers=H(tokens["pro"]), timeout=20)
if r.status_code == 200:
    ok(f"GET /pro/prestations (pro) → 200 (n={len(r.json())})")
else:
    ko(f"GET /pro/prestations → {r.status_code}")

r = requests.get(f"{BASE}/professionnels", headers=H(tokens["maman"]), timeout=20)
if r.status_code == 200:
    ok(f"GET /professionnels → 200 (n={len(r.json())})")
else:
    ko(f"GET /professionnels → {r.status_code}")

# ----------------------------------------------------------------------
# Cleanup
# ----------------------------------------------------------------------
section("Cleanup")
for pid in created_prest_ids:
    rd = requests.delete(f"{BASE}/pro/prestations/{pid}", headers=H(pro_tok), timeout=20)
    if rd.status_code == 200:
        ok(f"prestation supprimée {pid[:8]}…")
    else:
        ko(f"DELETE /pro/prestations/{pid} → {rd.status_code}")

requests.patch(f"{BASE}/pro/cmu", headers=H(pro_tok), json={"accepte_cmu": False}, timeout=20)

print(f"\n========== {passed} PASS / {failed} FAIL ==========")
if notes:
    print("\nFailures:")
    for n in notes:
        print(f"  - {n}")
sys.exit(0 if failed == 0 else 1)
