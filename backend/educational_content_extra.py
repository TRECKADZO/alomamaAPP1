"""
Contenus éducatifs additionnels (priorité moyenne).
- Checklist "Maison sécurisée" par pièce (adapté Afrique de l'Ouest)
- Glossaire médical A→Z
- Activités/jeux par tranche d'âge (avec idées low-cost)
- Quiz auto-évaluation (anémie grossesse, dépression postnatale, sommeil bébé)
"""

# ----------------------------------------------------------------------
# 🏠 MAISON SÉCURISÉE — checklist par pièce
# ----------------------------------------------------------------------
MAISON_SECURISEE = [
    {
        "piece": "Salon",
        "icon": "tv-outline",
        "color": "#3B82F6",
        "items": [
            {"id": "salon_1", "text": "Prises électriques protégées par cache-prises", "danger": "high"},
            {"id": "salon_2", "text": "Meubles lourds (bibliothèque, télévision) fixés au mur", "danger": "high"},
            {"id": "salon_3", "text": "Coins des tables/meubles protégés (mousses)", "danger": "medium"},
            {"id": "salon_4", "text": "Tapis antidérapants ou fixés", "danger": "medium"},
            {"id": "salon_5", "text": "Petits objets (pièces de monnaie, billes) hors de portée", "danger": "high"},
            {"id": "salon_6", "text": "Plantes toxiques retirées (laurier-rose, dieffenbachia)", "danger": "medium"},
            {"id": "salon_7", "text": "Fenêtres avec barreaux ou bloque-fenêtres", "danger": "high"},
            {"id": "salon_8", "text": "Fils électriques cachés ou regroupés", "danger": "medium"},
        ],
    },
    {
        "piece": "Cuisine",
        "icon": "restaurant-outline",
        "color": "#F59E0B",
        "items": [
            {"id": "cuisine_1", "text": "Poignées de casserole tournées vers l'intérieur sur le feu", "danger": "high"},
            {"id": "cuisine_2", "text": "Bouteille de gaz sécurisée (en hauteur ou fermée à clé)", "danger": "high"},
            {"id": "cuisine_3", "text": "Charbon/bois de feu dans un lieu inaccessible aux enfants", "danger": "high"},
            {"id": "cuisine_4", "text": "Couteaux et ciseaux rangés en hauteur", "danger": "high"},
            {"id": "cuisine_5", "text": "Produits ménagers (eau de Javel, savon) sous clé", "danger": "high"},
            {"id": "cuisine_6", "text": "Eau bouillante jamais laissée sans surveillance", "danger": "high"},
            {"id": "cuisine_7", "text": "Sacs en plastique rangés (risque d'étouffement)", "danger": "high"},
            {"id": "cuisine_8", "text": "Allumettes et briquets hors de portée", "danger": "high"},
        ],
    },
    {
        "piece": "Chambre bébé",
        "icon": "bed-outline",
        "color": "#EC4899",
        "items": [
            {"id": "chambre_1", "text": "Lit conforme aux normes (barreaux espacés <6 cm)", "danger": "high"},
            {"id": "chambre_2", "text": "Pas d'oreiller, ni de couverture épaisse, ni peluches dans le berceau (<1 an)", "danger": "high"},
            {"id": "chambre_3", "text": "Bébé toujours couché sur le dos pour dormir", "danger": "high"},
            {"id": "chambre_4", "text": "Moustiquaire imprégnée installée et bien attachée", "danger": "high"},
            {"id": "chambre_5", "text": "Table à langer sécurisée (sangle ou sur le sol)", "danger": "medium"},
            {"id": "chambre_6", "text": "Veilleuse douce (pas trop forte)", "danger": "low"},
            {"id": "chambre_7", "text": "Température de la chambre : 18-20°C", "danger": "low"},
            {"id": "chambre_8", "text": "Aucun fil ou cordon (rideaux) près du berceau", "danger": "high"},
        ],
    },
    {
        "piece": "Salle de bain",
        "icon": "water-outline",
        "color": "#06B6D4",
        "items": [
            {"id": "sdb_1", "text": "Bébé jamais laissé seul dans la baignoire/bassine", "danger": "high"},
            {"id": "sdb_2", "text": "Tapis antidérapant dans la baignoire/douche", "danger": "high"},
            {"id": "sdb_3", "text": "Eau du bain testée (37°C) avant d'y mettre bébé", "danger": "high"},
            {"id": "sdb_4", "text": "Médicaments rangés en hauteur ou sous clé", "danger": "high"},
            {"id": "sdb_5", "text": "Produits cosmétiques hors de portée", "danger": "medium"},
            {"id": "sdb_6", "text": "WC fermés (couvercle baissé ou sécurité enfant)", "danger": "medium"},
            {"id": "sdb_7", "text": "Pas de seau d'eau accessible aux jeunes enfants", "danger": "high"},
        ],
    },
    {
        "piece": "Cour / extérieur",
        "icon": "leaf-outline",
        "color": "#10B981",
        "items": [
            {"id": "cour_1", "text": "Puits / fosse / citerne couverts solidement", "danger": "high"},
            {"id": "cour_2", "text": "Bassine / seau d'eau jamais laissés pleins en accès libre", "danger": "high"},
            {"id": "cour_3", "text": "Portail / barrière de la cour fermés", "danger": "high"},
            {"id": "cour_4", "text": "Animaux domestiques surveillés près des enfants", "danger": "medium"},
            {"id": "cour_5", "text": "Zone de jeu sans débris (verre, métal rouillé)", "danger": "medium"},
            {"id": "cour_6", "text": "Insecticides / produits agricoles rangés", "danger": "high"},
            {"id": "cour_7", "text": "Hamacs / cordes vérifiés régulièrement", "danger": "medium"},
            {"id": "cour_8", "text": "Bébé protégé du soleil direct (chapeau, ombre)", "danger": "medium"},
        ],
    },
]


