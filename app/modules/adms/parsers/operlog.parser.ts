import { BIO_PIN_PATTERN } from '#modules/biometric-vault/biometric_vault.constants'
import { fieldsOf } from './biodata.parser.js'

export interface OperlogUserRow {
  lineNumber: number
  pin: string
  name: string | null
}

export interface OperlogFingerprintRow {
  lineNumber: number
  pin: string
  fingerId: number
  declaredSize: number | null
  valid: number
  template: string
}

export interface OperlogParseResult {
  users: OperlogUserRow[]
  fingerprints: OperlogFingerprintRow[]
  /** Cuantas lineas de bitacora de operacion trajo el lote. */
  oplogs: number
  unparsed: number[]
}

/**
 * Interpreta `table=OPERLOG`, que mezcla tres cosas (spec 4.5). Formas medidas:
 *
 *   OPLOG 4<TAB>0<TAB>2026-08-12 08:17:48<TAB>0<TAB>0<TAB>0<TAB>0
 *   USER PIN=9998<TAB>Name=PRUEBA REPLICA<TAB>Pri=0<TAB>...
 *   FP PIN=9999<TAB>FID=1<TAB>Size=1200<TAB>Valid=1<TAB>TMP=<base64>
 *
 * `Size` es informativo: si no cuadra con el blob se anota, no se corrige. El
 * equipo es la fuente del dato, no nosotros.
 */
export function parseOperlogBody(body: string): OperlogParseResult {
  const users: OperlogUserRow[] = []
  const fingerprints: OperlogFingerprintRow[] = []
  const unparsed: number[] = []
  let oplogs = 0

  for (const [index, line] of body.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue
    const lineNumber = index + 1

    if (line.startsWith('OPLOG')) {
      oplogs += 1
      continue
    }

    if (line.startsWith('USER ')) {
      const fields = fieldsOf(line.slice('USER '.length))
      const pin = fields.get('pin')?.trim() ?? ''
      if (!BIO_PIN_PATTERN.test(pin)) {
        unparsed.push(lineNumber)
        continue
      }
      const name = fields.get('name')?.trim() ?? ''
      users.push({ lineNumber, pin, name: name.length > 0 ? name : null })
      continue
    }

    if (line.startsWith('FP ')) {
      const fields = fieldsOf(line.slice('FP '.length))
      const pin = fields.get('pin')?.trim() ?? ''
      const template = fields.get('tmp') ?? ''
      const rawFid = fields.get('fid')?.trim() ?? ''
      const fingerId = Number(rawFid)

      if (!BIO_PIN_PATTERN.test(pin) || template.length === 0 || !Number.isInteger(fingerId)) {
        unparsed.push(lineNumber)
        continue
      }

      const rawSize = fields.get('size')?.trim() ?? ''
      const declaredSize = Number(rawSize)
      const rawValid = fields.get('valid')?.trim() ?? ''
      const valid = Number(rawValid)

      fingerprints.push({
        lineNumber,
        pin,
        fingerId,
        declaredSize: Number.isInteger(declaredSize) ? declaredSize : null,
        valid: Number.isInteger(valid) ? valid : 1,
        template,
      })
      continue
    }

    unparsed.push(lineNumber)
  }

  return { users, fingerprints, oplogs, unparsed }
}
