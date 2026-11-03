"""Dashboard and per-habit progression sensors."""
import voluptuous as vol
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers import entity_platform, config_validation as cv
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .entity import HabitEntity, discover


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([DashboardSensor(entry.runtime_data)])
    discover(entry, async_add_entities, lambda c, i, item: [ProgressSensor(c, i)])
    entity_platform.async_get_current_platform().async_register_entity_service(
        "perform_action", {vol.Required("habit_id"): cv.string,
                           vol.Required("action"): vol.In(["complete", "uncomplete", "increment", "decrement"])},
        "async_perform_action")


class DashboardSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Dashboard"
    _attr_icon = "mdi:chart-donut-variant"
    _attr_native_unit_of_measurement = "%"

    def __init__(self, coordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_dashboard"
        self._attr_suggested_object_id = "habit_tracker_dashboard"

    @property
    def native_value(self):
        return self.coordinator.data.get("global_percent")

    @property
    def extra_state_attributes(self):
        return {key: self.coordinator.data[key] for key in
                ("groups", "weekly", "heatmap", "gamification", "date", "timezone", "revision", "generated_at", "streak_91_days")}

    async def async_perform_action(self, habit_id, action):
        await self.coordinator.perform(habit_id, action)


class ProgressSensor(HabitEntity, SensorEntity):
    def __init__(self, coordinator, habit_id):
        super().__init__(coordinator, habit_id, "progress")
        self._attr_name = coordinator.habits()[habit_id]["habit"]["name"]

    @property
    def native_value(self):
        return self.item["progress"] if self.item else None

    @property
    def native_unit_of_measurement(self):
        return {"meters": "m", "milliliters": "mL", "seconds": "s", "count": None}.get((self.item or {}).get("habit", {}).get("unit"))

    @property
    def extra_state_attributes(self):
        if not self.item:
            return {}
        return {key: self.item[key] for key in ("target", "percent", "completed", "eligible", "actionable", "local_date", "presentation")} | {"category": self.item["habit"]["category"]}

    async def async_perform_action(self, habit_id, action):
        await self.coordinator.perform(habit_id, action)
