'use client';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { RATING_CHECKPOINTS, START_RATING, APP_START_DATE } from '@/lib/constants';
import type { RatingPoint } from '@/types';

interface Props { data: RatingPoint[]; currentDay: number; }

export default function RatingChart({ data, currentDay }: Props) {
  // suppress unused warning
  void currentDay;

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const found = data.find(d => {
      const start = new Date(APP_START_DATE);
      const date = new Date(d.date);
      const diff = Math.round((date.getTime() - start.getTime()) / 86400000) + 1;
      return diff === day;
    });
    const checkpoint = RATING_CHECKPOINTS[day];
    return {
      day,
      rating: found?.rating ?? null,
      targetLo: checkpoint ? checkpoint[0] : null,
      targetHi: checkpoint ? checkpoint[1] : null,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} domain={[750, 1250]} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }}
          formatter={(value, name) => [value, name === 'rating' ? 'Рейтинг' : String(name)]}
        />
        {Object.entries(RATING_CHECKPOINTS).map(([d, [lo, hi]]) => (
          <ReferenceArea key={d} x1={parseInt(d) - 0.5} x2={parseInt(d) + 0.5} y1={lo} y2={hi} fill="#f59e0b" fillOpacity={0.2} />
        ))}
        <Line type="monotone" dataKey="rating" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} connectNulls={false} />
        <ReferenceLine y={START_RATING} stroke="#475569" strokeDasharray="4 4" />
        <ReferenceLine y={1200} stroke="#22c55e" strokeDasharray="4 4" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
