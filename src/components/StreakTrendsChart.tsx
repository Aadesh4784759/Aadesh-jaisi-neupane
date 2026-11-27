import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { StreakTrendPoint } from '../utils/gamification';

interface StreakTrendsChartProps {
  trendData: StreakTrendPoint[];
}

export const StreakTrendsChart: React.FC<StreakTrendsChartProps> = ({ trendData }) => {
  return (
    <div className="w-full h-48 sm:h-56 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232738" vertical={false} />
          <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} tickLine={false} />
          <YAxis stroke="#9ca3af" fontSize={11} domain={[0, 7]} ticks={[0, 2, 4, 6]} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#101220',
              borderColor: '#a855f7',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            }}
            formatter={(value: any) => [`${value} active days`, 'Consistency']}
            labelStyle={{ color: '#f59e0b', fontWeight: 'bold' }}
          />
          <Line
            type="monotone"
            dataKey="activeDays"
            stroke="#a855f7"
            strokeWidth={2.5}
            dot={{ fill: '#fbbf24', r: 4, strokeWidth: 2, stroke: '#a855f7' }}
            activeDot={{ r: 6, fill: '#f59e0b', stroke: '#ffffff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
