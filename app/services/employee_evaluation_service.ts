import Employee from '#models/employee'
import EmployeeEvaluation from '#models/employee_evaluation'
import { I18n } from '@adonisjs/i18n'

/**
 * Servicio de gestión de evaluaciones generales de desempeño de empleados
 * (`EmployeeEvaluation`). Encapsula:
 *
 * - Creación, actualización, eliminación lógica (soft delete) y consulta
 *   individual o por empleado.
 * - Validaciones auxiliares (`verifyInfoExist`, `verifyInfoDateExist`) que
 *   devuelven una estructura uniforme con `status`, `type`, `title`,
 *   `message` y `data`, lista para que el controlador la traduzca a una
 *   respuesta HTTP.
 * - Actualización del campo `employeeEvaluationPotential` mediante el método
 *   dedicado `updatePotential` (separado del `update` general).
 *
 * El servicio recibe en su constructor una instancia de `I18n` que se utiliza
 * únicamente en los métodos de verificación para retornar mensajes
 * traducidos al idioma del request.
 */
export default class EmployeeEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  /**
   * @param i18n Instancia de I18n del request HTTP, usada para traducir los
   *             mensajes devueltos por los métodos de verificación.
   */
  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }
  /**
   * Crea una nueva evaluación de empleado a partir del objeto recibido. Solo
   * copia los campos relevantes (employeeId, fecha, tipo y score) para evitar
   * que el caller pueda inyectar columnas no permitidas.
   *
   * @param employeeEvaluation DTO con los datos a persistir.
   * @returns La evaluación recién creada.
   */
  async create(employeeEvaluation: EmployeeEvaluation) {
    const newEmployeeEvaluation = new EmployeeEvaluation()
    newEmployeeEvaluation.employeeId = employeeEvaluation.employeeId
    newEmployeeEvaluation.employeeEvaluationDate = employeeEvaluation.employeeEvaluationDate
    newEmployeeEvaluation.employeeEvaluationType = employeeEvaluation.employeeEvaluationType
    newEmployeeEvaluation.employeeEvaluationScore = employeeEvaluation.employeeEvaluationScore
    await newEmployeeEvaluation.save()
    return newEmployeeEvaluation
  }

  /**
   * Actualiza los campos editables (fecha, tipo y score) de una evaluación
   * existente. El campo `employeeEvaluationPotential` se actualiza por
   * separado mediante `updatePotential`.
   *
   * @param currentEmployeeEvaluation Instancia actual de la evaluación.
   * @param employeeEvaluation DTO con los nuevos valores.
   * @returns La evaluación actualizada.
   */
  async update(currentEmployeeEvaluation: EmployeeEvaluation, employeeEvaluation: EmployeeEvaluation) {
    currentEmployeeEvaluation.employeeEvaluationDate = employeeEvaluation.employeeEvaluationDate
    currentEmployeeEvaluation.employeeEvaluationType = employeeEvaluation.employeeEvaluationType
    currentEmployeeEvaluation.employeeEvaluationScore = employeeEvaluation.employeeEvaluationScore
    await currentEmployeeEvaluation.save()
    return currentEmployeeEvaluation
  }

  /**
   * Realiza un soft delete sobre la evaluación.
   * @param currentEmployeeEvaluation Instancia a eliminar lógicamente.
   * @returns La misma instancia ya marcada como eliminada.
   */
  async delete(currentEmployeeEvaluation: EmployeeEvaluation) {
    await currentEmployeeEvaluation.delete()
    return currentEmployeeEvaluation
  }

  /**
   * Obtiene una evaluación por su identificador con sus relaciones
   * `employeeCompetencyEvaluations` y `employeeKpiEvaluations` precargadas.
   *
   * @param employeeEvaluationId Identificador de la evaluación.
   * @returns La evaluación encontrada o `null` si no existe / fue eliminada.
   */
  async show(employeeEvaluationId: number) {
    const employeeEvaluation = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_evaluation_id', employeeEvaluationId)
      .preload('employeeCompetencyEvaluations')
      .preload('employeeKpiEvaluations')
      .first()
    return employeeEvaluation ? employeeEvaluation : null
  }

  /**
   * Verifica que el empleado referenciado en la evaluación exista y no haya
   * sido eliminado. Devuelve un objeto homogéneo que el controlador puede
   * mapear directamente a la respuesta HTTP:
   * - `status: 200` y `type: 'success'` cuando todo es correcto.
   * - `status: 400` y `type: 'warning'` con mensajes traducidos cuando el
   *   empleado no existe (siempre que el campo `employeeId` venga informado).
   *
   * @param employeeEvaluation DTO con `employeeId` a validar.
   * @returns Objeto con la información de validación lista para responder.
   */
  async verifyInfoExist(employeeEvaluation: EmployeeEvaluation) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeEvaluation.employeeId)
      .first()

    if (!existEmployee && employeeEvaluation.employeeId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeEvaluation },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeEvaluation },
    }
  }

  /**
   * Verifica que NO exista ya una evaluación activa con la misma combinación
   * de `employeeId + employeeEvaluationDate + employeeEvaluationType`.
   * Devuelve la misma estructura uniforme que `verifyInfoExist`:
   * - `status: 200` cuando no hay duplicado.
   * - `status: 400` cuando ya existe una evaluación con esos datos.
   *
   * @param employeeEvaluation DTO con los datos a validar.
   * @returns Objeto con la información de validación lista para responder.
   */
  async verifyInfoDateExist(employeeEvaluation: EmployeeEvaluation) {
    const existEmployeeEvaluation = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_id', employeeEvaluation.employeeId)
      .where('employee_evaluation_date', employeeEvaluation.employeeEvaluationDate)
      .where('employee_evaluation_type', employeeEvaluation.employeeEvaluationType)
      .first()
    if (existEmployeeEvaluation) {
      return {
        status: 400,
        type: 'warning',
        title: this.t('employee_evaluation_already_exists'),
        message: this.t('employee_evaluation_already_exists_with_entered_date'),
        data: { ...employeeEvaluation },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeEvaluation },
    }
  }

  /**
   * Devuelve hasta las 3 evaluaciones activas más recientes de un empleado,
   * ordenadas por tipo ascendente y fecha descendente, precargando las
   * competencias evaluadas con su peso (`weight`).
   *
   * @param employeeId Identificador del empleado.
   * @returns Lista de evaluaciones del empleado (puede ser vacía).
   */
  async getByEmployee(employeeId: number) {
    const employeeEvaluations = await EmployeeEvaluation.query()
      .whereNull('employee_evaluation_deleted_at')
      .where('employee_id', employeeId)
      .preload('employeeCompetencyEvaluations', (query) => {
        query.preload('businessUnitCompetencyLevel')
      })
      .orderBy('employee_evaluation_type', 'asc')
      .orderBy('employee_evaluation_date', 'desc')
      .limit(3)
    return employeeEvaluations ? employeeEvaluations : []
  }

  /**
   * Actualiza únicamente el campo `employeeEvaluationPotential` de una
   * evaluación existente. Se mantiene como método aparte para no requerir
   * todos los campos editables cuando solo se desea modificar el potencial.
   *
   * @param currentEmployeeEvaluation Instancia actual de la evaluación.
   * @param employeeEvaluation DTO que contiene `employeeEvaluationPotential`.
   * @returns La evaluación actualizada.
   */
  async updatePotential(currentEmployeeEvaluation: EmployeeEvaluation, employeeEvaluation: EmployeeEvaluation) {
    currentEmployeeEvaluation.employeeEvaluationPotential = employeeEvaluation.employeeEvaluationPotential
    await currentEmployeeEvaluation.save()
    return currentEmployeeEvaluation
  }
}
