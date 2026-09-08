import type { DateTime } from 'luxon'
import type BiometricPhotoPublication from '#models/biometric_photo_publication'

export interface PublicationInsert {
  businessUnitId: number
  employeeId: number
  accessPointId: number
  tokenHash: string
  pin: string
  derivativeVersion: number
  expiresAt: DateTime
  now: DateTime
}

/** Puerto de las publicaciones de foto. El dominio no toca Lucid. */
export interface PhotoPublicationRepository {
  create(input: PublicationInsert): Promise<BiometricPhotoPublication>
  /**
   * Busca por HASH del token, no por el token: lo que se guarda es el hash.
   *
   * Se lee sin corte por empresa porque la peticion del equipo no trae sesion;
   * la empresa sale de la fila encontrada y con ella se abre el scope.
   */
  findByTokenHashUnscoped(tokenHash: string): Promise<BiometricPhotoPublication | null>
  findById(publicationId: number): Promise<BiometricPhotoPublication | null>
  /** Igual, pero sin corte: se usa desde el canal, que llega sin empresa. */
  findByIdUnscoped(publicationId: number): Promise<BiometricPhotoPublication | null>
  /** Publicaciones vivas de un colaborador, para retirarlas. */
  findLiveByEmployee(employeeId: number): Promise<BiometricPhotoPublication[]>
  save(publication: BiometricPhotoPublication): Promise<void>
}
