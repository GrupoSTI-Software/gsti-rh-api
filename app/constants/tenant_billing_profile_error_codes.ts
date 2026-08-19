/**
 * Códigos estables para el perfil de facturación del tenant.
 * Prefijo TNT.BILL = TeNanT · BILLing.
 *
 * Contrato fijado por USRH1786737531057 — las historias siguientes de la cadena
 * agregan claves; no renombrar las existentes sin escalar a Wilvardo.
 */
export const TENANT_BILLING_PROFILE_ERROR_CODES = {
  /** Body inválido (Vine) */
  VAL_INPUT: 'TNT.BILL.VAL_INPUT',
  /** RFC no cumple forma SAT o dígito verificador */
  RFC_INVALID: 'TNT.BILL.RFC_INVALID',
  /** Rol distinto de owner/root/super-administrador */
  FORBIDDEN_ROLE: 'TNT.BILL.FORBIDDEN_ROLE',
  /** Colisión de alta simultánea del perfil */
  PROFILE_CONFLICT: 'TNT.BILL.PROFILE_CONFLICT',
  /** Empresa activa del tenant no resuelta */
  BUSINESS_UNIT_NOT_FOUND: 'TNT.BILL.BUSINESS_UNIT_NOT_FOUND',
  /** Error no tipado del módulo */
  SYS_UNHANDLED: 'TNT.BILL.SYS_UNHANDLED',
} as const

export type TenantBillingProfileErrorCode =
  (typeof TENANT_BILLING_PROFILE_ERROR_CODES)[keyof typeof TENANT_BILLING_PROFILE_ERROR_CODES]

export interface TenantBillingProfileErrorDefinition {
  key: string
  title: string
  detail: string
  code: TenantBillingProfileErrorCode
  status: number
}

/** Catálogo HTTP `{ title, detail, key, code }` del módulo de perfil fiscal. */
export const TENANT_BILLING_PROFILE_ERRORS = {
  VAL_INPUT: {
    key: 'datos-invalidos',
    title: 'Datos de facturación',
    detail: 'Los datos enviados no son válidos.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.VAL_INPUT,
    status: 422,
  },
  RFC_INVALID: {
    key: 'rfc-invalido',
    title: 'Datos de facturación',
    detail:
      'El RFC no cumple con el formato del SAT o el dígito verificador es incorrecto.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.RFC_INVALID,
    status: 422,
  },
  FORBIDDEN_ROLE: {
    key: 'solo-el-dueno-de-la-cuenta',
    title: 'Datos de facturación',
    detail:
      'Solo el dueño de la cuenta puede consultar y capturar los datos de facturación de la empresa.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.FORBIDDEN_ROLE,
    status: 403,
  },
  PROFILE_CONFLICT: {
    key: 'perfil-en-conflicto',
    title: 'Datos de facturación',
    detail: 'Otro proceso está guardando el perfil de facturación. Intenta de nuevo.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.PROFILE_CONFLICT,
    status: 409,
  },
  BUSINESS_UNIT_NOT_FOUND: {
    key: 'empresa-no-resuelta',
    title: 'Datos de facturación',
    detail: 'No se pudo determinar la empresa activa para el perfil de facturación.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
    status: 500,
  },
  SYS_UNHANDLED: {
    key: 'error-sistema',
    title: 'Error del servidor',
    detail: 'Error inesperado al procesar el perfil de facturación.',
    code: TENANT_BILLING_PROFILE_ERROR_CODES.SYS_UNHANDLED,
    status: 500,
  },
} as const satisfies Record<string, TenantBillingProfileErrorDefinition>
