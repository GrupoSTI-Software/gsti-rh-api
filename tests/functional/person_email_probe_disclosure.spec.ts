import { readFileSync } from 'node:fs'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import Person from '#models/person'
import { LogStore } from '#models/MongoDB/log_store'
import { blindIndex } from '#utils/blind_index'
import {
  PERSON_EMAIL_PROBE_RATE,
  PERSON_WRITE_RATE,
} from '#helpers/person_email_probe_throttle'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { captureLogStore, type CapturedLog } from './person_user_email_mirror_support.js'

/**
 * USRH1789762889970 — el sondeo de correos personales, probado por HTTP.
 *
 * El correo personal es único GLOBAL por decisión (puede ser credencial), así que
 * su rechazo es un oráculo de existencia por construcción. Esta HU le pone costo
 * (dos contadores con llaves separadas) y rastro (la bitácora Mongo
 * `log_person_email_probe`). Lo que este spec tiene que demostrar, por encima de
 * todo, es la REGLA DE ORO: el corte NO distingue si el correo estaba libre u
 * ocupado — mismo punto de corte y misma respuesta. Si el límite se acercara solo
 * con los intentos que chocan, el propio aviso delataría que esos correos existen.
 *
 * Montaje, y por qué:
 *  - Actores frescos por caso (`createBypassActor('owner', ...)`): el store del
 *    limiter es `memory` y VIVE EN EL PROCESO, así que cada caso necesita su
 *    propio `user_id` (llave del sondeo y del piso) y su propia empresa (llave del
 *    techo por empresa). Un actor por caso impide que un test contamine a otro.
 *    Se usa el actor con salvoconducto (`owner`) por el mismo motivo que la spec
 *    hermana `person_email_response_parity.spec.ts`: con la exigencia del módulo
 *    encendida, un rol sin concesiones responde 403 antes de llegar a lo que este
 *    caso prueba. El salvoconducto no toca ninguno de los contadores.
 *  - `captureLogStore` (de `person_user_email_mirror_support.ts`) sustituye
 *    `LogStore.set` por un capturador en memoria: ni Mongo real, ni el temporizador
 *    de reconexión reteniendo el event loop.
 *  - Correos únicos por caso (`probe-<caso>-<stamp>-<i>@dominio.test`): las
 *    unicidades globales y el store `memory` persisten entre tests del mismo runner.
 *  - Los expedientes que "ocupan" un correo se siembran por modelo, NUNCA por HTTP:
 *    sembrar por la ruta consumiría la cuota del sondeo del actor sembrador.
 */

const PROBE_COLLECTION = 'log_person_email_probe'
const PROBE_429_KEY = 'demasiados-intentos-de-captura-de-correo'
const PROBE_429_CODE = 'PERSON.IDENTITY.006'
const SISTER_422_CODE = 'PERSON.IDENTITY.005'
/**
 * Umbrales y ventana LEÍDOS DE SU FUENTE (`app/helpers/person_email_probe_throttle.ts`),
 * nunca escritos a mano: el spec prueba la conducta, no congela los números. Si el
 * equipo mueve el corte, el spec sigue al código en vez de mentir en verde.
 */
const PROBE_LIMIT = PERSON_EMAIL_PROBE_RATE.requests
const PROBE_RETRY_AFTER = PERSON_EMAIL_PROBE_RATE.blockMinutes * 60
const WRITE_FLOOR_LIMIT = PERSON_WRITE_RATE.requests

/** Cabeceras del 429 del sondeo: `Retry-After` + las tres de RFC 6585. */
const RATE_LIMIT_HEADER_NAMES = [
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
] as const

/** El copy se lee de su fuente (no se congela aquí): el spec es la conducta, no el texto. */
const ES_CATALOG = JSON.parse(
  readFileSync(new URL('../../resources/langs/es.json', import.meta.url), 'utf8')
) as Record<string, string>

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const probeEmail = (label: string) => `probe-${label}-${uniqueStamp()}@dominio.test`

