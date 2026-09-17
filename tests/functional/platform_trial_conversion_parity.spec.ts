import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BillingPayment from '#models/billing_payment'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import PlatformTrialService from '#services/platform_trial_service'
import PlatformSubscriptionFlowService from '#services/platform_subscription_flow_service'
import { createTenantTrialFixture, type TenantTrialFixtureTenant } from './helpers/platform_trial_fixture.js'

/**
 * USRH1789101459905 — paridad de cifra entre la ficha (`PlatformTrialService`)
 * y la tarjeta de Movimiento (`PlatformSubscriptionFlowService`), desde cero:
 * hoy no existe ninguna prueba de la rebanada del churn
 * (`grep -rl "flowsBaseQuery\|getSubscriptionFlows\|PlatformSubscriptionFlow" tests/`
 * daba vacío antes de esta HU).
 *
 * Mes fijo `M = '2026-06'`, bien en el pasado: nunca es "parcial" y las
 * fechas son deterministas sin depender del día en que corra la suite.
 *
 * CA-7 se corre contra el SQL ya extraído (código vivo, sin pruebas previas):
 * el delta de `conversiones` entre antes y después de sembrar debe ser
 * exactamente el número de suscripciones que convierten en M — así se
 * verifica que la extracción de USRH1789101459905 no movió la cifra mensual.
 */

const MES = '2026-06'

/** Instante UTC exacto dentro de `MES` para un día y hora civil de México dados. */
function pagoEnMes(dia: number, horaMexico: number): Date {
  // America/Mexico_City es UTC-6 en junio (sin horario de verano desde 2022).
  return DateTime.fromISO(`${MES}-${String(dia).padStart(2, '0')}`, { zone: 'America/Mexico_City' })
    .set({ hour: horaMexico })
    .toUTC()
    .toJSDate()
}

/** `subscribed_at` exacto al mediodía civil de México de un día de `MES` (evita el corrimiento de mes cerca de la medianoche UTC). */
function subscribedAtEnMes(dia: number): string {
  return `${MES}-${String(dia).padStart(2, '0')} 12:00:00`
}

async function crearPago(subscriptionId: number, paidAt: Date): Promise<void> {
  await BillingPayment.create({
    billingSubscriptionId: subscriptionId,
    billingPaymentAmountCents: 65000,
    billingPaymentPeriodAmountCents: 65000,
    billingPaymentPeriodsCovered: 1,
    billingPaymentCreditAppliedCents: 0,
    billingPaymentCreditBalanceAfterCents: 0,
    billingPaymentDebtAppliedCents: 0,
    billingPaymentIsCustomAmount: false,
    billingPaymentGrossCents: 65000,
    billingPaymentDiscountAmountCents: 0,
    billingPaymentSubtotalCents: 65000,
    billingPaymentTaxAmountCents: 0,
    billingPaymentTotalCents: 65000,
    billingPaymentDiscountPercent: 0,
    billingPaymentTaxRate: 0,
    billingPaymentMethod: 'transfer',
    billingPaymentReference: `PARITY-${Date.now()}-${Math.random()}`,
    billingPaymentReceiptPath: null,
    billingPaymentReceiptMime: null,
    billingPaymentProvider: 'manual',
    billingPaymentPaidAt: DateTime.fromJSDate(paidAt, { zone: 'utc' }),
    billingPaymentPeriodStart: null,
    billingPaymentPeriodEnd: null,
  })
}

async function crearTransicion(
  subscriptionId: number,
  reason: 'trial_expired_uncovered' | 'trial_expired_covered',
  cutDate: string
): Promise<void> {
  await BillingSubscriptionTransition.create({
    billingSubscriptionId: subscriptionId,
    billingSubscriptionTransitionFrom: 'trialing',
    billingSubscriptionTransitionTo: reason === 'trial_expired_covered' ? 'active' : 'past_due',
    billingSubscriptionTransitionReason: reason,
    billingSubscriptionTransitionCutDate: DateTime.fromISO(cutDate),
  })
}

/** Borra pagos y transiciones antes de que `fixture.cleanup()` borre la suscripción (FK RESTRICT). */
async function limpiarChurnDeLote(tenants: TenantTrialFixtureTenant[]): Promise<void> {
  for (const tenant of tenants) {
    if (!tenant.billingSubscriptionId) continue
    await BillingPayment.query().where('billing_subscription_id', tenant.billingSubscriptionId).delete()
    await BillingSubscriptionTransition.query()
      .where('billing_subscription_id', tenant.billingSubscriptionId)
      .delete()
  }
}

