import { httpAccountService } from '../features/account/httpService'
import { mockAccountService } from '../features/account/mockService'
import type { AccountService } from '../features/account/service'
import { httpAuthService } from '../features/auth/httpService'
import { mockAuthService } from '../features/auth/mockService'
import type { AuthService } from '../features/auth/service'
import { makeHttpChatService } from '../features/chat/httpService'
import { mockChatService } from '../features/chat/mockService'
import type { ChatService } from '../features/chat/service'
import { makeHttpMemoryService } from '../features/memories/httpService'
import { mockMemoryService } from '../features/memories/mockService'
import type { MemoryService } from '../features/memories/service'

// Which implementation each feature talks to. The real backend (../backend) by default;
// VITE_API=mock in .env.local runs the whole app on in-browser mock data, without it.
export const mockMode = import.meta.env.VITE_API === 'mock'

export const authService: AuthService = mockMode ? mockAuthService : httpAuthService
export const accountService: AccountService = mockMode ? mockAccountService : httpAccountService

// These need to know who's signed in, so they're built once the session is known.
export const chatServiceFor = (meId: string): ChatService => (mockMode ? mockChatService : makeHttpChatService(meId))
export const memoryServiceFor = (meId: string): MemoryService => (mockMode ? mockMemoryService : makeHttpMemoryService(meId))
