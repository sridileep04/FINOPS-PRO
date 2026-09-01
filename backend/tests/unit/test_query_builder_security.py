"""Targeted security tests for app.services.query_builder_service.

Bandit's B608 check flags the f-string SQL assembly in build_query() as
a potential injection vector (see backend/tests/security/README.md for
the full audit writeup). This file exists to actually verify the claim
rather than just suppress the warning: table/column names come from a
hardcoded catalog (never user input), and user-supplied *values* go
through _escape_string_literal / _escape_like_literal or a strict
regex (_require_number / _require_int / _require_date) before being
embedded in the SQL string.

These tests attempt realistic single-quote-breakout and comment-
injection payloads through the public build_query() API and assert the
resulting SQL string keeps the attacker's input safely quoted, never
literally: `... OR 1=1 --` (a hunk of naked, unquoted SQL) as it would
if the value were unescaped.
"""
import pytest

from app.services.query_builder_service import QueryBuilderError, build_query

pytestmark = pytest.mark.unit


class TestStringFieldInjectionAttempts:
    def test_single_quote_breakout_attempt_is_neutralized(self):
        query = build_query(
            service_key="ec2_instance",
            column_keys=None,
            conditions=[{"column": "instance_id", "operator": "equals", "value": "x' OR '1'='1"}],
        )
        # The attacker's quote must be doubled (escaped), not left as a
        # literal SQL-breaking quote followed by an always-true clause.
        assert "OR '1'='1" not in query.sql or "''1''" in query.sql
        assert "x'' OR ''1''=''1" in query.sql

    def test_classic_drop_table_payload_stays_inside_a_quoted_string(self):
        payload = "x'; DROP TABLE users; --"
        query = build_query(
            service_key="ec2_instance",
            column_keys=None,
            conditions=[{"column": "instance_id", "operator": "equals", "value": payload}],
        )
        # The escaped payload must appear as a doubled-quote string, and
        # a bare (unescaped) `DROP TABLE` statement boundary must not
        # exist in the generated SQL.
        assert "x''; DROP TABLE users; --" in query.sql
        assert "';\nDROP TABLE" not in query.sql

    def test_like_wildcard_characters_in_contains_are_escaped_not_interpreted(self):
        # A literal `%` or `_` typed by a user must not silently behave
        # as a SQL wildcard in a "contains" filter.
        query = build_query(
            service_key="ec2_instance",
            column_keys=None,
            conditions=[{"column": "instance_id", "operator": "contains", "value": "100%_off"}],
        )
        assert "100\\%\\_off" in query.sql
        assert "ESCAPE '\\'" in query.sql


class TestNumericAndDateFieldsRejectNonNumericInput:
    def test_number_field_rejects_sql_payload_instead_of_embedding_it(self):
        with pytest.raises(QueryBuilderError):
            build_query(
                service_key="ebs_volume",
                column_keys=None,
                conditions=[{"column": "size", "operator": "equals", "value": "1; DROP TABLE users"}],
            )

    def test_date_field_rejects_non_date_payload(self):
        with pytest.raises(QueryBuilderError):
            build_query(
                service_key="ec2_instance",
                column_keys=None,
                conditions=[{"column": "launch_time", "operator": "after", "value": "2024-01-01' OR '1'='1"}],
            )


class TestColumnAndTableIdentifiersAreAllowlisted:
    def test_unknown_column_key_is_rejected_not_interpolated(self):
        with pytest.raises(QueryBuilderError):
            build_query(
                service_key="ec2_instance",
                column_keys=None,
                conditions=[{"column": "instance_id; DROP TABLE users", "operator": "equals", "value": "x"}],
            )

    def test_unknown_service_key_is_rejected(self):
        with pytest.raises(QueryBuilderError):
            build_query(service_key="not_a_real_service; DROP TABLE users", column_keys=None, conditions=[])

    def test_unknown_operator_is_rejected(self):
        with pytest.raises(QueryBuilderError):
            build_query(
                service_key="ec2_instance",
                column_keys=None,
                conditions=[{"column": "instance_id", "operator": "1=1; --", "value": "x"}],
            )