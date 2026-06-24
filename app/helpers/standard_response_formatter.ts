import { HttpContext } from '@adonisjs/core/http'

export class StandardResponseFormatter {
  /**
   * Format successful response with pagination
   */
  static success(
    response: HttpContext['response'],
    data: any,
    title: string,
    message: string,
    statusCode: number = 200
  ) {
    // If data has pagination (from Lucid paginate)
    if (data && data.meta && data.data) {
      return response.status(statusCode).json({
        type: 'success',
        title,
        message,
        data: {
          [this.getDataKey(title)]: {
            meta: {
              total: data.meta.total,
              perPage: data.meta.perPage,
              currentPage: data.meta.currentPage,
              lastPage: data.meta.lastPage,
              firstPage: 1,
              firstPageUrl: '/?page=1',
              lastPageUrl: '/?page=${data.meta.lastPage}',
              nextPageUrl: data.meta.currentPage < data.meta.lastPage ? '/?page=${data.meta.currentPage + 1}' : null,
              previousPageUrl: data.meta.currentPage > 1 ? '/?page=${data.meta.currentPage - 1}' : null
            },
            data: data.data
          }
        }
      })
    }

    // If data is a single object or array without pagination
    return response.status(statusCode).json({
      type: 'success',
      title,
      message,
      data: {
        [this.getDataKey(title)]: data
      }
    })
  }

  /**
   * Format error response
   */
  static error(
    response: HttpContext['response'],
    message: string,
    statusCode: number = 400,
    errorCode?: string
  ) {
    const body: Record<string, unknown> = {
      type: 'error',
      title: 'Error',
      message,
      data: null,
    }
    if (errorCode) {
      body.errorCode = errorCode
    }
    return response.status(statusCode).json(body)
  }

  /**
   * Get the appropriate data key based on title
   */
  private static getDataKey(title: string): string {
    const keyMap: { [key: string]: string } = {
      'Supply Types': 'supplyTypes',
      'Supply Characteristics': 'supplieCharacteristics',
      'Supply Characteristic Values': 'supplieCaracteristicValues',
      'Supplies': 'supplies',
      'Employee Supplies': 'employeeSupplies',
      'Supply Type': 'supplyType',
      'Supply Characteristic': 'supplieCaracteristic',
      'Supply Characteristic Value': 'supplieCaracteristicValue',
      'Supply': 'supplie',
      'Employee Supply': 'employeeSupply',
      'Branches': 'branchOffices',
      'Branch': 'branchOffice',
      'Branch Office Shift Quotas': 'quotas',
      'Employee Branch Office': 'employeeBranchOffice',
      'Employee Branch Offices': 'employeeBranchOffices',
      'Certifications': 'certifications',
      'Certification': 'certification',
      'Certification Categories': 'certificationCategories',
      'Questionnaire Applicability': 'questionnaireApplicability',
      'Questionnaire Applicabilities': 'questionnaireApplicabilities',
      'Questionnaire Application': 'questionnaireApplication',
      'Questionnaire Applications': 'questionnaireApplications',
      Instrumento: 'instrument',
      'Captura de respuestas': 'questionnaireApplicationResponse',
      'Objetivos de la ronda': 'targets',
      'Employee Lactation Periods': 'employeeLactationPeriods',
      'Employee Lactation Period': 'employeeLactationPeriod',
      'Employee Lactation Period Evidences': 'employeeLactationPeriodEvidences',
      'Employee Lactation Period Evidence': 'employeeLactationPeriodEvidence',
      'Employee Lactation Period Evidence Download': 'employeeLactationPeriodEvidenceDownload',
      'Employee Lactation Compliance Report': 'employeeLactationComplianceReport',
      'Employee Lactation Expiring Notifications': 'employeeLactationExpiringNotifications',
      'Employee Lactation Period Conflicts': 'employeeLactationPeriodConflicts',
      'Traumatic Event Reports': 'traumaticEventReports',
      'Traumatic Event Report': 'traumaticEventReport',
      'Traumatic Event Referrals': 'traumaticEventReferrals',
      'Traumatic Event Referral': 'traumaticEventReferral',
      'Traumatic Event Exams': 'traumaticEventExams',
      'Traumatic Event Exam': 'traumaticEventExam',
      'Traumatic Event Registry': 'traumaticEventRegistry',
      'Repse': 'repseRegistrations',
      'Repse Registrations': 'repseRegistrations',
      'Repse Registration': 'repseRegistration',
      'Repse Specialized Services': 'repseSpecializedServices',
      'Repse Specialized Service': 'repseSpecializedService',
      'Empresas Contratantes': 'empresasContratantes',
      'Empresa Contratante': 'empresaContratante',
      'Contratos de Servicios Especializados': 'contratosServiciosEspecializados',
      'Contrato de Servicios Especializados': 'contratoServicioEspecializado',
      'Documento del contrato': 'documentoContrato',
      'Asignaciones de Contrato Especializado': 'asignaciones',
      'Asignación de Contrato Especializado': 'asignacion',
    }

    return keyMap[title] || title.toLowerCase().replace(/\s+/g, '')
  }
}
