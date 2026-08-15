from fastapi import APIRouter

from app.api.v1.endpoints import auth, aws_accounts, customers, insights, reports

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(customers.router)
api_router.include_router(aws_accounts.router)
api_router.include_router(reports.router)
api_router.include_router(insights.router)
