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
import { ModeToggle } from "@/components/mode-toggle";

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
  market_blend_prob?: number;
  market_price?: number;
  kalshi_prob?: number;
  divergence?: number;
  volume_24h?: number;
  volume_24h_label?: string;
  liquidity?: number;
  liquidity_label?: string;
  end_date?: string | null;
  time_label?: string;
  time_label_zh?: string;
  days_left?: number;
  peb_source?: string;
  poll_source?: string;
  poll_page_title?: string;
  poll_source_count?: number;
  poll_accuracy_avg?: number;
  poll_breakdown?: Array<{
    name?: string;
    support?: number;
    sample?: number;
    accuracy?: number;
    weight?: number;
    date?: string;
    candidate?: string;
  }>;
  candidate_board?: CandidateBoardEntry[];
  candidate_count?: number;
  poll_candidate?: string;
  kalshi_market_title?: string;
  kalshi_market_ticker?: string;
  kalshi_event_title?: string;
  kalshi_event_ticker?: string;
  kalshi_match_score?: number;
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
  nameZh?: string;
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
    supportFor?: string;
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
  pebSource: string;
  pollSource: string;
  pollPageTitle: string;
  pollSourceCount: number;
  pollAccuracyAvg: number;
  pollCandidate: string;
  kalshiMarketTitle: string;
  kalshiMarketTicker: string;
  kalshiEventTitle: string;
  kalshiEventTicker: string;
  kalshiMatchScore: number;
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
    "德州",
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
      name: String(item.name || item.name_zh || "未知候选人"),
      nameZh: String(item.name_zh || ""),
      probability: toNumber(item.probability, 5.0),
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
      nameZh: event.outcome_label_zh || "",
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
    nameZh: event.outcome_label_zh || "",
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
  if (Array.isArray(event.poll_breakdown) && event.poll_breakdown.length > 0) {
    return event.poll_breakdown.map((poll) => ({
      name: poll.name || "Unknown",
      weight: clamp(toNumber(poll.weight, 0.2), 0.01, 1),
      support: clamp(toNumber(poll.support, detail.pebProb), 0, 100),
      accuracy: clamp(toNumber(poll.accuracy, 74), 0, 100),
      sample: Math.round(toNumber(poll.sample, 1000)),
      supportFor: poll.candidate || "",
    }));
  }
  return [];
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
    Number.isFinite(Number(event.kalshi_prob))
      ? Number(event.kalshi_prob)
      : marketProb - spread * 0.35 + (random() - 0.5) * 4,
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
    pebSource: event.peb_source || "market-blend",
    pollSource: event.poll_source || "No poll source",
    pollPageTitle: event.poll_page_title || "",
    pollSourceCount: toNumber(event.poll_source_count, 0),
    pollAccuracyAvg: toNumber(event.poll_accuracy_avg, 0),
    pollCandidate: String(event.poll_candidate || ""),
    kalshiMarketTitle: String(event.kalshi_market_title || ""),
    kalshiMarketTicker: String(event.kalshi_market_ticker || ""),
    kalshiEventTitle: String(event.kalshi_event_title || ""),
    kalshiEventTicker: String(event.kalshi_event_ticker || ""),
    kalshiMatchScore: toNumber(event.kalshi_match_score, 0),
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
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full border border-primary/10 shadow-sm",
        small ? "size-8" : "size-12",
      )}
    >
      {candidate.image ? (
        <img
          className="aspect-square h-full w-full object-cover"
          src={candidate.image}
          alt={candidate.name}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-xs font-black text-white"
          style={{
            background: `linear-gradient(135deg, ${startColor}, ${endColor})`,
          }}
        >
          {initialsFromName(candidate.name)}
        </div>
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
                className="stroke-muted-foreground/10"
                strokeWidth="1"
              />
              <text
                x="0"
                y={y - 6}
                className="fill-muted-foreground text-xs font-bold uppercase tracking-wider"
              >
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
          strokeWidth="2.5"
          filter="url(#glow)"
        />

        {/* Current Price Labels (Staggered Collision Avoidance) */}
        {(() => {
          const labelConfigs = [
            {
              val: candles[candles.length - 1].close,
              color: "#00ff9d",
              label: "MKT",
            },
            {
              val: detail.series.kalshiLine[
                detail.series.kalshiLine.length - 1
              ],
              color: "#6f92ff",
              label: "KLSH",
            },
            {
              val: detail.series.pebLine[detail.series.pebLine.length - 1],
              color: "#39d0ff",
              label: "PEB",
            },
          ].map((p) => ({
            ...p,
            y: chartHeight - (p.val / 100) * chartHeight,
          }));

          // Simple layout algorithm to prevent overlap
          const sorted = [...labelConfigs].sort((a, b) => a.y - b.y);
          const minGap = 26; // Height of label + small margin
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].y - sorted[i - 1].y < minGap) {
              sorted[i].y = sorted[i - 1].y + minGap;
            }
          }
          // Shift back if bottom label goes off-chart
          const bottomLimit = chartHeight - 12;
          if (sorted[2].y > bottomLimit) {
            const offset = sorted[2].y - bottomLimit;
            sorted.forEach((p) => (p.y -= offset));
          }

          return sorted.map((line, idx) => {
            const originalY = chartHeight - (line.val / 100) * chartHeight;
            return (
              <g key={`${line.label}-${idx}`}>
                {/* Connector line from label to actual price point */}
                <path
                  d={`M ${width - 45} ${line.y} C ${width - 55} ${line.y}, ${width - 65} ${originalY}, ${width - 80} ${originalY}`}
                  stroke={line.color}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  fill="none"
                  opacity="0.25"
                />

                <rect
                  x={width - 50}
                  y={line.y - 12}
                  width="50"
                  height="24"
                  rx="4"
                  fill="rgba(0,0,0,0.85)"
                  className="backdrop-blur-md shadow-xl border border-white/5"
                />
                <text
                  x={width - 5}
                  y={line.y + 5}
                  textAnchor="end"
                  style={{ fill: line.color }}
                  className="text-[11px] font-black tabular-nums"
                >
                  {line.val.toFixed(1)}%
                </text>
                <text
                  x={width - 55}
                  y={line.y + 5}
                  textAnchor="end"
                  className="fill-muted-foreground/60 text-[9px] font-black uppercase tracking-tighter"
                >
                  {line.label}
                </text>
              </g>
            );
          });
        })()}

        {eventMarkers.map((item) => (
          <Fragment key={item.label}>
            <line
              x1={item.x}
              y1="12"
              x2={item.x}
              y2={chartHeight}
              className="stroke-primary/20"
              strokeDasharray="4 6"
            />
            <circle cx={item.x} cy="24" r="4.5" className="fill-primary" />
            <text
              x={item.x + 8}
              y="28"
              className="fill-muted-foreground text-[8px] font-black uppercase"
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
              className="fill-muted-foreground/60 text-[11px] font-bold"
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
                "group flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200",
                item.active
                  ? "bg-primary text-primary-foreground shadow-[0_8px_16px_-6px_rgba(var(--primary),0.3)]"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
              type="button"
            >
              <item.icon
                className={cn(
                  "size-4.5 transition-transform group-hover:scale-110",
                  item.active
                    ? "text-primary-foreground"
                    : "text-muted-foreground group-hover:text-primary",
                )}
              />
              {item.label}
              {item.id === "notifications_active" && (
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="inline-flex size-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-black opacity-60">
                    LIVE
                  </span>
                </span>
              )}
            </button>
          ))}

          <div className="mt-8 px-4">
            <div className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 opacity-50">
              System Connectivity
            </div>
            <div className="space-y-3">
              {[
                { label: "Polymarket API", status: "online", latency: "142ms" },
                {
                  label: "Wikipedia Scraper",
                  status: "active",
                  latency: "2.4s",
                },
                {
                  label: "PEB Hybrid Engine",
                  status: "synced",
                  latency: "stable",
                },
              ].map((sys) => (
                <div
                  key={sys.label}
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-1.5 rounded-full",
                        sys.status === "online" ||
                          sys.status === "active" ||
                          sys.status === "synced"
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : "bg-amber-500",
                      )}
                    />
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-tight">
                      {sys.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-black tabular-nums opacity-40 group-hover:opacity-100 transition-opacity uppercase">
                    {sys.latency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="mt-auto p-4 border-t bg-gradient-to-t from-muted/50 to-transparent">
          <div className="relative p-4 rounded-2xl bg-card border border-primary/10 shadow-lg overflow-hidden group">
            <div className="absolute -top-12 -right-12 size-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
            <div className="flex items-center gap-3 relative">
              <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                <User className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black text-foreground uppercase tracking-tight">
                  Quant User #882
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge
                    variant="outline"
                    className="h-4 text-[9px] font-black uppercase px-1 border-primary/20 text-primary"
                  >
                    Free
                  </Badge>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                    Pro v1.2
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 relative">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                <span>Free Tier Limit</span>
                <span>2/50 Calls</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary/40 w-[4%]" />
              </div>
            </div>
            <Button
              className="mt-4 w-full justify-between px-4 text-xs font-black uppercase tracking-widest h-9 bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition-all border-none"
              size="sm"
            >
              <span className="flex items-center gap-2">
                <Zap className="size-3 fill-current" />
                Upgrade Now
              </span>
              <ChevronRight className="size-3" />
            </Button>
          </div>
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card/30 backdrop-blur-sm text-[13px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
              <span className="flex size-1.5 rounded-full bg-primary animate-pulse" />
              Realtime Synced
            </div>
            <div className="text-[13px] font-bold text-muted-foreground/60 leading-tight">
              最后同步
              <br />
              {stats.last_updated && stats.last_updated.includes("T")
                ? stats.last_updated.split("T")[1].slice(0, 5)
                : "--:--"}
            </div>
            <div className="flex items-center gap-2">
              <ModeToggle />
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-full border border-primary/20 bg-card/40 backdrop-blur-md"
              >
                <Settings className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive backdrop-blur-md flex items-center gap-3">
            <AlertTriangle className="size-4" />
            <strong>系统错误:</strong> {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            {
              label: "Active Markets",
              value: stats.active_elections,
              sub: "High Liquidity",
              color: "primary",
              icon: Globe,
              trend: "+12%",
            },
            {
              label: "Data Sources",
              value: stats.poll_sources,
              sub: "Verified Feeds",
              color: "secondary",
              icon: Layers,
              trend: "Stable",
            },
            {
              label: "Alpha Signals",
              value: stats.arbitrage_signals,
              sub: "Divergence > 5%",
              color: "amber-500",
              icon: Zap,
              trend: "4 Active",
            },
          ].map((card) => (
            <Card
              key={card.label}
              className={cn(
                "relative overflow-hidden group transition-all duration-300 border-none bg-card/40 backdrop-blur-md shadow-lg hover:shadow-2xl hover:-translate-y-1 ring-1 ring-primary/5",
                `after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-${card.color}`,
              )}
            >
              <div className="absolute -top-6 -right-6 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12">
                <card.icon className="size-24" />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between mb-1">
                  <CardDescription
                    className={cn(
                      "text-[11px] font-black uppercase tracking-[0.2em]",
                      `text-${card.color}`,
                    )}
                  >
                    {card.label}
                  </CardDescription>
                  <Badge
                    variant="outline"
                    className="h-4 text-[9px] font-black uppercase bg-muted/50 border-none opacity-60"
                  >
                    {card.trend}
                  </Badge>
                </div>
                <CardTitle className="text-4xl font-black tracking-tighter tabular-nums">
                  {card.value || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-12 bg-muted rounded-full overflow-hidden shrink-0">
                    <div
                      className={cn("h-full animate-pulse", `bg-${card.color}`)}
                      style={{ width: "60%" }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-wider truncate">
                    {card.sub}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
                <div className="flex items-center gap-2 p-1 rounded-2xl border bg-card/40 backdrop-blur-md shadow-inner ring-1 ring-primary/5">
                  {[
                    ["volume", "成交额"],
                    ["spread", "价差"],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSortMode(val)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-[12px] font-black uppercase tracking-[0.15em] transition-all",
                        sortMode === val
                          ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(var(--primary),0.25)] scale-[1.02]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
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
                    "h-8 px-5 rounded-full font-black text-xs uppercase tracking-widest transition-all",
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
                        "group relative overflow-hidden transition-all duration-300 hover:ring-2 hover:ring-primary/20 bg-card/40 backdrop-blur-md border-primary/5 cursor-pointer hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.3)]",
                        highlightedId === event.id &&
                          "ring-2 ring-primary bg-primary/[0.02]",
                      )}
                      onClick={() => highlightOpportunity(event)}
                    >
                      {isHot && (
                        <div className="absolute -top-24 -right-24 size-48 bg-amber-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
                      )}

                      <div
                        className={cn(
                          "absolute top-0 right-0 px-3 py-1 text-[11px] font-black uppercase tracking-widest rounded-bl-xl z-20",
                          isHot
                            ? "bg-amber-500 text-amber-950 shadow-[0_4px_12px_rgba(245,158,11,0.3)]"
                            : "bg-muted/80 backdrop-blur-md text-muted-foreground border-l border-b",
                        )}
                      >
                        {isHot ? "Hot Signal" : `Market #${index + 1}`}
                      </div>

                      <CardHeader className="pb-4 relative z-10">
                        <CardTitle className="text-lg font-black leading-tight line-clamp-2 transition-colors">
                          {safeTitle(event)}
                        </CardTitle>
                        <CardDescription className="text-xs font-bold uppercase tracking-tight text-muted-foreground/60 h-4 mt-2">
                          {extractRegion(safeTitle(event))} ·{" "}
                          {extractElectionType(safeTitle(event))}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-5 relative z-10">
                        <div className="space-y-3">
                          {candidates.map((candidate, ci) => (
                            <div
                              key={ci}
                              className="flex items-center justify-between group/cand"
                            >
                              <div className="flex items-center gap-2.5">
                                <CandidateAvatar candidate={candidate} small />
                                <span className="text-[13px] font-bold truncate max-w-[120px]">
                                  {candidate.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-black tabular-nums">
                                  {formatPercent(candidate.probability)}
                                </span>
                                <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full transition-all duration-1000",
                                      ci === 0
                                        ? "bg-primary"
                                        : "bg-muted-foreground/30",
                                    )}
                                    style={{
                                      width: `${candidate.probability}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-primary/5 bg-muted/10 -mx-6 px-6">
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">
                              PEB PROB
                            </div>
                            <div className="text-2xl font-black tracking-tighter text-foreground">
                              {formatPercent(event.peb_prob)}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest text-right">
                              MARKET PRICE
                            </div>
                            <div className="text-2xl font-black tracking-tighter text-primary text-right">
                              {formatPercent(event.market_price)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] font-black text-muted-foreground uppercase opacity-40">
                              Divergence Signal
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider transition-colors shadow-sm border",
                                divergence >= 0
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-500 border-rose-500/20",
                              )}
                            >
                              {divergence > 0 ? (
                                <ArrowUpRight className="size-3" />
                              ) : (
                                <ArrowUpRight className="size-3 rotate-90" />
                              )}
                              {formatSignedPercent(divergence)}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 text-right">
                            <div className="text-[10px] font-black text-muted-foreground uppercase opacity-40">
                              Market Volume
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-black tabular-nums">
                              <Activity className="size-3 text-primary" />
                              {event.volume_24h_label || "--"}
                            </span>
                          </div>
                        </div>

                        <div className="h-1 w-full bg-muted/30 rounded-full overflow-hidden mt-2">
                          <div
                            className={cn(
                              "h-full animate-pulse transition-all duration-500",
                              Math.abs(divergence) >= 5
                                ? "bg-amber-500"
                                : "bg-primary/40",
                            )}
                            style={{
                              width: `${Math.min(100, Math.abs(divergence) * 10)}%`,
                            }}
                          />
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
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter mt-0.5">
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
                              className="text-[11px] font-black py-0 h-4 uppercase bg-primary/5 border-primary/20 text-primary flex items-center gap-1.5"
                            >
                              <span className="size-1 rounded-full bg-primary animate-pulse" />
                              {item.tag || "INTEL"}
                            </Badge>
                            <span className="text-[11px] font-bold text-muted-foreground/60 tabular-nums">
                              {item.time || "实时"}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold leading-tight text-foreground group-hover:text-primary transition-colors mb-2.5">
                            {item.title}
                          </h4>
                          <div className="flex items-start gap-2 text-[13px] font-bold text-muted-foreground leading-snug">
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
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter mt-0.5">
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
                        className="w-full relative group p-5 hover:bg-muted/50 transition-all border-b last:border-0"
                        onClick={() =>
                          findByTitle(item.title_zh || item.title || "")
                        }
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-foreground/80 group-hover:text-foreground transition-colors truncate pr-4">
                            {item.title_zh || item.title}
                          </span>
                          <span className="text-[11px] font-black text-secondary-foreground tabular-nums py-1 px-2.5 bg-secondary rounded-lg shadow-sm min-w-[60px] text-center">
                            {item.label}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-secondary shadow-[0_0_8px_rgba(var(--secondary),0.4)] transition-all duration-700"
                            style={{
                              width: item.label?.includes("天")
                                ? `${Math.max(10, Math.min(100, 100 - (parseInt(item.label) / 60) * 100))}%`
                                : "100%",
                            }}
                          />
                        </div>
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
          <DialogContent className="max-w-[1650px] w-[96vw] h-[90vh] p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border-primary/20 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col h-full min-h-0">
              <header className="flex items-center justify-between px-8 py-6 border-b bg-muted/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black uppercase tracking-wider h-5">
                      市场作战室 (War Room)
                    </Badge>
                    <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">
                      ID: {selectedOpportunity.id.slice(0, 8)}
                    </span>
                  </div>
                  <DialogTitle className="text-3xl font-black tracking-tight leading-none py-1">
                    {detail.candidateInsights.leader.nameZh ||
                      detail.candidateInsights.leader.name}
                    <span className="text-muted-foreground/40 ml-2 font-medium">
                      / {selectedOpportunity.title_zh}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Globe className="size-3.5" />
                    {buildSubtitle(selectedOpportunity, detail)}
                  </DialogDescription>
                </div>

                <div className="flex items-center gap-6">
                  <div className="hidden lg:flex items-center gap-6 px-6 py-2 border rounded-2xl bg-card/40 backdrop-blur-md">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">
                        市场状态
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-xs font-black uppercase text-emerald-500">
                          活跃 / 开放
                        </span>
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">
                        流动性评分
                      </span>
                      <span className="text-xs font-black text-foreground tabular-nums">
                        84.2{" "}
                        <span className="text-[10px] opacity-40">Tier 1</span>
                      </span>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">
                        对冲容量
                      </span>
                      <span className="text-xs font-black text-primary uppercase">
                        高优势 (Advantage)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full hover:bg-muted/80 transition-colors"
                      onClick={() => setSelectedOpportunity(null)}
                    >
                      <ChevronRight className="size-4 rotate-180" />
                    </Button>
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
                </div>
              </header>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                    <Card className="lg:col-span-8 bg-card/30 border-primary/10 overflow-hidden h-full flex flex-col">
                      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 py-4">
                        <div className="space-y-0.5">
                          <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">
                            选举指挥中心
                          </CardTitle>
                          <CardDescription className="text-xs font-bold uppercase">
                            参选人实时期望 (30D 融合拟合)
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
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
                                    "text-[13px] font-bold text-muted-foreground uppercase tracking-widest h-5",
                                    index === 0
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted-foreground/20 text-muted-foreground",
                                  )}
                                >
                                  {index === 0
                                    ? "Leader"
                                    : `Rank #${index + 1}`}
                                </Badge>
                                <span className="text-xs font-black text-primary">
                                  {index === 0
                                    ? "领跑席位"
                                    : `差 ${Math.abs(candidate.probability - detail.candidateInsights.leader.probability).toFixed(1)}pt`}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mb-6">
                                <CandidateAvatar candidate={candidate} />
                                <div>
                                  <div className="font-bold text-sm">
                                    {candidate.nameZh || candidate.name}
                                  </div>
                                  <div className="text-[12px] font-bold text-muted-foreground uppercase">
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
                              className="bg-muted/50 text-xs px-3 font-bold text-muted-foreground border-transparent hover:border-primary/20 transition-colors"
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        "lg:col-span-4 h-full bg-card/30 border-primary/10 overflow-hidden flex flex-col shadow-xl",
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
                            阿尔法量化分析
                          </CardTitle>
                          <Badge
                            className={cn(
                              "text-[11px] font-black uppercase tracking-widest h-5",
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
                            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                              模型偏离度 (Divergence)
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
                          <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
                            {signalState?.summary}
                          </p>

                          <div className="pt-4 border-t border-primary/5 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
                                PEB 核心数据源
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-bold border-primary/10"
                              >
                                {detail.pebSource}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
                                Kalshi 对应合约
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-bold border-primary/10 max-w-[150px] truncate"
                                title={
                                  detail.kalshiMarketTitle ||
                                  detail.kalshiEventTitle
                                }
                              >
                                {detail.kalshiMarketTicker ||
                                  detail.kalshiMarketTitle ||
                                  "No Match"}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {[
                            ["Polymarket 价", formatPercent(detail.marketProb)],
                            ["Kalshi 价", formatPercent(detail.kalshiProb)],
                            ["PEB 模拟概率", formatPercent(detail.pebProb)],
                            ["操作指令", detail.recommendation.action],
                          ].map(([label, val]) => (
                            <div
                              key={label}
                              className="p-3 rounded-xl bg-muted/30 border border-primary/5 space-y-1"
                            >
                              <div className="text-[13px] font-black text-muted-foreground uppercase tracking-widest">
                                {label}
                              </div>
                              <div className="text-sm font-black">{val}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column - Main Charts & Data */}
                    <div className="lg:col-span-8 space-y-8">
                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-sm">
                        <CardHeader className="border-b bg-muted/20 py-4 flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              混合价格走势图
                            </CardTitle>
                            <CardDescription className="text-[12px] font-bold uppercase tracking-wider">
                              实时价格、对冲价与 PEB 模型拟合曲线
                            </CardDescription>
                          </div>
                        </CardHeader>
                        <CardContent className="p-8">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
                                <div className="text-[13px] font-black text-muted-foreground uppercase tracking-widest">
                                  {l}
                                </div>
                                <div className={cn("text-xl font-black", c)}>
                                  {v}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="h-[350px] w-full">
                            <HybridChart detail={detail} />
                          </div>
                          <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-primary/5">
                            <div className="flex items-center gap-6">
                              {[
                                ["核心市场", "#00ff9d", "line"],
                                ["Kalshi 盘", "#6f92ff", "dash"],
                                ["PEB 模拟", "#39d0ff", "glow"],
                              ].map(([label, color, type]) => (
                                <div
                                  key={label}
                                  className="flex items-center gap-2.5 group cursor-default"
                                >
                                  <div className="relative">
                                    <div
                                      className={cn(
                                        "h-1 w-5 rounded-full shadow-[0_0_8px_var(--color)]",
                                        type === "dash" &&
                                          "border-t-2 border-dashed h-0",
                                      )}
                                      style={{
                                        backgroundColor:
                                          type === "dash"
                                            ? "transparent"
                                            : color,
                                        borderColor:
                                          type === "dash"
                                            ? color
                                            : "transparent",
                                        // @ts-ignore
                                        "--color": color,
                                      }}
                                    />
                                    {type === "glow" && (
                                      <div className="absolute inset-x-0 h-1 bg-white/20 blur-[1px]" />
                                    )}
                                  </div>
                                  <span className="text-[11px] font-black text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-[0.15em]">
                                    {label}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/40 tabular-nums">
                              <span className="flex items-center gap-1.5">
                                <Activity className="size-3" />
                                864 SAMPLES / SEC
                              </span>
                              <Separator
                                orientation="vertical"
                                className="h-3"
                              />
                              <span className="flex items-center gap-1.5">
                                <ShieldCheck className="size-3" />
                                全平台链路同步中
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="bg-card/30 border-primary/10 overflow-hidden h-full flex flex-col">
                          <CardHeader className="border-b bg-muted/20 py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Contender Board
                            </CardTitle>
                            <CardDescription className="text-[12px] font-bold uppercase tracking-wider">
                              {detail.candidateInsights.candidates.length}{" "}
                              位参选人/选项盘口
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-0 flex-1">
                            {detail.candidateInsights.candidates.length ===
                            0 ? (
                              <div className="p-12 text-center space-y-3">
                                <Search className="size-8 mx-auto text-muted-foreground/30" />
                                <p className="text-xs font-bold text-muted-foreground uppercase">
                                  Syncing candidates...
                                </p>
                              </div>
                            ) : (
                              <div className="divide-y">
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
                                      <span className="text-[12px] font-black tabular-nums text-muted-foreground/50 w-4">
                                        {String(idx + 1).padStart(2, "0")}
                                      </span>
                                      <CandidateAvatar candidate={cand} small />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">
                                          {cand.nameZh || cand.name}
                                        </div>
                                        <div className="text-[13px] font-bold text-muted-foreground uppercase">
                                          {cand.partyLabel}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-black text-sm tabular-nums">
                                          {formatPercent(cand.probability)}
                                        </div>
                                        <div className="text-[13px] font-bold text-muted-foreground uppercase">
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

                        <Card className="bg-card/30 border-primary/10 overflow-hidden h-full flex flex-col">
                          <CardHeader className="border-b bg-muted/20 py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              Arbitrage Matrix
                            </CardTitle>
                            <CardDescription className="text-[12px] font-bold uppercase tracking-wider">
                              多源概率定价偏离
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-6 space-y-6 flex-1">
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
                                  <span className="text-[13px] font-black text-muted-foreground uppercase tracking-widest">
                                    {row.label}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-xs font-black",
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
                            <div className="pt-4 border-t border-primary/5 mt-auto">
                              <p className="text-[13px] font-medium leading-relaxed text-muted-foreground/80 italic">
                                * 模型偏离超过 5%
                                时系统将触发对冲信号。当前价差由民调权重与跨所价格实时计算得出。
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-xl">
                        <div className="flex items-center justify-between border-b bg-muted/20 py-4 px-6">
                          <div className="space-y-0.5">
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                              民调情报分析
                              {detail.pollCandidate && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] h-4 bg-primary/10 text-primary border-none"
                                >
                                  对标: {detail.pollCandidate}
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="text-xs font-bold uppercase">
                              {detail.pollSourceCount > 0
                                ? `民调数据聚合自 ${detail.pollSource} (${detail.pollPageTitle || "Wikipedia"})`
                                : "暂无外部民调数据源可用"}
                            </CardDescription>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-black text-primary uppercase">
                              加权准确率
                            </div>
                            <div className="text-lg font-black tabular-nums">
                              {detail.pollAccuracyAvg > 0
                                ? `${detail.pollAccuracyAvg}%`
                                : "--"}
                            </div>
                          </div>
                        </div>
                        <CardContent className="p-0">
                          {detail.polls.length === 0 ? (
                            <div className="p-6 space-y-3">
                              <div className="text-sm font-bold">
                                暂无真实民调明细
                              </div>
                              <div className="text-[13px] leading-relaxed text-muted-foreground">
                                这个市场还没有匹配到可解析的 Wikipedia
                                公开民调页面。 当前 PEB
                                会回退到市场内部融合值，不再伪造民调表格。
                              </div>
                            </div>
                          ) : (
                            <div className="divide-y divide-primary/5">
                              <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b bg-muted/5 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                                <div className="col-span-3">民调机构</div>
                                <div className="col-span-3 text-center">
                                  支持对象
                                </div>
                                <div className="col-span-1 text-center">
                                  权重
                                </div>
                                <div className="col-span-1 text-center">
                                  支持率
                                </div>
                                <div className="col-span-2 text-center">
                                  准确率
                                </div>
                                <div className="col-span-2 text-right">
                                  样本量
                                </div>
                              </div>
                              {detail.polls.map((poll, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-12 p-4 items-center hover:bg-muted/30 transition-colors"
                                >
                                  <div className="col-span-3 flex items-center gap-3">
                                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-black text-primary">
                                      {poll.name[0]}
                                    </div>
                                    <span className="text-[13px] font-bold">
                                      {poll.name}
                                    </span>
                                  </div>
                                  <div className="col-span-3 text-center">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] h-4 bg-primary/5 border-primary/20"
                                    >
                                      {poll.supportFor ||
                                        detail.pollCandidate ||
                                        "--"}
                                    </Badge>
                                  </div>
                                  <div className="col-span-1 text-center font-bold">
                                    {(poll.weight * 100).toFixed(0)}%
                                  </div>
                                  <div className="col-span-1 text-center font-black text-primary">
                                    {poll.support.toFixed(1)}%
                                  </div>
                                  <div className="col-span-2 text-center">
                                    <div className="h-1.5 w-12 bg-muted rounded-full mx-auto overflow-hidden">
                                      <div
                                        className="h-full bg-primary"
                                        style={{ width: `${poll.accuracy}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold mt-1 block">
                                      {poll.accuracy}%
                                    </span>
                                  </div>
                                  <div className="col-span-2 text-right font-bold tabular-nums">
                                    {poll.sample.toLocaleString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Right Column - AI & Catalysts */}
                    <div className="lg:col-span-4 space-y-8">
                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-xl">
                        <CardHeader className="py-4 border-b bg-muted/20">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="size-4 text-muted-foreground" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              市场深度报告 (Market Dossier)
                            </CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6">
                          <p className="text-[13px] font-semibold text-muted-foreground">
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
                                className="flex items-center justify-between text-[13px] font-bold"
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

                      <Card className="bg-card/30 border-primary/10 overflow-hidden shadow-xl border-t-2 border-t-primary/20">
                        <CardHeader className="py-4 border-b bg-muted/20">
                          <div className="flex items-center gap-2">
                            <Zap className="size-4 text-primary" />
                            <CardTitle className="text-sm font-black uppercase tracking-widest">
                              关键时间节点 (Catalysts)
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
                                  <span className="text-xs font-black text-primary uppercase tracking-widest">
                                    {cat.label}
                                  </span>
                                  <span className="text-xs font-bold text-muted-foreground">
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
