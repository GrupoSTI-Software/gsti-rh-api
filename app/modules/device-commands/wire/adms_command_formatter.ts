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
}

const TAB = '\t'
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
  }
}

/** Linea de despacho: el equipo devuelve ese identificador en el acuse. */
export function formatWireLine(wireId: number, body: string): string {
  return `C:${wireId}:${body}`
}

/** `Duress` y `Valid` viajan como vienen del registro; nunca se inventan. */
export const DEVICE_COMMAND_FORMATTER_FIELD_SEPARATOR = TAB
