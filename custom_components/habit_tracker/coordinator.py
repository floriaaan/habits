"""One snapshot and one authenticated stream per config entry."""
from __future__ import annotations

import asyncio
from datetime import timedelta
import logging

import aiohttp
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import ApiError, HabitApi, InvalidAuth

_LOGGER = logging.getLogger(__name__)


class HabitCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, entry, api: HabitApi):
        super().__init__(hass, _LOGGER, config_entry=entry, name="Habit Tracker",
                         update_interval=timedelta(seconds=60))
        self.api = api
        self.entry = entry
        self.stream_task = None
        self._snapshot_lock = asyncio.Lock()

    async def _async_update_data(self):
        try:
            async with self._snapshot_lock:
                return await self.api.dashboard()
        except InvalidAuth as err:
            raise ConfigEntryAuthFailed("Check the Habit Tracker token and scopes") from err
        except (ApiError, aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise UpdateFailed("Habit Tracker is unavailable") from err

    def habits(self):
        return {item["habit"]["id"]: item for group in (self.data or {}).get("groups", [])
                for item in group["habits"]}

    async def perform(self, habit_id: str, action: str):
        if habit_id not in self.habits():
            raise HomeAssistantError("Habit no longer available")
        try:
            await self.api.action(habit_id, action)
        except InvalidAuth as err:
            self.entry.async_start_reauth(self.hass)
            raise HomeAssistantError("Habit Tracker authentication expired") from err
        except (ApiError, aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise HomeAssistantError("Habit Tracker rejected the action; refresh before retrying") from err
        await self.async_refresh()

    async def stream(self):
        delay = 1
        while True:
            try:
                async for _ in self.api.events():
                    await self.async_refresh()
                    delay = 1
                # Expected server stream rotation also reconnects with fresh auth.
            except InvalidAuth:
                self.async_set_update_error(ConfigEntryAuthFailed("Habit Tracker token revoked or expired"))
                self.entry.async_start_reauth(self.hass)
                return
            except (ApiError, aiohttp.ClientError, asyncio.TimeoutError):
                self.async_set_update_error(UpdateFailed("Habit Tracker stream disconnected"))
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    def start(self):
        self.stream_task = self.entry.async_create_background_task(
            self.hass, self.stream(), "Habit Tracker event stream")

    async def stop(self):
        if self.stream_task:
            self.stream_task.cancel()
            try:
                await self.stream_task
            except asyncio.CancelledError:
                pass
            self.stream_task = None
