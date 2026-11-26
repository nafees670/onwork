"""
Payslip PDF generator — matches the org's HTML salary-slip letterhead:
  Header (logo | brand + campus | title + period + Confidential)
  Info grid (Employee/ID/CNIC | Title/Dept/Days Worked)
  Side-by-side Earnings / Deductions tables
  Attendance Deduction strip
  Summary (Gross -> Attendance -> Deductions -> Taxable -> Net Pay)
  Footer (disclaimer + signature line)

Uses reportlab (see requirements.txt).
"""
import os
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Image, Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "logo.png")

# -- Palette (matches CSS vars in salary-slip.html) --
INK        = colors.HexColor("#1c2140")
INK_SOFT   = colors.HexColor("#4a4f6e")
MUTED      = colors.HexColor("#7a7e96")
LINE       = colors.HexColor("#e3e2ec")
ACCENT     = colors.HexColor("#4b3f72")
DEDUCT     = colors.HexColor("#8a4a3d")
DEDUCT_TINT = colors.HexColor("#f8efec")
WHITE      = colors.white


# -- Helpers --
def _money(v) -> str:
    if v is None:
        return "-"
    try:
        d = Decimal(str(v))
    except Exception:
        return str(v)
    return f"{d:,.0f}"


def _money2(v) -> str:
    if v is None:
        return "-"
    try:
        d = Decimal(str(v))
    except Exception:
        return str(v)
    return f"{d:,.2f}"


def _p(text, size=9, bold=False, align=TA_LEFT, color=INK):
    fn = "Helvetica-Bold" if bold else "Helvetica"
    style = ParagraphStyle(
        "_c", fontName=fn, fontSize=size, leading=size + 3,
        alignment=align, textColor=color,
    )
    t = str(text) if text not in (None, "") else "&nbsp;"
    return Paragraph(t, style)


def _kv(label, value):
    v = value if value not in (None, "") else "-"
    return _p(f"<font color='#7a7e96'>{label}</font>:  {v}", size=8.5)


def _kv_right(label, value):
    v = value if value not in (None, "") else "-"
    return _p(f"<font color='#7a7e96'>{label}</font>:  {v}", size=8.5, align=TA_RIGHT)


def _heading(text, size=10, align=TA_LEFT, color=INK_SOFT):
    return _p(f"<b>{text}</b>", size=size, align=align, color=color)


