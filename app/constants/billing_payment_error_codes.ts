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
  /** Flujo normal: se envió amountCents distinto al monto gobernado del periodo */
  AMOUNT_NOT_ALLOWED: 'PLT.PAY.AMOUNT_NOT_ALLOWED',
  /** allowCustomAmount=true sin enviar amountCents */
  AMOUNT_REQUIRED: 'PLT.PAY.AMOUNT_REQUIRED',
  /** El trato congelado no permite determinar el monto del periodo */
  PERIOD_AMOUNT_UNAVAILABLE: 'PLT.PAY.PERIOD_AMOUNT_UNAVAILABLE',
  /** El importe cubriría más periodos que MAX_PERIODS_PER_PAYMENT */
  PERIODS_OUT_OF_RANGE: 'PLT.PAY.PERIODS_OUT_OF_RANGE',
  /** Comprobante inválido (tipo no permitido, excede tope o ausente) */
  RECEIPT_INVALID: 'PLT.PAY.RECEIPT_INVALID',
  /** Fallo al subir el comprobante a S3 */
  RECEIPT_UPLOAD_FAILED: 'PLT.PAY.RECEIPT_UPLOAD_FAILED',
  /** Falló aplicar el aumento junto con el registro del pago (rollback total) */
  CHANGE_APPLY_FAILED: 'PLT.PAY.CHANGE_APPLY_FAILED',
  /** Importes congelados del cambio incompletos o inválidos (fail-closed) */
  CHANGE_INCONSISTENT_SNAPSHOT: 'PLT.PAY.CHANGE_INCONSISTENT_SNAPSHOT',
  /**
   * Se confirmó un monto compuesto (adeudo, o adeudo + periodo) pero el
   * aumento pendiente que lo justificaba ya no está vivo al momento de
   * asentar el pago (USRH1787077544537, decisión Wilvardo: rechazar y pedir
   * reabrir, nunca degradar en silencio al monto del periodo).
   */
  PENDING_INCREASE_STALE: 'PLT.PAY.PENDING_INCREASE_STALE',
  /**
   * El acuerdo de descuento congelado en la suscripción (código de la
   * contratación) está incompleto, su `kind` no es ninguno de los tres
   * válidos, o la identidad del desglose no cuadra con el importe exigido
   * (USRH1787714804403, reglas 6 y 7). Fail-closed: no se asienta una foto
   * financiera falsa en `billing_payments`, que es append-only.
   */
  DISCOUNT_SNAPSHOT_INCONSISTENT: 'PLT.PAY.DISCOUNT_SNAPSHOT_INCONSISTENT',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.PAY.SYS_UNHANDLED',
} as const

export type BillingPaymentErrorCode =
  (typeof BILLING_PAYMENT_ERROR_CODES)[keyof typeof BILLING_PAYMENT_ERROR_CODES]
