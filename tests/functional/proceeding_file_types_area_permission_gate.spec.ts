import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import ProceedingFileType from '#models/proceeding_file_type'
import {
  assertModuleEnforced,
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Carpetas (tipos) del expediente. Crear, editar y borrar solo tenían `auth` y
 * `businessScope`, y su módulo propio (`proceeding-file-types`) está retirado y
 * sin permisos: nadie era dueño de la operación.
 *
 * Cada área tiene dueño distinto y es la pantalla que la usa quien lo decide:
 * las carpetas del expediente del COLABORADOR las gobierna Empleados
 * (`tab-expediente-write` / `-delete`) y las del expediente de la EMPRESA,
 * Ajustes Generales (`update`). El alta de cada área tiene un solo contexto y va
 * como gate de ruta; la edición y la baja comparten ruta —el mismo formulario
 * llama al mismo PUT— y las decide el controller por el área del registro.
 */

const EMPLOYEES_MODULE = 'employees'
const SYSTEM_SETTINGS_MODULE = 'system-settings'

async function createFolder(
  actor: TenantActor,
  areaToUse: 'employee' | 'system-setting',
  prefix: string
): Promise<ProceedingFileType> {
  const name = uniqueTestName(prefix)
  return ProceedingFileType.create({
    proceedingFileTypeName: name,
    proceedingFileTypeSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    proceedingFileTypeAreaToUse: areaToUse,
    proceedingFileTypeActive: 1,
    proceedingFileTypeBusinessUnits: actor.businessUnit.businessUnitSlug,
  })
}

const folderUrl = (folder: ProceedingFileType) =>
  `/api/proceeding-file-types/${folder.proceedingFileTypeId}`

function updateFolder(client: ApiClient, actor: TenantActor, folder: ProceedingFileType) {
  return client
    .put(folderUrl(folder))
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({
      proceedingFileTypeName: `${folder.proceedingFileTypeName} editado`,
      proceedingFileTypeSlug: `${folder.proceedingFileTypeSlug}-editado`,
      proceedingFileTypeAreaToUse: folder.proceedingFileTypeAreaToUse,
      proceedingFileTypeActive: 1,
    })
}

function deleteFolder(client: ApiClient, actor: TenantActor, folder: ProceedingFileType) {
  return client.delete(folderUrl(folder)).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

function createEmployeeFolder(client: ApiClient, actor: TenantActor) {
  return client
    .post('/api/proceeding-file-types/create-employee-type')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({ proceedingFileTypeName: uniqueTestName('Carpeta colaborador'), proceedingFileTypeActive: true })
}

function createSystemSettingFolder(client: ApiClient, actor: TenantActor) {
  return client
    .post('/api/proceeding-file-types/create-system-setting-type')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({ proceedingFileTypeName: uniqueTestName('Carpeta empresa'), proceedingFileTypeActive: true })
}

function assertDenied(assert: Assert, response: ApiResponse, label: string): void {
  assert.equal(response.status(), 403, `${label}: ${JSON.stringify(response.body())}`)
  assertPermissionDenied(assert, response)
}

async function isAlive(folder: ProceedingFileType): Promise<boolean> {
  const row = await db
    .from('proceeding_file_types')
    .where('proceeding_file_type_id', folder.proceedingFileTypeId)
    .whereNull('proceeding_file_type_deleted_at')
    .first()
  return Boolean(row)
}

test.group('Carpetas del expediente — permiso por área', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  const created: number[] = []

  group.setup(async () => {
    await assertModuleEnforced(EMPLOYEES_MODULE)
    await assertModuleEnforced(SYSTEM_SETTINGS_MODULE)
    actor = await createTenantActor('carpetas-area')
    owner = await createBypassActor('owner', 'carpetas-area-owner')
  })

  group.teardown(async () => {
    if (actor) {
      await db
        .from('proceeding_file_types')
        .where('proceeding_file_type_business_units', actor.businessUnit.businessUnitSlug)
        .delete()
    }
    if (created.length > 0) {
      await db.from('proceeding_file_types').whereIn('proceeding_file_type_id', created).delete()
    }
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
  })

  test('sin concesiones: las cuatro escrituras responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, [])
    const empleado = await createFolder(tenant, 'employee', 'Sin permiso colaborador')
    const empresa = await createFolder(tenant, 'system-setting', 'Sin permiso empresa')
    created.push(empleado.proceedingFileTypeId, empresa.proceedingFileTypeId)

    assertDenied(assert, await createEmployeeFolder(client, tenant), 'alta carpeta colaborador')
    assertDenied(assert, await createSystemSettingFolder(client, tenant), 'alta carpeta empresa')
    assertDenied(assert, await updateFolder(client, tenant, empleado), 'editar carpeta colaborador')
    assertDenied(assert, await updateFolder(client, tenant, empresa), 'editar carpeta empresa')
    assertDenied(assert, await deleteFolder(client, tenant, empleado), 'borrar carpeta colaborador')
    assertDenied(assert, await deleteFolder(client, tenant, empresa), 'borrar carpeta empresa')

    assert.isTrue(await isAlive(empleado), 'la carpeta de colaborador debe seguir viva')
    assert.isTrue(await isAlive(empresa), 'la carpeta de empresa debe seguir viva')
  })

  test('tab-expediente-write abre el alta y la edición del colaborador, no las de la empresa', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['tab-expediente-write'])
    const empleado = await createFolder(tenant, 'employee', 'Write colaborador')
    const empresa = await createFolder(tenant, 'system-setting', 'Write empresa')
    created.push(empleado.proceedingFileTypeId, empresa.proceedingFileTypeId)

    assertPassesGate(assert, await createEmployeeFolder(client, tenant))
    assertPassesGate(assert, await updateFolder(client, tenant, empleado))

    assertDenied(assert, await createSystemSettingFolder(client, tenant), 'alta carpeta empresa')
    assertDenied(assert, await updateFolder(client, tenant, empresa), 'editar carpeta empresa')
    // Borrar pide su propia casilla: escribir no borra.
    assertDenied(assert, await deleteFolder(client, tenant, empleado), 'borrar carpeta colaborador')
    assert.isTrue(await isAlive(empleado), 'la carpeta de colaborador debe seguir viva')
  })

  test('tab-expediente-delete borra la del colaborador y no la de la empresa', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['tab-expediente-delete'])
    const empleado = await createFolder(tenant, 'employee', 'Delete colaborador')
    const empresa = await createFolder(tenant, 'system-setting', 'Delete empresa')
    created.push(empleado.proceedingFileTypeId, empresa.proceedingFileTypeId)

    assertPassesGate(assert, await deleteFolder(client, tenant, empleado))
    assertDenied(assert, await deleteFolder(client, tenant, empresa), 'borrar carpeta empresa')
    assert.isTrue(await isAlive(empresa), 'la carpeta de empresa debe seguir viva')
  })

  test('system-settings update abre las de la empresa y no las del colaborador', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    // `grantModulePermissions` reemplaza las concesiones DEL MÓDULO que recibe:
    // sin limpiar Empleados a mano, este caso arrastraría el
    // `tab-expediente-delete` del anterior y sus negativas dependerían del
    // orden de ejecución, no del permiso que el caso declara.
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, [])
    await grantModulePermissions(tenant, SYSTEM_SETTINGS_MODULE, ['update'])
    const empleado = await createFolder(tenant, 'employee', 'Update empresa colaborador')
    const empresa = await createFolder(tenant, 'system-setting', 'Update empresa empresa')
    created.push(empleado.proceedingFileTypeId, empresa.proceedingFileTypeId)

    assertPassesGate(assert, await createSystemSettingFolder(client, tenant))
    assertPassesGate(assert, await updateFolder(client, tenant, empresa))
    assertPassesGate(assert, await deleteFolder(client, tenant, empresa))

    assertDenied(assert, await createEmployeeFolder(client, tenant), 'alta carpeta colaborador')
    assertDenied(assert, await updateFolder(client, tenant, empleado), 'editar carpeta colaborador')
    assert.isTrue(await isAlive(empleado), 'la carpeta de colaborador debe seguir viva')
  })

  test('el área se decide normalizada: "Employee" no burla el permiso del colaborador', async ({
    client,
    assert,
  }) => {
    // La columna es `utf8mb4_0900_ai_ci`: en MySQL `Employee = employee`. Si la
    // decisión se tomara con `===` en JS, este PUT pasaría con solo
    // `system-settings:update` y la carpeta aparecería en el expediente del
    // colaborador.
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, [])
    await grantModulePermissions(tenant, SYSTEM_SETTINGS_MODULE, ['update'])
    const empresa = await createFolder(tenant, 'system-setting', 'Bypass mayusculas')
    created.push(empresa.proceedingFileTypeId)

    const response = await client
      .put(folderUrl(empresa))
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        proceedingFileTypeName: `${empresa.proceedingFileTypeName} movida`,
        proceedingFileTypeSlug: `${empresa.proceedingFileTypeSlug}-movida`,
        proceedingFileTypeAreaToUse: 'Employee',
        proceedingFileTypeActive: 1,
      })

    assertDenied(assert, response, 'mover a "Employee" con solo system-settings:update')
    const row = await ProceedingFileType.findOrFail(empresa.proceedingFileTypeId)
    assert.equal(
      row.proceedingFileTypeAreaToUse,
      'system-setting',
      'la carpeta no debe haberse movido al expediente del colaborador'
    )
  })

  test('owner cruza las dos áreas sin concesiones (bypass standard)', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')
    const empleado = await createFolder(account, 'employee', 'Owner colaborador')
    const empresa = await createFolder(account, 'system-setting', 'Owner empresa')
    created.push(empleado.proceedingFileTypeId, empresa.proceedingFileTypeId)

    assertPassesGate(assert, await updateFolder(client, account, empleado))
    assertPassesGate(assert, await updateFolder(client, account, empresa))
  })
})
