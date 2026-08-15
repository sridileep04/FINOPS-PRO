# from app.models.customer import Customer  # noqa: F401
# from app.models.user import User  # noqa: F401
# from app.models.aws_account import AwsAccount, AuthMethod, ValidationStatus  # noqa: F401
# from app.models.report import Report, ReportType, ReportStatus  # noqa: F401
# from app.models.scan_run import ScanRun, ScanStatus  # noqa: F401
# from app.models.resource_snapshot import ResourceSnapshot  # noqa: F401
# from app.models.metric_sample import MetricSample  # noqa: F401
# from app.models.daily_cost import DailyCost  # noqa: F401
# from app.models.finding import Finding, FindingType, FindingSeverity, FindingStatus  # noqa: F401
# from app.models.bff import (  # noqa: F401
#     Budget,
#     AlertRule,
#     FeatureFlag,
#     Integration,
#     IntegrationStatus,
#     TerraformDriftResolution,
#     PlatformSetting,
#     AgentEvent,
#     AnomalyAcknowledgement,
# )
import pkgutil
from pathlib import Path
from app.db.base import Base  # Import your SQLAlchemy base

# Automatically import all modules in this directory so Base.metadata populates
package_dir = Path(__file__).resolve().parent
for _, module_name, _ in pkgutil.iter_modules([str(package_dir)]):
    __import__(f"{__package__}.{module_name}")