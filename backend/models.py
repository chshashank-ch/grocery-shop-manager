from pydantic import BaseModel, Field
from typing import Optional, List

class LoginRequest(BaseModel):
    username: str
    password: str

class AccountCreate(BaseModel):
    username: str = Field(..., min_length=2)
    password: str = Field(..., min_length=3)
    role: Optional[str] = "staff"

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None

class StockEntryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    qty: float = Field(..., gt=0)
    price: float = Field(..., ge=0)
    category: Optional[str] = "Groceries"
    threshold: Optional[float] = None
    photo_url: Optional[str] = None

class SaleCreate(BaseModel):
    amount: float = Field(..., gt=0)
    note: Optional[str] = ""
    payment_mode: Optional[str] = "Cash"

class SettingsUpdateRequest(BaseModel):
    shop_name: Optional[str] = None
    currency_symbol: Optional[str] = None
    low_stock_threshold: Optional[float] = None
    profile_photo_url: Optional[str] = None

class AIChatRequest(BaseModel):
    message: str
