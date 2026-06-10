"""rename vector_count to doc_count

Revision ID: 002
Revises: 001
Create Date: 2026-05-10
"""
from alembic import op

revision = '002'
down_revision = 'd35bebca0178'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('collections', 'vector_count', new_column_name='doc_count')
    op.alter_column('org_limits', 'max_vectors_per_collection', new_column_name='max_docs_per_collection')
    op.execute("ALTER TABLE org_limits ALTER COLUMN max_docs_per_collection SET DEFAULT 50")
    op.execute("UPDATE org_limits SET max_docs_per_collection = 50 WHERE max_docs_per_collection = 10000")


def downgrade() -> None:
    op.alter_column('collections', 'doc_count', new_column_name='vector_count')
    op.alter_column('org_limits', 'max_docs_per_collection', new_column_name='max_vectors_per_collection')
    op.execute("ALTER TABLE org_limits ALTER COLUMN max_vectors_per_collection SET DEFAULT 10000")
