# Egern 小组件合集

iOS 上 Egern 用的小组件脚本，开源可改。数据源都是免费接口，天气小组件无需注册 key。

| 小组件 | 目录 | 数据源 |
|---|---|---|
| Komari 探针监控 | `komari/` | 自己的 Komari 面板公开 API |
| 流量圆环 | `traffic/` | 自己的 Komari 面板公开 API |
| 天气 | `weather/` | Open-Meteo（免费、无需 key） |
| 机场流量 | `airport/` | 机场订阅链接的 `subscription-userinfo` 响应头 |
| 中国电信 | `telecom/` | 电信手机营业厅（需登录 cookie） |
| 无聊按钮 | `boredom/` | 内置点子库，可自定义（纯本地，无需网络） |
| 每日古诗 | `poem/` | 今日诗词（免费、无需 key） |
| Spotify 三合一 | `spotify/` | 去广告 + 解锁 Premium（部分）+ DualSubs 双语歌词 |

## 安装（小组件通用）

1. 打开 Egern → **模块** → 右上角 **＋** → 粘贴下面对应小组件的 YAML 链接 → 启用：

   ```
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/komari/komari-widget.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/traffic/traffic-widget.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/weather/weather-widget.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/airport/airport-widget.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/telecom/china-telecom.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/boredom/boredom-widget.yaml
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/poem/poem-widget.yaml
   ```

   代理类模块（非小组件）：

   ```
   https://raw.githubusercontent.com/xccverse/egern-widgets/main/spotify/spotify.yaml
   ```

2. 在模块的 **Env** 里按需改配置（见下表），其他保持默认即可。
3. 回桌面长按 → 添加小组件 → 选 **Egern** → 编辑小组件 → 选择对应名称。

也可以直接用 JS 脚本：把模块换成「脚本」方式添加，脚本地址填上面对应目录里的 `.js` raw 链接，再手动配好同样的 Env。

## Komari 探针监控

从 Komari 面板公开 API 抓取探针信息，在桌面看节点状态：在线情况、节点名称、各 ping 任务的延迟和丢包率、累计上传 / 下载流量、套餐限额和使用率。

额外功能：

- **VPS 到期提醒**：大尺寸显示每台机器的到期日期、剩余天数和续费价格，`EXPIRE_WARN_DAYS` 天内标红；小尺寸直接汇总"⚠️ X 台服务器 X 天内到期"。
- **流量用完预测**：按最近 24 小时用量估算流量多少天后见底，显示在"已用"后面（如"预计 22 天后用完"）。
- **多面板聚合**：`KOMARI_URLS` 里多个面板地址用 `|` 隔开，一个小组件看全部门板，节点按面板分组显示；只填一个时跟以前完全一样。
- **紧凑模式**：大尺寸下节点数超过 `COMPACT_THRESHOLD`（默认 8）自动切换成一行一个节点的紧凑排版，15 个节点也放得下（iOS 小组件本身不支持滚动，这是替代方案）。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `KOMARI_URL` | 是（单面板时） | Komari 面板地址，如 `https://你的面板域名:端口`。变量名必须全大写，值填面板地址（不要填脚本的 raw 链接，也不要在后面加 `/api` 之类的路径） |
| `KOMARI_URLS` | 否 | 多面板地址，用 `\|` 或换行分隔，如 `https://a.com\|https://b.com`；留空则用上面的 `KOMARI_URL` |
| `EXPIRE_WARN_DAYS` | 否 | 服务器剩余天数小于等于此值时标红提醒，默认 14 |
| `REFRESH_HOURS` | 否 | 刷新间隔（小时），0.5 ~ 24，默认 1 |
| `MAX_NODES` | 否 | 中尺寸小组件最多显示的节点数，默认 4（大尺寸显示全部） |
| `COMPACT_THRESHOLD` | 否 | 大尺寸下节点数超过此值时自动切换紧凑模式，默认 8 |

### 小组件尺寸

- **小尺寸**：在线节点数 + 全部节点总已用流量（有即将到期的机器时显示红色预警）
- **中尺寸**：每个节点一行——名称、地区、平均延迟、已用 / 总量流量条
- **大尺寸**：全部节点，展开每个 ping 任务的延迟明细、运行时间、到期信息和流量预测
- **锁屏**：在线比例圆环 / 单行状态

节点按名称开头的数字自动排序（如 `1.FnNAS → 2.ALI-HK`），深浅模式自动适配。

## 流量圆环

同样读 Komari 面板：每台机器一条"赛车跑道"式的椭圆跑道，从外到内按 1~N 排，一台一种颜色，跑道颜色和下面列表的圆点一一对应。

