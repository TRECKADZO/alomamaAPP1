#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "creer toute l'application mobile a partir du code dans le repertoire https://github.com/TRECKADZO/a-lo-maman — ajout des rôles Centre de santé et Famille."

backend:
  - task: "Rôles Centre de santé et Famille (register + endpoints)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Ajout du rôle 'centre_sante' et 'famille' dans Role Literal. Update RegisterIn pour accepter nom_centre, type_etablissement, numero_agrement, adresse, ville, region, email_contact, code_invitation_centre. /auth/register crée auto un document Centre si role=centre_sante (avec code_invitation 6 chars). Pro avec code_invitation lié au centre. Nouveaux endpoints : GET /centres (recherche publique), GET /centres/mine (centre de l'utilisateur), GET /centres/{id}, PATCH /centres/{id}. Famille connectée : GET /famille, POST /famille/create (génère code), POST /famille/join (rejoindre avec code+relation), PATCH /famille/members/{email} (permissions ou statut), DELETE /famille/members/{email}."
      - working: true
        agent: "testing"
        comment: "All 22 backend scenarios PASS (see /app/backend_test.py). Verified: (1) POST /auth/register role=centre_sante returns token+user AND auto-creates centre doc with 6-char code_invitation. (2) POST /auth/register role=famille returns token+user. (3) GET /centres/mine returns centre with code_invitation. (4) GET /centres public list + q=Clinique + region=Lagunes all return the new centre. (5) GET /centres/{id} returns detail. (6) PATCH /centres/{id} by owner persists services=['Maternité','Échographie'] and horaires. (7) POST /famille/create returns 6-char code_partage and is idempotent. (8) GET /famille returns owned{code_partage, membres:[]}. (9) POST /famille/join by famille user adds member with statut=en_attente. (10) GET /famille (maman) shows papa en_attente. (11) PATCH /famille/members/{email} updates statut→accepte and permissions={grossesse:false,enfants:true}. (12) GET /famille as papa shows maman family in member_of after acceptance. (13) DELETE /famille/members/{email} removes member. (14) Regression: maman/pro login and maman register still OK. (15) Register professionnel with code_invitation_centre links the pro → centre.membres_pro list updated."

  - task: "CENTRE / ADMIN / FAMILLE shared view / Questions Spécialistes (Phase 5)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "19/19 PASS against http://localhost:8001/api (/app/backend_test_phase5.py). CENTRE: (1) GET /centre/membres returns list (count=0 for new centre). (2) GET /centre/rdv returns []. (3) GET /centre/tarifs initial → []. (4) PUT /centre/tarifs with 2 tarifs → saved with ids. (5) GET /centre/tarifs confirms 2 items persisted. (6) POST /centre/membres/remove with non-existent pro_id returns 200 (no-op). (6b) Role guard: maman→/centre/tarifs returns 403. ADMIN: (7) GET /admin/analytics returns all required keys (activity_7d{new_users,new_rdv,new_posts}, roles_distribution, top_villes, premium_users, rdv_par_statut). (8) GET /admin/audit returns recent_users + recent_rdv + recent_centres. (9) PATCH /admin/users/{id} with premium=true sets premium_until ~29 days ahead (≈30d). (10) PATCH role=maman persists correctly. (11) Role guard: maman→/admin/analytics returns 403. FAMILLE shared view: (12) Setup — maman creates famille (code UZMSO0), papa1@test.com joined and accepted with permissions {grossesse:true, enfants:true, rendez_vous:true}. (13) GET /famille/shared/maman@test.com by papa returns {owner, permissions, grossesse, enfants, rdvs}. (14) When grossesse permission is disabled, response correctly omits the 'grossesse' key while keeping 'enfants' and 'rdvs'. (15) GET /famille/shared/pro@test.com (no family) returns 404. QUESTIONS SPÉCIALISTES: (16) POST /questions-specialistes creates doc with id, title, content, specialite_cible=gyneco. (17) GET /questions-specialistes lists it. (18) GET /questions-specialistes?specialite=gyneco filters correctly. Centre account (centre1@test.com/Centre123!) and famille account (papa1@test.com/Papa123!) were auto-registered during test since they didn't exist."

  - task: "RDV: champ optionnel type_consultation"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "8/8 PASS on https://health-prestation.preview.emergentagent.com/api (script /app/backend_test_rdv_type.py). (1) Login maman@test.com/Maman123! → token OK. (2) GET /professionnels returns 5 pros; used Dr. Fatou Diallo. (3) POST /rdv with pro_id, date='2026-05-15T10:30', motif='test consultation', type_consultation='prenatale' → 200; returned doc includes type_consultation='prenatale'. (4) POST /rdv WITHOUT type_consultation (only pro_id+date+motif) → 200, doc.type_consultation is null (backward compat OK since field is Optional[str]=None on RdvIn L176-181 and persisted as payload.type_consultation on L531). (5) GET /rdv listing contains the created RDV with key 'type_consultation' set to 'prenatale'. Regression: GET /grossesse, GET /enfants, GET /reminders all return 200 for logged-in maman. No issues."

  - task: "RDV: champ optionnel mode (presentiel | teleconsultation)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "16/16 PASS on https://health-prestation.preview.emergentagent.com/api (script /app/backend_test_rdv_mode.py). (1) Login maman@test.com/Maman123! OK. (2) POST /rdv with mode='teleconsultation' + type_consultation='prenatale' → 200; response body contains mode='teleconsultation'. (3) POST /rdv with mode='presentiel' → 200; body contains mode='presentiel'. (4) POST /rdv WITHOUT the mode field → 200; body contains mode='presentiel' (default applied via RdvIn.mode: Optional[str]='presentiel' on L182 AND persisted as `payload.mode or 'presentiel'` on L533). (5) GET /rdv returns all three newly created RDVs, each with a 'mode' key whose value matches what was sent (or defaulted). No regressions."

  - task: "Endpoints Pro: patients enrichis, dossier, notes, disponibilités, rappels, téléconsultation"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "31/33 tests PASS against https://health-prestation.preview.emergentagent.com/api (see /app/backend_test.py). CRITICAL BUG identified: the enrichment/dossier queries use the WRONG collection & field names. In server.py lines 776, 777, 798, 799: (a) `db.grossesse` (singular) is queried but all maman endpoints write to `db.grossesses` (plural). (b) filters use `maman_id` but the collections actually store the owner under `user_id`. Consequence: /pro/patients returns has_grossesse=False, grossesse_sa=None, enfants_count=0 for every patient, and /pro/dossier returns grossesse:null, enfants:[]. FIX: change `db.grossesse` → `db.grossesses` and filter by `user_id` in both endpoints."
      - working: true
        agent: "testing"
        comment: "RETEST after main-agent fix — PASS. Verified on http://localhost:8001/api with seeded data (maman@test.com: grossesse date_debut=2026-01-01 active, 1 enfant). (1) GET /pro/patients returns the maman with has_grossesse=True, grossesse_sa=15 (computed from date_debut), enfants_count=1, last_rdv_date set. (2) GET /pro/dossier/{patient_id} returns non-null grossesse (date_debut=2026-01-01T00:00:00Z), enfants array with 1 child, rdvs=1, notes=0, patient.name='Aminata Koné'. Both queries now correctly use db.grossesses + user_id field. Script: /app/retest_pro.py."

