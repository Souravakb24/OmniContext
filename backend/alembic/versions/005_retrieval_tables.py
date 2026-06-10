"""conversations and conversation_turns tables for retrieval pipeline

Revision ID: 005
Revises: 004
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id    VARCHAR(255) NOT NULL,
            user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
            collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
            is_graph      BOOLEAN DEFAULT FALSE,
            created_at    TIMESTAMP DEFAULT NOW(),
            updated_at    TIMESTAMP DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS conversation_turns (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id    UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            turn_index         INTEGER NOT NULL,
            raw_query          TEXT NOT NULL,
            rewritten_query    TEXT,
            final_answer       TEXT,
            citations          JSONB,
            verification_score FLOAT,
            iterations_used    INTEGER,
            created_at         TIMESTAMP DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conv_turns_conv_id ON conversation_turns(conversation_id)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS conversation_turns")
    op.execute("DROP TABLE IF EXISTS conversations")
