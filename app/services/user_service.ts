import Ws from '#services/ws'
import Person from '#models/person'
import User from '#models/user'
import { UserFilterSearchInterface } from '../interfaces/user_filter_search_interface.js'
import ApiToken from '#models/api_token'
import Department from '#models/department'
import { DateTime } from 'luxon'
import { LogStore } from '#models/MongoDB/log_store'
import { LogUser } from '../interfaces/MongoDB/log_user.js'
import mail from '@adonisjs/mail/services/main'
import env from '../../start/env.js'
import Role from '#models/role'
import SystemSettingService from './system_setting_service.js'
import SystemSetting from '#models/system_setting'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import { EmployeeAssignedFilterSearchInterface } from '../interfaces/employee_assigned_filter_search_interface.js'
import { I18n } from '@adonisjs/i18n'
import RoleDepartment from '#models/role_department'
import Position from '#models/position'
import RoleService from './role_service.js'
import EmployeeType from '#models/employee_type'
import Shift from '#models/shift'
import EmployeeShift from '#models/employee_shift'

export default class UserService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: UserFilterSearchInterface) {
    const systemBussines = env.get('SYSTEM_BUSINESS')
    const systemBussinesArray = systemBussines?.toString().split(',') as Array<string>

    const roles = await Role.query()
      .whereNull('role_deleted_at')
      .andWhere((query) => {
        query.whereNotNull('role_business_access')
        query.andWhere((subQuery) => {
          systemBussinesArray.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, role_business_access)', [business.trim()])
          })
        })
      })
    const rolesIds = roles.map((item) => item.roleId)

    const selectedColumns = ['user_id', 'user_email', 'user_active', 'role_id', 'person_id', 'user_email_type']
    const users = await User.query()
      .whereNull('user_deleted_at')
      .whereIn('role_id', rolesIds)
      .andWhere((query) => {
        query.whereNotNull('user_business_access')
        query.andWhere((subQuery) => {
          systemBussinesArray.forEach((business) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, user_business_access)', [business.trim()])
          })
        })
      })
      .if(filters.search, (query) => {
        query.andWhere((searchQuery) => {
          searchQuery
            .whereRaw('UPPER(user_email) LIKE ?', [`%${filters.search.toUpperCase()}%`])
            .orWhereHas('person', (queryPerson) => {
              queryPerson.whereRaw(
                'UPPER(CONCAT(person_firstname, " ", person_lastname, " ", person_second_lastname)) LIKE ?',
                [`%${filters.search.toUpperCase()}%`]
              )
            })
        })
      })
      .if(filters.roleId > 0, (query) => {
        query.where('role_id', filters.roleId)
      })
      .whereHas('person', (query) => {
        query.whereNull('person_deleted_at')
      })
      .preload('person')
      .preload('role')
      .select(selectedColumns)
      .orderBy('user_id')
      .paginate(filters.page, filters.limit)

    return users
  }

  async create(user: User) {
    const newUser = new User()
    newUser.userEmail = user.userEmail
    newUser.userPassword = user.userPassword
    newUser.userActive = user.userActive
    newUser.roleId = user.roleId
    newUser.personId = user.personId
    newUser.userBusinessAccess = user.userBusinessAccess
    newUser.userEmailType = user.userEmailType
    await newUser.save()
    return newUser
  }

  async update(currentUser: User, user: User) {
    currentUser.userEmail = user.userEmail
    if (user.userPassword) {
      currentUser.userPassword = user.userPassword
    }
    currentUser.userActive = user.userActive
    currentUser.roleId = user.roleId
    currentUser.personId = user.personId
    currentUser.userEmailType = user.userEmailType
    await currentUser.save()
    if (!user.userActive) {
      await ApiToken.query().where('tokenable_id', currentUser.userId).delete()
      if (Ws.io) {
        Ws.io.emit(`user-forze-logout:${currentUser.userEmail}`, {})
      }
    }
    return currentUser
  }

  async delete(currentUser: User) {
    await currentUser.delete()
    await ApiToken.query().where('tokenable_id', currentUser.userId).delete()
    if (Ws.io) {
      Ws.io.emit(`user-forze-logout:${currentUser.userEmail}`, {})
    }
    return currentUser
  }

  async show(userId: number) {
    const selectedColumns = ['user_id', 'user_email', 'user_active', 'role_id', 'person_id', 'user_email_type']
    const user = await User.query()
      .whereNull('user_deleted_at')
      .where('user_id', userId)
      .preload('person')
      .preload('role')
      .select(selectedColumns)
      .first()
    return user ? user : null
  }

  async verifyInfo(user: User) {
    const action = user.userId > 0 ? 'updated' : 'created'
    const existEmail = await User.query()
      .if(user.userId > 0, (query) => {
        query.whereNot('user_id', user.userId)
      })
      .whereNull('user_deleted_at')
      .where('user_email', user.userEmail)
      .first()

    if (existEmail && user.userEmail) {
      const entity = this.t('user')
      const param = this.t('email')
      return {
        status: 400,
        type: 'warning',
        title: this.t('the_value_of_entity_already_exists_for_another_register', { entity: param  }),
        message: `${this.t('entity_resource_cannot_be', { entity })} ${this.t(action)} ${this.t('because_the_value_of_entity_is_already_assigned_to_another_register', { entity: param })}`,
        data: { ...user },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...user },
    }
  }

  async verifyInfoExist(user: User) {
    if (!user.userId) {
      const existUser = await Person.query()
        .whereNull('person_deleted_at')
        .where('person_id', user.personId)
        .first()

      if (!existUser && user.personId) {
        const entity = this.t('person')
        return {
          status: 400,
          type: 'warning',
          title: this.t('entity_was_not_found', { entity }),
          message: this.t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...user },
        }
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...user },
    }
  }

  async getRoleDepartments(userId: number, hasAccessToFullEmployes: boolean = false) {
    const user = await User.query()
      .whereNull('user_deleted_at')
      .where('user_id', userId)
      .preload('role')
      .first()

    if (!user) {
      return []
    }

    if (user.role.roleSlug === 'root' || hasAccessToFullEmployes) {
      const departmentsList = await Department.query()
        .whereNull('department_deleted_at')
        .orderBy('departmentId')

      const departments = departmentsList.map((department) => department.departmentId)
      return departments
    }
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)

    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    // Obtener departamentos asignados directamente al rol del usuario
    const roleDepartments = await RoleDepartment.query()
      .whereNull('role_department_deleted_at')
      .where('role_id', user.roleId)
      .preload('department', (departmentQuery) => {
        departmentQuery.whereNull('department_deleted_at')
      })

    const departmentsFromRole = roleDepartments
      .filter((rd) => rd.department !== null && businessUnitsList.includes(rd.department.businessUnitId))
      .map((rd) => rd.department.departmentId)

    // Obtener departamentos a través de empleados relacionados con el usuario
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereIn('businessUnitId', businessUnitsList)
      .if(userId &&
        typeof userId,
        (query) => {
          query.where((subQuery) => {
            subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', userId!)
              userResponsibleEmployeeQuery.whereNull('user_responsible_employee_deleted_at')
            })
            subQuery.orWhereHas('person', (personQuery) => {
              personQuery.whereHas('user', (userQuery) => {
                userQuery.where('userId', userId!)
              })
            })
          })
        }
      )
      .distinct('departmentId')
      .orderBy('departmentId')

    const departmentsFromEmployees = employees.flatMap(({ departmentId }) => departmentId !== null ? [departmentId] : [])

    // Combinar ambos conjuntos de departamentos y eliminar duplicados
    const allDepartments = [...new Set([...departmentsFromRole, ...departmentsFromEmployees])]

    return allDepartments
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logUser = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogUser
    return logUser
  }

  async saveActionOnLog(logAssist: LogUser) {
    try {
      await LogStore.set('log_users', logAssist)
    } catch (err) {}
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  async sendNewPasswordEmail(url: string, newUser: User, userPassword: string) {
    const hostData = this.getUrlInfo(url)
    let tradeName = 'BO'
    let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO')}`
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if ( systemSettingActive.systemSettingLogo) {
        backgroundImageLogo = systemSettingActive.systemSettingLogo
      }
      if ( systemSettingActive.systemSettingTradeName) {
        tradeName = systemSettingActive.systemSettingTradeName
      }
    }
    await newUser.load('person')
    const emailData = {
      user: newUser,
      userPassword,
      host_data: hostData,
      backgroundImageLogo,
    }
    const userEmail = env.get('SMTP_USERNAME')
    if (userEmail) {
      await mail.send((message) => {
        message
          .to(newUser.userEmail)
          .from(userEmail, tradeName)
          .subject('New password')
          .htmlView('emails/new_password', emailData)
      })
    }
  }

  private getUrlInfo(url: string) {
    return {
      name: 'SAE BackOffice',
      host_uri: url,
      logo_path: 'https://sae.com.mx/wp-content/uploads/2024/03/logo_sae.svg',
      primary_color: '#0a3459',
    }
  }

  async hasAccessDepartment(userId: number, departmentId: number) {
    const user = await User.query().whereNull('user_deleted_at').where('user_id', userId).first()
    if (!user) {
      return false
    }
    const department = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!department) {
      return false
    }

    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('department_id', department.departmentId)
      .if(userId &&
        typeof userId,
        (query) => {
          query.where((subQuery) => {
            subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
              userResponsibleEmployeeQuery.where('userId', userId!)
              userResponsibleEmployeeQuery.whereNull('user_responsible_employee_deleted_at')
            })
            subQuery.orWhereHas('person', (personQuery) => {
              personQuery.whereHas('user', (userQuery) => {
                userQuery.where('userId', userId!)
              })
            })
          })
        }
      )
      .first()
    if (!employee) {
      return false
    }
    return true
  }

  async getEmployeesAssigned(filters: EmployeeAssignedFilterSearchInterface) {
    const businessConf = `${env.get('SYSTEM_BUSINESS')}`
    const businessList = businessConf.split(',')
    const businessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
    const businessUnitsList = businessUnits.map((business) => business.businessUnitId)

    const employeesAssigned = await UserResponsibleEmployee.query()
      .whereNull('user_responsible_employee_deleted_at')
      .where('user_id', filters.userId)
      .whereHas('user', (userQuery) => {
        userQuery.whereNull('user_deleted_at')
      })
      .if(filters.employeeId && typeof filters.employeeId && filters.employeeId > 0, (employeeQuery) => {
        employeeQuery.where('employee_id', filters.employeeId)
      })
      .whereHas('employee', (employeeQuery) => {
        employeeQuery.whereIn('businessUnitId', businessUnitsList)
        employeeQuery.if(filters.userResponsibleId &&
          typeof filters.userResponsibleId && filters.userResponsibleId > 0,
          (query) => {
            query.where((subQuery) => {
              subQuery.whereHas('userResponsibleEmployee', (userResponsibleEmployeeQuery) => {
                userResponsibleEmployeeQuery.where('userId', filters.userResponsibleId!)
                userResponsibleEmployeeQuery.whereNull('user_responsible_employee_deleted_at')
              })
              subQuery.orWhereHas('person', (personQuery) => {
                personQuery.whereHas('user', (userQuery) => {
                  userQuery.where('userId', filters.userResponsibleId!)
                })
              })
            })
          }
        )
        employeeQuery.if(filters.search, (query) => {
          query.where((subQuery) => {
            subQuery
              .whereRaw('UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?', [
                `%${filters.search.toUpperCase()}%`,
              ])
              .orWhereRaw('UPPER(employee_code) = ?', [`${filters.search.toUpperCase()}`])
              .orWhereHas('person', (personQuery) => {
                personQuery.whereRaw('UPPER(person_rfc) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_curp) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_imss_nss) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
                personQuery.orWhereRaw('UPPER(person_email) LIKE ?', [
                  `%${filters.search.toUpperCase()}%`,
                ])
              })
          })
        })
        employeeQuery.if(filters.departmentId, (query) => {
          query.where('department_id', filters.departmentId)
        })
        employeeQuery.if(filters.departmentId && filters.positionId, (query) => {
          query.where('department_id', filters.departmentId)
          query.where('position_id', filters.positionId)
        })
      })
      .preload('user')
      .orderBy('employee_id')
      .paginate(1, 9999999)

    return employeesAssigned ? employeesAssigned : []
  }

  /**
   * Crea un usuario demo para un empleado
   * @param employee - Empleado
   * @param person - Persona
   * @param roleId - ID del rol
   * @returns Usuario creado o null
   */
  private async createUserDemo(
    employee: Employee,
    person: Person,
    roleId: number
  ): Promise<User | null> {
    try {
      // Verificar si el usuario ya existe
      const existingUser = await User.query()
        .where('person_id', person.personId)
        .whereNull('user_deleted_at')
        .first()

      if (existingUser) {
        return null
      }

      // Obtener el email de la persona
      if (!person.personEmail || person.personEmail.trim() === '') {
        return null
      }

      const userEmail = person.personEmail.trim()

      // Verificar si el email ya existe en otro usuario
      const existingEmail = await User.query()
        .where('user_email', userEmail)
        .whereNull('user_deleted_at')
        .first()

      if (existingEmail) {
        return null
      }

      // Generar contraseña por defecto (demo)
      const defaultPassword = 'GrupoSTI'

      // Crear usuario
      const systemBusiness = env.get('SYSTEM_BUSINESS') || ''
      const user = new User()
      user.userEmail = userEmail
      user.userPassword = defaultPassword
      user.userActive = 1
      user.roleId = roleId
      user.personId = person.personId
      user.userBusinessAccess = systemBusiness
      await user.save()

      return user
    } catch (error) {
      console.error(`Error al crear usuario para empleado ${employee.employeeId}:`, error)
      return null
    }
  }

  /**
   * Crea usuarios demo para todos los empleados demo existentes
   *
   * Asignación de roles:
   * - Empleados con departamento "Recursos Humanos" → rol "recursos-humanos"
   * - Empleados con posición "Director general" → rol "administrador"
   * - Los demás empleados → rol "empleados"
   *
   * @returns Objeto con el resultado de la operación y los usuarios creados
   */
  async createUsersDemo() {
    try {
      // Buscar los roles necesarios
      const roleService = new RoleService()
      const rhManagerRole = await roleService.findRoleBySlug('rh-manager')
      const adminRole = await roleService.findRoleBySlug('super-administrador')
      const rootRole = await roleService.findRoleBySlug('root')
      const employeeRole = await roleService.findRoleBySlug('empleado')

      if (!rhManagerRole || !adminRole || !employeeRole || !rootRole) {
        return {
          status: 400,
          type: 'error',
          title: 'Roles not found',
          message: 'One or more required roles were not found. Please ensure the roles "rh-manager", "super-administrador", and "root" exist in the database.',
          data: null,
        }
      }

      // Buscar el departamento "Recursos Humanos"
      const hrDepartment = await Department.query()
        .where('department_alias', 'Recursos Humanos')
        .whereNull('department_deleted_at')
        .first()

      // Buscar la posición "Director general"
      const directorPosition = await Position.query()
        .where('position_alias', 'Director general')
        .whereNull('position_deleted_at')
        .first()

      // Obtener todos los empleados demo
      const employees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereNotNull('person_id')
        .preload('person')
        .preload('department')
        .preload('position')

      const createdUsers: Array<{
        name: string
        email: string
        role: string
        department: string | null
        position: string | null
      }> = []
      const skippedUsers: Array<{
        name: string
        reason: string
      }> = []

      // Crear usuarios para cada empleado
      for await (const employee of employees) {
        if (!employee.person) {
          skippedUsers.push({
            name: `${employee.employeeFirstName} ${employee.employeeLastName}`,
            reason: 'Person not found',
          })
          continue
        }

        // Determinar el rol según las reglas
        let roleId: number
        let roleName: string

        // Verificar si es Director general
        if (directorPosition && employee.positionId === directorPosition.positionId) {
          roleId = adminRole.roleId
          roleName = 'administrador'
        }
        // Verificar si pertenece a Recursos Humanos
        else if (hrDepartment && employee.departmentId === hrDepartment.departmentId) {
          roleId = rhManagerRole.roleId
          roleName = 'recursos-humanos'
        }
        // Por defecto, rol de empleado
        else {
          roleId = employeeRole.roleId
          roleName = 'empleados'
        }

        // Verificar que la persona tenga email
        if (!employee.person.personEmail || employee.person.personEmail.trim() === '') {
          skippedUsers.push({
            name: `${employee.person.personFirstname} ${employee.person.personLastname} ${employee.person.personSecondLastname || ''}`.trim(),
            reason: 'Person does not have an email',
          })
          continue
        }

        // Crear usuario
        const user = await this.createUserDemo(employee, employee.person, roleId)

        if (user) {
          createdUsers.push({
            name: `${employee.person.personFirstname} ${employee.person.personLastname} ${employee.person.personSecondLastname || ''}`.trim(),
            email: user.userEmail,
            role: roleName,
            department: employee.department?.departmentName || null,
            position: employee.position?.positionName || null,
          })
        } else {
          skippedUsers.push({
            name: `${employee.person.personFirstname} ${employee.person.personLastname} ${employee.person.personSecondLastname || ''}`.trim(),
            reason: 'User already exists or email already in use',
          })
        }
      }

      return {
        status: 201,
        type: 'success',
        title: 'Demo users created',
        message: 'The demo users were created successfully',
        data: {
          created: createdUsers,
          skipped: skippedUsers,
          total: createdUsers.length,
          skippedCount: skippedUsers.length,
        },
      }
    } catch (error: any) {
      console.error('Error al crear usuarios demo:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error to create demo users',
        message: 'An error occurred while trying to create the demo users',
        error: error.message,
        data: null,
      }
    }
  }

  /**
   * Crea 5 usuarios demo adicionales con rol "root" y las relaciones Person/User.
   * Emails: desarrollo-software@gruposti.com, demo1@gruposti.com ... demo4@gruposti.com.
   * Contraseña común: GrupoSTI.
   *
   * @returns Objeto con el resultado y los usuarios creados
   */
  async createExtraRootUsersDemo() {
    const defaultPassword = 'GrupoSTI'
    const extraRootEmails: Array<{ email: string; firstname: string; lastname: string }> = [
      { email: 'desarrollo-software@gruposti.com', firstname: 'Desarrollo', lastname: 'Software' },
      { email: 'demo1@gruposti.com', firstname: 'Demo', lastname: 'Uno' },
      { email: 'demo2@gruposti.com', firstname: 'Demo', lastname: 'Dos' },
      { email: 'demo3@gruposti.com', firstname: 'Demo', lastname: 'Tres' },
      { email: 'demo4@gruposti.com', firstname: 'Demo', lastname: 'Cuatro' },
      { email: 'demo5@gruposti.com', firstname: 'Demo', lastname: 'Cinco' },
      { email: 'demo6@gruposti.com', firstname: 'Demo', lastname: 'Seis' },
      { email: 'demo7@gruposti.com', firstname: 'Demo', lastname: 'Siete' },
      { email: 'demo8@gruposti.com', firstname: 'Demo', lastname: 'Ocho' },
      { email: 'demo9@gruposti.com', firstname: 'Demo', lastname: 'Nueve' },
      { email: 'demo10@gruposti.com', firstname: 'Demo', lastname: 'Diez' },
      { email: 'demo11@gruposti.com', firstname: 'Demo', lastname: 'Once' },
      { email: 'demo12@gruposti.com', firstname: 'Demo', lastname: 'Doce' },
      { email: 'demo13@gruposti.com', firstname: 'Demo', lastname: 'Trece' },
      { email: 'demo14@gruposti.com', firstname: 'Demo', lastname: 'Catorce' },
      { email: 'demo15@gruposti.com', firstname: 'Demo', lastname: 'Quince' },
    ]

    try {
      const roleService = new RoleService()
      const rootRole = await roleService.findRoleBySlug('root')
      if (!rootRole) {
        return {
          status: 400,
          type: 'error',
          title: 'Rol no encontrado',
          message: 'El rol "root" no existe en la base de datos.',
          data: null,
        }
      }

      const systemBusiness = env.get('SYSTEM_BUSINESS') || ''
      const businessConf = `${env.get('SYSTEM_BUSINESS')}`
      const businessList = businessConf.split(',')
      const businessUnit = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .whereIn('business_unit_slug', businessList)
        .first()

      const businessUnitId = businessUnit?.businessUnitId || 0

      const employeeType = await EmployeeType.query()
        .where('employee_type_slug', 'employee')
        .whereNull('employee_type_deleted_at')
        .first()

      let shift = await Shift.query()
        .where('shift_name', '08:00 to 17:00 - Rest (Sat, Sun)')
        .whereNull('shift_deleted_at')
        .first()

      if (!shift) {
        shift = await Shift.query()
          .whereNull('shift_deleted_at')
          .first()
      }

      if (!shift) {
        return {
          status: 400,
          type: 'error',
          title: 'Turno no encontrado',
          message: 'El turno "08:00 to 17:00 - Rest (Sat, Sun)" no existe en la base de datos.',
          data: null,
        }
      }

      const created: Array<{ name: string; email: string; role: string }> = []
      const skipped: Array<{ email: string; reason: string }> = []
      const uniquePrefix = `DEMO-ROOT-${Date.now()}`

      for (const [index, { email, firstname, lastname }] of extraRootEmails.entries()) {
        const existingUser = await User.query()
          .where('user_email', email)
          .whereNull('user_deleted_at')
          .first()

        if (existingUser) {
          skipped.push({ email, reason: 'El usuario ya existe' })
          continue
        }

        const prefix = `${uniquePrefix}-${index + 1}`
        const person = new Person()
        person.personFirstname = firstname
        person.personLastname = lastname
        person.personSecondLastname = ''
        person.personGender = ''
        person.personBirthday = null
        person.personPhone = ''
        person.personEmail = email
        person.personPhoneSecondary = ''
        person.personCurp = `${prefix}-CURP`
        person.personRfc = `${prefix}-RFC`
        person.personImssNss = `${prefix}-NSS`
        person.personMaritalStatus = ''
        person.personPlaceOfBirthCountry = ''
        person.personPlaceOfBirthState = ''
        person.personPlaceOfBirthCity = ''
        await person.save()

        const user = new User()
        user.userEmail = email
        user.userPassword = defaultPassword
        user.userActive = 1
        user.roleId = rootRole.roleId
        user.personId = person.personId
        user.userBusinessAccess = systemBusiness
        await user.save()

        const employeeCode = `ROOT-${prefix}-${index + 1}`
        const employee = new Employee()
        employee.employeeSyncId = 0
        employee.employeeCode = employeeCode
        employee.employeeFirstName = firstname
        employee.employeeLastName = lastname
        employee.employeeSecondLastName = ''
        employee.employeePayrollNum = employeeCode
        employee.employeePayrollCode = employeeCode
        employee.employeeHireDate = DateTime.now()
        employee.companyId = 0
        employee.departmentId = 999
        employee.positionId = 999
        employee.personId = person.personId
        employee.businessUnitId = businessUnitId
        employee.dailySalary = 0
        employee.payrollBusinessUnitId = businessUnitId
        employee.employeeAssistDiscriminator = 0
        employee.employeeWorkSchedule = 'Onsite'
        employee.employeeIgnoreConsecutiveAbsences = 0
        employee.employeeAuthorizeAnyZones = 0
        employee.employeeLastSynchronizationAt = DateTime.now().toJSDate()
        employee.departmentSyncId = 0
        employee.positionSyncId = 0
        employee.employeeTypeId = employeeType?.employeeTypeId || 1
        await employee.save()

        const employeeShift = new EmployeeShift()
        employeeShift.employeeId = employee.employeeId
        employeeShift.shiftId = shift.shiftId
        employeeShift.employeShiftsApplySince = DateTime.now().toFormat('yyyy-MM-dd')
        await employeeShift.save()

        created.push({
          name: `${firstname} ${lastname}`,
          email: user.userEmail,
          role: 'root',
        })
      }

      return {
        status: 201,
        type: 'success',
        title: 'Usuarios root demo creados',
        message: 'Los 16 usuarios root demo fueron creados correctamente',
        data: {
          created,
          skipped,
          total: created.length,
          skippedCount: skipped.length,
        },
      }
    } catch (error: any) {
      console.error('Error al crear usuarios root demo:', error)
      return {
        status: 500,
        type: 'error',
        title: 'Error al crear usuarios root demo',
        message: 'Ocurrió un error al crear los usuarios root demo',
        error: error.message,
        data: null,
      }
    }
  }
}
