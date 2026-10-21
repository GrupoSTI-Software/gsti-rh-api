import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'
import TeleworkPhotoNoticeAcknowledgement from '#models/telework_photo_notice_acknowledgement'
import TeleworkPhotoNotice from '#models/telework_photo_notice'
import TeleworkPhotoNoticeTemplatesSeeder from '#database/seeders/0067_telework_photo_notice_templates_seeder'
import { TenantContext } from '#utils/tenant_context'
import {
  createTenantActor,
  cleanupTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'

// La superficie HTTP (Tarea 4) vive al final del archivo, con sus envoltorios
// por endpoint: `grantModulePermissions` siembra en cada caso las concesiones
// del módulo de teletrabajo, porque el rol del actor nace vacío.

/**
 * Tests funcionales — aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310).
 *
 * El archivo nace con las fixtures compartidas y el grupo «esquema y semilla»
 * (Tarea 1): las tres tablas de §10 con sus llaves (una versión por empresa, un
 * acuse por aviso y colaborador), el cifrado en reposo del acuse y la
 * idempotencia de la plantilla sembrada. Los grupos HTTP de las Tareas 2-4 se
 * cuelgan de estas mismas fixtures.
 *
 * Convenciones:
 *  - Actores propios por grupo con `createTenantActor`: su rol arranca SIN
 *    concesiones y cada caso siembra las suyas (nunca en el `setup`, para que
 *    el caso de 403 vea el rol vacío). El grupo que comparte rol entre casos
 *    con juegos de permisos distintos —CA-13— lo vacía en su `each.setup`, así
 *    que ningún caso depende del juego que dejó el anterior.
 *  - Lecturas por MODELO dentro de `TenantContext.run([businessUnitId], …)`: el
 *    mixin `withBusinessUnitScope()` lanza `TenantContextMissingException`
 *    fuera de una petición HTTP (dentro la pone el middleware). Las escrituras
 *    por `db.table(...)` y el modelo de la plantilla —sin mixin— no lo
 *    necesitan.
 *  - Limpieza en `group.teardown` con el orden que exigen las FK `RESTRICT`:
 *    acuses → avisos → colaborador → organigrama → actores.
 */

/** Nombre legal de la empresa A: el spec lo fija así porque CA-03 comprueba el escapado. */
const A_LEGAL_NAME = 'Acme <b>& Hijos</b>'
/** Versión de la plantilla sembrada (spec §10). */
const TEMPLATE_VERSION = '2026.1'
/** Leído del spec: el texto provisional se reconoce por esta leyenda. */
const PROVISIONAL_LEGEND = 'Texto provisional'

/**
 * Fila de `telework_photo_notices` que arma la fixture: una propiedad por
 * columna de §10, con `null` donde la columna es nullable. Los nombres son los
 * del modelo (§10 y §11) y `insertNotice` traduce cada uno a su columna.
 */
interface NoticeFixtureRow {
  businessUnitId: number
  teleworkPhotoNoticeTemplateId: number | null
  teleworkPhotoNoticeVersion: number
  teleworkPhotoNoticeTitle: string
  teleworkPhotoNoticeContent: string
  teleworkPhotoNoticeRenderedContent: string | null
  teleworkPhotoNoticeStatus: 'draft' | 'published'
  teleworkPhotoNoticeIsCurrent: boolean
  teleworkPhotoNoticeContentHash: string | null
  createdByUserId: number
  updatedByUserId: number
  publishedByUserId: number | null
  publishedAt: Date | null
  teleworkPhotoNoticeCreatedAt: Date
  teleworkPhotoNoticeUpdatedAt: Date
  deletedAt: Date | null
}

interface Scenario {
  a: TenantActor // empresa A, rol propio (arranca SIN concesiones: las siembra cada caso)
  b: TenantActor // empresa B, para CA-12
  employeeAId: number // colaborador de A (dueño de los acuses de fixture)
}

/** Hooks mínimos del grupo de Japa que usa el armador de escenario. */
interface ScenarioGroup {
  setup(handler: () => Promise<void>): unknown
  teardown(handler: () => Promise<void>): unknown
  each: { setup(handler: () => Promise<void>): unknown }
}

/** Error de MySQL: lo único que el caso necesita para reconocer la causa. */
interface MysqlError {
  code?: string
  errno?: number
}

let scenario: Scenario

/**
 * Corre `accion` y devuelve el error con el que reventó.
 *
 * Por qué no `assert.rejects`: el de Japa exige una función y compara clase de
 * error o mensaje, nunca el `code`; la llave única y las FK de MySQL se
 * reconocen justo por su `code` (`ER_DUP_ENTRY`, `ER_ROW_IS_REFERENCED_*`), así
 * que el caso captura el error y afirma el código él mismo. Si la operación
 * resuelve, el caso falla aquí: una acción que debía reventar y no reventó no
 * pasa.
 */
async function captureRejection(accion: () => Promise<unknown>): Promise<MysqlError> {
  try {
    await accion()
  } catch (error) {
    return error as MysqlError
  }

  throw new Error('Se esperaba un rechazo y la operación resolvió sin error')
}

/**
 * Inserta un aviso por tabla (las escrituras de las fixtures no pasan por el
 * modelo). Los valores por defecto son los de una versión publicada y vigente
 * de §10; cada caso pisa lo que necesite con `overrides`.
 */
async function insertNotice(
  businessUnitId: number,
  actorUserId: number,
  overrides?: Partial<NoticeFixtureRow>
): Promise<number> {
  const row: NoticeFixtureRow = {
    businessUnitId,
    teleworkPhotoNoticeTemplateId: null,
    teleworkPhotoNoticeVersion: 1,
    teleworkPhotoNoticeTitle: 'Aviso de privacidad',
    teleworkPhotoNoticeContent: '<p>La empresa {{razon_social}} informa.</p>',
    teleworkPhotoNoticeRenderedContent: null,
    teleworkPhotoNoticeStatus: 'published',
    teleworkPhotoNoticeIsCurrent: true,
    teleworkPhotoNoticeContentHash: null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    publishedByUserId: null,
    publishedAt: null,
    teleworkPhotoNoticeCreatedAt: new Date(),
    teleworkPhotoNoticeUpdatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }

  const inserted = await db.table('telework_photo_notices').insert({
    business_unit_id: row.businessUnitId,
    telework_photo_notice_template_id: row.teleworkPhotoNoticeTemplateId,
    telework_photo_notice_version: row.teleworkPhotoNoticeVersion,
    telework_photo_notice_title: row.teleworkPhotoNoticeTitle,
    telework_photo_notice_content: row.teleworkPhotoNoticeContent,
    telework_photo_notice_rendered_content: row.teleworkPhotoNoticeRenderedContent,
    telework_photo_notice_status: row.teleworkPhotoNoticeStatus,
    telework_photo_notice_is_current: row.teleworkPhotoNoticeIsCurrent,
    telework_photo_notice_content_hash: row.teleworkPhotoNoticeContentHash,
    created_by_user_id: row.createdByUserId,
    updated_by_user_id: row.updatedByUserId,
    published_by_user_id: row.publishedByUserId,
    published_at: row.publishedAt,
    telework_photo_notice_created_at: row.teleworkPhotoNoticeCreatedAt,
    telework_photo_notice_updated_at: row.teleworkPhotoNoticeUpdatedAt,
    telework_photo_notice_deleted_at: row.deletedAt,
  })

  return Number(inserted[0])
}

/**
 * Inserta un colaborador de la empresa por tabla (sin los hooks de alta del
 * modelo: el spec no los necesita). Espejo de `insertEmployee` de
 * `tests/functional/telework_checklist.spec.ts`: persona, departamento y puesto
 * dentro de `TenantContext.run`, porque el mixin lo exige.
 */
async function insertEmployee(businessUnitId: number, prefix: string): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const code = `TWN-${prefix}-${stamp}`.slice(0, 40)

  return TenantContext.run([businessUnitId], async () => {
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'TeleworkPhotoNotice',
      personSecondLastname: prefix,
      personEmail: `twn-employee-${prefix}-${stamp}@gsti-tests.local`,
      businessUnitId,
    })
    const department = await createDepartmentFixture(businessUnitId, `Dept ${prefix}`)
    const position = await createPositionFixture(businessUnitId, `Pos ${prefix}`)

    const inserted = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: code,
      employee_code: code,
      employee_first_name: 'Empleado',
      employee_last_name: 'TeleworkPhotoNotice',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      payroll_business_unit_id: businessUnitId,
      department_id: department.departmentId,
      position_id: position.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Remote',
      employee_business_email: `twn-employee-${prefix}-${stamp}@gsti-tests.local`,
      employee_created_at: new Date(),
    })

    return Number(inserted[0])
  })
}

