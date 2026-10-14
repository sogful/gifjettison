(() => {
  const commentselector = "ytd-comment-view-model, ytd-comment-renderer";
  const mediaselector = "img, video, source, [role='img'], [data-tenor-id], [data-gif-id], [data-gif]";
  const gifurl = /(?:\.gif(?:[?#\s,)]|$)|_webp_animated(?:_[^/?#\s,]+)?\.webp|(?:^|[/:.])tenor(?:\.|\/)|(?:^|[/:.])giphy(?:\.|\/))/i;
  const gifmarker = /\[\s*gif\s*:\s*(?:giphy|tenor)\s*:[^\]]+\]/i;
  const standaloneurl = /^\s*https?:\/\/[^\s]+\s*$/i;
  const hiddencommentclass = "gifcommenthidden";
  const hiddenmediaclass = "gifmediahidden";
  const placeholderclass = "gifplaceholder";
  const defaultsettings = {
    normal: { enabled: true, mode: "remove" },
    ytgc: { enabled: true, mode: "remove" },
    giftube: { enabled: true, mode: "remove" }
  };

  let settings = defaultsettings;

  function normalizesettings(value) {
    const result = {};
    for (const [category, defaults] of Object.entries(defaultsettings)) {
      const saved = value?.[category] || {};
      const allowedmodes = category === "normal"
        ? ["alt", "remove"]
        : category === "ytgc"
          ? ["alt", "text", "remove"]
          : ["text", "remove"];
      result[category] = {
        enabled: saved.enabled !== false,
        mode: allowedmodes.includes(saved.mode) ? saved.mode : defaults.mode
      };
    }
    return result;
  }

  function flattentext(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(flattentext).filter(Boolean).join("");
    if (!value || typeof value !== "object") return "";
    if (typeof value.simpleText === "string") return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map(flattentext).filter(Boolean).join("");
    if (typeof value.text === "string") return value.text;
    if (value.content !== undefined) return flattentext(value.content);
    if (value.commentText !== undefined) return flattentext(value.commentText);
    return "";
  }

  function getmodel(comment) {
    try {
      if (typeof comment.get === "function") {
        return comment.get("__data") || comment.__data || {};
      }
    } catch (_) {}
    return comment.__data || {};
  }

  function getattachment(comment, model) {
    try {
      if (typeof comment.get === "function") {
        const attachment = comment.get("imageAttachment");
        if (attachment) return attachment;
      }
    } catch (_) {}
    return model.imageAttachment || comment.imageAttachment || null;
  }

  function getrawtext(comment, model) {
    const candidates = [];
    try {
      if (typeof comment.get === "function") {
        candidates.push(comment.get("comment"), comment.get("commentText"), comment.get("text"));
      }
    } catch (_) {}
    candidates.push(model.comment, model.commentText, model.text);
    for (const candidate of candidates) {
      const text = flattentext(candidate).trim();
      if (text) return text;
    }

    const body = comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']");
    return (body?.innerText || body?.textContent || "").trim();
  }

  function mediavalues(media) {
    return [
      media.getAttribute("src"),
      media.getAttribute("srcset"),
      media.getAttribute("data-src"),
      media.getAttribute("data-url"),
      media.getAttribute("href"),
      media.getAttribute("poster"),
      media.getAttribute("alt"),
      media.getAttribute("title"),
      media.getAttribute("aria-label")
    ].filter(Boolean);
  }

  function isemoji(media) {
    return media.matches("img#emoji, [data-emoji], ytd-emoji-renderer img, .emoji img") ||
      Boolean(media.closest("ytd-emoji-renderer"));
  }

  function isauthormedia(media) {
    return Boolean(media.closest("#author-thumbnail, #author-photo, #author, #author-avatar, yt-img-shadow#author-photo"));
  }

  function getmedia(comment) {
    return Array.from(comment.querySelectorAll(mediaselector))
      .filter(media => !isemoji(media) && !isauthormedia(media));
  }

  function hasexplicitgifmarker(comment, rawtext) {
    return comment.hasAttribute("data-tenor-id") ||
      comment.hasAttribute("data-gif-id") ||
      comment.hasAttribute("data-gif") ||
      gifmarker.test(rawtext) ||
      Boolean(comment.querySelector("[data-tenor-id], [data-gif-id], [data-gif]"));
  }

  function findgif(comment) {
    const model = getmodel(comment);
    const attachment = getattachment(comment, model);
    const image = attachment?.image;
    const sources = Array.isArray(image?.sources) ? image.sources : [];
    const official = image?.imageFormatHint === "IMAGE_FORMAT_ANIMATED_WEBP" ||
      sources.some(source => source?.url && gifurl.test(source.url));
    const rawtext = getrawtext(comment, model);
    const media = getmedia(comment);
    const values = media.flatMap(mediavalues);
    const tenoredmedia = media.some(item =>
      item.hasAttribute("data-tenor-id") ||
      values.some(value => /(?:tenor|giphy)/i.test(value))
    );

    if (official) return { category: "normal", comment, model, attachment, image, rawtext, media };
    if (hasexplicitgifmarker(comment, rawtext) || tenoredmedia) {
      return { category: "ytgc", comment, model, attachment, image, rawtext, media };
    }

    const renderedmedia = media.some(item =>
      item.tagName === "VIDEO" ||
      item.hasAttribute("data-gif") ||
      item.hasAttribute("data-gif-id") ||
      gifurl.test(mediavalues(item).join(" ")) ||
      item.tagName === "IMG"
    );
    if (renderedmedia || standaloneurl.test(rawtext)) {
      return { category: "giftube", comment, model, attachment, image, rawtext, media };
    }
    return null;
  }

  function setclass(element, name, enabled) {
    if (!element) return;
    element.classList.toggle(name, enabled);
  }

  function clearreplacement(gif) {
    for (const media of gif.media) setclass(media, hiddenmediaclass, false);
    gif.comment.querySelectorAll("." + hiddenmediaclass).forEach(media => {
      setclass(media, hiddenmediaclass, false);
    });
    gif.comment.querySelector("." + placeholderclass)?.remove();
  }

  function getdescription(gif) {
    const descriptions = gif.media
      .flatMap(media => [
        media.getAttribute("alt"),
        media.getAttribute("title"),
        media.getAttribute("aria-label"),
        media.getAttribute("data-caption")
      ])
      .filter(Boolean)
      .map(text => text.trim())
      .filter(text => text && !/^(?:gif|image|animation|comment image attachment)$/i.test(text));
    return descriptions[0] || "[GIF]";
  }

  function getrawreplacement(gif) {
    const marker = gif.rawtext.match(gifmarker);
    if (marker) return marker[0];
    const url = gif.rawtext.match(/https?:\/\/[^\s]+/i);
    return url ? url[0].replace(/[.,!?)]*$/, "") : gif.rawtext;
  }

  function getreplacementtext(gif, mode) {
    if (mode === "alt") return getdescription(gif);
    const raw = getrawreplacement(gif);
    const visiblebody = gif.comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']");
    const visibletext = (visiblebody?.innerText || visiblebody?.textContent || "").trim();
    if (visibletext && raw && visibletext.includes(raw)) return "";
    return raw || "[GIF]";
  }

  function getmediatohide(gif) {
    return gif.media.filter(media => {
      if (gif.category === "normal") {
        return true;
      }

      if (media.hasAttribute("data-tenor-id") || media.hasAttribute("data-gif-id") || media.hasAttribute("data-gif")) {
        return true;
      }
      if (media.tagName === "VIDEO" || mediavalues(media).some(value => gifurl.test(value))) return true;
      return media.tagName === "IMG";
    });
  }

  function showreplacement(gif, mode) {
    const mediatohide = getmediatohide(gif);
    for (const media of mediatohide) {
      const attachmentroot = media.closest("ytd-comment-attachment-renderer, ytd-comment-attachment-view-model, [class*='attachment']");
      setclass(attachmentroot && attachmentroot !== gif.comment ? attachmentroot : media, hiddenmediaclass, true);
    }

    const text = getreplacementtext(gif, mode);
    const current = gif.comment.querySelector("." + placeholderclass);
    if (!text) {
      current?.remove();
      return;
    }

    const body = gif.comment.querySelector("#body") ||
      gif.comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']")?.parentElement ||
      gif.comment;
    const placeholder = current || document.createElement("span");
    placeholder.classList.add(placeholderclass);
    if (placeholder.textContent !== text) placeholder.textContent = text;
    if (placeholder.parentElement !== body) body.appendChild(placeholder);
  }

  function clearcomment(comment) {
    const thread = comment.closest("ytd-comment-thread-renderer");
    const hadhiddencomment = comment.classList.contains(hiddencommentclass);
    const hiddenmedia = comment.querySelectorAll("." + hiddenmediaclass);
    const placeholder = comment.querySelector("." + placeholderclass);
    if (!hadhiddencomment && hiddenmedia.length === 0 && !placeholder) {
      if (thread?.classList.contains(hiddencommentclass)) refreshthread(thread);
      return;
    }

    setclass(comment, hiddencommentclass, false);
    hiddenmedia.forEach(media => {
      setclass(media, hiddenmediaclass, false);
    });
    placeholder?.remove();
    refreshthread(thread);
  }

  function refreshthread(thread) {
    if (!thread) return;
    const hashiddencomment = Array.from(thread.querySelectorAll(commentselector))
      .some(comment => comment.classList.contains(hiddencommentclass));
    setclass(thread, hiddencommentclass, hashiddencomment);
  }

  function applycomment(comment) {
    const gif = findgif(comment);
    if (!gif) {
      clearcomment(comment);
      return;
    }

    const option = settings[gif.category];
    if (!option.enabled) {
      clearcomment(comment);
      return;
    }

    if (option.mode === "remove") {
      clearreplacement(gif);
      setclass(comment, hiddencommentclass, true);
      refreshthread(comment.closest("ytd-comment-thread-renderer"));
      return;
    }

    setclass(comment, hiddencommentclass, false);
    refreshthread(comment.closest("ytd-comment-thread-renderer"));
    showreplacement(gif, option.mode);
  }

  function scan(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (element) {
      const comment = element.matches(commentselector) ? element : element.closest(commentselector);
      if (comment) applycomment(comment);
    }
    if (node.querySelectorAll) {
      for (const comment of node.querySelectorAll(commentselector)) applycomment(comment);
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.channel !== "gifjettisonsettings") return;
    settings = normalizesettings(event.data.settings);
    scan(document);
  });

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" || mutation.type === "characterData") {
        scan(mutation.target);
        continue;
      }
      const parent = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (parent && (parent.closest(commentselector) || parent.closest("ytd-comment-thread-renderer"))) {
        scan(parent);
      }
      for (const node of mutation.addedNodes) scan(node);
    }
  });

  observer.observe(document, {
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-url", "data-tenor-id", "data-gif-id", "data-gif", "alt", "aria-label", "title", "class"],
    characterData: true,
    childList: true,
    subtree: true
  });

  scan(document);
})();