// ─── CA-6 / CA-7 — paridad de cifra y "la extracción no mueve el mes" ─────────

test.group('Paridad de cifra — USRH1789101459905', () => {
  test('CA-6/CA-7: cada conversión por primer pago que cuenta la tarjeta responde el mismo resultado en la ficha, y el delta del mes es exacto', async ({
    assert,
  }) => {
    const flowService = new PlatformSubscriptionFlowService()
    const trialService = new PlatformTrialService()

    const before = await flowService.getSubscriptionFlows(MES)

    const { tenants, cleanup } = await createTenantTrialFixture([
      // Convirtió a tiempo: pago dentro de la ventana, en junio. Un pago real
      // deja el reloj en 'active' (billing_payment_service.ts:502): se
      // simula igual, porque el desenlace depende de `estado` (status), no
      // de comparar fechas (RN-06).
      {
        tag: 'parity-convirtio',
        trialDays: 7,
        subscribedAtOverride: subscribedAtEnMes(1),
        trialEndsAtOverride: `${MES}-08`,
        status: 'active',
      },
      // Convirtió después de vencer: pago en junio, pero después del fin.
      {
        tag: 'parity-convirtio-tarde',
        trialDays: 7,
        subscribedAtOverride: subscribedAtEnMes(1),
        trialEndsAtOverride: `${MES}-08`,
        status: 'active',
      },
      // Venció sin pago: el reloj la cerró en past_due, nunca pagó.
      {
        tag: 'parity-vencio',
        trialDays: 7,
        subscribedAtOverride: subscribedAtEnMes(1),
        trialEndsAtOverride: `${MES}-08`,
        status: 'past_due',
      },
      // Canceló dentro de la ventana, sin pago.
      {
        tag: 'parity-cancelo',
        trialDays: 29,
        subscribedAtOverride: subscribedAtEnMes(1),
        trialEndsAtOverride: `${MES}-30`,
        status: 'canceled',
        canceledAt: `${MES}-10`,
      },
      // Alta sin prueba con pago en el mes: NO debe mover conversiones (§7.3/CA-7).
      {
        tag: 'parity-alta-sin-prueba',
        trialDays: 0,
        skipTrial: true,
        subscribedAtOverride: subscribedAtEnMes(1),
        status: 'active',
      },
    ])

    const [convirtio, convirtioTarde, vencio, cancelo, altaSinPrueba] = tenants

    try {
      await crearPago(convirtio.billingSubscriptionId!, pagoEnMes(5, 15)) // dentro de la ventana
      await crearPago(convirtioTarde.billingSubscriptionId!, pagoEnMes(20, 15)) // después del fin, mismo mes
      await crearTransicion(vencio.billingSubscriptionId!, 'trial_expired_uncovered', `${MES}-09`)
      await crearPago(altaSinPrueba.billingSubscriptionId!, pagoEnMes(15, 12)) // pago, pero sin prueba

      const after = await flowService.getSubscriptionFlows(MES)

      // CA-7: el delta de conversiones es exactamente las dos que sí convierten
      // (convirtio + convirtioTarde). La de sin-prueba con pago NO mueve el
      // delta (§7.3): el filtro `trial_ends_at IS NOT NULL` sigue vivo en el
      // camino mensual.
      assert.equal(after.actual.conversiones - before.actual.conversiones, 2)
      // Las 5 suscripciones sembradas se ven en el delta de altas del mes.
      assert.equal(after.actual.altas - before.actual.altas, 5)
      assert.equal(after.actual.cancelaciones - before.actual.cancelaciones, 1)
      assert.equal(after.actual.morosidad - before.actual.morosidad, 1)

      // CA-6: la ficha de cada una de las que SÍ convirtieron trae un
      // resultado de conversión con fechaResultado dentro de junio; la que
      // venció sin pago nunca aparece como conversión.
      const idsBu = tenants.map((t) => t.businessUnitId)
      const lote = await trialService.resolveTrialsForBusinessUnits(idsBu)

      const pruebaConvirtio = lote.get(convirtio.businessUnitId)!
      assert.equal(pruebaConvirtio.resultado, 'convirtio')
      assert.isTrue(pruebaConvirtio.fechaResultado!.startsWith(MES))

      const pruebaConvirtioTarde = lote.get(convirtioTarde.businessUnitId)!
      assert.equal(pruebaConvirtioTarde.resultado, 'convirtio-despues-de-vencer')
      assert.isTrue(pruebaConvirtioTarde.fechaResultado!.startsWith(MES))

      const pruebaVencio = lote.get(vencio.businessUnitId)!
      assert.equal(pruebaVencio.resultado, 'vencio-sin-pago')
      assert.notEqual(pruebaVencio.resultado, 'convirtio')
      assert.notEqual(pruebaVencio.resultado, 'convirtio-despues-de-vencer')

      const pruebaCancelo = lote.get(cancelo.businessUnitId)!
      assert.equal(pruebaCancelo.resultado, 'cancelo')

      // La de sin-prueba no tiene entrada en el lote de la ficha: nunca tuvo
      // `trial_ends_at`, así que `USRH1789079078169` ni siquiera la elige.
      assert.isFalse(lote.has(altaSinPrueba.businessUnitId))
    } finally {
      await limpiarChurnDeLote(tenants)
      await cleanup()
    }
  })
})

