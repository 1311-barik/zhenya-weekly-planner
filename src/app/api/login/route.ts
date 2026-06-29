import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, authRequired } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!authRequired()) {
    return NextResponse.json({ ok: true });
  }
  const body = await req.json().catch(() => null);
  if (!body || body.token !== process.env.AUTH_TOKEN) {
    return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, body.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
