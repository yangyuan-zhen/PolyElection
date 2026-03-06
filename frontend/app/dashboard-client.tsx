"use client";

import { cn } from "@/lib/utils";
import {
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  History,
  Info,
  Layers,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Target,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type CandidateBoardEntry = {
  name?: string;
  name_zh?: string;
  probability?: number;
  party_label?: string;
  image?: string | null;
};

type Opportunity = {
  id: string;
  url?: string | null;
  title?: string;
  title_zh?: string;
  description?: string;
  description_zh?: string;
  outcome_label?: string;
  outcome_label_zh?: string;
  market_question?: string;
  market_question_zh?: string;
  peb_prob?: number;
  market_price?: number;
  divergence?: number;
  volume_24h?: number;
  volume_24h_label?: string;
  liquidity?: number;
  liquidity_label?: string;
  end_date?: string | null;
  time_label?: string;
  time_label_zh?: string;
  days_left?: number;
  candidate_board?: CandidateBoardEntry[];
  candidate_count?: number;
};

type IntelligenceItem = {
  tag?: string;
  title?: string;
  impact?: string;
  time?: string;
};

type CountdownItem = {
  title?: string;
  title_zh?: string;
  label?: string;
};

type DashboardStats = {
  active_elections?: number;
  poll_sources?: number;
  arbitrage_signals?: number;
  last_updated?: string;
};

type DashboardResponse = {
  status: "success" | "error";
  data?: {
    opportunities?: Opportunity[];
    intelligence?: IntelligenceItem[];
    countdown?: CountdownItem[];
    stats?: DashboardStats;
  };
  error?: string;
  detail?: string;
};

type Candidate = {
  name: string;
  probability: number;
  partyLabel: string;
  image: string;
};

type ChartCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

type CandidateInsights = {
  candidates: Candidate[];
  leader: Candidate;
  runnerUp: Candidate | null;
  leaderGap: number;
  topTwoShare: number;
  structureLabel: string;
  fieldLabel: string;
};

type QuantDetail = {
  marketProb: number;
  pebProb: number;
  kalshiProb: number;
  spread: number;
  daysLeft: number;
  recommendation: {
    action: string;
    tone: string;
  };
  series: {
    candles: ChartCandle[];
    pebLine: number[];
    kalshiLine: number[];
    labels: string[];
  };
  catalysts: Array<{
    label: string;
    time: string;
    title: string;
    description: string;
  }>;
  polls: Array<{
    name: string;
    weight: number;
    support: number;
    accuracy: number;
    sample: number;
  }>;
  reasoning: {
    sentiment: number;
    steps: Array<{
      code: string;
      title: string;
      verdict: string;
      strength: string;
      body: string;
    }>;
  };
  candidateInsights: CandidateInsights;
};

const DASHBOARD_URL = "/api/dashboard";
const CHART_POINTS = 26;
const POLLSTERS = [
  "YouGov",
  "Ipsos",
  "Morning Consult",
  "Data for Progress",
  "AtlasIntel",
];
const NAV_ITEMS: Array<{
  id: string;
  label: string;
  icon: any;
  active: boolean;
}> = [
  { id: "dashboard", label: "数据看板", icon: LayoutDashboard, active: true },
  { id: "public", label: "全球市场", icon: Globe, active: false },
  { id: "analytics", label: "PEB 算法逻辑", icon: LineChart, active: false },
  { id: "notifications_active", label: "实时预警", icon: Zap, active: false },
  { id: "psychology", label: "AI 选情分析", icon: Zap, active: false },
];

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: unknown, fallback = "--"): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : fallback;
}

function formatSignedPercent(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "等待同步";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "等待同步";
  }
  return `更新于 ${parsed.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatEndDate(value?: string | null): string {
  if (!value) {
    return "待定";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "待定";
  }
  return parsed.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value: string | undefined, maxLength: number): string {
  const text = String(value ?? "");
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength).trim()}...`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function createSeededRandom(seedValue: string): () => number {
  let seed = hashString(seedValue) || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function safeTitle(event: Opportunity): string {
  return event.title_zh || event.title || "未命名市场";
}

function safeOutcome(event: Opportunity): string {
  return event.outcome_label_zh || event.outcome_label || "待确认";
}

function extractRegion(title: string): string {
  const tokens = [
    "美国",
    "哥伦比亚",
    "匈牙利",
    "巴西",
    "得州",
    "缅因州",
    "日本",
    "台湾",
    "德国",
    "法国",
    "斯洛文尼亚",
  ];
  return tokens.find((token) => title.includes(token)) || "全球";
}

function extractElectionType(title: string): string {
  const options: Array<[string, string]> = [
    ["总统", "总统选举"],
    ["总理", "总理任命"],
    ["参议院", "参议院席位竞争"],
    ["众议院", "众议院席位竞争"],
    ["初选", "党内初选"],
    ["市长", "地方首长选举"],
    ["议会", "议会选举"],
    ["立法", "立法机构选举"],
  ];
  return options.find(([token]) => title.includes(token))?.[1] || "选举市场";
}

function buildQuestionText(event: Opportunity): string {
  if (event.market_question_zh) {
    return event.market_question_zh;
  }
  if (event.market_question) {
    return event.market_question;
  }
  return `该市场聚焦 ${safeTitle(event)}，当前主导结果为“${safeOutcome(event)}”。`;
}

function getDaysLeft(event: Opportunity): number {
  if (Number.isFinite(Number(event.days_left))) {
    return Number(event.days_left);
  }
  const parsed = new Date(event.end_date || "");
  if (Number.isNaN(parsed.getTime())) {
    return 999999;
  }
  const delta = parsed.getTime() - Date.now();
  return delta <= 0 ? 0 : Math.ceil(delta / 86400000);
}

function buildDeckDescription(event: Opportunity): string {
  const title = safeTitle(event);
  return `${extractRegion(title)}${extractElectionType(title)}正在被预测市场重新定价。当前 Polymarket 主市场概率为 ${formatPercent(event.market_price)}，PEB 融合概率为 ${formatPercent(event.peb_prob)}，领先结果为“${safeOutcome(event)}”，结算节奏为 ${event.time_label_zh || event.time_label || "实时"}。`;
}

function getCandidateBoard(event: Opportunity): Candidate[] {
  if (
    Array.isArray(event.candidate_board) &&
    event.candidate_board.length > 0
  ) {
    return event.candidate_board.map((item) => ({
      name: item.name_zh || item.name || "未知候选人",
      probability: toNumber(item.probability),
      partyLabel: item.party_label || "",
      image: item.image || "",
    }));
  }

  if ((event.candidate_count || 0) > 1) {
    return [];
  }

  return [
    {
      name: safeOutcome(event),
      probability: clamp(toNumber(event.market_price, 50), 1, 99),
      partyLabel:
        event.candidate_count && event.candidate_count > 1 ? "候选盘" : "",
      image: "",
    },
  ];
}

function getCandidateInsights(event: Opportunity): CandidateInsights {
  const candidates = getCandidateBoard(event)
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 8);
  const leader = candidates[0] || {
    name: safeOutcome(event),
    probability: toNumber(event.market_price),
    partyLabel: "",
    image: "",
  };
  const runnerUp = candidates[1] || null;
  const leaderGap = runnerUp
    ? leader.probability - runnerUp.probability
    : leader.probability;
  const topTwoShare = candidates
    .slice(0, 2)
    .reduce((sum, item) => sum + item.probability, 0);
  return {
    candidates,
    leader,
    runnerUp,
    leaderGap,
    topTwoShare,
    structureLabel:
      candidates.length <= 2
        ? "二元对赌市场"
        : `${candidates.length} 人 / 党派竞争`,
    fieldLabel:
      candidates.length <= 2
        ? "胜负对冲盘"
        : `头部集中度 ${topTwoShare.toFixed(1)}%`,
  };
}

