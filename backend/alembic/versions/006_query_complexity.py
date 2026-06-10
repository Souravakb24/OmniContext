"""Add query_complexity column to conversation_turns

Revision ID: 006
Revises: 005
Create Date: 2026-05-31
"""
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE conversation_turns
        ADD COLUMN IF NOT EXISTS query_complexity VARCHAR(20) DEFAULT 'simple'
    """)


def downgrade():
    op.execute("ALTER TABLE conversation_turns DROP COLUMN IF EXISTS query_complexity")
