const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { createWheelDeck, renderCard } = require('../themes/typography/source/js/today-knowledge.js');
const { buildKnowledgeItem } = require('./today-knowledge.js');

function createMatchMedia(matches) {
  return function matchMedia() {
    return {
      matches,
      media: '(min-width: 768px)',
      addEventListener() {},
      removeEventListener() {},
    };
  };
}

function createDeckDom() {
  const dom = new JSDOM(
    `<!doctype html>
    <div id="today-knowledge-app">
      <div id="today-knowledge-deck-status" hidden></div>
      <div id="today-knowledge-list"></div>
      <div id="today-knowledge-pager" hidden>
        <button id="today-knowledge-pager-prev" type="button"></button>
        <span id="today-knowledge-pager-current"></span>
        <button id="today-knowledge-pager-next" type="button"></button>
      </div>
    </div>`,
    { url: 'https://example.com/today-knowledge/' },
  );

  const { document } = dom.window;
  const listNode = document.getElementById('today-knowledge-list');

  listNode.innerHTML = [
    renderCard({ title: '知识点 A', date: '2026-05-06 09:00:00', body: '第一条' }, 0),
    renderCard({ title: '知识点 B', date: '2026-05-06 10:00:00', body: '第二条' }, 1),
  ].join('');

  return dom;
}

test('desktop wheel deck activates and switches cards', () => {
  const dom = createDeckDom();
  const { window } = dom;
  window.matchMedia = createMatchMedia(true);

  const document = window.document;
  const app = document.getElementById('today-knowledge-app');
  const listNode = document.getElementById('today-knowledge-list');
  const statusNode = document.getElementById('today-knowledge-deck-status');
  const deck = createWheelDeck(app, listNode, statusNode, { window });

  assert.equal(deck.isDeckEnabled(), true);
  assert.equal(deck.getActiveIndex(), 0);
  assert.match(statusNode.textContent, /01 \/ 02/);
  assert.equal(listNode.getAttribute('data-active-index'), '0');

  const event = new window.WheelEvent('wheel', {
    deltaY: 120,
    bubbles: true,
    cancelable: true,
  });
  const dispatchResult = listNode.dispatchEvent(event);

  assert.equal(dispatchResult, false);
  assert.equal(deck.getActiveIndex(), 1);
  assert.equal(listNode.getAttribute('data-active-index'), '1');
  assert.match(statusNode.textContent, /02 \/ 02/);

  deck.destroy();
});

test('mobile viewport uses a single-card pager instead of a stacked list', () => {
  const dom = createDeckDom();
  const { window } = dom;
  window.matchMedia = createMatchMedia(false);

  const document = window.document;
  const app = document.getElementById('today-knowledge-app');
  const listNode = document.getElementById('today-knowledge-list');
  const statusNode = document.getElementById('today-knowledge-deck-status');
  const pagerNode = document.getElementById('today-knowledge-pager');
  const pagerCurrentNode = document.getElementById('today-knowledge-pager-current');
  const pagerPrevButton = document.getElementById('today-knowledge-pager-prev');
  const pagerNextButton = document.getElementById('today-knowledge-pager-next');
  const deck = createWheelDeck(app, listNode, statusNode, { window });

  assert.equal(deck.isDeckEnabled(), false);
  assert.equal(deck.isPagerEnabled(), true);
  assert.equal(statusNode.hidden, true);
  assert.equal(pagerNode.hidden, false);
  assert.equal(pagerCurrentNode.textContent, '1/2');
  assert.equal(pagerPrevButton.disabled, true);
  assert.equal(pagerNextButton.disabled, false);
  assert.equal(listNode.getAttribute('data-active-index'), '0');

  const cards = listNode.querySelectorAll('.today-knowledge__card');
  assert.equal(cards[0].hidden, false);
  assert.equal(cards[1].hidden, true);

  const event = new window.WheelEvent('wheel', {
    deltaY: 120,
    bubbles: true,
    cancelable: true,
  });
  const dispatchResult = listNode.dispatchEvent(event);

  assert.equal(dispatchResult, true);
  assert.equal(deck.getActiveIndex(), 0);

  pagerNextButton.click();

  assert.equal(deck.getActiveIndex(), 1);
  assert.equal(pagerCurrentNode.textContent, '2/2');
  assert.equal(pagerPrevButton.disabled, false);
  assert.equal(pagerNextButton.disabled, true);
  assert.equal(cards[0].hidden, true);
  assert.equal(cards[1].hidden, false);

  deck.destroy();
});

