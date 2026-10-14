(() => {
  const storage = globalThis.browser?.storage || globalThis.chrome?.storage;
  if (!storage?.local) return;

  const storageKey = "gifjettisonSettings";
  const defaults = {
    normal: { enabled: true, mode: "remove" },
    ytgc: { enabled: true, mode: "remove" },
    giftube: { enabled: true, mode: "remove" }
  };

  function normalize(value) {
    const settings = {};
    for (const [category, fallback] of Object.entries(defaults)) {
      const saved = value?.[category] || {};
      const modes = category === "normal"
        ? ["alt", "remove"]
        : category === "ytgc"
          ? ["alt", "text", "remove"]
          : ["text", "remove"];
      settings[category] = {
        enabled: saved.enabled !== false,
        mode: modes.includes(saved.mode) ? saved.mode : fallback.mode
      };
    }
    return settings;
  }

  async function broadcast() {
    try {
      const stored = await storage.local.get(storageKey);
      const settings = normalize(stored?.[storageKey]);
      window.postMessage({ channel: "gifjettison-settings", settings }, "*");
    } catch (_) {}
  }

  broadcast();
  storage.onChanged?.addListener((changes, areaName) => {
    if (areaName === "local" && changes[storageKey]) broadcast();
  });
})();
