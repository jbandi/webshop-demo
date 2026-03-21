import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCurrentUser, loginUser, logoutUser } from '../../lib/session.server'

export const Route = createFileRoute('/api/session')({
  server: {
    handlers: {
      GET: () => json({ user: getCurrentUser() }),
      POST: async ({ request }) => {
        const body = (await request.json()) as { username?: string }
        const username = body.username?.trim() ?? ''

        if (!username) {
          return json({ error: 'Please provide a user name.' }, { status: 400 })
        }

        return json({ user: loginUser(username) })
      },
      DELETE: () => {
        logoutUser()
        return json({ ok: true as const })
      },
    },
  },
})
