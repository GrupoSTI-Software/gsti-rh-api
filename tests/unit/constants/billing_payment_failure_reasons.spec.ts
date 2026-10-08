import { test } from '@japa/runner'
import {
  BILLING_PAYMENT_FAILURE_REASONS,
  isBillingPaymentFailureReason,
  normalizePaymentFailure,
} from '#constants/billing_payment_failure_reasons'

test.group('billing_payment_failure_reasons (9026 / CA-7)', () => {
  test('precedencia y agrupación de códigos Stripe', ({ assert }) => {
    assert.equal(
      normalizePaymentFailure({
        code: 'card_declined',
        declineCode: 'insufficient_funds',
        intentStatus: 'requires_action',
      }),
      'insufficient_funds'
    )
    assert.equal(
      normalizePaymentFailure({
        code: 'expired_card',
        declineCode: null,
        intentStatus: 'requires_payment_method',
      }),
      'expired_card'
    )
    assert.equal(
      normalizePaymentFailure({
        code: 'card_declined',
        declineCode: 'expired_card',
        intentStatus: 'requires_payment_method',
      }),
      'expired_card'
    )
    assert.equal(
      normalizePaymentFailure({
        code: 'card_declined',
        declineCode: 'generic_decline',
        intentStatus: 'requires_action',
      }),
      'authentication_required'
    )
    assert.equal(
      normalizePaymentFailure({
        code: 'authentication_required',
        declineCode: null,
        intentStatus: 'requires_payment_method',
      }),
      'authentication_required'
    )

    for (const declineCode of [
      'fraudulent',
      'lost_card',
      'stolen_card',
      'pickup_card',
      'merchant_blacklist',
      'security_violation',
      'do_not_honor',
    ] as const) {
      assert.equal(
        normalizePaymentFailure({
          code: 'card_declined',
          declineCode,
          intentStatus: 'requires_payment_method',
        }),
        'card_declined'
      )
    }

    assert.equal(
      normalizePaymentFailure({
        code: null,
        declineCode: 'stolen_card',
        intentStatus: null,
      }),
      'card_declined'
    )
    assert.equal(
      normalizePaymentFailure({
        code: 'processing_error',
        declineCode: null,
        intentStatus: 'requires_payment_method',
      }),
      'other'
    )
    assert.equal(
      normalizePaymentFailure({
        code: null,
        declineCode: 'try_again_later',
        intentStatus: null,
      }),
      'other'
    )
    assert.equal(
      normalizePaymentFailure({ code: null, declineCode: null, intentStatus: null }),
      'other'
    )
  })

  test('catálogo cerrado de cinco motivos', ({ assert }) => {
    assert.lengthOf(BILLING_PAYMENT_FAILURE_REASONS, 5)
    assert.isFalse(isBillingPaymentFailureReason('fraudulent'))
    assert.isTrue(isBillingPaymentFailureReason('other'))
  })
})
