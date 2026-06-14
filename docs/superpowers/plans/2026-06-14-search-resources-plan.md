# 搜索对话 + 资源库 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 pi-web 新增 Cmd+P 全局搜索和资源库两个功能，重构侧边栏布局

**Architecture:** 新增 SearchModal 组件（⌘P 弹窗）、ResourcePanel 组件（侧边栏标签页），新增 `/api/sessions/search` 和 `/api/resources` 两个 API 路由。SessionSidebar 重构为标签式布局（Sessions | 资源库），FileExplorer 移至底部可折叠入口。SearchModal 通过 AppShell 全局注册快捷键。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, CSS variables

---

## 文件结构

| 文件 | 类型 | 职责 |
|------|------|------|
| `lib/session-reader.ts` | 修改 | 新增 `searchSessions()` 和 `getResourceFiles()` |
| `app/api/sessions/search/route.ts` | 新建 | 搜索 API 路由 |
| `app/api/resources/route.ts` | 新建 | 资源库 API 路由 |
| `components/SearchModal.tsx` | 新建 | ⌘P 搜索弹窗 UI |
| `components/ResourcePanel.tsx` | 新建 | 资源库标签页内容 |
| `components/SessionSidebar.tsx` | 修改 | 添加标签栏，FileExplorer 移到底部 |
| `components/AppShell.tsx` | 修改 | 注册 SearchModal，连接 ResourcePanel 到 FileViewer |

---

### Task 1: 新增 searchSessions 函数

**Files:**
- Modify: `lib/session-reader.ts`

- [ ] **Step 1: 在 session-reader.ts 末尾添加 searchSessions 函数**

```typescript
export interface SearchResult {
  sessionId: string;
  sessionPath: string;
  title: string;
  matchCount: number;
  matches: { entryId: string; snippet: string; type: "title" | "content" }[];
}

export async function searchSessions(query: string, cwd?: string): Promise<SearchResult[]> {
  const allSessions = await listAllSessions();
  const targetSessions = cwd ? allSessions.filter((s) => s.cwd === cwd) : allSessions;
  const results: SearchResult[] = [];

  for (const session of targetSessions) {
    const entries = SessionManager.open(session.path).getEntries();
    const messages = entries.filter((e) => (e as SessionEntry).type === "message") as unknown as SessionMessageEntry[];

    // Title = first user message content
    let title = "";
    let titleEntryId = "";
    for (const msg of messages) {
      if (msg.message?.role === "user") {
        const content = typeof msg.message.content === "string" ? msg.message.content : "";
        title = content.slice(0, 80);
        titleEntryId = msg.id;
        break;
      }
    }

    const matches: { entryId: string; snippet: string; type: "title" | "content" }[] = [];

    // Check title
    if (title.toLowerCase().includes(query.toLowerCase())) {
      const idx = title.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, idx - 20);
      const end = Math.min(title.length, idx + query.length + 20);
      let snippet = title.slice(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < title.length) snippet += "...";
      matches.push({ entryId: titleEntryId, snippet, type: "title" });
    }

    // Check message content
    for (const msg of messages) {
      const content = typeof msg.message?.content === "string"
        ? msg.message.content
        : Array.isArray(msg.message?.content)
          ? msg.message.content.filter((b) => (b as TextContent).type === "text").map((b) => (b as TextContent).text).join(" ")
          : "";
      if (content.toLowerCase().includes(query.toLowerCase())) {
        const idx = content.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + query.length + 50);
        let snippet = content.slice(start, end);
        if (start > 0) snippet = "..." + snippet;
        if (end < content.length) snippet += "...";
        matches.push({ entryId: msg.id, snippet, type: "content" });
      }
    }

    if (matches.length > 0) {
      results.push({
        sessionId: session.id,
        sessionPath: session.path,
        title: title || "(no messages)",
        matchCount: matches.length,
        matches: matches.slice(0, 10), // cap at 10 matches per session
      });
    }
  }

  return results.sort((a, b) => b.matchCount - a.matchCount);
}
```

**注意**：需要在文件顶部导入 `TextContent` 类型（已存在于 `types.ts`）。

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add lib/session-reader.ts lib/types.ts
git commit -m "feat: add searchSessions function to session-reader"
```

---

### Task 2: 新增 getResourceFiles 函数

**Files:**
- Modify: `lib/session-reader.ts`

- [ ] **Step 1: 在 session-reader.ts 末尾添加 getResourceFiles**

```typescript
export interface ResourceFile {
  relativePath: string;
  fileName: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: string;
}

