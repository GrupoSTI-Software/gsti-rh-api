import { toBusinessDateString, todayInBusinessZone } from '#utils/business_date'
import { EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS } from './employee_proceeding_file_summary.constants.js'
import { EmployeeProceedingFileSummaryError } from './employee_proceeding_file_summary.error.js'
import type {
  EmployeeProceedingFileSummaryRepository,
  EmployeeProceedingFileSummaryScope,
  EmployeeProceedingFolderRecord,
} from './employee_proceeding_file_summary.repository.js'
import EmployeeProceedingFileSummaryRepositoryMysql from './employee_proceeding_file_summary.repository.mysql.js'
import type {
  EmployeeProceedingFileSummaryDto,
  EmployeeProceedingFileSummaryFolderDto,
} from './dto/employee_proceeding_file_summary.dto.js'

/** La carpeta aplica al empleado: general, o exclusiva con el empleado asignado. */
function appliesToEmployee(folder: EmployeeProceedingFolderRecord): boolean {
  return !folder.isExclusive || folder.assignedToEmployee
}

/**
 * Carpetas visibles para el empleado, en orden de recorrido (raíz y después
 * sus descendientes; hermanos por id, para que la respuesta sea estable). Replica el filtro del expediente del backoffice: una
 * carpeta exclusiva sin el empleado asignado se oculta junto con todo su
 * subárbol, aunque algún descendiente sí lo tenga asignado.
 */
export function resolveVisibleFolders(
  folders: readonly EmployeeProceedingFolderRecord[]
): EmployeeProceedingFolderRecord[] {
  const childrenByParent = new Map<number | null, EmployeeProceedingFolderRecord[]>()
  for (const folder of folders) {
    const siblings = childrenByParent.get(folder.parentId) ?? []
    siblings.push(folder)
    childrenByParent.set(folder.parentId, siblings)
  }

  const visible: EmployeeProceedingFolderRecord[] = []
  const visited = new Set<number>()
  const walk = (parentId: number | null): void => {
    for (const folder of childrenByParent.get(parentId) ?? []) {
      // `visited` protege de un `parent_id` en ciclo: cada carpeta se cuenta una vez.
      if (visited.has(folder.proceedingFileTypeId) || !appliesToEmployee(folder)) continue
      visited.add(folder.proceedingFileTypeId)
      visible.push(folder)
      walk(folder.proceedingFileTypeId)
    }
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.proceedingFileTypeId - right.proceedingFileTypeId)
  }
  walk(null)

  return visible
}

/**
 * Resumen del expediente de un empleado: conteos por carpeta, contratos y
 * totales para la cabecera de la sección "Expediente" del backoffice.
 */
export default class EmployeeProceedingFileSummaryService {
  constructor(
    private readonly repository: EmployeeProceedingFileSummaryRepository = new EmployeeProceedingFileSummaryRepositoryMysql()
  ) {}

  /**
   * @throws EmployeeProceedingFileSummaryError 404 si el empleado no existe en el tenant.
   */
  async summarize(
    scope: EmployeeProceedingFileSummaryScope
  ): Promise<EmployeeProceedingFileSummaryDto> {
    if (!(await this.repository.employeeExists(scope))) {
      throw EmployeeProceedingFileSummaryError.employeeNotFound()
    }

    const horizon = toBusinessDateString(
      todayInBusinessZone().plus({ days: EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS })
    )
    const [folderRecords, fileCounts, contractsCount] = await Promise.all([
      this.repository.findFolders(scope),
      this.repository.countFilesByFolder({ ...scope, horizon }),
      this.repository.countContracts(scope),
    ])

    const visibleFolders = resolveVisibleFolders(folderRecords)
    const countsByFolder = new Map(fileCounts.map((count) => [count.proceedingFileTypeId, count]))
    const subfoldersByParent = new Map<number, number>()
    for (const folder of visibleFolders) {
      if (folder.parentId !== null) {
        subfoldersByParent.set(folder.parentId, (subfoldersByParent.get(folder.parentId) ?? 0) + 1)
      }
    }

    let filesInVisibleFolders = 0
    let expiringOrExpired = 0
    const folders: EmployeeProceedingFileSummaryFolderDto[] = visibleFolders.map((folder) => {
      const counts = countsByFolder.get(folder.proceedingFileTypeId)
      filesInVisibleFolders += counts?.documents ?? 0
      expiringOrExpired += counts?.expiringOrExpired ?? 0
      return {
        proceedingFileTypeId: folder.proceedingFileTypeId,
        documentsCount: counts?.documents ?? 0,
        subfoldersCount: subfoldersByParent.get(folder.proceedingFileTypeId) ?? 0,
      }
    })

    return {
      windowDays: EMPLOYEE_PROCEEDING_FILE_SUMMARY_EXPIRING_WINDOW_DAYS,
      totals: {
        documents: filesInVisibleFolders + contractsCount,
        // +1: la carpeta virtual "Contratos" que el backoffice pinta en la raíz.
        folders: visibleFolders.length + 1,
        expiringOrExpired,
      },
      contracts: { documents: contractsCount },
      folders,
    }
  }
}
