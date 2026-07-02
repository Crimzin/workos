import assert from "node:assert/strict";
import {
  buildPostPdfBrowserLaunchOptions,
  LOCAL_CHROME_EXECUTABLE_PATH,
} from "./post-export-browser";

const serverlessChromium = {
  args: ["--serverless-chromium"],
  executablePath: async () => "/tmp/chromium",
};

void (async () => {
  const localOptions = await buildPostPdfBrowserLaunchOptions({
    env: {},
    platform: "darwin",
    existsSync: (path) => path === LOCAL_CHROME_EXECUTABLE_PATH,
    serverlessChromium,
  });

  assert.equal(localOptions.executablePath, LOCAL_CHROME_EXECUTABLE_PATH);
  assert.deepEqual(localOptions.args, [
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ]);

  const overrideOptions = await buildPostPdfBrowserLaunchOptions({
    env: {
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/custom/chrome",
      VERCEL: "1",
    },
    platform: "linux",
    existsSync: () => false,
    serverlessChromium,
  });

  assert.equal(overrideOptions.executablePath, "/custom/chrome");
  assert.deepEqual(overrideOptions.args, [
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ]);

  const vercelOptions = await buildPostPdfBrowserLaunchOptions({
    env: { VERCEL: "1" },
    platform: "linux",
    existsSync: () => false,
    serverlessChromium,
  });

  assert.equal(vercelOptions.executablePath, "/tmp/chromium");
  assert.deepEqual(vercelOptions.args, [
    "--serverless-chromium",
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ]);
})();
