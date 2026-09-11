export interface ParsedAck {
  id: number
  /** `null` cuando el equipo no lo declara: no se interpreta como exito. */
  returnCode: number | null
  cmd: string | null
  /** Volcado que algunos comandos anexan tras el acuse (`INFO`). */
  dump: string | null
}

const PAIR = /^([A-Za-z]+)=(.*)$/s

/**
 * Interpreta el cuerpo de `POST /iclock/devicecmd` (spec 6.5).
 *
 * El equipo manda `ID=..&Return=..&CMD=..`, a veces separado por saltos de
 * linea, y a veces anexa un volcado despues. Sin `ID` numerico devuelve `null`
 * para que el canal levante `orphan_ack` en vez de adivinar a que comando se
 * refiere: acreditar un acuse al comando equivocado marcaria como ejecutado
 * algo que nunca se ejecuto.
 */
export function parseDeviceCmdBody(body: string): ParsedAck | null {
  const [head, ...rest] = body.split(/\r?\n/)
  const fields = new Map<string, string>()

  for (const fragment of head.split('&')) {
    const match = PAIR.exec(fragment.trim())
    if (match) fields.set(match[1].toUpperCase(), match[2].trim())
  }

  // Formato por lineas: cada linea siguiente puede ser otro par o el volcado.
  const dumpLines: string[] = []
  for (const line of rest) {
    const match = PAIR.exec(line.trim())
    if (match && !fields.has(match[1].toUpperCase())) {
      fields.set(match[1].toUpperCase(), match[2].trim())
      continue
    }
    if (line.trim().length > 0) dumpLines.push(line)
  }

  const rawId = fields.get('ID')
  if (rawId === undefined) return null
  const id = Number(rawId)
  if (!Number.isInteger(id)) return null

  const rawReturn = fields.get('RETURN')
  const returnCode = rawReturn === undefined ? null : Number(rawReturn)

  return {
    id,
    returnCode: returnCode !== null && Number.isInteger(returnCode) ? returnCode : null,
    cmd: fields.get('CMD') ?? null,
    dump: dumpLines.length > 0 ? dumpLines.join('\n') : null,
  }
}
