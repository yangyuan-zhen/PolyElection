import { NextResponse } from "next/server";
import { fetchBackendJson } from "../../../lib/backend";

type DashboardResponse = {
  data?: {
    opportunities?: unknown[];
    intelligence?: unknown[];
    stats?: Record<string, unknown>;
    countdown?: unknown[];
    source?: string;
  };
};

export async function GET() {
  try {
    const dashboard = await fetchBackendJson<DashboardResponse>("/api/v1/dashboard", {
      revalidate: 60,
    });

    return NextResponse.json({
      status: "success",
      data: {
        opportunities: dashboard.data?.opportunities ?? [],
        intelligence: dashboard.data?.intelligence ?? [],
        stats: dashboard.data?.stats ?? {},
        countdown: dashboard.data?.countdown ?? [],
        source: dashboard.data?.source ?? null,
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
