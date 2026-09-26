import { test } from '@japa/runner'
import { BUSINESS_UNIT_SIGNUP_ERROR_CODES } from '../../../app/constants/business_unit_signup_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BusinessUnitSignupServiceError } from '../../../app/exceptions/business_unit_signup_service_error.js'
import { BillingSubscriptionServiceError } from '../../../app/exceptions/billing_subscription_service_error.js'
import { SignupServiceError } from '../../../app/exceptions/signup_service_error.js'
import { SIGNUP_ERROR_CODES } from '../../../app/constants/signup_error_codes.js'
import { resolveAdditionalBusinessUnitApiError } from '../../../app/helpers/business_unit_signup_api_error.js'
import {
  forbiddenRoleError,
  duplicateNameError,
  limitReachedError,
  slugConflictError,
  settingsProvisioningFailedError,
  creationFailedError,
} from '../../../app/helpers/business_unit_signup_errors.js'

/**
 * Tests unitarios del resolver R-2 (USRH1787932877001).
 *
 * Orden de ramas:
 *   1. E_VALIDATION_ERROR (Vine) → TNT.BU.VAL_INPUT 422
 *   2. BusinessUnitSignupServiceError → código TNT.BU.* directo
 *   3. BillingSubscriptionServiceError → código PLT.SUB.* directo
 *   4. SignupServiceError → SETTINGS_PROVISIONING_FAILED 500
 *   5. Catch-all → CREATION_FAILED 500 con detail fijo (sin sqlMessage crudo)
 */

test.group('resolveAdditionalBusinessUnitApiError — rama 1: E_VALIDATION_ERROR (Vine)', () => {
  test('responde 422 TNT.BU.VAL_INPUT con el primer mensaje del array', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'businessUnitName es obligatorio' }],
    }

    const resolved = resolveAdditionalBusinessUnitApiError(vineError)

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.key, 'datos-invalidos')
    assert.equal(resolved.detail, 'businessUnitName es obligatorio')
  })

  test('usa fallback "Datos inválidos" cuando messages está vacío', ({ assert }) => {
    const vineError = { code: 'E_VALIDATION_ERROR', messages: [] }

    const resolved = resolveAdditionalBusinessUnitApiError(vineError)

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.detail, 'Datos inválidos')
  })
})

test.group('resolveAdditionalBusinessUnitApiError — rama 2: BusinessUnitSignupServiceError', () => {
  test('forbiddenRoleError → 403 TNT.BU.FORBIDDEN_ROLE', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(forbiddenRoleError())

    assert.equal(resolved.status, 403)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.FORBIDDEN_ROLE)
    assert.equal(resolved.key, 'solo-el-dueno-de-la-cuenta')
    assert.isString(resolved.detail)
    assert.isNotEmpty(resolved.detail)
  })

  test('duplicateNameError → 409 TNT.BU.DUPLICATE_NAME', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(duplicateNameError())

    assert.equal(resolved.status, 409)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.DUPLICATE_NAME)
    assert.equal(resolved.key, 'ya-tienes-una-empresa-con-ese-nombre')
  })

  test('limitReachedError → 409 TNT.BU.LIMIT_REACHED', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(limitReachedError())

    assert.equal(resolved.status, 409)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.LIMIT_REACHED)
    assert.equal(resolved.key, 'alcanzaste-el-maximo-de-empresas')
  })

  test('slugConflictError → 500 TNT.BU.SLUG_CONFLICT con key del contrato único', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(slugConflictError())

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.SLUG_CONFLICT)
    assert.equal(resolved.key, 'no-fue-posible-asignar-el-identificador-de-la-empresa')
  })

  test('settingsProvisioningFailedError → 500 TNT.BU.SETTINGS_PROVISIONING_FAILED', ({
    assert,
  }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(settingsProvisioningFailedError())

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED)
  })

  test('creationFailedError → 500 TNT.BU.CREATION_FAILED', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(creationFailedError())

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED)
    assert.equal(resolved.key, 'no-fue-posible-crear-la-empresa')
  })

  test('el title es el string de presentación, no el errorCode', ({ assert }) => {
    const resolved = resolveAdditionalBusinessUnitApiError(forbiddenRoleError())

    assert.notEqual(resolved.title, BUSINESS_UNIT_SIGNUP_ERROR_CODES.FORBIDDEN_ROLE)
    assert.isAbove(resolved.title.length, 4)
  })
})

