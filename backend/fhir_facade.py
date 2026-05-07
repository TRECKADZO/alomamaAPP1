"""
FHIR R4 Facade — À lo Maman
============================
Couche de conversion entre le modèle interne (MongoDB) et le standard FHIR R4.

Permet d'exporter chaque ressource interne vers une représentation FHIR-like
sans dupliquer la donnée. Préparé pour l'interopérabilité avec le Bus National
d'Interopérabilité de Santé (Côte d'Ivoire) et tout serveur FHIR HL7 R4.

🩺 Resources FHIR couvertes :
  - Patient        (Maman + Enfant)
  - Immunization   (Vaccins EPI)
  - Observation    (Poids, taille, périmètre crânien, température, échographies anthropo)
  - DiagnosticReport (Tele-échographie + analyses)
  - Composition    (Carnet médical complet)
  - Consent        (Consentement granulaire)
  - Bundle         (Agrégateur)

📚 Profil cible : FHIR R4 (4.0.1)
🌍 Ref. : https://www.hl7.org/fhir/

⚠️ Cette couche n'est PAS un serveur FHIR complet (pas de validation HAPI,
pas de SearchParameter complets). Elle prépare une représentation propre
qui pourra être validée et publiée plus tard sans refonte du backend.
"""

from datetime import datetime, timezone
from typing import Any, Optional


# ============================================================================
# CODES SYSTEMS — Standards internationaux + extensions ivoiriennes
# ============================================================================

LOINC_SYSTEM = "http://loinc.org"
SNOMED_SYSTEM = "http://snomed.info/sct"
ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10"
EPI_SYSTEM = "http://id.who.int/icd/release/11/mms"  # codes vaccins OMS
OMS_GROWTH_SYSTEM = "http://www.who.int/childgrowth/standards"

# Extension custom Côte d'Ivoire
CMU_IDENTIFIER_SYSTEM = "http://alomaman.com/fhir/identifier/cmu"
ALOMAMAN_PATIENT_SYSTEM = "http://alomaman.com/fhir/identifier/patient-id"

# Codes LOINC fréquents pour observations pédiatriques
LOINC_CODES = {
    "weight": ("29463-7", "Body weight"),
    "height": ("8302-2", "Body height"),
    "head_circumference": ("9843-4", "Head Occipital-frontal circumference"),
    "temperature": ("8310-5", "Body temperature"),
    "heart_rate_fetal": ("55283-6", "Fetal heart rate"),
    "gestational_age": ("11885-1", "Gestational age"),
    "bpd": ("11820-8", "Biparietal diameter"),
    "fl": ("11824-0", "Femur length"),
    "ca": ("11816-6", "Abdominal circumference"),
    "cc": ("11984-2", "Head circumference (fetal)"),
    "amniotic_fluid": ("11981-8", "Amniotic fluid index"),
    "estimated_fetal_weight": ("11727-7", "Estimated fetal weight"),
}


# ============================================================================
# UTILITAIRES
# ============================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_iso(dt_str: Optional[str]) -> Optional[str]:
    """Normalise une chaîne datetime ISO. Retourne None si invalide."""
    if not dt_str:
        return None
    try:
        s = str(dt_str).replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    except Exception:
        return None


def _gender(sex: Optional[str]) -> str:
    if not sex:
        return "unknown"
    s = str(sex).upper()
    if s.startswith("F"):
        return "female"
    if s.startswith("M"):
        return "male"
    return "unknown"


# ============================================================================
# PATIENT (Maman ou Enfant)
# ============================================================================

def to_fhir_patient_maman(user: dict) -> dict:
    """Convertit un document `users` (rôle maman) en ressource FHIR Patient."""
    identifiers = [
        {"system": ALOMAMAN_PATIENT_SYSTEM, "value": user["id"]},
    ]
    cmu_num = (user.get("cmu") or {}).get("numero")
    if cmu_num:
        identifiers.append({
            "system": CMU_IDENTIFIER_SYSTEM,
            "value": cmu_num,
            "type": {"text": "CMU – Couverture Maladie Universelle"},
        })

    telecom = []
    if user.get("email"):
        telecom.append({"system": "email", "value": user["email"]})
    if user.get("phone"):
        telecom.append({"system": "phone", "value": user["phone"]})

    photo = []
    if user.get("photo_base64"):
        photo.append({"contentType": "image/jpeg", "data": user["photo_base64"].split(",")[-1]})

    return {
        "resourceType": "Patient",
        "id": user["id"],
        "identifier": identifiers,
        "active": True,
        "name": [{"text": user.get("name", "")}],
        "telecom": telecom,
        "gender": "female",
        "birthDate": _safe_iso(user.get("date_naissance")) or None,
        "photo": photo or None,
        "address": [{"text": user.get("ville") or user.get("adresse") or ""}] if (user.get("ville") or user.get("adresse")) else None,
    }


