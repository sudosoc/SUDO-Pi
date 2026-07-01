"""Fix schema mismatches between migration 0001 and actual models

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-01 00:00:00.000000

Fixes applied to existing installations:
- users: add full_name, is_system; rename failed_login_attempts -> failed_login_count
- refresh_tokens: rename device_info -> user_agent (extend to 512 chars)
- audit_logs: rename timestamp -> created_at; rename detail -> details; add user_agent
- wifi_profiles: add password, is_saved, is_active, static_prefix, updated_at
- ap_configs: create table if not exists (may already exist from SQLAlchemy create_all)
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("full_name", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("is_system", sa.Boolean(), nullable=False, server_default="0"))
        batch_op.alter_column("failed_login_attempts", new_column_name="failed_login_count")

    # ── refresh_tokens ─────────────────────────────────────────────────────────
    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.alter_column(
            "device_info",
            new_column_name="user_agent",
            type_=sa.String(512),
            existing_type=sa.String(255),
            existing_nullable=True,
        )

    # Use IF NOT EXISTS — index may already exist if SQLAlchemy create_all ran
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_expires_at ON refresh_tokens (expires_at)"
    ))

    # ── audit_logs ─────────────────────────────────────────────────────────────
    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column(
            "timestamp",
            new_column_name="created_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "detail",
            new_column_name="details",
            type_=sa.Text(),
            existing_type=sa.Text(),
            existing_nullable=True,
        )
        batch_op.add_column(sa.Column("user_agent", sa.String(512), nullable=True))

    # ── wifi_profiles ──────────────────────────────────────────────────────────
    with op.batch_alter_table("wifi_profiles") as batch_op:
        batch_op.add_column(sa.Column("password", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("is_saved", sa.Boolean(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("static_prefix", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("(CURRENT_TIMESTAMP)"),
            )
        )

    # ── ap_configs ─────────────────────────────────────────────────────────────
    # Use IF NOT EXISTS because SQLAlchemy create_all may have already created
    # this table during a previous failed startup before migrations ran.
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ap_configs (
            id INTEGER NOT NULL,
            ssid VARCHAR(64) NOT NULL,
            password VARCHAR(64) NOT NULL DEFAULT 'sudopi2024',
            channel INTEGER NOT NULL DEFAULT 6,
            country_code VARCHAR(2) NOT NULL DEFAULT 'EG',
            is_active BOOLEAN NOT NULL DEFAULT 1,
            hide_ssid BOOLEAN NOT NULL DEFAULT 0,
            max_clients INTEGER NOT NULL DEFAULT 20,
            band VARCHAR(8) NOT NULL DEFAULT '2.4GHz',
            created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_ap_configs_id ON ap_configs (id)"
    ))


def downgrade() -> None:
    op.drop_table("ap_configs")

    with op.batch_alter_table("wifi_profiles") as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("static_prefix")
        batch_op.drop_column("is_active")
        batch_op.drop_column("is_saved")
        batch_op.drop_column("password")

    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.drop_column("user_agent")
        batch_op.alter_column(
            "details", new_column_name="detail",
            type_=sa.Text(), existing_nullable=True,
        )
        batch_op.alter_column(
            "created_at", new_column_name="timestamp",
            existing_type=sa.DateTime(timezone=True),
        )

    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.alter_column(
            "user_agent", new_column_name="device_info",
            type_=sa.String(255), existing_nullable=True,
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_system")
        batch_op.drop_column("full_name")
        batch_op.alter_column("failed_login_count", new_column_name="failed_login_attempts")
