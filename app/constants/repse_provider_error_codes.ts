/**
 * Catálogo estable de códigos de error del módulo "Proveedores REPSE"
 * (USRH1784259105646, lado contratante). Cubre tanto el catálogo de
 * proveedores como su bitácora de validaciones — comparten un solo
 * namespace porque son un único módulo de permisos (`repse-providers`).
 *
 * Los códigos se incluyen en cada respuesta HTTP para que los clientes
 * reaccionen de forma programática sin parsear el mensaje localizado.
 */
export const REPSE_PROVIDER_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'REPSEPROV.VAL.001',
  /** folioVencimiento no es una fecha coherente (anterior a hoy al registrar, o formato inválido) */
  DATE_INVALID: 'REPSEPROV.VAL.DATE.001',
  /** BusinessUnit inexistente o ajena al tenant del usuario autenticado */
  BUSINESS_UNIT_NOT_FOUND: 'REPSEPROV.NF.BU.001',
  /** Proveedor REPSE inexistente al consultar, editar, eliminar o validar */
  PROVIDER_NOT_FOUND: 'REPSEPROV.NF.PROV.001',
  /** Validación de folio inexistente o ajena al proveedor/tenant al descargar su evidencia */
  VALIDATION_NOT_FOUND: 'REPSEPROV.NF.VAL.001',
  /** Folio repetido (activo) para la misma empresa contratante */
  FOLIO_DUPLICATE: 'REPSEPROV.CONFLICT.FOLIO.001',
  /** Evidencia de validación faltante, tipo no permitido o tamaño excedido */
  VAL_EVIDENCE: 'REPSEPROV.VAL.EVID.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'REPSEPROV.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'REPSEPROV.SYS.001',
} as const

export type RepseProviderErrorCode =
  (typeof REPSE_PROVIDER_ERROR_CODES)[keyof typeof REPSE_PROVIDER_ERROR_CODES]
