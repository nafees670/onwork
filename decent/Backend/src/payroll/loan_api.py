"""
Loan Management API endpoints.

Full CRUD for loans, installment schedule, payment history, and dashboard.
"""
import os
import uuid
from typing import Optional, List
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from django.utils import timezone

from django.db import transaction
from django.db.models import Sum, Q, Count
from django.shortcuts import get_object_or_404
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

from ninja import Router, Schema, File
from ninja.files import UploadedFile
from ninja.errors import HttpError


from employees.models import Employee
from authentication.api import AuthBearer
from permissions.rbac import require_permission, has_permission
from payroll.models import is_feature_enabled

from payroll.loan_models import EmployeeLoan, LoanInstallment, LoanPayment

from payroll.loan_schemas import (
    LoanIn, LoanRequestIn, LoanUpdate, LoanOut, LoanSummaryOut,
    LoanDashboardOut, InstallmentOut, LoanPaymentOut,
    LoanSchedulePreviewOut, OfferTermsIn, AcceptTermsIn,
    SubmitDocumentsIn, ConfirmDisbursementIn, DeferInstallmentIn,
)
from payroll.loan_services import (
    generate_installment_schedule, calculate_loan_deduction_for_month,
    apply_loan_deductions, mark_overdue_installments,
)

loan_router = Router(tags=["loans"], auth=AuthBearer())


def _get_employee(employee_id: str) -> Employee:
    emp = Employee.objects.filter(employee_id=employee_id, is_deleted=False).first()
    if not emp:
        raise HttpError(404, f"Employee not found: {employee_id}")
    return emp


def _installment_out(inst: LoanInstallment) -> dict:
    return {
        'id': str(inst.id),
        'installment_number': inst.installment_number,
        'due_month': inst.due_month,
        'due_year': inst.due_year,
        'due_date': inst.due_date,
        'installment_amount': inst.installment_amount,
        'paid_amount': inst.paid_amount,
        'remaining_amount': inst.remaining_amount,
        'status': inst.status,
        'deferral_reason': inst.deferral_reason,
        'deferred_by_name': inst.deferred_by.full_name if inst.deferred_by else None,
    }


def _loan_out(loan: EmployeeLoan) -> dict:
    installments = loan.installments.filter(is_deleted=False).order_by('installment_number')
    return {
        'id': str(loan.id),
        'employee_id': loan.employee.employee_id,
        'employee_name': loan.employee.full_name,
        'loan_amount': loan.loan_amount,
        'required_date': loan.required_date,
        'start_date': loan.start_date,
        'num_installments': loan.num_installments,
        'installment_frequency': loan.installment_frequency,
        'monthly_installment': loan.monthly_installment,
        'first_deduction_month': loan.first_deduction_month,
        'first_deduction_year': loan.first_deduction_year,
        'status': loan.status,
        'reason': loan.reason,
        'notes': loan.notes,
        'created_by_name': loan.created_by.full_name if loan.created_by else None,
        'created_at': loan.created_at,
        'total_paid': loan.total_paid,
        'total_remaining': loan.total_remaining,
        'paid_installments': loan.paid_installments_count,
        'remaining_installments': loan.remaining_installments_count,

        # Multi-Step Workflow Fields
        'offered_amount': loan.offered_amount,
        'admin_notes': loan.admin_notes,
        'terms_accepted': loan.terms_accepted,
        'terms_accepted_at': loan.terms_accepted_at,
        'cnic_front_url': loan.cnic_front_url,
        'cnic_back_url': loan.cnic_back_url,
        'guarantor_name': loan.guarantor_name,
        'guarantor_phone': loan.guarantor_phone,
        'guarantor_cnic': loan.guarantor_cnic,
        'guarantor_cnic_front_url': loan.guarantor_cnic_front_url,
        'guarantor_cnic_back_url': loan.guarantor_cnic_back_url,
        'documents_submitted_at': loan.documents_submitted_at,
        'disbursement_receipt_url': loan.disbursement_receipt_url,
        'satisfied_rating': loan.satisfied_rating,
        'disbursed_at': loan.disbursed_at,

        'installments': [_installment_out(i) for i in installments],
    }


