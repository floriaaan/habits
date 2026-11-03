"""Shared dynamic entity registration and tenant-safe identities."""
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.core import callback

from .const import DOMAIN


class HabitEntity(CoordinatorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator, habit_id, suffix):
        super().__init__(coordinator)
        self.habit_id = habit_id
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{habit_id}_{suffix}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, coordinator.entry.entry_id)},
                                            name="Habit Tracker", manufacturer="Habit Tracker")

    @property
    def item(self):
        return self.coordinator.habits().get(self.habit_id)

    @property
    def available(self):
        return super().available and self.item is not None

    @property
    def icon(self):
        return (self.item or {}).get("presentation", {}).get("icon") or "mdi:check-circle-outline"


def discover(entry, async_add_entities, factory):
    coordinator = entry.runtime_data
    known = set()

    @callback
    def add_new():
        entities = []
        for habit_id, item in coordinator.habits().items():
            if habit_id not in known:
                known.add(habit_id)
                entities.extend(factory(coordinator, habit_id, item))
        if entities:
            async_add_entities(entities)

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))
