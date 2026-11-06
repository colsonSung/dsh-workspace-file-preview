/**
 * Tests for the video renderer inside the workspace file preview plugin.
 *
 * Three layers are covered: the pure address / media-type / formatting helpers,
 * the body itself in jsdom against a stubbed binary Remote, and the wiring in
 * `apply()`, so the merged plugin keeps claiming the video suffix set with the
 * renderer loading mode.
 *
 * Run with `node --test test/`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FILE_ADDRESS_PREFIX,
  MAX_VIDEO_BYTES,
  VIDEO_EXTENSIONS,
  formatBytes,
  formatDuration,
  isWindowTooLarge,
  mediaTypeForPath,
  parseSessionFileAddress,
  progressPercent,
} from '../src/video.js';

test('a session file address resolves to its session and path', () => {
  const address = 'dsh-resource://file/session/s-1/Downloads/clip.mp4';
  assert.deepEqual(parseSessionFileAddress(address), { sessionId: 's-1', path: 'Downloads/clip.mp4' });
  assert.equal(FILE_ADDRESS_PREFIX, 'dsh-resource://file/');
});

test('an escaped path segment is decoded once', () => {
  const address = 'dsh-resource://file/session/s%2F1/my%20clip.mp4';
  assert.deepEqual(parseSessionFileAddress(address), { sessionId: 's/1', path: 'my clip.mp4' });
});

test('an absolute address is not a session address', () => {
  assert.equal(parseSessionFileAddress('dsh-resource://file/absolute//tmp/clip.mp4'), undefined);
  assert.equal(parseSessionFileAddress('dsh-resource://file/session/s-1'), undefined);
});

test('a foreign address is rejected', () => {
  assert.equal(parseSessionFileAddress('https://example.com/clip.mp4'), undefined);
  assert.equal(parseSessionFileAddress(''), undefined);
  assert.equal(parseSessionFileAddress(undefined), undefined);
});

test('the media type follows the suffix, not the directory', () => {
  assert.equal(mediaTypeForPath('/tmp/holiday.MP4'), 'video/mp4');
  assert.equal(mediaTypeForPath('/tmp/clip.webm'), 'video/webm');
  assert.equal(mediaTypeForPath('/tmp/clip.mov'), 'video/quicktime');
  assert.equal(mediaTypeForPath('/tmp/clip.mkv'), 'video/x-matroska');
  assert.equal(mediaTypeForPath('/tmp/notes.txt'), undefined);
  assert.equal(mediaTypeForPath('/tmp/noextension'), undefined);
});

test('every claimed suffix has a media type and a binary container', () => {
  assert.deepEqual(VIDEO_EXTENSIONS, ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv']);
  for (const suffix of VIDEO_EXTENSIONS) {
    assert.equal(typeof mediaTypeForPath(`/tmp/clip.${suffix}`), 'string', suffix);
  }
});

test('byte counts read the way a person reads them', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(640400), '625 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), '3.0 GB');
  assert.equal(formatBytes(undefined), '');
});

test('durations read as minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(3675), '1:01:15');
  assert.equal(formatDuration(undefined), '');
});

test('progress stays inside its bounds', () => {
  assert.equal(progressPercent(0, 100), 0);
  assert.equal(progressPercent(50, 100), 50);
  assert.equal(progressPercent(150, 100), 100);
  assert.equal(progressPercent(50, undefined), 0);
  assert.equal(progressPercent(50, 0), 0);
});

test('only the host byte-window refusal asks for a smaller window', () => {
  assert.equal(isWindowTooLarge({ code: 'workspace-file/too-large' }), true);
  assert.equal(isWindowTooLarge({ code: 'workspace-file/not-found' }), false);
  assert.equal(isWindowTooLarge(undefined), false);
});

/* ------------------------------------------------------------------ */
/* The body, driven in jsdom against a stubbed binary Remote.          */
/* ------------------------------------------------------------------ */

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { VideoBody } = await import('../src/video.js');

