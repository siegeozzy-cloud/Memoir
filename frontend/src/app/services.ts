import { httpAccountService } from '../features/account/httpService'
import { mockAccountService } from '../features/account/mockService'
import type { AccountService } from '../features/account/service'
import { httpAuthService } from '../features/auth/httpService'
import { mockAuthService } from '../features/auth/mockService'
import type { AuthService } from '../features/auth/service'
import { mockChatService } from '../features/chat/mockService'
import type { ChatService } from '../features/chat/service'
import { mockMemoryService } from '../features/memories/mockService'
import type { MemoryService } from '../features/memories/service'

// Which implementation each feature talks to. The real backend (../backend) by default;
// VITE_API=mock in .env.local runs the whole app without it.
const mock = import.meta.env.VITE_API === 'mock'

export const authService: AuthService = mock ? mockAuthService : httpAuthService
export const accountService: AccountService = mock ? mockAccountService : httpAccountService

// Not on the backend yet: messaging (step 2) and posts (step 3).
export const chatService: ChatService = mockChatService
export const memoryService: MemoryService = mockMemoryService
