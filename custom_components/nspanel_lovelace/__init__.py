"""Edit the layout of NSPanels running esphome-nspanel-lovelace-native."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.storage import Store

from .const import (
    APPLY_TIMEOUT,
    DOMAIN,
    ESPHOME_DOMAIN,
    LAYOUT_MAX_SIZE,
    PANEL_ELEMENT,
    PANEL_FILENAME,
    PANEL_URL_PATH,
    LOCK_ACTIONS,
    REPORT_STATUS_SUFFIX,
    SET_LAYOUT_SUFFIX,
    PIN_REMOVED,
    SET_PIN_HASH_SUFFIX,
    SHARED_SETTINGS,
    STATIC_URL,
    STATUS_EVENT,
)
from .layout import clean_shared, fnv1_hash, pin_hash, icons_path, layout_from_yaml, layout_to_yaml, load_icons, to_device_json


class EditorData:
    """Layouts per panel, and the last status each panel reported."""

    def __init__(self, hass: HomeAssistant, icons: dict[str, str]) -> None:
        self.hass = hass
        self.icons = icons
        self.store: Store[dict[str, Any]] = Store(hass, 1, DOMAIN)
        self.layouts: dict[str, dict[str, Any]] = {}
        self.statuses: dict[str, dict[str, Any]] = {}
        # One PIN for every panel. Only its hash is kept, None until one is set here
        self.pin_hash: str | None = None
        # Values for every panel that doesn't override them
        self.shared: dict[str, Any] = {}
        # The PIN window's defaults, and the panels that keep their own value for any of them
        self.shared_settings: dict[str, str] = {}
        self.setting_overrides: dict[str, list[str]] = {}
        # Panels with saved changes that Apply hasn't sent yet
        self.unapplied: list[str] = []
        self.waiters: dict[str, list[asyncio.Future[dict[str, Any]]]] = {}

    async def async_load(self) -> None:
        stored = await self.store.async_load()
        self.layouts = (stored or {}).get("layouts", {})
        self.pin_hash = (stored or {}).get("pin_hash")
        self.shared = (stored or {}).get("shared", {})
        self.shared_settings = (stored or {}).get("shared_settings", {})
        self.setting_overrides = (stored or {}).get("setting_overrides", {})
        self.unapplied = (stored or {}).get("unapplied", [])

    async def async_save(self) -> None:
        await self.store.async_save(
            {
                "layouts": self.layouts,
                "pin_hash": self.pin_hash,
                "shared": self.shared,
                "shared_settings": self.shared_settings,
                "setting_overrides": self.setting_overrides,
                "unapplied": self.unapplied,
            }
        )

    @callback
    def on_status(self, event: Event) -> None:
        device = event.data.get("device")
        if not device:
            return
        self.statuses[device] = dict(event.data)
        # New panels get the PIN here, and so do ones that were offline when it changed.
        # The panel ignores a hash it already has.
        self.hass.async_create_task(self.async_send_pin(device.replace("-", "_")))
        self.hass.async_create_task(self.async_sync_settings(device))
        for future in self.waiters.get(device, []):
            if not future.done():
                future.set_result(dict(event.data))

    async def async_send_pin(self, slug: str) -> bool:
        """Give a panel the shared PIN. False if it can't take it right now."""
        name = f"{slug}{SET_PIN_HASH_SUFFIX}"
        if self.pin_hash is None or not self.hass.services.has_service(ESPHOME_DOMAIN, name):
            return False
        try:
            await self.hass.services.async_call(ESPHOME_DOMAIN, name, {"hash": self.pin_hash}, blocking=True)
        except HomeAssistantError:
            return False
        return True

    async def async_sync_settings(self, device: str) -> None:
        """Bring a panel in line with the shared settings it doesn't override."""
        status = self.statuses.get(device) or {}
        slug = device.replace("-", "_")
        for key, value in self.shared_settings.items():
            if key in self.setting_overrides.get(device, []) or status.get(key) == value:
                continue
            service, field, _ = SHARED_SETTINGS[key]
            name = f"{slug}_{service}"
            if not self.hass.services.has_service(ESPHOME_DOMAIN, name):
                continue
            try:
                await self.hass.services.async_call(ESPHOME_DOMAIN, name, {field: value}, blocking=True)
            except HomeAssistantError:
                continue

    def device_slugs(self) -> list[str]:
        services = self.hass.services.async_services_for_domain(ESPHOME_DOMAIN)
        return sorted(
            name[: -len(SET_LAYOUT_SUFFIX)]
            for name in services
            if name.endswith(SET_LAYOUT_SUFFIX)
        )

    def panel_info(self, slug: str) -> dict[str, Any]:
        device = slug.replace("_", "-")
        status = self.statuses.get(device)
        name = device
        if status and status.get("device_id"):
            entry = dr.async_get(self.hass).async_get(status["device_id"])
            if entry:
                name = entry.name_by_user or entry.name or device
        layout = self.layouts.get(device)
        in_sync = None
        if layout is not None and status is not None:
            try:
                in_sync = fnv1_hash(to_device_json(layout, self.icons, self.shared)) == status.get("hash")
            except ValueError:
                in_sync = False
        return {
            "device": device,
            "name": name,
            "status": status,
            "has_layout": layout is not None,
            "in_sync": in_sync,
            "unapplied": device in self.unapplied and not in_sync,
            "setting_overrides": self.setting_overrides.get(device, []),
            "shared_settings": self.shared_settings,
            "shared_pin": self.pin_hash not in (None, PIN_REMOVED),
        }

    async def async_send(self, device: str, payload: str) -> dict[str, Any]:
        """Send a layout, then wait for the panel to confirm or reject it."""
        expected = fnv1_hash(payload) if payload else "00000000"
        expected_source = "stored" if payload else "config"
        loop = self.hass.loop
        waiters = self.waiters.setdefault(device, [])

        async def wait() -> dict[str, Any]:
            while True:
                future: asyncio.Future[dict[str, Any]] = loop.create_future()
                waiters.append(future)
                try:
                    status = await future
                finally:
                    waiters.remove(future)
                if status.get("error"):
                    return status
                if status.get("source") == expected_source and status.get("hash") == expected:
                    return status

        task = asyncio.ensure_future(wait())
        await asyncio.sleep(0)
        await self.hass.services.async_call(
            ESPHOME_DOMAIN,
            f"{device.replace('-', '_')}{SET_LAYOUT_SUFFIX}",
            {"layout": payload},
            blocking=True,
        )
        try:
            return await asyncio.wait_for(task, APPLY_TIMEOUT)
        except TimeoutError:
            return {"error": "The panel did not confirm the layout. Check that it is online."}


