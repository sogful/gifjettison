(() => {
  
  const commentselector = "ytd-comment-view-model, ytd-comment-renderer";
  const mediaselector = "img, video, source, [role='img'], [data-tenor-id], [data-gif-id], [data-gif]";
  const gifurl = /(?:\.gif(?:[?#\s,)]|$)|_webp_animated(?:_[^/?#\s,]+)?\.webp|(?:^|[/:.])tenor(?:\.|\/)|(?:^|[/:.])giphy(?:\.|\/))/i;
  const gifmarker = /\[\s*gif\s*:\s*(?:giphy|tenor)\s*:[^\]]+\]/i;
  const giftubemarker = /\[\s*gif\s*:\s*(?:url\s*:\s*)?[a-z0-9_-]+\s*\]/i;
  const standaloneurl = /^\s*https?:\/\/[^\s]+\s*$/i;
  const hiddencommentclass = "gifcommenthidden";
  const hiddenmediaclass = "gifmediahidden";
  const placeholderclass = "gifplaceholder";
  const defaultsettings = {
    normal: {enabled: true, mode: "remove"},
    ytgc: {enabled: true, mode: "remove"},
    giftube: {enabled: true, mode: "remove"}
  };

  let settings = defaultsettings;

  /*//////////////////////////////////////////////////////////////////////*/

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
    } catch (error) {}
    return comment.__data || {};
  }

  function getattachment(comment, model) {
    try {
      if (typeof comment.get === "function") {
        const attachment = comment.get("imageAttachment");
        if (attachment) return attachment;
      }
    } catch (error) {}
    return model.imageAttachment || comment.imageAttachment || null;
  }

  function getrawtext(comment, model) {
    const candidates = [];
    try {
      if (typeof comment.get === "function") {
        candidates.push(comment.get("comment"), comment.get("commentText"), comment.get("text"));
      }
    } catch (error) {}
    candidates.push(model.comment, model.commentText, model.text);
    for (const candidate of candidates) {
      const text = flattentext(candidate).trim();
      if (text) return text;
    }

    const body = comment.querySelector("yt-attributed-string[slot='content'], ytd-expander yt-formatted-string, #content-text, yt-attributed-string#content-text, [id='content-text']");
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
    const alt = media.getAttribute("alt") || "";
    const values = mediavalues(media).join(" ");
    return media.matches("img#emoji, [data-emoji], ytd-emoji-renderer img, .emoji img, .ytAttributedStringImageElement") ||
      Boolean(media.closest("ytd-emoji-renderer")) ||
      /(?:emoji|emote)/i.test(values) ||
      /\p{Extended_Pictographic}/u.test(alt);
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
    const officialhost = comment.querySelector("ytw-comment-image-attachment-view-model, ytd-comment-image-attachment-renderer");
    const current = comment.querySelector("." + placeholderclass);
    const cachedcategory = current?.gifcategory;
    const rawtext = current?.gifsourcetext || getrawtext(comment, model);
    const media = getmedia(comment);
    if (cachedcategory === "normal" || cachedcategory === "ytgc" || cachedcategory === "giftube") {
      return {category: cachedcategory, comment, model, attachment, image, rawtext, media};
    }

    const official = Boolean(officialhost) ||
      image?.imageFormatHint === "IMAGE_FORMAT_ANIMATED_WEBP" ||
      sources.some(source => source?.url && gifurl.test(source.url));
    const values = media.flatMap(mediavalues);
    const tenoredmedia = media.some(item =>
      item.hasAttribute("data-tenor-id") ||
      values.some(value => /(?:tenor|giphy)/i.test(value))
    );

    if (official) return {category: "normal", comment, model, attachment, image, rawtext, media};
    if (hasexplicitgifmarker(comment, rawtext) || tenoredmedia) {
      return {category: "ytgc", comment, model, attachment, image, rawtext, media};
    }
    if (giftubemarker.test(rawtext)) {
      return {category: "giftube", comment, model, attachment, image, rawtext, media};
    }

    const renderedmedia = media.some(item =>
      item.tagName === "VIDEO" ||
      item.hasAttribute("data-gif") ||
      item.hasAttribute("data-gif-id") ||
      gifurl.test(mediavalues(item).join(" "))
    );
    if (renderedmedia || standaloneurl.test(rawtext)) {
      return {category: "giftube", comment, model, attachment, image, rawtext, media};
    }
    return null;
  }

  function setclass(element, name, enabled) {
    if (!element) return false;
    const changed = element.classList.contains(name) !== enabled;
    if (changed) element.classList.toggle(name, enabled);
    return changed;
  }

  function clearreplacement(gif) {
    for (const media of gif.media) setclass(media, hiddenmediaclass, false);
    gif.comment.querySelectorAll("." + hiddenmediaclass).forEach(media => {
      setclass(media, hiddenmediaclass, false);
    });
    gif.comment.querySelectorAll(".gifrawhidden").forEach(media => {
      setclass(media, "gifrawhidden", false);
    });
    gif.comment.querySelector("." + placeholderclass)?.remove();
  }

  /*//////////////////////////////////////////////////////////////////////*/

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
    const marker = gif.rawtext.match(gifmarker) || gif.rawtext.match(giftubemarker);
    if (marker) return marker[0];
    const url = gif.rawtext.match(/https?:\/\/[^\s]+/i);
    return url ? url[0].replace(/[.,!?)]*$/, "") : gif.rawtext;
  }

  function getreplacementtext(gif, mode) {
    if (mode === "alt") return getdescription(gif);
    const raw = getrawreplacement(gif);
    return raw || "[GIF]";
  }

  function getcontentbody(comment) {
    return comment.querySelector("yt-attributed-string[slot='content'], ytd-expander yt-formatted-string, #content-text, yt-attributed-string#content-text, [id='content-text']");
  }

  function replacevisiblemarker(gif, text) {
    const raw = getrawreplacement(gif);
    const body = getcontentbody(gif.comment);
    if (!raw || !body) return null;

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest("." + placeholderclass + ", .gifrawhidden")) continue;
      const value = node.nodeValue || "";
      const start = value.indexOf(raw);
      if (start < 0) continue;

      const rawmarker = document.createElement("span");
      rawmarker.classList.add("gifrawhidden");
      rawmarker.textContent = raw;
      const placeholder = document.createElement("span");
      placeholder.classList.add(placeholderclass);
      placeholder.textContent = text;
      placeholder.gifcategory = gif.category;
      placeholder.gifsourcetext = gif.rawtext;

      const fragment = document.createDocumentFragment();
      if (start > 0) fragment.appendChild(document.createTextNode(value.slice(0, start)));
      fragment.append(rawmarker, placeholder);
      const end = start + raw.length;
      if (end < value.length) fragment.appendChild(document.createTextNode(value.slice(end)));
      node.parentNode.replaceChild(fragment, node);
      return placeholder;
    }
    return null;
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

  /*//////////////////////////////////////////////////////////////////////*/

  function showreplacement(gif, mode) {
    const mediatohide = getmediatohide(gif);
    for (const media of mediatohide) {
      const attachmentroot = media.closest("ytw-comment-image-attachment-view-model, ytd-comment-image-attachment-renderer, ytd-comment-attachment-renderer, ytd-comment-attachment-view-model, [class*='attachment']");
      setclass(attachmentroot && attachmentroot !== gif.comment ? attachmentroot : media, hiddenmediaclass, true);
    }

    const text = getreplacementtext(gif, mode);
    const current = gif.comment.querySelector("." + placeholderclass);
    if (!text) {
      current?.remove();
      return;
    }

    const placeholder = replacevisiblemarker(gif, text) || current || document.createElement("span");
    const body = getcontentbody(gif.comment) || gif.comment.querySelector("#body") || gif.comment;
    placeholder.classList.add(placeholderclass);
    if (placeholder.textContent !== text) placeholder.textContent = text;
    placeholder.gifcategory = gif.category;
    placeholder.gifsourcetext = gif.rawtext;
    if (placeholder.parentElement !== body) body.appendChild(placeholder);
  }

  function clearcomment(comment) {
    const thread = comment.closest("ytd-comment-thread-renderer");
    const hadhiddencomment = comment.classList.contains(hiddencommentclass);
    const hiddenmedia = comment.querySelectorAll("." + hiddenmediaclass);
    const hiddenraw = comment.querySelectorAll(".gifrawhidden");
    const placeholder = comment.querySelector("." + placeholderclass);
    if (!hadhiddencomment && hiddenmedia.length === 0 && hiddenraw.length === 0 && !placeholder) {
      return;
    }

    setclass(comment, hiddencommentclass, false);
    hiddenmedia.forEach(media => {
      setclass(media, hiddenmediaclass, false);
    });
    hiddenraw.forEach(media => {
      setclass(media, "gifrawhidden", false);
    });
    placeholder?.remove();
    if (hadhiddencomment) refreshthread(thread);
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
      if (setclass(comment, hiddencommentclass, true)) {
        refreshthread(comment.closest("ytd-comment-thread-renderer"));
      }
      return;
    }

    if (setclass(comment, hiddencommentclass, false)) {
      refreshthread(comment.closest("ytd-comment-thread-renderer"));
    }
    showreplacement(gif, option.mode);
  }

  /*//////////////////////////////////////////////////////////////////////*/

  function collectparentcomment(node, comments) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || element.nodeType !== 1) return;
    const comment = element.matches(commentselector) ? element : element.closest(commentselector);
    if (comment) comments.add(comment);
  }

  function collectcomments(node, comments) {
    const element = node.nodeType === 1 || node.nodeType === 9 ? node : node.parentElement;
    if (!element) return;
    collectparentcomment(element, comments);
    if (node.querySelectorAll) {
      for (const comment of node.querySelectorAll(commentselector)) comments.add(comment);
    }
  }

  function scan(node) {
    const comments = new Set();
    collectcomments(node, comments);
    for (const comment of comments) applycomment(comment);
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.channel !== "gifjettisonsettings") return;
    settings = normalizesettings(event.data.settings);
    scan(document);
  });

  const pendingcomments = new Set();
  const pendingthreads = new Set();
  let scanqueued = false;

  function flushmutations() {
    scanqueued = false;
    const comments = Array.from(pendingcomments);
    const threads = Array.from(pendingthreads);
    pendingcomments.clear();
    pendingthreads.clear();
    for (const comment of comments) applycomment(comment);
    for (const thread of threads) refreshthread(thread);
  }

  function schedulemutations() {
    if (scanqueued) return;
    scanqueued = true;
    queueMicrotask(flushmutations);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (!target && mutation.type !== "childList") continue;

      if (mutation.type === "attributes") {
        if (mutation.attributeName === "class" &&
          !target.matches(mediaselector) &&
          !target.matches(".emoji")) continue;
        collectparentcomment(target, pendingcomments);
        continue;
      }

      if (mutation.type === "characterData") {
        collectparentcomment(target, pendingcomments);
        continue;
      }

      if (target) collectparentcomment(target, pendingcomments);
      const thread = target?.closest("ytd-comment-thread-renderer");
      if (thread && Array.from(mutation.removedNodes).some(node => {
        return node.nodeType === 1 && (
          node.matches(commentselector) ||
          node.querySelector(commentselector)
        );
      })) pendingthreads.add(thread);
      for (const node of mutation.addedNodes) collectcomments(node, pendingcomments);
    }
    if (pendingcomments.size || pendingthreads.size) schedulemutations();
  });

  /*//////////////////////////////////////////////////////////////////////*/

  observer.observe(document, {
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-url", "data-tenor-id", "data-gif-id", "data-gif", "alt", "aria-label", "title", "class"],
    characterData: true,
    childList: true, subtree: true
  });
  scan(document);

})();
