# À lo Maman — Mobile App PRD

## Overview
Plateforme mobile Expo de santé maternelle & pédiatrique pour l'Afrique francophone. 4 phases livrées : Core, Advanced, Advanced+, Monetization.

## Users : Maman · Professionnel · Admin

## Phases livrées

### Phase 1 (Core)
Auth JWT/bcrypt · Dashboards rôle-based · Grossesse · Enfants+vaccins · RDV · Messagerie · Communauté · Assistant IA Claude Sonnet 4.5 · Admin console.

### Phase 2 (Advanced)
Photos base64 · Mesures · Cycle + prédictions · Contraception · Post-partum (humeur+allaitement) · Notifications in-app auto · Recherche · Vidéo-consultation Jitsi.

### Phase 3 (Advanced+)
FHIR Export Bundle · Télé-échographie · Déclaration de naissance · Expo Push réel · Cache hors-ligne.

### Phase 4 (Monétisation PayDunya) 💰 **NOUVEAU**
- **Abonnement Maman Premium** : 5 000 FCFA/mois (débloque IA illimitée, vidéo prioritaire, FHIR illimité, stockage photos, rappels auto)
- **Paiement consultation** : pro fixe son tarif (par défaut 10 000 FCFA), plateforme prend **10% de commission**, pro reçoit 90%
- **Moyens de paiement** via PayDunya : Orange Money, MTN MoMo, Wave, Moov, Free Money, Visa/Mastercard
- **Historique paiements** par utilisateur (/pay/history)
- **Dashboard admin revenus** : total revenus, commission plateforme, reversé pros, nb abonnements, nb consultations (/pay/admin/stats)
- **Webhook** PayDunya `/api/pay/webhook` (IPN) + vérification manuelle `/api/pay/verify/{token}`
- **Flag `premium` + `premium_until`** sur User, activé automatiquement après paiement confirmé
- **Landing page de retour** HTML `/api/pay/return` après paiement

