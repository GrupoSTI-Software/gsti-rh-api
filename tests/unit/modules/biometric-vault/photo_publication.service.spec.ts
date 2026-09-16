import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import PhotoPublicationService, {
  photoCorrelationKey,
  photoUrlFor,
} from '#modules/biometric-vault/photo/photo_publication.service'
import { PHOTO_PUBLICATION_STATUS } from '#models/biometric_photo_publication'
import { hashPhotoToken, isTokenShaped } from '#modules/biometric-vault/photo/photo_token'
import type BiometricPhotoPublication from '#models/biometric_photo_publication'
import type {
  PhotoPublicationRepository,
  PublicationInsert,
} from '#modules/biometric-vault/photo/photo_publication.repository'
import type { DeviceCommandPort, EnqueueCommandInput } from '#modules/device-commands/device_command_port'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function publicationOf(overrides: Partial<BiometricPhotoPublication> = {}): BiometricPhotoPublication {
  return {
    biometricPhotoPublicationId: 1,
    biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.PUBLISHED,
    biometricPhotoPublicationExpiresAt: NOW.plus({ hours: 1 }),
    biometricPhotoPublicationDownloadCount: 0,
    biometricPhotoPublicationDownloadedAt: null,
    ...overrides,
  } as BiometricPhotoPublication
}

function makeService(live: BiometricPhotoPublication[] = []) {
  const created: PublicationInsert[] = []
  const saved: BiometricPhotoPublication[] = []
  const enqueued: EnqueueCommandInput[] = []

  const repository: PhotoPublicationRepository = {
    async create(input) {
      created.push(input)
      return publicationOf({ biometricPhotoPublicationId: created.length })
    },
    async findByTokenHashUnscoped() {
      return null
    },
    async findById() {
      return null
    },
    async findByIdUnscoped() {
      return null
    },
    async findLiveByEmployee() {
      return live
    },
    async save(publication) {
      saved.push(publication)
    },
  }
  const commands = {
    async enqueue(input: EnqueueCommandInput) {
      enqueued.push(input)
      return { command: {}, created: true }
    },
  } as unknown as DeviceCommandPort

  return { service: new PhotoPublicationService(repository, commands), created, saved, enqueued }
}

const INPUT = {
  businessUnitId: 1,
  employeeId: 42,
  accessPointId: 12,
  accessPointEmployeeId: 5,
  pin: '1042',
  derivativeVersion: 3,
  requestedByUserId: 8,
  now: NOW,
}

test.group('Publicacion de la foto hacia un checador', () => {
  test('guarda el HASH del token, nunca el token', async ({ assert }) => {
    const { service, created } = makeService()
    const result = await service.publish(INPUT)

    assert.isTrue(isTokenShaped(result.token))
    assert.equal(created[0].tokenHash, hashPhotoToken(result.token))
    // Quien lea la tabla no puede reconstruir el enlace.
    assert.notEqual(created[0].tokenHash, result.token)
  })

  test('el comando lleva el token en la URL y el PIN como nombre del archivo', async ({
    assert,
  }) => {
    const { service, enqueued } = makeService()
    const result = await service.publish(INPUT)

    assert.equal(enqueued[0].kind, 'biophoto_write')
    assert.equal(enqueued[0].fields.url, photoUrlFor(result.token, '1042'))
    assert.include(enqueued[0].fields.url ?? '', result.token)
    assert.equal(enqueued[0].correlationKey, photoCorrelationKey('1042'))
    assert.equal(enqueued[0].biometricPhotoPublicationId, 1)
  })

  test('la publicacion nace con plazo de 24 horas', async ({ assert }) => {
    const { service, created } = makeService()
    await service.publish(INPUT)
    assert.equal(created[0].expiresAt.toISO(), NOW.plus({ hours: 24 }).toISO())
  })

  test('retirar cierra todas las publicaciones vivas del colaborador', async ({ assert }) => {
    const vivas = [publicationOf({ biometricPhotoPublicationId: 1 }), publicationOf({ biometricPhotoPublicationId: 2 })]
    const { service, saved } = makeService(vivas)
    const retiradas = await service.withdrawForEmployee(42, NOW)

    assert.equal(retiradas, 2)
    assert.equal(saved[0].biometricPhotoPublicationStatus, 'withdrawn')
    assert.equal(saved[0].biometricPhotoPublicationWithdrawnAt, NOW)
  })
})

test.group('Vigencia de una publicacion', () => {
  test('una publicacion viva y en plazo se puede descargar', ({ assert }) => {
    const { service } = makeService()
    assert.isTrue(service.isDownloadable(publicationOf(), NOW))
  })

  /**
   * El equipo puede reintentar la descarga: cortarle el segundo intento le
   * dejaria la foto a medias. Lo que cierra la puerta es el plazo, no el uso.
   */
  test('una ya descargada sigue sirviendo mientras no venza', ({ assert }) => {
    const { service } = makeService()
    const descargada = publicationOf({
      biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.DOWNLOADED,
    })
    assert.isTrue(service.isDownloadable(descargada, NOW))
  })

  test('una vencida no', ({ assert }) => {
    const { service } = makeService()
    const vencida = publicationOf({ biometricPhotoPublicationExpiresAt: NOW.minus({ minutes: 1 }) })
    assert.isFalse(service.isDownloadable(vencida, NOW))
  })

  test('una retirada tampoco, aunque le quede plazo', ({ assert }) => {
    const { service } = makeService()
    const retirada = publicationOf({
      biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.WITHDRAWN,
    })
    assert.isFalse(service.isDownloadable(retirada, NOW))
  })

  test('la descarga se cuenta y la primera fecha no se pisa', async ({ assert }) => {
    const { service, saved } = makeService()
    const publication = publicationOf()
    await service.markDownloaded(publication, NOW)
    await service.markDownloaded(publication, NOW.plus({ minutes: 5 }))

    assert.equal(saved[1].biometricPhotoPublicationDownloadCount, 2)
    assert.equal(saved[1].biometricPhotoPublicationDownloadedAt?.toISO(), NOW.toISO())
  })
})
