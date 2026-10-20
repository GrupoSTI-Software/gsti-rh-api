import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { PDFDocument } from 'pdf-lib'
import logger from '@adonisjs/core/services/logger'
import type User from '#models/user'
import type { FileIntakeProfileName } from '#constants/file_intake'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import { FileIntakeError } from '#exceptions/file_intake_error'
import {
  ASSET_FILE_NAME_PREFIX,
  OWN_EQUIPMENT_EVIDENCE_S3_FOLDER,
} from '#modules/assets/assets.constants'
import OwnEquipmentDeclarationsRepositoryMysql from '#modules/assets/own_equipment_declarations.repository.mysql'
import FileIntakeService, { type IncomingFile } from '#services/file_intake_service'
import UploadService, { type FileUploadOptions } from '#services/upload_service'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  addRoleModulePermissions,
  assertModuleEnforced,
  assertPermissionDenied,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * Evidencia adjunta de la declaración de equipo propio (VLRH-H1791493046616).
 *
 * Parte 1 (sin HTTP): el contrato de datos que consumen el alta y la descarga.
 * Prueba que la columna `..._file` se escribe en el `insert` (y queda en NULL
 * cuando no viene archivo), que el DTO expone `hasEvidence` SIN exponer jamás
 * la key, y que `findEvidencePath` devuelve la ruta viva de una declaración
 * vigente o cerrada dentro del alcance de empresas, con `null` indistinguible
 * para la ajena, la inexistente y la borrada lógicamente (R3/CA-8, regla 8: el
 * cierre conserva la evidencia). Las partes HTTP (subida en el alta y descarga
 * por stream) las agregan las tareas siguientes sobre este mismo archivo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

/** Las tres categorías de insumo de teletrabajo (orden de la norma). */
type OwnEquipmentCategory = 'ergonomic_chair' | 'computing_equipment' | 'accessory'

/** Columnas que el caso puede variar sobre la fila mínima del helper. */
interface DeclarationOverrides {
  category?: OwnEquipmentCategory
  /** Colaborador dueño de la fila; por defecto, el del grupo (A). */
  employeeId?: number
  businessUnitId?: number
  /**
   * Key del objeto en S3 tal como la escribiría el alta; ausente o `null` deja
   * la columna en NULL y `''` la deja vacía (ninguna de las dos es evidencia).
   */
  file?: string | null
}

