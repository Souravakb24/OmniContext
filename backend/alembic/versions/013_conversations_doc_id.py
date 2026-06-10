"""013 conversations: add doc_id for single-document scoped chat

When set, the conversation is locked to one document and retrieval is filtered
to that doc_id. NULL means a normal collection-wide chat.

Revision ID: 013
Revises: 012
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversations", sa.Column("doc_id", UUID(as_uuid=True), nullable=True))


def downgrade():
    op.drop_column("conversations", "doc_id")
