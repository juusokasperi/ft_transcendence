import { PieChart, Pie, Cell, BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';
import { toneClass } from '../utils/toneClass';

interface CustomXAxisTickProps {
  x: number;
  y: number;
  payload: {
    value: string | number;
    index: number;
  };
  data: { value: number }[];
}

interface StatBarChartCardProps {
  label: string;
  accent?: string;
  data: { name: string; value: number }[];
  total?: boolean;
}

interface PieChartCardProps {
  label: string;
  accent?: string;
  data: { name: string; value: number }[];
  total: number;
}

export const StatCard: React.FC<{
  label: string;
  value: number | string;
  accent?: string;
  tone?: keyof typeof toneClass;
}> = ({ label, value, accent, tone = 'neutral' }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow shadow-indigo-950/20">
    {accent && <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />}
    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
    <p className={`mt-3 text-2xl font-semibold ${toneClass[tone]}`}>{value}</p>
  </div>
);

const CustomXAxisTick: React.FC<CustomXAxisTickProps> = (props) => {
  const { x, y, payload, data } = props;
  const value = payload.value;
  const index = payload.index;
  const barValue = data && data[index] ? data[index].value : '';
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={12}
        fontWeight={400}
        letterSpacing="0.1em"
      >
        {value}
      </text>
      <text
        x={0}
        y={0}
        dy={30}
        textAnchor="middle"
        fill="#9b9b9bff"
        fontSize={12}
        fontWeight={400}
        letterSpacing="0.1em"
      >
        {barValue}
      </text>
    </g>
  );
};

export const PieChartCard: React.FC<PieChartCardProps> = ({ label, accent, data, total }) => {
  const COLORS = ['oklch(64.8% 0.2 131.684)', 'oklch(87.9% 0.169 91.605)'];
  return (
    <div className="relative flex min-w-[190px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow shadow-indigo-950/20">
      {accent && <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />}
      <p className="mb-2 text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mb-3 flex flex-col">
        <span className="text-xs uppercase tracking-[0.15em] text-slate-400">Wins: {total}%</span>
      </p>
      <div className="flex flex-1 items-center justify-center">
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <defs>
              <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.5" />
              </filter>
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={40}
              stroke="rgba(255, 255, 255, 0.3)"
              filter="url(#pieShadow)"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const StatBarChartCard: React.FC<StatBarChartCardProps> = ({
  label,
  accent,
  data,
  total,
}) => {
  const totalValue = total ? data.reduce((sum, item) => sum + item.value, 0) : null;

  return (
    <div className="relative flex min-w-[190px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow shadow-indigo-950/20">
      {accent && <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />}
      <p className="mb-2 text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
      {total && (
        <p className="mb-3 flex flex-col">
          <span className="text-xs uppercase tracking-[0.15em] text-slate-400">
            Total: {totalValue}
          </span>
        </p>
      )}
      <div className="flex flex-1 items-center justify-center">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ bottom: 10 }}>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={(tickProps) => <CustomXAxisTick {...tickProps} data={data} />}
            />
            <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 8, 8]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