def to_fhir_patient_enfant(enfant: dict, maman_id: Optional[str] = None) -> dict:
    """Convertit un document `enfants` en ressource FHIR Patient (enfant).

    Le lien parent est exprimé via `RelatedPerson` ou via extension
    `link.other → Patient/<maman_id>` (relationship: 'mother').
    """
    identifiers = [{"system": ALOMAMAN_PATIENT_SYSTEM, "value": enfant["id"]}]
    if enfant.get("numero_cmu"):
        identifiers.append({
            "system": CMU_IDENTIFIER_SYSTEM,
            "value": enfant["numero_cmu"],
        })

    photo = []
    if enfant.get("photo_base64"):
        photo.append({"contentType": "image/jpeg", "data": enfant["photo_base64"].split(",")[-1]})

    res = {
        "resourceType": "Patient",
        "id": enfant["id"],
        "identifier": identifiers,
        "active": True,
        "name": [{"text": enfant.get("nom", "")}],
        "gender": _gender(enfant.get("sexe")),
        "birthDate": _safe_iso(enfant.get("date_naissance")) or enfant.get("date_naissance"),
        "photo": photo or None,
    }

    # Lien parent (mère)
    parent = maman_id or enfant.get("user_id")
    if parent:
        res["link"] = [{
            "other": {"reference": f"Patient/{parent}"},
            "type": "seealso",
        }]

    # Allergies → AllergyIntolerance (résumé inline)
    if enfant.get("allergies"):
        res["_allergies_summary"] = enfant["allergies"]

    return res


def to_fhir_allergy_intolerance(enfant_id: str, allergie: str) -> dict:
    """Une AllergyIntolerance par allergie de l'enfant."""
    return {
        "resourceType": "AllergyIntolerance",
        "patient": {"reference": f"Patient/{enfant_id}"},
        "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]},
        "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "unconfirmed"}]},
        "code": {"text": allergie},
    }


# ============================================================================
# IMMUNIZATION (Vaccins EPI)
# ============================================================================

def to_fhir_immunization(vaccin: dict, enfant_id: str) -> dict:
    """Convertit un objet vaccin en ressource FHIR Immunization."""
    return {
        "resourceType": "Immunization",
        "id": f"vacc-{enfant_id}-{vaccin.get('nom', 'unknown').replace(' ', '_')}",
        "status": "completed" if vaccin.get("fait") else "not-done",
        "vaccineCode": {
            "coding": [{
                "system": EPI_SYSTEM,
                "display": vaccin.get("nom", "Vaccin"),
            }],
            "text": vaccin.get("nom"),
        },
        "patient": {"reference": f"Patient/{enfant_id}"},
        "occurrenceDateTime": _safe_iso(vaccin.get("date")),
        "lotNumber": vaccin.get("lot"),
        "performer": ([{"actor": {"display": vaccin.get("administre_par")}}] if vaccin.get("administre_par") else None),
        "note": ([{"text": vaccin.get("notes")}] if vaccin.get("notes") else None),
    }


# ============================================================================
# OBSERVATION (Anthropométrie + signes vitaux)
# ============================================================================

def _build_observation(
    *, code_key: str, value: float, unit: str, subject_id: str,
    effective: Optional[str], category: str = "vital-signs", subject_type: str = "Patient",
) -> dict:
    code, display = LOINC_CODES.get(code_key, (code_key, code_key))
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
            "code": category,
        }]}],
        "code": {"coding": [{"system": LOINC_SYSTEM, "code": code, "display": display}], "text": display},
        "subject": {"reference": f"{subject_type}/{subject_id}"},
        "effectiveDateTime": _safe_iso(effective),
        "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org"},
    }


