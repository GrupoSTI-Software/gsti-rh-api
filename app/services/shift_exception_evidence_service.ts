/* eslint-disable prettier/prettier */
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import ShiftException from '#models/shift_exception'

export default class ShiftExceptionEvidenceService {
  async create(shiftExceptionEvidence: ShiftExceptionEvidence) {
    const newShiftExceptionEvidence = new ShiftExceptionEvidence()
    newShiftExceptionEvidence.shiftExceptionEvidenceFile = shiftExceptionEvidence.shiftExceptionEvidenceFile
    newShiftExceptionEvidence.shiftExceptionEvidenceType = shiftExceptionEvidence.shiftExceptionEvidenceType
    newShiftExceptionEvidence.shiftExceptionId = shiftExceptionEvidence.shiftExceptionId
    await newShiftExceptionEvidence.save()
    return newShiftExceptionEvidence
  }

  async update(currentShiftExceptionEvidence: ShiftExceptionEvidence, shiftExceptionEvidence: ShiftExceptionEvidence) {
    currentShiftExceptionEvidence.shiftExceptionEvidenceFile = shiftExceptionEvidence.shiftExceptionEvidenceFile
    currentShiftExceptionEvidence.shiftExceptionEvidenceType = shiftExceptionEvidence.shiftExceptionEvidenceType
    currentShiftExceptionEvidence.shiftExceptionId = shiftExceptionEvidence.shiftExceptionId
    await currentShiftExceptionEvidence.save()
    return currentShiftExceptionEvidence
  }

  async delete(currentShiftExceptionEvidence: ShiftExceptionEvidence) {
    await currentShiftExceptionEvidence.delete()
    return currentShiftExceptionEvidence
  }

  /**
   * Consulta base acotada al tenant.
   *
   * `ShiftExceptionEvidence` NO compone `withBusinessUnitScope`, así que sus
   * queries no heredan el filtro del `TenantContext` por si solas: consultarlo
   * directo devolvía evidencias de cualquier empresa con solo cambiar el ID.
   * El scope se hereda de `ShiftException`, que si es tenant-scoped, filtrando
   * por la relacion.
   *
   * Toda lectura de este modelo debe partir de aquí.
   */
  private scopedQuery() {
    return ShiftExceptionEvidence.query()
      .whereNull('shift_exception_evidence_deleted_at')
      .whereIn(
        'shift_exception_id',
        ShiftException.query()
          .select('shift_exception_id')
          .whereNull('shift_exceptions_deleted_at')
      )
  }

  /** Lista las evidencias visibles para el tenant activo. */
  async index() {
    return this.scopedQuery()
  }

  async show(shiftExceptionEvidenceId: number) {
    const shiftExceptionEvidence = await this.scopedQuery()
      .where('shift_exception_evidence_id', shiftExceptionEvidenceId)
      .first()
    return shiftExceptionEvidence ? shiftExceptionEvidence : null
  }

  async verifyInfoExist(shiftExceptionEvidence: ShiftExceptionEvidence) {
    const existShiftException = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exception_id', shiftExceptionEvidence.shiftExceptionId)
      .first()

    if (!existShiftException && shiftExceptionEvidence.shiftExceptionId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The shift exception was not found',
        message: 'The shift exception was not found with the entered ID',
        data: { ...shiftExceptionEvidence },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...shiftExceptionEvidence },
    }
  }

  sanitizeInput(input: { [key: string]: string | null }) {
    for (let key in input) {
      if (input[key] === 'null' || input[key] === 'undefined') {
        input[key] = null
      }
    }
    return input
  }

}
