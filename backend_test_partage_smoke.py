"""
Smoke test for the dossier access request (partage) flow.

Flow:
 1. Login PRO (pro.test@alomaman.dev)
 2. Login MAMAN (maman.test@alomaman.dev)
 3. As MAMAN: GET /auth/me → inspect identifier fields (cmu_numero, code_partage, code_provisoire)
    + GET /auth/me/code-partage to get canonical share code.
 4. As PRO: POST /pro/patient/recherche with {identifier, motif} to create a demande.
    NOTE: there is NO POST /partage/demande endpoint. The creation endpoint is
    /pro/patient/recherche (server.py L7850). body = {"identifier": str, "motif": str}.
 5. Verify response shape: demande_id, patient_nom, status="pending", message.
 6. As MAMAN: GET /partage/demandes-recues → confirm the demande with pending + pro_name.
 7. As MAMAN: GET /notifications → confirm a notification with type="partage_demande" exists.
 8. As MAMAN: POST /partage/demande/{demande_id}/valider → expect {status:"validated",
    expires_at, message}.
 9. As MAMAN: GET /partage/demandes-recues → verify status == "validated".
"""

import json
import sys
import time
from typing import Optional

import requests

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}
CHILD_ID_HINT = "e41c8152-305e-4014-a4f8-4459d955a6cf"  # from review

PASS = 0
FAIL = 0
BUGS: list[str] = []


