# MRR actual neto y proyectado en la franja ejecutiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**HU:** USRH1788052455653 · **Capability:** CAP-07-09-10 · **Orden:** 8
**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1788052455653.md`

**Goal:** Publicar el ingreso mensual recurrente actual neto de la plataforma y, como número aparte, el proyectado de las suscripciones en prueba, en un endpoint nuevo y en dos tarjetas de la franja ejecutiva del tablero, sin que en ningún punto exista su suma.

**Architecture:** En el API nace `GET /api/platform/metrics/mrr`: un servicio que suma la columna congelada `billing_subscription_contracted_subtotal` (pesos, sin IVA) sobre dos universos —`active` y `trialing`— y publica cada suma con su conteo, más el reparto por moneda y la fecha de negocio del cálculo. El universo y sus filtros viven aislados de la proyección del resultado para que la orden 16 pueda agregarle un `groupBy` sin reescribir la regla del neto. En el landlord nace el sub-slice de MRR (interface, repositorio, composable) y, con él, la fachada `use-dashboard-blocks.ts`, que pasa a ser el único lugar donde se construyen los bloques del tablero; el `script.ts` deja de instanciar composables y solo orquesta lecturas.

**Tech Stack:** `gsti-rh-api` (AdonisJS 6 + Lucid + Knex raw + Japa) · `valanserh-landlord` (Nuxt 4 + Vue 3 + PrimeVue + Vitest + `@nuxt/test-utils`)

**Repos y rama:** los dos repos ya están en `feature/USRH1788052455653-mrr-actual-neto-proyectado`, que arranca del trabajo de la orden 7. No se crea rama nueva y no se hace merge de nada antes de empezar.

- `gsti-rh-api` → `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`
- `valanserh-landlord` → `/Users/noeabelvargaslopez/Documents/projects/valanserh-landlord`

---

## Global Constraints

- TypeScript estricto en los dos repos. **Cero `any`**, cero `@ts-ignore`, cero `as unknown as`.
- Código y nombres en inglés; JSDoc y comentarios en español. Los **nombres de campo del contrato del API van en español** (`mrrActualNetoCents`, `suscripcionesActivas`, `monedas`), como el resto del área de métricas. El sufijo `Cents` es obligatorio en todo campo de dinero.
- Nombres de archivo: `snake_case` en el API, `kebab-case` en el landlord.
- **El cálculo lee la columna congelada `billing_subscription_contracted_subtotal` y nada más.** Si en la consulta aparece `billing_subscription_discount_percent`, está mal: el catálogo ya admite descuentos que no son porcentaje (`DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'`) y recalcular reportaría precio de lista **sin fallar**. Riesgo silencioso, es la regla 2.
- **`billing_subscription_contracted_subtotal` está en pesos** (`decimal(12,2)`), al revés que las columnas `*_cents` de la cartera. Se convierte a centavos **en SQL** con `CAST(ROUND(col * 100) AS SIGNED)`, no con aritmética de punto flotante en JavaScript.
- **No existe ni existirá un campo, celda, tarjeta, pie o etiqueta que sea la suma del actual y el proyectado.** Es la regla 3 y es criterio de aceptación negativo (CA-3, CA-7).
- **No se colapsa por tenant.** Se suman todas las suscripciones del estado, no una por empresa (regla 5). La regla de "mejor suscripción por empresa" del listado de tenants es regla de despliegue, no de ingreso, y no se reutiliza aquí.
- `past_due` queda **fuera** de las dos cifras (regla 4). La consecuencia —el MRR baja cuando alguien cae en morosidad y sube cuando se pone al corriente— se escribe en el JSDoc del servicio y en el `@swagger`.
- Las consultas crudas **no** pasan por el hook de `SoftDeletes`: `billing_subscription_deleted_at IS NULL` **y** `business_unit_deleted_at IS NULL` van a mano, sobre cada tabla que toca la consulta (regla 6).
- `business_unit_active = 0` **no excluye**: manda el estado de la suscripción (regla 6).
- **Ninguna respuesta del API serializa un modelo Lucid.** Prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`. Cada campo se arma a mano con casteo explícito sobre un `select` que nombra columnas. La respuesta es un agregado: no publica tenants, `business_unit_id`, `billing_subscription_id`, `rfc`, perfil fiscal ni `billingEmail`.
- Esta rebanada **no migra**, no agrega columnas y **no escribe** nada. Solo lectura, resuelta en el momento de la consulta: sin caché, sin materialización y sin proceso programado (regla 8).
- **Se consume la superficie de error de métricas de la orden 5** (`platform_metric_error_codes.ts`, `platform_metric_service_error.ts`, `platform_metric_api_error.ts`), que ya está integrada en la rama. Se le **agrega** el juego de textos del MRR; no se crea un catálogo paralelo ni se renombra nada existente.
- **No se crea validador.** El endpoint no recibe entrada: no hay 422 propio y `app/validators/platform_metric.ts` no se toca.
- Landlord: i18n **solo español**, sin literales en el template. Tokens del design system, **ningún color literal** (stylelint lo bloquea).
- Landlord: todo `*.helpers.ts`, `*.repository.ts` y `use-*.ts` necesita su `.spec.ts` colocado o `check:conventions` sale con exit 1.
- Landlord: el bloque de MRR no usa `store/general.ts` (`showLoader`/`hideLoader`); un loader global contradice el aislamiento por bloque. Los toasts apilados de `useApi` se aceptan en v1: arreglar `useApi` es deuda declarada fuera del set.
- Landlord: no se persiste ningún agregado de negocio en `localStorage`, `sessionStorage`, `IndexedDB` ni cookie, y no se lee `isPlatformAdmin` de la sesión para decidir qué pintar. El 403 se trata como error del bloque, con reintento.

---

## Drift verificado contra el spec

Se validaron los anclajes del spec contra el código de las dos ramas. Cinco cosas no coinciden y el plan sigue el código, no el spec.

1. **Las líneas de los anclajes del API están corridas.** El spec cita `platform_tenant_routes.ts:13-20`, `platform_tenant_controller.ts:164-171`, `platform_tenant_service.ts:518-546`, `billing_payment_service.ts:626-647` y `platform_device_service.ts:152-154`. Los patrones son los que el spec describe, pero viven en otras líneas (`platform_tenant_controller.ts:157-171`, `platform_tenant_service.ts:624-658`, `billing_payment_service.ts:621-657`, `platform_device_service.ts:177-216`). Drift trivial: se sigue el patrón, no el número de línea.

2. **El molde real es el área de métricas, no el de tenants.** El spec manda espejar `platform_tenant_*`, pero la orden 5 ya dejó en la rama un hermano exacto de lo que hay que construir: `start/routes/platform_receivable_routes.ts`, `platform_receivable_controller.ts` y `platform_receivable_service.ts`, que ya consumen la superficie `PLT.MET.*` y ya resuelven la conversión pesos→centavos en SQL (`CONTRACTED_TOTAL_CENTS_SQL`). **Se espeja el hermano de métricas.** Seguir tenants significaría reintroducir el helper de error cableado a un solo título, que la orden 5 corrigió a propósito.

3. **El `key` del 500 no es `error-inesperado`.** La tabla de verificación técnica del spec pide `key: "error-inesperado"`, pero la superficie compartida —mergeada por la orden 5— define la convención en su propio docblock: el `key` es el slug kebab del título, y el `code` viaja aparte. `RECEIVABLES_METRIC_ERROR_TEXTS` la cumple (`error-inesperado-al-obtener-la-cartera-vencida`). **Decisión:** el MRR usa `error-inesperado-al-obtener-el-ingreso-mensual-recurrente`, coherente con el área. El `code` se respeta literal (`PLT.MET.SYS_UNHANDLED`), que es el campo que el cliente consume. **Anotar en el PR para Wilvardo** como corrección de la tabla del spec, no como cambio de contrato: el landlord no lee `key` en ningún punto.

4. **La tarjeta de vencido ya no vive en la franja ejecutiva.** CA-7 pide que "la tarjeta de vencido de la orden 5 declare su propia base" para que no se confunda con las del MRR. La orden 6 la movió entera a la pestaña **Cobranza** de la zona operativa, y dejó un test que lo exige (`index.spec.ts:922` asserta que `.dashboard__executive .dashboard__kpi--receivables` no existe). Su `hint` ya dice `con IVA · cobranza`. **No se toca nada de la cartera:** CA-7 se cumple solo, y con más holgura de la que pedía, porque las bases ni comparten banda.

5. **El orden dentro de la franja y el título de la banda.** La HU es explícita: el MRR es "la primera cifra que se ve al abrir el panel". Hoy la franja abre con la cartera de empresas y su título es `db_executive_title` = "Cartera de empresas". **Decisión:** las dos tarjetas de MRR encabezan `.dashboard__kpis` y el título de la banda pasa a "Panorama del negocio", porque la banda dejó de ser solo cartera. Se conserva la clave i18n; el literal "Cartera de empresas" no está asertado en ningún test (solo vive en el locale). Consecuencia mecánica: seis selectores de `index.spec.ts` que hoy dicen "la primera tarjeta de la franja" para referirse al total de la cartera pasan a nombrar lo que quieren decir (Task 6, paso 1).

Además, tres decisiones que el spec deja abiertas y este plan cierra:

6. **El grupo de rutas usa el prefijo `/api/platform/metrics`, con la ruta `/mrr` adentro.** Es lo que el spec fija en la sección de contrato, y es lo que permite que la orden 9 agregue `mrr-series` al mismo grupo sin abrir otro. Convive sin conflicto con el grupo de la orden 5, que sí prefija hasta `/receivables`.

7. **El agregado va en dos consultas de una fila cada una, no en un `GROUP BY status`.** Dos consultas nombradas (`active` y `trialing`) hacen imposible que el proyectado se cuele en el actual por un bug de ramificación: cada cifra tiene su propia llamada y su propio filtro. El `GROUP BY` se reserva para el reparto por moneda, donde sí hay N filas.

8. **`monedas` se ordena por código, ascendente.** El contrato no lo pide, pero un arreglo sin orden estable haría que la advertencia multimoneda cambie de redacción entre dos cargas idénticas.

---

## File Structure

### `gsti-rh-api`

| Archivo | Responsabilidad |
|---|---|
| **EDITAR** `app/constants/platform_metric_error_codes.ts` | Agregar `MRR_METRIC_ERROR_TEXTS`. Sin códigos nuevos: `VAL_INPUT` y `SYS_UNHANDLED` ya existen. |
| **CREAR** `app/services/platform_mrr_service.ts` | El cálculo canónico del MRR. Universo y filtros aislados de la proyección del resultado. Interfaces de retorno exportadas arriba. |
| **CREAR** `tests/functional/platform_mrr_service.spec.ts` | Reglas de negocio del agregado: CA-1 a CA-6 y CA-10, contra base real. |
| **CREAR** `app/controllers/platform_mrr_controller.ts` | Envelope `{ type, data }`, `try/catch` → `resolvePlatformMetricApiError`, `@swagger` + anotaciones AdonisJS en español. |
| **CREAR** `start/routes/platform_mrr_routes.ts` | Grupo con prefijo `/api/platform/metrics` y los dos middlewares en orden. |
| **EDITAR** `start/routes.ts` | La línea de `import` del archivo de rutas. **A mano.** Sin ella el endpoint responde 404 y nada lo avisa. |
| **CREAR** `tests/functional/platform_mrr_metrics.spec.ts` | Contrato HTTP: 200, forma exacta del payload, 403 sin `code`, 401, y la ausencia de 422. |

`gsti-rh-api` no tiene `check-conventions.mjs`: no hay `.spec.ts` obligatorios por archivo en este repo. **Sin migraciones.**

### `valanserh-landlord`

| Archivo | Responsabilidad |
|---|---|
| **CREAR** `app/pages/dashboard/domain/mrr.interface.ts` | Tipos raw del contrato + tipos de dominio del slice. Sin lógica. |
| **CREAR** `app/pages/dashboard/infrastructure/mrr.repository.ts` (+ `.spec.ts`) | Un viaje al endpoint y el mapeo raw → dominio. Propaga el error sin atraparlo. |
| **CREAR** `app/pages/dashboard/application/use-mrr.ts` (+ `.spec.ts`) | Estado del bloque: `snapshot`, banderas y `load`. Aísla su fallo. |
| **CREAR** `app/pages/dashboard/application/use-dashboard-blocks.ts` (+ `.spec.ts`) | Fachada: único lugar donde se construyen los cuatro bloques del tablero, y `loadAll` que los dispara en paralelo. |
| **EDITAR** `app/pages/dashboard/script.ts` | Deja de instanciar composables: consume la fachada. Agrega las lecturas derivadas del MRR. |
| **EDITAR** `app/pages/dashboard/index.vue` | Las dos `<MetricCard>` al frente de la franja, con sus cinco estados y la advertencia multimoneda. |
| **EDITAR** `app/pages/dashboard/style.scss` | Celdas de las dos tarjetas y estilo de la línea de advertencia. |
| **EDITAR** `app/pages/dashboard/domain/locales/dashboard.es.json` | Etiquetas, `hint`, vacío, error y advertencia del MRR; título nuevo de la banda. |
| **EDITAR** `app/pages/dashboard/index.spec.ts` | Mock por omisión del bloque nuevo, desacople de los seis selectores posicionales y los tests de CA-7 a CA-10. |

**Sin componentes nuevos:** `<MetricCard>` (orden 1) y `formatCentsAsMxn` (orden 4) se consumen tal como están.

### QA (no versionado, Task 7)

| Archivo | Responsabilidad |
|---|---|
| **EDITAR** `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Usuario de plataforma de esta prueba y las tres suscripciones del recorrido. Es el seeder que ya usan los demás paneles: **no se crea uno nuevo**. |
| **CREAR** `valanserh-landlord/docs/superpowers/plans/2026-09-08-mrr-actual-neto-y-proyectado-qa-flujo.md` | Manual de prueba manual, para recorrer en el navegador. |

Los dos están fuera de control de versiones: `docs/superpowers/*` está en el `.gitignore` del landlord y el seeder está excluido vía `.git/info/exclude`.

---

## Task 1: API — el agregado de MRR (servicio + textos de error)

**Files:**
- Modify: `gsti-rh-api/app/constants/platform_metric_error_codes.ts` (agregar al final del archivo)
- Create: `gsti-rh-api/app/services/platform_mrr_service.ts`
- Test: `gsti-rh-api/tests/functional/platform_mrr_service.spec.ts`

**Interfaces:**
- Consumes: `PlatformMetricErrorTexts` de `app/constants/platform_metric_error_codes.ts`; `toBusinessDateString()` de `app/utils/business_date.ts`; `db` de `@adonisjs/lucid/services/db`.
- Produces: `MRR_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts`; `export interface MrrCurrencySlice { codigo: string; suscripciones: number }`; `export interface PlatformMrrSnapshot { mrrActualNetoCents: number; suscripcionesActivas: number; mrrProyectadoTrialCents: number; suscripcionesEnPrueba: number; monedas: MrrCurrencySlice[]; calculadoAl: string }`; `export default class PlatformMrrService` con el método público `async getMrrSnapshot(): Promise<PlatformMrrSnapshot>`. Los consume el controlador (Task 2).

**Por qué el test es funcional y no unitario:** el servicio no tiene lógica separable de la consulta — su valor entero es qué filas suma y qué filas no. Un test con la base mockeada validaría el mock. La suite `functional` es la que arranca con base real y ya instancia servicios directamente en este repo (`billing_payment_detail.spec.ts`, `platform_receivables_metrics.spec.ts`).

**Por qué las aserciones son por diferencia:** la base de pruebas es compartida y ya trae suscripciones activas y en prueba de otros fixtures. Un total absoluto sería verde hoy y rojo mañana. Cada test toma una foto antes de crear su fixture y asserta el delta.

- [ ] **Step 1: Agregar los textos de error de la métrica**

Al final de `gsti-rh-api/app/constants/platform_metric_error_codes.ts`, después de `RECEIVABLES_METRIC_ERROR_TEXTS`:

