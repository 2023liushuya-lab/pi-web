"use client";

import { useState, useEffect, useCallback } from "react";
import React from "react";
import type { ResourceFile } from "@/lib/types";

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
  const [sort, setSort] = useState<"time" | "session">("time");
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
        {(["time", "session"] as const).map((mode) => (
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
            {{ time: "🕐 时间", session: "💬 来源" }[mode]}
          </button>
        ))}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{files.length} 个文件</span>
    </div>
  );

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
