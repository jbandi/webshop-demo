import { validateUIMessages } from 'ai'
import type { UIMessage } from 'ai'

type ChatGuardConfig = {
  windowMs: number
  maxRequestsPerWindow: number
  maxConcurrentPerClient: number
  maxConcurrentGlobal: number
  maxMessages: number
  maxCharsPerMessage: number
  maxTotalChars: number
  maxRequestBytes: number
  idleEntryTtlMs: number
  requestTimeoutMs: number
}

type ClientState = {
  windowStartedAt: number
  requestCount: number
  inFlight: number
  lastSeenAt: number
}

type ChatGuardFailure = {
  ok: false
  status: number
  error: string
}

type ChatGuardSuccess = {
  ok: true
  clientKey: string
  messages: Array<UIMessage>
  abortSignal: AbortSignal | undefined
  release: () => void
}

type InspectChatRequestOptions = {
  request: Request
  tools?: Record<string, unknown>
}

const defaultConfig: ChatGuardConfig = {
  windowMs: 60_000,
  maxRequestsPerWindow: 20,
  maxConcurrentPerClient: 2,
  maxConcurrentGlobal: 10,
  maxMessages: 8,
  maxCharsPerMessage: 2_000,
  maxTotalChars: 12_000,
  maxRequestBytes: 64_000,
  idleEntryTtlMs: 10 * 60_000,
  requestTimeoutMs: 30_000,
}

function failure(status: number, error: string): ChatGuardFailure {
  return { ok: false, status, error }
}

function isGuardFailure(
  value: ChatGuardFailure | { release: () => void },
): value is ChatGuardFailure {
  return 'ok' in value && value.ok === false
}

function firstForwardedValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const [first] = value.split(',')
  const normalized = first?.trim()

  return normalized || null
}

function getClientKey(request: Request) {
  return (
    firstForwardedValue(request.headers.get('x-forwarded-for')) ??
    firstForwardedValue(request.headers.get('x-real-ip')) ??
    'unknown'
  )
}

function parseContentLength(request: Request) {
  const rawValue = request.headers.get('content-length')

  if (!rawValue) {
    return null
  }

  const value = Number(rawValue)

  return Number.isFinite(value) && value >= 0 ? value : null
}

