/**
 * Catálogo estable de códigos de error del módulo de servicios
 * especializados REPSE.
 *
 * Los códigos viajan en cada respuesta HTTP para que los clientes
 * reaccionen de forma programática sin parsear el mensaje localizado.
 */
export const REPSE_SPECIALIZED_SERVICE_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'REPSE.SVC.VAL.001',
  /** Servicio especializado inexistente al consultar, editar o eliminar */
  SVC_NOT_FOUND: 'REPSE.SVC.NF.001',
  /** Registro REPSE padre inexistente o ajeno al tenant */
  PARENT_NOT_FOUND: 'REPSE.SVC.NF.PARENT.001',
  /** Nombre duplicado dentro de la misma empresa (business_unit_id) */
  NAME_DUPLICATE: 'REPSE.SVC.DUP.001',
  /** Servicio vinculado a contratos no eliminados */
  LINKED_ACTIVE_CONTRATOS: 'REPSE.SVC.CONFLICT.CONTRATOS.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'REPSE.SVC.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'REPSE.SVC.SYS.001',
} as const

export type RepseSpecializedServiceErrorCode =
  (typeof REPSE_SPECIALIZED_SERVICE_ERROR_CODES)[keyof typeof REPSE_SPECIALIZED_SERVICE_ERROR_CODES]
