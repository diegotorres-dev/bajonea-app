import { getToken } from './api.js';

const volver = document.querySelector('[data-testid="legal-volver"]');

if (volver) {
  volver.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = getToken() ? 'index.html' : 'login.html';
  });
}
