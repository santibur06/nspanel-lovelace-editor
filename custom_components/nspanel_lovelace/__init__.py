"""Edit the layout of NSPanels running esphome-nspanel-lovelace-native."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.storage import Store

from .const import (
    APPLY_TIMEOUT,
    DOMAIN,
    ESPHOME_DOMAIN,
    LAYOUT_MAX_SIZE,
    PANEL_ELEMENT,
    PANEL_FILENAME,
    PANEL_URL_PATH,
    REPORT_STATUS_SUFFIX,
    SET_LAYOUT_SUFFIX,
    STATIC_URL,
    STATUS_EVENT,
)
from .layout import fnv1_hash, icons_path, layout_from_yaml, layout_to_yaml, load_icons, to_device_json


class EditorData:
    """Layouts per panel, and the last status each panel reported."""

    def __init__(self, hass: HomeAssistant, icons: dict[str, str]) -> None:
        self.hass = hass
        self.icons = icons
        self.store: Store[dict[str, Any]] = Store(hass, 1, DOMAIN)
        self.layouts: dict[str, dict[str, Any]] = {}
        self.statuses: dict[str, dict[str, Any]] = {}
        self.waiters: dict[str, list[asyncio.Future[dict[str, Any]]]] = {}

    async def async_load(self) -> None:
        stored = await self.store.async_load()
        self.layouts = (stored or {}).get("layouts", {})

    async def async_save(self) -> None:
        await self.store.async_save({"layouts": self.layouts})

    @callback
    def on_status(self, event: Event) -> None:
        device = event.data.get("device")
        if not device:
            return
        self.statuses[device] = dict(event.data)
        for future in self.waiters.get(device, []):
            if not future.done():
                future.set_result(dict(event.data))

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
                in_sync = fnv1_hash(to_device_json(layout, self.icons)) == status.get("hash")
            except ValueError:
                in_sync = False
        return {
            "device": device,
            "name": name,
            "status": status,
            "has_layout": layout is not None,
            "in_sync": in_sync,
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
        vol.Optional("apply", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass, connection, msg) -> None:
    data = _data(hass)
    try:
        payload = to_device_json(msg["layout"], data.icons)
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
    await data.async_save()
    if not msg["apply"]:
        connection.send_result(msg["id"], {"applied": False})
        return

    status = await data.async_send(msg["device"], payload)
    if status.get("error"):
        connection.send_error(msg["id"], "rejected", status["error"])
        return
    connection.send_result(msg["id"], {"applied": True, "status": status})


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

    for command in (ws_panels, ws_get, ws_save, ws_reset, ws_import_yaml, ws_export_yaml):
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
