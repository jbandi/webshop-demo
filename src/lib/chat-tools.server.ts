import { addToCart, checkoutCart, getCart } from './cart-store.server'
import type {
  AddArticleResult,
  CartSnapshotResult,
  SearchProductsResult,
  SendCartResult,
  ToolErrorResult,
} from './chat-types'
import { getCurrentUser } from './session.server'
import { getArticleDetail, searchArticles } from './transgourmet.server'
import type { SessionUser } from './types'

function requireUser() {
  const user = getCurrentUser()

  if (!user) {
    return {
      ok: false,
      error:
        'Bitte melde dich zuerst an, bevor ich den Warenkorb verwalten kann.',
      requiresLogin: true,
    } satisfies ToolErrorResult
  }

  return user
}

function isToolErrorResult(
  value: SessionUser | ToolErrorResult,
): value is ToolErrorResult {
  return 'ok' in value
}

export async function searchProducts(
  term: string,
): Promise<SearchProductsResult> {
  const cleanTerm = term.trim()

  if (!cleanTerm) {
    return {
      ok: false,
      error: 'Bitte gib einen Suchbegriff ein.',
    }
  }

  try {
    const result = await searchArticles(cleanTerm)
    const articles = result.articles.slice(0, 5).map((article) => ({
      articleNumber: article.articleNumber,
      celumId: article.celumId,
      description: article.description,
      brand: article.brand,
      price: article.price,
      unitText: article.unitText,
      sellAmount: article.sellAmount,
      sellUnit: article.sellUnit,
    }))

    return {
      ok: true,
      searchTerm: result.searchTerm,
      totalCount: result.totalCount,
      shownCount: articles.length,
      articles,
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Die Produktsuche ist fehlgeschlagen.',
    }
  }
}

export async function getCartSnapshot(): Promise<CartSnapshotResult> {
  const user = requireUser()

  if (isToolErrorResult(user)) {
    return user
  }

  const cart = getCart(user)

  return {
    ok: true,
    user,
    items: cart.items.map((item) => ({
      articleNumber: item.articleNumber,
      celumId: item.celumId,
      description: item.description,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
      sellAmount: item.sellAmount,
      sellUnit: item.sellUnit,
    })),
    totalItems: cart.totalItems,
    totalAmount: cart.totalAmount,
  }
}

export async function addArticleToUserCart(
  articleNumber: string,
  quantity: number,
): Promise<AddArticleResult> {
  const user = requireUser()

  if (isToolErrorResult(user)) {
    return user
  }

  const cleanArticleNumber = articleNumber.trim()
  const nextQuantity = Math.floor(quantity)

  if (!cleanArticleNumber) {
    return {
      ok: false,
      error: 'Bitte gib eine Artikelnummer an.',
    }
  }

  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return {
      ok: false,
      error: 'Die Menge muss groesser als null sein.',
    }
  }

  try {
    const article = await getArticleDetail(cleanArticleNumber)
    const cart = addToCart(user, article, nextQuantity)
    const item = cart.items.find(
      (entry) => entry.articleNumber === article.articleNumber,
    )

    if (!item) {
      return {
        ok: false,
        error: 'Der Artikel konnte nicht im Warenkorb bestaetigt werden.',
      }
    }

    return {
      ok: true,
      message: `${item.description} wurde ${item.quantity > nextQuantity ? 'erneut' : 'zum ersten Mal'} in den Warenkorb gelegt.`,
      item: {
        articleNumber: item.articleNumber,
        celumId: item.celumId,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.price * item.quantity,
      },
      totalItems: cart.totalItems,
      totalAmount: cart.totalAmount,
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Der Artikel konnte nicht in den Warenkorb gelegt werden.',
    }
  }
}

export async function sendUserCart(): Promise<SendCartResult> {
  const user = requireUser()

  if (isToolErrorResult(user)) {
    return user
  }

  try {
    const result = checkoutCart(user)

    return {
      ok: true,
      orderNumber: result.orderNumber,
      submittedAt: result.submittedAt,
      totalItems: result.totalItems,
      totalAmount: result.totalAmount,
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Der Warenkorb konnte nicht gesendet werden.',
    }
  }
}
