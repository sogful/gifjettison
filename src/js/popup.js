(() => {
  const api = globalThis.browser || globalThis.chrome;
  const storagekey = "gifjettisonSettings";
  const defaults = {
    normal: { enabled: true, mode: "remove" },
    ytgc: { enabled: true, mode: "remove" },
    giftube: { enabled: true, mode: "remove" }
  };
  const groups = {
    normal: { toggle: ".normaltoggle", modes: ".normalmodes" },
    ytgc: { toggle: ".ytgctoggle", modes: ".ytgcmodes" },
    giftube: { toggle: ".giftubetoggle", modes: ".giftubemodes" }
  };
  const form = document.querySelector(".settingsform");

  async function applytheme() {
    const fallback = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    let theme = fallback;
    try {
      const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id !== undefined) {
        const response = await api.tabs.sendMessage(tab.id, { type: "gifjettisontheme" });
        if (response?.theme === "dark" || response?.theme === "light") theme = response.theme;
      }
    } catch (_) {}
    document.documentElement.classList.toggle("darktheme", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }

  function normalize(value) {
    const result = {};
    for (const [category, fallback] of Object.entries(defaults)) {
      const saved = value?.[category] || {};
      const modes = category === "normal"
        ? ["alt", "remove"]
        : category === "ytgc"
          ? ["alt", "text", "remove"]
          : ["text", "remove"];
      result[category] = {
        enabled: saved.enabled !== false,
        mode: modes.includes(saved.mode) ? saved.mode : fallback.mode
      };
    }
    return result;
  }

  function render(value) {
    const settings = normalize(value);
    for (const [category, option] of Object.entries(settings)) {
      const group = groups[category];
      const checkbox = document.querySelector(group.toggle);
      const fieldset = document.querySelector(group.modes);
      checkbox.checked = option.enabled;
      fieldset.disabled = !option.enabled;
      const radio = fieldset.querySelector('input[type="radio"][value="' + option.mode + '"]');
      if (radio) radio.checked = true;
    }
  }

  function readform() {
    const value = {};
    for (const [category, group] of Object.entries(groups)) {
      const fieldset = document.querySelector(group.modes);
      value[category] = {
        enabled: document.querySelector(group.toggle).checked,
        mode: fieldset.querySelector('input[type="radio"]:checked')?.value || defaults[category].mode
      };
    }
    return value;
  }

  async function save() {
    try {
      await api.storage.local.set({ [storagekey]: readform() });
    } catch (error) {
      console.error("GifJettison could not save settings.", error);
    }
  }

  function setloading(loading) {
    form.setAttribute("aria-busy", String(loading));
    form.querySelectorAll("input").forEach(input => {
      input.disabled = loading;
    });
    if (!loading) {
      for (const [category, group] of Object.entries(groups)) {
        const enabled = document.querySelector(group.toggle).checked;
        document.querySelector(group.modes).disabled = !enabled;
      }
    }
  }

  async function init() {
    void applytheme();
    setloading(true);
    try {
      const stored = await api.storage.local.get(storagekey);
      render(stored?.[storagekey]);
    } catch (error) {
      console.error("GifJettison could not load settings.", error);
      render(defaults);
    }
    setloading(false);
    form.addEventListener("change", save);
    api.storage.onChanged?.addListener((changes, areaname) => {
      if (areaname === "local" && changes[storagekey]) render(changes[storagekey].newValue);
    });
  }

  init();
})();
