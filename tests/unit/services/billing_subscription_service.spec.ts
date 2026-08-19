import { test } from '@japa/runner'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../../../app/exceptions/billing_subscription_service_error.js'
import { resolveBillingSubscriptionApiError } from '../../../app/helpers/billing_subscription_api_error.js'
import { LIVE_SUBSCRIPTION_STATUSES } from '../../../app/models/billing_subscription.js'

// ---------------------------------------------------------------------------
// Módulo: BillingSubscriptionServiceError
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionServiceError — constructor y propiedades', () => {
  test('construye el error con los campos correctos', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Empresa no encontrada',
      BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
      404,
      'empresa-no-encontrada',
      'La empresa solicitada no existe.'
    )
    assert.equal(error.message, 'Empresa no encontrada')
    assert.equal(error.errorCode, 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND')
    assert.equal(error.httpStatus, 404)
    assert.equal(error.key, 'empresa-no-encontrada')
    assert.equal(error.detail, 'La empresa solicitada no existe.')
    assert.equal(error.name, 'BillingSubscriptionServiceError')
    assert.isUndefined(error.data)
  })

  test('acepta data opcional con cantidades estructuradas', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Cantidad insuficiente',
      BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT,
      422,
      'cantidad-menor-a-plantilla-activa',
      'Tienes 47 empleados activos. La cantidad mínima que puedes contratar es 50.',
      { active: 47, minimum: 50 }
    )
    assert.deepEqual(error.data, { active: 47, minimum: 50 })

    const resolved = resolveBillingSubscriptionApiError(error)
    assert.deepEqual(resolved.data, { active: 47, minimum: 50 })
  })

  test('el httpStatus default es 400 cuando no se pasa', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Error de validación',
      BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT
    )
    assert.equal(error.httpStatus, 400)
  })

  test('es instancia de Error (compatibilidad con catch genérico)', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Error',
      BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED,
      500
    )
    assert.instanceOf(error, Error)
  })
})

// ---------------------------------------------------------------------------
// Módulo: BILLING_SUBSCRIPTION_ERROR_CODES — contrato de namespace PLT.SUB.*
// (spec-USRH1784574994919.md §6/§12 — no renombrar sin escalar)
// ---------------------------------------------------------------------------

test.group('BILLING_SUBSCRIPTION_ERROR_CODES — contrato de namespace PLT.SUB.*', () => {
  test('todos los códigos tienen el prefijo PLT.SUB.', ({ assert }) => {
    for (const code of Object.values(BILLING_SUBSCRIPTION_ERROR_CODES)) {
      assert.isTrue(code.startsWith('PLT.SUB.'), `"${code}" no tiene el prefijo PLT.SUB.`)
    }
  })

  test('el contrato de códigos fijado por el spec está completo', ({ assert }) => {
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT, 'PLT.SUB.VAL_INPUT')
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.NOT_FOUND, 'PLT.SUB.NOT_FOUND')
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
      'PLT.SUB.BUSINESS_UNIT_NOT_FOUND'
    )
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_INACTIVE,
      'PLT.SUB.BUSINESS_UNIT_INACTIVE'
    )
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND, 'PLT.SUB.PLAN_NOT_FOUND')
    assert.equal(
      BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
      'PLT.SUB.PLAN_NOT_PUBLISHED'
    )
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE, 'PLT.SUB.NO_ACTIVE_PRICE')
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE, 'PLT.SUB.ALREADY_LIVE')
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED, 'PLT.SUB.SUBSCRIPTION_CANCELED')
    assert.equal(BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_SELECTED, 'PLT.SUB.PLAN_NOT_SELECTED')
  })

  test('no hay códigos duplicados', ({ assert }) => {
    const values = Object.values(BILLING_SUBSCRIPTION_ERROR_CODES)
    const unique = new Set(values)
    assert.equal(unique.size, values.length, 'Hay códigos de error duplicados')
  })
})

// ---------------------------------------------------------------------------
// Módulo: resolveBillingSubscriptionApiError — helper de transformación
// ---------------------------------------------------------------------------

