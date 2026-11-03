"""Authenticated API client. Secrets never enter entity attributes or logs."""
from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import aiohttp
from yarl import URL


class InvalidAuth(Exception):
    """Token is missing, expired, revoked, or lacks required scopes."""


class ApiError(Exception):
    """Backend rejected a request or is unavailable."""


def validate_url(value: str, allow_http: bool) -> str:
    """Require an explicit endpoint; never follow redirects with a token."""
    url = URL(value)
    if (url.scheme not in ("http", "https") or not url.host or url.user
            or url.password or url.query_string or url.fragment
            or (url.scheme == "http" and not allow_http)):
        raise ValueError("Use HTTPS, or explicitly allow HTTP on a trusted local link")
    return str(url).rstrip("/")


class HabitApi:
    def __init__(self, session: aiohttp.ClientSession, url: str, token: str) -> None:
        self.session = session
        self.url = url
        self._headers = {"Authorization": f"Bearer {token}"}

    async def request(self, method: str, path: str, *, body=None, key=None):
        headers = dict(self._headers)
        if key:
            headers["Idempotency-Key"] = key
        async with self.session.request(
            method, self.url + path, headers=headers, json=body,
            allow_redirects=False, timeout=aiohttp.ClientTimeout(total=9),
        ) as response:
            if response.status in (401, 403):
                raise InvalidAuth
            if response.status >= 300:
                raise ApiError(f"Backend returned HTTP {response.status}")
            # Bound the body even if the server/proxy is misconfigured.
            data = bytearray()
            async for chunk in response.content.iter_chunked(65536):
                data.extend(chunk)
                if len(data) > 8 * 1024 * 1024:
                    raise ApiError("Dashboard exceeds 8 MiB")
            try:
                return json.loads(data)
            except (ValueError, TypeError) as err:
                raise ApiError("Invalid JSON response") from err

    async def dashboard(self):
        data = await self.request("GET", "/api/v1/dashboard")
        if not isinstance(data, dict) or not isinstance(data.get("groups"), list) or not data.get("user_id"):
            raise ApiError("Invalid dashboard response")
        return data

    async def action(self, habit_id: str, action: str):
        # One key per human action, reused after an ambiguous transport failure.
        key = str(uuid4())
        for attempt in range(2):
            try:
                return await self.request("POST", f"/api/v1/habits/{habit_id}/actions",
                                          body={"action": action}, key=key)
            except (aiohttp.ClientError, asyncio.TimeoutError):
                if attempt:
                    raise

    async def events(self):
        async with self.session.get(
            self.url + "/api/v1/dashboard/events", headers=self._headers,
            allow_redirects=False, timeout=aiohttp.ClientTimeout(total=None, sock_read=45),
        ) as response:
            if response.status in (401, 403):
                raise InvalidAuth
            if response.status != 200 or not response.headers.get("Content-Type", "").startswith("text/event-stream"):
                raise ApiError("Event stream unavailable")
            async for raw in response.content:
                if len(raw) > 8192:
                    raise ApiError("Invalid event stream")
                if raw.strip() == b"event: invalidate":
                    yield None
