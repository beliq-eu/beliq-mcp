import { DEFAULT_BASE_URL } from '@beliq/sdk'

export interface Config {
  apiKey: string
  baseUrl: string
  /** How the key is sent to beliq: X-API-Key (default) or Authorization: Bearer. */
  auth: 'header' | 'bearer'
}

/**
 * Build the typed config from the environment. Throws if BELIQ_API_KEY is
 * missing so the server fails fast before connecting the transport.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.BELIQ_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'BELIQ_API_KEY is required. Create a key in the beliq dashboard under API Keys and set it in the MCP server env.'
    )
  }

  const baseUrl = (env.BELIQ_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const auth = env.BELIQ_AUTH?.trim().toLowerCase() === 'bearer' ? 'bearer' : 'header'

  return { apiKey, baseUrl, auth }
}
