"""
URL configuration for core project.
"""
from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from ninja import NinjaAPI
from authentication.api import router as auth_router
from permissions.api import router as permissions_router
from employees.api import router as employees_router
from audit.api import router as audit_router
from permissions.rbac_api import router as rbac_router
from payroll.api import router as payroll_router
from payroll.loan_api import loan_router
from payroll.leave_api import leave_router
from payroll.general_request_api import general_request_router
from core.dashboard_api import dashboard_router
from hr_policy.api import router as hr_policy_router

# Initialize Ninja API
api = NinjaAPI(
    title="Auth Service API",
    version="1.0.0",
    description="Unified Authentication Service for ERP System"
)

# Register routers
api.add_router("/auth", auth_router)
api.add_router("/permissions", permissions_router)
api.add_router("/employees", employees_router)  # Employees at /api/employees
api.add_router("/audit", audit_router)          # Audit logs at /api/audit
api.add_router("/permissions/rbac", rbac_router)  # RBAC management at /api/permissions/rbac
api.add_router("/payroll", payroll_router)      # Payroll at /api/payroll
api.add_router("/payroll", loan_router)          # Loans at /api/payroll/loans
api.add_router("/payroll", leave_router)         # Leaves at /api/payroll/leave-*
api.add_router("/payroll", general_request_router)  # Employee requests at /api/payroll/requests, /api/payroll/my-requests
api.add_router("/dashboard", dashboard_router)   # Dashboard analytics at /api/dashboard
api.add_router("/hr-policy", hr_policy_router)  # HR Policy library at /api/hr-policy

urlpatterns = [
    path('auth-admin/', admin.site.urls),
    path('admin/', admin.site.urls),
    path('api/', api.urls),  # All API endpoints under /api/
]

from django.views.static import serve
from django.urls import re_path

# Serve media files in all environments
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

