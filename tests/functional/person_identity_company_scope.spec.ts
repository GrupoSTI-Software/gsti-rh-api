import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import Person from '#models/person'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1789698261610 — criterios 1-6 de la HU por HTTP.
 * Limpieza: las personas del caso salen ANTES que los actores (FK RESTRICT).
 */

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type Identity = { rfc: string; curp: string; nss: string; email: string }

function personPayload(tag: string, identity: Identity) {
  return {
    personFirstname: 'Ident',
    personLastname: tag,
    personSecondLastname: 'Scope',
    personGender: '',
    personRfc: identity.rfc,
    personCurp: identity.curp,
    personImssNss: identity.nss,
    personEmail: identity.email,
  }
}

test.group('unicidad de identidad por empresa', (group) => {
  let actorA: TenantActor
  let actorB: TenantActor
  const personIds: number[] = []

  group.setup(async () => {
    actorA = await createBypassActor('owner', 'IdentA')
    actorB = await createBypassActor('owner', 'IdentB')
  })

  group.teardown(async () => {
    if (personIds.length > 0) {
      await Person.query().withTrashed().whereIn('person_id', personIds).delete()
    }
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  async function createPerson(
    client: ApiClient,
    actor: TenantActor,
    tag: string,
    identity: Identity
  ) {
    const response = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
      .json(personPayload(tag, identity))
    const personId = response.body()?.data?.person?.personId as number | undefined
    if (personId) personIds.push(personId)
    return response
  }

  test('criterio 1 — mismo trabajador en A y en B: ambas altas proceden y no se mencionan terceros', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const identity = {
      rfc: `IDENTRFC${stamp}`.slice(0, 20),
      curp: `IDENTCURP${stamp}`.slice(0, 20),
      nss: `IDENTNSS${stamp}`.slice(0, 20),
      email: `ident-a-${stamp}@gsti-tests.local`,
    }
    const first = await createPerson(client, actorA, 'MismaA', identity)
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorB, 'MismaB', {
      ...identity,
      email: `ident-b-${stamp}@gsti-tests.local`,
    })
    assert.equal(second.status(), 201)

    const raw = JSON.stringify(second.body())
    assert.notMatch(raw, /otra empresa|ya existe en|ya registrado en otra/i)
    const personB = await Person.query()
      .where('person_id', second.body().data.person.personId)
      .firstOrFail()
    assert.equal(personB.businessUnitId, actorB.businessUnit.businessUnitId)
  })

  test('criterio 2 — segunda alta con el mismo RFC en la empresa: 422 de negocio sin datos internos', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const identity = {
      rfc: `DUPRFC${stamp}`.slice(0, 20),
      curp: `DUPCURP${stamp}`.slice(0, 20),
      nss: `DUPNSS${stamp}`.slice(0, 20),
      email: `dup-a-${stamp}@gsti-tests.local`,
    }
    const first = await createPerson(client, actorA, 'DupA', identity)
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorA, 'DupA2', {
      rfc: identity.rfc,
      curp: `DUPCURP2${stamp}`.slice(0, 20),
      nss: `DUPNSS2${stamp}`.slice(0, 20),
      email: `dup-a2-${stamp}@gsti-tests.local`,
    })
    assert.equal(second.status(), 422)
    assert.equal(second.body()?.key, 'rfc-ya-registrado-en-la-empresa')
    assert.equal(second.body()?.code, 'PERSON.IDENTITY.001')
    assert.isString(second.body()?.title)
    assert.isString(second.body()?.detail)
    const raw = JSON.stringify(second.body())
    assert.notMatch(raw, /people_rfc_company_unique|ER_DUP_ENTRY|person_rfc_hash|[0-9a-f]{64}/)
  })

  test('criterio 2 — editar para tomar el RFC de otro vivo de la empresa: 422 de negocio', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const first = await createPerson(client, actorA, 'EditA', {
      rfc: `EDITRFC1${stamp}`.slice(0, 20),
      curp: `EDITCURP1${stamp}`.slice(0, 20),
      nss: `EDITNSS1${stamp}`.slice(0, 20),
      email: `edit-a1-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)
    const second = await createPerson(client, actorA, 'EditB', {
      rfc: `EDITRFC2${stamp}`.slice(0, 20),
      curp: `EDITCURP2${stamp}`.slice(0, 20),
      nss: `EDITNSS2${stamp}`.slice(0, 20),
      email: `edit-a2-${stamp}@gsti-tests.local`,
    })
    assert.equal(second.status(), 201)

    const response = await client
      .put(`/api/persons/${second.body().data.person.personId}`)
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
      .json({
        personFirstname: 'Ident',
        personLastname: 'EditB',
        personRfc: `EDITRFC1${stamp}`.slice(0, 20),
      })
    assert.equal(response.status(), 422)
    assert.equal(response.body()?.key, 'rfc-ya-registrado-en-la-empresa')
  })

  test('criterio 3 — el correo sigue global: dos empresas no pueden repetirlo', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const sharedEmail = `shared-${stamp}@gsti-tests.local`
    const first = await createPerson(client, actorA, 'MailA', {
      rfc: `MAILRFC1${stamp}`.slice(0, 20),
      curp: `MAILCURP1${stamp}`.slice(0, 20),
      nss: `MAILNSS1${stamp}`.slice(0, 20),
      email: sharedEmail,
    })
    assert.equal(first.status(), 201)

    const second = await createPerson(client, actorB, 'MailB', {
      rfc: `MAILRFC2${stamp}`.slice(0, 20),
      curp: `MAILCURP2${stamp}`.slice(0, 20),
      nss: `MAILNSS2${stamp}`.slice(0, 20),
      email: sharedEmail,
    })
    assert.equal(second.status(), 422)
  })

  test('criterio 4 — RFC vaciado queda libre en la misma empresa', async ({ assert, client }) => {
    const stamp = uniqueStamp()
    const rfc = `FREERFC${stamp}`.slice(0, 20)
    const first = await createPerson(client, actorA, 'FreeA', {
      rfc,
      curp: `FREECURP${stamp}`.slice(0, 20),
      nss: `FREEnSS${stamp}`.slice(0, 20),
      email: `free-a-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)

    // Se vacía por modelo: por HTTP el body parser convierte '' en null y la
    // edición trata null como "no actualizar" (campos enmascarados).
    const emptied = await Person.findOrFail(first.body().data.person.personId)
    emptied.personRfc = ''
    await emptied.save()

    const reused = await createPerson(client, actorA, 'FreeB', {
      rfc,
      curp: `FREECURP2${stamp}`.slice(0, 20),
      nss: `FREENSS2${stamp}`.slice(0, 20),
      email: `free-b-${stamp}@gsti-tests.local`,
    })
    assert.equal(reused.status(), 201)
  })

  test('criterio 5 — la baja libera: el RFC del dado de baja se reutiliza y dos bajas conviven', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const rfc = `LEAVERFC${stamp}`.slice(0, 20)
    const first = await createPerson(client, actorA, 'LeaveA', {
      rfc,
      curp: `LEAVECURP${stamp}`.slice(0, 20),
      nss: `LEAVENSS${stamp}`.slice(0, 20),
      email: `leave-a-${stamp}@gsti-tests.local`,
    })
    assert.equal(first.status(), 201)

    const deleted = await client
      .delete(`/api/persons/${first.body().data.person.personId}`)
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
    assert.isBelow(deleted.status(), 300)

    const reused = await createPerson(client, actorA, 'LeaveB', {
      rfc,
      curp: `LEAVECURP2${stamp}`.slice(0, 20),
      nss: `LEAVENSS2${stamp}`.slice(0, 20),
      email: `leave-b-${stamp}@gsti-tests.local`,
    })
    assert.equal(reused.status(), 201)
  })

  test('criterio 6 — sin empresa no hay veredicto: falta el header y no se dice si el dato existe', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const rfc = `NOHEADER${stamp}`.slice(0, 20)
    const seeded = await createPerson(client, actorA, 'NoHead', {
      rfc,
      curp: `NOHEADCURP${stamp}`.slice(0, 20),
      nss: `NOHEADNSS${stamp}`.slice(0, 20),
      email: `nohead-${stamp}@gsti-tests.local`,
    })
    assert.equal(seeded.status(), 201)

    const response = await client
      .post('/api/persons')
      .loginAs(actorA.user)
      .json(
        personPayload('NoHead2', {
          rfc,
          curp: `X${stamp}`.slice(0, 20),
          nss: `Y${stamp}`.slice(0, 20),
          email: `nohead2-${stamp}@gsti-tests.local`,
        })
      )
    assert.equal(response.status(), 400)
    assert.equal(response.body()?.key, 'BU.VAL.000')
  })
})