frontend:
  - task: "Refonte UI Dashboard Maman (index.tsx)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Réécrit pour aligner sur src/pages/DashboardMaman.jsx. Ajout des dashboards CentreDash et FamilleDash pour les nouveaux rôles."

  - task: "Refonte UI Carnets de Santé (enfants.tsx)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/enfants.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Réécrit pour aligner sur src/pages/Enfants.jsx."

  - task: "UI Grossesse alignée source (grossesse.tsx)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/grossesse.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Empty state vérifié."

  - task: "Sélection de compte 4 rôles (register.tsx)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(auth)/register.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Réécrit avec grille 2x2 de rôles (Maman, Pro, Centre de santé, Famille) avec icônes gradient. Champs conditionnels par rôle : pro=specialite+code_invitation_centre, centre_sante=nom_centre+type+adresse+email_contact. Tabs layout adapté : centre voit RDV+Pros, famille voit accueil+communauté+messages."

  - task: "Page Centres de santé (recherche publique)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/centres.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Nouvelle route /centres. Recherche par nom/ville, filtres région. Cartes avec icône violet/indigo (gradient), badges ville/région."

  - task: "Page Famille connectée (FamilleConnectee)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/famille.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Nouvelle route /famille. Création groupe avec code partage 6 chars, partage natif via Share API, rejoindre avec code+relation, gestion des membres (accepter/refuser/supprimer), permissions granulaires (7 catégories) via toggles."

