"""
Parseur XLSX officiel E-DEPPS — répertoire des établissements sanitaires privés
autorisés en Côte d'Ivoire.

Chaque établissement occupe plusieurs lignes dans la feuille (issue d'un PDF wrap).
Marqueur de fin : la colonne A (N°) porte un entier séquentiel sur UNE des lignes
du bloc. On accumule toutes les cellules jusqu'à voir ce N°, puis on flush le bloc.

Sortie : /app/backend/data/etablissements_ci_xlsx.json
"""
from pathlib import Path
import json
import re
import unicodedata
import openpyxl

SRC = Path("/tmp/xlsx/etabs.xlsx")
OUT = Path("/app/backend/data/etablissements_ci_xlsx.json")


NIVEAU_TO_CATEGORIE = {
    "cabinet d'opticien-lunetier": "Cabinet d'Opticien-Lunetier",
    "cabinet dentaire": "Cabinet Dentaire",
    "cabinet médical": "Cabinet Médical",
    "cabinet paramédical": "Cabinet Paramédical",
    "cabinet de kinésithérapie": "Cabinet de Kinésithérapie",
    "cabinet de radiologie": "Centre d'Imagerie Médicale",
    "cabinet d'imagerie": "Centre d'Imagerie Médicale",
    "cabinet de soins infirmiers": "Centre de Soins Infirmiers",
    "centre de conseil médical et de soins ambulatoire": "Centre Médical",
    "centre médical spécialisé en psychiatrie": "Centre Médical Spécialisé en Psychiatrie",
    "centre médical spécialisé": "Centre Médical Spécialisé",
    "centre médical": "Centre Médical",
    "centre de kinésithérapie": "Centre de Kinésithérapie",
    "centre de soins infirmiers": "Centre de Soins Infirmiers",
    "centre d'imagerie médicale": "Centre d'Imagerie Médicale",
    "centre de diagnostic": "Centre d'Imagerie Médicale",
    "centre d'hémodialyse": "Centre d'Hémodialyse",
    "clinique médicale": "Clinique Médicale",
    "clinique chirurgicale": "Clinique Chirurgicale",
    "clinique polyvalente": "Polyclinique",
    "polyclinique": "Polyclinique",
    "maternité": "Maternité",
    "hôpital": "Hôpital",
    "laboratoire": "Laboratoire",
    "officine": "Officine",
    "pharmacie": "Officine",
    "cabinet d'acupuncture": "Cabinet Médical",
}


def _strip(v):
    return (str(v).strip() if v is not None else "")


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def infer_categorie(niveau: str) -> str:
    n = _norm(niveau)
    for key, cat in NIVEAU_TO_CATEGORIE.items():
        if _norm(key) in n:
            return cat
    if "polyclin" in n:
        return "Polyclinique"
    if "clinique" in n:
        return "Clinique Médicale"
    if "maternit" in n:
        return "Maternité"
    if "hopital" in n or "hôpital" in n.lower():
        return "Hôpital"
    if "laboratoire" in n:
        return "Laboratoire"
    if "centre" in n:
        return "Centre Médical"
    if "cabinet" in n:
        return "Cabinet Médical"
    return "Non classifié"


def infer_specialites(niveau: str, denomination: str) -> list:
    t = _norm(niveau + " " + denomination)
    specs = []
    mapping = {
        "Pédiatrie": ["pediatr", "enfant"],
        "Maternité": ["maternit", "obstetr", "gyneco", "sage-femme", "sage femme", "accouche"],
        "Dentaire": ["dentaire", "orthodont", "stomato"],
        "Psychiatrie": ["psychiatr", "sante mentale"],
        "Ophtalmologie": ["optic", "ophtalmo", "lunetier", "vision"],
        "Kinésithérapie": ["kinesither", "readapt"],
        "Radiologie / Imagerie": ["imagerie", "radiolog", "echograph", "scanner"],
        "Laboratoire": ["laboratoire", "analyses biolog"],
        "Soins infirmiers": ["soins infirm"],
        "Cardiologie": ["cardiolog"],
        "Dermatologie": ["dermato"],
        "Urologie": ["urolog"],
        "Chirurgie": ["chirurg"],
        "Médecine générale": ["medecine generale", "medical general"],
        "Hôpital / Plateau technique": ["hopital", "polyclin"],
        "Acupuncture / Médecine douce": ["acupunctur", "alternat"],
        "Pharmacie": ["officine", "pharmacie"],
        "Hémodialyse": ["hemodialyse"],
    }
    for label, keywords in mapping.items():
        if any(k in t for k in keywords):
            specs.append(label)
    return specs


