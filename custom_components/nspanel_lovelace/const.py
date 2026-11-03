"""Constants for the NSPanel Lovelace layout editor."""

DOMAIN = "nspanel_lovelace"

ESPHOME_DOMAIN = "esphome"
SET_LAYOUT_SUFFIX = "_set_layout"
REPORT_STATUS_SUFFIX = "_report_layout_status"
# action: (panel service, message fields it takes)
LOCK_ACTIONS = {
    "lock": ("lock_panel", ()),
    "unlock": ("unlock_panel", ()),
    "buttons": ("set_button_lock", ("locked",)),
    "access": ("set_settings_access", ("access",)),
    "lock_display": ("set_lock_display", ("display",)),
}
SET_PIN_HASH_SUFFIX = "_set_lock_pin_hash"
PIN_REMOVED = "00000000"
# Settings kept on the panel that can have a value for all panels: status key -> service, field, values
SHARED_SETTINGS = {
    "settings_access": ("set_settings_access", "access", ("open", "pin", "hidden")),
    "lock_display": ("set_lock_display", "display", ("keypad", "screensaver")),
}
STATUS_EVENT = "esphome.nspanel_lovelace_layout_status"

PANEL_URL_PATH = "nspanel-lovelace"
PANEL_ELEMENT = "nspanel-lovelace-editor"
PANEL_FILENAME = "nspanel-lovelace-editor.js"
STATIC_URL = "/api/nspanel_lovelace/frontend"

# Same limit as LAYOUT_MAX_SIZE in the ESPHome component
LAYOUT_MAX_SIZE = 16384
# Long enough for the panel to reboot and reconnect to Home Assistant
APPLY_TIMEOUT = 45