def to_fhir_observations_from_mesure(mesure: dict, enfant_id: str) -> list[dict]:
    """Une Observation FHIR par paramètre anthropométrique (poids/taille/PC)."""
    observations: list[dict] = []
    eff = mesure.get("date")
    if mesure.get("poids_kg") is not None:
        observations.append(_build_observation(code_key="weight", value=mesure["poids_kg"], unit="kg", subject_id=enfant_id, effective=eff))
    if mesure.get("taille_cm") is not None:
        observations.append(_build_observation(code_key="height", value=mesure["taille_cm"], unit="cm", subject_id=enfant_id, effective=eff))
    if mesure.get("perimetre_cranien_cm") is not None:
        observations.append(_build_observation(code_key="head_circumference", value=mesure["perimetre_cranien_cm"], unit="cm", subject_id=enfant_id, effective=eff))
    if mesure.get("temperature_c") is not None:
        observations.append(_build_observation(code_key="temperature", value=mesure["temperature_c"], unit="Cel", subject_id=enfant_id, effective=eff))
    return observations


# ============================================================================
# DIAGNOSTIC REPORT (Tele-échographie + analyses)
# ============================================================================

def to_fhir_diagnostic_report_echo(echo: dict, maman_id: str) -> dict:
    """Convertit un compte-rendu d'écho en DiagnosticReport + Observations imbriquées."""
    rid = echo.get("id", "echo")
    contained_obs = []
    eff = echo.get("date") or echo.get("created_at")

    def _add_obs(code_key: str, val, unit):
        if val is not None:
            contained_obs.append(_build_observation(
                code_key=code_key, value=val, unit=unit,
                subject_id=maman_id, effective=eff, category="imaging",
            ))

    _add_obs("bpd", echo.get("bpd_mm"), "mm")
    _add_obs("fl", echo.get("fl_mm"), "mm")
    _add_obs("ca", echo.get("ca_mm"), "mm")
    _add_obs("cc", echo.get("cc_mm"), "mm")
    _add_obs("estimated_fetal_weight", echo.get("poids_estime_g"), "g")
    _add_obs("heart_rate_fetal", echo.get("battements_cardiaques_bpm"), "/min")
    _add_obs("gestational_age", echo.get("semaine_grossesse"), "weeks")

    presented_form = []
    if echo.get("image_base64"):
        presented_form.append({
            "contentType": "image/jpeg",
            "data": echo["image_base64"].split(",")[-1],
            "title": "Image d'échographie",
        })

    return {
        "resourceType": "DiagnosticReport",
        "id": rid,
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0074", "code": "RAD", "display": "Radiology"}]}],
        "code": {"text": "Échographie obstétricale"},
        "subject": {"reference": f"Patient/{maman_id}"},
        "effectiveDateTime": _safe_iso(eff),
        "issued": _safe_iso(echo.get("created_at")) or _now_iso(),
        "performer": ([{"display": echo.get("pro_name")}] if echo.get("pro_name") else None),
        "result": [{"reference": f"#obs-{i}"} for i in range(len(contained_obs))],
        "conclusion": echo.get("conclusion") or echo.get("description"),
        "presentedForm": presented_form or None,
        "contained": [{**o, "id": f"obs-{i}"} for i, o in enumerate(contained_obs)],
    }


# ============================================================================
# CONSENT (granulaire)
# ============================================================================

def to_fhir_consent(consent: dict) -> dict:
    """Convertit un document `consents` en FHIR Consent.

    Schéma interne attendu :
      {id, maman_id, pro_id, scope, categories: [str], expires_at, status}
    """
    return {
        "resourceType": "Consent",
        "id": consent.get("id"),
        "status": consent.get("status", "active"),
        "scope": {"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/consentscope",
            "code": "patient-privacy",
        }]},
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "IDSCL",  # information disclosure consent
        }]}],
        "patient": {"reference": f"Patient/{consent.get('maman_id')}"},
        "dateTime": _safe_iso(consent.get("created_at")) or _now_iso(),
        "performer": [{"reference": f"Patient/{consent.get('maman_id')}"}],
        "provision": {
            "type": "permit",
            "period": {
                "start": _safe_iso(consent.get("created_at")) or _now_iso(),
                "end": _safe_iso(consent.get("expires_at")),
            },
            "actor": [{
                "role": {"text": "Professional health care provider"},
                "reference": {"reference": f"Practitioner/{consent.get('pro_id')}"},
            }],
            "purpose": [{"text": cat} for cat in consent.get("categories", [])],
        },
    }


