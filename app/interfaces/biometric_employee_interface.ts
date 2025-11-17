import User from '#models/user'
import { DateTime } from 'luxon'

export default interface BiometricEmployeeInterface {
  id: number
  empCode: number
  firstName: string
  lastName: string
  secondLastName: string
  payrollNum: string
  hireDate: DateTime
  companyId: number
  departmentId: number
  positionId: number
  gender: string
  photo: string
  usersResponsible?: User[]
  businessUnitId?: number
  personId?: number
}
