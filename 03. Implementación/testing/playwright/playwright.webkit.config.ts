import { devices } from '@playwright/test';
import base from './playwright.config';

export default {
  ...base,
  projects: [
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
};
