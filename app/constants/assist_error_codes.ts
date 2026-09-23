/**
 * Catálogo estable de códigos de error del dominio de asistencia (checadas).
 * Gramática `AST.<BUCKET>.NNN`. Reservas de USRH1786566437097 y USRH1787157820192.
 */
export const ASSIST_ERROR_CODES = {
  /** Contexto tenant no resuelto (USRH1786566437097). */
  TENANT_UNRESOLVED: 'AST.VAL.001',
  /** `employeeId` ausente o no es entero positivo. */
  VAL_EMPLOYEE_ID: 'AST.VAL.002',
  /** El `employeeId` no resuelve a un colaborador de la empresa activa. */
  VAL_EMPLOYEE_NOT_FOUND: 'AST.VAL.008',
  /** `assistChannel` presente pero fuera del vocabulario cerrado `ASSIST_CHANNEL`. */
  VAL_CHANNEL_UNKNOWN: 'AST.VAL.009',
  /** Sincronización por colaborador sin rango de fechas válido o sin `empCode`. */
  VAL_SYNC_RANGE: 'AST.VAL.010',
  /** `assistPunchTime` presente pero no parseable en ninguno de los dos formatos. */
  VAL_PUNCH_TIME_FORMAT: 'AST.VAL.003',
  /** Hora de captura posterior a la del servidor, más allá de la tolerancia vigente. */
  VAL_PUNCH_TIME_FUTURE: 'AST.VAL.005',
  /** Hora de captura anterior al inicio de la ventana vigente. */
  VAL_PUNCH_TIME_OUT_OF_WINDOW: 'AST.VAL.006',
  /** Captura administrativa más atrás de los días que el rol puede modificar. */
  VAL_PUNCH_TIME_ROLE_SCOPE: 'AST.VAL.011',
  /** Lote vacío, no-arreglo o por encima del tope de elementos o de tamaño. */
  VAL_BATCH_SIZE: 'AST.VAL.004',
  /** Dos elementos de la misma entrega comparten llave natural. */
  VAL_BATCH_DUPLICATE_ITEM: 'AST.VAL.007',
  /** Colaborador dado de baja; no se registra jornada. */
  AUTHZ_EMPLOYEE_TERMINATED: 'AST.AUTHZ.001',
  /** Captura ajena sin permiso `add-assist-manual`. */
  AUTHZ_FOREIGN_WRITE: 'AST.AUTHZ.002',
  /**
   * Sincronización general sin permiso `sync-assist`.
   *
   * Sin emisor desde que `POST /synchronize` pasó al permissionGate y responde
   * `PERM.DENIED`. El código se conserva por la regla del catálogo —un código
   * publicado no se reutiliza para otra cosa— y por si un cliente viejo todavía
   * lo mapea.
   */
  AUTHZ_SYNC: 'AST.AUTHZ.003',
  /** Límite de volumen de registros superado. */
  RATE_LIMIT: 'AST.RATE.001',
  /** Clave natural duplicada (USRH1786566437097). */
  CONFLICT_DUPLICATE: 'AST.CONFLICT.001',
} as const

export type AssistErrorCode = (typeof ASSIST_ERROR_CODES)[keyof typeof ASSIST_ERROR_CODES]
