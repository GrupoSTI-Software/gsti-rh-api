# Adeudo por aumento como segundo número de la deuda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**HU:** USRH1788052455652 · **Capability:** CAP-07-09-10 · **Orden:** 7
**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1788052455652.md`

**Goal:** Publicar el adeudo por aumento de asientos como un segundo número de deuda, separado del vencido, en el endpoint de cartera y en el tablero del landlord, sin que en ningún punto aparezca su suma.

**Architecture:** El endpoint `GET /api/platform/metrics/receivables` gana dos campos de resumen y uno por fila, y amplía su universo de filas de "suscripciones `past_due`" a "`past_due` o con aumento pendiente de pago". El criterio de "aumento pendiente vivo" se escribe una sola vez, en un helper nuevo, y desde ahí lo consumen las tres consultas que lo necesitan (el `EXISTS` del universo, el escalar por fila y el agregado del resumen). En el landlord no se crea ningún archivo: se extienden la interface, el repositorio, los helpers de fila y los dos componentes del bloque de cobranza que ya existen.

**Tech Stack:** `gsti-rh-api` (AdonisJS 6 + Lucid + Knex raw + Japa) · `valanserh-landlord` (Nuxt 4 + Vue 3 + PrimeVue + Vitest + `@nuxt/test-utils`)

**Repos y rama:** los dos repos ya están en `feature/USRH1788052455652-adeudo-por-aumento`, que arranca del trabajo de la orden 6. No se crea rama nueva y no se hace merge de nada antes de empezar.

- `gsti-rh-api` → `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`
- `valanserh-landlord` → `/Users/noeabelvargaslopez/Documents/projects/valanserh-landlord`

---

## Global Constraints

- TypeScript estricto en los dos repos. **Cero `any`**, cero `@ts-ignore`, cero `as unknown as`.
- Código y nombres en inglés; JSDoc y comentarios en español. Los nombres de campo del **contrato del API van en español** (`adeudoPorAumentoCents`), como el resto del endpoint.
- Nombres de archivo: `snake_case` en el API, `kebab-case` en el landlord.
- **Ninguna respuesta del API serializa un modelo Lucid.** Prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`. Cada campo se arma a mano con casteo explícito sobre un `select` que nombra columnas.
- El API no publica `business_unit_id`, `billing_subscription_id`, el id del cambio de suscripción, `rfc`, perfil fiscal ni `billingEmail`.
- Las consultas crudas **no** pasan por el hook de `SoftDeletes`: cada `deleted_at` se filtra a mano sobre **cada** tabla que toca la consulta.
- `billing_subscription_change_prorated_amount_cents` **ya está en centavos**. No se multiplica por 100. (`billing_subscription_contracted_total` sí está en pesos y sí se convierte — ya lo hace `CONTRACTED_TOTAL_CENTS_SQL`.)
- **No existe ni existirá un campo, celda, pie de tabla, tooltip o etiqueta que sea la suma del vencido y el adeudo por aumento.** Es regla de producto (regla 1) y criterio de aceptación negativo.
- Un cliente al corriente con adeudo por aumento **nunca** recibe marcas de morosidad: sin días de atraso, sin tramo de antigüedad, sin acento de alerta.
- Esta rebanada **no migra**, no agrega columnas y **no escribe** en `billing_subscription_changes`. Solo lectura.
- Landlord: i18n **solo español**, sin literales en el template. Tokens del design system, **ningún color literal** (stylelint lo bloquea).
- Landlord: todo `*.helpers.ts`, `*.repository.ts` y `use-*.ts` necesita su `.spec.ts` colocado o `check:conventions` sale con exit 1.
- **No refactorizar** `BillingSubscriptionService.findPendingIncreaseChange` ni `BillingTenantService.findLiveSubscriptionChange` para que consuman el helper nuevo. Tocan el camino del cobro; es deuda declarada, no trabajo de esta HU.
- No se agrega ruta: `start/routes.ts` y `start/routes/platform_receivable_routes.ts` **no se tocan**.

---

## Drift verificado contra el spec

Se validaron los anclajes del spec contra el código de las dos ramas. Tres cosas no coinciden y el plan sigue el código, no el spec:

1. **La tarjeta del total vencido no vive en la franja ejecutiva.** La orden 6 la movió a la pestaña "Cobranza" de la zona operativa (`app/pages/dashboard/index.vue:118-161`), y dejó un test que lo **exige**: `index.spec.ts:845` asserta que `.dashboard__executive .dashboard__kpi--receivables` no existe. La segunda tarjeta va **junto a la primera, en la pestaña de Cobranza**, no en la franja. CA-6 se cumple igual: dos tarjetas separadas, en celdas distintas del grid, con etiquetas que separan cobranza de facturación.

2. **El `hint` del vencido ya dice lo que el spec pide agregar.** `dashboard.es.json` trae `"db_receivables_hint": "con IVA · cobranza"`. El spec pide "cobranza · con IVA". Es el mismo hecho en otro orden: **no se toca**, para no romper `index.spec.ts:225` sin ninguna ganancia.

3. **`meta.total` tiene que cambiar de significado, y el spec no lo dice.** Hoy `meta.total = resumen.tenantsVencidos` (`platform_receivable_service.ts:181`) y hay un test que lo asserta (`platform_receivables_metrics.spec.ts:420`). Si el universo de filas crece pero `meta.total` sigue contando solo `past_due`, la paginación miente: `lastPage` sale corto y las filas que entran solo por adeudo se pierden fuera de la última página. CA-3 y CA-4 son incompatibles con dejarlo igual.
   **Decisión:** `meta.total` pasa a contar el universo de filas (`past_due` OR con aumento pendiente); `resumen.tenantsVencidos` y los tres tramos **siguen contando solo `past_due`**, como manda CA-3. Es la única lectura coherente de los dos criterios. **Escalar a Wilvardo en el PR** como cambio de semántica del contrato, aditivo para quien lee importes y no aditivo para quien cuenta filas — igual que el spec ya declara para `tenants[]`.

Además, dos decisiones que el spec deja abiertas y este plan cierra:

4. **`canceled` queda fuera del universo ampliado.** El spec lo dice en la sección de seguridad ("los cancelados con adeudo son materia de la orden 6"). Un `OR EXISTS` sin más metería a las canceladas con aumento pendiente en `tenants[]`, donde ya no van. El universo lleva `status != 'canceled'` explícito.

5. **El agregado se agrupa por `billing_subscription_id`, no por `business_unit_id`.** El spec sugiere agrupar por empresa. Agrupar por suscripción es más preciso y hace que CA-5 se cumpla solo: un aumento pendiente que cuelga de una suscripción **cancelada** o **borrada** de la misma empresa no se le atribuye a la suscripción viva. El candado `billing_subscription_live_business_unit_id` (UNIQUE) garantiza a lo más una suscripción viva por empresa, así que "por suscripción" y "por empresa" coinciden en el universo publicado.

---

## File Structure

### `gsti-rh-api`

| Archivo | Responsabilidad |
|---|---|
| **CREAR** `app/helpers/billing_pending_increase_change_filter.ts` | Definición **única** del criterio "aumento pendiente vivo", como fragmentos de SQL parametrizados por alias. Nadie más escribe la condición. |
| **CREAR** `tests/unit/helpers/billing_pending_increase_change_filter.spec.ts` | Test del helper: los tres filtros, la variante con importe, y el guard de alias. |
| **EDITAR** `app/services/platform_receivable_service.ts` | Interfaces de retorno, universo ampliado de filas, orden, agregado del resumen, escalar por fila, `meta.total`. |
| **EDITAR** `app/controllers/platform_receivable_controller.ts` | `@swagger` y `@responseBody` con los campos nuevos y la nota del cambio de universo. |
| **EDITAR** `tests/functional/platform_receivables_metrics.spec.ts` | CA-1 a CA-5 del adeudo + arreglo de las dos aserciones que el cambio de universo invalida. |

### `valanserh-landlord`

| Archivo | Responsabilidad |
|---|---|
| **EDITAR** `app/pages/dashboard/domain/receivables.interface.ts` | Tipos raw del contrato + tipos de dominio + tipo de renglón. Sin lógica. |
| **EDITAR** `app/pages/dashboard/infrastructure/receivables.repository.ts` (+ `.spec.ts`) | Mapeo de los tres campos nuevos raw → dominio. |
| **EDITAR** `app/pages/dashboard/domain/receivables.helpers.ts` (+ `.spec.ts`) | Formateo del adeudo en el renglón de la tabla. |
| **EDITAR** `app/pages/dashboard/application/use-receivables.spec.ts` | Solo el test y la fábrica del mock: el composable no cambia. |
| **EDITAR** `app/components/dashboardReceivables/{index.vue,index.spec.ts,style.scss}` | Columna nueva + leyenda que separa cobranza de facturación. |
| **EDITAR** `app/components/dashboardReceivables/domain/locales/dashboard-receivables.es.json` | Textos de la columna y la leyenda. |
| **EDITAR** `app/pages/dashboard/{index.vue,script.ts,index.spec.ts}` | Segunda `<MetricCard>`, su total formateado, su estado de error, y el contador de la pestaña. |
| **EDITAR** `app/pages/dashboard/domain/locales/dashboard.es.json` | Etiqueta y `hint` de la tarjeta nueva. |

**Sin archivos nuevos en el landlord.** Sin migraciones. Sin componentes nuevos.

### QA (no versionado, Task 8)

| Archivo | Responsabilidad |
|---|---|
| **EDITAR** `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Usuario de plataforma de la prueba + los cuatro casos de negocio del recorrido. Es el seeder que ya usan los demás paneles: **no se crea uno nuevo**. |
| **CREAR** `valanserh-landlord/docs/superpowers/plans/2026-09-04-adeudo-por-aumento-segundo-numero-qa-flujo.md` | Manual de prueba manual, para recorrer en el navegador. |

Los dos están fuera de control de versiones: `docs/superpowers/*` está en el `.gitignore` del landlord y el seeder está excluido vía `.git/info/exclude`.

---

## Task 1: API — helper del criterio único de adeudo vivo

**Files:**
- Create: `gsti-rh-api/app/helpers/billing_pending_increase_change_filter.ts`
- Test: `gsti-rh-api/tests/unit/helpers/billing_pending_increase_change_filter.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PENDING_INCREASE_CHANGES_TABLE: string`, `PENDING_INCREASE_AMOUNT_COLUMN: string`, `pendingIncreaseChangeConditionSql(alias: string): string`, `pendingIncreaseDebtConditionSql(alias: string): string`. Las consume solo `platform_receivable_service.ts` (Tasks 2 y 3).

**Por qué fragmentos de SQL y no un query builder:** las tres consultas que necesitan el criterio lo usan de tres formas distintas — dentro de un `EXISTS`, dentro de un escalar del `SELECT`, y como `WHERE` de un `JOIN` — y cada una con su propio alias. Un fragmento parametrizado por alias sirve a las tres; un builder solo serviría a la tercera.

**Por qué literales en línea y no bindings `?`:** los tres valores son constantes de dominio, no entran nunca de una petición. Interpolarlos hace el fragmento composable sin arrastrar un arreglo de bindings cuyo orden hay que mantener sincronizado entre tres llamadas. El único valor variable es el alias, y va con guard.

- [ ] **Step 1: Write the failing test**

Crear `gsti-rh-api/tests/unit/helpers/billing_pending_increase_change_filter.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  PENDING_INCREASE_AMOUNT_COLUMN,
  PENDING_INCREASE_CHANGES_TABLE,
  pendingIncreaseChangeConditionSql,
  pendingIncreaseDebtConditionSql,
} from '../../../app/helpers/billing_pending_increase_change_filter.js'

/**
 * USRH1788052455652 — regla 2: un cliente tiene adeudo por aumento cuando
 * agregó asientos y ese cambio sigue pendiente de pago. El criterio se escribe
 * una sola vez y aquí se fija, porque tres consultas del servicio de cartera lo
 * reproducen y una desincronización subreportaría dinero en silencio.
 */
