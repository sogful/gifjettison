(() => {

  const storage = globalThis.browser?.storage || globalThis.chrome?.storage;
  const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  if (!storage?.local) return;

  const storagekey = "gifjettisonSettings";
  const defaults = {
    normal: {enabled: true, mode: "remove"},
    ytgc: {enabled: true, mode: "remove"},
    giftube: {enabled: true, mode: "remove"}
  };

  /*//////////////////////////////////////////////////////////////////////*/

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

  /*//////////////////////////////////////////////////////////////////////*/

  async function broadcast() {
    try {
      const stored = await storage.local.get(storagekey);
      const settings = normalize(stored?.[storagekey]);
      window.postMessage({ channel: "gifjettisonsettings", settings }, "*");
    } catch (_) {}
  }

  runtime?.onMessage?.addListener?.((message, sender, sendresponse) => {
    if (message?.type !== "gifjettisontheme") return undefined;
    sendresponse({theme: document.documentElement.hasAttribute("dark") ? "dark" : "light"});
    return false;
  });

  broadcast();
  storage.onChanged?.addListener((changes, areaname) => {
    if (areaname === "local" && changes[storagekey]) broadcast();
  });

})();
