# Serie mensual de MRR reconstruida desde los pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**HU:** USRH1788052455654 · **Capability:** CAP-07-09-10 · **Orden:** 9
**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1788052455654.md`

**Goal:** Publicar `GET /api/platform/metrics/mrr-series`, una serie mensual de ingreso recurrente **cobrado** reconstruida a partir de los cobros ya registrados, con su ventana, la marca de confiabilidad de cada mes y el conteo de cobros que quedaron fuera por no tener periodo.

**Architecture:** Extensión in situ de la superficie de MRR que dejó la orden 8. No nace ningún módulo: `platform_mrr_service.ts` gana el cálculo de la serie, `platform_mrr_controller.ts` gana el método `series`, `platform_mrr_routes.ts` gana una línea y `platform_metric.ts` gana el validador de la ventana. El cálculo se parte en dos mitades que se prueban por separado: la **lectura SQL** (universo de cobros de suscripciones vivas de empresas vivas, con los `deleted_at IS NULL` a mano) y un **núcleo puro exportado** (`buildMrrSeries`) que recibe las filas y el mes en curso por parámetro y arma la serie sin tocar BD ni reloj. Esa separación es lo que hace verificables las reglas duras de la HU —serie vacía, meses en cero marcados, precedencia de motivos— contra una base de pruebas compartida que ya trae cobros de otros fixtures.

**Tech Stack:** `gsti-rh-api` — AdonisJS 6, Lucid, Knex crudo (`db.from`), Luxon, Japa. Cero migraciones, cero modelos nuevos, cero cambios en `valanserh-landlord`.

**Repo y rama:** todo ocurre en `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`, sobre la rama actual `feature/USRH1788052455654-serie-mensual-mrr-pagos`, que **ya contiene** el trabajo de la orden 8 (commits `e7de28be` y `4af98822`). No se crea rama, no se hace merge de nada y no se toca el landlord.

---

## Global Constraints

- TypeScript estricto. **Cero `any`**, cero `@ts-ignore`, cero `as unknown as`.
- Código y nombres de símbolos en inglés; JSDoc y comentarios **en español**. Los **nombres de campo del contrato del API van en español** (`mes`, `puntos`, `ventana`, `criterio`, `confiabilidad`), como todo el área de métricas. El sufijo `Cents` es obligatorio en todo campo de dinero.
- Archivos en `snake_case`.
- **La fuente es `billing_payments`. `billing_subscription_transitions` no se lee ni se escribe.** La premisa original de la HU fue desmentida y la decisión está cerrada: esa tabla solo guarda tres razones del reloj automático, no registra altas, cancelaciones ni conversiones por pago, y entró a `multitenant` el 2026-07-28. Si aparece su nombre en el diff, está mal.
- **No se lee el precio histórico desde `billing_subscriptions`.** Las columnas `contracted_*` se sobrescriben al aplicar un aumento de asientos: el precio de un mes pasado no es recuperable desde la suscripción. El cobro sí lo congela, y por eso la serie sale de `billing_payment_subtotal_cents`.
- **No se recalcula el neto desde `billing_payment_discount_percent`.** El catálogo ya admite descuentos que no son porcentaje (`DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'`) y recalcular reportaría precio de lista **sin fallar**. Riesgo silencioso.
- `billing_payment_subtotal_cents` **ya está en centavos enteros** (`integer unsigned`). **No se multiplica por 100** ni se convierte: eso solo aplica a las columnas `decimal` de la suscripción.
- Las consultas crudas de Knex **no** pasan por el hook de `SoftDeletes`. `billing_subscription_deleted_at IS NULL` y `business_unit_deleted_at IS NULL` van escritos a mano sobre cada tabla que la consulta toca.
- **`billing_payments` no tiene borrado lógico.** Es append-only: el modelo no declara `deletedAt` y la migración `1784300000014` no crea la columna. No se le agrega un filtro `deleted_at` — reventaría la consulta.
- **Nada rellena un mes vacío.** Ni con el mes anterior, ni con un promedio, ni con una estimación. Un mes sin cobros vale `0` y sale marcado con su motivo.
- **Un cobro sin periodo no se ubica en ningún mes.** Ni por la fecha de pago ni por ningún otro criterio. Se excluye y se cuenta.
- **Sin cobros con periodo la serie sale vacía**: `puntos: []` y `ventana: { desde: null, hasta: null }`. Nunca una lista de ceros.
- **Ningún modelo Lucid entra ni sale del servicio.** Prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`. El DTO se arma a mano sobre un `select` que nombra columnas. La respuesta es un agregado: no publica `business_unit_id`, `billing_subscription_id`, `billing_payment_id`, nombres de tenant, RFC ni perfil fiscal.
- **Solo lectura.** No abre transacción, no escribe, no agrega proceso programado, no materializa, no cachea.
- **Sin rate limiter.** Decisión declarada, coherente con que ninguna ruta de lectura del área `platform` lo lleva hoy.
- Los guards van **a nivel de grupo** y en este orden: `[middleware.auth({ guards: ['api'] }), middleware.platformAdmin()]`. El grupo ya existe.
- El 403 del guard sale **sin campo `code`**. Inconsistencia heredada de `platform_admin_middleware.ts`, declarada y **no corregida aquí**.
- Swagger **en español**, con el bloque `@swagger` **y** las anotaciones AdonisJS duplicadas, como el resto del área.
- Cero migraciones, cero seeders, cero cambios de modelo, cero archivos del landlord.

---

## Drift verificado contra el spec

Se validaron los anclajes del spec contra el código de la rama. El plan sigue el código, no el spec, en estos siete puntos.

1. **Los tres archivos que la HU edita ya existen y están mergeados en esta rama.** `platform_mrr_service.ts`, `platform_mrr_controller.ts` y `start/routes/platform_mrr_routes.ts` están en `HEAD`, con el grupo prefijado hasta `/api/platform/metrics` y un comentario que anticipa esta HU. La superficie común de errores (`platform_metric_error_codes.ts`, `platform_metric_service_error.ts`, `platform_metric_api_error.ts`) también. El riesgo R4 del spec —"si al implementar todavía no existe, la crea quien aterrice primero"— **no se materializó**. Nada que crear, todo que extender.

2. **Los anclajes de línea del spec están corridos.** El spec cita `billing_payment.ts:57,102,108,114`; las columnas viven en `:71` (`subtotalCents`), `:102` (`paidAt`), `:109` (`periodStart`) y `:115` (`periodEnd`). Lo mismo con `billing_payment_service.ts:399-416` (el bloque real es `:404-422`) y `platform_device_service.ts:152-154`. Drift trivial: se sigue el patrón, no el número.

3. **Se edita un quinto archivo que el spec no lista: `app/constants/platform_metric_error_codes.ts`.** CA-7 fija el título del 422 en `"No fue posible obtener la serie mensual de MRR"`, distinto del de la cifra (`"No fue posible obtener el ingreso mensual recurrente"`). El helper del área toma los títulos por parámetro, así que la serie necesita su propio juego `MRR_SERIES_METRIC_ERROR_TEXTS`. Se **agrega**; no se renombra ni se toca nada existente.

4. **El `key` del error no es `datos-invalidos`.** CA-7 lo pide así, pero la superficie compartida define la convención en su propio docblock: el `key` es el slug kebab del **título** y el `code` viaja aparte. Es la misma corrección que ya cerró el plan de la orden 8 (su drift #3) y que `RECEIVABLES_METRIC_ERROR_TEXTS` y `MRR_METRIC_ERROR_TEXTS` ya cumplen. **Decisión:** `key: 'no-fue-posible-obtener-la-serie-mensual-de-mrr'`. El `code` se respeta literal (`PLT.MET.VAL_INPUT`), que es el campo que el cliente consume, y el `detail` se respeta literal (`"El número de meses debe estar entre 1 y 24."`), que es lo que el criterio realmente asserta. **Anotar en el PR para Wilvardo** como corrección de la tabla del spec, no como cambio de contrato.

5. **`anterior-al-primer-pago` no se alcanza desde el endpoint.** La regla 8 recorta `ventana.desde` al mes del primer cobro con periodo, así que ningún mes de la ventana puede ser anterior a ese primero. El motivo sigue en la unión de tipos porque el contrato lo publica y el landlord lo lee, y la rama se implementa igual: el día que alguien afloje el recorte, el motivo tiene que salir solo en lugar de mentir con `sin-pagos-en-el-mes`. Se cubre con prueba unitaria directa sobre el helper puro, no vía HTTP.

6. **Se agrega un tope que el spec no menciona: `desde` nunca puede quedar después de `hasta`.** El primer cobro de una suscripción puede cubrir un periodo por adelantado, dejando su `period_start` en un mes futuro; sin el tope, `desde = max(mesEnCurso - meses + 1, mesPrimerPago)` saldría mayor que `hasta = mesEnCurso` y la ventana quedaría al revés. Con el tope, la serie devuelve un solo punto —el mes en curso, en cero y marcado— que es la lectura honesta de "todavía no hay historia".

7. **CA-5 (serie vacía) no se puede provocar en la base de pruebas.** Es compartida y ya trae cobros con periodo de otros fixtures; no hay forma de dejarla sin ninguno sin romper el resto de la suite. Por eso el cálculo se parte y CA-5 se fija como prueba unitaria del núcleo puro, que es donde vive la regla. La prueba funcional cubre lo que solo la BD puede romper: el universo y sus filtros.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| **EDITAR** `app/constants/platform_metric_error_codes.ts` | Agregar `MRR_SERIES_METRIC_ERROR_TEXTS`. Sin códigos nuevos: `VAL_INPUT` y `SYS_UNHANDLED` ya existen. |
| **EDITAR** `app/validators/platform_metric.ts` | Agregar `mrrSeriesValidator` (`meses` 1..24, opcional) y `mrrSeriesValidatorMessages` en español. |
| **CREAR** `tests/unit/validators/platform_metric_mrr_series.spec.ts` | Que el `detail` del 422 sea el literal exacto de CA-7 en las cuatro reglas de Vine. |
| **EDITAR** `app/services/platform_mrr_service.ts` | Interfaces de la serie exportadas arriba; núcleo puro exportado (`buildMrrSeries`, `resolveMonthReliability`); método `getMonthlySeries` con las dos consultas. |
| **CREAR** `tests/unit/services/platform_mrr_series.spec.ts` | Todas las reglas del cálculo sobre el núcleo puro: reparto, residuo, ventana, precedencia de motivos, serie vacía. Determinista, sin BD. |
| **CREAR** `tests/functional/platform_mrr_series_service.spec.ts` | Lo que solo la BD puede romper: el universo, los filtros de baja lógica y el conteo de cobros sin periodo. Por diferencia contra una foto previa. |
| **EDITAR** `app/controllers/platform_mrr_controller.ts` | Método `series` + bloque `@swagger` + anotaciones AdonisJS, con la advertencia obligatoria de que cobrado ≠ contratado. |
| **EDITAR** `start/routes/platform_mrr_routes.ts` | Una línea `router.get('/mrr-series', …)` dentro del grupo existente. |
| **CREAR** `tests/functional/platform_mrr_series_metrics.spec.ts` | Contrato HTTP: 200, forma exacta del payload, 422 de CA-7, 403 sin `code`, 401. |
| **EDITAR** `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado) | Los dos usuarios de la prueba manual y los cobros del recorrido. Es el seeder que ya usan los demás paneles: **no se crea uno nuevo**. |
| **CREAR** `docs/superpowers/plans/2026-09-08-serie-mensual-mrr-desde-pagos-qa-api.md` | Playbook de prueba manual de API. |

`start/routes.ts` **no se toca**: el import de `platform_mrr_routes.ts` lo agregó la orden 8.

---

## Task 1: Textos de error y validador de la ventana

**Files:**
- Modify: `app/constants/platform_metric_error_codes.ts` (agregar al final)
- Modify: `app/validators/platform_metric.ts` (agregar al final)
- Test: `tests/unit/validators/platform_metric_mrr_series.spec.ts` (crear)

**Interfaces:**
- Consumes: `PlatformMetricErrorTexts` de `platform_metric_error_codes.ts`; `vine` y `SimpleMessagesProvider` ya importados en `platform_metric.ts`.
- Produces: `MRR_SERIES_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts`, `mrrSeriesValidator` (salida `{ meses?: number }`), `mrrSeriesValidatorMessages: SimpleMessagesProvider`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/unit/validators/platform_metric_mrr_series.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  mrrSeriesValidator,
  mrrSeriesValidatorMessages,
} from '../../../app/validators/platform_metric.js'
import { MRR_SERIES_METRIC_ERROR_TEXTS } from '../../../app/constants/platform_metric_error_codes.js'

/**
 * USRH1788052455654 — la ventana de la serie.
 *
 * El `detail` del 422 está fijado literal por CA-7, así que las cuatro reglas
 * de Vine dicen la misma frase: el mensaje no puede cambiar según cuál falló
 * primero.
 */
const RANGE_MESSAGE = 'El número de meses debe estar entre 1 y 24.'

interface VineFailure {
  code: string
  messages: Array<{ message: string }>
}

async function firstFailure(payload: Record<string, unknown>): Promise<VineFailure> {
  try {
    await mrrSeriesValidator.validate(payload, {
      messagesProvider: mrrSeriesValidatorMessages,
    })
  } catch (error) {
    return error as VineFailure
  }
  throw new Error(`el validador aceptó ${JSON.stringify(payload)} y debía rechazarlo`)
}

