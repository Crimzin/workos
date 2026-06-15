import { NextResponse, type NextRequest } from "next/server";
import {
  getPrivateAccessSettings,
  isBasicAuthAuthorized,
  privateAccessChallengeHeader,
  shouldBypassPrivateAccess,
} from "@/lib/private-access";

export function proxy(request: NextRequest) {
  if (shouldBypassPrivateAccess(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const settings = getPrivateAccessSettings();

  if (settings.mode === "disabled") {
    return NextResponse.next();
  }

  if (settings.mode === "misconfigured") {
    return new NextResponse(
      "WorkOS private access is not configured. Set WORKOS_ACCESS_PASSWORD before exposing this deployment.",
      { status: 503 }
    );
  }

  if (isBasicAuthAuthorized(request.headers.get("authorization"), settings)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": privateAccessChallengeHeader(),
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpg|jpeg|js|json|map|mjs|png|svg|txt|webmanifest|webp|xml)$).*)",
  ],
};
