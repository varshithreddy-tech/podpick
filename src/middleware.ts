import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// App-password gate. API routes also re-check the device cookie themselves.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("pp_session")?.value;
  let ok = false;
  if (token) {
    try {
      ok = !!(await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET ?? ""))).payload.ok;
    } catch {}
  }
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in", code: "no_device" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|api/auth/login|_next|favicon.ico).*)"],
};
