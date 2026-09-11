/**
 * Constantes de la cola de comandos hacia el checador (spec ADMS 6).
 *
 * Todo lo que aqui se afirma como validado tiene captura en
 * `adms-probe/bateria-final-spike-v5l.md` rev. 5.
 */

export const DEVICE_COMMAND_KIND = {
  USER_UPSERT: 'user_upsert',
  USER_DELETE: 'user_delete',
  ENROLL_FP: 'enroll_fp',
  BIODATA_WRITE: 'biodata_write',
  BIOPHOTO_WRITE: 'biophoto_write',
  BIOPHOTO_DELETE: 'biophoto_delete',
  CLOCK_SYNC: 'clock_sync',
  CHECK: 'check',
  /**
   * Pide al equipo que se presente: responde con el volcado de sus opciones
   * en el acuse (spec 6.5). Es la unica via de llenar el perfil cuando el
   * aparato ya paso su saludo y no lo va a repetir.
   */
  INFO: 'info',
} as const

export type DeviceCommandKind = (typeof DEVICE_COMMAND_KIND)[keyof typeof DEVICE_COMMAND_KIND]

export const DEVICE_COMMAND_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  ACKED: 'acked',
  EXECUTED: 'executed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  /** Existe en la maquina pero ninguna politica lo produce (decision D4). */
  EXPIRED: 'expired',
} as const

export type DeviceCommandStatus =
  (typeof DEVICE_COMMAND_STATUS)[keyof typeof DEVICE_COMMAND_STATUS]

/**
 * Orden de despacho (spec 6.3). Menor sale primero: borrar a alguien que ya no
 * trabaja aqui pesa mas que cualquier alta, y una comprobacion pesa lo menos.
 */
export const DEVICE_COMMAND_PRIORITY: Readonly<Record<DeviceCommandKind, number>> = {
  [DEVICE_COMMAND_KIND.USER_DELETE]: 1,
  [DEVICE_COMMAND_KIND.CLOCK_SYNC]: 2,
  [DEVICE_COMMAND_KIND.USER_UPSERT]: 3,
  [DEVICE_COMMAND_KIND.ENROLL_FP]: 4,
  [DEVICE_COMMAND_KIND.BIODATA_WRITE]: 5,
  [DEVICE_COMMAND_KIND.BIOPHOTO_WRITE]: 5,
  [DEVICE_COMMAND_KIND.BIOPHOTO_DELETE]: 5,
  [DEVICE_COMMAND_KIND.CHECK]: 9,
  /** Sale antes que `check`: el perfil desbloquea leer bien todo lo demas. */
  [DEVICE_COMMAND_KIND.INFO]: 8,
}

/**
 * Codigos de retorno medidos en hardware. `Return=0` significa RECIBIDO, no
 * ejecutado: la bateria documenta un `Return=0` con la foto descartada y otro
 * con el reloj movido 180 dias. Solo `user_upsert` puede leerlo como ejecucion.
 */
export const DEVICE_COMMAND_RETURN_CODES: Readonly<Record<number, string>> = {
  0: 'accepted',
  [-1]: 'table_rejected',
  [-30]: 'template_version_mismatch',
  [-629]: 'dialect_mismatch',
  /**
   * Nadie completo la captura: el aparato abrio la sesion de enrolamiento y la
   * cerro solo a los ~65 s. Es el desenlace mas comun de un enrolamiento que no
   * sale, y sin nombre propio quedaba como codigo desconocido, indistinguible
   * de un fallo real frente a quien espera con la persona enfrente.
   */
  [-725]: 'enroll_timeout',
  /** Verbo del dialecto equivocado; ademas deja un usuario fantasma en el equipo. */
  [-1003]: 'wrong_dialect_verb',
  [-1004]: 'invalid_table',
}

export const DEVICE_COMMAND_UNKNOWN_RETURN = 'unknown_return_code'

/**
 * Con que se dio por ejecutado un comando (spec 6.6).
 *
 * `Return=0` significa RECIBIDO, no ejecutado: la bateria en hardware midio un
 * `Return=0` con la foto descartada y otro con el reloj movido 180 dias. Salvo
 * el alta de usuario -- donde el acuse SI es la ejecucion, porque el aparato no
 * tiene nada mas que hacer con ella -- todo lo demas necesita una prueba que
 * venga del propio equipo despues.
 */
export const DEVICE_COMMAND_EVIDENCE = {
  /** El acuse basta: solo para `user_upsert`. */
  ACK: 'ack',
  /** Una checada con la deriva ya corregida. */
  ATTLOG_DRIFT_OK: 'attlog_drift_ok',
  /** El equipo subio la huella o el rostro que se le pidio capturar. */
  BIOMETRIC_UPLOAD: 'biometric_upload',
  /** Una checada verificada con la modalidad que el comando escribio. */
  ATTLOG_VERIFY: 'attlog_verify',
  /** El contador del equipo subio respecto al que se guardo al acusar. */
  COUNTER_UP: 'counter_up',
} as const

export type DeviceCommandEvidence =
  (typeof DEVICE_COMMAND_EVIDENCE)[keyof typeof DEVICE_COMMAND_EVIDENCE]

/** Metodo de verificacion de una checada hecha con huella (gramatica ZK). */
export const ATTLOG_VERIFY_FINGERPRINT = 1

/** Motivos con los que el barrido cierra un comando colgado (spec 6.2). */
export const DEVICE_COMMAND_FAILURE = {
  INFLIGHT_TIMEOUT: 'inflight_timeout',
  NO_EVIDENCE: 'no_evidence',
} as const

/** Un comando en vuelo sin acuse por mas de esto se da por perdido. */
export const DEVICE_COMMAND_INFLIGHT_TIMEOUT_SECONDS = 180
/** El enrolamiento presencial tarda mas: la bateria midio 13 s con el dedo puesto. */
export const DEVICE_COMMAND_ENROLL_INFLIGHT_TIMEOUT_SECONDS = 120
/** Acusado sin evidencia por mas de esto se da por no ejecutado. */
export const DEVICE_COMMAND_EVIDENCE_TIMEOUT_MINUTES = 30
/** Un pendiente cuyo equipo lleva mas de esto sin latido se marca `stale`. */
export const DEVICE_COMMAND_STALE_PENDING_MINUTES = 30

/** Tope de reintentos. `user_delete` no lo tiene: dejar a un ex-colaborador dentro es un riesgo. */
export const DEVICE_COMMAND_MAX_ATTEMPTS = 3

/**
 * Cuanto se espera el acuse de un comando que ya salio, antes de darlo por
 * perdido y volver a encolarlo.
 *
 * El equipo acusa por `devicecmd` en el sondeo siguiente al que recibio la
 * orden, asi que la respuesta normal llega en segundos. Cinco minutos son
 * treinta sondeos: si a esas alturas no acuso, o no le llego o se apago en
 * medio.
 *
 * Hace falta porque un comando en vuelo BLOQUEA la cola entera de ese equipo
 * --solo se despacha uno a la vez-- y nada lo desbloqueaba: un corte de luz
 * justo despues de recibir una orden dejaba al checador sin recibir nada mas,
 * para siempre, sin un solo error en el log.
 */
export const DEVICE_COMMAND_IN_FLIGHT_TIMEOUT_MINUTES = 5

/** Tope de caracteres del nombre en `USERINFO`. El limite real del firmware no se midio. */
export const DEVICE_COMMAND_NAME_MAX_LENGTH = 24

/** Reintentos para conseguir un identificador de cable libre. */
export const DEVICE_COMMAND_WIRE_ID_RETRIES = 5
