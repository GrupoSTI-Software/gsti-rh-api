import UserConsent from '#models/user_consent'
import type {
  InsertPhysicalConsentInput,
  PhysicalConsentRepository,
} from './physical_consent.repository.js'

/** Implementación Lucid del repositorio del slice `consent/physical`. */
export default class PhysicalConsentRepositoryMysql implements PhysicalConsentRepository {
  async findForEmployeeAndDocument(
    employeeId: number,
    userId: number | null,
    legalDocumentId: number
  ): Promise<UserConsent | null> {
    return UserConsent.query()
      .where('legal_document_id', legalDocumentId)
      .where((query) => {
        query.where('employee_id', employeeId)
        if (userId !== null) {
          query.orWhere('user_id', userId)
        }
      })
      .preload('registeredBy', (registeredByQuery) => registeredByQuery.preload('person'))
      .first()
  }

  async insertPhysicalConsent(input: InsertPhysicalConsentInput): Promise<UserConsent> {
    const record = new UserConsent()
    record.employeeId = input.employeeId
    record.userId = input.userId
    record.legalDocumentId = input.legalDocumentId
    record.userConsentDocumentVersion = input.documentVersion
    record.userConsentChannel = 'physical'
    record.userConsentRegisteredByUserId = input.registeredByUserId
    record.userConsentSignedAt = input.signedAt
    record.userConsentAcceptedAt = input.acceptedAt
    record.userConsentEvidenceFile = input.evidenceFile
    record.userConsentEvidenceOriginalName = input.evidenceOriginalName
    record.userConsentIp = input.ip
    record.userConsentUserAgent = input.userAgent
    await record.save()
    // Precarga aquí (no en el service): el service solo debe depender de la
    // INTERFAZ del repositorio, nunca de que el resultado sea una instancia Lucid
    // real con `.load()` disponible (permite fakes limpios en tests unitarios).
    await record.load('registeredBy', (registeredByQuery) => registeredByQuery.preload('person'))
    return record
  }

  async findPhysicalConsentForEmployee(
    userConsentId: number,
    employeeId: number
  ): Promise<UserConsent | null> {
    return UserConsent.query()
      .where('user_consent_id', userConsentId)
      .where('employee_id', employeeId)
      .where('user_consent_channel', 'physical')
      .first()
  }

  async findPhysicalConsentById(userConsentId: number): Promise<UserConsent | null> {
    return UserConsent.query()
      .where('user_consent_id', userConsentId)
      .where('user_consent_channel', 'physical')
      .preload('employee')
      .first()
  }
}