test.group('billing_pending_increase_change_filter', () => {
  test('exige tipo increase, estado pending_payment y no borrado, con el alias recibido', ({
    assert,
  }) => {
    const sql = pendingIncreaseChangeConditionSql('pic')

    assert.include(sql, "pic.billing_subscription_change_type = 'increase'")
    assert.include(sql, "pic.billing_subscription_change_status = 'pending_payment'")
    assert.include(sql, 'pic.billing_subscription_change_deleted_at IS NULL')
  })

  test('no admite ningún otro estado vivo: scheduled y applied no son adeudo', ({ assert }) => {
    const sql = pendingIncreaseChangeConditionSql('pic')

    assert.notInclude(sql, 'scheduled')
    assert.notInclude(sql, 'applied')
    assert.notInclude(sql, 'not_applicable')
    assert.notInclude(sql, 'decrease')
  })

  test('la variante con importe agrega el mayor a cero sobre la columna de centavos', ({
    assert,
  }) => {
    const base = pendingIncreaseChangeConditionSql('c')
    const conImporte = pendingIncreaseDebtConditionSql('c')

    assert.include(conImporte, base)
    assert.include(conImporte, `c.${PENDING_INCREASE_AMOUNT_COLUMN} > 0`)
  })

  test('un alias que no sea identificador se rechaza en vez de concatenarse', ({ assert }) => {
    assert.throws(() => pendingIncreaseChangeConditionSql('pic; DROP TABLE users'))
    assert.throws(() => pendingIncreaseChangeConditionSql(''))
    assert.throws(() => pendingIncreaseChangeConditionSql('pic pic'))
  })

  test('publica el nombre de la tabla y de la columna del importe', ({ assert }) => {
    assert.equal(PENDING_INCREASE_CHANGES_TABLE, 'billing_subscription_changes')
    assert.equal(
      PENDING_INCREASE_AMOUNT_COLUMN,
      'billing_subscription_change_prorated_amount_cents'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test unit --files=billing_pending_increase_change_filter
```

Expected: FAIL. No se puede resolver `../../../app/helpers/billing_pending_increase_change_filter.js`.

- [ ] **Step 3: Write the implementation**

Crear `gsti-rh-api/app/helpers/billing_pending_increase_change_filter.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test unit --files=billing_pending_increase_change_filter
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck y lint**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/helpers/billing_pending_increase_change_filter.ts tests/unit/helpers/billing_pending_increase_change_filter.spec.ts
git commit -m "feat(billing): add single source of truth for the live pending seat increase criterion"
```

---

## Task 2: API — el adeudo como campo propio del resumen y de la fila

Alcance: CA-1, CA-2, CA-4, CA-5. El universo de filas **todavía no cambia** (eso es Task 3): un cliente al corriente aún no aparece. Lo que este task entrega es el campo por fila para los que ya aparecen, y los dos totales del resumen calculados sobre toda la cartera.

**Files:**
- Modify: `gsti-rh-api/app/services/platform_receivable_service.ts`
- Test: `gsti-rh-api/tests/functional/platform_receivables_metrics.spec.ts`

**Interfaces:**
- Consumes de Task 1: `PENDING_INCREASE_CHANGES_TABLE`, `PENDING_INCREASE_AMOUNT_COLUMN`, `pendingIncreaseChangeConditionSql(alias)`, `pendingIncreaseDebtConditionSql(alias)`.
- Produces: `ReceivablesSummary` gana `totalAdeudoPorAumentoCents: number` y `tenantsConAdeudoPorAumento: number`. `ReceivableTenantItem` gana `adeudoPorAumentoCents: number`. Los consume el controlador (Task 4) y, vía HTTP, el landlord (Task 5).

- [ ] **Step 1: Extender los fixtures del test funcional**

En `tests/functional/platform_receivables_metrics.spec.ts`:

Agregar el import del modelo de cambios, junto a los demás imports de modelos:

```ts
import BillingSubscriptionChange, {
  type BillingSubscriptionChangeStatus,
  type BillingSubscriptionChangeType,
} from '#models/billing_subscription_change'
```

Agregar `'adeudoPorAumentoCents'` a `EXPECTED_TENANT_KEYS` (la lista está ordenada alfabéticamente, va primero):

```ts
const EXPECTED_TENANT_KEYS = [
  'adeudoPorAumentoCents',
  'bucket',
  'businessUnitActive',
  'businessUnitName',
  'businessUnitPublicId',
  'diasAtraso',
  'montoVencidoCents',
  'periodoFin',
  'planName',
  'saldoAFavorCents',
]
```

Extender las interfaces del body — `SummaryBody` con los dos totales, y `TenantBody` con el campo nuevo y los dos campos que se vuelven nulables:

```ts
interface SummaryBody {
  totalVencidoCents: number
  tenantsVencidos: number
  saldoAFavorCents: number
  porBucket: Record<'hasta30' | 'de31a60' | 'mas60', { tenants: number; montoCents: number }>
  calculadoAl: string
  totalAdeudoPorAumentoCents: number
  tenantsConAdeudoPorAumento: number
}

interface TenantBody {
  businessUnitPublicId: string
  businessUnitName: string
  businessUnitActive: number
  planName: string | null
  montoVencidoCents: number
  diasAtraso: number | null
  bucket: string | null
  periodoFin: string
  saldoAFavorCents: number
  adeudoPorAumentoCents: number
}
```

Hacer que `createOverdue` devuelva también el id de la suscripción — su firma de retorno pasa a `Promise<{ publicId: string; buId: number; subId: number }>` y el `return` final queda:

```ts
  return {
    publicId: businessUnit.businessUnitPublicId,
    buId: businessUnit.businessUnitId,
    subId: subscription.billingSubscriptionId,
  }
```

Agregar la fábrica de aumentos pendientes, justo después de `createOverdue`:

```ts
/**
 * Registra un cambio de suscripción para los casos del adeudo por aumento.
 * Los importes del periodo son ruido para esta prueba: lo único que se mide es
 * `proratedAmountCents`, que es el campo que el agregado suma.
 */
async function createSubscriptionChange(params: {
  businessUnitId: number
  billingSubscriptionId: number
  proratedAmountCents: number
  status?: BillingSubscriptionChangeStatus
  type?: BillingSubscriptionChangeType
  deleted?: boolean
}): Promise<void> {
  const change = await BillingSubscriptionChange.create({
    billingSubscriptionId: params.billingSubscriptionId,
    businessUnitId: params.businessUnitId,
    billingSubscriptionChangeType: params.type ?? 'increase',
    billingSubscriptionChangeStatus: params.status ?? 'pending_payment',
    billingSubscriptionChangePreviousEmployees: 10,
    billingSubscriptionChangeNewEmployees: 15,
    billingSubscriptionChangeUnitAmount: 65,
    billingSubscriptionChangeDiscountPercent: 0,
    billingSubscriptionChangeTaxRate: 0.16,
    billingSubscriptionChangeSubtotal: 975,
    billingSubscriptionChangeTaxAmount: 156,
    billingSubscriptionChangeTotal: 1131,
    billingSubscriptionChangeProratedAmountCents: params.proratedAmountCents,
    billingSubscriptionChangeEffectiveAt: null,
    billingSubscriptionChangeAppliedAt: null,
    billingSubscriptionChangeBillingPaymentId: null,
    billingSubscriptionChangeNotApplicableReason: null,
  })

  if (params.deleted) {
    await change.delete()
  }
}
```

En `cleanupFixtures`, borrar los cambios **antes** que las suscripciones — la FK de `billing_subscription_changes` apunta a `billing_subscriptions` y un `forceDelete` de la suscripción con cambios colgando falla. Dentro del `for (const businessUnitId of businessUnitIds)`, como primeras líneas del cuerpo:

```ts
    const changes = await BillingSubscriptionChange.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const change of changes) {
      await change.forceDelete()
    }
```

- [ ] **Step 2: Escribir los tests que fallan (CA-1, CA-2, CA-4, CA-5)**

Agregar al final del `test.group`, antes del cierre:

```ts
  test('CA-1 — el adeudo por aumento viaja en su propio campo, aparte del vencido', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 10
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-ca1',
      daysLate: 12,
      contractedTotal: 5800,
    })
    businessUnitIds.push(buId)
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 91210,
    })

    const collected = await collectReceivables(client, admin!.user)
    const filas = findTenants(collected.tenants, publicId)
    assert.lengthOf(filas, 1)
    const fila = filas[0]!

    assert.deepEqual(Object.keys(fila).sort(), EXPECTED_TENANT_KEYS.sort())
    assert.equal(fila.adeudoPorAumentoCents, 91210, 'el prorrateo ya viene en centavos')
    assert.equal(fila.montoVencidoCents, 580000, 'el vencido no absorbe el adeudo')

    // Ningún campo de la fila publica la suma de los dos números (regla 1).
    assert.notInclude(Object.values(fila), 671210)

    const after = collected.resumen
    assert.equal(after.totalAdeudoPorAumentoCents - before.totalAdeudoPorAumentoCents, 91210)
    assert.equal(after.tenantsConAdeudoPorAumento - before.tenantsConAdeudoPorAumento, 1)
    assert.equal(
      after.totalVencidoCents - before.totalVencidoCents,
      580000,
      'el adeudo no mueve el total vencido'
    )
  })

  test('CA-2 — dos aumentos pendientes se suman, no gana el más reciente', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 11
    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-ca2',
      daysLate: 20,
      contractedTotal: 1000,
    })
    businessUnitIds.push(buId)
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 30000,
    })
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 12500,
    })

    const collected = await collectReceivables(client, admin!.user)
    const fila = findTenants(collected.tenants, publicId)[0]!

    assert.equal(fila.adeudoPorAumentoCents, 42500)
  })

  test('CA-4 — los dos totales del adeudo son de plataforma, no de página', async ({
    client,
    assert,
  }) => {
    const primera = (
      await client.get(BASE_URL).qs({ page: 1, limit: 1 }).loginAs(admin!.user)
    ).body()
    const completa = (
      await client.get(BASE_URL).qs({ page: 1, limit: 100 }).loginAs(admin!.user)
    ).body()

    const resumenPrimera = primera.data.resumen as SummaryBody
    const resumenCompleta = completa.data.resumen as SummaryBody

    assert.equal(
      resumenPrimera.totalAdeudoPorAumentoCents,
      resumenCompleta.totalAdeudoPorAumentoCents
    )
    assert.equal(
      resumenPrimera.tenantsConAdeudoPorAumento,
      resumenCompleta.tenantsConAdeudoPorAumento
    )
    assert.isAtLeast(
      resumenPrimera.totalAdeudoPorAumentoCents,
      (primera.data.tenants as TenantBody[])[0]?.adeudoPorAumentoCents ?? 0,
      'el total de plataforma nunca es menor que el de una fila'
    )
  })

  test('CA-5 — el aumento borrado no suma y el estado que no es pendiente tampoco', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 12
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-ca5',
      daysLate: 20,
      contractedTotal: 1000,
    })
    businessUnitIds.push(buId)

    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 11111,
      deleted: true,
    })
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 22222,
      status: 'applied',
    })
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 33333,
      status: 'scheduled',
    })
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 44444,
      type: 'decrease',
    })

    const collected = await collectReceivables(client, admin!.user)
    const fila = findTenants(collected.tenants, publicId)[0]!

    assert.equal(fila.adeudoPorAumentoCents, 0, 'ninguno de los cuatro es adeudo por aumento vivo')
    assert.equal(
      collected.resumen.totalAdeudoPorAumentoCents,
      before.totalAdeudoPorAumentoCents
    )
  })

  test('CA-5 — la empresa desactivada con adeudo sí cuenta y viaja marcada', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 13
    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-inactiva',
      daysLate: 20,
      contractedTotal: 1000,
      businessUnitActive: 0,
    })
    businessUnitIds.push(buId)
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 55555,
    })

    const collected = await collectReceivables(client, admin!.user)
    const fila = findTenants(collected.tenants, publicId)[0]!

    assert.equal(fila.businessUnitActive, 0, 'la desactivación no perdona la deuda (regla 7)')
    assert.equal(fila.adeudoPorAumentoCents, 55555)
  })

  test('CA-5 — un adeudo de suscripción o empresa borrada no suma al total', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 14
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    const subBorrada = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-sub-del',
      daysLate: 20,
      contractedTotal: 1000,
      subscriptionDeleted: true,
    })
    const buBorrada = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-bu-del',
      daysLate: 20,
      contractedTotal: 1000,
      businessUnitDeleted: true,
    })
    businessUnitIds.push(subBorrada.buId, buBorrada.buId)

    await createSubscriptionChange({
      businessUnitId: subBorrada.buId,
      billingSubscriptionId: subBorrada.subId,
      proratedAmountCents: 66666,
    })
    await createSubscriptionChange({
      businessUnitId: buBorrada.buId,
      billingSubscriptionId: buBorrada.subId,
      proratedAmountCents: 77777,
    })

    const collected = await collectReceivables(client, admin!.user)

    assert.equal(
      collected.resumen.totalAdeudoPorAumentoCents,
      before.totalAdeudoPorAumentoCents,
      'los borrados lógicos quedan fuera del agregado'
    )
    assert.lengthOf(findTenants(collected.tenants, subBorrada.publicId), 0)
    assert.lengthOf(findTenants(collected.tenants, buBorrada.publicId), 0)
  })

  test('ningún campo del resumen es la suma del vencido y el adeudo (regla 1)', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const resumen = response.body().data.resumen as SummaryBody
    const suma = resumen.totalVencidoCents + resumen.totalAdeudoPorAumentoCents

    // Solo se descarta cuando los dos números son distintos de cero: si uno es
    // cero la suma coincide con el otro por aritmética, no por publicarla.
    if (resumen.totalVencidoCents > 0 && resumen.totalAdeudoPorAumentoCents > 0) {
      assert.notInclude(Object.values(resumen), suma)
    }
    assert.notProperty(resumen, 'totalDeudaCents')
    assert.notProperty(resumen, 'totalCents')
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_receivables_metrics
```

Expected: FAIL. Los tests nuevos revientan porque `resumen.totalAdeudoPorAumentoCents` es `undefined` y la fila no trae `adeudoPorAumentoCents`; `EXPECTED_TENANT_KEYS` ya no coincide con las llaves reales.

- [ ] **Step 4: Extender las interfaces del servicio**

En `app/services/platform_receivable_service.ts`, agregar el import del helper al inicio del archivo, después del import de `business_date`:

```ts
import {
  PENDING_INCREASE_AMOUNT_COLUMN,
  PENDING_INCREASE_CHANGES_TABLE,
  pendingIncreaseChangeConditionSql,
} from '../helpers/billing_pending_increase_change_filter.js'
```

En `ReceivablesSummary`, agregar los dos campos después de `calculadoAl`:

```ts
  /** Fecha de negocio del cálculo, `YYYY-MM-DD`. */
  calculadoAl: string
  /**
   * Suma del adeudo por aumento de asientos de **toda** la cartera, en centavos
   * (regla 6). Es facturación pendiente, no cobranza: **nunca** se suma a
   * `totalVencidoCents` ni se publica junto con él como una sola cifra (regla 1).
   */
  totalAdeudoPorAumentoCents: number
  /** Cuántas empresas tienen adeudo por aumento mayor a cero. No es un subconjunto de `tenantsVencidos`. */
  tenantsConAdeudoPorAumento: number
```

En `ReceivableTenantItem`, agregar el campo al final de la interface:

```ts
  /**
   * Adeudo por aumento de asientos de la empresa, en centavos: la suma de todos
   * sus aumentos pendientes de pago (regla 3). `0` cuando no tiene ninguno.
   *
   * Es facturación pendiente y viaja aparte de `montoVencidoCents` a propósito:
   * sumarlos convertiría a un cliente que creció en un moroso (regla 1).
   */
  adeudoPorAumentoCents: number
```

- [ ] **Step 5: Agregar las dos expresiones SQL del adeudo**

En el bloque de constantes SQL, después de `BUCKET_CASE_SQL`:

```ts
/**
 * Adeudo por aumento de la suscripción de la fila, en centavos.
 *
 * Va como escalar correlacionado y no como `LEFT JOIN` agrupado porque el
 * universo de filas ya está definido por su propio `WHERE`: un join agregado
 * obligaría a agrupar toda la consulta paginada por suscripción para no
 * multiplicar filas cuando hay más de un aumento pendiente (regla 3).
 *
 * `COALESCE` a `0` porque la ausencia de aumentos es un cero explícito, no un
 * nulo: la columna del tablero no desaparece cuando no hay adeudo (regla 8).
 *
 * No se multiplica por 100: la columna del prorrateo ya está en centavos.
 */
const PENDING_INCREASE_DEBT_CENTS_SQL = `COALESCE((
    SELECT SUM(pic.${PENDING_INCREASE_AMOUNT_COLUMN})
    FROM ${PENDING_INCREASE_CHANGES_TABLE} as pic
    WHERE pic.billing_subscription_id = bs.billing_subscription_id
      AND ${pendingIncreaseChangeConditionSql('pic')}
  ), 0)`
```

- [ ] **Step 6: Calcular los dos totales del resumen**

Agregar el método privado, justo después de `loadSummary`:

```ts
  /**
   * Los dos totales del adeudo por aumento, sobre **toda** la cartera (regla 6).
   *
   * Consulta propia y no un campo más del resumen del vencido: el universo del
   * adeudo no es el del vencido — incluye a las empresas al corriente — y
   * mezclarlos en un solo `GROUP BY bucket` habría metido el adeudo a los tramos
   * de antigüedad, que son propios del vencido (regla 5).
   *
   * Agrupa por suscripción y no por empresa para que un aumento pendiente que
   * cuelga de una suscripción cancelada o borrada no se le atribuya a la
   * suscripción viva de la misma empresa. El candado
   * `billing_subscription_live_business_unit_id` (UNIQUE) garantiza a lo más una
   * suscripción viva por empresa, así que contar suscripciones con adeudo es
   * contar empresas con adeudo.
   *
   * La suma y el conteo se cierran en JavaScript sobre las filas agrupadas —y no
   * con un `HAVING` dentro de una subconsulta— porque los aumentos pendientes de
   * la plataforma son unidades: el arreglo intermedio es minúsculo y la
   * intención queda legible. `canceled` queda fuera: sus adeudos son materia de
   * `canceladas[]`, no de este número.
   *
   * Los tres `whereNull` van a mano porque las queries crudas de Knex no pasan
   * por el hook de `SoftDeletes`. `business_unit_active = 0` NO excluye: la
   * desactivación no perdona la deuda (regla 7).
   *
   * @returns Total en centavos y cuántas empresas tienen adeudo mayor a cero.
   */
  private async loadPendingIncreaseTotals(): Promise<{ totalCents: number; tenants: number }> {
    const rows = (await db
      .from(`${PENDING_INCREASE_CHANGES_TABLE} as pic`)
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'pic.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereRaw(pendingIncreaseChangeConditionSql('pic'))
      .whereNot('bs.billing_subscription_status', 'canceled')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .groupBy('bs.billing_subscription_id')
      .select(
        db.raw(`COALESCE(SUM(pic.${PENDING_INCREASE_AMOUNT_COLUMN}), 0) as adeudoCents`)
      )) as Array<Record<string, unknown>>

    let totalCents = 0
    let tenants = 0

    for (const row of rows) {
      const adeudoCents = Number(row.adeudoCents ?? 0)
      // Un prorrateo de cero (un aumento pedido en prueba) no es adeudo: suma
      // cero y no cuenta como empresa con adeudo. Mismo umbral que el helper.
      if (adeudoCents <= 0) continue
      totalCents += adeudoCents
      tenants += 1
    }

    return { totalCents, tenants }
  }
```

Y cablearlo en `loadSummary`: agregar la lectura antes del `return` y los dos campos al objeto devuelto.

```ts
    const pendingIncrease = await this.loadPendingIncreaseTotals()

    return {
      totalVencidoCents,
      tenantsVencidos,
      saldoAFavorCents,
      porBucket,
      calculadoAl: businessDate,
      totalAdeudoPorAumentoCents: pendingIncrease.totalCents,
      tenantsConAdeudoPorAumento: pendingIncrease.tenants,
    }
```

- [ ] **Step 7: Publicar el campo por fila**

En `loadPage`, agregar el `select` del escalar justo después del `select` de `montoVencidoCents`:

```ts
      .select(db.raw(`${PENDING_INCREASE_DEBT_CENTS_SQL} as adeudoPorAumentoCents`))
```

En `toTenantItem`, agregar el campo al objeto devuelto, después de `saldoAFavorCents`:

```ts
      adeudoPorAumentoCents: Number(row.adeudoPorAumentoCents ?? 0),
```

Y actualizar el JSDoc de la clase `PlatformReceivableService` para que la descripción incluya el segundo número, reemplazando la primera línea:

```ts
/**
 * Cartera de la plataforma: el vencido y el adeudo por aumento de asientos
 * (USRH1788052455651 + USRH1788052455652).
 *
 * Son **dos números independientes** y así viajan: el vencido es cobranza, el
 * adeudo por aumento es facturación pendiente. Ningún campo de este servicio es
 * —ni podrá ser— su suma (regla 1). La antigüedad y los tramos son propios del
 * vencido: el adeudo por aumento no tiene edad (regla 5).
 *
 * Solo lectura: no escribe, no abre transacción y no tiene efectos secundarios.
 * ...
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_receivables_metrics
```

Expected: PASS. Todos los tests del grupo, viejos y nuevos.

Si `CA-3 — el resumen es de la cartera completa, no de la página` falla en `assert.equal(primera.meta.total, ...tenantsVencidos)`, **no lo arregles aquí**: es Task 3, donde el universo cambia. En este task el universo sigue siendo `past_due` y esa aserción tiene que seguir verde.

- [ ] **Step 9: Typecheck y lint**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint
```

- [ ] **Step 10: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/services/platform_receivable_service.ts tests/functional/platform_receivables_metrics.spec.ts
git commit -m "feat(cartera): publish the seat increase debt as its own summary and row field"
```

---

## Task 3: API — ampliar el universo de filas a los clientes al corriente con adeudo

Alcance: CA-3, y el arreglo de las dos aserciones que el cambio de universo invalida.

**Files:**
- Modify: `gsti-rh-api/app/services/platform_receivable_service.ts`
- Test: `gsti-rh-api/tests/functional/platform_receivables_metrics.spec.ts`

**Interfaces:**
- Consumes de Task 1: `pendingIncreaseDebtConditionSql(alias)`, `PENDING_INCREASE_CHANGES_TABLE`.
- Consumes de Task 2: `adeudoPorAumentoCents` ya publicado por fila.
- Produces: `ReceivableTenantItem.diasAtraso` pasa a `number | null` y `.bucket` a `ReceivableBucket | null`. `meta.total` pasa a contar el universo ampliado. Lo consume el landlord (Task 5) — cuya interface **ya los declara nulables**, con una nota que apunta a esta historia.

- [ ] **Step 1: Escribir el test que falla (CA-3)**

Agregar al `test.group` de `tests/functional/platform_receivables_metrics.spec.ts`:

```ts
  test('CA-3 — el cliente al corriente con aumento pendiente entra sin marcas de morosidad', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 20
    const beforeResponse = await client.get(BASE_URL).loginAs(admin!.user)
    const before = beforeResponse.body().data.resumen as SummaryBody

    // `daysLate: -15` deja el fin de periodo 15 días en el futuro: está al
    // corriente, no se le pasó nada.
    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-al-corriente',
      status: 'active',
      daysLate: -15,
      contractedTotal: 5800,
      creditBalanceCents: 25000,
    })
    businessUnitIds.push(buId)
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 91210,
    })

    const collected = await collectReceivables(client, admin!.user)
    const filas = findTenants(collected.tenants, publicId)

    assert.lengthOf(filas, 1, 'el cliente al corriente con asientos sin facturar sí aparece')
    const fila = filas[0]!

    assert.equal(fila.montoVencidoCents, 0, 'no debe nada vencido')
    assert.isNull(fila.diasAtraso, 'la antigüedad es propia del vencido (regla 5)')
    assert.isNull(fila.bucket, 'el adeudo por aumento no cae en ningún tramo (regla 5)')
    assert.equal(fila.adeudoPorAumentoCents, 91210)
    assert.match(fila.periodoFin, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(fila.saldoAFavorCents, 25000)
    assert.deepEqual(Object.keys(fila).sort(), EXPECTED_TENANT_KEYS.sort())

    // No se le clasifica como moroso en ninguna cuenta del resumen (regla 4).
    const after = collected.resumen
    assert.equal(after.tenantsVencidos, before.tenantsVencidos)
    assert.equal(after.totalVencidoCents, before.totalVencidoCents)
    for (const key of ['hasta30', 'de31a60', 'mas60'] as const) {
      assert.equal(after.porBucket[key].tenants, before.porBucket[key].tenants)
      assert.equal(after.porBucket[key].montoCents, before.porBucket[key].montoCents)
    }

    // Pero sí cuenta como fila del detalle: si no, la paginación lo dejaría fuera.
    assert.equal(after.tenantsConAdeudoPorAumento - before.tenantsConAdeudoPorAumento, 1)
  })

  test('CA-3 — el cliente al corriente sin aumento pendiente sigue fuera del detalle', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 21
    const { publicId, buId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-sano',
      status: 'active',
      daysLate: -15,
      contractedTotal: 5800,
    })
    businessUnitIds.push(buId)

    const collected = await collectReceivables(client, admin!.user)

    assert.lengthOf(
      findTenants(collected.tenants, publicId),
      0,
      'el detalle es de deuda: sin vencido y sin adeudo no hay renglón'
    )
  })

  test('CA-3 — una cancelada con aumento pendiente no se cuela al detalle', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now() + 22
    const { publicId, buId, subId } = await createOverdue({
      planId,
      stamp,
      suffix: 'aum-cancelada',
      status: 'canceled',
      daysLate: 40,
      canceledDaysAfterPeriodEnd: 10,
      contractedTotal: 1000,
    })
    businessUnitIds.push(buId)
    await createSubscriptionChange({
      businessUnitId: buId,
      billingSubscriptionId: subId,
      proratedAmountCents: 88888,
    })

    const collected = await collectReceivables(client, admin!.user)

    assert.lengthOf(
      findTenants(collected.tenants, publicId),
      0,
      'las bajas con adeudo se reportan en canceladas[], no en el detalle de cartera'
    )
  })

  test('los vencidos encabezan el detalle y las filas de solo adeudo van después', async ({
    client,
    assert,
  }) => {
    const collected = await collectReceivables(client, admin!.user)
    const conAtraso = collected.tenants.filter((row) => row.diasAtraso !== null)

    assert.deepEqual(
      collected.tenants.slice(0, conAtraso.length).map((row) => row.businessUnitPublicId),
      conAtraso.map((row) => row.businessUnitPublicId),
      'ninguna fila sin atraso se cuela entre los vencidos'
    )

    for (let index = 1; index < conAtraso.length; index += 1) {
      assert.isAtMost(
        conAtraso[index]!.diasAtraso!,
        conAtraso[index - 1]!.diasAtraso!,
        'diasAtraso debe venir descendente entre los vencidos'
      )
    }
  })
```

- [ ] **Step 2: Arreglar las dos aserciones que el cambio de universo invalida**

En el test `CA-3 — el resumen es de la cartera completa, no de la página`, reemplazar:

```ts
    assert.equal(primera.meta.total, (primera.data.resumen as SummaryBody).tenantsVencidos)
```

por:

```ts
    // `meta.total` cuenta el universo de filas (past_due OR con aumento
    // pendiente); `tenantsVencidos` sigue contando solo past_due (CA-3 de
    // USRH1788052455652). El primero nunca es menor que el segundo.
    assert.isAtLeast(primera.meta.total, (primera.data.resumen as SummaryBody).tenantsVencidos)
```

En el test `el orden es más atrasados primero y el payload no filtra identificadores internos`, reemplazar el `for` que compara `diasAtraso` por:

```ts
    // El orden entre vencidos lo cubre su propio test; aquí solo se verifica que
    // ninguna fila del universo ampliado rompa el descendente con un nulo.
    const conAtraso = tenants.filter((row) => row.diasAtraso !== null)
    for (let index = 1; index < conAtraso.length; index += 1) {
      assert.isAtMost(
        conAtraso[index]!.diasAtraso!,
        conAtraso[index - 1]!.diasAtraso!,
        'diasAtraso debe venir descendente'
      )
    }
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_receivables_metrics
```

Expected: FAIL en `CA-3 — el cliente al corriente con aumento pendiente entra sin marcas de morosidad`, con `expected 0 to have a length of 1`: el cliente `active` todavía no entra al universo.

- [ ] **Step 4: Volver nulables los dos campos de antigüedad de la fila**

En `ReceivableTenantItem`, reemplazar los dos campos y su comentario:

```ts
  /** `contracted_total` (CON IVA) en centavos enteros. Un solo periodo (regla 3). `0` en las filas que entran solo por adeudo por aumento. */
  montoVencidoCents: number
  /** `null` en las filas que entran solo por adeudo por aumento: la antigüedad es propia del vencido (regla 5). */
  diasAtraso: number | null
  /** `null` en las filas que entran solo por adeudo por aumento: el adeudo no se reparte en tramos (regla 5). */
  bucket: ReceivableBucket | null
```

- [ ] **Step 5: Agregar la expresión del universo y la consulta ampliada**

En el bloque de constantes SQL, después de `PENDING_INCREASE_DEBT_CENTS_SQL`, agregar el `EXISTS` del universo:

```ts
/**
 * ¿La suscripción de la fila tiene algún aumento pendiente con importe?
 *
 * Es el segundo miembro del universo de filas del detalle. Mide el importe
 * (`> 0`) a propósito: un aumento pedido en prueba deja el prorrateo en cero, y
 * esa fila entraría con cero en las dos columnas de dinero.
 */
const HAS_PENDING_INCREASE_DEBT_SQL = `EXISTS (
    SELECT 1
    FROM ${PENDING_INCREASE_CHANGES_TABLE} as pid
    WHERE pid.billing_subscription_id = bs.billing_subscription_id
      AND ${pendingIncreaseDebtConditionSql('pid')}
  )`
```

Y ampliar el import del helper para incluir `pendingIncreaseDebtConditionSql`:

```ts
import {
  PENDING_INCREASE_AMOUNT_COLUMN,
  PENDING_INCREASE_CHANGES_TABLE,
  pendingIncreaseChangeConditionSql,
  pendingIncreaseDebtConditionSql,
} from '../helpers/billing_pending_increase_change_filter.js'
```

Agregar el nuevo universo como método privado, justo después de `overdueQuery`:

```ts
  /**
   * Universo de filas del detalle de cartera (USRH1788052455652): suscripciones
   * vivas de empresas vivas que **o** están en `past_due` **o** tienen al menos
   * un aumento de asientos pendiente de pago.
   *
   * Es más ancho que `overdueQuery` a propósito: el cliente que creció a media
   * suscripción y todavía no se le factura no es un moroso, pero sí es un
   * renglón del detalle — y sin él, quien cobra tendría que abrir cliente por
   * cliente para encontrarlo (regla 4).
   *
   * `overdueQuery` **no se toca**: el total vencido, `tenantsVencidos` y los tres
   * tramos siguen calculándose sobre `past_due` y nada más (regla 5). Las dos
   * consultas conviven porque son dos preguntas distintas, no dos versiones de
   * la misma.
   *
   * `canceled` queda fuera con un filtro explícito: una baja con adeudo se
   * reporta en `canceladas[]`, que es gestión manual, y meterla aquí la
   * presentaría como cobranza recurrente.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan por
   * el hook de `SoftDeletes`. `business_unit_active = 0` NO excluye: la
   * desactivación no perdona la deuda (regla 7).
   */
  private receivableRowsQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNot('bs.billing_subscription_status', 'canceled')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
      .where((builder) => {
        builder
          .where('bs.billing_subscription_status', 'past_due')
          .orWhereRaw(HAS_PENDING_INCREASE_DEBT_SQL)
      })
  }

  /**
   * Cuántas filas tiene el universo del detalle. Es el `meta.total`, y por lo
   * tanto lo que decide `lastPage`.
   *
   * **No** es `resumen.tenantsVencidos`. Antes de esta historia coincidían
   * porque el detalle solo traía morosos; ahora el detalle es más ancho, y si el
   * total siguiera contando solo `past_due`, la última página se cortaría antes
   * de las filas que entran por adeudo y ese dinero quedaría inalcanzable.
   *
   * @returns Filas del universo completo, sin paginar.
   */
  private async countReceivableRows(): Promise<number> {
    const row = (await this.receivableRowsQuery().count('* as total').first()) as Record<
      string,
      unknown
    > | null

    return Number(row?.total ?? 0)
  }
