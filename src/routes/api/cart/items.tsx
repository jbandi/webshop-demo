import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { addToCart } from '../../../lib/cart-store.server'
import { getCurrentUser } from '../../../lib/session.server'
import { getArticleDetail } from '../../../lib/transgourmet.server'

export const Route = createFileRoute('/api/cart/items')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = getCurrentUser()

        if (!user) {
          return json(
            { error: 'Please log in to manage a shopping cart.' },
            { status: 401 },
          )
        }

        const body = (await request.json()) as {
          articleNumber?: string
          quantity?: number
        }

        const articleNumber = body.articleNumber?.trim() ?? ''
        const quantity = Number(body.quantity ?? 1)

        if (!articleNumber) {
          return json(
            { error: 'Please provide an article number.' },
            { status: 400 },
          )
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return json(
            { error: 'Quantity must be greater than zero.' },
            { status: 400 },
          )
        }

        try {
          const article = await getArticleDetail(articleNumber)
          return json(addToCart(user, article, Math.floor(quantity)))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not add the article to the cart.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
