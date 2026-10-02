import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'
import { isMaskEcho } from '#helpers/sensitive_mask'

/** Valor de propiedad tal como llega en el payload de la condición médica. */
export interface EmployeeMedicalConditionPropertyValueInput {
  medicalConditionTypePropertyId: number
  medicalConditionTypePropertyValue?: string | null
  medicalConditionTypePropertyValueActive?: number
}

/**
 * Qué hacer con un valor entrante. El valor es dato de salud cifrado que el
 * API devuelve enmascarado, así que el BO no puede reenviarlo tal cual:
 *   - `clear`: `medicalConditionTypePropertyValueActive: 0` — el usuario borró el
 *     dato. No se usa la cadena vacía porque el bodyparser la convierte en null.
 *   - `keep`: nulo, vacío o eco de la máscara — el usuario no lo tocó.
 *   - `write`: valor nuevo en claro.
 */
type PropertyValueIntent = 'keep' | 'clear' | 'write'

function propertyValueIntent(propertyValue: EmployeeMedicalConditionPropertyValueInput): PropertyValueIntent {
  if (propertyValue.medicalConditionTypePropertyValueActive === 0) return 'clear'
  const value = propertyValue.medicalConditionTypePropertyValue
  if (value === null || value === undefined || value.trim() === '' || isMaskEcho(value)) return 'keep'
  return 'write'
}

export default class EmployeeMedicalConditionService {
  async create(
    employeeMedicalCondition: EmployeeMedicalCondition,
    propertyValues: EmployeeMedicalConditionPropertyValueInput[] = []
  ) {
    // Una transacción: si el guard de salud rechaza un valor, la condición no
    // queda guardada a medias sin sus propiedades.
    const newEmployeeMedicalCondition = await db.transaction(async (trx) => {
      const condition = new EmployeeMedicalCondition()
      condition.useTransaction(trx)
      condition.employeeId = employeeMedicalCondition.employeeId
      condition.medicalConditionTypeId = employeeMedicalCondition.medicalConditionTypeId
      condition.employeeMedicalConditionDiagnosis = employeeMedicalCondition.employeeMedicalConditionDiagnosis
      condition.employeeMedicalConditionNotes = employeeMedicalCondition.employeeMedicalConditionNotes
      condition.employeeMedicalConditionActive = employeeMedicalCondition.employeeMedicalConditionActive
      await condition.save()

      for (const propertyValue of propertyValues) {
        if (propertyValueIntent(propertyValue) !== 'write') continue
        await this.createPropertyValue(condition, propertyValue, trx)
      }
      return condition
    })

    await newEmployeeMedicalCondition.load('employee')
    await newEmployeeMedicalCondition.load('medicalConditionType')
    await newEmployeeMedicalCondition.load('propertyValues', (query) => {
      query.preload('medicalConditionTypeProperty')
    })
    return newEmployeeMedicalCondition
  }

  async update(
    currentEmployeeMedicalCondition: EmployeeMedicalCondition,
    employeeMedicalCondition: EmployeeMedicalCondition,
    propertyValues: EmployeeMedicalConditionPropertyValueInput[] = []
  ) {
    await db.transaction(async (trx) => {
      currentEmployeeMedicalCondition.useTransaction(trx)
      currentEmployeeMedicalCondition.employeeId = employeeMedicalCondition.employeeId
      currentEmployeeMedicalCondition.medicalConditionTypeId = employeeMedicalCondition.medicalConditionTypeId
      // Campos sensibles cifrados: null = "no actualizar" — el BO los envía como null
      // cuando el usuario no los modificó en esa sesión (se mostraban enmascarados).
      if (employeeMedicalCondition.employeeMedicalConditionDiagnosis !== null &&
          employeeMedicalCondition.employeeMedicalConditionDiagnosis !== undefined) {
        currentEmployeeMedicalCondition.employeeMedicalConditionDiagnosis = employeeMedicalCondition.employeeMedicalConditionDiagnosis
      }
      if (employeeMedicalCondition.employeeMedicalConditionNotes !== null &&
          employeeMedicalCondition.employeeMedicalConditionNotes !== undefined) {
        currentEmployeeMedicalCondition.employeeMedicalConditionNotes = employeeMedicalCondition.employeeMedicalConditionNotes
      }
      currentEmployeeMedicalCondition.employeeMedicalConditionActive = employeeMedicalCondition.employeeMedicalConditionActive
      await currentEmployeeMedicalCondition.save()

      await this.upsertPropertyValues(currentEmployeeMedicalCondition, propertyValues, trx)
    })

    return currentEmployeeMedicalCondition
  }

