# pi-web 开发指南：写 Web 功能的步骤与注意事项

> 基于 https://github.com/2023liushuya-lab/pi-web
> 最后更新：2026-06-14

---

## 一、项目概览

pi-web 是 **pi 编程 Agent 的 Web 界面**，基于 Next.js 16（App Router）+ React 19 + TypeScript。

```
pi-web/
├── app/
│   ├── layout.tsx          # 根布局（主题、i18n Provider）
│   ├── page.tsx            # 入口（Suspense → AppShell）
│   ├── globals.css         # CSS 变量 + Tailwind + 动画
│   └── api/                # API 路由
│       ├── sessions/       # 会话列表、详情、上下文、搜索
│       ├── agent/          # Agent 交互（发送消息、SSE 流）
│       ├── resources/      # 资源库
│       ├── files/          # 文件内容查看
│       ├── models/         # 模型列表
│       └── models-config/  # 模型配置 CRUD
├── components/             # React 组件
├── hooks/                  # 自定义 Hooks
├── lib/                    # 共享逻辑（类型、reader、i18n、RPC）
├── docs/superpowers/       # 设计文档 + 实现计划
├── next.config.ts
└── package.json
```

### 架构图

```
Browser                Next.js Server              AgentSession (进程内)
  │                        │                               │
  ├─ GET /api/sessions ────▶ 读取 ~/.pi/agent/sessions/    │
  ├─ SSE /api/agent/events ▶ AgentSession.subscribe()  ◀───│ session.onEvent()
  ├─ POST /api/agent/[id] ─▶ AgentSession.send()     ────▶│ session.prompt()
```

---

## 二、技术栈与规范

| 类别 | 选型 | 说明 |
|------|------|------|
| 框架 | Next.js 16 (App Router) | `"use client"` 组件 + Server Components |
| 语言 | TypeScript (strict) | 类型定义集中在 `lib/types.ts` |
| 样式 | **内联 style 对象** | 不使用 CSS Modules 或 Tailwind className，用 CSS 变量 |
| CSS | `app/globals.css` 中的 CSS 变量 | `var(--bg)`, `var(--accent)`, `var(--text-muted)` 等 |
| 字体 | Noto Sans Mono + system-ui | 等宽字体用 `var(--font-mono)` |
| 国际化 | 自定义 `lib/i18n.tsx` | `useT()` hook 返回翻译函数 |
| 状态管理 | React useState/useRef | 无 Redux/Zustand，用 `globalThis` 防热重载丢失 |
| 图标 | **内联 SVG** | 不引入图标库，所有图标手写 SVG |
| API | App Router Route Handlers | `app/api/**/route.ts` |

---

## 三、CSS 变量速查

所有样式必须使用 `globals.css` 中定义的变量，**不得硬编码颜色**：

```css
/* 背景 */
var(--bg)              /* 主背景 #ffffff / 暗色 #1a1a1a */
var(--bg-panel)        /* 面板背景 #f5f5f5 */
var(--bg-hover)        /* 悬停状态 */
var(--bg-selected)     /* 选中状态 */

/* 文字 */
var(--text)            /* 主文字 */
var(--text-muted)      /* 次要文字 #6b7280 */
var(--text-dim)        /* 最淡文字 #9ca3af */

/* 强调 */
var(--accent)          /* 主题色 #2563eb */
var(--accent-hover)    /* 悬停主题色 */

/* 消息气泡 */
var(--user-bg)         /* 用户消息背景 */
var(--tool-bg)         /* 工具调用背景 */

/* 分隔 */
var(--border)          /* 边框颜色 #e0e0e0 */
```

---

## 四、开发流程

### 步骤 1：明确需求 → 设计文档

在动手前，先写设计文档（详见 `docs/superpowers/specs/` 目录）：

- 功能描述
- 涉及文件（新增/修改）
- API 接口设计
- 交互行为

### 步骤 2：创建 Git 分支

```bash
git checkout -b feature/功能描述
# 或
git checkout -b fix/问题描述
```

### 步骤 3：实现顺序

**严格遵循从底层到上层的顺序：**

```
lib 层（纯逻辑）→ API 路由 → 组件 → 布局集成
```

| 顺序 | 层 | 说明 |
|------|-----|------|
| 1 | `lib/` | 类型定义、数据读取函数 |
| 2 | `app/api/` | REST API 或 SSE 端点 |
| 3 | `components/` | UI 组件 |
| 4 | `components/AppShell.tsx` | 集成到主布局 |

### 步骤 4：类型检查

每次改动后必须运行：

```bash
npx tsc --noEmit
```

必须零错误才能提交。

