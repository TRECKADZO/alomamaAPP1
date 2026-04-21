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
        comment: "31/33 tests PASS against https://maman-mobile-mvp.preview.emergentagent.com/api (see /app/backend_test.py). CRITICAL BUG identified: the enrichment/dossier queries use the WRONG collection & field names. In server.py lines 776, 777, 798, 799: (a) `db.grossesse` (singular) is queried but all maman endpoints write to `db.grossesses` (plural). (b) filters use `maman_id` but the collections actually store the owner under `user_id`. Consequence: /pro/patients returns has_grossesse=False, grossesse_sa=None, enfants_count=0 for every patient, and /pro/dossier returns grossesse:null, enfants:[]. FIX: change `db.grossesse` → `db.grossesses` and filter by `user_id` in both endpoints."
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

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 5
  run_ui: false

test_plan:
  current_focus:
    - "Rôles Centre de santé et Famille (register + endpoints)"
    - "Sélection de compte 4 rôles (register.tsx)"
    - "Page Centres de santé (recherche publique)"
    - "Page Famille connectée (FamilleConnectee)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Phase 4A — PROFESSIONNEL terminée : 1) Backend : /pro/dossier/{id} (dossier complet patient), /pro/consultation-notes CRUD, /pro/disponibilites (slots hebdomadaires + durée), /pro/rappels-patient (rappels envoyés aux patientes), /pro/rappels-envoyes, /teleconsultation/room/{rdv_id} (Jitsi). Enrichissement /pro/patients avec has_grossesse, grossesse_sa, enfants_count, last_rdv_date. 2) Frontend : /pro/dossier/[id] (5 tabs: Synthèse, Grossesse, Enfants, RDV, Notes + modals notes/rappels), /pro/disponibilites (config 7 jours+durée), /pro/ia (AssistantIAPro avec 6 prompts rapides), /pro/teleconsultation (Jitsi WebView + fallback web), /pro/rappels (liste rappels envoyés). 3) Patients tab enrichi avec header gradient, stats, quick actions, badges par patiente. 4) ProDash enrichi avec 8 quick actions Pro. Tous les endpoints testés OK après fix des collections."
  - agent: "main"
    message: "Phase Rôles & Famille terminée : 1) Backend support des rôles centre_sante + famille (register, /centres CRUD, /famille create/join/permissions). 2) Register UI 4 rôles avec champs conditionnels. 3) Nouvelles routes /centres (recherche publique) et /famille (gestion famille connectée). 4) Dashboard étendu avec CentreDash et FamilleDash. Veuillez tester le backend pour valider tous les nouveaux endpoints."
  - agent: "testing"
    message: "Backend validation OK — 22/22 scenarios PASS on live API (https://maman-mobile-mvp.preview.emergentagent.com/api). Covered: register centre_sante (auto-creates centre + 6-char code_invitation), register famille, /centres public list + q/region filters, /centres/mine, GET/PATCH /centres/{id} (owner auth enforced), /famille create (idempotent 6-char code_partage), /famille/join (statut=en_attente), PATCH /famille/members/{email} for statut + granular permissions, member_of visibility after acceptance, DELETE member, regression Maman/Pro login+register, and Pro registration with code_invitation_centre properly adds pro UUID to centre.membres_pro. No critical issues found. Test script at /app/backend_test.py (idempotent via email suffix)."
  - agent: "testing"
    message: "Pro endpoints tested — 31/33 PASS. CRITICAL BUG in /app/backend/server.py affecting GET /pro/patients (lines 776-777) and GET /pro/dossier/{patient_id} (lines 798-799): code queries the WRONG collection `db.grossesse` (singular) instead of `db.grossesses` (plural, used everywhere else), AND filters by field `maman_id` on `grossesse`/`enfants` collections whereas those collections actually store the owner as `user_id` (see create_grossesse L363, create_enfant L418). Result: `has_grossesse` is always False, `grossesse_sa` always None, `enfants_count` always 0, and dossier returns `grossesse: null`, `enfants: []` even when data exists. Verified by seeding a grossesse + 1 enfant for maman@test.com then re-calling both endpoints — fields remained empty. FIX (4 lines, main agent): in server.py change L776 `db.grossesse.find_one({'maman_id': uid})` → `db.grossesses.find_one({'user_id': uid, 'active': True})`; L777 `db.enfants.count_documents({'maman_id': uid})` → `db.enfants.count_documents({'user_id': uid})`; L798 same grossesse fix with patient_id; L799 `db.enfants.find({'maman_id': patient_id})` → `db.enfants.find({'user_id': patient_id})`. All other features validated OK: consultation-notes CRUD, disponibilités GET/PUT, rappels-patient (creates reminder with source='pro', source_pro_id; appears in maman /reminders), rappels-envoyes, teleconsultation/room (persists teleconsultation_url on rdv, 403 for unrelated user), role guards (maman→403 on /pro/*), access control (403 for patient with no rdv link), and regression on login/grossesse/enfants/community/rdv."