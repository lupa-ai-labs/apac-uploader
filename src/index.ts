export interface Env {
  UPLOADER: DurableObjectNamespace
  /** Shared secret the caller must present in the request body */
  SECRET: string
  /** Durable Object location hint — the region to run the upload from. One of
   *  wnam | enam | sam | weur | eeur | apac | oc | afr | me. Default: apac */
  LOCATION_HINT?: string
}

interface UploadRequest {
  secret?: string
  /** URL to stream the bytes from */
  sourceUrl?: string
  /** Authorization header value for the source fetch (e.g. `Bearer …`) */
  sourceAuth?: string
  /** Presigned PUT URL to stream the bytes into */
  targetUrl?: string
}

export class Uploader {
  async fetch(request: Request): Promise<Response> {
    const { sourceUrl, sourceAuth, targetUrl } = (await request.json()) as UploadRequest
    let colo: string | null = null
    try {
      const trace = await (await fetch('https://cloudflare.com/cdn-cgi/trace')).text()
      colo = trace.split('colo=')[1]?.split('\n')[0] ?? null
    } catch {
    }

    const headers: Record<string, string> = {}
    if (sourceAuth) headers['Authorization'] = sourceAuth
    const src = await fetch(sourceUrl!, { headers })
    if (!src.ok || !src.body) {
      return Response.json({ ok: false, colo, error: `source ${src.status}` })
    }

    const len = src.headers.get('content-length')
    const t0 = Date.now()

    let status: number | null = null
    let error: string | null = null

    try {
      const put = await fetch(targetUrl!, {
        method: 'PUT',
        body: src.body,
        headers: {
          ...(len ? { 'Content-Length': len } : {}),
          'Content-Type': 'application/octet-stream',
        },
        duplex: 'half',
      } as RequestInit)
      status = put.status
    } catch (e) {
      error = String(e)
    }
    const seconds = (Date.now() - t0) / 1000
    const ok = status != null && status >= 200 && status < 300
    return Response.json({ ok, colo, bytes: len ? Number(len) : null, status, error, seconds })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    let body: UploadRequest
    try {
      body = (await request.json()) as UploadRequest
    } catch {
      return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
    }

    if (!body.secret || body.secret !== env.SECRET) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    if (!body.sourceUrl || !body.targetUrl) {
      return Response.json({ ok: false, error: 'missing sourceUrl/targetUrl' }, { status: 400 })
    }

    const locationHint = (env.LOCATION_HINT ?? 'apac') as DurableObjectLocationHint
    const id = env.UPLOADER.idFromName(locationHint)
    const stub = env.UPLOADER.get(id, { locationHint })

    const res = await stub.fetch('https://do/run', {
      method: 'POST',
      body: JSON.stringify({
        sourceUrl: body.sourceUrl,
        sourceAuth: body.sourceAuth,
        targetUrl: body.targetUrl,
      }),
    })

    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
