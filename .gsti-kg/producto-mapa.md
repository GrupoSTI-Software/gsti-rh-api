---
kg_version: "1.0.0"
kg_built_at: "2026-06-11T16:02:32+00:00"
kg_head_sha: "780e870ec8584dbf10a52e65d0f1e6945027f5fc"
kg_branch: "multitenant"
repo_key: "valanserh-api"
stack: "adonis"
producto: "valanserh"
prefijo_asana: "USRH"
default_branch: "develop"
counts:
  entidades_db: 164
  endpoints: 781
  controllers: 151
  services: 155
  validators: 112
  middlewares: 7
  seeders: 31
  tablas_migradas: 179
  i18n_keys: 2393
---

# Knowledge Graph — valanserh-api

> Generado automáticamente por `kg-builder-adonis.py`. No editar a mano. Se regenera si el SHA HEAD cambia.

## Convenciones detectadas

- **PK pattern**: entity-prefixed (<entity>Id)
- **Column naming**: entity-prefixed (camelCase TS / snake_case DB)
- **Soft delete coverage**: 90% de los modelos usan SoftDeletes
- **Estructura**: plana por capa (app/controllers/, app/services/, app/models/, app/validators/, app/middleware/, app/dtos/, app/interfaces/, app/exceptions/, app/helpers/)
- **Routes por dominio**: cada entidad tiene su start/routes/<entity>_routes.ts importado en start/routes.ts
- **i18n del backend**: resources/langs/{es,en}.json
- **Stack**: AdonisJS 6, Lucid ORM (MySQL), soft deletes via adonis-lucid-soft-deletes

## Entidades de BD (164)

### `AccessPoint`

- **Archivo**: `app/models/access_point.ts`
- **PK**: `accessPointId`
- **Soft delete**: sí
- **Columnas**:
  - `accessPointId`: number (PK)
  - `accessPointName`: string
  - `businessUnitId`: number
  - `accessPointActive`: number
  - `accessPointSerialNumber`: string | null
  - `accessPointDeviceName`: string | null
  - `accessPointIp`: string | null
  - `accessPointMac`: string | null
  - `accessPointFirmware`: string | null
  - `accessPointPlatform`: string | null
  - `accessPointStatus`: number

### `AccessPointEmployee`

- **Archivo**: `app/models/access_point_employee.ts`
- **PK**: `accessPointEmployeeId`
- **Soft delete**: sí
- **Columnas**:
  - `accessPointEmployeeId`: number (PK)
  - `employeeId`: number
  - `accessPointId`: number
  - `accessPointEmployeePin`: string

### `Address`

- **Archivo**: `app/models/address.ts`
- **PK**: `addressId`
- **Soft delete**: sí
- **Columnas**:
  - `addressId`: number (PK)
  - `addressZipcode`: string
  - `addressCountry`: string
  - `addressState`: string
  - `addressTownship`: string
  - `addressCity`: string
  - `addressSettlement`: string
  - `addressSettlementType`: string
  - `addressStreet`: string
  - `addressInternalNumber`: string
  - `addressExternalNumber`: string
  - `addressBetweenStreet1`: string
  - `addressBetweenStreet2`: string
  - `addressTypeId`: number

### `AddressType`

- **Archivo**: `app/models/address_type.ts`
- **PK**: `addressTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `addressTypeId`: number (PK)
  - `addressTypeName`: string
  - `addressTypeDescription`: string
  - `addressTypeSlug`: string
  - `addressTypeActive`: number

### `Aircraft`

- **Archivo**: `app/models/aircraft.ts`

### `AircraftClass`

- **Archivo**: `app/models/aircraft_class.ts`

### `AircraftMaintenance`

- **Archivo**: `app/models/aircraft_maintenance.ts`
- **PK**: `aircraftMaintenanceId`
- **Soft delete**: sí
- **Columnas**:
  - `aircraftMaintenanceId`: number (PK)
  - `aircraftId`: number
  - `maintenanceTypeId`: number
  - `aircraftMaintenanceStartDate`: DateTime
  - `aircraftMaintenanceEndDate`: DateTime
  - `aircraftMaintenanceFinishDate`: DateTime | null
  - `maintenanceUrgencyLevelId`: number
  - `aircraftMaintenanceStatusId`: number
  - `aircraftMaintenanceNotes`: string | null

### `AircraftMaintenanceStatus`

- **Archivo**: `app/models/aircraft_maintenance_status.ts`
- **PK**: `aircraftMaintenanceStatusId`
- **Soft delete**: sí
- **Columnas**:
  - `aircraftMaintenanceStatusId`: number (PK)
  - `aircraftMaintenanceStatusName`: string | null
  - `aircraftMaintenanceStatusColor`: string | null
  - `aircraftMaintenanceStatusBg`: string | null

### `AircraftOperator`

- **Archivo**: `app/models/aircraft_operator.ts`
- **PK**: `aircraftOperatorId`
- **Soft delete**: sí
- **Columnas**:
  - `aircraftOperatorId`: number (PK)
  - `aircraftOperatorName`: string
  - `aircraftOperatorFiscalName`: string
  - `aircraftOperatorImage`: string
  - `aircraftOperatorSlug`: string
  - `aircraftOperatorActive`: boolean

### `AircraftProceedingFile`

- **Archivo**: `app/models/aircraft_proceeding_file.ts`
- **PK**: `aircraftProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `aircraftProceedingFileId`: number (PK)
  - `aircraftId`: number
  - `proceedingFileId`: number

### `AircraftProperty`

- **Archivo**: `app/models/aircraft_property.ts`

### `Airport`

- **Archivo**: `app/models/airport.ts`

### `ApiToken`

- **Archivo**: `app/models/api_token.ts`
- **PK**: `id`
- **Columnas**:
  - `id`: number (PK)
  - `type`: string
  - `origin`: string
  - `token`: string
  - `name`: string
  - `userId`: number
  - `apiTokenBrowser`: string

### `AsignacionContratoEspecializado`

- **Archivo**: `app/models/asignacion_contrato_especializado.ts`
- **PK**: `asignacionContratoEspecializadoId`
- **Soft delete**: sí
- **Columnas**:
  - `asignacionContratoEspecializadoId`: number (PK)
  - `contratoServicioEspecializadoId`: number
  - `employeeId`: number
  - `businessUnitId`: number
  - `porcentajeTiempo`: number

### `AssessmentTemplate`

- **Archivo**: `app/models/assessment_template.ts`
- **PK**: `assessmentTemplateId`
- **Soft delete**: sí
- **Columnas**:
  - `assessmentTemplateId`: number (PK)
  - `assessmentTemplateName`: string
  - `assessmentTemplateDescription`: string | null
  - `assessmentTemplateIsActive`: boolean

### `AssessmentTemplateDimension`

- **Archivo**: `app/models/assessment_template_dimension.ts`
- **PK**: `assessmentTemplateDimensionId`
- **Soft delete**: sí
- **Columnas**:
  - `assessmentTemplateDimensionId`: number (PK)
  - `assessmentTemplateId`: number
  - `assessmentTemplateDimensionName`: string
  - `assessmentTemplateDimensionAcronym`: string
  - `assessmentTemplateDimensionDataType`: AssessmentTemplateDimensionDataType
  - `assessmentTemplateDimensionOrderIndex`: number

### `Assist`

- **Archivo**: `app/models/assist.ts`
- **PK**: `assistId`
- **Soft delete**: sí
- **Columnas**:
  - `assistId`: number (PK)
  - `assistUuid`: string | null
  - `assistEmpCode`: string
  - `assistTerminalSn`: string
  - `assistTerminalAlias`: string
  - `assistAreaAlias`: string
  - `assistLongitude`: number
  - `assistLatitude`: number
  - `assistPrecision`: number
  - `assistEmpId`: number
  - `assistTerminalId`: number | null
  - `assistSyncId`: number
  - `assistActive`: number
  - `assistType`: string

### `AssistPageSync`

- **Archivo**: `app/models/assist_page_sync.ts`
- **PK**: `id`
- **Columnas**:
  - `id`: number (PK)
  - `statusSyncId`: number
  - `pageNumber`: number
  - `pageStatus`: 'pending' | 'sync'
  - `itemsCount`: number

### `AssistStatusSync`

- **Archivo**: `app/models/assist_status_sync.ts`
- **PK**: `id`
- **Columnas**:
  - `id`: number (PK)
  - `statusSync`: 'in_process' | 'success' | 'failed'
  - `pageTotalSync`: number
  - `itemsTotalSync`: number

### `AttendanceFaultHrNotificationLog`

- **Archivo**: `app/models/attendance_fault_hr_notification_log.ts`
- **PK**: `attendanceFaultHrNotificationLogId`
- **Columnas**:
  - `attendanceFaultHrNotificationLogId`: number (PK)
  - `employeeAssistCalendarId`: number
  - `employeeId`: number
  - `systemSettingId`: number

### `Bank`

- **Archivo**: `app/models/bank.ts`
- **PK**: `bankId`
- **Soft delete**: sí
- **Columnas**:
  - `bankId`: number (PK)
  - `bankName`: string
  - `bankActive`: number

### `BranchOffice`

- **Archivo**: `app/models/branch_office.ts`
- **PK**: `branchOfficeId`
- **Soft delete**: sí
- **Columnas**:
  - `branchOfficeId`: number (PK)
  - `businessUnitId`: number
  - `branchOfficeName`: string
  - `branchOfficeSlug`: string
  - `branchOfficeLocationAddress`: string | null
  - `branchOfficeIdealTemplateCount`: number | null
  - `branchOfficeMinActiveEmployeesPerShift`: number | null

### `BusinessUnit`

- **Archivo**: `app/models/business_unit.ts`
- **PK**: `businessUnitId`
- **Soft delete**: sí
- **Columnas**:
  - `businessUnitId`: number (PK)
  - `businessUnitName`: string
  - `businessUnitSlug`: string
  - `businessUnitLegalName`: string
  - `businessUnitActive`: number

### `BusinessUnitCompetencyLevel`

- **Archivo**: `app/models/business_unit_competency_level.ts`
- **PK**: `businessUnitCompetencyLevelId`
- **Soft delete**: sí
- **Columnas**:
  - `businessUnitCompetencyLevelId`: number (PK)
  - `businessUnitId`: number
  - `businessUnitCompetencyLevelLabel`: string
  - `businessUnitCompetencyLevelPosition`: number

### `BusinessUnitUser`

- **Archivo**: `app/models/business_unit_user.ts`
- **PK**: `businessUnitUserId`
- **Soft delete**: sí
- **Columnas**:
  - `businessUnitUserId`: number (PK)
  - `businessUnitId`: number
  - `userId`: number

### `CareerPathCandidate`

- **Archivo**: `app/models/career_path_candidate.ts`
- **PK**: `careerPathCandidateId`
- **Soft delete**: sí
- **Columnas**:
  - `careerPathCandidateId`: number (PK)
  - `businessUnitId`: number
  - `employeeId`: number
  - `originPositionId`: number
  - `targetPositionId`: number
  - `careerPathCandidateIsOverride`: boolean
  - `careerPathOverrideReasonId`: number | null
  - `careerPathCandidateJustification`: string
  - `careerPathCandidateStatus`: string
  - `proposedBy`: number
  - `reviewedBy`: number | null
  - `careerPathCandidateReviewedAt`: DateTime | null | string
  - `careerPathCandidateRejectionReason`: string

### `CareerPathCandidateStatusHistory`

- **Archivo**: `app/models/career_path_candidate_status_history.ts`
- **PK**: `careerPathCandidateStatusHistoryId`
- **Soft delete**: sí
- **Columnas**:
  - `careerPathCandidateStatusHistoryId`: number (PK)
  - `careerPathCandidateId`: number
  - `changedBy`: number
  - `careerPathCandidateStatusHistoryFromStatus`: string | null
  - `careerPathCandidateStatusHistoryToStatus`: string
  - `careerPathCandidateStatusHistoryReason`: string

### `CareerPathOverrideReason`

- **Archivo**: `app/models/career_path_override_reason.ts`
- **PK**: `careerPathOverrideReasonId`
- **Soft delete**: sí
- **Columnas**:
  - `careerPathOverrideReasonId`: number (PK)
  - `careerPathOverrideReasonKey`: string
  - `careerPathOverrideReasonLabel`: string
  - `careerPathOverrideReasonActive`: number

### `CareerPathTemplate`

- **Archivo**: `app/models/career_path_template.ts`
- **PK**: `careerPathTemplateId`
- **Soft delete**: sí
- **Columnas**:
  - `careerPathTemplateId`: number (PK)
  - `companyId`: number
  - `originPositionId`: number
  - `targetPositionId`: number
  - `createdBy`: number
  - `updatedBy`: number

### `Certification`

- **Archivo**: `app/models/certification.ts`
- **PK**: `certificationId`
- **Columnas**:
  - `certificationId`: number (PK)
  - `categoryId`: number
  - `certificationName`: string
  - `isExternal`: boolean
  - `externalUrl`: string | null
  - `renewalPeriodDays`: number | null

### `CertificationCategory`

- **Archivo**: `app/models/certification_category.ts`
- **PK**: `certificationCategoryId`
- **Columnas**:
  - `certificationCategoryId`: number (PK)
  - `certificationCategoryKey`: string
  - `certificationCategoryName`: string
  - `certificationCategoryDisplayOrder`: number
  - `certificationCategoryIsActive`: number

### `Clausula15d`

- **Archivo**: `app/models/clausula_15d.ts`
- **PK**: `clausula15dId`
- **Columnas**:
  - `clausula15dId`: number (PK)
  - `contratoServicioEspecializadoId`: number
  - `folioRepse`: string
  - `objetoDetallado`: string
  - `numeroTrabajadoresAprox`: number
  - `compromisosDocumentales`: CompromisoDocumental[]
  - `responsabilidadSolidariaAceptada`: boolean
  - `textoResponsabilidadSolidaria`: string

### `Competency`

- **Archivo**: `app/models/competency.ts`
- **PK**: `competencyId`
- **Soft delete**: sí
- **Columnas**:
  - `competencyId`: number (PK)
  - `competencyName`: string
  - `competencyType`: 'technical' | 'transversal'

### `CompetencyBracket`

- **Archivo**: `app/models/competency_bracket.ts`
- **PK**: `competencyBracketId`
- **Soft delete**: sí
- **Columnas**:
  - `competencyBracketId`: number (PK)
  - `competencyDescriptorId`: number
  - `competencyBracketDescription`: string
  - `competencyBracketRangeMin`: number
  - `competencyBracketRangeMax`: number
  - `competencyBracketPosition`: number

### `CompetencyDescriptor`

- **Archivo**: `app/models/competency_descriptor.ts`
- **PK**: `competencyDescriptorId`
- **Soft delete**: sí
- **Columnas**:
  - `competencyDescriptorId`: number (PK)
  - `competencyId`: number
  - `businessUnitCompetencyLevelId`: number
  - `competencyDescriptorDescription`: string

### `ContratoServicioEspecializado`

- **Archivo**: `app/models/contrato_servicio_especializado.ts`
- **PK**: `contratoServicioEspecializadoId`
- **Soft delete**: sí
- **Columnas**:
  - `contratoServicioEspecializadoId`: number (PK)
  - `businessUnitId`: number
  - `empresaContratanteId`: number
  - `numeroContrato`: string
  - `objetoServicio`: string
  - `montoTotal`: number | null
  - `moneda`: string
  - `estatus`: ContratoServicioEspecializadoEstatus

### `Customer`

- **Archivo**: `app/models/customer.ts`
- **PK**: `customerId`
- **Soft delete**: sí
- **Columnas**:
  - `customerId`: number (PK)
  - `customerUuid`: string
  - `personId`: number

### `CustomerProceedingFile`

- **Archivo**: `app/models/customer_proceeding_file.ts`
- **PK**: `customerProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `customerProceedingFileId`: number (PK)
  - `customerId`: number
  - `proceedingFileId`: number

### `Department`

- **Archivo**: `app/models/department.ts`
- **PK**: `departmentId`
- **Soft delete**: sí
- **Columnas**:
  - `departmentId`: number (PK)
  - `departmentSyncId`: number
  - `departmentCode`: string
  - `departmentName`: string
  - `departmentAlias`: string
  - `aliases`: string | null
  - `departmentIsDefault`: boolean
  - `departmentActive`: number
  - `parentDepartmentId`: number | null
  - `parentDepartmentSyncId`: number
  - `companyId`: number
  - `businessUnitId`: number
  - `departmentLastSynchronizationAt`: Date

### `DepartmentPosition`

- **Archivo**: `app/models/department_position.ts`
- **PK**: `departmentPositionId`
- **Soft delete**: sí
- **Columnas**:
  - `departmentPositionId`: number (PK)
  - `departmentId`: number
  - `positionId`: number
  - `departmentPositionLastSynchronizationAt`: Date

### `DocumentoContratoEspecializado`

- **Archivo**: `app/models/documento_contrato_especializado.ts`
- **PK**: `documentoContratoEspecializadoId`
- **Soft delete**: sí
- **Columnas**:
  - `documentoContratoEspecializadoId`: number (PK)
  - `contratoServicioEspecializadoId`: number
  - `businessUnitId`: number
  - `origen`: DocumentoContratoEspecializadoOrigen
  - `vigente`: boolean
  - `nombreArchivo`: string
  - `storageKey`: string
  - `mimeType`: string
  - `tamanoBytes`: number
  - `subidoPor`: number | null

### `Employee`

- **Archivo**: `app/models/employee.ts`
- **PK**: `employeeId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeId`: number (PK)
  - `employeeSyncId`: number
  - `employeeCode`: number | string
  - `employeeFirstName`: string
  - `employeeLastName`: string
  - `employeeSecondLastName`: string
  - `employeePayrollNum`: string
  - `employeePayrollCode`: string | null
  - `employeeSlug`: string | null
  - `employeeWorkSchedule`: string
  - `employeePhoto`: string | null
  - `companyId`: number
  - `departmentId`: number | null
  - `departmentSyncId`: number
  - `positionId`: number | null
  - `positionSyncId`: number
  - `personId`: number
  - `businessUnitId`: number
  - `dailySalary`: number
  - `payrollBusinessUnitId`: number
  - `employeeAssistDiscriminator`: number
  - `employeeLastSynchronizationAt`: Date
  - `employeeTypeId`: number
  - `employeeBusinessEmail`: string
  - `employeeBusinessPhone`: string
  - `employeeTypeOfContract`: string
  - `employeeTerminatedDate`: Date | string | null
  - `employeeTerminationModality`: string | null
  - `employeeTerminationType`: string | null
  - `employeeIgnoreConsecutiveAbsences`: number
  - `employeeAuthorizeAnyZones`: number

### `EmployeeAddress`

- **Archivo**: `app/models/employee_address.ts`
- **PK**: `employeeAddressId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeAddressId`: number (PK)
  - `employeeId`: number
  - `addressId`: number

### `EmployeeAnnotation`

- **Archivo**: `app/models/employee_annotation.ts`
- **PK**: `employeeAnnotationId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeAnnotationId`: number (PK)
  - `employeeId`: number
  - `employeeAnnotationContent`: string
  - `employeeAnnotationActive`: boolean
  - `userId`: number

### `EmployeeAssessment`

- **Archivo**: `app/models/employee_assessment.ts`
- **PK**: `employeeAssessmentId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeAssessmentId`: number (PK)
  - `employeeId`: number
  - `assessmentTemplateId`: number
  - `employeeAssessmentStatus`: string

### `EmployeeAssessmentResult`

- **Archivo**: `app/models/employee_assessment_result.ts`
- **PK**: `employeeAssessmentResultId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeAssessmentResultId`: number (PK)
  - `employeeAssessmentId`: number
  - `assessmentTemplateDimensionId`: number
  - `employeeAssessmentResultValue`: string | null
  - `employeeAssessmentResultStatus`: string | null

### `EmployeeAssistCalendar`

- **Archivo**: `app/models/employee_assist_calendar.ts`
- **PK**: `employeeAssistCalendarId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeAssistCalendarId`: number (PK)
  - `employeeId`: number
  - `day`: string
  - `checkInAssistId`: number | null
  - `checkInDateTime`: string | DateTime | null
  - `checkInStatus`: string | null
  - `checkOutAssistId`: number | null
  - `checkOutDateTime`: string | DateTime | null
  - `checkOutStatus`: string | null
  - `checkEatInAssistId`: number | null
  - `checkEatOutAssistId`: number | null
  - `shiftId`: number | null
  - `shiftIsChange`: boolean
  - `hasExceptions`: boolean
  - `holidayId`: number | null
  - `isBirthday`: boolean
  - `isCheckInEatNextDay`: boolean
  - `isCheckOutEatNextDay`: boolean
  - `isCheckOutNextDay`: boolean
  - `isFutureDay`: boolean
  - `isHoliday`: boolean
  - `isRestDay`: boolean
  - `isSundayBonus`: boolean
  - `isVacationDate`: boolean
  - `isWorkDisabilityDate`: boolean
  - `shiftCalculateFlag`: string | null
  - `hasAssitFlatList`: boolean

### `EmployeeBank`

- **Archivo**: `app/models/employee_bank.ts`
- **PK**: `employeeBankId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeBankId`: number (PK)
  - `employeeBankAccountClabe`: string
  - `employeeBankAccountClabeLastNumbers`: string
  - `employeeBankAccountNumber`: string
  - `employeeBankAccountNumberLastNumbers`: string
  - `employeeBankAccountCardNumber`: string
  - `employeeBankAccountCardNumberLastNumbers`: string
  - `employeeBankAccountType`: string
  - `employeeBankAccountCurrencyType`: string
  - `employeeId`: number
  - `bankId`: number

### `EmployeeBiometric`

- **Archivo**: `app/models/employee_biometric.ts`
- **PK**: `employeeBiometricId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeBiometricId`: number (PK)
  - `employeeId`: number
  - `employeeBiometricData`: string
  - `employeeBiometricStatus`: | 'pending'

### `EmployeeBiometricFaceId`

- **Archivo**: `app/models/employee_biometric_face_id.ts`
- **PK**: `employeeBiometricFaceIdId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeBiometricFaceIdId`: number (PK)
  - `employeeId`: number
  - `employeeBiometricFaceIdPhotoUrl`: string
  - `employeeBiometricFaceIdToken`: string
  - `employeeBiometricFaceIdPhotoUrlProxy`: string

### `EmployeeBonus`

- **Archivo**: `app/models/employee_bonus.ts`
- **PK**: `employeeBonusId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeBonusId`: number (PK)
  - `employeeId`: number
  - `employeeBonusConcept`: string
  - `employeeBonusQuantity`: number
  - `employeeBonusUnitAmount`: number
  - `employeeBonusTotal`: number

### `EmployeeBranchOffice`

- **Archivo**: `app/models/employee_branch_office.ts`
- **PK**: `employeeBranchOfficeId`
- **Columnas**:
  - `employeeBranchOfficeId`: number (PK)
  - `employeeId`: number
  - `branchOfficeId`: number
  - `employeeBranchOfficeActive`: number

### `EmployeeCertification`

- **Archivo**: `app/models/employee_certification.ts`
- **PK**: `employeeCertificationId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeCertificationId`: number (PK)
  - `employeeId`: number
  - `certificationId`: number
  - `employeeCertificationDocumentUrl`: string | null

### `EmployeeChildren`

- **Archivo**: `app/models/employee_children.ts`
- **PK**: `employeeChildrenId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeChildrenId`: number (PK)
  - `employeeChildrenFirstname`: string
  - `employeeChildrenLastname`: string
  - `employeeChildrenSecondLastname`: string
  - `employeeChildrenGender`: string
  - `employeeChildrenBirthday`: string
  - `employeeId`: number

### `EmployeeCompetencyEvaluation`

- **Archivo**: `app/models/employee_competency_evaluation.ts`
- **PK**: `employeeCompetencyEvaluationId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeCompetencyEvaluationId`: number (PK)
  - `employeeEvaluationId`: number
  - `positionBusinessUnitCompetencyLevelId`: number
  - `businessUnitCompetencyLevelId`: number
  - `competencyBracketId`: number
  - `employeeCompetencyEvaluationBracketDescription`: string
  - `employeeCompetencyEvaluationBracketRangeMin`: number
  - `employeeCompetencyEvaluationBracketRangeMax`: number
  - `employeeCompetencyEvaluationScore`: number

### `EmployeeContract`

- **Archivo**: `app/models/employee_contract.ts`
- **PK**: `employeeContractId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeContractId`: number (PK)
  - `employeeContractUuid`: string
  - `employeeContractFolio`: string
  - `employeeContractStartDate`: string
  - `employeeContractEndDate`: string
  - `employeeContractStatus`: string
  - `employeeContractMonthlyNetSalary`: number
  - `employeeContractFile`: string
  - `employeeContractTypeId`: number
  - `employeeId`: number
  - `departmentId`: number
  - `positionId`: number
  - `payrollBusinessUnitId`: number
  - `employeeContractActive`: number

### `EmployeeContractType`

- **Archivo**: `app/models/employee_contract_type.ts`
- **PK**: `employeeContractTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeContractTypeId`: number (PK)
  - `employeeContractTypeName`: string
  - `employeeContractTypeDescription`: string
  - `employeeContractTypeSlug`: string

### `EmployeeDevice`

- **Archivo**: `app/models/employee_device.ts`
- **PK**: `employeeDeviceId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeDeviceId`: number (PK)
  - `employeeDeviceToken`: string
  - `employeeDeviceModel`: string
  - `employeeDeviceBrand`: string
  - `employeeDeviceType`: string
  - `employeeDeviceOs`: string
  - `employeeDeviceActive`: number
  - `employeeId`: number

### `EmployeeEmergencyContact`

- **Archivo**: `app/models/employee_emergency_contact.ts`
- **PK**: `employeeEmergencyContactId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeEmergencyContactId`: number (PK)
  - `employeeEmergencyContactFirstname`: string
  - `employeeEmergencyContactLastname`: string
  - `employeeEmergencyContactSecondLastname`: string
  - `employeeEmergencyContactRelationship`: string
  - `employeeEmergencyContactPhone`: string
  - `employeeId`: number
  - `employeeEmergencyContactIsPrimary`: boolean

### `EmployeeEvaluation`

- **Archivo**: `app/models/employee_evaluation.ts`
- **PK**: `employeeEvaluationId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeEvaluationId`: number (PK)
  - `employeeId`: number
  - `employeeEvaluationDate`: Date | string
  - `employeeEvaluationType`: string
  - `employeeEvaluationScore`: number | null
  - `employeeEvaluationPotential`: number | null

### `EmployeeKpiEvaluation`

- **Archivo**: `app/models/employee_kpi_evaluation.ts`
- **PK**: `employeeKpiEvaluationId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeKpiEvaluationId`: number (PK)
  - `employeeEvaluationId`: number
  - `positionKpiId`: number
  - `employeeKpiEvaluationScore`: number

### `EmployeeLactationPeriod`

- **Archivo**: `app/models/employee_lactation_period.ts`
- **PK**: `employeeLactationPeriodId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeLactationPeriodId`: number (PK)
  - `employeeId`: number
  - `employeeLactationPeriodType`: EmployeeLactationPeriodType
  - `employeeLactationPeriodReductionApplication`: EmployeeLactationPeriodReductionApplication
  - `employeeLactationPeriodNotes`: string | null

### `EmployeeLactationPeriodEvidence`

- **Archivo**: `app/models/employee_lactation_period_evidence.ts`
- **PK**: `employeeLactationPeriodEvidenceId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeLactationPeriodEvidenceId`: number (PK)
  - `employeeLactationPeriodId`: number
  - `employeeLactationPeriodEvidenceFile`: string
  - `employeeLactationPeriodEvidenceOriginalName`: string | null
  - `employeeLactationPeriodEvidenceCategory`: EmployeeLactationPeriodEvidenceCategory

### `EmployeeMedicalCondition`

- **Archivo**: `app/models/employee_medical_condition.ts`
- **PK**: `employeeMedicalConditionId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeMedicalConditionId`: number (PK)
  - `employeeId`: number
  - `medicalConditionTypeId`: number
  - `employeeMedicalConditionDiagnosis`: string
  - `employeeMedicalConditionNotes`: string
  - `employeeMedicalConditionActive`: number

### `EmployeeProceedingFile`

- **Archivo**: `app/models/employee_proceeding_file.ts`
- **PK**: `employeeProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeProceedingFileId`: number (PK)
  - `employeeId`: number
  - `proceedingFileId`: number

### `EmployeeProceedingFileType`

- **Archivo**: `app/models/employee_proceeding_file_type.ts`
- **PK**: `employeeProceedingFileTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeProceedingFileTypeId`: number (PK)
  - `employeeId`: number
  - `proceedingFileTypeId`: number

### `EmployeeRecord`

- **Archivo**: `app/models/employee_record.ts`
- **PK**: `employeeRecordId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeRecordId`: number (PK)
  - `employeeRecordPropertyId`: number
  - `employeeId`: number
  - `employeeRecordValue`: string
  - `employeeRecordActive`: number

### `EmployeeRecordProperty`

- **Archivo**: `app/models/employee_record_property.ts`
- **PK**: `employeeRecordPropertyId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeRecordPropertyId`: number (PK)
  - `employeeRecordPropertyName`: string
  - `employeeRecordPropertyType`: string
  - `employeeRecordPropertyCategoryName`: string

### `EmployeeSalaryHistory`

- **Archivo**: `app/models/employee_salary_history.ts`
- **PK**: `employeeSalaryHistoryId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeSalaryHistoryId`: number (PK)
  - `employeeId`: number
  - `changedBy`: number
  - `reason`: string | null

### `EmployeeShift`

- **Archivo**: `app/models/employee_shift.ts`
- **PK**: `employeeShiftId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeShiftId`: number (PK)
  - `employeeId`: number
  - `shiftId`: number
  - `employeShiftsApplySince`: Date | string

### `EmployeeShiftChange`

- **Archivo**: `app/models/employee_shift_changes.ts`
- **PK**: `employeeShiftChangeId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeShiftChangeId`: number (PK)
  - `employeeIdFrom`: number
  - `shiftIdFrom`: number
  - `employeeShiftChangeDateFrom`: string
  - `employeeShiftChangeDateFromIsRestDay`: number
  - `employeeIdTo`: number
  - `shiftIdTo`: number
  - `employeeShiftChangeDateTo`: string
  - `employeeShiftChangeDateToIsRestDay`: number
  - `employeeShiftChangeChangeThisShift`: number
  - `employeeShiftChangeNote`: string

### `EmployeeSpouse`

- **Archivo**: `app/models/employee_spouse.ts`
- **PK**: `employeeSpouseId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeSpouseId`: number (PK)
  - `employeeSpouseFirstname`: string
  - `employeeSpouseLastname`: string
  - `employeeSpouseSecondLastname`: string
  - `employeeSpouseOcupation`: string
  - `employeeSpouseBirthday`: string
  - `employeeSpousePhone`: string
  - `employeeId`: number

### `EmployeeSupplie`

- **Archivo**: `app/models/employee_supplie.ts`
- **PK**: `employeeSupplyId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeSupplyId`: number (PK)
  - `employeeId`: number
  - `supplyId`: number
  - `employeeSupplyStatus`: 'active' | 'retired' | 'shipping'
  - `employeeSupplyRetirementReason`: string | null
  - `employeeSupplyAdditions`: string | null

### `EmployeeSupplieAssignationPhoto`

- **Archivo**: `app/models/employee_supplie_assignation_photo.ts`
- **PK**: `employeeSupplieAssignationPhotoId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeSupplieAssignationPhotoId`: number (PK)
  - `employeeSupplyId`: number
  - `employeeSupplieAssignationPhotoType`: 'assignation' | 'return'
  - `employeeSupplieAssignationPhotoFile`: string

### `EmployeeSuppliesResponseContract`

- **Archivo**: `app/models/employee_supplies_response_contract.ts`
- **PK**: `employeeSupplyResponseContractId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeSupplyResponseContractId`: number (PK)
  - `employeeSupplyId`: number
  - `employeeSupplyResponseContractUuid`: string
  - `employeeSupplyResponseContractFile`: string
  - `employeeSupplyResponseContractDigitalSignature`: string | null

### `EmployeeTemporaryAssignment`

- **Archivo**: `app/models/employee_temporary_assignment.ts`
- **PK**: `employeeTemporaryAssignmentId`
- **Columnas**:
  - `employeeTemporaryAssignmentId`: number (PK)
  - `employeeId`: number
  - `sourceBranchId`: number
  - `targetBranchId`: number
  - `days`: number
  - `shiftOverrideStart`: string | null
  - `shiftOverrideEnd`: string | null

### `EmployeeType`

- **Archivo**: `app/models/employee_type.ts`
- **PK**: `employeeTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeTypeId`: number (PK)
  - `employeeTypeName`: string
  - `employeeTypeSlug`: string
  - `businessUnitId`: number

### `EmployeeVacationArchive`

- **Archivo**: `app/models/employee_vacation_archive.ts`
- **PK**: `employeeVacationArchiveId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeVacationArchiveId`: number (PK)
  - `employeeId`: number
  - `vacationSettingId`: number

### `EmployeeVacationArchiveContent`

- **Archivo**: `app/models/employee_vacation_archive_content.ts`
- **PK**: `employeeVacationArchiveContentId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeVacationArchiveContentId`: number (PK)
  - `employeeVacationArchiveId`: number
  - `employeeVacationArchiveContentDescription`: string
  - `employeeVacationArchiveContentFile`: string
  - `employeeVacationArchiveContentActive`: boolean

### `EmployeeZone`

- **Archivo**: `app/models/employee_zone.ts`
- **PK**: `employeeZoneId`
- **Soft delete**: sí
- **Columnas**:
  - `employeeZoneId`: number (PK)
  - `employeeId`: number
  - `zoneId`: number

### `EmpresaContratante`

- **Archivo**: `app/models/empresa_contratante.ts`
- **PK**: `empresaContratanteId`
- **Soft delete**: sí
- **Columnas**:
  - `empresaContratanteId`: number (PK)
  - `businessUnitId`: number
  - `razonSocial`: string
  - `rfc`: string
  - `domicilioFiscal`: string
  - `representanteLegal`: string | null
  - `correo`: string | null
  - `telefono`: string | null

### `ExceptionRequest`

- **Archivo**: `app/models/exception_request.ts`
- **Soft delete**: sí
- **Columnas**:
  - `requestedDate`: DateTime<true> | DateTime<false> | string | Date

### `ExceptionType`

- **Archivo**: `app/models/exception_type.ts`
- **PK**: `exceptionTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `exceptionTypeId`: number (PK)
  - `exceptionTypeTypeName`: string
  - `exceptionTypeIcon`: string
  - `exceptionTypeSlug`: string
  - `exceptionTypeIsGeneral`: number
  - `exceptionTypeNeedCheckInTime`: number | null
  - `exceptionTypeNeedCheckOutTime`: number | null
  - `exceptionTypeNeedReason`: number | null
  - `exceptionTypeNeedEnjoymentOfSalary`: number | null
  - `exceptionTypeNeedPeriodInDays`: number | null
  - `exceptionTypeNeedPeriodInHours`: number | null
  - `exceptionTypeActive`: number
  - `exceptionTypeCanMasive`: boolean
  - `exceptionTypeCanEmployeeRequests`: boolean

### `FlightAttendant`

- **Archivo**: `app/models/flight_attendant.ts`
- **PK**: `flightAttendantId`
- **Soft delete**: sí
- **Columnas**:
  - `flightAttendantId`: number (PK)
  - `flightAttendantPhoto`: string
  - `employeeId`: number

### `FlightAttendantProceedingFile`

- **Archivo**: `app/models/flight_attendant_proceeding_file.ts`
- **PK**: `flightAttendantProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `flightAttendantProceedingFileId`: number (PK)
  - `flightAttendantId`: number
  - `proceedingFileId`: number

### `Gallery`

- **Archivo**: `app/models/gallery.ts`

### `Holiday`

- **Archivo**: `app/models/holiday.ts`
- **PK**: `holidayId`
- **Soft delete**: sí
- **Columnas**:
  - `holidayId`: number (PK)
  - `holidayName`: string
  - `holidayDate`: string
  - `holidayBusinessUnits`: string
  - `holidayIcon`: string | null
  - `holidayIconId`: number | null
  - `holidayFrequency`: number
  - `holidayIsOfficialRestDay`: boolean

### `Icon`

- **Archivo**: `app/models/icon.ts`
- **PK**: `iconId`
- **Soft delete**: sí
- **Columnas**:
  - `iconId`: number (PK)
  - `iconName`: string
  - `iconSvg`: string

### `InsuranceCoverageType`

- **Archivo**: `app/models/insurance_coverage_type.ts`
- **PK**: `insuranceCoverageTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `insuranceCoverageTypeId`: number (PK)
  - `insuranceCoverageTypeName`: string
  - `insuranceCoverageTypeDescription`: string
  - `insuranceCoverageTypeSlug`: string
  - `insuranceCoverageTypeActive`: number

