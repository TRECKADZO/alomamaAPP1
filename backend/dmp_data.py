"""
DMP — Détection Multi-domaine du Précoce
=========================================
Catalogue de 52 jalons de développement pédiatrique répartis dans 7 domaines.

Chaque jalon contient :
- id              : identifiant unique slugifié
- domaine         : 1 des 7 domaines (clé technique)
- titre           : libellé court (UI list)
- description     : explication détaillée pour les parents
- age_typique     : âge médian d'acquisition (en mois)
- age_alerte      : seuil de retard significatif → alerte rouge (en mois)
- emoji           : icône visuelle

Sources : OMS — Standards de développement de l'enfant (2019),
ASQ-3 (Ages & Stages Questionnaires), CDC Milestones (2022).

7 DOMAINES :
  1. moteur_global       — Posture, locomotion, équilibre
  2. moteur_fin          — Préhension, manipulation, écriture
  3. langage_receptif    — Compréhension du langage
  4. langage_expressif   — Production verbale
  5. cognitif            — Raisonnement, mémoire, résolution
  6. social_emotionnel   — Interactions, émotions, attachement
  7. autonomie           — Vie quotidienne, hygiène, alimentation
"""

DOMAINS = [
    {"key": "moteur_global", "label": "Moteur global", "emoji": "🏃", "color": "#EF4444"},
    {"key": "moteur_fin", "label": "Moteur fin", "emoji": "✋", "color": "#F97316"},
    {"key": "langage_receptif", "label": "Langage réceptif", "emoji": "👂", "color": "#3B82F6"},
    {"key": "langage_expressif", "label": "Langage expressif", "emoji": "🗣️", "color": "#8B5CF6"},
    {"key": "cognitif", "label": "Cognitif", "emoji": "🧠", "color": "#10B981"},
    {"key": "social_emotionnel", "label": "Social-émotionnel", "emoji": "❤️", "color": "#EC4899"},
    {"key": "autonomie", "label": "Autonomie", "emoji": "🌟", "color": "#F59E0B"},
]

