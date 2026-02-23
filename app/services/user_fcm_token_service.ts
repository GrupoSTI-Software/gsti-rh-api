import User from '#models/user'
import UserFcmToken from '#models/user_fcm_token'

export default class UserFcmTokenService {
  async create(userFcmToken: UserFcmToken) {
    const newUserFcmToken = new UserFcmToken()
    newUserFcmToken.userId = userFcmToken.userId
    newUserFcmToken.userFcmToken = userFcmToken.userFcmToken
    newUserFcmToken.userFcmTokenActive = userFcmToken.userFcmTokenActive
    newUserFcmToken.userFcmTokenPlatform = userFcmToken.userFcmTokenPlatform
    newUserFcmToken.userFcmTokenLastSeenAt = userFcmToken.userFcmTokenLastSeenAt
    await newUserFcmToken.save()
    return newUserFcmToken
  }

  async update(currentUserFcmToken: UserFcmToken, userFcmToken: UserFcmToken) {
    currentUserFcmToken.userId = userFcmToken.userId
    currentUserFcmToken.userFcmToken = userFcmToken.userFcmToken
    currentUserFcmToken.userFcmTokenActive = userFcmToken.userFcmTokenActive
    currentUserFcmToken.userFcmTokenPlatform = userFcmToken.userFcmTokenPlatform
    currentUserFcmToken.userFcmTokenLastSeenAt = userFcmToken.userFcmTokenLastSeenAt
    await currentUserFcmToken.save()
    return currentUserFcmToken
  }

  async delete(currentUserFcmToken: UserFcmToken) {
    await currentUserFcmToken.delete()
    return currentUserFcmToken
  }

  async show(currentUserFcmToken: UserFcmToken) {
    const userFcmToken = await UserFcmToken.query()
      .whereNull('user_fcm_token_deleted_at')
      .where('user_fcm_token', currentUserFcmToken.userFcmToken)
      .where('user_id', currentUserFcmToken.userId)
      .first()
    return userFcmToken ? userFcmToken : null
  }

  async verifyInfoExist(userFcmToken: UserFcmToken) {
    const existUser = await User.query()
      .whereNull('user_deleted_at')
      .where('user_id', userFcmToken.userId)
      .first()

    if (!existUser && userFcmToken.userId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The user was not found',
        message: 'The user was not found with the entered ID',
        data: { ...userFcmToken },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...userFcmToken },
    }
  }

  async verifyInfo(userFcmToken: UserFcmToken) {
    const action = userFcmToken.userFcmTokenId > 0 ? 'updated' : 'created'
    const existRelation = await UserFcmToken.query()
      .if(userFcmToken.userFcmTokenId > 0, (query) => {
        query.whereNot('user_fcm_token_id', userFcmToken.userFcmTokenId)
      })
      .whereNull('user_fcm_token_deleted_at')
      .where('user_id', userFcmToken.userId)
      .first()
    if (existRelation) {
      return {
        status: 400,
        type: 'warning',
        title: 'The user fcm token already exists for another record',
        message: `The user fcm token resource cannot be ${action} because the relationship is already assigned to another record`,
        data: { ...userFcmToken },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...userFcmToken },
    }
  }
}
