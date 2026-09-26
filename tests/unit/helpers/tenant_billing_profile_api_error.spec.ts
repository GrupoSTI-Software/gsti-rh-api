import { test } from '@japa/runner'
import { TENANT_BILLING_PROFILE_ERROR_CODES } from '../../../app/constants/tenant_billing_profile_error_codes.js'
import { TenantBillingProfileServiceError } from '../../../app/exceptions/tenant_billing_profile_service_error.js'
import {
  tenantBillingCfdiUseNotForRegimeError,
  tenantBillingCfdiUseUnknownError,
  tenantBillingTaxRegimeNotForPersonTypeError,
  tenantBillingTaxRegimeUnknownError,
} from '../../../app/helpers/tenant_billing_profile_error.js'
import { resolveTenantBillingProfileApiError } from '../../../app/helpers/tenant_billing_profile_api_error.js'

test.group('resolveTenantBillingProfileApiError — validación cruzada SAT (USRH1786737531066)', () => {
  test('TNT.BILL.TAX_REGIME_UNKNOWN responde 422 con clave regimen-fiscal-desconocido', ({
    assert,
  }) => {
    const resolved = resolveTenantBillingProfileApiError(tenantBillingTaxRegimeUnknownError())

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.TAX_REGIME_UNKNOWN)
    assert.equal(resolved.key, 'regimen-fiscal-desconocido')
    assert.equal(resolved.title, 'Datos de facturación')
  })

  test('TNT.BILL.TAX_REGIME_NOT_FOR_PERSON_TYPE responde 422 con título específico', ({
    assert,
  }) => {
    const resolved = resolveTenantBillingProfileApiError(
      tenantBillingTaxRegimeNotForPersonTypeError()
    )

    assert.equal(resolved.status, 422)
    assert.equal(
      resolved.code,
      TENANT_BILLING_PROFILE_ERROR_CODES.TAX_REGIME_NOT_FOR_PERSON_TYPE
    )
    assert.equal(resolved.key, 'regimen-fiscal-no-aplicable')
    assert.equal(resolved.title, 'Régimen fiscal no aplicable')
    assert.include(
      resolved.detail,
      'no corresponde al tipo de contribuyente del RFC registrado'
    )
  })

  test('TNT.BILL.CFDI_USE_UNKNOWN responde 422 con clave uso-cfdi-desconocido', ({ assert }) => {
    const resolved = resolveTenantBillingProfileApiError(tenantBillingCfdiUseUnknownError())

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.CFDI_USE_UNKNOWN)
    assert.equal(resolved.key, 'uso-cfdi-desconocido')
  })

  test('TNT.BILL.CFDI_USE_NOT_FOR_REGIME responde 422 con clave uso-cfdi-no-compatible', ({
    assert,
  }) => {
    const resolved = resolveTenantBillingProfileApiError(tenantBillingCfdiUseNotForRegimeError())

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.CFDI_USE_NOT_FOR_REGIME)
    assert.equal(resolved.key, 'uso-cfdi-no-compatible')
    assert.equal(resolved.title, 'Uso de CFDI no compatible')
  })
})

test.group('resolveTenantBillingProfileApiError — errores Vine', () => {
  test('E_VALIDATION_ERROR de forma responde VAL_INPUT con detalle del campo', ({ assert }) => {
    const resolved = resolveTenantBillingProfileApiError({
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'El campo postalCode no es válido', rule: 'regex' }],
    })

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.key, 'datos-invalidos')
    assert.equal(resolved.detail, 'El campo postalCode no es válido')
  })

  test('E_VALIDATION_ERROR con regla rfc_sat responde RFC_INVALID', ({ assert }) => {
    const resolved = resolveTenantBillingProfileApiError({
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'RFC inválido', rule: 'rfc_sat' }],
    })

    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.RFC_INVALID)
    assert.equal(resolved.key, 'rfc-invalido')
  })
})

test.group('resolveTenantBillingProfileApiError — errores no tipados', () => {
  test('Error genérico responde SYS_UNHANDLED', ({ assert }) => {
    const resolved = resolveTenantBillingProfileApiError(new Error('fallo inesperado'), 500)

    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(resolved.detail, 'fallo inesperado')
  })

  test('ServiceError con código desconocido usa título de respaldo', ({ assert }) => {
    const error = new TenantBillingProfileServiceError(
      'detalle custom',
      TENANT_BILLING_PROFILE_ERROR_CODES.SYS_UNHANDLED,
      500,
      'error-sistema',
      'detalle custom'
    )

    const resolved = resolveTenantBillingProfileApiError(error)

    assert.equal(resolved.code, TENANT_BILLING_PROFILE_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(resolved.detail, 'detalle custom')
  })
})