### 步骤 5：本地验证

```bash
npm run dev    # 启动在 http://localhost:30141
```

功能验证通过后提交。

### 步骤 6：提交并推送

```bash
git add [相关文件]
git commit -m "feat: 简短描述"
git push origin feature/xxx
```

---

## 五、各类组件写法模板

### 5.1 新增 API 路由

```typescript
// app/api/xxx/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const param = request.nextUrl.searchParams.get("key");
    // 调用 lib 层函数
    const data = await someLibFunction(param);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

> **注意**：所有 API 路由必须用 try/catch，返回 `{ error: string }` 格式。

### 5.2 新增组件

```typescript
"use client";

import React from "react";

interface Props {
  // 用回调函数通知父组件，不用直接修改外部状态
  onOpen: (id: string) => void;
  onClose: () => void;
}

export function MyComponent({ onOpen, onClose }: Props) {
  return (
    <div
      style={{                    // ← 必须用内联 style
        padding: "12px 16px",
        background: "var(--bg)",
        color: "var(--text)",
        fontSize: 14,
        border: "1px solid var(--border)",
      }}
    >
      {/* 内容 */}
    </div>
  );
}
```

> **关键规则**：
> - 所有组件文件头加 `"use client"`（当前项目无 Server Components）
> - **样式全部内联**，不写 CSS 文件，不写 `className="tailwind-xxx"`
> - 颜色用 CSS 变量，字号/间距用固定 px
> - 悬停效果用 `onMouseEnter` / `onMouseLeave` 动态改 `e.currentTarget.style`

### 5.3 悬停效果标准写法

```typescript
<button
  style={{
    padding: "8px 14px",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "color 0.12s, background 0.12s",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = "var(--bg-hover)";
    e.currentTarget.style.color = "var(--text)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = "none";
    e.currentTarget.style.color = "var(--text-muted)";
  }}
>
  按钮文字
</button>
```

### 5.4 图标写法

```typescript
// 所有图标手写 SVG，不引入图标库
<svg width="16" height="16" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="2"
  strokeLinecap="round" strokeLinejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <line x1="12" y1="8" x2="12" y2="16"/>
</svg>
```

### 5.5 i18n 翻译

```typescript
import { useT } from "@/lib/i18n";

function MyComponent() {
  const t = useT();
  return <span>{t("search")}</span>;
}
```

新增翻译 key 时在 `lib/i18n.tsx` 的 `en` 和 `zh` 字典中各加一条：

```typescript
// lib/i18n.tsx
en: {
  // ...
  "myComponent.title": "My Title",
}
zh: {
  // ...
  "myComponent.title": "我的标题",
}
```

### 5.6 添加 lib 层函数

```typescript
// lib/session-reader.ts（或新建文件）

// 1. 先定义接口
export interface MyData {
  id: string;
  name: string;
}

