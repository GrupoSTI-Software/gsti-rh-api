import BiometricPhotoPublication, {
  PHOTO_PUBLICATION_STATUS,
} from '#models/biometric_photo_publication'
import { TenantContext } from '#utils/tenant_context'
import { ADMS_PHOTO_TOKEN_UNSCOPED_REASON } from './photo.constants.js'
import type {
  PhotoPublicationRepository,
  PublicationInsert,
} from './photo_publication.repository.js'

/** Adaptador Lucid de las publicaciones de foto. */
export default class PhotoPublicationRepositoryMysql implements PhotoPublicationRepository {
  async create(input: PublicationInsert): Promise<BiometricPhotoPublication> {
    const row = new BiometricPhotoPublication()
    row.businessUnitId = input.businessUnitId
    row.employeeId = input.employeeId
    row.accessPointId = input.accessPointId
    row.biometricPhotoPublicationTokenHash = input.tokenHash
    row.biometricPhotoPublicationPin = input.pin
    row.biometricPhotoPublicationDerivativeVersion = input.derivativeVersion
    row.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.PUBLISHED
    row.biometricPhotoPublicationExpiresAt = input.expiresAt
    row.biometricPhotoPublicationDownloadCount = 0
    await row.save()
    return row
  }

  async findByTokenHashUnscoped(tokenHash: string): Promise<BiometricPhotoPublication | null> {
    return TenantContext.runUnscoped(
      () =>
        BiometricPhotoPublication.query()
          .where('biometric_photo_publication_token_hash', tokenHash)
          .first(),
      ADMS_PHOTO_TOKEN_UNSCOPED_REASON
    )
  }

  async findById(publicationId: number): Promise<BiometricPhotoPublication | null> {
    return BiometricPhotoPublication.query()
      .where('biometric_photo_publication_id', publicationId)
      .first()
  }

  async findByIdUnscoped(publicationId: number): Promise<BiometricPhotoPublication | null> {
    return TenantContext.runUnscoped(
      () =>
        BiometricPhotoPublication.query()
          .where('biometric_photo_publication_id', publicationId)
          .first(),
      ADMS_PHOTO_TOKEN_UNSCOPED_REASON
    )
  }

  async findLiveByEmployee(employeeId: number): Promise<BiometricPhotoPublication[]> {
    return BiometricPhotoPublication.query()
      .where('employee_id', employeeId)
      .whereIn('biometric_photo_publication_status', [
        PHOTO_PUBLICATION_STATUS.PUBLISHED,
        PHOTO_PUBLICATION_STATUS.DOWNLOADED,
      ])
      .orderBy('biometric_photo_publication_id', 'asc')
  }

  async save(publication: BiometricPhotoPublication): Promise<void> {
    await publication.save()
  }
}
