/**
 * Catalogo estable de codigos de error del canal ADMS. Gramatica `ADMS.<BUCKET>.NNN`
 * (spec v2, seccion 12). Los del canal publico nunca viajan al equipo (responde
 * texto plano); se usan en incidentes y en las rutas privadas de operacion.
 */
export const ADMS_ERROR_CODES = {
  /** `SN` ausente, vacia o fuera del patron. */
  DEV_SERIAL_INVALID: 'ADMS.DEV.001',
  /** Serie sin punto de acceso registrado. */
  DEV_SERIAL_UNKNOWN: 'ADMS.DEV.002',
  /** Punto de acceso con `access_point_active = 0`. */
  DEV_INACTIVE: 'ADMS.DEV.003',
  /** IP fuera de los CIDR permitidos del punto de acceso. */
  DEV_IP_DENIED: 'ADMS.DEV.004',
  /** Layout de ATTLOG sin mapa para la plataforma. */
  VAL_LAYOUT_UNKNOWN: 'ADMS.VAL.001',
  /** Linea que no se pudo parsear. */
  VAL_LINE_UNPARSEABLE: 'ADMS.VAL.002',
  /** Zona horaria configurada invalida. */
  VAL_TIMEZONE_INVALID: 'ADMS.VAL.003',
  /** Fallo de persistencia en el canal. */
  SYS_PERSIST: 'ADMS.SYS.001',
  /** Cuerpo por encima de `ADMS_MAX_BODY_BYTES`. */
  SIZE_BODY: 'ADMS.SIZE.001',
  /** Lineas por encima de `ADMS_MAX_LINES_PER_UPLOAD`. */
  SIZE_LINES: 'ADMS.SIZE.002',
  /** Limite de peticiones, lineas o bytes del canal. */
  RATE_LIMIT: 'ADMS.RATE.001',
  /** Publicacion de foto no encontrada o vencida. */
  PHOTO_NOT_FOUND: 'ADMS.PHOTO.001',
  /** Serie viva en otra empresa al reclamar. */
  QUAR_SERIAL_TAKEN: 'ADMS.QUAR.001',
  /** Cuarentena no encontrada. */
  QUAR_NOT_FOUND: 'ADMS.QUAR.002',
  /** La serie tecleada no coincide con ninguna pendiente. */
  QUAR_SERIAL_MISMATCH: 'ADMS.QUAR.003',
  /** Fila bloqueada por intentos fallidos. */
  QUAR_LOCKED: 'ADMS.QUAR.004',
  /** PIN ocupado en el dispositivo. */
  PIN_TAKEN: 'ADMS.PIN.001',
  /** Asignacion sin PIN. */
  PIN_MISSING: 'ADMS.PIN.002',
  /** PIN fuera del patron. */
  PIN_INVALID: 'ADMS.PIN.003',
  /** PIN pendiente no encontrado. */
  PIN_PENDING_NOT_FOUND: 'ADMS.PIN.004',
  /** Recurso fuera del alcance de la empresa (responde 404). */
  AUTHZ_OUT_OF_SCOPE: 'ADMS.AUTHZ.001',
  AUTHZ_FORBIDDEN: 'ADMS.AUTHZ.002',
  VAL_INPUT: 'ADMS.VAL.004',
  SYS_INTERNAL: 'ADMS.SYS.002',
} as const

export type AdmsErrorCode = (typeof ADMS_ERROR_CODES)[keyof typeof ADMS_ERROR_CODES]
