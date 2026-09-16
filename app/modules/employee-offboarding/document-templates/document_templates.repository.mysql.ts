import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import User from '#models/user'
import { DOCUMENT_TEMPLATE_STATUS } from './document_templates.constants.js'
import type {
  DocumentTemplatesRepository,
  DocumentTemplateVersionsPage,
  EmployeeOffboardingDocumentTemplateCreateData,
} from './document_templates.repository.js'

/**
 * Adaptador MySQL de las plantillas propias (USRH1788553841100). Único punto
 * del slice que toca Lucid. El filtro de empresa va EXPLÍCITO en cada
 * método (`business_unit_id`), sumado al del mixin cuando hay contexto: por
 * eso una fila ajena nunca queda hidratada en memoria.
 */
export default class DocumentTemplatesRepositoryMysql implements DocumentTemplatesRepository {
  async resolveCurrent(
    businessUnitId: number,
    documentType: string
  ): Promise<EmployeeOffboardingDocumentTemplate | null> {
    return await EmployeeOffboardingDocumentTemplate.query()
      .where('business_unit_id', businessUnitId)
      .where('employee_offboarding_document_template_document_type', documentType)
      .where('employee_offboarding_document_template_status', DOCUMENT_TEMPLATE_STATUS.CURRENT)
      .first()
  }

  async listVersions(
    businessUnitId: number,
    documentType: string,
    page: DocumentTemplateVersionsPage
  ): Promise<{ rows: EmployeeOffboardingDocumentTemplate[]; total: number }> {
    const base = EmployeeOffboardingDocumentTemplate.query()
      .where('business_unit_id', businessUnitId)
      .where('employee_offboarding_document_template_document_type', documentType)

    const totalRow = await base.clone().count('* as total').first()
    const rows = await base
      .clone()
      .orderBy('employee_offboarding_document_template_version_number', 'desc')
      .limit(page.limit)
      .offset((page.page - 1) * page.limit)

    return { rows, total: Number(totalRow?.$extras.total ?? 0) }
  }

  async findVersionInScope(
    businessUnitId: number,
    documentType: string,
    versionId: number
  ): Promise<EmployeeOffboardingDocumentTemplate | null> {
    return await EmployeeOffboardingDocumentTemplate.query()
      .where('employee_offboarding_document_template_id', versionId)
      .where('business_unit_id', businessUnitId)
      .where('employee_offboarding_document_template_document_type', documentType)
      .first()
  }

  async lockBusinessUnitRow(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<BusinessUnit | null> {
    // `withTrashed`: la fila padre se bloquea aunque la empresa esté borrada
    // lógicamente — el alcance ya la excluyó antes de llegar aquí.
    return await BusinessUnit.query({ client: trx })
      .withTrashed()
      .where('business_unit_id', businessUnitId)
      .forUpdate()
      .first()
  }

  async findMaxVersionNumber(
    businessUnitId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<number> {
    const row = await EmployeeOffboardingDocumentTemplate.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .where('employee_offboarding_document_template_document_type', documentType)
      .max('employee_offboarding_document_template_version_number as maxVersion')
      .first()
    return Number(row?.$extras.maxVersion ?? 0)
  }

  async markCurrentAsSuperseded(
    businessUnitId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<void> {
    await EmployeeOffboardingDocumentTemplate.query({ client: trx })
      .where('business_unit_id', businessUnitId)
      .where('employee_offboarding_document_template_document_type', documentType)
      .where('employee_offboarding_document_template_status', DOCUMENT_TEMPLATE_STATUS.CURRENT)
      .update({
        employee_offboarding_document_template_status: DOCUMENT_TEMPLATE_STATUS.SUPERSEDED,
        employee_offboarding_document_template_updated_at: DateTime.utc().toSQL({
          includeOffset: false,
        }),
      })
  }

  async createVersion(
    data: EmployeeOffboardingDocumentTemplateCreateData,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingDocumentTemplate> {
    return await EmployeeOffboardingDocumentTemplate.create(
      {
        businessUnitId: data.businessUnitId,
        employeeOffboardingDocumentTemplateDocumentType: data.documentType,
        employeeOffboardingDocumentTemplateVersionNumber: data.versionNumber,
        employeeOffboardingDocumentTemplateStatus: DOCUMENT_TEMPLATE_STATUS.CURRENT,
        employeeOffboardingDocumentTemplateStorageKey: data.storageKey,
        employeeOffboardingDocumentTemplateOriginalFileName: data.originalFileName,
        employeeOffboardingDocumentTemplateFileSizeBytes: data.fileSizeBytes,
        employeeOffboardingDocumentTemplateContentSha256: data.contentSha256,
        // Siempre null aquí: la revisión la registra ESB-05-07-08
        employeeOffboardingDocumentTemplateValidationResult: null,
        employeeOffboardingDocumentTemplateUploadedByUserId: data.uploadedByUserId,
      },
      { client: trx }
    )
  }

  async findUsersByIds(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return []
    // `withTrashed`: quien subió no pierde el nombre si se elimina después.
    return await User.query().withTrashed().whereIn('user_id', userIds).preload('person')
  }
}
