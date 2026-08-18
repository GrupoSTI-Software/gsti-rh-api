/**
 * Códigos estables para el cliente — pagos de suscripción de plataforma.
 * Prefijo PLT.PAY = PLaTaforma · PAYment.
 */
export const BILLING_PAYMENT_ERROR_CODES = {
  /** Body/multipart inválido (Vine) */
  VAL_INPUT: 'PLT.PAY.VAL_INPUT',
  /** Suscripción no encontrada o fuera del guard */
  SUBSCRIPTION_NOT_FOUND: 'PLT.PAY.SUBSCRIPTION_NOT_FOUND',
  /** Pago no encontrado o sin comprobante asociado */
  NOT_FOUND: 'PLT.PAY.NOT_FOUND',
  /** La suscripción está cancelada y no admite pagos */
  SUBSCRIPTION_CANCELED: 'PLT.PAY.SUBSCRIPTION_CANCELED',
  /** Monto inválido (≤ 0 o fuera de cotas razonables) */
  AMOUNT_INVALID: 'PLT.PAY.AMOUNT_INVALID',
  /** Comprobante inválido (tipo no permitido, excede tope o ausente) */
  RECEIPT_INVALID: 'PLT.PAY.RECEIPT_INVALID',
  /** Fallo al subir el comprobante a S3 */
  RECEIPT_UPLOAD_FAILED: 'PLT.PAY.RECEIPT_UPLOAD_FAILED',
  /** Falló aplicar el aumento junto con el registro del pago (rollback total) */
  CHANGE_APPLY_FAILED: 'PLT.PAY.CHANGE_APPLY_FAILED',
  /** Importes congelados del cambio incompletos o inválidos (fail-closed) */
  CHANGE_INCONSISTENT_SNAPSHOT: 'PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.PAY.SYS_UNHANDLED',
} as const

export type BillingPaymentErrorCode =
  (typeof BILLING_PAYMENT_ERROR_CODES)[keyof typeof BILLING_PAYMENT_ERROR_CODES]
