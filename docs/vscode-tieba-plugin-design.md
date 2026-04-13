# VS Code 百度贴吧插件设计

## 1. 产品定位

目标是做一个运行在 VS Code 里的贴吧阅读插件，核心诉求不是“完整贴吧客户端”，而是“低打扰、快速切换、适合碎片时间浏览”。

这个插件应该优先满足：

- 在 VS Code 内直接看贴吧列表和帖子内容
- 尽量减少切到浏览器的次数
- 保持界面轻量，打开快，切换快
- 支持个人常逛贴吧的聚合阅读
- 先做阅读体验，再考虑登录、消息、发帖等重功能

不建议一开始就做：

- 发帖、回帖、删帖、签到
- 完整私信系统
- 复杂账号体系
- 自动化刷帖或高频抓取

## 2. 目标用户

- 平时常驻 VS Code 的开发者
- 主要需求是浏览贴吧内容而不是深度互动
- 更关注“快开快看快关”

## 3. 核心设计原则

### 3.1 以读为主

MVP 先解决“看什么”和“怎么看”，不急着解决“怎么发”。

### 3.2 原生感优先

尽量借用 VS Code 已有交互：

- Activity Bar 入口
- Side Bar 目录/列表
- Editor Tab 打开帖子详情
- Command Palette 做快捷操作

### 3.3 数据层和界面层解耦

贴吧接口和页面结构不稳定，必须把“贴吧数据抓取”和“前端展示”分开，方便后续替换数据源。

### 3.4 保守处理登录

登录态、Cookie、反爬、验证码都比较敏感。MVP 推荐先支持匿名浏览，登录态作为第二阶段能力。

## 4. 插件形态

推荐采用“侧边栏导航 + Webview 详情页”的混合结构。

### 4.1 侧边栏

在 Activity Bar 增加一个 `Tieba` 容器，内部包含这些 View：

- `关注吧`
- `热门帖`
- `收藏`
- `历史`

其中：

- `关注吧` 展示用户手动添加的贴吧
- `热门帖` 展示预设贴吧或最近活跃贴吧内容
- `收藏` 保存用户标记的帖子
- `历史` 保存最近浏览记录

侧边栏适合用 `TreeView` / `TreeDataProvider` 实现，渲染轻，交互也更接近 VS Code 原生体验。

### 4.2 详情页

点击帖子后，在编辑器区域打开一个 `WebviewPanel` 展示帖子详情。

详情页包含：

- 帖子标题
- 楼主信息
- 楼层列表
- 图片
- 分页/加载更多
- `在浏览器打开`
- `收藏`

这样做的好处是阅读区域够宽，不挤在侧栏里。

### 4.3 快捷入口

建议提供这些命令：

- `Tieba: Open Home`
- `Tieba: Search Forum`
- `Tieba: Search Thread`
- `Tieba: Refresh`
- `Tieba: Toggle Images`
- `Tieba: Open in Browser`
- `Tieba: Boss Key`

`Boss Key` 不建议做伪装页面，建议只做安全动作：

- 关闭贴吧详情标签页
- 收起 Tieba 侧边栏
- 焦点切回最近一个代码编辑器

### 4.4 信息架构

推荐把整个插件的信息架构收成 3 层：

- 导航层：贴吧分组、收藏、历史
- 列表层：某个吧的帖子列表
- 阅读层：单个帖子详情

对应到 VS Code 里的载体：

- 导航层用 `TreeView`
- 列表层可以先复用 `TreeView`，后续也可以升级成首页 `WebviewView`
- 阅读层固定用 `WebviewPanel`

这样结构简单，而且符合“侧边筛选，主区阅读”的习惯。

### 4.5 典型使用路径

把用户最常见的路径定义清楚，后面写命令和组件时不容易跑偏：

1. 用户通过命令面板添加一个贴吧
2. 在侧边栏点击贴吧，查看帖子列表
3. 点击帖子，在编辑区打开阅读页
4. 需要时收藏帖子或复制链接
5. 临时切换工作时触发 `Boss Key`
6. 下次从历史或收藏直接回到帖子

## 5. 功能分层

### 5.1 MVP 功能

第一版建议只做下面这些：

1. 手动添加贴吧
2. 查看某个吧的帖子列表
3. 查看帖子详情
4. 收藏帖子
5. 浏览历史
6. 在浏览器打开原帖
7. 图片开关
8. 简单缓存和分页

这是一个可以真正用起来的版本，而且实现风险相对可控。

### 5.2 第二阶段

第二阶段再考虑：