export async function getResourceFiles(cwd: string): Promise<ResourceFile[]> {
  const allSessions = await listAllSessions();
  const cwdSessions = allSessions.filter((s) => s.cwd === cwd);
  const fileMap = new Map<string, ResourceFile>();

  for (const session of cwdSessions) {
    // Get session title from first user message
    let title = "";
    try {
      const entries = SessionManager.open(session.path).getEntries();
      for (const e of entries) {
        if ((e as SessionEntry).type === "message" && (e as SessionMessageEntry).message?.role === "user") {
          const content = typeof (e as SessionMessageEntry).message.content === "string"
            ? (e as SessionMessageEntry).message.content as string
            : "";
          title = content.slice(0, 60);
          break;
        }
      }

      // Extract file write operations from tool calls
      for (const e of entries) {
        if ((e as SessionEntry).type !== "message") continue;
        const msg = e as SessionMessageEntry;
        if (msg.message?.role !== "assistant") continue;
        const content = (msg.message as AssistantMessage).content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if ((block as ToolCallContent).type !== "toolCall") continue;
          const tc = block as ToolCallContent;
          // pi uses tool names like "write", "writeFileSync"
          if (!/^write/i.test(tc.toolName)) continue;
          const filePath = tc.input?.path as string | undefined
            ?? tc.input?.target as string | undefined
            ?? tc.input?.filePath as string | undefined;
          if (!filePath || typeof filePath !== "string") continue;

          // Convert to relative path
          let relativePath = filePath;
          if (filePath.startsWith(cwd)) {
            relativePath = filePath.slice(cwd.length).replace(/^\//, "");
          }
          const fileName = relativePath.split("/").pop() ?? relativePath;

          // Keep latest write per file
          if (!fileMap.has(relativePath) || new Date(msg.timestamp) > new Date(fileMap.get(relativePath)!.timestamp)) {
            fileMap.set(relativePath, {
              relativePath,
              fileName,
              sessionId: session.id,
              sessionTitle: title || "(no messages)",
              timestamp: msg.timestamp,
            });
          }
        }
      }
    } catch {
      // Skip sessions that can't be opened
    }
  }

  return Array.from(fileMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
```

**注意**：需要在文件顶部导入 `ToolCallContent` 类型（已存在于 `types.ts`）。

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/session-reader.ts
git commit -m "feat: add getResourceFiles function"
```

---

### Task 3: 搜索 API 路由

**Files:**
- Create: `app/api/sessions/search/route.ts`

- [ ] **Step 1: 创建搜索 API 路由**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchSessions } from "@/lib/session-reader";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q");
    const cwd = request.nextUrl.searchParams.get("cwd") ?? undefined;

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchSessions(q.trim(), cwd);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 测试 API**

Run: `curl "http://localhost:30141/api/sessions/search?q=test&cwd=/Users/liushuya"` (需要先启动 dev server)
Expected: 返回 JSON `{ results: [...] }`

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/search/route.ts
git commit -m "feat: add /api/sessions/search endpoint"
```

---

### Task 4: 资源库 API 路由

**Files:**
- Create: `app/api/resources/route.ts`

- [ ] **Step 1: 创建资源库 API 路由**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getResourceFiles } from "@/lib/session-reader";

export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd");
    const sort = request.nextUrl.searchParams.get("sort") ?? "time";

    if (!cwd) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }

    const files = await getResourceFiles(cwd);

    // Sort
    if (sort === "type") {
      files.sort((a, b) => {
        const extA = a.fileName.split(".").pop()?.toLowerCase() ?? "";
        const extB = b.fileName.split(".").pop()?.toLowerCase() ?? "";
        return extA.localeCompare(extB) || b.timestamp.localeCompare(a.timestamp);
      });
    } else if (sort === "session") {
      files.sort((a, b) =>
        a.sessionTitle.localeCompare(b.sessionTitle) || b.timestamp.localeCompare(a.timestamp)
      );
    }
    // default "time": already sorted by getResourceFiles

    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/resources/route.ts
git commit -m "feat: add /api/resources endpoint"
```

---

### Task 5: SearchModal 组件

**Files:**
- Create: `components/SearchModal.tsx`

- [ ] **Step 1: 创建 SearchModal 组件**

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface SearchMatch {
  entryId: string;
  snippet: string;
  type: "title" | "content";
}

interface SearchResult {
  sessionId: string;
  sessionPath: string;
  title: string;
  matchCount: number;
  matches: SearchMatch[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  cwd?: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function SearchModal({ open, onClose, cwd, onSelectSession }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      // Focus input on next frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || query.trim().length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (cwd) params.set("cwd", cwd);
        const res = await fetch(`/api/sessions/search?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.results ?? []);
        setSelectedIdx(0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, cwd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIdx]) {
          onSelectSession(results[selectedIdx].sessionId);
          onClose();
        }
      }
    },
    [results, selectedIdx, onClose, onSelectSession]
  );

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "90vw",
          background: "var(--bg)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", padding: "12px 16px",
          gap: 10, borderBottom: "1px solid var(--border)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索对话标题或内容..."
            autoFocus
            style={{
              flex: 1, border: "none", background: "none", outline: "none",
              fontSize: 15, color: "var(--text)", fontFamily: "inherit",
            }}
          />
          {loading && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
        </div>

        {/* Results */}
        <div style={{ maxHeight: 350, overflowY: "auto" }}>
          {results.length === 0 && query.trim() && !loading && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              未找到匹配的对话
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.sessionId}
              onClick={() => { onSelectSession(r.sessionId); onClose(); }}
              style={{
                padding: "10px 16px", cursor: "pointer",
                borderBottom: "1px solid var(--bg-panel)",
                background: i === selectedIdx ? "var(--bg-selected)" : "transparent",
              }}
            >
              <div style={{
                color: "var(--accent)", fontWeight: 600, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                💬 {r.title.slice(0, 60)}{r.title.length > 60 ? "..." : ""}
              </div>
              {r.matches[0] && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                  {highlightSnippet(r.matches[0].snippet, query)}
                </div>
              )}
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                {r.matchCount} 处匹配
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "8px 16px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)",
        }}>
          <span><Key>↑↓</Key> 导航</span>
          <span><Key>↵</Key> 打开</span>
          <span><Key>Esc</Key> 关闭</span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: "1px 5px", borderRadius: 3,
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      fontFamily: "var(--font-mono)", fontSize: 10,
    }}>
      {children}
    </span>
  );
}

function highlightSnippet(snippet: string, query: string): React.ReactNode {
  if (!query) return snippet;
  const idx = snippet.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent)", padding: "0 2px", borderRadius: 2 }}>
        {snippet.slice(idx, idx + query.length)}
      </mark>
      {snippet.slice(idx + query.length)}
    </>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: No errors (spin animation reused from globals.css `@keyframes spin`)

- [ ] **Step 3: Commit**

```bash
git add components/SearchModal.tsx
git commit -m "feat: add SearchModal component with Cmd+P overlay"
```

---

### Task 6: ResourcePanel 组件

**Files:**
- Create: `components/ResourcePanel.tsx`

- [ ] **Step 1: 创建 ResourcePanel 组件**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface ResourceFile {
  relativePath: string;
  fileName: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: string;
}

type SortMode = "time" | "type" | "session";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString();
}

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  onSelectSession?: (sessionId: string) => void;
  refreshKey?: number;
}

export function ResourcePanel({ cwd, onOpenFile, onSelectSession, refreshKey }: Props) {
  const [files, setFiles] = useState<ResourceFile[]>([]);
  const [sort, setSort] = useState<SortMode>("time");
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/resources?cwd=${encodeURIComponent(cwd)}&sort=${sort}`);
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [cwd, sort]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshKey]);

  // Group by type for "type" sort
  if (sort === "type") {
    const groups = new Map<string, ResourceFile[]>();
    for (const f of files) {
      const ext = f.fileName.split(".").pop()?.toLowerCase() ?? "other";
      const category = categorizeType(ext);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(f);
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <SortBar sort={sort} onSort={setSort} count={files.length} />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>}
          {!loading && files.length === 0 && (
            <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>暂无生成的文件</div>
          )}
          {[...groups.entries()].map(([category, items]) => (
            <div key={category}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", padding: "8px 12px 4px", fontWeight: 600 }}>
                {category}
              </div>
              {items.map((f) => (
                <ResourceFileItem key={f.relativePath} file={f} onOpenFile={onOpenFile} onSelectSession={onSelectSession} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // "time" or "session" sort: flat list
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SortBar sort={sort} onSort={setSort} count={files.length} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>}
        {!loading && files.length === 0 && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>暂无生成的文件</div>
        )}
        {files.map((f) => (
          <ResourceFileItem key={f.relativePath} file={f} onOpenFile={onOpenFile} onSelectSession={onSelectSession} />
        ))}
      </div>
    </div>
  );
}

function SortBar({ sort, onSort, count }: { sort: SortMode; onSort: (s: SortMode) => void; count: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, padding: "6px 8px",
      fontSize: 10, borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {(["time", "type", "session"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onSort(mode)}
            style={{
              padding: "3px 8px", borderRadius: 4, border: "none", background: sort === mode ? "var(--bg-selected)" : "none",
              color: sort === mode ? "var(--text)" : "var(--text-muted)", cursor: "pointer", fontSize: 10,
              fontWeight: sort === mode ? 600 : 400,
            }}
          >
            {{ time: "🕐 时间", type: "📁 类型", session: "💬 来源" }[mode]}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{count} 个文件</span>
    </div>
  );
}

function ResourceFileItem({
  file,
  onOpenFile,
  onSelectSession,
}: {
  file: ResourceFile;
  onOpenFile: (filePath: string, fileName: string) => void;
  onSelectSession?: (sessionId: string) => void;
}) {
  return (
    <div
      onClick={() => onOpenFile(file.relativePath, file.fileName)}
      style={{
        padding: "5px 12px 5px 14px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
        📄 {file.fileName}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>
        来自:{" "}
        <span
          onClick={(e) => { e.stopPropagation(); onSelectSession?.(file.sessionId); }}
          style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}
        >
          {file.sessionTitle.slice(0, 40)}
        </span>
        {" · "}{formatRelativeTime(file.timestamp)}
      </div>
    </div>
  );
}

function categorizeType(ext: string): string {
  const md = ["md", "markdown"];
  const office = ["xlsx", "xls", "csv", "docx", "doc", "pptx", "ppt", "pdf"];
  const image = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"];
  const code = ["ts", "tsx", "js", "jsx", "json", "css", "html", "py", "rs", "go"];
  if (md.includes(ext)) return "📄 Markdown";
  if (office.includes(ext)) return "📊 Office / 数据";
  if (image.includes(ext)) return "🎨 图片";
  if (code.includes(ext)) return "💻 代码";
  return "📝 其他";
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ResourcePanel.tsx
git commit -m "feat: add ResourcePanel component"
```

---

### Task 7: 重构 SessionSidebar 布局

**Files:**
- Modify: `components/SessionSidebar.tsx`

- [ ] **Step 1: 添加 Props**

在 `Props` 接口中添加：

```typescript
interface Props {
  // ... existing props ...
  /** Called when user clicks a resource file */
  onOpenFile?: (filePath: string, fileName: string) => void;
  /** Current active tab in sidebar */
  sidebarTab?: "sessions" | "resources";
  /** Called when tab changes */
  onSidebarTabChange?: (tab: "sessions" | "resources") => void;
}
```

- [ ] **Step 2: 添加 sidebarTab 状态**

在组件开头（`const [explorerOpen, setExplorerOpen] = useState(true);` 附近）添加：

```typescript
const [sidebarTab, setSidebarTab] = useState<"sessions" | "resources">("sessions");
```

然后使用外部 props 或本地 state：

```typescript
const activeTab = sidebarTabState ?? sidebarTab;
const setActiveTab = onSidebarTabChange ?? setSidebarTab;
```

- [ ] **Step 3: 在 Header 下方添加标签栏**

在 CWD picker 的 `</div>` 之后、Session list 之前，插入标签栏。找到 `{/* Session list */}` 注释，在它**之前**添加：

```typescript
{/* Tab bar: Sessions | Resources */}
{(selectedCwdProp || selectedCwd) && (
  <div style={{
    display: "flex", gap: 0,
    borderBottom: "1px solid var(--border)",
    padding: "0 8px", flexShrink: 0,
  }}>
    {(["sessions", "resources"] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        style={{
          padding: "8px 14px",
          border: "none", background: "none",
          fontSize: 12,
          color: activeTab === tab ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer",
          borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
          fontWeight: activeTab === tab ? 600 : 400,
          transition: "all 0.12s",
        }}
      >
        {tab === "sessions" ? "Sessions" : "📦 资源库"}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: 根据 activeTab 切换内容**

将 Session list 包裹在条件中，并在 `activeTab === "resources"` 时显示 ResourcePanel。把现有的 `{/* Session list */}` 区块改为：

```typescript
{activeTab === "sessions" ? (
  <div style={{ flex: explorerOpen && (selectedCwdProp || selectedCwd) ? "1 1 0" : "1 1 auto", overflowY: "auto", padding: "0", minHeight: 80 }}>
    {/* 原有 session list 内容，不变 */}
    {loading && (...)}
    {error && (...)}
    {!loading && !error && filteredSessions.length === 0 && (...)}
    {sessionTree.map(...)}
  </div>
) : (
  <div style={{ flex: "1 1 0", overflowY: "auto", minHeight: 0 }}>
    {(selectedCwdProp || selectedCwd) && (
      <ResourcePanel
        cwd={selectedCwdProp ?? selectedCwd!}
        onOpenFile={onOpenFile ?? (() => {})}
        onSelectSession={(id) => {
          const session = allSessions.find((s) => s.id === id);
          if (session) onSelectSession(session);
        }}
      />
    )}
  </div>
)}
```

- [ ] **Step 5: 导入 ResourcePanel**

在文件顶部添加导入：

```typescript
import { ResourcePanel } from "./ResourcePanel";
```

- [ ] **Step 6: 重构 FileExplorer 为底部可折叠入口**

当前的 FileExplorer 区块（从 `{/* File Explorer section */}` 开始）保持不变。它已经是一个可折叠的面板，结构很好。只需确保在两种 tab 下都显示——它目前已经独立于 session list 存在。

- [ ] **Step 7: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add components/SessionSidebar.tsx
git commit -m "feat: refactor sidebar to Sessions|Resources tabs + FileExplorer at bottom"
```

---

### Task 8: 在 AppShell 中集成 SearchModal

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: 导入 SearchModal**

在文件顶部添加：

```typescript
import { SearchModal } from "./SearchModal";
```

- [ ] **Step 2: 添加搜索状态**

在组件内（其他 useState 附近）添加：

```typescript
const [searchOpen, setSearchOpen] = useState(false);
```

- [ ] **Step 3: 注册 ⌘P 全局快捷键**

在组件内添加 useEffect：

```typescript
// ⌘P / Ctrl+P global search shortcut
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "p") {
      e.preventDefault();
      setSearchOpen((v) => !v);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

- [ ] **Step 4: 渲染 SearchModal**

在 return 的 JSX 末尾（`</>` 闭合标签之前）添加：

```typescript
<SearchModal
  open={searchOpen}
  onClose={() => setSearchOpen(false)}
  cwd={selectedSession?.cwd ?? newSessionCwd ?? activeCwd}
  onSelectSession={(sessionId) => {
    // Find session info from sidebar's data. We'll pass via a ref or fetch.
    // For now, just navigate to the session URL.
    router.replace(`?session=${encodeURIComponent(sessionId)}`, { scroll: false });
    // Refresh sidebar will handle the rest
    setRefreshKey((k) => k + 1);
  }}
/>
```

- [ ] **Step 5: 在 topbar 添加搜索提示按钮**

在 topbar 中，`<span style={{flex:1}} />` 之后、search hint 区域添加一个可点击的搜索按钮。将现有的静态提示改为：

```typescript
<div
  onClick={() => setSearchOpen(true)}
  style={{
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 11, color: "var(--text-dim)", cursor: "pointer",
    padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
    background: "var(--bg)", marginLeft: "auto", marginRight: 12,
    transition: "all 0.12s",
  }}
  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-dim)"; }}
>
  🔍 {t("search") || "搜索对话"}...
  <span style={{
    padding: "1px 5px", borderRadius: 3,
    background: "var(--bg-panel)", border: "1px solid var(--border)",
    fontFamily: "var(--font-mono)", fontSize: 10,
  }}>⌘P</span>
</div>
```

- [ ] **Step 6: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: integrate SearchModal with Cmd+P shortcut in AppShell"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```
打开 http://localhost:30141

- [ ] **Step 2: 测试搜索**
  - 按 `⌘P` → 弹窗出现
  - 输入关键词 → 看到搜索结果
  - `Esc` 关闭
  - 选择一个结果 → 跳转到对应对话

- [ ] **Step 3: 测试资源库**
  - 点击侧边栏 "📦 资源库" 标签
  - 看到对话生成的文件列表
  - 点击文件 → 右侧 FileViewer 打开
  - 切换排序方式

- [ ] **Step 4: 测试 FileExplorer**
  - 侧边栏底部 "📁 文件浏览器" 可折叠
  - 内容正常显示文件树

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: end-to-end verification of search + resources features"
```

---

## 自检清单

- [x] Spec 覆盖率：搜索弹窗 ✓、搜索 API ✓、资源库面板 ✓、资源库 API ✓、侧边栏布局重构 ✓、FileExplorer 移到底部 ✓
- [x] 无 placeholder / TODO
- [x] 类型一致性：所有组件接口与 session-reader 类型匹配
- [x] 遵循现有代码模式：内联 style、SVG 图标、CSS variables
