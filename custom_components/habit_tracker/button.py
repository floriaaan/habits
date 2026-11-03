"""Increment/decrement buttons use canonical units and backend presentation.step."""
from homeassistant.components.button import ButtonEntity
from .entity import HabitEntity, discover


async def async_setup_entry(hass, entry, async_add_entities):
    discover(entry, async_add_entities, lambda c, i, item: [StepButton(c, i, action) for action in ("increment", "decrement")] if item["habit"]["kind"] != "boolean" else [])


class StepButton(HabitEntity, ButtonEntity):
    def __init__(self, coordinator, habit_id, action):
        super().__init__(coordinator, habit_id, action)
        self.action = action
        self._attr_name = coordinator.habits()[habit_id]["habit"]["name"] + (" — ajouter" if action == "increment" else " — retirer")
        self._attr_icon = "mdi:plus" if action == "increment" else "mdi:minus"

    async def async_press(self):
        await self.coordinator.perform(self.habit_id, self.action)
