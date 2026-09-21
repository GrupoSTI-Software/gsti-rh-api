import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1789698261609 — marca de empresa dueña del expediente personal.
 *
 * Automatiza lo que el DoD pide a mano y ningún otro test detecta (D7):
 * cero `includeGlobal` en `Person`, hook tolerante sin `throw`, columna que
 * no se serializa, migración con FK RESTRICT y prefijo de 13 dígitos.
 */

const ROOT = process.cwd()
const MIGRATIONS_DIR = join(ROOT, 'database/migrations')
const MIGRATION_SLUG = 'add_business_unit_id_to_people_table'
const MODEL_FILE = join(ROOT, 'app/models/person.ts')
/** Última migración del repo al escribir la HU: la nueva debe ordenar después. */
const PREVIOUS_LAST_PREFIX = '1789700400000'

function readMigration(): { name: string; content: string } {
  const name = readdirSync(MIGRATIONS_DIR).find((file) => file.includes(MIGRATION_SLUG))
  if (!name) {
    throw new Error(`No existe la migración *_${MIGRATION_SLUG}.ts`)
  }
  return { name, content: readFileSync(join(MIGRATIONS_DIR, name), 'utf-8') }
}

test.group('people.business_unit_id — migración (CA-7)', () => {
  test('existe, con prefijo de 13 dígitos posterior a la última del repo', ({ assert }) => {
    const { name } = readMigration()
    const prefix = name.slice(0, 13)
    assert.match(name, /^[0-9]{13}_add_business_unit_id_to_people_table\.ts$/)
    assert.isTrue(prefix > PREVIOUS_LAST_PREFIX, `${prefix} debe ordenar después de ${PREVIOUS_LAST_PREFIX}`)
  })

  test('columna nullable tras person_id, índice y FK con nombre, sin onDelete', ({ assert }) => {
    const { content } = readMigration()
    const upBody = content.slice(content.indexOf('async up()'), content.indexOf('async down()'))
    assert.include(upBody, "table.integer('business_unit_id').unsigned().nullable().after('person_id')")
    assert.include(upBody, "table.index(['business_unit_id'], 'people_business_unit_id_index')")
    assert.include(upBody, ".foreign('business_unit_id', 'people_business_unit_id_foreign')")
    assert.include(upBody, ".references('business_unit_id')")
    assert.include(upBody, ".inTable('business_units')")
    assert.notMatch(upBody, /onDelete/i, 'la FK es RESTRICT a propósito: sin onDelete')
    assert.notMatch(content, /await\s+this\.schema/, 'nunca await sobre this.schema (CLAUDE.md)')
    assert.notMatch(upBody, /\bUPDATE\b|\.update\(/i, 'sin backfill: la base arranca limpia')
  })

  test('down() revierte en orden dropForeign → dropIndex → dropColumn', ({ assert }) => {
    const { content } = readMigration()
    const downBody = content.slice(content.indexOf('async down()'))
    const foreignIdx = downBody.indexOf("dropForeign(['business_unit_id'], 'people_business_unit_id_foreign')")
    const indexIdx = downBody.indexOf("dropIndex(['business_unit_id'], 'people_business_unit_id_index')")
    const columnIdx = downBody.indexOf("dropColumn('business_unit_id')")
    assert.isAbove(foreignIdx, -1)
    assert.isAbove(indexIdx, foreignIdx)
    assert.isAbove(columnIdx, indexIdx)
  })

  test('la cabecera prohíbe volver la columna NOT NULL y explica el RESTRICT', ({ assert }) => {
    const { content } = readMigration()
    assert.include(content, 'NUNCA DEBE VOLVERSE NOT NULL')
    assert.include(content, 'RESTRICT')
  })
})

test.group('Person — composición fail-closed y columna oculta (D7, §10)', () => {
  test('compone withBusinessUnitScope() sin includeGlobal', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.include(content, "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'")
    assert.match(content, /compose\([^)]*SoftDeletes[^)]*withBusinessUnitScope\(\)/)
    // El error más caro de la HU: copiar `{ includeGlobal: true }` de employee_type.ts
    // haría visibles las filas NULL para todos los inquilinos (fuga de PII).
    assert.notInclude(content, 'includeGlobal')
  })

  test('businessUnitId existe, no se serializa y el hook no lanza', ({ assert }) => {
    const content = readFileSync(MODEL_FILE, 'utf-8')
    assert.match(content, /@column\(\{ serializeAs: null \}\)\s*\n\s*declare businessUnitId: number \| null/)
    assert.include(content, '@beforeCreate()')
    const hookStart = content.indexOf('static assignBusinessUnitId')
    assert.isAbove(hookStart, -1)
    const hookBody = content.slice(hookStart, content.indexOf('}', content.indexOf('TenantContext.getScope()', hookStart)))
    assert.notInclude(hookBody, 'throw', 'el hook es tolerante: sin contexto deja null (regla 4)')
    assert.isDefined(Person.$getColumn('businessUnitId'))
    assert.isNull(Person.$getColumn('businessUnitId')?.serializeAs)
    assert.isDefined(Person.$getRelation('businessUnit'))
  })
})