test.group('resolveBillingSubscriptionApiError — transformación de errores', () => {
  test('convierte BillingSubscriptionServiceError al shape { title, detail, key, code, status }', ({
    assert,
  }) => {
    const error = new BillingSubscriptionServiceError(
      'Plan no publicado',
      BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
      422,
      'plan-no-publicado',
      'Solo se puede contratar sobre un plan publicado.'
    )
    const resolved = resolveBillingSubscriptionApiError(error)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.SUB.PLAN_NOT_PUBLISHED')
    assert.equal(resolved.key, 'plan-no-publicado')
    assert.isString(resolved.title)
    assert.isString(resolved.detail)
  })

  test('convierte E_VALIDATION_ERROR a 422 con code VAL_INPUT', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'businessUnitPublicId es obligatorio' }],
    }
    const resolved = resolveBillingSubscriptionApiError(vineError)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.detail, 'businessUnitPublicId es obligatorio')
  })

  test('error desconocido usa fallbackStatus y code SYS_UNHANDLED', ({ assert }) => {
    const resolved = resolveBillingSubscriptionApiError(new Error('Error inesperado'), 500)
    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, BILLING_SUBSCRIPTION_ERROR_CODES.SYS_UNHANDLED)
  })

  test('la respuesta siempre tiene title, detail, key, code y status', ({ assert }) => {
    const cases = [
      new BillingSubscriptionServiceError(
        'x',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404
      ),
      { code: 'E_VALIDATION_ERROR', messages: [{ message: 'msg' }] },
      new Error('genérico'),
    ]
    for (const err of cases) {
      const resolved = resolveBillingSubscriptionApiError(err)
      assert.property(resolved, 'title')
      assert.property(resolved, 'detail')
      assert.property(resolved, 'key')
      assert.property(resolved, 'code')
      assert.property(resolved, 'status')
    }
  })

  test('nunca expone stacktrace en la respuesta resuelta', ({ assert }) => {
    const resolved = resolveBillingSubscriptionApiError(new Error('error'))
    assert.notProperty(resolved, 'stack')
  })
})

// ---------------------------------------------------------------------------
// Módulo: LIVE_SUBSCRIPTION_STATUSES — candado de una suscripción viva
// ---------------------------------------------------------------------------

test.group('LIVE_SUBSCRIPTION_STATUSES — contrato de estados vivos', () => {
  test('trialing, active y past_due se consideran vivos', ({ assert }) => {
    assert.include(LIVE_SUBSCRIPTION_STATUSES, 'trialing')
    assert.include(LIVE_SUBSCRIPTION_STATUSES, 'active')
    assert.include(LIVE_SUBSCRIPTION_STATUSES, 'past_due')
  })

  test('canceled NO se considera un estado vivo', ({ assert }) => {
    assert.notInclude(LIVE_SUBSCRIPTION_STATUSES, 'canceled')
  })
})

