const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { createWheelDeck, renderCard } = require('../themes/typography/source/js/today-knowledge.js');

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
    </div>`,
    { url: 'https://example.com/today-knowledge/' },
  );

  const { document } = dom.window;
  const listNode = document.getElementById('today-knowledge-list');

  listNode.innerHTML = [
    renderCard({ title: '知识点 A', date: '2026-05-06 09:00:00', note: '第一条' }, 0),
    renderCard({ title: '知识点 B', date: '2026-05-06 10:00:00', note: '第二条' }, 1),
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

test('mobile viewport keeps the knowledge list as a normal stacked list', () => {
  const dom = createDeckDom();
  const { window } = dom;
  window.matchMedia = createMatchMedia(false);

  const document = window.document;
  const app = document.getElementById('today-knowledge-app');
  const listNode = document.getElementById('today-knowledge-list');
  const statusNode = document.getElementById('today-knowledge-deck-status');
  const deck = createWheelDeck(app, listNode, statusNode, { window });

  assert.equal(deck.isDeckEnabled(), false);
  assert.equal(statusNode.hidden, true);
  assert.equal(listNode.hasAttribute('data-active-index'), false);

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

test('desktop with a single knowledge card still uses the card stage without locking the wheel', () => {
  const dom = new JSDOM(
    `<!doctype html>
    <div id="today-knowledge-app">
      <div id="today-knowledge-deck-status" hidden></div>
      <div id="today-knowledge-list">${renderCard({ title: '唯一知识点', note: '内容' }, 0)}</div>
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
