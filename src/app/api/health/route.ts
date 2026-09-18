import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Liveness probe for Docker/Compose health checks. */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'snatzee',
    time: new Date().toISOString(),
  })
}
