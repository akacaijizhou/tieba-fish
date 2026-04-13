from __future__ import annotations

import asyncio
import html
import json
import logging
import math
import pathlib
import sys
from dataclasses import is_dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote, urlsplit

logging.basicConfig(level=logging.CRITICAL)
logging.disable(logging.CRITICAL)

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCAL_AIOTIEBA_PATH = ROOT / "aiotieba-master"

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def fail(code: str, message: str, details: str | None = None) -> None:
    emit(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
                "details": details,
            },
        }
    )


def load_request() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("bridge stdin is empty")
    return json.loads(raw)


def build_forum_url(forum_name: str, page: int) -> str:
    pn = max(0, page - 1) * 50
    return f"https://tieba.baidu.com/f?kw={quote(forum_name)}&pn={pn}"


def build_thread_url(thread_id: str | int, page: int, only_lz: bool = False) -> str:
    return f"https://tieba.baidu.com/p/{quote(str(thread_id))}?pn={page}{'&see_lz=1' if only_lz else ''}"


def ensure_aiotieba_import() -> Any:
    try:
        import aiotieba as tb  # type: ignore
        silence_aiotieba_logger(tb)
        return tb
    except ModuleNotFoundError as error:
        missing = error.name or "unknown dependency"
        if missing != "aiotieba":
            raise RuntimeError(
                "当前 Python 环境里的 aiotieba 安装不完整。"
                f"缺少依赖：{missing}。"
                "请重新执行 `python -m pip install --upgrade --only-binary=:all: aiotieba`。"
            ) from error

        if not should_try_local_aiotieba():
            raise RuntimeError(
                "当前没有安装 aiotieba。"
                "请先在插件里执行“安装 aiotieba”，或手动运行 "
                "`python -m pip install --upgrade --only-binary=:all: aiotieba`。"
            ) from error
    except Exception as error:  # pragma: no cover
        raise RuntimeError(f"导入 aiotieba 失败：{error}") from error

    if str(LOCAL_AIOTIEBA_PATH) not in sys.path:
        sys.path.insert(0, str(LOCAL_AIOTIEBA_PATH))

    try:
        import aiotieba as tb  # type: ignore
        silence_aiotieba_logger(tb)
    except ModuleNotFoundError as error:
        missing = error.name or "unknown dependency"
        raise RuntimeError(
            "开发模式下未能导入本地 aiotieba 源码。"
            "请先执行 `python -m pip install --upgrade --only-binary=:all: aiotieba`；"
            "如果你明确要直接跑本地源码，再装好 C/C++ 构建链后执行 "
            "`python -m pip install -e .\\aiotieba-master`。"
            f"当前缺少依赖：{missing}。"
        ) from error
    except Exception as error:  # pragma: no cover
        raise RuntimeError(f"导入 aiotieba 失败：{error}") from error

    return tb


def silence_aiotieba_logger(tb: Any) -> None:
    try:
        logger = logging.getLogger("tieba-bridge")
        logger.handlers.clear()
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
        tb.logging.set_logger(logger)
    except Exception:
        pass


def should_try_local_aiotieba() -> bool:
    return (ROOT / ".git").exists() and LOCAL_AIOTIEBA_PATH.exists()


def normalize_title(title: str, fallback_text: str, thread_id: int | str) -> str:
    cleaned = (title or "").strip()
    if cleaned:
        return cleaned

    for line in fallback_text.splitlines():
        line = line.strip()
        if line:
            return line[:80]

    return f"帖子 {thread_id}"


def summarize(text: str, limit: int = 120) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 1]}…"


def format_time_label(timestamp: int) -> str | None:
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M")


def escape_text(value: str) -> str:
    return html.escape(value, quote=True).replace("\n", "<br/>")


def safe_url(value: Any) -> str:
    return html.escape(normalize_remote_url(value), quote=True)


def normalize_remote_url(value: Any) -> str:
    text = str(value)
    if text.startswith("http://"):
        host = urlsplit(text).hostname or ""
        if host.endswith("static.tieba.baidu.com"):
            return text
        return "https://" + text[len("http://") :]
    return text


