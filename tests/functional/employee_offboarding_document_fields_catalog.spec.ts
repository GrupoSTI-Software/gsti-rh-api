import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Person from '#models/person'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '#modules/employee-offboarding/concepts/concepts.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import {
  OFFBOARDING_DOCUMENT_FIELDS,
  type OffboardingDocumentField,
} from '#modules/employee-offboarding/documents/document_fields.constants'

/**
 * USRH1788579938623 — catálogo de campos combinables del documento de salida
 * (CA-1 a CA-5 del spec más la regresión del DoD sobre `/:documentType/versions`).
 *
 * El catálogo es una constante en memoria: la consulta no toca la base. Las
 * fixtures (empresa, roles y usuarios) se destruyen en `group.teardown`.
 */

const TEST_PASSWORD = 'DocumentFieldsCatalog123!'
const FIELDS_PATH = '/api/employee-offboarding-document-templates/fields'

/** Prefijo ÚNICO de las fixtures de este spec (slug de empresa y de rol). */
const FIXTURE_SLUG_PREFIX = 'catalogo-campos-'

/** Tabla de `User.accessTokens`: `loginAs` deja tokens que hay que retirar antes del usuario. */
const ACCESS_TOKENS_TABLE = 'api_tokens'

/** Orden literal del catálogo (regla 6): empresa → colaborador → sistema. */
const EXPECTED_KEYS_IN_ORDER = [
  'legal_name',
  'trade_name',
  'employee_name',
  'position_name',
  'department_or_unit',
  'hire_date',
  'separation_date',
  'seniority',
  'folio',
  'issue_date',
]

/** Los seis obligatorios en la plantilla (regla 4). */
const EXPECTED_REQUIRED_KEYS = [
  'legal_name',
  'employee_name',
  'position_name',
  'hire_date',
  'separation_date',
  'folio',
]

/** Los que provee el sistema: sin pantalla de captura. */
const SYSTEM_PROVIDED_KEYS = ['seniority', 'folio', 'issue_date']

/** Cinco propiedades por elemento, ni una más (nunca labelKey, captureTabLabelKey ni source). */
const EXPECTED_DTO_KEYS = ['key', 'label', 'requiredInTemplate', 'documentTypes', 'captureTabLabel']

/** Datos prohibidos en el catálogo (regla 5), sin distinguir mayúsculas. */
const FORBIDDEN_TOKENS = [
  'rfc',
  'curp',
  'nss',
  'imss',
  'salary',
  'salario',
  'sueldo',
  'wage',
  'net_pay',
  'daily_salary',
]

const created = {
  businessUnitIds: [] as number[],
  roleIds: [] as number[],
}

interface FieldDto {
  key: string
  label: string
  requiredInTemplate: boolean
  documentTypes: string[]
  captureTabLabel: string | null
}

interface FieldsBody {
  message: string
  data: { employeeOffboardingDocumentFields: FieldDto[] }
}

interface ErrorBody {
  title: string
  detail: string
  key: string
  code: string
  data?: unknown
}

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Catálogo campos ${prefix} ${stamp}`,
    businessUnitSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    businessUnitLegalName: `Catálogo campos ${prefix} Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Permisos del módulo de salidas por slug; el gate es fail-closed si faltan. */
async function findPermissions(actions: readonly string[]): Promise<SystemPermission[]> {
  if (actions.length === 0) return []
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', EMPLOYEE_OFFBOARDINGS_MODULE_SLUG)
    .first()
  if (!systemModule) {
    throw new Error(
      `Se requiere el módulo "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD (seeder 0055) para este test.`
    )
  }
  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', systemModule.systemModuleId)
    .whereIn('system_permission_slug', [...actions])
  if (permissions.length !== actions.length) {
    throw new Error(
      `Faltan permisos ${actions.join('/')} de "${EMPLOYEE_OFFBOARDINGS_MODULE_SLUG}" en BD.`
    )
  }
  return permissions
}

