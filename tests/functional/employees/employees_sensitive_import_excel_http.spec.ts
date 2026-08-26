import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  createActor,
  grantOnly,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  assertImportForbidden,
  buildMinimalImportExcel,
  cleanupImportDir,
  countActiveEmployees,
  countActivePersons,
} from './sensitive_mask_echo_support.js'

test.group('Importación Excel sensible — USRH1787433076990', (group) => {
  let actor: TenantActor

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('import-sens-http')
  })

  group.teardown(async () => {
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('F.7 CA-5: NSS sin escritura identificación → 403 y cero filas', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['import-employees'])
    const beforeEmployees = await countActiveEmployees()
    const beforePersons = await countActivePersons()
    const { buffer, dir } = await buildMinimalImportExcel({
      businessUnitName: actor.businessUnit.businessUnitName,
      includeSensitiveColumns: true,
      nssValue: '98765432109',
    })
    try {
      const response = await client
        .post('/api/employees/import-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', buHeader(actor))
        .file('file', buffer, {
          filename: 'import.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

      assertImportForbidden(response, assert, 'datos de identificación')
      assert.equal(await countActiveEmployees(), beforeEmployees)
      assert.equal(await countActivePersons(), beforePersons)
    } finally {
      await cleanupImportDir(dir)
    }
  })

  test('F.9 CA-6: plantilla sin columnas sensibles no exige categorías', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['import-employees'])
    const { buffer, dir } = await buildMinimalImportExcel({
      businessUnitName: actor.businessUnit.businessUnitName,
      includeSensitiveColumns: false,
    })
    try {
      const response = await client
        .post('/api/employees/import-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', buHeader(actor))
        .file('file', buffer, {
          filename: 'import.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
    } finally {
      await cleanupImportDir(dir)
    }
  })
})
