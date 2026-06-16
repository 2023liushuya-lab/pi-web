import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { cacheSessionPath } from "./session-reader";
import type { AgentSessionLike, ToolInfo } from "./pi-types";

// ============================================================================
// Chinese system prompt localization
// ============================================================================

function localizeSystemPrompt(prompt: string): string {
  return prompt
    // Agent identity
    .replace(
      "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
      "你是一个在 pi（编程智能体框架）中运行的专家编程助手。你可以读取文件、执行命令、编辑代码以及创建新文件。"
    )
    // Available tools header
    .replace(
      "Available tools:",
      "可用工具："
    )
    // Guidelines
    .replace(
      "Guidelines:",
      "使用指南："
    )
    // Specific guideline lines
    .replace(
      "- Use bash for file operations like ls, rg, find",
      "- 使用 bash 执行文件操作（如 ls、rg、find）"
    )
    .replace(
      "- Use read to examine files instead of cat or sed.",
      "- 使用 read 来查看文件，不要用 cat 或 sed"
    )
    .replace(
      "- Use edit for precise changes (edits[].oldText must match exactly)",
      "- 用 edit 进行精确修改（edits[].oldText 必须完全匹配）"
    )
    .replace(
      "- When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls",
      "- 修改同一文件中多个不同位置时，在一个 edit 调用中使用多个 entries[]，而不是多次 edit 调用"
    )
    .replace(
      "- Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.",
      "- 每个 edits[].oldText 都是针对原文件匹配的，而不是基于之前的编辑结果。不要使用重叠或嵌套的编辑。合并相邻的修改为一个 edit"
    )
    .replace(
      "- Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.",
      "- edits[].oldText 尽量精简，只要在文件中唯一即可。不要用大段未修改的内容来填充"
    )
    .replace(
      "- Use write only for new files or complete rewrites.",
      "- write 仅用于创建新文件或完全重写"
    )
    .replace(
      "- Use pdf_info as a first step when working with PDFs to understand what you're dealing with.",
      "- 处理 PDF 时，先用 pdf_info 了解文档基本信息"
    )
    .replace(
      "- Check the has_fillable_fields flag before deciding how to fill a PDF form.",
      "- 填充 PDF 表单前，先检查 has_fillable_fields 标志"
    )
    .replace(
      "- Use pdf_extract_text for reading PDF content. Specify page ranges to avoid extracting huge documents entirely.",
      "- 使用 pdf_extract_text 读取 PDF 内容，指定页码范围以避免提取整个大文档"
    )
    .replace(
      "- For table extraction, use pdf_extract_tables instead.",
      "- 提取表格数据请使用 pdf_extract_tables"
    )
    .replace(
      "- Always use pdf_form_fields before attempting to fill a PDF form.",
      "- 填充 PDF 表单前务必先调用 pdf_form_fields"
    )
    .replace(
      "- Use the field IDs returned by this tool in pdf_fill_form.",
      "- 在 pdf_fill_form 中使用 pdf_form_fields 返回的字段 ID"
    )
    .replace(
      "- For checkboxes, use the checked_value/unchecked_value from pdf_form_fields.",
      "- 对于复选框，使用 pdf_form_fields 返回的 checked_value/unchecked_value"
    )
    .replace(
      "- For radio groups, use one of the radio_options values.",
      "- 对于单选组，使用 radio_options 中的值"
    )
    .replace(
      "- Be concise in your responses",
      "- 回复简洁明了"
    )
    .replace(
      "- Show file paths clearly when working with files",
      "- 处理文件时清晰显示文件路径"
    )
    .replace(
      "In addition to the tools above, you may have access to other custom tools depending on the project.",
      "除上述工具外，根据项目配置你可能还能使用其他自定义工具。"
    )
    // Footer labels
    .replace(
      "Current date:",
      "当前日期："
    )
    .replace(
      "Current working directory:",
      "当前工作目录："
    )
    .replace(
      "## Git Context",
      "## Git 上下文"
    )
    .replace(
      "- Branch:",
      "- 分支："
    )
    .replace(
      "- Commit:",
      "- 提交："
    )
    .replace(
      "- User:",
      "- 用户："
    );
}

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private _alive = true;

  constructor(public readonly inner: AgentSessionLike) {}

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  isAlive(): boolean {
    return this._alive;
  }

  start(): void {
    this.unsubscribe = this.inner.subscribe((event: AgentEvent) => {
      this.resetIdleTimer();
      // Re-localize system prompt before each agent request —
      // pi may rebuild it internally before submitting to the model.
      if (event.type === "beforeAgentStart" && this.inner.agent.state?.systemPrompt) {
        this.inner.agent.state.systemPrompt = localizeSystemPrompt(this.inner.agent.state.systemPrompt);
      }
      for (const l of this.listeners) l(event);
    });
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), 10 * 60 * 1000);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    this.resetIdleTimer();
    const type = command.type as string;

    switch (type) {
      case "prompt": {
        // Extract text, images, and files from the message payload
        const rawMessage = command.message;
        let promptText = "";
        let promptImages: Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        let promptFiles: Array<{ type: "file"; fileName: string; mimeType: string; data: string }> | undefined;

        if (typeof rawMessage === "string") {
          promptText = rawMessage;
          promptImages = command.images as typeof promptImages;
        } else if (Array.isArray(rawMessage)) {
          const blocks = rawMessage as Array<{ type: string; text?: string; fileName?: string; mimeType?: string; data?: string }>;
          const images: typeof promptImages = [];
          const files: typeof promptFiles = [];
          for (const b of blocks) {
            if (b.type === "text" && b.text) promptText += (promptText ? "\n" : "") + b.text;
            else if (b.type === "image" && b.data) images!.push({ type: "image", data: b.data, mimeType: b.mimeType ?? "image/png" });
            else if (b.type === "file" && b.data && b.fileName) files!.push({ type: "file", fileName: b.fileName, mimeType: b.mimeType ?? "application/octet-stream", data: b.data });
          }
          if (images.length > 0) promptImages = images;
          if (files.length > 0) promptFiles = files;
        }

        // Attach file info to prompt text so the agent knows about them
        if (promptFiles?.length) {
          const fileList = promptFiles.map((f) => `${f.fileName} (${f.mimeType}, ${Math.round(f.data.length * 0.75 / 1024)}KB)`).join(", ");
          promptText = `[Attached files: ${fileList}]\n\n${promptText}`;
        }

        this.inner.prompt(promptText, promptImages?.length ? { images: promptImages } : undefined).catch(() => {});
        return null;
      }

      case "abort":
        await this.inner.abort();
        return null;

      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile ?? "",
          isStreaming: this.inner.isStreaming,
          isCompacting: this.inner.isCompacting,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          model: model ? { id: model.id, provider: model.provider } : undefined,
          messageCount: 0,
          pendingMessageCount: 0,
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: this.inner.agent.state?.systemPrompt ?? "",
          thinkingLevel: this.inner.agent.state?.thinkingLevel ?? "off",
        };
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const registry = this.inner.modelRegistry;
        const model = registry.find(provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        await this.inner.setModel(model);
        return { id: model.id, provider: model.provider };
      }

      case "fork": {
        const entryId = command.entryId as string;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "navigate_tree": {
        const result = await this.inner.navigateTree(command.targetId as string, {});
        return { cancelled: result.cancelled };
      }

      case "set_thinking_level": {
        const level = command.level as string;
        this.inner.setThinkingLevel(level);
        // setThinkingLevel clamps xhigh→high for models where supportsXhigh()===false.
        // If the model has DeepSeek thinking compat (reasoningEffortMap maps xhigh→max),
        // force the state back so the compat layer can use it correctly.
        if (level === "xhigh" && (this.inner.model as { compat?: { thinkingFormat?: string } } | null)?.compat?.thinkingFormat === "deepseek" && this.inner.agent?.state) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        return null;
      }

      case "compact": {
        // pi's compact() does not guard against empty messagesToSummarize — use findCutPoint
        // to pre-check and throw a clean error instead of generating a useless empty summary.
        const { findCutPoint, DEFAULT_COMPACTION_SETTINGS } = await import("@earendil-works/pi-coding-agent");
        const pathEntries = this.inner.sessionManager.getBranch() as Array<{ type: string }>;
        const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...this.inner.settingsManager.getCompactionSettings() };
        let prevCompactionIndex = -1;
        for (let i = pathEntries.length - 1; i >= 0; i--) {
          if (pathEntries[i].type === "compaction") { prevCompactionIndex = i; break; }
        }
        const boundaryStart = prevCompactionIndex + 1;
        const cutPoint = findCutPoint(pathEntries as never, boundaryStart, pathEntries.length, settings.keepRecentTokens);
        const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
        if (historyEnd <= boundaryStart) {
          throw new Error("Conversation too short to compact");
        }
        const result = await this.inner.compact(command.customInstructions as string | undefined);
        return result;
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;
      }

      case "steer": {
        const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
        return null;
      }

      case "follow_up": {
        const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
        return null;
      }

      case "get_tools": {
        const all: ToolInfo[] = this.inner.getAllTools();
        const active = new Set<string>(this.inner.getActiveToolNames());
        return all.map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "set_tools": {
        this.inner.setActiveToolsByName(command.toolNames as string[]);
        // Re-localize both surface state and the canonical _baseSystemPrompt
        // after tools change triggers a prompt rebuild.
        if (this.inner.agent.state?.systemPrompt) {
          const localized = localizeSystemPrompt(this.inner.agent.state.systemPrompt);
          this.inner.agent.state.systemPrompt = localized;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this.inner as any)._baseSystemPrompt = localized;
        }
        return null;
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled as boolean);
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribe?.();
    this.onDestroyCallback?.();
  }
}

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), pi generates its own id.
 * Pass toolNames to pre-configure active tools (empty array = all tools disabled).
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[]
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const { SessionManager, getAgentDir } = await import("@earendil-works/pi-coding-agent");
    const agentDir = getAgentDir();

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile, undefined)
      : SessionManager.create(cwd, undefined);

    // Determine which tools to pass based on requested toolNames.
    // Since v0.68.0, createAgentSession expects string[] tool names instead of Tool[] instances.
    // Pass all built-in coding tool names by default; for "all off", pass empty array.
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : allCodingToolNames;
    }

    const { session: inner } = await createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });

    // If specific tool names were requested (non-empty), narrow active tools now
    if (toolNames && toolNames.length > 0) {
      inner.setActiveToolsByName(toolNames);
    }

    // When all tools are disabled, clear the system prompt entirely.
    // pi's buildSystemPrompt always produces a non-empty prompt even with no tools;
    // the only way to truly clear it is to call agent.setSystemPrompt directly.
    if (toolNames?.length === 0) {
      inner.agent.state.systemPrompt = "";
    } else if (inner.agent.state?.systemPrompt) {
      // Localize system prompt to Chinese where possible.
      // Must localize BOTH agent.state.systemPrompt AND the private _baseSystemPrompt —
      // pi resets agent.state.systemPrompt from _baseSystemPrompt before every turn.
      const localized = localizeSystemPrompt(inner.agent.state.systemPrompt);
      inner.agent.state.systemPrompt = localized;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inner as any)._baseSystemPrompt = localized;
    }

    const wrapper = new AgentSessionWrapper(inner);
    wrapper.start();

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