### `LaborLawHour`

- **Archivo**: `app/models/labor_law_hour.ts`
- **PK**: `laborLawHoursId`
- **Soft delete**: sí
- **Columnas**:
  - `laborLawHoursId`: number (PK)
  - `laborLawHoursHoursPerWeek`: number
  - `laborLawHoursActive`: number
  - `laborLawHoursApplySince`: string | Date
  - `laborLawHoursDescription`: string | null

### `MaintenanceExpense`

- **Archivo**: `app/models/maintenance_expense.ts`
- **PK**: `maintenanceExpenseId`
- **Soft delete**: sí
- **Columnas**:
  - `maintenanceExpenseId`: number (PK)
  - `aircraftMaintenanceId`: number
  - `maintenanceExpenseCategoryId`: number
  - `maintenanceExpenseAmount`: number
  - `maintenanceExpenseTicket`: string | null
  - `maintenanceExpenseTrackingNumber`: string
  - `maintenanceExpenseInternalFolio`: string

### `MaintenanceExpenseCategory`

- **Archivo**: `app/models/maintenance_expense_category.ts`
- **PK**: `maintenanceExpenseCategoryId`
- **Soft delete**: sí
- **Columnas**:
  - `maintenanceExpenseCategoryId`: number (PK)
  - `maintenanceExpenseCategoryName`: string
  - `maintenanceExpenseCategoryDescription`: string | null

### `MaintenanceType`

- **Archivo**: `app/models/maintenance_type.ts`
- **PK**: `maintenanceTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `maintenanceTypeId`: number (PK)
  - `maintenanceTypeName`: string | null
  - `maintenanceTypeDescription`: string | null

### `MaintenanceUrgencyLevel`

- **Archivo**: `app/models/maintenance_urgency_level.ts`
- **PK**: `maintenanceUrgencyLevelId`
- **Soft delete**: sí
- **Columnas**:
  - `maintenanceUrgencyLevelId`: number (PK)
  - `maintenanceUrgencyLevelName`: string | null
  - `maintenanceUrgencyLevelDescription`: string | null
  - `maintenanceUrgencyLevelColor`: string | null
  - `maintenanceUrgencyLevelBg`: string | null

### `MedicalConditionType`

- **Archivo**: `app/models/medical_condition_type.ts`
- **PK**: `medicalConditionTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `medicalConditionTypeId`: number (PK)
  - `medicalConditionTypeName`: string
  - `medicalConditionTypeDescription`: string
  - `medicalConditionTypeActive`: number

### `MedicalConditionTypeProperty`

- **Archivo**: `app/models/medical_condition_type_property.ts`
- **PK**: `medicalConditionTypePropertyId`
- **Soft delete**: sí
- **Columnas**:
  - `medicalConditionTypePropertyId`: number (PK)
  - `medicalConditionTypePropertyName`: string
  - `medicalConditionTypePropertyDescription`: string
  - `medicalConditionTypePropertyDataType`: string
  - `medicalConditionTypePropertyRequired`: number
  - `medicalConditionTypeId`: number
  - `medicalConditionTypePropertyActive`: number

### `MedicalConditionTypePropertyValue`

- **Archivo**: `app/models/medical_condition_type_property_value.ts`
- **PK**: `medicalConditionTypePropertyValueId`
- **Soft delete**: sí
- **Columnas**:
  - `medicalConditionTypePropertyValueId`: number (PK)
  - `medicalConditionTypePropertyId`: number
  - `employeeMedicalConditionId`: number
  - `medicalConditionTypePropertyValue`: string
  - `medicalConditionTypePropertyValueActive`: number

### `Notice`

- **Archivo**: `app/models/notice.ts`
- **PK**: `noticeId`
- **Soft delete**: sí
- **Columnas**:
  - `noticeId`: number (PK)
  - `noticeSubject`: string
  - `noticeDescription`: string
  - `noticeType`: string
  - `noticeRecipientEmails`: string | null
  - `noticeSentCount`: number

### `NoticeFile`

- **Archivo**: `app/models/notice_file.ts`
- **PK**: `noticeFileId`
- **Soft delete**: sí
- **Columnas**:
  - `noticeFileId`: number (PK)
  - `noticeId`: number
  - `noticeFilePath`: string

### `NoticeRecipient`

- **Archivo**: `app/models/notice_recipient.ts`
- **PK**: `noticeRecipientId`
- **Soft delete**: sí
- **Columnas**:
  - `noticeRecipientId`: number (PK)
  - `noticeId`: number
  - `employeeId`: number | null
  - `employeeEmail`: string
  - `employeeName`: string | null
  - `noticeRecipientSent`: boolean
  - `noticeRecipientRead`: boolean
  - `noticeRecipientError`: string | null

### `PasskeyCredential`

- **Archivo**: `app/models/passkey_credential.ts`
- **PK**: `passkeyCredentialId`
- **Soft delete**: sí
- **Columnas**:
  - `passkeyCredentialId`: number (PK)
  - `userId`: number
  - `passkeyCredentialIdBase64`: string
  - `passkeyCredentialPublicKey`: string
  - `passkeyCredentialCounter`: number
  - `passkeyCredentialDeviceName`: string | null
  - `passkeyCredentialTransports`: string[] | null
  - `passkeyCredentialAaguid`: string | null
  - `passkeyCredentialBackedUp`: boolean

### `Person`

- **Archivo**: `app/models/person.ts`
- **PK**: `personId`
- **Soft delete**: sí
- **Columnas**:
  - `personId`: number (PK)
  - `personFirstname`: string
  - `personLastname`: string
  - `personSecondLastname`: string
  - `personGender`: string
  - `personBirthday`: string | null
  - `personPhone`: string
  - `personEmail`: string
  - `personPhoneSecondary`: string
  - `personCurp`: string
  - `personRfc`: string
  - `personImssNss`: string
  - `personMaritalStatus`: string
  - `personPlaceOfBirthCountry`: string
  - `personPlaceOfBirthState`: string
  - `personPlaceOfBirthCity`: string

### `Pilot`

- **Archivo**: `app/models/pilot.ts`
- **PK**: `pilotId`
- **Soft delete**: sí
- **Columnas**:
  - `pilotId`: number (PK)
  - `pilotPhoto`: string
  - `employeeId`: number

### `PilotProceedingFile`

- **Archivo**: `app/models/pilot_proceeding_file.ts`
- **PK**: `pilotProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `pilotProceedingFileId`: number (PK)
  - `pilotId`: number
  - `proceedingFileId`: number

### `Position`

- **Archivo**: `app/models/position.ts`
- **PK**: `positionId`
- **Soft delete**: sí
- **Columnas**:
  - `positionId`: number (PK)
  - `positionSyncId`: number
  - `positionCode`: string
  - `positionName`: string
  - `positionAlias`: string
  - `aliases`: string | null
  - `positionDescription`: string
  - `positionGeneralObjective`: string
  - `positionSpecificRequirement`: string
  - `positionEvaluationFrequency`: string
  - `positionEvaluationDurationDays`: number
  - `positionEvaluationStartDay`: number
  - `positionIsDefault`: boolean
  - `positionActive`: number
  - `parentPositionId`: number | null
  - `parentPositionSyncId`: number
  - `companyId`: number
  - `businessUnitId`: number
  - `positionLastSynchronizationAt`: Date
  - `positionProfileExpirationDate`: Date
  - `positionMinStaff`: number | null
  - `positionIdealStaff`: number | null
  - `positionMaxStaff`: number | null
  - `positionMinActiveStaffPerShift`: number | null

### `PositionApprovalHistory`

- **Archivo**: `app/models/position_approval_history.ts`
- **PK**: `positionApprovalHistoryId`
- **Soft delete**: sí
- **Columnas**:
  - `positionApprovalHistoryId`: number (PK)
  - `positionId`: number
  - `positionApprovalHistoryDate`: Date

### `PositionAssessmentProfile`

- **Archivo**: `app/models/position_assessment_profile.ts`
- **PK**: `positionAssessmentProfileId`
- **Soft delete**: sí
- **Columnas**:
  - `positionAssessmentProfileId`: number (PK)
  - `positionId`: number
  - `assessmentTemplateDimensionId`: number
  - `positionAssessmentProfileMinimumValue`: number | null
  - `positionAssessmentProfileMaximumValue`: number | null
  - `positionAssessmentProfileExpectedValue`: AssessmentCategoricalValue | null

### `PositionBusinessUnitCompetencyLevel`

- **Archivo**: `app/models/position_business_unit_competency_level.ts`
- **PK**: `positionBusinessUnitCompetencyLevelId`
- **Soft delete**: sí
- **Columnas**:
  - `positionBusinessUnitCompetencyLevelId`: number (PK)
  - `positionId`: number
  - `competencyId`: number
  - `businessUnitCompetencyLevelId`: number

### `PositionCertificationRequirement`

- **Archivo**: `app/models/position_certification_requirement.ts`
- **PK**: `positionCertificationRequirementId`
- **Soft delete**: sí
- **Columnas**:
  - `positionCertificationRequirementId`: number (PK)
  - `positionId`: number
  - `certificationId`: number

### `PositionKpi`

- **Archivo**: `app/models/position_kpi.ts`
- **PK**: `positionKpiId`
- **Soft delete**: sí
- **Columnas**:
  - `positionKpiId`: number (PK)
  - `positionId`: number
  - `positionKpiName`: string
  - `positionKpiMin`: number
  - `positionKpiMax`: number
  - `positionKpiIdeal`: string
  - `positionKpiScale`: string
  - `positionKpiType`: string
  - `positionKpiFrequency`: string

### `PositionSalaryRange`

- **Archivo**: `app/models/position_salary_range.ts`
- **PK**: `positionSalaryRangeId`
- **Soft delete**: sí
- **Columnas**:
  - `positionSalaryRangeId`: number (PK)
  - `businessUnitId`: number
  - `positionId`: number
  - `createdBy`: number

### `PositionSalaryRangeAudit`

- **Archivo**: `app/models/position_salary_range_audit.ts`
- **PK**: `positionSalaryRangeAuditId`
- **Soft delete**: sí
- **Columnas**:
  - `positionSalaryRangeAuditId`: number (PK)
  - `rangeId`: number
  - `action`: SalaryRangeAuditAction
  - `actorId`: number
  - `reason`: string | null

### `PositionSpecificFunction`

- **Archivo**: `app/models/position_specific_function.ts`
- **PK**: `positionSpecificFunctionId`
- **Soft delete**: sí
- **Columnas**:
  - `positionSpecificFunctionId`: number (PK)
  - `positionId`: number
  - `positionSpecificFunctionName`: string
  - `positionSpecificFunctionFrequency`: string

### `PositionWorkTool`

- **Archivo**: `app/models/position_work_tool.ts`
- **PK**: `positionWorkToolId`
- **Soft delete**: sí
- **Columnas**:
  - `positionWorkToolId`: number (PK)
  - `positionId`: number
  - `positionWorkToolName`: string

### `ProceedingFile`

- **Archivo**: `app/models/proceeding_file.ts`
- **PK**: `proceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `proceedingFileId`: number (PK)
  - `proceedingFileName`: string
  - `proceedingFilePath`: string
  - `proceedingFileTypeId`: number
  - `proceedingFileExpirationAt`: Date | string
  - `proceedingFileActive`: number
  - `proceedingFileUuid`: string
  - `proceedingFileObservations`: string

### `ProceedingFileType`

- **Archivo**: `app/models/proceeding_file_type.ts`
- **PK**: `proceedingFileTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `proceedingFileTypeId`: number (PK)
  - `proceedingFileTypeName`: string
  - `proceedingFileTypeSlug`: string
  - `proceedingFileTypeAreaToUse`: string
  - `proceedingFileTypeActive`: number
  - `proceedingFileTypeBusinessUnits`: string
  - `parentId`: number | null
  - `proceedingFileTypeIsExclusive`: boolean

### `ProceedingFileTypeEmail`

- **Archivo**: `app/models/proceeding_file_type_email.ts`
- **PK**: `proceedingFileTypeEmailId`
- **Soft delete**: sí
- **Columnas**:
  - `proceedingFileTypeEmailId`: number (PK)
  - `proceedingFileTypeId`: number
  - `proceedingFileTypeEmailEmail`: string

### `ProceedingFileTypeProperty`

- **Archivo**: `app/models/proceeding_file_type_property.ts`
- **PK**: `proceedingFileTypePropertyId`
- **Soft delete**: sí
- **Columnas**:
  - `proceedingFileTypePropertyId`: number (PK)
  - `proceedingFileTypePropertyName`: string
  - `proceedingFileTypePropertyType`: string
  - `proceedingFileTypePropertyCategoryName`: string
  - `proceedingFileTypeId`: number

### `ProceedingFileTypePropertyValue`

- **Archivo**: `app/models/proceeding_file_type_property_value.ts`
- **PK**: `proceedingFileTypePropertyValueId`
- **Soft delete**: sí
- **Columnas**:
  - `proceedingFileTypePropertyValueId`: number (PK)
  - `proceedingFileTypePropertyValueValue`: string
  - `proceedingFileTypePropertyValueActive`: number
  - `proceedingFileTypePropertyId`: number
  - `employeeId`: number | null
  - `proceedingFileId`: number

### `RegulationClause`

- **Archivo**: `app/models/regulation_clause.ts`
- **PK**: `regulationClauseId`
- **Soft delete**: sí
- **Columnas**:
  - `regulationClauseId`: number (PK)
  - `regulationId`: number
  - `parentRegulationClauseId`: number | null
  - `regulationClauseCode`: string
  - `regulationClauseOrd`: number
  - `regulationClauseTitleKey`: string | null
  - `regulationClauseObligationKey`: string
  - `regulationClauseExplanationKey`: string
  - `regulationClauseRationaleKey`: string
  - `regulationClauseAuditCriteriaKey`: string
  - `regulationClauseApplicabilityKey`: string | null

### `RegulationClauseFeature`

- **Archivo**: `app/models/regulation_clause_feature.ts`
- **PK**: `regulationClauseFeatureId`
- **Soft delete**: sí
- **Columnas**:
  - `regulationClauseFeatureId`: number (PK)
  - `regulationClauseId`: number
  - `systemFeatureId`: number
  - `regulationClauseFeatureCoverage`: 'total' | 'parcial' | null
  - `regulationClauseFeatureNoteKey`: string | null

### `RepseRegistration`

- **Archivo**: `app/models/repse_registration.ts`
- **PK**: `repseRegistrationId`
- **Soft delete**: sí
- **Columnas**:
  - `repseRegistrationId`: number (PK)
  - `businessUnitId`: number
  - `folio`: string
  - `status`: RepseRegistrationStatus

### `RepseSpecializedService`

- **Archivo**: `app/models/repse_specialized_service.ts`
- **PK**: `repseSpecializedServiceId`
- **Soft delete**: sí
- **Columnas**:
  - `repseSpecializedServiceId`: number (PK)
  - `repseRegistrationId`: number
  - `name`: string
  - `objectDescription`: string
  - `status`: RepseSpecializedServiceStatus

### `Reservation`

- **Archivo**: `app/models/reservation.ts`
- **PK**: `reservationId`
- **Soft delete**: sí
- **Columnas**:
  - `reservationId`: number (PK)
  - `customerId`: number
  - `aircraftId`: number
  - `pilotSicId`: number
  - `pilotPicId`: number
  - `flightAttendantId`: number
  - `reservationSubtotal`: number
  - `reservationTaxFactor`: number | null
  - `reservationTax`: number
  - `reservationTotal`: number

### `ReservationLeg`

- **Archivo**: `app/models/reservation_leg.ts`
- **PK**: `reservationLegId`
- **Soft delete**: sí
- **Columnas**:
  - `reservationLegId`: number (PK)
  - `reservationLegFromLocation`: string | null
  - `reservationLegToLocation`: string | null
  - `airportDepartureId`: number
  - `airportDestinationId`: number
  - `reservationLegDepartureTime`: string | null
  - `reservationLegArriveTime`: string | null
  - `reservationLegPax`: number | null
  - `reservationLegTravelTime`: number
  - `reservationLegDistanceMn`: number | null
  - `reservationId`: number

### `ReservationNote`

- **Archivo**: `app/models/reservation_note.ts`
- **PK**: `reservationNoteId`
- **Soft delete**: sí
- **Columnas**:
  - `reservationNoteId`: number (PK)
  - `reservationId`: number
  - `reservationNoteContent`: string

### `Role`

- **Archivo**: `app/models/role.ts`
- **PK**: `roleId`
- **Soft delete**: sí
- **Columnas**:
  - `roleId`: number (PK)
  - `roleName`: string
  - `roleSlug`: string
  - `roleDescription`: string
  - `roleActive`: number
  - `roleBusinessAccess`: string
  - `roleManagementDays`: number

### `RoleDepartment`

- **Archivo**: `app/models/role_department.ts`
- **PK**: `roleDepartmentId`
- **Soft delete**: sí
- **Columnas**:
  - `roleDepartmentId`: number (PK)
  - `roleId`: number
  - `departmentId`: number

### `RoleSystemPermission`

- **Archivo**: `app/models/role_system_permission.ts`
- **PK**: `roleSystemPermissionId`
- **Soft delete**: sí
- **Columnas**:
  - `roleSystemPermissionId`: number (PK)
  - `roleId`: number
  - `systemPermissionId`: number

### `Shift`

- **Archivo**: `app/models/shift.ts`
- **PK**: `shiftId`
- **Columnas**:
  - `shiftId`: number (PK)
  - `shiftName`: string
  - `shiftAlias`: string | null
  - `shiftCalculateFlag`: string
  - `shiftDayStart`: number | null
  - `shiftTimeStart`: string
  - `shiftActiveHours`: number
  - `shiftRestDays`: string
  - `shiftAccumulatedFault`: number
  - `shiftBusinessUnits`: string
  - `shiftTemp`: number
  - `shiftLunchTime`: number | null
  - `shiftCompensableLunchSchedule`: number | null
  - `shiftColor`: string

### `ShiftException`

- **Archivo**: `app/models/shift_exception.ts`
- **PK**: `shiftExceptionId`
- **Soft delete**: sí
- **Columnas**:
  - `shiftExceptionId`: number (PK)
  - `employeeId`: number
  - `exceptionTypeId`: number
  - `shiftExceptionsDate`: Date | string
  - `shiftExceptionsDescription`: string
  - `shiftExceptionCheckInTime`: string | null
  - `shiftExceptionCheckOutTime`: string | null
  - `shiftExceptionEnjoymentOfSalary`: number | null
  - `shiftExceptionTimeByTime`: number | null
  - `workDisabilityPeriodId`: number | null
  - `vacationSettingId`: number | null
  - `lactationPeriodId`: number | null

### `ShiftExceptionEvidence`

- **Archivo**: `app/models/shift_exception_evidence.ts`
- **PK**: `shiftExceptionEvidenceId`
- **Soft delete**: sí
- **Columnas**:
  - `shiftExceptionEvidenceId`: number (PK)
  - `shiftExceptionEvidenceFile`: string
  - `shiftExceptionEvidenceType`: string
  - `shiftExceptionId`: number

### `SignupDraft`

- **Archivo**: `app/models/signup_draft.ts`
- **PK**: `signupDraftId`
- **Soft delete**: sí
- **Columnas**:
  - `signupDraftId`: number (PK)
  - `signupDraftEmail`: string
  - `signupDraftFirstName`: string
  - `signupDraftLastName`: string
  - `signupDraftSecondLastName`: string | null
  - `signupDraftBusinessUnitName`: string
  - `signupDraftPinCode`: string | null
  - `signupDraftToken`: string | null

### `Supplie`

- **Archivo**: `app/models/supplie.ts`
- **PK**: `supplyId`
- **Soft delete**: sí
- **Columnas**:
  - `supplyId`: number (PK)
  - `supplyFileNumber`: number
  - `supplyName`: string
  - `supplyDescription`: string | null
  - `supplyTypeId`: number
  - `supplyAcquisitionValue`: number | null
  - `supplyStatus`: 'active' | 'inactive' | 'lost' | 'damaged'
  - `supplyDeactivationReason`: string | null

### `SupplieCaracteristic`

- **Archivo**: `app/models/supplie_caracteristic.ts`
- **PK**: `supplieCaracteristicId`
- **Soft delete**: sí
- **Columnas**:
  - `supplieCaracteristicId`: number (PK)
  - `supplyTypeId`: number
  - `supplieCaracteristicName`: string
  - `supplieCaracteristicType`: 'text' | 'number' | 'date' | 'boolean' | 'radio' | 'file'

### `SupplieCaracteristicValue`

- **Archivo**: `app/models/supplie_caracteristic_value.ts`
- **PK**: `supplieCaracteristicValueId`
- **Soft delete**: sí
- **Columnas**:
  - `supplieCaracteristicValueId`: number (PK)
  - `supplieCaracteristicId`: number
  - `supplieId`: number
  - `supplieCaracteristicValueValue`: string | number | boolean | null

### `SupplyType`

- **Archivo**: `app/models/supply_type.ts`
- **PK**: `supplyTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `supplyTypeId`: number (PK)
  - `supplyTypeName`: string
  - `supplyTypeDescription`: string | null
  - `supplyTypeIdentifier`: string | null
  - `supplyTypeSlug`: string

### `SupplyValueHistory`

- **Archivo**: `app/models/supply_value_history.ts`
- **PK**: `supplyValueHistoryId`
- **Soft delete**: sí
- **Columnas**:
  - `supplyValueHistoryId`: number (PK)
  - `supplyId`: number
  - `supplyValueHistoryCost`: number
  - `supplyValueHistoryCurrentValue`: number
  - `supplyValueHistoryNotes`: string | null

### `SystemFeature`

- **Archivo**: `app/models/system_feature.ts`
- **PK**: `systemFeatureId`
- **Soft delete**: sí
- **Columnas**:
  - `systemFeatureId`: number (PK)
  - `systemModuleId`: number
  - `systemFeatureName`: string
  - `systemFeatureSlug`: string
  - `systemFeatureDescription`: string | null
  - `systemFeatureStatus`: 'planeado' | 'en_desarrollo' | 'disponible' | 'deprecado'

### `SystemModule`

- **Archivo**: `app/models/system_module.ts`
- **PK**: `systemModuleId`
- **Soft delete**: sí
- **Columnas**:
  - `systemModuleId`: number (PK)
  - `systemModuleName`: string
  - `systemModuleSlug`: string
  - `systemModuleDescription`: string
  - `systemModules`: string
  - `systemModulePath`: string
  - `systemModuleGroup`: string
  - `systemModuleActive`: number
  - `systemModuleIcon`: string

### `SystemPermission`

- **Archivo**: `app/models/system_permission.ts`
- **PK**: `systemPermissionId`
- **Soft delete**: sí
- **Columnas**:
  - `systemPermissionId`: number (PK)
  - `systemPermissionName`: string
  - `systemPermissionSlug`: string
  - `systemModuleId`: number
  - `systemPermissionDeletedAt`: DateTime | null

### `SystemSetting`

- **Archivo**: `app/models/system_setting.ts`
- **PK**: `systemSettingId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingId`: number (PK)
  - `systemSettingTradeName`: string
  - `systemSettingLogo`: string
  - `systemSettingBanner`: string
  - `systemSettingSidebarColor`: string
  - `systemSettingFavicon`: string
  - `systemSettingEmployeeAplicationIcon`: string
  - `systemSettingActive`: number
  - `systemSettingBusinessUnits`: string
  - `systemSettingToleranceCountPerAbsence`: number
  - `systemSettingRestrictFutureVacation`: number
  - `systemSettingBirthdayEmails`: number | 0 // 0 for false, 1 for true
  - `systemSettingAnniversaryEmails`: number | 0 // 0 for false, 1 for true
  - `systemSettingAttendanceFaultHrEmails`: number | 0
  - `systemSettingMaxAbsencesBeforeAttendanceLock`: number | null
  - `systemSettingMaxLateArrivalsBeforeAttendanceLock`: number | null
  - `systemSettingPeriodAbsencesBeforeAttendanceLock`: string
  - `systemSettingPeriodLateArrivalsBeforeAttendanceLock`: string
  - `systemSettingMonthlyConversionFactor`: number

### `SystemSettingNotificationEmail`

- **Archivo**: `app/models/system_setting_notification_email.ts`
- **PK**: `systemSettingNotificationEmailId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingNotificationEmailId`: number (PK)
  - `systemSettingId`: number
  - `email`: string

### `SystemSettingPayrollConfig`

- **Archivo**: `app/models/system_setting_payroll_config.ts`
- **PK**: `systemSettingPayrollConfigId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingPayrollConfigId`: number (PK)
  - `systemSettingPayrollConfigPaymentType`: string
  - `systemSettingPayrollConfigFixedDay`: string
  - `systemSettingPayrollConfigFixedEveryNWeeks`: number
  - `systemSettingPayrollConfigNumberOfDaysToBePaid`: number
  - `systemSettingPayrollConfigNumberOfDaysEndToBePaid`: number
  - `systemSettingPayrollConfigAdvanceDateInMonthsOf31Days`: boolean
  - `systemSettingPayrollConfigAdvanceDateOnHolidays`: boolean
  - `systemSettingPayrollConfigAdvanceDateOnWeekends`: boolean
  - `systemSettingPayrollConfigNumberOfOverdueDaysToOffset`: number
  - `systemSettingPayrollConfigApplySince`: string | Date
  - `systemSettingId`: number

### `SystemSettingProceedingFile`

- **Archivo**: `app/models/system_setting_proceeding_file.ts`
- **PK**: `systemSettingProceedingFileId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingProceedingFileId`: number (PK)
  - `systemSettingId`: number
  - `proceedingFileId`: number

### `SystemSettingSystemModule`

- **Archivo**: `app/models/system_setting_system_module.ts`
- **PK**: `systemSettingSystemModuleId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingSystemModuleId`: number (PK)
  - `systemSettingId`: number
  - `systemModuleId`: number

### `SystemSettingTradeName`

- **Archivo**: `app/models/system_setting_trade_name.ts`
- **PK**: `systemSettingTradeNameId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingTradeNameId`: number (PK)
  - `systemSettingId`: number
  - `systemSettingTradeName`: string
  - `systemSettingLogo`: string | null
  - `systemSettingBanner`: string | null
  - `systemSettingSidebarColor`: string
  - `systemSettingFavicon`: string | null
  - `systemSettingEmployeeAplicationIcon`: string | null

### `SystemSettingsEmployee`

- **Archivo**: `app/models/system_settings_employee.ts`
- **PK**: `systemSettingEmployeeId`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingEmployeeId`: number (PK)
  - `systemSettingId`: number
  - `isActive`: boolean
  - `employeeLimit`: number | null

### `Tolerance`

- **Archivo**: `app/models/tolerance.ts`
- **Soft delete**: sí
- **Columnas**:
  - `systemSettingId`: number

### `User`

- **Archivo**: `app/models/user.ts`
- **PK**: `userId`
- **Soft delete**: sí
- **Columnas**:
  - `userId`: number (PK)
  - `userEmail`: string
  - `userPassword`: string
  - `userToken`: string
  - `userActive`: number
  - `pinCode`: string
  - `userPinCodeExpiresAt`: DateTime | null
  - `roleId`: number
  - `personId`: number
  - `userEmailType`: string

### `UserFcmToken`

- **Archivo**: `app/models/user_fcm_token.ts`
- **PK**: `userFcmTokenId`
- **Soft delete**: sí
- **Columnas**:
  - `userFcmTokenId`: number (PK)
  - `userId`: number
  - `userFcmToken`: string
  - `userFcmTokenActive`: number
  - `userFcmTokenPlatform`: string
  - `userFcmTokenLastSeenAt`: string | null

### `UserResponsibleEmployee`

- **Archivo**: `app/models/user_responsible_employee.ts`
- **PK**: `userResponsibleEmployeeId`
- **Soft delete**: sí
- **Columnas**:
  - `userResponsibleEmployeeId`: number (PK)
  - `userId`: number
  - `employeeId`: number
  - `userResponsibleEmployeeReadonly`: number
  - `userResponsibleEmployeeDirectBoss`: number

### `VacationAuthorizationSignature`

- **Archivo**: `app/models/vacation_authorization_signature.ts`
- **PK**: `vacationAuthorizationSignatureId`
- **Soft delete**: sí
- **Columnas**:
  - `vacationAuthorizationSignatureId`: number (PK)
  - `exceptionRequestId`: number | null
  - `shiftExceptionId`: number
  - `vacationAuthorizationSignatureFile`: string

### `VacationDeduction`

- **Archivo**: `app/models/vacation_deduction.ts`
- **PK**: `vacationDeductionId`
- **Soft delete**: sí
- **Columnas**:
  - `vacationDeductionId`: number (PK)
  - `employeeId`: number
  - `vacationSettingId`: number
  - `vacationDeductionDays`: number
  - `vacationDeductionDescription`: string

### `VacationSetting`

- **Archivo**: `app/models/vacation_setting.ts`
- **PK**: `vacationSettingId`
- **Columnas**:
  - `vacationSettingId`: number (PK)

### `VersionContratoEspecializado`

- **Archivo**: `app/models/version_contrato_especializado.ts`
- **PK**: `versionContratoEspecializadoId`
- **Soft delete**: sí
- **Columnas**:
  - `versionContratoEspecializadoId`: number (PK)
  - `contratoServicioEspecializadoId`: number
  - `businessUnitId`: number
  - `numero`: number
  - `tipoCambio`: VersionContratoEspecializadoTipoCambio
  - `motivo`: string
  - `anexo15dSnapshot`: Anexo15dSnapshot
  - `documentoVigenteId`: number | null
  - `creadoPor`: number | null

### `Weight`

- **Archivo**: `app/models/weight.ts`
- **PK**: `weightId`
- **Soft delete**: sí
- **Columnas**:
  - `weightId`: number (PK)
  - `weightName`: string
  - `weightValue`: number

### `WorkDisability`

- **Archivo**: `app/models/work_disability.ts`
- **PK**: `workDisabilityId`
- **Soft delete**: sí
- **Columnas**:
  - `workDisabilityId`: number (PK)
  - `workDisabilityUuid`: string
  - `employeeId`: number
  - `insuranceCoverageTypeId`: number

### `WorkDisabilityNote`

- **Archivo**: `app/models/work_disability_note.ts`
- **PK**: `workDisabilityNoteId`
- **Soft delete**: sí
- **Columnas**:
  - `workDisabilityNoteId`: number (PK)
  - `workDisabilityNoteDescription`: string
  - `workDisabilityId`: number
  - `userId`: number

### `WorkDisabilityPeriod`

- **Archivo**: `app/models/work_disability_period.ts`
- **PK**: `workDisabilityPeriodId`
- **Soft delete**: sí
- **Columnas**:
  - `workDisabilityPeriodId`: number (PK)
  - `workDisabilityPeriodStartDate`: string
  - `workDisabilityPeriodEndDate`: string
  - `workDisabilityPeriodTicketFolio`: string
  - `workDisabilityPeriodFile`: string
  - `workDisabilityId`: number
  - `workDisabilityTypeId`: number

### `WorkDisabilityPeriodExpense`

- **Archivo**: `app/models/work_disability_period_expense.ts`
- **PK**: `workDisabilityPeriodExpenseId`
- **Soft delete**: sí
- **Columnas**:
  - `workDisabilityPeriodExpenseId`: number (PK)
  - `workDisabilityPeriodExpenseFile`: string
  - `workDisabilityPeriodExpenseAmount`: number
  - `workDisabilityPeriodId`: number

### `WorkDisabilityType`

- **Archivo**: `app/models/work_disability_type.ts`
- **PK**: `workDisabilityTypeId`
- **Soft delete**: sí
- **Columnas**:
  - `workDisabilityTypeId`: number (PK)
  - `workDisabilityTypeName`: string
  - `workDisabilityTypeDescription`: string
  - `workDisabilityTypeSlug`: string
  - `workDisabilityTypeActive`: number

### `WorkingTimeRule`

- **Archivo**: `app/models/working_time_rule.ts`
- **PK**: `workingTimeRuleId`
- **Soft delete**: sí
- **Columnas**:
  - `workingTimeRuleId`: number (PK)
  - `workingTimeRuleCountryCode`: string
  - `workingTimeRuleEffectiveYear`: number
  - `workingTimeRuleMaxWeeklyHours`: number
  - `workingTimeRuleMaxWeeklyOvertimeHours`: number
  - `workingTimeRuleMaxDailyOvertimeHours`: number
  - `workingTimeRuleMaxOvertimeDaysPerWeek`: number
  - `workingTimeRuleDailyHoursDay`: number
  - `workingTimeRuleDailyHoursNight`: number
  - `workingTimeRuleDailyHoursMixed`: number
  - `workingTimeRuleWorkDaysPerRestDay`: number
  - `workingTimeRuleSalaryProtection`: boolean
  - `businessUnitId`: number | null
  - `workingTimeRuleExceedsFederal`: boolean
  - `workingTimeRuleOverrideJustification`: string | null
  - `overrideCreatedByUserId`: number | null

### `Zone`

- **Archivo**: `app/models/zone.ts`
- **PK**: `zoneId`
- **Soft delete**: sí
- **Columnas**:
  - `zoneId`: number (PK)
  - `zoneName`: string
  - `zoneThumbnail`: string | null
  - `zoneAddress`: string
  - `zonePolygon`: string

## Endpoints REST (781)

### `/api/access-points` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/access-points` | `#controllers/access_point_controller.index` | `start/routes/access_point_routes.ts` |
| POST | `/api/access-points` | `#controllers/access_point_controller.store` | `start/routes/access_point_routes.ts` |
| GET | `/api/access-points/employee/:employeeId` | `#controllers/access_point_controller.getAccessPointsByEmployee` | `start/routes/access_point_routes.ts` |
| GET | `/api/access-points/:accessPointId` | `#controllers/access_point_controller.show` | `start/routes/access_point_routes.ts` |
| PUT | `/api/access-points/:accessPointId` | `#controllers/access_point_controller.update` | `start/routes/access_point_routes.ts` |
| DELETE | `/api/access-points/:accessPointId` | `#controllers/access_point_controller.delete` | `start/routes/access_point_routes.ts` |
| PUT | `/api/access-points/:accessPointId/connection-status` | `#controllers/access_point_controller.updateConnectionStatus` | `start/routes/access_point_routes.ts` |

### `/api/address` (middleware: auth, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/address` | `#controllers/address_controller.store` | `start/routes/address_routes.ts` |
| PUT | `/api/address/:addressId` | `#controllers/address_controller.update` | `start/routes/address_routes.ts` |
| GET | `/api/address` | `#controllers/address_controller.getPlaces` | `start/routes/address_routes.ts` |

### `/api/address-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/address-types` | `#controllers/address_type_controller.index` | `start/routes/address_type_routes.ts` |

### `/api/aircraft` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft` | `#controllers/aircrafts_controller.index` | `start/routes/aircraft_routes.ts` |
| POST | `/api/aircraft` | `#controllers/aircrafts_controller.store` | `start/routes/aircraft_routes.ts` |
| PUT | `/api/aircraft/:id` | `#controllers/aircrafts_controller.update` | `start/routes/aircraft_routes.ts` |
| DELETE | `/api/aircraft/:id` | `#controllers/aircrafts_controller.destroy` | `start/routes/aircraft_routes.ts` |
| GET | `/api/aircraft/:id` | `#controllers/aircrafts_controller.show` | `start/routes/aircraft_routes.ts` |

### `/api/aircraft-classes` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-classes` | `#controllers/aircraft_classes_controller.index` | `start/routes/aircraft_class_routes.ts` |
| POST | `/api/aircraft-classes` | `#controllers/aircraft_classes_controller.store` | `start/routes/aircraft_class_routes.ts` |
| PUT | `/api/aircraft-classes/:id` | `#controllers/aircraft_classes_controller.update` | `start/routes/aircraft_class_routes.ts` |
| DELETE | `/api/aircraft-classes/:id` | `#controllers/aircraft_classes_controller.destroy` | `start/routes/aircraft_class_routes.ts` |
| GET | `/api/aircraft-classes/:id` | `#controllers/aircraft_classes_controller.show` | `start/routes/aircraft_class_routes.ts` |

