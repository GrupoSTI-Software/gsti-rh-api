import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import { DeviceCommandError } from '#exceptions/device_command_error'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_NAME_MAX_LENGTH,
  type DeviceCommandKind,
} from '../device_command.constants.js'

/** Campos que puede llevar un comando. Cada tipo usa los suyos. */
export interface DeviceCommandFields {
  pin?: string
  name?: string
  fid?: number
  bioNo?: number
  bioType?: number
  valid?: number
  duress?: number
  majorVer?: string
  minorVer?: string
  template?: string
  url?: string
  dateTime?: string
  /** Tamano del blob tal como lo declaro el equipo de origen. */
  size?: number
  /** Plataforma del equipo destino: decide la gramatica de la huella. */
  platform?: string
}

const TAB = '\t'

/**
 * Plataformas donde la huella NO se escribe con `BIODATA`.
 *
 * Es una lista blanca a proposito: solo entra la plataforma cuyo
 * comportamiento se midio con el dedo puesto. Ante un aparato desconocido se
 * prefiere `BIODATA`, que al menos falla ruidosamente --responde `-30` si la
 * version no cuadra-- mientras que `FINGERTMP` descarta en silencio.
 *
 * `ZAM180` (SpeedFace V5L), medido el 2026-09-10 entre dos equipos de la misma
 * version: `BIODATA Type=1` con el `MajorVer` correcto respondio `Return=0` y
 * el dedo NO quedo dentro. Con `FINGERTMP` si entro, verificado marcando.
 *
 * `ZAM70` (SenseFace 2A), medido el mismo dia con el equipo puesto en VX10
 * para igualarlo a los V5L: `BIODATA Type=1 MajorVer=10` con un template ajeno
 * respondio `Return=0`, el aparato reporto `FPCount=0` un segundo despues y el
 * dedo no marcaba. El control positivo del spike en esa plataforma se habia
 * hecho con un template PROPIO del equipo, asi que escribirle uno ajeno nunca
 * se habia probado.
 *
 * El riesgo que hizo prohibir `FINGERTMP` --no lleva `MajorVer`, y sin el, al
 * cruzar versiones el equipo descarta sin avisar-- queda cubierto antes del
 * cable: no se encola una copia sin que la boveda confirme que la version del
 * template coincide con la que declara el equipo. Esa comprobacion no existia
 * cuando la regla se escribio.
 *
 * La excepcion es de la huella, no de la tabla: `BIODATA Type=9` SI escribe
 * rostro en las dos plataformas (medido en el spike).
 */
const FINGERPRINT_BY_FINGERTMP_PLATFORMS = ['ZAM180', 'ZAM70']

/** Tipo de biometrico de huella en la gramatica del equipo. */
const BIO_TYPE_FINGERPRINT = 1

function writesFingerprintByFingertmp(platform: string | undefined): boolean {
  if (!platform) return false
  return FINGERPRINT_BY_FINGERTMP_PLATFORMS.some((prefix) => platform.startsWith(prefix))
}
/** TAB separa campos y el salto de linea separa comandos: ninguno puede venir en un valor. */
const UNSAFE = /[\t\r\n]/

function safe(value: string, field: string): string {
  if (UNSAFE.test(value)) {
    throw new DeviceCommandError(
      `El campo ${field} trae un tabulador o un salto de linea`,
      DEVICE_COMMAND_ERROR_CODES.VAL_UNSAFE_FIELD,
      422,
      'campo-inseguro',
      'Un tabulador o un salto de linea partiria la orden y el equipo ejecutaria algo distinto de lo pedido.'
    )
  }
  return value
}

function required(fields: DeviceCommandFields, key: keyof DeviceCommandFields): string {
  const value = fields[key]
  if (value === undefined || value === null || String(value).length === 0) {
    throw new DeviceCommandError(
      `Falta el campo ${key} del comando`,
      DEVICE_COMMAND_ERROR_CODES.VAL_MISSING_FIELD,
      422,
      'campo-faltante'
    )
  }
  return safe(String(value), String(key))
}