```

- [ ] **Step 6: Cablear el universo, el orden y `meta.total`**

En `listReceivables`, reemplazar el bloque de lecturas y el cálculo del total:

```ts
    const resumen = await this.loadSummary(businessDate)
    // `meta.total` sale de su propio conteo y no de `resumen.tenantsVencidos`:
    // el detalle incluye a los clientes al corriente con adeudo por aumento, que
    // no son morosos y no cuentan en el resumen del vencido (regla 4).
    const total = await this.countReceivableRows()
    const tenants = await this.loadPage(businessDate, offset, limit)
    const canceladas = await this.loadCanceled()

    const lastPage = Math.max(1, Math.ceil(total / limit))
```

En `loadPage`, cambiar la consulta base de `this.overdueQuery()` a `this.receivableRowsQuery()`, agregar el `select` del estado y el orden que pone a los vencidos primero. El método queda:

```ts
  /**
   * Página del detalle de cartera en el orden fijo del contrato: primero los
   * vencidos —del más atrasado al menos, luego los de mayor importe—, y después
   * los clientes al corriente con adeudo por aumento.
   *
   * Los vencidos encabezan porque la tabla es, antes que nada, la lista de a
   * quién llamar hoy: quien cobra abre esto para ordenar sus llamadas de
   * cobranza, y las de facturación pueden esperar el renglón siguiente.
   *
   * `diasAtraso DESC` se traduce a `DATE(current_period_end) ASC` para que el
   * orden lo resuelva la base y la paginación sea real. Se ordena por la fecha
   * civil y no por el timestamp porque dos periodos que vencieron el mismo día a
   * distinta hora tienen el mismo `diasAtraso` y deben desempatar por importe.
   *
   * @param businessDate - Fecha de negocio de hoy, `YYYY-MM-DD`.
   * @param offset - Filas a saltar.
   * @param limit - Filas a devolver.
   * @returns Las filas de la página, ya como DTO plano.
   */
  private async loadPage(
    businessDate: string,
    offset: number,
    limit: number
  ): Promise<ReceivableTenantItem[]> {
    const rows = (await this.receivableRowsQuery()
      // Excepción deliberada al whereNull de cada tabla tocada: se muestra el nombre del plan aunque esté dado de baja (mismo criterio que platform_tenant_service).
      .leftJoin('billing_plans as bp', 'bp.billing_plan_id', 'bs.billing_plan_id')
      .select([
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'bu.business_unit_active as businessUnitActive',
        'bp.billing_plan_name as planName',
        'bs.billing_subscription_current_period_end as periodoFin',
        'bs.billing_subscription_credit_balance_cents as saldoAFavorCents',
        // Solo para que el DTO decida si la fila lleva atraso y tramo. No se
        // publica: el estado de la suscripción no es parte de este contrato.
        'bs.billing_subscription_status as subscriptionStatus',
      ])
      .select(db.raw(`${CONTRACTED_TOTAL_CENTS_SQL} as montoVencidoCents`))
      .select(db.raw(`${PENDING_INCREASE_DEBT_CENTS_SQL} as adeudoPorAumentoCents`))
      // Los vencidos primero: en MySQL la comparación rinde 1/0 y `desc` deja el
      // 1 arriba. Sin esto, un cliente al corriente con adeudo podría caer entre
      // dos morosos y romper la lectura de la lista de llamadas.
      .orderByRaw(`bs.billing_subscription_status = 'past_due' desc`)
      // Misma red que el DTO: periodo nulo se ordena como si venciera hoy.
      .orderByRaw('COALESCE(DATE(bs.billing_subscription_current_period_end), ?) asc', [
        businessDate,
      ])
      .orderByRaw(`${CONTRACTED_TOTAL_CENTS_SQL} desc`)
      .orderBy('bu.business_unit_name', 'asc')
      .offset(offset)
      .limit(limit)) as Array<Record<string, unknown>>

    return rows.map((row) => this.toTenantItem(row, businessDate))
  }
