import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import PhotoDownloadService from '#modules/biometric-vault/photo/photo_download.service'
import PhotoPublicationService from '#modules/biometric-vault/photo/photo_publication.service'
import { generatePhotoToken } from '#modules/biometric-vault/photo/photo_token'
import type BiometricPhotoPublication from '#models/biometric_photo_publication'
import type { PhotoPublicationRepository } from '#modules/biometric-vault/photo/photo_publication.repository'
import type UploadService from '#services/upload_service'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function makeService(publication: BiometricPhotoPublication | null) {
  let consultas = 0
  const repository = {
    async findByTokenHashUnscoped() {
      consultas += 1
      return publication
    },
  } as unknown as PhotoPublicationRepository
  const uploads = {} as unknown as UploadService
  return {
    service: new PhotoDownloadService(repository, new PhotoPublicationService(), uploads),
    consultas: () => consultas,
  }
}

test.group('Descarga de la foto por token', () => {
  /**
   * Probar rutas al azar no puede costar una consulta cada vez: la forma se
   * comprueba en memoria antes de tocar la base.
   */
  test('una ruta sin token con forma valida no llega a la base', async ({ assert }) => {
    const { service, consultas } = makeService(null)
    const outcome = await service.resolve('/iclock/doc/biophoto/1/9998.jpg', NOW)

    assert.equal(outcome.kind, 'not_found')
    assert.equal(consultas(), 0)
  })

  test('un token con forma valida pero desconocido responde lo mismo', async ({ assert }) => {
    const { service, consultas } = makeService(null)
    const outcome = await service.resolve(
      `/iclock/doc/biophoto/${generatePhotoToken()}/9998.jpg`,
      NOW
    )

    assert.equal(outcome.kind, 'not_found')
    assert.equal(consultas(), 1)
    // Desde fuera, "mal formado" y "desconocido" se ven identicos.
    if (outcome.kind === 'not_found') assert.isNull(outcome.publicationId)
  })

  test('una publicacion vencida no entrega nada', async ({ assert }) => {
    const vencida = {
      biometricPhotoPublicationId: 3,
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 42,
      biometricPhotoPublicationStatus: 'published',
      biometricPhotoPublicationExpiresAt: NOW.minus({ minutes: 1 }),
    } as BiometricPhotoPublication
    const { service } = makeService(vencida)
    const outcome = await service.resolve(
      `/iclock/doc/biophoto/${generatePhotoToken()}/9998.jpg`,
      NOW
    )

    assert.equal(outcome.kind, 'not_found')
    if (outcome.kind === 'not_found') assert.equal(outcome.reason, 'publication_not_live')
  })

  test('una retirada tampoco, aunque el plazo siga abierto', async ({ assert }) => {
    const retirada = {
      biometricPhotoPublicationId: 4,
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 42,
      biometricPhotoPublicationStatus: 'withdrawn',
      biometricPhotoPublicationExpiresAt: NOW.plus({ hours: 5 }),
    } as BiometricPhotoPublication
    const { service } = makeService(retirada)
    const outcome = await service.resolve(
      `/iclock/doc/biophoto/${generatePhotoToken()}/9998.jpg`,
      NOW
    )
    assert.equal(outcome.kind, 'not_found')
  })
})
