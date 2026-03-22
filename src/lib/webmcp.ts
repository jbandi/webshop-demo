import { z } from 'zod'
import {
  addToCart,
  ApiRequestError,
  checkoutCart,
  getCart,
  search,
} from './client-api'
import type {
  AddArticleResult,
  CartSnapshotResult,
  SearchProductsResult,
  SendCartResult,
  ToolErrorResult,
} from './chat-types'

type ToolContent = {
  type: 'text'
  text: string
}

type ToolResult = {
  content: Array<ToolContent>
  isError?: boolean
}

type InputSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: Array<string>
}

type RegisteredTool = {
  name: string
  description: string
  inputSchema: InputSchema
  execute: (params: unknown) => Promise<ToolResult>
}

type ModelContext = {
  registerTool: (tool: RegisteredTool) => void
  unregisterTool?: (name: string) => void
}

type WebMCPCallbacks = {
  onSearch?: (term: string) => void
  onCartChange?: () => Promise<void> | void
}

declare global {
  interface Navigator {
    modelContext?: ModelContext
  }
}

const toolNames = [
  'searchProducts',
  'getCart',
  'addArticleToCart',
  'sendCart',
] as const

const searchProductsSchema = {
  type: 'object',
  properties: {
    term: {
      type: 'string',
      description: 'Search term for products in the webshop catalog.',
    },
  },
  required: ['term'],
} satisfies InputSchema

const getCartSchema = {
  type: 'object',
  properties: {},
} satisfies InputSchema

const addArticleToCartSchema = {
  type: 'object',
  properties: {
    articleNumber: {
      type: 'string',
      description: 'Exact product article number to add to the cart.',
    },
    quantity: {
      type: 'number',
      description: 'Quantity to add. Defaults to 1.',
    },
  },
  required: ['articleNumber'],
} satisfies InputSchema

const sendCartSchema = {
  type: 'object',
  properties: {},
} satisfies InputSchema

const searchProductsParams = z.object({
  term: z.string().trim().min(1),
})

const addArticleToCartParams = z.object({
  articleNumber: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(99).optional(),
})

function serializeResult(result: unknown, isError = false): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  }
}

function toToolErrorResult(error: unknown): ToolErrorResult {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return {
        ok: false,
        error:
          'Bitte melde dich zuerst an, bevor ich den Warenkorb verwalten kann.',
        requiresLogin: true,
      }
    }

    return {
      ok: false,
      error: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message,
    }
  }

  return {
    ok: false,
    error: 'Die Tool-Ausfuehrung ist fehlgeschlagen.',
  }
}

async function executeSearchProducts(
  params: unknown,
  callbacks: WebMCPCallbacks,
): Promise<SearchProductsResult> {
  const { term } = searchProductsParams.parse(params)
  const result = await search(term)

  callbacks.onSearch?.(result.searchTerm)

  return {
    ok: true,
    searchTerm: result.searchTerm,
    totalCount: result.totalCount,
    shownCount: Math.min(result.articles.length, 5),
    articles: result.articles.slice(0, 5).map((article) => ({
      articleNumber: article.articleNumber,
      celumId: article.celumId,
      description: article.description,
      brand: article.brand,
      price: article.price,
      unitText: article.unitText,
      sellAmount: article.sellAmount,
      sellUnit: article.sellUnit,
    })),
  }
}

async function executeGetCart(): Promise<CartSnapshotResult> {
  const cart = await getCart()

  if (!cart.user) {
    return {
      ok: false,
      error:
        'Bitte melde dich zuerst an, bevor ich den Warenkorb verwalten kann.',
      requiresLogin: true,
    }
  }

  return {
    ok: true,
    user: cart.user,
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

async function executeAddArticleToCart(
  params: unknown,
  callbacks: WebMCPCallbacks,
): Promise<AddArticleResult> {
  const { articleNumber, quantity = 1 } = addArticleToCartParams.parse(params)

  let previousQuantity = 0

  try {
    const currentCart = await getCart()
    previousQuantity =
      currentCart.items.find((item) => item.articleNumber === articleNumber)
        ?.quantity ?? 0
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      throw error
    }
  }

  const cart = await addToCart(articleNumber, quantity)
  const item = cart.items.find((entry) => entry.articleNumber === articleNumber)

  if (!item) {
    return {
      ok: false,
      error: 'Der Artikel konnte nicht im Warenkorb bestaetigt werden.',
    }
  }

  await callbacks.onCartChange?.()

  return {
    ok: true,
    message: `${item.description} wurde ${previousQuantity > 0 ? 'erneut' : 'zum ersten Mal'} in den Warenkorb gelegt.`,
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
}

async function executeSendCart(
  callbacks: WebMCPCallbacks,
): Promise<SendCartResult> {
  const result = await checkoutCart()

  await callbacks.onCartChange?.()

  return {
    ok: true,
    orderNumber: result.orderNumber,
    submittedAt: result.submittedAt,
    totalItems: result.totalItems,
    totalAmount: result.totalAmount,
  }
}

function createToolExecutor<T>(
  run: (params: unknown) => Promise<T>,
): (params: unknown) => Promise<ToolResult> {
  return async (params) => {
    try {
      const result = await run(params)
      const isError =
        typeof result === 'object' && result !== null && 'ok' in result
          ? result.ok === false
          : false

      return serializeResult(result, isError)
    } catch (error) {
      const toolError = toToolErrorResult(error)
      return serializeResult(toolError, true)
    }
  }
}

export function registerWebMCPTools(callbacks: WebMCPCallbacks = {}) {
  const modelContext = navigator.modelContext

  if (!modelContext) {
    return () => {}
  }

  modelContext.registerTool({
    name: 'searchProducts',
    description:
      'Suche nach passenden Produkten im Shop-Katalog fuer einen Suchbegriff.',
    inputSchema: searchProductsSchema,
    execute: createToolExecutor((params) =>
      executeSearchProducts(params, callbacks),
    ),
  })

  modelContext.registerTool({
    name: 'getCart',
    description:
      'Lade den aktuellen Warenkorb des angemeldeten Demo-Benutzers.',
    inputSchema: getCartSchema,
    execute: createToolExecutor(() => executeGetCart()),
  })

  modelContext.registerTool({
    name: 'addArticleToCart',
    description:
      'Fuege einen Artikel ueber seine Artikelnummer in den Warenkorb ein.',
    inputSchema: addArticleToCartSchema,
    execute: createToolExecutor((params) =>
      executeAddArticleToCart(params, callbacks),
    ),
  })

  modelContext.registerTool({
    name: 'sendCart',
    description:
      'Sende den aktuellen Warenkorb ueber den bestehenden Checkout-Prozess.',
    inputSchema: sendCartSchema,
    execute: createToolExecutor(() => executeSendCart(callbacks)),
  })

  return () => {
    for (const toolName of toolNames) {
      modelContext.unregisterTool?.(toolName)
    }
  }
}