```

- [ ] **Step 7: Separar en el DTO lo que es cobranza de lo que no**

Reemplazar `toTenantItem` completo:

```ts
  /**
   * DTO plano de una fila, armado campo por campo con casteo explícito. No sale
   * de aquí ningún identificador interno ni ningún dato fiscal.
   *
   * Las marcas de morosidad —importe vencido, días de atraso y tramo— se emiten
   * **solo** si la suscripción está en `past_due`. Una fila que entra únicamente
   * por adeudo por aumento sale con el vencido en cero y los otros dos en nulo:
   * heredarle esas marcas convertiría a un cliente que creció en un moroso, que
   * es el daño comercial que esta historia viene a evitar (regla 4).
   *
   * `montoVencidoCents` se fuerza a cero en vez de omitir la columna del
   * `select` porque el importe contratado existe para toda suscripción; lo que
   * no existe es la deuda vencida.
   *
   * @param row - Fila cruda de la consulta paginada.
   * @param businessDate - Fecha de negocio de hoy, `YYYY-MM-DD`.
   * @returns La empresa tal como la publica el contrato.
   */
  private toTenantItem(row: Record<string, unknown>, businessDate: string): ReceivableTenantItem {
    // `current_period_end` se siembra al alta y nunca queda vacío
    // (`billing_subscription_service.ts:459-460,514`). El `?? businessDate` es la
    // red que garantiza la regla 4: los días de atraso siempre son un número.
    const periodoFin = toCalendarIsoDate(row.periodoFin) ?? businessDate
    const isOverdue = row.subscriptionStatus === 'past_due'
    const diasAtraso = isOverdue
      ? Math.max(0, daysBetweenBusinessDates(periodoFin, businessDate))
      : null

    return {
      businessUnitPublicId: row.businessUnitPublicId as string,
      businessUnitName: row.businessUnitName as string,
      businessUnitActive: Number(row.businessUnitActive ?? 0),
      planName: (row.planName as string | null) ?? null,
      montoVencidoCents: isOverdue ? Number(row.montoVencidoCents ?? 0) : 0,
      diasAtraso,
      bucket: diasAtraso === null ? null : resolveReceivableBucket(diasAtraso),
      periodoFin,
      saldoAFavorCents: Number(row.saldoAFavorCents ?? 0),
      adeudoPorAumentoCents: Number(row.adeudoPorAumentoCents ?? 0),
    }
  }
```

Actualizar además el JSDoc de `ListReceivablesResult.tenants` — hoy no existe, y el de `meta` conviene explicitarlo. Dentro de `ListReceivablesResult`, sobre `tenants`:

```ts
    /**
     * Página del detalle de cartera: los morosos y los clientes al corriente con
     * adeudo por aumento de asientos (USRH1788052455652). Los primeros van
     * arriba. `meta.total` cuenta este universo, que es más ancho que
     * `resumen.tenantsVencidos`.
     */
    tenants: ReceivableTenantItem[]
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_receivables_metrics
```

Expected: PASS, el grupo completo.

- [ ] **Step 9: Correr la suite de billing completa para descartar regresión en el cobro**

Esta historia solo lee, pero toca un archivo que consulta `billing_subscription_changes`. Vale la corrida:

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=billing && node ace test unit
```

Expected: PASS. Nada del camino del cobro cambió.

- [ ] **Step 10: Typecheck y lint**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint
```

- [ ] **Step 11: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/services/platform_receivable_service.ts tests/functional/platform_receivables_metrics.spec.ts
git commit -m "feat(cartera): include up-to-date tenants with pending seat increases in the receivables detail"
```

---

## Task 4: API — documentar el contrato y el cambio de universo

**Files:**
- Modify: `gsti-rh-api/app/controllers/platform_receivable_controller.ts`

**Interfaces:**
- Consumes de Tasks 2 y 3: los tres campos nuevos y la semántica nueva de `tenants[]` y `meta.total`.
- Produces: nada de código. Es el contrato que lee quien consume el endpoint.

No hay test: `@swagger` y `@responseBody` son comentarios. Se verifica leyendo el JSON generado.

- [ ] **Step 1: Actualizar la descripción del endpoint**

En el bloque `@swagger`, en `description`, agregar al final del texto (antes de la línea de `Requiere sesión válida`):

```
   *       Publica DOS números de deuda independientes: el total vencido, que es cobranza, y el
   *       total de adeudo por aumento de asientos, que es facturación pendiente. Ningún campo de
   *       esta respuesta es —ni podrá ser— la suma de los dos: sumarlos produce una cifra que no
   *       corresponde a ninguna gestión real.
   *       El universo de tenants[] es past_due OR con al menos un aumento de asientos pendiente de
   *       pago: un cliente al corriente que agregó asientos aparece con montoVencidoCents 0,
   *       diasAtraso null y bucket null, y NO cuenta en resumen.tenantsVencidos ni en ningún tramo.
   *       meta.total cuenta ese universo, no resumen.tenantsVencidos: antes de USRH1788052455652
   *       coincidían y ya no lo hacen. Los vencidos encabezan el listado.
   *       Los tramos de antigüedad son propios del vencido: el adeudo por aumento no tiene edad.
```

- [ ] **Step 2: Agregar los dos campos del resumen al schema**

En `properties.data.properties.resumen.properties`, después de `calculadoAl`:

```
   *                         totalAdeudoPorAumentoCents:
   *                           type: integer
   *                           description: |
   *                             Suma del adeudo por aumento de asientos de TODA la cartera, en centavos.
   *                             Facturación pendiente, no cobranza. Jamás se suma a totalVencidoCents.
   *                             La columna origen ya está en centavos: no se convierte.
   *                         tenantsConAdeudoPorAumento:
   *                           type: integer
   *                           description: |
   *                             Cuántas empresas tienen adeudo por aumento mayor a cero.
   *                             No es un subconjunto de tenantsVencidos: una empresa al corriente cuenta aquí y no allá.
```

- [ ] **Step 3: Agregar el campo de la fila y documentar los tres nulables**

En `properties.data.properties.tenants.items.properties`, reemplazar las entradas de `montoVencidoCents`, `diasAtraso` y `bucket`, y agregar el campo nuevo:

```
   *                           montoVencidoCents:
   *                             type: integer
   *                             description: 0 en las filas que entran solo por adeudo por aumento.
   *                           diasAtraso:
   *                             type: integer
   *                             nullable: true
   *                             description: null en las filas que entran solo por adeudo por aumento. La antigüedad es propia del vencido.
   *                           bucket:
   *                             type: string
   *                             nullable: true
   *                             enum: [hasta30, de31a60, mas60]
   *                             description: null en las filas que entran solo por adeudo por aumento. El adeudo no se reparte en tramos.
   *                           adeudoPorAumentoCents:
   *                             type: integer
   *                             description: |
   *                               Suma de los aumentos de asientos pendientes de pago de la empresa, en centavos.
   *                               0 cuando no tiene ninguno. Facturación pendiente: nunca se suma a montoVencidoCents.
```

Y en la descripción del arreglo `tenants`, agregar un `description` al mismo nivel que `type: array`:

```
   *                     tenants:
   *                       type: array
   *                       description: |
   *                         Detalle de cartera. Universo: suscripciones vivas de empresas vivas en past_due
   *                         OR con al menos un aumento de asientos pendiente de pago con importe.
   *                         Los vencidos van primero. canceled queda fuera: se reporta en canceladas[].
   *                         Aditivo para quien lee importes; NO aditivo para quien cuenta filas.
   *                       items:
```

- [ ] **Step 4: Documentar el `meta.total`**

En `properties.meta.properties.total`:

```
   *                     total:
   *                       type: integer
   *                       description: |
   *                         Filas del universo de tenants[], no resumen.tenantsVencidos.
   *                         Cambió de significado en USRH1788052455652: antes coincidían.
```

- [ ] **Step 5: Actualizar el bloque `@index` y el `@responseBody 200`**

En `@description`, agregar dos líneas al final:

```
   *   Publica dos números independientes: el vencido (cobranza) y el adeudo por aumento de asientos\
   *   (facturación pendiente). Ningún campo es su suma. Los clientes al corriente con aumento pendiente\
   *   aparecen en el detalle sin días de atraso ni tramo, y no cuentan como morosos.
```

Reemplazar el `@responseBody 200` completo por una línea que incluya los tres campos nuevos y una fila de cada tipo:

```
   * @responseBody 200 - {"type": "success", "data": {"resumen": {"totalVencidoCents": 580000, "tenantsVencidos": 1, "saldoAFavorCents": 100000, "porBucket": {"hasta30": {"tenants": 1, "montoCents": 580000}, "de31a60": {"tenants": 0, "montoCents": 0}, "mas60": {"tenants": 0, "montoCents": 0}}, "calculadoAl": "2026-09-03", "totalAdeudoPorAumentoCents": 91210, "tenantsConAdeudoPorAumento": 1}, "tenants": [{"businessUnitPublicId": "uuid", "businessUnitName": "Empresa Demo", "businessUnitActive": 1, "planName": "Plan Pro", "montoVencidoCents": 580000, "diasAtraso": 12, "bucket": "hasta30", "periodoFin": "2026-08-21", "saldoAFavorCents": 100000, "adeudoPorAumentoCents": 0}, {"businessUnitPublicId": "uuid", "businessUnitName": "Empresa Que Crecio", "businessUnitActive": 1, "planName": "Plan Pro", "montoVencidoCents": 0, "diasAtraso": null, "bucket": null, "periodoFin": "2026-09-30", "saldoAFavorCents": 0, "adeudoPorAumentoCents": 91210}], "canceladas": [{"businessUnitPublicId": "uuid", "businessUnitName": "Empresa Baja", "businessUnitActive": 1, "planName": "Plan Pro", "montoAdeudadoCents": 348000, "periodoFin": "2026-06-30", "canceladoEl": "2026-07-15", "diasAtrasoAlCancelar": 15}]}, "meta": {"total": 2, "page": 1, "limit": 20, "lastPage": 1}}
```

- [ ] **Step 6: Actualizar el JSDoc de la clase del controlador**

```ts
/**
 * Cartera de la plataforma en la consola GSTI (USRH1788052455651 +
 * USRH1788052455652).
 *
 * Solo lectura. Publica dos números de deuda que **no se suman**: el total
 * vencido con su reparto por antigüedad, que es cobranza, y el total de adeudo
 * por aumento de asientos, que es facturación pendiente. Más el detalle
 * paginado por empresa, con las dos cifras en columnas distintas.
 */
```

- [ ] **Step 7: Verificar que el endpoint responde con los campos documentados**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint && node ace test functional --files=platform_receivables_metrics
```

Expected: PASS. (El swagger no se testea; el `@responseBody` se cotejó a mano contra la forma que assertan los tests.)

- [ ] **Step 8: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/controllers/platform_receivable_controller.ts
git commit -m "docs(cartera): document the seat increase debt fields and the widened row universe"
```