# ============================================================================
# BIRTH DECLARATION (FHIR Composition de section "Naissance")
# ============================================================================

def to_fhir_birth_composition(declaration: dict, enfant_patient_ref: str) -> dict:
    return {
        "resourceType": "Composition",
        "id": f"birth-{declaration.get('id', enfant_patient_ref)}",
        "status": "final",
        "type": {"coding": [{"system": LOINC_SYSTEM, "code": "65755-5", "display": "Birth Certificate"}]},
        "subject": {"reference": f"Patient/{enfant_patient_ref}"},
        "date": _safe_iso(declaration.get("date_naissance")) or _now_iso(),
        "author": [{"display": declaration.get("medecin_accoucheur") or "Auto-déclaration parent"}],
        "title": "Déclaration de naissance",
        "section": [
            {
                "title": "Identité de l'enfant",
                "text": {"status": "generated", "div": f"<div>Enfant : {declaration.get('nom_enfant')} · Sexe : {declaration.get('sexe')} · Né(e) le {declaration.get('date_naissance')} à {declaration.get('lieu_naissance')}</div>"},
            },
            {
                "title": "Identité des parents",
                "text": {"status": "generated", "div": f"<div>Mère : {declaration.get('nom_mere')} · Père : {declaration.get('nom_pere') or 'Non renseigné'}</div>"},
            },
        ],
    }


# ============================================================================
# COMPOSITION — CARNET MÉDICAL UNIFIÉ DE L'ENFANT
# ============================================================================

def build_carnet_composition(
    *,
    enfant: dict,
    maman: dict,
    immunizations: list[dict],
    observations: list[dict],
    diagnostic_reports: list[dict],
    birth_declaration: Optional[dict] = None,
    dmp_summary: Optional[dict] = None,
) -> dict:
    """Crée la Composition FHIR « Carnet médical » de l'enfant.

    Sections :
      1. Identité (Patient)
      2. Naissance (BirthDeclaration → Composition section)
      3. Vaccinations (Immunization[])
      4. Croissance (Observation[])
      5. Examens & Imagerie (DiagnosticReport[])
      6. Développement (DMP score)
      7. Allergies
    """
    sections = [
        {
            "title": "Identité",
            "code": {"text": "patient-summary"},
            "entry": [{"reference": f"Patient/{enfant['id']}"}],
        },
    ]

    if birth_declaration:
        sections.append({
            "title": "Naissance",
            "code": {"coding": [{"system": LOINC_SYSTEM, "code": "65755-5"}]},
            "entry": [{"reference": f"Composition/birth-{birth_declaration.get('id', enfant['id'])}"}],
        })

    if immunizations:
        sections.append({
            "title": "Vaccinations (EPI)",
            "code": {"coding": [{"system": LOINC_SYSTEM, "code": "11369-6", "display": "History of Immunization"}]},
            "entry": [{"reference": f"Immunization/{i.get('id', f'vacc-{idx}')}"} for idx, i in enumerate(immunizations)],
        })

    if observations:
        sections.append({
            "title": "Croissance & signes vitaux",
            "code": {"coding": [{"system": LOINC_SYSTEM, "code": "8716-3", "display": "Vital signs"}]},
            "entry": [{"reference": f"#obs-{idx}"} for idx in range(len(observations))],
        })

    if diagnostic_reports:
        sections.append({
            "title": "Examens & Imagerie",
            "code": {"coding": [{"system": LOINC_SYSTEM, "code": "30954-2", "display": "Relevant diagnostic tests/laboratory data"}]},
            "entry": [{"reference": f"DiagnosticReport/{d.get('id')}"} for d in diagnostic_reports if d.get("id")],
        })

    if dmp_summary:
        sections.append({
            "title": "Suivi du développement (DMP)",
            "code": {"text": "developmental-monitoring"},
            "text": {
                "status": "generated",
                "div": f"<div>Score global : {dmp_summary.get('score_global', '—')}% · "
                       f"Couverture : {dmp_summary.get('couverture', {}).get('pct', 0)}% "
                       f"({dmp_summary.get('couverture', {}).get('repondus', 0)}/{dmp_summary.get('couverture', {}).get('attendus', 0)})</div>",
            },
        })

    if enfant.get("allergies"):
        sections.append({
            "title": "Allergies",
            "code": {"coding": [{"system": LOINC_SYSTEM, "code": "48765-2", "display": "Allergies and adverse reactions"}]},
            "text": {"status": "generated", "div": f"<div>{', '.join(enfant['allergies']) if isinstance(enfant['allergies'], list) else enfant['allergies']}</div>"},
        })

    return {
        "resourceType": "Composition",
        "id": f"carnet-{enfant['id']}",
        "status": "final",
        "type": {"coding": [{"system": LOINC_SYSTEM, "code": "11502-2", "display": "Laboratory report"}],
                  "text": "Carnet médical"},
        "category": [{"text": "Carnet médical pédiatrique"}],
        "subject": {"reference": f"Patient/{enfant['id']}"},
        "encounter": None,
        "date": _now_iso(),
        "author": [{"reference": f"Patient/{maman['id']}", "display": maman.get("name")}],
        "title": f"Carnet médical de {enfant.get('nom', '')}",
        "section": sections,
    }


