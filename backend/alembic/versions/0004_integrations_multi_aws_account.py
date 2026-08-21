"""allow multiple aws_role/aws_keys integration rows per customer

Replaces the single UniqueConstraint(customer_id, integration_key) --
which capped every integration (including AWS) at exactly one row per
customer -- with two partial unique indexes:

  * uq_integration_singleton_provider: unchanged singleton behaviour
    for every non-AWS-account integration_key (gcp_*, azure_*, aws_cur,
    ghost_agent, ...).
  * uq_integration_aws_template: for aws_role / aws_keys, only the
    "template" row (aws_account_id IS NULL) is constrained to one per
    key. Connected rows (aws_account_id IS NOT NULL) are free to repeat
    the same integration_key, so a customer can connect multiple AWS
    accounts under aws_role and/or aws_keys.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_customer_integration_key", "integrations", type_="unique")

    op.create_index(
        "uq_integration_singleton_provider",
        "integrations",
        ["customer_id", "integration_key"],
        unique=True,
        postgresql_where=sa.text("integration_key NOT IN ('aws_role', 'aws_keys')"),
    )
    op.create_index(
        "uq_integration_aws_template",
        "integrations",
        ["customer_id", "integration_key"],
        unique=True,
        postgresql_where=sa.text("integration_key IN ('aws_role', 'aws_keys') AND aws_account_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_integration_aws_template", table_name="integrations")
    op.drop_index("uq_integration_singleton_provider", table_name="integrations")

    # Restoring the old single-row-per-key constraint would fail outright
    # if any customer now has multiple connected aws_role/aws_keys rows,
    # so collapse back down to one row per key first, keeping the most
    # recently updated (most likely to be the "real" one) and deleting
    # the rest -- mirroring the dedupe approach 0002 used going forward.
    op.execute(
        """
        DELETE FROM integrations a USING integrations b
        WHERE a.id <> b.id
          AND a.customer_id = b.customer_id
          AND a.integration_key = b.integration_key
          AND (a.updated_at, a.id) < (b.updated_at, b.id)
        """
    )
    op.create_unique_constraint(
        "uq_customer_integration_key", "integrations", ["customer_id", "integration_key"]
    )