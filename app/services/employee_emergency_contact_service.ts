import Employee from '#models/employee'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'

export default class EmployeeEmergencyContactService {
  async create(employeeEmergencyContact: EmployeeEmergencyContact) {
    const newEmployeeEmergencyContact = new EmployeeEmergencyContact()
    newEmployeeEmergencyContact.employeeEmergencyContactFirstname =
      employeeEmergencyContact.employeeEmergencyContactFirstname
    newEmployeeEmergencyContact.employeeEmergencyContactLastname =
      employeeEmergencyContact.employeeEmergencyContactLastname
    newEmployeeEmergencyContact.employeeEmergencyContactSecondLastname =
      employeeEmergencyContact.employeeEmergencyContactSecondLastname
    newEmployeeEmergencyContact.employeeEmergencyContactRelationship =
      employeeEmergencyContact.employeeEmergencyContactRelationship
    newEmployeeEmergencyContact.employeeEmergencyContactPhone =
      employeeEmergencyContact.employeeEmergencyContactPhone
    newEmployeeEmergencyContact.employeeId = employeeEmergencyContact.employeeId
    await newEmployeeEmergencyContact.save()
    return newEmployeeEmergencyContact
  }

  async update(
    currentEmployeeEmergencyContact: EmployeeEmergencyContact,
    employeeEmergencyContact: EmployeeEmergencyContact
  ) {
    currentEmployeeEmergencyContact.employeeEmergencyContactFirstname =
      employeeEmergencyContact.employeeEmergencyContactFirstname
    currentEmployeeEmergencyContact.employeeEmergencyContactLastname =
      employeeEmergencyContact.employeeEmergencyContactLastname
    currentEmployeeEmergencyContact.employeeEmergencyContactSecondLastname =
      employeeEmergencyContact.employeeEmergencyContactSecondLastname
    currentEmployeeEmergencyContact.employeeEmergencyContactRelationship =
      employeeEmergencyContact.employeeEmergencyContactRelationship
    currentEmployeeEmergencyContact.employeeEmergencyContactPhone =
      employeeEmergencyContact.employeeEmergencyContactPhone
    await currentEmployeeEmergencyContact.save()
    return currentEmployeeEmergencyContact
  }

  async delete(currentEmployeeEmergencyContact: EmployeeEmergencyContact) {
    await currentEmployeeEmergencyContact.delete()
    return currentEmployeeEmergencyContact
  }

  async show(employeeEmergencyContactId: number) {
    const employeeEmergencyContact = await EmployeeEmergencyContact.query()
      .whereNull('employee_emergency_contact_deleted_at')
      .where('employee_emergency_contact_id', employeeEmergencyContactId)
      .first()
    return employeeEmergencyContact ? employeeEmergencyContact : null
  }

  async getByEmployeeId(employeeId: number) {
    const employeeEmergencyContacts = await EmployeeEmergencyContact.query()
      .whereNull('employee_emergency_contact_deleted_at')
      .where('employee_id', employeeId)
    return employeeEmergencyContacts
  }

  async verifyInfoExist(employeeEmergencyContact: EmployeeEmergencyContact) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeEmergencyContact.employeeId)
      .first()

    if (!existEmployee && employeeEmergencyContact.employeeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee was not found',
        message: 'The employee was not found with the entered ID',
        data: { ...employeeEmergencyContact },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...employeeEmergencyContact },
    }
  }
}