test.group('Declaraciones de equipo propio — evidencia (sin HTTP)', (group) => {
  let actor: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  const createdDeclarationIds: number[] = []

  const repository = new OwnEquipmentDeclarationsRepositoryMysql()

  const actorUserId = () => required(actor, 'el actor').user.userId
  const employeeId = () => required(employee, 'el colaborador').employee.employeeId
  const businessUnitId = () => required(actor, 'el actor').businessUnit.businessUnitId
  const employeeIdB = () => required(employeeB, 'el colaborador de B').employee.employeeId
  const businessUnitIdB = () => required(actorB, 'el actor de B').businessUnit.businessUnitId

  /** Key de evidencia con la carpeta real del módulo, bajo el prefijo del intake. */
  const evidenceKey = (fileName: string) =>
    `valanserhfiles/${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${businessUnitId()}/${fileName}`

  /**
   * Inserta una declaración mínima por tabla, colgada del colaborador y la
   * empresa del fixture —por defecto los de A; el caso puede apuntar a B para
   * probar el aislamiento entre empresas. La empresa es SIEMPRE la del
   * colaborador, nunca otra; `created_by_user_id` es el usuario del actor. La
   * columna de la evidencia se escribe tal cual la recibe, para que el caso
   * pueda distinguir NULL de cadena vacía.
   */
  async function insertDeclaration(overrides: DeclarationOverrides = {}): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeId(),
      business_unit_id: overrides.businessUnitId ?? businessUnitId(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description: `Equipo propio con evidencia ${RUN}`,
      employee_own_equipment_declaration_start_date: '2026-11-01',
      employee_own_equipment_declaration_monthly_fee: 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_status: 'active',
      employee_own_equipment_declaration_file: overrides.file ?? null,
      employee_own_equipment_declaration_created_by_user_id: actorUserId(),
      employee_own_equipment_declaration_created_at: new Date(),
    })

    const id = Number(declarationId)
    createdDeclarationIds.push(id)
    return id
  }

  /** Columna cruda de la evidencia, tal como quedó en la fila. */
  async function storedFile(declarationId: number): Promise<string | null> {
    const row: { file: string | null } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select('employee_own_equipment_declaration_file as file')
      .firstOrFail()

    return row.file
  }

  group.setup(async () => {
    actor = await createTenantActor('equipo-propio-evidencia')
    actorB = await createTenantActor('equipo-propio-evidencia-b')
    employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, `emp-${RUN.slice(-6)}`)
    employeeB = await createEmployeeFixture(
      actorB.businessUnit.businessUnitId,
      `empb-${RUN.slice(-6)}`
    )
  })

  // El colaborador es uno solo para todo el grupo: cada caso arrastra las filas
  // que insertó para que el UNIQUE de la vigente no se herede entre pruebas.
  group.each.teardown(async () => {
    if (createdDeclarationIds.length > 0) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_own_equipment_declaration_id', createdDeclarationIds)
        .delete()
      createdDeclarationIds.length = 0
    }
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeB)
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actorB)
    await cleanupTenantActor(actor)
  })

  test('RF: insert escribe la columna de evidencia y findById expone hasEvidence', async ({
    assert,
  }) => {
    const key = evidenceKey('c1.pdf')

    // Con archivo: la key se escribe tal cual y el DTO solo la delata con un booleano.
    const withFileId = await insertDeclaration({ file: key })
    assert.equal(await storedFile(withFileId), key)

    const withFile = required(
      await repository.findById(db, [businessUnitId()], withFileId),
      'la declaración con evidencia'
    )
    assert.isTrue(withFile.hasEvidence)
    // La key es privada (§14): el DTO nunca expone la columna ni su contenido.
    assert.notProperty(withFile, 'employee_own_equipment_declaration_file')
    assert.notInclude(JSON.stringify(withFile), key)

    // Sin archivo: la columna queda NULL (`row.file ?? null`) y el DTO lo dice.
    // Categoría distinta de la anterior: el UNIQUE admite una sola vigente por
    // colaborador y categoría.
    const withoutFileId = await insertDeclaration({ category: 'computing_equipment' })
    assert.isNull(await storedFile(withoutFileId))

    const withoutFile = required(
      await repository.findById(db, [businessUnitId()], withoutFileId),
      'la declaración sin evidencia'
    )
    assert.isFalse(withoutFile.hasEvidence)

    // Cadena vacía: la columna tiene texto, pero no es evidencia.
    const emptyId = await insertDeclaration({ category: 'accessory', file: '' })
    assert.equal(await storedFile(emptyId), '')

    const empty = required(
      await repository.findById(db, [businessUnitId()], emptyId),
      'la declaración con cadena vacía'
    )
    assert.isFalse(empty.hasEvidence)
  })

  test('RF: findEvidencePath devuelve la ruta viva dentro del alcance, vigente o cerrada', async ({
    assert,
  }) => {
    const key = evidenceKey('c2.pdf')
    const withFileId = await insertDeclaration({ file: key })
    const withoutFileId = await insertDeclaration({ category: 'computing_equipment' })

    // Vigente con archivo: la ruta tal cual quedó escrita.
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withFileId), {
      declarationId: withFileId,
      storedPath: key,
    })

    // Vigente sin archivo: la declaración existe, la evidencia no.
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withoutFileId), {
      declarationId: withoutFileId,
      storedPath: null,
    })

    // Cerrada (regla 8): el cierre conserva la evidencia y la ruta sigue viva.
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', withFileId)
      .update({ employee_own_equipment_declaration_status: 'closed' })
    assert.deepEqual(await repository.findEvidencePath([businessUnitId()], withFileId), {
      declarationId: withFileId,
      storedPath: key,
    })

    // Ajena: el id de B con el alcance de A es indistinguible de inexistente.
    const foreignId = await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: businessUnitIdB(),
    })
    assert.isNull(await repository.findEvidencePath([businessUnitId()], foreignId))
    assert.isNull(await repository.findEvidencePath([businessUnitId()], 2_000_000_000))

    // Borrada lógicamente: fuera, aunque tenga archivo.
    const deletedId = await insertDeclaration({ category: 'accessory', file: key })
    await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', deletedId)
      .update({ employee_own_equipment_declaration_deleted_at: new Date() })
    assert.isNull(await repository.findEvidencePath([businessUnitId()], deletedId))
  })

  test('RF: las constantes fijan la carpeta y el prefijo de descarga de la evidencia', ({
    assert,
  }) => {
    assert.equal(OWN_EQUIPMENT_EVIDENCE_S3_FOLDER, 'own-equipment-declarations')
    assert.equal(ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence, 'equipo-propio')
  })
})

/** PNG válido de 1x1 (molde de `assets_module.spec.ts`): entra por su firma real. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** Estado del resguardo de un insumo de teletrabajo que el caso necesita variar. */
type ResguardoStatus = 'active' | 'retired' | 'shipping'

/** Bytes que entrega el doble de `getObjectStream` en las descargas. */
const FAKE_EVIDENCE_BYTES = Buffer.from('%PDF-1.4 evidencia de prueba')

/**
 * PDF de evidencia de ~200 KB: el caso ejercita un archivo de tamaño real. El
 * adjunto va con bytes ALEATORIOS porque pdf-lib comprime (Flate) lo repetido y
 * un relleno de `'A'` saldría de unos cientos de bytes.
 */
async function buildEvidencePdf(): Promise<Buffer> {
  const document = await PDFDocument.create()
  document.addPage([300, 300])
  await document.attach(new Uint8Array(randomBytes(200 * 1024)), 'acuerdo.txt')
  return Buffer.from(await document.save())
}

