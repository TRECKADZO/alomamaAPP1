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

## Deferred
2FA · Mode offline mutations queue · Refactor modulaire backend · Upgrade versions Expo (`npx expo install --fix`)

## Phase 5 — Grossesse + Premium (Feb 2026)
Module premium dédié inspiré Pregnancy+ (Philips) adapté contexte ivoirien.
- Réservé Maman Premium (5 000 F/mois) — module gratuit existant inchangé
- 14 endpoints `/api/grossesse-plus/*` : dashboard, setup (DDR/DPA/écho), tracking médical hebdomadaire avec **alertes intelligentes** (pré-éclampsie, diabète gestationnel, prise poids excessive, fièvre, mouvements diminués), journal (notes + photos écho + humeur), compteur de contractions avec analyse intervalles, trousseau maternité (17 items contextuels ivoiriens), consentement granulaire (pro/centre/famille), exercices de respiration guidée (4 protocoles), calendrier CPN intelligent (10 RDV importants), déclaration de naissance avec auto-création carnet de l'enfant.
- Fiche éducative 38 semaines (SA 4→41) : taille/poids estimé, fruit-comparaison, développement bébé, changements maman, conseils localisés.
- Frontend : 9 écrans `/app/frontend/app/grossesse-plus/*` (index, setup, semaines, semaine/[w], suivi, journal, contractions, trousseau, respiration, cpn, naissance) + Stack layout.
- Backend tests : **42/42 PASS** (`/app/backend_test_grossesse_plus.py`)
