import type { HttpContext } from '@adonisjs/core/http'
import SessionPermissionTreeService from '#services/session_permission_tree_service'
import SessionPermissionTreeUnresolvedError from '#exceptions/session_permission_tree_unresolved_error'
import { SESSION_PERMISSION_TREE_ERROR_CODES } from '#constants/session_permission_tree_error_codes'

export default class SessionPermissionTreeController {
  private readonly service = new SessionPermissionTreeService()

  async show({ auth, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const user = auth.user

    if (!user) {
      return response.status(401).json({
        title: t('session_permission_tree_unauthenticated_title'),
        detail: t('session_permission_tree_unauthenticated_detail'),
        key: 'auth-required',
      })
    }

    try {
      const tree = await this.service.buildForUser(user)
      return response.status(200).json({ data: tree })
    } catch (error) {
      if (error instanceof SessionPermissionTreeUnresolvedError) {
        return response.status(403).json({
          title: t('session_permission_tree_unresolved_title'),
          detail: t('session_permission_tree_unresolved_detail'),
          key: SESSION_PERMISSION_TREE_ERROR_CODES.UNRESOLVED,
        })
      }

      throw error
    }
  }

  async version({ auth, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const user = auth.user

    if (!user) {
      return response.status(401).json({
        title: t('session_permission_tree_unauthenticated_title'),
        detail: t('session_permission_tree_unauthenticated_detail'),
        key: 'auth-required',
      })
    }

    try {
      const version = await this.service.getVersionForUser(user)
      return response.status(200).json({ data: version })
    } catch (error) {
      if (error instanceof SessionPermissionTreeUnresolvedError) {
        return response.status(403).json({
          title: t('session_permission_tree_unresolved_title'),
          detail: t('session_permission_tree_unresolved_detail'),
          key: SESSION_PERMISSION_TREE_ERROR_CODES.UNRESOLVED,
        })
      }

      throw error
    }
  }
}
