'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChipScroller } from '@/components/ui/segmented'
import { formatNumber, formatPlayedAt } from '@/lib/utils'

type Range = '10' | '25' | '50' | '100'

const RANGES: { key: Range; label: string }[] = [
  { key: '10', label: 'Laatste 10' },
  { key: '25', label: 'Laatste 25' },
  { key: '50', label: 'Laatste 50' },
  { key: '100', label: 'Laatste 100' },
]

export interface ChartPoint {
  score: number
  played_at: string
  is_win: boolean
}

/**
 * Score development over time. Points arrive newest-first and are reversed
 * so the line reads left-to-right chronologically.
 */
export function ScoreChart({ points, average }: { points: ChartPoint[]; average: number | null }) {
  const [range, setRange] = useState<Range>('25')

  const data = useMemo(() => {
    const limit = Number(range)
    return points
      .slice(0, limit)
      .reverse()
      .map((point, index) => ({
        index: index + 1,
        score: point.score,
        label: formatPlayedAt(point.played_at),
        win: point.is_win,
      }))
  }, [points, range])

  if (points.length < 2) {
    return (
      <div className="rounded-[1.75rem] bg-white p-8 text-center ring-1 ring-navy-100/70 shadow-soft">
        <p className="text-sm text-navy-300">
          Vanaf twee geregistreerde potjes tekenen we hier je scoreontwikkeling.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ChipScroller
        ariaLabel="Aantal potjes in de grafiek"
        options={RANGES}
        value={range}
        onChange={setRange}
      />

      <div className="rounded-[1.75rem] bg-white p-4 pr-5 ring-1 ring-navy-100/70 shadow-soft">
        <div className="h-56 w-full" role="img" aria-label="Grafiek van je scoreontwikkeling">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 4, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="#E4E4DE" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="index"
                tick={{ fill: '#7D93A8', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#7D93A8', fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={['dataMin - 20', 'dataMax + 20']}
              />
              {average !== null && (
                <ReferenceLine
                  y={average}
                  stroke="#A855F7"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                />
              )}
              <Tooltip
                cursor={{ stroke: '#24C79A', strokeWidth: 1.5 }}
                contentStyle={{
                  borderRadius: 16,
                  border: 'none',
                  boxShadow: '0 8px 24px -8px rgba(7,30,51,0.24)',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 12px',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
                formatter={(value) => [`${value as number} punten`, '']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#24C79A"
                strokeWidth={3}
                dot={{ r: 3, fill: '#24C79A', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#071E33', strokeWidth: 3, stroke: '#24C79A' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {average !== null && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-navy-300">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-grape-500" />
            All-time gemiddelde: {formatNumber(average, average % 1 === 0 ? 0 : 1)}
          </p>
        )}
      </div>
    </div>
  )
}
