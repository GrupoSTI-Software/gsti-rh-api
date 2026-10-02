/**
 * Catálogo estable de códigos del período de vacaciones al registrar días.
 */
export const EMPLOYEE_VACATION_PERIOD_ERROR_CODES = {
  /**
   * La empresa no permite adelantar vacaciones y el período del registro aún
   * no inicia (`system_settings.system_setting_restrict_future_vacation`).
   */
  VAL_PERIOD_NOT_STARTED: 'VPER.VAL.001',
} as const

export type EmployeeVacationPeriodErrorCode =
  (typeof EMPLOYEE_VACATION_PERIOD_ERROR_CODES)[keyof typeof EMPLOYEE_VACATION_PERIOD_ERROR_CODES]
