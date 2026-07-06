import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import User from '#models/user'
import LegalDocument from '#models/legal_document'

/**
 * Registro inmutable de la aceptación de un documento legal concreto (aviso de
 * privacidad, términos y condiciones o consentimiento biométrico), por versión.
 *
 * Sin soft delete por diseño: el registro es evidencia legal (LFPDPPP). Un usuario
 * tiene un asiento por cada documento-versión que acepta (USRH1783101935670): ya no
 * es "un sello por paquete", sino evidencia granular ligada a `legal_document_id`.
 *
 * `userConsentDocumentVersion` se conserva como evidencia legible (histórico), pero
 * la fuente de verdad de qué documento se aceptó es `legalDocumentId`, no la versión
 * en texto. Inmutable por convención de service: solo INSERT/fetchOrCreate, nunca UPDATE
 * de evidencia (la única excepción es el backfill de la migración 1783100000001, que
 * solo liga `legalDocumentId` a filas legadas sin tocar fecha/versión).
 */
export default class UserConsent extends BaseModel {
  static table = 'user_consents'

  @column({ isPrimary: true })
  declare userConsentId: number

  @column()
  declare userId: number

  @column()
  declare userConsentDocumentVersion: string

  /** Documento legal concreto aceptado (fuente de verdad; ver docblock de la clase). */
  @column()
  declare legalDocumentId: number

  /**
   * Dirección IP desde la que se registró la aceptación — cifrada AES-256-CBC en
   * reposo (LFPDPPP art. 3.VI, dato de contacto/origen). Fallo-CERRADO: si el
   * descifrado falla (APP_KEY rotada, dato corrupto), se responde `null`, NUNCA el
   * ciphertext en crudo (mismo patrón que `employee_emergency_contact.ts`).
   * No se usa en cláusulas WHERE de SQL ni para buscar/filtrar usuarios.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare userConsentIp: string | null

  /**
   * User-agent del dispositivo/navegador desde el que se registró la aceptación —
   * cifrado AES-256-CBC en reposo, mismo tratamiento fallo-CERRADO que `userConsentIp`.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare userConsentUserAgent: string | null

  @column.dateTime()
  declare userConsentAcceptedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare userConsentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userConsentUpdatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => LegalDocument, { foreignKey: 'legalDocumentId' })
  declare legalDocument: BelongsTo<typeof LegalDocument>
}
