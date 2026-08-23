from types import SimpleNamespace

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.finding import FindingType
from app.models.user import User
from app.schemas.bff import CopilotChatRequest
from app.services import bff_helpers as bh
from app.services import sandbox_data

router = APIRouter(prefix="/copilot", tags=["frontend-copilot"])


def _sandbox_finding(resource_type: str, resource_id: str, savings: float) -> SimpleNamespace:
    return SimpleNamespace(resource_type=resource_type, resource_id=resource_id, estimated_monthly_savings_usd=savings)


def _sandbox_context() -> dict:
    """Same shape _build_context returns, but sourced entirely from
    sandbox_data instead of the database -- the sandbox Copilot is
    always rule-based, grounded only in this static mock data, and
    never calls a real LLM or touches any customer's real account."""
    s = sandbox_data.summary()
    days_elapsed = 23  # matches sandbox_data's fixed 30-day pattern's "today" position closely enough for chat copy
    spend = {
        "current_spend": s["currentSpend"],
        "projected_spend": s["projectedSpend"],
        "days_elapsed": days_elapsed,
        "days_in_month": 30,
    }
    waste_findings = [
        _sandbox_finding("ebs_volume", "vol-0123456789abcdef0", 42.00),
        _sandbox_finding("eip", "eip-unused-034fa21", 3.60),
    ]
    opt_findings = waste_findings + [_sandbox_finding("ec2_instance", "i-0a1b2c3d4e5f6a7b8", 93.60)]
    breakdown = sandbox_data.breakdown()["by_category"]
    return {
        "accounts": [SimpleNamespace(id="sandbox-account")],
        "spend": spend,
        "waste_findings": waste_findings,
        "opt_findings": opt_findings,
        "breakdown": breakdown,
    }


async def _build_context(db: AsyncSession, user: User) -> dict:
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    account_ids = [a.id for a in accounts]
    spend = await bh.month_to_date_spend(db, account_ids)
    waste_findings = await bh.open_findings(db, user.customer_id, [FindingType.ORPHANED])
    opt_findings = await bh.open_findings(
        db, user.customer_id, [FindingType.ORPHANED, FindingType.UNDERUTILIZED, FindingType.NIGHT_SHUTDOWN_CANDIDATE]
    )
    breakdown = await bh.breakdown_by_service(db, account_ids, top_n=5)
    return {
        "accounts": accounts,
        "spend": spend,
        "waste_findings": waste_findings,
        "opt_findings": opt_findings,
        "breakdown": breakdown,
    }


def _fmt(n: float) -> str:
    return f"${n:,.2f}"


@router.post("/chat")
async def chat(payload: CopilotChatRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    message = payload.message.lower().strip()
    ctx = _sandbox_context() if getattr(user, "is_sandbox", False) else await _build_context(db, user)

    if not ctx["accounts"]:
        return {"reply": "You don't have any connected AWS accounts yet, so I don't have spend data to analyze. Head to **Integrations** to connect one."}

    if any(k in message for k in ("waste", "zombie", "orphan")):
        findings = ctx["waste_findings"]
        if not findings:
            reply = "Good news -- I don't see any orphaned/unused resources right now. The Waste Radar is clean."
        else:
            total = bh.sum_savings(findings)
            top = sorted(findings, key=lambda f: float(f.estimated_monthly_savings_usd or 0), reverse=True)[:5]
            lines = "\n".join(f"- {bh.display_resource_type(f.resource_type)} `{f.resource_id}` -- ~${float(f.estimated_monthly_savings_usd or 0):.2f}/mo" for f in top)
            reply = f"I found **{len(findings)} orphaned resources** costing an estimated **{_fmt(total)}/month**. Top offenders:\n\n{lines}\n\nYou can act on these from the Orphaned Resources page."
        return {"reply": reply}

    if any(k in message for k in ("predict", "forecast", "q4", "next month", "bill")):
        s = ctx["spend"]
        reply = (
            f"Based on **{s['days_elapsed']} of {s['days_in_month']} days** elapsed this month, you've spent "
            f"**{_fmt(s['current_spend'])}** so far. Extrapolating the current run rate, month-end is projected at "
            f"**{_fmt(s['projected_spend'])}**.\n\nThis is a simple linear extrapolation, not a seasonality-aware forecast -- "
            f"treat it as a ballpark."
        )
        return {"reply": reply}

    if any(k in message for k in ("optimi", "save", "savings")):
        findings = ctx["opt_findings"]
        total = bh.sum_savings(findings)
        reply = (
            f"There are **{len(findings)} open optimization opportunities** worth an estimated **{_fmt(total)}/month** "
            f"combined (rightsizing, night-shutdown candidates, and orphaned resources). Check the Optimizations page "
            f"to review and apply them."
        ) if findings else "No open optimization findings right now -- your account is in good shape."
        return {"reply": reply}

    if any(k in message for k in ("top service", "top cost", "breakdown", "which service", "most expensive")):
        breakdown = ctx["breakdown"]
        if not breakdown:
            reply = "I don't have enough cost data yet to break this down by service."
        else:
            lines = "\n".join(f"{i+1}. **{b['name']}** -- {_fmt(b['value'])}" for i, b in enumerate(breakdown))
            reply = f"Here's your month-to-date spend by service:\n\n{lines}"
        return {"reply": reply}

    if "sql" in message:
        reply = (
            "I can't run arbitrary SQL from chat, but the underlying data (`daily_costs`, `findings`, "
            "`resource_snapshots`) is queryable directly against the Postgres database if you have access, "
            "or via the `/api/v1/aws-accounts/{id}/cost-forecast` and `/findings` REST endpoints."
        )
        return {"reply": reply}

    s = ctx["spend"]
    reply = (
        f"I'm a rule-based FinOps assistant (not a live LLM in this build) -- I can answer questions grounded in "
        f"your real account data. This month you've spent **{_fmt(s['current_spend'])}** so far, projected to "
        f"**{_fmt(s['projected_spend'])}** by month end.\n\nTry asking me about **waste**, **savings**, "
        f"**forecast**, or your **top services**."
    )
    return {"reply": reply}