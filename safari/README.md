# Focus for macOS Safari

Focus 1.5 的 Safari Web Extension，附 Swift macOS 安装应用。最低 macOS 14 / Safari 17；支持 macOS Sequoia。根目录 Chrome 扩展和商店素材未修改。

## 构建与运行

在仓库根目录执行（需要完整 Xcode；本机验证版本为 Xcode 26.6）：

```sh
python3 safari/scripts/sync-resources.py
xcodebuild -project safari/Focus/Focus.xcodeproj -scheme Focus \
  -configuration Debug -destination 'platform=macOS' \
  -derivedDataPath safari/.build build
open safari/.build/Build/Products/Debug/Focus.app
```

也可 `open safari/Focus/Focus.xcodeproj`，选择 **Focus → My Mac → Run (⌘R)**。已提交共享 scheme。Debug 默认使用 **Sign to Run Locally**（ad-hoc），无需开发者账号。Release/分发需在两个 target 的 Signing & Capabilities 中选择自己的 Team 和签名方式。

应用 ID：`com.chriszou.focus.safari`；扩展 ID：`com.chriszou.focus.safari.Extension`。应用仅用于安装和打开 Safari 扩展设置，关闭后不影响扩展运行。

## 在 Safari 启用

1. 运行 Focus.app，点击「打开 Safari 扩展设置」。
2. 本地 ad-hoc 构建需先在 **Safari → 设置 → 高级 → 显示网页开发者功能**，再在 **设置 → 开发者 → 允许未签名的扩展** 打勾。Safari 退出后可能需要重新打开此开关。
3. **设置 → 扩展 → Focus** 打勾启用。使用多个 Safari Profile 时，也要在当前 Profile 中启用。
4. 点击「编辑网站…」，把**所有网站 / 其他网站**设为**允许**；或在工具栏扩展授权提示中选择「始终允许在所有网站上」。不要只授权被屏蔽网站：Focus 还需要观察离开网站的导航，才能正确结束一次访问。
5. 在普通窗口新开 `https://www.youtube.com/`，应跳到 Focus 专注页。工具栏 Focus 弹窗可打开设置、配置限额与白名单。

本机已构建并注册应用。macOS 拒绝通过 `defaults` 写入 Safari 偏好，所以上述开关和网站授权需要在 Safari 界面完成；构建脚本不会绕过授权。找不到扩展时，重新运行应用，并检查：

```sh
pluginkit -mAvvv -i com.chriszou.focus.safari.Extension
```

## 兼容处理

- JS、HTML、`styles.css` 和扩展图标直接复制自根目录，业务逻辑不变：黑白名单、每日限额、禁止粘贴的手输确认、专注页、统计、行内限额编辑、中文界面；不添加临时放行或平均时长。
- Safari manifest 保留 MV3，后台使用 `scripts: ["background.js"]`、`persistent: false`。Safari 支持 service worker，但本机隔离 WebKit 宿主中 worker 的消息未返回；非持久后台页面已通过实际消息/存储测试。访问凭证仍存于 `storage.session`，不依赖后台常驻。
- 保留 `chrome.*`，无需 polyfill。Apple 确认同时支持 `chrome.*` / `browser.*`、callback / Promise；`storage.session` 从 Safari 16.4 起支持。[Apple API 兼容说明](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
- 增加 `host_permissions: ["http://*/*", "https://*/*"]`，保留 `webNavigation`、`storage`。Safari 17 不向未授权网站发送导航事件；manifest 声明本身不会授予访问权限。无需额外 `optional_host_permissions`、原生 `grantedAccess` 设置或 content script。[Safari 17 发布说明](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes)
- `runtime.getURL()` 自动生成扩展 URL；后台用 `tabs.update()` 打开 confirm/redirect，popup 用 `tabs.create()` 打开 settings。这些是扩展内部导航，无需向网页公开 `web_accessible_resources`。异步消息保留原有 `return true` / `sendResponse`。
- 与 Chrome 一样，这是导航后重定向，不是网络请求防火墙；页面可能短暂加载。Safari 内置页不属于 HTTP/HTTPS 权限范围。存储与 Chrome 独立；无自动迁移/同步。隐私浏览需要单独启用并授权，未在本次验收范围内。弹窗「正在保持专注」保留 1.5 行为，不代表已授予网站权限。

## 同步 Chrome 更新

只编辑根目录业务文件，再运行 `python3 safari/scripts/sync-resources.py` 并重新构建。脚本将十个业务文件和 `icons/` 复制到 `Focus/Focus Extension/Resources/`，重写上述两项 manifest 差异。不要直接修改复制的文件。以后新增资源时，也需更新脚本文件列表及 Xcode 扩展 target 的 Copy Bundle Resources。

工程由 Apple 转换器生成；初始命令如下（**已有工程不要重复运行 `--force`，会覆盖 Swift 和项目配置**）：

```sh
python3 safari/scripts/sync-resources.py --destination safari/.staging
xcrun safari-web-extension-converter safari/.staging --project-location safari \
  --app-name Focus --bundle-identifier com.chriszou.focus.safari \
  --macos-only --swift --no-prompt --force --copy-resources --no-open
```

## 验证

```sh
node --test safari/tests/behavior.test.mjs
# 以下原生测试需要 macOS 15.4+，仅使用隔离的 WebKit 测试上下文：
xcrun swiftc -parse-as-library safari/tests/validate-manifest.swift \
  -o safari/.build/validate-manifest
safari/.build/validate-manifest \
  'safari/.build/Build/Products/Debug/Focus.app/Contents/PlugIns/Focus Extension.appex'
```

本机 macOS 26.2 / Safari 26.2：Debug `xcodebuild` 成功；六项 Node 回归测试验证资源一致、白名单、限额/跨日/后台重载、设置消息、1.5 迁移和输入防粘贴；原生 WebKit 验证打包 manifest、后台消息、local/session storage 和四个扩展页面。Safari 17 / Sequoia 兼容性依据 Apple 文档和 macOS 14 deployment target，未在这些旧系统上实机测试。

授权后手动验收：设 YouTube 每日限额为 1 → 尝试粘贴（应拒绝）→ 手输确认进入 → 同标签页站内跳转不重复计数 → 离开到其他网站后再返回应屏蔽；检查弹窗剩余次数、白名单路径和设置行内编辑。Safari 实际导航/权限流程需完成上述手动步骤后验证。[Apple 运行说明](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
