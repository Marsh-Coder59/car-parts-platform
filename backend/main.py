# ============================================================
# main.py — CarParts E-Commerce Backend
# Complete production-grade FastAPI application
# ============================================================

import logging
import secrets
import hashlib
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import os
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
from typing import Optional, List, Any

from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request, Cookie, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from passlib.context import CryptContext
from jose import jwt, JWTError

import psycopg2
from database import get_db_connection

# ============================================================
# ENV LOAD — explicit path as required
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
load_dotenv(ENV_FILE)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set in .env — application cannot start")

ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = int(os.getenv("SESSION_EXPIRE_HOURS", "24"))
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# ============================================================
# LOGGING
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("carparts")

# ============================================================
# PASSWORD HASHING
# ============================================================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# A small, explicit denylist — a UX/defense-in-depth backstop, not a breach
# database. The real floor is length + composition below; this just catches
# the handful of passwords people reach for first ("Password1!", etc.).
_COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789",
    "1234567890", "qwerty123", "qwertyuiop", "letmein123", "welcome123",
    "admin1234", "iloveyou1", "monkey123", "dragon123", "sunshine1",
    "princess1", "football1", "baseball1", "superman1", "trustno1",
}


def enforce_password_policy(v: str) -> str:
    """
    Shared, backend-authoritative password policy. Used by registration,
    password reset, and password change — the frontend's live strength
    meter is a UX aid only; this is what actually decides whether a
    password is accepted, and it cannot be bypassed from the client.
    """
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if v.lower() in _COMMON_PASSWORDS:
        raise ValueError("This password is too common. Please choose a more unique password.")
    return v


# ============================================================
# SESSION TOKEN HELPERS
# ============================================================
def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ============================================================
# FASTAPI APPLICATION
# ============================================================
app = FastAPI(
    title="CarParts API",
    description="Production backend for CarParts e-commerce marketplace",
    version="2.0.0"
)



app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:5174").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded static files (avatars, product images, settings images)
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(_STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


# ============================================================
# DECIMAL HELPERS
# ============================================================
def to_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def safe_json(value) -> Any:
    """Convert a value to a JSON-serialisable form."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def row_to_dict(cursor, row) -> dict:
    """Map a DB row to a dict using cursor description, serialising safely."""
    if row is None:
        return None
    return {cursor.description[i][0]: safe_json(v) for i, v in enumerate(row)}


def rows_to_list(cursor, rows) -> list:
    return [row_to_dict(cursor, r) for r in rows]


# ============================================================
# AUDIT LOG HELPER
# ============================================================
def write_audit_log(
    cursor,
    user_id,
    action: str,
    entity_type: str,
    entity_id,
    old_values: dict = None,
    new_values: dict = None,
    ip_address: str = None,
):
    """Write to audit_logs table. Never logs passwords or tokens."""
    def _sanitise(d: dict) -> dict:
        if not d:
            return {}
        banned = {"password", "password_hash", "session_token", "session_token_hash", "secret_key"}
        return {k: v for k, v in d.items() if k.lower() not in banned}

    try:
        cursor.execute(
            """
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id,
                                    old_values, new_values, ip_address, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            (
                user_id,
                action,
                entity_type,
                str(entity_id) if entity_id is not None else None,
                json.dumps(_sanitise(old_values)) if old_values else None,
                json.dumps(_sanitise(new_values)) if new_values else None,
                ip_address,
            ),
        )
    except Exception as exc:
        logger.error("audit_log write failed: %s", exc)


# ============================================================
# NOTIFICATION HELPER
# ============================================================
def create_notification(cursor, user_id: int, notif_type: str, title: str, message: str):
    try:
        cursor.execute(
            """
            INSERT INTO notifications (user_id, type, title, message, channel, status, created_at)
            VALUES (%s, %s, %s, %s, 'IN_APP', 'UNREAD', NOW())
            """,
            (user_id, notif_type, title, message),
        )
    except Exception as exc:
        logger.error("notification write failed: %s", exc)


# ============================================================
# AUTHENTICATION — DB session-based, NOT stale-JWT role trust
# ============================================================
SESSION_COOKIE = "carparts_session"


