import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058577 — mitigación de N+1 en `generateExceptionsForRange`.
 * La generación masiva de excepciones de lactancia hace `createMany` de
 * muchas filas del mismo empleado; si el hook resolviera la BU por fila,
 * cada alta lanzaría una consulta extra a `employees`.
 *
 * Fix: resolver la BU una sola vez por lote y setearla en cada fila —
 * el guard del hook (`if (instance.businessUnitId) return`) la respeta.
 *
 * `applyExceptionGeneral` (multi-empleado) queda fuera: no hay BU única
 * de lote; el hook por fila es el camino correcto.
 */

const SERVICE_FILE = join(process.cwd(), 'app/services/shift_exception_service.ts')

function readService(): string {
  return readFileSync(SERVICE_FILE, 'utf-8')
}

function extractFunctionBody(content: string, signature: string): string {
  const start = content.indexOf(signature)
  if (start === -1) {
    throw new Error(`No se encontró "${signature}" en shift_exception_service.ts`)
  }
  const rest = content.slice(start)
  const nextMethodMatch = rest.slice(signature.length).match(/\n {2}(async |private |public )?\w+\s*\(/)
  const end = nextMethodMatch ? signature.length + nextMethodMatch.index! : rest.length
  return rest.slice(0, end)
}

test.group('ShiftExceptionService.generateExceptionsForRange — BU por lote (no por fila)', () => {
  test('importa el helper resolveParentBusinessUnitId', ({ assert }) => {
    const content = readService()
    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
  })

  test('resuelve la BU una sola vez por llamada, antes de armar filas', ({ assert }) => {
    const body = extractFunctionBody(
      readService(),
      'private async generateExceptionsForRange(params'
    )

    const resolveMatches = body.match(/resolveParentBusinessUnitId\(/g) ?? []
    assert.lengthOf(
      resolveMatches,
      1,
      'debe resolver la BU una sola vez por lote, no una vez por fila'
    )

    const resolveIndex = body.indexOf('resolveParentBusinessUnitId(')
    const pushIndex = body.indexOf('rows.push({')
    assert.isAbove(resolveIndex, -1)
    assert.isAbove(pushIndex, -1)
    assert.isBelow(resolveIndex, pushIndex, 'la resolución debe preceder al armado de filas')
  })

  test('incluye businessUnitId ya resuelto en cada fila del lote', ({ assert }) => {
    const body = extractFunctionBody(
      readService(),
      'private async generateExceptionsForRange(params'
    )

    assert.match(body, /rows\.push\(\{[\s\S]*?businessUnitId,/)
  })

  test('resuelve la BU desde Employee (con trx si aplica), no desde el payload', ({ assert }) => {
    const body = extractFunctionBody(
      readService(),
      'private async generateExceptionsForRange(params'
    )
    assert.match(body, /Employee\.query/)
    assert.include(body, "where('employeeId', period.employeeId)")
  })
})
