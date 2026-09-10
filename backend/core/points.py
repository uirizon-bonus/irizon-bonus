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


# Reasons an operator may take points off a balance. Free text alone made past
# corrections impossible to report on, so the code is stored on the ledger row
# (source_ref) and the label is what the customer reads in their history.
DEDUCT_REASONS: Dict[str, Dict[str, str]] = {
    "wrong_entry": {"uz": "Xato kiritilgan ball", "ru": "Ошибочно начисленные баллы"},
    "duplicate": {"uz": "Takroriy hisoblangan ball", "ru": "Повторно начисленные баллы"},
    "return": {"uz": "Tovar qaytarildi", "ru": "Возврат товара"},
    "gift_offline": {"uz": "Sovg'a ilovadan tashqari berildi", "ru": "Подарок выдан вне приложения"},
    "correction": {"uz": "Balans tuzatildi (sverka)", "ru": "Корректировка баланса (сверка)"},
    "penalty": {"uz": "Jarima / shartnoma buzilishi", "ru": "Штраф / нарушение условий"},
    "other": {"uz": "Boshqa sabab", "ru": "Другая причина"},
}


def _deduct_reason_label(reason_code: str, lang: str = "uz") -> str:
    reason = DEDUCT_REASONS.get(reason_code)
    return reason[lang] if reason else reason_code


def _create_manual_debit(
    client_id: str,
    client_name: str,
    points: int,
    reason_code: str,
    note: str,
) -> int:
    """Record a deduction and return the resulting balance.

    `points` arrives positive and is stored negated, because the balance is just
    SUM(points) over the ledger. The reason code lives in source_ref so debits
    can be grouped by cause without parsing the note.
    """
    amount = abs(int(points))
    connection = bonus_db()
    try:
        _insert_bonus_transaction(
            connection,
            client_id=str(client_id),
            client_name=str(client_name),
            points=-amount,
            note=f"{_deduct_reason_label(reason_code)}: {note.strip()}",
            source_type="manual_debit",
            source_ref=str(reason_code),
        )
        connection.commit()
        row = connection.execute(
            "SELECT COALESCE(SUM(points), 0) AS total FROM bonus_transactions WHERE client_id = ?",
            (str(client_id),),
        ).fetchone()
        return int(row["total"] or 0) if row is not None else 0
    finally:
        connection.close()
