# Tieba Fish 执行清单

## 1. 当前范围

本轮只做 8 项：

- 首页入口再收敛
- 状态提示再人话一点
- 加载反馈统一
- 命令入口分层
- 空态文案更强引导
- 关键词屏蔽
- 快捷键帮助
- 主题预设

其余方向暂不进入实现清单。

## 2. P0

### P0-1 首页入口再收敛

目标：

- 首页只呈现最重要的 3 到 4 个动作
- 把“功能陈列页”收成“开始使用入口页”

建议改动文件：

- `D:\companycode\tieba\src\views\onboardingPanel.ts`
- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\README.md`

验收标准：

- 首页只保留导入登录态、同步关注吧、继续阅读、环境诊断这类主动作
- 用户第一次打开时，不需要再去命令面板猜怎么开始

### P0-2 状态提示再人话一点

目标：

- 把技术状态翻译成用户能直接理解的结果状态

建议改动文件：

- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\src\views\diagnosticsPanel.ts`
- `D:\companycode\tieba\src\views\onboardingPanel.ts`
- `D:\companycode\tieba\src\services\tiebaService.ts`

验收标准：

- 状态栏和引导页优先展示“可阅读 / 可同步 / 需补全登录态 / 需安装 Python / 需安装 aiotieba”
- 技术字段只出现在诊断细节里

### P0-3 加载反馈统一

目标：

- 树视图、正文、楼中楼都使用一致的加载反馈模式

建议改动文件：

- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\src\views\followedForumsProvider.ts`
- `D:\companycode\tieba\src\views\latestViewProvider.ts`
- `D:\companycode\tieba\src\views\historyViewProvider.ts`
- `D:\companycode\tieba\src\views\threadPanel.ts`
- `D:\companycode\tieba\media\threadView.js`

验收标准：

- 关注吧、最新、历史的请求都有明确加载提示
- 帖子翻页、只看楼主、楼中楼翻页都有明确加载提示
- 用户不会把“正在请求”误以为“已经卡死”

### P0-4 命令入口分层

目标：

- 把命令入口按用户心智重组

建议改动文件：

- `D:\companycode\tieba\package.json`
- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\README.md`

验收标准：

- 命令能被归到“开始使用 / 阅读 / 维护”三类
- 命令命名更短、更直接
- 用户不需要先理解实现细节才能找到命令

### P0-5 空态文案更强引导

目标：

- 所有空态都明确告诉用户下一步做什么

建议改动文件：

- `D:\companycode\tieba\src\views\followedForumsProvider.ts`
- `D:\companycode\tieba\src\views\latestViewProvider.ts`
- `D:\companycode\tieba\src\views\historyViewProvider.ts`
- `D:\companycode\tieba\src\views\onboardingPanel.ts`
- `D:\companycode\tieba\README.md`

验收标准：

- 关注吧空态提示导入登录态、同步关注吧或手动添加
- 最新空态提示先点开一个关注吧
- 历史空态提示去打开第一个帖子

## 3. P1

### P1-1 关键词屏蔽

目标：

- 提供最低成本的降噪能力

建议改动文件：

- `D:\companycode\tieba\src\services\tiebaService.ts`
- `D:\companycode\tieba\src\models\tieba.ts`
- `D:\companycode\tieba\src\storage\*.ts`
- `D:\companycode\tieba\src\views\forumPanel.ts`
- `D:\companycode\tieba\src\views\threadPanel.ts`
- `D:\companycode\tieba\media\forumView.js`
- `D:\companycode\tieba\media\threadView.js`

第一版范围：

- 按标题关键词隐藏帖子
- 按作者名隐藏帖子或回复
- 按吧名隐藏订阅流来源

验收标准：

- 被命中的内容默认不展示
- 用户可通过命令或设置管理屏蔽词

### P1-2 快捷键帮助

目标：

- 提升已有功能的可发现性

建议改动文件：

- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\src\views\threadPanel.ts`
- `D:\companycode\tieba\media\threadView.js`
- `D:\companycode\tieba\media\common.css`
- `D:\companycode\tieba\package.json`

第一版范围：

- 做一个轻量帮助面板或弹层
- 汇总核心快捷键和操作说明

验收标准：

- 用户能直接看到老板模式、翻页、回到顶部、指定链接等快捷操作

### P1-3 主题预设

目标：

- 用少量预设降低视觉存在感

建议改动文件：

- `D:\companycode\tieba\media\common.css`
- `D:\companycode\tieba\media\forumView.js`
- `D:\companycode\tieba\media\threadView.js`
- `D:\companycode\tieba\src\extension.ts`
- `D:\companycode\tieba\package.json`

第一版范围：

- 默认
- 极简
- 文档风

验收标准：

- 主题切换后论坛页和帖子页风格同步变化
- 不引入大量自定义配置项

## 4. 推荐顺序

1. P0-1 首页入口再收敛
2. P0-2 状态提示再人话一点
3. P0-3 加载反馈统一
4. P0-4 命令入口分层
5. P0-5 空态文案更强引导
6. P1-1 关键词屏蔽
7. P1-2 快捷键帮助
8. P1-3 主题预设

## 5. 依赖关系

- `首页入口再收敛` 和 `状态提示再人话一点` 可以先做，它们会直接影响首页与引导文案。
- `加载反馈统一` 最好在进入 `关键词屏蔽` 之前做完，不然后面更难统一交互。
- `命令入口分层` 要在 `快捷键帮助` 前完成，否则帮助内容会重复变化。
- `主题预设` 放最后做，避免前面还在频繁改页面结构时重复调样式。