进度条从跑道顶部中点开始、连续顺时针延伸，用的越多有颜色部分越长；不限量的节点跑道是整圈实色。不限量节点显示"已用 X / 不限量"。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `KOMARI_URL` | 是（单面板时） | Komari 面板地址，如 `https://你的面板域名:端口` |
| `KOMARI_URLS` | 否 | 多面板地址，用 `\|` 或换行分隔；留空则用上面的 `KOMARI_URL` |
| `REFRESH_MINUTES` | 否 | 刷新间隔（分钟），10 ~ 180，默认 30 |

### 小组件尺寸

- **大尺寸**：上下布局——上面赛车跑道（最多 8 条道），下面机器列表（已用 / 总量 / 使用率）
- **中尺寸**：左跑道 + 右列表（最多 4 台）
- **小尺寸**：第 1 台的单条跑道
- **锁屏**：圆形单环，三种尺寸都支持

深浅模式自动适配。

## 天气

显示指定城市的当前天气、逐小时和未来 3 天预报。

显示内容：当前温度 / 天气 / 体感温度 / 湿度 / 风速，明后天小预报（星期 / 图标 / 最高最低 / 降水概率），日出日落时间。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `LOCATION` | 否 | 城市名（如 `青岛`）、"城市,省份"（如 `青岛,山东`）或 "纬度,经度"（如 `36.07,120.38`），默认 `青岛`。城市搜索按人口排序，重名城市优先选大的那个 |
| `REFRESH_MINUTES` | 否 | 刷新间隔（分钟），10 ~ 180，默认 30 |
| `TEMP_UNIT` | 否 | `c` 摄氏 / `f` 华氏，默认 `c` |

### 小组件尺寸

- **小尺寸**：当前温度 + 天气 + 今日最高 / 最低
- **中尺寸**：再加未来数小时逐小时 + 明后天小预报
- **大尺寸**：再加未来 3 天预报
- **锁屏**：当前温度 + 天气图标

深浅模式自动适配。

## 机场流量

从机场订阅链接读取流量使用和到期时间：请求订阅链接（先 HEAD，拿不到再 GET，不会多下东西），从返回头 `subscription-userinfo` 里解析已用 / 总量和到期时间。

显示：已用 / 总量 / 剩余 / 使用率进度条，到期日期 + 剩余天数；剩余天数小于等于 `WARN_DAYS`（默认 7 天）或使用率达到 `WARN_PCT`（默认 90%）时标红。

注意：有些机场只给 Clash / Stash 类客户端返回流量头，默认请求 UA 是 `ClashMeta/1.18.0`（`USER_AGENT` 可改）。如果小组件报失败，把 Env 里 `DEBUG` 填 `1` 再刷新，小组件会显示服务器返回的状态码和响应头名称，方便排查。

订阅链接里有 token，只存在你自己手机的 Env 里，脚本和仓库里都是空的。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `SUB_URLS` | 是 | 机场订阅链接，多个用 `\|` 或换行分隔；可用「名字=链接」命名，如 `我的机场=https://sub.xxx/abc` |
| `REFRESH_MINUTES` | 否 | 刷新间隔（分钟），10 ~ 720，默认 60 |
| `WARN_DAYS` | 否 | 到期提醒阈值（天），剩余天数小于等于此值时标红，默认 7 |
| `WARN_PCT` | 否 | 流量告警百分比，使用率达到此值时标红，默认 90 |
| `USER_AGENT` | 否 | 请求 UA，默认 `ClashMeta/1.18.0` |
| `DEBUG` | 否 | 填 `1` 开启调试，失败时显示状态码和响应头名称 |

### 小组件尺寸

- **小尺寸**：1 个订阅
- **中尺寸**：2 个订阅
- **大尺寸**：最多 5 个订阅
- **锁屏**：三种尺寸都支持

## 中国电信

显示电信话费余额、通用流量、定向流量和语音余量：四张卡——话费¥ / 通用蜂窝 / 定向闪电 / 语音电话。

原脚本来自 SIJULY/egern-radar（移植自 Scriptable 版 ChinaTelecom_2024），改版点：语音的显示不再跟着流量开关走，`CT_SHOW_USED_VOICE` 独立控制，默认显示剩余语音。

登录方式：模块自带登录捕获——Egern 里装好模块、开着 VPN 去 Safari 登录一次 e.dlife.cn，cookie 会自动抓取保存，全程不用手动填。也可以手动二选一：填抓包得到的 `CT_LOGIN_URL`（小组件会自动更新 cookie，优先）或直接填 `CT_COOKIE`。

标题前有状态灯：🟢 登录有效 / 🔴 登录失效（点小组件直接跳登录页重登）/ ⚪ 灰色表示用的缓存、状态未知。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `CT_LOGIN_URL` | 二选一 | 电信登录地址（抓包得到），用于自动更新 cookie；与 `CT_COOKIE` 二选一，URL 优先 |
| `CT_COOKIE` | 二选一 | 直接填写 cookie |
| `CT_SHOW_USED_FLOW` | 否 | 填 `true` 显示已用流量，不填显示剩余流量 |
| `CT_SHOW_USED_VOICE` | 否 | 填 `true` 显示已用语音，不填显示剩余语音（不受上一项影响） |
| `CT_SHOW_DIRECT` | 否 | 定向卡显示：`false` 隐藏定向卡（3卡模式），`true` 强制4卡，不填自动判断 |
| `CT_TITLE` | 否 | 小组件标题，默认 `中国电信` |
| `CT_KEEPALIVE` | 否 | 填 `false` 关闭定时保活；默认开启，每 20 分钟自动请求一次接口续 session，避免 cookie 过期 |

