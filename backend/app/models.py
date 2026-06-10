from uuid import uuid4
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime, Date,
    LargeBinary, ForeignKey, UniqueConstraint, ARRAY, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TSVECTOR
from app.database import Base


class Organisation(Base):
    __tablename__ = "organisations"
    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name_encrypted      = Column(LargeBinary, nullable=False)
    data_consent        = Column(Boolean, default=False, nullable=False)
    allow_training      = Column(Boolean, default=False, nullable=False)
    consent_updated_at  = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)


class SuperAdmin(Base):
    __tablename__ = "super_admins"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    username   = Column(String(255), unique=True, nullable=False)
    password   = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class OrgLimit(Base):
    __tablename__ = "org_limits"
    id                         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id                     = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), unique=True)
    max_users                  = Column(Integer, default=10)
    max_collections            = Column(Integer, default=5)
    max_docs_per_collection    = Column(Integer, default=50)
    created_at                 = Column(DateTime, default=datetime.utcnow)
    updated_at                 = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id             = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"))
    username_encrypted = Column(LargeBinary, nullable=False)
    username_hash      = Column(Text, nullable=False)
    password           = Column(Text, nullable=False)
    role               = Column(String(50), default="member")
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=datetime.utcnow)
    __table_args__     = (UniqueConstraint("org_id", "username_hash"),)


class Session(Base):
    __tablename__ = "sessions"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    token_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserFileUsage(Base):
    __tablename__ = "user_file_usage"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    org_id     = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"))
    file_count = Column(Integer, default=0)
    usage_date = Column(Date, default=date.today)
    __table_args__ = (UniqueConstraint("user_id", "usage_date"),)


class Collection(Base):
    __tablename__ = "collections"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id       = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"))
    name                  = Column(String(255), nullable=False)
    description           = Column(Text)
    doc_count             = Column(Integer, default=0)
    is_active             = Column(Boolean, default=True)
    chroma_collection_name = Column(Text, nullable=True)
    ontologies            = Column(JSONB, nullable=True)
    created_by            = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at            = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("org_id", "name"),)


class Document(Base):
    __tablename__ = "documents"
    doc_id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id            = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    collection_id      = Column(UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"))
    filename           = Column(Text, nullable=False)
    original_extension = Column(String(20))
    output_dir         = Column(Text)
    pdf_path           = Column(Text)
    sha256_hash        = Column(Text, unique=True)
    mime_type          = Column(String(100))
    size_bytes         = Column(Integer)
    tags               = Column(ARRAY(Text), default=[])
    storage_mode       = Column(String(20), default="Vector_DB", nullable=False)
    status             = Column(String(50), default="UPLOADED")
    error_message      = Column(Text, nullable=True)
    retry_count        = Column(Integer, default=0)
    ingestion_start    = Column(DateTime, nullable=True)
    ingestion_end      = Column(DateTime, nullable=True)
    layout_json        = Column(JSONB, nullable=True)
    ingestion_report   = Column(JSONB, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


class DocSummary(Base):
    __tablename__ = "doc_summary"
    doc_id                = Column(UUID(as_uuid=True), ForeignKey("documents.doc_id", ondelete="CASCADE"), primary_key=True)
    file_name             = Column(Text, nullable=False)
    summary               = Column(Text, nullable=True)
    assigned_domain       = Column(String(100), nullable=True)
    is_new_domain         = Column(Boolean, nullable=True)
    proposed_domain       = Column(String(100), nullable=True)
    confidence            = Column(Float, nullable=True)
    needs_graph           = Column(Boolean, nullable=True)
    graph_reason          = Column(Text, nullable=True)
    model_used            = Column(String(100), nullable=True)
    sampled_chunk_indices = Column(JSONB, nullable=True)


class DocumentPage(Base):
    __tablename__ = "document_pages"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    doc_id     = Column(UUID(as_uuid=True), ForeignKey("documents.doc_id", ondelete="CASCADE"))
    page_no    = Column(Integer, nullable=False)
    image_path = Column(Text, nullable=True)
    width_px   = Column(Integer)
    height_px  = Column(Integer)
    __table_args__ = (UniqueConstraint("doc_id", "page_no"),)


class Conversation(Base):
    __tablename__ = "conversations"
    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id    = Column(String(255), nullable=False, index=True)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    collection_id = Column(UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"))
    doc_id        = Column(UUID(as_uuid=True), ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=True)
    is_graph      = Column(Boolean, default=False)
    title         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id    = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"))
    turn_index         = Column(Integer, nullable=False)
    raw_query          = Column(Text, nullable=False)
    rewritten_query    = Column(Text, nullable=True)
    final_answer       = Column(Text, nullable=True)
    citations          = Column(JSONB, nullable=True)
    verification_score = Column(Float, nullable=True)
    iterations_used    = Column(Integer, nullable=True)
    query_complexity   = Column(String(20), default="simple")
    figure_paths       = Column(ARRAY(Text), nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    doc_id         = Column(UUID(as_uuid=True), ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False)
    collection_id  = Column(UUID(as_uuid=True), ForeignKey("collections.id",   ondelete="CASCADE"), nullable=False)
    chunk_index    = Column(Integer, nullable=False)
    chunk_id       = Column(Text, nullable=False, unique=True)
    chunk_type     = Column(String(20), nullable=False, default="text")
    chunker        = Column(String(20), nullable=True)
    text           = Column(Text, nullable=False)
    raw_text       = Column(Text, nullable=True)
    headings       = Column(Text, nullable=True)
    page_numbers   = Column(ARRAY(Integer), nullable=True)
    provenance     = Column(JSONB, nullable=True)
    caption        = Column(Text, nullable=True)
    parent_heading = Column(Text, nullable=True)
    image_ref      = Column(Text, nullable=True)
    is_indexed     = Column(Boolean, nullable=False, default=False)
    search_vec     = Column(TSVECTOR, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (
        UniqueConstraint("doc_id", "chunk_index"),
        Index("ix_dc_doc_id",        "doc_id"),
        Index("ix_dc_collection_id", "collection_id"),
        Index("ix_dc_chunk_type",    "chunk_type"),
    )


class DemoSession(Base):
    __tablename__ = "demo_sessions"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    collection_name = Column(String(100), nullable=False)
    doc_count       = Column(Integer, default=0, nullable=False)
    query_count     = Column(Integer, default=0, nullable=False)
    status          = Column(String(20), default="active", nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at      = Column(DateTime, nullable=False)


class PipelineEvent(Base):
    __tablename__ = "pipeline_events"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    event_type      = Column(String(50),  nullable=False)
    stage           = Column(String(50),  nullable=True)
    status          = Column(String(20),  nullable=False, default="success")
    doc_id          = Column(UUID(as_uuid=True), nullable=True)
    query_id        = Column(UUID(as_uuid=True), nullable=True)
    session_id      = Column(String(255), nullable=True, index=True)
    collection_id   = Column(UUID(as_uuid=True), nullable=True)
    duration_ms     = Column(Integer,     nullable=True)
    input_tokens    = Column(Integer,     nullable=True)
    output_tokens   = Column(Integer,     nullable=True)
    input_text      = Column(Text,        nullable=True)
    output_text     = Column(Text,        nullable=True)
    error_type      = Column(String(100), nullable=True)
    error_message   = Column(Text,        nullable=True)
    error_traceback  = Column(Text,        nullable=True)
    event_metadata   = Column("metadata", JSONB, nullable=True)
    created_at       = Column(DateTime,   default=datetime.utcnow, nullable=False)