def build_emoji_url(emoji_id: Any) -> str | None:
    normalized = str(emoji_id or "").strip()
    if not normalized:
        return None

    if not all(char.isalnum() or char in {"_", "-"} for char in normalized):
        return None

    # Legacy Tieba "呵呵" emoji uses the bare id but the actual asset is numbered.
    if normalized == "image_emoticon":
        normalized = "image_emoticon1"

    return f"http://static.tieba.baidu.com/tb/editor/images/client/{quote(normalized)}.png"


def flush_inline_buffer(blocks: list[str], inline_parts: list[str]) -> None:
    if not inline_parts:
        return
    blocks.append(f"<p>{''.join(inline_parts)}</p>")
    inline_parts.clear()


def render_contents(contents: Any, sign: str = "") -> dict[str, Any]:
    blocks: list[str] = []
    inline_parts: list[str] = []
    image_urls: list[str] = []
    text_parts: list[str] = []

    for fragment in getattr(contents, "objs", []) or []:
        class_name = fragment.__class__.__name__.lower()

        if hasattr(fragment, "raw_url") and hasattr(fragment, "title"):
            url = safe_url(getattr(fragment, "url", getattr(fragment, "raw_url", "")))
            label = str(getattr(fragment, "title", "") or getattr(fragment, "text", "") or url)
            inline_parts.append(f'<a href="{url}">{escape_text(label)}</a>')
            text_parts.append(label)
            continue

        if hasattr(fragment, "user_id") and hasattr(fragment, "text"):
            text = str(getattr(fragment, "text", ""))
            inline_parts.append(f"<span>{escape_text(text)}</span>")
            text_parts.append(text)
            continue

        if hasattr(fragment, "desc") and hasattr(fragment, "id"):
            desc = str(getattr(fragment, "desc", "") or "[表情]")
            emoji_url = build_emoji_url(getattr(fragment, "id", ""))
            if emoji_url:
                inline_parts.append(
                    f'<img class="tieba-emoji" src="{safe_url(emoji_url)}" alt="{escape_text(desc)}" title="{escape_text(desc)}" />'
                )
            else:
                inline_parts.append(f"<span>{escape_text(desc)}</span>")
            text_parts.append(desc)
            continue

        if hasattr(fragment, "text") and hasattr(fragment, "url") and not hasattr(fragment, "raw_url"):
            url = safe_url(fragment.url)
            label = str(getattr(fragment, "text", "") or url)
            inline_parts.append(f'<a href="{url}">{escape_text(label)}</a>')
            text_parts.append(label)
            continue

        if hasattr(fragment, "origin_src") and hasattr(fragment, "src"):
            flush_inline_buffer(blocks, inline_parts)
            image_url = getattr(fragment, "origin_src", "") or getattr(fragment, "big_src", "") or getattr(fragment, "src", "")
            if image_url:
                image_urls.append(normalize_remote_url(image_url))
                blocks.append(f'<img src="{safe_url(image_url)}" alt="Tieba image" loading="lazy" />')
            continue

        if "video" in class_name and hasattr(fragment, "src"):
            flush_inline_buffer(blocks, inline_parts)
            label = f"[视频] {getattr(fragment, 'duration', 0)}s"
            blocks.append(f'<p><a href="{safe_url(fragment.src)}">{escape_text(label)}</a></p>')
            cover_src = getattr(fragment, "cover_src", "")
            if cover_src:
                blocks.append(f'<img src="{safe_url(cover_src)}" alt="Tieba video cover" loading="lazy" />')
            text_parts.append(label)
            continue

        if "voice" in class_name and hasattr(fragment, "duration"):
            flush_inline_buffer(blocks, inline_parts)
            duration = int(getattr(fragment, "duration", 0) or 0)
            label = f"[语音] {duration} 秒"
            blocks.append(f'<p class="subtle">{escape_text(label)}</p>')
            text_parts.append(label)
            continue

        if hasattr(fragment, "text"):
            text = str(getattr(fragment, "text", ""))
            inline_parts.append(escape_text(text))
            text_parts.append(text)
            continue

        if is_dataclass(fragment):
            text = str(fragment)
            inline_parts.append(escape_text(text))
            text_parts.append(text)

    flush_inline_buffer(blocks, inline_parts)

    if sign.strip():
        blocks.append(f'<p class="subtle">{escape_text(sign.strip())}</p>')
        text_parts.append(sign.strip())

    if not blocks:
        blocks.append('<p class="subtle">[内容为空]</p>')

    return {
        "html": "".join(blocks),
        "text": "".join(text_parts).strip(),
        "imageUrls": image_urls,
    }