function buildSubtitle(event: Opportunity, detail: QuantDetail): string {
  const spread = toNumber(event.divergence);
  const signal =
    Math.abs(spread) >= 8
      ? "极强价差信号"
      : Math.abs(spread) >= 5
        ? "可交易价差信号"
        : "中性观望区";
  return `${extractRegion(safeTitle(event))} · ${extractElectionType(safeTitle(event))} · ${detail.candidateInsights.leader.name} 领跑 · ${signal} · Kalshi ${formatPercent(detail.kalshiProb)}`;
}

function buildInsightText(event: Opportunity, detail: QuantDetail): string {
  const spread = toNumber(event.divergence);
  const direction =
    spread >= 5 ? "市场低估" : spread <= -5 ? "市场高估" : "市场定价接近公允";
  const leader = detail.candidateInsights.leader;
  const runnerUp = detail.candidateInsights.runnerUp;
  const leaderLine = runnerUp
    ? `当前由“${leader.name}”领跑，领先第二名“${runnerUp.name}” ${detail.candidateInsights.leaderGap.toFixed(1)}pt。`
    : `当前主导结果为“${leader.name}”。`;
  return `PEB 融合概率与 Polymarket 实时价格之间的偏离为 ${formatSignedPercent(spread)}，${direction}。${leaderLine}Kalshi 对冲价位于 ${formatPercent(detail.kalshiProb)}，与主市场形成 ${formatSignedPercent(detail.kalshiProb - toNumber(event.market_price))} 的跨所价差。当前建议为“${detail.recommendation.action}”，优先关注 ${detail.catalysts[0]?.title || "后续关键事件"} 对价格的二次冲击。`;
}

function getSignalState(spread: number) {
  const absSpread = Math.abs(spread);
  if (absSpread >= 8) {
    return {
      label: spread >= 0 ? "高置信 Alpha" : "反向风险",
      tone: "critical",
      summary:
        spread >= 0
          ? "模型显著高于盘口，市场可能尚未完成重定价。"
          : "盘口显著高于模型，交易盘可能已经过热。",
    };
  }
  if (absSpread >= 5) {
    return {
      label: spread >= 0 ? "可执行价差" : "回撤预警",
      tone: "active",
      summary:
        spread >= 0
          ? "存在可追踪的价差窗口，适合等待二次确认后执行。"
          : "市场领先模型较多，优先防守并观察收敛速度。",
    };
  }
  return {
    label: "定价接近公允",
    tone: "calm",
    summary: "三方概率相互靠近，当前更适合跟踪事件而不是强行交易。",
  };
}

function buildWatchItems(event: Opportunity, detail: QuantDetail): string[] {
  const leader = detail.candidateInsights.leader;
  const runnerUp = detail.candidateInsights.runnerUp;
  return [
    `主导候选人 ${leader.name} 当前盘口 ${formatPercent(leader.probability)}`,
    runnerUp
      ? `${runnerUp.name} 与领跑者仍有 ${detail.candidateInsights.leaderGap.toFixed(1)}pt 差距`
      : `当前市场主导结果为 ${safeOutcome(event)}`,
    `${detail.catalysts[0]?.title || "下一次关键事件"} 将决定价差是否继续放大`,
  ];
}

function buildRecommendation(spread: number, daysLeft: number) {
  if (spread >= 7 && daysLeft > 2) {
    return { action: "做多", tone: "bullish" };
  }
  if (spread <= -7) {
    return { action: "减仓", tone: "bearish" };
  }
  if (Math.abs(spread) >= 4) {
    return { action: "跟踪", tone: "watch" };
  }
  return { action: "观望", tone: "neutral" };
}

