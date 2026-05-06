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

  function renderSection(label, className, value) {
    if (!value) {
      return '';
    }

    return (
      '<section class="today-knowledge__section">' +
        '<p class="today-knowledge__section-label">' + label + '</p>' +
        '<p class="' + className + '">' + escapeHtml(value) + '</p>' +
      '</section>'
    );
  }

  function renderCard(item, index) {
    const title = escapeHtml(item.title || '未命名知识点');
    const desc = item.desc ? '<p class="today-knowledge__desc">' + escapeHtml(item.desc) + '</p>' : '';
    const quote = renderSection('原文摘录', 'today-knowledge__quote', item.quote);
    const note = renderSection('我的理解', 'today-knowledge__note', item.note || item.content);

    return (
      '<article class="today-knowledge__card" data-card-index="' + String(index) + '">' +
        '<div class="today-knowledge__card-top">' +
          '<span class="today-knowledge__order">' + pad(index + 1) + '</span>' +
          '<span class="today-knowledge__date">' + escapeHtml((item.date || '').slice(0, 10) || '无日期') + '</span>' +
        '</div>' +
        '<h2 class="today-knowledge__title">' + title + '</h2>' +
        desc +
        quote +
        note +
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
    let activeIndex = 0;
    let deckEnabled = false;
    let wheelDistance = 0;
    let wheelResetTimer = null;
    let transitionLockTimer = null;
    let isTransitionLocked = false;

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

    function applyActiveCard() {
      if (!deckEnabled) {
        cards.forEach(function (card) {
          card.classList.remove('today-knowledge__card--active');
          card.removeAttribute('aria-hidden');
        });
        listNode.removeAttribute('data-active-index');
        updateStatus();
        return;
      }

      cards.forEach(function (card, index) {
        const isActive = index === activeIndex;
        card.classList.toggle('today-knowledge__card--active', isActive);
        card.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      listNode.setAttribute('data-active-index', String(activeIndex));
      updateStatus();
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
      app.classList.toggle('today-knowledge--wheel-deck', deckEnabled);
      listNode.classList.toggle('today-knowledge__list--wheel-deck', deckEnabled);
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

    listNode.addEventListener('wheel', handleWheel, { passive: false });

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
        listNode.removeEventListener('wheel', handleWheel);

        if (envWindow) {
          envWindow.removeEventListener('resize', syncMode);
        }

        app.classList.remove('today-knowledge--wheel-deck');
        listNode.classList.remove('today-knowledge__list--wheel-deck');
        deckEnabled = false;
        applyActiveCard();
      },
      getActiveIndex: function () {
        return activeIndex;
      },
      isDeckEnabled: function () {
        return deckEnabled;
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
    const dataPath = app.dataset.dataPath;
    const timeZone = app.dataset.timezone || 'Asia/Shanghai';
    const envWindow = (options && options.window) || doc.defaultView || null;
    const fetcher =
      (options && options.fetch) ||
      (envWindow && typeof envWindow.fetch === 'function' ? envWindow.fetch.bind(envWindow) : null);
    let deckController = null;

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
