"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "en" | "zh";

const STORAGE_KEY = "pi-locale";

// ─── Translation dictionaries ────────────────────────────────────
const dictionaries: Record<Locale, Record<string, string>> = {
  en: {
    // AppShell
    "app.title": "Pi Agent Web",
    "sidebar.hide": "Hide sidebar",
    "sidebar.show": "Show sidebar",
    "theme.light": "Switch to light mode",
    "theme.dark": "Switch to dark mode",
    "export.html": "Export HTML",
    "export.disabled": "Export is available after the session is saved",
    "panel.file.hide": "Hide file panel",
    "panel.file.show": "Show file panel",
    "models": "Models",
    "skills": "Skills",
    "export": "Export",
    "system": "System",
    "system.empty": "System prompt is empty (tools are disabled)",
    "system.loading": "Send a message to load the system prompt",
    "getStarted": "Get Started",
    "getStarted.step1": "Select a project directory from the sidebar",
    "getStarted.step2": "Add models via the",
    "getStarted.step2.button": "button at the bottom",
    "selectSession": "Select a session from the sidebar",
    "noFileOpen": "No file open",

    // SessionSidebar
    "new": "New",
    "refresh": "Refresh",
    "selectProject": "Select project…",
    "newSessionIn": "New session in",
    "selectProjectFirst": "Select a project first",
    "defaultDirectory": "Use default directory",
    "customPath": "Custom path…",
    "customPath.placeholder": "/path/to/project",
    "checking": "Checking…",
    "open": "Open",
    "cancel": "Cancel",
    "loading": "Loading…",
    "noSessions": "No sessions found",
    "explorer": "Explorer",
    "refreshExplorer": "Refresh explorer",
    "delete.confirm": "Delete",
    "delete.question": "Delete",
    "rename": "Rename",
    "delete": "Delete",
    "expandForks": "Expand forks",
    "collapseForks": "Collapse forks",
    "msgs": "msgs",
    "justNow": "just now",
    "mago": "m ago",
    "hago": "h ago",
    "dago": "d ago",

    // ChatInput
    "steer": "Steer",
    "followUp": "Follow-up",
    "steer.title": "Interrupt the Agent and inject the message immediately",
    "followUp.title": "Queue the message to send after the Agent finishes",
    "send": "Send",
    "stop": "Stop",
    "stopAgent": "Stop Agent",
    "compact": "Compact",
    "compact.title": "Compress context",
    "compact.stop": "Stop compressing",
    "compacting": "Compacting…",
    "message.placeholder": "Message…",
    "message.streaming": "Agent is running…",
    "message.steerFollowup": "Steer injects now / Follow-up queues…",
    "attachImage": "Attach image",
    "thinking.title": "Switch reasoning intensity",
    "thinking.auto": "Use pi default",
    "thinking.off": "No reasoning",
    "thinking.minimal": "Minimal reasoning",
    "thinking.low": "Low reasoning",
    "thinking.medium": "Medium reasoning",
    "thinking.high": "High reasoning",
    "thinking.xhigh": "Max reasoning",
    "tools.title": "Switch tool preset",
    "tools.off": "No tools, chat only",
    "tools.default": "4 built-in tools",
    "tools.full": "All built-in tools",
    "retrying": "Retrying",
    "sound.on": "Enable completion sound",
    "sound.off": "Disable completion sound",

    // MessageView
    "copy": "Copy message",
    "editFromHere": "Edit from here — branches within this session",
    "fork.title": "New session — creates an independent copy from here",
    "fork.creating": "Creating new session…",
    "fork.creatingShort": "Creating…",
    "fork.newSession": "New session",
    "thinking": "Thinking",

    // BranchNavigator
    "branches": "Branches",

    // ModelsConfig
    "provider": "Provider",
    "model": "Model",
    "test": "Test",
    "testing": "Testing…",
    "testingConnection": "Testing model connection...",
    "connected": "Connected",
    "failed": "Failed",
    "ok": "OK",
    "displayName": "Display name",
    "name": "Name",
    "save": "Save",
    "saved": "Saved",
    "saving": "Saving…",
    "disconnect": "Disconnect",
    "removing": "Removing…",
    "reLogin": "Re-login",
    "login": "Login",
    "hideApiKey": "Hide API key",
    "showApiKey": "Show API key",
    "providerName": "Provider name",
    "baseUrl": "Base URL",
    "reasoning": "Reasoning / thinking",
    "imageInput": "Image input",
    "deepseekCompat": "DeepSeek thinking compat",
    "contextWindow": "Context window (tokens)",
    "maxOutput": "Max output tokens",
    "costPerMillion": "Cost (per million tokens)",
    "thinkingLevelMap": "Thinking level map",
    "subscription": "Subscription",
    "alreadyConnected": "Already connected. You can re-login or disconnect.",
    "connectAccount": "Connect your",
    "account": "account.",
    "completeSignIn": "Complete sign-in in the browser, then copy the redirect URL from the address bar and paste it below.",
    "enterValue": "Enter value…",
    "searchProviders": "Search providers…",
    "networkError": "Network error",
    "connectionLost": "Connection lost",
    "verifying": "Verifying…",
    "continuing": "Continuing…",
    "enterNewKey": "Enter new key to replace…",

    // SkillsConfig
    "install": "Install",
    "installed": "Installed",
    "installing": "Installing…",
    "search": "Search",
    "webSearch": "Web Search",
    "uploadFolder": "Upload Folder",
    "searchSkills": "Search skills…",
    "noResults": "No results",

    // FileViewer / FileExplorer
    "openFile": "Open",

    // Locale
    "locale.en": "EN",
    "locale.zh": "中文",
    "locale.switchToZh": "切换为中文",
    "locale.switchToEn": "Switch to English",
  },
  zh: {
    // AppShell
    "app.title": "Pi Agent Web",
    "sidebar.hide": "隐藏侧边栏",
    "sidebar.show": "显示侧边栏",
    "theme.light": "切换到浅色模式",
    "theme.dark": "切换到深色模式",
    "export.html": "导出 HTML",
    "export.disabled": "会话保存后才可导出",
    "panel.file.hide": "隐藏文件面板",
    "panel.file.show": "显示文件面板",
    "models": "模型",
    "skills": "技能",
    "export": "导出",
    "system": "系统",
    "system.empty": "系统提示词为空（工具已禁用）",
    "system.loading": "发送消息以加载系统提示词",
    "getStarted": "开始使用",
    "getStarted.step1": "从侧边栏选择项目目录",
    "getStarted.step2": "通过底部的",
    "getStarted.step2.button": "按钮添加模型",
    "selectSession": "从侧边栏选择一个会话",
    "noFileOpen": "未打开文件",

    // SessionSidebar
    "new": "新建",
    "refresh": "刷新",
    "selectProject": "选择项目…",
    "newSessionIn": "在以下目录新建会话",
    "selectProjectFirst": "请先选择项目",
    "defaultDirectory": "使用默认目录",
    "customPath": "自定义路径…",
    "customPath.placeholder": "/路径/到/项目",
    "checking": "检查中…",
    "open": "打开",
    "cancel": "取消",
    "loading": "加载中…",
    "noSessions": "暂无会话",
    "explorer": "文件浏览器",
    "refreshExplorer": "刷新文件浏览器",
    "delete.confirm": "删除",
    "delete.question": "删除",
    "rename": "重命名",
    "delete": "删除",
    "expandForks": "展开分叉",
    "collapseForks": "收起分叉",
    "msgs": "条消息",
    "justNow": "刚刚",
    "mago": "分钟前",
    "hago": "小时前",
    "dago": "天前",

    // ChatInput
    "steer": "引导",
    "followUp": "追加",
    "steer.title": "打断 Agent 当前运行，立即注入消息",
    "followUp.title": "在 Agent 完成后排队发送",
    "send": "发送",
    "stop": "停止",
    "stopAgent": "停止 Agent",
    "compact": "压缩",
    "compact.title": "压缩上下文",
    "compact.stop": "停止压缩",
    "compacting": "压缩中…",
    "message.placeholder": "输入消息…",
    "message.streaming": "Agent 运行中…",
    "message.steerFollowup": "引导 立即注入 / 追加 排队…",
    "attachImage": "附加图片",
    "thinking.title": "切换推理强度",
    "thinking.auto": "沿用 pi 默认设置",
    "thinking.off": "关闭推理",
    "thinking.minimal": "最少推理",
    "thinking.low": "低强度推理",
    "thinking.medium": "中等推理",
    "thinking.high": "高强度推理",
    "thinking.xhigh": "最高强度推理",
    "tools.title": "切换工具预设",
    "tools.off": "无工具，纯聊天",
    "tools.default": "4 项内置工具",
    "tools.full": "全部内置工具",
    "retrying": "重试中",
    "sound.on": "开启完成提示音",
    "sound.off": "关闭完成提示音",

    // MessageView
    "copy": "复制消息",
    "editFromHere": "从此处编辑 — 在当前会话内创建分支",
    "fork.title": "新建会话 — 从此处创建独立副本",
    "fork.creating": "正在创建新会话…",
    "fork.creatingShort": "创建中…",
    "fork.newSession": "新建会话",
    "thinking": "思考中",

    // BranchNavigator
    "branches": "分支",

    // ModelsConfig
    "provider": "提供商",
    "model": "模型",
    "test": "测试",
    "testing": "测试中…",
    "testingConnection": "正在测试模型连接...",
    "connected": "已连接",
    "failed": "失败",
    "ok": "正常",
    "displayName": "显示名称",
    "name": "名称",
    "save": "保存",
    "saved": "已保存",
    "saving": "保存中…",
    "disconnect": "断开连接",
    "removing": "移除中…",
    "reLogin": "重新登录",
    "login": "登录",
    "hideApiKey": "隐藏 API Key",
    "showApiKey": "显示 API Key",
    "providerName": "提供商名称",
    "baseUrl": "Base URL",
    "reasoning": "推理 / 思考",
    "imageInput": "图片输入",
    "deepseekCompat": "DeepSeek 思考兼容",
    "contextWindow": "上下文窗口 (tokens)",
    "maxOutput": "最大输出 tokens",
    "costPerMillion": "费用 (每百万 tokens)",
    "thinkingLevelMap": "推理强度映射",
    "subscription": "订阅",
    "alreadyConnected": "已连接，可重新登录或断开。",
    "connectAccount": "连接你的",
    "account": "账号。",
    "completeSignIn": "在浏览器中完成登录，然后复制地址栏中的重定向 URL 并粘贴到下方。",
    "enterValue": "输入值…",
    "searchProviders": "搜索提供商…",
    "networkError": "网络错误",
    "connectionLost": "连接已断开",
    "verifying": "验证中…",
    "continuing": "继续中…",
    "enterNewKey": "输入新密钥以替换…",

    // SkillsConfig
    "install": "安装",
    "installed": "已安装",
    "installing": "安装中…",
    "search": "搜索",
    "webSearch": "联网搜索",
    "uploadFolder": "上传文件夹",
    "searchSkills": "搜索技能…",
    "noResults": "无结果",

    // FileViewer / FileExplorer
    "openFile": "打开",

    // Locale
    "locale.en": "EN",
    "locale.zh": "中文",
    "locale.switchToZh": "切换为中文",
    "locale.switchToEn": "Switch to English",
  },
};

// ─── Context ─────────────────────────────────────────────────────
interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {}
  // Detect browser language
  const nav = navigator.language ?? "";
  if (nav.startsWith("zh")) return "zh";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  // Sync <html lang> attribute
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: string, fallback?: string) => {
    return dictionaries[locale]?.[key] ?? fallback ?? key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Shorthand: just the `t` function */
export function useT() {
  return useI18n().t;
}
