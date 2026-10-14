import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function sinScrollHorizontal(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}