function safeSerializedLength(value: unknown) {
  if (value == null) {
    return 0
  }

  if (typeof value === 'string') {
    return value.length
  }

  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

function getPartSize(part: UIMessage['parts'][number]) {
  if (part.type === 'text' || part.type === 'reasoning') {
    return part.text.length
  }

  if (part.type.startsWith('tool-')) {
    return (
      safeSerializedLength('input' in part ? part.input : undefined) +
      safeSerializedLength('output' in part ? part.output : undefined) +
      safeSerializedLength('errorText' in part ? part.errorText : undefined)
    )
  }

  if (part.type === 'source-url') {
    return part.url.length
  }

  if (part.type === 'source-document') {
    return (
      part.sourceId.length +
      part.mediaType.length +
      part.title.length +
      safeSerializedLength(part.filename)
    )
  }

  if (part.type === 'file') {
    return safeSerializedLength(part.url) + safeSerializedLength(part.filename)
  }

  return 0
}

function enforceMessageBudgets(
  messages: Array<UIMessage>,
  config: ChatGuardConfig,
): ChatGuardFailure | null {
  let totalChars = 0

  for (const message of messages) {
    let messageChars = 0

    for (const part of message.parts) {
      messageChars += getPartSize(part)
    }

    if (messageChars > config.maxCharsPerMessage) {
      return failure(
        400,
        `A chat message is too large. Keep each message under ${config.maxCharsPerMessage} characters.`,
      )
    }

    totalChars += messageChars
  }

  if (totalChars > config.maxTotalChars) {
    return failure(
      400,
      `Chat history is too large. Keep the total input under ${config.maxTotalChars} characters.`,
    )
  }

  return null
}

function createCombinedAbortSignal(
  requestSignal: AbortSignal,
  timeoutMs: number,
) {
  if (typeof AbortSignal === 'undefined') {
    return requestSignal
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([requestSignal, timeoutSignal])
  }

  const controller = new AbortController()

  function abortFrom(signal: AbortSignal) {
    if (signal.aborted) {
      controller.abort(signal.reason)
    }
  }

  abortFrom(requestSignal)
  abortFrom(timeoutSignal)

  if (!controller.signal.aborted) {
    requestSignal.addEventListener(
      'abort',
      () => controller.abort(requestSignal.reason),
      {
        once: true,
      },
    )
    timeoutSignal.addEventListener(
      'abort',
      () => controller.abort(timeoutSignal.reason),
      {
        once: true,
      },
    )
  }

  return controller.signal
}

export function createChatGuard(
  configOverrides: Partial<ChatGuardConfig> = {},
) {
  const config = { ...defaultConfig, ...configOverrides }
  const clients = new Map<string, ClientState>()
  let globalInFlight = 0

  function cleanup(now: number) {
    for (const [clientKey, state] of clients) {
      const isExpired = now - state.lastSeenAt > config.idleEntryTtlMs
      if (state.inFlight === 0 && isExpired) {
        clients.delete(clientKey)
      }
    }
  }

  function getOrCreateState(clientKey: string, now: number) {
    const existing = clients.get(clientKey)

    if (existing) {
      if (now - existing.windowStartedAt >= config.windowMs) {
        existing.windowStartedAt = now
        existing.requestCount = 0
      }

      existing.lastSeenAt = now
      return existing
    }

    const nextState: ClientState = {
      windowStartedAt: now,
      requestCount: 0,
      inFlight: 0,
      lastSeenAt: now,
    }

    clients.set(clientKey, nextState)
    return nextState
  }

  function acquireClientSlot(
    clientKey: string,
  ): ChatGuardFailure | { release: () => void } {
    const now = Date.now()
    cleanup(now)

    const state = getOrCreateState(clientKey, now)

    if (state.requestCount >= config.maxRequestsPerWindow) {
      return failure(
        429,
        'Too many chat requests. Please try again in a minute.',
      )
    }

    if (state.inFlight >= config.maxConcurrentPerClient) {
      return failure(
        429,
        'Too many chat requests are already running for this client.',
      )
    }

    if (globalInFlight >= config.maxConcurrentGlobal) {
      return failure(503, 'Chat is temporarily busy. Please try again shortly.')
    }

    state.requestCount += 1
    state.inFlight += 1
    state.lastSeenAt = now
    globalInFlight += 1

    let released = false

    return {
      release: () => {
        if (released) {
          return
        }

        released = true
        state.inFlight = Math.max(0, state.inFlight - 1)
        state.lastSeenAt = Date.now()
        globalInFlight = Math.max(0, globalInFlight - 1)
      },
    }
  }

  return {
    async inspectRequest({
      request,
      tools,
    }: InspectChatRequestOptions): Promise<
      ChatGuardFailure | ChatGuardSuccess
    > {
      const contentLength = parseContentLength(request)

      if (contentLength != null && contentLength > config.maxRequestBytes) {
        return failure(
          413,
          `Chat request is too large. Keep it under ${config.maxRequestBytes} bytes.`,
        )
      }

      const clientKey = getClientKey(request)
      const slot = acquireClientSlot(clientKey)

      if (isGuardFailure(slot)) {
        return slot
      }

      try {
        const body = (await request.json()) as { messages?: unknown }
        const validatedMessages = await validateUIMessages({
          messages: Array.isArray(body.messages) ? body.messages : [],
          tools: tools as never,
        })

        const messages = validatedMessages.slice(-config.maxMessages)
        const budgetFailure = enforceMessageBudgets(messages, config)

        if (budgetFailure) {
          slot.release()
          return budgetFailure
        }

        return {
          ok: true,
          clientKey,
          messages,
          abortSignal: createCombinedAbortSignal(
            request.signal,
            config.requestTimeoutMs,
          ),
          release: slot.release,
        }
      } catch {
        slot.release()
        return failure(400, 'Invalid chat payload.')
      }
    },
  }
}

export const chatGuard = createChatGuard({
  maxConcurrentGlobal: 10,
})
