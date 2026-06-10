"""pipeline_events telemetry table

Revision ID: 015
Revises: 014
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision  = "015"
down_revision = "014"
branch_labels = None
depends_on    = None


def upgrade():
    op.create_table(
        "pipeline_events",
        sa.Column("id",              UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("event_type",      sa.String(50),  nullable=False),
        sa.Column("stage",           sa.String(50),  nullable=True),
        sa.Column("status",          sa.String(20),  nullable=False, server_default="success"),
        sa.Column("doc_id",          UUID(as_uuid=False), nullable=True),
        sa.Column("query_id",        UUID(as_uuid=False), nullable=True),
        sa.Column("collection_id",   UUID(as_uuid=False), nullable=True),
        sa.Column("duration_ms",     sa.Integer(),   nullable=True),
        sa.Column("input_tokens",    sa.Integer(),   nullable=True),
        sa.Column("output_tokens",   sa.Integer(),   nullable=True),
        sa.Column("error_type",      sa.String(100), nullable=True),
        sa.Column("error_message",   sa.Text(),      nullable=True),
        sa.Column("error_traceback", sa.Text(),      nullable=True),
        sa.Column("metadata",        JSONB(),        nullable=True),
        sa.Column("created_at",      sa.DateTime(),  nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_index("ix_pe_event_type_created", "pipeline_events", ["event_type", sa.text("created_at DESC")])
    op.create_index("ix_pe_doc_id",             "pipeline_events", ["doc_id"])
    op.create_index("ix_pe_query_id",           "pipeline_events", ["query_id"])
    op.create_index("ix_pe_status_created",     "pipeline_events", ["status", sa.text("created_at DESC")])
    op.create_index("ix_pe_collection_created", "pipeline_events", ["collection_id", sa.text("created_at DESC")])


def downgrade():
    op.drop_table("pipeline_events")
