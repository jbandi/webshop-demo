import type {
  ApiErrorPayload,
  ArticleDetail,
  CartState,
  CheckoutResult,
  SearchResult,
  SessionUser,
} from './types'

export class ApiRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `Request failed with ${response.status}`

    try {
      const payload = (await response.json()) as ApiErrorPayload
      if (payload.error) {
        message = payload.error
      }
    } catch {
      // ignore malformed error payloads
    }

    throw new ApiRequestError(message, response.status)
  }

  return (await response.json()) as T
}

export function getSession() {
  return requestJson<{ user: SessionUser | null }>('/api/session')
}

export function login(username: string) {
  return requestJson<{ user: SessionUser }>('/api/session', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export function logout() {
  return requestJson<{ ok: true }>('/api/session', {
    method: 'DELETE',
  })
}

export function search(term: string) {
  return requestJson<SearchResult>(
    `/api/search?term=${encodeURIComponent(term)}`,
  )
}

export function getArticle(articleNumber: string) {
  return requestJson<ArticleDetail>(
    `/api/article/${encodeURIComponent(articleNumber)}`,
  )
}

export function getCart() {
  return requestJson<CartState>('/api/cart')
}

export function addToCart(articleNumber: string, quantity: number) {
  return requestJson<CartState>('/api/cart/items', {
    method: 'POST',
    body: JSON.stringify({ articleNumber, quantity }),
  })
}

export function updateCartItem(articleNumber: string, quantity: number) {
  return requestJson<CartState>(
    `/api/cart/items/${encodeURIComponent(articleNumber)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    },
  )
}

export function removeCartItem(articleNumber: string) {
  return requestJson<CartState>(
    `/api/cart/items/${encodeURIComponent(articleNumber)}`,
    {
      method: 'DELETE',
    },
  )
}

export function clearCart() {
  return requestJson<CartState>('/api/cart', {
    method: 'DELETE',
  })
}

export function checkoutCart() {
  return requestJson<CheckoutResult>('/api/cart/checkout', {
    method: 'POST',
  })
}
