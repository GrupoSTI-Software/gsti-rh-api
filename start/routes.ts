/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

import './routes/login_routes.js'
import './routes/synchronization_routes.js'
import './routes/department_routes.js'
import './routes/position_routes.js'
import './routes/employee_routes.js'
import './routes/employee_biometric_face_id_routes.js'
import './routes/person_routes.js'
import './routes/user_routes.js'
import './routes/assist_routes.js'
import './routes/shift_routes.js'
import './routes/employee_shifts_routes.js'
import './routes/shift_exceptions_routes.js'
import './routes/holiday_routes.js'
import './routes/shift_for_employees.js'
import './routes/department_position_routes.js'
import './routes/role_routes.js'
import './routes/exception_type_routes.js'
import './routes/vacations_routes.js'
import './routes/aircraft_class_routes.js'
import './routes/proceeding_file_routes.js'
import './routes/employee_proceeding_file_routes.js'
import './routes/proceeding_file_type_routes.js'
import './routes/aircraft_property_routes.js'
import './routes/pilot_routes.js'
import './routes/pilot_proceeding_file_routes.js'
import './routes/flight_attendant_routes.js'
import './routes/flight_attendant_proceeding_file_routes.js'
import './routes/airport.js'
import './routes/customer_routes.js'
import './routes/customer_proceeding_file_routes.js'
import './routes/system_setting_routes.js'
import './routes/system_settings_employees.js'
import './routes/aircraft_routes.js'
import './routes/system_module_routes.js'
import './routes/gallery_routes.js'
import './routes/business_unit_routes.js'
import './routes/aircraft_proceeding_file_routes.js'
import './routes/proceeding_file_status_routes.js'
import './routes/tolerance_routes.js'
import './routes/system_setting_system_module_routes.js'
import './routes/system_settings_notification_emails_routes.js'
import './routes/proceeding_file_type_email_routes.js'
import './routes/employee_vacation_routes.js'
import './routes/exception_request_routes.js'
import './routes/log_routes.js'
import './routes/employee_type_routes.js'
import './routes/aircraft_operator_routes.js'
import './routes/work_disability_type_routes.js'
import './routes/insurance_coverage_type_routes.js'
import './routes/work_disability_routes.js'
import './routes/work_disability_period_routes.js'
import './routes/work_disability_note_routes.js'
import './routes/reservations_routes.js'
import './routes/reservation_leg_routes.js'
import './routes/reservation_note_routes.js'
import './routes/aircraft_maintenance_status_routes.js'
import './routes/maintenance_urgency_level_routes.js'
import './routes/maintenance_type_routes.js'
import './routes/aircraft_maintenance_routes.js'
import './routes/maintenance_expense_routes.js'
import './routes/maintenance_expense_category_routes.js'
import './routes/employee_children_routes.js'
import './routes/employee_spouse_routes.js'
import './routes/address_type_routes.js'
import './routes/address_routes.js'
import './routes/employee_address_routes.js'
import './routes/employee_record_routes.js'
import './routes/employee_record_property_routes.js'
import './routes/work_disability_period_expense_routes.js'
import './routes/employee_contract_type_routes.js'
import './routes/employee_contract_routes.js'
import './routes/employee_emergency_contact_routes.js'
import './routes/bank_routes.js'
import './routes/employee_bank_routes.js'
import './routes/proceeding_file_type_property_routes.js'
import './routes/proceeding_file_type_property_value_routes.js'
import './routes/employee_shift_change_routes.js'
import './routes/user_responsible_employee_routes.js'
import './routes/shift_exception_evidence_routes.js'
import './routes/employee_assist_calendar_routes.js'
import './routes/supply_type.js'
import './routes/supplie_caracteristics.js'
import './routes/supplie_caracteristic_values.js'
import './routes/supplies.js'
import './routes/employee_supplies.js'
import './routes/employee_supplies_response_contracts.js'
import './routes/vacation_authorization_signatures_routes.js'
import './routes/system_setting_payroll_config_routes.js'
import './routes/medical_condition_type_routes.js'
import './routes/medical_condition_type_property_routes.js'
import './routes/employee_medical_condition_routes.js'
import './routes/medical_condition_type_property_value_routes.js'

router.get('/', async ({ view }) => {
  const specUrl = '/swagger.json'
  return view.render('swagger', { specUrl })
})