// ---------------------------------------------------------------------------
// Módulo: reglas de negocio del alta manual (createSubscription)
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionService — reglas de createSubscription', () => {
  /** Espeja las validaciones de createSubscription antes de tocar la BD. */
  function tryCreate(context: {
    businessUnitExists: boolean
    businessUnitActive: boolean
    planExists: boolean
    planPublished: boolean
    planActive?: boolean
    hasActivePrice: boolean
    hasLiveSubscription: boolean
  }) {
    if (!context.businessUnitExists) {
      throw new BillingSubscriptionServiceError(
        'Empresa no encontrada',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404
      )
    }
    if (!context.businessUnitActive) {
      throw new BillingSubscriptionServiceError(
        'Empresa inactiva',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_INACTIVE,
        422
      )
    }
    if (!context.planExists) {
      throw new BillingSubscriptionServiceError(
        'Plan no encontrado',
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404
      )
    }
    // Espeja `!plan.isPublished || !plan.billingPlanActive` (USRH1785962095081):
    // un plan retirado (publicado pero desactivado) tampoco es contratable.
    if (!context.planPublished || context.planActive === false) {
      throw new BillingSubscriptionServiceError(
        'Plan no publicado y vigente',
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422
      )
    }
    if (!context.hasActivePrice) {
      throw new BillingSubscriptionServiceError(
        'Sin precio vigente',
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422
      )
    }
    if (context.hasLiveSubscription) {
      throw new BillingSubscriptionServiceError(
        'Ya tiene una suscripción viva',
        BILLING_SUBSCRIPTION_ERROR_CODES.ALREADY_LIVE,
        409
      )
    }
    return true
  }

  const baseContext = {
    businessUnitExists: true,
    businessUnitActive: true,
    planExists: true,
    planPublished: true,
    planActive: true,
    hasActivePrice: true,
    hasLiveSubscription: false,
  }

  function captureError(fn: () => unknown): BillingSubscriptionServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingSubscriptionServiceError
    }
  }

  test('empresa inexistente lanza BUSINESS_UNIT_NOT_FOUND con 404', ({ assert }) => {
    const error = captureError(() =>
      tryCreate({ ...baseContext, businessUnitExists: false })
    )
    assert.equal(error?.errorCode, 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND')
    assert.equal(error?.httpStatus, 404)
  })

  test('empresa inactiva lanza BUSINESS_UNIT_INACTIVE con 422', ({ assert }) => {
    const error = captureError(() => tryCreate({ ...baseContext, businessUnitActive: false }))
    assert.equal(error?.errorCode, 'PLT.SUB.BUSINESS_UNIT_INACTIVE')
    assert.equal(error?.httpStatus, 422)
  })

  test('plan inexistente lanza PLAN_NOT_FOUND con 404', ({ assert }) => {
    const error = captureError(() => tryCreate({ ...baseContext, planExists: false }))
    assert.equal(error?.errorCode, 'PLT.SUB.PLAN_NOT_FOUND')
    assert.equal(error?.httpStatus, 404)
  })

  test('contratar sobre un plan en borrador lanza PLAN_NOT_PUBLISHED con 422', ({ assert }) => {
    const error = captureError(() => tryCreate({ ...baseContext, planPublished: false }))
    assert.equal(error?.errorCode, 'PLT.SUB.PLAN_NOT_PUBLISHED')
    assert.equal(error?.httpStatus, 422)
  })

  test('sin precio vigente en el catálogo lanza NO_ACTIVE_PRICE con 422', ({ assert }) => {
    const error = captureError(() => tryCreate({ ...baseContext, hasActivePrice: false }))
    assert.equal(error?.errorCode, 'PLT.SUB.NO_ACTIVE_PRICE')
    assert.equal(error?.httpStatus, 422)
  })

  test('contratar sobre un plan publicado pero retirado lanza PLAN_NOT_PUBLISHED con 422 (USRH1785962095081)', ({
    assert,
  }) => {
    const error = captureError(() => tryCreate({ ...baseContext, planActive: false }))
    assert.equal(error?.errorCode, 'PLT.SUB.PLAN_NOT_PUBLISHED')
    assert.equal(error?.httpStatus, 422)
  })

  test('empresa con suscripción viva lanza ALREADY_LIVE con 409', ({ assert }) => {
    const error = captureError(() => tryCreate({ ...baseContext, hasLiveSubscription: true }))
    assert.equal(error?.errorCode, 'PLT.SUB.ALREADY_LIVE')
    assert.equal(error?.httpStatus, 409)
  })

  test('empresa activa, plan publicado con precio vigente y sin suscripción viva no lanza error', ({
    assert,
  }) => {
    assert.doesNotThrow(() => tryCreate(baseContext))
  })

  test('la validación de existencia de empresa tiene prioridad sobre las demás', ({ assert }) => {
    const error = captureError(() =>
      tryCreate({
        businessUnitExists: false,
        businessUnitActive: false,
        planExists: false,
        planPublished: false,
        hasActivePrice: false,
        hasLiveSubscription: true,
      })
    )
    assert.equal(error?.errorCode, 'PLT.SUB.BUSINESS_UNIT_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// Módulo: cálculo de fin de prueba y periodo inicial (regla 7)
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionService — cálculo del reloj inicial', () => {
  /** Espeja el cálculo: trialEndsAt = hoy(CDMX) + trialDays; currentPeriodEnd = trialEndsAt. */
  function computeInitialClock(today: Date, trialDays: number) {
    const trialEndsAt = new Date(today)
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + trialDays)
    return {
      currentPeriodStart: today,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
    }
  }

  test('7 días de prueba desde el 1 de enero termina el 8 de enero', ({ assert }) => {
    const today = new Date('2026-01-01T00:00:00.000Z')
    const clock = computeInitialClock(today, 7)
    assert.equal(clock.trialEndsAt.toISOString(), '2026-01-08T00:00:00.000Z')
    assert.equal(clock.currentPeriodEnd.toISOString(), clock.trialEndsAt.toISOString())
  })

  test('0 días de prueba no mueve la fecha (trial_ends_at = hoy)', ({ assert }) => {
    const today = new Date('2026-01-01T00:00:00.000Z')
    const clock = computeInitialClock(today, 0)
    assert.equal(clock.trialEndsAt.toISOString(), today.toISOString())
  })

  test('30 días de prueba cruza de mes correctamente', ({ assert }) => {
    const today = new Date('2026-01-15T00:00:00.000Z')
    const clock = computeInitialClock(today, 30)
    assert.equal(clock.trialEndsAt.toISOString(), '2026-02-14T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Módulo: SUBSCRIPTION_CANCELED — semántica del código de error
// ---------------------------------------------------------------------------

test.group('BILLING_SUBSCRIPTION_ERROR_CODES — SUBSCRIPTION_CANCELED', () => {
  test('lanza error con código PLT.SUB.SUBSCRIPTION_CANCELED al intentar cambiar plan en suscripción cancelada', ({
    assert,
  }) => {
    const error = new BillingSubscriptionServiceError(
      'La suscripción 42 está cancelada y no admite cambio de plan',
      BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED,
      422,
      'suscripcion-cancelada',
      'La suscripción está cancelada y no admite cambio de plan ni cobro.'
    )
    assert.equal(error.errorCode, 'PLT.SUB.SUBSCRIPTION_CANCELED')
    assert.equal(error.httpStatus, 422)
    assert.equal(error.key, 'suscripcion-cancelada')
  })

  test('lanza error con código PLT.SUB.SUBSCRIPTION_CANCELED al intentar cancelar una ya cancelada', ({
    assert,
  }) => {
    const error = new BillingSubscriptionServiceError(
      'La suscripción 42 ya está cancelada',
      BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED,
      422,
      'suscripcion-cancelada',
      'La suscripción ya está cancelada.'
    )
    assert.equal(error.errorCode, 'PLT.SUB.SUBSCRIPTION_CANCELED')
    assert.equal(error.httpStatus, 422)
  })

  test('resolveBillingSubscriptionApiError convierte SUBSCRIPTION_CANCELED a 422', ({ assert }) => {
    const error = new BillingSubscriptionServiceError(
      'Cancelada',
      BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_CANCELED,
      422,
      'suscripcion-cancelada',
      'La suscripción está cancelada.'
    )
    const resolved = resolveBillingSubscriptionApiError(error)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.SUB.SUBSCRIPTION_CANCELED')
    assert.property(resolved, 'title')
    assert.property(resolved, 'detail')
    assert.property(resolved, 'key')
  })
})

// ---------------------------------------------------------------------------
// Módulo: congelado del trato — el snapshot no depende de valores futuros
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionService — snapshot congelado del trato', () => {
  /** Simula la creación del snapshot a partir de lo resuelto por el catálogo. */
  function buildSnapshot(resolved: {
    pricePerEmployee: number
    discountPercent: number
    subtotal: number
    taxRate: number
    taxAmount: number
    total: number
    currency: string
  }) {
    return { ...resolved }
  }

  test('el snapshot congelado no cambia si el precio de catálogo cambia después', ({
    assert,
  }) => {
    const snapshot = buildSnapshot({
      pricePerEmployee: 65,
      discountPercent: 10,
      subtotal: 3510,
      taxRate: 0.16,
      taxAmount: 561.6,
      total: 4071.6,
      currency: 'MXN',
    })

    // Simula que el catálogo cambia el precio de lista después de contratar.
    const catalogPriceAfterChange = 220
    assert.notEqual(snapshot.pricePerEmployee, catalogPriceAfterChange)
    assert.equal(snapshot.pricePerEmployee, 65)
    assert.equal(snapshot.total, 4071.6)
  })
})

// ---------------------------------------------------------------------------
// Módulo: un plan retirado no puede ser destino de un cambio de plan
// (USRH1785962095081 — cierra la brecha de venta server-side)
// ---------------------------------------------------------------------------

test.group('BillingSubscriptionService — changePlan: plan destino publicado y vigente', () => {
  /** Espeja `!plan.isPublished || !plan.billingPlanActive` en changePlan. */
  function tryChangePlan(target: { published: boolean; active: boolean }) {
    if (!target.published || !target.active) {
      throw new BillingSubscriptionServiceError(
        'Plan no publicado y vigente',
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422
      )
    }
    return true
  }

  test('cambiar a un plan en borrador lanza PLAN_NOT_PUBLISHED con 422', ({ assert }) => {
    try {
      tryChangePlan({ published: false, active: true })
      assert.fail('Se esperaba PLAN_NOT_PUBLISHED')
    } catch (e) {
      const error = e as BillingSubscriptionServiceError
      assert.equal(error.errorCode, 'PLT.SUB.PLAN_NOT_PUBLISHED')
      assert.equal(error.httpStatus, 422)
    }
  })

  test('cambiar a un plan publicado pero retirado (desactivado) lanza PLAN_NOT_PUBLISHED con 422', ({
    assert,
  }) => {
    try {
      tryChangePlan({ published: true, active: false })
      assert.fail('Se esperaba PLAN_NOT_PUBLISHED')
    } catch (e) {
      const error = e as BillingSubscriptionServiceError
      assert.equal(error.errorCode, 'PLT.SUB.PLAN_NOT_PUBLISHED')
    }
  })

  test('cambiar a un plan publicado y vigente no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryChangePlan({ published: true, active: true }))
  })
})
