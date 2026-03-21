export type ToolErrorResult = {
  ok: false
  error: string
  requiresLogin?: boolean
}

export type SearchProductItem = {
  articleNumber: string
  celumId: string | null
  description: string
  brand: string | null
  price: number | null
  unitText: string | null
  sellAmount: number | null
  sellUnit: string | null
}

export type SearchProductsResult =
  | ToolErrorResult
  | {
      ok: true
      searchTerm: string
      totalCount: number
      shownCount: number
      articles: Array<SearchProductItem>
    }

export type CartSnapshotResult =
  | ToolErrorResult
  | {
      ok: true
      user: {
        userId: string
        username: string
      }
      items: Array<{
        articleNumber: string
        celumId: string | null
        description: string
        price: number
        quantity: number
        lineTotal: number
        sellAmount: number | null
        sellUnit: string | null
      }>
      totalItems: number
      totalAmount: number
    }

export type AddArticleResult =
  | ToolErrorResult
  | {
      ok: true
      message: string
      item: {
        articleNumber: string
        celumId: string | null
        description: string
        quantity: number
        price: number
        lineTotal: number
      }
      totalItems: number
      totalAmount: number
    }

export type SendCartResult =
  | ToolErrorResult
  | {
      ok: true
      orderNumber: string
      submittedAt: string
      totalItems: number
      totalAmount: number
    }
