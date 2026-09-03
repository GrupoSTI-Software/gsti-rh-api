#!/usr/bin/env bash
# Respaldo de system_modules ANTES de ejecutar la migración B
# (1788282413066000_add_system_module_group_and_order_to_system_modules)
#
# Ejecutar en el servidor con acceso a la BD de producción/staging ANTES
# de correr `node ace migration:run`.
#
# Uso:
#   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_DATABASE=... bash backup_system_modules_before_1788282413066.sh
#
# Variables de entorno requeridas (o se usan los valores de .env):
#   DB_HOST       (default: 127.0.0.1)
#   DB_PORT       (default: 3306)
#   DB_USER       (default: root)
#   DB_PASSWORD
#   DB_DATABASE

set -euo pipefail

HOST="${DB_HOST:-127.0.0.1}"
PORT="${DB_PORT:-3306}"
USER="${DB_USER:-root}"
PASS="${DB_PASSWORD:?Se requiere DB_PASSWORD}"
DB="${DB_DATABASE:?Se requiere DB_DATABASE}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTFILE="system_modules_backup_before_migration_B_${TIMESTAMP}.sql"

echo "==> Respaldando system_modules en: ${OUTFILE}"

mysqldump \
  --host="${HOST}" \
  --port="${PORT}" \
  --user="${USER}" \
  --password="${PASS}" \
  --single-transaction \
  --no-create-info \
  --complete-insert \
  --skip-triggers \
  "${DB}" system_modules > "${OUTFILE}"

ROWS=$(grep -c "^INSERT" "${OUTFILE}" || true)
echo "==> Respaldo completado. Filas aproximadas: ${ROWS}. Archivo: ${OUTFILE}"
echo ""
echo "Para restaurar en caso de rollback:"
echo "  mysql -h ${HOST} -P ${PORT} -u ${USER} -p${PASS} ${DB} < ${OUTFILE}"