# 52 jalons
MILESTONES = [
    # ============= MOTEUR GLOBAL (8) =============
    {"id": "mg_tient_tete", "domaine": "moteur_global", "titre": "Tient sa tête", "description": "Maintient sa tête droite quand il est porté ou en position ventrale.", "age_typique": 3, "age_alerte": 5, "emoji": "👶"},
    {"id": "mg_retournement", "domaine": "moteur_global", "titre": "Se retourne", "description": "Passe du dos sur le ventre et inversement.", "age_typique": 5, "age_alerte": 7, "emoji": "🔄"},
    {"id": "mg_assis_seul", "domaine": "moteur_global", "titre": "S'assoit sans appui", "description": "Tient assis(e) sans soutien pendant plusieurs minutes.", "age_typique": 7, "age_alerte": 10, "emoji": "🪑"},
    {"id": "mg_4pattes", "domaine": "moteur_global", "titre": "Se déplace à 4 pattes ou rampe", "description": "Avance de manière coordonnée pour atteindre un objet.", "age_typique": 9, "age_alerte": 12, "emoji": "🐾"},
    {"id": "mg_debout_appui", "domaine": "moteur_global", "titre": "Se tient debout en s'agrippant", "description": "Se met debout en se tenant à un meuble.", "age_typique": 10, "age_alerte": 13, "emoji": "🧍"},
    {"id": "mg_marche_seul", "domaine": "moteur_global", "titre": "Marche sans aide", "description": "Fait plusieurs pas seul(e) sans tomber.", "age_typique": 13, "age_alerte": 18, "emoji": "🚶"},
    {"id": "mg_court", "domaine": "moteur_global", "titre": "Court", "description": "Court sans tomber, change de direction.", "age_typique": 20, "age_alerte": 28, "emoji": "🏃"},
    {"id": "mg_saute_pieds_joints", "domaine": "moteur_global", "titre": "Saute à pieds joints", "description": "Saute en l'air avec les deux pieds décollés du sol.", "age_typique": 30, "age_alerte": 42, "emoji": "🤸"},

    # ============= MOTEUR FIN (8) =============
    {"id": "mf_suit_objet", "domaine": "moteur_fin", "titre": "Suit un objet du regard", "description": "Suit un objet en mouvement à 180°.", "age_typique": 3, "age_alerte": 5, "emoji": "👀"},
    {"id": "mf_saisit_objet", "domaine": "moteur_fin", "titre": "Saisit un objet", "description": "Attrape un objet placé devant lui/elle.", "age_typique": 5, "age_alerte": 8, "emoji": "🤲"},
    {"id": "mf_passe_main", "domaine": "moteur_fin", "titre": "Passe un objet d'une main à l'autre", "description": "Transfère un cube ou un jouet d'une main à l'autre.", "age_typique": 7, "age_alerte": 10, "emoji": "🔁"},
    {"id": "mf_pince_pouce_index", "domaine": "moteur_fin", "titre": "Pince fine (pouce-index)", "description": "Saisit un petit objet entre le pouce et l'index.", "age_typique": 11, "age_alerte": 15, "emoji": "🤏"},
    {"id": "mf_tour_2_cubes", "domaine": "moteur_fin", "titre": "Empile 2 cubes", "description": "Construit une tour de 2 cubes.", "age_typique": 15, "age_alerte": 22, "emoji": "🧱"},
    {"id": "mf_gribouille", "domaine": "moteur_fin", "titre": "Gribouille", "description": "Trace des marques avec un crayon.", "age_typique": 18, "age_alerte": 26, "emoji": "✏️"},
    {"id": "mf_dessine_rond", "domaine": "moteur_fin", "titre": "Dessine un rond", "description": "Imite ou dessine spontanément un cercle.", "age_typique": 36, "age_alerte": 48, "emoji": "⭕"},
    {"id": "mf_decoupe_ciseaux", "domaine": "moteur_fin", "titre": "Découpe avec des ciseaux", "description": "Utilise des ciseaux à bouts ronds pour découper droit.", "age_typique": 48, "age_alerte": 60, "emoji": "✂️"},

    # ============= LANGAGE RÉCEPTIF (7) =============
    {"id": "lr_reagit_voix", "domaine": "langage_receptif", "titre": "Réagit à la voix", "description": "Tourne la tête vers une voix familière.", "age_typique": 3, "age_alerte": 5, "emoji": "👂"},
    {"id": "lr_repond_prenom", "domaine": "langage_receptif", "titre": "Répond à son prénom", "description": "Tourne la tête ou regarde quand on l'appelle.", "age_typique": 7, "age_alerte": 10, "emoji": "🔔"},
    {"id": "lr_comprend_non", "domaine": "langage_receptif", "titre": "Comprend « non »", "description": "Arrête une action ou réagit à l'interdiction.", "age_typique": 9, "age_alerte": 13, "emoji": "✋"},
    {"id": "lr_consigne_simple", "domaine": "langage_receptif", "titre": "Suit une consigne simple", "description": "Exécute une demande comme « Donne-moi le jouet ».", "age_typique": 14, "age_alerte": 20, "emoji": "🎯"},
    {"id": "lr_designe_corps", "domaine": "langage_receptif", "titre": "Désigne 2-3 parties du corps", "description": "Montre les yeux, le nez, la bouche sur demande.", "age_typique": 18, "age_alerte": 26, "emoji": "👃"},
    {"id": "lr_consigne_double", "domaine": "langage_receptif", "titre": "Suit une consigne en 2 étapes", "description": "« Prends ton verre et donne-le à papa. »", "age_typique": 24, "age_alerte": 34, "emoji": "📋"},
    {"id": "lr_concept_avant_apres", "domaine": "langage_receptif", "titre": "Comprend « avant/après »", "description": "Saisit l'ordre temporel d'événements simples.", "age_typique": 48, "age_alerte": 60, "emoji": "⏰"},

    # ============= LANGAGE EXPRESSIF (8) =============
    {"id": "le_areu", "domaine": "langage_expressif", "titre": "Émet des sons (areu)", "description": "Vocalise spontanément.", "age_typique": 3, "age_alerte": 5, "emoji": "💬"},
    {"id": "le_babille", "domaine": "langage_expressif", "titre": "Babille en syllabes", "description": "Répète des syllabes (ba-ba, ma-ma).", "age_typique": 7, "age_alerte": 11, "emoji": "🔉"},
    {"id": "le_premier_mot", "domaine": "langage_expressif", "titre": "Premier mot", "description": "Dit un mot avec sens (mama, papa, donne).", "age_typique": 13, "age_alerte": 18, "emoji": "🗣️"},
    {"id": "le_5_mots", "domaine": "langage_expressif", "titre": "Dit 5+ mots", "description": "Possède un vocabulaire actif d'au moins 5 mots.", "age_typique": 16, "age_alerte": 24, "emoji": "📚"},
    {"id": "le_phrases_2mots", "domaine": "langage_expressif", "titre": "Phrases de 2 mots", "description": "Combine deux mots (« encore lait »).", "age_typique": 22, "age_alerte": 30, "emoji": "💭"},
    {"id": "le_phrases_3_5mots", "domaine": "langage_expressif", "titre": "Phrases de 3-5 mots", "description": "Forme des phrases courtes structurées.", "age_typique": 30, "age_alerte": 42, "emoji": "📝"},
    {"id": "le_pose_questions", "domaine": "langage_expressif", "titre": "Pose des questions « pourquoi »", "description": "Pose des questions pour comprendre.", "age_typique": 36, "age_alerte": 48, "emoji": "❓"},
    {"id": "le_raconte_histoire", "domaine": "langage_expressif", "titre": "Raconte une histoire", "description": "Raconte un événement avec début/milieu/fin.", "age_typique": 54, "age_alerte": 66, "emoji": "📖"},

    # ============= COGNITIF (7) =============
    {"id": "co_objet_cache_partiel", "domaine": "cognitif", "titre": "Cherche un objet partiellement caché", "description": "Cherche un jouet dont une partie est visible.", "age_typique": 7, "age_alerte": 10, "emoji": "🔍"},
    {"id": "co_objet_cache_total", "domaine": "cognitif", "titre": "Cherche un objet entièrement caché", "description": "Permanence de l'objet acquise.", "age_typique": 10, "age_alerte": 14, "emoji": "🎁"},
    {"id": "co_imite_action", "domaine": "cognitif", "titre": "Imite une action", "description": "Imite un geste comme téléphoner, boire.", "age_typique": 14, "age_alerte": 20, "emoji": "🪞"},
    {"id": "co_trie_formes", "domaine": "cognitif", "titre": "Trie par formes ou couleurs", "description": "Range des objets selon un critère.", "age_typique": 24, "age_alerte": 36, "emoji": "🎨"},
    {"id": "co_compte_3", "domaine": "cognitif", "titre": "Compte jusqu'à 3", "description": "Récite et associe les nombres 1, 2, 3.", "age_typique": 30, "age_alerte": 42, "emoji": "🔢"},
    {"id": "co_4_couleurs", "domaine": "cognitif", "titre": "Connaît 4 couleurs", "description": "Nomme correctement au moins 4 couleurs.", "age_typique": 36, "age_alerte": 48, "emoji": "🌈"},
    {"id": "co_lettres", "domaine": "cognitif", "titre": "Reconnaît quelques lettres", "description": "Identifie les lettres de son prénom.", "age_typique": 60, "age_alerte": 72, "emoji": "🔤"},

    # ============= SOCIAL-ÉMOTIONNEL (8) =============
    {"id": "se_sourire_social", "domaine": "social_emotionnel", "titre": "Sourire social", "description": "Sourit en réponse à un visage familier.", "age_typique": 2, "age_alerte": 4, "emoji": "😊"},
    {"id": "se_rit_eclats", "domaine": "social_emotionnel", "titre": "Rit aux éclats", "description": "Éclats de rire spontanés ou en réaction.", "age_typique": 5, "age_alerte": 8, "emoji": "😂"},
    {"id": "se_peur_etrangers", "domaine": "social_emotionnel", "titre": "Peur des étrangers", "description": "Distingue les visages familiers vs inconnus.", "age_typique": 8, "age_alerte": 12, "emoji": "👀"},
    {"id": "se_pointe_doigt", "domaine": "social_emotionnel", "titre": "Pointe du doigt", "description": "Désigne un objet, une personne pour partager son intérêt.", "age_typique": 12, "age_alerte": 18, "emoji": "👉"},
    {"id": "se_jeu_parallele", "domaine": "social_emotionnel", "titre": "Joue à côté d'autres enfants", "description": "Joue parallèlement (sans interaction).", "age_typique": 20, "age_alerte": 30, "emoji": "🧒"},
    {"id": "se_jeu_role", "domaine": "social_emotionnel", "titre": "Joue à faire semblant", "description": "Joue à la dînette, aux poupées, au docteur.", "age_typique": 24, "age_alerte": 36, "emoji": "🎭"},
    {"id": "se_partage", "domaine": "social_emotionnel", "titre": "Partage avec d'autres enfants", "description": "Accepte de prêter ou tour de rôle.", "age_typique": 36, "age_alerte": 48, "emoji": "🤝"},
    {"id": "se_amis", "domaine": "social_emotionnel", "titre": "A des amis préférés", "description": "Cherche la compagnie d'enfants spécifiques.", "age_typique": 54, "age_alerte": 66, "emoji": "👫"},

    # ============= AUTONOMIE (6) =============
    {"id": "au_boit_tasse", "domaine": "autonomie", "titre": "Boit à la tasse seul(e)", "description": "Tient une tasse et boit sans renverser.", "age_typique": 15, "age_alerte": 22, "emoji": "🥤"},
    {"id": "au_cuiller", "domaine": "autonomie", "titre": "Mange à la cuillère seul(e)", "description": "Utilise une cuillère pour porter la nourriture à la bouche.", "age_typique": 18, "age_alerte": 26, "emoji": "🥄"},
    {"id": "au_proprete_jour", "domaine": "autonomie", "titre": "Propreté de jour", "description": "Demande/utilise les toilettes pendant la journée.", "age_typique": 30, "age_alerte": 42, "emoji": "🚽"},
    {"id": "au_habille_partiel", "domaine": "autonomie", "titre": "S'habille en partie seul(e)", "description": "Met une chaussette, un t-shirt simple.", "age_typique": 36, "age_alerte": 48, "emoji": "👕"},
    {"id": "au_brosse_dents", "domaine": "autonomie", "titre": "Se brosse les dents (avec aide)", "description": "Tient la brosse et imite le geste.", "age_typique": 30, "age_alerte": 42, "emoji": "🪥"},
    {"id": "au_habille_seul", "domaine": "autonomie", "titre": "S'habille complètement seul(e)", "description": "Met tous ses vêtements y compris boutons/fermetures.", "age_typique": 60, "age_alerte": 72, "emoji": "🧥"},
]


