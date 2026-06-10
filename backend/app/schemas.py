from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator


class OrgRegisterRequest(BaseModel):
    org_name: str
    max_users: int = 10
    max_collections: int = 5
    max_docs_per_collection: int = 50

    @field_validator("org_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("org_name must not be empty")
        return v.strip()

    @field_validator("max_users", "max_collections", "max_docs_per_collection")
    @classmethod
    def positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Limit must be a positive integer")
        return v


class OrgLimitsOut(BaseModel):
    max_users: int
    max_collections: int
    max_docs_per_collection: int


class OrgRegisterResponse(BaseModel):
    org_id: UUID
    org_name: str
    limits: OrgLimitsOut


class UserRegisterRequest(BaseModel):
    org_name: str
    username: str
    password: str

    @field_validator("org_name", "username", "password")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field must not be empty")
        return v.strip()


class UserRegisterResponse(BaseModel):
    user_id: UUID
    username: str
    org_id: UUID
    role: str


class LoginRequest(BaseModel):
    org_name: str
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    org_id: UUID
    role: str


class UserProfileResponse(BaseModel):
    user_id: UUID
    username: str
    org_id: UUID
    org_name: str
    role: str
    is_active: bool
    created_at: datetime


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("new_password must be at least 8 characters")
        return v


class CollectionCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be empty")
        return v.strip()


class CollectionResponse(BaseModel):
    collection_id: UUID
    name: str
    org_id: UUID
    doc_count: int
    created_at: datetime
    description: Optional[str] = None


class CollectionListItem(BaseModel):
    collection_id: UUID
    name: str
    description: Optional[str]
    doc_count: int
    created_at: datetime


class UserListItem(BaseModel):
    user_id: UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime


class FileUsageItem(BaseModel):
    username: str
    uploaded: int
    remaining: int


class LimitStat(BaseModel):
    used: int
    limit: int


class OrgLimitStats(BaseModel):
    users: LimitStat
    collections: LimitStat


class OrgStatsResponse(BaseModel):
    org_id: UUID
    org_name: str
    limits: OrgLimitStats
    file_usage_today: List[FileUsageItem]


class UpdateLimitsRequest(BaseModel):
    max_users: int
    max_collections: int
    max_docs_per_collection: int

    @field_validator("max_users", "max_collections", "max_docs_per_collection")
    @classmethod
    def positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Value must be a positive integer")
        return v


class UpdateLimitsResponse(BaseModel):
    org_id: UUID
    max_users: int
    max_collections: int
    max_docs_per_collection: int


class UploadResponse(BaseModel):
    message: str
    uploads_used_today: int
    uploads_remaining_today: int


class MessageResponse(BaseModel):
    message: str


class UsernameRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("username must not be empty")
        return v.strip()


# ── Super Admin Schemas ───────────────────────────────────────────────────────

class SuperAdminLoginRequest(BaseModel):
    username: str
    password: str


class SuperAdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SuperAdminRegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        return v


class OrgConsentRequest(BaseModel):
    data_consent: bool
    allow_training: bool


class OrgConsentResponse(BaseModel):
    org_id: UUID
    org_name: str
    data_consent: bool
    allow_training: bool
    consent_updated_at: Optional[datetime]


class OrgWithStatsResponse(BaseModel):
    org_id: UUID
    org_name: str
    data_consent: bool
    allow_training: bool
    consent_updated_at: Optional[datetime]
    created_at: datetime
    user_count: int
    collection_count: int
    doc_count: int
    limits: OrgLimitsOut


class PlatformStatsResponse(BaseModel):
    total_orgs: int
    total_users: int
    active_users: int
    total_collections: int
    total_docs: int
    orgs_with_data_consent: int
    orgs_with_training_consent: int
