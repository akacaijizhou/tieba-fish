# aiotieba 项目研究

## 1. 结论先说

`aiotieba` 不是“扒贴吧网页”的库，而是一个对贴吧客户端 API 做了系统封装的 Python 异步 SDK。

对我们这个 VS Code 插件来说，它最大的价值是：

- 可以直接拿到结构化的贴吧数据
- 已经处理了贴吧客户端接口里的 protobuf、参数组织和一部分密码学细节
- 返回的数据模型本身就适合做“阅读器重排版”

所以后续路线不应该是继续抓 HTML，而应该优先考虑：

**在插件里接一个 Python sidecar / bridge，调用 `aiotieba` 来拿贴吧结构化数据。**

## 2. 项目定位

从本地仓库和官方文档看，`aiotieba` 的定位非常明确：

- 异步 Python 客户端
- 面向贴吧客户端 API，而不是网页抓取
- 内部包含 protobuf 请求、websocket 接口、签名和密码学实现

关键入口：

- [README.md](D:\companycode\tieba\aiotieba-master\README.md)
- [client.py](D:\companycode\tieba\aiotieba-master\aiotieba\client.py)
- 官方文档：[入门教程](https://aiotieba.cc/tutorial/start/)

## 3. 认证模型

这里有一个关键认知要纠正：

- 我们现在插件里做的是“整串 Cookie 输入”
- `aiotieba` 主路径使用的是 `BDUSS`

官方文档明确把 `BDUSS` 当作身份凭证，示例也是：

- `Client(BDUSS)`
- 或运行时设置 `client.account.BDUSS`

可参考：

- 官方文档 [入门教程](https://aiotieba.cc/tutorial/start/)
- [start.md](D:\companycode\tieba\aiotieba-master\docs\tutorial\start.md)

此外：

- `STOKEN` 也被支持
- 某些网页端接口需要 `STOKEN`
- 比如“获取本账号关注贴吧列表”这类接口就明确依赖 `STOKEN`

可参考：

- [account.py](D:\companycode\tieba\aiotieba-master\aiotieba\core\account.py)
- [get_self_follow_forums/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_self_follow_forums\_api.py)

### 对我们插件的直接影响

如果接 `aiotieba`，配置项应该改成：

1. 必填：`BDUSS`
2. 选填：`STOKEN`
3. 不再把“整串 Cookie”当成主认证输入

Cookie 仍然可以保留为 fallback，但不该是主路线。

## 4. 请求模型

`aiotieba` 里至少有三类请求路径：

### 4.1 客户端 protobuf 接口

这是最重要的一类，也是我们最该复用的一类。

例如：

- 获取帖子列表：`/c/f/frs/page`
- 获取帖子楼层：`/c/f/pb/page`
- 获取楼中楼：`/c/f/pb/floor`

这些接口都走 protobuf 请求体，而不是网页 HTML。

可参考：

- [get_threads/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_threads\_api.py)
- [get_posts/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_posts\_api.py)
- [get_comments/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_comments\_api.py)
- [http.py](D:\companycode\tieba\aiotieba-master\aiotieba\core\http.py)

### 4.2 网页端接口

有些接口还是网页端表单 / JSON 风格，比如：

- 获取本账号关注贴吧列表

这类接口会带：

- CookieJar
- `tbs`
- `STOKEN`

可参考：

- [get_self_follow_forums/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_self_follow_forums\_api.py)

### 4.3 websocket / BLCP

项目里还有 websocket 和 BLCP 通道，主要偏消息与更深的客户端行为。

这部分目前对我们的“贴吧阅读器”不是刚需。

可参考：

- [blcp.py](D:\companycode\tieba\aiotieba-master\aiotieba\core\blcp.py)

## 5. 加密 / 签名 / 设备参数

这就是这个项目真正有价值的地方。

### 5.1 签名

项目内有客户端签名实现，`helper.crypto.sign()` 会对参数列表计算贴吧客户端签名。

从源码看，核心逻辑是：

- 依次拼接 `key=value`
- 最后拼上常量后缀 `tiebaclient!!!`
- 做 MD5

可参考：

- [helper/crypto/__init__.py](D:\companycode\tieba\aiotieba-master\aiotieba\helper\crypto\__init__.py)
- [sign.c](D:\companycode\tieba\aiotieba-master\aiotieba\helper\crypto\src\tbcrypto\sign.c)
- [test_crypto.py](D:\companycode\tieba\aiotieba-master\tests\test_crypto.py)

### 5.2 设备参数

`Account` 里不只有 `BDUSS/STOKEN`，还有一整套客户端身份参数，例如：

- `android_id`
- `uuid`
- `client_id`
- `sample_id`
- `cuid`
- `cuid_galaxy2`
- `c3_aid`
- `z_id`

可参考：

- [account.py](D:\companycode\tieba\aiotieba-master\aiotieba\core\account.py)

### 5.3 原生密码学扩展

`helper/crypto` 不是纯 Python，里面有原生扩展源码和 `.pyi` 声明：

- `cuid_galaxy2`
- `c3_aid`
- `rc4_42`
- `sign`
- `enuid`

可参考：

- [crypto.pyi](D:\companycode\tieba\aiotieba-master\aiotieba\helper\crypto\crypto.pyi)
- [helper/crypto](D:\companycode\tieba\aiotieba-master\aiotieba\helper\crypto)

### 对我们插件的直接影响

这意味着：

- 想在 Node/TypeScript 里完整重写 `aiotieba` 的协议栈，成本很高
- 尤其是设备参数、签名、原生 crypto 和 protobuf 都要重做

所以“直接复用 Python”比“全量移植到 TS”更合理。

## 6. 它已经帮我们做好的数据结构

这部分和我们当前的 Reader Mode 目标高度契合。

### 6.1 `get_threads`

`client.get_threads()` 会返回结构化的主题帖列表，而不是 HTML。

返回内容至少包含：

- 标题
- 贴吧名 / 吧 id
- 帖子 id / 首楼 pid
- 作者信息
- 是否精品
- 是否置顶
- 内容碎片 `contents`
- 页信息 `page`
- 吧信息 `forum`

可参考：

- [client.py](D:\companycode\tieba\aiotieba-master\aiotieba\client.py)
- [get_threads/_classdef.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_threads\_classdef.py)

### 6.2 `get_posts`

`client.get_posts()` 对我们更重要。

它直接支持：

- 帖子分页
- `only_thread_author`
- `with_comments`
- `comment_sort_by_agree`
- `comment_rn`

而返回结构本身就已经包含：

- 楼层列表
- 楼主标记 `is_thread_author`
- 发布时间 `create_time`
- 回复数 `reply_num`
- 点赞数
- 楼中楼列表 `comments`
- 正文内容碎片 `contents`

可参考：

- [client.py](D:\companycode\tieba\aiotieba-master\aiotieba\client.py)
- [get_posts/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_posts\_api.py)
- [get_posts/_classdef.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_posts\_classdef.py)

### 6.3 `get_comments`

如果不想在 `get_posts()` 里直接带楼中楼，也可以单独拉。

可参考：

- [get_comments/_api.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_comments\_api.py)

### 6.4 内容碎片系统

这是最适合我们阅读器的部分。

项目不是只返回一坨正文字符串，而是把正文拆成 fragment：

- 纯文本
- 表情
- 图片
- @
- 链接
- 视频
- 音频
- TiebaPlus 等特殊碎片

可参考：

- [contents.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\_classdef\contents.py)
- [get_threads/_classdef.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_threads\_classdef.py)
- [get_posts/_classdef.py](D:\companycode\tieba\aiotieba-master\aiotieba\api\get_posts\_classdef.py)

### 对我们插件的直接影响

我们现在自己写的 HTML parser，只能拿到“清洗后的 HTML”和一些弱字段。

而 `aiotieba` 已经能给我们：

- 更稳定的结构化内容
- 更完整的楼层信息
- 富媒体类型区分
- 更好的楼中楼支持

这正是 Reader Mode 想要的。

## 7. 目前直接使用这个源码仓库的现实问题

我在当前机器上验证过一件事：

- Python 是有的
- 但直接从源码目录 `import aiotieba` 会因为依赖缺失失败

当前直接报的是：

- `ModuleNotFoundError: No module named 'cryptography'`

这还只是第一层依赖问题，后面还有原生 crypto 扩展构建问题。

所以本地这份源码仓库目前**不能直接拿来就 import**。

### 这意味着什么

如果要接它，工程上需要先做下面其中一种：

1. 用 `pip install aiotieba` 安装官方包
2. 或 `pip install -e ./aiotieba-master` 把本地仓库装进 Python 环境

前提是本机具备构建依赖或可直接拿到对应 wheel。

## 8. 我对集成方式的建议

## 8.1 最推荐方案：Python bridge

让 VS Code 插件继续保持 TypeScript UI，但把贴吧取数交给一个 Python bridge。

推荐结构：

- VS Code Extension：UI、状态、缓存、交互
- Python bridge：调用 `aiotieba.Client`
- 通信：`stdin/stdout JSON` 或本地 HTTP

例如 bridge 暴露这些动作：

- `get_threads`
- `get_posts`
- `get_comments`
- `get_self_info`
- `get_self_follow_forums`

### 这个方案的优点

- 不用在 Node 里重写贴吧客户端协议
- 可以直接复用 `aiotieba` 的数据模型和更新成果
- 我们的 Reader Mode 可以继续只做“展示层”

### 这个方案的缺点

- 需要本机有 Python
- 需要解决 Python 依赖安装
- 插件发布时要考虑 bridge 启动与环境检测

## 8.2 次优方案：只借协议，不直接依赖 Python

也可以只参考 `aiotieba` 的实现，在 TS 里自己重写“只读路径”：

- `get_threads`
- `get_posts`
- `get_comments`

但这条路代价明显更高：

- 需要处理 protobuf
- 需要重新实现请求头与参数
- 某些接口后续可能还会牵扯更多设备参数和签名

除非你明确不想引入 Python，否则不推荐。

## 8.3 不推荐方案：继续以 HTML 抓取为主

既然 `aiotieba` 已经证明贴吧客户端接口是可用的，就没有必要继续把 HTML parser 当主方案。

HTML 抓取更适合做 fallback，而不适合做主数据源。

## 9. 对我们当前插件的直接建议

如果按投入产出比排序，最合理的是：

1. 把“Cookie 输入”升级成“BDUSS / STOKEN 输入”
2. 新增 Python bridge 原型
3. 用 `aiotieba.get_threads()` 替代论坛 HTML 抓取
4. 用 `aiotieba.get_posts(with_comments=True)` 替代帖子 HTML 抓取
5. 把 `contents` fragment 映射到我们的 Reader Mode UI

### 最适合第一批接入的接口

我建议先只接这 4 个：

1. `get_threads`
2. `get_posts`
3. `get_comments`
4. `get_self_follow_forums`

这样就能覆盖：

- 吧帖子列表
- 帖子正文
- 楼中楼
- 我的关注吧

## 10. 下一步建议

我建议下一步不要继续研究，而是直接开始做最小桥接验证。

最合理的实施顺序：

1. 先加 `BDUSS / STOKEN` 安全输入
2. 写一个最小 Python bridge 脚本
3. 先跑通 `get_threads("原神")`
4. 再跑通 `get_posts(tid, with_comments=True)`
5. 最后把现有 `TiebaService` 切到 bridge 数据源

## 11. 结论

对于“贴吧数据是加密的”这件事，`aiotieba` 已经替我们做了大量最难的工作。

这份项目研究的最终结论很明确：

- 它值得接
- 它比我们继续抓 HTML 更适合 Reader Mode
- 最佳集成路线是“TypeScript 插件 + Python aiotieba bridge”
