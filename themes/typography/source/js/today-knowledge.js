(function (global, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (global && global.document) {
    const start = function () {
      api.initTodayKnowledgePage(global.document, {
        window: global,
        fetch: typeof global.fetch === 'function' ? global.fetch.bind(global) : null,
      });
    };

    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DESKTOP_QUERY = '(min-width: 768px)';
  const WHEEL_THRESHOLD = 40;
  const SWIPE_THRESHOLD = 46;
  const SWIPE_INTENT_THRESHOLD = 12;
  const WHEEL_RESET_DELAY = 160;
  const TRANSITION_LOCK_DELAY = 260;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function getDateParts(date, zone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const values = {};

    parts.forEach(function (part) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });

    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  }

  function getDateKey(date, zone) {
    const parts = getDateParts(date, zone);
    return parts.year + '-' + pad(parts.month) + '-' + pad(parts.day);
  }

  function hashValue(value) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function pickDailyItems(items, limit, date, zone) {
    const seed = getDateKey(date, zone);

    return items
      .slice()
      .sort(function (left, right) {
        const leftScore = hashValue(seed + ':' + left.path);
        const rightScore = hashValue(seed + ':' + right.path);

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        return left.path.localeCompare(right.path, 'zh-CN');
      })
      .slice(0, Math.max(0, Math.floor(limit)));
  }

  function normalizeBlock(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  function joinContentBlocks(blocks) {
    return blocks
      .map(normalizeBlock)
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  function buildPreviewText(value, maxLength) {
    const normalized = normalizeBlock(value).replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
  }

  function buildCardBody(item) {
    if (!item) {
      return '';
    }

    return normalizeBlock(item.body) || joinContentBlocks([item.quote, item.note]) || normalizeBlock(item.content);
  }

  function renderSection(label, className, value) {
    const content = normalizeBlock(value);

    if (!content) {
      return '';
    }

    return (
      '<section class="today-knowledge__section">' +
        '<p class="today-knowledge__section-label">' + label + '</p>' +
        '<p class="' + className + '">' + escapeHtml(content) + '</p>' +
      '</section>'
    );
  }

  function renderDetails(item, bodyText, detailsId) {
    const quoteSection = renderSection('原文摘录', 'today-knowledge__body today-knowledge__body--quote', item.quote);
    const noteSection = renderSection('我的理解', 'today-knowledge__body', item.note);
    const plainSection =
      quoteSection || noteSection
        ? ''
        : '<p class="today-knowledge__body">' + escapeHtml(bodyText || item.content || '暂无内容') + '</p>';

    if (!quoteSection && !noteSection && !plainSection) {
      return '';
    }

    return (
      '<details class="today-knowledge__details" id="' + detailsId + '">' +
        '<summary class="today-knowledge__details-summary">展开正文</summary>' +
        '<div class="today-knowledge__details-body">' +
          quoteSection +
          noteSection +
          plainSection +
        '</div>' +
      '</details>'
    );
  }

  function renderCard(item, index, items) {
    const title = escapeHtml(item.title || '未命名知识点');
    const bodyText = buildCardBody(item) || '暂无内容';
    const previewSource = normalizeBlock(item.desc) || bodyText;
    const preview = escapeHtml(buildPreviewText(previewSource, 120) || '暂无内容');
    const total = Array.isArray(items) ? items.length : index + 1;
    const detailsId = 'today-knowledge-details-' + String(index);
    const details = renderDetails(item, bodyText, detailsId);
    const nextLabel = index >= total - 1 ? '回到第一条' : '下一条';

    return (
      '<article class="today-knowledge__card" data-card-index="' + String(index) + '">' +
        '<div class="today-knowledge__card-top">' +
          '<div class="today-knowledge__card-top-meta">' +
            '<span class="today-knowledge__order">' + pad(index + 1) + '</span>' +
            '<p class="today-knowledge__date">' + escapeHtml((item.date || '').slice(0, 10) || '无日期') + '</p>' +
          '</div>' +
          '<button class="today-knowledge__card-action" type="button" data-role="card-details-toggle" aria-label="展开或收起正文" aria-controls="' + detailsId + '" aria-expanded="false">···</button>' +
        '</div>' +
        '<h2 class="today-knowledge__title">' + title + '</h2>' +
        '<p class="today-knowledge__preview">' + preview + '</p>' +
        details +
        '<footer class="today-knowledge__card-footer">' +
          '<span class="today-knowledge__card-count">' + String(index + 1) + '/' + String(total) + '条笔记</span>' +
          '<button class="today-knowledge__card-next" type="button" data-role="card-next">' + nextLabel + '</button>' +
        '</footer>' +
      '</article>'
    );
  }

  function matchDesktop(envWindow) {
    if (!envWindow || typeof envWindow.matchMedia !== 'function') {
      return false;
    }

    return envWindow.matchMedia(DESKTOP_QUERY).matches;
  }

  function createWheelDeck(app, listNode, statusNode, env) {
    if (!app || !listNode) {
      return {
        destroy: function () {},
        getActiveIndex: function () {
          return 0;
        },
        isDeckEnabled: function () {
          return false;
        },
        syncMode: function () {},
      };
    }

    const envWindow = (env && env.window) || (listNode.ownerDocument && listNode.ownerDocument.defaultView) || null;
    const cards = Array.prototype.slice.call(listNode.querySelectorAll('.today-knowledge__card'));
    const pagerNode = app.querySelector('#today-knowledge-pager');
    const pagerCurrentNode = app.querySelector('#today-knowledge-pager-current');
    const pagerPrevButton = app.querySelector('#today-knowledge-pager-prev');
    const pagerNextButton = app.querySelector('#today-knowledge-pager-next');
    let activeIndex = 0;
    let deckEnabled = false;
    let pagerEnabled = false;
    let wheelDistance = 0;
    let wheelResetTimer = null;
    let transitionLockTimer = null;
    let isTransitionLocked = false;
    let touchStartPoint = null;

    function clearTimer(timerId) {
      if (!timerId) {
        return null;
      }

      const scheduler = envWindow || globalThis;
      scheduler.clearTimeout(timerId);
      return null;
    }

    function updateStatus() {
      if (!statusNode) {
        return;
      }

      if (!deckEnabled) {
        statusNode.hidden = true;
        statusNode.textContent = '';
        return;
      }

      statusNode.hidden = false;
      statusNode.textContent =
        (cards.length > 1 ? '滚轮切换 ' : '今日知识点 ') + pad(activeIndex + 1) + ' / ' + pad(cards.length);
    }

    function updatePager() {
      if (!pagerNode || !pagerCurrentNode) {
        return;
      }

      if (!pagerEnabled) {
        pagerNode.hidden = true;
        pagerCurrentNode.textContent = '';

        if (pagerPrevButton) {
          pagerPrevButton.disabled = true;
        }

        if (pagerNextButton) {
          pagerNextButton.disabled = true;
        }
        return;
      }

      pagerNode.hidden = true;
      pagerCurrentNode.textContent = String(activeIndex + 1) + '/' + String(cards.length);

      if (pagerPrevButton) {
        pagerPrevButton.disabled = activeIndex <= 0;
      }

      if (pagerNextButton) {
        pagerNextButton.disabled = activeIndex >= cards.length - 1;
      }
    }

    function applyActiveCard() {
      if (!deckEnabled && !pagerEnabled) {
        cards.forEach(function (card) {
          card.classList.remove('today-knowledge__card--active');
          card.hidden = false;
          card.removeAttribute('aria-hidden');
          const detailsNode = card.querySelector('.today-knowledge__details');
          const detailsToggle = card.querySelector('[data-role="card-details-toggle"]');

          if (detailsToggle && detailsNode) {
            detailsToggle.setAttribute('aria-expanded', detailsNode.open ? 'true' : 'false');
          }
        });
        listNode.removeAttribute('data-active-index');
        updateStatus();
        updatePager();
        return;
      }

      cards.forEach(function (card, index) {
        const isActive = index === activeIndex;
        const detailsNode = card.querySelector('.today-knowledge__details');
        const detailsToggle = card.querySelector('[data-role="card-details-toggle"]');

        card.classList.toggle('today-knowledge__card--active', isActive);
        card.hidden = pagerEnabled ? !isActive : false;
        card.setAttribute('aria-hidden', isActive ? 'false' : 'true');

        if (detailsNode) {
          if (pagerEnabled) {
            detailsNode.open = isActive;
          }

          if (detailsToggle) {
            detailsToggle.setAttribute('aria-expanded', detailsNode.open ? 'true' : 'false');
          }
        }
      });
      listNode.setAttribute('data-active-index', String(activeIndex));
      updateStatus();
      updatePager();
    }

    function setActiveIndex(nextIndex, force) {
      const boundedIndex = Math.max(0, Math.min(cards.length - 1, nextIndex));

      if (!force && boundedIndex === activeIndex) {
        return false;
      }

      activeIndex = boundedIndex;
      applyActiveCard();
      return true;
    }

    function syncMode() {
      deckEnabled = matchDesktop(envWindow) && cards.length > 0;
      pagerEnabled = !deckEnabled && cards.length > 0;
      app.classList.toggle('today-knowledge--wheel-deck', deckEnabled);
      app.classList.toggle('today-knowledge--mobile-deck', pagerEnabled);
      listNode.classList.toggle('today-knowledge__list--wheel-deck', deckEnabled);
      listNode.classList.toggle('today-knowledge__list--mobile-deck', pagerEnabled);
      activeIndex = Math.max(0, Math.min(cards.length - 1, activeIndex));
      applyActiveCard();
    }

    function unlockTransition() {
      isTransitionLocked = false;
      transitionLockTimer = clearTimer(transitionLockTimer);
    }

    function lockTransition() {
      const scheduler = envWindow || globalThis;
      isTransitionLocked = true;
      transitionLockTimer = clearTimer(transitionLockTimer);
      transitionLockTimer = scheduler.setTimeout(unlockTransition, TRANSITION_LOCK_DELAY);
    }

    function handleWheel(event) {
      if (!deckEnabled || cards.length < 2) {
        return;
      }

      const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

      if (!primaryDelta) {
        return;
      }

      event.preventDefault();

      if (isTransitionLocked) {
        return;
      }

      const scheduler = envWindow || globalThis;
      wheelDistance += primaryDelta;
      wheelResetTimer = clearTimer(wheelResetTimer);
      wheelResetTimer = scheduler.setTimeout(function () {
        wheelDistance = 0;
        wheelResetTimer = null;
      }, WHEEL_RESET_DELAY);

      if (Math.abs(wheelDistance) < WHEEL_THRESHOLD) {
        return;
      }

      const direction = wheelDistance > 0 ? 1 : -1;
      wheelDistance = 0;

      if (setActiveIndex(activeIndex + direction, false)) {
        lockTransition();
      }
    }

    function moveByOffset(offset) {
      if (!pagerEnabled || cards.length < 2) {
        return false;
      }

      return setActiveIndex(activeIndex + offset, false);
    }

    function handlePagerPrev() {
      moveByOffset(-1);
    }

    function handlePagerNext() {
      moveByOffset(1);
    }

    function handleTouchStart(event) {
      if (!pagerEnabled || !event.touches || event.touches.length !== 1) {
        touchStartPoint = null;
        return;
      }

      touchStartPoint = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        axisResolved: false,
        isHorizontal: false,
      };
    }

    function handleTouchMove(event) {
      if (!pagerEnabled || !touchStartPoint || !event.touches || event.touches.length !== 1) {
        return;
      }

      const deltaX = event.touches[0].clientX - touchStartPoint.x;
      const deltaY = event.touches[0].clientY - touchStartPoint.y;

      if (!touchStartPoint.axisResolved) {
        if (Math.abs(deltaX) < SWIPE_INTENT_THRESHOLD && Math.abs(deltaY) < SWIPE_INTENT_THRESHOLD) {
          return;
        }

        touchStartPoint.axisResolved = true;
        touchStartPoint.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      if (touchStartPoint.isHorizontal && event.cancelable) {
        event.preventDefault();
      }
    }

    function handleTouchEnd(event) {
      if (!pagerEnabled || !touchStartPoint || !event.changedTouches || event.changedTouches.length !== 1) {
        touchStartPoint = null;
        return;
      }

      const deltaX = event.changedTouches[0].clientX - touchStartPoint.x;
      const deltaY = event.changedTouches[0].clientY - touchStartPoint.y;
      touchStartPoint = null;

      if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return;
      }

      moveByOffset(deltaX < 0 ? 1 : -1);
    }

    function handleTouchCancel() {
      touchStartPoint = null;
    }

    function handleCardClick(event) {
      const target = event.target;

      if (!target || typeof target.closest !== 'function') {
        return;
      }

      const nextButton = target.closest('[data-role="card-next"]');

      if (nextButton) {
        if (pagerEnabled && cards.length > 1) {
          if (!moveByOffset(1)) {
            setActiveIndex(0, true);
          }
        }
        return;
      }

      const detailsToggle = target.closest('[data-role="card-details-toggle"]');

      if (!detailsToggle) {
        return;
      }

      const parentCard = detailsToggle.closest('.today-knowledge__card');
      const detailsNode = parentCard ? parentCard.querySelector('.today-knowledge__details') : null;

      if (!detailsNode) {
        return;
      }

      detailsNode.open = !detailsNode.open;
      detailsToggle.setAttribute('aria-expanded', detailsNode.open ? 'true' : 'false');
    }

    listNode.addEventListener('wheel', handleWheel, { passive: false });
    listNode.addEventListener('touchstart', handleTouchStart, { passive: true });
    listNode.addEventListener('touchmove', handleTouchMove, { passive: false });
    listNode.addEventListener('touchend', handleTouchEnd, { passive: true });
    listNode.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    listNode.addEventListener('click', handleCardClick);

    if (pagerPrevButton) {
      pagerPrevButton.addEventListener('click', handlePagerPrev);
    }

    if (pagerNextButton) {
      pagerNextButton.addEventListener('click', handlePagerNext);
    }

    if (envWindow) {
      envWindow.addEventListener('resize', syncMode, { passive: true });
    }

    syncMode();

    return {
      destroy: function () {
        wheelResetTimer = clearTimer(wheelResetTimer);
        transitionLockTimer = clearTimer(transitionLockTimer);
        isTransitionLocked = false;
        wheelDistance = 0;
        touchStartPoint = null;
        listNode.removeEventListener('wheel', handleWheel);
        listNode.removeEventListener('touchstart', handleTouchStart);
        listNode.removeEventListener('touchmove', handleTouchMove);
        listNode.removeEventListener('touchend', handleTouchEnd);
        listNode.removeEventListener('touchcancel', handleTouchCancel);
        listNode.removeEventListener('click', handleCardClick);

        if (pagerPrevButton) {
          pagerPrevButton.removeEventListener('click', handlePagerPrev);
        }

        if (pagerNextButton) {
          pagerNextButton.removeEventListener('click', handlePagerNext);
        }

        if (envWindow) {
          envWindow.removeEventListener('resize', syncMode);
        }

        app.classList.remove('today-knowledge--wheel-deck');
        app.classList.remove('today-knowledge--mobile-deck');
        listNode.classList.remove('today-knowledge__list--wheel-deck');
        listNode.classList.remove('today-knowledge__list--mobile-deck');
        deckEnabled = false;
        pagerEnabled = false;
        applyActiveCard();
      },
      getActiveIndex: function () {
        return activeIndex;
      },
      isDeckEnabled: function () {
        return deckEnabled;
      },
      isPagerEnabled: function () {
        return pagerEnabled;
      },
      syncMode: syncMode,
    };
  }

  function initTodayKnowledgePage(root, options) {
    const doc = root && root.getElementById ? root : null;

    if (!doc) {
      return Promise.resolve(null);
    }

    const app = doc.getElementById('today-knowledge-app');

    if (!app) {
      return Promise.resolve(null);
    }

    const stateNode = doc.getElementById('today-knowledge-state');
    const listNode = doc.getElementById('today-knowledge-list');
    const statusNode = doc.getElementById('today-knowledge-deck-status');
    const heroDateNode = doc.getElementById('today-knowledge-hero-date');
    const heroCountNode = doc.getElementById('today-knowledge-hero-count');
    const closeLink = doc.getElementById('today-knowledge-close');
    const menuButton = doc.getElementById('today-knowledge-menu-button');
    const menuNode = doc.getElementById('today-knowledge-menu');
    const menuTopButton = doc.getElementById('today-knowledge-menu-top');
    const dataPath = app.dataset.dataPath;
    const timeZone = app.dataset.timezone || 'Asia/Shanghai';
    const envWindow = (options && options.window) || doc.defaultView || null;
    const fetcher =
      (options && options.fetch) ||
      (envWindow && typeof envWindow.fetch === 'function' ? envWindow.fetch.bind(envWindow) : null);
    let deckController = null;

    function setMenuOpen(nextOpen) {
      if (!menuNode || !menuButton) {
        return;
      }

      menuNode.hidden = !nextOpen;
      menuButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }

    function handleMenuButtonClick(event) {
      if (!menuNode || !menuButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(menuNode.hidden);
    }

    function handleDocumentClick(event) {
      if (!menuNode || !menuButton || menuNode.hidden) {
        return;
      }

      const target = event.target;

      if (menuNode.contains(target) || menuButton.contains(target)) {
        return;
      }

      setMenuOpen(false);
    }

    function handleMenuTopClick(event) {
      event.preventDefault();
      setMenuOpen(false);

      if (envWindow && typeof envWindow.scrollTo === 'function') {
        envWindow.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function handleCloseClick(event) {
      if (!envWindow || !doc.referrer || envWindow.history.length <= 1) {
        return;
      }

      try {
        const referrerUrl = new URL(doc.referrer, envWindow.location.href);

        if (referrerUrl.origin !== envWindow.location.origin) {
          return;
        }

        event.preventDefault();
        envWindow.history.back();
      } catch (_error) {
        return;
      }
    }

    if (menuButton) {
      menuButton.addEventListener('click', handleMenuButtonClick);
      doc.addEventListener('click', handleDocumentClick);
    }

    if (menuTopButton) {
      menuTopButton.addEventListener('click', handleMenuTopClick);
    }

    if (closeLink) {
      closeLink.addEventListener('click', handleCloseClick);
    }

    function resetDeck() {
      if (!deckController) {
        return;
      }

      deckController.destroy();
      deckController = null;
    }

    function showState(message) {
      resetDeck();
      if (statusNode) {
        statusNode.hidden = true;
        statusNode.textContent = '';
      }
      setMenuOpen(false);
      if (heroDateNode) {
        heroDateNode.textContent = '今日 ' + getDateKey(new Date(), timeZone);
      }
      if (heroCountNode) {
        heroCountNode.textContent = '0 / 15';
      }
      if (stateNode) {
        stateNode.textContent = message;
        stateNode.hidden = false;
      }
      if (listNode) {
        listNode.hidden = true;
        listNode.innerHTML = '';
      }
    }

    function showList(items) {
      if (!listNode) {
        return;
      }

      resetDeck();
      setMenuOpen(false);
      if (heroDateNode) {
        heroDateNode.textContent = '今日 ' + getDateKey(new Date(), timeZone);
      }
      if (heroCountNode) {
        heroCountNode.textContent = String(items.length) + ' / 15';
      }
      listNode.innerHTML = items.map(renderCard).join('');
      listNode.hidden = false;
      if (stateNode) {
        stateNode.hidden = true;
      }
      deckController = createWheelDeck(app, listNode, statusNode, { window: envWindow });
    }

    if (!fetcher || !dataPath) {
      showState('加载知识点失败，请稍后重试。');
      return Promise.resolve(null);
    }

    return fetcher(dataPath, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('加载今日知识点数据失败');
        }

        return response.json();
      })
      .then(function (payload) {
        const items = Array.isArray(payload.items) ? payload.items : [];

        if (items.length === 0) {
          showState('知识点仓库还是空的，先去后台沉淀几条再来。');
          return { items: [] };
        }

        const dailyItems = pickDailyItems(items, 15, new Date(), timeZone);
        showList(dailyItems);
        return {
          app: app,
          items: dailyItems,
          deckController: deckController,
        };
      })
      .catch(function (error) {
        showState(error instanceof Error ? error.message : '加载知识点失败，请稍后重试。');
        return null;
      });
  }

  return {
    createWheelDeck: createWheelDeck,
    initTodayKnowledgePage: initTodayKnowledgePage,
    pickDailyItems: pickDailyItems,
    renderCard: renderCard,
  };
});
