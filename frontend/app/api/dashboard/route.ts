import { NextResponse } from "next/server";
import { fetchBackendJson } from "../../../lib/backend";

type OpportunitiesResponse = {
  data?: unknown[];
};

type IntelligenceResponse = {
  data?: unknown[];
};

type StatsResponse = Record<string, unknown>;

export async function GET() {
  try {
    const [opportunities, intelligence, stats] = await Promise.all([
      fetchBackendJson<OpportunitiesResponse>("/api/v1/opportunities", {
        revalidate: 60,
      }),
      fetchBackendJson<IntelligenceResponse>("/api/v1/intelligence", {
        revalidate: 60,
      }),
      fetchBackendJson<StatsResponse>("/api/v1/stats", {
        revalidate: 60,
      }),
    ]);

    return NextResponse.json({
      status: "success",
      data: {
        opportunities: opportunities.data ?? [],
        intelligence: intelligence.data ?? [],
        stats,
      },
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to fetch dashboard data",
        detail: String(error),
      },
      { status: 500 },
    );
  }
}
