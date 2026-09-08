import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import PhotoDispatchService from '#modules/biometric-vault/photo/photo_dispatch.service'
import { PHOTO_PUBLICATION_STATUS } from '#models/biometric_photo_publication'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import { isTokenShaped } from '#modules/biometric-vault/photo/photo_token'
import type BiometricPhotoPublication from '#models/biometric_photo_publication'
import type DeviceCommand from '#models/device_command'
import type { PhotoPublicationRepository } from '#modules/biometric-vault/photo/photo_publication.repository'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function commandOf(): DeviceCommand {
  return {
    deviceCommandId: 1,
    deviceCommandKind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
    deviceCommandPin: '1042',
    deviceCommandPayload: 'DATA UPDATE BIOPHOTO PIN=1042\tType=9\tFormat=1\tUrl=viejo',
    biometricPhotoPublicationId: 7,
  } as DeviceCommand
}

function publicationOf(overrides: Partial<BiometricPhotoPublication> = {}): BiometricPhotoPublication {
  return {
    biometricPhotoPublicationId: 7,
    biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.PUBLISHED,
    biometricPhotoPublicationTokenHash: 'hash-viejo',
    biometricPhotoPublicationExpiresAt: NOW.plus({ hours: 20 }),
    biometricPhotoPublicationDownloadedAt: NOW.minus({ hours: 1 }),
    ...overrides,
  } as BiometricPhotoPublication
}

function makeService(publication: BiometricPhotoPublication | null) {
  const saved: BiometricPhotoPublication[] = []
  const repository = {
    async findById() {
      return publication
    },
    async save(row: BiometricPhotoPublication) {
      saved.push(row)
    },
  } as unknown as PhotoPublicationRepository
  return { service: new PhotoDispatchService(repository), saved }
}

test.group('La foto se pone al dia al despachar', () => {
  test('sale con un token nuevo, no con el que llevaba en la cola', async ({ assert }) => {
    const publication = publicationOf()
    const { service, saved } = makeService(publication)
    const payload = await service.refreshForDispatch(commandOf(), NOW)

    assert.isNotNull(payload)
    assert.notInclude(payload ?? '', 'Url=viejo')
    assert.notEqual(saved[0].biometricPhotoPublicationTokenHash, 'hash-viejo')

    const url = (payload ?? '').split('Url=')[1]
    const token = url.split('/')[3]
    assert.isTrue(isTokenShaped(token))
  })

  /**
   * Un enlace que estuvo horas en la cola no puede seguir sirviendo horas mas
   * una vez que viaja por la red del cliente.
   */
  test('el plazo se recorta a la ventana del despacho', async ({ assert }) => {
    const { service, saved } = makeService(publicationOf())
    await service.refreshForDispatch(commandOf(), NOW)
    assert.equal(
      saved[0].biometricPhotoPublicationExpiresAt.toISO(),
      NOW.plus({ minutes: 30 }).toISO()
    )
  })

  test('si a la publicacion le quedaba menos, se respeta lo que le quedaba', async ({ assert }) => {
    const casiVencida = publicationOf({ biometricPhotoPublicationExpiresAt: NOW.plus({ minutes: 5 }) })
    const { service, saved } = makeService(casiVencida)
    await service.refreshForDispatch(commandOf(), NOW)
    // Renovar el token no puede alargar un permiso que ya iba a cerrarse.
    assert.equal(
      saved[0].biometricPhotoPublicationExpiresAt.toISO(),
      NOW.plus({ minutes: 5 }).toISO()
    )
  })

  test('una publicacion ya vencida se revive con plazo nuevo y acotado', async ({ assert }) => {
    const vencida = publicationOf({ biometricPhotoPublicationExpiresAt: NOW.minus({ hours: 2 }) })
    const { service, saved } = makeService(vencida)
    const payload = await service.refreshForDispatch(commandOf(), NOW)

    assert.isNotNull(payload)
    assert.equal(
      saved[0].biometricPhotoPublicationExpiresAt.toISO(),
      NOW.plus({ minutes: 30 }).toISO()
    )
    assert.equal(saved[0].biometricPhotoPublicationStatus, 'published')
    // Y vuelve a contar como no descargada: es otro enlace.
    assert.isNull(saved[0].biometricPhotoPublicationDownloadedAt)
  })

  /**
   * Alguien apago la foto o la cambio mientras el comando esperaba. Mandarlo
   * escribiria en el equipo una cara que el sistema ya no autoriza.
   */
  test('una publicacion retirada cancela el envio', async ({ assert }) => {
    const retirada = publicationOf({
      biometricPhotoPublicationStatus: PHOTO_PUBLICATION_STATUS.WITHDRAWN,
    })
    const { service, saved } = makeService(retirada)
    assert.isNull(await service.refreshForDispatch(commandOf(), NOW))
    assert.lengthOf(saved, 0)
  })

  test('una publicacion que ya no existe tampoco sale', async ({ assert }) => {
    const { service } = makeService(null)
    assert.isNull(await service.refreshForDispatch(commandOf(), NOW))
  })

  test('un comando que no es de foto pasa sin tocarse', async ({ assert }) => {
    const { service, saved } = makeService(publicationOf())
    const otro = { ...commandOf(), deviceCommandKind: DEVICE_COMMAND_KIND.CHECK } as DeviceCommand
    assert.equal(await service.refreshForDispatch(otro, NOW), otro.deviceCommandPayload)
    assert.lengthOf(saved, 0)
  })
})
