"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * 从 assistant 消息中提取纯文本
 */
function extractAssistantText(message: unknown): string {
  const msg = message as { role?: string; content?: unknown } | undefined;
  if (!msg || msg.role !== "assistant") return "";
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");
  }
  return "";
}

// ============================================================
// 语音引擎 — 中文 TTS
// ============================================================

let _voicesReady = false;
let _voiceReadyPromise: Promise<void> | null = null;

/** 确保语音列表已加载（异步） */
function ensureVoicesReady(): Promise<void> {
  if (_voicesReady) return Promise.resolve();
  if (_voiceReadyPromise) return _voiceReadyPromise;

  _voiceReadyPromise = new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      _voicesReady = true;
      resolve();
      return;
    }
    // 等待浏览器异步加载语音列表
    const onChanged = () => {
      speechSynthesis.removeEventListener("voiceschanged", onChanged);
      _voicesReady = true;
      resolve();
    };
    speechSynthesis.addEventListener("voiceschanged", onChanged);
    // 超时兜底：1 秒后无论如何继续
    setTimeout(() => {
      speechSynthesis.removeEventListener("voiceschanged", onChanged);
      _voicesReady = true;
      resolve();
    }, 1000);
  });

  return _voiceReadyPromise;
}

/** 获取所有中文语音 */
function findChineseVoice(): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices();
  if (all.length === 0) return null;

  // 优先级：
  // 1. zh-CN + localService + 名字里有 "Tingting" / "Sin-Ji"
  // 2. zh-CN + localService
  // 3. zh-CN
  // 4. 任何 zh 开头的
  // 5. 名字里有 Chinese/中文 关键字的

  const zhCN = all.filter((v) => v.lang === "zh-CN");
  const zhAny = all.filter((v) => v.lang.startsWith("zh"));

  const pref = zhCN.find((v) => v.localService && (v.name.includes("Tingting") || v.name.includes("Sin-Ji")));
  if (pref) return pref;

  const local = zhCN.find((v) => v.localService) ?? zhAny.find((v) => v.localService);
  if (local) return local;

  const any = zhCN[0] ?? zhAny[0];
  if (any) return any;

  // 有些系统用 "cmn" 标记普通话
  const cmn = all.find((v) => v.lang.includes("cmn") || v.lang.includes("yue") || v.name.includes("Tingting") || v.name.includes("Yaoyao") || v.name.includes("Sin-Ji"));
  if (cmn) return cmn;

  return null;
}

function doSpeak(text: string) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.volume = 0.9;

  const voice = findChineseVoice();
  if (voice) {
    utterance.voice = voice;
    console.log("[TTS] 使用语音:", voice.name, voice.lang);
  } else {
    console.log("[TTS] 未找到中文语音，使用 lang=zh-CN 兜底");
  }

  speechSynthesis.speak(utterance);
}

// ============================================================
// Hook
// ============================================================

export function useAudio() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("pi-tts-enabled");
    return stored === null ? true : stored === "true";
  });

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // 预加载语音（在组件挂载后尽早触发）
  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureVoicesReady();
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("pi-tts-enabled", String(next));
      if (!next) speechSynthesis.cancel();
      return next;
    });
  }, []);

  /** 用中文朗读文本 */
  const speakChinese = useCallback(async (text: string) => {
    if (!enabledRef.current || !text.trim()) return;
    try {
      speechSynthesis.cancel();
      await ensureVoicesReady();
      doSpeak(text);
    } catch {
      // SpeechSynthesis not available
    }
  }, []);

  /** 停止朗读 */
  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
  }, []);

  /** 播放完成音（向后兼容，内部调用 TTS） */
  const playDoneSound = useCallback((assistantMessage?: unknown) => {
    if (!enabledRef.current) return;
    if (assistantMessage) {
      const text = extractAssistantText(assistantMessage);
      if (text.trim()) {
        speakChinese(text);
        return;
      }
    }
    // Fallback: 叮咚声
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = now + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.start(t);
        osc.stop(t + 0.45);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch { /* ignore */ }
  }, [speakChinese]);

  return {
    soundEnabled: enabled,
    onSoundToggle: toggle,
    playDoneSound,
    speakChinese,
    stopSpeaking,
    extractAssistantText,
    soundEnabledRef: enabledRef,
  };
}
