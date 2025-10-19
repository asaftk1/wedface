from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

class Album(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: int = Field(index=True)
    slug: str = Field(index=True, unique=True)   # מזהה ציבורי לשיתוף
    title: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_public: bool = Field(default=True)
    host_key: Optional[str] = Field(default=None, index=True)

# --- אורחים ומועדפים ---
class Guest(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    album_slug: str = Field(index=True)
    name: Optional[str] = None
    email: Optional[str] = Field(default=None, index=True)  # לא חובה; מספיק גם שם+קוקי
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

class Favorite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    guest_id: int = Field(index=True)
    album_slug: str = Field(index=True)
    rel_path: str  # path יחסי לתיקיית album/
    created_at: datetime = Field(default_factory=datetime.utcnow)
