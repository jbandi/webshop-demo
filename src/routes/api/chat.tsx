import { google } from '@ai-sdk/google'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import type { UIMessage } from 'ai'
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai'
import { z } from 'zod'
import {
  addArticleToUserCart,
  getCartSnapshot,
  searchProducts,
  sendUserCart,
} from '../../lib/chat-tools.server'

const shopTools = {
  searchProducts: tool({
    description:
      'Suche nach passenden Produkten im Shop-Katalog fuer einen Suchbegriff.',
    inputSchema: z.object({
      term: z.string().min(1),
    }),
    execute: async ({ term }) => searchProducts(term),
  }),
  getCart: tool({
    description:
      'Lade den aktuellen Warenkorb des angemeldeten Demo-Benutzers.',
    inputSchema: z.object({}),
    execute: async () => getCartSnapshot(),
  }),
  addArticleToCart: tool({
    description:
      'Fuege einen Artikel ueber seine Artikelnummer in den Warenkorb ein.',
    inputSchema: z.object({
      articleNumber: z.string().min(1),
      quantity: z.number().int().min(1).max(99).default(1),
    }),
    execute: async ({ articleNumber, quantity }) =>
      addArticleToUserCart(articleNumber, quantity),
  }),
  sendCart: tool({
    description:
      'Sende den aktuellen Warenkorb ueber den bestehenden Checkout-Prozess.',
    inputSchema: z.object({}),
    execute: async () => sendUserCart(),
  }),
}

const systemPrompt = `Du bist der digitale Einkaufsassistent dieses Demo-Webshops.

Deine Aufgaben:
- Antworte standardmaessig auf Deutsch.
- Sei knapp, hilfreich und handlungsorientiert.
- Verwende fuer Produktsuche, Warenkorb und Versand immer die verfuegbaren Tools.
- Erfinde niemals Produkte, Preise, Verfuegbarkeit, Artikelnummern oder Warenkorbdaten.
- Wenn ein Nutzer Produkte sucht, nutze zuerst searchProducts.
- Wenn ein Nutzer einen Artikel in den Warenkorb legen moechte, nutze addArticleToCart mit der exakten Artikelnummer.
- Wenn ein Nutzer den Warenkorb sehen moechte, nutze getCart.
- Wenn ein Nutzer den Warenkorb senden moechte, nutze sendCart.
- Wenn eine Tool-Antwort requiresLogin=true meldet, erklaere freundlich, dass zuerst ein Demo-Login noetig ist.
- Wenn die Suche keine Treffer liefert, schlage einen einfacheren oder breiteren Suchbegriff vor.
- Nach erfolgreichem Versand bestaetige die Bestellnummer klar.

Halte Antworten kurz und klar. Wiederhole Tool-Ergebnisse nicht wortreich, wenn die UI bereits strukturierte Karten anzeigt.`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      GET: () => {
        const configured = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY)

        return json({
          configured,
          environment: process.env.NODE_ENV ?? 'development',
        })
      },
      POST: async ({ request }) => {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          return json(
            {
              error:
                'GOOGLE_GENERATIVE_AI_API_KEY is missing. Configure the Gemini API key on the server.',
            },
            { status: 500 },
          )
        }

        const body = (await request.json()) as { messages?: Array<UIMessage> }

        const messages = Array.isArray(body.messages) ? body.messages : []

        const result = streamText({
          model: google('gemini-2.5-flash'),
          system: systemPrompt,
          messages: await convertToModelMessages(
            messages.map(({ id: _id, ...message }) => message),
            { tools: shopTools },
          ),
          tools: shopTools,
          stopWhen: stepCountIs(5),
          temperature: 0.2,
        })

        return result.toUIMessageStreamResponse()
      },
    },
  },
})
