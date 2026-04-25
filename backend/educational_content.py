"""
Données statiques pour les contenus éducatifs hebdomadaires :
- Développement du foetus semaine par semaine (4 SA → 41 SA)
- Calendrier de diversification alimentaire 6-24 mois (adapté Afrique de l'Ouest)
- Jalons de développement enfant 0-72 mois
"""

# ----------------------------------------------------------------------
# FOETUS — semaine par semaine (4 → 41 SA)
# Adapté de OMS / sources médicales validées
# ----------------------------------------------------------------------
FOETUS_SEMAINE = {
    4: {"taille": "1 mm", "poids": "—", "fruit": "Graine de sésame", "title": "Bienvenue 💛", "highlights": ["Implantation dans l'utérus", "Le sac vitellin se forme", "Premier signe de grossesse"], "conseil": "Commencez l'acide folique (vitamine B9) si pas déjà fait. Évitez tabac, alcool et automédication."},
    5: {"taille": "2 mm", "poids": "—", "fruit": "Grain de poivre", "title": "Le coeur démarre", "highlights": ["Le tube cardiaque se forme", "Apparition du système nerveux primitif", "Bébé commence à se replier en C"], "conseil": "Buvez 1,5 L d'eau par jour. Reposez-vous : votre corps travaille beaucoup."},
    6: {"taille": "5 mm", "poids": "—", "fruit": "Petit pois", "title": "Premiers battements ❤️", "highlights": ["Le coeur bat (visible à l'écho)", "Bourgeons des bras et jambes", "Cerveau divisé en zones"], "conseil": "Première consultation prénatale recommandée. Demandez le calendrier de suivi."},
    7: {"taille": "1 cm", "poids": "—", "fruit": "Myrtille", "title": "Visage en formation", "highlights": ["Yeux et narines apparaissent", "Doigts et orteils palmés", "Bébé bouge déjà (non perçu)"], "conseil": "Si nausées : mangez en petite quantité, plus souvent. Évitez les odeurs fortes."},
    8: {"taille": "1,6 cm", "poids": "1 g", "fruit": "Haricot", "title": "Tous les organes esquissés", "highlights": ["Tous les organes principaux esquissés", "Paupières se forment", "Lèvres et oreilles dessinées"], "conseil": "Faites votre première écho de datation entre 11 et 13 SA."},
    9: {"taille": "2,3 cm", "poids": "2 g", "fruit": "Cerise", "title": "Embryon → fœtus", "highlights": ["Officiellement appelé fœtus", "Cordon ombilical fonctionne", "Articulations forment des coudes"], "conseil": "Ne portez rien de lourd. Évitez les médicaments sans avis médical."},
    10: {"taille": "3 cm", "poids": "4 g", "fruit": "Fraise", "title": "Petit humain miniature", "highlights": ["Doigts séparés", "Ongles commencent à pousser", "Cerveau produit 250 000 neurones/min"], "conseil": "Mangez des protéines (œufs, poisson, légumineuses). Le fœtus en a besoin."},
    11: {"taille": "4 cm", "poids": "7 g", "fruit": "Citron vert", "title": "Premiers réflexes", "highlights": ["Bébé bâille et s'étire", "Os commencent à durcir", "Sexe en formation (non visible)"], "conseil": "Échographie de datation à programmer (11-13 SA). Demandez votre 1er bilan sanguin."},
    12: {"taille": "5,4 cm", "poids": "14 g", "fruit": "Prune", "title": "Fin du 1er trimestre 🎉", "highlights": ["Risque de fausse couche fortement réduit", "Bébé peut faire un poing", "Reins fonctionnent, urine libérée"], "conseil": "Vous pouvez annoncer votre grossesse. Pensez à la déclaration officielle."},
    13: {"taille": "7,4 cm", "poids": "23 g", "fruit": "Pêche", "title": "2e trimestre commence", "highlights": ["Empreintes digitales formées", "Cordes vocales en place", "Fini les nausées (souvent)"], "conseil": "Reprenez doucement l'activité physique : marche, yoga prénatal."},
    14: {"taille": "8,7 cm", "poids": "43 g", "fruit": "Poire", "title": "Bébé fait des grimaces", "highlights": ["Muscles du visage actifs", "Bébé peut sucer son pouce", "Lanugo (duvet) apparaît"], "conseil": "Hydratez votre peau (huile de coco, beurre de karité) pour prévenir les vergetures."},
    15: {"taille": "10 cm", "poids": "70 g", "fruit": "Pomme", "title": "Sens en éveil", "highlights": ["Bébé entend les sons", "Yeux sensibles à la lumière", "Sourcils et cils visibles"], "conseil": "Parlez à votre bébé, mettez de la musique douce. Il vous reconnaîtra à la naissance."},
    16: {"taille": "11,6 cm", "poids": "100 g", "fruit": "Avocat", "title": "Premiers mouvements perçus", "highlights": ["Vous pouvez sentir bébé bouger", "Cou se redresse", "Cœur pompe 25 L de sang/jour"], "conseil": "Rendez-vous du 2e trimestre : bilan sanguin + écho morphologique à prévoir."},
    17: {"taille": "13 cm", "poids": "140 g", "fruit": "Oignon", "title": "Squelette qui durcit", "highlights": ["Cartilage devient os", "Graisse se dépose", "Cordon ombilical épaissit"], "conseil": "Dormez sur le côté gauche pour améliorer la circulation."},
    18: {"taille": "14,2 cm", "poids": "190 g", "fruit": "Patate douce", "title": "Bébé entend votre voix", "highlights": ["Réagit aux bruits forts", "Bouge beaucoup", "Sexe visible à l'écho"], "conseil": "Échographie morphologique entre 20-22 SA : prévoyez un accompagnant."},
    19: {"taille": "15,3 cm", "poids": "240 g", "fruit": "Mangue", "title": "Vernix protecteur", "highlights": ["Vernix caseosa enrobe la peau", "Cheveux poussent", "Périodes de sommeil/éveil"], "conseil": "Mangez du fer (épinards, foie, viande rouge) pour prévenir l'anémie."},
    20: {"taille": "16,4 cm", "poids": "300 g", "fruit": "Banane", "title": "Mi-parcours 🌟", "highlights": ["Vous êtes à la moitié !", "Bébé fait des galipettes", "Sexe confirmé à l'écho"], "conseil": "ÉCHOGRAPHIE MORPHOLOGIQUE — examen majeur. Posez vos questions au médecin."},
    21: {"taille": "26,7 cm", "poids": "360 g", "fruit": "Carotte", "title": "Les pieds dansent", "highlights": ["Bébé donne des coups visibles", "Système digestif se prépare", "Goûts se développent"], "conseil": "Mangez varié : ce que vous mangez influence les goûts futurs de bébé."},
    22: {"taille": "27,8 cm", "poids": "430 g", "fruit": "Courgette", "title": "Sens du toucher", "highlights": ["Bébé touche son visage et le cordon", "Sourcils blancs", "Pancréas mature"], "conseil": "Pensez à la formation à l'accouchement : commencez à 6-7 mois."},
    23: {"taille": "28,9 cm", "poids": "500 g", "fruit": "Aubergine", "title": "Rêves possibles", "highlights": ["Phases REM (rêves) possibles", "Peau encore translucide", "Poumons développent les vaisseaux"], "conseil": "Évitez les longs voyages. Bougez régulièrement les jambes."},
    24: {"taille": "30 cm", "poids": "600 g", "fruit": "Maïs", "title": "Viable médicalement", "highlights": ["Si naissance prématurée : viabilité possible", "Empreintes uniques", "Réagit au toucher du ventre"], "conseil": "Test de glycémie à prévoir (diabète gestationnel) entre 24-28 SA."},
    25: {"taille": "34,6 cm", "poids": "660 g", "fruit": "Chou-fleur", "title": "Yeux qui s'ouvrent", "highlights": ["Paupières s'ouvrent", "Cheveux prennent leur couleur", "Système immunitaire en place"], "conseil": "Surveillez votre tension artérielle. Toute douleur = consultez."},
    26: {"taille": "35,6 cm", "poids": "760 g", "fruit": "Laitue", "title": "Sursauts perçus", "highlights": ["Hoquets visibles", "Cligne des yeux", "Reconnait votre voix"], "conseil": "Inscrivez-vous aux cours de préparation à l'accouchement."},
    27: {"taille": "36,6 cm", "poids": "875 g", "fruit": "Brocoli", "title": "Fin du 2e trimestre", "highlights": ["Cerveau croît rapidement", "Poumons produisent surfactant", "Goût mature"], "conseil": "Préparez votre valise de maternité dès 32 SA. Listez l'essentiel."},
    28: {"taille": "37,6 cm", "poids": "1 kg", "fruit": "Aubergine", "title": "3e trimestre 🎯", "highlights": ["Bébé pèse 1 kg !", "Position céphalique commence", "Rêves fréquents"], "conseil": "Consultations mensuelles. Surveillez : œdèmes, maux de tête, vue trouble."},
    29: {"taille": "38,6 cm", "poids": "1,15 kg", "fruit": "Courge", "title": "Coups de pied puissants", "highlights": ["Coups très forts", "Graisse blanche s'accumule", "Os complètement formés"], "conseil": "Comptez les mouvements du bébé : >10 mouvements en 2h = normal."},
    30: {"taille": "39,9 cm", "poids": "1,3 kg", "fruit": "Choux", "title": "Cerveau se plie", "highlights": ["Plis cérébraux apparaissent", "Cheveux drus possibles", "Lanugo disparaît"], "conseil": "Évitez le stress. Pratiquez la respiration profonde."},
    31: {"taille": "41,1 cm", "poids": "1,5 kg", "fruit": "Noix de coco", "title": "Préparation poumons", "highlights": ["Poumons quasi-prêts", "Tête grossit vite", "Bébé urine 0,5 L/jour"], "conseil": "Inscrivez votre bébé à votre centre de santé/maternité."},
    32: {"taille": "42,4 cm", "poids": "1,7 kg", "fruit": "Aubergine grosse", "title": "Plus de place", "highlights": ["Bébé manque de place", "Mouvements moins amples", "Ongles atteignent les bouts des doigts"], "conseil": "Préparez votre PLAN DE NAISSANCE et discutez-en avec votre pro."},
    33: {"taille": "43,7 cm", "poids": "1,9 kg", "fruit": "Ananas", "title": "Système immunitaire actif", "highlights": ["Anticorps maternels transmis", "Pupilles réagissent à la lumière", "Os du crâne mous (souples pour passage)"], "conseil": "Hydratez beaucoup. Mangez fer + vitamine C ensemble."},
    34: {"taille": "44,9 cm", "poids": "2,1 kg", "fruit": "Melon", "title": "Position de naissance", "highlights": ["Tête en bas (ou siège)", "Si siège : possibilité de retournement", "Réflexe de succion mature"], "conseil": "Consultation à 34 SA : visite anesthésique + bilan biologique."},
    35: {"taille": "46,2 cm", "poids": "2,4 kg", "fruit": "Petite citrouille", "title": "Reins matures", "highlights": ["Reins fonctionnent normalement", "Foie traite déchets", "Bébé prend du gras"], "conseil": "Préparez la valise de maternité. N'oubliez pas le carnet de santé."},
    36: {"taille": "47,4 cm", "poids": "2,6 kg", "fruit": "Salade romaine", "title": "Presque prêt", "highlights": ["Vernix s'épaissit", "Plus de place pour bouger", "Position fixée"], "conseil": "Consultations hebdomadaires. Surveillez les contractions."},
    37: {"taille": "48,6 cm", "poids": "2,9 kg", "fruit": "Bette à carde", "title": "À terme",  "highlights": ["À terme à 39 SA", "Tous les organes prêts", "Réflexes complets"], "conseil": "Quand consulter en urgence : contractions régulières, perte d'eau, sang, baisse de mouvements."},
    38: {"taille": "49,8 cm", "poids": "3,1 kg", "fruit": "Poireau", "title": "Bébé peut naître", "highlights": ["Bébé considéré à terme", "Système digestif prêt", "Méconium accumulé dans intestins"], "conseil": "Validez votre plan de naissance. Préparez le sac de bébé."},
    39: {"taille": "50,7 cm", "poids": "3,3 kg", "fruit": "Pastèque", "title": "Terme officiel ✨", "highlights": ["Terme officiel atteint", "Cerveau toujours en développement", "Couche de graisse protectrice"], "conseil": "Marchez beaucoup. Reposez-vous aussi. Prévenez votre accompagnant."},
    40: {"taille": "51,2 cm", "poids": "3,5 kg", "fruit": "Citrouille", "title": "Date prévue 📅", "highlights": ["DPA — peut naître à tout moment", "Pleinement développé", "Attend juste le signal"], "conseil": "Restez près de la maternité. Téléphone chargé. Numéros d'urgence visibles."},
    41: {"taille": "51,7 cm", "poids": "3,7 kg", "fruit": "Citrouille géante", "title": "Dépassement", "highlights": ["Surveillance accrue", "Possibilité de déclenchement", "Liquide amniotique surveillé"], "conseil": "Consultations rapprochées (tous les 2 j). Suivez les directives médicales."},
}


