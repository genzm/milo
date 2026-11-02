import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

export async function launchTestBrowser(t) {
  const defaultPath = chromium.executablePath();
  const executablePath = [
    defaultPath,
    defaultPath.replace('chrome-mac-x64', 'chrome-mac-arm64'),
  ].find((path) => existsSync(path));
  if (!executablePath) {
    t.skip('Chromium is not installed');
    return null;
  }
  const browser = await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
  t.after(() => browser.close());
  return browser;
}
