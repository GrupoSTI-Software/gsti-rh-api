import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AccessPoint from '#models/access_point'
import Employee from '#models/employee'

/** Estados de una publicacion de foto (spec ADMS 7.3). */
export const PHOTO_PUBLICATION_STATUS = {
  /** Vive y el equipo puede descargarla. */
  PUBLISHED: 'published',
  /** Ya se descargo. Sigue sirviendo hasta vencer: el equipo puede reintentar. */
  DOWNLOADED: 'downloaded',
  /** Se le paso el plazo. */
  EXPIRED: 'expired',
  /** La retiro una persona: se apago el uso en dispositivos o cambio la foto. */
  WITHDRAWN: 'withdrawn',
} as const

export type PhotoPublicationStatus =
  (typeof PHOTO_PUBLICATION_STATUS)[keyof typeof PHOTO_PUBLICATION_STATUS]

/**
 * Permiso temporal para que UN checador descargue la foto de UN colaborador.
 *
 * El equipo no acepta que le empujemos la imagen; la va a buscar por una URL.
 * Esa URL es la unica puerta a la cara de una persona y no lleva sesion detras,
 * asi que el token se guarda HASHEADO: quien lea esta tabla -- un respaldo, un
 * volcado, una consulta de soporte -- no puede reconstruir el enlace.
 */
export default class BiometricPhotoPublication extends BaseModel {
  static table = 'biometric_photo_publications'

  @column({ isPrimary: true })
  declare biometricPhotoPublicationId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number

  @column()
  declare accessPointId: number

  /** sha256 del token en hexadecimal. El claro solo existe en el payload. */
  @column({ serializeAs: null })
  declare biometricPhotoPublicationTokenHash: string

  @column()
  declare biometricPhotoPublicationPin: string

  @column()
  declare biometricPhotoPublicationDerivativeVersion: number

  @column()
  declare biometricPhotoPublicationStatus: PhotoPublicationStatus

  @column.dateTime()
  declare biometricPhotoPublicationExpiresAt: DateTime

  @column.dateTime()
  declare biometricPhotoPublicationDownloadedAt: DateTime | null

  @column.dateTime()
  declare biometricPhotoPublicationWithdrawnAt: DateTime | null

  @column()
  declare biometricPhotoPublicationDownloadCount: number

  @column.dateTime({ autoCreate: true })
  declare biometricPhotoPublicationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare biometricPhotoPublicationUpdatedAt: DateTime

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => AccessPoint, { foreignKey: 'accessPointId' })
  declare accessPoint: BelongsTo<typeof AccessPoint>
}