### `/api/aircraft-maintenance` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-maintenance` | `#controllers/aircraft_maintenance_controller.index` | `start/routes/aircraft_maintenance_routes.ts` |
| POST | `/api/aircraft-maintenance` | `#controllers/aircraft_maintenance_controller.store` | `start/routes/aircraft_maintenance_routes.ts` |
| PUT | `/api/aircraft-maintenance/:id` | `#controllers/aircraft_maintenance_controller.update` | `start/routes/aircraft_maintenance_routes.ts` |
| DELETE | `/api/aircraft-maintenance/:id` | `#controllers/aircraft_maintenance_controller.destroy` | `start/routes/aircraft_maintenance_routes.ts` |
| GET | `/api/aircraft-maintenance/:id` | `#controllers/aircraft_maintenance_controller.show` | `start/routes/aircraft_maintenance_routes.ts` |

### `/api/aircraft-maintenance-status` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-maintenance-status` | `#controllers/aircraft_maintenance_status_controller.index` | `start/routes/aircraft_maintenance_status_routes.ts` |

### `/api/aircraft-operators` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-operators` | `#controllers/aircraft_operators_controller.index` | `start/routes/aircraft_operator_routes.ts` |
| POST | `/api/aircraft-operators` | `#controllers/aircraft_operators_controller.store` | `start/routes/aircraft_operator_routes.ts` |
| PUT | `/api/aircraft-operators/:aircraftOperatorId` | `#controllers/aircraft_operators_controller.update` | `start/routes/aircraft_operator_routes.ts` |
| DELETE | `/api/aircraft-operators/:aircraftOperatorId` | `#controllers/aircraft_operators_controller.delete` | `start/routes/aircraft_operator_routes.ts` |
| GET | `/api/aircraft-operators/:aircraftOperatorId` | `#controllers/aircraft_operators_controller.show` | `start/routes/aircraft_operator_routes.ts` |

### `/api/aircraft-proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-proceeding-files/get-expired-and-expiring` | `#controllers/aircraft_proceeding_files_controller.getExpiresAndExpiring` | `start/routes/aircraft_proceeding_file_routes.ts` |
| GET | `/api/aircraft-proceeding-files` | `#controllers/aircraft_proceeding_files_controller.index` | `start/routes/aircraft_proceeding_file_routes.ts` |
| POST | `/api/aircraft-proceeding-files` | `#controllers/aircraft_proceeding_files_controller.store` | `start/routes/aircraft_proceeding_file_routes.ts` |
| GET | `/api/aircraft-proceeding-files/:id` | `#controllers/aircraft_proceeding_files_controller.show` | `start/routes/aircraft_proceeding_file_routes.ts` |
| PUT | `/api/aircraft-proceeding-files/:id` | `#controllers/aircraft_proceeding_files_controller.update` | `start/routes/aircraft_proceeding_file_routes.ts` |
| DELETE | `/api/aircraft-proceeding-files/:id` | `#controllers/aircraft_proceeding_files_controller.destroy` | `start/routes/aircraft_proceeding_file_routes.ts` |
| GET | `/api/aircraft-proceeding-files/:aircraftId/proceeding-files` | `#controllers/aircraft_proceeding_files_controller.getAircraftProceedingFiles` | `start/routes/aircraft_proceeding_file_routes.ts` |

### `/api/aircraft-properties` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/aircraft-properties` | `#controllers/aircraft_properties_controller.index` | `start/routes/aircraft_property_routes.ts` |
| POST | `/api/aircraft-properties` | `#controllers/aircraft_properties_controller.store` | `start/routes/aircraft_property_routes.ts` |
| PUT | `/api/aircraft-properties/:id` | `#controllers/aircraft_properties_controller.update` | `start/routes/aircraft_property_routes.ts` |
| DELETE | `/api/aircraft-properties/:id` | `#controllers/aircraft_properties_controller.destroy` | `start/routes/aircraft_property_routes.ts` |
| GET | `/api/aircraft-properties/:id` | `#controllers/aircraft_properties_controller.show` | `start/routes/aircraft_property_routes.ts` |

### `/api/airports` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/airports` | `#controllers/airports_controller.index` | `start/routes/airport.ts` |
| POST | `/api/airports` | `#controllers/airports_controller.store` | `start/routes/airport.ts` |
| PUT | `/api/airports/:id` | `#controllers/airports_controller.update` | `start/routes/airport.ts` |
| DELETE | `/api/airports/:id` | `#controllers/airports_controller.destroy` | `start/routes/airport.ts` |
| GET | `/api/airports/:id` | `#controllers/airports_controller.show` | `start/routes/airport.ts` |

### `/api/assessment-template-dimensions` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/assessment-template-dimensions` | `#controllers/assessment_template_dimension_controller.index` | `start/routes/assessment_template_dimension_routes.ts` |
| POST | `/api/assessment-template-dimensions` | `#controllers/assessment_template_dimension_controller.store` | `start/routes/assessment_template_dimension_routes.ts` |
| GET | `/api/assessment-template-dimensions/:assessmentTemplateDimensionId` | `#controllers/assessment_template_dimension_controller.show` | `start/routes/assessment_template_dimension_routes.ts` |
| PUT | `/api/assessment-template-dimensions/:assessmentTemplateDimensionId` | `#controllers/assessment_template_dimension_controller.update` | `start/routes/assessment_template_dimension_routes.ts` |
| DELETE | `/api/assessment-template-dimensions/:assessmentTemplateDimensionId` | `#controllers/assessment_template_dimension_controller.delete` | `start/routes/assessment_template_dimension_routes.ts` |

### `/api/assessment-templates` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/assessment-templates` | `#controllers/assessment_template_controller.index` | `start/routes/assessment_template_routes.ts` |
| POST | `/api/assessment-templates` | `#controllers/assessment_template_controller.store` | `start/routes/assessment_template_routes.ts` |
| GET | `/api/assessment-templates/:assessmentTemplateId` | `#controllers/assessment_template_controller.show` | `start/routes/assessment_template_routes.ts` |
| PUT | `/api/assessment-templates/:assessmentTemplateId` | `#controllers/assessment_template_controller.update` | `start/routes/assessment_template_routes.ts` |
| PATCH | `/api/assessment-templates/:assessmentTemplateId/status` | `#controllers/assessment_template_controller.toggleStatus` | `start/routes/assessment_template_routes.ts` |
| PATCH | `/api/assessment-templates/:assessmentTemplateId/dimensions/reorder` | `#controllers/assessment_template_controller.reorderDimensions` | `start/routes/assessment_template_routes.ts` |
| DELETE | `/api/assessment-templates/:assessmentTemplateId` | `#controllers/assessment_template_controller.delete` | `start/routes/assessment_template_routes.ts` |

### `/api/auth` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/auth/signup/start` | `#controllers/auth_signup_controller.start` | `start/routes/auth_signup_routes.ts` |
| POST | `/api/auth/signup/verify-otp` | `#controllers/auth_signup_controller.verifyOtp` | `start/routes/auth_signup_routes.ts` |
| POST | `/api/auth/signup/complete` | `#controllers/auth_signup_controller.completeSignup` | `start/routes/auth_signup_routes.ts` |
| POST | `/api/auth/login` | `#controllers/user_controller.login` | `start/routes/login_routes.ts` |
| POST | `/api/auth/refresh` | `#controllers/user_controller.refresh` | `start/routes/login_routes.ts` |
| POST | `/api/auth/logout` | `#controllers/user_controller.logout` | `start/routes/login_routes.ts` |
| POST | `/api/auth/recovery` | `#controllers/user_controller.recoveryPassword` | `start/routes/login_routes.ts` |
| POST | `/api/auth/request/verify/:token` | `#controllers/user_controller.verifyRequestRecovery` | `start/routes/login_routes.ts` |
| POST | `/api/auth/password/reset` | `#controllers/user_controller.passwordReset` | `start/routes/login_routes.ts` |
| GET | `/api/auth/session` | `#controllers/user_controller.authUser` | `start/routes/login_routes.ts` |
| POST | `/api/auth/request/code-verify/:pinCode` | `#controllers/user_controller.verifyRequestPinCode` | `start/routes/login_routes.ts` |
| POST | `/api/auth/passkey/register/options` | `#controllers/passkey_controller.registerOptions` | `start/routes/passkey_routes.ts` |
| POST | `/api/auth/passkey/register/complete` | `#controllers/passkey_controller.registerComplete` | `start/routes/passkey_routes.ts` |
| POST | `/api/auth/passkey/login/options` | `#controllers/passkey_controller.loginOptions` | `start/routes/passkey_routes.ts` |
| POST | `/api/auth/passkey/login/complete` | `#controllers/passkey_controller.loginComplete` | `start/routes/passkey_routes.ts` |
| POST | `/api/auth/passkey/check` | `#controllers/passkey_controller.checkPasskeys` | `start/routes/passkey_routes.ts` |

### `/api/banks` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/banks` | `#controllers/bank_controller.index` | `start/routes/bank_routes.ts` |

### `/api/branch-offices` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/branch-offices` | `#controllers/branch_offices_controller.store` | `start/routes/branch_offices.ts` |
| GET | `/api/branch-offices` | `#controllers/branch_offices_controller.index` | `start/routes/branch_offices.ts` |
| GET | `/api/branch-offices/:id` | `#controllers/branch_offices_controller.show` | `start/routes/branch_offices.ts` |
| PUT | `/api/branch-offices/:id` | `#controllers/branch_offices_controller.update` | `start/routes/branch_offices.ts` |
| DELETE | `/api/branch-offices/:id` | `#controllers/branch_offices_controller.destroy` | `start/routes/branch_offices.ts` |

### `/api/business-unit-competency-levels` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/business-unit-competency-levels` | `#controllers/business_unit_competency_level_controller.index` | `start/routes/business_unit_competency_level_routes.ts` |
| POST | `/api/business-unit-competency-levels` | `#controllers/business_unit_competency_level_controller.store` | `start/routes/business_unit_competency_level_routes.ts` |
| GET | `/api/business-unit-competency-levels/:businessUnitCompetencyLevelId` | `#controllers/business_unit_competency_level_controller.show` | `start/routes/business_unit_competency_level_routes.ts` |
| PUT | `/api/business-unit-competency-levels/:businessUnitCompetencyLevelId` | `#controllers/business_unit_competency_level_controller.update` | `start/routes/business_unit_competency_level_routes.ts` |
| DELETE | `/api/business-unit-competency-levels/:businessUnitCompetencyLevelId` | `#controllers/business_unit_competency_level_controller.delete` | `start/routes/business_unit_competency_level_routes.ts` |

### `/api/business-units` (middleware: auth, businessScopeOptional)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/business-units` | `#controllers/business_unit_controller.index` | `start/routes/business_unit_routes.ts` |

### `/api/career-path-candidates` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/career-path-candidates` | `#controllers/career_path_candidate_controller.index` | `start/routes/career_path_candidate_routes.ts` |
| POST | `/api/career-path-candidates` | `#controllers/career_path_candidate_controller.store` | `start/routes/career_path_candidate_routes.ts` |
| GET | `/api/career-path-candidates/:careerPathCandidateId` | `#controllers/career_path_candidate_controller.show` | `start/routes/career_path_candidate_routes.ts` |
| PUT | `/api/career-path-candidates/:careerPathCandidateId` | `#controllers/career_path_candidate_controller.updateStatus` | `start/routes/career_path_candidate_routes.ts` |
| DELETE | `/api/career-path-candidates/:careerPathCandidateId` | `#controllers/career_path_candidate_controller.delete` | `start/routes/career_path_candidate_routes.ts` |
| GET | `/api/career-path-candidates/employee/:employeeId` | `#controllers/career_path_candidate_controller.getByEmployeeId` | `start/routes/career_path_candidate_routes.ts` |

### `/api/career-path-override-reasons` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/career-path-override-reasons` | `#controllers/career_path_override_reason_controller.index` | `start/routes/career_path_override_reason_routes.ts` |

### `/api/career-path-templates` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/career-path-templates` | `#controllers/career_path_template_controller.index` | `start/routes/career_path_template_routes.ts` |
| POST | `/api/career-path-templates` | `#controllers/career_path_template_controller.store` | `start/routes/career_path_template_routes.ts` |
| GET | `/api/career-path-templates/:careerPathTemplateId` | `#controllers/career_path_template_controller.show` | `start/routes/career_path_template_routes.ts` |
| PUT | `/api/career-path-templates/:careerPathTemplateId` | `#controllers/career_path_template_controller.update` | `start/routes/career_path_template_routes.ts` |
| DELETE | `/api/career-path-templates/:careerPathTemplateId` | `#controllers/career_path_template_controller.delete` | `start/routes/career_path_template_routes.ts` |

### `/api/certification-categories` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/certification-categories` | `#controllers/certifications_controller.indexCategories` | `start/routes/certifications_routes.ts` |

### `/api/certifications` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/certifications` | `#controllers/certifications_controller.index` | `start/routes/certifications_routes.ts` |
| POST | `/api/certifications` | `#controllers/certifications_controller.store` | `start/routes/certifications_routes.ts` |
| PUT | `/api/certifications/:id` | `#controllers/certifications_controller.update` | `start/routes/certifications_routes.ts` |
| DELETE | `/api/certifications/:id` | `#controllers/certifications_controller.destroy` | `start/routes/certifications_routes.ts` |

### `/api/competencies` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/competencies` | `#controllers/competency_controller.index` | `start/routes/competency_routes.ts` |
| POST | `/api/competencies` | `#controllers/competency_controller.store` | `start/routes/competency_routes.ts` |
| GET | `/api/competencies/:competencyId` | `#controllers/competency_controller.show` | `start/routes/competency_routes.ts` |
| PUT | `/api/competencies/:competencyId` | `#controllers/competency_controller.update` | `start/routes/competency_routes.ts` |
| DELETE | `/api/competencies/:competencyId` | `#controllers/competency_controller.delete` | `start/routes/competency_routes.ts` |

### `/api/competency-brackets` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/competency-brackets` | `#controllers/competency_bracket_controller.store` | `start/routes/competency_bracket_routes.ts` |
| GET | `/api/competency-brackets/:competencyBracketId` | `#controllers/competency_bracket_controller.show` | `start/routes/competency_bracket_routes.ts` |
| PUT | `/api/competency-brackets/:competencyBracketId` | `#controllers/competency_bracket_controller.update` | `start/routes/competency_bracket_routes.ts` |
| DELETE | `/api/competency-brackets/:competencyBracketId` | `#controllers/competency_bracket_controller.delete` | `start/routes/competency_bracket_routes.ts` |
| GET | `/api/competency-brackets/by-descriptor/:competencyDescriptorId` | `#controllers/competency_bracket_controller.getByCompetencyDescriptorId` | `start/routes/competency_bracket_routes.ts` |

### `/api/competency-descriptors` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/competency-descriptors` | `#controllers/competency_descriptor_controller.store` | `start/routes/competency_descriptor_routes.ts` |
| GET | `/api/competency-descriptors/:competencyDescriptorId` | `#controllers/competency_descriptor_controller.show` | `start/routes/competency_descriptor_routes.ts` |
| PUT | `/api/competency-descriptors/:competencyDescriptorId` | `#controllers/competency_descriptor_controller.update` | `start/routes/competency_descriptor_routes.ts` |
| DELETE | `/api/competency-descriptors/:competencyDescriptorId` | `#controllers/competency_descriptor_controller.delete` | `start/routes/competency_descriptor_routes.ts` |
| GET | `/api/competency-descriptors/by-competency/:competencyId` | `#controllers/competency_descriptor_controller.getByCompetencyId` | `start/routes/competency_descriptor_routes.ts` |

### `/api/contratos-servicios-especializados` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/contratos-servicios-especializados/:contratoId/asignaciones` | `#controllers/asignaciones_contrato_especializado_controller.store` | `start/routes/asignaciones_contrato_especializado_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:contratoId/asignaciones` | `#controllers/asignaciones_contrato_especializado_controller.index` | `start/routes/asignaciones_contrato_especializado_routes.ts` |
| PATCH | `/api/contratos-servicios-especializados/:contratoId/asignaciones/:id` | `#controllers/asignaciones_contrato_especializado_controller.update` | `start/routes/asignaciones_contrato_especializado_routes.ts` |
| DELETE | `/api/contratos-servicios-especializados/:contratoId/asignaciones/:id` | `#controllers/asignaciones_contrato_especializado_controller.destroy` | `start/routes/asignaciones_contrato_especializado_routes.ts` |
| GET | `/api/contratos-servicios-especializados` | `#controllers/contratos_servicios_especializados_controller.index` | `start/routes/contratos_servicios_especializados_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:id` | `#controllers/contratos_servicios_especializados_controller.show` | `start/routes/contratos_servicios_especializados_routes.ts` |
| POST | `/api/contratos-servicios-especializados` | `#controllers/contratos_servicios_especializados_controller.store` | `start/routes/contratos_servicios_especializados_routes.ts` |
| PATCH | `/api/contratos-servicios-especializados/:id` | `#controllers/contratos_servicios_especializados_controller.update` | `start/routes/contratos_servicios_especializados_routes.ts` |
| DELETE | `/api/contratos-servicios-especializados/:id` | `#controllers/contratos_servicios_especializados_controller.destroy` | `start/routes/contratos_servicios_especializados_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:contratoId/documentos/vigente/descarga` | `#controllers/documentos_contrato_especializado_controller.downloadVigente` | `start/routes/documentos_contrato_especializado_routes.ts` |
| PUT | `/api/contratos-servicios-especializados/:contratoId/documentos/vigente` | `#controllers/documentos_contrato_especializado_controller.replaceVigente` | `start/routes/documentos_contrato_especializado_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:contratoId/documentos` | `#controllers/documentos_contrato_especializado_controller.index` | `start/routes/documentos_contrato_especializado_routes.ts` |
| POST | `/api/contratos-servicios-especializados/:contratoId/documentos` | `#controllers/documentos_contrato_especializado_controller.store` | `start/routes/documentos_contrato_especializado_routes.ts` |
| POST | `/api/contratos-servicios-especializados/:contratoId/renovaciones` | `#controllers/version_contrato_especializado_controller.renew` | `start/routes/versiones_contrato_especializado_routes.ts` |
| POST | `/api/contratos-servicios-especializados/:contratoId/addendums` | `#controllers/version_contrato_especializado_controller.addendum` | `start/routes/versiones_contrato_especializado_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:contratoId/versiones` | `#controllers/version_contrato_especializado_controller.index` | `start/routes/versiones_contrato_especializado_routes.ts` |
| GET | `/api/contratos-servicios-especializados/:contratoId/versiones/:numeroVersion` | `#controllers/version_contrato_especializado_controller.show` | `start/routes/versiones_contrato_especializado_routes.ts` |

### `/api/customers` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/customers` | `#controllers/customer_controller.index` | `start/routes/customer_routes.ts` |
| POST | `/api/customers` | `#controllers/customer_controller.store` | `start/routes/customer_routes.ts` |
| PUT | `/api/customers/:customerId` | `#controllers/customer_controller.update` | `start/routes/customer_routes.ts` |
| DELETE | `/api/customers/:customerId` | `#controllers/customer_controller.delete` | `start/routes/customer_routes.ts` |
| GET | `/api/customers/:customerId` | `#controllers/customer_controller.show` | `start/routes/customer_routes.ts` |
| GET | `/api/customers/:customerId/proceeding-files` | `#controllers/customer_controller.getProceedingFiles` | `start/routes/customer_routes.ts` |

### `/api/customers-proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/customers-proceeding-files/get-expired-and-expiring` | `#controllers/customer_proceeding_file_controller.getExpiresAndExpiring` | `start/routes/customer_proceeding_file_routes.ts` |
| GET | `/api/customers-proceeding-files` | `#controllers/customer_proceeding_file_controller.index` | `start/routes/customer_proceeding_file_routes.ts` |
| POST | `/api/customers-proceeding-files` | `#controllers/customer_proceeding_file_controller.store` | `start/routes/customer_proceeding_file_routes.ts` |
| PUT | `/api/customers-proceeding-files/:customerProceedingFileId` | `#controllers/customer_proceeding_file_controller.update` | `start/routes/customer_proceeding_file_routes.ts` |
| DELETE | `/api/customers-proceeding-files/:customerProceedingFileId` | `#controllers/customer_proceeding_file_controller.delete` | `start/routes/customer_proceeding_file_routes.ts` |
| GET | `/api/customers-proceeding-files/:customerProceedingFileId` | `#controllers/customer_proceeding_file_controller.show` | `start/routes/customer_proceeding_file_routes.ts` |

### `/api/departments` (middleware: auth, businessScope, auth, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/departments/organization` | `#controllers/department_controller.getOrganization` | `start/routes/department_routes.ts` |
| GET | `/api/departments/search` | `#controllers/department_controller.getSearch` | `start/routes/department_routes.ts` |
| GET | `/api/departments/:departmentId` | `#controllers/department_controller.show` | `start/routes/department_routes.ts` |
| POST | `/api/departments` | `#controllers/department_controller.store` | `start/routes/department_routes.ts` |
| POST | `/api/departments/sync-positions` | `#controllers/department_controller.syncPositions` | `start/routes/department_routes.ts` |
| PUT | `/api/departments/:departmentId` | `#controllers/department_controller.update` | `start/routes/department_routes.ts` |
| DELETE | `/api/departments/:departmentId` | `#controllers/department_controller.delete` | `start/routes/department_routes.ts` |
| DELETE | `/api/departments/:departmentId/force-delete` | `#controllers/department_controller.forceDelete` | `start/routes/department_routes.ts` |
| GET | `/api/departments` | `#controllers/department_controller.getAll` | `start/routes/department_routes.ts` |
| GET | `/api/departments/get-only-with-employees/` | `#controllers/department_controller.getOnlyWithEmployees` | `start/routes/department_routes.ts` |
| GET | `/api/departments/:departmentId/positions` | `#controllers/department_controller.getPositions` | `start/routes/department_routes.ts` |
| GET | `/api/departments/:departmentId/get-rotation-index` | `#controllers/department_controller.getRotationIndex` | `start/routes/department_routes.ts` |
| PATCH | `/api/departments/:departmentId/move` | `#controllers/department_controller.move` | `start/routes/department_routes.ts` |
| POST | `/api/departments/assign-shift/:departmentId` | `#controllers/department_controller.assignShift` | `start/routes/department_routes.ts` |

### `/api/departments-positions` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/departments-positions` | `#controllers/department_position_controller.store` | `start/routes/department_position_routes.ts` |
| PUT | `/api/departments-positions/:departmentPositionId` | `#controllers/department_position_controller.update` | `start/routes/department_position_routes.ts` |
| DELETE | `/api/departments-positions/:departmentPositionId` | `#controllers/department_position_controller.delete` | `start/routes/department_position_routes.ts` |
| DELETE | `/api/departments-positions/:departmentId/:positionId` | `#controllers/department_position_controller.deleteRelation` | `start/routes/department_position_routes.ts` |
| GET | `/api/departments-positions/:departmentPositionId` | `#controllers/department_position_controller.show` | `start/routes/department_position_routes.ts` |

### `/api/employee-address` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-address` | `#controllers/employee_address_controller.index` | `start/routes/employee_address_routes.ts` |
| POST | `/api/employee-address` | `#controllers/employee_address_controller.store` | `start/routes/employee_address_routes.ts` |
| PUT | `/api/employee-address/:employeeAddressId` | `#controllers/employee_address_controller.update` | `start/routes/employee_address_routes.ts` |
| DELETE | `/api/employee-address/:employeeAddressId` | `#controllers/employee_address_controller.delete` | `start/routes/employee_address_routes.ts` |
| GET | `/api/employee-address/:employeeAddressId` | `#controllers/employee_address_controller.show` | `start/routes/employee_address_routes.ts` |

### `/api/employee-annotations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-annotations` | `employeeAnnotationController.index` | `start/routes/employee_annotation_routes.ts` |
| POST | `/api/employee-annotations` | `employeeAnnotationController.store` | `start/routes/employee_annotation_routes.ts` |
| GET | `/api/employee-annotations/employee/:employeeId` | `employeeAnnotationController.getByEmployee` | `start/routes/employee_annotation_routes.ts` |
| GET | `/api/employee-annotations/:employeeAnnotationId` | `employeeAnnotationController.show` | `start/routes/employee_annotation_routes.ts` |
| PUT | `/api/employee-annotations/:employeeAnnotationId` | `employeeAnnotationController.update` | `start/routes/employee_annotation_routes.ts` |
| DELETE | `/api/employee-annotations/:employeeAnnotationId` | `employeeAnnotationController.delete` | `start/routes/employee_annotation_routes.ts` |

### `/api/employee-assessments` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-assessments` | `#controllers/employee_assessment_controller.index` | `start/routes/employee_assessment_routes.ts` |
| POST | `/api/employee-assessments` | `#controllers/employee_assessment_controller.store` | `start/routes/employee_assessment_routes.ts` |
| GET | `/api/employee-assessments/employee/:employeeId` | `#controllers/employee_assessment_controller.getByEmployee` | `start/routes/employee_assessment_routes.ts` |
| GET | `/api/employee-assessments/tests-by-position/:positionId` | `#controllers/employee_assessment_controller.getTemplatesByPosition` | `start/routes/employee_assessment_routes.ts` |
| GET | `/api/employee-assessments/:employeeAssessmentId` | `#controllers/employee_assessment_controller.show` | `start/routes/employee_assessment_routes.ts` |
| PUT | `/api/employee-assessments/:employeeAssessmentId` | `#controllers/employee_assessment_controller.update` | `start/routes/employee_assessment_routes.ts` |
| DELETE | `/api/employee-assessments/:employeeAssessmentId` | `#controllers/employee_assessment_controller.delete` | `start/routes/employee_assessment_routes.ts` |

### `/api/employee-banks` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-banks` | `#controllers/employee_bank_controller.store` | `start/routes/employee_bank_routes.ts` |
| PUT | `/api/employee-banks/:employeeBankId` | `#controllers/employee_bank_controller.update` | `start/routes/employee_bank_routes.ts` |
| DELETE | `/api/employee-banks/:employeeBankId` | `#controllers/employee_bank_controller.delete` | `start/routes/employee_bank_routes.ts` |
| GET | `/api/employee-banks/:employeeBankId` | `#controllers/employee_bank_controller.show` | `start/routes/employee_bank_routes.ts` |

### `/api/employee-bonuses` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-bonuses` | `#controllers/employee_bonus_controller.index` | `start/routes/employee_bonus_routes.ts` |
| POST | `/api/employee-bonuses` | `#controllers/employee_bonus_controller.store` | `start/routes/employee_bonus_routes.ts` |
| GET | `/api/employee-bonuses/concepts/:employeeId` | `#controllers/employee_bonus_controller.concepts` | `start/routes/employee_bonus_routes.ts` |
| GET | `/api/employee-bonuses/:employeeBonusId` | `#controllers/employee_bonus_controller.show` | `start/routes/employee_bonus_routes.ts` |
| PUT | `/api/employee-bonuses/:employeeBonusId` | `#controllers/employee_bonus_controller.update` | `start/routes/employee_bonus_routes.ts` |
| DELETE | `/api/employee-bonuses/:employeeBonusId` | `#controllers/employee_bonus_controller.delete` | `start/routes/employee_bonus_routes.ts` |

### `/api/employee-certifications` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-certifications/get-expired-and-expiring` | `#controllers/employee_certification_expiration_controller.getExpiresAndExpiring` | `start/routes/employee_certification_expiration_routes.ts` |
| GET | `/api/employee-certifications` | `#controllers/employee_certification_expiration_controller.index` | `start/routes/employee_certification_expiration_routes.ts` |

### `/api/employee-children` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-children` | `#controllers/employee_children_controller.store` | `start/routes/employee_children_routes.ts` |
| PUT | `/api/employee-children/:employeeChildrenId` | `#controllers/employee_children_controller.update` | `start/routes/employee_children_routes.ts` |
| DELETE | `/api/employee-children/:employeeChildrenId` | `#controllers/employee_children_controller.delete` | `start/routes/employee_children_routes.ts` |
| GET | `/api/employee-children/:employeeChildrenId` | `#controllers/employee_children_controller.show` | `start/routes/employee_children_routes.ts` |

### `/api/employee-competency-evaluations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-competency-evaluations` | `#controllers/employee_competency_evaluation_controller.index` | `start/routes/employee_competency_evaluation.ts` |
| POST | `/api/employee-competency-evaluations` | `#controllers/employee_competency_evaluation_controller.store` | `start/routes/employee_competency_evaluation.ts` |
| PUT | `/api/employee-competency-evaluations/:employeeCompetencyEvaluationId` | `#controllers/employee_competency_evaluation_controller.update` | `start/routes/employee_competency_evaluation.ts` |
| DELETE | `/api/employee-competency-evaluations/:employeeCompetencyEvaluationId` | `#controllers/employee_competency_evaluation_controller.destroy` | `start/routes/employee_competency_evaluation.ts` |
| GET | `/api/employee-competency-evaluations/:employeeCompetencyEvaluationId` | `#controllers/employee_competency_evaluation_controller.show` | `start/routes/employee_competency_evaluation.ts` |

### `/api/employee-contract-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-contract-types` | `#controllers/employee_contract_type_controller.index` | `start/routes/employee_contract_type_routes.ts` |

### `/api/employee-contracts` (middleware: businessScopeOptional, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-contracts` | `#controllers/employee_contract_controller.store` | `start/routes/employee_contract_routes.ts` |
| PUT | `/api/employee-contracts/:employeeContractId` | `#controllers/employee_contract_controller.update` | `start/routes/employee_contract_routes.ts` |
| DELETE | `/api/employee-contracts/:employeeContractId` | `#controllers/employee_contract_controller.delete` | `start/routes/employee_contract_routes.ts` |
| GET | `/api/employee-contracts/:employeeContractId` | `#controllers/employee_contract_controller.show` | `start/routes/employee_contract_routes.ts` |
| GET | `/api/employee-contracts/:employeeContractId/download` | `#controllers/employee_contract_controller.download` | `start/routes/employee_contract_routes.ts` |

### `/api/employee-devices` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-devices` | `#controllers/employee_device_controller.index` | `start/routes/employee_device_routes.ts` |
| GET | `/api/employee-devices/employee/:employeeId` | `#controllers/employee_device_controller.getByEmployee` | `start/routes/employee_device_routes.ts` |
| PUT | `/api/employee-devices/:employeeDeviceId/status` | `#controllers/employee_device_controller.updateStatus` | `start/routes/employee_device_routes.ts` |
| DELETE | `/api/employee-devices/:employeeDeviceId` | `#controllers/employee_device_controller.delete` | `start/routes/employee_device_routes.ts` |

### `/api/employee-emergency-contacts` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-emergency-contacts` | `#controllers/employee_emergency_contact_controller.store` | `start/routes/employee_emergency_contact_routes.ts` |
| PUT | `/api/employee-emergency-contacts/:employeeEmergencyContactId` | `#controllers/employee_emergency_contact_controller.update` | `start/routes/employee_emergency_contact_routes.ts` |
| DELETE | `/api/employee-emergency-contacts/:employeeEmergencyContactId` | `#controllers/employee_emergency_contact_controller.delete` | `start/routes/employee_emergency_contact_routes.ts` |
| GET | `/api/employee-emergency-contacts/:employeeEmergencyContactId` | `#controllers/employee_emergency_contact_controller.show` | `start/routes/employee_emergency_contact_routes.ts` |
| GET | `/api/employee-emergency-contacts/employee/:employeeId` | `#controllers/employee_emergency_contact_controller.getByEmployeeId` | `start/routes/employee_emergency_contact_routes.ts` |

### `/api/employee-evaluations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-evaluations` | `#controllers/employee_evaluation_controller.index` | `start/routes/employee_evaluation.ts` |
| POST | `/api/employee-evaluations` | `#controllers/employee_evaluation_controller.store` | `start/routes/employee_evaluation.ts` |
| PUT | `/api/employee-evaluations/:employeeEvaluationId` | `#controllers/employee_evaluation_controller.update` | `start/routes/employee_evaluation.ts` |
| DELETE | `/api/employee-evaluations/:employeeEvaluationId` | `#controllers/employee_evaluation_controller.destroy` | `start/routes/employee_evaluation.ts` |
| GET | `/api/employee-evaluations/:employeeEvaluationId` | `#controllers/employee_evaluation_controller.show` | `start/routes/employee_evaluation.ts` |
| GET | `/api/employee-evaluations/by-employee/:employeeId` | `#controllers/employee_evaluation_controller.getByEmployee` | `start/routes/employee_evaluation.ts` |
| PUT | `/api/employee-evaluations/update-potential/:employeeEvaluationId` | `#controllers/employee_evaluation_controller.updatePotential` | `start/routes/employee_evaluation.ts` |

### `/api/employee-kpi-evaluations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-kpi-evaluations` | `#controllers/employee_kpi_evaluation_controller.index` | `start/routes/employee_kpi_evaluation.ts` |
| POST | `/api/employee-kpi-evaluations` | `#controllers/employee_kpi_evaluation_controller.store` | `start/routes/employee_kpi_evaluation.ts` |
| PUT | `/api/employee-kpi-evaluations/:employeeKpiEvaluationId` | `#controllers/employee_kpi_evaluation_controller.update` | `start/routes/employee_kpi_evaluation.ts` |
| DELETE | `/api/employee-kpi-evaluations/:employeeKpiEvaluationId` | `#controllers/employee_kpi_evaluation_controller.destroy` | `start/routes/employee_kpi_evaluation.ts` |
| GET | `/api/employee-kpi-evaluations/:employeeKpiEvaluationId` | `#controllers/employee_kpi_evaluation_controller.show` | `start/routes/employee_kpi_evaluation.ts` |

### `/api/employee-lactation-periods` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-lactation-periods` | `#controllers/employee_lactation_periods_controller.index` | `start/routes/employee_lactation_periods_routes.ts` |
| POST | `/api/employee-lactation-periods` | `#controllers/employee_lactation_periods_controller.store` | `start/routes/employee_lactation_periods_routes.ts` |
| GET | `/api/employee-lactation-periods/compliance-report` | `#controllers/employee_lactation_periods_controller.complianceReport` | `start/routes/employee_lactation_periods_routes.ts` |
| GET | `/api/employee-lactation-periods/compliance-report/export` | `#controllers/employee_lactation_periods_controller.complianceReportExport` | `start/routes/employee_lactation_periods_routes.ts` |
| PUT | `/api/employee-lactation-periods/:id` | `#controllers/employee_lactation_periods_controller.update` | `start/routes/employee_lactation_periods_routes.ts` |
| DELETE | `/api/employee-lactation-periods/:id` | `#controllers/employee_lactation_periods_controller.destroy` | `start/routes/employee_lactation_periods_routes.ts` |
| POST | `/api/employee-lactation-periods/:id/regenerate-shift-exceptions` | `#controllers/employee_lactation_periods_controller.regenerateShiftExceptions` | `start/routes/employee_lactation_periods_routes.ts` |
| GET | `/api/employee-lactation-periods/:periodId/evidences` | `#controllers/employee_lactation_period_evidences_controller.index` | `start/routes/employee_lactation_periods_routes.ts` |
| POST | `/api/employee-lactation-periods/:periodId/evidences` | `#controllers/employee_lactation_period_evidences_controller.store` | `start/routes/employee_lactation_periods_routes.ts` |
| GET | `/api/employee-lactation-periods/:periodId/evidences/:evidenceId/download-url` | `#controllers/employee_lactation_period_evidences_controller.downloadUrl` | `start/routes/employee_lactation_periods_routes.ts` |
| DELETE | `/api/employee-lactation-periods/:periodId/evidences/:evidenceId` | `#controllers/employee_lactation_period_evidences_controller.destroy` | `start/routes/employee_lactation_periods_routes.ts` |

### `/api/employee-medical-conditions` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-medical-conditions` | `employeeMedicalConditionController.index` | `start/routes/employee_medical_condition_routes.ts` |
| POST | `/api/employee-medical-conditions` | `employeeMedicalConditionController.store` | `start/routes/employee_medical_condition_routes.ts` |
| GET | `/api/employee-medical-conditions/employee/:employeeId` | `employeeMedicalConditionController.getByEmployee` | `start/routes/employee_medical_condition_routes.ts` |
| GET | `/api/employee-medical-conditions/:employeeMedicalConditionId` | `employeeMedicalConditionController.show` | `start/routes/employee_medical_condition_routes.ts` |
| PUT | `/api/employee-medical-conditions/:employeeMedicalConditionId` | `employeeMedicalConditionController.update` | `start/routes/employee_medical_condition_routes.ts` |
| DELETE | `/api/employee-medical-conditions/:employeeMedicalConditionId` | `employeeMedicalConditionController.delete` | `start/routes/employee_medical_condition_routes.ts` |

### `/api/employee-record-properties` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-record-properties` | `#controllers/employee_record_property_controller.index` | `start/routes/employee_record_property_routes.ts` |
| GET | `/api/employee-record-properties/get-categories-by-employee` | `#controllers/employee_record_property_controller.getCategories` | `start/routes/employee_record_property_routes.ts` |

