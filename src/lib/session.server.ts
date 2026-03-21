import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start-server'
import type { SessionUser } from './types'

const USER_ID_COOKIE = 'tg-demo-user-id'
const USER_NAME_COOKIE = 'tg-demo-user-name'

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 8,
}

export function normalizeUserId(username: string) {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'demo-user'
}

export function getCurrentUser(): SessionUser | null {
  const userId = getCookie(USER_ID_COOKIE)
  const username = getCookie(USER_NAME_COOKIE)

  if (!userId || !username) {
    return null
  }

  return {
    userId,
    username: decodeURIComponent(username),
  }
}

export function loginUser(username: string): SessionUser {
  const cleanName = username.trim()
  const user = {
    userId: normalizeUserId(cleanName),
    username: cleanName,
  }

  setCookie(USER_ID_COOKIE, user.userId, cookieOptions)
  setCookie(USER_NAME_COOKIE, encodeURIComponent(user.username), cookieOptions)

  return user
}

export function logoutUser() {
  deleteCookie(USER_ID_COOKIE, { path: '/' })
  deleteCookie(USER_NAME_COOKIE, { path: '/' })
}
