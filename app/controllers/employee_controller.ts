import Department from '#models/department'
import Employee from '#models/employee'
import EmployeeService from '#services/employee_service'
import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import axios from 'axios'
import BiometricEmployeeInterface from '../interfaces/biometric_employee_interface.js'
import { createEmployeeValidator } from '../validators/employee.js'
import { updateEmployeeValidator } from '../validators/employee.js'
import { EmployeeFilterSearchInterface } from '../interfaces/employee_filter_search_interface.js'
import { inject } from '@adonisjs/core'
import UploadService from '#services/upload_service'
import UserService from '#services/user_service'
import VacationSetting from '#models/vacation_setting'
import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import ShiftException from '#models/shift_exception'
import EmployeeShift from '#models/employee_shift'
import EmployeeType from '#models/employee_type'
import BusinessUnit from '#models/business_unit'
import Position from '#models/position'
import SystemSettingService from '#services/system_setting_service'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import Role from '#models/role'
import AssistsService from '#services/assist_service'
import { EmployeeWorkDaysDisabilityFilterInterface } from '../interfaces/employee_work_days_disability_filter_interface.js'
import RoleService from '#services/role_service'
import { EmployeeSyncInterface } from '../interfaces/employee_sync_interface.js'

// import { wrapper } from 'axios-cookiejar-support'
// import { CookieJar } from 'tough-cookie'

// const jar = new CookieJar()
// const client = wrapper(axios.create({ jar }))

