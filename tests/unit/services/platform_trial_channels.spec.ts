import { test } from '@japa/runner'
import { toCanales, resolveVentanaUtcBounds } from '#services/platform_trial_usage_service'
import { ASSIST_ORIGIN } from '#constants/assist_origin'

/**
 * USRH1789079078172 — reglas puras del desglose por canal.
 *
 * `toCanales` (traducción del `GROUP BY assist_origin`) y
 * `resolveVentanaUtcBounds` (borde DST-aware de la ventana en día civil) se
 * prueban aquí sin BD. El aislamiento entre tenants, la siembra real con
 * checadas y el transporte HTTP van en el spec funcional
 * (`platform_trial_usage_metrics.spec.ts`), igual que 078171 (R-3 del spec).
 */

test.group('toCanales (pura) — vocabulario cerrado de seis canales (RN-1, RN-2, RN-4)', () => {
  test('sin filas → los seis canales en 0 y total 0, no `undefined` (RN-2)', ({ assert }) => {
    const canales = toCanales([])
    assert.deepEqual(canales, {
      autoservicio: 0,
      capturaAdministrador: 0,
      sincronizacion: 0,
      manualLegado: 0,
      dispositivo: 0,
      checadorAdms: 0,
      total: 0,
    })
  })

  test('traduce cada uno de los seis orígenes al campo correcto (RN-1)', ({ assert }) => {
    const canales = toCanales([
      { origin: ASSIST_ORIGIN.SELF_SERVICE, cantidad: 5 },
      { origin: ASSIST_ORIGIN.ADMIN_CAPTURE, cantidad: 3 },
      { origin: ASSIST_ORIGIN.SYNC, cantidad: 2 },
      { origin: ASSIST_ORIGIN.MANUAL, cantidad: 1 },
      { origin: ASSIST_ORIGIN.DEVICE, cantidad: 0 },
      { origin: ASSIST_ORIGIN.ADMS, cantidad: 4 },
    ])
    assert.equal(canales.autoservicio, 5)
    assert.equal(canales.capturaAdministrador, 3)
    assert.equal(canales.sincronizacion, 2)
    assert.equal(canales.manualLegado, 1)
    assert.equal(canales.dispositivo, 0)
    assert.equal(canales.checadorAdms, 4)
  })

  test('total = suma exacta de los seis (RN-4)', ({ assert }) => {
    const canales = toCanales([
      { origin: ASSIST_ORIGIN.SELF_SERVICE, cantidad: 5 },
      { origin: ASSIST_ORIGIN.ADMIN_CAPTURE, cantidad: 30 },
    ])
    assert.equal(canales.total, 35)
  })

  test('el caso que da valor al ticket: todo por captura del administrador, los otros cinco en 0', ({
    assert,
  }) => {
    const canales = toCanales([{ origin: ASSIST_ORIGIN.ADMIN_CAPTURE, cantidad: 42 }])
    assert.equal(canales.capturaAdministrador, 42)
    assert.equal(canales.total, 42)
    assert.equal(canales.autoservicio, 0)
    assert.equal(canales.sincronizacion, 0)
    assert.equal(canales.manualLegado, 0)
    assert.equal(canales.dispositivo, 0)
    assert.equal(canales.checadorAdms, 0)
  })

  test('un origen fuera del vocabulario cerrado se ignora, sin sumar al total y sin lanzar', ({
    assert,
  }) => {
    const canales = toCanales([
      { origin: ASSIST_ORIGIN.SELF_SERVICE, cantidad: 5 },
      { origin: 'algo-inesperado', cantidad: 999 },
    ])
    assert.equal(canales.autoservicio, 5)
    assert.equal(canales.total, 5)
  })

  test('`cantidad` string (driver MySQL vía COUNT) se normaliza a número', ({ assert }) => {
    const canales = toCanales([{ origin: ASSIST_ORIGIN.SYNC, cantidad: '7' }])
    assert.equal(canales.sincronizacion, 7)
    assert.equal(canales.total, 7)
    assert.typeOf(canales.total, 'number')
  })
})

test.group('resolveVentanaUtcBounds (pura) — borde de la ventana en día civil de México (RN-5)', () => {
  // Post-`multitenant`: `assist_punch_time_utc` es un instante UTC real: el
  // borde se resuelve con conversión de zona IANA lisa (`America/Mexico_City`),
  // nunca con un offset calculado a mano (`attendance_clock.ts:11-18`). La
  // propia tzdata de IANA ya modela el DST histórico de México (vigente hasta
  // 2022) para fechas anteriores — no hay que replicarlo aquí.
  test('ventana en 2026 (sin horario de verano, abolido desde 2022): offset fijo -6', ({
    assert,
  }) => {
    const { startUtc, endUtc } = resolveVentanaUtcBounds('2026-01-10', '2026-01-12')
    assert.equal(startUtc, '2026-01-10 06:00:00')
    assert.equal(endUtc, '2026-01-13 05:59:59')
  })

  test('ventana histórica de verano (2020, con DST vigente): IANA aplica -5', ({ assert }) => {
    const { startUtc, endUtc } = resolveVentanaUtcBounds('2020-06-01', '2020-06-03')
    assert.equal(startUtc, '2020-06-01 05:00:00')
    assert.equal(endUtc, '2020-06-04 04:59:59')
  })

  test('ventana histórica de invierno (2020, sin DST): IANA aplica -6', ({ assert }) => {
    const { startUtc, endUtc } = resolveVentanaUtcBounds('2020-01-10', '2020-01-12')
    assert.equal(startUtc, '2020-01-10 06:00:00')
    assert.equal(endUtc, '2020-01-13 05:59:59')
  })

  test('la ventana entra completa incluso si cruza el borde histórico de DST (inicio invierno, fin verano)', ({
    assert,
  }) => {
    // Primer domingo de abril 2020 = 2020-04-05 (DST empieza ese día en la
    // tzdata de IANA para América/Ciudad de México, vigente en 2020).
    const { startUtc, endUtc } = resolveVentanaUtcBounds('2020-04-04', '2020-04-06')
    assert.equal(startUtc, '2020-04-04 06:00:00')
    assert.equal(endUtc, '2020-04-07 04:59:59')
  })
})