# ----------------------------------------------------------------------
# 📖 GLOSSAIRE MÉDICAL A→Z
# ----------------------------------------------------------------------
GLOSSAIRE = [
    {"terme": "Acide folique", "definition": "Vitamine B9 essentielle au début de grossesse pour prévenir les malformations du tube neural du bébé. À prendre dès le projet de grossesse et jusqu'à 12 SA."},
    {"terme": "Allaitement maternel exclusif", "definition": "L'enfant ne reçoit que du lait maternel (pas d'eau, pas de tisanes), recommandé par l'OMS jusqu'aux 6 mois."},
    {"terme": "Aménorrhée", "definition": "Absence de règles. La grossesse est mesurée en semaines d'aménorrhée (SA), à partir du premier jour des dernières règles."},
    {"terme": "Anémie", "definition": "Manque de fer ou d'autres nutriments dans le sang. Fréquente pendant la grossesse. Symptômes : fatigue, pâleur, essoufflement."},
    {"terme": "Anesthésie péridurale", "definition": "Injection de produit anesthésique dans le bas du dos pour calmer les douleurs de l'accouchement."},
    {"terme": "Apgar", "definition": "Note de 0 à 10 attribuée au bébé à 1, 5 et 10 minutes après la naissance pour évaluer sa santé (rythme cardiaque, respiration, tonus, couleur, réflexes)."},
    {"terme": "BCG", "definition": "Vaccin contre la tuberculose, donné à la naissance dans la plupart des pays africains."},
    {"terme": "Bouchon muqueux", "definition": "Petite perte glaireuse rosée ou brunâtre, souvent signe que le travail approche (quelques heures à quelques jours avant l'accouchement)."},
    {"terme": "Césarienne", "definition": "Intervention chirurgicale pour faire naître le bébé par une incision dans le ventre, lorsque l'accouchement par voie naturelle est impossible ou risqué."},
    {"terme": "CMU", "definition": "Couverture Maladie Universelle. En Côte d'Ivoire, sécurité sociale qui prend en charge une partie des frais médicaux."},
    {"terme": "Col de l'utérus", "definition": "Partie basse de l'utérus qui s'ouvre lors de l'accouchement (dilatation jusqu'à 10 cm)."},
    {"terme": "Colostrum", "definition": "Premier lait maternel produit, jaunâtre et épais, très riche en anticorps. Précieux pour le nouveau-né."},
    {"terme": "Contraction", "definition": "Resserrement involontaire de l'utérus. Pendant la grossesse : ressenti comme un ventre dur. Pendant l'accouchement : régulières et douloureuses."},
    {"terme": "Cordon ombilical", "definition": "Lien entre le bébé et le placenta, par lequel passent oxygène et nutriments pendant la grossesse."},
    {"terme": "Diabète gestationnel", "definition": "Élévation du taux de sucre dans le sang pendant la grossesse. Dépisté entre 24-28 SA. Nécessite un suivi alimentaire strict."},
    {"terme": "DPA", "definition": "Date Présumée d'Accouchement. Calculée à 40 SA + 0 jour à partir du 1er jour des dernières règles."},
    {"terme": "Échographie", "definition": "Examen utilisant les ultrasons pour visualiser le bébé. 3 échographies obligatoires : 12, 22 et 32 SA."},
    {"terme": "Épisiotomie", "definition": "Petite incision pratiquée à la sortie du vagin pour faciliter le passage du bébé. Pas systématique."},
    {"terme": "Fer", "definition": "Minéral essentiel pendant la grossesse. Aliments riches : foie, viande rouge, niébé, épinards. À associer à de la vitamine C (mangue, orange) pour mieux l'absorber."},
    {"terme": "Foetus", "definition": "Nom donné au bébé in utero à partir de la 9e semaine de grossesse jusqu'à la naissance."},
    {"terme": "Forceps / Ventouse", "definition": "Instruments utilisés pendant l'accouchement pour aider à sortir le bébé en cas de difficulté."},
    {"terme": "Gencives qui saignent", "definition": "Fréquent pendant la grossesse à cause des hormones. Brossez doucement, évitez les bains de bouche alcoolisés."},
    {"terme": "Glaire cervicale", "definition": "Sécrétion produite par le col de l'utérus. Sa texture change au cours du cycle (signe d'ovulation = transparente et étirable)."},
    {"terme": "Hémoglobine", "definition": "Protéine des globules rouges qui transporte l'oxygène. Sa baisse signe une anémie."},
    {"terme": "Listériose", "definition": "Infection bactérienne dangereuse pour le fœtus. Évitez : fromages au lait cru, poisson cru, charcuterie. Lavez fruits et légumes."},
    {"terme": "Lochies", "definition": "Saignements après l'accouchement, durent 4 à 6 semaines. Hygiène stricte requise."},
    {"terme": "Méconium", "definition": "Premières selles du nouveau-né, très foncées et collantes. Évacuées dans les 24-48h après la naissance."},
    {"terme": "Montée de lait", "definition": "Apparition du vrai lait maternel 2-4 jours après l'accouchement. Seins gonflés et chauds."},
    {"terme": "Mucoviscidose", "definition": "Maladie génétique grave dépistée à la naissance par le test de Guthrie."},
    {"terme": "Œdème", "definition": "Gonflement (chevilles, mains, visage). Fréquent en fin de grossesse. Si soudain ou massif → consulter."},
    {"terme": "Ovulation", "definition": "Libération d'un ovule par l'ovaire, généralement au milieu du cycle (J14 pour un cycle de 28 jours)."},
    {"terme": "Paludisme", "definition": "Infection parasitaire transmise par les moustiques. Particulièrement dangereux pendant la grossesse. Prévention : moustiquaire imprégnée + chimioprophylaxie si recommandée."},
    {"terme": "Périnée", "definition": "Ensemble des muscles entre le vagin et l'anus. La rééducation périnéale après l'accouchement est essentielle."},
    {"terme": "Placenta", "definition": "Organe qui nourrit le bébé pendant la grossesse. Expulsé après l'accouchement."},
    {"terme": "Pré-éclampsie", "definition": "Complication grave de la grossesse (tension élevée + protéines dans urines). Symptômes : maux de tête, vue trouble, œdèmes massifs. URGENCE."},
    {"terme": "Prélèvement vaginal", "definition": "Test fait à 35-37 SA pour rechercher le streptocoque B (transmissible au bébé pendant l'accouchement)."},
    {"terme": "Rupture de la poche des eaux", "definition": "Écoulement clair (parfois en jet) signalant le début du travail. Direction maternité dans les heures suivantes."},
    {"terme": "SA", "definition": "Semaine d'Aménorrhée. Compte le nombre de semaines depuis le premier jour des dernières règles. Une grossesse à terme = 41 SA."},
    {"terme": "Sage-femme", "definition": "Professionnelle de santé qui suit la grossesse, l'accouchement et les premières semaines après la naissance. Compétente pour les grossesses normales."},
    {"terme": "Syndrome de mort subite du nourrisson", "definition": "Décès brutal et inexpliqué d'un bébé pendant le sommeil. Prévention : couchage sur le dos, sans oreiller, dans un environnement non fumeur."},
    {"terme": "Toxoplasmose", "definition": "Parasitose transmise par viande crue, légumes mal lavés, ou contact avec excréments de chat. Dangereuse pour le fœtus si attrapée pendant la grossesse."},
    {"terme": "Trimestre", "definition": "La grossesse est divisée en 3 trimestres : T1 (jusqu'à 14 SA), T2 (14-28 SA), T3 (28 SA → naissance)."},
    {"terme": "Tube neural", "definition": "Structure embryonnaire qui forme le cerveau et la moelle épinière. L'acide folique prévient les anomalies."},
    {"terme": "Utérus", "definition": "Organe musculaire creux qui abrite le bébé pendant la grossesse."},
    {"terme": "Vergetures", "definition": "Marques sur la peau dues à l'étirement (ventre, seins, cuisses). Hydratez avec beurre de karité ou huile de coco."},
    {"terme": "VIH/SIDA", "definition": "Le dépistage est systématique en début de grossesse. Si la mère est séropositive, un traitement permet d'éviter la transmission au bébé."},
    {"terme": "Vitamine D", "definition": "Essentielle pour la croissance osseuse du bébé. Se synthétise sous le soleil. Supplémentation recommandée pendant la grossesse et chez le nouveau-né."},
]