// ─── CA-9 — aislamiento (RN-49): la subconsulta correlacionada no se pierde ───

test.group('Aislamiento del churn por suscripción — USRH1789101459905 CA-9', () => {
  test('el primer pago de cada suscripción es el suyo, aunque otra suscripción tenga un pago anterior', async ({
    assert,
  }) => {
    const flowService = new PlatformSubscriptionFlowService()

    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca9-primero', trialDays: 7, subscribedAtOverride: subscribedAtEnMes(1), trialEndsAtOverride: `${MES}-08` },
      { tag: 'ca9-segundo', trialDays: 7, subscribedAtOverride: subscribedAtEnMes(1), trialEndsAtOverride: `${MES}-08` },
    ])
    const [primero, segundo] = tenants

    try {
      // `primero` tiene DOS pagos: uno muy temprano y otro tardío.
      await crearPago(primero.billingSubscriptionId!, pagoEnMes(1, 10))
      await crearPago(primero.billingSubscriptionId!, pagoEnMes(15, 10))
      // `segundo` tiene un solo pago, entre los dos de `primero`.
      await crearPago(segundo.billingSubscriptionId!, pagoEnMes(3, 10))

      const resultado = await flowService.getFirstPaymentBySubscription([
        String(primero.billingSubscriptionId),
        String(segundo.billingSubscriptionId),
      ])

      const primerPagoDePrimero = resultado.get(String(primero.billingSubscriptionId))!
      const primerPagoDeSegundo = resultado.get(String(segundo.billingSubscriptionId))!

      // Si se perdiera la correlación `bp2.billing_subscription_id =
      // bp.billing_subscription_id`, `segundo` heredaría el pago del día 1
      // de `primero` (el mínimo global) en vez del suyo del día 3.
      assert.equal(
        DateTime.fromJSDate(primerPagoDePrimero, { zone: 'utc' }).toISODate(),
        `${MES}-01`
      )
      assert.equal(
        DateTime.fromJSDate(primerPagoDeSegundo, { zone: 'utc' }).toISODate(),
        `${MES}-03`
      )
      assert.notEqual(
        DateTime.fromJSDate(primerPagoDeSegundo, { zone: 'utc' }).toISODate(),
        DateTime.fromJSDate(primerPagoDePrimero, { zone: 'utc' }).toISODate()
      )
    } finally {
      await limpiarChurnDeLote(tenants)
      await cleanup()
    }
  })
})

// ─── CA-8 — fallo no controlado responde 500, nunca 200 con resultado: null ───

test.group('Falla al resolver el desenlace — USRH1789101459905 CA-8', () => {
  test('un lector que revienta propaga el error: nunca se atrapa dentro de resolveOutcomes', async ({
    assert,
  }) => {
    const { tenants, cleanup } = await createTenantTrialFixture([
      { tag: 'ca8-falla', trialDays: 7, status: 'active' },
    ])

    try {
      const trialService = new PlatformTrialService()
      // Rompe el lector de pagos del servicio de flujos que consume
      // `resolveOutcomes` por dentro, para probar que el fallo sube sin
      // que nadie lo convierta en un `200` con `resultado: null`.
      const flowServiceAny = (trialService as unknown as { flowService: PlatformSubscriptionFlowService })
        .flowService
      flowServiceAny.getFirstPaymentBySubscription = async () => {
        throw new Error('fallo inyectado — lectura de pagos reventada')
      }

      await assert.rejects(() => trialService.getTenantTrial(tenants[0].businessUnitPublicId))
    } finally {
      await cleanup()
    }
  })
})
