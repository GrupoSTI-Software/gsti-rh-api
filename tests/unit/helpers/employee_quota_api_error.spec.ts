import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { EMPLOYEE_QUOTA_ERROR_CODES } from '../../../app/constants/employee_quota_error_codes.js'
import {
  employeeImportQuotaExceededError,
  employeeImportQuotaNoPlanError,
  employeeQuotaExceededError,
  employeeQuotaNoPlanError,
  resolveEmployeeQuotaApiError,
} from '../../../app/helpers/employee_quota_api_error.js'
import { EmployeeQuotaError } from '../../../app/exceptions/employee_quota_error.js'

test.group('employee_quota_api_error — resolutor', () => {
  test('EMP.QUOTA.EXCEEDED expone data con contracted y active', ({ assert }) => {
    const error = employeeQuotaExceededError(20, 20)
    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('es'))

    assert.equal(resolved.status, 409)
    assert.equal(resolved.errorCode, EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED)
    assert.equal(resolved.key, 'cupo-empleados-agotado')
    assert.equal(resolved.data.contracted, 20)
    assert.equal(resolved.data.active, 20)
    assert.include(resolved.message, '20')
  })

  test('EMP.QUOTA.NO_PLAN no usa vocabulario de tope alcanzado', ({ assert }) => {
    const error = employeeQuotaNoPlanError(12)
    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('es'))

    assert.equal(resolved.errorCode, EMPLOYEE_QUOTA_ERROR_CODES.NO_PLAN)
    assert.equal(resolved.key, 'sin-plan-contratado')
    assert.equal(resolved.data.contracted, 0)
    assert.equal(resolved.data.active, 12)
    assert.notInclude(resolved.message.toLowerCase(), 'tope')
    assert.notInclude(resolved.message.toLowerCase(), 'alcanzado')
    assert.include(resolved.detail!, 'hola@valanserh.com')
  })

  test('EMP.IMPORT.QUOTA_EXCEEDED expone data con contracted, active e incoming', ({ assert }) => {
    const error = employeeImportQuotaExceededError(10, 8, 5)
    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('es'))

    assert.equal(resolved.status, 409)
    assert.equal(resolved.errorCode, EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_EXCEEDED)
    assert.equal(resolved.key, 'cupo-empleados-agotado-importacion')
    assert.equal(resolved.data.contracted, 10)
    assert.equal(resolved.data.active, 8)
    assert.equal(resolved.data.incoming, 5)
    assert.include(resolved.title, 'archivo')
    assert.include(resolved.message, '5')
    assert.include(resolved.detail!, 'No se aplicó ninguna línea')
  })

  test('EMP.IMPORT.NO_PLAN no usa vocabulario de tope alcanzado', ({ assert }) => {
    const error = employeeImportQuotaNoPlanError(12, 3)
    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('es'))

    assert.equal(resolved.errorCode, EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_NO_PLAN)
    assert.equal(resolved.key, 'sin-plan-contratado-importacion')
    assert.equal(resolved.data.contracted, 0)
    assert.equal(resolved.data.active, 12)
    assert.equal(resolved.data.incoming, 3)
    assert.notInclude(resolved.message.toLowerCase(), 'tope')
    assert.notInclude(resolved.message.toLowerCase(), 'alcanzado')
    assert.include(resolved.detail!, 'hola@valanserh.com')
  })

  test('EMP.IMPORT.QUOTA_EXCEEDED se resuelve con claves i18n en inglés', ({ assert }) => {
    const error = employeeImportQuotaExceededError(15, 12, 4)
    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('en'))

    assert.include(resolved.title.toLowerCase(), 'file')
    assert.include(resolved.message.toLowerCase(), '4')
    assert.include(resolved.detail!.toLowerCase(), 'no rows')
  })

  test('EmployeeQuotaError se resuelve con claves i18n en inglés', ({ assert }) => {
    const error = new EmployeeQuotaError(
      'fallback',
      EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED,
      409,
      'cupo-empleados-agotado',
      'fallback detail',
      { contracted: 10, active: 10 }
    )

    const resolved = resolveEmployeeQuotaApiError(error, 409, i18nManager.locale('en'))
    assert.include(resolved.message.toLowerCase(), 'subscription')
    assert.include(resolved.detail!.toLowerCase(), 'contracted')
  })
})
