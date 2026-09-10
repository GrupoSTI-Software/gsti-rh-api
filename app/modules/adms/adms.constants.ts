/**
 * Constantes del canal ADMS del checador ZKTeco (spec v2, secciones 2, 4 y 13).
 *
 * Fuente del protocolo: `adms-probe/bateria-final-spike-v5l.md` rev. 5. Todo lo
 * que aqui se afirma como validado tiene captura; lo demas esta marcado como
 * hipotesis y tiene su prueba de hardware en la seccion 16 del spec.
 */

/** Serie del equipo tal como viaja en `?SN=`. Fuera del patron no se toca la base. */
export const ADMS_SERIAL_PATTERN = /^[A-Za-z0-9-]{6,32}$/

/** Verdadero si el valor es una serie con formato aceptable. */
export function isValidDeviceSerial(value: unknown): value is string {
  return typeof value === 'string' && ADMS_SERIAL_PATTERN.test(value)
}

/**
 * `Stamp=` del query. El firmware siempre declara un entero (238 capturas con
 * `Stamp=9999`). El valor se guarda y VUELVE al equipo dentro del bloque de
 * saludo, asi que un valor con salto de linea inyectaria opciones en el
 * aparato: fuera del patron no se guarda ni se devuelve (spec 13, regla 13).
 */
export const ADMS_STAMP_PATTERN = /^\d{1,30}$/

export function isValidStamp(value: unknown): value is string {
  return typeof value === 'string' && ADMS_STAMP_PATTERN.test(value)
}

/**
 * `table=` del query. Lista abierta pero acotada: el nombre entra en columnas
 * de ancho fijo y en incidentes. Fuera del patron se trata como sin tabla.
 */
export const ADMS_TABLE_PATTERN = /^[A-Za-z0-9_./-]{1,50}$/

export function isValidUploadTable(value: unknown): value is string {
  return typeof value === 'string' && ADMS_TABLE_PATTERN.test(value)
}

/** Ancho de `adms_raw_messages.adms_raw_message_content_type`. */
export const ADMS_CONTENT_TYPE_MAX_LENGTH = 100

/**
 * El perfil se lee por `access_point_id`, que es UNIQUE, sin el corte por
 * empresa: la fila puede traer la empresa anterior si el equipo se reasigno.
 */
export const ADMS_PROFILE_UNSCOPED_REASON =
  'canal ADMS: perfil del equipo por access_point_id (UNIQUE) para realinear la empresa'

/** Tope del cuerpo crudo de una subida (OPERLOG con templates cabe de sobra). */
export const ADMS_MAX_BODY_BYTES = 4 * 1024 * 1024

/** Tope de lineas por subida; el firmware manda lotes de 15 a 20. */
export const ADMS_MAX_LINES_PER_UPLOAD = 2000

/** Tamano de trozo con que se entregan las lineas a los procesadores. */
export const ADMS_PROCESS_CHUNK_LINES = 200

/** Motivos de las dos lecturas fuera de scope del canal (spec 13, regla 2). */
export const ADMS_UNKNOWN_SERIAL_UNSCOPED_REASON =
  'canal ADMS: serie desconocida, cuarentena sin empresa'
export const ADMS_PHOTO_TOKEN_UNSCOPED_REASON =
  'canal ADMS: descarga de foto por token opaco, empresa resuelta desde la publicacion'

/** Ventana en la que dos IP distintas para la misma serie cuentan como anomalia. */
export const ADMS_IP_ANOMALY_WINDOW_SECONDS = 300

/** Limites del canal (spec 4.2 y 4.6). Store del limiter en memoria, por worker. */
export const ADMS_RATE = {
  devicePerMinute: 300,
  ipPerMinute: 1200,
  photoPerMinute: 60,
  unknownSerialPerHour: 20,
  unknownSerialBlockMinutes: 15,
  quarantineRowsPerIpPerDay: 200,
  deviceLinesPerWindow: 5000,
  deviceBytesPerWindow: 8 * 1024 * 1024,
  deviceWindow: '5 minutes',
} as const

/** Tablas cuyo avance se devuelve en el saludo. Solo ATTLOG, OPERLOG y BIODATA traen `Stamp`. */
export const ADMS_STAMP_TABLES = ['ATTLOG', 'OPERLOG', 'USERINFO', 'ATTPHOTO', 'BIODATA'] as const
export type AdmsStampTable = (typeof ADMS_STAMP_TABLES)[number]

/** Valor inicial del avance de una tabla sin subidas registradas. */
export const ADMS_STAMP_INITIAL = '0'

/**
 * Variante del bloque de saludo. `extended` agrega TransFlag, Stamp y OpStamp al
 * bloque escueto de la sonda; `minimal` es el bloque exacto que la sonda emitia
 * por defecto. La variante en el cable de las sesiones T&A no tiene captura
 * (spec 16.1): la constante permite volver sin desplegar.
 */
export const ADMS_HANDSHAKE_VARIANT: 'extended' | 'minimal' = 'extended'

