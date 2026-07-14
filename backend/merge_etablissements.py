"""
Fusionne la nouvelle base XLSX (~1456 établissements) avec la base existante
`etablissements_ci_full.json` (323 déjà géocodés).

Stratégie:
  - Clé de dédup : (nom_normalisé, district_normalisé) sinon (nom_normalisé, region_normalisée)
  - Si l'entrée existe déjà : on PRÉSERVE lat/lon existants + fusionne les champs manquants
  - Si nouvelle : on l'ajoute (à géocoder ultérieurement)

Sortie: /app/backend/data/etablissements_ci_full.json (backup avant écriture)
        /app/backend/data/etablissements_ci.json (mis à jour aussi car utilisé par le seed)
"""
from pathlib import Path
import json
import shutil
import unicodedata
from datetime import datetime

DATA = Path("/app/backend/data")
NEW = DATA / "etablissements_ci_xlsx.json"
OLD_FULL = DATA / "etablissements_ci_full.json"
OLD_MINI = DATA / "etablissements_ci.json"


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def key_of(e: dict):
    return (_norm(e.get("nom", "")), _norm(e.get("district_sanitaire", "")))


def key_fallback(e: dict):
    return (_norm(e.get("nom", "")), _norm(e.get("region", "")))


def merge():
    old_data = json.loads(OLD_FULL.read_text())
    new_data = json.loads(NEW.read_text())

    old_list = old_data.get("etablissements", [])
    new_list = new_data.get("etablissements", [])

    # Backup
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy(OLD_FULL, DATA / f"etablissements_ci_full.backup_{ts}.json")
    print(f"Backup sauvegardé → etablissements_ci_full.backup_{ts}.json")

    # Index des anciens par (nom, district) + fallback (nom, region)
    old_by_key = {}
    old_by_fallback = {}
    for e in old_list:
        old_by_key[key_of(e)] = e
        old_by_fallback[key_fallback(e)] = e

    merged = []
    stats = {"kept_geocoded": 0, "new_added": 0, "merged_fields": 0, "total_old": len(old_list)}

    # 1. Garder tous les anciens (avec lat/lon)
    for e in old_list:
        merged.append(dict(e))
        if e.get("lat") is not None:
            stats["kept_geocoded"] += 1

    seen_keys = set(old_by_key.keys()) | set(old_by_fallback.keys())

    # 2. Ajouter les nouveaux non-doublons
    for n in new_list:
        k1 = key_of(n)
        k2 = key_fallback(n)
        if k1 in old_by_key:
            # Doublon : enrichir l'ancien avec champs manquants du nouveau
            existing = old_by_key[k1]
            for field in ("nature", "niveau_intervention", "date_autorisation", "commune", "adresse", "categorie"):
                if not existing.get(field) and n.get(field):
                    # Retrouver l'entrée dans merged et la mettre à jour
                    for m in merged:
                        if key_of(m) == k1:
                            m[field] = n[field]
                            stats["merged_fields"] += 1
                            break
            continue
        if k2 in old_by_fallback and _norm(n.get("nom", "")) == _norm(old_by_fallback[k2].get("nom", "")):
            continue  # même nom + même région = probable doublon
        # Nouveau
        merged.append(n)
        stats["new_added"] += 1

    # Dédup interne finale (sécurité)
    seen = set()
    final = []
    for e in merged:
        k = key_of(e)
        if k in seen:
            continue
        seen.add(k)
        final.append(e)

    # Écrire
    out = {
        "meta": {
            "source": "E-DEPPS MSP CI (PDF + Excel officiels fusionnés)",
            "count": len(final),
            "merged_at": datetime.utcnow().isoformat(),
            "stats": stats,
        },
        "etablissements": final,
    }
    OLD_FULL.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    # Also update the small file used by _load_dataset (garde la structure spécialites_metier)
    mini = json.loads(OLD_MINI.read_text())
    mini["meta"] = out["meta"]
    mini["etablissements"] = final
    OLD_MINI.write_text(json.dumps(mini, ensure_ascii=False, indent=2))

    print(f"\n✅ Fusion terminée")
    print(f"   Ancienne base   : {stats['total_old']} établissements ({stats['kept_geocoded']} géocodés)")
    print(f"   Nouveaux ajoutés: {stats['new_added']}")
    print(f"   Champs enrichis : {stats['merged_fields']}")
    print(f"   TOTAL FINAL     : {len(final)} établissements")

    # Sanity check: combien sont géocodés vs à géocoder ?
    geoc = sum(1 for e in final if e.get("lat") is not None)
    print(f"\n   Déjà géocodés : {geoc}")
    print(f"   À géocoder    : {len(final) - geoc}")


if __name__ == "__main__":
    merge()
