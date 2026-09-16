import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { DateTime } from 'luxon'
import {
  BILLING_TAX_RECEIPT_FILE_TYPES,
  BILLING_TAX_RECEIPT_STAMPED_AT_CLOCK_SKEW_MINUTES,
  BILLING_TAX_RECEIPT_UUID_LENGTH,
  BILLING_TAX_RECEIPT_UUID_PATTERN,
} from '#constants/billing_tax_receipt'

/**
 * Rechaza `stampedAt` que no sea ISO 8601 o que esté más de 5 minutos
 * en el futuro (tolerancia de reloj). No se compara contra `paidAt`.
 */
const stampedAtNotFutureRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string') {
    return
  }

  const parsed = DateTime.fromISO(value)
  if (!parsed.isValid) {
    field.report(
      'El campo {{ field }} debe ser una fecha y hora ISO 8601 válida.',
      'stampedAtIso',
      field
    )
    return
  }

  const limit = DateTime.now().plus({ minutes: BILLING_TAX_RECEIPT_STAMPED_AT_CLOCK_SKEW_MINUTES })
  if (parsed > limit) {
    field.report('El campo {{ field }} no puede estar en el futuro.', 'stampedAtNotFuture', field)
  }
})

/**
 * Body multipart del alta de comprobante fiscal (USRH1788288461963).
 * Sin importes ni datos del receptor: se derivan del pago y del perfil vivo.
 */
export const storeTaxReceiptValidator = vine.compile(
  vine.object({
    uuid: vine
      .string()
      .trim()
      .maxLength(BILLING_TAX_RECEIPT_UUID_LENGTH)
      .regex(BILLING_TAX_RECEIPT_UUID_PATTERN),
    series: vine.string().trim().maxLength(25).optional().nullable(),
    folio: vine.string().trim().maxLength(40).optional().nullable(),
    stampedAt: vine.string().trim().use(stampedAtNotFutureRule()),
  })
)

/**
 * Params de descarga. `fileType` es enum cerrado: un string libre concatenado
 * a una Key sería path traversal, no un descuido de tipado.
 */
export const downloadTaxReceiptFileValidator = vine.compile(
  vine.object({
    taxReceiptId: vine.number().positive().withoutDecimals(),
    fileType: vine.enum(BILLING_TAX_RECEIPT_FILE_TYPES),
  })
)

/**
 * Body JSON de cancelación (USRH1788288462019).
 * La condicionalidad de `substituteUuid` y la comparación contra `stampedAt`
 * viven en el servicio: dependen del catálogo SAT y del dato almacenado.
 */
export const cancelTaxReceiptValidator = vine.compile(
  vine.object({
    cancellationReasonCode: vine.string().trim().fixedLength(2),
    cancelledAt: vine.string().trim().use(stampedAtNotFutureRule()),
    substituteUuid: vine
      .string()
      .trim()
      .maxLength(BILLING_TAX_RECEIPT_UUID_LENGTH)
      .regex(BILLING_TAX_RECEIPT_UUID_PATTERN)
      .optional()
      .nullable(),
  })
)
