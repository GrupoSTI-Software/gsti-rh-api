import type { AdmsAttlogLayout } from './parser.types.js'

export interface AttlogRow {
  lineNumber: number
  pin: string
  localTime: string
  status: number | null
  verify: number | null
  workCode: number | null
}

export interface AttlogParseResult {
  rows: AttlogRow[]
  unparsed: number[]
}

/**
 * Posicion (base 0) de cada campo por plataforma. Solo PIN, hora y verify son
 * estables entre firmwares; `status` y `workCode` se leen unicamente cuando la
 * plataforma esta en el mapa, porque el `255` que ambos equipos emiten cae en
 * columnas distintas (pos 8 en ZAM180, pos 3 en ZAM70) y confundirlo con el
 * estado convertiria una entrada en una salida (bateria rev.5).
 */
const LAYOUTS: Readonly<
  Record<AdmsAttlogLayout, { status: number | null; workCode: number | null }>
> = {
  zam180: { status: 2, workCode: 4 },
  zam70: { status: null, workCode: 4 },
}

/** Posicion del metodo de verificacion: estable en las dos plataformas medidas. */
const VERIFY_INDEX = 3

const PIN_PATTERN = /^\d{1,20}$/
const LOCAL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function intAt(fields: string[], index: number | null): number | null {
  if (index === null) return null
  const raw = fields[index]
  if (raw === undefined || raw.trim().length === 0) return null
  const value = Number(raw.trim())
  return Number.isInteger(value) ? value : null
}

/**
 * Convierte el cuerpo de un `table=ATTLOG` en filas. Nunca lanza: una linea
 * ilegible se anota en `unparsed` y el resto del lote sigue, porque el equipo
 * manda el lote completo y retenerlo entero por una linea seria perder las
 * demas (spec 5.1).
 */
export function parseAttlogBody(
  body: string,
  layout: AdmsAttlogLayout | null
): AttlogParseResult {
  const positions = layout === null ? { status: null, workCode: null } : LAYOUTS[layout]
  const rows: AttlogRow[] = []
  const unparsed: number[] = []

  const lines = body.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) continue
    const lineNumber = index + 1
    const fields = line.split('\t')
    const pin = fields[0]?.trim() ?? ''
    const localTime = fields[1]?.trim() ?? ''
    if (!PIN_PATTERN.test(pin) || !LOCAL_TIME_PATTERN.test(localTime)) {
      unparsed.push(lineNumber)
      continue
    }
    rows.push({
      lineNumber,
      pin,
      localTime,
      status: intAt(fields, positions.status),
      verify: intAt(fields, VERIFY_INDEX),
      workCode: intAt(fields, positions.workCode),
    })
  }

  return { rows, unparsed }
}
