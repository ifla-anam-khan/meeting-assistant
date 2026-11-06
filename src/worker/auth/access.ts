import type { MiddlewareHandler } from 'hono'
import type { Env } from '../env'

export function accessAuth(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (c.env.SKIP_AUTH === 'true') return next()

    const authHeader = c.req.header('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    const stored = (c.env.APP_TOKEN ?? '').trim()
    if (!token || token !== stored) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return next()
  }
}