# ----------------------------------------------------------------------
# 🎮 ACTIVITÉS / JEUX par tranche d'âge (idées low-cost)
# ----------------------------------------------------------------------
ACTIVITES = [
    {
        "age_min": 0, "age_max": 6,
        "title": "0-6 mois — Éveil sensoriel",
        "categories": [
            {
                "nom": "Éveil sensoriel",
                "items": [
                    "Hochet fait maison (bouteille en plastique avec graines de mil)",
                    "Mobile coloré au-dessus du berceau (avec tissus pagne)",
                    "Massage doux après le bain (huile de coco)",
                    "Chanter et fredonner des berceuses traditionnelles",
                ]
            },
            {
                "nom": "Motricité",
                "items": [
                    "Temps sur le ventre (5-10 min plusieurs fois par jour)",
                    "Lui présenter des objets variés à attraper",
                    "Mettre un miroir face à lui",
                ]
            }
        ]
    },
    {
        "age_min": 6, "age_max": 12,
        "title": "6-12 mois — Découverte",
        "categories": [
            {
                "nom": "Manipulation",
                "items": [
                    "Cubes en bois ou boîtes vides à empiler",
                    "Cuillère en bois et bol pour 'cuisiner'",
                    "Sac à textures (toile, soie, jute, coton)",
                    "Boîte avec couvercle à ouvrir/fermer",
                ]
            },
            {
                "nom": "Motricité globale",
                "items": [
                    "Coussins/draps roulés pour explorer",
                    "Jouer à 4 pattes derrière un coussin (cache-cache)",
                    "Tirer une corde avec un objet attaché",
                ]
            }
        ]
    },
    {
        "age_min": 12, "age_max": 24,
        "title": "12-24 mois — Imitation",
        "categories": [
            {
                "nom": "Imitation du quotidien",
                "items": [
                    "Balayer avec une petite branche",
                    "Aider à plier le linge",
                    "Jouer à 'cuisiner' avec ustensiles",
                    "Téléphone vocal (boîte vide)",
                ]
            },
            {
                "nom": "Motricité fine",
                "items": [
                    "Encastrer des bouchons de bouteille de différentes tailles",
                    "Empiler 3-5 cubes",
                    "Trier cailloux par couleur",
                ]
            },
            {
                "nom": "Langage",
                "items": [
                    "Lire des livres images",
                    "Chanter en faisant des gestes",
                    "Nommer les parties du corps",
                ]
            }
        ]
    },
    {
        "age_min": 24, "age_max": 36,
        "title": "2-3 ans — Imagination",
        "categories": [
            {
                "nom": "Jeux symboliques",
                "items": [
                    "Poupée + 'dînette' avec restes",
                    "Construire une cabane avec draps",
                    "Cheval-bâton avec branche",
                    "Dessiner avec craie sur le sol",
                ]
            },
            {
                "nom": "Motricité",
                "items": [
                    "Sauter à pieds joints",
                    "Pédaler (tricycle)",
                    "Lancer une balle/balle de chiffon",
                    "Marche sur une ligne",
                ]
            },
            {
                "nom": "Cognitif",
                "items": [
                    "Tri par couleur (légumes/cailloux)",
                    "Suivre les recettes simples (rouler le foufou)",
                    "Compter jusqu'à 5 avec les doigts",
                ]
            }
        ]
    },
    {
        "age_min": 36, "age_max": 60,
        "title": "3-5 ans — Apprentissage",
        "categories": [
            {
                "nom": "Jeux éducatifs",
                "items": [
                    "Memory avec cartes faites maison",
                    "Domino traditionnel",
                    "Awalé (jeu de calcul)",
                    "Reconnaître les lettres dans son prénom",
                ]
            },
            {
                "nom": "Créatif",
                "items": [
                    "Peinture aux doigts (avec terre rouge)",
                    "Coller du papier (collage)",
                    "Modeler avec argile",
                    "Construire des animaux en feuilles de bananier",
                ]
            },
            {
                "nom": "Social",
                "items": [
                    "Jeu de société à règles simples",
                    "Théâtre/marionnettes",
                    "Chants en groupe",
                    "Aide à la cuisine (sous surveillance)",
                ]
            }
        ]
    },
    {
        "age_min": 60, "age_max": 96,
        "title": "5-8 ans — École et autonomie",
        "categories": [
            {
                "nom": "Apprentissages scolaires",
                "items": [
                    "Lecture à voix haute ensemble",
                    "Petit cahier d'écriture",
                    "Tables de multiplication par jeu",
                    "Compter la monnaie réelle",
                ]
            },
            {
                "nom": "Sport",
                "items": [
                    "Football / volley dans la cour",
                    "Saut à la corde",
                    "Vélo (avec/sans roulettes)",
                    "Nage (apprentissage encadré)",
                ]
            },
            {
                "nom": "Autonomie",
                "items": [
                    "Petites missions à la maison (mettre la table)",
                    "Soin des animaux/jardin",
                    "Jeux de stratégie (échecs, dames)",
                ]
            }
        ]
    }
]