---

## Task 5: Landlord — el contrato nuevo en la interface y el repositorio

**Files:**
- Modify: `valanserh-landlord/app/pages/dashboard/domain/receivables.interface.ts`
- Modify: `valanserh-landlord/app/pages/dashboard/infrastructure/receivables.repository.ts`
- Test: `valanserh-landlord/app/pages/dashboard/infrastructure/receivables.repository.spec.ts`
- Test: `valanserh-landlord/app/pages/dashboard/application/use-receivables.spec.ts` (solo la fábrica del mock y un test de paso)

**Interfaces:**
- Consumes del API (Tasks 2-3): `resumen.totalAdeudoPorAumentoCents`, `resumen.tenantsConAdeudoPorAumento`, `tenants[].adeudoPorAumentoCents`.
- Produces: `ReceivablesSummary.seatIncreaseDebtTotalCents: number`, `ReceivablesSummary.tenantsWithSeatIncreaseDebt: number`, `OverdueTenant.seatIncreaseDebtCents: number`. Los consumen los helpers (Task 6) y el orquestador (Task 7).

**El composable no cambia.** `use-receivables.ts` hace `summary.value = result.summary` y `overdueTenants.value = result.overdueTenants`: los campos nuevos viajan solos. Su `.spec.ts` sí se toca, porque su mock tiene que satisfacer el tipo `Receivables` o el typecheck revienta — y se aprovecha para dejar un test de regresión del paso.

- [ ] **Step 1: Escribir los tests que fallan**

En `app/pages/dashboard/infrastructure/receivables.repository.spec.ts`, agregar los campos nuevos a los mocks existentes:

```ts
const mockResumen = {
  totalVencidoCents: 1740000,
  tenantsVencidos: 3,
  saldoAFavorCents: 100000,
  porBucket: {
    hasta30: { tenants: 1, montoCents: 580000 },
    de31a60: { tenants: 1, montoCents: 580000 },
    mas60: { tenants: 1, montoCents: 580000 }
  },
  calculadoAl: '2026-09-03',
  totalAdeudoPorAumentoCents: 91210,
  tenantsConAdeudoPorAumento: 1
}

const mockTenant = {
  businessUnitPublicId: 'bu-1',
  businessUnitName: 'Aceros del Norte',
  businessUnitActive: 0,
  planName: 'Plan Pro',
  montoVencidoCents: 580000,
  diasAtraso: 45,
  bucket: 'de31a60' as const,
  periodoFin: '2026-07-20',
  saldoAFavorCents: 100000,
  adeudoPorAumentoCents: 91210
}
```

En el test `mapea el resumen igual que antes: la franja no cambia de contrato`, agregar los dos campos al `toEqual` (el objeto es exacto, sin ellos falla):

```ts
      calculatedAt: '2026-09-03',
      seatIncreaseDebtTotalCents: 91210,
      tenantsWithSeatIncreaseDebt: 1
```

Y agregar los tests nuevos al final del `describe`:

```ts
  it('CA-1 — el adeudo por aumento llega en su propio campo, aparte del vencido', async () => {
    const result = await getReceivables({ apiFetch: makeApiFetch() })

    expect(result.overdueTenants[0]).toMatchObject({
      overdueAmountCents: 580000,
      seatIncreaseDebtCents: 91210
    })
  })

  it('regla 1 — el mapeo no produce ningún campo que sea la suma de los dos números', async () => {
    const result = await getReceivables({ apiFetch: makeApiFetch() })

    expect(Object.values(result.summary)).not.toContain(1740000 + 91210)
    expect(Object.values(result.overdueTenants[0]!)).not.toContain(580000 + 91210)
  })

  it('CA-3 — el cliente al corriente con adeudo llega sin atraso ni tramo', async () => {
    const apiFetch = makeApiFetch({
      tenants: [
        {
          ...mockTenant,
          businessUnitPublicId: 'bu-sano',
          businessUnitActive: 1,
          montoVencidoCents: 0,
          diasAtraso: null,
          bucket: null,
          periodoFin: '2026-09-30',
          saldoAFavorCents: 0,
          adeudoPorAumentoCents: 91210
        }
      ]
    })

    const result = await getReceivables({ apiFetch })

    expect(result.overdueTenants[0]).toMatchObject({
      overdueAmountCents: 0,
      daysLate: null,
      bucket: null,
      seatIncreaseDebtCents: 91210
    })
  })

  it('CA-7 — un tenant sin aumentos pendientes llega con cero explícito, no con nulo', async () => {
    const apiFetch = makeApiFetch({
      tenants: [{ ...mockTenant, adeudoPorAumentoCents: 0 }],
      resumen: { ...mockResumen, totalAdeudoPorAumentoCents: 0, tenantsConAdeudoPorAumento: 0 }
    })

    const result = await getReceivables({ apiFetch })

    expect(result.overdueTenants[0]!.seatIncreaseDebtCents).toBe(0)
    expect(result.summary.seatIncreaseDebtTotalCents).toBe(0)
    expect(result.summary.tenantsWithSeatIncreaseDebt).toBe(0)
  })
```

En `app/pages/dashboard/application/use-receivables.spec.ts` hay dos fábricas que construyen tipos que acaban de crecer, y sin los campos nuevos el `typecheck` revienta. En `makeSummary`, agregar los dos campos antes del spread de overrides:

```ts
const makeSummary = (overrides: Partial<ReceivablesSummary> = {}): ReceivablesSummary => ({
  overdueTotalCents: 1740000,
  overdueTenants: 3,
  creditBalanceCents: 100000,
  buckets: {
    hasta30: { key: 'hasta30', tenants: 1, amountCents: 580000 },
    de31a60: { key: 'de31a60', tenants: 1, amountCents: 580000 },
    mas60: { key: 'mas60', tenants: 1, amountCents: 580000 }
  },
  calculatedAt: '2026-09-02',
  seatIncreaseDebtTotalCents: 91210,
  tenantsWithSeatIncreaseDebt: 1,
  ...overrides
})
```

En `makeOverdueTenant`, agregar el campo después de `creditBalanceCents`:

```ts
const makeOverdueTenant = (publicId: string, daysLate: number): OverdueTenant => ({
  publicId,
  name: `Empresa ${publicId}`,
  isActive: true,
  planName: 'Plan Pro',
  overdueAmountCents: 580000,
  daysLate,
  bucket: daysLate > 60 ? 'mas60' : 'de31a60',
  periodEnd: '2026-07-20',
  creditBalanceCents: 0,
  seatIncreaseDebtCents: 91210
})
```

`emptySummary` hereda de `makeSummary`, así que además hay que apagarle los dos números para que siga significando "nadie debe nada":

```ts
const emptySummary = (): ReceivablesSummary =>
  makeSummary({
    overdueTotalCents: 0,
    overdueTenants: 0,
    creditBalanceCents: 0,
    seatIncreaseDebtTotalCents: 0,
    tenantsWithSeatIncreaseDebt: 0,
    buckets: {
      hasta30: { key: 'hasta30', tenants: 0, amountCents: 0 },
      de31a60: { key: 'de31a60', tenants: 0, amountCents: 0 },
      mas60: { key: 'mas60', tenants: 0, amountCents: 0 }
    }
  })
```

Y agregar el test de paso al final del `describe`. Usa `makeDeps()` y la fábrica del `Receivables` completo tal como ya existen en el archivo:

```ts
  it('CA-1 — el adeudo por aumento llega al estado sin que el composable lo toque', async () => {
    vi.spyOn(repo, 'getReceivables').mockResolvedValue({
      summary: makeSummary(),
      overdueTenants: [makeOverdueTenant('bu-1', 45)],
      canceled: [],
      pagination: { total: 1, page: 1, limit: 20, lastPage: 1 }
    })

    const receivables = useReceivables(makeDeps())
    await receivables.load()

    expect(receivables.summary.value?.seatIncreaseDebtTotalCents).toBe(91210)
    expect(receivables.overdueTenants.value[0]?.seatIncreaseDebtCents).toBe(91210)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/infrastructure/receivables.repository.spec.ts app/pages/dashboard/application/use-receivables.spec.ts
```

Expected: FAIL. `seatIncreaseDebtTotalCents` y `seatIncreaseDebtCents` son `undefined`.

- [ ] **Step 3: Extender los tipos**

En `app/pages/dashboard/domain/receivables.interface.ts`:

En `ReceivablesSummaryRaw`, agregar después de `calculadoAl`:

```ts
  totalAdeudoPorAumentoCents: number
  tenantsConAdeudoPorAumento: number
```

En `ReceivableTenantRaw`, agregar al final:

```ts
  adeudoPorAumentoCents: number
```

Y actualizar el JSDoc del bloque, que hoy anuncia esta historia en futuro:

```ts
/**
 * Fila del detalle de cartera tal como la publica el API.
 *
 * El universo es `past_due` OR con aumento de asientos pendiente de pago: las
 * filas que entran solo por aumento llegan con `montoVencidoCents: 0`,
 * `diasAtraso: null` y `bucket: null`. No son morosas y no se les pinta como
 * tales.
 */
```

En `ReceivablesSummary`, agregar después de `calculatedAt`:

```ts
  /**
   * Adeudo por aumento de asientos de toda la plataforma, en centavos. Es
   * facturación pendiente, no cobranza: **nunca** se suma a `overdueTotalCents`
   * ni se presenta junto a él como una sola cifra (regla 1).
   */
  seatIncreaseDebtTotalCents: number
  /** Cuántos clientes tienen adeudo por aumento. No es un subconjunto de `overdueTenants`. */
  tenantsWithSeatIncreaseDebt: number
```

En `OverdueTenant`, agregar al final:

```ts
  /**
   * Adeudo por aumento de asientos del cliente, en centavos: la suma de todos
   * sus aumentos pendientes de pago. `0` cuando no tiene ninguno — y `0` se
   * pinta como importe cero, no como guion (regla 8).
   */
  seatIncreaseDebtCents: number
```

En `OverdueTenantRow`, agregar después de `formattedAmount`:

```ts
  /**
   * Adeudo por aumento ya en pesos. **Nunca es `null`**, a diferencia de
   * `formattedCredit`: la columna del adeudo publica su cero (regla 8), mientras
   * que un saldo a favor de cero es ruido en una tabla de cobranza.
   */
  formattedSeatIncreaseDebt: string
```

- [ ] **Step 4: Mapear los tres campos en el repositorio**

En `app/pages/dashboard/infrastructure/receivables.repository.ts`:

En `mapOverdueTenant`, agregar al objeto devuelto:

```ts
  creditBalanceCents: raw.saldoAFavorCents,
  seatIncreaseDebtCents: raw.adeudoPorAumentoCents
```

Y actualizar su JSDoc para nombrar los dos números:

```ts
/**
 * Mapea una fila del detalle de cartera al dominio del slice.
 *
 * `businessUnitActive` llega como `0` o `1` y se traduce a booleano aquí, una
 * sola vez: la vista pregunta "está desactivada", no compara contra un número.
 *
 * El vencido y el adeudo por aumento se copian a dos campos distintos y aquí no
 * se calcula ningún acumulado de los dos: es una regla de producto, no una
 * decisión de mapeo (regla 1).
 *
 * @param raw - Fila tal como la publica el API.
 * @returns El cliente mapeado, con el dinero en centavos.
 */
```

En `getReceivables`, dentro de `summary`, agregar después de `calculatedAt`:

```ts
      calculatedAt: resumen.calculadoAl,
      seatIncreaseDebtTotalCents: resumen.totalAdeudoPorAumentoCents,
      tenantsWithSeatIncreaseDebt: resumen.tenantsConAdeudoPorAumento
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/infrastructure/receivables.repository.spec.ts app/pages/dashboard/application/use-receivables.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/domain/receivables.interface.ts app/pages/dashboard/infrastructure/receivables.repository.ts app/pages/dashboard/infrastructure/receivables.repository.spec.ts app/pages/dashboard/application/use-receivables.spec.ts
git commit -m "feat(dashboard): map the seat increase debt from the receivables contract"
```

---

## Task 6: Landlord — la columna del adeudo en la tabla de cobranza

**Files:**
- Modify: `valanserh-landlord/app/pages/dashboard/domain/receivables.helpers.ts`
- Test: `valanserh-landlord/app/pages/dashboard/domain/receivables.helpers.spec.ts`
- Modify: `valanserh-landlord/app/components/dashboardReceivables/index.vue`
- Modify: `valanserh-landlord/app/components/dashboardReceivables/style.scss`
- Modify: `valanserh-landlord/app/components/dashboardReceivables/domain/locales/dashboard-receivables.es.json`
- Test: `valanserh-landlord/app/components/dashboardReceivables/index.spec.ts`

**Interfaces:**
- Consumes de Task 5: `OverdueTenant.seatIncreaseDebtCents`, `OverdueTenantRow.formattedSeatIncreaseDebt`.
- Produces: la columna "Adeudo por aumento" en la tabla de cobranza y la leyenda que separa los dos números. Nada que consuma otro task, salvo que `dashboard/index.spec.ts` (Task 7) verá la columna en el DOM.

**Dónde va la columna:** después de "Antigüedad" y antes de "Saldo a favor". Deja juntas las tres celdas de cobranza (monto vencido, días, antigüedad) y arranca con el adeudo el bloque de facturación. Ponerla pegada a "Monto vencido" invitaría a leer las dos columnas como sumables, que es exactamente lo que la regla 1 prohíbe.

- [ ] **Step 1: Escribir los tests que fallan**

En `app/pages/dashboard/domain/receivables.helpers.spec.ts` hay dos fábricas que construyen tipos que crecieron. En `makeSummary`, agregar los dos campos del resumen después de `calculatedAt`:

```ts
  calculatedAt: '2026-09-02',
  seatIncreaseDebtTotalCents: 91210,
  tenantsWithSeatIncreaseDebt: 1
```

En `makeOverdueTenant`, agregar el campo después de `creditBalanceCents`, **en cero**: los tests que ya existen miden el vencido y el saldo a favor, y un adeudo distinto de cero ahí no cambiaría lo que miden pero sí les agregaría ruido.

```ts
  creditBalanceCents: 100000,
  seatIncreaseDebtCents: 0,
  ...overrides
```

Después agregar los tests nuevos al `describe('buildOverdueTenantRows')`:

