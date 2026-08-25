"""Populates ai_knowledge_chunks from data you already have (Findings today;
Reports/anomaly logs follow the same pattern). Wired into
app.tasks.scan_tasks.run_account_scan_task, right after
analysis_service.run_all_analyses() -- see that file for why that's the
one place that covers every trigger (nightly cron, manual re-scan,
post-connect scan) without a separate schedule or a frontend button.
"""
import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.vector_store import add_chunks
from app.models.ai_knowledge_chunk import AiKnowledgeChunk, KnowledgeSourceType
from app.models.finding import Finding, FindingStatus

logger = logging.getLogger(__name__)

_SOURCE_TYPE_BY_FINDING_TYPE = {
    "cost_anomaly": KnowledgeSourceType.ANOMALY_LOG,
}

# The two source types this module derives from Finding rows. Used to scope
# the "delete existing chunks before re-inserting" step so a re-sync never
# touches cost_report or policy_doc chunks, which come from elsewhere.
_FINDING_DERIVED_SOURCE_TYPES = [
    KnowledgeSourceType.ANOMALY_LOG,
    KnowledgeSourceType.OPTIMIZATION_RECOMMENDATION,
]


def _finding_source_type(finding: Finding) -> KnowledgeSourceType:
    return _SOURCE_TYPE_BY_FINDING_TYPE.get(
        finding.finding_type.value, KnowledgeSourceType.OPTIMIZATION_RECOMMENDATION
    )


def _finding_to_text(finding: Finding) -> str:
    parts = [f"{finding.title}.", finding.description.strip()]
    if finding.recommendation:
        parts.append(f"Recommendation: {finding.recommendation.strip()}")
    if finding.estimated_monthly_savings_usd:
        parts.append(f"Estimated monthly savings: ${float(finding.estimated_monthly_savings_usd):.2f}.")
    if finding.resource_id:
        parts.append(f"Resource: {finding.resource_type or ''} {finding.resource_id}".strip())
    return " ".join(parts)


async def ingest_finding(db: AsyncSession, finding: Finding, *, commit: bool = True) -> None:
    text = _finding_to_text(finding)
    await add_chunks(
        db,
        customer_id=finding.customer_id,
        aws_account_id=finding.aws_account_id,
        source_type=_finding_source_type(finding),
        source_id=finding.id,
        texts=[text],
        metadata={
            "finding_type": finding.finding_type.value,
            "severity": finding.severity.value,
            "resource_id": finding.resource_id,
        },
        commit=commit,
    )


async def ingest_account_findings(db: AsyncSession, aws_account_id: uuid.UUID) -> int:
    """Re-syncs the knowledge base with exactly this account's currently-open
    findings. Deletes this account's existing finding-derived chunks first,
    then re-inserts one per open finding -- so calling this repeatedly (e.g.
    every night after a scan) never accumulates duplicates for a finding
    that's still open and unchanged, and a finding that got resolved since
    the last scan simply isn't re-inserted (its stale chunk is gone, not
    left behind pointing at outdated advice).

    This is the function wired into run_account_scan_task -- one account's
    scan finishes, one account's slice of the knowledge base gets refreshed.
    Scoping to the single account (rather than the whole customer) keeps a
    nightly run's AI cost proportional to what actually changed instead of
    re-embedding every account's findings every time any one of them scans.
    """
    await db.execute(
        delete(AiKnowledgeChunk).where(
            AiKnowledgeChunk.aws_account_id == aws_account_id,
            AiKnowledgeChunk.source_type.in_(_FINDING_DERIVED_SOURCE_TYPES),
        )
    )

    result = await db.execute(
        select(Finding).where(Finding.aws_account_id == aws_account_id, Finding.status == FindingStatus.OPEN)
    )
    findings = result.scalars().all()
    for finding in findings:
        await ingest_finding(db, finding, commit=False)
    await db.commit()
    return len(findings)


async def ingest_all_open_findings(db: AsyncSession, customer_id: uuid.UUID) -> int:
    """Customer-wide equivalent of ingest_account_findings, for a manual full
    backfill/debug trigger (see POST /ai/knowledge-base/sync) rather than the
    routine per-account path above. Same delete-then-reinsert idempotency.
    """
    await db.execute(
        delete(AiKnowledgeChunk).where(
            AiKnowledgeChunk.customer_id == customer_id,
            AiKnowledgeChunk.source_type.in_(_FINDING_DERIVED_SOURCE_TYPES),
        )
    )

    result = await db.execute(
        select(Finding).where(Finding.customer_id == customer_id, Finding.status == FindingStatus.OPEN)
    )
    findings = result.scalars().all()
    for finding in findings:
        await ingest_finding(db, finding, commit=False)
    await db.commit()
    return len(findings)