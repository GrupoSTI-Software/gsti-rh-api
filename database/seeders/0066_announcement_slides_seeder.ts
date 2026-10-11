import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import env from '#start/env'
import AnnouncementSlide from '#models/announcement_slide'
import UploadService from '#services/upload_service'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import AnnouncementSlideRepositoryMysql from '#modules/announcements/announcement_slide.repository.mysql'
import { ANNOUNCEMENT_BANNER_FOLDER } from '#modules/announcements/announcements.constants'
import { sanitizeAnnouncementSlideHtml } from '#modules/announcements/domain/announcement_slide_html'
import { isDeclaredPermissionKey } from '#modules/announcements/domain/permission_key'

/** Carpeta de los banners iniciales (se copia al build por `metaFiles` de adonisrc). */
const ASSETS_DIR = 'database/seeders/assets/announcements'

/**
 * Clave del permiso del listado de empleados, tomada de su declaración del gate: el
 * slug nunca se escribe a mano (`.claude/rules/catalogo-modulos-permisos.md`).
 */
function employeesListPermissionKey(): string {
  const { module, action } = EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployees
  if (typeof action !== 'string') {
    throw new Error('La declaración del listado de empleados debe exigir una sola acción')
  }
  return `${module}:${action}`
}

interface SeedSlide {
  title: string
  body: string
  banner: string
  permissionKey: string | null
}

/**
 * Semilla idempotente de los cuatro slides de bienvenida del deck de anuncios,
 * publicados y en este orden (`sort_order` 1 a 4).
 *
 * Idempotencia: la llave es tipo `onboarding` + título. Un slide que ya existe no
 * se reescribe (la consola de plataforma pudo haberlo editado); solo se le sube el
 * banner si aún no tiene.
 *
 * Banners: se suben privados a `{AWS_ROOT_PATH}/announcement-slides/seed-<archivo>`
 * (llave determinista: reintentar no duplica objetos). Con
 * `ANNOUNCEMENTS_SEED_SKIP_BANNERS=true`, o si la subida falla, el slide queda con
 * `banner_path` null y el seeder sigue; el banner se sube después desde la consola.
 */
export default class extends BaseSeeder {
  async run() {
    const seeds: SeedSlide[] = [
      {
        title: 'Te damos la bienvenida a Valanserh',
        body: 'Todo lo que necesitas para administrar a tu equipo en un solo lugar: expedientes, asistencia, vacaciones y cumplimiento laboral.',
        banner: 'welcome.jpg',
        permissionKey: null,
      },
      {
        title: 'Tu equipo en un solo expediente',
        body: 'Da de alta a cada colaborador con sus datos, contrato y documentos. Lo consultas y lo actualizas cuando lo necesites, sin hojas sueltas.',
        banner: 'employees.jpg',
        permissionKey: employeesListPermissionKey(),
      },
      {
        title: 'La asistencia, al día',
        body: 'El monitor de asistencias junta las entradas y salidas de checadores y app, y te muestra retardos, faltas e incidencias por persona y por periodo.',
        banner: 'attendance.jpg',
        permissionKey: null,
      },
      {
        title: 'Vacaciones conforme a la ley',
        body: 'La política de vacaciones ya viene cargada según la Ley Federal del Trabajo. Ajústala a tu empresa y consulta en el calendario quién falta y cuándo.',
        banner: 'vacations.jpg',
        permissionKey: null,
      },
    ]

    const repository = new AnnouncementSlideRepositoryMysql()
    const skipBanners = env.get('ANNOUNCEMENTS_SEED_SKIP_BANNERS') === true

    for (const [index, seed] of seeds.entries()) {
      if (seed.permissionKey !== null && !isDeclaredPermissionKey(seed.permissionKey)) {
        throw new Error(`Permiso inexistente en el catálogo: ${seed.permissionKey}`)
      }

      let slide = await AnnouncementSlide.query()
        .where('announcement_slide_type', 'onboarding')
        .where('announcement_slide_title', seed.title)
        .first()

      if (!slide) {
        const draft = await repository.createDraft({
          type: 'onboarding',
          sortOrder: index + 1,
          title: seed.title,
          bodyHtml: sanitizeAnnouncementSlideHtml(`<p>${seed.body}</p>`),
          permissionKey: seed.permissionKey,
        })
        slide = await repository.publish(draft.announcementSlideId)
      }

      if (slide && !slide.announcementSlideBannerPath && !skipBanners) {
        const bannerPath = await this.uploadBanner(seed.banner)
        if (bannerPath) await repository.setBannerPath(slide.announcementSlideId, bannerPath)
      }
    }
  }

  /** Sube el banner; `null` si falla (el slide queda sin banner y el seeder sigue). */
  private async uploadBanner(fileName: string): Promise<string | null> {
    try {
      const buffer = await readFile(app.makePath(ASSETS_DIR, fileName))
      const key = `${env.get('AWS_ROOT_PATH')}/${ANNOUNCEMENT_BANNER_FOLDER}/seed-${fileName}`
      const stored = await new UploadService().uploadPrivateBuffer(key, buffer, 'image/jpeg')
      if (!stored) {
        logger.warn({ fileName }, 'Seeder de anuncios: no se pudo subir el banner; queda null')
      }
      return stored
    } catch (error) {
      logger.warn({ err: error, fileName }, 'Seeder de anuncios: banner no disponible; queda null')
      return null
    }
  }
}
