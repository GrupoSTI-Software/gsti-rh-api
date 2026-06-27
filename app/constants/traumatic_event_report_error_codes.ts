/**
 * Catálogo estable de códigos de error del módulo de reportes de evento traumático.
 * Permiten que los clientes reaccionen de forma programática sin parsear mensajes.
 */
export const ETR_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'ETR.VAL.001',
  /** traumaticEventReportOccurredAt es fecha futura */
  OCCURRED_AT_FUTURE: 'ETR.VAL.DATE.001',
  /** traumaticEventTypeId inexistente o inactivo */
  INVALID_EVENT_TYPE: 'ETR.VAL.TYPE.001',
  /** Empleado inexistente o ajeno al scope del usuario autenticado */
  EMPLOYEE_NOT_FOUND: 'ETR.NF.EMP.001',
  /** Reporte no encontrado o ajeno al scope del usuario autenticado */
  REPORT_NOT_FOUND: 'ETR.NF.REPORT.001',
  /** Rango de fechas invertido (fin menor que inicio) en el registro */
  RANGE_INVALID: 'ETR.VAL.RANGE.001',
  /** Reporte con campos mínimos faltantes para generar el documento imprimible */
  DOC_INCOMPLETE: 'ETR.VAL.DOC.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'ETR.FORBID.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ETR.SYS.001',
} as const

export type EtrErrorCode = (typeof ETR_ERROR_CODES)[keyof typeof ETR_ERROR_CODES]