test.group('mrrSeriesValidator', () => {
  test('CA-7 — meses = 40 falla con el detalle exacto del criterio', async ({ assert }) => {
    const failure = await firstFailure({ meses: 40 })

    assert.equal(failure.code, 'E_VALIDATION_ERROR')
    assert.equal(failure.messages[0].message, RANGE_MESSAGE)
  })

  test('meses = 0 falla con el mismo detalle que el tope de arriba', async ({ assert }) => {
    const failure = await firstFailure({ meses: 0 })

    assert.equal(failure.messages[0].message, RANGE_MESSAGE)
  })

  test('meses no entero falla, y no se redondea a ojo', async ({ assert }) => {
    const conDecimales = await firstFailure({ meses: 12.5 })
    const conTexto = await firstFailure({ meses: 'doce' })

    assert.equal(conDecimales.messages[0].message, RANGE_MESSAGE)
    assert.equal(conTexto.messages[0].message, RANGE_MESSAGE)
  })

  test('los bordes 1 y 24 pasan, y meses ausente queda undefined', async ({ assert }) => {
    const uno = await mrrSeriesValidator.validate({ meses: 1 })
    const veinticuatro = await mrrSeriesValidator.validate({ meses: 24 })
    const vacio = await mrrSeriesValidator.validate({})

    assert.equal(uno.meses, 1)
    assert.equal(veinticuatro.meses, 24)
    // El 12 por omisión lo aplica el controlador: el default vive en un solo lugar.
    assert.isUndefined(vacio.meses)
  })

  test('el title de la serie nombra la serie, no la cifra de la franja', ({ assert }) => {
    assert.equal(
      MRR_SERIES_METRIC_ERROR_TEXTS.failureTitle,
      'No fue posible obtener la serie mensual de MRR'
    )
    // Convención del área: el key es el slug kebab del título y el code va aparte.
    assert.notInclude(MRR_SERIES_METRIC_ERROR_TEXTS.failureKey, 'PLT.MET')
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node ace test unit --files=platform_metric_mrr_series`
Expected: FAIL — `mrrSeriesValidator` y `MRR_SERIES_METRIC_ERROR_TEXTS` no existen todavía.

- [ ] **Step 3: Agregar los textos de error**

Al final de `app/constants/platform_metric_error_codes.ts`:

```ts
/**
 * Textos de la serie mensual de MRR cobrado (USRH1788052455654).
 *
 * Juego propio y no reutilización del de la cifra: son dos endpoints del mismo
 * prefijo y un título compartido dejaría al cliente sin saber cuál de los dos
 * falló. El `key` es el slug kebab del título, como manda la convención del
 * área; el spec proponía `datos-invalidos` y se descartó por consistencia. El
 * `code` sí va literal — es el campo que el cliente consume.
 */
export const MRR_SERIES_METRIC_ERROR_TEXTS: PlatformMetricErrorTexts = {
  failureTitle: 'No fue posible obtener la serie mensual de MRR',
  failureKey: 'no-fue-posible-obtener-la-serie-mensual-de-mrr',
  unhandledTitle: 'Error inesperado al obtener la serie mensual de MRR',
  unhandledKey: 'error-inesperado-al-obtener-la-serie-mensual-de-mrr',
}
```

- [ ] **Step 4: Agregar el validador**

Al final de `app/validators/platform_metric.ts`:

```ts
/**
 * Query params de `GET /api/platform/metrics/mrr-series`.
 *
 * `meses` es el ancho de la ventana. Opcional a propósito: el 12 por omisión lo
 * aplica el controlador, como en la cartera, para que el default viva en un solo
 * lugar en vez de duplicarse entre el validador y quien lo consume.
 */
export const mrrSeriesValidator = vine.compile(
  vine.object({
    meses: vine.number().withoutDecimals().min(1).max(24).optional(),
  })
)

/**
 * Mensajes en español de `mrrSeriesValidator`.
 *
 * Las cuatro reglas dicen la misma frase porque el `detail` del 422 está fijado
 * por el criterio de aceptación: no puede cambiar según cuál regla de Vine falló
 * primero. Van explícitos por el mismo motivo que los de la cartera — el provider
 * global de i18n solo se aplica cuando la llamada no trae el suyo, y sin esto el
 * mensaje saldría en inglés.
 */
export const mrrSeriesValidatorMessages = new SimpleMessagesProvider({
  'meses.number': 'El número de meses debe estar entre 1 y 24.',
  'meses.withoutDecimals': 'El número de meses debe estar entre 1 y 24.',
  'meses.min': 'El número de meses debe estar entre 1 y 24.',
  'meses.max': 'El número de meses debe estar entre 1 y 24.',
})
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `node ace test unit --files=platform_metric_mrr_series`
Expected: PASS, 5 tests.

Si el runner se queja de que la suite `unit` no arranca el contenedor: la suite unitaria sí bootea la app (`pluginAdonisJS(app)` en `tests/bootstrap.ts`), solo no levanta el servidor HTTP. El validador no toca BD, así que debe correr limpio.

- [ ] **Step 6: Verificar tipos y estilo**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/constants/platform_metric_error_codes.ts app/validators/platform_metric.ts tests/unit/validators/platform_metric_mrr_series.spec.ts
git commit -m "feat(metrics): add the MRR series error texts and its window validator"
```

---

## Task 2: Núcleo puro de la serie

Toda la aritmética y todas las reglas de negocio de la HU viven aquí, en funciones puras exportadas del mismo archivo del servicio (el spec prohíbe archivos nuevos de producción). Reciben el mes en curso por parámetro: sin reloj y sin BD, las reglas se fijan en pruebas deterministas en vez de depender de qué día se corran.

**Files:**
- Modify: `app/services/platform_mrr_service.ts` (agregar imports, interfaces y funciones; **no** se toca nada de lo existente)
- Test: `tests/unit/services/platform_mrr_series.spec.ts` (crear)

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces, todo exportado desde `#services/platform_mrr_service`:
  - `type MrrSeriesLowConfidenceReason = 'mes-en-curso' | 'sin-pagos-en-el-mes' | 'anterior-al-primer-pago'`
  - `interface MrrSeriesPoint { mes: string; mrrCobradoNetoCents: number; pagosConsiderados: number; confiabilidad: 'alta' | 'baja'; motivoBajaConfiabilidad: MrrSeriesLowConfidenceReason | null }`
  - `interface MrrSeriesWindow { desde: string | null; hasta: string | null }`
  - `interface PlatformMrrSeries { ventana: MrrSeriesWindow; criterio: 'pagos'; pagosSinPeriodoExcluidos: number; puntos: MrrSeriesPoint[] }`
  - `interface MrrPaymentPeriodRow { subtotalCents: number; periodsCovered: number; periodStartMonth: string }`
  - `function resolveMonthReliability(month: string, currentMonth: string, firstPaidMonth: string, paymentsConsidered: number): MrrSeriesLowConfidenceReason | null`
  - `function buildMrrSeries(rows: MrrPaymentPeriodRow[], options: { currentMonth: string; months: number; paymentsWithoutPeriod: number }): PlatformMrrSeries`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/unit/services/platform_mrr_series.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  buildMrrSeries,
  resolveMonthReliability,
  type MrrPaymentPeriodRow,
} from '#services/platform_mrr_service'

/**
 * USRH1788052455654 — reglas del cálculo de la serie mensual de MRR cobrado.
 *
 * El mes en curso entra por parámetro, así que estas pruebas son deterministas:
 * no dependen del día en que se corran ni de lo que traiga la base compartida.
 * Lo que sí depende de la base —el universo y sus filtros de baja lógica— se
 * prueba en `tests/functional/platform_mrr_series_service.spec.ts`.
 */

const MES_EN_CURSO = '2026-09'

function pago(overrides: Partial<MrrPaymentPeriodRow> = {}): MrrPaymentPeriodRow {
  return {
    subtotalCents: 100_000,
    periodsCovered: 1,
    periodStartMonth: '2026-08',
    ...overrides,
  }
}

function punto(serie: ReturnType<typeof buildMrrSeries>, mes: string) {
  const encontrado = serie.puntos.find((p) => p.mes === mes)
  if (!encontrado) throw new Error(`la serie no trae el mes ${mes}`)
  return encontrado
}

test.group('buildMrrSeries', () => {
  test('CA-1 — un cobro de tres periodos se reparte en partes iguales entre sus tres meses', ({
    assert,
  }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 300_000, periodsCovered: 3, periodStartMonth: '2026-04' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    assert.equal(punto(serie, '2026-04').mrrCobradoNetoCents, 100_000)
    assert.equal(punto(serie, '2026-05').mrrCobradoNetoCents, 100_000)
    assert.equal(punto(serie, '2026-06').mrrCobradoNetoCents, 100_000)
    // Ninguno se lleva el importe completo: eso inflaría el mes en que se pagó.
    assert.notEqual(punto(serie, '2026-04').mrrCobradoNetoCents, 300_000)
    assert.equal(punto(serie, '2026-04').pagosConsiderados, 1)
    assert.equal(serie.criterio, 'pagos')
  })

  test('CA-1 — un cobro de un solo periodo aporta su importe completo a un solo mes', ({
    assert,
  }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 250_000, periodsCovered: 1, periodStartMonth: '2026-07' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    assert.equal(punto(serie, '2026-07').mrrCobradoNetoCents, 250_000)
    assert.equal(punto(serie, '2026-08').mrrCobradoNetoCents, 0)
  })

  test('periodsCovered en 0 se trata como 1 y no divide entre cero', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 90_000, periodsCovered: 0, periodStartMonth: '2026-07' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    assert.equal(punto(serie, '2026-07').mrrCobradoNetoCents, 90_000)
    for (const p of serie.puntos) {
      assert.isTrue(Number.isFinite(p.mrrCobradoNetoCents))
    }
  })

  test('el residuo de la división entera se pierde, no se reparte a ojo', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 100, periodsCovered: 3, periodStartMonth: '2026-05' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    const repartido =
      punto(serie, '2026-05').mrrCobradoNetoCents +
      punto(serie, '2026-06').mrrCobradoNetoCents +
      punto(serie, '2026-07').mrrCobradoNetoCents

    assert.equal(punto(serie, '2026-05').mrrCobradoNetoCents, 33)
    assert.equal(repartido, 99)
    // El centavo que sobra no se le regala a ningún mes: inventar dónde cae es
    // justo el relleno que la HU prohíbe.
    assert.equal(100 - repartido, 2)
  })

  test('CA-2 — un mes sin cobros vale cero y sale marcado, sin heredar el mes anterior', ({
    assert,
  }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 500_000, periodsCovered: 1, periodStartMonth: '2026-06' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    const julio = punto(serie, '2026-07')

    assert.equal(julio.mrrCobradoNetoCents, 0)
    assert.equal(julio.pagosConsiderados, 0)
    assert.equal(julio.confiabilidad, 'baja')
    assert.equal(julio.motivoBajaConfiabilidad, 'sin-pagos-en-el-mes')
    assert.notEqual(julio.mrrCobradoNetoCents, punto(serie, '2026-06').mrrCobradoNetoCents)
  })

  test('CA-3 — el mes en curso siempre sale de baja confiabilidad, aunque tenga cobros', ({
    assert,
  }) => {
    const serie = buildMrrSeries(
      [
        pago({ subtotalCents: 400_000, periodsCovered: 1, periodStartMonth: '2026-06' }),
        pago({ subtotalCents: 700_000, periodsCovered: 1, periodStartMonth: MES_EN_CURSO }),
      ],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    const enCurso = punto(serie, MES_EN_CURSO)

    assert.equal(enCurso.mrrCobradoNetoCents, 700_000)
    assert.equal(enCurso.confiabilidad, 'baja')
    assert.equal(enCurso.motivoBajaConfiabilidad, 'mes-en-curso')
    // Y un mes cerrado con cobros sí es de alta confiabilidad.
    assert.equal(punto(serie, '2026-06').confiabilidad, 'alta')
    assert.isNull(punto(serie, '2026-06').motivoBajaConfiabilidad)
  })

  test('CA-4 — los cobros sin periodo viajan contados y no aportan a ningún mes', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 600_000, periodsCovered: 1, periodStartMonth: '2026-08' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 7 }
    )

    const total = serie.puntos.reduce((suma, p) => suma + p.mrrCobradoNetoCents, 0)

    assert.equal(serie.pagosSinPeriodoExcluidos, 7)
    assert.equal(total, 600_000)
  })

  test('CA-5 — sin ningún cobro con periodo la serie sale vacía y la ventana en blanco', ({
    assert,
  }) => {
    const serie = buildMrrSeries([], {
      currentMonth: MES_EN_CURSO,
      months: 12,
      paymentsWithoutPeriod: 3,
    })

    assert.deepEqual(serie.puntos, [])
    assert.isNull(serie.ventana.desde)
    assert.isNull(serie.ventana.hasta)
    assert.equal(serie.pagosSinPeriodoExcluidos, 3)
    assert.equal(serie.criterio, 'pagos')
  })

  test('regla 8 — la ventana nunca arranca antes del mes del primer cobro', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 100_000, periodsCovered: 1, periodStartMonth: '2026-07' })],
      { currentMonth: MES_EN_CURSO, months: 24, paymentsWithoutPeriod: 0 }
    )

    assert.equal(serie.ventana.desde, '2026-07')
    assert.equal(serie.ventana.hasta, MES_EN_CURSO)
    assert.equal(serie.puntos.length, 3)
  })

  test('la ventana se recorta a los meses pedidos cuando hay más historia', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 100_000, periodsCovered: 1, periodStartMonth: '2024-01' })],
      { currentMonth: MES_EN_CURSO, months: 3, paymentsWithoutPeriod: 0 }
    )

    assert.equal(serie.ventana.desde, '2026-07')
    assert.equal(serie.ventana.hasta, '2026-09')
    assert.equal(serie.puntos.length, 3)
  })

  test('un primer cobro que cubre un periodo futuro no invierte la ventana', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 100_000, periodsCovered: 1, periodStartMonth: '2026-11' })],
      { currentMonth: MES_EN_CURSO, months: 12, paymentsWithoutPeriod: 0 }
    )

    assert.equal(serie.ventana.desde, MES_EN_CURSO)
    assert.equal(serie.ventana.hasta, MES_EN_CURSO)
    assert.equal(serie.puntos.length, 1)
    assert.equal(punto(serie, MES_EN_CURSO).mrrCobradoNetoCents, 0)
  })

  test('regla 7 del contrato — los puntos van en orden cronológico y sin huecos', ({ assert }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 100_000, periodsCovered: 1, periodStartMonth: '2026-01' })],
      { currentMonth: MES_EN_CURSO, months: 6, paymentsWithoutPeriod: 0 }
    )

    const meses = serie.puntos.map((p) => p.mes)

    assert.deepEqual(meses, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    assert.deepEqual(meses, [...meses].sort())
  })

  test('CA-9 — la serie no publica ningún campo de la cifra de la franja', ({ assert }) => {
    const serie = buildMrrSeries([pago()], {
      currentMonth: MES_EN_CURSO,
      months: 12,
      paymentsWithoutPeriod: 0,
    })

    assert.deepEqual(Object.keys(serie).sort(), [
      'criterio',
      'pagosSinPeriodoExcluidos',
      'puntos',
      'ventana',
    ])
    assert.deepEqual(Object.keys(serie.puntos[0]).sort(), [
      'confiabilidad',
      'mes',
      'motivoBajaConfiabilidad',
      'mrrCobradoNetoCents',
      'pagosConsiderados',
    ])
    assert.notInclude(JSON.stringify(serie), 'mrrActualNeto')
  })
})

