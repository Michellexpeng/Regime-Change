const IS_DEV = import.meta.env.DEV

const COLD_START_MSG =
  'Service is starting up, please wait a moment and try again…'
const LOCAL_DOWN_MSG =
  'Cannot reach API server. Run: python server.py'

/**
 * Fetch with exponential-backoff retry for cold-start delays (e.g. Render free tier).
 * Retries on network errors only; 4xx/5xx responses are returned as-is.
 */
export async function fetchWithRetry(
  url: string,
  retries = 3,
  baseDelayMs = 5000,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url)
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)))
      }
    }
  }
  const msg = IS_DEV ? LOCAL_DOWN_MSG : COLD_START_MSG
  throw new Error(msg)
}
