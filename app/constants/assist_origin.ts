/**
 * Procedencia de una checada (`assists.assist_origin` y bitácora legacy).
 * USRH1787157820192 / USRH1787157820195 — vocabulario cerrado.
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
