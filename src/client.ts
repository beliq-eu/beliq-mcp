import { Beliq } from '@beliq/sdk'
import type { Config } from './config.js'

/**
 * An MCP client's own SDK ends a request after 60 seconds by default, and the
 * protocol leaves each host its own limit. No retry starts after
 * RETRY_BUDGET_MS, so a tool call takes at most the budget plus the last
 * attempt's TIMEOUT_MS: 55 seconds. The budget holds the SDK's short backoff
 * retries of a blip; a `Retry-After` longer than it ends the call at once, and
 * the tool's text tells the model when to try again.
 */
export const RETRY_BUDGET_MS = 10_000
export const TIMEOUT_MS = 45_000

export function createClient(config: Config): Beliq {
  return new Beliq({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    auth: config.auth,
    retryBudgetMs: RETRY_BUDGET_MS,
    timeoutMs: TIMEOUT_MS,
  })
}