def _data(hass: HomeAssistant) -> EditorData:
    return hass.data[DOMAIN]


@callback
def _apply_relay_entities(hass: HomeAssistant, layout: dict[str, Any], status: dict[str, Any]) -> str | None:
    """Enable the relay and button entities the layout asks for, and disable the others."""
    wanted_relays = layout.get("relays", {})
    wanted_buttons = layout.get("buttons", {})
    relays = json.loads(status.get("relays") or "[]")
    if not relays:
        if wanted_relays or any(button.get("expose") for button in wanted_buttons.values()):
            return "The layout was applied, but this panel's firmware can't change how its relays appear."
        return None

    registry = er.async_get(hass)
    entries = er.async_entries_for_device(registry, status.get("device_id"), include_disabled_entities=True)

    def set_enabled(domain: str, name: str | None, enabled: bool) -> None:
        for entry in entries:
            if entry.domain != domain or entry.original_name != name:
                continue
            if enabled and entry.disabled_by is not None:
                registry.async_update_entity(entry.entity_id, disabled_by=None)
            elif not enabled and entry.disabled_by is None:
                registry.async_update_entity(entry.entity_id, disabled_by=er.RegistryEntryDisabler.USER)

    for side, relay in zip(("left", "right"), relays):
        if side in wanted_relays:
            set_enabled("light", relay.get("light"), wanted_relays[side] == "light")
            set_enabled("switch", relay.get("switch"), wanted_relays[side] == "switch")
        set_enabled("binary_sensor", relay.get("button"), bool(wanted_buttons.get(side, {}).get("expose")))
    return None


