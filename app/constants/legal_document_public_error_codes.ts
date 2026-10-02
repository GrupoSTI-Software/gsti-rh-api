export const LEGAL_DOCUMENT_PUBLIC_ERROR_CODES = {
  /** El `locale` recibido no es `es` ni `en`. */
  INVALID_LOCALE: 'LGDOC.PUBLIC.001',
  /** Se superó el límite de 60 consultas por minuto por IP. */
  RATE_LIMITED: 'LGDOC.PUBLIC.002',
} as const

export const LEGAL_DOCUMENT_PUBLIC_RATE_LIMIT_ERROR = {
  title: 'Demasiadas consultas de documentos legales',
  detail:
    'Se alcanzó el límite de consultas. Espera unos segundos antes de volver a intentarlo.',
  key: 'demasiadas-consultas-de-documentos-legales',
  code: LEGAL_DOCUMENT_PUBLIC_ERROR_CODES.RATE_LIMITED,
} as const
