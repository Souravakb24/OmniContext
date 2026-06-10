"""documents and document_pages tables for ingestion pipeline

Revision ID: 004
Revises: 003
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade():
    # Create documents table if it doesn't already exist
    # (may have been created manually before this migration was added)
    op.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            doc_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
            collection_id      UUID REFERENCES collections(id) ON DELETE CASCADE,
            filename           TEXT NOT NULL,
            original_extension VARCHAR(20),
            output_dir         TEXT,
            pdf_path           TEXT,
            sha256_hash        TEXT UNIQUE,
            mime_type          VARCHAR(100),
            size_bytes         INTEGER,
            tags               TEXT[] DEFAULT '{}',
            status             VARCHAR(50) DEFAULT 'UPLOADED',
            created_at         TIMESTAMP DEFAULT NOW()
        )
    """)

    # Add ingestion columns — each uses IF NOT EXISTS so it's safe to re-run
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message      TEXT;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS retry_count        INTEGER DEFAULT 0;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS ingestion_start    TIMESTAMP;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS ingestion_end      TIMESTAMP;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS layout_json        JSONB;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunks_json        JSONB;
            ALTER TABLE documents ADD COLUMN IF NOT EXISTS ingestion_report   JSONB;
        END $$
    """)

    # Create document_pages table
    op.execute("""
        CREATE TABLE IF NOT EXISTS document_pages (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            doc_id      UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
            page_no     INTEGER NOT NULL,
            image_webp  BYTEA,
            width_px    INTEGER,
            height_px   INTEGER,
            UNIQUE (doc_id, page_no)
        )
    """)

    # Index so the worker can quickly find UPLOADED documents
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS document_pages")
    op.execute("DROP INDEX IF EXISTS idx_documents_status")
    op.execute("""
        ALTER TABLE documents
            DROP COLUMN IF EXISTS ingestion_report,
            DROP COLUMN IF EXISTS chunks_json,
            DROP COLUMN IF EXISTS layout_json,
            DROP COLUMN IF EXISTS ingestion_end,
            DROP COLUMN IF EXISTS ingestion_start,
            DROP COLUMN IF EXISTS retry_count,
            DROP COLUMN IF EXISTS error_message
    """)
