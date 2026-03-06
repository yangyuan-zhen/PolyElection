(function () {
  const dashboardUrl = "/api/dashboard";

  const state = {
    opportunities: [],
    activeFilter: "all",
    sortMode: "volume",
    searchTerm: "",
    highlightedId: null,
    selectedOpportunity: null,
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
    detailDescription: document.getElementById("detailDescription"),
    detailPebProb: document.getElementById("detailPebProb"),
    detailMarketProb: document.getElementById("detailMarketProb"),
    detailSpread: document.getElementById("detailSpread"),
    detailOutcome: document.getElementById("detailOutcome"),
    detailQuestion: document.getElementById("detailQuestion"),
    detailVolume: document.getElementById("detailVolume"),
    detailLiquidity: document.getElementById("detailLiquidity"),
    detailEndDate: document.getElementById("detailEndDate"),
    detailTimeLabel: document.getElementById("detailTimeLabel"),
    detailInsight: document.getElementById("detailInsight"),
    detailOpenLink: document.getElementById("detailOpenLink"),
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
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength).trim()}...`;
  }

  function formatPercent(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return `${numeric.toFixed(1)}%`;
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
    const fallbackActive = Array.isArray(opportunities) ? opportunities.length : 0;
    const activeElections = Number(stats?.active_elections);
    const pollSources = Number(stats?.poll_sources);
    const signals = Number(stats?.arbitrage_signals);

    elements.activeElectionsValue.textContent = Number.isFinite(activeElections)
      ? String(activeElections)
      : String(fallbackActive);
    elements.pollSourcesValue.textContent = Number.isFinite(pollSources)
      ? String(pollSources)
      : "--";
    elements.signalsValue.textContent = Number.isFinite(signals)
      ? String(signals)
      : "--";
    elements.lastUpdatedText.textContent = formatDateTime(stats?.last_updated);
  }

  function passesFilter(event) {
    if (state.activeFilter === "spread") {
      return Math.abs(Number(event?.divergence)) >= 5;
    }
    if (state.activeFilter === "closing") {
      return String(event?.time_label_zh || "").includes("天") === false || Number(event?.days_left) <= 30;
    }
    if (state.activeFilter === "volume") {
      return Number(event?.volume_24h || 0) >= 100000;
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
    const list = [...events];

    list.sort((a, b) => {
      if (state.sortMode === "spread") {
        return Math.abs(Number(b?.divergence || 0)) - Math.abs(Number(a?.divergence || 0));
      }
      if (state.sortMode === "close") {
        const aDays = Number(a?.days_left ?? 999999);
        const bDays = Number(b?.days_left ?? 999999);
        return aDays - bDays;
      }
      if (state.sortMode === "liquidity") {
        return Number(b?.liquidity || 0) - Number(a?.liquidity || 0);
      }
      return Number(b?.volume_24h || 0) - Number(a?.volume_24h || 0);
    });

    return list;
  }

  function getVisibleOpportunities() {
    return sortOpportunities(state.opportunities).filter(
      (event) => passesFilter(event) && passesSearch(event),
    );
  }

  function cardMetaRow(label, value, extraClass) {
    return [
      `<span class="meta-chip ${extraClass || ""}">`,
      `<span class="meta-chip-label">${escapeHtml(label)}</span>`,
      `<span class="meta-chip-value">${escapeHtml(value)}</span>`,
      "</span>",
    ].join("");
  }

  function renderOpportunities() {
    const visible = getVisibleOpportunities();
    setSummaryText(visible.length, state.opportunities.length);

    if (visible.length === 0) {
      elements.opportunitiesGrid.innerHTML = [
        '<div class="empty-state">',
        "<strong>没有符合当前条件的市场。</strong>",
        "<p>试试调整筛选条件或搜索关键词。</p>",
        "</div>",
      ].join("");
      return;
    }

    elements.opportunitiesGrid.innerHTML = visible
      .map((event, index) => {
        const title = escapeHtml(event?.title_zh || event?.title || "未命名事件");
        const description = escapeHtml(
          truncate(event?.description_zh || event?.description || "暂无描述", 120),
        );
        const pebProb = formatPercent(event?.peb_prob, "--");
        const marketPrice = formatPercent(event?.market_price, "--");
        const divergenceText = formatSignedPercent(event?.divergence);
        const hasMarkets = Boolean(event?.has_markets);
        const directionIcon = Number(event?.divergence) > 0 ? "trending_up" : "trending_down";
        const highlightClass = Math.abs(Number(event?.divergence || 0)) > 5 ? "highlight" : "";
        const cardClass = state.highlightedId === event?.id ? "highlighted-card" : "";
        const metaChips = [
          cardMetaRow("主导结果", event?.outcome_label_zh || event?.outcome_label || "--"),
          cardMetaRow("24h 成交", event?.volume_24h_label || "--"),
          cardMetaRow("流动性", event?.liquidity_label || "--"),
          cardMetaRow("结算", event?.time_label_zh || event?.time_label || "实时"),
        ].join("");

        return [
          `<article class="election-card ${cardClass}" data-event-id="${escapeHtml(event?.id)}" style="animation-delay:${index * 70}ms">`,
          `<span class="card-tag">Polymarket 事件 #${index + 1}</span>`,
          `<h3 class="election-title">${title}</h3>`,
          `<p class="card-description">${description}</p>`,
          `<div class="card-meta-row">${metaChips}</div>`,
          hasMarkets
            ? [
                '<div class="data-viz">',
                '<div class="viz-item">',
                '<div class="label">融合概率</div>',
                `<div class="value">${pebProb}</div>`,
                "</div>",
                '<div class="viz-divider"></div>',
                '<div class="viz-item">',
                '<div class="label">主市场概率</div>',
                `<div class="value market">${marketPrice}</div>`,
                "</div>",
                "</div>",
                `<div class="arbitrage-pill ${highlightClass}">`,
                `<span class="material-icons-round" style="font-size:1.2rem;">${directionIcon}</span>`,
                `市场价差: <span style="font-weight:800;">${divergenceText}</span>`,
                "</div>",
              ].join("")
            : '<div class="market-loading">正在获取市场报价...</div>',
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
        "<p>后端还没有返回情报摘要。</p>",
        "</div>",
      ].join("");
      return;
    }

    elements.newsFeed.innerHTML = newsItems
      .map((item) => {
        const title = escapeHtml(item?.title || "未命名情报");
        const impact = escapeHtml(item?.impact || "暂无影响分析");
        return [
          `<button class="news-card news-card-button" type="button" data-match-title="${title}">`,
          '<div class="news-meta">',
          `<span class="news-tag">${escapeHtml(item?.tag || "情报")}</span>`,
          `<span class="news-time">${escapeHtml(item?.time || "--")}</span>`,
          "</div>",
          `<div class="news-title">${title}</div>`,
          '<div class="impact-label">',
          '<span class="material-icons-round" style="font-size:1rem;">insights</span>',
          impact,
          "</div>",
          "</button>",
        ].join("");
      })
      .join("");
  }

  function renderCountdown(countdownItems) {
    if (!Array.isArray(countdownItems) || countdownItems.length === 0) {
      elements.countdownList.innerHTML = [
        '<div class="countdown-row">',
        "<span>暂无可展示的选举倒计时</span>",
        '<span class="countdown-value">--</span>',
        "</div>",
      ].join("");
      return;
    }

    elements.countdownList.innerHTML = countdownItems
      .map((item) => {
        const title = escapeHtml(item?.title_zh || item?.title || "未命名市场");
        const label = escapeHtml(item?.label || "--");
        return [
          `<button class="countdown-row countdown-button" type="button" data-match-title="${title}">`,
          `<span>${title}</span>`,
          `<span class="countdown-value">${label}</span>`,
          "</button>",
        ].join("");
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
    }
  }

  function buildInsightText(event) {
    const spread = Number(event?.divergence || 0);
    const spreadText =
      spread >= 5
        ? "市场分歧较大，适合重点跟踪。"
        : spread <= -5
          ? "主市场价格明显高于融合值，存在重新定价风险。"
          : "主市场和融合值相对接近，短线偏稳定。";

    const endText =
      String(event?.time_label_zh || "").includes("天") && Number(event?.days_left) > 30
        ? "距离结算仍有一定时间，价格可能继续波动。"
        : "该市场结算时间较近，消息面对价格影响会更直接。";

    return `${spreadText} 当前主导结果为「${event?.outcome_label_zh || event?.outcome_label || "--"}」，主市场概率 ${formatPercent(event?.market_price, "--")}，融合概率 ${formatPercent(event?.peb_prob, "--")}。${endText}`;
  }

  function openDetailModal(event) {
    state.selectedOpportunity = event;

    elements.detailTitle.textContent = event?.title_zh || event?.title || "未命名市场";
    elements.detailDescription.textContent =
      event?.description_zh || event?.description || "暂无市场描述。";
    elements.detailPebProb.textContent = formatPercent(event?.peb_prob, "--");
    elements.detailMarketProb.textContent = formatPercent(event?.market_price, "--");
    elements.detailSpread.textContent = formatSignedPercent(event?.divergence);
    elements.detailOutcome.textContent =
      event?.outcome_label_zh || event?.outcome_label || "--";
    elements.detailQuestion.textContent =
      event?.market_question_zh || event?.market_question || "暂无补充问题";
    elements.detailVolume.textContent = event?.volume_24h_label || "--";
    elements.detailLiquidity.textContent = event?.liquidity_label || "--";
    elements.detailEndDate.textContent = formatEndDate(event?.end_date);
    elements.detailTimeLabel.textContent = event?.time_label_zh || event?.time_label || "实时";
    elements.detailInsight.textContent = buildInsightText(event);

    if (event?.url) {
      elements.detailOpenLink.href = event.url;
      elements.detailOpenLink.classList.remove("disabled");
    } else {
      elements.detailOpenLink.href = "#";
      elements.detailOpenLink.classList.add("disabled");
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
        const match = state.opportunities.find((item) => item.id === card.dataset.eventId);
        if (match) {
          openDetailModal(match);
        }
      }
    });

    elements.detailCloseButton.addEventListener("click", closeDetailModal);
    elements.detailCloseSecondary.addEventListener("click", closeDetailModal);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.detailModal.classList.contains("hidden")) {
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
        throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
      }

      const opportunities = payload?.data?.opportunities || [];
      const intelligence = payload?.data?.intelligence || [];
      const stats = payload?.data?.stats || {};
      const countdown = payload?.data?.countdown || [];

      clearError();
      state.opportunities = opportunities.map((item) => {
        const timeLabel = String(item?.time_label_zh || item?.time_label || "");
        const daysLeftMatch = timeLabel.match(/^(\d+)/);
        return {
          ...item,
          days_left: daysLeftMatch ? Number(daysLeftMatch[1]) : 999999,
        };
      });

      renderStats(stats, opportunities);
      renderOpportunities();
      renderNews(intelligence);
      renderCountdown(countdown);
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