# ============================================================================
# BUNDLE — Agrégateur (utile pour /fhir/$everything)
# ============================================================================

def to_fhir_bundle(*, resources: list[dict], bundle_type: str = "collection") -> dict:
    return {
        "resourceType": "Bundle",
        "type": bundle_type,
        "timestamp": _now_iso(),
        "total": len(resources),
        "entry": [{"resource": r} for r in resources if r],
    }


# ============================================================================
# CARNET MODULAIRE PAR ÂGE
# ============================================================================

# Définition des modules d'âge → contenus pertinents pour la maman / le pro.
# Chaque module précise quelles SECTIONS de la Composition afficher en priorité.
AGE_MODULES = {
    "naissance":    {"min_m": 0,   "max_m": 1,    "label": "Naissance (J0-J28)",     "sections": ["identite", "naissance", "premier_examen", "vaccins_naissance"]},
    "0-6m":         {"min_m": 0,   "max_m": 6,    "label": "Nourrisson (0-6 mois)",  "sections": ["vaccins", "croissance", "alimentation", "developpement"]},
    "6-24m":        {"min_m": 6,   "max_m": 24,   "label": "Bébé (6-24 mois)",       "sections": ["vaccins", "croissance", "diversification", "developpement", "dents"]},
    "2-5a":         {"min_m": 24,  "max_m": 60,   "label": "Petite enfance (2-5 ans)", "sections": ["vaccins_rappel", "croissance", "developpement", "vue_audition"]},
    "6-12a":        {"min_m": 60,  "max_m": 144,  "label": "Enfance (6-12 ans)",     "sections": ["vaccins_rappel", "croissance", "scolarite", "vue_audition"]},
    "13-18a":       {"min_m": 144, "max_m": 216,  "label": "Adolescence (13-18 ans)", "sections": ["vaccins_rappel", "puberte", "vue_audition", "sante_mentale"]},
}


def get_module_for_age(age_mois: int) -> str:
    """Retourne la clé du module d'âge le plus pertinent."""
    for key, conf in AGE_MODULES.items():
        if conf["min_m"] <= age_mois < conf["max_m"]:
            return key
    return "13-18a"  # fallback


# Adaptation par spécialité pro — sections prioritaires
SPECIALTY_PRIORITY = {
    "sage_femme":      ["naissance", "0-6m"],
    "sage-femme":      ["naissance", "0-6m"],
    "pediatre":        ["0-6m", "6-24m", "2-5a", "6-12a"],
    "pédiatre":        ["0-6m", "6-24m", "2-5a", "6-12a"],
    "gynecologue":     ["naissance"],
    "gynécologue":     ["naissance"],
    "infirmiere":      ["0-6m", "6-24m"],
    "infirmière":      ["0-6m", "6-24m"],
    "medecin_general": ["0-6m", "6-24m", "2-5a", "6-12a", "13-18a"],
    "médecin général": ["0-6m", "6-24m", "2-5a", "6-12a", "13-18a"],
}


def relevant_modules_for_specialty(specialty: Optional[str]) -> list[str]:
    if not specialty:
        return list(AGE_MODULES.keys())
    s = str(specialty).strip().lower()
    return SPECIALTY_PRIORITY.get(s, list(AGE_MODULES.keys()))
