# Tieba Fish 开发任务清单

## 1. 文档目标

这份文档是 [产品路线图](D:\companycode\tieba\docs\tieba-product-roadmap.md) 的执行层补充。

它只回答 4 个问题：

- 先做什么
- 每项要改哪里
- 验收标准是什么
- 哪些任务之间有依赖

默认按 `P0 -> P1 -> P2` 执行，不建议跳着做。

## 2. 当前执行策略

### 2.1 当前建议主线

先把产品推进顺序固定下来：

1. 收尾 `V0.2 可用性`
2. 打通 `V0.3 持续阅读`
3. 再增强 `V0.4 差异化`

### 2.2 当前不建议插队的事项

这些事情先不要插队：

- 发帖 / 回复
- 点赞 / 私信
- 新主题皮肤
- 更复杂的伪装模板
- 多账号系统

原因：

- 对主闭环帮助不大
- 容易引入额外风控和维护成本

### 2.3 需求归类规则

后续新需求先归到下面 6 类之一，再决定要不要进主线：

- `认知清晰`
  例：命令文案、空态说明、诊断提示
- `感知性能`
  例：加载提示、分页反馈、错误恢复提示
- `持续阅读`
  例：继续阅读、滚动恢复、未读状态、稍后看
- `阅读效率`
  例：快捷键、只看楼主、楼中楼分页、过滤
- `伪装能力`
  例：老板模式、假文件树、恢复稳定性
- `底层稳定性`
  例：bridge、缓存、fallback、登录态处理

一个需求如果无法归到这 6 类，通常说明它还不够清晰，先不要直接排期。

### 2.4 近期已完成的优化

这些优化已经完成，不再重复进入 backlog：

- 命令展示去掉 `Tieba:` 前缀
- `最新` 说明文案补齐
- 首次启动引导
- 有 Python 时一键安装 `aiotieba`
- TreeView 基础加载反馈
- `最新` 视图动作级加载反馈
- 楼中楼分页浏览

### 2.5 新需求录入模板

后续再加需求，先按下面 5 行收口，再决定是否排期：

- `用户场景`
  例：用户在工作间隙快速浏览帖子时，等待没有反馈。
- `当前问题`
  例：点击后短时间无变化，容易误判为没点上。
- `预期结果`
  例：用户能立刻知道当前正在加载什么。
- `建议落点`
  例：TreeView、论坛页、帖子页、楼中楼中的哪一层。
- `验收方式`
  例：通过手动点击能稳定看到加载、失败和恢复反馈。

如果一条需求写不出这 5 行，先不要直接进 backlog。

### 2.6 优化任务拆分规则

为了避免一次改太散，优化任务默认按下面规则拆：

- 一次只明确一个主落点：
  `TreeView`、`论坛页`、`帖子页`、`楼中楼`、`老板模式`、`数据层`
- 每个优化任务都要一起考虑：
  - 加载态
  - 失败态
  - 恢复路径
  - 文案同步
- 如果是状态型需求：
  优先决定“存不存、存多久、跨不跨会话”，再决定 UI 怎么展示。
- 如果是体验型需求：
  优先收一版最小可感知变化，不要一开始做成复杂系统。

## 3. P0 任务清单

这些任务是现在最值得直接进入开发的。

### P0-1 首次启动引导（已完成）

目标：

- 把 Python、`aiotieba`、登录态、`STOKEN` 的概念讲清楚

建议方案：

- 首次激活扩展时，若未完成运行条件，打开一个简洁引导页
- 页面分 3 段：
  - 环境是否可用
  - 是否已导入登录态
  - 哪些功能需要完整 Cookie

建议改动：

- [extension.ts](D:\companycode\tieba\src\extension.ts)
- [diagnosticsPanel.ts](D:\companycode\tieba\src\views\diagnosticsPanel.ts)
- 新增 `onboardingPanel.ts`
- 可能新增 `storageKeys.ts` 中的首次启动标记

验收标准：

- 新用户第一次启动时，不需要靠 README 猜该怎么用

依赖：

- 依赖现有环境诊断能力

### P0-2 登录态提示细化

目标：

- 让用户知道“能看”和“能同步”之间的区别

建议方案：

