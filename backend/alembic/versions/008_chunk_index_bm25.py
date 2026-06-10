"""Add chunk_index table for BM25 full-text search

Revision ID: 008
Revises: 007
Create Date: 2026-06-02
"""
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS chunk_index (
            id         SERIAL       PRIMARY KEY,
            chunk_id   TEXT         NOT NULL,
            doc_id     TEXT         NOT NULL,
            collection VARCHAR(255) NOT NULL,
            content    TEXT         NOT NULL,
            search_vec TSVECTOR,
            created_at TIMESTAMP    DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chunk_index_chunk_id
            ON chunk_index (chunk_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chunk_index_doc_id
            ON chunk_index (doc_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chunk_index_collection
            ON chunk_index (collection)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chunk_index_search
            ON chunk_index USING GIN (search_vec)
    """)

    # Trigger to auto-populate search_vec on INSERT/UPDATE using porter stemmer
    op.execute("""
        CREATE OR REPLACE FUNCTION chunk_index_search_vec_update()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vec := to_tsvector('english', NEW.content);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER chunk_index_search_vec_trigger
        BEFORE INSERT OR UPDATE OF content
        ON chunk_index
        FOR EACH ROW EXECUTE FUNCTION chunk_index_search_vec_update()
    """)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS chunk_index_search_vec_trigger ON chunk_index")
    op.execute("DROP FUNCTION IF EXISTS chunk_index_search_vec_update")
    op.execute("DROP TABLE IF EXISTS chunk_index")