/** Valores validados del bloque de saludo (adms-probe.mjs l.147-161). */
export const ADMS_HANDSHAKE = {
  serverVer: '2.4.1 2024-01-01',
  getOptionFrom: 'attlog,userinfo',
  errorDelay: 30,
  delay: 5,
  transTimes: '00:00;23:59',
  transInterval: 1,
  realtime: 1,
  encrypt: 0,
} as const

/** TransFlag moderno con todos los tipos, el que hizo subir rostros en CA. */
export const ADMS_TRANS_FLAG =
  'TransData AttLog OpLog AttPhoto EnrollUser ChgUser EnrollFP ChgFP FPImag FACE UserPic BioPhoto'

/** Bloque de opciones para `POST /iclock/push` (dialecto CA, adms-probe.mjs l.165-182). */
export const ADMS_CA_PUSH_OPTIONS = {
  serverVersion: '2.0.1',
  serverName: 'ADMS',
  pushVersion: '2.0.1',
  errorDelay: 10,
  delay: 5,
  transTimes: '00:00;23:59',
  transInterval: 1,
  realtime: 1,
  encrypt: 0,
} as const

/** Prefijo del codigo de registro estable por dispositivo (`RegistryCode=RC<id>`). */
export const ADMS_REGISTRY_CODE_PREFIX = 'RC'

/** Acuse pelado: series desconocidas, `ping`, `devicecmd`, `getrequest` sin cola. */
export const ADMS_OK = 'OK'

/** Acuse de subida: literal con espacio, `n` = lineas no vacias (validado). */
export function admsAck(lineCount: number): string {
  return `${ADMS_OK}: ${lineCount}`
}

/** Cuenta lineas no vacias igual que la sonda (`raw.split('\n').filter(l => l.trim())`). */
export function countNonEmptyLines(body: string): number {
  if (body.length === 0) return 0
  return body.split('\n').filter((line) => line.trim().length > 0).length
}

/** Tablas que el canal reconoce en `POST /iclock/cdata?table=`. */
export const ADMS_UPLOAD_TABLE = {
  OPTIONS: 'options',
  ATTLOG: 'ATTLOG',
  OPERLOG: 'OPERLOG',
  BIODATA: 'BIODATA',
  RTLOG: 'rtlog',
  RTSTATE: 'rtstate',
  TABLEDATA: 'tabledata',
} as const

/** Tablas que solo existen en el dialecto CA (Push 2.0). Verlas marca el dialecto. */
export const ADMS_CA_TABLES: readonly string[] = ['rtlog', 'rtstate', 'tabledata']

/** Tablas del dialecto clasico T&A. Verlas marca el dialecto. */
export const ADMS_TA_TABLES: readonly string[] = ['ATTLOG', 'OPERLOG', 'BIODATA']

/**
 * Rutas del protocolo que NO son tablas de datos (spec 4.1).
 *
 * `registry` es el alta del equipo, `push` su configuracion y `devicecmd` el
 * acuse de un comando. Se etiquetan como "tabla" solo para que el crudo quede
 * guardado con su origen; tratarlas como tabla desconocida levantaria un
 * incidente por cada arranque y por cada acuse, y ese ruido tapa los incidentes
 * que si hay que mirar.
 *
 * Su cuerpo se atiende en otro sitio: el codigo de registro lo escribe el
 * controlador y el acuse lo correlaciona la cola de comandos.
 */
export const ADMS_PROTOCOL_ROUTES: readonly string[] = ['registry', 'push', 'devicecmd']