def author_name(user: Any, fallback_author_id: int | None = None) -> str:
    if user:
        value = getattr(user, "show_name", "") or getattr(user, "user_name", "") or getattr(user, "nick_name", "")
        if value:
            return str(value)
        user_id = getattr(user, "user_id", 0)
        if user_id:
            return str(user_id)
    if fallback_author_id:
        return str(fallback_author_id)
    return "未知用户"


def author_id_value(user: Any, fallback_author_id: int | None = None) -> str | None:
    user_id = getattr(user, "user_id", 0) if user else 0
    if user_id:
        return str(user_id)
    if fallback_author_id:
        return str(fallback_author_id)
    return None


def handle_health_check(tb: Any) -> dict[str, Any]:
    module_file = pathlib.Path(getattr(tb, "__file__", "")).resolve() if getattr(tb, "__file__", "") else None
    module_path = str(module_file) if module_file else ""
    load_mode = "installed"

    if module_file:
        try:
            module_file.relative_to(LOCAL_AIOTIEBA_PATH.resolve())
            load_mode = "local"
        except ValueError:
            load_mode = "installed"

    return {
        "available": True,
        "version": str(getattr(tb, "__version__", "") or ""),
        "modulePath": module_path,
        "loadMode": load_mode,
    }


def map_thread_summary(thread: Any, forum_name: str) -> dict[str, Any]:
    content_text = getattr(getattr(thread, "contents", None), "text", "") or ""
    thread_id = getattr(thread, "tid")
    last_time = getattr(thread, "last_time", 0)

    return {
        "threadId": str(thread_id),
        "forumName": forum_name,
        "title": normalize_title(getattr(thread, "title", ""), content_text, thread_id),
        "authorName": author_name(getattr(thread, "user", None), getattr(thread, "author_id", 0)),
        "replyCount": int(getattr(thread, "reply_num", 0)),
        "lastReplyAt": int(last_time * 1000) if last_time else None,
        "lastReplyLabel": format_time_label(last_time),
        "excerpt": summarize(content_text),
        "isTop": bool(getattr(thread, "is_top", False)),
        "isGood": bool(getattr(thread, "is_good", False)),
        "url": build_thread_url(thread_id, 1),
    }


def map_comment_preview(post: Any) -> dict[str, Any] | None:
    comments = getattr(post, "comments", []) or []
    reply_num = int(getattr(post, "reply_num", 0))
    if not comments and reply_num <= 0:
        return None

    items = []
    for comment in comments[:3]:
        rendered = render_contents(getattr(comment, "contents", None))
        items.append(
            {
                "authorName": author_name(getattr(comment, "user", None), getattr(comment, "author_id", 0)),
                "contentHtml": rendered["html"],
                "contentText": getattr(comment, "text", "") or rendered["text"],
                "isLz": bool(getattr(comment, "is_thread_author", False)),
            }
        )

    return {
        "total": reply_num or len(comments),
        "items": items,
    }


def map_post(post: Any) -> dict[str, Any]:
    rendered = render_contents(getattr(post, "contents", None), getattr(post, "sign", ""))
    created_at = int(getattr(post, "create_time", 0) or 0)
    return {
        "postId": str(getattr(post, "pid")),
        "floor": int(getattr(post, "floor", 0) or 0),
        "authorName": author_name(getattr(post, "user", None), getattr(post, "author_id", 0)),
        "authorId": author_id_value(getattr(post, "user", None), getattr(post, "author_id", 0)),
        "createdAt": created_at * 1000 if created_at else None,
        "createdAtLabel": format_time_label(created_at),
        "contentHtml": rendered["html"],
        "contentText": getattr(post, "text", "") or rendered["text"],
        "imageUrls": rendered["imageUrls"],
        "quoteBlocks": [],
        "commentsPreview": map_comment_preview(post),
        "isLz": bool(getattr(post, "is_thread_author", False)),
    }


