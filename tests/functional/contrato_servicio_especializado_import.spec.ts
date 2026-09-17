import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import RoleSystemPermission from '#models/role_system_permission'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../../app/constants/contrato_servicio_especializado_error_codes.js'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import ContratoServicioEspecializadoImportService from '#services/contrato_servicio_especializado_import_service'
import {
  buildContratoImportExcelBuffer,
  buildValidContratoImportRow,
  buildOversizedImportFileBuffer,
  buildValidOversizedContratoImportExcelBuffer,
  CONTRATO_IMPORT_MAX_FILE_BYTES,
  SAMPLE_DOCX_BUFFER,
  SAMPLE_PNG_BUFFER,
  cleanupContratoById,
  cleanupContratoImportFixture,
  CONTRATO_IMPORT_CANONICAL_HEADERS,
  CONTRATO_IMPORT_VARIANT_HEADERS,
  countContratosByNumero,
  createBusinessUnit,
  createContratoImportFixture,
  createContratoInTenant,
  deleteBusinessUnit,
  getContratoEstatusByNumero,
  randomValidRfc,
  readExcelHeaderRow,
  type ContratoImportTestFixture,
  uniqueStamp,
} from './helpers/contrato_import_excel_fixture.js'
import { grantModuleAction } from './employees/sensitive_read_by_category_support.js'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales E2E — importación masiva de contratos de servicios
 * especializados por Excel (USRH1785509296682).
 *
 * Matriz documentada en `.gsti-kg/excel-import-pruebas/contratos-importacion/PRUEBAS-E2E-JAPA.md`.
 */

const TEST_PASSWORD = 'ContratoImportTest123!'
const ROOT_ROLE = 'root'
const RH_MANAGER_ROLE = 'rh-manager'
const NO_PERMISSION_ROLE = 'empleado'

const PLANTILLA_PATH = '/api/contratos-servicios-especializados/plantilla-importacion'
const IMPORT_PATH = '/api/contratos-servicios-especializados/importacion'

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleSlug: TestRoleSlug, emailPrefix: string): Promise<TestActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'ContratoImport'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  const role = await ensureRole(roleSlug)
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/**
 * Rechazo de la entrada de archivos: 422 con el triplete del estándar.
 *
 * Estos casos esperaban 400 con el sobre del módulo (`message` + `errorCode`
 * `CSE.IMP.*`). Desde que la importación pasa por `assertSpreadsheetFile`, la
 * hoja se valida ANTES de que el controlador mire `file.hasErrors`, así que
 * quien responde es la guarda transversal de archivos: 422 con `detail` y
 * `code` `FILE.VAL.*`. El contrato del módulo sigue vivo para los errores que
 * sí son suyos (cabeceras, filas, rate limit); lo que cambió es quién atiende
 * el archivo que ni siquiera es una hoja.
 */
function assertFileIntakeRejection(
  assert: Assert,
  response: ApiResponse,
  expected: { key: string; code: string; detail: string }
): void {
  response.assertStatus(422)
  const body = response.body()
  assert.equal(body.type, 'error')
  assert.equal(body.title, 'Archivo no aceptado')
  assert.equal(body.key, expected.key)
  assert.equal(body.code, expected.code)
  assert.equal(body.detail, expected.detail)
}

