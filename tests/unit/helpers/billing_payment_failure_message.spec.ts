import { test } from '@japa/runner'
import {
  resolvePaymentFailureMessage,
  shouldNotifyAccountIssue,
  type LastPaymentFailureOutcome,
} from '#helpers/billing_payment_failure_message'
import { BILLING_STRIPE_ERROR_ENTRIES } from '#constants/billing_stripe_error_catalog'

test.group('billing_payment_failure_message (VLRH-H1791925352373)', () => {
  test('sin códigos devuelve null', ({ assert }) => {
    assert.isNull(resolvePaymentFailureMessage({ code: null, declineCode: null }))
    assert.isNull(resolvePaymentFailureMessage({ code: '', declineCode: '' }))
  })

  test('card_velocity_exceeded → tarjeta-sin-fondos-suficientes tenant', ({ assert }) => {
    const resolved = resolvePaymentFailureMessage({
      code: 'card_declined',
      declineCode: 'card_velocity_exceeded',
    })
    assert.isNotNull(resolved)
    assert.equal(resolved!.key, 'tarjeta-sin-fondos-suficientes')
    assert.equal(resolved!.action, 'tenant')
    assert.isFalse(resolved!.catalogMiss)
  })

  test('charge_exceeds_transaction_limit → valanserh y soporte Stripe', ({ assert }) => {
    const resolved = resolvePaymentFailureMessage({
      code: 'charge_exceeds_transaction_limit',
      declineCode: null,
    })
    assert.isNotNull(resolved)
    assert.equal(resolved!.key, 'cobro-restringido-por-el-procesador')
    assert.equal(resolved!.action, 'valanserh')
    assert.isTrue(resolved!.resolvedByStripeSupport)
  })

  test('account_invalid → valanserh sin soporte Stripe', ({ assert }) => {
    const resolved = resolvePaymentFailureMessage({
      code: 'account_invalid',
      declineCode: null,
    })
    assert.isNotNull(resolved)
    assert.equal(resolved!.action, 'valanserh')
    assert.isFalse(resolved!.resolvedByStripeSupport)
  })

  test('código desconocido → tenant catalogMiss', ({ assert }) => {
    const resolved = resolvePaymentFailureMessage({
      code: 'codigo_que_no_existe',
      declineCode: null,
    })
    assert.isNotNull(resolved)
    assert.equal(resolved!.key, 'tarjeta-rechazada-por-el-banco')
    assert.equal(resolved!.action, 'tenant')
    assert.isTrue(resolved!.catalogMiss)
  })

  test('stolen_card → genérico tenant', ({ assert }) => {
    const resolved = resolvePaymentFailureMessage({
      code: 'card_declined',
      declineCode: 'stolen_card',
    })
    assert.isNotNull(resolved)
    assert.equal(resolved!.key, 'tarjeta-rechazada-por-el-banco')
    assert.equal(resolved!.action, 'tenant')
  })

  test('shouldNotifyAccountIssue dedupe por factura y código', ({ assert }) => {
    const valanserh = resolvePaymentFailureMessage({
      code: 'charge_exceeds_transaction_limit',
      declineCode: null,
    })!

    const appliedFirst: LastPaymentFailureOutcome = { applied: true, previous: null }
    assert.isTrue(
      shouldNotifyAccountIssue(
        appliedFirst,
        { invoiceRef: 'in_F', code: 'charge_exceeds_transaction_limit' },
        valanserh
      )
    )

    const sameRetry: LastPaymentFailureOutcome = {
      applied: true,
      previous: {
        invoiceRef: 'in_F',
        code: 'charge_exceeds_transaction_limit',
      },
    }
    assert.isFalse(
      shouldNotifyAccountIssue(
        sameRetry,
        { invoiceRef: 'in_F', code: 'charge_exceeds_transaction_limit' },
        valanserh
      )
    )

    const newInvoice: LastPaymentFailureOutcome = {
      applied: true,
      previous: { invoiceRef: 'in_F', code: 'charge_exceeds_transaction_limit' },
    }
    assert.isTrue(
      shouldNotifyAccountIssue(
        newInvoice,
        { invoiceRef: 'in_G', code: 'charge_exceeds_transaction_limit' },
        valanserh
      )
    )

    const newCode: LastPaymentFailureOutcome = {
      applied: true,
      previous: { invoiceRef: 'in_G', code: 'charge_exceeds_transaction_limit' },
    }
    assert.isTrue(
      shouldNotifyAccountIssue(
        newCode,
        { invoiceRef: 'in_G', code: 'charge_exceeds_source_limit' },
        resolvePaymentFailureMessage({
          code: 'charge_exceeds_source_limit',
          declineCode: null,
        })
      )
    )

    const tenant = resolvePaymentFailureMessage({
      code: 'card_declined',
      declineCode: 'insufficient_funds',
    })!
    assert.isFalse(
      shouldNotifyAccountIssue(
        appliedFirst,
        { invoiceRef: 'in_F', code: 'card_declined' },
        tenant
      )
    )
  })

  test('entrada catalogada tiene título y detalle', ({ assert }) => {
    const sample = resolvePaymentFailureMessage({
      code: 'card_declined',
      declineCode: 'insufficient_funds',
    })
    assert.isNotNull(sample)
    assert.isAbove(sample!.title.length, 0)
    assert.isAbove(sample!.detail.length, 0)
    assert.equal(
      sample!.title,
      BILLING_STRIPE_ERROR_ENTRIES['tarjeta-sin-fondos-suficientes'].title
    )
  })
})
