import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getArticleDetail } from '../../../lib/transgourmet.server'

export const Route = createFileRoute('/api/article/$articleNumber')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return json(await getArticleDetail(params.articleNumber))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Die Anfrage fuer Artikeldetails ist fehlgeschlagen.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