function importFile(client: ApiClient, actor: User, buPublicId: string) {
  return (buffer: Buffer, filename = 'contratos-import.xlsx') =>
    client
      .post(IMPORT_PATH)
      .loginAs(actor)
      .header('X-Business-Unit-Id', buPublicId)
      .header('Accept-Language', 'es')
      .file('archivo', buffer, {
        filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
}

test.group('ContratoImport - auth (401)', () => {
  test('GET plantilla responde 401 sin autenticación', async ({ client }) => {
    const response = await client.get(PLANTILLA_PATH)
    response.assertStatus(401)
  })

  test('POST importacion responde 401 sin autenticación', async ({ client }) => {
    const buffer = await buildContratoImportExcelBuffer([])
    const response = await client.post(IMPORT_PATH).file('archivo', buffer, {
      filename: 'contratos.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    response.assertStatus(401)
  })
})

test.group('ContratoImport - sin permiso (403)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE, 'no-permiso')
    businessUnit = await createBusinessUnit('no-permiso')
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET plantilla responde 403 sin permiso create', async ({ client, assert }) => {
    const response = await client
      .get(PLANTILLA_PATH)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN)
  })

  test('POST importacion responde 403 sin permiso create', async ({ client, assert }) => {
    const buffer = await buildContratoImportExcelBuffer([])
    const response = await importFile(client, actor!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(403)
    assert.equal(response.body().errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN)
  })
})

test.group('ContratoImport - plantilla (GET)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-plantilla')
    businessUnit = await createBusinessUnit('plantilla')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET plantilla responde 200 con xlsx y cabeceras canónicas', async ({ client, assert }) => {
    const response = await client
      .get(PLANTILLA_PATH)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.include(
      response.header('content-type') ?? '',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    assert.include(response.header('content-disposition') ?? '', 'attachment')
    assert.include(
      response.header('content-disposition') ?? '',
      'plantilla-importacion-contratos-servicios-especializados.xlsx'
    )
    assert.isAbove(Number(response.header('content-length')), 0)
    assert.equal(response.text().slice(0, 2), 'PK')

    const expectedBuffer = await new ContratoServicioEspecializadoImportService().generateImportTemplate()
    assert.equal(Number(response.header('content-length')), expectedBuffer.length)

    const headers = await readExcelHeaderRow(expectedBuffer)
    assert.deepEqual(headers, [...CONTRATO_IMPORT_CANONICAL_HEADERS])
  })
})

test.group('ContratoImport - errores globales de archivo', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-archivo')
    businessUnit = await createBusinessUnit('archivo-global')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('POST sin campo archivo responde 400 archivo requerido', async ({ client, assert }) => {
    const response = await client
      .post(IMPORT_PATH)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .header('Accept-Language', 'es')

    response.assertStatus(400)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'archivo-no-excel')
    assert.equal(body.errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_ARCHIVO)
  })

  test('POST con extensión inválida responde 422 extensión no permitida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(IMPORT_PATH)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .file('archivo', Buffer.from('no es excel'), {
        filename: 'contratos.txt',
        contentType: 'text/plain',
      })

    assertFileIntakeRejection(assert, response, {
      key: 'extension-no-permitida',
      code: FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED,
      detail: 'Solo se aceptan archivos XLSX.',
    })
  })

  /**
   * El nombre dice `.xlsx` pero el contenido es un ZIP cualquiera. Adonis
   * detecta el formato real del stream y deja `extname: 'zip'`, así que el
   * rechazo llega por extensión y no por contenido: da igual cuál de las dos
   * guardas lo pare, lo que importa es que `exceljs` nunca abra el archivo.
   */
  test('POST con xlsx corrupto responde 422 y no llega al parser', async ({ client, assert }) => {
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(Buffer.from('PK\x03\x04 contenido corrupto que no es un workbook'))

    assertFileIntakeRejection(assert, response, {
      key: 'extension-no-permitida',
      code: FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED,
      detail: 'Solo se aceptan archivos XLSX.',
    })
  })

  test('POST con cabeceras no emparejables responde 400 cabeceras inválidas', async ({
    client,
    assert,
  }) => {
    const buffer = await buildContratoImportExcelBuffer([], {
      headers: ['Columna A', 'Columna B'],
    })
    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(400)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'cabeceras-invalidas')
    assert.equal(body.errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_HEADERS)
    assert.equal(body.title, 'Cabeceras inválidas')
  })

  /**
   * Con una extensión que el `request.file` no admite, Adonis ni siquiera
   * materializa el temporal: el archivo llega sin `tmpPath` y la guarda lo
   * rechaza como ausente. Es un rechazo distinto al de `.docx` —donde el
   * temporal sí existe— y por eso se afirma su propia key.
   */
  test('POST con PNG responde 422 sin materializar el temporal', async ({ client, assert }) => {
    const response = await client
      .post(IMPORT_PATH)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .file('archivo', SAMPLE_PNG_BUFFER, {
        filename: 'contratos.png',
        contentType: 'image/png',
      })

    assertFileIntakeRejection(assert, response, {
      key: 'archivo-faltante',
      code: FILE_INTAKE_ERROR_CODES.FILE_MISSING,
      detail: 'No se recibió ningún archivo en la petición.',
    })
  })

  test('POST con DOCX responde 422 extensión no permitida', async ({ client, assert }) => {
    const response = await client
      .post(IMPORT_PATH)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .file('archivo', SAMPLE_DOCX_BUFFER, {
        filename: 'contratos.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    assertFileIntakeRejection(assert, response, {
      key: 'extension-no-permitida',
      code: FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED,
      detail: 'Solo se aceptan archivos XLSX.',
    })
  })

  test('POST con xlsx válido mayor a 10 MB responde 422 por tamaño', async ({
    client,
    assert,
  }) => {
    const buffer = await buildValidOversizedContratoImportExcelBuffer()
    assert.isAbove(buffer.length, CONTRATO_IMPORT_MAX_FILE_BYTES)

    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    assertFileIntakeRejection(assert, response, {
      key: 'archivo-demasiado-grande',
      code: FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE,
      detail: 'El archivo supera el tamaño máximo de 10 MB.',
    })
  }).timeout(120_000)
})