test('desktop with a single knowledge card still uses the card stage without locking the wheel', () => {
  const dom = new JSDOM(
    `<!doctype html>
    <div id="today-knowledge-app">
      <div id="today-knowledge-deck-status" hidden></div>
      <div id="today-knowledge-list">${renderCard({ title: '唯一知识点', body: '内容' }, 0)}</div>
      <div id="today-knowledge-pager" hidden>
        <button id="today-knowledge-pager-prev" type="button"></button>
        <span id="today-knowledge-pager-current"></span>
        <button id="today-knowledge-pager-next" type="button"></button>
      </div>
    </div>`,
    { url: 'https://example.com/today-knowledge/' },
  );
  const { window } = dom;
  window.matchMedia = createMatchMedia(true);

  const document = window.document;
  const app = document.getElementById('today-knowledge-app');
  const listNode = document.getElementById('today-knowledge-list');
  const statusNode = document.getElementById('today-knowledge-deck-status');
  const deck = createWheelDeck(app, listNode, statusNode, { window });

  assert.equal(deck.isDeckEnabled(), true);
  assert.equal(statusNode.hidden, false);
  assert.match(statusNode.textContent, /今日知识点 01 \/ 01/);

  const event = new window.WheelEvent('wheel', {
    deltaY: 120,
    bubbles: true,
    cancelable: true,
  });
  const dispatchResult = listNode.dispatchEvent(event);

  assert.equal(dispatchResult, true);
  assert.equal(deck.getActiveIndex(), 0);

  deck.destroy();
});

test('renderCard only keeps date and body content', () => {
  const html = renderCard(
    {
      title: '不会显示的标题',
      desc: '不会显示的摘要',
      date: '2026-05-06 12:00:00',
      quote: '不会单独显示的原文摘录',
      note: '不会单独显示的我的理解',
      body: '真正展示的正文',
    },
    0,
  );

  assert.match(html, /today-knowledge__date/);
  assert.match(html, /today-knowledge__body/);
  assert.doesNotMatch(html, /today-knowledge__title/);
  assert.doesNotMatch(html, /today-knowledge__desc/);
  assert.doesNotMatch(html, /原文摘录/);
  assert.doesNotMatch(html, /我的理解/);
  assert.match(html, /真正展示的正文/);
});

test('buildKnowledgeItem flattens quote-based knowledge into a single body field', () => {
  const item = buildKnowledgeItem(
    '20260506110230.md',
    `---
title: 我一直都很需要一个本地的内容编辑
date: 2026-05-06 11:02:30
desc: 预览文案
---

## 原文摘录
> 我一直都很需要一个本地的内容编辑

## 我的理解
`,
  );

  assert.equal(item.body, '我一直都很需要一个本地的内容编辑');
  assert.equal(item.quote, '我一直都很需要一个本地的内容编辑');
});

test('buildKnowledgeItem keeps manual knowledge body intact', () => {
  const item = buildKnowledgeItem(
    '20260505230044.md',
    `---
title: 如何锻炼自己的匪气
date: 2026-05-05 23:00:44
---

1. 如何锻炼自己的匪气
想做一件事情前，先问自己3个问题：
- 如果没做，会不会后悔
- 如果做失败了，会不会死
`,
  );

  assert.match(item.body, /想做一件事情前/);
  assert.match(item.body, /如果做失败了，会不会死/);
});
