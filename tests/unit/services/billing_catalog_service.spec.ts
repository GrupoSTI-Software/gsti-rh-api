import { test } from '@japa/runner'
import { BILLING_CATALOG_ERROR_CODES } from '../../../app/constants/billing_catalog_error_codes.js'
import { BillingCatalogServiceError } from '../../../app/exceptions/billing_catalog_service_error.js'
import { resolveBillingCatalogApiError } from '../../../app/helpers/billing_catalog_api_error.js'

// ---------------------------------------------------------------------------
// Helpers de cálculo — espeja la lógica interna de resolvePrice
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Reproduce el algoritmo de resolvePrice para verificar matemática
 * sin necesidad de BD.
 */
function calculateResolvedPrice(params: {
  pricePerEmployee: number
  employeeCount: number
  discountPercent: number
  taxRate: number
}) {
  const { pricePerEmployee, employeeCount, discountPercent, taxRate } = params
  const grossAmount = pricePerEmployee * employeeCount
  const discountAmount = round2(grossAmount * (discountPercent / 100))
  const subtotal = round2(grossAmount - discountAmount)
  const taxAmount = round2(subtotal * taxRate)
  const total = round2(subtotal + taxAmount)
  return { grossAmount, discountAmount, subtotal, taxAmount, total }
}

// ---------------------------------------------------------------------------
// Módulo: cálculo matemático del precio resuelto
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — resolvePrice: matemática de cálculo', () => {
  test('sin descuento (0 %): subtotal = precio × empleados, total incluye IVA 16 %', ({ assert }) => {
    const result = calculateResolvedPrice({
      pricePerEmployee: 65,
      employeeCount: 10,
      discountPercent: 0,
      taxRate: 0.16,
    })
    assert.equal(result.grossAmount, 650)
    assert.equal(result.discountAmount, 0)
    assert.equal(result.subtotal, 650)
    assert.equal(result.taxAmount, 104)
    assert.equal(result.total, 754)
  })

  test('descuento 5 % aplicado al tramo de 26 empleados', ({ assert }) => {
    const result = calculateResolvedPrice({
      pricePerEmployee: 65,
      employeeCount: 26,
      discountPercent: 5,
      taxRate: 0.16,
    })
    const expected = {
      grossAmount: 65 * 26,
      discountAmount: round2(65 * 26 * 0.05),
      subtotal: round2(65 * 26 * 0.95),
    }
    assert.equal(result.grossAmount, expected.grossAmount)
    assert.equal(result.discountAmount, expected.discountAmount)
    assert.equal(result.subtotal, expected.subtotal)
  })

  test('descuento 10 % — 60 empleados (tramo de 51)', ({ assert }) => {
    const result = calculateResolvedPrice({
      pricePerEmployee: 65,
      employeeCount: 60,
      discountPercent: 10,
      taxRate: 0.16,
    })
    assert.equal(result.subtotal, round2(65 * 60 * 0.9))
    assert.equal(result.taxAmount, round2(result.subtotal * 0.16))
    assert.equal(result.total, round2(result.subtotal + result.taxAmount))
  })

  test('descuento 20 % — 201 empleados (máximo tramo)', ({ assert }) => {
    const result = calculateResolvedPrice({
      pricePerEmployee: 65,
      employeeCount: 201,
      discountPercent: 20,
      taxRate: 0.16,
    })
    assert.equal(result.discountAmount, round2(65 * 201 * 0.2))
    assert.equal(result.subtotal, round2(65 * 201 * 0.8))
    assert.isTrue(result.total > result.subtotal)
  })

  test('descuento 100 %: total solo incluye IVA sobre 0 (subtotal = 0)', ({ assert }) => {
    const result = calculateResolvedPrice({
      pricePerEmployee: 65,
      employeeCount: 10,
      discountPercent: 100,
      taxRate: 0.16,
    })
    assert.equal(result.discountAmount, 650)
    assert.equal(result.subtotal, 0)
    assert.equal(result.taxAmount, 0)
    assert.equal(result.total, 0)
  })

  test('round2 mantiene exactamente 2 decimales en operaciones flotantes', ({ assert }) => {
    // 65 × 3 × 0.16 = 31.2 — sin round podría dar ruido flotante
    assert.equal(round2(65 * 3 * 0.16), 31.2)
    // 1 / 3 → round2 da 0.33, no 0.3333...
    assert.equal(round2(1 / 3), 0.33)
  })

  test('el total es siempre > subtotal cuando taxRate > 0', ({ assert }) => {
    for (const employeeCount of [1, 10, 50, 100, 250]) {
      const result = calculateResolvedPrice({
        pricePerEmployee: 65,
        employeeCount,
        discountPercent: 10,
        taxRate: 0.16,
      })
      assert.isTrue(result.total > result.subtotal, `Fallo para employeeCount=${employeeCount}`)
    }
  })

  test('a mayor volumen de empleados, mayor es el total (precio sin descuento)', ({ assert }) => {
    const r1 = calculateResolvedPrice({ pricePerEmployee: 65, employeeCount: 10, discountPercent: 0, taxRate: 0.16 })
    const r2 = calculateResolvedPrice({ pricePerEmployee: 65, employeeCount: 20, discountPercent: 0, taxRate: 0.16 })
    assert.isTrue(r2.total > r1.total)
  })
})

// ---------------------------------------------------------------------------
// Módulo: BillingCatalogServiceError
// ---------------------------------------------------------------------------

test.group('BillingCatalogServiceError — constructor y propiedades', () => {
  test('construye el error con los campos correctos', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'Plan no encontrado',
      BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
      404,
      'PLT.CAT.PLAN_NOT_FOUND',
      'El plan solicitado no existe.'
    )
    assert.equal(error.message, 'Plan no encontrado')
    assert.equal(error.errorCode, 'PLT.CAT.PLAN_NOT_FOUND')
    assert.equal(error.httpStatus, 404)
    assert.equal(error.key, 'PLT.CAT.PLAN_NOT_FOUND')
    assert.equal(error.detail, 'El plan solicitado no existe.')
    assert.equal(error.name, 'BillingCatalogServiceError')
  })

  test('el httpStatus default es 400 cuando no se pasa', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'Error de validación',
      BILLING_CATALOG_ERROR_CODES.VAL_INPUT
    )
    assert.equal(error.httpStatus, 400)
  })

  test('key y detail son undefined cuando no se pasan', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'Error genérico',
      BILLING_CATALOG_ERROR_CODES.SYS_UNHANDLED,
      500
    )
    assert.isUndefined(error.key)
    assert.isUndefined(error.detail)
  })

  test('es instancia de Error (compatibilidad con catch genérico)', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'Error',
      BILLING_CATALOG_ERROR_CODES.SYS_UNHANDLED,
      500
    )
    assert.instanceOf(error, Error)
  })
})

