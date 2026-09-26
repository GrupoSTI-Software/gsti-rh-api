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
    // justo el relleno que la HU prohíbe. 100 = 33×3 + 1, no 2.
    assert.equal(100 - repartido, 1)
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

  test('un cobro multiperiodo anterior a la ventana sigue aportando a los meses de adentro', ({
    assert,
  }) => {
    const serie = buildMrrSeries(
      [pago({ subtotalCents: 1_200_000, periodsCovered: 12, periodStartMonth: '2026-01' })],
      { currentMonth: MES_EN_CURSO, months: 3, paymentsWithoutPeriod: 0 }
    )

    assert.equal(serie.ventana.desde, '2026-07')
    assert.equal(punto(serie, '2026-07').mrrCobradoNetoCents, 100_000)
    assert.equal(punto(serie, '2026-09').mrrCobradoNetoCents, 100_000)
    assert.equal(punto(serie, '2026-07').pagosConsiderados, 1)
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