```ts
/**
 * Textos del ingreso mensual recurrente (USRH1788052455653).
 *
 * El `key` es el slug kebab del título, como manda la convención de esta
 * superficie. La tabla del spec proponía `error-inesperado` a secas; se
 * descartó por consistencia con el área — el `code` es el campo que el cliente
 * consume y ése sí va literal.
 */
export const MRR_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener el ingreso mensual recurrente',
  failureKey: 'no-fue-posible-obtener-el-ingreso-mensual-recurrente',
  unhandledTitle: 'Error inesperado al obtener el ingreso mensual recurrente',
  unhandledKey: 'error-inesperado-al-obtener-el-ingreso-mensual-recurrente',
}
```

- [ ] **Step 2: Write the failing test**

Crear `gsti-rh-api/tests/functional/platform_mrr_service.spec.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription, { type BillingSubscriptionStatus } from '#models/billing_subscription'
import BillingCatalogService from '#services/billing_catalog_service'
import PlatformMrrService from '#services/platform_mrr_service'

/**
 * USRH1788052455653 — reglas del agregado de MRR de plataforma.
 *
 * Las cifras se verifican por diferencia contra una foto previa: la base de
 * pruebas es compartida y ya trae suscripciones activas y en prueba de otros
 * fixtures, así que un total absoluto sería verde hoy y rojo mañana.
 */

interface MrrFixture {
  planId: number
  stamp: number
  suffix: string
  status: BillingSubscriptionStatus
  /** Importe contratado SIN IVA, en pesos. Es la columna congelada que el MRR suma. */
  contractedSubtotal: number
  /** Precio unitario congelado. Con descuento queda por arriba de `contractedSubtotal / asientos`. */
  contractedUnitAmount?: number
  contractedEmployees?: number
  /** Solo para probar que NO se usa: el cálculo jamás lo lee. */
  discountPercent?: number
  currency?: string
  businessUnitActive?: number
  businessUnitDeleted?: boolean
  subscriptionDeleted?: boolean
  /**
   * `false` deja el candado `billing_subscription_live_business_unit_id` en NULL.
   * Es la única forma de tener dos activas en la misma empresa: la columna
   * espejo es UNIQUE y nullable, así que dos NULL conviven (CA-5).
   */
  holdsLiveLock?: boolean
  /** Reusar una empresa ya creada en lugar de crear otra. */
  businessUnitId?: number
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788052455653',
    billingPlanProvider: 'manual',
  })

  await BillingPlanPrice.create({
    billingPlanId: plan.billingPlanId,
    billingPlanPriceAmount: 65,
    billingPlanPriceCurrency: 'MXN',
    billingPlanPriceTaxRate: 0.16,
    billingPlanPriceTrialDays: 7,
    billingPlanPriceEffectiveFrom: '2025-01-01',
    billingPlanPriceStripePriceId: null,
    billingPlanPriceProvider: 'manual',
  })

  await BillingVolumeTier.create({
    billingPlanId: plan.billingPlanId,
    billingVolumeTierMinEmployees: 1,
    billingVolumeTierDiscountPercent: 0,
  })

  await catalog.publishPlan(plan.billingPlanId)
  return plan.billingPlanId
}

/** Crea (o reusa) empresa y le cuelga una suscripción con el trato congelado del caso. */
async function createMrrSubscription(
  fixture: MrrFixture
): Promise<{ buId: number; subId: number }> {
  const now = DateTime.utc()

  let businessUnitId = fixture.businessUnitId
  let businessUnit: BusinessUnit | null = null

  if (businessUnitId === undefined) {
    businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Mrr BU ${fixture.suffix} ${fixture.stamp}`
    businessUnit.businessUnitSlug = `mrr-bu-${fixture.suffix}-${fixture.stamp}`
    businessUnit.businessUnitLegalName = `Mrr Legal ${fixture.suffix} ${fixture.stamp}`
    businessUnit.businessUnitActive = fixture.businessUnitActive ?? 1
    await businessUnit.save()
    businessUnitId = businessUnit.businessUnitId
  }

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', fixture.planId)
    .firstOrFail()

  const subtotal = fixture.contractedSubtotal
  const taxAmount = Math.round(subtotal * 0.16 * 100) / 100

  const subscription = await BillingSubscription.create({
    businessUnitId,
    billingPlanId: fixture.planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: fixture.status,
    billingSubscriptionContractedUnitAmount: fixture.contractedUnitAmount ?? 65,
    billingSubscriptionContractedEmployees: fixture.contractedEmployees ?? 10,
    billingSubscriptionDiscountPercent: fixture.discountPercent ?? 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: fixture.currency ?? 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: subtotal,
    billingSubscriptionContractedTaxAmount: taxAmount,
    billingSubscriptionContractedTotal: subtotal + taxAmount,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: fixture.status === 'trialing' ? now.plus({ days: 7 }) : null,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId:
      (fixture.holdsLiveLock ?? true) ? businessUnitId : null,
  })

  if (fixture.subscriptionDeleted) {
    await subscription.delete()
  }
  if (fixture.businessUnitDeleted && businessUnit) {
    await businessUnit.delete()
  }

  return { buId: businessUnitId, subId: subscription.billingSubscriptionId }
}

