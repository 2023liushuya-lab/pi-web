"use client";

import { useState, useEffect, useCallback } from "react";
import React from "react";

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

  const sortBar = (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, padding: "6px 8px",
      fontSize: 10, borderBottom: "1px solid var(--border)", flexShrink: 0,
    }}>
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {(["time", "type", "session"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            style={{
              padding: "3px 8px", borderRadius: 4, border: "none",
              background: sort === mode ? "var(--bg-selected)" : "none",
              color: sort === mode ? "var(--text)" : "var(--text-muted)",
              cursor: "pointer", fontSize: 10,
              fontWeight: sort === mode ? 600 : 400,
            }}
          >
            {{ time: "🕐 时间", type: "📁 类型", session: "💬 来源" }[mode]}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{files.length} 个文件</span>
    </div>
  );

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
        {sortBar}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>}
          {!loading && files.length === 0 && (
            <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>暂无生成的文件</div>
          )}
          {[...groups.entries()].map(([category, items]) => (
            <div key={category}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", padding: "8px 12px 4px", fontWeight: 600, textTransform: "uppercase" }}>
                {category}
              </div>
              {items.map((f) => (
                <FileItem key={f.relativePath} file={f} onOpenFile={onOpenFile} onSelectSession={onSelectSession} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {sortBar}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>}
        {!loading && files.length === 0 && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 12 }}>暂无生成的文件</div>
        )}
        {files.map((f) => (
          <FileItem key={f.relativePath} file={f} onOpenFile={onOpenFile} onSelectSession={onSelectSession} />
        ))}
      </div>
    </div>
  );
}

function FileItem({
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
        padding: "6px 12px 6px 14px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
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
  const code = ["ts", "tsx", "js", "jsx", "json", "css", "html", "py", "rs", "go", "toml", "yaml", "yml"];
  if (md.includes(ext)) return "📄 Markdown";
  if (office.includes(ext)) return "📊 Office / 数据";
  if (image.includes(ext)) return "🎨 图片";
  if (code.includes(ext)) return "💻 代码";
  return "📝 其他";
}
