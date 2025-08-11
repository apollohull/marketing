import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// --- Helper utils ---
const parseCSV = (text) => {
  // Minimal CSV parser (handles commas inside quotes and newlines)
  const rows = [];
  let i = 0,
    field = "",
    row = [],
    inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") pushField();
      else if (c === "\n" || c === "\r") {
        // handle CRLF / LF
        if (c === "\r" && text[i + 1] === "\n") i++;
        pushField();
        // skip empty trailing rows
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();
      } else field += c;
    }
    i++;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.length && r.some((x) => x !== ""));
};

const toNumber = (v) => {
  const n =
    typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtUSD = (n) =>
  n?.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
const fmtNum = (n) => n?.toLocaleString();
const fmtPct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "—");

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#a855f7",
  "#3b82f6",
  "#84cc16",
]; // Tailwind palette hints

// --- Template CSV ---
const TEMPLATE_CSV = `Date,Channel,Campaign,Spend,Impressions,Clicks,Conversions,Revenue\n2025-07-01,Instagram,DT-Launch,350,92000,2100,110,2400\n2025-07-02,Facebook,DT-Launch,250,71000,1500,75,1600\n2025-07-02,Email,DT-Launch,60,25000,1200,180,3600\n2025-07-03,Google,DT-Prospecting,300,50000,900,45,1200\n2025-07-03,Instagram,DT-Remarketing,180,20000,800,95,2100\n2025-07-04,Influencers,DT-Creators,600,120000,2600,130,3000\n`;

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const groupBy = (arr, keyFn) =>
  arr.reduce((acc, x) => {
    const k = keyFn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});