## Configuration PayDunya
Ajouter dans `/app/backend/.env` :
```
PAYDUNYA_MASTER_KEY=votre_clé
PAYDUNYA_PRIVATE_KEY=votre_clé
PAYDUNYA_TOKEN=votre_clé
PAYDUNYA_MODE=live
```
(Obtenir depuis https://app.paydunya.com → API Keys)

## Endpoints (60+)
Auth · Grossesse · Enfants · RDV · Messages · Community · Reminders · AI · Admin · Pro · Cycle · Contraception · Allaitement · Humeur · Notifications · Push-token · Search · Video-link · FHIR · Tele-echo · Naissance · **Pay subscribe/consultation/verify/history/webhook/admin-stats**

## Écrans (27+)
Auth(3) · Tabs(10) · Stack(14) : Chat · Cycle · Contraception · Post-partum · Search · Notifications · Video-call · FHIR · Tele-echo · Naissance · **Premium** · (+détail paiement)

## Test Credentials
Voir `/app/memory/test_credentials.md`

## Tests
- Phase 2 : 36/36 pytest ✓
- Phase 3 : 29/29 pytest ✓
- Phase 4 : endpoints validés manuellement (curl) — succès avec clés PayDunya absentes (retour d'erreur clair)

## Business Model
- **Revenus directs** : abonnements Premium (récurrent 5k FCFA/mois)
- **Revenus transactionnels** : 10% sur chaque RDV payant
- **Revenus B2B futurs** : API FHIR pour cliniques/hôpitaux partenaires

## Phase 8 — VoiceQA sur Suivi médical Grossesse + (Feb 2026)
Extension du mode vocal au tracking médical premium pour saisie hands-free des symptômes (utile en fin de grossesse / avec bébé dans les bras).
- Bouton "🎤 Mode vocal — répondre oui/non à chaque symptôme" au-dessus de la grille des 12 symptômes (nausées, vomissements, fatigue, insomnie, œdèmes, crampes, Braxton-Hicks, brûlures d'estomac, constipation, maux de dos, vertiges, essoufflement).
- Modal séquentiel avec barre de progression : pour chaque symptôme une question contextualisée (ex: « Vous essoufflez-vous facilement, même au repos ? ») + VoiceQA (TTS auto-lecture + STT capture oui/non).
- Boutons tactiles OUI/NON gros (44×44+) en fallback du vocal.
- Avance automatique au symptôme suivant après chaque réponse.
- Symptômes cochés sont propagés au formulaire de saisie habituel et envoyés via `smartPost` (offline-safe).

## Phase 7 — M-CHAT-R/F Follow-up Interview complet (Feb 2026)
Extension du module TND avec l'**entretien détaillé M-CHAT-R/F** officiel pour confirmer/écarter les signaux du dépistage initial.
- 20 items du M-CHAT-R mappés à 2-3 questions de confirmation chacun (60 questions de follow-up au total) avec règles `pass_logic` officielles.
- Backend : `GET /api/tnd/followup/{screening_id}` (retourne uniquement les items échoués + leurs questions) + `POST /api/tnd/followup/{screening_id}` (recalcule score final 0-1=faible / 2-7=modere / 8+=eleve).
- Frontend : nouveau wizard `/enfants/[id]/tnd/[screeningId]/followup` avec barre de progression globale, pastilles par item, navigation Précédent/Suivant, intégration complète VoiceQA (TTS + STT vocal "oui"/"non").
- CTA "Entretien détaillé M-CHAT-R/F" affiché sur le rapport pour les niveaux modéré/élevé, masqué après réalisation.
- Bloc "APRÈS ENTRETIEN DÉTAILLÉ" affiché dans le rapport avec score raffiné.
- Mode offline : `cachedGet` + `smartPost` (file d'attente locale en cas de réseau coupé).

## Phase 6 — Accessibilité vocale + Offline DMP/TND (Feb 2026)
Mode vocal complet et mode hors-ligne pour les modules de dépistage médical, optimisés pour mamans peu lettrées en zone rurale.
- **Composant VoiceQA** réutilisable (`/components/VoiceQA.tsx`) : TTS lecture des questions en français (expo-speech) + STT capture vocale "oui"/"non" tolérante (expo-speech-recognition, fonctionne sur iOS/Android/Web).
- Détection d'intentions tolérante : "voilà", "ouais", "awo" (Dioula), "absolument", "pas du tout", "ayi" (Dioula), "jamais".
- Intégré dans le **bilan rapide DMP** (52 jalons / 7 domaines) et le **dépistage TND M-CHAT-R** (20 questions / 0-6 ans).
- **Mode hors-ligne** : `cachedGet` + `smartPost`/`smartDelete` sur tous les écrans (liste DMP, détail DMP, bilan, liste TND, nouveau TND). Bannière "📡 Hors-ligne" affichée + file d'attente locale flushée automatiquement à la reconnexion.
- Permissions : `NSSpeechRecognitionUsageDescription` (iOS) + plugin `expo-speech-recognition` configuré.

## Deferred
2FA · Mode offline mutations queue · Refactor modulaire backend · Upgrade versions Expo (`npx expo install --fix`)

## Phase 5 — Grossesse + Premium (Feb 2026)
Module premium dédié inspiré Pregnancy+ (Philips) adapté contexte ivoirien.
- Réservé Maman Premium (5 000 F/mois) — module gratuit existant inchangé
- 14 endpoints `/api/grossesse-plus/*` : dashboard, setup (DDR/DPA/écho), tracking médical hebdomadaire avec **alertes intelligentes** (pré-éclampsie, diabète gestationnel, prise poids excessive, fièvre, mouvements diminués), journal (notes + photos écho + humeur), compteur de contractions avec analyse intervalles, trousseau maternité (17 items contextuels ivoiriens), consentement granulaire (pro/centre/famille), exercices de respiration guidée (4 protocoles), calendrier CPN intelligent (10 RDV importants), déclaration de naissance avec auto-création carnet de l'enfant.
- Fiche éducative 38 semaines (SA 4→41) : taille/poids estimé, fruit-comparaison, développement bébé, changements maman, conseils localisés.
- Frontend : 9 écrans `/app/frontend/app/grossesse-plus/*` (index, setup, semaines, semaine/[w], suivi, journal, contractions, trousseau, respiration, cpn, naissance) + Stack layout.
- Backend tests : **42/42 PASS** (`/app/backend_test_grossesse_plus.py`)

## Correctif Courbes OMS (Oct 2026)
- Backend `_month_diff` : calcul de l’âge sur la partie date (corrige l’âge = 0 pour les dates ISO avec heure/fuseau).
- Frontend `croissance/[id].tsx` : axe X adaptatif (6/12/24/36/60 mois), axe Y à pas « ronds », bandes P3–P97 et P15–P85, largeur mesurée via onLayout, ligne reliant les points du bébé, titres d’axes.