1. 关键词搜索贴吧
2. 关键词搜索帖子
3. 热门帖子聚合流
4. 自定义首页
5. 多吧订阅分组
6. 主题样式切换

### 5.3 第三阶段

如果前两阶段稳定，再考虑：

1. 登录态导入
2. 我的关注吧
3. 我的收藏同步
4. 消息提醒
5. 轻量回帖

发帖/回帖是高风险模块，接口稳定性、风控和登录处理都会明显复杂化，不建议最先做。

### 5.4 明确不做

为了控制边界，第一版建议明确排除这些内容：

- 后台常驻自动刷新
- 隐式登录或模拟登录流程
- 自动签到、自动回帖、批量操作
- 对外冒充浏览器行为的复杂规避逻辑
- 伪装成代码页面的“假装工作”视觉模式

这些能力不是没有价值，而是会显著提高维护成本和风险。

## 6. 技术方案

### 6.1 推荐技术栈

- Extension Host: `TypeScript`
- UI: `React + Vite` 或 `Preact + Vite`
- 打包: `esbuild` 或 `tsup`
- 网络请求: `undici` / `fetch`
- HTML 解析: `cheerio`
- 状态存储:
  - 普通数据: `context.globalState`
  - 敏感数据: `context.secrets`

如果你想尽量轻量，我更推荐：

- Extension Host: `TypeScript`
- Webview UI: `Preact`
- 打包: `esbuild`

这样构建速度快，依赖也少。

### 6.2 为什么不用纯 Webview 模拟浏览器

不建议直接在 Webview 里嵌入贴吧网页，原因有几个：

- 远程站点可能有 `X-Frame-Options` 或 CSP 限制
- 页面脚本复杂，兼容性差
- 控制不了样式和阅读体验
- 登录态处理不透明

更稳妥的方式是：

- 扩展侧负责拉取数据
- Webview 只负责展示结构化数据

### 6.3 数据源设计

建议做一层抽象接口，把数据来源隔离开：

```ts
export interface TiebaDataSource {
  getForumThreads(input: { forumName: string; page: number }): Promise<ForumThreadPage>;
  getThreadDetail(input: { threadId: string; page: number }): Promise<ThreadDetailPage>;
  searchForums(input: { keyword: string }): Promise<ForumSummary[]>;
  searchThreads(input: { keyword: string; forumName?: string; page: number }): Promise<ThreadSummary[]>;
}
```

后面可以有两种实现：

- `MobileApiDataSource`
- `WebScrapeDataSource`

推荐路线：

1. 优先调研移动端接口或较稳定的页面接口
2. 如果接口不稳定，再退回 HTML 抓取
3. 所有解析逻辑放在单独目录，不要散落在 UI 代码里

### 6.4 数据流

推荐数据流如下：

1. 用户点击某个贴吧
2. `TreeView` 触发 command
3. command 调用 `TiebaService`
4. `TiebaService` 调用 `TiebaDataSource`
5. 获取结构化数据后传给 `WebviewPanel`
6. `WebviewPanel` 渲染帖子内容
7. 收藏、历史、设置落到本地存储

### 6.5 核心数据模型

建议从一开始就把内部模型统一掉，不要让 UI 直接依赖贴吧原始接口字段。

```ts
export interface ForumSubscription {
  forumName: string;
  displayName: string;
  addedAt: number;
  pinned?: boolean;
}

export interface ThreadSummary {
  threadId: string;
  forumName: string;
  title: string;
  authorName: string;
  replyCount: number;
  lastReplyAt?: number;
  excerpt?: string;
  isTop?: boolean;
  url: string;
}

export interface PostItem {
  postId: string;
  floor: number;
  authorName: string;
  createdAt?: number;
  contentHtml: string;
  imageUrls: string[];
}

export interface ThreadDetailPage {
  threadId: string;
  title: string;
  forumName: string;
  page: number;
  pageCount?: number;
  posts: PostItem[];
  sourceUrl: string;
}
```

这个抽象有两个好处：

- 数据源切换时，UI 基本不用动
- 后面做收藏、历史、搜索索引时更统一

### 6.6 Extension 和 Webview 通信协议

帖子阅读页建议采用一套简单的消息协议，不要让 Webview 自己直接请求贴吧。

`Webview -> Extension`：

- `ready`
- `refreshThread`
- `loadNextPage`
- `toggleImages`
- `openExternal`
- `favoriteThread`

`Extension -> Webview`：

- `initThread`
- `appendPosts`
- `setLoading`
- `setError`
- `settingsChanged`