/**
 * Declaración del uso de equipo propio — evidencia (VLRH-H1791493046616).
 *
 * Parte 2 (CA-1 a CA-6 y el huérfano): el alta HTTP
 * `POST /api/employees/:employeeId/own-equipment-declarations` pasa a
 * multipart y gana el archivo opcional de la evidencia, que el servicio sube
 * DESPUÉS de las validaciones baratas (pertenencia, teletrabajo, cuota,
 * cobertura, vigente) y ANTES de la transacción (§7).
 *
 * Parte 3 (CA-7 a CA-12): la descarga privada de la evidencia y la regresión
 * de las descargas que ya existían (la responsiva y las fotos conservan
 * `inline`, CA-12).
 *
 * El almacenamiento se dobla sobre `UploadService.prototype` y se restaura en
 * el teardown del grupo (molde
 * `tests/functional/employees/employee_biometric_face_photo_stream.spec.ts:209-236`).
 * El doble de `fileUpload` ENVUELVE el intake real (`FileIntakeService.accept`):
 * los magic bytes, el tope de 10 MB y el re-encode a JPEG son los de
 * producción, pero la key se compone en memoria y NUNCA se toca el bucket — así
 * ningún caso depende del S3 de pruebas.
 */
test.group('Declaraciones de equipo propio — evidencia HTTP', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let owner: UnitUser | null = null
  let root: UnitUser | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null
  let previousEmployeesEnforcement = false
  let originalFileUpload: typeof UploadService.prototype.fileUpload
  let originalGetObjectStream: typeof UploadService.prototype.getObjectStream
  let fixtureSeq = 0

  const createdSupplyTypeIds: number[] = []
  const createdSupplyIds: number[] = []
  const createdEmployeeSupplyIds: number[] = []
  const createdPhotoIds: number[] = []

  /** Archivo que el caso manda como `file` del multipart. */
  interface EvidenceFile {
    buffer: Buffer
    filename: string
    contentType: string
  }

  /** Una llamada al doble de `fileUpload`, con sus argumentos (§14). */
  interface UploadCall {
    profileName: FileIntakeProfileName
    folderName: string
    fileName: string | undefined
    /** MIME REAL de salida del intake: delata el re-encode sin tocar el bucket. */
    intakeMimeType: string | null
  }

  const uploadCalls: UploadCall[] = []

  /**
   * Doble de `fileUpload`: corre el intake REAL (magic bytes, tope de 10 MB y
   * re-encode) y compone la key con la forma de §14 sin subir nada. Con archivo
   * nulo se comporta como el original (centinela `file_not_found`) y NO cuenta
   * el intake: el servicio nunca debe llamarlo sin archivo.
   */
  async function stubbedFileUpload(
    file: IncomingFile | null | undefined,
    profileName: FileIntakeProfileName,
    folderName = '',
    options: FileUploadOptions = {}
  ): Promise<string> {
    if (!file) {
      uploadCalls.push({
        profileName,
        folderName,
        fileName: options.fileName,
        intakeMimeType: null,
      })
      return 'file_not_found'
    }

    const intake = await new FileIntakeService().accept(file, profileName)
    uploadCalls.push({
      profileName,
      folderName,
      fileName: options.fileName,
      intakeMimeType: intake.mimeType,
    })

    // Espejo de `replaceExtension`: la extensión REAL manda sobre la del nombre.
    const extension = intake.storageFileName.slice(intake.storageFileName.lastIndexOf('.'))
    const base = options.fileName ?? intake.storageFileName
    const lastDot = base.lastIndexOf('.')
    return lastDot > base.lastIndexOf('/')
      ? `${base.slice(0, lastDot)}${extension}`
      : `${base}${extension}`
  }

  const actorAUser = () => required(actorA, 'el actor A').user
  const employeeIdA = () => required(employeeA, 'el colaborador A').employee.employeeId
  const employeeIdB = () => required(employeeB, 'el colaborador B').employee.employeeId
  const buIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitId
  const buIdB = () => required(actorB, 'el actor B').businessUnit.businessUnitId
  const buPublicIdA = () => required(actorA, 'el actor A').businessUnit.businessUnitPublicId
  const buPublicIdB = () => required(actorB, 'el actor B').businessUnit.businessUnitPublicId

  /** Key de evidencia con la carpeta real del módulo, bajo el prefijo del intake. */
  const evidenceKey = (fileName: string) =>
    `valanserhfiles/${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${buIdA()}/${fileName}`

  /** Campos de texto del alta (el archivo viaja aparte); el caso cambia lo suyo. */
  const BASE_FIELDS: Record<string, string> = {
    category: 'ergonomic_chair',
    description: 'Silla de oficina con respaldo ajustable',
    conditions: 'Buen estado; uso exclusivo para trabajo',
    startDate: '2026-11-01',
    monthlyFee: '350',
  }

  /** POST multipart del alta como el usuario dado, con la empresa en la cabecera. */
  function postMultipart(
    client: ApiClient,
    user: User,
    buPublicId: string,
    employeeId: number,
    fields: Record<string, string>,
    file?: EvidenceFile
  ) {
    const request = client
      .post(`/api/employees/${employeeId}/own-equipment-declarations`)
      .loginAs(user)
      .headers({ 'X-Business-Unit-Id': buPublicId })
      .fields(fields)

    return file === undefined
      ? request
      : request.file('file', file.buffer, {
          filename: file.filename,
          contentType: file.contentType,
        })
  }

  /** GET de la evidencia como el usuario dado, con la empresa en la cabecera. */
  function getEvidence(
    client: ApiClient,
    user: User,
    buPublicId: string,
    declarationId: number
  ) {
    return client
      .get(`/api/own-equipment-declarations/${declarationId}/file`)
      .loginAs(user)
      .headers({ 'X-Business-Unit-Id': buPublicId })
  }

  /**
   * Inserta una declaración mínima por tabla, colgada del colaborador y la
   * empresa del fixture —por defecto los de A; el caso puede apuntar a B para
   * probar el aislamiento entre empresas (CA-8).
   */
  async function insertDeclaration(
    overrides: {
      category?: OwnEquipmentCategory
      employeeId?: number
      businessUnitId?: number
      file?: string | null
      status?: 'active' | 'closed'
      endDate?: string
    } = {}
  ): Promise<number> {
    const [declarationId] = await db.table('employee_own_equipment_declarations').insert({
      employee_id: overrides.employeeId ?? employeeIdA(),
      business_unit_id: overrides.businessUnitId ?? buIdA(),
      employee_own_equipment_declaration_category: overrides.category ?? 'ergonomic_chair',
      employee_own_equipment_declaration_description: `Equipo propio con evidencia HTTP ${RUN}`,
      employee_own_equipment_declaration_start_date: '2026-11-01',
      employee_own_equipment_declaration_end_date: overrides.endDate ?? null,
      employee_own_equipment_declaration_monthly_fee: 350,
      employee_own_equipment_declaration_fee_source: 'adjusted',
      employee_own_equipment_declaration_status: overrides.status ?? 'active',
      employee_own_equipment_declaration_file: overrides.file ?? null,
      employee_own_equipment_declaration_created_by_user_id: required(actorA, 'el actor A').user
        .userId,
      employee_own_equipment_declaration_created_at: new Date(),
    })

    return Number(declarationId)
  }

  /** Columna cruda de la evidencia, tal como quedó en la fila. */
  async function storedFile(declarationId: number): Promise<string | null> {
    const row: { file: string | null } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select('employee_own_equipment_declaration_file as file')
      .firstOrFail()

    return row.file
  }

  /** Declaraciones vivas del colaborador, de cualquier estado. */
  async function declarationCount(employeeId: number): Promise<number> {
    const rows = await db
      .from('employee_own_equipment_declarations')
      .where('employee_id', employeeId)
      .whereNull('employee_own_equipment_declaration_deleted_at')

    return rows.length
  }

  /**
   * Insumo de teletrabajo con su tipo y su resguardo, por tabla (espejo de
   * `createTeleworkSupply` del spec hermano). Devuelve el resguardo para colgar
   * su foto (CA-12) o para variar su estado (CA-6).
   */
  async function createResguardo(
    overrides: { category?: OwnEquipmentCategory; status?: ResguardoStatus } = {}
  ): Promise<number> {
    fixtureSeq += 1

    const [typeId] = await db.table('supply_types').insert({
      business_unit_id: buIdA(),
      supply_type_name: `Insumo evidencia ${RUN}-${fixtureSeq}`,
      supply_type_slug: `insumo-evidencia-${RUN}-${fixtureSeq}`,
      supply_type_telework_category: overrides.category ?? 'ergonomic_chair',
      supply_type_created_at: new Date(),
    })
    createdSupplyTypeIds.push(Number(typeId))

    const [supplyId] = await db.table('supplies').insert({
      business_unit_id: buIdA(),
      // `supply_file_number` es UNIQUE: rango propio de este spec y sufijo por
      // llamada para no chocar consigo mismo dentro de la misma corrida.
      supply_file_number: 5_000_000_000 + (Date.now() % 100_000_000) + fixtureSeq,
      supply_name: `Activo de evidencia ${fixtureSeq}`,
      supply_type_id: Number(typeId),
      supply_status: 'active',
      supply_created_at: new Date(),
    })
    createdSupplyIds.push(Number(supplyId))

    const [employeeSupplyId] = await db.table('employee_supplies').insert({
      employee_id: employeeIdA(),
      supply_id: Number(supplyId),
      business_unit_id: buIdA(),
      employee_supply_status: overrides.status ?? 'active',
      employee_supply_assignament_date: '2026-08-01 00:00:00',
      employee_supply_created_at: new Date(),
    })
    createdEmployeeSupplyIds.push(Number(employeeSupplyId))

    return Number(employeeSupplyId)
  }

  /** Foto de asignación de un resguardo, con su objeto en el almacenamiento. */
  async function insertAssignationPhoto(employeeSupplyId: number): Promise<number> {
    const [photoId] = await db.table('employee_supplie_assignation_photos').insert({
      employee_supply_id: employeeSupplyId,
      employee_supplie_assignation_photo_type: 'assignation',
      employee_supplie_assignation_photo_file: evidenceKey('foto-resguardo.jpg'),
      employee_supplie_assignation_photo_created_at: new Date(),
      employee_supplie_assignation_photo_updated_at: new Date(),
    })

    const id = Number(photoId)
    createdPhotoIds.push(id)
    return id
  }

  group.setup(async () => {
    // La exigencia de Empleados nace apagada (estado de entrega): se enciende
    // solo para este grupo y se repone en el teardown. La de Insumos ya viene
    // encendida y es la que sostiene el 403 del gate de descarga (CA-11).
    previousEmployeesEnforcement = await setModuleEnforcement('employees', true)
    await assertModuleEnforced('employees')
    await assertModuleEnforced('supplies')

    originalFileUpload = UploadService.prototype.fileUpload
    originalGetObjectStream = UploadService.prototype.getObjectStream
    UploadService.prototype.fileUpload = stubbedFileUpload
    UploadService.prototype.getObjectStream = async () => ({
      stream: Readable.from([FAKE_EVIDENCE_BYTES]),
      contentType: 'application/pdf',
      contentLength: FAKE_EVIDENCE_BYTES.length,
      etag: 'test-etag',
      lastModified: new Date(),
    })

    actorA = await createTenantActor('equipo-propio-evidencia-http-a')
    await grantModulePermissions(actorA, 'employees', ['manage-employee-supplies'])
    // La descarga y la matriz piden `supplies:read`: se SUMA a la concesión de
    // Empleados, porque `grantModulePermissions` la reemplazaría por completo.
    await addRoleModulePermissions(actorA.role, 'supplies', ['read'])
    actorB = await createTenantActor('equipo-propio-evidencia-http-b')
    owner = await createBypassUserInBusinessUnit(
      'owner',
      `equipo-propio-evidencia-owner-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    root = await createBypassUserInBusinessUnit(
      'root',
      `equipo-propio-evidencia-root-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    employeeA = await createEmployeeFixture(
      actorA.businessUnit.businessUnitId,
      `empA-${RUN.slice(-6)}`
    )
    employeeB = await createEmployeeFixture(
      actorB.businessUnit.businessUnitId,
      `empB-${RUN.slice(-6)}`
    )

    // Modalidad por tabla: el fixture nace Onsite sin porcentaje y la matriz
    // (CA-9) exige teletrabajo para armar sus categorías.
    await db
      .from('employees')
      .where('employee_id', employeeA.employee.employeeId)
      .update({ employee_work_schedule: 'Remote', employee_telework_percentage: 100 })
  })

  // Cada caso arrastra sus filas para que la vigente no se herede entre pruebas
  // (el UNIQUE admite una sola `active` por colaborador y categoría) y para que
  // el borrado del colaborador no choque con la FK RESTRICT. Las declaraciones
  // se borran por COLABORADOR y no por id: los colaboradores son de este spec,
  // así que todas sus filas son nuestras —incluidas las que un caso en rojo
  // dejó sin alcanzar a registrar.
  group.each.teardown(async () => {
    if (employeeA && employeeB) {
      await db
        .from('employee_own_equipment_declarations')
        .whereIn('employee_id', [employeeIdA(), employeeIdB()])
        .delete()
    }
    if (createdPhotoIds.length > 0) {
      await db
        .from('employee_supplie_assignation_photos')
        .whereIn('employee_supplie_assignation_photo_id', createdPhotoIds)
        .delete()
      createdPhotoIds.length = 0
    }
    if (createdEmployeeSupplyIds.length > 0) {
      await db
        .from('employee_supplies')
        .whereIn('employee_supply_id', createdEmployeeSupplyIds)
        .delete()
      createdEmployeeSupplyIds.length = 0
    }
    if (createdSupplyIds.length > 0) {
      await db.from('supplies').whereIn('supply_id', createdSupplyIds).delete()
      createdSupplyIds.length = 0
    }
    if (createdSupplyTypeIds.length > 0) {
      await db.from('supply_types').whereIn('supply_type_id', createdSupplyTypeIds).delete()
      createdSupplyTypeIds.length = 0
    }
    uploadCalls.length = 0
  })

  group.teardown(async () => {
    try {
      UploadService.prototype.fileUpload = originalFileUpload
      UploadService.prototype.getObjectStream = originalGetObjectStream
      await cleanupEmployeeFixture(employeeB)
      await cleanupEmployeeFixture(employeeA)
      await cleanupUnitUser(root)
      await cleanupUnitUser(owner)
      await cleanupTenantActor(actorB)
      await cleanupTenantActor(actorA)
    } finally {
      await setModuleEnforcement('employees', previousEmployeesEnforcement)
    }
  })

  test('CA-1: el alta multipart con PDF guarda la evidencia sin PII en la key', async ({
    client,
    assert,
  }) => {
    const pdf = await buildEvidencePdf()
    // El caso ejercita un archivo de tamaño real, no un token de tres bytes.
    assert.isAbove(pdf.length, 100_000)

    const response = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      { buffer: pdf, filename: 'Acuerdo Juan Perez.pdf', contentType: 'application/pdf' }
    )

    response.assertStatus(201)
    const data = response.body().data
    assert.isTrue(data.hasEvidence)

    // §14: la key sale de la carpeta, la empresa del colaborador y un `cuid`;
    // del nombre que mandó el cliente solo sobrevive la extensión.
    assert.lengthOf(uploadCalls, 1)
    assert.equal(uploadCalls[0].profileName, 'evidence-document')
    assert.equal(uploadCalls[0].folderName, '')
    assert.match(
      uploadCalls[0].fileName ?? '',
      new RegExp(`^${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${buIdA()}/[a-z0-9]+$`)
    )
    assert.equal(uploadCalls[0].intakeMimeType, 'application/pdf')

    const stored = await storedFile(data.declarationId)
    assert.isNotNull(stored)
    assert.include(stored!, `${OWN_EQUIPMENT_EVIDENCE_S3_FOLDER}/${buIdA()}/`)
    assert.match(stored!, /\.pdf$/)
    for (const pii of ['Juan', 'Perez', 'Acuerdo']) {
      assert.notInclude(stored!, pii)
    }

    // La key NUNCA sale al API.
    assert.notProperty(data, 'file')
    assert.notProperty(data, 'employee_own_equipment_declaration_file')
    assert.notInclude(JSON.stringify(response.body()), stored!)
  })

  test('CA-2: el alta sin archivo deja hasEvidence en falso y no sube nada', async ({
    client,
    assert,
  }) => {
    const response = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS
    )

    response.assertStatus(201)
    const data = response.body().data
    assert.isFalse(data.hasEvidence)
    assert.isNull(await storedFile(data.declarationId))
    // El servicio NO llama al almacenamiento sin archivo (§14).
    assert.lengthOf(uploadCalls, 0)
  })

  test('CA-3: la foto PNG entra por el intake real y se guarda como JPEG', async ({
    client,
    assert,
  }) => {
    const response = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      {
        buffer: Buffer.from(ONE_PIXEL_PNG, 'base64'),
        filename: 'foto-equipo.png',
        contentType: 'image/png',
      }
    )

    response.assertStatus(201)
    const data = response.body().data
    assert.isTrue(data.hasEvidence)

    // El perfil re-encodea la imagen (descarta EXIF y ubicación): el MIME REAL
    // de salida y la extensión de la key son JPEG.
    assert.lengthOf(uploadCalls, 1)
    assert.equal(uploadCalls[0].intakeMimeType, 'image/jpeg')
    assert.match((await storedFile(data.declarationId)) ?? '', /\.jpg$/)
  })

  test('CA-4: el intake rechaza el tipo y la declaración no se guarda', async ({
    client,
    assert,
  }) => {
    const before = await declarationCount(employeeIdA())

    const fakePdf = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      {
        buffer: Buffer.from('esto no es un PDF'),
        filename: 'acuerdo.pdf',
        contentType: 'application/pdf',
      }
    )
    fakePdf.assertStatus(422)
    assert.equal(fakePdf.body().key, 'contenido-no-corresponde')
    assert.equal(fakePdf.body().code, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
    assert.equal(fakePdf.body().title, 'Archivo no aceptado')
    assert.equal(
      fakePdf.body().detail,
      'El contenido del archivo no corresponde a PDF, JPG, JPEG, PNG, WEBP.'
    )

    const wrongExtension = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      { buffer: Buffer.from('una nota de texto'), filename: 'nota.txt', contentType: 'text/plain' }
    )
    wrongExtension.assertStatus(422)
    assert.equal(wrongExtension.body().key, 'extension-no-permitida')
    assert.equal(wrongExtension.body().code, FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED)
    assert.equal(
      wrongExtension.body().detail,
      'Solo se aceptan archivos PDF, JPG, JPEG, PNG, WEBP.'
    )

    const tooLarge = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      {
        buffer: Buffer.alloc(11 * 1024 * 1024, 0x41),
        filename: 'acuerdo-grande.pdf',
        contentType: 'application/pdf',
      }
    )
    tooLarge.assertStatus(422)
    assert.equal(tooLarge.body().key, 'archivo-demasiado-grande')
    assert.equal(tooLarge.body().code, FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE)
    assert.equal(tooLarge.body().detail, 'El archivo supera el tamaño máximo de 10 MB.')

    // Ningún rechazo dejó fila: la declaración no se guarda sin su evidencia.
    assert.equal(await declarationCount(employeeIdA()), before)
  })

  test('CA-5: la falla del almacenamiento responde 500 con su sobre y sin fila', async ({
    client,
    assert,
  }) => {
    const before = await declarationCount(employeeIdA())
    UploadService.prototype.fileUpload = async () => {
      throw new FileIntakeError({
        title: 'Archivo no almacenado',
        detail: 'No fue posible guardar el archivo. Vuelve a intentarlo.',
        key: 'archivo-no-almacenado',
        errorCode: FILE_INTAKE_ERROR_CODES.SYS_UNHANDLED,
        status: 500,
      })
    }

    try {
      const response = await postMultipart(
        client,
        actorAUser(),
        buPublicIdA(),
        employeeIdA(),
        BASE_FIELDS,
        {
          buffer: Buffer.from(ONE_PIXEL_PNG, 'base64'),
          filename: 'foto-equipo.png',
          contentType: 'image/png',
        }
      ).setup((request) => {
        // El 500 es la respuesta esperada del caso: superagent lo tomaría como
        // fallo de transporte y no dejaría assertar su sobre.
        request.request.ok(() => true)
      })

      response.assertStatus(500)
      assert.equal(response.body().key, 'archivo-no-almacenado')
      assert.equal(response.body().code, FILE_INTAKE_ERROR_CODES.SYS_UNHANDLED)
      assert.equal(response.body().title, 'Archivo no almacenado')
      assert.equal(
        response.body().detail,
        'No fue posible guardar el archivo. Vuelve a intentarlo.'
      )
      assert.equal(await declarationCount(employeeIdA()), before)
    } finally {
      UploadService.prototype.fileUpload = stubbedFileUpload
    }
  })

  test('CA-6: las validaciones baratas corren antes de subir el archivo', async ({
    client,
    assert,
  }) => {
    const png = {
      buffer: Buffer.from(ONE_PIXEL_PNG, 'base64'),
      filename: 'foto-equipo.png',
      contentType: 'image/png',
    }

    // Colaborador de B con el alcance de A: 404 y nada subido.
    const foreign = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdB(),
      BASE_FIELDS,
      png
    )
    foreign.assertStatus(404)
    assert.equal(foreign.body().key, 'colaborador-no-encontrado')
    assert.lengthOf(uploadCalls, 0)

    // Categoría cubierta por un activo asignado: 409 y nada subido.
    await createResguardo({ category: 'computing_equipment', status: 'active' })
    const covered = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      { ...BASE_FIELDS, category: 'computing_equipment' },
      png
    )
    covered.assertStatus(409)
    assert.equal(covered.body().key, 'categoria-cubierta-por-activo')
    assert.lengthOf(uploadCalls, 0)

    // Declaración vigente existente: 409 y nada subido.
    const first = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS
    )
    first.assertStatus(201)

    const again = await postMultipart(
      client,
      actorAUser(),
      buPublicIdA(),
      employeeIdA(),
      BASE_FIELDS,
      png
    )
    again.assertStatus(409)
    assert.equal(again.body().key, 'declaracion-de-equipo-propio-vigente-existente')
    assert.lengthOf(uploadCalls, 0)
  })

  test('RF: la transacción que truena tras subir registra el huérfano y no guarda fila', async ({
    client,
    assert,
  }) => {
    const before = await declarationCount(employeeIdA())
    const originalInsert = OwnEquipmentDeclarationsRepositoryMysql.prototype.insert
    const originalWarn = logger.warn
    const warnMessages: string[] = []

    OwnEquipmentDeclarationsRepositoryMysql.prototype.insert = async () => {
      throw new Error('fallo simulado del insert')
    }
    logger.warn = ((...args: unknown[]) => {
      warnMessages.push(String(args[args.length - 1]))
    }) as unknown as typeof logger.warn

    try {
      const response = await postMultipart(
        client,
        actorAUser(),
        buPublicIdA(),
        employeeIdA(),
        BASE_FIELDS,
        {
          buffer: Buffer.from(ONE_PIXEL_PNG, 'base64'),
          filename: 'foto-equipo.png',
          contentType: 'image/png',
        }
      ).setup((request) => {
        request.request.ok(() => true)
      })

      response.assertStatus(500)
      assert.equal(response.body().key, 'error-inesperado')
      // El objeto quedó huérfano: se subió UNA vez y no hay fila (regla 8: nada
      // se borra; el log deja el rastro).
      assert.lengthOf(uploadCalls, 1)
      assert.equal(await declarationCount(employeeIdA()), before)
      assert.include(warnMessages, 'Equipo propio: evidencia sin declaración')
    } finally {
      OwnEquipmentDeclarationsRepositoryMysql.prototype.insert = originalInsert
      logger.warn = originalWarn
    }
  })

  test('CA-7: la descarga entrega attachment con nombre genérico, nosniff y sin caché', async ({
    client,
    assert,
  }) => {
    const declarationId = await insertDeclaration({ file: evidenceKey('c7.pdf') })

    const response = await getEvidence(client, actorAUser(), buPublicIdA(), declarationId)

    response.assertStatus(200)
    response.assertHeader('content-type', 'application/pdf')
    response.assertHeader('cache-control', 'private, no-store')
    response.assertHeader('x-content-type-options', 'nosniff')
    // El nombre es genérico: el del archivo original nunca se usa (§14).
    assert.match(
      String(response.header('content-disposition')),
      new RegExp(`^attachment; filename="equipo-propio-${declarationId}\\.pdf"`)
    )
  })

  test('CA-8: inexistente, ajena y sin archivo responden el mismo 404', async ({
    client,
    assert,
  }) => {
    const withoutFileId = await insertDeclaration({ category: 'computing_equipment' })
    const foreignId = await insertDeclaration({
      employeeId: employeeIdB(),
      businessUnitId: buIdB(),
      file: evidenceKey('c8-ajena.pdf'),
    })

    const expected = {
      type: 'error',
      title: 'Archivo no encontrado',
      message: 'El archivo no existe o no está disponible.',
      detail: 'El archivo no existe o no está disponible.',
      key: 'archivo-no-encontrado',
      data: null,
    }

    for (const declarationId of [2_000_000_000, foreignId, withoutFileId]) {
      const response = await getEvidence(client, actorAUser(), buPublicIdA(), declarationId)
      response.assertStatus(404)
      assert.deepEqual(response.body(), expected, `la declaración ${declarationId}`)
    }
  })

  test('CA-9: una declaración cerrada con evidencia se descarga y sale en el histórico', async ({
    client,
    assert,
  }) => {
    const declarationId = await insertDeclaration({
      category: 'accessory',
      file: evidenceKey('c9.pdf'),
      status: 'closed',
      endDate: '2026-10-31',
    })

    // La cerrada (regla 8) conserva su evidencia y la descarga sigue viva.
    const download = await getEvidence(client, actorAUser(), buPublicIdA(), declarationId)
    download.assertStatus(200)
    assert.match(
      String(download.header('content-disposition')),
      new RegExp(`^attachment; filename="equipo-propio-${declarationId}\\.pdf"`)
    )

    // Y la matriz de la ficha la trae en el histórico con su bandera.
    const matrix = await client
      .get(`/api/employees/${employeeIdA()}/telework-supplies`)
      .loginAs(actorAUser())
      .headers({ 'X-Business-Unit-Id': buPublicIdA() })
    matrix.assertStatus(200)

    const history = matrix.body().data.ownEquipmentHistory as Array<{
      declarationId: number
      hasEvidence: boolean
    }>
    const row = history.find((item) => item.declarationId === declarationId)
    assert.isDefined(row, 'la declaración cerrada en el histórico')
    assert.isTrue(row!.hasEvidence)
  })

  test('CA-10: el ajuste no hereda la evidencia y el PUT ignora el archivo', async ({
    client,
    assert,
  }) => {
    const declarationId = await insertDeclaration({ file: evidenceKey('c10.pdf') })

    const adjusted = await client
      .put(`/api/own-equipment-declarations/${declarationId}`)
      .loginAs(actorAUser())
      .headers({ 'X-Business-Unit-Id': buPublicIdA() })
      .json({ effectiveDate: '2026-12-01', monthlyFee: 420 })

    adjusted.assertStatus(200)
    const newDeclarationId = adjusted.body().data.declarationId
    // La versión nueva nace sin evidencia (regla 5).
    assert.isFalse(adjusted.body().data.hasEvidence)

    const closed: { status: string; file: string | null } = await db
      .from('employee_own_equipment_declarations')
      .where('employee_own_equipment_declaration_id', declarationId)
      .select(
        'employee_own_equipment_declaration_status as status',
        'employee_own_equipment_declaration_file as file'
      )
      .firstOrFail()
    assert.equal(closed.status, 'closed')
    assert.isNotNull(closed.file)

    // El PUT no acepta archivo: multipart con `file` y CERO llamadas al almacén.
    const withFile = await client
      .put(`/api/own-equipment-declarations/${newDeclarationId}`)
      .loginAs(actorAUser())
      .headers({ 'X-Business-Unit-Id': buPublicIdA() })
      .fields({ effectiveDate: '2027-01-01', monthlyFee: '500' })
      .file('file', Buffer.from(ONE_PIXEL_PNG, 'base64'), {
        filename: 'foto-equipo.png',
        contentType: 'image/png',
      })

    withFile.assertStatus(200)
    assert.isFalse(withFile.body().data.hasEvidence)
    assert.lengthOf(uploadCalls, 0)
  })

  test('CA-11: sin supplies:read el gate responde 403; root y owner cruzan', async ({
    client,
    assert,
  }) => {
    const declarationId = await insertDeclaration({ file: evidenceKey('c11.pdf') })

    // El actor B no tiene `supplies:read` y el módulo está exigido.
    const denied = await getEvidence(
      client,
      required(actorB, 'el actor B').user,
      buPublicIdB(),
      declarationId
    )
    assertPermissionDenied(assert, denied)

    for (const unitUser of [required(root, 'el root'), required(owner, 'el owner')]) {
      const response = await getEvidence(client, unitUser.user, buPublicIdA(), declarationId)
      response.assertStatus(200)
    }
  })

  test('CA-12: las descargas existentes conservan inline y ganan nosniff', async ({
    client,
    assert,
  }) => {
    const employeeSupplyId = await createResguardo()
    const photoId = await insertAssignationPhoto(employeeSupplyId)

    const response = await client
      .get(`/api/employee-supply-assignation-photos/photo/${photoId}/file`)
      .loginAs(actorAUser())
      .headers({ 'X-Business-Unit-Id': buPublicIdA() })

    response.assertStatus(200)
    // La responsiva y las fotos se abren en pestaña: la disposición por omisión
    // del `send` sigue siendo `inline` (CA-12).
    assert.isTrue(String(response.header('content-disposition')).startsWith('inline'))
    response.assertHeader('x-content-type-options', 'nosniff')
    response.assertHeader('cache-control', 'private, no-store')
  })
})
