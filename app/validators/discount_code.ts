import vine from '@vinejs/vine'

/** Body para `POST /api/platform/billing/discount-codes`. */
export const createDiscountCodeValidator = vine.compile(
  vine.object({
    discountCodeCode: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(40)
      .regex(/^[A-Za-z0-9._-]+$/),
    discountCodeName: vine.string().trim().minLength(1).maxLength(160),
    discountCodeKind: vine.enum(['percent', 'fixed_amount', 'unit_price'] as const),
    discountCodeValue: vine.number().min(0),
    discountCodeValidFrom: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    discountCodeValidTo: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    discountCodeMaxRedemptions: vine.number().min(1).withoutDecimals().optional().nullable(),
    discountCodeBenefitPeriods: vine.number().min(1).withoutDecimals().optional().nullable(),
  })
)

/**
 * Body para `PATCH /api/platform/billing/discount-codes/:discountCodeId`.
 * `discountCodeCode` y `discountCodeKind` no se aceptan: el texto es
 * inmutable (regla 4) y cambiar el tipo cambiaría el significado del valor
 * de un código ya entregado.
 */
export const updateDiscountCodeValidator = vine.compile(
  vine.object({
    discountCodeName: vine.string().trim().minLength(1).maxLength(160).optional(),
    discountCodeValue: vine.number().min(0).optional(),
    discountCodeValidFrom: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    discountCodeValidTo: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    discountCodeMaxRedemptions: vine.number().min(1).withoutDecimals().optional().nullable(),
    discountCodeBenefitPeriods: vine.number().min(1).withoutDecimals().optional().nullable(),
  })
)

/** Query para `GET /api/platform/billing/discount-codes`. */
export const listDiscountCodesValidator = vine.compile(
  vine.object({
    search: vine.string().trim().optional(),
    kind: vine.enum(['percent', 'fixed_amount', 'unit_price'] as const).optional(),
    active: vine.number().min(0).max(1).withoutDecimals().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
