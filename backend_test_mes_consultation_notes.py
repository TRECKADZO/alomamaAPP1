#!/usr/bin/env python3
"""
Test GET /api/mes-consultation-notes endpoint.
Scenario: A maman can see ALL her medical notes (personal + her children's).
"""
import os
import json
import time
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"

results = []

def log(label, ok, detail=""):
    icon = "✅" if ok else "❌"
    results.append((ok, label, detail))
    print(f"{icon} {label}" + (f" → {detail}" if detail else ""))

def bail(msg):
    print(f"\n💥 BAIL: {msg}")
    summary()
    raise SystemExit(1)

def summary():
    passed = sum(1 for r in results if r[0])
    failed = sum(1 for r in results if not r[0])
    print(f"\n===== SUMMARY : {passed} PASS / {failed} FAIL (total {len(results)}) =====")
    for ok, label, detail in results:
        if not ok:
            print(f"  ❌ {label} → {detail}")

def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    if r.status_code != 200:
        bail(f"Login failed for {email}: {r.status_code} {r.text}")
    data = r.json()
    return data["token"], data["user"]

def auth(tok):
    return {"Authorization": f"Bearer {tok}"}

def register(email, pwd, role="maman", name="Temp User", phone=None):
    body = {
        "email": email,
        "password": pwd,
        "name": name,
        "role": role,
        "accepte_cgu": True,
        "accepte_politique_confidentialite": True,
        "accepte_donnees_sante": True,
        "accepte_communications": False,
    }
    if phone:
        body["phone"] = phone
    r = requests.post(f"{BASE}/auth/register", json=body, timeout=30)
    return r

# ============================================================
# 1) SETUP
# ============================================================
print("=== SETUP ===")
maman_token, maman_user = login(MAMAN_EMAIL, MAMAN_PASSWORD)
pro_token, pro_user = login(PRO_EMAIL, PRO_PASSWORD)
maman_id = maman_user["id"]
pro_id = pro_user["id"]
log("1a. Login maman & pro", True, f"maman_id={maman_id[:8]}… pro_id={pro_id[:8]}…")

# Confirm via GET /auth/me
r = requests.get(f"{BASE}/auth/me", headers=auth(maman_token), timeout=30)
log("1a.bis GET /auth/me maman", r.status_code == 200 and r.json().get("role") == "maman", f"status={r.status_code}")

# Get/create enfant
r = requests.get(f"{BASE}/enfants", headers=auth(maman_token), timeout=30)
if r.status_code != 200:
    bail(f"GET /enfants failed: {r.status_code} {r.text}")
enfants = r.json()
if not enfants:
    # Try to create
    r = requests.post(f"{BASE}/enfants", headers=auth(maman_token),
                      json={"nom": "BébéTest", "date_naissance": "2025-01-15", "sexe": "M"},
                      timeout=30)
    if r.status_code == 200:
        enfant = r.json()
        enfant_id = enfant["id"]
        enfant_nom = enfant.get("nom", "BébéTest")
        log("1b. Created enfant BébéTest", True, f"id={enfant_id[:8]}…")
    elif r.status_code == 402:
        # Quota atteint — réutilise l'existant (il devrait y avoir au moins un après cleanup)
        bail(f"Cannot create enfant (quota 402) and list returned empty: {r.text}")
    else:
        bail(f"Enfant creation failed: {r.status_code} {r.text}")
else:
    enfant = enfants[0]
    enfant_id = enfant["id"]
    enfant_nom = enfant.get("nom") or "BébéTest"
    log("1b. Using existing enfant", True, f"id={enfant_id[:8]}… nom={enfant_nom}")