/**
 * Inserta un acuse por tabla. `business_unit_id` es SIEMPRE el de la empresa
 * (nunca el del payload del caso): es la marca que aísla el conteo por versión.
 */
async function insertAcknowledgement(
  businessUnitId: number,
  noticeId: number,
  employeeId: number,
  acknowledgedAt?: DateTime
): Promise<number> {
  const inserted = await db.table('telework_photo_notice_acknowledgements').insert({
    telework_photo_notice_id: noticeId,
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    telework_photo_notice_acknowledgement_acknowledged_at: (
      acknowledgedAt ?? DateTime.now()
    ).toJSDate(),
    telework_photo_notice_acknowledgement_created_at: new Date(),
  })

  return Number(inserted[0])
}

/**
 * Avisos VIVOS (los descartados no cuentan) de la empresa. Lectura por MODELO,
 * así que va dentro de `TenantContext.run`.
 */
async function countNotices(businessUnitId: number): Promise<number> {
  return TenantContext.run([businessUnitId], async () => {
    const filas = await TeleworkPhotoNotice.query()
      .where('business_unit_id', businessUnitId)
      .count('* as total')
    return Number(filas[0]?.$extras.total ?? 0)
  })
}

/**
 * Empresa A —con el nombre legal que CA-03 comprueba—, empresa B para CA-12 y
 * un colaborador de A, dueño de los acuses de fixture.
 */
async function createScenario(prefix: string): Promise<Scenario> {
  const a = await createTenantActor(`${prefix}-a`)
  const b = await createTenantActor(`${prefix}-b`)

  a.businessUnit.businessUnitLegalName = A_LEGAL_NAME
  await a.businessUnit.save()

  const employeeAId = await insertEmployee(a.businessUnit.businessUnitId, `${prefix}-colaborador`)

  return { a, b, employeeAId }
}

/**
 * Deja a la empresa sin avisos ni acuses. Cada caso arranca de cero: el UNIQUE
 * `(empresa, versión)` es la llave que prueban dos de los tres casos, así que un
 * aviso heredado del caso anterior los volvería un falso duplicado.
 */
async function clearNotices(businessUnitId: number): Promise<void> {
  await db
    .from('telework_photo_notice_acknowledgements')
    .where('business_unit_id', businessUnitId)
    .delete()
  await db.from('telework_photo_notices').where('business_unit_id', businessUnitId).delete()
}

/**
 * Borra lo que el escenario creó. El orden es obligatorio: los acuses
 * referencian el aviso y los avisos al usuario que los creó, ambos `RESTRICT`,
 * así que borrar los actores primero dejaría la limpieza a medias.
 */
async function cleanupScenario(target: Scenario | null): Promise<void> {
  if (!target) return

  for (const actor of [target.a, target.b]) {
    const businessUnitId = actor.businessUnit.businessUnitId

    await clearNotices(businessUnitId)

    const employees = (await db
      .from('employees')
      .where('business_unit_id', businessUnitId)
      .select('person_id')) as { person_id: number }[]
    const personIds = employees.map((row) => Number(row.person_id))

    await db.from('employees').where('business_unit_id', businessUnitId).delete()
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }

    await cleanupOrgChartFixtures(businessUnitId)
  }

  await cleanupTenantActor(target.a)
  await cleanupTenantActor(target.b)
}

function useScenario(group: ScenarioGroup, prefix: string): void {
  group.setup(async () => {
    scenario = await createScenario(prefix)
  })
  // Molde `useScenario` de `telework_checklist.spec.ts`: el caso de datos arranca
  // limpio y el escenario caro (actores + colaborador) se arma una sola vez.
  group.each.setup(async () => {
    await clearNotices(scenario.a.businessUnit.businessUnitId)
    await clearNotices(scenario.b.businessUnit.businessUnitId)
  })
  group.teardown(async () => {
    await cleanupScenario(scenario)
  })
}

