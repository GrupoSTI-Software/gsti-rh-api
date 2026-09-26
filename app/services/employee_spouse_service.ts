import Employee from '#models/employee'
import EmployeeSpouse from '#models/employee_spouse'

export default class EmployeeSpouseService {
  async create(employeeSpouse: EmployeeSpouse) {
    const newEmployeeSpouse = new EmployeeSpouse()
    newEmployeeSpouse.employeeSpouseFirstname = employeeSpouse.employeeSpouseFirstname
    newEmployeeSpouse.employeeSpouseLastname = employeeSpouse.employeeSpouseLastname
    newEmployeeSpouse.employeeSpouseSecondLastname = employeeSpouse.employeeSpouseSecondLastname
    newEmployeeSpouse.employeeSpouseOcupation = employeeSpouse.employeeSpouseOcupation
    newEmployeeSpouse.employeeSpouseBirthday = employeeSpouse.employeeSpouseBirthday
    newEmployeeSpouse.employeeSpousePhone = employeeSpouse.employeeSpousePhone
    newEmployeeSpouse.employeeId = employeeSpouse.employeeId
    await newEmployeeSpouse.save()
    return newEmployeeSpouse
  }

  async update(currentEmployeeSpouse: EmployeeSpouse, employeeSpouse: EmployeeSpouse) {
    currentEmployeeSpouse.employeeSpouseFirstname = employeeSpouse.employeeSpouseFirstname
    currentEmployeeSpouse.employeeSpouseLastname = employeeSpouse.employeeSpouseLastname
    currentEmployeeSpouse.employeeSpouseSecondLastname = employeeSpouse.employeeSpouseSecondLastname
    currentEmployeeSpouse.employeeSpouseOcupation = employeeSpouse.employeeSpouseOcupation
    currentEmployeeSpouse.employeeSpouseBirthday = employeeSpouse.employeeSpouseBirthday
    if (employeeSpouse.employeeSpousePhone !== undefined && employeeSpouse.employeeSpousePhone !== null) {
      currentEmployeeSpouse.employeeSpousePhone = employeeSpouse.employeeSpousePhone
    }
    await currentEmployeeSpouse.save()
    return currentEmployeeSpouse
  }

  async delete(currentEmployeeSpouse: EmployeeSpouse) {
    await currentEmployeeSpouse.delete()
    return currentEmployeeSpouse
  }

  async show(employeeSpouseId: number) {
    const employeeSpouse = await EmployeeSpouse.query()
      .whereNull('employee_spouse_deleted_at')
      .where('employee_spouse_id', employeeSpouseId)
      .first()
    return employeeSpouse ? employeeSpouse : null
  }

  async verifyInfoExist(employeeSpouse: EmployeeSpouse) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeSpouse.employeeId)
      .first()

    if (!existEmployee && employeeSpouse.employeeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee was not found',
        message: 'The employee was not found with the entered ID',
        data: { ...employeeSpouse },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employeeSpouse },
    }
  }
}