```ts
  it('CA-1 — el adeudo por aumento sale en su propia celda, formateado en pesos', () => {
    const rows = buildOverdueTenantRows([
      makeOverdueTenant({ overdueAmountCents: 580000, seatIncreaseDebtCents: 91210 })
    ])

    expect(rows[0]!.formattedAmount).toBe('$5,800.00')
    expect(rows[0]!.formattedSeatIncreaseDebt).toBe('$912.10')
  })

  it('regla 1 — ningún campo del renglón es la suma de los dos importes', () => {
    const rows = buildOverdueTenantRows([
      makeOverdueTenant({ overdueAmountCents: 580000, seatIncreaseDebtCents: 91210 })
    ])

    expect(Object.values(rows[0]!)).not.toContain('$6,712.10')
  })

  it('CA-7 — un adeudo de cero se pinta como importe cero, no como guion', () => {
    const rows = buildOverdueTenantRows([makeOverdueTenant({ seatIncreaseDebtCents: 0 })])

    // El contraste con el saldo a favor es deliberado: ahí el cero sí es null.
    expect(rows[0]!.formattedSeatIncreaseDebt).toBe('$0.00')
  })

  it('CA-3 — el cliente al corriente con adeudo no recibe tono ni énfasis de tramo', () => {
    const rows = buildOverdueTenantRows([
      makeOverdueTenant({
        overdueAmountCents: 0,
        daysLate: null,
        bucket: null,
        seatIncreaseDebtCents: 91210
      })
    ])

    expect(rows[0]!).toMatchObject({
      formattedAmount: '$0.00',
      daysLate: null,
      bucket: null,
      bucketTone: null,
      bucketEmphasized: false,
      formattedSeatIncreaseDebt: '$912.10'
    })
  })
```

> Si el archivo no tiene una fábrica `makeOverdueTenant`, créala arriba del `describe` con los campos del tipo `OverdueTenant` y un `Partial<OverdueTenant>` de overrides. Si ya existe con otro nombre, usa el que hay.

En `app/components/dashboardReceivables/index.spec.ts`, agregar `formattedSeatIncreaseDebt` a los tres objetos de `overdueRows` (`'$0.00'` en los que no hablan del adeudo) y agregar:

```ts
  it('CA-1 — la tabla de cobranza trae la columna del adeudo por aumento', async () => {
    const wrapper = await mountSuspended(dashboardReceivables, { props })

    const headers = wrapper.findAll(`${OVERDUE} th`).map((th) => th.text())
    expect(headers).toContain('Adeudo por aumento')
    expect(headers).toContain('Monto vencido')
  })

  it('CA-6 — la sección de cobranza declara que los dos números no se suman', async () => {
    const wrapper = await mountSuspended(dashboardReceivables, { props })

    expect(wrapper.find(OVERDUE).text()).toContain('No se suman')
  })

  it('CA-6 — ninguna celda ni pie de la tabla publica la suma de los dos importes', async () => {
    const wrapper = await mountSuspended(dashboardReceivables, {
      props: {
        ...props,
        overdueRows: [
          {
            publicId: 'mixto',
            name: 'Aceros del Norte',
            isInactive: false,
            formattedAmount: '$5,800.00',
            daysLate: 12,
            bucket: 'hasta30' as const,
            bucketTone: 'warn',
            bucketEmphasized: false,
            formattedCredit: null,
            formattedSeatIncreaseDebt: '$912.10'
          }
        ]
      }
    })

    const text = wrapper.find(OVERDUE).text()
    expect(text).toContain('$5,800.00')
    expect(text).toContain('$912.10')
    expect(text).not.toContain('$6,712.10')
  })

  it('CA-3 — el cliente al corriente con adeudo se pinta sin días ni tramo', async () => {
    const wrapper = await mountSuspended(dashboardReceivables, {
      props: {
        ...props,
        overdueRows: [
          {
            publicId: 'sano',
            name: 'Panadería La Espiga',
            isInactive: false,
            formattedAmount: '$0.00',
            daysLate: null,
            bucket: null,
            bucketTone: null,
            bucketEmphasized: false,
            formattedCredit: null,
            formattedSeatIncreaseDebt: '$912.10'
          }
        ]
      }
    })

    const row = wrapper.find(`${OVERDUE} tbody tr`)
    expect(row.text()).toContain('$912.10')
    expect(row.find('.p-tag').exists()).toBe(false)
    expect(row.findAll('.dashboard-receivables__no-value').length).toBeGreaterThanOrEqual(2)
  })

  it('CA-7 — la columna del adeudo sigue ahí en ceros y no descuadra el vencido', async () => {
    const wrapper = await mountSuspended(dashboardReceivables, {
      props: {
        ...props,
        overdueRows: overdueRows.map((row) => ({ ...row, formattedSeatIncreaseDebt: '$0.00' }))
      }
    })

    const headers = wrapper.findAll(`${OVERDUE} th`).map((th) => th.text())
    expect(headers).toContain('Adeudo por aumento')
    expect(wrapper.findAll(`${OVERDUE} tbody tr`)).toHaveLength(3)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/domain/receivables.helpers.spec.ts app/components/dashboardReceivables/index.spec.ts
```

Expected: FAIL. `formattedSeatIncreaseDebt` es `undefined` y la columna no existe en el DOM.

- [ ] **Step 3: Formatear el adeudo en el helper de renglones**

En `app/pages/dashboard/domain/receivables.helpers.ts`, dentro de `buildOverdueTenantRows`, agregar el campo al objeto devuelto:

```ts
      formattedCredit:
        tenant.creditBalanceCents > 0 ? formatCentsAsMxn(tenant.creditBalanceCents) : null,
      formattedSeatIncreaseDebt: formatCentsAsMxn(tenant.seatIncreaseDebtCents)
```

Y agregar al JSDoc de la función, después del párrafo de "Tampoco netea":

```
 * Tampoco acumula: el vencido y el adeudo por aumento salen en dos campos y no
 * hay un tercero con su suma. Son dos gestiones distintas —cobrar y facturar— y
 * una cifra combinada no sirve para ninguna de las dos (regla 1).
 *
 * El adeudo se formatea **siempre**, incluso en cero, a diferencia del saldo a
 * favor: la columna del adeudo publica su cero porque un cero ahí es el dato
 * ("este cliente no creció"), mientras que un saldo a favor de cero solo hace
 * ruido en una tabla de cobranza (regla 8).
```

- [ ] **Step 4: Agregar los textos i18n**

En `app/components/dashboardReceivables/domain/locales/dashboard-receivables.es.json`, agregar la leyenda y el encabezado:

```json
  "dbr_overdue_title": "Cobranza — clientes con adeudo vencido",
  "dbr_overdue_legend": "El monto vencido es cobranza; el adeudo por aumento es facturación pendiente. No se suman.",
  "dbr_col_company": "Empresa",
  "dbr_col_amount": "Monto vencido",
  "dbr_col_days": "Días de atraso",
  "dbr_col_aging": "Antigüedad",
  "dbr_col_seat_increase_debt": "Adeudo por aumento",
  "dbr_col_credit": "Saldo a favor",
```

(El resto del archivo queda igual.)

- [ ] **Step 5: Pintar la leyenda y la columna**

En `app/components/dashboardReceivables/index.vue`, dentro del `<template #content>` de la sección de cobranza, agregar la leyenda como primer hijo — antes del `v-if="loading"`, con el mismo criterio que la sección de canceladas: se pinta siempre, también en el vacío y en el error, porque no es un hecho sobre estos datos sino la regla que separa las dos columnas.

```html
      <template #content>
        <!-- La leyenda se pinta siempre, también en el vacío y en el error: no
             es un hecho sobre estos datos sino la regla que separa la cobranza
             de la facturación pendiente (regla 1). -->
        <p class="dashboard-receivables__legend">{{ $t('dbr_overdue_legend') }}</p>

        <div v-if="loading" class="dashboard-receivables__skeleton">
```

Y agregar la columna nueva entre la de Antigüedad y la de Saldo a favor:

```html
            <!-- Facturación pendiente, no cobranza: va después de las tres
                 celdas del vencido para que no se lean como sumables, y su cero
                 se pinta como importe —no como guion— porque un cero aquí es el
                 dato de que el cliente no creció (regla 8). -->
            <Column :header="$t('dbr_col_seat_increase_debt')">
              <template #body="{ data }">
                <span class="dashboard-receivables__debt">
                  {{ data.formattedSeatIncreaseDebt }}
                </span>
              </template>
            </Column>
```

- [ ] **Step 6: Estilo de la celda del adeudo**

En `app/components/dashboardReceivables/style.scss`, agregar después de `&__amount`:

```scss
  // El adeudo por aumento es un importe real y se lee como tal, pero sin el
  // peso tipografico del vencido: la columna que ordena las llamadas de
  // cobranza sigue siendo la otra.
  &__debt {
    font-variant-numeric: tabular-nums;
    color: var(--color-fg);
  }
```

- [ ] **Step 7: Actualizar el JSDoc del componente**

En `app/components/dashboardReceivables/script.ts`, reemplazar el primer párrafo del JSDoc del `defineComponent`:

```ts
/**
 * Bloque de cobranza del tablero de plataforma. Dos secciones que no se mezclan
 * nunca: arriba los clientes con deuda recuperable —los vencidos, a quienes hay
 * que llamar hoy, y los que crecieron y están pendientes de facturar— y abajo,
 * aparte y rotulada, la de quienes cancelaron debiendo.
 *
 * En la tabla de arriba el monto vencido y el adeudo por aumento van en dos
 * columnas separadas y **no existe ninguna celda, pie ni etiqueta con su suma**:
 * uno es cobranza y el otro facturación pendiente, y una cifra combinada llevaría
 * a llamar a cobrar a un cliente que está al corriente (regla 1).
 *
 * Presentacional puro: recibe las filas ya mapeadas, ordenadas y con el dinero
 * ...
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/domain/receivables.helpers.spec.ts app/components/dashboardReceivables/index.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Lint de estilos**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm lint:styles && pnpm lint
```

Expected: sin errores. Si stylelint reclama un color literal, revisá que `&__debt` use `var(--color-fg)` y no un hex.

- [ ] **Step 10: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/domain/receivables.helpers.ts app/pages/dashboard/domain/receivables.helpers.spec.ts app/components/dashboardReceivables/
git commit -m "feat(dashboard): add the seat increase debt column to the collections table"
```

---

## Task 7: Landlord — la segunda tarjeta de deuda en la pestaña de Cobranza

**Files:**
- Modify: `valanserh-landlord/app/pages/dashboard/script.ts`
- Modify: `valanserh-landlord/app/pages/dashboard/index.vue`
- Modify: `valanserh-landlord/app/pages/dashboard/domain/locales/dashboard.es.json`
- Test: `valanserh-landlord/app/pages/dashboard/index.spec.ts`

**Interfaces:**
- Consumes de Task 5: `ReceivablesSummary.seatIncreaseDebtTotalCents`, `.tenantsWithSeatIncreaseDebt`.
- Consumes de Task 6: la tabla con la columna ya pintada.
- Produces: nada. Es la hoja del árbol.

**Dónde va:** en la pestaña "Cobranza", junto a la tarjeta del total vencido. `.dashboard__ops` es un grid de dos columnas, así que la tarjeta del vencido **pierde** `dashboard__kpi--full` (que hoy le hace `grid-column: 1 / -1`) y cada una ocupa una celda. Eso es literalmente lo que pide CA-6: "las dos tarjetas no comparten celda del grid". En `--bp-md-down` el grid colapsa a una columna y se apilan.

**Qué NO cambia:** `.dashboard__kpi--receivables` se queda en la tarjeta del vencido — es el selector de una docena de tests de `index.spec.ts`. La tarjeta nueva usa `.dashboard__kpi--seat-increase-debt`. Y `db_receivables_hint` no se toca: ya dice "con IVA · cobranza".

- [ ] **Step 1: Escribir los tests que fallan**

En `app/pages/dashboard/index.spec.ts`, en `makeReceivablesSummary`, agregar los dos campos antes del spread de overrides:

```ts
    calculatedAt: '2026-09-02',
    seatIncreaseDebtTotalCents: 91210,
    tenantsWithSeatIncreaseDebt: 1,
    ...overrides
