import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('address_routes — PermissionGate Domicilio', () => {
  test('alta y edición de contenido declaran permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/address_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateAddress)')
  })
})

test.group('employee_address_routes — PermissionGate Domicilio', () => {
  test('vínculo domicilio–colaborador declara permissionGate en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_address_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAddress)'
    )
  })
})

test.group('employee_bank_routes — PermissionGate Bancos', () => {
  test('alta, edición y baja declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_bank_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBank)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBank)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBank)'
    )
  })
})

test.group('employee_children_routes — PermissionGate Persona', () => {
  test('hijos declaran tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_children_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeChild)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeChild)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeChild)'
    )
  })
})

test.group('employee_spouse_routes — PermissionGate Persona', () => {
  test('cónyuge declara tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_spouse_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSpouse)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSpouse)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSpouse)'
    )
  })
})

test.group('employee_emergency_contact_routes — PermissionGate Persona', () => {
  test('contactos de emergencia declaran tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_emergency_contact_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEmergencyContact)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEmergencyContact)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEmergencyContact)'
    )
  })
})

test.group('person_controller — PermissionGate condicional colaborador', () => {
  test('update y delete usan personIsCollaborator y ensureSecondaryPermission', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/person_controller.ts'),
      'utf8'
    )
    assert.include(content, "from '#helpers/person_is_collaborator'")
    assert.include(content, "from '#helpers/permission_gate_secondary'")
    assert.include(content, 'EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION')
    assert.include(content, 'personIsCollaborator')
    assert.include(content, 'ensureSecondaryPermission')
    // No debe declarar gate incondicional en la ruta de persons
    const routes = await readFile(join(process.cwd(), 'start/routes/person_routes.ts'), 'utf8')
    assert.notInclude(routes, 'permissionGate')
  })
})
