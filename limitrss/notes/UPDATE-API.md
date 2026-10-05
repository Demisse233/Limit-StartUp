# 检查更新接口

供 LimitRSS 客户端在「设置 → 关于 → 检查更新」时调用。

站点是**纯静态托管**（Retinbox，只有 HTML/CSS/JS/JSON，没有后端进程），
所以这个接口是**构建时生成的静态 JSON**——对客户端来说就是一个普通 HTTP GET。

## 端点

```
GET https://www.demisse.cn/limitrss/api/check-update.json
```

- 无需任何鉴权、无需 API Key
- 响应 `Cache-Control: no-store`，每次请求都是最新结果
- 允许跨域（`Access-Control-Allow-Origin: *`）
- 建议客户端加时间戳参数绕开中间缓存：`?t=<毫秒时间戳>`

浏览器端还有一个免 CORS 的副本（JSONP 式全局变量）：

```
GET https://www.demisse.cn/limitrss/api/check-update.js
→ window.LIMITRSS_UPDATE_INFO = { ... }
```

## 响应结构（schemaVersion 1）

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-05T08:33:30.753Z",
  "product": "LimitRSS",

  "versions": {
    // 更新日志里的最新版本 —— 用它判断"有没有新版本"
    "latest": "0.4.0",
    "latestReleaseDate": "2026-10-05",
    "latestPrerelease": false,
    // 历史版本列表（从新到旧），可用于"版本历史"页面
    "changelog": [{ "version": "0.4.0", "date": "2026-10-05" }]
  },

  "notes": {
    "url": "https://www.demisse.cn/limitrss/changelog",
    "summary": "新增应用图标角标展示未读文章数量功能（Windows 平台不支持）",
    "general": [{ "platform": "general", "kind": "new", "text": "..." }],
    "items": [{ "platform": "mac", "kind": "fix", "text": "..." }]
  },

  "platforms": {
    "mac": {
      "label": "macOS",
      "version": "0.3.1",          // 该平台实际可下载的版本
      "available": true,           // 是否有安装包
      "upToDateWithLatest": false, // 该平台的包是否就是 latest
      "downloadUrl": "https://github.com/.../LimitRSS-0.3.1-macOS.dmg",
      "fileName": "LimitRSS-0.3.1-macOS.dmg",
      "releasePage": "https://github.com/.../releases/tag/v0.3.1"
    },
    "windows": { "available": false, "downloadUrl": null, "...": "..." }
  },

  "links": {
    "changelog": "https://www.demisse.cn/limitrss/changelog",
    "downloads": "https://www.demisse.cn/limitrss/",
    "releasePage": "https://github.com/Demisse233/LimitRSS_Client/releases",
    "releasePageForVersion": "https://github.com/.../releases/tag/v0.3.1",
    "latestReleaseExists": false
  }
}
```

### 字段说明（客户端需要重点注意的）

| 字段 | 含义 |
|---|---|
| `versions.latest` | **判断有没有新版本的唯一依据**。更新日志一写就变，早于安装包上传 |
| `platforms.<p>.version` | 该平台**实际能下载到**的版本。可能低于 `latest` |
| `platforms.<p>.available` | 为 `false` 时**不要显示下载按钮**，否则会点到 404 |
| `platforms.<p>.upToDateWithLatest` | `false` 表示"有新版，但这个平台的包还没传" |
| `links.latestReleaseExists` | `false` 表示 `latest` 还没建 Release |

**两个版本号为什么可能不一样**：更新日志通常先写、安装包后上传。
这段时间里 `latest` 已经是新版，但 `platforms.<p>.version` 还是旧版。
接口**不会**给出不存在的下载地址（宁可回退也不给死链）。

## 版本比较规则

必须按**语义化版本**逐段比较，**不能直接字符串比较**：

```
0.10.0  >  0.9.0     ← 字符串比较会得出相反结论
1.0.0   >  0.99.99
0.4.0-beta.1 < 0.4.0  ← 预发布版小于同号正式版
```

参考实现（Dart）：

```dart
/// 返回 >0 表示 a 比 b 新，<0 表示更旧，0 表示相同
int compareVersion(String a, String b) {
  final pa = _parse(a);
  final pb = _parse(b);
  if (pa == null || pb == null) return 0;
  for (var i = 0; i < 3; i++) {
    if (pa.nums[i] != pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  if (pa.pre != null && pb.pre == null) return -1; // 预发布 < 正式
  if (pa.pre == null && pb.pre != null) return 1;
  if (pa.pre != null && pb.pre != null) return pa.pre!.compareTo(pb.pre!);
  return 0;
}

class _V {
  final List<int> nums;
  final String? pre;
  _V(this.nums, this.pre);
}

_V? _parse(String raw) {
  final m = RegExp(r'^(\d+)\.(\d+)\.(\d+)(?:[-+](.+))?$').firstMatch(raw.trim());
  if (m == null) return null;
  return _V(
    [int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!)],
    m[4],
  );
}
```

## 推荐调用流程

```
1. 取本地版本           package_info_plus → version
2. GET check-update.json?t=<时间戳>
3. 若 versions.latest 比本地版本新 → 有更新
4. 弹窗展示 notes.general（或 notes.summary）
5. 取 platforms[当前平台]：
     available == false        → 按钮禁用，提示"该版本安装包准备中"
     upToDateWithLatest == true → 按钮跳 downloadUrl 直接下载
     否则                       → 按钮跳 downloadUrl（拿到的可能是上一个版本）
                                  并在提示里说明
6. 任何网络异常都不要阻塞用户 —— 降级为"检查失败，请稍后重试"
```

## 客户端平台标识

用这些键去取 `platforms`：

| 平台 | 键 |
|---|---|
| macOS | `mac` |
| Windows | `windows` |
| iOS | `ios` |
| Android | `android` |
| HarmonyOS | `harmony` |

## 注意事项

- **不要用 GitHub API 做版本判断**。GitHub 的 release 下载会 302 到
  `objects.githubusercontent.com`，该链路没有 CORS 头，浏览器端 fetch 一律
  `TypeError: Failed to fetch`（已实测）。而且 GitHub API 有速率限制。
  本接口在构建时就把 GitHub 数据取好了。
- **`generatedAt` 是接口生成时间**，不是版本发布时间；后者看
  `versions.latestReleaseDate`。
- 接口内容随每次发版自动更新，客户端**不需要**跟着改。

## 维护方式（网站侧）

接口由 `scripts/gen-update-api.mjs` 生成，数据来自：

```
notes/changelog.md       ← 你维护的唯一数据源
  ↓ npm run sync
data/changelog.json      ← 决定 versions.latest 与 notes
data/downloads.json      ← 由 GitHub Release 实际内容生成，决定 downloadUrl
  ↓
api/check-update.json    ← 接口产物
api/check-update.js      ← 浏览器端副本
```

所以发新版的顺序是：

```
1. 改 notes/changelog.md 的版本号与条目
2. npm run sync           # 自动同步日志、拉取 Release 清单、重生成接口
3. 把安装包传到 GitHub Release（tag = v<版本号>）
4. 再跑一次 npm run sync  # 让接口认出新上传的包
```

第 3 步之后如果不重跑 sync，接口里 `platforms.<p>.version` 会停留在上一个版本
（`latest` 仍是最新的，客户端能正确提示"有更新"，只是下载地址指向旧包）。
