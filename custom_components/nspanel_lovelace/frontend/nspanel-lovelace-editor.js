// Layout editor for NSPanels running esphome-nspanel-lovelace-native.
// No build step and no dependencies other than <ha-icon> from the HA frontend.

const MAX_RESULTS = 30;
const CARD_TYPES = {
  cardGrid: "Grid (6 buttons)",
  cardGrid2: "Grid (8 buttons)",
  cardEntities: "List of rows",
  cardThermo: "Thermostat",
  cardMedia: "Media player",
  cardAlarm: "Alarm",
  cardQR: "QR code",
};
const CARD_ENTITY_KEY = { cardThermo: "thermo_entity_id", cardAlarm: "alarm_entity_id", cardMedia: "media_entity_id" };
const CARD_ENTITY_DOMAIN = { cardThermo: "climate.", cardAlarm: "alarm_control_panel.", cardMedia: "media_player." };
const ALARM_MODES = ["arm_home", "arm_away", "arm_night", "arm_vacation", "arm_custom_bypass"];
const ALL_PANELS = "__all__";
const LEAVE_QUESTION = "This panel has unsaved changes. Leave and lose them?";
const ACCESS_LABELS = { open: "Show, no PIN", pin: "Show, require the PIN", hidden: "Hide" };
const LOCK_DISPLAY_LABELS = { keypad: "Always show the keypad", screensaver: "Show the screensaver, a tap asks for the PIN" };
const SHARED_TOP_KEYS = ["sleep_timeout", "brightness"];
const SHARED_SCREENSAVER_KEYS = ["date_format", "time_format", "weather", "double_tap_to_unlock", "extra_entity"];
const DEFAULT_ICON = { light: "lightbulb", switch: "toggle-switch", cover: "window-shutter", fan: "fan", climate: "thermostat", sensor: "gauge", binary_sensor: "checkbox-marked-circle", scene: "palette", script: "script-text", lock: "lock", media_player: "speaker", navigate: "arrow-right-bold-circle" };

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));

function maxEntities(type, model) {
  if (type === "cardEntities") return model === "eu" || model === "us-l" ? 4 : 6;
  return { cardGrid: 6, cardGrid2: 8, cardQR: 2, cardMedia: 8 }[type] ?? 0;
}

const STYLES = `
:host { display:block; height:100%; background:var(--primary-background-color); color:var(--primary-text-color); font-family:var(--paper-font-body1_-_font-family, Roboto, sans-serif); font-size:14px; }
* { box-sizing:border-box; }
.bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:56px; padding:8px 16px; background:var(--app-header-background-color, var(--primary-color)); color:var(--app-header-text-color, #fff); }
.bar h1 { font-size:20px; font-weight:400; margin:0 8px 0 0; }
.bar select { max-width:220px; }
.spacer { flex:1; }
button { font:inherit; padding:7px 12px; border-radius:6px; border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
button:hover { filter:brightness(1.08); }
button:disabled { opacity:.5; cursor:default; }
.badge { display:inline-block; min-width:16px; margin-left:6px; padding:0 4px; box-sizing:border-box; border-radius:8px; background:var(--primary-color); color:var(--text-primary-color, #fff); font-size:11px; line-height:16px; text-align:center; }
.form-actions { display:flex; justify-content:flex-end; margin-top:20px; }
button.primary { background:var(--primary-color); border-color:var(--primary-color); color:var(--text-primary-color, #fff); }
.bar button.primary { background:var(--text-primary-color, #fff); border-color:var(--text-primary-color, #fff); color:var(--primary-color); font-weight:500; }
button.icon { padding:3px 7px; line-height:1; background:transparent; border-color:transparent; }
button.danger { color:var(--error-color); }
input, select, textarea { font:inherit; padding:7px 8px; border-radius:6px; border:1px solid var(--divider-color); background:var(--card-background-color); color:var(--primary-text-color); width:100%; }
input[type=checkbox] { width:auto; }
label.field { display:block; margin:0 0 10px; }
label.field > span { display:block; font-size:12px; color:var(--secondary-text-color); margin-bottom:3px; }
label.check { display:inline-flex; align-items:center; gap:6px; margin:0 12px 10px 0; }
.main { display:grid; grid-template-columns:260px 340px minmax(320px,1fr); gap:16px; padding:16px; align-items:start; }
@media (max-width:1000px) { .main { grid-template-columns:1fr; } .preview-col { order:-1; } }
.box { background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:10px; padding:12px; }
.box h2 { font-size:14px; font-weight:500; margin:0 0 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.pages .pages-head { margin-top:14px; }
.pages .page { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; cursor:pointer; }
.pages .page:hover { background:var(--secondary-background-color); }
.pages .page.sel { background:var(--primary-color); color:var(--text-primary-color,#fff); }
.pages .page .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pages .page button { color:inherit; }
.pages .tag { font-size:11px; opacity:.7; }
.pages .dragging, .item.dragging { opacity:.4; }
.note { color:var(--secondary-text-color); font-size:12px; margin:8px 0 0; }
.msg { padding:8px 12px; margin:12px 16px 0; border-radius:6px; background:var(--secondary-background-color); }
.msg.error { background:var(--error-color); color:#fff; }
.msg.ok { background:var(--success-color, #2e7d32); color:#fff; }
.item { border:1px solid var(--divider-color); border-radius:8px; padding:8px; margin-bottom:8px; background:var(--primary-background-color); }
.item-head { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
.item-head select { flex:1; }
.item-head .grip { cursor:grab; color:var(--secondary-text-color); }
.two { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.picker { position:relative; }
.picker .row { display:flex; align-items:center; gap:6px; }
.results { position:absolute; z-index:10; left:0; right:0; top:100%; max-height:240px; overflow:auto; background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,.3); }
.results div { display:flex; align-items:center; gap:6px; padding:6px 8px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.results div:hover { background:var(--secondary-background-color); }
.results small { color:var(--secondary-text-color); margin-left:auto; }
.preview-col { position:sticky; top:8px; }
#pages { position:sticky; top:8px; z-index:5; max-height:calc(100vh - 16px); overflow:auto; box-sizing:border-box; }
@media (max-width:1000px) { #pages { top:0; max-height:40vh; } }
@media (max-width:1000px) { .preview-col { position:static; } }
.screen { width:320px; height:480px; margin:0 auto; background:#000; color:#fff; border:8px solid #222; border-radius:10px; box-sizing:content-box; overflow:hidden; position:relative; user-select:none; }
.screen ha-icon { --mdc-icon-size:48px; color:#4a7dff; }
.s-head { display:flex; align-items:center; justify-content:space-between; height:56px; padding:0 14px; }
.s-head .t { font-size:18px; }
.s-head ha-icon { --mdc-icon-size:30px; color:#fff; }
.s-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:6px 14px; }
.s-grid.g8 { grid-template-rows:repeat(4,88px); }
.s-grid.g6 { grid-template-rows:repeat(3,120px); }
.s-cell { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; font-size:13px; cursor:default; overflow:hidden; }
.s-cell.nav, .s-row.nav, .s-head ha-icon[data-action] { cursor:pointer; }
.s-rows { padding:4px 12px; }
.s-row { display:flex; align-items:center; gap:10px; height:64px; font-size:14px; }
.s-row ha-icon { --mdc-icon-size:30px; }
.s-row .n { flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.s-row .v { color:#bbb; font-size:13px; }
.s-time { text-align:center; font-size:76px; margin-top:24px; }
.s-date { text-align:center; font-size:17px; margin:18px 0 8px; }
.s-line { height:2px; margin:0 40px; background:#4a7dff; }
.s-main { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; justify-items:center; text-align:center; margin-top:14px; font-size:22px; }
.s-fc { display:grid; grid-template-columns:repeat(4,1fr); position:absolute; left:6px; right:6px; bottom:10px; justify-items:center; font-size:12px; text-align:center; }
.s-fc ha-icon { --mdc-icon-size:24px; display:block; margin:3px 0; }
.s-center { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; height:calc(100% - 56px); padding:12px; text-align:center; color:#bbb; }
.modal { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:16px; }
.modal .box { width:min(640px,100%); }
.modal textarea { height:50vh; font-family:monospace; font-size:12px; white-space:pre; }
.modal .actions { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
`;

class NSPanelLovelaceEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._panels = [];
    this._device = null;
    this._shared = {};
    this._previewTrail = [];
    this._layout = null;
    this._saved = null;
    this._sel = "screensaver";
    this._msg = null;
    this._busy = false;
    this._modal = null;
    this._icons = null;
    this._iconsLoading = null;
    this._dragIndex = null;
    this._previewQueued = false;
  }

  // Deliberately doesn't render: this is called on every state change in the home.
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init();
  }
  set narrow(value) {
    this._narrow = value;
    const button = this.shadowRoot.querySelector("ha-menu-button");
    if (button) button.narrow = value;
  }
  set panel(panel) { this._panelConfig = panel?.config || {}; }

  async _init() {
    this._attachEvents();
    this._render();
    await this._loadPanels();
    // Panels answer the status request through events, so ask again shortly after
    setTimeout(() => this._refreshPanels(), 1200);
  }

  _ws(type, data = {}) { return this._hass.callWS({ type: `nspanel_lovelace/${type}`, ...data }); }

  connectedCallback() {
    window.addEventListener("beforeunload", this._warnBeforeUnload);
    // Home Assistant's own links change the page without unloading it
    window.addEventListener("click", this._warnBeforeLink, true);
  }

  disconnectedCallback() {
    window.removeEventListener("beforeunload", this._warnBeforeUnload);
    window.removeEventListener("click", this._warnBeforeLink, true);
  }

  _warnBeforeUnload = (ev) => {
    if (!this._dirty) return;
    ev.preventDefault();
    ev.returnValue = "";
  };

  _warnBeforeLink = (ev) => {
    if (!this._dirty) return;
    const link = ev.composedPath().find((el) => typeof el.href === "string" && el.href);
    if (!link || new URL(link.href, location.href).pathname === location.pathname) return;
    if (confirm(LEAVE_QUESTION)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };

  async _loadPanels() {
    try {
      this._panels = await this._ws("panels");
      if (!this._device && this._panels.length) await this._selectDevice(this._panels[0].device);
      else this._render();
    } catch (err) {
      this._setMsg("error", err.message);
    }
  }

  async _refreshPanels() {
    try {
      this._panels = await this._ws("panels");
      this._renderBar();
    } catch (_) { /* keeps what it has */ }
  }

  async _selectDevice(device) {
    this._device = device;
    this._previewTrail = [];
    this._screensaverKept = null;
    this._shared = await this._ws("get_shared");
    if (this._allPanels) {
      this._layout = { ...clone(this._shared), screensaver: { ...this._shared.screensaver }, cards: [] };
      this._saved = JSON.stringify(this._layout);
      this._sel = "screensaver";
      this._render();
      return;
    }
    const stored = await this._ws("get", { device });
    this._layout = stored || { sleep_timeout: 10, screensaver: { date_format: "%A, %-d %b %Y", time_format: "%H:%M" }, cards: [{ id: "page_1", type: "cardGrid", title: "Home", entities: [] }] };
    this._saved = JSON.stringify(this._layout);
    this._sel = "screensaver";
    this._render();
  }

  get _allPanels() { return this._device === ALL_PANELS; }
  get _info() { return this._panels.find((p) => p.device === this._device); }
  get _model() { return this._info?.status?.model || "us-p"; }
  get _dirty() { return this._layout && JSON.stringify(this._layout) !== this._saved; }
  get _card() { return typeof this._sel === "number" ? this._layout.cards[this._sel] : null; }

  _setMsg(kind, text) {
    this._msg = text ? { kind, text } : null;
    this._renderMsg();
  }

  _changed({ structure = false } = {}) {
    if (structure) this._renderBody();
    else this._queuePreview();
    this._renderBar();
  }

  _queuePreview() {
    if (this._previewQueued) return;
    this._previewQueued = true;
    requestAnimationFrame(() => { this._previewQueued = false; this._renderPreview(); });
  }

  /* ---------- rendering ---------- */

  _render() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div id="bar" class="bar"></div><div id="msg"></div><div id="body"></div><div id="modal"></div>`;
    this._renderBar();
    this._renderMsg();
    this._renderBody();
    this._renderModal();
  }

  _renderBar() {
    const bar = this.shadowRoot.getElementById("bar");
    if (!bar) return;
    const info = this._info;
    const pending = this._panels.filter((p) => p.unapplied).length;
    const save = this.shadowRoot.getElementById("form-save");
    if (save) save.textContent = this._dirty ? "Save changes" : "Save";
    let status = "";
    if (info?.status?.error) status = `Panel error: ${info.status.error}`;
    else if (this._dirty) status = "Unsaved changes";
    else if (info?.unapplied) status = "Saved, not applied yet";
    else if (info?.in_sync) status = "Panel is up to date";
    else if (info?.status?.source === "config") status = "Panel uses the pages in its YAML";
    else if (info?.has_layout && info?.in_sync === false) status = "Saved, not on the panel yet";
    bar.innerHTML = `${this._narrow ? '<ha-menu-button></ha-menu-button>' : ""}<h1>NSPanel</h1>
      <select data-action="device" aria-label="Panel"><option value="${ALL_PANELS}" ${this._allPanels ? "selected" : ""}>All panels</option>${this._panels.map((p) => `<option value="${esc(p.device)}" ${p.device === this._device ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <span>${esc(status)}</span><span class="spacer"></span>
      <button data-action="pin-open" ${this._panels.length ? "" : "disabled"}>Panels PIN</button>
      ${this._allPanels ? "" : `<button data-action="import">Import YAML</button>
      <button data-action="export" ${this._layout ? "" : "disabled"}>Export YAML</button>
      <button data-action="reset" ${this._device ? "" : "disabled"}>Use YAML pages</button>`}
      <button class="primary" data-action="apply" ${pending && !this._busy ? "" : "disabled"}>${this._busy ? "Applying…" : "Apply"}${pending && !this._busy ? `<span class="badge" title="NSPanels with saved changes to apply">${pending}</span>` : ""}</button>`;
    const menu = bar.querySelector("ha-menu-button");
    if (menu) { menu.hass = this._hass; menu.narrow = this._narrow; }
  }

  _renderMsg() {
    const el = this.shadowRoot.getElementById("msg");
    if (el) el.innerHTML = this._msg ? `<div class="msg ${esc(this._msg.kind)}">${esc(this._msg.text)}</div>` : "";
  }

  _renderBody() {
    const body = this.shadowRoot.getElementById("body");
    if (!body) return;
    if (!this._device) {
      body.innerHTML = `<div class="main" style="display:block"><div class="box">No panels found. Add <code>runtime_layout: true</code> to a panel's <code>nspanel_lovelace:</code> configuration and flash it once.</div></div>`;
      return;
    }
    body.innerHTML = `<div class="main">
      <div class="box pages" id="pages"></div>
      <div class="preview-col"><div class="screen" id="screen"></div><p class="note">Preview is approximate. The panel draws its own fonts and icons.</p></div>
      <div class="box" id="form"></div>
    </div>`;
    this._renderPages();
    this._renderForm();
    this._renderPreview();
  }

  // Sub-pages are shown under the page that opens them
  _pageTree() {
    const cards = this._layout.cards;
    const byId = new Map(cards.map((c, i) => [c.id, i]));
    const children = new Map();
    const hasParent = new Set();
    cards.forEach((card, index) => {
      for (const e of card.entities || []) {
        if (!e.entity_id?.startsWith("navigate.")) continue;
        const target = byId.get(e.entity_id.slice(9));
        if (target === undefined || hasParent.has(target) || target === index || !cards[target].hidden) continue;
        hasParent.add(target);
        if (!children.has(index)) children.set(index, []);
        children.get(index).push(target);
      }
    });
    const out = [];
    const visit = (index, depth) => {
      out.push({ index, depth });
      for (const child of children.get(index) || []) visit(child, depth + 1);
    };
    cards.forEach((card, index) => { if (!card.hidden) visit(index, 0); });
    cards.forEach((card, index) => { if (card.hidden && !hasParent.has(index) && !out.some((o) => o.index === index)) visit(index, 0); });
    return out;
  }

  _renderPages() {
    const el = this.shadowRoot.getElementById("pages");
    if (!el) return;
    if (this._allPanels) {
      el.innerHTML = '<h2>All panels</h2><p class="note">Values set here replace each panel\'s own, unless that panel overrides them. Leave one empty and each panel keeps its own.</p>';
      return;
    }
    const rows = this._pageTree().map(({ index, depth }) => {
      const card = this._layout.cards[index];
      const top = !card.hidden;
      return `<div class="page ${this._sel === index ? "sel" : ""}" data-action="select" data-index="${index}" style="margin-left:${depth * 14}px" ${top ? `draggable="true" data-drag-page="${index}"` : ""}>
        <span class="name">${esc(card.title || card.id || "Untitled")}</span>
        ${card.hidden && depth === 0 ? '<span class="tag">not linked</span>' : ""}
        <span class="tag">${esc((card.entities || []).length || "")}</span>
        ${top ? `<button class="icon" data-action="page-up" data-index="${index}" title="Move up" aria-label="Move up">↑</button>` : ""}
      </div>`;
    }).join("");
    el.innerHTML = `<div class="page ${this._sel === "hardware" ? "sel" : ""}" data-action="select" data-index="hardware"><span class="name">Buttons and relays</span></div>
      <h2 class="pages-head">Pages <button data-action="add-page">Add page</button></h2>
      <div class="page ${this._sel === "screensaver" ? "sel" : ""}" data-action="select" data-index="screensaver"><span class="name">Screensaver</span></div>
      <div class="page ${this._sel === "settings" ? "sel" : ""}" data-action="select" data-index="settings"><span class="name">Settings page</span></div>${rows}
      <p class="note">Pages with arrows swipe in order. Sub-pages open from a button on another page.</p>`;
  }

  _renderPreview() {
    const el = this.shadowRoot.getElementById("screen");
    if (!el) return;
    if (this._sel === "settings") el.innerHTML = this._previewSettings();
    else if (typeof this._sel !== "number") el.innerHTML = this._previewScreensaver();
    else el.innerHTML = this._previewCard(this._card);
  }

  _stateOf(id) { return this._hass?.states?.[id]; }
  _nameOf(item) {
    if (item.name) return item.name;
    if (item.entity_id?.startsWith("navigate.")) return this._layout.cards.find((c) => c.id === item.entity_id.slice(9))?.title || "";
    return this._stateOf(item.entity_id)?.attributes?.friendly_name || item.entity_id || "";
  }
  _iconOf(item) {
    const name = item.icon || DEFAULT_ICON[(item.entity_id || "").split(".")[0]] || "help-circle-outline";
    return `<ha-icon icon="mdi:${esc(name)}"></ha-icon>`;
  }

  _previewScreensaver() {
    const s = this._merged().screensaver;
    if (!s) return `<div class="s-center">Screensaver off. The first page stays on.</div>`;
    const value = (item) => {
      const st = this._stateOf(item.entity_id);
      if (!st || st.state === "unavailable" || st.state === "unknown") return "--";
      const n = parseFloat(st.state);
      return (isNaN(n) || String(n) !== String(+st.state) ? st.state : n.toFixed(1)) + (st.attributes.unit_of_measurement || "");
    };
    const slots = [s.main_entity, s.extra_entity].filter((i) => i?.entity_id);
    const main = slots.map((i) => `<div>${this._iconOf(i)}<div>${esc(value(i))}</div></div>`).join("");
    const days = ["Dom", "Lun", "Mar", "Mié"];
    // The screen firmware hides the first forecast slot when the second entity is used
    const hasExtra = !!s.extra_entity?.entity_id;
    const fc = s.weather?.entity_id
      ? days.map((d, i) => (hasExtra && i === 0 ? "<div></div>" : `<div><div>${d}</div><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><div>--°</div></div>`)).join("")
      : "";
    return `<div class="s-time">12:34</div><div class="s-date">Domingo, 1 Nov 2026</div><div class="s-line"></div>
      <div class="s-main">${main}</div><div class="s-fc">${fc}</div>`;
  }

  _previewSettings() {
    const status = this._info?.status;
    const row = (icon, name, value) => `<div class="s-row"><ha-icon icon="mdi:${icon}"></ha-icon><span class="n">${name}</span><span class="v">${value}</span></div>`;
    return `<div class="s-head"><ha-icon icon="mdi:home" data-action="preview-home"></ha-icon><span class="t">Ajustes</span><ha-icon icon="mdi:restart"></ha-icon></div>
      <div class="s-rows">
        ${row("gesture-tap-button", "Bloquear botones", status?.buttons_locked === "1" ? "on" : "off")}
        ${row("brightness-6", "Brillo", "")}
        ${row("brightness-4", "Brillo en reposo", "")}
        ${this._layout.screensaver ? row("monitor-off", "Apagar pantalla", "") : ""}
        ${status?.pin_set === "1" ? row("lock", "Bloquear pantalla", "") : ""}
      </div>`;
  }

  _previewCard(card) {
    const left = card.hidden ? "arrow-up-bold" : "arrow-left-bold";
    const visible = this._layout.cards.filter((c) => !c.hidden);
    const gear = visible.length === 1 && !card.hidden && this._info?.status?.settings_access !== "hidden";
    const showArrows = card.hidden || visible.length > 1;
    const leftAction = card.hidden ? 'data-action="preview-back"' : 'data-action="preview-step" data-step="-1"';
    const head = `<div class="s-head">${showArrows ? `<ha-icon icon="mdi:${left}" ${leftAction}></ha-icon>` : "<span></span>"}
      <span class="t">${esc(card.title || "")}</span>${gear ? '<ha-icon icon="mdi:cog" data-action="preview-settings"></ha-icon>' : showArrows && !card.hidden ? '<ha-icon icon="mdi:arrow-right-bold" data-action="preview-step" data-step="1"></ha-icon>' : "<span></span>"}</div>`;
    const entities = card.entities || [];
    if (card.type === "cardGrid" || card.type === "cardGrid2" || card.type === "cardMedia") {
      const size = card.type === "cardGrid2" ? "g8" : "g6";
      const cells = entities.map((item) => {
        if (item.entity_id === "delete") return "<div></div>";
        const nav = item.entity_id?.startsWith("navigate.");
        return `<div class="s-cell ${nav ? "nav" : ""}" ${nav ? `data-action="open-page" data-id="${esc(item.entity_id.slice(9))}"` : ""}>${this._iconOf(item)}<span>${esc(this._nameOf(item))}</span></div>`;
      }).join("");
      if (card.type === "cardMedia") return `${head}<div class="s-center">${esc(card.media_entity_id || "Pick a media player")}</div>`;
      return `${head}<div class="s-grid ${size}">${cells}</div>`;
    }
    if (card.type === "cardEntities") {
      const rows = entities.map((item) => {
        if (item.entity_id === "delete") return '<div class="s-row"></div>';
        const st = this._stateOf(item.entity_id);
        const domain = (item.entity_id || "").split(".")[0];
        let v = st?.state ?? "";
        if (domain === "cover") v = "▲ ■ ▼";
        else if (domain === "navigate") v = "›";
        const nav = domain === "navigate" ? `data-action="open-page" data-id="${esc(item.entity_id.slice(9))}"` : "";
        return `<div class="s-row ${nav ? "nav" : ""}" ${nav}>${this._iconOf(item)}<span class="n">${esc(this._nameOf(item))}</span><span class="v">${esc(v)}</span></div>`;
      }).join("");
      return `${head}<div class="s-rows">${rows}</div>`;
    }
    if (card.type === "cardThermo") {
      const st = this._stateOf(card.thermo_entity_id);
      const current = st?.attributes?.current_temperature ?? "--";
      const target = st?.attributes?.temperature ?? "--";
      const modes = card.supported_modes?.length ? card.supported_modes : st?.attributes?.hvac_modes || [];
      return `${head}<div class="s-center"><ha-icon icon="mdi:thermostat"></ha-icon><div style="font-size:36px;color:#fff">${esc(target)}°</div><div>Now ${esc(current)}°</div><div>${esc(modes.join(" · "))}</div></div>`;
    }
    if (card.type === "cardAlarm") return `${head}<div class="s-center"><ha-icon icon="mdi:shield-home"></ha-icon><div>${esc(card.alarm_entity_id || "Pick an alarm")}</div></div>`;
    if (card.type === "cardQR") return `${head}<div class="s-center"><ha-icon icon="mdi:qrcode"></ha-icon><div>${esc(card.qr_text || "QR text")}</div></div>`;
    return head;
  }

  _picker(kind, path, value, domains, placeholder) {
    const preview = kind === "icon" && value ? `<ha-icon icon="mdi:${esc(value)}" style="--mdc-icon-size:24px"></ha-icon>` : "";
    return `<div class="picker"><div class="row">${preview}<input data-picker="${kind}" data-path="${esc(path)}" data-domains="${esc(domains || "")}" value="${esc(value || "")}" placeholder="${esc(placeholder || "")}" autocomplete="off" spellcheck="false"></div></div>`;
  }

  _textField(label, path, value, attrs = "") {
    return `<label class="field"><span>${esc(label)}</span><input data-path="${esc(path)}" value="${esc(value ?? "")}" ${attrs}></label>`;
  }

  _showCard(index) {
    if (index < 0) return;
    this._sel = index;
    this._renderPages();
    this._renderForm();
    this._renderPreview();
  }

  _renderForm() {
    const el = this.shadowRoot.getElementById("form");
    if (!el) return;
    if (this._sel === "settings") {
      el.innerHTML = this._formSettings();
      return;
    }
    const form = this._sel === "hardware" ? this._formHardware() : this._sel === "screensaver" ? this._formScreensaver() : this._formCard(this._card);
    el.innerHTML = `${form}<div class="form-actions"><button class="primary" id="form-save" data-action="save">${this._dirty ? "Save changes" : "Save"}</button></div>`;
  }

  _screensaverEntity(title, key, withName) {
    const item = this._layout.screensaver?.[key];
    // The panel only shows these two along with a weather forecast
    const blocked = !withName ? false : !this._merged().screensaver?.weather;
    const head = `<label class="check"><input type="checkbox" data-action="screensaver-option" data-key="${key}" ${item ? "checked" : ""} ${blocked && !item ? "disabled" : ""}> <strong>${esc(title)}</strong></label>`;
    if (!item) return `<div class="item">${head}${blocked ? '<p class="note">Needs the weather forecast.</p>' : ""}</div>`;
    return `<div class="item">${head}${blocked ? '<p class="note">The panel won\'t show this without the weather forecast.</p>' : ""}
      <label class="field"><span>Entity</span>${this._picker("entity", `screensaver.${key}.entity_id`, item.entity_id, "", "Search")}</label>
      <div class="two">${withName ? this._textField("Name", `screensaver.${key}.name`, item.name) : ""}
      <label class="field"><span>Icon</span>${this._picker("icon", `screensaver.${key}.icon`, item.icon, "", "Default")}</label></div></div>`;
  }

  _formBrightness() {
    const b = this._layout.brightness;
    const mode = b?.mode || "manual";
    const option = (value, label) => `<option value="${value}" ${mode === value ? "selected" : ""}>${label}</option>`;
    let html = `<div class="item"><div class="item-head"><strong>Screen brightness</strong></div>
      <label class="field"><span>Set by</span><select data-action="brightness-mode">
        ${option("manual", "The panel's sliders or the screen lights")}${option("schedule", "Time of day")}${option("entity", "A Home Assistant entity")}</select></label>`;
    if (mode === "schedule") {
      html += (b.schedule || []).map((step, n) => `<div class="two">
        ${this._textField("From", `brightness.schedule.${n}.time`, step.time, 'type="time"')}
        ${this._textField("Normal % (5 to 100)", `brightness.schedule.${n}.active`, step.active, 'type="number" min="5" max="100" data-type="int"')}
        ${this._textField("Standby % (0 to 100)", `brightness.schedule.${n}.inactive`, step.inactive, 'type="number" min="0" max="100" data-type="int"')}
        <button class="icon danger" data-action="brightness-remove" data-n="${n}" title="Remove" aria-label="Remove" ${b.schedule.length > 1 ? "" : "disabled"}>✕</button></div>`).join("");
      if ((b.schedule || []).length < 8) html += '<button data-action="brightness-add">Add a time</button>';
    } else if (mode === "entity") {
      html += `<label class="field"><span>Entity with a numeric value</span>${this._picker("entity", "brightness.entity_id", b.entity_id, "", "Search")}</label>
        <div class="two">${this._textField("Value for the lowest brightness", "brightness.from", b.from, 'type="number" step="any" data-type="float"')}
        ${this._textField("Value for the highest brightness", "brightness.to", b.to, 'type="number" step="any" data-type="float"')}</div>
        <div class="two">${this._textField("Standby % at the lowest value (optional)", "brightness.inactive_low", b.inactive_low, 'type="number" min="0" max="100" data-type="int"')}
        ${this._textField("Standby % at the highest value (optional)", "brightness.inactive_high", b.inactive_high, 'type="number" min="0" max="100" data-type="int"')}</div>`;
    }
    html += '<p class="note">Normal is the page you tap to. Standby is what shows after the page timeout: the screensaver, or the clock with double tap on, where one tap brings the screensaver back at the normal brightness.</p>';
    if (mode !== "manual") html += '<p class="note">The rule runs on the panel. The sliders and the screen lights still work until the rule next changes the brightness. Sent with Apply.</p>';
    return `${html}</div>`;
  }

  _formHardwareSide(side, title) {
    const button = this._layout.buttons?.[side] || {};
    const action = button.action || side;
    const relay = this._layout.relays?.[side] || "";
    const option = (current, value, label) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
    return `<div class="item"><div class="item-head"><strong>${esc(title)}</strong></div>
      <label class="field"><span>The button</span><select data-action="button-action" data-side="${side}">
        ${option(action, "left", "Toggles the left relay")}${option(action, "right", "Toggles the right relay")}
        ${option(action, "entity", "Commands a Home Assistant entity")}${option(action, "none", "Does nothing on its own")}</select></label>
      ${action === "entity" ? `<label class="field"><span>Entity</span>${this._picker("entity", `buttons.${side}.entity_id`, button.entity_id, "", "Search")}</label>` : ""}
      <label class="check"><input type="checkbox" data-path="buttons.${side}.expose" ${button.expose ? "checked" : ""}> Show the button in Home Assistant, for automations</label>
      <label class="field"><span>The relay in Home Assistant</span><select data-action="relay-expose" data-side="${side}">
        ${option(relay, "", "Leave as it is")}${option(relay, "light", "Light")}${option(relay, "switch", "Switch")}${option(relay, "hidden", "Hidden")}</select></label></div>`;
  }

  _formHardware() {
    return `<h2>Buttons and relays</h2>
      ${this._formHardwareSide("left", "Left")}${this._formHardwareSide("right", "Right")}
      <p class="note">Entity commands need Home Assistant, so that button does nothing while it is offline. The relay's light and switch are separate entities with their own IDs, so check anything that uses the one you turn off. Hidden disables them in Home Assistant. Applied with Save &amp; apply, and Home Assistant can take about 30 seconds to show a change.</p>`;
  }

  _formScreensaver() {
    const s = this._layout.screensaver;
    const all = this._allPanels;
    let html = all ? "<h2>Screensaver for all panels</h2>" : `<h2>Screensaver</h2><label class="check"><input type="checkbox" data-action="toggle-screensaver" ${s ? "checked" : ""}> Use a screensaver</label>`;
    html += this._sharedField("sleep_timeout", () => this._textField("Seconds until the screensaver (0 to 65)", "sleep_timeout", this._layout.sleep_timeout, 'type="number" min="0" max="65" data-type="int"'), "Seconds until the screensaver");
    html += this._sharedField("brightness", () => this._formBrightness(), "Screen brightness");
    if (!s) return html;
    html += this._sharedField("date_format", () => this._textField("Date format", "screensaver.date_format", s.date_format, 'maxlength="32"'), "Date format");
    html += this._sharedField("time_format", () => this._textField("Time format", "screensaver.time_format", s.time_format, 'maxlength="32"'), "Time format");
    html += this._sharedField("weather", () => `<div class="item"><label class="check"><input type="checkbox" data-action="screensaver-option" data-key="weather" ${s.weather ? "checked" : ""}> <strong>Weather forecast</strong></label>
      ${s.weather ? `<label class="field"><span>Entity</span>${this._picker("entity", "screensaver.weather.entity_id", s.weather.entity_id, "weather.", "Search")}</label>` : ""}</div>`, "Weather forecast");
    html += this._sharedField("double_tap_to_unlock", () => `<label class="check"><input type="checkbox" data-path="screensaver.double_tap_to_unlock" ${s.double_tap_to_unlock ? "checked" : ""}> Double tap to wake</label>`, "Double tap to wake");
    if (!all) html += this._screensaverEntity("Main value", "main_entity", true);
    html += this._sharedField("extra_entity", () => this._screensaverEntity("Second value", "extra_entity", true), "Second value");
    if (!all) {
      html += `${this._screensaverEntity("Top left icon", "status_icon_left", false)}
        ${this._screensaverEntity("Top right icon", "status_icon_right", false)}`;
    }
    html += '<p class="note">The forecast and the second value share space: with a second value, the screen shows three forecast days instead of four.</p>';
    return html;
  }

  /* ---------- values for all panels ---------- */

  _sharedValue(key) {
    return SHARED_TOP_KEYS.includes(key) ? this._shared[key] : this._shared.screensaver?.[key];
  }

  _inherits(key) {
    return !this._allPanels && this._sharedValue(key) !== undefined && !this._layout.overrides?.includes(key);
  }

  // A field that follows All panels shows that value, and one that overrides it says so
  _sharedField(key, field, title) {
    if (this._allPanels || this._sharedValue(key) === undefined) return field();
    if (this._inherits(key)) {
      const value = this._sharedValue(key);
      const text = value === true ? "On" : value.mode ? { schedule: "Time of day", entity: "A Home Assistant entity" }[value.mode] || "The panel's sliders" : value.entity_id || value;
      return `<div class="item"><strong>${esc(title)}</strong>: ${esc(text)}
        <p class="note">From All panels. <button data-action="override" data-key="${key}">Override on this panel</button></p></div>`;
    }
    return `${field()}<p class="note">Overrides All panels. <button data-action="use-shared" data-key="${key}">Use the All panels value</button></p>`;
  }

  // What the panel really shows. The integration does the same before sending a layout.
  _merged() {
    const merged = clone(this._layout);
    if (this._allPanels) return merged;
    for (const key of SHARED_TOP_KEYS) if (this._inherits(key)) merged[key] = clone(this._sharedValue(key));
    if (merged.screensaver) {
      for (const key of SHARED_SCREENSAVER_KEYS) if (this._inherits(key)) merged.screensaver[key] = clone(this._sharedValue(key));
    }
    return merged;
  }

  _formCard(card) {
    const i = this._sel;
    let html = `<h2>${esc(card.title || "Page")}<button class="danger" data-action="delete-page">Delete</button></h2>
      <label class="field"><span>Type</span><select data-action="card-type">${Object.entries(CARD_TYPES).map(([k, v]) => `<option value="${k}" ${k === card.type ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      ${this._textField("Title", `cards.${i}.title`, card.title)}
      <div class="two">${this._textField("Seconds until the screensaver", `cards.${i}.sleep_timeout`, card.sleep_timeout ?? 10, 'type="number" min="0" max="120" data-type="int"')}
      <label class="check" style="align-self:end"><input type="checkbox" data-path="cards.${i}.hidden" data-structure ${card.hidden ? "checked" : ""}> Sub-page</label></div>`;

    const key = CARD_ENTITY_KEY[card.type];
    if (key) html += `<label class="field"><span>Entity</span>${this._picker("entity", `cards.${i}.${key}`, card[key], CARD_ENTITY_DOMAIN[card.type], "Search")}</label>`;

    if (card.type === "cardThermo") {
      const modes = this._stateOf(card.thermo_entity_id)?.attributes?.hvac_modes || [];
      html += `<div class="field"><span class="note">Modes on the screen (none ticked shows all)</span><br>${modes.map((m) => `<label class="check"><input type="checkbox" data-mode="${esc(m)}" ${(card.supported_modes || []).includes(m) ? "checked" : ""}> ${esc(m)}</label>`).join("") || '<span class="note">Pick a thermostat first.</span>'}</div>`;
    }
    if (card.type === "cardAlarm") {
      html += `<div class="field"><span class="note">Arm buttons, up to 4 (none ticked uses the first 4)</span><br>${ALARM_MODES.map((m) => `<label class="check"><input type="checkbox" data-mode="${esc(m)}" ${(card.supported_modes || []).includes(m) ? "checked" : ""}> ${esc(m.replace("arm_", "").replace("_", " "))}</label>`).join("")}</div>`;
    }
    if (card.type === "cardQR") html += this._textField("QR text", `cards.${i}.qr_text`, card.qr_text);

    const max = maxEntities(card.type, this._model);
    if (max > 0) {
      const items = card.entities || [];
      html += `<h2 style="margin-top:12px">Items <span class="note" style="margin:0">${items.length} of ${max}</span></h2>`;
      html += items.map((item, n) => this._formItem(card, item, n)).join("");
      if (items.length < max) html += `<button data-action="add-item">Add item</button> `;
      if (items.length < max && card.type !== "cardQR") html += `<button data-action="add-subpage">Add sub-page</button>`;
    }
    return html;
  }

  _formItem(card, item, n) {
    const i = this._sel;
    const id = item.entity_id || "";
    const kind = id === "delete" ? "delete" : id.startsWith("navigate.") ? "navigate" : id.startsWith("iText.") ? "text" : "entity";
    const others = this._layout.cards.filter((c) => c !== card && c.id);
    let fields = "";
    if (kind === "entity") {
      const cover = id.startsWith("cover.");
      fields = `<label class="field"><span>Entity</span>${this._picker("entity", `cards.${i}.entities.${n}.entity_id`, id, "", "Search")}</label>
        <div class="two">${this._textField("Name", `cards.${i}.entities.${n}.name`, item.name, `placeholder="${esc(this._stateOf(id)?.attributes?.friendly_name || "")}"`)}
        <label class="field"><span>Icon</span>${this._picker("icon", `cards.${i}.entities.${n}.icon`, item.icon, "", "Default")}</label></div>
        ${cover ? `<label class="check"><input type="checkbox" data-path="cards.${i}.entities.${n}.assumed_state" ${item.assumed_state ? "checked" : ""}> Position unknown (always allow up and down)</label>` : ""}`;
    } else if (kind === "navigate") {
      fields = `<label class="field"><span>Opens page</span><select data-path="cards.${i}.entities.${n}.entity_id" data-prefix="navigate." data-structure>${others.map((c) => `<option value="${esc(c.id)}" ${id === `navigate.${c.id}` ? "selected" : ""}>${esc(c.title || c.id)}</option>`).join("")}</select></label>
        <div class="two">${this._textField("Name", `cards.${i}.entities.${n}.name`, item.name)}
        <label class="field"><span>Icon</span>${this._picker("icon", `cards.${i}.entities.${n}.icon`, item.icon, "", "Default")}</label></div>`;
    } else if (kind === "text") {
      fields = `<div class="two">${this._textField("Label", `cards.${i}.entities.${n}.name`, item.name)}${this._textField("Value", `cards.${i}.entities.${n}.entity_id`, id.slice(6), 'data-prefix="iText."')}</div>
        <label class="field"><span>Icon</span>${this._picker("icon", `cards.${i}.entities.${n}.icon`, item.icon, "", "Default")}</label>`;
    }
    return `<div class="item" draggable="true" data-drag-item="${n}">
      <div class="item-head"><span class="grip" aria-hidden="true">⠿</span>
        <select data-action="item-kind" data-n="${n}" aria-label="Item kind">
          <option value="entity" ${kind === "entity" ? "selected" : ""}>Entity</option>
          <option value="navigate" ${kind === "navigate" ? "selected" : ""}>Opens a page</option>
          <option value="text" ${kind === "text" ? "selected" : ""}>Fixed text</option>
          <option value="delete" ${kind === "delete" ? "selected" : ""}>Empty slot</option>
        </select>
        <button class="icon" data-action="item-up" data-n="${n}" title="Move up" aria-label="Move up">↑</button>
        <button class="icon" data-action="item-down" data-n="${n}" title="Move down" aria-label="Move down">↓</button>
        <button class="icon danger" data-action="item-remove" data-n="${n}" title="Remove" aria-label="Remove">✕</button>
      </div>${fields}</div>`;
  }

  _renderModal() {
    const el = this.shadowRoot.getElementById("modal");
    if (!el) return;
    if (!this._modal) { el.innerHTML = ""; return; }
    if (this._modal.kind === "pin") { el.innerHTML = this._modalPin(); return; }
    const importing = this._modal.kind === "import";
    el.innerHTML = `<div class="modal"><div class="box">
      <h2>${importing ? "Import YAML" : "Export YAML"}</h2>
      ${importing ? '<p class="note">Paste the <code>nspanel_lovelace:</code> section of a device file. It replaces the page being edited, nothing is sent until you apply.</p>' : ""}
      <textarea id="yaml" ${importing ? "" : "readonly"}>${esc(this._modal.text || "")}</textarea>
      <div class="actions"><button data-action="modal-close">Close</button>${importing ? '<button class="primary" data-action="modal-import">Import</button>' : ""}</div>
    </div></div>`;
  }

  _modalPin() {
    const panelHasPin = this._panels.some((p) => p.status?.pin_set === "1");
    const shared = this._panels[0]?.shared_settings || {};
    const select = (key, label, options) => `<label class="field"><span>${label}</span><select data-action="shared-setting" data-key="${key}">
      <option value="">Each panel chooses</option>
      ${Object.entries(options).map(([value, text]) => `<option value="${value}" ${shared[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
    return `<div class="modal"><div class="box"><h2>Panels PIN</h2>
      <p class="note">${this._panels[0]?.shared_pin ? "A PIN is set." : "No PIN is set."} Every panel uses the same PIN, including new ones. Only a hash of it is kept. Removing it also unlocks a panel whose PIN was forgotten.</p>
      <label class="field"><span>New PIN (4 to 8 digits)</span><input id="lock-pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8"></label>
      <div class="actions" style="justify-content:flex-start">
        <button data-action="lock-pin-save">Save PIN on all panels</button>
        <button data-action="lock-pin-remove" ${this._panels[0]?.shared_pin || panelHasPin ? "" : "disabled"}>Remove PIN from all panels</button>
      </div>
      <h2>Defaults for all panels</h2>
      <p class="note">These take effect right away. A panel can override them on its Settings page.</p>
      ${select("settings_access", "Settings page on the panel", ACCESS_LABELS)}
      ${select("lock_display", "While the screen is locked", LOCK_DISPLAY_LABELS)}
      <div class="actions"><button data-action="modal-close">Close</button></div></div></div>`;
  }

  // Follows the Panels PIN default unless this panel overrides it
  _settingField(key, title, labels, field) {
    const info = this._info;
    const shared = info.shared_settings?.[key];
    if (!shared) return field();
    if (!info.setting_overrides?.includes(key)) {
      return `<div class="item"><strong>${title}</strong>: ${esc(labels[shared])}
        <p class="note">From Panels PIN. <button data-action="setting-override" data-key="${key}" data-override="1">Override on this panel</button></p></div>`;
    }
    return `${field()}<p class="note">Overrides Panels PIN. <button data-action="setting-override" data-key="${key}">Use the Panels PIN value</button></p>`;
  }

  _formSettings() {
    const status = this._info?.status;
    if (status?.pin_set === undefined) {
      return `<h2>Settings page</h2><p class="note">This panel has not reported its settings. It may be offline or need a firmware update.</p>`;
    }
    const pinSet = status.pin_set === "1";
    const locked = status.locked === "1";
    const access = pinSet ? status.settings_access : status.settings_access === "hidden" ? "hidden" : "open";
    const option = (value, disabled) => `<option value="${value}" ${access === value ? "selected" : ""} ${disabled ? "disabled" : ""}>${ACCESS_LABELS[value]}</option>`;
    return `<h2>Settings page</h2>
      <p class="note">These apply to this panel only and take effect right away.</p>
      ${this._settingField("settings_access", "Settings page on the panel", ACCESS_LABELS, () => `<label class="field"><span>Settings page on the panel</span><select data-action="lock-access">
        ${option("open")}${option("pin", !pinSet)}${option("hidden")}</select></label>`)}
      <label class="check"><input type="checkbox" data-action="lock-buttons" ${status.buttons_locked === "1" ? "checked" : ""}> Lock the physical buttons</label>
      ${this._settingField("lock_display", "While the screen is locked", LOCK_DISPLAY_LABELS, () => `<label class="field"><span>While the screen is locked</span><select data-action="lock-display">
        <option value="keypad" ${status.lock_display !== "screensaver" ? "selected" : ""}>${LOCK_DISPLAY_LABELS.keypad}</option>
        <option value="screensaver" ${status.lock_display === "screensaver" ? "selected" : ""}>${LOCK_DISPLAY_LABELS.screensaver}</option></select></label>`)}
      <div class="actions" style="justify-content:flex-start">
        <button data-action="${locked ? "lock-unlock" : "lock-lock"}" ${pinSet ? "" : "disabled"}>${locked ? "Unlock screen" : "Lock screen"}</button>
      </div>
      <p class="note">${!pinSet ? "Set a PIN under Panels PIN to require it here." : locked ? "The screen is locked." : "The screen is not locked."}</p>`;
  }

  async _settingsChange(call, data) {
    try {
      await this._ws(call, data);
      // The panels answer with status events, which a new request picks up
      await new Promise((resolve) => setTimeout(resolve, 600));
      await this._refreshPanels();
    } catch (err) {
      this._setMsg("error", err.message);
    }
    this._renderModal();
    this._renderForm();
    this._renderPreview();
  }

  async _setSharedPin(pin) {
    try {
      const { updated, total } = await this._ws("set_shared_pin", { pin });
      const verb = pin ? "PIN set" : "PIN removed";
      const rest = updated < total ? ` The other ${total - updated} get it when they next connect.` : "";
      this._setMsg(updated ? "ok" : "info", `${verb} on ${updated} of ${total} panels.${rest}`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await this._refreshPanels();
    } catch (err) {
      this._setMsg("error", err.message);
    }
    this._renderModal();
    this._renderForm();
    this._renderPreview();
  }

  async _lockCommand(action, data = {}) {
    try {
      await this._ws("lock", { device: this._device, action, ...data });
      // The panel answers with a status event, which a new request picks up
      await new Promise((resolve) => setTimeout(resolve, 600));
      await this._refreshPanels();
    } catch (err) {
      this._setMsg("error", err.message);
    }
    this._renderForm();
    this._renderPreview();
  }

  /* ---------- changes ---------- */

  _setPath(path, value) {
    const parts = path.split(".");
    let node = this._layout;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (node[key] === undefined || node[key] === null) node[key] = {};
      node = node[key];
    }
    const last = parts[parts.length - 1];
    if (value === "" || value === undefined || value === false) delete node[last];
    else node[last] = value;
  }

  _newCardId() {
    let n = this._layout.cards.length + 1;
    const ids = new Set(this._layout.cards.map((c) => c.id));
    while (ids.has(`page_${n}`)) n++;
    return `page_${n}`;
  }

  _action(action, el) {
    const cards = this._layout?.cards;
    const card = this._card;
    const n = el.dataset.n !== undefined ? parseInt(el.dataset.n, 10) : null;
    switch (action) {
      case "select":
        this._previewTrail = [];
        this._sel = ["screensaver", "hardware", "settings"].includes(el.dataset.index) ? el.dataset.index : parseInt(el.dataset.index, 10);
        this._renderPages(); this._renderForm(); this._renderPreview();
        break;
      case "open-page": {
        const index = cards.findIndex((c) => c.id === el.dataset.id);
        if (index >= 0) {
          this._previewTrail.push(this._card);
          this._showCard(index);
        }
        break;
      }
      case "preview-back": {
        // Back to the page this one was opened from, or the first page if it was picked from the list
        const from = cards.indexOf(this._previewTrail.pop());
        this._showCard(from >= 0 ? from : cards.findIndex((c) => !c.hidden));
        break;
      }
      case "preview-step": {
        // The panel goes through its settings page between the last page and the first
        const stops = cards.filter((c) => !c.hidden);
        if (this._info?.status?.settings_access !== "hidden") stops.push("settings");
        const target = stops[(stops.indexOf(this._card) + parseInt(el.dataset.step, 10) + stops.length) % stops.length];
        this._previewTrail = [];
        this._showCard(target === "settings" ? target : cards.indexOf(target));
        break;
      }
      case "preview-settings":
        this._previewTrail = [];
        this._showCard("settings");
        break;
      case "preview-home":
        this._showCard(cards.findIndex((c) => !c.hidden));
        break;
      case "page-up": {
        const index = parseInt(el.dataset.index, 10);
        const visible = cards.map((c, i) => (c.hidden ? -1 : i)).filter((i) => i >= 0);
        const pos = visible.indexOf(index);
        if (pos > 0) this._moveCard(index, visible[pos - 1]);
        break;
      }
      case "add-page":
        cards.push({ id: this._newCardId(), type: "cardGrid", title: "New page", entities: [] });
        this._sel = cards.length - 1;
        this._changed({ structure: true });
        break;
      case "delete-page": {
        if (cards.filter((c) => !c.hidden).length === 1 && !card.hidden) { this._setMsg("error", "At least one page must remain visible."); return; }
        const id = card.id;
        cards.splice(this._sel, 1);
        for (const c of cards) if (c.entities) c.entities = c.entities.filter((e) => e.entity_id !== `navigate.${id}`);
        if (this._layout.default_card === id) delete this._layout.default_card;
        this._sel = "screensaver";
        this._changed({ structure: true });
        break;
      }
      case "add-item":
        (card.entities = card.entities || []).push({ entity_id: "" });
        this._changed({ structure: true });
        break;
      case "add-subpage": {
        const id = this._newCardId();
        const title = "New sub-page";
        cards.push({ id, type: "cardGrid", title, hidden: true, entities: [] });
        (card.entities = card.entities || []).push({ entity_id: `navigate.${id}`, name: title });
        this._changed({ structure: true });
        break;
      }
      case "item-remove": card.entities.splice(n, 1); this._changed({ structure: true }); break;
      case "item-up": this._moveItem(n, n - 1); break;
      case "item-down": this._moveItem(n, n + 1); break;
      case "toggle-screensaver":
        if (el.checked) this._layout.screensaver = { date_format: "%A, %-d %b %Y", time_format: "%H:%M" };
        else delete this._layout.screensaver;
        this._changed({ structure: true });
        break;
      case "screensaver-option": {
        // Unticking keeps the values until another panel is opened, in case it was a slip
        const screensaver = this._layout.screensaver;
        const key = el.dataset.key;
        if (el.checked) {
          screensaver[key] = this._screensaverKept?.[key] || { entity_id: "" };
        } else {
          (this._screensaverKept ||= {})[key] = screensaver[key];
          delete screensaver[key];
        }
        this._changed({ structure: true });
        break;
      }
      case "brightness-add":
        this._layout.brightness.schedule.push({ time: "12:00", active: 100, inactive: 30 });
        this._changed({ structure: true });
        break;
      case "brightness-remove":
        this._layout.brightness.schedule.splice(n, 1);
        this._changed({ structure: true });
        break;
      case "pin-open": this._modal = { kind: "pin" }; this._renderModal(); this._refreshPanels().then(() => { if (this._modal?.kind === "pin") this._renderModal(); }); break;
      case "lock-pin-save": {
        const pin = this.shadowRoot.getElementById("lock-pin").value;
        if (!/^\d{4,8}$/.test(pin)) { this._setMsg("error", "The PIN needs 4 to 8 digits."); this._modal = null; this._renderModal(); break; }
        this._setSharedPin(pin);
        break;
      }
      case "lock-pin-remove": this._setSharedPin(""); break;
      case "lock-lock": this._lockCommand("lock"); break;
      case "lock-unlock": this._lockCommand("unlock"); break;
      case "lock-buttons": this._lockCommand("buttons", { locked: el.checked }); break;
      case "import": this._modal = { kind: "import", text: "" }; this._renderModal(); break;
      case "export": this._export(); break;
      case "modal-close": this._modal = null; this._renderModal(); break;
      case "modal-import": this._import(); break;
      case "setting-override": this._settingsChange("set_setting_override", { device: this._device, key: el.dataset.key, override: !!el.dataset.override }); break;
      case "save": this._save(); break;
      case "apply": this._applyAll(); break;
      case "override": {
        const key = el.dataset.key;
        (this._layout.overrides ||= []).push(key);
        const value = clone(this._sharedValue(key));
        if (SHARED_TOP_KEYS.includes(key)) this._layout[key] = value;
        else this._layout.screensaver[key] = value;
        this._changed({ structure: true });
        break;
      }
      case "use-shared": {
        const key = el.dataset.key;
        this._layout.overrides = this._layout.overrides.filter((k) => k !== key);
        if (!this._layout.overrides.length) delete this._layout.overrides;
        if (SHARED_TOP_KEYS.includes(key)) delete this._layout[key];
        else delete this._layout.screensaver[key];
        this._changed({ structure: true });
        break;
      }
      case "reset": this._reset(); break;
    }
  }

  _moveItem(from, to) {
    const items = this._card?.entities;
    if (!items || to < 0 || to >= items.length) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    this._changed({ structure: true });
  }

  _moveCard(from, to) {
    const cards = this._layout.cards;
    if (from === to) return;
    const selected = typeof this._sel === "number" ? cards[this._sel] : null;
    cards.splice(to, 0, cards.splice(from, 1)[0]);
    if (selected) this._sel = cards.indexOf(selected);
    this._changed({ structure: true });
  }

  _change(el) {
    const action = el.dataset.action;
    if (action === "device") {
      if (this._dirty && !confirm(LEAVE_QUESTION)) { el.value = this._device; return; }
      this._setMsg();
      this._selectDevice(el.value);
      return;
    }
    if (action === "brightness-mode") {
      if (el.value === "schedule") this._layout.brightness = { mode: "schedule", schedule: [{ time: "09:00", active: 100, inactive: 30 }, { time: "21:00", active: 100, inactive: 1 }] };
      else if (el.value === "entity") this._layout.brightness = { mode: "entity", entity_id: "", from: 0, to: 100 };
      else delete this._layout.brightness;
      this._changed({ structure: true });
      return;
    }
    if (action === "button-action") {
      const buttons = this._layout.buttons ||= {};
      const button = buttons[el.dataset.side] ||= {};
      delete button.entity_id;
      if (el.value === el.dataset.side) delete button.action;
      else button.action = el.value;
      if (!Object.keys(button).length) delete buttons[el.dataset.side];
      if (!Object.keys(buttons).length) delete this._layout.buttons;
      this._changed({ structure: true });
      return;
    }
    if (action === "relay-expose") {
      const relays = this._layout.relays ||= {};
      if (el.value) relays[el.dataset.side] = el.value;
      else delete relays[el.dataset.side];
      if (!Object.keys(relays).length) delete this._layout.relays;
      this._changed({ structure: true });
      return;
    }
    if (action === "shared-setting") { this._settingsChange("set_shared_setting", { key: el.dataset.key, value: el.value }); return; }
    if (action === "lock-display") { this._lockCommand("lock_display", { display: el.value }); return; }
    if (action === "lock-access") { this._lockCommand("access", { access: el.value }); return; }
    if (action === "card-type") {
      const card = this._card;
      card.type = el.value;
      for (const k of ["thermo_entity_id", "alarm_entity_id", "media_entity_id", "supported_modes", "qr_text"]) delete card[k];
      if (maxEntities(card.type, this._model) === 0) delete card.entities;
      else if (card.entities) card.entities = card.entities.slice(0, maxEntities(card.type, this._model));
      this._changed({ structure: true });
      return;
    }
    if (action === "item-kind") {
      const item = this._card.entities[parseInt(el.dataset.n, 10)];
      const other = this._layout.cards.find((c) => c !== this._card && c.id);
      if (el.value === "delete") item.entity_id = "delete";
      else if (el.value === "navigate") item.entity_id = other ? `navigate.${other.id}` : "delete";
      else if (el.value === "text") item.entity_id = "iText.";
      else item.entity_id = "";
      this._changed({ structure: true });
      return;
    }
    if (el.dataset.mode) {
      const card = this._card;
      const set = new Set(card.supported_modes || []);
      if (el.checked) set.add(el.dataset.mode); else set.delete(el.dataset.mode);
      if (set.size) card.supported_modes = [...set]; else delete card.supported_modes;
      this._changed();
      return;
    }
    if (el.dataset.path) this._applyField(el, true);
  }

  _applyField(el, final) {
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.type === "int") value = value === "" ? "" : parseInt(value, 10);
    if (el.dataset.type === "float") value = value === "" ? "" : parseFloat(value);
    if (el.dataset.prefix !== undefined && el.tagName === "SELECT") value = el.dataset.prefix + value;
    else if (el.dataset.prefix !== undefined) value = el.dataset.prefix + value;
    const allowEmpty = el.dataset.path.endsWith(".entity_id");
    if (allowEmpty && value === "") {
      const parts = el.dataset.path.split(".");
      let node = this._layout;
      for (const key of parts.slice(0, -1)) node = node?.[key];
      if (node) node.entity_id = "";
    } else {
      this._setPath(el.dataset.path, value);
    }
    this._changed({ structure: final && (el.dataset.structure !== undefined || !!el.dataset.picker) });
    if (el.dataset.structure !== undefined) this._renderPages();
  }

  /* ---------- search pickers ---------- */

  async _ensureIcons() {
    if (this._icons) return this._icons;
    if (!this._iconsLoading) {
      this._iconsLoading = fetch(this._panelConfig?.icons_url || "/api/nspanel_lovelace/frontend/icons.json")
        .then((r) => r.json())
        .then((list) => { this._icons = list.map((i) => i.name); return this._icons; });
    }
    return this._iconsLoading;
  }

  _closeResults() {
    this.shadowRoot.querySelectorAll(".results").forEach((r) => r.remove());
  }

  async _openResults(input) {
    const query = input.value.trim().toLowerCase();
    const kind = input.dataset.picker;
    let results = [];
    if (kind === "icon") {
      const icons = await this._ensureIcons();
      for (const name of icons) {
        if (!query || name.includes(query)) results.push({ value: name, label: name, icon: name });
        if (results.length >= MAX_RESULTS) break;
      }
    } else {
      const domains = input.dataset.domains;
      const states = this._hass.states;
      for (const id in states) {
        if (domains && !id.startsWith(domains)) continue;
        const name = states[id].attributes.friendly_name || "";
        if (!query || id.includes(query) || name.toLowerCase().includes(query)) {
          results.push({ value: id, label: name || id, hint: id });
        }
      }
      results.sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
      results = results.slice(0, MAX_RESULTS);
    }
    if (this.shadowRoot.activeElement !== input) return;
    this._closeResults();
    if (!results.length) return;
    const list = document.createElement("div");
    list.className = "results";
    list.innerHTML = results.map((r) => `<div data-value="${esc(r.value)}">${r.icon ? `<ha-icon icon="mdi:${esc(r.icon)}" style="--mdc-icon-size:20px"></ha-icon>` : ""}<span>${esc(r.label)}</span>${r.hint ? `<small>${esc(r.hint)}</small>` : ""}</div>`).join("");
    list.addEventListener("mousedown", (ev) => {
      const row = ev.target.closest("[data-value]");
      if (!row) return;
      ev.preventDefault();
      input.value = row.dataset.value;
      this._closeResults();
      this._applyField(input, true);
    });
    input.closest(".picker").appendChild(list);
  }

  /* ---------- drag and drop ---------- */

  _attachEvents() {
    const root = this.shadowRoot;
    root.addEventListener("click", (ev) => {
      if (!ev.target.closest(".picker")) this._closeResults();
      if (ev.target.tagName === "SELECT") return;
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      if (el.tagName === "BUTTON") ev.stopPropagation();
      this._action(el.dataset.action, el);
    });
    root.addEventListener("change", (ev) => this._change(ev.target));
    root.addEventListener("input", (ev) => {
      const el = ev.target;
      if (el.dataset.picker) this._openResults(el);
      else if (el.dataset.path && el.type !== "checkbox" && el.tagName !== "SELECT") this._applyField(el, false);
    });
    root.addEventListener("focusin", (ev) => { if (ev.target.dataset?.picker) this._openResults(ev.target); });
    root.addEventListener("focusout", (ev) => { if (ev.target.dataset?.picker) this._closeResults(); });
    root.addEventListener("dragstart", (ev) => {
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT") return;
      const el = ev.target.closest?.("[data-drag-item],[data-drag-page]");
      if (!el) return;
      this._drag = el.dataset.dragItem !== undefined
        ? { kind: "item", from: parseInt(el.dataset.dragItem, 10) }
        : { kind: "page", from: parseInt(el.dataset.dragPage, 10) };
      el.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", "");
    });
    root.addEventListener("dragover", (ev) => {
      if (this._drag && ev.target.closest?.(`[data-drag-${this._drag.kind}]`)) ev.preventDefault();
    });
    root.addEventListener("drop", (ev) => {
      if (!this._drag) return;
      const el = ev.target.closest?.(`[data-drag-${this._drag.kind}]`);
      if (!el) return;
      ev.preventDefault();
      if (this._drag.kind === "item") this._moveItem(this._drag.from, parseInt(el.dataset.dragItem, 10));
      else this._moveCard(this._drag.from, parseInt(el.dataset.dragPage, 10));
      this._drag = null;
    });
    root.addEventListener("dragend", () => {
      this._drag = null;
      root.querySelectorAll(".dragging").forEach((e) => e.classList.remove("dragging"));
    });
  }

  /* ---------- server ---------- */

  _problems() {
    const out = [];
    const screensaver = this._layout.screensaver || {};
    for (const [key, title] of [["weather", "Weather forecast"], ["main_entity", "Main value"], ["extra_entity", "Second value"], ["status_icon_left", "Top left icon"], ["status_icon_right", "Top right icon"]]) {
      if (screensaver[key] && !screensaver[key].entity_id && !this._inherits(key)) out.push(`Screensaver: ${title} is ticked but has no entity`);
    }
    this._layout.cards.forEach((card, index) => {
      const label = card.title || `page ${index + 1}`;
      const key = CARD_ENTITY_KEY[card.type];
      if (key && !card[key]) out.push(`${label}: pick an entity`);
      if (["cardGrid", "cardGrid2", "cardEntities", "cardQR"].includes(card.type) && !(card.entities || []).length) out.push(`${label}: add at least one item`);
      (card.entities || []).forEach((item, n) => {
        if (!item.entity_id) out.push(`${label}: item ${n + 1} has no entity`);
        else if (item.entity_id !== "delete" && !item.entity_id.includes(".")) out.push(`${label}: item ${n + 1} has an invalid entity`);
      });
    });
    return out;
  }

  async _save() {
    const problems = this._problems();
    if (problems.length) { this._setMsg("error", problems.join("; ")); return; }
    const layout = clone(this._layout);
    try {
      if (this._allPanels) {
        const { changed } = await this._ws("save_shared", { shared: layout });
        this._shared = await this._ws("get_shared");
        this._setMsg("ok", `Saved. This changes ${changed} ${changed === 1 ? "panel" : "panels"}. Press Apply to send them.`);
      } else {
        await this._ws("save", { device: this._device, layout });
        this._setMsg("ok", "Saved. Press Apply to send it to the panel.");
      }
      this._saved = JSON.stringify(layout);
    } catch (err) {
      this._setMsg("error", err.message);
    }
    await this._refreshPanels();
  }

  async _applyAll() {
    const count = this._panels.filter((p) => p.unapplied).length;
    const unsaved = this._dirty ? " This panel's unsaved changes won't be included." : "";
    if (!confirm(`Send the saved changes to ${count} ${count === 1 ? "panel" : "panels"}? Each one reboots for a few seconds.${unsaved}`)) return;
    this._busy = true;
    this._setMsg("info", "Sending to the panels, one at a time…");
    this._renderBar();
    try {
      const { updated, failed, warnings } = await this._ws("apply");
      const done = `${updated.length} ${updated.length === 1 ? "panel" : "panels"} updated.`;
      const name = (device) => this._panels.find((p) => p.device === device)?.name || device;
      if (failed.length) this._setMsg("error", `${done} Not applied: ${failed.map((f) => `${name(f.device)} (${f.error})`).join(", ")}`);
      else if (warnings.length) this._setMsg("error", `${done} ${warnings.join(" ")}`);
      else this._setMsg("ok", done);
    } catch (err) {
      this._setMsg("error", err.message);
    }
    this._busy = false;
    await this._refreshPanels();
  }

  async _reset() {
    if (!confirm("Remove the layout from this panel and go back to the pages in its YAML? The layout stays saved here.")) return;
    this._busy = true;
    this._setMsg("info", "Removing the layout from the panel…");
    this._renderBar();
    try {
      await this._ws("reset", { device: this._device });
      this._setMsg("ok", "The panel is using the pages in its YAML.");
    } catch (err) {
      this._setMsg("error", err.message);
    }
    this._busy = false;
    await this._refreshPanels();
  }

  async _export() {
    try {
      this._modal = { kind: "export", text: await this._ws("export_yaml", { layout: this._layout }) };
      this._renderModal();
    } catch (err) {
      this._setMsg("error", err.message);
    }
  }

  async _import() {
    const text = this.shadowRoot.getElementById("yaml").value;
    try {
      // YAML has none of these, so importing keeps the current ones
      const kept = {};
      for (const key of ["brightness", "buttons", "relays", "overrides"]) if (this._layout?.[key]) kept[key] = this._layout[key];
      this._layout = await this._ws("import_yaml", { yaml: text });
      Object.assign(this._layout, kept);
      this._sel = "screensaver";
      this._modal = null;
      this._renderModal();
      this._renderBody();
      this._renderBar();
      this._setMsg("info", "Imported. Review it, then press Save.");
    } catch (err) {
      this._setMsg("error", err.message);
    }
  }
}

customElements.define("nspanel-lovelace-editor", NSPanelLovelaceEditor);
