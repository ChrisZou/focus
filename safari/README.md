# Focus for macOS Safari

Focus 1.5 的 Safari Web Extension，附 Swift macOS 安装应用。最低 macOS 14 / Safari 17；支持 macOS Sequoia。根目录 Chrome 扩展和商店素材未修改。

## 构建与运行

日常使用装 Release 版（公司团队 `W4SX57U6XB` 的 Apple Development 证书签名），在仓库根目录执行（需要完整 Xcode；本机验证版本为 Xcode 26.6）：

```sh
python3 safari/scripts/sync-resources.py
xcodebuild -project safari/Focus/Focus.xcodeproj -scheme Focus \
  -configuration Release -destination 'platform=macOS' \
  -derivedDataPath safari/.build build
pkill -x Focus; rm -rf /Applications/Focus.app
ditto safari/.build/Build/Products/Release/Focus.app /Applications/Focus.app
open /Applications/Focus.app
```

**不要用 Debug 版日常使用。** Debug 是 ad-hoc 签名，Safari 会把它当成「未签名扩展」（标识带 `(UNSIGNED)`），而「允许未签名的扩展」每次 Safari 退出都会自动关闭，扩展随之静默停用——这就是 Safari 版「总是失效」的原因。团队签名的扩展不依赖这个开关。也不要直接从 `safari/.build` 运行：重新构建或清理会让注册路径失效。

不要改用未公证的 Developer ID 签名：Safari 会报 “Computing the code signing dictionary failed”，扩展列表里根本不出现。分发时用 Developer ID 签名并 `notarytool` 公证、staple。Debug 仍可 **Focus → My Mac → Run (⌘R)** 调试。

应用 ID：`com.chriszou.focus.safari`；扩展 ID：`com.chriszou.focus.safari.Extension`。应用仅用于安装和打开 Safari 扩展设置，关闭后不影响扩展运行。

## 在 Safari 启用

1. 运行 Focus.app，点击「打开 Safari 扩展设置」。
2. 仅 Debug（ad-hoc）构建需要 **设置 → 开发者 → 允许未签名的扩展**，且 Safari 每次退出都会重置；Release 版跳过此步。签名版与未签名版在 Safari 中是两个不同的扩展，存储（屏蔽列表、限额、白名单）不互通。
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

## 导航拦截可靠性修复

根目录与 Safari 共用 `onCommitted` 拦截主文档，`onBeforeNavigate` 仅使该标签页旧的异步检查失效；关闭标签页也使旧检查失效。跳转 Promise 的错误会被记录。白名单、限额、确认页与 session 放行凭证沿用原规则，离站凭证清理改为实际提交后执行，取消的导航不会误清理。manifest 差异仍只由同步脚本生成。

原代码仅在 `onBeforeNavigate` 中异步读取存储后调用 `tabs.update`，没有任何提交阶段检查；注释将其描述为“取消当前导航”，但导航通知没有取消返回值。[API 文档](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)区分导航开始与文档提交，并说明同一主框架可能有重叠的导航序列。新增模拟将网页提交与 `tabs.update` 独立驱动：如果原网页在早期跳转后仍提交，旧实现最终停在 YouTube；如果只观察到提交事件，旧实现完全不拦截。两种情况在修复后都会跳到 Focus，且不会重复统计同一次提交。

这是已复现的代码缺口，并非 Safari 26.3 实际事件顺序的取证。模拟中“原导航继续提交”和“未观察到开始事件”是显式输入条件，不能证明 Safari 确实如此；后台未启动或未收到任何导航事件也不在此修复的保证范围内。拦截现在等待文档提交，可能短暂显示网页；没有文档提交的挂起请求不会触发拦截。真实 Safari 的 15 秒观察仍需后续安装新版后完成。

2026-11-09 的 live 验收已经否定了“5507b14 已解决 Safari 故障”：安装文件与源码一致，后台强制加载后 YouTube 仍停留在首页至少 20 秒。当前根因尚未证实，不能仅归因于后台唤醒。详见 [本轮取证和交接](INVESTIGATION-20261109.md)。

