#!/usr/bin/env python3
"""
Backend tests for Pro messaging tool upgrade:
  Test 1 — GET /api/pro/patients enriched with messaging signals.
  Test 2 — POST /api/messages with optional attachment fields (2A-2E).
"""
import os
import sys
import json
import time
import requests

BASE = os.environ.get(
    "BACKEND_URL",
    "https://cycle-tracker-pro.preview.emergentagent.com",
).rstrip("/") + "/api"

MAMAN = {"email": "maman.test@alomaman.dev", "password": "Test1234!"}
PRO = {"email": "pro.test@alomaman.dev", "password": "Test1234!"}

PASS = 0
FAIL = 0
FAILS: list[str] = []


def chk(cond: bool, label: str, extra: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        msg = f"  ❌ {label}"
        if extra:
            msg += f" — {extra}"
        FAILS.append(label + (f" — {extra}" if extra else ""))
        print(msg)


def login(creds):
    r = requests.post(f"{BASE}/auth/login", json=creds, timeout=20)
    r.raise_for_status()
    j = r.json()
    return j["token"], j["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print(f"BASE URL = {BASE}\n")

    print("--- Login pro & maman ---")
    pro_tok, pro_u = login(PRO)
    maman_tok, maman_u = login(MAMAN)
    pro_id = pro_u["id"]
    maman_id = maman_u["id"]
    print(f"  pro_id   = {pro_id}")
    print(f"  maman_id = {maman_id}")

    # ------------------------------------------------------------------
    # Setup: ensure RDV exists between pro & maman so maman appears in /pro/patients
    # ------------------------------------------------------------------
    print("\n--- Setup: ensure RDV maman→pro exists ---")
    r = requests.get(f"{BASE}/rdv", headers=H(maman_tok), timeout=20)
    r.raise_for_status()
    rdvs_maman = r.json()
    has_rdv = any(rv.get("pro_id") == pro_id for rv in rdvs_maman)
    print(f"  Maman has {len(rdvs_maman)} RDV(s) total, with this pro: {has_rdv}")
    if not has_rdv:
        future = "2027-06-15T10:30:00"
        body = {
            "pro_id": pro_id,
            "date": future,
            "motif": "Test messaging signals",
        }
        r = requests.post(f"{BASE}/rdv", headers=H(maman_tok), json=body, timeout=20)
        chk(r.status_code == 200, f"POST /rdv to create RDV maman→pro → 200", f"got {r.status_code} {r.text[:200]}")

    # ------------------------------------------------------------------
    # TEST 1 — /pro/patients enriched
    # ------------------------------------------------------------------
    print("\n=========================================================")
    print("TEST 1 — GET /api/pro/patients ENRICHED (messaging signals)")
    print("=========================================================")

    # Send 2 messages from maman → pro
    print("\n--- Maman sends 2 messages to pro ---")
    for txt in ["Test unread 1", "Test unread 2"]:
        r = requests.post(
            f"{BASE}/messages",
            headers=H(maman_tok),
            json={"to_id": pro_id, "content": txt},
            timeout=20,
        )
        chk(r.status_code == 200, f"POST /messages '{txt}' → 200", f"got {r.status_code} {r.text[:200]}")

    # Pro fetches /pro/patients
    print("\n--- GET /pro/patients (as pro) ---")
    r = requests.get(f"{BASE}/pro/patients", headers=H(pro_tok), timeout=20)
    chk(r.status_code == 200, "GET /pro/patients → 200", f"got {r.status_code} {r.text[:200]}")
    patients = r.json() if r.status_code == 200 else []
    chk(isinstance(patients, list), "Response is a list")
    chk(len(patients) >= 1, f"At least 1 patient returned (got {len(patients)})")

    # Find our maman
    p = next((x for x in patients if x.get("id") == maman_id), None)
    chk(p is not None, f"Maman {maman_id} found in patients list")
    if p is None:
        print(f"\n  patients dump: {json.dumps(patients, indent=2, default=str)[:500]}")
    else:
        print(f"\n  Patient maman fields keys: {sorted(p.keys())}")
        print(f"  unread_count={p.get('unread_count')} last_message={p.get('last_message')!r}")
        print(f"  last_message_at={p.get('last_message_at')} last_message_from_me={p.get('last_message_from_me')}")

        chk(p.get("unread_count") == 2, f"unread_count == 2 (got {p.get('unread_count')})")
        chk(p.get("last_message") == "Test unread 2", f"last_message == 'Test unread 2' (got {p.get('last_message')!r})")
        chk(isinstance(p.get("last_message_at"), str) and p.get("last_message_at"), f"last_message_at is non-empty ISO string (got {p.get('last_message_at')!r})")
        chk(p.get("last_message_from_me") is False, f"last_message_from_me is False (got {p.get('last_message_from_me')!r})")

        # existing fields
        for f in ["id", "name", "has_grossesse", "enfants_count", "last_rdv_date"]:
            chk(f in p, f"existing field '{f}' present")

    # Now pro reads conversation -> marks read
    print("\n--- Pro fetches GET /messages/{maman_id} (marks read) ---")
    r = requests.get(f"{BASE}/messages/{maman_id}", headers=H(pro_tok), timeout=20)
    chk(r.status_code == 200, "GET /messages/{maman_id} → 200", f"got {r.status_code} {r.text[:200]}")

    print("\n--- GET /pro/patients again ---")
    r = requests.get(f"{BASE}/pro/patients", headers=H(pro_tok), timeout=20)
    patients2 = r.json() if r.status_code == 200 else []
    p2 = next((x for x in patients2 if x.get("id") == maman_id), None)
    chk(p2 is not None, "Maman still in patients list")
    if p2:
        chk(p2.get("unread_count") == 0, f"unread_count == 0 after read (got {p2.get('unread_count')})")

    # ------------------------------------------------------------------
    # Sort test : produce unread on a patient, and verify ordering
    # We currently have 1 patient with unread=0. Send 1 fresh message maman→pro
    # so that this maman has unread > 0, but if there's only 1 patient we can't compare
    # ------------------------------------------------------------------
    if len(patients2) >= 2:
        print("\n--- Sort test (multiple patients available) ---")
        # Send a fresh message
        requests.post(
            f"{BASE}/messages",
            headers=H(maman_tok),
            json={"to_id": pro_id, "content": "fresh unread"},
            timeout=20,
        )
        r = requests.get(f"{BASE}/pro/patients", headers=H(pro_tok), timeout=20)
        ps = r.json()
        # patient with unread > 0 must be before the ones with 0
        unread_indices = [i for i, x in enumerate(ps) if x.get("unread_count", 0) > 0]
        zero_indices = [i for i, x in enumerate(ps) if x.get("unread_count", 0) == 0]
        if unread_indices and zero_indices:
            chk(max(unread_indices) < min(zero_indices), f"unread patients before zero-unread (unread idx {unread_indices}, zero idx {zero_indices})")
        else:
            print(f"  (sort test inconclusive — unread_indices={unread_indices}, zero_indices={zero_indices})")
        # Mark read again to clean
        requests.get(f"{BASE}/messages/{maman_id}", headers=H(pro_tok), timeout=20)
    else:
        print("\n--- Sort test SKIPPED (only 1 patient) ---")

    # ------------------------------------------------------------------
    # TEST 2 — POST /api/messages with optional attachment
    # ------------------------------------------------------------------
    print("\n=========================================================")
    print("TEST 2 — POST /api/messages with attachment")
    print("=========================================================")

    # 2A — Text only regression
    print("\n--- 2A. Text only ---")
    r = requests.post(
        f"{BASE}/messages",
        headers=H(maman_tok),
        json={"to_id": pro_id, "content": "Hello"},
        timeout=20,
    )
    chk(r.status_code == 200, "2A POST text-only → 200", f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        chk(d.get("content") == "Hello", f"2A response.content == 'Hello' (got {d.get('content')!r})")
        # No attachment fields, or all null
        att = d.get("attachment_base64")
        chk(att is None, f"2A attachment_base64 absent or null (got {att!r})")

    # 2B — Text + image attachment
    print("\n--- 2B. Text + image attachment ---")
    img_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgD//Z"
    body = {
        "to_id": pro_id,
        "content": "Voici ma photo",
        "attachment_base64": img_b64,
        "attachment_name": "photo.jpg",
        "attachment_mime": "image/jpeg",
    }
    r = requests.post(f"{BASE}/messages", headers=H(maman_tok), json=body, timeout=20)
    chk(r.status_code == 200, "2B POST text+image → 200", f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        chk(d.get("attachment_base64") == img_b64, "2B attachment_base64 preserved")
        chk(d.get("attachment_name") == "photo.jpg", f"2B attachment_name == 'photo.jpg' (got {d.get('attachment_name')!r})")
        chk(d.get("attachment_mime") == "image/jpeg", f"2B attachment_mime == 'image/jpeg' (got {d.get('attachment_mime')!r})")
        chk(d.get("content") == "Voici ma photo", f"2B content == 'Voici ma photo' (got {d.get('content')!r})")

    # 2C — Attachment only, empty content
    print("\n--- 2C. Attachment only, empty content ---")
    pdf_b64 = "data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nCvkAgAA//8="
    body = {
        "to_id": pro_id,
        "content": "",
        "attachment_base64": pdf_b64,
        "attachment_name": "document.pdf",
        "attachment_mime": "application/pdf",
    }
    r = requests.post(f"{BASE}/messages", headers=H(maman_tok), json=body, timeout=20)
    chk(r.status_code == 200, "2C POST attachment-only → 200", f"got {r.status_code} {r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        chk(d.get("attachment_base64") == pdf_b64, "2C attachment_base64 preserved (PDF)")
        chk(d.get("attachment_name") == "document.pdf", f"2C attachment_name == 'document.pdf' (got {d.get('attachment_name')!r})")
        chk(d.get("attachment_mime") == "application/pdf", f"2C attachment_mime == 'application/pdf' (got {d.get('attachment_mime')!r})")
        chk(d.get("content") == "", f"2C content empty string (got {d.get('content')!r})")

    # 2D — Invalid: both empty
    print("\n--- 2D. Invalid — both empty ---")
    r = requests.post(
        f"{BASE}/messages",
        headers=H(maman_tok),
        json={"to_id": pro_id, "content": ""},
        timeout=20,
    )
    chk(r.status_code == 400, f"2D POST empty/empty → 400 (got {r.status_code})", f"body={r.text[:200]}")
    if r.status_code == 400:
        try:
            j = r.json()
            detail = (j.get("detail") or "").lower()
            chk("vide" in detail or "empty" in detail, f"2D detail mentions empty (got {j.get('detail')!r})")
        except Exception:
            pass

    # 2E — Verify retrieval
    print("\n--- 2E. GET /messages/{pro_id} (as maman) ---")
    r = requests.get(f"{BASE}/messages/{pro_id}", headers=H(maman_tok), timeout=20)
    chk(r.status_code == 200, "2E GET messages list → 200", f"got {r.status_code} {r.text[:200]}")
    msgs = r.json() if r.status_code == 200 else []
    chk(isinstance(msgs, list), "2E response is a list")
    # find at least one msg with attachment
    with_att = [m for m in msgs if m.get("attachment_base64")]
    chk(len(with_att) >= 2, f"2E at least 2 msgs with attachment present (found {len(with_att)})")
    # Check fields present
    photo_msg = next((m for m in with_att if m.get("attachment_name") == "photo.jpg"), None)
    pdf_msg = next((m for m in with_att if m.get("attachment_name") == "document.pdf"), None)
    chk(photo_msg is not None, "2E retrieved message with attachment_name=photo.jpg")
    chk(pdf_msg is not None, "2E retrieved message with attachment_name=document.pdf")
    if photo_msg:
        chk(photo_msg.get("attachment_mime") == "image/jpeg", f"2E photo msg mime correct (got {photo_msg.get('attachment_mime')!r})")
        chk(bool(photo_msg.get("attachment_base64")), "2E photo msg has base64")
    if pdf_msg:
        chk(pdf_msg.get("attachment_mime") == "application/pdf", f"2E pdf msg mime correct (got {pdf_msg.get('attachment_mime')!r})")
        chk(bool(pdf_msg.get("attachment_base64")), "2E pdf msg has base64")

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------
    total = PASS + FAIL
    print("\n=========================================================")
    print(f"SUMMARY: {PASS}/{total} PASS, {FAIL} FAIL")
    print("=========================================================")
    if FAILS:
        print("FAILURES:")
        for x in FAILS:
            print(f"  - {x}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
