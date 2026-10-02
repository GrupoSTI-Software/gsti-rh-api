/**
 * Tests unitarios del helper org_structure_api_error (USRH1788466831356).
 *
 * CA9 (unitaria):
 *  - Códigos MySQL de concurrencia → 409 conflict.
 *  - Cualquier otro error → 500 failed, sin error.message del servidor.
 *  - Cuerpo completo del 409 HAS_EMPLOYEES y del 500 DELETE_FAILED.
 */
import { test } from '@japa/runner'
import {
  classifyOrgStructureDbError,
  buildOrgStructureApiError,
} from '#helpers/org_structure_api_error'
import { ORG_STRUCTURE_ERROR_CODES } from '#constants/org_structure_error_codes'

test.group('org_structure_api_error — classifyOrgStructureDbError', () => {
  // Códigos MySQL de concurrencia → conflict

  for (const code of [
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_WAIT_TIMEOUT',
    'ER_ROW_IS_REFERENCED_2',
    'ER_NO_REFERENCED_ROW_2',
  ]) {
    test(`code ${code} → conflict`, ({ assert }) => {
      assert.equal(classifyOrgStructureDbError({ code }), 'conflict')
    })
  }

  for (const errno of [1213, 1205, 1451, 1452]) {
    test(`errno ${errno} → conflict`, ({ assert }) => {
      assert.equal(classifyOrgStructureDbError({ errno }), 'conflict')
    })
  }

  // Cualquier otro error → failed

  test('error genérico (ER_SYNTAX_ERROR) → failed', ({ assert }) => {
    assert.equal(classifyOrgStructureDbError({ code: 'ER_SYNTAX_ERROR' }), 'failed')
  })

  test('error sin código ni errno → failed', ({ assert }) => {
    assert.equal(classifyOrgStructureDbError(new Error('inesperado')), 'failed')
  })

  test('null → failed', ({ assert }) => {
    assert.equal(classifyOrgStructureDbError(null), 'failed')
  })
})

test.group('org_structure_api_error — buildOrgStructureApiError', () => {
  test('HAS_EMPLOYEES: status 409, type warning, code y key correctos, data completo', ({ assert }) => {
    const { status, body } = buildOrgStructureApiError(
      ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES,
      { departmentId: 42, affectedEmployees: 3 },
    )

    assert.equal(status, 409)
    assert.equal(body.type, 'warning')
    assert.equal(body.code, 'ORG.DEPARTMENT.HAS_EMPLOYEES')
    assert.equal(body.key, 'el-departamento-tiene-empleados')
    assert.deepEqual(body.data, { departmentId: 42, affectedEmployees: 3 })
    // message === detail (contrato aditivo §10.3)
    assert.equal(body.message, body.detail)
    // Nunca vacío
    assert.ok(body.title.length > 0)
    assert.ok(body.detail.length > 0)
  })

  test('DELETE_FAILED: status 500, type error, code correcto, sin sqlMessage', ({ assert }) => {
    const { status, body } = buildOrgStructureApiError(
      ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_FAILED,
      { departmentId: '99' },
    )

    assert.equal(status, 500)
    assert.equal(body.type, 'error')
    assert.equal(body.code, 'ORG.DEPARTMENT.DELETE_FAILED')
    assert.equal(body.key, 'no-fue-posible-eliminar-el-departamento')
    // El detalle nunca expone error.message del servidor
    assert.notInclude(body.detail, 'sqlMessage')
    assert.notInclude(body.detail, 'ER_')
  })

  test('POSITION_NOT_FOUND: status 404, type warning, key correcto', ({ assert }) => {
    const { status, body } = buildOrgStructureApiError(
      ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND,
      { positionId: '7' },
    )

    assert.equal(status, 404)
    assert.equal(body.type, 'warning')
    assert.equal(body.code, 'ORG.POSITION.NOT_FOUND')
    assert.equal(body.key, 'puesto-no-encontrado')
  })
})
