"""Add demo_sessions table

Revision ID: 007
Revises: 006
Create Date: 2026-05-31
"""
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS demo_sessions (
            id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            collection_name  VARCHAR(100) NOT NULL,
            doc_count        INTEGER      NOT NULL DEFAULT 0,
            query_count      INTEGER      NOT NULL DEFAULT 0,
            status           VARCHAR(20)  NOT NULL DEFAULT 'active',
            created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
            expires_at       TIMESTAMP    NOT NULL
        )
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS demo_sessions")
