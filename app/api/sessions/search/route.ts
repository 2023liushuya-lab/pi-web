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
