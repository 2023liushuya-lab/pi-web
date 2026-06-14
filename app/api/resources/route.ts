import { NextRequest, NextResponse } from "next/server";
import { getResourceFiles } from "@/lib/session-reader";

export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd");
    const sort = request.nextUrl.searchParams.get("sort") ?? "time";

    if (!cwd) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }

    const files = await getResourceFiles(cwd);

    // Re-sort if needed (getResourceFiles already sorts by time desc)
    if (sort === "session") {
      files.sort((a, b) =>
        a.sessionTitle.localeCompare(b.sessionTitle) || b.timestamp.localeCompare(a.timestamp)
      );
    }

    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