def rec(ok: bool, msg: str, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✅ {msg}")
    else:
        FAIL += 1
        BUGS.append(msg + (f" — {detail}" if detail else ""))
        print(f"  ❌ {msg}" + (f" → {detail}" if detail else ""))


def login(creds: dict) -> Optional[str]:
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        print(f"Login failed for {creds['email']}: {r.status_code} {r.text[:200]}")
        return None
    return r.json().get("token")


def H(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("=" * 70)
    print("PARTAGE (dossier access request) smoke test")
    print("=" * 70)

    # Step 1 / 2 — Logins
    print("\n[1-2] Logins PRO + MAMAN")
    pro_tok = login(PRO)
    rec(pro_tok is not None, "Login PRO pro.test@alomaman.dev")
    maman_tok = login(MAMAN)
    rec(maman_tok is not None, "Login MAMAN maman.test@alomaman.dev")
    if not pro_tok or not maman_tok:
        print("Cannot continue without both tokens.")
        sys.exit(1)

    # Step 3 — GET /auth/me MAMAN + code-partage
    print("\n[3] MAMAN identifier inspection")
    r = requests.get(f"{BASE}/auth/me", headers=H(maman_tok), timeout=30)
    rec(r.status_code == 200, "GET /auth/me as MAMAN returns 200", str(r.status_code))
    me = r.json() if r.status_code == 200 else {}
    maman_id = me.get("id")
    maman_name = me.get("name")
    # Show relevant fields
    cmu_block = me.get("cmu") or {}
    print(
        "    me fields: id=%s name=%s role=%s code_provisoire=%s cmu=%s"
        % (
            maman_id,
            maman_name,
            me.get("role"),
            me.get("code_provisoire"),
            (cmu_block.get("numero") if isinstance(cmu_block, dict) else cmu_block),
        )
    )

    r2 = requests.get(f"{BASE}/auth/me/code-partage", headers=H(maman_tok), timeout=30)
    rec(
        r2.status_code == 200,
        "GET /auth/me/code-partage as MAMAN returns 200",
        str(r2.status_code),
    )
    codes = r2.json() if r2.status_code == 200 else {}
    print(
        "    code-partage response: cmu=%s code_provisoire=%s preferred=%s"
        % (codes.get("cmu"), codes.get("code_provisoire"), codes.get("preferred"))
    )
    # Preferred identifier for the partage demande — either CMU if set, otherwise AM code
    identifier = codes.get("preferred") or codes.get("cmu") or codes.get("code_provisoire")
    rec(bool(identifier), "MAMAN has a usable share identifier (CMU or code AM)", str(codes))

    # Attempt to also fetch child code to confirm child exists
    r3 = requests.get(f"{BASE}/enfants", headers=H(maman_tok), timeout=30)
    if r3.status_code == 200:
        enfants = r3.json()
        print(f"    MAMAN has {len(enfants)} enfant(s).")
        target_child = next((e for e in enfants if e.get("id") == CHILD_ID_HINT), None)
        if target_child:
            print(f"    Child id {CHILD_ID_HINT} found: nom={target_child.get('nom')}")
        else:
            print(f"    ⚠ Child id {CHILD_ID_HINT} NOT in MAMAN's enfants; first child id = "
                  f"{enfants[0].get('id') if enfants else 'none'}")

    # Step 4 — PRO creates the partage demande
    print("\n[4] PRO POST /pro/patient/recherche (REAL endpoint — /partage/demande does NOT exist)")
    payload = {"identifier": identifier, "motif": "Test consultation"}
    print(f"    body: {json.dumps(payload)}")
    r = requests.post(
        f"{BASE}/pro/patient/recherche", headers=H(pro_tok), json=payload, timeout=30
    )
    rec(r.status_code == 200, "POST /pro/patient/recherche returns 200", f"{r.status_code} {r.text[:250]}")
    if r.status_code != 200:
        print("Cannot continue: demande creation failed.")
        print_summary()
        sys.exit(1)
    resp = r.json()
    print(f"    response: {json.dumps(resp, ensure_ascii=False)}")

    # Step 5 — Verify response shape
    print("\n[5] Verify response shape")
    demande_id = resp.get("demande_id")
    rec(bool(demande_id), "response.demande_id present", str(resp))
    rec("patient_nom" in resp, "response.patient_nom present", str(resp))
    rec(resp.get("status") == "pending", 'response.status == "pending"', str(resp.get("status")))
    rec("message" in resp, "response.message present", str(resp))
    patient_nom = resp.get("patient_nom")
    patient_type = resp.get("patient_type")
    print(f"    demande_id={demande_id} patient_nom={patient_nom} patient_type={patient_type}")

    # Step 6 — MAMAN: GET /partage/demandes-recues
    print("\n[6] MAMAN GET /partage/demandes-recues")
    r = requests.get(f"{BASE}/partage/demandes-recues", headers=H(maman_tok), timeout=30)
    rec(r.status_code == 200, "GET /partage/demandes-recues returns 200", str(r.status_code))
    recues = r.json() if r.status_code == 200 else []
    match = next((d for d in recues if d.get("id") == demande_id), None)
    rec(match is not None, "New demande appears in MAMAN's demandes-recues list", f"count={len(recues)}")
    if match:
        rec(match.get("status") == "pending", 'demande.status == "pending"', str(match.get("status")))
        rec(
            match.get("pro_name") == "Dr Konan TestPro",
            'demande.pro_name == "Dr Konan TestPro"',
            str(match.get("pro_name")),
        )
        print(
            "    demande fields: pro_name=%s motif=%s status=%s patient_type=%s patient_nom=%s"
            % (
                match.get("pro_name"),
                match.get("motif"),
                match.get("status"),
                match.get("patient_type"),
                match.get("patient_nom"),
            )
        )

    # Step 7 — MAMAN: GET /notifications — check for partage_demande
    print("\n[7] MAMAN GET /notifications (looking for type=partage_demande)")
    r = requests.get(f"{BASE}/notifications", headers=H(maman_tok), timeout=30)
    rec(r.status_code == 200, "GET /notifications returns 200", str(r.status_code))
    notifs = r.json() if r.status_code == 200 else []
    partage_notifs = [n for n in notifs if n.get("type") == "partage_demande"]
    rec(
        len(partage_notifs) >= 1,
        "At least one notification with type=partage_demande exists",
        f"count={len(partage_notifs)} total_notifs={len(notifs)}",
    )
    if partage_notifs:
        latest = partage_notifs[0]  # sorted desc by created_at
        print(
            "    latest partage notif: title=%r body=%r read=%s created_at=%s"
            % (latest.get("title"), latest.get("body"), latest.get("read"), latest.get("created_at"))
        )

    # Step 8 — MAMAN: POST /partage/demande/{demande_id}/valider
    print(f"\n[8] MAMAN POST /partage/demande/{demande_id}/valider")
    r = requests.post(
        f"{BASE}/partage/demande/{demande_id}/valider", headers=H(maman_tok), timeout=30
    )
    rec(
        r.status_code == 200,
        "POST /partage/demande/{id}/valider returns 200",
        f"{r.status_code} {r.text[:250]}",
    )
    val = r.json() if r.status_code == 200 else {}
    print(f"    response: {json.dumps(val, ensure_ascii=False)}")
    # Review spec asked for access_token + access_expires_at; actual backend returns
    # status + expires_at + message (no access_token in the response body).
    rec(val.get("status") == "validated", 'validate response.status == "validated"', str(val.get("status")))
    rec("expires_at" in val, "validate response contains expires_at", str(val))
    rec("message" in val, "validate response contains message", str(val))
    # Check that DB now has access_token via re-fetch of demandes-recues
    time.sleep(0.3)

    # Step 9 — MAMAN: GET /partage/demandes-recues — verify status changed
    print("\n[9] MAMAN GET /partage/demandes-recues again (verify status changed)")
    r = requests.get(f"{BASE}/partage/demandes-recues", headers=H(maman_tok), timeout=30)
    rec(r.status_code == 200, "GET /partage/demandes-recues (post-validate) returns 200", str(r.status_code))
    recues2 = r.json() if r.status_code == 200 else []
    match2 = next((d for d in recues2 if d.get("id") == demande_id), None)
    rec(match2 is not None, "Demande still present after validation", "not found")
    if match2:
        print(
            "    post-validate demande: status=%s access_token_set=%s access_expires_at=%s"
            % (
                match2.get("status"),
                bool(match2.get("access_token")),
                match2.get("access_expires_at"),
            )
        )
        # Backend uses "validated" (server.py L7981), review wrote "validee" — flag both.
        status_is_validated = match2.get("status") in ("validated", "validee")
        rec(
            status_is_validated,
            'demande.status now "validated" (backend string) — review note said "validee" but code uses "validated"',
            str(match2.get("status")),
        )
        rec(
            bool(match2.get("access_token")),
            "demande.access_token now set (persisted in DB)",
            str(match2.get("access_token"))[:20] + "…",
        )
        rec(
            bool(match2.get("access_expires_at")),
            "demande.access_expires_at now set",
            str(match2.get("access_expires_at")),
        )

    print_summary()


def print_summary():
    total = PASS + FAIL
    print("\n" + "=" * 70)
    print(f"RESULT: {PASS}/{total} PASS, {FAIL} FAIL")
    if BUGS:
        print("\nFailures:")
        for b in BUGS:
            print(f"  - {b}")
    print("=" * 70)


if __name__ == "__main__":
    main()
