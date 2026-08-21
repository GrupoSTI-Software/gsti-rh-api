/**
 * Origen de una checada en la bitácora MongoDB (`log_assist.create_from`).
 * USRH1787157820192 — vocabulario cerrado; no inventar valores fuera de esta unión.
 */
export const ASSIST_ORIGIN = {
  /** La propia persona registró su checada (autoservicio / app). */
  SELF_SERVICE: 'self-service',
  /** Captura administrativa sobre un tercero autorizado. */
  ADMIN_CAPTURE: 'admin-capture',
  /** Importada de BioTime (sync_assists_service). */
  SYNC: 'sync',
  /** Legado congelado — históricos anteriores a USRH1787157820192. */
  MANUAL: 'manual',
  /** Reservado: kiosco por WebSocket; hoy sin bitácora. */
  DEVICE: 'device',
} as const

export type AssistCreateFrom = (typeof ASSIST_ORIGIN)[keyof typeof ASSIST_ORIGIN]
