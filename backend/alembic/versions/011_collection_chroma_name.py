"""011 collections: add chroma_collection_name for stable ChromaDB reference

Revision ID: 011
Revises: 010
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("collections", sa.Column("chroma_collection_name", sa.Text(), nullable=True))
    op.execute(text("UPDATE collections SET chroma_collection_name = name || '_vector' WHERE chroma_collection_name IS NULL"))
    op.add_column("conversations", sa.Column("title", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("collections", "chroma_collection_name")
    op.drop_column("conversations", "title")
