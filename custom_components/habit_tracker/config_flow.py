"""Configure a backend URL and tenant-scoped PAT, validated before saving."""
import asyncio

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import selector

from .api import ApiError, HabitApi, InvalidAuth, validate_url
from .const import CONF_ALLOW_HTTP, DOMAIN

TOKEN_SELECTOR = selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD))
SCHEMA = vol.Schema({vol.Required("url"): str,
                     vol.Required("token"): TOKEN_SELECTOR,
                     vol.Optional(CONF_ALLOW_HTTP, default=False): bool})


class HabitTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                url = validate_url(user_input["url"], user_input.get(CONF_ALLOW_HTTP, False))
                api = HabitApi(async_get_clientsession(self.hass), url, user_input["token"])
                data = await api.dashboard()
                await self.async_set_unique_id(f"{url}|{data['user_id']}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title="Habit Tracker", data={**user_input, "url": url})
            except ValueError:
                errors["base"] = "invalid_url"
            except InvalidAuth:
                errors["base"] = "invalid_auth"
            except (ApiError, aiohttp.ClientError, asyncio.TimeoutError):
                errors["base"] = "cannot_connect"
        return self.async_show_form(step_id="user", data_schema=SCHEMA, errors=errors)

    async def async_step_reauth(self, entry_data):
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        entry = self._get_reauth_entry()
        errors = {}
        if user_input:
            try:
                data = await HabitApi(async_get_clientsession(self.hass), entry.data["url"], user_input["token"]).dashboard()
                if f"{entry.data['url']}|{data['user_id']}" != entry.unique_id:
                    return self.async_abort(reason="wrong_account")
                return self.async_update_reload_and_abort(entry, data_updates=user_input)
            except InvalidAuth:
                errors["base"] = "invalid_auth"
            except (ApiError, aiohttp.ClientError, asyncio.TimeoutError):
                errors["base"] = "cannot_connect"
        return self.async_show_form(step_id="reauth_confirm", data_schema=vol.Schema({vol.Required("token"): TOKEN_SELECTOR}), errors=errors)