test.group('Person.assignBusinessUnitId — hook puro, sin BD', () => {
  test('sin contexto deja null y no lanza (landlord, seeder, signup, biométrico)', ({ assert }) => {
    const person = new Person()
    assert.isFalse(TenantContext.isActive())
    assert.doesNotThrow(() => Person.assignBusinessUnitId(person))
    assert.isNull(person.businessUnitId)
  })

  test('con contexto toma la empresa activa', ({ assert }) => {
    const person = new Person()
    TenantContext.run([123], () => Person.assignBusinessUnitId(person))
    assert.equal(person.businessUnitId, 123)
  })

  test('con contexto activo y scope vacío deja null, no lanza', ({ assert }) => {
    const person = new Person()
    assert.doesNotThrow(() => TenantContext.run([], () => Person.assignBusinessUnitId(person)))
    assert.isNull(person.businessUnitId)
  })

  test('no pisa una marca ya asignada (signup self-service)', ({ assert }) => {
    const person = new Person()
    person.businessUnitId = 7
    TenantContext.run([123], () => Person.assignBusinessUnitId(person))
    assert.equal(person.businessUnitId, 7)
  })
})

test.group('Person — scope fail-closed y FK RESTRICT contra BD (CA-2, CA-5, CA-6)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  const personIds: number[] = []
  let personA: Person
  let personB: Person
  let personNull: Person

  async function createUnit(prefix: string): Promise<BusinessUnit> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    return BusinessUnit.create({
      businessUnitName: `Person scope ${prefix} ${stamp}`,
      businessUnitSlug: `person-scope-${prefix}-${stamp}`,
      businessUnitLegalName: `Person scope ${prefix} legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
  }

  group.setup(async () => {
    unitA = await createUnit('a')
    unitB = await createUnit('b')
    personA = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'EmpresaA',
      personSecondLastname: 'Persona',
      businessUnitId: unitA.businessUnitId,
    })
    personB = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'EmpresaB',
      personSecondLastname: 'Persona',
      businessUnitId: unitB.businessUnitId,
    })
    personNull = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'Plataforma',
      personSecondLastname: 'Persona',
    })
    personIds.push(personA.personId, personB.personId, personNull.personId)
  })

  group.teardown(async () => {
    // Las personas salen ANTES que las empresas: la FK es RESTRICT.
    await Person.query().whereIn('person_id', personIds).delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
      .delete()
  })

  test('sin contexto no se filtra: las tres son visibles (regla 7)', async ({ assert }) => {
    const rows = await Person.query().whereIn('person_id', personIds)
    assert.lengthOf(rows, 3)
  })

  test('con la empresa A solo se ve la persona de A: ni la de B ni la NULL (reglas 5 y 6)', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([unitA.businessUnitId], async () =>
      Person.query().whereIn('person_id', personIds)
    )
    assert.deepEqual(
      rows.map((row) => row.personId),
      [personA.personId]
    )
  })

  test('por id: la persona NULL y la de B responden null para A; la propia sí (CA-5)', async ({
    assert,
  }) => {
    const [own, foreign, platform] = await TenantContext.run([unitA.businessUnitId], () =>
      Promise.all([
        Person.find(personA.personId),
        Person.find(personB.personId),
        Person.find(personNull.personId),
      ])
    )
    assert.isNotNull(own)
    assert.isNull(foreign)
    assert.isNull(platform)
  })

  test('contexto activo con scope vacío devuelve cero filas, nunca la tabla ni solo las NULL', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([], async () =>
      Person.query().whereIn('person_id', personIds)
    )
    assert.lengthOf(rows, 0)
  })

  test('runUnscoped no filtra', async ({ assert }) => {
    const rows = await TenantContext.runUnscoped(
      () => Person.query().whereIn('person_id', personIds),
      'spec person scope'
    )
    assert.lengthOf(rows, 3)
  })

  test('crear con contexto marca la empresa activa; sin contexto queda null (CA-1, CA-6)', async ({
    assert,
  }) => {
    const marked = await TenantContext.run([unitB.businessUnitId], () =>
      Person.create({ personFirstname: 'Scope', personLastname: 'Marcada', personSecondLastname: 'Persona' })
    )
    personIds.push(marked.personId)
    const unmarked = await Person.create({
      personFirstname: 'Scope',
      personLastname: 'SinMarca',
      personSecondLastname: 'Persona',
    })
    personIds.push(unmarked.personId)

    assert.equal(marked.businessUnitId, unitB.businessUnitId)
    assert.isNull(unmarked.businessUnitId)
    // La marca no viaja en la respuesta (§10, CA-1).
    assert.notProperty(marked.serialize(), 'businessUnitId')
  })

  test('la FK RESTRICT rechaza borrar una empresa con personas', async ({ assert }) => {
    try {
      await BusinessUnit.query().where('business_unit_id', unitA.businessUnitId).delete()
      assert.fail('debió rechazar')
    } catch (error) {
      assert.match(String((error as Error).message), /foreign key constraint fails|ER_ROW_IS_REFERENCED/)
    }
  })
})
