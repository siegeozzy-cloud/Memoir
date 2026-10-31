import { api } from '../../shared/lib/api'
import type { AccountService, Profile } from './service'

// The real profile backend (../backend, /api/account).

export const httpAccountService: AccountService = {
  load: () => api<Profile>('/account'),

  async update({ avatar, ...changes }) {
    let profile: Profile | undefined
    if (Object.keys(changes).length) profile = await api<Profile>('/account', { method: 'PATCH', json: changes })
    if (avatar) {
      const form = new FormData()
      form.append('avatar', avatar)
      profile = await api<Profile>('/account/avatar', { method: 'PUT', form })
    }
    return profile ?? api<Profile>('/account')
  },

  deactivate: () => api('/account/deactivate', { method: 'POST' }),
  remove: () => api('/account', { method: 'DELETE' }),
}
