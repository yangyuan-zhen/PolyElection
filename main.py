import asyncio
import time
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.analysis.dashboard_builder import build_dashboard_payload
from src.data_collection.polymarket_client import PolymarketClient
from src.models.db_manager import DatabaseManager

app = FastAPI(title="PolyElection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = PolymarketClient()
db_manager = DatabaseManager()

_CACHE_TTL_SECONDS = 120
_dashboard_cache: Dict[str, Any] = {
    "expires_at": 0.0,
    "payload": None,
}
_dashboard_lock = asyncio.Lock()


@app.on_event("startup")
async def startup_event() -> None:
    await db_manager.init_db()


async def get_dashboard_payload(force_refresh: bool = False) -> Dict[str, Any]:
    now = time.time()
    cached_payload = _dashboard_cache.get("payload")
    if (
        not force_refresh
        and cached_payload is not None
        and now < float(_dashboard_cache.get("expires_at", 0.0))
    ):
        return cached_payload

    async with _dashboard_lock:
        now = time.time()
        cached_payload = _dashboard_cache.get("payload")
        if (
            not force_refresh
            and cached_payload is not None
            and now < float(_dashboard_cache.get("expires_at", 0.0))
        ):
            return cached_payload

        events = await client.get_global_election_dashboard(limit=24)
        payload = build_dashboard_payload(events)
        _dashboard_cache["payload"] = payload
        _dashboard_cache["expires_at"] = now + _CACHE_TTL_SECONDS
        return payload


@app.get("/api/v1/dashboard")
async def get_dashboard() -> Dict[str, Any]:
    payload = await get_dashboard_payload()
    return {"status": "success", "data": payload}


@app.get("/api/v1/opportunities")
async def get_opportunities() -> Dict[str, Any]:
    payload = await get_dashboard_payload()
    return {"status": "success", "data": payload["opportunities"]}


@app.get("/api/v1/intelligence")
async def get_intelligence() -> Dict[str, Any]:
    payload = await get_dashboard_payload()
    return {"status": "success", "data": payload["intelligence"]}


@app.get("/api/v1/stats")
async def get_general_stats() -> Dict[str, Any]:
    payload = await get_dashboard_payload()
    return payload["stats"]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