function probeRows(logs: CapturedLog[]): CapturedLog[] {
  return logs.filter((log) => log.collection === PROBE_COLLECTION)
}

async function postPerson(
  client: ApiClient,
  actor: TenantActor,
  payload: Record<string, unknown>
): Promise<ApiResponse> {
  return client
    .post('/api/persons')
    .headers(businessUnitHeaders(actor))
    .loginAs(actor.user)
    .json(payload)
}

async function putPerson(
  client: ApiClient,
  actor: TenantActor,
  personId: number,
  payload: Record<string, unknown>
): Promise<ApiResponse> {
  return client
    .put(`/api/persons/${personId}`)
    .headers(businessUnitHeaders(actor))
    .loginAs(actor.user)
    .json(payload)
}

/** DoD de cabeceras limpias: ni el 201 ni el 422 delatan un throttler. */
function assertNoRateLimitHeaders(assert: Assert, response: ApiResponse, label: string): void {
  for (const name of RATE_LIMIT_HEADER_NAMES) {
    assert.isUndefined(response.headers()[name], `${label} no debe traer ${name}`)
  }
}

/** El 429 del sondeo: cuerpo exacto, sin delatar, y con `Retry-After` + RFC 6585. */
function assertProbeRateLimited(assert: Assert, response: ApiResponse, probedEmail: string): void {
  assert.equal(response.status(), 429)
  const body = response.body() as Record<string, unknown>
  assert.deepEqual(Object.keys(body), ['title', 'detail', 'key', 'code'])
  assert.equal(body.key, PROBE_429_KEY)
  assert.equal(body.code, PROBE_429_CODE)
  assert.equal(body.title, ES_CATALOG.person_email_probe_rate_limited_title)
  assert.equal(body.detail, ES_CATALOG.person_email_probe_rate_limited_detail)
  const raw = JSON.stringify(body)
  // Ni el correo probado, ni la palabra que confirmaría su existencia, ni el contador topado.
  assert.notInclude(raw, probedEmail)
  assert.notInclude(raw, 'registrado')
  assert.notInclude(raw, 'sondeo')
  assert.equal(Number(response.headers()['x-ratelimit-limit']), PROBE_LIMIT)
  assert.equal(Number(response.headers()['x-ratelimit-remaining']), 0)
  assert.equal(Number(response.headers()['retry-after']), PROBE_RETRY_AFTER)
  assert.isString(response.headers()['x-ratelimit-reset'])
}

/**
 * Cuerpo sin la marca de tiempo del guardado: es el ÚNICO campo que cambia entre
 * dos ediciones idénticas del MISMO expediente. Todo lo demás debe coincidir byte
 * a byte, incluido el id —que aquí no se mueve porque el expediente es el mismo
 * en las dos corridas—. Se usa solo en la rama donde el byte a byte sí es
 * alcanzable; en las demás se compara la forma y se explica por qué.
 */
function withoutSaveTimestamp(body: unknown): string {
  const clone = JSON.parse(JSON.stringify(body)) as {
    data?: { person?: Record<string, unknown> }
  }
  if (clone.data?.person) delete clone.data.person.personUpdatedAt
  return JSON.stringify(clone)
}

