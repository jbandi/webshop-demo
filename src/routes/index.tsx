import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addToCart,
  checkoutCart,
  clearCart,
  getArticle,
  getCart,
  getSession,
  login,
  logout,
  removeCartItem,
  search,
  updateCartItem,
} from '../lib/client-api'
import type { ApiIcon } from '../lib/types'

export const Route = createFileRoute('/')({ component: App })

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

const WEB_ORIGIN = 'https://webtest.transgourmet.ch'

function resolveMediaUrl(imgSrc: string): string {
  if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
    return imgSrc
  }

  const path = imgSrc.startsWith('/') ? imgSrc : `/${imgSrc}`
  return `${WEB_ORIGIN}${path}`
}

function isEcoscoreIcon(icon: ApiIcon): boolean {
  return (
    icon.id.toLowerCase().startsWith('ecoscore') ||
    icon.imgSrc.toLowerCase().includes('/ecoscore/')
  )
}

function getEcoscoreLabel(icon: ApiIcon): string | null {
  const sources = [icon.title ?? '', icon.imgSrc, icon.id]

  for (const source of sources) {
    const match = source.match(
      /(?:eco(?:-?score)?[^A-E]*|tag_color_)([A-E])(?:[_\s-]*(?:plus|minus|\+|-))?/i,
    )
    if (match) {
      return match[1].toUpperCase()
    }
  }

  return null
}

function orderIcons(icons: Array<ApiIcon>) {
  return [...icons].sort((left, right) => {
    if (isEcoscoreIcon(left) && !isEcoscoreIcon(right)) {
      return -1
    }

    if (!isEcoscoreIcon(left) && isEcoscoreIcon(right)) {
      return 1
    }

    return 0
  })
}

function resolveIconImgUrl(icon: ApiIcon): string {
  if (!isEcoscoreIcon(icon)) {
    return resolveMediaUrl(icon.imgSrc)
  }

  const { imgSrc } = icon
  if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
    try {
      const url = new URL(imgSrc)
      if (url.hostname.includes('transgourmet.ch')) {
        return `${WEB_ORIGIN}${url.pathname}${url.search}${url.hash}`
      }
    } catch {
      // use fallback below
    }

    return imgSrc
  }

  const path = imgSrc.startsWith('/') ? imgSrc : `/${imgSrc}`
  return `${WEB_ORIGIN}${path}`
}

