import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058544 — mitigación de N+1 en `setDateCalendar`. El sync de
 * checadores escribe el calendario de asistencia registro por registro; si
 * el hook `EmployeeAssistCalendar.assignBusinessUnitId` resolviera la unidad
 * de negocio por fila, cada alta lanzaría una consulta extra a `employees`.
 *
 * Fix: resolver la BU una sola vez por lote (la llamada a `setDateCalendar`
 * ya está acotada a un empleado) y asignarla al modelo antes de `save()` —
 * el guard del hook (`if (instance.businessUnitId) return`) la respeta.
 */

const SERVICE_FILE = join(process.cwd(), 'app/services/sync_assists_service.ts')

function readService(): string {
  return readFileSync(SERVICE_FILE, 'utf-8')
}

function extractFunctionBody(content: string, signature: string): string {
  const start = content.indexOf(signature)
  if (start === -1) {
    throw new Error(`No se encontró "${signature}" en sync_assists_service.ts`)
  }
  // Recorta hasta el próximo método de nivel de clase (heurística: siguiente
  // "async " al inicio de línea con la misma indentación de 2 espacios).
  const rest = content.slice(start)
  const nextMethodMatch = rest.slice(signature.length).match(/\n {2}async \w{2,}\s*\(/)
  const end = nextMethodMatch ? signature.length + nextMethodMatch.index! : rest.length
  return rest.slice(0, end)
}

test.group('SyncAssistsService.setDateCalendar — resolución de BU por lote (no por fila)', () => {
  test('importa el helper resolveParentBusinessUnitId', ({ assert }) => {
    const content = readService()
    assert.include(
      content,
      "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
    )
  })

  test('resuelve la BU una sola vez por llamada (antes de los bucles por día), no por fila', ({
    assert,
  }) => {
    const body = extractFunctionBody(readService(), 'async setDateCalendar (filters')

    // Debe existir exactamente una resolución vía resolveParentBusinessUnitId.
    const resolveMatches = body.match(/resolveParentBusinessUnitId\(/g) ?? []
    assert.lengthOf(
      resolveMatches,
      1,
      'debe resolver la BU una sola vez por llamada, no una vez por fila'
    )

    // La resolución debe ocurrir antes de entrar a los bucles que escriben filas.
    const resolveIndex = body.indexOf('resolveParentBusinessUnitId(')
    const firstLoopIndex = body.indexOf('for (const calendarObject of calendarDay)')
    const secondLoopIndex = body.indexOf('while (current <= end)')

    assert.isAbove(resolveIndex, -1)
    assert.isAbove(firstLoopIndex, -1)
    assert.isAbove(secondLoopIndex, -1)
    assert.isBelow(resolveIndex, firstLoopIndex, 'la resolución debe preceder al primer bucle')
    assert.isBelow(resolveIndex, secondLoopIndex, 'la resolución debe preceder al segundo bucle')
  })

  test('asigna la BU ya resuelta a cada fila antes de save(), en ambos sitios de escritura', ({
    assert,
  }) => {
    const body = extractFunctionBody(readService(), 'async setDateCalendar (filters')

    const assignMatches = body.match(/employeeAssistCalendar\.businessUnitId = businessUnitId/g) ?? []
    assert.lengthOf(
      assignMatches,
      2,
      'debe asignar businessUnitId en los 2 sitios de escritura (update-o-crea y creación por rango)'
    )

    // La asignación debe preceder a cada save() para que el guard del hook la respete.
    const firstAssignIndex = body.indexOf('employeeAssistCalendar.businessUnitId = businessUnitId')
    const firstSaveIndex = body.indexOf('await employeeAssistCalendar.save()')
    assert.isBelow(firstAssignIndex, firstSaveIndex)

    const secondAssignIndex = body.lastIndexOf(
      'employeeAssistCalendar.businessUnitId = businessUnitId'
    )
    const secondSaveIndex = body.lastIndexOf('await employeeAssistCalendar.save()')
    assert.isBelow(secondAssignIndex, secondSaveIndex)
  })

  test('no resuelve la BU vía otra ruta (payload, sucursales) — siempre desde Employee', ({
    assert,
  }) => {
    const body = extractFunctionBody(readService(), 'async setDateCalendar (filters')
    assert.match(
      body,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query\(\)\.where\('employeeId', filters\.employeeID as number\)/
    )
  })
})

test.group('AssistsService.updateAssistCalendar — reutiliza el mismo camino sin N+1', () => {
  test('delega en SyncAssistsService.setDateCalendar (no inserta crudo)', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/assist_service.ts'), 'utf-8')
    const start = content.indexOf('async updateAssistCalendar(')
    assert.isAbove(start, -1)
    const body = content.slice(start, start + 600)
    assert.include(body, 'syncAssistsService.setDateCalendar(filter)')
  })
})