def get_activities_for_age(age_mois: int):
    """Retourne les activités adaptées à l'âge en mois."""
    for a in ACTIVITES:
        if a["age_min"] <= age_mois < a["age_max"]:
            return a
    if age_mois >= 96:
        return ACTIVITES[-1]
    return ACTIVITES[0]


# ----------------------------------------------------------------------
# 🩺 QUIZ AUTO-ÉVALUATION
# ----------------------------------------------------------------------
QUIZZES = {
    "anemie": {
        "title": "Test rapide : suis-je à risque d'anémie ?",
        "intro": "L'anémie est fréquente chez la femme enceinte. Ce quiz n'est pas un diagnostic — il vous oriente vers une consultation si nécessaire.",
        "questions": [
            {"q": "Vous sentez-vous souvent très fatiguée, même au repos ?", "p": 2},
            {"q": "Êtes-vous essoufflée à l'effort modéré (monter quelques marches) ?", "p": 2},
            {"q": "Avez-vous la peau ou les muqueuses pâles (lèvres, paupières inférieures) ?", "p": 3},
            {"q": "Avez-vous des vertiges fréquents ?", "p": 2},
            {"q": "Mangez-vous rarement de la viande, du poisson ou des légumineuses ?", "p": 2},
            {"q": "Avez-vous des envies inhabituelles (terre, glace, craie) ?", "p": 3},
            {"q": "Avez-vous le cœur qui bat vite sans raison ?", "p": 1},
            {"q": "Avez-vous des maux de tête fréquents ?", "p": 1},
        ],
        "thresholds": [
            {"max": 3, "level": "low", "title": "Risque faible 💚", "msg": "Vos symptômes ne suggèrent pas d'anémie marquée. Continuez une alimentation équilibrée riche en fer (foie, niébé, épinards)."},
            {"max": 8, "level": "medium", "title": "Risque modéré ⚠️", "msg": "Quelques signes d'anémie possible. Parlez-en à votre pro lors de votre prochaine consultation et demandez un dosage de l'hémoglobine."},
            {"max": 99, "level": "high", "title": "Risque élevé 🚨", "msg": "Plusieurs signes évocateurs. Consultez RAPIDEMENT pour un bilan sanguin (NFS). Une supplémentation en fer pourra être prescrite."},
        ],
    },
    "depression_postpartum": {
        "title": "Test rapide : baby-blues ou dépression postnatale ?",
        "intro": "70% des mamans ressentent un baby-blues (passager). Si les symptômes persistent au-delà de 2 semaines après l'accouchement, il peut s'agir de dépression postnatale, qui se soigne très bien.",
        "questions": [
            {"q": "Pleurez-vous sans raison apparente ?", "p": 2},
            {"q": "Êtes-vous triste la plupart du temps ?", "p": 3},
            {"q": "Avez-vous du mal à vous occuper de votre bébé ?", "p": 3},
            {"q": "Vous sentez-vous coupable d'être une 'mauvaise mère' ?", "p": 3},
            {"q": "Avez-vous perdu l'appétit ?", "p": 1},
            {"q": "Avez-vous du mal à dormir même quand bébé dort ?", "p": 2},
            {"q": "Avez-vous des pensées noires ou de mort ?", "p": 5},
            {"q": "Vous isolez-vous des amis et de la famille ?", "p": 2},
            {"q": "Cela fait-il plus de 2 semaines que ça dure ?", "p": 3},
        ],
        "thresholds": [
            {"max": 4, "level": "low", "title": "Probable baby-blues 💚", "msg": "Quelques symptômes passagers, c'est normal. Reposez-vous, demandez de l'aide à vos proches et parlez-en. Si ça persiste, consultez."},
            {"max": 10, "level": "medium", "title": "Vigilance requise ⚠️", "msg": "Vos symptômes durent. Consultez votre sage-femme ou médecin. La dépression postnatale se soigne très bien."},
            {"max": 99, "level": "high", "title": "Consultation urgente 🚨", "msg": "Vos réponses suggèrent une souffrance importante. APPELEZ votre médecin AUJOURD'HUI. Vous n'êtes pas seule, ce n'est pas votre faute, et ça se traite."},
        ],
    },
    "sommeil_bebe": {
        "title": "Mon bébé dort-il bien ?",
        "intro": "Un bon sommeil est essentiel pour la croissance. Ce quiz fait le point pour les bébés de 0 à 12 mois.",
        "questions": [
            {"q": "Bébé dort-il au moins 14h par 24h (siestes incluses) ?", "p": 0, "inverse": True},
            {"q": "Met-il plus de 30 min à s'endormir le soir ?", "p": 2},
            {"q": "Se réveille-t-il plus de 4 fois par nuit (au-delà de 4 mois) ?", "p": 3},
            {"q": "Pleure-t-il très fort en se réveillant ?", "p": 1},
            {"q": "Refuse-t-il de dormir seul ?", "p": 1},
            {"q": "Avez-vous des rituels du coucher (bain, chanson) ?", "p": 0, "inverse": True},
            {"q": "La chambre est-elle entre 18-20°C ?", "p": 0, "inverse": True},
            {"q": "Bébé dort-il sur le dos sans oreiller ?", "p": 0, "inverse": True},
            {"q": "Vous épuisez-vous au point d'être à bout ?", "p": 3},
        ],
        "thresholds": [
            {"max": 3, "level": "low", "title": "Tout va bien 💚", "msg": "Le sommeil de bébé semble bon. Continuez vos rituels !"},
            {"max": 7, "level": "medium", "title": "Quelques ajustements ⚠️", "msg": "Mettez en place un rituel apaisant (bain, berceuse, chambre tamisée). Régularité = clé. Si pas d'amélioration en 2 semaines, parlez-en à votre pédiatre."},
            {"max": 99, "level": "high", "title": "À approfondir 🚨", "msg": "Le sommeil semble très perturbé. Consultez un pédiatre pour exclure une cause médicale (reflux, otite, allergie). Pensez à vous : demandez de l'aide pour vous reposer."},
        ],
    },
}