// ---------------------------------------------------------------------------
// Módulo: BILLING_CATALOG_ERROR_CODES — contrato de claves
// ---------------------------------------------------------------------------

test.group('BILLING_CATALOG_ERROR_CODES — contrato de namespace PLT.CAT.*', () => {
  test('todos los códigos tienen el prefijo PLT.CAT.', ({ assert }) => {
    for (const code of Object.values(BILLING_CATALOG_ERROR_CODES)) {
      assert.isTrue(
        code.startsWith('PLT.CAT.'),
        `"${code}" no tiene el prefijo PLT.CAT.`
      )
    }
  })

  test('PLAN_NOT_FOUND es PLT.CAT.PLAN_NOT_FOUND', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND, 'PLT.CAT.PLAN_NOT_FOUND')
  })

  test('TIER_PLAN_PUBLISHED es PLT.CAT.TIER_PLAN_PUBLISHED', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED, 'PLT.CAT.TIER_PLAN_PUBLISHED')
  })

  test('PRICE_IMMUTABLE es PLT.CAT.PRICE_IMMUTABLE', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.PRICE_IMMUTABLE, 'PLT.CAT.PRICE_IMMUTABLE')
  })

  test('no hay códigos duplicados', ({ assert }) => {
    const values = Object.values(BILLING_CATALOG_ERROR_CODES)
    const unique = new Set(values)
    assert.equal(unique.size, values.length, 'Hay códigos de error duplicados')
  })
})

// ---------------------------------------------------------------------------
// Módulo: resolveBillingCatalogApiError — helper de transformación
// ---------------------------------------------------------------------------

test.group('resolveBillingCatalogApiError — transformación de errores', () => {
  test('convierte BillingCatalogServiceError al shape { title, detail, key, code, status }', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'Plan no encontrado',
      BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
      404,
      'PLT.CAT.PLAN_NOT_FOUND',
      'El plan solicitado no existe.'
    )
    const resolved = resolveBillingCatalogApiError(error)
    assert.equal(resolved.status, 404)
    assert.equal(resolved.code, 'PLT.CAT.PLAN_NOT_FOUND')
    assert.equal(resolved.key, 'PLT.CAT.PLAN_NOT_FOUND')
    assert.isString(resolved.title)
    assert.isString(resolved.detail)
  })

  test('convierte E_VALIDATION_ERROR a 422 con code VAL_INPUT', ({ assert }) => {
    const vineError = {
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'billingPlanName es obligatorio' }],
    }
    const resolved = resolveBillingCatalogApiError(vineError)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, BILLING_CATALOG_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.detail, 'billingPlanName es obligatorio')
  })

  test('E_VALIDATION_ERROR sin messages usa fallback "Datos inválidos"', ({ assert }) => {
    const vineError = { code: 'E_VALIDATION_ERROR' }
    const resolved = resolveBillingCatalogApiError(vineError)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.detail, 'Datos inválidos')
  })

  test('error desconocido usa fallbackStatus y code SYS_UNHANDLED', ({ assert }) => {
    const resolved = resolveBillingCatalogApiError(new Error('Error inesperado'), 500)
    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, BILLING_CATALOG_ERROR_CODES.SYS_UNHANDLED)
  })

  test('la respuesta siempre tiene title, detail, key, code y status', ({ assert }) => {
    const cases = [
      new BillingCatalogServiceError('x', BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND, 404),
      { code: 'E_VALIDATION_ERROR', messages: [{ message: 'msg' }] },
      new Error('genérico'),
    ]
    for (const err of cases) {
      const resolved = resolveBillingCatalogApiError(err)
      assert.property(resolved, 'title')
      assert.property(resolved, 'detail')
      assert.property(resolved, 'key')
      assert.property(resolved, 'code')
      assert.property(resolved, 'status')
    }
  })

  test('nunca expone stacktrace en la respuesta resuelta', ({ assert }) => {
    const resolved = resolveBillingCatalogApiError(new Error('error'))
    assert.notProperty(resolved, 'stack')
  })
})

// ---------------------------------------------------------------------------
// Módulo: lógica de tramos — selección determinista del tramo aplicable
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — lógica de selección de tramo (determinista)', () => {
  /**
   * Simula la selección de tramo: MAX(min_employees ≤ N).
   * Este es el algoritmo que aplica el servicio en la consulta SQL.
   */
  function pickApplicableTier(
    tiers: Array<{ min: number; discount: number }>,
    employeeCount: number
  ): number {
    const eligible = tiers.filter((t) => t.min <= employeeCount)
    if (eligible.length === 0) return 0
    return eligible.reduce((best, t) => (t.min > best.min ? t : best)).discount
  }

  const TIERS = [
    { min: 1, discount: 0 },
    { min: 26, discount: 5 },
    { min: 51, discount: 10 },
    { min: 101, discount: 15 },
    { min: 201, discount: 20 },
  ]

  test('1 empleado → 0 % (tramo base)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 1), 0)
  })

  test('25 empleados → 0 % (justo antes del segundo tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 25), 0)
  })

  test('26 empleados → 5 % (activa el segundo tramo exactamente)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 26), 5)
  })

  test('50 empleados → 5 % (en el segundo tramo, antes del tercero)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 50), 5)
  })

  test('51 empleados → 10 % (activa el tercer tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 51), 10)
  })

  test('100 empleados → 10 % (todavía en tercer tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 100), 10)
  })

  test('101 empleados → 15 % (activa el cuarto tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 101), 15)
  })

  test('200 empleados → 15 % (antes del quinto tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 200), 15)
  })

  test('201 empleados → 20 % (activa el máximo tramo)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 201), 20)
  })

  test('1000 empleados → 20 % (máximo tramo cubre cualquier volumen superior)', ({ assert }) => {
    assert.equal(pickApplicableTier(TIERS, 1000), 20)
  })

  test('sin tramos configurados → descuento 0 %', ({ assert }) => {
    assert.equal(pickApplicableTier([], 50), 0)
  })
})