test.group('ContratoImport - volumen alto de filas', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let fixture: ContratoImportTestFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-volume')
    businessUnit = await createBusinessUnit('volume')
    fixture = await createContratoImportFixture(businessUnit)
  })

  group.teardown(async () => {
    await cleanupContratoImportFixture(fixture)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('POST con más de 500 filas responde 400 filas-excedidas sin procesar filas', async ({
    client,
    assert,
  }) => {
    const rowCount = 501
    const rows = Array.from({ length: rowCount }, (_, index) =>
      buildValidContratoImportRow(fixture!, {
        numeroContrato: `CSE-VOL-${String(index).padStart(6, '0')}`,
        serviciosRegistrados: `Servicio inexistente volumen ${index}-${uniqueStamp()}`,
      })
    )

    const buffer = await buildContratoImportExcelBuffer(rows)
    assert.isBelow(buffer.length, CONTRATO_IMPORT_MAX_FILE_BYTES)

    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(400)
    const body = response.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'filas-excedidas')
    assert.equal(body.errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_ROWS)
    assert.equal(body.title, 'Demasiadas filas en el archivo')
    assert.include(body.message, '501')
    assert.include(body.message, '500')
  }).timeout(120_000)
})

test.group('ContratoImport - flujo feliz y parcial', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let fixture: ContratoImportTestFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-happy')
    businessUnit = await createBusinessUnit('happy')
    fixture = await createContratoImportFixture(businessUnit)
  })

  group.teardown(async () => {
    await cleanupContratoImportFixture(fixture)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('POST tres filas válidas responde 200 success sin rowErrors', async ({ client, assert }) => {
    const rows = [
      buildValidContratoImportRow(fixture!, {}),
      buildValidContratoImportRow(fixture!, {}),
      buildValidContratoImportRow(fixture!, { serviciosRegistrados: fixture!.servicioBName }),
    ]
    const buffer = await buildContratoImportExcelBuffer(rows)
    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.summary.totalRows, 3)
    assert.equal(body.data.summary.created, 3)
    assert.equal(body.data.summary.rejected, 0)
    assert.lengthOf(body.data.rowErrors, 0)

    for (const row of rows) {
      const count = await countContratosByNumero(businessUnit!.businessUnitId, row.numeroContrato)
      assert.equal(count, 1)
    }
  })

  test('POST mixto parcial responde 200 warning con rowErrors', async ({ client, assert }) => {
    const validRow = buildValidContratoImportRow(fixture!, {})
    const invalidRfcRow = buildValidContratoImportRow(fixture!, {
      rfcContratante: randomValidRfc(),
    })
    const buffer = await buildContratoImportExcelBuffer([validRow, invalidRfcRow])
    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'warning')
    assert.equal(body.data.summary.totalRows, 2)
    assert.equal(body.data.summary.created, 1)
    assert.equal(body.data.summary.rejected, 1)
    assert.lengthOf(body.data.rowErrors, 1)
    assert.equal(body.data.rowErrors[0].row, 3)
    assert.equal(body.data.rowErrors[0].key, 'contratante-rfc-no-encontrado')
    assert.equal(body.data.rowErrors[0].code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_RFC_NF)

    assert.equal(
      await countContratosByNumero(businessUnit!.businessUnitId, validRow.numeroContrato),
      1
    )
    assert.equal(
      await countContratosByNumero(businessUnit!.businessUnitId, invalidRfcRow.numeroContrato),
      0
    )
  })

  test('POST omite filas completamente vacías', async ({ client, assert }) => {
    const validRow = buildValidContratoImportRow(fixture!, {})
    const emptyRow = {
      rfcContratante: '',
      numeroContrato: '',
    }
    const buffer = await buildContratoImportExcelBuffer([validRow, emptyRow])
    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.summary.totalRows, 1)
    assert.equal(body.data.summary.created, 1)
    assert.equal(body.data.summary.rejected, 0)
  })
})

