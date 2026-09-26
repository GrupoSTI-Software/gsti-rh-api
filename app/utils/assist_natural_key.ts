import { createHash } from 'node:crypto'
import type { DateTime } from 'luxon'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import type { AssistCreateFrom } from '#constants/assist_origin'

/**
 * Consumidores: hook `@beforeSave` de `Assist`, comando `backfill:assist-natural-key`
 * y upsert ADMS (ESB-04-02-05-07). Ninguno reimplementa el algoritmo.
 */
export const ASSIST_NATURAL_KEY_VERSION = 'v1'
export const ASSIST_NATURAL_KEY_NO_SN = '__NO_SN__'
export const ASSIST_NATURAL_KEY_NO_CODE = '__NO_CODE__'
/** U+001F UNIT SEPARATOR: imposible en código de empleado o serial ZKTeco. */
export const ASSIST_NATURAL_KEY_SEPARATOR = '\u001F'
export const ASSIST_NATURAL_KEY_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss'
export const ASSIST_NATURAL_KEY_INDEX = 'assists_natural_key_unique'

/**
 * Centinelas de canal para `assist_terminal_sn` cuando el origen no aporta serie.
 *
 * `UNKNOWN` conserva el valor histórico `__NO_SN__` y es el valor semánticamente
 * correcto para toda fila sin canal derivable: el canal de los históricos es
 * irrecuperable y no se inventa.
 */
export const ASSIST_NATURAL_KEY_CHANNEL_SENTINEL = {
  APP: '__CH_APP__',
  KIOSK: '__CH_KIOSK__',
  BACKOFFICE: '__CH_BO__',
  UNKNOWN: ASSIST_NATURAL_KEY_NO_SN,
} as const

const ORIGIN_TO_CHANNEL_SENTINEL: Partial<Record<AssistCreateFrom, string>> = {
  [ASSIST_ORIGIN.SELF_SERVICE]: ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.APP,
  [ASSIST_ORIGIN.DEVICE]: ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.KIOSK,
  [ASSIST_ORIGIN.ADMIN_CAPTURE]: ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.BACKOFFICE,
}

/**
 * Serie que entra en la identidad de la checada.
 *
 * **El orden ES la regla, y no se invierte:**
 * 1. Serie real (tras `trim`) → se devuelve tal cual. Un checador con serie propia
 *    NUNCA toca un centinela: es lo que impide que la siguiente sincronización de
 *    BioTime duplique todo el histórico.
 * 2. Sin serie y con canal derivable del origen → el centinela de ese canal.
 * 3. Sin serie y sin canal derivable → `UNKNOWN` (`__NO_SN__`), que es la llave que
 *    esas filas ya tenían: los históricos no cambian de identidad.
 */
export function assistChannelSentinel(
  origin: AssistCreateFrom | null | undefined,
  terminalSn: string | null | undefined
): string {
  const serialNumber = typeof terminalSn === 'string' ? terminalSn.trim() : ''
  if (serialNumber.length > 0) return serialNumber
  if (!origin) return ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.UNKNOWN
  return ORIGIN_TO_CHANNEL_SENTINEL[origin] ?? ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.UNKNOWN
}

export interface AssistNaturalKeyInput {
  businessUnitId: number
  assistEmpCode: string | null | undefined
  assistPunchTimeUtc: DateTime
  assistTerminalSn: string | null | undefined
}

export function assistNaturalKeyPayload(input: AssistNaturalKeyInput): string {
  const code =
    input.assistEmpCode === null || input.assistEmpCode === undefined
      ? ASSIST_NATURAL_KEY_NO_CODE
      : String(input.assistEmpCode)

  const serialNumber =
    input.assistTerminalSn === null || input.assistTerminalSn === undefined
      ? ASSIST_NATURAL_KEY_NO_SN
      : String(input.assistTerminalSn)

  return [
    ASSIST_NATURAL_KEY_VERSION,
    String(Number(input.businessUnitId)),
    code.length === 0 ? ASSIST_NATURAL_KEY_NO_CODE : code,
    input.assistPunchTimeUtc.toUTC().toFormat(ASSIST_NATURAL_KEY_DATE_FORMAT),
    serialNumber.length === 0 ? ASSIST_NATURAL_KEY_NO_SN : serialNumber,
  ].join(ASSIST_NATURAL_KEY_SEPARATOR)
}

/** SHA-256 hex de 64 caracteres en minúsculas, listo para `assist_natural_key`. */
export function computeAssistNaturalKey(input: AssistNaturalKeyInput): string {
  return createHash('sha256').update(assistNaturalKeyPayload(input), 'utf8').digest('hex')
}
