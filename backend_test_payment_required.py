"""
Backend tests — Payment-required-on-RDV-creation feature (style La Ruche Health).

Scénarios :
1. Login Pro (Dr alpha) + s'assurer qu'une dispo couvre Lun 09:00 (modes_autorises ouverts)
2. POST /api/rdv mode=teleconsultation → status=pending_payment, payment_method=online,
   payment_required=true, payment_deadline ISO ~30 min in future. Pro PAS notifié.
3. POST /api/rdv mode=domicile + payment_method="cabinet" (tentative bypass) → forcé online.
4. POST /api/rdv mode=presentiel défaut → status=en_attente, payment_method=cabinet, Pro notifié.
5. POST /api/rdv mode=presentiel + payment_method="online" → status=pending_payment.
6. POST /api/pay/consultation pour le RDV de 2 → 200 + payment_url (PayDunya).
7. Auto-cleanup : forcer payment_deadline en passé via mongo direct → GET /api/rdv passe à annulé.
8. Régression : POST /api/rdv presentiel défaut crée toujours en_attente (déjà couvert step 4).
9. Cleanup : PATCH /api/rdv/{id}/cancel pour tous les RDV créés.
"""
import os
import sys
import asyncio
from datetime import datetime, timedelta, timezone

import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = "https://cycle-tracker-pro.preview.emergentagent.com/api"
PRO_PHONE = "+2250709005330"
PRO_PASSWORD = "474Treck"
MAMAN_EMAIL = "maman.test@alomaman.dev"
MAMAN_PASSWORD = "Test1234!"

results = []
created_rdv_ids = []  # for cleanup


def log_pass(label, detail=""):
    results.append((True, label, detail))
    print(f"  ✅ PASS — {label}" + (f" — {detail}" if detail else ""))


def log_fail(label, detail=""):
    results.append((False, label, detail))
    print(f"  ❌ FAIL — {label}" + (f" — {detail}" if detail else ""))


