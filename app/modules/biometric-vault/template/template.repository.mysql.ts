import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BiometricTemplate from '#models/biometric_template'
import type {
  TemplateKey,
  TemplateRepository,
  TemplateSlot,
  TemplateUpsert,
} from './template.repository.js'

function toSlot(row: BiometricTemplate): TemplateSlot {
  return {
    templateId: row.biometricTemplateId,
    bioType: row.biometricTemplateBioType,
    bioNo: row.biometricTemplateBioNo,
    majorVer: row.biometricTemplateMajorVer ?? null,
    capturedAt: row.biometricTemplateCapturedAt,
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
    await row.save()
    return row
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