# Vérifier RDV confirmé maman<->pro
r = requests.get(f"{BASE}/rdv", headers=auth(maman_token), timeout=30)
rdvs = r.json() if r.status_code == 200 else []
has_confirmed_rdv = any(rv.get("pro_id") == pro_id and rv.get("status") == "confirme" for rv in rdvs)
if not has_confirmed_rdv:
    # Créer RDV maman→pro, puis confirmer côté Pro
    date_rdv = (datetime.now(timezone.utc) + timedelta(days=7)).replace(microsecond=0).isoformat()
    r = requests.post(f"{BASE}/rdv", headers=auth(maman_token),
                      json={"pro_id": pro_id, "date": date_rdv, "motif": "Test mes-consultation-notes", "tarif_fcfa": 5000},
                      timeout=30)
    if r.status_code != 200:
        bail(f"Create RDV failed: {r.status_code} {r.text}")
    rdv_id = r.json()["id"]
    # Pro confirms
    r2 = requests.patch(f"{BASE}/rdv/{rdv_id}", headers=auth(pro_token),
                        json={"status": "confirme"}, timeout=30)
    ok = r2.status_code == 200
    log("1c. Created & confirmed RDV", ok, f"rdv_id={rdv_id[:8]}… patch_status={r2.status_code}")
    if not ok:
        bail(f"PATCH RDV status failed: {r2.status_code} {r2.text}")
else:
    log("1c. RDV confirmé existant maman<->pro", True)

# ============================================================
# 2) SETUP NOTES (Pro) — 3 notes
# ============================================================
print("\n=== STEP 2: Create 3 notes as Pro ===")
note_ids = []

# A — Note MAMAN
body_A = {
    "patient_id": maman_id,
    "diagnostic": "Bilan de grossesse 2e trimestre",
    "traitement": "Acide folique 5mg",
    "notes": "RAS. RDV dans 4 semaines.",
}
r = requests.post(f"{BASE}/pro/consultation-notes", headers=auth(pro_token), json=body_A, timeout=30)
ok = r.status_code == 200
log("2.A POST note MAMAN", ok, f"status={r.status_code}")
if not ok:
    bail(f"Note A failed: {r.status_code} {r.text}")
note_A = r.json()
note_id_A = note_A["id"]
note_ids.append(note_id_A)
log("2.A patient_type=maman & clear text", 
    note_A.get("patient_type") == "maman" 
    and not (note_A.get("diagnostic") or "").startswith("enc_v1:")
    and not (note_A.get("diagnostic") or "").startswith("enc::"),
    f"type={note_A.get('patient_type')}")

# B — Note ENFANT
body_B = {
    "patient_id": enfant_id,
    "diagnostic": "Contrôle pédiatrique",
    "traitement": "Vitamine D 400 UI",
    "notes": "Croissance normale",
}
r = requests.post(f"{BASE}/pro/consultation-notes", headers=auth(pro_token), json=body_B, timeout=30)
ok = r.status_code == 200
log("2.B POST note ENFANT (sans attachment)", ok, f"status={r.status_code}")
if not ok:
    bail(f"Note B failed: {r.status_code} {r.text}")
note_B = r.json()
note_id_B = note_B["id"]
note_ids.append(note_id_B)
log("2.B patient_type=enfant & maman_id present",
    note_B.get("patient_type") == "enfant" and note_B.get("maman_id") == maman_id,
    f"type={note_B.get('patient_type')} maman_id_match={note_B.get('maman_id')==maman_id}")

# C — Note ENFANT + attachment image
body_C = {
    "patient_id": enfant_id,
    "diagnostic": "Eczéma léger",
    "traitement": "Crème hydratante",
    "attachment_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    "attachment_name": "prescription.jpg",
    "attachment_mime": "image/jpeg",
}
r = requests.post(f"{BASE}/pro/consultation-notes", headers=auth(pro_token), json=body_C, timeout=30)
ok = r.status_code == 200
log("2.C POST note ENFANT avec attachment image", ok, f"status={r.status_code}")
if not ok:
    bail(f"Note C failed: {r.status_code} {r.text}")
note_C = r.json()
note_id_C = note_C["id"]
note_ids.append(note_id_C)
att = note_C.get("attachment_base64") or ""
log("2.C attachment_base64 clear (data URI)",
    att.startswith("data:image/jpeg;base64,") and "enc_v1:" not in att and "enc::" not in att,
    f"prefix={att[:40]}…")

