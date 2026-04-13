(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");

  let state = {
    loading: true,
    detail: null,
    error: null,
    favorite: false,
    onlyLz: false,
    lastFullPageBeforeOnlyLz: null,
    expandedComments: {},
    postComments: {},
    lightboxSrc: null,
    showBackToTop: false,
    settings: {
      showImages: true,
      compactMode: false,
      lowContrastMode: true
    }
  };

  function send(type, payload) {
    vscode.postMessage({ type, payload });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function applyBodySettings() {
    document.body.classList.toggle("hide-images", !state.settings.showImages);
  }

  function getVisiblePosts() {
    const posts = state.detail?.posts || [];
    if (!state.onlyLz) {
      return posts;
    }
    return posts.filter((post) => post.isLz);
  }

  function renderCommentContent(item) {
    if (item.contentHtml) {
      return item.contentHtml;
    }
    return escapeHtml(item.contentText || "");
  }

  function renderComments(post) {
    if (!post.commentsPreview) {
      return "";
    }

    const isExpanded = !!state.expandedComments[post.postId];
    const loadedState = state.postComments[post.postId];
    const previewItems = post.commentsPreview.items || [];
    const items = isExpanded ? loadedState?.items || [] : previewItems;
    const total = loadedState?.total || post.commentsPreview.total;
    const currentPage = loadedState?.page || 1;
    const pageCount = loadedState?.pageCount || 1;
    const hasPrev = loadedState?.hasPrev ?? (currentPage > 1);
    const hasMore = loadedState?.hasMore ?? (pageCount > currentPage);
    const hasLoadedComments = !!loadedState;

    return `
      <div class="comment-thread">
        <div class="comment-summary-head">
          <div class="reply-summary">
            <span class="reply-label">回复 ${escapeHtml(total)} 条</span>
            <button
              class="reply-toggle"
              data-toggle-comments="${escapeHtml(post.postId)}"
              aria-label="${isExpanded ? "收起回复" : "展开回复"}"
              title="${isExpanded ? "收起回复" : "展开回复"}"
            >${isExpanded ? "▲" : "▼"}</button>
          </div>
        </div>
        ${isExpanded
          ? loadedState?.loading
            ? `<div class="hint">正在加载楼中楼${loadedState.page ? ` · 第 ${escapeHtml(loadedState.page)} 页` : ""}…</div>`
            : loadedState?.error && items.length === 0
              ? `<div class="hint">${escapeHtml(loadedState.error)}</div>`
              : items.length > 0
                ? `<div class="comment-list">
                    ${items
                      .map(
                        (item) => `
                          <div class="comment-card">
                            <div class="comment-meta">
                              <span>${escapeHtml(item.authorName)}</span>
                              ${item.isLz ? '<span class="tag">楼主</span>' : ""}
                              ${item.createdAtLabel ? `<span>${escapeHtml(item.createdAtLabel)}</span>` : ""}
                            </div>
                            <div class="comment-content">${renderCommentContent(item)}</div>
                          </div>
                        `
                      )
                      .join("")}
                  </div>
                  ${
                    hasLoadedComments
                      ? `<div class="comment-pagination">
                          <button class="button button-subtle" data-comments-page="${escapeHtml(post.postId)}:${escapeHtml(
                            String(currentPage - 1)
                          )}"${hasPrev ? "" : " disabled"}>上一页</button>
                          <div class="hint">第 ${escapeHtml(currentPage)}${pageCount ? ` / ${escapeHtml(pageCount)}` : ""} 页</div>
                          <button class="button button-subtle" data-comments-page="${escapeHtml(post.postId)}:${escapeHtml(
                            String(currentPage + 1)
                          )}"${hasMore ? "" : " disabled"}>下一页</button>
                        </div>`
                      : ""
                  }
                  ${loadedState?.error && items.length > 0 ? `<div class="hint">${escapeHtml(loadedState.error)}</div>` : ""}`
                : '<div class="hint">这层有楼中楼，但当前没有拿到可展示的评论内容。</div>'
          : ""}
      </div>
    `;
  }

  function renderQuotes(post) {
    if (!post.quoteBlocks || post.quoteBlocks.length === 0) {
      return "";
    }

    return post.quoteBlocks
      .slice(0, 2)
      .map((quote) => `<div class="quote-block">${escapeHtml(quote)}</div>`)
      .join("");
  }

  function renderPost(post) {
    return `
      <article class="post-row">
        <div class="post-head">
          <div class="post-meta">
            <span>#${escapeHtml(post.floor)}</span>
            <span>${escapeHtml(post.authorName)}</span>
            ${post.isLz ? '<span class="tag">楼主</span>' : ""}
            ${post.createdAtLabel ? `<span>${escapeHtml(post.createdAtLabel)}</span>` : ""}
          </div>
          <div class="post-meta">
            ${post.imageUrls?.length ? `<span>${escapeHtml(post.imageUrls.length)} 图</span>` : ""}
            ${post.commentsPreview ? `<span>${escapeHtml(post.commentsPreview.total)} 评</span>` : ""}
          </div>
        </div>
        ${renderQuotes(post)}
        <div class="post-content">${post.contentHtml}</div>
        ${renderComments(post)}
      </article>
    `;
  }

  function renderError() {
    return `
      <section class="notice">
        <div class="notice-title">加载失败</div>
        <div class="hint">${escapeHtml(state.error.message)}</div>
        <div class="toolbar">
          <button class="button" data-action="refresh">重试</button>
          <button class="button" data-action="external">系统浏览器</button>
        </div>
      </section>
    `;
  }

  function renderLoaded() {
    const detail = state.detail;
    const visiblePosts = getVisiblePosts();
    const pageCount = detail.pageCount || "";

    return `
      <section class="list-shell">
        <div class="simple-list">
          ${visiblePosts.length === 0
            ? '<section class="state">当前页没有可展示的楼层。</section>'
            : visiblePosts.map(renderPost).join("")}
        </div>
        <div class="footer-nav">
          <button class="button" data-action="prev"${detail.page <= 1 ? " disabled" : ""}>上一页</button>
          <div class="footer-tools">
            <div class="hint">只保留正文、图片和楼中楼</div>
            <div class="page-jump">
              <span class="hint">跳到</span>
              <input
                class="page-jump-input"
                data-role="pageJumpInput"
                type="number"
                min="1"
                ${pageCount ? `max="${escapeHtml(pageCount)}"` : ""}
                value="${escapeHtml(detail.page || 1)}"
              />
              <span class="hint">页</span>
              <button class="button button-subtle" data-action="jumpPage">跳转</button>
            </div>
          </div>
          <button class="button" data-action="next"${detail.pageCount && detail.page >= detail.pageCount ? " disabled" : ""}>下一页</button>
        </div>
      </section>
    `;
  }

  function renderHeaderMeta(detail, sourceThread, visiblePosts) {
    const forumName = detail?.forumName || sourceThread?.forumName || "贴吧";
    const heroAuthor = detail?.threadAuthorName || sourceThread?.authorName || "未知作者";
    const replyCount = sourceThread?.replyCount || 0;

    if (state.onlyLz) {
      return `${escapeHtml(forumName)}吧 · 楼主 ${escapeHtml(heroAuthor)} · 回复 ${escapeHtml(replyCount)} · 只看楼主 · 第 ${escapeHtml(
        detail?.page || 1
      )} 页${detail?.pageCount ? ` / ${escapeHtml(detail.pageCount)}` : ""} · 当前页 ${escapeHtml(
        visiblePosts.length
      )} 层`;
    }

    return `${escapeHtml(forumName)}吧 · 楼主 ${escapeHtml(heroAuthor)} · 回复 ${escapeHtml(replyCount)} · 第 ${escapeHtml(
      detail?.page || 1
    )} 页${detail?.pageCount ? ` / ${escapeHtml(detail.pageCount)}` : ""}`;
  }

  function render() {
    applyBodySettings();

    const detail = state.detail;
    const sourceThread = detail?.thread || null;
    const visiblePosts = getVisiblePosts();

    const content = state.loading
      ? '<section class="state">正在加载帖子内容…</section>'
      : state.error
        ? renderError()
        : renderLoaded();

    app.innerHTML = `
      <main class="panel">
        <header class="page-head">
          <div class="title-row">
            <div>
              <h1 class="page-title">${escapeHtml(detail?.title || "Tieba Reader")}</h1>
              <div class="page-meta">
                ${renderHeaderMeta(detail, sourceThread, visiblePosts)}
              </div>
            </div>
            <div class="toolbar">
              <button class="button" data-action="refresh">刷新</button>
              <button class="button${state.onlyLz ? " is-active" : ""}" data-action="onlyLz">${state.onlyLz ? "只看楼主中" : "只看楼主"}</button>
              <button class="button" data-action="images">${state.settings.showImages ? "隐藏图片" : "显示图片"}</button>
              <button class="button" data-action="external">系统浏览器</button>
            </div>
          </div>
        </header>
        ${content}
        ${state.showBackToTop ? '<button class="back-to-top" data-action="backToTop">回到顶部</button>' : ""}
        ${state.lightboxSrc
          ? `<div class="lightbox">
              <div class="lightbox-backdrop" data-action="closeLightbox"></div>
              <div class="lightbox-dialog">
                <button class="lightbox-close" data-action="closeLightbox">关闭</button>
                <img class="lightbox-image" src="${escapeHtml(state.lightboxSrc)}" alt="Preview" />
              </div>
            </div>`
          : ""}
      </main>
    `;

    app.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.getAttribute("data-action");
        const page = state.detail?.page || 1;
        if (action === "refresh") {
          send("refreshThread", { page, onlyLz: state.onlyLz });
        }
        if (action === "favorite") {
          send("favoriteThread");
        }
        if (action === "images") {
          send("toggleImages");
        }
        if (action === "browser") {
          send("openInSimpleBrowser");
        }
        if (action === "external") {
          send("openExternal");
        }
        if (action === "prev" && page > 1) {
          send("loadThreadPage", { page: page - 1, onlyLz: state.onlyLz });
        }
        if (action === "next") {
          send("loadThreadPage", { page: page + 1, onlyLz: state.onlyLz });
        }
        if (action === "jumpPage") {
          const input = app.querySelector("[data-role='pageJumpInput']");
          const raw = Number.parseInt(input?.value || "", 10);
          if (!Number.isFinite(raw) || raw <= 0) {
            return;
          }

          const maxPage = state.detail?.pageCount || raw;
          const targetPage = Math.max(1, Math.min(raw, maxPage));
          if (targetPage === page) {
            return;
          }

          send("loadThreadPage", { page: targetPage, onlyLz: state.onlyLz });
        }
        if (action === "onlyLz") {
          const currentPage = state.detail?.page || 1;
          if (!state.onlyLz) {
            state = {
              ...state,
              onlyLz: true,
              lastFullPageBeforeOnlyLz: currentPage > 1 ? currentPage : null
            };

            if (currentPage > 1) {
              state = {
                ...state,
                loading: true,
                error: null
              };
              render();
              send("toggleOnlyLz", { page: 1, onlyLz: true });
              return;
            }

            state = {
              ...state,
              loading: true,
              error: null
            };
            render();
            send("toggleOnlyLz", { page: 1, onlyLz: true });
            return;
          }

          const restorePage = state.lastFullPageBeforeOnlyLz || currentPage;
          state = {
            ...state,
            onlyLz: false,
            lastFullPageBeforeOnlyLz: null,
            loading: true,
            error: null
          };
          render();
          send("toggleOnlyLz", { page: restorePage, onlyLz: false });
          return;
        }
        if (action === "backToTop") {
          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });
        }
        if (action === "closeLightbox") {
          state.lightboxSrc = null;
          render();
        }
      });
    });

    app.querySelectorAll(".post-content img:not(.tieba-emoji)").forEach((element) => {
      element.classList.add("thumb-image");
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const src = element.getAttribute("src");
        if (!src) {
          return;
        }
        state.lightboxSrc = src;
        render();
      });
    });

    app.querySelectorAll("[data-toggle-comments]").forEach((element) => {
      element.addEventListener("click", () => {
        const postId = element.getAttribute("data-toggle-comments");
        if (!postId) {
          return;
        }

        const nextExpanded = !state.expandedComments[postId];
        state.expandedComments = {
          ...state.expandedComments,
          [postId]: nextExpanded
        };

        if (nextExpanded) {
          const loadedState = state.postComments[postId];
          if (!loadedState?.items?.length) {
            send("loadPostComments", { postId, page: 1 });
          }
        }

        render();
      });
    });

    app.querySelectorAll("[data-comments-page]").forEach((element) => {
      element.addEventListener("click", () => {
        const raw = element.getAttribute("data-comments-page");
        if (!raw) {
          return;
        }

        const [postId, pageText] = raw.split(":");
        const page = Number.parseInt(pageText || "", 10);
        if (!postId || !Number.isFinite(page) || page <= 0) {
          return;
        }

        send("loadPostComments", { postId, page });
      });
    });

    const jumpInput = app.querySelector("[data-role='pageJumpInput']");
    if (jumpInput) {
      jumpInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
          return;
        }

        event.preventDefault();
        const jumpButton = app.querySelector("[data-action='jumpPage']");
        jumpButton?.click();
      });
    }
  }

  function updateBackToTopVisibility() {
    const nextValue = window.scrollY > 360;
    if (state.showBackToTop === nextValue) {
      return;
    }

    state = {
      ...state,
      showBackToTop: nextValue
    };
    render();
  }

  window.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type === "setLoading") {
      state = { ...state, loading: true, error: null };
      render();
      return;
    }
    if (type === "threadLoaded") {
      const nextSettings = state.detail
        ? {
            ...payload.settings,
            showImages: state.settings.showImages
          }
        : {
            ...payload.settings,
            showImages: true
          };
      state = {
        ...state,
        loading: false,
        error: null,
        detail: payload,
        onlyLz: !!payload.onlyLz,
        favorite: payload.favorite,
        lastFullPageBeforeOnlyLz: payload.onlyLz ? state.lastFullPageBeforeOnlyLz : null,
        expandedComments: {},
        postComments: {},
        lightboxSrc: null,
        showBackToTop: false,
        settings: nextSettings
      };
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (type === "threadError") {
      const nextSettings = state.detail
        ? {
            ...payload.settings,
            showImages: state.settings.showImages
          }
        : {
            ...payload.settings,
            showImages: true
          };
      state = {
        ...state,
        loading: false,
        error: payload,
        detail: null,
        lightboxSrc: null,
        showBackToTop: false,
        settings: nextSettings
      };
      render();
      return;
    }
    if (type === "settingsChanged") {
      state = {
        ...state,
        settings: payload
      };
      render();
      return;
    }
    if (type === "favoriteChanged") {
      state = {
        ...state,
        favorite: payload.favorite
      };
      render();
      return;
    }
    if (type === "postCommentsLoading") {
      state = {
        ...state,
        postComments: {
          ...state.postComments,
          [payload.postId]: {
            ...state.postComments[payload.postId],
            loading: true,
            error: null,
            page: payload.page || state.postComments[payload.postId]?.page || 1,
            items: state.postComments[payload.postId]?.items || []
          }
        }
      };
      render();
      return;
    }
    if (type === "postCommentsLoaded") {
      state = {
        ...state,
        postComments: {
          ...state.postComments,
          [payload.postId]: {
            loading: false,
            error: null,
            page: payload.page || 1,
            pageCount: payload.pageCount || 1,
            hasPrev: !!payload.hasPrev,
            hasMore: !!payload.hasMore,
            total: payload.total,
            items: payload.items
          }
        }
      };
      render();
      return;
    }
    if (type === "postCommentsError") {
      state = {
        ...state,
        postComments: {
          ...state.postComments,
          [payload.postId]: {
            loading: false,
            error: payload.message,
            page: state.postComments[payload.postId]?.page || 1,
            pageCount: state.postComments[payload.postId]?.pageCount || 1,
            hasPrev: state.postComments[payload.postId]?.hasPrev || false,
            hasMore: state.postComments[payload.postId]?.hasMore || false,
            total: state.postComments[payload.postId]?.total || 0,
            items: state.postComments[payload.postId]?.items || []
          }
        }
      };
      render();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.lightboxSrc) {
      state.lightboxSrc = null;
      render();
    }
  });
  window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });

  render();
  send("ready");
})();
