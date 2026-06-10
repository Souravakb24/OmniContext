"""012 conversation_turns: add figure_paths for inline answer figures

Stores the relative on-disk paths of figure images copied per chat turn.
NULL when the turn cited no figures.

Revision ID: 012
Revises: 011
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversation_turns", sa.Column("figure_paths", sa.ARRAY(sa.Text()), nullable=True))


def downgrade():
    op.drop_column("conversation_turns", "figure_paths")
