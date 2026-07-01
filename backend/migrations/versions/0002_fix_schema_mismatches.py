"""Fix schema mismatches between migration 0001 and actual models

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-01 00:00:00.000000

Fixes applied to existing installations:
- users: add full_name, is_system; rename failed_login_attempts -> failed_login_count
- refresh_tokens: rename device_info -> user_agent (extend to 512 chars)
- audit_logs: rename timestamp -> created_at; rename detail -> details; add user_agent
- wifi_profiles: add password, is_saved, is_active, static_prefix, updated_at
- ap_configs: create missing table entirely
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

    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

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

    # ── ap_configs (new table, entirely missing from 0001) ─────────────────────
    op.create_table(
        "ap_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ssid", sa.String(64), nullable=False),
        sa.Column("password", sa.String(64), nullable=False, server_default="sudopi2024"),
        sa.Column("channel", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("country_code", sa.String(2), nullable=False, server_default="EG"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("hide_ssid", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("max_clients", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("band", sa.String(8), nullable=False, server_default="2.4GHz"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ap_configs_id", "ap_configs", ["id"])


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
        batch_op.alter_column("details", new_column_name="detail", type_=sa.Text(), existing_nullable=True)
        batch_op.alter_column("created_at", new_column_name="timestamp", existing_type=sa.DateTime(timezone=True))

    op.drop_index("ix_refresh_tokens_expires_at", "refresh_tokens")
    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.alter_column("user_agent", new_column_name="device_info", type_=sa.String(255), existing_nullable=True)

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_system")
        batch_op.drop_column("full_name")
        batch_op.alter_column("failed_login_count", new_column_name="failed_login_attempts")
