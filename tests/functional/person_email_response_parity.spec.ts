import { test } from '@japa/runner'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import Person from '#models/person'
import { MASK_CHAR } from '#helpers/sensitive_mask'
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
 * El spec nació en rojo a propósito: el alta respondía el `E_VALIDATION_ERROR`
 * genérico de VineJS (texto de librería en inglés, con `errors[]` y `rule`) y la
 * edición respondía el `Dato duplicado` legacy, que confirmaba el dato («Ya
 * existe un trabajador con el mismo valor en: correo electrónico»). Las Tasks 5–6
 * lo pusieron verde; el aserto no se debilitó para que pasara.
 *
 * La Task 7 endurece la evidencia sobre ese mismo cuerpo ya unificado:
 *   - CA-3: la forma de error no expone `type`/`message`/`data`, que son las
 *     claves del formato de éxito y del legacy y serían el andamio del oráculo.
 *   - CA-6: ni una palabra que confirme la existencia del correo, ni una fuga
 *     técnica (`errors`, `rule`, `database.unique`, el propio `personEmail`), ni
 *     el correo probado, ni fechas, ni cabecera de límite de intentos.
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

/**
 * Vocabulario que confirmaría la existencia del correo. Cada término tiene un
 * dueño real —no es adorno— y por eso el aserto no es tautológico:
 *   - «ya existe», «duplicado», «un trabajador», «Dato duplicado», «correo
 *     electrónico»: el copy legacy de la edición, retirado en la Task 6
 *     («Ya existe un trabajador con el mismo valor en: correo electrónico»,
 *     título «Dato duplicado»).
 *   - «registrado»: el copy hermano del 610 («Este RFC ya está registrado en tu
 *     empresa»); si el camino del correo cayera por error en el emisor de
 *     identidad, aparecería.
 *   - «otro trabajador», «otra empresa», «otra cuenta», «pertenece»: la familia
 *     que enumera a un tercero (el 610 dice «Otro expediente activo de tu
 *     empresa usa este RFC»), prohibida por la historia.
 *   - «tomado», «ocupado», «en uso», «disponible»: el vocabulario de
 *     confirmación de la política —justo lo que la historia prohíbe decir— y el
 *     literal en inglés que retiró la Task 5 («has already been taken»).
 * Advertencia del Anexo B §B.5: «trabajador» solo se asierta como «otro
 * trabajador» / «un trabajador», NUNCA suelto, porque el `detail` aprobado cierra
 * con «del trabajador»; «registrado» (participio) sí, «registr» (raíz) no,
 * porque el copy usa «registrar» (infinitivo, el acto).
 */
const PALABRAS_PROHIBIDAS = [
  'ya existe',
  'duplicado',
  'en uso',
  'tomado',
  'otro trabajador',
  'un trabajador',
  'otra empresa',
  'otra cuenta',
  'registrado',
  'disponible',
  'ocupado',
  'pertenece',
]

/**
 * Fugas técnicas: el cuerpo del rechazo debe ser SOLO `{title, detail, key,
 * code}`. `errors`/`rule`/`database.unique`/`personEmail` vienen del
 * `E_VALIDATION_ERROR` de VineJS + Lucid que el alta devolvía antes (el literal
 * `The personEmail has already been taken` lo emite `@adonisjs/lucid`, no el
 * repo); `message`/`type`/`data` son las claves del cuerpo legacy de la edición
 * y del formato de éxito.
 */