### `/api/employee-records` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-records` | `#controllers/employee_record_controller.store` | `start/routes/employee_record_routes.ts` |
| PUT | `/api/employee-records/:employeeRecordId` | `#controllers/employee_record_controller.update` | `start/routes/employee_record_routes.ts` |
| DELETE | `/api/employee-records/:employeeRecordId` | `#controllers/employee_record_controller.delete` | `start/routes/employee_record_routes.ts` |
| GET | `/api/employee-records/:employeeRecordId` | `#controllers/employee_record_controller.show` | `start/routes/employee_record_routes.ts` |

### `/api/employee-shift-changes` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-shift-changes` | `#controllers/employee_shift_change_controller.store` | `start/routes/employee_shift_change_routes.ts` |
| DELETE | `/api/employee-shift-changes/:employeeShiftChangeId` | `#controllers/employee_shift_change_controller.delete` | `start/routes/employee_shift_change_routes.ts` |
| GET | `/api/employee-shift-changes/:employeeShiftChangeId` | `#controllers/employee_shift_change_controller.show` | `start/routes/employee_shift_change_routes.ts` |
| GET | `/api/employee-shift-changes/by-employee/:employeeId` | `#controllers/employee_shift_change_controller.getByEmployee` | `start/routes/employee_shift_change_routes.ts` |

### `/api/employee-shifts-active-shift-employee` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-shifts-active-shift-employee/:employeeId` | `#controllers/employee_shifts_controller.getShiftActiveByEmployee` | `start/routes/employee_shifts_routes.ts` |

### `/api/employee-shifts-employee` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-shifts-employee/:employeeId` | `#controllers/employee_shifts_controller.getByEmployee` | `start/routes/employee_shifts_routes.ts` |

### `/api/employee-spouses` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-spouses` | `#controllers/employee_spouse_controller.store` | `start/routes/employee_spouse_routes.ts` |
| PUT | `/api/employee-spouses/:employeeSpouseId` | `#controllers/employee_spouse_controller.update` | `start/routes/employee_spouse_routes.ts` |
| DELETE | `/api/employee-spouses/:employeeSpouseId` | `#controllers/employee_spouse_controller.delete` | `start/routes/employee_spouse_routes.ts` |
| GET | `/api/employee-spouses/:employeeSpouseId` | `#controllers/employee_spouse_controller.show` | `start/routes/employee_spouse_routes.ts` |

### `/api/employee-supplies` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-supplies` | `#controllers/employee_supplies_controller.store` | `start/routes/employee_supplies.ts` |
| GET | `/api/employee-supplies` | `#controllers/employee_supplies_controller.index` | `start/routes/employee_supplies.ts` |
| GET | `/api/employee-supplies/:id` | `#controllers/employee_supplies_controller.show` | `start/routes/employee_supplies.ts` |
| PUT | `/api/employee-supplies/:id` | `#controllers/employee_supplies_controller.update` | `start/routes/employee_supplies.ts` |
| DELETE | `/api/employee-supplies/:id` | `#controllers/employee_supplies_controller.destroy` | `start/routes/employee_supplies.ts` |
| POST | `/api/employee-supplies/:id/retire` | `#controllers/employee_supplies_controller.retire` | `start/routes/employee_supplies.ts` |
| GET | `/api/employee-supplies/:id/with-relations` | `#controllers/employee_supplies_controller.getWithRelations` | `start/routes/employee_supplies.ts` |
| GET | `/api/employee-supplies/by-employee/:employeeId` | `#controllers/employee_supplies_controller.getByEmployee` | `start/routes/employee_supplies.ts` |
| GET | `/api/employee-supplies/active-by-employee/:employeeId` | `#controllers/employee_supplies_controller.getActiveByEmployee` | `start/routes/employee_supplies.ts` |

### `/api/employee-supplies-response-contracts` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-supplies-response-contracts` | `#controllers/employee_supplies_response_contracts_controller.store` | `start/routes/employee_supplies_response_contracts.ts` |
| GET | `/api/employee-supplies-response-contracts` | `#controllers/employee_supplies_response_contracts_controller.index` | `start/routes/employee_supplies_response_contracts.ts` |
| GET | `/api/employee-supplies-response-contracts/:id` | `#controllers/employee_supplies_response_contracts_controller.show` | `start/routes/employee_supplies_response_contracts.ts` |
| GET | `/api/employee-supplies-response-contracts/by-uuid/:uuid` | `#controllers/employee_supplies_response_contracts_controller.getByUuid` | `start/routes/employee_supplies_response_contracts.ts` |
| DELETE | `/api/employee-supplies-response-contracts/:id` | `#controllers/employee_supplies_response_contracts_controller.destroy` | `start/routes/employee_supplies_response_contracts.ts` |

### `/api/employee-supply-assignation-photos` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-supply-assignation-photos/:employeeSupplyId/assignation` | `#controllers/employee_supplie_assignation_photos_controller.uploadAssignation` | `start/routes/employee_supply_assignament_photo.ts` |
| POST | `/api/employee-supply-assignation-photos/:employeeSupplyId/return` | `#controllers/employee_supplie_assignation_photos_controller.uploadReturn` | `start/routes/employee_supply_assignament_photo.ts` |
| GET | `/api/employee-supply-assignation-photos/:employeeSupplyId/assignation` | `#controllers/employee_supplie_assignation_photos_controller.getAssignation` | `start/routes/employee_supply_assignament_photo.ts` |
| GET | `/api/employee-supply-assignation-photos/:employeeSupplyId/return` | `#controllers/employee_supplie_assignation_photos_controller.getReturn` | `start/routes/employee_supply_assignament_photo.ts` |
| DELETE | `/api/employee-supply-assignation-photos/:photoId` | `#controllers/employee_supplie_assignation_photos_controller.delete` | `start/routes/employee_supply_assignament_photo.ts` |

### `/api/employee-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employee-types` | `#controllers/employee_type_controller.index` | `start/routes/employee_type_routes.ts` |

### `/api/employee-vacation-archives` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-vacation-archives` | `#controllers/employee_vacation_archive_controller.store` | `start/routes/employee_vacation_archive_routes.ts` |
| GET | `/api/employee-vacation-archives` | `#controllers/employee_vacation_archive_controller.index` | `start/routes/employee_vacation_archive_routes.ts` |
| GET | `/api/employee-vacation-archives/:employeeVacationArchiveId` | `#controllers/employee_vacation_archive_controller.show` | `start/routes/employee_vacation_archive_routes.ts` |
| DELETE | `/api/employee-vacation-archives/:employeeVacationArchiveId` | `#controllers/employee_vacation_archive_controller.destroy` | `start/routes/employee_vacation_archive_routes.ts` |
| POST | `/api/employee-vacation-archives/:employeeVacationArchiveId/contents` | `#controllers/employee_vacation_archive_content_controller.store` | `start/routes/employee_vacation_archive_routes.ts` |
| GET | `/api/employee-vacation-archives/:employeeVacationArchiveId/contents` | `#controllers/employee_vacation_archive_content_controller.index` | `start/routes/employee_vacation_archive_routes.ts` |
| GET | `/api/employee-vacation-archives/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId` | `#controllers/employee_vacation_archive_content_controller.show` | `start/routes/employee_vacation_archive_routes.ts` |
| POST | `/api/employee-vacation-archives/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId` | `#controllers/employee_vacation_archive_content_controller.update` | `start/routes/employee_vacation_archive_routes.ts` |
| DELETE | `/api/employee-vacation-archives/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId` | `#controllers/employee_vacation_archive_content_controller.destroy` | `start/routes/employee_vacation_archive_routes.ts` |

### `/api/employee-zones` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee-zones` | `#controllers/employee_zone_controller.store` | `start/routes/employee_zone_routes.ts` |
| PUT | `/api/employee-zones/:employeeZoneId` | `#controllers/employee_zone_controller.update` | `start/routes/employee_zone_routes.ts` |
| DELETE | `/api/employee-zones/:employeeZoneId` | `#controllers/employee_zone_controller.delete` | `start/routes/employee_zone_routes.ts` |
| GET | `/api/employee-zones/:employeeZoneId` | `#controllers/employee_zone_controller.show` | `start/routes/employee_zone_routes.ts` |

### `/api/employee_shifts` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/employee_shifts` | `#controllers/employee_shifts_controller.store` | `start/routes/employee_shifts_routes.ts` |
| GET | `/api/employee_shifts` | `#controllers/employee_shifts_controller.index` | `start/routes/employee_shifts_routes.ts` |
| GET | `/api/employee_shifts/:id` | `#controllers/employee_shifts_controller.show` | `start/routes/employee_shifts_routes.ts` |
| PUT | `/api/employee_shifts/:id` | `#controllers/employee_shifts_controller.update` | `start/routes/employee_shifts_routes.ts` |
| DELETE | `/api/employee_shifts/:id` | `#controllers/employee_shifts_controller.destroy` | `start/routes/employee_shifts_routes.ts` |

### `/api/employees` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employees/:employeeId/biometric-face-id` | `#controllers/employee_biometric_face_id_controller.getPhoto` | `start/routes/employee_biometric_face_id_routes.ts` |
| POST | `/api/employees/:employeeId/biometric-face-id` | `#controllers/employee_biometric_face_id_controller.uploadPhoto` | `start/routes/employee_biometric_face_id_routes.ts` |
| PUT | `/api/employees/:employeeId/biometric-face-id` | `#controllers/employee_biometric_face_id_controller.replacePhoto` | `start/routes/employee_biometric_face_id_routes.ts` |
| DELETE | `/api/employees/:employeeId/biometric-face-id` | `#controllers/employee_biometric_face_id_controller.deletePhoto` | `start/routes/employee_biometric_face_id_routes.ts` |
| GET | `/api/employees/:employeeId/biometric-face-id-with-token/:token` | `#controllers/employee_biometric_face_id_controller.getPhotoToken` | `start/routes/employee_biometric_face_id_routes.ts` |
| GET | `/api/employees/:employeeId/biometric-face-id-photo` | `#controllers/employee_biometric_photos_controller.streamPhoto` | `start/routes/employee_biometric_face_id_routes.ts` |
| GET | `/api/employees/:employeeId/biometrics` | `#controllers/employee_biometric_controller.show` | `start/routes/employee_biometric_routes.ts` |
| GET | `/api/employees/:employeeId/biometrics/fingers` | `#controllers/employee_biometric_controller.getFingers` | `start/routes/employee_biometric_routes.ts` |
| GET | `/api/employees/:employeeId/biometrics/face` | `#controllers/employee_biometric_controller.getFaceStatus` | `start/routes/employee_biometric_routes.ts` |
| POST | `/api/employees/:employeeId/biometrics` | `#controllers/employee_biometric_controller.store` | `start/routes/employee_biometric_routes.ts` |
| PUT | `/api/employees/:employeeId/biometrics` | `#controllers/employee_biometric_controller.update` | `start/routes/employee_biometric_routes.ts` |
| PUT | `/api/employees/:employeeId/biometrics/fingers` | `#controllers/employee_biometric_controller.updateFingers` | `start/routes/employee_biometric_routes.ts` |
| PUT | `/api/employees/:employeeId/biometrics/face` | `#controllers/employee_biometric_controller.updateFaceStatus` | `start/routes/employee_biometric_routes.ts` |
| GET | `/api/employees/:employeeId/certifications` | `#controllers/employee_certification_controller.index` | `start/routes/employee_certification_routes.ts` |
| GET | `/api/employees/:employeeId/certifications/:certificationId/uploads` | `#controllers/employee_certification_upload_controller.index` | `start/routes/employee_certification_upload_routes.ts` |
| POST | `/api/employees/:employeeId/certifications/:certificationId/uploads` | `#controllers/employee_certification_upload_controller.store` | `start/routes/employee_certification_upload_routes.ts` |
| GET | `/api/employees/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId/download-url` | `#controllers/employee_certification_upload_controller.downloadUrl` | `start/routes/employee_certification_upload_routes.ts` |
| DELETE | `/api/employees/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId` | `#controllers/employee_certification_upload_controller.destroy` | `start/routes/employee_certification_upload_routes.ts` |
| GET | `/api/employees/employee-generate-excel` | `#controllers/employee_controller.getExcel` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/shift-assignment-template` | `#controllers/employee_controller.getShiftAssignmentTemplate` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/attendance-report` | `#controllers/employee_controller.getAttendanceReport` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/attendance-report` | `#controllers/employee_controller.getAttendanceReport` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/import-shift-assignments` | `#controllers/employee_controller.importShiftAssignments` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/template-excel` | `#controllers/employee_controller.getTemplateExcel` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-biometrics` | `#controllers/employee_controller.getBiometrics` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-days-work-disability-all` | `#controllers/employee_controller.getDaysWorkDisabilityAll` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-birthday` | `#controllers/employee_controller.getBirthday` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-anniversary` | `#controllers/employee_controller.getAnniversary` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-vacations` | `#controllers/employee_controller.getVacations` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-all-vacations-by-period` | `#controllers/employee_controller.getAllVacationsByPeriod` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-work-schedules` | `#controllers/employee_controller.getWorkSchedules` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/termination-catalog` | `#controllers/employee_controller.getTerminationCatalog` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/without-user` | `#controllers/employee_controller.indexWithOutUser` | `start/routes/employee_routes.ts` |
| GET | `/api/employees` | `#controllers/employee_controller.index` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/to-assigned` | `#controllers/employee_controller.indexToAssigned` | `start/routes/employee_routes.ts` |
| POST | `/api/employees` | `#controllers/employee_controller.store` | `start/routes/employee_routes.ts` |
| PUT | `/api/employees/:employeeId` | `#controllers/employee_controller.update` | `start/routes/employee_routes.ts` |
| DELETE | `/api/employees/:employeeId` | `#controllers/employee_controller.delete` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/get-by-id/:employeeId` | `#controllers/employee_controller.getById` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId` | `#controllers/employee_controller.show` | `start/routes/employee_routes.ts` |
| PUT | `/api/employees/:employeeId/photo` | `#controllers/employee_controller.uploadPhoto` | `start/routes/employee_routes.ts` |
| DELETE | `/api/employees/:employeeId/photo` | `#controllers/employee_controller.deletePhoto` | `start/routes/employee_routes.ts` |
| PUT | `/api/employees/:employeeId/reactivate` | `#controllers/employee_controller.reactivate` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/proceeding-files` | `#controllers/employee_controller.getProceedingFiles` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/:employeeId/branch-office` | `#controllers/employee_branch_office_controller.assign` | `start/routes/employee_routes.ts` |
| DELETE | `/api/employees/:employeeId/branch-office` | `#controllers/employee_branch_office_controller.unassign` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/branch-offices/history` | `#controllers/employee_branch_office_controller.history` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/:employeeId/temporary-assignments` | `#controllers/employee_temporary_assignment_controller.store` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/temporary-assignments/active` | `#controllers/employee_temporary_assignment_controller.showActive` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/salary-history` | `#controllers/employee_controller.salaryHistory` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/contracts` | `#controllers/employee_controller.getContracts` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/banks` | `#controllers/employee_controller.getBanks` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/zones` | `#controllers/employee_controller.getZones` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/get-days-work-disability` | `#controllers/employee_controller.getDaysWorkDisability` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/user-responsible` | `#controllers/employee_controller.getUserResponsible` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/user-responsible/:userId?` | `#controllers/employee_controller.getUserResponsible` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/get-vacations-used` | `#controllers/employee_controller.getVacationsUsed` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/get-vacations-corresponding` | `#controllers/employee_controller.getVacationsCorresponding` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/get-years-worked` | `#controllers/employee_controller.getYearsWorked` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/get-vacations-by-period` | `#controllers/employee_controller.getVacationsByPeriod` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/export-excel` | `#controllers/employee_controller.exportShiftExceptionsToExcel` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/import-excel` | `#controllers/employee_controller.importFromExcel` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/inverse-synchronization/:employeeId` | `#controllers/employee_controller.inverseSync` | `start/routes/employee_routes.ts` |
| POST | `/api/employees/:employeeId/vacation-deductions` | `#controllers/employee_controller.applyVacationDeduction` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/:employeeId/vacation-deductions` | `#controllers/employee_controller.getVacationDeductions` | `start/routes/employee_routes.ts` |
| DELETE | `/api/employees/:employeeId/vacation-deductions/:vacationDeductionId` | `#controllers/employee_controller.deleteVacationDeduction` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/api/proxy-image` | `#controllers/employee_controller.proxyImage` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/odoo/employees` | `#controllers/employee_controller.getOdooEmployees` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/odoo/employees/groups` | `#controllers/employee_controller.getOdooGroups` | `start/routes/employee_routes.ts` |
| GET | `/api/employees/odoo/employees/create` | `#controllers/employee_controller.createNewOdooEmployee` | `start/routes/employee_routes.ts` |

### `/api/employees-proceeding-files` (middleware: businessScopeOptional, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employees-proceeding-files/get-expired-and-expiring` | `#controllers/employee_proceeding_file_controller.getExpiresAndExpiring` | `start/routes/employee_proceeding_file_routes.ts` |
| GET | `/api/employees-proceeding-files` | `#controllers/employee_proceeding_file_controller.index` | `start/routes/employee_proceeding_file_routes.ts` |
| POST | `/api/employees-proceeding-files` | `#controllers/employee_proceeding_file_controller.store` | `start/routes/employee_proceeding_file_routes.ts` |
| PUT | `/api/employees-proceeding-files/:employeeProceedingFileId` | `#controllers/employee_proceeding_file_controller.update` | `start/routes/employee_proceeding_file_routes.ts` |
| DELETE | `/api/employees-proceeding-files/:employeeProceedingFileId` | `#controllers/employee_proceeding_file_controller.delete` | `start/routes/employee_proceeding_file_routes.ts` |
| GET | `/api/employees-proceeding-files/:employeeProceedingFileId` | `#controllers/employee_proceeding_file_controller.show` | `start/routes/employee_proceeding_file_routes.ts` |
| GET | `/api/employees-proceeding-files/:employeeProceedingFileId/download` | `#controllers/employee_proceeding_file_controller.download` | `start/routes/employee_proceeding_file_routes.ts` |

### `/api/employees-vacations` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/employees-vacations/get-excel` | `#controllers/employee_vacation_controller.getExcel` | `start/routes/employee_vacation_routes.ts` |
| GET | `/api/employees-vacations/get-vacations-used-excel` | `#controllers/employee_vacation_controller.getVacationsUsedExcel` | `start/routes/employee_vacation_routes.ts` |
| GET | `/api/employees-vacations/get-vacations-summary-excel` | `#controllers/employee_vacation_controller.getVacationsSummaryExcel` | `start/routes/employee_vacation_routes.ts` |
| GET | `/api/employees-vacations/get-vacation-import-template` | `#controllers/employee_vacation_controller.getVacationImportTemplate` | `start/routes/employee_vacation_routes.ts` |
| POST | `/api/employees-vacations/import-vacation-excel` | `#controllers/employee_vacation_controller.importVacationExcel` | `start/routes/employee_vacation_routes.ts` |

### `/api/empresas-contratantes` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/empresas-contratantes` | `#controllers/empresas_contratantes_controller.index` | `start/routes/empresas_contratantes_routes.ts` |
| GET | `/api/empresas-contratantes/:id` | `#controllers/empresas_contratantes_controller.show` | `start/routes/empresas_contratantes_routes.ts` |
| POST | `/api/empresas-contratantes` | `#controllers/empresas_contratantes_controller.store` | `start/routes/empresas_contratantes_routes.ts` |
| PATCH | `/api/empresas-contratantes/:id` | `#controllers/empresas_contratantes_controller.update` | `start/routes/empresas_contratantes_routes.ts` |
| DELETE | `/api/empresas-contratantes/:id` | `#controllers/empresas_contratantes_controller.destroy` | `start/routes/empresas_contratantes_routes.ts` |

### `/api/exception-requests` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/exception-requests` | `#controllers/exception_requests_controller.index` | `start/routes/exception_request_routes.ts` |
| GET | `/api/exception-requests/all` | `#controllers/exception_requests_controller.indexAllExceptionRequests` | `start/routes/exception_request_routes.ts` |
| GET | `/api/exception-requests/my-requests` | `#controllers/exception_requests_controller.getMyExceptionRequests` | `start/routes/exception_request_routes.ts` |
| GET | `/api/exception-requests/unread` | `#controllers/exception_requests_controller.getUnreadExceptionRequests` | `start/routes/exception_request_routes.ts` |
| POST | `/api/exception-requests` | `#controllers/exception_requests_controller.store` | `start/routes/exception_request_routes.ts` |
| PUT | `/api/exception-requests/:id` | `#controllers/exception_requests_controller.update` | `start/routes/exception_request_routes.ts` |
| DELETE | `/api/exception-requests/:id` | `#controllers/exception_requests_controller.destroy` | `start/routes/exception_request_routes.ts` |
| GET | `/api/exception-requests/:id` | `#controllers/exception_requests_controller.show` | `start/routes/exception_request_routes.ts` |
| POST | `/api/exception-requests/:id/status` | `#controllers/exception_requests_controller.updateStatus` | `start/routes/exception_request_routes.ts` |

### `/api/exception-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/exception-types` | `#controllers/exception_type_controller.index` | `start/routes/exception_type_routes.ts` |

### `/api/flight-attendant-proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/flight-attendant-proceeding-files/get-expired-and-expiring` | `#controllers/flight_attendant_proceeding_file_controller.getExpiresAndExpiring` | `start/routes/flight_attendant_proceeding_file_routes.ts` |
| GET | `/api/flight-attendant-proceeding-files` | `#controllers/flight_attendant_proceeding_file_controller.index` | `start/routes/flight_attendant_proceeding_file_routes.ts` |
| POST | `/api/flight-attendant-proceeding-files` | `#controllers/flight_attendant_proceeding_file_controller.store` | `start/routes/flight_attendant_proceeding_file_routes.ts` |
| PUT | `/api/flight-attendant-proceeding-files/:flightAttendantProceedingFileId` | `#controllers/flight_attendant_proceeding_file_controller.update` | `start/routes/flight_attendant_proceeding_file_routes.ts` |
| DELETE | `/api/flight-attendant-proceeding-files/:flightAttendantProceedingFileId` | `#controllers/flight_attendant_proceeding_file_controller.delete` | `start/routes/flight_attendant_proceeding_file_routes.ts` |
| GET | `/api/flight-attendant-proceeding-files/:flightAttendantProceedingFileId` | `#controllers/flight_attendant_proceeding_file_controller.show` | `start/routes/flight_attendant_proceeding_file_routes.ts` |

### `/api/flight-attendants` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/flight-attendants` | `#controllers/flight_attendant_controller.index` | `start/routes/flight_attendant_routes.ts` |
| POST | `/api/flight-attendants` | `#controllers/flight_attendant_controller.store` | `start/routes/flight_attendant_routes.ts` |
| PUT | `/api/flight-attendants/:flightAttendantId` | `#controllers/flight_attendant_controller.update` | `start/routes/flight_attendant_routes.ts` |
| DELETE | `/api/flight-attendants/:flightAttendantId` | `#controllers/flight_attendant_controller.delete` | `start/routes/flight_attendant_routes.ts` |
| GET | `/api/flight-attendants/:flightAttendantId` | `#controllers/flight_attendant_controller.show` | `start/routes/flight_attendant_routes.ts` |
| GET | `/api/flight-attendants/:flightAttendantId/proceeding-files` | `#controllers/flight_attendant_controller.getProceedingFiles` | `start/routes/flight_attendant_routes.ts` |

### `/api/galleries` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/galleries` | `#controllers/galleries_controller.index` | `start/routes/gallery_routes.ts` |
| POST | `/api/galleries` | `#controllers/galleries_controller.store` | `start/routes/gallery_routes.ts` |
| PUT | `/api/galleries/:id` | `#controllers/galleries_controller.update` | `start/routes/gallery_routes.ts` |
| DELETE | `/api/galleries/:id` | `#controllers/galleries_controller.destroy` | `start/routes/gallery_routes.ts` |
| GET | `/api/galleries/:id` | `#controllers/galleries_controller.show` | `start/routes/gallery_routes.ts` |

### `/api/holidays` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/holidays` | `#controllers/holidays_controller.store` | `start/routes/holiday_routes.ts` |
| GET | `/api/holidays` | `#controllers/holidays_controller.index` | `start/routes/holiday_routes.ts` |
| GET | `/api/holidays/:id` | `#controllers/holidays_controller.show` | `start/routes/holiday_routes.ts` |
| PUT | `/api/holidays/:id` | `#controllers/holidays_controller.update` | `start/routes/holiday_routes.ts` |
| DELETE | `/api/holidays/:id` | `#controllers/holidays_controller.destroy` | `start/routes/holiday_routes.ts` |

### `/api/icons` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/icons` | `#controllers/icons_controller.index` | `start/routes/holiday_routes.ts` |

### `/api/insurance-coverage-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/insurance-coverage-types` | `#controllers/insurance_coverage_type_controller.index` | `start/routes/insurance_coverage_type_routes.ts` |

### `/api/labor-law-hours` (middleware: auth, auth, auth, auth, auth, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/labor-law-hours` | `#controllers/labor_law_hours_controller.index` | `start/routes/labor_law_hours_routes.ts` |
| GET | `/api/labor-law-hours/active` | `#controllers/labor_law_hours_controller.getActive` | `start/routes/labor_law_hours_routes.ts` |
| POST | `/api/labor-law-hours` | `#controllers/labor_law_hours_controller.store` | `start/routes/labor_law_hours_routes.ts` |
| PUT | `/api/labor-law-hours/:laborLawHoursId` | `#controllers/labor_law_hours_controller.update` | `start/routes/labor_law_hours_routes.ts` |
| DELETE | `/api/labor-law-hours/:laborLawHoursId` | `#controllers/labor_law_hours_controller.delete` | `start/routes/labor_law_hours_routes.ts` |
| GET | `/api/labor-law-hours/:laborLawHoursId` | `#controllers/labor_law_hours_controller.show` | `start/routes/labor_law_hours_routes.ts` |

### `/api/logs` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/logs/request` | `#controllers/mongo-db/log_controller.store` | `start/routes/log_routes.ts` |
| POST | `/api/logs` | `#controllers/mongo-db/log_controller.index` | `start/routes/log_routes.ts` |
| GET | `/api/logs/exceptions/vacations-disabilities` | `#controllers/mongo-db/log_controller.getExceptionsVacationsDisabilities` | `start/routes/log_routes.ts` |
| GET | `/api/logs/:entity` | `#controllers/mongo-db/log_controller.show` | `start/routes/log_routes.ts` |

### `/api/maintenance-expense-categories` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/maintenance-expense-categories` | `#controllers/maintenance_expense_category_controller.index` | `start/routes/maintenance_expense_category_routes.ts` |

### `/api/maintenance-expenses` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/maintenance-expenses` | `#controllers/maintenance_expense_controller.index` | `start/routes/maintenance_expense_routes.ts` |
| POST | `/api/maintenance-expenses` | `#controllers/maintenance_expense_controller.store` | `start/routes/maintenance_expense_routes.ts` |
| PUT | `/api/maintenance-expenses/:id` | `#controllers/maintenance_expense_controller.update` | `start/routes/maintenance_expense_routes.ts` |
| DELETE | `/api/maintenance-expenses/:id` | `#controllers/maintenance_expense_controller.destroy` | `start/routes/maintenance_expense_routes.ts` |
| GET | `/api/maintenance-expenses/:id` | `#controllers/maintenance_expense_controller.show` | `start/routes/maintenance_expense_routes.ts` |

### `/api/maintenance-type` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/maintenance-type` | `#controllers/maintenance_type_controller.index` | `start/routes/maintenance_type_routes.ts` |

### `/api/maintenance-urgency-level` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/maintenance-urgency-level` | `#controllers/maintenance_urgency_level_controller.index` | `start/routes/maintenance_urgency_level_routes.ts` |

### `/api/medical-condition-type-properties` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/medical-condition-type-properties` | `medicalConditionTypePropertyController.index` | `start/routes/medical_condition_type_property_routes.ts` |
| POST | `/api/medical-condition-type-properties` | `medicalConditionTypePropertyController.store` | `start/routes/medical_condition_type_property_routes.ts` |
| GET | `/api/medical-condition-type-properties/type/:medicalConditionTypeId` | `medicalConditionTypePropertyController.getByType` | `start/routes/medical_condition_type_property_routes.ts` |
| GET | `/api/medical-condition-type-properties/:medicalConditionTypePropertyId` | `medicalConditionTypePropertyController.show` | `start/routes/medical_condition_type_property_routes.ts` |
| PUT | `/api/medical-condition-type-properties/:medicalConditionTypePropertyId` | `medicalConditionTypePropertyController.update` | `start/routes/medical_condition_type_property_routes.ts` |
| DELETE | `/api/medical-condition-type-properties/:medicalConditionTypePropertyId` | `medicalConditionTypePropertyController.delete` | `start/routes/medical_condition_type_property_routes.ts` |

### `/api/medical-condition-type-property-values` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/medical-condition-type-property-values` | `medicalConditionTypePropertyValueController.index` | `start/routes/medical_condition_type_property_value_routes.ts` |
| POST | `/api/medical-condition-type-property-values` | `medicalConditionTypePropertyValueController.store` | `start/routes/medical_condition_type_property_value_routes.ts` |
| GET | `/api/medical-condition-type-property-values/:medicalConditionTypePropertyValueId` | `medicalConditionTypePropertyValueController.show` | `start/routes/medical_condition_type_property_value_routes.ts` |
| PUT | `/api/medical-condition-type-property-values/:medicalConditionTypePropertyValueId` | `medicalConditionTypePropertyValueController.update` | `start/routes/medical_condition_type_property_value_routes.ts` |
| DELETE | `/api/medical-condition-type-property-values/:medicalConditionTypePropertyValueId` | `medicalConditionTypePropertyValueController.delete` | `start/routes/medical_condition_type_property_value_routes.ts` |

### `/api/medical-condition-types` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/medical-condition-types` | `medicalConditionTypeController.index` | `start/routes/medical_condition_type_routes.ts` |
| POST | `/api/medical-condition-types` | `medicalConditionTypeController.store` | `start/routes/medical_condition_type_routes.ts` |
| GET | `/api/medical-condition-types/:medicalConditionTypeId` | `medicalConditionTypeController.show` | `start/routes/medical_condition_type_routes.ts` |
| PUT | `/api/medical-condition-types/:medicalConditionTypeId` | `medicalConditionTypeController.update` | `start/routes/medical_condition_type_routes.ts` |
| DELETE | `/api/medical-condition-types/:medicalConditionTypeId` | `medicalConditionTypeController.delete` | `start/routes/medical_condition_type_routes.ts` |

### `/api/notices` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/notices/unread-count` | `#controllers/notice_controller.getUnreadCount` | `start/routes/notice_routes.ts` |
| GET | `/api/notices` | `#controllers/notice_controller.index` | `start/routes/notice_routes.ts` |
| POST | `/api/notices` | `#controllers/notice_controller.store` | `start/routes/notice_routes.ts` |
| GET | `/api/notices/:noticeId` | `#controllers/notice_controller.show` | `start/routes/notice_routes.ts` |
| PUT | `/api/notices/:noticeId` | `#controllers/notice_controller.update` | `start/routes/notice_routes.ts` |
| DELETE | `/api/notices/:noticeId` | `#controllers/notice_controller.delete` | `start/routes/notice_routes.ts` |
| POST | `/api/notices/:noticeId/send` | `#controllers/notice_controller.send` | `start/routes/notice_routes.ts` |
| POST | `/api/notices/:noticeId/mark-as-read` | `#controllers/notice_controller.markAsRead` | `start/routes/notice_routes.ts` |

### `/api/persons` (middleware: auth, auth, businessScope, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/persons` | `#controllers/person_controller.index` | `start/routes/person_routes.ts` |
| POST | `/api/persons` | `#controllers/person_controller.store` | `start/routes/person_routes.ts` |
| PUT | `/api/persons/:personId` | `#controllers/person_controller.update` | `start/routes/person_routes.ts` |
| DELETE | `/api/persons/:personId` | `#controllers/person_controller.delete` | `start/routes/person_routes.ts` |
| GET | `/api/persons/:personId` | `#controllers/person_controller.show` | `start/routes/person_routes.ts` |
| GET | `/api/persons/:personId` | `#controllers/person_controller.getEmployee` | `start/routes/person_routes.ts` |
| GET | `/api/persons` | `#controllers/person_controller.getPlacesOfBirth` | `start/routes/person_routes.ts` |

### `/api/pilots` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/pilots` | `#controllers/pilot_controller.index` | `start/routes/pilot_routes.ts` |
| POST | `/api/pilots` | `#controllers/pilot_controller.store` | `start/routes/pilot_routes.ts` |
| PUT | `/api/pilots/:pilotId` | `#controllers/pilot_controller.update` | `start/routes/pilot_routes.ts` |
| DELETE | `/api/pilots/:pilotId` | `#controllers/pilot_controller.delete` | `start/routes/pilot_routes.ts` |
| GET | `/api/pilots/:pilotId` | `#controllers/pilot_controller.show` | `start/routes/pilot_routes.ts` |
| GET | `/api/pilots/:pilotId/proceeding-files` | `#controllers/pilot_controller.getProceedingFiles` | `start/routes/pilot_routes.ts` |

### `/api/pilots-proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/pilots-proceeding-files/get-expired-and-expiring` | `#controllers/pilot_proceeding_file_controller.getExpiresAndExpiring` | `start/routes/pilot_proceeding_file_routes.ts` |
| GET | `/api/pilots-proceeding-files` | `#controllers/pilot_proceeding_file_controller.index` | `start/routes/pilot_proceeding_file_routes.ts` |
| POST | `/api/pilots-proceeding-files` | `#controllers/pilot_proceeding_file_controller.store` | `start/routes/pilot_proceeding_file_routes.ts` |
| PUT | `/api/pilots-proceeding-files/:pilotProceedingFileId` | `#controllers/pilot_proceeding_file_controller.update` | `start/routes/pilot_proceeding_file_routes.ts` |
| DELETE | `/api/pilots-proceeding-files/:pilotProceedingFileId` | `#controllers/pilot_proceeding_file_controller.delete` | `start/routes/pilot_proceeding_file_routes.ts` |
| GET | `/api/pilots-proceeding-files/:pilotProceedingFileId` | `#controllers/pilot_proceeding_file_controller.show` | `start/routes/pilot_proceeding_file_routes.ts` |

### `/api/position-approval-histories` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-approval-histories` | `#controllers/position_approval_history_controller.store` | `start/routes/position_approval_history_routes.ts` |
| GET | `/api/position-approval-histories/last/:positionId` | `#controllers/position_approval_history_controller.getLast` | `start/routes/position_approval_history_routes.ts` |

### `/api/position-assessment-profiles` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/position-assessment-profiles` | `#controllers/position_assessment_profile_controller.index` | `start/routes/position_assessment_profile_routes.ts` |
| POST | `/api/position-assessment-profiles` | `#controllers/position_assessment_profile_controller.store` | `start/routes/position_assessment_profile_routes.ts` |
| GET | `/api/position-assessment-profiles/:positionAssessmentProfileId` | `#controllers/position_assessment_profile_controller.show` | `start/routes/position_assessment_profile_routes.ts` |
| PUT | `/api/position-assessment-profiles/:positionAssessmentProfileId` | `#controllers/position_assessment_profile_controller.update` | `start/routes/position_assessment_profile_routes.ts` |
| DELETE | `/api/position-assessment-profiles/:positionAssessmentProfileId` | `#controllers/position_assessment_profile_controller.delete` | `start/routes/position_assessment_profile_routes.ts` |

### `/api/position-business-unit-competency-levels` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-business-unit-competency-levels` | `#controllers/position_business_unit_competency_level_controller.store` | `start/routes/position_business_unit_competency_level_routes.ts` |
| PUT | `/api/position-business-unit-competency-levels/:positionBusinessUnitCompetencyLevelId` | `#controllers/position_business_unit_competency_level_controller.update` | `start/routes/position_business_unit_competency_level_routes.ts` |
| DELETE | `/api/position-business-unit-competency-levels/:positionBusinessUnitCompetencyLevelId` | `#controllers/position_business_unit_competency_level_controller.delete` | `start/routes/position_business_unit_competency_level_routes.ts` |
| GET | `/api/position-business-unit-competency-levels/by-position/:positionId` | `#controllers/position_business_unit_competency_level_controller.getByPosition` | `start/routes/position_business_unit_competency_level_routes.ts` |