# ----------------------------------------------------------------------
# DIVERSIFICATION ALIMENTAIRE — 6 à 24 mois
# Adapté au contexte ouest-africain (Côte d'Ivoire, Sénégal, Togo, Bénin)
# Aliments locaux : mil, sorgho, riz local, igname, manioc, mangue, papaye, niébé, poisson, foie
# ----------------------------------------------------------------------
DIVERSIFICATION = [
    {
        "etape": "6 mois",
        "age_min": 6, "age_max": 7,
        "title": "Début de la diversification 🥄",
        "intro": "L'allaitement maternel reste la base. Introduction des premiers aliments solides.",
        "tetee": "5-6 tétées/jour ou biberons (lait infantile)",
        "repas": [
            {"moment": "Matin", "menu": "Tétée ou biberon"},
            {"moment": "Midi", "menu": "Bouillie de mil enrichie au lait + 2 cuillères de purée d'igname ou de carotte"},
            {"moment": "Après-midi", "menu": "Tétée ou biberon"},
            {"moment": "Soir", "menu": "Tétée ou biberon"},
        ],
        "aliments_ok": ["Bouillie de mil enrichie", "Bouillie de riz local", "Purée d'igname douce", "Purée de patate douce", "Purée de carotte", "Purée de courgette", "Banane mûre écrasée", "Mangue mûre écrasée"],
        "aliments_eviter": ["Sel", "Sucre ajouté", "Miel (jusqu'à 1 an)", "Lait de vache pur", "Œuf cru", "Arachide entière (risque d'étouffement)", "Poisson cru ou peu cuit"],
        "tips": "Une nouvelle saveur tous les 3 jours pour repérer les allergies. Texture lisse uniquement.",
    },
    {
        "etape": "7-8 mois",
        "age_min": 7, "age_max": 8,
        "title": "Plus de saveurs 🍲",
        "intro": "Diversifiez les fruits, légumes et introduisez les protéines animales en petite quantité.",
        "tetee": "4-5 tétées/jour",
        "repas": [
            {"moment": "Matin", "menu": "Tétée + bouillie de céréales (mil, sorgho ou maïs)"},
            {"moment": "Midi", "menu": "Purée légumes + 1 c. à café de poisson écrasé ou foie de volaille mixé + 1 c. à café d'huile de palme rouge"},
            {"moment": "Goûter", "menu": "Compote de fruit local (mangue, papaye, banane)"},
            {"moment": "Soir", "menu": "Bouillie épaisse + tétée"},
        ],
        "aliments_ok": ["Poisson cuit (écrasé, sans arête)", "Foie de poulet mixé", "Œuf jaune cuit dur", "Niébé bien cuit et écrasé (sans peau)", "Avocat", "Papaye", "Pastèque", "Yaourt nature"],
        "aliments_eviter": ["Blanc d'œuf", "Crustacés", "Sel ajouté", "Aliments épicés (piment)", "Boissons sucrées"],
        "tips": "Introduisez le fer : foie, niébé, épinards. Toujours associer avec un fruit riche en vitamine C (mangue, orange) pour mieux absorber.",
    },
    {
        "etape": "9-11 mois",
        "age_min": 9, "age_max": 11,
        "title": "Texture en morceaux 🍴",
        "intro": "Bébé apprend à mâcher. Proposez des morceaux fondants et des aliments à prendre avec les doigts.",
        "tetee": "3-4 tétées/jour",
        "repas": [
            {"moment": "Matin", "menu": "Bouillie + fruit en morceau (banane, mangue mûre)"},
            {"moment": "Midi", "menu": "Riz écrasé + sauce de feuilles (épinards, gombo) + poisson ou foufou doux + huile de palme"},
            {"moment": "Goûter", "menu": "Yaourt nature + biscuit sans sucre"},
            {"moment": "Soir", "menu": "Bouillie épaisse aux haricots + tétée"},
        ],
        "aliments_ok": ["Œuf entier cuit dur", "Viande hachée bien cuite", "Foufou doux", "Riz collant", "Pâtes bien cuites", "Légumes cuits en cubes", "Fromage doux"],
        "aliments_eviter": ["Bonbons", "Boissons gazeuses", "Aliments durs (cacahuètes entières, raisins entiers)", "Sel"],
        "tips": "Posez de petits morceaux fondants devant bébé pour qu'il prenne avec les doigts. C'est messy mais essentiel pour l'autonomie.",
    },
    {
        "etape": "12-18 mois",
        "age_min": 12, "age_max": 18,
        "title": "Repas familiaux adaptés 🍛",
        "intro": "Bébé peut manger comme la famille, mais sans sel, sans piment, et bien coupé.",
        "tetee": "Allaitement à la demande ou lait de croissance",
        "repas": [
            {"moment": "Matin", "menu": "Lait + pain ou bouillie + fruit"},
            {"moment": "Midi", "menu": "Repas familial sans sel/piment : riz/foufou/igname + sauce + viande/poisson + légumes"},
            {"moment": "Goûter", "menu": "Fruit + yaourt ou pain au lait"},
            {"moment": "Soir", "menu": "Soupe + féculent + protéine légère (œuf, poisson)"},
        ],
        "aliments_ok": ["Tous légumes cuits", "Tous fruits", "Viande/poisson/œuf quotidien", "Lait, yaourt, fromage", "Légumineuses (haricot, niébé)", "Céréales locales"],
        "aliments_eviter": ["Plats épicés (piment)", "Lait de vache cru", "Charcuterie", "Aliments très gras"],
        "tips": "3 repas + 1-2 collations. Ne forcez jamais bébé à finir son assiette. Eau à volonté entre les repas.",
    },
    {
        "etape": "18-24 mois",
        "age_min": 18, "age_max": 24,
        "title": "Petit gourmet autonome 🥢",
        "intro": "L'enfant mange seul à la cuillère. Texture quasi-normale.",
        "tetee": "Lait de croissance ou lait entier (500 ml/j)",
        "repas": [
            {"moment": "Matin", "menu": "Lait + tartine ou bouillie épaisse + fruit"},
            {"moment": "Midi", "menu": "Repas complet : féculent + protéine + légumes + petit dessert"},
            {"moment": "Goûter", "menu": "Fruit + produit laitier"},
            {"moment": "Soir", "menu": "Repas léger : soupe + œuf ou poisson + féculent"},
        ],
        "aliments_ok": ["Quasiment tout (sauf trop épicé/dur)", "Légumes crus tendres (concombre, tomate)", "Fruits secs en petits morceaux", "Pain", "Riz, pâtes, foufou normaux"],
        "aliments_eviter": ["Plats très épicés", "Aliments durs entiers (arachide entière)", "Excès de sucre"],
        "tips": "Variez les couleurs dans l'assiette. Mangez en famille pour donner l'exemple. Limitez les écrans pendant les repas.",
    },
]


