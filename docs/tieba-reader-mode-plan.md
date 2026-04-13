# Tieba Reader Mode 需求规划

## 1. 需求重述

当前插件虽然已经有 `WebviewPanel`，但核心问题没有变：

- 当抓取失败时，用户还是会退回到浏览器或 VS Code Simple Browser
- 即使抓取成功，当前阅读页也还只是“轻量展示帖子内容”，没有形成明显区别于贴吧原网页的阅读体验

所以这个需求的真实目标不是“在 VS Code 里看贴吧”，而是：

**把贴吧内容抽成结构化数据，然后在 VS Code 里以阅读器的方式重新组织和呈现。**

这件事做成后，用户感知应该是：

- 我打开的不是贴吧网页
- 我打开的是一个专门给摸鱼阅读优化过的贴吧客户端

## 2. 新的产品目标

把插件定位从“贴吧快捷入口”调整为“贴吧阅读器”。

新目标优先级如下：

1. 结构化拉取帖子列表和楼层内容
2. 用自定义布局重新排版
3. 压掉贴吧原生网页里的噪音信息
4. 保留必要的跳转能力，但浏览器只作为 fallback

不再把“打开浏览器继续看”当主路径，只把它当兜底。

## 3. 和当前版本的差距

当前代码其实已经有一部分基础：

- [tiebaParser.ts](D:\companycode\tieba\src\services\parser\tiebaParser.ts) 已经能抽出帖子列表和部分楼层
- [forumPanel.ts](D:\companycode\tieba\src\views\forumPanel.ts) 和 [threadPanel.ts](D:\companycode\tieba\src\views\threadPanel.ts) 已经是自定义 Webview，而不是直接 iframe 网页
- [liveTiebaDataSource.ts](D:\companycode\tieba\src\services\datasource\liveTiebaDataSource.ts) 已经是独立数据源层

但还差这些关键点：

- 论坛列表字段不够全
- 帖子详情字段不够全
- 没有对贴吧内容做“阅读器化清洗”
- 没有把 UI 做成强烈区别于贴吧网页的阅读产品
- 浏览器 fallback 目前存在感还太强

## 4. Reader Mode 的核心原则

### 4.1 只保留读内容真正需要的信息

应该保留：

- 帖子标题
- 吧名
- 发帖人 / 楼层作者
- 发布时间
- 回复数 / 页码
- 正文
- 图片
- 楼中楼摘要

应该默认去掉或弱化：

- 贴吧原生导航
- 广告位
- 推荐流
- 签名档
- 等级、勋章、复杂装饰
- 过重的头像信息块

### 4.2 列表页是信息流，不是网页截图

论坛页应该像一个“主题流”：

- 一行突出标题
- 一行展示作者、回复数、最后回复时间
- 一小段摘要
- 置顶帖和普通帖明确区分

不要再保留贴吧网页那种表格感和碎块感。

### 4.3 详情页是阅读器，不是网页复刻

帖子页应该像长文阅读器：

- 顶部固定帖子元信息
- 正文楼层顺序流式排布
- 每层只保留必要信息
- 图片内联但可折叠
- 楼中楼默认折叠或摘要显示

## 5. 要抽取的数据范围

## 5.1 论坛列表最少字段

论坛列表至少要抽这些字段：

```ts
interface ForumThreadSummary {
  threadId: string;
  forumName: string;
  title: string;
  authorName: string;
  replyCount: number;
  lastReplyAuthor?: string;
  lastReplyAt?: number;
  excerpt?: string;
  isTop?: boolean;
  isGood?: boolean;
  pageCount?: number;
  url: string;
}
```

当前已经有一部分，但不够完整，尤其是：

- `lastReplyAuthor`
- `lastReplyAt`
- `isGood`
- `pageCount`

这些会直接影响列表的信息密度和可读性。

## 5.2 帖子详情最少字段

详情页至少要抽这些字段：

```ts
interface ReaderPostItem {
  postId: string;
  floor: number;
  authorName: string;
  authorId?: string;
  createdAt?: number;
  contentHtml: string;
  contentText?: string;
  imageUrls: string[];
  quoteBlocks?: string[];
  commentsPreview?: {
    total: number;
    items: Array<{
      authorName: string;
      content: string;
    }>;
  };
}
```

关键不在“字段越多越好”，而在于能支撑重排版。

最需要补的是：

- 发布时间
- 引用块
- 楼中楼摘要
- 正文纯文本
- 更稳定的图片链接

## 6. 数据处理链路

Reader Mode 应该明确分成 4 层：

1. 抓取层
2. 解析层
3. 规范化层
4. 展示层

