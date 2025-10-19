from __future__ import annotations
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response, Header
from sqlmodel import SQLModel, Session, select, create_engine
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt, JWTError
import os, io, zipfile
from pathlib import Path

from .models import Album, Guest, Favorite
from .albums_service import ALBUMS_BASE, package_results_zip
from .albums_service import search_in_album  # אם תרצה לאפשר חיפוש דרך ראוטר זה
from .auth import get_session  # ממחזר את Session/DB הקיים

router = APIRouter(prefix="/api/guest", tags=["guest"])

# ==== JWT לאורחים ====
G_SECRET = os.environ.get("FF_GUEST_SECRET", "dev-guest-secret")
G_ALGO = "HS256"
G_EXPIRE_MIN = 60*24*30  # 30 ימים

def create_guest_token(guest_id: int, album_slug: str) -> str:
    now = int(datetime.utcnow().timestamp())
    exp = now + G_EXPIRE_MIN*60
    return jwt.encode({"sub": f"guest:{guest_id}", "album": album_slug, "iat": now, "exp": exp}, G_SECRET, algorithm=G_ALGO)

def current_guest(session: Session = Depends(get_session), authorization: Optional[str] = Header(None)) -> Guest:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_guest_token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, G_SECRET, algorithms=[G_ALGO])
        sub = payload.get("sub") or ""
        if not sub.startswith("guest:"):
            raise HTTPException(status_code=401, detail="invalid_guest_token")
        gid = int(sub.split(":")[1])
        g = session.get(Guest, gid)
        if not g or not g.is_active:
            raise HTTPException(status_code=401, detail="guest_inactive")
        return g
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid_guest_token")

# ==== DTOs ====
class GuestRegisterIn(BaseModel):
    album_slug: str
    name: Optional[str] = None
    email: Optional[str] = None

class GuestTokenOut(BaseModel):
    token: str

class ImagesOut(BaseModel):
    images: List[str]

class FavoriteIn(BaseModel):
    rel_path: str

class FavoriteListOut(BaseModel):
    rel_paths: List[str]

# ==== אורח – רישום / כניסה ====
@router.post("/register", response_model=GuestTokenOut)
def guest_register(payload: GuestRegisterIn, session: Session = Depends(get_session)):
    # בדיקת האלבום קיים וציבורי
    alb = session.exec(select(Album).where(Album.slug == payload.album_slug)).first()
    if not alb or not alb.is_public:
        raise HTTPException(status_code=404, detail="album_not_found_or_private")

    # אם יש email, ננסה לאתר אורח קיים על אותו אלבום
    g = None
    if payload.email:
        g = session.exec(select(Guest).where(Guest.album_slug == payload.album_slug, Guest.email == payload.email)).first()
    # אם אין – ניצור חדש
    if not g:
        g = Guest(album_slug=payload.album_slug, name=payload.name, email=payload.email)
        session.add(g); session.commit(); session.refresh(g)

    token = create_guest_token(g.id, payload.album_slug)
    return GuestTokenOut(token=token)

# ==== רשימת תמונות באלבום (ציבורי) ====
@router.get("/albums/{slug}/images", response_model=ImagesOut)
def guest_list_images(slug: str, session: Session = Depends(get_session)):
    alb = session.exec(select(Album).where(Album.slug == slug)).first()
    if not alb or not alb.is_public:
        raise HTTPException(status_code=404, detail="album_not_found_or_private")

    root = Path(ALBUMS_BASE) / slug / "album"
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    out: List[str] = []
    if root.exists():
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in exts:
                out.append(p.relative_to(root).as_posix())
    out.sort()
    return ImagesOut(images=out)

# ==== חיפוש סלפי (אפשר להשתמש ב-public /api/albums/{slug}/search שכבר בנוי) ====
# אם תרצה שהאורח יקבל את התוצאות וגם יוכל לסמן מועדפים עליהן – אין צורך לשנות כאן.

# ==== מועדפים ====
@router.get("/favorites/{slug}", response_model=FavoriteListOut)
def list_favorites(slug: str, guest: Guest = Depends(current_guest), session: Session = Depends(get_session)):
    if guest.album_slug != slug:
        raise HTTPException(status_code=403, detail="wrong_album")
    rows = session.exec(select(Favorite).where(Favorite.guest_id == guest.id, Favorite.album_slug == slug)).all()
    return FavoriteListOut(rel_paths=[r.rel_path for r in rows])

@router.post("/favorites/{slug}/add")
def add_favorite(slug: str, payload: FavoriteIn, guest: Guest = Depends(current_guest), session: Session = Depends(get_session)):
    if guest.album_slug != slug:
        raise HTTPException(status_code=403, detail="wrong_album")
    exists = session.exec(select(Favorite).where(Favorite.guest_id == guest.id, Favorite.album_slug == slug, Favorite.rel_path == payload.rel_path)).first()
    if exists:
        return {"ok": True, "status": "exists"}
    fav = Favorite(guest_id=guest.id, album_slug=slug, rel_path=payload.rel_path)
    session.add(fav); session.commit()
    return {"ok": True}

@router.post("/favorites/{slug}/remove")
def remove_favorite(slug: str, payload: FavoriteIn, guest: Guest = Depends(current_guest), session: Session = Depends(get_session)):
    if guest.album_slug != slug:
        raise HTTPException(status_code=403, detail="wrong_album")
    row = session.exec(select(Favorite).where(Favorite.guest_id == guest.id, Favorite.album_slug == slug, Favorite.rel_path == payload.rel_path)).first()
    if row:
        session.delete(row); session.commit()
    return {"ok": True}

@router.get("/favorites/{slug}/download")
def download_favorites_zip(slug: str, guest: Guest = Depends(current_guest), session: Session = Depends(get_session)):
    if guest.album_slug != slug:
        raise HTTPException(status_code=403, detail="wrong_album")
    # נאגד את התמונות המסומנות של האורח ל-ZIP
    rows = session.exec(select(Favorite).where(Favorite.guest_id == guest.id, Favorite.album_slug == slug)).all()
    root = Path(ALBUMS_BASE) / slug / "album"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for r in rows:
            ap = root / r.rel_path
            if ap.exists():
                z.write(ap, arcname=r.rel_path)
    buf.seek(0)
    return Response(buf.read(), media_type="application/zip", headers={
        "Content-Disposition": f"attachment; filename={slug}_favorites.zip"
    })
