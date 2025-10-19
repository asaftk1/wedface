from __future__ import annotations
import os, io, json, zipfile
from pathlib import Path
from typing import List, Dict
import numpy as np
import cv2

from .face_service import build_insightface, image_paths_in_dir, detect_and_embed_faces

# Base data dir: data/albums/<album_id>/{album, embeddings.npy, meta.json, results.json}
DATA_DIR = os.environ.get("FF_DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))
ALBUMS_BASE = Path(DATA_DIR) / "albums"
ALBUMS_BASE.mkdir(parents=True, exist_ok=True)

# in-memory progress store (naive)
_index_progress: Dict[str, Dict[str, int]] = {}

def _paths(album_id: str) -> Dict[str, Path]:
    root = ALBUMS_BASE / album_id
    return {
        "root": root,
        "album": root / "album",
        "emb": root / "embeddings.npy",
        "meta": root / "meta.json",
        "results": root / "results.json",
    }

# ---------- Upload ZIP ----------

def extract_zip_to_album(album_id: str, file_like) -> Dict:
    """Unzip images into album folder. Keeps subfolders. Ignores non-image files."""
    p = _paths(album_id)
    p["album"].mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(file_like.read())) as zf:
        for zi in zf.infolist():
            if zi.is_dir():
                continue
            rel = Path(zi.filename).as_posix()
            # prevent path traversal
            if rel.startswith("../") or rel.startswith("./../"):
                continue
            if not rel.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                continue
            out = p["album"] / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(zi) as src, open(out, "wb") as dst:
                dst.write(src.read())
    return {"album_id": album_id, "status": "ok"}

# ---------- Indexing (incremental) ----------

def _load_index(p):
    emb = np.load(p["emb"]) if p["emb"].exists() else np.zeros((0, 512), np.float32)
    meta = []
    if p["meta"].exists():
        with open(p["meta"], "r", encoding="utf-8") as f:
            meta = json.load(f)
    return emb, meta

def index_album_images(album_id: str, overwrite: bool = False, resize_max: int = 2000) -> Dict:
    """
    Build/extend index for an album.
    - overwrite=False (default): process only NEW images not in meta.json and append to existing index.
    - overwrite=True: rebuild index from scratch for all images.
    """
    p = _paths(album_id)
    album_dir = p["album"]
    if not album_dir.exists():
        return {"album_id": album_id, "count": 0, "error": "album not uploaded"}

    # load existing index
    if overwrite:
        old_embs = np.zeros((0, 512), np.float32)
        old_meta: List[Dict] = []
        already = set()
    else:
        old_embs, old_meta = _load_index(p)
        already = set(m["rel_path"] for m in old_meta)

    imgs = image_paths_in_dir(album_dir)
    # only new files:
    todo = []
    for img in imgs:
        rel = str(img.relative_to(album_dir)).replace("\\", "/")
        if rel not in already:
            todo.append(img)

    app = build_insightface()
    new_embs: List[np.ndarray] = []
    new_meta: List[Dict] = []

    total = len(todo)
    _index_progress[album_id] = {"processed": 0, "total": total}
    for i, img_path in enumerate(todo, 1):
        img = cv2.imdecode(np.fromfile(str(img_path), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            _index_progress[album_id]["processed"] = i
            continue
        if resize_max:
            h, w = img.shape[:2]
            if max(h, w) > resize_max:
                s = resize_max / float(max(h, w))
                img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)

        boxes, embs = detect_and_embed_faces(app, img)
        rel = str(img_path.relative_to(album_dir)).replace("\\", "/")
        for b, e in zip(boxes, embs):
            new_embs.append(e.astype(np.float32))
            new_meta.append({"rel_path": rel, "box": [float(x) for x in b]})
        _index_progress[album_id]["processed"] = i

    # merge old + new
    if len(new_embs):
        appended = np.vstack(new_embs).astype(np.float32)
        em = appended if old_embs.size == 0 else np.vstack([old_embs, appended]).astype(np.float32)
        me = old_meta + new_meta
    else:
        em = old_embs
        me = old_meta

    # write
    np.save(p["emb"], em)
    with open(p["meta"], "w", encoding="utf-8") as f:
        json.dump(me, f, ensure_ascii=False)

    return {"album_id": album_id, "count": int(em.shape[0]), "added": len(new_meta), "processed_files": total}

def index_progress(album_id: str) -> Dict:
    st = _index_progress.get(album_id, {"processed": 0, "total": 0})
    total = st.get("total", 0) or 0
    processed = st.get("processed", 0) or 0
    pct = int(round((processed / total) * 100)) if total else 0
    return {"album_id": album_id, "processed": processed, "total": total, "percent": pct}

# ---------- Guest search (selfie in-memory) ----------

def search_in_album(album_id: str, selfie_files: List[bytes], threshold: float, top_k: int) -> Dict:
    p = _paths(album_id)
    emb_p = p["emb"]; meta_p = p["meta"]
    if not emb_p.exists() or not meta_p.exists():
        return {"album_id": album_id, "results": [], "error": "album not indexed"}

    embs = np.load(emb_p)
    with open(meta_p, "r", encoding="utf-8") as f:
        meta = json.load(f)
    if embs.size == 0:
        return {"album_id": album_id, "results": []}

    app = build_insightface()

    # build a temporary user vector from selfie(s)
    user_vecs = []
    for sf in selfie_files:
        data = np.frombuffer(sf, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            continue
        boxes, vs = detect_and_embed_faces(app, img)
        for v in vs:
            user_vecs.append(v)

    if not user_vecs:
        return {"album_id": album_id, "results": [], "error": "no face detected in selfie"}

    u = np.mean(np.vstack(user_vecs), axis=0).astype(np.float32)

    def l2n(x):
        n = np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9
        return x / n

    embs_n = l2n(embs)
    u_n = u / (np.linalg.norm(u) + 1e-9)
    sims = embs_n @ u_n  # (N,)

    idx = np.argsort(-sims)[:int(top_k)]
    results = []
    for i in idx:
        s = float(sims[i])
        if s < threshold:
            continue
        results.append({
            "rel_path": meta[i]["rel_path"],
            "score": s,
            "box": meta[i].get("box"),
        })

    # best per image
    best: Dict[str, Dict] = {}
    for r in results:
        rp = r["rel_path"]
        if rp not in best or r["score"] > best[rp]["score"]:
            best[rp] = r
    results = sorted(best.values(), key=lambda x: -x["score"])

    # write results.json (optional)
    with open(p["results"], "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    return {"album_id": album_id, "count": len(results), "results": results}

# ---------- Package matched images ----------

def package_results_zip(album_id: str) -> bytes:
    p = _paths(album_id)
    root = p["album"]
    results_path = p["results"]
    results = []
    if results_path.exists():
        with open(results_path, "r", encoding="utf-8") as f:
            results = json.load(f)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for it in results:
            ap = root / it["rel_path"]
            if ap.exists():
                z.write(ap, arcname=it["rel_path"])
    buf.seek(0)
    return buf.read()
