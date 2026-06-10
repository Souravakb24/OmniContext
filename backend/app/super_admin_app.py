from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.routers import super_admin

app = FastAPI(
    title="ContextFlow Super Admin API",
    version="1.0.0",
    description="Internal platform management API — not exposed to organisations",
)

app.include_router(super_admin.router)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok"}
