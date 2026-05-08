# Politique de Sécurité des Systèmes d'Information (PSSI)
## À lo Maman — Plateforme de santé maternelle et infantile

**Version** : 1.0  
**Date d'approbation** : 8 mai 2026  
**Classification** : Public  
**Conformité** : RGSSI Niveau 3 — ANSSI Côte d'Ivoire (2025)  

---

## 1. Périmètre et engagement de la direction

La présente PSSI s'applique à l'intégralité du système d'information de l'application **À lo Maman** (mobile + web + back-office), incluant les données patients, les communications téléconsultations, les paiements PayDunya/Mobile Money, et l'interopérabilité FHIR avec le Bus National de Santé.

La direction de **TRECKADZO / À lo Maman SARL** s'engage à :
- Respecter le RGSSI Niveau 3 (données d'intérêt vital — santé maternelle et infantile).
- Maintenir un niveau de sécurité adapté aux risques identifiés.
- Allouer les ressources humaines et financières nécessaires.
- Mettre en œuvre une amélioration continue (revue trimestrielle).

## 2. Désignation du RSSI

Un **Responsable de la Sécurité des Systèmes d'Information (RSSI)** est désigné par le Directeur Général. Ses missions :
- Élaborer et maintenir la PSSI.
- Réaliser et faire appliquer le Plan Annuel de Sécurisation (PAS).
- Conduire l'analyse de risques semestrielle.
- Coordonner la gestion des incidents et la notification ANSSI.
- Animer la sensibilisation et la formation continue.

**Coordonnées RSSI** : rssi@alomaman.com

## 3. Principes fondamentaux

| Principe | Mise en œuvre |
|---|---|
| **Confidentialité** | Chiffrement AES-256-GCM au repos, TLS 1.3 en transit, consentement granulaire |
| **Intégrité** | Audit log horodaté de toute modification, sauvegardes vérifiées |
| **Disponibilité** | Mode hors-ligne avec sync, redondance MongoDB Atlas, monitoring |
| **Traçabilité** | Journalisation exhaustive 365 jours, accessible aux utilisateurs (RGPD) |
| **Authenticité** | 2FA TOTP obligatoire pour les Pros et Centres de santé |
| **Auditabilité** | Audit interne annuel, journal d'accès consultable par chaque maman |

## 4. Classification des données

| Catégorie | Sensibilité | Mesures spécifiques |
|---|---|---|
| Identité Maman + Enfant | Très haute | Chiffrement, consent obligatoire pour partage |
| N° CMU | Très haute | Chiffrement AES-256-GCM au repos |
| Vaccins / Croissance | Haute | Audit log + consent granulaire par catégorie |
| Échographies (images) | Très haute | Chiffrement images base64 + accès limité par RDV/consent |
| Notes médicales | Très haute | Chiffrement + consent "consultation_notes" |
| Conversations | Haute | Audit log + consent "messages" |
| Logs système | Moyenne | Rétention 365 j, accès admin uniquement |

## 5. Mesures de sécurité (extraits)

### B.1 Gouvernance
- PSSI annuelle (ce document) — révision : Mai 2027.
- PAS : voir `/app/security/PAS_2026.md`.

### B.7 Contrôle d'accès
- 2FA TOTP obligatoire pour rôles `professionnel`, `centre_sante`, `admin`.
- Revue trimestrielle des droits actifs (endpoint `/admin/rgssi/users-access-review`).
- Rôles séparés (mamans, pros, centres, admin) — pas de cumul.

### B.8 Cryptographie
- AES-256-GCM (cycle de vie clé : `ENCRYPTION_KEY` env, rotation tous les 12 mois).
- TLS 1.3 (Cloudflare/Kubernetes ingress).
- Tokens JWT 24 h, signés HS256.

### B.14 Gestion des incidents
- Workflow 4 statuts : open → investigating → resolved → closed.
- Notification ANSSI obligatoire pour sévérité `high` et `critical` sous 72 h.
- Endpoint dédié : `POST /api/incidents` + dashboard admin `/admin/rgssi/compliance`.
- Rapport ANSSI pré-formaté : `GET /api/admin/rgssi/incidents/anssi-report/{id}`.

### Sensibilisation
- Formation initiale obligatoire pour tout Pro à l'inscription.
- Rappels trimestriels (notification + module e-learning).

## 6. Sanctions

Toute violation constatée fait l'objet d'une analyse RSSI et peut entraîner :
- Suspension du compte (révocation tokens, 2FA).
- Procédures disciplinaires/contractuelles.
- Notification ANSSI si fuite avérée.
- Poursuites légales (Code Pénal Ivoirien, Loi sur la Cybercriminalité 2019-672).

## 7. Validation et diffusion

Approuvé par : **TRECKADZO Eric, Directeur Général**  
Date : 8 mai 2026  
Diffusé à : ensemble du personnel + sous-traitants liés aux données santé.