# ============================================================
# 3) MAIN TEST — GET /api/mes-consultation-notes
# ============================================================
print("\n=== STEP 3: MAIN — GET /mes-consultation-notes as maman ===")
r = requests.get(f"{BASE}/mes-consultation-notes", headers=auth(maman_token), timeout=30)
ok = r.status_code == 200
log("3.1 GET /mes-consultation-notes as maman", ok, f"status={r.status_code}")
if not ok:
    bail(f"Main endpoint failed: {r.status_code} {r.text}")
notes_list = r.json()
log("3.1.a réponse est une liste", isinstance(notes_list, list), f"type={type(notes_list).__name__}")

# Vérifier que les 3 notes créées sont dans la liste
ids_in_list = {n.get("id") for n in notes_list}
missing = [x for x in [note_id_A, note_id_B, note_id_C] if x not in ids_in_list]
log("3.2 Les 3 notes A/B/C présentes", len(missing) == 0, f"missing={missing}, total_returned={len(notes_list)}")

# Pas de ciphertext (enc_v1:/enc::) dans tous les champs sensibles
def has_enc(v):
    if not isinstance(v, str):
        return False
    return v.startswith("enc_v1:") or v.startswith("enc::") or "enc_v1:" in v[:20]

bad_enc = []
for n in notes_list:
    for f in ("diagnostic", "traitement", "notes", "attachment_base64"):
        v = n.get(f)
        if v and has_enc(v):
            bad_enc.append((n.get("id"), f, v[:40]))
log("3.3 Aucun champ chiffré visible (enc_v1:/enc::)", len(bad_enc) == 0, f"leaks={bad_enc}")

# concerne + enfant_nom
def find(id_):
    return next((n for n in notes_list if n.get("id") == id_), None)

nA = find(note_id_A)
nB = find(note_id_B)
nC = find(note_id_C)

log("3.4.A concerne='Moi' sur note A", nA and nA.get("concerne") == "Moi",
    f"concerne={nA.get('concerne') if nA else 'MISSING'}")
log("3.4.A enfant_nom=None sur note A", nA and nA.get("enfant_nom") in (None,),
    f"enfant_nom={nA.get('enfant_nom') if nA else 'MISSING'}")
log("3.4.B concerne=enfant_nom sur note B", nB and nB.get("concerne") == enfant_nom,
    f"concerne={nB.get('concerne') if nB else 'MISSING'} (expected={enfant_nom})")
log("3.4.B enfant_nom correct sur note B", nB and nB.get("enfant_nom") == enfant_nom,
    f"enfant_nom={nB.get('enfant_nom') if nB else 'MISSING'}")
log("3.4.C concerne=enfant_nom sur note C", nC and nC.get("concerne") == enfant_nom,
    f"concerne={nC.get('concerne') if nC else 'MISSING'}")
log("3.4.C enfant_nom correct sur note C", nC and nC.get("enfant_nom") == enfant_nom,
    f"enfant_nom={nC.get('enfant_nom') if nC else 'MISSING'}")

# Attachment C
attC = (nC or {}).get("attachment_base64") or ""
log("3.5.C attachment_base64 note C = data URI jpeg",
    attC.startswith("data:image/jpeg;base64,") and "9j/4AAQSkZJRg" in attC,
    f"len={len(attC)} prefix={attC[:60]}")

# Vérifier que le contenu déchiffré = exact input
log("3.6.A diagnostic clair note A", nA and nA.get("diagnostic") == body_A["diagnostic"],
    f"got={nA.get('diagnostic') if nA else 'MISSING'}")
log("3.6.B traitement clair note B", nB and nB.get("traitement") == body_B["traitement"],
    f"got={nB.get('traitement') if nB else 'MISSING'}")

