import { BIO_PIN_PATTERN } from '#modules/biometric-vault/biometric_vault.constants'

export interface BiodataRow {
  lineNumber: number
  pin: string
  bioNo: number
  bioIndex: number
  valid: number
  duress: number
  bioType: number
  majorVer: string | null
  minorVer: string | null
  format: number
  template: string
}

export interface BiodataParseResult {
  rows: BiodataRow[]
  unparsed: number[]
}

/**
 * Corta un campo `clave=valor` en el PRIMER `=`.
 *
 * No es un detalle de estilo. El equipo emitio literalmente `FP PIN==1`
 * (captura `2026-08-12T14-44-20-457Z-0010-cdata.txt`): con este corte la clave
 * es `PIN` y el valor `=1`, que no pasa el patron de PIN y manda la subida a
 * retencion. Cualquier otro corte podria convertirlo en el PIN `1` y colgarle
 * esa huella a otra persona.
 */
export function splitField(fragment: string): { key: string; value: string } | null {
  const index = fragment.indexOf('=')
  if (index <= 0) return null
  return { key: fragment.slice(0, index).trim(), value: fragment.slice(index + 1) }
}

/** Campos de una linea con encabezado, indexados por clave en minusculas. */
export function fieldsOf(line: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const fragment of line.split('\t')) {
    const pair = splitField(fragment)
    if (pair && pair.key.length > 0) fields.set(pair.key.toLowerCase(), pair.value)
  }
  return fields
}

function intOf(fields: Map<string, string>, key: string, fallback: number | null): number | null {
  const raw = fields.get(key)
  if (raw === undefined || raw.trim().length === 0) return fallback
  const value = Number(raw.trim())
  return Number.isInteger(value) ? value : fallback
}

function textOf(fields: Map<string, string>, key: string): string | null {
  const raw = fields.get(key)
  return raw !== undefined && raw.trim().length > 0 ? raw.trim() : null
}

/**
 * Interpreta `table=BIODATA` (spec 7.1). Forma medida en hardware:
 *
 *   BIODATA Pin=9998<TAB>No=0<TAB>Index=0<TAB>Valid=1<TAB>Duress=0<TAB>
 *   Type=9<TAB>MajorVer=39<TAB>MinorVer=3<TAB>Format=0<TAB>Tmp=<base64>
 *
 * El blob viaja VERBATIM: no se recorta ni se normaliza. `MajorVer` describe el
 * blob, no el equipo.
 */
export function parseBiodataBody(body: string): BiodataParseResult {
  const rows: BiodataRow[] = []
  const unparsed: number[] = []

  for (const [index, line] of body.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue
    const lineNumber = index + 1

    const withoutHeader = line.startsWith('BIODATA ') ? line.slice('BIODATA '.length) : line
    const fields = fieldsOf(withoutHeader)

    const pin = fields.get('pin')?.trim() ?? ''
    const template = fields.get('tmp') ?? ''
    const bioType = intOf(fields, 'type', null)
    const bioNo = intOf(fields, 'no', null)

    if (!BIO_PIN_PATTERN.test(pin) || template.length === 0 || bioType === null || bioNo === null) {
      unparsed.push(lineNumber)
      continue
    }

    rows.push({
      lineNumber,
      pin,
      bioNo,
      bioIndex: intOf(fields, 'index', 0) ?? 0,
      valid: intOf(fields, 'valid', 1) ?? 1,
      duress: intOf(fields, 'duress', 0) ?? 0,
      bioType,
      majorVer: textOf(fields, 'majorver'),
      minorVer: textOf(fields, 'minorver'),
      format: intOf(fields, 'format', 0) ?? 0,
      template,
    })
  }

  return { rows, unparsed }
}
