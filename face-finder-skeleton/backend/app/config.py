from pydantic import BaseModel
from functools import lru_cache

class Settings(BaseModel):
    default_threshold: float = 0.40
    top_k: int = 500
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

@lru_cache
def get_settings() -> Settings:
    return Settings()