def normalize_region(r: str) -> str:
    """Uniformise 'ABIDJAN 1' / 'Abidjan 1' / 'Abidjan1' → 'Abidjan 1'."""
    r = (r or "").strip()
    if not r:
        return ""
    # Titlecase spéciale
    parts = r.split()
    fixed = []
    for p in parts:
        if p.isdigit():
            fixed.append(p)
        elif p.upper() in ("N'ZI", "GBEKE", "GBÊKÊ", "GOH", "GÔH", "GBOKLE"):
            fixed.append(p.title())
        else:
            fixed.append(p.title())
    out = " ".join(fixed)
    # normalisation manuelle
    out = out.replace("Gbeke", "Gbêkê").replace("Goh", "Gôh")
    return out


def parse_commune_from_addr(loc: str) -> str:
    if not loc:
        return ""
    m = re.search(r"commune\s+d[eu']\s*([A-Za-zÀ-ÿ' \-]+?)(?:,|$|\s+quartier)", loc, re.IGNORECASE)
    if m:
        return m.group(1).strip().rstrip(",")
    m = re.search(r"commune\s+du\s+([A-Za-zÀ-ÿ' \-]+?)(?:,|$|\s+quartier)", loc, re.IGNORECASE)
    if m:
        return m.group(1).strip().rstrip(",")
    # "à Yamoussoukro, quartier ..." ou "Bocanda, quartier..."
    m = re.match(r"^\s*([A-Za-zÀ-ÿ']{3,}?),\s*(?:quartier|secteur|route|derrière|face|zone)", loc, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def parse():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["Sheet1"]

    current_region_header = ""
    results = []
    block = {
        "num": None,
        "nature": [], "niveau": [], "deno": [], "region": [], "district": [],
        "loc": [], "arrete": [],
    }

    def reset():
        return {
            "num": None,
            "nature": [], "niveau": [], "deno": [], "region": [], "district": [],
            "loc": [], "arrete": [],
        }

    def flush(b):
        if not b["num"] or not b["deno"]:
            return
        nom = " ".join(b["deno"]).strip()
        nom = re.sub(r"\s+", " ", nom)
        if len(nom) < 3:
            return
        # Skip headers résiduels
        if _norm(nom) in {"denomination", "region sanitaire", "district sanitaire"}:
            return

        loc = re.sub(r"\s+", " ", " ".join(b["loc"]).strip())
        arr_raw = re.sub(r"\s+", " ", " ".join(b["arrete"]).strip())
        niveau = re.sub(r"\s+", " ", " ".join(b["niveau"]).strip())
        nature = re.sub(r"\s+", " ", " ".join(b["nature"]).strip())
        region = normalize_region((b["region"][0] if b["region"] else "") or current_region_header)
        district = re.sub(r"\s+", " ", " ".join(b["district"]).strip())

        # Nettoyer l'arrêté ("ARRETE N° XXXX/... S DU DATE")
        arr = arr_raw
        m = re.search(r"(ARRETE\s+N[°\s]*\d+[/\w\-]*(?:\s+S)?\s+DU\s+[\d\w\sÉÛÀÔ]+?\d{4})", arr_raw, re.IGNORECASE)
        if m:
            arr = m.group(1).strip()

        results.append({
            "nom": nom,
            "categorie": infer_categorie(niveau),
            "nature": nature,
            "niveau_intervention": niveau,
            "region": region,
            "district_sanitaire": district,
            "commune": parse_commune_from_addr(loc),
            "adresse": loc,
            "responsable": "",
            "date_autorisation": arr,
            "specialites_metier": infer_specialites(niveau, nom),
        })

    NATURE_TOKENS = {"paramedicale", "medicale", "medecine", "medico-sociale", "medico sociale"}
    ARRETE_RE = re.compile(r"(?:ARRETE\s+N|\d+/MSHPCMU|/DGS/|/DEPP|/DEPS|S\s+DU\s+\d)", re.IGNORECASE)
    DATE_RE = re.compile(r"(?:S\s+DU|du\s+\d{1,2}\s+\w+\s+\d{4}|^\d{1,2}\s+(?:JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|AOÛT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE|DÉCEMBRE)\s+\d{4}$)", re.IGNORECASE)
    ADDR_TOKENS = ("commune de", "commune d'", "commune d’", "commune du", "quartier",
                   "secteur", "ilot", "îlot", "ilôt", " lot ", "carrefour", "boulevard",
                   "avenue", "route", "derrière", "face", "immeuble", "cité", "village")

    def looks_like_arrete(v: str) -> bool:
        if not v: return False
        return bool(ARRETE_RE.search(v) or DATE_RE.search(v))

    def looks_like_addr(v: str) -> bool:
        if not v: return False
        vn = _norm(v)
        return any(t in vn for t in ADDR_TOKENS)

    def route_cell(v: str, default_kind: str, block):
        """Ajoute la cellule dans le bon buffer, en corrigeant les décalages."""
        if not v: return
        if looks_like_arrete(v):
            block["arrete"].append(v)
        elif looks_like_addr(v):
            block["loc"].append(v)
        else:
            block[default_kind].append(v)

    for row in ws.iter_rows(values_only=True):
        raw = [_strip(row[i]) if i < len(row) else "" for i in range(10)]
        # Header "Région : XXX"
        for c in row:
            s = _strip(c)
            m = re.match(r"^R[ée]gion\s*:\s*(.+)$", s, re.IGNORECASE)
            if m:
                current_region_header = m.group(1).strip()
                break

        # Détecter décalage : col[0] contient NATURE ou NIVEAU au lieu de N°
        shift = 0
        if raw[0] and _norm(raw[0]) in NATURE_TOKENS:
            shift = -1

        def get(i):
            j = i + shift
            return raw[j] if 0 <= j < len(raw) else ""

        num = get(0)
        nature = get(1)
        niveau = get(2)
        deno = get(3)
        region_col = get(4)
        district_col = get(5)
        loc_col = get(6)
        arr_col = get(7)
        arr_col2 = get(8)

        # Ignorer les lignes d'en-tête
        if _norm(deno) == "denomination" and _norm(nature) == "nature":
            continue

        # Corriger : si deno ressemble à un nom de région, la déplacer
        if deno and _norm(deno) in {"abidjan 1", "abidjan 2", "abidjan1", "abidjan2"}:
            if not region_col:
                region_col = deno
            deno = ""

        # Ajouter dans les buffers, en routant les cellules par contenu
        if nature: route_cell(nature, "nature", block)
        if niveau: route_cell(niveau, "niveau", block)
        if deno: route_cell(deno, "deno", block)
        if region_col: route_cell(region_col, "region", block)
        if district_col: route_cell(district_col, "district", block)
        if loc_col: route_cell(loc_col, "loc", block)
        if arr_col: route_cell(arr_col, "arrete", block)
        if arr_col2 and arr_col2 != arr_col: route_cell(arr_col2, "arrete", block)

        # Fin de bloc dès qu'un N° est vu
        if num and re.match(r"^\d+$", num):
            block["num"] = int(num)
            flush(block)
            block = reset()

    # dernier bloc
    if block.get("num"):
        flush(block)

    # Dédup par (nom_normalisé, district_normalisé)
    seen = set()
    unique = []
    for e in results:
        key = (_norm(e["nom"]), _norm(e.get("district_sanitaire", "")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)

    OUT.parent.mkdir(exist_ok=True, parents=True)
    OUT.write_text(json.dumps({
        "meta": {"source": "E-DEPPS MSP CI (Excel officiel)", "count": len(unique)},
        "etablissements": unique,
    }, ensure_ascii=False, indent=2))
    print(f"OK — {len(unique)} établissements parsés (dédupliqués) → {OUT}")

    from collections import Counter
    regs = Counter(e.get("region") or "?" for e in unique)
    cats = Counter(e.get("categorie") or "?" for e in unique)
    print("\nRégions (top 15):")
    for r, n in regs.most_common(15):
        print(f"  {r:30s} {n:4d}")
    print("\nCatégories (top 15):")
    for c, n in cats.most_common(15):
        print(f"  {c:38s} {n:4d}")
    mat = sum(1 for e in unique if "Maternité" in e["specialites_metier"])
    ped = sum(1 for e in unique if "Pédiatrie" in e["specialites_metier"])
    print(f"\nCouverture santé maternelle : {mat} Maternités · {ped} Pédiatries")


if __name__ == "__main__":
    parse()