test.group('avisos de fotos — esquema, semilla y acuse cifrado', (group) => {
  useScenario(group, 'esquema')

  test('Objetivo: el seeder 0067 corre dos veces y deja una sola plantilla vigente con su marcador', async ({
    assert,
  }) => {
    const correrSeeder = () => new TeleworkPhotoNoticeTemplatesSeeder(db.connection()).run()
    await correrSeeder()
    await correrSeeder()

    const plantillas = await TeleworkPhotoNoticeTemplate.query().where(
      'telework_photo_notice_template_version',
      TEMPLATE_VERSION
    )
    assert.lengthOf(plantillas, 1)
    assert.isTrue(plantillas[0].teleworkPhotoNoticeTemplateIsCurrent)
    assert.include(plantillas[0].teleworkPhotoNoticeTemplateContent, '{{razon_social}}')
    assert.include(plantillas[0].teleworkPhotoNoticeTemplateContent, PROVISIONAL_LEGEND)
  })

  test('Objetivo: dos plantillas con la misma versión no pueden coexistir', async ({ assert }) => {
    // El seeder es idempotente (caso anterior): correrlo deja exactamente la
    // fila de `2026.1` que la llave única tiene que defender, sin duplicarla.
    await new TeleworkPhotoNoticeTemplatesSeeder(db.connection()).run()

    const duplicada = await captureRejection(() =>
      db.table('telework_photo_notice_templates').insert({
        telework_photo_notice_template_version: TEMPLATE_VERSION,
        telework_photo_notice_template_title: 'Plantilla duplicada',
        telework_photo_notice_template_content: '<p>Otra copia de {{razon_social}}.</p>',
        telework_photo_notice_template_is_current: true,
        telework_photo_notice_template_created_at: new Date(),
      })
    )
    assert.equal(duplicada.code, 'ER_DUP_ENTRY')

    // El rechazo no dejó fila nueva: sigue habiendo UNA sola `2026.1` y UNA sola
    // vigente (el intento no desplazó a la plantilla sembrada).
    const plantillas = await TeleworkPhotoNoticeTemplate.query().where(
      'telework_photo_notice_template_version',
      TEMPLATE_VERSION
    )
    assert.lengthOf(plantillas, 1)
    assert.lengthOf(
      plantillas.filter((plantilla) => plantilla.teleworkPhotoNoticeTemplateIsCurrent),
      1
    )
  })

  test('Objetivo: la IP y el user-agent del acuse viajan cifrados y nunca se serializan', async ({
    assert,
  }) => {
    const businessUnitId = scenario.a.businessUnit.businessUnitId
    const noticeId = await insertNotice(businessUnitId, scenario.a.user.userId)

    const acuse = new TeleworkPhotoNoticeAcknowledgement()
    acuse.teleworkPhotoNoticeId = noticeId
    acuse.employeeId = scenario.employeeAId
    acuse.businessUnitId = businessUnitId
    acuse.teleworkPhotoNoticeAcknowledgementAcknowledgedAt = DateTime.now()
    acuse.teleworkPhotoNoticeAcknowledgementIp = '189.203.44.7'
    acuse.teleworkPhotoNoticeAcknowledgementUserAgent = 'QA-Agente/1.0'
    await acuse.save()

    const crudo = (await db
      .from('telework_photo_notice_acknowledgements')
      .where('telework_photo_notice_acknowledgement_id', acuse.teleworkPhotoNoticeAcknowledgementId)
      .select('telework_photo_notice_acknowledgement_ip', 'telework_photo_notice_acknowledgement_user_agent')
      .first()) as {
      telework_photo_notice_acknowledgement_ip: string
      telework_photo_notice_acknowledgement_user_agent: string
    }
    assert.notInclude(crudo.telework_photo_notice_acknowledgement_ip, '189.203.44.7')
    assert.notInclude(crudo.telework_photo_notice_acknowledgement_user_agent, 'QA-Agente/1.0')

    const releido = await TenantContext.run([businessUnitId], () =>
      TeleworkPhotoNoticeAcknowledgement.findOrFail(acuse.teleworkPhotoNoticeAcknowledgementId)
    )
    assert.equal(releido.teleworkPhotoNoticeAcknowledgementIp, '189.203.44.7')
    assert.equal(releido.teleworkPhotoNoticeAcknowledgementUserAgent, 'QA-Agente/1.0')
    assert.notProperty(releido.serialize(), 'teleworkPhotoNoticeAcknowledgementIp')
    assert.notProperty(releido.serialize(), 'teleworkPhotoNoticeAcknowledgementUserAgent')
  })

  test('Objetivo: una versión por empresa y un acuse no se pueden borrar aunque se intente por SQL', async ({
    assert,
  }) => {
    const businessUnitId = scenario.a.businessUnit.businessUnitId
    const noticeId = await insertNotice(businessUnitId, scenario.a.user.userId)

    const duplicado = await captureRejection(() =>
      insertNotice(businessUnitId, scenario.a.user.userId, { teleworkPhotoNoticeVersion: 1 })
    )
    assert.equal(duplicado.code, 'ER_DUP_ENTRY')

    const enB = await insertNotice(scenario.b.businessUnit.businessUnitId, scenario.b.user.userId, {
      teleworkPhotoNoticeVersion: 1,
    })
    assert.isNumber(enB)
    // Una versión por empresa: la v1 de B no invade ni cuenta para A, ni al revés.
    assert.equal(await countNotices(businessUnitId), 1)
    assert.equal(await countNotices(scenario.b.businessUnit.businessUnitId), 1)

    await insertAcknowledgement(businessUnitId, noticeId, scenario.employeeAId)
    const borradoBloqueado = await captureRejection(() =>
      db.from('telework_photo_notices').where('telework_photo_notice_id', noticeId).delete()
    )
    assert.match(borradoBloqueado.code ?? '', /^ER_ROW_IS_REFERENCED/)
  })

  test('Objetivo: el acuse es único por aviso y colaborador y un colaborador acusa varios avisos', async ({
    assert,
  }) => {
    const businessUnitId = scenario.a.businessUnit.businessUnitId
    const actorUserId = scenario.a.user.userId
    const primerAviso = await insertNotice(businessUnitId, actorUserId, {
      teleworkPhotoNoticeVersion: 1,
    })
    const segundoAviso = await insertNotice(businessUnitId, actorUserId, {
      teleworkPhotoNoticeVersion: 2,
      teleworkPhotoNoticeIsCurrent: false,
    })

    await insertAcknowledgement(businessUnitId, primerAviso, scenario.employeeAId)

    // El mismo par (aviso, colaborador) dos veces: lo rechaza la llave única
    // `uq_twpna_notice_employee` (red contra el doble-tap de acuse).
    const duplicado = await captureRejection(() =>
      insertAcknowledgement(businessUnitId, primerAviso, scenario.employeeAId)
    )
    assert.equal(duplicado.code, 'ER_DUP_ENTRY')

    // El mismo colaborador SÍ acusa otro aviso de la misma empresa: la llave es
    // del par, no del colaborador.
    const segundoAcuse = await insertAcknowledgement(
      businessUnitId,
      segundoAviso,
      scenario.employeeAId
    )
    assert.isAbove(segundoAcuse, 0)

    // Ni el rechazo ni el segundo acuse dejan más de dos filas: una por aviso.
    const acuses = (await db
      .from('telework_photo_notice_acknowledgements')
      .where('business_unit_id', businessUnitId)
      .where('employee_id', scenario.employeeAId)
      .select('telework_photo_notice_id')
      .orderBy('telework_photo_notice_id')) as { telework_photo_notice_id: number }[]
    assert.deepEqual(
      acuses.map((acuse) => Number(acuse.telework_photo_notice_id)),
      [primerAviso, segundoAviso]
    )
  })
})

