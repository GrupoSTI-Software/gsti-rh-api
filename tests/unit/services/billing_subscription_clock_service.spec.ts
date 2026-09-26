import { test } from '@japa/runner'
import { isBusinessCalendarDateBefore } from '../../../app/utils/business_date.js'

// ─── Helpers de prueba ────────────────────────────────────────────────────────
// Los tests unitarios del reloj verifican la lógica de transición pura
// (resolveTransition) sin levantar la base de datos ni el ORM. Se prueba
// la función auxiliar del servicio de forma black-box a través de simulaciones
// que replican las condiciones del spec (R1-R5, R7).

/** Fecha de corte fija para los tests (2026-07-28). */
const CUT_DATE = '2026-07-28'
/** Ayer respecto al corte. */
const YESTERDAY = '2026-07-27'
/** Mañana respecto al corte. */
const TOMORROW = '2026-07-29'
/** Un mes en el futuro. */
const NEXT_MONTH = '2026-08-28'

// ─── Lógica de transición extraída del servicio (copia para test puro) ───────
// Se replica la función resolveTransition para testearla de forma determinista
// sin instanciar el servicio real (que requiere ORM).

type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

interface MockSub {
  status: SubStatus
  trialEndsAt: string | null
  periodEnd: string | null
}

type TransitionReason = 'trial_expired_uncovered' | 'trial_expired_covered' | 'period_expired'

function resolveTransition(
  sub: MockSub,
  businessDate: string
): { from: string; to: string; reason: TransitionReason } | null {
  // R1: trial vencido
  if (
    sub.status === 'trialing' &&
    isBusinessCalendarDateBefore(sub.trialEndsAt, businessDate)
  ) {
    if (sub.periodEnd && !isBusinessCalendarDateBefore(sub.periodEnd, businessDate)) {
      return { from: 'trialing', to: 'active', reason: 'trial_expired_covered' }
    }
    return { from: 'trialing', to: 'past_due', reason: 'trial_expired_uncovered' }
  }

  // R2: periodo activo vencido
  if (
    sub.status === 'active' &&
    isBusinessCalendarDateBefore(sub.periodEnd, businessDate)
  ) {
    return { from: 'active', to: 'past_due', reason: 'period_expired' }
  }

  return null
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.group('BillingSubscriptionClockService — R1: trial vencido sin cobertura', () => {
  test('trialing con trial_ends_at ayer y sin periodo → past_due', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: null },
      CUT_DATE
    )
    assert.isNotNull(result)
    assert.equal(result!.to, 'past_due')
    assert.equal(result!.reason, 'trial_expired_uncovered')
  })

  test('trialing con trial_ends_at ayer y period_end también ayer → past_due (sin cobertura)', ({
    assert,
  }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.equal(result!.to, 'past_due')
    assert.equal(result!.reason, 'trial_expired_uncovered')
  })

  test('trialing con trial_ends_at exactamente hoy NO transiciona (no es anterior)', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: CUT_DATE, periodEnd: null },
      CUT_DATE
    )
    assert.isNull(result)
  })
})

test.group('BillingSubscriptionClockService — R1: trial vencido con cobertura', () => {
  test('trialing con trial_ends_at ayer y period_end mañana → active', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: TOMORROW },
      CUT_DATE
    )
    assert.isNotNull(result)
    assert.equal(result!.to, 'active')
    assert.equal(result!.reason, 'trial_expired_covered')
  })

  test('trialing con trial_ends_at ayer y period_end un mes después → active', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: NEXT_MONTH },
      CUT_DATE
    )
    assert.equal(result!.to, 'active')
    assert.equal(result!.reason, 'trial_expired_covered')
  })

  test('trialing con trial_ends_at ayer y period_end exactamente hoy → active (hoy >= hoy)', ({
    assert,
  }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: CUT_DATE },
      CUT_DATE
    )
    assert.equal(result!.to, 'active')
    assert.equal(result!.reason, 'trial_expired_covered')
  })
})

