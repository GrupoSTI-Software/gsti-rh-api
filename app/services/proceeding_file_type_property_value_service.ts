import Employee from '#models/employee'
import ProceedingFile from '#models/proceeding_file'
import ProceedingFileTypeProperty from '#models/proceeding_file_type_property'
import ProceedingFileTypePropertyValue from '#models/proceeding_file_type_property_value'

export default class ProceedingFileTypePropertyValueService {
  async create(proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    const newProceedingFileTypePropertyValue = new ProceedingFileTypePropertyValue()
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyId =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyId
    newProceedingFileTypePropertyValue.employeeId =
      proceedingFileTypePropertyValue.employeeId ?? null
    newProceedingFileTypePropertyValue.proceedingFileId =
      proceedingFileTypePropertyValue.proceedingFileId
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive
    await newProceedingFileTypePropertyValue.save()
    return newProceedingFileTypePropertyValue
  }

  async update(
    currentProceedingFileTypePropertyValue: ProceedingFileTypePropertyValue,
    proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue
  ) {
    currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
    currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive
    await currentProceedingFileTypePropertyValue.save()
    return currentProceedingFileTypePropertyValue
  }

  async delete(currentProceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    await currentProceedingFileTypePropertyValue.delete()
    return currentProceedingFileTypePropertyValue
  }

  async show(proceedingFileTypePropertyValueId: number) {
    const proceedingFileTypePropertyValue = await ProceedingFileTypePropertyValue.query()
      .whereNull('proceeding_file_type_property_value_deleted_at')
      .where('proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
      .first()
    return proceedingFileTypePropertyValue ? proceedingFileTypePropertyValue : null
  }

  async verifyInfoExist(proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    const existProceedingFileTypeProperty = await ProceedingFileTypeProperty.query()
      .whereNull('proceeding_file_type_property_deleted_at')
      .where(
        'proceeding_file_type_property_id',
        proceedingFileTypePropertyValue.proceedingFileTypePropertyId
      )
      .first()

    if (
      !existProceedingFileTypeProperty &&
      proceedingFileTypePropertyValue.proceedingFileTypePropertyId
    ) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file type property was not found',
        message: 'The proceeding file type property was not found with the entered ID',
        data: { ...proceedingFileTypePropertyValue },
      }
    }

    if (proceedingFileTypePropertyValue.employeeId) {
      const existEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', proceedingFileTypePropertyValue.employeeId)
        .first()

      if (!existEmployee) {
        return {
          status: 400,
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { ...proceedingFileTypePropertyValue },
        }
      }
    }
    const existProceedingFile = await ProceedingFile.query()
      .whereNull('proceeding_file_deleted_at')
      .where('proceeding_file_id', proceedingFileTypePropertyValue.proceedingFileId)
      .first()

    if (!existProceedingFile && proceedingFileTypePropertyValue.proceedingFileId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file was not found',
        message: 'The proceeding file was not found with the entered ID',
        data: { ...proceedingFileTypePropertyValue },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...proceedingFileTypePropertyValue },
    }
  }
}