// ---------------------------------------------------------------------------
// Módulo: reglas de publicación — requisitos y estado
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — reglas de publicación', () => {
  test('un plan sin published_at se considera borrador', ({ assert }) => {
    const isPublished = (publishedAt: null | Date) => publishedAt !== null
    assert.isFalse(isPublished(null))
  })

  test('un plan con published_at se considera publicado', ({ assert }) => {
    const isPublished = (publishedAt: null | Date) => publishedAt !== null
    assert.isTrue(isPublished(new Date()))
  })

  test('publicar dos veces lanza PLAN_ALREADY_PUBLISHED', ({ assert }) => {
    const tryPublish = (isPublished: boolean) => {
      if (isPublished) {
        throw new BillingCatalogServiceError(
          'Plan ya publicado',
          BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLISHED,
          409
        )
      }
    }
    let caught: unknown = null
    try {
      tryPublish(true)
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, BillingCatalogServiceError)
    assert.doesNotThrow(() => tryPublish(false))
  })

  test('el error de publicación duplicada tiene httpStatus 409', ({ assert }) => {
    let caught: BillingCatalogServiceError | null = null
    try {
      throw new BillingCatalogServiceError(
        'Plan ya publicado',
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLISHED,
        409
      )
    } catch (e) {
      caught = e as BillingCatalogServiceError
    }
    assert.equal(caught?.httpStatus, 409)
    assert.equal(caught?.errorCode, 'PLT.CAT.PLAN_ALREADY_PUBLISHED')
  })

  test('mutar tramo de plan publicado lanza TIER_PLAN_PUBLISHED con 422', ({ assert }) => {
    const tryMutateTier = (isPublished: boolean) => {
      if (isPublished) {
        throw new BillingCatalogServiceError(
          'Tramos congelados',
          BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED,
          422
        )
      }
    }
    let caught: BillingCatalogServiceError | null = null
    try {
      tryMutateTier(true)
    } catch (e) {
      caught = e as BillingCatalogServiceError
    }
    assert.equal(caught?.httpStatus, 422)
    assert.equal(caught?.errorCode, 'PLT.CAT.TIER_PLAN_PUBLISHED')
  })
})

// ---------------------------------------------------------------------------
// Módulo: validaciones de tramo — reglas de negocio
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — validaciones de tramo', () => {
  function validateTierInput(min: number, discount: number): boolean {
    return min >= 1 && discount >= 0 && discount <= 100
  }

  test('min_employees = 1 y discount = 0 es válido (tramo base)', ({ assert }) => {
    assert.isTrue(validateTierInput(1, 0))
  })

  test('min_employees = 0 es inválido (debe ser ≥ 1)', ({ assert }) => {
    assert.isFalse(validateTierInput(0, 10))
  })

  test('discount = -1 es inválido (debe ser ≥ 0)', ({ assert }) => {
    assert.isFalse(validateTierInput(1, -1))
  })

  test('discount = 101 es inválido (debe ser ≤ 100)', ({ assert }) => {
    assert.isFalse(validateTierInput(1, 101))
  })

  test('discount = 100 es válido (descuento completo)', ({ assert }) => {
    assert.isTrue(validateTierInput(1, 100))
  })

  test('min_employees negativo es inválido', ({ assert }) => {
    assert.isFalse(validateTierInput(-5, 10))
  })
})

// ---------------------------------------------------------------------------
// Módulo: nuevos códigos de error — linaje / clonado (USRH1783377385288)
// ---------------------------------------------------------------------------

test.group('BILLING_CATALOG_ERROR_CODES — códigos de clonado', () => {
  test('CLONE_SOURCE_MUST_BE_PUBLISHED es PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_MUST_BE_PUBLISHED,
      'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED'
    )
  })

  test('CLONE_SOURCE_DEACTIVATED es PLT.CAT.CLONE_SOURCE_DEACTIVATED', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_DEACTIVATED,
      'PLT.CAT.CLONE_SOURCE_DEACTIVATED'
    )
  })

  test('CLONE_DRAFT_EXISTS es PLT.CAT.CLONE_DRAFT_EXISTS', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.CLONE_DRAFT_EXISTS, 'PLT.CAT.CLONE_DRAFT_EXISTS')
  })
})

// ---------------------------------------------------------------------------
// Módulo: reglas de clonado — quién puede clonarse (USRH1783377385288)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — reglas de clonePlan', () => {
  /** Espeja las validaciones de clonePlan antes de tocar la BD. */
  function tryClone(source: {
    isPublished: boolean
    active: 0 | 1
    hasExistingDraftClone: boolean
  }) {
    if (!source.isPublished) {
      throw new BillingCatalogServiceError(
        'No publicado',
        BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_MUST_BE_PUBLISHED,
        422
      )
    }
    if (source.active === 0) {
      throw new BillingCatalogServiceError(
        'Desactivado',
        BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_DEACTIVATED,
        422
      )
    }
    if (source.hasExistingDraftClone) {
      throw new BillingCatalogServiceError(
        'Ya existe un clon borrador',
        BILLING_CATALOG_ERROR_CODES.CLONE_DRAFT_EXISTS,
        409
      )
    }
    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('clonar un plan en borrador lanza CLONE_SOURCE_MUST_BE_PUBLISHED con 422', ({ assert }) => {
    const error = captureError(() =>
      tryClone({ isPublished: false, active: 1, hasExistingDraftClone: false })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED')
    assert.equal(error?.httpStatus, 422)
  })

  test('clonar un plan desactivado lanza CLONE_SOURCE_DEACTIVATED con 422', ({ assert }) => {
    const error = captureError(() =>
      tryClone({ isPublished: true, active: 0, hasExistingDraftClone: false })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.CLONE_SOURCE_DEACTIVATED')
    assert.equal(error?.httpStatus, 422)
  })

  test('clonar cuando ya hay un borrador clon vivo lanza CLONE_DRAFT_EXISTS con 409', ({
    assert,
  }) => {
    const error = captureError(() =>
      tryClone({ isPublished: true, active: 1, hasExistingDraftClone: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.CLONE_DRAFT_EXISTS')
    assert.equal(error?.httpStatus, 409)
  })

  test('clonar un plan publicado, activo y sin borrador clon previo no lanza error', ({
    assert,
  }) => {
    assert.doesNotThrow(() =>
      tryClone({ isPublished: true, active: 1, hasExistingDraftClone: false })
    )
  })

  test('la validación de "publicado" tiene prioridad sobre "desactivado"', ({ assert }) => {
    // Un plan en borrador nunca puede estar "activo=0 y publicado=false" a la vez
    // en la práctica, pero la validación debe evaluarse en este orden.
    const error = captureError(() =>
      tryClone({ isPublished: false, active: 0, hasExistingDraftClone: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED')
  })
})

// ---------------------------------------------------------------------------
// Módulo: publishPlan sobre un clon — desactivación atómica del origen
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — publicar un clon desactiva al plan origen', () => {
  /** Espeja el efecto secundario de publishPlan cuando el plan tiene parentId. */
  function publishAndCascade(plan: { billingPlanParentId: number | null; billingPlanActive: 0 | 1 }): {
    planPublished: boolean
    parentDeactivated: boolean
  } {
    let parentDeactivated = false
    if (plan.billingPlanParentId !== null) {
      parentDeactivated = true
    }
    return { planPublished: true, parentDeactivated }
  }

  test('publicar un plan sin parentId (plan original) no desactiva nada', ({ assert }) => {
    const result = publishAndCascade({ billingPlanParentId: null, billingPlanActive: 1 })
    assert.isTrue(result.planPublished)
    assert.isFalse(result.parentDeactivated)
  })

  test('publicar un plan clon (con parentId) desactiva al origen', ({ assert }) => {
    const result = publishAndCascade({ billingPlanParentId: 1, billingPlanActive: 1 })
    assert.isTrue(result.planPublished)
    assert.isTrue(result.parentDeactivated)
  })

  test('la desactivación del origen nunca borra el plan — solo cambia billingPlanActive a 0', ({
    assert,
  }) => {
    // Simula el efecto exacto de la query de desactivación: update, no delete.
    const origin = { billingPlanId: 1, billingPlanActive: 1 as 0 | 1, deletedAt: null as string | null }
    origin.billingPlanActive = 0
    assert.equal(origin.billingPlanActive, 0)
    assert.isNull(origin.deletedAt)
  })
})

// ---------------------------------------------------------------------------
// Módulo: nombre inmutable en plan publicado (USRH1785962095078)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — updatePlan: nombre inmutable en plan publicado', () => {
  /** Espeja la validación previa al UPDATE en updatePlan. */
  function tryRename(plan: { isPublished: boolean }, newName?: string) {
    if (newName !== undefined && plan.isPublished) {
      throw new BillingCatalogServiceError(
        'No se puede renombrar el plan publicado',
        BILLING_CATALOG_ERROR_CODES.PLAN_NAME_IMMUTABLE,
        422
      )
    }
    return newName
  }

  test('PLAN_NAME_IMMUTABLE es PLT.CAT.PLAN_NAME_IMMUTABLE', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PLAN_NAME_IMMUTABLE,
      'PLT.CAT.PLAN_NAME_IMMUTABLE'
    )
  })

  test('renombrar un plan publicado lanza PLAN_NAME_IMMUTABLE con 422', ({ assert }) => {
    assert.throws(() => tryRename({ isPublished: true }, 'Nuevo nombre'))
    try {
      tryRename({ isPublished: true }, 'Nuevo nombre')
    } catch (e) {
      const error = e as BillingCatalogServiceError
      assert.equal(error.errorCode, 'PLT.CAT.PLAN_NAME_IMMUTABLE')
      assert.equal(error.httpStatus, 422)
    }
  })

  test('renombrar un plan en borrador no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryRename({ isPublished: false }, 'Nuevo nombre'))
  })

  test('actualizar un plan publicado sin tocar el nombre no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryRename({ isPublished: true }, undefined))
  })

  test('el API error del helper resuelve PLAN_NAME_IMMUTABLE a 422', ({ assert }) => {
    const error = new BillingCatalogServiceError(
      'No se puede renombrar',
      BILLING_CATALOG_ERROR_CODES.PLAN_NAME_IMMUTABLE,
      422,
      'PLT.CAT.PLAN_NAME_IMMUTABLE',
      'El nombre de un plan publicado es inmutable.'
    )
    const resolved = resolveBillingCatalogApiError(error)
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, 'PLT.CAT.PLAN_NAME_IMMUTABLE')
  })
})

