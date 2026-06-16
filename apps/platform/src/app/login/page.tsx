import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PRIVATE_ACCESS_COOKIE_NAME,
  getPrivateAccessSettings,
  isPrivateAccessSessionAuthorized,
  normalizePrivateAccessNextPath,
} from "@/lib/private-access";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  config: "Private access is not configured yet.",
  invalid: "That password did not match.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizePrivateAccessNextPath(params.next);
  const settings = getPrivateAccessSettings();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value;

  if (isPrivateAccessSessionAuthorized(sessionCookie, settings)) {
    redirect(nextPath);
  }

  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-primary px-5 py-8 text-text-primary">
      <div className="w-full max-w-sm">
        <div className="section-label">WorkOS</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Enter your private WorkOS password.
        </p>

        <form
          action="/api/private-access/login"
          method="post"
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">
              Password
            </span>
            <input
              autoComplete="current-password"
              autoFocus
              className="mt-1.5 block w-full rounded-md border border-border bg-bg-card px-3 py-2.5 text-base text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent focus:ring-2 focus:ring-accent/20"
              name="password"
              required
              type="password"
            />
          </label>

          {errorMessage && (
            <p className="rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
