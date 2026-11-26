from typing import Optional
from datetime import datetime
from ninja import Schema


class EmployeeRequestIn(Schema):
    category: str = 'general'
    subject: str
    message: str


class EmployeeRequestReviewIn(Schema):
    review_notes: Optional[str] = None


class EmployeeRequestOut(Schema):
    id: str
    employee_id: str
    employee_name: str
    category: str
    subject: str
    message: str
    status: str
    submitted_at: datetime
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
