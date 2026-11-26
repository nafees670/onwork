"""
General employee self-service requests (salary queries, certificates,
complaints, or anything else) — a lightweight ticket with an approval
workflow, matching the same pending/approved/rejected pattern used by
EmployeeLoan and ESPWithdrawal.
"""
from django.db import models
from employees.models import Employee
from employees.utils import SoftDeleteModel


class EmployeeRequest(SoftDeleteModel):

    CATEGORY_CHOICES = (
        ('salary', 'Salary'),
        ('certificate', 'Certificate / Letter'),
        ('complaint', 'Complaint'),
        ('general', 'General'),
        ('other', 'Other'),
    )

    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='requests'
    )
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='general')
    subject = models.CharField(max_length=200)
    message = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(
        Employee, on_delete=models.PROTECT, null=True, blank=True,
        related_name='reviewed_employee_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-submitted_at']
        verbose_name = "Employee Request"
        verbose_name_plural = "Employee Requests"

    def __str__(self):
        return f"{self.employee.employee_id} - {self.subject} ({self.status})"