// ─── Superficie HTTP del Backoffice (Tarea 4) ───────────────────────────────
//
// Los envoltorios resuelven la empresa por el header `X-Business-Unit-Id` (su
// código público, nunca el id interno) y la sesión del actor del escenario, así
// que el caso solo decide el verbo y el cuerpo. El rol del actor nace vacío: el
// caso siembra sus concesiones del módulo `telework-policy` con
// `grantModulePermissions` (el aviso reusa el permiso de la política, §8).

/** Base del aviso de privacidad de la evidencia fotográfica del puesto. */
const NOTICE_PATH = '/api/nom037/telework-photo-notice'
/** Módulo cuyo permiso gobierna la superficie del aviso (no hay módulo nuevo). */
const NOTICE_MODULE_SLUG = 'telework-policy'
/** Las cuatro acciones del módulo, que juntas pasan los siete endpoints (CA-13). */
const ALL_NOTICE_ACTIONS = ['read', 'create', 'update', 'delete'] as const

function getState(client: ApiClient, actor: TenantActor) {
  return client
    .get(NOTICE_PATH)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

function getTemplate(client: ApiClient, actor: TenantActor) {
  return client
    .get(`${NOTICE_PATH}/template`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

function createDraft(client: ApiClient, actor: TenantActor) {
  return client
    .post(`${NOTICE_PATH}/draft`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

function updateDraft(client: ApiClient, actor: TenantActor, body: { title: string; content: string }) {
  return client
    .put(`${NOTICE_PATH}/draft`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    .json(body)
}

function discardDraft(client: ApiClient, actor: TenantActor) {
  return client
    .delete(`${NOTICE_PATH}/draft`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

function publish(client: ApiClient, actor: TenantActor) {
  return client
    .post(`${NOTICE_PATH}/publish`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

function listVersions(client: ApiClient, actor: TenantActor) {
  return client
    .get(`${NOTICE_PATH}/versions`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
}

/** Reemplaza las concesiones del actor en el módulo de teletrabajo (el rol es suyo). */
async function grantNoticePermissions(
  actor: TenantActor,
  actions: readonly string[]
): Promise<void> {
  await grantModulePermissions(actor, NOTICE_MODULE_SLUG, actions)
}

/** Fila cruda del aviso: lo que quedó en BD después de cada paso del ciclo. */
interface NoticeRow {
  telework_photo_notice_id: number
  telework_photo_notice_template_id: number | null
  telework_photo_notice_version: number
  telework_photo_notice_title: string
  telework_photo_notice_content: string
  telework_photo_notice_rendered_content: string | null
  telework_photo_notice_status: string
  telework_photo_notice_is_current: number
  telework_photo_notice_content_hash: string | null
  created_by_user_id: number
  published_by_user_id: number | null
  published_at: Date | null
  telework_photo_notice_deleted_at: Date | null
}

/** Lee la fila del aviso por tabla: el caso afirma lo que el servicio escribió. */
async function findNoticeRow(noticeId: number): Promise<NoticeRow> {
  const row = (await db
    .from('telework_photo_notices')
    .where('telework_photo_notice_id', noticeId)
    .first()) as NoticeRow | undefined

  if (!row) {
    throw new Error(`Falta en BD la fila del aviso ${noticeId}`)
  }

  return row
}

/**
 * Ciclo completo de una versión: abre el borrador, lo edita y lo publica.
 * Devuelve el id de la fila y la respuesta de `publish` para que el caso afirme
 * el contrato de la capa HTTP.
 */
async function publishNoticeVersion(
  client: ApiClient,
  actor: TenantActor,
  input: { title: string; content: string }
): Promise<{ noticeId: number; published: ApiResponse }> {
  const created = await createDraft(client, actor)
  const noticeId = Number(created.body().data.teleworkPhotoNoticeId)
  await updateDraft(client, actor, input)
  const published = await publish(client, actor)

  return { noticeId, published }
}

test.group('avisos de fotos — 401 sin sesión y header de empresa ausente', (group) => {
  useScenario(group, 'http401')

  test('Objetivo: GET / sin sesión responde 401', async ({ client }) => {
    const response = await client.get(NOTICE_PATH)
    response.assertStatus(401)
  })

  test('Objetivo: GET /template sin sesión responde 401', async ({ client }) => {
    const response = await client.get(`${NOTICE_PATH}/template`)
    response.assertStatus(401)
  })

  test('Objetivo: POST /draft sin sesión responde 401', async ({ client }) => {
    const response = await client.post(`${NOTICE_PATH}/draft`)
    response.assertStatus(401)
  })

  test('Objetivo: PUT /draft sin sesión responde 401', async ({ client }) => {
    const response = await client.put(`${NOTICE_PATH}/draft`).json({})
    response.assertStatus(401)
  })

  test('Objetivo: DELETE /draft sin sesión responde 401', async ({ client }) => {
    const response = await client.delete(`${NOTICE_PATH}/draft`)
    response.assertStatus(401)
  })

  test('Objetivo: POST /publish sin sesión responde 401', async ({ client }) => {
    const response = await client.post(`${NOTICE_PATH}/publish`)
    response.assertStatus(401)
  })

  test('Objetivo: GET /versions sin sesión responde 401', async ({ client }) => {
    const response = await client.get(`${NOTICE_PATH}/versions`)
    response.assertStatus(401)
  })

  test('Objetivo: con sesión y sin X-Business-Unit-Id responde el 400 del middleware', async ({
    client,
    assert,
  }) => {
    const response = await client.post(`${NOTICE_PATH}/draft`).loginAs(scenario.a.user)

    response.assertStatus(400)
    assert.equal(response.body().key, 'BU.VAL.000')
    // El error del middleware corta antes del controller: no se creó nada.
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 0)
  })
})

test.group('avisos de fotos — CA-01 estado sin aviso', (group) => {
  useScenario(group, 'ca01')

  test('Objetivo: CA-01 — una empresa sin aviso responde estado vacío y plantilla con marcador', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ['read'])

    const state = await getState(client, scenario.a)
    state.assertStatus(200)
    assert.equal(state.body().type, 'success')
    assert.equal(state.body().title, 'Aviso de privacidad de las fotos del puesto')
    assert.equal(state.body().message, 'Estado del aviso de privacidad obtenido correctamente.')
    assert.deepEqual(state.body().data, { current: null, draft: null })

    const template = await getTemplate(client, scenario.a)
    template.assertStatus(200)
    assert.isAbove(Number(template.body().data.templateId), 0)
    assert.equal(template.body().data.version, TEMPLATE_VERSION)
    assert.include(template.body().data.content, '{{razon_social}}')
    assert.deepEqual(template.body().data.placeholders, ['razon_social'])

    // Lecturas puras: ni el estado ni la plantilla crean filas.
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 0)
  })
})

test.group('avisos de fotos — CA-02 primer borrador', (group) => {
  useScenario(group, 'ca02')

  test('Objetivo: CA-02 — el primer POST /draft crea la v1 con la copia de la plantilla', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ['read', 'create'])

    const response = await createDraft(client, scenario.a)
    response.assertStatus(201)
    assert.equal(response.body().type, 'success')
    assert.equal(response.body().message, 'Borrador del aviso de privacidad creado correctamente.')

    const data = response.body().data
    assert.equal(data.status, 'draft')
    assert.equal(data.version, 1)
    assert.isAbove(Number(data.templateId), 0)

    const template = await getTemplate(client, scenario.a)
    template.assertStatus(200)
    assert.equal(data.title, template.body().data.title)
    assert.equal(data.content, template.body().data.content)
    assert.include(data.content, '{{razon_social}}')

    const row = await findNoticeRow(Number(data.teleworkPhotoNoticeId))
    assert.equal(row.created_by_user_id, scenario.a.user.userId)
    assert.equal(Number(row.telework_photo_notice_template_id), Number(data.templateId))
    assert.equal(row.telework_photo_notice_status, 'draft')
    assert.equal(row.telework_photo_notice_version, 1)
    assert.equal(Number(row.telework_photo_notice_is_current), 0)
    assert.isNull(row.telework_photo_notice_content_hash)
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 1)
  })
})

test.group('avisos de fotos — CA-03 editar y publicar v1', (group) => {
  useScenario(group, 'ca03')

  test('Objetivo: CA-03 — editar y publicar sella el marcador escapado y su hash', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)
    const noticeId = Number(created.body().data.teleworkPhotoNoticeId)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso de privacidad v1',
      content: 'La empresa {{razon_social}} informa.',
    })
    edited.assertStatus(200)
    assert.equal(edited.body().data.status, 'draft')
    assert.include(edited.body().data.content, '{{razon_social}}')

    const published = await publish(client, scenario.a)
    published.assertStatus(200)
    assert.equal(published.body().message, 'Aviso de privacidad publicado correctamente.')

    const data = published.body().data
    assert.equal(data.status, 'published')
    assert.equal(data.version, 1)
    assert.isTrue(data.isCurrent)
    assert.equal(data.title, 'Aviso de privacidad v1')
    // El valor de la empresa viaja escapado (no inyecta HTML) y el marcador no
    // sobrevive en el texto servido.
    assert.equal(data.content, 'La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.')
    assert.notInclude(data.content, '{{')
    assert.isString(data.publishedByName)
    assert.include(data.publishedByName, 'Gate Test')
    assert.isAbove(data.publishedAt.length, 0)
    assert.equal(data.acknowledgementsCount, 0)
    assert.equal(data.publishedByUserId, scenario.a.user.userId)

    const expectedHash = createHash('sha256')
      .update(`${data.title}\n${data.content}`, 'utf8')
      .digest('hex')
    assert.equal(data.contentHash, expectedHash)

    const row = await findNoticeRow(noticeId)
    assert.equal(row.telework_photo_notice_content_hash, data.contentHash)
    assert.equal(row.telework_photo_notice_rendered_content, data.content)
    assert.include(row.telework_photo_notice_content, '{{razon_social}}')
    assert.equal(row.telework_photo_notice_status, 'published')
    assert.equal(Number(row.telework_photo_notice_is_current), 1)
    assert.equal(row.published_by_user_id, scenario.a.user.userId)
    assert.isNotNull(row.published_at)
  })
})

