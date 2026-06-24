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
  /**
   * El `shiftExceptionId` del path no existe, ya está borrado, no
   * pertenece al `periodId` indicado o ya no representa un conflicto
   * activo (la causa bloqueante fue eliminada entre la lectura y la
   * acción). Genera 404 para los endpoints de
   * revocación/reasignación de conflictos.
   */
  CONFLICT_NOT_FOUND: 'ELP.NF.CONFLICT.001',
  /**
   * La reasignación calculó una nueva fecha que extendería el periodo
   * más allá del cap de sanity (`MAX_LACTATION_RANGE_MONTHS = 24`).
   * Genera 422; el admin debe revocar (sin reasignar) o revisar
   * manualmente el caso.
   */
  REASSIGN_EXCEEDS_MAX_RANGE: 'ELP.CONFLICT.REASSIGN_MAX.001',
  /**
   * La reasignación no encontró ningún día disponible en el horizonte
   * de búsqueda (saltando descansos, festivos, conflictos y días ya
   * cubiertos por lactancia del mismo periodo). Genera 422.
   */
  REASSIGN_NO_AVAILABLE_DATE: 'ELP.CONFLICT.REASSIGN_NONE.001',
  /** Error no clasificado del dominio */
  SYS_UNHANDLED: 'ELP.SYS.001',
} as const

export type ElpErrorCode = (typeof ELP_ERROR_CODES)[keyof typeof ELP_ERROR_CODES]
