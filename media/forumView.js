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
    error: null
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
    return `
      <section class="list-shell">
        <div class="simple-list">
          ${state.threads.map(renderThreadRow).join("")}
        </div>
        <div class="footer-nav">
          <button class="button" data-action="prev"${state.page <= 1 ? " disabled" : ""}>上一页</button>
          <div class="hint">点击帖子标题进入阅读页</div>
          <button class="button" data-action="next"${state.pageCount && state.page >= state.pageCount ? " disabled" : ""}>下一页</button>
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
    const content = state.loading
      ? '<section class="state">正在加载帖子列表…</section>'
      : state.error
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
              <button class="button" data-action="refresh">刷新</button>
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
      state = { ...state, loading: true, error: null, page: payload.page };
      render();
      return;
    }
    if (type === "forumLoaded") {
      state = {
        ...state,
        loading: false,
        error: null,
        forumName: payload.forumName,
        page: payload.page,
        pageCount: payload.pageCount,
        threads: payload.threads
      };
      render();
      return;
    }
    if (type === "forumError") {
      state = {
        ...state,
        loading: false,
        error: payload,
        forumName: payload.forumName,
        page: payload.page
      };
      render();
    }
  });

  render();
  send("ready", { forumName: state.forumName, page: 1 });
})();
