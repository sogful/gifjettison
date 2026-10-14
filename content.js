(() => {
  const commentselector = "ytd-comment-view-model, ytd-comment-renderer";
  const mediaselector = "img, video, source, [role='img'], [data-tenor-id], [data-gif-id], [data-gif]";
  const gifurl = /(?:\.gif(?:[?#]|$)|(?:^|[/:.])tenor(?:\.|\/)|(?:^|[/:.])giphy(?:\.|\/))/i;
  const giflabel = /\bgif\b/i;

  function hasgif(comment) {
    if (comment.hasAttribute("data-tenor-id") || comment.hasAttribute("data-gif-id")) {
      return true;
    }

    for (const media of comment.querySelectorAll(mediaselector)) {
      if (media.closest("#author-thumbnail, #author-photo, #author")) {
        continue;
      }

      if (media.hasAttribute("data-tenor-id") || media.hasAttribute("data-gif-id") || media.hasAttribute("data-gif")) {
        return true;
      }

      const values = [
        media.getAttribute("src"),
        media.getAttribute("srcset"),
        media.getAttribute("data-src"),
        media.getAttribute("href"),
        media.getAttribute("alt"),
        media.getAttribute("title"),
        media.getAttribute("aria-label")
      ];

      if (values.some(value => value && (gifurl.test(value) || giflabel.test(value)))) {
        return true;
      }
    }

    return false;
  }

  function hidegifcomment(comment) {
    if (hasgif(comment)) {
      comment.setAttribute("data-gif-comment-hidden", "");
    }
  }

  function scan(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (element) {
      const comment = element.matches(commentselector) ? element : element.closest(commentselector);
      if (comment) {
        hidegifcomment(comment);
      }
    }

    if (node.querySelectorAll) {
      for (const comment of node.querySelectorAll(commentselector)) {
        hidegifcomment(comment);
      }
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        scan(mutation.target);
        continue;
      }

      for (const node of mutation.addedNodes) {
        scan(node);
      }
    }
  });

  observer.observe(document, {
    attributes: true,
    attributeFilter: ["src", "srcset", "data-src", "data-tenor-id", "data-gif-id", "data-gif", "alt", "aria-label", "title"],
    childList: true,
    subtree: true
  });

  scan(document);
})();