- 状态栏 tooltip 里明确区分：
  - 已导入 `BDUSS`
  - 已导入 `STOKEN`
  - 已导入 Cookie
- 在同步关注吧失败时，明确提示“需要完整 Cookie”

建议改动：

- [extension.ts](D:\companycode\tieba\src\extension.ts)
- [tiebaService.ts](D:\companycode\tieba\src\services\tiebaService.ts)
- [diagnosticsPanel.ts](D:\companycode\tieba\src\views\diagnosticsPanel.ts)

验收标准：

- 用户知道为什么自己“能看帖子，但同步不了关注吧”

依赖：

- 无

### P0-2A 无 Python 安装引导

目标：

- 让“机器上完全没有 Python”的用户也知道下一步该去哪装、装完怎么回来继续

建议方案：

- 在首启引导和诊断页里明确区分：
  - 没有 Python
  - 有 Python 但缺 `aiotieba`
- 没有 Python 时提供：
  - Python 官网下载入口
  - Windows 场景下的最短安装提示
  - 安装后回到扩展里的下一步动作
- 已经有 Python 时继续保持“一键安装 aiotieba”

建议改动：

- [onboardingPanel.ts](D:\companycode\tieba\src\views\onboardingPanel.ts)
- [diagnosticsPanel.ts](D:\companycode\tieba\src\views\diagnosticsPanel.ts)
- [extension.ts](D:\companycode\tieba\src\extension.ts)
- [README.md](D:\companycode\tieba\README.md)

验收标准：

- 没有 Python 的用户不需要再自己猜要装什么、去哪装、装完回来该点什么

依赖：

- 依赖现有 Python 运行时探测和一键安装 `aiotieba` 能力

### P0-3 最近同步时间

目标：

- 提高“同步关注吧”这个动作的可见性和可信度

建议方案：

- 本地记录最近同步时间
- 在状态栏 tooltip、诊断页或 `关注吧` 视图空白提示里展示

建议改动：

- [storageKeys.ts](D:\companycode\tieba\src\storage\storageKeys.ts)
- [tiebaService.ts](D:\companycode\tieba\src\services\tiebaService.ts)
- [diagnosticsPanel.ts](D:\companycode\tieba\src\views\diagnosticsPanel.ts)
- 可选新增 `syncStateStore.ts`

验收标准：

- 用户能看见上次同步大概发生在什么时候

依赖：

- 依赖现有同步关注吧能力

### P0-3A 加载反馈统一

目标：

- 把“正在请求数据”的感知统一起来

建议方案：

- TreeView、论坛页、帖子页、楼中楼都遵循同一套加载反馈规则
- 至少区分：
  - 初始加载
  - 翻页加载
  - 手动刷新
  - 局部加载失败

建议改动：

- [extension.ts](D:\companycode\tieba\src\extension.ts)
- [forumPanel.ts](D:\companycode\tieba\src\views\forumPanel.ts)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- [forumView.js](D:\companycode\tieba\media\forumView.js)
- [threadView.js](D:\companycode\tieba\media\threadView.js)

验收标准：

- 用户在等待任何关键数据时，都知道系统正在处理什么

依赖：

- 无

### P0-4 `继续阅读`

目标：

- 让“第二次打开扩展”有明确落点

建议方案：

- 在侧栏新增一个轻量入口：
  - `继续阅读`
- 入口行为：
  - 恢复最近一次打开的帖子
  - 默认回到上次页码
  - 如果有滚动恢复，再继续恢复滚动位置

建议改动：

- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- [extension.ts](D:\companycode\tieba\src\extension.ts)
- [historyStore.ts](D:\companycode\tieba\src\storage\historyStore.ts)
- 可能新增 `readingSessionStore.ts`

验收标准：

- 第二次打开扩展时，用户不需要重新找刚看过的帖子

依赖：

- 建议和 `P0-5` 一起做

### P0-5 滚动位置恢复

目标：

- 把 `继续阅读` 从“回到那一页”升级成“回到看到哪里”

建议方案：

- 在帖子 Webview 内记录滚动位置
- 在切页、关闭、切到老板模式前持久化
- 恢复时 best effort 定位

建议改动：

