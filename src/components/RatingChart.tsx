'use client';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { RATING_CHECKPOINTS, START_RATING, APP_START_DATE } from '@/lib/constants';
import type { RatingPoint } from '@/types';

interface Props { data: RatingPoint[]; currentDay: number; }

export default function RatingChart({ data, currentDay }: Props) {
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
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={{ fill: '#8F887C', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#2A2722' }}
          interval={6}
        />
        <YAxis
          tick={{ fill: '#8F887C', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          domain={[780, 1250]}
        />
        <Tooltip
          contentStyle={{ background: '#0D0C0A', border: '1px solid #2A2722', borderRadius: 10, color: '#F3EEE5', fontSize: 13, fontWeight: 600 }}
          labelStyle={{ color: '#B3AC9F' }}
          formatter={(value) => [value, 'Рейтинг']}
          labelFormatter={(l) => `День ${l}`}
        />
        {Object.entries(RATING_CHECKPOINTS).map(([d, [lo, hi]]) => (
          <ReferenceArea key={d} x1={parseInt(d) - 0.5} x2={parseInt(d) + 0.5} y1={lo} y2={hi}
            fill="#D6B97E" fillOpacity={0.08} />
        ))}
        <ReferenceLine y={START_RATING} stroke="#2A2722" strokeDasharray="4 4" />
        <ReferenceLine y={1200} stroke="#8F887C" strokeDasharray="6 6" />
        <Line
          type="monotone" dataKey="rating" stroke="#D6B97E" strokeWidth={2}
          dot={{ r: 3, fill: '#D6B97E', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#D6B97E' }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
