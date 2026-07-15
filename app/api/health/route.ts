import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        // The Capacitor startup page is served from a different origin until
        // it redirects to the embedded Next server.
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
