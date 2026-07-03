import { existsSync as defaultExistsSync } from "node:fs";
import serverlessChromium from "@sparticuz/chromium";
import type { LaunchOptions } from "playwright-core";

export const LOCAL_CHROME_EXECUTABLE_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const BASE_CHROMIUM_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];

interface ServerlessChromium {
  args: string[];
  executablePath: () => Promise<string>;
}

type PostPdfBrowserEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "AWS_LAMBDA_FUNCTION_NAME"
    | "AWS_REGION"
    | "NETLIFY"
    | "NODE_ENV"
    | "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
    | "VERCEL"
  >
>;

export interface PostPdfBrowserRuntime {
  env?: PostPdfBrowserEnv;
  platform?: NodeJS.Platform;
  existsSync?: (path: string) => boolean;
  playwrightExecutablePath?: string;
  serverlessChromium?: ServerlessChromium;
}

export async function buildPostPdfBrowserLaunchOptions({
  env = process.env,
  platform = process.platform,
  existsSync = defaultExistsSync,
  playwrightExecutablePath,
  serverlessChromium: chromium = serverlessChromium,
}: PostPdfBrowserRuntime = {}): Promise<LaunchOptions> {
  const envExecutablePath = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (envExecutablePath) {
    return launchOptionsForExecutable(envExecutablePath);
  }

  if (shouldUseServerlessChromium(env, platform)) {
    return {
      executablePath: await chromium.executablePath(),
      headless: true,
      args: mergeArgs(chromium.args, BASE_CHROMIUM_ARGS),
    };
  }

  if (existsSync(LOCAL_CHROME_EXECUTABLE_PATH)) {
    return launchOptionsForExecutable(LOCAL_CHROME_EXECUTABLE_PATH);
  }

  if (playwrightExecutablePath && existsSync(playwrightExecutablePath)) {
    return launchOptionsForExecutable(playwrightExecutablePath);
  }

  return {
    headless: true,
    args: [...BASE_CHROMIUM_ARGS],
  };
}

function launchOptionsForExecutable(executablePath: string): LaunchOptions {
  return {
    executablePath,
    headless: true,
    args: [...BASE_CHROMIUM_ARGS],
  };
}

function shouldUseServerlessChromium(
  env: PostPdfBrowserEnv,
  platform: NodeJS.Platform
): boolean {
  return Boolean(
    env.VERCEL ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      env.AWS_REGION ||
      env.NETLIFY ||
      (platform === "linux" && env.NODE_ENV === "production")
  );
}

function mergeArgs(...argSets: string[][]): string[] {
  return Array.from(new Set(argSets.flat()));
}
