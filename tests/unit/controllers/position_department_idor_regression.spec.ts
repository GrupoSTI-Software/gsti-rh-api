import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783372659486 — regresión de código fuente (sin DB) para el cierre de
 * IDOR en `update`/`delete`/`show` de posiciones y departamentos. Antes de
 * este fix, esos métodos cargaban el registro por su PK sin filtrar por
 * `businessUnitScope`, permitiendo editar/borrar/leer un registro de otra
 * empresa si se conocía o adivinaba el id.
 *
 * Estos tests inspeccionan el código fuente (no ejecutan un servidor ni
 * requieren BD) para que una regresión futura que vuelva a quitar el filtro
 * de scope falle de inmediato. Complementan — no sustituyen — una prueba
 * funcional end-to-end con BD real.
 */

const POSITION_CONTROLLER = join(process.cwd(), 'app/controllers/position_controller.ts')
const DEPARTMENT_CONTROLLER = join(process.cwd(), 'app/controllers/department_controller.ts')
const DEPARTMENT_SERVICE = join(process.cwd(), 'app/services/department_service.ts')

/**
 * Extrae el cuerpo de un método por su firma completa (incluyendo la llave de
 * apertura del bloque, ya que la firma en sí contiene llaves de desestructuración).
 */
function extractMethodBody(source: string, methodSignatureNeedle: string): string {
  const start = source.indexOf(methodSignatureNeedle)
  if (start === -1) {
    throw new Error(`No se encontró el método con firma: ${methodSignatureNeedle}`)
  }
  // La firma pasada ya debe terminar en la llave de apertura del bloque ("... {").
  let depth = 1
  let i = start + methodSignatureNeedle.length
  const bodyStart = i
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(bodyStart, i + 1)
}

test.group('PositionController — update/delete filtran por businessUnitScope', () => {
  test('update() carga la posición con whereIn businessUnitId y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(POSITION_CONTROLLER, 'utf-8')
    const body = extractMethodBody(content, 'async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {')

    assert.include(body, "whereIn('businessUnitId', businessUnitScope)")
    assert.include(body, 'ScopeDeniedLogService.log')
  })

  test('delete() carga la posición con whereIn businessUnitId y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(POSITION_CONTROLLER, 'utf-8')
    const body = extractMethodBody(content, 'async delete({ auth, request, response, i18n, businessUnitScope }: HttpContext) {')

    assert.include(body, "whereIn('businessUnitId', businessUnitScope)")
    assert.include(body, 'ScopeDeniedLogService.log')
  })
})

test.group('DepartmentService.show — acota por scope', () => {
  test('show() exige allowedBusinessUnitIds y filtra por businessUnitId', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_SERVICE, 'utf-8')
    const body = extractMethodBody(content, 'async show(departmentId: number, allowedBusinessUnitIds: number[] = []) {')

    assert.include(body, 'if (allowedBusinessUnitIds.length === 0) return null')
    assert.include(body, "whereIn('businessUnitId', allowedBusinessUnitIds)")
  })
})

test.group('DepartmentController — show/update/delete/forceDelete filtran por businessUnitScope', () => {
  test('show() pasa businessUnitScope al service y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_CONTROLLER, 'utf-8')
    const body = extractMethodBody(
      content,
      'async show({ auth, request, response, i18n, businessUnitScope }: HttpContext) {'
    )

    assert.include(body, 'departmentService.show(departmentId, businessUnitScope)')
    assert.include(body, 'ScopeDeniedLogService.log')
    // La respuesta fuera de scope debe ser 404 uniforme (no 403) antes de
    // cualquier chequeo de rol adicional, para no revelar existencia.
    const notFoundIndex = body.indexOf('ScopeDeniedLogService.log')
    const statusAfterLog = body.indexOf('response.status(404)', notFoundIndex)
    assert.isAbove(statusAfterLog, notFoundIndex)
  })

  test('update() carga el departamento con whereIn businessUnitId y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_CONTROLLER, 'utf-8')
    const body = extractMethodBody(
      content,
      'async update({ auth, request, response, i18n, businessUnitScope }: HttpContext) {'
    )

    assert.include(body, "whereIn('businessUnitId', businessUnitScope)")
    assert.include(body, 'ScopeDeniedLogService.log')
  })

  test('delete() carga el departamento con whereIn businessUnitId y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_CONTROLLER, 'utf-8')
    const body = extractMethodBody(
      content,
      'async delete({ auth, request, response, i18n, businessUnitScope }: HttpContext) {'
    )

    assert.include(body, "whereIn('businessUnitId', businessUnitScope)")
    assert.include(body, 'ScopeDeniedLogService.log')
  })

  test('forceDelete() carga el departamento con whereIn businessUnitId y registra el bloqueo', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_CONTROLLER, 'utf-8')
    const body = extractMethodBody(
      content,
      'async forceDelete({ auth, request, response, i18n, businessUnitScope }: HttpContext) {'
    )

    assert.include(body, "whereIn('businessUnitId', businessUnitScope)")
    assert.include(body, 'ScopeDeniedLogService.log')
  })
})
