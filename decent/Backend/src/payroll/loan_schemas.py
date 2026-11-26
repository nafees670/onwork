"""
Pydantic/Django Ninja schemas for Loan Management.
"""
from typing import Optional, List
from ninja import Schema
from datetime import date, datetime
from decimal import Decimal


class LoanIn(Schema):
    employee_id: str
    loan_amount: Decimal
    start_date: date
    num_installments: int
    first_deduction_month: int
    first_deduction_year: int
    reason: Optional[str] = None
    notes: Optional[str] = None
    monthly_installment: Optional[Decimal] = None
    disbursement_receipt_url: Optional[str] = None


class LoanRequestIn(Schema):
    loan_amount: Decimal
    required_date: Optional[date] = None
    start_date: Optional[date] = None
    reason: Optional[str] = None


class OfferTermsIn(Schema):
    offered_amount: Decimal
    first_deduction_month: int
    first_deduction_year: int
    num_installments: int
    monthly_installment: Optional[Decimal] = None
    admin_notes: Optional[str] = None


class AcceptTermsIn(Schema):
    terms_accepted: bool = True


class SubmitDocumentsIn(Schema):
    cnic_front_url: Optional[str] = None
    cnic_back_url: Optional[str] = None
    guarantor_name: str
    guarantor_phone: str
    guarantor_cnic: str
    guarantor_cnic_front_url: Optional[str] = None
    guarantor_cnic_back_url: Optional[str] = None


class ConfirmDisbursementIn(Schema):
    disbursement_receipt_url: str
    satisfied_rating: bool = True


class DeferInstallmentIn(Schema):
    reason: str


class LoanUpdate(Schema):
    status: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class InstallmentOut(Schema):
    id: str
    installment_number: int
    due_month: int
    due_year: int
    due_date: date
    installment_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    status: str
    deferral_reason: Optional[str] = None
    deferred_by_name: Optional[str] = None


class LoanPaymentOut(Schema):
    id: str
    employee_id: str
    loan_id: str
    installment_id: str
    installment_number: int
    payslip_id: Optional[str] = None
    amount: Decimal
    payment_date: date
    payroll_period_month: Optional[int] = None
    payroll_period_year: Optional[int] = None
    remaining_balance: Decimal
    notes: Optional[str] = None


class LoanOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    loan_amount: Decimal
    required_date: Optional[date] = None
    start_date: Optional[date] = None
    num_installments: Optional[int] = None
    installment_frequency: str = "monthly"
    monthly_installment: Optional[Decimal] = None
    first_deduction_month: Optional[int] = None
    first_deduction_year: Optional[int] = None
    status: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    total_paid: Decimal
    total_remaining: Decimal
    paid_installments: int
    remaining_installments: int

    # Multi-Step Workflow Fields
    offered_amount: Optional[Decimal] = None
    admin_notes: Optional[str] = None
    terms_accepted: bool = False
    terms_accepted_at: Optional[datetime] = None
    cnic_front_url: Optional[str] = None
    cnic_back_url: Optional[str] = None
    guarantor_name: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_cnic: Optional[str] = None
    guarantor_cnic_front_url: Optional[str] = None
    guarantor_cnic_back_url: Optional[str] = None
    documents_submitted_at: Optional[datetime] = None
    disbursement_receipt_url: Optional[str] = None
    satisfied_rating: bool = True
    disbursed_at: Optional[datetime] = None

    installments: List[InstallmentOut] = []


class LoanSummaryOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    loan_amount: Decimal
    required_date: Optional[date] = None
    start_date: Optional[date] = None
    monthly_installment: Optional[Decimal] = None
    num_installments: Optional[int] = None
    first_deduction_month: Optional[int] = None
    first_deduction_year: Optional[int] = None
    status: str
    total_paid: Decimal
    total_remaining: Decimal
    offered_amount: Optional[Decimal] = None
    admin_notes: Optional[str] = None
    terms_accepted: bool = False
    cnic_front_url: Optional[str] = None
    guarantor_name: Optional[str] = None
    disbursement_receipt_url: Optional[str] = None
    satisfied_rating: bool = True
    reason: Optional[str] = None
    created_at: datetime


class LoanDashboardOut(Schema):
    total_active_loans: int
    total_outstanding: Decimal
    total_monthly_deductions: Decimal
    fully_paid_loans: int
    pending_installments: int
    overdue_installments: int


class InstallmentSchedulePreview(Schema):
    installment_number: int
    due_month: int
    due_year: int
    due_date: date
    installment_amount: Decimal


class LoanSchedulePreviewOut(Schema):
    loan_amount: Decimal
    num_installments: int
    monthly_installment: Decimal
    schedule: List[InstallmentSchedulePreview]

