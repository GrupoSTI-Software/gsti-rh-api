/**
 * Criterio único de "adeudo por aumento vivo" (USRH1788052455652, regla 2).
 *
 * Un cliente tiene adeudo por aumento cuando pidió más asientos y ese cambio
 * sigue pendiente de pago: `type = 'increase'`, `status = 'pending_payment'` y
 * sin borrado lógico. Ningún otro estado cuenta — `scheduled` es una reducción
 * agendada, y `applied`, `canceled` y `not_applicable` son desenlaces.
 *
 * El criterio vive aquí porque el servicio de cartera lo reproduce en tres
 * consultas (el `EXISTS` del universo de filas, el escalar por fila y el
 * agregado del resumen) y desincronizarlas subreportaría dinero en silencio.
 *
 * ## Los dos lectores que NO consumen este helper
 *
 * Hay dos lecturas del mismo criterio anteriores a esta historia, y las dos se
 * dejaron intactas a propósito: están en el camino del cobro y moverlas dentro
 * de una HU de tablero no es un riesgo aceptable. Deuda declarada.
 *
 * 1. `BillingSubscriptionService.findPendingIncreaseChange` — alimenta
 *    `pendingIncreaseChange` del detalle de suscripción en la consola. Toma **el
 *    más reciente** (`orderBy id desc` + `.first()`).
 * 2. `BillingTenantService.findLiveSubscriptionChange` + `toLiveChangeSnapshot`
 *    — arma `proration` para el tenant, y solo cuando
 *    `type === 'increase' && amountCents > 0`.
 *
 * **Divergencia declarada frente al primero:** el agregado de cartera **suma
 * todos** los aumentos pendientes de una suscripción (regla 3), no toma el más
 * reciente. Si el dominio garantiza a lo más uno vivo por suscripción, los dos
 * coinciden; si no lo garantiza, subreportar el adeudo sería peor que la
 * divergencia.
 *
 * ## Por qué literales y no bindings
 *
 * Los tres valores son constantes de dominio: no llegan nunca de una petición.
 * Interpolarlos deja el fragmento composable sin arrastrar un arreglo de
 * bindings cuyo orden habría que mantener sincronizado en tres llamadas. El
 * único valor variable es el alias, y por eso lleva guard.
 */

/** Tabla de los cambios de suscripción. */
export const PENDING_INCREASE_CHANGES_TABLE = 'billing_subscription_changes'

/** Columna del importe prorrateado del aumento. **Ya está en centavos enteros.** */
export const PENDING_INCREASE_AMOUNT_COLUMN =
  'billing_subscription_change_prorated_amount_cents'

/** Alias de tabla válido: identificador SQL sin comillas. */
const SQL_TABLE_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Valida el alias antes de interpolarlo. El alias siempre es una constante del
 * llamador, pero se verifica igual: es la única parte variable del fragmento y
 * un descuido futuro se convertiría en concatenación de SQL.
 *
 * @param alias - Alias con el que la consulta nombra a la tabla de cambios.
 * @throws Error si el alias no es un identificador SQL simple.
 */
function assertSqlAlias(alias: string): void {
  if (!SQL_TABLE_ALIAS.test(alias)) {
    throw new Error(
      `Alias de tabla inválido para el filtro de aumentos pendientes: ${JSON.stringify(alias)}`
    )
  }
}

/**
 * Condición de "aumento pendiente vivo", sin mirar el importe.
 *
 * Es la definición canónica de la regla 2. Se usa para sumar (un cambio de cero
 * centavos suma cero y no estorba) y como base de la variante con importe.
 *
 * @param alias - Alias con el que la consulta nombra a `billing_subscription_changes`.
 * @returns Fragmento SQL listo para un `WHERE`, un `EXISTS` o un escalar.
 */
export function pendingIncreaseChangeConditionSql(alias: string): string {
  assertSqlAlias(alias)

  return [
    `${alias}.billing_subscription_change_type = 'increase'`,
    `${alias}.billing_subscription_change_status = 'pending_payment'`,
    `${alias}.billing_subscription_change_deleted_at IS NULL`,
  ].join(' AND ')
}

/**
 * Condición de "aumento pendiente vivo **con importe**": la de arriba más un
 * prorrateo mayor a cero.
 *
 * Es la que decide si un cliente **tiene** adeudo, y por eso mide el importe:
 * un aumento pedido en periodo de prueba deja el prorrateo en cero, y meter esa
 * fila al detalle publicaría un renglón con cero en las dos columnas de dinero
 * — ni cobranza ni facturación. Mismo umbral que usa `toLiveChangeSnapshot`
 * para decidir si arma `proration`.
 *
 * @param alias - Alias con el que la consulta nombra a `billing_subscription_changes`.
 * @returns Fragmento SQL listo para un `EXISTS` o un `HAVING`.
 */
export function pendingIncreaseDebtConditionSql(alias: string): string {
  return `${pendingIncreaseChangeConditionSql(alias)} AND ${alias}.${PENDING_INCREASE_AMOUNT_COLUMN} > 0`
}