backend:
  - task: "Module Ressources éducatives (vidéos, fiches, quiz) + Consentement RGPD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          **Consentement RGPD à l'inscription** (loi ivoirienne n°2013-450) :
          - `RegisterIn` étendu avec `accepte_cgu`, `accepte_politique_confidentialite`, `accepte_donnees_sante`, `accepte_communications`.
          - `/auth/register` renvoie 400 si CGU ou Politique non acceptées; pour rôles maman/pro/centre, `accepte_donnees_sante` obligatoire.
          - Consentement journalisé sur user : `consent_version=1.0`, `consent_accepted_at`, 4 booléens.
          - Tests manuels : PASS. (1) Register sans consent→400 "Vous devez accepter les CGU". (2) Register sans donnees_sante pour maman→400. (3) Register complet→token+user retournés avec succès.

          **Module Ressources éducatives** (`/api/resources/*`) :
          - Schémas : `ResourceIn` (type=video|fiche|quiz, category, video_url, content_md, questions[]), `ResourcePatch`, `QuizQuestion`, `QuizSubmitIn`.
          - 10 endpoints : GET /resources (filtres type/category/q), GET /resources/{id} (incrément vues, masque correct_index pour non-admin), POST /resources (admin/pro), PATCH/DELETE (auteur ou admin), POST /resources/{id}/like, POST /resources/{id}/quiz-submit (retourne score_pct + results avec explications), GET /resources/me/quiz-history, GET /resources/meta/categories.
          - Validation POST : type video→video_url obligatoire, type fiche→content_md, type quiz→≥1 question avec ≥2 options et correct_index valide.
          - **8 ressources seedées automatiquement au démarrage** : 4 fiches (consultations prénatales OMS, calendrier vaccinal PEV Côte d'Ivoire, allaitement exclusif OMS, nutrition grossesse), 2 vidéos YouTube (UNICEF allaitement, OMS signes d'alarme), 2 quiz (grossesse 5Q, vaccination 3Q).

          **Frontend** :
          - `/ressources` (index) — liste paginée avec recherche + filtres Type (tous/vidéos/fiches/quiz) + 10 Catégories (Grossesse, Allaitement, Nutrition, Vaccination, etc.).
          - `/ressources/[id]` — détail polymorphe : vidéo YouTube (iframe web / WebView natif), fiche Markdown (renderer custom sans dépendance : H1-H3, listes, gras **, citations), quiz interactif (choix multiples + scoring + review avec bonnes réponses + explications).
          - `/cgu` et `/privacy` — pages statiques lisibles.
          - `/register` — 4 checkboxes de consentement (CGU, Politique, Données santé conditionnel au rôle, Communications optionnel) avec liens vers /cgu et /privacy.
          - Dashboard maman : QuickAction "Ressources" ajoutée.

          À tester : tout le parcours CGU/Politique depuis register, filtrage ressources, soumission quiz avec scoring.
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Nouveaux endpoints CMU :
          - GET /api/cmu/me (maman/famille) → {cmu, statut} (statut = absent|non_verifie|actif|expire basé sur date_validite).
          - POST /api/cmu/me → valide numéro (10 ou 12 chiffres exactement), enregistre {numero, nom_complet, date_delivrance, date_validite, beneficiaires, verifie=false, updated_at}.
          - DELETE /api/cmu/me → $unset cmu.
          - PATCH /api/pro/cmu (role=professionnel) → toggle accepte_cmu sur user.
          - GET /api/pro/facturation-cmu → {total_rdv, total_brut_fcfa, total_cmu_du_fcfa, total_reste_a_charge_fcfa, rdvs}.
          - GET /api/pro/facturation-cmu/csv → CSV.
          - GET /api/admin/cmu/stats → statistiques globales.

          Tarification RDV (L599-611) : cmu_taux × tarif → cmu_montant + reste_a_charge.
          /pay/consultation (L2166) utilise reste_a_charge_fcfa si cmu_applique.
      - working: true
        agent: "testing"
        comment: |
          74/77 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_cmu.py). Core CMU flow fully functional.

          ✅ WORKING:
          (1) GET /cmu/me fresh maman → {cmu:{}, statut:'absent'}.
          (2) POST /cmu/me invalid numero '123' → 400 "Numéro CMU invalide (10 ou 12 chiffres attendus)".
          (3) POST /cmu/me with 10-digit numero, nom_complet, date_validite='2099-01-15', beneficiaires → 200 with statut='actif', cmu.numero='0102030405', beneficiaires persisted.
          (4) POST /cmu/me with past date_validite='2020-01-01' → statut='expire'. (5) POST /cmu/me without date_validite → statut='non_verifie'.
          (6) GET /cmu/me as pro → 403 "CMU réservé aux mamans et familles".
          (7) DELETE /cmu/me → {ok:true}; subsequent GET returns cmu={}, statut='absent'.
          (8) PATCH /pro/cmu {accepte_cmu:true} → {accepte_cmu:true}. PATCH as maman → 403.
          (9) POST /pro/prestations with cmu_prise_en_charge=true, cmu_taux=0.70 → 200 with those fields. GET /pros/{pro_id}/prestations as maman exposes cmu_prise_en_charge=true correctly.
          (10) ★ Core tarification: POST /rdv {pro_id, prestation_id (CMU), tarif_fcfa:99999 (bogus)} with maman CMU actif + pro accepte_cmu=true → tarif_fcfa=10000 (prestation price wins), cmu_applique=true, cmu_taux=0.70, cmu_montant_fcfa=7000, reste_a_charge_fcfa=3000, cmu_numero='0102030405' ALL EXACTLY CORRECT.
          (11) POST /pay/consultation for that rdv → payment.amount=3000 (reste_a_charge), NOT 10000 ✓.
          (12) Negative cases all correct: non-CMU prestation → cmu_applique=false + reste_a_charge=tarif; pro accepte_cmu=false → cmu_applique=false; maman CMU absent → cmu_applique=false; maman CMU expire → cmu_applique=false.
          (13) GET /pro/facturation-cmu → {total_rdv:3, total_brut_fcfa, total_cmu_du_fcfa, total_reste_a_charge_fcfa, rdvs:[...]} each enriched with maman_nom='Aminata Koné' + numero_cmu='0102030405'.
          (14) GET /pro/facturation-cmu/csv → 200 text/csv with semicolon-separated header (Date;Patiente;Numero CMU;Prestation;...) + data rows. /pro/facturation-cmu as maman → 403.
          (15) GET /admin/cmu/stats as admin → 200. As maman → 403.
          (16) Regression: /auth/login, /professionnels, /pro/revenus (all required keys present), RDV creation WITHOUT prestation_id → 200 with prestation_nom=null (no crash, `prestation.get('nom') if prestation else None` works correctly).

          ❌ TWO MINOR SPEC VIOLATIONS the main agent should fix in /app/backend/server.py:

          BUG 1 — GET /auth/me does NOT expose `accepte_cmu`. The review spec requires "Confirm via GET /api/auth/me that user.accepte_cmu=true", but serialize_user() (L66-84) does not include this field. DB is updated correctly by PATCH /pro/cmu (L1317), but the serializer drops the field on every /auth/me response. FIX: add `"accepte_cmu": bool(u.get("accepte_cmu", False)),` to serialize_user (ideally also `"cmu": u.get("cmu")` so the mobile UI doesn't need a second GET /cmu/me round-trip, but that's optional).

          BUG 2 — GET /admin/cmu/stats returns keys `mamans_total` and `pros_total` (L1397, L1400) instead of the spec's `total_mamans` and `total_pros`. All other 6 keys are correct. FIX: rename on L1397 → "total_mamans" and L1400 → "total_pros" (or add aliases).

          Test data cleaned up at end of run (test prestations deleted, maman CMU deleted, pro accepte_cmu reset to false). Script reruns are idempotent.
      - working: true
        agent: "main"
        comment: |
          BUG 1 (serialize_user) & BUG 2 (/admin/cmu/stats keys) corrigés.
          - serialize_user (L66-87) expose maintenant `accepte_cmu`, `cmu`, `is_super_admin`.
          - /admin/cmu/stats (L1383-1410) retourne à la fois `total_mamans`/`mamans_total` et `total_pros`/`pros_total` (alias pour backward-compat).
          Vérification manuelle : /auth/me (pro@test.com) → accepte_cmu=true, is_super_admin=false. /admin/cmu/stats → 10 clés incluant total_mamans + total_pros.

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 6
  run_ui: false