/** Clases de incidente del canal (spec 10, `adms_incidents._kind`). */
export const ADMS_INCIDENT_KIND = {
  SERIAL_MISSING: 'serial_missing',
  SERIAL_PROBE: 'serial_probe',
  DEVICE_INACTIVE: 'device_inactive',
  IP_ANOMALY: 'ip_anomaly',
  IP_DENIED: 'ip_denied',
  DIALECT_CA: 'dialect_ca',
  UNKNOWN_TABLE: 'unknown_table',
  UNKNOWN_LAYOUT: 'unknown_layout',
  UNKNOWN_PLATFORM: 'unknown_platform',
  VERSION_CHANGED: 'version_changed',
  VERSION_SOURCE_MISMATCH: 'version_source_mismatch',
  /** Acuse de un comando que no existe o que es de otro dispositivo (spec 6.5). */
  ORPHAN_ACK: 'orphan_ack',
  /**
   * Acuse sobre un comando que no estaba esperando respuesta (spec 6.2).
   *
   * El comando existe y es de ese equipo, pero su estado no admite el acuse:
   * nunca salio, se cancelo, o el barrido ya lo dio por fallido. Se avisa en
   * vez de aplicarlo porque acreditarlo marcaria como hecho algo que no paso.
   */
  STALE_ACK: 'stale_ack',
  /** Un blob biometrico que no pasa la validacion de la boveda (spec 7.1). */
  INVALID_TEMPLATE: 'invalid_template',
  /** El reloj del equipo esta corrido mas alla del umbral (spec 6.7). */
  CLOCK_DRIFT: 'clock_drift',
  /** Deriva de casi una hora exacta: huele a cambio de horario sin aplicar. */
  CLOCK_DST_SUSPECTED: 'clock_dst_suspected',
  PARSE_ERROR: 'parse_error',
  PERSIST_ERROR: 'persist_error',
  OVERSIZE_BODY: 'oversize_body',
  OVERSIZE_UPLOAD: 'oversize_upload',
  RATE_LIMITED: 'rate_limited',
  RESEND_LOOP: 'resend_loop',
  TIMEZONE_INVALID: 'timezone_invalid',
  OPLOG: 'oplog',
  /** El equipo pidio una foto y no se le pudo dar (spec 7.3). */
  PHOTO_DOWNLOAD_FAILED: 'photo_download_failed',
  /** El equipo acuso el borrado pero su padron sigue declarando el PIN (spec 8.1). */
  REVOKE_NOT_APPLIED: 'revoke_not_applied',
  /**
   * El equipo declara a alguien cuya baja ya se cerro a mano (spec 8.1).
   *
   * Se cerro dando por muerto el aparato y el aparato volvio. La persona puede
   * marcar en una puerta de la que ya se le retiro.
   */
  REVOKED_STILL_PRESENT: 'revoked_still_present',
  /**
   * El equipo declara una version de algoritmo de huella que ningun template
   * del colaborador alcanza, asi que la copia no se encolo (spec 7.4).
   *
   * El corte por version es correcto --un template de otra generacion se
   * descarta dentro del aparato sin avisar-- pero callarlo deja al equipo con
   * gente dada de alta que no puede identificarse, y nadie se entera hasta que
   * alguien no puede entrar.
   */
  TEMPLATE_VERSION_MISMATCH: 'template_version_mismatch',
  /**
   * El equipo declara menos gente dentro de la que se le dio de alta.
   *
   * Un reset de fabrica, un cambio de algoritmo de huella --que borra todo lo
   * que el aparato tenia-- o un reemplazo dejan al servidor creyendo que la
   * gente sigue registrada. Nadie lo nota hasta que alguien se queda parado en
   * la puerta, porque del lado de aca todo figura confirmado.
   */
  DEVICE_ROSTER_SHRUNK: 'device_roster_shrunk',
  /**
   * La direccion por la que llego no corresponde al secreto de esa serie.
   *
   * O el checador perdio su direccion --un reset, alguien que la reescribio--
   * o alguien esta usando su serie desde otro lado. Las dos cosas se atienden
   * igual: no se le contesta y queda constancia.
   */
  CHANNEL_SECRET_MISMATCH: 'channel_secret_mismatch',
  /** El equipo sigue hablando por el dominio comun: le falta migrar. */
  CHANNEL_SECRET_MISSING: 'channel_secret_missing',
  /** Una misma IP prueba direcciones que no son de nadie. */
  CHANNEL_HOST_PROBE: 'channel_host_probe',
  /** El aparato declara plataforma o firmware distintos de los guardados. */
  DEVICE_IDENTITY_CHANGED: 'device_identity_changed',
} as const
export type AdmsIncidentKind = (typeof ADMS_INCIDENT_KIND)[keyof typeof ADMS_INCIDENT_KIND]

/**
 * Incidentes abiertos que explican por que un equipo no tiene las copias.
 *
 * Uno las retiene --con una anomalia de IP el canal no despacha nada que lleve
 * template-- y el otro las impide: si la version no cruza no hay nada que
 * mandar. Para la matriz del colaborador la pregunta es la misma, "por que no
 * estan ahi", asi que se responden juntos y el consumidor distingue por `kind`.
 */
export const ADMS_COPY_BLOCKING_KINDS: readonly AdmsIncidentKind[] = [
  ADMS_INCIDENT_KIND.IP_ANOMALY,
  ADMS_INCIDENT_KIND.TEMPLATE_VERSION_MISMATCH,
]

/** Severidad del incidente. */
export const ADMS_INCIDENT_SEVERITY = ['info', 'warning', 'error'] as const
export type AdmsIncidentSeverity = (typeof ADMS_INCIDENT_SEVERITY)[number]

/** Estado del crudo (spec 10). Esta rebanada solo escribe `received`. */
export const ADMS_RAW_STATUS = {
  RECEIVED: 'received',
  PROCESSED: 'processed',
  PARTIAL: 'partial',
  UNPARSED: 'unparsed',
  FAILED: 'failed',
} as const
export type AdmsRawStatus = (typeof ADMS_RAW_STATUS)[keyof typeof ADMS_RAW_STATUS]

/** Dialecto detectado por lo que sube el equipo. */
export const ADMS_DIALECT = { TA: 'ta', CA: 'ca', UNKNOWN: 'unknown' } as const
export type AdmsDialect = (typeof ADMS_DIALECT)[keyof typeof ADMS_DIALECT]
