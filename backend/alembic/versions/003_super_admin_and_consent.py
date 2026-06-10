"""super_admin table and org consent fields

Revision ID: 003
Revises: 002
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    # Add consent columns to organisations
    op.add_column("organisations", sa.Column("data_consent", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organisations", sa.Column("allow_training", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organisations", sa.Column("consent_updated_at", sa.DateTime(), nullable=True))

    # Create super_admins table
    op.create_table(
        "super_admins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False, unique=True),
        sa.Column("password", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table("super_admins")
    op.drop_column("organisations", "consent_updated_at")
    op.drop_column("organisations", "allow_training")
    op.drop_column("organisations", "data_consent")
