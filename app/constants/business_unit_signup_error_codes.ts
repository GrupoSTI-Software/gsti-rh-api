/**
 * Códigos estables para el alta de empresa adicional (USRH1787932877001).
 * Prefijo TNT.BU = TeNanT · Business Unit.
 *
 * Contrato fijado por spec-USRH1787932877001.md §6 — no renombrar sin
 * escalar a Wilvardo (cambio de contrato).
 *
 * Nota: los errores de cantidad (PLT.SUB.EMPLOYEES_*) y de plan
 * (PLT.SUB.PLAN_*) no están aquí: se reutilizan del catálogo existente
 * `billing_subscription_error_codes.ts` sin copiarlos ni envolverlos.
 */
export const BUSINESS_UNIT_SIGNUP_ERROR_CODES = {
  /** Cuerpo inválido (Vine) */
  VAL_INPUT: 'TNT.BU.VAL_INPUT',
  /** Solo el dueño de la cuenta puede crear una empresa adicional */
  FORBIDDEN_ROLE: 'TNT.BU.FORBIDDEN_ROLE',
  /** El usuario ya tiene una empresa viva con ese nombre */
  DUPLICATE_NAME: 'TNT.BU.DUPLICATE_NAME',
  /** El usuario alcanzó el tope de empresas vivas por cuenta */
  LIMIT_REACHED: 'TNT.BU.LIMIT_REACHED',
  /**
   * Se agotaron los reintentos para asignar el identificador interno de empresa.
   *
   * Contrato único en las dos superficies de alta de empresa (`signup_draft_service.ts`
   * y `additional_business_unit_service.ts`): HTTP 500,
   * `key: 'no-fue-posible-asignar-el-identificador-de-la-empresa'`.
   * La hermana -01 lo emite inline citando esta constante, no definiendo la suya.
   * Es 500 (imposibilidad interna) y no 409: el cliente no puede resolver
   * cambiando lo que capturó.
   */
  SLUG_CONFLICT: 'TNT.BU.SLUG_CONFLICT',
  /** `createForTenant` falló al provisionar la configuración de la empresa nueva */
  SETTINGS_PROVISIONING_FAILED: 'TNT.BU.SETTINGS_PROVISIONING_FAILED',
  /** Fallo no clasificado: todo el alta fue revertido */
  CREATION_FAILED: 'TNT.BU.CREATION_FAILED',
  /** Tope de peticiones por minuto excedido */
  RATE_LIMITED: 'TNT.BU.RATE_LIMITED',
} as const

export type BusinessUnitSignupErrorCode =
  (typeof BUSINESS_UNIT_SIGNUP_ERROR_CODES)[keyof typeof BUSINESS_UNIT_SIGNUP_ERROR_CODES]

export interface BusinessUnitSignupErrorDefinition {
  key: string
  title: string
  detail: string
  code: BusinessUnitSignupErrorCode
  status: number
}

/** Catálogo completo de respuestas de error — español en duro (patrón del área). */
export const BUSINESS_UNIT_SIGNUP_ERRORS: Readonly<
  Record<keyof typeof BUSINESS_UNIT_SIGNUP_ERROR_CODES, BusinessUnitSignupErrorDefinition>
> = {
  VAL_INPUT: {
    key: 'datos-invalidos',
    title: 'Datos de la empresa',
    detail: 'Uno o más campos no son válidos.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.VAL_INPUT,
    status: 422,
  },
  FORBIDDEN_ROLE: {
    key: 'solo-el-dueno-de-la-cuenta',
    title: 'Solo el dueño de la cuenta',
    detail: 'Solo el dueño de la cuenta puede registrar una empresa nueva.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.FORBIDDEN_ROLE,
    status: 403,
  },
  DUPLICATE_NAME: {
    key: 'ya-tienes-una-empresa-con-ese-nombre',
    title: 'Ya tienes una empresa con ese nombre',
    detail:
      'Ya existe una empresa activa con ese nombre en tu cuenta. Usa un nombre distinto para distinguirlas en el selector.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.DUPLICATE_NAME,
    status: 409,
  },
  LIMIT_REACHED: {
    key: 'alcanzaste-el-maximo-de-empresas',
    title: 'Límite de empresas alcanzado',
    detail: 'Alcanzaste el número máximo de empresas activas permitido en tu cuenta.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.LIMIT_REACHED,
    status: 409,
  },
  SLUG_CONFLICT: {
    key: 'no-fue-posible-asignar-el-identificador-de-la-empresa',
    title: 'Alta de empresa',
    detail: 'No fue posible asignar el identificador de la empresa.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.SLUG_CONFLICT,
    status: 500,
  },
  SETTINGS_PROVISIONING_FAILED: {
    key: 'no-fue-posible-crear-la-configuracion-de-la-empresa',
    title: 'Alta de empresa',
    detail: 'No fue posible crear la configuración de la empresa.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.SETTINGS_PROVISIONING_FAILED,
    status: 500,
  },
  CREATION_FAILED: {
    key: 'no-fue-posible-crear-la-empresa',
    title: 'No fue posible crear la empresa',
    detail: 'Ocurrió un problema al crear la empresa. Intenta de nuevo en unos momentos.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.CREATION_FAILED,
    status: 500,
  },
  RATE_LIMITED: {
    key: 'demasiadas-solicitudes-de-alta-de-empresa',
    title: 'Demasiadas solicitudes de alta de empresa',
    detail: 'Superaste el límite de altas de empresa por minuto. Espera un momento e intenta de nuevo.',
    code: BUSINESS_UNIT_SIGNUP_ERROR_CODES.RATE_LIMITED,
    status: 429,
  },
}