def map_comment(comment: Any) -> dict[str, Any]:
    created_at = int(getattr(comment, "create_time", 0) or 0)
    rendered = render_contents(getattr(comment, "contents", None))
    return {
        "authorName": author_name(getattr(comment, "user", None)),
        "authorId": author_id_value(getattr(comment, "user", None)),
        "contentHtml": rendered["html"],
        "contentText": getattr(comment, "text", "") or rendered["text"],
        "createdAt": created_at * 1000 if created_at else None,
        "createdAtLabel": format_time_label(created_at),
        "isLz": bool(getattr(comment, "is_thread_author", False)),
    }


async def handle_get_forum_threads(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    payload = request["payload"]
    auth = request["auth"]
    forum_name = str(payload["forumName"])
    page = max(1, int(payload.get("page", 1)))

    async with tb.Client(auth.get("bduss", ""), auth.get("stoken", "")) as client:
        threads = await client.get_threads(forum_name, page)

    resolved_forum_name = getattr(getattr(threads, "forum", None), "fname", "") or forum_name
    current_page = int(getattr(getattr(threads, "page", None), "current_page", 0) or page)
    total_page = int(getattr(getattr(threads, "page", None), "total_page", 0) or 0)

    return {
        "forumName": resolved_forum_name,
        "page": current_page,
        "pageCount": total_page or None,
        "threads": [map_thread_summary(thread, resolved_forum_name) for thread in threads],
        "sourceUrl": build_forum_url(resolved_forum_name, current_page),
    }


async def handle_get_thread_detail(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    payload = request["payload"]
    auth = request["auth"]
    thread_id = int(payload["threadId"])
    page = max(1, int(payload.get("page", 1)))
    only_lz = bool(payload.get("onlyLz"))

    async with tb.Client(auth.get("bduss", ""), auth.get("stoken", "")) as client:
        with_comments = bool(auth.get("bduss"))
        try:
            posts = await client.get_posts(
                thread_id,
                page,
                with_comments=with_comments,
                comment_rn=3,
                only_thread_author=only_lz,
            )
        except Exception:
            if not with_comments:
                raise
            posts = await client.get_posts(thread_id, page, with_comments=False, only_thread_author=only_lz)

    thread = getattr(posts, "thread", None)
    forum = getattr(posts, "forum", None)
    page_info = getattr(posts, "page", None)
    thread_contents = getattr(thread, "contents", None)
    fallback_text = getattr(thread_contents, "text", "") or ""
    thread_title = normalize_title(getattr(thread, "title", ""), fallback_text, thread_id)
    thread_author_id = getattr(thread, "author_id", 0)

    reply_count = int(getattr(thread, "reply_num", 0) or 0)
    if not only_lz and not getattr(page_info, "total_page", 0) and reply_count:
        total_page = math.ceil(max(1, reply_count) / 30)
    else:
        total_page = int(getattr(page_info, "total_page", 0) or 0)

    return {
        "threadId": str(getattr(thread, "tid", thread_id)),
        "title": thread_title,
        "forumName": getattr(forum, "fname", "") or payload.get("forumName") or "贴吧",
        "threadAuthorName": author_name(getattr(thread, "user", None), thread_author_id),
        "threadAuthorId": author_id_value(getattr(thread, "user", None), thread_author_id),
        "page": int(getattr(page_info, "current_page", 0) or page),
        "pageCount": total_page or None,
        "onlyLz": only_lz,
        "posts": [map_post(post) for post in posts],
        "sourceUrl": build_thread_url(thread_id, int(getattr(page_info, "current_page", 0) or page), only_lz),
    }


async def handle_get_post_comments(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    payload = request["payload"]
    auth = request["auth"]
    thread_id = int(payload["threadId"])
    post_id = int(payload["postId"])
    page = max(1, int(payload.get("page", 1)))

    async with tb.Client(auth.get("bduss", ""), auth.get("stoken", "")) as client:
        comments = await client.get_comments(thread_id, post_id, page)

    page_info = getattr(comments, "page", None)
    total = int(getattr(page_info, "total_count", 0) or len(comments))
    current_page = int(getattr(page_info, "current_page", 0) or page)
    total_page = int(getattr(page_info, "total_page", 0) or 0)
    return {
        "postId": str(post_id),
        "page": current_page,
        "pageCount": total_page or None,
        "hasPrev": bool(getattr(page_info, "has_prev", False)),
        "hasMore": bool(getattr(page_info, "has_more", False)),
        "total": total,
        "items": [map_comment(comment) for comment in comments],
    }


async def handle_resolve_forum_names(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    payload = request["payload"]
    auth = request["auth"]
    raw_names = payload.get("names", []) or []

    names: list[str] = []
    for value in raw_names[:8]:
        candidate = str(value).strip()
        if candidate and candidate not in names:
            names.append(candidate)

    if not names:
        return {"names": []}

    resolved: list[str] = []
    async with tb.Client(auth.get("bduss", ""), auth.get("stoken", "")) as client:
        for name in names:
            try:
                forum = await client.get_forum(name)
            except Exception:
                continue

            forum_name = str(getattr(forum, "fname", "") or "").strip()
            forum_id = int(getattr(forum, "fid", 0) or 0)
            if not forum_name or forum_id <= 0:
                continue

            if forum_name not in resolved:
                resolved.append(forum_name)

    return {"names": resolved}


async def handle_get_self_follow_forums_all(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    auth = request["auth"]
    stoken = str(auth.get("stoken", "") or "").strip()
    if not stoken:
        raise RuntimeError("同步我关注的贴吧需要 STOKEN。请重新配置贴吧账号，或粘贴包含 STOKEN 的完整 Cookie。")

    page_size = max(1, min(200, int(request.get("payload", {}).get("pageSize", 200) or 200)))
    forums: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    page = 1

    async with tb.Client(auth.get("bduss", ""), stoken) as client:
        while True:
            response = await client.get_self_follow_forums(page, rn=page_size)
            for forum in response:
                forum_name = str(getattr(forum, "fname", "") or "").strip()
                if not forum_name or forum_name in seen_names:
                    continue

                seen_names.add(forum_name)
                forum_id = int(getattr(forum, "fid", 0) or 0)
                forums.append(
                    {
                        "forumId": str(forum_id) if forum_id > 0 else None,
                        "forumName": forum_name,
                        "level": int(getattr(forum, "level", 0) or 0),
                        "isSigned": bool(getattr(forum, "is_signed", False)),
                    }
                )

            if not bool(getattr(response, "has_more", False)):
                break

            page += 1

    return {"forums": forums}


async def dispatch(tb: Any, request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    if action == "healthCheck":
        return handle_health_check(tb)
    if action == "getForumThreads":
        return await handle_get_forum_threads(tb, request)
    if action == "getThreadDetail":
        return await handle_get_thread_detail(tb, request)
    if action == "getPostComments":
        return await handle_get_post_comments(tb, request)
    if action == "resolveForumNames":
        return await handle_resolve_forum_names(tb, request)
    if action == "getSelfFollowForumsAll":
        return await handle_get_self_follow_forums_all(tb, request)
    raise ValueError(f"unsupported action: {action}")


async def main() -> None:
    try:
        request = load_request()
    except Exception as error:
        fail("parse", f"bridge 输入解析失败：{error}")
        return

    try:
        tb = ensure_aiotieba_import()
    except Exception as error:
        fail("bridge", str(error))
        return

    try:
        result = await dispatch(tb, request)
    except Exception as error:
        fail("network", f"aiotieba 请求失败：{error}", repr(error))
        return

    emit({"ok": True, "result": result})


if __name__ == "__main__":
    asyncio.run(main())