test.group('Sondeo de correo por API — corte, bitácora y bordes (USRH1789762889970)', (group) => {
  const actors: TenantActor[] = []
  const personIds: number[] = []

  /** Actor con empresa y usuario propios: llaves de limiter únicas por caso. */
  async function freshActor(prefix: string): Promise<TenantActor> {
    const actor = await createBypassActor('owner', prefix)
    actors.push(actor)
    return actor
  }

  /** Anota la persona creada por el caso para que el teardown la borre ANTES de la empresa. */
  function trackPerson(response: ApiResponse): number | null {
    const personId = response.body()?.data?.person?.personId as number | undefined
    if (typeof personId === 'number') personIds.push(personId)
    return personId ?? null
  }

  /** Expediente que OCUPA un correo, sin pasar por HTTP (no consume cuota de nadie). */
  async function seedOccupiedEmail(businessUnitId: number, email: string): Promise<void> {
    const person = await Person.create({
      personFirstname: 'Probe',
      personLastname: 'Ocupado',
      personSecondLastname: `Ocupado${uniqueStamp()}`,
      personEmail: email,
      businessUnitId,
    })
    personIds.push(person.personId)
  }

  group.teardown(async () => {
    // Las personas primero, los actores después: cuelgan de `business_unit_id` con FK RESTRICT.
    if (personIds.length > 0) {
      await Person.query().withTrashed().whereIn('person_id', personIds).delete()
    }
    for (const actor of actors) {
      await cleanupTenantActor(actor)
    }
  })

  test('CA-1/CA-2/CA-3 — el corte llega en el 21º intento, no distingue libres de ocupados y la bitácora deja los tres desenlaces', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const stamp = uniqueStamp()

    // ── Guión MIXTO: 40 correos distintos, mitad libres y mitad ya ocupados por
    // expedientes sembrados. Es el caso del sondeo en serie (CA-1/CA-3).
    const mixed = await freshActor('probe-ca3-mixed')
    const mixedEmails = Array.from({ length: 40 }, (_, i) => `probe-ca3-${stamp}-${i}@dominio.test`)
    for (let i = 1; i < 40; i += 2) {
      await seedOccupiedEmail(mixed.businessUnit.businessUnitId, mixedEmails[i])
    }

    const mixedResponses: ApiResponse[] = []
    for (let i = 0; i < 40; i++) {
      const response = await postPerson(client, mixed, {
        personFirstname: 'Probe',
        personLastname: `Mixed${i}`,
        personEmail: mixedEmails[i],
      })
      mixedResponses.push(response)
      trackPerson(response)
    }

    // Los 20 primeros proceden con su respuesta estándar (201 el libre, 422 el
    // ocupado) y NINGUNO trae cabeceras de límite: el corte no delató nada todavía.
    for (let i = 0; i < 20; i++) {
      const isFree = i % 2 === 0
      assert.equal(
        mixedResponses[i].status(),
        isFree ? 201 : 422,
        `intento ${i + 1} (${isFree ? 'libre' : 'ocupado'})`
      )
      assertNoRateLimitHeaders(assert, mixedResponses[i], `intento ${i + 1}`)
    }
    // Del 21 en adelante TODOS responden el mismo 429, con `Retry-After`.
    for (let i = 20; i < 40; i++) {
      assertProbeRateLimited(assert, mixedResponses[i], mixedEmails[i])
      assert.equal(
        JSON.stringify(mixedResponses[i].body()),
        JSON.stringify(mixedResponses[20].body()),
        `el 429 del intento ${i + 1} debe ser idéntico al del 21`
      )
    }

    // ── La bitácora: 40 huellas del MISMO actor, con los TRES desenlaces.
    // Sin los aceptados, 40 intentos con pocos choques se verían igual que un
    // capturista honesto (regla dura del registro).
    const mixedRows = probeRows(logs).filter((log) => log.payload.actor_user_id === mixed.user.userId)
    assert.lengthOf(mixedRows, 40)
    const outcomes = mixedRows.map((log) => log.payload.outcome).sort()
    assert.deepEqual(
      [...new Set(outcomes)].sort(),
      ['accepted', 'rate_limited', 'rejected_not_available']
    )
    assert.lengthOf(mixedRows.filter((log) => log.payload.outcome === 'accepted'), 10)
    assert.lengthOf(
      mixedRows.filter((log) => log.payload.outcome === 'rejected_not_available'),
      10
    )
    assert.lengthOf(mixedRows.filter((log) => log.payload.outcome === 'rate_limited'), 20)

    // ── CA-2: otro actor hace 21 altas TODAS exitosas (correos libres válidos).
    // La 21ª responde el MISMO 429: el corte no distingue aciertos de fallos, y
    // ese es justo el oráculo que la HU prohíbe (contar solo los fallos).
    const allFree = await freshActor('probe-ca2-free')
    const freeEmails = Array.from({ length: 21 }, (_, i) => `probe-ca2-${stamp}-${i}@dominio.test`)
    const freeResponses: ApiResponse[] = []
    for (let i = 0; i < 21; i++) {
      const response = await postPerson(client, allFree, {
        personFirstname: 'Probe',
        personLastname: `Free${i}`,
        personEmail: freeEmails[i],
      })
      freeResponses.push(response)
      trackPerson(response)
    }
    for (let i = 0; i < 20; i++) {
      assert.equal(freeResponses[i].status(), 201, `alta libre ${i + 1}`)
    }
    const freeCutoff = freeResponses[20]
    assertProbeRateLimited(assert, freeCutoff, freeEmails[20])

    // Mismo punto de corte y MISMA respuesta que el guión mixto: byte a byte.
    assert.equal(JSON.stringify(freeCutoff.body()), JSON.stringify(mixedResponses[20].body()))
    assert.equal(freeCutoff.headers()['x-ratelimit-limit'], mixedResponses[20].headers()['x-ratelimit-limit'])
    assert.equal(freeCutoff.headers()['retry-after'], mixedResponses[20].headers()['retry-after'])
  })

  test('CA-5 — la operación diaria no se estorba: 15 altas sin correo (cero rastro) y 15 con correo libre (sin corte)', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const stamp = uniqueStamp()
    const actor = await freshActor('probe-ca5-silent')

    for (let i = 0; i < 15; i++) {
      const response = await postPerson(client, actor, {
        personFirstname: 'Probe',
        personLastname: `Silent${i}`,
      })
      assert.equal(response.status(), 201, `alta sin correo ${i + 1}`)
      assertNoRateLimitHeaders(assert, response, `alta sin correo ${i + 1}`)
      trackPerson(response)
    }

    // La operación diaria no se estorba y el correo ausente no es intento.
    assert.lengthOf(probeRows(logs), 0)

    // Y con correos LIBRES tampoco: 15 intentos están muy por debajo del corte
    // (20), así que ninguna alta se bloquea — el límite no estorba la captura
    // normal, solo el sondeo en serie.
    const withEmail = await freshActor('probe-ca5-free')
    for (let i = 0; i < 15; i++) {
      const response = await postPerson(client, withEmail, {
        personFirstname: 'Probe',
        personLastname: `FreeSilent${i}`,
        personEmail: `probe-ca5-free-${stamp}-${i}@dominio.test`,
      })
      assert.equal(response.status(), 201, `alta con correo libre ${i + 1}`)
      assertNoRateLimitHeaders(assert, response, `alta con correo libre ${i + 1}`)
      trackPerson(response)
    }
    const freeRows = probeRows(logs).filter(
      (log) => log.payload.actor_user_id === withEmail.user.userId
    )
    assert.lengthOf(freeRows, 15)
    assert.isTrue(freeRows.every((log) => log.payload.outcome === 'accepted'))
  })

  test('CA-10 — el correo vacío no es intento: ni cuota ni fila', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const actor = await freshActor('probe-ca10-empty')

    // '' y null llegan iguales (el body parser convierte '' en null); '   ' lo
    // recorta el propio guard. Ninguno es intento: no consume cuota ni se hashea
    // (`blindIndex('')` es una constante que envenenaría la colección).
    const empties: Array<string | null> = ['', null, '   ']
    for (const personEmail of empties) {
      const response = await postPerson(client, actor, {
        personFirstname: 'Probe',
        personLastname: 'Empty',
        personEmail,
      })
      assert.equal(response.status(), 201, `alta con personEmail ${JSON.stringify(personEmail)}`)
      assertNoRateLimitHeaders(assert, response, `alta con personEmail ${JSON.stringify(personEmail)}`)
      trackPerson(response)
    }

    assert.lengthOf(probeRows(logs), 0)
  })

  test('CA-6 — editar con el propio correo consume cuota y registra el desenlace con su target', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const actor = await freshActor('probe-ca6-edit')
    const email = probeEmail('ca6')

    // El expediente se siembra por modelo: la cuota que se mide aquí es la de las EDICIONES.
    const seeded = await Person.create({
      personFirstname: 'Probe',
      personLastname: 'Edit',
      personSecondLastname: `Edit${uniqueStamp()}`,
      personEmail: email,
      businessUnitId: actor.businessUnit.businessUnitId,
    })
    personIds.push(seeded.personId)

    const responses: ApiResponse[] = []
    for (let i = 0; i < 21; i++) {
      responses.push(
        await putPerson(client, actor, seeded.personId, {
          personFirstname: 'Probe',
          personLastname: 'Edit',
          personEmail: email,
        })
      )
    }

    // 20 ediciones con SU PROPIO correo proceden (201); la 21ª topa el sondeo.
    // Esto prueba que la edición CONSUME CUOTA igual que el alta: el límite no se
    // esquiva reenviando el correo que el expediente ya tiene.
    for (let i = 0; i < 20; i++) {
      assert.equal(responses[i].status(), 201, `edición ${i + 1}`)
      assertNoRateLimitHeaders(assert, responses[i], `edición ${i + 1}`)
    }
    assertProbeRateLimited(assert, responses[20], email)

    const rows = probeRows(logs).filter((log) => log.payload.actor_user_id === actor.user.userId)
    assert.lengthOf(rows, 21)
    assert.lengthOf(rows.filter((log) => log.payload.path === 'update'), 21)
    // Cada fila apunta al expediente que el actor editó (el suyo), nunca a un ajeno.
    for (const row of rows) {
      assert.equal(row.payload.target_person_id, seeded.personId)
    }
    assert.lengthOf(rows.filter((log) => log.payload.outcome === 'accepted'), 20)
    assert.lengthOf(rows.filter((log) => log.payload.outcome === 'rate_limited'), 1)
    assert.equal(rows[0].payload.outcome, 'accepted')
    assert.equal(rows[0].payload.path, 'update')
  })

  test('CA-8 — con Mongo caído la respuesta es idéntica y no hay excepción (las cuatro ramas)', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const stamp = uniqueStamp()
    const occupied = `probe-ca8-${stamp}@dominio.test`
    const seeder = await freshActor('probe-ca8-seed')
    await seedOccupiedEmail(seeder.businessUnit.businessUnitId, occupied)

    // `originalSet` es el capturador de `captureLogStore`; al restaurarlo se
    // vuelve a capturar, y el `cleanup` del helper restaura el original real.
    const originalSet = LogStore.set

    /**
     * "Mongo caído": el stub LANZA en TODA escritura y cuenta las de la bitácora
     * del sondeo. Contar es lo que deja asertar que la rama SÍ intentó registrar
     * —una rama que dejara de registrar en silencio pasaría el resto del caso—.
     */
    function mongoDown(): () => number {
      let probeAttempts = 0
      LogStore.set = async (collectionName: string) => {
        if (collectionName === PROBE_COLLECTION) probeAttempts += 1
        throw new Error('Mongo no disponible')
      }
      return () => probeAttempts
    }

    // ── 1/4 — ALTA RECHAZADA (`store`, correo ocupado): el 422 de la hermana.
    // Misma petición, una vez con Mongo caído y otra con el stub en no-op.
    const down = await freshActor('probe-ca8-down')
    const downProbeAttempts = mongoDown()
    const downResponse = await postPerson(client, down, {
      personFirstname: 'Probe',
      personLastname: 'Caido',
      personEmail: occupied,
    })
    LogStore.set = originalSet
    assert.equal(downProbeAttempts(), 1, 'la rama rechazada del alta SÍ intentó registrar')

    const up = await freshActor('probe-ca8-up')
    const upResponse = await postPerson(client, up, {
      personFirstname: 'Probe',
      personLastname: 'Caido',
      personEmail: occupied,
    })

    // La bitácora es de apoyo: un fallo al escribirla JAMÁS cambia la respuesta.
    assert.equal(downResponse.status(), upResponse.status())
    assert.equal(downResponse.status(), 422)
    assert.equal(JSON.stringify(downResponse.body()), JSON.stringify(upResponse.body()))
    for (const name of RATE_LIMIT_HEADER_NAMES) {
      assert.equal(downResponse.headers()[name], upResponse.headers()[name], `cabecera ${name}`)
    }
    // Y el stub lanzando no capturó ninguna fila: el registro no se completó.
    assert.lengthOf(probeRows(logs), 1)

    // ── 2/4 — ALTA ACEPTADA (`store`, correo libre): sigue 201.
    //
    // POR QUÉ AQUÍ NO HAY COMPARACIÓN BYTE A BYTE: repetir la MISMA alta exitosa
    // es imposible por la unicidad GLOBAL del correo (el segundo intento con el
    // mismo correo responde 422), así que la referencia se toma con OTRO correo
    // libre y se comparan la forma y los campos no volátiles. El try/catch ÚNICO
    // de `PersonEmailProbeLogService.log` es el mismo para las cuatro ramas: que
    // esta alta no se caiga demuestra que ninguna de las otras tampoco.
    const downFreeProbeAttempts = mongoDown()
    const downFree = await postPerson(client, down, {
      personFirstname: 'Probe',
      personLastname: 'CaidoLibre',
      personEmail: probeEmail('ca8-free-down'),
    })
    LogStore.set = originalSet
    assert.equal(downFreeProbeAttempts(), 1, 'la rama aceptada del alta SÍ intentó registrar')
    assert.equal(downFree.status(), 201)
    trackPerson(downFree)

    // Y su forma es la misma que con el stub en no-op: los campos volátiles (el id
    // y las fechas del expediente recién creado) no pueden coincidir porque son
    // otra fila; todo lo demás, sí. La comparación byte a byte no aplica aquí:
    // una alta con correo libre solo puede dar 201 una vez.
    const upFree = await postPerson(client, up, {
      personFirstname: 'Probe',
      personLastname: 'CaidoLibre',
      personEmail: probeEmail('ca8-free-up'),
    })
    assert.equal(upFree.status(), 201)
    trackPerson(upFree)
    assert.deepEqual(Object.keys(downFree.body()), Object.keys(upFree.body()))
    assert.deepEqual(
      Object.keys(downFree.body().data.person),
      Object.keys(upFree.body().data.person)
    )
    assert.equal(
      downFree.body().data.person.personFirstname,
      upFree.body().data.person.personFirstname
    )
    assert.equal(
      downFree.body().data.person.personLastname,
      upFree.body().data.person.personLastname
    )

    // ── EDICIÓN (`update`): las dos ramas que el ALTA no ejercita. Expediente
    // propio por actor, sembrado por MODELO: el sondeo debe contar la EDICIÓN, no
    // la siembra.
    const downTarget = await Person.create({
      personFirstname: 'Probe',
      personLastname: 'CaidoEdicion',
      personSecondLastname: `CaidoEdicion${uniqueStamp()}`,
      personEmail: probeEmail('ca8-edit-down'),
      businessUnitId: down.businessUnit.businessUnitId,
    })
    personIds.push(downTarget.personId)
    const upTarget = await Person.create({
      personFirstname: 'Probe',
      personLastname: 'CaidoEdicion',
      personSecondLastname: `CaidoEdicion${uniqueStamp()}`,
      personEmail: probeEmail('ca8-edit-up'),
      businessUnitId: up.businessUnit.businessUnitId,
    })
    personIds.push(upTarget.personId)

    // ── 3/4 — EDICIÓN RECHAZADA (correo ocupado): el 422 de la hermana.
    const downEditRejectedAttempts = mongoDown()
    const downEditRejected = await putPerson(client, down, downTarget.personId, {
      personFirstname: 'Probe',
      personLastname: 'CaidoEdicion',
      personEmail: occupied,
    })
    LogStore.set = originalSet
    assert.equal(downEditRejectedAttempts(), 1, 'la rama rechazada de la edición SÍ intentó registrar')
    assert.equal(downEditRejected.status(), 422)

    const upEditRejected = await putPerson(client, up, upTarget.personId, {
      personFirstname: 'Probe',
      personLastname: 'CaidoEdicion',
      personEmail: occupied,
    })
    assert.equal(upEditRejected.status(), 422)
    // Byte a byte: el 422 de la hermana no lleva ni un dato del expediente, así
    // que dos expedientes distintos responden EXACTAMENTE lo mismo.
    assert.equal(JSON.stringify(downEditRejected.body()), JSON.stringify(upEditRejected.body()))
    for (const name of RATE_LIMIT_HEADER_NAMES) {
      assert.equal(
        downEditRejected.headers()[name],
        upEditRejected.headers()[name],
        `cabecera ${name} del rechazo de la edición`
      )
    }

    // ── 4/4 — EDICIÓN ACEPTADA: sigue 201.
    // Aquí el byte a byte SÍ es alcanzable: la MISMA petición (mismo expediente,
    // mismo cuerpo) se corre dos veces, una con Mongo caído y otra con el stub en
    // no-op, y la edición no crea filas nuevas. El único campo que se mueve en
    // cada guardado es la marca de tiempo, que se descarta al comparar.
    const acceptedEdit = {
      personFirstname: 'Probe',
      personLastname: 'CaidoEditado',
      personEmail: downTarget.personEmail,
    }
    const downEditOkAttempts = mongoDown()
    const downEditOk = await putPerson(client, down, downTarget.personId, acceptedEdit)
    LogStore.set = originalSet
    assert.equal(downEditOkAttempts(), 1, 'la rama aceptada de la edición SÍ intentó registrar')
    assert.equal(downEditOk.status(), 201)

    const upEditOk = await putPerson(client, down, downTarget.personId, acceptedEdit)
    assert.equal(upEditOk.status(), 201)
    assert.equal(withoutSaveTimestamp(downEditOk.body()), withoutSaveTimestamp(upEditOk.body()))
    // Y el cuerpo es el del expediente editado, no un envoltorio raro.
    assert.equal(downEditOk.body().data.person.personId, downTarget.personId)
    assert.equal(downEditOk.body().data.person.personFirstname, 'Probe')
    assert.equal(downEditOk.body().data.person.personLastname, 'CaidoEditado')
  })

  test('CA-7 — la fila capturada no lleva el correo, ni el titular, ni el expediente ajeno', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const actor = await freshActor('probe-ca7-inspect')
    const email = probeEmail('ca7')

    const response = await postPerson(client, actor, {
      personFirstname: 'Probe',
      personLastname: 'Inspeccion',
      personEmail: email,
    })
    assert.equal(response.status(), 201)
    trackPerson(response)

    const rows = probeRows(logs)
    assert.lengthOf(rows, 1)
    const row = rows[0].payload
    // Exactamente las 7 llaves del contrato (N8): nada más, nada menos.
    assert.deepEqual(Object.keys(row).sort(), [
      'actor_user_id',
      'business_unit_scope',
      'date',
      'email_hash',
      'outcome',
      'path',
      'target_person_id',
    ])
    assert.equal(row.path, 'store')
    assert.equal(row.outcome, 'accepted')
    assert.equal(row.actor_user_id, actor.user.userId)
    assert.deepEqual(row.business_unit_scope, [actor.businessUnit.businessUnitId])
    assert.isNull(row.target_person_id)
    assert.isString(row.date)
    // El hash es el índice ciego del correo (mismo que persiste `people`), nunca el correo.
    assert.equal(row.email_hash, blindIndex(email))

    const raw = JSON.stringify(row)
    assert.notInclude(raw, email)
    // Solo `target_person_id` (propio o null) y `business_unit_scope` (del actor):
    // ni el `person_id` del titular colisionado, ni su empresa, ni su nombre.
    assert.notInclude(raw, '"person_id"')
    assert.notInclude(raw, '"business_unit_id"')
    assert.notInclude(raw, 'Inspeccion')
    assert.notInclude(raw, actor.person.personFirstname)
  })

  test('CA-12 — el piso de 40/min corta el guión automatizado sin tocar lectura ni borrado', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const actor = await freshActor('probe-ca12-floor')

    // 41 escrituras SIN personEmail: el sondeo no cuenta nada (no hay intento de
    // correo) y el corte, si llega, es del piso de ruta. El 41 cruza el umbral.
    const responses: ApiResponse[] = []
    const createdIds: Array<number | null> = []
    for (let i = 0; i < 41; i++) {
      const response = await postPerson(client, actor, {
        personFirstname: 'Probe',
        personLastname: `Floor${i}`,
      })
      responses.push(response)
      createdIds.push(trackPerson(response))
    }

    for (let i = 0; i < 40; i++) {
      assert.equal(responses[i].status(), 201, `escritura ${i + 1}`)
    }
    const blocked = responses[40]
    assert.equal(blocked.status(), 429)
    const body = blocked.body() as Record<string, unknown>
    assert.equal(body.key, PROBE_429_KEY)
    assert.equal(body.code, PROBE_429_CODE)
    // El 429 del piso describe SU límite (40/min), no el del sondeo (20/h): con
    // cero correos enviados, el contador del sondeo no pudo ser el que cortó.
    assert.equal(Number(blocked.headers()['x-ratelimit-limit']), WRITE_FLOOR_LIMIT)
    // Las tres de RFC 6585 completas + `Retry-After`, igual que el 429 del sondeo:
    // un 429 sin `X-RateLimit-Remaining` sería otra forma de respuesta, y la
    // forma también es un canal.
    assert.equal(Number(blocked.headers()['x-ratelimit-remaining']), 0)
    assert.isTrue(Number.isFinite(Number(blocked.headers()['retry-after'])))
    assert.isString(blocked.headers()['x-ratelimit-reset'])

    // El piso se monta SOLO en las escrituras: leer y borrar siguen abiertos.
    const list = await client
      .get('/api/persons')
      .qs({ page: 1, limit: 10 })
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
    assert.notEqual(list.status(), 429)
    assert.isBelow(list.status(), 500)

    const removed = await client
      .delete(`/api/persons/${createdIds[0]}`)
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
    assert.notEqual(removed.status(), 429)
    assert.isBelow(removed.status(), 500)

    // Sin personEmail no hubo intento de sondeo: cero huellas.
    assert.lengthOf(probeRows(logs), 0)
  })

  test('DoD de cabeceras — el 201 del alta y el 422 del PUT no traen X-RateLimit-*', async ({
    client,
    assert,
    cleanup,
  }) => {
    captureLogStore(cleanup)
    const actor = await freshActor('probe-headers')
    const seeder = await freshActor('probe-headers-seed')
    const occupied = probeEmail('headers-taken')
    await seedOccupiedEmail(seeder.businessUnit.businessUnitId, occupied)

    // 201 del alta exitosa: cabeceras limpias (el middleware del framework que
    // escribía X-RateLimit-* en TODA respuesta de la ruta está fuera; el piso se
    // consume programáticamente).
    const created = await postPerson(client, actor, {
      personFirstname: 'Probe',
      personLastname: 'Cabeceras',
      personEmail: probeEmail('headers-free'),
    })
    assert.equal(created.status(), 201)
    assertNoRateLimitHeaders(assert, created, '201 del alta')
    trackPerson(created)

    // 422 del PUT con un correo ocupado: sigue siendo el rechazo de la hermana
    // (PERSON.IDENTITY.005) y tampoco delata un throttler.
    const own = await postPerson(client, actor, {
      personFirstname: 'Probe',
      personLastname: 'Cabeceras',
      personEmail: probeEmail('headers-own'),
    })
    assert.equal(own.status(), 201)
    const ownId = trackPerson(own)
    assert.isNotNull(ownId)

    const rejected = await putPerson(client, actor, ownId!, {
      personFirstname: 'Probe',
      personLastname: 'Cabeceras',
      personEmail: occupied,
    })
    assert.equal(rejected.status(), 422)
    assert.equal(rejected.body()?.code, SISTER_422_CODE)
    assertNoRateLimitHeaders(assert, rejected, '422 del PUT')
  })
})
