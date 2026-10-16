(() => {

  const storagekey = "gifjettisonSettings";
  const defaults = {
    normal: {enabled: true, mode: "remove"},
    ytgc: {enabled: true, mode: "remove"},
    giftube: {enabled: true, mode: "remove"}
  };
  const icons = {
    normal: "replaceiconnormal",
    ytgc: "replaceiconytgc",
    giftube: "replaceicongiftube"
  };
  let activehost = null;
  let activeshadow = null;

  function normalizesettings(value) {
    const result = {};
    for (const [category, fallback] of Object.entries(defaults)) {
      const saved = value?.[category] || {};
      const modes = category === "normal" ? ["alt", "remove"] : ["text", "remove"];
      result[category] = {
        enabled: saved.enabled !== false,
        mode: modes.includes(saved.mode) ? saved.mode : fallback.mode
      };
    }
    return result;
  }

  function publish(value) {
    const settings = normalizesettings(value);
    window.postMessage({channel: "gifjettisonsettings", settings}, "*");
  }

  async function readsettings() {
    try {
      return normalizesettings(await GM_getValue(storagekey, defaults));
    } catch (error) {
      return normalizesettings(defaults);
    }
  }

  function renderform(shadow, value) {
    const next = normalizesettings(value);
    for (const [category, option] of Object.entries(next)) {
      const section = shadow.querySelector('.category[data-category="' + category + '"]');
      section.querySelector(".enabledinput").checked = option.enabled;
      section.querySelector(".modeoptions").disabled = !option.enabled;
      const radio = section.querySelector('.modeinput[value="' + option.mode + '"]');
      if (radio) radio.checked = true;
    }
  }

  function readform(shadow) {
    const value = {};
    for (const category of Object.keys(defaults)) {
      const section = shadow.querySelector('.category[data-category="' + category + '"]');
      value[category] = {
        enabled: section.querySelector(".enabledinput").checked,
        mode: section.querySelector(".modeinput:checked")?.value || defaults[category].mode
      };
    }
    return normalizesettings(value);
  }

  function createelement(tag, classname, text) {
    const element = document.createElement(tag);
    if (classname) element.className = classname;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createlink(text, url, classname) {
    const link = createelement("a", classname, text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }

  function createparagraph(classname, before, linktext, linkurl, after) {
    const paragraph = createelement("p", classname);
    if (before) paragraph.appendChild(document.createTextNode(before));
    if (linktext) paragraph.appendChild(createlink(linktext, linkurl, classname + "link"));
    if (after) paragraph.appendChild(document.createTextNode(after));
    return paragraph;
  }

  function createmodechoice(category, mode, title, description) {
    const choice = createelement("label", "modechoice");
    const input = createelement("input", "modeinput");
    input.type = "radio";
    input.name = category + "mode";
    input.value = mode;
    choice.append(input, createelement("span", "modetitle", title));
    if (description) choice.appendChild(createelement("span", "modedescription", description));
    return choice;
  }

  function createcategory(info) {
    const section = createelement("section", "category " + info.category + "category");
    section.setAttribute("data-category", info.category);

    const heading = createelement("label", "categoryheading");
    const icon = createelement("img", "categoryicon");
    icon.src = icons[info.category];
    icon.alt = "";
    const title = createelement("span", "categorytitle", info.title);
    const enabledinput = createelement("input", "categorytoggle enabledinput");
    enabledinput.type = "checkbox";
    heading.append(icon, title, enabledinput);

    const description = createparagraph(
      "description",
      info.descriptionbefore,
      info.descriptionlink,
      info.descriptionurl,
      info.descriptionafter
    );
    const fineprint = createparagraph(
      "fineprint",
      info.fineprintbefore,
      info.fineprintlink,
      info.fineprinturl,
      info.fineprintafter
    );
    const modes = createelement("fieldset", "modeoptions");
    for (const option of info.modes) {
      modes.appendChild(createmodechoice(info.category, option.mode, option.title, option.description));
    }

    section.append(heading, description, fineprint, modes);
    return section;
  }

  function closeui(host, controller) {
    controller.abort();
    host.remove();
    if (activehost === host) {
      activehost = null;
      activeshadow = null;
    }
  }

  async function opensettings() {
    const value = await readsettings();
    publish(value);
    if (activehost) activehost.remove();

    const host = document.createElement("div");
    host.className = "settingshost";
    host.style.setProperty("position", "fixed");
    host.style.setProperty("inset", "0");
    host.style.setProperty("z-index", "2147483647");
    const shadow = host.attachShadow({mode: "open"});
    const style = createelement("style");
    style.textContent = replacepopupcss;

    const backdrop = createelement("div", "backdrop");
    const box = createelement("section", "settingsbox popup popupbody");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "GIF comment filtering settings");
    box.tabIndex = -1;

    const main = createelement("main", "popupmain");
    const form = createelement("form", "settingsform");
    form.append(
      createcategory({
        category: "normal",
        title: "Remove normal GIFs",
        descriptionbefore: "Hide comments containing GIFs that YouTube allows posting.",
        fineprintbefore: "YouTube only allows uploading G/PG Tenor GIFs, however it's ",
        fineprintlink: "likely possible to manipulate the age rating Tenor assigns",
        fineprinturl: "https://files.catbox.moe/bd1leu.jpg",
        fineprintafter: ".",
        modes: [
          {mode: "alt", title: "Replace with text", description: "Shows a [GIF] label instead of the actual GIF."},
          {mode: "remove", title: "Remove"}
        ]
      }),
      createcategory({
        category: "ytgc",
        title: "Remove \"YouTube GIF Comments\" GIFs",
        descriptionbefore: "Hide comments containing fake GIFs from ",
        descriptionlink: "YouTube GIF Comments",
        descriptionurl: "https://chromewebstore.google.com/detail/youtube-gif-comments/fogcfkjicadghgcpicdfgmmdldedgnhl",
        descriptionafter: ".",
        fineprintbefore: "This extension loads any Tenor GIF regardless of its age rating.",
        modes: [
          {mode: "text", title: "Replace with text", description: "If this extension is installed, this option will turn its GIFs back into text. Otherwise, the text will simply turn dim and italic."},
          {mode: "remove", title: "Remove"}
        ]
      }),
      createcategory({
        category: "giftube",
        title: "Remove \"GifTube\" GIFs",
        descriptionbefore: "Hide comments containing fake GIFs from ",
        descriptionlink: "GifTube",
        descriptionurl: "https://chromewebstore.google.com/detail/youtube-gif-comments/mgokeljfnihjbcmblpceeciccjeacpdm",
        descriptionafter: ".",
        fineprintbefore: "This extension tries loading GIFs from any direct URL.",
        modes: [
          {mode: "text", title: "Replace with text", description: "If this extension is installed, this option will turn its GIFs back into text. Otherwise, the text will simply turn dim and italic."},
          {mode: "remove", title: "Remove"}
        ]
      })
    );

    main.appendChild(form);
    box.appendChild(main);
    backdrop.appendChild(box);
    shadow.append(style, backdrop);

    if (document.documentElement.hasAttribute("dark")) box.classList.add("darktheme");
    renderform(shadow, value);

    const controller = new AbortController();
    const close = () => closeui(host, controller);
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
    }, {signal: controller.signal});
    shadow.querySelector(".settingsform").addEventListener("change", async event => {
      const section = event.target.closest(".category");
      if (section) section.querySelector(".modeoptions").disabled = !section.querySelector(".enabledinput").checked;
      const settings = readform(shadow);
      publish(settings);
      try {
        await GM_setValue(storagekey, settings);
      } catch (error) {
        console.error("Couldnt save userscript settings?!", error);
      }
    });

    document.documentElement.appendChild(host);
    activehost = host;
    activeshadow = shadow;
    box.focus({preventScroll: true});
  }

  try {
    GM_addValueChangeListener(storagekey, (name, oldvalue, newvalue) => {
      const next = normalizesettings(newvalue);
      publish(next);
      if (activeshadow) renderform(activeshadow, next);
    });
  } catch (error) {}

  try {
    GM_registerMenuCommand("GifJettison settings", () => {void opensettings()}, {
      accessKey: "g",
      autoClose: true
    });
  } catch (error) {}

  void readsettings().then(publish);

})();
