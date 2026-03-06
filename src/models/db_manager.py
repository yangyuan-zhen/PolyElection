import aiosqlite
import os
from typing import List, Dict, Any

DB_PATH = "e:/web/PolyElection/data/polyelection.db"

class DatabaseManager:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        # Ensure data directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS polls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT,
                    pollster TEXT,
                    candidate TEXT,
                    support REAL,
                    date TEXT,
                    weight REAL DEFAULT 1.0
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS odds_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    market_id TEXT,
                    outcome TEXT,
                    price REAL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.commit()

    async def save_poll(self, event_id: str, pollster: str, candidate: str, support: float, date: str):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO polls (event_id, pollster, candidate, support, date) VALUES (?, ?, ?, ?, ?)",
                (event_id, pollster, candidate, support, date)
            )
            await db.commit()

    async def get_latest_polls(self, event_id: str) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM polls WHERE event_id = ? ORDER BY date DESC LIMIT 10", (event_id,)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
