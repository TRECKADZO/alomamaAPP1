#!/usr/bin/env python3
"""
Extraction aggressive V2 - Combine tables ET text extraction pour maximum de coverage.
"""
import pdfplumber, json, re
from pathlib import Path

PDF = Path("/tmp/edepps.pdf")
OUT = Path("/app/backend/data/etablissements_ci_full.json")

# Patterns pour détecter les catégories dans le nom
CAT_PATTERNS = [
    (r'\bMATERNITE?\b', "Maternité"),
    (r'\b(PHARMACIE|OFFICINE)\b', "Pharmacie"),
    (r'\b(OPTIQUE|OPTIC|OPTICIEN|LUNET)', "Cabinet d'Opticien-Lunettier"),
    (r'\bLABORATOIRE\b', "Laboratoire"),
    (r'\bPSYCHIATRI', "Centre Médical Spécialisé en Psychiatrie"),
    (r'\bCLINIQUE\b', "Clinique Médicale"),
    (r'\bH[ÔO]PITAL\b', "Hôpital Privé"),
    (r'\bCENTRE M[EÉ]DIC', "Centre Médical"),
    (r'\bCABINET M[EÉ]DIC', "Cabinet Médical"),
    (r'\b(CENTRE|CABINET) DE SOINS INFIRM|\bINFIRMERIE\b|CABINET (D.)?INFIRMIER', "Centre de Soins Infirmiers"),
    (r'\bSAGE.FEMME\b', "Cabinet de Sage-Femme"),
    (r'\bACUPUNCT|KIN[EÉ]SIT|PHYSIO', "Cabinet Paramédical"),
    (r'\bDENTAIRE\b', "Cabinet Dentaire"),
    (r'\b(IMAGERIE|SCANNER|RADIOLOG|ECHOGRAPHIE)', "Cabinet Imagerie"),
]
SPEC_MAP = {
    "Maternité": ["Maternité"],
    "Pharmacie": ["Pharmacie"],
    "Cabinet d'Opticien-Lunettier": ["Optique"],
    "Laboratoire": ["Laboratoire"],
    "Centre Médical Spécialisé en Psychiatrie": ["Psychiatrie"],
    "Clinique Médicale": ["Maternité", "Pédiatrie", "Gynécologie"],
    "Hôpital Privé": ["Maternité", "Pédiatrie", "Gynécologie"],
    "Centre Médical": ["Pédiatrie", "Gynécologie"],
    "Cabinet Médical": ["Pédiatrie"],
    "Centre de Soins Infirmiers": ["Soins infirmiers"],
    "Cabinet de Sage-Femme": ["Maternité"],
    "Cabinet Paramédical": ["Kinésithérapie"],
    "Cabinet Dentaire": ["Dentaire"],
    "Cabinet Imagerie": ["Imagerie"],
}

def _clean(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def infer_cat(nom):
    up = nom.upper()
    for pat, cat in CAT_PATTERNS:
        if re.search(pat, up):
            return cat, SPEC_MAP.get(cat, [])
    return "Autre", []

# Marqueurs typiques pour identifier une ligne d'établissement
NOM_KEYWORDS = re.compile(
    r"(?:CABINET|CENTRE|CLINIQUE|MATERNITE|HOPITAL|H[ÔO]PITAL|PHARMACIE|OFFICINE|OPTIQUE|OPTIC|"
    r"LABORATOIRE|LUNETTERIE|INFIRMERIE|OPTICIEN|CENTRE-MEDICAL|POLYCLINIQUE|ETABLISSEMENT|"
    r"MAISON|HOME|MEDIC|SANTE|SANTÉ|PROVIDENCE|GRACE|BETHESDA|SAINT|SAINTE|MEDICAL)",
    re.IGNORECASE
)

def extract_from_text():
    """Extraction par patterns sur le texte brut de chaque page."""
    all_rows = []
    with pdfplumber.open(PDF) as pdf:
        for pi, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            # Split par ligne
            for line in text.split("\n"):
                line = _clean(line)
                # Détecter les lignes qui commencent par un numéro (ex: "1 CABINET ...")
                m = re.match(r"^(\d+)\s+(.+)", line)
                if not m: continue
                num, rest = m.groups()
                num = int(num)
                # Chercher si le nom contient un mot-clé d'établissement
                if not NOM_KEYWORDS.search(rest): continue
                # Éliminer les lignes trop courtes ou évidentes non-établissement
                if len(rest) < 8: continue
                # Le "reste" peut contenir : NOM [+] catégorie/région/etc. Séparer par doubles espaces ou tabs.
                # Ici on prend le nom brut - la catégorie sera inférée depuis le nom.
                all_rows.append({"num": num, "raw": rest})
    return all_rows

def parse_establishment(raw_line):
    """Parse une ligne brute pour extraire nom, région/commune si présents."""
    # Chercher région (ex: "Abidjan 1", "Abengourou", noms de région CI)
    regions_ci = ["Abidjan 1", "Abidjan 2", "Abidjan", "Yamoussoukro", "Bagoué", "Cavally", "Goh",
                  "Gontougo", "Hambol", "Haut-Sassandra", "Indénié-Djuablin", "Iffou", "Kabadougou",
                  "Lôh-Djiboua", "Marahoué", "Moronou", "N'Zi", "Nawa", "Poro", "San-Pédro",
                  "Sud-Comoé", "Tchologo", "Tonkpi", "Worodougou", "Bounkani", "Bafing", "Béré",
                  "Belier", "Grands Ponts", "Guémon", "Sassandra-Marahoué", "Agnéby-Tiassa", "La Mé"]
    region = ""
    for r in regions_ci:
        if r in raw_line:
            region = r
            # Enlever la région du nom
            raw_line = raw_line.replace(r, "").strip()
            break
    nom = raw_line[:120].strip(" -,;")  # max 120 chars pour nom
    return nom, region

def main():
    print("=== Extraction agressive V2 ===")
    rows = extract_from_text()
    print(f"Raw text extraction: {len(rows)} lignes")

    # Parser
    items = []
    seen_names = set()
    for r in rows:
        nom, region = parse_establishment(r["raw"])
        if not nom or len(nom) < 5: continue
        key = nom.upper()[:80]
        if key in seen_names: continue
        seen_names.add(key)
        cat, specs = infer_cat(nom)
        items.append({
            "nom": nom,
            "categorie": cat,
            "region": region,
            "district_sanitaire": "",
            "commune": region if region else "",  # fallback
            "adresse": "",
            "responsable": "",
            "date_autorisation": "",
            "specialites_metier": specs,
        })

    print(f"Uniques: {len(items)}")
    print(f"Sample:")
    for e in items[:5]:
        print(f"  - [{e['categorie']}] {e['nom'][:60]} · region={e['region'] or '?'}")

    OUT.write_text(json.dumps({
        "meta": {"source": "E-DEPPS MSP CI Juin 2026", "parsed_at": "2026-07-14", "count": len(items), "method": "aggressive_text_v2"},
        "etablissements": items,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Écrit {len(items)} établissements dans {OUT}")

if __name__ == "__main__":
    main()
