import type {
  ApiIcon,
  ArticleDetail,
  SearchArticle,
  SearchResult,
} from './types'

const BASE_URL = 'https://web.transgourmet.ch/de/webshop/resources/articles'

async function fetchTransgourmet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      accept: 'application/json, text/plain, */*',
    },
  })

  if (!response.ok) {
    throw new Error(`Transgourmet request failed with ${response.status}.`)
  }

  return (await response.json()) as T
}

function mapIcons(input: any): Array<ApiIcon> {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id ?? ''),
      imgSrc: String(entry.imgSrc ?? ''),
      title: entry.title ? String(entry.title) : null,
    }))
    .filter((entry) => entry.id && entry.imgSrc)
}

function mapSearchArticle(article: any): SearchArticle {
  return {
    articleNumber: String(article.articleNumber),
    celumId: article.celumId ? String(article.celumId) : null,
    icons: mapIcons(article.icons),
    description: article.description ?? 'Unknown article',
    brand: article.brand ?? null,
    unitText: article.unitText ?? null,
    price: typeof article.price === 'number' ? article.price : null,
    oldPrice: typeof article.oldPrice === 'number' ? article.oldPrice : null,
    sellAmount:
      typeof article.sellAmount === 'number' ? article.sellAmount : null,
    sellUnit: article.sellUnit ?? null,
    status: article.status ?? null,
  }
}

function mapFactList(input: any): Array<{ id: number; text: string }> {
  if (!Array.isArray(input)) {
    return []
  }

  return input.map((entry) => ({
    id: Number(entry.id),
    text: String(entry.text),
  }))
}

export async function searchArticles(
  searchTerm: string,
): Promise<SearchResult> {
  const data = await fetchTransgourmet<any>(
    `/search?searchTerm=${encodeURIComponent(searchTerm)}`,
  )

  const response = data.searchResponse ?? {}
  const articles = Array.isArray(response.articles) ? response.articles : []

  return {
    searchTerm: data.searchTerm ?? searchTerm,
    articles: articles.map(mapSearchArticle),
    totalCount: Number(response.totalCount ?? articles.length ?? 0),
    itemCount: Number(response.itemCount ?? articles.length ?? 0),
    page: Number(response.page ?? 1),
    pageSize: Number(response.pageSize ?? articles.length ?? 0),
  }
}

export async function getArticleDetail(
  articleNumber: string,
): Promise<ArticleDetail> {
  const data = await fetchTransgourmet<any>(
    `/${encodeURIComponent(articleNumber)}/detail`,
  )
  const article = data.article ?? {}

  return {
    articleNumber: String(article.articleNumber ?? articleNumber),
    celumId: article.celumId ? String(article.celumId) : null,
    icons: mapIcons(article.icons),
    description: article.description ?? 'Unknown article',
    descriptionLong: article.descriptionLong ?? null,
    unitText: article.unitText ?? null,
    price: typeof article.price === 'number' ? article.price : null,
    oldPrice: typeof article.oldPrice === 'number' ? article.oldPrice : null,
    pricePerSellUnit:
      typeof article.pricePerSellUnit === 'number'
        ? article.pricePerSellUnit
        : null,
    sellAmount:
      typeof article.sellAmount === 'number' ? article.sellAmount : null,
    sellUnit: article.sellUnit ?? null,
    orderEndTimesText: article.orderEndTimesText ?? null,
    durability: article.durability ?? null,
    foodFact: article.foodFact ?? null,
    ingredients: article.ingredients ?? null,
    nutritionFact:
      article.nutritionFact && typeof article.nutritionFact === 'object'
        ? article.nutritionFact
        : null,
    allergenContains: mapFactList(article.allergenContains),
    allergenMayContains: mapFactList(article.allergenMayContains),
    specialDiet: mapFactList(article.specialDiet),
    hergestellt: mapFactList(article.hergestellt),
  }
}
