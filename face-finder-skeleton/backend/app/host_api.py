from fastapi import APIRouter, HTTPException, Depends, Query
from sqlmodel import Session, select
from pydantic import BaseModel
from .auth import get_session
from .models import Album

router = APIRouter(prefix="/api/host", tags=["host"])

class HostVerifyOut(BaseModel):
    ok: bool
    slug: str
    title: str

@router.get("/verify", response_model=HostVerifyOut)
def verify_host(slug: str = Query(...), k: str = Query(...), session: Session = Depends(get_session)):
    alb = session.exec(select(Album).where(Album.slug == slug)).first()
    if not alb or not alb.host_key or alb.host_key != k:
        raise HTTPException(status_code=404, detail="invalid_host_link")
    return HostVerifyOut(ok=True, slug=alb.slug, title=alb.title)