### `/api/position-kpis` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-kpis` | `#controllers/position_kpi_controller.store` | `start/routes/position_kpi_routes.ts` |
| PUT | `/api/position-kpis/:positionKpiId` | `#controllers/position_kpi_controller.update` | `start/routes/position_kpi_routes.ts` |
| DELETE | `/api/position-kpis/:positionKpiId` | `#controllers/position_kpi_controller.delete` | `start/routes/position_kpi_routes.ts` |
| GET | `/api/position-kpis/distinct-names` | `#controllers/position_kpi_controller.getDistinctNames` | `start/routes/position_kpi_routes.ts` |
| GET | `/api/position-kpis/by-position/:positionId` | `#controllers/position_kpi_controller.getByPosition` | `start/routes/position_kpi_routes.ts` |

### `/api/position-salary-ranges` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-salary-ranges` | `#controllers/position_salary_range_controller.store` | `start/routes/position_salary_range_routes.ts` |
| GET | `/api/position-salary-ranges` | `#controllers/position_salary_range_controller.index` | `start/routes/position_salary_range_routes.ts` |
| GET | `/api/position-salary-ranges/current` | `#controllers/position_salary_range_controller.current` | `start/routes/position_salary_range_routes.ts` |
| GET | `/api/position-salary-ranges/history` | `#controllers/position_salary_range_controller.history` | `start/routes/position_salary_range_routes.ts` |
| PATCH | `/api/position-salary-ranges/:positionSalaryRangeId` | `#controllers/position_salary_range_controller.update` | `start/routes/position_salary_range_routes.ts` |
| GET | `/api/position-salary-ranges/:positionSalaryRangeId/audit` | `#controllers/position_salary_range_controller.audit` | `start/routes/position_salary_range_routes.ts` |
| DELETE | `/api/position-salary-ranges/:positionSalaryRangeId` | `#controllers/position_salary_range_controller.close` | `start/routes/position_salary_range_routes.ts` |

### `/api/position-specific-functions` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-specific-functions` | `#controllers/position_specific_function_controller.store` | `start/routes/position_specific_function_routes.ts` |
| PUT | `/api/position-specific-functions/:positionSpecificFunctionId` | `#controllers/position_specific_function_controller.update` | `start/routes/position_specific_function_routes.ts` |
| DELETE | `/api/position-specific-functions/:positionSpecificFunctionId` | `#controllers/position_specific_function_controller.delete` | `start/routes/position_specific_function_routes.ts` |
| GET | `/api/position-specific-functions/distinct-names` | `#controllers/position_specific_function_controller.getDistinctNames` | `start/routes/position_specific_function_routes.ts` |
| GET | `/api/position-specific-functions/distinct-frequencies` | `#controllers/position_specific_function_controller.getDistinctFrequencies` | `start/routes/position_specific_function_routes.ts` |
| GET | `/api/position-specific-functions/by-position/:positionId` | `#controllers/position_specific_function_controller.getByPosition` | `start/routes/position_specific_function_routes.ts` |

### `/api/position-work-tools` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/position-work-tools` | `#controllers/position_work_tool_controller.store` | `start/routes/position_work_tool_routes.ts` |
| PUT | `/api/position-work-tools/:positionWorkToolId` | `#controllers/position_work_tool_controller.update` | `start/routes/position_work_tool_routes.ts` |
| DELETE | `/api/position-work-tools/:positionWorkToolId` | `#controllers/position_work_tool_controller.delete` | `start/routes/position_work_tool_routes.ts` |
| GET | `/api/position-work-tools/distinct-names` | `#controllers/position_work_tool_controller.getDistinctNames` | `start/routes/position_work_tool_routes.ts` |
| GET | `/api/position-work-tools/by-position/:positionId` | `#controllers/position_work_tool_controller.getByPosition` | `start/routes/position_work_tool_routes.ts` |

### `/api/positions` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/positions/:positionId/certification-requirements` | `#controllers/position_certification_requirement_controller.index` | `start/routes/position_certification_requirement_routes.ts` |
| POST | `/api/positions/:positionId/certification-requirements` | `#controllers/position_certification_requirement_controller.store` | `start/routes/position_certification_requirement_routes.ts` |
| DELETE | `/api/positions/:positionId/certification-requirements/:certificationId` | `#controllers/position_certification_requirement_controller.destroy` | `start/routes/position_certification_requirement_routes.ts` |
| POST | `/api/positions` | `#controllers/position_controller.store` | `start/routes/position_routes.ts` |
| PUT | `/api/positions/:positionId` | `#controllers/position_controller.update` | `start/routes/position_routes.ts` |
| DELETE | `/api/positions/:positionId` | `#controllers/position_controller.delete` | `start/routes/position_routes.ts` |
| GET | `/api/positions` | `#controllers/position_controller.get` | `start/routes/position_routes.ts` |
| GET | `/api/positions/:positionId` | `#controllers/position_controller.show` | `start/routes/position_routes.ts` |
| GET | `/api/positions/get-pdf/:positionId` | `#controllers/position_controller.getPdf` | `start/routes/position_routes.ts` |
| GET | `/api/positions/get-excel/:positionId` | `#controllers/position_controller.getExcel` | `start/routes/position_routes.ts` |
| PATCH | `/api/positions/:positionId/move` | `#controllers/position_controller.move` | `start/routes/position_routes.ts` |
| POST | `/api/positions/assign-shift/:positionId` | `#controllers/position_controller.assignShift` | `start/routes/position_routes.ts` |

### `/api/proceeding-file-status` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/proceeding-file-status` | `#controllers/proceeding_file_status_controller.index` | `start/routes/proceeding_file_status_routes.ts` |

### `/api/proceeding-file-type-emails` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/proceeding-file-type-emails` | `#controllers/proceeding_file_type_email_controller.index` | `start/routes/proceeding_file_type_email_routes.ts` |
| POST | `/api/proceeding-file-type-emails` | `#controllers/proceeding_file_type_email_controller.store` | `start/routes/proceeding_file_type_email_routes.ts` |
| PUT | `/api/proceeding-file-type-emails/:proceedingFileTypeEmailId` | `#controllers/proceeding_file_type_email_controller.update` | `start/routes/proceeding_file_type_email_routes.ts` |
| DELETE | `/api/proceeding-file-type-emails/:proceedingFileTypeEmailId` | `#controllers/proceeding_file_type_email_controller.delete` | `start/routes/proceeding_file_type_email_routes.ts` |
| GET | `/api/proceeding-file-type-emails/:proceedingFileTypeEmailId` | `#controllers/proceeding_file_type_email_controller.show` | `start/routes/proceeding_file_type_email_routes.ts` |

### `/api/proceeding-file-type-properties` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/proceeding-file-type-properties` | `#controllers/proceeding_file_type_property_controller.index` | `start/routes/proceeding_file_type_property_routes.ts` |
| POST | `/api/proceeding-file-type-properties` | `#controllers/proceeding_file_type_property_controller.store` | `start/routes/proceeding_file_type_property_routes.ts` |
| POST | `/api/proceeding-file-type-properties/create-multiple` | `#controllers/proceeding_file_type_property_controller.storeMultiple` | `start/routes/proceeding_file_type_property_routes.ts` |
| GET | `/api/proceeding-file-type-properties/by-proceeding-file-type/:proceedingFileTypeId` | `#controllers/proceeding_file_type_property_controller.getByProceedingFileTypeId` | `start/routes/proceeding_file_type_property_routes.ts` |
| DELETE | `/api/proceeding-file-type-properties/:proceedingFileTypePropertyId` | `#controllers/proceeding_file_type_property_controller.delete` | `start/routes/proceeding_file_type_property_routes.ts` |
| GET | `/api/proceeding-file-type-properties/get-categories-by-employee` | `#controllers/proceeding_file_type_property_controller.getCategories` | `start/routes/proceeding_file_type_property_routes.ts` |
| GET | `/api/proceeding-file-type-properties/get-categories-by-system-setting` | `#controllers/proceeding_file_type_property_controller.getCategoriesBySystemSetting` | `start/routes/proceeding_file_type_property_routes.ts` |

### `/api/proceeding-file-type-property-values` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/proceeding-file-type-property-values` | `#controllers/proceeding_file_type_property_value_controller.store` | `start/routes/proceeding_file_type_property_value_routes.ts` |
| PUT | `/api/proceeding-file-type-property-values/:proceedingFileTypePropertyValueId` | `#controllers/proceeding_file_type_property_value_controller.update` | `start/routes/proceeding_file_type_property_value_routes.ts` |
| DELETE | `/api/proceeding-file-type-property-values/:proceedingFileTypePropertyValueId` | `#controllers/proceeding_file_type_property_value_controller.delete` | `start/routes/proceeding_file_type_property_value_routes.ts` |
| GET | `/api/proceeding-file-type-property-values/:proceedingFileTypePropertyValueId` | `#controllers/proceeding_file_type_property_value_controller.show` | `start/routes/proceeding_file_type_property_value_routes.ts` |

### `/api/proceeding-file-types` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/proceeding-file-types/by-area/:areaToUse` | `#controllers/proceeding_file_type_controller.indexByArea` | `start/routes/proceeding_file_type_routes.ts` |
| GET | `/api/proceeding-file-types` | `#controllers/proceeding_file_type_controller.index` | `start/routes/proceeding_file_type_routes.ts` |
| POST | `/api/proceeding-file-types` | `#controllers/proceeding_file_type_controller.store` | `start/routes/proceeding_file_type_routes.ts` |
| POST | `/api/proceeding-file-types/create-employee-type` | `#controllers/proceeding_file_type_controller.createEmployeeType` | `start/routes/proceeding_file_type_routes.ts` |
| POST | `/api/proceeding-file-types/create-system-setting-type` | `#controllers/proceeding_file_type_controller.createSystemSettingType` | `start/routes/proceeding_file_type_routes.ts` |
| PUT | `/api/proceeding-file-types/:proceedingFileTypeId` | `#controllers/proceeding_file_type_controller.update` | `start/routes/proceeding_file_type_routes.ts` |
| DELETE | `/api/proceeding-file-types/:proceedingFileTypeId` | `#controllers/proceeding_file_type_controller.delete` | `start/routes/proceeding_file_type_routes.ts` |
| GET | `/api/proceeding-file-types/:proceedingFileTypeId/get-legacy-emails` | `#controllers/proceeding_file_type_controller.getLegacyEmails` | `start/routes/proceeding_file_type_routes.ts` |
| GET | `/api/proceeding-file-types/:proceedingFileTypeId` | `#controllers/proceeding_file_type_controller.show` | `start/routes/proceeding_file_type_routes.ts` |

### `/api/proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/proceeding-files/send-expired-to-email` | `#controllers/proceeding_file_controller.sendFilesExpiresToEmail` | `start/routes/proceeding_file_routes.ts` |
| GET | `/api/proceeding-files` | `#controllers/proceeding_file_controller.index` | `start/routes/proceeding_file_routes.ts` |
| POST | `/api/proceeding-files` | `#controllers/proceeding_file_controller.store` | `start/routes/proceeding_file_routes.ts` |
| PUT | `/api/proceeding-files/:proceedingFileId` | `#controllers/proceeding_file_controller.update` | `start/routes/proceeding_file_routes.ts` |
| DELETE | `/api/proceeding-files/:proceedingFileId` | `#controllers/proceeding_file_controller.delete` | `start/routes/proceeding_file_routes.ts` |
| GET | `/api/proceeding-files/:proceedingFileId` | `#controllers/proceeding_file_controller.show` | `start/routes/proceeding_file_routes.ts` |

### `/api/repse-registrations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/repse-registrations` | `#controllers/repse_registrations_controller.index` | `start/routes/repse_registration_routes.ts` |
| GET | `/api/repse-registrations/:id` | `#controllers/repse_registrations_controller.show` | `start/routes/repse_registration_routes.ts` |
| POST | `/api/repse-registrations` | `#controllers/repse_registrations_controller.store` | `start/routes/repse_registration_routes.ts` |
| PUT | `/api/repse-registrations/:id` | `#controllers/repse_registrations_controller.update` | `start/routes/repse_registration_routes.ts` |
| DELETE | `/api/repse-registrations/:id` | `#controllers/repse_registrations_controller.destroy` | `start/routes/repse_registration_routes.ts` |

### `/api/repse-specialized-services` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/repse-specialized-services` | `#controllers/repse_specialized_services_controller.index` | `start/routes/repse_specialized_service_routes.ts` |
| GET | `/api/repse-specialized-services/:id` | `#controllers/repse_specialized_services_controller.show` | `start/routes/repse_specialized_service_routes.ts` |
| POST | `/api/repse-specialized-services` | `#controllers/repse_specialized_services_controller.store` | `start/routes/repse_specialized_service_routes.ts` |
| PUT | `/api/repse-specialized-services/:id` | `#controllers/repse_specialized_services_controller.update` | `start/routes/repse_specialized_service_routes.ts` |
| DELETE | `/api/repse-specialized-services/:id` | `#controllers/repse_specialized_services_controller.destroy` | `start/routes/repse_specialized_service_routes.ts` |

### `/api/reservation-legs` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/reservation-legs` | `#controllers/reservation_leg_controller.store` | `start/routes/reservation_leg_routes.ts` |
| PUT | `/api/reservation-legs/:reservationLegId` | `#controllers/reservation_leg_controller.update` | `start/routes/reservation_leg_routes.ts` |
| DELETE | `/api/reservation-legs/:reservationLegId` | `#controllers/reservation_leg_controller.delete` | `start/routes/reservation_leg_routes.ts` |
| POST | `/api/reservation-legs/validate` | `#controllers/reservation_leg_controller.validateLegDates` | `start/routes/reservation_leg_routes.ts` |

### `/api/reservation-notes` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/reservation-notes` | `#controllers/reservation_note_controller.store` | `start/routes/reservation_note_routes.ts` |
| PUT | `/api/reservation-notes/:reservationNoteId` | `#controllers/reservation_note_controller.update` | `start/routes/reservation_note_routes.ts` |
| DELETE | `/api/reservation-notes/:reservationNoteId` | `#controllers/reservation_note_controller.delete` | `start/routes/reservation_note_routes.ts` |

### `/api/reservations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/reservations` | `#controllers/reservation_controller.index` | `start/routes/reservations_routes.ts` |
| POST | `/api/reservations` | `#controllers/reservation_controller.store` | `start/routes/reservations_routes.ts` |
| PUT | `/api/reservations/:reservationId` | `#controllers/reservation_controller.update` | `start/routes/reservations_routes.ts` |
| DELETE | `/api/reservations/:reservationId` | `#controllers/reservation_controller.delete` | `start/routes/reservations_routes.ts` |
| GET | `/api/reservations/:reservationId` | `#controllers/reservation_controller.show` | `start/routes/reservations_routes.ts` |

### `/api/roles` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/roles/assign/:roleId` | `#controllers/role_controller.assign` | `start/routes/role_routes.ts` |
| GET | `/api/roles/has-access-department/:roleId/:departmentId` | `#controllers/role_controller.hasAccessDepartment` | `start/routes/role_routes.ts` |
| GET | `/api/roles/has-access/:roleId/:systemModuleSlug/:systemPermissionSlug` | `#controllers/role_controller.hasAccess` | `start/routes/role_routes.ts` |
| GET | `/api/roles/get-access/:roleId` | `#controllers/role_controller.getAccess` | `start/routes/role_routes.ts` |
| GET | `/api/roles/get-access-by-module/:roleId/:systemModuleSlug` | `#controllers/role_controller.getAccessByModule` | `start/routes/role_routes.ts` |
| GET | `/api/roles` | `#controllers/role_controller.index` | `start/routes/role_routes.ts` |
| POST | `/api/roles` | `#controllers/role_controller.store` | `start/routes/role_routes.ts` |
| PUT | `/api/roles/:roleId` | `#controllers/role_controller.update` | `start/routes/role_routes.ts` |
| DELETE | `/api/roles/:roleId` | `#controllers/role_controller.delete` | `start/routes/role_routes.ts` |
| GET | `/api/roles/:roleId` | `#controllers/role_controller.show` | `start/routes/role_routes.ts` |

### `/api/shift` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/shift` | `#controllers/shifts_controller.store` | `start/routes/shift_routes.ts` |
| GET | `/api/shift` | `#controllers/shifts_controller.index` | `start/routes/shift_routes.ts` |
| GET | `/api/shift/:id` | `#controllers/shifts_controller.show` | `start/routes/shift_routes.ts` |
| PUT | `/api/shift/:id` | `#controllers/shifts_controller.update` | `start/routes/shift_routes.ts` |
| DELETE | `/api/shift/:id` | `#controllers/shifts_controller.destroy` | `start/routes/shift_routes.ts` |

### `/api/shift-department-position` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/shift-department-position` | `#controllers/shifts_controller.searchPositionDepartment` | `start/routes/shift_routes.ts` |

### `/api/shift-exception` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/shift-exception` | `#controllers/shift_exceptions_controller.store` | `start/routes/shift_exceptions_routes.ts` |
| GET | `/api/shift-exception` | `#controllers/shift_exceptions_controller.index` | `start/routes/shift_exceptions_routes.ts` |
| GET | `/api/shift-exception/:id` | `#controllers/shift_exceptions_controller.show` | `start/routes/shift_exceptions_routes.ts` |
| PUT | `/api/shift-exception/:id` | `#controllers/shift_exceptions_controller.update` | `start/routes/shift_exceptions_routes.ts` |
| DELETE | `/api/shift-exception/:id` | `#controllers/shift_exceptions_controller.destroy` | `start/routes/shift_exceptions_routes.ts` |
| GET | `/api/shift-exception/:shiftExceptionId/evidences` | `#controllers/shift_exceptions_controller.getEvidences` | `start/routes/shift_exceptions_routes.ts` |

### `/api/shift-exception-apply-general` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/shift-exception-apply-general` | `#controllers/shift_exceptions_controller.applyExceptionGeneral` | `start/routes/shift_exceptions_routes.ts` |

### `/api/shift-exception-employee` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/shift-exception-employee/:employeeId` | `#controllers/shift_exceptions_controller.getByEmployee` | `start/routes/shift_exceptions_routes.ts` |

### `/api/shift-exception-evidences` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/shift-exception-evidences` | `#controllers/shift_exception_evidence_controller.index` | `start/routes/shift_exception_evidence_routes.ts` |
| POST | `/api/shift-exception-evidences` | `#controllers/shift_exception_evidence_controller.store` | `start/routes/shift_exception_evidence_routes.ts` |
| PUT | `/api/shift-exception-evidences/:shiftExceptionEvidenceId` | `#controllers/shift_exception_evidence_controller.update` | `start/routes/shift_exception_evidence_routes.ts` |
| DELETE | `/api/shift-exception-evidences/:shiftExceptionEvidenceId` | `#controllers/shift_exception_evidence_controller.delete` | `start/routes/shift_exception_evidence_routes.ts` |
| GET | `/api/shift-exception-evidences/:shiftExceptionEvidenceId` | `#controllers/shift_exception_evidence_controller.show` | `start/routes/shift_exception_evidence_routes.ts` |

### `/api/shift-for-employees` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/shift-for-employees` | `#controllers/shift_for_employees_controller.index` | `start/routes/shift_for_employees.ts` |

### `/api/supplie-characteristic-values` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/supplie-characteristic-values` | `#controllers/supplie_caracteristic_values_controller.store` | `start/routes/supplie_caracteristic_values.ts` |
| GET | `/api/supplie-characteristic-values` | `#controllers/supplie_caracteristic_values_controller.index` | `start/routes/supplie_caracteristic_values.ts` |
| GET | `/api/supplie-characteristic-values/:id` | `#controllers/supplie_caracteristic_values_controller.show` | `start/routes/supplie_caracteristic_values.ts` |
| PUT | `/api/supplie-characteristic-values/:id` | `#controllers/supplie_caracteristic_values_controller.update` | `start/routes/supplie_caracteristic_values.ts` |
| DELETE | `/api/supplie-characteristic-values/:id` | `#controllers/supplie_caracteristic_values_controller.destroy` | `start/routes/supplie_caracteristic_values.ts` |
| GET | `/api/supplie-characteristic-values/:id/characteristic` | `#controllers/supplie_caracteristic_values_controller.getWithCharacteristic` | `start/routes/supplie_caracteristic_values.ts` |
| GET | `/api/supplie-characteristic-values/by-characteristic/:supplieCaracteristicId` | `#controllers/supplie_caracteristic_values_controller.getByCharacteristic` | `start/routes/supplie_caracteristic_values.ts` |
| GET | `/api/supplie-characteristic-values/by-supply/:supplieId` | `#controllers/supplie_caracteristic_values_controller.getBySupply` | `start/routes/supplie_caracteristic_values.ts` |

### `/api/supplie-characteristics` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/supplie-characteristics` | `#controllers/supplie_caracteristics_controller.store` | `start/routes/supplie_caracteristics.ts` |
| GET | `/api/supplie-characteristics` | `#controllers/supplie_caracteristics_controller.index` | `start/routes/supplie_caracteristics.ts` |
| GET | `/api/supplie-characteristics/:id` | `#controllers/supplie_caracteristics_controller.show` | `start/routes/supplie_caracteristics.ts` |
| PUT | `/api/supplie-characteristics/:id` | `#controllers/supplie_caracteristics_controller.update` | `start/routes/supplie_caracteristics.ts` |
| DELETE | `/api/supplie-characteristics/:id` | `#controllers/supplie_caracteristics_controller.destroy` | `start/routes/supplie_caracteristics.ts` |
| GET | `/api/supplie-characteristics/:id/values` | `#controllers/supplie_caracteristics_controller.getWithValues` | `start/routes/supplie_caracteristics.ts` |
| GET | `/api/supplie-characteristics/by-supply-type/:supplyTypeId` | `#controllers/supplie_caracteristics_controller.getBySupplyType` | `start/routes/supplie_caracteristics.ts` |

### `/api/supplies` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/supplies` | `#controllers/supplies_controller.store` | `start/routes/supplies.ts` |
| GET | `/api/supplies` | `#controllers/supplies_controller.index` | `start/routes/supplies.ts` |
| GET | `/api/supplies/excel` | `#controllers/supplies_controller.getExcel` | `start/routes/supplies.ts` |
| GET | `/api/supplies/:id` | `#controllers/supplies_controller.show` | `start/routes/supplies.ts` |
| PUT | `/api/supplies/:id` | `#controllers/supplies_controller.update` | `start/routes/supplies.ts` |
| DELETE | `/api/supplies/:id` | `#controllers/supplies_controller.destroy` | `start/routes/supplies.ts` |
| POST | `/api/supplies/:id/deactivate` | `#controllers/supplies_controller.deactivate` | `start/routes/supplies.ts` |
| GET | `/api/supplies/:id/with-type` | `#controllers/supplies_controller.getWithType` | `start/routes/supplies.ts` |
| GET | `/api/supplies/by-type/:supplyTypeId` | `#controllers/supplies_controller.getByType` | `start/routes/supplies.ts` |
| GET | `/api/supplies/:supplyId/value-histories` | `#controllers/supply_value_histories_controller.getBySupply` | `start/routes/supply_value_histories.ts` |
| GET | `/api/supplies/:supplyId/value-histories/latest` | `#controllers/supply_value_histories_controller.getLatestValue` | `start/routes/supply_value_histories.ts` |

### `/api/supply-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/supply-types` | `#controllers/supply_types_controller.store` | `start/routes/supply_type.ts` |
| GET | `/api/supply-types` | `#controllers/supply_types_controller.index` | `start/routes/supply_type.ts` |
| GET | `/api/supply-types/:id` | `#controllers/supply_types_controller.show` | `start/routes/supply_type.ts` |
| PUT | `/api/supply-types/:id` | `#controllers/supply_types_controller.update` | `start/routes/supply_type.ts` |
| DELETE | `/api/supply-types/:id` | `#controllers/supply_types_controller.destroy` | `start/routes/supply_type.ts` |
| GET | `/api/supply-types/:id/characteristics` | `#controllers/supply_types_controller.getWithCharacteristics` | `start/routes/supply_type.ts` |

### `/api/supply-value-histories` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/supply-value-histories` | `#controllers/supply_value_histories_controller.index` | `start/routes/supply_value_histories.ts` |
| POST | `/api/supply-value-histories` | `#controllers/supply_value_histories_controller.store` | `start/routes/supply_value_histories.ts` |
| GET | `/api/supply-value-histories/:id` | `#controllers/supply_value_histories_controller.show` | `start/routes/supply_value_histories.ts` |
| PUT | `/api/supply-value-histories/:id` | `#controllers/supply_value_histories_controller.update` | `start/routes/supply_value_histories.ts` |
| DELETE | `/api/supply-value-histories/:id` | `#controllers/supply_value_histories_controller.destroy` | `start/routes/supply_value_histories.ts` |

### `/api/synchronization` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/synchronization/departments` | `#controllers/department_controller.synchronization` | `start/routes/synchronization_routes.ts` |
| POST | `/api/synchronization/positions` | `#controllers/position_controller.synchronization` | `start/routes/synchronization_routes.ts` |
| POST | `/api/synchronization/employees` | `#controllers/employee_controller.synchronization` | `start/routes/synchronization_routes.ts` |
| POST | `/api/synchronization/shift` | `#controllers/shifts_controller.synchronization` | `start/routes/synchronization_routes.ts` |
| POST | `/api/synchronization/by-selection/employees` | `#controllers/employee_controller.synchronizationBySelection` | `start/routes/synchronization_routes.ts` |

### `/api/system-modules` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/system-modules` | `#controllers/system_module_controller.index` | `start/routes/system_module_routes.ts` |
| GET | `/api/system-modules/get-groups` | `#controllers/system_module_controller.getGroups` | `start/routes/system_module_routes.ts` |
| GET | `/api/system-modules/:systemModuleSlug` | `#controllers/system_module_controller.show` | `start/routes/system_module_routes.ts` |

### `/api/system-setting-payroll-configs` (middleware: auth, auth, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/system-setting-payroll-configs` | `#controllers/system_setting_payroll_config_controller.store` | `start/routes/system_setting_payroll_config_routes.ts` |
| PUT | `/api/system-setting-payroll-configs/:systemSettingPayrollConfigId` | `#controllers/system_setting_payroll_config_controller.update` | `start/routes/system_setting_payroll_config_routes.ts` |
| DELETE | `/api/system-setting-payroll-configs/:systemSettingPayrollConfigId` | `#controllers/system_setting_payroll_config_controller.delete` | `start/routes/system_setting_payroll_config_routes.ts` |
| GET | `/api/system-setting-payroll-configs/:systemSettingPayrollConfigId` | `#controllers/system_setting_payroll_config_controller.show` | `start/routes/system_setting_payroll_config_routes.ts` |

### `/api/system-setting-trade-names` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/system-setting-trade-names` | `#controllers/system_setting_trade_name_controller.index` | `start/routes/system_setting_trade_name_routes.ts` |
| POST | `/api/system-setting-trade-names` | `#controllers/system_setting_trade_name_controller.store` | `start/routes/system_setting_trade_name_routes.ts` |
| POST | `/api/system-setting-trade-names/:systemSettingTradeNameId/employee-application-icon` | `#controllers/system_setting_trade_name_controller.uploadEmployeeApplicationIcon` | `start/routes/system_setting_trade_name_routes.ts` |
| PUT | `/api/system-setting-trade-names/:systemSettingTradeNameId` | `#controllers/system_setting_trade_name_controller.update` | `start/routes/system_setting_trade_name_routes.ts` |
| DELETE | `/api/system-setting-trade-names/:systemSettingTradeNameId` | `#controllers/system_setting_trade_name_controller.delete` | `start/routes/system_setting_trade_name_routes.ts` |
| GET | `/api/system-setting-trade-names/:systemSettingTradeNameId` | `#controllers/system_setting_trade_name_controller.show` | `start/routes/system_setting_trade_name_routes.ts` |

### `/api/system-settings` (middleware: auth, auth, auth, auth, auth, auth, businessScope, auth, businessScope, auth, businessScope, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/system-settings/assign-system-modules/:systemSettingId` | `#controllers/system_setting_controller.assignSystemModules` | `start/routes/system_setting_routes.ts` |
| PUT | `/api/system-settings/:systemSettingId/birthday-emails` | `#controllers/system_setting_controller.updateBirthdayEmailsStatus` | `start/routes/system_setting_routes.ts` |
| PUT | `/api/system-settings/:systemSettingId/anniversary-emails` | `#controllers/system_setting_controller.updateAnniversaryEmailsStatus` | `start/routes/system_setting_routes.ts` |
| PUT | `/api/system-settings/:systemSettingId/attendance-fault-hr-emails` | `#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus` | `start/routes/system_setting_routes.ts` |
| POST | `/api/system-settings/:systemSettingId/employee-application-icon` | `#controllers/system_setting_controller.uploadEmployeeApplicationIcon` | `start/routes/system_setting_routes.ts` |
| GET | `/api/system-settings` | `#controllers/system_setting_controller.index` | `start/routes/system_setting_routes.ts` |
| POST | `/api/system-settings` | `#controllers/system_setting_controller.store` | `start/routes/system_setting_routes.ts` |
| PUT | `/api/system-settings/:systemSettingId` | `#controllers/system_setting_controller.update` | `start/routes/system_setting_routes.ts` |
| DELETE | `/api/system-settings/:systemSettingId` | `#controllers/system_setting_controller.delete` | `start/routes/system_setting_routes.ts` |
| GET | `/api/system-settings/:systemSettingId` | `#controllers/system_setting_controller.show` | `start/routes/system_setting_routes.ts` |
| GET | `/api/system-settings` | `#controllers/system_setting_controller.getActive` | `start/routes/system_setting_routes.ts` |
| GET | `/api/system-settings` | `#controllers/system_setting_controller.getPayrollConfig` | `start/routes/system_setting_routes.ts` |

### `/api/system-settings-employees` (middleware: auth, auth, auth, auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/system-settings-employees` | `#controllers/system_settings_employees_controller.store` | `start/routes/system_settings_employees.ts` |
| GET | `/api/system-settings-employees/:systemSettingId` | `#controllers/system_settings_employees_controller.index` | `start/routes/system_settings_employees.ts` |
| GET | `/api/system-settings-employees/:systemSettingId/active` | `#controllers/system_settings_employees_controller.getActive` | `start/routes/system_settings_employees.ts` |
| DELETE | `/api/system-settings-employees/:systemSettingId` | `#controllers/system_settings_employees_controller.delete` | `start/routes/system_settings_employees.ts` |

### `/api/system-settings-notification-emails` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/system-settings-notification-emails` | `#controllers/system_settings_notification_emails_controller.index` | `start/routes/system_settings_notification_emails_routes.ts` |
| GET | `/api/system-settings-notification-emails/:systemSettingId` | `#controllers/system_settings_notification_emails_controller.indexBySystemSetting` | `start/routes/system_settings_notification_emails_routes.ts` |
| POST | `/api/system-settings-notification-emails` | `#controllers/system_settings_notification_emails_controller.store` | `start/routes/system_settings_notification_emails_routes.ts` |
| DELETE | `/api/system-settings-notification-emails/:systemSettingNotificationEmailId` | `#controllers/system_settings_notification_emails_controller.delete` | `start/routes/system_settings_notification_emails_routes.ts` |

### `/api/system-settings-proceeding-files` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/system-settings-proceeding-files/get-expired-and-expiring/:systemSettingId` | `#controllers/system_setting_controller.getExpiresAndExpiringProceedingFiles` | `start/routes/system_settings_proceeding_files_routes.ts` |
| POST | `/api/system-settings-proceeding-files` | `#controllers/system_setting_controller.storeProceedingFile` | `start/routes/system_settings_proceeding_files_routes.ts` |
| GET | `/api/system-settings-proceeding-files` | `#controllers/system_setting_controller.proceedingFiles` | `start/routes/system_settings_proceeding_files_routes.ts` |
| PUT | `/api/system-settings-proceeding-files/:systemSettingProceedingFileId` | `#controllers/system_setting_controller.updateProceedingFile` | `start/routes/system_settings_proceeding_files_routes.ts` |
| GET | `/api/system-settings-proceeding-files/:systemSettingProceedingFileId` | `#controllers/system_setting_controller.showProceedingFile` | `start/routes/system_settings_proceeding_files_routes.ts` |
| DELETE | `/api/system-settings-proceeding-files/:systemSettingProceedingFileId` | `#controllers/system_setting_controller.deleteProceedingFile` | `start/routes/system_settings_proceeding_files_routes.ts` |

### `/api/system-settings-system-modules` (middleware: ninguno)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/system-settings-system-modules` | `#controllers/system_setting_system_module_controller.store` | `start/routes/system_setting_system_module_routes.ts` |
| PUT | `/api/system-settings-system-modules/:systemSettingSystemModuleId` | `#controllers/system_setting_system_module_controller.update` | `start/routes/system_setting_system_module_routes.ts` |
| DELETE | `/api/system-settings-system-modules/:systemSettingSystemModuleId` | `#controllers/system_setting_system_module_controller.delete` | `start/routes/system_setting_system_module_routes.ts` |
| DELETE | `/api/system-settings-system-modules/:systemSettingId/:systemModuleId` | `#controllers/system_setting_system_module_controller.deleteRelation` | `start/routes/system_setting_system_module_routes.ts` |
| GET | `/api/system-settings-system-modules/:systemSettingSystemModuleId` | `#controllers/system_setting_system_module_controller.show` | `start/routes/system_setting_system_module_routes.ts` |

### `/api/tolerances` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/tolerances/:systemSettingId` | `#controllers/tolerances_controller.index` | `start/routes/tolerance_routes.ts` |
| GET | `/api/tolerances/get-tardiness-tolerance` | `#controllers/tolerances_controller.getTardinessTolerance` | `start/routes/tolerance_routes.ts` |
| POST | `/api/tolerances` | `#controllers/tolerances_controller.store` | `start/routes/tolerance_routes.ts` |
| PUT | `/api/tolerances/:id` | `#controllers/tolerances_controller.update` | `start/routes/tolerance_routes.ts` |
| DELETE | `/api/tolerances/:id` | `#controllers/tolerances_controller.destroy` | `start/routes/tolerance_routes.ts` |
| GET | `/api/tolerances/:id` | `#controllers/tolerances_controller.show` | `start/routes/tolerance_routes.ts` |

### `/api/user-fcm-tokens` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/user-fcm-tokens` | `#controllers/user_fcm_token_controller.registerOrUpdate` | `start/routes/user_fcm_token_routes.ts` |

### `/api/user-responsible-employees` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/user-responsible-employees` | `#controllers/user_responsible_employee_controller.store` | `start/routes/user_responsible_employee_routes.ts` |
| PUT | `/api/user-responsible-employees/:userResponsibleEmployeeId` | `#controllers/user_responsible_employee_controller.update` | `start/routes/user_responsible_employee_routes.ts` |
| GET | `/api/user-responsible-employees/:userResponsibleEmployeeId` | `#controllers/user_responsible_employee_controller.show` | `start/routes/user_responsible_employee_routes.ts` |
| DELETE | `/api/user-responsible-employees/:userResponsibleEmployeeId` | `#controllers/user_responsible_employee_controller.delete` | `start/routes/user_responsible_employee_routes.ts` |

### `/api/users` (middleware: auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/users/has-access-department/:userId/:departmentId` | `#controllers/user_controller.hasAccessDepartment` | `start/routes/user_routes.ts` |
| GET | `/api/users/:userId/employees-assigned/:employeeId?` | `#controllers/user_controller.getEmployeesAssigned` | `start/routes/user_routes.ts` |
| GET | `/api/users` | `#controllers/user_controller.index` | `start/routes/user_routes.ts` |
| POST | `/api/users` | `#controllers/user_controller.store` | `start/routes/user_routes.ts` |
| PUT | `/api/users/:userId` | `#controllers/user_controller.update` | `start/routes/user_routes.ts` |
| DELETE | `/api/users/:userId` | `#controllers/user_controller.delete` | `start/routes/user_routes.ts` |
| GET | `/api/users/:userId` | `#controllers/user_controller.show` | `start/routes/user_routes.ts` |

