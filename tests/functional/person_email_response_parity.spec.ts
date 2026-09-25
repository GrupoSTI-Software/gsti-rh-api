import { test } from '@japa/runner'
import Person from '#models/person'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1789698261614 — CA-2: el alta (POST /api/persons) y la edición
 * (PUT /api/persons/:personId) deben responder byte a byte igual ante el MISMO
 * correo ya ocupado. Es el criterio que define la historia.
 *
 * Nace en rojo a propósito: hoy el alta responde el `E_VALIDATION_ERROR`
 * genérico de VineJS (texto de librería en inglés) y la edición responde el
 * `Dato duplicado` legacy (en español). Las Tasks 5–6 lo pondrán verde; el
 * aserto no se debilita para que pase.
 *
 * Del spec vecino (`person_identity_company_scope.spec.ts`) se copian sin
 * inventar: los actores con salvoconducto (`createBypassActor('owner', ...)`,
 * porque con la exigencia del módulo encendida un rol sin concesiones responde
 * 403 antes de llegar a la validación), el login (`loginAs(actor.user)`), los
 * headers de empresa (`businessUnitHeaders`) y la limpieza. Las personas del
 * caso salen ANTES que los actores: cuelgan de `business_unit_id` con FK
 * RESTRICT, así que borrar la empresa primero revienta el teardown.
 */

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('Paridad del rechazo del correo personal (USRH1789698261614)', (group) => {
  let actorA: TenantActor
  let actorB: TenantActor
  const personIds: number[] = []

  group.setup(async () => {
    actorA = await createBypassActor('owner', 'ParityA')
    actorB = await createBypassActor('owner', 'ParityB')
  })

  group.teardown(async () => {
    // Las personas primero, los actores después (FK RESTRICT sobre la empresa).
    if (personIds.length > 0) {
      await Person.query().withTrashed().whereIn('person_id', personIds).delete()
    }
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  test('CA-2 — POST y PUT con el mismo correo ocupado responden byte a byte igual', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const takenEmail = `parity-taken-${stamp}@gsti-tests.local`

    // Siembra: expediente vivo en la empresa A con el correo que quedará ocupado.
    const seed = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorA))
      .loginAs(actorA.user)
      .json({ personFirstname: 'Parity', personLastname: 'Seed', personEmail: takenEmail })
    assert.equal(seed.status(), 201)
    personIds.push(seed.body().data.person.personId as number)

    // Expediente propio en B, con correo libre: es el que la edición intentará
    // llevar al correo ya ocupado en A.
    const own = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorB))
      .loginAs(actorB.user)
      .json({
        personFirstname: 'Parity',
        personLastname: 'Own',
        personEmail: `parity-own-${stamp}@gsti-tests.local`,
      })
    assert.equal(own.status(), 201)
    const ownId = own.body().data.person.personId as number
    personIds.push(ownId)

    // Las dos puertas al mismo dato ocupado, una por verbo. El PUT lleva
    // `personFirstname`/`personLastname` porque `updatePersonValidator` los
    // exige (no son opcionales): sin ellos sería un 422 por otra razón.
    const post = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actorB))
      .loginAs(actorB.user)
      .json({ personFirstname: 'Parity', personLastname: 'Probe', personEmail: takenEmail })
    const put = await client
      .put(`/api/persons/${ownId}`)
      .headers(businessUnitHeaders(actorB))
      .loginAs(actorB.user)
      .json({ personFirstname: 'Parity', personLastname: 'Own', personEmail: takenEmail })

    assert.equal(post.status(), 422)
    assert.equal(put.status(), 422)
    // La comparación es entre las DOS respuestas, nunca contra un literal: así
    // el spec exige paridad y no congela un texto concreto.
    assert.equal(JSON.stringify(post.body()), JSON.stringify(put.body()))
    assert.deepEqual(Object.keys(post.body()), ['title', 'detail', 'key', 'code'])
  })
})
