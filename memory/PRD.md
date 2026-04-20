# À lo Maman — Mobile App PRD

## Overview
À lo Maman : plateforme mobile (Expo) de santé maternelle & pédiatrique pour l'Afrique francophone. Adaptation de github.com/TRECKADZO/a-lo-maman en app native avec 3 phases livrées.

## Users
1. **Maman** — femme enceinte / mère d'enfants
2. **Professionnel de santé** — gynécologue, pédiatre, sage-femme
3. **Admin** — opérateur plateforme

## Phases livrées

### Phase 1 (Core MVP)
- Auth JWT/bcrypt multi-rôle (AsyncStorage)
- Dashboard rôle-based · Suivi grossesse · Carnet enfants (vaccins)
- RDV · Messagerie 1-to-1 · Communauté · Assistant IA (Claude Sonnet 4.5)
- Admin console (stats + users)

### Phase 2 (Advanced)
- Photos base64 (profil/enfants) · Mesures croissance
- Cycle menstruel + prédictions ovulation/fertilité
- Contraception (6 méthodes) · Post-partum (humeur + allaitement)
- Notifications in-app auto (RDV/status/message)
- Push tokens stockés · Recherche pros & communauté
- Vidéo-consultation Jitsi (WebView mobile + web fallback)

### Phase 3 (Advanced+)
- **FHIR export** : bundle Patient+RelatedPerson+Observation+Immunization (JSON HL7-compatible), partage/copie
- **Télé-échographie** : pro upload image base64 + compte-rendu, notifie maman, galerie consultable
- **Déclaration de naissance** : formulaire complet maman → validation admin + notif
- **Expo Push réel** : token enregistré au login/register, best-effort send via `https://exp.host/--/api/v2/push/send`
- **Cache hors-ligne** basique (`lib/cache.ts`) pour lectures

## Tech stack
- Expo Router 6 · React Native 0.81 · TypeScript
- FastAPI + Motor (MongoDB) · JWT (PyJWT) · bcrypt
- emergentintegrations.llm.chat (Claude Sonnet 4.5)
- expo-image-picker · expo-notifications · react-native-webview (Jitsi)

## Endpoints (résumé, 50+)
Auth · Grossesse · Enfants · RDV · Messages · Communauté · Reminders · AI · Admin · Pro · Cycle · Contraception · Allaitement · Humeur · Notifications · Push-token · Search · Video-link · **FHIR · Tele-echo · Naissance**

## Test Credentials
Voir `/app/memory/test_credentials.md`

## Tests automatisés
- Phase 2 : 36/36 pytest ✓
- Phase 3 : 29/29 pytest ✓ + régression Phase 2 ✓

## Deferred (Phase 4+)
Refactor modulaire backend · Upgrade versions Expo · Fix shadow* deprecated · FHIR spec complète (HL7 R4 strict) · Paiement (Stripe/Mobile Money) · Mode offline complet · 2FA

## Business hooks
- Premium maman 5 000 FCFA/mois : IA illimitée, vidéo-consultations prioritaires, stockage illimité FHIR/images
- Commission plateforme 10% sur RDV payants pour pros
- Monétisation API FHIR pour partenaires cliniques (B2B)
