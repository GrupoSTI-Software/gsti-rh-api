/**
 * Códigos estables para el cliente del módulo de listas de verificación de
 * teletrabajo. Prefijo TWC = TeleWork Checklist.
 */
export const TELEWORK_CHECKLIST_ERROR_CODES = {
  /** El cuerpo del request no cumple el esquema esperado. */
  INVALID_INPUT: 'TWC.VAL.001',
  /** Faltan reactivos obligatorios o trae reactivos de más para la modalidad. */
  INCOMPLETE_ANSWERS: 'TWC.VAL.002',
  /** El mismo reactivo se contestó más de una vez. */
  DUPLICATED_ANSWER: 'TWC.VAL.003',
  /** La respuesta apunta a un reactivo que no existe en el catálogo. */
  UNKNOWN_ITEM: 'TWC.VAL.004',
  /** La fecha de aplicación es futura o anterior a lo permitido. */
  INVALID_APPLIED_AT: 'TWC.VAL.005',
  /** La aplicación es visita_csh y falta el inspector que la levanta. */
  INSPECTOR_REQUIRED: 'TWC.VAL.006',
  /** Las coordenadas o el domicilio capturados no son válidos. */
  INVALID_LOCATION: 'TWC.VAL.007',
  /** El acceso a listas de verificación está limitado a teletrabajadores. */
  GATING_ONLY_TELEWORKERS: 'TWC.VAL.GATING.001',
  /** El teletrabajador referido no existe. */
  EMPLOYEE_NOT_FOUND: 'TWC.NF.001',
  /** La aplicación de la lista de verificación no existe. */
  APPLICATION_NOT_FOUND: 'TWC.NF.002',
  /** Ya existe una aplicación vigente para el mismo teletrabajador y periodo. */
  CONCURRENT_APPLICATION: 'TWC.CONF.002',
  /** Un usuario sin permiso del módulo intentó leer/escribir. */
  FORBIDDEN: 'TWC.AUTH.001',
  /** Error inesperado no clasificado. */
  UNEXPECTED: 'TWC.SYS.001',
} as const

export type TeleworkChecklistErrorCode =
  (typeof TELEWORK_CHECKLIST_ERROR_CODES)[keyof typeof TELEWORK_CHECKLIST_ERROR_CODES]
