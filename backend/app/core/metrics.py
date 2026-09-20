from prometheus_client import Counter, Histogram

scan_duration_seconds = Histogram(
    "finops_scan_duration_seconds", "Account scan duration", ["scan_type"]
)
scan_failures_total = Counter(
    "finops_scan_failures_total", "Failed account scans", ["scan_type", "reason"]
)
findings_generated_total = Counter(
    "finops_findings_generated_total", "Findings written per scan", ["finding_type"]
)
steampipe_query_duration_seconds = Histogram(
    "finops_steampipe_query_duration_seconds", "steampipe-service call latency", ["outcome"]
)
ai_query_duration_seconds = Histogram(
    "finops_ai_query_duration_seconds", "AI copilot end-to-end latency"
)
ai_llm_tokens_total = Counter(
    "finops_ai_llm_tokens_total", "LLM tokens consumed", ["provider", "direction"]  # direction=prompt|completion
)