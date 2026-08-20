from typing import List

from pydantic import BaseModel, Field


class BonusCreatePayload(BaseModel):
    points: int = Field(..., gt=0, le=1_000_000)
    note: str = Field(default="", max_length=500)
    full_name: str = Field(..., min_length=1, max_length=300)
    phone: str = Field(default="", max_length=100)
    last_updated: str = Field(default="", max_length=100)
    current_total_points: int = Field(default=0, ge=0)
    current_points_earned: int = Field(default=0, ge=0)


class CustomerUpsertPayload(BaseModel):
    id: str = Field(default="", max_length=100)
    full_name: str = Field(..., min_length=1, max_length=300)
    phone: str = Field(default="", max_length=100)
    status: str = Field(default="active", max_length=20)
    last_updated: str = Field(default="", max_length=100)


class OrderCreateItemPayload(BaseModel):
    productId: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0, le=10000)


class OrderCreatePayload(BaseModel):
    customerId: str = Field(..., min_length=1)
    customerName: str = Field(..., min_length=1)
    items: List[OrderCreateItemPayload] = Field(..., min_length=1)
    note: str = Field(default="", max_length=1000)
    createdBy: str = Field(default="Admin")


class OrderStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=50)
    actor: str = Field(default="Admin", max_length=200)
    reason: str = Field(default="", max_length=500)


class ProductCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    points_value: int = Field(default=0, ge=0, le=1_000_000)
    category: str = Field(default="", max_length=100)
    is_active: bool = True


class GiftCreatePayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    description: str = Field(default="", max_length=2000)
    points_cost: int = Field(default=0, ge=0, le=1_000_000)
    category: str = Field(default="", max_length=100)
    stock: int = Field(default=0, ge=0, le=1_000_000)
    is_active: bool = True
    image: str = Field(default="", max_length=2000)


class RedemptionRequestCreatePayload(BaseModel):
    customer_id: str = Field(..., min_length=1)
    customer_name: str = Field(..., min_length=1, max_length=300)
    gift_id: str = Field(..., min_length=1)
    request_type: str = Field(default="Admin", max_length=50)
    operator: str = Field(default="Admin", max_length=100)


class RedemptionRequestStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=50)
    operator: str = Field(default="Admin", max_length=100)
    reject_reason: str = Field(default="", max_length=1000)


class RedemptionRequestBulkStatusPayload(BaseModel):
    ids: List[str] = Field(..., min_length=1, max_length=5000)
    status: str = Field(..., min_length=1, max_length=50)
    operator: str = Field(default="Admin", max_length=100)
    reject_reason: str = Field(default="", max_length=1000)


class QrScanPayload(BaseModel):
    qr_code: str = Field(..., min_length=8, max_length=500)
    quantity: int = Field(default=1, ge=1, le=1000)
    note: str = Field(default="", max_length=500)


class DeviceTokenPayload(BaseModel):
    fcm_token: str = Field(..., min_length=10, max_length=500)
    platform: str = Field(default="android", max_length=20)
    note: str = Field(default="", max_length=500)


class PushNotificationPayload(BaseModel):
    customer_id: str = Field(default="", max_length=100)
    audience: str = Field(default="customer", max_length=20)
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=1000)


class ProductQrGeneratePayload(BaseModel):
    count: int = Field(..., ge=1, le=5000)


class ProductQrBulkIdsPayload(BaseModel):
    ids: List[int] = Field(..., min_length=1, max_length=5000)


class ProductQrUnscanPayload(BaseModel):
    reason: str = Field(default="", max_length=500)
    operator: str = Field(default="Admin", max_length=100)


class MarketOrderCreatePayload(BaseModel):
    client_id: str = Field(..., min_length=1)
    client_name: str = Field(..., min_length=1, max_length=300)
    type: str = Field(..., min_length=1, max_length=20)
    points: int = Field(..., ge=1, le=1_000_000)
    amount_uzs: int = Field(..., ge=0, le=5_000_000_000)
    rate: int = Field(..., ge=1, le=1_000_000)
    payment_method: str = Field(default="", max_length=50)
    status: str = Field(default="Pending", max_length=50)
    note: str = Field(default="", max_length=1000)
    operator: str = Field(default="Admin", max_length=100)


class MarketOrderStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=50)
    note: str = Field(default="", max_length=1000)
    operator: str = Field(default="Admin", max_length=100)


class AuthRequestOtpPayload(BaseModel):
    phone: str = Field(..., min_length=3, max_length=100)


class AuthVerifyOtpPayload(BaseModel):
    phone: str = Field(..., min_length=3, max_length=100)
    otp: str = Field(..., min_length=4, max_length=10)


class AdminLoginPayload(BaseModel):
    username: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=1, max_length=200)
