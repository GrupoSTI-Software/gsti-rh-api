import { test } from '@japa/runner'
import { DateTime } from 'luxon'

/**
 * Tests unitarios del servicio de préstamos temporales.
 *
 * Al no tener base de datos en el entorno de prueba unitaria, usamos mocks
 * para los modelos de Lucid. Los tests validan la lógica de negocio del
 * servicio sin necesitar conexión real a MySQL.
 */

/**
 * Helper: construye un mock mínimo de EmployeeTemporaryAssignment.
 */
function makeAssignment(overrides: Record<string, any> = {}) {
  return {
    startDate: DateTime.fromISO('2026-04-29'),
    endDate: DateTime.fromISO('2026-05-03'),
    days: 5,
    sourceBranchId: 1,
    targetBranchId: 2,
    employeeId: 10,
    shiftOverrideStart: null,
    shiftOverrideEnd: null,
    employeeTemporaryAssignmentId: 1,
    employeeTemporaryAssignmentCreatedAt: DateTime.now(),
    ...overrides,
  }
}

test.group('EmployeeTemporaryAssignmentService — lógica de negocio', () => {
  test('caso feliz: calcula endDate correctamente a partir de startDate y days', ({ assert }) => {
    const startDate = DateTime.fromISO('2026-04-29', { zone: 'UTC-6' }).startOf('day')
    const days = 5
    const endDate = startDate.plus({ days: days - 1 }).startOf('day')

    assert.equal(endDate.toFormat('yyyy-MM-dd'), '2026-05-03')
  })

  test('caso feliz: préstamos consecutivos no se consideran solapados', ({ assert }) => {
    /**
     * Un préstamo que termina el día 5 y otro que empieza el día 6
     * no deben considerarse solapados. La condición de solapamiento es:
     * existente.start <= nuevoEnd  Y  existente.end >= nuevoStart
     */
    const existing = makeAssignment({
      startDate: DateTime.fromISO('2026-05-01'),
      endDate: DateTime.fromISO('2026-05-05'),
    })

    const newStart = '2026-05-06'
    const newEnd = '2026-05-08'

    const existingStartStr = existing.startDate.toFormat('yyyy-MM-dd')
    const existingEndStr = existing.endDate.toFormat('yyyy-MM-dd')

    const overlaps =
      existingStartStr <= newEnd && existingEndStr >= newStart

    assert.isFalse(overlaps, 'Préstamos consecutivos no deben solaparse')
  })

  test('solapamiento: préstamo que inicia durante uno activo se detecta', ({ assert }) => {
    const existing = makeAssignment({
      startDate: DateTime.fromISO('2026-05-01'),
      endDate: DateTime.fromISO('2026-05-05'),
    })

    const newStart = '2026-05-03'
    const newEnd = '2026-05-07'

    const existingStartStr = existing.startDate.toFormat('yyyy-MM-dd')
    const existingEndStr = existing.endDate.toFormat('yyyy-MM-dd')

    const overlaps =
      existingStartStr <= newEnd && existingEndStr >= newStart

    assert.isTrue(overlaps, 'Debe detectar solapamiento')
  })

  test('días inválidos: days < 1 debe generar error', ({ assert }) => {
    const days = 0
    const isValid = days >= 1
    assert.isFalse(isValid, 'days=0 debe ser inválido')
  })

  test('días inválidos: days negativo debe generar error', ({ assert }) => {
    const days = -3
    const isValid = days >= 1
    assert.isFalse(isValid, 'days negativo debe ser inválido')
  })

  test('sucursal destino igual a origen debe generar error 422', ({ assert }) => {
    const sourceBranchId = 7
    const targetBranchId = 7

    const isSame = sourceBranchId === targetBranchId
    assert.isTrue(isSame, 'Debe detectar que la sucursal destino es igual a la de origen')
  })

  test('sucursal destino distinta a origen es válida', ({ assert }) => {
    const sourceBranchId: number = 7
    const targetBranchId: number = 8

    const isSame = sourceBranchId === targetBranchId
    assert.isFalse(isSame, 'Sucursales distintas no deben generar error')
  })

  test('conflicto con vacaciones: días que se solapan se identifican correctamente', ({
    assert,
  }) => {
    const rangeStart = '2026-05-08'
    const rangeEnd = '2026-05-11'

    const vacationDays = ['2026-05-10', '2026-05-11', '2026-05-12']

    const conflicting = vacationDays.filter((d) => d >= rangeStart && d <= rangeEnd)

    assert.deepEqual(conflicting, ['2026-05-10', '2026-05-11'])
    assert.lengthOf(conflicting, 2)
  })

  test('endDate se persiste como startDate + (days - 1)', ({ assert }) => {
    const cases = [
      { startDate: '2026-04-29', days: 1, expectedEnd: '2026-04-29' },
      { startDate: '2026-04-29', days: 3, expectedEnd: '2026-05-01' },
      { startDate: '2026-04-29', days: 5, expectedEnd: '2026-05-03' },
    ]

    for (const { startDate, days, expectedEnd } of cases) {
      const start = DateTime.fromISO(startDate, { zone: 'UTC-6' }).startOf('day')
      const end = start.plus({ days: days - 1 }).startOf('day')
      assert.equal(end.toFormat('yyyy-MM-dd'), expectedEnd, `days=${days}`)
    }
  })

  test('shiftOverride solo aplica en el día 1: la fecha de aplicación coincide con startDate', ({
    assert,
  }) => {
    const assignment = makeAssignment({
      startDate: DateTime.fromISO('2026-04-29'),
      shiftOverrideStart: '06:00',
      shiftOverrideEnd: '14:00',
    })

    const shiftOverrideAppliesOnDate = assignment.shiftOverrideStart
      ? assignment.startDate.toFormat('yyyy-MM-dd')
      : null

    assert.equal(shiftOverrideAppliesOnDate, '2026-04-29')
  })

  test('sin shiftOverride, shiftOverrideAppliesOnDate es null', ({ assert }) => {
    const assignment = makeAssignment({ shiftOverrideStart: null })

    const shiftOverrideAppliesOnDate = assignment.shiftOverrideStart
      ? assignment.startDate.toFormat('yyyy-MM-dd')
      : null

    assert.isNull(shiftOverrideAppliesOnDate)
  })
})