```

Y en `makeReceivables`, agregar `seatIncreaseDebtCents` a las dos filas de `overdueTenants`: `91210` en `moroso-viejo` —el caso del cliente que se atrasó **y además** creció— y `0` en `moroso-nuevo`.

Después agregar los tests:

```ts
  it('CA-6 — la pestaña de cobranza muestra dos tarjetas de deuda, en celdas distintas', async () => {
    vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue(makeReceivables())

    const wrapper = await mountSuspended(dashboardPage)
    await flushPromises()

    const vencido = wrapper.find('.dashboard__kpi--receivables')
    const adeudo = wrapper.find('.dashboard__kpi--seat-increase-debt')

    expect(vencido.exists()).toBe(true)
    expect(adeudo.exists()).toBe(true)
    expect(vencido.classes()).not.toContain('dashboard__kpi--full')
    expect(adeudo.classes()).not.toContain('dashboard__kpi--full')
  })

  it('CA-6 — cada tarjeta declara si es cobranza o facturación pendiente', async () => {
    vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue(makeReceivables())

    const wrapper = await mountSuspended(dashboardPage)
    await flushPromises()

    expect(wrapper.find('.dashboard__kpi--receivables').text()).toContain('cobranza')
    expect(wrapper.find('.dashboard__kpi--seat-increase-debt').text()).toContain(
      'facturación pendiente'
    )
  })

  it('CA-6 — la tarjeta del adeudo muestra el total de plataforma, no una suma', async () => {
    vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue(makeReceivables())

    const wrapper = await mountSuspended(dashboardPage)
    await flushPromises()

    expect(wrapper.find('.dashboard__kpi--seat-increase-debt .metric-card__value').text()).toBe(
      '$912.10'
    )
    expect(wrapper.find('.dashboard__kpi--receivables .metric-card__value').text()).toBe(
      '$17,400.00'
    )
    // 1,740,000 + 91,210 = 1,831,210 centavos. Si ese importe aparece en algún
    // lado de la vista, alguien publicó la suma prohibida (regla 1).
    expect(wrapper.text()).not.toContain('$18,312.10')
  })

  it('CA-7 — sin ningún aumento pendiente la tarjeta muestra cero, no el vacío genérico', async () => {
    vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue(
      makeReceivables({
        summary: makeReceivablesSummary({
          seatIncreaseDebtTotalCents: 0,
          tenantsWithSeatIncreaseDebt: 0
        })
      })
    )

    const wrapper = await mountSuspended(dashboardPage)
    await flushPromises()

    const card = wrapper.find('.dashboard__kpi--seat-increase-debt')
    expect(card.find('.metric-card__value').text()).toBe('$0.00')
    expect(card.text()).toContain('Adeudo por aumento')
    expect(card.find('.metric-card__empty').exists()).toBe(false)
  })

  it('CA-8 — si la cartera falla, las dos tarjetas muestran su error con reintento', async () => {
    vi.spyOn(receivablesRepo, 'getReceivables').mockRejectedValue(new Error('boom'))

    const wrapper = await mountSuspended(dashboardPage)
    await flushPromises()

    expect(wrapper.find('.dashboard__kpi--receivables button').exists()).toBe(true)
    expect(wrapper.find('.dashboard__kpi--seat-increase-debt button').exists()).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/index.spec.ts
```

Expected: FAIL. `.dashboard__kpi--seat-increase-debt` no existe.

- [ ] **Step 3: Agregar los textos i18n**

En `app/pages/dashboard/domain/locales/dashboard.es.json`, agregar después de las llaves del vencido:

```json
  "db_receivables_label": "Cartera vencida",
  "db_receivables_hint": "con IVA · cobranza",
  "db_seat_increase_debt_label": "Adeudo por aumento",
  "db_seat_increase_debt_hint": "facturación pendiente",
```

- [ ] **Step 4: Exponer el total del adeudo desde el orquestador**

En `app/pages/dashboard/script.ts`, agregar el `computed` justo después de `receivablesTotal`:

```ts
    /**
     * Adeudo por aumento de toda la plataforma, ya formateado en pesos.
     *
     * Es el **segundo** número de deuda del tablero y vive separado del vencido
     * a propósito: el vencido es cobranza —el cliente ya nos debía y no pagó— y
     * este es facturación pendiente —el cliente creció y todavía no le emitimos
     * el cobro. Aquí no se calcula su suma, ni "de referencia": una cifra
     * combinada no corresponde a ninguna gestión real y llevaría a llamar a
     * cobrar a quien está al corriente (regla 1).
     *
     * Muestra `$0.00` cuando no hay ningún aumento pendiente: CA-7 pide un cero
     * explícito con su etiqueta, no el estado de vacío genérico de la tarjeta.
     */
    const seatIncreaseDebtTotal = computed<string>(() =>
      formatCentsAsMxn(receivables.summary.value?.seatIncreaseDebtTotalCents ?? 0)
    )
```

Actualizar `collectionsCaseCount` para que cuente las filas que la tabla realmente trae, y explicar por qué eso no es la suma prohibida:

```ts
    /**
     * Total de casos de cobranza para el contador de su pestaña: los renglones
     * del detalle de cartera —morosos y clientes al corriente con asientos sin
     * facturar— más las bajas que se fueron debiendo.
     *
     * Sale de `pagination.total`, que es el conteo del universo del detalle que
     * confirmó el servidor, y no de `summary.overdueTenants`, que cuenta solo
     * morosos: si contara solo morosos, el globo diría menos casos que renglones
     * tiene la tabla de al lado.
     *
     * Son conteos de casos, no importes: sumar cuántas conversaciones esperan en
     * la pestaña es distinto de sumar pesos de cobranza con pesos de facturación,
     * que sigue prohibido (regla 1). `null` mientras la cartera no haya cargado
     * con éxito, para que el contador no parpadee un cero falso.
     */
    const collectionsCaseCount = computed<number | null>(() => {
      if (!receivables.hasLoadedOnce.value || receivables.hasError.value) return null
      return receivables.pagination.value.total + receivables.canceled.value.length
    })
```

Y agregar `seatIncreaseDebtTotal` al objeto que devuelve el `setup`, junto a `receivablesTotal`:

```ts
      receivablesTotal,
      seatIncreaseDebtTotal,
```

- [ ] **Step 5: Pintar la segunda tarjeta**

En `app/pages/dashboard/index.vue`, dentro de `<TabPanel value="collections">`:

Quitar `dashboard__kpi--full` de las **dos** `<MetricCard>` del vencido (la de error y la de valor), para que cada tarjeta ocupe una celda del grid de dos columnas:

```html
                    <MetricCard
                      v-if="receivablesHasError"
                      class="dashboard__kpi dashboard__kpi--receivables"
```

```html
                    <MetricCard
                      v-else
                      class="dashboard__kpi dashboard__kpi--receivables"
```

Y agregar la tarjeta nueva inmediatamente después del cierre de la `<MetricCard>` del vencido (`</MetricCard>`) y antes del comentario de `<DashboardReceivables>`:

```html
                    <!-- El segundo número de la deuda, en su propia celda del
                         grid: adeudo por aumento de asientos. No comparte
                         tarjeta con el vencido, no lo acompaña de un total
                         combinado y su `hint` dice de qué conversación se trata
                         —facturar, no cobrar— para que la separación no dependa
                         de que quien lee conozca el modelo (regla 1). Comparte
                         el estado de error del bloque: el dato sale del mismo
                         viaje y su reintento es el mismo `load` (CA-8). -->
                    <MetricCard
                      v-if="receivablesHasError"
                      class="dashboard__kpi dashboard__kpi--seat-increase-debt"
                      :label="$t('db_seat_increase_debt_label')"
                      tone="danger"
                      has-error
                      :error-message="receivablesError"
                      :retry-label="$t('db_btn_retry')"
                      @retry="loadReceivables"
                    />

                    <!-- Cero explícito y no el estado `empty`: "no hay nada
                         pendiente de facturar" es un dato que se lee como
                         $0.00, no como un hueco (CA-7). -->
                    <MetricCard
                      v-else
                      class="dashboard__kpi dashboard__kpi--seat-increase-debt"
                      :label="$t('db_seat_increase_debt_label')"
                      :value="seatIncreaseDebtTotal"
                      :hint="$t('db_seat_increase_debt_hint')"
                      tone="info"
                      :loading="isReceivablesLoading"
                    />
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/index.spec.ts
```

Expected: PASS. Si algún test viejo de la tarjeta del vencido falla por el `--full` que se quitó, revisá que no lo estuviera usando como selector; el selector estable es `.dashboard__kpi--receivables`.

- [ ] **Step 7: Validación completa del landlord**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm validate
```

Expected: `lint`, `lint:styles`, `check:conventions`, `typecheck` y `test` en verde. `check:conventions` no debe reclamar ningún test faltante: no se creó ningún archivo de lógica nuevo.

- [ ] **Step 8: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/index.vue app/pages/dashboard/script.ts app/pages/dashboard/index.spec.ts app/pages/dashboard/domain/locales/dashboard.es.json
git commit -m "feat(dashboard): show the seat increase debt as a second, separate debt card"
```

---

## Task 8: QA — seeder y manual de prueba manual

**Files:**
- Modify: `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado)
- Create: `valanserh-landlord/docs/superpowers/plans/2026-09-04-adeudo-por-aumento-segundo-numero-qa-flujo.md` (no versionado)

**Interfaces:**
- Consumes de Tasks 1-7: el tablero completo, funcionando.
- Produces: un ambiente sembrado y un manual listo para que **una persona** lo recorra.

**Es un manual de frontend, no de API.** Lo que la HU entrega es lo que ve quien lleva la cobranza: dos tarjetas y una columna. El cambio del endpoint es la plomería, y las órdenes 5 y 6 —también fullstack— entregaron solo su `-qa-flujo.md`. Se sigue ese precedente.

**Constantes del proyecto** (tomadas del manual de la orden 6, `2026-09-03-detalle-cartera-por-tenant-y-canceladas-qa-flujo.md`, no inventadas):

| Constante | Valor |
|---|---|
| URL del tablero | `http://127.0.0.1:3000/dashboard` — **sin** prefijo `/es` |
| Menú lateral | **Dashboard** |
| Login | botón **Continuar con contraseña** → campos **Correo electrónico** y **Contraseña** → botón **Entrar** |
| Seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`, desde `gsti-rh-api` |
| Dominio de prueba | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

- [ ] **Step 1: Importar el modelo de cambios en el seeder**

En `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`, agregar el import junto a los demás de billing (después del de `BillingSubscription`, línea ~101):

```ts
import BillingSubscriptionChange, {
  type BillingSubscriptionChangeStatus,
  type BillingSubscriptionChangeType,
} from '#models/billing_subscription_change'
```

Y agregar la HU al encabezado del archivo, en la lista de historias:

```
 * USRH1788055613531 detalle de cartera por tenant y canceladas con adeudo +
 * USRH1788052455652 adeudo por aumento como segundo número de la deuda).
```

- [ ] **Step 2: Agregar los dos helpers de siembra**

Después de `seedReceivablesDetailQa` (que termina alrededor de la línea 1462), agregar:

```ts
/**
 * Empresa QA al corriente de pago, con su suscripción activa y el periodo
 * cerrando en el futuro. Es la base de los casos del adeudo por aumento: sin
 * nada vencido, lo único que puede meterla al detalle de cartera es el aumento.
 *
 * @param params - Slug e identidad de la empresa, y su total contratado en pesos.
 */
async function seedActiveSubscriptionQa(params: {
  slug: string
  name: string
  contractedTotal: number
}): Promise<void> {
  const plan = await BillingPlan.query()
    .where('billing_plan_name', 'QA Dashboard Plan')
    .firstOrFail()

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', plan.billingPlanId)
    .firstOrFail()

  const now = DateTime.utc()

  const businessUnit = await BusinessUnit.firstOrCreate(
    { businessUnitSlug: params.slug },
    {
      businessUnitName: params.name,
      businessUnitLegalName: `${params.name} SA de CV`,
      businessUnitActive: 1,
    },
  )

  const existingSub = await BillingSubscription.query()
    .where('business_unit_id', businessUnit.businessUnitId)
    .whereNull('billing_subscription_deleted_at')
    .first()

  if (existingSub) return

  await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: plan.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: params.contractedTotal,
    billingSubscriptionContractedTaxAmount: 0,
    billingSubscriptionContractedTotal: params.contractedTotal,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: null,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    // El periodo cierra en el futuro: está al corriente, no se le pasó nada.
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })
}

/**
 * Cuelga un cambio de asientos de la suscripción viva de una empresa ya
 * sembrada.
 *
 * Idempotente **por importe**: el seeder se corre muchas veces y duplicar el
 * cambio duplicaría el adeudo, que es justo el número que la prueba mide. Por
 * eso cada llamada usa un importe distinto dentro de la misma empresa.
 *
 * @param params - Empresa, importe prorrateado en centavos, y tipo y estado del cambio.
 */
async function seedSubscriptionChangeQa(params: {
  businessUnitSlug: string
  proratedAmountCents: number
  type?: BillingSubscriptionChangeType
  status?: BillingSubscriptionChangeStatus
}): Promise<void> {
  const businessUnit = await BusinessUnit.query()
    .where('business_unit_slug', params.businessUnitSlug)
    .firstOrFail()

  const subscription = await BillingSubscription.query()
    .where('business_unit_id', businessUnit.businessUnitId)
    .whereNull('billing_subscription_deleted_at')
    .firstOrFail()

  await BillingSubscriptionChange.firstOrCreate(
    {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingSubscriptionChangeProratedAmountCents: params.proratedAmountCents,
    },
    {
      businessUnitId: businessUnit.businessUnitId,
      billingSubscriptionChangeType: params.type ?? 'increase',
      billingSubscriptionChangeStatus: params.status ?? 'pending_payment',
      billingSubscriptionChangePreviousEmployees: 10,
      billingSubscriptionChangeNewEmployees: 15,
      billingSubscriptionChangeUnitAmount: 65,
      billingSubscriptionChangeDiscountPercent: 0,
      billingSubscriptionChangeTaxRate: 0.16,
      billingSubscriptionChangeSubtotal: 975,
      billingSubscriptionChangeTaxAmount: 156,
      billingSubscriptionChangeTotal: 1131,
      billingSubscriptionChangeEffectiveAt: null,
      billingSubscriptionChangeAppliedAt: null,
      billingSubscriptionChangeBillingPaymentId: null,
      billingSubscriptionChangeNotApplicableReason: null,
    },
  )
}
```

- [ ] **Step 3: Agregar la función de siembra de la HU**

Justo después de los dos helpers:

```ts
/**
 * USRH1788052455652 — adeudo por aumento como segundo número de la deuda.
 *
 * Cuatro casos, elegidos para cubrir el recorrido del manual:
 *   - QA Vencido Hasta 30 (reutilizada de la cartera vencida): se atrasó Y
 *     además creció. $5,800.00 vencido + $912.10 por facturar, en dos columnas.
 *     Es el caso que la HU narra: un renglón con tres datos que no se combinan.
 *   - QA Aumento Al Corriente: al corriente con asientos sin facturar. Entra al
 *     detalle con vencido en $0.00, sin días de atraso y sin tramo, y $2,500.00
 *     por facturar. Es el que no debe quedar marcado como moroso.
 *   - QA Aumento Doble: dos aumentos pendientes, $1,000.00 y $450.50. Su
 *     renglón debe mostrar la suma, $1,450.50, y no uno de los dos (regla 3).
 *   - QA Aumento Ya Aplicado: un aumento ya cobrado y una reducción pendiente.
 *     Ninguno de los dos es adeudo por aumento, así que esta empresa NO debe
 *     aparecer en el detalle: está al corriente y no debe nada.
 *
 * El vacío de la métrica (tarjeta y columna en cero) no se siembra: exigiría
 * dejar a toda la plataforma sin un solo aumento pendiente. Queda declarado como
 * no revisable en el manual.
 */
async function seedSeatIncreaseDebtQa(): Promise<void> {
  const platformAdminEmail = 'qa-adeudo-aumento-admin@gsti-tests.local'
  const person = await Person.firstOrCreate(
    { personEmail: platformAdminEmail },
    {
      personFirstname: 'QA',
      personLastname: 'Adeudo Aumento',
      personSecondLastname: 'Plataforma',
      personEmail: platformAdminEmail,
    },
  )

  const user = await User.query().where('user_email', platformAdminEmail).first()
  if (!user) {
    await User.create({
      userEmail: platformAdminEmail,
      userPassword: QA_PASSWORD,
      userActive: 1,
      roleId: 3,
      personId: person.personId,
      userEmailType: 'institutional',
      userPasswordSetAt: DateTime.utc(),
      isPlatformAdmin: true,
    })
  } else {
    user.userPassword = QA_PASSWORD
    user.userActive = 1
    user.userPasswordSetAt = DateTime.utc()
    user.isPlatformAdmin = true
    await user.save()
  }

  await seedActiveSubscriptionQa({
    slug: 'qa-aumento-al-corriente',
    name: 'QA Aumento Al Corriente',
    contractedTotal: 7000,
  })
  await seedActiveSubscriptionQa({
    slug: 'qa-aumento-doble',
    name: 'QA Aumento Doble',
    contractedTotal: 4000,
  })
  await seedActiveSubscriptionQa({
    slug: 'qa-aumento-ya-aplicado',
    name: 'QA Aumento Ya Aplicado',
    contractedTotal: 3000,
  })

  // El moroso que además creció: los dos números en el mismo renglón.
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-vencido-hasta30',
    proratedAmountCents: 91210,
  })

  // Al corriente con asientos sin facturar: solo facturación pendiente.
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-aumento-al-corriente',
    proratedAmountCents: 250000,
  })

  // Dos aumentos pendientes que se suman: 100000 + 45050 = 145050 ($1,450.50).
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-aumento-doble',
    proratedAmountCents: 100000,
  })
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-aumento-doble',
    proratedAmountCents: 45050,
  })

  // Negativos: un aumento ya cobrado y una reducción pendiente. Ninguno cuenta.
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-aumento-ya-aplicado',
    proratedAmountCents: 88800,
    status: 'applied',
  })
  await seedSubscriptionChangeQa({
    businessUnitSlug: 'qa-aumento-ya-aplicado',
    proratedAmountCents: 77700,
    type: 'decrease',
  })

  console.log('[qa-seeder] adeudo por aumento: un moroso que creció, dos al corriente y un negativo')
}
```

Y registrarla en `run()`, después de `seedReceivablesDetailQa()` (línea ~1056). El orden importa: depende de que `qa-vencido-hasta30` ya exista.

```ts
    await seedReceivablesDetailQa()
    await seedSeatIncreaseDebtQa()
