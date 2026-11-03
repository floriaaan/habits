"""Local Habit Tracker API integration."""
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import config_validation as cv
from homeassistant.loader import async_get_integration

from .api import HabitApi
from .const import DOMAIN, PLATFORMS
from .coordinator import HabitCoordinator

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass, config):
    """Serve and load the bundled card once, shared by all config entries."""
    integration = await async_get_integration(hass, DOMAIN)
    card_url = f"/habit_tracker/frontend/{integration.version}/habit-tracker-card.js"
    await hass.http.async_register_static_paths([
        StaticPathConfig(card_url, str(Path(__file__).parent / "www/habit-tracker-card.js"), True)
    ])
    frontend.add_extra_js_url(hass, card_url)
    return True


async def async_setup_entry(hass, entry):
    api = HabitApi(async_get_clientsession(hass), entry.data["url"], entry.data["token"])
    coordinator = HabitCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    coordinator.start()
    return True


async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    await entry.runtime_data.stop()
    return True