# -- Main builder --
def make_payslip_pdf(
    employee_name: str,
    employee_id: str,
    month: str,
    year: int,
    data: dict,
    employee_meta: dict = None,
) -> bytes:
    meta = employee_meta or {}
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
    )
    W = A4[0] - 36 * mm

    story = []

    # -- 1. HEADER: logo | brand + campus | Salary Slip + period + Confidential --
    if os.path.exists(LOGO_PATH):
        logo_cell = Image(LOGO_PATH, width=16 * mm, height=16 * mm)
    else:
        logo_cell = _p("IAK", size=14, bold=True, align=TA_CENTER, color=ACCENT)

    campus_text = meta.get("campus") or "Head Office"
    brand_left = [
        _p("<b>Idara Al-Khair</b>", size=12, color=INK),
        _p(campus_text, size=8, color=MUTED),
    ]

    right_inner = [
        _p("Salary Slip", size=14, bold=True, align=TA_RIGHT, color=INK),
        _p(f"{month} {year}", size=9, align=TA_RIGHT, color=INK_SOFT),
        _p("Confidential", size=7.5, align=TA_RIGHT, color=MUTED),
    ]

    header_tbl = Table(
        [[logo_cell, brand_left, right_inner]],
        colWidths=[W * 0.12, W * 0.42, W * 0.46],
        rowHeights=[22 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (0, 0), (0, 0),  "CENTER"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW",    (0, 0), (-1, -1), 2, INK),
    ]))
    story.append(header_tbl)

    # -- 2. EMPLOYEE INFO GRID --
    days_w = meta.get("days_worked", "-")
    month_d = meta.get("month_days", "-")
    info_rows = [
        [_kv("Employee", employee_name),
         _kv("Title", meta.get("title"))],
        [_kv("Employee ID", employee_id),
         _kv("Department", meta.get("department"))],
        [_kv("CNIC", meta.get("cnic")),
         _kv("Days Worked", f"{days_w} / {month_d}")],
    ]
    info_tbl = Table(info_rows, colWidths=[W * 0.5, W * 0.5])
    info_tbl.setStyle(TableStyle([
        ("BOX",          (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(Spacer(1, 8))
    story.append(info_tbl)

    # -- 3. EARNINGS / DEDUCTIONS side-by-side --
    # Earnings column
    earn_items = [
        (_p("<b>EARNINGS</b>", size=10, align=TA_CENTER, color=INK_SOFT),),
        (_p("Basic Salary"), _p("<font color='#7a7e96' size='7'>50% of Gross</font>"), _p(_money(data.get("basic_salary")), align=TA_RIGHT)),
        (_p("House Rent Allowance"), _p("<font color='#7a7e96' size='7'>40% of Basic</font>"), _p(_money(data.get("hra")), align=TA_RIGHT)),
        (_p("Conveyance Allowance"), _p("<font color='#7a7e96' size='7'>30% of Basic</font>"), _p(_money(data.get("conveyance")), align=TA_RIGHT)),
        (_p("Utility"), _p("<font color='#7a7e96' size='7'>20% of Basic</font>"), _p(_money(data.get("utility")), align=TA_RIGHT)),
        (_p("Medical"), _p("<font color='#7a7e96' size='7'>10% of Basic</font>"), _p(_money(data.get("medical")), align=TA_RIGHT)),
        (_p("Qualification Allowance"), _p(""), _p("-", align=TA_RIGHT)),
        (_p("<b>Gross Earnings</b>", size=9), _p(""), _p(f"<b>{_money(data.get('gross_salary'))}</b>", align=TA_RIGHT)),
    ]

    ded_items = [
        (_p("<b>DEDUCTIONS</b>", size=10, align=TA_CENTER, color=INK_SOFT),),
        (_p("Income Tax"), _p("<font color='#7a7e96' size='7'>FY 2026-27</font>"), _p(_money(data.get("income_tax")), align=TA_RIGHT, color=DEDUCT)),
        (_p("ESP"), _p("<font color='#7a7e96' size='7'>8.33% of Basic</font>"), _p(_money(data.get("esp")), align=TA_RIGHT, color=DEDUCT)),
        (_p("Absent Deduction"),
         _p(f"<font color='#7a7e96' size='7'>{_money(data.get('absent_days_deducted'))} day(s)</font>"),
         _p(_money(data.get("absent_deduction")), align=TA_RIGHT, color=DEDUCT)),
        (_p("Loan Deduction"), _p(""), _p(_money(data.get("loan_deduction")), align=TA_RIGHT, color=DEDUCT)),
        (_p("Unpaid Leave Deduction"), _p(""), _p(_money(data.get("unpaid_leave_deduction")), align=TA_RIGHT, color=DEDUCT)),
        (_p(""), _p(""), _p("")),
        (_p("<b>Total Deductions</b>", size=9), _p(""), _p(f"<b>{_money(data.get('total_deductions'))}</b>", align=TA_RIGHT, color=DEDUCT)),
    ]

    # Pad both columns to same length
    max_len = max(len(earn_items), len(ded_items))
    while len(earn_items) < max_len:
        earn_items.append((_p(""), _p(""), _p("")))
    while len(ded_items) < max_len:
        ded_items.append((_p(""), _p(""), _p("")))

    combined_rows = []
    for i in range(max_len):
        combined_rows.append(list(earn_items[i]) + list(ded_items[i]))

    cw = W / 6
    earn_ded_tbl = Table(combined_rows, colWidths=[cw, cw, cw, cw, cw, cw])
    earn_ded_style = [
        ("BOX",          (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID",    (0, 0), (-1, -1), 0.3, colors.HexColor("#e8e8e8")),
        ("LINEAFTER",    (2, 0), (2, -1), 0.8, LINE),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        # Header row span
        ("SPAN",         (0, 0), (2, 0)),
        ("SPAN",         (3, 0), (5, 0)),
        ("BACKGROUND",   (0, 0), (2, 0), colors.HexColor("#f5f5f8")),
        ("BACKGROUND",   (3, 0), (5, 0), colors.HexColor("#f5f5f8")),
        # Gross subtotal row
        ("LINEABOVE",    (0, -1), (-1, -1), 1, INK),
        ("BACKGROUND",   (0, -1), (2, -1), colors.HexColor("#f5f5f8")),
        ("BACKGROUND",   (3, -1), (5, -1), colors.HexColor("#f5f5f8")),
    ]
    earn_ded_tbl.setStyle(TableStyle(earn_ded_style))
    story.append(Spacer(1, 8))
    story.append(earn_ded_tbl)

    # -- 4. ATTENDANCE DEDUCTION STRIP --
    absent_days = _money(data.get("absent_days_deducted"))
    per_day = _money(data.get("per_day_salary"))
    absent_ded = data.get("absent_deduction")

    if absent_ded and Decimal(str(absent_ded)) > 0:
        att_left = [
            _p("<b>Attendance Deduction</b>", size=10, color=INK),
            _p(f"{absent_days} absent day(s) x Rs {per_day} / day", size=8, color=INK_SOFT),
        ]
        att_right = _p(f"- {_money(absent_ded)}", size=11, bold=True, align=TA_RIGHT, color=DEDUCT)
        att_tbl = Table([[att_left, att_right]], colWidths=[W * 0.7, W * 0.3])
        att_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), DEDUCT_TINT),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ]))
        story.append(Spacer(1, 8))
        story.append(att_tbl)

    # -- 5. SUMMARY --
    taxable = data.get("taxable_income", data.get("gross_salary"))
    gross = data.get("gross_salary")
    net = data.get("net_pay")
    total_ded = data.get("total_deductions")

    summary_rows = [
        [_p("Gross Earnings", size=9), _p(f"Rs {_money(gross)}", size=9, align=TA_RIGHT)],
    ]
    if absent_ded and Decimal(str(absent_ded)) > 0:
        summary_rows.append([
            _p("Attendance Deduction", size=9),
            _p(f"- {_money(absent_ded)}", size=9, align=TA_RIGHT, color=DEDUCT),
        ])
    summary_rows.append([
        _p("Total Deductions (Tax, ESP, Loan, Leave)", size=9),
        _p(f"- {_money(total_ded)}", size=9, align=TA_RIGHT, color=DEDUCT),
    ])
    summary_rows.append([
        _p("Taxable Salary", size=9),
        _p(f"Rs {_money(taxable)}", size=9, align=TA_RIGHT),
    ])

    sum_tbl = Table(summary_rows, colWidths=[W * 0.65, W * 0.35])
    sum_style = [
        ("BOX",          (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID",    (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ("LEFTPADDING",  (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]
    sum_tbl.setStyle(TableStyle(sum_style))
    story.append(Spacer(1, 8))
    story.append(sum_tbl)

    # -- 6. NET PAY (purple bar) --
    net_left = [
        _p("<b>Net Pay</b>", size=12, color=WHITE),
        _p("Amount paid by bank transfer", size=7.5, color=colors.HexColor("#d4cce9")),
    ]
    net_right = _p(f"Rs {_money(net)}", size=16, bold=True, align=TA_RIGHT, color=WHITE)
    net_tbl = Table([[net_left, net_right]], colWidths=[W * 0.55, W * 0.45])
    net_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), ACCENT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
    ]))
    story.append(Spacer(1, 4))
    story.append(net_tbl)

    # -- 7. FOOTER --
    story.append(Spacer(1, 14))
    footer_note = _p(
        "This is a system-generated salary slip and does not require a signature. "
        "For any discrepancy, contact HR within 7 days of receipt.",
        size=8, color=MUTED,
    )
    story.append(footer_note)

    doc.build(story)
    return buf.getvalue()