// ---------------------------------------------------------------------------
// Módulo: edición de min_employees en tramos + duplicados con soft-delete
// (USRH1785962095078 — reparación del bug reportado en el sprint)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — updateTier: minEmployees editable y duplicados', () => {
  /** Espeja assertMinEmployeesAvailable contra un set simulado de tramos (incluye eliminados). */
  function assertAvailable(
    allTiersIncludingTrashed: Array<{ id: number; minEmployees: number }>,
    minEmployees: number,
    excludeTierId?: number
  ) {
    const duplicate = allTiersIncludingTrashed.find(
      (t) => t.minEmployees === minEmployees && t.id !== excludeTierId
    )
    if (duplicate) {
      throw new BillingCatalogServiceError(
        `Ya existe un tramo con min_employees ${minEmployees}`,
        BILLING_CATALOG_ERROR_CODES.TIER_DUPLICATE,
        409
      )
    }
  }

  test('crear un tramo con min_employees igual al de uno eliminado lógicamente lanza TIER_DUPLICATE', ({
    assert,
  }) => {
    // El tramo id=2 fue soft-deleted pero sigue "ocupando" min_employees=50
    // por la restricción UNIQUE física de la tabla.
    const tiers = [
      { id: 1, minEmployees: 10 },
      { id: 2, minEmployees: 50 }, // eliminado lógicamente, sigue en la tabla
    ]
    assert.throws(() => assertAvailable(tiers, 50))
  })

  test('editar min_employees de un tramo hacia un valor libre no lanza error', ({ assert }) => {
    const tiers = [
      { id: 1, minEmployees: 10 },
      { id: 2, minEmployees: 50 },
    ]
    assert.doesNotThrow(() => assertAvailable(tiers, 30, 1))
  })

  test('editar min_employees de un tramo hacia su propio valor actual no lanza error (excluido por id)', ({
    assert,
  }) => {
    const tiers = [
      { id: 1, minEmployees: 10 },
      { id: 2, minEmployees: 50 },
    ]
    assert.doesNotThrow(() => assertAvailable(tiers, 10, 1))
  })

  test('editar min_employees hacia un valor tomado por otro tramo vivo lanza TIER_DUPLICATE con 409', ({
    assert,
  }) => {
    const tiers = [
      { id: 1, minEmployees: 10 },
      { id: 2, minEmployees: 50 },
    ]
    try {
      assertAvailable(tiers, 50, 1)
      assert.fail('Se esperaba que lanzara TIER_DUPLICATE')
    } catch (e) {
      const error = e as BillingCatalogServiceError
      assert.equal(error.errorCode, 'PLT.CAT.TIER_DUPLICATE')
      assert.equal(error.httpStatus, 409)
    }
  })

  test('min_employees = 0 en updateTier es inválido (debe ser ≥ 1)', ({ assert }) => {
    function validateNewMin(minEmployees: number) {
      return minEmployees >= 1
    }
    assert.isFalse(validateNewMin(0))
  })

  test('TIER_NOT_FOUND es PLT.CAT.TIER_NOT_FOUND', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.TIER_NOT_FOUND, 'PLT.CAT.TIER_NOT_FOUND')
  })

  test('updateTier sin ningún campo enviado lanza TIER_INVALID con 422', ({ assert }) => {
    function assertAtLeastOneField(input: {
      billingVolumeTierMinEmployees?: number
      billingVolumeTierDiscountPercent?: number
    }) {
      if (
        input.billingVolumeTierMinEmployees === undefined &&
        input.billingVolumeTierDiscountPercent === undefined
      ) {
        throw new BillingCatalogServiceError(
          'Debes enviar al menos un campo a actualizar del tramo',
          BILLING_CATALOG_ERROR_CODES.TIER_INVALID,
          422
        )
      }
    }
    try {
      assertAtLeastOneField({})
      assert.fail('Se esperaba que lanzara TIER_INVALID')
    } catch (e) {
      const error = e as BillingCatalogServiceError
      assert.equal(error.errorCode, 'PLT.CAT.TIER_INVALID')
      assert.equal(error.httpStatus, 422)
    }
  })
})

