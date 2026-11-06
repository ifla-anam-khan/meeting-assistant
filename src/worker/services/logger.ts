import { lt } from 'drizzle-orm'
import { appLogs } from '../db/schema'
import type { Db } from '../db/client'

export type LogLevel = 'error' | 'warn' | 'info'

export async function writeLog(
  db: Db,
  level: LogLevel,
  source: string,
  message: string,
  detail?: string,
): Promise<void> {
  try {
    await db.insert(appLogs).values({ level, source, message, detail: detail ?? null })
  } catch {
    // Never let logging crash the main request
    console.error('[logger] failed to write log:', message)
  }
}

// Prune logs older than 10 days — called from the hourly cron
export async function pruneOldLogs(db: Db): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    await db.delete(appLogs).where(lt(appLogs.createdAt, new Date(cutoff)))
  } catch {
    console.error('[logger] failed to prune logs')
  }
}
