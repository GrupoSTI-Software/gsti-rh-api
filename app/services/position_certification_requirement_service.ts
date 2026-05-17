import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Position from '#models/position'
import Certification from '#models/certification'
import PositionCertificationRequirement from '#models/position_certification_requirement'
import { PCR_ERROR_CODES } from '../constants/position_certification_requirement_error_codes.js'
import { PositionCertificationRequirementError } from '../exceptions/position_certification_requirement_error.js'

export default class PositionCertificationRequirementService {
  /**
   * Devuelve los requerimientos de certificación activos de un puesto,
   * con la certificación y su categoría precargadas.
   */
  async getByPosition(positionId: number) {
    await this.ensurePositionExists(positionId)

    return PositionCertificationRequirement.query()
      .whereNull('position_certification_requirement_deleted_at')
      .where('position_id', positionId)
      .preload('certification', (q) => q.preload('category'))
      .orderBy('position_certification_requirement_created_at', 'asc')
  }

  /**
   * Agrega una o varias certificaciones requeridas a un puesto en lote.
   * Valida duplicados y compatibilidad de unidad de negocio por cada ítem.
   */
  async addBatch(positionId: number, certificationIds: number[]) {
    const position = await this.ensurePositionExists(positionId)
    const unique = [...new Set(certificationIds)]

    const results: PositionCertificationRequirement[] = []

    for (const certificationId of unique) {
      const certification = await this.ensureCertificationExists(certificationId)
      this.assertApplicable(position, certification)

      const restored = await this.restoreOrAssertNotDuplicate(positionId, certificationId)

      let req: PositionCertificationRequirement
      if (restored) {
        req = restored
      } else {
        req = new PositionCertificationRequirement()
        req.positionId = positionId
        req.certificationId = certificationId
        req.positionCertificationRequirementCreatedAt = DateTime.now()
        req.positionCertificationRequirementUpdatedAt = DateTime.now()
        await req.save()
      }

      await req.load('certification', (q) => q.preload('category'))
      results.push(req)
    }

    return results
  }

  /**
   * Quita (soft delete) la certificación requerida de un puesto.
   * No afecta cumplimientos históricos de empleados.
   */
  async remove(positionId: number, certificationId: number) {
    await this.ensurePositionExists(positionId)

    const req = await PositionCertificationRequirement.query()
      .whereNull('position_certification_requirement_deleted_at')
      .where('position_id', positionId)
      .where('certification_id', certificationId)
      .first()

    if (!req) {
      throw new PositionCertificationRequirementError(
        'La certificación requerida no existe en este puesto.',
        PCR_ERROR_CODES.REQUIREMENT_NOT_FOUND,
        404
      )
    }

    await req.delete()
  }

  private async ensurePositionExists(positionId: number) {
    const position = await Position.query()
      .whereNull('position_deleted_at')
      .where('position_id', positionId)
      .preload('certificationRequirements')
      .first()

    if (!position) {
      throw new PositionCertificationRequirementError(
        'El puesto no existe o fue dado de baja.',
        PCR_ERROR_CODES.POSITION_NOT_FOUND,
        404
      )
    }

    return position
  }

  private async ensureCertificationExists(certificationId: number) {
    const cert = await Certification.query()
      .where('certification_id', certificationId)
      .preload('businessUnits', (q) => q.whereNull('business_unit_deleted_at'))
      .first()

    if (!cert) {
      throw new PositionCertificationRequirementError(
        `La certificación con id ${certificationId} no existe.`,
        PCR_ERROR_CODES.CERTIFICATION_NOT_FOUND,
        404
      )
    }

    return cert
  }

  /**
   * Si la certificación tiene unidades de negocio restringidas,
   * la unidad del puesto debe estar entre ellas.
   */
  private assertApplicable(position: Position, certification: Certification) {
    const units = certification.businessUnits ?? []
    if (units.length === 0) {
      return
    }
    const unitIds = units.map((u) => u.businessUnitId)
    if (!unitIds.includes(position.businessUnitId)) {
      throw new PositionCertificationRequirementError(
        'Esta certificación está acotada a unidades de negocio distintas a la del puesto.',
        PCR_ERROR_CODES.CERTIFICATION_NOT_APPLICABLE,
        422
      )
    }
  }

  /**
   * Si la relación existe y está activa → 409.
   * Si existía pero fue soft-deleted → la restaura y devuelve el registro.
   * Si no existe → devuelve null (el llamador debe insertar).
   */
  private async restoreOrAssertNotDuplicate(
    positionId: number,
    certificationId: number
  ): Promise<PositionCertificationRequirement | null> {
    const active = await PositionCertificationRequirement.query()
      .whereNull('position_certification_requirement_deleted_at')
      .where('position_id', positionId)
      .where('certification_id', certificationId)
      .first()

    if (active) {
      throw new PositionCertificationRequirementError(
        'Esta certificación ya está asignada al puesto.',
        PCR_ERROR_CODES.REQUIREMENT_DUPLICATE,
        409
      )
    }

    // withTrashed() incluye los soft-deleted en el query
    const deletedRow = await db
      .from('position_certification_requirements')
      .whereNotNull('position_certification_requirement_deleted_at')
      .where('position_id', positionId)
      .where('certification_id', certificationId)
      .first()

    if (deletedRow) {
      const now = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
      await db
        .from('position_certification_requirements')
        .where(
          'position_certification_requirement_id',
          deletedRow.position_certification_requirement_id
        )
        .update({
          position_certification_requirement_deleted_at: null,
          position_certification_requirement_updated_at: now,
        })

      // Recargamos el modelo limpio para poder hacer preload
      const restored = await PositionCertificationRequirement.query()
        .where(
          'position_certification_requirement_id',
          deletedRow.position_certification_requirement_id
        )
        .first()

      return restored!
    }

    return null
  }
}