本轮加入临时内存诊断，并修复确认流程的两个未等待 `tabs.update()` 调用：API 拒绝时向确认页返回失败，避免假报成功。此缺口有旧源码失败测试，但不能解释尚未进入确认页的首页故障。

## 地址栏预载导致的漏拦（2026-11-10）

输入 `tw` 让 Safari 自动补全 x.com 后立刻回车：Safari 先在预载页里加载并提交网站，回车把它换进可见标签页，发给它的 `tabs.update()` **照常 resolve 但跳转丢失**（WebKit 日志只记 `Tab N was not found`），之后不再有 `onCommitted`。修复：每次跳转（或跳转报错）后 0.6 秒起、约 10 秒内轮询 `tabs.query()`，仍显示同一网站的标签页按同样规则重新拦截，不重复计数。实机无头复现（重启 Safari → 地址栏写入 `tw` → 回车）修复前 1/2 漏拦，修复后 8/8 拦截。

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
node --test safari/tests/*.test.mjs
# 以下原生测试需要 macOS 15.4+，仅使用隔离的 WebKit 测试上下文：
xcrun swiftc -parse-as-library safari/tests/validate-manifest.swift \
  -o safari/.build/validate-manifest
safari/.build/validate-manifest \
  'safari/.build/Build/Products/Debug/Focus.app/Contents/PlugIns/Focus Extension.appex'
```

本机 macOS 26.2 / Safari 26.2：Debug `xcodebuild` 成功；六项 Node 回归测试验证资源一致、白名单、限额/跨日/后台重载、设置消息、1.5 迁移和输入防粘贴；原生 WebKit 验证打包 manifest、后台消息、local/session storage 和四个扩展页面。Safari 17 / Sequoia 兼容性依据 Apple 文档和 macOS 14 deployment target，未在这些旧系统上实机测试。

本轮在 macOS 26.3 / Xcode 26.6 下扩展原生测试，以回环 HTTP 页面触发真实 WebKit 导航和 `tabs.update()`，验证扩展页完成加载、确认消息放行、刷新、离站返回后额度耗尽屏蔽。测试不创建可见窗口、不操作 Safari、不使用持久用户配置。运行：

```sh
xcrun swiftc -parse-as-library safari/tests/validate-manifest.swift -o /tmp/focus-validate-manifest
python3 safari/tests/run-webkit.py /tmp/focus-validate-manifest '/path/to/Focus Extension.appex'
```

测试宿主按 WebKit 自身测试的做法为 HTTP 与扩展页面切换配置；直接把 HTTP WebView 用于扩展主框架会产生宿主错误 -1008，即使添加 web_accessible_resources 也一样。此现象不作为 Safari live 根因证据。Node 当前共 30 项测试，包含诊断读取不改变用户规则，以及确认跳转拒绝不再返回成功。

导航修复新增 22 项测试（根目录 Chrome MV3 与 Safari 资源各 11 项），连同原有 6 项共 28 项通过。测试包括覆盖早期跳转的网页提交、仅提交事件、重复提交、已取消的离站、iframe、异步存储期间的新导航和关闭标签页、不同标签页并行、跳转拒绝后的重试。使用 `FOCUS_BACKGROUND_SOURCE=/tmp/old-background.js` 可让导航测试运行指定旧源码；在 `be573a5` 源码上运行 `--test-name-pattern 'outlives an early|without an observed|aborted provisional|unblocked commit'`，共 8 项中 6 项失败、2 项通过。

授权后手动验收：设 YouTube 每日限额为 1 → 尝试粘贴（应拒绝）→ 手输确认进入 → 同标签页站内跳转不重复计数 → 离开到其他网站后再返回应屏蔽；检查弹窗剩余次数、白名单路径和设置行内编辑。Safari 实际导航/权限流程需完成上述手动步骤后验证。[Apple 运行说明](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