test.group('ContratoImport - errores por fila', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let fixture: ContratoImportTestFixture | null = null
  let preexistingContratoId: number | null = null
  let dupNumeroTenant = ''

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-row-errors')
    businessUnit = await createBusinessUnit('row-errors')
    fixture = await createContratoImportFixture(businessUnit)
    dupNumeroTenant = `CSE-DUP-TENANT-${uniqueStamp()}`
    preexistingContratoId = await createContratoInTenant({
      fixture,
      numeroContrato: dupNumeroTenant,
    })
  })

  group.teardown(async () => {
    await cleanupContratoById(preexistingContratoId)
    await cleanupContratoImportFixture(fixture)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('RFC inexistente en catálogo', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { rfcContratante: randomValidRfc() })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'contratante-rfc-no-encontrado')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_RFC_NF)
  })

  test('Número duplicado intra-archivo', async ({ client, assert }) => {
    const numero = `CSE-DUP-ARCHIVO-${uniqueStamp()}`
    const rows = [
      buildValidContratoImportRow(fixture!, { numeroContrato: numero }),
      buildValidContratoImportRow(fixture!, { numeroContrato: numero }),
    ]
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer(rows))

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.summary.created, 1)
    assert.equal(body.data.summary.rejected, 1)
    assert.equal(body.data.rowErrors[0].key, 'numero-contrato-duplicado-en-archivo')
    assert.equal(
      body.data.rowErrors[0].code,
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_NUMERO_DUP_ARCHIVO
    )
  })

  test('Número duplicado contra tenant existente', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { numeroContrato: dupNumeroTenant })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'numero-contrato-duplicado')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NUMERO_DUPLICATE)
  })

  test('Campo obligatorio vacío', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { numeroContrato: '' })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'campo-obligatorio-vacio')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA)
  })

  test('Fecha con formato inválido', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { fechaInicio: '15/01/2026' })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'campo-invalido')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA)
  })

  test('Celda compuesta de compromisos malformada', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { anexoCompromisos: 'formato-invalido' })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'celda-compuesta-invalida')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_CELDA_COMPUESTA)
  })

  test('Servicio registrado no encontrado', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, {
      serviciosRegistrados: `Servicio inexistente ${uniqueStamp()}`,
    })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'servicio-registrado-no-encontrado')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SERVICIO_REGISTRADO_NOT_FOUND)
  })

  test('Fechas incoherentes (fin anterior a inicio)', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, {
      fechaInicio: '2026-12-31',
      fechaFin: '2026-01-01',
    })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'fecha-fin-anterior-a-fecha-inicio')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS)
  })
})