# ============================================================
# 4) TRI — created_at DESC
# ============================================================
print("\n=== STEP 4: Tri created_at DESC ===")
sub = [n for n in notes_list if n.get("id") in {note_id_A, note_id_B, note_id_C}]
# Order should be C, B, A (C was created last)
# Get created_at and ensure descending overall
from datetime import datetime as DT
def parse_dt(s):
    if not s: return None
    try:
        return DT.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

dates = [parse_dt(n.get("created_at")) for n in notes_list]
valid = [d for d in dates if d]
is_desc = all(valid[i] >= valid[i+1] for i in range(len(valid)-1))
log("4.1 Notes triées par created_at DESC", is_desc, 
    f"first={valid[0].isoformat() if valid else 'n/a'} last={valid[-1].isoformat() if valid else 'n/a'}")

# Specifically check that note_id_C comes before note_id_A (if created in same run)
try:
    idx_A = next(i for i, n in enumerate(notes_list) if n.get("id") == note_id_A)
    idx_C = next(i for i, n in enumerate(notes_list) if n.get("id") == note_id_C)
    log("4.2 note_id_C index < note_id_A index (C plus récente)", idx_C < idx_A, f"idx_C={idx_C} idx_A={idx_A}")
except StopIteration:
    log("4.2 Trouver idx A/C", False, "missing in list")

# ============================================================
# 5) SÉCURITÉ
# ============================================================
print("\n=== STEP 5: Sécurité ===")

# 5a) sans token
r = requests.get(f"{BASE}/mes-consultation-notes", timeout=30)
log("5.a GET sans Bearer → 401", r.status_code == 401, f"status={r.status_code}")

# 5b) login pro → 403
r = requests.get(f"{BASE}/mes-consultation-notes", headers=auth(pro_token), timeout=30)
ok = r.status_code == 403 and "maman" in (r.text or "").lower()
log("5.b GET as Pro → 403 'Réservé aux mamans'", ok, f"status={r.status_code} body={r.text[:150]}")

# 5c) Cross-maman isolation
ts = int(time.time())
maman2_email = f"maman2_mcn_{ts}@test.alomaman.dev"
maman2_pwd = "Maman2Test123!"
rr = register(maman2_email, maman2_pwd, role="maman", name="Maman2 Test MCN",
              phone=f"+22507{ts % 100000000:08d}")
log("5.c.1 Register maman2 temporaire", rr.status_code == 200, f"status={rr.status_code} body={rr.text[:200]}")
maman2_token = None
if rr.status_code == 200:
    maman2_token = rr.json()["token"]
else:
    # try login if already exists
    try:
        t, u = login(maman2_email, maman2_pwd)
        maman2_token = t
    except Exception:
        pass

if maman2_token:
    r = requests.get(f"{BASE}/mes-consultation-notes", headers=auth(maman2_token), timeout=30)
    ok = r.status_code == 200
    log("5.c.2 GET as maman2 → 200", ok, f"status={r.status_code}")
    if ok:
        m2_list = r.json()
        m2_ids = {n.get("id") for n in m2_list}
        leaked = [x for x in [note_id_A, note_id_B, note_id_C] if x in m2_ids]
        log("5.c.3 maman2 ne voit AUCUNE note de maman.test", len(leaked) == 0,
            f"leaked={leaked} total_seen_by_maman2={len(m2_list)}")
        log("5.c.4 maman2 liste vide (0 note)", len(m2_list) == 0, f"count={len(m2_list)}")

# ============================================================
# 7) CLEANUP
# ============================================================
print("\n=== STEP 7: Cleanup ===")
for nid in note_ids:
    r = requests.delete(f"{BASE}/pro/consultation-notes/{nid}", headers=auth(pro_token), timeout=30)
    log(f"7.delete note {nid[:8]}…", r.status_code == 200, f"status={r.status_code}")

# Supprimer maman2
if maman2_token:
    r = requests.delete(f"{BASE}/auth/me", headers=auth(maman2_token),
                        json={"password": maman2_pwd, "confirmation": "SUPPRIMER"}, timeout=30)
    log("7.delete maman2 account", r.status_code in (200, 204), f"status={r.status_code}")

summary()