def login(email=None, phone=None, password=None):
    body = {"password": password}
    if email:
        body["email"] = email
    if phone:
        body["phone"] = phone
    r = requests.post(f"{BASE}/auth/login", json=body, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"Login failed for {email or phone}: {r.status_code} {r.text}")
    data = r.json()
    return data["token"], data["user"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def next_monday_at(hour=9, minute=0):
    """Retourne un ISO datetime UTC pour le prochain lundi à hour:minute."""
    now = datetime.now(timezone.utc)
    days_ahead = (0 - now.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7  # toujours lundi prochain (pas aujourd'hui)
    target = (now + timedelta(days=days_ahead)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    # ISO sans Z (le backend le parse avec replace("Z","+00:00"))
    return target.isoformat().replace("+00:00", "+00:00")


def ensure_pro_dispo(pro_tok, pro_id):
    """S'assurer qu'une dispo Lun 08:00–20:00 avec les 3 modes existe."""
    r = requests.get(f"{BASE}/pro/disponibilites", headers=hdr(pro_tok), timeout=30)
    if r.status_code != 200:
        log_fail("pre/get-dispo", f"HTTP {r.status_code}")
        return False
    doc = r.json()
    slots = doc.get("slots") or []
    target_jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
    new_slots = []
    for j in target_jours:
        new_slots.append({
            "jour": j,
            "heure_debut": "08:00",
            "heure_fin": "20:00",
            "actif": True,
            "type_id": "generale",
            "duree_minutes": 30,
            "modes_autorises": ["presentiel", "teleconsultation", "domicile"],
        })
    payload = {"slots": new_slots, "duree_consultation": 30}
    r = requests.put(
        f"{BASE}/pro/disponibilites", json=payload, headers=hdr(pro_tok), timeout=30
    )
    if r.status_code == 200:
        log_pass("pre/set-dispo", f"{len(new_slots)} slots wide-open with 3 modes")
        return True
    log_fail("pre/set-dispo", f"HTTP {r.status_code} {r.text[:200]}")
    return False


def post_rdv(maman_tok, body):
    r = requests.post(f"{BASE}/rdv", json=body, headers=hdr(maman_tok), timeout=30)
    return r


def get_rdv(maman_tok):
    r = requests.get(f"{BASE}/rdv", headers=hdr(maman_tok), timeout=30)
    return r


def get_notifs(tok):
    r = requests.get(f"{BASE}/notifications", headers=hdr(tok), timeout=30)
    return r


def cancel_rdv(maman_tok, rid):
    r = requests.patch(f"{BASE}/rdv/{rid}/cancel", headers=hdr(maman_tok), timeout=30)
    return r


async def force_payment_deadline_past(rdv_id):
    """Use mongo direct to set payment_deadline 1 hour ago."""
    mongo_url = os.environ.get(
        "MONGO_URL",
        "mongodb+srv://missclibigayotoure_db_user:XU7n60qjV2u3XGCN@cluster0.qpjgxtz.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority",
    )
    db_name = os.environ.get("DB_NAME", "alomaman")
    cli = AsyncIOMotorClient(mongo_url)
    try:
        db = cli[db_name]
        past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        res = await db.rdv.update_one(
            {"id": rdv_id}, {"$set": {"payment_deadline": past_iso}}
        )
        return res.modified_count
    finally:
        cli.close()


def main():
    print("=" * 70)
    print("PAYMENT-REQUIRED-ON-RDV-CREATION TESTS")
    print("=" * 70)

    # Step 1 — Login Pro + Maman
    print("\n[1] Login Pro & Maman")
    try:
        pro_tok, pro_user = login(phone=PRO_PHONE, password=PRO_PASSWORD)
        log_pass("login-pro", f"id={pro_user['id'][:8]}.. role={pro_user['role']}")
    except Exception as e:
        log_fail("login-pro", str(e))
        return summary()
    pro_id = pro_user["id"]
    try:
        maman_tok, maman_user = login(email=MAMAN_EMAIL, password=MAMAN_PASSWORD)
        log_pass("login-maman", f"id={maman_user['id'][:8]}..")
    except Exception as e:
        log_fail("login-maman", str(e))
        return summary()

    # Pre-req — set wide dispo for Pro
    print("\n[1b] Configure pro dispo (Lun-Sam 08:00-20:00, 3 modes)")
    ensure_pro_dispo(pro_tok, pro_id)

    # Snapshot pro notifications BEFORE any RDV creation
    r = get_notifs(pro_tok)
    notifs_before = r.json() if r.status_code == 200 else []
    notif_ids_before = {n.get("id") for n in notifs_before}

    target_dt = next_monday_at(9, 0)
    # We'll use varied times to avoid conflicts
    dt_tele = next_monday_at(9, 0)
    dt_dom = next_monday_at(9, 30)
    dt_pres_default = next_monday_at(10, 0)
    dt_pres_online = next_monday_at(10, 30)

    # Step 2 — mode=teleconsultation
    print("\n[2] POST /api/rdv mode=teleconsultation (no payment_method)")
    body = {
        "pro_id": pro_id,
        "date": dt_tele,
        "motif": "Test télé",
        "mode": "teleconsultation",
        "tarif_fcfa": 5000,
    }
    r = post_rdv(maman_tok, body)
    rdv_tele_id = None
    if r.status_code != 200:
        log_fail("step2/post-rdv-tele", f"HTTP {r.status_code} {r.text[:300]}")
    else:
        d = r.json()
        rdv_tele_id = d.get("id")
        created_rdv_ids.append(rdv_tele_id)
        log_pass("step2/post-rdv-tele", f"id={rdv_tele_id[:8]}..")
        if d.get("status") == "pending_payment":
            log_pass("step2/status=pending_payment")
        else:
            log_fail("step2/status", f"got={d.get('status')}")
        if d.get("payment_method") == "online":
            log_pass("step2/payment_method=online")
        else:
            log_fail("step2/payment_method", f"got={d.get('payment_method')}")
        if d.get("payment_required") is True:
            log_pass("step2/payment_required=True")
        else:
            log_fail("step2/payment_required", f"got={d.get('payment_required')}")
        # payment_deadline must be ~30 min in the future
        pd = d.get("payment_deadline")
        if pd:
            try:
                pd_dt = datetime.fromisoformat(pd.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                delta = (pd_dt - now).total_seconds()
                if 25 * 60 <= delta <= 35 * 60:
                    log_pass(
                        "step2/payment_deadline-30min",
                        f"delta={int(delta)}s",
                    )
                else:
                    log_fail(
                        "step2/payment_deadline-30min",
                        f"delta={int(delta)}s (expected 25-35 min)",
                    )
            except Exception as e:
                log_fail("step2/payment_deadline-parse", str(e))
        else:
            log_fail("step2/payment_deadline", "missing")

    # Pro should NOT receive a "Nouvelle demande de RDV" notif for this RDV
    r = get_notifs(pro_tok)
    if r.status_code == 200:
        notifs_after = r.json()
        new_notifs = [n for n in notifs_after if n.get("id") not in notif_ids_before]
        # Look for "Nouvelle demande de RDV" related to this RDV — match by created_at proximity / title
        suspect = [
            n for n in new_notifs
            if "nouvelle demande de rdv" in (n.get("title", "").lower())
        ]
        if not suspect:
            log_pass(
                "step2/pro-not-notified",
                f"new_notifs={len(new_notifs)}, no 'Nouvelle demande de RDV'",
            )
        else:
            log_fail(
                "step2/pro-not-notified",
                f"found {len(suspect)} suspect notif(s): {[s.get('title') for s in suspect]}",
            )
        # Refresh baseline so subsequent tests can detect new notifs
        notif_ids_before = {n.get("id") for n in notifs_after}
    else:
        log_fail("step2/get-pro-notifs", f"HTTP {r.status_code}")

    # Step 3 — mode=domicile with bypass attempt
    print("\n[3] POST /api/rdv mode=domicile + payment_method='cabinet' (bypass)")
    body = {
        "pro_id": pro_id,
        "date": dt_dom,
        "motif": "Test domicile",
        "mode": "domicile",
        "adresse_domicile": "Cocody Riviera lot 12",
        "payment_method": "cabinet",  # tentative bypass
        "tarif_fcfa": 5000,
    }
    r = post_rdv(maman_tok, body)
    rdv_dom_id = None
    if r.status_code != 200:
        log_fail("step3/post-rdv-domicile", f"HTTP {r.status_code} {r.text[:300]}")
    else:
        d = r.json()
        rdv_dom_id = d.get("id")
        created_rdv_ids.append(rdv_dom_id)
        log_pass("step3/post-rdv-domicile", f"id={rdv_dom_id[:8]}..")
        if d.get("payment_method") == "online":
            log_pass("step3/payment_method-forced-online")
        else:
            log_fail("step3/payment_method", f"got={d.get('payment_method')}")
        if d.get("status") == "pending_payment":
            log_pass("step3/status=pending_payment")
        else:
            log_fail("step3/status", f"got={d.get('status')}")
        if d.get("payment_required") is True:
            log_pass("step3/payment_required=True")
        else:
            log_fail("step3/payment_required", f"got={d.get('payment_required')}")
        # frais de déplacement (default 2000 ou pro)
        if d.get("frais_deplacement_fcfa") is not None and d.get("frais_deplacement_fcfa") > 0:
            log_pass(
                "step3/frais_deplacement",
                f"{d.get('frais_deplacement_fcfa')}",
            )
        else:
            log_fail(
                "step3/frais_deplacement",
                f"got={d.get('frais_deplacement_fcfa')}",
            )

    r = get_notifs(pro_tok)
    if r.status_code == 200:
        notifs_after = r.json()
        new_notifs = [n for n in notifs_after if n.get("id") not in notif_ids_before]
        suspect = [
            n for n in new_notifs
            if "nouvelle demande de rdv" in (n.get("title", "").lower())
        ]
        if not suspect:
            log_pass("step3/pro-not-notified")
        else:
            log_fail(
                "step3/pro-not-notified",
                f"found {len(suspect)} suspect notif(s): {[s.get('title') for s in suspect]}",
            )
        notif_ids_before = {n.get("id") for n in notifs_after}
    else:
        log_fail("step3/get-pro-notifs", f"HTTP {r.status_code}")

    # Step 4 — mode=presentiel default
    print("\n[4] POST /api/rdv mode=presentiel (no payment_method) — default cabinet")
    body = {
        "pro_id": pro_id,
        "date": dt_pres_default,
        "motif": "Test cabinet",
        "mode": "presentiel",
        "tarif_fcfa": 5000,
    }
    r = post_rdv(maman_tok, body)
    rdv_pres_id = None
    if r.status_code != 200:
        log_fail("step4/post-rdv-presentiel", f"HTTP {r.status_code} {r.text[:300]}")
    else:
        d = r.json()
        rdv_pres_id = d.get("id")
        created_rdv_ids.append(rdv_pres_id)
        log_pass("step4/post-rdv-presentiel", f"id={rdv_pres_id[:8]}..")
        if d.get("status") == "en_attente":
            log_pass("step4/status=en_attente")
        else:
            log_fail("step4/status", f"got={d.get('status')}")
        if d.get("payment_method") == "cabinet":
            log_pass("step4/payment_method=cabinet")
        else:
            log_fail("step4/payment_method", f"got={d.get('payment_method')}")
        if d.get("payment_required") is False:
            log_pass("step4/payment_required=False")
        else:
            log_fail("step4/payment_required", f"got={d.get('payment_required')}")
        if d.get("payment_deadline") is None:
            log_pass("step4/payment_deadline-null")
        else:
            log_fail("step4/payment_deadline", f"got={d.get('payment_deadline')}")

    # Pro SHOULD be notified
    r = get_notifs(pro_tok)
    if r.status_code == 200:
        notifs_after = r.json()
        new_notifs = [n for n in notifs_after if n.get("id") not in notif_ids_before]
        # Look for new "Nouvelle demande de RDV"
        good = [
            n for n in new_notifs
            if "nouvelle demande de rdv" in (n.get("title", "").lower())
        ]
        if good:
            log_pass(
                "step4/pro-notified",
                f"found {len(good)} 'Nouvelle demande de RDV' notif(s)",
            )
        else:
            log_fail(
                "step4/pro-notified",
                f"new_notifs={len(new_notifs)} but no 'Nouvelle demande de RDV'",
            )
        notif_ids_before = {n.get("id") for n in notifs_after}
    else:
        log_fail("step4/get-pro-notifs", f"HTTP {r.status_code}")

    # Step 5 — mode=presentiel with online
    print("\n[5] POST /api/rdv mode=presentiel + payment_method='online'")
    body = {
        "pro_id": pro_id,
        "date": dt_pres_online,
        "motif": "Test cabinet-online",
        "mode": "presentiel",
        "payment_method": "online",
        "tarif_fcfa": 5000,
    }
    r = post_rdv(maman_tok, body)
    rdv_pres_online_id = None
    if r.status_code != 200:
        log_fail("step5/post-rdv", f"HTTP {r.status_code} {r.text[:300]}")
    else:
        d = r.json()
        rdv_pres_online_id = d.get("id")
        created_rdv_ids.append(rdv_pres_online_id)
        log_pass("step5/post-rdv", f"id={rdv_pres_online_id[:8]}..")
        if d.get("status") == "pending_payment":
            log_pass("step5/status=pending_payment")
        else:
            log_fail("step5/status", f"got={d.get('status')}")
        if d.get("payment_method") == "online":
            log_pass("step5/payment_method=online")
        else:
            log_fail("step5/payment_method", f"got={d.get('payment_method')}")

    r = get_notifs(pro_tok)
    if r.status_code == 200:
        notifs_after = r.json()
        new_notifs = [n for n in notifs_after if n.get("id") not in notif_ids_before]
        suspect = [
            n for n in new_notifs
            if "nouvelle demande de rdv" in (n.get("title", "").lower())
        ]
        if not suspect:
            log_pass("step5/pro-not-notified")
        else:
            log_fail(
                "step5/pro-not-notified",
                f"found {len(suspect)} suspect notif(s)",
            )
        notif_ids_before = {n.get("id") for n in notifs_after}

    # Step 6 — POST /pay/consultation for the tele rdv
    print("\n[6] POST /api/pay/consultation for tele RDV")
    if rdv_tele_id:
        r = requests.post(
            f"{BASE}/pay/consultation",
            json={"rdv_id": rdv_tele_id},
            headers=hdr(maman_tok),
            timeout=60,
        )
        if r.status_code != 200:
            log_fail("step6/pay-consultation", f"HTTP {r.status_code} {r.text[:300]}")
        else:
            d = r.json()
            payment_url = d.get("payment_url")
            payment = d.get("payment") or {}
            if payment_url:
                log_pass("step6/payment_url", f"url={payment_url[:60]}..")
            else:
                # success may be False due to PayDunya keys; still expect token field
                log_fail(
                    "step6/payment_url",
                    f"missing — success={d.get('success')} error={d.get('error')}",
                )
            if payment.get("token"):
                log_pass("step6/payment.token", f"len={len(payment.get('token'))}")
            else:
                log_fail(
                    "step6/payment.token",
                    f"missing — payment={payment}",
                )
            # Amount = tarif=5000 (no CMU on tele)
            if payment.get("amount") == 5000:
                log_pass("step6/amount=5000")
            else:
                log_fail("step6/amount", f"got={payment.get('amount')} expected 5000")

        # Step 6b — Domicile pay : amount = 5000 + frais_deplacement
        if rdv_dom_id:
            r = requests.post(
                f"{BASE}/pay/consultation",
                json={"rdv_id": rdv_dom_id},
                headers=hdr(maman_tok),
                timeout=60,
            )
            if r.status_code != 200:
                log_fail("step6b/pay-domicile", f"HTTP {r.status_code} {r.text[:200]}")
            else:
                d = r.json()
                payment = d.get("payment") or {}
                # amount = base + frais
                base = payment.get("base_amount_fcfa")
                frais = payment.get("frais_deplacement_fcfa")
                amount = payment.get("amount")
                if amount == (base or 0) + (frais or 0):
                    log_pass(
                        "step6b/amount-includes-frais",
                        f"amount={amount} base={base} frais={frais}",
                    )
                else:
                    log_fail(
                        "step6b/amount-includes-frais",
                        f"amount={amount} base={base} frais={frais}",
                    )

    # Step 7 — Auto-cleanup test
    print("\n[7] Auto-cleanup expired pending_payment via mongo + GET /rdv")
    if rdv_pres_online_id:
        try:
            modified = asyncio.run(force_payment_deadline_past(rdv_pres_online_id))
            if modified == 1:
                log_pass("step7/mongo-set-deadline-past", f"modified={modified}")
            else:
                log_fail("step7/mongo-set-deadline-past", f"modified={modified}")
        except Exception as e:
            log_fail("step7/mongo-set-deadline-past", str(e))

        # Now GET /api/rdv as maman → triggers auto-cleanup
        r = get_rdv(maman_tok)
        if r.status_code != 200:
            log_fail("step7/get-rdv", f"HTTP {r.status_code}")
        else:
            items = r.json()
            target = next((it for it in items if it.get("id") == rdv_pres_online_id), None)
            if not target:
                log_fail("step7/find-rdv", "RDV not found in list")
            else:
                if target.get("status") == "annule":
                    log_pass("step7/status=annule")
                else:
                    log_fail("step7/status", f"got={target.get('status')}")
                if target.get("cancelled_by") == "system_payment_timeout":
                    log_pass("step7/cancelled_by=system_payment_timeout")
                else:
                    log_fail(
                        "step7/cancelled_by",
                        f"got={target.get('cancelled_by')}",
                    )

    # Step 8 — Regression already covered by step 4 (presentiel default → en_attente)
    print("\n[8] Regression: step 4 already proved presentiel default → en_attente")

    # Step 9 — Cleanup
    print("\n[9] Cleanup created RDVs")
    for rid in created_rdv_ids:
        try:
            r = cancel_rdv(maman_tok, rid)
            # 200 if cancellable, else likely 400 if already cancelled (step 7 may have)
            if r.status_code == 200:
                log_pass(f"cleanup/{rid[:8]}", "cancelled")
            else:
                # Don't fail the test for this
                print(f"  ℹ️  cleanup {rid[:8]}: HTTP {r.status_code} (likely already cancelled)")
        except Exception as e:
            print(f"  ℹ️  cleanup {rid[:8]}: {e}")

    return summary()


def summary():
    print("\n" + "=" * 70)
    passed = sum(1 for ok, _, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} PASS")
    if passed != total:
        print("\nFailures:")
        for ok, label, detail in results:
            if not ok:
                print(f"  ❌ {label} — {detail}")
    print("=" * 70)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
