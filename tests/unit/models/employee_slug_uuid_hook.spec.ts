import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import Employee from '#models/employee'

/**
 * El slug del empleado es un token opaco e inmutable.
 *
 * Se asigna en un `beforeCreate` del modelo y no en cada servicio que crea
 * empleados: había cuatro rutas de alta distintas (sincronización, alta
 * transaccional, importación masiva y siembra demo) y cada una tenía que
 * acordarse de pedirlo. El hook lo vuelve invariante — ninguna alta puede
 * nacer sin slug, tampoco las que se escriban después.
 *
 * Inmutable porque es el identificador de la URL: regenerarlo al renombrar a
 * un empleado rompería todos los enlaces que apuntan a él.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test.group('Employee — slug opaco', () => {
  test('el hook beforeCreate asigna un UUIDv4', async ({ assert }) => {
    const instance = new Employee()
    await Employee.assignEmployeeSlug(instance)
    assert.match(instance.employeeSlug, UUID_V4)
  })

  test('cada empleado recibe un slug distinto', async ({ assert }) => {
    const slugs = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      const instance = new Employee()
      await Employee.assignEmployeeSlug(instance)
      slugs.add(instance.employeeSlug)
    }
    assert.lengthOf([...slugs], 100)
  })

  test('el slug no se deriva de los datos del empleado', async ({ assert }) => {
    const instance = new Employee()
    instance.employeeFirstName = 'Juan'
    instance.employeeLastName = 'Perez'
    instance.employeePayrollCode = 'NOM-42'
    await Employee.assignEmployeeSlug(instance)

    assert.notInclude(instance.employeeSlug.toLowerCase(), 'juan')
    assert.notInclude(instance.employeeSlug.toLowerCase(), 'perez')
    assert.notInclude(instance.employeeSlug.toLowerCase(), 'nom')
  })

  test('respeta un slug ya asignado en vez de sobreescribirlo', async ({ assert }) => {
    const instance = new Employee()
    instance.employeeSlug = '11111111-2222-4333-8444-555555555555'
    await Employee.assignEmployeeSlug(instance)
    assert.equal(instance.employeeSlug, '11111111-2222-4333-8444-555555555555')
  })

  test('employeeSlug ya no admite null', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/models/employee.ts'), 'utf-8')
    assert.match(
      source,
      /declare employeeSlug: string\s*$/m,
      'la columna es NOT NULL en la BD; el tipo debe reflejarlo'
    )
  })

  test('ningún servicio regenera el slug al actualizar al empleado', ({ assert }) => {
    const service = readFileSync(join(process.cwd(), 'app/services/employee_service.ts'), 'utf-8')
    assert.notInclude(
      service,
      'updateEmployeeSlug',
      'el slug es inmutable: regenerarlo rompería las URLs que apuntan al empleado'
    )
  })
})
