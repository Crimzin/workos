import { NextResponse, type NextRequest } from "next/server";
import {
  PRIVATE_ACCESS_COOKIE_NAME,
  PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS,
  createPrivateAccessSession,
  getPrivateAccessSettings,
  isBasicAuthAuthorized,
  isPrivateAccessSessionAuthorized,
  normalizePrivateAccessNextPath,
  shouldBypassPrivateAccess,
} from "@/lib/private-access";

function nextWithPathHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-workos-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export function proxy(request: NextRequest) {
  if (shouldBypassPrivateAccess(request.nextUrl.pathname)) {
    return nextWithPathHeader(request);
  }

  const settings = getPrivateAccessSettings();

  if (settings.mode === "disabled") {
    return nextWithPathHeader(request);
  }

  if (settings.mode === "misconfigured") {
    return new NextResponse(
      "WorkOS private access is not configured. Set WORKOS_ACCESS_PASSWORD before exposing this deployment.",
      { status: 503 }
    );
  }

  const sessionCookie = request.cookies.get(PRIVATE_ACCESS_COOKIE_NAME)?.value;
  if (isPrivateAccessSessionAuthorized(sessionCookie, settings)) {
    return nextWithPathHeader(request);
  }

  if (isBasicAuthAuthorized(request.headers.get("authorization"), settings)) {
    const response = nextWithPathHeader(request);
    response.cookies.set(
      PRIVATE_ACCESS_COOKIE_NAME,
      createPrivateAccessSession(settings),
      {
        httpOnly: true,
        maxAge: PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      }
    );
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(
    "next",
    normalizePrivateAccessNextPath(
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    )
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|mjs|png|svg|txt|webmanifest|webp|xml)$).*)",
  ],
};
