import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { from, to } = req.query;

  if (!from || !to || typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "`from` and `to` query params required (e.g. ?from=USD&to=CAD)" });
  }

  if (from === to) {
    return res.json({ from, to, rate: 1, timestamp: new Date().toISOString() });
  }

  try {
    const symbol = `${from.toUpperCase()}${to.toUpperCase()}=X`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance returned ${response.status}` });
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{ meta?: { regularMarketPrice?: number } }>;
        error?: { description?: string };
      };
    };

    if (data.chart?.error) {
      return res.status(502).json({ error: data.chart.error.description || "Yahoo Finance error" });
    }

    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (!rate || typeof rate !== "number") {
      return res.status(502).json({ error: `Rate not available for ${from}/${to}` });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({ error: `Failed to fetch rate: ${message}` });
  }
}
