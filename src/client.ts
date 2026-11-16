import { Beliq } from '@beliq/sdk'
import type { Config } from './config.js'

/**
 * How long the client retries an outage, in ms from the first attempt. A host
 * on the MCP TypeScript SDK ends a tool call after its 60-second default
 * request timeout. No retry starts after this budget, which leaves the last
 * attempt 20 s to bring back beliq's own error before that cut.
 */
export const RETRY_BUDGET_MS = 40_000

export function createClient(config: Config): Beliq {
  return new Beliq({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    auth: config.auth,
    retryBudgetMs: RETRY_BUDGET_MS,
  })
}