def _loan_summary_out(loan: EmployeeLoan) -> dict:
    return {
        'id': str(loan.id),
        'employee_id': loan.employee.employee_id,
        'employee_name': loan.employee.full_name,
        'loan_amount': loan.loan_amount,
        'required_date': loan.required_date,
        'start_date': loan.start_date,
        'monthly_installment': loan.monthly_installment,
        'num_installments': loan.num_installments,
        'first_deduction_month': loan.first_deduction_month,
        'first_deduction_year': loan.first_deduction_year,
        'status': loan.status,
        'total_paid': loan.total_paid,
        'total_remaining': loan.total_remaining,
        'offered_amount': loan.offered_amount,
        'admin_notes': loan.admin_notes,
        'terms_accepted': loan.terms_accepted,
        'cnic_front_url': loan.cnic_front_url,
        'guarantor_name': loan.guarantor_name,
        'disbursement_receipt_url': loan.disbursement_receipt_url,
        'satisfied_rating': loan.satisfied_rating,
        'reason': loan.reason,
        'created_at': loan.created_at,
    }


def _payment_out(p: LoanPayment) -> dict:
    return {
        'id': str(p.id),
        'employee_id': p.employee.employee_id,
        'loan_id': str(p.loan_id),
        'installment_id': str(p.installment_id),
        'installment_number': p.installment.installment_number,
        'payslip_id': str(p.payslip_id) if p.payslip_id else None,
        'amount': p.amount,
        'payment_date': p.payment_date,
        'payroll_period_month': p.payroll_period_month,
        'payroll_period_year': p.payroll_period_year,
        'remaining_balance': p.remaining_balance,
        'notes': p.notes,
    }


# =========================================================================
# FILE UPLOAD ENDPOINT
# =========================================================================
@loan_router.post("/loans/upload-document")
def upload_loan_document(request, file: UploadedFile = File(...)):
    """Upload CNIC scan, guarantor document, or disbursement receipt."""
    ext = os.path.splitext(file.name)[1].lower()
    allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf']
    if ext not in allowed:
        raise HttpError(400, "Only images (JPG, PNG, WEBP) and PDF files are supported")
    if file.size > 10 * 1024 * 1024:
        raise HttpError(400, "File size must be under 10 MB")

    unique_name = f"loan_docs/{uuid.uuid4().hex}{ext}"
    saved_path = default_storage.save(unique_name, ContentFile(file.read()))
    file_url = f"/media/{saved_path}"
    return {"url": file_url}


# =========================================================================
# EMPLOYEE REQUEST & MULTI-STEP WORKFLOW ENDPOINTS
# =========================================================================
@loan_router.get("/loans/my-loans", response=List[LoanSummaryOut])
def my_loans(request):
    """List current employee's loans."""
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")
    qs = EmployeeLoan.objects.select_related('employee').filter(
        employee__employee_id=employee_id, is_deleted=False
    ).order_by('-created_at')
    return [_loan_summary_out(l) for l in qs]


@loan_router.post("/loans/my-loans", response=LoanSummaryOut)
def request_loan(request, payload: LoanRequestIn):
    """Step 1: Employee submits initial simplified loan request."""
    if not is_feature_enabled('allow_loan_requests', False):
        raise HttpError(400, "Loan requests are currently disabled by administration.")
    employee_id = getattr(request.auth, 'employee_id', None)
    if not employee_id:
        raise HttpError(404, "No employee record for this account")

    emp = _get_employee(employee_id)

    if payload.loan_amount <= 0:
        raise HttpError(422, "Loan amount must be positive")

    req_date = payload.required_date or payload.start_date or date.today()

    with transaction.atomic():
        loan = EmployeeLoan.objects.create(
            employee=emp,
            loan_amount=payload.loan_amount,
            required_date=req_date,
            status='pending',
            reason=payload.reason,
            created_by=request.auth if hasattr(request.auth, 'employee_id') else None,
        )

    return _loan_summary_out(loan)


@loan_router.post("/loans/{loan_id}/offer-terms", response=LoanOut)
@require_permission("payroll.loan.edit")
def offer_loan_terms(request, loan_id: str, payload: OfferTermsIn):
    """Step 2: Admin reviews pending request and proposes counter-offer / repayment terms."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    if loan.status != 'pending':
        raise HttpError(400, f"Cannot offer terms for loan in status '{loan.status}'. Must be 'pending'.")

    if payload.offered_amount <= 0:
        raise HttpError(422, "Offered amount must be positive")
    if payload.num_installments < 1:
        raise HttpError(422, "Must have at least 1 installment")
    if not (1 <= payload.first_deduction_month <= 12):
        raise HttpError(422, "First deduction month must be 1-12")

    mi = payload.monthly_installment or (
        payload.offered_amount / Decimal(payload.num_installments)
    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    loan.offered_amount = payload.offered_amount
    loan.first_deduction_month = payload.first_deduction_month
    loan.first_deduction_year = payload.first_deduction_year
    loan.num_installments = payload.num_installments
    loan.monthly_installment = mi
    loan.admin_notes = payload.admin_notes
    loan.status = 'offered'
    loan.save()

    return _loan_out(loan)


@loan_router.post("/loans/{loan_id}/accept-terms", response=LoanOut)
def accept_loan_terms(request, loan_id: str, payload: AcceptTermsIn):
    """Step 3: Employee reviews offer and accepts agreement terms."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    emp_id = getattr(request.auth, 'employee_id', None)
    if not emp_id or loan.employee.employee_id != emp_id:
        raise HttpError(403, "Only the borrower can accept loan terms")

    if loan.status != 'offered':
        raise HttpError(400, f"Cannot accept terms for loan in status '{loan.status}'. Must be 'offered'.")

    if not payload.terms_accepted:
        raise HttpError(422, "You must accept the terms and conditions")

    loan.terms_accepted = True
    loan.terms_accepted_at = timezone.now()
    loan.status = 'agreed'
    loan.save()

    return _loan_out(loan)