test_plan:
  current_focus:
    - "CMU (Couverture Maladie Universelle) — profils maman, accept pro, tarification RDV"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: |
      CMU feature validated — 74/77 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_cmu.py). Core CMU tarification logic is FULLY FUNCTIONAL: RDV with CMU prestation + maman CMU actif + pro accepte_cmu=true → tarif_fcfa=10000 (prestation price wins over bogus payload), cmu_applique=true, cmu_taux=0.70, cmu_montant_fcfa=7000, reste_a_charge_fcfa=3000, cmu_numero='0102030405'. /pay/consultation on that rdv → payment.amount=3000 ✓. All 4 negative cases (non-CMU prestation, pro refuse, maman absent, maman expire) correctly set cmu_applique=false. /pro/facturation-cmu returns enriched rdvs (maman_nom + numero_cmu), /pro/facturation-cmu/csv returns text/csv with proper header. /admin/cmu/stats works for admin, 403 for maman. Regression (login, /professionnels, /pro/revenus, RDV without prestation_id) all OK — `prestation.get('nom') if prestation else None` does not crash.

      TWO MINOR BUGS in /app/backend/server.py for main agent to fix:

      BUG 1 — GET /auth/me does not expose `accepte_cmu`. The review spec explicitly requires "Confirm via GET /api/auth/me that user.accepte_cmu=true". DB is updated correctly by PATCH /pro/cmu but serialize_user() (L66-84) drops the field. FIX: add `"accepte_cmu": bool(u.get("accepte_cmu", False))` (and ideally `"cmu": u.get("cmu")` for mamans/familles) to serialize_user.

      BUG 2 — GET /admin/cmu/stats returns `mamans_total` (L1397) and `pros_total` (L1400) instead of spec keys `total_mamans` and `total_pros`. All other 6 keys match. FIX: rename those two keys (or add both for backward-compat).

      No other issues. Test script cleans up created data (prestations, maman CMU, pro accepte_cmu) at the end of the run.
  - agent: "main"
    message: "Phase 4A — PROFESSIONNEL terminée : 1) Backend : /pro/dossier/{id} (dossier complet patient), /pro/consultation-notes CRUD, /pro/disponibilites (slots hebdomadaires + durée), /pro/rappels-patient (rappels envoyés aux patientes), /pro/rappels-envoyes, /teleconsultation/room/{rdv_id} (Jitsi). Enrichissement /pro/patients avec has_grossesse, grossesse_sa, enfants_count, last_rdv_date. 2) Frontend : /pro/dossier/[id] (5 tabs: Synthèse, Grossesse, Enfants, RDV, Notes + modals notes/rappels), /pro/disponibilites (config 7 jours+durée), /pro/ia (AssistantIAPro avec 6 prompts rapides), /pro/teleconsultation (Jitsi WebView + fallback web), /pro/rappels (liste rappels envoyés). 3) Patients tab enrichi avec header gradient, stats, quick actions, badges par patiente. 4) ProDash enrichi avec 8 quick actions Pro. Tous les endpoints testés OK après fix des collections."
  - agent: "main"
    message: "Phase Rôles & Famille terminée : 1) Backend support des rôles centre_sante + famille (register, /centres CRUD, /famille create/join/permissions). 2) Register UI 4 rôles avec champs conditionnels. 3) Nouvelles routes /centres (recherche publique) et /famille (gestion famille connectée). 4) Dashboard étendu avec CentreDash et FamilleDash. Veuillez tester le backend pour valider tous les nouveaux endpoints."
  - agent: "testing"
    message: "Backend validation OK — 22/22 scenarios PASS on live API (https://health-prestation.preview.emergentagent.com/api). Covered: register centre_sante (auto-creates centre + 6-char code_invitation), register famille, /centres public list + q/region filters, /centres/mine, GET/PATCH /centres/{id} (owner auth enforced), /famille create (idempotent 6-char code_partage), /famille/join (statut=en_attente), PATCH /famille/members/{email} for statut + granular permissions, member_of visibility after acceptance, DELETE member, regression Maman/Pro login+register, and Pro registration with code_invitation_centre properly adds pro UUID to centre.membres_pro. No critical issues found. Test script at /app/backend_test.py (idempotent via email suffix)."
  - agent: "testing"
    message: "Pro endpoints tested — 31/33 PASS. CRITICAL BUG in /app/backend/server.py affecting GET /pro/patients (lines 776-777) and GET /pro/dossier/{patient_id} (lines 798-799): code queries the WRONG collection `db.grossesse` (singular) instead of `db.grossesses` (plural, used everywhere else), AND filters by field `maman_id` on `grossesse`/`enfants` collections whereas those collections actually store the owner as `user_id` (see create_grossesse L363, create_enfant L418). Result: `has_grossesse` is always False, `grossesse_sa` always None, `enfants_count` always 0, and dossier returns `grossesse: null`, `enfants: []` even when data exists. Verified by seeding a grossesse + 1 enfant for maman@test.com then re-calling both endpoints — fields remained empty. FIX (4 lines, main agent): in server.py change L776 `db.grossesse.find_one({'maman_id': uid})` → `db.grossesses.find_one({'user_id': uid, 'active': True})`; L777 `db.enfants.count_documents({'maman_id': uid})` → `db.enfants.count_documents({'user_id': uid})`; L798 same grossesse fix with patient_id; L799 `db.enfants.find({'maman_id': patient_id})` → `db.enfants.find({'user_id': patient_id})`. All other features validated OK: consultation-notes CRUD, disponibilités GET/PUT, rappels-patient (creates reminder with source='pro', source_pro_id; appears in maman /reminders), rappels-envoyes, teleconsultation/room (persists teleconsultation_url on rdv, 403 for unrelated user), role guards (maman→403 on /pro/*), access control (403 for patient with no rdv link), and regression on login/grossesse/enfants/community/rdv."
  - agent: "testing"
    message: "Phase 5 validation — 19/19 PASS on http://localhost:8001/api (script: /app/backend_test_phase5.py). CENTRE endpoints: GET /centre/membres, /centre/rdv, /centre/tarifs (GET/PUT), POST /centre/membres/remove all OK; role guard enforced (maman→403). ADMIN endpoints: /admin/analytics returns required structure (activity_7d, roles_distribution, top_villes, premium_users, rdv_par_statut); /admin/audit returns recent_users+recent_rdv+recent_centres; PATCH /admin/users/{id} correctly sets premium=true with premium_until +30d and persists role changes; role guard enforced (maman→403). FAMILLE shared view: POST /famille/create + /famille/join + PATCH /famille/members (accepte + perms) setup OK; GET /famille/shared/{owner_email} returns {owner, permissions, grossesse, enfants, rdvs} when all perms true; correctly omits 'grossesse' key when permission disabled; returns 404 when no famille exists for the queried email. QUESTIONS SPÉCIALISTES: POST/GET /questions-specialistes with ?specialite=gyneco filter all working. Auto-registered centre1@test.com/Centre123! and papa1@test.com/Papa123! during the run since they were missing. No critical issues."
  - agent: "testing"
    message: "Phone auth tests — 26/26 PASS on http://localhost:8001/api (script: /app/backend_test_phone_auth.py). (1) POST /auth/register with phone only (no email) returns 200 + token + user; user.phone is normalized (no spaces, starts with +225, contains only '+' and digits). (2) POST /auth/register with email only (role=famille) still works as before. (3) POST /auth/register with BOTH email + phone (role=professionnel) returns 200 with both fields correctly set on the user. (4) POST /auth/register without email AND without phone returns 400 with detail 'Email ou téléphone requis'. (5) POST /auth/login with the normalized phone + password returns 200 and the SAME user id as the registration response. (6) POST /auth/login with the SAME phone but poorly formatted (with spaces) still returns 200 — _normalize_phone strips spaces on both register and login paths. (7) Regression: POST /auth/login with seeded maman@test.com / Maman123! still works. (8) Re-registering with an already-used phone returns 400 with detail 'Ce numéro est déjà utilisé'. (9) POST /auth/login with correct phone but wrong password returns 401. NOTE: the review spec mentioned an expected normalized value of '+22507080910' for input '+225 07 08 09 10 11', but the real _normalize_phone implementation (server.py L143-151) preserves ALL digits → actual output is '+2250708091011'. This is a spec typo, not a bug: normalization is correct and consistent between register and login (tested via step 6). No critical issues."
  - agent: "testing"
    message: "RDV type_consultation field — 8/8 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_rdv_type.py). Verified: (1) Login maman@test.com OK. (2) GET /professionnels returns 5 pros. (3) POST /rdv with type_consultation='prenatale' → 200, response contains type_consultation='prenatale' (persisted server.py L531). (4) POST /rdv WITHOUT type_consultation → 200, backward-compatible (field Optional[str]=None on RdvIn L176-181, stored as null). (5) GET /rdv shows the new RDV with 'type_consultation' key and correct value. (6) Regression: GET /grossesse, /enfants, /reminders all 200 for the logged-in maman. No backend changes needed — feature working end-to-end."
  - agent: "testing"
    message: "Premium plans (role-aware) — 58/58 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_plans.py). (1) GET /api/plans (public, no auth) → 200 with keys {plans, durations}; plans.maman + plans.professionnel + plans.centre_sante all present and each contains {code,label,base_price_fcfa,color,icon,description,features,free_limits}; durations list has months [1,3,6,12]. (2) GET /api/plans/me — maman@test.com → plan.code='maman', base_price_fcfa=2000, 4 quotes with amounts {1mo=2000, 3mo=5700, 6mo=10800, 12mo=19200}. pro@test.com → plan.code='pro', base_price_fcfa=10000, quotes {1mo=10000, 3mo=28500, 6mo=54000, 12mo=96000}. centre1@test.com → plan.code='centre', base_price_fcfa=25000, quotes {1mo=25000, 3mo=71250, 6mo=135000, 12mo=240000}. Admin klenakan.eric@gmail.com → plan=null, quotes=[]. All discounts verified (3mo -5%, 6mo -10%, 12mo -20%). (3) POST /api/pay/subscribe — maman {months:1} → payment.amount=2000, plan='maman', role='maman'; pro {months:3} → amount=28500, plan='pro', role='professionnel'; centre {months:12} → amount=240000, plan='centre', role='centre_sante'. Admin → 403 'Aucun plan Premium disponible pour votre rôle.' Note: PayDunya is actually configured on this environment, so the 3 subscribe calls returned success=true with payment.status='pending' (even better than the 'error-is-acceptable' fallback). No issues."
  - agent: "testing"
    message: "Dossier endpoints — 13/13 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_dossier.py). (1) Login maman@test.com/Maman123! OK. (2) GET /api/dossier → 200 with all required keys {patient, grossesse, enfants, rdv, cycles, generated_at}; patient object contains {id, nom, email, phone, ville, region} (plus bonus 'created_at') and patient.id matches the authenticated user id. (3) POST /api/dossier/share (no body) → 200 with {token, url, expires_at}; expires_at is exactly 7.000 days in the future; url contains '/api/dossier/public/<token>' and is prefixed by APP_URL. (4) GET /api/dossier/public/<token> WITHOUT Authorization header → 200 returning the full dossier structure (same keys as authenticated route). (5) GET /api/dossier/public/bogus-token-xxx-yyy-1234 → 404 with detail 'Lien invalide ou expiré'. (6) Regression: GET /api/fhir/patient as maman → 200, Bundle with entries. (7) Access control: login klenakan.eric@gmail.com (admin) then GET /api/dossier → 403 with detail 'Dossier médical réservé aux mamans'. No issues."
  - agent: "testing"
    message: "Prestations Pro + Commission dynamique — 37/37 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_prestations.py). (1) Prestations CRUD: POST /api/pro/prestations {nom:'Consultation prénatale', prix:15000, duree:45} → 200 with id; GET /api/pro/prestations includes it; PATCH updates prix_fcfa 15000→20000 + nom change persisted; DELETE returns {ok:true} and GET no longer contains the id. (2) Public prestations: created 2 active (Consultation prénatale 15000, Échographie 25000) + 1 inactive (5000). GET /api/pros/{pro_id}/prestations as maman → 200 with exactly 2 items sorted ASC by prix_fcfa ([15000, 25000]); inactive correctly excluded. (3) RDV with prestation_id: POST /api/rdv {pro_id, date:'2026-05-20T10:00', prestation_id, tarif_fcfa:99999 (wrong)} → 200; response.tarif_fcfa=15000 (prestation price wins), prestation_id persisted, prestation_nom='Consultation prénatale'. (4) Commission dynamique: admin PATCH /admin/users/{pro_id} {premium:false} then POST /pay/consultation on RDV tarif=10000 → payment.commission=1000, commission_rate=0.10, pro_amount=9000 ✓. Admin PATCH {premium:true, premium_until=+30d} → /auth/me confirms premium=True, then new /pay/consultation on RDV tarif=10000 → commission=500, commission_rate=0.05, pro_amount=9500 ✓. (5) GET /api/pro/revenus → 200 with ALL required fields {total_brut_fcfa, total_commission_fcfa, total_net_fcfa, pending_count, pending_fcfa, monthly:[], recent:[], is_premium:true, current_commission_rate:0.05, premium_rate:0.05, standard_rate:0.10}; all numeric fields are non-null ints/floats; monthly+recent are arrays. (6) GET /api/plans (public) → plans.professionnel.features contains 'Commission réduite : 5% au lieu de 10%' exactly; plans.professionnel.free_limits = 'Gratuit : 10 patientes max · commission 10% sur chaque consultation payée' (mentions both commission 10% and consultations payées). Test data cleaned up (prestations deleted, pro premium reset to false). No regressions. NOTE: spotted a pre-existing bug unrelated to this review — GET /api/pro/patients (server.py L1003-L1022) references `rdvs` variable that is never defined in the function body (was likely dropped during a refactor), but this endpoint was not part of the current review scope and no quota/commission test exercises it."
  - agent: "testing"
    message: "Famille Premium plan + Freemium quotas — 32/32 PASS on https://health-prestation.preview.emergentagent.com/api (script: /app/backend_test_famille_quotas.py). (1) GET /api/plans (public, no auth) → 200 now returns 4 role-plans {maman, professionnel, centre_sante, famille}. plans.famille = {code:'famille', label:'Famille Premium', base_price_fcfa:1500, icon:'people-circle'} ✓. (2) Login papa1@test.com/Papa123! (note: review spec says papa@test.com, but the seeded account is papa1@test.com per /app/memory/test_credentials.md — login OK with role=famille). GET /api/plans/me → plan.code='famille', quotes[m=1].amount=1500. POST /api/pay/subscribe {months:1} as famille → payment.amount=1500, payment.plan='famille', payment.role='famille'. (3) Enfants quota: seeded maman@test.com is currently premium=true, so a fresh non-premium maman was registered (test.quota.<uuid>@test.com). Cleared pre-existing enfants, POST 2 enfants returned 200, 3rd POST /api/enfants → 402 with detail = {error:'quota_exceeded', message:'Quota gratuit atteint : enfants (2 max). Passez Premium pour continuer.', quota:'enfants_max', limit:2, upgrade_url:'/premium'} — matches the required consistent error format exactly. (4) RDV quota logic: created a fresh non-premium maman, 2 POST /rdv under the 10-per-month limit returned 200 each (quota logic path exercised server.py L578-585; full limit not hit per instructions). (5) Regression: admin klenakan.eric@gmail.com → GET /api/plans/me 200 with plan=null and quotes=[]; maman /pay/subscribe m=1 → amount=2000, pro → amount=10000, centre → amount=25000, all successful. No issues found."
