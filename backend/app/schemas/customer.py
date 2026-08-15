import uuid
from datetime import datetime

from pydantic import BaseModel


class CustomerOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
