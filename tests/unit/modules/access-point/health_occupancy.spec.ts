import { test } from '@japa/runner'
import { occupancyOf, type ModelCapacity } from '#modules/access-point/health/health.service'
import { ADMS_CAPACITY_SOURCE } from '#modules/access-point/health/health.constants'
import type AccessPointProfile from '#models/access_point_profile'

/**
 * Ocupacion del equipo: de donde sale cada maximo.
 *
 * El caso que lo motivo es real: el SpeedFace V5L del parque anuncia 20
 * checadas y 100 usuarios --topes por lote, no lo que le cabe-- y una barra
 * calculada con eso dice que el equipo esta lleno teniendo sitio de sobra.
 */
const perfil = (overrides: Record<string, number | null> = {}): AccessPointProfile =>
  ({
    accessPointProfileUserCount: 3,
    accessPointProfileMaxUserCount: 100,
    accessPointProfileFpCount: 4,
    accessPointProfileMaxFingerCount: 60,
    accessPointProfileFaceCount: 0,
    accessPointProfileMaxFaceCount: 6000,
    accessPointProfileTransactionCount: 1,
    accessPointProfileMaxAttLogCount: 20,
    ...overrides,
  }) as unknown as AccessPointProfile

const catalogo = (overrides: Partial<ModelCapacity> = {}): ModelCapacity => ({
  users: 3000,
  fingerprints: 3000,
  faces: 6000,
  transactions: 100000,
  ...overrides,
})

const slotDe = (slots: ReturnType<typeof occupancyOf>, modality: string) =>
  slots.find((slot) => slot.modality === modality)!

test.group('Ocupacion del equipo: de donde sale el maximo', () => {
  test('sin catalogo capturado manda lo que el equipo declaro', ({ assert }) => {
    const slots = occupancyOf(perfil(), null)

    const usuarios = slotDe(slots, 'users')
    assert.equal(usuarios.capacity, 100)
    assert.equal(usuarios.capacitySource, ADMS_CAPACITY_SOURCE.DECLARED)
  })

  /** Lo que teclea GSTI viene de la ficha del fabricante; el firmware, de un lote. */
  test('el catalogo gana sobre lo declarado por el equipo', ({ assert }) => {
    const slots = occupancyOf(perfil(), catalogo())

    const checadas = slotDe(slots, 'transactions')
    assert.equal(checadas.capacity, 100000, 'el 20 del firmware es un tope por lote')
    assert.equal(checadas.capacitySource, ADMS_CAPACITY_SOURCE.CATALOG)
    assert.equal(checadas.ratio, 1 / 100000)
  })

  test('el catalogo a medias solo pisa lo que tiene capturado', ({ assert }) => {
    const slots = occupancyOf(
      perfil(),
      catalogo({ users: null, fingerprints: null, faces: null })
    )

    assert.equal(slotDe(slots, 'users').capacitySource, ADMS_CAPACITY_SOURCE.DECLARED)
    assert.equal(slotDe(slots, 'users').capacity, 100)
    assert.equal(slotDe(slots, 'transactions').capacitySource, ADMS_CAPACITY_SOURCE.CATALOG)
  })

  /** Sigue en pie la regla del spec: sin dato no se inventa un maximo. */
  test('sin ninguna de las dos fuentes no se inventa un maximo', ({ assert }) => {
    const sinMaximos = perfil({
      accessPointProfileMaxUserCount: null,
      accessPointProfileMaxFingerCount: null,
      accessPointProfileMaxFaceCount: null,
      accessPointProfileMaxAttLogCount: null,
    })

    const slots = occupancyOf(sinMaximos, null)

    for (const slot of slots) {
      assert.isNull(slot.capacity)
      assert.equal(slot.capacitySource, ADMS_CAPACITY_SOURCE.UNKNOWN)
      assert.isNull(slot.ratio, 'sin maximo no hay porcentaje que pintar')
    }
  })

  test('sin perfil ni catalogo el equipo sigue apareciendo, con sus cuatro modalidades', ({
    assert,
  }) => {
    const slots = occupancyOf(null, null)

    assert.lengthOf(slots, 4)
    assert.deepEqual(
      slots.map((slot) => slot.modality),
      ['users', 'fingerprints', 'faces', 'transactions']
    )
  })

  test('un maximo en cero no divide: no hay porcentaje', ({ assert }) => {
    const slots = occupancyOf(perfil(), catalogo({ users: 0 }))

    assert.isNull(slotDe(slots, 'users').ratio)
  })
})
