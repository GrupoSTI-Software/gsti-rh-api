import { test } from '@japa/runner'
import { DateTime } from 'luxon'
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
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  createDepartmentFixture,
  createPositionFixture,
  cleanupOrgChartFixtures,
} from '#tests/helpers/org_chart_fixtures'

// `grantModulePermissions` (y los envoltorios HTTP por endpoint) entran con los
// grupos de las Tareas 2-4: el proyecto compila con `noUnusedLocals`, así que un
// import que todavía nadie usa rompe `tsc --noEmit`.

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
 *    el caso de 403 vea el rol vacío).
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
})
