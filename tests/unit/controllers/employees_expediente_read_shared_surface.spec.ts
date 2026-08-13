import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('Ficha compuesta y Persona — PermissionGate lectura', () => {
  test('employee_controller.show y getById exigen tab-trabajo-read salvo propio', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/employee_controller.ts'),
      'utf8'
    )
    assert.include(content, "from '#helpers/ensure_employee_tab_read'")
    assert.include(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS')
    assert.include(content, 'ensureEmployeeTabRead')
    assert.include(content, 'showEmployee')
    assert.include(content, 'getEmployeeById')
  })

  test('person_controller.show no monta permissionGate en la ruta y deriva colaborador', async ({
    assert,
  }) => {
    const routes = await readFile(join(process.cwd(), 'start/routes/person_routes.ts'), 'utf8')
    assert.notInclude(routes, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS')
    const content = await readFile(
      join(process.cwd(), 'app/controllers/person_controller.ts'),
      'utf8'
    )
    assert.include(content, 'personIsCollaborator')
    assert.include(content, 'sessionUserOwnsPerson')
    assert.include(content, 'EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION')
    const showFn = content.slice(content.indexOf('async show('))
    const collabIdx = showFn.indexOf('personIsCollaborator')
    const serviceIdx = showFn.indexOf('personService.show')
    assert.isAbove(serviceIdx, collabIdx)
  })

  test('calendario, contactos, médica, incapacidades y solicitud exigen lectura salvo propio', async ({
    assert,
  }) => {
    const files = [
      'app/controllers/employee_assist_calendar_controller.ts',
      'app/controllers/employee_emergency_contact_controller.ts',
      'app/controllers/employee_medical_condition_controller.ts',
      'app/controllers/work_disability_controller.ts',
      'app/controllers/exception_requests_controller.ts',
    ]
    for (const file of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      assert.include(content, 'ensureEmployeeTabRead', file)
    }
  })
})
