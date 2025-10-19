# wedface
## Backend
```bash
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

## Frontend
```bash
cd frontend
npm install
npm run dev
```

- API base: `http://localhost:8000`
- Frontend: `http://localhost:5173`
