"""Config flow for the NSPanel Lovelace layout editor."""

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN


class NSPanelLovelaceConfigFlow(ConfigFlow, domain=DOMAIN):
    """Only asks for confirmation, there is nothing to configure."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="NSPanel Lovelace", data={})
        return self.async_show_form(step_id="user")
