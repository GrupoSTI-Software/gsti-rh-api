import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import {
  BILLING_TAX_RECEIPT_ERROR_CODES,
  BILLING_TAX_RECEIPT_ERRORS,
} from '#constants/billing_tax_receipt_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'
import {
  BillingTaxReceiptServiceError,
  type BillingTaxReceiptErrorData,
} from '#exceptions/billing_tax_receipt_service_error'

export type ResolvedBillingTaxReceiptError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
  data?: BillingTaxReceiptErrorData
}

/**
 * Convierte excepciones del módulo de comprobante fiscal en la respuesta HTTP
 * `{ title, detail, key, code }` con prefijo PLT.TAX.*.
 *
 * `VAL_INPUT` usa `key: 'datos-invalidos'` (slug), no el code — el molde de
 * pagos pone el code en `key` y aquí se corrige a propósito.
 * `SYS_UNHANDLED` nunca reenvía el mensaje crudo (fuga de esquema).
 */
export function resolveBillingTaxReceiptApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedBillingTaxReceiptError {
  const err = error as {
    code?: string
    messages?: Array<{ message?: string; field?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const first = err.messages?.[0]
    if (first?.field === 'uuid' || first?.field === 'substituteUuid') {
      const invalidUuid = BILLING_TAX_RECEIPT_ERRORS.INVALID_UUID_FORMAT
      return {
        title: invalidUuid.title,
        detail: invalidUuid.detail,
        key: invalidUuid.key,
        code: invalidUuid.code,
        status: invalidUuid.status,
      }
    }

    const definition = BILLING_TAX_RECEIPT_ERRORS.VAL_INPUT
    return {
      title: definition.title,
      detail: first?.message ?? definition.detail,
      key: definition.key,
      code: BILLING_TAX_RECEIPT_ERROR_CODES.VAL_INPUT,
      status: definition.status,
    }
  }

  if (error instanceof FileIntakeError) {
    const definition =
      error.errorCode === FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE
        ? BILLING_TAX_RECEIPT_ERRORS.FILE_TOO_LARGE
        : BILLING_TAX_RECEIPT_ERRORS.FILE_TYPE_NOT_ALLOWED
    return {
      title: definition.title,
      detail: error.detail,
      key: definition.key,
      code: definition.code,
      status: definition.status,
    }
  }

  if (error instanceof BillingTaxReceiptServiceError) {
    const resolved: ResolvedBillingTaxReceiptError = {
      title: resolveTitle(error.errorCode),
      detail: error.detail,
      key: error.key,
      code: error.errorCode,
      status: error.httpStatus,
    }
    if (error.data) {
      resolved.data = error.data
    }
    return resolved
  }

  const unhandled = BILLING_TAX_RECEIPT_ERRORS.SYS_UNHANDLED
  return {
    title: unhandled.title,
    detail: unhandled.detail,
    key: unhandled.key,
    code: unhandled.code,
    status: fallbackStatus,
  }
}

function resolveTitle(code: string): string {
  const match = Object.values(BILLING_TAX_RECEIPT_ERRORS).find((entry) => entry.code === code)
  return match?.title ?? BILLING_TAX_RECEIPT_ERRORS.SYS_UNHANDLED.title
}