async function cleanupFixtures(businessUnitIds: number[], planIds: number[]): Promise<void> {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await subscription.forceDelete()
    }
    await BusinessUnit.query().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group('PlatformMrrService.getMrrSnapshot', (group) => {
  const service = new PlatformMrrService()
  let planId = 0
  const businessUnitIds: number[] = []

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnitIds, [planId])
  })

  test('CA-1 — una activa suma su subtotal congelado en centavos y su conteo', async ({
    assert,
  }) => {
    const before = await service.getMrrSnapshot()

    const created = await createMrrSubscription({
      planId,
      stamp: Date.now(),
      suffix: 'ca1',
      status: 'active',
      contractedSubtotal: 5000,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 500000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 1)
    assert.match(after.calculadoAl, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('CA-2 — la activa con descuento aporta el importe sellado, no el precio de lista', async ({
    assert,
  }) => {
    const before = await service.getMrrSnapshot()

    // Lista: 10 asientos × $650.00 = $6,500.00. Sellado con descuento: $5,000.00.
    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 1,
      suffix: 'ca2',
      status: 'active',
      contractedSubtotal: 5000,
      contractedUnitAmount: 650,
      contractedEmployees: 10,
      discountPercent: 23.0769,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 500000)
    assert.notEqual(after.mrrActualNetoCents - before.mrrActualNetoCents, 650000)
  })

  test('CA-2 — el cálculo no menciona el porcentaje de descuento en ningún punto', async ({
    assert,
  }) => {
    const source = await readFile(
      new URL('../../app/services/platform_mrr_service.ts', import.meta.url),
      'utf8'
    )

    // El riesgo es silencioso: recalcular desde el porcentaje reportaría precio
    // de lista sin fallar, porque el catálogo admite descuentos que no son
    // porcentaje (`fixed_amount`, `unit_price`).
    assert.notInclude(source, 'discount_percent')
    assert.notInclude(source, 'DiscountPercent')
  })

  test('CA-3 — la de prueba va al proyectado y no entra al actual', async ({ assert }) => {
    const before = await service.getMrrSnapshot()

    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 2,
      suffix: 'ca3',
      status: 'trialing',
      contractedSubtotal: 2000,
    })
    businessUnitIds.push(created.buId)

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrProyectadoTrialCents - before.mrrProyectadoTrialCents, 200000)
    assert.equal(after.suscripcionesEnPrueba - before.suscripcionesEnPrueba, 1)
    assert.equal(after.mrrActualNetoCents, before.mrrActualNetoCents)
    assert.equal(after.suscripcionesActivas, before.suscripcionesActivas)
  })

  test('CA-3 — el resultado no expone ningún campo que sea la suma de las dos cifras', async ({
    assert,
  }) => {
    const snapshot = await service.getMrrSnapshot()
    const suma = snapshot.mrrActualNetoCents + snapshot.mrrProyectadoTrialCents

    assert.deepEqual(Object.keys(snapshot).sort(), [
      'calculadoAl',
      'monedas',
      'mrrActualNetoCents',
      'mrrProyectadoTrialCents',
      'suscripcionesActivas',
      'suscripcionesEnPrueba',
    ])
    assert.notInclude(Object.values(snapshot), suma)
  })

  test('CA-4 — al caer en past_due el actual baja exactamente ese importe', async ({ assert }) => {
    const created = await createMrrSubscription({
      planId,
      stamp: Date.now() + 3,
      suffix: 'ca4',
      status: 'active',
      contractedSubtotal: 3000,
    })
    businessUnitIds.push(created.buId)

    const conActiva = await service.getMrrSnapshot()

    const subscription = await BillingSubscription.findOrFail(created.subId)
    subscription.billingSubscriptionStatus = 'past_due'
    await subscription.save()

    const conMorosa = await service.getMrrSnapshot()

    assert.equal(conActiva.mrrActualNetoCents - conMorosa.mrrActualNetoCents, 300000)
    assert.equal(conActiva.suscripcionesActivas - conMorosa.suscripcionesActivas, 1)
    // El importe de la morosa se reporta en la cartera vencida, no aquí.
    assert.equal(conMorosa.mrrProyectadoTrialCents, conActiva.mrrProyectadoTrialCents)
  })

  test('CA-5 — un tenant con dos activas aporta las dos, no la mejor', async ({ assert }) => {
    const before = await service.getMrrSnapshot()
    const stamp = Date.now() + 4

    const primera = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca5',
      status: 'active',
      contractedSubtotal: 4000,
    })
    businessUnitIds.push(primera.buId)

    // Segunda activa de la MISMA empresa, sin el candado de suscripción viva.
    await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca5-bis',
      status: 'active',
      contractedSubtotal: 1500,
      businessUnitId: primera.buId,
      holdsLiveLock: false,
    })

    const after = await service.getMrrSnapshot()

    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 550000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 2)
    // La regla de "mejor suscripción por empresa" del listado daría 400000.
    assert.notEqual(after.mrrActualNetoCents - before.mrrActualNetoCents, 400000)
  })

  test('CA-6 — borrados fuera; empresa desactivada dentro', async ({ assert }) => {
    const before = await service.getMrrSnapshot()
    const stamp = Date.now() + 5

    const subBorrada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-sub',
      status: 'active',
      contractedSubtotal: 8000,
      subscriptionDeleted: true,
    })
    businessUnitIds.push(subBorrada.buId)

    const empresaBorrada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-bu',
      status: 'active',
      contractedSubtotal: 9000,
      businessUnitDeleted: true,
    })
    businessUnitIds.push(empresaBorrada.buId)

    const desactivada = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca6-off',
      status: 'active',
      contractedSubtotal: 1000,
      businessUnitActive: 0,
    })
    businessUnitIds.push(desactivada.buId)

    const after = await service.getMrrSnapshot()

    // Solo la desactivada suma: manda el estado de la suscripción, no el de la empresa.
    assert.equal(after.mrrActualNetoCents - before.mrrActualNetoCents, 100000)
    assert.equal(after.suscripcionesActivas - before.suscripcionesActivas, 1)
  })

  test('CA-10 — el reparto por moneda cuenta activas y en prueba, ordenado por código', async ({
    assert,
  }) => {
    const stamp = Date.now() + 6

    const enUsd = await createMrrSubscription({
      planId,
      stamp,
      suffix: 'ca10',
      status: 'active',
      contractedSubtotal: 1000,
      currency: 'USD',
    })
    businessUnitIds.push(enUsd.buId)

    const snapshot = await service.getMrrSnapshot()
    const codigos = snapshot.monedas.map((moneda) => moneda.codigo)

    assert.include(codigos, 'USD')
    assert.include(codigos, 'MXN')
    assert.deepEqual(codigos, [...codigos].sort())
    assert.isAtLeast(snapshot.monedas.length, 2)

    const usd = snapshot.monedas.find((moneda) => moneda.codigo === 'USD')
    assert.isDefined(usd)
    assert.isAtLeast(usd!.suscripciones, 1)
    assert.deepEqual(Object.keys(usd!).sort(), ['codigo', 'suscripciones'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_mrr_service
```

Expected: FAIL. No se puede resolver `#services/platform_mrr_service`.

- [ ] **Step 4: Write the implementation**

Crear `gsti-rh-api/app/services/platform_mrr_service.ts`:

```ts
import db from '@adonisjs/lucid/services/db'
import { toBusinessDateString } from '../utils/business_date.js'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

/** Cuántas suscripciones del universo del MRR están contratadas en una moneda. */
export interface MrrCurrencySlice {
  /** `billing_subscription_contracted_currency`, ISO-4217 de tres letras. */
  codigo: string
  suscripciones: number
}

/**
 * Las dos cifras de ingreso recurrente de la plataforma, cada una con su
 * conteo, más el reparto por moneda y la fecha de negocio del cálculo.
 *
 * **No hay ni habrá un campo que sea la suma de las dos** (regla 3): el actual
 * es lo que ya está contratado y activo, el proyectado es lo que sumaría si las
 * pruebas convierten. Presentarlas juntas produce un número que sobreestima el
 * ingreso.
 */
export interface PlatformMrrSnapshot {
  /** Suma del subtotal congelado (SIN IVA) de las suscripciones `active`, en centavos. */
  mrrActualNetoCents: number
  suscripcionesActivas: number
  /** Misma suma sobre `trialing`. Viaja aparte y JAMÁS dentro del actual. */
  mrrProyectadoTrialCents: number
  suscripcionesEnPrueba: number
  /** Honestidad multimoneda: más de un elemento significa que la suma cruza monedas. */
  monedas: MrrCurrencySlice[]
  /** Fecha de negocio del cálculo, `YYYY-MM-DD`. */
  calculadoAl: string
}

// ─── SQL compartido ───────────────────────────────────────────────────────────

/**
 * Subtotal contratado SIN IVA convertido a centavos enteros, en SQL.
 *
 * La conversión va en la consulta y no en JavaScript porque la columna es
 * `DECIMAL(12,2)`: multiplicar por 100 en JS y sumar sembraría error de punto
 * flotante en el total de toda la plataforma. En MySQL la aritmética sobre
 * `DECIMAL` es exacta y la suma termina siendo una suma de enteros. Ancla del
 * mismo cálculo en la cartera: `platform_receivable_service.ts`
 * (`CONTRACTED_TOTAL_CENTS_SQL`, que convierte el total CON IVA).
 */
const CONTRACTED_SUBTOTAL_CENTS_SQL =
  'CAST(ROUND(bs.billing_subscription_contracted_subtotal * 100) AS SIGNED)'

/** Los dos estados que el MRR mide. `past_due` y `canceled` quedan fuera (regla 4). */
const MRR_STATUSES = ['active', 'trialing'] as const

// ─── Servicio ─────────────────────────────────────────────────────────────────

/**
 * Ingreso mensual recurrente de la plataforma (USRH1788052455653).
 *
 * Es la definición canónica del MRR del producto: de aquí parten la serie
 * mensual y la concentración por grupo económico. Solo lectura: no escribe, no
 * abre transacción y se resuelve en el momento de la consulta — sin caché, sin
 * materialización y sin proceso programado (regla 8).
 *
 * ## Tres reglas que se prestan a que alguien las "corrija"
 *
 * 1. **Se lee la columna congelada, no se recalcula el neto.**
 *    `billing_subscription_contracted_subtotal` ya es precio unitario × asientos
 *    − descuento, sin IVA, y es la que gobierna el cobro: se sella al contratar
 *    y se vuelve a sellar en cada aumento de asientos
 *    (`billing_subscription_change_service.ts`). Reconstruirla desde
 *    `billing_subscription_discount_percent` reportaría **precio de lista sin
 *    fallar**, porque el catálogo ya admite descuentos que no son porcentaje
 *    (`DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'`). Es un
 *    riesgo silencioso: un ingreso sobreestimado que nadie detecta es peor que
 *    un error visible.
 *
 * 2. **`past_due` queda fuera, y el MRR baja cuando alguien cae en morosidad.**
 *    No es un bug: el importe de la morosa se reporta en la cartera vencida
 *    (`platform_receivable_service.ts`), y contarlo en las dos partes lo
 *    duplicaría. La consecuencia está asumida: el ingreso mensual baja cuando un
 *    cliente se atrasa y vuelve a subir cuando se pone al corriente. Los dos
 *    números se mueven en sentidos contrarios a propósito.
 *
 * 3. **Se suman todas las suscripciones del estado, no una por empresa.** El
 *    listado de tenants elige "la mejor suscripción por empresa"
 *    (`platform_tenant_service.ts`); ésa es una regla de despliegue, no de
 *    ingreso. Aplicarla aquí perdería el ingreso real de una empresa con dos
 *    suscripciones vivas (regla 5). La aparente inconsistencia con el listado es
 *    deliberada.
 *
 * ## Forma pensada para la orden 16
 *
 * El universo y sus filtros (`mrrBaseQuery`) están aislados de la proyección del
 * resultado (`getMrrSnapshot`), de modo que "Ver la concentración de MRR por
 * grupo económico" pueda agregar un `groupBy` sobre la misma pasada sin duplicar
 * la regla del neto ni la de estados. Esta rebanada **no** crea el desglose.
 */
export default class PlatformMrrService {
  /**
   * Las dos cifras de ingreso recurrente, calculadas al momento.
   *
   * Una sola lectura del reloj para las tres consultas: el actual, el proyectado
   * y el reparto por moneda tienen que hablar del mismo día aunque el proceso
   * cruce la medianoche.
   *
   * @returns Actual neto, proyectado de pruebas, sus conteos, monedas y la fecha del cálculo.
   */
  async getMrrSnapshot(): Promise<PlatformMrrSnapshot> {
    const businessDate = toBusinessDateString()

    const activas = await this.loadStatusTotals('active')
    const enPrueba = await this.loadStatusTotals('trialing')
    const monedas = await this.loadCurrencies()

    return {
      mrrActualNetoCents: activas.netoCents,
      suscripcionesActivas: activas.suscripciones,
      mrrProyectadoTrialCents: enPrueba.netoCents,
      suscripcionesEnPrueba: enPrueba.suscripciones,
      monedas,
      calculadoAl: businessDate,
    }
  }

  /**
   * Universo del MRR: suscripciones vivas de empresas vivas. Sin filtro de
   * estado — lo pone cada llamador, para que el actual y el proyectado no puedan
   * compartir una ramificación.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan
   * por el hook de `SoftDeletes` (gotcha del área, `platform_device_service.ts`).
   * `business_unit_active = 0` **no** excluye: manda el estado de la suscripción
   * (regla 6).
   */
  private mrrBaseQuery() {
    return db
      .from('billing_subscriptions as bs')
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
  }

  /**
   * Suma del subtotal congelado y conteo de suscripciones de un estado.
   *
   * Una consulta por estado, y no un `GROUP BY status`, para que sea imposible
   * que el proyectado se cuele en el actual: cada cifra tiene su propia llamada
   * y su propio filtro (regla 3).
   *
   * `COALESCE` porque MySQL devuelve NULL —no 0— cuando el universo está vacío,
   * y `Number(...)` porque `SUM()` sobre `DECIMAL` llega como string por Knex.
   *
   * @param status - Estado exacto de las suscripciones a sumar.
   * @returns Importe neto en centavos y cuántas suscripciones lo produjeron.
   */
  private async loadStatusTotals(
    status: (typeof MRR_STATUSES)[number]
  ): Promise<{ netoCents: number; suscripciones: number }> {
    const row = (await this.mrrBaseQuery()
      .where('bs.billing_subscription_status', status)
      .select(db.raw(`COALESCE(SUM(${CONTRACTED_SUBTOTAL_CENTS_SQL}), 0) as netoCents`))
      .select(db.raw('COUNT(*) as suscripciones'))
      .first()) as Record<string, unknown> | null

    return {
      netoCents: Number(row?.netoCents ?? 0),
      suscripciones: Number(row?.suscripciones ?? 0),
    }
  }

  /**
   * Cuántas suscripciones del universo del MRR hay en cada moneda contratada.
   *
   * Es la honestidad del supuesto declarado: hoy la plataforma opera en una sola
   * moneda por costumbre, no por regla del esquema. **La suma no se agrupa por
   * moneda** — se informa el reparto y la vista advierte cuando hay más de una,
   * en lugar de sumar peras con manzanas en silencio.
   *
   * Orden por código para que la advertencia de la vista no cambie de redacción
   * entre dos cargas idénticas.
   *
   * @returns Un elemento por moneda distinta, ascendente por código.
   */
  private async loadCurrencies(): Promise<MrrCurrencySlice[]> {
    const rows = (await this.mrrBaseQuery()
      .whereIn('bs.billing_subscription_status', [...MRR_STATUSES])
      .select('bs.billing_subscription_contracted_currency as codigo')
      .select(db.raw('COUNT(*) as suscripciones'))
      .groupBy('bs.billing_subscription_contracted_currency')
      .orderBy('bs.billing_subscription_contracted_currency', 'asc')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => ({
      codigo: String(row.codigo ?? ''),
      suscripciones: Number(row.suscripciones ?? 0),
    }))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_mrr_service
```

Expected: PASS, los nueve tests.

- [ ] **Step 6: Typecheck y lint**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
pnpm typecheck && pnpm lint
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/constants/platform_metric_error_codes.ts app/services/platform_mrr_service.ts tests/functional/platform_mrr_service.spec.ts
git commit -m "feat(metrics): add the canonical platform MRR aggregate over the frozen subtotal"
```

---

## Task 2: API — el endpoint (controlador, ruta e import manual)

**Files:**
- Create: `gsti-rh-api/app/controllers/platform_mrr_controller.ts`
- Create: `gsti-rh-api/start/routes/platform_mrr_routes.ts`
- Modify: `gsti-rh-api/start/routes.ts` (bloque de imports de plataforma, después de `platform_receivable_routes.js`)
- Test: `gsti-rh-api/tests/functional/platform_mrr_metrics.spec.ts`

**Interfaces:**
- Consumes: `PlatformMrrService` y `PlatformMrrSnapshot` (Task 1); `MRR_METRIC_ERROR_TEXTS` (Task 1); `resolvePlatformMetricApiError(error, texts)` de `app/helpers/platform_metric_api_error.ts`; `middleware.auth` y `middleware.platformAdmin` de `start/kernel.ts`.
- Produces: `GET /api/platform/metrics/mrr` con envelope `{ type: 'success', data: PlatformMrrSnapshot }`. Lo consume el repositorio del landlord (Task 3). El archivo de rutas lo **edita la orden 9** para agregar `mrr-series` al mismo grupo.

**El olvido clásico del área:** `start/routes.ts` importa cada archivo de rutas a mano. Sin la línea de `import`, el endpoint responde **404 y nada lo avisa** — ni el typecheck, ni el lint, ni un test que solo pruebe el servicio. El test de este task es lo que lo detecta.

- [ ] **Step 1: Write the failing test**

Crear `gsti-rh-api/tests/functional/platform_mrr_metrics.spec.ts`:

```ts
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'

/**
 * USRH1788052455653 — contrato de `GET /api/platform/metrics/mrr`.
 *
 * Las reglas del cálculo se prueban en `platform_mrr_service.spec.ts`. Aquí se
 * prueba lo que solo el transporte puede romper: que la ruta exista (el import
 * a mano de `start/routes.ts`), la forma exacta del payload, los dos guards y
 * que el endpoint no tenga entrada que validar.
 */

const TEST_PASSWORD = 'MrrMetricsTest123!'
const BASE_URL = '/api/platform/metrics/mrr'

/** Llaves exactas del payload. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_DATA_KEYS = [
  'calculadoAl',
  'monedas',
  'mrrActualNetoCents',
  'mrrProyectadoTrialCents',
  'suscripcionesActivas',
  'suscripcionesEnPrueba',
]

interface TestActor {
  user: User
  person: Person
}

interface MrrBody {
  mrrActualNetoCents: number
  suscripcionesActivas: number
  mrrProyectadoTrialCents: number
  suscripcionesEnPrueba: number
  monedas: Array<{ codigo: string; suscripciones: number }>
  calculadoAl: string
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'Mrr',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person }
}

async function cleanupActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

test.group('GET /api/platform/metrics/mrr', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('mrr-admin', true)
    outsider = await createActor('mrr-outsider', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('la ruta existe y responde el envelope del área', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)

    // Un 404 aquí significa que falta la línea de import en `start/routes.ts`.
    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(Object.keys(response.body().data).sort(), EXPECTED_DATA_KEYS)
    assert.isUndefined(response.body().meta)
  })

  test('las cuatro cifras son enteros y la fecha es de calendario', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody

    assert.isTrue(Number.isInteger(data.mrrActualNetoCents))
    assert.isTrue(Number.isInteger(data.suscripcionesActivas))
    assert.isTrue(Number.isInteger(data.mrrProyectadoTrialCents))
    assert.isTrue(Number.isInteger(data.suscripcionesEnPrueba))
    assert.match(data.calculadoAl, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('CA-3 — el payload no trae ningún campo que sea la suma de las dos cifras', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody
    const suma = data.mrrActualNetoCents + data.mrrProyectadoTrialCents

    assert.notInclude(Object.values(data), suma)
    assert.notInclude(JSON.stringify(data), '"mrrTotal')
  })

  test('el agregado no publica identidad de clientes', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const raw = JSON.stringify(response.body())

    for (const prohibido of [
      'businessUnitPublicId',
      'business_unit_id',
      'billingSubscriptionId',
      'rfc',
      'billingEmail',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })

  test('CA-10 — cada moneda viaja con su código y su conteo, y nada más', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as MrrBody

    assert.isArray(data.monedas)
    for (const moneda of data.monedas) {
      assert.deepEqual(Object.keys(moneda).sort(), ['codigo', 'suscripciones'])
      assert.isTrue(Number.isInteger(moneda.suscripciones))
    }
  })

  test('sin is_platform_admin responde 403 sin campo code', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(outsider!.user)

    response.assertStatus(403)
    assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isUndefined(response.body().code)
    assert.isUndefined(response.body().data)
  })

  test('sin sesión responde 401', async ({ client }) => {
    const response = await client.get(BASE_URL)
    response.assertStatus(401)
  })

  test('no hay 422: el endpoint no recibe entrada y los query params sobrantes se ignoran', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(BASE_URL)
      .qs({ page: 'no-soy-un-numero', limit: 5000, groupBy: 'grupo' })
      .loginAs(admin!.user)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_mrr_metrics
```

Expected: FAIL con 404 en los tests de éxito (la ruta no existe todavía).

- [ ] **Step 3: Write the controller**

Crear `gsti-rh-api/app/controllers/platform_mrr_controller.ts`:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import PlatformMrrService from '#services/platform_mrr_service'
import { MRR_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Ingreso mensual recurrente de la plataforma en la consola GSTI
 * (USRH1788052455653).
 *
 * Solo lectura y sin parámetros. Publica dos cifras que **no se suman**: el MRR
 * actual neto —lo que ya está contratado y activo, con los descuentos aplicados
 * y sin IVA— y el proyectado de las suscripciones en prueba, que es lo que
 * sumaría si convierten. Ningún campo de la respuesta es su suma.
 */
export default class PlatformMrrController {
  private readonly service = new PlatformMrrService()

  /**
   * @swagger
   * /api/platform/metrics/mrr:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Ingreso mensual recurrente actual neto y proyectado de pruebas
   *     description: |
   *       Devuelve el ingreso mensual recurrente de toda la plataforma en dos cifras
   *       independientes: el actual neto, que suma el importe contratado SIN IVA de las
   *       suscripciones active, y el proyectado, que suma el mismo importe de las
   *       suscripciones trialing.
   *       Las dos viajan aparte y ningún campo de esta respuesta es —ni podrá ser— su suma:
   *       el actual es lo que ya está contratado, el proyectado es lo que sumaría si las
   *       pruebas convierten, y presentarlas juntas sobreestimaría el ingreso.
   *       El importe de cada suscripción es el que quedó sellado en el trato vigente, con
   *       su descuento ya aplicado: nunca se recalcula desde el porcentaje de descuento,
   *       porque el catálogo admite descuentos que no son porcentaje y recalcular
   *       reportaría el precio de lista sin que nada falle.
   *       Las suscripciones con pago vencido (past_due) quedan FUERA de las dos cifras: su
   *       importe se reporta en la cartera vencida. La consecuencia es explícita y aceptada
   *       — el ingreso mensual recurrente BAJA cuando un cliente cae en morosidad y vuelve
   *       a subir cuando se pone al corriente.
   *       Se suman todas las suscripciones de cada estado, no una por empresa: una empresa
   *       con dos suscripciones vivas aporta las dos. Es distinto del listado de tenants,
   *       que elige una suscripción por empresa; ésa es regla de despliegue, no de ingreso.
   *       Quedan fuera las suscripciones borradas y las de empresas borradas. Una empresa
   *       desactivada pero no borrada SÍ cuenta: manda el estado de la suscripción.
   *       Las dos cifras van sin impuestos, al revés que la deuda vencida, que va con IVA.
   *       monedas informa cuántas suscripciones hay por moneda contratada: la suma NO se
   *       agrupa por moneda, es un supuesto declarado y más de un elemento significa que la
   *       cifra cruza monedas.
   *       Se resuelve en el momento de la consulta: sin caché, sin cierre guardado y sin
   *       proceso programado. Es un agregado: no publica empresas, identificadores internos
   *       ni información fiscal.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Las dos cifras de ingreso recurrente, sus conteos y el reparto por moneda
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     mrrActualNetoCents:
   *                       type: integer
   *                       description: |
   *                         Suma del importe contratado SIN IVA de las suscripciones active, en
   *                         centavos. Ya viene con el descuento de cada cliente aplicado.
   *                         Baja cuando un cliente cae en past_due: ese importe se reporta en la
   *                         cartera vencida, no aquí.
   *                     suscripcionesActivas:
   *                       type: integer
   *                       description: Suscripciones active sumadas. No es un conteo de empresas.
   *                     mrrProyectadoTrialCents:
   *                       type: integer
   *                       description: |
   *                         Misma suma sobre las suscripciones trialing, en centavos. NO está
   *                         incluida en mrrActualNetoCents y no existe ningún campo que las sume.
   *                     suscripcionesEnPrueba:
   *                       type: integer
   *                     monedas:
   *                       type: array
   *                       description: |
   *                         Reparto por moneda contratada sobre el universo active + trialing.
   *                         Informativo: la suma no se agrupa por moneda. Más de un elemento
   *                         significa que la cifra cruza monedas y la vista lo advierte.
   *                       items:
   *                         type: object
   *                         properties:
   *                           codigo:
   *                             type: string
   *                             example: MXN
   *                           suscripciones:
   *                             type: integer
   *                     calculadoAl:
   *                       type: string
   *                       format: date
   *                       example: "2026-09-08"
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Acceso restringido a plataforma
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.FORBIDDEN
   *       '500':
   *         description: Falla no controlada al calcular el ingreso recurrente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Error inesperado al obtener el ingreso mensual recurrente
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-inesperado-al-obtener-el-ingreso-mensual-recurrente
   *                 code:
   *                   type: string
   *                   example: PLT.MET.SYS_UNHANDLED
   *
   * @index
   * @summary Ingreso mensual recurrente actual neto y proyectado de pruebas
   * @description Devuelve el ingreso mensual recurrente de toda la plataforma en dos cifras\
   *   independientes: el actual neto, que suma el importe contratado SIN IVA de las\
   *   suscripciones active, y el proyectado de las suscripciones trialing.\
   *   Ningún campo de la respuesta es —ni podrá ser— su suma: presentarlas juntas\
   *   sobreestimaría el ingreso.\
   *   El importe de cada suscripción es el sellado en el trato vigente, con su descuento ya\
   *   aplicado; nunca se recalcula desde el porcentaje de descuento.\
   *   Las suscripciones past_due quedan fuera de las dos cifras: su importe se reporta en la\
   *   cartera vencida. Consecuencia aceptada: el MRR baja cuando un cliente cae en morosidad\
   *   y vuelve a subir cuando se pone al corriente.\
   *   Se suman todas las suscripciones de cada estado, no una por empresa.\
   *   Borradas fuera; empresa desactivada pero no borrada sí cuenta.\
   *   Las dos cifras van SIN impuestos, al revés que la deuda vencida.\
   *   Se resuelve en el momento de la consulta, sin caché ni proceso programado.\
   *   Es un agregado: no publica empresas, identificadores internos ni información fiscal.
   * @tag Platform · Métricas
   * @operationId getPlatformMrr
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"mrrActualNetoCents": 1250000, "suscripcionesActivas": 4, "mrrProyectadoTrialCents": 200000, "suscripcionesEnPrueba": 1, "monedas": [{"codigo": "MXN", "suscripciones": 5}], "calculadoAl": "2026-09-08"}}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-el-ingreso-mensual-recurrente", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async index({ response }: HttpContext) {
    try {
      // Sin `request.validateUsing`: el endpoint no recibe entrada, así que no
      // hay 422 propio y no se le inventa un validador vacío.
      const data = await this.service.getMrrSnapshot()

      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        MRR_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
```

- [ ] **Step 4: Write the route file**

Crear `gsti-rh-api/start/routes/platform_mrr_routes.ts`:

```ts
import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Métricas de plataforma · ingreso recurrente ──────────────────────────────
 *   GET  /api/platform/metrics/mrr  → actual neto y proyectado de pruebas
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo y en ese orden. Ref: USRH1788052455653.
 *
 *   El prefijo llega hasta `/metrics` a propósito: la serie mensual de MRR
 *   (USRH1788052455654) agrega su ruta a este mismo grupo.
 */
router
  .group(() => {
    router.get('/mrr', '#controllers/platform_mrr_controller.index')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

- [ ] **Step 5: Add the manual import**

En `gsti-rh-api/start/routes.ts`, en el bloque de imports de plataforma, inmediatamente después de la línea de `platform_receivable_routes.js`:

```ts
import './routes/platform_receivable_routes.js'
import './routes/platform_mrr_routes.js'
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_mrr_metrics
```

Expected: PASS, los ocho tests. Si el de "la ruta existe" sigue en 404, falta el paso 5.

- [ ] **Step 7: Regression — la suite de métricas de la cartera sigue verde**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace test functional --files=platform_receivables_metrics
pnpm typecheck && pnpm lint
```

Expected: PASS y sin errores. El grupo nuevo no puede haberle robado rutas al de la orden 5.

- [ ] **Step 8: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
git add app/controllers/platform_mrr_controller.ts start/routes/platform_mrr_routes.ts start/routes.ts tests/functional/platform_mrr_metrics.spec.ts
git commit -m "feat(metrics): expose GET /api/platform/metrics/mrr behind the platform admin guard"
```

---

## Task 3: Landlord — dominio y repositorio del MRR

**Files:**
- Create: `valanserh-landlord/app/pages/dashboard/domain/mrr.interface.ts`
- Create: `valanserh-landlord/app/pages/dashboard/infrastructure/mrr.repository.ts`
- Test: `valanserh-landlord/app/pages/dashboard/infrastructure/mrr.repository.spec.ts`

**Interfaces:**
- Consumes: el contrato de `GET /api/platform/metrics/mrr` (Task 2). Nada del propio repo.
- Produces, desde `domain/mrr.interface.ts`: `MrrCurrencyRaw`, `MrrSnapshotRaw`, `GetMrrApiResponse`, `GetMrrParams`, `MrrCurrency { code: string; subscriptions: number }`, `MrrSnapshot { currentNetCents: number; activeSubscriptions: number; trialProjectedCents: number; trialSubscriptions: number; currencies: MrrCurrency[]; calculatedAt: string }`, `UseMrrMessages { errorLoading: string }`. Desde `infrastructure/mrr.repository.ts`: `getPlatformMrr(params: GetMrrParams): Promise<MrrSnapshot>`. Los consume `use-mrr.ts` (Task 4).

**Por qué el repositorio no atrapa el error:** la capa de aplicación es la que decide qué se le muestra a quien mira el tablero. El 403 de plataforma sube igual que un error de red y el bloque lo trata como su propio error, con reintento. La autorización vive en un solo lugar: el API.

**Por qué el mapeo renombra los campos:** el contrato del API está en español y el dominio del slice en inglés, como el resto del landlord. El mapeo es el único punto donde conviven los dos vocabularios (precedente: `receivables.repository.ts`).

- [ ] **Step 1: Write the failing test**

Crear `valanserh-landlord/app/pages/dashboard/infrastructure/mrr.repository.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getPlatformMrr } from './mrr.repository'

const mockData = {
  mrrActualNetoCents: 1250000,
  suscripcionesActivas: 4,
  mrrProyectadoTrialCents: 200000,
  suscripcionesEnPrueba: 1,
  monedas: [{ codigo: 'MXN', suscripciones: 5 }],
  calculadoAl: '2026-09-08'
}

const makeApiFetch = (overrides: Partial<typeof mockData> = {}) =>
  vi.fn().mockResolvedValue({
    type: 'success',
    data: { ...mockData, ...overrides }
  })

describe('getPlatformMrr', () => {
  it('consulta el endpoint de MRR sin el prefijo /api y sin parámetros', async () => {
    const apiFetch = makeApiFetch()

    await getPlatformMrr({ apiFetch })

    expect(apiFetch).toHaveBeenCalledWith('/platform/metrics/mrr')
  })

  it('mapea las dos cifras, sus conteos, las monedas y la fecha al dominio del slice', async () => {
    const result = await getPlatformMrr({ apiFetch: makeApiFetch() })

    expect(result).toEqual({
      currentNetCents: 1250000,
      activeSubscriptions: 4,
      trialProjectedCents: 200000,
      trialSubscriptions: 1,
      currencies: [{ code: 'MXN', subscriptions: 5 }],
      calculatedAt: '2026-09-08'
    })
  })

  it('conserva el dinero en centavos enteros: el repositorio no convierte a pesos', async () => {
    const result = await getPlatformMrr({ apiFetch: makeApiFetch() })

    expect(Number.isInteger(result.currentNetCents)).toBe(true)
    expect(result.currentNetCents).toBe(1250000)
  })

  it('CA-3 — el mapeo no produce ningún campo que sea la suma de las dos cifras', async () => {
    const result = await getPlatformMrr({ apiFetch: makeApiFetch() })

    // 1,250,000 + 200,000 = 1,450,000. Ese número no puede existir en el mapeo.
    expect(Object.values(result)).not.toContain(1450000)
    expect(JSON.stringify(result)).not.toContain('1450000')
    expect(Object.keys(result).sort()).toEqual([
      'activeSubscriptions',
      'calculatedAt',
      'currencies',
      'currentNetCents',
      'trialProjectedCents',
      'trialSubscriptions'
    ])
  })

  it('CA-8 — una plataforma sin suscripciones llega en ceros, sin inventar nada', async () => {
    const result = await getPlatformMrr({
      apiFetch: makeApiFetch({
        mrrActualNetoCents: 0,
        suscripcionesActivas: 0,
        mrrProyectadoTrialCents: 0,
        suscripcionesEnPrueba: 0,
        monedas: []
      })
    })

    expect(result.currentNetCents).toBe(0)
    expect(result.activeSubscriptions).toBe(0)
    expect(result.trialSubscriptions).toBe(0)
    expect(result.currencies).toEqual([])
  })

  it('CA-10 — mapea las dos monedas conservando el orden que entregó el API', async () => {
    const result = await getPlatformMrr({
      apiFetch: makeApiFetch({
        monedas: [
          { codigo: 'MXN', suscripciones: 5 },
          { codigo: 'USD', suscripciones: 1 }
        ]
      })
    })

    expect(result.currencies).toEqual([
      { code: 'MXN', subscriptions: 5 },
      { code: 'USD', subscriptions: 1 }
    ])
  })

  it('propaga el error del API sin atraparlo', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('network error'))

    await expect(getPlatformMrr({ apiFetch })).rejects.toThrow('network error')
  })

  it('CA-9 — propaga el 403 de plataforma para que el bloque pinte su error', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('AUTH.PLATFORM.FORBIDDEN'))

    await expect(getPlatformMrr({ apiFetch })).rejects.toThrow('AUTH.PLATFORM.FORBIDDEN')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/infrastructure/mrr.repository.spec.ts
```

Expected: FAIL. No se puede resolver `./mrr.repository`.

- [ ] **Step 3: Write the domain interface**

Crear `valanserh-landlord/app/pages/dashboard/domain/mrr.interface.ts`:

```ts
import type { FetchOptions } from 'ofetch'

/** Reparto de suscripciones por moneda tal como lo publica el API. */
export interface MrrCurrencyRaw {
  codigo: string
  suscripciones: number
}

/**
 * Las dos cifras de ingreso recurrente tal como las publica el API (nombres del
 * contrato, en español).
 *
 * El contrato **no trae** ningún campo que sea su suma, y este tipo tampoco lo
 * declara: el actual es lo contratado y activo, el proyectado es lo que sumaría
 * si las pruebas convierten.
 */
export interface MrrSnapshotRaw {
  mrrActualNetoCents: number
  suscripcionesActivas: number
  mrrProyectadoTrialCents: number
  suscripcionesEnPrueba: number
  monedas: MrrCurrencyRaw[]
  calculadoAl: string
}

/** Respuesta completa del endpoint de MRR. Sin `meta`: el agregado no pagina. */
export interface GetMrrApiResponse {
  type: string
  data: MrrSnapshotRaw
}

/** Dependencias del repositorio de MRR: solo el cliente HTTP autenticado del panel. */
export interface GetMrrParams {
  apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>
}

/** Una moneda del universo del MRR, ya mapeada al dominio del slice. */
export interface MrrCurrency {
  code: string
  subscriptions: number
}

/**
 * Las dos cifras de ingreso recurrente ya mapeadas al dominio del dashboard,
 * con el dinero todavía en centavos enteros: el formateo a pesos ocurre una sola
 * vez, en el orquestador.
 *
 * `currentNetCents` es lo que la plataforma factura al mes por suscripciones
 * activas, con los descuentos de cada cliente ya aplicados y sin impuestos.
 * `trialProjectedCents` es lo que sumaría si las pruebas en curso convirtieran;
 * es dinero que está en juego, no dinero que ya se tiene. Este tipo **no
 * declara** un campo con su suma a propósito.
 */
export interface MrrSnapshot {
  currentNetCents: number
  activeSubscriptions: number
  trialProjectedCents: number
  trialSubscriptions: number
  /** Más de un elemento significa que la cifra cruza monedas y la vista lo advierte. */
  currencies: MrrCurrency[]
  /** Fecha de negocio del cálculo, `YYYY-MM-DD`. */
  calculatedAt: string
}

/** Mensajes ya traducidos que el composable de MRR necesita del orquestador. */
export interface UseMrrMessages {
  errorLoading: string
}
```

- [ ] **Step 4: Write the repository**

Crear `valanserh-landlord/app/pages/dashboard/infrastructure/mrr.repository.ts`:

```ts
import type {
  GetMrrApiResponse,
  GetMrrParams,
  MrrCurrency,
  MrrCurrencyRaw,
  MrrSnapshot
} from '../domain/mrr.interface'

/**
 * Mapea una moneda del formato del contrato al dominio del slice.
 *
 * @param raw - Moneda tal como la publica el API.
 * @returns La moneda mapeada, con su conteo de suscripciones.
 */
const mapMrrCurrency = (raw: MrrCurrencyRaw): MrrCurrency => ({
  code: raw.codigo,
  subscriptions: raw.suscripciones
})

/**
 * Obtiene el ingreso mensual recurrente de la plataforma: el actual neto y el
 * proyectado de las suscripciones en prueba, cada uno con su conteo, más el
 * reparto por moneda.
 *
 * El endpoint no recibe parámetros: la cifra es de toda la plataforma y se
 * calcula al momento de la consulta.
 *
 * Aquí **no** se suman las dos cifras ni se deriva ninguna tercera: el actual es
 * lo contratado y activo, el proyectado es lo que sumaría si las pruebas
 * convierten, y una cifra combinada sobreestimaría el ingreso. Es regla de
 * producto, no decisión de mapeo.
 *
 * El dinero se conserva en centavos enteros: convertirlo a pesos aquí sembraría
 * redondeos en el transporte.
 *
 * Mapper propio del slice: el dashboard declara sus tipos y no reutiliza los de
 * ningún otro slice.
 *
 * @param params - Cliente HTTP autenticado del panel.
 * @returns Las dos cifras mapeadas al dominio, con el dinero en centavos.
 * @throws Error del API propagado a la capa de aplicación, incluido el 403 de plataforma.
 */
export const getPlatformMrr = async (params: GetMrrParams): Promise<MrrSnapshot> => {
  const response = await params.apiFetch<GetMrrApiResponse>('/platform/metrics/mrr')
  const data = response.data

  return {
    currentNetCents: data.mrrActualNetoCents,
    activeSubscriptions: data.suscripcionesActivas,
    trialProjectedCents: data.mrrProyectadoTrialCents,
    trialSubscriptions: data.suscripcionesEnPrueba,
    currencies: data.monedas.map(mapMrrCurrency),
    calculatedAt: data.calculadoAl
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/infrastructure/mrr.repository.spec.ts
```

Expected: PASS, los ocho tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/domain/mrr.interface.ts app/pages/dashboard/infrastructure/mrr.repository.ts app/pages/dashboard/infrastructure/mrr.repository.spec.ts
git commit -m "feat(dashboard): add the MRR domain types and repository"
```

---

## Task 4: Landlord — composable del bloque de MRR

**Files:**
- Create: `valanserh-landlord/app/pages/dashboard/application/use-mrr.ts`
- Test: `valanserh-landlord/app/pages/dashboard/application/use-mrr.spec.ts`

**Interfaces:**
- Consumes: `getPlatformMrr` de `../infrastructure/mrr.repository`; `MrrSnapshot` y `UseMrrMessages` de `../domain/mrr.interface` (Task 3).
- Produces: `UseMrrDeps { apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>; messages: UseMrrMessages }`; `UseMrrReturn { snapshot: Ref<MrrSnapshot | null>; loading: Ref<boolean>; hasError: Ref<boolean>; errorMessage: Ref<string | null>; hasLoadedOnce: Ref<boolean>; load: () => Promise<void> }`; `useMrr(deps: UseMrrDeps): UseMrrReturn`. Los consume la fachada (Task 5).

**Por qué `snapshot` arranca en `null` y no en ceros:** "no hay ninguna suscripción activa ni en prueba" y "no se pudo consultar el ingreso" son dos cosas distintas, y el tablero tiene que ofrecer reintento en la segunda y el vacío honesto en la primera (CA-8, CA-9). Un cero por omisión las confundiría.

**Por qué el fallo no se relanza:** cada bloque del tablero se aísla. El MRR caído no puede tumbar la cartera ni el inventario.

- [ ] **Step 1: Write the failing test**

Crear `valanserh-landlord/app/pages/dashboard/application/use-mrr.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useMrr } from './use-mrr'
import * as repo from '../infrastructure/mrr.repository'
import type { MrrSnapshot } from '../domain/mrr.interface'

const makeDeps = () => ({
  apiFetch: vi.fn(),
  messages: { errorLoading: 'No se pudo cargar el ingreso mensual recurrente.' }
})

const makeSnapshot = (overrides: Partial<MrrSnapshot> = {}): MrrSnapshot => ({
  currentNetCents: 1250000,
  activeSubscriptions: 4,
  trialProjectedCents: 200000,
  trialSubscriptions: 1,
  currencies: [{ code: 'MXN', subscriptions: 5 }],
  calculatedAt: '2026-09-08',
  ...overrides
})

describe('useMrr', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('load — deja las dos cifras disponibles tras una carga exitosa', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockResolvedValue(makeSnapshot())

    const { snapshot, loading, hasError, load } = useMrr(makeDeps())

    await load()

    expect(snapshot.value?.currentNetCents).toBe(1250000)
    expect(snapshot.value?.trialProjectedCents).toBe(200000)
    expect(loading.value).toBe(false)
    expect(hasError.value).toBe(false)
  })

  it('load — arranca sin cifras: no inventa un ingreso antes de preguntarle al API', () => {
    const { snapshot, hasLoadedOnce } = useMrr(makeDeps())

    expect(snapshot.value).toBeNull()
    expect(hasLoadedOnce.value).toBe(false)
  })

  it('load — inyecta el apiFetch recibido al repositorio', async () => {
    const spy = vi.spyOn(repo, 'getPlatformMrr').mockResolvedValue(makeSnapshot())
    const deps = makeDeps()

    await useMrr(deps).load()

    expect(spy).toHaveBeenCalledWith({ apiFetch: deps.apiFetch })
  })

  it('load — prende loading durante la llamada y lo apaga al terminar', async () => {
    let resolveCall!: (value: MrrSnapshot) => void
    vi.spyOn(repo, 'getPlatformMrr').mockReturnValue(
      new Promise<MrrSnapshot>((resolve) => {
        resolveCall = resolve
      })
    )

    const { loading, load } = useMrr(makeDeps())

    const promise = load()
    expect(loading.value).toBe(true)
    resolveCall(makeSnapshot())
    await promise
    expect(loading.value).toBe(false)
  })

  it('CA-9 — prende hasError con el mensaje inyectado cuando el API falla, sin relanzar', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockRejectedValue(new Error('network error'))
    const deps = makeDeps()

    const { hasError, errorMessage, load } = useMrr(deps)

    await expect(load()).resolves.toBeUndefined()
    expect(hasError.value).toBe(true)
    expect(errorMessage.value).toBe(deps.messages.errorLoading)
  })

  it('load — NO sustituye las cifras por ceros cuando la carga falla', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockRejectedValue(new Error('network error'))

    const { snapshot, load } = useMrr(makeDeps())

    await load()

    // Un ingreso en ceros y un ingreso que no se pudo consultar son cosas
    // distintas: la primera es el vacío honesto, la segunda es el error.
    expect(snapshot.value).toBeNull()
  })

  it('load — registra el error con el prefijo del composable', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(repo, 'getPlatformMrr').mockRejectedValue(new Error('network error'))

    await useMrr(makeDeps()).load()

    expect(consoleSpy).toHaveBeenCalledWith(
      'useMrr: error al cargar el ingreso mensual recurrente',
      expect.any(Error)
    )
  })

  it('load — deja hasLoadedOnce en false cuando la carga falló', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockRejectedValue(new Error('network error'))

    const { hasLoadedOnce, load } = useMrr(makeDeps())

    await load()

    expect(hasLoadedOnce.value).toBe(false)
  })

  it('CA-8 — prende hasLoadedOnce aunque la plataforma no tenga ninguna suscripción', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockResolvedValue(
      makeSnapshot({
        currentNetCents: 0,
        activeSubscriptions: 0,
        trialProjectedCents: 0,
        trialSubscriptions: 0,
        currencies: []
      })
    )

    const { hasLoadedOnce, snapshot, load } = useMrr(makeDeps())

    await load()

    expect(hasLoadedOnce.value).toBe(true)
    expect(snapshot.value?.activeSubscriptions).toBe(0)
    expect(snapshot.value?.trialSubscriptions).toBe(0)
  })

  it('CA-9 — limpia hasError y deja las cifras cuando el reintento tiene éxito', async () => {
    vi.spyOn(repo, 'getPlatformMrr')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(makeSnapshot())

    const { hasError, errorMessage, snapshot, load } = useMrr(makeDeps())

    await load()
    expect(hasError.value).toBe(true)

    await load()
    expect(hasError.value).toBe(false)
    expect(errorMessage.value).toBeNull()
    expect(snapshot.value?.currentNetCents).toBe(1250000)
  })

  it('load — no borra las cifras que ya estaban en pantalla cuando una recarga falla', async () => {
    vi.spyOn(repo, 'getPlatformMrr')
      .mockResolvedValueOnce(makeSnapshot())
      .mockRejectedValue(new Error('network error'))

    const { snapshot, hasError, load } = useMrr(makeDeps())

    await load()
    await load()

    expect(hasError.value).toBe(true)
    expect(snapshot.value?.currentNetCents).toBe(1250000)
  })

  it('CA-3 — no expone ningún acumulado de las dos cifras', async () => {
    vi.spyOn(repo, 'getPlatformMrr').mockResolvedValue(makeSnapshot())

    const composable = useMrr(makeDeps())
    await composable.load()

    expect(Object.keys(composable).sort()).toEqual([
      'errorMessage',
      'hasError',
      'hasLoadedOnce',
      'load',
      'loading',
      'snapshot'
    ])
    expect(Object.values(composable.snapshot.value!)).not.toContain(1450000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/application/use-mrr.spec.ts
```

Expected: FAIL. No se puede resolver `./use-mrr`.

- [ ] **Step 3: Write the implementation**

Crear `valanserh-landlord/app/pages/dashboard/application/use-mrr.ts`:

```ts
import { ref, type Ref } from 'vue'
import type { FetchOptions } from 'ofetch'
import type { MrrSnapshot, UseMrrMessages } from '../domain/mrr.interface'
import { getPlatformMrr } from '../infrastructure/mrr.repository'

/** Dependencias del composable de MRR: cliente HTTP y mensajes ya traducidos. */
export interface UseMrrDeps {
  apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>
  messages: UseMrrMessages
}

/** Estado y acciones del bloque de MRR expuestos al orquestador. */
export interface UseMrrReturn {
  /** `null` mientras el API no haya respondido: un ingreso desconocido no es un ingreso en ceros. */
  snapshot: Ref<MrrSnapshot | null>
  loading: Ref<boolean>
  hasError: Ref<boolean>
  errorMessage: Ref<string | null>
  hasLoadedOnce: Ref<boolean>
  load: () => Promise<void>
}

/**
 * Caso de uso: cargar el ingreso mensual recurrente de la plataforma para las
 * dos tarjetas de la franja ejecutiva. Un solo viaje alimenta a las dos, así que
 * las dos cifras son del mismo instante y el reintento del bloque es una sola
 * llamada.
 *
 * Las publica **por separado** y no expone ningún acumulado: el actual es lo que
 * ya está contratado y activo, el proyectado es lo que sumaría si las pruebas
 * convierten, y una cifra combinada sobreestimaría el ingreso. Es regla de
 * producto (regla 3).
 *
 * Aísla su propio fallo — atrapa el error, lo registra y prende `hasError` sin
 * relanzar — para que el ingreso caído nunca tumbe los demás bloques del
 * tablero. Solo lectura: desde aquí no se cambia ningún precio, descuento ni
 * suscripción. No persiste nada en el navegador.
 *
 * No sustituye las cifras por ceros cuando falla: la vista necesita distinguir
 * "no hay suscripciones activas ni en prueba" de "no se pudo consultar el
 * ingreso" para ofrecer el reintento en el segundo caso y el vacío honesto en el
 * primero.
 *
 * @param deps - Cliente HTTP y mensajes i18n ya resueltos por el orquestador.
 * @returns Las dos cifras con sus conteos y monedas, banderas de estado y la acción de carga.
 */
export const useMrr = (deps: UseMrrDeps): UseMrrReturn => {
  const snapshot = ref<MrrSnapshot | null>(null)
  const loading = ref<boolean>(false)
  const hasError = ref<boolean>(false)
  const errorMessage = ref<string | null>(null)
  const hasLoadedOnce = ref<boolean>(false)

  /**
   * Carga las dos cifras. `hasLoadedOnce` se prende solo cuando la carga fue
   * exitosa: es la bandera que distingue el esqueleto de la primera carga de un
   * refresco posterior, y prenderla en el fallo volvería inalcanzable el estado
   * de error del bloque.
   */
  const load = async (): Promise<void> => {
    loading.value = true
    hasError.value = false
    errorMessage.value = null

    try {
      snapshot.value = await getPlatformMrr({ apiFetch: deps.apiFetch })
      hasLoadedOnce.value = true
    } catch (error: unknown) {
      console.error('useMrr: error al cargar el ingreso mensual recurrente', error)
      hasError.value = true
      errorMessage.value = deps.messages.errorLoading
    } finally {
      loading.value = false
    }
  }

  return {
    snapshot,
    loading,
    hasError,
    errorMessage,
    hasLoadedOnce,
    load
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/application/use-mrr.spec.ts
```

Expected: PASS, los doce tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/application/use-mrr.ts app/pages/dashboard/application/use-mrr.spec.ts
git commit -m "feat(dashboard): add the MRR block composable with isolated failure"
```

---

## Task 5: Landlord — la fachada de bloques y el recableado del orquestador

**Files:**
- Create: `valanserh-landlord/app/pages/dashboard/application/use-dashboard-blocks.ts`
- Test: `valanserh-landlord/app/pages/dashboard/application/use-dashboard-blocks.spec.ts`
- Modify: `valanserh-landlord/app/pages/dashboard/script.ts`

**Interfaces:**
- Consumes: `useDashboardTenants`/`UseDashboardTenantsReturn`, `useDeviceInventory`/`UseDeviceInventoryReturn`, `useReceivables`/`UseReceivablesReturn` (ya existentes) y `useMrr`/`UseMrrReturn` (Task 4).
- Produces: `UseDashboardBlocksDeps { apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>; messages: { portfolioError: string; inventoryError: string; receivablesError: string; mrrError: string } }`; `UseDashboardBlocksReturn { portfolio: UseDashboardTenantsReturn; inventory: UseDeviceInventoryReturn; receivables: UseReceivablesReturn; mrr: UseMrrReturn; loadAll: () => void }`; `useDashboardBlocks(deps): UseDashboardBlocksReturn`. Lo consume `script.ts` (este task) y a través de él `index.vue` (Task 6).

**Por qué nace la fachada aquí:** con el bloque de MRR, el `script.ts` pasaría a construir cuatro composables y a repartir cuatro juegos de mensajes, además de derivar las lecturas de cinco bloques. Cruza el umbral de responsabilidad única de `architecture.md` (R3 del 03-frontend, decisión ya tomada). La fachada se queda con **una** responsabilidad —saber qué bloques tiene el tablero y cómo se construyen— y el `script.ts` con la otra: traducir el estado de los bloques a lo que el template pinta.

**Por qué `loadAll` no espera nada:** los bloques cargan en paralelo y cada uno atrapa su propio error. `await`earlos en serie haría que el tablero se pinte por partes en cascada, y `Promise.all` haría que el primer rechazo (que no existe, porque ninguno relanza) tuviera un significado. Se disparan y ya.

**Por qué la fachada no expone lecturas derivadas:** son del template, no del tablero. Meterlas aquí volvería la fachada un segundo orquestador y dejaría dos lugares donde buscar la misma cosa.

- [ ] **Step 1: Write the failing test**

Crear `valanserh-landlord/app/pages/dashboard/application/use-dashboard-blocks.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useDashboardBlocks } from './use-dashboard-blocks'
import * as tenantsRepo from '../infrastructure/dashboard-tenants.repository'
import * as inventoryRepo from '../infrastructure/device-inventory.repository'
import * as receivablesRepo from '../infrastructure/receivables.repository'
import * as mrrRepo from '../infrastructure/mrr.repository'

const makeDeps = () => ({
  apiFetch: vi.fn(),
  messages: {
    portfolioError: 'No se pudo cargar la cartera de empresas.',
    inventoryError: 'No se pudo cargar el parque de lectores biométricos.',
    receivablesError: 'No se pudo cargar la cartera vencida.',
    mrrError: 'No se pudo cargar el ingreso mensual recurrente.'
  }
})

const stubAllRepos = () => ({
  tenants: vi.spyOn(tenantsRepo, 'getDashboardTenants').mockResolvedValue({
    tenants: [],
    meta: { total: 0, page: 1, limit: 100, lastPage: 1 }
  }),
  inventory: vi.spyOn(inventoryRepo, 'getDeviceInventorySummary').mockResolvedValue({
    total: 0,
    available: 0,
    assigned: 0,
    retired: 0,
    customerOwned: 0,
    acquisitionCostCents: 0,
    ownedUnitsWithoutCost: 0,
    models: []
  }),
  receivables: vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue({
    summary: {
      overdueTotalCents: 0,
      overdueTenants: 0,
      creditBalanceCents: 0,
      buckets: {
        hasta30: { key: 'hasta30', tenants: 0, amountCents: 0 },
        de31a60: { key: 'de31a60', tenants: 0, amountCents: 0 },
        mas60: { key: 'mas60', tenants: 0, amountCents: 0 }
      },
      calculatedAt: '2026-09-08',
      seatIncreaseDebtTotalCents: 0,
      tenantsWithSeatIncreaseDebt: 0
    },
    overdueTenants: [],
    canceled: [],
    pagination: { total: 0, page: 1, limit: 20, lastPage: 1 }
  }),
  mrr: vi.spyOn(mrrRepo, 'getPlatformMrr').mockResolvedValue({
    currentNetCents: 1250000,
    activeSubscriptions: 4,
    trialProjectedCents: 200000,
    trialSubscriptions: 1,
    currencies: [{ code: 'MXN', subscriptions: 5 }],
    calculatedAt: '2026-09-08'
  })
})

describe('useDashboardBlocks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('expone los cuatro bloques del tablero y su carga conjunta, y nada más', () => {
    stubAllRepos()

    const blocks = useDashboardBlocks(makeDeps())

    expect(Object.keys(blocks).sort()).toEqual([
      'inventory',
      'loadAll',
      'mrr',
      'portfolio',
      'receivables'
    ])
  })

  it('los cuatro bloques arrancan sin datos y sin error', () => {
    stubAllRepos()

    const blocks = useDashboardBlocks(makeDeps())

    expect(blocks.portfolio.hasLoadedOnce.value).toBe(false)
    expect(blocks.inventory.hasLoadedOnce.value).toBe(false)
    expect(blocks.receivables.hasLoadedOnce.value).toBe(false)
    expect(blocks.mrr.hasLoadedOnce.value).toBe(false)
    expect(blocks.mrr.snapshot.value).toBeNull()
  })

  it('loadAll dispara los cuatro bloques, cada uno con el apiFetch inyectado', async () => {
    const spies = stubAllRepos()
    const deps = makeDeps()

    const blocks = useDashboardBlocks(deps)
    blocks.loadAll()
    await vi.waitFor(() => expect(blocks.mrr.hasLoadedOnce.value).toBe(true))

    expect(spies.tenants).toHaveBeenCalledTimes(1)
    expect(spies.inventory).toHaveBeenCalledTimes(1)
    expect(spies.receivables).toHaveBeenCalledTimes(1)
    expect(spies.mrr).toHaveBeenCalledWith({ apiFetch: deps.apiFetch })
  })

  it('CA-9 — un bloque que falla no impide que los otros tres carguen', async () => {
    const spies = stubAllRepos()
    spies.mrr.mockRejectedValue(new Error('network error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const blocks = useDashboardBlocks(makeDeps())
    blocks.loadAll()
    await vi.waitFor(() => expect(blocks.mrr.hasError.value).toBe(true))
    await vi.waitFor(() => expect(blocks.receivables.hasLoadedOnce.value).toBe(true))

    expect(blocks.portfolio.hasError.value).toBe(false)
    expect(blocks.inventory.hasError.value).toBe(false)
    expect(blocks.receivables.hasError.value).toBe(false)
  })

  it('CA-9 — cada bloque conserva su propio mensaje de error', async () => {
    const spies = stubAllRepos()
    spies.mrr.mockRejectedValue(new Error('network error'))
    spies.tenants.mockRejectedValue(new Error('network error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()

    const blocks = useDashboardBlocks(deps)
    blocks.loadAll()
    await vi.waitFor(() => expect(blocks.mrr.hasError.value).toBe(true))
    await vi.waitFor(() => expect(blocks.portfolio.hasError.value).toBe(true))

    expect(blocks.mrr.errorMessage.value).toBe(deps.messages.mrrError)
    expect(blocks.portfolio.errorMessage.value).toBe(deps.messages.portfolioError)
  })

  it('el reintento de un bloque recarga solo ese bloque', async () => {
    const spies = stubAllRepos()

    const blocks = useDashboardBlocks(makeDeps())
    blocks.loadAll()
    await vi.waitFor(() => expect(blocks.mrr.hasLoadedOnce.value).toBe(true))

    await blocks.mrr.load()

    expect(spies.mrr).toHaveBeenCalledTimes(2)
    expect(spies.tenants).toHaveBeenCalledTimes(1)
    expect(spies.receivables).toHaveBeenCalledTimes(1)
    expect(spies.inventory).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/application/use-dashboard-blocks.spec.ts
```

Expected: FAIL. No se puede resolver `./use-dashboard-blocks`.

- [ ] **Step 3: Write the facade**

Crear `valanserh-landlord/app/pages/dashboard/application/use-dashboard-blocks.ts`:

```ts
import type { FetchOptions } from 'ofetch'
import { useDashboardTenants, type UseDashboardTenantsReturn } from './use-dashboard-tenants'
import { useDeviceInventory, type UseDeviceInventoryReturn } from './use-device-inventory'
import { useMrr, type UseMrrReturn } from './use-mrr'
import { useReceivables, type UseReceivablesReturn } from './use-receivables'

/** Mensajes de error de los cuatro bloques, ya traducidos por el orquestador. */
export interface UseDashboardBlocksMessages {
  portfolioError: string
  inventoryError: string
  receivablesError: string
  mrrError: string
}

/** Dependencias de la fachada: cliente HTTP y los mensajes de cada bloque. */
export interface UseDashboardBlocksDeps {
  apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>
  messages: UseDashboardBlocksMessages
}

/** Los cuatro bloques del tablero y su carga conjunta. */
export interface UseDashboardBlocksReturn {
  portfolio: UseDashboardTenantsReturn
  inventory: UseDeviceInventoryReturn
  receivables: UseReceivablesReturn
  mrr: UseMrrReturn
  /** Dispara la primera carga de los cuatro bloques, en paralelo y sin esperarlos. */
  loadAll: () => void
}

/**
 * Fachada de los bloques del tablero de plataforma: el único lugar donde se sabe
 * qué bloques tiene el tablero y cómo se construye cada uno.
 *
 * Existe para que el orquestador de la página tenga una sola responsabilidad
 * —traducir el estado de los bloques a lo que el template pinta— en lugar de dos.
 * Con el bloque de ingreso recurrente el tablero llegó a cuatro composables y a
 * cinco bloques de lectura, y armarlos ahí dentro ya no cabía en una sola
 * responsabilidad.
 *
 * **No deriva lecturas ni formatea nada:** eso es del template y vive en el
 * orquestador. Meterlo aquí crearía un segundo orquestador y dos lugares donde
 * buscar la misma cosa.
 *
 * Cada bloque sigue siendo independiente: conserva su propio `loading`,
 * `hasError`, `errorMessage` y `load`. La fachada no los unifica ni los cruza —
 * un bloque caído no apaga a sus vecinos y su reintento recarga solo lo suyo.
 *
 * @param deps - Cliente HTTP y los mensajes de error ya traducidos de cada bloque.
 * @returns Los cuatro bloques y `loadAll`.
 */
export const useDashboardBlocks = (deps: UseDashboardBlocksDeps): UseDashboardBlocksReturn => {
  const portfolio = useDashboardTenants({
    apiFetch: deps.apiFetch,
    messages: { errorLoading: deps.messages.portfolioError }
  })

  const inventory = useDeviceInventory({
    apiFetch: deps.apiFetch,
    messages: { errorLoading: deps.messages.inventoryError }
  })

  const receivables = useReceivables({
    apiFetch: deps.apiFetch,
    messages: { errorLoading: deps.messages.receivablesError }
  })

  const mrr = useMrr({
    apiFetch: deps.apiFetch,
    messages: { errorLoading: deps.messages.mrrError }
  })

  /**
   * Arranca los cuatro bloques a la vez. No se esperan: cada uno atrapa su
   * propio error y pinta su propio estado, así que encadenarlos solo haría que el
   * tablero se llene en cascada.
   */
  const loadAll = (): void => {
    void portfolio.load()
    void inventory.load()
    void receivables.load()
    void mrr.load()
  }

  return { portfolio, inventory, receivables, mrr, loadAll }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/application/use-dashboard-blocks.spec.ts
```

Expected: PASS, los seis tests.

- [ ] **Step 5: Rewire the orchestrator — imports**

En `valanserh-landlord/app/pages/dashboard/script.ts`, sustituir las tres importaciones de composables por la de la fachada:

```ts
// ANTES
import { useDashboardTenants } from './application/use-dashboard-tenants'
import { useDeviceInventory } from './application/use-device-inventory'
import { useReceivables } from './application/use-receivables'

// DESPUÉS
import { useDashboardBlocks } from './application/use-dashboard-blocks'
```

Y agregar, junto a los demás `import type` del dominio:

```ts
import type { MrrSnapshot } from './domain/mrr.interface'
```

- [ ] **Step 6: Rewire the orchestrator — construcción de bloques**

Sustituir los tres bloques de construcción (`const portfolio = useDashboardTenants({...})`, `const inventory = useDeviceInventory({...})`, `const receivables = useReceivables({...})`) por:

```ts
    // Los bloques se construyen en la fachada: este orquestador solo traduce su
    // estado a lo que el template pinta.
    const blocks = useDashboardBlocks({
      apiFetch,
      messages: {
        portfolioError: i18n.t('db_error_portfolio'),
        inventoryError: i18n.t('db_error_inventory'),
        receivablesError: i18n.t('db_receivables_error'),
        mrrError: i18n.t('db_mrr_error')
      }
    })

    const { portfolio, inventory, receivables, mrr } = blocks
```

El resto del archivo sigue usando `portfolio.*`, `inventory.*` y `receivables.*` sin cambios.

- [ ] **Step 7: Rewire the orchestrator — lecturas derivadas del MRR**

Agregar, después del bloque de `seatIncreaseDebtTotal` (para que las lecturas de dinero queden juntas):

```ts
    /**
     * MRR actual neto ya formateado en pesos: lo que la plataforma factura al mes
     * por las suscripciones activas, con los descuentos de cada cliente ya
     * aplicados y sin IVA.
     *
     * Se lee tal cual del agregado del API. Aquí no se suma con el proyectado ni
     * se calcula ninguna cifra combinada: son dos números de naturaleza distinta
     * —lo contratado y lo que está en juego— y juntarlos sobreestimaría el
     * ingreso (regla 3).
     */
    const mrrCurrentTotal = computed<string>(() =>
      formatCentsAsMxn(mrr.snapshot.value?.currentNetCents ?? 0)
    )

    /**
     * Proyectado de las pruebas en curso, ya formateado en pesos: lo que sumarían
     * al ingreso si convirtieran. No es dinero que ya se tenga, y por eso vive en
     * su propia tarjeta y con su propio acento.
     */
    const mrrTrialTotal = computed<string>(() =>
      formatCentsAsMxn(mrr.snapshot.value?.trialProjectedCents ?? 0)
    )

    /**
     * El ingreso está vacío solo si el API confirmó que no hay ninguna suscripción
     * activa **ni** en prueba. No se deduce de un total en cero: mientras no haya
     * respuesta el total es cero por omisión, y eso sería confundir "no sé" con
     * "no hay nada contratado" (CA-8).
     */
    const isMrrEmpty = computed<boolean>(() => {
      const snapshot: MrrSnapshot | null = mrr.snapshot.value
      if (!mrr.hasLoadedOnce.value || mrr.hasError.value || snapshot === null) return false
      return snapshot.activeSubscriptions === 0 && snapshot.trialSubscriptions === 0
    })

    /** Primera carga del ingreso en curso: se pinta el esqueleto, nunca un cero. */
    const isMrrLoading = computed<boolean>(() => mrr.loading.value && !mrr.hasLoadedOnce.value)

    /**
     * Advertencia de que la cifra cruza monedas (CA-10).
     *
     * La plataforma opera en una sola moneda por supuesto declarado, no por regla
     * del sistema. Cuando el API reporta más de una, la vista lo dice en lugar de
     * presentar una suma de monedas distintas como si fuera un solo importe.
     * `null` con una sola moneda: sin advertencia y sin espacio reservado.
     */
    const mrrCurrencyWarning = computed<string | null>(() => {
      const currencies = mrr.snapshot.value?.currencies ?? []
      if (currencies.length <= 1) return null

      return i18n.t('db_mrr_multicurrency_warning', {
        codigos: currencies.map((currency) => currency.code).join(', ')
      })
    })

    /** Carga o recarga las dos tarjetas de ingreso. Es el handler de su reintento. */
    const loadMrr = (): void => {
      void mrr.load()
    }
```

- [ ] **Step 8: Rewire the orchestrator — montaje y retorno**

Sustituir el `onMounted` por:

```ts
    // Cada bloque carga por su cuenta: si uno falla, los otros ya están en pantalla.
    onMounted(() => {
      today.value = new Date()
      blocks.loadAll()
    })
```

Y agregar al objeto que `setup` retorna, junto a las lecturas de dinero:

```ts
      mrrCurrentTotal,
      mrrTrialTotal,
      isMrrEmpty,
      isMrrLoading,
      mrrHasError: mrr.hasError,
      mrrError: mrr.errorMessage,
      mrrCurrencyWarning,
      loadMrr,
```

- [ ] **Step 9: Add the error message key**

En `valanserh-landlord/app/pages/dashboard/domain/locales/dashboard.es.json`, agregar (el resto de las claves del MRR entra en Task 6):

```json
  "db_mrr_error": "No se pudo cargar el ingreso mensual recurrente. Inténtalo de nuevo.",
```

- [ ] **Step 10: Run the whole dashboard suite — nada se rompió con el recableado**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard
```

Expected: PASS. `index.spec.ts` no debería mover una sola aserción: la fachada construye los mismos composables sobre los mismos repositorios, y los espías de `index.spec.ts` siguen interceptando en la capa de infraestructura. Si algún test falla aquí, el recableado cambió comportamiento y hay que corregir el recableado, **no** el test.

- [ ] **Step 11: Typecheck y convenciones**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm check:conventions && pnpm typecheck && pnpm lint
```

Expected: sin errores. `check:conventions` exige el `.spec.ts` colocado de `use-dashboard-blocks.ts`, que el paso 1 ya creó.

- [ ] **Step 12: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/application/use-dashboard-blocks.ts app/pages/dashboard/application/use-dashboard-blocks.spec.ts app/pages/dashboard/script.ts app/pages/dashboard/domain/locales/dashboard.es.json
git commit -m "refactor(dashboard): build the tablero blocks in a facade and wire the MRR block"
```

---

## Task 6: Landlord — las dos tarjetas en la franja ejecutiva

**Files:**
- Modify: `valanserh-landlord/app/pages/dashboard/index.vue`
- Modify: `valanserh-landlord/app/pages/dashboard/domain/locales/dashboard.es.json`
- Modify: `valanserh-landlord/app/pages/dashboard/style.scss`
- Test: `valanserh-landlord/app/pages/dashboard/index.spec.ts`

**Interfaces:**
- Consumes del orquestador (Task 5): `mrrCurrentTotal`, `mrrTrialTotal`, `isMrrEmpty`, `isMrrLoading`, `mrrHasError`, `mrrError`, `mrrCurrencyWarning`, `loadMrr`. Y de `<MetricCard>` (orden 1): props `label`, `value`, `hint`, `tone`, `loading`, `empty`, `emptyMessage`, `hasError`, `errorMessage`, `retryLabel`; evento `retry`; slot `#footer`.
- Produces: nada consumible por otras tareas. Es la punta de la rebanada.

**Las dos tarjetas encabezan la franja** porque la HU pide que el ingreso sea "la primera cifra que se ve al abrir el panel". Cada una ocupa dos de las cuatro columnas del grid: **nunca comparten celda** (CA-7) y la fila queda completa sin celdas huérfanas.

**Ningún estado combinado.** Las dos tarjetas comparten `hasError`, `loading` y `empty` porque salen del mismo viaje, pero **no** comparten valor ni etiqueta y no existe una tercera tarjeta ni un pie con su suma.

- [ ] **Step 1: Desacoplar los selectores posicionales de `index.spec.ts`**

Seis aserciones de `index.spec.ts` dicen "la tarjeta de la franja que no es la de cartera vencida" para referirse a las cinco de la cartera de empresas. Con las dos tarjetas de MRR al frente, esa frase deja de significar lo que quiere decir. En **todo el archivo**, reemplazar:

```
.metric-card:not(.dashboard__kpi--receivables)
```

por:

```
.metric-card:not(.dashboard__kpi--receivables):not(.dashboard__kpi--mrr)
```

Son seis apariciones (dos `findAll` con `toHaveLength(5)`, un `findAll` más, y tres `find` de `.metric-card__hint` / `.metric-card__value`). Los conteos de `5` **no cambian**: siguen siendo el total de la cartera más sus cuatro estados.

Las dos aserciones sobre `.dashboard__kpis .metric-card__info-icon` no se tocan: las tarjetas de MRR no reciben `tooltip`, así que no pintan ícono y el primer ícono de la franja sigue siendo el del total de la cartera.

- [ ] **Step 2: Agregar el mock por omisión del bloque nuevo**

En `index.spec.ts`, importar el repositorio y la fábrica, y sumarlo al `beforeEach` que ya deja cargando bien a los vecinos:

```ts
import * as mrrRepo from './infrastructure/mrr.repository'
import type { MrrSnapshot } from './domain/mrr.interface'
```

```ts
  const makeMrrSnapshot = (overrides: Partial<MrrSnapshot> = {}): MrrSnapshot => ({
    currentNetCents: 1250000,
    activeSubscriptions: 4,
    trialProjectedCents: 200000,
    trialSubscriptions: 1,
    currencies: [{ code: 'MXN', subscriptions: 5 }],
    calculatedAt: '2026-09-08',
    ...overrides
  })

  // Por omisión el parque, la cartera vencida y el ingreso recurrente cargan
  // bien: los tests de un bloque no deben depender de que el vecino falle. Cada
  // grupo redefine el suyo.
  beforeEach(() => {
    vi.spyOn(inventoryRepo, 'getDeviceInventorySummary').mockResolvedValue(makeInventorySummary())
    vi.spyOn(receivablesRepo, 'getReceivables').mockResolvedValue(makeReceivables())
    vi.spyOn(mrrRepo, 'getPlatformMrr').mockResolvedValue(makeMrrSnapshot())
  })
```

- [ ] **Step 3: Write the failing tests**

Agregar al final del `describe('dashboardPage', ...)` de `index.spec.ts`:

```ts
  it('CA-7 — las dos cifras de ingreso encabezan la franja, en celdas distintas', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    const actual = wrapper.find('.dashboard__executive .dashboard__kpi--mrr-actual')
    const proyectado = wrapper.find('.dashboard__executive .dashboard__kpi--mrr-trial')

    expect(actual.exists()).toBe(true)
    expect(proyectado.exists()).toBe(true)
    // Dos elementos distintos del grid: ni anidados ni en la misma celda.
    expect(actual.element).not.toBe(proyectado.element)
    expect(actual.classes()).not.toContain('dashboard__kpi--full')
    expect(proyectado.classes()).not.toContain('dashboard__kpi--full')

    // Son las dos primeras lecturas de la franja: es la cifra con la que
    // dirección abre la conversación sobre el negocio.
    const franja = wrapper.findAll('.dashboard__kpis .metric-card')
    expect(franja[0]!.classes()).toContain('dashboard__kpi--mrr-actual')
    expect(franja[1]!.classes()).toContain('dashboard__kpi--mrr-trial')
  })

  it('CA-7 — cada tarjeta declara su base y ninguna vista muestra su suma', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    const actual = wrapper.find('.dashboard__kpi--mrr-actual')
    const proyectado = wrapper.find('.dashboard__kpi--mrr-trial')

    expect(actual.find('.metric-card__label').text()).toBe('MRR actual neto')
    expect(actual.find('.metric-card__value').text()).toBe('$12,500.00')
    expect(actual.text()).toContain('neto de descuentos · sin IVA')

    expect(proyectado.find('.metric-card__label').text()).toBe('MRR proyectado (pruebas)')
    expect(proyectado.find('.metric-card__value').text()).toBe('$2,000.00')
    expect(proyectado.text()).toContain('si convierten · sin IVA')

    // $12,500.00 + $2,000.00 = $14,500.00. Ese importe no puede existir en
    // ninguna parte del tablero: el proyectado no es dinero que ya se tenga.
    expect(wrapper.text()).not.toContain('$14,500.00')
  })

  it('CA-8 — sin suscripciones activas ni en prueba las dos tarjetas lo dicen con palabras', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [],
      meta: { total: 0, page: 1, limit: 100, lastPage: 1 }
    })
    vi.spyOn(mrrRepo, 'getPlatformMrr').mockResolvedValue(
      makeMrrSnapshot({
        currentNetCents: 0,
        activeSubscriptions: 0,
        trialProjectedCents: 0,
        trialSubscriptions: 0,
        currencies: []
      })
    )

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    const actual = wrapper.find('.dashboard__kpi--mrr-actual')
    const proyectado = wrapper.find('.dashboard__kpi--mrr-trial')

    expect(actual.find('.metric-card__empty').text()).toBe(
      'Aún no hay suscripciones activas ni en prueba.'
    )
    expect(proyectado.find('.metric-card__empty').text()).toBe(
      'Aún no hay suscripciones activas ni en prueba.'
    )
    // Ni un importe en blanco ni un cero sin contexto.
    expect(actual.find('.metric-card__value').exists()).toBe(false)
    expect(proyectado.find('.metric-card__value').exists()).toBe(false)
  })

  it('CA-9 — el fallo del ingreso solo apaga sus dos tarjetas, con reintento propio', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })
    const spy = vi
      .spyOn(mrrRepo, 'getPlatformMrr')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(makeMrrSnapshot())

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    const actual = wrapper.find('.dashboard__kpi--mrr-actual')
    const proyectado = wrapper.find('.dashboard__kpi--mrr-trial')

    expect(actual.find('.metric-card__error').exists()).toBe(true)
    expect(proyectado.find('.metric-card__error').exists()).toBe(true)
    expect(wrapper.text()).toContain('No se pudo cargar el ingreso mensual recurrente.')

    // El resto de la franja y el detalle de abajo siguen usables.
    expect(wrapper.find('.dashboard__kpi--full .metric-card__value').text()).toBe('1')
    expect(wrapper.find('.dashboard__kpi--receivables .metric-card__value').text()).toBe(
      '$17,400.00'
    )

    await actual.find('.metric-card__error button').trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(2)
    expect(actual.find('.metric-card__error').exists()).toBe(false)
    expect(wrapper.find('.dashboard__kpi--mrr-actual .metric-card__value').text()).toBe(
      '$12,500.00'
    )
  })

  it('CA-9 — el reintento del ingreso no recarga los demás bloques', async () => {
    const portfolioSpy = vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })
    vi.spyOn(mrrRepo, 'getPlatformMrr').mockRejectedValue(new Error('network error'))

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    await wrapper.find('.dashboard__kpi--mrr-actual .metric-card__error button').trigger('click')
    await flushPromises()

    expect(portfolioSpy).toHaveBeenCalledTimes(1)
    expect(receivablesRepo.getReceivables).toHaveBeenCalledTimes(1)
  })

  it('CA-10 — con más de una moneda avisa que la suma las cruza', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })
    vi.spyOn(mrrRepo, 'getPlatformMrr').mockResolvedValue(
      makeMrrSnapshot({
        currencies: [
          { code: 'MXN', subscriptions: 5 },
          { code: 'USD', subscriptions: 1 }
        ]
      })
    )

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    const aviso = wrapper.find('.dashboard__mrr-warning')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('MXN, USD')
  })

  it('CA-10 — con una sola moneda no muestra ninguna advertencia', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    expect(wrapper.find('.dashboard__mrr-warning').exists()).toBe(false)
  })

  it('pinta el esqueleto del ingreso mientras las cifras viajan, sin ceros', async () => {
    vi.spyOn(repo, 'getDashboardTenants').mockResolvedValue({
      tenants: [makeTenant('a', 'active')],
      meta: { total: 1, page: 1, limit: 100, lastPage: 1 }
    })
    vi.spyOn(mrrRepo, 'getPlatformMrr').mockImplementation(
      () => new Promise<MrrSnapshot>(() => {})
    )

    const wrapper = await mountSuspended(dashboardPage, mountOptions)
    await flushPromises()

    expect(
      wrapper.find('.dashboard__kpi--mrr-actual .metric-card__skeleton').exists()
    ).toBe(true)
    expect(wrapper.find('.dashboard__kpi--mrr-actual .metric-card__value').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('$0.00')
  })
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/index.spec.ts
```

Expected: FAIL en los ocho tests nuevos — `.dashboard__kpi--mrr-actual` no existe.

- [ ] **Step 5: Add the i18n keys**

En `valanserh-landlord/app/pages/dashboard/domain/locales/dashboard.es.json`: cambiar el título de la banda y agregar las claves del MRR junto a las de la cartera vencida.

```json
  "db_executive_title": "Panorama del negocio",
```

```json
  "db_mrr_actual_label": "MRR actual neto",
  "db_mrr_actual_hint": "neto de descuentos · sin IVA",
  "db_mrr_trial_label": "MRR proyectado (pruebas)",
  "db_mrr_trial_hint": "si convierten · sin IVA",
  "db_mrr_empty": "Aún no hay suscripciones activas ni en prueba.",
  "db_mrr_multicurrency_warning": "Las suscripciones están contratadas en más de una moneda ({codigos}) y la cifra las suma sin convertirlas.",
```

`db_mrr_error` ya se agregó en Task 5.

- [ ] **Step 6: Add the two cards**

En `valanserh-landlord/app/pages/dashboard/index.vue`, dentro de `<div class="dashboard__kpis">` y **antes** del primer `<MetricCard v-if="hasError" ...>` de la cartera:

```vue
          <div class="dashboard__kpis">
            <!-- Las dos cifras del ingreso recurrente encabezan la franja: es lo
                 primero que dirección viene a ver y con lo que abre la
                 conversación sobre el negocio. Van en dos celdas distintas del
                 grid, con etiquetas y acentos distintos, y en ninguna parte del
                 tablero existe su suma: el actual es lo que ya está contratado y
                 activo, el proyectado es lo que sumaría si las pruebas
                 convierten, y juntarlos sobreestimaría el ingreso (regla 3).
                 Comparten estado de carga y de error porque salen del mismo
                 viaje; el reintento de cualquiera de las dos recarga solo este
                 bloque. -->
            <MetricCard
              v-if="mrrHasError"
              class="dashboard__kpi dashboard__kpi--mrr dashboard__kpi--mrr-actual"
              :label="$t('db_mrr_actual_label')"
              tone="success"
              has-error
              :error-message="mrrError"
              :retry-label="$t('db_btn_retry')"
              @retry="loadMrr"
            />

            <MetricCard
              v-else
              class="dashboard__kpi dashboard__kpi--mrr dashboard__kpi--mrr-actual"
              :label="$t('db_mrr_actual_label')"
              :value="mrrCurrentTotal"
              :hint="$t('db_mrr_actual_hint')"
              tone="success"
              :empty="isMrrEmpty"
              :empty-message="$t('db_mrr_empty')"
              :loading="isMrrLoading"
            >
              <!-- El aviso multimoneda cuelga de la tarjeta del actual, que es la
                   cifra con la que se toman decisiones. Solo aparece cuando el API
                   reporta más de una moneda: la plataforma opera en pesos por
                   supuesto declarado, no por regla del sistema, y callarlo sería
                   sumar peras con manzanas en silencio. -->
              <template #footer>
                <p v-if="mrrCurrencyWarning" class="dashboard__mrr-warning">
                  {{ mrrCurrencyWarning }}
                </p>
              </template>
            </MetricCard>

            <MetricCard
              v-if="mrrHasError"
              class="dashboard__kpi dashboard__kpi--mrr dashboard__kpi--mrr-trial"
              :label="$t('db_mrr_trial_label')"
              tone="info"
              has-error
              :error-message="mrrError"
              :retry-label="$t('db_btn_retry')"
              @retry="loadMrr"
            />

            <MetricCard
              v-else
              class="dashboard__kpi dashboard__kpi--mrr dashboard__kpi--mrr-trial"
              :label="$t('db_mrr_trial_label')"
              :value="mrrTrialTotal"
              :hint="$t('db_mrr_trial_hint')"
              tone="info"
              :empty="isMrrEmpty"
              :empty-message="$t('db_mrr_empty')"
              :loading="isMrrLoading"
            />

            <MetricCard
              v-if="hasError"
              class="dashboard__kpi dashboard__kpi--full"
              :label="$t('db_kpi_total')"
              has-error
              :error-message="portfolioError"
              :retry-label="$t('db_btn_retry')"
              @retry="loadPortfolio"
            />
```

El resto del bloque de la franja no cambia.

- [ ] **Step 7: Add the styles**

En `valanserh-landlord/app/pages/dashboard/style.scss`, dentro de `&__kpi`, después del modificador `&--full`:

```scss
    // Las dos cifras de ingreso encabezan la franja, media fila cada una: dos
    // celdas de las cuatro. Nunca comparten celda (CA-7) y la fila queda
    // completa sin dejar una celda huerfana. En pantallas de dos columnas o
    // menos cada una toma la fila entera: partir un importe grande en una
    // columna angosta lo vuelve ilegible.
    &--mrr {
      grid-column: span 2;

      @media (--bp-lg-down) {
        grid-column: 1 / -1;
      }
    }
```

Y como hermano de `&__aging-empty` (mismo nivel que los demás bloques de `.dashboard`):

```scss
  &__mrr-warning {
    margin: var(--space-2) 0 0;
    font-size: var(--text-xs);
    color: var(--color-fg-muted);
  }
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm vitest run app/pages/dashboard/index.spec.ts
```

Expected: PASS, incluidos los ocho nuevos y los que se desacoplaron en el paso 1.

- [ ] **Step 9: Validación completa del repo**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
pnpm validate
```

Expected: verde en `lint`, `lint:styles`, `check:conventions`, `typecheck` y `test`. `lint:styles` es el que detecta un color literal en el estilo nuevo; `check:conventions` el `.spec.ts` faltante.

- [ ] **Step 10: Commit**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord
git add app/pages/dashboard/index.vue app/pages/dashboard/index.spec.ts app/pages/dashboard/style.scss app/pages/dashboard/domain/locales/dashboard.es.json
git commit -m "feat(dashboard): lead the executive strip with the net and projected MRR figures"
```

---

## Task 7: QA — seeder y manual de prueba manual

**Files:**
- Modify: `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado)
- Create: `valanserh-landlord/docs/superpowers/plans/2026-09-08-mrr-actual-neto-y-proyectado-qa-flujo.md` (no versionado)

**Interfaces:**
- Consumes: `BillingPlan`, `BillingPlanPrice`, `BillingSubscription`, `BusinessUnit`, `Person`, `User` y la constante `QA_PASSWORD`, todos ya importados en el seeder.
- Produces: el usuario `qa-mrr-admin@gsti-tests.local` y tres suscripciones con nombre reconocible. Nada que consuma otra tarea.

**Es un manual de frontend, no de API.** La HU entrega dos tarjetas en una banda que dirección lee en el navegador; el endpoint es la plomería que las alimenta y no tiene variantes de permiso que recorrer a mano (dentro del panel de plataforma no hay permisos diferenciados, y el rechazo a quien no es administrador lo cubre Task 2). Las órdenes 5, 6 y 8 —también fullstack— entregaron solo su `-qa-flujo.md`. Se sigue ese precedente y **no** se escribe manual de API.

**Constantes del proyecto** (tomadas del manual de la orden 8, `valanserh-landlord/docs/superpowers/plans/2026-09-04-adeudo-por-aumento-segundo-numero-qa-flujo.md`, no inventadas):

| Constante | Valor |
|---|---|
| URL del tablero | `http://127.0.0.1:3000/dashboard` — **sin** prefijo `/es` |
| Menú lateral | **Dashboard** |
| Login | botón **Continuar con contraseña** → campos **Correo electrónico** y **Contraseña** → botón **Entrar** |
| Seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`, desde `gsti-rh-api` |
| Dominio de prueba | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

**Qué NO se siembra, y por qué:** una suscripción en moneda extranjera haría verificable la advertencia multimoneda, pero dejaría la cifra de ingreso de **toda la plataforma** cruzando monedas para cualquiera que comparta esta base. Es un efecto global por un caso de UI que el test de página ya cubre. Se declara como no revisable en el manual.

**Por qué el subtotal y el total son distintos en los fixtures:** las dos tarjetas declaran "sin IVA". Si el fixture sembrara subtotal igual al total (como hace `seedActiveSubscriptionQa`, que se usa para casos de cartera), la afirmación no tendría cómo fallar.

- [ ] **Step 1: Registrar la HU en el encabezado del seeder**

En `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`, la lista de historias del comentario de encabezado termina hoy en la línea 10. Cerrar el renglón de la orden 8 y agregar el de ésta:

```ts
 * USRH1788052455652 adeudo por aumento como segundo número de la deuda +
 * USRH1788052455653 MRR actual neto y proyectado de pruebas en la franja).
```

- [ ] **Step 2: Add the seeder helper**

En `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`, junto a `seedActiveSubscriptionQa`:

```ts
/**
 * Empresa QA con una suscripción cuyo trato congelado tiene el subtotal SIN IVA
 * separado del total: es lo que hace verificable que el MRR reporte el neto.
 *
 * `unitAmount` va por parámetro para poder sembrar un caso con descuento, donde
 * `precio unitario × asientos` queda por arriba del subtotal sellado.
 *
 * @param params - Identidad de la empresa, estado y cifras congeladas de la suscripción.
 */
async function seedMrrSubscriptionQa(params: {
  slug: string
  name: string
  status: 'active' | 'trialing'
  /** Subtotal congelado SIN IVA, en pesos. Es lo que el MRR suma. */
  contractedSubtotal: number
  /** Precio unitario congelado. Con descuento queda por arriba de `contractedSubtotal / asientos`. */
  contractedUnitAmount: number
  contractedEmployees: number
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

  const taxAmount = Math.round(params.contractedSubtotal * 0.16 * 100) / 100

  await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: plan.billingPlanId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: params.status,
    billingSubscriptionContractedUnitAmount: params.contractedUnitAmount,
    billingSubscriptionContractedEmployees: params.contractedEmployees,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: params.status === 'trialing' ? 14 : 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: params.contractedSubtotal,
    billingSubscriptionContractedTaxAmount: taxAmount,
    billingSubscriptionContractedTotal: params.contractedSubtotal + taxAmount,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionTrialEndsAt: params.status === 'trialing' ? now.plus({ days: 14 }) : null,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })
}
```

- [ ] **Step 3: Add the seeder entry point**

En el mismo archivo, después de `seedSeatIncreaseDebtQa`:

```ts
/**
 * USRH1788052455653 — MRR actual neto y proyectado en la franja ejecutiva.
 *
 * Tres suscripciones, elegidas para que las dos tarjetas tengan algo que decir:
 *   - QA MRR Con Descuento: activa, con precio de lista de $6,500.00 (10 × $650.00)
 *     y subtotal sellado de $5,000.00. Es el caso de la regla 2: la tarjeta debe
 *     sumar el sellado, no el de lista.
 *   - QA MRR Sin Descuento: activa, $3,000.00 sin IVA. Acompaña a la anterior para
 *     que el actual no dependa de un solo registro.
 *   - QA MRR En Prueba: en periodo de prueba, $2,000.00 sin IVA. Es lo único que
 *     garantiza que la tarjeta del proyectado no salga vacía.
 *
 * Las tres traen el subtotal SIN IVA separado del total, que es lo que hace
 * verificable el "sin IVA" de las tarjetas.
 *
 * NO se siembra ninguna suscripción en moneda extranjera: haría verificable la
 * advertencia multimoneda, pero dejaría la cifra de ingreso de toda la plataforma
 * cruzando monedas para cualquiera que comparta esta base.
 *
 * El vacío de las dos tarjetas tampoco se siembra: exigiría dejar la plataforma
 * sin una sola suscripción activa ni en prueba. Queda declarado como no revisable
 * en el manual.
 */
async function seedMrrQa(): Promise<void> {
  const platformAdminEmail = 'qa-mrr-admin@gsti-tests.local'
  const person = await Person.firstOrCreate(
    { personEmail: platformAdminEmail },
    {
      personFirstname: 'QA',
      personLastname: 'Mrr',
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

  await seedMrrSubscriptionQa({
    slug: 'qa-mrr-con-descuento',
    name: 'QA MRR Con Descuento',
    status: 'active',
    contractedSubtotal: 5000,
    contractedUnitAmount: 650,
    contractedEmployees: 10,
  })

  await seedMrrSubscriptionQa({
    slug: 'qa-mrr-sin-descuento',
    name: 'QA MRR Sin Descuento',
    status: 'active',
    contractedSubtotal: 3000,
    contractedUnitAmount: 300,
    contractedEmployees: 10,
  })

  await seedMrrSubscriptionQa({
    slug: 'qa-mrr-en-prueba',
    name: 'QA MRR En Prueba',
    status: 'trialing',
    contractedSubtotal: 2000,
    contractedUnitAmount: 200,
    contractedEmployees: 10,
  })

  console.log('[qa-seeder] mrr: dos activas (una con descuento) y una en prueba')
}
```

Y registrar la llamada en `run()`, inmediatamente después de `await seedSeatIncreaseDebtQa()`:

```ts
    await seedMrrQa()
```

- [ ] **Step 4: Run the seeder**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: termina sin error y en la salida aparece `[qa-seeder] mrr: dos activas (una con descuento) y una en prueba`.

- [ ] **Step 5: Write the manual test playbook**

Crear `valanserh-landlord/docs/superpowers/plans/2026-09-08-mrr-actual-neto-y-proyectado-qa-flujo.md`:

````markdown
# Prueba manual — El ingreso mensual recurrente en la franja ejecutiva

**Problema:** Nadie en la empresa podía decir cuánto factura Valanserh al mes sin abrir una hoja de cálculo. El número existía, pero repartido: cada cliente tiene su suscripción, sus asientos, su precio y su descuento, y para saber el total había que ir cliente por cliente. Lo que se contestaba en las juntas era una estimación, y una distinta según quién la hiciera.

**Solución:** El tablero de plataforma abre con dos cifras nuevas, arriba y a la vista: el ingreso mensual recurrente actual —ya con los descuentos que se le dieron a cada cliente y sin impuestos— y, aparte, lo que sumarían las pruebas en curso si convirtieran. Son dos números separados a propósito: el primero es lo que ya se factura, el segundo es lo que está en juego.

Validar que las dos cifras se lean como dos, nunca como un total y su subtotal; que cada una diga en qué base está expresada; y que un fallo del ingreso no tumbe el resto del tablero.

---

## Glosario

- **MRR (ingreso mensual recurrente):** la suma de lo que la plataforma factura al mes por las suscripciones que están vigentes.
- **Neto:** con el descuento del cliente ya aplicado y sin impuestos.
- **Proyectado de pruebas:** lo que sumarían al ingreso las suscripciones que hoy están en periodo de prueba, si convirtieran. No es dinero que ya se tenga.
- **Franja ejecutiva:** la banda de tarjetas de la parte de arriba del tablero, de lectura rápida para dirección.
- **Morosidad:** el estado de una suscripción cuyo periodo de pago venció sin que se registrara el pago.
- **Asientos:** las plazas de empleado que una empresa tiene contratadas; es la cantidad sobre la que se calcula su precio.

---

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Eso deja listo el usuario de plataforma de esta prueba y siembra tres suscripciones: dos activas (una de ellas con descuento) y una en periodo de prueba. Contraseña: **`password`**.

---

## 2. Usuarios

| | Correo | Contraseña | Qué debe pasar |
|---|---|---|---|
| **A** | `qa-mrr-admin@gsti-tests.local` | `password` | Entra a la consola de plataforma y ve las dos tarjetas de ingreso al abrir el tablero |

No hay usuario B: dentro del panel de plataforma no hay permisos diferenciados, y el rechazo a quien no es administrador de plataforma lo verifica el API, no este manual.

---

## 3. Dónde probar

Consola de plataforma — el tablero se abre al iniciar sesión y también desde el menú lateral, opción **Dashboard**.

URL: `http://127.0.0.1:3000/dashboard`

La dirección no lleva `/es`.

El bloque de esta prueba es la banda de tarjetas de arriba, la primera cosa que se ve: no hay que bajar ni cambiar de pestaña.

---

## 4. Usuario A — qué verificar

Inicia sesión con el Usuario A: botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña**, botón **Entrar**.

### Aviso de ambiente honesto

Las dos cifras son de **toda la plataforma**, así que incluyen las suscripciones que sembraron las pruebas anteriores además de las tres de esta. Por eso este manual **no pide un importe exacto** en ninguna de las dos tarjetas: pide que no estén en cero, que sean distintas entre sí, y que cada una diga lo que dice. Los tres registros de esta prueba se reconocen por su nombre —**QA MRR Con Descuento**, **QA MRR Sin Descuento** y **QA MRR En Prueba**— en el listado de empresas, no en las tarjetas.

### 4.1 Las dos cifras encabezan el tablero

1. La banda de arriba se titula **Panorama del negocio**.
2. Las **dos primeras** tarjetas de esa banda son **MRR actual neto** y **MRR proyectado (pruebas)**, en ese orden, una al lado de la otra y cada una en su propio recuadro.
3. Las tarjetas de la cartera de empresas (**Empresas en la cartera**, **En prueba**, **Activas**, **Pago vencido**, **Canceladas**) siguen ahí, debajo de las dos nuevas.
4. Los dos importes están en pesos, con centavos, y ninguno de los dos está en `$0.00`.
5. Los dos importes son **distintos** entre sí.

### 4.2 Cada tarjeta dice en qué base está

1. Debajo del número de **MRR actual neto** dice **neto de descuentos · sin IVA**.
2. Debajo del número de **MRR proyectado (pruebas)** dice **si convierten · sin IVA**.
3. **Negativo a comprobar a propósito:** en ninguna parte de la banda —ni en una tercera tarjeta, ni debajo de las dos, ni en un pie— hay un número que sea la suma de las dos. Si ves un total combinado, aunque diga "total de ingreso" o "de referencia", está mal: el proyectado no es dinero que la empresa ya tenga, y sumarlo al actual sobreestima lo que se factura.
4. Las dos tarjetas se ven como dos lecturas del mismo rango, no como un número grande y su desglose: ninguna está anidada dentro de la otra ni presentada como parte de la otra.

### 4.3 La otra cifra de dinero del tablero no se confunde con éstas

1. Baja al recuadro de detalle operativo, pestaña **Cobranza**.
2. La tarjeta de **Cartera vencida** dice **con IVA · cobranza** debajo de su número.
3. Queda claro que es otra base: las dos de arriba van sin impuestos y ésta con impuestos. Cada tarjeta declara la suya, así que nadie las compara mal.

### 4.4 Error y recuperación

1. Apaga el API con `Ctrl+C` en su terminal y recarga el tablero.
2. **Las dos** tarjetas de ingreso muestran su propio aviso de error con su botón **Reintentar** (salen de la misma consulta, así que fallan juntas).
3. Mientras tanto, **el resto del tablero sigue usable**: las tarjetas de la cartera de empresas conservan sus números y el detalle de abajo sigue navegable.
4. Vuelve a encender el API y usa **Reintentar** en cualquiera de las dos tarjetas de ingreso.
5. Las dos se llenan de nuevo **sin recargar la página completa**, y ningún otro bloque del tablero parpadea ni vuelve a cargar.

### 4.5 Estados no revisables con esta base sembrada

- **Las dos tarjetas en su estado de "sin datos":** no se puede provocar aquí. Exigiría dejar a toda la plataforma sin una sola suscripción activa ni en prueba, y la base tiene varias de pruebas anteriores.
- **La advertencia de que la cifra cruza monedas:** no se puede provocar aquí, a propósito. Sembrar una suscripción en otra moneda dejaría la cifra de ingreso de toda la plataforma mezclando monedas para cualquiera que use esta base. El comportamiento queda cubierto por las pruebas automáticas del tablero.
- **Que el ingreso baje cuando un cliente cae en morosidad:** no es provocable desde el navegador — el estado lo cambia el reloj de cobranza, no una pantalla. Queda cubierto por las pruebas automáticas del API.
- **Que un cliente con descuento aporte su precio descontado y no el de lista:** tampoco es visible en una cifra agregada de toda la plataforma. Queda cubierto por las pruebas automáticas del API.

---

## 5. Checklist

- [ ] La opción **Dashboard** abre `http://127.0.0.1:3000/dashboard` sin agregar `/es`
- [ ] La banda de arriba se titula **Panorama del negocio**
- [ ] Las dos primeras tarjetas de la banda son **MRR actual neto** y **MRR proyectado (pruebas)**, en ese orden
- [ ] Cada una está en su propio recuadro, lado a lado, y ninguna está anidada en la otra
- [ ] Las cinco tarjetas de la cartera de empresas siguen presentes, debajo de las dos nuevas
- [ ] Los dos importes están en pesos con centavos y ninguno está en `$0.00`
- [ ] Los dos importes son distintos entre sí
- [ ] **MRR actual neto** dice **neto de descuentos · sin IVA** debajo de su número
- [ ] **MRR proyectado (pruebas)** dice **si convierten · sin IVA** debajo de su número
- [ ] En ningún lugar de la banda hay un número que sea la suma de las dos tarjetas
- [ ] En la pestaña **Cobranza**, **Cartera vencida** sigue declarando **con IVA · cobranza**
- [ ] Con el API apagado, las dos tarjetas de ingreso muestran su error y **Reintentar**, y el resto del tablero conserva sus números
- [ ] Al volver a encender el API, **Reintentar** llena las dos sin recargar la página y sin recargar los demás bloques
- [ ] Se deja asentado que el estado "sin datos" no se puede revisar con esta base
- [ ] Se deja asentado que la advertencia multimoneda no se siembra a propósito
- [ ] Se deja asentado que la baja del ingreso por morosidad y el descuento por cliente se verifican en el API, no aquí
````

- [ ] **Step 6: Levantar el ambiente y entregar el manual**

```bash
# Terminal 1
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api && pnpm dev
# Terminal 2
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord && pnpm dev
```

**El recorrido del manual lo camina una persona, no el agente.** No se automatiza con Playwright ni con ninguna herramienta de navegador: se deja el ambiente arriba y el manual listo, y ahí termina el trabajo del agente.

- [ ] **Step 7: Sin commit**

Los dos archivos están fuera de control de versiones (`.gitignore` del landlord y `.git/info/exclude` del API). Verificar que `git status` en los dos repos sale limpio:

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api && git status --short
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord && git status --short
```

Expected: sin cambios pendientes. Si el seeder o el manual aparecen, **no** se agregan: se revisa la exclusión.

---

## Cierre de la rebanada

- [ ] **Suites completas de los dos repos**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api && pnpm typecheck && pnpm lint && node ace test
cd /Users/noeabelvargaslopez/Documents/projects/valanserh-landlord && pnpm validate
```

- [ ] **Notas para el PR** (para Wilvardo, en los dos repos):
  1. El `key` del 500 del MRR es `error-inesperado-al-obtener-el-ingreso-mensual-recurrente` y no `error-inesperado` como decía la tabla del spec: se siguió la convención de la superficie de métricas que mergeó la orden 5. El `code` va literal (`PLT.MET.SYS_UNHANDLED`), que es el campo que el cliente consume.
  2. El título de la franja ejecutiva pasó de "Cartera de empresas" a "Panorama del negocio", porque la banda dejó de ser solo cartera. Las dos tarjetas de MRR la encabezan, como pide la HU ("la primera cifra que se ve al abrir el panel").
  3. Nació la fachada `use-dashboard-blocks.ts`; el `script.ts` del dashboard ya no construye composables. Decisión de `architecture.md` (R3 del 03-frontend) tomada de antemano en el spec.
  4. El endpoint monta el grupo con prefijo `/api/platform/metrics` y la ruta `/mrr` adentro, para que la orden 9 agregue `mrr-series` al mismo grupo.
  5. Advertencia que hereda la orden 9: `mrr` mide **contratado vigente hoy**; `mrr-series` medirá **ingreso cobrado por periodo**. El último punto de la serie **no** va a coincidir con la cifra de la franja, y los nombres de campo lo llevan encima a propósito (`mrrActualNetoCents` vs `mrrCobradoNetoCents`).

---

## Self-Review

**Cobertura del spec.** Los diez criterios de aceptación tienen tarea y prueba: CA-1, CA-2, CA-4, CA-5 y CA-6 en Task 1 (con CA-2 verificado además por inspección del archivo del servicio, como pide el spec); CA-3 en Task 1, Task 2 y Task 3, en las tres capas donde podría colarse un campo con la suma; CA-7, CA-8, CA-9 y CA-10 en Task 6; CA-10 también en Task 1 (el reparto por moneda) y Task 2 (su forma en el payload). El DoD queda cubierto punto por punto salvo los tres últimos —PR, staging y producción—, que son del proceso y no de este plan.

**Lo que el spec pedía y este plan no hace, a propósito:** el `key` del 500 (drift 3), y nada más. El desglose por grupo económico, la serie mensual, las metas de ingreso, el caché y las migraciones están declarados fuera de alcance por el propio spec.

**Consistencia de tipos.** Los nombres del contrato (`mrrActualNetoCents`, `suscripcionesActivas`, `mrrProyectadoTrialCents`, `suscripcionesEnPrueba`, `monedas[].codigo`, `monedas[].suscripciones`, `calculadoAl`) son los mismos en `PlatformMrrSnapshot` (Task 1), en el `@responseBody` (Task 2), en `MrrSnapshotRaw` (Task 3) y en los mocks de los tests. Los nombres de dominio del landlord (`currentNetCents`, `activeSubscriptions`, `trialProjectedCents`, `trialSubscriptions`, `currencies[].code`, `currencies[].subscriptions`, `calculatedAt`) son los mismos en `MrrSnapshot`, en el mapeo del repositorio, en `UseMrrReturn` y en las lecturas derivadas del orquestador. Los tipos de retorno de los composables (`UseDashboardTenantsReturn`, `UseDeviceInventoryReturn`, `UseReceivablesReturn`, `UseMrrReturn`) son los que la fachada declara y los que ya exportan los archivos existentes.

**Riesgo residual conocido.** El único cambio con efecto sobre trabajo ajeno es el reordenamiento de la franja, y su consecuencia está acotada y enumerada: seis selectores de `index.spec.ts` que hoy dicen "la tarjeta de la franja que no es la de cartera" (Task 6, paso 1) y el mock por omisión del bloque nuevo (paso 2). El recableado de `script.ts` no debería mover ninguna aserción, y si lo hace es señal de que el recableado cambió comportamiento.

---

## Execution Handoff

Plan completo y guardado en `gsti-rh-api/docs/superpowers/plans/2026-09-08-mrr-actual-neto-y-proyectado-franja.md`.




