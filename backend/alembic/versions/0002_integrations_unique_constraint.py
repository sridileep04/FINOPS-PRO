"""dedupe integrations and add unique constraint on (customer_id, integration_key)

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-16
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove pre-existing duplicate rows first, or the constraint add will fail.
    op.execute("""
        DELETE FROM integrations a USING integrations b
        WHERE a.id > b.id
          AND a.customer_id = b.customer_id
          AND a.integration_key = b.integration_key
    """)
    op.create_unique_constraint(
        "uq_customer_integration_key", "integrations", ["customer_id", "integration_key"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_customer_integration_key", "integrations", type_="unique")