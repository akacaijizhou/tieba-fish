# Tieba Fish

在 VS Code 里低打扰地浏览百度贴吧。

这个插件不是把贴吧网页直接塞进编辑器，而是优先把帖子、楼层和楼中楼拉成结构化数据，再用更轻的阅读器样式重新排版。目标很明确：降低视觉存在感，适合在工作流里顺手看帖。

## 目录

- [项目定位](#项目定位)
- [当前能力](#当前能力)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [常用命令](#常用命令)
- [老板模式](#老板模式)
- [数据来源与架构](#数据来源与架构)
- [常见问题](#常见问题)
- [本地开发](#本地开发)
- [文档与路线图](#文档与路线图)
- [已知限制](#已知限制)

## 项目定位

- 主定位是 `贴吧阅读器`，不是完整贴吧客户端。
- 主路径优先使用 `Python + aiotieba bridge` 获取结构化数据。
- 获取失败时，再回退到网页抓取和浏览器打开。
- UI 重点是低打扰、正文优先、减少“摸鱼感”暴露。

## 当前能力

- `Tieba` Activity Bar 入口
- `关注吧 / 最新 / 历史` 三个原生 TreeView
- `最新` 视图承接最近一次打开的关注吧帖子列表，并支持刷新和翻页
- 帖子阅读器 Webview，支持正文、图片、楼中楼、楼中楼分页
- `只看楼主`
- 图片缩略图 + 点击查看大图
- 正文底部跳页
- 回到顶部
- `继续阅读`
- `浏览指定链接`
- `同步我关注的贴吧`
- `Ctrl+Alt+X` 老板模式
- 首次引导
- 环境诊断
- 有 Python 时可一键安装 `aiotieba`
- 贴吧登录态导入和 Secret Storage 安全存储

## 系统要求

- VS Code `1.90.0+`
- Node.js `18+`，用于本地开发和打包
- 推荐安装 Python `3.10+`
- 推荐安装 `aiotieba`

没有 Python 也能部分使用插件，但会更依赖网页回退，稳定性明显差一些。

## 快速开始

### 1. 本地运行

```powershell
npm install
npm run compile
```

然后在 VS Code 里按 `F5` 启动 `Extension Development Host`。

### 2. 准备 Python 环境

如果机器上已经有 Python，插件里可以直接执行：

- `安装 aiotieba`

如果机器上没有 Python，可以先执行：

- `下载 Python`

装好后再回到插件里执行 `安装 aiotieba`。

如果你的 Python 命令不是 `python`，可以在设置里修改：

- `tieba.pythonPath`

例如设成 `py` 或者某个解释器的绝对路径。

### 3. 导入贴吧登录态

命令面板支持：

- `导入贴吧登录态`
- `从剪贴板导入贴吧登录态`
- `清除贴吧登录态`

推荐直接粘贴浏览器里复制的完整贴吧 Cookie。插件会自动提取：

- `BDUSS`
- `STOKEN`

并把完整 Cookie 一起保存在 VS Code Secret Storage 里，供网页回退链路复用。

### 4. 开始浏览

建议第一次这样走：

1. 导入贴吧登录态
2. 同步我关注的贴吧，或者手动添加一个吧
3. 打开一个关注吧
4. 点开帖子进入正文阅读

## 常用命令

命令面板里常用的几项：

- `添加贴吧`
- `同步我关注的贴吧`
- `浏览指定链接`
- `继续阅读`
- `导入贴吧登录态`
- `从剪贴板导入贴吧登录态`
- `清除贴吧登录态`
- `打开环境诊断`
- `打开首次引导`
- `安装 aiotieba`
- `下载 Python`
- `重置首次引导并重载`
- `老板键`

## 老板模式

快捷键：

```text
Ctrl+Alt+X
```

行为：

- 第一次按下时，Tieba 视图会切换成伪造文件树
- 打开的贴吧 Webview 会被收起
- 编辑器里会打开伪造代码文件
- 第二次按下时，恢复 Tieba 视图和之前的帖子会话

当前版本已经支持页码级恢复，但还没有做到精确滚动位置恢复。

## 数据来源与架构

当前数据链路：

1. `TypeScript VS Code Extension`
2. `Python bridge`
3. `aiotieba`
4. 回退到 `HTML 抓取 / 浏览器打开`

这样做的原因很直接：

- 网页直抓容易被贴吧风控打断
- `aiotieba` 能直接提供结构化帖子、楼层和楼中楼数据
- Webview 只负责展示，扩展侧负责请求和状态管理

## 常见问题

### 已经能看帖子了，为什么“同步我关注的贴吧”还失败？

通常是因为只导入了 `BDUSS`，没有 `STOKEN`。

普通阅读很多时候只靠 `BDUSS` 就能继续，但“同步我关注的贴吧”需要完整登录态。最稳的做法还是直接导入整段 Cookie。

### 没有 Python 能不能直接用？

可以部分用，但不是最佳路径。

- 有 Python + `aiotieba`：优先走结构化数据
- 没有 Python：更多依赖网页回退

插件已经提供：

- `下载 Python`
- `安装 aiotieba`
- `打开环境诊断`

### 安装 aiotieba 时提示缺少 `cryptography` 或跳到 `cmake` 编译，怎么办？

这通常不是贴吧接口问题，而是 Python 依赖没装完整，或者误走了本地源码编译路径。

普通用户不要执行：

```powershell
python -m pip install -e .\aiotieba-master
```

正确做法是直接安装 PyPI 上的预编译包：

```powershell
python -m pip install --upgrade pip
python -m pip install --upgrade --only-binary=:all: aiotieba
```

如果你是插件用户而不是开发者，看到 `aiotieba-master` 相关提示时，可以直接忽略本地源码那条说明。

### 为什么有时还是会打开浏览器？

因为贴吧网页和部分接口存在安全校验。当前产品策略不是强绕过，而是：

- 优先走 `aiotieba`
- 失败时给用户一个稳定的回退路径

### 登录态会不会被上传？

不会。当前实现使用 VS Code Secret Storage 本地保存登录态，不会写入普通设置文件。

## 本地开发

### 安装依赖

```powershell
npm install
python -m pip install aiotieba
```

### 编译

```powershell
npm run compile
```

### 调试

在当前工程按 `F5`，会打开一个新的 `Extension Development Host`。

### 直接调试本地 aiotieba 源码

如果你确实要调试仓库里的 `aiotieba-master`：

```powershell
python -m pip install -e .\aiotieba-master
```

这条链路在 Windows 上通常还需要额外准备 CMake 和 Visual Studio Build Tools。

## 文档与路线图

- 产品路线图：[docs/tieba-product-roadmap.md](./docs/tieba-product-roadmap.md)
- 开发执行清单：[docs/tieba-development-backlog.md](./docs/tieba-development-backlog.md)
- Reader Mode 规划：[docs/tieba-reader-mode-plan.md](./docs/tieba-reader-mode-plan.md)
- `aiotieba` 研究记录：[docs/aiotieba-research.md](./docs/aiotieba-research.md)

## 已知限制

- 当前最佳体验仍然依赖本机 Python 环境。
- 贴吧网页路径会遇到风控和安全校验，所以网页抓取只能作为兜底。
- `只看楼主` 目前是“切到第一页后的单页筛选阅读态”，不是独立的数据层分页模式。
- 老板模式当前优先保证切换速度和可恢复性，不追求和真实 IDE 100% 一致。
