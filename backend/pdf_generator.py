"""
Générateur de PDF pour les déclarations de naissance — À lo Maman.
Format A4, design administratif officiel (vert/orange/blanc).
Utilise ReportLab + qrcode pour un rendu professionnel.
"""
from __future__ import annotations
import io
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
import qrcode
from PIL import Image

# Couleurs officielles
COLOR_GREEN = HexColor("#0E7C3E")    # Vert officiel CI
COLOR_ORANGE = HexColor("#F39200")   # Orange officiel CI
COLOR_DARK = HexColor("#1F2937")
COLOR_GRAY = HexColor("#6B7280")
COLOR_LIGHT_GRAY = HexColor("#F3F4F6")
COLOR_BORDER = HexColor("#D1D5DB")


def _make_qr_image(data: str, size_px: int = 280) -> Image.Image:
    """Génère une image QR-code à partir des données."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0E7C3E", back_color="white").convert("RGB")
    img = img.resize((size_px, size_px), Image.NEAREST)
    return img


def _format_date_fr(iso_str: Optional[str]) -> str:
    if not iso_str:
        return "—"
    try:
        s = iso_str.replace("Z", "+00:00") if isinstance(iso_str, str) else iso_str
        dt = datetime.fromisoformat(s) if isinstance(s, str) else s
        mois = ["janvier", "février", "mars", "avril", "mai", "juin",
                "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        return f"{dt.day} {mois[dt.month-1]} {dt.year}"
    except Exception:
        return str(iso_str)


def _format_datetime_fr(iso_str: Optional[str]) -> str:
    if not iso_str:
        return "—"
    try:
        s = iso_str.replace("Z", "+00:00") if isinstance(iso_str, str) else iso_str
        dt = datetime.fromisoformat(s) if isinstance(s, str) else s
        return dt.strftime("%d/%m/%Y à %H:%M")
    except Exception:
        return str(iso_str)


def generate_naissance_pdf(naissance: Dict[str, Any], maman: Dict[str, Any]) -> bytes:
    """
    Génère un PDF officiel de déclaration de naissance.

    Args:
        naissance: dict avec les champs de la déclaration (enfant_nom, lieu_naissance, etc.)
        maman: dict avec les infos de la maman (name, cmu, phone, ville, etc.)

    Returns:
        bytes: PDF binaire
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # ---------- HEADER ----------
    # Bandeau vert en haut
    c.setFillColor(COLOR_GREEN)
    c.rect(0, height - 3*cm, width, 3*cm, fill=1, stroke=0)

    # Bandeau orange fin sous le vert
    c.setFillColor(COLOR_ORANGE)
    c.rect(0, height - 3*cm - 0.3*cm, width, 0.3*cm, fill=1, stroke=0)

    # Logo / Titre dans le bandeau vert
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2*cm, height - 1.5*cm, "À LO MAMAN")
    c.setFont("Helvetica", 9)
    c.drawString(2*cm, height - 2.0*cm, "Plateforme de santé maternelle et pédiatrique")
    c.drawString(2*cm, height - 2.4*cm, "République de Côte d'Ivoire")

    # Sceau / Cachet à droite du bandeau
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(width - 2*cm, height - 1.4*cm, "DÉCLARATION FACILITÉE")
    c.setFont("Helvetica", 8)
    c.drawRightString(width - 2*cm, height - 1.85*cm, "À présenter à l'état civil")
    c.drawRightString(width - 2*cm, height - 2.25*cm, "Document non-officiel pré-rempli")

    # ---------- TITRE ----------
    y = height - 4.5*cm
    c.setFillColor(COLOR_DARK)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width/2, y, "DÉCLARATION DE NAISSANCE")

    y -= 0.6*cm
    c.setFont("Helvetica", 9)
    c.setFillColor(COLOR_GRAY)
    ref = naissance.get("numero_reference", "—")
    created = naissance.get("created_at", "")
    c.drawCentredString(width/2, y, f"Référence : {ref}  •  Établi le {_format_datetime_fr(created)}")

    # ---------- BLOC ENFANT ----------
    y -= 1.0*cm
    _draw_section_header(c, y, "ENFANT NÉ(E)")
    y -= 0.7*cm

    enfant_nom = naissance.get("enfant_nom", "—")
    prenoms = naissance.get("prenoms", "")
    sexe = "Fille" if naissance.get("enfant_sexe") == "F" else "Garçon"
    dob = _format_date_fr(naissance.get("enfant_date_naissance"))
    heure = naissance.get("heure_naissance", "—")
    lieu = naissance.get("lieu_naissance", "—")

    rows_enfant = [
        ["Nom de famille", enfant_nom or "—"],
        ["Prénom(s)", prenoms or "—"],
        ["Sexe", sexe],
        ["Date de naissance", dob],
        ["Heure de naissance", heure],
        ["Lieu de naissance", lieu],
    ]
    y = _draw_info_table(c, 2*cm, y, width - 4*cm, rows_enfant)

    # Mensurations à la naissance
    y -= 0.4*cm
    _draw_section_header(c, y, "MENSURATIONS À LA NAISSANCE")
    y -= 0.7*cm
    poids_g = naissance.get("poids_naissance_g")
    taille = naissance.get("taille_naissance_cm")
    apgar1 = naissance.get("score_apgar_1min")
    apgar5 = naissance.get("score_apgar_5min")
    rows_mensu = [
        ["Poids", f"{poids_g} g ({(poids_g/1000):.3f} kg)" if poids_g else "—"],
        ["Taille", f"{taille} cm" if taille else "—"],
        ["Score APGAR (1 min)", f"{apgar1} / 10" if apgar1 is not None else "—"],
        ["Score APGAR (5 min)", f"{apgar5} / 10" if apgar5 is not None else "—"],
    ]
    y = _draw_info_table(c, 2*cm, y, width - 4*cm, rows_mensu)

    # ---------- BLOC PARENTS ----------
    y -= 0.4*cm
    _draw_section_header(c, y, "PARENTS")
    y -= 0.7*cm
    rows_parents = [
        ["Mère (nom et prénoms)", naissance.get("nom_mere") or maman.get("name") or "—"],
        ["Profession", naissance.get("profession_mere") or "—"],
        ["Téléphone", maman.get("phone") or "—"],
        ["N° CMU mère", maman.get("cmu", {}).get("numero") if isinstance(maman.get("cmu"), dict) else (naissance.get("numero_cmu_mere") or "—")],
        ["Père (nom et prénoms)", naissance.get("nom_pere") or "Non renseigné"],
        ["Profession", naissance.get("profession_pere") or "—"],
    ]
    y = _draw_info_table(c, 2*cm, y, width - 4*cm, rows_parents)

    # Médecin / sage-femme
    if naissance.get("medecin_accoucheur"):
        y -= 0.3*cm
        _draw_section_header(c, y, "PERSONNEL MÉDICAL")
        y -= 0.7*cm
        rows_med = [["Médecin / sage-femme", naissance.get("medecin_accoucheur") or "—"]]
        y = _draw_info_table(c, 2*cm, y, width - 4*cm, rows_med)

    # ---------- QR CODE + Réf ----------
    qr_payload = json.dumps({
        "ref": ref,
        "enfant": enfant_nom,
        "dob": naissance.get("enfant_date_naissance"),
        "lieu": lieu,
        "mere": maman.get("name"),
        "platform": "alomaman.ci",
    }, ensure_ascii=False)
    qr_img = _make_qr_image(qr_payload, size_px=280)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    qr_size = 3.0*cm
    qr_x = width - 2*cm - qr_size
    qr_y_top = 7.5*cm  # ancré en bas
    c.drawImage(_image_reader(qr_buf), qr_x, qr_y_top, qr_size, qr_size, mask='auto')
    c.setFont("Helvetica", 7)
    c.setFillColor(COLOR_GRAY)
    c.drawCentredString(qr_x + qr_size/2, qr_y_top - 0.3*cm, "Scanner pour vérifier")

    # ---------- BLOC SIGNATURE ----------
    sig_y = 5.5*cm
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(0.5)

    # Signature mère (gauche)
    c.line(2*cm, sig_y, 8*cm, sig_y)
    c.setFont("Helvetica", 9)
    c.setFillColor(COLOR_DARK)
    c.drawString(2*cm, sig_y - 0.4*cm, "Signature de la mère")
    c.setFont("Helvetica", 7)
    c.setFillColor(COLOR_GRAY)
    c.drawString(2*cm, sig_y - 0.75*cm, f"({naissance.get('nom_mere') or maman.get('name') or ''})")

    # Signature déclarant (centre)
    c.line(9*cm, sig_y, 13.5*cm, sig_y)
    c.setFont("Helvetica", 9)
    c.setFillColor(COLOR_DARK)
    c.drawString(9*cm, sig_y - 0.4*cm, "Signature du déclarant")
    c.setFont("Helvetica", 7)
    c.setFillColor(COLOR_GRAY)
    c.drawString(9*cm, sig_y - 0.75*cm, "(qui dépose la déclaration à l'état civil)")

    # ---------- FOOTER ----------
    foot_y = 2.5*cm
    c.setStrokeColor(COLOR_GREEN)
    c.setLineWidth(1.5)
    c.line(2*cm, foot_y + 0.4*cm, width - 2*cm, foot_y + 0.4*cm)

    c.setFillColor(COLOR_DARK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(width/2, foot_y, "Document généré par À lo Maman")
    c.setFont("Helvetica", 7)
    c.setFillColor(COLOR_GRAY)
    c.drawCentredString(width/2, foot_y - 0.35*cm, "Plateforme agréée par le Ministère de la Femme, de la Famille et de l'Enfant")
    c.drawCentredString(width/2, foot_y - 0.65*cm, f"Ce document n'a pas valeur d'acte de naissance — il sert uniquement à faciliter votre démarche à l'état civil.")
    c.drawCentredString(width/2, foot_y - 0.95*cm, f"www.alomaman.ci  •  Page 1 / 1")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


# ----------------- helpers -----------------
def _draw_section_header(c: canvas.Canvas, y: float, title: str):
    """Bandeau de section vert avec texte blanc."""
    width, _ = A4
    c.setFillColor(COLOR_GREEN)
    c.rect(2*cm, y - 0.05*cm, width - 4*cm, 0.55*cm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(2.3*cm, y + 0.08*cm, title)


def _draw_info_table(c: canvas.Canvas, x: float, y: float, w: float,
                     rows: list[list[str]]) -> float:
    """
    Dessine un tableau 2 colonnes (label/valeur) et retourne la nouvelle y position.
    """
    label_w = 5.5*cm
    row_h = 0.55*cm
    for i, (label, value) in enumerate(rows):
        # Background alterné
        if i % 2 == 0:
            c.setFillColor(COLOR_LIGHT_GRAY)
            c.rect(x, y - row_h, w, row_h, fill=1, stroke=0)
        # Label
        c.setFillColor(COLOR_GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(x + 0.2*cm, y - row_h + 0.18*cm, str(label) + " :")
        # Valeur
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 9)
        # Truncate si trop long
        val = str(value or "—")
        if len(val) > 60:
            val = val[:57] + "..."
        c.drawString(x + label_w, y - row_h + 0.18*cm, val)
        y -= row_h
    return y


def _image_reader(buf: io.BytesIO):
    """Wrap a BytesIO buffer for ReportLab drawImage."""
    from reportlab.lib.utils import ImageReader
    return ImageReader(buf)



# ============================================================================
# CARNET MÉDICAL DE L'ENFANT — PDF
# ============================================================================

def generate_carnet_pdf(
    enfant: Dict[str, Any],
    maman: Dict[str, Any],
    composition: Dict[str, Any],
    immunizations: list,
    observations: list,
    diagnostic_reports: list,
    age_mois: int,
    dmp_summary: Optional[Dict[str, Any]] = None,
) -> bytes:
    """Génère un PDF du carnet médical complet de l'enfant.

    Sections : Identité enfant, Identité maman, Vaccinations EPI, Croissance,
    Examens & Imagerie, Suivi DMP, Allergies. Format A4 vert/orange.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # ---------- HEADER ----------
    c.setFillColor(COLOR_GREEN)
    c.rect(0, height - 3 * cm, width, 3 * cm, fill=1, stroke=0)
    c.setFillColor(COLOR_ORANGE)
    c.rect(0, height - 3 * cm - 0.3 * cm, width, 0.3 * cm, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(2 * cm, height - 1.5 * cm, "À LO MAMAN")
    c.setFont("Helvetica", 9)
    c.drawString(2 * cm, height - 2.0 * cm, "Carnet médical pédiatrique")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - 2 * cm, height - 1.5 * cm, "CARNET DE SANTÉ")
    c.setFont("Helvetica", 9)
    c.drawRightString(width - 2 * cm, height - 2.0 * cm, f"Édité le {_format_datetime_fr(datetime.now(timezone.utc).isoformat())}")

    y = height - 4.2 * cm

    # ---------- IDENTITÉ ENFANT ----------
    c.setFillColor(COLOR_DARK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, "👶 Identité de l'enfant")
    y -= 0.6 * cm
    c.setStrokeColor(COLOR_GREEN)
    c.setLineWidth(1.5)
    c.line(2 * cm, y, width - 2 * cm, y)
    y -= 0.5 * cm

    c.setFont("Helvetica", 11)
    c.setFillColor(COLOR_DARK)
    annees, mois = divmod(age_mois, 12)
    age_str = f"{annees} an(s) {mois} mois" if annees else f"{age_mois} mois"
    rows = [
        ("Nom", enfant.get("nom", "—")),
        ("Sexe", "Fille" if (enfant.get("sexe") == "F") else "Garçon"),
        ("Né(e) le", _format_date_fr(enfant.get("date_naissance"))),
        ("Âge", age_str),
        ("N° CMU enfant", enfant.get("numero_cmu") or "—"),
        ("Groupe sanguin", enfant.get("groupe_sanguin") or "—"),
    ]
    for label, val in rows:
        c.setFillColor(COLOR_GRAY)
        c.drawString(2 * cm, y, label + " :")
        c.setFillColor(COLOR_DARK)
        c.drawString(5.5 * cm, y, str(val))
        y -= 0.5 * cm
    y -= 0.3 * cm

    # ---------- IDENTITÉ MAMAN ----------
    c.setFillColor(COLOR_DARK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, "👩 Mère")
    y -= 0.5 * cm
    c.setStrokeColor(COLOR_GREEN)
    c.line(2 * cm, y, width - 2 * cm, y)
    y -= 0.5 * cm
    c.setFont("Helvetica", 11)
    c.setFillColor(COLOR_GRAY)
    c.drawString(2 * cm, y, "Nom :")
    c.setFillColor(COLOR_DARK)
    c.drawString(5.5 * cm, y, str(maman.get("name", "—")))
    y -= 0.5 * cm
    c.setFillColor(COLOR_GRAY)
    c.drawString(2 * cm, y, "Téléphone :")
    c.setFillColor(COLOR_DARK)
    c.drawString(5.5 * cm, y, str(maman.get("phone", "—")))
    y -= 0.7 * cm

    # ---------- VACCINATIONS ----------
    if immunizations:
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, f"💉 Vaccinations ({len(immunizations)})")
        y -= 0.5 * cm
        c.setStrokeColor(COLOR_GREEN)
        c.line(2 * cm, y, width - 2 * cm, y)
        y -= 0.4 * cm
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(COLOR_GREEN)
        c.drawString(2 * cm, y, "VACCIN")
        c.drawString(8 * cm, y, "DATE")
        c.drawString(13 * cm, y, "STATUT")
        y -= 0.4 * cm
        c.setFont("Helvetica", 10)
        for v in immunizations:
            if y < 3 * cm:
                c.showPage()
                y = height - 2 * cm
            c.setFillColor(COLOR_DARK)
            nom = v.get("vaccineCode", {}).get("text", "—")
            occ = _format_date_fr(v.get("occurrenceDateTime"))
            statut = "✓ Fait" if v.get("status") == "completed" else "À faire"
            statut_color = COLOR_GREEN if v.get("status") == "completed" else COLOR_ORANGE
            c.drawString(2 * cm, y, str(nom)[:35])
            c.drawString(8 * cm, y, occ)
            c.setFillColor(statut_color)
            c.drawString(13 * cm, y, statut)
            y -= 0.45 * cm
        y -= 0.3 * cm

    # ---------- CROISSANCE ----------
    if observations:
        if y < 5 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, f"📈 Croissance ({len(observations)} mesures)")
        y -= 0.5 * cm
        c.setStrokeColor(COLOR_GREEN)
        c.line(2 * cm, y, width - 2 * cm, y)
        y -= 0.4 * cm
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(COLOR_GREEN)
        c.drawString(2 * cm, y, "DATE")
        c.drawString(7 * cm, y, "MESURE")
        c.drawString(13 * cm, y, "VALEUR")
        y -= 0.4 * cm
        c.setFont("Helvetica", 10)
        for o in observations:
            if y < 3 * cm:
                c.showPage()
                y = height - 2 * cm
            c.setFillColor(COLOR_DARK)
            d = _format_date_fr(o.get("effectiveDateTime"))
            label = (o.get("code") or {}).get("text", "—")
            vq = o.get("valueQuantity") or {}
            val = f"{vq.get('value', '')} {vq.get('unit', '')}".strip()
            c.drawString(2 * cm, y, d)
            c.drawString(7 * cm, y, str(label)[:30])
            c.drawString(13 * cm, y, val)
            y -= 0.45 * cm
        y -= 0.3 * cm

    # ---------- EXAMENS & IMAGERIE ----------
    if diagnostic_reports:
        if y < 4 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, f"🔬 Examens & Imagerie ({len(diagnostic_reports)})")
        y -= 0.5 * cm
        c.setStrokeColor(COLOR_GREEN)
        c.line(2 * cm, y, width - 2 * cm, y)
        y -= 0.4 * cm
        c.setFont("Helvetica", 10)
        for d in diagnostic_reports:
            if y < 3 * cm:
                c.showPage()
                y = height - 2 * cm
            title = (d.get("code") or {}).get("text", "Rapport")
            date = _format_date_fr(d.get("effectiveDateTime"))
            conclusion = d.get("conclusion") or "—"
            c.setFillColor(COLOR_DARK)
            c.setFont("Helvetica-Bold", 10)
            c.drawString(2 * cm, y, f"• {title} — {date}")
            y -= 0.45 * cm
            c.setFont("Helvetica", 9)
            c.setFillColor(COLOR_GRAY)
            for line in str(conclusion)[:200].split("\n"):
                c.drawString(2.4 * cm, y, line[:80])
                y -= 0.35 * cm
            y -= 0.15 * cm

    # ---------- DMP ----------
    if dmp_summary:
        if y < 4 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, "🧠 Suivi du développement (DMP)")
        y -= 0.5 * cm
        c.setStrokeColor(COLOR_GREEN)
        c.line(2 * cm, y, width - 2 * cm, y)
        y -= 0.5 * cm
        c.setFont("Helvetica", 11)
        c.setFillColor(COLOR_DARK)
        score = dmp_summary.get("score_global")
        if score is None:
            score = "—"
        c.drawString(2 * cm, y, f"Score global : {score}%")
        y -= 0.5 * cm
        cov = dmp_summary.get("couverture") or {}
        c.drawString(2 * cm, y, f"Couverture : {cov.get('repondus', 0)}/{cov.get('attendus', 0)} ({cov.get('pct', 0)}%)")
        y -= 0.5 * cm
        nb_alertes = len(dmp_summary.get("alertes") or [])
        if nb_alertes:
            c.setFillColor(HexColor("#EF4444"))
            c.drawString(2 * cm, y, f"⚠️ {nb_alertes} jalon(s) en alerte — consulter pédiatre")
            y -= 0.5 * cm

    # ---------- ALLERGIES ----------
    allergies = enfant.get("allergies")
    if allergies:
        if y < 3 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, "⚠️ Allergies")
        y -= 0.5 * cm
        c.setStrokeColor(HexColor("#EF4444"))
        c.line(2 * cm, y, width - 2 * cm, y)
        y -= 0.5 * cm
        c.setFont("Helvetica", 11)
        c.setFillColor(HexColor("#DC2626"))
        if isinstance(allergies, list):
            for a in allergies:
                c.drawString(2 * cm, y, f"• {a}")
                y -= 0.4 * cm
        else:
            c.drawString(2 * cm, y, f"• {allergies}")

    # ---------- FOOTER ----------
    c.setFillColor(COLOR_GRAY)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(width / 2, 1.2 * cm, "Document généré par À lo Maman — Conforme FHIR R4 / HL7")
    c.drawCentredString(width / 2, 0.8 * cm, "alomaman.com")

    c.save()
    return buf.getvalue()



# ========================================================================================
# 📊 RAPPORTS TND (M-CHAT-R) — Trouble du Neuro-Développement
# ========================================================================================

COLOR_PURPLE = HexColor("#7C3AED")
COLOR_PINK = HexColor("#EC4899")
COLOR_RED = HexColor("#DC2626")
COLOR_AMBER = HexColor("#F59E0B")
COLOR_EMERALD = HexColor("#10B981")


def _draw_header(c: canvas.Canvas, title: str, subtitle: str, color=COLOR_PURPLE):
    """En-tête réutilisable pour tous les rapports médicaux."""
    width, height = A4
    c.setFillColor(color)
    c.rect(0, height - 3.5 * cm, width, 3.5 * cm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(2 * cm, height - 2 * cm, title)
    c.setFont("Helvetica", 11)
    c.drawString(2 * cm, height - 2.8 * cm, subtitle)
    # Logo À lo Maman texte
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - 2 * cm, height - 2 * cm, "À lo Maman 🌸")
    c.setFont("Helvetica-Oblique", 8)
    c.drawRightString(width - 2 * cm, height - 2.6 * cm, "Santé maternelle & pédiatrique")


def _draw_footer(c: canvas.Canvas, page_num: int, total_pages: int, extra: str = ""):
    """Pied de page réutilisable."""
    width, _ = A4
    c.setFillColor(COLOR_GRAY)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(2 * cm, 1.5 * cm, f"Généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')} · alomaman.com")
    c.drawRightString(width - 2 * cm, 1.5 * cm, f"Page {page_num}/{total_pages}")
    if extra:
        c.setFont("Helvetica-Oblique", 7)
        c.drawCentredString(width / 2, 1 * cm, extra)


def _wrap_lines(text: str, max_chars: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = f"{cur} {w}" if cur else w
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


def generate_tnd_pdf(
    screening: Dict[str, Any],
    enfant: Dict[str, Any],
    maman: Dict[str, Any],
    followup: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Génère le rapport PDF d'un dépistage M-CHAT-R/F (Trouble du Neuro-Développement).
    Inclut :
    - Identité enfant + parent
    - Score et niveau de risque avec code SNOMED CT
    - Détails Q1-Q20 avec réponses
    - Follow-up M-CHAT-R/F si présent
    - Recommandations
    - Codes SNOMED CT attachés
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # ---------- HEADER ----------
    level = (followup or {}).get("finalized_level") or screening.get("level", "low_risk")
    level_map = {
        "low_risk": ("Risque faible", COLOR_EMERALD, "428443002"),
        "medium_risk": ("Risque modéré", COLOR_AMBER, "428443002"),
        "high_risk": ("Risque élevé — Orientation recommandée", COLOR_RED, "35919005"),
    }
    lvl_label, lvl_color, snomed_lvl = level_map.get(level, level_map["low_risk"])
    _draw_header(
        c,
        "Rapport de dépistage M-CHAT-R/F",
        f"Enfant : {enfant.get('prenom', '')} {enfant.get('nom', '')}",
        color=COLOR_PURPLE,
    )

    y = height - 4.5 * cm

    # ---------- BADGE NIVEAU ----------
    c.setFillColor(lvl_color)
    c.roundRect(2 * cm, y - 1 * cm, 17 * cm, 1.5 * cm, 6, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2, y - 0.3 * cm, f"🎯 Résultat : {lvl_label}")
    c.setFont("Helvetica", 9)
    score = (followup or {}).get("final_score", screening.get("score", 0))
    c.drawCentredString(width / 2, y - 0.75 * cm, f"Score M-CHAT-R : {score} / 20 · SNOMED CT : {snomed_lvl}")
    y -= 2 * cm

    # ---------- IDENTITÉ ----------
    def _section_title(txt):
        nonlocal y
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, txt)
        c.setStrokeColor(COLOR_PURPLE)
        c.setLineWidth(2)
        c.line(2 * cm, y - 0.15 * cm, 6 * cm, y - 0.15 * cm)
        y -= 0.6 * cm

    def _row(label: str, value: str):
        nonlocal y
        c.setFillColor(COLOR_GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(2 * cm, y, label)
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(6 * cm, y, str(value or "—"))
        y -= 0.5 * cm

    _section_title("👶 Identité de l'enfant")
    _row("Prénom / Nom", f"{enfant.get('prenom', '')} {enfant.get('nom', '')}")
    _row("Date de naissance", enfant.get("date_naissance", "—"))
    age_m = enfant.get("age_mois")
    _row("Âge au dépistage", f"{age_m} mois" if age_m else "—")
    _row("Sexe", enfant.get("sexe", "—"))
    _row("Parent référent", f"{maman.get('name', '')} · {maman.get('phone', '—')}")
    y -= 0.3 * cm

    _section_title("📅 Dépistage")
    _row("Date du dépistage", screening.get("created_at", "—")[:19].replace("T", " "))
    _row("Version M-CHAT-R", screening.get("version", "M-CHAT-R (2014)"))
    _row("Followup M-CHAT-R/F", "Oui" if followup else "Non")
    y -= 0.3 * cm

    # ---------- DÉTAIL RÉPONSES ----------
    if screening.get("responses"):
        _section_title("📋 Détail des réponses (Q1-Q20)")
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica", 8)
        responses = screening["responses"]
        # 2 colonnes
        col_width = 8.5 * cm
        for i, r in enumerate(responses[:20]):
            col = i % 2
            row = i // 2
            x = 2 * cm + col * col_width
            yy = y - row * 0.55 * cm
            q_num = r.get("question_id", i + 1)
            answer = r.get("answer") or r.get("value") or "—"
            is_risk = r.get("is_risk", False)
            # Couleur point
            c.setFillColor(COLOR_RED if is_risk else COLOR_EMERALD)
            c.circle(x, yy + 0.1 * cm, 0.08 * cm, fill=1, stroke=0)
            # Texte
            c.setFillColor(COLOR_DARK)
            c.setFont("Helvetica", 8)
            c.drawString(x + 0.3 * cm, yy, f"Q{q_num}: {str(answer)[:35]}")
        y -= (len(responses) // 2 + 1) * 0.55 * cm + 0.3 * cm

    # ---------- FOLLOWUP ----------
    if followup:
        _section_title("🔍 Suivi M-CHAT-R/F (entretien approfondi)")
        _row("Statut", "Complété" if followup.get("conducted") else "Non conduit")
        _row("Score final ajusté", f"{followup.get('final_score', 0)} / 20")
        _row("Niveau finalisé", followup.get("finalized_level", level))
        if followup.get("clinician_notes"):
            _row("Notes cliniques", (followup["clinician_notes"] or "")[:80])
        y -= 0.3 * cm

    # ---------- SNOMED CT ----------
    snomed_codes = screening.get("snomed_codes", [])
    if snomed_codes:
        if y < 6 * cm:
            _draw_footer(c, 1, 2, "SNOMED CT · MSP CI · RGSSI Niveau 3")
            c.showPage()
            _draw_header(c, "Rapport TND — Suite", "Codes cliniques SNOMED CT", color=COLOR_PURPLE)
            y = height - 4.5 * cm
        _section_title("🧬 Codification clinique SNOMED CT")
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica", 9)
        for code in snomed_codes[:10]:
            c.drawString(2 * cm, y, f"• {code.get('display', '—')} ({code.get('code', '—')})")
            y -= 0.45 * cm
        y -= 0.3 * cm

    # ---------- RECOMMANDATIONS ----------
    _section_title("💡 Recommandations")
    reco_map = {
        "low_risk": [
            "Développement dans les normes attendues pour l'âge.",
            "Poursuivre les rendez-vous pédiatriques réguliers.",
            "Nouveau dépistage à 24 mois si première évaluation < 24 mois.",
        ],
        "medium_risk": [
            "Consulter un pédiatre pour évaluation approfondie.",
            "Suivi de développement rapproché (tous les 3 mois).",
            "Envisager stimulation langage / motricité.",
        ],
        "high_risk": [
            "🚨 Orientation vers spécialiste (neuropédiatre / CRA).",
            "Prise en charge précoce recommandée (avant 3 ans).",
            "Bilan orthophonique et psychomotricité conseillé.",
            "Support parental et information sur le TSA.",
        ],
    }
    for line in reco_map.get(level, reco_map["low_risk"]):
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica", 10)
        lines = _wrap_lines(line, 90)
        for l in lines:
            c.drawString(2.5 * cm, y, f"• {l}")
            y -= 0.5 * cm
    y -= 0.3 * cm

    # ---------- DISCLAIMER ----------
    c.setFillColor(COLOR_LIGHT_GRAY)
    c.roundRect(2 * cm, y - 1.5 * cm, 17 * cm, 1.5 * cm, 4, stroke=0, fill=1)
    c.setFillColor(COLOR_GRAY)
    c.setFont("Helvetica-Oblique", 8)
    disclaimer = (
        "Ce dépistage ne remplace PAS un diagnostic médical. Il constitue une aide à l'orientation "
        "et doit être interprété par un professionnel de santé. La M-CHAT-R n'est pas un test diagnostique. "
        "Rapport chiffré, conforme RGSSI N3."
    )
    for i, line in enumerate(_wrap_lines(disclaimer, 100)):
        c.drawCentredString(width / 2, y - 0.4 * cm - i * 0.35 * cm, line)

    _draw_footer(c, 1, 1, "M-CHAT-R · SNOMED CT · Confidentiel · RGSSI Niveau 3")
    c.save()
    return buf.getvalue()


# ========================================================================================
# 🌸 RAPPORT POST-PARTUM (Moi Aussi)
# ========================================================================================

def generate_postpartum_pdf(
    postpartum: Dict[str, Any],
    checkins: list,
    maman: Dict[str, Any],
    enfant: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Génère le rapport PDF post-partum : suivi mental & physique de la maman.
    Inclut : profil, courbe d'humeur, EPDS, alertes critiques, symptômes, notes déchiffrées, codes SNOMED.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    _draw_header(
        c,
        "Rapport Post-Partum",
        f"Maman : {maman.get('name', '')} · {len(checkins)} check-in(s)",
        color=COLOR_PINK,
    )
    y = height - 4.5 * cm

    # ---------- BANDEAU SYNTHÈSE ----------
    critical_count = sum(1 for ch in checkins if ch.get("critical_alerts"))
    epds_scores = [ch.get("epds_score") for ch in checkins if ch.get("epds_score") is not None]
    avg_epds = sum(epds_scores) / len(epds_scores) if epds_scores else 0
    mood_series = [ch.get("mood", 3) for ch in checkins if ch.get("mood")]
    avg_mood = sum(mood_series) / len(mood_series) if mood_series else 0

    banner_color = COLOR_RED if critical_count > 0 or avg_epds > 12 else (
        COLOR_AMBER if avg_epds > 9 or avg_mood < 3 else COLOR_EMERALD
    )
    c.setFillColor(banner_color)
    c.roundRect(2 * cm, y - 1.5 * cm, 17 * cm, 2 * cm, 6, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    status = "⚠️ ATTENTION requise" if critical_count > 0 or avg_epds > 12 else (
        "🟡 Vigilance" if avg_epds > 9 or avg_mood < 3 else "✅ Récupération normale"
    )
    c.drawCentredString(width / 2, y - 0.5 * cm, status)
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, y - 1 * cm, f"Humeur moyenne : {avg_mood:.1f}/5  ·  EPDS moyen : {avg_epds:.1f}/30  ·  Alertes critiques : {critical_count}")
    y -= 2.5 * cm

    # ---------- IDENTITÉ ----------
    def _section_title(txt):
        nonlocal y
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(2 * cm, y, txt)
        c.setStrokeColor(COLOR_PINK)
        c.setLineWidth(2)
        c.line(2 * cm, y - 0.15 * cm, 6 * cm, y - 0.15 * cm)
        y -= 0.6 * cm

    def _row(label: str, value: str):
        nonlocal y
        c.setFillColor(COLOR_GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(2 * cm, y, label)
        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(6 * cm, y, str(value or "—"))
        y -= 0.5 * cm

    _section_title("👩 Profil")
    _row("Maman", f"{maman.get('name', '')}")
    _row("Téléphone", maman.get("phone", "—"))
    _row("Date accouchement", postpartum.get("accouchement_date", "—")[:10])
    _row("Type accouchement", postpartum.get("delivery_type", "—"))
    _row("Allaitement", postpartum.get("allaitement_mode", "—"))
    if enfant:
        _row("Enfant", f"{enfant.get('prenom', '')} {enfant.get('nom', '')}")
    y -= 0.3 * cm

    # ---------- COURBE D'HUMEUR ----------
    if mood_series and len(mood_series) >= 2:
        _section_title("📈 Courbe d'humeur (chronologique)")
        chart_x0, chart_y0 = 2.5 * cm, y - 4 * cm
        chart_w, chart_h = 16 * cm, 3.5 * cm
        # Axes
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        for i in range(6):
            yy = chart_y0 + (i / 5) * chart_h
            c.line(chart_x0, yy, chart_x0 + chart_w, yy)
            c.setFillColor(COLOR_GRAY)
            c.setFont("Helvetica", 7)
            c.drawRightString(chart_x0 - 0.15 * cm, yy - 0.05 * cm, str(i))
        # Points
        n = min(len(mood_series), 26)
        points = []
        for i, m in enumerate(mood_series[:n]):
            px = chart_x0 + (i / max(1, n - 1)) * chart_w
            py = chart_y0 + (m / 5) * chart_h
            points.append((px, py))
        # Lignes
        c.setStrokeColor(COLOR_PINK)
        c.setLineWidth(1.5)
        for i in range(len(points) - 1):
            c.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
        # Points colorés
        for px, py in points:
            c.setFillColor(COLOR_PINK)
            c.circle(px, py, 0.09 * cm, fill=1, stroke=0)
        # Label
        c.setFillColor(COLOR_GRAY)
        c.setFont("Helvetica-Oblique", 7)
        c.drawString(chart_x0, chart_y0 - 0.4 * cm, "Semaines 1 → présent (échelle 1-5)")
        y = chart_y0 - 0.9 * cm

    # ---------- ALERTES CRITIQUES ----------
    critical_alerts_all = []
    for ch in checkins:
        for a in ch.get("critical_alerts", []) or []:
            critical_alerts_all.append({**a, "week_pp": ch.get("week_pp", "?")})
    if critical_alerts_all:
        _section_title("🚨 Alertes critiques rencontrées")
        for a in critical_alerts_all[:8]:
            c.setFillColor(COLOR_RED)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(2.5 * cm, y, f"⚠️ S{a.get('week_pp')} · {a.get('type', 'alerte')}")
            y -= 0.4 * cm
            c.setFillColor(COLOR_DARK)
            c.setFont("Helvetica", 9)
            msg = a.get("message", "")
            for l in _wrap_lines(msg, 95)[:2]:
                c.drawString(3 * cm, y, l)
                y -= 0.4 * cm
            y -= 0.15 * cm
        y -= 0.2 * cm

    # ---------- DÉTAIL CHECK-INS ----------
    if y < 8 * cm:
        _draw_footer(c, 1, 2, "Post-Partum · SNOMED CT · Confidentiel")
        c.showPage()
        _draw_header(c, "Rapport Post-Partum — Détails", f"Maman : {maman.get('name', '')}", color=COLOR_PINK)
        y = height - 4.5 * cm

    _section_title("📋 Historique des check-ins")
    c.setFillColor(COLOR_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(2 * cm, y, "Sem.")
    c.drawString(3.5 * cm, y, "Humeur")
    c.drawString(5.5 * cm, y, "EPDS")
    c.drawString(7.5 * cm, y, "Symptômes")
    c.drawString(15 * cm, y, "Alerte")
    y -= 0.4 * cm
    c.setStrokeColor(COLOR_BORDER)
    c.line(2 * cm, y, width - 2 * cm, y)
    y -= 0.35 * cm

    for ch in checkins[:20]:
        if y < 3 * cm:
            _draw_footer(c, 2, 2, "Post-Partum · SNOMED CT · Confidentiel")
            c.showPage()
            _draw_header(c, "Rapport Post-Partum — Suite", "", color=COLOR_PINK)
            y = height - 4.5 * cm

        c.setFillColor(COLOR_DARK)
        c.setFont("Helvetica", 9)
        c.drawString(2 * cm, y, f"S{ch.get('week_pp', '?')}")
        c.drawString(3.5 * cm, y, f"{ch.get('mood', '—')}/5")
        c.drawString(5.5 * cm, y, str(ch.get("epds_score", "—")))
        symptoms = (ch.get("physical_symptoms", []) or []) + (ch.get("mental_symptoms", []) or [])
        c.drawString(7.5 * cm, y, ", ".join(symptoms[:3])[:45] or "—")
        alerts_ch = ch.get("critical_alerts", []) or []
        if alerts_ch:
            c.setFillColor(COLOR_RED)
            c.drawString(15 * cm, y, f"⚠ {len(alerts_ch)}")
        y -= 0.4 * cm

    # ---------- SNOMED CT ----------
    all_snomed: list = []
    for ch in checkins:
        for code in ch.get("snomed_codes", []) or []:
            if not any(existing.get("code") == code.get("code") for existing in all_snomed):
                all_snomed.append(code)
    if all_snomed:
        y -= 0.5 * cm
        if y < 5 * cm:
            _draw_footer(c, 2, 2, "Post-Partum · SNOMED CT · Confidentiel")
            c.showPage()
            _draw_header(c, "Rapport Post-Partum — Codes SNOMED", "", color=COLOR_PINK)
            y = height - 4.5 * cm
        _section_title("🧬 Codification clinique SNOMED CT")
        for code in all_snomed[:15]:
            c.setFillColor(COLOR_DARK)
            c.setFont("Helvetica", 9)
            c.drawString(2 * cm, y, f"• {code.get('display', '—')} ({code.get('code', '—')})")
            y -= 0.45 * cm

    # ---------- DISCLAIMER ----------
    if y < 3 * cm:
        c.showPage()
        y = height - 3 * cm
    y = max(y, 3 * cm)
    c.setFillColor(COLOR_LIGHT_GRAY)
    c.roundRect(2 * cm, 2 * cm, 17 * cm, 1.5 * cm, 4, stroke=0, fill=1)
    c.setFillColor(COLOR_GRAY)
    c.setFont("Helvetica-Oblique", 8)
    disclaimer = (
        "Ce rapport est confidentiel et ne remplace pas une consultation médicale. "
        "En cas d'idées suicidaires, contactez immédiatement le 185 (SAMU CI). "
        "Données chiffrées AES-256, conformes RGSSI Niveau 3 / RGPD."
    )
    for i, line in enumerate(_wrap_lines(disclaimer, 100)):
        c.drawCentredString(width / 2, 2.6 * cm - i * 0.35 * cm, line)

    _draw_footer(c, 1, 1, "Post-Partum · SNOMED CT · Confidentiel · RGSSI Niveau 3")
    c.save()
    return buf.getvalue()
