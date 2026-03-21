import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { checkoutCart } from '../../../lib/cart-store.server'
import { getCurrentUser } from '../../../lib/session.server'

export const Route = createFileRoute('/api/cart/checkout')({
  server: {
    handlers: {
      POST: () => {
        const user = getCurrentUser()

        if (!user) {
          return json(
            { error: 'Please log in to manage a shopping cart.' },
            { status: 401 },
          )
        }

        try {
          return json(checkoutCart(user))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Checkout could not be completed.',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