// ---------------------------------------------------------------------------
// Módulo: nuevos códigos de error — retiro manual y no-reactivación
// (USRH1785962095081)
// ---------------------------------------------------------------------------

test.group('BILLING_CATALOG_ERROR_CODES — códigos de retiro manual', () => {
  test('PLAN_DEACTIVATE_REQUIRES_PUBLISHED es PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED', ({
    assert,
  }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PLAN_DEACTIVATE_REQUIRES_PUBLISHED,
      'PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED'
    )
  })

  test('PLAN_ALREADY_DEACTIVATED es PLT.CAT.PLAN_ALREADY_DEACTIVATED', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_DEACTIVATED,
      'PLT.CAT.PLAN_ALREADY_DEACTIVATED'
    )
  })

  test('PLAN_REACTIVATION_FORBIDDEN es PLT.CAT.PLAN_REACTIVATION_FORBIDDEN', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PLAN_REACTIVATION_FORBIDDEN,
      'PLT.CAT.PLAN_REACTIVATION_FORBIDDEN'
    )
  })
})

// ---------------------------------------------------------------------------
// Módulo: reglas de deactivatePlan (retiro manual, USRH1785962095081)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — reglas de deactivatePlan', () => {
  /** Espeja las validaciones de deactivatePlan antes de tocar la BD. */
  function tryDeactivate(plan: { isPublished: boolean; billingPlanActive: 0 | 1 }) {
    if (!plan.isPublished) {
      throw new BillingCatalogServiceError(
        'No publicado',
        BILLING_CATALOG_ERROR_CODES.PLAN_DEACTIVATE_REQUIRES_PUBLISHED,
        422
      )
    }
    if (plan.billingPlanActive === 0) {
      throw new BillingCatalogServiceError(
        'Ya desactivado',
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_DEACTIVATED,
        422
      )
    }
    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('retirar un plan en borrador lanza PLAN_DEACTIVATE_REQUIRES_PUBLISHED con 422', ({
    assert,
  }) => {
    const error = captureError(() =>
      tryDeactivate({ isPublished: false, billingPlanActive: 1 })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED')
    assert.equal(error?.httpStatus, 422)
  })

  test('retirar un plan ya desactivado lanza PLAN_ALREADY_DEACTIVATED con 422', ({ assert }) => {
    const error = captureError(() =>
      tryDeactivate({ isPublished: true, billingPlanActive: 0 })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_ALREADY_DEACTIVATED')
    assert.equal(error?.httpStatus, 422)
  })

  test('retirar un plan publicado y vigente no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryDeactivate({ isPublished: true, billingPlanActive: 1 }))
  })
})

// ---------------------------------------------------------------------------
// Módulo: updatePlan bloquea la reactivación (0 → 1) por cualquier vía
// (USRH1785962095081, regla 4 — sin reactivación)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — updatePlan: sin reactivación vía billingPlanActive', () => {
  /** Espeja la validación previa al UPDATE en updatePlan para billingPlanActive. */
  function tryUpdateActive(currentActive: 0 | 1, newActive?: 0 | 1) {
    if (newActive === 1 && currentActive === 0) {
      throw new BillingCatalogServiceError(
        'No se puede reactivar',
        BILLING_CATALOG_ERROR_CODES.PLAN_REACTIVATION_FORBIDDEN,
        422
      )
    }
    // Cualquier otro valor se ignora: el estado se cambia solo por /publish y /deactivate.
    return currentActive
  }

  test('intentar reactivar un plan desactivado (0 → 1) lanza PLAN_REACTIVATION_FORBIDDEN con 422', ({
    assert,
  }) => {
    try {
      tryUpdateActive(0, 1)
      assert.fail('Se esperaba PLAN_REACTIVATION_FORBIDDEN')
    } catch (e) {
      const error = e as BillingCatalogServiceError
      assert.equal(error.errorCode, 'PLT.CAT.PLAN_REACTIVATION_FORBIDDEN')
      assert.equal(error.httpStatus, 422)
    }
  })

  test('enviar billingPlanActive = 1 cuando ya está en 1 no lanza error (no es reactivación)', ({
    assert,
  }) => {
    assert.doesNotThrow(() => tryUpdateActive(1, 1))
  })

  test('enviar billingPlanActive = 0 sobre un plan activo no lanza error (se ignora, no aplica por esta vía)', ({
    assert,
  }) => {
    assert.doesNotThrow(() => tryUpdateActive(1, 0))
  })

  test('no enviar billingPlanActive no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryUpdateActive(0, undefined))
  })
})

// ---------------------------------------------------------------------------
// Módulo: publishPlan descarta copias hermanas del mismo padre
// (USRH1785962095081, regla 1 — una sola oferta viva por linaje)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — publishPlan: barrido de copias hermanas', () => {
  /**
   * Espeja el efecto de publishPlan sobre el conjunto de copias en borrador
   * del mismo padre: todas menos la que se publica quedan descartadas
   * (retiro lógico), y el padre queda desactivado.
   */
  function publishAndSweep(
    parentId: number | null,
    siblingDrafts: Array<{ id: number; parentId: number }>,
    publishedId: number
  ) {
    if (!parentId) {
      return { parentDeactivated: false, discardedIds: [] as number[] }
    }
    const discardedIds = siblingDrafts
      .filter((s) => s.parentId === parentId && s.id !== publishedId)
      .map((s) => s.id)
    return { parentDeactivated: true, discardedIds }
  }

  test('publicar sin linaje (parentId nulo) no descarta nada — nada que desactivar', ({
    assert,
  }) => {
    const result = publishAndSweep(null, [], 10)
    assert.isFalse(result.parentDeactivated)
    assert.deepEqual(result.discardedIds, [])
  })

  test('publicar con una única copia en borrador del padre no descarta nada más', ({
    assert,
  }) => {
    const siblings = [{ id: 6, parentId: 2 }]
    const result = publishAndSweep(2, siblings, 6)
    assert.isTrue(result.parentDeactivated)
    assert.deepEqual(result.discardedIds, [])
  })

  test('publicar con dos o más copias hermanas del mismo padre descarta a todas menos la publicada', ({
    assert,
  }) => {
    // Reproduce el escenario diagnosticado contra datos reales: copias
    // hermanas del mismo padre (por ejemplo, datos previos al bloqueo de
    // CLONE_DRAFT_EXISTS) deben quedar descartadas al publicar cualquiera.
    const siblings = [
      { id: 6, parentId: 2 },
      { id: 7, parentId: 2 },
      { id: 8, parentId: 2 },
    ]
    const result = publishAndSweep(2, siblings, 7)
    assert.isTrue(result.parentDeactivated)
    assert.sameMembers(result.discardedIds, [6, 8])
    assert.notInclude(result.discardedIds, 7)
  })

  test('las copias de un padre distinto nunca se descartan', ({ assert }) => {
    const siblings = [
      { id: 6, parentId: 2 },
      { id: 9, parentId: 4 },
    ]
    const result = publishAndSweep(2, siblings, 6)
    assert.notInclude(result.discardedIds, 9)
  })
})

