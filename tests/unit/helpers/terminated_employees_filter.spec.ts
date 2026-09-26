import { test } from '@japa/runner'
import { isTerminatedEmployeesFilterRequested } from '#helpers/terminated_employees_filter'

test.group('isTerminatedEmployeesFilterRequested', () => {
  test('es verdadero solo con true booleano o la cadena true', ({ assert }) => {
    assert.isTrue(isTerminatedEmployeesFilterRequested(true))
    assert.isTrue(isTerminatedEmployeesFilterRequested('true'))
  })

  test('es falso con ausente, false y otros truthy que el listado no trata como bajas', ({
    assert,
  }) => {
    assert.isFalse(isTerminatedEmployeesFilterRequested(undefined))
    assert.isFalse(isTerminatedEmployeesFilterRequested(null))
    assert.isFalse(isTerminatedEmployeesFilterRequested(false))
    assert.isFalse(isTerminatedEmployeesFilterRequested('false'))
    assert.isFalse(isTerminatedEmployeesFilterRequested('1'))
    assert.isFalse(isTerminatedEmployeesFilterRequested(1))
    assert.isFalse(isTerminatedEmployeesFilterRequested('yes'))
    assert.isFalse(isTerminatedEmployeesFilterRequested('TRUE'))
  })
})
