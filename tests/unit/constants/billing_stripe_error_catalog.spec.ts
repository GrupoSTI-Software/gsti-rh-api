import { test } from '@japa/runner'
import {
  BILLING_STRIPE_ERROR_ENTRIES,
  resolveStripeErrorEntry,
  STRIPE_DECLINE_CODES,
  STRIPE_SENSITIVE_DECLINE_CODES,
} from '#constants/billing_stripe_error_catalog'
import { STRIPE_CODE_ENTRY, STRIPE_DECLINE_CODE_ENTRY } from '#constants/billing_stripe_error_codes'

const SNAKE_CASE = /[a-z]+_[a-z0-9_]+/

test.group('billing_stripe_error_catalog (VLRH-H1791925350337)', () => {
  test('CA-1: insufficient_funds → tarjeta-sin-fondos-suficientes 422', ({ assert }) => {
    const resolved = resolveStripeErrorEntry({
      rawType: 'card_error',
      code: 'card_declined',
      declineCode: 'insufficient_funds',
      errorClass: null,
    })
    assert.equal(resolved.httpStatus, 422)
    assert.equal(resolved.entry.key, 'tarjeta-sin-fondos-suficientes')
    assert.equal(resolved.entry.title, 'La tarjeta no tiene fondos suficientes')
    assert.isFalse(resolved.catalogMiss)
  })

  test('CA-2: decline sensibles → tarjeta-rechazada-por-el-banco', ({ assert }) => {
    for (const declineCode of STRIPE_SENSITIVE_DECLINE_CODES) {
      const resolved = resolveStripeErrorEntry({
        rawType: 'card_error',
        code: 'card_declined',
        declineCode,
        errorClass: null,
      })
      assert.equal(
        resolved.entry.key,
        'tarjeta-rechazada-por-el-banco',
        declineCode
      )
    }
  })

  test('CA-3: charge_exceeds_transaction_limit → cobro-restringido valanserh', ({ assert }) => {
    const resolved = resolveStripeErrorEntry({
      rawType: 'invalid_request_error',
      code: 'charge_exceeds_transaction_limit',
      declineCode: null,
      errorClass: null,
    })
    assert.equal(resolved.entry.key, 'cobro-restringido-por-el-procesador')
    assert.equal(resolved.entry.action, 'valanserh')
    assert.equal(resolved.httpStatus, 500)
  })

  test('CA-5: card_error desconocido → genérico 422 catalogMiss', ({ assert }) => {
    const resolved = resolveStripeErrorEntry({
      rawType: 'card_error',
      code: 'codigo_inventado',
      declineCode: 'otro_inventado',
      errorClass: null,
    })
    assert.equal(resolved.httpStatus, 422)
    assert.equal(resolved.entry.key, 'tarjeta-rechazada-por-el-banco')
    assert.isTrue(resolved.catalogMiss)
  })

  test('CA-6: decline vacío y expired_card → tarjeta-vencida', ({ assert }) => {
    const resolved = resolveStripeErrorEntry({
      rawType: 'card_error',
      code: 'expired_card',
      declineCode: '',
      errorClass: null,
    })
    assert.equal(resolved.entry.key, 'tarjeta-vencida')
  })

  test('CA-7: mapas completos y textos sin snake_case de Stripe', ({ assert }) => {
    const entryKeys = new Set<string>()
    for (const entry of Object.values(BILLING_STRIPE_ERROR_ENTRIES)) {
      assert.isAbove(entry.title.trim().length, 0)
      assert.isAbove(entry.detail.trim().length, 0)
      assert.notMatch(entry.title, SNAKE_CASE)
      assert.notMatch(entry.detail, SNAKE_CASE)
      assert.isFalse(entryKeys.has(entry.key), `key duplicada ${entry.key}`)
      entryKeys.add(entry.key)
    }

    for (const [code, key] of Object.entries(STRIPE_CODE_ENTRY)) {
      assert.property(BILLING_STRIPE_ERROR_ENTRIES, key, `code ${code}`)
    }

    for (const declineCode of STRIPE_DECLINE_CODES) {
      const key = STRIPE_DECLINE_CODE_ENTRY[declineCode]
      assert.property(BILLING_STRIPE_ERROR_ENTRIES, key, `decline ${declineCode}`)
    }
  })
})
