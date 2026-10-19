# Google Scholar Author Highlighter — Zen (Firefox) 移植版

Chrome 商店原版（[ijmngekkpaccbbjimedfkjpigplaikah](https://chromewebstore.google.com/detail/google-scholar-author-hig/ijmngekkpaccbbjimedfkjpigplaikah)）v2.4.0
逆向移植为 Zen / Firefox 兼容版本。**全部功能与样式保留**：19 个文件（JS/CSS/HTML/图标）与原版逐字节一致，仅重写 `manifest.json`。

## 目录结构

```
scholar-author-highlighter-zen/
├── original/
│   ├── extension.crx        # 商店下载的原始 CRX（74,864 字节, CRX3）
│   └── unpacked/            # 解包后的原版 v2.4.0
├── zen/                     # Zen/Firefox 移植版源码（可加载）
├── dist/
│   └── google-scholar-author-highlighter-2.4.0-zen.xpi   # 打包好的安装包
└── report/                  # REA 分析证据、web-ext lint 报告等
```

## 移植差异（仅 manifest.json）

| 项目 | Chrome 原版 | Zen 版 | 原因 |
|---|---|---|---|
| `update_url` | clients2.google.com 更新地址 | 已移除 | Chrome 专用，Firefox 忽略 |
| `background` | `{"service_worker": ...}` | `{"scripts": [...]}` | Firefox MV3 用事件页而非 Service Worker |
| `browser_specific_settings.gecko` | 无 | id + `strict_min_version: 127.0`` | Firefox 必需；127 保证 `ClipboardItem`（截图复制）可用 |
| `_metadata/` | 商店签名元数据 | 已排除 | Chrome 商店专有 |

其余全部原样保留：`name` / `version` (2.4.0) / `description` / `icons` / `action` / `permissions: ["storage"]` / `host_permissions: ["<all_urls>"]` / 197 条 scholar 域名匹配 / 13 个内容脚本注入顺序 / `styles/highlight.css`。

## 兼容性验证

- ✅ 19 个文件与原版**逐字节一致**（filecmp 全量比对）
- ✅ 全部 JS 通过 `node --check` 语法校验
- ✅ `web-ext lint`：**0 errors**（7 个 warning 均继承自原版代码：innerHTML 用法 ×5、图标仅 128px ×1、AMO 数据收集声明 ×1）
- ✅ API 面核查：仅使用 `chrome.storage` / `chrome.runtime` / `chrome.tabs`，Firefox 全部原生支持
- ✅ 截图复制用 `ClipboardItem`，Firefox 127+ 支持（`strict_min_version` 已设 127）
- ✅ REA 静态分析（证据 `ev_c21ef575...`）：无 Electron/专有边界依赖

## 在 Zen 中安装

### 方式一：临时加载（立即可用，重启浏览器后失效）

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点「临时载入附加组件…」
3. 选择 `dist/google-scholar-author-highlighter-2.4.0-zen.xpi`（或 `zen/manifest.json`）
4. 安装时提示「访问所有网站数据」权限——这是原版就有的 `<all_urls>`（学术元数据 API 与截图功能需要），点允许

### 方式二：永久安装（需要 AMO 签名）

Zen 基于正式版 Firefox，永久安装需签名。用你自己的 [addons.mozilla.org](https://addons.mozilla.org) 账号生成 API Key（developer hub → Manage API Keys）后执行：

```bash
npx web-ext sign --source-dir zen \
  --api-key <你的JWT issuer> --api-secret <你的JWT secret> \
  --channel unlisted --artifacts-dir dist
```

签名后的 xpi 即可在 Zen 中 `about:addons` → 齿轮 → 「从文件安装附加组件」永久安装。

## 与 Chrome 版的行为差异

- 权限授予方式：Chrome 安装时默认获得 `<all_urls>`；Firefox/Zen 会显式弹窗询问（拒绝后高亮仍工作，但学术元数据补全和截图功能不可用）
- 更新：不接入 Chrome 商店更新通道；升级时重新下载新版 CRX 重跑本移植流程即可

## 功能清单（v2.4.0 原版全量）

一作/二作/共同一作/通讯/末位作者高亮 · h-index / i10 / 引用数指标 · 年份过滤 · 隐藏非匹配论文 · 作者姓名高亮 · 截图复制/下载 · 截断作者列表经 OpenAlex / Crossref / DataCite / arXiv 补全末位作者（带限流缓存）

## 原版版权

原作者 Yue Deng（yue0068@gmail.com），本移植仅供个人学习使用，请尊重原版许可。
