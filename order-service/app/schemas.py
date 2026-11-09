from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, ConfigDict


class OrderCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=1000)


class OrderStatusUpdate(BaseModel):
    status: str = Field(
        pattern="^(PENDING|CONFIRMED|CANCELLED)$"
    )


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    status: str
    created_at: datetime