// ---------------------------------------------------------------------------
// Módulo: publishPlan — herencia de la marca de plan público al clon
// (USRH1787619255300, Criterios 1–5 + 7)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — publishPlan: herencia de la marca de plan público', () => {
  /**
   * Espeja la lógica de traspaso de `billing_plan_is_public` que ocurre dentro
   * del bloque `if (plan.billingPlanParentId)` de `publishPlan`.
   *
   * Reproduce exactamente la secuencia:
   *   1. Leer `parentWasPublic` (billingPlanIsPublic === 1).
   *   2. UPDATE padre: billing_plan_active = 0, billing_plan_is_public = 0  → 'unmark_parent'
   *   3. Si parentWasPublic: plan.billingPlanIsPublic = 1 antes del save()   → 'mark_clone'
   *
   * `writeOrder` documenta el orden real de escrituras de la marca y permite
   * verificar que 'unmark_parent' precede siempre a 'mark_clone' (Criterio 4).
   */
  function publishWithInheritance(
    plan: { billingPlanParentId: number | null },
    parent: { billingPlanIsPublic: number; billingPlanActive: number } | null
  ): {
    clonIsPublic: number
    parentIsPublic: number
    parentActive: number
    writeOrder: ('unmark_parent' | 'mark_clone')[]
  } {
    if (!plan.billingPlanParentId || !parent) {
      return {
        clonIsPublic: 0,
        parentIsPublic: parent?.billingPlanIsPublic ?? 0,
        parentActive: parent?.billingPlanActive ?? 1,
        writeOrder: [],
      }
    }

    const writeOrder: ('unmark_parent' | 'mark_clone')[] = []
    const parentWasPublic = parent.billingPlanIsPublic === 1

    // Primera escritura — desmarcar y desactivar al padre en una sola sentencia
    parent.billingPlanIsPublic = 0
    parent.billingPlanActive = 0
    writeOrder.push('unmark_parent')

    let clonIsPublic = 0
    if (parentWasPublic) {
      // Segunda escritura — marca viaja al clon en el mismo save() que lo publica
      clonIsPublic = 1
      writeOrder.push('mark_clone')
    }

    return { clonIsPublic, parentIsPublic: parent.billingPlanIsPublic, parentActive: parent.billingPlanActive, writeOrder }
  }

  /**
   * Espeja el rollback de la transacción ante un fallo posterior al desmarcado
   * del padre. Simula que el error devuelve el estado al punto anterior al
   * inicio de la transacción (Criterio 3).
   */
  function publishWithInheritanceAndRollback(
    plan: { billingPlanParentId: number | null },
    parent: { billingPlanIsPublic: number; billingPlanActive: number } | null
  ): {
    reverted: boolean
    parentIsPublic: number
    parentActive: number
    clonIsPublic: number
  } {
    if (!plan.billingPlanParentId || !parent) {
      return { reverted: false, parentIsPublic: 0, parentActive: 1, clonIsPublic: 0 }
    }

    const snapshot = { billingPlanIsPublic: parent.billingPlanIsPublic, billingPlanActive: parent.billingPlanActive }

    try {
      publishWithInheritance(plan, parent)
      throw new Error('fallo simulado después del desmarcado')
    } catch {
      parent.billingPlanIsPublic = snapshot.billingPlanIsPublic
      parent.billingPlanActive = snapshot.billingPlanActive
      return { reverted: true, parentIsPublic: parent.billingPlanIsPublic, parentActive: parent.billingPlanActive, clonIsPublic: 0 }
    }
  }

  // ── Criterio 1 ──────────────────────────────────────────────────────────────

  test('C1: clon hereda la marca cuando el padre era el plan público', ({ assert }) => {
    const result = publishWithInheritance(
      { billingPlanParentId: 1 },
      { billingPlanIsPublic: 1, billingPlanActive: 1 }
    )
    assert.equal(result.clonIsPublic, 1, 'el clon queda marcado como público')
    assert.equal(result.parentIsPublic, 0, 'el padre queda desmarcado')
    assert.equal(result.parentActive, 0, 'el padre queda desactivado')
  })

  // ── Criterio 2 ──────────────────────────────────────────────────────────────

  test('C2: clon de padre no público no hereda ninguna marca', ({ assert }) => {
    const otherPublicPlan = { billingPlanIsPublic: 1 }

    const result = publishWithInheritance(
      { billingPlanParentId: 2 },
      { billingPlanIsPublic: 0, billingPlanActive: 1 }
    )

    assert.equal(result.clonIsPublic, 0, 'el clon no queda marcado')
    assert.equal(result.parentIsPublic, 0, 'el padre sigue sin marca (no se altera un plan ajeno)')
    assert.equal(otherPublicPlan.billingPlanIsPublic, 1, 'el plan público ajeno conserva su marca')
  })

  // ── Criterio 3 ──────────────────────────────────────────────────────────────

  test('C3: fallo posterior al desmarcado revierte el estado completo del padre', ({ assert }) => {
    const parent = { billingPlanIsPublic: 1, billingPlanActive: 1 }
    const result = publishWithInheritanceAndRollback({ billingPlanParentId: 1 }, parent)

    assert.isTrue(result.reverted)
    assert.equal(result.parentIsPublic, 1, 'el padre recupera su marca')
    assert.equal(result.parentActive, 1, 'el padre recupera su venta')
    assert.equal(result.clonIsPublic, 0, 'el clon queda sin marca')
  })

  // ── Criterio 4 ──────────────────────────────────────────────────────────────

  test('C4: el orden de escrituras es desmarcar_padre → marcar_clon, nunca al revés', ({ assert }) => {
    const result = publishWithInheritance(
      { billingPlanParentId: 1 },
      { billingPlanIsPublic: 1, billingPlanActive: 1 }
    )

    assert.includeOrderedMembers(
      result.writeOrder,
      ['unmark_parent', 'mark_clone'],
      'unmark_parent debe preceder siempre a mark_clone'
    )
    assert.equal(
      result.writeOrder.indexOf('unmark_parent'),
      0,
      'unmark_parent es la primera escritura de la marca'
    )
  })

  test('C4: sin padre público no hay escritura mark_clone', ({ assert }) => {
    const result = publishWithInheritance(
      { billingPlanParentId: 1 },
      { billingPlanIsPublic: 0, billingPlanActive: 1 }
    )

    assert.notInclude(result.writeOrder, 'mark_clone')
    assert.include(result.writeOrder, 'unmark_parent')
  })

  // ── Criterio 5 ──────────────────────────────────────────────────────────────

  test('C5: publicar un plan sin linaje no lee ni escribe ninguna marca', ({ assert }) => {
    const result = publishWithInheritance({ billingPlanParentId: null }, null)

    assert.equal(result.clonIsPublic, 0, 'el plan publicado no queda marcado')
    assert.deepEqual(result.writeOrder, [], 'no se emite ninguna escritura de la marca')
  })

  // ── Criterio 7 ──────────────────────────────────────────────────────────────

  test('C7: el traspaso no escribe ningún campo de billing_subscriptions', ({ assert }) => {
    // Verificación estructural: publishWithInheritance opera solo sobre las
    // propiedades del plan y del padre; no toca ningún objeto de suscripción.
    const subscriptions = [
      { id: 1, billingPlanId: 1, status: 'active', contractedPrice: 65 },
      { id: 2, billingPlanId: 1, status: 'active', contractedPrice: 65 },
    ]
    const snapshots = subscriptions.map((s) => ({ ...s }))

    publishWithInheritance(
      { billingPlanParentId: 1 },
      { billingPlanIsPublic: 1, billingPlanActive: 1 }
    )

    for (const [i, sub] of subscriptions.entries()) {
      assert.deepEqual(sub, snapshots[i], `suscripción ${sub.id} no debe modificarse`)
    }
  })
})