@websocket_api.websocket_command({vol.Required("type"): "nspanel_lovelace/panels"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_panels(hass, connection, msg) -> None:
    data = _data(hass)
    slugs = data.device_slugs()
    for slug in slugs:
        try:
            await hass.services.async_call(
                ESPHOME_DOMAIN, f"{slug}{REPORT_STATUS_SUFFIX}", {}, blocking=False
            )
        except Exception:  # noqa: BLE001 - a panel that is offline only lacks a fresh status
            pass
    # Fresh statuses arrive as events, the editor asks again shortly after
    connection.send_result(msg["id"], [data.panel_info(slug) for slug in slugs])


@websocket_api.websocket_command(
    {vol.Required("type"): "nspanel_lovelace/get", vol.Required("device"): str}
)
@websocket_api.require_admin
@callback
def ws_get(hass, connection, msg) -> None:
    connection.send_result(msg["id"], _data(hass).layouts.get(msg["device"]))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/save",
        vol.Required("device"): str,
        vol.Required("layout"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass, connection, msg) -> None:
    data = _data(hass)
    try:
        payload = to_device_json(msg["layout"], data.icons, data.shared)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_layout", str(err))
        return
    size = len(payload.encode("utf-8"))
    if size > LAYOUT_MAX_SIZE:
        connection.send_error(
            msg["id"], "invalid_layout", f"The layout is too large ({size} of {LAYOUT_MAX_SIZE} bytes)"
        )
        return

    data.layouts[msg["device"]] = msg["layout"]
    if msg["device"] not in data.unapplied:
        data.unapplied.append(msg["device"])
    await data.async_save()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): "nspanel_lovelace/apply"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_apply(hass, connection, msg) -> None:
    """Send the saved changes, one panel at a time because each one reboots and reconnects."""
    data = _data(hass)
    result: dict[str, Any] = {"updated": [], "failed": [], "warnings": []}
    online = data.device_slugs()
    for device in list(data.unapplied):
        layout = data.layouts.get(device)
        payload = to_device_json(layout, data.icons, data.shared) if layout else None
        if payload is None or data.statuses.get(device, {}).get("hash") == fnv1_hash(payload):
            data.unapplied.remove(device)
        elif device.replace("-", "_") not in online:
            result["failed"].append({"device": device, "error": "offline"})
        else:
            status = await data.async_send(device, payload)
            if status.get("error"):
                result["failed"].append({"device": device, "error": status["error"]})
                continue
            data.unapplied.remove(device)
            result["updated"].append(device)
            warning = _apply_relay_entities(hass, layout, status)
            if warning:
                result["warnings"].append(f"{device}: {warning}")
    await data.async_save()
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "nspanel_lovelace/get_shared"})
@websocket_api.require_admin
@callback
def ws_get_shared(hass, connection, msg) -> None:
    connection.send_result(msg["id"], _data(hass).shared)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/save_shared",
        vol.Required("shared"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_shared(hass, connection, msg) -> None:
    """Save the values for all panels. Apply sends them to each panel they change."""
    data = _data(hass)
    shared = clean_shared(msg["shared"])
    changed = []
    try:
        for device, layout in data.layouts.items():
            payload = to_device_json(layout, data.icons, shared)
            size = len(payload.encode("utf-8"))
            if size > LAYOUT_MAX_SIZE:
                raise ValueError(f"{device}: the layout is too large ({size} of {LAYOUT_MAX_SIZE} bytes)")
            if payload != to_device_json(layout, data.icons, data.shared):
                changed.append(device)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_layout", str(err))
        return

    data.shared = shared
    data.unapplied.extend(device for device in changed if device not in data.unapplied)
    await data.async_save()
    connection.send_result(msg["id"], {"changed": len(changed)})


@websocket_api.websocket_command(
    {vol.Required("type"): "nspanel_lovelace/reset", vol.Required("device"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_reset(hass, connection, msg) -> None:
    status = await _data(hass).async_send(msg["device"], "")
    if status.get("error"):
        connection.send_error(msg["id"], "rejected", status["error"])
        return
    connection.send_result(msg["id"], {"status": status})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/lock",
        vol.Required("device"): str,
        vol.Required("action"): vol.In(LOCK_ACTIONS),
        vol.Optional("locked", default=False): bool,
        vol.Optional("access", default="open"): vol.In(("open", "pin", "hidden")),
        vol.Optional("display", default="keypad"): vol.In(("keypad", "screensaver")),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_lock(hass, connection, msg) -> None:
    service, data = LOCK_ACTIONS[msg["action"]]
    name = f"{msg['device'].replace('-', '_')}_{service}"
    if not hass.services.has_service(ESPHOME_DOMAIN, name):
        connection.send_error(msg["id"], "not_supported", "This panel's firmware has no settings page.")
        return
    payload = {key: msg[key] for key in data}
    await hass.services.async_call(ESPHOME_DOMAIN, name, payload, blocking=True)
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/set_shared_setting",
        vol.Required("key"): vol.In(SHARED_SETTINGS),
        vol.Required("value"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_shared_setting(hass, connection, msg) -> None:
    """Set a default for every panel. An empty value leaves it to each panel."""
    data = _data(hass)
    if msg["value"] and msg["value"] not in SHARED_SETTINGS[msg["key"]][2]:
        connection.send_error(msg["id"], "invalid_value", "Unknown value")
        return
    if msg["value"]:
        data.shared_settings[msg["key"]] = msg["value"]
    else:
        data.shared_settings.pop(msg["key"], None)
    await data.async_save()
    await asyncio.gather(*(data.async_sync_settings(slug.replace("_", "-")) for slug in data.device_slugs()))
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/set_setting_override",
        vol.Required("device"): str,
        vol.Required("key"): vol.In(SHARED_SETTINGS),
        vol.Required("override"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_setting_override(hass, connection, msg) -> None:
    data = _data(hass)
    overrides = [key for key in data.setting_overrides.get(msg["device"], []) if key != msg["key"]]
    if msg["override"]:
        overrides.append(msg["key"])
    data.setting_overrides[msg["device"]] = overrides
    await data.async_save()
    await data.async_sync_settings(msg["device"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "nspanel_lovelace/set_shared_pin",
        vol.Required("pin"): vol.All(str, vol.Match(r"^(\d{4,8})?$")),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_shared_pin(hass, connection, msg) -> None:
    """Set or remove the PIN on every panel. The others get it when they next connect."""
    data = _data(hass)
    data.pin_hash = pin_hash(msg["pin"])
    await data.async_save()
    slugs = data.device_slugs()
    results = await asyncio.gather(*(data.async_send_pin(slug) for slug in slugs))
    connection.send_result(msg["id"], {"updated": sum(results), "total": len(slugs)})


@websocket_api.websocket_command(
    {vol.Required("type"): "nspanel_lovelace/import_yaml", vol.Required("yaml"): str}
)
@websocket_api.require_admin
@callback
def ws_import_yaml(hass, connection, msg) -> None:
    try:
        connection.send_result(msg["id"], layout_from_yaml(msg["yaml"]))
    except Exception as err:  # noqa: BLE001 - shown to the person importing
        connection.send_error(msg["id"], "invalid_yaml", str(err))


@websocket_api.websocket_command(
    {vol.Required("type"): "nspanel_lovelace/export_yaml", vol.Required("layout"): dict}
)
@websocket_api.require_admin
@callback
def ws_export_yaml(hass, connection, msg) -> None:
    connection.send_result(msg["id"], layout_to_yaml(msg["layout"]))


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    base = os.path.dirname(__file__)
    icons = await hass.async_add_executor_job(load_icons, icons_path(base))
    data = EditorData(hass, icons)
    await data.async_load()
    hass.data[DOMAIN] = data
    entry.async_on_unload(hass.bus.async_listen(STATUS_EVENT, data.on_status))

    for command in (ws_panels, ws_get, ws_save, ws_apply, ws_get_shared, ws_save_shared, ws_set_shared_setting, ws_set_setting_override, ws_reset, ws_lock, ws_set_shared_pin, ws_import_yaml, ws_export_yaml):
        websocket_api.async_register_command(hass, command)

    frontend_dir = os.path.join(base, "frontend")
    version = await hass.async_add_executor_job(
        os.path.getmtime, os.path.join(frontend_dir, PANEL_FILENAME)
    )
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, frontend_dir, cache_headers=True)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{STATIC_URL}/{PANEL_FILENAME}?v={int(version)}",
        sidebar_title="NSPanel",
        sidebar_icon="mdi:tablet-dashboard",
        require_admin=True,
        config={"icons_url": f"{STATIC_URL}/icons.json?v={int(version)}"},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    hass.data.pop(DOMAIN, None)
    return True
