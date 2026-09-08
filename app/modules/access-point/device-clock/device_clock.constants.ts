/**
 * Umbrales del reloj del checador (spec ADMS 6.7).
 */

/** Deriva a partir de la cual el reloj se considera corrido. */
export const ADMS_CLOCK_DRIFT_THRESHOLD_SECONDS = 60

/**
 * Muestra descartada por vieja. Una diferencia de horas no es deriva de reloj:
 * es una checada que el equipo tenia guardada desde antes y acaba de subir.
 */
export const ADMS_CLOCK_SAMPLE_MAX_ABS_SECONDS = 6 * 60 * 60

/** Cuantas muestras se conservan para la mediana. */
export const ADMS_CLOCK_SAMPLE_WINDOW = 20

/** Una hora exacta de desfase huele a cambio de horario, no a reloj corrido. */
export const ADMS_CLOCK_DST_OFFSET_SECONDS = 3600
export const ADMS_CLOCK_DST_TOLERANCE_SECONDS = 180

/** Sin un ajuste en este plazo, la deriva vuelve a encolar uno. */
export const ADMS_CLOCK_SYNC_COOLDOWN_HOURS = 24

/** Dos ajustes seguidos sin corregir: el problema no se arregla a distancia. */
export const ADMS_CLOCK_MAX_AUTOMATIC_SYNCS = 2

/** Sin checadas en este plazo, un ajuste acusado queda sin verificar. */
export const ADMS_CLOCK_UNVERIFIED_AFTER_DAYS = 5
