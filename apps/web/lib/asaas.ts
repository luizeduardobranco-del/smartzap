const BASE_URL =
  process.env.ASAAS_SANDBOX === 'true'
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3'

export async function asaas<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (!process.env.ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY não configurada.')
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      access_token: process.env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg =
      data?.errors?.[0]?.description ??
      data?.message ??
      `Asaas error ${res.status}`
    throw new Error(msg)
  }

  return data as T
}