推荐原则：

- 网络请求只在 Extension Host 发起
- Webview 不存业务真相，只存展示状态
- 每个消息都带上 `threadId`，避免多标签页串数据

### 6.7 `package.json` 贡献点建议

这类插件的骨架可以先按下面的贡献点来设计：

```json
{
  "activationEvents": [
    "onView:tieba.forums",
    "onCommand:tieba.addForum",
    "onCommand:tieba.openHome"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "tieba",
          "title": "Tieba",
          "icon": "resources/tieba.svg"
        }
      ]
    },
    "views": {
      "tieba": [
        { "id": "tieba.forums", "name": "关注吧" },
        { "id": "tieba.hot", "name": "热门帖" },
        { "id": "tieba.favorites", "name": "收藏" },
        { "id": "tieba.history", "name": "历史" }
      ]
    }
  }
}
```

命令建议至少包含：

- `tieba.addForum`
- `tieba.refreshForum`
- `tieba.openThread`
- `tieba.searchForum`
- `tieba.searchThread`
- `tieba.openExternal`
- `tieba.toggleImages`
- `tieba.bossKey`

右键菜单建议后续挂到：

- 贴吧节点
- 帖子节点
- 收藏节点

### 6.8 配置项设计

建议尽早把这几个用户配置暴露出来：

- `tieba.showImages`: 是否显示图片，默认 `true`
- `tieba.compactMode`: 是否启用紧凑模式，默认 `false`
- `tieba.cacheMinutes`: 列表缓存分钟数，默认 `3`
- `tieba.maxHistory`: 历史记录条数上限，默认 `100`
- `tieba.openThreadMode`: 打开方式，`active` / `beside`
- `tieba.lowContrastMode`: 是否降低界面存在感，默认 `true`

这几个配置足够支撑 MVP，又不会把设置面板做得过重。

## 7. 建议的项目结构

```text
tieba-vscode-extension/
  package.json
  tsconfig.json
  src/
    extension.ts
    commands/
      openHome.ts
      searchForum.ts
      searchThread.ts
      openThread.ts
      toggleBossKey.ts
    views/
      tiebaViewProvider.ts
      threadPanel.ts
    services/
      tiebaService.ts
      datasource/
        tiebaDataSource.ts
        mobileApiDataSource.ts
        webScrapeDataSource.ts
      parser/
        forumParser.ts
        threadParser.ts
    models/
      forum.ts
      thread.ts
    storage/
      favoritesStore.ts
      historyStore.ts
      settingsStore.ts
    util/
      logger.ts
      rateLimit.ts
      html.ts
  webview/
    src/
      App.tsx
      pages/
        HomePage.tsx
        ThreadPage.tsx
      components/
        ThreadHeader.tsx
        PostList.tsx
        Toolbar.tsx
      styles/
        variables.css
        app.css
```

## 8. UI 交互设计

### 8.1 首页

首页不是必须很重，建议做成三段：

- 最近浏览
- 收藏帖子
- 常用贴吧

首页的目标不是信息量最大，而是让用户 3 秒内点进内容。

### 8.2 吧列表页

每个贴吧显示：

- 吧名
- 当前页码
- 帖子列表
- 发帖人
- 回复数
- 最后回复时间

列表项支持：

- 单击打开帖子
- 右键收藏
- 在浏览器打开

### 8.3 帖子详情页

详情页建议是“阅读器”风格，不要强做成贴吧原网页复刻。

建议布局：

- 顶部工具栏
- 标题区
- 楼层内容流
- 底部分页 / 加载更多

工具栏操作：

- 刷新
- 收藏
- 显示/隐藏图片
- 浏览器打开
- 复制链接

### 8.4 摸鱼体验优化

建议做这些，而不是做花哨伪装：

- `Boss Key`: 一键关闭贴吧标签并切回代码
- `Compact Mode`: 缩小头像、隐藏签名档、突出正文
- `Hide Images`: 一键只看文字
- `Low Contrast Mode`: 整体风格和 VS Code 主题接近，降低突兀感

### 8.5 状态设计

MVP 至少要把这些状态做完整：

- `Loading`: 首次进入贴吧或帖子时显示骨架屏/占位文案
- `Empty`: 没有关注吧、没有收藏、没有历史时给出引导
- `Error`: 网络失败、解析失败、被限流时给出重试入口
- `Partial`: 正文成功但图片失败时保留正文，不要整页报错

如果状态设计做得完整，这个插件即使接口偶尔不稳定，也不至于体验崩掉。

## 9. 存储设计

