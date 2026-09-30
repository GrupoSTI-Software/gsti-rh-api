import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { formatRequestedPeriodEs } from '#helpers/format_requested_period_es'

/**
 * Los correos de solicitudes de permisos dicen qué días cubren. Un permiso de
 * varios días se guarda como una solicitud por día para poder resolverse por
 * separado, así que el mismo texto tiene que servir para la petición completa
 * —días corridos— y para una resolución parcial, donde los días autorizados
 * pueden quedar salteados.
 *
 * Escribir "del 1 al 5" cuando solo se autorizaron el 1, el 3 y el 5 no es un
 * detalle de redacción: es decirle a alguien que tiene permiso un día que no lo
 * tiene.
 */
test.group('formatRequestedPeriodEs', () => {
  test('un solo día se nombra completo', ({ assert }) => {
    const texto = formatRequestedPeriodEs(['2026-10-03'])

    assert.equal(texto, 'el 3 de octubre de 2026')
  })

  test('los días corridos del mismo mes se resumen en un rango', ({ assert }) => {
    const texto = formatRequestedPeriodEs(['2026-10-03', '2026-10-04', '2026-10-05'])

    assert.equal(texto, 'del 3 al 5 de octubre de 2026')
  })

  test('un rango que cruza de mes nombra los dos extremos completos', ({ assert }) => {
    const texto = formatRequestedPeriodEs(['2026-09-30', '2026-10-01'])

    assert.equal(texto, 'del 30 de septiembre de 2026 al 1 de octubre de 2026')
  })

  test('los días salteados se enumeran, nunca se resumen como rango', ({ assert }) => {
    const texto = formatRequestedPeriodEs(['2026-10-01', '2026-10-03', '2026-10-05'])

    assert.equal(texto, '1 de octubre de 2026, 3 de octubre de 2026, 5 de octubre de 2026')
    assert.notInclude(texto, 'del 1 al 5')
  })

  test('el desorden de entrada no cambia el resultado', ({ assert }) => {
    const desordenado = formatRequestedPeriodEs(['2026-10-05', '2026-10-03', '2026-10-04'])

    assert.equal(desordenado, 'del 3 al 5 de octubre de 2026')
  })

  test('un día repetido no cuenta dos veces', ({ assert }) => {
    const texto = formatRequestedPeriodEs(['2026-10-03', '2026-10-03', '2026-10-04'])

    assert.equal(texto, 'del 3 al 4 de octubre de 2026')
  })

  test('acepta las tres formas en que el modelo entrega la fecha', ({ assert }) => {
    const texto = formatRequestedPeriodEs([
      '2026-10-03',
      new Date(Date.UTC(2026, 9, 4)),
      DateTime.fromISO('2026-10-05', { zone: 'America/Mexico_City' }),
    ])

    assert.equal(texto, 'del 3 al 5 de octubre de 2026')
  })

  test('sin fechas interpretables devuelve cadena vacía', ({ assert }) => {
    assert.equal(formatRequestedPeriodEs([]), '')
    assert.equal(formatRequestedPeriodEs(['no-es-una-fecha']), '')
  })
})
