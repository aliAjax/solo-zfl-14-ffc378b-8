import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// 镜像源未提供 chrome-headless-shell，使用已安装的完整 Chromium（支持 --headless=new）
function findChromiumExecutable() {
  const root = join(process.env.HOME || "/tmp", ".cache", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()[0];
  if (!dir) return undefined;
  const chromeRoot = join(root, dir);
  // 支持不同平台目录：chrome-linux / chrome-linux-arm64 / chrome-mac / chrome-win
  for (const sub of readdirSync(chromeRoot)) {
    const executable = process.platform === "win32" ? "chrome.exe" : "chrome";
    const candidate = join(chromeRoot, sub, executable);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

// 无 root 环境下系统库（libnss3 等）解包在用户目录，运行浏览器时注入
function findChromeLibPath() {
  const libRoot = join(process.env.HOME || "/tmp", ".chrome-libs", "root");
  if (!existsSync(libRoot)) return undefined;
  const dirs = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.includes(".so")) {
        dirs.add(dir);
      }
    }
  };
  walk(libRoot);
  return dirs.size ? [...dirs].join(":") : undefined;
}

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: findChromiumExecutable(),
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [findChromeLibPath(), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":")
      }
    }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --port 5174 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
