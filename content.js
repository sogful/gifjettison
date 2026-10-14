(() => {
  const commentSelector = "ytd-comment-view-model, ytd-comment-renderer";
  const mediaSelector = "img, video, source, [role='img'], [data-tenor-id], [data-gif-id], [data-gif]";
  const gifUrl = /(?:\.gif(?:[?#\s,)]|$)|_webp_animated(?:_[^/?#\s,]+)?\.webp|(?:^|[/:.])tenor(?:\.|\/)|(?:^|[/:.])giphy(?:\.|\/))/i;
  const gifMarker = /\[\s*gif\s*:\s*(?:giphy|tenor)\s*:[^\]]+\]/i;
  const standaloneUrl = /^\s*https?:\/\/[^\s]+\s*$/i;
  const defaultSettings = {
    normal: { enabled: true, mode: "remove" },
    ytgc: { enabled: true, mode: "remove" },
    giftube: { enabled: true, mode: "remove" }
  };

  let settings = defaultSettings;

  function normalizeSettings(value) {
    const result = {};
    for (const [category, defaults] of Object.entries(defaultSettings)) {
      const saved = value?.[category] || {};
      const allowedModes = category === "normal"
        ? ["alt", "remove"]
        : category === "ytgc"
          ? ["alt", "text", "remove"]
          : ["text", "remove"];
      result[category] = {
        enabled: saved.enabled !== false,
        mode: allowedModes.includes(saved.mode) ? saved.mode : defaults.mode
      };
    }
    return result;
  }

  function flattenText(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join("");
    if (!value || typeof value !== "object") return "";
    if (typeof value.simpleText === "string") return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map(flattenText).filter(Boolean).join("");
    if (typeof value.text === "string") return value.text;
    if (value.content !== undefined) return flattenText(value.content);
    if (value.commentText !== undefined) return flattenText(value.commentText);
    return "";
  }

  function getModel(comment) {
    try {
      if (typeof comment.get === "function") {
        return comment.get("__data") || comment.__data || {};
      }
    } catch (_) {}
    return comment.__data || {};
  }

  function getAttachment(comment, model) {
    try {
      if (typeof comment.get === "function") {
        const attachment = comment.get("imageAttachment");
        if (attachment) return attachment;
      }
    } catch (_) {}
    return model.imageAttachment || comment.imageAttachment || null;
  }

  function getRawText(comment, model) {
    const candidates = [];
    try {
      if (typeof comment.get === "function") {
        candidates.push(comment.get("comment"), comment.get("commentText"), comment.get("text"));
      }
    } catch (_) {}
    candidates.push(model.comment, model.commentText, model.text);
    for (const candidate of candidates) {
      const text = flattenText(candidate).trim();
      if (text) return text;
    }

    const body = comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']");
    return (body?.innerText || body?.textContent || "").trim();
  }

  function mediaValues(media) {
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

  function isEmoji(media) {
    return media.matches("img#emoji, [data-emoji], ytd-emoji-renderer img, .emoji img") ||
      Boolean(media.closest("ytd-emoji-renderer"));
  }

  function isAuthorMedia(media) {
    return Boolean(media.closest("#author-thumbnail, #author-photo, #author, #author-avatar, yt-img-shadow#author-photo"));
  }

  function getMedia(comment) {
    return Array.from(comment.querySelectorAll(mediaSelector))
      .filter(media => !isEmoji(media) && !isAuthorMedia(media));
  }

  function hasExplicitGifMarker(comment, rawText) {
    return comment.hasAttribute("data-tenor-id") ||
      comment.hasAttribute("data-gif-id") ||
      comment.hasAttribute("data-gif") ||
      gifMarker.test(rawText) ||
      Boolean(comment.querySelector("[data-tenor-id], [data-gif-id], [data-gif]"));
  }

  function findGif(comment) {
    const model = getModel(comment);
    const attachment = getAttachment(comment, model);
    const image = attachment?.image;
    const sources = Array.isArray(image?.sources) ? image.sources : [];
    const official = image?.imageFormatHint === "IMAGE_FORMAT_ANIMATED_WEBP" ||
      sources.some(source => source?.url && gifUrl.test(source.url));
    const rawText = getRawText(comment, model);
    const media = getMedia(comment);
    const values = media.flatMap(mediaValues);
    const tenoredMedia = media.some(item =>
      item.hasAttribute("data-tenor-id") ||
      values.some(value => /(?:tenor|giphy)/i.test(value))
    );

    if (official) return { category: "normal", comment, model, attachment, image, rawText, media };
    if (hasExplicitGifMarker(comment, rawText) || tenoredMedia) {
      return { category: "ytgc", comment, model, attachment, image, rawText, media };
    }

    const renderedMedia = media.some(item =>
      item.tagName === "VIDEO" ||
      item.hasAttribute("data-gif") ||
      item.hasAttribute("data-gif-id") ||
      gifUrl.test(mediaValues(item).join(" ")) ||
      item.tagName === "IMG"
    );
    if (renderedMedia || standaloneUrl.test(rawText)) {
      return { category: "giftube", comment, model, attachment, image, rawText, media };
    }
    return null;
  }

  function setAttribute(element, name, enabled) {
    if (!element) return;
    if (enabled && !element.hasAttribute(name)) element.setAttribute(name, "");
    else if (!enabled && element.hasAttribute(name)) element.removeAttribute(name);
  }

  function clearReplacement(gif) {
    for (const media of gif.media) setAttribute(media, "data-gifjettison-hidden-media", false);
    gif.comment.querySelectorAll("[data-gifjettison-hidden-media]").forEach(media => {
      setAttribute(media, "data-gifjettison-hidden-media", false);
    });
    gif.comment.querySelector("[data-gifjettison-placeholder]")?.remove();
  }

  function getDescription(gif) {
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

  function getRawReplacement(gif) {
    const marker = gif.rawText.match(gifMarker);
    if (marker) return marker[0];
    const url = gif.rawText.match(/https?:\/\/[^\s]+/i);
    return url ? url[0].replace(/[.,!?)]*$/, "") : gif.rawText;
  }

  function getReplacementText(gif, mode) {
    if (mode === "alt") return getDescription(gif);
    const raw = getRawReplacement(gif);
    const visibleBody = gif.comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']");
    const visibleText = (visibleBody?.innerText || visibleBody?.textContent || "").trim();
    if (visibleText && raw && visibleText.includes(raw)) return "";
    return raw || "[GIF]";
  }

  function getMediaToHide(gif) {
    return gif.media.filter(media => {
      if (gif.category === "normal") {
        return true;
      }

      if (media.hasAttribute("data-tenor-id") || media.hasAttribute("data-gif-id") || media.hasAttribute("data-gif")) {
        return true;
      }
      if (media.tagName === "VIDEO" || mediaValues(media).some(value => gifUrl.test(value))) return true;
      return media.tagName === "IMG";
    });
  }

  function showReplacement(gif, mode) {
    const mediaToHide = getMediaToHide(gif);
    for (const media of mediaToHide) {
      const attachmentRoot = media.closest("ytd-comment-attachment-renderer, ytd-comment-attachment-view-model, [class*='attachment']");
      setAttribute(attachmentRoot && attachmentRoot !== gif.comment ? attachmentRoot : media, "data-gifjettison-hidden-media", true);
    }

    const text = getReplacementText(gif, mode);
    const current = gif.comment.querySelector("[data-gifjettison-placeholder]");
    if (!text) {
      current?.remove();
      return;
    }

    const body = gif.comment.querySelector("#body") ||
      gif.comment.querySelector("#content-text, yt-attributed-string#content-text, [id='content-text']")?.parentElement ||
      gif.comment;
    const placeholder = current || document.createElement("span");
    placeholder.setAttribute("data-gifjettison-placeholder", "");
    if (placeholder.className !== "gifjettison-placeholder") {
      placeholder.className = "gifjettison-placeholder";
    }
    if (placeholder.textContent !== text) placeholder.textContent = text;
    if (placeholder.parentElement !== body) body.appendChild(placeholder);
  }

  function clearComment(comment) {
    const thread = comment.closest("ytd-comment-thread-renderer");
    const hadHiddenComment = comment.hasAttribute("data-gif-comment-hidden");
    const hiddenMedia = comment.querySelectorAll("[data-gifjettison-hidden-media]");
    const placeholder = comment.querySelector("[data-gifjettison-placeholder]");
    if (!hadHiddenComment && hiddenMedia.length === 0 && !placeholder) {
      if (thread?.hasAttribute("data-gif-comment-hidden")) refreshThread(thread);
      return;
    }

    setAttribute(comment, "data-gif-comment-hidden", false);
    hiddenMedia.forEach(media => {
      setAttribute(media, "data-gifjettison-hidden-media", false);
    });
    placeholder?.remove();
    refreshThread(thread);
  }

  function refreshThread(thread) {
    if (!thread) return;
    const hasHiddenComment = Array.from(thread.querySelectorAll(commentSelector))
      .some(comment => comment.hasAttribute("data-gif-comment-hidden"));
    setAttribute(thread, "data-gif-comment-hidden", hasHiddenComment);
  }

  function applyComment(comment) {
    const gif = findGif(comment);
    if (!gif) {
      clearComment(comment);
      return;
    }

    const option = settings[gif.category];
    if (!option.enabled) {
      clearComment(comment);
      return;
    }

    if (option.mode === "remove") {
      clearReplacement(gif);
      setAttribute(comment, "data-gif-comment-hidden", true);
      refreshThread(comment.closest("ytd-comment-thread-renderer"));
      return;
    }

    setAttribute(comment, "data-gif-comment-hidden", false);
    refreshThread(comment.closest("ytd-comment-thread-renderer"));
    showReplacement(gif, option.mode);
  }

  function scan(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (element) {
      const comment = element.matches(commentSelector) ? element : element.closest(commentSelector);
      if (comment) applyComment(comment);
    }
    if (node.querySelectorAll) {
      for (const comment of node.querySelectorAll(commentSelector)) applyComment(comment);
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.channel !== "gifjettison-settings") return;
    settings = normalizeSettings(event.data.settings);
    scan(document);
  });

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" || mutation.type === "characterData") {
        scan(mutation.target);
        continue;
      }
      const parent = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (parent && (parent.closest(commentSelector) || parent.closest("ytd-comment-thread-renderer"))) {
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