/**
 * Construye la linea exacta que el equipo entiende (spec 6.4).
 *
 * La gramatica es la MEDIDA en hardware, no la del manual: `PIN=` en mayusculas
 * para `USERINFO` y `Pin=` en minusculas para `BIODATA`, TAB entre campos, y la
 * foto SIEMPRE por URL porque la version inline devolvio `Return=-1`.
 */
export function formatDeviceCommand(kind: DeviceCommandKind, fields: DeviceCommandFields): string {
  switch (kind) {
    case DEVICE_COMMAND_KIND.USER_UPSERT: {
      const pin = required(fields, 'pin')
      const name = safe(fields.name ?? '', 'name').slice(0, DEVICE_COMMAND_NAME_MAX_LENGTH)
      return [
        `DATA UPDATE USERINFO PIN=${pin}`,
        `Name=${name}`,
        'Pri=0',
        'Passwd=',
        'Card=',
        'Grp=1',
        'TZ=0000000000000000',
        'Verify=-1',
      ].join(TAB)
    }

    case DEVICE_COMMAND_KIND.USER_DELETE:
      return `DATA DELETE USERINFO PIN=${required(fields, 'pin')}`

    case DEVICE_COMMAND_KIND.ENROLL_FP:
      return [
        `ENROLL_FP PIN=${required(fields, 'pin')}`,
        `FID=${required(fields, 'fid')}`,
        'RETRY=3',
        'OVERWRITE=1',
      ].join(TAB)

    case DEVICE_COMMAND_KIND.BIODATA_WRITE:
      if (
        fields.bioType === BIO_TYPE_FINGERPRINT &&
        writesFingerprintByFingertmp(fields.platform)
      ) {
        return [
          `DATA UPDATE FINGERTMP PIN=${required(fields, 'pin')}`,
          `FID=${required(fields, 'bioNo')}`,
          `Size=${required(fields, 'size')}`,
          `Valid=${required(fields, 'valid')}`,
          `TMP=${required(fields, 'template')}`,
        ].join(TAB)
      }

      return [
        `DATA UPDATE BIODATA Pin=${required(fields, 'pin')}`,
        `No=${required(fields, 'bioNo')}`,
        'Index=0',
        `Valid=${required(fields, 'valid')}`,
        `Duress=${fields.duress ?? 0}`,
        `Type=${required(fields, 'bioType')}`,
        `MajorVer=${required(fields, 'majorVer')}`,
        `MinorVer=${fields.minorVer ?? '0'}`,
        'Format=0',
        `Tmp=${required(fields, 'template')}`,
      ].join(TAB)

    case DEVICE_COMMAND_KIND.BIOPHOTO_WRITE:
      return [
        `DATA UPDATE BIOPHOTO PIN=${required(fields, 'pin')}`,
        'Type=9',
        'Format=1',
        `Url=${required(fields, 'url')}`,
      ].join(TAB)

    case DEVICE_COMMAND_KIND.BIOPHOTO_DELETE:
      return `DATA DELETE BIOPHOTO PIN=${required(fields, 'pin')}`

    case DEVICE_COMMAND_KIND.CLOCK_SYNC:
      return `SET OPTION DateTime=${required(fields, 'dateTime')}`

    case DEVICE_COMMAND_KIND.CHECK:
      return 'CHECK'

    /**
     * Sin campos: el equipo contesta con sus opciones en el volcado del acuse.
     * La gramatica es la del manual; su comportamiento se mide con hardware.
     */
    case DEVICE_COMMAND_KIND.INFO:
      return 'INFO'
  }
}

/** Linea de despacho: el equipo devuelve ese identificador en el acuse. */
export function formatWireLine(wireId: number, body: string): string {
  return `C:${wireId}:${body}`
}

/** `Duress` y `Valid` viajan como vienen del registro; nunca se inventan. */
export const DEVICE_COMMAND_FORMATTER_FIELD_SEPARATOR = TAB