- [threadView.js](D:\companycode\tieba\media\threadView.js)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- 新增或扩展 `readingSessionStore.ts`
- [bossModeManager.ts](D:\companycode\tieba\src\views\bossModeManager.ts)

验收标准：

- 同一帖子再次打开时，大多数场景能回到接近上次阅读位置

依赖：

- 依赖帖子页 session 存储

### P0-6 文档和界面统一

目标：

- 消除 README、命令、界面、诊断页之间的说法不一致

检查重点：

- `最新` 的说明语义
- 登录态导入
- `收藏` 是否仍作为公开能力存在
- 同步关注吧和 Cookie 的关系

建议改动：

- [README.md](D:\companycode\tieba\README.md)
- [package.json](D:\companycode\tieba\package.json)
- [diagnosticsPanel.ts](D:\companycode\tieba\src\views\diagnosticsPanel.ts)
- [tieba-product-roadmap.md](D:\companycode\tieba\docs\tieba-product-roadmap.md)

验收标准：

- 任一入口看到的产品表述都一致

依赖：

- 依赖前面几项已收口的文案方案

## 4. P1 任务清单

### P1-1 `稍后看`

目标：

- 恢复“收藏”的真实产品价值，但不再用旧概念硬回归

建议方案：

- 重新命名为 `稍后看`
- 作为侧栏主视图或历史旁轻入口
- 语义明确为“我打算回头看的帖子”

建议改动：

- [favoritesStore.ts](D:\companycode\tieba\src\storage\favoritesStore.ts)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- 新增或恢复对应的 view provider
- [package.json](D:\companycode\tieba\package.json)

验收标准：

- 用户能把帖子留到之后再看
- 这个能力与“历史记录”边界清楚

### P1-2 已读 / 未读

目标：

- 让持续阅读更有组织性

建议方案：

- 记录帖子最近阅读时间
- 在侧栏列表里加轻量状态
- 先不做复杂多层级标记

建议改动：

- [historyStore.ts](D:\companycode\tieba\src\storage\historyStore.ts)
- [latestViewProvider.ts](D:\companycode\tieba\src\views\latestViewProvider.ts)
- [followedForumsProvider.ts](D:\companycode\tieba\src\views\followedForumsProvider.ts)
- [treeItems.ts](D:\companycode\tieba\src\views\treeItems.ts)

验收标准：

- 用户能大概看出哪些帖子自己已经看过

### P1-3 关键词静默过滤

目标：

- 降低噪音内容存在感

建议方案：

- 按标题关键字过滤
- 后续再扩到作者和吧名

建议改动：

- [settingsStore.ts](D:\companycode\tieba\src\storage\settingsStore.ts)
- [tiebaService.ts](D:\companycode\tieba\src\services\tiebaService.ts)
- [forumPanel.ts](D:\companycode\tieba\src\views\forumPanel.ts)
- [latestViewProvider.ts](D:\companycode\tieba\src\views\latestViewProvider.ts)

验收标准：

- 用户能让固定噪音贴默认不出现

### P1-4 帖子快捷键导航

目标：

- 减少鼠标依赖

建议方案：

- 上一页 / 下一页
- 切换图片显示
- 只看楼主
- 展开当前楼层回复

建议改动：

- [package.json](D:\companycode\tieba\package.json)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- [threadView.js](D:\companycode\tieba\media\threadView.js)

验收标准：

- 用户在帖子页的大部分核心操作可通过键盘完成

### P1-4A 楼中楼分页状态记忆

目标：

- 降低反复展开和翻页的重复操作

建议方案：

- 同一帖子里记住已展开的楼层
- 记住楼中楼当前页码
- 切页或刷新帖子时按 best effort 恢复

建议改动：

- [threadView.js](D:\companycode\tieba\media\threadView.js)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- 可选扩展 `readingSessionStore.ts`

验收标准：

- 用户切回同一帖子时，不需要反复把同一层楼中楼翻到原来的页码

### P1-5 阅读来源提示

目标：

- 让用户知道内容来自 `aiotieba`、网页回退还是缓存

建议方案：

- 论坛页和帖子页顶部都显示轻量来源标签

建议改动：

