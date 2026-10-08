export const BILLING_PAYMENT_FAILURE_REASONS = [
  'card_declined',
  'insufficient_funds',
  'expired_card',
  'authentication_required',
  'other',
] as const

export type BillingPaymentFailureReason = (typeof BILLING_PAYMENT_FAILURE_REASONS)[number]

const CARD_DECLINE_CODES = new Set([
  'generic_decline',
  'do_not_honor',
  'lost_card',
  'stolen_card',
  'fraudulent',
  'pickup_card',
  'merchant_blacklist',
  'security_violation',
])

export interface PaymentFailureSignal {
  code: string | null
  declineCode: string | null
  intentStatus: string | null
}

export function isBillingPaymentFailureReason(
  value: string | null
): value is BillingPaymentFailureReason {
  if (value === null) {
    return false
  }
  return (BILLING_PAYMENT_FAILURE_REASONS as readonly string[]).includes(value)
}

/** Pura; precedencia de arriba abajo (Regla 8); nunca devuelve el código crudo. */
export function normalizePaymentFailure(signal: PaymentFailureSignal): BillingPaymentFailureReason {
  const { code, declineCode, intentStatus } = signal

  if (declineCode === 'insufficient_funds') {
    return 'insufficient_funds'
  }

  if (code === 'expired_card' || declineCode === 'expired_card') {
    return 'expired_card'
  }

  if (
    code === 'authentication_required' ||
    declineCode === 'authentication_required' ||
    intentStatus === 'requires_action'
  ) {
    return 'authentication_required'
  }

  if (code === 'card_declined') {
    return 'card_declined'
  }

  if (declineCode !== null && CARD_DECLINE_CODES.has(declineCode)) {
    return 'card_declined'
  }

  return 'other'
}
