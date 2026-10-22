import { NextResponse, type NextRequest } from "next/server";
import { authRequired, COOKIE_NAME, verifySession } from "./lib/auth";

/** Everything needs a login except /login and the public report links (/r/...) */
export async function proxy(req: NextRequest) {
  if (!authRequired()) return NextResponse.next();

  if (await verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  const target = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  url.search = "";
  if (target !== "/") url.searchParams.set("next", target);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|r/).*)"],
};
