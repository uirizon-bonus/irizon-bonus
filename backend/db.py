import re
import sqlite3
from typing import Any, List, Optional, Tuple

from backend.config import BONUS_DB_PATH, DATABASE_URL, DB_BACKEND

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:
    psycopg = None
    dict_row = None


class PostgresCursorWrapper:
    def __init__(self, cursor: Any):
        self._cursor = cursor

    def fetchone(self) -> Any:
        return self._cursor.fetchone()

    def fetchall(self) -> List[Any]:
        return self._cursor.fetchall()

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount


class PostgresConnectionWrapper:
    def __init__(self, connection: Any):
        self._connection = connection

    def execute(self, query: str, params: Optional[Tuple[Any, ...]] = None) -> PostgresCursorWrapper:
        cursor = self._connection.execute(adapt_sql(query), params or ())
        return PostgresCursorWrapper(cursor)

    def executemany(self, query: str, seq_of_params: List[Tuple[Any, ...]]) -> PostgresCursorWrapper:
        cursor = self._connection.cursor()
        cursor.executemany(adapt_sql(query), seq_of_params)
        return PostgresCursorWrapper(cursor)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()


def adapt_sql(query: str) -> str:
    normalized = query
    normalized = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", normalized, flags=re.IGNORECASE)
    if "ON CONFLICT DO NOTHING" not in normalized.upper() and "INSERT OR IGNORE" in query.upper():
        normalized = normalized.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    normalized = normalized.replace("datetime(created_at)", "created_at")
    normalized = normalized.replace("%", "%%").replace("?", "%s")
    return normalized


def bonus_db() -> Any:
    if DB_BACKEND == "postgres":
        if psycopg is None:
            raise RuntimeError("PostgreSQL backend requested but psycopg is not installed")
        connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        return PostgresConnectionWrapper(connection)

    connection = sqlite3.connect(BONUS_DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection

