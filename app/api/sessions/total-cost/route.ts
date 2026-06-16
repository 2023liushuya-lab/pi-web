import { NextResponse } from "next/server";
import { listAllSessions, getSessionEntries } from "@/lib/session-reader";
import type { SessionEntry, SessionMessageEntry, AssistantMessage } from "@/lib/types";

export async function GET() {
  try {
    const sessions = await listAllSessions();
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let sessionCount = 0;

    for (const s of sessions) {
      let entries: SessionEntry[];
      try {
        entries = getSessionEntries(s.path);
      } catch {
        continue;
      }

      let sessionHasCost = false;
      for (const entry of entries) {
        if (entry.type !== "message") continue;
        const msg = (entry as SessionMessageEntry).message;
        if (msg.role !== "assistant") continue;
        const usage = (msg as AssistantMessage).usage;
        if (!usage) continue;
        totalInput += usage.input ?? 0;
        totalOutput += usage.output ?? 0;
        totalCacheRead += usage.cacheRead ?? 0;
        totalCacheWrite += usage.cacheWrite ?? 0;
        totalCost += usage.cost?.total ?? 0;
        if (usage.cost?.total) sessionHasCost = true;
      }
      if (sessionHasCost) sessionCount++;
    }

    return NextResponse.json({
      totalCost,
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheWrite,
      sessionCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
