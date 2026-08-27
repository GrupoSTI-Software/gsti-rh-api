import { createHash } from 'node:crypto'
import type { DateTime } from 'luxon'

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
