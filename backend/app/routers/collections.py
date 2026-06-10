from app import crud
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin, get_current_user
from app.models import User
from app import schemas

router = APIRouter(prefix="/api/org", tags=["collections"])


@router.get("/collections", response_model=list[schemas.CollectionListItem])
def list_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    collections = crud.list_collections(db, current_user.org_id)
    return [
        schemas.CollectionListItem(
            collection_id=c.id,
            name=c.name,
            description=c.description,
            doc_count=c.doc_count,
            created_at=c.created_at,
        )
        for c in collections
    ]


@router.get("/my/collections", response_model=list[schemas.CollectionListItem])
def my_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collections = crud.list_collections(db, current_user.org_id)
    return [
        schemas.CollectionListItem(
            collection_id=c.id,
            name=c.name,
            description=c.description,
            doc_count=c.doc_count,
            created_at=c.created_at,
        )
        for c in collections
    ]


@router.post("/collection/create", response_model=schemas.CollectionResponse, status_code=201)
def create_collection(
    body: schemas.CollectionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    org_id = current_user.org_id

    limits = crud.get_org_limits(db, org_id)
    active_count = crud.count_active_collections(db, org_id)
    if active_count >= limits.max_collections:
        raise HTTPException(status_code=429, detail="Collection limit reached for this organisation")

    existing = crud.get_collection_by_name(db, org_id, body.name)
    if existing:
        raise HTTPException(status_code=409, detail="Collection name already exists in this organisation")

    col = crud.create_collection(db, org_id, body.name, body.description, current_user.id)

    return schemas.CollectionResponse(
        collection_id=col.id,
        name=col.name,
        org_id=col.org_id,
        doc_count=col.doc_count,
        created_at=col.created_at,
        description=col.description,
    )
