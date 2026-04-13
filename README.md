# Tieba Fish

一个在 VS Code 里低打扰浏览百度贴吧的扩展骨架。

## 当前能力

- Activity Bar 侧边栏入口
- 关注吧 / 最新 / 收藏 / 历史 四个视图
- 最新视图会承接你最近一次点开的贴吧数据，并支持简单翻页
- 论坛列表面板
- 帖子阅读面板
- 收藏与历史记录本地持久化
- 图片显示开关
- 老板键
- `aiotieba` Python bridge 优先读取贴吧结构化数据
- `BDUSS / STOKEN` 安全存储与登录态复用
- 贴吧 Cookie 安全存储与登录态复用
- 抓取失败时回退到浏览器 / VS Code Simple Browser

## 已知限制

- 现在的主路径是 `TypeScript extension + Python aiotieba bridge`。如果本机没有可用的 Python 环境或 `aiotieba` 依赖，扩展会自动回退到网页抓取。
- 贴吧当前对直接 HTTP 抓取有较强的安全校验，所以网页抓取仍然只适合作为兜底。

## 账号登录态

在命令面板执行：

- `Tieba: 配置贴吧账号 (BDUSS/STOKEN)`
- `Tieba: 清除贴吧账号`

账号凭据会保存到 VS Code Secret Storage，不会写进普通设置。配置后，扩展会优先通过 `aiotieba` 读取结构化帖子和楼层数据。

`BDUSS` 必填，`STOKEN` 选填。输入框支持两种形式：

- 直接粘贴 `BDUSS` / `STOKEN` 的值
- 直接粘贴整段贴吧 Cookie，扩展会自动提取 `BDUSS` / `STOKEN`

## Cookie 兜底登录态

在命令面板执行：

- `Tieba: 配置贴吧 Cookie`
- `Tieba: 清除贴吧 Cookie`

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
