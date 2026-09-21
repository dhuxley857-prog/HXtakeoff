import { NextRequest, NextResponse } from "next/server";

const SOURCES = {
  drawings: {
    url: "https://charlestownri.gov/vertical/sites/%7BDF68A5B8-A4F3-47A1-AE87-B411E21C6E1C%7D/uploads/16_0601_CHW_Full_CD_Set.pdf",
    filename: "HX-Test-001-ChurchWoods-100-Percent-CD-Drawings.pdf",
  },
  "addendum-3": {
    url: "https://charlestownri.gov/vertical/sites/%7BDF68A5B8-A4F3-47A1-AE87-B411E21C6E1C%7D/uploads/CHURCH_WOODS_-_16_0627_CHW_Addendum_3.pdf",
    filename: "HX-Test-001-ChurchWoods-Addendum-3.pdf",
  },
} as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("file") || "drawings",
    source = SOURCES[key as keyof typeof SOURCES];
  if (!source)
    return NextResponse.json(
      { error: "Unknown Test 001 document" },
      { status: 404 },
    );

  const range = request.headers.get("range"),
    upstream = await fetch(source.url, {
      cache: "no-store",
      headers: range ? { Range: range } : undefined,
    });
  if (!upstream.ok && upstream.status !== 206)
    return NextResponse.json(
      { error: "Test 001 source unavailable", status: upstream.status },
      { status: 502 },
    );

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${source.filename}"`,
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
  });
  for (const name of [
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ])
    if (upstream.headers.has(name))
      headers.set(name, upstream.headers.get(name)!);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
