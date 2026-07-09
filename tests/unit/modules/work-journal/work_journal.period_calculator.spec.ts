import { test } from '@japa/runner'
import {
  resolveExpiredPayrollPeriod,
  type PayrollPeriodConfig,
} from '#modules/work-journal/work_journal.period_calculator'

/**
 * Tests unitarios del calculador de periodo de nómina (USRH1782268640950 §11).
 *
 * Es lógica pura (sin BD): cubre los 4 `payment_type` y sus aristas (fin de
 * mes, meses de 31 días, anclaje en `apply_since`, primer ciclo).
 * Implementa únicamente el criterio "último día trabajado del ciclo"
 * (Opción A, decidida con Wilvardo); no aplica ajustes de fecha de pago.
 */

function makeConfig(overrides: Partial<PayrollPeriodConfig> = {}): PayrollPeriodConfig {
  return {
    paymentType: 'specific_day_of_month',
    fixedDay: null,
    fixedEveryNWeeks: null,
    applySince: '2020-01-01',
    ...overrides,
  }
}

test.group('work_journal.period_calculator — specific_day_of_month (mensual)', () => {
  test('cierra el periodo cuando el corte es el fixedDay configurado', ({ assert }) => {
    const config = makeConfig({ paymentType: 'specific_day_of_month', fixedDay: '30' })

    const result = resolveExpiredPayrollPeriod(config, '2026-06-30')

    assert.deepEqual(result, { from: '2026-05-31', to: '2026-06-30' })
  })

  test('no cierra nada si el corte no coincide con el fixedDay', ({ assert }) => {
    const config = makeConfig({ paymentType: 'specific_day_of_month', fixedDay: '30' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-06-15'))
  })

  test('fixedDay=31 en febrero (28 días, 2026 no bisiesto) se acota al último día del mes', ({
    assert,
  }) => {
    const config = makeConfig({ paymentType: 'specific_day_of_month', fixedDay: '31' })

    const result = resolveExpiredPayrollPeriod(config, '2026-02-28')

    assert.deepEqual(result, { from: '2026-02-01', to: '2026-02-28' })
  })

  test('el mes previo con 31 días se acota igual al construir el "from"', ({ assert }) => {
    // fixedDay=30: mayo (31 días) cierra el 30, por lo que el periodo de
    // junio arranca el 31 de mayo (día siguiente al cierre de mayo), no el 1.
    const config = makeConfig({ paymentType: 'specific_day_of_month', fixedDay: '30' })

    const result = resolveExpiredPayrollPeriod(config, '2026-06-30')

    assert.equal(result?.from, '2026-05-31')
  })

  test('sin fixedDay configurado, equivale a "fin de mes"', ({ assert }) => {
    const config = makeConfig({ paymentType: 'specific_day_of_month', fixedDay: null })

    const result = resolveExpiredPayrollPeriod(config, '2026-04-30')

    assert.deepEqual(result, { from: '2026-04-01', to: '2026-04-30' })
  })
})

test.group('work_journal.period_calculator — biweekly (quincenal)', () => {
  test('cierra el 15 con el periodo 1–15', ({ assert }) => {
    const config = makeConfig({ paymentType: 'biweekly' })

    const result = resolveExpiredPayrollPeriod(config, '2026-02-15')

    assert.deepEqual(result, { from: '2026-02-01', to: '2026-02-15' })
  })

  test('cierra el último día del mes con el periodo 16–fin de mes (febrero 28 días)', ({
    assert,
  }) => {
    const config = makeConfig({ paymentType: 'biweekly' })

    const result = resolveExpiredPayrollPeriod(config, '2026-02-28')

    assert.deepEqual(result, { from: '2026-02-16', to: '2026-02-28' })
  })

  test('mes de 31 días: el segundo periodo cierra el 31, no el 30', ({ assert }) => {
    const config = makeConfig({ paymentType: 'biweekly' })

    const result = resolveExpiredPayrollPeriod(config, '2026-01-31')

    assert.deepEqual(result, { from: '2026-01-16', to: '2026-01-31' })
  })

  test('un día que no es 15 ni fin de mes no cierra nada', ({ assert }) => {
    const config = makeConfig({ paymentType: 'biweekly' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-02-20'))
  })
})

test.group('work_journal.period_calculator — fourteenth (catorcenal)', () => {
  test('el primer ciclo arranca completo en apply_since (no es parcial)', ({ assert }) => {
    const config = makeConfig({ paymentType: 'fourteenth', applySince: '2026-01-05' })

    const result = resolveExpiredPayrollPeriod(config, '2026-01-18')

    assert.deepEqual(result, { from: '2026-01-05', to: '2026-01-18' })
  })

  test('el segundo ciclo empieza el día siguiente al primero', ({ assert }) => {
    const config = makeConfig({ paymentType: 'fourteenth', applySince: '2026-01-05' })

    const result = resolveExpiredPayrollPeriod(config, '2026-02-01')

    assert.deepEqual(result, { from: '2026-01-19', to: '2026-02-01' })
  })

  test('un día intermedio del ciclo no cierra nada', ({ assert }) => {
    const config = makeConfig({ paymentType: 'fourteenth', applySince: '2026-01-05' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-01-19'))
  })

  test('una fecha anterior a apply_since nunca cierra nada', ({ assert }) => {
    const config = makeConfig({ paymentType: 'fourteenth', applySince: '2026-01-05' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2025-12-31'))
  })
})

test.group('work_journal.period_calculator — fixed_day_every_n_weeks (semanal / cada N)', () => {
  test('semanal (N=1): ciclos de 7 días anclados en apply_since', ({ assert }) => {
    const config = makeConfig({
      paymentType: 'fixed_day_every_n_weeks',
      fixedEveryNWeeks: 1,
      applySince: '2026-01-05',
    })

    const result = resolveExpiredPayrollPeriod(config, '2026-01-11')

    assert.deepEqual(result, { from: '2026-01-05', to: '2026-01-11' })
  })

  test('cada 2 semanas: ciclos de 14 días (mismo mecanismo que catorcenal)', ({ assert }) => {
    const config = makeConfig({
      paymentType: 'fixed_day_every_n_weeks',
      fixedEveryNWeeks: 2,
      applySince: '2026-01-05',
    })

    const result = resolveExpiredPayrollPeriod(config, '2026-01-18')

    assert.deepEqual(result, { from: '2026-01-05', to: '2026-01-18' })
  })

  test('sin fixedEveryNWeeks configurado, por default es semanal (N=1)', ({ assert }) => {
    const config = makeConfig({
      paymentType: 'fixed_day_every_n_weeks',
      fixedEveryNWeeks: null,
      applySince: '2026-01-05',
    })

    const result = resolveExpiredPayrollPeriod(config, '2026-01-11')

    assert.deepEqual(result, { from: '2026-01-05', to: '2026-01-11' })
  })

  test('un día dentro del ciclo pero que no es el cierre no cierra nada', ({ assert }) => {
    const config = makeConfig({
      paymentType: 'fixed_day_every_n_weeks',
      fixedEveryNWeeks: 1,
      applySince: '2026-01-05',
    })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-01-08'))
  })
})

test.group('work_journal.period_calculator — casos generales', () => {
  test('un ciclo que terminaría antes de apply_since se omite (config aún no vigente)', ({
    assert,
  }) => {
    // biweekly no ancla sus ciclos en apply_since, pero igual se respeta
    // como "la config no aplicaba todavía" para periodos anteriores a esa fecha.
    const config = makeConfig({ paymentType: 'biweekly', applySince: '2026-06-15' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-02-15'))
  })

  test('fecha de corte inválida devuelve null', ({ assert }) => {
    const config = makeConfig()

    assert.isNull(resolveExpiredPayrollPeriod(config, 'no-es-una-fecha'))
  })

  test('apply_since inválido devuelve null', ({ assert }) => {
    const config = makeConfig({ applySince: 'no-es-una-fecha' })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-06-30'))
  })

  test('payment_type desconocido devuelve null en vez de lanzar', ({ assert }) => {
    const config = makeConfig({ paymentType: 'no-existe' as PayrollPeriodConfig['paymentType'] })

    assert.isNull(resolveExpiredPayrollPeriod(config, '2026-06-30'))
  })
})
