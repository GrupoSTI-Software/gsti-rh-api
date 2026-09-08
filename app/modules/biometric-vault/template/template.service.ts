import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import PiiAccessLogService from '#services/pii_access_log_service'
import { validateTemplate } from './template_validation.js'
import TemplateRepositoryMysql from './template.repository.mysql.js'
import type {
  TemplateRepository,
  TemplateSlot,
  TemplateUpsert,
} from './template.repository.js'

/** Quien lee un biometrico. Sin esto no hay lectura. */
export interface TemplateReader {
  userId: number | null
  businessUnitId: number
  ip: string
  userAgent?: string | null
  requestId?: string | null
}

export interface StoreTemplateInput {
  employeeId: number
  businessUnitId: number
  bioType: number
  bioNo: number
  bioIndex: number
  bioFormat: number
  majorVer: string | null
  minorVer: string | null
  valid: number
  duress: number
  template: string
  sourceAccessPointId: number | null
  capturedAt: DateTime
}

export type StoreTemplateResult =
  | { ok: true; templateId: number; created: boolean }
  | { ok: false; reason: string }

/**
 * Custodia de biometricos (spec ADMS 7.1).
 *
 * Dos invariantes: nada entra sin validarse, y nada sale sin dejar rastro de
 * quien lo leyo.
 */
export default class TemplateService {
  constructor(
    private readonly repository: TemplateRepository = new TemplateRepositoryMysql(),
    private readonly piiAccessLog: PiiAccessLogService = new PiiAccessLogService()
  ) {}

  async store(input: StoreTemplateInput): Promise<StoreTemplateResult> {
    const validation = validateTemplate({ bioType: input.bioType, template: input.template })
    if (!validation.ok) return { ok: false, reason: validation.reason }

    const key = {
      employeeId: input.employeeId,
      bioType: input.bioType,
      bioNo: input.bioNo,
      bioIndex: input.bioIndex,
      bioFormat: input.bioFormat,
      majorVer: input.majorVer,
    }
    const existing = await this.repository.findByKey(key)

    const upsert: TemplateUpsert = {
      ...key,
      businessUnitId: input.businessUnitId,
      minorVer: input.minorVer,
      valid: input.valid,
      duress: input.duress,
      template: input.template,
      size: validation.size,
      sourceAccessPointId: input.sourceAccessPointId,
      capturedAt: input.capturedAt,
    }
    const row = await this.repository.upsert(upsert)

    return { ok: true, templateId: row.biometricTemplateId, created: existing === null }
  }

  /**
   * Unica via para sacar un blob de la boveda (spec 7.1).
   *
   * El acceso se asienta ANTES de descifrar y en la MISMA transaccion: si el
   * asiento falla, la lectura no ocurre. Sin usuario en sesion no se lee, ni
   * siquiera desde un proceso interno: un biometrico que se lee sin que conste
   * quien lo leyo es un biometrico sin custodia.
   */
  async readForReplication(
    templateId: number,
    reader: TemplateReader,
    trx: TransactionClientContract
  ): Promise<string> {
    if (reader.userId === null) {
      throw new BiometricVaultError(
        'No se puede leer un biometrico sin una sesion que lo respalde',
        BIOMETRIC_VAULT_ERROR_CODES.AUTHZ_NO_ACTOR,
        403,
        'lectura-sin-actor',
        'Toda lectura de un dato biometrico queda asentada a nombre de quien la hizo.'
      )
    }

    const row = await this.repository.findByIdForRead(templateId, trx)
    if (!row || row.biometricTemplateTemplate === null) {
      throw new BiometricVaultError(
        'El biometrico no existe o no se pudo descifrar',
        BIOMETRIC_VAULT_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'biometrico-no-encontrado'
      )
    }

    await this.piiAccessLog.record(
      {
        businessUnitId: reader.businessUnitId,
        accessorUserId: reader.userId,
        model: 'BiometricTemplate',
        modelColumn: 'biometricTemplateTemplate',
        recordId: row.biometricTemplateId,
        accessorIp: reader.ip,
        accessorUserAgent: reader.userAgent ?? null,
        requestId: reader.requestId ?? null,
      },
      trx
    )

    return row.biometricTemplateTemplate
  }

  /**
   * Template compatible con la version de algoritmo del equipo destino
   * (spec 7.4).
   *
   * Se compara la PARTE ENTERA de la version. Una version desconocida nunca es
   * compatible: la bateria midio `Return=-30` al empujar un template v10 a un
   * equipo v13, y sin version no se puede afirmar nada. Mandarlo "por si acaso"
   * gasta un comando y deja al colaborador creyendo que ya puede checar.
   */
  async findCompatible(
    employeeId: number,
    bioType: number,
    bioNo: number,
    targetVersion: string | null
  ): Promise<TemplateSlot | null> {
    if (targetVersion === null) return null
    const target = majorOf(targetVersion)
    if (target === null) return null

    const slots = await this.repository.findForEmployee(employeeId, bioType, bioNo)
    return (
      slots.find((slot) => {
        if (slot.majorVer === null) return false
        return majorOf(slot.majorVer) === target
      }) ?? null
    )
  }

  /** Que dedos y modalidades ya tienen dato, para confirmar una sobrescritura. */
  async occupiedSlots(employeeId: number): Promise<TemplateSlot[]> {
    return this.repository.listSlots(employeeId)
  }
}

/** Parte entera de una version de algoritmo: `13`, `13.2` y `13a` son la 13. */
export function majorOf(version: string): number | null {
  const match = /^(\d+)/.exec(version.trim())
  return match ? Number(match[1]) : null
}