test.group(
  'resolveAdditionalBusinessUnitApiError — rama 3: BillingSubscriptionServiceError (PLT.SUB.*)',
  () => {
    test('PLAN_NOT_FOUND → 404 PLT.SUB.PLAN_NOT_FOUND con key del catálogo', ({ assert }) => {
      const error = new BillingSubscriptionServiceError(
        'Plan no encontrado',
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.equal(resolved.status, 404)
      assert.equal(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND)
      assert.equal(resolved.key, 'plan-no-encontrado')
    })

    test('EMPLOYEES_NOT_BLOCK_OF_TEN → 422 PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN', ({ assert }) => {
      const error = new BillingSubscriptionServiceError(
        'Cantidad no múltiplo de 10',
        BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
        422,
        'cantidad-no-multiplo-de-diez',
        'La cantidad debe ser múltiplo de 10.'
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.equal(resolved.status, 422)
      assert.equal(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN)
      assert.equal(resolved.key, 'cantidad-no-multiplo-de-diez')
    })

    test('preserva httpStatus arbitrario del BillingSubscriptionServiceError', ({ assert }) => {
      const error = new BillingSubscriptionServiceError(
        'Empresa inactiva',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_INACTIVE,
        422,
        'empresa-inactiva'
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.equal(resolved.status, 422)
      assert.equal(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_INACTIVE)
    })
  }
)

test.group(
  'resolveAdditionalBusinessUnitApiError — rama 4: SignupServiceError → SETTINGS_PROVISIONING_FAILED',
  () => {
    test('SignupServiceError de provisión → 500 TNT.BU.SETTINGS_PROVISIONING_FAILED', ({
      assert,
    }) => {
      const error = new SignupServiceError(
        'No fue posible crear la configuración base de la empresa nueva',
        SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED,
        500
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.equal(resolved.status, 500)
      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED)
      assert.equal(resolved.key, 'no-fue-posible-crear-la-configuracion-de-la-empresa')
    })

    test('el detail NO expone el mensaje interno del SignupServiceError (S-6)', ({ assert }) => {
      const internalMessage = 'No se encontró system_setting_id = 1 en la base de datos'
      const error = new SignupServiceError(
        internalMessage,
        SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED,
        500
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.notInclude(resolved.detail, internalMessage)
      assert.notInclude(resolved.detail, 'system_setting_id')
    })
  }
)

test.group(
  'resolveAdditionalBusinessUnitApiError — rama 5: catch-all → CREATION_FAILED',
  () => {
    test('Error genérico → 500 TNT.BU.CREATION_FAILED', ({ assert }) => {
      const resolved = resolveAdditionalBusinessUnitApiError(new Error('algo salió mal'))

      assert.equal(resolved.status, 500)
      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED)
      assert.equal(resolved.key, 'no-fue-posible-crear-la-empresa')
    })

    test('el detail es fijo del catálogo, no contiene el mensaje crudo del error (S-6)', ({
      assert,
    }) => {
      const internalMessage = 'Duplicate entry en billing_subscriptions: algo muy técnico'
      const resolved = resolveAdditionalBusinessUnitApiError(new Error(internalMessage))

      assert.notInclude(resolved.detail, internalMessage)
      assert.notInclude(resolved.detail, 'Duplicate entry')
    })

    test('null como error → CREATION_FAILED (no lanza)', ({ assert }) => {
      const resolved = resolveAdditionalBusinessUnitApiError(null)

      assert.equal(resolved.status, 500)
      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED)
    })

    test('string como error → CREATION_FAILED (no lanza)', ({ assert }) => {
      const resolved = resolveAdditionalBusinessUnitApiError('error de texto plano')

      assert.equal(resolved.status, 500)
      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED)
    })

    test('objeto sin instanceof → CREATION_FAILED cuando no es BillingSubscriptionServiceError', ({
      assert,
    }) => {
      const resolved = resolveAdditionalBusinessUnitApiError({ code: 'ER_LOCK_TIMEOUT', errno: 1205 })

      assert.equal(resolved.status, 500)
      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED)
    })
  }
)

test.group(
  'resolveAdditionalBusinessUnitApiError — prioridad de ramas (R-2)',
  () => {
    test('Vine E_VALIDATION_ERROR tiene prioridad sobre BusinessUnitSignupServiceError', ({
      assert,
    }) => {
      const vineError = {
        code: 'E_VALIDATION_ERROR',
        messages: [{ message: 'campo inválido' }],
        name: 'BusinessUnitSignupServiceError',
      }

      const resolved = resolveAdditionalBusinessUnitApiError(vineError)

      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.VAL_INPUT)
    })

    test('BusinessUnitSignupServiceError tiene prioridad sobre BillingSubscriptionServiceError', ({
      assert,
    }) => {
      const error = new BusinessUnitSignupServiceError(
        'Límite alcanzado',
        BUSINESS_UNIT_SIGNUP_ERROR_CODES.LIMIT_REACHED,
        409
      )

      const resolved = resolveAdditionalBusinessUnitApiError(error)

      assert.equal(resolved.code, BUSINESS_UNIT_SIGNUP_ERROR_CODES.LIMIT_REACHED)
      assert.notEqual(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE)
    })
  }
)
