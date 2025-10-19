from fastapi import FastAPI, UploadFile, File, Query, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from .albums_service import ALBUMS_BASE  # נשתמש באותו בסיס של אלבומים
from fastapi import Depends
from .auth import router as auth_router, current_user
from .albums_api import router as my_albums_router
from .guest_api import router as guest_router
from .host_api import router as host_router

import os

from .config import get_settings
from .albums_service import (
    extract_zip_to_album, index_album_images, index_progress,
    search_in_album, package_results_zip
)


app = FastAPI(title="Face Finder API", version="0.4.0")
app.include_router(auth_router)
app.include_router(my_albums_router)
app.include_router(guest_router)
app.include_router(host_router)


@app.get("/api/secure")
def secure(user = Depends(current_user)):
    return {"ok": True, "user_id": user.id} 

sett = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=sett.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount(
    "/static/albums",
    StaticFiles(directory=str(ALBUMS_BASE), html=False),
    name="albums-static"
)

# --- Albums ---

@app.post("/api/albums/{album_id}/album")
async def api_album_upload(album_id: str, zip: UploadFile = File(...), background: BackgroundTasks = None):
    res = extract_zip_to_album(album_id, zip.file)
    # start incremental indexing in background (process only new files)
    if background is not None:
        background.add_task(index_album_images, album_id, False, 2000)
    return {**res, "indexing": "started"}

@app.get("/api/albums/{album_id}/index/progress")
async def api_album_index_progress(album_id: str):
    return index_progress(album_id)

@app.post("/api/albums/{album_id}/search")
async def api_album_search(
    album_id: str,
    selfies: list[UploadFile] = File(...),
    threshold: float = Query(0.40),
    top_k: int = Query(500),
):
    files = [await f.read() for f in selfies]
    return search_in_album(album_id, files, threshold, top_k)

@app.get("/api/albums/{album_id}/download")
async def api_album_download(album_id: str):
    z = package_results_zip(album_id)
    return Response(z, media_type="application/zip", headers={
        "Content-Disposition": "attachment; filename=matched_images.zip"
    })

# (רשות) בריאות
@app.get("/health")
def health():
    return {"ok": True}
