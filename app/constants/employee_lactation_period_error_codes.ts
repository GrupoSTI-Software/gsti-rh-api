/**
 * Catálogo estable de códigos de error del módulo de periodos de lactancia.
 * Se usan en todas las respuestas HTTP para que los clientes puedan
 * reaccionar de forma programática sin parsear mensajes localizados.
 */
export const ELP_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'ELP.VAL.001',
  /** lactationPeriodEndDate <= lactationPeriodStartDate */
  DATE_RANGE_INVALID: 'ELP.VAL.DATE.001',
  /** El rango total supera el sanity check de 24 meses */
  RANGE_UNREASONABLE: 'ELP.VAL.RANGE.001',
  /** Empleada inexistente o ajena a la empresa del usuario autenticado */
  EMPLOYEE_NOT_FOUND: 'ELP.NF.EMP.001',
  /** Periodo no encontrado o ajeno a la empresa */
  PERIOD_NOT_FOUND: 'ELP.NF.PERIOD.001',
  /** Traslape contra otro periodo activo del mismo empleado */
  PERIOD_OVERLAP: 'ELP.CONFLICT.OVERLAP.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'ELP.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ELP.SYS.001',
} as const

export type ElpErrorCode = (typeof ELP_ERROR_CODES)[keyof typeof ELP_ERROR_CODES]
