#!/bin/bash
# Deja el entorno de test listo para correr Newman, Playwright y los estreses desde cero.
# Delega en scripts/entorno-test.mjs, que solo detiene procesos que él mismo levantó (guarda sus PID en
# $TEMP/bajonea-entorno-test.json) y nunca toca lo que escuche en un puerto por su cuenta:
#   1. detiene el entorno propio de una corrida anterior,
#   2. resetea bajonea_test (schema, seed geográfico, Flyway, admin y tarifa),
#   3. levanta el backend en perfil test (log en $TEMP/backend-test.log) y el frontend estático,
#   4. fija la contraseña de admin@bajonea.ar a la de la variable ADMIN_PASSWORD por el flujo real de recuperación.
# Variables: ADMIN_PASSWORD (obligatoria, o admin_password del environment de Postman), PUERTO_BACKEND (8080),
# PUERTO_FRONT (5501), BACKEND_LOG. Con un backend que no es el 8080 el frontend se sirve desde una copia temporal
# con el puerto cambiado en js/api.js.
# Uso: bash testing/playwright/scripts/preparar-entorno-test.sh
# Para parar: node testing/playwright/scripts/entorno-test.mjs detener
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$RAIZ/testing/playwright" || exit 1
exec node scripts/entorno-test.mjs preparar
