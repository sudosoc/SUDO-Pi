"""Add metrics_snapshots and alert tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-01 00:00:00.000000

This migration is fully idempotent: every CREATE TABLE uses IF NOT EXISTS.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table: str) -> bool:
    """Return True if the table exists in the database."""
    rows = op.get_bind().execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
        {"t": table},
    ).fetchall()
    return len(rows) > 0


def upgrade() -> None:
    # ── metrics_snapshots ──────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS metrics_snapshots (
            id INTEGER NOT NULL,
            recorded_at DATETIME NOT NULL,
            cpu_percent REAL NOT NULL,
            ram_percent REAL NOT NULL,
            disk_percent REAL,
            temperature_cpu REAL,
            net_rx_bytes INTEGER NOT NULL DEFAULT 0,
            net_tx_bytes INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_metrics_snapshots_id ON metrics_snapshots (id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_metrics_snapshots_recorded_at ON metrics_snapshots (recorded_at)"
    ))

    # ── alert_rules ────────────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS alert_rules (
            id INTEGER NOT NULL,
            name TEXT NOT NULL,
            metric VARCHAR(32) NOT NULL,
            threshold REAL,
            service_name VARCHAR(128),
            channel VARCHAR(32) NOT NULL,
            channel_config TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            cooldown_minutes INTEGER NOT NULL DEFAULT 60,
            last_triggered_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_alert_rules_id ON alert_rules (id)"
    ))

    # ── alert_history ──────────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS alert_history (
            id INTEGER NOT NULL,
            rule_id INTEGER,
            rule_name TEXT NOT NULL,
            metric VARCHAR(32) NOT NULL,
            value REAL,
            message TEXT NOT NULL,
            channel VARCHAR(32) NOT NULL,
            sent_at DATETIME NOT NULL,
            success BOOLEAN NOT NULL DEFAULT 0,
            PRIMARY KEY (id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_alert_history_id ON alert_history (id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_alert_history_sent_at ON alert_history (sent_at)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS alert_history"))
    op.execute(sa.text("DROP TABLE IF EXISTS alert_rules"))
    op.execute(sa.text("DROP TABLE IF EXISTS metrics_snapshots"))
