import { test } from '@japa/runner'
import { resolveTenantTrialWindow, resolveSingleTrialOutcome } from '#services/platform_trial_service'

/**
 * USRH1789079078169 — reglas puras del núcleo de resolución de la prueba.
 *
 * `resolveTenantTrialWindow` no toca base de datos: recibe la fila de
 * suscripción ya resuelta y el día civil de "hoy" por parámetro, así que
 * estas pruebas son deterministas. Lo que sí depende de la base — elegir la
 * suscripción correcta, el aislamiento por empresa, el 404 — se prueba en
 * `tests/functional/platform_trial_metrics.spec.ts`.
 */

function fila(overrides: Partial<Parameters<typeof resolveTenantTrialWindow>[0]> = {}) {
  return {
    subscriptionId: 1,
    businessUnitId: 1,
    status: 'trialing',
    contractedTrialDays: 7,
    subscribedAt: '2026-09-01',
    trialEndsAt: '2026-09-08',
    canceledAt: null,
    ...overrides,
  }
}

test.group('resolveTenantTrialWindow — RN-03/RN-04 (la ventana se lee, no se resta)', () => {
  test('la ventana sale de subscribed_at/trial_ends_at aunque contracted_trial_days no cuadre (cambio de plan)', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ subscribedAt: '2026-08-01', trialEndsAt: '2026-08-08', contractedTrialDays: 30 }),
      '2026-08-03'
    )

    assert.equal(prueba.inicio, '2026-08-01')
    assert.equal(prueba.fin, '2026-08-08')
    // La ventana real dura 7 días; diasContratados (30) es informativo y no cuadra (RN-04).
    assert.equal(prueba.diasContratados, 30)
    assert.notEqual(prueba.diasContratados, 7)
  })
})

test.group('resolveTenantTrialWindow — RN-06 (el día `fin` sigue vivo)', () => {
  test('estado viene del status, no de comparar fechas: trialing con fin = hoy sigue viva, 0 días restantes', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ status: 'trialing', trialEndsAt: '2026-09-08' }),
      '2026-09-08'
    )

    assert.equal(prueba.estado, 'viva')
    assert.equal(prueba.diasRestantes, 0)
  })

  test('trialing con fin = ayer (el reloj todavía no cerró) también sigue viva, 0 días restantes', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ status: 'trialing', trialEndsAt: '2026-09-07' }),
      '2026-09-08'
    )

    assert.equal(prueba.estado, 'viva')
    assert.equal(prueba.diasRestantes, 0)
  })

  test('cualquier status distinto de trialing es terminada, con 0 días restantes aunque fin no haya llegado', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ status: 'active', trialEndsAt: '2099-01-01' }),
      '2026-09-08'
    )

    assert.equal(prueba.estado, 'terminada')
    assert.equal(prueba.diasRestantes, 0)
  })
})

test.group('resolveTenantTrialWindow — RN-51/RN-52 (borde de medición)', () => {
  test('viva: finEfectivo = hoy (todavía no llega al fin)', ({ assert }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ status: 'trialing', subscribedAt: '2026-09-01', trialEndsAt: '2026-09-08' }),
      '2026-09-05'
    )

    assert.equal(prueba.finEfectivo, '2026-09-05')
    assert.equal(prueba.diasTranscurridos, 4)
    assert.equal(prueba.diasRestantes, 3)
  })

  test('terminada sin cancelar (RN-52): finEfectivo = fin, ventana completa sin recortar', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({ status: 'active', subscribedAt: '2026-01-01', trialEndsAt: '2026-01-08' }),
      '2026-05-01'
    )

    assert.equal(prueba.finEfectivo, '2026-01-08')
    assert.equal(prueba.diasTranscurridos, 7)
  })

  test('terminada por cancelación a mitad de la ventana (RN-51): finEfectivo se corta el día de la baja, la ventana contratada no se toca', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({
        status: 'canceled',
        subscribedAt: '2026-02-01',
        trialEndsAt: '2026-03-03', // 30 días contratados
        canceledAt: '2026-02-11', // canceló el día 10
      }),
      '2026-02-25'
    )

    assert.equal(prueba.inicio, '2026-02-01')
    assert.equal(prueba.fin, '2026-03-03') // ventana contratada intacta
    assert.equal(prueba.finEfectivo, '2026-02-11') // ni hoy ni el fin: el día de la baja
    assert.equal(prueba.diasTranscurridos, 10)
    assert.equal(prueba.diasRestantes, 0)
  })

  test('cancelación posterior al fin de la prueba no acorta nada: finEfectivo sigue siendo el fin', ({
    assert,
  }) => {
    const prueba = resolveTenantTrialWindow(
      fila({
        status: 'canceled',
        subscribedAt: '2026-01-01',
        trialEndsAt: '2026-01-08',
        canceledAt: '2026-02-15', // muy después del fin
      }),
      '2026-02-20'
    )

    assert.equal(prueba.finEfectivo, '2026-01-08')
  })
})

