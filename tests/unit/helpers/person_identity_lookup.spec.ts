import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import i18nManager from '@adonisjs/i18n/services/main'
import PersonService from '#services/person_service'
import {
  livePersonWithIdentityExists,
  resolveRacedIdentityField,
} from '#helpers/person_identity_lookup'

/** USRH1789698261610 reglas 1, 2, 4 y 10 a nivel de consulta. */

test.group('livePersonWithIdentityExists', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  const personIds: number[] = []
  const CURP = 'IDENTCURP01'

  async function createUnit(slug: string): Promise<BusinessUnit> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    return BusinessUnit.create({
      businessUnitName: `Ident ${slug} ${stamp}`,
      businessUnitSlug: `ident-${slug}-${stamp}`,
      businessUnitLegalName: `Ident ${slug} legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
  }

  group.setup(async () => {
    unitA = await createUnit('a')
    unitB = await createUnit('b')
    const personA = await Person.create({
      personFirstname: 'Ident',
      personLastname: 'EmpresaA',
      personSecondLastname: 'Spec',
      personCurp: CURP,
      businessUnitId: unitA.businessUnitId,
    })
    const personB = await Person.create({
      personFirstname: 'Ident',
      personLastname: 'EmpresaB',
      personSecondLastname: 'Spec',
      personCurp: CURP,
      businessUnitId: unitB.businessUnitId,
    })
    personIds.push(personA.personId, personB.personId)
  })

  group.teardown(async () => {
    await Person.query().whereIn('person_id', personIds).delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
      .delete()
  })

  test('cada empresa ve solo su propio expediente con la misma CURP (reglas 1 y 2)', async ({ assert }) => {
    const hash = blindIndex(CURP)
    assert.isTrue(await livePersonWithIdentityExists('curp', hash, unitA.businessUnitId))
    assert.isTrue(await livePersonWithIdentityExists('curp', hash, unitB.businessUnitId))
    assert.isFalse(await livePersonWithIdentityExists('rfc', hash, unitA.businessUnitId))
  })

  test('excluye al propio expediente al editar', async ({ assert }) => {
    const [ownPersonId] = personIds
    const hash = blindIndex(CURP)
    assert.isFalse(
      await livePersonWithIdentityExists('curp', hash, unitA.businessUnitId, ownPersonId)
    )
  })

  test('sin empresa nunca hay veredicto (regla 10)', async ({ assert }) => {
    const hash = blindIndex(CURP)
    assert.isFalse(await livePersonWithIdentityExists('curp', hash, null))
    assert.isFalse(await livePersonWithIdentityExists('curp', hash, undefined))
  })
})

test.group('resolveRacedIdentityField', () => {
  test('la reverificación manda sobre el índice que reportó MySQL', ({ assert }) => {
    assert.equal(resolveRacedIdentityField({ status: 422, field: 'curp' }, 'rfc'), 'curp')
    assert.equal(resolveRacedIdentityField({ status: 422, field: 'nss' }, 'rfc'), 'nss')
  })

  test('sin choque de identidad en la reverificación se usa el índice', ({ assert }) => {
    assert.equal(resolveRacedIdentityField({ status: 200 }, 'rfc'), 'rfc')
    assert.equal(
      resolveRacedIdentityField({ status: 422, reason: 'email-not-available' }, 'nss'),
      'nss'
    )
    assert.equal(resolveRacedIdentityField({ status: 400, missingCompany: true }, 'curp'), 'curp')
    assert.equal(resolveRacedIdentityField(null, 'rfc'), 'rfc')
  })
})

test.group('verifyInfo + resolveRacedIdentityField ante choque simultáneo CURP+RFC', (group) => {
  let unit: BusinessUnit
  let personId = 0
  const stamp = `${Date.now()}`.slice(-9)
  const curp = `RACECURP${stamp}`
  const rfc = `RACERFC${stamp}`

  group.setup(async () => {
    unit = await BusinessUnit.create({
      businessUnitName: `Ident race ${stamp}`,
      businessUnitSlug: `ident-race-${stamp}`,
      businessUnitLegalName: `Ident race legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    const winner = await Person.create({
      personFirstname: 'Ident',
      personLastname: 'Race',
      personSecondLastname: 'Spec',
      personCurp: curp,
      personRfc: rfc,
      businessUnitId: unit.businessUnitId,
    })
    personId = winner.personId
  })

  group.teardown(async () => {
    await Person.query().withTrashed().where('person_id', personId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  })

  test('aunque MySQL reporte el índice del RFC, se informa la CURP (orden CURP > RFC > NSS)', async ({
    assert,
  }) => {
    const service = new PersonService(i18nManager.locale(i18nManager.defaultLocale))
    const loser = new Person()
    loser.personCurp = curp
    loser.personRfc = rfc
    const recheck = await service.verifyInfo(loser, unit.businessUnitId)
    assert.equal(resolveRacedIdentityField(recheck, 'rfc'), 'curp')
  })
})

test.group('carga masiva — paso de la empresa (contenido)', () => {
  test('personWithCurpExists recibe la empresa de la fila', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/employee_service.ts'), 'utf-8')
    assert.include(content, 'this.personWithCurpExists(employeeData.curp, businessUnitId)')
    assert.include(content, "livePersonWithIdentityExists('curp', blindIndex(curp), businessUnitId)")
  })
})
