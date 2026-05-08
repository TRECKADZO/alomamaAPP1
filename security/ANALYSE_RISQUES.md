# Analyse de Risques — À lo Maman
## RGSSI Niveau 3 — Méthodologie EBIOS Risk Manager (ANSSI)

**Version** : 1.0  
**Date** : 8 mai 2026  
**Prochaine revue** : Novembre 2026 (semestriel)

---

## 1. Cadre méthodologique

Méthodologie : **EBIOS Risk Manager** (ANSSI) — adaptée RGSSI N3.

Étapes :
1. Cadrage et socle de sécurité.
2. Sources de risques (acteurs malveillants).
3. Scénarios stratégiques (ce que veut l'attaquant).
4. Scénarios opérationnels (comment).
5. Traitement (mitiger/transférer/accepter).

## 2. Valeurs métier protégées

| ID | Valeur métier | Sensibilité |
|---|---|---|
| VM1 | Données médicales patients (mamans + enfants) | Très haute |
| VM2 | Identifiant CMU national | Très haute |
| VM3 | Échographies (images médicales) | Très haute |
| VM4 | Téléconsultations (audio/vidéo) | Haute |
| VM5 | Paiements PayDunya/Mobile Money | Haute |
| VM6 | Disponibilité service (mamans en zones rurales) | Haute |
| VM7 | Réputation et confiance | Très haute |

## 3. Sources de risques identifiées (acteurs)

| ID | Acteur | Motivation | Capacité |
|---|---|---|---|
| SR1 | Cybercriminel financier | Vol de données revente | Élevée |
| SR2 | État étranger / espionnage | Ingérence santé publique | Très élevée |
| SR3 | Concurrent malveillant | Sabotage commercial | Moyenne |
| SR4 | Employé interne malveillant | Vengeance, vol | Élevée (accès privilégié) |
| SR5 | Hacktiviste | Idéologique | Moyenne |
| SR6 | Opportuniste / scanner automatisé | Rançongiciel, compromission de masse | Faible-Moyenne |
| SR7 | Erreur humaine | Mauvaise manipulation | Très élevée |

## 4. Scénarios stratégiques majeurs

| ID | Scénario | Impact | Vraisemblance | Niveau brut |
|---|---|---|---|---|
| SS1 | Fuite massive de données patients (10K+) | 🔴 Catastrophique | Faible | **Élevé** |
| SS2 | Détournement compte Pro via phishing | 🟠 Grave | Moyenne | **Moyen** |
| SS3 | Ransomware sur la base MongoDB | 🔴 Catastrophique | Faible | **Élevé** |
| SS4 | Interception téléconsultation | 🟠 Grave | Faible | Moyen |
| SS5 | Manipulation acte de naissance (état civil) | 🔴 Catastrophique | Très faible | Moyen |
| SS6 | DDoS pendant pic d'utilisation | 🟡 Modéré | Moyenne | Moyen |
| SS7 | Vol de session (token volé) | 🟠 Grave | Faible | Moyen |

## 5. Mesures de traitement (extraits)

### SS1 — Fuite massive
- 🟢 Chiffrement AES-256-GCM au repos.
- 🟢 Audit log complet 365 j.
- 🟢 Consent granulaire (réduit la surface partagée).
- 🟡 Backup chiffré + test de restauration mensuel.
- 🟡 SIEM avec détection anomalies (futur).

### SS2 — Phishing Pro
- 🟢 **2FA TOTP obligatoire** pour les Pros (mai 2026).
- 🟢 Notification d'audit `auth_failed_2fa` sur tentative ratée.
- 🟠 Sensibilisation continue (T3 2026).
- 🔵 Révocation auto après 5 échecs login (futur).

### SS3 — Ransomware
- 🟢 MongoDB Atlas (backups automatiques cloud).
- 🟡 Backup chiffré local additionnel.
- 🔵 PRA testé annuellement.

### SS4 — Interception téléconsult
- 🟢 Agora.io WebRTC (DTLS-SRTP par défaut).
- 🔵 Évaluation E2EE (T4 2026).

### SS5 — Manipulation naissance
- 🟢 Audit log inaltérable de toute modification.
- 🟢 Validation pédiatre/sage-femme requise.
- 🔵 Signature électronique (futur, T4 2027).

### SS6 — DDoS
- 🟢 Cloudflare WAF + rate-limit.

### SS7 — Vol token
- 🟢 Tokens JWT 24 h.
- 🔵 Refresh tokens + rotation (futur).

## 6. Matrice résiduelle

Après traitement, niveau de risque résiduel : **acceptable** sur l'ensemble des scénarios majeurs, sous réserve :
- Bon fonctionnement 2FA.
- Tests PRA annuels concluants.
- Revue trimestrielle des droits.

## 7. Plan de revue

| Date | Action | Responsable |
|---|---|---|
| Mai 2026 | Création v1.0 | RSSI |
| Novembre 2026 | Revue semestrielle (EBIOS étape 5) | RSSI |
| Mai 2027 | Mise à jour majeure post-audit ISO | RSSI + DG |
