(() => {
  const api = globalThis.browser || globalThis.chrome;
  const storageKey = "gifjettisonSettings";
  const defaults = {
    normal: { enabled: true, mode: "remove" },
    ytgc: { enabled: true, mode: "remove" },
    giftube: { enabled: true, mode: "remove" }
  };
  const form = document.querySelector("#settings-form");

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
      const checkbox = document.querySelector("#" + category + "-enabled");
      const fieldset = document.querySelector('[data-modes="' + category + '"]');
      checkbox.checked = option.enabled;
      fieldset.disabled = !option.enabled;
      const radio = fieldset.querySelector('input[type="radio"][value="' + option.mode + '"]');
      if (radio) radio.checked = true;
    }
  }

  function readForm() {
    const value = {};
    for (const category of Object.keys(defaults)) {
      const fieldset = document.querySelector('[data-modes="' + category + '"]');
      value[category] = {
        enabled: document.querySelector("#" + category + "-enabled").checked,
        mode: fieldset.querySelector('input[type="radio"]:checked')?.value || defaults[category].mode
      };
    }
    return value;
  }

  async function save() {
    try {
      await api.storage.local.set({ [storageKey]: readForm() });
    } catch (error) {
      console.error("GifJettison could not save settings.", error);
    }
  }

  function setLoading(loading) {
    form.setAttribute("aria-busy", String(loading));
    form.querySelectorAll("input").forEach(input => {
      input.disabled = loading;
    });
    if (!loading) {
      for (const category of Object.keys(defaults)) {
        const enabled = document.querySelector("#" + category + "-enabled").checked;
        document.querySelector('[data-modes="' + category + '"]').disabled = !enabled;
      }
    }
  }

  async function init() {
    setLoading(true);
    try {
      const stored = await api.storage.local.get(storageKey);
      render(stored?.[storageKey]);
    } catch (error) {
      console.error("GifJettison could not load settings.", error);
      render(defaults);
    }
    setLoading(false);
    form.addEventListener("change", save);
    api.storage.onChanged?.addListener((changes, areaName) => {
      if (areaName === "local" && changes[storageKey]) render(changes[storageKey].newValue);
    });
  }

  init();
})();
