import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemFeature from '#models/system_feature'

/**
 * Semilla idempotente del catálogo de funcionalidades de negocio de Valanserh.
 *
 * Cubre los 33 módulos existentes en system_modules con sus funcionalidades actuales.
 * Todas las funcionalidades se registran con status "disponible" porque ya están
 * en producción. Las funcionalidades de compliance (NOM-035, NOM-037, etc.) las
 * siembra cada épica funcional correspondiente con su propio módulo y status.
 *
 * Idempotencia: upsert sobre (system_module_id, system_feature_slug).
 */
export default class extends BaseSeeder {
  async run() {
    const features: Array<{
      systemModuleId: number
      systemFeatureName: string
      systemFeatureSlug: string
      systemFeatureDescription: string | null
      systemFeatureStatus: 'disponible'
    }> = [
      // ──────────────────────────────────────────────────────────────────────
      // Módulo 1 — Empleados
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 1,
        systemFeatureName: 'Alta y edición de empleado',
        systemFeatureSlug: 'employee-create-edit',
        systemFeatureDescription: 'Crear y modificar el perfil laboral de un empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Baja de empleado',
        systemFeatureSlug: 'employee-offboarding',
        systemFeatureDescription: 'Registrar la baja y fecha de término de un empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Expediente digital del empleado',
        systemFeatureSlug: 'employee-proceeding-file',
        systemFeatureDescription: 'Gestión de documentos del expediente laboral por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Asignación de sucursal',
        systemFeatureSlug: 'employee-branch-assignment',
        systemFeatureDescription: 'Asignar o reasignar al empleado a una unidad de negocio',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Asignación de turno',
        systemFeatureSlug: 'employee-shift-assignment',
        systemFeatureDescription: 'Asignar el turno laboral vigente al empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Préstamo temporal a otra sucursal',
        systemFeatureSlug: 'employee-temporary-assignment',
        systemFeatureDescription: 'Registrar un préstamo temporal del empleado a otra sucursal',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 1,
        systemFeatureName: 'Exportación de empleados',
        systemFeatureSlug: 'employee-export',
        systemFeatureDescription: 'Descargar el listado de empleados en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 2 — Departamentos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 2,
        systemFeatureName: 'Alta y edición de departamento',
        systemFeatureSlug: 'department-create-edit',
        systemFeatureDescription: 'Crear y modificar la información de un departamento',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 2,
        systemFeatureName: 'Desactivar departamento',
        systemFeatureSlug: 'department-deactivate',
        systemFeatureDescription: 'Dar de baja lógica un departamento del catálogo',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 3 — Puestos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 3,
        systemFeatureName: 'Alta y edición de puesto',
        systemFeatureSlug: 'position-create-edit',
        systemFeatureDescription: 'Crear y modificar la descripción de un puesto de trabajo',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 3,
        systemFeatureName: 'Ficha PDF del puesto',
        systemFeatureSlug: 'position-pdf-sheet',
        systemFeatureDescription: 'Generar el PDF de la descripción de puesto',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 3,
        systemFeatureName: 'Exportación de puestos a Excel',
        systemFeatureSlug: 'position-export-excel',
        systemFeatureDescription: 'Descargar el catálogo de puestos en formato Excel',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 3,
        systemFeatureName: 'Perfiles de evaluación por puesto',
        systemFeatureSlug: 'position-assessment-profiles',
        systemFeatureDescription: 'Definir rangos esperados por dimensión de evaluación para cada puesto',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 3,
        systemFeatureName: 'Requerimientos de certificaciones por puesto',
        systemFeatureSlug: 'position-certification-requirements',
        systemFeatureDescription: 'Configurar las certificaciones obligatorias para un puesto',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 4 — Periodos Vacacionales
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 4,
        systemFeatureName: 'Configuración de periodos vacacionales',
        systemFeatureSlug: 'vacation-settings-manage',
        systemFeatureDescription: 'Definir días de vacaciones por antigüedad conforme a la LFT',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 5 — Usuarios
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 5,
        systemFeatureName: 'Alta y edición de usuario',
        systemFeatureSlug: 'user-create-edit',
        systemFeatureDescription: 'Crear y modificar credenciales y datos del usuario del sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 5,
        systemFeatureName: 'Desactivar usuario',
        systemFeatureSlug: 'user-deactivate',
        systemFeatureDescription: 'Deshabilitar el acceso de un usuario al sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 5,
        systemFeatureName: 'Asignación de acceso a unidades de negocio',
        systemFeatureSlug: 'user-business-unit-access',
        systemFeatureDescription: 'Controlar a qué sucursales tiene acceso un usuario',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 6 — Asistencia por departamento
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 6,
        systemFeatureName: 'Monitor de asistencia por departamento',
        systemFeatureSlug: 'dept-attendance-monitor',
        systemFeatureDescription: 'Visualizar el estado de asistencia diaria agrupado por departamento',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 6,
        systemFeatureName: 'Exportación de asistencia por departamento',
        systemFeatureSlug: 'dept-attendance-export',
        systemFeatureDescription: 'Descargar el reporte de asistencia departamental en Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 7 — Asistencia por empleados
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 7,
        systemFeatureName: 'Monitor de asistencia por empleado',
        systemFeatureSlug: 'employee-attendance-monitor',
        systemFeatureDescription: 'Visualizar el detalle de asistencia diaria por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 7,
        systemFeatureName: 'Exportación de asistencia por empleado',
        systemFeatureSlug: 'employee-attendance-export',
        systemFeatureDescription: 'Descargar el reporte de asistencia por empleado en Excel',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 7,
        systemFeatureName: 'Estadísticas agregadas de asistencia',
        systemFeatureSlug: 'attendance-aggregate-stats',
        systemFeatureDescription: 'Visualizar métricas de asistencia agregadas por rango de fechas',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 8 — Roles y permisos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 8,
        systemFeatureName: 'Gestión de roles',
        systemFeatureSlug: 'role-manage',
        systemFeatureDescription: 'Crear, editar y desactivar roles del sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 8,
        systemFeatureName: 'Asignación de permisos a roles',
        systemFeatureSlug: 'role-permission-assignment',
        systemFeatureDescription: 'Configurar qué módulos y acciones puede ejecutar cada rol',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 9 — Pilots (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 9,
        systemFeatureName: 'Gestión de pilotos',
        systemFeatureSlug: 'pilot-manage',
        systemFeatureDescription: 'Administrar el catálogo de pilotos y sus habilitaciones',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 10 — Flight Attendants (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 10,
        systemFeatureName: 'Gestión de sobrecargos',
        systemFeatureSlug: 'flight-attendant-manage',
        systemFeatureDescription: 'Administrar el catálogo de sobrecargos y su asignación',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 11 — Customers (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 11,
        systemFeatureName: 'Gestión de clientes',
        systemFeatureSlug: 'customer-manage',
        systemFeatureDescription: 'Administrar el catálogo de clientes y sus datos de contacto',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 12 — Turnos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 12,
        systemFeatureName: 'Alta y edición de turno',
        systemFeatureSlug: 'shift-create-edit',
        systemFeatureDescription: 'Crear y modificar turnos laborales con sus horarios y descansos',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 12,
        systemFeatureName: 'Excepciones de turno',
        systemFeatureSlug: 'shift-exceptions',
        systemFeatureDescription: 'Registrar modificaciones puntuales al turno de un empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 13 — Festividades
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 13,
        systemFeatureName: 'Gestión de días festivos',
        systemFeatureSlug: 'holiday-manage',
        systemFeatureDescription: 'Configurar los días festivos oficiales y adicionales por sucursal',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 14 — Ajustes Generales
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 14,
        systemFeatureName: 'Configuración general del sistema',
        systemFeatureSlug: 'system-settings-manage',
        systemFeatureDescription: 'Gestionar parámetros globales: tolerancias, correos, etc.',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 15 — Aircraft Class (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 15,
        systemFeatureName: 'Gestión de clases de aeronave',
        systemFeatureSlug: 'aircraft-class-manage',
        systemFeatureDescription: 'Administrar el catálogo de clases de aeronave',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 16 — Aircraft Properties (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 16,
        systemFeatureName: 'Gestión de propiedades de aeronave',
        systemFeatureSlug: 'aircraft-properties-manage',
        systemFeatureDescription: 'Administrar las propiedades configurables de las aeronaves',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 17 — Airports (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 17,
        systemFeatureName: 'Gestión de aeropuertos',
        systemFeatureSlug: 'airport-manage',
        systemFeatureDescription: 'Administrar el catálogo de aeropuertos y sus coordenadas',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 18 — Aircraft (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 18,
        systemFeatureName: 'Gestión de aeronaves',
        systemFeatureSlug: 'aircraft-manage',
        systemFeatureDescription: 'Administrar el inventario de aeronaves y su información técnica',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 19 — Matriz de vencimientos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 19,
        systemFeatureName: 'Vista de matriz de vencimientos',
        systemFeatureSlug: 'expiration-matrix-view',
        systemFeatureDescription: 'Visualizar el estado de vencimiento de documentos por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 19,
        systemFeatureName: 'Exportación de matriz de vencimientos',
        systemFeatureSlug: 'expiration-matrix-export',
        systemFeatureDescription: 'Descargar la matriz de vencimientos en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 20 — Organization Chart (vista legacy aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 20,
        systemFeatureName: 'Vista del organigrama legacy',
        systemFeatureSlug: 'org-chart-legacy-view',
        systemFeatureDescription: 'Visualizar la estructura organizacional en formato de árbol (módulo legacy)',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 21 — Proceeding File Type
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 21,
        systemFeatureName: 'Gestión de tipos de expediente',
        systemFeatureSlug: 'proceeding-file-type-manage',
        systemFeatureDescription: 'Crear y configurar los tipos de documentos del expediente laboral',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 22 — Shift Exception Requests
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 22,
        systemFeatureName: 'Solicitudes de excepción de turno',
        systemFeatureSlug: 'shift-exception-request-manage',
        systemFeatureDescription: 'Gestionar solicitudes de permisos, retardos y ausencias del empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 23 — Aircraft Operators (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 23,
        systemFeatureName: 'Gestión de operadores de aeronave',
        systemFeatureSlug: 'aircraft-operator-manage',
        systemFeatureDescription: 'Administrar el catálogo de operadores de aeronaves',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 24 — Reservations (aviación)
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 24,
        systemFeatureName: 'Gestión de reservaciones',
        systemFeatureSlug: 'reservation-manage',
        systemFeatureDescription: 'Administrar reservaciones de vuelo con tripulación y aeronave',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 25 — Organigrama
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 25,
        systemFeatureName: 'Visualización del organigrama',
        systemFeatureSlug: 'org-chart-view',
        systemFeatureDescription: 'Ver la estructura jerárquica de departamentos y puestos',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 25,
        systemFeatureName: 'Mover departamentos y puestos en el organigrama',
        systemFeatureSlug: 'org-chart-move',
        systemFeatureDescription: 'Reorganizar departamentos y puestos mediante drag-and-drop',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 26 — Cumpleaños
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 26,
        systemFeatureName: 'Calendario de cumpleaños',
        systemFeatureSlug: 'birthday-calendar-view',
        systemFeatureDescription: 'Ver los cumpleaños del mes de los empleados activos',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 27 — Vacaciones
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 27,
        systemFeatureName: 'Calendario de vacaciones',
        systemFeatureSlug: 'vacation-calendar-view',
        systemFeatureDescription: 'Ver los periodos de vacaciones aprobados en el mes',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 28 — Aniversarios
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 28,
        systemFeatureName: 'Calendario de aniversarios laborales',
        systemFeatureSlug: 'work-anniversary-calendar-view',
        systemFeatureDescription: 'Ver los aniversarios de antigüedad laboral del mes',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 29 — Activos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 29,
        systemFeatureName: 'Gestión de activos',
        systemFeatureSlug: 'supply-manage',
        systemFeatureDescription: 'Administrar el inventario de activos asignados a empleados',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 29,
        systemFeatureName: 'Asignación de activos a empleado',
        systemFeatureSlug: 'supply-employee-assignment',
        systemFeatureDescription: 'Registrar la entrega y devolución de activos por empleado',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 30 — Zonas
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 30,
        systemFeatureName: 'Gestión de zonas',
        systemFeatureSlug: 'zone-manage',
        systemFeatureDescription: 'Crear y configurar zonas geográficas asociadas a sucursales',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 31 — Historial de permisos
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 31,
        systemFeatureName: 'Historial de excepciones de turno',
        systemFeatureSlug: 'shift-exception-history',
        systemFeatureDescription: 'Consultar el historial de permisos, retardos y ausencias por empleado',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 31,
        systemFeatureName: 'Exportación del historial de permisos',
        systemFeatureSlug: 'shift-exception-history-export',
        systemFeatureDescription: 'Descargar el historial de excepciones en formato Excel',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 32 — Avisos y noticias
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 32,
        systemFeatureName: 'Publicación de avisos y noticias',
        systemFeatureSlug: 'notice-publish',
        systemFeatureDescription: 'Crear y publicar avisos internos o noticias para los empleados',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 32,
        systemFeatureName: 'Envío de notificación por correo',
        systemFeatureSlug: 'notice-email-notification',
        systemFeatureDescription: 'Enviar un correo a los empleados al publicar un aviso',
        systemFeatureStatus: 'disponible',
      },

      // ──────────────────────────────────────────────────────────────────────
      // Módulo 33 — Puntos de acceso
      // ──────────────────────────────────────────────────────────────────────
      {
        systemModuleId: 33,
        systemFeatureName: 'Gestión de puntos de acceso ZKSync',
        systemFeatureSlug: 'access-point-manage',
        systemFeatureDescription: 'Administrar los dispositivos ZKSync conectados al sistema',
        systemFeatureStatus: 'disponible',
      },
      {
        systemModuleId: 33,
        systemFeatureName: 'Sincronización de asistencia ZKSync',
        systemFeatureSlug: 'access-point-sync',
        systemFeatureDescription: 'Sincronizar los registros de asistencia desde dispositivos ZKSync',
        systemFeatureStatus: 'disponible',
      },
    ]

    for (const feature of features) {
      await SystemFeature.updateOrCreate(
        {
          systemModuleId: feature.systemModuleId,
          systemFeatureSlug: feature.systemFeatureSlug,
        },
        {
          systemFeatureName: feature.systemFeatureName,
          systemFeatureDescription: feature.systemFeatureDescription,
          systemFeatureStatus: feature.systemFeatureStatus,
        }
      )
    }
  }
}
