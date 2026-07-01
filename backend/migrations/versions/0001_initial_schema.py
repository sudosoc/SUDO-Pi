"""Initial schema — users, sessions, audit_logs, wifi_profiles, ap_configs

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_ip", sa.String(length=45), nullable=True),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("jti", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("jti"),
    )
    op.create_index("ix_refresh_tokens_id", "refresh_tokens", ["id"])
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("resource", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "wifi_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ssid", sa.String(length=64), nullable=False),
        sa.Column("password", sa.Text(), nullable=True),
        sa.Column("security", sa.String(length=20), nullable=False, server_default="wpa2"),
        sa.Column("is_saved", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("use_dhcp", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("static_ip", sa.String(length=15), nullable=True),
        sa.Column("static_gateway", sa.String(length=15), nullable=True),
        sa.Column("static_dns", sa.String(length=64), nullable=True),
        sa.Column("static_prefix", sa.Integer(), nullable=True),
        sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ssid"),
    )
    op.create_index("ix_wifi_profiles_id", "wifi_profiles", ["id"])
    op.create_index("ix_wifi_profiles_ssid", "wifi_profiles", ["ssid"])

    op.create_table(
        "ap_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ssid", sa.String(length=64), nullable=False),
        sa.Column("password", sa.String(length=64), nullable=False, server_default="sudopi2024"),
        sa.Column("channel", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("country_code", sa.String(length=2), nullable=False, server_default="EG"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("hide_ssid", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("max_clients", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("band", sa.String(length=8), nullable=False, server_default="2.4GHz"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("(CURRENT_TIMESTAMP)")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ap_configs_id", "ap_configs", ["id"])


def downgrade() -> None:
    op.drop_table("ap_configs")
    op.drop_table("wifi_profiles")
    op.drop_table("audit_logs")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
