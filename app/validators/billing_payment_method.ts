import vine from '@vinejs/vine'

/**
 * Body para `POST /api/billing/subscription/payment-method` (USRH1790708507752).
 */
export const setDefaultPaymentMethodValidator = vine.compile(
  vine.object({
    setupIntentId: vine.string().regex(/^seti_[A-Za-z0-9_]+$/),
  })
)
