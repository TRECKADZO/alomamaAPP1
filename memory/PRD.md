# À lo Maman — Mobile App PRD

## Overview
À lo Maman is a mobile-first (Expo) French-language maternal & pediatric health platform for francophone Africa, inspired by the open-source web app at github.com/TRECKADZO/a-lo-maman. Phase 1 MVP focuses on essential user journeys for three roles.

## Users
1. **Maman** — expectant mothers & mothers of young children
2. **Professionnel de santé** — gynecologists, pediatricians, midwives
3. **Admin** — platform operator

## Core features (Phase 1)
- **Auth**: JWT (Bearer) + bcrypt + role-based access, stored in AsyncStorage
- **Maman dashboard**: hero pregnancy widget, quick actions, rappels, upcoming RDV, children overview
- **Suivi grossesse**: weekly count, symptoms log, notes
- **Carnet enfants**: child profiles, poids/taille, vaccine schedule
- **Rendez-vous**: maman books with pro, pro confirms/cancels/completes
- **Messagerie 1-to-1** maman ↔ professionnel
- **Communauté**: posts, likes, comments (pros badged)
- **Assistant IA**: Claude Sonnet 4.5 via EMERGENT_LLM_KEY, French maternal advice with safety disclaimer
- **Pro dashboard**: patient count, today's RDV, RDV confirmation workflow
- **Admin console**: platform stats, user list

## Tech stack
- Expo Router 6 / React Native 0.81 + TypeScript
- FastAPI + Motor (MongoDB) backend
- JWT (PyJWT) + bcrypt
- emergentintegrations.llm.chat → Claude Sonnet 4.5

## Seeded accounts
See `/app/memory/test_credentials.md`

## Deferred (Phase 2+)
FHIR/DMP interop, tele-echography, video consultation, Stripe payments, 2FA, push notifications, deep analytics, offline mode.

## Business enhancement hook
Premium tier idea: unlimited AI chat + priority RDV slots + video-consultation minutes for mamans (5000 FCFA/month); commission on in-app RDV booking for pros.
