"""pipeline_events — add session_id, input_text, output_text

Revision ID: 016
Revises: 015
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision      = "016"
down_revision = "015"
branch_labels = None
depends_on    = None


def upgrade():
    op.add_column("pipeline_events", sa.Column("session_id",  sa.String(255), nullable=True))
    op.add_column("pipeline_events", sa.Column("input_text",  sa.Text(),      nullable=True))
    op.add_column("pipeline_events", sa.Column("output_text", sa.Text(),      nullable=True))
    op.create_index("ix_pe_session_id", "pipeline_events", ["session_id"])


def downgrade():
    op.drop_index("ix_pe_session_id", table_name="pipeline_events")
    op.drop_column("pipeline_events", "output_text")
    op.drop_column("pipeline_events", "input_text")
    op.drop_column("pipeline_events", "session_id")
