/**
 * Catálogo estable de códigos de error del módulo de asignaciones
 * de trabajadores a contratos de servicios especializados REPSE.
 */
export const ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES = {
  /** Validación VineJS o input fuera de rango */
  VAL_INPUT: 'ACE.VAL.001',
  /** employeeId repetido en el payload bulk */
  VAL_EMPLOYEE_DUPLICATE: 'ACE.VAL.EMP.DUP.001',
  /** fechaFin anterior a fechaInicio */
  VAL_FECHAS: 'ACE.VAL.FECHAS.001',
  /** Asignación inexistente o ajena al tenant */
  NOT_FOUND: 'ACE.NF.001',
  /** Empleado inexistente, inactivo o ajeno al tenant */
  EMPLOYEE_NOT_FOUND: 'ACE.NF.EMP.001',
  /** Contrato no vigente (solo POST) */
  CONTRATO_NO_VIGENTE: 'ACE.VAL.CONTRATO.001',
  /** Fechas de asignación fuera de la vigencia efectiva del contrato */
  FUERA_DE_VIGENCIA: 'ACE.VAL.VIGENCIA.001',
  /** Solape de asignación activa mismo empleado+contrato */
  ASIGNACION_DUPLICADA: 'ACE.CONFLICT.DUP.001',
  /** Sin permiso sobre el módulo */
  FORBIDDEN: 'ACE.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ACE.SYS.001',
} as const

export type AsignacionContratoEspecializadoErrorCode =
  (typeof ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES)[keyof typeof ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES]