### 9.1 `globalState`

适合存：

- 收藏帖子
- 浏览历史
- 最近打开的贴吧
- 用户设置

### 9.2 `secrets`

适合存：

- Cookie
- BDUSS
- 其他登录凭据

### 9.3 缓存

建议做轻量缓存，避免每次都请求网络：

- 吧帖子列表缓存 1 到 3 分钟
- 帖子详情缓存 5 分钟
- 热门列表缓存 3 到 10 分钟

同时要允许用户手动刷新。

### 9.4 建议的存储键

如果一开始就固定 key 命名，后面迁移和排查都会轻松很多：

```ts
const STORAGE_KEYS = {
  forums: "tieba.forums",
  favorites: "tieba.favorites",
  history: "tieba.history",
  settings: "tieba.settings",
  cacheForumThreads: "tieba.cache.forumThreads",
  cacheThreadDetail: "tieba.cache.threadDetail"
} as const;
```

缓存对象建议额外带上：

- `updatedAt`
- `expiresAt`
- `version`

这样未来解析逻辑变更时，可以主动淘汰旧缓存。

## 10. 风险与约束

### 10.1 接口稳定性

贴吧接口可能变化，HTML 结构也可能变。必须把解析逻辑单独封装，并准备 fallback。

### 10.2 反爬限制

高频请求可能触发风控，所以要做：

- 限流
- 简单缓存
- 失败重试
- 明确错误提示

### 10.3 登录复杂度

登录相关功能会引入：

- Cookie 过期
- 验证码
- 账号风控
- 敏感信息保存

所以登录功能应放到后期。

### 10.4 图片加载

贴吧图片可能有防盗链或缩略图/原图差异，建议：

- 默认加载缩略图
- 点击后在浏览器打开原图
- 失败时优雅降级

### 10.5 合规与边界

这个插件本质上是个人阅读工具，建议从产品边界上保持克制：

- 只做用户主动触发的阅读请求
- 避免高频轮询和后台刷取
- 不内置规避风控的逻辑
- 对登录态导入给出明确风险提示

这不是法律结论，只是工程上更稳妥的边界控制。

## 11. MVP 开发顺序

建议按下面顺序做：

1. 初始化 VS Code extension 项目
2. 建立 Activity Bar 容器和 `TreeView`
3. 实现“手动添加贴吧”
4. 接入单个贴吧帖子列表抓取
5. 实现帖子详情 `WebviewPanel`
6. 加入收藏/历史
7. 加入缓存、错误处理、刷新
8. 加入 `Boss Key` 和图片开关

这样每一步都能看到成果，不会卡死在“先把所有接口研究明白”上。

## 12. 测试与验收

### 12.1 最少要补的测试

即使是个人插件，下面这些测试也值得补：

- 解析器单元测试：给定 HTML / JSON，能稳定提取帖子列表和楼层
- 存储层测试：收藏、历史、去重、上限裁剪
- 命令层测试：添加贴吧、刷新贴吧、打开帖子

### 12.2 手动验收清单

每次发一个可安装版本前，至少手测这些路径：

1. 首次安装后能成功激活插件
2. 添加贴吧后侧栏立即可见
3. 打开帖子后能正常渲染正文
4. 收藏后重启 VS Code 仍然存在
5. 断网时有清晰错误提示
6. `Boss Key` 能快速收起阅读界面
7. 图片关闭后刷新页面仍然生效

### 12.3 发布前自查

发布前再看一遍这些问题：

- 有没有把 Cookie 打进日志
- 有没有未处理的异常导致整个视图空白
- Webview CSP 是否收紧
- 请求频率是否过高

## 13. 最小可行版本定义

如果你要尽快做出第一个可用版本，验收标准可以定成：

- 能在命令面板输入吧名并添加
- 能在侧边栏看到吧列表
- 能点开帖子并阅读正文与楼层
- 能收藏帖子
- 能打开原网页
- 网络失败时有明确提示

做到这里，这个插件就已经有实际价值了。

## 14. 我对这个项目的建议

这个项目最关键的不是 UI，而是“数据源稳定性”和“插件内交互是否足够顺手”。

所以最合理的路线不是先追求完整贴吧客户端，而是：

1. 做一个阅读器
2. 做一个订阅器
3. 最后再决定要不要做登录和互动

如果你愿意，我下一步可以直接继续帮你做下面两件事里的一个：

1. 输出一版更具体的 `package.json + 命令 + 视图` 插件脚手架设计
2. 直接在这个目录里给你搭一个可运行的 VS Code 插件初始工程