const FUGAS_TECNICAS = [
  'errors',
  'rule',
  'database.unique',
  'personEmail',
  'has already been taken',
  'correo electrónico',
  'Dato duplicado',
  'Ya existe',
  'message',
  'type',
  'data',
]

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

  /**
   * Alta en la empresa del actor, sea 201 esperado (siembra) o 422 esperado
   * (probe): igual que en el spec vecino, TODAS las altas pasan por aquí. El id
   * se acumula SOLO si la fila se creó, y ANTES de cualquier aserto de status:
   * si un probe devolviera otro status habiendo creado la fila, el push ya
   * ocurrió y el teardown la alcanza; si el push fuera después del assert, la
   * fila quedaría huérfana y la FK RESTRICT reventaría la limpieza.
   */
  async function createPerson(
    client: ApiClient,
    actor: TenantActor,
    payload: Record<string, unknown>
  ): Promise<ApiResponse> {
    const response = await client
      .post('/api/persons')
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
      .json(payload)
    const personId = response.body()?.data?.person?.personId as number | undefined
    if (personId) personIds.push(personId)
    return response
  }

  test('CA-2/CA-3/CA-6 — alta y edición del mismo correo ocupado: paridad byte a byte y sin divulgación', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const takenEmail = `parity-taken-${stamp}@gsti-tests.local`

    // Siembra: expediente vivo en la empresa A con el correo que quedará ocupado.
    const seed = await createPerson(client, actorA, {
      personFirstname: 'Parity',
      personLastname: 'Seed',
      personEmail: takenEmail,
    })
    assert.equal(seed.status(), 201)

    // Expediente propio en B, con correo libre: es el que la edición intentará
    // llevar al correo ya ocupado en A.
    const own = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Own',
      personEmail: `parity-own-${stamp}@gsti-tests.local`,
    })
    assert.equal(own.status(), 201)
    const ownId = own.body().data.person.personId as number

    // Las dos puertas al mismo dato ocupado, una por verbo. El PUT lleva
    // `personFirstname`/`personLastname` porque `updatePersonValidator` los
    // exige (no son opcionales): sin ellos sería un 422 por otra razón.
    const post = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Probe',
      personEmail: takenEmail,
    })
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

    // ── CA-3: la forma de error no trae las claves del formato de éxito ni del legacy.
    const cuerpoEstructurado = post.body() as Record<string, unknown>
    assert.isUndefined(cuerpoEstructurado.type)
    assert.isUndefined(cuerpoEstructurado.message)
    assert.isUndefined(cuerpoEstructurado.data)

    // ── CA-6: el rechazo no confirma la existencia del correo.
    const cuerpo = JSON.stringify(post.body())
    for (const palabra of PALABRAS_PROHIBIDAS) {
      assert.notInclude(cuerpo.toLowerCase(), palabra)
    }
    for (const fuga of FUGAS_TECNICAS) {
      assert.notInclude(cuerpo, fuga)
    }
    // El correo probado no se repite en la respuesta, ni su pista.
    assert.notInclude(cuerpo, takenEmail)
    // Sin fechas (ni ISO ni dd/mm/aaaa): no se dice desde cuándo está ocupado.
    assert.notMatch(cuerpo, /\d{4}-\d{2}-\d{2}/)
    assert.notMatch(cuerpo, /\d{2}\/\d{2}\/\d{4}/)
    // Sin cabecera de límite de intentos: este rechazo no delata un throttler.
    assert.isUndefined(post.headers()['x-ratelimit-limit'])
  })

  test('CA-2 (escenario combinado) — correo ocupado + RFC duplicado en la propia empresa: los dos verbos siguen respondiendo el correo', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const takenEmail = `parity-taken-${stamp}@gsti-tests.local`
    const sharedRfc = `PARITYRFC${stamp.replace('-', '')}`

    // La siembra del CA-2, repetida aquí: un expediente vivo en la empresa A con
    // el correo que quedará ocupado globalmente y que los dos verbos probarán.
    const seed = await createPerson(client, actorA, {
      personFirstname: 'Parity',
      personLastname: 'ComboSeed',
      personEmail: takenEmail,
    })
    assert.equal(seed.status(), 201)

    // Expediente propio en B con un RFC ÚNICO: ese RFC quedará duplicado dentro
    // de B, así que el alta combinará correo ocupado + identidad duplicada.
    const own = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'ComboOwn',
      personEmail: `parity-own-${stamp}@gsti-tests.local`,
      personRfc: sharedRfc,
    })
    assert.equal(own.status(), 201)
    const ownId = own.body().data.person.personId as number

    // Alta en B: correo ocupado (de A) + el RFC ya usado en B. Colisionan a la
    // vez la unicidad global del correo y la unicidad de identidad por empresa.
    const post = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'ComboProbe',
      personEmail: takenEmail,
      personRfc: sharedRfc,
    })
    // Edición en B sobre el expediente de ese RFC: mismo correo ocupado + su
    // propio RFC (que `verifyInfo` excluye por ser el mismo expediente) + sus
    // nombres, que `updatePersonValidator` exige.
    const put = await client
      .put(`/api/persons/${ownId}`)
      .headers(businessUnitHeaders(actorB))
      .loginAs(actorB.user)
      .json({
        personFirstname: 'Parity',
        personLastname: 'ComboOwn',
        personEmail: takenEmail,
        personRfc: sharedRfc,
      })

    // Lo que prueba: cuando el correo ocupado coincide con un duplicado de
    // identidad de la empresa, los dos verbos siguen respondiendo el rechazo del
    // correo, no el de identidad.
    assert.equal(post.status(), 422)
    assert.equal(put.status(), 422)
    // Byte a byte idénticos: la colisión combinada no rompe la paridad (CA-2).
    assert.equal(JSON.stringify(post.body()), JSON.stringify(put.body()))
    assert.equal(post.body()?.code, 'PERSON.IDENTITY.005')
    assert.equal(put.body()?.code, 'PERSON.IDENTITY.005')
  })

  test('CA-4 — alta legítima: sin el campo personEmail el alta procede (201)', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()

    // El caso «vacío» se prueba OMITIENDO el campo, nunca con `''`: por HTTP el
    // body parser convierte `''` en `null` y la edición trata `null` como «no
    // actualizar», así que forzar el `''` haría frágil el test por una razón
    // ajena a esta historia (criterio 4 del spec vecino). El caso «correo libre»
    // ya lo cubren las siembras de los demás casos, que asertan 201.
    const sinCorreo = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: `Free-${stamp}`,
    })
    assert.equal(sinCorreo.status(), 201)
    assert.isDefined(sinCorreo.body()?.data?.person?.personId)
  })

  test('CA-7 — el code no distingue un correo ocupado de otro: dos ocupados colapsan al mismo cuerpo', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()
    const firstTaken = `parity-oracle-1-${stamp}@gsti-tests.local`
    const secondTaken = `parity-oracle-2-${stamp}@gsti-tests.local`

    // Dos correos ocupados DISTINTOS, sembrados en la misma empresa A: si el
    // rechazo distinguiera entre uno y otro —por ejemplo con un `code` propio de
    // cada caso—, el `code` sería el oráculo que la historia prohíbe.
    const firstSeed = await createPerson(client, actorA, {
      personFirstname: 'Parity',
      personLastname: 'Oracle1',
      personEmail: firstTaken,
    })
    assert.equal(firstSeed.status(), 201)
    const secondSeed = await createPerson(client, actorA, {
      personFirstname: 'Parity',
      personLastname: 'Oracle2',
      personEmail: secondTaken,
    })
    assert.equal(secondSeed.status(), 201)

    // Dos probes desde B, uno por cada correo ocupado.
    const probeFirst = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Probe1',
      personEmail: firstTaken,
    })
    const probeSecond = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Probe2',
      personEmail: secondTaken,
    })

    assert.equal(probeFirst.status(), 422)
    assert.equal(probeSecond.status(), 422)
    // Byte a byte idénticos: el cuerpo no depende de CUÁL correo se probó.
    assert.equal(JSON.stringify(probeFirst.body()), JSON.stringify(probeSecond.body()))
    // Y explícito, campo por campo, empezando por `code` y `key`.
    assert.equal(probeFirst.body()?.code, probeSecond.body()?.code)
    assert.equal(probeFirst.body()?.key, probeSecond.body()?.key)
    assert.equal(probeFirst.body()?.title, probeSecond.body()?.title)
    assert.equal(probeFirst.body()?.detail, probeSecond.body()?.detail)
    // Ninguno de los dos echa su propio correo.
    assert.notInclude(JSON.stringify(probeFirst.body()), firstTaken)
    assert.notInclude(JSON.stringify(probeSecond.body()), secondTaken)
  })

  test('CA-8 — correo con máscara o de más de 200: 422 de validación, nunca PERSON.IDENTITY.005', async ({
    assert,
    client,
  }) => {
    const stamp = uniqueStamp()

    // DATO REAL, no supuesto: `createPersonValidator` (app/validators/person.ts)
    // NO tiene la regla `.email()` en `personEmail` —solo `trim`, `minLength(0)`,
    // `maxLength(200)`, `noMaskCharRule()` y `unique()`—, así que un correo mal
    // formado PASA la validación y el alta responde 201. Por eso CA-8 se prueba
    // por MÁSCARA y por LONGITUD, que son lo que el validador SÍ rechaza, y no
    // por sintaxis: no se inventa un 422 que la plataforma no da.
    const conMascara = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Mask',
      personEmail: `no-es-un-correo${MASK_CHAR}`,
    })
    assert.equal(conMascara.status(), 422)
    assert.notEqual(conMascara.body()?.code, 'PERSON.IDENTITY.005')
    // La validación específica de sintaxis/longitud/máscara sigue intacta y no la secuestra el rechazo del correo.
    assert.equal(conMascara.body()?.type, 'validation_error')
    assert.isArray(conMascara.body()?.errors)
    assert.equal(conMascara.body()?.key, undefined)

    const demasiadoLargo = await createPerson(client, actorB, {
      personFirstname: 'Parity',
      personLastname: 'Long',
      personEmail: `parity-long-${stamp}-${'x'.repeat(210)}@gsti-tests.local`,
    })
    assert.equal(demasiadoLargo.status(), 422)
    assert.notEqual(demasiadoLargo.body()?.code, 'PERSON.IDENTITY.005')
    // La validación específica de sintaxis/longitud/máscara sigue intacta y no la secuestra el rechazo del correo.
    assert.equal(demasiadoLargo.body()?.type, 'validation_error')
    assert.isArray(demasiadoLargo.body()?.errors)
    assert.equal(demasiadoLargo.body()?.key, undefined)
  })
})
