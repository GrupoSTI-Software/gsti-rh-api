import { test } from '@japa/runner'
import {
  isEmployeeTerminationRecordChanged,
  normalizeEmployeeTerminatedDate,
} from '#helpers/employee_termination_record'

const base = {
  employeeTerminatedDate: '2024-01-15 00:000:00',
  employeeTerminationModality: 'Renuncia',
  employeeTerminationType: 'Jubilación',
}

test.group('isEmployeeTerminationRecordChanged', () => {
  test('false cuando reenvía el mismo registro (edición ordinaria de baja existente)', ({ assert }) => {
    assert.isFalse(isEmployeeTerminationRecordChanged(base, { ...base }))
  })

  test('true al asentar registro donde no había ninguno', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(
        {
          employeeTerminatedDate: null,
          employeeTerminationModality: null,
          employeeTerminationType: null,
        },
        base
      )
    )
  })

  test('true al cambiar solo la fecha', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminatedDate: '2024-02-01 00:000:00',
      })
    )
  })

  test('true al cambiar modalidad o tipo', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminationModality: 'Despido',
      })
    )
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminationType: 'Bajo Desempeño Operativo',
      })
    )
  })

  test('true al quitar el registro por completo', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        employeeTerminatedDate: null,
        employeeTerminationModality: null,
        employeeTerminationType: null,
      })
    )
  })

  test('normaliza fecha ISO a la forma del controlador antes de comparar', ({ assert }) => {
    assert.equal(
      normalizeEmployeeTerminatedDate('2024-01-15T12:00:00.000Z'),
      '2024-01-15 00:000:00'
    )
    assert.isFalse(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminatedDate: normalizeEmployeeTerminatedDate('2024-01-15T00:00:00.000Z'),
      })
    )
  })

  test('normaliza Date UTC a la misma forma canónica que una fecha string', ({ assert }) => {
    const date = new Date('2024-01-15T23:59:59.000Z')
    assert.equal(normalizeEmployeeTerminatedDate(date), '2024-01-15 00:000:00')
    assert.isFalse(
      isEmployeeTerminationRecordChanged(
        { ...base, employeeTerminatedDate: date },
        { ...base, employeeTerminatedDate: '2024-01-15T00:00:00.000Z' }
      )
    )
  })
})