test.group('avisos de fotos — CA-04 segunda versión', (group) => {
  useScenario(group, 'ca04')

  test('Objetivo: CA-04 — el borrador v2 nace de la v1 y publicarlo apaga la v1 sin tocarla', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const { noticeId: v1Id, published: publishedV1 } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso v1',
      content: 'La empresa {{razon_social}} informa.',
    })
    publishedV1.assertStatus(200)
    const v1Data = publishedV1.body().data

    const v2 = await createDraft(client, scenario.a)
    v2.assertStatus(201)
    assert.equal(v2.body().data.version, 2)
    assert.equal(v2.body().data.title, 'Aviso v1')
    // Parte de la v1: el texto vuelve CON su marcador, listo para editarse.
    assert.include(v2.body().data.content, '{{razon_social}}')

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso v2',
      content: 'La empresa {{razon_social}} informa por segunda vez.',
    })
    edited.assertStatus(200)

    const publishedV2 = await publish(client, scenario.a)
    publishedV2.assertStatus(200)
    assert.equal(publishedV2.body().data.version, 2)
    assert.isTrue(publishedV2.body().data.isCurrent)
    assert.notEqual(publishedV2.body().data.contentHash, v1Data.contentHash)

    // La v1 no se editó: mismo contenido, mismo texto resuelto y mismo hash.
    const v1Row = await findNoticeRow(v1Id)
    assert.equal(v1Row.telework_photo_notice_status, 'published')
    assert.equal(v1Row.telework_photo_notice_content, 'La empresa {{razon_social}} informa.')
    assert.equal(v1Row.telework_photo_notice_rendered_content, v1Data.content)
    assert.equal(v1Row.telework_photo_notice_content_hash, v1Data.contentHash)
    assert.equal(Number(v1Row.telework_photo_notice_is_current), 0)
  })
})

