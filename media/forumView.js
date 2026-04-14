(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const bootstrap = window.__TIEBA_BOOTSTRAP__ || {};

  let state = {
    forumName: bootstrap.forumName || "",
    page: 1,
    pageCount: undefined,
    threads: [],
    loading: true,
    loadingMessage: "正在打开贴吧...",
    error: null,
    settings: {
      themePreset: "default"
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
    document.body.dataset.themePreset = state.settings.themePreset || "default";
  }

  function renderBadges(thread) {
    const badges = [];
    if (thread.isTop) {
      badges.push('<span class="tag">置顶</span>');
    }
    if (thread.isGood) {
      badges.push('<span class="tag">精华</span>');
    }
    return badges.join("");
  }

  function renderFeedback(kind, message) {
    if (!message) {
      return "";
    }

    return `
      <div class="feedback-strip ${kind === "error" ? "is-error" : "is-loading"}">
        ${kind === "loading" ? '<span class="loading-spinner" aria-hidden="true"></span>' : ""}
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function renderThreadRow(thread) {
    const activity = [thread.lastReplyAuthor, thread.lastReplyLabel].filter(Boolean).join(" · ");
    return `
      <article class="thread-row" data-thread-id="${escapeHtml(thread.threadId)}">
        <div class="thread-title-line">
          ${renderBadges(thread)}
          <h3 class="thread-title">${escapeHtml(thread.title)}</h3>
        </div>
        <div class="thread-meta">
          <span>${escapeHtml(thread.authorName)}</span>
          <span>回复 ${escapeHtml(thread.replyCount)}</span>
          ${thread.pageCount ? `<span>${escapeHtml(thread.pageCount)} 页</span>` : ""}
          ${activity ? `<span>${escapeHtml(activity)}</span>` : ""}
        </div>
        ${thread.excerpt ? `<div class="thread-summary">${escapeHtml(thread.excerpt)}</div>` : ""}
      </article>
    `;
  }

  function renderLoaded() {
    const feedback = state.loading
      ? renderFeedback("loading", state.loadingMessage || "正在加载帖子列表...")
      : state.error
        ? renderFeedback("error", state.error.message)
        : "";

    return `
      <section class="list-shell">
        ${feedback}
        <div class="simple-list">
          ${state.threads.length === 0
            ? `<section class="state">${
                state.page > 1
                  ? "这一页没有帖子，可以翻到别的页，或者回到上一页。"
                  : "这个吧当前没有拿到帖子列表，可以先刷新一次；如果还不行，再试浏览器回退。"
              }</section>`
            : state.threads.map(renderThreadRow).join("")}
        </div>
        <div class="footer-nav">
          <button class="button" data-action="prev"${state.page <= 1 || state.loading ? " disabled" : ""}>上一页</button>
          <div class="hint">点击帖子标题进入阅读页</div>
          <button class="button" data-action="next"${state.loading || (state.pageCount && state.page >= state.pageCount) ? " disabled" : ""}>下一页</button>
        </div>
      </section>
    `;
  }

  function renderError() {
    return `
      <section class="notice">
        <div class="notice-title">加载失败</div>
        <div class="hint">${escapeHtml(state.error.message)}</div>
        <div class="toolbar">
          <button class="button" data-action="refresh">重试</button>
          <button class="button" data-action="browser">VS Code 浏览器</button>
          <button class="button" data-action="external">系统浏览器</button>
        </div>
      </section>
    `;
  }

  function render() {
    applyBodySettings();
    const content = state.loading && state.threads.length === 0
      ? `<section class="state">${renderFeedback("loading", state.loadingMessage || "正在加载帖子列表...")}</section>`
      : state.error && state.threads.length === 0
        ? renderError()
        : renderLoaded();

    app.innerHTML = `
      <main class="panel">
        <header class="page-head">
          <div class="title-row">
            <div>
              <h1 class="page-title">${escapeHtml(state.forumName)}吧</h1>
              <div class="page-meta">第 ${escapeHtml(state.page)} 页${state.pageCount ? ` / ${escapeHtml(state.pageCount)}` : ""} · ${escapeHtml(state.threads.length)} 条</div>
            </div>
            <div class="toolbar">
              <button class="button" data-action="refresh"${state.loading ? " disabled" : ""}>刷新</button>
              <button class="button" data-action="browser">VS Code 浏览器</button>
              <button class="button" data-action="external">系统浏览器</button>
            </div>
          </div>
        </header>
        ${content}
      </main>
    `;

    app.querySelectorAll("[data-thread-id]").forEach((element) => {
      element.addEventListener("click", () => {
        const thread = state.threads.find((item) => item.threadId === element.getAttribute("data-thread-id"));
        if (thread) {
          send("openThread", thread);
        }
      });
    });

    app.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.getAttribute("data-action");
        if (action === "refresh") {
          send("refreshForum", { forumName: state.forumName, page: state.page });
        }
        if (action === "browser") {
          send("openInSimpleBrowser");
        }
        if (action === "external") {
          send("openExternal");
        }
        if (action === "prev" && state.page > 1) {
          send("loadForumPage", { forumName: state.forumName, page: state.page - 1 });
        }
        if (action === "next") {
          send("loadForumPage", { forumName: state.forumName, page: state.page + 1 });
        }
      });
    });
  }

  window.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type === "setLoading") {
      state = {
        ...state,
        loading: true,
        loadingMessage: payload.message || "正在加载帖子列表...",
        error: null
      };
      render();
      return;
    }
    if (type === "forumLoaded") {
      state = {
        ...state,
        loading: false,
        loadingMessage: "",
        error: null,
        forumName: payload.forumName,
        page: payload.page,
        pageCount: payload.pageCount,
        threads: payload.threads,
        settings: payload.settings || state.settings
      };
      render();
      return;
    }
    if (type === "forumError") {
      state = {
        ...state,
        loading: false,
        loadingMessage: "",
        error: payload,
        forumName: payload.forumName,
        settings: payload.settings || state.settings
      };
      render();
      return;
    }
    if (type === "settingsChanged") {
      state = {
        ...state,
        settings: {
          ...state.settings,
          ...payload
        }
      };
      render();
    }
  });

  render();
  send("ready", { forumName: state.forumName, page: 1 });
})();