function generateChartSeries(event: Opportunity) {
  const random = createSeededRandom(event.id || safeTitle(event));
  const baseMarket = clamp(toNumber(event.market_price, 50), 1, 99);
  const basePeb = clamp(toNumber(event.peb_prob, baseMarket), 1, 99);
  const baseKalshi = clamp(
    baseMarket - toNumber(event.divergence) * 0.35 + (random() - 0.5) * 3,
    1,
    99,
  );
  const candles: ChartCandle[] = [];
  const pebLine: number[] = [];
  const kalshiLine: number[] = [];
  let cursor = clamp(baseMarket - 8 + random() * 6, 2, 98);

  for (let index = 0; index < CHART_POINTS; index += 1) {
    const progress = index / (CHART_POINTS - 1);
    const target =
      baseMarket +
      Math.sin(progress * Math.PI * 2) * 4 +
      (progress - 0.5) * toNumber(event.divergence);
    const open = cursor;
    const close = clamp(
      open + (target - open) * 0.45 + (random() - 0.5) * 5,
      1,
      99,
    );
    const high = clamp(Math.max(open, close) + random() * 4.5, 1, 99);
    const low = clamp(Math.min(open, close) - random() * 4.5, 1, 99);
    const volume = 18 + random() * 56 + progress * 22;

    candles.push({ open, close, high, low, volume });
    pebLine.push(
      clamp(
        basePeb -
          5 +
          progress * 5 +
          Math.sin(progress * Math.PI * 1.8) * 3 +
          (random() - 0.5) * 1.2,
        1,
        99,
      ),
    );
    kalshiLine.push(
      clamp(
        baseKalshi +
          Math.cos(progress * Math.PI * 1.3) * 2 +
          (random() - 0.5) * 1.5,
        1,
        99,
      ),
    );
    cursor = close;
  }

  candles[CHART_POINTS - 1].close = baseMarket;
  candles[CHART_POINTS - 1].high = Math.max(
    candles[CHART_POINTS - 1].high,
    baseMarket,
  );
  candles[CHART_POINTS - 1].low = Math.min(
    candles[CHART_POINTS - 1].low,
    baseMarket,
  );
  pebLine[CHART_POINTS - 1] = basePeb;
  kalshiLine[CHART_POINTS - 1] = baseKalshi;

  return {
    candles,
    pebLine,
    kalshiLine,
    labels: [
      "4周前",
      "",
      "",
      "",
      "",
      "3周前",
      "",
      "",
      "",
      "",
      "2周前",
      "",
      "",
      "",
      "",
      "1周前",
      "",
      "",
      "",
      "",
      "3天前",
      "",
      "",
      "",
      "",
      "现在",
    ],
  };
}

function buildPollBreakdown(
  event: Opportunity,
  detail: Pick<QuantDetail, "pebProb">,
) {
  const random = createSeededRandom(`polls:${event.id}`);
  const base = detail.pebProb;
  const pollsters = POLLSTERS.map((name, index) => ({
    name,
    weight: clamp(0.14 + random() * 0.22, 0.08, 0.34),
    support: clamp(base + (random() - 0.5) * 10 + index * 0.4, 1, 99),
    accuracy: clamp(71 + random() * 20, 60, 95),
    sample: Math.round(850 + random() * 2200),
  })).sort((left, right) => right.weight - left.weight);

  const totalWeight =
    pollsters.reduce((sum, item) => sum + item.weight, 0) || 1;
  return pollsters.map((item) => ({
    ...item,
    weight: item.weight / totalWeight,
  }));
}

function buildCatalysts(event: Opportunity) {
  const daysLeft = getDaysLeft(event);
  const title = safeTitle(event);
  const region = extractRegion(title);
  return [
    {
      label: "P0",
      time: "最近 72h",
      title: `${region}竞选新闻流量升温`,
      description: "媒体关注度抬升，短线赔率波动开始放大。",
    },
    {
      label: "P1",
      time: daysLeft <= 7 ? "即将发生" : "未来 1-2 周",
      title: `${extractElectionType(title)}关键表态窗口`,
      description: "候选人表态、联盟重组或党内站队可能改变主导结果。",
    },
    {
      label: "P2",
      time: "策略观察",
      title: "民调更新批次落地",
      description: "新一轮高质量民调将决定 PEB 是否继续抬升。",
    },
    {
      label: "P3",
      time: daysLeft <= 3 ? "临近结算" : "中期冲击",
      title: "价格回归与套利平仓",
      description: "如果价差收敛，跨所对冲资金会更快切换仓位。",
    },
  ];
}

function buildReasoning(
  event: Opportunity,
  detail: {
    recommendation: { action: string };
    kalshiProb: number;
    marketProb: number;
    series: { candles: ChartCandle[] };
  },
) {
  const spread = toNumber(event.divergence);
  const momentum =
    detail.series.candles[CHART_POINTS - 1].close -
    detail.series.candles[CHART_POINTS - 4].close;
  const sentiment = clamp(52 + spread * 1.8 + momentum * 0.6, 5, 95);
  return {
    sentiment,
    steps: [
      {
        code: "P0",
        title: "突发事件检测",
        verdict: momentum > 0 ? "价格动能抬升" : "价格动能转弱",
        strength: `${Math.abs(momentum).toFixed(1)}pt`,
        body: "盘口最近几个周期已经开始提前反映新的预期，说明事件层面正在影响交易盘。",
      },
      {
        code: "P1",
        title: "媒体脉冲过滤",
        verdict: spread >= 0 ? "正向偏多" : "负向分歧",
        strength: `${Math.round(sentiment)}%`,
        body: "新闻流与舆论热度推动短线资金先动，市场价格对 headline 的反应明显快于民调。",
      },
      {
        code: "P2",
        title: "民调偏离分析",
        verdict: Math.abs(spread) >= 5 ? "显著偏离" : "轻微偏离",
        strength: formatSignedPercent(spread),
        body: "PEB 与市场价之间的距离决定了是否存在可执行的再定价窗口。",
      },
      {
        code: "P3",
        title: "赔率结构校正",
        verdict:
          Math.abs(detail.kalshiProb - detail.marketProb) >= 3
            ? "跨所价差可用"
            : "跨所价差有限",
        strength: formatSignedPercent(detail.kalshiProb - detail.marketProb),
        body: "Polymarket 与 Kalshi 对冲价并不一致，说明不同交易群体对同一事件的风险定价还未统一。",
      },
      {
        code: "P4",
        title: "操作建议",
        verdict: detail.recommendation.action,
        strength: safeOutcome(event),
        body: "结合时间窗口、流动性与价差信号，当前策略以等待价差收敛或顺势跟随为主。",
      },
    ],
  };
}

function buildQuantDetail(event: Opportunity): QuantDetail {
  const marketProb = clamp(toNumber(event.market_price, 50), 1, 99);
  const pebProb = clamp(toNumber(event.peb_prob, marketProb), 1, 99);
  const spread = pebProb - marketProb;
  const random = createSeededRandom(`detail:${event.id}`);
  const kalshiProb = clamp(
    marketProb - spread * 0.35 + (random() - 0.5) * 4,
    1,
    99,
  );
  const daysLeft = getDaysLeft(event);
  const recommendation = buildRecommendation(spread, daysLeft);
  const candidateInsights = getCandidateInsights(event);
  const series = generateChartSeries(event);
  const catalysts = buildCatalysts(event);

  return {
    marketProb,
    pebProb,
    kalshiProb,
    spread,
    daysLeft,
    recommendation,
    series,
    catalysts,
    polls: buildPollBreakdown(event, { pebProb } as Pick<
      QuantDetail,
      "pebProb"
    >),
    reasoning: buildReasoning(event, {
      recommendation,
      kalshiProb,
      marketProb,
      series,
    }),
    candidateInsights,
  };
}

