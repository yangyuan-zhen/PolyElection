(function () {
  const dashboardUrl = "/api/dashboard";

  const elements = {
    activeElectionsValue: document.getElementById("activeElectionsValue"),
    pollSourcesValue: document.getElementById("pollSourcesValue"),
    signalsValue: document.getElementById("signalsValue"),
    opportunitiesGrid: document.getElementById("opportunitiesGrid"),
    newsFeed: document.getElementById("newsFeed"),
    errorBanner: document.getElementById("errorBanner"),
    syncStatusText: document.getElementById("syncStatusText"),
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
  }

  function renderOpportunities(opportunities) {
    if (!Array.isArray(opportunities) || opportunities.length === 0) {
      elements.opportunitiesGrid.innerHTML = [
        '<div class="empty-state">',
        "<strong>暂无可展示的市场机会。</strong>",
        "<p>后端还没有返回有效事件数据，稍后再试。</p>",
        "</div>",
      ].join("");
      return;
    }

    elements.opportunitiesGrid.innerHTML = opportunities
      .map((event, index) => {
        const title = escapeHtml(event?.title || "未命名事件");
        const description = escapeHtml(truncate(event?.description || "暂无描述", 120));
        const pebProb = formatPercent(event?.peb_prob, "--");
        const marketPrice = formatPercent(event?.market_price, "--");
        const divergence = Number(event?.divergence);
        const hasMarkets = Boolean(event?.has_markets);
        const divergenceText = formatSignedPercent(divergence);
        const directionIcon = divergence > 0 ? "trending_up" : "trending_down";
        const highlightClass = Math.abs(divergence) > 5 ? "highlight" : "";

        return [
          `<article class="election-card" style="animation-delay:${index * 90}ms">`,
          `<span class="card-tag">Polymarket 事件 #${index + 1}</span>`,
          `<h3 class="election-title">${title}</h3>`,
          `<p class="card-description">${description}</p>`,
          hasMarkets
            ? [
                '<div class="data-viz">',
                '<div class="viz-item">',
                '<div class="label">PEB 融合概率</div>',
                `<div class="value">${pebProb}</div>`,
                "</div>",
                '<div class="viz-divider"></div>',
                '<div class="viz-item">',
                '<div class="label">市场定价概率</div>',
                `<div class="value market">${marketPrice}</div>`,
                "</div>",
                "</div>",
                `<div class="arbitrage-pill ${highlightClass}">`,
                `<span class="material-icons-round" style="font-size:1.2rem;">${directionIcon}</span>`,
                `PEB 偏离信号: <span style="font-weight:800;">${divergenceText}</span>`,
                "</div>",
              ].join("")
            : '<div class="market-loading">正在获取市场报价...</div>',
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
        const tag = escapeHtml(item?.tag || "情报");
        const time = escapeHtml(item?.time || "--");
        const title = escapeHtml(item?.title || "未命名情报");
        const impact = escapeHtml(item?.impact || "暂无影响分析");

        return [
          '<div class="news-card">',
          '<div class="news-meta">',
          `<span class="news-tag">${tag}</span>`,
          `<span class="news-time">${time}</span>`,
          "</div>",
          `<div class="news-title">${title}</div>`,
          '<div class="impact-label">',
          '<span class="material-icons-round" style="font-size:1rem;">insights</span>',
          impact,
          "</div>",
          "</div>",
        ].join("");
      })
      .join("");
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

      clearError();
      renderStats(stats, opportunities);
      renderOpportunities(opportunities);
      renderNews(intelligence);
    } catch (error) {
      renderStats({}, []);
      renderOpportunities([]);
      renderNews([]);
      setError(`仪表盘数据加载失败: ${String(error)}`);
      console.error(error);
    }
  }

  loadDashboard();
})();
