import { devices } from '@playwright/test';
import base from './playwright.config';

export default {
  ...base,
  projects: [
    {
      name: 'webkit',
      grepInvert: /@escritorio/,
      use: { ...devices['iPhone 13'] },
    },
  ],
};
