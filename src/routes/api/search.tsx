import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { searchArticles } from '../../lib/transgourmet.server'

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const term = new URL(request.url).searchParams.get('term')?.trim() ?? ''

        if (!term) {
          return json(
            { error: 'Bitte gib einen Suchbegriff ein.' },
            { status: 400 },
          )
        }

        try {
          return json(await searchArticles(term))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Die Suchanfrage an Transgourmet ist fehlgeschlagen.',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
