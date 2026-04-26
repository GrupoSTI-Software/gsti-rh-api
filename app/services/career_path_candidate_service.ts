import BusinessUnit from '#models/business_unit'
import CareerPathCandidate from '#models/career_path_candidate'
import CareerPathCandidateStatusHistory from '#models/career_path_candidate_status_history'
import Position from '#models/position'
import { I18n } from '@adonisjs/i18n'
import { CareerPathCandidateFilterSearchInterface } from 'app/interfaces/career_path_candidate_filter_search_interface.js'
import CareerPathCandidateStatusHistoryService from './career_path_candidate_status_history_service.js'
import CareerPathTemplate from '#models/career_path_template'
import UserResponsibleEmployee from '#models/user_responsible_employee'

export default class CareerPathCandidateService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: CareerPathCandidateFilterSearchInterface) {
    const careerPathCandidates = await CareerPathCandidate.query()
      .whereNull('career_path_candidate_deleted_at')
      .if(filters.originPositionId, (query) => {
        query.where('origin_position_id', filters.originPositionId)
      })
      .if(filters.targetPositionId, (query) => {
        query.where('target_position_id', filters.targetPositionId)
      })
      .preload('businessUnit')
      .preload('originPosition')
      .preload('targetPosition')
      .orderBy('career_path_candidate_id', 'desc')
    return careerPathCandidates
  }

  async create(careerPathCandidate: CareerPathCandidate) {
    const newCareerPathCandidate = new CareerPathCandidate()
    newCareerPathCandidate.businessUnitId = careerPathCandidate.businessUnitId
    newCareerPathCandidate.employeeId = careerPathCandidate.employeeId
    newCareerPathCandidate.originPositionId = careerPathCandidate.originPositionId
    newCareerPathCandidate.targetPositionId = careerPathCandidate.targetPositionId
    newCareerPathCandidate.careerPathCandidateIsOverride = careerPathCandidate.careerPathCandidateIsOverride
    newCareerPathCandidate.careerPathOverrideReasonId = careerPathCandidate.careerPathOverrideReasonId || null
    newCareerPathCandidate.careerPathCandidateJustification = careerPathCandidate.careerPathCandidateJustification
    newCareerPathCandidate.careerPathCandidateStatus = careerPathCandidate.careerPathCandidateStatus
    newCareerPathCandidate.proposedBy = careerPathCandidate.proposedBy
    newCareerPathCandidate.reviewedBy = careerPathCandidate.reviewedBy || null
    newCareerPathCandidate.careerPathCandidateReviewedAt = careerPathCandidate.careerPathCandidateReviewedAt
    newCareerPathCandidate.careerPathCandidateRejectionReason = careerPathCandidate.careerPathCandidateRejectionReason
    newCareerPathCandidate.careerPathCandidateActivatedAt = careerPathCandidate.careerPathCandidateActivatedAt
    newCareerPathCandidate.careerPathCandidateExpiresAt = careerPathCandidate.careerPathCandidateExpiresAt
    await newCareerPathCandidate.save()

    const careerPathCandidateStatusHistoryService = new CareerPathCandidateStatusHistoryService()
    const careerPathCandidateStatusHistory = {
      careerPathCandidateId: newCareerPathCandidate.careerPathCandidateId,
      changedBy: newCareerPathCandidate.proposedBy,
      careerPathCandidateStatusHistoryFromStatus: newCareerPathCandidate.careerPathCandidateStatus,
      careerPathCandidateStatusHistoryToStatus: newCareerPathCandidate.careerPathCandidateStatus,
      careerPathCandidateStatusHistoryReason: newCareerPathCandidate.careerPathCandidateJustification,
    } as CareerPathCandidateStatusHistory
    await careerPathCandidateStatusHistoryService.create(careerPathCandidateStatusHistory)

    return newCareerPathCandidate
  }

  async update(
    currentCareerPathCandidate: CareerPathCandidate,
    careerPathCandidate: CareerPathCandidate,
  ) {
    currentCareerPathCandidate.businessUnitId = careerPathCandidate.businessUnitId
    currentCareerPathCandidate.employeeId = careerPathCandidate.employeeId
    currentCareerPathCandidate.originPositionId = careerPathCandidate.originPositionId
    currentCareerPathCandidate.targetPositionId = careerPathCandidate.targetPositionId
    currentCareerPathCandidate.careerPathCandidateIsOverride = careerPathCandidate.careerPathCandidateIsOverride
    currentCareerPathCandidate.careerPathOverrideReasonId = careerPathCandidate.careerPathOverrideReasonId
    currentCareerPathCandidate.careerPathCandidateJustification = careerPathCandidate.careerPathCandidateJustification
    currentCareerPathCandidate.careerPathCandidateStatus = careerPathCandidate.careerPathCandidateStatus
    currentCareerPathCandidate.proposedBy = careerPathCandidate.proposedBy
    currentCareerPathCandidate.reviewedBy = careerPathCandidate.reviewedBy
    currentCareerPathCandidate.careerPathCandidateReviewedAt = careerPathCandidate.careerPathCandidateReviewedAt
    currentCareerPathCandidate.careerPathCandidateRejectionReason = careerPathCandidate.careerPathCandidateRejectionReason
    currentCareerPathCandidate.careerPathCandidateActivatedAt = careerPathCandidate.careerPathCandidateActivatedAt
    currentCareerPathCandidate.careerPathCandidateExpiresAt = careerPathCandidate.careerPathCandidateExpiresAt
    await currentCareerPathCandidate.save()

    const careerPathCandidateStatusHistoryService = new CareerPathCandidateStatusHistoryService()
    const careerPathCandidateStatusHistory = {
      careerPathCandidateId: currentCareerPathCandidate.careerPathCandidateId,
      changedBy: currentCareerPathCandidate.reviewedBy,
      careerPathCandidateStatusHistoryFromStatus: currentCareerPathCandidate.careerPathCandidateStatus,
      careerPathCandidateStatusHistoryToStatus: currentCareerPathCandidate.careerPathCandidateStatus,
      careerPathCandidateStatusHistoryReason: currentCareerPathCandidate.careerPathCandidateJustification,
    } as CareerPathCandidateStatusHistory
    await careerPathCandidateStatusHistoryService.create(careerPathCandidateStatusHistory)

    return currentCareerPathCandidate.careerPathCandidateId
  }

  async delete(currentCareerPathCandidate: CareerPathCandidate) {
    await currentCareerPathCandidate.delete()
    return currentCareerPathCandidate
  }

  async show(careerPathCandidateId: number) {
    const careerPathCandidate = await CareerPathCandidate.query()
      .whereNull('career_path_candidate_deleted_at')
      .where('career_path_candidate_id', careerPathCandidateId)
      .first()
    return careerPathCandidate
  }

  async verifyInfoExist(careerPathCandidate: CareerPathCandidate) {
    const existCompany = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_id', careerPathCandidate.businessUnitId)
      .first()

    if (!existCompany && careerPathCandidate.businessUnitId) {
      const entity = this.t('company')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathCandidate },
      }
    }

    const existPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', careerPathCandidate.originPositionId)
      .first()

    if (!existPosition && careerPathCandidate.originPositionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathCandidate },
      }
    }

    const existTargetPosition = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', careerPathCandidate.targetPositionId)
      .first()

    if (!existTargetPosition && careerPathCandidate.targetPositionId) {
      const entity = this.t('position')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...careerPathCandidate },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...careerPathCandidate },
    }
  }

  async verifyInfo(careerPathCandidate: CareerPathCandidate) {
    const action = careerPathCandidate.careerPathCandidateId > 0 ? 'updated' : 'created'
    if (careerPathCandidate.originPositionId === careerPathCandidate.targetPositionId) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_origin_and_target_positions_cannot_be_the_same'),
        message: this.t('the_origin_and_target_positions_cannot_be_the_same'),
        data: { ...careerPathCandidate },
      }
    }
    const existCareerPathCandidate = await CareerPathCandidate.query()
      .whereNull('career_path_candidate_deleted_at')
      .if(careerPathCandidate.careerPathCandidateId > 0, (query) => {
        query.whereNot('career_path_candidate_id', careerPathCandidate.careerPathCandidateId)
      })
      .where('business_unit_id', careerPathCandidate.businessUnitId)
      .where('origin_position_id', careerPathCandidate.originPositionId)
      .where('target_position_id', careerPathCandidate.targetPositionId)
      .first()
    if (existCareerPathCandidate) {
      const entity = `${this.t('relation')} ${this.t('company')} - ${this.t('origin')} ${this.t('position')} - ${this.t('target')} ${this.t('position')}`
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_relation_is_already_assigned_to_another_register')}`,
        data: { ...careerPathCandidate },
      }
    }
    /*
     * A. Ruta válida vs plantilla
     * Si is_override = false:
     * (origin_position_id → target_position_id) debe existir en plantilla vigente
     * Si no: 400 ruta-fuera-de-plantilla
     */
    if (!careerPathCandidate.careerPathCandidateIsOverride) {
      const existCareerPathTemplate = await CareerPathTemplate.query()
        .whereNull('career_path_template_deleted_at')
        .where('origin_position_id', careerPathCandidate.originPositionId)
        .where('target_position_id', careerPathCandidate.targetPositionId)
        .first()
      if (!existCareerPathTemplate) {
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_origin_and_target_positions_do_not_exist_in_the_current_template'),
          message: this.t('the_origin_and_target_positions_do_not_exist_in_the_current_template'),
          data: { ...careerPathCandidate },
        }
      }
    }
    /*
     * B. Override correctamente justificado
     * Si is_override = true, debe venir:
     * - override_reason_id
     * - justification >= 20 chars
     */
    if (careerPathCandidate.careerPathCandidateIsOverride) {
      if (!careerPathCandidate.careerPathOverrideReasonId) {
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_override_reason_is_required'),
          message: this.t('the_override_reason_is_required'),
          data: { ...careerPathCandidate },
        }
      }
      if (careerPathCandidate.careerPathCandidateJustification.length < 20) {
        return {
          status: 400,
          type: 'warning',
          title: this.t('the_justification_must_be_at_least_20_characters'),
          message: this.t('the_justification_must_be_at_least_20_characters'),
          data: { ...careerPathCandidate },
        }
      }
    }
    /*
     * C. Límite de candidatos
     * Contar candidatos del colaborador con status IN (propuesto, activo)
     * Si ya hay 3: 409 limite-candidatos-excedido
     */
    const countCareerPathCandidates = await CareerPathCandidate.query()
      .whereNull('career_path_candidate_deleted_at')
      .where('proposed_by', careerPathCandidate.proposedBy)
      .whereIn('career_path_candidate_status', ['propuesto', 'activo'])
    if (countCareerPathCandidates.length >= 3) {
      return {
        status: 409,
        type: 'warning',
        title: this.t('the_limit_of_candidates_has_been_exceeded'),
        message: this.t('the_limit_of_candidates_has_been_exceeded'),
        data: { ...careerPathCandidate },
      }
    }
    /*
     * 3) Validaciones de seguridad (RBAC)
     * A. Jefe directo
     * El usuario autenticado debe ser el jefe directo del colaborador
     * (tabla user_responsible_employee)
     * Si no: 403 rbac-gerente-fuera-de-su-equipo
     */
    const existUserResponsibleEmployee = await UserResponsibleEmployee.query()
      .whereNull('user_responsible_employee_deleted_at')
      .where('employee_id', careerPathCandidate.employeeId)
      .where('user_id', careerPathCandidate.proposedBy)
      .first()
    if (!existUserResponsibleEmployee) {
      return {
        status: 403,
        type: 'warning',
        title: this.t('the_user_is_not_the_direct_boss_of_the_employee'),
        message: this.t('the_user_is_not_the_direct_boss_of_the_employee'),
        data: { ...careerPathCandidate },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...careerPathCandidate },
    }
  }

  async getByEmployeeId(employeeId: number) {
    const careerPathCandidates = await CareerPathCandidate.query()
      .whereNull('career_path_candidate_deleted_at')
      .where('employee_id', employeeId)
      .preload('businessUnit')
      .preload('originPosition')
      .preload('targetPosition')
      .preload('careerPathOverrideReason')
      .orderBy('career_path_candidate_id', 'desc')
    return careerPathCandidates
  } 
}
