import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1789698261608 — CA-8: ningún camino conserva un borrado sin predicado.
 *
 * Spec de contenido (convención del repo, p. ej.
 * employees_expediente_read_shared_surface.spec): se lee el fuente y se
 * afirma sobre su forma, para que un llamador nuevo de un solo argumento o
 * un uso de `deletePersonById` rompa la suite aunque compile.
 */

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), 'utf8')
}

/** Llamadas `releasePersonIfOrphan(<un solo argumento>)`. */
const SINGLE_ARG_RELEASE = /releasePersonIfOrphan\(\s*[^,()]+\s*\)/g

test.group('Liberación de la persona — superficie (USRH1789698261608)', () => {
  test('ninguna llamada a releasePersonIfOrphan va sin contexto', async ({ assert }) => {
    for (const file of [
      'app/controllers/employee_controller.ts',
      'app/services/employee_service.ts',
    ]) {
      const content = await source(file)
      assert.deepEqual(content.match(SINGLE_ARG_RELEASE) ?? [], [], file)
    }
  })

  test('deletePersonById queda @deprecated y sin llamadores', async ({ assert }) => {
    const service = await source('app/services/employee_service.ts')
    const controller = await source('app/controllers/employee_controller.ts')
    assert.notInclude(service, 'this.deletePersonById(')
    assert.notInclude(controller, 'deletePersonById(')
    const definition = service.indexOf('async deletePersonById(')
    assert.isAbove(definition, 0)
    const jsdocBefore = service.slice(Math.max(0, definition - 600), definition)
    assert.include(jsdocBefore, '@deprecated')
  })

  test('el catch de syncCreate pasa por releasePersonIfOrphan con contexto', async ({ assert }) => {
    const service = await source('app/services/employee_service.ts')
    const start = service.indexOf('async syncCreate(')
    const end = service.indexOf('async ', start + 1)
    const syncCreate = service.slice(start, end)
    assert.include(syncCreate, 'releaseContext: PersonReleaseContext')
    assert.include(syncCreate, 'this.releasePersonIfOrphan(personIdToDelete, releaseContext)')
    assert.notInclude(syncCreate, 'console.')
  })

  test('releasePersonIfOrphan no usa console ni cleanupOrphanPersons cobra llamadores', async ({
    assert,
  }) => {
    const service = await source('app/services/employee_service.ts')
    const start = service.indexOf('async releasePersonIfOrphan(')
    const end = service.indexOf('async deletePersonById(')
    assert.notInclude(service.slice(start, end), 'console.')
    assert.notInclude(service, 'this.cleanupOrphanPersons(')
  })

  test('el camino de sincronización arma el contexto con allowedIds', async ({ assert }) => {
    const controller = await source('app/controllers/employee_controller.ts')
    assert.include(controller, 'private async verify(')
    const verify = controller.slice(controller.indexOf('private async verify('))
    assert.include(verify.slice(0, 600), 'releaseContext: PersonReleaseContext')
    assert.include(verify.slice(0, 600), 'syncCreate(employee, releaseContext)')
    assert.equal((controller.match(/businessUnitScope: allowedIds/g) ?? []).length, 2)
  })
})
