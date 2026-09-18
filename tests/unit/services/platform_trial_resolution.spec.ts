import { test } from '@japa/runner'
import { resolveTenantTrialWindow } from '#services/platform_trial_service'

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

test.group('resolveTenantTrialWindow — RN-07/RN-08 (el hueco de USRH1789101459905)', () => {
  test('resultado y fechaResultado siempre viajan en null en esta rebanada', ({ assert }) => {
    const viva = resolveTenantTrialWindow(fila({ status: 'trialing' }), '2026-09-03')
    const terminada = resolveTenantTrialWindow(fila({ status: 'active' }), '2026-09-10')

    assert.isNull(viva.resultado)
    assert.isNull(viva.fechaResultado)
    assert.isNull(terminada.resultado)
    assert.isNull(terminada.fechaResultado)
  })
})