@loan_router.post("/loans/{loan_id}/submit-documents", response=LoanOut)
def submit_loan_documents(request, loan_id: str, payload: SubmitDocumentsIn):
    """Step 4: Employee uploads CNIC (Front/Back) and Guarantor Details."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    emp_id = getattr(request.auth, 'employee_id', None)
    if not emp_id or loan.employee.employee_id != emp_id:
        raise HttpError(403, "Only the borrower can submit loan documents")

    if loan.status not in ['agreed', 'documents_submitted']:
        raise HttpError(400, f"Cannot submit documents for loan in status '{loan.status}'. Must be 'agreed'.")

    if not payload.guarantor_name or not payload.guarantor_phone or not payload.guarantor_cnic:
        raise HttpError(422, "Guarantor Name, Phone, and CNIC are required")

    loan.cnic_front_url = payload.cnic_front_url
    loan.cnic_back_url = payload.cnic_back_url
    loan.guarantor_name = payload.guarantor_name
    loan.guarantor_phone = payload.guarantor_phone
    loan.guarantor_cnic = payload.guarantor_cnic
    loan.guarantor_cnic_front_url = payload.guarantor_cnic_front_url
    loan.guarantor_cnic_back_url = payload.guarantor_cnic_back_url
    loan.documents_submitted_at = timezone.now()
    loan.status = 'documents_submitted'
    loan.save()

    return _loan_out(loan)


@loan_router.post("/loans/{loan_id}/final-approve", response=LoanOut)
@require_permission("payroll.loan.edit")
def final_approve_loan(request, loan_id: str):
    """Step 5: Admin reviews uploaded documents and gives Final Approval."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    if loan.status != 'documents_submitted':
        raise HttpError(400, f"Cannot approve loan in status '{loan.status}'. Must be 'documents_submitted'.")

    loan.status = 'approved'
    loan.save()

    return _loan_out(loan)