// router.get('/template-email', async ({ view }) => {
//   const data = {
//     'email': 'wramirez@siler-mx.com',
//     'employeesProceedingFilesExpired': [
//       {
//         'proceedingFileId': 16,
//         'proceedingFileName': 'Visa de turista',
//         'proceedingFilePath': 'https://sfo3.digitaloceanspaces.com/sae-assets/cima-bo-system/proceeding-files/1743551587782_Visa%20Example.jpg',
//         'proceedingFileTypeId': 221,
//         'proceedingFileExpirationAt': 'Monday, 31 March 2025',
//         'proceedingFileActive': 1,
//         'proceedingFileCreatedAt': '2025-04-01T23:53:08.000+00:00',
//         'proceedingFileUpdatedAt': '2025-04-01T23:53:08.000+00:00',
//         'deletedAt': null,
//         'proceedingFileUuid': 'hdkgx6r5o2tynnntfcoibysd',
//         'proceedingFileObservations': null,
//         'pilotProceedingFile': null,
//         'aircraftProceedingFile': null,
//         'customerProceedingFile': null,
//         'flightAttendantProceedingFile': null,
//         'employeeProceedingFile': {
//           'employeeProceedingFileId': 7,
//           'employeeId': 412,
//           'proceedingFileId': 16,
//           'employeeProceedingFileCreatedAt': '2025-04-01T23:53:08.000+00:00',
//           'employeeProceedingFileUpdatedAt': '2025-04-01T23:53:08.000+00:00',
//           'deletedAt': null,
//           'employee': {
//             'employeeId': 412,
//             'employeeSyncId': null,
//             'employeeCode': '27800362',
//             'employeeFirstName': 'Wilvardo',
//             'employeeLastName': 'Ramirez Colunga',
//             'employeePayrollNum': null,
//             'employeeHireDate': '2024-11-27',
//             'companyId': 1,
//             'departmentId': 1036,
//             'positionId': 1012,
//             'departmentSyncId': null,
//             'positionSyncId': null,
//             'personId': 423,
//             'businessUnitId': 2,
//             'employeeAssistDiscriminator': 1,
//             'employeeLastSynchronizationAt': null,
//             'employeeTypeId': 1,
//             'employeeBusinessEmail': 'wramirez@siler-mx.com',
//             'employeeCreatedAt': '2024-08-30T17:55:40.000+00:00',
//             'employeeUpdatedAt': '2025-03-31T16:54:28.000+00:00',
//             'deletedAt': null,
//             'employeePhoto': 'https://sfo3.digitaloceanspaces.com/sae-assets/sae-bo-system/employees/1730908456455_foto-min.jpg',
//             'employeeWorkSchedule': 'Remote',
//             'employeeTypeOfContract': 'Internal',
//             'employeeTerminatedDate': null
//           }
//         },
//         'proceedingFileType': {
//           'proceedingFileTypeId': 221,
//           'proceedingFileTypeName': 'VISA',
//           'proceedingFileTypeSlug': 'visa',
//           'proceedingFileTypeAreaToUse': 'employee',
//           'proceedingFileTypeActive': 1,
//           'proceedingFileTypeBusinessUnits': 'sae,sae-siler,sae-quorum,cima,cima-siler,cima-quorum',
//           'parentId': null,
//           'proceedingFileTypeCreatedAt': '2025-03-05T19:10:02.000+00:00',
//           'proceedingFileTypeUpdatedAt': '2025-03-05T19:10:02.000+00:00',
//           'deletedAt': null,
//           'emails': [
//             {
//               'proceedingFileTypeEmailId': 3,
//               'proceedingFileTypeId': 221,
//               'proceedingFileTypeEmailEmail': 'wramirez@siler-mx.com',
//               'proceedingFileTypeEmailCreatedAt': '2025-04-02T14:00:51.000+00:00',
//               'proceedingFileTypeEmailUpdatedAt': '2025-04-02T14:00:51.000+00:00',
//               'deletedAt': null
//             }
//           ]
//         }
//       }
//     ],
//     'employeesProceedingFilesExpiring': [
//       {
//         'proceedingFileId': 15,
//         'proceedingFileName': 'Pasaporte Mexicano',
//         'proceedingFilePath': 'https://sfo3.digitaloceanspaces.com/sae-assets/cima-bo-system/proceeding-files/1743551539569_Passport%20Example.avif',
//         'proceedingFileTypeId': 220,
//         'proceedingFileExpirationAt': 'Friday, 04 April 2025',
//         'proceedingFileActive': 1,
//         'proceedingFileCreatedAt': '2025-04-01T23:16:14.000+00:00',
//         'proceedingFileUpdatedAt': '2025-04-01T23:52:19.000+00:00',
//         'deletedAt': null,
//         'proceedingFileUuid': 'wosceccut2f5refcuj56mxcj',
//         'proceedingFileObservations': null,
//         'pilotProceedingFile': null,
//         'flightAttendantProceedingFile': null,
//         'aircraftProceedingFile': null,
//         'customerProceedingFile': null,
//         'employeeProceedingFile': {
//           'employeeProceedingFileId': 6,
//           'employeeId': 412,
//           'proceedingFileId': 15,
//           'employeeProceedingFileCreatedAt': '2025-04-01T23:16:15.000+00:00',
//           'employeeProceedingFileUpdatedAt': '2025-04-01T23:16:15.000+00:00',
//           'deletedAt': null,
//           'employee': {
//             'employeeId': 412,
//             'employeeSyncId': null,
//             'employeeCode': '27800362',
//             'employeeFirstName': 'Wilvardo',
//             'employeeLastName': 'Ramirez Colunga',
//             'employeePayrollNum': null,
//             'employeeHireDate': '2024-11-27',
//             'companyId': 1,
//             'departmentId': 1036,
//             'positionId': 1012,
//             'departmentSyncId': null,
//             'positionSyncId': null,
//             'personId': 423,
//             'businessUnitId': 2,
//             'employeeAssistDiscriminator': 1,
//             'employeeLastSynchronizationAt': null,
//             'employeeTypeId': 1,
//             'employeeBusinessEmail': 'wramirez@siler-mx.com',
//             'employeeCreatedAt': '2024-08-30T17:55:40.000+00:00',
//             'employeeUpdatedAt': '2025-03-31T16:54:28.000+00:00',
//             'deletedAt': null,
//             'employeePhoto': 'https://sfo3.digitaloceanspaces.com/sae-assets/sae-bo-system/employees/1730908456455_foto-min.jpg',
//             'employeeWorkSchedule': 'Remote',
//             'employeeTypeOfContract': 'Internal',
//             'employeeTerminatedDate': null
//           }
//         },
//         'proceedingFileType': {
//           'proceedingFileTypeId': 220,
//           'proceedingFileTypeName': 'PASSPORT',
//           'proceedingFileTypeSlug': 'passport',
//           'proceedingFileTypeAreaToUse': 'employee',
//           'proceedingFileTypeActive': 1,
//           'proceedingFileTypeBusinessUnits': 'sae,sae-siler,sae-quorum,cima,cima-siler,cima-quorum',
//           'parentId': null,
//           'proceedingFileTypeCreatedAt': '2025-03-05T19:09:25.000+00:00',
//           'proceedingFileTypeUpdatedAt': '2025-03-05T19:09:27.000+00:00',
//           'deletedAt': null,
//           'emails': [
//             {
//               'proceedingFileTypeEmailId': 1,
//               'proceedingFileTypeId': 220,
//               'proceedingFileTypeEmailEmail': 'wramirez@siler-mx.com',
//               'proceedingFileTypeEmailCreatedAt': '2024-11-05T16:02:12.000+00:00',
//               'proceedingFileTypeEmailUpdatedAt': '2024-11-05T16:02:12.000+00:00',
//               'deletedAt': null
//             }
//           ]
//         }
//       }
//     ],
//     'pilotsProceedingFilesExpired': [],
//     'pilotsProceedingFilesExpiring': [],
//     'aircraftsProceedingFilesExpired': [],
//     'aircraftsProceedingFilesExpiring': [],
//     'customersProceedingFilesExpired': [],
//     'customersProceedingFilesExpiring': [],
//     'flightAttendantsProceedingFilesExpired': [],
//     'flightAttendantsProceedingFilesExpiring': []
//   }

//   const buildData = {
//     employeesProceedingFilesExpired: data.employeesProceedingFilesExpired || [],
//     employeesProceedingFilesExpiring: data.employeesProceedingFilesExpiring || [],
//     pilotsProceedingFilesExpired: data.pilotsProceedingFilesExpired || [],
//     pilotsProceedingFilesExpiring: data.pilotsProceedingFilesExpiring || [],
//     aircraftsProceedingFilesExpired: data.aircraftsProceedingFilesExpired || [],
//     aircraftsProceedingFilesExpiring: data.aircraftsProceedingFilesExpiring || [],
//     customersProceedingFilesExpired: data.customersProceedingFilesExpired || [],
//     customersProceedingFilesExpiring: data.customersProceedingFilesExpiring || [],
//     flightAttendantsProceedingFilesExpired: data.flightAttendantsProceedingFilesExpired || [],
//     flightAttendantsProceedingFilesExpiring: data.flightAttendantsProceedingFilesExpiring || [],
//     backgroundImageLogo: 'https://sfo3.digitaloceanspaces.com/sae-assets/sae-bo-system/system-settings/1737825721033_logo_sae.png',
//   }

//   return view.render('emails/proceeding_files_report', buildData)
// })
