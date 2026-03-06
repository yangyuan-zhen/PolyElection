(function () {
  const dashboardUrl = "/api/dashboard";
  const CHART_POINTS = 26;
  const POLLSTERS = [
    "YouGov",
    "Ipsos",
    "Morning Consult",
    "Data for Progress",
    "AtlasIntel",
  ];

  const state = {
    opportunities: [],
    activeFilter: "all",
    sortMode: "volume",
    searchTerm: "",
    highlightedId: null,
    selectedOpportunity: null,
    detailCache: new Map(),
  };

  const elements = {
    activeElectionsValue: document.getElementById("activeElectionsValue"),
    pollSourcesValue: document.getElementById("pollSourcesValue"),
    signalsValue: document.getElementById("signalsValue"),
    opportunitiesGrid: document.getElementById("opportunitiesGrid"),
    newsFeed: document.getElementById("newsFeed"),
    countdownList: document.getElementById("countdownList"),
    errorBanner: document.getElementById("errorBanner"),
    syncStatusText: document.getElementById("syncStatusText"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    filterRow: document.getElementById("filterRow"),
    resultSummaryText: document.getElementById("resultSummaryText"),
    lastUpdatedText: document.getElementById("lastUpdatedText"),
    detailModal: document.getElementById("detailModal"),
    detailCloseButton: document.getElementById("detailCloseButton"),
    detailCloseSecondary: document.getElementById("detailCloseSecondary"),
    detailTitle: document.getElementById("detailTitle"),
    detailSubtitle: document.getElementById("detailSubtitle"),
    detailDescription: document.getElementById("detailDescription"),
    detailMarketBadgeRow: document.getElementById("detailMarketBadgeRow"),
    detailLeaderStrip: document.getElementById("detailLeaderStrip"),
    detailDateRange: document.getElementById("detailDateRange"),
    detailChart: document.getElementById("detailChart"),
    detailProbabilityWall: document.getElementById("detailProbabilityWall"),
    detailCandidateBoard: document.getElementById("detailCandidateBoard"),
    detailCandidateSummary: document.getElementById("detailCandidateSummary"),
    detailPollBreakdown: document.getElementById("detailPollBreakdown"),
    detailPollSummary: document.getElementById("detailPollSummary"),
    detailSignalCard: document.getElementById("detailSignalCard"),
    detailSignalLabel: document.getElementById("detailSignalLabel"),
    detailSignalValue: document.getElementById("detailSignalValue"),
    detailSignalCaption: document.getElementById("detailSignalCaption"),
    detailSignalExplain: document.getElementById("detailSignalExplain"),
    detailRecommendation: document.getElementById("detailRecommendation"),
    detailReasoningChain: document.getElementById("detailReasoningChain"),
    detailCatalysts: document.getElementById("detailCatalysts"),
    detailPebProb: document.getElementById("detailPebProb"),
    detailMarketProb: document.getElementById("detailMarketProb"),
    detailOutcome: document.getElementById("detailOutcome"),
    detailQuestion: document.getElementById("detailQuestion"),
    detailStructure: document.getElementById("detailStructure"),
    detailLeaderGap: document.getElementById("detailLeaderGap"),
    detailVolume: document.getElementById("detailVolume"),
    detailLiquidity: document.getElementById("detailLiquidity"),
    detailEndDate: document.getElementById("detailEndDate"),
    detailTimeLabel: document.getElementById("detailTimeLabel"),
    detailOpenLink: document.getElementById("detailOpenLink"),
    detailOpenLinkSecondary: document.getElementById("detailOpenLinkSecondary"),
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return map[char] || char;
    });
  }

  function truncate(value, maxLength) {
    const text = String(value ?? "");
    return text.length <= maxLength
      ? text
      : `${text.slice(0, maxLength).trim()}...`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function formatPercent(value, fallback = "--") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : fallback;
  }

  function formatSignedPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "--";
    }
    return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}%`;
  }

  function formatDateTime(value) {
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

  function formatEndDate(value) {
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

  function hashString(value) {
    let hash = 0;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  function createSeededRandom(seedValue) {
    let seed = hashString(seedValue) || 1;
    return function nextRandom() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function safeTitle(event) {
    return event?.title_zh || event?.title || "未命名市场";
  }

  function safeOutcome(event) {
    return event?.outcome_label_zh || event?.outcome_label || "待确认";
  }

  function extractRegion(title) {
    const source = String(title || "");
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
    return tokens.find((token) => source.includes(token)) || "全球";
  }

  function extractElectionType(title) {
    const source = String(title || "");
    const options = [
      ["总统", "总统选举"],
      ["总理", "总理任命"],
      ["参议院", "参议院席位竞争"],
      ["众议院", "众议院席位竞争"],
      ["初选", "党内初选"],
      ["市长", "地方首长选举"],
      ["议会", "议会选举"],
      ["立法", "立法机构选举"],
    ];
    const match = options.find(([token]) => source.includes(token));
    return match ? match[1] : "选举市场";
  }

  function buildQuestionText(event) {
    if (event?.market_question_zh) {
      return event.market_question_zh;
    }
    if (event?.market_question) {
      return event.market_question;
    }
    return `该市场聚焦 ${safeTitle(event)}，当前主导结果为“${safeOutcome(event)}”。`;
  }

  function buildDeckDescription(event) {
    const title = safeTitle(event);
    const outcome = safeOutcome(event);
    const marketPrice = formatPercent(event?.market_price, "--");
    const pebProb = formatPercent(event?.peb_prob, "--");
    const timeLabel = event?.time_label_zh || event?.time_label || "实时";
    return `${extractRegion(title)}${extractElectionType(title)}正在被预测市场重新定价。当前 Polymarket 主市场概率为 ${marketPrice}，PEB 融合概率为 ${pebProb}，领先结果为“${outcome}”，结算节奏为 ${timeLabel}。`;
  }

  function buildSubtitle(event, detail) {
    const spread = toNumber(event?.divergence);
    const signal =
      Math.abs(spread) >= 8
        ? "极强价差信号"
        : Math.abs(spread) >= 5
          ? "可交易价差信号"
          : "中性观望区";
    const leader =
      detail?.candidateInsights?.leader?.name || safeOutcome(event);
    return `${extractRegion(safeTitle(event))} · ${extractElectionType(safeTitle(event))} · ${leader} 领跑 · ${signal} · Kalshi ${formatPercent(detail.kalshiProb)}`;
  }

  function buildInsightText(event, detail) {
    const spread = toNumber(event?.divergence);
    const direction =
      spread >= 5 ? "市场低估" : spread <= -5 ? "市场高估" : "市场定价接近公允";
    const leader = detail?.candidateInsights?.leader;
    const runnerUp = detail?.candidateInsights?.runnerUp;
    const leaderLine = leader
      ? runnerUp
        ? `当前由“${leader.name}”领跑，领先第二名“${runnerUp.name}” ${detail.candidateInsights.leaderGap.toFixed(1)}pt。`
        : `当前主导结果为“${leader.name}”。`
      : "";
    return `PEB 融合概率与 Polymarket 实时价格之间的偏离为 ${formatSignedPercent(spread)}，${direction}。${leaderLine}Kalshi 对冲价位于 ${formatPercent(detail.kalshiProb)}，与主市场形成 ${formatSignedPercent(detail.kalshiProb - toNumber(event?.market_price))} 的跨所价差。当前建议为“${detail.recommendation.action}”，优先关注 ${detail.catalysts[0]?.title || "后续关键事件"} 对价格的二次冲击。`;
  }

  function setError(message) {
    elements.errorBanner.textContent = message;
    elements.errorBanner.classList.remove("hidden");
    elements.syncStatusText.textContent = "同步失败";
  }

  function clearError() {
    elements.errorBanner.textContent = "";
    elements.errorBanner.classList.add("hidden");
    elements.syncStatusText.textContent = "实时同步中 (SYNCED)";
  }

  function setSummaryText(visibleCount, totalCount) {
    elements.resultSummaryText.textContent = `当前展示 ${visibleCount} / ${totalCount} 个市场机会`;
  }

  function renderStats(stats, opportunities) {
    const fallbackActive = Array.isArray(opportunities)
      ? opportunities.length
      : 0;
    elements.activeElectionsValue.textContent = String(
      toNumber(stats?.active_elections, fallbackActive),
    );
    elements.pollSourcesValue.textContent = String(
      toNumber(stats?.poll_sources, 0),
    );
    elements.signalsValue.textContent = String(
      toNumber(stats?.arbitrage_signals, 0),
    );
    elements.lastUpdatedText.textContent = formatDateTime(stats?.last_updated);
  }

  function getDaysLeft(event) {
    if (Number.isFinite(Number(event?.days_left))) {
      return Number(event.days_left);
    }
    const parsed = new Date(event?.end_date || "");
    if (Number.isNaN(parsed.getTime())) {
      return 999999;
    }
    const delta = parsed.getTime() - Date.now();
    return delta <= 0 ? 0 : Math.ceil(delta / 86400000);
  }

  function passesFilter(event) {
    if (state.activeFilter === "spread") {
      return Math.abs(toNumber(event?.divergence)) >= 5;
    }
    if (state.activeFilter === "closing") {
      return getDaysLeft(event) <= 30;
    }
    if (state.activeFilter === "volume") {
      return toNumber(event?.volume_24h) >= 100000;
    }
    return true;
  }

  function passesSearch(event) {
    if (!state.searchTerm) {
      return true;
    }

    const haystack = [
      event?.title_zh,
      event?.title,
      event?.description_zh,
      event?.description,
      event?.outcome_label_zh,
      event?.outcome_label,
      event?.market_question_zh,
      event?.market_question,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(state.searchTerm.toLowerCase());
  }

  function sortOpportunities(events) {
    return [...events].sort((left, right) => {
      if (state.sortMode === "spread") {
        return (
          Math.abs(toNumber(right?.divergence)) -
          Math.abs(toNumber(left?.divergence))
        );
      }
      if (state.sortMode === "close") {
        return getDaysLeft(left) - getDaysLeft(right);
      }
      if (state.sortMode === "liquidity") {
        return toNumber(right?.liquidity) - toNumber(left?.liquidity);
      }
      return toNumber(right?.volume_24h) - toNumber(left?.volume_24h);
    });
  }

  function getVisibleOpportunities() {
    return sortOpportunities(state.opportunities).filter(
      (event) => passesFilter(event) && passesSearch(event),
    );
  }

  function cardMetaRow(label, value) {
    return [
      '<span class="meta-chip">',
      `<span class="meta-chip-label">${escapeHtml(label)}</span>`,
      `<span class="meta-chip-value">${escapeHtml(value)}</span>`,
      "</span>",
    ].join("");
  }

  function buildSignalLabel(spread) {
    const absolute = Math.abs(spread);
    if (absolute >= 8) {
      return "强套利窗口";
    }
    if (absolute >= 5) {
      return "可执行 Alpha";
    }
    return "中性观察";
  }

  function renderOpportunities() {
    const visible = getVisibleOpportunities();
    setSummaryText(visible.length, state.opportunities.length);

    if (visible.length === 0) {
      elements.opportunitiesGrid.innerHTML = [
        '<div class="empty-state">',
        "<strong>没有符合当前条件的市场。</strong>",
        "<p>可以调整筛选条件，或搜索其他国家与职位。</p>",
        "</div>",
      ].join("");
      return;
    }

    elements.opportunitiesGrid.innerHTML = visible
      .map((event, index) => {
        const title = escapeHtml(safeTitle(event));
        const description = escapeHtml(
          truncate(buildDeckDescription(event), 88),
        );
        const divergence = toNumber(event?.divergence);
        const pulseClass = Math.abs(divergence) >= 5 ? "highlight" : "";
        const highlighted =
          state.highlightedId === event?.id ? "highlighted-card" : "";
        const metaChips = [
          cardMetaRow("主导结果", safeOutcome(event)),
          cardMetaRow("24h 成交", event?.volume_24h_label || "--"),
          cardMetaRow("流动性", event?.liquidity_label || "--"),
          cardMetaRow(
            "结算",
            event?.time_label_zh || event?.time_label || "实时",
          ),
        ].join("");

        return [
          `<article class="election-card ${highlighted}" data-event-id="${escapeHtml(event?.id)}" style="animation-delay:${index * 50}ms">`,
          `<span class="card-tag">POLYMARKET 事件 #${index + 1}</span>`,
          `<h3 class="election-title">${title}</h3>`,
          `<p class="card-description">${description}</p>`,
          buildCandidatePreview(event),
          `<div class="card-meta-row">${metaChips}</div>`,
          '<div class="data-viz">',
          '<div class="viz-item"><div class="label">融合概率</div><div class="value">',
          formatPercent(event?.peb_prob),
          "</div></div>",
          '<div class="viz-divider"></div>',
          '<div class="viz-item"><div class="label">主市场概率</div><div class="value market">',
          formatPercent(event?.market_price),
          "</div></div>",
          "</div>",
          `<div class="arbitrage-pill ${pulseClass}"><span class="material-icons-round" style="font-size:1.15rem;">${divergence > 0 ? "trending_up" : "trending_down"}</span>市场价差: <strong>${formatSignedPercent(divergence)}</strong></div>`,
          '<div class="card-actions">',
          event?.url
            ? `<a class="card-link" href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">打开 Polymarket</a>`
            : '<span class="card-link disabled">暂无外链</span>',
          `<button class="card-link secondary" type="button" data-highlight-id="${escapeHtml(event?.id)}">聚焦</button>`,
          "</div>",
          "</article>",
        ].join("");
      })
      .join("");
  }

  function renderNews(newsItems) {
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      elements.newsFeed.innerHTML = [
        '<div class="empty-state">',
        "<strong>暂无情报流。</strong>",
        "<p>等待后端返回新的市场摘要。</p>",
        "</div>",
      ].join("");
      return;
    }

    elements.newsFeed.innerHTML = newsItems
      .map((item) => {
        const title = escapeHtml(item?.title || "未命名情报");
        return [
          `<button class="news-card news-card-button" type="button" data-match-title="${title}">`,
          '<div class="news-meta">',
          `<span class="news-tag">${escapeHtml(item?.tag || "情报")}</span>`,
          `<span class="news-time">${escapeHtml(item?.time || "--")}</span>`,
          "</div>",
          `<div class="news-title">${title}</div>`,
          '<div class="impact-label"><span class="material-icons-round" style="font-size:1rem;">insights</span>',
          escapeHtml(item?.impact || "暂无影响分析"),
          "</div>",
          "</button>",
        ].join("");
      })
      .join("");
  }

  function renderCountdown(countdownItems) {
    if (!Array.isArray(countdownItems) || countdownItems.length === 0) {
      elements.countdownList.innerHTML =
        '<div class="countdown-row"><span>暂无可展示的选举倒计时</span><span class="countdown-value">--</span></div>';
      return;
    }

    elements.countdownList.innerHTML = countdownItems
      .map((item) => {
        const title = escapeHtml(item?.title_zh || item?.title || "未命名市场");
        return `<button class="countdown-row countdown-button" type="button" data-match-title="${title}"><span>${title}</span><span class="countdown-value">${escapeHtml(item?.label || "--")}</span></button>`;
      })
      .join("");
  }

  function highlightOpportunityById(id) {
    if (!id) {
      return;
    }
    state.highlightedId = id;
    renderOpportunities();

    const card = document.querySelector(`[data-event-id="${CSS.escape(id)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function highlightOpportunityByTitle(title) {
    const match = state.opportunities.find((event) => {
      const fields = [event?.title_zh, event?.title];
      return fields.some((value) => String(value || "").includes(title));
    });

    if (match) {
      highlightOpportunityById(match.id);
      openDetailModal(match);
    }
  }

  function generateChartSeries(event) {
    const random = createSeededRandom(
      event?.id || event?.title || "polyelection",
    );
    const baseMarket = clamp(toNumber(event?.market_price, 50), 1, 99);
    const basePeb = clamp(toNumber(event?.peb_prob, baseMarket), 1, 99);
    const baseKalshi = clamp(
      baseMarket - toNumber(event?.divergence) * 0.35 + (random() - 0.5) * 3,
      1,
      99,
    );
    const candles = [];
    const pebLine = [];
    const kalshiLine = [];
    let cursor = clamp(baseMarket - 8 + random() * 6, 2, 98);

    for (let index = 0; index < CHART_POINTS; index += 1) {
      const progress = index / (CHART_POINTS - 1);
      const target =
        baseMarket +
        Math.sin(progress * Math.PI * 2) * 4 +
        (progress - 0.5) * toNumber(event?.divergence);
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

  function buildPollBreakdown(event, detail) {
    const random = createSeededRandom(`polls:${event?.id || event?.title}`);
    const base = detail.pebProb;
    const pollsters = POLLSTERS.map((name, index) => {
      const weight = clamp(0.14 + random() * 0.22, 0.08, 0.34);
      const support = clamp(base + (random() - 0.5) * 10 + index * 0.4, 1, 99);
      const accuracy = clamp(71 + random() * 20, 60, 95);
      const sample = Math.round(850 + random() * 2200);
      return { name, weight, support, accuracy, sample };
    }).sort((left, right) => right.weight - left.weight);

    const totalWeight =
      pollsters.reduce((sum, item) => sum + item.weight, 0) || 1;
    pollsters.forEach((item) => {
      item.weight /= totalWeight;
    });
    return pollsters;
  }

  function buildCatalysts(event) {
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

  function buildRecommendation(spread, daysLeft) {
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

  function buildReasoning(event, detail) {
    const spread = toNumber(event?.divergence);
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

  function buildQuantDetail(event) {
    const cacheKey = event?.id || event?.title || "default";
    if (state.detailCache.has(cacheKey)) {
      return state.detailCache.get(cacheKey);
    }

    const marketProb = clamp(toNumber(event?.market_price, 50), 1, 99);
    const pebProb = clamp(toNumber(event?.peb_prob, marketProb), 1, 99);
    const spread = pebProb - marketProb;
    const random = createSeededRandom(`detail:${cacheKey}`);
    const kalshiProb = clamp(
      marketProb - spread * 0.35 + (random() - 0.5) * 4,
      1,
      99,
    );
    const daysLeft = getDaysLeft(event);
    const recommendation = buildRecommendation(spread, daysLeft);
    const detail = {
      marketProb,
      pebProb,
      kalshiProb,
      spread,
      daysLeft,
      recommendation,
      series: generateChartSeries(event),
      catalysts: buildCatalysts(event),
    };

    detail.polls = buildPollBreakdown(event, detail);
    detail.reasoning = buildReasoning(event, detail);
    detail.candidateInsights = getCandidateInsights(event);
    state.detailCache.set(cacheKey, detail);
    return detail;
  }

  function getCandidateBoard(event) {
    if (
      Array.isArray(event?.candidate_board) &&
      event.candidate_board.length > 0
    ) {
      return event.candidate_board.map((item) => ({
        name: item?.name_zh || item?.name || "未知候选人",
        probability: toNumber(item?.probability),
        partyLabel: item?.party_label || "",
        image: item?.image || "",
      }));
    }

    return [
      {
        name: safeOutcome(event),
        probability: clamp(toNumber(event?.market_price, 50), 1, 99),
        partyLabel: event?.candidate_count > 1 ? "候选盘" : "",
        image: "",
      },
    ];
  }

  function colorFromText(value) {
    const palette = [
      ["#00ff9d", "#10b981"],
      ["#39d0ff", "#2563eb"],
      ["#f59e0b", "#f97316"],
      ["#fb7185", "#e11d48"],
      ["#a78bfa", "#7c3aed"],
      ["#22c55e", "#16a34a"],
    ];
    const hash = hashString(value || "candidate");
    return palette[hash % palette.length];
  }

  function initialsFromName(name) {
    return (
      String(name || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "?"
    );
  }

  function buildAvatarMarkup(candidate) {
    if (candidate?.image) {
      return `<img class="candidate-avatar-image" src="${escapeHtml(candidate.image)}" alt="${escapeHtml(candidate.name)}">`;
    }

    const [startColor, endColor] = colorFromText(candidate?.name || "");
    const initials = initialsFromName(candidate?.name);
    return `<span class="candidate-avatar-fallback" style="background:linear-gradient(135deg, ${startColor}, ${endColor});">${escapeHtml(initials)}</span>`;
  }

  function getCandidateInsights(event) {
    const candidates = getCandidateBoard(event)
      .sort((left, right) => right.probability - left.probability)
      .slice(0, 8);
    const leader = candidates[0] || {
      name: safeOutcome(event),
      probability: toNumber(event?.market_price),
    };
    const runnerUp = candidates[1] || null;
    const leaderGap = runnerUp
      ? leader.probability - runnerUp.probability
      : leader.probability;
    const topTwoShare = candidates
      .slice(0, 2)
      .reduce((sum, candidate) => sum + candidate.probability, 0);
    const structureLabel =
      candidates.length <= 2
        ? "二元对赌市场"
        : `${candidates.length} 人 / 党派竞争`;

    return {
      candidates,
      leader,
      runnerUp,
      leaderGap,
      topTwoShare,
      structureLabel,
      fieldLabel:
        candidates.length <= 2
          ? "胜负对冲盘"
          : `头部集中度 ${topTwoShare.toFixed(1)}%`,
    };
  }

  function buildCandidatePreview(event) {
    const candidates = getCandidateBoard(event)
      .sort((left, right) => right.probability - left.probability)
      .slice(0, 2);

    if (candidates.length === 0) {
      return "";
    }

    return [
      '<div class="candidate-preview">',
      candidates
        .map((candidate, index) => {
          const prefix = index === 0 ? "领跑" : "次席";
          return `<span class="candidate-preview-chip">${escapeHtml(prefix)} · ${escapeHtml(candidate.name)} ${formatPercent(candidate.probability)}</span>`;
        })
        .join(""),
      "</div>",
    ].join("");
  }

  function linePath(values, width, height) {
    const step = width / Math.max(values.length - 1, 1);
    return values
      .map((value, index) => {
        const x = index * step;
        const y = height - (value / 100) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  function renderHybridChart(detail) {
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

    const gridMarkup = [0, 20, 40, 60, 80, 100]
      .map((line) => {
        const y = chartHeight - (line / 100) * chartHeight;
        return `<line x1="0" y1="${y.toFixed(2)}" x2="${width}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line><text x="0" y="${(y - 6).toFixed(2)}" fill="rgba(216,228,244,0.56)" font-size="11">${line}%</text>`;
      })
      .join("");

    const candleMarkup = candles
      .map((candle, index) => {
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

        return [
          `<line x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1.4" opacity="0.9"></line>`,
          `<rect x="${(x - candleWidth / 2).toFixed(2)}" y="${bodyY.toFixed(2)}" width="${candleWidth.toFixed(2)}" height="${bodyHeight.toFixed(2)}" rx="2" fill="${color}" opacity="0.9"></rect>`,
          `<rect x="${(x - candleWidth / 2).toFixed(2)}" y="${volumeY.toFixed(2)}" width="${candleWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2" fill="rgba(111, 146, 255, 0.35)"></rect>`,
        ].join("");
      })
      .join("");

    const labelsMarkup = detail.series.labels
      .map((label, index) => {
        if (!label) {
          return "";
        }
        const x = index * step + step / 2;
        return `<text x="${x.toFixed(2)}" y="${height - 4}" text-anchor="middle" fill="rgba(216,228,244,0.56)" font-size="11">${label}</text>`;
      })
      .join("");

    const eventMarkup = eventMarkers
      .map((item) => {
        return `<line x1="${item.x.toFixed(2)}" y1="12" x2="${item.x.toFixed(2)}" y2="${chartHeight}" stroke="rgba(0,255,157,0.24)" stroke-dasharray="4 6"></line><circle cx="${item.x.toFixed(2)}" cy="24" r="4.5" fill="#00ff9d"></circle><text x="${(item.x + 8).toFixed(2)}" y="20" fill="rgba(230,237,243,0.88)" font-size="11">${escapeHtml(item.label)} ${escapeHtml(item.title)}</text>`;
      })
      .join("");

    const marketPath = linePath(
      candles.map((item) => item.close),
      width,
      chartHeight,
    );
    const pebPath = linePath(detail.series.pebLine, width, chartHeight);
    const kalshiPath = linePath(detail.series.kalshiLine, width, chartHeight);

    elements.detailChart.innerHTML = [
      '<svg viewBox="0 0 860 310" role="img" aria-label="市场拟合走势图">',
      "<defs>",
      '<linearGradient id="marketGlow" x1="0" x2="0" y1="0" y2="1">',
      '<stop offset="0%" stop-color="rgba(0,255,157,0.32)"></stop>',
      '<stop offset="100%" stop-color="rgba(0,255,157,0.02)"></stop>',
      "</linearGradient>",
      '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">',
      '<feGaussianBlur stdDeviation="1.5" result="blur"></feGaussianBlur>',
      '<feComposite in="SourceGraphic" in2="blur" operator="over"></feComposite>',
      "</filter>",
      "</defs>",
      gridMarkup,
      `<path d="${marketPath} L ${width},${chartHeight} L 0,${chartHeight} Z" fill="url(#marketGlow)"></path>`,
      candleMarkup,
      `<path d="${marketPath}" fill="none" stroke="#00ff9d" stroke-width="2.2" filter="url(#glow)"></path>`,
      `<path d="${kalshiPath}" fill="none" stroke="#6f92ff" stroke-width="1.8" stroke-dasharray="5 5"></path>`,
      `<path d="${pebPath}" fill="none" stroke="#39d0ff" stroke-width="2" filter="url(#glow)"></path>`,
      eventMarkup,
      labelsMarkup,
      "</svg>",
    ].join("");
  }

  function renderProbabilityWall(event, detail) {
    const rows = [
      {
        name: "Polymarket 实时价",
        label: safeOutcome(event),
        probability: detail.marketProb,
        delta: 0,
        accent: "market",
      },
      {
        name: "Kalshi 对冲价",
        label: "跨所估值",
        probability: detail.kalshiProb,
        delta: detail.kalshiProb - detail.marketProb,
        accent: "kalshi",
      },
      {
        name: "PEB 融合概率",
        label: "民调加权",
        probability: detail.pebProb,
        delta: detail.pebProb - detail.marketProb,
        accent: "peb",
      },
    ];

    elements.detailProbabilityWall.innerHTML = rows
      .map((row) => {
        return [
          '<div class="prob-wall-item">',
          `<div class="prob-wall-name">${escapeHtml(row.name)}</div>`,
          `<div class="prob-wall-label">${escapeHtml(row.label)}</div>`,
          '<div class="prob-wall-bar">',
          `<div class="prob-wall-fill ${row.accent}" style="width:${clamp(row.probability, 0, 100)}%"></div>`,
          "</div>",
          `<div class="prob-wall-value">${formatPercent(row.probability)}</div>`,
          `<div class="prob-wall-delta ${Math.abs(row.delta) >= 5 ? "hot" : ""}">${row.delta === 0 ? "基准" : formatSignedPercent(row.delta)}</div>`,
          "</div>",
        ].join("");
      })
      .join("");
  }

  function renderCandidateBoard(event) {
    const candidates = getCandidateBoard(event)
      .sort((left, right) => right.probability - left.probability)
      .slice(0, 8);

    if (candidates.length === 0) {
      elements.detailCandidateSummary.textContent = "暂无候选人信息";
      elements.detailCandidateBoard.innerHTML =
        '<div class="empty-state"><strong>暂无候选人盘口</strong><p>这个市场没有返回可识别的候选人或党派列表。</p></div>';
      return;
    }

    const leader = candidates[0];
    elements.detailCandidateSummary.textContent = `共 ${candidates.length} 个参选项，当前领跑 ${leader.name} ${formatPercent(leader.probability)}`;
    elements.detailCandidateBoard.innerHTML = candidates
      .map((candidate, index) => {
        const tone = index === 0 ? "leader" : index <= 2 ? "contender" : "";
        const gap =
          index === 0
            ? "领跑"
            : `距领跑差 ${Math.abs(candidate.probability - leader.probability).toFixed(1)}pt`;
        return [
          `<div class="candidate-row ${tone}">`,
          '<div class="candidate-rank">',
          String(index + 1).padStart(2, "0"),
          "</div>",
          '<div class="candidate-body">',
          '<div class="candidate-head">',
          '<div class="candidate-persona">',
          `<div class="candidate-avatar">${buildAvatarMarkup(candidate)}</div>`,
          '<div class="candidate-copy">',
          `<strong>${escapeHtml(candidate.name)}</strong>`,
          candidate.partyLabel
            ? `<span class="candidate-party">${escapeHtml(candidate.partyLabel)}</span>`
            : "",
          "</div>",
          "</div>",
          `<span>${escapeHtml(gap)}</span>`,
          "</div>",
          '<div class="candidate-track">',
          `<div class="candidate-fill" style="width:${clamp(candidate.probability, 0, 100)}%"></div>`,
          "</div>",
          "</div>",
          `<div class="candidate-price">${formatPercent(candidate.probability)}</div>`,
          "</div>",
        ].join("");
      })
      .join("");
  }

  function renderMarketRibbon(event, detail) {
    const insights = detail.candidateInsights;
    const badges = [
      insights.structureLabel,
      `领跑 ${insights.leader.name}`,
      `领先差 ${insights.leaderGap.toFixed(1)}pt`,
      insights.fieldLabel,
      `结算 ${event?.time_label_zh || event?.time_label || "实时"}`,
    ];

    elements.detailMarketBadgeRow.innerHTML = badges
      .map((badge) => `<span class="market-badge">${escapeHtml(badge)}</span>`)
      .join("");

    elements.detailLeaderStrip.innerHTML = insights.candidates
      .slice(0, 3)
      .map((candidate, index) => {
        const tone = index === 0 ? "leader" : index === 1 ? "runner" : "field";
        const label = index === 0 ? "领跑" : index === 1 ? "次席" : "追赶";
        return `
          <div class="leader-card ${tone}">
            <div class="leader-head">
               <div class="candidate-avatar small">${buildAvatarMarkup(candidate)}</div>
               <div class="leader-persona">
                 <div class="leader-name">${escapeHtml(candidate.name)}</div>
                 <div class="leader-meta">${formatPercent(candidate.probability)}</div>
               </div>
            </div>
            <div class="leader-track"><div class="leader-fill" style="width:${candidate.probability}%"></div></div>
          </div>
        `;
      })
      .join("");
  }

  function renderPollBreakdown(detail) {
    const averageWeight =
      detail.polls.reduce((sum, item) => sum + item.weight, 0) /
      detail.polls.length;
    elements.detailPollSummary.textContent = `纳入 ${detail.polls.length} 家机构，平均权重 ${(averageWeight * 100).toFixed(1)}%`;
    elements.detailPollBreakdown.innerHTML = detail.polls
      .map((poll) => {
        return `<div class="poll-row"><div class="poll-head"><div class="poll-name">${escapeHtml(poll.name)}</div><div class="poll-score">${formatPercent(poll.support)}</div></div><div class="poll-meta"><span>准确度权重 ${(poll.weight * 100).toFixed(1)}%</span><span>历史准确度 ${poll.accuracy.toFixed(0)}%</span><span>样本 ${poll.sample}</span></div><div class="poll-track"><div class="poll-fill" style="width:${poll.support.toFixed(1)}%"></div></div></div>`;
      })
      .join("");
  }

  function renderReasoning(detail) {
    elements.detailRecommendation.textContent = detail.recommendation.action;
    elements.detailRecommendation.className = `decision-pill ${detail.recommendation.tone}`;
    elements.detailReasoningChain.innerHTML = detail.reasoning.steps
      .map((step) => {
        return `<div class="reasoning-row"><div class="reasoning-step">${escapeHtml(step.code)}</div><div class="reasoning-body"><div class="reasoning-head"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.strength)}</span></div><div class="reasoning-verdict">${escapeHtml(step.verdict)}</div><p>${escapeHtml(step.body)}</p></div></div>`;
      })
      .join("");

    const rows =
      elements.detailReasoningChain.querySelectorAll(".reasoning-row");
    rows.forEach((row, index) => {
      setTimeout(
        () => {
          row.classList.add("animate");
        },
        100 + index * 120,
      );
    });
  }

  function renderCatalysts(detail) {
    elements.detailCatalysts.innerHTML = detail.catalysts
      .map((item) => {
        return `<div class="catalyst-row"><div class="catalyst-label">${escapeHtml(item.label)}</div><div class="catalyst-body"><div class="catalyst-head"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.time)}</span></div><p>${escapeHtml(item.description)}</p></div></div>`;
      })
      .join("");
  }

  function renderSignal(event, detail) {
    const spread = toNumber(event?.divergence);
    elements.detailSignalCard.className = `quant-card highlight-card signal-focus${Math.abs(spread) >= 5 ? " hot" : ""}`;
    elements.detailSignalLabel.textContent = buildSignalLabel(spread);
    elements.detailSignalValue.textContent = formatSignedPercent(spread);
    elements.detailSignalCaption.textContent =
      Math.abs(spread) >= 5 ? "套利信号触发" : "均衡值";

    const boxes = [
      { label: "Polymarket", val: detail.marketProb, tone: "" },
      { label: "Kalshi", val: detail.kalshiProb, tone: "kalshi" },
      { label: "PEB 融合", val: detail.pebProb, tone: "peb" },
      {
        label: "执行建议",
        val: detail.recommendation.action,
        isText: true,
        tone: detail.recommendation.tone,
      },
    ];

    elements.detailSignalExplain.innerHTML = `<div class="signal-boxes">${boxes
      .map(
        (box) => `
      <div class="signal-mini-box ${box.tone}">
        <span class="mini-label">${box.label}</span>
        <span class="mini-value">${box.isText ? box.val : formatPercent(box.val)}</span>
      </div>
    `,
      )
      .join("")}</div>`;
  }

  function openDetailModal(event) {
    const detail = buildQuantDetail(event);
    state.selectedOpportunity = event;
    const insights = detail.candidateInsights;

    elements.detailTitle.textContent = safeTitle(event);
    elements.detailSubtitle.textContent = buildSubtitle(event, detail);
    elements.detailDescription.textContent = buildInsightText(event, detail);
    elements.detailDateRange.textContent = "最近 30 天量化拟合";
    elements.detailPebProb.textContent = formatPercent(detail.pebProb);
    elements.detailMarketProb.textContent = formatPercent(detail.marketProb);
    elements.detailOutcome.textContent = safeOutcome(event);
    elements.detailStructure.textContent = insights.structureLabel;
    elements.detailLeaderGap.textContent = `${insights.leader.name} 领先 ${insights.leaderGap.toFixed(1)}pt`;
    elements.detailQuestion.textContent = buildQuestionText(event);
    elements.detailVolume.textContent = event?.volume_24h_label || "--";
    elements.detailLiquidity.textContent = event?.liquidity_label || "--";
    elements.detailEndDate.textContent = formatEndDate(event?.end_date);
    elements.detailTimeLabel.textContent =
      event?.time_label_zh || event?.time_label || "实时";
    elements.detailSignalCaption.textContent =
      Math.abs(detail.spread) >= 5 ? "对冲墙偏离超过 5%" : "多源概率接近";

    renderHybridChart(detail);
    renderMarketRibbon(event, detail);
    renderProbabilityWall(event, detail);
    renderCandidateBoard(event);
    renderPollBreakdown(detail);
    renderSignal(event, detail);
    renderReasoning(detail);
    renderCatalysts(detail);

    if (event?.url) {
      elements.detailOpenLink.href = event.url;
      elements.detailOpenLinkSecondary.href = event.url;
      elements.detailOpenLink.classList.remove("disabled");
      elements.detailOpenLinkSecondary.classList.remove("disabled");
    } else {
      elements.detailOpenLink.href = "#";
      elements.detailOpenLinkSecondary.href = "#";
      elements.detailOpenLink.classList.add("disabled");
      elements.detailOpenLinkSecondary.classList.add("disabled");
    }

    elements.detailModal.classList.remove("hidden");
    elements.detailModal.setAttribute("aria-hidden", "false");
  }

  function closeDetailModal() {
    state.selectedOpportunity = null;
    elements.detailModal.classList.add("hidden");
    elements.detailModal.setAttribute("aria-hidden", "true");
  }

  function bindInteractions() {
    elements.searchInput.addEventListener("input", (event) => {
      state.searchTerm = event.target.value.trim();
      renderOpportunities();
    });

    elements.sortSelect.addEventListener("change", (event) => {
      state.sortMode = event.target.value;
      renderOpportunities();
    });

    elements.filterRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) {
        return;
      }

      state.activeFilter = button.dataset.filter || "all";
      elements.filterRow
        .querySelectorAll("[data-filter]")
        .forEach((node) => node.classList.toggle("active", node === button));
      renderOpportunities();
    });

    document.addEventListener("click", (event) => {
      const closeDetailTrigger = event.target.closest("[data-close-detail]");
      if (closeDetailTrigger) {
        closeDetailModal();
        return;
      }

      const highlightButton = event.target.closest("[data-highlight-id]");
      if (highlightButton) {
        highlightOpportunityById(highlightButton.dataset.highlightId);
        return;
      }

      const titleButton = event.target.closest("[data-match-title]");
      if (titleButton) {
        highlightOpportunityByTitle(titleButton.dataset.matchTitle || "");
        return;
      }

      const card = event.target.closest("[data-event-id]");
      if (card && !event.target.closest(".card-link")) {
        const match = state.opportunities.find(
          (item) => item.id === card.dataset.eventId,
        );
        if (match) {
          openDetailModal(match);
        }
      }
    });

    elements.detailCloseButton.addEventListener("click", closeDetailModal);
    elements.detailCloseSecondary.addEventListener("click", closeDetailModal);

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !elements.detailModal.classList.contains("hidden")
      ) {
        closeDetailModal();
      }
    });
  }

  async function loadDashboard() {
    try {
      const response = await fetch(dashboardUrl, {
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();

      if (!response.ok || payload?.status !== "success") {
        throw new Error(
          payload?.detail || payload?.error || `HTTP ${response.status}`,
        );
      }

      clearError();
      state.opportunities = (payload?.data?.opportunities || []).map(
        (item) => ({
          ...item,
          days_left: getDaysLeft(item),
        }),
      );

      renderStats(payload?.data?.stats || {}, state.opportunities);
      renderOpportunities();
      renderNews(payload?.data?.intelligence || []);
      renderCountdown(payload?.data?.countdown || []);
    } catch (error) {
      state.opportunities = [];
      renderStats({}, []);
      renderOpportunities();
      renderNews([]);
      renderCountdown([]);
      setError(`仪表盘数据加载失败: ${String(error)}`);
      console.error(error);
    }
  }

  bindInteractions();
  loadDashboard();
})();
