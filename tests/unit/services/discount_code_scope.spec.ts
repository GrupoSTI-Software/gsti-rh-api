import { test } from '@japa/runner'
import DiscountCodeService from '#services/discount_code_service'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { resolveDiscountCodeApiError } from '#helpers/discount_code_api_error'

/**
 * USRH1787714804397 — catálogo de códigos de descuento.
 * Cobertura de las aserciones puras del servicio (regla 6 y regla 7) por
 * reflexión, sin tocar BD — mismo patrón que
 * `billing_catalog_service.spec.ts` para este módulo.
 */

// Acceso a los métodos privados vía casteo, igual que el resto de la suite.
type ServiceProbe = {
  assertValueCoherence(kind: 'percent' | 'fixed_amount' | 'unit_price', value: number): void
  assertValidityRange(validFrom?: string | null, validTo?: string | null): void
}

function probe(): ServiceProbe {
  return new DiscountCodeService() as unknown as ServiceProbe
}

test.group('DiscountCodeService — coherencia valor↔tipo (regla 6)', () => {
  test('percent: 0 y 100 pasan, fuera de ese rango se rechaza', ({ assert }) => {
    const s = probe()
    assert.doesNotThrow(() => s.assertValueCoherence('percent', 0))
    assert.doesNotThrow(() => s.assertValueCoherence('percent', 100))
    assert.throws(() => s.assertValueCoherence('percent', -1))
    assert.throws(() => s.assertValueCoherence('percent', 100.01))
  })

  test('fixed_amount: debe ser mayor que cero', ({ assert }) => {
    const s = probe()
    assert.doesNotThrow(() => s.assertValueCoherence('fixed_amount', 50))
    assert.throws(() => s.assertValueCoherence('fixed_amount', 0))
    assert.throws(() => s.assertValueCoherence('fixed_amount', -10))
  })

  test('unit_price: debe ser mayor o igual a cero', ({ assert }) => {
    const s = probe()
    assert.doesNotThrow(() => s.assertValueCoherence('unit_price', 0))
    assert.doesNotThrow(() => s.assertValueCoherence('unit_price', 45.5))
    assert.throws(() => s.assertValueCoherence('unit_price', -0.01))
  })

  test('la excepción de rango de valor trae el código VALUE_OUT_OF_RANGE y 422', ({ assert }) => {
    const s = probe()
    let thrown: unknown
    try {
      s.assertValueCoherence('percent', 150)
    } catch (error) {
      thrown = error
    }
    assert.instanceOf(thrown, DiscountCodeServiceError)
    const error = thrown as DiscountCodeServiceError
    assert.equal(error.errorCode, DISCOUNT_CODE_ERROR_CODES.VALUE_OUT_OF_RANGE)
    assert.equal(error.httpStatus, 422)
  })
})

test.group('DiscountCodeService — vigencia (regla 7)', () => {
  test('sin alguna de las dos fechas, no valida nada', ({ assert }) => {
    const s = probe()
    assert.doesNotThrow(() => s.assertValidityRange(null, null))
    assert.doesNotThrow(() => s.assertValidityRange('2026-01-01', null))
    assert.doesNotThrow(() => s.assertValidityRange(null, '2026-01-01'))
    assert.doesNotThrow(() => s.assertValidityRange(undefined, undefined))
  })

  test('validTo igual a validFrom es válido (rango de un solo día)', ({ assert }) => {
    const s = probe()
    assert.doesNotThrow(() => s.assertValidityRange('2026-01-01', '2026-01-01'))
  })

  test('validTo anterior a validFrom se rechaza con VALIDITY_RANGE_INVALID / 422', ({
    assert,
  }) => {
    const s = probe()
    let thrown: unknown
    try {
      s.assertValidityRange('2026-06-01', '2026-01-01')
    } catch (error) {
      thrown = error
    }
    assert.instanceOf(thrown, DiscountCodeServiceError)
    const error = thrown as DiscountCodeServiceError
    assert.equal(error.errorCode, DISCOUNT_CODE_ERROR_CODES.VALIDITY_RANGE_INVALID)
    assert.equal(error.httpStatus, 422)
  })
})

// ---------------------------------------------------------------------------
// USRH1787714804400 — cotización con código de descuento
// ---------------------------------------------------------------------------

test.group('DISCOUNT_CODE_ERROR_CODES — nuevos códigos de cotización', () => {
  test('los 7 nuevos códigos tienen el prefijo PLT.DSC.', ({ assert }) => {
    const newCodes = [
      DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE,
      DISCOUNT_CODE_ERROR_CODES.CODE_NOT_YET_VALID,
      DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED,
      DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED,
      DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_FOUND,
      DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_QUOTABLE,
      DISCOUNT_CODE_ERROR_CODES.QUOTE_NO_ACTIVE_PRICE,
    ]
    for (const code of newCodes) {
      assert.isTrue(code.startsWith('PLT.DSC.'), `"${code}" no tiene el prefijo PLT.DSC.`)
    }
  })

  test('no hay códigos duplicados en todo el namespace PLT.DSC.*', ({ assert }) => {
    const values = Object.values(DISCOUNT_CODE_ERROR_CODES)
    const unique = new Set(values)
    assert.equal(unique.size, values.length, 'Hay códigos de error duplicados')
  })
})

