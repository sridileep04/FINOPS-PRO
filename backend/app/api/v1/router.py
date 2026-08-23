from fastapi import APIRouter

from app.api.v1.endpoints import auth, aws_accounts, customers, insights, reports, dashboard, resources, aws_health, orphaned, optimizations, features, integrations, settings, terraform, copilot, agent, sync,ai_copilot

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(customers.router)
api_router.include_router(aws_accounts.router)
api_router.include_router(reports.router)
api_router.include_router(insights.router)
api_router.include_router(dashboard.router)
api_router.include_router(resources.router)
api_router.include_router(aws_health.router)
api_router.include_router(orphaned.router)
api_router.include_router(optimizations.router)
api_router.include_router(features.router)
api_router.include_router(integrations.router)
api_router.include_router(settings.router)
api_router.include_router(terraform.router)
api_router.include_router(copilot.router)
api_router.include_router(agent.router)
api_router.include_router(sync.router)
api_router.include_router(ai_copilot.router)