const objectUrls = { created: [], revoked: [] };
let objectUrlSeq = 0;
globalThis.URL.createObjectURL = (blob) => {
  const url = `blob:video-${++objectUrlSeq}-${blob.type}`;
  objectUrls.created.push(url);
  return url;
};
globalThis.URL.revokeObjectURL = (url) => {
  objectUrls.revoked.push(url);
};

const ADDRESS = 'dsh-resource://file/session/s1/media/clip.mp4';

/** A body that mounts and settles: the read resolves in the given window count. */
const mount = async (readBytes, { t = (key) => key } = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls = { loaded: [], failed: 0, reload: 0 };
  const controller = new AbortController();
  const tab = { signal: controller.signal };
  const props = {
    ctx: { remote: { workspaceFiles: { readBytes } } },
    t,
    resourceAddress: ADDRESS,
    content: {
      kind: 'renderer',
      revision: 1,
      loaded: (version) => calls.loaded.push(version),
      failed: () => { calls.failed += 1; },
      reload: () => { calls.reload += 1; },
    },
    useTabInfo: () => ({ tab }),
    scrollportRef: () => {},
  };
  await act(async () => {
    root.render(h(VideoBody, props));
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return {
    container,
    calls,
    unmount: async () => {
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
};

test('a readable video becomes a player fed by one blob URL', async () => {
  objectUrls.created.length = 0;
  const windows = [];
  const readBytes = async (_sessionId, _path, options) => {
    windows.push(options.range.length);
    return { ok: true, value: { data: new Uint8Array([1, 2, 3]), version: 'v7', bytes: 3, eof: true } };
  };
  const mounted = await mount(readBytes);

  const player = mounted.container.querySelector('video[data-wfp-video-player]');
  assert.ok(player, 'the player is rendered');
  assert.match(player.getAttribute('src'), /^blob:video-/);
  assert.equal(mounted.container.querySelector('.wfp-video-name').textContent, 'clip.mp4');
  assert.equal(mounted.container.querySelector('.wfp-video-meta').textContent, '3 B');
  assert.deepEqual(mounted.calls.loaded, ['v7'], 'the source version reaches the preview owner');
  assert.equal(mounted.calls.failed, 0);
  assert.deepEqual(windows, [2 * 1024 * 1024], 'the first read asks for one full window');

  await mounted.unmount();
  assert.ok(objectUrls.revoked.some((url) => url.startsWith('blob:video-')), 'the blob URL is released on unmount');
});

test('a refused window is retried smaller before the read gives up', async () => {
  const windows = [];
  const readBytes = async (_sessionId, _path, options) => {
    windows.push(options.range.length);
    if (windows.length === 1) return { ok: false, error: { code: 'workspace-file/too-large' } };
    return { ok: true, value: { data: new Uint8Array([9]), version: 'v1', bytes: 1, eof: true } };
  };
  const mounted = await mount(readBytes);

  assert.deepEqual(windows, [2 * 1024 * 1024, 1024 * 1024]);
  assert.ok(mounted.container.querySelector('video[data-wfp-video-player]'));
  await mounted.unmount();
});

test('a file over the preview limit explains the limit instead of playing', async () => {
  const readBytes = async () => ({
    ok: true,
    value: { data: new Uint8Array([1]), version: 'v1', bytes: MAX_VIDEO_BYTES + 1, eof: false },
  });
  const mounted = await mount(readBytes);

  const alert = mounted.container.querySelector('[role="alert"]');
  assert.ok(alert, 'the failure is announced');
  assert.equal(alert.querySelector('.wfp-video-error-text').textContent, 'video.error.tooLarge');
  assert.equal(mounted.calls.failed, 1, 'the owner is told the preview failed');
  await mounted.unmount();
});

test('a missing file offers a retry that asks the owner to reload', async () => {
  const readBytes = async () => ({ ok: false, error: { code: 'workspace-file/not-found' } });
  const mounted = await mount(readBytes);

  assert.equal(
    mounted.container.querySelector('.wfp-video-error-text').textContent,
    'video.error.notFound',
  );
  const retry = mounted.container.querySelector('[data-wfp-video-retry]');
  assert.ok(retry, 'the failure offers a retry');
  await act(async () => {
    retry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  assert.equal(mounted.calls.reload, 1);
  await mounted.unmount();
});

test('an address outside the session grammar is refused before any read', async () => {
  let reads = 0;
  const readBytes = async () => {
    reads += 1;
    return { ok: true, value: { data: new Uint8Array([1]), version: 'v1', bytes: 1, eof: true } };
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls = { failed: 0 };
  await act(async () => {
    root.render(h(VideoBody, {
      ctx: { remote: { workspaceFiles: { readBytes } } },
      t: (key) => key,
      resourceAddress: 'dsh-resource://file/absolute/clip.mp4',
      content: { kind: 'renderer', revision: 1, loaded: () => {}, failed: () => { calls.failed += 1; }, reload: () => {} },
      useTabInfo: () => ({ tab: { signal: new AbortController().signal } }),
      scrollportRef: () => {},
    }));
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  assert.equal(reads, 0, 'an absolute address never reaches the Remote');
  assert.equal(calls.failed, 1);
  assert.equal(container.querySelector('[role="alert"] .wfp-video-error-text').textContent, 'video.error.address');
  await act(async () => { root.unmount(); });
  container.remove();
});

test('the loading state is announced while the bytes are on their way', async () => {
  let resolveRead;
  const pending = new Promise((resolve) => { resolveRead = resolve; });
  const readBytes = () => pending;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(h(VideoBody, {
      ctx: { remote: { workspaceFiles: { readBytes } } },
      t: (key) => key,
      resourceAddress: ADDRESS,
      content: { kind: 'renderer', revision: 1, loaded: () => {}, failed: () => {}, reload: () => {} },
      useTabInfo: () => ({ tab: { signal: new AbortController().signal } }),
      scrollportRef: () => {},
    }));
  });
  const status = container.querySelector('[role="status"]');
  assert.ok(status, 'the loading state is announced');
  // The size arrives with the first window, so the first paint counts bytes only.
  assert.equal(status.querySelector('.wfp-video-note').textContent, 'video.loading.bytes');
  resolveRead({ ok: true, value: { data: new Uint8Array([1, 2]), version: 'v1', bytes: 2, eof: true } });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  assert.ok(container.querySelector('video[data-wfp-video-player]'));
  await act(async () => { root.unmount(); });
  container.remove();
});

/* ------------------------------------------------------------------ */
/* Wiring: the plugin claims video suffixes with the renderer mode.    */
/* ------------------------------------------------------------------ */

test('apply registers video as a renderer-mode document preview with a body', async () => {
  const { apply } = await import('../src/client-entry.js');
  const previews = [];
  const slots = [];
  const effect = (fn) => {
    const disposer = fn();
    return typeof disposer === 'function' ? disposer : () => {};
  };
  const ctx = {
    effect,
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
    },
    documentPreviews: {
      register: (descriptor) => {
        previews.push(descriptor);
        return () => {};
      },
    },
    slots: {
      inject: (name, callback) => {
        const result = callback();
        return typeof result === 'function' ? result : () => {};
      },
      register: (descriptor, render) => {
        slots.push({ descriptor, render });
        return () => {};
      },
    },
    sidebarRightTabs: { register: () => () => {} },
  };
  apply(ctx);

  const video = previews.find((preview) => preview.id === 'dsh-workspace-file-preview/video');
  assert.ok(video, 'the video preview is registered');
  assert.deepEqual(video.extensions, VIDEO_EXTENSIONS);
  assert.deepEqual(video.binaryExtensions, VIDEO_EXTENSIONS);
  assert.equal(video.loading, 'renderer');
  assert.equal(video.wrap, false);

  const body = slots.find((slot) => slot.descriptor.key === 'dsh-workspace-file-preview/video');
  assert.ok(body, 'the body occupies the document slot under the same id');
  assert.equal(body.descriptor.name, 'sidebar.right.tab.document');
});
