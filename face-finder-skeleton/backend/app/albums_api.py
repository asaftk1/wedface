from __future__ import annotations
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlmodel import Session, select
from pydantic import BaseModel
import secrets, string
from pathlib import Path

from .auth import current_user, get_session
from .models import Album, User
from .albums_service import extract_zip_to_album, index_album_images, ALBUMS_BASE

router = APIRouter(prefix="/api/my/albums", tags=["albums"])

def _slug(n=8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))

def _host_key(n=24) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))

class AlbumCreateIn(BaseModel):
    title: str
    is_public: bool = True

class AlbumOut(BaseModel):
    id: int
    slug: str
    title: str
    is_public: bool

@router.post("", response_model=AlbumOut)
def create_album(payload: AlbumCreateIn, session: Session = Depends(get_session), user: User = Depends(current_user)):
    slug = _slug()
    while session.exec(select(Album).where(Album.slug == slug)).first():
        slug = _slug()
    album = Album(
        owner_user_id=user.id,
        slug=slug,
        title=payload.title,
        is_public=payload.is_public,
        host_key=_host_key(),  # ← חדש
    )
    session.add(album)
    session.commit()
    session.refresh(album)
    return AlbumOut(id=album.id, slug=album.slug, title=album.title, is_public=album.is_public)

@router.get("", response_model=List[AlbumOut])
def list_my_albums(session: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = session.exec(select(Album).where(Album.owner_user_id == user.id).order_by(Album.created_at.desc())).all()
    return [AlbumOut(id=r.id, slug=r.slug, title=r.title, is_public=r.is_public) for r in rows]

@router.get("/{slug}", response_model=AlbumOut)
def get_album(slug: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    album = session.exec(select(Album).where(Album.slug == slug, Album.owner_user_id == user.id)).first()
    if not album:
        raise HTTPException(status_code=404, detail="album_not_found")
    return AlbumOut(id=album.id, slug=album.slug, title=album.title, is_public=album.is_public)

@router.delete("/{slug}")
def delete_album(slug: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    album = session.exec(select(Album).where(Album.slug == slug, Album.owner_user_id == user.id)).first()
    if not album:
        raise HTTPException(status_code=404, detail="album_not_found")
    session.delete(album)
    session.commit()
    # (אופציונלי) מחיקת קבצים מדיסק – נשאיר לשלב הבא
    return {"ok": True}

@router.post("/{slug}/upload")
async def upload_album_zip(slug: str,
                           zip: UploadFile = File(...),
                           background: BackgroundTasks = None,
                           session: Session = Depends(get_session),
                           user: User = Depends(current_user)):
    album = session.exec(select(Album).where(Album.slug == slug, Album.owner_user_id == user.id)).first()
    if not album:
        raise HTTPException(status_code=404, detail="album_not_found")
    res = extract_zip_to_album(slug, zip.file)
    if background is not None:
        background.add_task(index_album_images, slug, False, 2000)  # אינדוקס מצטבר (רק קבצים חדשים)
    return {**res, "indexing": "started"}

class ImageListOut(BaseModel):
    images: List[str]

@router.get("/{slug}/images", response_model=ImageListOut)
def list_album_images(slug: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    album = session.exec(select(Album).where(Album.slug == slug, Album.owner_user_id == user.id)).first()
    if not album:
        raise HTTPException(status_code=404, detail="album_not_found")
    # רשימת תמונות מתוך התיקייה data/albums/<slug>/album
    root = Path(ALBUMS_BASE) / slug / "album"
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    images: List[str] = []
    if root.exists():
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in exts:
                rel = p.relative_to(root).as_posix()
                images.append(rel)
    images.sort()
    return ImageListOut(images=images)

class HostLinkOut(BaseModel):
    slug: str
    host_url: str
    host_key: str

@router.get("/{slug}/host_link", response_model=HostLinkOut)
def get_host_link(slug: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    album = session.exec(select(Album).where(Album.slug == slug, Album.owner_user_id == user.id)).first()
    if not album:
        raise HTTPException(status_code=404, detail="album_not_found")
    # אם משום מה אין host_key (אלבום ישן), ניצור ונשמור
    if not album.host_key:
        album.host_key = _host_key()
        session.add(album); session.commit(); session.refresh(album)
    # ה-Frontend יבנה URL מלא מה-origin שלו:
    return HostLinkOut(slug=album.slug, host_key=album.host_key, host_url=f"/host/{album.slug}?k={album.host_key}")

