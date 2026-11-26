"""
Pydantic/Django Ninja schemas for Leave Management.
"""
from typing import Optional, List
from ninja import Schema
from datetime import date, datetime
from decimal import Decimal


class LeaveTypeOut(Schema):
    id: str
    name: str
    code: str
    annual_entitlement: int
    accrual_frequency: str
    accrual_days_per_period: Decimal
    accrual_timing: str
    requires_confirmation: bool
    is_active: bool
    is_paid: bool = True


class LeaveBalanceOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    leave_type_id: str
    leave_type_code: str
    leave_type_name: str
    accrued_days: Decimal
    consumed_days: Decimal
    adjusted_days: Decimal
    available_days: Decimal
    year: int


class LeaveRequestIn(Schema):
    employee_id: str
    leave_type_code: str
    start_date: date
    end_date: date
    total_days: int
    reason: Optional[str] = None
    is_override: bool = False


class LeaveRequestUpdate(Schema):
    status: Optional[str] = None
    rejection_reason: Optional[str] = None
    leave_type_code: Optional[str] = None


class LeaveRequestOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    leave_type_id: str
    leave_type_code: str
    leave_type_name: str
    start_date: date
    end_date: date
    total_days: int
    reason: Optional[str] = None
    status: str
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    is_override: bool
    created_at: datetime


class LeaveAdjustmentIn(Schema):
    employee_id: str
    leave_type_code: str
    adjustment_type: str
    days: Decimal
    reason: str


class LeaveAdjustmentOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    leave_type_code: str
    leave_type_name: str
    adjustment_type: str
    days: Decimal
    previous_balance: Decimal
    new_balance: Decimal
    reason: str
    adjusted_by_name: Optional[str] = None
    created_at: datetime


class LeaveAccrualOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    leave_type_code: str
    leave_type_name: str
    accrual_date: date
    days_accrued: Decimal
    period_month: int
    period_year: int


class LeaveBalanceSummaryOut(Schema):
    employee_id: str
    employee_name: str
    annual_accrued: Decimal
    annual_consumed: Decimal
    annual_available: Decimal
    annual_eligible: bool
    casual_accrued: Decimal
    casual_consumed: Decimal
    casual_available: Decimal
    sick_accrued: Decimal
    sick_consumed: Decimal
    sick_available: Decimal


class MyLeaveBalanceOut(Schema):
    leave_type: str
    leave_type_code: str
    accrued: Decimal
    consumed: Decimal
    adjusted: Decimal
    available: Decimal
    eligible: bool
    eligibility_note: Optional[str] = None


class LeaveBracketIn(Schema):
    id: Optional[str] = None
    leave_name: str
    code: Optional[str] = None
    days_per_year: Decimal
    is_paid: bool = True
    order: Optional[int] = 0


class LeaveBracketOut(Schema):
    id: Optional[str] = None
    leave_name: str
    code: str
    days_per_year: Decimal
    is_paid: bool
    order: int


class LeaveSettingsIn(Schema):
    implementation_date: date
    is_active: bool = True
    notes: Optional[str] = None
    brackets: List[LeaveBracketIn]


class LeaveSettingsOut(Schema):
    id: str
    organization_id: str
    implementation_date: date
    is_active: bool
    notes: Optional[str] = None
    brackets: List[LeaveBracketOut]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