test.group('avisos de fotos — CA-05 versiones con conteo', (group) => {
  useScenario(group, 'ca05')

  test('Objetivo: CA-05 — el historial baja por versión y cuenta los acuses de cada fila', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const { noticeId: v1Id, published: publishedV1 } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso v1',
      content: 'La empresa {{razon_social}} informa.',
    })
    publishedV1.assertStatus(200)
    await insertAcknowledgement(scenario.a.businessUnit.businessUnitId, v1Id, scenario.employeeAId)

    const { published: publishedV2 } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso v2',
      content: 'La empresa {{razon_social}} informa de nuevo.',
    })
    publishedV2.assertStatus(200)

    // Un borrador VIVO de la empresa (la versión siguiente, todavía sin
    // publicar): el invariante que CA-05 exige y ningún caso ejercitaba —un
    // borrador vivo NO es versión, así que la lista no debe traerlo.
    const draftId = await insertNotice(
      scenario.a.businessUnit.businessUnitId,
      scenario.a.user.userId,
      {
        teleworkPhotoNoticeVersion: 3,
        teleworkPhotoNoticeStatus: 'draft',
        teleworkPhotoNoticeIsCurrent: false,
      }
    )

    const versions = await listVersions(client, scenario.a)
    versions.assertStatus(200)
    const listed = versions.body().data as {
      status: string
      teleworkPhotoNoticeId: number
      version: number
      acknowledgementsCount: number
    }[]
    // Solo las publicadas: las dos, descendentes, con su conteo.
    assert.lengthOf(listed, 2)
    assert.deepEqual(
      listed.map((row) => row.version),
      [2, 1]
    )
    assert.deepEqual(
      listed.map((row) => row.status),
      ['published', 'published']
    )
    // Y el borrador vivo no está en la lista, aunque su fila exista.
    assert.notInclude(
      listed.map((row) => row.teleworkPhotoNoticeId),
      draftId
    )
    assert.equal(listed[0].acknowledgementsCount, 0)
    assert.equal(listed[1].acknowledgementsCount, 1)

    // El borrador de fixture se limpia al terminar el caso.
    await db.from('telework_photo_notices').where('telework_photo_notice_id', draftId).delete()
  })
})

test.group('avisos de fotos — CA-06 marcador fuera de la lista', (group) => {
  useScenario(group, 'ca06')

  test('Objetivo: CA-06 — publicar con un marcador desconocido responde 422 con los nombres sobrantes', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)
    const noticeId = Number(created.body().data.teleworkPhotoNoticeId)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso con marcador ajeno',
      content: 'La empresa {{domicilio}} informa a {{ correo }}.',
    })
    edited.assertStatus(200)

    const rejected = await publish(client, scenario.a)
    rejected.assertStatus(422)
    assert.deepEqual(rejected.body(), {
      type: 'error',
      title: 'Marcador no reconocido',
      detail:
        'El texto usa marcadores que no existen: {{domicilio}}, {{correo}}. Permitidos: {{razon_social}}.',
      key: 'marcador-no-reconocido',
      code: 'TWN.VAL.002',
      data: { placeholders: ['domicilio', 'correo'] },
    })

    // Nada se escribió: la fila sigue siendo el borrador y nadie quedó vigente.
    const row = await findNoticeRow(noticeId)
    assert.equal(row.telework_photo_notice_status, 'draft')
    assert.equal(Number(row.telework_photo_notice_is_current), 0)
    assert.isNull(row.telework_photo_notice_content_hash)
    assert.isNull(row.telework_photo_notice_rendered_content)

    const currentRows = (await db
      .from('telework_photo_notices')
      .where('business_unit_id', scenario.a.businessUnit.businessUnitId)
      .where('telework_photo_notice_is_current', true)
      .select('telework_photo_notice_id')) as { telework_photo_notice_id: number }[]
    assert.lengthOf(currentRows, 0)
  })
})

test.group('avisos de fotos — CA-07 contenido vacío tras sanear', (group) => {
  useScenario(group, 'ca07')

  test('Objetivo: CA-07 — un texto que queda vacío al sanear no se publica', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)
    const noticeId = Number(created.body().data.teleworkPhotoNoticeId)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso sin texto',
      content: '<script>alert(1)</script>',
    })
    edited.assertStatus(200)
    assert.equal(edited.body().data.content, '')

    const rejected = await publish(client, scenario.a)
    rejected.assertStatus(422)
    assert.equal(rejected.body().title, 'Contenido vacío')
    assert.equal(rejected.body().key, 'contenido-vacio')
    assert.equal(rejected.body().code, 'TWN.VAL.003')
    // Sin `details` accionables, el sobre de error no lleva `data`.
    assert.notProperty(rejected.body(), 'data')

    const row = await findNoticeRow(noticeId)
    assert.equal(row.telework_photo_notice_status, 'draft')
    assert.isNull(row.telework_photo_notice_content_hash)
  })
})

test.group('avisos de fotos — CA-08 saneado al guardar y al servir', (group) => {
  useScenario(group, 'ca08')

  test('Objetivo: CA-08 — el marcado peligroso se cae al guardar y al servir', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)
    const noticeId = Number(created.body().data.teleworkPhotoNoticeId)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso saneado',
      content: '<p onclick="x()">Hola</p><iframe src="//e"></iframe>',
    })
    edited.assertStatus(200)
    assert.equal(edited.body().data.content, '<p>Hola</p>')

    const row = await findNoticeRow(noticeId)
    assert.equal(row.telework_photo_notice_content, '<p>Hola</p>')

    const state = await getState(client, scenario.a)
    state.assertStatus(200)
    assert.equal(state.body().data.draft.content, '<p>Hola</p>')

    // Fila alterada por SQL, sin pasar por el servicio: se sirve saneada.
    await db
      .from('telework_photo_notices')
      .where('telework_photo_notice_id', noticeId)
      .update({ telework_photo_notice_content: '<p>Hola</p><script>alert(1)</script>' })

    const served = await getState(client, scenario.a)
    served.assertStatus(200)
    assert.equal(served.body().data.draft.content, '<p>Hola</p>')
    assert.notInclude(served.body().data.draft.content, '<script>')
  })
})

test.group('avisos de fotos — Review Focus 2 saneado de la versión servida', (group) => {
  useScenario(group, 'rf2')

  test('Objetivo: Review Focus 2 — el `rendered_content` alterado por SQL se sirve saneado', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const { noticeId, published } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso publicado',
      content: 'La empresa {{razon_social}} informa.',
    })
    published.assertStatus(200)

    await db
      .from('telework_photo_notices')
      .where('telework_photo_notice_id', noticeId)
      .update({
        telework_photo_notice_rendered_content: '<p>Hola</p><script>alert(1)</script>',
      })

    const state = await getState(client, scenario.a)
    state.assertStatus(200)
    assert.equal(state.body().data.current.content, '<p>Hola</p>')
    assert.notInclude(state.body().data.current.content, '<script>')

    const versions = await listVersions(client, scenario.a)
    versions.assertStatus(200)
    const listed = versions.body().data as { content: string }[]
    assert.lengthOf(listed, 1)
    assert.equal(listed[0].content, '<p>Hola</p>')
    assert.notInclude(listed[0].content, '<script>')
  })
})

