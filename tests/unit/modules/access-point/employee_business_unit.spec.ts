import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import { AdmsError } from '#exceptions/adms_error'
import {
  requireEmployeeBusinessUnitId,
  requireStoredEmployeeBusinessUnitId,
} from '#modules/access-point/employee_business_unit'
import { resolveScopedEmployee } from '#modules/access-point/access_point_authorization'
import { resolveAdmsApiError } from '#helpers/adms_api_error'
import { resolveAccessPointEmployeeApiError } from '#helpers/access_point_employee_api_error'

/** El i18n real no aporta nada aqui: devuelve la clave y se compara por ella. */
const i18n = { formatMessage: (key: string) => key } as unknown as I18n

/** Colaborador sin empresa, con un id reconocible para buscarlo en la respuesta. */
const ORPHAN = { employeeId: 987654, businessUnitId: null }

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return null
}

/**
 * A3-19: en la frontera multi-empresa, un colaborador sin empresa tiene que
 * ser indistinguible de uno fuera del alcance: mismo estatus, titulo, detalle,
 * key y codigo, y sin su id en la respuesta.
 */
test.group('requireEmployeeBusinessUnitId: frontera multi-empresa', () => {
  test('sin empresa responde exactamente el 404 de colaborador fuera de alcance', async ({
    assert,
  }) => {
    const outOfScope = await resolveScopedEmployee(
      { businessUnitScope: [], i18n } as unknown as HttpContext,
      ORPHAN.employeeId
    ).catch((error: unknown) => error)
    const orphan = thrownBy(() => requireEmployeeBusinessUnitId(ORPHAN))

    const expected = resolveAdmsApiError(outOfScope, i18n)
    const actual = resolveAdmsApiError(orphan, i18n)
    assert.equal(expected.key, 'colaborador-no-encontrado')
    assert.deepEqual(actual, expected)
    assert.notInclude(JSON.stringify(actual), String(ORPHAN.employeeId))
  })

  test('devuelve la empresa del colaborador', ({ assert }) => {
    assert.equal(requireEmployeeBusinessUnitId({ employeeId: 7, businessUnitId: 3 }), 3)
  })

  test('sin empresa lanza 404 colaborador-no-encontrado en vez de seguir con null', ({
    assert,
  }) => {
    const failure = thrownBy(() =>
      requireEmployeeBusinessUnitId({ employeeId: 7, businessUnitId: null })
    )
    assert.instanceOf(failure, AdmsError)
    assert.equal((failure as AdmsError).httpStatus, 404)
    assert.equal((failure as AdmsError).key, 'colaborador-no-encontrado')
  })
})

/**
 * Despues de resolver al colaborador en el alcance, una empresa nula ya no es
 * de autorizacion sino de integridad: 500 generico, sin datos, en los dos
 * contratos de error que la pueden ver.
 */
test.group('requireStoredEmployeeBusinessUnitId: colaborador ya resuelto (integridad)', () => {
  test('sin empresa es un 500 generico sin el id', ({ assert }) => {
    const error = thrownBy(() => requireStoredEmployeeBusinessUnitId(ORPHAN))
    assert.isNotNull(error)

    const adms = resolveAdmsApiError(error, i18n)
    assert.equal(adms.status, 500)
    assert.equal(adms.key, 'error-interno')
    assert.notInclude(JSON.stringify(adms), String(ORPHAN.employeeId))

    const assignment = resolveAccessPointEmployeeApiError(error, i18n)
    assert.equal(assignment.status, 500)
    assert.equal(assignment.key, 'error-interno')
    assert.notInclude(JSON.stringify(assignment), String(ORPHAN.employeeId))
  })

  test('con empresa la devuelve', ({ assert }) => {
    assert.equal(requireStoredEmployeeBusinessUnitId({ employeeId: 1, businessUnitId: 4 }), 4)
  })
})
