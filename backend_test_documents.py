"""
Test suite for /api/documents endpoints (Mes Documents — cloud storage).
Covers happy path, GDPR isolation, validation, auth and category filtering.
"""
import os
import sys
import json
import time
import uuid
import requests

BASE_URL = "https://cycle-tracker-pro.preview.emergentagent.com/api"

MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"
PRO_EMAIL = "pro.test@alomaman.dev"
PRO_PASSWORD = "Test1234!"

results = []
PASS = 0
FAIL = 0


def record(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        results.append(f"✅ {name}")
    else:
        FAIL += 1
        results.append(f"❌ {name} — {detail}")
    print(results[-1])


def login(email, password):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"Login failed for {email}: {r.status_code} {r.text}")
    return r.json()["token"]


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    print("=" * 70)
    print("Mes Documents — backend tests")
    print(f"BASE_URL = {BASE_URL}")
    print("=" * 70)

    # ---- Login Maman & Pro ----
    try:
        maman_token = login(MAMAN_EMAIL, MAMAN_PASSWORD)
        record("Login maman.test", True)
    except Exception as e:
        record("Login maman.test", False, str(e))
        return

    try:
        pro_token = login(PRO_EMAIL, PRO_PASSWORD)
        record("Login pro.test", True)
    except Exception as e:
        record("Login pro.test", False, str(e))
        return

    # ===================================================================
    # Scenario 9: Auth required — without Bearer → 401
    # ===================================================================
    print("\n--- 9. Auth required ---")
    for method, path in [("GET", "/documents"), ("POST", "/documents"),
                         ("GET", "/documents/fake-id"), ("DELETE", "/documents/fake-id")]:
        r = requests.request(method, f"{BASE_URL}{path}",
                             json={"titre": "x", "file_base64": "y"} if method == "POST" else None,
                             timeout=20)
        record(f"{method} {path} sans Bearer → 401", r.status_code == 401,
               f"got {r.status_code} {r.text[:120]}")

    # ===================================================================
    # Scenario 1: Upload fake PDF
    # ===================================================================
    print("\n--- 1. Upload fake PDF (happy path) ---")
    payload = {
        "titre": "Test Échographie 22 SA",
        "categorie": "echographie",
        "date": "2026-05-01",
        "notes": "Contrôle morphologique",
        "file_base64": "JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDw+PgplbmRvYmoKMSAwIG9iago8PD4+CmVuZG9iag==",
        "file_name": "echo_22sa.pdf",
        "mime_type": "application/pdf"
    }
    r = requests.post(f"{BASE_URL}/documents", json=payload, headers=headers(maman_token), timeout=20)
    record("POST /documents pdf → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    pdf_doc_id = None
    if r.status_code == 200:
        body = r.json()
        pdf_doc_id = body.get("id")
        for k in ("id", "titre", "categorie", "date", "mime_type", "size_bytes"):
            record(f"  response has '{k}'", k in body, f"keys={list(body.keys())}")
        record("  response NO file_base64 (bandwidth)", "file_base64" not in body, "leaked base64 in POST response")
        record("  titre matches", body.get("titre") == "Test Échographie 22 SA")
        record("  categorie='echographie'", body.get("categorie") == "echographie")
        record("  mime_type='application/pdf'", body.get("mime_type") == "application/pdf")
        record("  size_bytes > 0", isinstance(body.get("size_bytes"), int) and body["size_bytes"] > 0)

    # ===================================================================
    # Scenario 2: Upload an image
    # ===================================================================
    print("\n--- 2. Upload image (jpeg) ---")
    # Tiny valid JPEG (1x1 pixel red)
    tiny_jpeg = (
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/"
        "2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
    )
    payload2 = {
        "titre": "Test Bilan Sanguin",
        "categorie": "analyse",
        "date": "2026-05-02",
        "file_base64": tiny_jpeg,
        "file_name": "bilan.jpg",
        "mime_type": "image/jpeg"
    }
    r = requests.post(f"{BASE_URL}/documents", json=payload2, headers=headers(maman_token), timeout=20)
    record("POST /documents jpeg → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    image_doc_id = None
    if r.status_code == 200:
        b = r.json()
        image_doc_id = b.get("id")
        record("  mime_type='image/jpeg'", b.get("mime_type") == "image/jpeg")
        record("  categorie='analyse'", b.get("categorie") == "analyse")

    # ===================================================================
    # Scenario 3: List documents
    # ===================================================================
    print("\n--- 3. List documents ---")
    r = requests.get(f"{BASE_URL}/documents", headers=headers(maman_token), timeout=20)
    record("GET /documents → 200", r.status_code == 200, f"{r.status_code}")
    docs_list = []
    if r.status_code == 200:
        docs_list = r.json()
        record("  is array", isinstance(docs_list, list), f"type={type(docs_list)}")
        ids_in_list = {d.get("id") for d in docs_list}
        record("  pdf doc present", pdf_doc_id in ids_in_list)
        record("  image doc present", image_doc_id in ids_in_list)
        # Check no base64
        no_base64 = all("file_base64" not in d for d in docs_list)
        record("  no file_base64 in list", no_base64, "list leaks base64 content")
        # Check sorted by created_at desc — first item should be the most recent (image_doc_id since uploaded last)
        if len(docs_list) >= 2:
            # Find first 2 docs we just uploaded
            our_docs = [d for d in docs_list if d.get("id") in (pdf_doc_id, image_doc_id)]
            if len(our_docs) >= 2:
                record("  sorted by created_at desc",
                       our_docs[0]["created_at"] >= our_docs[1]["created_at"],
                       f"{our_docs[0]['created_at']} vs {our_docs[1]['created_at']}")

    # ===================================================================
    # Scenario 4: Filter by category
    # ===================================================================
    print("\n--- 4. Filter by category=echographie ---")
    r = requests.get(f"{BASE_URL}/documents?category=echographie",
                     headers=headers(maman_token), timeout=20)
    record("GET /documents?category=echographie → 200", r.status_code == 200, f"{r.status_code}")
    if r.status_code == 200:
        items = r.json()
        record("  is array", isinstance(items, list))
        all_echo = all(d.get("categorie") == "echographie" for d in items)
        record("  all items have categorie='echographie'", all_echo)
        record("  pdf doc included", pdf_doc_id in {d.get("id") for d in items})
        record("  image doc NOT included", image_doc_id not in {d.get("id") for d in items})

    # ===================================================================
    # Scenario 5: Get full document
    # ===================================================================
    print("\n--- 5. Get full document (with file_base64) ---")
    if pdf_doc_id:
        r = requests.get(f"{BASE_URL}/documents/{pdf_doc_id}",
                         headers=headers(maman_token), timeout=20)
        record(f"GET /documents/{pdf_doc_id[:8]}... → 200", r.status_code == 200,
               f"{r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            b = r.json()
            record("  has file_base64", "file_base64" in b and b["file_base64"], "missing/empty base64")
            record("  base64 matches input",
                   b.get("file_base64") == payload["file_base64"],
                   "stored base64 differs")
            record("  has titre", b.get("titre") == "Test Échographie 22 SA")
            record("  has notes", b.get("notes") == "Contrôle morphologique")

    # ===================================================================
    # Scenario 6: GDPR isolation — pro tries to access maman's doc
    # ===================================================================
    print("\n--- 6. GDPR isolation ---")
    if pdf_doc_id:
        r = requests.get(f"{BASE_URL}/documents/{pdf_doc_id}",
                         headers=headers(pro_token), timeout=20)
        record("Pro GET maman's doc → 404", r.status_code == 404,
               f"{r.status_code} {r.text[:120]}")

        r = requests.delete(f"{BASE_URL}/documents/{pdf_doc_id}",
                            headers=headers(pro_token), timeout=20)
        record("Pro DELETE maman's doc → 404", r.status_code == 404,
               f"{r.status_code} {r.text[:120]}")

        # Verify maman's doc still exists after pro's failed delete attempt
        r = requests.get(f"{BASE_URL}/documents/{pdf_doc_id}",
                         headers=headers(maman_token), timeout=20)
        record("  maman's doc still exists", r.status_code == 200,
               f"got {r.status_code} after pro tried to delete")

        # GDPR — Pro's own list does NOT contain maman's doc id
        r = requests.get(f"{BASE_URL}/documents", headers=headers(pro_token), timeout=20)
        if r.status_code == 200:
            pro_ids = {d.get("id") for d in r.json()}
            record("  Pro's list excludes maman's docs",
                   pdf_doc_id not in pro_ids and image_doc_id not in pro_ids,
                   f"pro list={pro_ids}")

    # ===================================================================
    # Scenario 7: Validation errors
    # ===================================================================
    print("\n--- 7. Validation errors ---")
    # 7a — missing titre
    r = requests.post(f"{BASE_URL}/documents",
                      json={"file_base64": "abc"},
                      headers=headers(maman_token), timeout=20)
    record("POST sans titre → 400 'Titre requis'",
           r.status_code == 400 and "titre" in r.text.lower(),
           f"{r.status_code} {r.text[:200]}")

    # 7b — missing file_base64
    r = requests.post(f"{BASE_URL}/documents",
                      json={"titre": "Document sans fichier"},
                      headers=headers(maman_token), timeout=20)
    record("POST sans file_base64 → 400 'Fichier manquant'",
           r.status_code == 400 and "fichier" in r.text.lower(),
           f"{r.status_code} {r.text[:200]}")

    # 7c — file_base64 too large (>12MB)
    big = "A" * (12_000_001)
    r = requests.post(f"{BASE_URL}/documents",
                      json={"titre": "Trop gros", "file_base64": big},
                      headers=headers(maman_token), timeout=60)
    record("POST file_base64 >12MB → 413 'Fichier trop volumineux'",
           r.status_code == 413,
           f"{r.status_code} {r.text[:200]}")
    del big  # free memory

    # 7d — invalid category should default to "autre"
    r = requests.post(f"{BASE_URL}/documents",
                      json={
                          "titre": "Test catégorie inconnue",
                          "categorie": "wibble_invalid",
                          "file_base64": "JVBERi0=",
                          "file_name": "x.pdf",
                          "mime_type": "application/pdf"
                      },
                      headers=headers(maman_token), timeout=20)
    record("POST invalid category → 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
    invalid_cat_doc_id = None
    if r.status_code == 200:
        b = r.json()
        invalid_cat_doc_id = b.get("id")
        record("  default categorie='autre' silently", b.get("categorie") == "autre",
               f"got categorie={b.get('categorie')}")

    # ===================================================================
    # Scenario 8: Delete (own)
    # ===================================================================
    print("\n--- 8. DELETE (own) ---")
    if image_doc_id:
        r = requests.delete(f"{BASE_URL}/documents/{image_doc_id}",
                            headers=headers(maman_token), timeout=20)
        record(f"DELETE own image doc → 200", r.status_code == 200,
               f"{r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            body = r.json()
            record("  ok=true", body.get("ok") is True, f"body={body}")
        # Then GET → 404
        r = requests.get(f"{BASE_URL}/documents/{image_doc_id}",
                         headers=headers(maman_token), timeout=20)
        record("GET deleted doc → 404", r.status_code == 404,
               f"{r.status_code} {r.text[:200]}")

    # Cleanup remaining docs
    print("\n--- CLEANUP ---")
    for did in (pdf_doc_id, invalid_cat_doc_id):
        if did:
            try:
                requests.delete(f"{BASE_URL}/documents/{did}",
                                headers=headers(maman_token), timeout=20)
            except Exception:
                pass

    # ===================================================================
    # Summary
    # ===================================================================
    print("\n" + "=" * 70)
    print(f"RESULTS: {PASS} PASS / {FAIL} FAIL  (total {PASS + FAIL})")
    print("=" * 70)
    failures = [r for r in results if r.startswith("❌")]
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f)
        sys.exit(1)


if __name__ == "__main__":
    main()
