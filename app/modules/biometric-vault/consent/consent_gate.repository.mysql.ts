import LegalDocument from '#models/legal_document'
import UserConsent from '#models/user_consent'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import type { ConsentGateRepository, ConsentRecord } from './consent_gate.repository.js'

/**
 * El documento legal es de la plataforma, no de una empresa: se lee sin corte
 * por empresa a proposito y solo devuelve un identificador, nunca contenido.
 */
const LEGAL_DOCUMENT_UNSCOPED_REASON =
  'consentimiento biometrico: el documento legal vigente es de la plataforma, no de una empresa'

/**
 * El asiento del consentimiento tampoco lleva empresa: cuelga de la persona.
 * El colaborador por el que se pregunta ya se resolvio dentro del scope.
 */
const CONSENT_UNSCOPED_REASON =
  'consentimiento biometrico: el asiento cuelga de la persona, no de la empresa'

export default class ConsentGateRepositoryMysql implements ConsentGateRepository {
  async findCurrentBiometricDocumentId(): Promise<number | null> {
    const document = await TenantContext.runUnscoped(
      () =>
        LegalDocument.query()
          .where('legal_document_type', 'biometric_consent')
          .where('legal_document_is_current', true)
          .select('legal_document_id')
          .first(),
      LEGAL_DOCUMENT_UNSCOPED_REASON
    )
    return document?.legalDocumentId ?? null
  }

  async findConsentFor(
    employeeId: number,
    legalDocumentId: number
  ): Promise<ConsentRecord | null> {
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .preload('person', (query) => query.preload('user'))
      .first()
    if (!employee) return null

    const userId = employee.person?.user?.userId ?? null

    const row = await TenantContext.runUnscoped(
      () =>
        UserConsent.query()
          .where('legal_document_id', legalDocumentId)
          .where((group) => {
            group.where('employee_id', employeeId)
            if (userId !== null) group.orWhere('user_id', userId)
          })
          .orderBy('user_consent_id', 'asc')
          .first(),
      CONSENT_UNSCOPED_REASON
    )
    if (!row) return null

    return {
      userConsentId: row.userConsentId,
      legalDocumentId: row.legalDocumentId,
      channel: row.userConsentChannel,
      grantedAt: row.userConsentAcceptedAt,
    }
  }
}
