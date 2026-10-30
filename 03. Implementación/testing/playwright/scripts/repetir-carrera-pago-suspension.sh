#!/bin/bash
SALIDA="${1:-/tmp/carrera}"
mkdir -p "$SALIDA"
cd "$(dirname "$0")/../../../backend" || exit 1
CLASE=SuspensionClientePagoIntegrationTest
for i in 1 2 3 4 5; do
  ./mvnw test -Dtest=$CLASE > "$SALIDA/sola-$i.log" 2>&1
  echo "sola $i exit=$?" >> "$SALIDA/resumen.log"
  grep -E "Tests run:.*in com|FAIL" "$SALIDA/sola-$i.log" | tail -2 >> "$SALIDA/resumen.log"
done
for ronda in 1 2 3; do
  ./mvnw test -Dtest=$CLASE > "$SALIDA/par-$ronda-a.log" 2>&1 &
  ./mvnw test -Dtest=$CLASE > "$SALIDA/par-$ronda-c.log" 2>&1 &
  ./mvnw test -Dtest='SuspensionClienteConcurrenciaIntegrationTest,SuspensionComercioConcurrenciaIntegrationTest,PedidoServiceCarreraTest' > "$SALIDA/par-$ronda-b.log" 2>&1 &
  wait
  for x in a b c; do
    echo "par $ronda-$x:" >> "$SALIDA/resumen.log"
    grep -E "Tests run:.*(in com|Fail)|ERROR\]   |BUILD" "$SALIDA/par-$ronda-$x.log" | tail -4 >> "$SALIDA/resumen.log"
  done
done
echo FIN >> "$SALIDA/resumen.log"
