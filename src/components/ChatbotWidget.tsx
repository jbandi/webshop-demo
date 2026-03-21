import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport } from 'ai'
import {
  MessageCircle,
  SendHorizonal,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react'
import type {
  AddArticleResult,
  CartSnapshotResult,
  SearchProductsResult,
  SendCartResult,
  ToolErrorResult,
} from '../lib/chat-types'

const starterPrompts = [
  'Suche Bio Milch',
  'Zeig mir meinen Warenkorb',
  'Fuege Artikel 300419 mit Menge 2 in den Warenkorb',
  'Sende meinen Warenkorb',
]

const moneyFormatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
})

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(value ?? 0)
}

function getArticleImageUrl(celumId: string | null | undefined) {
  if (!celumId) {
    return null
  }

  return `https://webshop.transgourmet.ch/shop/productimages/article/${celumId}.jpg`
}

type ChatPart = {
  type: string
  text?: string
  state?: string
  toolCallId?: string
  output?: unknown
  input?: Record<string, unknown>
  errorText?: string
}

type ChatConfigStatus = {
  configured: boolean
  environment: string
}

export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [chatConfigStatus, setChatConfigStatus] =
    useState<ChatConfigStatus | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const processedToolCallIds = useRef(new Set<string>())
  const processedSearchToolCallIds = useRef(new Set<string>())
  const queryClient = useQueryClient()

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const hasMessages = messages.length > 0
  const isBusy = status === 'submitted' || status === 'streaming'
  const isMissingGeminiKeyInDev =
    import.meta.env.DEV && chatConfigStatus?.configured === false

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    let cancelled = false

    async function loadChatConfigStatus() {
      try {
        const response = await fetch('/api/chat', {
          method: 'GET',
          headers: { accept: 'application/json' },
        })

        if (!response.ok || cancelled) {
          return
        }

        const payload = (await response.json()) as ChatConfigStatus
        setChatConfigStatus(payload)
      } catch {
        // keep quiet in the UI if the check fails
      }
    }

    void loadChatConfigStatus()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const scrollElement = scrollRef.current

    if (!scrollElement) {
      return
    }

    scrollElement.scrollTop = scrollElement.scrollHeight
  }, [messages, isBusy])

  useEffect(() => {
    let shouldRefreshCart = false
    let nextSearchTerm: string | null = null

    for (const message of messages) {
      for (const part of message.parts as Array<ChatPart>) {
        const isCartMutation =
          part.type === 'tool-addArticleToCart' || part.type === 'tool-sendCart'

        if (
          isCartMutation &&
          part.state === 'output-available' &&
          part.toolCallId &&
          !processedToolCallIds.current.has(part.toolCallId)
        ) {
          processedToolCallIds.current.add(part.toolCallId)
          shouldRefreshCart = true
        }

        if (
          part.type === 'tool-searchProducts' &&
          part.state === 'output-available' &&
          part.toolCallId &&
          !processedSearchToolCallIds.current.has(part.toolCallId)
        ) {
          processedSearchToolCallIds.current.add(part.toolCallId)

          const output = part.output as SearchProductsResult
          if (output.ok) {
            nextSearchTerm = output.searchTerm
          }
        }
      }
    }

    if (shouldRefreshCart) {
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
    }

    if (nextSearchTerm && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chatbot-search', {
          detail: { term: nextSearchTerm },
        }),
      )
    }
  }, [messages, queryClient])

  const visibleMessages = useMemo(
    () =>
      messages.filter((message) =>
        (message.parts as Array<ChatPart>).some(
          (part) => part.type !== 'step-start',
        ),
      ),
    [messages],
  )

  async function submitPrompt(prompt: string) {
    const text = prompt.trim()

    if (!text || isBusy || isMissingGeminiKeyInDev) {
      return
    }

    setIsOpen(true)
    setInput('')
    await sendMessage({ text })
  }

  return (
    <div className="chatbot-shell">
      {isOpen ? (
        <section className="chatbot-panel rise-in" aria-label="Chatbot">
          <header className="chatbot-header">
            <div>
              <p className="chatbot-kicker">AI Einkaufsassistent</p>
              <h2 className="chatbot-title">Shop Chat</h2>
            </div>
            <div className="chatbot-header-actions">
              <button
                type="button"
                className="chatbot-text-button"
                onClick={() => {
                  setMessages([])
                  processedToolCallIds.current.clear()
                  processedSearchToolCallIds.current.clear()
                }}
                disabled={!hasMessages || isBusy}
              >
                Leeren
              </button>
              <button
                type="button"
                className="chatbot-icon-button"
                onClick={() => setIsOpen(false)}
                aria-label="Chat schliessen"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="chatbot-transcript" ref={scrollRef}>
            {!hasMessages ? (
              <div className="chatbot-empty-state">
                <div className="chatbot-empty-icon">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3>Frag mich nach Produkten oder deinem Warenkorb.</h3>
                  <p>
                    Ich kann Produkte suchen, Artikel in den Warenkorb legen und
                    den Warenkorb ueber den bestehenden Checkout senden.
                  </p>
                  {isMissingGeminiKeyInDev ? (
                    <div className="chatbot-dev-hint">
                      <strong>
                        Gemini API Key fehlt in deiner lokalen Umgebung.
                      </strong>
                      <p>
                        Lege eine `.env.local` oder `.env` Datei an und setze
                        `GOOGLE_GENERATIVE_AI_API_KEY`, dann starte den
                        Dev-Server neu.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {visibleMessages.map((message) => (
              <article
                key={message.id}
                className={`chatbot-message chatbot-message-${message.role}`}
              >
                <div className="chatbot-message-label">
                  {message.role === 'user' ? 'Du' : 'Assistent'}
                </div>
                <div className="chatbot-bubble-stack">
                  {(message.parts as Array<ChatPart>).map((part, index) => (
                    <MessagePartView
                      key={`${message.id}-${part.type}-${part.toolCallId ?? index}`}
                      part={part}
                      onPrompt={submitPrompt}
                    />
                  ))}
                </div>
              </article>
            ))}

            {error ? (
              <div className="chatbot-system-note chatbot-system-note-error">
                {error.message}
              </div>
            ) : null}
          </div>

          {!hasMessages ? (
            <div className="chatbot-prompts">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="chatbot-prompt"
                  onClick={() => void submitPrompt(prompt)}
                  disabled={isBusy || isMissingGeminiKeyInDev}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="chatbot-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void submitPrompt(input)
            }}
          >
            <label className="sr-only" htmlFor="chatbot-input">
              Nachricht eingeben
            </label>
            <input
              id="chatbot-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="z.B. Suche Mozzarella oder sende meinen Warenkorb"
              className="chatbot-input"
              disabled={isBusy || isMissingGeminiKeyInDev}
            />
            <button
              type="submit"
              className="chatbot-submit"
              disabled={isBusy || !input.trim() || isMissingGeminiKeyInDev}
            >
              <SendHorizonal size={16} />
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="chatbot-launcher"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label="Chatbot oeffnen"
      >
        <span className="chatbot-launcher-icon">
          <MessageCircle size={18} />
        </span>
        <span>
          <strong>Shop Chat</strong>
          <small>Produkte suchen & bestellen</small>
        </span>
      </button>
    </div>
  )
}

function MessagePartView({
  part,
  onPrompt,
}: {
  part: ChatPart
  onPrompt: (prompt: string) => Promise<void>
}) {
  if (part.type === 'step-start') {
    return null
  }

  if (part.type === 'text' && part.text) {
    return <div className="chatbot-bubble">{part.text}</div>
  }

  if (part.type === 'tool-searchProducts') {
    return <SearchToolView part={part} onPrompt={onPrompt} />
  }

  if (part.type === 'tool-getCart') {
    return <CartToolView part={part} onPrompt={onPrompt} />
  }

  if (part.type === 'tool-addArticleToCart') {
    return <AddToCartToolView part={part} onPrompt={onPrompt} />
  }

  if (part.type === 'tool-sendCart') {
    return <SendCartToolView part={part} />
  }

  if (part.type.startsWith('tool-') && part.state === 'output-error') {
    return (
      <div className="chatbot-system-note chatbot-system-note-error">
        {part.errorText ?? 'Die Tool-Ausfuehrung ist fehlgeschlagen.'}
      </div>
    )
  }

  return null
}

function SearchToolView({
  part,
  onPrompt,
}: {
  part: ChatPart
  onPrompt: (prompt: string) => Promise<void>
}) {
  if (part.state !== 'output-available') {
    return (
      <div className="chatbot-system-note">Ich suche passende Produkte...</div>
    )
  }

  const output = part.output as SearchProductsResult

  if (!output.ok) {
    return <ErrorResultCard result={output} />
  }

  return (
    <section className="chatbot-card-grid">
      <div className="chatbot-result-meta">
        <strong>{output.totalCount} Treffer</strong> fuer &quot;
        {output.searchTerm}&quot;
      </div>
      {output.articles.map((article) => (
        <article key={article.articleNumber} className="chatbot-product-card">
          <div className="chatbot-product-topline">
            <span className="chatbot-article-badge">
              {article.articleNumber}
            </span>
            <span className="chatbot-price">{formatMoney(article.price)}</span>
          </div>
          <div className="chatbot-product-body">
            <div className="chatbot-product-thumb">
              {getArticleImageUrl(article.celumId) ? (
                <img
                  src={getArticleImageUrl(article.celumId) ?? undefined}
                  alt={article.description}
                />
              ) : (
                <div className="article-thumb-fallback">Kein Bild</div>
              )}
            </div>
            <div className="chatbot-product-copy">
              <h3>{article.description}</h3>
              <p>
                {article.brand ? `${article.brand} · ` : ''}
                {article.unitText ?? '-'}
              </p>
              <p>
                {article.sellAmount ?? '-'} {article.sellUnit ?? ''}
              </p>
            </div>
          </div>
          <div className="chatbot-action-row">
            <button
              type="button"
              className="chatbot-secondary-action"
              onClick={() =>
                void onPrompt(
                  `Erzaehle mir mehr ueber Artikel ${article.articleNumber}.`,
                )
              }
            >
              Details
            </button>
            <button
              type="button"
              className="chatbot-primary-action"
              onClick={() =>
                void onPrompt(
                  `Fuege Artikel ${article.articleNumber} mit Menge 1 in den Warenkorb.`,
                )
              }
            >
              In den Warenkorb
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}

function CartToolView({
  part,
  onPrompt,
}: {
  part: ChatPart
  onPrompt: (prompt: string) => Promise<void>
}) {
  if (part.state !== 'output-available') {
    return (
      <div className="chatbot-system-note">Ich lade deinen Warenkorb...</div>
    )
  }

  const output = part.output as CartSnapshotResult

  if (!output.ok) {
    return <ErrorResultCard result={output} />
  }

  return (
    <section className="chatbot-summary-card">
      <div className="chatbot-summary-head">
        <div>
          <p>Warenkorb von {output.user.username}</p>
          <strong>{output.totalItems} Positionen</strong>
        </div>
        <span className="chatbot-price">{formatMoney(output.totalAmount)}</span>
      </div>
      <div className="chatbot-summary-list">
        {output.items.length ? (
          output.items.map((item) => (
            <div key={item.articleNumber} className="chatbot-summary-item">
              <div>
                <strong>{item.description}</strong>
                <p>
                  {item.articleNumber} · Menge {item.quantity}
                </p>
              </div>
              <span>{formatMoney(item.lineTotal)}</span>
            </div>
          ))
        ) : (
          <p className="chatbot-empty-copy">Dein Warenkorb ist aktuell leer.</p>
        )}
      </div>
      {output.items.length ? (
        <button
          type="button"
          className="chatbot-primary-action chatbot-full-width"
          onClick={() => void onPrompt('Sende meinen Warenkorb.')}
        >
          <ShoppingCart size={16} />
          Warenkorb senden
        </button>
      ) : null}
    </section>
  )
}

function AddToCartToolView({
  part,
  onPrompt,
}: {
  part: ChatPart
  onPrompt: (prompt: string) => Promise<void>
}) {
  if (part.state !== 'output-available') {
    return (
      <div className="chatbot-system-note">
        Ich lege den Artikel in den Warenkorb...
      </div>
    )
  }

  const output = part.output as AddArticleResult

  if (!output.ok) {
    return <ErrorResultCard result={output} />
  }

  return (
    <section className="chatbot-summary-card">
      <div className="chatbot-summary-head">
        <div>
          <p>Zum Warenkorb hinzugefuegt</p>
          <strong>{output.item.description}</strong>
        </div>
        <span className="chatbot-price">
          {formatMoney(output.item.lineTotal)}
        </span>
      </div>
      <div className="chatbot-summary-list">
        <div className="chatbot-summary-item">
          <div>
            <strong>Artikel {output.item.articleNumber}</strong>
            <p>Menge im Warenkorb: {output.item.quantity}</p>
          </div>
          <span>{formatMoney(output.totalAmount)}</span>
        </div>
      </div>
      <div className="chatbot-action-row">
        <button
          type="button"
          className="chatbot-secondary-action"
          onClick={() => void onPrompt('Zeig mir meinen Warenkorb.')}
        >
          Warenkorb zeigen
        </button>
        <button
          type="button"
          className="chatbot-primary-action"
          onClick={() => void onPrompt('Sende meinen Warenkorb.')}
        >
          Weiter zum Senden
        </button>
      </div>
    </section>
  )
}

function SendCartToolView({ part }: { part: ChatPart }) {
  if (part.state !== 'output-available') {
    return (
      <div className="chatbot-system-note">Ich sende deinen Warenkorb...</div>
    )
  }

  const output = part.output as SendCartResult

  if (!output.ok) {
    return <ErrorResultCard result={output} />
  }

  return (
    <section className="chatbot-summary-card chatbot-summary-card-success">
      <div className="chatbot-summary-head">
        <div>
          <p>Bestellung uebermittelt</p>
          <strong>{output.orderNumber}</strong>
        </div>
        <span className="chatbot-price">{formatMoney(output.totalAmount)}</span>
      </div>
      <div className="chatbot-summary-list">
        <div className="chatbot-summary-item">
          <div>
            <strong>{output.totalItems} Positionen</strong>
            <p>{new Date(output.submittedAt).toLocaleString('de-CH')}</p>
          </div>
          <span>Checkout OK</span>
        </div>
      </div>
    </section>
  )
}

function ErrorResultCard({ result }: { result: ToolErrorResult }) {
  return (
    <div className="chatbot-system-note chatbot-system-note-error">
      {result.error}
    </div>
  )
}