export default class EmployeeController {
  /**
   * @swagger
   * /api/synchronization/employees:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: sync information
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               page:
   *                 type: integer
   *                 description: The page number for pagination
   *                 required: false
   *                 default: 1
   *               limit:
   *                 type: integer
   *                 description: The number of records per page
   *                 required: false
   *                 default: 300
   *               empCode:
   *                 type: string
   *                 description: The employee code to filter by
   *                 required: false
   *                 default: ''
   *               firstName:
   *                 type: string
   *                 description: The first name to filter by
   *                 required: false
   *                 default: ''
   *               lastName:
   *                 type: string
   *                 description: The last name to filter by
   *                 required: false
   *                 default: ''
   *               depName:
   *                 type: string
   *                 description: The employee name to filter by
   *                 required: false
   *                 default: ''
   *               positionName:
   *                 type: string
   *                 description: The position name to filter by
   *                 required: false
   *                 default: ''
   *               depCode:
   *                 type: string
   *                 description: The employee code to filter by
   *                 required: false
   *                 default: ''
   *               positionCode:
   *                 type: string
   *                 description: The position code to filter by
   *                 required: false
   *                 default: ''
   *               employeeId:
   *                 type: integer
   *                 description: The employee id to filter by
   *                 required: false
   *                 default: 0
   *               positionId:
   *                 type: integer
   *                 description: The position id to filter by
   *                 required: false
   *                 default: 0
   *               hireDate:
   *                 type: string
   *                 format: date
   *                 description: The hire date to filter by format year month day
   *                 required: false
   *                 default: ''
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async synchronization({ request, response, i18n }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 1000)
      const empCode = request.input('empCode')
      const firstName = request.input('firstName')
      const lastName = request.input('lastName')
      const depName = request.input('depName')
      const positionName = request.input('positionName')
      const depCode = request.input('depCode')
      const positionCode = request.input('positionCode')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const hireDate = request.input('hireDate')

      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)

      const businessUnitsList = businessUnits.map((business) => business.businessUnitName)

      let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/employees`
      apiUrl = `${apiUrl}?page=${page || ''}`
      apiUrl = `${apiUrl}&limit=${limit || ''}`
      apiUrl = `${apiUrl}&empCode=${empCode || ''}`
      apiUrl = `${apiUrl}&firstName=${firstName || ''}`
      apiUrl = `${apiUrl}&lastName=${lastName || ''}`
      apiUrl = `${apiUrl}&depName=${depName || ''}`
      apiUrl = `${apiUrl}&positionName=${positionName || ''}`
      apiUrl = `${apiUrl}&depCode=${depCode || ''}`
      apiUrl = `${apiUrl}&positionCode=${positionCode || ''}`
      apiUrl = `${apiUrl}&departmentId=${departmentId || ''}`
      apiUrl = `${apiUrl}&positionId=${positionId || ''}`
      apiUrl = `${apiUrl}&hireDate=${hireDate || ''}`

      const apiResponse = await axios.get(apiUrl)
      const data = apiResponse.data.data

      let withOutDepartmentId = null
      let withOutPositionId = null

      const department = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_name', 'Sin departamento')
        .first()
      if (department) {
        withOutDepartmentId = department.departmentId
      }
      const position = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_name', 'Sin posición')
        .first()
      if (position) {
        withOutPositionId = position.positionId
      }
      const roles = await Role.query()
        .whereIn('role_slug', ['rh-manager', 'admin', 'nominas'])
        .whereNull('role_deleted_at')

      let usersResponsible: Array<User> = []

      if (roles.length) {
        const roleIds = roles.map((role) => role.roleId)
        usersResponsible = await User.query()
          .whereIn('role_id', roleIds)
          .preload('role')
          .orderBy('user_id')
      }

      if (data) {
        const employeeService = new EmployeeService(i18n)
        data.sort((a: BiometricEmployeeInterface, b: BiometricEmployeeInterface) => a.id - b.id)

        let employeeCountSaved = 0

        for await (const employee of data) {
          let employeeLastName = ''
          let employeeSecondLastName = ''
          if (employee.lastName) {
            const surnames = employeeService.splitCompoundSurnames(employee.lastName)
            employeeLastName = surnames.paternalSurname
            employeeSecondLastName = surnames.maternalSurname
          }

          let existInBusinessUnitList = false
          let businessUnitApply = null

          if (employee.payrollNum) {
            if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${employee.payrollNum}`.toLocaleLowerCase())) {
              existInBusinessUnitList = true
              businessUnitApply = businessUnits.find((business) => `${business.businessUnitName}`.toLocaleLowerCase() === `${employee.payrollNum}`.toLocaleLowerCase())
            }
          } else if (employee.personnelEmployeeArea.length > 0) {
            for await (const personnelEmployeeArea of employee.personnelEmployeeArea) {
              if (personnelEmployeeArea.personnelArea) {
                if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${personnelEmployeeArea.personnelArea.areaName}`.toLocaleLowerCase())) {
                  existInBusinessUnitList = true
                  businessUnitApply = businessUnits.find((business) => `${business.businessUnitName}`.toLocaleLowerCase() === `${personnelEmployeeArea.personnelArea.areaName}`.toLocaleLowerCase())
                  break
                }
              }
            }
          }

          if (existInBusinessUnitList) {
            employee.lastName = employeeLastName
            employee.secondLastName = employeeSecondLastName
            employee.departmentId = withOutDepartmentId
            employee.positionId = withOutPositionId
            employee.usersResponsible = usersResponsible
            employee.businessUnitId = businessUnitApply?.businessUnitId || 1
            employeeCountSaved += 1

            await this.verify(employee, employeeService)
          }
        }
        response.status(201)
        return {
          type: 'success',
          title: 'Employee synchronization',
          message: 'Employees have been synchronized successfully',
          data: {
            data,
          },
        }
      } else {
        response.status(404)
        return {
          type: 'warning',
          title: 'Employee synchronization',
          message: 'No data found to synchronize',
          data: { data },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: employeeWorkSchedule
   *         in: query
   *         required: false
   *         description: Employee work schedule
   *         schema:
   *           type: string
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: employeeTypeId
   *         in: query
   *         required: false
   *         description: Employee Type Id
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *       - name: orderBy
   *         in: query
   *         required: false
   *         description: Order by field (number or name)
   *         schema:
   *           type: string
   *           enum: [number, name]
   *       - name: orderDirection
   *         in: query
   *         required: false
   *         description: Order direction (ascend or descend)
   *         schema:
   *           type: string
   *           enum: [ascend, descend]
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user

      let hasAccessToFullEmployes = false
      let userResponsibleId = null

      if (user) {
        await user.load('role')

        if (user.role.roleSlug !== 'root') {
          const roleService = new RoleService()
          hasAccessToFullEmployes = await roleService.hasAccessToFullEmployees(user.role.roleId)
        }

        if (user.role.roleSlug !== 'root' && !hasAccessToFullEmployes) {
          userResponsibleId = user?.userId
        }
      }

      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>

      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId, hasAccessToFullEmployes)
      }

      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const employeeWorkSchedule = request.input('employeeWorkSchedule')
      const onlyInactive = request.input('onlyInactive')
      const employeeTypeId = request.input('employeeTypeId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const orderBy = request.input('orderBy')
      const orderDirection = request.input('orderDirection')

      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        employeeWorkSchedule: employeeWorkSchedule,
        onlyInactive: onlyInactive,
        employeeTypeId: employeeTypeId,
        userResponsibleId: userResponsibleId,
        page: page,
        limit: limit,
        orderBy: orderBy,
        orderDirection: orderDirection,
      } as EmployeeFilterSearchInterface

      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.index(filters, departmentsList)

      response.status(200)

      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: create new employee
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeFirstName:
   *                 type: string
   *                 description: Employe first name
   *                 required: false
   *                 default: ''
   *               employeeLastName:
   *                 type: string
   *                 description: Employee last name
   *                 required: false
   *                 default: ''
   *               employeeSecondLastName:
   *                 type: string
   *                 description: Employee second last name
   *                 required: false
   *                 default: ''
   *               employeeCode:
   *                 type: string
   *                 description: Employee code
   *                 required: true
   *                 default: ''
   *               employeePayrollNum:
   *                 type: string
   *                 description: Employee pay roll num
   *                 required: true
   *                 default: ''
   *               employeeHireDate:
   *                 type: string
   *                 format: date
   *                 description: Employee hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               companyId:
   *                 type: integer
   *                 description: Company id
   *                 required: true
   *                 default: 0
   *               departmentId:
   *                 type: integer
   *                 description: Department id
   *                 required: true
   *                 default: 0
   *               positionId:
   *                 type: integer
   *                 description: Position id
   *                 required: true
   *                 default: 0
   *               personId:
   *                 type: integer
   *                 description: Person id
   *                 required: true
   *                 default: 0
   *               businessUnitId:
   *                 type: integer
   *                 description: Business unit id
   *                 required: true
   *                 default: 1
   *               dailySalary:
   *                 type: number
   *                 description: Daily salary
   *                 required: false
   *                 default: 0
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: 1
   *               employeeAssistDiscriminator:
   *                 type: boolean
   *                 description: If true, the employee is not considered on attendance monitor
   *                 required: true
   *                 default: 0
   *               employeeWorkSchedule:
   *                 type: string
   *                 description: Work Schedule Onsite or Remote
   *                 required: true
   *                 default: 'Onsite'
   *               employeeTypeId:
   *                 type: integer
   *                 description: Employee type id
   *                 required: true
   *                 default: 0
   *               employeeBusinessEmail:
   *                 type: string
   *                 description: Employee business email
   *                 required: false
   *                 default: ''
   *               employeeTypeOfContract:
   *                 type: string
   *                 description: Employee type of contract
   *                 required: true
   *                 default: ''
   *               employeeIgnoreConsecutiveAbsences:
   *                 type: boolean
   *                 description: If true, the employee is not considered on report consecutive faults
   *                 required: true
   *                 default: 0
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const employeeFirstName = request.input('employeeFirstName')
      const employeeLastName = request.input('employeeLastName')
      const employeeSecondLastName = request.input('employeeSecondLastName')
      const employeeCode = request.input('employeeCode')
      const employeePayrollNum = request.input('employeePayrollNum')
      let employeeHireDate = request.input('employeeHireDate')
      employeeHireDate = employeeHireDate
        ? (employeeHireDate.split('T')[0] + ' 00:000:00').replace('"', '')
        : null
      const personId = request.input('personId')
      const companyId = request.input('companyId')
      const departmentId = request.input('departmentId', null)
      const positionId = request.input('positionId', null)
      const workSchedule = request.input('employeeWorkSchedule')
      const employeeTypeId = request.input('employeeTypeId')
      const employeeBusinessEmail = request.input('employeeBusinessEmail')
      const employeeTypeOfContract = request.input('employeeTypeOfContract')
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const dailySalary = request.input('dailySalary') || 0
      const employeeAssistDiscriminator = request.input('employeeAssistDiscriminator')
      const employeeIgnoreConsecutiveAbsences = request.input('employeeIgnoreConsecutiveAbsences')
      const employee = {
        employeeId: 0,
        employeeFirstName: employeeFirstName,
        employeeLastName: `${employeeLastName}`,
        employeeSecondLastName: `${employeeSecondLastName}`,
        employeeCode: employeeCode,
        employeePayrollNum: employeePayrollNum,
        employeeHireDate: employeeHireDate,
        companyId: companyId,
        departmentId: departmentId,
        positionId: positionId,
        personId: personId,
        businessUnitId: request.input('businessUnitId'),
        dailySalary: dailySalary,
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeWorkSchedule: workSchedule,
        employeeTypeId: employeeTypeId,
        employeeBusinessEmail: employeeBusinessEmail,
        employeeAssistDiscriminator: employeeAssistDiscriminator,
        employeeTypeOfContract: employeeTypeOfContract,
        employeeIgnoreConsecutiveAbsences: employeeIgnoreConsecutiveAbsences,
      } as Employee
      if (!employee.departmentId || employee.departmentId.toString() === '0') {
        const department = await Department.query()
          .whereNull('department_deleted_at')
          .where('department_name', 'Sin departamento')
          .first()
        if (department) {
          employee.departmentId = department.departmentId
        }
      }
      if (!employee.positionId || employee.positionId.toString() === '0') {
        const position = await Position.query()
          .whereNull('position_deleted_at')
          .where('position_name', 'Sin posición')
          .first()
        if (position) {
          employee.positionId = position.positionId
        }
      }
      const employeeService = new EmployeeService(i18n)
      const data = await request.validateUsing(createEmployeeValidator)
      const exist = await employeeService.verifyInfoExist(employee)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await employeeService.verifyInfo(employee)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const roles = await Role.query()
        .whereIn('role_slug', ['rh-manager', 'admin', 'nominas'])
        .whereNull('role_deleted_at')

      let usersResponsible: Array<User> = []

      if (roles.length) {
        const roleIds = roles.map((role) => role.roleId)
        usersResponsible = await User.query()
          .whereIn('role_id', roleIds)
          .preload('role')
          .orderBy('user_id')
      }
      if (userResponsibleId && user) {
        const existUser = usersResponsible.find(a => a.userId === userResponsibleId)
        if (!existUser) {
          usersResponsible.push(user)
        }
      }

      const newEmployee = await employeeService.create(employee, usersResponsible)
      if (newEmployee) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was created successfully',
          data: { employee: newEmployee },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: update employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeFirstName:
   *                 type: string
   *                 description: Employe first name
   *                 required: false
   *                 default: ''
   *               employeeLastName:
   *                 type: string
   *                 description: Employee last name
   *                 required: false
   *                 default: ''
   *               employeeSecondLastName:
   *                 type: string
   *                 description: Employee second last name
   *                 required: false
   *                 default: ''
   *               employeeCode:
   *                 type: string
   *                 description: Employee code
   *                 required: true
   *                 default: ''
   *               employeePayrollNum:
   *                 type: string
   *                 description: Employee pay roll num
   *                 required: true
   *                 default: ''
   *               employeeHireDate:
   *                 type: string
   *                 format: date
   *                 description: Employee hire date (YYYY-MM-DD)
   *                 required: true
   *                 default: ''
   *               companyId:
   *                 type: integer
   *                 description: Company id
   *                 required: true
   *                 default: 0
   *               departmentId:
   *                 type: integer
   *                 description: Department id
   *                 required: true
   *                 default: 0
   *               positionId:
   *                 type: integer
   *                 description: Position id
   *                 required: true
   *                 default: 0
   *               businessUnitId:
   *                 type: integer
   *                 description: Business unit id
   *                 required: true
   *                 default: 1
   *               dailySalary:
   *                 type: number
   *                 description: Daily salary
   *                 required: false
   *                 default: 0
   *               payrollBusinessUnitId:
   *                 type: number
   *                 description: Payroll Business Unit id
   *                 required: true
   *                 default: 1
   *               employeeAssistDiscriminator:
   *                 type: boolean
   *                 description: If true, the employee is not considered on attendance monitor
   *                 required: true
   *                 default: 0
   *               employeeWorkSchedule:
   *                 type: string
   *                 description: Work Schedule Onsite or Remote
   *                 required: true
   *                 default: 'Onsite'
   *               employeeTypeId:
   *                 type: integer
   *                 description: Employee type id
   *                 required: true
   *                 default: 0
   *               employeeBusinessEmail:
   *                 type: string
   *                 description: Employee business email
   *                 required: false
   *                 default: ''
   *               employeeTypeOfContract:
   *                 type: string
   *                 description: Employee type of contract
   *                 required: true
   *                 default: ''
   *               employeeIgnoreConsecutiveAbsences:
   *                 type: boolean
   *                 description: If true, the employee is not considered on report consecutive faults
   *                 required: true
   *                 default: 0
   *               employeeTerminatedDate:
   *                 type: string
   *                 format: date
   *                 description: Employee terminated date (YYYY-MM-DD)
   *                 required: false
   *                 default: ''
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async update({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const employeeFirstName = request.input('employeeFirstName')
      const employeeLastName = request.input('employeeLastName')
      const employeeSecondLastName = request.input('employeeSecondLastName')
      const employeeCode = request.input('employeeCode')
      const employeePayrollNum = request.input('employeePayrollNum')

      let employeeHireDate = request.input('employeeHireDate')
      employeeHireDate = employeeHireDate ? (employeeHireDate.split('T')[0] + ' 00:000:00').replace('"', '') : null

      const companyId = request.input('companyId')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const employeeWorkSchedule = request.input('employeeWorkSchedule')
      const employeeTypeId = request.input('employeeTypeId')
      const employeeBusinessEmail = request.input('employeeBusinessEmail')
      const employeeTypeOfContract = request.input('employeeTypeOfContract')
      const dailySalary = request.input('dailySalary') || 0
      const payrollBusinessUnitId = request.input('payrollBusinessUnitId')
      const employeeAssistDiscriminator = request.input('employeeAssistDiscriminator')
      const employeeIgnoreConsecutiveAbsences = request.input('employeeIgnoreConsecutiveAbsences')

      let employeeTerminatedDate = request.input('employeeTerminatedDate')
      employeeTerminatedDate = employeeTerminatedDate ? (employeeTerminatedDate.split('T')[0] + ' 00:000:00').replace('"', '') : null

      const employee = {
        employeeId: employeeId,
        employeeFirstName: employeeFirstName,
        employeeLastName: `${employeeLastName}`,
        employeeSecondLastName: `${employeeSecondLastName}`,
        employeeCode: employeeCode,
        employeePayrollNum: employeePayrollNum,
        employeeHireDate: employeeHireDate,
        companyId: companyId,
        departmentId: departmentId,
        positionId: positionId,
        businessUnitId: request.input('businessUnitId'),
        dailySalary: dailySalary,
        payrollBusinessUnitId: payrollBusinessUnitId,
        employeeWorkSchedule: employeeWorkSchedule,
        employeeTypeId: employeeTypeId,
        employeeBusinessEmail: employeeBusinessEmail,
        employeeAssistDiscriminator: employeeAssistDiscriminator,
        employeeTypeOfContract: employeeTypeOfContract,
        employeeIgnoreConsecutiveAbsences: employeeIgnoreConsecutiveAbsences,
        employeeTerminatedDate: employeeTerminatedDate,
      } as Employee

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { ...employee },
        }
      }

      const currentEmployee = await Employee.query()
        .where('employee_id', employeeId)
        .withTrashed()
        .first()

        if (!currentEmployee) {
        response.status(404)

        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { ...employee },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const data = await request.validateUsing(updateEmployeeValidator)
      const exist = await employeeService.verifyInfoExist(employee)

      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }

      const verifyInfo = await employeeService.verifyInfo(employee)

      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }

      const updateEmployee = await employeeService.update(currentEmployee, employee)

      if (updateEmployee) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was updated successfully',
          data: { employee: updateEmployee },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: delete employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async delete({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const currentEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', employeeId)
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const deleteEmployee = await employeeService.delete(currentEmployee)
      if (deleteEmployee) {
        response.status(201)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was deleted successfully',
          data: { employee: deleteEmployee },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employee by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)
      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was found successfully',
          data: { employee: showEmployee },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-by-code/{employeeCode}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get employee by code
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeCode
   *         schema:
   *           type: string
   *         description: Employee code
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getByCode({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const employeeCode = request.param('employeeCode')
      if (!employeeCode) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee code was not found',
          data: { employeeCode },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.getByCode(employeeCode, userResponsibleId)
      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered code',
          data: { employeeCode },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The employee was found successfully',
          data: { employee: showEmployee },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/without-user:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async indexWithOutUser({ request, response, i18n }: HttpContext) {
    try {
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        page: page,
        limit: limit,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.indexWithOutUser(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/photo:
   *   put:
   *     summary: Upload a photo for an employee
   *     tags:
   *       - Employees
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the employee
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *                 description: The photo file to upload
   *     responses:
   *       200:
   *         description: Photo uploaded successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 url:
   *                   type: string
   *                   description: URL of the uploaded photo
   *       400:
   *         description: Bad Request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   description: Error message
   *       500:
   *         description: Internal Server Error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   description: Error message
   *                 error:
   *                   type: object
   *                   description: Error details
   */
  @inject()
  async uploadPhoto(
    { request, response, i18n }: HttpContext,
    uploadService: UploadService
  ) {
    const employeeService = new EmployeeService(i18n)

    const validationOptions = {
      types: ['image'],
      size: '2mb',
    }
    const employeeId = request.param('employeeId')
    const photo = request.file('photo', validationOptions)
    // validate file required
    if (!photo) {
      return response.status(400).send({ message: 'Please upload a photo' })
    }

    const currentEmployee = await Employee.query().where('employee_id', employeeId).first()
    if (!currentEmployee) {
      return response.status(404).send({ message: 'Employee not found' })
    }
    // get file name and extension
    const fileName = `${new Date().getTime()}_${photo.clientName}`

    // get employee and update employee photo
    try {
      const photoUrl = await uploadService.fileUpload(photo, 'employees', fileName)
      if (currentEmployee.employeePhoto) {
        await uploadService.deleteFile(currentEmployee.employeePhoto)
      }
      const employee = await employeeService.updateEmployeePhotoUrl(employeeId, photoUrl)
      return response.status(200).send({ url: photoUrl, employee })
    } catch (error) {
      return response.status(500).send({ message: 'Error uploading file', error })
    }
  }