test.group('resolveMonthReliability', () => {
  test('el mes en curso gana a cualquier otro motivo', ({ assert }) => {
    // Mes en curso, sin cobros y anterior al primer pago a la vez: manda el primero.
    assert.equal(resolveMonthReliability('2026-09', '2026-09', '2026-12', 0), 'mes-en-curso')
    assert.equal(resolveMonthReliability('2026-09', '2026-09', '2026-01', 5), 'mes-en-curso')
  })

  test('anterior al primer pago gana a sin cobros en el mes', ({ assert }) => {
    assert.equal(resolveMonthReliability('2026-03', '2026-09', '2026-06', 0), 'anterior-al-primer-pago')
  })

  test('un mes cerrado sin cobros se reporta como sin cobros', ({ assert }) => {
    assert.equal(resolveMonthReliability('2026-07', '2026-09', '2026-01', 0), 'sin-pagos-en-el-mes')
  })

  test('un mes cerrado con cobros no tiene motivo', ({ assert }) => {
    assert.isNull(resolveMonthReliability('2026-07', '2026-09', '2026-01', 2))
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node ace test unit --files=platform_mrr_series`
Expected: FAIL — `buildMrrSeries` y `resolveMonthReliability` no existen.

- [ ] **Step 3: Agregar el import de Luxon**

En la primera línea de `app/services/platform_mrr_service.ts`, antes del import de `db`:

```ts
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { toBusinessDateString } from '../utils/business_date.js'
```

- [ ] **Step 4: Agregar las interfaces de la serie**

En `app/services/platform_mrr_service.ts`, dentro del bloque `─── Tipos de retorno ───`, **después** de `PlatformMrrSnapshot` y **antes** del bloque `─── SQL compartido ───`:

```ts
/**
 * Por qué un mes de la serie no se puede sostener con los cobros registrados.
 *
 * No son grados: son causas. La vista los usa para explicar el hueco, no para
 * ordenar meses por calidad.
 */
export type MrrSeriesLowConfidenceReason =
  | 'mes-en-curso'
  | 'sin-pagos-en-el-mes'
  | 'anterior-al-primer-pago'

/** Un mes de la serie: lo que se cobró para él, cuántos cobros lo sostienen y qué tan firme es. */
export interface MrrSeriesPoint {
  /** Mes calendario, `YYYY-MM`. */
  mes: string
  /**
   * Ingreso recurrente COBRADO atribuido al mes, en centavos.
   *
   * No es `mrrActualNetoCents`: aquél es lo contratado y vigente hoy, éste es lo
   * que entró de cobros que cubrieron este mes. El nombre lleva la diferencia
   * encima a propósito.
   */
  mrrCobradoNetoCents: number
  /** Cobros que aportaron a este mes. Un cobro de tres periodos cuenta en los tres. */
  pagosConsiderados: number
  confiabilidad: 'alta' | 'baja'
  /** `null` cuando la confiabilidad es alta. */
  motivoBajaConfiabilidad: MrrSeriesLowConfidenceReason | null
}

/** Meses que la serie alcanza a reconstruir. En `null` cuando no hay ni un cobro con periodo. */
export interface MrrSeriesWindow {
  desde: string | null
  hasta: string | null
}

/** Serie mensual de MRR cobrado, con su ventana y lo que quedó fuera de ella. */
export interface PlatformMrrSeries {
  ventana: MrrSeriesWindow
  /**
   * Fuente declarada en el propio payload. Viaja en la respuesta para que nadie
   * confunda esta serie con la cifra de la franja ejecutiva: son dos métricas
   * distintas y no se espera que sus números coincidan.
   */
  criterio: 'pagos'
  /** Cobros que no se pudieron ubicar en ningún mes por no tener periodo registrado. */
  pagosSinPeriodoExcluidos: number
  /** Cronológico ascendente y sin huecos dentro de la ventana. */
  puntos: MrrSeriesPoint[]
}

/** Un cobro con periodo, reducido a lo único que la serie necesita de él. */
export interface MrrPaymentPeriodRow {
  /** Importe SIN IVA congelado al momento de cobrar, en centavos. */
  subtotalCents: number
  /** Meses que el cobro cubrió. El `0` y el nulo se tratan como `1`. */
  periodsCovered: number
  /** Mes calendario en que arranca el periodo cubierto, `YYYY-MM`. */
  periodStartMonth: string
}
```

- [ ] **Step 5: Agregar el núcleo puro**

En el mismo archivo, después de las interfaces y antes del bloque `─── SQL compartido ───`:

```ts
// ─── Núcleo de la serie (puro) ────────────────────────────────────────────────

/**
 * Mes `YYYY-MM` desplazado `delta` meses.
 *
 * Las claves `YYYY-MM` se comparan como texto en todo el módulo: su orden
 * lexicográfico es el cronológico, así que no hace falta parsear para ordenar ni
 * para acotar la ventana.
 */
function shiftMonth(month: string, delta: number): string {
  return DateTime.fromISO(`${month}-01`).plus({ months: delta }).toFormat('yyyy-MM')
}

/**
 * Motivo por el que un mes es de baja confiabilidad, o `null` si es firme.
 *
 * La precedencia importa y es la del contrato: `mes-en-curso` gana a
 * `anterior-al-primer-pago`, y ése gana a `sin-pagos-en-el-mes`. Un mes en curso
 * sin cobros se reporta como en curso, porque ése es el motivo que de verdad
 * explica el hueco — todavía no termina.
 *
 * `anterior-al-primer-pago` no se alcanza hoy desde el endpoint: la ventana se
 * recorta al mes del primer cobro (regla 8), así que ningún mes puede quedar
 * antes. Se implementa igual porque es la regla del contrato: el día que alguien
 * afloje ese recorte, el motivo tiene que salir solo en vez de mentir con
 * `sin-pagos-en-el-mes`.
 *
 * @param month - Mes evaluado, `YYYY-MM`.
 * @param currentMonth - Mes calendario en curso en zona de negocio, `YYYY-MM`.
 * @param firstPaidMonth - Mes del primer cobro con periodo registrado, `YYYY-MM`.
 * @param paymentsConsidered - Cuántos cobros aportaron a este mes.
 * @returns El motivo, o `null` cuando el mes se sostiene con cobros.
 */
export function resolveMonthReliability(
  month: string,
  currentMonth: string,
  firstPaidMonth: string,
  paymentsConsidered: number
): MrrSeriesLowConfidenceReason | null {
  if (month === currentMonth) {
    return 'mes-en-curso'
  }
  if (month < firstPaidMonth) {
    return 'anterior-al-primer-pago'
  }
  if (paymentsConsidered === 0) {
    return 'sin-pagos-en-el-mes'
  }
  return null
}

/**
 * Arma la serie mensual a partir de los cobros con periodo.
 *
 * Función pura: sin base de datos y sin reloj. El mes en curso entra por
 * parámetro para que las reglas se puedan fijar en pruebas deterministas en vez
 * de depender del día en que se corran.
 *
 * ## Reparto y residuo
 *
 * Cada cobro aporta `floor(subtotalCents / max(periodsCovered, 1))` a cada uno de
 * los meses que cubrió, arrancando en el mes de su `period_start`. La división es
 * entera y **el residuo se pierde**: un cobro de 100 centavos repartido en tres
 * meses aporta 33 a cada uno y deja 1 centavo sin atribuir, hasta
 * `periodsCovered - 1` centavos por cobro. No se reparte a ojo entre los meses
 * porque decidir en cuál cae el sobrante sería justo el tipo de relleno que la HU
 * prohíbe, y el error está acotado a centavos sobre importes de millones.
 *
 * ## Lo que esta función NO hace
 *
 * No rellena un mes vacío con el anterior, con un promedio ni con estimación
 * alguna: un mes sin cobros vale cero y sale marcado. Tampoco ubica los cobros
 * sin periodo — ésos ni siquiera llegan aquí, se cuentan aparte y viajan en
 * `pagosSinPeriodoExcluidos`.
 *
 * @param rows - TODOS los cobros con periodo del universo, no solo los de la ventana: un cobro anterior a ella puede seguir aportando a meses de adentro.
 * @param options.currentMonth - Mes calendario en curso, `YYYY-MM`.
 * @param options.months - Ancho de la ventana pedido, ya validado en 1..24.
 * @param options.paymentsWithoutPeriod - Cobros descartados por no tener periodo registrado.
 * @returns La serie completa: ventana, criterio, descartados y un punto por mes.
 */
export function buildMrrSeries(
  rows: MrrPaymentPeriodRow[],
  options: { currentMonth: string; months: number; paymentsWithoutPeriod: number }
): PlatformMrrSeries {
  const { currentMonth, months, paymentsWithoutPeriod } = options

  // Sin un solo cobro con periodo la serie sale vacía y la ventana en blanco
  // (regla 7): una lista de meses en cero se leería como historia real de un
  // negocio que no facturó, que es exactamente lo contrario de lo que pasa.
  if (rows.length === 0) {
    return {
      ventana: { desde: null, hasta: null },
      criterio: 'pagos',
      pagosSinPeriodoExcluidos: paymentsWithoutPeriod,
      puntos: [],
    }
  }

  const firstPaidMonth = rows.reduce(
    (earliest, row) => (row.periodStartMonth < earliest ? row.periodStartMonth : earliest),
    rows[0].periodStartMonth
  )

  const hasta = currentMonth
  const requested = shiftMonth(currentMonth, -(months - 1))
  // La ventana no arranca antes del primer cobro (regla 8) ni después del mes en
  // curso: un primer cobro que paga un periodo por adelantado deja su mes en el
  // futuro, y sin el segundo tope la ventana saldría al revés.
  const notBeforeFirstPayment = requested > firstPaidMonth ? requested : firstPaidMonth
  const desde = notBeforeFirstPayment < hasta ? notBeforeFirstPayment : hasta

  // El orden de inserción del Map es el de la serie: cronológico y sin huecos.
  const buckets = new Map<string, { cents: number; pagos: number }>()
  for (let month = desde; month <= hasta; month = shiftMonth(month, 1)) {
    buckets.set(month, { cents: 0, pagos: 0 })
  }

  for (const row of rows) {
    const spread = Math.max(row.periodsCovered, 1)
    const share = Math.floor(row.subtotalCents / spread)
    for (let index = 0; index < spread; index += 1) {
      const bucket = buckets.get(shiftMonth(row.periodStartMonth, index))
      // Los meses del cobro que caen fuera de la ventana simplemente no aportan.
      if (!bucket) {
        continue
      }
      bucket.cents += share
      bucket.pagos += 1
    }
  }

  const puntos: MrrSeriesPoint[] = [...buckets.entries()].map(([mes, bucket]) => {
    const motivo = resolveMonthReliability(mes, currentMonth, firstPaidMonth, bucket.pagos)
    return {
      mes,
      mrrCobradoNetoCents: bucket.cents,
      pagosConsiderados: bucket.pagos,
      confiabilidad: motivo === null ? 'alta' : 'baja',
      motivoBajaConfiabilidad: motivo,
    }
  })

  return {
    ventana: { desde, hasta },
    criterio: 'pagos',
    pagosSinPeriodoExcluidos: paymentsWithoutPeriod,
    puntos,
  }
}
```

- [ ] **Step 6: Correr la prueba y verificar que pasa**

Run: `node ace test unit --files=platform_mrr_series`
Expected: PASS, 17 tests.

- [ ] **Step 7: Verificar que no se rompió el MRR de la orden 8**

Run: `node ace test functional --files=platform_mrr_service`
Expected: PASS. En particular sigue verde la prueba que exige que el archivo del servicio **no mencione** `discount_percent` ni `DiscountPercent` — el núcleo de la serie tampoco los usa.

- [ ] **Step 8: Verificar tipos y estilo**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add app/services/platform_mrr_service.ts tests/unit/services/platform_mrr_series.spec.ts
git commit -m "feat(metrics): add the pure monthly MRR series builder over paid periods"
```

---

## Task 3: Lectura de los cobros

El núcleo ya sabe armar la serie; falta darle de comer. Esta tarea agrega las dos consultas y el método público. Se prueba contra la base real, porque lo único que aquí puede romperse es lo que el núcleo no ve: el universo, los `deleted_at` a mano y el conteo de cobros sin periodo.

**Files:**
- Modify: `app/services/platform_mrr_service.ts` (agregar tres métodos a la clase; **no** se toca `getMrrSnapshot` ni sus privados)
- Test: `tests/functional/platform_mrr_series_service.spec.ts` (crear)

**Interfaces:**
- Consumes: `buildMrrSeries`, `MrrPaymentPeriodRow`, `PlatformMrrSeries` de la Task 2; `toBusinessDateString` de `../utils/business_date.js`, ya importado en el archivo.
- Produces: `PlatformMrrService.prototype.getMonthlySeries(months: number): Promise<PlatformMrrSeries>`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/functional/platform_mrr_series_service.spec.ts`:

```ts
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'
import PlatformMrrService, { type PlatformMrrSeries } from '#services/platform_mrr_service'

/**
 * USRH1788052455654 — lo que solo la base puede romper: el universo de la serie
 * y sus filtros.
 *
 * Las reglas del cálculo (reparto, residuo, ventana, motivos, serie vacía) se
 * fijan en `tests/unit/services/platform_mrr_series.spec.ts`, sobre el núcleo
 * puro. Aquí se verifica por DIFERENCIA contra una foto previa: la base de
 * pruebas es compartida y ya trae cobros de otros fixtures, así que un importe
 * absoluto sería verde hoy y rojo mañana.
 */

const HOY = DateTime.now().startOf('month')

/** Primer día del mes que está `atras` meses antes del actual, como `DateTime`. */
function mesAtras(atras: number): DateTime {
  return HOY.minus({ months: atras })
}

/** Clave `YYYY-MM` del mes que está `atras` meses antes del actual. */
function claveMes(atras: number): string {
  return mesAtras(atras).toFormat('yyyy-MM')
}

function importeDe(serie: PlatformMrrSeries, mes: string): number {
  return serie.puntos.find((p) => p.mes === mes)?.mrrCobradoNetoCents ?? 0
}

function pagosDe(serie: PlatformMrrSeries, mes: string): number {
  return serie.puntos.find((p) => p.mes === mes)?.pagosConsiderados ?? 0
}

async function createPublishedPlan(stamp: number): Promise<number> {
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Series Plan ${stamp}`,
    billingPlanDescription: 'Fixture de USRH1788052455654',
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

interface SubscriptionFixture {
  planId: number
  stamp: number
  suffix: string
  businessUnitDeleted?: boolean
  subscriptionDeleted?: boolean
}

async function createSubscription(
  fixture: SubscriptionFixture
): Promise<{ buId: number; subId: number }> {
  const now = DateTime.utc()

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Mrr Series BU ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitSlug = `mrr-series-bu-${fixture.suffix}-${fixture.stamp}`
  businessUnit.businessUnitLegalName = `Mrr Series Legal ${fixture.suffix} ${fixture.stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()

  const price = await BillingPlanPrice.query().where('billing_plan_id', fixture.planId).firstOrFail()

  const subscription = await BillingSubscription.create({
    businessUnitId: businessUnit.businessUnitId,
    billingPlanId: fixture.planId,
    billingPlanPriceId: price.billingPlanPriceId,
    billingSubscriptionProvider: 'manual',
    billingSubscriptionStatus: 'active',
    billingSubscriptionContractedUnitAmount: 65,
    billingSubscriptionContractedEmployees: 10,
    billingSubscriptionDiscountPercent: 0,
    billingSubscriptionContractedTrialDays: 0,
    billingSubscriptionContractedCurrency: 'MXN',
    billingSubscriptionContractedTaxRate: 0.16,
    billingSubscriptionContractedSubtotal: 650,
    billingSubscriptionContractedTaxAmount: 104,
    billingSubscriptionContractedTotal: 754,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })

  if (fixture.subscriptionDeleted) {
    await subscription.delete()
  }
  if (fixture.businessUnitDeleted) {
    await businessUnit.delete()
  }

  return { buId: businessUnit.businessUnitId, subId: subscription.billingSubscriptionId }
}

interface PaymentFixture {
  subId: number
  subtotalCents: number
  periodsCovered: number
  /** `null` simula el pago parcial: sin periodo, no se puede ubicar en ningún mes. */
  periodStart: DateTime | null
}

async function createPayment(fixture: PaymentFixture): Promise<void> {
  const periodEnd = fixture.periodStart
    ? fixture.periodStart.plus({ months: Math.max(fixture.periodsCovered, 1) })
    : null

  await BillingPayment.create({
    billingSubscriptionId: fixture.subId,
    billingPaymentAmountCents: fixture.subtotalCents,
    billingPaymentPeriodAmountCents: fixture.subtotalCents,
    billingPaymentPeriodsCovered: fixture.periodsCovered,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: fixture.subtotalCents,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: fixture.subtotalCents,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: fixture.subtotalCents,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `MRR-SERIES-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now(),
    billingPaymentPeriodStart: fixture.periodStart,
    billingPaymentPeriodEnd: periodEnd,
  })
}

/** Los pagos van primero: la FK de `billing_payments` es RESTRICT. */
async function cleanupFixtures(businessUnitIds: number[], planIds: number[]): Promise<void> {
  for (const businessUnitId of businessUnitIds) {
    const subscriptions = await BillingSubscription.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
    for (const subscription of subscriptions) {
      await BillingPayment.query()
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .delete()
      await subscription.forceDelete()
    }
    await BusinessUnit.query().withTrashed().where('business_unit_id', businessUnitId).delete()
  }
  for (const planId of planIds) {
    await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
    await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
    const plan = await BillingPlan.find(planId)
    if (plan) await plan.delete()
  }
}

test.group('PlatformMrrService.getMonthlySeries', (group) => {
  const service = new PlatformMrrService()
  let planId = 0
  const businessUnitIds: number[] = []

  group.setup(async () => {
    planId = await createPublishedPlan(Date.now())
  })

  group.teardown(async () => {
    await cleanupFixtures(businessUnitIds, [planId])
  })

  test('CA-1 — un cobro de tres periodos reparte 100 000 centavos a cada uno de sus tres meses', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)

    const sub = await createSubscription({ planId, stamp: Date.now(), suffix: 'ca1' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 300_000,
      periodsCovered: 3,
      periodStart: mesAtras(4),
    })

    const after = await service.getMonthlySeries(12)

    for (const atras of [4, 3, 2]) {
      const mes = claveMes(atras)
      assert.equal(importeDe(after, mes) - importeDe(before, mes), 100_000)
      assert.equal(pagosDe(after, mes) - pagosDe(before, mes), 1)
    }
    // El mes siguiente al periodo cubierto no recibe nada.
    assert.equal(importeDe(after, claveMes(1)) - importeDe(before, claveMes(1)), 0)
  })

  test('CA-4 — un cobro sin periodo se cuenta aparte y no aporta a ningún mes', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(24)

    const sub = await createSubscription({ planId, stamp: Date.now() + 1, suffix: 'ca4' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 999_900,
      periodsCovered: 0,
      periodStart: null,
    })

    const after = await service.getMonthlySeries(24)

    assert.equal(after.pagosSinPeriodoExcluidos - before.pagosSinPeriodoExcluidos, 1)
    for (const punto of after.puntos) {
      assert.equal(punto.mrrCobradoNetoCents, importeDe(before, punto.mes))
      assert.equal(punto.pagosConsiderados, pagosDe(before, punto.mes))
    }
  })

  test('CA-6 — los cobros de suscripciones y de tenants dados de baja quedan fuera', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)
    const stamp = Date.now() + 2

    const subBorrada = await createSubscription({
      planId,
      stamp,
      suffix: 'ca6-sub',
      subscriptionDeleted: true,
    })
    businessUnitIds.push(subBorrada.buId)
    await createPayment({
      subId: subBorrada.subId,
      subtotalCents: 800_000,
      periodsCovered: 1,
      periodStart: mesAtras(2),
    })

    const buBorrada = await createSubscription({
      planId,
      stamp,
      suffix: 'ca6-bu',
      businessUnitDeleted: true,
    })
    businessUnitIds.push(buBorrada.buId)
    await createPayment({
      subId: buBorrada.subId,
      subtotalCents: 900_000,
      periodsCovered: 1,
      periodStart: mesAtras(2),
    })

    const after = await service.getMonthlySeries(12)

    // Ni el importe ni el conteo ni los descartados se mueven: los dos cobros
    // no existen para la serie.
    assert.equal(importeDe(after, claveMes(2)), importeDe(before, claveMes(2)))
    assert.equal(pagosDe(after, claveMes(2)), pagosDe(before, claveMes(2)))
    assert.equal(after.pagosSinPeriodoExcluidos, before.pagosSinPeriodoExcluidos)
  })

  test('un cobro de un solo periodo aporta su subtotal completo a un solo mes', async ({
    assert,
  }) => {
    const before = await service.getMonthlySeries(12)

    const sub = await createSubscription({ planId, stamp: Date.now() + 3, suffix: 'uno' })
    businessUnitIds.push(sub.buId)
    await createPayment({
      subId: sub.subId,
      subtotalCents: 456_700,
      periodsCovered: 1,
      periodStart: mesAtras(5),
    })

    const after = await service.getMonthlySeries(12)

    assert.equal(importeDe(after, claveMes(5)) - importeDe(before, claveMes(5)), 456_700)
    assert.equal(importeDe(after, claveMes(4)) - importeDe(before, claveMes(4)), 0)
  })

  test('la ventana termina en el mes en curso y ese punto siempre es de baja confiabilidad', async ({
    assert,
  }) => {
    const serie = await service.getMonthlySeries(6)
    const ultimo = serie.puntos.at(-1)

    assert.isDefined(ultimo)
    assert.equal(ultimo!.mes, claveMes(0))
    assert.equal(serie.ventana.hasta, claveMes(0))
    assert.equal(ultimo!.confiabilidad, 'baja')
    assert.equal(ultimo!.motivoBajaConfiabilidad, 'mes-en-curso')
    assert.isAtMost(serie.puntos.length, 6)
  })

  test('el agregado no publica identificadores internos ni identidad de clientes', async ({
    assert,
  }) => {
    const serie = await service.getMonthlySeries(12)
    const raw = JSON.stringify(serie)

    for (const prohibido of [
      'businessUnitId',
      'business_unit_id',
      'billingSubscriptionId',
      'billingPaymentId',
      'rfc',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node ace test functional --files=platform_mrr_series_service`
Expected: FAIL — `getMonthlySeries` no existe en el servicio.

- [ ] **Step 3: Agregar el universo y las dos consultas**

Dentro de `export default class PlatformMrrService`, después de `loadCurrencies`:

```ts
  /**
   * Serie mensual de MRR **cobrado** (USRH1788052455654).
   *
   * Es una métrica distinta de `getMrrSnapshot`, no otra vista de la misma:
   * aquélla mide lo contratado y vigente hoy, ésta mide lo que entró de cobros
   * atribuibles a cada mes. El último punto de la serie normalmente **no**
   * coincide con `mrrActualNetoCents`, y eso es correcto — por eso el payload
   * declara `criterio: 'pagos'` y los campos se llaman distinto.
   *
   * Se leen TODOS los cobros con periodo, no solo los de la ventana: un cobro
   * anterior que cubrió varios meses puede seguir aportando adentro, y acotar por
   * fecha de arranque perdería esa aportación en silencio. Con el volumen de hoy
   * la pasada completa es barata; si los cobros llegan a decenas de miles, ése es
   * el momento de acotar por rango o de materializar la serie — supuesto abierto
   * y declarado en la HU, no deuda escondida.
   *
   * @param months - Ancho de la ventana en meses, ya validado en 1..24 por el controlador.
   * @returns La serie, su ventana y cuántos cobros quedaron fuera por no tener periodo.
   */
  async getMonthlySeries(months: number): Promise<PlatformMrrSeries> {
    const currentMonth = toBusinessDateString().slice(0, 7)

    const rows = await this.loadPaymentsWithPeriod()
    const paymentsWithoutPeriod = await this.countPaymentsWithoutPeriod()

    return buildMrrSeries(rows, { currentMonth, months, paymentsWithoutPeriod })
  }

  /**
   * Universo de la serie: cobros de suscripciones vivas de empresas vivas.
   *
   * Los dos `whereNull` van a mano porque las queries crudas de Knex no pasan por
   * el hook de `SoftDeletes` (gotcha del área, `platform_device_service.ts`). Sin
   * ellos la serie suma los cobros de tenants borrados **sin fallar**, que es la
   * peor forma de estar mal.
   *
   * **`billing_payments` no tiene borrado lógico:** es append-only, el modelo no
   * declara `deletedAt` y la columna no existe en la tabla. No se le agrega un
   * filtro `deleted_at` — la consulta reventaría.
   *
   * Sin filtro de estado de la suscripción: un cobro de una suscripción que hoy
   * está `past_due` o `canceled` sigue siendo dinero que entró por el mes que
   * cubrió. Lo que excluye es la baja lógica, no el estado.
   */
  private seriesBaseQuery() {
    return db
      .from('billing_payments as bp')
      .join(
        'billing_subscriptions as bs',
        'bs.billing_subscription_id',
        'bp.billing_subscription_id'
      )
      .join('business_units as bu', 'bu.business_unit_id', 'bs.business_unit_id')
      .whereNull('bs.billing_subscription_deleted_at')
      .whereNull('bu.business_unit_deleted_at')
  }

  /**
   * Cobros con periodo registrado, reducidos a importe, meses cubiertos y mes de
   * arranque.
   *
   * El mes se calcula con `DATE_FORMAT` en SQL y no en JavaScript: los valores
   * `DATE` del driver MySQL llegan anclados a UTC y leerlos en zona local correría
   * el día —y con él el mes— en todo cobro que arranque el día 1 (gotcha
   * documentado en `business_date.ts`).
   *
   * Se lee `billing_payment_subtotal_cents`, que es el importe SIN IVA congelado
   * al cobrar. **No se convierte a centavos**: ya lo está, al revés que las
   * columnas `decimal` de la suscripción.
   *
   * @returns Una fila por cobro atribuible. Sin orden garantizado: el reparto no depende de él.
   */
  private async loadPaymentsWithPeriod(): Promise<MrrPaymentPeriodRow[]> {
    const rows = (await this.seriesBaseQuery()
      .whereNotNull('bp.billing_payment_period_start')
      .whereNotNull('bp.billing_payment_period_end')
      .select('bp.billing_payment_subtotal_cents as subtotalCents')
      .select('bp.billing_payment_periods_covered as periodsCovered')
      .select(
        db.raw("DATE_FORMAT(bp.billing_payment_period_start, '%Y-%m') as periodStartMonth")
      )) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      subtotalCents: Number(row.subtotalCents ?? 0),
      periodsCovered: Number(row.periodsCovered ?? 0),
      periodStartMonth: String(row.periodStartMonth ?? ''),
    }))
  }

  /**
   * Cuántos cobros del universo no se pueden ubicar en ningún mes por no tener
   * periodo registrado. Son los pagos parciales, que por diseño dejan
   * `period_start` y `period_end` en nulo.
   *
   * Se informan, no se adivinan: ubicarlos por la fecha de pago inventaría
   * ingreso en un mes que no lo recibió.
   *
   * Los paréntesis del `whereRaw` son obligatorios: sin ellos el `OR` se lleva
   * por delante los `AND` del universo y la consulta devolvería cobros de
   * empresas borradas.
   *
   * @returns Conteo de cobros descartados; 0 cuando no hay ninguno.
   */
  private async countPaymentsWithoutPeriod(): Promise<number> {
    const row = (await this.seriesBaseQuery()
      .whereRaw(
        '(bp.billing_payment_period_start IS NULL OR bp.billing_payment_period_end IS NULL)'
      )
      .select(db.raw('COUNT(*) as total'))
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
  }
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `node ace test functional --files=platform_mrr_series_service`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verificar que el núcleo y el MRR de la orden 8 siguen verdes**

Run: `node ace test unit --files=platform_mrr_series && node ace test functional --files=platform_mrr_service`
Expected: PASS en las dos.

- [ ] **Step 6: Verificar tipos y estilo**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/services/platform_mrr_service.ts tests/functional/platform_mrr_series_service.spec.ts
git commit -m "feat(metrics): read the paid periods that feed the monthly MRR series"
```

---

## Task 4: Endpoint, ruta y Swagger

**Files:**
- Modify: `app/controllers/platform_mrr_controller.ts` (agregar imports y el método `series`; **no** se toca `index` ni su Swagger)
- Modify: `start/routes/platform_mrr_routes.ts` (una línea dentro del grupo)
- Test: `tests/functional/platform_mrr_series_metrics.spec.ts` (crear)

**Interfaces:**
- Consumes: `mrrSeriesValidator` y `mrrSeriesValidatorMessages` (Task 1), `MRR_SERIES_METRIC_ERROR_TEXTS` (Task 1), `PlatformMrrService.getMonthlySeries` (Task 3), y `resolvePlatformMetricApiError`, ya importado en el controlador.
- Produces: `GET /api/platform/metrics/mrr-series` con el contrato completo.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/functional/platform_mrr_series_metrics.spec.ts`:

```ts
import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import BillingSubscription from '#models/billing_subscription'
import BillingPayment from '#models/billing_payment'
import BillingCatalogService from '#services/billing_catalog_service'

/**
 * USRH1788052455654 — contrato de `GET /api/platform/metrics/mrr-series`.
 *
 * Las reglas del cálculo viven en las pruebas del servicio. Aquí se prueba lo
 * que solo el transporte puede romper: que la ruta exista dentro del grupo con
 * los dos guards, la forma exacta del payload, el 422 de la ventana y los
 * rechazos de perímetro.
 *
 * El grupo siembra una suscripción con un cobro que cubre el mes en curso para
 * que la serie nunca salga vacía en estas pruebas: la base es compartida y no se
 * puede garantizar qué cobros traen los demás fixtures.
 */

const TEST_PASSWORD = 'MrrSeriesTest123!'
const BASE_URL = '/api/platform/metrics/mrr-series'

/** Llaves exactas del payload. Lista cerrada: si alguien agrega un campo, este test lo detiene. */
const EXPECTED_DATA_KEYS = ['criterio', 'pagosSinPeriodoExcluidos', 'puntos', 'ventana']
const EXPECTED_POINT_KEYS = [
  'confiabilidad',
  'mes',
  'motivoBajaConfiabilidad',
  'mrrCobradoNetoCents',
  'pagosConsiderados',
]

const MES_EN_CURSO = DateTime.now().toFormat('yyyy-MM')

interface TestActor {
  user: User
  person: Person
}

interface SeriesPoint {
  mes: string
  mrrCobradoNetoCents: number
  pagosConsiderados: number
  confiabilidad: string
  motivoBajaConfiabilidad: string | null
}

interface SeriesBody {
  ventana: { desde: string | null; hasta: string | null }
  criterio: string
  pagosSinPeriodoExcluidos: number
  puntos: SeriesPoint[]
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'Mrr',
    personLastname: 'Series',
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

/** Siembra plan, empresa, suscripción y un cobro que cubre el mes en curso. */
async function seedPaidMonth(): Promise<{ buId: number; planId: number }> {
  const stamp = Date.now()
  const catalog = new BillingCatalogService()
  const plan = await catalog.createPlan({
    billingPlanName: `Mrr Series Http Plan ${stamp}`,
    billingPlanDescription: 'Fixture HTTP de USRH1788052455654',
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

  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Mrr Series Http BU ${stamp}`
  businessUnit.businessUnitSlug = `mrr-series-http-bu-${stamp}`
  businessUnit.businessUnitLegalName = `Mrr Series Http Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()

  const price = await BillingPlanPrice.query()
    .where('billing_plan_id', plan.billingPlanId)
    .firstOrFail()
  const now = DateTime.utc()

  const subscription = await BillingSubscription.create({
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
    billingSubscriptionContractedSubtotal: 650,
    billingSubscriptionContractedTaxAmount: 104,
    billingSubscriptionContractedTotal: 754,
    billingSubscriptionCreditBalanceCents: 0,
    billingSubscriptionContractedEffectiveFrom: now,
    billingSubscriptionCurrentPeriodStart: now.minus({ days: 15 }),
    billingSubscriptionCurrentPeriodEnd: now.plus({ days: 15 }),
    billingSubscriptionSubscribedAt: now,
    billingSubscriptionLiveBusinessUnitId: businessUnit.businessUnitId,
  })

  await BillingPayment.create({
    billingSubscriptionId: subscription.billingSubscriptionId,
    billingPaymentAmountCents: 65_000,
    billingPaymentPeriodAmountCents: 65_000,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 65_000,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 65_000,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 65_000,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `MRR-SERIES-HTTP-${stamp}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.now(),
    billingPaymentPeriodStart: DateTime.now().startOf('month'),
    billingPaymentPeriodEnd: DateTime.now().startOf('month').plus({ months: 1 }),
  })

  return { buId: businessUnit.businessUnitId, planId: plan.billingPlanId }
}

async function cleanupSeed(buId: number, planId: number): Promise<void> {
  const subscriptions = await BillingSubscription.query().withTrashed().where('business_unit_id', buId)
  for (const subscription of subscriptions) {
    await BillingPayment.query()
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .delete()
    await subscription.forceDelete()
  }
  await BusinessUnit.query().withTrashed().where('business_unit_id', buId).delete()
  await BillingVolumeTier.query().where('billing_plan_id', planId).delete()
  await BillingPlanPrice.query().where('billing_plan_id', planId).delete()
  const plan = await BillingPlan.find(planId)
  if (plan) await plan.delete()
}

test.group('GET /api/platform/metrics/mrr-series', (group) => {
  let admin: TestActor | null = null
  let outsider: TestActor | null = null
  let seed: { buId: number; planId: number } | null = null

  group.setup(async () => {
    admin = await createActor('mrr-series-admin', true)
    outsider = await createActor('mrr-series-outsider', false)
    seed = await seedPaidMonth()
  })

  group.teardown(async () => {
    if (seed) await cleanupSeed(seed.buId, seed.planId)
    await cleanupActor(admin)
    await cleanupActor(outsider)
  })

  test('la ruta existe y responde el envelope del área con las llaves exactas', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(Object.keys(response.body().data).sort(), EXPECTED_DATA_KEYS)
    assert.isUndefined(response.body().meta)
  })

  test('CA-9 — el payload declara criterio pagos y no trae los campos de la franja', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    assert.equal(data.criterio, 'pagos')
    assert.notInclude(JSON.stringify(data), 'mrrActualNeto')
    assert.notInclude(JSON.stringify(data), 'mrrProyectadoTrial')
  })

  test('cada punto trae sus cinco campos, con enteros y mes YYYY-MM', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    assert.isNotEmpty(data.puntos)
    for (const punto of data.puntos) {
      assert.deepEqual(Object.keys(punto).sort(), EXPECTED_POINT_KEYS)
      assert.match(punto.mes, /^\d{4}-\d{2}$/)
      assert.isTrue(Number.isInteger(punto.mrrCobradoNetoCents))
      assert.isTrue(Number.isInteger(punto.pagosConsiderados))
      assert.include(['alta', 'baja'], punto.confiabilidad)
    }
    assert.isTrue(Number.isInteger(data.pagosSinPeriodoExcluidos))
    assert.isAtLeast(data.pagosSinPeriodoExcluidos, 0)
  })

  test('los puntos van en orden cronológico y la ventana termina en el mes en curso', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody
    const meses = data.puntos.map((punto) => punto.mes)

    assert.deepEqual(meses, [...meses].sort())
    assert.equal(data.ventana.hasta, MES_EN_CURSO)
    assert.equal(meses.at(-1), MES_EN_CURSO)
    assert.equal(data.ventana.desde, meses[0])
    assert.isAtMost(meses.length, 12)
  })

  test('CA-3 — el punto del mes en curso siempre viene de baja confiabilidad', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const data = response.body().data as SeriesBody
    const enCurso = data.puntos.at(-1)!

    assert.equal(enCurso.mes, MES_EN_CURSO)
    assert.equal(enCurso.confiabilidad, 'baja')
    assert.equal(enCurso.motivoBajaConfiabilidad, 'mes-en-curso')
  })

  test('meses = 3 recorta la ventana a tres puntos', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).qs({ meses: 3 }).loginAs(admin!.user)
    const data = response.body().data as SeriesBody

    response.assertStatus(200)
    assert.isAtMost(data.puntos.length, 3)
    assert.equal(data.ventana.hasta, MES_EN_CURSO)
  })

  test('CA-7 — meses = 40 responde 422 con el cuerpo exacto y sin ningún punto', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).qs({ meses: 40 }).loginAs(admin!.user)

    response.assertStatus(422)
    assert.equal(response.body().title, 'No fue posible obtener la serie mensual de MRR')
    assert.equal(response.body().detail, 'El número de meses debe estar entre 1 y 24.')
    assert.equal(response.body().code, 'PLT.MET.VAL_INPUT')
    assert.equal(response.body().key, 'no-fue-posible-obtener-la-serie-mensual-de-mrr')
    assert.isUndefined(response.body().data)
  })

  test('meses = 0 y meses no entero también responden 422', async ({ client, assert }) => {
    const cero = await client.get(BASE_URL).qs({ meses: 0 }).loginAs(admin!.user)
    const texto = await client.get(BASE_URL).qs({ meses: 'doce' }).loginAs(admin!.user)

    cero.assertStatus(422)
    texto.assertStatus(422)
    assert.equal(cero.body().code, 'PLT.MET.VAL_INPUT')
    assert.equal(texto.body().code, 'PLT.MET.VAL_INPUT')
  })

  test('CA-8 — sin is_platform_admin responde 403 sin campo code', async ({ client, assert }) => {
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

  test('el agregado no publica identidad de clientes', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    const raw = JSON.stringify(response.body())

    for (const prohibido of [
      'businessUnitPublicId',
      'business_unit_id',
      'billingSubscriptionId',
      'billingPaymentId',
      'rfc',
      'billingEmail',
    ]) {
      assert.notInclude(raw, prohibido)
    }
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `node ace test functional --files=platform_mrr_series_metrics`
Expected: FAIL con 404 — la ruta no existe.

- [ ] **Step 3: Agregar la ruta**

En `start/routes/platform_mrr_routes.ts`, dentro del grupo, debajo de la línea de `/mrr`:

```ts
router
  .group(() => {
    router.get('/mrr', '#controllers/platform_mrr_controller.index')
    router.get('/mrr-series', '#controllers/platform_mrr_controller.series')
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

Y actualizar el encabezado del archivo para que describa las dos rutas:

```ts
/**
 * ─── Métricas de plataforma · ingreso recurrente ──────────────────────────────
 *   GET  /api/platform/metrics/mrr         → actual neto y proyectado de pruebas
 *   GET  /api/platform/metrics/mrr-series  → serie mensual de MRR cobrado
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo y en ese orden. Refs: USRH1788052455653, USRH1788052455654.
 *
 *   Las dos rutas miden cosas distintas: `/mrr` es ingreso CONTRATADO vigente
 *   hoy y `/mrr-series` es ingreso COBRADO por periodo. Comparten prefijo, no
 *   métrica, y sus números no tienen por qué coincidir.
 */
```

- [ ] **Step 4: Agregar los imports del controlador**

En `app/controllers/platform_mrr_controller.ts`, ampliar los imports existentes:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import PlatformMrrService from '#services/platform_mrr_service'
import {
  MRR_METRIC_ERROR_TEXTS,
  MRR_SERIES_METRIC_ERROR_TEXTS,
} from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'
import {
  mrrSeriesValidator,
  mrrSeriesValidatorMessages,
} from '../validators/platform_metric.js'
```

- [ ] **Step 5: Agregar el método `series` con su Swagger**

Dentro de `export default class PlatformMrrController`, después de `index`:

````ts
  /**
   * @swagger
   * /api/platform/metrics/mrr-series:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Serie mensual de ingreso recurrente COBRADO, reconstruida desde los pagos
   *     description: |
   *       Devuelve un valor por mes calendario con el ingreso recurrente atribuible a ese mes,
   *       reconstruido a partir de los cobros que el sistema ya registró. No hay proceso que
   *       tome fotos mensuales: la serie se calcula en el momento de la consulta sobre el
   *       desglose congelado de cada cobro, así que dice algo desde el primer día.
   *       ADVERTENCIA — esta serie NO es la misma métrica que GET /api/platform/metrics/mrr.
   *       Aquélla publica mrrActualNetoCents y mide ingreso CONTRATADO vigente hoy; ésta
   *       publica mrrCobradoNetoCents y mide ingreso COBRADO por el periodo que cada pago
   *       cubrió. Son dos preguntas distintas y sus números no tienen por qué coincidir: el
   *       último punto de la serie normalmente será distinto de la cifra de la franja, y eso
   *       es correcto, no un defecto. El payload lo declara con criterio: pagos y los nombres
   *       de campo llevan la diferencia encima a propósito.
   *       Cada cobro aporta su importe SIN IVA repartido en partes iguales entre los meses del
   *       periodo que cubrió: un cobro de tres meses aporta un tercio a cada uno en lugar de
   *       inflar el mes en que se pagó. El reparto usa división entera de centavos y el residuo
   *       no se atribuye a ningún mes.
   *       Los cobros sin periodo registrado NO se ubican en ningún mes —ni por la fecha de pago
   *       ni por ningún otro criterio—: quedan fuera y se informan en pagosSinPeriodoExcluidos.
   *       Un mes sin cobros atribuibles vale 0 y viene marcado de baja confiabilidad. Nunca se
   *       rellena con el mes anterior, con un promedio ni con una estimación. El mes en curso
   *       siempre viene de baja confiabilidad: está incompleto por definición y siempre se verá
   *       más bajo de lo que terminará siendo.
   *       La precedencia del motivo es mes-en-curso, después anterior-al-primer-pago y al final
   *       sin-pagos-en-el-mes: un mes en curso sin cobros se reporta como mes en curso.
   *       Si no existe ni un solo cobro con periodo registrado, la respuesta es 200 con
   *       puntos vacío y la ventana en null. NO se devuelve una lista de meses en cero.
   *       La ventana nunca arranca antes del mes del primer cobro con periodo y termina en el
   *       mes en curso. Quedan fuera los cobros de suscripciones borradas y de empresas
   *       borradas. Los importes van en centavos enteros y SIN IVA.
   *       Es un agregado de solo lectura: no publica empresas, identificadores internos ni
   *       información fiscal, y no escribe nada.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: meses
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 24
   *           default: 12
   *         description: Ancho de la ventana en meses. Fuera de 1..24 o no entero responde 422.
   *     responses:
   *       '200':
   *         description: La serie mensual, su ventana y el conteo de cobros descartados
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
   *                     ventana:
   *                       type: object
   *                       description: |
   *                         Meses que la serie alcanza a reconstruir. desde nunca es anterior al
   *                         mes del primer cobro con periodo; hasta es el mes en curso. Ambos en
   *                         null cuando no hay ni un solo cobro con periodo.
   *                       properties:
   *                         desde:
   *                           type: string
   *                           nullable: true
   *                           example: "2026-01"
   *                         hasta:
   *                           type: string
   *                           nullable: true
   *                           example: "2026-09"
   *                     criterio:
   *                       type: string
   *                       enum: [pagos]
   *                       description: |
   *                         Fuente declarada en el propio payload. Marca que esta serie mide
   *                         ingreso COBRADO y no el contratado vigente de /metrics/mrr.
   *                     pagosSinPeriodoExcluidos:
   *                       type: integer
   *                       description: |
   *                         Cobros que no se pudieron ubicar en ningún mes por no tener periodo
   *                         registrado. Se informan; jamás se les asigna un mes a ojo.
   *                     puntos:
   *                       type: array
   *                       description: Un punto por mes, cronológico ascendente y sin huecos dentro de la ventana.
   *                       items:
   *                         type: object
   *                         properties:
   *                           mes:
   *                             type: string
   *                             example: "2026-04"
   *                           mrrCobradoNetoCents:
   *                             type: integer
   *                             description: |
   *                               Ingreso recurrente COBRADO atribuido al mes, SIN IVA, en centavos.
   *                               No es mrrActualNetoCents y no se espera que coincida con él.
   *                           pagosConsiderados:
   *                             type: integer
   *                             description: Cobros que aportaron a este mes. Un cobro de tres periodos cuenta en los tres.
   *                           confiabilidad:
   *                             type: string
   *                             enum: [alta, baja]
   *                           motivoBajaConfiabilidad:
   *                             type: string
   *                             nullable: true
   *                             enum: [mes-en-curso, sin-pagos-en-el-mes, anterior-al-primer-pago]
   *                             description: null cuando la confiabilidad es alta.
   *       '422':
   *         description: Ventana fuera de 1..24 o no entera
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: No fue posible obtener la serie mensual de MRR
   *                 detail:
   *                   type: string
   *                   example: El número de meses debe estar entre 1 y 24.
   *                 key:
   *                   type: string
   *                   example: no-fue-posible-obtener-la-serie-mensual-de-mrr
   *                 code:
   *                   type: string
   *                   example: PLT.MET.VAL_INPUT
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
   *         description: Falla no controlada al calcular la serie
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Error inesperado al obtener la serie mensual de MRR
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-inesperado-al-obtener-la-serie-mensual-de-mrr
   *                 code:
   *                   type: string
   *                   example: PLT.MET.SYS_UNHANDLED
   *
   * @series
   * @summary Serie mensual de ingreso recurrente COBRADO, reconstruida desde los pagos
   * @description Devuelve un valor por mes calendario con el ingreso recurrente atribuible a ese\
   *   mes, reconstruido desde los cobros ya registrados. Se calcula en el momento de la consulta:\
   *   sin fotos mensuales, sin caché y sin proceso programado.\
   *   ADVERTENCIA: NO es la misma métrica que GET /api/platform/metrics/mrr. Aquélla mide ingreso\
   *   CONTRATADO vigente hoy (mrrActualNetoCents); ésta mide ingreso COBRADO por periodo\
   *   (mrrCobradoNetoCents). Sus números no tienen por qué coincidir y el último punto de la serie\
   *   normalmente será distinto de la cifra de la franja. Eso es correcto, no un defecto.\
   *   Cada cobro aporta su importe SIN IVA repartido en partes iguales entre los meses que cubrió.\
   *   Los cobros sin periodo no se ubican en ningún mes: se excluyen y se cuentan.\
   *   Un mes sin cobros vale 0 y viene marcado; nunca se rellena con estimaciones. El mes en curso\
   *   siempre viene marcado porque está incompleto por definición.\
   *   Sin ningún cobro con periodo la respuesta es 200 con puntos vacío y ventana en null.\
   *   Quedan fuera los cobros de suscripciones y empresas borradas. Importes en centavos, SIN IVA.\
   *   Es un agregado: no publica empresas, identificadores internos ni información fiscal.
   * @tag Platform · Métricas
   * @operationId getPlatformMrrSeries
   * @security [{"bearerAuth": []}]
   * @paramQuery meses - Ancho de la ventana en meses, 1..24 (default 12) - integer
   * @responseBody 200 - {"type": "success", "data": {"ventana": {"desde": "2026-04", "hasta": "2026-09"}, "criterio": "pagos", "pagosSinPeriodoExcluidos": 2, "puntos": [{"mes": "2026-04", "mrrCobradoNetoCents": 100000, "pagosConsiderados": 1, "confiabilidad": "alta", "motivoBajaConfiabilidad": null}, {"mes": "2026-05", "mrrCobradoNetoCents": 0, "pagosConsiderados": 0, "confiabilidad": "baja", "motivoBajaConfiabilidad": "sin-pagos-en-el-mes"}, {"mes": "2026-09", "mrrCobradoNetoCents": 65000, "pagosConsiderados": 1, "confiabilidad": "baja", "motivoBajaConfiabilidad": "mes-en-curso"}]}}
   * @responseBody 422 - {"title": "No fue posible obtener la serie mensual de MRR", "detail": "El número de meses debe estar entre 1 y 24.", "key": "no-fue-posible-obtener-la-serie-mensual-de-mrr", "code": "PLT.MET.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-serie-mensual-de-mrr", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async series({ request, response }: HttpContext) {
    try {
      // Los mensajes van explícitos: el provider global de i18n solo se usa
      // cuando la llamada no trae el suyo, y sin esto el 422 saldría en inglés.
      const { meses } = await request.validateUsing(mrrSeriesValidator, {
        messagesProvider: mrrSeriesValidatorMessages,
      })

      // El 12 por omisión vive aquí y no en el validador, para que el default
      // esté en un solo lugar.
      const data = await this.service.getMonthlySeries(meses ?? 12)

      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        MRR_SERIES_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
````

Y ampliar el docblock de la clase para que nombre las dos superficies:

```ts
/**
 * Ingreso mensual recurrente de la plataforma en la consola GSTI
 * (USRH1788052455653 y USRH1788052455654).
 *
 * Publica dos superficies que NO son la misma métrica:
 *
 * - `index` → el ingreso CONTRATADO vigente hoy, en dos cifras que no se suman:
 *   el actual neto de las suscripciones activas y el proyectado de las de prueba.
 * - `series` → el ingreso COBRADO mes a mes, reconstruido desde los cobros que ya
 *   ocurrieron. Responde "cuánto entró" y no "cuánto tenemos contratado".
 *
 * Sus números no tienen por qué coincidir y el último punto de la serie
 * normalmente será distinto de la cifra de la franja. Los nombres de campo
 * (`mrrActualNetoCents` vs `mrrCobradoNetoCents`) llevan la diferencia encima a
 * propósito, y la serie declara además `criterio: 'pagos'` en su payload.
 */
```

- [ ] **Step 6: Correr la prueba y verificar que pasa**

Run: `node ace test functional --files=platform_mrr_series_metrics`
Expected: PASS, 11 tests.

Si sale 404: falta la línea de la ruta o el nombre del método no coincide con el string del `router.get`.

- [ ] **Step 7: Verificar que el endpoint de la orden 8 sigue intacto**

Run: `node ace test functional --files=platform_mrr_metrics`
Expected: PASS. El grupo compartido y el import de `start/routes.ts` no cambiaron.

- [ ] **Step 8: Verificar tipos, estilo y terminología**

Run: `npm run typecheck && npm run lint && npm run lint:terminology`
Expected: sin errores en los tres.

- [ ] **Step 9: Commit**

```bash
git add app/controllers/platform_mrr_controller.ts start/routes/platform_mrr_routes.ts tests/functional/platform_mrr_series_metrics.spec.ts
git commit -m "feat(metrics): expose GET /api/platform/metrics/mrr-series behind the platform admin guard"
```

---

## Task 5: QA — seeder y manual de prueba manual de API

**Files:**
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado; está en `.git/info/exclude`)
- Create: `docs/superpowers/plans/2026-09-08-serie-mensual-mrr-desde-pagos-qa-api.md`

**Interfaces:**
- Consumes: `Person`, `User`, `BusinessUnit`, `BillingPlan`, `BillingPlanPrice`, `BillingSubscription`, `DateTime` y la constante `QA_PASSWORD`, todos ya en el seeder; `seedMrrSubscriptionQa`, que dejó la orden 8. `BillingPayment` **no** está importado todavía y hay que agregarlo.
- Produces: los usuarios `qa-mrr-series-admin@gsti-tests.local` y `qa-mrr-series-sin-marca@gsti-tests.local`, y cinco cobros de recorrido. Nada que consuma otra tarea.

**Es un manual de API, no de frontend.** El spec es explícito: `feat` **API puro**, cero cambios en `valanserh-landlord`, y "esta HU no pinta nada". No hay pantalla que recorrer — lo que se prueba es el contrato. Se aparta a propósito del precedente de las órdenes 5, 6 y 8, que escribieron `-qa-flujo.md` porque eran fullstack. La gráfica que consume esta serie llega en la orden 10 y trae su propio manual de frontend.

**Constantes del proyecto** (tomadas del código y del manual de API anterior, `2026-08-28-permiso-gafetes-y-retiro-de-casillas-muertas-qa-api.md`; no inventadas):

| Constante | Valor |
|---|---|
| URL base del API | `http://127.0.0.1:3333` (`PORT=3333`, `HOST=127.0.0.1` en `.env`) |
| Auth | Bearer, resuelta por el cliente de API. No se documenta el login: la HU no lo cambia |
| Envelope de éxito | `{ "type": "success", "data": { … } }` |
| Envelope de error | `{ "title", "detail", "key", "code" }`; el 403 del guard sale **sin** `code` |
| Seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`, desde `gsti-rh-api` |
| Dominio de prueba | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

**Qué NO se puede provocar, y se declara en el manual:** la serie vacía (CA-5) exige una base **sin ningún cobro con periodo**. La de QA ya trae cobros de los fixtures de facturación, y vaciarla rompería los demás paneles. Queda declarado como no revisable a mano; lo cubre la prueba unitaria del núcleo puro.

**Cómo se resuelve que la base sea compartida:** `mrrCobradoNetoCents` es un agregado de toda la plataforma, así que el importe de un mes trae también los cobros de otros fixtures. Un manual que dijera "verifica que abril valga 100 000" mentiría. Por eso cada escenario entrega **la consulta SQL que calcula el valor esperado** y se comparan los dos números, en lugar de fijar un literal. Lo que sí es absoluto —la marca del mes en curso, el 422, el 403, el largo de la ventana— va con su valor exacto.

- [ ] **Step 1: Registrar la HU en el encabezado del seeder**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts`, la lista de historias del comentario de encabezado termina hoy en la línea 11. Cerrar el renglón de la orden 8 y agregar el de ésta:

```ts
 * USRH1788052455653 MRR actual neto y proyectado de pruebas en la franja +
 * USRH1788052455654 serie mensual de MRR reconstruida desde los pagos).
```

- [ ] **Step 2: Agregar el import de `BillingPayment`**

En el mismo archivo, junto a los demás imports de facturación (después de `import BillingSubscription, { … } from '#models/billing_subscription'`):

```ts
import BillingPayment from '#models/billing_payment'
```

- [ ] **Step 3: Agregar el helper que siembra un cobro**

En el mismo archivo, después de `seedMrrSubscriptionQa`:

```ts
/**
 * Un cobro de QA sobre una suscripción ya sembrada, con su desglose congelado.
 *
 * `periodStart` en `null` siembra el caso del pago parcial: sin periodo, la
 * serie no lo puede ubicar en ningún mes y lo cuenta como excluido.
 *
 * Idempotente por referencia: el seeder se corre muchas veces y `billing_payments`
 * es append-only, así que sin este candado cada corrida duplicaría los importes
 * del recorrido y el manual dejaría de cuadrar.
 *
 * @param params - Suscripción destino, importe SIN IVA en centavos, meses cubiertos y arranque del periodo.
 */
async function seedMrrSeriesPaymentQa(params: {
  subscriptionId: number
  reference: string
  subtotalCents: number
  periodsCovered: number
  periodStart: DateTime | null
}): Promise<void> {
  const existing = await BillingPayment.query()
    .where('billing_payment_reference', params.reference)
    .first()
  if (existing) return

  const periodEnd = params.periodStart
    ? params.periodStart.plus({ months: Math.max(params.periodsCovered, 1) })
    : null

  await BillingPayment.create({
    billingSubscriptionId: params.subscriptionId,
    billingPaymentAmountCents: params.subtotalCents,
    billingPaymentPeriodAmountCents: params.subtotalCents,
    billingPaymentPeriodsCovered: params.periodsCovered,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: params.subtotalCents,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: params.subtotalCents,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: params.subtotalCents,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: params.reference,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.utc(),
    billingPaymentPeriodStart: params.periodStart,
    billingPaymentPeriodEnd: periodEnd,
  })
}
```

- [ ] **Step 4: Agregar el sembrado de la serie**

En el mismo archivo, después de `seedMrrQa`:

```ts
/**
 * USRH1788052455654 — serie mensual de MRR reconstruida desde los pagos.
 *
 * Cinco cobros, elegidos para que cada regla del recorrido tenga cómo fallar:
 *   - Multi-periodo: $3,000.00 sin IVA repartidos en tres meses desde hace 5.
 *     Es CA-1: los meses −5, −4 y −3 reciben un tercio cada uno.
 *   - Hueco: NADA en el mes −2. Es CA-2: cero y `sin-pagos-en-el-mes`, sin
 *     heredar el importe del mes anterior.
 *   - Mes en curso: $650.00 sin IVA cubriendo el mes actual. Es CA-3: el punto
 *     sale con importe pero marcado `mes-en-curso`.
 *   - Sin periodo: $9,999.00 sin `period_start`. Es CA-4: no aporta a ningún mes
 *     y suma a `pagosSinPeriodoExcluidos`.
 *   - De baja lógica: $99,999.99 sobre una suscripción borrada. Es CA-6: no
 *     existe para la serie, ni siquiera como excluido.
 *
 * El de baja lógica lleva un importe absurdo a propósito: si el filtro
 * `billing_subscription_deleted_at IS NULL` faltara, el mes se dispararía tanto
 * que sería imposible no verlo.
 *
 * Se siembra un usuario SIN el marcador de plataforma además del administrador:
 * el 403 es criterio de aceptación (CA-8) y necesita quién lo dispare.
 */
async function seedMrrSeriesQa(): Promise<void> {
  await ensureMrrSeriesActor('qa-mrr-series-admin@gsti-tests.local', 'Admin', true)
  await ensureMrrSeriesActor('qa-mrr-series-sin-marca@gsti-tests.local', 'SinMarca', false)

  await seedMrrSubscriptionQa({
    slug: 'qa-mrr-series-cobros',
    name: 'QA MRR Series Cobros',
    status: 'active',
    contractedSubtotal: 3000,
    contractedUnitAmount: 300,
    contractedEmployees: 10,
  })

  await seedMrrSubscriptionQa({
    slug: 'qa-mrr-series-baja',
    name: 'QA MRR Series Baja',
    status: 'active',
    contractedSubtotal: 1000,
    contractedUnitAmount: 100,
    contractedEmployees: 10,
  })

  const viva = await BusinessUnit.query()
    .where('business_unit_slug', 'qa-mrr-series-cobros')
    .firstOrFail()
  const suscripcionViva = await BillingSubscription.query()
    .where('business_unit_id', viva.businessUnitId)
    .whereNull('billing_subscription_deleted_at')
    .firstOrFail()

  const inicioDeMes = DateTime.utc().startOf('month')

  await seedMrrSeriesPaymentQa({
    subscriptionId: suscripcionViva.billingSubscriptionId,
    reference: 'QA-MRR-SERIES-MULTI',
    subtotalCents: 300_000,
    periodsCovered: 3,
    periodStart: inicioDeMes.minus({ months: 5 }),
  })

  await seedMrrSeriesPaymentQa({
    subscriptionId: suscripcionViva.billingSubscriptionId,
    reference: 'QA-MRR-SERIES-EN-CURSO',
    subtotalCents: 65_000,
    periodsCovered: 1,
    periodStart: inicioDeMes,
  })

  await seedMrrSeriesPaymentQa({
    subscriptionId: suscripcionViva.billingSubscriptionId,
    reference: 'QA-MRR-SERIES-SIN-PERIODO',
    subtotalCents: 999_900,
    periodsCovered: 0,
    periodStart: null,
  })

  // La suscripción de baja se borra lógicamente DESPUÉS de colgarle su cobro:
  // el cobro tiene que existir para que el filtro tenga algo que excluir.
  const deBaja = await BusinessUnit.query()
    .where('business_unit_slug', 'qa-mrr-series-baja')
    .firstOrFail()
  const suscripcionDeBaja = await BillingSubscription.query()
    .withTrashed()
    .where('business_unit_id', deBaja.businessUnitId)
    .firstOrFail()

  await seedMrrSeriesPaymentQa({
    subscriptionId: suscripcionDeBaja.billingSubscriptionId,
    reference: 'QA-MRR-SERIES-BORRADA',
    subtotalCents: 9_999_999,
    periodsCovered: 1,
    periodStart: inicioDeMes.minus({ months: 4 }),
  })

  if (!suscripcionDeBaja.billingSubscriptionDeletedAt) {
    await suscripcionDeBaja.delete()
  }

  console.log(
    '[qa-seeder] mrr-series: cobro de 3 periodos, cobro del mes en curso, uno sin periodo y uno de suscripción borrada'
  )
}

/**
 * Usuario de plataforma del recorrido de la serie, con o sin el marcador de
 * administrador. Idempotente: reescribe contraseña y marcador en cada corrida.
 *
 * @param email - Correo del usuario de prueba.
 * @param apellido - Segundo apellido, solo para distinguirlos en el listado.
 * @param isPlatformAdmin - `true` para el que debe ver la serie, `false` para el que debe recibir 403.
 */
async function ensureMrrSeriesActor(
  email: string,
  apellido: string,
  isPlatformAdmin: boolean
): Promise<void> {
  const person = await Person.firstOrCreate(
    { personEmail: email },
    {
      personFirstname: 'QA',
      personLastname: 'MrrSeries',
      personSecondLastname: apellido,
      personEmail: email,
    }
  )

  const user = await User.query().where('user_email', email).first()
  if (!user) {
    await User.create({
      userEmail: email,
      userPassword: QA_PASSWORD,
      userActive: 1,
      roleId: 3,
      personId: person.personId,
      userEmailType: 'institutional',
      userPasswordSetAt: DateTime.utc(),
      isPlatformAdmin,
    })
    return
  }

  user.userPassword = QA_PASSWORD
  user.userActive = 1
  user.userPasswordSetAt = DateTime.utc()
  user.isPlatformAdmin = isPlatformAdmin
  await user.save()
}
```

- [ ] **Step 5: Colgar el sembrado del `run()`**

En el mismo archivo, dentro de `async run()`, justo después de `await seedMrrQa()`:

```ts
    await seedMrrQa()
    await seedMrrSeriesQa()
```

- [ ] **Step 6: Correr el seeder**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: termina sin error y en la salida aparece `[qa-seeder] mrr-series: cobro de 3 periodos, cobro del mes en curso, uno sin periodo y uno de suscripción borrada`.

Correrlo dos veces seguidas debe dar el mismo resultado: si los importes del recorrido cambian entre corridas, el candado por referencia del paso 3 no está funcionando.

- [ ] **Step 7: Escribir el playbook de prueba manual**

Crear `docs/superpowers/plans/2026-09-08-serie-mensual-mrr-desde-pagos-qa-api.md`:

`````markdown
# Prueba manual API — La serie mensual de MRR reconstruida desde los pagos

**Problema:** El panel ya sabía decir cuánto se factura hoy, pero no cómo se llegó ahí. La cifra del mes, sola, no dice si el negocio crece, se aplanó o empezó a caer; para eso hace falta la historia, y no existía en ninguna parte. Reconstruirla a mano significaba revisar cobros uno por uno, y el resultado cambiaba según quién lo armara.

**Solución:** Un endpoint nuevo devuelve un valor por mes con el ingreso recurrente **cobrado** de la plataforma, reconstruido a partir de los cobros que el sistema ya tenía registrados. No espera a acumular historia nueva: sirve desde el primer día. Cada mes viene con una marca que dice si su cifra se puede sostener con los cobros o no, y por qué.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

---

## Antes de empezar: dos advertencias

**1. La base es compartida.** Los importes que devuelve el endpoint son de **toda la plataforma**, así que cada mes trae también los cobros de otros fixtures, no solo los de esta prueba. Por eso ningún escenario te pide comparar contra un número escrito aquí: cada uno trae la consulta SQL que calcula el valor esperado, y lo que verificas es que los dos coincidan.

**2. Un caso de la historia no se puede provocar aquí.** La historia pide que, cuando **no exista ni un solo cobro con periodo registrado**, la respuesta salga con `puntos: []` y la ventana en `null`. Esta base ya trae cobros de los fixtures de facturación, y vaciarla rompería los demás paneles. Ese caso queda fuera del recorrido — está cubierto por pruebas automatizadas.

---

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listos los dos usuarios de esta prueba y siembra cinco cobros de recorrido: uno que cubre tres meses, uno del mes en curso, uno sin periodo registrado y uno colgado de una suscripción dada de baja.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-mrr-series-admin@gsti-tests.local` | `password` | Administrador de plataforma: debe ver la serie |
| **B** | `qa-mrr-series-sin-marca@gsti-tests.local` | `password` | Sin el marcador de plataforma: debe recibir `403` |

Guarda a la mano el mes actual en formato `YYYY-MM` — lo vas a usar en casi todos los escenarios. Lo obtienes con:

```sql
SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS mes_en_curso;
```

---

## 2. Escenario 1 — La serie responde con su forma completa

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 200:**

```json
{
  "type": "success",
  "data": {
    "ventana": { "desde": "2026-04", "hasta": "2026-09" },
    "criterio": "pagos",
    "pagosSinPeriodoExcluidos": 3,
    "puntos": [
      {
        "mes": "2026-04",
        "mrrCobradoNetoCents": 100000,
        "pagosConsiderados": 1,
        "confiabilidad": "alta",
        "motivoBajaConfiabilidad": null
      },
      { "...": "un objeto igual por cada mes de la ventana" }
    ]
  }
}
```

Verifica que:

- `criterio` valga exactamente `"pagos"`.
- `ventana.hasta` sea el mes en curso.
- El último elemento de `puntos` tenga ese mismo mes.
- Los meses de `puntos` vayan en orden ascendente y **sin saltarse ninguno**: `2026-04`, `2026-05`, `2026-06`… sin huecos.
- `puntos` traiga **como máximo 12 elementos** (es la ventana por omisión).
- Ningún elemento traiga campos de más: exactamente `mes`, `mrrCobradoNetoCents`, `pagosConsiderados`, `confiabilidad` y `motivoBajaConfiabilidad`.
- En ninguna parte de la respuesta aparezcan nombres de empresa, identificadores internos, RFC ni datos fiscales.

---

## 3. Escenario 2 — Un cobro de tres meses se reparte, no se amontona

Es la regla central de la historia: si un cliente pagó tres meses por adelantado, ese dinero se reparte entre los tres, no infla el mes en que se pagó.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

Calcula el valor esperado de los tres meses del cobro sembrado:

```sql
SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m') AS mes_1,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), '%Y-%m') AS mes_2,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 3 MONTH), '%Y-%m') AS mes_3;
```

El cobro sembrado vale 300 000 centavos y cubre tres periodos, así que aporta **100 000 centavos a cada uno** de esos tres meses. Como la base es compartida, compara contra el total real de cada mes:

```sql
SELECT DATE_FORMAT(bp.billing_payment_period_start, '%Y-%m') AS mes_inicio,
       SUM(FLOOR(bp.billing_payment_subtotal_cents / GREATEST(bp.billing_payment_periods_covered, 1))) AS aporte_por_mes,
       COUNT(*) AS cobros
FROM billing_payments bp
JOIN billing_subscriptions bs ON bs.billing_subscription_id = bp.billing_subscription_id
JOIN business_units bu ON bu.business_unit_id = bs.business_unit_id
WHERE bs.billing_subscription_deleted_at IS NULL
  AND bu.business_unit_deleted_at IS NULL
  AND bp.billing_payment_period_start IS NOT NULL
  AND bp.billing_payment_period_end IS NOT NULL
GROUP BY mes_inicio
ORDER BY mes_inicio;
```

**Qué debe pasar:**

- Los tres meses (`mes_1`, `mes_2`, `mes_3`) tienen un valor **distinto de cero** en `mrrCobradoNetoCents`, y su `pagosConsiderados` incluye el cobro sembrado.
- **Ninguno de los tres se lleva los 300 000 centavos completos.** Si uno solo se los lleva, el reparto está roto.
- La diferencia entre `mes_1` y `mes_2` es exactamente la que expliquen los demás cobros de la base: el cobro sembrado aporta lo mismo a los tres.

---

## 4. Escenario 3 — Un mes sin cobros vale cero y viene marcado

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

Averigua qué meses de la ventana no tienen ningún cobro atribuible, con la misma consulta del escenario anterior: los meses que **no aparecen** en su resultado y sí están en `puntos` son los huecos.

**Qué debe pasar en cada uno de esos meses:**

```json
{
  "mes": "2026-07",
  "mrrCobradoNetoCents": 0,
  "pagosConsiderados": 0,
  "confiabilidad": "baja",
  "motivoBajaConfiabilidad": "sin-pagos-en-el-mes"
}
```

Lo que **no** debe pasar: que el mes traiga el importe del mes anterior, un promedio o cualquier cifra distinta de `0`. Un mes sin información se declara, no se rellena.

> Si todos los meses de la ventana tienen cobros, este escenario no se puede observar hoy. En ese caso amplía la ventana con `?meses=24`: mientras más atrás, más probable es encontrar un mes vacío.

---

## 5. Escenario 4 — El mes en curso siempre viene marcado

El mes actual solo lleva los cobros de lo que va del mes, así que siempre se va a ver más bajo de lo que terminará siendo. Por eso se marca aunque tenga dinero.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Qué debe pasar** en el **último** elemento de `puntos`:

```json
{
  "mes": "<el mes en curso>",
  "mrrCobradoNetoCents": 65000,
  "pagosConsiderados": 1,
  "confiabilidad": "baja",
  "motivoBajaConfiabilidad": "mes-en-curso"
}
```

El importe y el conteo serán mayores si la base trae más cobros del mes; lo que se verifica es que **`confiabilidad` sea `"baja"` y el motivo sea exactamente `"mes-en-curso"`**, con importe distinto de cero. Que tenga dinero y aun así venga marcado es justo el punto.

---

## 6. Escenario 5 — Los cobros sin periodo se cuentan, no se acomodan

Un cobro que no registró qué periodo cubría no se puede ubicar en ningún mes. El sistema lo dice en vez de adivinarle una fecha.

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series`

Calcula cuántos deben ser:

```sql
SELECT COUNT(*) AS sin_periodo
FROM billing_payments bp
JOIN billing_subscriptions bs ON bs.billing_subscription_id = bp.billing_subscription_id
JOIN business_units bu ON bu.business_unit_id = bs.business_unit_id
WHERE bs.billing_subscription_deleted_at IS NULL
  AND bu.business_unit_deleted_at IS NULL
  AND (bp.billing_payment_period_start IS NULL OR bp.billing_payment_period_end IS NULL);
```

**Qué debe pasar:** `pagosSinPeriodoExcluidos` en la respuesta vale exactamente ese número, y es **mayor o igual a 1** (el seeder siembra uno de 999 900 centavos).

Además: ese cobro de 999 900 centavos **no aparece en ningún mes**. Si algún mes de la ventana se disparó en esa cantidad, el cobro se acomodó por la fecha de pago y eso está mal.

---

## 7. Escenario 6 — Los cobros de suscripciones dadas de baja no cuentan

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=12`

El seeder cuelga un cobro de **9 999 999 centavos** (casi cien mil pesos) de una suscripción dada de baja, con periodo hace cuatro meses. Es un importe absurdo a propósito: si el filtro fallara, sería imposible no verlo.

```sql
SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 4 MONTH), '%Y-%m') AS mes_del_cobro_borrado;
```

**Qué debe pasar:** el `mrrCobradoNetoCents` de ese mes está en el mismo orden de magnitud que sus meses vecinos (decenas o centenas de miles de centavos). Si ese mes vale millones, el cobro de la suscripción borrada se coló.

Y `pagosSinPeriodoExcluidos` **tampoco** lo cuenta: ese cobro sí tiene periodo, lo que lo excluye es la baja lógica. No debe aparecer por ningún lado.

---

## 8. Escenario 7 — La ventana se puede pedir, y tiene tope

Usuario: **A**.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=3`

**Response — 200:** `puntos` trae **como máximo 3** elementos y `ventana.hasta` sigue siendo el mes en curso.

**Endpoint:** `GET /api/platform/metrics/mrr-series?meses=40`

**Response — 422:**

```json
{
  "title": "No fue posible obtener la serie mensual de MRR",
  "detail": "El número de meses debe estar entre 1 y 24.",
  "key": "no-fue-posible-obtener-la-serie-mensual-de-mrr",
  "code": "PLT.MET.VAL_INPUT"
}
```

No debe venir ningún punto de serie en esa respuesta.

Repite con `?meses=0` y con `?meses=doce`: los dos responden **422** con el mismo `code` `PLT.MET.VAL_INPUT`.

---

## 9. Escenario 8 — Sin el marcador de plataforma no se ve nada

Usuario: **B** (`qa-mrr-series-sin-marca`).

**Endpoint:** `GET /api/platform/metrics/mrr-series`

**Response — 403:**

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "...",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Verifica que la respuesta **no traiga campo `code`** (es una inconsistencia conocida del guard, no un defecto de esta historia) y que **no revele nada del negocio**: ni importes, ni meses, ni conteos.

Y sin token, sin ningún `Authorization`:

**Response — 401.**

---

## 10. Escenario 9 — Esta serie NO es la cifra de la franja

Es el malentendido que la historia se hace cargo de evitar. Son dos métricas distintas y sus números no tienen por qué coincidir.

Usuario: **A**. Llama a los dos endpoints:

- `GET /api/platform/metrics/mrr` → devuelve `mrrActualNetoCents`: lo que está **contratado y vigente hoy**.
- `GET /api/platform/metrics/mrr-series` → el último punto devuelve `mrrCobradoNetoCents`: lo que **se cobró** para el mes en curso.

**Qué debe pasar:** los dos números son **distintos**, y eso es correcto. Lo que se verifica es que la diferencia esté declarada y no escondida:

- La respuesta de la serie trae `criterio: "pagos"`.
- Los campos se llaman distinto: `mrrCobradoNetoCents` en la serie, `mrrActualNetoCents` en la otra.
- La respuesta de la serie **no contiene** en ninguna parte la cadena `mrrActualNetoCents`.

---

## 11. Checklist

- [ ] Escenario 1: la serie responde `200`, con `criterio: "pagos"`, meses en orden y sin huecos, y máximo 12 puntos
- [ ] Escenario 2: el cobro de tres meses aporta lo mismo a cada uno; ninguno se lleva el importe completo
- [ ] Escenario 3: un mes sin cobros vale `0`, con `confiabilidad: "baja"` y motivo `"sin-pagos-en-el-mes"`
- [ ] Escenario 4: el mes en curso viene con `confiabilidad: "baja"` y motivo `"mes-en-curso"`, aunque tenga dinero
- [ ] Escenario 5: `pagosSinPeriodoExcluidos` cuadra con la consulta y el cobro sin periodo no aparece en ningún mes
- [ ] Escenario 6: el cobro de la suscripción dada de baja no aparece en ningún mes ni en los excluidos
- [ ] Escenario 7: `?meses=3` recorta la ventana; `?meses=40`, `?meses=0` y `?meses=doce` responden `422` con `PLT.MET.VAL_INPUT`
- [ ] Escenario 8: el usuario sin marcador de plataforma recibe `403` sin campo `code`; sin token, `401`
- [ ] Escenario 9: los dos endpoints dan números distintos y la serie lo declara con `criterio: "pagos"`
`````

- [ ] **Step 8: Levantar el ambiente y entregar**

```bash
cd /Users/noeabelvargaslopez/Documents/projects/gsti-rh-api
npm run dev
```

El playbook lo recorre **una persona** con su cliente de API. No se automatiza el recorrido con Playwright ni con scripts: la tarea termina cuando el servidor está arriba, el seeder corrió y el manual está escrito.

- [ ] **Step 9: Commit**

El seeder está en `.git/info/exclude` y **no entra al commit**. Solo el manual:

```bash
git add docs/superpowers/plans/2026-09-08-serie-mensual-mrr-desde-pagos-qa-api.md
git commit -m "docs(metrics): add the manual API test playbook for the monthly MRR series"
```

Verificar antes que `git status` **no** liste `database/seeders/_tmp_do_not_commit_qa_seeder.ts`.

---

## Task 6: Cierre y verificación del DoD

**Files:** ninguno nuevo. Es la compuerta antes del PR.

- [ ] **Step 1: Correr la suite unitaria completa**

Run: `node ace test unit`
Expected: PASS.

- [ ] **Step 2: Correr las cuatro specs del área de métricas**

Run: `node ace test functional --files=platform_mrr_series_metrics --files=platform_mrr_series_service --files=platform_mrr_metrics --files=platform_mrr_service`
Expected: PASS en las cuatro.

- [ ] **Step 3: Correr las specs de cobros, que comparten las tablas que la serie lee**

Run: `node ace test functional --files=billing_payment_detail --files=billing_payment_governed_amount --files=platform_receivables_metrics`
Expected: PASS. Ninguna debe cambiar: la serie es de solo lectura y no tocó sus fixtures.

- [ ] **Step 4: Verificar a mano las prohibiciones duras de la HU**

```bash
git diff multitenant... --name-only
rg -n "billing_subscription_transitions|discount_percent|DiscountPercent" app/services/platform_mrr_service.ts app/controllers/platform_mrr_controller.ts
rg -n "serialize\(\)|toJSON\(\)" app/services/platform_mrr_service.ts app/controllers/platform_mrr_controller.ts
rg -n "billing_payment_deleted_at|bp\.deleted_at" app/services/platform_mrr_service.ts
```

Expected:
- La lista de archivos tocados es exactamente: los cinco de producción del File Structure, los tres `.spec.ts` y el manual de QA. **Cero migraciones, cero modelos, cero archivos del landlord.**
- `database/seeders/_tmp_do_not_commit_qa_seeder.ts` **no aparece**: está en `.git/info/exclude` y no se versiona.
- Los tres `rg` restantes **no devuelven nada**.

- [ ] **Step 5: Recorrer el DoD del spec**

Confirmar una por una, con el número de prueba que la sostiene:

- Endpoint con el contrato completo bajo `[auth, platformAdmin]` → Task 4, pruebas 1 y 9.
- `mrrSeriesValidator` 1..24 default 12, 422 `PLT.MET.VAL_INPUT` → Task 1 completa + Task 4, prueba 7.
- Reparto por `periods_covered` con un cobro multi-periodo (CA-1) → Task 2, prueba 1; Task 3, prueba 1.
- Los tres motivos y su precedencia (CA-2, CA-3) → Task 2, grupo `resolveMonthReliability`.
- `pagosSinPeriodoExcluidos` (CA-4) → Task 2, prueba 7; Task 3, prueba 2.
- Serie vacía explícita (CA-5) → Task 2, prueba 8. **No es verificable vía HTTP** contra la base compartida; queda declarado en el PR.
- Filtros `..._deleted_at IS NULL` explícitos (CA-6) → Task 3, prueba 3.
- DTO plano a mano, sin identificadores internos → Task 3, prueba 6; Task 4, prueba 11.
- Swagger en español con la advertencia cobrado ≠ contratado → Task 4, paso 5.
- `billing_subscription_transitions` no se lee ni se escribe → paso 4 de esta tarea.
- Cero migraciones, cero modelos, cero landlord → paso 4 de esta tarea.
- TS estricto, cero `any` → `npm run typecheck` en cada tarea.
- Prueba manual entregada y ambiente sembrado → Task 5.

- [ ] **Step 6: Confirmar que el playbook de QA está listo para entregar**

El manual lo recorre una persona, no el agente. Confirmar que el seeder corrió sin error, que el servidor está arriba en `http://127.0.0.1:3333` y que el manual existe en `docs/superpowers/plans/2026-09-08-serie-mensual-mrr-desde-pagos-qa-api.md`. **No** automatizar el recorrido.

- [ ] **Step 7: Redactar las notas del PR para Wilvardo**

Tres puntos, cortos:
1. El `key` del 422 es `no-fue-posible-obtener-la-serie-mensual-de-mrr` y no `datos-invalidos`: convención del área ya cerrada en la orden 8. El `code` (`PLT.MET.VAL_INPUT`) y el `detail` van literales como pide CA-7.
2. `anterior-al-primer-pago` no se alcanza desde el endpoint porque la regla 8 recorta la ventana al mes del primer cobro. Está implementado y probado en unitarias; el contrato lo publica para que el landlord lo maneje.
3. CA-5 (serie vacía) se prueba en unitarias sobre el núcleo puro: la base de pruebas es compartida y ya trae cobros con periodo, así que no se puede provocar el caso vía HTTP. El manual de QA lo declara igual, en la sección de advertencias.

---

## Self-Review

**Cobertura del spec.** Los nueve criterios de aceptación y las diez reglas de negocio tienen tarea: CA-1 (Task 2 p.1, Task 3 p.1), CA-2 (Task 2 p.5), CA-3 (Task 2 p.6, Task 4 p.5), CA-4 (Task 2 p.7, Task 3 p.2), CA-5 (Task 2 p.8, con la limitación declarada), CA-6 (Task 3 p.3), CA-7 (Task 1 completa, Task 4 p.7), CA-8 (Task 4 p.9), CA-9 (Task 2 p.13, Task 4 p.2). Las cinco comprobaciones adicionales de "Verificación técnica" también: `periods_covered = 1` (Task 2 p.2, Task 3 p.4), `= 0` (Task 2 p.3), residuo declarado en el JSDoc (Task 2 p.5 del código), filtros a mano (Task 3, JSDoc de `seriesBaseQuery`), y la ausencia de `deleted_at` sobre pagos (mismo JSDoc + Task 5 p.4).

**QA.** La HU es API puro y no pinta nada, así que el playbook es de **API** (`manual-qa-api.mdc`) y no de frontend: cada escenario lleva su endpoint y su response exacto. Los nueve escenarios cubren CA-1 a CA-4 y CA-6 a CA-9; CA-5 se declara como no revisable a mano en vez de inventarle pasos. Los importes no van cableados —la base es compartida— sino resueltos con la consulta SQL que los calcula. El seeder es el mismo archivo no versionado que ya usan los demás paneles y siembra un usuario por variante, con y sin el marcador de plataforma. No se toca ningún interruptor global, así que el manual no lleva paso de limpieza.

**Placeholders.** Ninguna tarea deja código por escribir: los cuatro archivos de producción, los tres de prueba, el sembrado de QA y el manual completo van pegables.

**Consistencia de tipos.** `MrrPaymentPeriodRow` se define en Task 2 y se produce en Task 3 con los mismos tres campos y los mismos nombres (`subtotalCents`, `periodsCovered`, `periodStartMonth`). `PlatformMrrSeries` sale de `buildMrrSeries` (Task 2), lo devuelve `getMonthlySeries` (Task 3) y lo serializa el controlador (Task 4) sin transformarlo. `MRR_SERIES_METRIC_ERROR_TEXTS` se define en Task 1 y se consume en Task 4. `mrrSeriesValidator` produce `{ meses?: number }` y el controlador aplica `meses ?? 12`, coherente con que el validador lo marca `.optional()`.
