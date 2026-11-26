"""
HR Policy library — admins upload a PPTX/DOCX policy document, which is
converted to PDF server-side (see services.py) and served view-only to
every employee. The original file is kept only so an admin can replace/
re-convert it later; it is never served back to a regular employee.
"""
import uuid
from django.db import models
from employees.models import Employee
from employees.utils import SoftDeleteModel


class HRPolicy(SoftDeleteModel):
    FILE_TYPE_CHOICES = [
        ('pptx', 'PowerPoint'),
        ('docx', 'Word Document'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file_type = models.CharField(max_length=4, choices=FILE_TYPE_CHOICES)
    original_filename = models.CharField(max_length=255)
    original_file = models.FileField(upload_to='hr_policies/originals/%Y/%m/')
    converted_pdf = models.FileField(upload_to='hr_policies/converted/%Y/%m/')

    uploaded_by = models.ForeignKey(
        Employee,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hr_policies_uploaded',
    )
    uploaded_by_superadmin = models.ForeignKey(
        'authentication.SuperAdmin',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hr_policies_uploaded',
    )

    class Meta:
        verbose_name = "HR Policy"
        verbose_name_plural = "HR Policies"
        ordering = ['-updated_at']

    def __str__(self):
        return self.title
