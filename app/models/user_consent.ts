import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import User from '#models/user'
import LegalDocument from '#models/legal_document'
import Employee from '#models/employee'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'

/** Canal por el que se otorgó el consentimiento (USRH1784146205513). */
export type UserConsentChannel = 'digital' | 'physical'

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
 *
 * Canal físico (USRH1784146205513, migración 1784221190000): el consentimiento
 * biométrico firmado en papel se asienta contra la MISMA tabla, con `channel='physical'`.
 * `userId` pasó a nullable porque el empleado de kiosco puede no tener usuario
 * (`Employee` liga a `Person`, no a `User`); el ancla directa en ese caso es
 * `employeeId` (siempre presente en físico) y, además, `userId` si `employee.person.user`
 * existe (doble ancla — regla 8 de la HU). Ningún hook de update: write-once también
 * para las columnas nuevas.
 */
export default class UserConsent extends BaseModel {
  static table = 'user_consents'

  @column({ isPrimary: true })
  declare userConsentId: number

  /** Nullable desde el canal físico: el empleado de kiosco puede no tener usuario. */
  @column()
  declare userId: number | null

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
    serialize: sensitiveSerialize('UserConsent', 'userConsentIp'),
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
    serialize: sensitiveSerialize('UserConsent', 'userConsentUserAgent'),
  })
  declare userConsentUserAgent: string | null

  @column.dateTime()
  declare userConsentAcceptedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare userConsentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare userConsentUpdatedAt: DateTime | null

  /** Ancla directa del canal físico (regla 8); NULL en las aceptaciones digitales. */
  @column()
  declare employeeId: number | null

  /** `'digital'` (default, backfill implícito) o `'physical'` (USRH1784146205513). */
  @column()
  declare userConsentChannel: UserConsentChannel

  /** Usuario de RH que asentó el consentimiento físico; NULL en digital. */
  @column()
  declare userConsentRegisteredByUserId: number | null

  /**
   * Fecha en que el empleado firmó el papel. Capturada (opcional) o, en su defecto,
   * la fecha del asiento (decisión Wilvardo 2026-07-15). NULL en digital.
   */
  @column.date()
  declare userConsentSignedAt: DateTime | null

  /** Key S3 privada del escaneo firmado (nunca URL). NULL en digital. */
  @column()
  declare userConsentEvidenceFile: string | null

  /** Nombre original saneado del escaneo. NULL en digital. */
  @column()
  declare userConsentEvidenceOriginalName: string | null

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => LegalDocument, { foreignKey: 'legalDocumentId' })
  declare legalDocument: BelongsTo<typeof LegalDocument>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => User, { foreignKey: 'userConsentRegisteredByUserId' })
  declare registeredBy: BelongsTo<typeof User>
}