test.group('resolveTenantTrialWindow — RN-07/RN-08 (el hueco de USRH1789079078169)', () => {
  test('resultado y fechaResultado siempre viajan en null antes de resolveOutcomes', ({
    assert,
  }) => {
    const viva = resolveTenantTrialWindow(fila({ status: 'trialing' }), '2026-09-03')
    const terminada = resolveTenantTrialWindow(fila({ status: 'active' }), '2026-09-10')

    assert.isNull(viva.resultado)
    assert.isNull(viva.fechaResultado)
    assert.isNull(terminada.resultado)
    assert.isNull(terminada.fechaResultado)
  })
})

// ─── USRH1789101459905 — reglas puras del desenlace ───────────────────────────

test.group('resolveSingleTrialOutcome — CA-2 (frontera civil de paid_at, A15/H1)', () => {
  test('un pago a las 19:00 hora de México el día del fin sigue siendo "convirtio", no "convirtio-despues-de-vencer"', ({
    assert,
  }) => {
    // 2026-08-08 19:00 México (UTC-6) = 2026-08-09T01:00Z en la columna.
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-08',
      paidAt: new Date('2026-08-09T01:00:00Z'),
      canceledAt: null,
      transitionCutDate: null,
    })

    assert.equal(outcome.resultado, 'convirtio')
    assert.equal(outcome.fechaResultado, '2026-08-08')
    // El defecto que este criterio detiene: leído con `toCalendarIsoDate`
    // (que ancla el Date crudo a UTC) el día saldría 2026-08-09 y el
    // resultado se volvería "convirtio-despues-de-vencer".
    assert.notEqual(outcome.fechaResultado, '2026-08-09')
  })

  test('un pago después del fin es "convirtio-despues-de-vencer"', ({ assert }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-08',
      paidAt: new Date('2026-08-10T12:00:00Z'),
      canceledAt: null,
      transitionCutDate: null,
    })

    assert.equal(outcome.resultado, 'convirtio-despues-de-vencer')
    assert.equal(outcome.fechaResultado, '2026-08-10')
  })
})

test.group('resolveSingleTrialOutcome — CA-3 (no-terminalidad, el punto contraintuitivo)', () => {
  test('la misma suscripción responde vencio-sin-pago sin pago y convirtio-despues-de-vencer en cuanto exista uno, sin que nada más cambie', ({
    assert,
  }) => {
    const finComun = '2026-08-08'

    const antesDelPago = resolveSingleTrialOutcome({
      fin: finComun,
      paidAt: undefined,
      canceledAt: null,
      transitionCutDate: '2026-08-08',
    })
    assert.equal(antesDelPago.resultado, 'vencio-sin-pago')

    const despuesDelPago = resolveSingleTrialOutcome({
      fin: finComun,
      paidAt: new Date('2026-11-03T12:00:00Z'),
      canceledAt: null,
      transitionCutDate: '2026-08-08',
    })
    assert.equal(despuesDelPago.resultado, 'convirtio-despues-de-vencer')
    assert.equal(despuesDelPago.fechaResultado, '2026-11-03')
  })
})

test.group('resolveSingleTrialOutcome — CA-4 (canceló y su frontera; precedencia pago > cancelación)', () => {
  test('sin pago y cancelación dentro de la ventana: cancelo con la fecha civil de la cancelación', ({
    assert,
  }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-31',
      paidAt: undefined,
      canceledAt: '2026-08-10',
      transitionCutDate: null,
    })

    assert.equal(outcome.resultado, 'cancelo')
    assert.equal(outcome.fechaResultado, '2026-08-10')
  })

  test('cancelación posterior al fin no cambia el resultado: no aparece como cancelo', ({
    assert,
  }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-31',
      paidAt: undefined,
      canceledAt: '2026-09-15',
      transitionCutDate: null,
    })

    assert.notEqual(outcome.resultado, 'cancelo')
    assert.equal(outcome.resultado, 'vencio-sin-pago')
  })

  test('el pago gana siempre sobre la cancelación, aunque ambos existan', ({ assert }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-31',
      paidAt: new Date('2026-08-20T12:00:00Z'),
      canceledAt: '2026-08-10',
      transitionCutDate: null,
    })

    assert.equal(outcome.resultado, 'convirtio')
  })
})

test.group('resolveSingleTrialOutcome — CA-5 (fecha de "venció sin pago")', () => {
  test('sin pago y sin cancelación en ventana: fechaResultado es el cut_date de la transición, no el fin', ({
    assert,
  }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-08',
      paidAt: undefined,
      canceledAt: null,
      transitionCutDate: '2026-08-09', // el reloj corrió un día después del fin
    })

    assert.equal(outcome.resultado, 'vencio-sin-pago')
    assert.equal(outcome.fechaResultado, '2026-08-09')
    assert.notEqual(outcome.fechaResultado, '2026-08-08')
  })

  test('sin transición registrada (prueba anterior a la bitácora): fechaResultado cae al fin', ({
    assert,
  }) => {
    const outcome = resolveSingleTrialOutcome({
      fin: '2026-08-08',
      paidAt: undefined,
      canceledAt: null,
      transitionCutDate: null,
    })

    assert.equal(outcome.resultado, 'vencio-sin-pago')
    assert.equal(outcome.fechaResultado, '2026-08-08')
  })
})
