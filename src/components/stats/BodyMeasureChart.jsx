import React, { useId } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export default function BodyMeasureChart({ data, borderColor, strokeColor, locale='fr', valueLabel='', valueFormatter }) {
  const gradientId = `body-measure-progress-${useId().replace(/:/g, "")}`;
  const formatDate = value => {
    const date = new Date(`${String(value).slice(0,10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
  };

  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1F5EFF" />
            <stop offset="52%" stopColor="#257CFF" />
            <stop offset="100%" stopColor="#00B8FF" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={borderColor} />
        <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={35} tick={{ fontSize: 11, fill: "#94A3B8" }} />
        <YAxis allowDecimals={false} tickFormatter={valueFormatter} tick={{ fontSize: 11, fill: "#94A3B8" }} />
        <Tooltip
          labelFormatter={formatDate}
          formatter={value=>[valueFormatter ? valueFormatter(value) : new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value),valueLabel]}
          contentStyle={{
            fontSize: "12px",
            borderRadius: "16px",
            border: `1px solid ${borderColor}`,
            background: "rgba(15,23,42,0.92)",
            color: "#fff",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={`url(#${gradientId})`}
          strokeWidth={2.5}
          dot={{ r: 2, fill: strokeColor, stroke: strokeColor }}
          activeDot={{ r: 4, fill: strokeColor, stroke: strokeColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
