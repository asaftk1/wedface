import os, cv2, numpy as np, json
from numpy.linalg import norm
from typing import List, Dict
from pathlib import Path

from insightface.app import FaceAnalysis

DATA_DIR = os.environ.get("FF_DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data")))
ALBUM_DIR = os.path.join(DATA_DIR, "album")        # לא בשימוש במודל אלבומים, נשאר תאימות
SELFIE_DIR = os.path.join(DATA_DIR, "selfies")     # "
EMB_PATH = os.path.join(DATA_DIR, "embeddings.npy")# "
META_PATH = os.path.join(DATA_DIR, "meta.json")    # "
INDEX_PATH = os.path.join(DATA_DIR, "index.faiss") # "
USER_VEC_PATH = os.path.join(DATA_DIR, "user_vec.npy")
RESULTS_PATH = os.path.join(DATA_DIR, "results.json")

os.makedirs(DATA_DIR, exist_ok=True)

# ---------- helpers shared with albums_service ----------

_app_singleton = None

def build_insightface() -> FaceAnalysis:
    global _app_singleton
    if _app_singleton is None:
        _app_singleton = FaceAnalysis(name='buffalo_l')
        _app_singleton.prepare(ctx_id=0, det_size=(640, 640))
    return _app_singleton

def image_paths_in_dir(root: Path) -> List[Path]:
    root = Path(root)
    exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    return [p for p in root.rglob('*') if p.suffix.lower() in exts]

def detect_and_embed_faces(app: FaceAnalysis, img_bgr) -> tuple[list, list]:
    faces = app.get(img_bgr)
    boxes = []
    embs = []
    for f in faces:
        if getattr(f, 'embedding', None) is not None:
            boxes.append(f.bbox.astype(float).tolist())
            embs.append(f.embedding.astype('float32'))
    return boxes, embs

_face_app = None
def _app():
    global _face_app
    if _face_app is None:
        _face_app = FaceAnalysis(name="buffalo_l")
        _face_app.prepare(ctx_id=-1, det_size=(640,640))
    return _face_app

def _read_bgr(data: bytes):
    arr = np.frombuffer(data, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

def _embeds(img):
    faces = _app().get(img)
    out = []
    for f in faces:
        out.append(([int(v) for v in f.bbox.tolist()], f.normed_embedding.astype(np.float32)))
    return out

def _rel(abs_path: str) -> str:
    return os.path.relpath(abs_path, ALBUM_DIR).replace('\\','/')

def _abs(rel_path: str) -> str:
    p = os.path.normpath(os.path.join(ALBUM_DIR, rel_path))
    if not p.startswith(ALBUM_DIR): raise ValueError("escape")
    return p

def save_user_vec_from_selfies(files: List[bytes]) -> int:
    embs = []
    for data in files:
        img = _read_bgr(data)
        dets = _embeds(img)
        if not dets: continue
        bbox, emb = max(dets, key=lambda x: (x[0][2]-x[0][0])*(x[0][3]-x[0][1]))
        embs.append(emb)
    if not embs: raise ValueError("No faces in selfies.")
    vec = np.mean(np.vstack(embs), axis=0)
    vec = vec / max(norm(vec), 1e-9)
    np.save(USER_VEC_PATH, vec.astype(np.float32))
    return len(embs)

def list_album_images() -> list[str]:
    exts = {'.jpg','.jpeg','.png','.bmp','.webp'}
    out = []
    for r,_,fs in os.walk(ALBUM_DIR):
        for n in fs:
            if os.path.splitext(n.lower())[1] in exts:
                out.append(os.path.join(r,n))
    return sorted(out)

def extract_zip_to_album(zip_bytes: bytes) -> int:
    import zipfile, io
    for p in list_album_images():
        try: os.remove(p)
        except: pass
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        z.extractall(ALBUM_DIR)
    return len(list_album_images())

def index_album_images(paths: list[str]) -> int:
    import faiss
    all_embs, meta = [], []
    for p in paths:
        img = cv2.imread(p)
        if img is None: continue
        dets = _embeds(img)
        for bbox, emb in dets:
            all_embs.append(emb)
            meta.append({"rel_path": _rel(p), "box": bbox})
    if not all_embs:
        np.save(EMB_PATH, np.zeros((0,512), np.float32)); open(META_PATH,'w').write('[]')
        index = faiss.IndexFlatIP(512); faiss.write_index(index, INDEX_PATH); return 0
    embs = np.vstack(all_embs).astype(np.float32); np.save(EMB_PATH, embs)
    with open(META_PATH,'w') as f: json.dump(meta, f)
    index = faiss.IndexFlatIP(embs.shape[1]); index.add(embs); faiss.write_index(index, INDEX_PATH)
    return embs.shape[0]

def search_matches(top_k=500, threshold=0.40) -> Dict:
    import faiss
    if not os.path.exists(USER_VEC_PATH): raise ValueError("Upload selfies first.")
    if not os.path.exists(INDEX_PATH): raise ValueError("Upload album first.")
    user = np.load(USER_VEC_PATH).astype(np.float32).reshape(1,-1)
    index = faiss.read_index(INDEX_PATH)
    if index.ntotal == 0: results = []
    else:
        k = min(top_k, index.ntotal)
        D, I = index.search(user, k)
        meta = json.load(open(META_PATH))
        from collections import defaultdict
        per = defaultdict(lambda: {"score": -1.0, "boxes": []})
        for s, idx in zip(D[0].tolist(), I[0].tolist()):
            if idx < 0 or s < threshold: continue
            it = meta[idx]; rp = it["rel_path"]
            per[rp]["boxes"].append(it["box"])
            if s > per[rp]["score"]: per[rp]["score"] = float(s)
        results = [{"rel_path": p, "score": d["score"], "boxes": d["boxes"]} for p,d in per.items()]
        results.sort(key=lambda x: -x["score"])
    with open(RESULTS_PATH,'w') as f: json.dump(results, f, indent=2)
    return {"count": len(results), "results": results}

def package_results_zip() -> bytes:
    import zipfile, io
    results = json.load(open(RESULTS_PATH)) if os.path.exists(RESULTS_PATH) else []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for it in results:
            ap = _abs(it["rel_path"])
            if os.path.exists(ap): z.write(ap, arcname=it["rel_path"])
    buf.seek(0); return buf.read()

