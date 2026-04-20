# À lo Maman — Mobile App PRD

## Overview
À lo Maman is a mobile-first (Expo) French-language maternal & pediatric health platform for francophone Africa, inspired by the open-source web app at github.com/TRECKADZO/a-lo-maman. Covers Phase 1 (core) + Phase 2 (advanced modules, no payment).

## Users
1. **Maman** — expectant mothers & mothers of young children
2. **Professionnel de santé** — gynecologists, pediatricians, midwives
3. **Admin** — platform operator

## Phase 1 (Core)
- JWT Auth (Bearer) + bcrypt, role-based access (AsyncStorage)
- Maman dashboard: pregnancy hero, quick actions, rappels, upcoming RDV, children
- Suivi grossesse (semaine, symptômes, notes)
- Carnet enfants (profil, poids/taille, vaccination)
- Rendez-vous (demande/confirmation/annulation/terminé)
- Messagerie 1-to-1
- Communauté (posts/likes/comments, badge Pro)
- Assistant IA Claude Sonnet 4.5 (via Emergent Universal Key, FR)
- Pro dashboard + Admin console (stats + users)

## Phase 2 (Advanced)
- **Photos** : upload base64 (profil, enfants) via expo-image-picker
- **Mesures** : historique poids/taille/périmètre crânien par enfant
- **Cycle menstruel** : suivi règles + prédictions ovulation/fertilité
- **Contraception** : méthode active + historique
- **Post-partum** :
  - Humeur 1-10 + symptômes + alerte dépression post-partum
  - Allaitement (tétées durée/côté/enfant)
- **Notifications in-app** auto : RDV créé/statut changé/nouveau message
- **Push tokens** stockés (Expo push ready)
- **Recherche** pros (nom, spécialité) + communauté (mot-clé, catégorie)
- **Vidéo-consultation** Jitsi (room auto-générée par RDV confirmé, WebView mobile + fallback web)

## Tech stack
- Expo Router 6 / React Native 0.81 + TypeScript
- FastAPI + Motor (MongoDB), JWT (PyJWT) + bcrypt
- emergentintegrations.llm.chat → Claude Sonnet 4.5
- expo-image-picker, expo-notifications, react-native-webview (Jitsi embed)

## Seeded accounts
See `/app/memory/test_credentials.md`

## Deferred (Phase 3+)
FHIR/DMP interop, tele-echography, full push delivery (APNs/FCM), Stripe payments, 2FA, deep analytics, offline mode, birth-declaration module.

## Business hook
Tier premium maman 5 000 FCFA/mois : IA illimitée, vidéo-consultations prioritaires, rappels vaccinaux automatisés. Commission plateforme sur RDV payants pour pros.