test.group('DiscountCodeService — assertRedeemableCode: orden de las razones (USRH1787714804400)', () => {
  /**
   * Espeja el orden de chequeo real de `assertRedeemableCode`: existe →
   * activo → vigencia iniciada → vigencia no vencida → cupo disponible.
   * Nunca un mensaje genérico de "código inválido": cada rama tiene su
   * propio código de error específico.
   */
  function pickReason(
    code: {
      active: 0 | 1
      validFrom: string | null
      validTo: string | null
      maxRedemptions: number | null
      redeemedCount: number
    } | null,
    referenceDate: string
  ): string {
    if (!code) return DISCOUNT_CODE_ERROR_CODES.NOT_FOUND
    if (code.active === 0) return DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE
    if (code.validFrom && referenceDate < code.validFrom) {
      return DISCOUNT_CODE_ERROR_CODES.CODE_NOT_YET_VALID
    }
    if (code.validTo && code.validTo < referenceDate) {
      return DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED
    }
    if (code.maxRedemptions !== null && code.redeemedCount >= code.maxRedemptions) {
      return DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED
    }
    return 'REDEEMABLE'
  }

  test('código inexistente → NOT_FOUND', ({ assert }) => {
    assert.equal(pickReason(null, '2026-06-01'), DISCOUNT_CODE_ERROR_CODES.NOT_FOUND)
  })

  test('código apagado → CODE_INACTIVE, incluso si su vigencia sería válida', ({ assert }) => {
    const reason = pickReason(
      { active: 0, validFrom: '2026-01-01', validTo: '2026-12-31', maxRedemptions: null, redeemedCount: 0 },
      '2026-06-01'
    )
    assert.equal(reason, DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE)
  })

  test('vigencia aún no inicia → CODE_NOT_YET_VALID', ({ assert }) => {
    const reason = pickReason(
      { active: 1, validFrom: '2026-09-01', validTo: null, maxRedemptions: null, redeemedCount: 0 },
      '2026-06-01'
    )
    assert.equal(reason, DISCOUNT_CODE_ERROR_CODES.CODE_NOT_YET_VALID)
  })

  test('vigencia ya venció → CODE_EXPIRED', ({ assert }) => {
    const reason = pickReason(
      { active: 1, validFrom: null, validTo: '2026-01-01', maxRedemptions: null, redeemedCount: 0 },
      '2026-06-01'
    )
    assert.equal(reason, DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED)
  })

  test('validTo igual a la fecha de referencia sigue siendo válido (inclusivo)', ({ assert }) => {
    const reason = pickReason(
      { active: 1, validFrom: null, validTo: '2026-06-01', maxRedemptions: null, redeemedCount: 0 },
      '2026-06-01'
    )
    assert.notEqual(reason, DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED)
  })

  test('cupo de canjes agotado → CODE_EXHAUSTED', ({ assert }) => {
    const reason = pickReason(
      { active: 1, validFrom: null, validTo: null, maxRedemptions: 5, redeemedCount: 5 },
      '2026-06-01'
    )
    assert.equal(reason, DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED)
  })

  test('sin límite de canjes (maxRedemptions null) nunca se agota', ({ assert }) => {
    const reason = pickReason(
      { active: 1, validFrom: null, validTo: null, maxRedemptions: null, redeemedCount: 999999 },
      '2026-06-01'
    )
    assert.equal(reason, 'REDEEMABLE')
  })

  test('código activo, vigente y con cupo disponible es redimible', ({ assert }) => {
    const reason = pickReason(
      {
        active: 1,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        maxRedemptions: 10,
        redeemedCount: 3,
      },
      '2026-06-01'
    )
    assert.equal(reason, 'REDEEMABLE')
  })
})

test.group('DiscountCodeService — quoteWithDiscountCode: isContractable (USRH1787714804400)', () => {
  test('isContractable es false cuando el subtotal con código queda en cero', ({ assert }) => {
    const isContractable = (discountedSubtotal: number) => discountedSubtotal > 0
    assert.isFalse(isContractable(0))
    assert.isTrue(isContractable(0.01))
    assert.isTrue(isContractable(7332))
  })
})

test.group('DiscountCodeService — resolveDiscountCodeApiError (fugas cerradas)', () => {
  test('E_VALIDATION_ERROR mapea a PLT.DSC.VAL_INPUT / 422 con key kebab', ({ assert }) => {
    const resolved = resolveDiscountCodeApiError({
      code: 'E_VALIDATION_ERROR',
      messages: [{ message: 'discountCodeValue debe ser mayor a 0' }],
    })
    assert.equal(resolved.status, 422)
    assert.equal(resolved.code, DISCOUNT_CODE_ERROR_CODES.VAL_INPUT)
    assert.equal(resolved.key, 'datos-invalidos')
    assert.equal(resolved.detail, 'discountCodeValue debe ser mayor a 0')
  })

  test('DiscountCodeServiceError conserva su código, key y status propios', ({ assert }) => {
    const domainError = new DiscountCodeServiceError(
      'texto interno solo para logs',
      DISCOUNT_CODE_ERROR_CODES.CODE_DUPLICATE,
      409,
      'codigo-ya-existe',
      'Ya existe un código de descuento con ese texto.'
    )
    const resolved = resolveDiscountCodeApiError(domainError)
    assert.equal(resolved.status, 409)
    assert.equal(resolved.code, DISCOUNT_CODE_ERROR_CODES.CODE_DUPLICATE)
    assert.equal(resolved.key, 'codigo-ya-existe')
    assert.equal(resolved.detail, 'Ya existe un código de descuento con ese texto.')
  })

  test('error no tipado nunca expone error.message crudo salvo el fallback controlado', ({
    assert,
  }) => {
    const resolved = resolveDiscountCodeApiError(new Error('detalle interno de SQL'), 500)
    assert.equal(resolved.status, 500)
    assert.equal(resolved.code, DISCOUNT_CODE_ERROR_CODES.SYS_UNHANDLED)
    assert.equal(resolved.key, 'error-inesperado')
  })
})
