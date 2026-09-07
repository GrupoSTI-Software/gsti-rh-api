/**
 * Códigos estables del comprobante fiscal de membresía.
 * Prefijo PLT.TAX = PLaTaforma · TAXreceipt.
 *
 * Contrato fijado por USRH1788288461963. Las rebanadas 3 y 7 agregan claves;
 * no renombrar las existentes sin escalar a Wilvardo.
 */
export const BILLING_TAX_RECEIPT_ERROR_CODES = {
  /** Body/multipart inválido (Vine) */
  VAL_INPUT: 'PLT.TAX.VAL_INPUT',
  /** Pago inexistente o no accesible — misma respuesta en ambos verbos */
  PAYMENT_NOT_FOUND: 'PLT.TAX.PAYMENT_NOT_FOUND',
  /** Folio fiscal que no cumple la forma canónica */
  INVALID_UUID_FORMAT: 'PLT.TAX.INVALID_UUID_FORMAT',
  /** Faltan datos fiscales del cliente; `data` nombra solo lo que falta */
  BILLING_PROFILE_INCOMPLETE: 'PLT.TAX.BILLING_PROFILE_INCOMPLETE',
  /** Pago anterior a la foto financiera (`totalCents = 0`) */
  PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT: 'PLT.TAX.PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT',
  /** El pago ya tiene un comprobante `issued` */
  LIVE_RECEIPT_EXISTS: 'PLT.TAX.LIVE_RECEIPT_EXISTS',
  /** Folio fiscal ya ocupado, incluso por un comprobante cancelado */
  UUID_ALREADY_REGISTERED: 'PLT.TAX.UUID_ALREADY_REGISTERED',
  /** Contenido o extensión que no corresponden al acuse */
  FILE_TYPE_NOT_ALLOWED: 'PLT.TAX.FILE_TYPE_NOT_ALLOWED',
  /** XML o PDF por encima de su tope */
  FILE_TOO_LARGE: 'PLT.TAX.FILE_TOO_LARGE',
  /** `uploadPrivateBuffer` devolvió null — S3 caído al subir */
  FILE_UPLOAD_FAILED: 'PLT.TAX.FILE_UPLOAD_FAILED',
  /** `:taxReceiptId` inexistente o sin pago encadenado */
  TAX_RECEIPT_NOT_FOUND: 'PLT.TAX.TAX_RECEIPT_NOT_FOUND',
  /** Path nulo u objeto ausente en el bucket */
  FILE_NOT_AVAILABLE: 'PLT.TAX.FILE_NOT_AVAILABLE',
  /** Error no tipado del módulo */
  SYS_UNHANDLED: 'PLT.TAX.SYS_UNHANDLED',
} as const

export type BillingTaxReceiptErrorCode =
  (typeof BILLING_TAX_RECEIPT_ERROR_CODES)[keyof typeof BILLING_TAX_RECEIPT_ERROR_CODES]

export interface BillingTaxReceiptErrorDefinition {
  key: string
  title: string
  detail: string
  code: BillingTaxReceiptErrorCode
  status: number
}

/** Catálogo HTTP `{ title, detail, key, code }` del módulo de comprobante fiscal. */
export const BILLING_TAX_RECEIPT_ERRORS = {
  VAL_INPUT: {
    key: 'datos-invalidos',
    title: 'Comprobante fiscal',
    detail: 'Los datos enviados no son válidos.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.VAL_INPUT,
    status: 422,
  },
  PAYMENT_NOT_FOUND: {
    key: 'pago-no-encontrado',
    title: 'Pago no encontrado',
    detail: 'No se encontró el pago indicado.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.PAYMENT_NOT_FOUND,
    status: 404,
  },
  INVALID_UUID_FORMAT: {
    key: 'folio-fiscal-invalido',
    title: 'Folio fiscal inválido',
    detail: 'El folio fiscal no tiene la forma canónica que usa la autoridad.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.INVALID_UUID_FORMAT,
    status: 422,
  },
  BILLING_PROFILE_INCOMPLETE: {
    key: 'perfil-fiscal-incompleto',
    title: 'Perfil fiscal incompleto',
    detail: 'Faltan datos fiscales del cliente para poder facturar.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.BILLING_PROFILE_INCOMPLETE,
    status: 422,
  },
  PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT: {
    key: 'pago-sin-foto-financiera',
    title: 'Pago sin desglose',
    detail:
      'Este pago no tiene desglose de importes disponible y no puede facturarse desde la plataforma.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.PAYMENT_WITHOUT_FINANCIAL_SNAPSHOT,
    status: 422,
  },
  LIVE_RECEIPT_EXISTS: {
    key: 'el-pago-ya-tiene-comprobante-vivo',
    title: 'Comprobante ya registrado',
    detail:
      'Este pago ya tiene un comprobante fiscal vivo. Cancela el existente antes de registrar otro.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.LIVE_RECEIPT_EXISTS,
    status: 409,
  },
  UUID_ALREADY_REGISTERED: {
    key: 'folio-fiscal-ya-registrado',
    title: 'Folio fiscal ya registrado',
    detail: 'Ese folio fiscal ya está registrado en la plataforma.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.UUID_ALREADY_REGISTERED,
    status: 409,
  },
  FILE_TYPE_NOT_ALLOWED: {
    key: 'archivo-no-permitido',
    title: 'Archivo no permitido',
    detail: 'El archivo no es del tipo declarado.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
    status: 422,
  },
  FILE_TOO_LARGE: {
    key: 'archivo-demasiado-grande',
    title: 'Archivo demasiado grande',
    detail: 'El archivo supera el tamaño máximo permitido.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.FILE_TOO_LARGE,
    status: 422,
  },
  FILE_UPLOAD_FAILED: {
    key: 'no-fue-posible-guardar-el-archivo',
    title: 'No fue posible guardar el archivo',
    detail: 'No fue posible guardar el archivo del comprobante fiscal.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.FILE_UPLOAD_FAILED,
    status: 500,
  },
  TAX_RECEIPT_NOT_FOUND: {
    key: 'comprobante-no-encontrado',
    title: 'Comprobante no encontrado',
    detail: 'No se encontró el comprobante fiscal indicado.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.TAX_RECEIPT_NOT_FOUND,
    status: 404,
  },
  FILE_NOT_AVAILABLE: {
    key: 'archivo-no-disponible',
    title: 'Archivo no disponible',
    detail: 'El archivo solicitado no está disponible.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.FILE_NOT_AVAILABLE,
    status: 404,
  },
  SYS_UNHANDLED: {
    key: 'error-sistema',
    title: 'Error del servidor',
    detail: 'Error inesperado al procesar el comprobante fiscal.',
    code: BILLING_TAX_RECEIPT_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  },
} as const satisfies Record<string, BillingTaxReceiptErrorDefinition>
