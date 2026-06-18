/**
 * Catálogo estable de códigos de error del módulo de periodos de lactancia.
 * Se usan en todas las respuestas HTTP para que los clientes puedan
 * reaccionar de forma programática sin parsear mensajes localizados.
 */
export const ELP_ERROR_CODES = {
  /** Error de validación VineJS o input fuera de rango */
  VAL_INPUT: 'ELP.VAL.001',
  /** employeeLactationPeriodEndDate <= employeeLactationPeriodStartDate */
  DATE_RANGE_INVALID: 'ELP.VAL.DATE.001',
  /** El rango total supera el sanity check de 24 meses */
  RANGE_UNREASONABLE: 'ELP.VAL.RANGE.001',
  /** El rango total es menor al mínimo legal LFT 170 IV (6 meses) */
  RANGE_BELOW_LEGAL_MINIMUM: 'ELP.VAL.RANGE.002',
  /** Empleada inexistente o ajena a la empresa del usuario autenticado */
  EMPLOYEE_NOT_FOUND: 'ELP.NF.EMP.001',
  /** Periodo no encontrado o ajeno a la empresa */
  PERIOD_NOT_FOUND: 'ELP.NF.PERIOD.001',
  /** Traslape contra otro periodo activo del mismo empleado */
  PERIOD_OVERLAP: 'ELP.CONFLICT.OVERLAP.001',
  /** Sin permisos sobre el módulo */
  FORBIDDEN: 'ELP.FORBID.001',
  /**
   * El tipo de excepción 'lactancia' no existe en `exception_types`.
   * Indica que el seeder `0028_lactation_exception_type_seeder.ts` no
   * se ejecutó en el ambiente. Genera 500 con key estable
   * `lactation-exception-type-missing` y rollback de la transacción.
   */
  EXCEPTION_TYPE_MISSING: 'ELP.SYS.EXC_TYPE.001',
  /**
   * La empleada no tiene NINGÚN `EmployeeShift` activo en todo el rango
   * del periodo. Sólo aplica al endpoint manual de regeneración
   * (`POST /api/employee-lactation-periods/:id/regenerate-shift-exceptions`)
   * porque al crear/editar se prefiere registrar warning y continuar.
   */
  NO_ACTIVE_SHIFT: 'ELP.CONFLICT.NO_SHIFT.001',
  /**
   * Falló el envío del correo de aviso de vencimiento para alguna empresa.
   * El comando agendado lo trata como warning y continúa con las demás
   * empresas (no aborta la corrida); el endpoint manual lo refleja en
   * la respuesta para que RH pueda reintentar.
   */
  NOTIFICATION_MAIL_FAILED: 'ELP.SYS.NOTIF_MAIL.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ELP.SYS.001',
} as const

export type ElpErrorCode = (typeof ELP_ERROR_CODES)[keyof typeof ELP_ERROR_CODES]
