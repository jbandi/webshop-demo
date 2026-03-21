import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { clearCart, getCart } from '../../lib/cart-store.server'
import { getCurrentUser } from '../../lib/session.server'

function requireUser() {
  const user = getCurrentUser()

  if (!user) {
    return json(
      { error: 'Please log in to manage a shopping cart.' },
      { status: 401 },
    )
  }

  return user
}

export const Route = createFileRoute('/api/cart')({
  server: {
    handlers: {
      GET: () => {
        const user = requireUser()

        if (user instanceof Response) {
          return user
        }

        return json(getCart(user))
      },
      DELETE: () => {
        const user = requireUser()

        if (user instanceof Response) {
          return user
        }

        return json(clearCart(user))
      },
    },
  },
})
