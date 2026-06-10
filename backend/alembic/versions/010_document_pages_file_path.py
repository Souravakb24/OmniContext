"""010 document_pages: replace image_webp blob with image_path file path

Revision ID: 010
Revises: 009
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("document_pages", "image_webp")
    op.add_column("document_pages", sa.Column("image_path", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("document_pages", "image_path")
    op.add_column("document_pages", sa.Column("image_webp", sa.LargeBinary(), nullable=True))
