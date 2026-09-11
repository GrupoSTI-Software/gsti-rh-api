import type { DateTime } from 'luxon'
import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import { DeviceCommandError } from '#exceptions/device_command_error'

/** Origen del formato: el ano 2000 es el cero de la cuenta. */
const ZK_EPOCH_YEAR = 2000
/** El formato reserva 31 ranuras por mes, existan o no esos dias. */
const DAYS_PER_MONTH_SLOT = 31
const MONTHS_PER_YEAR = 12
const SECONDS_PER_DAY = 86400

export interface ZkDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Hora empaquetada de ZKTeco para `SET OPTION DateTime` (validada en hardware,
 * bateria rev.5).
 *
 * NO es un epoch. Es un contador con meses de 31 dias fijos:
 *   t = ((y - 2000) * 12 * 31 + (m - 1) * 31 + (d - 1)) * 86400 + h*3600 + min*60 + s
 *
 * Esta es la UNICA implementacion de la formula en el sistema, y no por gusto:
 * la bateria midio que con la formula equivocada el equipo responde `Return=0`
 * en 79 ms mientras mueve su reloj 180 dias atras, con un acuse identico al de
 * la formula correcta. Un equipo con la fecha movida genera checadas que entran
 * a nomina con la misma pinta que las buenas.
 *
 * Recibe la hora tal como debe verse en la PANTALLA del equipo: el llamador ya
 * la puso en la zona del dispositivo. Esta funcion no convierte zonas.
 */
export function toZkDateTime(local: DateTime): number {
  if (!local.isValid) {
    throw new DeviceCommandError(
      'La hora para el reloj del checador no es valida',
      DEVICE_COMMAND_ERROR_CODES.VAL_MISSING_FIELD,
      422,
      'hora-invalida'
    )
  }
  if (local.year < ZK_EPOCH_YEAR) {
    throw new DeviceCommandError(
      `El formato del checador no representa fechas anteriores a ${ZK_EPOCH_YEAR}`,
      DEVICE_COMMAND_ERROR_CODES.VAL_MISSING_FIELD,
      422,
      'hora-fuera-de-rango'
    )
  }

  const days =
    (local.year - ZK_EPOCH_YEAR) * MONTHS_PER_YEAR * DAYS_PER_MONTH_SLOT +
    (local.month - 1) * DAYS_PER_MONTH_SLOT +
    (local.day - 1)

  return days * SECONDS_PER_DAY + local.hour * 3600 + local.minute * 60 + local.second
}

/**
 * Vuelta atras del empaquetado. Existe para que la prueba pueda ir y volver y
 * demostrar que el entero representa la fecha que creemos: eso es exactamente
 * lo que fallo en hardware sin que el acuse lo delatara.
 */
export function fromZkDateTime(value: number): ZkDateParts {
  const days = Math.floor(value / SECONDS_PER_DAY)
  const secondsOfDay = value - days * SECONDS_PER_DAY

  const year = ZK_EPOCH_YEAR + Math.floor(days / (MONTHS_PER_YEAR * DAYS_PER_MONTH_SLOT))
  const withinYear = days % (MONTHS_PER_YEAR * DAYS_PER_MONTH_SLOT)
  const month = Math.floor(withinYear / DAYS_PER_MONTH_SLOT) + 1
  const day = (withinYear % DAYS_PER_MONTH_SLOT) + 1

  return {
    year,
    month,
    day,
    hour: Math.floor(secondsOfDay / 3600),
    minute: Math.floor((secondsOfDay % 3600) / 60),
    second: secondsOfDay % 60,
  }
}
