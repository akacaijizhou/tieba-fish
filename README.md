# Tieba Fish

一个在 VS Code 里低打扰浏览百度贴吧的扩展骨架。

## 当前能力

- Activity Bar 侧边栏入口
- 关注吧 / 最新 / 历史 三个视图
- 最新视图会承接你最近一次点开的关注吧数据，显示该吧最近一次加载的帖子列表，并支持简单翻页
- 论坛列表面板
- 帖子阅读面板
- 收藏与历史记录本地持久化
- 图片显示开关
- 老板键
- `aiotieba` Python bridge 优先读取贴吧结构化数据
- 贴吧登录态导入与复用
- 贴吧 Cookie 安全存储与登录态复用
- 抓取失败时回退到浏览器 / VS Code Simple Browser

## 已知限制

- 现在的主路径是 `TypeScript extension + Python aiotieba bridge`。如果本机没有可用的 Python 环境或 `aiotieba` 依赖，扩展会自动回退到网页抓取。
- 贴吧当前对直接 HTTP 抓取有较强的安全校验，所以网页抓取仍然只适合作为兜底。

## 导入登录态

在命令面板执行：

- `导入贴吧登录态`
- `从剪贴板导入贴吧登录态`
- `清除贴吧登录态`

登录态会保存到 VS Code Secret Storage，不会写进普通设置。导入后，扩展会优先通过 `aiotieba` 读取结构化帖子和楼层数据。

推荐直接粘贴浏览器里复制的完整贴吧 Cookie，扩展会自动提取 `BDUSS / STOKEN`，并同时保存 Cookie 给网页回退路径复用。也兼容直接粘贴 `BDUSS`。

如果只导入 `BDUSS`，普通阅读仍可继续使用，但“同步我关注的贴吧”这类功能仍需要包含 `STOKEN` 的完整 Cookie。

## Cookie 兜底登录态

在命令面板执行：

- `配置贴吧 Cookie`
- `清除贴吧 Cookie`

Cookie 会保存到 VS Code Secret Storage，不会写进普通设置。它主要用于网页抓取回退路径。

## 安装 aiotieba bridge 依赖

推荐先准备好可用的 Python，然后直接安装预编译包：

```powershell
python -m pip install aiotieba
```

如果你的 Python 命令不是 `python`，可以在 VS Code 设置里修改 `tieba.pythonPath`，例如设成 `py` 或具体解释器绝对路径。

如果你确实要直接调试项目里的 `aiotieba-master` 源码，再执行：

```powershell
python -m pip install -e .\aiotieba-master
```

这条命令在 Windows 上通常还需要额外安装 CMake 和 Visual Studio Build Tools（至少要有 `nmake` / MSVC 工具链）。

## 本地运行

```powershell
npm install
npm run compile
```

然后在 VS Code 里按 `F5` 启动 Extension Development Host。
