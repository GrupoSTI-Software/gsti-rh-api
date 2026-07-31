import { test } from '@japa/runner'
import { BILLING_CATALOG_ERROR_CODES } from '../../../app/constants/billing_catalog_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BillingCatalogServiceError } from '../../../app/exceptions/billing_catalog_service_error.js'
import {
  employeesAboveSafetyCapError,
  employeesNotBlockOfTenError,
  mapCatalogErrorForPublicSurface,
  planUnavailableError,
  rethrowCatalogErrorForPublicSurface,
} from '../../../app/helpers/billing_tenant_error.js'
import { resolveBillingSubscriptionApiError } from '../../../app/helpers/billing_subscription_api_error.js'

test.group('billing_tenant_error — constantes nuevas', () => {
  test('EMPLOYEES_NOT_BLOCK_OF_TEN y EMPLOYEES_ABOVE_SAFETY_CAP usan prefijo PLT.SUB.*', ({
    assert,
  }) => {
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
      'PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN'
    )
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP,
      'PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP'
    )
  })
})

test.group('billing_tenant_error — mapeo catálogo → suscripciones', () => {
  test('PLT.CAT.PLAN_NOT_FOUND se colapsa a plan-no-disponible / PLT.SUB.PLAN_NOT_FOUND', ({
    assert,
  }) => {
    const catalogError = new BillingCatalogServiceError(
      'Plan no encontrado',
      BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
      404,
      'PLT.CAT.PLAN_NOT_FOUND'
    )

    const mapped = mapCatalogErrorForPublicSurface(catalogError)
    assert.isNotNull(mapped)
    assert.equal(mapped!.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND)
    assert.equal(mapped!.key, 'plan-no-disponible')
    assert.equal(mapped!.httpStatus, 404)

    const resolved = resolveBillingSubscriptionApiError(mapped)
    assert.equal(resolved.code, 'PLT.SUB.PLAN_NOT_FOUND')
    assert.equal(resolved.key, 'plan-no-disponible')
    assert.notEqual(resolved.code, 'PLT.CAT.PLAN_NOT_FOUND')
  })

  test('errores de catálogo no colapsados devuelven null', ({ assert }) => {
    const tierError = new BillingCatalogServiceError(
      'Plan publicado',
      BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED,
      422
    )

    assert.isNull(mapCatalogErrorForPublicSurface(tierError))
  })

  test('rethrowCatalogErrorForPublicSurface relanza el mapeo', ({ assert }) => {
    const catalogError = new BillingCatalogServiceError(
      'Sin precio',
      BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
      404
    )

    try {
      rethrowCatalogErrorForPublicSurface(catalogError)
      assert.fail('debió lanzar BillingSubscriptionServiceError mapeado')
    } catch (error) {
      assert.equal((error as { key?: string }).key, 'plan-no-disponible')
    }
  })
})

test.group('billing_tenant_error — factories de cantidad', () => {
  test('employeesNotBlockOfTenError expone key y code del contrato', ({ assert }) => {
    const error = employeesNotBlockOfTenError()
    assert.equal(error.key, 'cantidad-no-multiplo-de-diez')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN)
    assert.equal(error.httpStatus, 422)
  })

  test('employeesAboveSafetyCapError expone key y code del contrato', ({ assert }) => {
    const error = employeesAboveSafetyCapError()
    assert.equal(error.key, 'cantidad-fuera-de-rango')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP)
    assert.equal(error.httpStatus, 422)
  })

  test('planUnavailableError usa el mismo detail en message y detail', ({ assert }) => {
    const error = planUnavailableError()
    assert.equal(error.message, error.detail)
    assert.include(error.detail!, 'no está disponible')
  })
})