@loan_router.post("/loans/{loan_id}/confirm-disbursement", response=LoanOut)
def confirm_disbursement(request, loan_id: str, payload: ConfirmDisbursementIn):
    """Step 6: Employee confirms receipt ('You Got Loan?'), uploads proof slip, and activates schedule."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    emp_id = getattr(request.auth, 'employee_id', None)
    if not emp_id or loan.employee.employee_id != emp_id:
        raise HttpError(403, "Only the borrower can confirm disbursement")

    if loan.status != 'approved':
        raise HttpError(400, f"Cannot confirm disbursement for loan in status '{loan.status}'. Must be 'approved'.")

    if not payload.disbursement_receipt_url:
        raise HttpError(422, "Disbursement receipt slip is required")

    with transaction.atomic():
        loan.disbursement_receipt_url = payload.disbursement_receipt_url
        loan.satisfied_rating = payload.satisfied_rating
        loan.disbursed_at = timezone.now()
        loan.status = 'active'
        if loan.offered_amount and loan.offered_amount > 0:
            loan.loan_amount = loan.offered_amount
        if not loan.start_date:
            loan.start_date = date.today()
        loan.save()

        # Generate installment schedule
        loan.installments.all().delete()
        schedule = generate_installment_schedule(
            loan.loan_amount, loan.num_installments,
            loan.first_deduction_month, loan.first_deduction_year,
            loan.monthly_installment,
        )
        for item in schedule:
            LoanInstallment.objects.create(
                loan=loan,
                installment_number=item['installment_number'],
                due_month=item['due_month'],
                due_year=item['due_year'],
                due_date=item['due_date'],
                installment_amount=item['installment_amount'],
            )

    return _loan_out(loan)


@loan_router.get("/loans", response=List[LoanSummaryOut])
@require_permission("payroll.loan.view")
def list_loans(request, employee_id: Optional[str] = None,
               status: Optional[str] = None,
               department: Optional[str] = None,
               branch: Optional[str] = None):
    qs = EmployeeLoan.objects.select_related('employee').filter(is_deleted=False)
    if employee_id:
        qs = qs.filter(employee__employee_id=employee_id)
    if status:
        qs = qs.filter(status=status)
    if department:
        qs = qs.filter(
            employee__assignments__designation__department__dept_name=department,
            employee__assignments__is_primary=True,
        )
    if branch:
        qs = qs.filter(
            employee__assignments__designation__department__branch__branch_name=branch,
            employee__assignments__is_primary=True,
        )
    return [_loan_summary_out(l) for l in qs]


@loan_router.get("/loans/dashboard", response=LoanDashboardOut)
@require_permission("payroll.loan.view")
def loan_dashboard(request):
    active_loans = EmployeeLoan.objects.filter(status='active', is_deleted=False)
    completed_loans = EmployeeLoan.objects.filter(status='completed', is_deleted=False)

    total_outstanding = Decimal('0')
    total_monthly = Decimal('0')
    for loan in active_loans:
        total_outstanding += loan.total_remaining
        total_monthly += loan.monthly_installment

    today = date.today()
    pending = LoanInstallment.objects.filter(
        status__in=['pending', 'overdue'],
        is_deleted=False,
        loan__status='active',
    ).count()

    overdue = LoanInstallment.objects.filter(
        status='overdue',
        is_deleted=False,
    ).count()

    return {
        'total_active_loans': active_loans.count(),
        'total_outstanding': total_outstanding,
        'total_monthly_deductions': total_monthly,
        'fully_paid_loans': completed_loans.count(),
        'pending_installments': pending,
        'overdue_installments': overdue,
    }


@loan_router.get("/loans/preview-schedule", response=LoanSchedulePreviewOut)
@require_permission("payroll.loan.create")
def preview_loan_schedule(request, loan_amount: Decimal, num_installments: int,
                          first_deduction_month: int, first_deduction_year: int,
                          monthly_installment: Optional[Decimal] = None):
    if loan_amount <= 0:
        raise HttpError(422, "Loan amount must be positive")
    if num_installments < 1:
        raise HttpError(422, "Must have at least 1 installment")
    if not (1 <= first_deduction_month <= 12):
        raise HttpError(422, "Month must be 1-12")

    if monthly_installment:
        mi = monthly_installment
    else:
        mi = (loan_amount / Decimal(num_installments)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    schedule = generate_installment_schedule(
        loan_amount, num_installments, first_deduction_month,
        first_deduction_year, monthly_installment
    )

    return {
        'loan_amount': loan_amount,
        'num_installments': num_installments,
        'monthly_installment': schedule[0]['installment_amount'] if schedule else mi,
        'schedule': schedule,
    }


@loan_router.post("/loans", response=LoanOut)
@require_permission("payroll.loan.create")
def create_loan(request, payload: LoanIn):
    """
    Direct Admin Loan Entry (e.g. Existing or Historical Loans).
    Admin can always add a loan regardless of feature toggles.
    Creates an ACTIVE loan immediately with full installment schedule.
    """
    emp = _get_employee(payload.employee_id)

    if payload.loan_amount <= 0:
        raise HttpError(422, "Loan amount must be positive")
    if payload.num_installments < 1:
        raise HttpError(422, "Must have at least 1 installment")
    if not (1 <= payload.first_deduction_month <= 12):
        raise HttpError(422, "First deduction month must be 1-12")

    mi = payload.monthly_installment or (
        payload.loan_amount / Decimal(payload.num_installments)
    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    created_by = request.auth if hasattr(request.auth, 'employee_id') else None

    with transaction.atomic():
        loan = EmployeeLoan.objects.create(
            employee=emp,
            loan_amount=payload.loan_amount,
            start_date=payload.start_date,
            required_date=payload.start_date,
            num_installments=payload.num_installments,
            monthly_installment=mi,
            first_deduction_month=payload.first_deduction_month,
            first_deduction_year=payload.first_deduction_year,
            status='active',
            reason=payload.reason,
            notes=payload.notes,
            disbursement_receipt_url=payload.disbursement_receipt_url,
            disbursed_at=timezone.now(),
            created_by=created_by,
        )

        schedule = generate_installment_schedule(
            loan.loan_amount, loan.num_installments,
            loan.first_deduction_month, loan.first_deduction_year,
            loan.monthly_installment,
        )

        for item in schedule:
            LoanInstallment.objects.create(
                loan=loan,
                installment_number=item['installment_number'],
                due_month=item['due_month'],
                due_year=item['due_year'],
                due_date=item['due_date'],
                installment_amount=item['installment_amount'],
            )

    return _loan_out(loan)


@loan_router.get("/loans/{loan_id}", response=LoanOut)
def get_loan(request, loan_id: str):
    """Get single loan details (accessible by Admin or borrower)."""
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    emp_id = getattr(request.auth, 'employee_id', None)
    is_borrower = emp_id and (loan.employee.employee_id == emp_id)
    if not (is_borrower or has_permission(request.auth, "payroll.loan.view")):
        raise HttpError(403, "Permission denied")
    return _loan_out(loan)


@loan_router.put("/loans/{loan_id}", response=LoanOut)
@require_permission("payroll.loan.edit")
def update_loan(request, loan_id: str, payload: LoanUpdate):
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    data = payload.dict(exclude_unset=True)
    if 'status' in data:
        valid = [c[0] for c in EmployeeLoan.STATUS_CHOICES]
        if data['status'] not in valid:
            raise HttpError(422, f"status must be one of {valid}")
    for field, value in data.items():
        setattr(loan, field, value)
    loan.save()
    return _loan_out(loan)


@loan_router.delete("/loans/{loan_id}")
@require_permission("payroll.loan.delete")
def delete_loan(request, loan_id: str):
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    loan.soft_delete(
        deleted_by=request.auth.id if hasattr(request.auth, 'id') else None,
        reason='Deleted via API',
    )
    return {'success': True, 'message': 'Loan deleted'}


@loan_router.get("/loans/{loan_id}/payments", response=List[LoanPaymentOut])
@require_permission("payroll.loan.view")
def list_loan_payments(request, loan_id: str):
    loan = get_object_or_404(EmployeeLoan, id=loan_id, is_deleted=False)
    payments = LoanPayment.objects.filter(
        loan=loan, is_deleted=False
    ).select_related('employee', 'installment')
    return [_payment_out(p) for p in payments]


@loan_router.post("/loans/mark-overdue")
@require_permission("payroll.loan.edit")
def mark_overdue(request, month: int, year: int):
    mark_overdue_installments(month, year)
    return {'success': True, 'message': f'Overdue installments marked for {year}/{month}'}


class ManualPaymentIn(Schema):
    amount: Optional[Decimal] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = "Manual payment / prior payslip deduction"


@loan_router.post("/loans/installments/{installment_id}/pay", response=InstallmentOut)
@require_permission("payroll.loan.edit")
def record_manual_installment_payment(request, installment_id: str, payload: Optional[ManualPaymentIn] = None):
    inst = get_object_or_404(LoanInstallment, id=installment_id, is_deleted=False)
    loan = inst.loan
    pay_amount = (payload.amount if payload and payload.amount else None) or inst.remaining_amount
    pay_date = (payload.payment_date if payload and payload.payment_date else None) or date.today()
    notes = (payload.notes if payload and payload.notes else None) or "Manual payment / prior payslip deduction"

    with transaction.atomic():
        inst.paid_amount += pay_amount
        if inst.paid_amount >= inst.installment_amount:
            inst.status = 'paid'
        else:
            inst.status = 'partially_paid'
        inst.save()

        all_paid = loan.installments.filter(is_deleted=False).exclude(status__in=['paid', 'waived']).count() == 0
        if all_paid:
            loan.status = 'completed'
            loan.save(update_fields=['status', 'updated_at'])

        LoanPayment.objects.create(
            employee=loan.employee,
            loan=loan,
            installment=inst,
            amount=pay_amount,
            payment_date=pay_date,
            remaining_balance=loan.total_remaining,
            notes=notes,
        )

    return _installment_out(inst)


@loan_router.post("/loans/installments/{installment_id}/defer", response=InstallmentOut)
@require_permission("payroll.loan.edit")
def defer_loan_installment(request, installment_id: str, payload: DeferInstallmentIn):
    """
    Admin defers/skips an installment with a mandatory reason.
    Deferred installment will not be deducted in payroll for that month.
    """
    inst = get_object_or_404(LoanInstallment, id=installment_id, is_deleted=False)
    if inst.status in ['paid', 'waived']:
        raise HttpError(400, f"Cannot defer an installment that is already {inst.status}")

    inst.status = 'deferred'
    inst.deferral_reason = payload.reason
    inst.deferred_by = request.auth if hasattr(request.auth, 'employee_id') else None
    inst.save()

    return _installment_out(inst)