// 2. 实现函数
export async function fetchMyData(cwd: string): Promise<MyData[]> {
  const sessions = await listAllSessions();
  // ... 处理逻辑
  return result;
}
```

---

## 六、session-reader 核心 API

| 函数 | 用途 |
|------|------|
| `listAllSessions()` | 列出所有 session（返回 `SessionInfo[]`） |
| `resolveSessionPath(id)` | 根据 sessionId 查文件路径 |
| `getSessionEntries(path)` | 读取 .jsonl 文件的全部条目 |
| `buildSessionContext(entries, leafId)` | 构造对话上下文 |
| `searchSessions(query, cwd?)` | 全文搜索会话 |
| `getResourceFiles(cwd)` | 收集会话产生的文件 |

---

## 七、Session 文件格式速查

位置：`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`

```jsonl
{"type":"session","version":3,"id":"uuid","cwd":"/path",...}
{"type":"model_change","id":"hex","parentId":null,"provider":"zenmux",...}
{"type":"message","id":"hex","parentId":"hex","message":{"role":"user","content":"hello"}}
{"type":"message","id":"hex","parentId":"hex","message":{"role":"assistant","content":[...]}}
{"type":"message","id":"hex","parentId":"hex","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"hex","parentId":"hex","summary":"...","firstKeptEntryId":"hex"}
{"type":"session_info","id":"hex","parentId":"hex","name":"用户自定义名称"}
```

---

## 八、常见陷阱

### 8.1 全局状态使用 globalThis

```typescript
// ✅ 正确：用 globalThis 防 Next.js 热重载丢失状态
declare global {
  var __myCache: Map<string, string> | undefined;
}
function getCache(): Map<string, string> {
  if (!globalThis.__myCache) globalThis.__myCache = new Map();
  return globalThis.__myCache;
}

// ❌ 错误：普通模块级变量在热重载时被重置
const myCache = new Map<string, string>();
```

### 8.2 Fork 操作后必须立即销毁旧 session

`AgentSession.fork()` 会原地修改现有 session 的状态。fork 后旧 id 对应的 wrapper 必须立即销毁，否则下次请求拿到的是已 fork 后的状态，产生损坏的 `parentSession` 链。

### 8.3 两种分支不要混淆

| 类型 | 触发 | 实现 |
|------|------|------|
| **Fork** | 用户消息上的 Fork 按钮 | 创建新 `.jsonl` 文件，侧边栏显示为父子关系 |
| **In-session branch** | Continue 按钮 / BranchNavigator | 同一文件内 `navigate_tree`，不同分支共享 `parentId` |

### 8.4 ToolCall 字段名差异

pi 内部存储用 `{type:"toolCall", id, name, arguments}`，但 UI 类型用 `{toolCallId, toolName, input}`。必须通过 `normalizeToolCalls()` 转换，`session-reader.ts` 和 `ChatWindow.handleAgentEvent()` 中已处理。

### 8.5 Compaction SSE 事件

新 pi 发 `compaction_start`/`compaction_end`，旧版本发 `auto_compaction_start`/`auto_compaction_end`。`handleAgentEvent` 同时监听两种。

### 8.6 不要运行 next build

```bash
# ❌ 不要在开发期间运行，会污染 .next/ 导致 npm run dev 出问题
npx next build

# ✅ 开发只用
npm run dev
```

---

## 九、演示开发实例：添加搜索功能

以本次实现的 Cmd+P 搜索为例，完整复盘：

### Step 1：lib 层

```typescript
// lib/session-reader.ts
export async function searchSessions(query: string, cwd?: string): Promise<SearchResult[]> {
  const allSessions = await listAllSessions();
  const targetSessions = cwd ? allSessions.filter(s => s.cwd === cwd) : allSessions;
  // 遍历 .jsonl，匹配标题和内容
  // 返回 [{ sessionId, title, matches, matchCount }]
}
```

### Step 2：API 路由

```typescript
// app/api/sessions/search/route.ts
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const results = await searchSessions(q, cwd);
  return NextResponse.json({ results });
}
```

### Step 3：组件

```typescript
// components/SearchModal.tsx
"use client";
export function SearchModal({ open, onClose, cwd, onSelectSession }: Props) {
  // 输入框 + 防抖搜索 + 结果列表 + 键盘导航
  // ⌘P 全局快捷键由 AppShell 注册
}
```

### Step 4：集成到 AppShell

```typescript
// components/AppShell.tsx
import { SearchModal } from "./SearchModal";

// 注册 ⌘P 快捷键
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "p") {
      e.preventDefault();
      setSearchOpen(v => !v);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);

// 渲染弹窗
<SearchModal open={searchOpen} onClose={...} cwd={...} onSelectSession={...} />
```

### Step 5：类型检查 + 验证

```bash
npx tsc --noEmit   # 必须零错误
npm run dev         # 浏览器测试 ⌘P
```

---

## 十、Git 提交规范

| 前缀 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `docs:` | 文档变更 |
| `refactor:` | 重构（不改变行为） |
| `test:` | 测试相关 |
| `chore:` | 杂项（依赖更新等） |

示例：
```bash
git commit -m "feat: add Cmd+P global search modal"
git commit -m "fix: prevent session wrapper leak after fork"
```

---

## 十一、快速参考

```bash
# 开发
npm run dev                      # 启动 http://localhost:30141

# 类型检查
npx tsc --noEmit                 # 必须零错误

# 分支管理
git checkout -b feature/xxx      # 新建功能分支
git status                       # 检查改动
git add [file]                   # 暂存
git commit -m "feat: xxx"        # 提交
git push origin feature/xxx      # 推送

# 回滚
git checkout <commit-hash>       # 回到指定版本
git log --oneline -10            # 查看最近提交
```

---

## 十二、依赖清单

| 包 | 用途 |
|------|------|
| `@earendil-works/pi-coding-agent` | pi Agent 核心（进程内创建 session） |
| `next` | Next.js 框架 |
| `react` / `react-dom` | UI 框架 |
| `react-markdown` | Markdown 渲染 |
| `katex` | 数学公式渲染 |
| `tailwindcss` | CSS 工具（仅用 `@import` + `@theme` 映射变量） |
| `typescript` | 类型检查 |

---

**这个项目所有核心模式（内联样式、CSS 变量、SVG 图标、API 路由、session-reader）都已稳定，新功能严格按此模板写即可。**