async function createRole(
  prefix: string,
  businessUnit: BusinessUnit,
  actions: readonly string[]
): Promise<Role> {
  const stamp = uniqueStamp()
  const role = await Role.create({
    roleName: `Catálogo campos ${prefix} ${stamp}`,
    roleSlug: `${FIXTURE_SLUG_PREFIX}${prefix}-${stamp}`,
    roleDescription: 'Rol temporal del spec del catálogo de campos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  created.roleIds.push(role.roleId)
  for (const permission of await findPermissions(actions)) {
    const grant = new RoleSystemPermission()
    grant.roleId = role.roleId
    grant.systemPermissionId = permission.systemPermissionId
    await grant.save()
  }
  return role
}

async function createUser(prefix: string, role: Role, businessUnit: BusinessUnit): Promise<User> {
  const stamp = uniqueStamp()
  const email = `${prefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Catalogo',
    personLastname: 'Campos',
    personSecondLastname: prefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return user
}

/** Destruye en orden inverso de FK lo que cuelga de las empresas y roles dados. */
async function destroyFixtures(businessUnitIds: number[], roleIds: number[]): Promise<void> {
  if (roleIds.length > 0) {
    const users = await db
      .from(User.table)
      .select('user_id', 'person_id')
      .whereIn('role_id', roleIds)
    if (users.length > 0) {
      const userIds = users.map((row) => Number(row.user_id))
      await db.from(BusinessUnitUser.table).whereIn('user_id', userIds).delete()
      await db.from(ACCESS_TOKENS_TABLE).whereIn('tokenable_id', userIds).delete()
      await db.from(User.table).whereIn('user_id', userIds).delete()
      await db
        .from(Person.table)
        .whereIn(
          'person_id',
          users.map((row) => Number(row.person_id))
        )
        .delete()
    }
    await db.from(RoleSystemPermission.table).whereIn('role_id', roleIds).delete()
    await db.from(Role.table).whereIn('role_id', roleIds).delete()
  }
  if (businessUnitIds.length > 0) {
    await db.from(BusinessUnit.table).whereIn('business_unit_id', businessUnitIds).delete()
  }
}

async function purgeStaleFixtures(): Promise<void> {
  const staleUnits = await db
    .from(BusinessUnit.table)
    .select('business_unit_id')
    .where('business_unit_slug', 'like', `${FIXTURE_SLUG_PREFIX}%`)
  const staleRoles = await db
    .from(Role.table)
    .select('role_id')
    .where('role_slug', 'like', `${FIXTURE_SLUG_PREFIX}%`)
  await destroyFixtures(
    staleUnits.map((row) => Number(row.business_unit_id)),
    staleRoles.map((row) => Number(row.role_id))
  )
}

/** Diccionario plano de un archivo de `resources/langs`. */
async function loadLang(locale: 'es' | 'en'): Promise<Record<string, unknown>> {
  const raw = await readFile(app.makePath('resources', 'langs', `${locale}.json`), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

function fieldsOf(body: FieldsBody): FieldDto[] {
  return body.data.employeeOffboardingDocumentFields
}

test.group('Catálogo de campos combinables (USRH1788579938623)', (group) => {
  let businessUnit: BusinessUnit
  let reader: User
  let noAccessUser: User

  group.setup(async () => {
    await purgeStaleFixtures()
    businessUnit = await createBusinessUnit('propia')
    const readerRole = await createRole('lector', businessUnit, ['read'])
    const noAccessRole = await createRole('sin-permiso', businessUnit, [])
    reader = await createUser('lector', readerRole, businessUnit)
    noAccessUser = await createUser('sin-permiso', noAccessRole, businessUnit)
  })

  group.teardown(async () => {
    await destroyFixtures(created.businessUnitIds, created.roleIds)
  })

  test('CA-1: el catálogo completo, en orden, con sus seis obligatorios y sin campos internos', async ({
    client,
    assert,
  }) => {
    const first = await client
      .get(FIELDS_PATH)
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    first.assertStatus(200)
    const fields = fieldsOf(first.body() as FieldsBody)

    assert.lengthOf(fields, 10)
    assert.deepEqual(
      fields.map((field) => field.key),
      EXPECTED_KEYS_IN_ORDER
    )
    assert.sameMembers(
      fields.filter((field) => field.requiredInTemplate).map((field) => field.key),
      EXPECTED_REQUIRED_KEYS
    )
    for (const field of fields) {
      assert.sameMembers(Object.keys(field), EXPECTED_DTO_KEYS)
      assert.deepEqual(field.documentTypes, [EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER])
      if (SYSTEM_PROVIDED_KEYS.includes(field.key)) {
        assert.isNull(field.captureTabLabel)
      } else {
        assert.isString(field.captureTabLabel)
        assert.isNotEmpty(field.captureTabLabel)
      }
    }

    // Dos consultas seguidas devuelven exactamente lo mismo (regla 6)
    const second = await client
      .get(FIELDS_PATH)
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    second.assertStatus(200)
    assert.strictEqual(JSON.stringify(second.body()), JSON.stringify(first.body()))
  })

  test('CA-2: acotado por tipo devuelve los mismos diez; un tipo fuera del enum responde 400', async ({
    client,
    assert,
  }) => {
    const scoped = await client
      .get(FIELDS_PATH)
      .qs({ documentType: EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    scoped.assertStatus(200)
    assert.deepEqual(
      fieldsOf(scoped.body() as FieldsBody).map((field) => field.key),
      EXPECTED_KEYS_IN_ORDER
    )

    // Tipo que todavía no existe en la unión (llega con ESB-05-07-04)
    const unknown = await client
      .get(FIELDS_PATH)
      .qs({ documentType: 'termination_agreement' })
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    unknown.assertStatus(400)
    const body = unknown.body() as ErrorBody
    assert.strictEqual(body.title, 'Datos inválidos')
    assert.isString(body.detail)
    assert.isNotEmpty(body.detail)
    assert.strictEqual(body.key, 'datos-invalidos')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.VAL_INPUT')
  })

  test('CA-3: etiquetas en el idioma de la petición; las claves de hueco nunca se traducen', async ({
    client,
    assert,
  }) => {
    const spanish = await client
      .get(FIELDS_PATH)
      .header('Accept-Language', 'es')
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    spanish.assertStatus(200)
    const english = await client
      .get(FIELDS_PATH)
      .header('Accept-Language', 'en')
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    english.assertStatus(200)

    const es = fieldsOf(spanish.body() as FieldsBody)
    const en = fieldsOf(english.body() as FieldsBody)
    const byKey = (fields: FieldDto[], key: string) => fields.find((field) => field.key === key)!

    assert.strictEqual(byKey(es, 'legal_name').label, 'Razón social de la empresa')
    assert.strictEqual(byKey(es, 'legal_name').captureTabLabel, 'Configuraciones del sistema')
    assert.strictEqual(byKey(es, 'position_name').label, 'Puesto')
    assert.strictEqual(
      byKey(es, 'position_name').captureTabLabel,
      'Pestaña Trabajo de la ficha del colaborador'
    )
    assert.strictEqual(byKey(en, 'legal_name').label, 'Company legal name')
    assert.strictEqual(byKey(en, 'legal_name').captureTabLabel, 'System settings')
    assert.strictEqual(byKey(en, 'position_name').label, 'Position')
    assert.strictEqual(
      byKey(en, 'position_name').captureTabLabel,
      'Work tab of the employee record'
    )

    assert.deepEqual(
      en.map((field) => field.key),
      es.map((field) => field.key)
    )
    for (const field of [...es, ...en]) {
      assert.isNotEmpty(field.label)
      // Una etiqueta igual a su clave i18n delata una traducción ausente
      assert.notMatch(field.label, /^employee_offboarding_document_field_/)
      if (field.captureTabLabel !== null) {
        assert.notMatch(field.captureTabLabel, /^employee_offboarding_document_field_/)
      }
    }
  })

  test('CA-4: sin permiso read no hay catálogo (403 antes de construir nada)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(FIELDS_PATH)
      .loginAs(noAccessUser)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    response.assertStatus(403)
    const body = response.body() as ErrorBody
    assert.strictEqual(body.title, 'Sin permiso')
    assert.isString(body.detail)
    assert.strictEqual(body.key, 'sin-permiso')
    assert.strictEqual(body.code, 'OFFB.TEMPLATE.FORBIDDEN')
    assert.notProperty(body, 'data')
    assert.notInclude(JSON.stringify(body), 'legal_name')
  })

  test('CA-5: candado ejecutable — sin datos prohibidos y con etiquetas en los dos idiomas', async ({
    assert,
  }) => {
    const es = await loadLang('es')
    const en = await loadLang('en')
    const forbidden = new RegExp(FORBIDDEN_TOKENS.join('|'), 'i')
    // Vista por la interfaz: la tupla `as const` fija literales y estorba a los predicados
    const catalog: readonly OffboardingDocumentField[] = OFFBOARDING_DOCUMENT_FIELDS

    for (const field of catalog) {
      // Regla 5: ni el nombre del hueco ni su origen nombran un dato prohibido
      assert.notMatch(field.key, forbidden, `key prohibido: ${field.key}`)
      assert.notMatch(field.source, forbidden, `source prohibido en ${field.key}`)

      // Regla 8: etiqueta y pantalla de captura existen y no están vacías en es Y en en
      const keysToCover = [field.labelKey, field.captureTabLabelKey].filter(
        (key): key is string => key !== null
      )
      for (const i18nKey of keysToCover) {
        for (const [locale, dictionary] of [
          ['es', es],
          ['en', en],
        ] as const) {
          const value = dictionary[i18nKey]
          assert.isString(value, `${i18nKey} falta en ${locale}.json`)
          assert.isNotEmpty((value as string).trim(), `${i18nKey} vacía en ${locale}.json`)
        }
      }
    }
  })

  test('DoD: declarar /fields antes de las paramétricas no mata /:documentType/versions', async ({
    client,
    assert,
  }) => {
    const versions = await client
      .get(
        `/api/employee-offboarding-document-templates/${EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER}/versions`
      )
      .loginAs(reader)
      .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    versions.assertStatus(200)
    assert.property(versions.body().data, 'employeeOffboardingDocumentTemplateVersions')
  })
})