```

- [ ] **Step 4: Correr el seeder y comprobar que sembró**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: entre la salida aparece `[qa-seeder] adeudo por aumento: un moroso que creció, dos al corriente y un negativo`. Correlo **dos veces**: la segunda no debe duplicar ningún importe (los helpers son idempotentes). Si el adeudo de **QA Aumento Doble** pasa de $1,450.50 a $2,901.00, la idempotencia se rompió.

- [ ] **Step 5: Escribir el manual**

Crear `valanserh-landlord/docs/superpowers/plans/2026-09-04-adeudo-por-aumento-segundo-numero-qa-flujo.md` con este contenido:

````markdown
# Prueba manual — El adeudo por aumento como segundo número de la deuda

**Problema:** Quien lleva la cobranza tenía un solo número para mirar lo que las empresas deben, y ese número le mentía. Cuando una empresa crece a media suscripción y agrega asientos, el sistema le genera un cobro pendiente por esos asientos. Ese cobro no es una empresa que dejó de pagar: es una factura que todavía no le hemos emitido. Metido en la misma bolsa que el vencido, el tablero reportaba morosos donde no los había y se terminaba llamando a cobrar a empresas que estaban al corriente.

**Solución:** En la pestaña **Cobranza** del tablero ahora hay **dos** tarjetas de deuda, lado a lado y claramente separadas: **Cartera vencida**, que es cobranza, y **Adeudo por aumento**, que es facturación pendiente. La tabla de abajo gana una columna con el adeudo de cada empresa, y empieza a mostrar también a las empresas que están al corriente pero tienen asientos sin facturar, que antes no aparecían porque no eran morosas.

Validar que los dos números vivan separados, que en ningún punto de la vista aparezca su suma, y que una empresa al corriente que creció no quede marcada como morosa.

---

## Glosario

- **Adeudo por aumento:** el dinero que una empresa nos debe porque agregó asientos a media suscripción y todavía no se le ha emitido ese cobro. Es facturación pendiente, no morosidad.
- **Vencido:** el dinero de una empresa cuya fecha de pago ya pasó sin que pagara. Es cobranza.
- **Asientos:** las plazas de empleado que una empresa tiene contratadas; es la cantidad sobre la que se calcula su precio.
- **Facturación pendiente:** un cobro que le corresponde a la empresa pero que todavía no le hemos emitido.
- **Tramo de antigüedad:** un grupo de adeudos que llevan vencidos un número parecido de días. Solo aplica al vencido.
- **Zona operativa:** el recuadro del tablero con pestañas de trabajo diario, debajo de la franja de tarjetas.

---

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Eso deja listo el usuario de plataforma de esta prueba, le agrega un aumento pendiente a una de las empresas morosas que ya estaban sembradas y crea tres empresas al corriente para los casos nuevos. Contraseña: **`password`**.

---

## 2. Usuarios

| | Correo | Contraseña | Qué debe pasar |
|---|---|---|---|
| **A** | `qa-adeudo-aumento-admin@gsti-tests.local` | `password` | Entra a la consola de plataforma y ve las dos tarjetas de deuda y la columna nueva |

No hay usuario B: dentro del panel de plataforma no hay permisos diferenciados, y el rechazo a quien no es administrador lo verifica el API, no este manual.

---

## 3. Dónde probar

Consola de plataforma — el tablero se abre al iniciar sesión y también desde el menú lateral, opción **Dashboard**.

URL: `http://127.0.0.1:3000/dashboard`

La dirección no lleva `/es`.

El bloque de esta prueba está en el recuadro de detalle operativo, pestaña **Cobranza** — es la que ya viene seleccionada al abrir el tablero, no hace falta darle clic a ninguna pestaña.

---

## 4. Usuario A — qué verificar

Inicia sesión con el Usuario A: botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**. Baja hasta el recuadro de detalle operativo; ya se abre en la pestaña **Cobranza**.

### Aviso de ambiente honesto

Esa pestaña trae también empresas de pruebas anteriores, así que este manual no pide "verifica que hay cinco renglones". Reconoce los renglones de esta prueba por el prefijo de su nombre: **QA Vencido** y **QA Aumento**. Lo que sí es verificable es lo que trae cada uno de esos renglones en sus columnas, y qué empresas no deben estar.

Lo mismo vale para la tarjeta de **Adeudo por aumento**: es el total de toda la plataforma, así que puede incluir aumentos pendientes de otras pruebas. No se pide un importe exacto ahí; se pide que no esté en cero, que no sea el mismo número que la otra tarjeta, y que diga de qué se trata.

### 4.1 Las dos tarjetas de arriba

1. Arriba de la tabla hay **dos** tarjetas de deuda, una al lado de la otra, cada una en su propio recuadro: **Cartera vencida** y **Adeudo por aumento**.
2. Debajo del número de **Cartera vencida** dice **con IVA · cobranza**.
3. Debajo del número de **Adeudo por aumento** dice **facturación pendiente**.
4. Las dos muestran importes distintos. La de adeudo no está en `$0.00` (el ambiente tiene tres empresas con aumentos pendientes).
5. **Negativo a comprobar a propósito:** en ninguna parte del recuadro —ni en una tercera tarjeta, ni debajo de las dos, ni al pie de la tabla— hay un número que sea la suma de las dos. Si ves un total combinado, aunque diga "de referencia", está mal: sumarlos produce una cifra que no sirve ni para cobrar ni para facturar.

### 4.2 La empresa que se atrasó y además creció

1. En la tabla, busca el renglón de **QA Vencido Hasta 30**.
2. Trae **$5,800.00** en la columna de **Monto vencido**, sus **días de atraso**, su etiqueta de tramo **1-30 días** y, en la columna nueva de **Adeudo por aumento**, **$912.10**.
3. Son cuatro datos distintos en cuatro celdas. **Ninguna celda del renglón muestra $6,712.10** (que sería $5,800.00 + $912.10). Si aparece ese número, alguien sumó los dos.

### 4.3 La empresa al corriente que agregó asientos

1. En la misma tabla aparece **QA Aumento Al Corriente** — una empresa que no debe nada vencido pero que creció.
2. Su columna de **Monto vencido** dice **$0.00**.
3. **No trae días de atraso ni etiqueta de tramo de antigüedad**: esas dos celdas se ven vacías (con un guion). Si trae un cero de atraso o una etiqueta de tramo, está mal: esa empresa no es morosa y no se le debe pintar como tal.
4. Su columna de **Adeudo por aumento** dice **$2,500.00**.
5. Al verla, queda claro que a esa empresa no se le llama para cobrar sino para facturar.

### 4.4 La empresa con dos aumentos pendientes

1. Busca **QA Aumento Doble**. También está al corriente: **$0.00** de vencido, sin días ni tramo.
2. Su columna de **Adeudo por aumento** dice **$1,450.50**.
3. Esa empresa tiene dos aumentos pendientes, de $1,000.00 y de $450.50. Si la columna muestra **$1,000.00** o **$450.50** en vez de la suma de los dos, está mal: el adeudo de una empresa es todo lo que tiene pendiente, no su último movimiento.

### 4.5 Quién no debe aparecer

1. **QA Aumento Ya Aplicado** no aparece en la tabla. Esa empresa pidió asientos y ya se le cobraron, y además tiene una reducción pendiente — ninguna de las dos cosas es adeudo por aumento. Está al corriente y no debe nada, así que no tiene por qué estar en una tabla de deuda.
2. Ninguno de los renglones **QA Baja** (las empresas que cancelaron debiendo, de la prueba anterior) se movió a la tabla de arriba: siguen en su propia tabla de **Canceladas con adeudo**, más abajo.

### 4.6 La leyenda de la tabla

Arriba de la tabla, debajo de su encabezado, hay una frase que dice que el monto vencido es cobranza, que el adeudo por aumento es facturación pendiente, y que **no se suman**. Debe estar visible siempre, también si la tabla estuviera vacía o con error.

### 4.7 Error y recuperación

1. Apaga el API con `Ctrl+C` en su terminal y recarga el tablero.
2. **Las dos** tarjetas y la tabla muestran, cada una por separado, su propio aviso de error con su botón **Reintentar** (comparten la misma consulta, así que fallan juntas).
3. Mientras tanto, la pestaña **Cuentas** y las tarjetas de la franja de arriba conservan sus números.
4. Vuelve a encender el API y usa **Reintentar** en cualquiera de ellas.
5. Las tres se llenan de nuevo sin recargar la página completa.

### 4.8 Estados no revisables con esta base sembrada

- **Tarjeta y columna en cero:** no se puede provocar aquí. Para ver la tarjeta de **Adeudo por aumento** en `$0.00` y la columna entera en ceros habría que dejar a toda la plataforma sin un solo aumento pendiente, y el seeder siembra tres a propósito para poder probar el resto del recorrido.
- **Paginación:** no revisable con esta base. La tabla de QA no llega a veinte renglones y el paginador solo aparece cuando hay más de una página.

---

## 5. Checklist

- [ ] La opción **Dashboard** abre `http://127.0.0.1:3000/dashboard` sin agregar `/es`
- [ ] En la pestaña **Cobranza** hay dos tarjetas de deuda lado a lado, cada una en su propio recuadro
- [ ] **Cartera vencida** dice **con IVA · cobranza** debajo de su número
- [ ] **Adeudo por aumento** dice **facturación pendiente** debajo de su número, y no está en `$0.00`
- [ ] En ningún lugar del recuadro hay un número que sea la suma de las dos tarjetas
- [ ] La tabla tiene una columna **Adeudo por aumento**, además de **Monto vencido**
- [ ] **QA Vencido Hasta 30** muestra $5,800.00 vencido, sus días de atraso, tramo **1-30 días** y $912.10 de adeudo, en celdas distintas
- [ ] Ninguna celda de **QA Vencido Hasta 30** muestra $6,712.10
- [ ] **QA Aumento Al Corriente** aparece en la tabla con $0.00 de vencido y $2,500.00 de adeudo
- [ ] **QA Aumento Al Corriente** no trae días de atraso ni etiqueta de tramo de antigüedad
- [ ] **QA Aumento Doble** muestra $1,450.50 de adeudo, no $1,000.00 ni $450.50
- [ ] **QA Aumento Ya Aplicado** no aparece en la tabla
- [ ] Ningún renglón **QA Baja** se movió a la tabla de arriba
- [ ] La tabla trae la frase de que el vencido es cobranza, el adeudo es facturación pendiente y no se suman
- [ ] Con el API apagado, las dos tarjetas y la tabla muestran su propio error y **Reintentar**, y el resto del tablero conserva sus números
- [ ] Al volver a encender el API, **Reintentar** llena las tres sin recargar la página
- [ ] Se deja asentado que la tarjeta y la columna en cero no se pueden revisar con esta base
- [ ] Se deja asentado que la paginación no se puede revisar con esta base
````

- [ ] **Step 6: Levantar el ambiente y entregar**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api && pnpm dev
```

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord && pnpm dev
```

**El recorrido lo camina una persona, no el agente.** No lances Playwright ni ninguna automatización de navegador para recorrer el manual: levanta los dos servidores, corre el seeder y entrega el manual listo. Ahí termina el trabajo del agente.

- [ ] **Step 7: Commit**

Ni el seeder ni el manual se versionan (`docs/superpowers/*` está en el `.gitignore` del landlord; el seeder está excluido vía `.git/info/exclude`). Confirma que `git status` no los lista en ninguno de los dos repos:

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api && git status --short
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord && git status --short
```

Expected: limpio en los dos. Si alguno aparece, **no lo commitees**: agrégalo a la exclusión local.

---

## Cierre

- [ ] **API en verde de punta a punta**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint && node ace test
```

- [ ] **Landlord en verde de punta a punta**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm validate
```

- [ ] **Manual de QA entregado y ambiente arriba** — Task 8. El recorrido lo camina una persona, no el agente.

- [ ] **Los ocho criterios de aceptación, cotejados uno por uno**

| CA | Dónde se verifica |
|---|---|
| CA-1 · campo propio | `platform_receivables_metrics.spec.ts` (CA-1) + `receivables.repository.spec.ts` + `receivables.helpers.spec.ts` |
| CA-2 · varios aumentos suman | `platform_receivables_metrics.spec.ts` (CA-2) |
| CA-3 · al corriente sin marcas | `platform_receivables_metrics.spec.ts` (3 tests) + `receivables.repository.spec.ts` + `dashboardReceivables/index.spec.ts` |
| CA-4 · total de plataforma | `platform_receivables_metrics.spec.ts` (CA-4) |
| CA-5 · borrados fuera, desactivado dentro | `platform_receivables_metrics.spec.ts` (3 tests) |
| CA-6 · dos números, nunca uno | `dashboard/index.spec.ts` (3 tests) + `dashboardReceivables/index.spec.ts` (2 tests) |
| CA-7 · vacío explícito en cero | `dashboard/index.spec.ts` + `dashboardReceivables/index.spec.ts` + `receivables.repository.spec.ts` |
| CA-8 · error del bloque | `dashboard/index.spec.ts` (CA-8) |

Los ocho se cotejan además a ojo en el recorrido del manual (Task 8), salvo el vacío en cero de CA-7, que no se puede provocar con la base sembrada y queda declarado como no revisable ahí. En automático sí está cubierto.

- [ ] **Escalar a Wilvardo en la descripción del PR**

Dos puntos, los dos declarados arriba en "Drift verificado contra el spec":

1. **`meta.total` cambió de semántica.** Pasó de `resumen.tenantsVencidos` a contar el universo de filas del detalle. Es forzoso: sin eso, CA-3 y CA-4 no pueden ser verdaderos al mismo tiempo. Aditivo para quien lee importes, no aditivo para quien cuenta filas.
2. **La segunda tarjeta quedó en la pestaña de Cobranza, no en la franja ejecutiva.** El spec pedía la franja; la orden 6 ya había movido la tarjeta del vencido a la pestaña y dejó un test que lo exige. Las dos tarjetas están juntas, separadas y en celdas distintas del grid, que es lo que CA-6 pide.

Y una confirmación de diseño: **la columna nueva entró en el `<DataTable>` sin rediseñar la zona**, con el scroll horizontal que el bloque ya tenía (supuesto del spec, "se confirma en la revisión visual con Wilvardo").
