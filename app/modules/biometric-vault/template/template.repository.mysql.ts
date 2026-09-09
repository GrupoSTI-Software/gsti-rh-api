import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BiometricTemplate from '#models/biometric_template'
import type {
  TemplateDetail,
  TemplateKey,
  TemplateRepository,
  TemplateSlot,
  TemplateUpsert,
} from './template.repository.js'

/** Verdadero si el choque es contra la UNIQUE del slot biometrico. */
function isDuplicate(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

function toSlot(row: BiometricTemplate): TemplateSlot {
  return {
    templateId: row.biometricTemplateId,
    bioType: row.biometricTemplateBioType,
    bioNo: row.biometricTemplateBioNo,
    majorVer: row.biometricTemplateMajorVer ?? null,
    capturedAt: row.biometricTemplateCapturedAt,
    sourceAccessPointId: row.sourceAccessPointId ?? null,
  }
}

/** Adaptador Lucid de la boveda. */
export default class TemplateRepositoryMysql implements TemplateRepository {
  async findByKey(key: TemplateKey): Promise<BiometricTemplate | null> {
    const query = BiometricTemplate.query()
      .where('employee_id', key.employeeId)
      .where('biometric_template_bio_type', key.bioType)
      .where('biometric_template_bio_no', key.bioNo)
      .where('biometric_template_bio_index', key.bioIndex)
      .where('biometric_template_bio_format', key.bioFormat)

    // `NULL` no se compara con `=`: una version desconocida es su propio slot.
    if (key.majorVer === null) query.whereNull('biometric_template_major_ver')
    else query.where('biometric_template_major_ver', key.majorVer)

    return query.first()
  }

  async upsert(input: TemplateUpsert): Promise<BiometricTemplate> {
    const existing = await this.findByKey(input)
    const row = existing ?? new BiometricTemplate()

    if (!existing) {
      row.employeeId = input.employeeId
      row.businessUnitId = input.businessUnitId
      row.biometricTemplateBioType = input.bioType
      row.biometricTemplateBioNo = input.bioNo
      row.biometricTemplateBioIndex = input.bioIndex
      row.biometricTemplateBioFormat = input.bioFormat
      row.biometricTemplateMajorVer = input.majorVer
    }

    row.biometricTemplateMinorVer = input.minorVer
    row.biometricTemplateValid = input.valid
    row.biometricTemplateDuress = input.duress
    row.biometricTemplateTemplate = input.template
    row.biometricTemplateSize = input.size
    row.sourceAccessPointId = input.sourceAccessPointId
    row.biometricTemplateCapturedAt = input.capturedAt

    try {
      await row.save()
      return row
    } catch (error) {
      /**
       * Un lote trae los dedos del mismo colaborador seguidos y el equipo
       * reintenta: otra subida pudo crear este slot entre la lectura y el alta.
       * La UNIQUE de la migracion 014 es la que manda; aqui se relee y se
       * actualiza. Sin esto el choque tiraba el lote entero.
       */
      if (!isDuplicate(error) || existing) throw error
      const winner = await this.findByKey(input)
      if (!winner) throw error
      return this.updateFrom(winner, input)
    }
  }

  /** Vuelca los campos mutables sobre la fila que gano la carrera. */
  private async updateFrom(row: BiometricTemplate, input: TemplateUpsert): Promise<BiometricTemplate> {
    row.biometricTemplateMinorVer = input.minorVer
    row.biometricTemplateValid = input.valid
    row.biometricTemplateDuress = input.duress
    row.biometricTemplateTemplate = input.template
    row.biometricTemplateSize = input.size
    row.sourceAccessPointId = input.sourceAccessPointId
    row.biometricTemplateCapturedAt = input.capturedAt
    await row.save()
    return row
  }

  async findDetail(templateId: number): Promise<TemplateDetail | null> {
    const row = await BiometricTemplate.query()
      .where('biometric_template_id', templateId)
      .first()
    if (!row) return null
    return {
      templateId: row.biometricTemplateId,
      bioType: row.biometricTemplateBioType,
      bioNo: row.biometricTemplateBioNo,
      bioIndex: row.biometricTemplateBioIndex,
      bioFormat: row.biometricTemplateBioFormat,
      majorVer: row.biometricTemplateMajorVer ?? null,
      minorVer: row.biometricTemplateMinorVer ?? null,
      valid: row.biometricTemplateValid,
      duress: row.biometricTemplateDuress,
    }
  }

  async listSlots(employeeId: number): Promise<TemplateSlot[]> {
    const rows = await BiometricTemplate.query()
      .where('employee_id', employeeId)
      .orderBy('biometric_template_bio_type', 'asc')
      .orderBy('biometric_template_bio_no', 'asc')
    return rows.map(toSlot)
  }

  async findForEmployee(
    employeeId: number,
    bioType: number,
    bioNo: number
  ): Promise<TemplateSlot[]> {
    const rows = await BiometricTemplate.query()
      .where('employee_id', employeeId)
      .where('biometric_template_bio_type', bioType)
      .where('biometric_template_bio_no', bioNo)
    return rows.map(toSlot)
  }

  async findByIdForRead(
    templateId: number,
    trx?: TransactionClientContract
  ): Promise<BiometricTemplate | null> {
    const query = trx
      ? BiometricTemplate.query({ client: trx })
      : BiometricTemplate.query()
    return query.where('biometric_template_id', templateId).first()
  }
}
