/**
 * Códigos estables del dominio de alianzas comerciales.
 * Prefijo PLT.ALL = PLaTaforma · ALLiances.
 *
 * Contrato fijado por USRH1788505941892. Los eslabones siguientes agregan
 * entradas; ninguno redefine un `code` ni le cambia el HTTP.
 * El `status` vive aquí para que no pueda divergir entre eslabones.
 */
export const ALLIANCE_ERROR_CODES = {
  /** Body o query inválido (Vine) */
  VAL_INPUT: 'PLT.ALL.VAL_INPUT',
  /** Comisión fuera de 0..100 o con más de dos decimales */
  COMMISSION_OUT_OF_RANGE: 'PLT.ALL.COMMISSION_OUT_OF_RANGE',
  /** Plazo determinado con 0 o negativo */
  TERM_PERIODS_INVALID: 'PLT.ALL.TERM_PERIODS_INVALID',
  /** Alianza no encontrada o retirada con soft delete */
  NOT_FOUND: 'PLT.ALL.NOT_FOUND',
  /** Se intentó activar una alianza que ya está activa */
  ALREADY_ACTIVE: 'PLT.ALL.ALREADY_ACTIVE',
  /** Se intentó desactivar una alianza que ya está inactiva */
  ALREADY_INACTIVE: 'PLT.ALL.ALREADY_INACTIVE',
  /** RFC mal formado o dígito verificador incorrecto */
  RFC_INVALID: 'PLT.ALL.RFC_INVALID',
  /** Régimen fiscal fuera del catálogo SAT sembrado */
  TAX_REGIME_UNKNOWN: 'PLT.ALL.TAX_REGIME_UNKNOWN',
  /** Régimen incompatible con el tipo de persona del RFC */
  TAX_REGIME_NOT_FOR_PERSON_TYPE: 'PLT.ALL.TAX_REGIME_NOT_FOR_PERSON_TYPE',
  /** Uso de CFDI fuera del catálogo SAT sembrado */
  CFDI_USE_UNKNOWN: 'PLT.ALL.CFDI_USE_UNKNOWN',
  /** Uso de CFDI incompatible con el régimen fiscal */
  CFDI_USE_NOT_FOR_REGIME: 'PLT.ALL.CFDI_USE_NOT_FOR_REGIME',
  /** Carrera de dos PUT sobre el perfil vivo de la misma alianza */
  BILLING_PROFILE_CONFLICT: 'PLT.ALL.BILLING_PROFILE_CONFLICT',
  /** Error no tipado del módulo */
  SYS_UNHANDLED: 'PLT.ALL.SYS_UNHANDLED',
} as const

export type AllianceErrorCode =
  (typeof ALLIANCE_ERROR_CODES)[keyof typeof ALLIANCE_ERROR_CODES]

export interface AllianceErrorDefinition {
  key: string
  title: string
  detail: string
  code: AllianceErrorCode
  status: number
}

/** Catálogo HTTP `{ title, detail, key, code, status }` del módulo de alianzas. */
export const ALLIANCE_ERRORS = {
  VAL_INPUT: {
    key: 'datos-invalidos',
    title: 'Alianzas',
    detail: 'Los datos enviados no son válidos.',
    code: ALLIANCE_ERROR_CODES.VAL_INPUT,
    status: 422,
  },
  COMMISSION_OUT_OF_RANGE: {
    key: 'comision-fuera-de-rango',
    title: 'Alianzas',
    detail:
      'El porcentaje de comisión por omisión debe estar entre 0 y 100 y admitir como máximo dos decimales.',
    code: ALLIANCE_ERROR_CODES.COMMISSION_OUT_OF_RANGE,
    status: 422,
  },
  TERM_PERIODS_INVALID: {
    key: 'plazo-invalido',
    title: 'Alianzas',
    detail: 'El plazo determinado debe ser un número entero de periodos mayor que cero.',
    code: ALLIANCE_ERROR_CODES.TERM_PERIODS_INVALID,
    status: 422,
  },
  NOT_FOUND: {
    key: 'alianza-no-encontrada',
    title: 'Alianzas',
    detail: 'La alianza comercial no fue encontrada.',
    code: ALLIANCE_ERROR_CODES.NOT_FOUND,
    status: 404,
  },
  ALREADY_ACTIVE: {
    key: 'alianza-ya-activa',
    title: 'Alianzas',
    detail: 'La alianza comercial ya está activa.',
    code: ALLIANCE_ERROR_CODES.ALREADY_ACTIVE,
    status: 422,
  },
  ALREADY_INACTIVE: {
    key: 'alianza-ya-inactiva',
    title: 'Alianzas',
    detail: 'La alianza comercial ya está inactiva.',
    code: ALLIANCE_ERROR_CODES.ALREADY_INACTIVE,
    status: 422,
  },
  RFC_INVALID: {
    key: 'rfc-invalido',
    title: 'Alianzas',
    detail: 'El RFC no cumple con el formato del SAT o el dígito verificador es incorrecto.',
    code: ALLIANCE_ERROR_CODES.RFC_INVALID,
    status: 422,
  },
  TAX_REGIME_UNKNOWN: {
    key: 'regimen-fiscal-desconocido',
    title: 'Alianzas',
    detail: 'El régimen fiscal seleccionado no existe en el catálogo del SAT.',
    code: ALLIANCE_ERROR_CODES.TAX_REGIME_UNKNOWN,
    status: 422,
  },
  TAX_REGIME_NOT_FOR_PERSON_TYPE: {
    key: 'regimen-fiscal-no-aplicable',
    title: 'Régimen fiscal no aplicable',
    detail:
      'El régimen fiscal seleccionado no corresponde al tipo de contribuyente del RFC registrado.',
    code: ALLIANCE_ERROR_CODES.TAX_REGIME_NOT_FOR_PERSON_TYPE,
    status: 422,
  },
  CFDI_USE_UNKNOWN: {
    key: 'uso-cfdi-desconocido',
    title: 'Alianzas',
    detail: 'El uso de CFDI seleccionado no existe en el catálogo del SAT.',
    code: ALLIANCE_ERROR_CODES.CFDI_USE_UNKNOWN,
    status: 422,
  },
  CFDI_USE_NOT_FOR_REGIME: {
    key: 'uso-cfdi-no-compatible',
    title: 'Uso de CFDI no compatible',
    detail: 'El uso de CFDI seleccionado no es válido para el régimen fiscal elegido.',
    code: ALLIANCE_ERROR_CODES.CFDI_USE_NOT_FOR_REGIME,
    status: 422,
  },
  BILLING_PROFILE_CONFLICT: {
    key: 'perfil-en-conflicto',
    title: 'Alianzas',
    detail: 'Otro proceso está guardando el perfil fiscal de la alianza. Intenta de nuevo.',
    code: ALLIANCE_ERROR_CODES.BILLING_PROFILE_CONFLICT,
    status: 409,
  },
  SYS_UNHANDLED: {
    key: 'error-sistema',
    title: 'Error del servidor',
    detail: 'Error inesperado al procesar la alianza comercial.',
    code: ALLIANCE_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  },
} as const satisfies Record<string, AllianceErrorDefinition>
