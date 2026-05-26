from datetime import datetime

from pydantic import BaseModel


class ApiMessage(BaseModel):
    message: str


class TimestampedModel(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
