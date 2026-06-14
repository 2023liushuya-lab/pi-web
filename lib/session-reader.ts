import { SessionManager, buildSessionContext as piBuildSessionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SessionEntry, SessionInfo, SessionContext, SessionTreeNode, AssistantMessage, TextContent, ToolCallContent, SessionMessageEntry, ResourceFile } from "./types";
import type { SessionEntry as PiSessionEntry, SessionInfo as PiSessionInfo } from "@earendil-works/pi-coding-agent";
import { normalizeToolCalls } from "./normalize";

export { getAgentDir };

export function getSessionsDir(): string {
  return `${getAgentDir()}/sessions`;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const piSessions: PiSessionInfo[] = await SessionManager.listAll();
  const pathToId = new Map<string, string>();
  for (const s of piSessions) pathToId.set(s.path, s.id);

  const cache = getPathCache();
  return piSessions.map((s) => {
    // Populate path cache so resolveSessionPath works without a full scan
    cache.set(s.id, s.path);
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name,
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId: s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined,
    };
  });
}

// ============================================================================
// Session path cache: sessionId → absolute file path
// Stored in globalThis for hot-reload safety
// ============================================================================
declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;

  // Cache miss: scan all sessions to populate cache, then retry
  await listAllSessions();
  return getPathCache().get(sessionId) ?? null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  getPathCache().set(sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  getPathCache().delete(sessionId);
}

export function getSessionEntries(filePath: string): SessionEntry[] {
  const entries = SessionManager.open(filePath).getEntries();
  return entries as unknown as SessionEntry[];
}

export function buildTree(entries: SessionEntry[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const labelsById = new Map<string, string>();

  for (const entry of entries) {
    if (entry.type === "label") {
      const l = entry as { type: "label"; targetId: string; label?: string };
      if (l.label) labelsById.set(l.targetId, l.label);
      else labelsById.delete(l.targetId);
    }
  }

  const roots: SessionTreeNode[] = [];
  for (const entry of entries) {
    nodeMap.set(entry.id, { entry, children: [], label: labelsById.get(entry.id) });
  }
  for (const entry of entries) {
    const node = nodeMap.get(entry.id)!;
    if (!entry.parentId) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(entry.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.children.sort((a, b) => new Date(a.entry.timestamp).getTime() - new Date(b.entry.timestamp).getTime());
    stack.push(...node.children);
  }
  return roots;
}

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  // Build entryIds: parallel array to messages[], mapping each message back to its entry id.
  // Needed for fork and navigate_tree calls from the UI.
  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  // Walk path from target leaf to root
  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  // Find the last compaction on path (mirrors pi's buildSessionContext logic)
  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    // The first message in piCtx.messages is the synthetic compaction summary — map to compaction entry id
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  // pi injects compaction summary as {role:"compactionSummary", summary, tokensBefore}.
  // Convert to {role:"user"} so MessageView can render it the same as before.
  const messages = (piCtx.messages as AssistantMessage[]).map((msg) => {
    const raw = msg as unknown as Record<string, unknown>;
    if (raw.role === "compactionSummary") {
      return {
        role: "user" as const,
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${raw.summary ?? ""}`,
        timestamp: raw.timestamp as number | undefined,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}

export interface SearchMatch {
  entryId: string;
  snippet: string;
  type: "title" | "content";
}

export interface SearchResult {
  sessionId: string;
  sessionPath: string;
  title: string;
  matchCount: number;
  matches: SearchMatch[];
}

export async function searchSessions(query: string, cwd?: string): Promise<SearchResult[]> {
  const allSessions = await listAllSessions();
  const targetSessions = cwd ? allSessions.filter((s) => s.cwd === cwd) : allSessions;
  const results: SearchResult[] = [];
  const q = query.toLowerCase();

  for (const session of targetSessions) {
    let entries: SessionEntry[];
    try {
      entries = SessionManager.open(session.path).getEntries() as unknown as SessionEntry[];
    } catch {
      continue;
    }

    const messages = entries.filter((e) => e.type === "message") as SessionMessageEntry[];

    let title = "";
    let titleEntryId = "";
    for (const msg of messages) {
      if (msg.message?.role === "user") {
        const content = typeof msg.message.content === "string" ? msg.message.content : (msg.message.content as TextContent[])?.[0]?.text ?? "";
        title = content.slice(0, 80);
        titleEntryId = msg.id;
        break;
      }
    }

    const matches: SearchMatch[] = [];

    if (title.toLowerCase().includes(q)) {
      const idx = title.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 20);
      const end = Math.min(title.length, idx + q.length + 20);
      let snippet = title.slice(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < title.length) snippet += "...";
      matches.push({ entryId: titleEntryId, snippet, type: "title" });
    }

    for (const msg of messages) {
      const content = typeof msg.message?.content === "string"
        ? msg.message.content
        : Array.isArray(msg.message?.content)
          ? msg.message.content
              .filter((b) => (b as TextContent).type === "text")
              .map((b) => (b as TextContent).text)
              .join(" ")
          : "";
      if (content.toLowerCase().includes(q)) {
        const idx = content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + q.length + 50);
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
        matches: matches.slice(0, 10),
      });
    }
  }

  return results.sort((a, b) => b.matchCount - a.matchCount);
}

export async function getResourceFiles(cwd: string): Promise<ResourceFile[]> {
  const allSessions = await listAllSessions();
  const cwdSessions = allSessions.filter((s) => s.cwd === cwd);
  const fileMap = new Map<string, ResourceFile>();

  for (const session of cwdSessions) {
    let entries: SessionEntry[];
    try {
      entries = SessionManager.open(session.path).getEntries() as unknown as SessionEntry[];
    } catch {
      continue;
    }

    let title = "";
    for (const e of entries) {
      if (e.type === "message" && (e as SessionMessageEntry).message?.role === "user") {
        const content = typeof (e as SessionMessageEntry).message.content === "string"
          ? (e as SessionMessageEntry).message.content as string
          : "";
        title = content.slice(0, 60);
        break;
      }
    }

    for (const e of entries) {
      if (e.type !== "message") continue;
      const msg = e as SessionMessageEntry;
      if (msg.message?.role !== "assistant") continue;
      const content = msg.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if ((block as ToolCallContent).type !== "toolCall") continue;
        const tc = block as ToolCallContent;
        // SessionManager returns "name" in raw entries; normalizeToolCalls maps it to toolName,
        // but we work with raw entries here so fall back to name
        const toolName = tc.toolName || (tc as unknown as Record<string, unknown>).name as string;
        if (!/^(write|edit)/i.test(toolName ?? "")) continue;
        // SessionManager raw entries use "arguments" not "input"
        const input = tc.input || (tc as unknown as Record<string, unknown>).arguments as Record<string, unknown> | undefined;
        const filePath =
          (input?.path as string | undefined) ??
          (input?.target as string | undefined) ??
          (input?.filePath as string | undefined);
        if (!filePath || typeof filePath !== "string") continue;

        let relativePath = filePath;
        if (filePath.startsWith(cwd)) {
          relativePath = filePath.slice(cwd.length).replace(/^\//, "");
        }
        const fileName = relativePath.split("/").pop() ?? relativePath;
        // Only include Markdown files
        if (!/\.md$/i.test(fileName)) continue;

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
  }

  return Array.from(fileMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}