def get_milestone(milestone_id: str):
    """Retourne un jalon par son id."""
    for m in MILESTONES:
        if m["id"] == milestone_id:
            return m
    return None


def search_milestones(query: str = "", domain: str = ""):
    """Recherche/filtre les jalons par texte et/ou domaine."""
    q = (query or "").strip().lower()
    items = MILESTONES
    if domain:
        items = [m for m in items if m["domaine"] == domain]
    if q:
        items = [m for m in items if q in m["titre"].lower() or q in m["description"].lower()]
    return items


def compute_dmp_status(age_mois: int, acquired_ids: set):
    """
    Calcule le statut DMP pour un enfant donné.

    Pour chaque jalon : statut acquis / en_cours / a_alerte / trop_jeune.
    Calcule le score par domaine (% de jalons acquis parmi ceux dont age_typique ≤ age_mois).
    Génère la liste des alertes (jalons non acquis dont age_mois > age_alerte).
    """
    # Statut global
    items = []
    for m in MILESTONES:
        is_acquired = m["id"] in acquired_ids
        if is_acquired:
            statut = "acquis"
        elif age_mois > m["age_alerte"]:
            statut = "alerte"  # 🔴 retard significatif
        elif age_mois >= m["age_typique"]:
            statut = "en_cours"  # 🟡 attendu mais pas encore acquis
        else:
            statut = "trop_jeune"  # ⚪ sera évalué plus tard
        items.append({**m, "statut": statut, "acquis": is_acquired})

    # Scores par domaine : sur les jalons attendus pour son âge (age_typique ≤ age_mois)
    domains_scores = []
    for d in DOMAINS:
        d_items = [it for it in items if it["domaine"] == d["key"]]
        attendus = [it for it in d_items if it["age_typique"] <= age_mois]
        acquis_count = sum(1 for it in attendus if it["acquis"])
        alerts_count = sum(1 for it in d_items if it["statut"] == "alerte")
        score = round(100 * acquis_count / len(attendus)) if attendus else None
        domains_scores.append({
            **d,
            "total_attendus": len(attendus),
            "acquis": acquis_count,
            "alertes": alerts_count,
            "score": score,  # peut être None si trop jeune pour ce domaine
            "total_milestones": len(d_items),
        })

    # Alertes globales
    alertes = [it for it in items if it["statut"] == "alerte"]

    # Score global (moyenne pondérée des scores de domaine)
    valid_scores = [d["score"] for d in domains_scores if d["score"] is not None]
    score_global = round(sum(valid_scores) / len(valid_scores)) if valid_scores else None

    return {
        "age_mois": age_mois,
        "items": items,
        "domains": domains_scores,
        "alertes": alertes,
        "score_global": score_global,
    }
