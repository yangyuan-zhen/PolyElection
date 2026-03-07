import os
from typing import Any, Dict, List

import aiosqlite

DB_PATH = "e:/web/PolyElection/data/polyelection.db"


class DatabaseManager:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS polls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT,
                    pollster TEXT,
                    candidate TEXT,
                    support REAL,
                    date TEXT,
                    weight REAL DEFAULT 1.0
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS odds_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    outcome TEXT,
                    price REAL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS poll_observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    pollster TEXT NOT NULL,
                    candidate TEXT NOT NULL,
                    support REAL NOT NULL,
                    date TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    sample INTEGER DEFAULT 0,
                    accuracy REAL DEFAULT 0.0,
                    source TEXT,
                    page_title TEXT,
                    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS media_observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    url TEXT,
                    domain TEXT,
                    published_at TEXT,
                    summary TEXT,
                    sentiment_label TEXT,
                    sentiment_score REAL DEFAULT 0.0,
                    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            await db.commit()

    async def save_poll(self, event_id: str, pollster: str, candidate: str, support: float, date: str):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO polls (event_id, pollster, candidate, support, date) VALUES (?, ?, ?, ?, ?)",
                (event_id, pollster, candidate, support, date),
            )
            await db.commit()

    async def get_latest_polls(self, event_id: str) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM polls WHERE event_id = ? ORDER BY date DESC LIMIT 10",
                (event_id,),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def replace_poll_observations(
        self,
        event_id: str,
        polls: List[Dict[str, Any]],
        *,
        source: str,
        page_title: str = "",
    ) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM poll_observations WHERE event_id = ?", (event_id,))
            for poll in polls:
                await db.execute(
                    """
                    INSERT INTO poll_observations (
                        event_id, pollster, candidate, support, date, weight,
                        sample, accuracy, source, page_title
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        str(poll.get("pollster") or ""),
                        str(poll.get("candidate") or ""),
                        float(poll.get("support") or 0.0),
                        str(poll.get("date") or ""),
                        float(poll.get("weight") or 1.0),
                        int(poll.get("sample") or 0),
                        float(poll.get("accuracy") or 0.0),
                        source,
                        page_title,
                    ),
                )
            await db.commit()

    async def get_poll_observations(
        self,
        event_id: str,
        *,
        limit: int = 40,
        freshness_hours: int = 24,
    ) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM poll_observations
                WHERE event_id = ?
                  AND fetched_at >= datetime('now', ?)
                ORDER BY date DESC, fetched_at DESC
                LIMIT ?
                """,
                (event_id, f"-{freshness_hours} hours", limit),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def replace_media_observations(
        self,
        event_id: str,
        items: List[Dict[str, Any]],
    ) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM media_observations WHERE event_id = ?", (event_id,))
            for item in items:
                await db.execute(
                    """
                    INSERT INTO media_observations (
                        event_id, source, title, url, domain, published_at,
                        summary, sentiment_label, sentiment_score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        str(item.get("source") or "gdelt"),
                        str(item.get("title") or ""),
                        str(item.get("url") or ""),
                        str(item.get("domain") or ""),
                        str(item.get("published_at") or ""),
                        str(item.get("summary") or ""),
                        str(item.get("sentiment") or "neutral"),
                        float(item.get("sentiment_score") or 0.0),
                    ),
                )
            await db.commit()

    async def get_media_observations(
        self,
        event_id: str,
        *,
        limit: int = 12,
        freshness_hours: int = 6,
    ) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM media_observations
                WHERE event_id = ?
                  AND fetched_at >= datetime('now', ?)
                ORDER BY published_at DESC, fetched_at DESC
                LIMIT ?
                """,
                (event_id, f"-{freshness_hours} hours", limit),
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