  /**
   * @swagger
   * /api/employees/get-work-schedules:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all work schedules
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getWorkSchedules({ response, i18n }: HttpContext) {
    try {
      const employeeService = new EmployeeService(i18n)
      const employeeWorkSchedules = await employeeService.getWorkSchedules()
      response.status(200)
      return {
        type: 'success',
        title: 'Employee work schedules',
        message: 'The employee work schedules were found successfully',
        data: {
          employeeWorkSchedules,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/proceeding-files:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get proceeding files by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getProceedingFiles({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const fileType = Number.parseInt(request.input('type'))

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const proceedingFiles = await employeeService.getProceedingFiles(employeeId, fileType)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The proceeding files were found successfully',
        data: { data: proceedingFiles },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-used:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get vacations used in current period by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getVacationsUsed({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const vacations = await employeeService.getVacationsUsed(employee)
      if (vacations.status === 200) {
        response.status(vacations.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The vacations used were found successfully',
          data: { vacations: vacations.data },
        }
      } else {
        response.status(vacations.status)
        return {
          type: vacations.type,
          title: vacations.title,
          message: vacations.message,
          data: { vacations: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-corresponding:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get vacations corresponding in current period by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getVacationsCorresponding({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const vacations = await employeeService.getDaysVacationsCorresponing(employee)
      if (vacations.status === 200) {
        response.status(vacations.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The vacations corresponding were found successfully',
          data: { vacations: vacations.data },
        }
      } else {
        response.status(vacations.status)
        return {
          type: vacations.type,
          title: vacations.title,
          message: vacations.message,
          data: { vacations: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-years-worked:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get years workedin by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: year
   *         in: query
   *         required: false
   *         description: Year
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getYearsWorked({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const year = request.input('year')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const yearsWorked = await employeeService.getYearsWorked(employee, year)
      if (yearsWorked.status === 200) {
        response.status(yearsWorked.status)
        return {
          type: 'success',
          title: 'Employees',
          message: 'The years worked were found successfully',
          data: { yearsWorked: yearsWorked.data },
        }
      } else {
        response.status(yearsWorked.status)
        return {
          type: yearsWorked.type,
          title: yearsWorked.title,
          message: yearsWorked.message,
          data: { yearsWorked: 0 },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-vacations-by-period:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get years workedin by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: vacationSettingId
   *         in: query
   *         required: true
   *         description: Vacation Setting Id
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getVacationsByPeriod({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const vacationSettingId = request.input('vacationSettingId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const employeeService = new EmployeeService(i18n)
      const employee = await employeeService.show(employeeId)
      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      if (!vacationSettingId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The vacation setting id was not found',
          data: { vacationSettingId },
        }
      }
      const employeeType = await EmployeeType.query()
        .whereNull('employee_type_deleted_at')
        .where('employee_type_id', employee.employeeTypeId)
        .first()
      let employeeIsCrew = false
      if (employeeType) {
        if (
          employeeType.employeeTypeSlug === 'pilot' ||
          employeeType.employeeTypeSlug === 'flight-attendant'
        ) {
          employeeIsCrew = true
        }
      }
      const vacationSetting = await VacationSetting.query()
        .where('vacation_setting_id', vacationSettingId)
        .whereNull('vacation_setting_deleted_at')
        .if(employeeIsCrew, (query) => {
          query.where('vacation_setting_crew', 1)
        })
      if (!vacationSetting) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The vacation setting was not found',
          message: 'The vacation setting was not found with the entered ID',
          data: { vacationSettingId },
        }
      }
      const vacations = await employeeService.getVacationsByPeriod(
        employee.employeeId,
        vacationSettingId
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The vacations were found successfully',
        data: { vacations: vacations },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/employee-generate-excel:
   *   get:
   *     tags:
   *       - Employees
   *     summary: Generate an Excel report of employees
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - in: query
   *         name: departmentId
   *         schema:
   *           type: integer
   *         description: ID of the department to filter
   *       - in: query
   *         name: positionId
   *         schema:
   *           type: integer
   *         description: ID of the position to filter
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: ID of the employee to filter
   *       - name: workSchedule
   *         in: query
   *         required: false
   *         description: Employee work schedule
   *         schema:
   *           type: string
   *       - name: onlyInactive
   *         in: query
   *         required: false
   *         description: Include only inactive
   *         default: false
   *         schema:
   *           type: boolean
   *       - name: employeeTypeId
   *         in: query
   *         required: false
   *         description: Employee Type Id
   *         schema:
   *           type: integer
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering
   *     responses:
   *       200:
   *         description: Excel file generated successfully
   *       404:
   *         description: No employees found
   *       500:
   *         description: Error generating Excel file
   */
  async getExcel({ auth, request, response }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
      const businessUnitsList = businessUnits.map((business) => business.businessUnitId)
      const search = request.qs().search
      const departmentId = request.qs().departmentId
      const positionId = request.qs().positionId
      const employeeId = request.qs().employeeId
      const filterStartDate = request.qs().startDate
      const filterEndDate = request.qs().endDate
      const employeeTypeId = request.qs().employeeTypeId
      const workSchedule = request.qs().workSchedule
      const onlyInactive = request.qs().onlyInactive

      let queryEmployees = Employee.query()
        .if(search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_code) = ?', [`${search.toUpperCase()}`])
              .orWhereHas('person', (personQuery) => {
                personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [`%${search.toUpperCase()}%`])
                personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [`%${search.toUpperCase()}%`])
                personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                  `%${search.toUpperCase()}%`,
                ])
              })
          })
        })
        .if(workSchedule, (query) => {
          query.where((subQuery) => {
            subQuery.whereRaw('UPPER(employee_work_schedule) LIKE ?', [
              `%${workSchedule.toUpperCase()}%`,
            ])
          })
        })
        .if(employeeId, (query) => {
          query.where('employee_id', employeeId)
        })
        .if(departmentId, (query) => {
          query.where('department_id', departmentId)
        })
        .if(departmentId && positionId, (query) => {
          query.where('department_id', departmentId)
          query.where('position_id', positionId)
        })
        .if(onlyInactive && (onlyInactive === 'true' || onlyInactive === true), (query) => {
          query.whereNotNull('employee_deleted_at')
          query.withTrashed()
        })
        .if(employeeTypeId, (query) => {
          query.where('employee_type_id', employeeTypeId ? employeeTypeId : 0)
        })

      if (filterStartDate && filterEndDate) {
        const startDate = DateTime.fromISO(filterStartDate)
        const endDate = DateTime.fromISO(filterEndDate)
        const startDateSQL = startDate?.toSQLDate()
        const endDateSQL = endDate?.toSQLDate()

        if (startDateSQL && endDateSQL) {
          queryEmployees = queryEmployees.whereBetween('employeeHireDate', [
            startDateSQL,
            endDateSQL,
          ])
        }
      }
      const employees = await queryEmployees
        .whereIn('businessUnitId', businessUnitsList)
        .if(userResponsibleId &&
          typeof userResponsibleId && userResponsibleId > 0,
          (query) => {
            query.where((subQuery) => {
              subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
                userResponsibleEmployeeQuery.where('userId', userResponsibleId!)
              })
              subQuery.orWhereHas('person', (personQuery) => {
                personQuery.whereHas('user', (userQuery) => {
                  userQuery.where('userId', userResponsibleId!)
                })
              })
            })
          }
        )
        .preload('department')
        .preload('position')
        .preload('person')
        .exec()
      if (employees.length === 0) {
        return response.status(404).send({
          message: 'No employees found',
        })
      }
      // Crear un nuevo libro de Excel
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Employee Report')
      const imageLogo = await this.getLogo()
      const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
      const imageBuffer = imageResponse.data
      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      })
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 139, height: 49 },
      })
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:F1')

      // Agregar título
      const titleRow = worksheet.addRow(['Employee Report'])
      let titleColor = '244062'
      let titleFgColor = 'FFFFFFFF'
      titleRow.font = { bold: true, size: 24, color: { argb: titleFgColor } }
      titleRow.height = 42
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:K2')
      worksheet.getCell('A2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: titleColor },
      }
      // Agregar fila de periodos
      const periodRow = worksheet.addRow([''])
      periodRow.font = { size: 15, color: { argb: titleFgColor } }
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A3:K3')
      let periodColor = '366092'
      worksheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: periodColor },
      }
      this.addHeadRow(worksheet, employees)

      for (const employee of employees) {
        const department = await Department.find(employee.departmentId)
        const departmentName = department?.departmentName || 'N/A'
        const hireDate = employee.employeeHireDate
          ? employee.employeeHireDate.toFormat('yyyy-MM-dd')
          : ''
        worksheet.addRow({
          employeeId: employee.employeeId,
          employeeFirstName: `${employee.person?.personFirstname}`,
          employeeLastName: `${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
          departmentName,
          positionName: employee.positionId,
          employeeHireDate: hireDate,
        })
      }
      this.addRowExcelEmpty(worksheet)

      const buffer = await workbook.xlsx.writeBuffer()

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header('Content-Disposition', 'attachment; filename=employees.xlsx')
      response.status(201).send(buffer)
    } catch (error) {
      response.status(500).send({
        message: 'Error generating Excel file',
        error: error.message,
      })
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/reactivate:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: reactivate employee
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async reactivate({ request, response }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { ...request.all() },
        }
      }
      const currentEmployee = await Employee.query()
        .whereNotNull('employee_deleted_at')
        .where('employee_id', employeeId)
        .withTrashed()
        .first()
      if (!currentEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      currentEmployee.deletedAt = null
      await currentEmployee.save()
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employee was reactivate successfully',
        data: { employee: currentEmployee },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/export-excel:
   *   get:
   *     summary: Export shift exceptions of an employee to Excel
   *     description: Generates an Excel file containing shift exceptions for a specific employee, filtered by hire date and current date. Excludes exceptions of type "Día de descanso".
   *     tags:
   *       - Employees
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID of the employee
   *     responses:
   *       201:
   *         description: Excel file generated successfully
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       500:
   *         description: Error generating Excel file
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 error:
   *                   type: string
   */
  async exportShiftExceptionsToExcel({ params, response }: HttpContext) {
    try {
      const employeeId = params.employeeId

      const employee = await Employee.query()
        .where('employeeId', employeeId)
        .preload('person')
        .preload('department')
        .preload('position')
        .preload('shift_exceptions', (shiftExceptionsQuery) => {
          shiftExceptionsQuery.whereNull('shift_exceptions_deleted_at')
        })
        .firstOrFail()

      if (!employee.employeeHireDate) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee hire date was not found',
          data: { employee },
        }
      }

      const hireDate =
        employee.employeeHireDate instanceof DateTime
          ? employee.employeeHireDate.toJSDate()
          : new Date(employee.employeeHireDate)
      const currentDate = DateTime.local().toJSDate()

      const shiftExceptions = await ShiftException.query()
        .where('employeeId', employeeId)
        .whereBetween('shiftExceptionsDate', [hireDate, currentDate])
        .whereNot('exception_type_id', 9)
        .preload('exceptionType')
      // Obtener los turnos asignados al empleado durante el periodo
      const employeeShifts = await EmployeeShift.query()
        .where('employeeId', employeeId)
        .whereNull('deletedAt') // Excluir registros eliminados
        .whereBetween('employeShiftsApplySince', [hireDate, currentDate])
        .preload('shift')

      // Crear un mapa de fechas y turnos para facilitar la asociación
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Shift Exceptions')

      const imageLogo = await this.getLogo()
      const imageResponse = await axios.get(imageLogo, { responseType: 'arraybuffer' })
      const imageBuffer = imageResponse.data
      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: 'png',
      })
      worksheet.addImage(imageId, {
        tl: { col: 0.38, row: 0.99 },
        ext: { width: 139, height: 50 },
      })
      worksheet.getRow(1).height = 60
      worksheet.mergeCells('A1:G1')

      const titleRow = worksheet.addRow(['Employee Shift Exceptions'])
      titleRow.font = { bold: true, size: 24, color: { argb: 'FFFFFFFF' } }
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.mergeCells('A2:G2')
      worksheet.getCell('A' + 2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '244062' },
      }

      const periodRow = worksheet.addRow([
        `From: ${hireDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} , ${currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ])
      periodRow.font = { italic: true, size: 12, color: { argb: 'FFFFFFFF' } }
      worksheet.mergeCells('A3:G3')
      periodRow.alignment = { horizontal: 'center', vertical: 'middle' }
      worksheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '365F8B' },
      }
      const headerRow = worksheet.addRow([
        'Employee ID',
        'Employee Name',
        'Department',
        'Position',
        'Date',
        'Shift Assigned',
        'Exception Notes',
      ])
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
      worksheet.columns = [
        { key: 'employeeCode', width: 20 },
        { key: 'employeeName', width: 30 },
        { key: 'department', width: 30 },
        { key: 'position', width: 30 },
        { key: 'date', width: 20 },
        { key: 'shiftAssigned', width: 35 },
        { key: 'exceptionNotes', width: 30 },
      ]
      worksheet.columns.forEach((col) => {
        col.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      headerRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colNumber <= 5 ? '538DD5' : '16365C' },
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      shiftExceptions.forEach((exception) => {
        const shiftsForDate = employeeShifts
          .filter(
            (employeeShift) =>
              new Date(employeeShift.employeShiftsApplySince).toDateString() !==
              new Date(exception.shiftExceptionsDate).toDateString()
          )
          .map((employeeShift) => employeeShift.shift?.shiftName) // Obtén los nombres de los turnos

        const shiftNames = shiftsForDate.length > 0 ? shiftsForDate.join(', ') : 'N/A'

        const row = worksheet.addRow({
          employeeCode: employee.employeeCode,
          employeeName: `${employee.person?.personFirstname} ${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
          department: employee.department?.departmentName || 'N/A',
          position: employee.position?.positionName || 'N/A',
          date: exception.shiftExceptionsDate,
          shiftAssigned: shiftNames,
          exceptionNotes: exception.shiftExceptionsDescription || 'N/A',
        })
        const exceptionNotesCell = row.getCell('exceptionNotes')
        const exceptionTypeName = exception.exceptionType?.exceptionTypeTypeName || 'N/A'
        const description = exception.shiftExceptionsDescription || 'N/A'
        exceptionNotesCell.value = {
          richText: [
            { text: exceptionTypeName + ': ', font: { bold: true } },
            { text: description },
          ],
        }
      })

      const buffer = await workbook.xlsx.writeBuffer()

      response.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      response.header(
        'Content-Disposition',
        'attachment; filename="shift_exceptions_employee.xlsx"'

      )
      response.status(201).send(buffer)
    } catch (error) {
      response.status(500).send({
        message: 'Error generating Excel file',
        error: error.message,
      })
    }
  }

  private async verify(employee: BiometricEmployeeInterface, employeeService: EmployeeService) {
    const existEmployee = await Employee.query()
      .where('employee_code', employee.empCode)
      .withTrashed()
      .first()
    if (!existEmployee) {
      await employeeService.syncCreate(employee)
    }
  }

  // Método para agregar fila de encabezado
  addHeadRow(worksheet: ExcelJS.Worksheet, employees: any[]) {
    const headerRow = worksheet.addRow([
      'Employee Code',
      'Employee Name',
      'Department',
      'Position',
      'Hire Date',
      'Work Modality',
      'Phone',
      'Gender',
      'CURP',
      'RFC',
      'Employee NSS',
    ])

    let fgColor = 'FFFFFFF'
    let color = '538DD5'
    for (let col = 1; col <= 5; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }

    color = '16365C'
    for (let col = 6; col <= 8; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }

    color = '538DD5'
    for (let col = 9; col <= 11; col++) {
      const cell = worksheet.getCell(4, col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      }
    }

    headerRow.height = 30
    headerRow.font = { bold: true, color: { argb: fgColor } }

    this.adjustColumnWidths(worksheet)
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }, // Fija la primera fila
      { state: 'frozen', ySplit: 2 }, // Fija la segunda fila
      { state: 'frozen', ySplit: 3 }, // Fija la tercer fila
      { state: 'frozen', ySplit: 4 }, // Fija la cuarta fila
    ]
    employees.forEach((employee) => {
      worksheet.addRow([
        employee.employeeCode,
        `${employee.person?.personFirstname} ${employee.person?.personLastname} ${employee.person?.personSecondLastname}`,
        employee.department?.departmentName || '',
        employee.position?.positionName || '',
        employee.employeeHireDate ? employee.employeeHireDate.toISODate() : '',
        employee.employeeWorkSchedule || '',
        employee.person?.personPhone || '',
        employee.person?.personGender || '',
        employee.person?.personCurp || '',
        employee.person?.personRfc || '',
        employee.person?.personImssNss || '',
      ])
    })
  }

  adjustColumnWidths(worksheet: ExcelJS.Worksheet) {
    const widths = [20, 44, 44, 44, 25, 25, 25, 25, 25, 25, 25, 25, 30, 30, 30]
    widths.forEach((width, index) => {
      const column = worksheet.getColumn(index + 1)
      column.width = width
      column.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  }

  addRowExcelEmpty(worksheet: ExcelJS.Worksheet) {
    worksheet.addRow([])
  }

  async getLogo() {
    let imageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if (systemSettingActive.systemSettingLogo) {
        imageLogo = systemSettingActive.systemSettingLogo
      }
    }
    return imageLogo
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/contracts:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get contracts by employee id
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getContracts({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee Id was not found',
          message: 'Missing data to process',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const contracts = await employeeService.getContracts(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The contracts were found successfully',
        data: { data: contracts },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/banks:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get banks by employee id
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getBanks({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const banks = await employeeService.getBanks(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The banks were found successfully',
        data: { data: banks },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-birthday:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all birthday
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getBirthday({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const year = request.input('year')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getBirthday(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-anniversary:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all anniversaries
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getAnniversary({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const year = request.input('year')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getAnniversary(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-vacations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all vacations
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: year
   *         in: query
   *         required: true
   *         description: Year
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getVacations({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const year = request.input('year')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        year: year,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getVacations(filters)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees vacations were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-all-vacations-by-period:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all vacations by period
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: DepartmentId
   *         schema:
   *           type: integer
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: PositionId
   *         schema:
   *           type: integer
   *       - name: dateStart
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Start date for filtering
   *       - name: dateEnd
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: End date for filtering
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getAllVacationsByPeriod({ auth, request, response, i18n }: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      let userResponsibleId = null
      if (user) {
        await user.preload('role')
        if (user.role.roleSlug !== 'root') {
          userResponsibleId = user?.userId
        }
      }
      const userService = new UserService(i18n)
      let departmentsList = [] as Array<number>
      if (user) {
        departmentsList = await userService.getRoleDepartments(user.userId)
      }
      const search = request.input('search')
      const departmentId = request.input('departmentId')
      const positionId = request.input('positionId')
      const dateStart = request.input('dateStart')
      const dateEnd = request.input('dateEnd')
      const filters = {
        search: search,
        departmentId: departmentId,
        positionId: positionId,
        dateStart: dateStart,
        dateEnd: dateEnd,
        userResponsibleId: userResponsibleId,
      } as EmployeeFilterSearchInterface
      const employeeService = new EmployeeService(i18n)
      const employees = await employeeService.getAllVacationsByPeriod(filters, departmentsList)
      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees vacations were found successfully',
        data: {
          employees,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/{employeeId}/get-days-work-disability:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get days work disability by employee id
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *       - name: datePay
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Pay date for filtering
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getDaysWorkDisability({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }
      const datePay = request.input('datePay')

      if (!datePay) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The date pay was not found',
          data: { datePay },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }
      const assistService = new AssistsService(i18n)
      const days = await assistService.getDaysWorkDisability(showEmployee, datePay)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The days work disability were found successfully',
        data: { data: days },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-days-work-disability-all:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get days work disability all employees
   *     parameters:
   *       - name: datePay
   *         in: query
   *         schema:
   *           type: string
   *           format: date
   *         description: Pay date for filtering
   *       - name: departmentId
   *         in: query
   *         required: false
   *         description: Department Id
   *         schema:
   *           type: integer
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Employee Id
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getDaysWorkDisabilityAll({ request, response, i18n }: HttpContext) {
    try {

      const datePay = request.input('datePay')

      if (!datePay) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The date pay was not found',
          data: { datePay },
        }
      }
      const departmentId = request.input('departmentId')
      const employeeId = request.input('employeeId')

      const assistService = new AssistsService(i18n)
      const filter = {
        datePay: datePay,
        departmentId: departmentId ? departmentId : 0,
        employeeId: employeeId ? employeeId : 0,
      } as EmployeeWorkDaysDisabilityFilterInterface

      const employees = await assistService.getDaysWorkDisabilityAll(filter)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees with days work disability were found successfully',
        data: { data: employees },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  // async odooAuth() {
  //   const url = 'https://servicios-aereos-estrella.odoo.com'
  //   const db = 'servicios-aereos-estrella'
  //   const username = 'wramirez@siler-mx.com'
  //   const password = 'RQU2tre-vag8qnk0czp'

  //   try {
  //     const response = await client.post(
  //       `${url}/web/session/authenticate`,
  //       {
  //         jsonrpc: '2.0',
  //         params: {
  //           db,
  //           login: username,
  //           password,
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     if (response.data.result) {
  //       console.log('Autenticación exitosa')
  //       return true
  //     } else {
  //       console.error('Error en la autenticación:', response.data.error)
  //       return false
  //     }
  //   } catch (error) {
  //     console.error(`Error en la autenticación: ${error.message}`)
  //     return false
  //   }
  // }

  // async getOdooEmployees() {
  //   const authenticated = await this.odooAuth()

  //   if (authenticated) {
  //     try {
  //       const url = 'https://servicios-aereos-estrella.odoo.com'
  //       const response = await client.post(
  //         `${url}/web/dataset/call_kw`,
  //         {
  //           jsonrpc: '2.0',
  //           method: 'call',
  //           params: {
  //             model: 'hr.employee',
  //             method: 'search_read',
  //             args: [[]],
  //             kwargs: {},
  //           },
  //         },
  //         {
  //           withCredentials: true,
  //         }
  //       )

  //       return response.data.result
  //     } catch (error) {
  //       console.error(`Error al obtener empleados: ${error.message}`)
  //       if (error.response) {
  //         console.error('Detalles del error:', error.response.data)
  //       }
  //       return null
  //     } finally {
  //       // Cerrar sesión independientemente del resultado
  //       await this.closeOdooSession()
  //     }
  //   }
  //   return null
  // }

  // async closeOdooSession() {
  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'
  //     const response = await client.post(
  //       `${url}/web/session/destroy`,
  //       {
  //         jsonrpc: '2.0',
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     console.log('Sesión cerrada correctamente')
  //     return true
  //   } catch (error) {
  //     console.error(`Error al cerrar sesión: ${error.message}`)
  //     return false
  //   }
  // }

  /**
   * Crea un nuevo empleado en Odoo sin usuario asociado
   * @param {Object} employeeData - Datos del empleado a crear
   * @param {string} employeeData.name - Nombre completo del empleado (obligatorio)
   * @param {Object} [employeeData.additionalFields] - Campos adicionales para el empleado
   * @returns {Promise<number|null>} - ID del empleado creado o null en caso de error
   */
  // async createOdooEmployee(employeeData) {
  //   const authenticated = await this.odooAuth()

  //   if (!authenticated) {
  //     console.error('No se pudo autenticar para crear el empleado')
  //     return null
  //   }

  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'

  //     // Validar que se proporcionó un nombre
  //     if (!employeeData.name) {
  //       throw new Error('El nombre del empleado es obligatorio')
  //     }

  //     // Preparar los datos del empleado
  //     const employeeVals = {
  //       name: employeeData.name,
  //     }

  //     // Añadir campos adicionales si se proporcionan
  //     if (employeeData.additionalFields) {
  //       Object.assign(employeeVals, employeeData.additionalFields)
  //     }

  //     // Crear el empleado
  //     const response = await client.post(
  //       `${url}/web/dataset/call_kw`,
  //       {
  //         jsonrpc: '2.0',
  //         method: 'call',
  //         params: {
  //           model: 'hr.employee',
  //           method: 'create',
  //           args: [employeeVals],
  //           kwargs: {},
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     const employeeId = response.data.result
  //     console.log(`Empleado creado exitosamente con ID: ${employeeId}`)
  //     return employeeId
  //   } catch (error) {
  //     console.error(`Error al crear empleado: ${error.message}`)
  //     if (error.response && error.response.data) {
  //       console.error('Detalles del error:', error.response.data)
  //     }
  //     return null
  //   } finally {
  //     // Cerrar sesión después de la operación
  //     await this.closeOdooSession()
  //   }
  // }

  // async createNewOdooEmployee() {
  //   try {
  //     // Crear un empleado sin usuario vinculado
  //     const empleadoId = await this.createOdooEmployee({
  //       name: 'Empleado de Prueba',
  //       additionalFields: {
  //         // department_id: 1, // ID del departamento
  //         // job_id: 2, // ID del puesto de trabajo
  //         work_phone: '5551234567',
  //         work_email: 'carlos.rodriguez@ejemplo.com',
  //         // work_location_id: 1, // ID de la ubicación de trabajo
  //         mobile_phone: '5559876543',
  //         // coach_id: 5, // ID del supervisor
  //         // Otros campos según necesites
  //       },
  //     })

  //     return empleadoId
  //   } catch (error) {
  //     console.error('Error en el proceso:', error);
  //   }
  // }

  // async getOdooGroups() {
  //   const authenticated = await this.odooAuth()

  //   if (!authenticated) {
  //     console.error('No se pudo autenticar para obtener los grupos')
  //     return null
  //   }

  //   try {
  //     const url = 'https://servicios-aereos-estrella.odoo.com'

  //     // Buscar grupos de seguridad
  //     const response = await client.post(
  //       `${url}/web/dataset/call_kw`,
  //       {
  //         jsonrpc: '2.0',
  //         method: 'call',
  //         params: {
  //           model: 'res.groups',
  //           method: 'search_read',
  //           args: [[]],
  //           kwargs: {
  //             fields: ['id', 'name', 'category_id', 'comment'],
  //             order: 'category_id, name',
  //           },
  //         },
  //       },
  //       {
  //         withCredentials: true,
  //       }
  //     )

  //     console.log('Grupos obtenidos exitosamente')
  //     const groups = response.data.result

  //     if (groups && groups.length > 0) {
  //       console.log('groups de seguridad disponibles:')

  //       // Organizar por categoría
  //       const groupsByCategory = {}

  //       groups.forEach((group) => {
  //         const categoryName = group.category_id ? group.category_id[1] : 'Sin categoría'

  //         if (!groupsByCategory[categoryName]) {
  //           groupsByCategory[categoryName] = []
  //         }

  //         groupsByCategory[categoryName].push({
  //           id: group.id,
  //           name: group.name,
  //           description: group.comment || 'Sin descripción',
  //         })
  //       })

  //       // Mostrar groups organizados por categoría
  //       for (const category in groupsByCategory) {
  //         console.log(`\n--- ${category} ---`)
  //         groupsByCategory[category].forEach((group) => {
  //           console.log(`ID: ${group.id}, Nombre: ${group.name}`)
  //         })
  //       }

  //       // Buscar específicamente el grupo "Empleado"
  //       const grupoEmpleado = groups.find(
  //         (g) => g.name.toLowerCase() === 'employee' || g.name.toLowerCase() === 'empleado'
  //       )

  //       if (grupoEmpleado) {
  //         console.log(`\nEl grupo "Empleado" tiene el ID: ${grupoEmpleado.id}`)
  //         return grupoEmpleado
  //       } else {
  //         console.log('\nNo se encontró un grupo con el nombre exacto "Empleado"')
  //       }
  //     } else {
  //       console.log('No se pudieron obtener los groups o la lista está vacía')
  //     }
  //   } catch (error) {
  //     console.error(`Error al obtener groups: ${error.message}`)
  //     if (error.response && error.response.data) {
  //       console.error('Detalles del error:', error.response.data)
  //     }
  //     return null
  //   } finally {
  //     // Cerrar sesión después de la operación
  //     await this.closeOdooSession()
  //   }
  // }


  /**
   * @swagger
   * /api/employees/{employeeId}/user-responsibles/{userId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get user responsibles by employee id
   *     parameters:
   *       - in: query
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: ID of the employee to filter
   *       - in: query
   *         required: false
   *         name: userId
   *         schema:
   *           type: integer
   *         description: ID of the user to filter
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getUserResponsible({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')
      const userId = request.param('userId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeService = new EmployeeService(i18n)
      const showEmployee = await employeeService.show(employeeId)

      if (!showEmployee) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee was not found',
          message: 'The employee was not found with the entered ID',
          data: { employeeId },
        }
      }

      const userResponsibles = await employeeService.getUserResponsible(employeeId, userId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The user responsibles were found successfully',
        data: { data: userResponsibles },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/proxy-image:
   *   get:
   *     tags:
   *       - Employees
   *     summary: Proxy endpoint to serve external images securely
   *     parameters:
   *       - in: query
   *         name: url
   *         required: true
   *         schema:
   *           type: string
   *         description: URL of the external image to proxy
   *     responses:
   *       '200':
   *         description: Image served successfully
   *         content:
   *           image/*:
   *             schema:
   *               type: string
   *               format: binary
   *       '400':
   *         description: Invalid or missing URL parameter
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *       '500':
   *         description: Error loading the image
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   */
  async proxyImage({ request, response }: HttpContext) {
    try {
      const imageUrl = request.input('url')

      if (!imageUrl) {
        response.status(400)
        return {
          type: 'error',
          title: 'Invalid request',
          message: 'URL parameter is required',
        }
      }

      // Validar que la URL sea válida
      try {
        new URL(imageUrl)
      } catch {
        response.status(400)
        return {
          type: 'error',
          title: 'Invalid URL',
          message: 'The provided URL is not valid',
        }
      }

      // Validar que la URL apunte a un dominio permitido (opcional, por seguridad)
      const allowedDomains = [
        '201.150.46.146:81',
        'sfo3.digitaloceanspaces.com'
        // Agrega aquí los dominios que consideres seguros
      ]

      const urlObject = new URL(imageUrl)
      // Crear el host completo (hostname + puerto si existe)
      const fullHost = urlObject.port
        ? `${urlObject.hostname}:${urlObject.port}`
        : urlObject.hostname

      if (allowedDomains.length > 0 && !allowedDomains.includes(fullHost) && !allowedDomains.includes(urlObject.hostname)) {
        response.status(403)
        return {
          type: 'error',
          title: 'Forbidden domain',
          message: `The requested domain "${fullHost}" is not allowed`,
        }
      }

      // Realizar la petición a la imagen externa
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 10000, // 10 segundos de timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
        },
      })

      // Obtener el content-type de la respuesta
      const contentType = imageResponse.headers['content-type']

      // Validar que sea realmente una imagen
      if (!contentType || !contentType.startsWith('image/')) {
        response.status(400)
        return {
          type: 'error',
          title: 'Invalid content type',
          message: 'The requested URL does not point to an image',
        }
      }

      // Configurar las cabeceras de respuesta
      response.header('Content-Type', contentType)
      response.header('Cache-Control', 'public, max-age=86400') // Cache por 24 horas

      // Transmitir la imagen
      return response.stream(imageResponse.data)

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        response.status(408)
        return {
          type: 'error',
          title: 'Request timeout',
          message: 'The image request timed out',
        }
      }

      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Error loading the image',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/get-biometrics:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: get all biometrics
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getBiometrics({ response, i18n }: HttpContext) {
    try {
      const employeeService = new EmployeeService(i18n)
      let employeesSync = [] as EmployeeSyncInterface[]
      employeesSync = await employeeService.getEmployeesToSyncFromBiometrics()
      response.status(200)

      return {
        type: 'success',
        title: 'Employees',
        message: 'The employees were found successfully',
        data: {
          employeesSync
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/synchronization/by-selection/employees:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: sync information by selection
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employees:
   *                 type: array
   *                 description: Employees selected
   *                 required: true
   *                 default: []
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async synchronizationBySelection({ request, response, i18n }: HttpContext) {
    try {
      const employees = request.input('employees')
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)

      const businessUnitsList = businessUnits.map((business) => business.businessUnitName)
      const params = new URLSearchParams()
      params.set('employees', employees.join(','))

      let apiUrl = `${env.get('API_BIOMETRICS_HOST')}/employees-by-selection?${params.toString()}`
      const apiResponse = await axios.get(apiUrl)
      const data = apiResponse.data
      let withOutDepartmentId = null
      let withOutPositionId = null

      const department = await Department.query()
        .whereNull('department_deleted_at')
        .where('department_name', 'Sin departamento')
        .first()
      if (department) {
        withOutDepartmentId = department.departmentId
      }
      const position = await Position.query()
        .whereNull('position_deleted_at')
        .where('position_name', 'Sin posición')
        .first()
      if (position) {
        withOutPositionId = position.positionId
      }
      const roles = await Role.query()
        .whereIn('role_slug', ['rh-manager', 'admin', 'nominas'])
        .whereNull('role_deleted_at')

      let usersResponsible: Array<User> = []

      if (roles.length) {
        const roleIds = roles.map((role) => role.roleId)
        usersResponsible = await User.query()
          .whereIn('role_id', roleIds)
          .preload('role')
          .orderBy('user_id')
      }

      if (data) {
        const employeeService = new EmployeeService(i18n)
        data.sort((a: BiometricEmployeeInterface, b: BiometricEmployeeInterface) => a.id - b.id)

        let employeeCountSaved = 0

        for await (const employee of data) {
          let existInBusinessUnitList = false
          let businessUnitApply = null

          if (employee.payrollNum) {
            if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${employee.payrollNum}`.toLocaleLowerCase())) {
              existInBusinessUnitList = true
              businessUnitApply = businessUnits.find((business) => `${business.businessUnitName}`.toLocaleLowerCase() === `${employee.payrollNum}`.toLocaleLowerCase())
            }
          } else if (employee.personnelEmployeeArea.length > 0) {
            for await (const personnelEmployeeArea of employee.personnelEmployeeArea) {
              if (personnelEmployeeArea.personnelArea) {
                if (`${businessUnitsList}`.toLocaleLowerCase().includes(`${personnelEmployeeArea.personnelArea.areaName}`.toLocaleLowerCase())) {
                  existInBusinessUnitList = true
                  businessUnitApply = businessUnits.find((business) => `${business.businessUnitName}`.toLocaleLowerCase() === `${personnelEmployeeArea.personnelArea.areaName}`.toLocaleLowerCase())
                  break
                }
              }
            }
          }

          if (existInBusinessUnitList) {
            employee.departmentId = withOutDepartmentId
            employee.positionId = withOutPositionId
            employee.usersResponsible = usersResponsible
            employee.businessUnitId = businessUnitApply?.businessUnitId || 1
            employeeCountSaved += 1
            await this.verify(employee, employeeService)
          }
        }
        response.status(201)
        return {
          type: 'success',
          title: 'Employee synchronization',
          message: 'Employees have been synchronized successfully',
          data: {
            data,
          },
        }
      } else {
        response.status(404)
        return {
          type: 'warning',
          title: 'Employee synchronization',
          message: 'No data found to synchronize',
          data: { data },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/import-excel:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Import employees from Excel file
   *     description: Import employees from Excel file. The business unit and payroll business unit are automatically detected from the Excel file content using similarity matching.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: Excel file with employee data. Must contain columns for business unit names, department names, and position names.
   *             required:
   *               - file
   *     responses:
   *       200:
   *         description: Employees imported successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Response type (success, warning, error)
   *                 title:
   *                   type: string
   *                   description: Response title
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Import results
   *                   properties:
   *                     totalRows:
   *                       type: number
   *                       description: Total rows processed
   *                     processed:
   *                       type: number
   *                       description: Successfully processed rows
   *                     created:
   *                       type: number
   *                       description: New employees created
   *                     updated:
   *                       type: number
   *                       description: Existing employees updated
   *                     skipped:
   *                       type: number
   *                       description: Rows skipped due to errors
   *                     limitReached:
   *                       type: boolean
   *                       description: Whether employee limit was reached
   *                     errors:
   *                       type: array
   *                       items:
   *                         type: string
   *                       description: List of error messages
   *       400:
   *         description: Bad request - Invalid file or validation errors
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *                 error:
   *                   type: string
   *                   description: Detailed error information
   */
  async importFromExcel({ request, response, i18n }: HttpContext) {
    try {
      const file = request.file('file')

      if (!file) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'Excel file is required',
        }
      }

      // Validar que el archivo sea un Excel
      const allowedExtensions = ['.xlsx', '.xls']
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/octet-stream' // Fallback para algunos casos
      ]

      // Verificar por extensión del archivo
      const fileName = file.clientName || file.tmpPath || ''
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))

      // Verificar por MIME type
      const mimeType = file.type || ''

      const isValidExtension = allowedExtensions.includes(fileExtension)
      const isValidMimeType = allowedMimeTypes.includes(mimeType.toLowerCase())

      // Si no pasa la validación básica, intentar validar por contenido
      if (!isValidExtension && !isValidMimeType) {
        try {
          // Intentar leer el archivo con ExcelJS para verificar si es realmente un Excel
          const ExcelJSModule = await import('exceljs')
          const ExcelJSLib = ExcelJSModule.default
          const workbook = new ExcelJSLib.Workbook()

          await workbook.xlsx.readFile(file.tmpPath || '')
          // Si llega aquí, es un archivo Excel válido
        } catch (excelError: any) {
          response.status(400)
          return {
            type: 'error',
            title: 'Validation error',
            message: `El archivo debe ser un Excel válido (.xlsx o .xls). Extensión detectada: ${fileExtension}, MIME type: ${mimeType}. Error: ${excelError.message}`,
          }
        }
      }

      const employeeService = new EmployeeService(i18n)
      const result = await employeeService.importFromExcel(file)

      // Determinar el tipo de respuesta basado en los resultados
      let responseType = 'success'
      let title = 'Importación completada'
      let message = ''

      if (result.limitReached) {
        responseType = 'warning'
        title = 'Límite de empleados alcanzado'
        message = `Se alcanzó el límite de empleados. Se crearon ${result.created} empleados, se actualizaron ${result.updated} empleados, y ${result.skipped} no se pudieron procesar.`
      } else if (result.errors.length > 0) {
        responseType = 'warning'
        title = 'Importación completada con advertencias'
        message = `Se procesaron ${result.processed} empleados: ${result.created} creados, ${result.updated} actualizados. ${result.errors.length} errores encontrados.`
      } else {
        message = `Importación exitosa: ${result.created} empleados creados, ${result.updated} empleados actualizados.`
      }

      response.status(200)
      return {
        type: responseType,
        title: title,
        message: message,
        data: result,
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred during import',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/employees/inverse-synchronization:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employees
   *     summary: Sincronizar un empleado existente a la API de biométricos
   *     description: Envía un empleado existente en la base de datos local a la API de biométricos
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: integer
   *                 description: ID del empleado a sincronizar
   *                 required: true
   *     responses:
   *       200:
   *         description: Empleado sincronizado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Response type (success, error)
   *                 title:
   *                   type: string
   *                   description: Response title
   *                 message:
   *                   type: string
   *                   description: Response message
   *       400:
   *         description: Bad request - ID de empleado requerido
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *       404:
   *         description: Empleado no encontrado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Error type
   *                 title:
   *                   type: string
   *                   description: Error title
   *                 message:
   *                   type: string
   *                   description: Error message
   *                 error:
   *                   type: string
   *                   description: Detailed error information
   */
  async inverseSync({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'error',
          title: 'Validation error',
          message: 'El ID del empleado es requerido',
        }
      }

      const employeeService = new EmployeeService(i18n)
      const result = await employeeService.sendEmployeeToBiometrics(employeeId)

      if (!result.success) {
        response.status(404)
        return {
          type: 'error',
          title: 'Sincronización fallida',
          message: result.message,
          error: result.error,
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: 'Sincronización exitosa',
        message: result.message,
      }
    } catch (error: any) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'Ocurrió un error inesperado al sincronizar el empleado',
        error: error.message,
      }
    }
  }
}
