import { test, expect } from '@playwright/test';
import { fijarPasswordAdminYLoguear, sufijoUnico, ADMIN_EMAIL, ADMIN_PASSWORD_CONOCIDA } from './helpers/backend';

async function loginAdminUi(page: import('@playwright/test').Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(ADMIN_EMAIL);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

// admin@bajonea.ar es una cuenta compartida entre specs -- fijarPasswordAdminYLoguear (mismo
// mecanismo que ya usan los specs 03/09) la deja en una contraseña conocida vía el flujo real
// de recuperación. Este archivo corre con --workers=1 (ver README.md) para evitar una carrera
// real sobre esa cuenta si se ejecuta junto con el spec 08, que también la usa.

test.describe('CRUD de Categoría y Tag (Administrador)', () => {
  test.beforeAll(async ({ request }) => {
    await fijarPasswordAdminYLoguear(request);
  });

  test('CRUD completo de categoría: crear, editar, dar de baja y reactivar', async ({ page }) => {
    const suf = sufijoUnico();
    const nombre = `Categoría CRUD E2E ${suf}`;
    const nombreEditado = `Categoría CRUD E2E ${suf} Editada`;

    await loginAdminUi(page);
    await page.goto('/admin-categorias.html');

    const crearResponse = page.waitForResponse(
      (res) => res.url().endsWith('/categorias') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-crear-categoria').click();
    await expect(page.getByTestId('modal-categoria')).toBeVisible();
    await page.getByTestId('input-nombre-categoria').fill(nombre);
    await page.getByTestId('btn-guardar-categoria').click();
    const creada = await crearResponse;
    expect(creada.status()).toBe(201);
    const categoriaId = (await creada.json()).data.id as number;

    await expect(page.getByTestId('modal-categoria')).toHaveCount(0);
    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toBeVisible();
    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toContainText(nombre);

    const editarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/categorias/${categoriaId}`) && res.request().method() === 'PUT',
    );
    await page.getByTestId(`btn-editar-categoria-${categoriaId}`).click();
    await expect(page.getByTestId('modal-categoria')).toBeVisible();
    await expect(page.getByTestId('input-nombre-categoria')).toHaveValue(nombre);
    await page.getByTestId('input-nombre-categoria').fill(nombreEditado);
    await page.getByTestId('btn-guardar-categoria').click();
    const editada = await editarResponse;
    expect(editada.status()).toBe(200);

    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toContainText(nombreEditado);

    const bajaResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/categorias/${categoriaId}`) && res.request().method() === 'DELETE',
    );
    await page.getByTestId(`btn-editar-categoria-${categoriaId}`).click();
    await page.getByTestId('btn-switch-categoria-activa').click();
    await page.getByTestId('btn-guardar-categoria').click();
    const baja = await bajaResponse;
    expect(baja.status()).toBe(200);

    await page.getByTestId('chip-filtro-categoria-inactivas').click();
    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toBeVisible();
    await page.getByTestId('chip-filtro-categoria-activas').click();
    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toHaveCount(0);

    const reactivarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/categorias/${categoriaId}/reactivar`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('chip-filtro-categoria-todas').click();
    await page.getByTestId(`btn-editar-categoria-${categoriaId}`).click();
    await page.getByTestId('btn-switch-categoria-activa').click();
    await page.getByTestId('btn-guardar-categoria').click();
    const reactivada = await reactivarResponse;
    expect(reactivada.status()).toBe(200);

    await page.getByTestId('chip-filtro-categoria-activas').click();
    await expect(page.getByTestId(`categoria-item-${categoriaId}`)).toBeVisible();
  });

  test('crear una categoría con un nombre ya existente muestra el error de duplicado', async ({ page }) => {
    const suf = sufijoUnico();
    const nombre = `Categoría Duplicada E2E ${suf}`;

    await loginAdminUi(page);
    await page.goto('/admin-categorias.html');

    const crearResponse = page.waitForResponse(
      (res) => res.url().endsWith('/categorias') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-crear-categoria').click();
    await page.getByTestId('input-nombre-categoria').fill(nombre);
    await page.getByTestId('btn-guardar-categoria').click();
    await crearResponse;
    await expect(page.getByTestId('modal-categoria')).toHaveCount(0);

    const duplicadoResponse = page.waitForResponse(
      (res) => res.url().endsWith('/categorias') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-crear-categoria').click();
    await page.getByTestId('input-nombre-categoria').fill(nombre);
    await page.getByTestId('btn-guardar-categoria').click();
    const duplicada = await duplicadoResponse;
    expect(duplicada.status()).toBe(409);

    await expect(page.getByTestId('mensaje-error-nombre-categoria')).toBeVisible();
  });

  test('CRUD completo de tag: crear, editar, dar de baja y reactivar', async ({ page }) => {
    const suf = sufijoUnico();
    const nombre = `Tag CRUD E2E ${suf}`;
    const nombreEditado = `Tag CRUD E2E ${suf} Editado`;

    await loginAdminUi(page);
    await page.goto('/admin-tags.html');

    const crearResponse = page.waitForResponse((res) => res.url().endsWith('/tags') && res.request().method() === 'POST');
    await page.getByTestId('btn-crear-tag').click();
    await expect(page.getByTestId('modal-tag')).toBeVisible();
    await page.getByTestId('input-nombre-tag').fill(nombre);
    await page.getByTestId('btn-guardar-tag').click();
    const creado = await crearResponse;
    expect(creado.status()).toBe(201);
    const tagId = (await creado.json()).data.id as number;

    await expect(page.getByTestId('modal-tag')).toHaveCount(0);
    await expect(page.getByTestId(`tag-item-${tagId}`)).toBeVisible();
    await expect(page.getByTestId(`tag-item-${tagId}`)).toContainText(nombre);

    const editarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/tags/${tagId}`) && res.request().method() === 'PUT',
    );
    await page.getByTestId(`btn-editar-tag-${tagId}`).click();
    await expect(page.getByTestId('modal-tag')).toBeVisible();
    await expect(page.getByTestId('input-nombre-tag')).toHaveValue(nombre);
    await page.getByTestId('input-nombre-tag').fill(nombreEditado);
    await page.getByTestId('btn-guardar-tag').click();
    const editado = await editarResponse;
    expect(editado.status()).toBe(200);

    await expect(page.getByTestId(`tag-item-${tagId}`)).toContainText(nombreEditado);

    const bajaResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/tags/${tagId}`) && res.request().method() === 'DELETE',
    );
    await page.getByTestId(`btn-editar-tag-${tagId}`).click();
    await page.getByTestId('btn-switch-tag-activo').click();
    await page.getByTestId('btn-guardar-tag').click();
    const baja = await bajaResponse;
    expect(baja.status()).toBe(200);

    await page.getByTestId('chip-filtro-tag-inactivos').click();
    await expect(page.getByTestId(`tag-item-${tagId}`)).toBeVisible();
    await page.getByTestId('chip-filtro-tag-activos').click();
    await expect(page.getByTestId(`tag-item-${tagId}`)).toHaveCount(0);

    const reactivarResponse = page.waitForResponse(
      (res) => res.url().endsWith(`/tags/${tagId}/reactivar`) && res.request().method() === 'PUT',
    );
    await page.getByTestId('chip-filtro-tag-todos').click();
    await page.getByTestId(`btn-editar-tag-${tagId}`).click();
    await page.getByTestId('btn-switch-tag-activo').click();
    await page.getByTestId('btn-guardar-tag').click();
    const reactivado = await reactivarResponse;
    expect(reactivado.status()).toBe(200);

    await page.getByTestId('chip-filtro-tag-activos').click();
    await expect(page.getByTestId(`tag-item-${tagId}`)).toBeVisible();
  });

  test('crear un tag con un nombre ya existente muestra el error de duplicado', async ({ page }) => {
    const suf = sufijoUnico();
    const nombre = `Tag Duplicado E2E ${suf}`;

    await loginAdminUi(page);
    await page.goto('/admin-tags.html');

    const crearResponse = page.waitForResponse((res) => res.url().endsWith('/tags') && res.request().method() === 'POST');
    await page.getByTestId('btn-crear-tag').click();
    await page.getByTestId('input-nombre-tag').fill(nombre);
    await page.getByTestId('btn-guardar-tag').click();
    await crearResponse;
    await expect(page.getByTestId('modal-tag')).toHaveCount(0);

    const duplicadoResponse = page.waitForResponse((res) => res.url().endsWith('/tags') && res.request().method() === 'POST');
    await page.getByTestId('btn-crear-tag').click();
    await page.getByTestId('input-nombre-tag').fill(nombre);
    await page.getByTestId('btn-guardar-tag').click();
    const duplicado = await duplicadoResponse;
    expect(duplicado.status()).toBe(409);

    await expect(page.getByTestId('mensaje-error-nombre-tag')).toBeVisible();
  });
});