  /**
   * Aplica los valores entrantes por propiedad sin tocar los que no vienen.
   *
   * Antes se borraban y recreaban todos: con el valor enmascarado eso guardaba
   * `•••••` como dato real, cambiaba los ids que usa la bitácora de revelado y
   * exigía el permiso de salud aunque nada cambiara.
   */
  private async upsertPropertyValues(
    condition: EmployeeMedicalCondition,
    propertyValues: EmployeeMedicalConditionPropertyValueInput[],
    trx: TransactionClientContract
  ) {
    if (propertyValues.length === 0) return

    const existing = await MedicalConditionTypePropertyValue.query({ client: trx })
      .where('employeeMedicalConditionId', condition.employeeMedicalConditionId)
    const existingByProperty = new Map<number, MedicalConditionTypePropertyValue>()
    for (const row of existing) {
      if (!existingByProperty.has(row.medicalConditionTypePropertyId)) {
        existingByProperty.set(row.medicalConditionTypePropertyId, row)
      }
    }

    for (const propertyValue of propertyValues) {
      const intent = propertyValueIntent(propertyValue)
      if (intent === 'keep') continue

      const current = existingByProperty.get(propertyValue.medicalConditionTypePropertyId)
      if (intent === 'clear') {
        if (!current) continue
        // Vaciar es escribir sobre el dato de salud: se guarda vacío primero para
        // que el guard exija el permiso antes del borrado lógico.
        current.medicalConditionTypePropertyValue = ''
        await current.save()
        await current.delete()
        continue
      }

      if (current) {
        current.medicalConditionTypePropertyValue = propertyValue.medicalConditionTypePropertyValue as string
        current.medicalConditionTypePropertyValueActive = 1
        await current.save()
        continue
      }
      await this.createPropertyValue(condition, propertyValue, trx)
    }
  }

  private async createPropertyValue(
    condition: EmployeeMedicalCondition,
    propertyValue: EmployeeMedicalConditionPropertyValueInput,
    trx: TransactionClientContract
  ) {
    const newPropertyValue = new MedicalConditionTypePropertyValue()
    newPropertyValue.useTransaction(trx)
    newPropertyValue.medicalConditionTypePropertyId = propertyValue.medicalConditionTypePropertyId
    newPropertyValue.employeeMedicalConditionId = condition.employeeMedicalConditionId
    // Se hereda del padre ya cargado: el hook lo buscaría fuera de la
    // transacción y no vería una condición recién creada.
    newPropertyValue.businessUnitId = condition.businessUnitId
    newPropertyValue.medicalConditionTypePropertyValue = propertyValue.medicalConditionTypePropertyValue as string
    newPropertyValue.medicalConditionTypePropertyValueActive = 1
    await newPropertyValue.save()
  }

  async delete(currentEmployeeMedicalCondition: EmployeeMedicalCondition) {
    // Eliminar valores de propiedades relacionados
    await MedicalConditionTypePropertyValue.query()
      .where('employee_medical_condition_id', currentEmployeeMedicalCondition.employeeMedicalConditionId)
      .delete()

    await currentEmployeeMedicalCondition.delete()
    return currentEmployeeMedicalCondition
  }

  async show(employeeMedicalConditionId: number) {
    const employeeMedicalCondition = await EmployeeMedicalCondition.query()
      .whereNull('employee_medical_condition_deleted_at')
      .where('employee_medical_condition_id', employeeMedicalConditionId)
      .preload('employee', (query) => {
        query.preload('person')
      })
      .preload('medicalConditionType', (query) => {
        query.preload('properties')
      })
      .preload('propertyValues', (query) => {
        query.preload('medicalConditionTypeProperty')
      })
      .first()
    return employeeMedicalCondition ? employeeMedicalCondition : null
  }

  async verifyInfo(employeeMedicalCondition: EmployeeMedicalCondition) {
    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...employeeMedicalCondition },
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
