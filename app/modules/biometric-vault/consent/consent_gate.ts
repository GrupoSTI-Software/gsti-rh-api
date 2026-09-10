import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import ConsentGateRepositoryMysql from './consent_gate.repository.mysql.js'
import type { ConsentGateRepository, ConsentRecord } from './consent_gate.repository.js'

/**
 * Puerta de consentimiento biometrico (spec ADMS 7.5, decision D3).
 *
 * Cierra el paso a todo lo que mete un dato biometrico en un aparato: enrolar
 * una huella, publicar la foto, replicar entre equipos y enviar a un colaborador
 * con biometricos. Lo que el equipo empuja por su cuenta NO pasa por aqui: esa
 * huella ya se capturo y retenerla no la des-captura; y una BAJA tampoco, que
 * retirar el dato del aparato es justo lo que protege a la persona.
 *
 * Fail-closed (regla 13.9): sin documento vigente o sin firma, no se enrola.
 *
 * El consentimiento se ata al documento VIGENTE, no a cualquier version pasada.
 * Publicar un texto nuevo obliga a recabar la firma otra vez, que es lo que
 * significa consentir un texto concreto; el efecto operativo es que una version
 * nueva frena los enrolamientos hasta que la gente vuelva a firmar.
 */
export default class ConsentGate {
  constructor(private readonly repository: ConsentGateRepository = new ConsentGateRepositoryMysql()) {}

  /** Devuelve el asiento que autoriza, o lanza. Nunca devuelve `null`. */
  async assertGranted(employeeId: number): Promise<ConsentRecord> {
    const consent = await this.find(employeeId)
    if (consent.kind === 'no_document') {
      throw new BiometricVaultError(
        'No hay un consentimiento biometrico vigente que firmar',
        BIOMETRIC_VAULT_ERROR_CODES.CONSENT_NO_DOCUMENT,
        422,
        'consentimiento-sin-documento',
        'Publica la version vigente del consentimiento biometrico antes de enrolar a alguien.'
      )
    }
    if (consent.kind === 'missing') {
      throw new BiometricVaultError(
        'El colaborador no ha firmado el consentimiento biometrico',
        BIOMETRIC_VAULT_ERROR_CODES.CONSENT_MISSING,
        422,
        'consentimiento-faltante',
        'Recaba el consentimiento del colaborador, por la app o en papel, antes de registrar su biometrico.'
      )
    }
    return consent.record
  }

  /**
   * Consulta sin lanzar, para pintar el estado en pantalla. La puerta que
   * decide es `assertGranted`: nadie debe reimplementar la comprobacion.
   */
  async find(
    employeeId: number
  ): Promise<
    | { kind: 'granted'; record: ConsentRecord }
    | { kind: 'missing'; legalDocumentId: number }
    | { kind: 'no_document' }
  > {
    const legalDocumentId = await this.repository.findCurrentBiometricDocumentId()
    if (legalDocumentId === null) return { kind: 'no_document' }

    const record = await this.repository.findConsentFor(employeeId, legalDocumentId)
    if (!record) return { kind: 'missing', legalDocumentId }
    return { kind: 'granted', record }
  }
}