### `/api/v1` (middleware: auth, auth, businessScope)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/v1/assists/get-flat-list` | `#controllers/assists_controller.getAssistFlatList` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-format-payroll` | `#controllers/assists_controller.getFormatPayRoll` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-excel-by-employee` | `#controllers/assists_controller.getExcelByEmployee` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-excel-by-position` | `#controllers/assists_controller.getExcelByPosition` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-excel-by-department` | `#controllers/assists_controller.getExcelByDepartment` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-excel-all` | `#controllers/assists_controller.getExcelAll` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/get-excel-permissions-dates` | `#controllers/assists_controller.getExcelPermissionsByDates` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists` | `#controllers/assists_controller.index` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/status` | `#controllers/assists_controller.getStatusSync` | `start/routes/assist_routes.ts` |
| POST | `/api/v1/assists/synchronize` | `#controllers/assists_controller.synchronize` | `start/routes/assist_routes.ts` |
| POST | `/api/v1/assists/employee-synchronize` | `#controllers/assists_controller.employeeSynchronize` | `start/routes/assist_routes.ts` |
| POST | `/api/v1/assists` | `#controllers/assists_controller.store` | `start/routes/assist_routes.ts` |
| PUT | `/api/v1/assists/:assistId/inactivate` | `#controllers/assists_controller.inactivate` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/websocket-docs` | `#controllers/assists_controller.websocketDocs` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/assists/verify-attendance-lock/:type` | `#controllers/assists_controller.verifyAttendanceLock` | `start/routes/assist_routes.ts` |
| GET | `/api/v1/attendance-stats/overview` | `#modules/attendance-stats/attendance-stats.controller.overview` | `start/routes/attendance_stats_routes.ts` |
| GET | `/api/v1/attendance-stats/by-department` | `#modules/attendance-stats/attendance-stats.controller.byDepartment` | `start/routes/attendance_stats_routes.ts` |
| GET | `/api/v1/attendance-stats/by-employee` | `#modules/attendance-stats/attendance-stats.controller.byEmployee` | `start/routes/attendance_stats_routes.ts` |
| GET | `/api/v1/employee-assist-calendars` | `#controllers/employee_assist_calendar_controller.index` | `start/routes/employee_assist_calendar_routes.ts` |
| GET | `/api/v1/regulatory-coverage` | `#modules/regulatory-coverage/regulatory_coverage.controller.index` | `start/routes/regulatory_coverage_routes.ts` |
| GET | `/api/v1/regulatory-coverage/summary` | `#modules/regulatory-coverage/regulatory_coverage.controller.summary` | `start/routes/regulatory_coverage_routes.ts` |
| GET | `/api/v1/regulatory-coverage/:regulationId` | `#modules/regulatory-coverage/regulatory_coverage.controller.show` | `start/routes/regulatory_coverage_routes.ts` |

### `/api/vacation-authorizations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/vacation-authorizations/authorize` | `#controllers/vacation_authorization_signatures_controller.authorize` | `start/routes/vacation_authorization_signatures_routes.ts` |
| POST | `/api/vacation-authorizations/sign-shift-exceptions` | `#controllers/vacation_authorization_signatures_controller.signShiftExceptions` | `start/routes/vacation_authorization_signatures_routes.ts` |
| GET | `/api/vacation-authorizations/pending` | `#controllers/vacation_authorization_signatures_controller.getPendingVacationRequests` | `start/routes/vacation_authorization_signatures_routes.ts` |
| GET | `/api/vacation-authorizations/authorized` | `#controllers/vacation_authorization_signatures_controller.getAuthorizedVacationRequests` | `start/routes/vacation_authorization_signatures_routes.ts` |
| GET | `/api/vacation-authorizations/shift-exceptions` | `#controllers/vacation_authorization_signatures_controller.getVacationShiftExceptions` | `start/routes/vacation_authorization_signatures_routes.ts` |

### `/api/vacations` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/vacations` | `#controllers/vacation_settings_controller.index` | `start/routes/vacations_routes.ts` |
| POST | `/api/vacations` | `#controllers/vacation_settings_controller.store` | `start/routes/vacations_routes.ts` |
| PUT | `/api/vacations/:vacationSettingId` | `#controllers/vacation_settings_controller.update` | `start/routes/vacations_routes.ts` |
| DELETE | `/api/vacations/:vacationSettingId` | `#controllers/vacation_settings_controller.destroy` | `start/routes/vacations_routes.ts` |
| GET | `/api/vacations/:vacationSettingId` | `#controllers/vacation_settings_controller.show` | `start/routes/vacations_routes.ts` |

### `/api/verify-face` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/verify-face` | `#controllers/face_controller.verify` | `start/routes/face_routes.ts` |

### `/api/weights` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/weights` | `#controllers/weight_controller.index` | `start/routes/weight_routes.ts` |

### `/api/work-disabilities` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/work-disabilities` | `#controllers/work_disability_controller.index` | `start/routes/work_disability_routes.ts` |
| POST | `/api/work-disabilities` | `#controllers/work_disability_controller.store` | `start/routes/work_disability_routes.ts` |
| DELETE | `/api/work-disabilities/:workDisabilityId` | `#controllers/work_disability_controller.delete` | `start/routes/work_disability_routes.ts` |
| PUT | `/api/work-disabilities/:workDisabilityId` | `#controllers/work_disability_controller.update` | `start/routes/work_disability_routes.ts` |
| GET | `/api/work-disabilities/:workDisabilityId` | `#controllers/work_disability_controller.show` | `start/routes/work_disability_routes.ts` |
| GET | `/api/work-disabilities/employee/:employeeId` | `#controllers/work_disability_controller.getByEmployee` | `start/routes/work_disability_routes.ts` |

### `/api/work-disability-notes` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/work-disability-notes` | `#controllers/work_disability_note_controller.store` | `start/routes/work_disability_note_routes.ts` |
| GET | `/api/work-disability-notes/:workDisabilityNoteId` | `#controllers/work_disability_note_controller.show` | `start/routes/work_disability_note_routes.ts` |
| PUT | `/api/work-disability-notes/:workDisabilityNoteId` | `#controllers/work_disability_note_controller.update` | `start/routes/work_disability_note_routes.ts` |
| DELETE | `/api/work-disability-notes/:workDisabilityNoteId` | `#controllers/work_disability_note_controller.delete` | `start/routes/work_disability_note_routes.ts` |

### `/api/work-disability-period-expenses` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/work-disability-period-expenses` | `#controllers/work_disability_period_expense_controller.store` | `start/routes/work_disability_period_expense_routes.ts` |
| GET | `/api/work-disability-period-expenses/:workDisabilityPeriodExpenseId` | `#controllers/work_disability_period_expense_controller.show` | `start/routes/work_disability_period_expense_routes.ts` |
| PUT | `/api/work-disability-period-expenses/:workDisabilityPeriodExpenseId` | `#controllers/work_disability_period_expense_controller.update` | `start/routes/work_disability_period_expense_routes.ts` |
| DELETE | `/api/work-disability-period-expenses/:workDisabilityPeriodExpenseId` | `#controllers/work_disability_period_expense_controller.delete` | `start/routes/work_disability_period_expense_routes.ts` |

### `/api/work-disability-periods` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| POST | `/api/work-disability-periods` | `#controllers/work_disability_period_controller.store` | `start/routes/work_disability_period_routes.ts` |
| GET | `/api/work-disability-periods/:workDisabilityPeriodId` | `#controllers/work_disability_period_controller.show` | `start/routes/work_disability_period_routes.ts` |
| PUT | `/api/work-disability-periods/:workDisabilityPeriodId` | `#controllers/work_disability_period_controller.update` | `start/routes/work_disability_period_routes.ts` |
| DELETE | `/api/work-disability-periods/:workDisabilityPeriodId` | `#controllers/work_disability_period_controller.delete` | `start/routes/work_disability_period_routes.ts` |

### `/api/work-disability-types` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/work-disability-types` | `#controllers/work_disability_type_controller.index` | `start/routes/work_disability_type_routes.ts` |

### `/api/zones` (middleware: auth)

| Método | Path | Handler | Archivo |
|---|---|---|---|
| GET | `/api/zones` | `#controllers/zone_controller.index` | `start/routes/zone_routes.ts` |
| POST | `/api/zones` | `#controllers/zone_controller.store` | `start/routes/zone_routes.ts` |
| GET | `/api/zones/:zoneId` | `#controllers/zone_controller.show` | `start/routes/zone_routes.ts` |
| PUT | `/api/zones/:zoneId` | `#controllers/zone_controller.update` | `start/routes/zone_routes.ts` |
| DELETE | `/api/zones/:zoneId` | `#controllers/zone_controller.delete` | `start/routes/zone_routes.ts` |
| PUT | `/api/zones/:zoneId/thumbnail` | `#controllers/zone_controller.uploadThumbnail` | `start/routes/zone_routes.ts` |

## Controllers (151)

- `app/controllers/access_point_controller.ts`
- `app/controllers/address_controller.ts`
- `app/controllers/address_type_controller.ts`
- `app/controllers/aircraft_classes_controller.ts`
- `app/controllers/aircraft_maintenance_controller.ts`
- `app/controllers/aircraft_maintenance_status_controller.ts`
- `app/controllers/aircraft_operators_controller.ts`
- `app/controllers/aircraft_proceeding_files_controller.ts`
- `app/controllers/aircraft_properties_controller.ts`
- `app/controllers/aircrafts_controller.ts`
- `app/controllers/airports_controller.ts`
- `app/controllers/asignaciones_contrato_especializado_controller.ts`
- `app/controllers/assessment_template_controller.ts`
- `app/controllers/assessment_template_dimension_controller.ts`
- `app/controllers/assists_controller.ts`
- `app/controllers/auth_signup_controller.ts`
- `app/controllers/bank_controller.ts`
- `app/controllers/branch_offices_controller.ts`
- `app/controllers/business_unit_competency_level_controller.ts`
- `app/controllers/business_unit_controller.ts`
- `app/controllers/career_path_candidate_controller.ts`
- `app/controllers/career_path_override_reason_controller.ts`
- `app/controllers/career_path_template_controller.ts`
- `app/controllers/certifications_controller.ts`
- `app/controllers/competency_bracket_controller.ts`
- `app/controllers/competency_controller.ts`
- `app/controllers/competency_descriptor_controller.ts`
- `app/controllers/contratos_servicios_especializados_controller.ts`
- `app/controllers/customer_controller.ts`
- `app/controllers/customer_proceeding_file_controller.ts`
- `app/controllers/department_controller.ts`
- `app/controllers/department_position_controller.ts`
- `app/controllers/documentos_contrato_especializado_controller.ts`
- `app/controllers/employee_address_controller.ts`
- `app/controllers/employee_annotation_controller.ts`
- `app/controllers/employee_assessment_controller.ts`
- `app/controllers/employee_assist_calendar_controller.ts`
- `app/controllers/employee_bank_controller.ts`
- `app/controllers/employee_biometric_controller.ts`
- `app/controllers/employee_biometric_face_id_controller.ts`
- `app/controllers/employee_biometric_photos_controller.ts`
- `app/controllers/employee_bonus_controller.ts`
- `app/controllers/employee_branch_office_controller.ts`
- `app/controllers/employee_certification_controller.ts`
- `app/controllers/employee_certification_expiration_controller.ts`
- `app/controllers/employee_certification_upload_controller.ts`
- `app/controllers/employee_children_controller.ts`
- `app/controllers/employee_competency_evaluation_controller.ts`
- `app/controllers/employee_contract_controller.ts`
- `app/controllers/employee_contract_type_controller.ts`
- `app/controllers/employee_controller.ts`
- `app/controllers/employee_device_controller.ts`
- `app/controllers/employee_emergency_contact_controller.ts`
- `app/controllers/employee_evaluation_controller.ts`
- `app/controllers/employee_kpi_evaluation_controller.ts`
- `app/controllers/employee_lactation_period_evidences_controller.ts`
- `app/controllers/employee_lactation_periods_controller.ts`
- `app/controllers/employee_medical_condition_controller.ts`
- `app/controllers/employee_medical_conditions_controller.ts`
- `app/controllers/employee_proceding_files_controller.ts`
- `app/controllers/employee_proceeding_file_controller.ts`
- `app/controllers/employee_record_controller.ts`
- `app/controllers/employee_record_property_controller.ts`
- `app/controllers/employee_shift_change_controller.ts`
- `app/controllers/employee_shifts_controller.ts`
- `app/controllers/employee_spouse_controller.ts`
- `app/controllers/employee_supplie_assignation_photos_controller.ts`
- `app/controllers/employee_supplies_controller.ts`
- `app/controllers/employee_supplies_response_contracts_controller.ts`
- `app/controllers/employee_temporary_assignment_controller.ts`
- `app/controllers/employee_type_controller.ts`
- `app/controllers/employee_vacation_archive_content_controller.ts`
- `app/controllers/employee_vacation_archive_controller.ts`
- `app/controllers/employee_vacation_controller.ts`
- `app/controllers/employee_zone_controller.ts`
- `app/controllers/empresas_contratantes_controller.ts`
- `app/controllers/exception_requests_controller.ts`
- `app/controllers/exception_type_controller.ts`
- `app/controllers/face_controller.ts`
- `app/controllers/flight_attendant_controller.ts`
- `app/controllers/flight_attendant_proceeding_file_controller.ts`
- `app/controllers/galleries_controller.ts`
- `app/controllers/holidays_controller.ts`
- `app/controllers/icons_controller.ts`
- `app/controllers/insurance_coverage_type_controller.ts`
- `app/controllers/labor_law_hours_controller.ts`
- `app/controllers/maintenance_expense_category_controller.ts`
- `app/controllers/maintenance_expense_controller.ts`
- `app/controllers/maintenance_type_controller.ts`
- `app/controllers/maintenance_urgency_level_controller.ts`
- `app/controllers/medical_condition_type_controller.ts`
- `app/controllers/medical_condition_type_properties_controller.ts`
- `app/controllers/medical_condition_type_property_controller.ts`
- `app/controllers/medical_condition_type_property_value_controller.ts`
- `app/controllers/medical_condition_type_property_values_controller.ts`
- `app/controllers/medical_condition_types_controller.ts`
- `app/controllers/notice_controller.ts`
- `app/controllers/passkey_controller.ts`
- `app/controllers/person_controller.ts`
- `app/controllers/pilot_controller.ts`
- `app/controllers/pilot_proceeding_file_controller.ts`
- `app/controllers/position_approval_history_controller.ts`
- `app/controllers/position_assessment_profile_controller.ts`
- `app/controllers/position_business_unit_competency_level_controller.ts`
- `app/controllers/position_certification_requirement_controller.ts`
- `app/controllers/position_controller.ts`
- `app/controllers/position_kpi_controller.ts`
- `app/controllers/position_salary_range_controller.ts`
- `app/controllers/position_specific_function_controller.ts`
- `app/controllers/position_work_tool_controller.ts`
- `app/controllers/proceeding_file_controller.ts`
- `app/controllers/proceeding_file_type_controller.ts`
- `app/controllers/proceeding_file_type_email_controller.ts`
- `app/controllers/proceeding_file_type_property_controller.ts`
- `app/controllers/proceeding_file_type_property_value_controller.ts`
- `app/controllers/repse_registrations_controller.ts`
- `app/controllers/repse_specialized_services_controller.ts`
- `app/controllers/reservation_controller.ts`
- `app/controllers/reservation_leg_controller.ts`
- `app/controllers/reservation_note_controller.ts`
- `app/controllers/role_controller.ts`
- `app/controllers/shift_exception_evidence_controller.ts`
- `app/controllers/shift_exceptions_controller.ts`
- `app/controllers/shift_for_employees_controller.ts`
- `app/controllers/shifts_controller.ts`
- `app/controllers/supplie_caracteristic_values_controller.ts`
- `app/controllers/supplie_caracteristics_controller.ts`
- `app/controllers/supplies_controller.ts`
- `app/controllers/supply_types_controller.ts`
- `app/controllers/supply_value_histories_controller.ts`
- `app/controllers/system_module_controller.ts`
- `app/controllers/system_setting_controller.ts`
- `app/controllers/system_setting_payroll_config_controller.ts`
- `app/controllers/system_setting_system_module_controller.ts`
- `app/controllers/system_setting_trade_name_controller.ts`
- `app/controllers/system_settings_employees_controller.ts`
- `app/controllers/system_settings_notification_emails_controller.ts`
- `app/controllers/tolerances_controller.ts`
- `app/controllers/user_controller.ts`
- `app/controllers/user_fcm_token_controller.ts`
- `app/controllers/user_responsible_employee_controller.ts`
- `app/controllers/vacation_authorization_signatures_controller.ts`
- `app/controllers/vacation_settings_controller.ts`
- `app/controllers/version_contrato_especializado_controller.ts`
- `app/controllers/weight_controller.ts`
- `app/controllers/work_disability_controller.ts`
- `app/controllers/work_disability_note_controller.ts`
- `app/controllers/work_disability_period_controller.ts`
- `app/controllers/work_disability_period_expense_controller.ts`
- `app/controllers/work_disability_type_controller.ts`
- `app/controllers/zone_controller.ts`

## Services (155)

- `app/services/access_point_service.ts`
- `app/services/address_service.ts`
- `app/services/address_type_service.ts`
- `app/services/aircraft_maintenance_service.ts`
- `app/services/aircraft_maintenance_status_service.ts`
- `app/services/aircraft_maintenance_urgency_level_service.ts`
- `app/services/aircraft_operator_service.ts`
- `app/services/aircraft_proceeding_file_service.ts`
- `app/services/asignacion_contrato_especializado_service.ts`
- `app/services/assessment_data_type_coherence.ts`
- `app/services/assessment_template_dimension_service.ts`
- `app/services/assessment_template_service.ts`
- `app/services/assist_service.ts`
- `app/services/attendance_fault_hr_notification_service.ts`
- `app/services/auth_mail_service.ts`
- `app/services/auth_token_service.ts`
- `app/services/bank_service.ts`
- `app/services/branch_office_service.ts`
- `app/services/business_access_scope_service.ts`
- `app/services/business_unit_competency_level_service.ts`
- `app/services/business_unit_service.ts`
- `app/services/career_path_candidate_service.ts`
- `app/services/career_path_candidate_status_history_service.ts`
- `app/services/career_path_override_reason_service.ts`
- `app/services/career_path_template_service.ts`
- `app/services/certification_service.ts`
- `app/services/competency_bracket_service.ts`
- `app/services/competency_descriptor_service.ts`
- `app/services/competency_service.ts`
- `app/services/contrato_servicio_especializado_service.ts`
- `app/services/customer_proceeding_file_service.ts`
- `app/services/customer_service.ts`
- `app/services/department_position_service.ts`
- `app/services/department_service.ts`
- `app/services/documento_contrato_especializado_service.ts`
- `app/services/employee_address_service.ts`
- `app/services/employee_annotation_service.ts`
- `app/services/employee_assessment_result_service.ts`
- `app/services/employee_assessment_service.ts`
- `app/services/employee_assist_calendar_service.ts`
- `app/services/employee_bank_service.ts`
- `app/services/employee_biometric_face_id_service.ts`
- `app/services/employee_biometric_service.ts`
- `app/services/employee_bonus_service.ts`
- `app/services/employee_branch_office_service.ts`
- `app/services/employee_certification_expiration_service.ts`
- `app/services/employee_certification_service.ts`
- `app/services/employee_certification_upload_service.ts`
- `app/services/employee_children_service.ts`
- `app/services/employee_competency_evaluation_service.ts`
- `app/services/employee_contract_service.ts`
- `app/services/employee_contract_type_service.ts`
- `app/services/employee_device_service.ts`
- `app/services/employee_emergency_contact_service.ts`
- `app/services/employee_evaluation_service.ts`
- `app/services/employee_kpi_evaluation_service.ts`
- `app/services/employee_lactation_compliance_report_service.ts`
- `app/services/employee_lactation_period_evidence_service.ts`
- `app/services/employee_lactation_period_service.ts`
- `app/services/employee_medical_condition_service.ts`
- `app/services/employee_proceeding_file_service.ts`
- `app/services/employee_record_property_service.ts`
- `app/services/employee_record_service.ts`
- `app/services/employee_salary_history_service.ts`
- `app/services/employee_service.ts`
- `app/services/employee_shift_change_service.ts`
- `app/services/employee_shift_service.ts`
- `app/services/employee_spouse_service.ts`
- `app/services/employee_supplie_service.ts`
- `app/services/employee_supplies_response_contract_service.ts`
- `app/services/employee_suppply_assignament_photo_service.ts`
- `app/services/employee_temporary_assignment_service.ts`
- `app/services/employee_type_service.ts`
- `app/services/employee_vacation_archive_content_service.ts`
- `app/services/employee_vacation_archive_service.ts`
- `app/services/employee_vacation_service.ts`
- `app/services/employee_zone_service.ts`
- `app/services/empresa_contratante_service.ts`
- `app/services/exception_type_service.ts`
- `app/services/face_descriptor_cache_service.ts`
- `app/services/flight_attendant_proceeding_file_service.ts`
- `app/services/flight_attendant_service.ts`
- `app/services/holiday_service.ts`
- `app/services/insurance_coverage_type_service.ts`
- `app/services/labor_law_hours_service.ts`
- `app/services/maintenance_expense_category_service.ts`
- `app/services/maintenance_expense_service.ts`
- `app/services/maintenance_type_service.ts`
- `app/services/medical_condition_type_property_service.ts`
- `app/services/medical_condition_type_property_value_service.ts`
- `app/services/medical_condition_type_service.ts`
- `app/services/notice_file_service.ts`
- `app/services/notice_service.ts`
- `app/services/notification_email_service.ts`
- `app/services/org_alias_uniqueness_service.ts`
- `app/services/org_chart_move_service.ts`
- `app/services/person_service.ts`
- `app/services/pilot_proceeding_file_service.ts`
- `app/services/pilot_service.ts`
- `app/services/position_approval_history_service.ts`
- `app/services/position_assessment_profile_service.ts`
- `app/services/position_business_unit_competency_level_service.ts`
- `app/services/position_certification_requirement_service.ts`
- `app/services/position_kpi_service.ts`
- `app/services/position_salary_range_service.ts`
- `app/services/position_service.ts`
- `app/services/position_specific_function_service.ts`
- `app/services/position_work_tool_service.ts`
- `app/services/proceeding_file_service.ts`
- `app/services/proceeding_file_type_email_service.ts`
- `app/services/proceeding_file_type_property_service.ts`
- `app/services/proceeding_file_type_property_value_service.ts`
- `app/services/proceeding_file_type_service.ts`
- `app/services/repse_registration_service.ts`
- `app/services/repse_specialized_service_service.ts`
- `app/services/reservation_leg_service.ts`
- `app/services/reservation_note_service.ts`
- `app/services/reservation_service.ts`
- `app/services/role_service.ts`
- `app/services/shift_exception_evidence_service.ts`
- `app/services/shift_exception_service.ts`
- `app/services/shift_for_employees_service.ts`
- `app/services/shift_service.ts`
- `app/services/signup_draft_service.ts`
- `app/services/supplie_caracteristic_service.ts`
- `app/services/supplie_caracteristic_value_service.ts`
- `app/services/supplie_service.ts`
- `app/services/supply_type_service.ts`
- `app/services/supply_value_history_service.ts`
- `app/services/sync_assists_service.ts`
- `app/services/system_module_service.ts`
- `app/services/system_setting_email_service.ts`
- `app/services/system_setting_payroll_config_service.ts`
- `app/services/system_setting_proceeding_file_service.ts`
- `app/services/system_setting_service.ts`
- `app/services/system_setting_system_module_service.ts`
- `app/services/system_setting_trade_name_service.ts`
- `app/services/system_settings_employee_service.ts`
- `app/services/tolerance_service.ts`
- `app/services/upload_file_service.ts`
- `app/services/upload_service.ts`
- `app/services/user_fcm_token_service.ts`
- `app/services/user_responsible_employee_service.ts`
- `app/services/user_service.ts`
- `app/services/vacation_authorization_signatures_service.ts`
- `app/services/version_contrato_especializado_service.ts`
- `app/services/weight_service.ts`
- `app/services/work_disability_note_service.ts`
- `app/services/work_disability_period_expense_service.ts`
- `app/services/work_disability_period_service.ts`
- `app/services/work_disability_service.ts`
- `app/services/work_disability_type_service.ts`
- `app/services/working_time_rule_cache_service.ts`
- `app/services/ws.ts`
- `app/services/zone_service.ts`

## Validators (112)

- `app/validators/access_point.ts`
- `app/validators/address.ts`
- `app/validators/aircraft.ts`
- `app/validators/aircraft_class.ts`
- `app/validators/aircraft_maintenance.ts`
- `app/validators/aircraft_operator.ts`
- `app/validators/aircraft_proceeding_file.ts`
- `app/validators/aircraft_property.ts`
- `app/validators/airport.ts`
- `app/validators/assessment_template.ts`
- `app/validators/assessment_template_dimension.ts`
- `app/validators/branch_office.ts`
- `app/validators/business_unit_competency_level.ts`
- `app/validators/career_path_candidate.ts`
- `app/validators/career_path_template.ts`
- `app/validators/certification.ts`
- `app/validators/competency.ts`
- `app/validators/competency_bracket.ts`
- `app/validators/competency_descriptor.ts`
- `app/validators/customer.ts`
- `app/validators/customer_proceeding_file.ts`
- `app/validators/department.ts`
- `app/validators/department_position.ts`
- `app/validators/employee.ts`
- `app/validators/employee_address.ts`
- `app/validators/employee_annotation.ts`
- `app/validators/employee_assessment.ts`
- `app/validators/employee_bank.ts`
- `app/validators/employee_biometric.ts`
- `app/validators/employee_bonus.ts`
- `app/validators/employee_branch_office.ts`
- `app/validators/employee_certification_list.ts`
- `app/validators/employee_certification_upload.ts`
- `app/validators/employee_children.ts`
- `app/validators/employee_competency_evaluation.ts`
- `app/validators/employee_contract.ts`
- `app/validators/employee_emergency_contact.ts`
- `app/validators/employee_evaluation.ts`
- `app/validators/employee_kpi_evaluation.ts`
- `app/validators/employee_lactation_period.ts`
- `app/validators/employee_lactation_period_evidence.ts`
- `app/validators/employee_medical_condition.ts`
- `app/validators/employee_proceeding_file.ts`
- `app/validators/employee_record.ts`
- `app/validators/employee_shift.ts`
- `app/validators/employee_shift_change.ts`
- `app/validators/employee_spouse.ts`
- `app/validators/employee_supplie.ts`
- `app/validators/employee_supplies_response_contract.ts`
- `app/validators/employee_supply_assignament_photo.ts`
- `app/validators/employee_temporary_assignment.ts`
- `app/validators/employee_zone.ts`
- `app/validators/exception_request.ts`
- `app/validators/flight_attendant.ts`
- `app/validators/flight_attendant_proceeding_file.ts`
- `app/validators/gallery.ts`
- `app/validators/holiday.ts`
- `app/validators/maintenance_expense.ts`
- `app/validators/medical_condition_type.ts`
- `app/validators/medical_condition_type_property.ts`
- `app/validators/medical_condition_type_property_value.ts`
- `app/validators/notice.ts`
- `app/validators/person.ts`
- `app/validators/pilot.ts`
- `app/validators/pilot_proceeding_file.ts`
- `app/validators/position.ts`
- `app/validators/position_approval_history.ts`
- `app/validators/position_assessment_profile.ts`
- `app/validators/position_business_unit_competency_level.ts`
- `app/validators/position_certification_requirement.ts`
- `app/validators/position_kpi.ts`
- `app/validators/position_salary_range.ts`
- `app/validators/position_specific_function.ts`
- `app/validators/position_work_tool.ts`
- `app/validators/proceeding_file.ts`
- `app/validators/proceeding_file_type.ts`
- `app/validators/proceeding_file_type_email.ts`
- `app/validators/proceeding_file_type_property.ts`
- `app/validators/proceeding_file_type_property_value.ts`
- `app/validators/repse_registration.ts`
- `app/validators/repse_specialized_service.ts`
- `app/validators/reservation.ts`
- `app/validators/reservation_leg.ts`
- `app/validators/reservation_note.ts`
- `app/validators/role.ts`
- `app/validators/shift.ts`
- `app/validators/shift_exception.ts`
- `app/validators/shift_for_employees.ts`
- `app/validators/signup.ts`
- `app/validators/supplie.ts`
- `app/validators/supplie_caracteristic.ts`
- `app/validators/supplie_caracteristic_value.ts`
- `app/validators/supply_type.ts`
- `app/validators/supply_value_history.ts`
- `app/validators/system_setting.ts`
- `app/validators/system_setting_email.ts`
- `app/validators/system_setting_employee.ts`
- `app/validators/system_setting_payroll_config.ts`
- `app/validators/system_setting_proceeding_file.ts`
- `app/validators/system_setting_system_module.ts`
- `app/validators/system_setting_trade_name.ts`
- `app/validators/user.ts`
- `app/validators/user_fcm_token.ts`
- `app/validators/user_responsible_employee.ts`
- `app/validators/vacation_authorization_signatures.ts`
- `app/validators/vacation_deduction.ts`
- `app/validators/vacations.ts`
- `app/validators/work_disability.ts`
- `app/validators/work_disability_note.ts`
- `app/validators/work_disability_period.ts`
- `app/validators/work_disability_period_expense.ts`
- `app/validators/zone.ts`

## Middlewares (7)

- `app/middleware/auth_middleware.ts`
- `app/middleware/basic_auth_middleware.ts`
- `app/middleware/business_unit_scope_middleware.ts`
- `app/middleware/business_unit_scope_optional_middleware.ts`
- `app/middleware/container_bindings_middleware.ts`
- `app/middleware/detect_user_locale_middleware.ts`
- `app/middleware/force_json_response_middleware.ts`

## Seeders (31)

- `database/seeders/0001_business_unit_seeder.ts`
- `database/seeders/0002_bank_seeder.ts`
- `database/seeders/0003_department_generic_seeder.ts`
- `database/seeders/0004_position_seeder.ts`
- `database/seeders/0005_department_position_seeder.ts`
- `database/seeders/0006_role_seeder.ts`
- `database/seeders/0007_person_seeder.ts`
- `database/seeders/0008_user_seeder.ts`
- `database/seeders/0009_employee_contract_type_seeder.ts`
- `database/seeders/0010_employee_record_property_seeder.ts`
- `database/seeders/0011_employee_type_seeder.ts`
- `database/seeders/0012_exception_type_seeder.ts`
- `database/seeders/0013_icon_seeder.ts`
- `database/seeders/0014_insurance_coverage_type_seeder.ts`
- `database/seeders/0015_medical_condition_type_seeder.ts`
- `database/seeders/0016_shift_seeder.ts`
- `database/seeders/0017_system_module_seeder.ts`
- `database/seeders/0018_system_permission_seeder.ts`
- `database/seeders/0019_system_setting_seeder.ts`
- `database/seeders/0020_tolerance_seeder.ts`
- `database/seeders/0021_vacation_setting_seeder.ts`
- `database/seeders/0022_work_disability_type_seeder.ts`
- `database/seeders/0023_address_type_seeder.ts`
- `database/seeders/0024_weights_seeder.ts`
- `database/seeders/0025_career_path_override_reasons_seeder.ts`
- `database/seeders/0027_certification_category_seeder.ts`
- `database/seeders/0028_lactation_exception_type_seeder.ts`
- `database/seeders/0028_working_time_rule_seeder.ts`
- `database/seeders/0032_system_feature_seeder.ts`
- `database/seeders/0033_regulation_clause_feature_baseline_seeder.ts`
- `database/seeders/0034_working_time_overrides_module_seeder.ts`

## Tablas migradas (179)

- `access_point_employees`
- `access_points`
- `address_types`
- `addresses`
- `aircraft_classes`
- `aircraft_maintenance_statuses`
- `aircraft_maintenances`
- `aircraft_operators`
- `aircraft_pilots`
- `aircraft_proceeding_files`
- `aircraft_properties`
- `aircrafts`
- `airports`
- `api_tokens`
- `asignaciones_contrato_especializado`
- `assessment_template_dimensions`
- `assessment_templates`
- `assists`
- `attendance_fault_hr_notification_logs`
- `banks`
- `branch_offices`
- `business_unit_certifications`
- `business_unit_competency_levels`
- `business_unit_users`
- `business_units`
- `career_path_candidate_status_histories`
- `career_path_candidates`
- `career_path_override_reasons`
- `career_path_templates`
- `certification_categories`
- `certifications`
- `clausulas_15d`
- `competencies`
- `competency_brackets`
- `competency_descriptors`
- `competency_level_descriptions`
- `competency_levels`
- `contrato_servicio_repse`
- `contratos_servicios_especializados`
- `customer_proceeding_files`
- `customers`
- `department_position`
- `departments`
- `documentos_contrato_especializado`
- `employee_address`
- `employee_annotations`
- `employee_assist_calendars`
- `employee_banks`
- `employee_biometric_face_ids`
- `employee_biometrics`
- `employee_bonuses`
- `employee_branch_offices`
- `employee_certifications`
- `employee_children`
- `employee_competency_evaluations`
- `employee_contract_types`
- `employee_contracts`
- `employee_devices`
- `employee_emergency_contacts`
- `employee_evaluations`
- `employee_kpi_evaluations`
- `employee_lactation_period_evidences`
- `employee_lactation_periods`
- `employee_medical_conditions`
- `employee_proceeding_files`
- `employee_proceeding_files_types`
- `employee_psychometric_evaluation_results`
- `employee_psychometric_evaluations`
- `employee_record_properties`
- `employee_records`
- `employee_salary_history`
- `employee_shift_changes`
- `employee_shifts`
- `employee_spouses`
- `employee_supplie_assignation_photos`
- `employee_supplies`
- `employee_supplies_response_contracts`
- `employee_temporary_assignments`
- `employee_types`
- `employee_vacation_archive_content_shift_exceptions`
- `employee_vacation_archive_contents`
- `employee_vacation_archive_shift_exceptions`
- `employee_vacation_archives`
- `employee_zones`
- `employees`
- `empresas_contratantes`
- `exception_requests`
- `exception_types`
- `flight_attendant_proceeding_files`
- `flight_attendants`
- `galleries`
- `holidays`
- `icons`
- `insurance_coverage_types`
- `labor_law_hours`
- `maintenance_expense_categories`
- `maintenance_expenses`
- `maintenance_types`
- `maintenance_urgency_levels`
- `medical_condition_type_properties`
- `medical_condition_type_property_values`
- `medical_condition_types`
- `notice_files`
- `notice_recipients`
- `notices`
- `page_syncs`
- `passkey_credentials`
- `people`
- `pilot_proceeding_files`
- `pilots`
- `position_approval_histories`
- `position_assessment_profiles`
- `position_business_unit_competency_levels`
- `position_certification_requirements`
- `position_competencies`
- `position_competency_levels`
- `position_kpis`
- `position_psychometric_profiles`
- `position_salary_range_audit`
- `position_salary_ranges`
- `position_specific_functions`
- `position_work_tools`
- `positions`
- `proceeding_file_has_status`
- `proceeding_file_status`
- `proceeding_file_type_emails`
- `proceeding_file_type_properties`
- `proceeding_file_type_property_values`
- `proceeding_file_types`
- `proceeding_files`
- `psychometric_test_dimensions`
- `psychometric_tests`
- `regulation_clause_features`
- `rename_page_syncs`
- `rename_status_syncs`
- `repse_registrations`
- `repse_specialized_services`
- `reservation_legs`
- `reservation_notes`
- `reservations`
- `role_departments`
- `role_system_permissions`
- `roles`
- `shift_exception_evidences`
- `shift_exceptions`
- `shifts`
- `signup_drafts`
- `status_syncs`
- `supplie_caracteristic_values`
- `supplie_caracteristics`
- `supplies`
- `supply_types`
- `supply_value_histories`
- `system_features`
- `system_modules`
- `system_permissions`
- `system_setting_notification_emails`
- `system_setting_payroll_configs`
- `system_setting_proceeding_files`
- `system_setting_system_modules`
- `system_setting_trade_names`
- `system_settings`
- `system_settings_employees`
- `tolerances`
- `user_fcm_tokens`
- `user_responsible_employees`
- `users`
- `vacation_authorization_signatures`
- `vacation_deductions`
- `vacation_settings`
- `versiones_contrato_especializado`
- `weights`
- `work_disabilities`
- `work_disability_notes`
- `work_disability_period_expenses`
- `work_disability_periods`
- `work_disability_types`
- `working_time_rules`
- `zones`

## i18n keys (top-level)

### Idioma `en` (1195 claves totales)

