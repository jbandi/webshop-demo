import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  removeFromCart,
  updateCartQuantity,
} from '../../../../lib/cart-store.server'
import { getCurrentUser } from '../../../../lib/session.server'

export const Route = createFileRoute('/api/cart/items/$articleNumber')({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        const user = getCurrentUser()

        if (!user) {
          return json(
            { error: 'Please log in to manage a shopping cart.' },
            { status: 401 },
          )
        }

        const body = (await request.json()) as { quantity?: number }
        const quantity = Number(body.quantity)

        if (!Number.isFinite(quantity)) {
          return json({ error: 'Quantity must be a number.' }, { status: 400 })
        }

        return json(
          updateCartQuantity(user, params.articleNumber, Math.floor(quantity)),
        )
      },
      DELETE: ({ params }) => {
        const user = getCurrentUser()

        if (!user) {
          return json(
            { error: 'Please log in to manage a shopping cart.' },
            { status: 401 },
          )
        }

        return json(removeFromCart(user, params.articleNumber))
      },
    },
  },
})
