/**
 * Códigos estables para el cliente — catálogo de códigos de descuento.
 * Prefijo PLT.DSC = PLaTaforma · DiSCount codes.
 *
 * Contrato fijado por spec-USRH1787714804397.md §6 — no renombrar sin
 * escalar a Wilvardo (cambio de contrato).
 */
export const DISCOUNT_CODE_ERROR_CODES = {
  /** Body o query inválido (Vine) */
  VAL_INPUT: 'PLT.DSC.VAL_INPUT',
  /** Código de descuento no encontrado (o retirado del catálogo) */
  NOT_FOUND: 'PLT.DSC.NOT_FOUND',
  /** El texto ya está ocupado por otro código (activo, apagado o retirado) */
  CODE_DUPLICATE: 'PLT.DSC.CODE_DUPLICATE',
  /** Intento de mutar el texto de un código ya creado */
  CODE_IMMUTABLE: 'PLT.DSC.CODE_IMMUTABLE',
  /** El valor del beneficio no es coherente con su tipo */
  VALUE_OUT_OF_RANGE: 'PLT.DSC.VALUE_OUT_OF_RANGE',
  /** La vigencia final es anterior a la inicial */
  VALIDITY_RANGE_INVALID: 'PLT.DSC.VALIDITY_RANGE_INVALID',
  /** Se intentó activar un código que ya está activo */
  ALREADY_ACTIVE: 'PLT.DSC.ALREADY_ACTIVE',
  /** Se intentó desactivar un código que ya está inactivo */
  ALREADY_INACTIVE: 'PLT.DSC.ALREADY_INACTIVE',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.DSC.SYS_UNHANDLED',
} as const

export type DiscountCodeErrorCode =
  (typeof DISCOUNT_CODE_ERROR_CODES)[keyof typeof DISCOUNT_CODE_ERROR_CODES]