test.group('ContratoImport - aislamiento tenant', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let fixtureA: ContratoImportTestFixture | null = null
  let fixtureB: ContratoImportTestFixture | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-tenant')
    businessUnitA = await createBusinessUnit('tenant-a')
    businessUnitB = await createBusinessUnit('tenant-b')
    fixtureA = await createContratoImportFixture(businessUnitA)
    fixtureB = await createContratoImportFixture(businessUnitB)
  })

  group.teardown(async () => {
    await cleanupContratoImportFixture(fixtureA)
    await cleanupContratoImportFixture(fixtureB)
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnitA)
    await deleteBusinessUnit(businessUnitB)
  })

  test('RFC de contratante de otro tenant no se resuelve', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixtureA!, {})
    const response = await importFile(
      client,
      root!.user,
      businessUnitB!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.summary.created, 0)
    assert.equal(body.data.summary.rejected, 1)
    assert.equal(body.data.rowErrors[0].key, 'contratante-rfc-no-encontrado')
  })
})

test.group('ContratoImport - escenarios extendidos (H01-H11)', (group) => {
  let root: TestActor | null = null
  let rhManager: TestActor | null = null
  let rateLimitActor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let noRepseBusinessUnit: BusinessUnit | null = null
  let fixture: ContratoImportTestFixture | null = null
  let inactiveRepseFixture: ContratoImportTestFixture | null = null
  let rhManagerPermissionId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root-extended')
    rhManager = await createTestActor(RH_MANAGER_ROLE, 'rh-manager-import')
    rateLimitActor = await createTestActor(ROOT_ROLE, 'root-rate-limit')
    businessUnit = await createBusinessUnit('extended')
    noRepseBusinessUnit = await createBusinessUnit('no-repse')
    fixture = await createContratoImportFixture(businessUnit)
    inactiveRepseFixture = await createContratoImportFixture(noRepseBusinessUnit!, {
      repseStatus: 'inactive',
    })

    await rhManager.user.related('businessUnits').attach([businessUnit.businessUnitId])
    await rateLimitActor.user.related('businessUnits').attach([businessUnit.businessUnitId])

    // Por slug: el id literal 157 apuntaba a otro permiso en cualquier BD sembrada desde cero.
    const permission = await grantModuleAction(rhManager.user.roleId, 'repse-registrations', 'create')
    // Solo se anota para retirar si este grupo la creó: rh-manager es un rol compartido.
    rhManagerPermissionId = permission.created ? permission.grant.roleSystemPermissionId : null
  })

  group.teardown(async () => {
    if (rhManagerPermissionId) {
      await RoleSystemPermission.query()
        .where('role_system_permission_id', rhManagerPermissionId)
        .delete()
    }
    await cleanupContratoImportFixture(fixture)
    await cleanupContratoImportFixture(inactiveRepseFixture)
    await cleanupTestActor(root)
    await cleanupTestActor(rhManager)
    await cleanupTestActor(rateLimitActor)
    await deleteBusinessUnit(businessUnit)
    await deleteBusinessUnit(noRepseBusinessUnit)
  })

  test('H02 POST con archivo mayor a 10 MB responde 422 archivo-demasiado-grande', async ({
    client,
    assert,
  }) => {
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(buildOversizedImportFileBuffer())

    assertFileIntakeRejection(assert, response, {
      key: 'archivo-demasiado-grande',
      code: FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE,
      detail: 'El archivo supera el tamaño máximo de 10 MB.',
    })
  })

  test('H03 tenant sin REPSE activo rechaza fila con registro-repse-no-encontrado', async ({
    client,
    assert,
  }) => {
    const row = buildValidContratoImportRow(inactiveRepseFixture!, {})
    const response = await importFile(
      client,
      root!.user,
      noRepseBusinessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'registro-repse-no-encontrado')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.REPSE_NOT_FOUND)
  })

  test('H04 re-subir el mismo archivo reporta duplicados tenant sin crear contratos nuevos', async ({
    client,
    assert,
  }) => {
    const row = buildValidContratoImportRow(fixture!, {})
    const buffer = await buildContratoImportExcelBuffer([row])

    const first = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)
    first.assertStatus(200)
    assert.equal(first.body().data.summary.created, 1)

    const second = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)
    second.assertStatus(200)
    const body = second.body()
    assert.equal(body.type, 'warning')
    assert.equal(body.data.summary.created, 0)
    assert.equal(body.data.summary.rejected, 1)
    assert.equal(body.data.rowErrors[0].key, 'numero-contrato-duplicado')
    assert.equal(
      await countContratosByNumero(businessUnit!.businessUnitId, row.numeroContrato),
      1
    )
  })

  test('H05 contratos importados quedan en estatus borrador', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, {})
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 1)
    assert.equal(
      await getContratoEstatusByNumero(businessUnit!.businessUnitId, row.numeroContrato),
      'borrador'
    )
  })

  test('H06 anexo 15-D con fin servicio anterior a inicio servicio', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, {
      anexoFechaInicioServicio: '2026-12-31',
      anexoFechaFinServicio: '2026-01-01',
    })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'fecha-fin-anterior-a-fecha-inicio')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS)
  })

  test('H07 resuelve servicios registrados sin distinguir mayúsculas/minúsculas', async ({
    client,
    assert,
  }) => {
    const row = buildValidContratoImportRow(fixture!, {
      serviciosRegistrados: fixture!.servicioAName.toUpperCase(),
    })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.summary.created, 1)
    assert.equal(body.data.summary.rejected, 0)
  })

  test('H08 cabeceras con acentos/espacios normalizados importan correctamente', async ({
    client,
    assert,
  }) => {
    const row = buildValidContratoImportRow(fixture!, {})
    const buffer = await buildContratoImportExcelBuffer([row], {
      headers: CONTRATO_IMPORT_VARIANT_HEADERS,
    })
    const response = await importFile(client, root!.user, businessUnit!.businessUnitPublicId)(buffer)

    response.assertStatus(200)
    assert.equal(response.body().data.summary.created, 1)
    assert.equal(response.body().data.summary.rejected, 0)
  })

  test('H09 rh-manager con permiso create puede descargar plantilla e importar', async ({
    client,
    assert,
  }) => {
    const template = await client
      .get(PLANTILLA_PATH)
      .loginAs(rhManager!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    template.assertStatus(200)
    assert.include(
      template.header('content-type') ?? '',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    const row = buildValidContratoImportRow(fixture!, {})
    const importResponse = await importFile(
      client,
      rhManager!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    importResponse.assertStatus(200)
    assert.equal(importResponse.body().data.summary.created, 1)
  })

  test('H10 moneda inválida rechaza fila con campo-invalido', async ({ client, assert }) => {
    const row = buildValidContratoImportRow(fixture!, { moneda: 'MXNN' })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'campo-invalido')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA)
  })

  test('H11 longitud mínima de objetoServicio rechaza fila con campo-invalido', async ({
    client,
    assert,
  }) => {
    const row = buildValidContratoImportRow(fixture!, { objetoServicio: 'corto' })
    const response = await importFile(
      client,
      root!.user,
      businessUnit!.businessUnitPublicId
    )(await buildContratoImportExcelBuffer([row]))

    response.assertStatus(200)
    const err = response.body().data.rowErrors[0]
    assert.equal(err.key, 'campo-invalido')
    assert.equal(err.code, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_FILA_INVALIDA)
  })

  test('H01 POST importacion responde 429 al superar 10 intentos en 15 minutos', async ({
    client,
    assert,
  }) => {
    const postImport = () =>
      client
        .post(IMPORT_PATH)
        .loginAs(rateLimitActor!.user)
        .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
        .header('Accept-Language', 'es')

    for (let i = 0; i < 10; i += 1) {
      const response = await postImport()
      response.assertStatus(400)
    }

    const limited = await postImport()
    limited.assertStatus(429)
    const body = limited.body()
    assert.equal(body.type, 'error')
    assert.equal(body.key, 'importacion-rate-limit')
    assert.equal(body.errorCode, CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.IMP_RATE_LIMIT)
    assert.equal(body.title, 'Límite de intentos de importación alcanzado')
  })
})
