import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModule from '../../app/models/system_module.js'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const systemModules = [
      {
        systemModuleId: 1,
        systemModuleName: 'Empleados',
        systemModuleSlug: 'employees',
        systemModuleDescription: 'employees',
        systemModules: 1,
        systemModulePath: '/employees',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.754 14a2.249 2.249 0 0 1 2.25 2.249v.918a2.75 2.75 0 0 1-.513 1.599C17.945 20.929 15.42 22 12 22c-3.422 0-5.945-1.072-7.487-3.237a2.75 2.75 0 0 1-.51-1.595v-.92a2.249 2.249 0 0 1 2.249-2.25h11.501ZM12 2.004a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 4,
        systemModuleName: 'Periodos Vacacionales',
        systemModuleSlug: 'vacations',
        systemModuleDescription: 'vacation settings',
        systemModules: 1,
        systemModulePath: '/vacations',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M15.25 3a.75.75 0 0 1 .75.75V7h1.75A3.25 3.25 0 0 1 21 10.25v6.5A3.25 3.25 0 0 1 17.75 20H6.25A3.25 3.25 0 0 1 3 16.75v-6.5A3.25 3.25 0 0 1 6.25 7H8V3.75a.75.75 0 0 1 .648-.743L8.75 3h6.5Zm-.75 1.5h-5V7h5V4.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 5,
        systemModuleName: 'Usuarios',
        systemModuleSlug: 'users',
        systemModuleDescription: 'users',
        systemModules: 1,
        systemModulePath: '/users',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 14.05V14H4.253a2.249 2.249 0 0 0-2.25 2.25v.919c0 .572.18 1.13.511 1.596C4.056 20.929 6.58 22 10 22c.715 0 1.39-.046 2.026-.14A2.51 2.51 0 0 1 12 21.5v-5a2.5 2.5 0 0 1 2-2.45ZM10 2.005a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM15 15v-1a2.5 2.5 0 0 1 5 0v1h.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5h.5Zm1.5-1v1h2v-1a1 1 0 1 0-2 0Zm2 5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 6,
        systemModuleName: 'Asistencia por departamento',
        systemModuleSlug: 'departments-attendance-monitor',
        systemModuleDescription: 'departments attendance monitor',
        systemModules: 1,
        systemModulePath: '/departments-attendance-monitor',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.75 3A3.25 3.25 0 0 1 21 6.25V7H3v-.75A3.25 3.25 0 0 1 6.25 3h11.5ZM21 8.5v3.522A6.5 6.5 0 0 0 12.022 21H6.25A3.25 3.25 0 0 1 3 17.75V8.5h18Z" fill="#ffffff" class="fill-212121"></path><path d="M23 17.5a5.5 5.5 0 1 0-11 0 5.5 5.5 0 0 0 11 0Zm-5.5 0h2a.5.5 0 1 1 0 1H17a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 1 0v2.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 7,
        systemModuleName: 'Asistencia por empleados',
        systemModuleSlug: 'employees-attendance-monitor',
        systemModuleDescription: 'employees attendance monitor',
        systemModules: 1,
        systemModulePath: '/employees-attendance-monitor',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 8.5V11a3.75 3.75 0 1 0-5.55 5h-.95a2.5 2.5 0 0 0-2.5 2.5v.5c0 .7.17 1.379.488 2H6.25A3.25 3.25 0 0 1 3 17.75V8.5h18ZM17.75 3A3.25 3.25 0 0 1 21 6.25V7H3v-.75A3.25 3.25 0 0 1 6.25 3h11.5Z" fill="#ffffff" class="fill-212121"></path><path d="M23 18.5a1.5 1.5 0 0 0-1.5-1.5h-7a1.5 1.5 0 0 0-1.5 1.5v.5c0 1.971 1.86 4 5 4 3.14 0 5-2.029 5-4v-.5ZM20.75 13.25a2.75 2.75 0 1 0-5.5 0 2.75 2.75 0 0 0 5.5 0Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 8,
        systemModuleName: 'Roles y permisos',
        systemModuleSlug: 'roles-and-permissions',
        systemModuleDescription: 'roles and permissions',
        systemModules: 1,
        systemModulePath: '/roles-and-permissions',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a4 4 0 0 1 4 4v2h2.5A1.5 1.5 0 0 1 18 9.5V11c-.319 0-.637.11-.896.329l-.107.1c-.812.845-1.656 1.238-2.597 1.238-.783 0-1.4.643-1.4 1.416v2.501c0 2.374.924 4.22 2.68 5.418L3.5 22A1.5 1.5 0 0 1 2 20.5v-11A1.5 1.5 0 0 1 3.5 8H6V6a4 4 0 0 1 4-4Zm8.284 10.122c.992 1.036 2.091 1.545 3.316 1.545.193 0 .355.143.392.332l.008.084v2.501c0 2.682-1.313 4.506-3.873 5.395a.385.385 0 0 1-.253 0c-2.476-.86-3.785-2.592-3.87-5.13L14 16.585v-2.5c0-.23.18-.417.4-.417 1.223 0 2.323-.51 3.318-1.545a.389.389 0 0 1 .566 0ZM10 13.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 12,
        systemModuleName: 'Turnos',
        systemModuleSlug: 'shifts',
        systemModuleDescription: 'shifts',
        systemModules: 1,
        systemModulePath: '/shifts',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 8.5v9.25A3.25 3.25 0 0 1 17.75 21H6.25A3.25 3.25 0 0 1 3 17.75V8.5h18ZM7.25 15a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM12 15a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm-4.75-4.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.75 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.75 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm1-7.5A3.25 3.25 0 0 1 21 6.25V7H3v-.75A3.25 3.25 0 0 1 6.25 3h11.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 13,
        systemModuleName: 'Festividades',
        systemModuleSlug: 'holidays',
        systemModuleDescription: 'holidays',
        systemModules: 1,
        systemModulePath: '/holidays',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.5 12a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM21 8.5l.001 3.523a6.5 6.5 0 0 0-8.979 8.979L6.25 21A3.25 3.25 0 0 1 3 17.75V8.5h18Zm-4.016 5.546-.04.098-.556 1.787h-1.803c-.532 0-.772.668-.417 1.036l.074.065 1.458 1.105-.557 1.787c-.165.53.375.975.821.73l.078-.05L17.5 19.5l1.458 1.104c.433.328 1.006-.07.92-.588l-.021-.092-.557-1.787 1.458-1.105c.43-.326.248-1.014-.247-1.093l-.096-.008h-1.803l-.557-1.787a.576.576 0 0 0-1.071-.098ZM17.75 3A3.25 3.25 0 0 1 21 6.25V7H3v-.75A3.25 3.25 0 0 1 6.25 3h11.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 14,
        systemModuleName: 'Ajustes Generales',
        systemModuleSlug: 'system-settings',
        systemModuleDescription: 'system settings',
        systemModules: 1,
        systemModulePath: '/system-settings',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.012 2.25c.734.008 1.465.093 2.182.253a.75.75 0 0 1 .582.649l.17 1.527a1.384 1.384 0 0 0 1.927 1.116l1.401-.615a.75.75 0 0 1 .85.174 9.792 9.792 0 0 1 2.204 3.792.75.75 0 0 1-.271.825l-1.242.916a1.381 1.381 0 0 0 0 2.226l1.243.915a.75.75 0 0 1 .272.826 9.797 9.797 0 0 1-2.204 3.792.75.75 0 0 1-.848.175l-1.407-.617a1.38 1.38 0 0 0-1.926 1.114l-.169 1.526a.75.75 0 0 1-.572.647 9.518 9.518 0 0 1-4.406 0 .75.75 0 0 1-.572-.647l-.168-1.524a1.382 1.382 0 0 0-1.926-1.11l-1.406.616a.75.75 0 0 1-.849-.175 9.798 9.798 0 0 1-2.204-3.796.75.75 0 0 1 .272-.826l1.243-.916a1.38 1.38 0 0 0 0-2.226l-1.243-.914a.75.75 0 0 1-.271-.826 9.793 9.793 0 0 1 2.204-3.792.75.75 0 0 1 .85-.174l1.4.615a1.387 1.387 0 0 0 1.93-1.118l.17-1.526a.75.75 0 0 1 .583-.65c.717-.159 1.45-.243 2.201-.252ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 19,
        systemModuleName: 'Matriz de expiraciones',
        systemModuleSlug: 'documents-expiration-matrix',
        systemModuleDescription: 'documents expiration matrix',
        systemModules: 1,
        systemModulePath: '/documents-expiration-matrix',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.75 3A3.25 3.25 0 0 1 21 6.25v11.5A3.25 3.25 0 0 1 17.75 21H6.25A3.25 3.25 0 0 1 3 17.75V6.25A3.25 3.25 0 0 1 6.25 3h11.5Zm-10 10.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm-4.25-5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 21,
        systemModuleName: 'Proceeding File Type',
        systemModuleSlug: 'proceeding-file-types',
        systemModuleDescription: 'proceeding file types',
        systemModules: 1,
        systemModulePath: '/proceeding-file-types',
        systemModuleGroup: '5. Otros',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 8V2H6a2 2 0 0 0-2 2v9.5h6.5a2 2 0 1 1 0 4H4V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10h-6a2 2 0 0 1-2-2Zm-4.5 3.75a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm0 7.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM13.5 8V2.5l6 6H14a.5.5 0 0 1-.5-.5ZM2.75 14.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 22,
        systemModuleName: 'Shift Exception Requests',
        systemModuleSlug: 'shift-exception-requests',
        systemModuleDescription: 'Shift exception requests',
        systemModules: 1,
        systemModulePath: '/exception-requests',
        systemModuleGroup: '5. Otros',
        systemModuleActive: 1,
        systemModuleIcon: '<svg viewBox="0 0 30 30" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 30 30"><path d="M15 3C8.373 3 3 8.373 3 15s5.373 12 12 12 12-5.373 12-12S21.627 3 15 3zm0 15-5.707-5.707a.999.999 0 1 1 1.414-1.414L15 15.172l5.293-5.293a.999.999 0 1 1 1.414 1.414L15 18zM3 22.184V25a2 2 0 0 0 2 2h2.816A14.032 14.032 0 0 1 3 22.184zM22.184 27H25a2 2 0 0 0 2-2v-2.816A14.032 14.032 0 0 1 22.184 27z" fill="#ffffff" class="fill-000000"></path></svg>'
      },
      {
        systemModuleId: 25,
        systemModuleName: 'Organigrama',
        systemModuleSlug: 'organization-chart',
        systemModuleDescription: 'Organization Chart',
        systemModules: 1,
        systemModulePath: '/organization-chart',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7.998 5.75A3.752 3.752 0 1 1 12.5 9.427V11.5h3.25A2.25 2.25 0 0 1 18 13.75v.824a3.754 3.754 0 0 1-.748 7.43 3.752 3.752 0 0 1-.752-7.429v-.825a.75.75 0 0 0-.75-.75h-8a.75.75 0 0 0-.75.75v.824a3.754 3.754 0 0 1-.748 7.43 3.752 3.752 0 0 1-.752-7.429v-.825a2.25 2.25 0 0 1 2.25-2.25H11V9.427A3.754 3.754 0 0 1 7.998 5.75Z" fill="#ffffff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 26,
        systemModuleName: 'Cumpleaños',
        systemModuleSlug: 'birthdays-calendar',
        systemModuleDescription: 'birthdays-calendar',
        systemModules: 1,
        systemModulePath: '/birthdays-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon: '<svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 7c1.714 0 2-1.34 2-2.444C14 3.45 13.262 1.5 12 1.5s-2 1.951-2 3.056C10 5.66 10.286 7 12 7ZM3.5 10.25A2.25 2.25 0 0 1 5.75 8h12.5a2.25 2.25 0 0 1 2.25 2.25v.875l-3.634 2.726a1.25 1.25 0 0 1-1.384.077l-2.04-1.2a2.75 2.75 0 0 0-2.884.06l-1.761 1.136a1.25 1.25 0 0 1-1.35.003L3.5 11.408V10.25Z" fill="#fff" class="fill-212121"></path><path d="M3.5 13.188V18.5h-.75a.75.75 0 0 0 0 1.5h18.5a.75.75 0 0 0 0-1.5h-.75V13l-2.734 2.05a2.75 2.75 0 0 1-3.044.171l-2.04-1.2a1.25 1.25 0 0 0-1.311.027l-1.76 1.136a2.75 2.75 0 0 1-2.971.008L3.5 13.187Z" fill="#fff" class="fill-212121"></path></svg>'
      },
      {
        systemModuleId: 27,
        systemModuleName: 'Vacaciones',
        systemModuleSlug: 'vacations-calendar',
        systemModuleDescription: 'vacations-calendar',
        systemModules: 1,
        systemModulePath: '/vacations-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon: '<svg viewBox="0 0 512 512" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 512 512"><path d="M443.9 109.1h-50.8V64.2c8.7-1 15.5-8.3 15.5-17.3 0-9.6-7.8-17.4-17.4-17.4h-87.6c-9.6 0-17.4 7.8-17.4 17.4 0 8.6 6.2 15.7 14.4 17.2v45.1h-55.1c-11.8 0-21.4 9.6-21.4 21.5v24.6h38c12.4 0 23.3 6.7 29.2 16.7h115.9c3.9 0 7 3.1 7 7s-3.1 7-7 7H389v9.9c0 3.9-3.1 7-7 7s-7-3.1-7-7V186h-77.9c-.4 0-.8 0-1.2-.1h-.1c.1 1.1.2 2.2.2 3.3v44.9h48.8c20.9 0 38 17 38 38v186.8c0 9.1-3.2 17.4-8.6 24H444c11.8 0 21.4-9.6 21.4-21.4v-331c-.1-11.8-9.7-21.4-21.5-21.4zm-129.3 0V64.3h64.5v44.8h-64.5zM46.7 271.9v186.8c0 13.3 10.7 24 24 24h33.6V247.9H70.7c-13.3 0-24 10.7-24 24z" fill="#fff" class="fill-333333"></path><path d="M344.7 247.9h-33.6v234.7h33.6c13.2 0 24-10.7 24-24V271.9c0-13.3-10.8-24-24-24zM176.6 247.9h62.1v234.7h-62.1z" fill="#fff" class="fill-333333"></path><path d="M281.9 247.9V189c0-11-8.9-19.9-19.9-19.9H153.4c-11 0-19.9 8.9-19.9 19.9v58.9h-15.2v234.7h44.3V247.9h-15.2V189c0-3.3 2.6-5.9 5.9-5.9H262c3.3 0 5.9 2.6 5.9 5.9v58.9h-15.2v234.7H297V247.9h-15.1z" fill="#fff" class="fill-333333"></path></svg>'
      },
      {
        systemModuleId: 28,
        systemModuleName: 'Aniversarios',
        systemModuleSlug: 'work-anniversaries-calendar',
        systemModuleDescription: 'work-anniversaries-calendar',
        systemModules: 1,
        systemModulePath: '/work-anniversaries-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="#63E6BE" d="M144.3 0l224 0c26.5 0 48.1 21.8 47.1 48.2-.2 5.3-.4 10.6-.7 15.8l49.6 0c26.1 0 49.1 21.6 47.1 49.8-7.5 103.7-60.5 160.7-118 190.5-15.8 8.2-31.9 14.3-47.2 18.8-20.2 28.6-41.2 43.7-57.9 51.8l0 73.1 64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64 0 0-73.1c-16-7.7-35.9-22-55.3-48.3-18.4-4.8-38.4-12.1-57.9-23.1-54.1-30.3-102.9-87.4-109.9-189.9-1.9-28.1 21-49.7 47.1-49.7l49.6 0c-.3-5.2-.5-10.4-.7-15.8-1-26.5 20.6-48.2 47.1-48.2zM101.5 112l-52.4 0c6.2 84.7 45.1 127.1 85.2 149.6-14.4-37.3-26.3-86-32.8-149.6zM380 256.8c40.5-23.8 77.1-66.1 83.3-144.8L411 112c-6.2 60.9-17.4 108.2-31 144.8z"/></svg>'
      },
      {
        systemModuleId: 29,
        systemModuleName: 'Activos',
        systemModuleSlug: 'supplies',
        systemModuleDescription: 'supplies',
        systemModules: 1,
        systemModulePath: '/supplies',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg'
      },
      {
        systemModuleId: 30,
        systemModuleName: 'Zonas',
        systemModuleSlug: 'zonas',
        systemModuleDescription: 'zonas',
        systemModules: 1,
        systemModulePath: '/zones',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-geo-alt-fill" viewBox="0 0 16 16">\n  <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6"/>\n</svg>'
      }
    ]

    for (const systemModule of systemModules) {
      const { systemModuleId, ...systemModuleData } = systemModule
      // updateOrCreate: actualiza el módulo si ya existe, lo crea si no existe
      await SystemModule.updateOrCreate(
        { systemModuleId },
        {
          ...systemModuleData,
          systemModules: String(systemModuleData.systemModules),
          systemModuleUpdatedAt: DateTime.now(),
        }
      )
    }
  }
}
