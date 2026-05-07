"""Supplemental check: add a vaccin to Test 1 and verify Composition.section + everything Immunization."""
import requests, json

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
CHILD_ID = "e41c8152-305e-4014-a4f8-4459d955a6cf"

def login(e, p):
    r = requests.post(f"{BASE}/auth/login", json={"email": e, "password": p}, timeout=15); r.raise_for_status()
    return r.json()["token"]

tok = login("maman.test@alomaman.dev", "Test1234!")
H = {"Authorization": f"Bearer {tok}"}

# Add a vaccin
r = requests.post(f"{BASE}/enfants/{CHILD_ID}/vaccins",
                  json={"nom": "BCG", "date": "2026-02-04", "fait": True},
                  headers=H, timeout=15)
print(f"add vaccin: {r.status_code}")

# Composition
r = requests.get(f"{BASE}/fhir/Composition/{CHILD_ID}", headers=H, timeout=15)
j = r.json()
section_titles = [s.get("title") for s in (j.get("section") or [])]
print(f"Composition sections: {section_titles}")
vacc_present = any("Vaccination" in (t or "") for t in section_titles)
print(f"  Vaccinations section present: {vacc_present}")

# Everything
r = requests.get(f"{BASE}/fhir/everything/{CHILD_ID}", headers=H, timeout=15)
j = r.json()
types = [(e.get("resource") or {}).get("resourceType") for e in (j.get("entry") or [])]
print(f"everything types: {types}")
print(f"  Immunization present: {'Immunization' in types}")

# Immunization Bundle subject={enfant}
r = requests.get(f"{BASE}/fhir/Immunization", params={"subject": CHILD_ID}, headers=H, timeout=15)
j = r.json()
entries = j.get("entry") or []
print(f"Immunization bundle entries={len(entries)}")
if entries:
    res = entries[0]["resource"]
    print(f"  sample: status={res.get('status')} | vaccineCode.coding={res.get('vaccineCode',{}).get('coding')}")
    print(f"  patient.reference={res.get('patient', {}).get('reference')}")
