import { test } from '@japa/runner'
import { AdmsError } from '#exceptions/adms_error'
import { requireEmployeeBusinessUnitId } from '#modules/access-point/employee_business_unit'

test.group('requireEmployeeBusinessUnitId', () => {
  test('devuelve la empresa del colaborador', ({ assert }) => {
    assert.equal(requireEmployeeBusinessUnitId({ employeeId: 7, businessUnitId: 3 }), 3)
  })

  test('sin empresa lanza 404 colaborador-no-encontrado en vez de seguir con null', ({
    assert,
  }) => {
    let failure: unknown = null
    try {
      requireEmployeeBusinessUnitId({ employeeId: 7, businessUnitId: null })
    } catch (error) {
      failure = error
    }
    assert.instanceOf(failure, AdmsError)
    assert.equal((failure as AdmsError).httpStatus, 404)
    assert.equal((failure as AdmsError).key, 'colaborador-no-encontrado')
  })
})
