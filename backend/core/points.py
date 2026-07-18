from __future__ import annotations

from typing import Any, Dict

from backend.db import bonus_db


def _load_bonus_totals() -> Dict[str, Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT
                client_id,
                MAX(client_name) AS client_name,
                COALESCE(SUM(points), 0) AS points_earned,
                MAX(created_at) AS last_bonus_at
            FROM bonus_transactions
            GROUP BY client_id
            """
        ).fetchall()
    finally:
        connection.close()

    return {
        str(row["client_id"]): {
            "client_name": str(row["client_name"] or ""),
            "points_earned": int(row["points_earned"] or 0),
            "last_bonus_at": str(row["last_bonus_at"] or ""),
        }
        for row in rows
    }


def _load_bonus_summary_for_client(client_id: str) -> Dict[str, Any]:
    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT
                MAX(client_name) AS client_name,
                COALESCE(SUM(points), 0) AS points_earned,
                MAX(created_at) AS last_bonus_at
            FROM bonus_transactions
            WHERE client_id = ?
            """,
            (str(client_id),),
        ).fetchone()
    finally:
        connection.close()

    if row is None:
        return {"client_name": "", "points_earned": 0, "last_bonus_at": ""}

    return {
        "client_name": str(row["client_name"] or ""),
        "points_earned": int(row["points_earned"] or 0),
        "last_bonus_at": str(row["last_bonus_at"] or ""),
    }


def _insert_bonus_transaction(
    connection: Any,
    client_id: str,
    client_name: str,
    points: int,
    note: str,
    *,
    source_type: str = "manual",
    source_ref: str = "",
) -> None:
    connection.execute(
        """
        INSERT INTO bonus_transactions (client_id, client_name, points, note, source_type, source_ref)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (client_id, client_name, points, note.strip(), source_type, source_ref),
    )


def _create_bonus_transaction(
    client_id: str,
    client_name: str,
    points: int,
    note: str,
    *,
    source_type: str = "manual",
    source_ref: str = "",
) -> None:
    connection = bonus_db()
    try:
        _insert_bonus_transaction(
            connection,
            client_id,
            client_name,
            points,
            note,
            source_type=source_type,
            source_ref=source_ref,
        )
        connection.commit()
    finally:
        connection.close()