test.group('avisos de fotos — CA-09 un solo borrador', (group) => {
  useScenario(group, 'ca09')

  test('Objetivo: CA-09 — la carrera de dos POST /draft deja 201, 409 y un solo borrador', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ['read', 'create'])

    // Sin borradores previos: el 409 (si sale) es por la carrera, no por herencia.
    await clearNotices(scenario.a.businessUnit.businessUnitId)

    const responses = await Promise.all([
      createDraft(client, scenario.a),
      createDraft(client, scenario.a),
    ])
    assert.deepEqual(
      responses.map((response) => response.status()).sort((left, right) => left - right),
      [201, 409]
    )

    const conflict = responses.find((response) => response.status() === 409)
    assert.equal(conflict?.body().key, 'borrador-ya-existe')
    assert.equal(conflict?.body().code, 'TWN.CONF.001')

    // El UNIQUE traducido: nunca 500 y nunca dos borradores vivos.
    assert.equal(
      responses.filter((response) => response.status() >= 500).length,
      0,
      'la carrera no debe reventar en 500'
    )
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 1)
  })
})

test.group('avisos de fotos — CA-10 descartar', (group) => {
  useScenario(group, 'ca10')

  test('Objetivo: CA-10 — descartar deja la v1 vigente y la siguiente versión es la 3', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const { noticeId: v1Id, published } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso vigente',
      content: 'La empresa {{razon_social}} informa.',
    })
    published.assertStatus(200)

    const v2 = await createDraft(client, scenario.a)
    v2.assertStatus(201)
    assert.equal(v2.body().data.version, 2)
    const v2Id = Number(v2.body().data.teleworkPhotoNoticeId)

    const discarded = await discardDraft(client, scenario.a)
    discarded.assertStatus(200)
    assert.equal(discarded.body().message, 'Borrador del aviso de privacidad descartado correctamente.')
    assert.isNull(discarded.body().data)

    // Soft delete: la fila sigue, marcada; la v1 sigue vigente.
    const v2Row = await findNoticeRow(v2Id)
    assert.isNotNull(v2Row.telework_photo_notice_deleted_at)
    const v1Row = await findNoticeRow(v1Id)
    assert.equal(Number(v1Row.telework_photo_notice_is_current), 1)

    // Sin borrador vivo: las tres escrituras responden el mismo 404 accionable.
    const withoutDraft = [
      await updateDraft(client, scenario.a, { title: 'Aviso', content: 'Texto.' }),
      await discardDraft(client, scenario.a),
      await publish(client, scenario.a),
    ]
    for (const response of withoutDraft) {
      response.assertStatus(404)
      assert.equal(response.body().key, 'borrador-no-encontrado')
      assert.equal(response.body().code, 'TWN.NF.002')
    }

    const next = await createDraft(client, scenario.a)
    next.assertStatus(201)
    assert.equal(next.body().data.version, 3)
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 2)
  })
})

test.group('avisos de fotos — Review Focus 5 el borrador descartado no reaparece', (group) => {
  useScenario(group, 'rf5')

  test('Objetivo: Review Focus 5 — tras descartar, el estado no expone borrador y el historial no lista la fila', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const { published } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso vigente',
      content: 'La empresa {{razon_social}} informa.',
    })
    published.assertStatus(200)

    const v2 = await createDraft(client, scenario.a)
    v2.assertStatus(201)
    const v2Id = Number(v2.body().data.teleworkPhotoNoticeId)
    const v2RowBeforeDiscard = await findNoticeRow(v2Id)
    assert.equal(Number(v2RowBeforeDiscard.telework_photo_notice_is_current), 0)

    const discarded = await discardDraft(client, scenario.a)
    discarded.assertStatus(200)

    const state = await getState(client, scenario.a)
    state.assertStatus(200)
    assert.isNull(state.body().data.draft)
    assert.equal(state.body().data.current.version, 1)
    assert.isTrue(state.body().data.current.isCurrent)

    const versions = await listVersions(client, scenario.a)
    versions.assertStatus(200)
    const listed = versions.body().data as { version: number; teleworkPhotoNoticeId: number }[]
    assert.lengthOf(listed, 1)
    assert.equal(listed[0].version, 1)
    assert.notInclude(
      listed.map((row) => row.teleworkPhotoNoticeId),
      v2Id
    )
  })
})

test.group('avisos de fotos — CA-11 sin plantilla', (group) => {
  useScenario(group, 'ca11')

  test('Objetivo: CA-11 — sin plantilla vigente, la plantilla y el primer borrador responden 404', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    // La plantilla es de plataforma y la comparten todos los grupos: se apaga
    // dentro del caso y se restaura en su `finally` para no romper los demás.
    const currentTemplates = (await db
      .from('telework_photo_notice_templates')
      .where('telework_photo_notice_template_is_current', true)
      .select('telework_photo_notice_template_id')) as {
      telework_photo_notice_template_id: number
    }[]

    try {
      await db
        .from('telework_photo_notice_templates')
        .update({ telework_photo_notice_template_is_current: false })

      const template = await getTemplate(client, scenario.a)
      template.assertStatus(404)
      assert.equal(template.body().key, 'plantilla-no-encontrada')
      assert.equal(template.body().code, 'TWN.NF.004')

      const draft = await createDraft(client, scenario.a)
      draft.assertStatus(404)
      assert.equal(draft.body().key, 'plantilla-no-encontrada')
      assert.equal(draft.body().code, 'TWN.NF.004')

      assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 0)
    } finally {
      if (currentTemplates.length > 0) {
        await db
          .from('telework_photo_notice_templates')
          .whereIn(
            'telework_photo_notice_template_id',
            currentTemplates.map((row) => Number(row.telework_photo_notice_template_id))
          )
          .update({ telework_photo_notice_template_is_current: true })
      }
    }
  })
})

