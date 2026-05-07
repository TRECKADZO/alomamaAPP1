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
