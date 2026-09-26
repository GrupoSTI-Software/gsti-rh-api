import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import type BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import type User from '#models/user'
import { LogStore } from '#models/MongoDB/log_store'
import { blindIndex } from '#utils/blind_index'
import {
  PERSON_EMAIL_PROBE_BUSINESS_RATE,
  PERSON_EMAIL_PROBE_RATE,
  PERSON_WRITE_RATE,
} from '#helpers/person_email_probe_throttle'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassActor,
  createBypassUserInBusinessUnit,
  type TenantActor,
  type UnitUser,
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
/** El intento que cruza cada umbral: el corte llega en el umbral + 1. */
const PROBE_CUTOFF = PROBE_LIMIT + 1
const WRITE_FLOOR_CUTOFF = WRITE_FLOOR_LIMIT + 1
/** El guión doble del caso mixto: dos tandas del límite individual. */
const PROBE_LIMIT_DOUBLE = PROBE_LIMIT * 2
/**
 * Techo por EMPRESA del CA-4 (`PERSON_EMAIL_PROBE_BUSINESS_RATE`), leído de su
 * fuente y no copiado. Se usa en la desigualdad que documenta la desviación
 * declarada del CA-4 (ver el TSDoc del caso en el grupo 2).
 */
const BUSINESS_CEILING = PERSON_EMAIL_PROBE_BUSINESS_RATE.requests

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
    const mixedEmails = Array.from(
      { length: PROBE_LIMIT_DOUBLE },
      (_, i) => `probe-ca3-${stamp}-${i}@dominio.test`
    )
    for (let i = 1; i < PROBE_LIMIT_DOUBLE; i += 2) {
      await seedOccupiedEmail(mixed.businessUnit.businessUnitId, mixedEmails[i])
    }

    const mixedResponses: ApiResponse[] = []
    for (let i = 0; i < PROBE_LIMIT_DOUBLE; i++) {
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
    for (let i = 0; i < PROBE_LIMIT; i++) {
      const isFree = i % 2 === 0
      assert.equal(
        mixedResponses[i].status(),
        isFree ? 201 : 422,
        `intento ${i + 1} (${isFree ? 'libre' : 'ocupado'})`
      )
      assertNoRateLimitHeaders(assert, mixedResponses[i], `intento ${i + 1}`)
    }
    // Del 21 en adelante TODOS responden el mismo 429, con `Retry-After`.
    for (let i = PROBE_LIMIT; i < PROBE_LIMIT_DOUBLE; i++) {
      assertProbeRateLimited(assert, mixedResponses[i], mixedEmails[i])
      assert.equal(
        JSON.stringify(mixedResponses[i].body()),
        JSON.stringify(mixedResponses[PROBE_LIMIT].body()),
        `el 429 del intento ${i + 1} debe ser idéntico al del ${PROBE_CUTOFF}`
      )
    }

    // ── La bitácora: 40 huellas del MISMO actor, con los TRES desenlaces.
    // Sin los aceptados, 40 intentos con pocos choques se verían igual que un
    // capturista honesto (regla dura del registro).
    const mixedRows = probeRows(logs).filter((log) => log.payload.actor_user_id === mixed.user.userId)
    assert.lengthOf(mixedRows, PROBE_LIMIT_DOUBLE)
    const outcomes = mixedRows.map((log) => log.payload.outcome).sort()
    assert.deepEqual(
      [...new Set(outcomes)].sort(),
      ['accepted', 'rate_limited', 'rejected_not_available']
    )
    assert.lengthOf(
      mixedRows.filter((log) => log.payload.outcome === 'accepted'),
      PROBE_LIMIT / 2
    )
    assert.lengthOf(
      mixedRows.filter((log) => log.payload.outcome === 'rejected_not_available'),
      PROBE_LIMIT / 2
    )
    assert.lengthOf(
      mixedRows.filter((log) => log.payload.outcome === 'rate_limited'),
      PROBE_LIMIT
    )

    // ── CA-2: otro actor hace 21 altas TODAS exitosas (correos libres válidos).
    // La 21ª responde el MISMO 429: el corte no distingue aciertos de fallos, y
    // ese es justo el oráculo que la HU prohíbe (contar solo los fallos).
    const allFree = await freshActor('probe-ca2-free')
    const freeEmails = Array.from(
      { length: PROBE_CUTOFF },
      (_, i) => `probe-ca2-${stamp}-${i}@dominio.test`
    )
    const freeResponses: ApiResponse[] = []
    for (let i = 0; i < PROBE_CUTOFF; i++) {
      const response = await postPerson(client, allFree, {
        personFirstname: 'Probe',
        personLastname: `Free${i}`,
        personEmail: freeEmails[i],
      })
      freeResponses.push(response)
      trackPerson(response)
    }
    for (let i = 0; i < PROBE_LIMIT; i++) {
      assert.equal(freeResponses[i].status(), 201, `alta libre ${i + 1}`)
    }
    const freeCutoff = freeResponses[PROBE_LIMIT]
    assertProbeRateLimited(assert, freeCutoff, freeEmails[PROBE_LIMIT])

    // Mismo punto de corte y MISMA respuesta que el guión mixto: byte a byte.
    assert.equal(JSON.stringify(freeCutoff.body()), JSON.stringify(mixedResponses[PROBE_LIMIT].body()))
    assert.equal(
      freeCutoff.headers()['x-ratelimit-limit'],
      mixedResponses[PROBE_LIMIT].headers()['x-ratelimit-limit']
    )
    assert.equal(
      freeCutoff.headers()['retry-after'],
      mixedResponses[PROBE_LIMIT].headers()['retry-after']
    )
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
    for (let i = 0; i < PROBE_CUTOFF; i++) {
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
    for (let i = 0; i < PROBE_LIMIT; i++) {
      assert.equal(responses[i].status(), 201, `edición ${i + 1}`)
      assertNoRateLimitHeaders(assert, responses[i], `edición ${i + 1}`)
    }
    assertProbeRateLimited(assert, responses[PROBE_LIMIT], email)

    const rows = probeRows(logs).filter((log) => log.payload.actor_user_id === actor.user.userId)
    assert.lengthOf(rows, PROBE_CUTOFF)
    assert.lengthOf(
      rows.filter((log) => log.payload.path === 'update'),
      PROBE_CUTOFF
    )
    // Cada fila apunta al expediente que el actor editó (el suyo), nunca a un ajeno.
    for (const row of rows) {
      assert.equal(row.payload.target_person_id, seeded.personId)
    }
    assert.lengthOf(rows.filter((log) => log.payload.outcome === 'accepted'), PROBE_LIMIT)
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
    for (let i = 0; i < WRITE_FLOOR_CUTOFF; i++) {
      const response = await postPerson(client, actor, {
        personFirstname: 'Probe',
        personLastname: `Floor${i}`,
      })
      responses.push(response)
      createdIds.push(trackPerson(response))
    }

    for (let i = 0; i < WRITE_FLOOR_LIMIT; i++) {
      assert.equal(responses[i].status(), 201, `escritura ${i + 1}`)
    }
    const blocked = responses[WRITE_FLOOR_LIMIT]
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

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Grupo 2 — la carga masiva y el aislamiento del límite (CA-9 y CA-4)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Montaje propio, y por qué:
 *  - La carga masiva entra por `POST /api/employees/import-excel`, NO por
 *    `/api/persons`: es otra ruta y otro camino de registro (`path: 'import'`,
 *    Task 7). El archivo se fabrica con ExcelJS con las 26 cabeceras que el
 *    validador exige (`EmployeeService.validateExcelHeaders`,
 *    `app/services/employee_service.ts:3431`: las 25 de su lista más la detección
 *    de `ID Empleado`), no con las cinco obligatorias: con una cabecera de menos
 *    la API responde 400 `EMP.IMPORT.VAL_HEADERS`. Lo que el 200 con su `summary`
 *    prueba es que el VALIDADOR DE ENCABEZADOS ACEPTA este archivo, NO que el
 *    archivo sea la plantilla real: la plantilla real lleva 46 columnas
 *    (`generateEmployeeImportTemplate`, `:5207`) y este archivo cubre 26. Las 20
 *    restantes son opcionales para el validador y este caso no las necesita.
 *  - El correo "ya registrado" lo ocupa un expediente sembrado por MODELO en OTRA
 *    empresa: la unicidad del correo personal es GLOBAL, así que una consulta de
 *    existencia acotada a la empresa del actor (el mixin de tenant) leería ese
 *    correo como libre y el `outcome` de la bitácora mentiría.
 *  - Los expedientes que una fila ACTUALIZA se siembran por modelo, con su
 *    `ID Empleado` (la columna oculta de la plantilla): sembrarlos por HTTP
 *    consumiría cuota del sondeo y falsearía el caso.
 *  - Tres personas de la MISMA empresa exigen `createBypassUserInBusinessUnit` (un
 *    actor por empresa no alcanza): la llave del sondeo es el `user_id` y la del
 *    techo por empresa es la unidad, así que el caso necesita varias personas
 *    colgando de UNA unidad. Su limpieza va antes que la de la empresa, por la FK
 *    `users.person_id`.
 */

/**
 * Cabeceras que el validador exige, verbatim (mismo molde que
 * `tests/functional/services/employee_import_company_scope.spec.ts`). El ORDEN
 * solo importa en la PRIMERA celda: `validateExcelHeaders` decide la fila de
 * encabezados mirando `getCell(1)` (¿`ID Empleado` / `Identificador de nómina`?) y
 * el resto de las columnas las mapea POR NOMBRE (coincidencia exacta o difusa,
 * insensible a mayúsculas), no por posición.
 */
const IMPORT_TEMPLATE_HEADERS = [
  'ID Empleado',
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
  'Apellido materno del empleado',
  'Fecha de contratación (yyyy/mm/dd)',
  'Departamento',
  'Posición',
  'Salario diario',
  'Fecha de nacimiento (dd/mm/yyyy)',
  'CURP',
  'RFC',
  'NSS',
  'Correo empresa',
  'Correo personal',
  'Teléfono Empresa',
  'Teléfono Personal',
  'Modalidad de trabajo',
  '% Teletrabajo',
  'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia',
  'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia',
  'Teléfono contacto emergencia',
] as const

/** Una fila del archivo: alta (sin `ID Empleado`) o actualización (con él). */
interface ImportRowSpec {
  payrollNum: string
  firstName: string
  lastName: string
  personalEmail?: string
  employeeId?: number
}

/** Fabrica el `.xlsx` en memoria: cabeceras canónicas + una fila por renglón pedido. */
async function buildImportBuffer(unitName: string, rows: ImportRowSpec[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Empleados')
  sheet.addRow([...IMPORT_TEMPLATE_HEADERS])

  const put = (values: Array<string | number>, header: string, value: string | number) => {
    values[(IMPORT_TEMPLATE_HEADERS as readonly string[]).indexOf(header)] = value
  }

  for (const row of rows) {
    const values: Array<string | number> = IMPORT_TEMPLATE_HEADERS.map(() => '')
    if (row.employeeId !== undefined) put(values, 'ID Empleado', row.employeeId)
    put(values, 'Identificador de nómina', row.payrollNum)
    put(values, 'Unidad de negocio de trabajo', unitName)
    put(values, 'Unidad de negocio de nómina', unitName)
    put(values, 'Nombre del empleado', row.firstName)
    put(values, 'Apellido paterno del empleado', row.lastName)
    if (row.personalEmail !== undefined) put(values, 'Correo personal', row.personalEmail)
    sheet.addRow(values)
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/**
 * POST /api/persons con las cabeceras de una empresa concreta: el actor puede no
 * ser su dueño (varias personas comparten una empresa).
 */
async function postPersonInBusinessUnit(
  client: ApiClient,
  businessUnit: BusinessUnit,
  user: User,
  payload: Record<string, unknown>
): Promise<ApiResponse> {
  return client
    .post('/api/persons')
    .headers({ 'X-Business-Unit-Id': businessUnit.businessUnitPublicId })
    .loginAs(user)
    .json(payload)
}

test.group('Carga masiva y aislamiento del límite por actor (USRH1789762889970)', (group) => {
  const actors: TenantActor[] = []
  const unitUsers: UnitUser[] = []
  const personIds: number[] = []
  const unitIds: number[] = []

  /** Actor con empresa propia: el que sube el archivo o el dueño de la empresa ajena. */
  async function freshActor(prefix: string): Promise<TenantActor> {
    const actor = await createBypassActor('owner', prefix)
    actors.push(actor)
    unitIds.push(actor.businessUnit.businessUnitId)
    return actor
  }

  /** Persona EXTRA dentro de una empresa que el spec no creó: la empresa se queda. */
  async function freshUnitUser(prefix: string, businessUnit: BusinessUnit): Promise<UnitUser> {
    const unitUser = await createBypassUserInBusinessUnit(
      'owner',
      prefix,
      businessUnit.businessUnitId
    )
    unitUsers.push(unitUser)
    return unitUser
  }

  /** Anota la persona creada por el caso para que el teardown la borre antes que la empresa. */
  function trackPerson(response: ApiResponse): number | null {
    const personId = response.body()?.data?.person?.personId as number | undefined
    if (typeof personId === 'number') personIds.push(personId)
    return personId ?? null
  }

  /** Expediente que OCUPA un correo, sin pasar por HTTP (no consume cuota de nadie). */
  async function seedOccupiedEmail(businessUnitId: number, email: string): Promise<number> {
    const person = await Person.create({
      personFirstname: 'Probe',
      personLastname: 'Ocupado',
      personSecondLastname: `Ocupado${uniqueStamp()}`,
      personEmail: email,
      businessUnitId,
    })
    personIds.push(person.personId)
    return person.personId
  }

  /**
   * Empleado existente (con su expediente) para las filas que ACTUALIZAN. El
   * importador reconoce la actualización por `ID Empleado`, no por el número de
   * nómina, y la fila actualizada deja la bitácora con ESE expediente como objetivo.
   */
  async function seedEmployee(
    businessUnitId: number,
    label: string
  ): Promise<{ employeeId: number; personId: number }> {
    const stamp = uniqueStamp()
    const person = await Person.create({
      personFirstname: 'Probe',
      personLastname: `Carga${label}`,
      personSecondLastname: stamp.slice(0, 20),
      personEmail: `probe-import-seed-${label}-${stamp}@dominio.test`,
      businessUnitId,
    })
    personIds.push(person.personId)

    const employee = new Employee()
    employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
    employee.employeeCode = `IMP${label}${stamp.slice(-6)}`
    employee.employeeFirstName = 'Probe'
    employee.employeeLastName = `Carga${label}`
    employee.employeeSecondLastName = stamp.slice(0, 20)
    employee.employeePayrollNum = `IMP${label}${stamp.slice(-6)}`
    employee.employeeBusinessEmail = `probe-import-biz-${label}-${stamp}@dominio.test`
    employee.companyId = businessUnitId
    employee.personId = person.personId
    employee.businessUnitId = businessUnitId
    employee.payrollBusinessUnitId = businessUnitId
    employee.employeeTypeId = 1
    employee.departmentId = null
    employee.positionId = null
    employee.employeeTerminatedDate = null
    await employee.save()

    return { employeeId: employee.employeeId, personId: person.personId }
  }

  /** Sube el archivo como el actor dueño de la empresa: su usuario y su empresa viajan al rastro. */
  async function postImport(
    client: ApiClient,
    actor: TenantActor,
    buffer: Buffer
  ): Promise<ApiResponse> {
    return client
      .post('/api/employees/import-excel')
      .headers(businessUnitHeaders(actor))
      .loginAs(actor.user)
      .file('file', buffer, {
        filename: 'import.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
  }

  group.teardown(async () => {
    // Orden obligado por las FK (todas RESTRICT): empleados → usuarios prestados →
    // personas → empresa (que `cleanupTenantActor` borra al final).
    if (unitIds.length > 0) {
      const employees = await Employee.query()
        .withTrashed()
        .whereIn('business_unit_id', unitIds)
        .select('employee_id')
      const employeeIds = employees.map((employee) => employee.employeeId)
      if (employeeIds.length > 0) {
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await Employee.query().withTrashed().whereIn('employee_id', employeeIds).delete()
      }
    }

    for (const unitUser of unitUsers) {
      await cleanupUnitUser(unitUser)
    }

    // Las personas que dejó la carga masiva no se conocen por id (el 200 trae el
    // `summary`, no las filas): se borran todas las de esas empresas menos las de los
    // actores, que cuelgan de `users.person_id` y salen con `cleanupTenantActor`.
    const leftoverIds: number[] = []
    if (unitIds.length > 0) {
      const actorPersonIds = actors.map((actor) => actor.person.personId)
      const leftovers = await Person.query()
        .withTrashed()
        .whereIn('business_unit_id', unitIds)
        .whereNotIn('person_id', actorPersonIds.length > 0 ? actorPersonIds : [0])
        .select('person_id')
      for (const person of leftovers) leftoverIds.push(person.personId)
    }

    const idsToDelete = [...new Set([...personIds, ...leftoverIds])]
    if (idsToDelete.length > 0) {
      await Person.query().withTrashed().whereIn('person_id', idsToDelete).delete()
    }

    for (const actor of actors) {
      await cleanupTenantActor(actor)
    }
  })

  test('CA-9 — una fila de bitácora por fila del archivo con correo, con quién subió y desde qué empresa', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const stamp = uniqueStamp()
    const uploader = await freshActor('probe-ca9-uploader')
    const foreign = await freshActor('probe-ca9-foreign')

    // Un correo "ya registrado" por fila, para poder mapear fila del archivo ↔ fila
    // de bitácora por `email_hash`: con un correo repetido, dos filas del archivo
    // compartirían hash y el mapa mentiría.
    const takenOnCreate = `probe-ca9-taken-create-${stamp}@dominio.test`
    const takenOnUpdate = `probe-ca9-taken-update-${stamp}@dominio.test`
    await seedOccupiedEmail(foreign.businessUnit.businessUnitId, takenOnCreate)
    await seedOccupiedEmail(foreign.businessUnit.businessUnitId, takenOnUpdate)

    const editable = await seedEmployee(uploader.businessUnit.businessUnitId, 'Uno')
    const editableTaken = await seedEmployee(uploader.businessUnit.businessUnitId, 'Dos')

    const email = (label: string) => `probe-ca9-${label}-${stamp}@dominio.test`
    const fileRows = {
      createFreeA: email('create-a'),
      createFreeB: email('create-b'),
      createTaken: takenOnCreate,
      updateFree: email('update-free'),
      updateTaken: takenOnUpdate,
      createFreeC: email('create-c'),
    }

    const buffer = await buildImportBuffer(uploader.businessUnit.businessUnitName, [
      {
        payrollNum: `CA9A${stamp}`,
        firstName: 'Probe',
        lastName: 'AltaUno',
        personalEmail: fileRows.createFreeA,
      },
      {
        payrollNum: `CA9B${stamp}`,
        firstName: 'Probe',
        lastName: 'AltaDos',
        personalEmail: fileRows.createFreeB,
      },
      {
        payrollNum: `CA9C${stamp}`,
        firstName: 'Probe',
        lastName: 'AltaOcupada',
        personalEmail: fileRows.createTaken,
      },
      // Cuarta fila: SIN correo personal. No es intento y no debe dejar rastro.
      { payrollNum: `CA9D${stamp}`, firstName: 'Probe', lastName: 'AltaVacia' },
      {
        employeeId: editable.employeeId,
        payrollNum: `CA9E${stamp}`,
        firstName: 'Probe',
        lastName: 'EditaUno',
        personalEmail: fileRows.updateFree,
      },
      {
        employeeId: editableTaken.employeeId,
        payrollNum: `CA9F${stamp}`,
        firstName: 'Probe',
        lastName: 'EditaDos',
        personalEmail: fileRows.updateTaken,
      },
      // Séptima fila: la segunda sin correo.
      { payrollNum: `CA9G${stamp}`, firstName: 'Probe', lastName: 'AltaVaciaDos' },
      {
        payrollNum: `CA9H${stamp}`,
        firstName: 'Probe',
        lastName: 'AltaTres',
        personalEmail: fileRows.createFreeC,
      },
    ])

    const response = await postImport(client, uploader, buffer)
    assert.equal(response.status(), 200)
    // Ocho filas: seis ALTAS (dos de ellas sin correo) y dos ACTUALIZACIONES.
    assert.deepEqual(response.body()?.data?.summary, {
      totalRows: 8,
      processed: 8,
      created: 6,
      updated: 2,
      failed: 0,
      skipped: 0,
      limitReached: false,
    })
    assert.lengthOf(response.body()?.data?.rowErrors, 0)

    // ── La bitácora: UNA fila por cada fila del archivo con correo no vacío.
    const rows = probeRows(logs).filter((log) => log.payload.path === 'import')
    assert.lengthOf(rows, 6)
    // Las siete llaves del contrato (N8), también en este camino — y en TODAS las filas,
    // no solo en la primera: las filas del camino de ACTUALIZACIÓN (edición) no pasan por
    // el assert de `rows[0]` y una llave extra ahí pasaría inadvertida.
    const CONTRACT_KEYS = [
      'actor_user_id',
      'business_unit_scope',
      'date',
      'email_hash',
      'outcome',
      'path',
      'target_person_id',
    ]
    for (const [index, row] of rows.entries()) {
      assert.deepEqual(
        Object.keys(row.payload).sort(),
        CONTRACT_KEYS,
        `llaves del contrato en la fila ${index + 1}`
      )
    }
    // Quién SUBIÓ el archivo y desde qué empresa: el actor y SU scope, en las seis.
    for (const row of rows) {
      assert.equal(row.payload.actor_user_id, uploader.user.userId)
      assert.deepEqual(row.payload.business_unit_scope, [uploader.businessUnit.businessUnitId])
      assert.equal(row.payload.path, 'import')
      assert.isString(row.payload.date)
    }

    // El mapa fila del archivo → fila de bitácora es por `email_hash` (el correo en
    // claro NUNCA viaja): seis hashes distintos, uno por correo del archivo.
    const byHash = new Map(rows.map((row) => [row.payload.email_hash as string, row.payload]))
    assert.equal(byHash.size, 6)

    /** La fila del archivo con este correo dejó ESTE desenlace, con ESTE objetivo. */
    const expectRow = (probedEmail: string, outcome: string, targetPersonId: number | null) => {
      const row = byHash.get(blindIndex(probedEmail))
      assert.isDefined(row, `falta la fila de bitácora de la fila con desenlace ${outcome}`)
      assert.equal(row?.outcome, outcome)
      assert.equal(row?.target_person_id, targetPersonId)
      assert.equal(row?.email_hash, blindIndex(probedEmail))
    }

    // Las ALTAS: `target_person_id` null y el veredicto del sondeo, no el destino de la
    // fila (la carga masiva NO impone unicidad: guarda igual, también el correo tomado).
    expectRow(fileRows.createFreeA, 'accepted', null)
    expectRow(fileRows.createFreeB, 'accepted', null)
    expectRow(fileRows.createFreeC, 'accepted', null)
    expectRow(fileRows.createTaken, 'rejected_not_available', null)
    // Las ACTUALIZACIONES: el expediente tocado como objetivo (convenio del camino de
    // edición), que es lo que las distingue de las altas en la bitácora.
    expectRow(fileRows.updateFree, 'accepted', editable.personId)
    expectRow(fileRows.updateTaken, 'rejected_not_available', editableTaken.personId)

    assert.lengthOf(rows.filter((row) => row.payload.outcome === 'accepted'), 4)
    assert.lengthOf(rows.filter((row) => row.payload.outcome === 'rejected_not_available'), 2)

    // Las dos filas SIN correo (la cuarta y la séptima) no dejaron rastro: hashear el
    // vacío produce una constante que envenenaría la colección y agruparía a todo el que
    // captura sin correo. El aserto es sobre el hash exacto, no sobre el conteo.
    assert.notInclude(rows.map((row) => row.payload.email_hash), blindIndex(''))

    // Y el correo en claro no aparece en ninguna fila.
    const raw = JSON.stringify(rows.map((row) => row.payload))
    for (const value of Object.values(fileRows)) {
      assert.notInclude(raw, value)
    }

    // ── La carga masiva NO consume cuota del sondeo. Prueba directa: el MISMO actor que
    // acaba de dejar seis filas de `import` conserva ENTERA su cuota individual. Si el
    // importador hubiera contado esos intentos, el corte habría llegado en el intento 15
    // de esta tanda (20 - 6) y no en el 21.
    //
    // ALCANCE EXACTO de esta prueba, para no leerle más de lo que prueba:
    //  - Cubre el contador INDIVIDUAL del actor que sube; es CIEGA al contador por EMPRESA
    //    (`PERSON_EMAIL_PROBE_BUSINESS_RATE`, 200/hora): 6 filas de `import` —o incluso las
    //    21 capturas de esta tanda— apenas lo mueven de 200, así que por HTTP el efecto ahí
    //    es indistinguible.
    //  - Protege contra una llamada EXPLÍCITA al throttle dentro del importador (hoy el
    //    registro `path: 'import'` lo hace `PersonEmailProbeLogService.log` directo,
    //    `employee_service.ts:4052/4309`, sin pasar por `personEmailProbeGuard`). NO
    //    cubriría el caso de MONTAR el guard como middleware del import: el guard toma el
    //    correo de `ctx.request.input('personEmail')`, que en un multipart no trae el
    //    correo de la fila del archivo, así que saldría por el atajo de correo vacío sin
    //    consumir cuota y el aserto seguiría verde. Ese montaje no existe hoy; si algún día
    //    se montara, este caso no lo delataría.
    const captureEmails = Array.from(
      { length: PROBE_LIMIT },
      (_, i) => `probe-ca9-capture-${stamp}-${i}@dominio.test`
    )
    const captureResponses: ApiResponse[] = []
    for (let i = 0; i < PROBE_LIMIT; i++) {
      const captured = await postPerson(client, uploader, {
        personFirstname: 'Probe',
        personLastname: `Cuota${i}`,
        personEmail: captureEmails[i],
      })
      captureResponses.push(captured)
      trackPerson(captured)
    }
    for (let i = 0; i < PROBE_LIMIT; i++) {
      assert.equal(captureResponses[i].status(), 201, `captura ${i + 1} con la cuota intacta`)
      assertNoRateLimitHeaders(assert, captureResponses[i], `captura ${i + 1}`)
    }
    const cutoffEmail = `probe-ca9-capture-cut-${stamp}@dominio.test`
    const uploaderCutoff = await postPerson(client, uploader, {
      personFirstname: 'Probe',
      personLastname: 'CuotaCorte',
      personEmail: cutoffEmail,
    })
    assertProbeRateLimited(assert, uploaderCutoff, cutoffEmail)

    // El corte de esa tanda es el del sondeo (20/hora, `X-RateLimit-Limit` lo confirma
    // dentro de `assertProbeRateLimited`), no el del piso de escritura (40/min): la tanda
    // lleva 21 escrituras, muy por debajo del piso.
    const storeRows = probeRows(logs).filter(
      (log) => log.payload.actor_user_id === uploader.user.userId && log.payload.path === 'store'
    )
    assert.lengthOf(storeRows, PROBE_CUTOFF)
    assert.lengthOf(storeRows.filter((log) => log.payload.outcome === 'accepted'), PROBE_LIMIT)
    assert.lengthOf(storeRows.filter((log) => log.payload.outcome === 'rate_limited'), 1)
  })

  /**
   * CA-4 — el aislamiento del límite: POR PERSONA, no por empresa.
   *
   * DESVIACIÓN DECLARADA (dictamen de coordinación de la HU): el criterio CA-4 también
   * habla de un techo por EMPRESA de 200/hora (`PERSON_EMAIL_PROBE_BUSINESS_RATE`). Ese
   * techo NO se ejercita aquí por su costo: el límite individual es de 20/hora por
   * persona, así que harían falta DIEZ personas de la misma empresa topando su propio
   * límite para llegar justo al techo (10 × 20 = 200) y una UNDÉCIMA para que el corte de
   * empresa disparara en su primer intento. Un caso HTTP que lo alcanzara tendría que
   * fabricar once usuarios y ~200 peticiones —posible, pero desproporcionado para un
   * umbral que no corta, y con el riesgo de que alguien mueva el umbral para que el caso
   * pase—. Por eso:
   *  1. el techo por empresa se prueba donde SÍ es alcanzable: a nivel UNITARIO, contra
   *     su clase y su umbral real (Task 3,
   *     `tests/unit/helpers/person_email_probe_throttle.spec.ts`);
   *  2. aquí se cubre lo que el CA-4 SÍ puede demostrar por HTTP: tres personas de la
   *     MISMA empresa topan su límite individual con el mismo 429, la empresa NO queda
   *     topada (una cuarta persona suya sigue capturando), una empresa distinta captura
   *     sin fricción en el mismo momento, y la bitácora deja el conteo por PERSONA;
   *  3. la desigualdad que sostiene la desviación queda ASERTADA abajo
   *     (`topados.length * PROBE_LIMIT < BUSINESS_CEILING`): si algún día el límite
   *     individual sube o el techo de empresa baja hasta que se toquen, el aserto falla
   *     y obliga a revisar este caso.
   */
  test('CA-4 (parte demostrable) — tres personas de la misma empresa topadas por su límite no dejan sin operar a su empresa ni a otra', async ({
    client,
    assert,
    cleanup,
  }) => {
    const logs = captureLogStore(cleanup)
    const stamp = uniqueStamp()
    const companyA = await freshActor('probe-ca4-a')
    const companyB = await freshActor('probe-ca4-b')
    const topadoEmail = (index: number, attempt: number) =>
      `probe-ca4-${index}-${stamp}-${attempt}@dominio.test`

    // TRES personas de la MISMA empresa: cada una topa su propio contador.
    const topados = [
      await freshUnitUser('probe-ca4-a-uno', companyA.businessUnit),
      await freshUnitUser('probe-ca4-a-dos', companyA.businessUnit),
      await freshUnitUser('probe-ca4-a-tres', companyA.businessUnit),
    ]
    // La cuarta es de la misma empresa y no ha intentado nada: es la prueba de que la
    // empresa NO quedó topada.
    const fourth = await freshUnitUser('probe-ca4-a-cuarta', companyA.businessUnit)

    const cutBodies: string[] = []
    for (const [index, topado] of topados.entries()) {
      const responses: ApiResponse[] = []
      for (let i = 0; i < PROBE_CUTOFF; i++) {
        const response = await postPersonInBusinessUnit(
          client,
          companyA.businessUnit,
          topado.user,
          {
            personFirstname: 'Probe',
            personLastname: `Topado${index}${i}`,
            personEmail: topadoEmail(index, i),
          }
        )
        responses.push(response)
        trackPerson(response)
      }

      // Cada persona procede con SU límite individual y topa en el intento 21.
      for (let i = 0; i < PROBE_LIMIT; i++) {
        assert.equal(responses[i].status(), 201, `persona ${index + 1}, intento ${i + 1}`)
        assertNoRateLimitHeaders(assert, responses[i], `persona ${index + 1}, intento ${i + 1}`)
      }
      assertProbeRateLimited(assert, responses[PROBE_LIMIT], topadoEmail(index, PROBE_LIMIT))
      cutBodies.push(JSON.stringify(responses[PROBE_LIMIT].body()))
    }

    // Las tres reciben EXACTAMENTE el mismo corte: cuerpo byte a byte idéntico. El 429 del
    // sondeo es deliberadamente INDISTINGUIBLE entre contadores: el guard declara SIEMPRE
    // `PERSON_EMAIL_PROBE_RATE.requests` al responder, sin importar cuál de los dos
    // bloqueó (`person_email_probe_throttle.ts:187-191`, decisión en `:178`), y el emisor
    // lo documenta (`person_email_request_errors.ts:46-53`). Por eso el
    // `X-RateLimit-Limit: 20` que asserta `assertProbeRateLimited` NO prueba que el
    // contador que cortó sea el individual: lo que esa cabecera separa es el sondeo (20)
    // del piso de escritura (40), nunca un contador del otro.
    //
    // La prueba REAL de que el conteo es POR PERSONA es estructural, no de cabeceras: son
    // TRES usuarios DISTINTOS y cada uno agota sus 20 propias capturas aceptadas antes de
    // que su 21ª reciba el 429. Si el cubo fuera por EMPRESA con umbral 20, la SEGUNDA
    // persona habría topado en su PRIMER intento (el cubo compartido ya traía 20 de la
    // primera) y no lo hizo: sus 20 primeras pasaron con 201. Que cada una llene un
    // contador completo por separado ES el conteo individual; que las cuatro personas de
    // la empresa (las tres topadas y la cuarta) compartan el mismo `business_unit_scope`
    // en la bitácora confirma que el cubo que se llenó tres veces es el de cada persona,
    // no el de la unidad.
    assert.equal(new Set(cutBodies).size, 1)
    for (const body of cutBodies) {
      const parsed = JSON.parse(body) as Record<string, unknown>
      assert.equal(parsed.key, PROBE_429_KEY)
      assert.equal(parsed.code, PROBE_429_CODE)
    }

    // ── 1/3 La empresa no quedó topada: una cuarta persona de la MISMA empresa sigue
    // capturando con normalidad. Si el cubo fuera por empresa, ya estaría cortada: las
    // tres anteriores suman 60 intentos en el mismo minuto.
    const fourthResponse = await postPersonInBusinessUnit(
      client,
      companyA.businessUnit,
      fourth.user,
      {
        personFirstname: 'Probe',
        personLastname: 'Cuarta',
        personEmail: `probe-ca4-cuarta-${stamp}@dominio.test`,
      }
    )
    assert.equal(fourthResponse.status(), 201)
    assertNoRateLimitHeaders(assert, fourthResponse, 'la cuarta persona de la empresa cortada')
    trackPerson(fourthResponse)

    // ── 2/3 Una empresa DISTINTA captura sin fricción en el mismo momento: el corte de
    // una empresa no se contagia a otra.
    const otherResponse = await postPerson(client, companyB, {
      personFirstname: 'Probe',
      personLastname: 'OtraEmpresa',
      personEmail: `probe-ca4-otra-${stamp}@dominio.test`,
    })
    assert.equal(otherResponse.status(), 201)
    assertNoRateLimitHeaders(assert, otherResponse, 'la otra empresa')
    trackPerson(otherResponse)

    // ── 3/3 El conteo es por PERSONA: la bitácora lo deja por actor, con el scope de SU
    // empresa (el mismo para las tres topadas y para la cuarta, que no fue cortada).
    const rows = probeRows(logs)
    for (const [index, topado] of topados.entries()) {
      const own = rows.filter((log) => log.payload.actor_user_id === topado.user.userId)
      assert.lengthOf(own, PROBE_CUTOFF)
      assert.lengthOf(own.filter((log) => log.payload.outcome === 'accepted'), PROBE_LIMIT)
      assert.lengthOf(own.filter((log) => log.payload.outcome === 'rate_limited'), 1)
      assert.isTrue(
        own.every(
          (log) =>
            (log.payload.business_unit_scope as number[])[0] ===
            companyA.businessUnit.businessUnitId
        ),
        `las filas de la persona ${index + 1} llevan el scope de su empresa`
      )
    }

    const fourthRows = rows.filter((log) => log.payload.actor_user_id === fourth.user.userId)
    assert.lengthOf(fourthRows, 1)
    assert.equal(fourthRows[0].payload.outcome, 'accepted')
    assert.deepEqual(fourthRows[0].payload.business_unit_scope, [
      companyA.businessUnit.businessUnitId,
    ])

    const otherRows = rows.filter((log) => log.payload.actor_user_id === companyB.user.userId)
    assert.lengthOf(otherRows, 1)
    assert.equal(otherRows[0].payload.outcome, 'accepted')
    assert.deepEqual(otherRows[0].payload.business_unit_scope, [
      companyB.businessUnit.businessUnitId,
    ])

    // Solo las tres topadas dejaron un `rate_limited`: el corte de una persona no
    // arrastró a la cuarta ni a la otra empresa.
    assert.lengthOf(
      rows.filter((log) => log.payload.outcome === 'rate_limited'),
      topados.length
    )

    // ── La desviación, EJECUTABLE. Ver el TSDoc del caso.
    assert.isBelow(topados.length * PROBE_LIMIT, BUSINESS_CEILING)
  })
})
