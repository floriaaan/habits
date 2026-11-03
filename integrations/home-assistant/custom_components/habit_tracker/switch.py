"""Boolean completion switches."""
from homeassistant.components.switch import SwitchEntity
from .entity import HabitEntity, discover


async def async_setup_entry(hass, entry, async_add_entities):
    discover(entry, async_add_entities, lambda c, i, item: [CompletionSwitch(c, i)] if item["habit"]["kind"] == "boolean" else [])


class CompletionSwitch(HabitEntity, SwitchEntity):
    def __init__(self, coordinator, habit_id):
        super().__init__(coordinator, habit_id, "completion")
        self._attr_name = coordinator.habits()[habit_id]["habit"]["name"] + " — réalisé"

    @property
    def is_on(self):
        return bool(self.item and self.item["completed"])

    async def async_turn_on(self, **kwargs):
        await self.coordinator.perform(self.habit_id, "complete")

    async def async_turn_off(self, **kwargs):
        await self.coordinator.perform(self.habit_id, "uncomplete")
