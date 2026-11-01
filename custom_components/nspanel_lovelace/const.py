"""Constants for the NSPanel Lovelace layout editor."""

DOMAIN = "nspanel_lovelace"

ESPHOME_DOMAIN = "esphome"
SET_LAYOUT_SUFFIX = "_set_layout"
REPORT_STATUS_SUFFIX = "_report_layout_status"
STATUS_EVENT = "esphome.nspanel_lovelace_layout_status"

PANEL_URL_PATH = "nspanel-lovelace"
PANEL_ELEMENT = "nspanel-lovelace-editor"
PANEL_FILENAME = "nspanel-lovelace-editor.js"
STATIC_URL = "/api/nspanel_lovelace/frontend"

# Same limit as LAYOUT_MAX_SIZE in the ESPHome component
LAYOUT_MAX_SIZE = 16384
# Long enough for the panel to reboot and reconnect to Home Assistant
APPLY_TIMEOUT = 45
