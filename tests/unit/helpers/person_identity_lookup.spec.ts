import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { livePersonWithIdentityExists } from '#helpers/person_identity_lookup'

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
