"""014 collections: add ontologies JSONB column for per-collection ontology storage

Revision ID: 014
Revises: 013
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("collections", sa.Column("ontologies", JSONB(), nullable=True))


def downgrade():
    op.drop_column("collections", "ontologies")
