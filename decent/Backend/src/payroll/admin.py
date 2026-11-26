from django.contrib import admin
from django.utils.html import format_html

from .models import (
    Salary, Attendance, Payslip,
    ESPSettings, ESPMatchingBracket, ESPEmployeeEnrollment,
    ESPContribution, ESPWithdrawal, SystemFeatureToggle,
)
from .leave_models import (
    LeaveSettings, LeaveSettingBracket, LeaveType, LeaveBalance,
    LeaveRequest, LeaveAdjustment, LeaveAccrual,
)
from .loan_models import (
    EmployeeLoan, LoanInstallment, LoanPayment,
)
from .general_request_models import EmployeeRequest


# ==============================================================================
# SALARY & ATTENDANCE & PAYSLIP
# ==============================================================================

@admin.register(Salary)
class SalaryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'gross_salary', 'currency', 'is_active', 'effective_from', 'effective_to')
    list_filter = ('is_active', 'currency')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee',)


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'year', 'month', 'total_work_days', 'presents', 'absents', 'lates', 'leaves')
    list_filter = ('year', 'month')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee',)


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('employee', 'year', 'month', 'gross_salary', 'total_deductions', 'net_pay', 'status_badge')
    list_filter = ('status', 'year', 'month')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee', 'salary', 'attendance')
    readonly_fields = ('net_pay', 'total_deductions', 'per_day_salary')

    def status_badge(self, obj):
        colors = {'draft': 'gray', 'final': 'blue', 'paid': 'green'}
        color = colors.get(obj.status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.status.upper())
    status_badge.short_description = 'Status'


# ==============================================================================
# ESP (EMPLOYEE SAVINGS PLAN)
# ==============================================================================

class ESPMatchingBracketInline(admin.TabularInline):
    model = ESPMatchingBracket
    extra = 1
    fields = ('min_tenure_years', 'max_tenure_years', 'matching_pct')


@admin.register(ESPSettings)
class ESPSettingsAdmin(admin.ModelAdmin):
    list_display = ('organization', 'implementation_date', 'employee_contribution_pct', 'is_active', 'created_at')
    list_filter = ('is_active', 'organization')
    search_fields = ('organization__name', 'organization__org_code')
    inlines = [ESPMatchingBracketInline]


@admin.register(ESPMatchingBracket)
class ESPMatchingBracketAdmin(admin.ModelAdmin):
    list_display = ('settings', 'min_tenure_years', 'max_tenure_years', 'matching_pct')
    list_filter = ('settings__organization',)


@admin.register(ESPEmployeeEnrollment)
class ESPEmployeeEnrollmentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'enrollment_date', 'esp_settings', 'is_active')
    list_filter = ('is_active', 'esp_settings__organization')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee',)


@admin.register(ESPContribution)
class ESPContributionAdmin(admin.ModelAdmin):
    list_display = (
        'employee', 'payroll_period_year', 'payroll_period_month',
        'gross_salary_used', 'basic_salary_used',
        'employee_contribution_amount', 'employer_matching_amount',
        'total_contribution', 'contribution_date'
    )
    list_filter = ('payroll_period_year', 'payroll_period_month', 'esp_settings__organization')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee', 'payslip', 'enrollment', 'esp_settings')
    readonly_fields = ('total_contribution',)


@admin.register(ESPWithdrawal)
class ESPWithdrawalAdmin(admin.ModelAdmin):
    list_display = ('employee', 'requested_amount', 'status_badge', 'requested_at', 'reviewed_by', 'disbursed_at')
    list_filter = ('status', 'requested_at')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')
    raw_id_fields = ('employee', 'enrollment', 'reviewed_by')

    def status_badge(self, obj):
        colors = {'pending': 'orange', 'approved': 'blue', 'disbursed': 'green', 'rejected': 'red'}
        color = colors.get(obj.status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.status.upper())
    status_badge.short_description = 'Status'


# ==============================================================================
# LEAVE MANAGEMENT & POLICY
# ==============================================================================

class LeaveSettingBracketInline(admin.TabularInline):
    model = LeaveSettingBracket
    extra = 1
    fields = ('order', 'leave_name', 'code', 'days_per_year', 'is_paid')


@admin.register(LeaveSettings)
class LeaveSettingsAdmin(admin.ModelAdmin):
    list_display = ('organization', 'implementation_date', 'is_active', 'created_at')
    list_filter = ('is_active', 'organization')
    search_fields = ('organization__name', 'organization__org_code')
    inlines = [LeaveSettingBracketInline]


