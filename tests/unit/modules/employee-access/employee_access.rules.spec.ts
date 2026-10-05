import { test } from '@japa/runner'
import { eligibleIds, joinName } from '#modules/employee-access/employee_access.rules'

test.group('Acceso a personal — reglas', () => {
  test('arma el nombre sin espacios de sobra', ({ assert }) => {
    assert.equal(joinName(' Wilvardo ', 'Ramírez', null, ''), 'Wilvardo Ramírez')
  })

  test('solo da de alta candidatos, sin repetir', ({ assert }) => {
    assert.deepEqual(eligibleIds([3, 3, 7, 9], [1, 3, 9]), [3, 9])
    assert.deepEqual(eligibleIds([5], []), [])
  })
})
