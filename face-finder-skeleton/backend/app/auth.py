from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional
import os
from sqlmodel import SQLModel, Session, create_engine, select
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from passlib.hash import bcrypt_sha256
from sqlalchemy import text


from .models import User, Album

# ===== Settings =====
SECRET_KEY = os.environ.get("FF_SECRET_KEY", "dev-insecure-secret")  # החלף בפרודקשן
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

DB_PATH = os.environ.get("FF_AUTH_DB", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "auth.db")))
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
def ensure_sqlite_column(engine, table: str, column: str, type_sql: str):
    with engine.connect() as conn:
        cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table});")]
        if column not in cols:
            conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {type_sql};")

# ודא שהעמודה קיימת בטבלת album
ensure_sqlite_column(engine, "album", "host_key", "TEXT")
SQLModel.metadata.create_all(engine)

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

def get_session():
    with Session(engine) as session:
        yield session

def hash_password(p: str) -> str:
    return bcrypt_sha256.hash(p)

def verify_password(p: str, h: str) -> bool:
    return bcrypt_sha256.verify(p, h)

def create_access_token(sub: str, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = {"sub": sub, "iat": int(datetime.utcnow().timestamp())}
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_user_by_email(session: Session, email: str) -> Optional[User]:
    return session.exec(select(User).where(User.email == email)).first()

# ===== Schemas =====
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MeOut(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str]
    is_active: bool

# ===== Router =====
router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=MeOut)
def register(payload: RegisterIn, session: Session = Depends(get_session)):
    existing = get_user_by_email(session, payload.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="email_already_registered")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return MeOut(id=user.id, email=user.email, full_name=user.full_name, is_active=user.is_active)

@router.post("/login", response_model=TokenOut)
def login(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    # OAuth2PasswordRequestForm מצפה לשדות: username, password
    user = get_user_by_email(session, form_data.username.lower())
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="invalid_credentials")
    token = create_access_token(sub=str(user.id))
    return TokenOut(access_token=token)

# ===== dependency to protect routes =====
from fastapi import Header

def current_user(session: Session = Depends(get_session), authorization: Optional[str] = Header(None)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="invalid_token")
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="inactive_user")
    return user

@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    return MeOut(id=user.id, email=user.email, full_name=user.full_name, is_active=user.is_active)
