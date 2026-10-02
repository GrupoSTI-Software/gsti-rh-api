/**
 * Códigos de error del acceso a información de empleados (quién consulta a
 * quién y la jefatura directa).
 */
export const EMPLOYEE_ACCESS_ERROR_CODES = {
  /** El colaborador o el acceso no existen en la empresa activa. */
  NOT_FOUND: 'EAC.NF.001',
  /** El colaborador no tiene usuario: no puede consultar a nadie. */
  EMPLOYEE_WITHOUT_USER: 'EAC.VAL.001',
  /** El colaborador del acceso ya tiene otra jefatura directa. */
  DIRECT_BOSS_TAKEN: 'EAC.CONFLICT.001',
} as const
