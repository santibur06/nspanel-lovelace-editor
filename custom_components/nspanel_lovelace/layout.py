"""Convert between the stored layout, the device format and ESPHome style YAML."""

from __future__ import annotations

import copy
import json
import os
from typing import Any

import yaml

_ENTITY_KEYS = ("entity_id", "name", "assumed_state", "color")
_CARD_KEYS = (
    "id",
    "type",
    "title",
    "hidden",
    "sleep_timeout",
    "qr_text",
    "thermo_entity_id",
    "alarm_entity_id",
    "media_entity_id",
    "supported_modes",
)
_SCREENSAVER_ENTITY_KEYS = ("main_entity", "extra_entity", "status_icon_left", "status_icon_right")


def load_icons(path: str) -> dict[str, str]:
    """Return a map of icon name to the 4 character glyph value."""
    with open(path, encoding="utf-8") as file:
        return {icon["name"]: icon["hex"].upper() for icon in json.load(file)}


def fnv1_hash(value: str) -> str:
    """Same hash as esphome::fnv1_hash, reported back by the panel."""
    result = 2166136261
    for byte in value.encode("utf-8"):
        result = (result * 16777619) & 0xFFFFFFFF
        result ^= byte
    return f"{result:08x}"


def _is_hex_icon(value: str) -> bool:
    return len(value) == 4 and all(char in "0123456789abcdefABCDEF" for char in value)


def _device_icon(item: dict[str, Any], icons: dict[str, str]) -> None:
    icon = item.get("icon")
    if not icon:
        item.pop("icon", None)
        return
    if icon in icons:
        item["icon"] = icons[icon]
    elif not _is_hex_icon(icon):
        raise ValueError(f"Unknown icon '{icon}'")


def to_device_json(layout: dict[str, Any], icons: dict[str, str]) -> str:
    """Build the document sent to the panel, which only knows glyph values."""
    document = copy.deepcopy(layout)
    screensaver = document.get("screensaver")
    if screensaver:
        for key in _SCREENSAVER_ENTITY_KEYS:
            if key in screensaver:
                if screensaver[key].get("entity_id"):
                    _device_icon(screensaver[key], icons)
                else:
                    del screensaver[key]
    for card in document.get("cards", []):
        for entity in card.get("entities", []):
            _device_icon(entity, icons)
    return json.dumps(document, ensure_ascii=False, separators=(",", ":"))


class _IgnoreTagsLoader(yaml.SafeLoader):
    """ESPHome files use tags like !include and !secret, which don't matter here."""


_IgnoreTagsLoader.add_multi_constructor("!", lambda loader, suffix, node: None)


def _import_icon(source: dict[str, Any], target: dict[str, Any]) -> None:
    icon = source.get("icon")
    if isinstance(icon, dict):
        if "value" in icon:
            target["icon"] = icon["value"]
        if "color" in icon:
            target["color"] = icon["color"]
    elif icon:
        target["icon"] = icon
    if target.get("icon", "").startswith("hex:"):
        target["icon"] = target["icon"][4:]


def layout_from_yaml(text: str) -> dict[str, Any]:
    """Read the screensaver and cards of an `nspanel_lovelace:` configuration."""
    config = yaml.load(text, _IgnoreTagsLoader)  # noqa: S506
    if not isinstance(config, dict):
        raise ValueError("Expected a YAML mapping")
    config = config.get("nspanel_lovelace", config)
    if not isinstance(config.get("cards"), list):
        raise ValueError("No 'cards' list found")

    layout: dict[str, Any] = {}
    for key in ("sleep_timeout", "default_card"):
        if key in config:
            layout[key] = config[key]

    screensaver = config.get("screensaver")
    if isinstance(screensaver, dict):
        result: dict[str, Any] = {}
        for key in ("date_format", "time_format", "double_tap_to_unlock"):
            if key in screensaver:
                result[key] = screensaver[key]
        if isinstance(screensaver.get("weather"), dict):
            result["weather"] = {"entity_id": screensaver["weather"].get("entity_id", "")}
        for key in _SCREENSAVER_ENTITY_KEYS:
            if isinstance(screensaver.get(key), dict):
                item = {
                    k: screensaver[key][k]
                    for k in ("entity_id", "name", "alt_font")
                    if k in screensaver[key]
                }
                _import_icon(screensaver[key], item)
                result[key] = item
        layout["screensaver"] = result

    cards = []
    for source in config["cards"]:
        card = {key: source[key] for key in _CARD_KEYS if key in source}
        if "entities" in source:
            card["entities"] = []
            for entity in source["entities"]:
                item = {key: entity[key] for key in _ENTITY_KEYS if key in entity}
                _import_icon(entity, item)
                card["entities"].append(item)
        cards.append(card)
    layout["cards"] = cards
    return layout


def layout_to_yaml(layout: dict[str, Any]) -> str:
    """Write a layout in the same shape as the ESPHome configuration."""
    return yaml.safe_dump(
        {"nspanel_lovelace": layout}, allow_unicode=True, sort_keys=False, width=100
    )


def icons_path(base: str) -> str:
    return os.path.join(base, "frontend", "icons.json")
