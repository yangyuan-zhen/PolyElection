"use client";

import {
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
const NAV_ITEMS: Array<[string, string, boolean]> = [
  ["dashboard", "数据看板", true],
  ["public", "全球市场", false],
  ["analytics", "PEB 算法逻辑", false],
  ["notifications_active", "实时预警", false],
  ["psychology", "AI 选情分析", false],
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
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
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
  if (Array.isArray(event.candidate_board) && event.candidate_board.length > 0) {
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
      partyLabel: event.candidate_count && event.candidate_count > 1 ? "候选盘" : "",
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
  const leaderGap = runnerUp ? leader.probability - runnerUp.probability : leader.probability;
  const topTwoShare = candidates.slice(0, 2).reduce((sum, item) => sum + item.probability, 0);
  return {
    candidates,
    leader,
    runnerUp,
    leaderGap,
    topTwoShare,
    structureLabel: candidates.length <= 2 ? "二元对赌市场" : `${candidates.length} 人 / 党派竞争`,
    fieldLabel: candidates.length <= 2 ? "胜负对冲盘" : `头部集中度 ${topTwoShare.toFixed(1)}%`,
  };
}

function buildSubtitle(event: Opportunity, detail: QuantDetail): string {
  const spread = toNumber(event.divergence);
  const signal = Math.abs(spread) >= 8 ? "极强价差信号" : Math.abs(spread) >= 5 ? "可交易价差信号" : "中性观望区";
  return `${extractRegion(safeTitle(event))} · ${extractElectionType(safeTitle(event))} · ${detail.candidateInsights.leader.name} 领跑 · ${signal} · Kalshi ${formatPercent(detail.kalshiProb)}`;
}

function buildInsightText(event: Opportunity, detail: QuantDetail): string {
  const spread = toNumber(event.divergence);
  const direction = spread >= 5 ? "市场低估" : spread <= -5 ? "市场高估" : "市场定价接近公允";
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
  const baseKalshi = clamp(baseMarket - toNumber(event.divergence) * 0.35 + (random() - 0.5) * 3, 1, 99);
  const candles: ChartCandle[] = [];
  const pebLine: number[] = [];
  const kalshiLine: number[] = [];
  let cursor = clamp(baseMarket - 8 + random() * 6, 2, 98);

  for (let index = 0; index < CHART_POINTS; index += 1) {
    const progress = index / (CHART_POINTS - 1);
    const target = baseMarket + Math.sin(progress * Math.PI * 2) * 4 + (progress - 0.5) * toNumber(event.divergence);
    const open = cursor;
    const close = clamp(open + (target - open) * 0.45 + (random() - 0.5) * 5, 1, 99);
    const high = clamp(Math.max(open, close) + random() * 4.5, 1, 99);
    const low = clamp(Math.min(open, close) - random() * 4.5, 1, 99);
    const volume = 18 + random() * 56 + progress * 22;

    candles.push({ open, close, high, low, volume });
    pebLine.push(clamp(basePeb - 5 + progress * 5 + Math.sin(progress * Math.PI * 1.8) * 3 + (random() - 0.5) * 1.2, 1, 99));
    kalshiLine.push(clamp(baseKalshi + Math.cos(progress * Math.PI * 1.3) * 2 + (random() - 0.5) * 1.5, 1, 99));
    cursor = close;
  }

  candles[CHART_POINTS - 1].close = baseMarket;
  candles[CHART_POINTS - 1].high = Math.max(candles[CHART_POINTS - 1].high, baseMarket);
  candles[CHART_POINTS - 1].low = Math.min(candles[CHART_POINTS - 1].low, baseMarket);
  pebLine[CHART_POINTS - 1] = basePeb;
  kalshiLine[CHART_POINTS - 1] = baseKalshi;

  return {
    candles,
    pebLine,
    kalshiLine,
    labels: ["4周前", "", "", "", "", "3周前", "", "", "", "", "2周前", "", "", "", "", "1周前", "", "", "", "", "3天前", "", "", "", "", "现在"],
  };
}

function buildPollBreakdown(event: Opportunity, detail: Pick<QuantDetail, "pebProb">) {
  const random = createSeededRandom(`polls:${event.id}`);
  const base = detail.pebProb;
  const pollsters = POLLSTERS.map((name, index) => ({
    name,
    weight: clamp(0.14 + random() * 0.22, 0.08, 0.34),
    support: clamp(base + (random() - 0.5) * 10 + index * 0.4, 1, 99),
    accuracy: clamp(71 + random() * 20, 60, 95),
    sample: Math.round(850 + random() * 2200),
  })).sort((left, right) => right.weight - left.weight);

  const totalWeight = pollsters.reduce((sum, item) => sum + item.weight, 0) || 1;
  return pollsters.map((item) => ({ ...item, weight: item.weight / totalWeight }));
}

function buildCatalysts(event: Opportunity) {
  const daysLeft = getDaysLeft(event);
  const title = safeTitle(event);
  const region = extractRegion(title);
  return [
    { label: "P0", time: "最近 72h", title: `${region}竞选新闻流量升温`, description: "媒体关注度抬升，短线赔率波动开始放大。" },
    { label: "P1", time: daysLeft <= 7 ? "即将发生" : "未来 1-2 周", title: `${extractElectionType(title)}关键表态窗口`, description: "候选人表态、联盟重组或党内站队可能改变主导结果。" },
    { label: "P2", time: "策略观察", title: "民调更新批次落地", description: "新一轮高质量民调将决定 PEB 是否继续抬升。" },
    { label: "P3", time: daysLeft <= 3 ? "临近结算" : "中期冲击", title: "价格回归与套利平仓", description: "如果价差收敛，跨所对冲资金会更快切换仓位。" },
  ];
}

function buildReasoning(
  event: Opportunity,
  detail: { recommendation: { action: string }; kalshiProb: number; marketProb: number; series: { candles: ChartCandle[] } },
) {
  const spread = toNumber(event.divergence);
  const momentum = detail.series.candles[CHART_POINTS - 1].close - detail.series.candles[CHART_POINTS - 4].close;
  const sentiment = clamp(52 + spread * 1.8 + momentum * 0.6, 5, 95);
  return {
    sentiment,
    steps: [
      { code: "P0", title: "突发事件检测", verdict: momentum > 0 ? "价格动能抬升" : "价格动能转弱", strength: `${Math.abs(momentum).toFixed(1)}pt`, body: "盘口最近几个周期已经开始提前反映新的预期，说明事件层面正在影响交易盘。" },
      { code: "P1", title: "媒体脉冲过滤", verdict: spread >= 0 ? "正向偏多" : "负向分歧", strength: `${Math.round(sentiment)}%`, body: "新闻流与舆论热度推动短线资金先动，市场价格对 headline 的反应明显快于民调。" },
      { code: "P2", title: "民调偏离分析", verdict: Math.abs(spread) >= 5 ? "显著偏离" : "轻微偏离", strength: formatSignedPercent(spread), body: "PEB 与市场价之间的距离决定了是否存在可执行的再定价窗口。" },
      { code: "P3", title: "赔率结构校正", verdict: Math.abs(detail.kalshiProb - detail.marketProb) >= 3 ? "跨所价差可用" : "跨所价差有限", strength: formatSignedPercent(detail.kalshiProb - detail.marketProb), body: "Polymarket 与 Kalshi 对冲价并不一致，说明不同交易群体对同一事件的风险定价还未统一。" },
      { code: "P4", title: "操作建议", verdict: detail.recommendation.action, strength: safeOutcome(event), body: "结合时间窗口、流动性与价差信号，当前策略以等待价差收敛或顺势跟随为主。" },
    ],
  };
}

function buildQuantDetail(event: Opportunity): QuantDetail {
  const marketProb = clamp(toNumber(event.market_price, 50), 1, 99);
  const pebProb = clamp(toNumber(event.peb_prob, marketProb), 1, 99);
  const spread = pebProb - marketProb;
  const random = createSeededRandom(`detail:${event.id}`);
  const kalshiProb = clamp(marketProb - spread * 0.35 + (random() - 0.5) * 4, 1, 99);
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
    polls: buildPollBreakdown(event, { pebProb } as Pick<QuantDetail, "pebProb">),
    reasoning: buildReasoning(event, { recommendation, kalshiProb, marketProb, series }),
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
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function CandidateAvatar({ candidate, small = false }: { candidate: Candidate; small?: boolean }) {
  const [startColor, endColor] = colorFromText(candidate.name);
  return (
    <div className={`candidate-avatar${small ? " small" : ""}`}>
      {candidate.image ? (
        <img className="candidate-avatar-image" src={candidate.image} alt={candidate.name} />
      ) : (
        <span className="candidate-avatar-fallback" style={{ background: `linear-gradient(135deg, ${startColor}, ${endColor})` }}>
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
  const marketPath = linePath(candles.map((item) => item.close), width, chartHeight);
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
              <line x1="0" y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <text x="0" y={y - 6} fill="rgba(216,228,244,0.56)" fontSize="11">
                {line}%
              </text>
            </Fragment>
          );
        })}

        <path d={`${marketPath} L ${width},${chartHeight} L 0,${chartHeight} Z`} fill="url(#marketGlow)" />

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
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1.4" opacity="0.9" />
              <rect x={x - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} rx="2" fill={color} opacity="0.9" />
              <rect x={x - candleWidth / 2} y={volumeY} width={candleWidth} height={barHeight} rx="2" fill="rgba(111, 146, 255, 0.35)" />
            </Fragment>
          );
        })}

        <path d={marketPath} fill="none" stroke="#00ff9d" strokeWidth="2.2" filter="url(#glow)" />
        <path d={kalshiPath} fill="none" stroke="#6f92ff" strokeWidth="1.8" strokeDasharray="5 5" />
        <path d={pebPath} fill="none" stroke="#39d0ff" strokeWidth="2" filter="url(#glow)" />

        {eventMarkers.map((item) => (
          <Fragment key={item.label}>
            <line x1={item.x} y1="12" x2={item.x} y2={chartHeight} stroke="rgba(0,255,157,0.24)" strokeDasharray="4 6" />
            <circle cx={item.x} cy="24" r="4.5" fill="#00ff9d" />
            <text x={item.x + 8} y="20" fill="rgba(230,237,243,0.88)" fontSize="11">
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
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
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
          throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
        }

        setOpportunities((payload.data?.opportunities || []).map((item) => ({
          ...item,
          days_left: getDaysLeft(item),
        })));
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
      [item.title_zh, item.title].some((value) => String(value || "").includes(title)),
    );
    if (match) {
      highlightOpportunity(match);
    }
  }

  const visibleOpportunities = [...opportunities]
    .sort((left, right) => {
      if (sortMode === "spread") {
        return Math.abs(toNumber(right.divergence)) - Math.abs(toNumber(left.divergence));
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
      if (activeFilter === "spread" && Math.abs(toNumber(event.divergence)) < 5) {
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

  const detail = selectedOpportunity ? buildQuantDetail(selectedOpportunity) : null;
  const detailCandidates = detail?.candidateInsights.candidates ?? [];
  const heroCandidates = detailCandidates.slice(0, 3);
  const duelCandidates = detailCandidates.slice(0, 2);
  const signalState = detail ? getSignalState(toNumber(selectedOpportunity?.divergence)) : null;
  const watchItems = selectedOpportunity && detail ? buildWatchItems(selectedOpportunity, detail) : [];

  return (
    <>
      <aside className="sidebar">
        <div className="logo">
          <span className="material-icons-round">how_to_vote</span>
          PolyElection
        </div>

        <nav>
          {NAV_ITEMS.map(([icon, label, active]) => (
            <a key={label} href="#" className={`nav-link${active ? " active" : ""}`}>
              <span className="material-icons-round">{icon}</span>
              {label}
            </a>
          ))}
        </nav>

        <div className="account-panel">
          <div className="account-label">当前账户</div>
          <div className="account-tier">免费版 (Free Tier)</div>
          <div className="account-upgrade">升级至 Pro</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="header-top">
          <div>
            <h1 className="page-title">选举量化情报站</h1>
            <p className="page-subtitle">量化全球预测市场的情绪、偏离与套利信号</p>
          </div>
          <div className="header-side">
            <div className="refresh-meta">{formatDateTime(stats.last_updated)}</div>
            <div className="live-badge">
              <span className="live-dot"></span>
              <span>{error ? "同步失败" : "实时同步中 (SYNCED)"}</span>
            </div>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">活跃追踪选举</div>
            <div className="stat-value">{toNumber(stats.active_elections, opportunities.length)}</div>
          </div>
          <div className="stat-card secondary">
            <div className="stat-label">活跃市场</div>
            <div className="stat-value">{toNumber(stats.poll_sources)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">高分歧信号 (24h)</div>
            <div className="stat-value accent">{toNumber(stats.arbitrage_signals)}</div>
          </div>
        </section>

        <div className="intel-hub">
          <section className="opportunities-section">
            <div className="section-header">
              <div>
                <h2 className="section-title">全球市场机会</h2>
                <p className="section-subtitle">
                  当前展示 {visibleOpportunities.length} / {opportunities.length} 个市场机会
                </p>
              </div>
              <div className="toolbar">
                <label className="search-box">
                  <span className="material-icons-round">search</span>
                  <input
                    type="search"
                    placeholder="搜索国家、职位、市场标题"
                    value={searchTerm}
                    onChange={(event) => {
                      startTransition(() => setSearchTerm(event.target.value));
                    }}
                  />
                </label>
                <label className="select-box">
                  <span>排序</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                    <option value="volume">24h 成交额</option>
                    <option value="spread">市场价差</option>
                    <option value="close">临近结算</option>
                    <option value="liquidity">流动性</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="filter-row">
              {[
                ["all", "全部"],
                ["spread", "高分歧"],
                ["closing", "即将结算"],
                ["volume", "高成交"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`filter-chip${activeFilter === value ? " active" : ""}`}
                  onClick={() => setActiveFilter(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="election-grid">
              {isLoading ? (
                <article className="election-card placeholder-card">
                  <span className="card-tag">Loading</span>
                  <h3 className="election-title">正在加载市场机会...</h3>
                  <p className="card-description">等待后端同步 Polymarket 实时事件与量化聚合数据。</p>
                </article>
              ) : visibleOpportunities.length === 0 ? (
                <div className="empty-state">
                  <strong>没有符合当前条件的市场。</strong>
                  <p>可以调整筛选条件，或搜索其他国家与职位。</p>
                </div>
              ) : (
                visibleOpportunities.map((event, index) => {
                  const candidates = getCandidateBoard(event).slice(0, 2);
                  const divergence = toNumber(event.divergence);
                  return (
                    <article
                      key={event.id}
                      className={`election-card${highlightedId === event.id ? " highlighted-card" : ""}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      onClick={() => highlightOpportunity(event)}
                    >
                      <span className="card-tag">POLYMARKET 事件 #{index + 1}</span>
                      <h3 className="election-title">{safeTitle(event)}</h3>
                      <p className="card-description">{truncate(buildDeckDescription(event), 88)}</p>
                      <div className="candidate-preview">
                        {candidates.map((candidate, candidateIndex) => (
                          <span className="candidate-preview-chip" key={`${candidate.name}-${candidateIndex}`}>
                            {candidateIndex === 0 ? "领跑" : "次席"} · {candidate.name} {formatPercent(candidate.probability)}
                          </span>
                        ))}
                      </div>
                      <div className="card-meta-row">
                        <span className="meta-chip"><span className="meta-chip-label">主导结果</span><span className="meta-chip-value">{safeOutcome(event)}</span></span>
                        <span className="meta-chip"><span className="meta-chip-label">24h 成交</span><span className="meta-chip-value">{event.volume_24h_label || "--"}</span></span>
                        <span className="meta-chip"><span className="meta-chip-label">流动性</span><span className="meta-chip-value">{event.liquidity_label || "--"}</span></span>
                        <span className="meta-chip"><span className="meta-chip-label">结算</span><span className="meta-chip-value">{event.time_label_zh || event.time_label || "实时"}</span></span>
                      </div>
                      <div className="data-viz">
                        <div className="viz-item">
                          <div className="label">融合概率</div>
                          <div className="value">{formatPercent(event.peb_prob)}</div>
                        </div>
                        <div className="viz-divider"></div>
                        <div className="viz-item">
                          <div className="label">主市场概率</div>
                          <div className="value market">{formatPercent(event.market_price)}</div>
                        </div>
                      </div>
                      <div className={`arbitrage-pill${Math.abs(divergence) >= 5 ? " highlight" : ""}`}>
                        <span className="material-icons-round" style={{ fontSize: "1.15rem" }}>
                          {divergence > 0 ? "trending_up" : "trending_down"}
                        </span>
                        市场价差: <strong>{formatSignedPercent(divergence)}</strong>
                      </div>
                      <div className="card-actions" onClick={(eventTarget) => eventTarget.stopPropagation()}>
                        {event.url ? (
                          <a className="card-link" href={event.url} target="_blank" rel="noreferrer">
                            打开 Polymarket
                          </a>
                        ) : (
                          <span className="card-link disabled">暂无外链</span>
                        )}
                        <button className="card-link secondary" type="button" onClick={() => setHighlightedId(event.id)}>
                          聚焦
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="intelligence-section">
            <h2 className="section-title">选情情报雷达</h2>
            <div className="glass-card">
              <div>
                {intelligence.length === 0 ? (
                  <div className="empty-state">
                    <strong>暂无情报流。</strong>
                    <p>等待后端返回新的市场摘要。</p>
                  </div>
                ) : (
                  intelligence.map((item, index) => (
                    <button
                      className="news-card news-card-button"
                      key={`${item.title || "intel"}-${index}`}
                      type="button"
                      onClick={() => findByTitle(item.title || "")}
                    >
                      <div className="news-meta">
                        <span className="news-tag">{item.tag || "情报"}</span>
                        <span className="news-time">{item.time || "--"}</span>
                      </div>
                      <div className="news-title">{item.title || "未命名情报"}</div>
                      <div className="impact-label">
                        <span className="material-icons-round" style={{ fontSize: "1rem" }}>insights</span>
                        {item.impact || "暂无影响分析"}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="countdown-section">
                <h3 className="countdown-title">选举倒计时</h3>
                <div className="countdown-list">
                  {countdown.length === 0 ? (
                    <div className="countdown-row">
                      <span>暂无可展示的选举倒计时</span>
                      <span className="countdown-value">--</span>
                    </div>
                  ) : (
                    countdown.map((item, index) => (
                      <button
                        className="countdown-row countdown-button"
                        key={`${item.title || "countdown"}-${index}`}
                        type="button"
                        onClick={() => findByTitle(item.title_zh || item.title || "")}
                      >
                        <span>{item.title_zh || item.title || "未命名市场"}</span>
                        <span className="countdown-value">{item.label || "--"}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {selectedOpportunity && detail ? (
        <Dialog
          open={Boolean(selectedOpportunity)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedOpportunity(null);
            }
          }}
        >
          <DialogContent className="detail-dialog-content" showCloseButton={false}>
            <DialogTitle className="sr-only">{safeTitle(selectedOpportunity)}</DialogTitle>
            <DialogDescription className="sr-only">
              {buildSubtitle(selectedOpportunity, detail)}
            </DialogDescription>
            <ScrollArea className="detail-scroll-area">
              <section className="detail-workspace">
            <header className="workspace-header">
              <div className="workspace-headline">
                <div className="detail-kicker">MARKET WAR ROOM</div>
                <h2 className="workspace-title" id="detailTitle">{safeTitle(selectedOpportunity)}</h2>
                <p className="workspace-subtitle">{buildSubtitle(selectedOpportunity, detail)}</p>
                <div className="market-badge-row">
                  {[
                    detail.candidateInsights.structureLabel,
                    `领跑 ${detail.candidateInsights.leader.name}`,
                    `领先差 ${detail.candidateInsights.leaderGap.toFixed(1)}pt`,
                    detail.candidateInsights.fieldLabel,
                    `结算 ${selectedOpportunity.time_label_zh || selectedOpportunity.time_label || "实时"}`,
                  ].map((badge) => (
                    <Badge className="market-badge" key={badge} variant="outline">{badge}</Badge>
                  ))}
                </div>
              </div>
              <div className="workspace-actions">
                {[
                  ["dashboard_customize", "切换面板密度"],
                  ["notifications", "关注预警"],
                  ["translate", "切换语言"],
                ].map(([icon, label]) => (
                  <Button key={icon} className="icon-button" type="button" variant="outline" size="icon" aria-label={label}>
                    <span className="material-icons-round">{icon}</span>
                  </Button>
                ))}
                <Button
                  className="icon-button link-button"
                  aria-label="在 Polymarket 中打开"
                  render={<a href={selectedOpportunity.url || "#"} target="_blank" rel="noreferrer" />}
                  variant="outline"
                  size="icon"
                >
                  <span className="material-icons-round">open_in_new</span>
                </Button>
                <Button
                  className="icon-button close-button"
                  type="button"
                  aria-label="关闭详情看板"
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedOpportunity(null)}
                >
                  <span className="material-icons-round">close</span>
                </Button>
              </div>
            </header>

            <section className="command-deck">
              <div className="command-surface">
                <div className="command-grid">
                  <div className="command-main">
                    <div className="command-head">
                      <div>
                        <div className="card-kicker">ELECTION COMMAND DESK</div>
                        <h3 className="card-title">候选人战情板</h3>
                      </div>
                      <div className="command-head-meta">最近 30 天价格拟合 + 即时盘口</div>
                    </div>

                    <div className="candidate-cluster">
                      {heroCandidates.map((candidate, index) => (
                        <article
                          className={`combatant-card ${index === 0 ? "primary" : index === 1 ? "secondary" : "tertiary"}`}
                          key={`hero-${candidate.name}`}
                        >
                          <div className="combatant-top">
                            <div className="combatant-tag">
                              {index === 0 ? "领跑席位" : index === 1 ? "追击席位" : "边缘观察"}
                            </div>
                            <div className="combatant-delta">
                              {index === 0
                                ? "主导盘"
                                : `差 ${Math.abs(candidate.probability - detail.candidateInsights.leader.probability).toFixed(1)}pt`}
                            </div>
                          </div>
                          <div className="combatant-persona">
                            <CandidateAvatar candidate={candidate} />
                            <div className="combatant-copy">
                              <strong>{candidate.name}</strong>
                              {candidate.partyLabel ? <span className="candidate-party">{candidate.partyLabel}</span> : null}
                            </div>
                          </div>
                          <div className="combatant-metric">{formatPercent(candidate.probability)}</div>
                          <div className="combatant-track">
                            <div className="combatant-fill" style={{ width: `${clamp(candidate.probability, 0, 100)}%` }}></div>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="watch-strip">
                      {watchItems.map((item) => (
                        <div className="watch-chip" key={item}>{item}</div>
                      ))}
                    </div>
                  </div>

                  <aside className={`hero-signal-card ${signalState?.tone || "calm"}`}>
                    <div className="card-kicker">ALPHA PANEL</div>
                    <div className="hero-signal-label">{signalState?.label}</div>
                    <div className="hero-signal-value">{formatSignedPercent(selectedOpportunity.divergence)}</div>
                    <p className="hero-signal-copy">{signalState?.summary}</p>

                    <div className="hero-metric-grid">
                      <div className="hero-metric">
                        <span>Polymarket</span>
                        <strong>{formatPercent(detail.marketProb)}</strong>
                      </div>
                      <div className="hero-metric">
                        <span>Kalshi</span>
                        <strong>{formatPercent(detail.kalshiProb)}</strong>
                      </div>
                      <div className="hero-metric">
                        <span>PEB</span>
                        <strong>{formatPercent(detail.pebProb)}</strong>
                      </div>
                      <div className="hero-metric">
                        <span>策略动作</span>
                        <strong>{detail.recommendation.action}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            </section>

            <div className="workspace-grid">
              <div className="workspace-main">
                <section className="quant-card chart-card">
                  <div className="card-headline">
                    <div>
                      <div className="card-kicker">HYBRID PRICE MAP</div>
                      <h3 className="card-title">市场赔率 vs 民调趋势</h3>
                    </div>
                    <div className="card-date">最近 30 天量化拟合</div>
                  </div>
                  <div className="chart-metric-row">
                    <div className="chart-metric market">
                      <span>主市场概率</span>
                      <strong>{formatPercent(detail.marketProb)}</strong>
                    </div>
                    <div className="chart-metric peb">
                      <span>PEB 概率</span>
                      <strong>{formatPercent(detail.pebProb)}</strong>
                    </div>
                    <div className="chart-metric kalshi">
                      <span>Kalshi 对冲价</span>
                      <strong>{formatPercent(detail.kalshiProb)}</strong>
                    </div>
                    <div className="chart-metric spread">
                      <span>模型偏离</span>
                      <strong>{formatSignedPercent(detail.spread)}</strong>
                    </div>
                  </div>
                  <HybridChart detail={detail} />
                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-dot market"></span>Polymarket 实时价格</span>
                    <span className="legend-item"><span className="legend-dot kalshi"></span>Kalshi 对冲价</span>
                    <span className="legend-item"><span className="legend-dot peb"></span>PEB 融合概率</span>
                  </div>
                </section>

                <div className="workspace-lower-grid">
                  <section className="quant-card roster-card">
                    <div className="card-headline">
                      <div>
                        <div className="card-kicker">CONTENDER BOARD</div>
                        <h3 className="card-title">候选人 / 党派盘口</h3>
                      </div>
                      <div className="card-caption">
                        共 {detail.candidateInsights.candidates.length} 个参选项，当前领跑 {detail.candidateInsights.leader.name} {formatPercent(detail.candidateInsights.leader.probability)}
                      </div>
                    </div>
                    {duelCandidates.length > 0 ? (
                      <div className="duel-strip">
                        {duelCandidates.map((candidate, index) => (
                          <div className={`duel-card ${index === 0 ? "leader" : "runner"}`} key={`duel-${candidate.name}`}>
                            <div className="duel-card-head">
                              <span>{index === 0 ? "当前领跑" : "主要追赶者"}</span>
                              <strong>{formatPercent(candidate.probability)}</strong>
                            </div>
                            <div className="duel-card-persona">
                              <CandidateAvatar candidate={candidate} small />
                              <div className="duel-card-copy">
                                <b>{candidate.name}</b>
                                {candidate.partyLabel ? <span className="candidate-party">{candidate.partyLabel}</span> : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="candidate-board">
                      {detail.candidateInsights.candidates.length === 0 ? (
                        <div className="empty-state">
                          <strong>候选人列表尚未同步</strong>
                          <p>这个市场应当存在多名候选人，但当前前端拿到的还是旧缓存。重启后端并刷新前端后会显示完整盘口。</p>
                        </div>
                      ) : (
                        detail.candidateInsights.candidates.map((candidate, index) => (
                          <div className={`candidate-row ${index === 0 ? "leader" : index <= 2 ? "contender" : ""}`} key={`${candidate.name}-${index}`}>
                            <div className="candidate-rank">{String(index + 1).padStart(2, "0")}</div>
                            <div className="candidate-body">
                              <div className="candidate-head">
                                <div className="candidate-persona">
                                  <CandidateAvatar candidate={candidate} />
                                  <div className="candidate-copy">
                                    <strong>{candidate.name}</strong>
                                    {candidate.partyLabel ? <span className="candidate-party">{candidate.partyLabel}</span> : null}
                                  </div>
                                </div>
                                <span>{index === 0 ? "领跑" : `距领跑差 ${Math.abs(candidate.probability - detail.candidateInsights.leader.probability).toFixed(1)}pt`}</span>
                              </div>
                              <div className="candidate-track">
                                <div className="candidate-fill" style={{ width: `${clamp(candidate.probability, 0, 100)}%` }}></div>
                              </div>
                            </div>
                            <div className="candidate-price">{formatPercent(candidate.probability)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="quant-card wall-card">
                    <div className="card-headline">
                      <div>
                        <div className="card-kicker">PROBABILITY DIVERGENCE WALL</div>
                        <h3 className="card-title">多源概率对冲墙</h3>
                      </div>
                      <div className="card-caption">
                        {Math.abs(detail.spread) >= 5 ? "套利信号已触发" : "多源概率接近"}
                      </div>
                    </div>
                    <div className="probability-grid">
                      {[
                        { name: "Polymarket 实时价", label: safeOutcome(selectedOpportunity), probability: detail.marketProb, delta: 0, accent: "market" },
                        { name: "Kalshi 对冲价", label: "跨所估值", probability: detail.kalshiProb, delta: detail.kalshiProb - detail.marketProb, accent: "kalshi" },
                        { name: "PEB 融合概率", label: "民调加权", probability: detail.pebProb, delta: detail.pebProb - detail.marketProb, accent: "peb" },
                      ].map((row) => (
                        <div className="prob-wall-item" key={row.name}>
                          <div className="prob-wall-name">{row.name}</div>
                          <div className="prob-wall-label">{row.label}</div>
                          <div className="prob-wall-bar">
                            <div className={`prob-wall-fill ${row.accent}`} style={{ width: `${clamp(row.probability, 0, 100)}%` }}></div>
                          </div>
                          <div className="prob-wall-value">{formatPercent(row.probability)}</div>
                          <div className={`prob-wall-delta${Math.abs(row.delta) >= 5 ? " hot" : ""}`}>{row.delta === 0 ? "基准" : formatSignedPercent(row.delta)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="quant-card poll-card">
                  <div className="card-headline">
                    <div>
                      <div className="card-kicker">POLLSTER BREAKDOWN</div>
                      <h3 className="card-title">民调构成明细</h3>
                    </div>
                    <div className="card-caption">纳入 {detail.polls.length} 家机构，平均权重 {((detail.polls.reduce((sum, item) => sum + item.weight, 0) / detail.polls.length) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="poll-list">
                    {detail.polls.map((poll) => (
                      <div className="poll-row" key={poll.name}>
                        <div className="poll-head">
                          <div className="poll-name">{poll.name}</div>
                          <div className="poll-score">{formatPercent(poll.support)}</div>
                        </div>
                        <div className="poll-meta">
                          <span>准确度权重 {(poll.weight * 100).toFixed(1)}%</span>
                          <span>历史准确度 {poll.accuracy.toFixed(0)}%</span>
                          <span>样本 {poll.sample}</span>
                        </div>
                        <div className="poll-track"><div className="poll-fill" style={{ width: `${poll.support.toFixed(1)}%` }}></div></div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="workspace-side">
                <section className="quant-card ai-card">
                  <div className="card-headline compact">
                    <div>
                      <div className="card-kicker">AI REASONING CHAIN</div>
                      <h3 className="card-title">AI 选情逻辑链</h3>
                    </div>
                    <div className={`decision-pill ${detail.recommendation.tone}`}>{detail.recommendation.action}</div>
                  </div>
                  <div className="reasoning-list">
                    {detail.reasoning.steps.map((step) => (
                      <div className="reasoning-row" key={step.code}>
                        <div className="reasoning-step">{step.code}</div>
                        <div className="reasoning-body">
                          <div className="reasoning-head">
                            <strong>{step.title}</strong>
                            <span>{step.strength}</span>
                          </div>
                          <div className="reasoning-verdict">{step.verdict}</div>
                          <p>{step.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={`quant-card signal-card signal-stack ${signalState?.tone || "calm"}${Math.abs(toNumber(selectedOpportunity.divergence)) >= 5 ? " hot" : ""}`}>
                  <div className="card-headline compact">
                    <div>
                      <div className="card-kicker">TRADE PLAYBOOK</div>
                      <h3 className="card-title">量化执行摘要</h3>
                    </div>
                    <Badge className={`signal-pill ${signalState?.tone || "calm"}`} variant="outline">{signalState?.label}</Badge>
                  </div>
                  <div className="playbook-copy">{signalState?.summary}</div>
                  <div className="playbook-list">
                    <div className="playbook-row">
                      <span>主交易动作</span>
                      <strong>{detail.recommendation.action}</strong>
                    </div>
                    <div className="playbook-row">
                      <span>候选人领先差</span>
                      <strong>{detail.candidateInsights.leaderGap.toFixed(1)}pt</strong>
                    </div>
                    <div className="playbook-row">
                      <span>跨所价差</span>
                      <strong>{formatSignedPercent(detail.kalshiProb - detail.marketProb)}</strong>
                    </div>
                    <div className="playbook-row">
                      <span>重点观察</span>
                      <strong>{detail.catalysts[0]?.time || "实时"}</strong>
                    </div>
                  </div>
                </section>

                <section className="quant-card meta-card">
                  <div className="card-headline compact">
                    <div>
                      <div className="card-kicker">ELECTION DOSSIER</div>
                      <h3 className="card-title">选举情况总览</h3>
                    </div>
                  </div>
                  <p className="detail-description">{buildInsightText(selectedOpportunity, detail)}</p>
                  <div className="detail-meta-grid">
                    <div className="meta-stat"><div className="meta-stat-label">融合概率</div><div className="meta-stat-value">{formatPercent(detail.pebProb)}</div></div>
                    <div className="meta-stat"><div className="meta-stat-label">主市场概率</div><div className="meta-stat-value">{formatPercent(detail.marketProb)}</div></div>
                    <div className="meta-stat"><div className="meta-stat-label">当前主导结果</div><div className="meta-stat-value small">{safeOutcome(selectedOpportunity)}</div></div>
                    <div className="meta-stat"><div className="meta-stat-label">倒计时</div><div className="meta-stat-value small">{selectedOpportunity.time_label_zh || selectedOpportunity.time_label || "实时"}</div></div>
                  </div>
                  <div className="detail-info-list">
                    <div className="detail-info-row"><span className="detail-info-label">市场结构</span><span className="detail-info-value">{detail.candidateInsights.structureLabel}</span></div>
                    <div className="detail-info-row"><span className="detail-info-label">领先优势</span><span className="detail-info-value">{detail.candidateInsights.leader.name} 领先 {detail.candidateInsights.leaderGap.toFixed(1)}pt</span></div>
                    <div className="detail-info-row"><span className="detail-info-label">市场问题</span><span className="detail-info-value">{buildQuestionText(selectedOpportunity)}</span></div>
                    <div className="detail-info-row"><span className="detail-info-label">24h 成交额</span><span className="detail-info-value">{selectedOpportunity.volume_24h_label || "--"}</span></div>
                    <div className="detail-info-row"><span className="detail-info-label">流动性</span><span className="detail-info-value">{selectedOpportunity.liquidity_label || "--"}</span></div>
                    <div className="detail-info-row"><span className="detail-info-label">预计结算</span><span className="detail-info-value">{formatEndDate(selectedOpportunity.end_date)}</span></div>
                  </div>
                </section>

                <section className="quant-card catalyst-card">
                  <div className="card-headline compact">
                    <div>
                      <div className="card-kicker">EVENT CATALYSTS</div>
                      <h3 className="card-title">关键事件冲击点</h3>
                    </div>
                  </div>
                  <div className="timeline-list">
                    {detail.catalysts.map((item) => (
                      <div className="catalyst-row" key={item.label}>
                        <div className="catalyst-label">{item.label}</div>
                        <div className="catalyst-body">
                          <div className="catalyst-head">
                            <strong>{item.title}</strong>
                            <span>{item.time}</span>
                          </div>
                          <p>{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <Separator className="workspace-separator" />
                <div className="detail-actions">
                  <Button
                    className="card-link"
                    render={<a href={selectedOpportunity.url || "#"} target="_blank" rel="noreferrer" />}
                  >
                    打开 Polymarket
                  </Button>
                  <Button className="card-link secondary" type="button" variant="outline" onClick={() => setSelectedOpportunity(null)}>
                    关闭看板
                  </Button>
                </div>
              </aside>
            </div>
              </section>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