function App() {
  const isClient = typeof window !== 'undefined'
  const queryClient = useQueryClient()

  const [username, setUsername] = useState('Hotel Alpenblick')
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [selectedArticleNumber, setSelectedArticleNumber] = useState<
    string | null
  >(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

  const applySearchTerm = (term: string) => {
    const nextTerm = term.trim()

    setSearchInput(nextTerm)
    setActiveSearch(nextTerm)
    setSelectedArticleNumber(null)
    setFlash(null)
  }

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: getSession,
    enabled: isClient,
  })

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: getCart,
    enabled: isClient && Boolean(sessionQuery.data?.user),
  })

  const searchQuery = useQuery({
    queryKey: ['search', activeSearch],
    queryFn: () => search(activeSearch),
    enabled: isClient && activeSearch.trim().length > 0,
    staleTime: 60_000,
  })

  const detailQuery = useQuery({
    queryKey: ['article', selectedArticleNumber],
    queryFn: () => getArticle(selectedArticleNumber as string),
    enabled: isClient && Boolean(selectedArticleNumber),
  })

  const user = sessionQuery.data?.user ?? null
  const cart = cartQuery.data
  const visibleCart = user ? cart : null
  const selectedArticle = detailQuery.data

  const invalidateCoreQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['session'] }),
      queryClient.invalidateQueries({ queryKey: ['cart'] }),
    ])
  }

  const loginMutation = useMutation({
    mutationFn: (name: string) => login(name),
    onSuccess: async ({ user: loggedInUser }) => {
      setFlash(`Angemeldet als ${loggedInUser.username}.`)
      setIsLoginModalOpen(false)
      await invalidateCoreQueries()
    },
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setFlash(
        'Abgemeldet. Der Server haelt die Warenkoerbe pro Demo-Benutzer getrennt.',
      )
      setIsLoginModalOpen(false)
      await invalidateCoreQueries()
    },
  })

  const addMutation = useMutation({
    mutationFn: (articleNumber: string) => addToCart(articleNumber, 1),
    onSuccess: async () => {
      setFlash('Artikel wurde zum Warenkorb hinzugefuegt.')
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const updateQuantityMutation = useMutation({
    mutationFn: ({
      articleNumber,
      quantity,
    }: {
      articleNumber: string
      quantity: number
    }) => updateCartItem(articleNumber, quantity),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (articleNumber: string) => removeCartItem(articleNumber),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: clearCart,
    onSuccess: async () => {
      setFlash('Warenkorb wurde geleert.')
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const checkoutMutation = useMutation({
    mutationFn: checkoutCart,
    onSuccess: async (result) => {
      setFlash(
        `Bestellung erfolgreich uebermittelt. Bestellnummer: ${result.orderNumber}.`,
      )
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const searchResults = searchQuery.data?.articles ?? []

  const selectedArticleFallback = useMemo(() => {
    if (!selectedArticleNumber) {
      return null
    }

    return (
      searchResults.find(
        (article) => article.articleNumber === selectedArticleNumber,
      ) ?? null
    )
  }, [searchResults, selectedArticleNumber])

  useEffect(() => {
    if (!isClient) {
      return
    }

    const url = new URL(window.location.href)
    const nextTerm = url.searchParams.get('q')?.trim() ?? ''
    applySearchTerm(nextTerm)
  }, [isClient])

  useEffect(() => {
    if (!isClient) {
      return
    }

    const handlePopState = () => {
      const url = new URL(window.location.href)
      const nextTerm = url.searchParams.get('q')?.trim() ?? ''
      applySearchTerm(nextTerm)
    }

    const handleChatbotSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail

      applySearchTerm(detail.term ?? '')
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('chatbot-search', handleChatbotSearch)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('chatbot-search', handleChatbotSearch)
    }
  }, [isClient])

  useEffect(() => {
    if (!isClient) {
      return
    }

    const url = new URL(window.location.href)
    if (activeSearch) {
      url.searchParams.set('q', activeSearch)
    } else {
      url.searchParams.delete('q')
    }

    window.history.replaceState({}, '', url)
  }, [activeSearch, isClient])

  return (
    <>
      <main className="page-wrap px-4 pb-12 pt-8">
        <section className="hero-panel rise-in rounded-xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_320px] lg:items-start">
            <div>
              <p className="island-kicker mb-3">
                Schweizer Grosshandel Katalog
              </p>
              <h1 className="display-title mb-4 max-w-4xl text-4xl leading-[0.98] font-bold tracking-tight text-[var(--ink-strong)] sm:text-6xl">
                Demo Web Shop
              </h1>
            </div>
            <aside className="hero-aside rounded-lg border border-[var(--line)] px-4 py-3.5">
              <div>
                <div>
                  <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    Aktiver Benutzer
                  </p>
                  <p className="mt-1 text-base font-semibold text-[var(--ink-strong)]">
                    {user?.username ?? 'Nicht angemeldet'}
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-md border border-[var(--line)] bg-white px-4 py-1.5 text-sm font-semibold text-[var(--ink-strong)] transition hover:border-[var(--line-strong)] hover:bg-[var(--link-bg-hover)]"
                    onClick={() => setIsLoginModalOpen(true)}
                  >
                    {user ? 'Benutzer wechseln' : 'Anmelden'}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {flash ? (
          <section className="mt-5 rounded-2xl border border-[rgba(42,130,102,0.28)] bg-[rgba(248,252,243,0.85)] px-4 py-3 text-sm text-[var(--ink-strong)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{flash}</span>
              <button
                type="button"
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]"
                onClick={() => setFlash(null)}
              >
                Schliessen
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <section className="panel rounded-[1.75rem] p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="island-kicker mb-2">Suche</p>
                  <h2 className="m-0 text-2xl font-semibold text-[var(--ink-strong)]">
                    Transgourmet-Artikelsuche
                  </h2>
                </div>
                <p className="m-0 text-sm text-[var(--ink-soft)]">
                  Aktueller Suchbegriff: <strong>{activeSearch}</strong>
                </p>
              </div>

              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  applySearchTerm(searchInput)
                }}
              >
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Suchbegriff eingeben"
                  className="flex-1 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-muted)]"
                />
                <button
                  type="submit"
                  className="action-button rounded-2xl px-5 py-3 text-sm font-semibold text-white"
                >
                  Artikel suchen
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--ink-soft)]">
                <span>
                  {searchQuery.isPending
                    ? 'Suche laeuft...'
                    : activeSearch
                      ? `${searchQuery.data?.totalCount ?? 0} Artikel gefunden`
                      : 'Kein Suchbegriff aktiv'}
                </span>
                <span>
                  Die Ergebnisse kommen vom weitergeleiteten
                  Transgourmet-Endpunkt.
                </span>
              </div>

              {searchQuery.error ? (
                <p className="mt-3 text-sm font-medium text-[var(--alert)]">
                  {searchQuery.error.message}
                </p>
              ) : null}

              <div className="mt-5 grid gap-3">
                {searchResults.map((article) => {
                  const active = selectedArticleNumber === article.articleNumber

                  return (
                    <article
                      key={article.articleNumber}
                      className={`rounded-[1.5rem] border px-4 py-4 transition ${
                        active
                          ? 'border-[rgba(196,124,54,0.48)] bg-[rgba(255,251,242,0.96)] shadow-[0_14px_28px_rgba(112,80,43,0.12)]'
                          : 'border-[var(--line)] bg-white/68 hover:-translate-y-0.5 hover:border-[rgba(42,130,102,0.26)]'
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="article-thumb shrink-0 overflow-hidden rounded-lg bg-white">
                          {getArticleImageUrl(article.celumId) ? (
                            <img
                              src={
                                getArticleImageUrl(article.celumId) ?? undefined
                              }
                              alt={article.description}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="article-thumb-fallback">
                              Kein Bild
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() =>
                            setSelectedArticleNumber(article.articleNumber)
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[rgba(196,124,54,0.12)] px-2.5 py-1 text-xs font-semibold tracking-[0.14em] text-[var(--amber-deep)] uppercase">
                              {article.articleNumber}
                            </span>
                            {article.icons.length ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {orderIcons(article.icons).map((icon) => (
                                  <span
                                    key={`${article.articleNumber}-${icon.id}`}
                                    className="inline-flex items-center gap-1"
                                  >
                                    {isEcoscoreIcon(icon) &&
                                    getEcoscoreLabel(icon) ? (
                                      <span className="eco-score-label">
                                        {getEcoscoreLabel(icon)}
                                      </span>
                                    ) : null}
                                    <img
                                      src={resolveIconImgUrl(icon)}
                                      alt={icon.title ?? 'Artikelicon'}
                                      title={icon.title ?? undefined}
                                      className="article-icon"
                                      loading="lazy"
                                    />
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {article.oldPrice &&
                            article.oldPrice > (article.price ?? 0) ? (
                              <span className="rounded-full bg-[rgba(181,59,59,0.1)] px-2.5 py-1 text-xs font-semibold text-[var(--alert)]">
                                Aktion
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-lg font-semibold text-[var(--ink-strong)]">
                            {article.description}
                          </h3>
                          <p className="mt-2 text-sm text-[var(--ink-soft)]">
                            Liefereinheit {article.unitText ?? '-'} ·
                            Verkaufseinheit {article.sellAmount ?? '-'}{' '}
                            {article.sellUnit ?? ''}
                          </p>
                        </button>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <div className="text-left lg:text-right">
                            <div className="text-xl font-semibold text-[var(--ink-strong)]">
                              {formatMoney(article.price)}
                            </div>
                            {article.oldPrice ? (
                              <div className="text-sm text-[var(--ink-muted)] line-through">
                                {formatMoney(article.oldPrice)}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--ink-strong)]"
                              onClick={() =>
                                setSelectedArticleNumber(article.articleNumber)
                              }
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="action-button rounded-full px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() =>
                                addMutation.mutate(article.articleNumber)
                              }
                              disabled={!user || addMutation.isPending}
                            >
                              In den Warenkorb
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}

                {!searchQuery.isPending && !searchResults.length ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/45 px-4 py-8 text-center text-sm text-[var(--ink-soft)]">
                    Noch keine Ergebnisse. Gib einen Suchbegriff ein oder
                    versuche es mit einem Produkt wie <strong>milch</strong>.
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="panel rounded-[1.75rem] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="island-kicker mb-2">Artikeldetail</p>
                  <h2 className="m-0 text-2xl font-semibold text-[var(--ink-strong)]">
                    Produktinformationen
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedArticleNumber ? (
                    <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--ink-soft)]">
                      {selectedArticleNumber}
                    </span>
                  ) : null}
                  {selectedArticleNumber ? (
                    <button
                      type="button"
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--line-strong)] hover:bg-[var(--link-bg-hover)] hover:text-[var(--ink-strong)]"
                      onClick={() => setSelectedArticleNumber(null)}
                    >
                      Schliessen
                    </button>
                  ) : null}
                </div>
              </div>

              {!selectedArticleNumber ? (
                <p className="mt-5 text-sm text-[var(--ink-soft)]">
                  Waehle einen Artikel aus den Suchergebnissen, um die
                  Detailansicht zu laden.
                </p>
              ) : detailQuery.isPending ? (
                <p className="mt-5 text-sm text-[var(--ink-soft)]">
                  Artikeldetails werden geladen...
                </p>
              ) : detailQuery.error ? (
                <p className="mt-5 text-sm font-medium text-[var(--alert)]">
                  {detailQuery.error.message}
                </p>
              ) : selectedArticle ? (
                <div className="mt-5 space-y-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="detail-image shrink-0 overflow-hidden rounded-lg bg-white">
                      {getArticleImageUrl(selectedArticle.celumId) ? (
                        <img
                          src={
                            getArticleImageUrl(selectedArticle.celumId) ??
                            undefined
                          }
                          alt={selectedArticle.description}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="article-thumb-fallback">Kein Bild</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-semibold text-[var(--ink-strong)]">
                        {selectedArticle.description}
                      </h3>
                      {selectedArticle.icons.length ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {orderIcons(selectedArticle.icons).map((icon) => (
                            <span
                              key={`${selectedArticle.articleNumber}-${icon.id}`}
                              className="inline-flex items-center gap-1"
                            >
                              {isEcoscoreIcon(icon) &&
                              getEcoscoreLabel(icon) ? (
                                <span className="eco-score-label">
                                  {getEcoscoreLabel(icon)}
                                </span>
                              ) : null}
                              <img
                                src={resolveIconImgUrl(icon)}
                                alt={icon.title ?? 'Artikelicon'}
                                title={icon.title ?? undefined}
                                className="article-icon"
                                loading="lazy"
                              />
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-2 text-sm text-[var(--ink-soft)]">
                        {selectedArticle.descriptionLong ??
                          selectedArticle.foodFact ??
                          'Keine lange Beschreibung verfuegbar.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailTile
                      label="Preis"
                      value={formatMoney(selectedArticle.price)}
                    />
                    <DetailTile
                      label="Verkaufseinheit"
                      value={`${selectedArticle.sellAmount ?? '-'} ${selectedArticle.sellUnit ?? ''}`.trim()}
                    />
                    <DetailTile
                      label="Bestellschluss"
                      value={selectedArticle.orderEndTimesText ?? '-'}
                    />
                    <DetailTile
                      label="Lagerung"
                      value={selectedArticle.durability ?? '-'}
                    />
                  </div>

                  {selectedArticle.ingredients ? (
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink-strong)]">
                        Zutaten
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">
                        {selectedArticle.ingredients}
                      </p>
                    </div>
                  ) : null}

                  {selectedArticle.allergenContains.length ? (
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink-strong)]">
                        Enthaelt
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedArticle.allergenContains.map((item) => (
                          <span
                            key={`${item.id}-${item.text}`}
                            className="rounded-full bg-[rgba(181,59,59,0.08)] px-3 py-1 text-xs font-semibold text-[var(--alert)]"
                          >
                            {item.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedArticle.specialDiet.length ? (
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink-strong)]">
                        Geeignet fuer
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedArticle.specialDiet.map((item) => (
                          <span
                            key={`${item.id}-${item.text}`}
                            className="rounded-full bg-[rgba(42,130,102,0.1)] px-3 py-1 text-xs font-semibold text-[var(--pine)]"
                          >
                            {item.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="action-button w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() =>
                      addMutation.mutate(selectedArticle.articleNumber)
                    }
                    disabled={!user || addMutation.isPending}
                  >
                    Ausgewaehlten Artikel in den Warenkorb
                  </button>
                </div>
              ) : selectedArticleFallback ? (
                <div className="mt-5 text-sm text-[var(--ink-soft)]">
                  {getArticleImageUrl(selectedArticleFallback.celumId) ? (
                    <div className="detail-image mb-4 overflow-hidden rounded-lg bg-white">
                      <img
                        src={
                          getArticleImageUrl(selectedArticleFallback.celumId) ??
                          undefined
                        }
                        alt={selectedArticleFallback.description}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : null}
                  <p>{selectedArticleFallback.description}</p>
                  <p className="mt-2">
                    Preis: {formatMoney(selectedArticleFallback.price)}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="panel rounded-[1.75rem] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="island-kicker mb-2">Warenkorb</p>
                  <h2 className="m-0 text-2xl font-semibold text-[var(--ink-strong)]">
                    Warenkorb
                  </h2>
                </div>
                <div className="text-right text-sm text-[var(--ink-soft)]">
                  <div>{visibleCart?.totalItems ?? 0} Positionen</div>
                  <div className="text-lg font-semibold text-[var(--ink-strong)]">
                    {formatMoney(visibleCart?.totalAmount ?? 0)}
                  </div>
                </div>
              </div>

              {!user ? (
                <p className="mt-5 text-sm text-[var(--ink-soft)]">
                  Melde dich mit einem Demo-Benutzernamen an, um einen eigenen
                  Warenkorb zu erstellen und zu verwalten.
                </p>
              ) : cartQuery.isPending ? (
                <p className="mt-5 text-sm text-[var(--ink-soft)]">
                  Warenkorb wird geladen...
                </p>
              ) : cartQuery.error ? (
                <p className="mt-5 text-sm font-medium text-[var(--alert)]">
                  {cartQuery.error.message}
                </p>
              ) : (
                <>
                  <div className="mt-5 space-y-3">
                    {visibleCart?.items.map((item) => (
                      <article
                        key={item.articleNumber}
                        className="rounded-[1.4rem] border border-[var(--line)] bg-white/72 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="cart-thumb shrink-0 overflow-hidden rounded-lg bg-white">
                              {getArticleImageUrl(item.celumId) ? (
                                <img
                                  src={
                                    getArticleImageUrl(item.celumId) ??
                                    undefined
                                  }
                                  alt={item.description}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="article-thumb-fallback">
                                  Kein Bild
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[var(--ink-strong)]">
                                {item.description}
                              </div>
                              <div className="mt-1 text-xs text-[var(--ink-soft)]">
                                {item.articleNumber} · {item.sellAmount ?? '-'}{' '}
                                {item.sellUnit ?? ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-[var(--ink-strong)]">
                            {formatMoney(item.price * item.quantity)}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-2 py-1">
                            <button
                              type="button"
                              className="quantity-button"
                              onClick={() =>
                                updateQuantityMutation.mutate({
                                  articleNumber: item.articleNumber,
                                  quantity: item.quantity - 1,
                                })
                              }
                            >
                              -
                            </button>
                            <span className="min-w-8 text-center text-sm font-semibold text-[var(--ink-strong)]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              className="quantity-button"
                              onClick={() =>
                                updateQuantityMutation.mutate({
                                  articleNumber: item.articleNumber,
                                  quantity: item.quantity + 1,
                                })
                              }
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="text-sm font-semibold text-[var(--alert)]"
                            onClick={() =>
                              removeMutation.mutate(item.articleNumber)
                            }
                          >
                            Entfernen
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>

                  {!visibleCart?.items.length ? (
                    <p className="mt-5 text-sm text-[var(--ink-soft)]">
                      Der Warenkorb ist leer. Fuege einen Artikel aus den
                      Suchergebnissen oder aus der Detailansicht hinzu.
                    </p>
                  ) : null}

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-[var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => clearMutation.mutate()}
                      disabled={
                        !visibleCart?.items.length || clearMutation.isPending
                      }
                    >
                      {clearMutation.isPending
                        ? 'Leeren...'
                        : 'Warenkorb leeren'}
                    </button>
                    <button
                      type="button"
                      className="action-button rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => checkoutMutation.mutate()}
                      disabled={
                        !visibleCart?.items.length || checkoutMutation.isPending
                      }
                    >
                      {checkoutMutation.isPending
                        ? 'Senden...'
                        : 'Warenkorb senden'}
                    </button>
                  </div>

                  {addMutation.error ||
                  updateQuantityMutation.error ||
                  removeMutation.error ||
                  clearMutation.error ||
                  checkoutMutation.error ? (
                    <p className="mt-4 text-sm font-medium text-[var(--alert)]">
                      {
                        (
                          addMutation.error ??
                          updateQuantityMutation.error ??
                          removeMutation.error ??
                          clearMutation.error ??
                          checkoutMutation.error
                        )?.message
                      }
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </section>
      </main>

      {isLoginModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] px-4 py-8">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.2)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="island-kicker mb-2">Demo-Login</p>
                <h2 className="m-0 text-2xl font-semibold text-[var(--ink-strong)]">
                  Warenkorb zuordnen
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-[var(--line)] px-3 py-1 text-sm font-semibold text-[var(--ink-soft)]"
                onClick={() => setIsLoginModalOpen(false)}
              >
                Schliessen
              </button>
            </div>

            {user ? (
              <div className="mt-4 rounded-xl bg-[rgba(217,31,38,0.06)] px-4 py-3 text-sm font-semibold text-[var(--ink-strong)]">
                Aktiver Benutzer: {user.username}
              </div>
            ) : null}

            <form
              className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]"
              onSubmit={(event) => {
                event.preventDefault()
                setFlash(null)
                loginMutation.mutate(username)
              }}
            >
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Demo-Benutzernamen eingeben"
                className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-muted)]"
              />
              <button
                type="submit"
                className="action-button rounded-2xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loginMutation.isPending || !username.trim()}
              >
                {loginMutation.isPending ? 'Anmelden...' : 'Anmelden'}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-[var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--ink-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setFlash(null)
                  logoutMutation.mutate()
                }}
                disabled={logoutMutation.isPending || !user}
              >
                {logoutMutation.isPending ? 'Abmelden...' : 'Abmelden'}
              </button>
            </form>

            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              Keine Sicherheit in dieser Demo: Der Benutzername wird in einem
              Cookie gespeichert und auf dem Server als Warenkorb-Identitaet
              verwendet.
            </p>

            {loginMutation.error || logoutMutation.error ? (
              <p className="mt-3 text-sm font-medium text-[var(--alert)]">
                {(loginMutation.error ?? logoutMutation.error)?.message}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/68 px-4 py-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  )
}
