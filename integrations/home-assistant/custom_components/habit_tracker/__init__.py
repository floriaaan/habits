"""Local Habit Tracker API integration."""
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import HabitApi
from .const import PLATFORMS
from .coordinator import HabitCoordinator


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