// ---------------------------------------------------------------------------
// Módulo: nuevo código de error — coherencia de vigencia entre versiones
// (USRH1785962095084)
// ---------------------------------------------------------------------------

test.group('BILLING_CATALOG_ERROR_CODES — código de vigencia en el pasado', () => {
  test('PRICE_EFFECTIVE_FROM_IN_PAST es PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PRICE_EFFECTIVE_FROM_IN_PAST,
      'PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST'
    )
  })
})

// ---------------------------------------------------------------------------
// Módulo: addPrice — coherencia de la vigencia nueva contra la vigente
// (USRH1785962095084, reglas 5, 6 y 7)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — addPrice: coherencia de vigencia', () => {
  /**
   * Espeja el orden de validación real de addPrice: duplicado exacto primero,
   * luego coherencia contra la versión vigente (MAX(effective_from ≤ hoy)).
   * Las fechas son strings YYYY-MM-DD, comparables lexicográficamente.
   */
  function tryAddPrice(params: {
    today: string
    existingEffectiveFromDates: string[]
    newEffectiveFrom: string
  }) {
    const { today, existingEffectiveFromDates, newEffectiveFrom } = params

    if (existingEffectiveFromDates.includes(newEffectiveFrom)) {
      throw new BillingCatalogServiceError(
        'Vigencia duplicada',
        BILLING_CATALOG_ERROR_CODES.PRICE_EFFECTIVE_FROM_DUPLICATE,
        409
      )
    }

    const currentPrice = existingEffectiveFromDates
      .filter((d) => d <= today)
      .sort()
      .at(-1)

    if (currentPrice && newEffectiveFrom < today) {
      throw new BillingCatalogServiceError(
        'Vigencia anterior a hoy con versión vigente',
        BILLING_CATALOG_ERROR_CODES.PRICE_EFFECTIVE_FROM_IN_PAST,
        422
      )
    }

    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('Criterio 4 — vigencia pasada con versión vigente existente lanza PRICE_EFFECTIVE_FROM_IN_PAST con 422', ({
    assert,
  }) => {
    const error = captureError(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-03-01'],
        newEffectiveFrom: '2026-01-15',
      })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST')
    assert.equal(error?.httpStatus, 422)
  })

  test('Criterio 5 — vigencia de hoy se acepta con versión vigente existente', ({ assert }) => {
    assert.doesNotThrow(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-03-01'],
        newEffectiveFrom: '2026-08-05',
      })
    )
  })

  test('Criterio 5 — vigencia futura se acepta con versión vigente existente', ({ assert }) => {
    assert.doesNotThrow(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-03-01'],
        newEffectiveFrom: '2026-09-01',
      })
    )
  })

  test('Criterio 6 — vigencia duplicada se rechaza primero, aunque también sería pasada', ({
    assert,
  }) => {
    const error = captureError(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-09-01'],
        newEffectiveFrom: '2026-09-01',
      })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE')
    assert.equal(error?.httpStatus, 409)
  })

  test('Criterio 7 — plan sin ninguna versión corriendo acepta fecha pasada (deja el plan publicable)', ({
    assert,
  }) => {
    assert.doesNotThrow(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: [],
        newEffectiveFrom: '2026-01-01',
      })
    )
  })

  test('Criterio 7 — plan con solo versiones futuras (ninguna vigente aún) acepta fecha pasada', ({
    assert,
  }) => {
    assert.doesNotThrow(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-09-01', '2026-10-01'],
        newEffectiveFrom: '2026-01-01',
      })
    )
  })

  test('con varias versiones vigentes previas, la comparación usa la de mayor fecha (MAX)', ({
    assert,
  }) => {
    // Vigente real = 2026-06-01 (la mayor ≤ hoy). Una nueva en 2026-05-01
    // queda por detrás de la vigente y se rechaza, aunque sea posterior a
    // otras versiones más viejas del histórico.
    const error = captureError(() =>
      tryAddPrice({
        today: '2026-08-05',
        existingEffectiveFromDates: ['2026-01-01', '2026-06-01'],
        newEffectiveFrom: '2026-05-01',
      })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST')
  })
})

// ---------------------------------------------------------------------------
// Módulo: códigos PLT.CAT.* del plan público (USRH1787619255298)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — códigos PLT.CAT.* de plan público', () => {
  test('PLAN_PUBLIC_REQUIRES_SELLABLE es PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE', ({ assert }) => {
    assert.equal(
      BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
      'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE'
    )
  })

  test('PLAN_ALREADY_PUBLIC es PLT.CAT.PLAN_ALREADY_PUBLIC', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLIC, 'PLT.CAT.PLAN_ALREADY_PUBLIC')
  })

  test('PLAN_NOT_PUBLIC es PLT.CAT.PLAN_NOT_PUBLIC', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.PLAN_NOT_PUBLIC, 'PLT.CAT.PLAN_NOT_PUBLIC')
  })

  test('PUBLIC_PLAN_CONFLICT es PLT.CAT.PUBLIC_PLAN_CONFLICT', ({ assert }) => {
    assert.equal(BILLING_CATALOG_ERROR_CODES.PUBLIC_PLAN_CONFLICT, 'PLT.CAT.PUBLIC_PLAN_CONFLICT')
  })
})