test.group('avisos de fotos — CA-12 aislamiento entre empresas', (group) => {
  useScenario(group, 'ca12')

  test('Objetivo: CA-12 — la empresa B ve su propio estado vacío y no alcanza nada de A', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)
    await grantNoticePermissions(scenario.b, ALL_NOTICE_ACTIONS)

    // A publica de verdad: su vigente no debe asomar en B.
    const { noticeId: aNoticeId, published } = await publishNoticeVersion(client, scenario.a, {
      title: 'Aviso de A',
      content: 'La empresa {{razon_social}} informa.',
    })
    published.assertStatus(200)

    const stateB = await getState(client, scenario.b)
    stateB.assertStatus(200)
    assert.deepEqual(stateB.body().data, { current: null, draft: null })

    const versionsB = await listVersions(client, scenario.b)
    versionsB.assertStatus(200)
    assert.deepEqual(versionsB.body().data, [])

    // Lo de otra empresa responde igual que lo inexistente (CA-12).
    const writes = [
      await updateDraft(client, scenario.b, { title: 'Aviso ajeno', content: 'Texto ajeno.' }),
      await discardDraft(client, scenario.b),
      await publish(client, scenario.b),
    ]
    for (const response of writes) {
      response.assertStatus(404)
      assert.equal(response.body().key, 'borrador-no-encontrado')
      assert.equal(response.body().code, 'TWN.NF.002')
    }

    // Las filas de A siguen igual: su versión, su hash y su vigencia.
    const aRow = await findNoticeRow(aNoticeId)
    assert.equal(aRow.telework_photo_notice_status, 'published')
    assert.equal(Number(aRow.telework_photo_notice_is_current), 1)
    assert.equal(aRow.telework_photo_notice_content_hash, published.body().data.contentHash)
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 1)
    assert.equal(await countNotices(scenario.b.businessUnit.businessUnitId), 0)
  })
})

test.group('avisos de fotos — CA-13 permisos', (group) => {
  useScenario(group, 'ca13')

  // Los tres casos comparten el rol del escenario y prueban juegos de permisos
  // distintos, así que el grupo lo vacía antes de cada uno: cada caso siembra
  // el suyo y ninguno hereda el que dejó el anterior. El rol es del escenario
  // y `useScenario` lo borra con él al terminar, así que sus concesiones
  // tampoco alcanzan a los grupos siguientes.
  group.each.setup(async () => {
    await grantNoticePermissions(scenario.a, [])
  })

  test('Objetivo: CA-13 — con `read` pasan los tres GET y las cuatro escrituras responden 403 sin `detail`', async ({
    client,
    assert,
  }) => {
    // Concesiones propias del caso: solo `read`, así que las escrituras caen.
    await grantNoticePermissions(scenario.a, ['read'])

    const reads = [
      await getState(client, scenario.a),
      await getTemplate(client, scenario.a),
      await listVersions(client, scenario.a),
    ]
    for (const response of reads) {
      response.assertStatus(200)
    }

    const writes = [
      await createDraft(client, scenario.a),
      await updateDraft(client, scenario.a, { title: 'Aviso ajeno', content: 'Texto ajeno.' }),
      await discardDraft(client, scenario.a),
      await publish(client, scenario.a),
    ]
    for (const response of writes) {
      response.assertStatus(403)
      assert.equal(response.body().type, 'error')
      assert.equal(response.body().key, 'sin-permiso')
      assert.equal(response.body().errorCode, 'TWN.AUTH.001')
      assert.equal(response.body().data, null)
      // El 403 lo escribe el helper RBAC: sin `detail`.
      assert.notProperty(response.body(), 'detail')
    }

    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 0)
  })

  test('Objetivo: CA-13 — con las cuatro acciones el actor pasa las cuatro escrituras', async ({
    client,
    assert,
  }) => {
    // Concesiones propias del caso: las cuatro acciones, sin depender del
    // `gestion` del caso siguiente.
    await grantNoticePermissions(scenario.a, ALL_NOTICE_ACTIONS)

    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso editable',
      content: 'La empresa {{razon_social}} informa.',
    })
    edited.assertStatus(200)

    const discarded = await discardDraft(client, scenario.a)
    discarded.assertStatus(200)

    // Ya sin borrador, publicar responde el 404 del dominio (cruzó el permiso).
    const published = await publish(client, scenario.a)
    published.assertStatus(404)
    assert.equal(published.body().key, 'borrador-no-encontrado')
  })

  test('Objetivo: CA-13 — un rol con `gestion` pasa los siete endpoints', async ({
    client,
    assert,
  }) => {
    // Concesiones propias del caso: solo el atajo `gestion`, ninguna acción
    // granular, así que cada status exacto de abajo es evidencia de que el
    // atajo alcanza por sí solo los siete endpoints (§6).
    await grantNoticePermissions(scenario.a, ['gestion'])

    // Lecturas: los tres GET en 200.
    const state = await getState(client, scenario.a)
    state.assertStatus(200)

    const template = await getTemplate(client, scenario.a)
    template.assertStatus(200)

    const versions = await listVersions(client, scenario.a)
    versions.assertStatus(200)

    // Escrituras: 201 al abrir el borrador y 200 al editarlo y publicarlo.
    const created = await createDraft(client, scenario.a)
    created.assertStatus(201)

    const edited = await updateDraft(client, scenario.a, {
      title: 'Aviso editable',
      content: 'La empresa {{razon_social}} informa.',
    })
    edited.assertStatus(200)

    const published = await publish(client, scenario.a)
    published.assertStatus(200)

    // Publicar consumió el borrador y descartar exige uno vivo, así que el caso
    // abre el siguiente —la versión 2, la que no reutiliza la publicada— y lo
    // descarta.
    const nextDraft = await createDraft(client, scenario.a)
    nextDraft.assertStatus(201)
    assert.equal(nextDraft.body().data.version, 2)

    const discarded = await discardDraft(client, scenario.a)
    discarded.assertStatus(200)

    // Sin residuos dentro del grupo: las filas del caso —la versión publicada y
    // su borrador descartado— salen antes del teardown.
    await clearNotices(scenario.a.businessUnit.businessUnitId)
  })
})

test.group('avisos de fotos — CA-14 validación de entrada', (group) => {
  useScenario(group, 'ca14')

  test('Objetivo: CA-14 — título corto y contenido excesivo responden el 422 de Vine', async ({
    client,
    assert,
  }) => {
    await grantNoticePermissions(scenario.a, ['read', 'update'])

    const shortTitle = await updateDraft(client, scenario.a, {
      title: 'ab',
      content: 'Texto válido.',
    })
    shortTitle.assertStatus(422)
    assert.equal(shortTitle.body().type, 'error')
    assert.equal(shortTitle.body().key, 'entrada-invalida')
    assert.equal(shortTitle.body().code, 'TWN.VAL.001')
    assert.isAbove(shortTitle.body().data.errors.length, 0)

    const longContent = await updateDraft(client, scenario.a, {
      title: 'Aviso válido',
      content: 'x'.repeat(100_001),
    })
    longContent.assertStatus(422)
    assert.equal(longContent.body().key, 'entrada-invalida')
    assert.equal(longContent.body().code, 'TWN.VAL.001')
    assert.isAbove(longContent.body().data.errors.length, 0)

    // La forma se valida antes de tocar nada: ninguna fila nació.
    assert.equal(await countNotices(scenario.a.businessUnit.businessUnitId), 0)
  })
})
