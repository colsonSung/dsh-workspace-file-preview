/**
 * DOM tests for the annotation dialog's AI assist row.
 *
 * The reviewer writes the annotation; the assist row is there to help with
 * the wording: an intent says what the annotation is about, the model (or a
 * local template) writes the sentence, and the sentence lands in the same text
 * box so the reviewer still owns it before it is sent.
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

const { createElement: h, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { InstructionPopover } = await import('../src/client-entry.js');

const root = createRoot(document.body);

/** The translator double: the key is the label. */
const t = (key, params) => {
  if (params === undefined) return key;
  return `${key}:${JSON.stringify(params)}`;
};

/**
 * A stateful host for the dialog: the text box is controlled by the parent,
 * so the draft the assist produced has to travel through `onChange`.
 */
function Harness(props) {
  const [value, setValue] = useState(props.initial ?? '');
  return h(InstructionPopover, {
    ...props,
    value,
    onChange: (next) => {
      setValue(next);
      props.onChange?.(next);
    },
  });
}

/** Render the dialog and return the queries a reviewer would use. */
const render = async (props) => {
  await act(async () => { root.render(h(Harness, props)); });
  return {
    toggle: () => document.querySelector('.wfp-pop-assist-toggle'),
    panel: () => document.querySelector('.wfp-pop-assist'),
    chips: () => [...document.querySelectorAll('.wfp-pop-chip')],
    note: () => document.querySelector('.wfp-pop-note'),
    generate: () => document.querySelector('.wfp-pop-assist-btn'),
    template: () => document.querySelector('.wfp-pop-assist-tpl'),
    textarea: () => document.querySelector('.wfp-pop-text'),
    error: () => document.querySelector('.wfp-pop-error'),
    hint: () => document.querySelector('.wfp-pop-assist-hint'),
  };
};

const unmount = async () => {
  await act(async () => { root.render(null); });
};

const baseProps = {
  anchor: { top: 10, left: 10 },
  title: '标注这个元素',
  placeholder: '这里要改成…',
  onSubmit: () => {},
  onClose: () => {},
  t,
};

test('the dialog shows the assist button only when the caller offers one', async () => {
  const without = await render(baseProps);
  assert.equal(without.toggle(), null);
  await unmount();

  const with_ = await render({ ...baseProps, assist: { onGenerate: async () => 'x', onTemplate: () => 'y' } });
  assert.ok(with_.toggle(), 'the sparkle button renders');
  await unmount();
});

test('the assist panel opens with one chip per review angle', async () => {
  const view = await render({ ...baseProps, assist: { onGenerate: async () => 'x', onTemplate: () => 'y' } });
  await act(async () => { view.toggle().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.ok(view.panel(), 'the panel opens');
  assert.equal(view.chips().length, 5);
  await unmount();
});

test('the generated draft lands in the text box', async () => {
  const asked = [];
  const view = await render({
    ...baseProps,
    assist: {
      onGenerate: async (request) => {
        asked.push(request);
        return '把文案改成「审核中」，并补上失败态提示';
      },
      onTemplate: () => 'y',
    },
  });
  await act(async () => { view.toggle().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  await act(async () => { view.generate().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });

  assert.equal(view.textarea().value, '把文案改成「审核中」，并补上失败态提示');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].intent, 'copy');
  assert.ok(view.hint(), 'the reviewer is told the draft is ready');
  await unmount();
});

test('the intent the reviewer picked travels with the request', async () => {
  const asked = [];
  const view = await render({
    ...baseProps,
    assist: {
      onGenerate: async (request) => {
        asked.push(request);
        return 'draft';
      },
      onTemplate: () => 'y',
    },
  });
  await act(async () => { view.toggle().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  await act(async () => { view.chips()[3].dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  await act(async () => { view.generate().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.equal(asked[0].intent, 'rule');
  await unmount();
});

test('the template fills the text box without a model', async () => {
  const view = await render({
    ...baseProps,
    assist: { onGenerate: async () => 'draft', onTemplate: (intent) => `template:${intent}` },
  });
  await act(async () => { view.toggle().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  await act(async () => { view.template().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  assert.equal(view.textarea().value, 'template:copy');
  await unmount();
});

test('a refused draft shows the reason and keeps the text box', async () => {
  const view = await render({
    ...baseProps,
    initial: '我写的批注',
    assist: {
      onGenerate: async () => { throw new Error('宿主尚未提供 AI 辅助，请重启应用后重试'); },
      onTemplate: () => 'y',
    },
  });
  await act(async () => { view.toggle().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });
  await act(async () => { view.generate().dispatchEvent(new dom.window.Event('click', { bubbles: true })); });

  assert.match(view.error().textContent, /宿主尚未提供 AI 辅助/);
  assert.equal(view.textarea().value, '我写的批注');
  await unmount();
});
