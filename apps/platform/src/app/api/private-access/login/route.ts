import { NextResponse, type NextRequest } from "next/server";
import {
  PRIVATE_ACCESS_COOKIE_NAME,
  PRIVATE_ACCESS_SESSION_MAX_AGE_SECONDS,
  createPrivateAccessSession,
  getPrivateAccessSettings,
  isPrivateAccessPasswordValid,
  normalizePrivateAccessNextPath,
} from "@/lib/private-access";

function redirectToLogin(request: NextRequest, nextPath: string, error: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", nextPath);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = normalizePrivateAccessNextPath(
    String(formData.get("next") ?? "")
  );
  const settings = getPrivateAccessSettings();

  if (settings.mode === "disabled") {
    return NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });
  }

  if (settings.mode === "misconfigured") {
    return redirectToLogin(request, nextPath, "config");
  }

  if (!isPrivateAccessPasswordValid(password, settings)) {
    return redirectToLogin(request, nextPath, "invalid");
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), {
    status: 303,
  });
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