- [tiebaService.ts](D:\companycode\tieba\src\services\tiebaService.ts)
- [forumPanel.ts](D:\companycode\tieba\src\views\forumPanel.ts)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- [forumView.js](D:\companycode\tieba\media\forumView.js)
- [threadView.js](D:\companycode\tieba\media\threadView.js)

验收标准：

- 用户能知道为什么这次加载表现和上次不同

### P1-6 紧凑阅读模式

目标：

- 把论坛页和帖子页进一步压成更低存在感的阅读器

建议方案：

- 提供一个轻量配置：
  - `默认`
  - `紧凑`
- `紧凑` 模式下优先压缩：
  - 楼层间距
  - 元信息行高度
  - 图片缩略图默认尺寸
  - 标题和正文的留白

建议改动：

- [common.css](D:\companycode\tieba\media\common.css)
- [forumView.js](D:\companycode\tieba\media\forumView.js)
- [threadView.js](D:\companycode\tieba\media\threadView.js)
- [package.json](D:\companycode\tieba\package.json)
- 可选新增 `settingsStore.ts`

验收标准：

- 开启后，论坛页和帖子页明显更“像工作工具”，而不是内容站页面

### P1-7 局部失败重试

目标：

- 避免用户因为一个局部请求失败就整页重开

建议方案：

- 论坛翻页失败时，原地保留当前列表并给出重试
- 帖子翻页失败时，保留当前页并给出重试
- 楼中楼翻页失败时，只影响当前楼层回复区

建议改动：

- [forumPanel.ts](D:\companycode\tieba\src\views\forumPanel.ts)
- [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts)
- [forumView.js](D:\companycode\tieba\media\forumView.js)
- [threadView.js](D:\companycode\tieba\media\threadView.js)

验收标准：

- 用户在网络或接口偶发失败时，不需要关闭重开整个 Webview

## 5. P2 任务清单

这些任务不紧急，先不要插到主线前面。

- 更复杂的老板模式模板
- 假 Open Editors
- 多套主题
- 更细的排序和推荐
- 稍后看分组
- 本地搜索历史帖子

## 6. 推荐实现顺序

建议按下面顺序推进，不要跳着做：

1. `P0-2A 无 Python 安装引导`
2. `P0-2 登录态提示细化`
3. `P0-3 最近同步时间`
4. `P0-3A 加载反馈统一`
5. `P0-4 继续阅读`
6. `P0-5 滚动位置恢复`
7. `P0-6 文档和界面统一`
8. `P1-7 局部失败重试`
9. `P1-6 紧凑阅读模式`
10. 再进入其余 P1

这样排的原因是：

- 首启引导已经把“缺什么、下一步点什么”收了一版
- 现在第一项先补齐“没有 Python 怎么办”
- 第二和第三项继续解决“状态是不是解释清楚”
- 第四项解决“等待是不是足够明确”
- 第五和第六项解决“能不能持续用”
- 第七项解决“产品认知是否稳定”
- 后两项开始处理“偶发失败”和“低存在感阅读”

## 7. 每项任务的通用完成标准

任何一个任务完成时，至少要一起做这 4 件事：

1. 功能本体完成
2. 命令或视图入口补齐
3. README / 诊断 / 提示文案同步
4. `npm run compile` 通过

如果任务涉及：

- Webview 状态
  补一次手动恢复路径验证
- 新存储字段
  补迁移兼容思路
- 命令交互
  补错误文案和空态

## 8. 一句话结论

现在最适合直接开工的，不是再发散想新功能，而是先做：

- 无 Python 安装引导
- 登录态提示细化
- 加载反馈统一
- `继续阅读`

这几项做完，产品就会从“能用的玩具”明显更接近“可持续使用的阅读器”。

## 9. 当前建议继续补充的需求池

如果后面继续整理需求，我建议优先往这 4 个方向补，不要发散到社交能力：

- `继续阅读闭环`
  例：回到上次楼层、最近打开的帖子入口、最近常看吧排序。
- `等待与失败可感知`
  例：更细的加载状态、局部失败重试、来源提示。
- `低存在感阅读`
  例：紧凑模式、信息密度控制、图片尺寸策略。
- `老板模式稳定性`
  例：切换恢复、假视图一致性、快捷键流。
