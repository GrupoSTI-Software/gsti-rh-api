import { test } from '@japa/runner'
import { BILLING_CATALOG_ERROR_CODES } from '../../../app/constants/billing_catalog_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BillingCatalogServiceError } from '../../../app/exceptions/billing_catalog_service_error.js'
import {
  changeNotADecreaseError,
  changeNotAnIncreaseError,
  employeesAboveSafetyCapError,
  employeesBelowActiveHeadcountError,
  employeesNotBlockOfTenError,
  mapCatalogErrorForPublicSurface,
  noLiveSubscriptionChangeError,
  noLiveSubscriptionError,
  onlyAccountOwnerError,
  originNotSelfServiceError,
  periodNotProratableError,
  planNotSelectedError,
  planUnavailableError,
  rethrowCatalogErrorForPublicSurface,
  subscriptionChangeConflictError,
  subscriptionPastDueError,
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
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT,
      'PLT.SUB.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT'
    )
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.ORIGIN_NOT_SELF_SERVICE,
      'PLT.SUB.ORIGIN_NOT_SELF_SERVICE'
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

  test('planNotSelectedError expone key y code del contrato', ({ assert }) => {
    const error = planNotSelectedError()
    assert.equal(error.key, 'plan-no-seleccionado')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_SELECTED)
    assert.equal(error.httpStatus, 422)
  })

  test('originNotSelfServiceError expone key y code del contrato', ({ assert }) => {
    const error = originNotSelfServiceError()
    assert.equal(error.key, 'empresa-no-self-service')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.ORIGIN_NOT_SELF_SERVICE)
    assert.equal(error.httpStatus, 422)
    assert.include(error.detail!, 'hola@valanserh.com')
    assert.notInclude(error.detail!.toLowerCase(), 'gsti')
  })

  test('employeesBelowActiveHeadcountError incluye data con active y minimum', ({ assert }) => {
    const error = employeesBelowActiveHeadcountError(47, 50)
    assert.equal(error.key, 'cantidad-menor-a-plantilla-activa')
    assert.equal(
      error.errorCode,
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT
    )
    assert.deepEqual(error.data, { active: 47, minimum: 50 })
    assert.include(error.detail!, '47')
    assert.include(error.detail!, '50')

    const resolved = resolveBillingSubscriptionApiError(error)
    assert.deepEqual(resolved.data, { active: 47, minimum: 50 })
  })
})

test.group('billing_tenant_error — previsualización de cambio (USRH1786107870847)', () => {
  test('noLiveSubscriptionError expone key y code del contrato', ({ assert }) => {
    const error = noLiveSubscriptionError()
    assert.equal(error.key, 'sin-suscripcion-viva')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_SUBSCRIPTION)
    assert.equal(error.httpStatus, 422)
  })

  test('subscriptionPastDueError expone key y code del contrato', ({ assert }) => {
    const error = subscriptionPastDueError()
    assert.equal(error.key, 'suscripcion-con-pago-atrasado')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_PAST_DUE)
    assert.equal(error.httpStatus, 422)
  })

  test('periodNotProratableError expone key y code del contrato', ({ assert }) => {
    const error = periodNotProratableError()
    assert.equal(error.key, 'periodo-sin-dias-por-prorratear')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.PERIOD_NOT_PRORATABLE)
    assert.equal(error.httpStatus, 422)
  })

  test('onlyAccountOwnerError responde 403', ({ assert }) => {
    const error = onlyAccountOwnerError()
    assert.equal(error.key, 'solo-el-dueno-de-la-cuenta')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE)
    assert.equal(error.httpStatus, 403)
  })
})

test.group('billing_tenant_error — solicitud de aumento (USRH1786107870850)', () => {
  test('changeNotAnIncreaseError expone key, code y data del contrato', ({ assert }) => {
    const error = changeNotAnIncreaseError(100, 90)
    assert.equal(error.key, 'cantidad-no-es-aumento')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_AN_INCREASE)
    assert.equal(error.httpStatus, 422)
    assert.deepEqual(error.data, { contracted: 100, requested: 90 })
  })

  test('subscriptionChangeConflictError responde 409', ({ assert }) => {
    const error = subscriptionChangeConflictError()
    assert.equal(error.key, 'cambio-en-conflicto')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_CONFLICT)
    assert.equal(error.httpStatus, 409)
  })
})

test.group('billing_tenant_error — agendar reducción (USRH1786107870853)', () => {
  test('changeNotADecreaseError expone key, code y data del contrato', ({ assert }) => {
    const error = changeNotADecreaseError(120, 150)
    assert.equal(error.key, 'cambio-no-es-reduccion')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_A_DECREASE)
    assert.equal(error.httpStatus, 422)
    assert.deepEqual(error.data, { contracted: 120, requested: 150 })
  })

  test('noLiveSubscriptionChangeError responde 422', ({ assert }) => {
    const error = noLiveSubscriptionChangeError()
    assert.equal(error.key, 'sin-cambio-vivo')
    assert.equal(error.errorCode, BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_CHANGE)
    assert.equal(error.httpStatus, 422)
  })
})
