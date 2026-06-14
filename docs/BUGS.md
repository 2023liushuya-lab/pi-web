# Bug 记录

## 2025-06-15

### 🐛 水合错误：i18n SSR/CSR 语言不一致

**状态**：✅ 已修复 | **Issue**：[#2](https://github.com/2023liushuya-lab/pi-web/issues/2)

**症状**：页面加载时 React 水合报错 `Hydration failed because the server rendered text didn't match the client`，按钮 title 属性服务端渲染英文、客户端显示中文。

**根因**：`I18nProvider.getInitialLocale()` 在服务端（`window` 不存在）固定返回 `"en"`，但客户端从 `localStorage` 读取用户偏好可能是 `"zh"` → 服务端和客户端渲染内容不一致。

**修复**：
- `app/layout.tsx`：服务端通过 `cookies()` 读取 `pi-locale` cookie，传给 `I18nProvider` 作为 `initialLocale`
- `lib/i18n.tsx`：`I18nProvider` 接受 `initialLocale` prop，切换语言时同步写 cookie（供后续 SSR 使用）
- `lib/i18n.tsx`：`html lang` 属性也动态读取 cookie

**影响文件**：
- `app/layout.tsx`
- `lib/i18n.tsx`

---

### 🐛 发送消息报错：`message.content.filter is not a function`

**状态**：✅ 已修复 | **Issue**：[#3](https://github.com/2023liushuya-lab/pi-web/issues/3)

**症状**：在 Web UI 中每次发送消息时浏览器控制台报错 `TypeError: message.content.filter is not a function`。

**根因**：`hooks/useAgentSession.ts` 的 `handleSend` 中，当只有 1 个纯文本内容块时，`contentBlocks[0]` 是对象 `{type:"text", text:"..."}`，而 `UserMessageView` 期望 `content` 是 `string | Array`，收到对象后调用 `.filter()` 就报错了。

**修复**：`contentBlocks.length === 1 && contentBlocks[0].type === "text"` 时，直接取 `contentBlocks[0].text` 字符串。

**影响文件**：
- `hooks/useAgentSession.ts`

---

### 🐛 Turbopack 符号链接编译错误

**状态**：✅ 已修复 | **Issue**：[#4](https://github.com/2023liushuya-lab/pi-web/issues/4)

**症状**：清除 `.next` 缓存后重启 `next dev`，Turbopack panic 报错：`FileSystemPath("").join("../knowledge") leaves the filesystem root`。

**根因**：项目根目录的 `knowledge` 符号链接指向 `~/knowledge`，Turbopack/PostCSS/Tailwind v4 解析时跟随符号链接导致路径越界。

**修复**：
- `next.config.ts`：将 `webpack: (config) => config` 改为 `turbopack: {}`，消除 Turbopack 配置警告
- `package.json`：dev 脚本使用 `--webpack` 回退到 webpack 编译（build 脚本已使用 webpack）

**影响文件**：
- `next.config.ts`

---

## 记录规则

每次修 bug 后在此文件追加，格式：

```markdown
### 🐛 [简短标题]

**症状**：用户/浏览器看到的异常现象
**根因**：技术层面的原因分析
**修复**：采取了什么措施
**影响文件**：修改了哪些文件
```
