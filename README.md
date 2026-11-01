# NSPanel Lovelace Layout Editor

Edit the pages of a Sonoff NSPanel from a sidebar page in Home Assistant, without compiling or flashing firmware.

It works with panels running [esphome-nspanel-lovelace-native](https://github.com/santibur06/esphome-nspanel-lovelace-native). A change takes about 10 seconds to reach the panel, which reboots for a few seconds to apply it.

Support for panels running the [AppDaemon backend](https://github.com/joBr99/nspanel-lovelace-ui) is planned, not available yet.

## What you can do

- Add, remove and reorder pages and sub-pages
- Edit buttons and rows: entity, name, icon, or a link to another page
- Set up the screensaver: date and time format, weather, two values, status icons
- See an approximate preview of each page as you edit
- Import an existing `nspanel_lovelace:` YAML section, or export a layout as YAML

Every layout is checked before it's stored. If a panel rejects one, it keeps its last good layout and the editor shows the reason. Your edits stay in the editor so you can fix them.

## Install

**1. Prepare the panel.** Use the firmware linked above, add this option and flash the panel once:

```yaml
api:
  custom_services: true

nspanel_lovelace:
  runtime_layout: true
```

The device also needs "Allow the device to perform Home Assistant actions" turned on in its ESPHome integration settings, so it can report back to the editor.

**2. Install the integration.** In HACS, add this repository as a custom repository of type Integration, then install it. Or copy `custom_components/nspanel_lovelace` to your Home Assistant configuration folder. Restart Home Assistant.

**3. Add it.** Go to Settings > Devices & services > Add integration and pick NSPanel Lovelace Layout Editor. An **NSPanel** entry appears in the sidebar for admin users.

## Using it

Pick a panel, make your changes and press **Save & Apply**. To start from a panel's current pages, paste its `nspanel_lovelace:` YAML into **Import YAML**.

**Use YAML pages** removes the layout from the panel, which goes back to the pages in its firmware. The layout stays saved in the editor.

## Limits

- Icons come from the Material Design Icons set the firmware ships with.
- The preview is approximate, because the panel draws its own fonts and icons.
- Weather forecasts still need the automation described in the firmware's documentation.

## License

GPLv3, see [LICENSE](LICENSE).