### 6.1 抓取层

职责：

- 带 Cookie 请求贴吧页面
- 处理分页
- 检测安全验证页

这里不要直接服务 UI。

### 6.2 解析层

职责：

- 从 HTML 中提取贴吧原始字段
- 保留贴吧语义，但不保留贴吧布局

这一步输出“站点结构数据”。

### 6.3 规范化层

职责：

- 清洗正文 HTML
- 去掉贴吧专属噪音节点
- 统一时间、楼层、图片链接格式
- 压成适合阅读器渲染的数据模型

这一步才是 Reader Mode 的关键。

建议增加一层专门的 mapper，例如：

```ts
interface ReaderThreadPage {
  title: string;
  forumName: string;
  page: number;
  pageCount?: number;
  hero: {
    authorName?: string;
    replyCount?: number;
  };
  posts: ReaderPostItem[];
}
```

### 6.4 展示层

职责：

- 只消费 `ReaderThreadPage`
- 不关心贴吧 DOM 结构
- 不直接处理抓取失败逻辑

这样后面换接口时，UI 才不会一起重写。

## 7. 重排版 UI 方案

## 7.1 论坛页

论坛页建议改成两栏信息层级：

- 顶部：吧名、页码、刷新、图片开关、浏览器兜底
- 主体：帖子信息流

每个帖子卡片只保留 3 块：

- 标题
- 摘要
- 元信息行

元信息行建议压缩成：

- 作者
- 回复数
- 最后回复时间
- 标签（置顶 / 精华）

## 7.2 帖子页

帖子页建议做成真正的 reader layout：

- 顶部 Hero：标题、吧名、作者、总回复、分页
- 工具条：刷新、收藏、隐藏图片、只看楼主、浏览器打开
- 主体：楼层流

每一层卡片建议固定结构：

- 左上：楼层号
- 右侧：作者 + 时间
- 中间：正文
- 底部：楼中楼摘要 / 展开评论

## 7.3 应该增加的阅读模式

Reader Mode 至少值得加这 4 个开关：

1. `Compact`
2. `Hide Images`
3. `Only LZ`
4. `Collapse Comments`

这 4 个能力都会明显提升摸鱼体验。

## 8. 浏览器 fallback 的重新定位

浏览器 fallback 不能消失，但要降级为次要动作。

正确定位应该是：

- 抓取失败时：作为恢复路径
- 图片失效时：作为补充路径
- 需要完整互动时：作为跳转路径

而不是：

- 平时主要靠浏览器看，插件只是入口

如果用户大多数时候都在 Simple Browser 里看，那这个产品方向就是偏了。

## 9. 推荐的实现顺序

不要一上来重写 UI，正确顺序应该是：

### 阶段 A：先补数据

目标：

- 提高论坛列表和帖子详情字段完整度
- 加入楼中楼、发布时间、最后回复等字段
- 做正文清洗函数

产出：

- 更完整的 parser
- reader-specific 数据模型

### 阶段 B：再改论坛页

目标：

- 把论坛页改成真正的信息流
- 明显区别于原网页

产出：

- 新 forum view
- 更高密度的信息卡片

### 阶段 C：再改帖子页

目标：

- 把帖子页改成阅读器
- 增加 `Only LZ` 和 `Collapse Comments`

产出：

- 新 thread reader
- 更强的阅读模式切换

### 阶段 D：最后再优化 fallback

目标：

- 让 fallback 更像兜底而不是主流程

产出：

- 更清晰的错误页
- 更低存在感的浏览器入口

## 10. 新的验收标准

Reader Mode 做完后，验收标准不应该再是“能打开帖子”。

应该变成：

1. 正常情况下用户不需要切到浏览器
2. 论坛列表一眼能扫到标题、回复和活跃度
3. 帖子正文阅读感明显强于贴吧原网页
4. 噪音信息明显减少
5. 浏览器 fallback 只在失败或互动时使用

## 11. 对当前项目的明确建议

这个需求是值得做的，而且方向应该调整。

结论很直接：

- 能拉数据，而且已经拉到一部分了
- 你要的关键不是“继续开浏览器”
- 你要的是“把数据拉出来，做成贴吧阅读器”

所以接下来最合理的开发路线不是继续堆命令，而是：

1. 先扩 parser 和 reader model
2. 再重做 forum reader UI
3. 再重做 thread reader UI

## 12. 我建议的下一步

我可以直接继续做下面两件事之一：

1. 我先把这份规划落成代码任务清单，细到文件级改造计划
2. 我直接开始第一阶段，重构 parser 和数据模型，为真正的重排版做准备
