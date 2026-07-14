"""
Parseur XLSX E-DEPPS v2 — objectif 100% de couverture (1676 établissements).

Approche multi-passes robuste :
  Passe 1 : Localiser TOUS les N° d'ordre (col A ou col B en cas de décalage)
           + capturer le header "Région : XXX" contextuel de chaque N°
  Passe 2 : Pour chaque N°, extraire le bloc de lignes qui le précède
           (jusqu'au N° précédent ou au dernier header de région)
  Passe 3 : Classifier les cellules du bloc par contenu (arrêté, adresse, nom, etc.)
  Passe 4 : Si aucun nom trouvé, synthétiser à partir de niveau + n° + région
  Clé unique : (region_normalisée, num_ordre) — identifiant officiel MSP

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


def normalize_region(r: str) -> str:
    r = (r or "").strip()
    if not r:
        return ""
    parts = r.split()
    fixed = [p if p.isdigit() else p.title() for p in parts]
    out = " ".join(fixed)
    out = out.replace("Gbeke", "Gbêkê").replace("Goh", "Gôh").replace("Bere", "Béré")
    out = out.replace("Belier", "Bélier").replace("Agneby-Tiassa", "Agnéby-Tiassa")
    out = out.replace("Loh-Djiboua", "Lôh-Djiboua").replace("Marahoue", "Marahoué")
    out = out.replace("Sud-Comoe", "Sud-Comoé").replace("Grand Ponts", "Grands Ponts")
    out = out.replace("Bagoue", "Bagoué").replace("Cavally", "Cavally")
    out = out.replace("Gontougo", "Gontougo").replace("Gbokle", "Gboklé")
    out = out.replace("Guemon", "Guémon").replace("Indenie-Djuablin", "Indénié-Djuablin")
    out = out.replace("La Me", "La Mé").replace("N'Zi", "N'zi").replace("N'zi", "N'Zi")
    return out


def infer_categorie(niveau: str) -> str:
    n = _norm(niveau)
    for key, cat in NIVEAU_TO_CATEGORIE.items():
        if _norm(key) in n:
            return cat
    if "polyclin" in n: return "Polyclinique"
    if "clinique" in n: return "Clinique Médicale"
    if "maternit" in n: return "Maternité"
    if "hopital" in n or "hôpital" in n.lower(): return "Hôpital"
    if "laboratoire" in n: return "Laboratoire"
    if "centre" in n: return "Centre Médical"
    if "cabinet" in n: return "Cabinet Médical"
    return "Non classifié"


def infer_specialites(niveau: str, denomination: str) -> list:
    t = _norm(niveau + " " + denomination)
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
    return [label for label, kws in mapping.items() if any(k in t for k in kws)]


def parse_commune(loc: str) -> str:
    if not loc: return ""
    for pattern in [
        r"commune\s+d[eu']\s*([A-Za-zÀ-ÿ' \-]+?)(?:,|$|\s+quartier|\s+zone)",
        r"commune\s+du\s+([A-Za-zÀ-ÿ' \-]+?)(?:,|$|\s+quartier|\s+zone)",
    ]:
        m = re.search(pattern, loc, re.IGNORECASE)
        if m: return m.group(1).strip().rstrip(",")
    # fallback : "Yamoussoukro, quartier..."
    m = re.match(r"^\s*([A-Za-zÀ-ÿ']{3,}?),", loc)
    if m and "commune" not in _norm(m.group(0)):
        return m.group(1).strip()
    return ""


# Regex de classification
NUM_RE = re.compile(r"^\d{1,4}$")
ARRETE_RE = re.compile(r"(?:ARRETE\s+N|\d+/MSHPCMU|/DGS/|/DEPP|/DEPS|S\s+DU\s+\d)", re.IGNORECASE)
DATE_RE = re.compile(r"(?:S\s+DU\s|\d{1,2}\s+(?:JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|AOÛT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE|DÉCEMBRE)\s+\d{4})", re.IGNORECASE)
NATURE_TOKENS = {"paramedicale", "medicale", "medecine", "medico-sociale", "medico sociale"}
ADDR_TOKENS = ("commune de", "commune d'", "commune d’", "commune du", "quartier",
               "secteur", "ilot", "îlot", "ilôt", " lot ", "carrefour", "boulevard",
               "avenue", "route", "derrière", "face", "immeuble", "cité", "village",
               "quartier ", "à ", "voie ", "près de", "route de", "vers")
NIVEAU_KEYWORDS = ("cabinet ", "centre ", "clinique ", "polyclinique", "maternité",
                   "hôpital", "hopital", "laboratoire", "officine", "pharmacie")


def classify_cell(v: str) -> str:
    """Retourne : num|nature|niveau|deno|region|district|adresse|arrete|other"""
    if not v: return "empty"
    vn = _norm(v)

    # Numéro d'ordre
    if NUM_RE.match(v.strip()):
        return "num"
    # Nature (mot court, minuscules)
    if vn in NATURE_TOKENS:
        return "nature"
    # Arrêté (regex spécifiques)
    if ARRETE_RE.search(v) or DATE_RE.search(v):
        return "arrete"
    # Adresse
    if any(t in vn for t in ADDR_TOKENS):
        return "adresse"
    # Niveau : commence par mot-clé de type et n'est pas en majuscules
    if any(vn.startswith(k) for k in NIVEAU_KEYWORDS) and v != v.upper():
        return "niveau"
    # Région : "Abidjan 1", "Abidjan 2"
    if vn in {"abidjan 1", "abidjan 2", "abidjan1", "abidjan2"}:
        return "region"
    # District : contient tiret ou Est/Ouest/Sud/Nord
    if re.search(r"[- ](Est|Ouest|Sud|Nord|Centre)\b", v) or \
       re.search(r"\b(Est|Ouest|Sud|Nord)$", v):
        return "district"
    # Denomination : texte en majuscules (nom d'établissement)
    if v == v.upper() and len(v) >= 3 and any(c.isalpha() for c in v):
        return "denomination"
    return "other"


def parse():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["Sheet1"]

    # ── PASSE 1 : lire toutes les lignes en mémoire + tracker header région
    rows = []
    current_region_header = ""
    for row in ws.iter_rows(values_only=True):
        cells = [_strip(row[i]) if i < len(row) else "" for i in range(10)]
        # Détection en-tête "Région : XXX"
        for c in cells + [_strip(x) for x in (row or [])]:
            m = re.match(r"^R[ée]gion\s*:\s*(.+)$", c, re.IGNORECASE)
            if m:
                current_region_header = m.group(1).strip()
                break
        rows.append((cells, current_region_header))

    # ── PASSE 2 : localiser tous les N° d'ordre (col 0 ou col 1)
    num_positions = []  # liste de (row_index, num, region_header)
    for i, (cells, reg) in enumerate(rows):
        # Chercher N° dans col 0 ET col 1 (décalage)
        num = None
        if NUM_RE.match(cells[0]):
            num = int(cells[0])
        elif NUM_RE.match(cells[1]) and not cells[0]:
            # Ligne décalée : col 0 vide, col 1 = num
            num = int(cells[1])
        if num is not None:
            num_positions.append((i, num, reg))

    print(f"Passe 2 : {len(num_positions)} N° d'ordre détectés")

    # ── PASSE 3 : pour chaque N°, agréger les cellules du bloc courant
    # Un bloc = toutes les lignes entre le N° précédent (exclusif) et le N° courant (inclusif)
    results = []
    prev_i = -1
    for idx, (row_i, num, reg_header) in enumerate(num_positions):
        block_rows = rows[prev_i + 1 : row_i + 1]  # lignes du bloc

        # Classifier chaque cellule
        buckets = {"nature": [], "niveau": [], "denomination": [], "region": [],
                   "district": [], "adresse": [], "arrete": []}
        for cells, _ in block_rows:
            for c in cells:
                if not c: continue
                kind = classify_cell(c)
                if kind == "num": continue  # ignore le N° lui-même
                if kind in buckets:
                    buckets[kind].append(c)
                # "other" et "empty" ignorés

        # Filtrer les headers de tableau qui polluent parfois
        HEADERS = {
            "denomination", "nature", "niveau d'intervention", "niveau d’intervention",
            "region sanitaire", "district sanitaire", "localisation",
            "arrete n° et date", "arrete n et date",
            "repertoire des etablissements sanitaires prives autorises en",
            "repertoire des etablissements sanitaires prives autorises",
            "cote d'ivoire",
        }
        deno_parts = [d for d in buckets["denomination"] if _norm(d) not in HEADERS]

        # Consolider les strings
        deno = re.sub(r"\s+", " ", " ".join(deno_parts)).strip()
        niveau = re.sub(r"\s+", " ", " ".join(buckets["niveau"])).strip()
        nature = re.sub(r"\s+", " ", " ".join(buckets["nature"])).strip()
        adresse = re.sub(r"\s+", " ", " ".join(buckets["adresse"])).strip()
        arrete = re.sub(r"\s+", " ", " ".join(buckets["arrete"])).strip()
        region = normalize_region((buckets["region"][0] if buckets["region"] else "") or reg_header)
        district = re.sub(r"\s+", " ", " ".join(buckets["district"])).strip()

        # Si nom vide, synthétiser depuis le niveau + N° d'ordre
        if not deno:
            deno = f"[{niveau or 'Établissement'} N°{num} — {region}]"

        # Nettoyer l'arrêté
        m = re.search(r"(ARRETE\s+N[°\s]*\d+[/\w\-]*(?:\s+S)?\s+DU\s+.+?\d{4})", arrete, re.IGNORECASE)
        clean_arrete = m.group(1).strip() if m else arrete

        results.append({
            "num_ordre": num,
            "nom": deno,
            "categorie": infer_categorie(niveau),
            "nature": nature,
            "niveau_intervention": niveau,
            "region": region,
            "district_sanitaire": district,
            "commune": parse_commune(adresse),
            "adresse": adresse,
            "responsable": "",
            "date_autorisation": clean_arrete,
            "specialites_metier": infer_specialites(niveau, deno),
        })
        prev_i = row_i

    # ── PASSE 4 : dédupliquer par (region, num_ordre) — clé unique officielle MSP
    seen = set()
    unique = []
    for e in results:
        key = (_norm(e["region"]), e["num_ordre"])
        if key in seen:
            # Conflit : garder celui avec le nom le plus long
            for i, u in enumerate(unique):
                if (_norm(u["region"]), u["num_ordre"]) == key:
                    if len(e["nom"]) > len(u["nom"]) and not e["nom"].startswith("["):
                        unique[i] = e
                    break
            continue
        seen.add(key)
        unique.append(e)

    OUT.parent.mkdir(exist_ok=True, parents=True)
    OUT.write_text(json.dumps({
        "meta": {
            "source": "E-DEPPS MSP CI (Excel officiel) — parseur v2 multi-passes",
            "count": len(unique),
            "target_official": 1676,
        },
        "etablissements": unique,
    }, ensure_ascii=False, indent=2))
    print(f"OK — {len(unique)} établissements parsés (dédupliqués par region+num) → {OUT}")

    # Stats par région
    from collections import Counter
    regs = Counter(e.get("region") or "?" for e in unique)
    print("\nRégions (top 15) :")
    for r, n in regs.most_common(15):
        print(f"  {r:30s} {n:4d}")
    mat = sum(1 for e in unique if "Maternité" in e["specialites_metier"])
    ped = sum(1 for e in unique if "Pédiatrie" in e["specialites_metier"])
    synth = sum(1 for e in unique if e["nom"].startswith("["))
    print(f"\nMaternités : {mat} · Pédiatries : {ped}")
    print(f"Noms synthétisés (données incomplètes) : {synth}")


if __name__ == "__main__":
    parse()