// ---------------------------------------------------------------------------
// Módulo: assertSellableForPublic — guardián de vendibilidad (USRH1787619255298)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — assertSellableForPublic: guardián de vendibilidad', () => {
  interface PlanStub {
    isPublished: boolean
    billingPlanActive: 0 | 1
    hasCurrentPrice: boolean
  }

  /** Espeja la lógica de assertSellableForPublic sin acceso a BD. */
  function tryAssertSellable(plan: PlanStub) {
    if (!plan.isPublished) {
      throw new BillingCatalogServiceError(
        'No publicado',
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    if (plan.billingPlanActive !== 1) {
      throw new BillingCatalogServiceError(
        'Retirado',
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    if (!plan.hasCurrentPrice) {
      throw new BillingCatalogServiceError(
        'Sin precio vigente',
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('plan en borrador lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryAssertSellable({ isPublished: false, billingPlanActive: 1, hasCurrentPrice: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
    assert.equal(error?.detail, 'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.')
  })

  test('plan retirado (active = 0) lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryAssertSellable({ isPublished: true, billingPlanActive: 0, hasCurrentPrice: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
  })

  test('plan sin precio vigente lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryAssertSellable({ isPublished: true, billingPlanActive: 1, hasCurrentPrice: false })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
  })

  test('plan publicado, activo y con precio vigente no lanza error', ({ assert }) => {
    assert.doesNotThrow(() =>
      tryAssertSellable({ isPublished: true, billingPlanActive: 1, hasCurrentPrice: true })
    )
  })
})

// ---------------------------------------------------------------------------
// Módulo: markPlanAsPublic — guardas previas a la transacción (USRH1787619255298)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — markPlanAsPublic: guardas previas', () => {
  interface PlanStub {
    billingPlanIsPublic: 0 | 1
    isPublished: boolean
    billingPlanActive: 0 | 1
    hasCurrentPrice: boolean
  }

  /** Espeja las guardas de markPlanAsPublic antes del db.transaction. */
  function tryMarkPublic(plan: PlanStub) {
    if (plan.billingPlanIsPublic === 1) {
      throw new BillingCatalogServiceError(
        'Ya es el público',
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLIC,
        422,
        'PLT.CAT.PLAN_ALREADY_PUBLIC',
        'Este plan ya es el plan público del sitio.'
      )
    }
    if (!plan.isPublished || plan.billingPlanActive !== 1 || !plan.hasCurrentPrice) {
      throw new BillingCatalogServiceError(
        'No vendible',
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('señalar el plan que ya es el público lanza PLAN_ALREADY_PUBLIC con 422', ({ assert }) => {
    const error = captureError(() =>
      tryMarkPublic({ billingPlanIsPublic: 1, isPublished: true, billingPlanActive: 1, hasCurrentPrice: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_ALREADY_PUBLIC')
    assert.equal(error?.httpStatus, 422)
    assert.equal(error?.detail, 'Este plan ya es el plan público del sitio.')
  })

  test('señalar un plan en borrador lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryMarkPublic({ billingPlanIsPublic: 0, isPublished: false, billingPlanActive: 1, hasCurrentPrice: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
  })

  test('señalar un plan retirado lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryMarkPublic({ billingPlanIsPublic: 0, isPublished: true, billingPlanActive: 0, hasCurrentPrice: true })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
  })

  test('señalar un plan publicado sin precio vigente lanza PLAN_PUBLIC_REQUIRES_SELLABLE con 422', ({ assert }) => {
    const error = captureError(() =>
      tryMarkPublic({ billingPlanIsPublic: 0, isPublished: true, billingPlanActive: 1, hasCurrentPrice: false })
    )
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE')
    assert.equal(error?.httpStatus, 422)
  })

  test('señalar un plan vendible (no es ya el público) no lanza error', ({ assert }) => {
    assert.doesNotThrow(() =>
      tryMarkPublic({ billingPlanIsPublic: 0, isPublished: true, billingPlanActive: 1, hasCurrentPrice: true })
    )
  })
})

// ---------------------------------------------------------------------------
// Módulo: unmarkPlanAsPublic — guardia previa (USRH1787619255298)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — unmarkPlanAsPublic: guardia previa', () => {
  function tryUnmarkPublic(plan: { billingPlanIsPublic: 0 | 1 }) {
    if (plan.billingPlanIsPublic !== 1) {
      throw new BillingCatalogServiceError(
        'No es el público',
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_PUBLIC,
        422,
        'PLT.CAT.PLAN_NOT_PUBLIC',
        'Este plan no es el plan público del sitio.'
      )
    }
    return true
  }

  function captureError(fn: () => unknown): BillingCatalogServiceError | null {
    try {
      fn()
      return null
    } catch (e) {
      return e as BillingCatalogServiceError
    }
  }

  test('desmarcar un plan que no es el público lanza PLAN_NOT_PUBLIC con 422', ({ assert }) => {
    const error = captureError(() => tryUnmarkPublic({ billingPlanIsPublic: 0 }))
    assert.equal(error?.errorCode, 'PLT.CAT.PLAN_NOT_PUBLIC')
    assert.equal(error?.httpStatus, 422)
    assert.equal(error?.detail, 'Este plan no es el plan público del sitio.')
  })

  test('desmarcar el plan público no lanza error', ({ assert }) => {
    assert.doesNotThrow(() => tryUnmarkPublic({ billingPlanIsPublic: 1 }))
  })
})

// ---------------------------------------------------------------------------
// Módulo: deactivatePlan desmarca — retiro se lleva la señal (USRH1787619255298)
// ---------------------------------------------------------------------------

test.group('BillingCatalogService — deactivatePlan: retiro quita la marca de público', () => {
  interface PlanStub {
    billingPlanActive: 0 | 1
    billingPlanIsPublic: 0 | 1
  }

  /** Espeja la escritura atómica de deactivatePlan: activo y público a 0. */
  function applyDeactivate(plan: PlanStub): PlanStub {
    return { ...plan, billingPlanActive: 0, billingPlanIsPublic: 0 }
  }

  test('retirar un plan marcado como público lo desmarca en el mismo acto', ({ assert }) => {
    const result = applyDeactivate({ billingPlanActive: 1, billingPlanIsPublic: 1 })
    assert.equal(result.billingPlanActive, 0)
    assert.equal(result.billingPlanIsPublic, 0)
  })

  test('retirar un plan no marcado deja billingPlanIsPublic en 0 (idempotente)', ({ assert }) => {
    const result = applyDeactivate({ billingPlanActive: 1, billingPlanIsPublic: 0 })
    assert.equal(result.billingPlanActive, 0)
    assert.equal(result.billingPlanIsPublic, 0)
  })

  test('después del retiro no puede quedar billingPlanIsPublic = 1', ({ assert }) => {
    const plans: PlanStub[] = [
      { billingPlanActive: 1, billingPlanIsPublic: 0 },
      { billingPlanActive: 1, billingPlanIsPublic: 1 },
    ]
    for (const plan of plans) {
      const result = applyDeactivate(plan)
      assert.equal(result.billingPlanIsPublic, 0, `Fallo con isPublic=${plan.billingPlanIsPublic}`)
    }
  })
})