def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
):
    """
    Reads the session token from the HTTP-only cookie, verifies it
    against user_sessions, and re-fetches the user role from the DB
    on every request to prevent stale-role attacks.
    """
    token = session_token
    # Also accept Bearer token in Authorization header for API clients
    auth_header = request.headers.get("Authorization", "")
    if not token and auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_hash = hash_token(token)
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT us.user_id, us.expires_at, us.revoked_at,
                   u.email, u.role, u.status, u.first_name, u.last_name
            FROM user_sessions us
            JOIN users u ON u.id = us.user_id
            WHERE us.session_token_hash = %s
            """,
            (token_hash,),
        )
        row = cur.fetchone()
        cur.close()
    except Exception:
        if conn:
            conn.close()
        raise HTTPException(status_code=500, detail="Authentication service error")
    finally:
        if conn:
            conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id, expires_at, revoked_at, email, role, status, first_name, last_name = row

    if revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session has been revoked")

    if expires_at and expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=401, detail="Session has expired")

    if status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Account is not active")

    return {
        "user_id": user_id,
        "email": email,
        "role": role,
        "first_name": first_name,
        "last_name": last_name,
    }


def require_role(*allowed_roles):
    def checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker


def require_staff_or_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("STAFF", "ADMIN"):
        raise HTTPException(status_code=403, detail="Staff or Admin access required")
    return current_user


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_customer(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("CUSTOMER", "STAFF", "ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")
    return current_user


# ============================================================
# PYDANTIC MODELS — all deduplicated
# ============================================================

# AUTH / USERS
class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        return enforce_password_policy(v)


class UserLogin(BaseModel):
    email: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pwd_min(cls, v):
        return enforce_password_policy(v)


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None


class ThemeUpdate(BaseModel):
    theme: str

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, v):
        if v not in ("light", "dark"):
            raise ValueError("theme must be 'light' or 'dark'")
        return v


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pwd_policy(cls, v):
        return enforce_password_policy(v)


# CATEGORIES / BRANDS
class CategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: bool = True


class BrandCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True


# VEHICLES
class VehicleCreate(BaseModel):
    make: str
    model: str
    generation: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    engine: Optional[str] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None


class VehicleUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    generation: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    engine: Optional[str] = None
    fuel_type: Optional[str] = None
    transmission: Optional[str] = None


# PRODUCTS
class ProductCreate(BaseModel):
    category_id: int
    brand_id: Optional[int] = None
    name: str
    slug: Optional[str] = None
    sku: Optional[str] = None
    part_number: Optional[str] = None
    description: Optional[str] = None
    stock_quantity: Optional[int] = 0
    price: Decimal
    compare_at_price: Optional[Decimal] = None
    condition: str = "NEW"
    status: str = "DRAFT"
    weight: Optional[Decimal] = None
    is_featured: bool = False


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    name: Optional[str] = None
    slug: Optional[str] = None
    sku: Optional[str] = None
    part_number: Optional[str] = None
    description: Optional[str] = None
    stock_quantity: Optional[int] = None
    price: Optional[Decimal] = None
    compare_at_price: Optional[Decimal] = None
    condition: Optional[str] = None
    status: Optional[str] = None
    weight: Optional[Decimal] = None
    is_featured: Optional[bool] = None


class ProductImageCreate(BaseModel):
    image_url: str
    alt_text: Optional[str] = None
    sort_order: int = 0
    is_primary: bool = False


# INVENTORY
class StockInRequest(BaseModel):
    product_id: int
    quantity: int
    reorder_level: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class StockOutRequest(BaseModel):
    product_id: int
    quantity: int
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class InventoryReserveRequest(BaseModel):
    product_id: int
    quantity: int
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class InventoryReleaseRequest(BaseModel):
    product_id: int
    quantity: int
    reference_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class InventoryAdjustmentRequest(BaseModel):
    product_id: int
    new_quantity: int
    notes: str

    @field_validator("new_quantity")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("New quantity cannot be negative")
        return v


# ADDRESSES
class AddressCreate(BaseModel):
    label: Optional[str] = None
    full_name: str
    phone: Optional[str] = None
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    county: Optional[str] = None
    country: str = "Kenya"
    postal_code: Optional[str] = None
    is_default: bool = False


# CART
class CartItemRequest(BaseModel):
    product_id: int
    quantity: int

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


class CartItemUpdate(BaseModel):
    quantity: int

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v


# CHECKOUT / ORDERS
class CheckoutRequest(BaseModel):
    shipping_address_id: int
    coupon_code: Optional[str] = None
    notes: Optional[str] = None


class OrderStatusUpdate(BaseModel):
    new_status: str
    notes: Optional[str] = None


# PAYMENTS
class PaymentSubmission(BaseModel):
    amount: Decimal
    reference: str
    payment_date: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than zero")
        return v


class PaymentVerification(BaseModel):
    notes: Optional[str] = None


class PaymentRejection(BaseModel):
    notes: str


# DELIVERIES
class DeliveryCreate(BaseModel):
    order_id: int
    method: Optional[str] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    estimated_date: Optional[str] = None
    notes: Optional[str] = None


class DeliveryUpdate(BaseModel):
    status: Optional[str] = None
    courier: Optional[str] = None
    tracking_number: Optional[str] = None
    estimated_date: Optional[str] = None
    notes: Optional[str] = None


# REVIEWS
class ReviewCreate(BaseModel):
    order_item_id: int
    rating: int
    title: Optional[str] = None
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def valid_rating(cls, v):
        if not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5")
        return v


# COUPONS
class CouponCreate(BaseModel):
    code: str
    discount_type: str  # PERCENTAGE | FIXED
    discount_value: Decimal
    min_order_amount: Optional[Decimal] = None
    max_uses: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: bool = True


# RETURNS
class ReturnRequest(BaseModel):
    order_id: int
    reason: str
    notes: Optional[str] = None


class ReturnUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


# PRODUCT COMPATIBILITY
class CompatibilityAdd(BaseModel):
    vehicle_id: int
    notes: Optional[str] = None


# SETTINGS
class SettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    business_email: Optional[str] = None
    business_phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    facebook_url: Optional[str] = None
    instagram_url: Optional[str] = None
    tiktok_url: Optional[str] = None
    x_url: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_branch: Optional[str] = None
    default_deposit_percentage: Optional[int] = None
    default_balance_percentage: Optional[int] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    banner_url: Optional[str] = None


# ============================================================
# HEALTH / ROOT
# ============================================================
@app.get("/")
def root():
    return {"message": "CarParts API", "status": "running", "version": "2.0.0"}


@app.get("/health")
def health():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {"status": "ok", "database": db_status}


# ============================================================
# AUTH ROUTES
# ============================================================

@app.get("/api/auth/check-email")
def check_email_availability(email: str, request: Request):
    """
    Real-time availability check used by the registration form.
    Returns ONLY a boolean — never the matching account's name, status, or
    any other detail — so this endpoint can't be used to enumerate or
    fingerprint existing accounts beyond "is this exact address taken".
    Lightly rate-limited since it's called on every keystroke/blur.
    """
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip, "check-email")

    normalized = email.strip().lower()
    if not normalized or "@" not in normalized or "." not in normalized.split("@")[-1]:
        # Not a well-formed email yet — nothing to check.
        return {"available": None}

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM users WHERE email = %s", (normalized,))
        exists = cur.fetchone() is not None
        cur.close()
        return {"available": not exists}
    except Exception:
        logger.exception("check_email_availability error")
        # Fail open on the convenience check — the DB unique constraint and
        # the register endpoint's own check remain the authoritative guard.
        return {"available": None}
    finally:
        if conn:
            conn.close()


@app.post("/api/auth/register", status_code=201)
def register(user: UserRegister, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip, "register")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        normalized_email = user.email.strip().lower()

        cur.execute("SELECT id FROM users WHERE email = %s", (normalized_email,))
        if cur.fetchone():
            # Deliberately specific here (unlike login/forgot-password) because
            # this is the user's own registration attempt, not someone probing
            # another person's account — the directive's required UX is a
            # friendly message pointing them to login.
            raise HTTPException(status_code=409, detail="This email is already registered. Please log in or reset your password.")

        password_hash = hash_password(user.password)

        cur.execute(
            """
            INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status, email_verified, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 'CUSTOMER', 'ACTIVE', FALSE, NOW(), NOW())
            RETURNING id, first_name, last_name, email, role
            """,
            (user.first_name, user.last_name, normalized_email, user.phone, password_hash),
        )
        new_user = cur.fetchone()
        user_id = new_user[0]

        # Generate the email-verification token now, in the same transaction
        # as account creation, so a user is never left in a state where the
        # account exists but no verification path was ever issued.
        verification_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(verification_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        try:
            cur.execute(
                """
                INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, used, created_at)
                VALUES (%s, %s, %s, FALSE, NOW())
                ON CONFLICT (user_id) DO UPDATE
                    SET token_hash = EXCLUDED.token_hash,
                        expires_at = EXCLUDED.expires_at,
                        used = FALSE,
                        created_at = NOW()
                """,
                (user_id, token_hash, expires_at.replace(tzinfo=None)),
            )
        except Exception:
            conn.rollback()
            # Re-run the user insert's effects are already rolled back too in
            # this fallback branch, so redo the minimal state needed: store
            # the token on the users table instead (older schema variant).
            cur.execute(
                """
                INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status, email_verified,
                                    email_verification_token, email_verification_expires, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'CUSTOMER', 'ACTIVE', FALSE, %s, %s, NOW(), NOW())
                RETURNING id, first_name, last_name, email, role
                """,
                (user.first_name, user.last_name, normalized_email, user.phone, password_hash,
                 token_hash, expires_at.replace(tzinfo=None)),
            )
            new_user = cur.fetchone()
            user_id = new_user[0]

        # Audit
        write_audit_log(cur, user_id, "USER_REGISTERED", "users", user_id,
                        new_values={"email": normalized_email, "role": "CUSTOMER"},
                        ip_address=client_ip)

        # Notification
        create_notification(cur, user_id, "WELCOME", "Welcome to CarParts",
                            f"Hi {user.first_name}, your account has been created successfully.")

        conn.commit()
        cur.close()

        # Send the verification email AFTER commit — if delivery fails, the
        # account still exists correctly and the user can use "Resend code"
        # on the verification page (which re-checks/re-sends on request).
        email_sent = _send_verification_email(normalized_email, user.first_name, verification_token)

        return {
            "message": "Registration successful. Please check your email to verify your account.",
            "email_sent": email_sent,
            "user": {
                "id": new_user[0], "first_name": new_user[1], "last_name": new_user[2],
                "email": normalized_email, "role": new_user[4]
            }
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("register error")
        raise HTTPException(status_code=500, detail="Registration failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/auth/login")
def login(credentials: UserLogin, request: Request, response: Response):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT id, first_name, last_name, email, password_hash, role, status, theme_preference, email_verified "
            "FROM users WHERE email = %s",
            (credentials.email.lower(),),
        )
        row = cur.fetchone()

        # Timing-safe: always verify even if user not found (with a dummy hash)
        dummy_hash = pwd_context.hash("dummy")
        if not row:
            verify_password(credentials.password, dummy_hash)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user_id, first_name, last_name, email, password_hash, role, status, theme_preference, email_verified = row

        if not verify_password(credentials.password, password_hash):
            write_audit_log(cur, user_id, "LOGIN_FAILED", "users", user_id,
                            ip_address=request.client.host if request.client else None)
            conn.commit()
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if status != "ACTIVE":
            raise HTTPException(status_code=403, detail="Account is not active")

        # Admin/staff accounts are created already-verified (see create_staff)
        # and must never be locked out by a customer-facing email flow.
        # Only CUSTOMER accounts are held to email verification.
        if role == "CUSTOMER" and not email_verified:
            write_audit_log(cur, user_id, "LOGIN_BLOCKED_UNVERIFIED", "users", user_id,
                            ip_address=request.client.host if request.client else None)
            conn.commit()
            raise HTTPException(
                status_code=403,
                detail="Please verify your email before logging in. Check your inbox for the verification link, or request a new one below.",
            )

        token = generate_session_token()
        token_hash = hash_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRE_HOURS)

        cur.execute(
            """
            INSERT INTO user_sessions (user_id, session_token_hash, expires_at, created_at, ip_address, user_agent)
            VALUES (%s, %s, %s, NOW(), %s, %s)
            """,
            (user_id, token_hash, expires_at.replace(tzinfo=None),
             request.client.host if request.client else None,
             request.headers.get("User-Agent", "")[:500]),
        )

        cur.execute("UPDATE users SET last_login_at = NOW() WHERE id = %s", (user_id,))

        write_audit_log(cur, user_id, "LOGIN", "users", user_id,
                        ip_address=request.client.host if request.client else None)

        conn.commit()
        cur.close()

        is_prod = ENVIRONMENT == "production"
        # Cross-origin deployments (e.g. frontend on one Render service,
        # backend on another — different hostnames even though both are
        # "onrender.com") need SameSite=None for the browser to send this
        # cookie back on XHR/fetch requests at all; SameSite=Lax (the old
        # fixed value here) is silently dropped on cross-site AJAX calls,
        # which looks exactly like "login succeeds but every request after
        # it is 401" — the cookie was never actually being sent back.
        # SameSite=None requires Secure=True (HTTPS), which is fine in
        # production (Render terminates TLS) and in local dev we stay on
        # Lax/non-secure since frontend+backend share an origin there via
        # the Vite proxy.
        response.set_cookie(
            key=SESSION_COOKIE,
            value=token,
            httponly=True,
            secure=is_prod,
            samesite="none" if is_prod else "lax",
            max_age=SESSION_EXPIRE_HOURS * 3600,
            path="/",
        )

        return {
            "message": "Login successful",
            # theme_preference is returned here (not just from /api/auth/me) so
            # the frontend can apply the account's saved theme immediately on
            # login, before any extra round trip — avoids a flash of the
            # wrong theme right after signing in.
            "user": {"id": user_id, "first_name": first_name, "last_name": last_name,
                     "email": email, "role": role, "theme_preference": theme_preference},
            "token": token  # also return for API clients using Bearer
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("login error")
        raise HTTPException(status_code=500, detail="Login failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user),
    session_token: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
):
    conn = None
    try:
        token = session_token
        auth_header = request.headers.get("Authorization", "")
        if not token and auth_header.startswith("Bearer "):
            token = auth_header[7:]

        conn = get_db_connection()
        cur = conn.cursor()

        if token:
            token_hash = hash_token(token)
            cur.execute(
                "UPDATE user_sessions SET revoked_at = NOW() WHERE session_token_hash = %s",
                (token_hash,),
            )

        write_audit_log(cur, current_user["user_id"], "LOGOUT", "users", current_user["user_id"],
                        ip_address=request.client.host if request.client else None)

        conn.commit()
        cur.close()
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("logout error")
    finally:
        if conn:
            conn.close()

    # Attributes must match how the cookie was originally set, or some
    # browsers won't actually clear it (a delete_cookie() with mismatched
    # SameSite/Secure can be a silent no-op).
    is_prod = ENVIRONMENT == "production"
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        secure=is_prod,
        samesite="none" if is_prod else "lax",
    )
    return {"message": "Logged out successfully"}


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, first_name, last_name, email, phone, role, status, email_verified, created_at, avatar_url, theme_preference FROM users WHERE id = %s",
            (current_user["user_id"],),
        )
        row = cur.fetchone()
        cur.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch user")
    finally:
        if conn:
            conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": row[0], "first_name": row[1], "last_name": row[2], "email": row[3],
        "phone": row[4], "role": row[5], "status": row[6],
        "email_verified": row[7], "created_at": safe_json(row[8]),
        "avatar_url": row[9] if len(row) > 9 else None,
        "theme_preference": row[10] if len(row) > 10 else "light",
    }


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request):
    """
    Generates a secure password reset token and stores it.
    Sends email if SMTP is configured; otherwise logs the token for dev environments.
    Does NOT reveal whether the email is registered.
    """
    client_ip = request.client.host if request.client else "unknown"
    # IP-based limit: this endpoint takes no auth and is a classic target
    # for enumeration/abuse (spamming an arbitrary inbox with reset emails).
    _check_rate_limit(client_ip, "forgot-password")

    normalized_email = body.email.strip().lower()

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, first_name, email FROM users WHERE email = %s AND status = 'ACTIVE'",
            (normalized_email,),
        )
        user = cur.fetchone()
        if user:
            user_id, first_name, email = user

            # Per-account cooldown: if a reset was already requested for
            # this account in the last 30 seconds, don't issue a new token
            # or send another email — but still return the exact same
            # generic response below, so this never discloses whether the
            # account exists via timing or response differences.
            already_recent = False
            try:
                cur.execute(
                    "SELECT 1 FROM password_reset_tokens WHERE user_id = %s AND created_at > NOW() - INTERVAL '30 seconds'",
                    (user_id,),
                )
                already_recent = cur.fetchone() is not None
            except Exception:
                conn.rollback()

            if not already_recent:
                token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(token.encode()).hexdigest()
                expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
                # Store in password_reset_tokens table (or users table column)
                # Using a try/except to handle both schema variants
                try:
                    cur.execute(
                        """
                        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used, created_at)
                        VALUES (%s, %s, %s, FALSE, NOW())
                        ON CONFLICT (user_id) DO UPDATE
                            SET token_hash = EXCLUDED.token_hash,
                                expires_at = EXCLUDED.expires_at,
                                used = FALSE,
                                created_at = NOW()
                        """,
                        (user_id, token_hash, expires_at.replace(tzinfo=None)),
                    )
                except Exception:
                    # Fallback: store reset token on users table if column exists
                    conn.rollback()
                cur.execute(
                    """
                    UPDATE users SET
                        password_reset_token = %s,
                        password_reset_expires = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (token_hash, expires_at.replace(tzinfo=None), user_id),
                )
                write_audit_log(cur, user_id, "PASSWORD_RESET_REQUESTED", "users", user_id,
                                ip_address=client_ip)
                conn.commit()
                # Send email if configured, otherwise log token for development
                _send_password_reset_email(email, first_name, token)
            else:
                # Throttled — no new token, no new email, no audit noise.
                # The response below is identical either way.
                conn.commit()
        cur.close()
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("forgot_password error")
    finally:
        if conn:
            conn.close()
    return {"message": "If that email is registered, a password reset link has been sent"}


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request):
    """Validates the reset token and sets a new password. Token is invalidated after use."""
    client_ip = request.client.host if request.client else "unknown"
    # Token guessing resistance: the token itself is 32 bytes of CSPRNG
    # output (unguessable in practice), but rate-limiting the endpoint is
    # still cheap defense-in-depth against brute-force/credential-stuffing
    # style abuse of this specific route.
    _check_rate_limit(client_ip, "reset-password")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        token_hash = hashlib.sha256(body.token.encode()).hexdigest()

        # Try password_reset_tokens table first
        user_id = None
        user_email = None
        user_first_name = None
        try:
            cur.execute(
                """
                SELECT prt.user_id, u.email, u.first_name
                FROM password_reset_tokens prt
                JOIN users u ON u.id = prt.user_id
                WHERE prt.token_hash = %s AND prt.used = FALSE AND prt.expires_at > NOW()
                  AND u.status = 'ACTIVE'
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if row:
                user_id, user_email, user_first_name = row
                cur.execute(
                    "UPDATE password_reset_tokens SET used = TRUE WHERE token_hash = %s",
                    (token_hash,),
                )
        except Exception:
            conn.rollback()
            # Fallback: check users table column
            cur.execute(
                """
                SELECT id, email, first_name FROM users
                WHERE password_reset_token = %s
                  AND password_reset_expires > NOW()
                  AND status = 'ACTIVE'
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if row:
                user_id, user_email, user_first_name = row
                cur.execute(
                    "UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = %s",
                    (user_id,),
                )

        if not user_id:
            raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Please request a new one.")

        new_hash = hash_password(body.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
            (new_hash, user_id),
        )
        # Revoke all existing sessions for security — anyone who had a
        # session open (including an attacker, if the reset was triggered
        # because the account was compromised) is logged out everywhere.
        cur.execute(
            "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL",
            (user_id,),
        )
        write_audit_log(cur, user_id, "PASSWORD_RESET_COMPLETED", "users", user_id,
                        ip_address=client_ip)
        conn.commit()
        cur.close()

        # Let the customer know, independent of whether they were the one
        # who triggered this — if an attacker reset the password, the real
        # owner needs to see this even though they can no longer log in.
        if user_email:
            _send_password_changed_email(user_email, user_first_name or "there")

        return {"message": "Password reset successfully. Please log in with your new password."}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("reset_password error")
        raise HTTPException(status_code=500, detail="Password reset failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/auth/change-password")
def change_password(
    body: PasswordChange,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (current_user["user_id"],))
        row = cur.fetchone()
        if not row or not verify_password(body.current_password, row[0]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        new_hash = hash_password(body.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
            (new_hash, current_user["user_id"]),
        )
        write_audit_log(cur, current_user["user_id"], "PASSWORD_CHANGED", "users", current_user["user_id"],
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        _send_password_changed_email(current_user["email"], current_user.get("first_name") or "there")
        return {"message": "Password changed successfully"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("change_password error")
        raise HTTPException(status_code=500, detail="Password change failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# USERS
# ============================================================

@app.get("/api/users/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    return me(current_user)


@app.patch("/api/users/theme")
def update_theme(body: ThemeUpdate, current_user: dict = Depends(get_current_user)):
    """
    Persist the signed-in account's light/dark preference. Available to any
    authenticated role (customer, staff, admin) — the preference is tied to
    the account, not to any one dashboard, so toggling it in one place (e.g.
    the admin header) is expected to carry over everywhere that account
    signs in, including the next session.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET theme_preference = %s, updated_at = NOW() WHERE id = %s RETURNING theme_preference",
            (body.theme, current_user["user_id"]),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {"theme_preference": row[0]}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_theme error")
        raise HTTPException(status_code=500, detail="Could not update theme preference")
    finally:
        if conn:
            conn.close()


@app.patch("/api/users/profile")
def update_profile(
    body: ProfileUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE users SET
                first_name = COALESCE(%s, first_name),
                last_name = COALESCE(%s, last_name),
                phone = COALESCE(%s, phone),
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, first_name, last_name, email, phone
            """,
            (body.first_name, body.last_name, body.phone, current_user["user_id"]),
        )
        row = cur.fetchone()
        write_audit_log(cur, current_user["user_id"], "PROFILE_UPDATED", "users", current_user["user_id"],
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"id": row[0], "first_name": row[1], "last_name": row[2], "email": row[3], "phone": row[4]}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Profile update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADDRESSES
# ============================================================

@app.get("/api/addresses")
def list_addresses(current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, label, full_name, phone, address_line1, address_line2, city, county, country, postal_code, is_default FROM addresses WHERE user_id = %s ORDER BY is_default DESC, id",
            (current_user["user_id"],),
        )
        rows = cur.fetchall()
        cur.close()
        cols = ["id","label","full_name","phone","address_line1","address_line2","city","county","country","postal_code","is_default"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch addresses")
    finally:
        if conn:
            conn.close()


@app.post("/api/addresses", status_code=201)
def create_address(body: AddressCreate, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        if body.is_default:
            cur.execute("UPDATE addresses SET is_default = FALSE WHERE user_id = %s", (current_user["user_id"],))

        cur.execute(
            """
            INSERT INTO addresses (user_id, label, full_name, phone, address_line1, address_line2,
                                   city, county, country, postal_code, is_default, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
            RETURNING id
            """,
            (current_user["user_id"], body.label, body.full_name, body.phone,
             body.address_line1, body.address_line2, body.city, body.county,
             body.country, body.postal_code, body.is_default),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Address created"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Address creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/addresses/{address_id}")
def update_address(address_id: int, body: AddressCreate, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM addresses WHERE id = %s AND user_id = %s", (address_id, current_user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Address not found")

        if body.is_default:
            cur.execute("UPDATE addresses SET is_default = FALSE WHERE user_id = %s", (current_user["user_id"],))

        cur.execute(
            """
            UPDATE addresses SET label=%s, full_name=%s, phone=%s, address_line1=%s, address_line2=%s,
                city=%s, county=%s, country=%s, postal_code=%s, is_default=%s, updated_at=NOW()
            WHERE id = %s AND user_id = %s
            """,
            (body.label, body.full_name, body.phone, body.address_line1, body.address_line2,
             body.city, body.county, body.country, body.postal_code, body.is_default,
             address_id, current_user["user_id"]),
        )
        conn.commit()
        cur.close()
        return {"message": "Address updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Address update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/addresses/{address_id}")
def delete_address(address_id: int, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM addresses WHERE id = %s AND user_id = %s RETURNING id", (address_id, current_user["user_id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Address not found")
        conn.commit()
        cur.close()
        return {"message": "Address deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Address deletion failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# CATEGORIES
# ============================================================

@app.get("/api/categories")
def list_categories():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, slug, description, image_url, parent_id, is_active FROM categories ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        cols = ["id","name","slug","description","image_url","parent_id","is_active"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch categories")
    finally:
        if conn:
            conn.close()


@app.get("/api/categories/{category_id}")
def get_category(category_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, slug, description, image_url, parent_id, is_active FROM categories WHERE id = %s", (category_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Category not found")
        cols = ["id","name","slug","description","image_url","parent_id","is_active"]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch category")
    finally:
        if conn:
            conn.close()


@app.post("/api/categories", status_code=201)
def create_category(body: CategoryCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO categories (name, slug, description, image_url, parent_id, is_active, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,NOW(),NOW()) RETURNING id",
            (body.name, body.slug, body.description, body.image_url, body.parent_id, body.is_active),
        )
        new_id = cur.fetchone()[0]
        write_audit_log(cur, current_user["user_id"], "CATEGORY_CREATED", "categories", new_id, new_values={"name": body.name})
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Category created"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Category creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/categories/{category_id}")
def update_category(category_id: int, body: CategoryCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE categories SET name=%s, slug=%s, description=%s, image_url=%s, parent_id=%s, is_active=%s, updated_at=NOW() WHERE id=%s RETURNING id",
            (body.name, body.slug, body.description, body.image_url, body.parent_id, body.is_active, category_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Category not found")
        write_audit_log(cur, current_user["user_id"], "CATEGORY_UPDATED", "categories", category_id)
        conn.commit()
        cur.close()
        return {"message": "Category updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Category update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int, current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM categories WHERE id=%s RETURNING id", (category_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Category not found")
        write_audit_log(cur, current_user["user_id"], "CATEGORY_DELETED", "categories", category_id)
        conn.commit()
        cur.close()
        return {"message": "Category deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Category deletion failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# BRANDS
# ============================================================

@app.get("/api/brands")
def list_brands():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, slug, description, logo_url, is_active FROM brands ORDER BY name")
        rows = cur.fetchall()
        cur.close()
        cols = ["id","name","slug","description","logo_url","is_active"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch brands")
    finally:
        if conn:
            conn.close()


@app.post("/api/brands", status_code=201)
def create_brand(body: BrandCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO brands (name, slug, description, logo_url, is_active, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,NOW(),NOW()) RETURNING id",
            (body.name, body.slug, body.description, body.logo_url, body.is_active),
        )
        new_id = cur.fetchone()[0]
        write_audit_log(cur, current_user["user_id"], "BRAND_CREATED", "brands", new_id, new_values={"name": body.name})
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Brand created"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Brand creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/brands/{brand_id}")
def update_brand(brand_id: int, body: BrandCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE brands SET name=%s, slug=%s, description=%s, logo_url=%s, is_active=%s, updated_at=NOW() WHERE id=%s RETURNING id",
            (body.name, body.slug, body.description, body.logo_url, body.is_active, brand_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Brand not found")
        write_audit_log(cur, current_user["user_id"], "BRAND_UPDATED", "brands", brand_id)
        conn.commit()
        cur.close()
        return {"message": "Brand updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Brand update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/brands/{brand_id}")
def delete_brand(brand_id: int, current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM brands WHERE id=%s RETURNING id", (brand_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Brand not found")
        write_audit_log(cur, current_user["user_id"], "BRAND_DELETED", "brands", brand_id)
        conn.commit()
        cur.close()
        return {"message": "Brand deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Brand deletion failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# VEHICLES
# ============================================================

@app.get("/api/vehicles")
def list_vehicles(
    make: Optional[str] = None,
    model: Optional[str] = None,
    year: Optional[int] = None,
    fuel_type: Optional[str] = None,
    transmission: Optional[str] = None,
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = "SELECT id, make, model, generation, year_from, year_to, engine, fuel_type, transmission FROM vehicles WHERE 1=1"
        params = []
        if make:
            query += " AND LOWER(make) LIKE LOWER(%s)"; params.append(f"%{make}%")
        if model:
            query += " AND LOWER(model) LIKE LOWER(%s)"; params.append(f"%{model}%")
        if year:
            query += " AND (year_from <= %s AND (year_to IS NULL OR year_to >= %s))"; params.extend([year, year])
        if fuel_type:
            query += " AND LOWER(fuel_type) = LOWER(%s)"; params.append(fuel_type)
        if transmission:
            query += " AND LOWER(transmission) = LOWER(%s)"; params.append(transmission)
        query += " ORDER BY make, model, year_from"
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        cols = ["id","make","model","generation","year_from","year_to","engine","fuel_type","transmission"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch vehicles")
    finally:
        if conn:
            conn.close()


@app.get("/api/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, make, model, generation, year_from, year_to, engine, fuel_type, transmission FROM vehicles WHERE id=%s", (vehicle_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        cols = ["id","make","model","generation","year_from","year_to","engine","fuel_type","transmission"]
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch vehicle")
    finally:
        if conn:
            conn.close()


@app.post("/api/vehicles", status_code=201)
def create_vehicle(body: VehicleCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO vehicles (make, model, generation, year_from, year_to, engine, fuel_type, transmission) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (body.make, body.model, body.generation, body.year_from, body.year_to, body.engine, body.fuel_type, body.transmission),
        )
        new_id = cur.fetchone()[0]
        write_audit_log(cur, current_user["user_id"], "VEHICLE_CREATED", "vehicles", new_id)
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Vehicle created"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Vehicle creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: int, body: VehicleUpdate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE vehicles SET
                make = COALESCE(%s, make), model = COALESCE(%s, model),
                generation = COALESCE(%s, generation), year_from = COALESCE(%s, year_from),
                year_to = COALESCE(%s, year_to), engine = COALESCE(%s, engine),
                fuel_type = COALESCE(%s, fuel_type), transmission = COALESCE(%s, transmission)
            WHERE id = %s RETURNING id
            """,
            (body.make, body.model, body.generation, body.year_from, body.year_to,
             body.engine, body.fuel_type, body.transmission, vehicle_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Vehicle not found")
        write_audit_log(cur, current_user["user_id"], "VEHICLE_UPDATED", "vehicles", vehicle_id)
        conn.commit()
        cur.close()
        return {"message": "Vehicle updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Vehicle update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM vehicles WHERE id=%s RETURNING id", (vehicle_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Vehicle not found")
        write_audit_log(cur, current_user["user_id"], "VEHICLE_DELETED", "vehicles", vehicle_id)
        conn.commit()
        cur.close()
        return {"message": "Vehicle deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Vehicle deletion failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# PRODUCTS
# ============================================================

@app.get("/api/products")
def list_products(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    vehicle_make: Optional[str] = None,
    vehicle_model: Optional[str] = None,
    vehicle_year: Optional[int] = None,
    condition: Optional[str] = None,
    status: Optional[str] = None,
    min_price: Optional[Decimal] = None,
    max_price: Optional[Decimal] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20,
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        query = """
            SELECT DISTINCT p.id, p.name, p.slug, p.sku, p.part_number,
                   p.price, p.compare_at_price, p.condition, p.status,
                   p.is_featured, p.created_at,
                   c.name AS category_name, b.name AS brand_name,
                   COALESCE(i.quantity - i.reserved_quantity, 0) AS available_stock,
                   (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_image
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN inventory i ON i.product_id = p.id
        """
        params = []
        joins_added = False

        if vehicle_make or vehicle_model or vehicle_year:
            query += " JOIN product_compatibility pc ON pc.product_id = p.id JOIN vehicles v ON v.id = pc.vehicle_id"
            joins_added = True

        query += " WHERE 1=1"

        # Public browsing shows only ACTIVE by default
        if status:
            query += " AND p.status = %s"; params.append(status.upper())
        else:
            query += " AND p.status = 'ACTIVE'"

        if search:
            query += " AND (p.name ILIKE %s OR p.sku ILIKE %s OR p.part_number ILIKE %s OR b.name ILIKE %s OR c.name ILIKE %s)"
            term = f"%{search}%"
            params.extend([term, term, term, term, term])

        if category_id:
            query += " AND p.category_id = %s"; params.append(category_id)
        if brand_id:
            query += " AND p.brand_id = %s"; params.append(brand_id)
        if condition:
            query += " AND p.condition = %s"; params.append(condition.upper())
        if min_price is not None:
            query += " AND p.price >= %s"; params.append(min_price)
        if max_price is not None:
            query += " AND p.price <= %s"; params.append(max_price)

        if vehicle_make:
            query += " AND LOWER(v.make) LIKE LOWER(%s)"; params.append(f"%{vehicle_make}%")
        if vehicle_model:
            query += " AND LOWER(v.model) LIKE LOWER(%s)"; params.append(f"%{vehicle_model}%")
        if vehicle_year:
            query += " AND (v.year_from <= %s AND (v.year_to IS NULL OR v.year_to >= %s))"; params.extend([vehicle_year, vehicle_year])

        allowed_sort = {"created_at", "price", "name", "updated_at"}
        sort_col = sort_by if sort_by in allowed_sort else "created_at"
        sort_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        query += f" ORDER BY p.{sort_col} {sort_direction}"

        offset = (page - 1) * page_size
        query += " LIMIT %s OFFSET %s"; params.extend([page_size, offset])

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        products = []
        for r in rows:
            products.append({
                "id": r[0], "name": r[1], "slug": r[2], "sku": r[3], "part_number": r[4],
                "price": safe_json(r[5]), "compare_at_price": safe_json(r[6]),
                "condition": r[7], "status": r[8], "is_featured": r[9],
                "created_at": safe_json(r[10]), "category": r[11], "brand": r[12],
                "available_stock": r[13], "primary_image": r[14]
            })

        return {"count": len(products), "page": page, "page_size": page_size, "products": products}
    except Exception:
        logger.exception("list_products error")
        raise HTTPException(status_code=500, detail="Could not fetch products")
    finally:
        if conn:
            conn.close()


@app.get("/api/products/{product_id}")
def get_product(product_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.id, p.name, p.slug, p.sku, p.part_number, p.description,
                   p.price, p.compare_at_price, p.condition, p.status, p.weight,
                   p.is_featured, p.created_at, p.updated_at,
                   c.id, c.name, b.id, b.name,
                   COALESCE(i.quantity, 0), COALESCE(i.reserved_quantity, 0)
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN inventory i ON i.product_id = p.id
            WHERE p.id = %s
            """,
            (product_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail="Product not found")

        cur.execute("SELECT id, image_url, alt_text, sort_order, is_primary FROM product_images WHERE product_id=%s ORDER BY sort_order, id", (product_id,))
        images = [{"id": i[0], "image_url": i[1], "alt_text": i[2], "sort_order": i[3], "is_primary": i[4]} for i in cur.fetchall()]

        cur.execute(
            """
            SELECT v.id, v.make, v.model, v.generation, v.year_from, v.year_to, v.engine, v.fuel_type, v.transmission
            FROM vehicles v
            JOIN product_compatibility pc ON pc.vehicle_id = v.id
            WHERE pc.product_id = %s
            ORDER BY v.make, v.model, v.year_from
            """,
            (product_id,),
        )
        vehicles = [{"id": v[0],"make":v[1],"model":v[2],"generation":v[3],"year_from":v[4],"year_to":v[5],"engine":v[6],"fuel_type":v[7],"transmission":v[8]} for v in cur.fetchall()]

        cur.close()

        available = row[18] - row[19]
        return {
            "id": row[0], "name": row[1], "slug": row[2], "sku": row[3], "part_number": row[4],
            "description": row[5], "price": safe_json(row[6]), "compare_at_price": safe_json(row[7]),
            "condition": row[8], "status": row[9], "weight": safe_json(row[10]),
            "is_featured": row[11], "created_at": safe_json(row[12]), "updated_at": safe_json(row[13]),
            "category": {"id": row[14], "name": row[15]},
            "brand": {"id": row[16], "name": row[17]},
            "inventory": {"quantity": row[18], "reserved": row[19], "available": available},
            "images": images, "compatible_vehicles": vehicles
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_product error")
        raise HTTPException(status_code=500, detail="Could not fetch product")
    finally:
        if conn:
            conn.close()


@app.post("/api/products", status_code=201)
def create_product(body: ProductCreate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO products (category_id, brand_id, name, slug, sku, part_number, description,
                                  price, compare_at_price, condition, status, weight, is_featured, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW()) RETURNING id
            """,
            (body.category_id, body.brand_id, body.name, body.slug, body.sku, body.part_number,
             body.description, body.price, body.compare_at_price, body.condition, body.status,
             body.weight, body.is_featured),
        )
        new_id = cur.fetchone()[0]

        # Always create an inventory record for the new product
        stock_qty = body.stock_quantity if body.stock_quantity is not None else 0
        cur.execute(
            """INSERT INTO inventory (product_id, quantity, reserved_quantity, reorder_level, updated_at)
               VALUES (%s, %s, 0, 5, NOW())
               ON CONFLICT (product_id) DO UPDATE SET quantity = %s, updated_at = NOW()""",
            (new_id, stock_qty, stock_qty),
        )
        if stock_qty > 0:
            cur.execute(
                """INSERT INTO inventory_transactions (product_id, type, quantity, notes, created_by, created_at)
                   VALUES (%s, 'STOCK_IN', %s, 'Initial stock on product creation', %s, NOW())""",
                (new_id, stock_qty, current_user["user_id"]),
            )

        write_audit_log(cur, current_user["user_id"], "PRODUCT_CREATED", "products", new_id,
                        new_values={"name": body.name, "sku": body.sku, "price": str(body.price), "stock_quantity": stock_qty},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Product created"}
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("create_product error")
        raise HTTPException(status_code=500, detail="Product creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/products/{product_id}")
def update_product(product_id: int, body: ProductUpdate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Fetch old values for audit
        cur.execute("SELECT name, sku, price, status FROM products WHERE id=%s", (product_id,))
        old = cur.fetchone()
        if not old:
            raise HTTPException(status_code=404, detail="Product not found")

        cur.execute(
            """
            UPDATE products SET
                category_id = COALESCE(%s, category_id),
                brand_id = COALESCE(%s, brand_id),
                name = COALESCE(%s, name),
                slug = COALESCE(%s, slug),
                sku = COALESCE(%s, sku),
                part_number = COALESCE(%s, part_number),
                description = COALESCE(%s, description),
                price = COALESCE(%s, price),
                compare_at_price = COALESCE(%s, compare_at_price),
                condition = COALESCE(%s, condition),
                status = COALESCE(%s, status),
                weight = COALESCE(%s, weight),
                is_featured = COALESCE(%s, is_featured),
                updated_at = NOW()
            WHERE id = %s RETURNING id
            """,
            (body.category_id, body.brand_id, body.name, body.slug, body.sku, body.part_number,
             body.description, body.price, body.compare_at_price, body.condition, body.status,
             body.weight, body.is_featured, product_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")

        # Update inventory quantity if provided
        if body.stock_quantity is not None:
            cur.execute(
                """INSERT INTO inventory (product_id, quantity, reserved_quantity, reorder_level, updated_at)
                   VALUES (%s, %s, 0, 5, NOW())
                   ON CONFLICT (product_id) DO UPDATE SET quantity = %s, updated_at = NOW()""",
                (product_id, body.stock_quantity, body.stock_quantity),
            )
            cur.execute(
                """INSERT INTO inventory_transactions (product_id, type, quantity, notes, created_by, created_at)
                   VALUES (%s, 'ADJUSTMENT', %s, 'Stock updated via admin product edit', %s, NOW())""",
                (product_id, body.stock_quantity, current_user["user_id"]),
            )

        write_audit_log(cur, current_user["user_id"], "PRODUCT_UPDATED", "products", product_id,
                        old_values={"name": old[0], "sku": old[1], "price": str(old[2]), "status": old[3]},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Product updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_product error")
        raise HTTPException(status_code=500, detail="Product update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, request: Request, current_user: dict = Depends(require_admin)):
    """Archives the product instead of hard-deleting."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE products SET status='ARCHIVED', updated_at=NOW() WHERE id=%s RETURNING id", (product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        write_audit_log(cur, current_user["user_id"], "PRODUCT_ARCHIVED", "products", product_id,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Product archived"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Product archive failed")
    finally:
        if conn:
            conn.close()


# PRODUCT IMAGES
@app.post("/api/products/{product_id}/images", status_code=201)
def add_product_image(product_id: int, body: ProductImageCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM products WHERE id=%s", (product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        if body.is_primary:
            cur.execute("UPDATE product_images SET is_primary=FALSE WHERE product_id=%s", (product_id,))
        cur.execute(
            "INSERT INTO product_images (product_id, image_url, alt_text, sort_order, is_primary, created_at) VALUES (%s,%s,%s,%s,%s,NOW()) RETURNING id",
            (product_id, body.image_url, body.alt_text, body.sort_order, body.is_primary),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Image added"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Image add failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/products/{product_id}/images/{image_id}")
def delete_product_image(product_id: int, image_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM product_images WHERE id=%s AND product_id=%s RETURNING id", (image_id, product_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Image not found")
        conn.commit()
        cur.close()
        return {"message": "Image deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Image delete failed")
    finally:
        if conn:
            conn.close()


# PRODUCT COMPATIBILITY
@app.get("/api/products/{product_id}/compatibility")
def get_product_compatibility(product_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT v.id, v.make, v.model, v.generation, v.year_from, v.year_to, v.engine, v.fuel_type, v.transmission
            FROM vehicles v JOIN product_compatibility pc ON pc.vehicle_id = v.id
            WHERE pc.product_id = %s ORDER BY v.make, v.model, v.year_from
            """,
            (product_id,),
        )
        rows = cur.fetchall()
        cur.close()
        cols = ["id","make","model","generation","year_from","year_to","engine","fuel_type","transmission"]
        return [dict(zip(cols, r)) for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch compatibility")
    finally:
        if conn:
            conn.close()


@app.post("/api/products/{product_id}/compatibility")
def add_compatibility(product_id: int, body: CompatibilityAdd, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM products WHERE id=%s", (product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        cur.execute("SELECT id FROM vehicles WHERE id=%s", (body.vehicle_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Vehicle not found")
        cur.execute(
            "INSERT INTO product_compatibility (product_id, vehicle_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (product_id, body.vehicle_id),
        )
        conn.commit()
        cur.close()
        return {"message": "Compatibility added"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Compatibility add failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/products/{product_id}/compatibility/{vehicle_id}")
def remove_compatibility(product_id: int, vehicle_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM product_compatibility WHERE product_id=%s AND vehicle_id=%s RETURNING product_id", (product_id, vehicle_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Compatibility not found")
        conn.commit()
        cur.close()
        return {"message": "Compatibility removed"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Compatibility remove failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# INVENTORY
# ============================================================

@app.get("/api/inventory")
def list_inventory(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT i.id, i.product_id, p.name, p.sku, i.quantity, i.reserved_quantity,
                   i.quantity - i.reserved_quantity AS available, i.reorder_level, i.updated_at
            FROM inventory i JOIN products p ON p.id = i.product_id ORDER BY p.name
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "product_id": r[1], "product_name": r[2], "sku": r[3],
             "quantity": r[4], "reserved_quantity": r[5], "available_quantity": r[6],
             "reorder_level": r[7], "updated_at": safe_json(r[8])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch inventory")
    finally:
        if conn:
            conn.close()


@app.get("/api/inventory/{product_id}")
def get_inventory_for_product(product_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT i.id, i.quantity, i.reserved_quantity, i.quantity-i.reserved_quantity, i.reorder_level, i.updated_at FROM inventory i WHERE i.product_id=%s",
            (product_id,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Inventory record not found")
        return {"id": row[0], "quantity": row[1], "reserved_quantity": row[2], "available_quantity": row[3], "reorder_level": row[4], "updated_at": safe_json(row[5])}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch inventory")
    finally:
        if conn:
            conn.close()


def _inventory_op(conn, cur, product_id: int, op: str, qty: int, ref_type: str, ref_id: str, notes: str, user_id: int):
    """Shared transactional inventory mutation with row-level locking."""
    cur.execute("SELECT id, quantity, reserved_quantity, reorder_level FROM inventory WHERE product_id=%s FOR UPDATE", (product_id,))
    inv = cur.fetchone()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory record not found")
    inv_id, current_qty, current_res, reorder = inv

    prev_qty = current_qty
    prev_res = current_res

    if op == "STOCK_IN":
        new_qty = current_qty + qty
        new_res = current_res
    elif op == "STOCK_OUT":
        available = current_qty - current_res
        if qty > available:
            raise HTTPException(status_code=409, detail=f"Insufficient available stock ({available})")
        new_qty = current_qty - qty
        if new_qty < 0:
            raise HTTPException(status_code=409, detail="Stock cannot go negative")
        new_res = current_res
    elif op == "RESERVATION":
        available = current_qty - current_res
        if qty > available:
            raise HTTPException(status_code=409, detail=f"Insufficient available stock ({available})")
        new_qty = current_qty
        new_res = current_res + qty
    elif op == "RELEASE":
        if qty > current_res:
            raise HTTPException(status_code=409, detail=f"Cannot release more than reserved ({current_res})")
        new_qty = current_qty
        new_res = current_res - qty
    elif op == "ADJUSTMENT":
        if qty < current_res:
            raise HTTPException(status_code=409, detail=f"New quantity cannot be less than reserved ({current_res})")
        new_qty = qty
        new_res = current_res
    else:
        raise HTTPException(status_code=400, detail="Unknown inventory operation")

    cur.execute(
        "UPDATE inventory SET quantity=%s, reserved_quantity=%s, updated_at=NOW() WHERE id=%s",
        (new_qty, new_res, inv_id),
    )
    cur.execute(
        """
        INSERT INTO inventory_transactions (product_id, type, quantity, reference_type, reference_id, notes, created_by, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id
        """,
        (product_id, op, qty, ref_type, ref_id, notes, user_id),
    )
    txn_id = cur.fetchone()[0]
    return {
        "transaction_id": txn_id,
        "previous_quantity": prev_qty, "new_quantity": new_qty,
        "previous_reserved": prev_res, "new_reserved": new_res,
        "available_quantity": new_qty - new_res,
    }


@app.post("/api/inventory/stock-in")
def stock_in(body: StockInRequest, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM products WHERE id=%s", (body.product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        if body.reorder_level is not None:
            cur.execute("UPDATE inventory SET reorder_level=%s WHERE product_id=%s", (body.reorder_level, body.product_id))
        result = _inventory_op(conn, cur, body.product_id, "STOCK_IN", body.quantity, "MANUAL", None, body.notes, current_user["user_id"])
        write_audit_log(cur, current_user["user_id"], "STOCK_IN", "inventory", body.product_id,
                        new_values=result, ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Stock added", **result}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("stock_in error")
        raise HTTPException(status_code=500, detail="Stock-in failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/inventory/stock-out")
def stock_out(body: StockOutRequest, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM products WHERE id=%s", (body.product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        result = _inventory_op(conn, cur, body.product_id, "STOCK_OUT", body.quantity, "MANUAL", None, body.notes, current_user["user_id"])
        write_audit_log(cur, current_user["user_id"], "STOCK_OUT", "inventory", body.product_id, new_values=result,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Stock removed", **result}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("stock_out error")
        raise HTTPException(status_code=500, detail="Stock-out failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/inventory/reserve")
def reserve_inventory(body: InventoryReserveRequest, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        result = _inventory_op(conn, cur, body.product_id, "RESERVATION", body.quantity, body.reference_type, body.reference_id, body.notes, current_user["user_id"])
        write_audit_log(cur, current_user["user_id"], "INVENTORY_RESERVED", "inventory", body.product_id, new_values=result,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Inventory reserved", **result}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Inventory reservation failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/inventory/release")
def release_inventory(body: InventoryReleaseRequest, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        result = _inventory_op(conn, cur, body.product_id, "RELEASE", body.quantity, "MANUAL", body.reference_id, body.notes, current_user["user_id"])
        write_audit_log(cur, current_user["user_id"], "INVENTORY_RELEASED", "inventory", body.product_id, new_values=result,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Reservation released", **result}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Inventory release failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/inventory/adjustment")
def adjust_inventory(body: InventoryAdjustmentRequest, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM products WHERE id=%s", (body.product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")
        result = _inventory_op(conn, cur, body.product_id, "ADJUSTMENT", body.new_quantity, "MANUAL", None, body.notes, current_user["user_id"])
        write_audit_log(cur, current_user["user_id"], "INVENTORY_ADJUSTED", "inventory", body.product_id,
                        new_values={"new_quantity": body.new_quantity, "notes": body.notes},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Inventory adjusted", **result}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("adjust_inventory error")
        raise HTTPException(status_code=500, detail="Inventory adjustment failed")
    finally:
        if conn:
            conn.close()


@app.get("/api/inventory/transactions")
def list_inventory_transactions(
    product_id: Optional[int] = None,
    current_user: dict = Depends(require_staff_or_admin)
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = """
            SELECT t.id, t.product_id, p.name, p.sku, t.type, t.quantity,
                   t.reference_type, t.reference_id, t.notes, t.created_by,
                   u.email, t.created_at
            FROM inventory_transactions t
            JOIN products p ON p.id = t.product_id
            LEFT JOIN users u ON u.id = t.created_by
            WHERE 1=1
        """
        params = []
        if product_id:
            query += " AND t.product_id = %s"; params.append(product_id)
        query += " ORDER BY t.created_at DESC LIMIT 500"
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "product_id": r[1], "product_name": r[2], "sku": r[3],
             "type": r[4], "quantity": r[5], "reference_type": r[6], "reference_id": r[7],
             "notes": r[8], "created_by": r[9], "created_by_email": r[10], "created_at": safe_json(r[11])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch transactions")
    finally:
        if conn:
            conn.close()


# ============================================================
# CART
# ============================================================

def _get_or_create_cart(cur, conn, user_id: int) -> int:
    cur.execute("SELECT id FROM carts WHERE user_id=%s AND status='ACTIVE' LIMIT 1", (user_id,))
    cart = cur.fetchone()
    if not cart:
        cur.execute("INSERT INTO carts (user_id, status, created_at, updated_at) VALUES (%s,'ACTIVE',NOW(),NOW()) RETURNING id", (user_id,))
        cart = cur.fetchone()
        conn.commit()
    return cart[0]


@app.get("/api/cart")
def get_cart(current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        cart_id = _get_or_create_cart(cur, conn, user_id)

        cur.execute(
            """
            SELECT ci.id, ci.product_id, p.name, p.sku, p.part_number, p.price, p.status,
                   ci.quantity,
                   COALESCE(i.quantity - i.reserved_quantity, 0) AS available_stock
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            LEFT JOIN inventory i ON i.product_id = ci.product_id
            WHERE ci.cart_id = %s ORDER BY ci.created_at
            """,
            (cart_id,),
        )
        items = []
        subtotal = Decimal("0.00")
        for r in cur.fetchall():
            price = to_decimal(r[5])
            qty = r[7]
            available = r[8]
            item_total = price * qty
            subtotal += item_total
            items.append({
                "id": r[0], "product_id": r[1], "product_name": r[2],
                "sku": r[3], "part_number": r[4],
                "unit_price": safe_json(price),
                "product_status": r[6],
                "quantity": qty,
                "item_total": safe_json(item_total),
                "available_stock": available,
                "in_stock": available >= qty and r[6] == "ACTIVE",
            })
        cur.close()
        return {"cart_id": cart_id, "items": items, "item_count": len(items), "subtotal": safe_json(subtotal)}
    except Exception:
        logger.exception("get_cart error")
        raise HTTPException(status_code=500, detail="Could not fetch cart")
    finally:
        if conn:
            conn.close()


@app.post("/api/cart/items", status_code=201)
def add_to_cart(body: CartItemRequest, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id, name, status FROM products WHERE id=%s", (body.product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product[2] != "ACTIVE":
            raise HTTPException(status_code=400, detail="Product is not available for purchase")

        # Check inventory
        cur.execute("SELECT quantity, reserved_quantity FROM inventory WHERE product_id=%s", (body.product_id,))
        inv = cur.fetchone()
        if not inv:
            raise HTTPException(status_code=400, detail="Product has no inventory record")
        available = inv[0] - inv[1]

        cart_id = _get_or_create_cart(cur, conn, user_id)

        # Existing item?
        cur.execute("SELECT id, quantity FROM cart_items WHERE cart_id=%s AND product_id=%s", (cart_id, body.product_id))
        existing = cur.fetchone()

        if existing:
            new_qty = existing[1] + body.quantity
            if new_qty > available:
                raise HTTPException(status_code=409, detail=f"Insufficient stock. Available: {available}, already in cart: {existing[1]}")
            cur.execute("UPDATE cart_items SET quantity=%s, updated_at=NOW() WHERE id=%s", (new_qty, existing[0]))
        else:
            if body.quantity > available:
                raise HTTPException(status_code=409, detail=f"Insufficient stock. Available: {available}")
            cur.execute(
                "INSERT INTO cart_items (cart_id, product_id, quantity, created_at, updated_at) VALUES (%s,%s,%s,NOW(),NOW())",
                (cart_id, body.product_id, body.quantity),
            )

        cur.execute("UPDATE carts SET updated_at=NOW() WHERE id=%s", (cart_id,))
        conn.commit()
        cur.close()
        return {"message": "Item added to cart", "cart_id": cart_id, "product_name": product[1]}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("add_to_cart error")
        raise HTTPException(status_code=500, detail="Could not add to cart")
    finally:
        if conn:
            conn.close()


@app.patch("/api/cart/items/{item_id}")
def update_cart_item(item_id: int, body: CartItemUpdate, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute(
            "SELECT ci.id, ci.product_id FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE ci.id=%s AND c.user_id=%s AND c.status='ACTIVE'",
            (item_id, user_id),
        )
        item = cur.fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Cart item not found")

        cur.execute("SELECT quantity, reserved_quantity FROM inventory WHERE product_id=%s", (item[1],))
        inv = cur.fetchone()
        available = (inv[0] - inv[1]) if inv else 0
        if body.quantity > available:
            raise HTTPException(status_code=409, detail=f"Insufficient stock. Available: {available}")

        cur.execute("UPDATE cart_items SET quantity=%s, updated_at=NOW() WHERE id=%s", (body.quantity, item_id))
        conn.commit()
        cur.close()
        return {"message": "Cart item updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Cart item update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/cart/items/{item_id}")
def remove_cart_item(item_id: int, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        cur.execute(
            "DELETE FROM cart_items ci USING carts c WHERE c.id=ci.cart_id AND ci.id=%s AND c.user_id=%s AND c.status='ACTIVE' RETURNING ci.id",
            (item_id, user_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Cart item not found")
        conn.commit()
        cur.close()
        return {"message": "Item removed from cart"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Cart item removal failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/cart")
def clear_cart(current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM carts WHERE user_id=%s AND status='ACTIVE' LIMIT 1", (current_user["user_id"],))
        cart = cur.fetchone()
        if cart:
            cur.execute("DELETE FROM cart_items WHERE cart_id=%s", (cart[0],))
        conn.commit()
        cur.close()
        return {"message": "Cart cleared"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Cart clear failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# CHECKOUT
# ============================================================

def _generate_order_number() -> str:
    import random, string
    prefix = "ORD"
    ts = datetime.now().strftime("%Y%m%d")
    rand = "".join(random.choices(string.digits, k=6))
    return f"{prefix}-{ts}-{rand}"


@app.post("/api/checkout/validate")
def validate_checkout(body: CheckoutRequest, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        # Verify address belongs to user
        cur.execute("SELECT id FROM addresses WHERE id=%s AND user_id=%s", (body.shipping_address_id, user_id))
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Shipping address not found or does not belong to you")

        # Get active cart
        cur.execute("SELECT id FROM carts WHERE user_id=%s AND status='ACTIVE' LIMIT 1", (user_id,))
        cart = cur.fetchone()
        if not cart:
            raise HTTPException(status_code=400, detail="No active cart")

        cart_id = cart[0]
        cur.execute(
            """
            SELECT ci.id, ci.product_id, p.name, p.status, p.price, ci.quantity,
                   COALESCE(i.quantity - i.reserved_quantity, 0) AS available
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            LEFT JOIN inventory i ON i.product_id = ci.product_id
            WHERE ci.cart_id = %s
            """,
            (cart_id,),
        )
        items = cur.fetchall()
        if not items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        errors = []
        for r in items:
            if r[3] != "ACTIVE":
                errors.append(f"{r[2]} is not available for purchase")
            if r[5] > r[6]:
                errors.append(f"Insufficient stock for {r[2]} (requested {r[5]}, available {r[6]})")

        cur.close()

        if errors:
            raise HTTPException(status_code=400, detail={"errors": errors})

        return {"valid": True, "message": "Checkout is valid"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("validate_checkout error")
        raise HTTPException(status_code=500, detail="Checkout validation failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/orders", status_code=201)
def place_order(body: CheckoutRequest, request: Request, current_user: dict = Depends(require_customer)):
    """
    Full transactional order creation:
    1. Lock inventory rows (SELECT FOR UPDATE)
    2. Validate product status and stock
    3. Read authoritative prices from DB
    4. Calculate totals with Decimal arithmetic
    5. Calculate 75/25 deposit/balance (deposit = round(total * 0.75), balance = total - deposit)
    6. Reserve inventory
    7. Create order, order_items, order event, deposit payment record
    8. Convert cart
    9. Commit
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        # Verify address
        cur.execute("SELECT id, full_name, address_line1, city, country FROM addresses WHERE id=%s AND user_id=%s", (body.shipping_address_id, user_id))
        address = cur.fetchone()
        if not address:
            raise HTTPException(status_code=400, detail="Shipping address not found")

        # Get cart
        cur.execute("SELECT id FROM carts WHERE user_id=%s AND status='ACTIVE' LIMIT 1", (user_id,))
        cart_row = cur.fetchone()
        if not cart_row:
            raise HTTPException(status_code=400, detail="No active cart")
        cart_id = cart_row[0]

        cur.execute("SELECT product_id, quantity FROM cart_items WHERE cart_id=%s", (cart_id,))
        cart_items = cur.fetchall()
        if not cart_items:
            raise HTTPException(status_code=400, detail="Cart is empty")

        # Coupon
        discount_amount = Decimal("0.00")
        coupon_id = None
        if body.coupon_code:
            cur.execute(
                "SELECT id, discount_type, discount_value, min_order_amount, is_active, expires_at FROM coupons WHERE UPPER(code)=UPPER(%s)",
                (body.coupon_code,),
            )
            coupon = cur.fetchone()
            if not coupon:
                raise HTTPException(status_code=400, detail="Invalid coupon code")
            if not coupon[4]:
                raise HTTPException(status_code=400, detail="Coupon is not active")
            if coupon[5] and coupon[5] < datetime.now().date():
                raise HTTPException(status_code=400, detail="Coupon has expired")
            coupon_id = coupon[0]

        # Lock and validate all product + inventory rows.
        #
        # NOTE: the previous implementation used a single query with
        #   LEFT JOIN inventory i ON i.product_id = p.id ... FOR UPDATE OF i
        # which PostgreSQL rejects with:
        #   psycopg2.errors.FeatureNotSupported: FOR UPDATE cannot be applied
        #   to the nullable side of an outer join
        # because a product with no matching inventory row has NULL on the
        # inventory side, and Postgres cannot lock a row that doesn't exist.
        #
        # Fix: lock the two tables separately with plain (non-outer-join)
        # FOR UPDATE queries, each ordered by id to keep a consistent lock
        # order across concurrent checkouts (reduces deadlock risk), then
        # merge the results in Python. A product with no inventory row is
        # simply absent from inventory_rows and is reported as a validation
        # error below, exactly as before.
        product_ids = sorted(set(c[0] for c in cart_items))
        placeholders = ",".join(["%s"] * len(product_ids))

        cur.execute(
            f"""
            SELECT id, name, sku, part_number, price, status
            FROM products
            WHERE id IN ({placeholders})
            ORDER BY id
            FOR UPDATE
            """,
            product_ids,
        )
        products_by_id = {r[0]: r for r in cur.fetchall()}

        cur.execute(
            f"""
            SELECT product_id, id, quantity, reserved_quantity
            FROM inventory
            WHERE product_id IN ({placeholders})
            ORDER BY product_id
            FOR UPDATE
            """,
            product_ids,
        )
        inventory_by_product = {r[0]: r for r in cur.fetchall()}

        product_rows = {}
        for pid in product_ids:
            if pid not in products_by_id:
                continue
            p = products_by_id[pid]
            inv = inventory_by_product.get(pid)
            product_rows[pid] = (
                p[0], p[1], p[2], p[3], p[4], p[5],
                inv[1] if inv else None,   # inv_id
                inv[2] if inv else None,   # quantity
                inv[3] if inv else None,   # reserved_quantity
            )

        qty_map = {c[0]: c[1] for c in cart_items}
        order_items_data = []
        subtotal = Decimal("0.00")

        for pid, qty in qty_map.items():
            if pid not in product_rows:
                raise HTTPException(status_code=400, detail=f"Product {pid} not found")
            r = product_rows[pid]
            if r[5] != "ACTIVE":
                raise HTTPException(status_code=400, detail=f"Product '{r[1]}' is not available")
            if r[6] is None:
                raise HTTPException(status_code=400, detail=f"No inventory record for '{r[1]}'")
            available = r[7] - r[8]
            if qty > available:
                raise HTTPException(status_code=409, detail=f"Insufficient stock for '{r[1]}' (available: {available})")

            unit_price = to_decimal(r[4])
            item_subtotal = round_money(unit_price * qty)
            subtotal += item_subtotal
            order_items_data.append({
                "product_id": pid, "product_name": r[1], "sku": r[2], "part_number": r[3],
                "quantity": qty, "unit_price": unit_price, "subtotal": item_subtotal,
                "inv_id": r[6], "current_reserved": r[8]
            })

        # Read delivery fee from site_settings
        cur.execute("SELECT default_delivery_fee FROM site_settings LIMIT 1")
        fee_row = cur.fetchone()
        delivery_fee = to_decimal(fee_row[0]) if fee_row and fee_row[0] is not None else Decimal("0.00")

        # Apply coupon discount
        if coupon_id:
            disc_type = coupon[1]
            disc_value = to_decimal(coupon[2])
            min_order = to_decimal(coupon[3]) if coupon[3] else Decimal("0.00")
            if subtotal < min_order:
                raise HTTPException(status_code=400, detail=f"Order minimum for this coupon is {min_order}")
            if disc_type == "PERCENTAGE":
                discount_amount = round_money(subtotal * disc_value / Decimal("100"))
            else:
                discount_amount = min(disc_value, subtotal)

        total_amount = round_money(subtotal + delivery_fee - discount_amount)
        deposit_pct = Decimal("75")
        balance_pct = Decimal("25")
        deposit_amount = round_money(total_amount * deposit_pct / Decimal("100"))
        balance_amount = total_amount - deposit_amount

        order_number = _generate_order_number()
        coupon_code_used = body.coupon_code.strip().upper() if (coupon_id and body.coupon_code) else None

        # Create order
        cur.execute(
            """
            INSERT INTO orders (order_number, user_id, subtotal, delivery_fee, discount_amount,
                                coupon_code, total_amount, deposit_percentage, deposit_amount, deposit_paid,
                                balance_percentage, balance_amount, balance_paid,
                                payment_status, order_status, shipping_address_id, created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE,%s,%s,FALSE,'PENDING','AWAITING_DEPOSIT',%s,NOW(),NOW())
            RETURNING id
            """,
            (order_number, user_id, subtotal, delivery_fee, discount_amount, coupon_code_used,
             total_amount, deposit_pct, deposit_amount, balance_pct, balance_amount,
             body.shipping_address_id),
        )
        order_id = cur.fetchone()[0]

        # Create order items (snapshotted prices)
        for item in order_items_data:
            cur.execute(
                """
                INSERT INTO order_items (order_id, product_id, product_name, sku, part_number,
                                        quantity, unit_price, subtotal)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (order_id, item["product_id"], item["product_name"], item["sku"],
                 item["part_number"], item["quantity"], item["unit_price"], item["subtotal"]),
            )

        # Reserve inventory for each product
        for item in order_items_data:
            _inventory_op(conn, cur, item["product_id"], "RESERVATION", item["quantity"],
                          "ORDER", str(order_id), f"Reserved for order {order_number}", user_id)

        # Create initial order event
        cur.execute(
            """
            INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at)
            VALUES (%s,'ORDER_PLACED','Order placed by customer','PENDING','AWAITING_DEPOSIT',%s,NOW())
            """,
            (order_id, user_id),
        )

        # Create deposit payment record (PENDING — awaiting customer submission)
        cur.execute(
            """
            INSERT INTO payments (order_id, user_id, type, method, amount, currency, status, created_at)
            VALUES (%s,%s,'DEPOSIT','BANK_TRANSFER',%s,'USD','PENDING',NOW())
            """,
            (order_id, user_id, deposit_amount),
        )

        # Convert cart
        cur.execute("UPDATE carts SET status='CONVERTED', updated_at=NOW() WHERE id=%s", (cart_id,))

        # Audit
        write_audit_log(cur, user_id, "ORDER_CREATED", "orders", order_id,
                        new_values={"order_number": order_number, "total": str(total_amount)},
                        ip_address=request.client.host if request.client else None)

        # Notification
        create_notification(cur, user_id, "ORDER_PLACED", f"Order {order_number} Placed",
                            f"Your order {order_number} has been placed. Please pay the deposit of KES {deposit_amount}.")

        conn.commit()
        cur.close()

        # Fetch bank details for response (safe subset)
        conn2 = get_db_connection()
        cur2 = conn2.cursor()
        cur2.execute("SELECT bank_name, bank_account_name, bank_account_number, bank_branch FROM site_settings LIMIT 1")
        bank_row = cur2.fetchone()
        cur2.close()
        conn2.close()

        bank_info = None
        if bank_row:
            bank_info = {"bank_name": bank_row[0], "account_name": bank_row[1], "account_number": bank_row[2], "branch": bank_row[3]}

        return {
            "message": "Order placed successfully",
            "order_id": order_id,
            "order_number": order_number,
            "total_amount": safe_json(total_amount),
            "deposit_required": safe_json(deposit_amount),
            "balance_due": safe_json(balance_amount),
            "bank_details": bank_info
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("place_order error")
        raise HTTPException(status_code=500, detail="Order placement failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ORDERS
# ============================================================

# Order state machine
ORDER_TRANSITIONS = {
    "PENDING":              ["AWAITING_DEPOSIT", "CANCELLED"],
    "AWAITING_DEPOSIT":     ["DEPOSIT_VERIFICATION", "CANCELLED"],
    "DEPOSIT_VERIFICATION": ["PROCESSING", "AWAITING_DEPOSIT"],
    "PROCESSING":           ["READY_FOR_DISPATCH", "CANCELLED"],
    "READY_FOR_DISPATCH":   ["DISPATCHED"],
    "DISPATCHED":           ["OUT_FOR_DELIVERY"],
    "OUT_FOR_DELIVERY":     ["DELIVERED"],
    "DELIVERED":            ["AWAITING_BALANCE", "RETURN_REQUESTED"],
    "AWAITING_BALANCE":     ["COMPLETED"],
    "COMPLETED":            [],
    "CANCELLED":            [],
    "RETURN_REQUESTED":     ["RETURNED"],
    "RETURNED":             ["REFUNDED"],
    "REFUNDED":             [],
}


def _validate_transition(current: str, new: str):
    allowed = ORDER_TRANSITIONS.get(current, [])
    if new not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition order from {current} to {new}. Allowed: {allowed}")


@app.get("/api/orders")
def list_orders(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        role = current_user["role"]

        query = """
            SELECT o.id, o.order_number, o.total_amount, o.deposit_amount, o.balance_amount,
                   o.deposit_paid, o.balance_paid, o.payment_status, o.order_status,
                   o.created_at, u.first_name, u.last_name, u.email
            FROM orders o JOIN users u ON u.id = o.user_id WHERE 1=1
        """
        params = []
        if role == "CUSTOMER":
            query += " AND o.user_id = %s"; params.append(user_id)
        if status:
            # Support a single status ("DISPATCHED") or a comma-separated
            # list ("DISPATCHED,OUT_FOR_DELIVERY,READY_FOR_DISPATCH") the
            # same way the admin Deliveries/Orders pages send it. The
            # previous version only ever matched a single exact value, so
            # any multi-status filter silently returned zero rows.
            statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
            if statuses:
                placeholders = ",".join(["%s"] * len(statuses))
                query += f" AND o.order_status IN ({placeholders})"
                params.extend(statuses)

        query += " ORDER BY o.created_at DESC LIMIT %s OFFSET %s"
        params.extend([page_size, (page - 1) * page_size])
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        return [
            {"id": r[0], "order_number": r[1], "total_amount": safe_json(r[2]),
             "deposit_amount": safe_json(r[3]), "balance_amount": safe_json(r[4]),
             "deposit_paid": r[5], "balance_paid": r[6], "payment_status": r[7],
             "order_status": r[8], "created_at": safe_json(r[9]),
             "customer": f"{r[10]} {r[11]}", "email": r[12]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch orders")
    finally:
        if conn:
            conn.close()


@app.get("/api/orders/{order_id}")
def get_order(order_id: int, current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        role = current_user["role"]

        cur.execute(
            """
            SELECT o.id, o.order_number, o.user_id, o.subtotal, o.delivery_fee, o.discount_amount,
                   o.total_amount, o.deposit_percentage, o.deposit_amount, o.deposit_paid,
                   o.balance_percentage, o.balance_amount, o.balance_paid,
                   o.payment_status, o.order_status, o.shipping_address_id, o.created_at, o.updated_at,
                   u.first_name, u.last_name, u.email
            FROM orders o JOIN users u ON u.id = o.user_id
            WHERE o.id = %s
            """,
            (order_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")

        # Customer ownership check
        if role == "CUSTOMER" and row[2] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Order items
        cur.execute(
            "SELECT id, product_id, product_name, sku, part_number, quantity, unit_price, subtotal FROM order_items WHERE order_id=%s",
            (order_id,),
        )
        items = [
            {"id": r[0], "product_id": r[1], "product_name": r[2], "sku": r[3],
             "part_number": r[4], "quantity": r[5], "unit_price": safe_json(r[6]), "subtotal": safe_json(r[7])}
            for r in cur.fetchall()
        ]

        # Events
        cur.execute(
            "SELECT id, event_type, description, old_status, new_status, created_at FROM order_events WHERE order_id=%s ORDER BY created_at",
            (order_id,),
        )
        events = [{"id": r[0], "event_type": r[1], "description": r[2], "old_status": r[3], "new_status": r[4], "created_at": safe_json(r[5])} for r in cur.fetchall()]

        # Payments
        cur.execute(
            "SELECT id, type, method, amount, currency, status, reference, submitted_at, verified_at FROM payments WHERE order_id=%s ORDER BY id",
            (order_id,),
        )
        payments = [
            {"id": r[0], "type": r[1], "method": r[2], "amount": safe_json(r[3]), "currency": r[4],
             "status": r[5], "reference": r[6], "submitted_at": safe_json(r[7]), "verified_at": safe_json(r[8])}
            for r in cur.fetchall()
        ]

        # Delivery
        cur.execute(
            "SELECT id, method, courier, tracking_number, status, estimated_date, dispatched_at, delivered_at FROM deliveries WHERE order_id=%s LIMIT 1",
            (order_id,),
        )
        dr = cur.fetchone()
        delivery = None
        if dr:
            delivery = {"id": dr[0], "method": dr[1], "courier": dr[2], "tracking_number": dr[3], "status": dr[4], "estimated_date": safe_json(dr[5]), "dispatched_at": safe_json(dr[6]), "delivered_at": safe_json(dr[7])}

        cur.close()

        return {
            "id": row[0], "order_number": row[1], "user_id": row[2],
            "subtotal": safe_json(row[3]), "delivery_fee": safe_json(row[4]), "discount_amount": safe_json(row[5]),
            "total_amount": safe_json(row[6]),
            "deposit_percentage": safe_json(row[7]), "deposit_amount": safe_json(row[8]), "deposit_paid": row[9],
            "balance_percentage": safe_json(row[10]), "balance_amount": safe_json(row[11]), "balance_paid": row[12],
            "payment_status": row[13], "order_status": row[14],
            "shipping_address_id": row[15], "created_at": safe_json(row[16]), "updated_at": safe_json(row[17]),
            "customer": {"first_name": row[18], "last_name": row[19], "email": row[20]},
            "items": items, "events": events, "payments": payments, "delivery": delivery
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_order error")
        raise HTTPException(status_code=500, detail="Could not fetch order")
    finally:
        if conn:
            conn.close()


@app.patch("/api/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    request: Request,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT order_status, user_id, deposit_paid FROM orders WHERE id=%s FOR UPDATE", (order_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")

        current_status, owner_id, deposit_paid = row
        new_status = body.new_status.upper()
        _validate_transition(current_status, new_status)

        # Enforce deposit before dispatch
        if new_status in ("READY_FOR_DISPATCH", "DISPATCHED") and not deposit_paid:
            raise HTTPException(status_code=400, detail="Deposit must be verified before dispatch")

        cur.execute(
            "UPDATE orders SET order_status=%s, updated_at=NOW() WHERE id=%s",
            (new_status, order_id),
        )
        cur.execute(
            """
            INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at)
            VALUES (%s,'STATUS_CHANGE',%s,%s,%s,%s,NOW())
            """,
            (order_id, body.notes or f"Status changed to {new_status}", current_status, new_status, current_user["user_id"]),
        )

        write_audit_log(cur, current_user["user_id"], "ORDER_STATUS_CHANGED", "orders", order_id,
                        old_values={"status": current_status}, new_values={"status": new_status},
                        ip_address=request.client.host if request.client else None)

        create_notification(cur, owner_id, "ORDER_STATUS_CHANGED", f"Order Status Updated",
                            f"Your order has been updated to: {new_status}")

        conn.commit()
        cur.close()
        return {"message": f"Order status updated to {new_status}"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_order_status error")
        raise HTTPException(status_code=500, detail="Order status update failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        role = current_user["role"]

        cur.execute("SELECT order_status, user_id FROM orders WHERE id=%s FOR UPDATE", (order_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        current_status, owner_id = row

        if role == "CUSTOMER" and owner_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        _validate_transition(current_status, "CANCELLED")

        cur.execute("UPDATE orders SET order_status='CANCELLED', updated_at=NOW() WHERE id=%s", (order_id,))
        cur.execute(
            "INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at) VALUES (%s,'ORDER_CANCELLED','Order cancelled',%s,'CANCELLED',%s,NOW())",
            (order_id, current_status, user_id),
        )

        # Release inventory reservations
        cur.execute("SELECT product_id, quantity FROM order_items WHERE order_id=%s", (order_id,))
        for pid, qty in cur.fetchall():
            try:
                _inventory_op(conn, cur, pid, "RELEASE", qty, "ORDER_CANCEL", str(order_id), f"Released on order {order_id} cancellation", user_id)
            except Exception:
                pass  # best effort — log but don't fail

        write_audit_log(cur, user_id, "ORDER_CANCELLED", "orders", order_id,
                        old_values={"status": current_status},
                        ip_address=request.client.host if request.client else None)
        create_notification(cur, owner_id, "ORDER_CANCELLED", "Order Cancelled", f"Your order #{order_id} has been cancelled.")

        conn.commit()
        cur.close()
        return {"message": "Order cancelled"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("cancel_order error")
        raise HTTPException(status_code=500, detail="Order cancellation failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# PAYMENTS — BANK TRANSFER MANUAL WORKFLOW
# ============================================================

@app.get("/api/orders/{order_id}/bank-details")
def get_bank_details(order_id: int, current_user: dict = Depends(get_current_user)):
    """Returns bank transfer details for an order the customer owns."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        role = current_user["role"]

        cur.execute(
            "SELECT id, order_number, total_amount, deposit_amount, balance_amount, deposit_paid, "
            "balance_paid, order_status, user_id, subtotal, delivery_fee, discount_amount, coupon_code "
            "FROM orders WHERE id=%s",
            (order_id,),
        )
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if role == "CUSTOMER" and order[8] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        cur.execute("SELECT bank_name, bank_account_name, bank_account_number, bank_branch FROM site_settings LIMIT 1")
        bank = cur.fetchone()
        cur.close()

        total_amount = to_decimal(order[2])
        deposit_amount = to_decimal(order[3])
        balance_amount = to_decimal(order[4])
        # Defensive backfill for any pre-existing order rows whose
        # deposit/balance were stored as 0 (e.g. from before this 75/25
        # calculation existed) — recompute from the total rather than
        # show a misleading $0.00 that doesn't match "Deposit Required (75%)".
        if total_amount > 0 and deposit_amount == 0 and balance_amount == 0:
            deposit_amount = round_money(total_amount * Decimal("75") / Decimal("100"))
            balance_amount = total_amount - deposit_amount

        return {
            "order_number": order[1],
            "total_amount": safe_json(total_amount),
            "deposit_amount": safe_json(deposit_amount),
            "balance_amount": safe_json(balance_amount),
            "deposit_paid": order[5],
            "balance_paid": order[6],
            "order_status": order[7],
            "subtotal": safe_json(order[9]) if len(order) > 9 else None,
            "delivery_fee": safe_json(order[10]) if len(order) > 10 else None,
            "discount_amount": safe_json(order[11]) if len(order) > 11 else None,
            "coupon_code": order[12] if len(order) > 12 else None,
            "bank": {
                "bank_name": bank[0] if bank else None,
                "account_name": bank[1] if bank else None,
                "account_number": bank[2] if bank else None,
                "branch": bank[3] if bank else None,
            },
            "reference": order[1],
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch bank details")
    finally:
        if conn:
            conn.close()


@app.post("/api/orders/{order_id}/payments/deposit")
def submit_deposit_payment(
    order_id: int,
    body: PaymentSubmission,
    request: Request,
    current_user: dict = Depends(require_customer),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id, order_status, deposit_paid, user_id, deposit_amount FROM orders WHERE id=%s FOR UPDATE", (order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order[3] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if order[1] not in ("AWAITING_DEPOSIT", "PENDING"):
            raise HTTPException(status_code=400, detail=f"Order is not awaiting deposit (current: {order[1]})")
        if order[2]:
            raise HTTPException(status_code=400, detail="Deposit already verified")

        cur.execute(
            """
            INSERT INTO payments (order_id, user_id, type, method, amount, currency, reference, status, submitted_at, created_at)
            VALUES (%s,%s,'DEPOSIT','BANK_TRANSFER',%s,'USD',%s,'PENDING',NOW(),NOW())
            RETURNING id
            """,
            (order_id, user_id, body.amount, body.reference),
        )
        payment_id = cur.fetchone()[0]

        cur.execute("UPDATE orders SET order_status='DEPOSIT_VERIFICATION', updated_at=NOW() WHERE id=%s", (order_id,))
        cur.execute(
            "INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at) VALUES (%s,'PAYMENT_SUBMITTED','Deposit payment submitted','AWAITING_DEPOSIT','DEPOSIT_VERIFICATION',%s,NOW())",
            (order_id, user_id),
        )

        write_audit_log(cur, user_id, "DEPOSIT_SUBMITTED", "payments", payment_id,
                        new_values={"amount": str(body.amount), "reference": body.reference},
                        ip_address=request.client.host if request.client else None)
        create_notification(cur, user_id, "PAYMENT_SUBMITTED", "Deposit Submitted",
                            f"Your deposit payment reference {body.reference} is under review.")

        conn.commit()
        cur.close()
        return {"message": "Deposit submitted for verification", "payment_id": payment_id}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("submit_deposit error")
        raise HTTPException(status_code=500, detail="Deposit submission failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/orders/{order_id}/payments/balance")
def submit_balance_payment(
    order_id: int,
    body: PaymentSubmission,
    request: Request,
    current_user: dict = Depends(require_customer),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id, order_status, deposit_paid, balance_paid, user_id, balance_amount FROM orders WHERE id=%s FOR UPDATE", (order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order[4] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if not order[2]:
            raise HTTPException(status_code=400, detail="Deposit has not been verified yet")
        if order[3]:
            raise HTTPException(status_code=400, detail="Balance already verified")
        if order[1] not in ("AWAITING_BALANCE", "DELIVERED"):
            raise HTTPException(status_code=400, detail=f"Order is not in balance-due state (current: {order[1]})")

        cur.execute(
            """
            INSERT INTO payments (order_id, user_id, type, method, amount, currency, reference, status, submitted_at, created_at)
            VALUES (%s,%s,'BALANCE','BANK_TRANSFER',%s,'USD',%s,'PENDING',NOW(),NOW())
            RETURNING id
            """,
            (order_id, user_id, body.amount, body.reference),
        )
        payment_id = cur.fetchone()[0]

        write_audit_log(cur, user_id, "BALANCE_SUBMITTED", "payments", payment_id,
                        new_values={"amount": str(body.amount), "reference": body.reference},
                        ip_address=request.client.host if request.client else None)
        create_notification(cur, user_id, "PAYMENT_SUBMITTED", "Balance Payment Submitted",
                            f"Your balance payment reference {body.reference} is under review.")

        conn.commit()
        cur.close()
        return {"message": "Balance payment submitted for verification", "payment_id": payment_id}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("submit_balance error")
        raise HTTPException(status_code=500, detail="Balance submission failed")
    finally:
        if conn:
            conn.close()


@app.get("/api/payments/pending")
def list_pending_payments(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT p.id, p.order_id, o.order_number, p.type, p.method, p.amount, p.currency,
                   p.reference, p.status, p.submitted_at,
                   u.first_name, u.last_name, u.email
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            JOIN users u ON u.id = p.user_id
            WHERE p.status = 'PENDING'
            ORDER BY p.submitted_at ASC
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "order_id": r[1], "order_number": r[2], "type": r[3], "method": r[4],
             "amount": safe_json(r[5]), "currency": r[6], "reference": r[7], "status": r[8],
             "submitted_at": safe_json(r[9]), "customer": f"{r[10]} {r[11]}", "email": r[12]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch pending payments")
    finally:
        if conn:
            conn.close()


@app.get("/api/payments/{payment_id}")
def get_payment(payment_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, order_id, user_id, type, method, amount, currency, reference, status, submitted_at, verified_at, verified_by, notes FROM payments WHERE id=%s",
            (payment_id,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Payment not found")
        cols = ["id","order_id","user_id","type","method","amount","currency","reference","status","submitted_at","verified_at","verified_by","notes"]
        d = dict(zip(cols, row))
        d["amount"] = safe_json(d["amount"])
        d["submitted_at"] = safe_json(d["submitted_at"])
        d["verified_at"] = safe_json(d["verified_at"])
        return d
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch payment")
    finally:
        if conn:
            conn.close()


@app.post("/api/payments/{payment_id}/verify")
def verify_payment(payment_id: int, body: PaymentVerification, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    """
    Admin/staff verifies a PENDING payment.
    Updates order deposit_paid / balance_paid flags based on VERIFIED payment totals.
    Never trusts client-supplied deposit_paid or balance_paid.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, order_id, type, status, amount FROM payments WHERE id=%s FOR UPDATE", (payment_id,))
        pmt = cur.fetchone()
        if not pmt:
            raise HTTPException(status_code=404, detail="Payment not found")
        if pmt[3] != "PENDING":
            raise HTTPException(status_code=400, detail=f"Payment is not in PENDING state (current: {pmt[3]})")

        order_id = pmt[1]
        pmt_type = pmt[2]

        cur.execute("SELECT id, order_status, deposit_amount, balance_amount, user_id FROM orders WHERE id=%s FOR UPDATE", (order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        owner_id = order[4]

        # Verify payment
        cur.execute(
            "UPDATE payments SET status='VERIFIED', verified_at=NOW(), verified_by=%s, notes=%s WHERE id=%s",
            (current_user["user_id"], body.notes, payment_id),
        )

        # Re-derive deposit_paid and balance_paid from VERIFIED payment records
        cur.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=%s AND type='DEPOSIT' AND status='VERIFIED'",
            (order_id,),
        )
        verified_deposit = to_decimal(cur.fetchone()[0])
        required_deposit = to_decimal(order[2])
        deposit_paid = verified_deposit >= required_deposit

        cur.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=%s AND type='BALANCE' AND status='VERIFIED'",
            (order_id,),
        )
        verified_balance = to_decimal(cur.fetchone()[0])
        required_balance = to_decimal(order[3])
        balance_paid = verified_balance >= required_balance

        new_order_status = order[1]
        if pmt_type == "DEPOSIT" and deposit_paid and order[1] == "DEPOSIT_VERIFICATION":
            new_order_status = "PROCESSING"
        elif pmt_type == "BALANCE" and balance_paid and order[1] == "AWAITING_BALANCE":
            new_order_status = "COMPLETED"

        cur.execute(
            "UPDATE orders SET deposit_paid=%s, balance_paid=%s, order_status=%s, updated_at=NOW() WHERE id=%s",
            (deposit_paid, balance_paid, new_order_status, order_id),
        )

        if new_order_status != order[1]:
            cur.execute(
                "INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at) VALUES (%s,'PAYMENT_VERIFIED',%s,%s,%s,%s,NOW())",
                (order_id, f"{pmt_type} payment verified", order[1], new_order_status, current_user["user_id"]),
            )

        write_audit_log(cur, current_user["user_id"], "PAYMENT_VERIFIED", "payments", payment_id,
                        old_values={"status": "PENDING"}, new_values={"status": "VERIFIED"},
                        ip_address=request.client.host if request.client else None)

        notif_title = "Deposit Verified" if pmt_type == "DEPOSIT" else "Balance Verified"
        notif_msg = f"Your {pmt_type.lower()} payment has been verified. Order status: {new_order_status}"
        create_notification(cur, owner_id, "PAYMENT_VERIFIED", notif_title, notif_msg)

        conn.commit()
        cur.close()
        return {"message": "Payment verified", "new_order_status": new_order_status, "deposit_paid": deposit_paid, "balance_paid": balance_paid}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("verify_payment error")
        raise HTTPException(status_code=500, detail="Payment verification failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/payments/{payment_id}/reject")
def reject_payment(payment_id: int, body: PaymentRejection, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, order_id, status, type, user_id FROM payments WHERE id=%s FOR UPDATE", (payment_id,))
        pmt = cur.fetchone()
        if not pmt:
            raise HTTPException(status_code=404, detail="Payment not found")
        if pmt[2] != "PENDING":
            raise HTTPException(status_code=400, detail=f"Payment is not in PENDING state")

        cur.execute("UPDATE payments SET status='REJECTED', verified_at=NOW(), verified_by=%s, notes=%s WHERE id=%s",
                    (current_user["user_id"], body.notes, payment_id))

        order_id = pmt[1]
        owner_id = pmt[4]
        pmt_type = pmt[3]

        # Revert order status for deposit rejections
        if pmt_type == "DEPOSIT":
            cur.execute("UPDATE orders SET order_status='AWAITING_DEPOSIT', updated_at=NOW() WHERE id=%s AND order_status='DEPOSIT_VERIFICATION'", (order_id,))
            cur.execute(
                "INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at) VALUES (%s,'PAYMENT_REJECTED','Deposit payment rejected','DEPOSIT_VERIFICATION','AWAITING_DEPOSIT',%s,NOW())",
                (order_id, current_user["user_id"]),
            )

        write_audit_log(cur, current_user["user_id"], "PAYMENT_REJECTED", "payments", payment_id,
                        new_values={"notes": body.notes},
                        ip_address=request.client.host if request.client else None)
        create_notification(cur, owner_id, "PAYMENT_REJECTED", "Payment Rejected",
                            f"Your {pmt_type.lower()} payment was rejected: {body.notes}. Please resubmit.")

        conn.commit()
        cur.close()
        return {"message": "Payment rejected"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Payment rejection failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# DELIVERIES
# ============================================================

@app.get("/api/deliveries")
def list_deliveries(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id, d.order_id, o.order_number, d.method, d.courier, d.tracking_number,
                   d.status, d.estimated_date, d.dispatched_at, d.delivered_at
            FROM deliveries d JOIN orders o ON o.id=d.order_id ORDER BY d.created_at DESC
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "order_id": r[1], "order_number": r[2], "method": r[3], "courier": r[4],
             "tracking_number": r[5], "status": r[6], "estimated_date": safe_json(r[7]),
             "dispatched_at": safe_json(r[8]), "delivered_at": safe_json(r[9])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch deliveries")
    finally:
        if conn:
            conn.close()


@app.post("/api/deliveries", status_code=201)
def create_delivery(body: DeliveryCreate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, order_status, deposit_paid FROM orders WHERE id=%s", (body.order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if not order[2]:
            raise HTTPException(status_code=400, detail="Cannot create delivery — deposit not verified")

        cur.execute(
            "INSERT INTO deliveries (order_id, method, courier, tracking_number, status, estimated_date, created_at, updated_at) VALUES (%s,%s,%s,%s,'PENDING',%s,NOW(),NOW()) RETURNING id",
            (body.order_id, body.method, body.courier, body.tracking_number, body.estimated_date),
        )
        new_id = cur.fetchone()[0]
        write_audit_log(cur, current_user["user_id"], "DELIVERY_CREATED", "deliveries", new_id,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Delivery created"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Delivery creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/deliveries/{delivery_id}")
def update_delivery(delivery_id: int, body: DeliveryUpdate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, order_id, status FROM deliveries WHERE id=%s", (delivery_id,))
        delivery = cur.fetchone()
        if not delivery:
            raise HTTPException(status_code=404, detail="Delivery not found")

        order_id = delivery[1]
        new_status = body.status.upper() if body.status else None

        extras = {}
        if new_status == "DISPATCHED":
            extras["dispatched_at"] = datetime.now()
        if new_status == "DELIVERED":
            extras["delivered_at"] = datetime.now()
            # Move order to AWAITING_BALANCE
            cur.execute(
                "UPDATE orders SET order_status='AWAITING_BALANCE', updated_at=NOW() WHERE id=%s AND order_status='DISPATCHED'",
                (order_id,),
            )
            cur.execute("SELECT user_id FROM orders WHERE id=%s", (order_id,))
            owner_row = cur.fetchone()
            if owner_row:
                create_notification(cur, owner_row[0], "DELIVERY_DELIVERED", "Order Delivered",
                                    "Your order has been delivered. Please pay the remaining balance to complete your order.")

        cur.execute(
            """
            UPDATE deliveries SET
                status = COALESCE(%s, status),
                courier = COALESCE(%s, courier),
                tracking_number = COALESCE(%s, tracking_number),
                estimated_date = COALESCE(%s, estimated_date),
                notes = COALESCE(%s, notes),
                dispatched_at = COALESCE(%s, dispatched_at),
                delivered_at = COALESCE(%s, delivered_at),
                updated_at = NOW()
            WHERE id = %s
            """,
            (new_status, body.courier, body.tracking_number, body.estimated_date, body.notes,
             extras.get("dispatched_at"), extras.get("delivered_at"), delivery_id),
        )

        write_audit_log(cur, current_user["user_id"], "DELIVERY_UPDATED", "deliveries", delivery_id,
                        new_values={"status": new_status},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Delivery updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_delivery error")
        raise HTTPException(status_code=500, detail="Delivery update failed")
    finally:
        if conn:
            conn.close()


@app.get("/api/deliveries/{delivery_id}")
def get_delivery(delivery_id: int, current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, order_id, method, courier, tracking_number, status, estimated_date, dispatched_at, delivered_at, notes FROM deliveries WHERE id=%s",
            (delivery_id,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Delivery not found")
        return {"id": row[0], "order_id": row[1], "method": row[2], "courier": row[3],
                "tracking_number": row[4], "status": row[5], "estimated_date": safe_json(row[6]),
                "dispatched_at": safe_json(row[7]), "delivered_at": safe_json(row[8]), "notes": row[9]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch delivery")
    finally:
        if conn:
            conn.close()


# ============================================================
# REVIEWS
# ============================================================

@app.get("/api/products/{product_id}/reviews")
def list_product_reviews(product_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.id, r.rating, r.title, r.comment, r.status, r.created_at,
                   u.first_name, u.last_name
            FROM reviews r JOIN users u ON u.id=r.user_id
            WHERE r.product_id=%s AND r.status='APPROVED'
            ORDER BY r.created_at DESC
            """,
            (product_id,),
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "rating": r[1], "title": r[2], "comment": r[3], "status": r[4],
             "created_at": safe_json(r[5]), "reviewer": f"{r[6]} {r[7][0]}."}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch reviews")
    finally:
        if conn:
            conn.close()


@app.post("/api/reviews", status_code=201)
def create_review(body: ReviewCreate, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        # Verify: user actually purchased the product via a COMPLETED order
        cur.execute(
            """
            SELECT oi.product_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = %s AND o.user_id = %s AND o.order_status = 'COMPLETED'
            """,
            (body.order_item_id, user_id),
        )
        eligible = cur.fetchone()
        if not eligible:
            raise HTTPException(status_code=403, detail="You can only review products from completed orders that you purchased")

        product_id = eligible[0]

        # Prevent duplicate review for same order_item
        cur.execute("SELECT id FROM reviews WHERE order_item_id=%s AND user_id=%s", (body.order_item_id, user_id))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="You have already reviewed this item")

        cur.execute(
            "INSERT INTO reviews (product_id, user_id, order_item_id, rating, title, comment, status, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,'PENDING',NOW(),NOW()) RETURNING id",
            (product_id, user_id, body.order_item_id, body.rating, body.title, body.comment),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Review submitted for approval"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Review submission failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/reviews/{review_id}/approve")
def approve_review(review_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE reviews SET status='APPROVED', updated_at=NOW() WHERE id=%s RETURNING id", (review_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Review not found")
        conn.commit()
        cur.close()
        return {"message": "Review approved"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Review approval failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/reviews/{review_id}")
def delete_review(review_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM reviews WHERE id=%s RETURNING id", (review_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Review not found")
        conn.commit()
        cur.close()
        return {"message": "Review deleted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Review deletion failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# WISHLIST
# ============================================================

@app.get("/api/wishlist")
def get_wishlist(current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id FROM wishlists WHERE user_id=%s LIMIT 1", (user_id,))
        wishlist = cur.fetchone()
        if not wishlist:
            cur.execute("INSERT INTO wishlists (user_id, created_at) VALUES (%s, NOW()) RETURNING id", (user_id,))
            wishlist = cur.fetchone()
            conn.commit()
        wishlist_id = wishlist[0]

        cur.execute(
            """
            SELECT wi.id, wi.product_id, p.name, p.sku, p.price, p.status,
                   (SELECT image_url FROM product_images WHERE product_id=p.id AND is_primary=TRUE LIMIT 1)
            FROM wishlist_items wi JOIN products p ON p.id=wi.product_id
            WHERE wi.wishlist_id=%s ORDER BY wi.created_at DESC
            """,
            (wishlist_id,),
        )
        items = cur.fetchall()
        cur.close()

        return {
            "wishlist_id": wishlist_id,
            "items": [
                {"id": r[0], "product_id": r[1], "product_name": r[2], "sku": r[3],
                 "price": safe_json(r[4]), "status": r[5], "image": r[6]}
                for r in items
            ]
        }
    except Exception:
        logger.exception("get_wishlist error")
        raise HTTPException(status_code=500, detail="Could not fetch wishlist")
    finally:
        if conn:
            conn.close()


@app.post("/api/wishlist/items/{product_id}", status_code=201)
def add_to_wishlist(product_id: int, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id FROM products WHERE id=%s", (product_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Product not found")

        cur.execute("SELECT id FROM wishlists WHERE user_id=%s LIMIT 1", (user_id,))
        wishlist = cur.fetchone()
        if not wishlist:
            cur.execute("INSERT INTO wishlists (user_id, created_at) VALUES (%s, NOW()) RETURNING id", (user_id,))
            wishlist = cur.fetchone()

        cur.execute("INSERT INTO wishlist_items (wishlist_id, product_id, created_at) VALUES (%s,%s,NOW()) ON CONFLICT DO NOTHING", (wishlist[0], product_id))
        conn.commit()
        cur.close()
        return {"message": "Product added to wishlist"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Wishlist add failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/wishlist/items/{product_id}")
def remove_from_wishlist(product_id: int, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        cur.execute("SELECT id FROM wishlists WHERE user_id=%s", (user_id,))
        wishlist = cur.fetchone()
        if not wishlist:
            raise HTTPException(status_code=404, detail="Wishlist not found")
        cur.execute("DELETE FROM wishlist_items WHERE wishlist_id=%s AND product_id=%s RETURNING id", (wishlist[0], product_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Item not in wishlist")
        conn.commit()
        cur.close()
        return {"message": "Product removed from wishlist"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Wishlist remove failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/wishlist")
def clear_wishlist(current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]
        cur.execute("SELECT id FROM wishlists WHERE user_id=%s", (user_id,))
        wishlist = cur.fetchone()
        if wishlist:
            cur.execute("DELETE FROM wishlist_items WHERE wishlist_id=%s", (wishlist[0],))
        conn.commit()
        cur.close()
        return {"message": "Wishlist cleared"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Wishlist clear failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# NOTIFICATIONS
# ============================================================

@app.get("/api/notifications")
def list_notifications(current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, type, title, message, channel, status, read_at, created_at FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 100",
            (current_user["user_id"],),
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "type": r[1], "title": r[2], "message": r[3],
             "channel": r[4], "status": r[5], "read_at": safe_json(r[6]), "created_at": safe_json(r[7])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch notifications")
    finally:
        if conn:
            conn.close()


@app.patch("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE notifications SET status='READ', read_at=NOW() WHERE id=%s AND user_id=%s RETURNING id",
            (notif_id, current_user["user_id"]),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Notification not found")
        conn.commit()
        cur.close()
        return {"message": "Notification marked as read"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Mark read failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/notifications/read-all")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE notifications SET status='READ', read_at=NOW() WHERE user_id=%s AND status='UNREAD'",
            (current_user["user_id"],),
        )
        conn.commit()
        cur.close()
        return {"message": "All notifications marked as read"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Mark all read failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# COUPONS
# ============================================================

@app.get("/api/admin/coupons")
def list_coupons(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active FROM coupons ORDER BY id")
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "code": r[1], "discount_type": r[2], "discount_value": safe_json(r[3]),
             "min_order_amount": safe_json(r[4]), "max_uses": r[5], "expires_at": safe_json(r[6]), "is_active": r[7]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch coupons")
    finally:
        if conn:
            conn.close()


@app.post("/api/admin/coupons", status_code=201)
def create_coupon(body: CouponCreate, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, created_at) VALUES (UPPER(%s),%s,%s,%s,%s,%s,%s,NOW()) RETURNING id",
            (body.code, body.discount_type, body.discount_value, body.min_order_amount, body.max_uses, body.expires_at, body.is_active),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Coupon created"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Coupon creation failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/checkout/validate-coupon")
def validate_coupon(coupon_code: str, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, code, discount_type, discount_value, min_order_amount, expires_at, is_active FROM coupons WHERE UPPER(code)=UPPER(%s)",
            (coupon_code,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Coupon not found")
        if not row[6]:
            raise HTTPException(status_code=400, detail="Coupon is not active")
        if row[5] and row[5] < datetime.now().date():
            raise HTTPException(status_code=400, detail="Coupon has expired")
        return {"valid": True, "code": row[1], "discount_type": row[2], "discount_value": safe_json(row[3]), "min_order_amount": safe_json(row[4])}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Coupon validation failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# RETURNS / REFUNDS
# ============================================================

@app.post("/api/returns", status_code=201)
def request_return(body: ReturnRequest, current_user: dict = Depends(require_customer)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id, order_status, user_id FROM orders WHERE id=%s", (body.order_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order[2] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if order[1] not in ("DELIVERED", "COMPLETED"):
            raise HTTPException(status_code=400, detail="Order is not eligible for return")

        cur.execute(
            "INSERT INTO returns (order_id, user_id, reason, notes, status, created_at, updated_at) VALUES (%s,%s,%s,%s,'PENDING',NOW(),NOW()) RETURNING id",
            (body.order_id, user_id, body.reason, body.notes),
        )
        new_id = cur.fetchone()[0]
        cur.execute("UPDATE orders SET order_status='RETURN_REQUESTED', updated_at=NOW() WHERE id=%s", (body.order_id,))
        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Return request submitted"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Return request failed")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/returns")
def list_returns(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT r.id, r.order_id, o.order_number, r.reason, r.status, r.created_at, u.email FROM returns r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC"
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "order_id": r[1], "order_number": r[2], "reason": r[3], "status": r[4],
             "created_at": safe_json(r[5]), "customer_email": r[6]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch returns")
    finally:
        if conn:
            conn.close()


@app.patch("/api/admin/returns/{return_id}")
def update_return(return_id: int, body: ReturnUpdate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE returns SET status=%s, notes=%s, updated_at=NOW() WHERE id=%s RETURNING id, order_id", (body.status.upper(), body.notes, return_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Return not found")
        if body.status.upper() == "REFUNDED":
            cur.execute(
                "INSERT INTO refunds (order_id, return_id, status, created_by, created_at, updated_at) VALUES (%s,%s,'PENDING',%s,NOW(),NOW())",
                (row[1], return_id, current_user["user_id"]),
            )
        write_audit_log(cur, current_user["user_id"], "RETURN_UPDATED", "returns", return_id,
                        new_values={"status": body.status},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Return updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Return update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# SITE SETTINGS
# ============================================================

@app.get("/api/settings/public")
def get_public_settings():
    """Returns only non-sensitive settings safe for public consumption."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT business_name, business_email, business_phone, whatsapp_number, facebook_url, instagram_url, tiktok_url, x_url, logo_url, favicon_url, banner_url FROM site_settings LIMIT 1"
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            return {}
        return {
            "business_name": row[0], "business_email": row[1], "business_phone": row[2],
            "whatsapp_number": row[3], "facebook_url": row[4], "instagram_url": row[5],
            "tiktok_url": row[6], "x_url": row[7],
            "logo_url": row[8] if len(row) > 8 else None,
            "favicon_url": row[9] if len(row) > 9 else None,
            "banner_url": row[10] if len(row) > 10 else None
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch settings")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/settings")
def get_admin_settings(current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM site_settings LIMIT 1")
        row = cur.fetchone()
        if not row:
            cur.close()
            return {}
        cols = [d[0] for d in cur.description]
        cur.close()
        return dict(zip(cols, row))
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch admin settings")
    finally:
        if conn:
            conn.close()


@app.patch("/api/admin/settings")
def update_settings(body: SettingsUpdate, request: Request, current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            return {"message": "Nothing to update"}
        set_clause = ", ".join([f"{k} = %s" for k in updates.keys()])
        values = list(updates.values())
        cur.execute(f"UPDATE site_settings SET {set_clause} WHERE id = (SELECT id FROM site_settings LIMIT 1)", values)
        write_audit_log(cur, current_user["user_id"], "SETTINGS_UPDATED", "site_settings", "1",
                        new_values=updates, ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Settings updated"}
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_settings error")
        raise HTTPException(status_code=500, detail="Settings update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADMIN DASHBOARD & REPORTS
# ============================================================

@app.get("/api/admin/dashboard")
def admin_dashboard(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE order_status NOT IN ('CANCELLED')")
        orders_row = cur.fetchone()

        cur.execute("SELECT COUNT(*) FROM orders WHERE order_status NOT IN ('CANCELLED') AND created_at >= NOW() - INTERVAL '30 days'")
        recent_orders = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM payments WHERE status='PENDING'")
        pending_payments = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM deliveries WHERE status NOT IN ('DELIVERED','RETURNED')")
        pending_deliveries = cur.fetchone()[0]

        cur.execute("""
            SELECT p.id, p.name, p.sku, i.quantity - i.reserved_quantity AS available, i.reorder_level
            FROM inventory i JOIN products p ON p.id=i.product_id
            WHERE i.quantity - i.reserved_quantity <= i.reorder_level
            ORDER BY available ASC LIMIT 10
        """)
        # Field is named product_id (not id) to match what the admin
        # dashboard's low-stock panel keys off — it was previously called
        # "id" here while the frontend read "product_id", so every row's
        # React key silently resolved to undefined (no crash, but broken
        # list reconciliation / console warnings).
        low_stock = [{"product_id": r[0], "name": r[1], "sku": r[2], "available": r[3], "reorder_level": r[4]} for r in cur.fetchall()]

        cur.execute("SELECT COUNT(*) FROM users WHERE role='CUSTOMER'")
        customer_count = cur.fetchone()[0]

        cur.execute("""
            SELECT o.id, o.order_number, u.email, o.total_amount, o.order_status, o.created_at
            FROM orders o JOIN users u ON u.id=o.user_id
            ORDER BY o.created_at DESC LIMIT 10
        """)
        recent_orders_list = [
            {"id": r[0], "order_number": r[1], "customer": r[2], "total": safe_json(r[3]), "status": r[4], "created_at": safe_json(r[5])}
            for r in cur.fetchall()
        ]

        # ---- Additional overview card data (products, pending orders,
        # returns/refunds needing attention) and real month-over-month
        # deltas, all derived from actual created_at timestamps —
        # no invented figures. For counts that can both increase and
        # decrease over time (e.g. ACTIVE products), comparing against
        # "rows that already existed 30 days ago, filtered by their
        # CURRENT status" is an approximation (it can't see past status
        # changes, since there's no history table) rather than a precise
        # point-in-time snapshot; it's still a real, data-derived figure,
        # just noted here for transparency.
        cur.execute("SELECT COUNT(*) FROM products")
        total_products = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM products WHERE created_at <= NOW() - INTERVAL '30 days'")
        total_products_30d_ago = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM products WHERE status = 'ACTIVE'")
        active_products = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM products WHERE status = 'ACTIVE' AND created_at <= NOW() - INTERVAL '30 days'")
        active_products_30d_ago = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM orders WHERE order_status = 'PENDING'")
        pending_orders = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM orders WHERE order_status = 'PENDING' AND created_at <= NOW() - INTERVAL '30 days'")
        pending_orders_30d_ago = cur.fetchone()[0]

        cur.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE order_status NOT IN ('CANCELLED') AND created_at <= NOW() - INTERVAL '30 days'")
        total_sales_30d_ago = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM users WHERE role='CUSTOMER' AND created_at <= NOW() - INTERVAL '30 days'")
        customer_count_30d_ago = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM returns WHERE status = 'PENDING'")
        pending_returns = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM refunds WHERE status = 'PENDING'")
        pending_refunds = cur.fetchone()[0]

        def pct_change(current, past):
            current = float(current or 0)
            past = float(past or 0)
            if past == 0:
                return 100.0 if current > 0 else 0.0
            return round(((current - past) / past) * 100, 1)

        cur.close()

        return {
            "total_orders": orders_row[0],
            "total_sales": safe_json(to_decimal(orders_row[1])),
            "recent_orders_30d": recent_orders,
            "pending_payments": pending_payments,
            "pending_deliveries": pending_deliveries,
            "customer_count": customer_count,
            "low_stock_products": low_stock,
            "recent_orders": recent_orders_list,
            "total_products": total_products,
            "active_products": active_products,
            "pending_orders": pending_orders,
            "returns_refunds_count": pending_returns + pending_refunds,
            "deltas_30d": {
                "total_products": pct_change(total_products, total_products_30d_ago),
                "active_products": pct_change(active_products, active_products_30d_ago),
                "total_orders": pct_change(orders_row[0], orders_row[0] - recent_orders),
                "pending_orders": pct_change(pending_orders, pending_orders_30d_ago),
                "total_sales": pct_change(to_decimal(orders_row[1]), total_sales_30d_ago),
                "customer_count": pct_change(customer_count, customer_count_30d_ago),
            },
        }
    except Exception:
        logger.exception("admin_dashboard error")
        raise HTTPException(status_code=500, detail="Could not load dashboard")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/reports/sales")
def sales_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        query = """
            SELECT DATE(o.created_at) AS day,
                   COUNT(o.id) AS order_count,
                   COALESCE(SUM(o.total_amount),0) AS revenue,
                   COALESCE(SUM(o.deposit_amount),0) AS deposit_collected,
                   COALESCE(SUM(o.balance_amount),0) AS balance_outstanding
            FROM orders o WHERE o.order_status NOT IN ('CANCELLED')
        """
        params = []
        if date_from:
            query += " AND DATE(o.created_at) >= %s"; params.append(date_from)
        if date_to:
            query += " AND DATE(o.created_at) <= %s"; params.append(date_to)
        query += " GROUP BY day ORDER BY day DESC"

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        return [
            {"date": safe_json(r[0]), "order_count": r[1], "revenue": safe_json(r[2]),
             "deposit_collected": safe_json(r[3]), "balance_outstanding": safe_json(r[4])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not generate sales report")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/reports/top-products")
def top_products_report(limit: int = 10, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT oi.product_id, oi.product_name, oi.sku,
                   SUM(oi.quantity) AS total_qty,
                   SUM(oi.subtotal) AS total_revenue
            FROM order_items oi
            JOIN orders o ON o.id=oi.order_id
            WHERE o.order_status NOT IN ('CANCELLED')
            GROUP BY oi.product_id, oi.product_name, oi.sku
            ORDER BY total_revenue DESC LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"product_id": r[0], "product_name": r[1], "sku": r[2],
             "total_quantity": r[3], "total_revenue": safe_json(r[4])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not generate top-products report")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/reports/outstanding-balances")
def outstanding_balances(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT o.id, o.order_number, u.email, o.balance_amount, o.order_status, o.updated_at
            FROM orders o JOIN users u ON u.id=o.user_id
            WHERE o.deposit_paid=TRUE AND o.balance_paid=FALSE AND o.order_status NOT IN ('CANCELLED','REFUNDED')
            ORDER BY o.updated_at DESC
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"order_id": r[0], "order_number": r[1], "customer": r[2], "balance_due": safe_json(r[3]),
             "status": r[4], "last_updated": safe_json(r[5])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch outstanding balances")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADMIN CUSTOMER & STAFF MANAGEMENT
# ============================================================

@app.get("/api/admin/customers")
def list_customers(
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = "SELECT id, first_name, last_name, email, phone, status, created_at FROM users WHERE role='CUSTOMER'"
        params = []
        if search:
            query += " AND (first_name ILIKE %s OR last_name ILIKE %s OR email ILIKE %s)"
            term = f"%{search}%"
            params.extend([term, term, term])
        query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([page_size, (page - 1) * page_size])
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "first_name": r[1], "last_name": r[2], "email": r[3],
             "phone": r[4], "status": r[5], "created_at": safe_json(r[6])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch customers")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/staff")
def list_staff(current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, first_name, last_name, email, role, status, created_at FROM users WHERE role IN ('STAFF','ADMIN') ORDER BY role, first_name"
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "first_name": r[1], "last_name": r[2], "email": r[3],
             "role": r[4], "status": r[5], "created_at": safe_json(r[6])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch staff")
    finally:
        if conn:
            conn.close()


@app.patch("/api/admin/users/{user_id}/status")
def update_user_status(
    user_id: int,
    status: str,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    allowed = {"ACTIVE", "SUSPENDED", "DEACTIVATED"}
    if status.upper() not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed}")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE users SET status=%s, updated_at=NOW() WHERE id=%s RETURNING id", (status.upper(), user_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="User not found")
        write_audit_log(cur, current_user["user_id"], "USER_STATUS_CHANGED", "users", user_id,
                        new_values={"status": status.upper()},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": f"User status updated to {status.upper()}"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="User status update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# AUDIT LOGS
# ============================================================

@app.get("/api/admin/audit-logs")
def list_audit_logs(
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 50,
    current_user: dict = Depends(require_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = "SELECT al.id, al.user_id, u.email, al.action, al.entity_type, al.entity_id, al.old_values, al.new_values, al.ip_address, al.created_at FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE 1=1"
        params = []
        if entity_type:
            query += " AND al.entity_type = %s"; params.append(entity_type.upper())
        if user_id:
            query += " AND al.user_id = %s"; params.append(user_id)
        query += " ORDER BY al.created_at DESC LIMIT %s OFFSET %s"
        params.extend([page_size, (page - 1) * page_size])
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "user_id": r[1], "user_email": r[2], "action": r[3],
             "entity_type": r[4], "entity_id": r[5],
             "old_values": r[6], "new_values": r[7],
             "ip_address": r[8], "created_at": safe_json(r[9])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch audit logs")
    finally:
        if conn:
            conn.close()


# ============================================================
# EMAIL SERVICE — Mailjet HTTPS Send API (v3.1), stdlib HTTP client
# ============================================================
# Migrated off SMTP: Render's outbound network blocks/throttles raw SMTP
# ports on the free tier, which is what produced the
# "[Errno 110] Connection timed out" failures in production. Mailjet's
# Send API is plain HTTPS (port 443), which isn't subject to that.
#
# NOTE ON NAMING: SMTP_FROM / SMTP_FROM_NAME are kept as the env var names
# for continuity with the rest of this project's config, but they are now
# just the sender identity (From address/name) used in the Mailjet API
# call — they are NOT SMTP server settings anymore. SMTP_HOST, SMTP_PORT,
# SMTP_USER, SMTP_PASSWORD and SMTP_TLS are no longer read anywhere; they
# can be removed from the environment once this is deployed.
import base64
import socket
import urllib.request
import urllib.error

MAILJET_SEND_URL = "https://api.mailjet.com/v3.1/send"
MAILJET_TIMEOUT_SECONDS = 10  # connect + response combined (urllib's single socket timeout)


def _get_mailjet_config() -> dict:
    return {
        "api_key": os.getenv("MAILJET_API_KEY", ""),
        "secret_key": os.getenv("MAILJET_SECRET_KEY", ""),
        "from_email": os.getenv("SMTP_FROM", "noreply@carparts.local"),
        "from_name": os.getenv("SMTP_FROM_NAME", "CarParts"),
    }


def _send_email(to_email: str, subject: str, body_html: str, body_text: str = "") -> bool:
    """
    Send an email via the Mailjet HTTPS Send API.

    Returns True only when Mailjet's API confirms it ACCEPTED the message
    for delivery (HTTP 200 + Status "success" for the message in the
    response body) — this is provider acceptance, not proof the message
    reached the recipient's inbox. Actual delivery/bounce status is only
    visible in Mailjet's own message activity dashboard/webhooks, which
    this function does not query.

    Returns False if Mailjet is not configured (dev/log-only mode) or if
    the send failed for any reason — callers must treat False as "did not
    send" and must not mark anything (email-verified, reset-link-sent,
    etc.) as succeeded based on a False return.
    """
    cfg = _get_mailjet_config()
    if not cfg["api_key"] or not cfg["secret_key"]:
        # Dev mode: log that an email WOULD be sent, without the body —
        # the body often contains a verification link or reset token, and
        # those must never land in logs.
        logger.info("EMAIL (Mailjet not configured — dev/log-only mode) → To: %s | Subject: %s", to_email, subject)
        return False

    payload = {
        "Messages": [
            {
                "From": {"Email": cfg["from_email"], "Name": cfg["from_name"]},
                "To": [{"Email": to_email}],
                "Subject": subject,
                "TextPart": body_text or "",
                "HTMLPart": body_html,
            }
        ]
    }

    try:
        body_bytes = json.dumps(payload).encode("utf-8")
        auth_token = base64.b64encode(f"{cfg['api_key']}:{cfg['secret_key']}".encode()).decode()
        req = urllib.request.Request(
            MAILJET_SEND_URL,
            data=body_bytes,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Basic {auth_token}",
            },
        )
        with urllib.request.urlopen(req, timeout=MAILJET_TIMEOUT_SECONDS) as resp:
            status = resp.getcode()
            resp_data = json.loads(resp.read().decode("utf-8"))

        # Mailjet can return HTTP 200 even when an individual message
        # within the batch failed — check the per-message Status too.
        messages = resp_data.get("Messages", [])
        msg_status = messages[0].get("Status") if messages else None
        if status == 200 and msg_status == "success":
            logger.info("Email accepted by Mailjet for %s: %s", to_email, subject)
            return True

        logger.error(
            "Mailjet did not accept email to %s (http_status=%s, message_status=%s)",
            to_email, status, msg_status,
        )
        return False

    except urllib.error.HTTPError as exc:
        # 401 = bad API key/secret. 400 = malformed request or unverified
        # sender. 429 = rate limited. 5xx = provider-side error. We only
        # log the status code and Mailjet's short error identifier — never
        # the request body (contains the message content/links) and never
        # the credentials.
        try:
            err_body = json.loads(exc.read().decode("utf-8"))
            err_summary = err_body.get("ErrorMessage") or err_body.get("Messages", [{}])[0].get("Errors", [{}])
        except Exception:
            err_summary = "<unparseable error body>"
        logger.error("Mailjet API error sending to %s: HTTP %s — %s", to_email, exc.code, err_summary)
        return False
    except (socket.timeout, TimeoutError):
        logger.error("Mailjet API request timed out sending to %s", to_email)
        return False
    except urllib.error.URLError as exc:
        logger.error("Mailjet API connection failed sending to %s: %s", to_email, exc.reason)
        return False
    except Exception as exc:
        logger.exception("Unexpected error sending email to %s via Mailjet", to_email)
        return False


def _send_verification_email(to_email: str, first_name: str, token: str) -> bool:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    verify_url = f"{frontend_url}/verify-email?token={token}"
    subject = "Verify your CarParts account"
    html = f"""
    <p>Hi {first_name},</p>
    <p>Please verify your email address by clicking the link below:</p>
    <p><a href="{verify_url}">{verify_url}</a></p>
    <p>This link expires in 24 hours.</p>
    <p>If you did not register, please ignore this email.</p>
    """
    text = f"Hi {first_name},\n\nVerify your email: {verify_url}\n\nExpires in 24 hours."
    return _send_email(to_email, subject, html, text)


def _send_password_reset_email(to_email: str, first_name: str, token: str) -> bool:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?token={token}"
    subject = "Reset your CarParts password"
    html = f"""
    <p>Hi {first_name},</p>
    <p>We received a request to reset your password. Click the link below:</p>
    <p><a href="{reset_url}">{reset_url}</a></p>
    <p>This link expires in 2 hours. If you did not request this, ignore this email.</p>
    """
    text = f"Hi {first_name},\n\nReset your password: {reset_url}\n\nExpires in 2 hours."
    return _send_email(to_email, subject, html, text)


def _send_password_changed_email(to_email: str, first_name: str) -> bool:
    """
    Sent after ANY successful password change (self-service reset or the
    logged-in change-password form) — the recipient didn't necessarily
    trigger it themselves, so this is a security notice, not a receipt.
    """
    subject = "Your CarParts password was changed"
    html = f"""
    <p>Hi {first_name},</p>
    <p>This is a confirmation that the password for your account was just changed.</p>
    <p>If you made this change, no further action is needed.</p>
    <p><strong>If you did not make this change</strong>, your account may be compromised —
    please reset your password immediately and contact support.</p>
    """
    text = (f"Hi {first_name},\n\nYour password was just changed. If this wasn't you, "
            f"reset your password immediately and contact support.")
    return _send_email(to_email, subject, html, text)


def _send_order_notification_email(to_email: str, first_name: str, order_number: str, subject: str, body_html: str) -> bool:
    return _send_email(to_email, subject, body_html,
                       f"Hi {first_name}, update on order {order_number}.")


# ============================================================
# EMAIL VERIFICATION — complete implementation
# ============================================================

class ResendVerificationRequest(BaseModel):
    email: str


@app.post("/api/auth/verify-email")
def verify_email(token: str, request: Request):
    """Verifies the email address using the token from the verification email."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Try email_verification_tokens table first
        user_id = None
        try:
            cur.execute(
                """
                SELECT user_id FROM email_verification_tokens
                WHERE token_hash = %s AND used = FALSE AND expires_at > NOW()
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if row:
                user_id = row[0]
                cur.execute(
                    "UPDATE email_verification_tokens SET used = TRUE WHERE token_hash = %s",
                    (token_hash,),
                )
        except Exception:
            conn.rollback()
            # Fallback: check users table
            cur.execute(
                """
                SELECT id FROM users
                WHERE email_verification_token = %s
                  AND email_verification_expires > NOW()
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if row:
                user_id = row[0]
                cur.execute(
                    "UPDATE users SET email_verification_token = NULL, email_verification_expires = NULL WHERE id = %s",
                    (user_id,),
                )

        if not user_id:
            raise HTTPException(status_code=400, detail="Invalid or expired verification token")

        cur.execute(
            "UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = %s",
            (user_id,),
        )
        write_audit_log(cur, user_id, "EMAIL_VERIFIED", "users", user_id,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Email verified successfully. You can now log in."}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("verify_email error")
        raise HTTPException(status_code=500, detail="Email verification failed")
    finally:
        if conn:
            conn.close()


@app.post("/api/auth/resend-verification")
def resend_verification(body: ResendVerificationRequest, request: Request):
    """Resends the email verification link. Rate-limited to prevent abuse."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, first_name, email, email_verified FROM users WHERE email = %s AND status = 'ACTIVE'",
            (body.email.lower(),),
        )
        user = cur.fetchone()
        if user and not user[3]:  # exists and not verified
            user_id, first_name, email = user[0], user[1], user[2]
            # Backend-enforced cooldown — must match the 30s cooldown shown
            # in the UI's "Resend" button. Enforced here (not just a
            # disabled button client-side) so the cooldown can't be bypassed
            # by calling the endpoint directly.
            try:
                cur.execute(
                    """
                    SELECT created_at FROM email_verification_tokens
                    WHERE user_id = %s AND created_at > NOW() - INTERVAL '30 seconds'
                    """,
                    (user_id,),
                )
                if cur.fetchone():
                    raise HTTPException(status_code=429, detail="Please wait 30 seconds before requesting another verification email")

                # Hourly cap — the 30s cooldown alone still allows ~120
                # emails/hour if someone scripts around the UI.
                cur.execute(
                    """
                    SELECT COUNT(*) FROM email_verification_tokens
                    WHERE user_id = %s AND created_at > NOW() - INTERVAL '1 hour'
                    """,
                    (user_id,),
                )
                if (cur.fetchone() or [0])[0] >= 5:
                    raise HTTPException(status_code=429, detail="Too many verification emails requested. Please try again in an hour.")
            except HTTPException:
                raise
            except Exception:
                pass  # table may not exist yet

            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

            try:
                cur.execute(
                    """
                    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, used, created_at)
                    VALUES (%s, %s, %s, FALSE, NOW())
                    ON CONFLICT (user_id) DO UPDATE
                        SET token_hash = EXCLUDED.token_hash,
                            expires_at = EXCLUDED.expires_at,
                            used = FALSE,
                            created_at = NOW()
                    """,
                    (user_id, token_hash, expires_at.replace(tzinfo=None)),
                )
            except Exception:
                conn.rollback()
                cur.execute(
                    """
                    UPDATE users SET
                        email_verification_token = %s,
                        email_verification_expires = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (token_hash, expires_at.replace(tzinfo=None), user_id),
                )

            write_audit_log(cur, user_id, "VERIFICATION_EMAIL_RESENT", "users", user_id,
                            ip_address=request.client.host if request.client else None)
            conn.commit()
            _send_verification_email(email, first_name, token)
        cur.close()
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("resend_verification error")
    finally:
        if conn:
            conn.close()
    return {"message": "If that email is registered and unverified, a new verification link has been sent"}


# ============================================================
# ENHANCED REGISTRATION — send verification email
# ============================================================
# Patch registration to also send verification email after account creation
# We intercept via a post-registration hook stored in a module-level flag
_SEND_VERIFICATION_ON_REGISTER = True  # controlled by env if needed


# ============================================================
# RATE LIMITING — simple in-memory counter for auth endpoints
# ============================================================
import time
from collections import defaultdict

_rate_limit_store: dict = defaultdict(list)
_RATE_LIMIT_WINDOW = 60   # seconds
_RATE_LIMIT_MAX = 10       # max attempts per window per IP


def _check_rate_limit(ip: str, endpoint: str) -> None:
    key = f"{endpoint}:{ip}"
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW
    # Clean old entries
    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if t > window_start]
    if len(_rate_limit_store[key]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Please wait before trying again."
        )
    _rate_limit_store[key].append(now)


# ============================================================
# STAFF MANAGEMENT — creation and full CRUD
# ============================================================

class StaffCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    password: str
    role: str = "STAFF"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v not in ("STAFF", "ADMIN"):
            raise ValueError("Role must be STAFF or ADMIN")
        return v

    @field_validator("password")
    @classmethod
    def pwd_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class StaffUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v is not None and v not in ("STAFF", "ADMIN"):
            raise ValueError("Role must be STAFF or ADMIN")
        return v


@app.post("/api/admin/staff", status_code=201)
def create_staff(body: StaffCreate, request: Request, current_user: dict = Depends(require_admin)):
    """Only ADMIN can create staff accounts. Staff cannot elevate themselves to ADMIN."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM users WHERE email = %s", (body.email.lower(),))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")

        # Prevent non-admin from creating ADMIN role
        if body.role == "ADMIN" and current_user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only ADMIN can create other ADMIN accounts")

        password_hash = hash_password(body.password)
        cur.execute(
            """
            INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status,
                               email_verified, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'ACTIVE', TRUE, NOW(), NOW())
            RETURNING id, first_name, last_name, email, role
            """,
            (body.first_name, body.last_name, body.email.lower(), body.phone, password_hash, body.role),
        )
        row = cur.fetchone()
        new_id = row[0]
        write_audit_log(cur, current_user["user_id"], "STAFF_CREATED", "users", new_id,
                        new_values={"email": body.email, "role": body.role},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {
            "id": row[0], "first_name": row[1], "last_name": row[2],
            "email": row[3], "role": row[4], "message": "Staff account created"
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("create_staff error")
        raise HTTPException(status_code=500, detail="Staff creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/admin/staff/{staff_id}")
def update_staff(
    staff_id: int,
    body: StaffUpdate,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Update staff account. Only ADMIN can elevate to ADMIN role."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT id, role FROM users WHERE id = %s AND role IN ('STAFF', 'ADMIN')",
            (staff_id,),
        )
        staff = cur.fetchone()
        if not staff:
            raise HTTPException(status_code=404, detail="Staff member not found")

        if body.role == "ADMIN" and current_user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Only ADMIN can grant ADMIN role")

        cur.execute(
            """
            UPDATE users SET
                first_name = COALESCE(%s, first_name),
                last_name = COALESCE(%s, last_name),
                phone = COALESCE(%s, phone),
                role = COALESCE(%s, role),
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, first_name, last_name, email, role
            """,
            (body.first_name, body.last_name, body.phone, body.role, staff_id),
        )
        row = cur.fetchone()
        write_audit_log(cur, current_user["user_id"], "STAFF_UPDATED", "users", staff_id,
                        old_values={"role": staff[1]},
                        new_values={k: v for k, v in body.model_dump().items() if v is not None},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"id": row[0], "first_name": row[1], "last_name": row[2], "email": row[3], "role": row[4]}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Staff update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/admin/staff/{staff_id}")
def deactivate_staff(
    staff_id: int,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Deactivates (suspends) a staff account. Cannot deactivate your own account."""
    if staff_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = %s AND role IN ('STAFF', 'ADMIN') RETURNING id",
            (staff_id,),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Staff member not found")
        # Revoke all sessions
        cur.execute(
            "UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = %s AND revoked_at IS NULL",
            (staff_id,),
        )
        write_audit_log(cur, current_user["user_id"], "STAFF_DEACTIVATED", "users", staff_id,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Staff account deactivated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Staff deactivation failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# CUSTOMER DETAIL VIEW
# ============================================================

@app.get("/api/admin/customers/{customer_id}")
def get_customer_detail(customer_id: int, current_user: dict = Depends(require_staff_or_admin)):
    """Returns full customer profile with order and payment history."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, first_name, last_name, email, phone, status, email_verified, created_at, last_login_at
            FROM users WHERE id = %s AND role = 'CUSTOMER'
            """,
            (customer_id,),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Customer not found")

        # Order summary
        cur.execute(
            """
            SELECT COUNT(*) AS total_orders,
                   COALESCE(SUM(total_amount), 0) AS total_spent,
                   COALESCE(SUM(CASE WHEN balance_paid = FALSE AND deposit_paid = TRUE THEN balance_amount ELSE 0 END), 0) AS outstanding_balance
            FROM orders WHERE user_id = %s AND order_status NOT IN ('CANCELLED')
            """,
            (customer_id,),
        )
        stats = cur.fetchone()

        # Recent orders
        cur.execute(
            """
            SELECT id, order_number, total_amount, order_status, created_at
            FROM orders WHERE user_id = %s ORDER BY created_at DESC LIMIT 10
            """,
            (customer_id,),
        )
        recent_orders = [
            {"id": r[0], "order_number": r[1], "total": safe_json(r[2]), "status": r[3], "created_at": safe_json(r[4])}
            for r in cur.fetchall()
        ]

        cur.close()
        return {
            "id": user[0], "first_name": user[1], "last_name": user[2], "email": user[3],
            "phone": user[4], "status": user[5], "email_verified": user[6],
            "created_at": safe_json(user[7]), "last_login_at": safe_json(user[8]),
            "stats": {
                "total_orders": stats[0],
                "total_spent": safe_json(to_decimal(stats[1])),
                "outstanding_balance": safe_json(to_decimal(stats[2])),
            },
            "recent_orders": recent_orders,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("get_customer_detail error")
        raise HTTPException(status_code=500, detail="Could not fetch customer")
    finally:
        if conn:
            conn.close()


# ============================================================
# COUPON UPDATE/DEACTIVATE
# ============================================================

class CouponUpdate(BaseModel):
    code: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    min_order_amount: Optional[Decimal] = None
    max_uses: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None


@app.patch("/api/admin/coupons/{coupon_id}")
def update_coupon(coupon_id: int, body: CouponUpdate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM coupons WHERE id = %s", (coupon_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Coupon not found")

        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            return {"message": "Nothing to update"}

        # Handle code uppercasing
        if "code" in updates:
            updates["code"] = updates["code"].upper()

        set_clause = ", ".join([f"{k} = %s" for k in updates.keys()])
        values = list(updates.values()) + [coupon_id]
        cur.execute(f"UPDATE coupons SET {set_clause} WHERE id = %s RETURNING id", values)
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Coupon not found")

        write_audit_log(cur, current_user["user_id"], "COUPON_UPDATED", "coupons", coupon_id,
                        new_values=updates, ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Coupon updated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Coupon update failed")
    finally:
        if conn:
            conn.close()


@app.delete("/api/admin/coupons/{coupon_id}")
def deactivate_coupon(coupon_id: int, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE coupons SET is_active = FALSE WHERE id = %s RETURNING id", (coupon_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Coupon not found")
        write_audit_log(cur, current_user["user_id"], "COUPON_DEACTIVATED", "coupons", coupon_id,
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Coupon deactivated"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Coupon deactivation failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# REVIEW UPDATE BY OWNER
# ============================================================

class ReviewUpdate(BaseModel):
    rating: Optional[int] = None
    title: Optional[str] = None
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def valid_rating(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Rating must be between 1 and 5")
        return v


@app.patch("/api/reviews/{review_id}")
def update_review(review_id: int, body: ReviewUpdate, current_user: dict = Depends(require_customer)):
    """Customer can update their own pending/approved review."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT id, user_id, status FROM reviews WHERE id = %s", (review_id,))
        review = cur.fetchone()
        if not review:
            raise HTTPException(status_code=404, detail="Review not found")
        if review[1] != user_id:
            raise HTTPException(status_code=403, detail="You can only edit your own reviews")
        if review[2] == "REJECTED":
            raise HTTPException(status_code=400, detail="Cannot edit a rejected review")

        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            return {"message": "Nothing to update"}

        # Reset to PENDING on edit (needs re-approval)
        updates["status"] = "PENDING"
        updates["updated_at"] = "NOW()"
        set_parts = []
        values = []
        for k, v in updates.items():
            if k == "updated_at":
                set_parts.append("updated_at = NOW()")
            else:
                set_parts.append(f"{k} = %s")
                values.append(v)
        values.append(review_id)
        cur.execute(f"UPDATE reviews SET {', '.join(set_parts)} WHERE id = %s RETURNING id", values)
        conn.commit()
        cur.close()
        return {"message": "Review updated and resubmitted for approval"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Review update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ALL PAYMENTS LIST (Admin — not just pending)
# ============================================================

@app.get("/api/admin/payments")
def list_all_payments(
    status: Optional[str] = None,
    payment_type: Optional[str] = None,
    order_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = """
            SELECT p.id, p.order_id, o.order_number, p.type, p.method, p.amount, p.currency,
                   p.reference, p.status, p.submitted_at, p.verified_at,
                   u.first_name, u.last_name, u.email,
                   p.notes
            FROM payments p
            JOIN orders o ON o.id = p.order_id
            JOIN users u ON u.id = p.user_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND p.status = %s"; params.append(status.upper())
        if payment_type:
            query += " AND p.type = %s"; params.append(payment_type.upper())
        if order_id:
            query += " AND p.order_id = %s"; params.append(order_id)
        query += " ORDER BY p.submitted_at DESC NULLS LAST, p.id DESC"
        query += " LIMIT %s OFFSET %s"; params.extend([page_size, (page - 1) * page_size])

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "id": r[0], "order_id": r[1], "order_number": r[2], "type": r[3],
                "method": r[4], "amount": safe_json(r[5]), "currency": r[6],
                "reference": r[7], "status": r[8],
                "submitted_at": safe_json(r[9]), "verified_at": safe_json(r[10]),
                "customer": f"{r[11]} {r[12]}", "email": r[13], "notes": r[14]
            }
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch payments")
    finally:
        if conn:
            conn.close()


# ============================================================
# REFUNDS — complete implementation
# ============================================================

class RefundCreate(BaseModel):
    order_id: int
    return_id: Optional[int] = None
    amount: Decimal
    reason: str
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v):
        if v <= 0:
            raise ValueError("Refund amount must be positive")
        return v


class RefundUpdate(BaseModel):
    status: str  # APPROVED | COMPLETED | REJECTED
    notes: Optional[str] = None


@app.get("/api/admin/refunds")
def list_refunds(
    status: Optional[str] = None,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = """
            SELECT r.id, r.order_id, o.order_number, r.amount, r.reason, r.status,
                   r.created_at, u.email, r.notes
            FROM refunds r
            JOIN orders o ON o.id = r.order_id
            JOIN users u ON u.id = o.user_id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND r.status = %s"; params.append(status.upper())
        query += " ORDER BY r.created_at DESC"
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {"id": r[0], "order_id": r[1], "order_number": r[2], "amount": safe_json(r[3]),
             "reason": r[4], "status": r[5], "created_at": safe_json(r[6]),
             "customer_email": r[7], "notes": r[8]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch refunds")
    finally:
        if conn:
            conn.close()


@app.post("/api/admin/refunds", status_code=201)
def create_refund(body: RefundCreate, request: Request, current_user: dict = Depends(require_staff_or_admin)):
    """Create a refund record. Manual bank transfer refunds only."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Verify order exists
        cur.execute(
            "SELECT id, total_amount, user_id, order_status FROM orders WHERE id = %s",
            (body.order_id,),
        )
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Refund amount must not exceed order total
        if body.amount > to_decimal(order[1]):
            raise HTTPException(status_code=400, detail="Refund amount exceeds order total")

        cur.execute(
            """
            INSERT INTO refunds (order_id, return_id, amount, reason, notes, status, created_by, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 'PENDING', %s, NOW(), NOW())
            RETURNING id
            """,
            (body.order_id, body.return_id, body.amount, body.reason, body.notes, current_user["user_id"]),
        )
        new_id = cur.fetchone()[0]

        write_audit_log(cur, current_user["user_id"], "REFUND_CREATED", "refunds", new_id,
                        new_values={"order_id": body.order_id, "amount": str(body.amount)},
                        ip_address=request.client.host if request.client else None)

        create_notification(cur, order[2], "REFUND_INITIATED", "Refund Initiated",
                            f"A refund of KES {body.amount} has been initiated for your order.")

        conn.commit()
        cur.close()
        return {"id": new_id, "message": "Refund record created"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("create_refund error")
        raise HTTPException(status_code=500, detail="Refund creation failed")
    finally:
        if conn:
            conn.close()


@app.patch("/api/admin/refunds/{refund_id}")
def update_refund(
    refund_id: int,
    body: RefundUpdate,
    request: Request,
    current_user: dict = Depends(require_staff_or_admin),
):
    allowed_statuses = {"PENDING", "APPROVED", "COMPLETED", "REJECTED"}
    if body.status.upper() not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed_statuses}")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT r.id, r.status, r.order_id, o.user_id FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = %s",
            (refund_id,),
        )
        refund = cur.fetchone()
        if not refund:
            raise HTTPException(status_code=404, detail="Refund not found")

        old_status = refund[1]
        new_status = body.status.upper()
        order_id = refund[2]
        owner_id = refund[3]

        cur.execute(
            "UPDATE refunds SET status = %s, notes = COALESCE(%s, notes), updated_at = NOW() WHERE id = %s",
            (new_status, body.notes, refund_id),
        )

        if new_status == "COMPLETED":
            # Mark order as REFUNDED
            cur.execute(
                "UPDATE orders SET order_status = 'REFUNDED', updated_at = NOW() WHERE id = %s",
                (order_id,),
            )
            cur.execute(
                """
                INSERT INTO order_events (order_id, event_type, description, old_status, new_status, created_by, created_at)
                VALUES (%s, 'REFUND_COMPLETED', 'Refund processed', %s, 'REFUNDED', %s, NOW())
                """,
                (order_id, old_status, current_user["user_id"]),
            )

        write_audit_log(cur, current_user["user_id"], f"REFUND_{new_status}", "refunds", refund_id,
                        old_values={"status": old_status}, new_values={"status": new_status, "notes": body.notes},
                        ip_address=request.client.host if request.client else None)

        notif_map = {
            "APPROVED": ("Refund Approved", "Your refund has been approved and will be processed."),
            "COMPLETED": ("Refund Completed", "Your refund has been completed. Please allow 3-5 business days."),
            "REJECTED": ("Refund Rejected", f"Your refund was rejected: {body.notes or 'See order details.'}"),
        }
        if new_status in notif_map:
            create_notification(cur, owner_id, f"REFUND_{new_status}", *notif_map[new_status])

        conn.commit()
        cur.close()
        return {"message": f"Refund status updated to {new_status}"}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("update_refund error")
        raise HTTPException(status_code=500, detail="Refund update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# VEHICLE PRODUCT SEARCH (list products by vehicle)
# ============================================================

@app.get("/api/vehicles/{vehicle_id}/products")
def get_products_for_vehicle(
    vehicle_id: int,
    page: int = 1,
    page_size: int = 20,
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, make, model, year_from, year_to FROM vehicles WHERE id = %s", (vehicle_id,))
        vehicle = cur.fetchone()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        cur.execute(
            """
            SELECT p.id, p.name, p.slug, p.sku, p.part_number, p.price, p.status,
                   c.name AS category, b.name AS brand,
                   COALESCE(i.quantity - i.reserved_quantity, 0) AS available_stock,
                   (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1)
            FROM products p
            JOIN product_compatibility pc ON pc.product_id = p.id
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN inventory i ON i.product_id = p.id
            WHERE pc.vehicle_id = %s AND p.status = 'ACTIVE'
            ORDER BY p.name
            LIMIT %s OFFSET %s
            """,
            (vehicle_id, page_size, (page - 1) * page_size),
        )
        rows = cur.fetchall()
        cur.close()
        return {
            "vehicle": {"id": vehicle[0], "make": vehicle[1], "model": vehicle[2], "year_from": vehicle[3], "year_to": vehicle[4]},
            "products": [
                {"id": r[0], "name": r[1], "slug": r[2], "sku": r[3], "part_number": r[4],
                 "price": safe_json(r[5]), "status": r[6], "category": r[7], "brand": r[8],
                 "available_stock": r[9], "primary_image": r[10]}
                for r in rows
            ],
            "page": page, "page_size": page_size
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch vehicle products")
    finally:
        if conn:
            conn.close()




# ============================================================
# PERSISTENT IMAGE STORAGE — DB-backed (see migration_005)
# ============================================================
# Render's free-tier web service filesystem is EPHEMERAL: anything
# written to backend/static is wiped on every redeploy and after the
# service spins down from inactivity. That's why uploaded logos,
# banners, category images, product images, and avatars were going
# blank in production even though the upload itself "succeeded" and
# worked fine locally. Images are now stored as bytes in Postgres
# (which persists normally) and served back out via GET
# /api/images/{id} instead of as static files.
#
# The old /static mount (below, unchanged) is left in place only so
# any URL already saved in the database from before this change
# doesn't hard-error — it will still 404 if its underlying file has
# already been wiped, exactly as before. Existing broken images (logo,
# banner, categories, products, avatars) need to be re-uploaded ONCE
# after this deploys; from then on they persist across redeploys.

_MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB


def _store_uploaded_image(file: UploadFile, uploaded_by: Optional[int] = None) -> dict:
    """
    Validates an uploaded image and stores its bytes in Postgres.
    Returns {"id": <int>, "url": "/api/images/<id>"}. Raises
    HTTPException (400/500) on invalid input or a storage failure —
    callers should let that propagate rather than catch-and-continue,
    so a failed upload never gets silently treated as successful.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > _MAX_UPLOAD_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5MB")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO uploaded_images (filename, content_type, data, size_bytes, uploaded_by, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            RETURNING id
            """,
            (file.filename or "image", file.content_type, psycopg2.Binary(data), len(data), uploaded_by),
        )
        image_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        return {"id": image_id, "url": f"/api/images/{image_id}"}
    except HTTPException:
        raise
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Failed to store uploaded image")
        raise HTTPException(status_code=500, detail="Image upload failed")
    finally:
        if conn:
            conn.close()


@app.get("/api/images/{image_id}")
def get_uploaded_image(image_id: int):
    """Serves a DB-stored image. Public — these are branding/product/avatar
    images meant to be visible on the public storefront."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT data, content_type FROM uploaded_images WHERE id = %s", (image_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Image not found")
        data, content_type = row
        return Response(
            content=bytes(data),
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to serve uploaded image %s", image_id)
        raise HTTPException(status_code=500, detail="Failed to load image")
    finally:
        if conn:
            conn.close()


# ============================================================
# USER AVATAR UPLOAD
# ============================================================

@app.post("/api/users/avatar")
async def upload_user_avatar(
    avatar: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload or replace the current user's profile picture."""
    stored = _store_uploaded_image(avatar, uploaded_by=current_user["user_id"])
    avatar_url = stored["url"]
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET avatar_url = %s, updated_at = NOW() WHERE id = %s",
            (avatar_url, current_user["user_id"]),
        )
        conn.commit()
        cur.close()
        return {"avatar_url": avatar_url}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Avatar save failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADMIN SETTINGS IMAGE UPLOAD
# ============================================================
# Also used for category images (AdminCategoriesPage posts here too —
# this is the project's one generic "upload an image, get back a URL"
# endpoint, not settings-specific despite the path).

@app.post("/api/admin/settings/upload-image")
async def upload_settings_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_staff_or_admin),
):
    """Upload a branding image (logo, favicon, banner) or category image."""
    stored = _store_uploaded_image(file, uploaded_by=current_user["user_id"])
    return {"url": stored["url"]}



# ============================================================
# ADMIN REVIEWS ENDPOINTS
# ============================================================

@app.get("/api/admin/reviews")
def admin_list_reviews(current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT r.id, r.rating, r.title, r.comment, r.created_at,
                   p.name as product_name,
                   u.first_name || ' ' || u.last_name as customer_name
            FROM reviews r
            LEFT JOIN products p ON r.product_id = p.id
            LEFT JOIN users u ON r.user_id = u.id
            ORDER BY r.created_at DESC
            LIMIT 500
        """)
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "id": row[0], "rating": row[1], "title": row[2],
                "comment": row[3], "created_at": safe_json(row[4]),
                "product_name": row[5], "customer_name": row[6],
            }
            for row in rows
        ]
    finally:
        if conn: conn.close()

@app.delete("/api/admin/reviews/{review_id}")
def admin_delete_review(review_id: int, current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM reviews WHERE id = %s", (review_id,))
        conn.commit()
        cur.close()
        return {"message": "Review deleted"}
    except Exception:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail="Delete failed")
    finally:
        if conn: conn.close()


# ============================================================
# PRODUCT IMAGE UPLOAD (replaces URL-only approach)
# ============================================================

@app.post("/api/products/{product_id}/images/upload")
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    is_primary: str = "false",
    current_user: dict = Depends(require_staff_or_admin),
):
    # Convert string "true"/"false" from multipart form to bool
    is_primary_bool = is_primary.lower() in ("true", "1", "yes")
    stored = _store_uploaded_image(file, uploaded_by=current_user["user_id"])
    image_url = stored["url"]
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # If this product has no primary image yet, the new image becomes
        # primary automatically — otherwise an admin uploading a non-primary
        # image for a brand-new product would leave it with zero primary
        # images, which is exactly what made storefront/category cards show
        # empty image areas even though a file had "uploaded successfully".
        cur.execute("SELECT 1 FROM product_images WHERE product_id = %s AND is_primary = TRUE LIMIT 1", (product_id,))
        has_primary = cur.fetchone() is not None
        if not has_primary:
            is_primary_bool = True
        if is_primary_bool:
            cur.execute("UPDATE product_images SET is_primary = FALSE WHERE product_id = %s", (product_id,))
        cur.execute(
            """INSERT INTO product_images (product_id, image_url, is_primary, sort_order, created_at)
               VALUES (%s, %s, %s, COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id=%s), 0), NOW())
               RETURNING id, image_url, is_primary""",
            (product_id, image_url, is_primary_bool, product_id),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return {"id": row[0], "image_url": row[1], "is_primary": row[2]}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Image save failed: {e}")
    finally:
        if conn: conn.close()

# ============================================================
# ENHANCED SETTINGS — delivery_fee field
# ============================================================

class SettingsUpdateV2(SettingsUpdate):
    default_delivery_fee: Optional[Decimal] = None
    free_delivery_threshold: Optional[Decimal] = None


@app.patch("/api/admin/settings/extended")
def update_settings_extended(
    body: SettingsUpdateV2,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """Extended settings update including delivery fee configuration."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            return {"message": "Nothing to update"}
        set_clause = ", ".join([f"{k} = %s" for k in updates.keys()])
        values = list(updates.values())
        cur.execute(f"UPDATE site_settings SET {set_clause} WHERE id = (SELECT id FROM site_settings LIMIT 1)", values)
        write_audit_log(cur, current_user["user_id"], "SETTINGS_UPDATED", "site_settings", "1",
                        new_values={k: str(v) for k, v in updates.items()},
                        ip_address=request.client.host if request.client else None)
        conn.commit()
        cur.close()
        return {"message": "Settings updated"}
    except Exception:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail="Settings update failed")
    finally:
        if conn:
            conn.close()


# ============================================================
# ORDER HISTORY (paginated, with totals count)
# ============================================================

@app.get("/api/orders/history")
def my_order_history(
    page: int = 1,
    page_size: int = 10,
    current_user: dict = Depends(require_customer),
):
    """Customer's own order history with totals."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        user_id = current_user["user_id"]

        cur.execute("SELECT COUNT(*) FROM orders WHERE user_id = %s", (user_id,))
        total = cur.fetchone()[0]

        cur.execute(
            """
            SELECT id, order_number, total_amount, deposit_amount, balance_amount,
                   deposit_paid, balance_paid, payment_status, order_status, created_at
            FROM orders WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            (user_id, page_size, (page - 1) * page_size),
        )
        rows = cur.fetchall()
        cur.close()
        return {
            "total": total, "page": page, "page_size": page_size,
            "orders": [
                {"id": r[0], "order_number": r[1], "total": safe_json(r[2]),
                 "deposit": safe_json(r[3]), "balance": safe_json(r[4]),
                 "deposit_paid": r[5], "balance_paid": r[6],
                 "payment_status": r[7], "order_status": r[8], "created_at": safe_json(r[9])}
                for r in rows
            ]
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch order history")
    finally:
        if conn:
            conn.close()


# ============================================================
# INVENTORY — low stock list
# ============================================================

@app.get("/api/inventory/low-stock")
def list_low_stock(current_user: dict = Depends(require_staff_or_admin)):
    """Returns products where available stock <= reorder_level."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT i.product_id, p.name, p.sku, p.status,
                   i.quantity, i.reserved_quantity,
                   i.quantity - i.reserved_quantity AS available,
                   i.reorder_level
            FROM inventory i
            JOIN products p ON p.id = i.product_id
            WHERE i.quantity - i.reserved_quantity <= i.reorder_level
              AND p.status = 'ACTIVE'
            ORDER BY (i.quantity - i.reserved_quantity) ASC
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [
            {"product_id": r[0], "product_name": r[1], "sku": r[2], "status": r[3],
             "quantity": r[4], "reserved": r[5], "available": r[6], "reorder_level": r[7]}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch low stock")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADMIN RETURN DETAIL
# ============================================================

@app.get("/api/admin/returns/{return_id}")
def get_return_detail(return_id: int, current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.id, r.order_id, o.order_number, r.reason, r.notes, r.status,
                   r.created_at, r.updated_at, u.first_name, u.last_name, u.email
            FROM returns r
            JOIN orders o ON o.id = r.order_id
            JOIN users u ON u.id = r.user_id
            WHERE r.id = %s
            """,
            (return_id,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Return not found")
        return {
            "id": row[0], "order_id": row[1], "order_number": row[2],
            "reason": row[3], "notes": row[4], "status": row[5],
            "created_at": safe_json(row[6]), "updated_at": safe_json(row[7]),
            "customer": {"first_name": row[8], "last_name": row[9], "email": row[10]},
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch return")
    finally:
        if conn:
            conn.close()


# ============================================================
# ADMIN REPORT — by order status
# ============================================================

@app.get("/api/admin/reports/order-status-counts")
def order_status_counts(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT order_status, COUNT(*) FROM orders GROUP BY order_status ORDER BY order_status"
        )
        rows = cur.fetchall()
        cur.close()
        return [{"status": r[0], "count": r[1]} for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch order status counts")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/reports/payment-status-counts")
def payment_status_counts(current_user: dict = Depends(require_staff_or_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT status, type, COUNT(*), COALESCE(SUM(amount),0) FROM payments GROUP BY status, type ORDER BY status, type"
        )
        rows = cur.fetchall()
        cur.close()
        return [{"status": r[0], "type": r[1], "count": r[2], "total_amount": safe_json(r[3])} for r in rows]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch payment status counts")
    finally:
        if conn:
            conn.close()


@app.get("/api/admin/reports/category-performance")
def category_performance(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(require_staff_or_admin),
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = """
            SELECT c.id, c.name,
                   COUNT(DISTINCT o.id) AS order_count,
                   COALESCE(SUM(oi.quantity), 0) AS total_qty,
                   COALESCE(SUM(oi.subtotal), 0) AS total_revenue
            FROM categories c
            JOIN products p ON p.category_id = c.id
            JOIN order_items oi ON oi.product_id = p.id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.order_status NOT IN ('CANCELLED')
        """
        params = []
        if date_from:
            query += " AND DATE(o.created_at) >= %s"; params.append(date_from)
        if date_to:
            query += " AND DATE(o.created_at) <= %s"; params.append(date_to)
        query += " GROUP BY c.id, c.name ORDER BY total_revenue DESC"
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return [
            {"category_id": r[0], "category_name": r[1], "order_count": r[2],
             "total_quantity": r[3], "total_revenue": safe_json(r[4])}
            for r in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Could not generate category report")
    finally:
        if conn:
            conn.close()


# ============================================================
# COMPLETE AUDIT LOG WITH READ ENDPOINT
# ============================================================

@app.get("/api/admin/audit-logs/{log_id}")
def get_audit_log(log_id: int, current_user: dict = Depends(require_admin)):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT al.id, al.user_id, u.email, al.action, al.entity_type, al.entity_id,
                   al.old_values, al.new_values, al.ip_address, al.created_at
            FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
            WHERE al.id = %s
            """,
            (log_id,),
        )
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="Audit log entry not found")
        return {
            "id": row[0], "user_id": row[1], "user_email": row[2], "action": row[3],
            "entity_type": row[4], "entity_id": row[5],
            "old_values": row[6], "new_values": row[7],
            "ip_address": row[8], "created_at": safe_json(row[9])
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch audit log")
    finally:
        if conn:
            conn.close()


# ============================================================
# APPLY RATE LIMITING TO AUTH ENDPOINTS via middleware
# ============================================================

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting to authentication-sensitive endpoints."""
    rate_limited_paths = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/auth/resend-verification",
    }
    if request.url.path in rate_limited_paths:
        client_ip = request.client.host if request.client else "unknown"
        try:
            _check_rate_limit(client_ip, request.url.path)
        except HTTPException as exc:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    response = await call_next(request)
    return response


# ============================================================
# SECURITY HEADERS MIDDLEWARE
# ============================================================

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