# ----------------------------------------------------------------------
# JALONS DE DÉVELOPPEMENT — 0 à 72 mois
# Source : OMS + Société de Pédiatrie. 5 axes : Moteur, Cognitif, Langage, Affectif, Social
# Pour chaque âge : ce que l'enfant DEVRAIT faire (ok=majorité), et signaux d'alerte (rouge)
# ----------------------------------------------------------------------
JALONS = [
    {
        "age_mois": 2, "title": "2 mois 👶",
        "moteur": ["Tient brièvement sa tête en position ventrale", "Bouge bras et jambes activement"],
        "cognitif": ["Suit un objet du regard", "Réagit aux sons forts"],
        "langage": ["Émet des sons (areu)", "Pleure différemment selon ses besoins"],
        "affectif": ["Sourire social apparu", "Se calme dans les bras"],
        "social": ["Regarde les visages", "Reconnaît la voix de maman"],
        "alerte": ["Ne réagit pas aux bruits forts", "Pas de sourire à 2 mois", "Yeux qui ne suivent pas un objet"],
    },
    {
        "age_mois": 4, "title": "4 mois",
        "moteur": ["Tient sa tête fermement", "Pousse sur ses jambes en station debout aidée", "Saisit un objet placé dans sa main"],
        "cognitif": ["Suit des yeux dans toutes les directions", "Examine ses mains"],
        "langage": ["Babille en série de syllabes (ba-ba)", "Rit aux éclats"],
        "affectif": ["Sourit spontanément", "Imite certaines expressions"],
        "social": ["Aime jouer avec les autres", "Vocalise pour attirer l'attention"],
        "alerte": ["Ne sourit pas spontanément", "Ne tient pas sa tête", "Pas de babillage"],
    },
    {
        "age_mois": 6, "title": "6 mois",
        "moteur": ["Se retourne dos↔ventre", "Tient assis avec appui", "Attrape les objets et les passe d'une main à l'autre"],
        "cognitif": ["Cherche un objet caché partiellement", "Porte tout à la bouche"],
        "langage": ["Répond à son prénom", "Émet des consonnes (m, b, d)"],
        "affectif": ["Reconnaît les visages familiers vs étrangers", "Aime se regarder dans le miroir"],
        "social": ["Réagit aux émotions des autres", "Aime jouer avec ses parents"],
        "alerte": ["Pas de retournement", "Ne réagit pas à son prénom", "Yeux qui louchent en permanence"],
    },
    {
        "age_mois": 9, "title": "9 mois",
        "moteur": ["Se tient assis sans appui", "Rampe ou se déplace à 4 pattes", "Se tient debout en s'agrippant"],
        "cognitif": ["Cherche un objet caché entièrement", "Joue à coucou-caché"],
        "langage": ["Comprend 'non'", "Dit 'mama' ou 'papa' (sans signification précise)"],
        "affectif": ["Peur de l'inconnu (étrangers)", "Anxiété de séparation"],
        "social": ["Imite les sons et gestes", "Tend les bras pour être pris"],
        "alerte": ["Ne tient pas assis", "Ne reconnaît pas ses parents", "Pas de babillage doublé"],
    },
    {
        "age_mois": 12, "title": "12 mois — 1 an 🎂",
        "moteur": ["Marche avec appui (parfois seul)", "Tient debout seul", "Pince fine (pouce-index)"],
        "cognitif": ["Cherche un objet caché à plusieurs endroits", "Imite des actions (téléphoner, boire)"],
        "langage": ["Dit 1-3 mots simples (mama, papa, donne)", "Comprend des consignes simples"],
        "affectif": ["Donne un câlin", "Peur de l'inconnu marquée"],
        "social": ["Pointe du doigt ce qu'il veut", "Salue de la main 'au revoir'"],
        "alerte": ["Ne tient pas debout", "Ne pointe pas du doigt", "Aucun mot, aucune consonne"],
    },
    {
        "age_mois": 18, "title": "18 mois",
        "moteur": ["Marche bien seul", "Monte un escalier avec aide", "Boit à la tasse seul"],
        "cognitif": ["Sait à quoi sert un objet (peigne, brosse)", "Gribouille"],
        "langage": ["Dit 5-20 mots", "Désigne 1-2 parties du corps"],
        "affectif": ["Crises de colère possibles", "Câlins spontanés"],
        "social": ["Aime jouer à côté d'autres enfants", "Imite les adultes"],
        "alerte": ["Ne marche pas", "Aucun mot", "Pas de pointage ni d'imitation"],
    },
    {
        "age_mois": 24, "title": "24 mois — 2 ans 🎈",
        "moteur": ["Court", "Monte/descend escaliers seul", "Donne un coup de pied dans un ballon"],
        "cognitif": ["Construit une tour de 4-6 cubes", "Trie par formes ou couleurs"],
        "langage": ["Phrases de 2-3 mots", "Vocabulaire de 50+ mots"],
        "affectif": ["Affirmation de soi ('Non !')", "Joue à faire semblant"],
        "social": ["Joue à côté (parallèle) d'autres enfants", "Imite le quotidien (cuisiner, balayer)"],
        "alerte": ["Ne court pas", "Pas de phrases de 2 mots", "Ne joue pas à faire semblant"],
    },
    {
        "age_mois": 36, "title": "36 mois — 3 ans",
        "moteur": ["Saute à pieds joints", "Pédale (tricycle)", "S'habille en partie seul"],
        "cognitif": ["Compte jusqu'à 3", "Connait 4 couleurs", "Dessine un rond"],
        "langage": ["Phrases de 3-5 mots", "Pose des questions ('pourquoi ?')"],
        "affectif": ["Comprend les émotions des autres", "Peut partager (avec aide)"],
        "social": ["Joue avec les autres", "Imite les jeux de rôle"],
        "alerte": ["Ne fait pas de phrase", "Ne joue pas à faire semblant", "Régression du langage"],
    },
    {
        "age_mois": 48, "title": "48 mois — 4 ans",
        "moteur": ["Saute sur un pied", "Découpe avec ciseaux à bouts ronds", "Lance et attrape une balle"],
        "cognitif": ["Connait son nom complet et son âge", "Compte jusqu'à 10", "Dessine un bonhomme avec 3 parties"],
        "langage": ["Raconte une petite histoire", "Comprend 'avant/après'"],
        "affectif": ["Comprend ce qui est juste/injuste", "Aime aider"],
        "social": ["Coopère avec d'autres enfants", "Respecte des règles simples"],
        "alerte": ["Ne saute pas sur un pied", "Pas de phrases compréhensibles par les étrangers", "Difficultés relationnelles marquées"],
    },
    {
        "age_mois": 60, "title": "60 mois — 5 ans 🎒",
        "moteur": ["Tient sur un pied 10 sec", "Écrit son prénom", "Saute à la corde"],
        "cognitif": ["Sait son nom, prénom, âge, adresse partielle", "Compte jusqu'à 20", "Reconnait quelques lettres"],
        "langage": ["Raconte une histoire complète", "Utilise le passé/présent/futur"],
        "affectif": ["Cherche à plaire", "Comprend les conséquences de ses actes"],
        "social": ["A des amis préférés", "Joue à des jeux avec règles"],
        "alerte": ["Ne s'intéresse pas aux autres", "Pas d'autonomie pour s'habiller", "Langage incompréhensible aux étrangers"],
    },
    {
        "age_mois": 72, "title": "72 mois — 6 ans 🏫",
        "moteur": ["Coordination fine pour écrire", "Sait nager (avec apprentissage)", "Fait du vélo sans roulettes"],
        "cognitif": ["Lecture débutante", "Compte > 50", "Comprend le concept du temps"],
        "langage": ["Vocabulaire riche (2000+ mots)", "Conjugue correctement"],
        "affectif": ["Régulation émotionnelle progresse", "Empathie marquée"],
        "social": ["Adapté à la vie scolaire", "Coopération en groupe"],
        "alerte": ["Difficultés majeures à l'école dès le début", "Difficulté à se concentrer plus de 5 min", "Pas d'amis"],
    },
]


def get_foetus_week(sa: int):
    """Retourne le contenu pour la SA donnée (clamp 4-41)."""
    if sa < 4:
        sa = 4
    if sa > 41:
        sa = 41
    data = FOETUS_SEMAINE.get(sa, FOETUS_SEMAINE[max(k for k in FOETUS_SEMAINE if k <= sa)])
    return {"sa": sa, **data}


def get_diversification_step(age_mois: int):
    """Retourne l'étape de diversification correspondante à l'âge en mois."""
    for step in DIVERSIFICATION:
        if step["age_min"] <= age_mois <= step["age_max"]:
            return step
    if age_mois < 6:
        return None
    return DIVERSIFICATION[-1]  # 18-24 fallback


def get_jalons_for_age(age_mois: int):
    """Retourne le jalon correspondant à l'âge (le plus proche inférieur ou égal)."""
    eligible = [j for j in JALONS if j["age_mois"] <= age_mois]
    if not eligible:
        return None
    return max(eligible, key=lambda j: j["age_mois"])
