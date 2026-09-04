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

/**
 * Canal por el que llegó la checada. Lo declara el cliente; el servidor lo valida
 * contra este vocabulario cerrado y lo traduce a `ASSIST_ORIGIN`.
 *
 * Existe porque `ASSIST_ORIGIN` solo no basta: la app personal y el kiosco escribían
 * ambos `self-service`, así que dos checadas legítimas del mismo instante por medios
 * distintos colapsaban en la misma identidad y una se descartaba.
 */
export const ASSIST_CHANNEL = {
  /** App del empleado en su propio teléfono. */
  APP: 'app',
  /** Tableta o equipo en modo kiosco, compartido por el sitio. */
  KIOSK: 'kiosk',
  /** Captura administrativa desde el Backoffice. */
  BACKOFFICE: 'backoffice',
  /** Checador físico, que sí aporta número de serie. */
  DEVICE: 'device',
} as const

export type AssistChannel = (typeof ASSIST_CHANNEL)[keyof typeof ASSIST_CHANNEL]

/** Valores aceptados de `assistChannel`, en orden estable para validadores. */
export const ASSIST_CHANNEL_VALUES = Object.values(ASSIST_CHANNEL) as readonly AssistChannel[]
