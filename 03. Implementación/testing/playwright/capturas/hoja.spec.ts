import { test } from '@playwright/test';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DIR = process.env.DIR_CAPTURAS || path.resolve(__dirname, '../../../docs/capturas-escritorio-e4');
const SALIDA = process.env.DIR_HOJAS || path.join(process.env.TEMP || '.', 'hojas-e4');
const PREFIJO = process.env.PREFIJO || 'antes-';
const ANCHO = Number(process.env.ANCHO || 1440);
const COLUMNAS = Number(process.env.COLUMNAS || 3);
const POR_HOJA = Number(process.env.POR_HOJA || 6);
const FILTRO = process.env.FILTRO || '';

test('hojas de contacto', async ({ browser }) => {
  mkdirSync(SALIDA, { recursive: true });
  const archivos = readdirSync(DIR)
    .filter((f) => f.startsWith(PREFIJO) && f.endsWith(`-${ANCHO}.png`) && f.includes(FILTRO))
    .sort();
  const ancho = Math.floor(1800 / COLUMNAS) - 12;
  const contexto = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  const page = await contexto.newPage();
  for (let i = 0; i < archivos.length; i += POR_HOJA) {
    const grupo = archivos.slice(i, i + POR_HOJA);
    const html = `<body style="margin:0;background:#888;font:12px sans-serif"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px">${grupo
      .map((f) => `<div style="width:${ancho}px"><div style="background:#000;color:#fff;padding:2px 4px">${f.replace(PREFIJO, '')}</div><img style="width:${ancho}px;display:block;max-height:${Math.floor(ancho * 0.9 * (ANCHO > 1000 ? 1 : 1.4))}px;object-fit:cover;object-position:top" src="file:///${path.join(DIR, f).replace(/\\/g, '/')}"></div>`)
      .join('')}</div></body>`;
    const tmp = path.join(SALIDA, `_tmp.html`);
    writeFileSync(tmp, html);
    await page.goto('file:///' + tmp.replace(/\\/g, '/'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SALIDA, `hoja-${FILTRO || 'todo'}-${ANCHO}-${String(i / POR_HOJA + 1).padStart(2, '0')}.png`), fullPage: true });
  }
  await contexto.close();
});
