"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";

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
  onSelectSession: (sessionId: string, query: string) => void;
}

export function SearchModal({ open, onClose, cwd, onSelectSession }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || query.trim().length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (cwd) params.set("cwd", cwd);
        const res = await fetch(`/api/sessions/search?${params}`);
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        setResults(data.results ?? []);
        setSelectedIdx(0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, cwd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results.length > 0 && results[selectedIdx]) {
          onSelectSession(results[selectedIdx].sessionId, query);
          onClose();
        }
      }
    },
    [results, selectedIdx, onClose, onSelectSession, query]
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
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Input */}
        <div style={{
          display: "flex", alignItems: "center", padding: "14px 16px",
          gap: 10, borderBottom: "1px solid var(--border)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ flexShrink: 0 }}>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )}
        </div>

        {/* Results */}
        <div style={{ maxHeight: 350, overflowY: "auto" }}>
          {query.trim() && !loading && results.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              未找到匹配的对话
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.sessionId}
              onClick={() => { onSelectSession(r.sessionId, query); onClose(); }}
              style={{
                padding: "12px 16px", cursor: "pointer",
                borderBottom: "1px solid var(--bg-panel)",
                background: i === selectedIdx ? "var(--bg-selected)" : "transparent",
                transition: "background 0.1s",
              }}
            >
              <div style={{
                color: "var(--accent)", fontWeight: 600, fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                💬 {r.title.slice(0, 60)}{r.title.length > 60 ? "..." : ""}
              </div>
              {r.matches[0] && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                  {highlightSnippet(r.matches[0].snippet, query)}
                </div>
              )}
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
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
  if (!query || !snippet) return snippet;
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