定时保活是模块的 schedule 配置，生效需要**删掉 Egern 里旧的中国电信模块，用更新后的 YAML 重新添加一次**（只覆盖 JS 不行）。

## 无聊按钮

不知道干啥时看它：按时段（深夜 / 早晨 / 白天 / 晚上）随机推荐一个打发时间的主意，每次刷新换一个，不会连续重复。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `REFRESH_MINUTES` | 否 | 刷新间隔（分钟），10 ~ 180，默认 30 |
| `CUSTOM_IDEAS` | 否 | 自定义点子，每行一个，格式"emoji 文案"，如 `🎮 打一局星露谷` |

### 小组件尺寸

- **大 / 中 / 小 / 锁屏**：四种尺寸都支持，大尺寸字更大

## 每日古诗

每天一首古诗：用今日诗词免费接口，每次刷新随机换一首，显示诗句 + 作者 + 出处，断网时用缓存顶着。

### Env 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `REFRESH_MINUTES` | 否 | 刷新间隔（分钟），10 ~ 720，默认 120 |

### 小组件尺寸

- **大尺寸**：一次显示两首
- **中 / 小尺寸**：一首
- **锁屏**：三种尺寸都支持

深浅模式自动适配。

## Spotify 三合一

不是小组件，是代理模块：去广告 + 解锁 Premium（部分功能）+ DualSubs 双语歌词。

- **去广告**：拦截弹窗广告、首页 / 搜索页 / 信息流广告位、AI DJ、广告统计上报
- **解锁**：去除播放广告、正常展示歌手 / 专辑列表、去除随机播放限制（超高音质不支持，原规则只承诺部分解锁）
- **双语歌词**：外语歌词自动译为简体中文，译文显示在原文下面（DualSubs v1.10.0，默认 Google 翻译 + 网易云歌词源）

使用步骤：

1. 先登录 Spotify，再启用模块（已登录可跳过）。
2. Egern 必须安装并信任 MITM 证书，模块启用后把 Spotify 从后台划掉重开。
3. 歌词想换配置（繁体 / 换翻译源等）去设置面板：https://dualsubs.github.io/settings/

## 常见问题

- **Komari 显示"等待面板地址"**：`KOMARI_URL` 没填或填错了，去模块 Env 里检查。
- **Komari 报错 400 / 请求地址不对**：八成是把脚本的 raw 链接填进了 `KOMARI_URL`，或者地址后面多加了路径。只填面板根地址。
- **机场流量小组件报失败**：先确认机场订阅链接本身有效；再看是不是 UA 问题（默认 `ClashMeta/1.18.0`，`USER_AGENT` 可换）；还不行就开 `DEBUG=1` 看状态码和响应头。
- **小组件长时间不刷新**：Egern 按刷新间隔定时刷新，也可以手动刷新小组件立即更新。
- **更新后还是旧版**：`raw.githubusercontent.com` 有约 5 分钟 CDN 缓存，push 后等几分钟再刷新；还不行就把模块删掉重新添加一次（清 Egern 的脚本缓存）。
- **天气城市搜出来不对**：Env 里用 "城市,省份" 或直接填经纬度，最稳。
- **中国电信小组件报 `Unexpected token '<'`**：脚本 URL 填成了 `github.com/.../blob/...` 的网页地址，把它换成上面 telecom 目录的 **raw** 链接。
- **改了 Env 配置后显示的还是旧数据**：标题旁写着"缓存 XX:XX"说明现在显示的是旧缓存。确认脚本 URL 是新版 raw 链接后，用 Safari 重新登录一次电信（cookie 过期会导致拉取失败、一直用缓存），再刷新小组件，缓存标记消失即生效。
- **加了电信定时保活但没生效**：保活是 YAML 模块的 schedule 配置，删掉 Egern 里旧的中国电信模块、用新版 YAML 重新添加一次才会生效。

## 要求

- Komari 小组件 / 流量圆环：Komari 面板（API 公开可访问即可，无需登录）
- 天气 / 机场流量：无需注册、无需 key
- 中国电信：需要中国电信手机号的登录 cookie（模块自带登录捕获，Safari 登录一次自动抓）
- 无聊按钮 / 每日古诗：无需注册、无需 key（古诗需要网络拉取）
- Spotify：需要 Spotify 账号登录 + Egern 安装并信任 MITM 证书
