import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export default function BodyMeasureChart({ data, borderColor, strokeColor }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={borderColor} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94A3B8" }} />
        <Tooltip
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
          stroke={strokeColor}
          strokeWidth={2.5}
          dot={{ r: 2 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