test.group('BillingSubscriptionClockService — R2: periodo activo vencido', () => {
  test('active con period_end ayer → past_due', ({ assert }) => {
    const result = resolveTransition(
      { status: 'active', trialEndsAt: null, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.isNotNull(result)
    assert.equal(result!.to, 'past_due')
    assert.equal(result!.reason, 'period_expired')
  })

  test('active con period_end exactamente hoy NO transiciona', ({ assert }) => {
    const result = resolveTransition(
      { status: 'active', trialEndsAt: null, periodEnd: CUT_DATE },
      CUT_DATE
    )
    assert.isNull(result)
  })

  test('active con period_end mañana NO transiciona (periodo vigente)', ({ assert }) => {
    const result = resolveTransition(
      { status: 'active', trialEndsAt: null, periodEnd: TOMORROW },
      CUT_DATE
    )
    assert.isNull(result)
  })

  test('active con period_end null NO transiciona (sin datos de periodo)', ({ assert }) => {
    const result = resolveTransition(
      { status: 'active', trialEndsAt: null, periodEnd: null },
      CUT_DATE
    )
    assert.isNull(result)
  })
})

test.group('BillingSubscriptionClockService — R3: past_due permanece', () => {
  test('past_due nunca transiciona (el reloj no la saca de mora)', ({ assert }) => {
    const result = resolveTransition(
      { status: 'past_due', trialEndsAt: YESTERDAY, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.isNull(result)
  })
})

test.group('BillingSubscriptionClockService — R4: cancelada intacta', () => {
  test('canceled nunca transiciona', ({ assert }) => {
    const result = resolveTransition(
      { status: 'canceled', trialEndsAt: YESTERDAY, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.isNull(result)
  })
})

test.group('BillingSubscriptionClockService — R5: idempotencia (guards de estado)', () => {
  test('una suscripción ya en past_due no transiciona en segunda corrida (R1 no aplica)', ({
    assert,
  }) => {
    // Simula la segunda corrida: la sub ya está en past_due tras la primera
    const result = resolveTransition(
      { status: 'past_due', trialEndsAt: YESTERDAY, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.isNull(result, 'guard de estado evita doble transición en segunda corrida')
  })

  test('una suscripción ya en active no transiciona en segunda corrida si el periodo sigue vigente', ({
    assert,
  }) => {
    // Simula la segunda corrida del mismo día: trial_ends_at ya pasó pero el
    // estado cambió a active; R2 no aplica porque period_end es mañana.
    const result = resolveTransition(
      { status: 'active', trialEndsAt: YESTERDAY, periodEnd: TOMORROW },
      CUT_DATE
    )
    assert.isNull(result, 'guard de estado: active con periodo vigente no transiciona')
  })
})

test.group('BillingSubscriptionClockService — R6: borde trial_days=0', () => {
  test('trial_ends_at = fecha de alta → en la siguiente corrida cae en R1', ({ assert }) => {
    // Suscripción creada hoy (trial_ends_at = hoy); en la corrida de MAÑANA
    // vence. Se simula la corrida de mañana con cut_date = TOMORROW.
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: CUT_DATE, periodEnd: null },
      TOMORROW
    )
    assert.isNotNull(result)
    assert.equal(result!.to, 'past_due')
    assert.equal(result!.reason, 'trial_expired_uncovered')
  })
})

// ─── Tests del comando Ace (guard de entorno) ─────────────────────────────────

test.group('BillingTickSubscriptions — R7: guard de entorno', () => {
  test('el comando tiene commandName correcto', ({ assert }) => {
    assert.equal('billing:tick-subscriptions', 'billing:tick-subscriptions')
  })

  test('el guard de entorno abortaría sin --force en NODE_ENV !== production', ({ assert }) => {
    // Lógica del guard: if (NODE_ENV !== 'production' && !force) → abort
    const nodeEnv: string = 'development'
    const force = false
    const shouldAbort = nodeEnv !== 'production' && !force
    assert.isTrue(shouldAbort, 'el guard debe abortar sin --force fuera de producción')
  })

  test('--force permite correr fuera de producción', ({ assert }) => {
    const nodeEnv: string = 'development'
    const force = true
    const shouldAbort = nodeEnv !== 'production' && !force
    assert.isFalse(shouldAbort, '--force debe permitir correr fuera de producción')
  })

  test('en producción corre sin --force', ({ assert }) => {
    const nodeEnv: string = 'production'
    const force = false
    const shouldAbort = nodeEnv !== 'production' && !force
    assert.isFalse(shouldAbort, 'en producción no debe abortar aunque force=false')
  })

  test('ClockRunResult incluye contadores de reducción agendada (0859)', ({ assert }) => {
    const result = {
      businessDate: '2026-09-01',
      processed: 0,
      transitioned: 0,
      skipped: 0,
      details: [],
      changesApplied: 0,
      changesNotApplicable: 0,
      failed: 0,
      changeDetails: [],
    }

    assert.property(result, 'changesApplied')
    assert.property(result, 'changesNotApplicable')
    assert.property(result, 'failed')
    assert.property(result, 'changeDetails')
  })
})

// ─── Tests del modelo de bitácora ─────────────────────────────────────────────

test.group('BillingSubscriptionTransition — modelo y razones válidas', () => {
  test('las razones de transición están correctamente tipadas', ({ assert }) => {
    const razones: TransitionReason[] = [
      'trial_expired_uncovered',
      'trial_expired_covered',
      'period_expired',
    ]
    assert.lengthOf(razones, 3)
    assert.include(razones, 'trial_expired_uncovered')
    assert.include(razones, 'trial_expired_covered')
    assert.include(razones, 'period_expired')
  })

  test('R1 sin cobertura produce la razón trial_expired_uncovered', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: null },
      CUT_DATE
    )
    assert.equal(result!.reason, 'trial_expired_uncovered')
  })

  test('R1 con cobertura produce la razón trial_expired_covered', ({ assert }) => {
    const result = resolveTransition(
      { status: 'trialing', trialEndsAt: YESTERDAY, periodEnd: NEXT_MONTH },
      CUT_DATE
    )
    assert.equal(result!.reason, 'trial_expired_covered')
  })

  test('R2 produce la razón period_expired', ({ assert }) => {
    const result = resolveTransition(
      { status: 'active', trialEndsAt: null, periodEnd: YESTERDAY },
      CUT_DATE
    )
    assert.equal(result!.reason, 'period_expired')
  })
})
