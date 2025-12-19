import EmployeeAnnotation from '#models/employee_annotation'
import Employee from '#models/employee'

export default class EmployeeAnnotationService {
  async create(employeeAnnotation: EmployeeAnnotation, userId: number) {
    // Desactivar la anotación activa anterior si existe
    const activeAnnotation = await EmployeeAnnotation.query()
      .whereNull('employee_annotation_deleted_at')
      .where('employee_id', employeeAnnotation.employeeId)
      .where('employee_annotation_active', true)
      .first()

    if (activeAnnotation) {
      activeAnnotation.employeeAnnotationActive = false
      await activeAnnotation.save()
    }

    // Crear nueva anotación activa
    const newEmployeeAnnotation = new EmployeeAnnotation()
    newEmployeeAnnotation.employeeId = employeeAnnotation.employeeId
    newEmployeeAnnotation.employeeAnnotationContent = employeeAnnotation.employeeAnnotationContent
    newEmployeeAnnotation.employeeAnnotationActive = true
    newEmployeeAnnotation.userId = userId
    await newEmployeeAnnotation.save()

    // Cargar relaciones
    await newEmployeeAnnotation.load('employee', (query) => {
      query.preload('person')
    })
    await newEmployeeAnnotation.load('user', (query) => {
      query.preload('person')
    })

    return newEmployeeAnnotation
  }

  async update(
    currentEmployeeAnnotation: EmployeeAnnotation,
    employeeAnnotation: EmployeeAnnotation
  ) {
    currentEmployeeAnnotation.employeeAnnotationContent =
      employeeAnnotation.employeeAnnotationContent
    await currentEmployeeAnnotation.save()

    // Cargar relaciones
    await currentEmployeeAnnotation.load('employee', (query) => {
      query.preload('person')
    })
    await currentEmployeeAnnotation.load('user', (query) => {
      query.preload('person')
    })

    return currentEmployeeAnnotation
  }

  async delete(currentEmployeeAnnotation: EmployeeAnnotation) {
    // En lugar de eliminar, solo desactivar
    currentEmployeeAnnotation.employeeAnnotationActive = false
    await currentEmployeeAnnotation.save()
    return currentEmployeeAnnotation
  }

  async show(employeeAnnotationId: number) {
    const employeeAnnotation = await EmployeeAnnotation.query()
      .whereNull('employee_annotation_deleted_at')
      .where('employee_annotation_id', employeeAnnotationId)
      .preload('employee', (query) => {
        query.preload('person')
      })
      .preload('user', (query) => {
        query.preload('person')
      })
      .first()
    return employeeAnnotation ? employeeAnnotation : null
  }

  async getByEmployee(employeeId: number) {
    // Primero obtener la activa
    const activeAnnotation = await EmployeeAnnotation.query()
      .whereNull('employee_annotation_deleted_at')
      .where('employee_id', employeeId)
      .where('employee_annotation_active', true)
      .preload('employee', (query) => {
        query.preload('person')
      })
      .preload('user', (query) => {
        query.preload('person')
      })
      .first()

    // Luego obtener las demás (historial)
    const historyAnnotations = await EmployeeAnnotation.query()
      .whereNull('employee_annotation_deleted_at')
      .where('employee_id', employeeId)
      .where('employee_annotation_active', false)
      .preload('employee', (query) => {
        query.preload('person')
      })
      .preload('user', (query) => {
        query.preload('person')
      })
      .orderBy('employee_annotation_created_at', 'desc')

    return {
      active: activeAnnotation,
      history: historyAnnotations,
    }
  }

  async verifyInfo(employeeAnnotation: EmployeeAnnotation) {
    // Verificar que el empleado existe
    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeAnnotation.employeeId)
      .first()

    if (!employee) {
      return {
        status: 404,
        type: 'warning',
        title: 'Employee not found',
        message: 'The employee was not found with the entered ID',
        data: { employeeId: employeeAnnotation.employeeId },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...employeeAnnotation },
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
