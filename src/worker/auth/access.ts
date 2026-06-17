import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from '../env'

export function accessAuth(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    // Skip auth in local dev (set SKIP_AUTH=true in .dev.vars)
    if (c.env.SKIP_AUTH === 'true') {
      return next()
    }

    const token = c.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    try {
      const certsUrl = `https://${c.env.CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`
      const JWKS = createRemoteJWKSet(new URL(certsUrl))

      await jwtVerify(token, JWKS, {
        issuer: `https://${c.env.CF_ACCESS_TEAM}.cloudflareaccess.com`,
        audience: c.env.CF_ACCESS_AUD,
      })

      return next()
    } catch (err) {
      console.error('[access-auth] JWT verification failed:', err)
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
}