export default function MarketingSpendDashboard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    channels: new Set(),
    campaignQuery: "",
    start: "",
    end: "",
  });
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    setError("");
    if (!file) return;
    const text = await file.text();
    const raw = parseCSV(text);
    if (!raw.length) {
      setError("No rows found.");
      return;
    }
    const header = raw[0].map((h) => h.trim());
    const idx = Object.fromEntries(
      [
        "Date",
        "Channel",
        "Campaign",
        "Spend",
        "Impressions",
        "Clicks",
        "Conversions",
        "Revenue",
      ].map((h) => [h, header.indexOf(h)])
    );
    const missing = Object.entries(idx)
      .filter(([, i]) => i === -1)
      .map(([h]) => h);
    if (missing.length) {
      setError(`Missing columns: ${missing.join(", ")}`);
      return;
    }
    const parsed = raw
      .slice(1)
      .map((r) => ({
        Date: new Date(r[idx.Date]),
        Channel: r[idx.Channel]?.trim() || "Unspecified",
        Campaign: r[idx.Campaign]?.trim() || "—",
        Spend: toNumber(r[idx.Spend]),
        Impressions: toNumber(r[idx.Impressions]),
        Clicks: toNumber(r[idx.Clicks]),
        Conversions: toNumber(r[idx.Conversions]),
        Revenue: toNumber(r[idx.Revenue]),
      }))
      .filter((r) => !isNaN(r.Date));
    setRows(parsed);
  };

  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.Channel))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const { channels: ch, campaignQuery, start, end } = filters;
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    return rows.filter(
      (r) =>
        (!s || r.Date >= s) &&
        (!e || r.Date <= e) &&
        (ch.size === 0 || ch.has(r.Channel)) &&
        (campaignQuery
          ? r.Campaign.toLowerCase().includes(campaignQuery.toLowerCase())
          : true)
    );
  }, [rows, filters]);

  const totals = useMemo(() => {
    const spend = filtered.reduce((a, r) => a + r.Spend, 0);
    const revenue = filtered.reduce((a, r) => a + r.Revenue, 0);
    const clicks = filtered.reduce((a, r) => a + r.Clicks, 0);
    const conv = filtered.reduce((a, r) => a + r.Conversions, 0);
    const imps = filtered.reduce((a, r) => a + r.Impressions, 0);
    const roas = spend > 0 ? revenue / spend : null;
    const ctr = imps > 0 ? clicks / imps : null;
    const cvr = clicks > 0 ? conv / clicks : null;
    const cpa = conv > 0 ? spend / conv : null;
    const cpc = clicks > 0 ? spend / clicks : null;
    const cpm = imps > 0 ? (spend / imps) * 1000 : null;
    return {
      spend,
      revenue,
      clicks,
      conv,
      imps,
      roas,
      ctr,
      cvr,
      cpa,
      cpc,
      cpm,
    };
  }, [filtered]);

  const byDate = useMemo(() => {
    const map = groupBy(filtered, (r) => r.Date.toISOString().slice(0, 10));
    return Object.entries(map)
      .map(([date, arr]) => ({
        date,
        Spend: arr.reduce((a, r) => a + r.Spend, 0),
        Revenue: arr.reduce((a, r) => a + r.Revenue, 0),
        ROAS: (() => {
          const s = arr.reduce((a, r) => a + r.Spend, 0);
          const rev = arr.reduce((a, r) => a + r.Revenue, 0);
          return s > 0 ? rev / s : 0;
        })(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const spendPie = useMemo(() => {
    const map = groupBy(filtered, (r) => r.Channel);
    return Object.entries(map)
      .map(([ch, arr]) => ({
        name: ch,
        value: arr.reduce((a, r) => a + r.Spend, 0),
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byChannelBar = useMemo(() => {
    const map = groupBy(filtered, (r) => r.Channel);
    return Object.entries(map)
      .map(([ch, arr]) => ({
        Channel: ch,
        Spend: arr.reduce((a, r) => a + r.Spend, 0),
        Revenue: arr.reduce((a, r) => a + r.Revenue, 0),
      }))
      .sort((a, b) => b.Revenue - a.Revenue);
  }, [filtered]);

  const campaignTable = useMemo(() => {
    const map = groupBy(filtered, (r) => r.Campaign);
    return Object.entries(map)
      .map(([camp, arr]) => {
        const spend = arr.reduce((a, r) => a + r.Spend, 0);
        const revenue = arr.reduce((a, r) => a + r.Revenue, 0);
        const clicks = arr.reduce((a, r) => a + r.Clicks, 0);
        const conv = arr.reduce((a, r) => a + r.Conversions, 0);
        const imps = arr.reduce((a, r) => a + r.Impressions, 0);
        return {
          Campaign: camp,
          ChannelCount: new Set(arr.map((r) => r.Channel)).size,
          Spend: spend,
          Revenue: revenue,
          ROAS: spend > 0 ? revenue / spend : null,
          Clicks: clicks,
          Conversions: conv,
          CPA: conv > 0 ? spend / conv : null,
          CPC: clicks > 0 ? spend / clicks : null,
          CPM: imps > 0 ? (spend / imps) * 1000 : null,
        };
      })
      .sort((a, b) => b.Revenue - a.Revenue);
  }, [filtered]);

  const exportFiltered = () => {
    const header = [
      "Date",
      "Channel",
      "Campaign",
      "Spend",
      "Impressions",
      "Clicks",
      "Conversions",
      "Revenue",
    ];
    const lines = [header.join(",")].concat(
      filtered.map((r) =>
        [
          r.Date.toISOString().slice(0, 10),
          r.Channel,
          r.Campaign,
          r.Spend,
          r.Impressions,
          r.Clicks,
          r.Conversions,
          r.Revenue,
        ].join(",")
      )
    );
    downloadBlob(lines.join("\n"), "filtered_marketing_data.csv", "text/csv");
  };

  const loadTemplate = () => {
    const f = new File([TEMPLATE_CSV], "template.csv", { type: "text/csv" });
    handleFile(f);
  };

  // Auto-load template on first mount for preview
  useEffect(() => {
    if (!rows.length) loadTemplate(); /* eslint-disable-next-line */
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Marketing Spend & ROAS Dashboard
            </h1>
            <p className="text-sm text-gray-600">
              Upload your CSV to analyze spend, revenue, and efficiency across
              channels and campaigns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                downloadBlob(TEMPLATE_CSV, "marketing_template.csv", "text/csv")
              }
              className="px-3 py-2 rounded-xl bg-white shadow border hover:bg-gray-100"
            >
              Download CSV Template
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white shadow hover:bg-indigo-700"
            >
              Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </header>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Filters */}
        <section className="grid md:grid-cols-4 gap-3 bg-white p-4 rounded-2xl shadow">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Campaign search</label>
            <input
              value={filters.campaignQuery}
              onChange={(e) =>
                setFilters((f) => ({ ...f, campaignQuery: e.target.value }))
              }
              placeholder="e.g., DT-Launch"
              className="w-full px-3 py-2 rounded-xl border"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Start date</label>
            <input
              type="date"
              value={filters.start}
              onChange={(e) =>
                setFilters((f) => ({ ...f, start: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl border"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">End date</label>
            <input
              type="date"
              value={filters.end}
              onChange={(e) =>
                setFilters((f) => ({ ...f, end: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-xl border"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Channels</label>
            <div className="flex flex-wrap gap-2">
              {channels.map((ch, i) => {
                const active = filters.channels.has(ch);
                return (
                  <button
                    key={i}
                    onClick={() =>
                      setFilters((f) => {
                        const s = new Set(f.channels);
                        active ? s.delete(ch) : s.add(ch);
                        return { ...f, channels: s };
                      })
                    }
                    className={`px-3 py-1 rounded-full border ${
                      active ? "bg-gray-900 text-white" : "bg-white"
                    }`}
                  >
                    {ch}
                  </button>
                );
              })}
              {channels.length === 0 && (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>
        </section>

        {/* KPI cards */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: "Spend", value: fmtUSD(totals.spend) },
            { label: "Revenue", value: fmtUSD(totals.revenue) },
            {
              label: "ROAS",
              value: totals.roas ? totals.roas.toFixed(2) + "x" : "—",
            },
            { label: "CPA", value: totals.cpa ? fmtUSD(totals.cpa) : "—" },
            { label: "CPC", value: totals.cpc ? fmtUSD(totals.cpc) : "—" },
            { label: "CPM", value: totals.cpm ? fmtUSD(totals.cpm) : "—" },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl shadow p-4">
              <div className="text-xs text-gray-500">{kpi.label}</div>
              <div className="text-xl font-semibold">{kpi.value}</div>
            </div>
          ))}
        </section>

        {/* Charts */}
        <section className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">Spend & Revenue over time</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={byDate}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(v, n) =>
                      n === "ROAS" ? v.toFixed(2) + "x" : fmtUSD(v)
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Spend"
                    stroke="#3b82f6"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Revenue"
                    stroke="#22c55e"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">ROAS over time</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(v) => v.toFixed(2) + "x"} />
                  <Legend />
                  <Bar dataKey="ROAS" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">Spend by channel</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={spendPie}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={110}
                  >
                    {spendPie.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtUSD(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">Revenue vs Spend by channel</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byChannelBar}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Channel" />
                  <YAxis />
                  <Tooltip formatter={(v, n) => fmtUSD(v)} />
                  <Legend />
                  <Bar dataKey="Revenue" fill="#22c55e" />
                  <Bar dataKey="Spend" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Campaign table */}
        <section className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Campaign performance</h3>
            <div className="flex gap-2">
              <button
                onClick={exportFiltered}
                className="px-3 py-2 rounded-xl bg-white border shadow hover:bg-gray-100"
              >
                Export filtered CSV
              </button>
              <button
                onClick={() =>
                  setFilters({
                    channels: new Set(),
                    campaignQuery: "",
                    start: "",
                    end: "",
                  })
                }
                className="px-3 py-2 rounded-xl bg-gray-900 text-white"
              >
                Reset filters
              </button>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  {[
                    "Campaign",
                    "Channels",
                    "Spend",
                    "Revenue",
                    "ROAS",
                    "CPC",
                    "CPA",
                    "CPM",
                    "Clicks",
                    "Conversions",
                  ].map((h) => (
                    <th key={h} className="py-2 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignTable.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.Campaign}</td>
                    <td className="py-2 pr-4">{r.ChannelCount}</td>
                    <td className="py-2 pr-4">{fmtUSD(r.Spend)}</td>
                    <td className="py-2 pr-4">{fmtUSD(r.Revenue)}</td>
                    <td className="py-2 pr-4">
                      {r.ROAS ? r.ROAS.toFixed(2) + "x" : "—"}
                    </td>
                    <td className="py-2 pr-4">{r.CPC ? fmtUSD(r.CPC) : "—"}</td>
                    <td className="py-2 pr-4">{r.CPA ? fmtUSD(r.CPA) : "—"}</td>
                    <td className="py-2 pr-4">{r.CPM ? fmtUSD(r.CPM) : "—"}</td>
                    <td className="py-2 pr-4">{fmtNum(r.Clicks)}</td>
                    <td className="py-2 pr-4">{fmtNum(r.Conversions)}</td>
                  </tr>
                ))}
                {campaignTable.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-500">
                      No data. Upload a CSV to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-xs text-gray-500 text-center">
          <p>
            Tip: Columns required — Date, Channel, Campaign, Spend, Impressions,
            Clicks, Conversions, Revenue. Dates as YYYY-MM-DD.
          </p>
        </footer>
      </div>
    </div>
  );
}
