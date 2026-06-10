from uuid import UUID
from app import crud
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin, require_super_admin
from app.encryption import decrypt_value
from app.models import User
from app import schemas

router = APIRouter(prefix="/api", tags=["org"])


@router.get("/orgs")
def list_orgs(db: Session = Depends(get_db)):
    orgs = crud.get_all_orgs_decrypted(db)
    return [{"org_id": str(o["id"]), "org_name": o["name"]} for o in orgs]


@router.post("/org/register", response_model=schemas.OrgRegisterResponse, status_code=201)
def register_org(body: schemas.OrgRegisterRequest, db: Session = Depends(get_db)):
    existing = crud.find_org_by_name(db, body.org_name)
    if existing:
        raise HTTPException(status_code=409, detail="Organisation already registered")

    org, limits = crud.create_org(
        db, body.org_name,
        max_users=body.max_users,
        max_collections=body.max_collections,
        max_docs_per_collection=body.max_docs_per_collection,
    )
    return schemas.OrgRegisterResponse(
        org_id=org.id,
        org_name=body.org_name,
        limits=schemas.OrgLimitsOut(
            max_users=limits.max_users,
            max_collections=limits.max_collections,
            max_docs_per_collection=limits.max_docs_per_collection,
        ),
    )


@router.get("/org/stats", response_model=schemas.OrgStatsResponse)
def org_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    org_id = current_user.org_id
    org = crud.get_org_by_id(db, org_id)
    org_name = decrypt_value(db, org.name_encrypted)
    limits = crud.get_org_limits(db, org_id)
    active_users = crud.count_active_users(db, org_id)
    active_collections = crud.count_active_collections(db, org_id)
    file_usage = crud.get_org_file_usage_today(db, org_id)

    return schemas.OrgStatsResponse(
        org_id=org_id,
        org_name=org_name,
        limits=schemas.OrgLimitStats(
            users=schemas.LimitStat(used=active_users, limit=limits.max_users),
            collections=schemas.LimitStat(used=active_collections, limit=limits.max_collections),
        ),
        file_usage_today=[
            schemas.FileUsageItem(username=f["username"], uploaded=f["uploaded"], remaining=f["remaining"])
            for f in file_usage
        ],
    )


@router.patch("/admin/org/{org_id}/limits", response_model=schemas.UpdateLimitsResponse)
def update_limits(
    org_id: UUID,
    body: schemas.UpdateLimitsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    org = crud.get_org_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    limits = crud.update_org_limits(
        db, org_id, body.max_users, body.max_collections, body.max_docs_per_collection
    )
    return schemas.UpdateLimitsResponse(
        org_id=org_id,
        max_users=limits.max_users,
        max_collections=limits.max_collections,
        max_docs_per_collection=limits.max_docs_per_collection,
    )