@admin.register(LeaveSettingBracket)
class LeaveSettingBracketAdmin(admin.ModelAdmin):
    list_display = ('settings', 'order', 'leave_name', 'code', 'days_per_year', 'is_paid')
    list_filter = ('is_paid', 'settings__organization')
    search_fields = ('leave_name', 'code')


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'annual_entitlement', 'is_paid', 'accrual_frequency', 'accrual_days_per_period', 'requires_confirmation', 'is_active')
    list_filter = ('is_paid', 'is_active', 'accrual_frequency', 'requires_confirmation')
    search_fields = ('name', 'code')


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'year', 'accrued_days', 'consumed_days', 'adjusted_days', 'available_days_display')
    list_filter = ('year', 'leave_type')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee',)

    def available_days_display(self, obj):
        return obj.available_days
    available_days_display.short_description = 'Available Days'


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'start_date', 'end_date', 'total_days', 'status_badge', 'approved_by', 'is_override')
    list_filter = ('status', 'leave_type', 'is_override')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')
    raw_id_fields = ('employee', 'approved_by')

    def status_badge(self, obj):
        colors = {'pending': 'orange', 'approved': 'green', 'rejected': 'red', 'cancelled': 'gray'}
        color = colors.get(obj.status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.status.upper())
    status_badge.short_description = 'Status'


@admin.register(LeaveAdjustment)
class LeaveAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'adjustment_type', 'days', 'previous_balance', 'new_balance', 'adjusted_by', 'created_at')
    list_filter = ('adjustment_type', 'leave_type')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')
    raw_id_fields = ('employee', 'adjusted_by')


@admin.register(LeaveAccrual)
class LeaveAccrualAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'period_year', 'period_month', 'days_accrued', 'accrual_date')
    list_filter = ('period_year', 'period_month', 'leave_type')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee',)


# ==============================================================================
# LOANS & ADVANCES
# ==============================================================================

class LoanInstallmentInline(admin.TabularInline):
    model = LoanInstallment
    extra = 0
    fields = ('installment_number', 'due_year', 'due_month', 'installment_amount', 'paid_amount', 'status')
    readonly_fields = ('installment_number', 'due_year', 'due_month')


@admin.register(EmployeeLoan)
class EmployeeLoanAdmin(admin.ModelAdmin):
    list_display = ('employee', 'loan_amount', 'start_date', 'num_installments', 'monthly_installment', 'status_badge', 'total_paid_display', 'total_remaining_display')
    list_filter = ('status', 'start_date')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')
    raw_id_fields = ('employee', 'created_by')
    inlines = [LoanInstallmentInline]

    def status_badge(self, obj):
        colors = {'pending': 'orange', 'active': 'blue', 'completed': 'green', 'cancelled': 'red'}
        color = colors.get(obj.status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.status.upper())
    status_badge.short_description = 'Status'

    def total_paid_display(self, obj):
        return obj.total_paid
    total_paid_display.short_description = 'Total Paid'

    def total_remaining_display(self, obj):
        return obj.total_remaining
    total_remaining_display.short_description = 'Total Remaining'


@admin.register(LoanInstallment)
class LoanInstallmentAdmin(admin.ModelAdmin):
    list_display = ('loan', 'installment_number', 'due_year', 'due_month', 'due_date', 'installment_amount', 'paid_amount', 'status')
    list_filter = ('status', 'due_year', 'due_month')
    search_fields = ('loan__employee__employee_id', 'loan__employee__full_name')
    raw_id_fields = ('loan',)


@admin.register(LoanPayment)
class LoanPaymentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'loan', 'amount', 'payment_date', 'remaining_balance', 'payslip')
    list_filter = ('payment_date', 'payroll_period_year', 'payroll_period_month')
    search_fields = ('employee__employee_id', 'employee__full_name')
    raw_id_fields = ('employee', 'loan', 'installment', 'payslip')


# ==============================================================================
# GENERAL REQUESTS & SYSTEM FEATURE TOGGLES
# ==============================================================================

@admin.register(EmployeeRequest)
class EmployeeRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'category', 'subject', 'status_badge', 'submitted_at', 'reviewed_by', 'reviewed_at')
    list_filter = ('status', 'category', 'submitted_at')
    search_fields = ('employee__employee_id', 'employee__full_name', 'subject', 'message')
    raw_id_fields = ('employee', 'reviewed_by')

    def status_badge(self, obj):
        colors = {'pending': 'orange', 'approved': 'green', 'rejected': 'red'}
        color = colors.get(obj.status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, obj.status.upper())
    status_badge.short_description = 'Status'


@admin.register(SystemFeatureToggle)
class SystemFeatureToggleAdmin(admin.ModelAdmin):
    list_display = ('key', 'enabled', 'description', 'updated_at')
    list_filter = ('enabled',)
    search_fields = ('key', 'description')

