"""Real HA 2026.10.2 + Rust API, in isolated temporary directories.

Run with HABIT_TRACKER_BIN=/absolute/path/to/habit-tracker python -m unittest
discover -s tests -p 'test_home_assistant.py' -v. Never connects to an operator HA.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntries, ConfigEntryState
from homeassistant import loader
from homeassistant.auth import auth_manager_from_config
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceYAMLCollection
from homeassistant.setup import async_setup_component
from homeassistant.bootstrap import async_load_base_functionality

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from package_home_assistant import CLIENT_ROOT, package

class LoopbackResolver(aiohttp.ThreadedResolver):
    async def close(self):
        """HA owns its resolver's lifetime."""

    async def real_close(self):
        await super().close()


class HomeAssistantEndToEnd(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="habit-tracker-ha-test-")
        # Python caches imported integration modules across the HA instances.
        # Keep their ZIP installation paths valid until every test has stopped.
        self.addClassCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name)
        self.binary = str(Path(os.environ["HABIT_TRACKER_BIN"]).resolve())
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        # Deliberately construct the environment: no real provider credentials.
        env = {"PATH": os.environ["PATH"], "DATABASE_PATH": str(self.path / "habits.sqlite"),
               "AUTH_MODE": "local", "LISTEN_ADDR": f"127.0.0.1:{port}", "RUST_LOG": "error"}
        bootstrap = subprocess.run([self.binary, "bootstrap-local", "UTC"], env=env,
                                   capture_output=True, text=True, check=True)
        issued = json.loads(bootstrap.stdout.splitlines()[-1])
        self.token = issued["token"]
        self.token_id = issued["metadata"]["id"]
        self.process = subprocess.Popen([self.binary], env=env, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop_backend)
        self.url = f"http://127.0.0.1:{port}"
        self.session = aiohttp.ClientSession()
        self.addAsyncCleanup(self.session.close)
        for _ in range(100):
            try:
                async with self.session.get(self.url + "/health/ready") as response:
                    if response.status == 200:
                        break
            except aiohttp.ClientError:
                pass
            await asyncio.sleep(.05)
        else:
            self.fail("Isolated backend did not become ready")
        config = self.path / "config"
        config.mkdir()
        # Install the exact integration ZIP produced for distribution, not source files.
        package(self.path / "package", "fixture/habit-tracker-ha")
        with ZipFile(self.path / "package/habit_tracker.zip") as archive:
            archive.extractall(config / "custom_components/habit_tracker")
        sys.path.insert(0, str(config))
        self.addCleanup(sys.path.remove, str(config))
        self.hass = HomeAssistant(str(config))
        loader.async_setup(self.hass)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.ha_port = sock.getsockname()[1]
        self.hass_config = {"http": {"server_host": "127.0.0.1", "server_port": self.ha_port},
                            "frontend": {}}
        self.hass.config_entries = ConfigEntries(self.hass, self.hass_config)
        await async_load_base_functionality(self.hass)
        self.hass.auth = await auth_manager_from_config(self.hass, [{"type": "homeassistant"}], [])
        # Only replace DNS/mDNS discovery, not HA or its integration APIs.
        # Every test endpoint is a literal loopback IP; no LAN discovery needed.
        resolver = LoopbackResolver()
        self.addAsyncCleanup(resolver.real_close)
        resolver_patch = patch("homeassistant.helpers.aiohttp_client._async_make_resolver", return_value=resolver)
        resolver_patch.start()
        self.addCleanup(resolver_patch.stop)
        self.assertTrue(await async_setup_component(self.hass, "homeassistant", self.hass_config))
        self.assertTrue(await async_setup_component(self.hass, "frontend", self.hass_config))
        await self.hass.async_start()
        self.addAsyncCleanup(self.hass.async_stop)

    def stop_backend(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)

    async def request(self, method, path, body=None, key=None):
        headers = {"Authorization": f"Bearer {self.token}"}
        if key:
            headers["Idempotency-Key"] = key
        async with self.session.request(method, self.url + path, json=body, headers=headers) as response:
            self.assertLess(response.status, 300, f"{method} {path}: {response.status}")
            return await response.json() if response.status != 204 else None

    async def create_habit(self, name, kind="quantity"):
        return await self.request("POST", "/api/v1/habits", {
            "name": name, "kind": kind, "unit": "milliliters" if kind == "quantity" else "count",
            "target": 500 if kind == "quantity" else 1, "timezone": "UTC", "category": "nutrition" if kind == "quantity" else "mind"})

    async def configure_integration(self, token=None):
        flow = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "user"})
        result = await self.hass.config_entries.flow.async_configure(flow["flow_id"], {
            "url": self.url, "token": token or self.token, "allow_http": True})
        await self.hass.async_block_till_done()
        self.assertEqual(result["result"].state, ConfigEntryState.LOADED)
        return result["result"]

    def form_defaults(self, form):
        return {field.schema: field.default() for field in form["data_schema"].schema}

    async def test_options_onboarding_presets_custom_validation_and_lost_response(self):
        entry = await self.configure_integration()
        from custom_components.habit_tracker.api import HabitApi
        from custom_components.habit_tracker.presets import PRESETS
        flow = await self.hass.config_entries.options.async_init(entry.entry_id)
        self.assertEqual(flow["type"], "menu")
        original = HabitApi.request
        keys = []

        async def lose_first_creation_response(api, method, path, **kwargs):
            result = await original(api, method, path, **kwargs)
            if path == "/api/v1/habits/setup":
                keys.append(kwargs["key"])
                if len(keys) == 1:
                    raise aiohttp.ClientConnectionError("isolated lost response")
            return result

        with patch.object(HabitApi, "request", new=lose_first_creation_response):
            for preset in PRESETS:
                chosen = await self.hass.config_entries.options.async_configure(flow["flow_id"], {"next_step_id": "preset"})
                form = await self.hass.config_entries.options.async_configure(chosen["flow_id"], {"preset": preset})
                values = self.form_defaults(form)
                if preset == "water":
                    values.update(name="My water", target=1500, timezone="Europe/Paris")
                result = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
                self.assertEqual((result["type"], result["step_id"]), ("menu", "created"))
        self.assertEqual(len(keys), 8)
        self.assertEqual(keys[0], keys[1])
        self.assertEqual(len(entry.runtime_data.habits()), 7)
        water = next(item for item in entry.runtime_data.habits().values() if item["habit"]["name"] == "My water")
        self.assertEqual(water["habit"]["timezone"], "Europe/Paris")
        self.assertEqual(water["target"], 1500)
        self.assertEqual(water["presentation"]["step"], 250)
        self.assertEqual(water["presentation"]["illustration"], "water")
        form = await self.hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "custom"})
        values = self.form_defaults(form)
        values.update(name="Walk", kind="frequency", category="sport", target=3, period="weekly")
        result = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
        self.assertEqual(result["step_id"], "created")
        form = await self.hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "custom"})
        values = self.form_defaults(form)
        values.update(name="Invalid duration", kind="duration", unit="count")
        invalid = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
        self.assertEqual(invalid["errors"], {"base": "invalid_habit"})
        self.assertEqual(len(entry.runtime_data.habits()), 8)
        values.update(name="Rest routine", kind="boolean")
        result = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
        finished = await self.hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": "finish"})
        self.assertEqual(finished["type"], "create_entry")
        await self.wait_until(lambda: len(self.hass.states.async_all("switch")) == 3)
        self.assertEqual(len(entry.runtime_data.habits()), 9)
        self.assertEqual((await self.request("GET", "/api/v1/gamification"))["xp"], 0)

    async def test_onboarding_requires_write_scope_and_reconfigure_preserves_account(self):
        limited = await self.request("POST", "/api/v1/tokens", {
            "scopes": ["habits:read", "statistics:read", "entries:write"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(), "service_account_id": None})
        entry = await self.configure_integration(limited["token"])
        flow = await self.hass.config_entries.options.async_init(entry.entry_id)
        form = await self.hass.config_entries.options.async_configure(flow["flow_id"], {"next_step_id": "custom"})
        values = self.form_defaults(form)
        values["name"] = "New routine"
        denied = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
        self.assertEqual(denied["errors"], {"base": "write_forbidden"})
        self.assertEqual(entry.runtime_data.habits(), {})
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        reconfigure = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "reconfigure", "entry_id": entry.entry_id})
        updated = await self.hass.config_entries.flow.async_configure(reconfigure["flow_id"], {"token": self.token})
        self.assertEqual(updated["reason"], "reconfigure_successful")
        await self.hass.async_block_till_done()
        result = await self.hass.config_entries.options.async_configure(form["flow_id"], values)
        self.assertEqual(result["step_id"], "created")
        self.assertEqual(len(entry.runtime_data.habits()), 1)

    async def wait_until(self, predicate):
        for _ in range(100):
            if predicate():
                return
            await asyncio.sleep(.1)
        self.fail("HA state did not update from backend")

    async def test_config_entities_actions_push_dynamic_discovery_reauth_and_unload(self):
        water = await self.create_habit("Water")
        read = await self.create_habit("Reading", "boolean")
        await self.request("PUT", f"/api/v1/habits/{water['id']}/presentation",
                           {"step": 250, "illustration": "water", "icon": "mdi:water", "color": "#75b7ad"})
        result = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "user"})
        self.assertEqual(result["type"], "form")
        result = await self.hass.config_entries.flow.async_configure(result["flow_id"], {
            "url": self.url, "token": self.token, "allow_http": True})
        self.assertEqual(result["type"], "create_entry")
        await self.hass.async_block_till_done()
        entry = result["result"]
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        self.entry = entry
        await self.assert_bundled_card()
        dashboards = [s for s in self.hass.states.async_all("sensor") if "groups" in s.attributes]
        self.assertEqual(len(dashboards), 1)
        dashboard_id = dashboards[0].entity_id
        switches = self.hass.states.async_all("switch")
        buttons = self.hass.states.async_all("button")
        self.assertEqual(len(switches), 1)
        self.assertEqual(len(buttons), 2)
        self.assertNotIn(self.token, json.dumps([dict(s.attributes) for s in self.hass.states.async_all()]))
        await self.hass.services.async_call("switch", "turn_on", {"entity_id": switches[0].entity_id}, blocking=True)
        await self.wait_until(lambda: self.hass.states.get(switches[0].entity_id).state == "on")
        await self.hass.services.async_call("habit_tracker", "perform_action", {
            "entity_id": dashboard_id, "habit_id": water["id"], "action": "increment"}, blocking=True)
        await self.wait_until(lambda: entry.runtime_data.habits()[water["id"]]["progress"] == 250)
        await self.hass.services.async_call("habit_tracker", "perform_action", {
            "entity_id": dashboard_id, "habit_id": water["id"], "action": "decrement"}, blocking=True)
        await self.wait_until(lambda: entry.runtime_data.habits()[water["id"]]["progress"] == 0)
        # An external CLI action arrives through SSE, without a manual refresh.
        await self.request("POST", f"/api/v1/habits/{water['id']}/actions", {"action": "increment"}, "external-change")
        await self.wait_until(lambda: entry.runtime_data.habits()[water["id"]]["progress"] == 250)
        await self.create_habit("Meditation", "boolean")
        await self.wait_until(lambda: len(self.hass.states.async_all("switch")) == 2)
        replacement = await self.request("POST", "/api/v1/tokens", {
            "scopes": ["habits:read", "statistics:read", "entries:write"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "service_account_id": None})
        await self.request("DELETE", f"/api/v1/tokens/{self.token_id}")
        await self.wait_until(lambda: bool(self.hass.config_entries.flow.async_progress_by_handler("habit_tracker")))
        self.assertFalse(entry.runtime_data.last_update_success)
        old_task = entry.runtime_data.stream_task
        flow = self.hass.config_entries.flow.async_progress_by_handler("habit_tracker")[0]
        result = await self.hass.config_entries.flow.async_configure(flow["flow_id"], {"token": replacement["token"]})
        self.assertEqual(result["type"], "abort")
        self.assertEqual(result["reason"], "reauth_successful")
        await self.hass.async_block_till_done()
        self.assertTrue(old_task.done())
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        await self.assert_bundled_card()
        task = entry.runtime_data.stream_task
        self.assertTrue(await self.hass.config_entries.async_unload(entry.entry_id))
        self.assertTrue(task.done())

    async def assert_bundled_card(self):
        # Read the same authenticated WebSocket resource list as the HA frontend.
        viewer = await self.hass.auth.async_create_system_user("Isolated card test")
        refresh = await self.hass.auth.async_create_refresh_token(viewer)
        access = self.hass.auth.async_create_access_token(refresh)
        async with self.session.ws_connect(f"http://127.0.0.1:{self.ha_port}/api/websocket") as websocket:
            self.assertEqual((await websocket.receive_json())["type"], "auth_required")
            await websocket.send_json({"type": "auth", "access_token": access})
            self.assertEqual((await websocket.receive_json())["type"], "auth_ok")
            await websocket.send_json({"id": 1, "type": "lovelace/resources/list"})
            result = await websocket.receive_json()
            self.assertTrue(result["success"])
        items = [item for item in result["result"] if item["url"].startswith("/habit_tracker/frontend/")]
        self.assertEqual([item["type"] for item in items], ["module"])
        cards = [item["url"] for item in items]
        self.assertEqual(cards, ["/habit_tracker/frontend/0.2.0/habit-tracker-card.js"])
        self.assertFalse(any(url.startswith("/habit_tracker/frontend/")
                             for url in self.hass.data[DATA_EXTRA_MODULE_URL].urls))
        # Only a static, credential-free module is publicly served; no directory exposure.
        async with self.session.get(f"http://127.0.0.1:{self.ha_port}" + cards[0]) as response:
            self.assertEqual(response.status, 200)
            card = await response.text()
            self.assertIn('customElements.define("habit-tracker-card"', card)
            self.assertNotIn(self.token, card)
            self.assertEqual(card, (CLIENT_ROOT / "custom_components/habit_tracker/www/habit-tracker-card.js").read_text())
        async with self.session.get(f"http://127.0.0.1:{self.ha_port}/habit_tracker/frontend/0.2.0/manifest.json") as response:
            self.assertEqual(response.status, 404)

    async def test_card_resource_upgrades_without_touching_other_resources(self):
        resources = self.hass.data[LOVELACE_DATA].resources
        foreign = await resources.async_create_item({"url": "/local/another-card.js", "res_type": "module"})
        previous = await resources.async_create_item({"url": "/habit_tracker/frontend/0.1.1/habit-tracker-card.js", "res_type": "js"})
        duplicate = await resources.async_create_item({"url": "/habit_tracker/frontend/0.1.1/habit-tracker-card.js?manual=1", "res_type": "module"})
        flow = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "user"})
        result = await self.hass.config_entries.flow.async_configure(flow["flow_id"], {
            "url": self.url, "token": self.token, "allow_http": True})
        await self.hass.async_block_till_done()
        self.assertEqual(result["result"].state, ConfigEntryState.LOADED)
        await self.assert_bundled_card()
        items = {item["id"]: item for item in resources.async_items()}
        self.assertEqual(len(items), 2)
        self.assertEqual(items[foreign["id"]], foreign)
        self.assertEqual(items[previous["id"]]["url"], "/habit_tracker/frontend/0.2.0/habit-tracker-card.js")
        self.assertEqual(items[previous["id"]]["type"], "module")
        self.assertNotIn(duplicate["id"], items)
        self.assertTrue(await self.hass.config_entries.async_reload(result["result"].entry_id))
        self.assertEqual(resources.async_items(), list(items.values()))

    async def test_yaml_resources_remain_operator_managed_and_card_is_still_served(self):
        lovelace = self.hass.data[LOVELACE_DATA]
        declared = [{"url": "/local/another-card.js", "type": "module"}]
        resources = ResourceYAMLCollection(declared.copy())
        lovelace.resource_mode = "yaml"
        lovelace.resources = resources
        with self.assertLogs("custom_components.habit_tracker", level="WARNING") as logs:
            flow = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "user"})
            result = await self.hass.config_entries.flow.async_configure(flow["flow_id"], {
                "url": self.url, "token": self.token, "allow_http": True})
            await self.hass.async_block_till_done()
        self.assertEqual(result["result"].state, ConfigEntryState.LOADED)
        self.assertIs(lovelace.resources, resources)
        self.assertEqual(resources.async_items(), declared)
        self.assertTrue(any("/habit_tracker/frontend/0.2.0/habit-tracker-card.js" in line for line in logs.output))
        self.assertFalse(any(url.startswith("/habit_tracker/frontend/")
                             for url in self.hass.data[DATA_EXTRA_MODULE_URL].urls))
        async with self.session.get(f"http://127.0.0.1:{self.ha_port}/habit_tracker/frontend/0.2.0/habit-tracker-card.js") as response:
            self.assertEqual(response.status, 200)

    async def test_transport_retry_reuses_key_and_redirect_never_receives_token(self):
        from aiohttp import web
        from custom_components.habit_tracker.api import HabitApi, ApiError
        keys = []
        side_effects = set()
        leaked = []

        async def action(request):
            key = request.headers["Idempotency-Key"]
            keys.append(key)
            side_effects.add(key)
            if len(keys) == 1:
                request.transport.close()
                return web.Response()
            return web.json_response({"id": "fixture-receipt"})

        async def redirect(request):
            raise web.HTTPFound("/credentials-must-not-arrive")

        async def destination(request):
            leaked.append(request.headers.get("Authorization"))
            return web.json_response({})

        app = web.Application()
        app.router.add_post("/api/v1/habits/fixture/actions", action)
        app.router.add_get("/api/v1/dashboard", redirect)
        app.router.add_get("/credentials-must-not-arrive", destination)
        runner = web.AppRunner(app)
        await runner.setup()
        self.addAsyncCleanup(runner.cleanup)
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        api = HabitApi(self.session, f"http://127.0.0.1:{port}", "fixture-token")
        await api.action("fixture", "increment")
        self.assertEqual(len(keys), 2)
        self.assertEqual(keys[0], keys[1])
        self.assertEqual(len(side_effects), 1)
        with self.assertRaises(ApiError):
            await api.dashboard()
        self.assertFalse(leaked)

    async def test_config_rejects_invalid_token_and_unapproved_http(self):
        result = await self.hass.config_entries.flow.async_init("habit_tracker", context={"source": "user"})
        result = await self.hass.config_entries.flow.async_configure(result["flow_id"], {
            "url": self.url, "token": "invalid", "allow_http": False})
        self.assertEqual(result["errors"]["base"], "invalid_url")
        result = await self.hass.config_entries.flow.async_configure(result["flow_id"], {
            "url": self.url, "token": "invalid", "allow_http": True})
        self.assertEqual(result["errors"]["base"], "invalid_auth")


if __name__ == "__main__":
    unittest.main()