- `validator.shared.messages.required.*` (1 claves)
- `validator.shared.messages.string.*` (1 claves)
- `validator.shared.messages.number.*` (1 claves)
- `validator.shared.messages.boolean.*` (1 claves)
- `validator.shared.messages.email.*` (1 claves)
- `validator.shared.messages.regex.*` (1 claves)
- `validator.shared.messages.url.*` (1 claves)
- `validator.shared.messages.minLength.*` (1 claves)
- `validator.shared.messages.maxLength.*` (1 claves)
- `validator.shared.messages.fixedLength.*` (1 claves)
- `validator.shared.messages.confirmed.*` (1 claves)
- `validator.shared.messages.sameAs.*` (1 claves)
- `validator.shared.messages.notSameAs.*` (1 claves)
- `validator.shared.messages.in.*` (1 claves)
- `validator.shared.messages.notIn.*` (1 claves)
- `validator.shared.messages.min.*` (1 claves)
- `validator.shared.messages.max.*` (1 claves)
- `validator.shared.messages.range.*` (1 claves)
- `validator.shared.messages.positive.*` (1 claves)
- `validator.shared.messages.negative.*` (1 claves)
- `validator.shared.messages.decimal.*` (1 claves)
- `validator.shared.messages.enum.*` (1 claves)
- `validator.shared.messages.literal.*` (1 claves)
- `validator.shared.messages.object.*` (1 claves)
- `validator.shared.messages.array.*` (1 claves)
- `validator.shared.messages.array.minLength.*` (1 claves)
- `validator.shared.messages.array.maxLength.*` (1 claves)
- `validator.shared.messages.array.fixedLength.*` (1 claves)
- `validator.shared.messages.notEmpty.*` (1 claves)
- `validator.shared.messages.distinct.*` (1 claves)
- `validator.shared.messages.date.*` (1 claves)
- `validator.shared.messages.date.equals.*` (1 claves)
- `validator.shared.messages.date.after.*` (1 claves)
- `validator.shared.messages.date.before.*` (1 claves)
- `validator.shared.messages.date.afterOrEqual.*` (1 claves)
- `validator.shared.messages.date.beforeOrEqual.*` (1 claves)
- `validator.shared.messages.date.sameAs.*` (1 claves)
- `validator.shared.messages.date.notSameAs.*` (1 claves)
- `validator.shared.messages.date.afterField.*` (1 claves)
- `validator.shared.messages.date.afterOrSameAs.*` (1 claves)
- `validator.shared.messages.date.beforeField.*` (1 claves)
- `validator.shared.messages.date.beforeOrSameAs.*` (1 claves)
- `validator.shared.messages.date.weekend.*` (1 claves)
- `validator.shared.messages.date.weekday.*` (1 claves)
- `repse_registrations_title.*` (1 claves)
- `repse_registration_title.*` (1 claves)
- `repse_registrations_listed_successfully.*` (1 claves)
- `repse_registration_found_successfully.*` (1 claves)
- `repse_registration_created_successfully.*` (1 claves)
- `repse_registration_updated_successfully.*` (1 claves)
- `repse_registration_deleted_successfully.*` (1 claves)
- `repse_error_default_title.*` (1 claves)
- `repse_unauthorized_title.*` (1 claves)
- `repse_unauthorized_message.*` (1 claves)
- `repse_val_input_title.*` (1 claves)
- `repse_val_input_message.*` (1 claves)
- `repse_folio_duplicate_title.*` (1 claves)
- `repse_folio_duplicate_message.*` (1 claves)
- `repse_business_unit_not_found_title.*` (1 claves)
- `repse_business_unit_not_found_message.*` (1 claves)
- `repse_not_found_title.*` (1 claves)
- `repse_not_found_message.*` (1 claves)
- `repse_dates_invalid_title.*` (1 claves)
- `repse_dates_invalid_message.*` (1 claves)
- `repse_dates_range_invalid_message.*` (1 claves)
- `repse_unexpected_error_message.*` (1 claves)
- `repse_specialized_services_title.*` (1 claves)
- `repse_specialized_service_title.*` (1 claves)
- `repse_specialized_services_listed_successfully.*` (1 claves)
- `repse_specialized_service_found_successfully.*` (1 claves)
- `repse_specialized_service_created_successfully.*` (1 claves)
- `repse_specialized_service_updated_successfully.*` (1 claves)
- `repse_specialized_service_deleted_successfully.*` (1 claves)
- `repse_specialized_service_error_default_title.*` (1 claves)
- `repse_specialized_service_unauthorized_title.*` (1 claves)
- `repse_specialized_service_unauthorized_message.*` (1 claves)
- `repse_specialized_service_val_input_title.*` (1 claves)
- `repse_specialized_service_val_input_message.*` (1 claves)
- `repse_specialized_service_not_found_title.*` (1 claves)
- `repse_specialized_service_not_found_message.*` (1 claves)
- `repse_specialized_service_parent_not_found_title.*` (1 claves)
- `repse_specialized_service_parent_not_found_message.*` (1 claves)
- `repse_specialized_service_name_duplicate_title.*` (1 claves)
- `repse_specialized_service_name_duplicate_message.*` (1 claves)
- `repse_specialized_service_linked_contratos_title.*` (1 claves)
- `repse_specialized_service_linked_contratos_message.*` (1 claves)
- `repse_specialized_service_unexpected_error_message.*` (1 claves)
- `empresas_contratantes_title.*` (1 claves)
- `empresa_contratante_title.*` (1 claves)
- `empresas_contratantes_listed_successfully.*` (1 claves)
- `empresa_contratante_found_successfully.*` (1 claves)
- `empresa_contratante_created_successfully.*` (1 claves)
- `empresa_contratante_updated_successfully.*` (1 claves)
- `empresa_contratante_deleted_successfully.*` (1 claves)
- `empresa_contratante_error_default_title.*` (1 claves)
- `empresa_contratante_unauthorized_title.*` (1 claves)
- `empresa_contratante_unauthorized_message.*` (1 claves)
- `empresa_contratante_val_input_title.*` (1 claves)
- `empresa_contratante_val_input_message.*` (1 claves)
- `empresa_contratante_rfc_invalid_title.*` (1 claves)
- `empresa_contratante_rfc_invalid_message.*` (1 claves)
- `empresa_contratante_rfc_duplicate_title.*` (1 claves)
- `empresa_contratante_rfc_duplicate_message.*` (1 claves)
- `empresa_contratante_not_found_title.*` (1 claves)
- `empresa_contratante_not_found_message.*` (1 claves)
- `empresa_contratante_business_unit_not_found_title.*` (1 claves)
- `empresa_contratante_business_unit_not_found_message.*` (1 claves)
- `empresa_contratante_forbidden_title.*` (1 claves)
- `empresa_contratante_forbidden_message.*` (1 claves)
- `empresa_contratante_unexpected_error_message.*` (1 claves)
- `empresa_contratante_contratos_activos_title.*` (1 claves)
- `empresa_contratante_contratos_activos_message.*` (1 claves)
- `contratos_servicios_especializados_title.*` (1 claves)
- `contrato_servicio_especializado_title.*` (1 claves)
- `contratos_servicios_especializados_listed_successfully.*` (1 claves)
- `contrato_servicio_especializado_found_successfully.*` (1 claves)
- `contrato_servicio_especializado_created_successfully.*` (1 claves)
- `contrato_servicio_especializado_updated_successfully.*` (1 claves)
- `contrato_servicio_especializado_error_default_title.*` (1 claves)
- `contrato_servicio_especializado_unauthorized_title.*` (1 claves)
- `contrato_servicio_especializado_unauthorized_message.*` (1 claves)
- `contrato_servicio_especializado_val_input_title.*` (1 claves)
- `contrato_servicio_especializado_val_input_message.*` (1 claves)
- `contrato_servicio_especializado_val_fechas_title.*` (1 claves)
- `contrato_servicio_especializado_val_fechas_message.*` (1 claves)
- `contrato_servicio_especializado_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_contratante_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_contratante_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_repse_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_repse_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_numero_duplicate_title.*` (1 claves)
- `contrato_servicio_especializado_numero_duplicate_message.*` (1 claves)
- `contrato_servicio_especializado_servicios_registrados_requeridos_title.*` (1 claves)
- `contrato_servicio_especializado_servicios_registrados_requeridos_message.*` (1 claves)
- `contrato_servicio_especializado_servicio_registrado_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_servicio_registrado_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_forbidden_title.*` (1 claves)
- `contrato_servicio_especializado_forbidden_message.*` (1 claves)
- `contrato_servicio_especializado_unexpected_error_message.*` (1 claves)
- `version_contrato_especializado_title.*` (1 claves)
- `version_contrato_especializado_renewed_successfully.*` (1 claves)
- `version_contrato_especializado_addendum_successfully.*` (1 claves)
- `version_contrato_especializado_list_successfully.*` (1 claves)
- `version_contrato_especializado_found_successfully.*` (1 claves)
- `version_contrato_especializado_error_default_title.*` (1 claves)
- `version_contrato_especializado_unauthorized_title.*` (1 claves)
- `version_contrato_especializado_unauthorized_message.*` (1 claves)
- `version_contrato_especializado_val_input_title.*` (1 claves)
- `version_contrato_especializado_val_input_message.*` (1 claves)
- `version_contrato_especializado_addendum_invalid_title.*` (1 claves)
- `version_contrato_especializado_addendum_invalid_message.*` (1 claves)
- `version_contrato_especializado_val_vigencia_title.*` (1 claves)
- `version_contrato_especializado_val_vigencia_message.*` (1 claves)
- `version_contrato_especializado_contrato_not_found_title.*` (1 claves)
- `version_contrato_especializado_contrato_not_found_message.*` (1 claves)
- `version_contrato_especializado_version_not_found_title.*` (1 claves)
- `version_contrato_especializado_version_not_found_message.*` (1 claves)
- `version_contrato_especializado_not_renewable_title.*` (1 claves)
- `version_contrato_especializado_not_renewable_message.*` (1 claves)
- `version_contrato_especializado_not_addendable_title.*` (1 claves)
- `version_contrato_especializado_not_addendable_message.*` (1 claves)
- `version_contrato_especializado_snapshot_incomplete_title.*` (1 claves)
- `version_contrato_especializado_snapshot_incomplete_message.*` (1 claves)
- `version_contrato_especializado_immutable_title.*` (1 claves)
- `version_contrato_especializado_immutable_message.*` (1 claves)
- `version_contrato_especializado_forbidden_read_title.*` (1 claves)
- `version_contrato_especializado_forbidden_read_message.*` (1 claves)
- `asignacion_contrato_especializado_title.*` (1 claves)
- `asignacion_contrato_especializado_created_successfully.*` (1 claves)
- `asignacion_contrato_especializado_listed_successfully.*` (1 claves)
- `asignacion_contrato_especializado_updated_successfully.*` (1 claves)
- `asignacion_contrato_especializado_error_default_title.*` (1 claves)
- `asignacion_contrato_especializado_unauthorized_title.*` (1 claves)
- `asignacion_contrato_especializado_unauthorized_message.*` (1 claves)
- `asignacion_contrato_val_input_title.*` (1 claves)
- `asignacion_contrato_val_input_message.*` (1 claves)
- `asignacion_contrato_val_employee_duplicate_title.*` (1 claves)
- `asignacion_contrato_val_employee_duplicate_message.*` (1 claves)
- `asignacion_contrato_val_fechas_title.*` (1 claves)
- `asignacion_contrato_val_fechas_message.*` (1 claves)
- `asignacion_contrato_not_found_title.*` (1 claves)
- `asignacion_contrato_not_found_message.*` (1 claves)
- `asignacion_contrato_employee_not_found_title.*` (1 claves)
- `asignacion_contrato_employee_not_found_message.*` (1 claves)
- `asignacion_contrato_contrato_no_vigente_title.*` (1 claves)
- `asignacion_contrato_contrato_no_vigente_message.*` (1 claves)
- `asignacion_contrato_fuera_de_vigencia_title.*` (1 claves)
- `asignacion_contrato_fuera_de_vigencia_message.*` (1 claves)
- `asignacion_contrato_duplicada_title.*` (1 claves)
- `asignacion_contrato_duplicada_message.*` (1 claves)
- `asignacion_contrato_forbidden_title.*` (1 claves)
- `asignacion_contrato_forbidden_message.*` (1 claves)
- `asignacion_contrato_unexpected_error_message.*` (1 claves)
- `version_contrato_especializado_forbidden_write_title.*` (1 claves)
- `version_contrato_especializado_forbidden_write_message.*` (1 claves)
- `version_contrato_especializado_unexpected_error_message.*` (1 claves)
- `address.*` (1 claves)
- `the_address.*` (1 claves)
- `address_type.*` (1 claves)
- `employee.*` (1 claves)
- `department.*` (1 claves)
- `departments.*` (1 claves)
- `zone.*` (1 claves)
- `zones.*` (1 claves)
- `position.*` (1 claves)
- `assist.*` (1 claves)
- `assist_register.*` (1 claves)
- `report_type.*` (1 claves)
- `date.*` (1 claves)
- `name.*` (1 claves)
- `email.*` (1 claves)
- `user.*` (1 claves)
- `customer.*` (1 claves)
- `pilot.*` (1 claves)
- `flight_attendant.*` (1 claves)
- `shift.*` (1 claves)
- `code.*` (1 claves)
- `bank.*` (1 claves)
- `resource.*` (1 claves)
- `resources.*` (1 claves)
- `created.*` (1 claves)
- `updated.*` (1 claves)
- `resource_was_created_successfully.*` (1 claves)
- `resource_was_updated_successfully.*` (1 claves)
- `resource_was_deleted_successfully.*` (1 claves)
- `resource_was_found_successfully.*` (1 claves)
- `resource_was_not_found.*` (1 claves)
- `resource_was_not_found_with_the_entered_id.*` (1 claves)
- `resource_id_was_not_found.*` (1 claves)
- `entity_id_was_not_found.*` (1 claves)
- `resources_were_found_successfully.*` (1 claves)
- `entity_was_not_found_with_entered_id.*` (1 claves)
- `entity_was_not_found.*` (1 claves)
- `entity_is_not_valid.*` (1 claves)
- `entity_resource_cannot_be.*` (1 claves)
- `because_the_entity_is_not_valid.*` (1 claves)
- `because_the_value_of_entity_is_not_valid.*` (1 claves)
- `because_the_value_of_entity_is_already_assigned_to_another_register.*` (1 claves)
- `because_the_relation_is_already_assigned_to_another_register.*` (1 claves)
- `param_was_already_assigned_in_entity.*` (1 claves)
- `because_the_param_was_already_assigned_in_entity.*` (1 claves)
- `the_value_of_entity_already_exists_for_another_register.*` (1 claves)
- `server_error.*` (1 claves)
- `an_unexpected_error_has_occurred_on_the_server.*` (1 claves)
- `an_unexpected_error_has_occurred_on_the_server_buffer_not_found.*` (1 claves)
- `missing_data_to_process.*` (1 claves)
- `id_was_not_found.*` (1 claves)
- `was_not_found.*` (1 claves)
- `was_not_found_with_the_entered_id.*` (1 claves)
- `the_address_was_created_successfully.*` (1 claves)
- `the_address_was_updated_successfully.*` (1 claves)
- `the_address_was_not_found_with_the_entered_id.*` (1 claves)
- `the_address_was_not_found.*` (1 claves)
- `the_address_places_were_found_successfully.*` (1 claves)
- `address_types.*` (1 claves)
- `were_found_successfully.*` (1 claves)
- `info_verify_successfully.*` (1 claves)
- `successfully_fetched.*` (1 claves)
- `resources_fetched.*` (1 claves)
- `resource_fetched.*` (1 claves)
- `upload_error.*` (1 claves)
- `failed_to_upload_file_to_s3.*` (1 claves)
- `successfully_action.*` (1 claves)
- `resource_created.*` (1 claves)
- `validation_error.*` (1 claves)
- `invalid_input_validation_error_400.*` (1 claves)
- `not_found.*` (1 claves)
- `resource_not_found.*` (1 claves)
- `no_data.*` (1 claves)
- `resource_deleted.*` (1 claves)
- `resource_updated.*` (1 claves)
- `aircraft_maintenances.*` (1 claves)
- `reservations.*` (1 claves)
- `reservation_created_successfully.*` (1 claves)
- `the_aircraft_maintenance.*` (1 claves)
- `aircraft_maintenance_not_found_with_entered_id.*` (1 claves)
- `aircraft_maintenance.*` (1 claves)
- `was_found_successfully.*` (1 claves)
- `maintenance_type.*` (1 claves)
- `aircraft_maintenance_status.*` (1 claves)
- `aircraft_maintenance_urgency_level.*` (1 claves)
- `start_date.*` (1 claves)
- `already_exist_maintenance_in_the_same_date.*` (1 claves)
- `start_date_is_after_end_date.*` (1 claves)
- `aircraft_maintenance_statuses.*` (1 claves)
- `aircraft_operators.*` (1 claves)
- `the_aircraft_operators.*` (1 claves)
- `the_aircraft_operator.*` (1 claves)
- `the_operator.*` (1 claves)
- `please_upload_a_image_valid.*` (1 claves)
- `aircraft.*` (1 claves)
- `unknown_error.*` (1 claves)
- `the_assist_was_inactivate_successfully.*` (1 claves)
- `the_date_not_is_pay_thursday.*` (1 claves)
- `assistance_report.*` (1 claves)
- `incident_summary.*` (1 claves)
- `incident_summary_payroll.*` (1 claves)
- `incidents.*` (1 claves)
- `summary_report.*` (1 claves)
- `shift_assigned.*` (1 claves)
- `shift_start_date.*` (1 claves)
- `shift_ends_date.*` (1 claves)
- `check_in.*` (1 claves)
- `check_go_eat.*` (1 claves)
- `check_back_from_eat.*` (1 claves)
- `check_out.*` (1 claves)
- `hours_worked.*` (1 claves)
- `status.*` (1 claves)
- `exception_notes.*` (1 claves)
- `on_time.*` (1 claves)
- `ontime.*` (1 claves)
- `tolerances.*` (1 claves)
- `delays.*` (1 claves)
- `faults.*` (1 claves)
- `early_outs.*` (1 claves)
- `arrivals.*` (1 claves)
- `absences.*` (1 claves)
- `fault.*` (1 claves)
- `rest.*` (1 claves)
- `exception.*` (1 claves)
- `holiday.*` (1 claves)
- `delay.*` (1 claves)
- `tolerance.*` (1 claves)
- `vacations.*` (1 claves)
- `days_worked.*` (1 claves)
- `rests.*` (1 claves)
- `sunday_bonus.*` (1 claves)
- `exceptions.*` (1 claves)
- `holidays_worked.*` (1 claves)
- `rest_worked.*` (1 claves)
- `delays_faults.*` (1 claves)
- `early_outs_faults.*` (1 claves)
- `total_faults.*` (1 claves)
- `total_hours_worked.*` (1 claves)
- `report.*` (1 claves)
- `totals.*` (1 claves)
- `vacation_day.*` (1 claves)
- `next.*` (1 claves)
- `company.*` (1 claves)
- `leaves.*` (1 claves)
- `double_overtime_hours.*` (1 claves)
- `triple_overtime_hours.*` (1 claves)
- `sunday_bonus_abb.*` (1 claves)
- `rest_day_worked.*` (1 claves)
- `vacation_bonus.*` (1 claves)
- `leveling.*` (1 claves)
- `bonus.*` (1 claves)
- `employee_bonuses.*` (1 claves)
- `cannot_modify_past_bonus.*` (1 claves)
- `others.*` (1 claves)
- `to.*` (1 claves)
- `from.*` (1 claves)
- `relation_of.*` (1 claves)
- `proceeding_files.*` (1 claves)
- `proceeding_file.*` (1 claves)
- `entity_have_been_synchronized_successfully.*` (1 claves)
- `no_data_found_to_synchronize.*` (1 claves)
- `sync_entity.*` (1 claves)
- `the_positions_by_department_have_been_sync_successfully.*` (1 claves)
- `all_positions_have_been_found_successfully.*` (1 claves)
- `the_positions_by_department_have_been_found_successfully.*` (1 claves)
- `rotation_index_by_department.*` (1 claves)
- `the_rotation_index_by_department_has_calculate_successfully.*` (1 claves)
- `department_has_related_employees.*` (1 claves)
- `the_department_cannot_be_deleted_because_it_has_related_employees.*` (1 claves)
- `the_department_its_related_positions_and_employees_were_reassigned_successfully_and_the_department_was_soft_deleted.*` (1 claves)
- `not_access.*` (1 claves)
- `the_shift_was_assign_to_department_successfully.*` (1 claves)
- `the_relation_department_position_has_employees.*` (1 claves)
- `the_relation_department_position_has_employees_assigned.*` (1 claves)
- `the_departments_and_positions_were_created_successfully.*` (1 claves)
- `the_information_was_created_successfully.*` (1 claves)
- `information.*` (1 claves)
- `notice.*` (1 claves)
- `notice_sent_successfully.*` (1 claves)
- `sent.*` (1 claves)
- `failed.*` (1 claves)
- `new_notice.*` (1 claves)
- `assessment_template.*` (1 claves)
- `assessment_templates.*` (1 claves)
- `assessment_template_no_permission_to_toggle_status.*` (1 claves)
- `user_unauthorized.*` (1 claves)
- `assessment_template_dimension.*` (1 claves)
- `assessment_template_dimensions.*` (1 claves)
- `assessment_template_dimension_data_type_invalid.*` (1 claves)
- `assessment_template_dimension_reorder_out_of_template.*` (1 claves)
- `assessment_template_dimension_reorder_duplicated_indexes.*` (1 claves)
- `position_assessment_profile_coherence_range_required_for_numeric.*` (1 claves)
- `position_assessment_profile_coherence_range_required_for_percent.*` (1 claves)
- `position_assessment_profile_coherence_range_min_greater_than_max.*` (1 claves)
- `position_assessment_profile_coherence_percent_out_of_bounds.*` (1 claves)
- `position_assessment_profile_coherence_expected_value_required.*` (1 claves)
- `position_assessment_profile_coherence_expected_value_not_allowed.*` (1 claves)
- `position_assessment_profile_coherence_range_not_allowed_for_categorical.*` (1 claves)
- `position_assessment_profile_coherence_categorical_value_invalid.*` (1 claves)
- `position_assessment_profile_coherence_data_type_unknown.*` (1 claves)
- `employee_assessment_result_coherence_numeric_value_required.*` (1 claves)
- `employee_assessment_result_coherence_percent_value_out_of_bounds.*` (1 claves)
- `employee_assessment_result_coherence_categorical_value_mismatch_enum.*` (1 claves)
- `employee_assessment_result_coherence_dimension_not_found.*` (1 claves)
- `position_assessment_profile.*` (1 claves)
- `position_assessment_profiles.*` (1 claves)
- `employee_evaluation_already_exists.*` (1 claves)
- `employee_evaluation_already_exists_with_entered_date.*` (1 claves)
- `employee_assessment.*` (1 claves)
- `employee_assessments.*` (1 claves)
- `employee_assessment_result.*` (1 claves)
- `employee_assessment_results.*` (1 claves)
- `employee_assessment_date_cannot_be_in_future.*` (1 claves)
- `employee_assessment_already_exists_for_date.*` (1 claves)
- `position_work_tool.*` (1 claves)
- `position_work_tools.*` (1 claves)
- `competency.*` (1 claves)
- `competencies.*` (1 claves)
- `competency_level.*` (1 claves)
- `competency_levels.*` (1 claves)
- `competency_level_in_development.*` (1 claves)
- `competency_level_capable.*` (1 claves)
- `competency_level_expert.*` (1 claves)
- `competency_level_description.*` (1 claves)
- `position_competency_level.*` (1 claves)
- `position_competency_levels.*` (1 claves)
- `resource_already_exists.*` (1 claves)
- `profile_position.*` (45 claves)
- `monthly_conversion_factor.*` (1 claves)
- `monthly_conversion_factor_helper.*` (1 claves)
- `monthly_conversion_factor_invalid.*` (1 claves)
- `the_origin_and_target_positions_cannot_be_the_same.*` (1 claves)
- `origin.*` (1 claves)
- `target.*` (1 claves)
- `the_origin_and_target_positions_do_not_exist_in_the_current_template.*` (1 claves)
- `the_override_reason_is_required.*` (1 claves)
- `the_justification_must_be_at_least_20_characters.*` (1 claves)
- `the_limit_of_candidates_has_been_exceeded.*` (1 claves)
- `the_user_is_not_the_direct_boss_of_the_employee.*` (1 claves)
- `rejection_reason_required.*` (1 claves)
- `invalid_transition.*` (1 claves)
- `invalid_transition_from_rejected_to_active.*` (1 claves)
- `invalid_transition_from_desactivated_to_active.*` (1 claves)
- `invalid_transition_from_any_status_to_other_status.*` (1 claves)
- `the_limit_of_candidates_active_has_been_exceeded.*` (1 claves)
- `career_path_candidate_email_title.*` (1 claves)
- `career_path_candidate_email_greeting.*` (1 claves)
- `career_path_candidate_email_body.*` (1 claves)
- `career_path_candidate_email_label_candidate.*` (1 claves)
- `career_path_candidate_email_label_origin_position.*` (1 claves)
- `career_path_candidate_email_label_target_position.*` (1 claves)
- `career_path_candidate_email_label_status.*` (1 claves)
- `career_path_candidate_email_label_rejection_reason.*` (1 claves)
- `career_path_candidate_email_footer.*` (1 claves)
- `career_path_candidate_email_subject.*` (1 claves)
- `career_path_candidate_status_approved.*` (1 claves)
- `career_path_candidate_status_rejected.*` (1 claves)
- `salary_history.*` (1 claves)
- `salary_history_empty.*` (1 claves)
- `salary_daily.*` (1 claves)
- `salary_monthly_equivalent.*` (1 claves)
- `valid_from.*` (1 claves)
- `valid_to.*` (1 claves)
- `current.*` (1 claves)
- `changed_by.*` (1 claves)
- `salary_change_reason.*` (1 claves)
- `salary_change_reason_placeholder.*` (1 claves)
- `salary_history_not_found.*` (1 claves)
- `salary_history_found.*` (1 claves)
- `salary_history_employee_not_found.*` (1 claves)
- `org_chart_move_forbidden.*` (1 claves)
- `org_chart_move_parent_department_not_found.*` (1 claves)
- `org_chart_move_parent_position_not_found.*` (1 claves)
- `org_chart_move_department_self_parent.*` (1 claves)
- `org_chart_move_department_self_parent_detail.*` (1 claves)
- `org_chart_move_department_invalid_special.*` (1 claves)
- `org_chart_move_department_invalid_special_detail.*` (1 claves)
- `org_chart_move_department_root_locked.*` (1 claves)
- `org_chart_move_department_root_locked_detail.*` (1 claves)
- `org_chart_move_department_parent_inactive.*` (1 claves)
- `org_chart_move_department_parent_inactive_detail.*` (1 claves)
- `org_chart_move_department_business_unit.*` (1 claves)
- `org_chart_move_department_business_unit_detail.*` (1 claves)
- `org_chart_move_department_cycle_message.*` (1 claves)
- `org_chart_move_department_cycle_detail.*` (1 claves)
- `org_chart_move_position_self_parent.*` (1 claves)
- `org_chart_move_position_self_parent_detail.*` (1 claves)
- `org_chart_move_position_department_required.*` (1 claves)
- `org_chart_move_position_department_required_detail.*` (1 claves)
- `org_chart_move_position_invalid_department_special_detail.*` (1 claves)
- `org_chart_move_position_department_inactive_detail.*` (1 claves)
- `org_chart_move_position_business_unit_detail.*` (1 claves)
- `org_chart_move_position_parent_inactive.*` (1 claves)
- `org_chart_move_position_parent_inactive_detail.*` (1 claves)
- `org_chart_move_position_parent_not_in_department.*` (1 claves)
- `org_chart_move_position_parent_not_in_department_detail.*` (1 claves)
- `org_chart_move_position_parent_dept_detail.*` (1 claves)
- `org_chart_move_position_parent_bu_detail.*` (1 claves)
- `org_chart_move_position_no_department_link.*` (1 claves)
- `org_chart_move_position_no_department_link_detail.*` (1 claves)
- `org_chart_move_position_cycle_message.*` (1 claves)
- `org_chart_move_position_cycle_detail.*` (1 claves)
- `org_chart_hierarchy_invalid_title.*` (1 claves)
- `org_chart_hierarchy_cycle_detail_departments.*` (1 claves)
- `org_chart_hierarchy_cycle_detail_positions.*` (1 claves)
- `org_chart_parent_department_missing_title.*` (1 claves)
- `org_chart_parent_department_missing_detail.*` (1 claves)
- `org_chart_parent_department_inactive_message.*` (1 claves)
- `org_chart_parent_inactive_title.*` (1 claves)
- `org_chart_scope_mismatch_title.*` (1 claves)
- `org_chart_department_company_mismatch_message.*` (1 claves)
- `org_chart_department_company_mismatch_detail.*` (1 claves)
- `org_chart_parent_position_missing_title.*` (1 claves)
- `org_chart_parent_position_missing_detail.*` (1 claves)
- `org_chart_position_company_mismatch_message.*` (1 claves)
- `org_chart_position_company_mismatch_detail.*` (1 claves)
- `org_chart_position_parent_company_mismatch_detail.*` (1 claves)
- `org_chart_position_department_consistency_title.*` (1 claves)
- `org_chart_position_department_consistency_message.*` (1 claves)
- `org_chart_position_department_consistency_detail.*` (1 claves)
- `company_competency_level.*` (1 claves)
- `label.*` (1 claves)
- `the_number_of_levels_must_be_between_3_and_5.*` (1 claves)
- `business_unit_competency_level.*` (1 claves)
- `the_range_min_must_be_less_than_the_range_max.*` (1 claves)
- `competency_descriptor.*` (1 claves)
- `employee_lactation_period.*` (1 claves)
- `employee_lactation_periods.*` (1 claves)
- `employee_lactation_period_no_permission.*` (1 claves)
- `employee_lactation_period_employee_not_found.*` (1 claves)
- `employee_lactation_period_period_not_found.*` (1 claves)
- `employee_lactation_period_date_range_invalid.*` (1 claves)
- `employee_lactation_period_unreasonable_range_title.*` (1 claves)
- `employee_lactation_period_unreasonable_range_detail.*` (1 claves)
- `employee_lactation_period_overlap_title.*` (1 claves)
- `employee_lactation_period_overlap_detail.*` (1 claves)
- `repse_registration.*` (1 claves)
- `repse_registrations.*` (1 claves)
- `repse_registration_was_created_successfully.*` (1 claves)
- `repse_registration_was_updated_successfully.*` (1 claves)
- `repse_registration_was_deleted_successfully.*` (1 claves)
- `repse_registration_was_found_successfully.*` (1 claves)
- `repse_registration_folio_already_registered.*` (1 claves)
- `repse_registration_business_unit_not_found.*` (1 claves)
- `repse_registration_dates_invalid.*` (1 claves)
- `repse_registration_not_found.*` (1 claves)
- `employee_lactation_period_below_legal_minimum_title.*` (1 claves)
- `employee_lactation_period_below_legal_minimum_detail.*` (1 claves)
- `employee_lactation_period_exception_type_missing_title.*` (1 claves)
- `employee_lactation_period_exception_type_missing_detail.*` (1 claves)
- `employee_lactation_period_no_active_shift_title.*` (1 claves)
- `employee_lactation_period_no_active_shift_detail.*` (1 claves)
- `employee_lactation_period_shift_exceptions_regenerated.*` (1 claves)
- `employee_lactation_period_evidence.*` (1 claves)
- `employee_lactation_period_evidences.*` (1 claves)
- `employee_lactation_period_evidence_uploaded.*` (1 claves)
- `employee_lactation_period_evidence_deleted.*` (1 claves)
- `employee_lactation_period_evidence_list_empty.*` (1 claves)
- `employee_lactation_period_evidence_file_required_title.*` (1 claves)
- `employee_lactation_period_evidence_file_required_detail.*` (1 claves)
- `employee_lactation_period_evidence_invalid_file_type_title.*` (1 claves)
- `employee_lactation_period_evidence_invalid_file_type_detail.*` (1 claves)
- `employee_lactation_period_evidence_file_too_large_title.*` (1 claves)
- `employee_lactation_period_evidence_file_too_large_detail.*` (1 claves)
- `employee_lactation_period_evidence_invalid_category_title.*` (1 claves)
- `employee_lactation_period_evidence_invalid_category_detail.*` (1 claves)
- `employee_lactation_period_evidence_not_found_title.*` (1 claves)
- `employee_lactation_period_evidence_not_found_detail.*` (1 claves)
- `employee_lactation_period_evidence_upload_failed_title.*` (1 claves)
- `employee_lactation_period_evidence_upload_failed_detail.*` (1 claves)
- `employee_lactation_period_evidence_download_failed_title.*` (1 claves)
- `employee_lactation_period_evidence_download_failed_detail.*` (1 claves)
- `employee_lactation_period_evidence_category_agreement.*` (1 claves)
- `employee_lactation_period_evidence_category_birth_support.*` (1 claves)
- `employee_lactation_period_evidence_category_other.*` (1 claves)
- `employee_lactation_period_type_two_rest_periods.*` (1 claves)
- `employee_lactation_period_type_reduced_hour.*` (1 claves)
- `employee_lactation_reduction_application_start.*` (1 claves)
- `employee_lactation_reduction_application_end.*` (1 claves)
- `employee_lactation_reduction_application_split.*` (1 claves)
- `employee_lactation_compliance_report_title.*` (1 claves)
- `employee_lactation_compliance_report_generated_at.*` (1 claves)
- `employee_lactation_compliance_report_filters.*` (1 claves)
- `employee_lactation_compliance_report_range.*` (1 claves)
- `employee_lactation_compliance_report_status.*` (1 claves)
- `employee_lactation_compliance_report_employee.*` (1 claves)
- `employee_lactation_compliance_report_code.*` (1 claves)
- `employee_lactation_compliance_report_period.*` (1 claves)
- `employee_lactation_compliance_report_duration.*` (1 claves)
- `employee_lactation_compliance_report_type.*` (1 claves)
- `employee_lactation_compliance_report_modality.*` (1 claves)
- `employee_lactation_compliance_report_applied_days.*` (1 claves)
- `employee_lactation_compliance_report_evidences.*` (1 claves)
- `employee_lactation_compliance_report_days.*` (1 claves)
- `employee_lactation_compliance_report_empty.*` (1 claves)
- `employee_lactation_compliance_report_empty_title.*` (1 claves)
- `employee_lactation_compliance_report_subtitle.*` (1 claves)
- `employee_lactation_compliance_report_summary_table.*` (1 claves)
- `employee_lactation_compliance_report_detailed_sections.*` (1 claves)
- `employee_lactation_compliance_report_kpi_total.*` (1 claves)
- `employee_lactation_compliance_report_table_employee.*` (1 claves)
- `employee_lactation_compliance_report_table_applied.*` (1 claves)
- `employee_lactation_compliance_report_table_evid.*` (1 claves)
- `employee_lactation_compliance_report_no_lower_bound.*` (1 claves)
- `employee_lactation_compliance_report_no_upper_bound.*` (1 claves)
- `employee_lactation_compliance_report_legal_basis.*` (1 claves)
- `employee_lactation_compliance_report_range_invalid_title.*` (1 claves)
- `employee_lactation_compliance_report_range_invalid_detail.*` (1 claves)
- `employee_lactation_compliance_status_active.*` (1 claves)
- `employee_lactation_compliance_status_expiring.*` (1 claves)
- `employee_lactation_compliance_status_expired.*` (1 claves)
- `auth.*` (19 claves)
- `attendance_stats_dates_required.*` (1 claves)
- `attendance_stats_invalid_range.*` (1 claves)
- `attendance_stats_invalid_input.*` (1 claves)
- `attendance_stats_scope_required.*` (1 claves)
- `forbidden.*` (1 claves)
- `unauthenticated.*` (1 claves)
- `signup_invalid_data.*` (1 claves)
- `signup_draft_not_found.*` (1 claves)
- `signup_email_not_verified.*` (1 claves)
- `signup_token_invalid.*` (1 claves)
- `signup_email_already_registered.*` (1 claves)
- `signup_account_created.*` (1 claves)
- `signup_otp_sent.*` (1 claves)
- `signup_otp_expired.*` (1 claves)
- `signup_otp_incorrect.*` (1 claves)
- `signup_otp_verified.*` (1 claves)
- `signup_password_min_length.*` (1 claves)
- `signup_password_requires_uppercase.*` (1 claves)
- `signup_password_requires_number.*` (1 claves)
- `signup_password_requires_symbol.*` (1 claves)
- `signup_passwords_do_not_match.*` (1 claves)
- `regulatory.*` (503 claves)

### Idioma `es` (1198 claves totales)

