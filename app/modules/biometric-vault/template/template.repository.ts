import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type BiometricTemplate from '#models/biometric_template'

export interface TemplateKey {
  employeeId: number
  bioType: number
  bioNo: number
  bioIndex: number
  bioFormat: number
  majorVer: string | null
}

export interface TemplateUpsert extends TemplateKey {
  businessUnitId: number
  minorVer: string | null
  valid: number
  duress: number
  template: string
  size: number
  sourceAccessPointId: number | null
  capturedAt: DateTime
}

/** Lo que se puede saber de un template sin descifrarlo. */
export interface TemplateSlot {
  templateId: number
  bioType: number
  bioNo: number
  majorVer: string | null
  capturedAt: DateTime
  /**
   * Equipo donde se capturo.
   *
   * La boveda guarda un dato por dedo y version, no uno por aparato, asi que
   * esta es la unica pista directa de en que equipo esta fisicamente. Los demas
   * lo tienen solo si se les replico.
   */
  sourceAccessPointId: number | null
}

/**
 * Metadatos del template sin el blob. Los repite el comando que se manda al
 * equipo: `duress` marca el dedo con el que alguien avisa de que lo estan
 * obligando, asi que inventarlo cambiaria el significado del dato.
 */
export interface TemplateDetail {
  templateId: number
  bioType: number
  bioNo: number
  bioIndex: number
  bioFormat: number
  majorVer: string | null
  minorVer: string | null
  valid: number
  duress: number
}

/** Puerto de la boveda. El blob solo sale por `findByIdForRead`. */
export interface TemplateRepository {
  findByKey(key: TemplateKey): Promise<BiometricTemplate | null>
  upsert(input: TemplateUpsert): Promise<BiometricTemplate>
  listSlots(employeeId: number): Promise<TemplateSlot[]>
  findForEmployee(employeeId: number, bioType: number, bioNo: number): Promise<TemplateSlot[]>
  /** Metadatos sin blob: no pasa por la bitacora porque no descifra nada. */
  findDetail(templateId: number): Promise<TemplateDetail | null>
  /** Lectura con blob. Solo la usa el servicio, y solo tras asentar el acceso. */
  findByIdForRead(
    templateId: number,
    trx?: TransactionClientContract
  ): Promise<BiometricTemplate | null>
}
