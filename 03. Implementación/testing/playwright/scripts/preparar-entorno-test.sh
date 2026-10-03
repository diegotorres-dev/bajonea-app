#!/bin/bash
# Deja el entorno de test listo para correr Newman y/o Playwright desde cero:
#   1. detiene el backend que escuche en el 8080 (el de test de esta misma máquina),
#   2. resetea bajonea_test (npm run test:reset: schema, seed geográfico, Flyway, admin y tarifa),
#   3. levanta el backend en perfil test (log en $TEMP/backend-test.log),
#   4. fija la contraseña de admin@bajonea.ar en PostmanAdmin123 por el flujo real de recuperación
#      (precondición de Newman; los specs de Playwright la resuelven solos).
# Uso: bash testing/playwright/scripts/preparar-entorno-test.sh
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_RESET="${TEMP:-/tmp}/reset.log"
LOG_BACKEND="${TEMP:-/tmp}/backend-test.log"

PID=$(netstat -ano | grep ":8080 .*LISTENING" | awk '{print $5}' | head -1)
if [ -n "$PID" ]; then
  taskkill //PID "$PID" //T //F >/dev/null 2>&1
  sleep 3
fi

cd "$RAIZ/testing/playwright" || exit 1
timeout 400 node scripts/reset-db.mjs > "$LOG_RESET" 2>&1 || { echo "RESET FALLO"; tail -20 "$LOG_RESET"; exit 1; }

cd "$RAIZ/backend" || exit 1
(nohup ./mvnw spring-boot:run -Dspring-boot.run.profiles=test > "$LOG_BACKEND" 2>&1 &)
for i in $(seq 1 80); do
  c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/health)
  [ "$c" = "200" ] && break
  sleep 3
done
[ "$c" = "200" ] || { echo "BACKEND NO LEVANTO"; tail -30 "$LOG_BACKEND"; exit 1; }

B=http://localhost:8080/api/v1
curl -s -X POST $B/auth/recuperar-password -H 'Content-Type: application/json' -d '{"email":"admin@bajonea.ar"}' >/dev/null
T=$(curl -s "$B/test/token?email=admin@bajonea.ar&tipo=RECUPERACION_PASSWORD" | python -c "import sys,json;print(json.load(sys.stdin)['data'])")
curl -s -X POST $B/auth/recuperar-password/confirmar -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@bajonea.ar\",\"codigo\":\"$T\",\"nuevaPassword\":\"PostmanAdmin123\"}"
echo
echo ENTORNO_OK
