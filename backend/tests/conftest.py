from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app


@dataclass
class FakeResponse:
    data: list[dict[str, Any]]
    count: int | None = None


class FakeAuthAdmin:
    def __init__(self, users: dict[str, dict[str, Any]], client: "FakeSupabase"):
        self._users = users
        self._client = client

    def get_user_by_id(self, user_id: str) -> Any:
        user = self._users.get(user_id, {})
        email = user.get("email")
        return type("Result", (), {"user": type("User", (), {"email": email})()})()

    def create_user(self, payload: dict[str, Any]) -> Any:
        user_id = f"auth-{self._client.next_id('auth_users')}"
        self._users[user_id] = {
            "email": payload.get("email"),
            "user_metadata": payload.get("user_metadata") or {},
        }
        user = type("User", (), {"id": user_id, "email": payload.get("email")})()
        return type("Result", (), {"user": user})()

    def invite_user_by_email(self, email: str, options: dict[str, Any] | None = None) -> Any:
        user_id = f"auth-{self._client.next_id('auth_users')}"
        self._users[user_id] = {
            "email": email,
            "user_metadata": (options or {}).get("data") or {},
        }
        user = type("User", (), {"id": user_id, "email": email})()
        return type("Result", (), {"user": user})()

    def delete_user(self, user_id: str) -> None:
        self._users.pop(user_id, None)


class FakeAuth:
    def __init__(self, users: dict[str, dict[str, Any]], client: "FakeSupabase"):
        self.admin = FakeAuthAdmin(users, client)


class FakeQuery:
    def __init__(self, client: "FakeSupabase", table_name: str):
        self.client = client
        self.table_name = table_name
        self.filters: list[tuple[str, str, Any]] = []
        self._limit: int | None = None
        self._order_by: tuple[str, bool] | None = None
        self._operation = "select"
        self._payload: Any = None
        self._count: str | None = None

    def select(self, _columns: str = "*", count: str | None = None) -> "FakeQuery":
        self._operation = "select"
        self._count = count
        return self

    def eq(self, field: str, value: Any) -> "FakeQuery":
        self.filters.append(("eq", field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> "FakeQuery":
        self.filters.append(("in", field, values))
        return self

    def order(self, field: str, desc: bool = False) -> "FakeQuery":
        self._order_by = (field, desc)
        return self

    def limit(self, value: int) -> "FakeQuery":
        self._limit = value
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> "FakeQuery":
        self._operation = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "FakeQuery":
        self._operation = "update"
        self._payload = payload
        return self

    def upsert(self, payload: dict[str, Any]) -> "FakeQuery":
        self._operation = "upsert"
        self._payload = payload
        return self

    def delete(self) -> "FakeQuery":
        self._operation = "delete"
        return self

    def _apply_filters(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        filtered = rows
        for op, field, value in self.filters:
            if op == "eq":
                filtered = [row for row in filtered if row.get(field) == value]
            elif op == "in":
                value_set = set(value)
                filtered = [row for row in filtered if row.get(field) in value_set]
        return filtered

    def execute(self) -> FakeResponse:
        table = self.client.tables.setdefault(self.table_name, [])
        filtered = self._apply_filters(table)

        if self._operation == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted: list[dict[str, Any]] = []
            for payload in payloads:
                row = deepcopy(payload)
                if "id" not in row:
                    row["id"] = self.client.next_id(self.table_name)
                table.append(row)
                inserted.append(deepcopy(row))
            return FakeResponse(data=inserted)

        if self._operation == "update":
            updated: list[dict[str, Any]] = []
            for row in filtered:
                row.update(self._payload or {})
                updated.append(deepcopy(row))
            return FakeResponse(data=updated)

        if self._operation == "upsert":
            payload = deepcopy(self._payload or {})
            row_id = payload.get("id")
            existing = None
            if row_id is not None:
                for row in table:
                    if row.get("id") == row_id:
                        existing = row
                        break

            if existing is not None:
                existing.update(payload)
                return FakeResponse(data=[deepcopy(existing)])

            if "id" not in payload:
                payload["id"] = self.client.next_id(self.table_name)
            table.append(payload)
            return FakeResponse(data=[deepcopy(payload)])

        if self._operation == "delete":
            deleted = [deepcopy(row) for row in filtered]
            self.client.tables[self.table_name] = [
                row for row in table if row not in filtered
            ]
            return FakeResponse(data=deleted)

        selected = deepcopy(filtered)
        if self._order_by:
            field, desc = self._order_by
            selected.sort(key=lambda row: row.get(field), reverse=desc)
        if self._limit is not None:
            selected = selected[: self._limit]
        count = len(filtered) if self._count == "exact" else None
        return FakeResponse(data=selected, count=count)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict[str, Any]]] = {
            "profiles": [],
            "mentor_profiles": [],
            "mentee_profiles": [],
            "matches": [],
            "volunteer_hours": [],
            "preapproved_emails": [],
            "program_applications": [],
            "match_messages": [],
        }
        self.users: dict[str, dict[str, Any]] = {}
        self._counters: dict[str, int] = {
            "auth_users": 1,
            "matches": 1,
            "volunteer_hours": 1,
        }
        self.auth = FakeAuth(self.users, self)

    def table(self, table_name: str) -> FakeQuery:
        return FakeQuery(self, table_name)

    def next_id(self, table_name: str) -> int:
        current = self._counters.get(table_name, 1)
        self._counters[table_name] = current + 1
        return current


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides = {}


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()
