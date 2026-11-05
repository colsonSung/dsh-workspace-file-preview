/**
 * DOM tests for the reading actions of the Markdown preview.
 *
 * A reader who selects a passage has two things to do with it: hand it to the
 * conversation, or ask about it without touching that conversation. These
 * tests cover both, and the review marks that count the annotations.
 *
 * Run with `node --test test/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) ?? ((fn) => setTimeout(fn, 0));
global.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) ?? clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const {
  SelectionActions,
  SideChat,
  addSelectionToChat,
  pickBlock,
  elementPath,
  resolvePath,
  markdownAnnotateMessage,
} = await import('../src/client-entry.js');

const root = createRoot(document.body);

/** The translator double: the key is the label. */
const t = (key, params) => {
  if (params === undefined) return key;
  return `${key}:${JSON.stringify(params)}`;
};

/** Render something and return it. */
const render = async (element) => {
  await act(async () => { root.render(element); });
};

/** Unmount what is on screen. */
const unmount = async () => {
  await act(async () => { root.render(null); });
};

/** Type into a controlled text box the way a reader does. */
const type = async (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};

/** Click something. */
const click = async (element) => {
  await act(async () => { element.dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
};

test('the selection bar offers the two actions and nothing else', async () => {
  await render(h(SelectionActions, { anchor: { top: 100, left: 200 }, onAdd: () => {}, onAsk: () => {}, t }));
  const buttons = [...document.querySelectorAll('.mmd-sel-btn')];
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].textContent, 'chat.addSelection');
  assert.equal(buttons[1].textContent, 'chat.askSide');
  assert.ok(document.querySelector('.mmd-sel-sep'), 'the two actions are separated');
  await unmount();
});

test('the selection bar sits above the selection', async () => {
  await render(h(SelectionActions, { anchor: { top: 100, left: 200 }, onAdd: () => {}, onAsk: () => {}, t }));
  const bar = document.querySelector('.mmd-sel-actions');
  assert.equal(bar.style.top, '100px');
  assert.equal(bar.style.left, '200px');
  await unmount();
});

test('adding a selection seeds the composer with the file and the passage', () => {
  const drafts = [];
  const inputActions = { setDraft: (draft) => { drafts.push(draft); } };
  assert.equal(addSelectionToChat(inputActions, 'docs/PRD.md', 'first line\nsecond line'), true);
  assert.equal(drafts.length, 1);
  assert.match(drafts[0].text, /@docs\/PRD\.md/);
  assert.match(drafts[0].text, /> first line/);
  assert.match(drafts[0].text, /> second line/);
  assert.equal(drafts[0].references[0].ref, '@docs/PRD.md');
  assert.equal(drafts[0].references[0].label, 'PRD.md');
});

test('a path with a space is quoted in the draft', () => {
  const drafts = [];
  addSelectionToChat({ setDraft: (draft) => { drafts.push(draft); } }, 'my docs/PRD.md', 'x');
  assert.equal(drafts[0].references[0].ref, '@"my docs/PRD.md"');
});

test('a Host without composer actions is not a crash', () => {
  assert.equal(addSelectionToChat(undefined, 'docs/PRD.md', 'x'), false);
});

test('the side chat asks the Host and shows the answer', async () => {
  const asked = [];
  const ask = async (payload) => {
    asked.push(payload);
    return 'the answer';
  };
  await render(h(SideChat, { path: 'docs/PRD.md', selection: 'the passage', onClose: () => {}, ask, t }));

  await type(document.querySelector('.mmd-side-chat-text'), 'why did it fail?');
  await click(document.querySelector('.mmd-side-chat-send'));

  assert.equal(asked.length, 1);
  assert.equal(asked[0].question, 'why did it fail?');
  assert.equal(asked[0].selection, 'the passage');
  assert.equal(asked[0].path, 'docs/PRD.md');
  const turns = [...document.querySelectorAll('.mmd-side-chat-turn')];
  assert.equal(turns.length, 2);
  assert.equal(turns[0].textContent, 'why did it fail?');
  assert.equal(turns[1].textContent, 'the answer');
  await unmount();
});

test('the second question carries the first one', async () => {
  const asked = [];
  const ask = async (payload) => {
    asked.push(payload);
    return 'answer';
  };
  await render(h(SideChat, { path: 'a.md', selection: '', onClose: () => {}, ask, t }));

  await type(document.querySelector('.mmd-side-chat-text'), 'first');
  await click(document.querySelector('.mmd-side-chat-send'));
  await type(document.querySelector('.mmd-side-chat-text'), 'second');
  await click(document.querySelector('.mmd-side-chat-send'));

  assert.equal(asked.length, 2);
  assert.deepEqual(asked[1].history, [
    { role: 'user', text: 'first' },
    { role: 'assistant', text: 'answer' },
  ]);
  await unmount();
});

test('a refused question says so and keeps the panel open', async () => {
  const ask = async () => { throw new Error('宿主未配置可用模型，AI 辅助不可用'); };
  await render(h(SideChat, { path: 'a.md', selection: '', onClose: () => {}, ask, t }));

  await type(document.querySelector('.mmd-side-chat-text'), 'why');
  await click(document.querySelector('.mmd-side-chat-send'));

  const error = document.querySelector('.mmd-side-chat-error');
  assert.match(error.textContent, /宿主未配置可用模型/);
  assert.ok(document.querySelector('.mmd-side-chat'), 'the panel is still there');
  await unmount();
});

test('an empty question is never asked', async () => {
  let asked = 0;
  const ask = async () => { asked += 1; return 'answer'; };
  await render(h(SideChat, { path: 'a.md', selection: '', onClose: () => {}, ask, t }));

  await click(document.querySelector('.mmd-side-chat-send'));
  assert.equal(asked, 0);
  await unmount();
});

test('a click picks the block it landed on', () => {
  document.body.innerHTML = '<div id="doc"><p>first</p><ul><li>item</li></ul><table><tr><td><p>cell</p></td></tr></table></div>';
  const container = document.getElementById('doc');
  const paragraph = container.querySelector('p');
  assert.equal(pickBlock(paragraph, container), paragraph);
  const item = container.querySelector('li');
  assert.equal(pickBlock(item, container), item);
  const cell = container.querySelector('td');
  assert.equal(pickBlock(cell, container), cell, 'a table cell is a better unit than the table');
  assert.equal(pickBlock(container, container), null);
  document.body.innerHTML = '';
});

test('a block keeps its place when the document is laid out again', () => {
  document.body.innerHTML = '<div id="doc"><p>first</p><p>second</p></div>';
  const container = document.getElementById('doc');
  const second = container.querySelectorAll('p')[1];
  const path = elementPath(container, second);
  assert.deepEqual(path, [1]);
  assert.equal(resolvePath(container, path), second);
  assert.equal(resolvePath(container, [9]), null);
  document.body.innerHTML = '';
});

test('the prompt says when a block was only marked', () => {
  const marked = markdownAnnotateMessage(t, 'docs/PRD.md', [
    { info: { tag: 'p', path: 'p', text: 'a paragraph' }, comment: '' },
  ], 'change');
  assert.match(marked, /没有写具体要求/);

  const written = markdownAnnotateMessage(t, 'docs/PRD.md', [
    { info: { tag: 'p', path: 'p', text: 'a paragraph' }, comment: '改成别的' },
  ], 'change');
  assert.match(written, /改成别的/);
});
