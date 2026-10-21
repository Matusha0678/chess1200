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
          tick={{ fill: '#333', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#181818' }}
          interval={6}
        />
        <YAxis
          tick={{ fill: '#333', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          domain={[780, 1250]}
        />
        <Tooltip
          contentStyle={{ background: '#0A0A0A', border: '1px solid #181818', borderRadius: 0, color: '#EAE8E3', fontSize: 12 }}
          labelStyle={{ color: '#444' }}
          formatter={(value) => [value, 'Рейтинг']}
          labelFormatter={(l) => `День ${l}`}
        />
        {Object.entries(RATING_CHECKPOINTS).map(([d, [lo, hi]]) => (
          <ReferenceArea key={d} x1={parseInt(d) - 0.5} x2={parseInt(d) + 0.5} y1={lo} y2={hi}
            fill="#C9A96E" fillOpacity={0.1} />
        ))}
        <ReferenceLine y={START_RATING} stroke="#181818" strokeDasharray="3 3" />
        <ReferenceLine y={1200} stroke="#2A3A2A" strokeDasharray="3 3" />
        <Line
          type="monotone" dataKey="rating" stroke="#C9A96E" strokeWidth={1.5}
          dot={{ r: 2.5, fill: '#C9A96E', strokeWidth: 0 }}
          activeDot={{ r: 4, fill: '#C9A96E' }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
