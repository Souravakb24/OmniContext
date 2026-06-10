"""Replace chunk_index with document_chunks; drop documents.chunks_json

Revision ID: 009
Revises: 008
Create Date: 2026-06-02
"""
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    # ── Drop old chunk_index ──────────────────────────────────────────────────
    op.execute("DROP TRIGGER IF EXISTS chunk_index_search_vec_trigger ON chunk_index")
    op.execute("DROP FUNCTION IF EXISTS chunk_index_search_vec_update")
    op.execute("DROP TABLE IF EXISTS chunk_index")

    # ── Create document_chunks ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE document_chunks (
            id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            doc_id         UUID         NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
            collection_id  UUID         NOT NULL REFERENCES collections(id)   ON DELETE CASCADE,
            chunk_index    INTEGER      NOT NULL,
            chunk_id       TEXT         NOT NULL UNIQUE,
            chunk_type     VARCHAR(20)  NOT NULL DEFAULT 'text',
            chunker        VARCHAR(20),
            text           TEXT         NOT NULL,
            raw_text       TEXT,
            headings       TEXT,
            page_numbers   INTEGER[],
            provenance     JSONB,
            caption        TEXT,
            parent_heading TEXT,
            image_ref      TEXT,
            is_indexed     BOOLEAN      NOT NULL DEFAULT FALSE,
            search_vec     TSVECTOR,
            created_at     TIMESTAMP    DEFAULT NOW(),
            UNIQUE (doc_id, chunk_index)
        )
    """)

    op.execute("CREATE INDEX ix_dc_doc_id       ON document_chunks (doc_id)")
    op.execute("CREATE INDEX ix_dc_collection_id ON document_chunks (collection_id)")
    op.execute("CREATE INDEX ix_dc_chunk_type   ON document_chunks (chunk_type)")
    op.execute("CREATE INDEX ix_dc_search       ON document_chunks USING GIN (search_vec)")
    op.execute("CREATE INDEX ix_dc_page_numbers ON document_chunks USING GIN (page_numbers)")

    op.execute("""
        CREATE OR REPLACE FUNCTION document_chunks_search_vec_update()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.search_vec := to_tsvector('english', NEW.text);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER document_chunks_search_vec_trigger
        BEFORE INSERT OR UPDATE OF text
        ON document_chunks
        FOR EACH ROW EXECUTE FUNCTION document_chunks_search_vec_update()
    """)

    # ── Drop chunks_json from documents ──────────────────────────────────────
    op.execute("ALTER TABLE documents DROP COLUMN IF EXISTS chunks_json")


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS document_chunks_search_vec_trigger ON document_chunks")
    op.execute("DROP FUNCTION IF EXISTS document_chunks_search_vec_update")
    op.execute("DROP TABLE IF EXISTS document_chunks")
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunks_json JSONB")
