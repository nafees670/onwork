from django.contrib import admin
from .models import HRPolicy


@admin.register(HRPolicy)
class HRPolicyAdmin(admin.ModelAdmin):
    list_display = ('title', 'file_type', 'original_filename', 'uploaded_by', 'uploaded_by_superadmin', 'updated_at')
    list_filter = ('file_type', 'created_at', 'updated_at')
    search_fields = ('title', 'description', 'original_filename')
    raw_id_fields = ('uploaded_by', 'uploaded_by_superadmin')
    readonly_fields = ('id', 'created_at', 'updated_at')