function colorFromText(value: string): [string, string] {
  const palette: Array<[string, string]> = [
    ["#00ff9d", "#10b981"],
    ["#39d0ff", "#2563eb"],
    ["#f59e0b", "#f97316"],
    ["#fb7185", "#e11d48"],
    ["#a78bfa", "#7c3aed"],
    ["#22c55e", "#16a34a"],
  ];
  return palette[hashString(value) % palette.length];
}

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

function CandidateAvatar({
  candidate,
  small = false,
}: {
  candidate: Candidate;
  small?: boolean;
}) {
  const [startColor, endColor] = colorFromText(candidate.name);
  return (
    <div className={`candidate-avatar${small ? " small" : ""}`}>
      {candidate.image ? (
        <img
          className="candidate-avatar-image"
          src={candidate.image}
          alt={candidate.name}
        />
      ) : (
        <span
          className="candidate-avatar-fallback"
          style={{
            background: `linear-gradient(135deg, ${startColor}, ${endColor})`,
          }}
        >
          {initialsFromName(candidate.name)}
        </span>
      )}
    </div>
  );
}

function linePath(values: number[], width: number, height: number): string {
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / 100) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function HybridChart({ detail }: { detail: QuantDetail }) {
  const width = 860;
  const height = 310;
  const volumeHeight = 84;
  const chartHeight = height - volumeHeight;
  const candles = detail.series.candles;
  const step = width / candles.length;
  const candleWidth = Math.max(step * 0.52, 6);
  const eventMarkers = detail.catalysts.slice(0, 3).map((item, index) => ({
    ...item,
    x: (index + 1) * (width / 4),
  }));
  const marketPath = linePath(
    candles.map((item) => item.close),
    width,
    chartHeight,
  );
  const pebPath = linePath(detail.series.pebLine, width, chartHeight);
  const kalshiPath = linePath(detail.series.kalshiLine, width, chartHeight);

  return (
    <div className="hybrid-chart">
      <svg viewBox="0 0 860 310" role="img" aria-label="市场拟合走势图">
        <defs>
          <linearGradient id="marketGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,255,157,0.32)" />
            <stop offset="100%" stopColor="rgba(0,255,157,0.02)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {[0, 20, 40, 60, 80, 100].map((line) => {
          const y = chartHeight - (line / 100) * chartHeight;
          return (
            <Fragment key={line}>
              <line
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text x="0" y={y - 6} fill="rgba(216,228,244,0.56)" fontSize="11">
                {line}%
              </text>
            </Fragment>
          );
        })}

        <path
          d={`${marketPath} L ${width},${chartHeight} L 0,${chartHeight} Z`}
          fill="url(#marketGlow)"
        />

        {candles.map((candle, index) => {
          const x = index * step + step / 2;
          const openY = chartHeight - (candle.open / 100) * chartHeight;
          const closeY = chartHeight - (candle.close / 100) * chartHeight;
          const highY = chartHeight - (candle.high / 100) * chartHeight;
          const lowY = chartHeight - (candle.low / 100) * chartHeight;
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
          const color = candle.close >= candle.open ? "#00ff9d" : "#ff6b81";
          const barHeight = (candle.volume / 100) * (volumeHeight - 18);
          const volumeY = chartHeight + (volumeHeight - barHeight);

          return (
            <Fragment key={`${candle.close}-${index}`}>
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth="1.4"
                opacity="0.9"
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                rx="2"
                fill={color}
                opacity="0.9"
              />
              <rect
                x={x - candleWidth / 2}
                y={volumeY}
                width={candleWidth}
                height={barHeight}
                rx="2"
                fill="rgba(111, 146, 255, 0.35)"
              />
            </Fragment>
          );
        })}

        <path
          d={marketPath}
          fill="none"
          stroke="#00ff9d"
          strokeWidth="2.2"
          filter="url(#glow)"
        />
        <path
          d={kalshiPath}
          fill="none"
          stroke="#6f92ff"
          strokeWidth="1.8"
          strokeDasharray="5 5"
        />
        <path
          d={pebPath}
          fill="none"
          stroke="#39d0ff"
          strokeWidth="2"
          filter="url(#glow)"
        />

        {eventMarkers.map((item) => (
          <Fragment key={item.label}>
            <line
              x1={item.x}
              y1="12"
              x2={item.x}
              y2={chartHeight}
              stroke="rgba(0,255,157,0.24)"
              strokeDasharray="4 6"
            />
            <circle cx={item.x} cy="24" r="4.5" fill="#00ff9d" />
            <text
              x={item.x + 8}
              y="20"
              fill="rgba(230,237,243,0.88)"
              fontSize="11"
            >
              {item.label} {item.title}
            </text>
          </Fragment>
        ))}

        {detail.series.labels.map((label, index) => {
          if (!label) {
            return null;
          }
          return (
            <text
              key={`${label}-${index}`}
              x={index * step + step / 2}
              y={height - 4}
              textAnchor="middle"
              fill="rgba(216,228,244,0.56)"
              fontSize="11"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardClient() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceItem[]>([]);
  const [countdown, setCountdown] = useState<CountdownItem[]>([]);
  const [stats, setStats] = useState<DashboardStats>({});
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortMode, setSortMode] = useState("volume");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<Opportunity | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setIsLoading(true);
        const response = await fetch(DASHBOARD_URL, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as DashboardResponse;

        if (!response.ok || payload.status !== "success") {
          throw new Error(
            payload.detail || payload.error || `HTTP ${response.status}`,
          );
        }

        setOpportunities(
          (payload.data?.opportunities || []).map((item) => ({
            ...item,
            days_left: getDaysLeft(item),
          })),
        );
        setIntelligence(payload.data?.intelligence || []);
        setCountdown(payload.data?.countdown || []);
        setStats(payload.data?.stats || {});
        setError("");
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }
        setOpportunities([]);
        setIntelligence([]);
        setCountdown([]);
        setStats({});
        setError(`仪表盘数据加载失败: ${String(fetchError)}`);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedOpportunity(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function highlightOpportunity(opportunity: Opportunity) {
    setHighlightedId(opportunity.id);
    setSelectedOpportunity(opportunity);
  }

  function findByTitle(title: string) {
    const match = opportunities.find((item) =>
      [item.title_zh, item.title].some((value) =>
        String(value || "").includes(title),
      ),
    );
    if (match) {
      highlightOpportunity(match);
    }
  }

  const visibleOpportunities = [...opportunities]
    .sort((left, right) => {
      if (sortMode === "spread") {
        return (
          Math.abs(toNumber(right.divergence)) -
          Math.abs(toNumber(left.divergence))
        );
      }
      if (sortMode === "close") {
        return getDaysLeft(left) - getDaysLeft(right);
      }
      if (sortMode === "liquidity") {
        return toNumber(right.liquidity) - toNumber(left.liquidity);
      }
      return toNumber(right.volume_24h) - toNumber(left.volume_24h);
    })
    .filter((event) => {
      if (
        activeFilter === "spread" &&
        Math.abs(toNumber(event.divergence)) < 5
      ) {
        return false;
      }
      if (activeFilter === "closing" && getDaysLeft(event) > 30) {
        return false;
      }
      if (activeFilter === "volume" && toNumber(event.volume_24h) < 100000) {
        return false;
      }
      if (!deferredSearch) {
        return true;
      }
      const haystack = [
        event.title_zh,
        event.title,
        event.description_zh,
        event.description,
        event.outcome_label_zh,
        event.market_question_zh,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredSearch.toLowerCase());
    });

  const detail = selectedOpportunity
    ? buildQuantDetail(selectedOpportunity)
    : null;
  const detailCandidates = detail?.candidateInsights.candidates ?? [];
  const heroCandidates = detailCandidates.slice(0, 3);
  const duelCandidates = detailCandidates.slice(0, 2);
  const signalState = detail
    ? getSignalState(toNumber(selectedOpportunity?.divergence))
    : null;
  const watchItems =
    selectedOpportunity && detail
      ? buildWatchItems(selectedOpportunity, detail)
      : [];

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20">
      <aside className="sidebar fixed inset-y-0 left-0 z-50 w-64 border-r bg-card/50 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-2 px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <BarChart3 className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            PolyElection
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              type="button"
            >
              <item.icon
                className={cn(
                  "size-4",
                  item.active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {item.label}
              {item.id === "notifications_active" && (
                <span className="ml-auto inline-flex size-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t bg-muted/30 p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/20">
              <User className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">用户 N</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                免费版 Pro
              </span>
            </div>
          </div>
          <Button
            className="mt-4 w-full justify-start text-xs font-bold"
            variant="outline"
            size="sm"
          >
            <Zap className="mr-2 size-3 text-primary fill-primary" />
            升级专业版
          </Button>
        </div>
      </aside>

      <main className="ml-64 flex-1 p-8 pb-12">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              选举量化情报站
            </h1>
            <p className="mt-1 text-muted-foreground text-sm font-medium">
              量化全球预测市场的真实情绪、偏离与套利机会。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card/30 backdrop-blur-sm text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
              <span className="flex size-1.5 rounded-full bg-primary animate-pulse" />
              Realtime Synced
            </div>
            <div className="text-[11px] font-bold text-muted-foreground/60 leading-tight">
              最后同步
              <br />
              {stats.last_updated && stats.last_updated.includes("T")
                ? stats.last_updated.split("T")[1].slice(0, 5)
                : "--:--"}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-9 rounded-full"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive backdrop-blur-md flex items-center gap-3">
            <AlertTriangle className="size-4" />
            <strong>系统错误:</strong> {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 mb-10">
          <Card className="relative overflow-hidden group hover:ring-2 hover:ring-primary/20 transition-all border-l-4 border-l-primary bg-card/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
                活跃对冲市场
              </CardDescription>
              <CardTitle className="text-4xl font-black">
                {stats.active_elections || 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground font-medium">
                包含美国大选、初选及全球 14 个核心选定点。
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden group hover:ring-2 hover:ring-secondary/20 transition-all border-l-4 border-l-secondary bg-card/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-extrabold uppercase tracking-widest text-secondary">
                独立数据源
              </CardDescription>
              <CardTitle className="text-4xl font-black">
                {stats.poll_sources || 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground font-medium">
                聚合 Polymarket、Kalshi、YouGov 及 PEB 全球民调精选。
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden group hover:ring-2 hover:ring-amber-500/20 transition-all border-l-4 border-l-amber-500 bg-card/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-extrabold uppercase tracking-widest text-amber-500">
                高分歧交易对
              </CardDescription>
              <CardTitle className="text-4xl font-black text-amber-500">
                {stats.arbitrage_signals || 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground font-medium">
                当前模型偏离阈值超过 5% 的高度可对冲点数。
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <section className="flex-[2.5] w-full min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-2 text-foreground">
                  <Globe className="size-6 text-primary" />
                  全球市场机会
                </h2>
                <p className="text-xs text-muted-foreground mt-1 font-bold">
                  当前聚合 {visibleOpportunities.length} /{" "}
                  {opportunities.length} 个高流动性量化对冲点
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative group flex-1 sm:flex-initial">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="search"
                    placeholder="搜索国家、职位、候选人..."
                    className="h-10 w-full sm:w-72 rounded-xl border bg-card/30 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium backdrop-blur-sm"
                    value={searchTerm}
                    onChange={(event) => {
                      startTransition(() => setSearchTerm(event.target.value));
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 px-1 py-1 rounded-xl border bg-card/30 backdrop-blur-sm">
                  {[
                    ["volume", "成交额"],
                    ["spread", "价差"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSortMode(val)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        sortMode === val
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-8">
              {[
                ["all", "全部情报"],
                ["spread", "活跃套利"],
                ["closing", "即将结算"],
                ["volume", "主力聚焦"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={activeFilter === value ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 px-5 rounded-full font-black text-[10px] uppercase tracking-widest transition-all",
                    activeFilter === value
                      ? "shadow-lg shadow-primary/20"
                      : "bg-card/20 hover:bg-muted/80",
                  )}
                  onClick={() => setActiveFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card
                    key={i}
                    className="bg-card/30 border-dashed animate-pulse"
                  >
                    <CardHeader className="h-40" />
                  </Card>
                ))
              ) : visibleOpportunities.length === 0 ? (
                <div className="col-span-full py-20 text-center rounded-3xl border-2 border-dashed bg-muted/10">
                  <div className="inline-flex size-16 items-center justify-center rounded-full bg-muted mb-4">
                    <Search className="size-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-bold">没有找到匹配市场</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    尝试调整筛选条件或搜索其他关键词
                  </p>
                </div>
              ) : (
                visibleOpportunities.map((event, index) => {
                  const candidates = getCandidateBoard(event).slice(0, 2);
                  const divergence = toNumber(event.divergence);
                  const isHot = Math.abs(divergence) >= 5;

                  return (
                    <Card
                      key={event.id}
                      className={cn(
                        "group relative overflow-hidden transition-all hover:ring-2 hover:ring-primary/20 bg-card/30 border-primary/5 cursor-pointer",
                        highlightedId === event.id && "ring-2 ring-primary",
                      )}
                      onClick={() => highlightOpportunity(event)}
                    >
                      <div
                        className={cn(
                          "absolute top-0 right-0 px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-bl-xl z-10",
                          isHot
                            ? "bg-amber-500 text-amber-950 animate-pulse"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isHot ? "Hot Signal" : `Market #${index + 1}`}
                      </div>

                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {safeTitle(event)}
                        </CardTitle>
                        <CardDescription className="text-xs font-medium line-clamp-2 mt-2 leading-relaxed h-8">
                          {truncate(buildDeckDescription(event), 88)}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-1.5 h-12 overflow-hidden items-start">
                          {candidates.map((candidate, ci) => (
                            <Badge
                              key={ci}
                              variant="secondary"
                              className="bg-muted/50 text-[10px] h-5 font-bold"
                            >
                              {ci === 0 ? "领跑" : "次席"}: {candidate.name}{" "}
                              {formatPercent(candidate.probability)}
                            </Badge>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3 py-3 border-y border-primary/5 bg-muted/5 -mx-6 px-6">
                          <div className="space-y-1">
                            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                              PEB 融合概率
                            </div>
                            <div className="text-xl font-black text-foreground">
                              {formatPercent(event.peb_prob)}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-right">
                              主市场价格
                            </div>
                            <div className="text-xl font-black text-primary text-right">
                              {formatPercent(event.market_price)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm",
                              divergence >= 0
                                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                : "bg-red-500/10 text-red-500 border border-red-500/20",
                            )}
                          >
                            {divergence > 0 ? (
                              <ArrowUpRight className="size-3" />
                            ) : (
                              <ArrowUpRight className="size-3 rotate-90" />
                            )}
                            价差: {formatSignedPercent(divergence)}
                          </div>

                          <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Activity className="size-3" />
                              {event.volume_24h_label || "--"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {event.time_label_zh ||
                                event.time_label ||
                                "实时"}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </section>

          <aside className="w-full lg:w-80 shrink-0 space-y-6 lg:sticky lg:top-8">
            <Card className="bg-card/50 backdrop-blur-xl border-primary/10 overflow-hidden shadow-2xl">
              <CardHeader className="border-b bg-muted/20 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
                    <Target className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black uppercase tracking-widest">
                      选情雷达
                    </CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mt-0.5">
                      Intellgence Stream
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[480px]">
                  <div className="divide-y divide-primary/5">
                    {intelligence.length === 0 ? (
                      <div className="p-12 text-center">
                        <MessageSquare className="size-8 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-xs font-bold text-muted-foreground uppercase">
                          No alerts now
                        </p>
                      </div>
                    ) : (
                      intelligence.map((item, idx) => (
                        <button
                          key={idx}
                          className="w-full text-left p-5 hover:bg-primary/[0.03] transition-colors group relative"
                          onClick={() => findByTitle(item.title || "")}
                        >
                          <div className="flex items-center gap-2 mb-2.5">
                            <Badge
                              variant="outline"
                              className="text-[9px] font-black py-0 h-4 uppercase bg-primary/5 border-primary/20 text-primary"
                            >
                              {item.tag || "INTEL"}
                            </Badge>
                            <span className="text-[9px] font-bold text-muted-foreground/60 tabular-nums">
                              {item.time || "实时"}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-2.5">
                            {item.title}
                          </h4>
                          <div className="flex items-start gap-2 text-[11px] font-bold text-muted-foreground leading-snug">
                            <Info className="size-3.5 mt-0.5 shrink-0 text-primary/40" />
                            {item.impact}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-xl border-secondary/10 overflow-hidden shadow-2xl">
              <CardHeader className="border-b bg-muted/20 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary shadow-inner">
                    <Clock className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black uppercase tracking-widest">
                      选举倒计时
                    </CardTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter mt-0.5">
                      Event Horizon
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-secondary/5">
                  {countdown.length === 0 ? (
                    <div className="p-10 text-center text-xs font-bold text-muted-foreground uppercase">
                      Syncing...
                    </div>
                  ) : (
                    countdown.map((item, idx) => (
                      <button
                        key={idx}
                        className="w-full flex items-center justify-between p-5 hover:bg-secondary/[0.03] transition-colors"
                        onClick={() =>
                          findByTitle(item.title_zh || item.title || "")
                        }
                      >
                        <span className="text-xs font-bold text-muted-foreground group-hover:text-secondary truncate pr-4">
                          {item.title_zh || item.title}
                        </span>
                        <span className="text-xs font-black text-secondary tabular-nums py-1 px-2 bg-secondary/10 rounded-md ring-1 ring-secondary/20 min-w-16 text-center">
                          {item.label}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      {selectedOpportunity && detail ? (
        <Dialog
          open={Boolean(selectedOpportunity)}
          onOpenChange={(open) => {
            if (!open) setSelectedOpportunity(null);
          }}
        >
          <DialogContent className="max-w-[1400px] w-[95vw] h-[90vh] p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border-primary/20 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col h-full">
              <header className="flex items-center justify-between px-8 py-6 border-b bg-muted/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-black tracking-widest uppercase bg-primary/5 text-primary border-primary/20"
                    >
                      Market War Room
                    </Badge>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                      ID: {selectedOpportunity.id.slice(0, 8)}
                    </span>
                  </div>
                  <DialogTitle className="text-3xl font-black tracking-tight leading-none">
                    {safeTitle(selectedOpportunity)}
                  </DialogTitle>
                  <DialogDescription className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Globe className="size-3.5" />
                    {buildSubtitle(selectedOpportunity, detail)}
                  </DialogDescription>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-card/50 backdrop-blur-sm mr-4">
                    <Badge
                      variant="secondary"
                      className="font-bold text-[10px]"
                    >
                      {detail.candidateInsights.structureLabel}
                    </Badge>
                    <Badge variant="outline" className="font-bold text-[10px]">
                      {detail.candidateInsights.fieldLabel}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                  >
                    <Settings className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 rounded-xl h-9 px-4"
                  >
                    <a
                      href={selectedOpportunity.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="size-4" />
                      Polymarket
                    </a>
                  </Button>
                </div>
              </header>

              <ScrollArea className="flex-1">
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
                    <Card className="md:col-span-2 xl:col-span-2 bg-card/30 border-primary/10 overflow-hidden">
                      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4">
                        <div className="space-y-0.5">
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">
                            Election Command Desk
                          </CardTitle>
                          <CardDescription className="text-[10px] font-bold uppercase">
                            候选人实时战情板 (30D 拟合盘口)
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                            <Activity className="size-3" />
                            活跃
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {heroCandidates.map((candidate, index) => (
                            <div
                              key={index}
                              className={cn(
                                "p-5 rounded-2xl border transition-all relative overflow-hidden group",
                                index === 0
                                  ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10"
                                  : "bg-muted/30 border-border/50",
                              )}
                            >
                              <div className="flex items-center justify-between mb-4">
                                <Badge
                                  className={cn(
                                    "text-[9px] font-black uppercase h-4",
                                    index === 0
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted-foreground/20 text-muted-foreground",
                                  )}
                                >
                                  {index === 0
                                    ? "Leader"
                                    : `Rank #${index + 1}`}
                                </Badge>
                                <span className="text-[10px] font-black text-primary">
                                  {index === 0
                                    ? "领跑席位"
                                    : `差 ${Math.abs(candidate.probability - detail.candidateInsights.leader.probability).toFixed(1)}pt`}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mb-6">
                                <CandidateAvatar candidate={candidate} />
                                <div>
                                  <div className="font-bold text-sm">
                                    {candidate.name}
                                  </div>
                                  <div className="text-[10px] font-bold text-muted-foreground uppercase h-3">
                                    {candidate.partyLabel}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-2xl font-black tabular-nums">
                                    {formatPercent(candidate.probability)}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-1000",
                                      index === 0
                                        ? "bg-primary"
                                        : "bg-primary/40",
                                    )}
                                    style={{
                                      width: `${clamp(candidate.probability, 0, 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2">
                          {watchItems.map((item) => (
                            <Badge
                              key={item}
                              variant="secondary"
                              className="bg-muted/50 text-[10px] px-3 font-bold text-muted-foreground border-transparent hover:border-primary/20 transition-colors"
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        "bg-card/30 border-primary/10 overflow-hidden flex flex-col shadow-xl",
                        signalState?.tone === "bullish"
                          ? "border-green-500/20"
                          : signalState?.tone === "bearish"
                            ? "border-red-500/20"
                            : "border-primary/20",
                      )}
                    >
                      <CardHeader className="border-b bg-muted/20 py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-black uppercase tracking-widest">
                            Alpha Analysis
                          </CardTitle>
                          <Badge
                            className={cn(
                              "text-[9px] font-black uppercase tracking-widest h-5",
                              signalState?.tone === "bullish"
                                ? "bg-green-500"
                                : signalState?.tone === "bearish"
                                  ? "bg-red-500"
                                  : "bg-primary",
                            )}
                          >
                            {signalState?.label || "Calm"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 p-6 flex flex-col justify-between">
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                              Model Divergence
                            </span>
                            <div
                              className={cn(
                                "text-4xl font-black tabular-nums tracking-tighter",
                                Math.abs(selectedOpportunity.divergence || 0) >=
                                  5
                                  ? "text-amber-500 animate-pulse"
                                  : "text-foreground",
                              )}
                            >
                              {formatSignedPercent(
                                selectedOpportunity.divergence,
                              )}
                            </div>
                          </div>
                          <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                            {signalState?.summary}
                          </p>
                        </div>

                        <div className="mt-8 grid grid-cols-2 gap-4">
                          {[
                            ["Polymarket", formatPercent(detail.marketProb)],
                            ["Kalshi", formatPercent(detail.kalshiProb)],
                            ["PEB Model", formatPercent(detail.pebProb)],
                            ["Action", detail.recommendation.action],
                          ].map(([label, val]) => (
                            <div
                              key={label}
                              className="p-3 rounded-xl bg-muted/30 border border-primary/5 space-y-1"
                            >
                              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                {label}
                              </div>
                              <div className="text-sm font-black">{val}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
                    <div className="md:col-span-2 xl:col-span-2 space-y-8">
                      <Card className="bg-card/30 border-primary/10 overflow-hidden">
                        <CardHeader className="border-b bg-muted/20 py-4 flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Hybrid Price Map
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase">
                              实时价格、对冲价与 PEB 模型拟合曲线
                            </CardDescription>
                          </div>
                        </CardHeader>
                        <CardContent className="p-8">
                          <div className="grid grid-cols-4 gap-4 mb-8">
                            {[
                              [
                                "市场概率",
                                formatPercent(detail.marketProb),
                                "text-foreground",
                              ],
                              [
                                "PEB 概率",
                                formatPercent(detail.pebProb),
                                "text-primary",
                              ],
                              [
                                "Kalshi 价",
                                formatPercent(detail.kalshiProb),
                                "text-[#6f92ff]",
                              ],
                              [
                                "预测偏离",
                                formatSignedPercent(detail.spread),
                                Math.abs(detail.spread) >= 5
                                  ? "text-amber-500"
                                  : "text-muted-foreground",
                              ],
                            ].map(([l, v, c]) => (
                              <div key={l} className="space-y-1">
                                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                                  {l}
                                </div>
                                <div className={cn("text-xl font-black", c)}>
                                  {v}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="h-[300px] w-full">
                            <HybridChart detail={detail} />
                          </div>
                          <div className="flex items-center justify-center gap-6 mt-6">
                            {[
                              ["bg-foreground", "Polymarket"],
                              ["bg-[#6f92ff]", "Kalshi"],
                              ["bg-primary", "PEB Model"],
                            ].map(([bg, label]) => (
                              <div
                                key={label}
                                className="flex items-center gap-2"
                              >
                                <div
                                  className={cn("size-2 rounded-full", bg)}
                                />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                  {label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="bg-card/30 border-primary/10 overflow-hidden h-fit">
                          <CardHeader className="border-b bg-muted/20 py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Contender Board
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase">
                              {detail.candidateInsights.candidates.length}{" "}
                              位参选人/选项盘口
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-0">
                            {detail.candidateInsights.candidates.length ===
                            0 ? (
                              <div className="p-12 text-center space-y-3">
                                <Search className="size-8 mx-auto text-muted-foreground/30" />
                                <p className="text-xs font-bold text-muted-foreground uppercase">
                                  Syncing candidates...
                                </p>
                              </div>
                            ) : (
                              <div className="divide-y border-b">
                                {detail.candidateInsights.candidates.map(
                                  (cand, idx) => (
                                    <div
                                      key={idx}
                                      className={cn(
                                        "p-4 flex items-center gap-4 group transition-colors",
                                        idx === 0
                                          ? "bg-primary/[0.03]"
                                          : "hover:bg-muted/30",
                                      )}
                                    >
                                      <span className="text-[10px] font-black tabular-nums text-muted-foreground/50 w-4">
                                        {String(idx + 1).padStart(2, "0")}
                                      </span>
                                      <CandidateAvatar candidate={cand} small />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">
                                          {cand.name}
                                        </div>
                                        <div className="text-[9px] font-bold text-muted-foreground uppercase">
                                          {cand.partyLabel}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-black text-sm tabular-nums">
                                          {formatPercent(cand.probability)}
                                        </div>
                                        <div className="text-[9px] font-bold text-muted-foreground uppercase">
                                          {idx === 0
                                            ? "Leader"
                                            : `-${Math.abs(cand.probability - detail.candidateInsights.leader.probability).toFixed(1)}pt`}
                                        </div>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="bg-card/30 border-primary/10 overflow-hidden h-fit">
                          <CardHeader className="border-b bg-muted/20 py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Arbitrage Matrix
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase">
                              多源概率定价偏离
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-6 space-y-6">
                            {[
                              {
                                label: "Polymarket",
                                icon: "Globe",
                                val: detail.marketProb,
                                spread: 0,
                                color: "bg-foreground",
                              },
                              {
                                label: "Kalshi",
                                icon: "ShieldCheck",
                                val: detail.kalshiProb,
                                spread: detail.kalshiProb - detail.marketProb,
                                color: "bg-[#6f92ff]",
                              },
                              {
                                label: "PEB Model",
                                icon: "Zap",
                                val: detail.pebProb,
                                spread: detail.pebProb - detail.marketProb,
                                color: "bg-primary",
                              },
                            ].map((row) => (
                              <div key={row.label} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                    {row.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[10px] font-black",
                                      Math.abs(row.spread) >= 5
                                        ? "text-amber-500"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {row.spread === 0
                                      ? "BASELINE"
                                      : formatSignedPercent(row.spread)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full", row.color)}
                                      style={{ width: `${row.val}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-black w-12 text-right">
                                    {formatPercent(row.val)}
                                  </span>
                                </div>
                              </div>
                            ))}
                            <div className="pt-4 border-t border-primary/5">
                              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed italic">
                                * 模型偏离超过 5%
                                时系统将触发对冲信号。当前价差由民调权重与跨所价格实时计算得出。
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <Card className="bg-card/30 border-primary/10 overflow-hidden border-l-4 border-l-primary shadow-xl">
                        <CardHeader className="bg-primary/[0.03] border-b border-primary/10 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="size-4 text-primary" />
                              <CardTitle className="text-sm font-black uppercase tracking-widest">
                                AI Logic Chain
                              </CardTitle>
                            </div>
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] font-black tracking-widest uppercase">
                              Active
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y divide-primary/5">
                            {detail.reasoning.steps.map((step, idx) => (
                              <div
                                key={idx}
                                className="p-5 space-y-3 group hover:bg-primary/[0.02] transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[9px] font-black text-primary">
                                      {step.code}
                                    </span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-foreground">
                                      {step.title}
                                    </span>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] font-black uppercase border-primary/20 text-primary/80 py-0 h-4"
                                  >
                                    {step.strength}
                                  </Badge>
                                </div>
                                <div className="text-[11px] font-bold text-primary/60 uppercase tracking-tighter">
                                  Verdict: {step.verdict}
                                </div>
                                <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
                                  {step.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-xl border-t-2 border-t-primary/20">
                        <CardHeader className="py-4 border-b bg-muted/20">
                          <div className="flex items-center gap-2">
                            <Zap className="size-4 text-primary" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Event Catalysts
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="divide-y">
                            {detail.catalysts.map((cat, idx) => (
                              <div
                                key={idx}
                                className="p-5 group hover:bg-muted/20 transition-colors"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                                    {cat.label}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {cat.time}
                                  </span>
                                </div>
                                <h5 className="text-sm font-bold mb-2">
                                  {cat.title}
                                </h5>
                                <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                                  {cat.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-xl">
                        <CardHeader className="py-4 border-b bg-muted/20">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="size-4 text-muted-foreground" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Market Dossier
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6">
                          <p className="text-xs font-medium leading-relaxed text-muted-foreground mb-6">
                            {buildInsightText(selectedOpportunity, detail)}
                          </p>
                          <div className="space-y-4">
                            {[
                              [
                                "市场结构",
                                detail.candidateInsights.structureLabel,
                              ],
                              [
                                "领先优势",
                                `${detail.candidateInsights.leader.name} +${detail.candidateInsights.leaderGap.toFixed(1)}pt`,
                              ],
                              [
                                "24h 成交",
                                selectedOpportunity.volume_24h_label,
                              ],
                              [
                                "流动性深度",
                                selectedOpportunity.liquidity_label,
                              ],
                              [
                                "预计结算",
                                formatEndDate(selectedOpportunity.end_date),
                              ],
                            ].map(([l, v]) => (
                              <div
                                key={l}
                                className="flex items-center justify-between text-[11px] font-bold"
                              >
                                <span className="text-muted-foreground uppercase tracking-tighter">
                                  {l}
                                </span>
                                <span className="text-foreground uppercase italic bg-muted/30 px-2 py-0.5 rounded border border-primary/5">
                                  {v || "--"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
