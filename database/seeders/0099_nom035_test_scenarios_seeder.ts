import { BaseSeeder } from '@adonisjs/lucid/seeders'
import BusinessUnit from '#models/business_unit'
import BranchOffice from '#models/branch_office'
import Employee from '#models/employee'
import Person from '#models/person'
import EmployeeBranchOffice from '#models/employee_branch_office'
import User from '#models/user'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import SystemSettingSystemModule from '#models/system_setting_system_module'
import RoleSystemPermission from '#models/role_system_permission'
import QuestionnaireTabulationService from '#services/questionnaire_tabulation_service'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  private readonly disclosureModuleId = 45
  private readonly disclosureRoleId = 2
  private readonly readOnlyRoleId = 4
  private readonly forbiddenRoleId = 98
  private readonly activeSettingId = 1
  private readonly disclosurePermissions = [
    { systemPermissionId: 183, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 184, systemPermissionName: 'Read all', systemPermissionSlug: 'read-all' },
  ]

  private readonly disclosureTestUserEmail = 'nom035.disclosure.tester@gsti.local'
  private readonly disclosureTestUserPassword = 'GrupoSTI'

  async run() {
    // 1. Asegurar Unidad de Negocio
    const bu = await BusinessUnit.firstOrCreate(
      { businessUnitId: 1 },
      {
        businessUnitName: 'GSTI RH',
        businessUnitSlug: 'gsti-rh',
        businessUnitLegalName: 'GrupoSTI RH',
        businessUnitActive: 1,
      }
    )

    // 2. Definir Sucursales
    const branchesData = [
      { id: 101, name: 'Sucursal Test None (0-15)', count: 0 },
      { id: 102, name: 'Sucursal Test Guia II (16-50)', count: 20 },
      { id: 103, name: 'Sucursal Test Guia III (>50)', count: 60 },
    ]

    for (const data of branchesData) {
      const branch = await BranchOffice.updateOrCreate(
        { branchOfficeId: data.id },
        {
          businessUnitId: bu.businessUnitId,
          branchOfficeName: data.name,
          branchOfficeSlug: `sucursal-test-${data.id}`,
        }
      )

      // Limpiar asignaciones previas de esta sucursal para que el conteo sea exacto
      await EmployeeBranchOffice.query().where('branchOfficeId', branch.branchOfficeId).delete()

      // 3. Crear Empleados y Asignaciones
      for (let i = 1; i <= data.count; i++) {
        const uniqueSuffix = `${branch.branchOfficeId}-${i}`
        
        const person = await Person.create({
          personFirstname: 'Test',
          personLastname: 'User',
          personSecondLastname: uniqueSuffix,
          personEmail: `test-${uniqueSuffix}@example.com`,
          personGender: 'M',
        })

        const employee = await Employee.create({
          personId: person.personId,
          businessUnitId: bu.businessUnitId,
          companyId: bu.businessUnitId,
          employeeSyncId: Math.floor(Math.random() * 1000000),
          employeeCode: `TEST-${uniqueSuffix}`,
          employeeFirstName: person.personFirstname,
          employeeLastName: person.personLastname,
          employeeSecondLastName: person.personSecondLastname,
          employeePayrollNum: `PAY-${uniqueSuffix}`,
          employeeWorkSchedule: 'Onsite',
          departmentId: 999, // Asumiendo que existe por seeders previos
          departmentSyncId: 999,
          positionId: 999, // Asumiendo que existe por seeders previos
          positionSyncId: 999,
          payrollBusinessUnitId: bu.businessUnitId,
          employeeAssistDiscriminator: 0,
          employeeLastSynchronizationAt: new Date(),
          employeeTypeId: 1,
          employeeBusinessEmail: person.personEmail,
          employeeBusinessPhone: '1234567890',
          employeeTypeOfContract: 'Internal',
          employeeIgnoreConsecutiveAbsences: 0,
          employeeAuthorizeAnyZones: 0,
          dailySalary: 100,
        })

        await EmployeeBranchOffice.create({
          employeeId: employee.employeeId,
          branchOfficeId: branch.branchOfficeId,
          employeeBranchOfficeActive: 1,
        })
      }
    }

    await this.seedTestThresholds('GUIA-II-NOM035')
    await this.seedTestThresholds('GUIA-III-NOM035')
    await this.seedQuestionnaireApplicationsScenarios()
    await this.tabulateReadyScenario(bu.businessUnitId)
    await this.seedDisclosureTestUser(bu.businessUnitId)
    await this.seedDisclosureScenarioUsers(bu.businessUnitId)
  }

  /**
   * Crea un usuario de prueba para el endpoint:
   * GET /api/nom035/disclosure/results
   *
   * Resultado:
   * - Usuario ligado a un empleado con sucursal activa.
   * - Permiso base (read) y full-report (read-all) sobre `nom035-disclosure`.
   * - Asociación del usuario a la unidad de negocio para pasar businessScope.
   */
  private async seedDisclosureTestUser(businessUnitId: number) {
    await this.ensureDisclosureModuleAndPermissions()
    await this.ensureDisclosurePermissionsForRole()

    const employeeRow = await db
      .from('employee_branch_offices as ebo')
      .innerJoin('employees as e', 'e.employee_id', 'ebo.employee_id')
      .where('ebo.branch_office_id', 102)
      .where('ebo.employee_branch_office_active', 1)
      .whereNull('e.employee_deleted_at')
      .select('e.person_id as personId')
      .first()

    if (!employeeRow?.personId) {
      throw new Error(
        'No se encontró un empleado activo en la sucursal de prueba para crear el usuario NOM-035 disclosure.'
      )
    }

    const user = await User.updateOrCreate(
      { userEmail: this.disclosureTestUserEmail },
      {
        userActive: 1,
        userPassword: this.disclosureTestUserPassword,
        personId: Number(employeeRow.personId),
        roleId: this.disclosureRoleId,
      }
    )

    const existingLink = await user
      .related('businessUnits')
      .query()
      .where('business_units.business_unit_id', businessUnitId)
      .first()

    if (!existingLink) {
      await user.related('businessUnits').attach([businessUnitId])
    }
  }

  /**
   * Usuarios adicionales para probar todos los escenarios del endpoint disclosure.
   *
   * Casos esperados:
   * - available=true (usuario full-report con ronda tabulada)
   * - available=false (usuario full-report en sucursal sin tabulación)
   * - 200 ignorando branchOfficeId (usuario read-only)
   * - 403 forbidden (rol sin permiso)
   * - 422 no_employee (usuario sin empleado)
   * - 422 no_branch (empleado sin sucursal activa)
   */
  private async seedDisclosureScenarioUsers(businessUnitId: number) {
    await this.ensureDisclosureRolesForScenarios()

    await this.ensureScenarioUserFromBranch({
      email: 'nom035.disclosure.available.false@gsti.local',
      roleId: this.disclosureRoleId,
      branchOfficeId: 103,
      businessUnitId,
      employeeCode: 'DISC-AVAIL-FALSE',
      firstName: 'Disc',
      lastName: 'AvailFalse',
    })

    await this.ensureScenarioUserFromBranch({
      email: 'nom035.disclosure.readonly@gsti.local',
      roleId: this.readOnlyRoleId,
      branchOfficeId: 102,
      businessUnitId,
      employeeCode: 'DISC-READ-ONLY',
      firstName: 'Disc',
      lastName: 'ReadOnly',
    })

    await this.ensureScenarioUserFromBranch({
      email: 'nom035.disclosure.forbidden@gsti.local',
      roleId: this.forbiddenRoleId,
      branchOfficeId: 102,
      businessUnitId,
      employeeCode: 'DISC-FORBIDDEN',
      firstName: 'Disc',
      lastName: 'Forbidden',
    })

    const personNoEmployee = await this.ensurePersonByEmail(
      'nom035.disclosure.noemployee@gsti.local',
      'Disc',
      'NoEmployee'
    )
    await this.ensureUser({
      email: 'nom035.disclosure.noemployee@gsti.local',
      roleId: this.disclosureRoleId,
      personId: personNoEmployee,
      businessUnitId,
    })

    const personNoBranch = await this.ensurePersonByEmail(
      'nom035.disclosure.nobranch@gsti.local',
      'Disc',
      'NoBranch'
    )
    const employeeNoBranchId = await this.ensureEmployeeForPerson({
      personId: personNoBranch,
      businessUnitId,
      employeeCode: 'DISC-NO-BRANCH',
      firstName: 'Disc',
      lastName: 'NoBranch',
    })
    await EmployeeBranchOffice.query().where('employeeId', employeeNoBranchId).delete()
    await this.ensureUser({
      email: 'nom035.disclosure.nobranch@gsti.local',
      roleId: this.disclosureRoleId,
      personId: personNoBranch,
      businessUnitId,
    })
  }

  /**
   * Deja listo el endpoint de disclosure:
   * tabula la ronda escenario "TEST-SCN-CLOSED-FULL" para que exista
   * información agregada disponible sin pasos manuales.
   */
  private async tabulateReadyScenario(businessUnitId: number) {
    const scenario = await db
      .from('questionnaire_applications')
      .where('questionnaire_application_folio', 'TEST-SCN-CLOSED-FULL')
      .whereNull('questionnaire_application_deleted_at')
      .select('questionnaire_application_id')
      .first()

    if (!scenario?.questionnaire_application_id) {
      throw new Error(
        'No se encontró la ronda TEST-SCN-CLOSED-FULL para ejecutar la tabulación automática.'
      )
    }

    const tabulationService = new QuestionnaireTabulationService()
    await tabulationService.tabulate(Number(scenario.questionnaire_application_id), [businessUnitId])
  }

  private async ensureDisclosureModuleAndPermissions() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.disclosureModuleId },
      {
        systemModuleName: 'Resultados NOM-035 por centro de trabajo',
        systemModuleSlug: 'nom035-disclosure',
        systemModuleDescription:
          'Difusión 5.7.e de resultados agregados y anonimizados por centro de trabajo conforme a NOM-035-STPS-2018',
        systemModules: '1',
        systemModulePath: '/disclosure',
        systemModuleGroup: '5. NOM-035',
        systemModuleActive: 1,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16V6" /><path d="M17 16v-4" /></svg>',
        systemModuleUpdatedAt: DateTime.now(),
      }
    )

    for (const permission of this.disclosurePermissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.disclosureModuleId }
      )
    }

    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.disclosureModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.disclosureModuleId }
    )
  }

  private async ensureDisclosurePermissionsForRole() {
    for (const permission of this.disclosurePermissions) {
      await RoleSystemPermission.firstOrCreate(
        { roleId: this.disclosureRoleId, systemPermissionId: permission.systemPermissionId },
        { roleId: this.disclosureRoleId, systemPermissionId: permission.systemPermissionId }
      )
    }
  }

  private async ensureDisclosureRolesForScenarios() {
    await db
      .from('roles')
      .update({
        role_name: 'No Permiso NOM035 Disclosure',
        role_slug: 'nom035-disclosure-no-perm',
        role_description: 'Rol de pruebas sin permisos disclosure',
        role_active: 1,
        role_business_access: 'gsti-rh',
        role_updated_at: nowSql(),
      })
      .where('role_id', this.forbiddenRoleId)

    const roleExists = await db
      .from('roles')
      .where('role_id', this.forbiddenRoleId)
      .whereNull('role_deleted_at')
      .first()

    if (!roleExists) {
      await db.table('roles').insert({
        role_id: this.forbiddenRoleId,
        role_name: 'No Permiso NOM035 Disclosure',
        role_slug: 'nom035-disclosure-no-perm',
        role_description: 'Rol de pruebas sin permisos disclosure',
        role_active: 1,
        role_business_access: 'gsti-rh',
        role_management_days: 0,
        role_created_at: nowSql(),
        role_updated_at: nowSql(),
      })
    }

    await RoleSystemPermission.firstOrCreate(
      { roleId: this.readOnlyRoleId, systemPermissionId: 183 },
      { roleId: this.readOnlyRoleId, systemPermissionId: 183 }
    )

    await db
      .from('role_system_permissions')
      .where('role_id', this.readOnlyRoleId)
      .where('system_permission_id', 184)
      .delete()

    await db
      .from('role_system_permissions')
      .where('role_id', this.forbiddenRoleId)
      .whereIn(
        'system_permission_id',
        this.disclosurePermissions.map((permission) => permission.systemPermissionId)
      )
      .delete()
  }

  private async ensureScenarioUserFromBranch(params: {
    email: string
    roleId: number
    branchOfficeId: number
    businessUnitId: number
    employeeCode: string
    firstName: string
    lastName: string
  }) {
    const personId = await this.ensurePersonByEmail(params.email, params.firstName, params.lastName)
    const employeeId = await this.ensureEmployeeForPerson({
      personId,
      businessUnitId: params.businessUnitId,
      employeeCode: params.employeeCode,
      firstName: params.firstName,
      lastName: params.lastName,
    })

    await EmployeeBranchOffice.query().where('employeeId', employeeId).delete()
    await EmployeeBranchOffice.create({
      employeeId,
      branchOfficeId: params.branchOfficeId,
      employeeBranchOfficeActive: 1,
    })

    await this.ensureUser({
      email: params.email,
      roleId: params.roleId,
      personId,
      businessUnitId: params.businessUnitId,
    })
  }

  private async ensurePersonByEmail(email: string, firstName: string, lastName: string) {
    const existing = await Person.query().where('personEmail', email).whereNull('person_deleted_at').first()
    if (existing) {
      return existing.personId
    }

    const person = await Person.create({
      personFirstname: firstName,
      personLastname: lastName,
      personSecondLastname: 'Disclosure',
      personEmail: email,
      personGender: 'M',
    })
    return person.personId
  }

  private async ensureEmployeeForPerson(params: {
    personId: number
    businessUnitId: number
    employeeCode: string
    firstName: string
    lastName: string
  }) {
    const existing = await Employee.query()
      .where('personId', params.personId)
      .whereNull('employee_deleted_at')
      .first()

    const payload = {
      personId: params.personId,
      businessUnitId: params.businessUnitId,
      companyId: params.businessUnitId,
      employeeSyncId: Math.floor(Math.random() * 1000000),
      employeeCode: params.employeeCode,
      employeeFirstName: params.firstName,
      employeeLastName: params.lastName,
      employeeSecondLastName: 'Disclosure',
      employeePayrollNum: `PAY-${params.employeeCode}`,
      employeeWorkSchedule: 'Onsite',
      departmentId: 999,
      departmentSyncId: 999,
      positionId: 999,
      positionSyncId: 999,
      payrollBusinessUnitId: params.businessUnitId,
      employeeAssistDiscriminator: 0,
      employeeLastSynchronizationAt: new Date(),
      employeeTypeId: 1,
      employeeBusinessEmail: `${params.employeeCode.toLowerCase()}@gsti.local`,
      employeeBusinessPhone: '1234567890',
      employeeTypeOfContract: 'Internal',
      employeeIgnoreConsecutiveAbsences: 0,
      employeeAuthorizeAnyZones: 0,
      dailySalary: 100,
    }

    if (existing) {
      existing.merge(payload)
      await existing.save()
      return existing.employeeId
    }

    const employee = await Employee.create(payload)
    return employee.employeeId
  }

  private async ensureUser(params: {
    email: string
    roleId: number
    personId: number
    businessUnitId: number
  }) {
    const user = await User.updateOrCreate(
      { userEmail: params.email },
      {
        userActive: 1,
        userPassword: this.disclosureTestUserPassword,
        personId: params.personId,
        roleId: params.roleId,
      }
    )

    const existingLink = await user
      .related('businessUnits')
      .query()
      .where('business_units.business_unit_id', params.businessUnitId)
      .first()

    if (!existingLink) {
      await user.related('businessUnits').attach([params.businessUnitId])
    }
  }

  /**
   * Seeder de QA: inserta umbrales de prueba para validar la clasificación.
   * NO usar estos rangos como dato normativo en producción.
   */
  private async seedTestThresholds(questionnaireCode: string) {
    const questionnaire = await RegulationQuestionnaire.findBy(
      'regulationQuestionnaireCode',
      questionnaireCode
    )

    if (!questionnaire) {
      return
    }

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const levels = [
      { level: 'nulo', ord: 1, min: 0, max: 50 },
      { level: 'bajo', ord: 2, min: 51, max: 100 },
      { level: 'medio', ord: 3, min: 101, max: 150 },
      { level: 'alto', ord: 4, min: 151, max: 200 },
      { level: 'muy_alto', ord: 5, min: 201, max: 9999 },
    ] as const

    const categoryRows = await db
      .from('regulation_questionnaire_sections')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .whereNull('deleted_at')
      .select('regulation_questionnaire_section_code as code')

    const domainRows = await db
      .from('risk_domains')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .whereNull('deleted_at')
      .select('risk_domain_code as code')

    await db.transaction(async (trx) => {
      await trx
        .from('risk_thresholds')
        .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
        .delete()

      const rows = [
        ...levels.map((level) => ({
          regulation_questionnaire_id: questionnaire.regulationQuestionnaireId,
          risk_threshold_scope: 'overall',
          risk_threshold_target_code: null,
          risk_threshold_level: level.level,
          risk_threshold_min: level.min,
          risk_threshold_max: level.max,
          risk_threshold_ord: level.ord,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })),
        ...categoryRows.flatMap((category) =>
          levels.map((level) => ({
            regulation_questionnaire_id: questionnaire.regulationQuestionnaireId,
            risk_threshold_scope: 'category',
            risk_threshold_target_code: String(category.code),
            risk_threshold_level: level.level,
            risk_threshold_min: level.min,
            risk_threshold_max: level.max,
            risk_threshold_ord: level.ord,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          }))
        ),
        ...domainRows.flatMap((domain) =>
          levels.map((level) => ({
            regulation_questionnaire_id: questionnaire.regulationQuestionnaireId,
            risk_threshold_scope: 'domain',
            risk_threshold_target_code: String(domain.code),
            risk_threshold_level: level.level,
            risk_threshold_min: level.min,
            risk_threshold_max: level.max,
            risk_threshold_ord: level.ord,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          }))
        ),
      ]

      if (rows.length > 0) {
        await trx.table('risk_thresholds').insert(rows)
      }
    })
  }

  /**
   * Escenarios de prueba para evitar captura manual:
   * - CERRADA con todas las encuestas respondidas.
   * - CERRADA con una respuesta menos que el mínimo normativo.
   * - CERRADA sin respuestas.
   */
  private async seedQuestionnaireApplicationsScenarios() {
    const branch = await BranchOffice.findBy('branchOfficeId', 102)
    if (!branch) return

    const questionnaire = await RegulationQuestionnaire.findBy(
      'regulationQuestionnaireCode',
      'GUIA-II-NOM035'
    )
    if (!questionnaire) return

    const minResponders = questionnaire.regulationQuestionnaireMinResponders ?? 16
    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const launchedAt = DateTime.utc().minus({ days: 1 }).toSQL({ includeOffset: false })!

    const employeesRows = await db
      .from('employee_branch_offices')
      .where('branch_office_id', branch.branchOfficeId)
      .where('employee_branch_office_active', 1)
      .select('employee_id')

    const employeeIds = employeesRows.map((row) => Number(row.employee_id)).sort((a, b) => a - b)
    if (employeeIds.length === 0) return

    const questionsRows = await db
      .from('regulation_questionnaire_questions as q')
      .join(
        'regulation_questionnaire_sections as s',
        's.regulation_questionnaire_section_id',
        'q.regulation_questionnaire_section_id'
      )
      .join(
        'regulation_questionnaire_answer_scales as scale',
        'scale.regulation_questionnaire_answer_scale_id',
        'q.regulation_questionnaire_question_answer_scale_id'
      )
      .where('s.regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .whereNull('s.deleted_at')
      .whereNull('q.deleted_at')
      .whereNull('scale.deleted_at')
      .orderBy('s.regulation_questionnaire_section_ord', 'asc')
      .orderBy('q.regulation_questionnaire_question_ord', 'asc')
      .select(
        'q.regulation_questionnaire_question_id as questionId',
        'scale.regulation_questionnaire_answer_scale_definition as definition'
      )

    if (questionsRows.length === 0) return

    const questionDefinitions = questionsRows.map((row) => {
      const definition = row.definition as
        | { options?: Array<{ key: string; value: number }> }
        | string
        | null

      const parsedDefinition =
        typeof definition === 'string'
          ? (JSON.parse(definition) as { options?: Array<{ key: string; value: number }> })
          : definition

      const selectedOption = parsedDefinition?.options?.[0]
      if (!selectedOption) {
        throw new Error(
          `No hay opciones de escala para la pregunta ${Number(row.questionId)} en escenario de prueba`
        )
      }

      return {
        questionId: Number(row.questionId),
        optionKey: selectedOption.key,
        optionValue: Number(selectedOption.value),
      }
    })

    const scenarioFolios = [
      'TEST-SCN-CLOSED-FULL',
      'TEST-SCN-CLOSED-MINUS-ONE',
      'TEST-SCN-CLOSED-NONE',
    ]

    await this.cleanupScenarioApplications(scenarioFolios)

    await this.createClosedScenario({
      folio: 'TEST-SCN-CLOSED-FULL',
      branchOfficeId: branch.branchOfficeId,
      businessUnitId: branch.businessUnitId,
      questionnaireId: questionnaire.regulationQuestionnaireId,
      launchedAt,
      closedAt: now,
      employeeIds,
      respondedCount: employeeIds.length,
      questionDefinitions,
    })

    const respondedMinusOne = Math.max(Math.min(employeeIds.length, minResponders) - 1, 0)
    await this.createClosedScenario({
      folio: 'TEST-SCN-CLOSED-MINUS-ONE',
      branchOfficeId: branch.branchOfficeId,
      businessUnitId: branch.businessUnitId,
      questionnaireId: questionnaire.regulationQuestionnaireId,
      launchedAt,
      closedAt: now,
      employeeIds,
      respondedCount: respondedMinusOne,
      questionDefinitions,
    })

    await this.createClosedScenario({
      folio: 'TEST-SCN-CLOSED-NONE',
      branchOfficeId: branch.branchOfficeId,
      businessUnitId: branch.businessUnitId,
      questionnaireId: questionnaire.regulationQuestionnaireId,
      launchedAt,
      closedAt: now,
      employeeIds,
      respondedCount: 0,
      questionDefinitions,
    })
  }

  private async cleanupScenarioApplications(folios: string[]) {
    const applications = await db
      .from('questionnaire_applications')
      .whereIn('questionnaire_application_folio', folios)
      .select('questionnaire_application_id')

    const applicationIds = applications.map((row) => Number(row.questionnaire_application_id))
    if (applicationIds.length === 0) return

    const responseIds = await db
      .from('questionnaire_application_responses')
      .whereIn('questionnaire_application_id', applicationIds)
      .select('questionnaire_application_response_id')

    const ids = responseIds.map((row) => Number(row.questionnaire_application_response_id))

    await db.transaction(async (trx) => {
      if (ids.length > 0) {
        await trx
          .from('questionnaire_application_answers')
          .whereIn('questionnaire_application_response_id', ids)
          .delete()
      }

      await trx
        .from('questionnaire_application_responses')
        .whereIn('questionnaire_application_id', applicationIds)
        .delete()
      await trx
        .from('questionnaire_application_targets')
        .whereIn('questionnaire_application_id', applicationIds)
        .delete()
      await trx
        .from('questionnaire_tabulation_employee_results')
        .whereIn('questionnaire_application_id', applicationIds)
        .delete()
      await trx
        .from('questionnaire_tabulation_results')
        .whereIn('questionnaire_application_id', applicationIds)
        .delete()
      await trx
        .from('questionnaire_applications')
        .whereIn('questionnaire_application_id', applicationIds)
        .delete()
    })
  }

  private async createClosedScenario(params: {
    folio: string
    branchOfficeId: number
    businessUnitId: number
    questionnaireId: number
    launchedAt: string
    closedAt: string
    employeeIds: number[]
    respondedCount: number
    questionDefinitions: Array<{ questionId: number; optionKey: string; optionValue: number }>
  }) {
    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const [applicationIdRaw] = await db.table('questionnaire_applications').insert({
      business_unit_id: params.businessUnitId,
      branch_office_id: params.branchOfficeId,
      regulation_questionnaire_id: params.questionnaireId,
      questionnaire_application_folio: params.folio,
      questionnaire_application_instrument: 'guide_ii',
      questionnaire_application_status: 'cerrada',
      questionnaire_application_launched_at: params.launchedAt,
      questionnaire_application_closed_at: params.closedAt,
      questionnaire_application_created_at: now,
      questionnaire_application_updated_at: now,
      questionnaire_application_deleted_at: null,
    })
    const applicationId = Number(applicationIdRaw)

    await db.table('questionnaire_application_targets').insert(
      params.employeeIds.map((employeeId, index) => {
        const responded = index < params.respondedCount
        return {
          questionnaire_application_id: applicationId,
          employee_id: employeeId,
          questionnaire_application_target_status: responded ? 'respondido' : 'pendiente',
          questionnaire_application_target_responded_at: responded ? params.closedAt : null,
          questionnaire_application_target_created_at: now,
          questionnaire_application_target_updated_at: now,
        }
      })
    )

    const respondedEmployeeIds = params.employeeIds.slice(0, params.respondedCount)
    for (const employeeId of respondedEmployeeIds) {
      const [responseIdRaw] = await db.table('questionnaire_application_responses').insert({
        questionnaire_application_id: applicationId,
        employee_id: employeeId,
        questionnaire_application_response_answered_count: params.questionDefinitions.length,
        questionnaire_application_response_status: 'respondido',
        questionnaire_application_response_submitted_at: params.closedAt,
        questionnaire_application_response_created_at: now,
        questionnaire_application_response_updated_at: now,
        questionnaire_application_response_deleted_at: null,
      })

      const responseId = Number(responseIdRaw)
      await db.table('questionnaire_application_answers').insert(
        params.questionDefinitions.map((question) => ({
          questionnaire_application_response_id: responseId,
          regulation_questionnaire_question_id: question.questionId,
          questionnaire_application_answer_option_key: question.optionKey,
          questionnaire_application_answer_value: question.optionValue,
          questionnaire_application_answer_created_at: now,
          questionnaire_application_answer_updated_at: now,
        }))
      )
    }
  }
}

function nowSql() {
  return DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss')
}