- `validator.shared.messages.required.*` (1 claves)
- `validator.shared.messages.string.*` (1 claves)
- `validator.shared.messages.number.*` (1 claves)
- `validator.shared.messages.boolean.*` (1 claves)
- `validator.shared.messages.email.*` (1 claves)
- `validator.shared.messages.regex.*` (1 claves)
- `validator.shared.messages.url.*` (1 claves)
- `validator.shared.messages.minLength.*` (1 claves)
- `validator.shared.messages.maxLength.*` (1 claves)
- `validator.shared.messages.fixedLength.*` (1 claves)
- `validator.shared.messages.confirmed.*` (1 claves)
- `validator.shared.messages.sameAs.*` (1 claves)
- `validator.shared.messages.notSameAs.*` (1 claves)
- `validator.shared.messages.in.*` (1 claves)
- `validator.shared.messages.notIn.*` (1 claves)
- `validator.shared.messages.min.*` (1 claves)
- `validator.shared.messages.max.*` (1 claves)
- `validator.shared.messages.range.*` (1 claves)
- `validator.shared.messages.positive.*` (1 claves)
- `validator.shared.messages.negative.*` (1 claves)
- `validator.shared.messages.decimal.*` (1 claves)
- `validator.shared.messages.enum.*` (1 claves)
- `validator.shared.messages.literal.*` (1 claves)
- `validator.shared.messages.object.*` (1 claves)
- `validator.shared.messages.array.*` (1 claves)
- `validator.shared.messages.array.minLength.*` (1 claves)
- `validator.shared.messages.array.maxLength.*` (1 claves)
- `validator.shared.messages.array.fixedLength.*` (1 claves)
- `validator.shared.messages.notEmpty.*` (1 claves)
- `validator.shared.messages.distinct.*` (1 claves)
- `validator.shared.messages.date.*` (1 claves)
- `validator.shared.messages.date.equals.*` (1 claves)
- `validator.shared.messages.date.after.*` (1 claves)
- `validator.shared.messages.date.before.*` (1 claves)
- `validator.shared.messages.date.afterOrEqual.*` (1 claves)
- `validator.shared.messages.date.beforeOrEqual.*` (1 claves)
- `validator.shared.messages.date.sameAs.*` (1 claves)
- `validator.shared.messages.date.notSameAs.*` (1 claves)
- `validator.shared.messages.date.afterField.*` (1 claves)
- `validator.shared.messages.date.afterOrSameAs.*` (1 claves)
- `validator.shared.messages.date.beforeField.*` (1 claves)
- `validator.shared.messages.date.beforeOrSameAs.*` (1 claves)
- `validator.shared.messages.date.weekend.*` (1 claves)
- `validator.shared.messages.date.weekday.*` (1 claves)
- `repse_registrations_title.*` (1 claves)
- `repse_registration_title.*` (1 claves)
- `repse_registrations_listed_successfully.*` (1 claves)
- `repse_registration_found_successfully.*` (1 claves)
- `repse_registration_created_successfully.*` (1 claves)
- `repse_registration_updated_successfully.*` (1 claves)
- `repse_registration_deleted_successfully.*` (1 claves)
- `repse_error_default_title.*` (1 claves)
- `repse_unauthorized_title.*` (1 claves)
- `repse_unauthorized_message.*` (1 claves)
- `repse_val_input_title.*` (1 claves)
- `repse_val_input_message.*` (1 claves)
- `repse_folio_duplicate_title.*` (1 claves)
- `repse_folio_duplicate_message.*` (1 claves)
- `repse_business_unit_not_found_title.*` (1 claves)
- `repse_business_unit_not_found_message.*` (1 claves)
- `repse_not_found_title.*` (1 claves)
- `repse_not_found_message.*` (1 claves)
- `repse_dates_invalid_title.*` (1 claves)
- `repse_dates_invalid_message.*` (1 claves)
- `repse_dates_range_invalid_message.*` (1 claves)
- `repse_unexpected_error_message.*` (1 claves)
- `repse_specialized_services_title.*` (1 claves)
- `repse_specialized_service_title.*` (1 claves)
- `repse_specialized_services_listed_successfully.*` (1 claves)
- `repse_specialized_service_found_successfully.*` (1 claves)
- `repse_specialized_service_created_successfully.*` (1 claves)
- `repse_specialized_service_updated_successfully.*` (1 claves)
- `repse_specialized_service_deleted_successfully.*` (1 claves)
- `repse_specialized_service_error_default_title.*` (1 claves)
- `repse_specialized_service_unauthorized_title.*` (1 claves)
- `repse_specialized_service_unauthorized_message.*` (1 claves)
- `repse_specialized_service_val_input_title.*` (1 claves)
- `repse_specialized_service_val_input_message.*` (1 claves)
- `repse_specialized_service_not_found_title.*` (1 claves)
- `repse_specialized_service_not_found_message.*` (1 claves)
- `repse_specialized_service_parent_not_found_title.*` (1 claves)
- `repse_specialized_service_parent_not_found_message.*` (1 claves)
- `repse_specialized_service_name_duplicate_title.*` (1 claves)
- `repse_specialized_service_name_duplicate_message.*` (1 claves)
- `repse_specialized_service_linked_contratos_title.*` (1 claves)
- `repse_specialized_service_linked_contratos_message.*` (1 claves)
- `repse_specialized_service_unexpected_error_message.*` (1 claves)
- `empresas_contratantes_title.*` (1 claves)
- `empresa_contratante_title.*` (1 claves)
- `empresas_contratantes_listed_successfully.*` (1 claves)
- `empresa_contratante_found_successfully.*` (1 claves)
- `empresa_contratante_created_successfully.*` (1 claves)
- `empresa_contratante_updated_successfully.*` (1 claves)
- `empresa_contratante_deleted_successfully.*` (1 claves)
- `empresa_contratante_error_default_title.*` (1 claves)
- `empresa_contratante_unauthorized_title.*` (1 claves)
- `empresa_contratante_unauthorized_message.*` (1 claves)
- `empresa_contratante_val_input_title.*` (1 claves)
- `empresa_contratante_val_input_message.*` (1 claves)
- `empresa_contratante_rfc_invalid_title.*` (1 claves)
- `empresa_contratante_rfc_invalid_message.*` (1 claves)
- `empresa_contratante_rfc_duplicate_title.*` (1 claves)
- `empresa_contratante_rfc_duplicate_message.*` (1 claves)
- `empresa_contratante_not_found_title.*` (1 claves)
- `empresa_contratante_not_found_message.*` (1 claves)
- `empresa_contratante_business_unit_not_found_title.*` (1 claves)
- `empresa_contratante_business_unit_not_found_message.*` (1 claves)
- `empresa_contratante_forbidden_title.*` (1 claves)
- `empresa_contratante_forbidden_message.*` (1 claves)
- `empresa_contratante_unexpected_error_message.*` (1 claves)
- `empresa_contratante_contratos_activos_title.*` (1 claves)
- `empresa_contratante_contratos_activos_message.*` (1 claves)
- `contratos_servicios_especializados_title.*` (1 claves)
- `contrato_servicio_especializado_title.*` (1 claves)
- `contratos_servicios_especializados_listed_successfully.*` (1 claves)
- `contrato_servicio_especializado_found_successfully.*` (1 claves)
- `contrato_servicio_especializado_created_successfully.*` (1 claves)
- `contrato_servicio_especializado_updated_successfully.*` (1 claves)
- `contrato_servicio_especializado_error_default_title.*` (1 claves)
- `contrato_servicio_especializado_unauthorized_title.*` (1 claves)
- `contrato_servicio_especializado_unauthorized_message.*` (1 claves)
- `contrato_servicio_especializado_val_input_title.*` (1 claves)
- `contrato_servicio_especializado_val_input_message.*` (1 claves)
- `contrato_servicio_especializado_val_fechas_title.*` (1 claves)
- `contrato_servicio_especializado_val_fechas_message.*` (1 claves)
- `contrato_servicio_especializado_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_contratante_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_contratante_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_repse_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_repse_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_numero_duplicate_title.*` (1 claves)
- `contrato_servicio_especializado_numero_duplicate_message.*` (1 claves)
- `contrato_servicio_especializado_servicios_registrados_requeridos_title.*` (1 claves)
- `contrato_servicio_especializado_servicios_registrados_requeridos_message.*` (1 claves)
- `contrato_servicio_especializado_servicio_registrado_not_found_title.*` (1 claves)
- `contrato_servicio_especializado_servicio_registrado_not_found_message.*` (1 claves)
- `contrato_servicio_especializado_forbidden_title.*` (1 claves)
- `contrato_servicio_especializado_forbidden_message.*` (1 claves)
- `contrato_servicio_especializado_unexpected_error_message.*` (1 claves)
- `version_contrato_especializado_title.*` (1 claves)
- `version_contrato_especializado_renewed_successfully.*` (1 claves)
- `version_contrato_especializado_addendum_successfully.*` (1 claves)
- `version_contrato_especializado_list_successfully.*` (1 claves)
- `version_contrato_especializado_found_successfully.*` (1 claves)
- `version_contrato_especializado_error_default_title.*` (1 claves)
- `version_contrato_especializado_unauthorized_title.*` (1 claves)
- `version_contrato_especializado_unauthorized_message.*` (1 claves)
- `version_contrato_especializado_val_input_title.*` (1 claves)
- `version_contrato_especializado_val_input_message.*` (1 claves)
- `version_contrato_especializado_addendum_invalid_title.*` (1 claves)
- `version_contrato_especializado_addendum_invalid_message.*` (1 claves)
- `version_contrato_especializado_val_vigencia_title.*` (1 claves)
- `version_contrato_especializado_val_vigencia_message.*` (1 claves)
- `version_contrato_especializado_contrato_not_found_title.*` (1 claves)
- `version_contrato_especializado_contrato_not_found_message.*` (1 claves)
- `version_contrato_especializado_version_not_found_title.*` (1 claves)
- `version_contrato_especializado_version_not_found_message.*` (1 claves)
- `version_contrato_especializado_not_renewable_title.*` (1 claves)
- `version_contrato_especializado_not_renewable_message.*` (1 claves)
- `version_contrato_especializado_not_addendable_title.*` (1 claves)
- `version_contrato_especializado_not_addendable_message.*` (1 claves)
- `version_contrato_especializado_snapshot_incomplete_title.*` (1 claves)
- `version_contrato_especializado_snapshot_incomplete_message.*` (1 claves)
- `version_contrato_especializado_immutable_title.*` (1 claves)
- `version_contrato_especializado_immutable_message.*` (1 claves)
- `version_contrato_especializado_forbidden_read_title.*` (1 claves)
- `version_contrato_especializado_forbidden_read_message.*` (1 claves)
- `asignacion_contrato_especializado_title.*` (1 claves)
- `asignacion_contrato_especializado_created_successfully.*` (1 claves)
- `asignacion_contrato_especializado_listed_successfully.*` (1 claves)
- `asignacion_contrato_especializado_updated_successfully.*` (1 claves)
- `asignacion_contrato_especializado_error_default_title.*` (1 claves)
- `asignacion_contrato_especializado_unauthorized_title.*` (1 claves)
- `asignacion_contrato_especializado_unauthorized_message.*` (1 claves)
- `asignacion_contrato_val_input_title.*` (1 claves)
- `asignacion_contrato_val_input_message.*` (1 claves)
- `asignacion_contrato_val_employee_duplicate_title.*` (1 claves)
- `asignacion_contrato_val_employee_duplicate_message.*` (1 claves)
- `asignacion_contrato_val_fechas_title.*` (1 claves)
- `asignacion_contrato_val_fechas_message.*` (1 claves)
- `asignacion_contrato_not_found_title.*` (1 claves)
- `asignacion_contrato_not_found_message.*` (1 claves)
- `asignacion_contrato_employee_not_found_title.*` (1 claves)
- `asignacion_contrato_employee_not_found_message.*` (1 claves)
- `asignacion_contrato_contrato_no_vigente_title.*` (1 claves)
- `asignacion_contrato_contrato_no_vigente_message.*` (1 claves)
- `asignacion_contrato_fuera_de_vigencia_title.*` (1 claves)
- `asignacion_contrato_fuera_de_vigencia_message.*` (1 claves)
- `asignacion_contrato_duplicada_title.*` (1 claves)
- `asignacion_contrato_duplicada_message.*` (1 claves)
- `asignacion_contrato_forbidden_title.*` (1 claves)
- `asignacion_contrato_forbidden_message.*` (1 claves)
- `asignacion_contrato_unexpected_error_message.*` (1 claves)
- `version_contrato_especializado_forbidden_write_title.*` (1 claves)
- `version_contrato_especializado_forbidden_write_message.*` (1 claves)
- `version_contrato_especializado_unexpected_error_message.*` (1 claves)
- `address.*` (1 claves)
- `the_address.*` (1 claves)
- `address_type.*` (1 claves)
- `employee.*` (1 claves)
- `department.*` (1 claves)
- `departments.*` (1 claves)
- `zone.*` (1 claves)
- `zones.*` (1 claves)
- `position.*` (1 claves)
- `assist.*` (1 claves)
- `assist_register.*` (1 claves)
- `report_type.*` (1 claves)
- `date.*` (1 claves)
- `name.*` (1 claves)
- `email.*` (1 claves)
- `user.*` (1 claves)
- `customer.*` (1 claves)
- `pilot.*` (1 claves)
- `flight_attendant.*` (1 claves)
- `shift.*` (1 claves)
- `code.*` (1 claves)
- `bank.*` (1 claves)
- `resource.*` (1 claves)
- `resources.*` (1 claves)
- `created.*` (1 claves)
- `updated.*` (1 claves)
- `resource_was_created_successfully.*` (1 claves)
- `resource_was_updated_successfully.*` (1 claves)
- `resource_was_deleted_successfully.*` (1 claves)
- `resource_was_found_successfully.*` (1 claves)
- `resource_was_not_found_successfully.*` (1 claves)
- `resource_was_not_found_with_the_entered_id.*` (1 claves)
- `resource_id_was_not_found.*` (1 claves)
- `entity_id_was_not_found.*` (1 claves)
- `resources_were_found_successfully.*` (1 claves)
- `entity_was_not_found_with_entered_id.*` (1 claves)
- `entity_was_not_found.*` (1 claves)
- `entity_is_not_valid.*` (1 claves)
- `entity_resource_cannot_be.*` (1 claves)
- `because_the_entity_is_not_valid.*` (1 claves)
- `because_the_value_of_entity_is_not_valid.*` (1 claves)
- `because_the_value_of_entity_is_already_assigned_to_another_register.*` (1 claves)
- `because_the_relation_is_already_assigned_to_another_register.*` (1 claves)
- `param_was_already_assigned_in_entity.*` (1 claves)
- `because_the_param_was_already_assigned_in_entity.*` (1 claves)
- `the_value_of_entity_already_exists_for_another_register.*` (1 claves)
- `server_error.*` (1 claves)
- `an_unexpected_error_has_occurred_on_the_server.*` (1 claves)
- `an_unexpected_error_has_occurred_on_the_server_buffer_not_found.*` (1 claves)
- `missing_data_to_process.*` (1 claves)
- `id_was_not_found.*` (1 claves)
- `was_not_found.*` (1 claves)
- `was_not_found_with_the_entered_id.*` (1 claves)
- `the_address_was_created_successfully.*` (1 claves)
- `the_address_was_updated_successfully.*` (1 claves)
- `the_address_was_not_found_with_the_entered_id.*` (1 claves)
- `the_address_was_not_found.*` (1 claves)
- `the_address_places_were_found_successfully.*` (1 claves)
- `address_types.*` (1 claves)
- `were_found_successfully.*` (1 claves)
- `info_verify_successfully.*` (1 claves)
- `successfully_fetched.*` (1 claves)
- `resources_fetched.*` (1 claves)
- `resource_fetched.*` (1 claves)
- `upload_error.*` (1 claves)
- `failed_to_upload_file_to_s3.*` (1 claves)
- `successfully_action.*` (1 claves)
- `resource_created.*` (1 claves)
- `validation_error.*` (1 claves)
- `invalid_input_validation_error_400.*` (1 claves)
- `not_found.*` (1 claves)
- `resource_not_found.*` (1 claves)
- `no_data.*` (1 claves)
- `resource_deleted.*` (1 claves)
- `resource_updated.*` (1 claves)
- `aircraft_maintenances.*` (1 claves)
- `reservations.*` (1 claves)
- `reservation_created_successfully.*` (1 claves)
- `the_aircraft_maintenance.*` (1 claves)
- `aircraft_maintenance_not_found_with_entered_id.*` (1 claves)
- `aircraft_maintenance.*` (1 claves)
- `was_found_successfully.*` (1 claves)
- `maintenance_type.*` (1 claves)
- `aircraft_maintenance_status.*` (1 claves)
- `aircraft_maintenance_urgency_level.*` (1 claves)
- `start_date.*` (1 claves)
- `already_exist_maintenance_in_the_same_date.*` (1 claves)
- `start_date_is_after_end_date.*` (1 claves)
- `aircraft_maintenance_statuses.*` (1 claves)
- `aircraft_operators.*` (1 claves)
- `the_aircraft_operators.*` (1 claves)
- `the_aircraft_operator.*` (1 claves)
- `the_operator.*` (1 claves)
- `please_upload_a_image_valid.*` (1 claves)
- `aircraft.*` (1 claves)
- `unknown_error.*` (1 claves)
- `the_assist_was_inactivate_successfully.*` (1 claves)
- `the_date_not_is_pay_thursday.*` (1 claves)
- `assistance_report.*` (1 claves)
- `incident_summary.*` (1 claves)
- `incident_summary_payroll.*` (1 claves)
- `incidents.*` (1 claves)
- `summary_report.*` (1 claves)
- `shift_assigned.*` (1 claves)
- `shift_start_date.*` (1 claves)
- `shift_ends_date.*` (1 claves)
- `check_in.*` (1 claves)
- `check_go_eat.*` (1 claves)
- `check_back_from_eat.*` (1 claves)
- `check_out.*` (1 claves)
- `hours_worked.*` (1 claves)
- `status.*` (1 claves)
- `exception_notes.*` (1 claves)
- `on_time.*` (1 claves)
- `ontime.*` (1 claves)
- `tolerances.*` (1 claves)
- `delays.*` (1 claves)
- `faults.*` (1 claves)
- `early_outs.*` (1 claves)
- `arrivals.*` (1 claves)
- `absences.*` (1 claves)
- `fault.*` (1 claves)
- `rest.*` (1 claves)
- `exception.*` (1 claves)
- `holiday.*` (1 claves)
- `delay.*` (1 claves)
- `tolerance.*` (1 claves)
- `vacations.*` (1 claves)
- `days_worked.*` (1 claves)
- `rests.*` (1 claves)
- `sunday_bonus.*` (1 claves)
- `exceptions.*` (1 claves)
- `holidays_worked.*` (1 claves)
- `rest_worked.*` (1 claves)
- `delays_faults.*` (1 claves)
- `early_outs_faults.*` (1 claves)
- `total_faults.*` (1 claves)
- `total_hours_worked.*` (1 claves)
- `report.*` (1 claves)
- `totals.*` (1 claves)
- `vacation_day.*` (1 claves)
- `next.*` (1 claves)
- `company.*` (1 claves)
- `leaves.*` (1 claves)
- `double_overtime_hours.*` (1 claves)
- `triple_overtime_hours.*` (1 claves)
- `sunday_bonus_abb.*` (1 claves)
- `rest_day_worked.*` (1 claves)
- `vacation_bonus.*` (1 claves)
- `leveling.*` (1 claves)
- `bonus.*` (1 claves)
- `employee_bonuses.*` (1 claves)
- `cannot_modify_past_bonus.*` (1 claves)
- `others.*` (1 claves)
- `to.*` (1 claves)
- `from.*` (1 claves)
- `relation.*` (1 claves)
- `proceeding_files.*` (1 claves)
- `proceeding_file.*` (1 claves)
- `entity_have_been_synchronized_successfully.*` (1 claves)
- `no_data_found_to_synchronize.*` (1 claves)
- `sync_entity.*` (1 claves)
- `the_positions_by_department_have_been_sync_successfully.*` (1 claves)
- `all_positions_have_been_found_successfully.*` (1 claves)
- `the_positions_by_department_have_been_found_successfully.*` (1 claves)
- `rotation_index_by_department.*` (1 claves)
- `the_rotation_index_by_department_has_calculate_successfully.*` (1 claves)
- `department_has_related_employees.*` (1 claves)
- `the_department_cannot_be_deleted_because_it_has_related_employees.*` (1 claves)
- `the_department_its_related_positions_and_employees_were_reassigned_successfully_and_the_department_was_soft_deleted.*` (1 claves)
- `not_access.*` (1 claves)
- `the_shift_was_assign_to_department_successfully.*` (1 claves)
- `the_relation_department_position_has_employees.*` (1 claves)
- `the_relation_department_position_has_employees_assigned.*` (1 claves)
- `the_departments_and_positions_were_created_successfully.*` (1 claves)
- `the_information_was_created_successfully.*` (1 claves)
- `information.*` (1 claves)
- `access_point.*` (1 claves)
- `connection_status_updated_successfully.*` (1 claves)
- `connection_status_no_response_from_device.*` (1 claves)
- `notice.*` (1 claves)
- `notice_sent_successfully.*` (1 claves)
- `sent.*` (1 claves)
- `failed.*` (1 claves)
- `new_notice.*` (1 claves)
- `assessment_template.*` (1 claves)
- `assessment_templates.*` (1 claves)
- `assessment_template_no_permission_to_toggle_status.*` (1 claves)
- `user_unauthorized.*` (1 claves)
- `assessment_template_dimension.*` (1 claves)
- `assessment_template_dimensions.*` (1 claves)
- `assessment_template_dimension_data_type_invalid.*` (1 claves)
- `assessment_template_dimension_reorder_out_of_template.*` (1 claves)
- `assessment_template_dimension_reorder_duplicated_indexes.*` (1 claves)
- `position_assessment_profile_coherence_range_required_for_numeric.*` (1 claves)
- `position_assessment_profile_coherence_range_required_for_percent.*` (1 claves)
- `position_assessment_profile_coherence_range_min_greater_than_max.*` (1 claves)
- `position_assessment_profile_coherence_percent_out_of_bounds.*` (1 claves)
- `position_assessment_profile_coherence_expected_value_required.*` (1 claves)
- `position_assessment_profile_coherence_expected_value_not_allowed.*` (1 claves)
- `position_assessment_profile_coherence_range_not_allowed_for_categorical.*` (1 claves)
- `position_assessment_profile_coherence_categorical_value_invalid.*` (1 claves)
- `position_assessment_profile_coherence_data_type_unknown.*` (1 claves)
- `employee_assessment_result_coherence_numeric_value_required.*` (1 claves)
- `employee_assessment_result_coherence_percent_value_out_of_bounds.*` (1 claves)
- `employee_assessment_result_coherence_categorical_value_mismatch_enum.*` (1 claves)
- `employee_assessment_result_coherence_dimension_not_found.*` (1 claves)
- `position_assessment_profile.*` (1 claves)
- `position_assessment_profiles.*` (1 claves)
- `employee_evaluation_already_exists.*` (1 claves)
- `employee_evaluation_already_exists_with_entered_date.*` (1 claves)
- `employee_assessment.*` (1 claves)
- `employee_assessments.*` (1 claves)
- `employee_assessment_result.*` (1 claves)
- `employee_assessment_results.*` (1 claves)
- `employee_assessment_date_cannot_be_in_future.*` (1 claves)
- `employee_assessment_already_exists_for_date.*` (1 claves)
- `position_work_tool.*` (1 claves)
- `position_work_tools.*` (1 claves)
- `competency.*` (1 claves)
- `competencies.*` (1 claves)
- `competency_level.*` (1 claves)
- `competency_levels.*` (1 claves)
- `competency_level_in_development.*` (1 claves)
- `competency_level_capable.*` (1 claves)
- `competency_level_expert.*` (1 claves)
- `competency_level_description.*` (1 claves)
- `position_competency_level.*` (1 claves)
- `position_competency_levels.*` (1 claves)
- `resource_already_exists.*` (1 claves)
- `profile_position.*` (45 claves)
- `monthly_conversion_factor.*` (1 claves)
- `monthly_conversion_factor_helper.*` (1 claves)
- `monthly_conversion_factor_invalid.*` (1 claves)
- `the_origin_and_target_positions_cannot_be_the_same.*` (1 claves)
- `origin.*` (1 claves)
- `target.*` (1 claves)
- `the_origin_and_target_positions_do_not_exist_in_the_current_template.*` (1 claves)
- `the_override_reason_is_required.*` (1 claves)
- `the_justification_must_be_at_least_20_characters.*` (1 claves)
- `the_limit_of_candidates_has_been_exceeded.*` (1 claves)
- `the_limit_of_candidates_active_has_been_exceeded.*` (1 claves)
- `the_user_is_not_the_direct_boss_of_the_employee.*` (1 claves)
- `rejection_reason_required.*` (1 claves)
- `invalid_transition.*` (1 claves)
- `invalid_transition_from_rejected_to_active.*` (1 claves)
- `invalid_transition_from_desactivated_to_active.*` (1 claves)
- `invalid_transition_from_any_status_to_other_status.*` (1 claves)
- `career_path_candidate_email_title.*` (1 claves)
- `career_path_candidate_email_greeting.*` (1 claves)
- `career_path_candidate_email_body.*` (1 claves)
- `career_path_candidate_email_label_candidate.*` (1 claves)
- `career_path_candidate_email_label_origin_position.*` (1 claves)
- `career_path_candidate_email_label_target_position.*` (1 claves)
- `career_path_candidate_email_label_status.*` (1 claves)
- `career_path_candidate_email_label_rejection_reason.*` (1 claves)
- `career_path_candidate_email_footer.*` (1 claves)
- `career_path_candidate_email_subject.*` (1 claves)
- `career_path_candidate_status_approved.*` (1 claves)
- `career_path_candidate_status_rejected.*` (1 claves)
- `salary_history.*` (1 claves)
- `salary_history_empty.*` (1 claves)
- `salary_daily.*` (1 claves)
- `salary_monthly_equivalent.*` (1 claves)
- `valid_from.*` (1 claves)
- `valid_to.*` (1 claves)
- `current.*` (1 claves)
- `changed_by.*` (1 claves)
- `salary_change_reason.*` (1 claves)
- `salary_change_reason_placeholder.*` (1 claves)
- `salary_history_not_found.*` (1 claves)
- `salary_history_found.*` (1 claves)
- `salary_history_employee_not_found.*` (1 claves)
- `org_chart_move_forbidden.*` (1 claves)
- `org_chart_move_parent_department_not_found.*` (1 claves)
- `org_chart_move_parent_position_not_found.*` (1 claves)
- `org_chart_move_department_self_parent.*` (1 claves)
- `org_chart_move_department_self_parent_detail.*` (1 claves)
- `org_chart_move_department_invalid_special.*` (1 claves)
- `org_chart_move_department_invalid_special_detail.*` (1 claves)
- `org_chart_move_department_root_locked.*` (1 claves)
- `org_chart_move_department_root_locked_detail.*` (1 claves)
- `org_chart_move_department_parent_inactive.*` (1 claves)
- `org_chart_move_department_parent_inactive_detail.*` (1 claves)
- `org_chart_move_department_business_unit.*` (1 claves)
- `org_chart_move_department_business_unit_detail.*` (1 claves)
- `org_chart_move_department_cycle_message.*` (1 claves)
- `org_chart_move_department_cycle_detail.*` (1 claves)
- `org_chart_move_position_self_parent.*` (1 claves)
- `org_chart_move_position_self_parent_detail.*` (1 claves)
- `org_chart_move_position_department_required.*` (1 claves)
- `org_chart_move_position_department_required_detail.*` (1 claves)
- `org_chart_move_position_invalid_department_special_detail.*` (1 claves)
- `org_chart_move_position_department_inactive_detail.*` (1 claves)
- `org_chart_move_position_business_unit_detail.*` (1 claves)
- `org_chart_move_position_parent_inactive.*` (1 claves)
- `org_chart_move_position_parent_inactive_detail.*` (1 claves)
- `org_chart_move_position_parent_not_in_department.*` (1 claves)
- `org_chart_move_position_parent_not_in_department_detail.*` (1 claves)
- `org_chart_move_position_parent_dept_detail.*` (1 claves)
- `org_chart_move_position_parent_bu_detail.*` (1 claves)
- `org_chart_move_position_no_department_link.*` (1 claves)
- `org_chart_move_position_no_department_link_detail.*` (1 claves)
- `org_chart_move_position_cycle_message.*` (1 claves)
- `org_chart_move_position_cycle_detail.*` (1 claves)
- `org_chart_hierarchy_invalid_title.*` (1 claves)
- `org_chart_hierarchy_cycle_detail_departments.*` (1 claves)
- `org_chart_hierarchy_cycle_detail_positions.*` (1 claves)
- `org_chart_parent_department_missing_title.*` (1 claves)
- `org_chart_parent_department_missing_detail.*` (1 claves)
- `org_chart_parent_department_inactive_message.*` (1 claves)
- `org_chart_parent_inactive_title.*` (1 claves)
- `org_chart_scope_mismatch_title.*` (1 claves)
- `org_chart_department_company_mismatch_message.*` (1 claves)
- `org_chart_department_company_mismatch_detail.*` (1 claves)
- `org_chart_parent_position_missing_title.*` (1 claves)
- `org_chart_parent_position_missing_detail.*` (1 claves)
- `org_chart_position_company_mismatch_message.*` (1 claves)
- `org_chart_position_company_mismatch_detail.*` (1 claves)
- `org_chart_position_parent_company_mismatch_detail.*` (1 claves)
- `org_chart_position_department_consistency_title.*` (1 claves)
- `org_chart_position_department_consistency_message.*` (1 claves)
- `org_chart_position_department_consistency_detail.*` (1 claves)
- `company_competency_level.*` (1 claves)
- `label.*` (1 claves)
- `the_number_of_levels_must_be_between_3_and_5.*` (1 claves)
- `business_unit_competency_level.*` (1 claves)
- `the_range_min_must_be_less_than_the_range_max.*` (1 claves)
- `competency_descriptor.*` (1 claves)
- `employee_lactation_period.*` (1 claves)
- `employee_lactation_periods.*` (1 claves)
- `employee_lactation_period_no_permission.*` (1 claves)
- `employee_lactation_period_employee_not_found.*` (1 claves)
- `employee_lactation_period_period_not_found.*` (1 claves)
- `employee_lactation_period_date_range_invalid.*` (1 claves)
- `employee_lactation_period_unreasonable_range_title.*` (1 claves)
- `employee_lactation_period_unreasonable_range_detail.*` (1 claves)
- `employee_lactation_period_overlap_title.*` (1 claves)
- `employee_lactation_period_overlap_detail.*` (1 claves)
- `repse_registration.*` (1 claves)
- `repse_registrations.*` (1 claves)
- `repse_registration_was_created_successfully.*` (1 claves)
- `repse_registration_was_updated_successfully.*` (1 claves)
- `repse_registration_was_deleted_successfully.*` (1 claves)
- `repse_registration_was_found_successfully.*` (1 claves)
- `repse_registration_folio_already_registered.*` (1 claves)
- `repse_registration_business_unit_not_found.*` (1 claves)
- `repse_registration_dates_invalid.*` (1 claves)
- `repse_registration_not_found.*` (1 claves)
- `employee_lactation_period_below_legal_minimum_title.*` (1 claves)
- `employee_lactation_period_below_legal_minimum_detail.*` (1 claves)
- `employee_lactation_period_exception_type_missing_title.*` (1 claves)
- `employee_lactation_period_exception_type_missing_detail.*` (1 claves)
- `employee_lactation_period_no_active_shift_title.*` (1 claves)
- `employee_lactation_period_no_active_shift_detail.*` (1 claves)
- `employee_lactation_period_shift_exceptions_regenerated.*` (1 claves)
- `employee_lactation_period_evidence.*` (1 claves)
- `employee_lactation_period_evidences.*` (1 claves)
- `employee_lactation_period_evidence_uploaded.*` (1 claves)
- `employee_lactation_period_evidence_deleted.*` (1 claves)
- `employee_lactation_period_evidence_list_empty.*` (1 claves)
- `employee_lactation_period_evidence_file_required_title.*` (1 claves)
- `employee_lactation_period_evidence_file_required_detail.*` (1 claves)
- `employee_lactation_period_evidence_invalid_file_type_title.*` (1 claves)
- `employee_lactation_period_evidence_invalid_file_type_detail.*` (1 claves)
- `employee_lactation_period_evidence_file_too_large_title.*` (1 claves)
- `employee_lactation_period_evidence_file_too_large_detail.*` (1 claves)
- `employee_lactation_period_evidence_invalid_category_title.*` (1 claves)
- `employee_lactation_period_evidence_invalid_category_detail.*` (1 claves)
- `employee_lactation_period_evidence_not_found_title.*` (1 claves)
- `employee_lactation_period_evidence_not_found_detail.*` (1 claves)
- `employee_lactation_period_evidence_upload_failed_title.*` (1 claves)
- `employee_lactation_period_evidence_upload_failed_detail.*` (1 claves)
- `employee_lactation_period_evidence_download_failed_title.*` (1 claves)
- `employee_lactation_period_evidence_download_failed_detail.*` (1 claves)
- `employee_lactation_period_evidence_category_agreement.*` (1 claves)
- `employee_lactation_period_evidence_category_birth_support.*` (1 claves)
- `employee_lactation_period_evidence_category_other.*` (1 claves)
- `employee_lactation_period_type_two_rest_periods.*` (1 claves)
- `employee_lactation_period_type_reduced_hour.*` (1 claves)
- `employee_lactation_reduction_application_start.*` (1 claves)
- `employee_lactation_reduction_application_end.*` (1 claves)
- `employee_lactation_reduction_application_split.*` (1 claves)
- `employee_lactation_compliance_report_title.*` (1 claves)
- `employee_lactation_compliance_report_generated_at.*` (1 claves)
- `employee_lactation_compliance_report_filters.*` (1 claves)
- `employee_lactation_compliance_report_range.*` (1 claves)
- `employee_lactation_compliance_report_status.*` (1 claves)
- `employee_lactation_compliance_report_employee.*` (1 claves)
- `employee_lactation_compliance_report_code.*` (1 claves)
- `employee_lactation_compliance_report_period.*` (1 claves)
- `employee_lactation_compliance_report_duration.*` (1 claves)
- `employee_lactation_compliance_report_type.*` (1 claves)
- `employee_lactation_compliance_report_modality.*` (1 claves)
- `employee_lactation_compliance_report_applied_days.*` (1 claves)
- `employee_lactation_compliance_report_evidences.*` (1 claves)
- `employee_lactation_compliance_report_days.*` (1 claves)
- `employee_lactation_compliance_report_empty.*` (1 claves)
- `employee_lactation_compliance_report_empty_title.*` (1 claves)
- `employee_lactation_compliance_report_subtitle.*` (1 claves)
- `employee_lactation_compliance_report_summary_table.*` (1 claves)
- `employee_lactation_compliance_report_detailed_sections.*` (1 claves)
- `employee_lactation_compliance_report_kpi_total.*` (1 claves)
- `employee_lactation_compliance_report_table_employee.*` (1 claves)
- `employee_lactation_compliance_report_table_applied.*` (1 claves)
- `employee_lactation_compliance_report_table_evid.*` (1 claves)
- `employee_lactation_compliance_report_no_lower_bound.*` (1 claves)
- `employee_lactation_compliance_report_no_upper_bound.*` (1 claves)
- `employee_lactation_compliance_report_legal_basis.*` (1 claves)
- `employee_lactation_compliance_report_range_invalid_title.*` (1 claves)
- `employee_lactation_compliance_report_range_invalid_detail.*` (1 claves)
- `employee_lactation_compliance_status_active.*` (1 claves)
- `employee_lactation_compliance_status_expiring.*` (1 claves)
- `employee_lactation_compliance_status_expired.*` (1 claves)
- `auth.*` (19 claves)
- `attendance_stats_dates_required.*` (1 claves)
- `attendance_stats_invalid_range.*` (1 claves)
- `attendance_stats_invalid_input.*` (1 claves)
- `attendance_stats_scope_required.*` (1 claves)
- `forbidden.*` (1 claves)
- `unauthenticated.*` (1 claves)
- `signup_invalid_data.*` (1 claves)
- `signup_draft_not_found.*` (1 claves)
- `signup_email_not_verified.*` (1 claves)
- `signup_token_invalid.*` (1 claves)
- `signup_email_already_registered.*` (1 claves)
- `signup_account_created.*` (1 claves)
- `signup_otp_sent.*` (1 claves)
- `signup_otp_expired.*` (1 claves)
- `signup_otp_incorrect.*` (1 claves)
- `signup_otp_verified.*` (1 claves)
- `signup_password_min_length.*` (1 claves)
- `signup_password_requires_uppercase.*` (1 claves)
- `signup_password_requires_number.*` (1 claves)
- `signup_password_requires_symbol.*` (1 claves)
- `signup_passwords_do_not_match.*` (1 claves)
- `regulatory.*` (503 claves)
