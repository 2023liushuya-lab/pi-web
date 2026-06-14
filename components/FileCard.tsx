"use client";

import { useEffect, useState } from "react";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";

interface Props {
  filePath: string;
  toolName: string; // "write" | "edit"
  cwd?: string;
  onOpenFile?: (filePath: string, fileName: string) => void;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const CODE_EXTS = new Set(["ts", "tsx", "js", "jsx", "json", "css", "html", "md", "py", "rs", "go", "yaml", "yml", "toml", "sh", "bash", "sql", "xml", "graphql", "prisma"]);

function isImagePath(fp: string): boolean {
  const ext = fp.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXTS.has(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileCard({ filePath, toolName, cwd, onOpenFile }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const fileName = getFileName(filePath);
  const isImage = isImagePath(filePath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const encoded = encodeFilePathForApi(filePath);

    // Fetch file content
    fetch(`/api/files/${encoded}?type=read`)
      .then((r) => r.json())
      .then((d: { content?: string; size?: number; error?: string }) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
        } else {
          setContent(d.content ?? null);
          if (typeof d.size === "number") setSize(d.size);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath]);

  const previewLines = content ? content.split("\n") : [];
  const previewText = previewLines.slice(0, 18).join("\n");
  const hasMore = previewLines.length > 18;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  const toolLabel = toolName === "write" ? "Created" : "Modified";

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-hover)",
        }}
      >
        {/* File icon */}
        <span style={{ fontSize: 16, flexShrink: 0 }}>
          {isImage ? "🖼️" : ext === "md" ? "📝" : ext === "json" ? "📋" : "📄"}
        </span>

        {/* File info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={filePath}
            >
              {fileName}
            </span>
            {size !== null && (
              <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                {formatSize(size)}
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 4,
                background: toolName === "write" ? "rgba(34,197,94,0.1)" : "rgba(37,99,235,0.1)",
                color: toolName === "write" ? "#16a34a" : "var(--accent)",
                fontWeight: 500,
              }}
            >
              {toolLabel}
            </span>
          </div>
          {cwd && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                marginTop: 1,
              }}
            >
              {filePath.replace(cwd + "/", "")}
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            padding: 0,
            background: "none",
            border: "none",
            color: "var(--text-dim)",
            cursor: "pointer",
            borderRadius: 4,
            flexShrink: 0,
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            <polyline points="2 4.5 6 8.5 10 4.5" />
          </svg>
        </button>
      </div>

      {/* Preview body */}
      {expanded && (
        <>
          {loading ? (
            <div
              style={{
                padding: "16px 12px",
                fontSize: 12,
                color: "var(--text-dim)",
                textAlign: "center",
              }}
            >
              Loading preview...
            </div>
          ) : error ? (
            <div
              style={{
                padding: "16px 12px",
                fontSize: 12,
                color: "#f87171",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          ) : isImage ? (
            <div
              style={{
                padding: 12,
                display: "flex",
                justifyContent: "center",
                background:
                  "linear-gradient(45deg, var(--bg) 25%, transparent 25%), linear-gradient(-45deg, var(--bg) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg) 75%), linear-gradient(-45deg, transparent 75%, var(--bg) 75%)",
                backgroundSize: "12px 12px",
                backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${encodeFilePathForApi(filePath)}?type=read`}
                alt={fileName}
                style={{
                  maxWidth: "100%",
                  maxHeight: 320,
                  borderRadius: 6,
                  objectFit: "contain",
                  border: "1px solid var(--border)",
                }}
              />
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                fontSize: 12,
                lineHeight: 1.55,
                fontFamily: "var(--font-mono)",
                color: "var(--text-muted)",
                overflow: "auto",
                maxHeight: 300,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "var(--bg)",
              }}
            >
              {previewText || "(empty file)"}
              {hasMore && (
                <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                  {"\n"}... {previewLines.length - 18} more lines
                </span>
              )}
            </pre>
          )}

          {/* Footer actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            {onOpenFile && (
              <button
                onClick={() => onOpenFile(filePath, fileName)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg-hover)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open
              </button>
            )}
            <a
              href={`/api/files/${encodeFilePathForApi(filePath)}?type=read`}
              download={fileName}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 5,
                background: "var(--bg-hover)",
                color: "var(--text-muted)",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </a>
          </div>
        </>
      )}
    </div>
  );
}
