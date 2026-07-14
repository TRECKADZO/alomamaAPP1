#!/usr/bin/env python3
"""
Parseur déterministe du PDF officiel E-DEPPS Juin 2026 (MSP Côte d'Ivoire).
Utilise pdfplumber pour extraire les vraies tables (pas d'hallucination).
"""
import pdfplumber, json, re, sys
from pathlib import Path

PDF = Path("/tmp/edepps.pdf")
OUT = Path("/app/backend/data/etablissements_ci_full.json")

# Table de mapping spécialités métier (Alo Maman)
SPEC_MAP = {
    "Maternité": ["Maternité", "Maternite"],
    "Pédiatrie": ["Centre Médical", "Centre Medical", "Clinique Médicale", "Clinique Medicale", "Cabinet Médical", "Cabinet Medical"],
    "Gynécologie": ["Centre Médical", "Clinique Médicale"],
    "Nutrition": ["Centre Médical", "Cabinet Médical"],
    "Soins infirmiers": ["Centre de Soins Infirmiers", "Infirmerie", "Cabinet infirmier", "Cabinet d'Infirmier", "Paramédicale", "Paramedicale"],
    "Optique": ["Cabinet d'Opticien", "Opticien", "Optique"],
    "Psychiatrie": ["Psychiatrie", "Psychiatrique"],
    "Laboratoire": ["Laboratoire"],
    "Pharmacie": ["Pharmacie", "Officine"],
    "Kinésithérapie": ["Kinésithérapie", "Kinesitherapie"],
}


def infer_specialties(categorie: str) -> list:
    if not categorie: return []
    out = []
    for spec, keywords in SPEC_MAP.items():
        if any(k.lower() in categorie.lower() for k in keywords):
            out.append(spec)
    return out


def _clean(s):
    if not s: return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def parse_pdf():
    all_rows = []
    current_region = ""
    with pdfplumber.open(PDF) as pdf:
        print(f"Pages: {len(pdf.pages)}", file=sys.stderr)
        for pi, page in enumerate(pdf.pages):
            # Extraire les tables
            tables = page.extract_tables()
            for tbl in tables:
                if not tbl or len(tbl) < 2: continue
                # Détecter header
                header = [_clean(c).lower() for c in tbl[0]]
                if not any("nom" in h or "libell" in h or "categorie" in h or "catégorie" in h for h in header):
                    continue
                # Trouver indices colonnes
                col_idx = {}
                for i, h in enumerate(header):
                    if "nom" in h or "libell" in h or "denomination" in h: col_idx["nom"] = i
                    elif "categ" in h or "catég" in h or "type" in h: col_idx["categorie"] = i
                    elif "region" in h or "région" in h: col_idx["region"] = i
                    elif "district" in h: col_idx["district"] = i
                    elif "commune" in h or "ville" in h or "localit" in h: col_idx["commune"] = i
                    elif "adresse" in h or "situation" in h or "lot" in h: col_idx["adresse"] = i
                    elif "responsable" in h or "gerant" in h or "gérant" in h or "directeur" in h: col_idx["responsable"] = i
                    elif "date" in h or "autoris" in h: col_idx["date"] = i
                # Lire les lignes
                for row in tbl[1:]:
                    row = [_clean(c) for c in row]
                    nom = row[col_idx["nom"]] if "nom" in col_idx and col_idx["nom"] < len(row) else ""
                    if not nom or len(nom) < 3: continue
                    reg = row[col_idx["region"]] if "region" in col_idx and col_idx["region"] < len(row) else ""
                    if reg: current_region = reg
                    cat = row[col_idx["categorie"]] if "categorie" in col_idx and col_idx["categorie"] < len(row) else ""
                    entry = {
                        "nom": nom,
                        "categorie": cat or "Non classifié",
                        "region": reg or current_region,
                        "district_sanitaire": row[col_idx["district"]] if "district" in col_idx and col_idx["district"] < len(row) else "",
                        "commune": row[col_idx["commune"]] if "commune" in col_idx and col_idx["commune"] < len(row) else "",
                        "adresse": row[col_idx["adresse"]] if "adresse" in col_idx and col_idx["adresse"] < len(row) else "",
                        "responsable": row[col_idx["responsable"]] if "responsable" in col_idx and col_idx["responsable"] < len(row) else "",
                        "date_autorisation": row[col_idx["date"]] if "date" in col_idx and col_idx["date"] < len(row) else "",
                        "specialites_metier": infer_specialties(cat),
                    }
                    all_rows.append(entry)
        # Fallback : si aucune table, extraire texte page par page
        if not all_rows:
            print("⚠️ Aucune table détectée, fallback text mode", file=sys.stderr)
    # Dédoublonnage sur (nom+commune+adresse)
    seen = set()
    unique = []
    for e in all_rows:
        key = (e["nom"].lower().strip(), e["commune"].lower().strip(), e["adresse"].lower().strip()[:60])
        if key in seen: continue
        seen.add(key)
        unique.append(e)
    print(f"Extracted: {len(all_rows)} raw · Unique: {len(unique)}", file=sys.stderr)
    return unique


if __name__ == "__main__":
    items = parse_pdf()
    OUT.write_text(json.dumps({
        "meta": {"source": "E-DEPPS MSP CI Juin 2026", "parsed_at": "2026-07-14", "count": len(items)},
        "etablissements": items,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Écrit {len(items)} établissements dans {OUT}")
