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
