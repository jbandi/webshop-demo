import type {
  ArticleDetail,
  CartItem,
  CartState,
  CheckoutResult,
  SessionUser,
} from './types'

const carts = new Map<string, Array<CartItem>>()
let orderSequence = 1000

function summarizeCart(user: SessionUser, items: Array<CartItem>): CartState {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalAmount = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )

  return {
    user,
    items,
    totalItems,
    totalAmount,
  }
}

function articleToCartItem(article: ArticleDetail, quantity: number): CartItem {
  return {
    articleNumber: article.articleNumber,
    celumId: article.celumId,
    description: article.description,
    unitText: article.unitText,
    price: article.price ?? 0,
    quantity,
    sellAmount: article.sellAmount,
    sellUnit: article.sellUnit,
  }
}

export function getCart(user: SessionUser): CartState {
  return summarizeCart(user, carts.get(user.userId) ?? [])
}

export function addToCart(
  user: SessionUser,
  article: ArticleDetail,
  quantity: number,
): CartState {
  const items = [...(carts.get(user.userId) ?? [])]
  const index = items.findIndex(
    (item) => item.articleNumber === article.articleNumber,
  )

  if (index >= 0) {
    items[index] = {
      ...items[index],
      quantity: items[index].quantity + quantity,
    }
  } else {
    items.push(articleToCartItem(article, quantity))
  }

  carts.set(user.userId, items)
  return summarizeCart(user, items)
}

export function updateCartQuantity(
  user: SessionUser,
  articleNumber: string,
  quantity: number,
): CartState {
  const items = [...(carts.get(user.userId) ?? [])]
  const nextItems = items
    .map((item) =>
      item.articleNumber === articleNumber ? { ...item, quantity } : item,
    )
    .filter((item) => item.quantity > 0)

  carts.set(user.userId, nextItems)
  return summarizeCart(user, nextItems)
}

export function removeFromCart(
  user: SessionUser,
  articleNumber: string,
): CartState {
  const nextItems = (carts.get(user.userId) ?? []).filter(
    (item) => item.articleNumber !== articleNumber,
  )

  carts.set(user.userId, nextItems)
  return summarizeCart(user, nextItems)
}

export function clearCart(user: SessionUser): CartState {
  carts.set(user.userId, [])
  return summarizeCart(user, [])
}

export function checkoutCart(user: SessionUser): CheckoutResult {
  const cart = getCart(user)

  if (!cart.items.length) {
    throw new Error('Your shopping cart is empty.')
  }

  orderSequence += 1
  carts.set(user.userId, [])

  return {
    user,
    orderNumber: `TGD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${orderSequence}`,
    submittedAt: new Date().toISOString(),
    totalItems: cart.totalItems,
    totalAmount: cart.totalAmount,
  }
}
