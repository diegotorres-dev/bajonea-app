import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SesionApi } from './backend';

export const CLAVE_COMERCIO_ACTIVO = 'bajonea_comercio_activo';
export const CLAVE_ULTIMO_PREFIJO = 'bajonea_ultimo_comercio_';

export interface OpcionesApertura {
  ultimoComercioId?: number;
  comercioActivoId?: number;
}

export async function abrirComoUsuarioConComercio(page: Page, sesion: SesionApi, opciones: OpcionesApertura = {}) {
  await page.addInitScript(
    ([token, usuarioJson, ultimoId, activoId, claveActivo, prefijoUltimo, usuarioId]) => {
      if (localStorage.getItem('bajonea_token')) {
        return;
      }
      localStorage.setItem('bajonea_token', token as string);
      localStorage.setItem('bajonea_usuario', usuarioJson as string);
      if (ultimoId !== null) {
        localStorage.setItem(`${prefijoUltimo}${usuarioId}`, String(ultimoId));
      }
      if (activoId !== null) {
        sessionStorage.setItem(claveActivo as string, JSON.stringify({ usuarioId, comercioId: activoId }));
      }
    },
    [
      sesion.token,
      JSON.stringify(sesion.usuario),
      opciones.ultimoComercioId ?? null,
      opciones.comercioActivoId ?? null,
      CLAVE_COMERCIO_ACTIVO,
      CLAVE_ULTIMO_PREFIJO,
      sesion.usuario.id,
    ],
  );
}

export async function abrirPanel(page: Page) {
  await page.getByTestId('franja-comercio').click();
  await expect(page.getByTestId('panel-comercios')).toBeVisible();
}

export async function seleccionarComercioEnPanel(page: Page, comercioId: number) {
  const panel = page.getByTestId('panel-comercios');
  if (!(await panel.isVisible())) {
    await abrirPanel(page);
  }
  await page.getByTestId(`fila-comercio-${comercioId}`).click();
}

export async function comercioActivoEnSesion(page: Page): Promise<{ usuarioId: number; comercioId: number } | null> {
  return page.evaluate((clave) => {
    const raw = sessionStorage.getItem(clave);
    return raw ? JSON.parse(raw) : null;
  }, CLAVE_COMERCIO_ACTIVO);
}

export async function ultimoComercioGuardado(page: Page, usuarioId: number): Promise<number | null> {
  return page.evaluate(
    ([prefijo, id]) => {
      const raw = localStorage.getItem(`${prefijo}${id}`);
      return raw === null ? null : Number(raw);
    },
    [CLAVE_ULTIMO_PREFIJO, usuarioId] as const,
  );
}

export async function mantenerApretado(page: Page, testid: string, milisegundos: number, pointerType: 'touch' | 'mouse' = 'touch') {
  await page.getByTestId(testid).evaluate(
    async (elemento, [tipo, espera]) => {
      const caja = elemento.getBoundingClientRect();
      const x = caja.left + caja.width / 2;
      const y = caja.top + caja.height / 2;
      const base = { bubbles: true, cancelable: true, pointerType: tipo, pointerId: 7, isPrimary: true, clientX: x, clientY: y };
      elemento.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
      await new Promise((resolver) => setTimeout(resolver, espera as number));
      elemento.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
      elemento.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    },
    [pointerType, milisegundos] as const,
  );
}
