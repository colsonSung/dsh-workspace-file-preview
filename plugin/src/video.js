/**
 * Video preview for the workspace file preview plugin.
 *
 * A video is a binary container that the shared text reader cannot page
 * through, so this renderer owns its own loading: it declares
 * `loading: 'renderer'` in the document preview registry, pulls the bytes from
 * the binary workspace Remote in bounded windows, and hands the browser one
 * Blob URL to play.
 *
 * The pure helpers live in this module rather than inside the component so the
 * address grammar, the media-type table and the byte formatting stay testable
 * without a DOM.
 */
import { createElement as h, useEffect, useState } from 'react';

/** Address prefix the Host uses for every file resource. */
export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/';

/** Media type per video suffix the renderer claims. */
export const VIDEO_MEDIA_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
};

/** Suffixes the renderer claims; every one of them is a binary container. */
export const VIDEO_EXTENSIONS = Object.keys(VIDEO_MEDIA_TYPES);

/** Largest window one read may ask for; the Host refuses a larger one. */
const WINDOW_BYTES = 2 * 1024 * 1024;
/** Smallest window the renderer falls back to before it gives up. */
const MIN_WINDOW_BYTES = 64 * 1024;
/** Largest file the renderer pulls into the browser. */
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

/**
 * Read a session-scoped file address back into its session and path.
 *
 * Mirrors the Host's own address grammar: `dsh-resource://file/session/<id>/<path>`
 * with URL-escaped segments. `.` and `..` segments stay unresolved; the Host
 * resolves them.
 *
 * @param {string} address - a complete file resource address.
 * @returns {{ sessionId: string, path: string } | undefined} the parts, or
 *   undefined when the address is not a session file address.
 */
export function parseSessionFileAddress(address) {
  if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return undefined;
  const end = address.search(/[?#]/);
  const body = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end);
  const [scope, ...rest] = body.split('/');
  if (scope !== 'session') return undefined;
  const [id, ...segments] = rest;
  if (id === undefined || id === '' || segments.length === 0) return undefined;
  try {
    return { sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join('/') };
  } catch {
    return undefined;
  }
}

/**
 * The media type a video path should be served as.
 *
 * @param {string} path - a file path.
 * @returns {string | undefined} the media type, or undefined for a suffix the
 *   renderer does not claim.
 */
export function mediaTypeForPath(path) {
  if (typeof path !== 'string') return undefined;
  const name = path.slice(path.replace(/[/\\]+$/, '').lastIndexOf('/') + 1).toLowerCase();
  const suffix = name.slice(name.lastIndexOf('.') + 1);
  return VIDEO_MEDIA_TYPES[suffix];
}

/**
 * Format a byte count the way a person reads one.
 *
 * @param {number | undefined} bytes - a byte count.
 * @returns {string} the formatted size, or an empty string for no count.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Format a media duration as minutes and seconds.
 *
 * @param {number | undefined} seconds - a duration in seconds.
 * @returns {string} the formatted duration, or an empty string for no duration.
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(rest)}`;
  return `${minutes}:${pad(rest)}`;
}

/**
 * The percentage of a download that is done.
 *
 * @param {number} loaded - bytes already read.
 * @param {number | undefined} total - the file's size, when known.
 * @returns {number} a percentage between 0 and 100.
 */
export function progressPercent(loaded, total) {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

/**
 * Whether a read failure means the requested window was larger than the Host
 * allows, in which case a smaller window may still fit.
 *
 * @param {unknown} error - a settled Remote failure.
 * @returns {boolean} true when the window should be retried smaller.
 */
export function isWindowTooLarge(error) {
  return typeof error === 'object' && error !== null && error.code === 'workspace-file/too-large';
}

/** Name of the previewed file, decoded for display. */
function displayName(address) {
  const raw = typeof address === 'string' ? address.slice(address.lastIndexOf('/') + 1) : '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Pull the whole file through the binary Remote in bounded windows.
 *
 * The complete-file cap of the shared reader does not apply to windows, so a
 * video larger than that cap still plays; this renderer applies its own limit.
 *
 * @param {object} options - the reader, the cancellation signal, the size limit
 *   and a progress reporter.
 * @returns {Promise<{ chunks: Uint8Array[], version: string, total?: number }>}
 *   the file's bytes, its source version and its size when known.
 */
async function readWholeFile({ read, signal, onProgress, maxBytes }) {
  const chunks = [];
  let offset = 0;
  let total;
  let version;
  let window = WINDOW_BYTES;
  for (;;) {
    signal.throwIfAborted();
    const result = await read({ range: { offset, length: window } });
    if (!result.ok) {
      if (isWindowTooLarge(result.error) && window > MIN_WINDOW_BYTES) {
        window = Math.max(MIN_WINDOW_BYTES, Math.floor(window / 2));
        continue;
      }
      throw result.error;
    }
    const value = result.value;
    version = value.version;
    if (typeof value.bytes === 'number') total = value.bytes;
    if (typeof total === 'number' && total > maxBytes) {
      throw { code: 'video/too-large', limit: maxBytes };
    }
    const data = value.data;
    const length = typeof data?.byteLength === 'number' ? data.byteLength : 0;
    if (length > 0) {
      chunks.push(data);
      offset += length;
    }
    onProgress(offset, total);
    if (value.eof === true) break;
    if (length === 0) break;
  }
  return { chunks, version, total };
}

/**
 * Turn a settled failure into a localized line.
 *
 * @param {unknown} error - the failure.
 * @param {(key: string, vars?: object) => string} t - the namespace-bound
 *   translate.
 * @returns {string} the line to show.
 */
function describeFailure(error, t) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined;
  if (code === 'workspace-file/not-found') return t('video.error.notFound');
  if (code === 'workspace-file/not-regular-file') return t('video.error.notRegularFile');
  if (code === 'workspace-file/too-large') {
    return t('video.error.tooLarge', { limit: formatBytes(error.details?.limit) });
  }
  if (code === 'video/too-large') return t('video.error.tooLarge', { limit: formatBytes(error.limit) });
  if (code === 'video/address') return t('video.error.address');
  const message = error instanceof Error ? error.message : String(error?.message ?? error);
  return t('video.error.unavailable', { message });
}

/**
 * The document body for a video file.
 *
 * The renderer declares `loading: 'renderer'`, so it mounts before any bytes
 * are read and reports back through the request face: `loaded(version)` ends
 * loading, `failed()` allows a later change to retry, and `reload()` bumps the
 * revision this body watches.
 *
 * @param {object} props - the document slot's props.
 * @returns the player, the loading state, or the failure.
 */
export function VideoBody(props) {
  const { ctx } = props;
  const t = props.t ?? ctx.locale.bind('workspaceFilePreview');
  const request = props.content?.kind === 'renderer' ? props.content : undefined;
  const revision = request?.revision;
  const { tab } = props.useTabInfo();
  const [state, setState] = useState({ phase: 'loading' });
  const [media, setMedia] = useState(undefined);

  useEffect(() => {
    if (revision === undefined) return undefined;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, tab.signal]);
    let disposed = false;
    let objectUrl;
    setState({ phase: 'loading', loaded: 0, total: undefined });
    setMedia(undefined);
    (async () => {
      try {
        const file = parseSessionFileAddress(props.resourceAddress);
        if (file === undefined) throw { code: 'video/address' };
        const result = await readWholeFile({
          read: (options) => ctx.remote.workspaceFiles.readBytes(file.sessionId, file.path, options, signal),
          signal,
          maxBytes: MAX_VIDEO_BYTES,
          onProgress: (loaded, total) => {
            if (!disposed) setState({ phase: 'loading', loaded, total });
          },
        });
        if (disposed) return;
        const mediaType = mediaTypeForPath(file.path) ?? 'video/mp4';
        objectUrl = URL.createObjectURL(new Blob(result.chunks, { type: mediaType }));
        const size = result.total ?? result.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        setState({ phase: 'ready', url: objectUrl, size });
        request.loaded(result.version);
      } catch (error) {
        if (disposed || signal.aborted) return;
        request.failed();
        setState({ phase: 'failed', message: describeFailure(error, t) });
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
    // The revision is the reload signal; the address cannot change under a mounted tab.
  }, [revision, props.resourceAddress]);

  if (state.phase === 'failed') {
    return h('div', { className: 'wfp-video wfp-video-center' }, [
      h('style', { key: 'style' }, VIDEO_STYLE),
      h('div', { className: 'wfp-video-error', role: 'alert' }, [
        h('p', { className: 'wfp-video-error-text' }, state.message),
        h(
          'button',
          {
            type: 'button',
            className: 'wfp-video-retry',
            'data-wfp-video-retry': true,
            onClick: () => request?.reload(),
          },
          t('video.retry'),
        ),
      ]),
    ]);
  }

  if (state.phase !== 'ready') {
    const loaded = formatBytes(state.loaded);
    const total = formatBytes(state.total);
    const label = total === ''
      ? t('video.loading.bytes', { loaded })
      : t('video.loading.progress', { loaded, total });
    return h('div', { className: 'wfp-video wfp-video-center' }, [
      h('style', { key: 'style' }, VIDEO_STYLE),
      h('div', { className: 'wfp-video-progress', role: 'status' }, [
        h('div', { className: 'wfp-video-progress-track' }, [
          h('div', {
            className: 'wfp-video-progress-bar',
            style: { width: `${progressPercent(state.loaded ?? 0, state.total)}%` },
          }),
        ]),
        h('p', { className: 'wfp-video-note' }, label),
      ]),
    ]);
  }

  const facts = [];
  if (state.size !== undefined) facts.push(formatBytes(state.size));
  if (media?.duration !== undefined) facts.push(formatDuration(media.duration));
  if (media?.width !== undefined && media?.height !== undefined) {
    facts.push(t('video.meta.dimensions', { width: media.width, height: media.height }));
  }
  return h('div', { className: 'wfp-video' }, [
    h('style', { key: 'style' }, VIDEO_STYLE),
    h('div', { className: 'wfp-video-stage', ref: props.scrollportRef }, [
      h('video', {
        className: 'wfp-video-player',
        'data-wfp-video-player': true,
        src: state.url,
        controls: true,
        playsInline: true,
        preload: 'metadata',
        onLoadedMetadata: (event) => {
          const element = event.currentTarget;
          setMedia({ duration: element.duration, width: element.videoWidth, height: element.videoHeight });
        },
        onError: () => setMedia((current) => ({ ...current, decodeFailed: true })),
      }),
    ]),
    h('div', { className: 'wfp-video-bar' }, [
      h('span', { className: 'wfp-video-name', title: displayName(props.resourceAddress) }, displayName(props.resourceAddress)),
      facts.length > 0 ? h('span', { className: 'wfp-video-meta' }, facts.join(' · ')) : null,
    ]),
    media?.decodeFailed === true ? h('p', { className: 'wfp-video-warn' }, t('video.error.decode')) : null,
  ]);
}

/** Stylesheet the video renderer injects with its body. */
export const VIDEO_STYLE = `
.wfp-video{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;gap:8px;padding:12px;font-family:var(--dsw-font,inherit);color:var(--dsw-alias-label-primary,#333)}
.wfp-video-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto;border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f6f7f8)}
.wfp-video-player{display:block;max-width:100%;max-height:100%;border-radius:6px;background:#000}
.wfp-video-center{align-items:center;justify-content:center}
.wfp-video-bar{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary,#777)}
.wfp-video-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;color:var(--dsw-alias-label-primary,#333)}
.wfp-video-meta{flex:none;font-variant-numeric:tabular-nums}
.wfp-video-progress{width:min(320px,100%);display:flex;flex-direction:column;gap:8px}
.wfp-video-progress-track{height:2px;border-radius:99px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.16));overflow:hidden}
.wfp-video-progress-bar{height:100%;border-radius:99px;background:#247bbf;transition:width .2s cubic-bezier(.23,1,.32,1)}
.wfp-video-note{margin:0;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-secondary,#888);text-align:center}
.wfp-video-error{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:420px;text-align:center}
.wfp-video-error-text{margin:0;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#333)}
.wfp-video-retry{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;border:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333);font-size:13px;cursor:pointer}
.wfp-video-retry:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}
.wfp-video-retry:focus-visible{outline:2px solid #247bbf;outline-offset:2px}
.wfp-video-warn{margin:0;font-size:12px;line-height:1.45;color:var(--dsw-alias-state-warn-label,#8a6d1f)}
@media (prefers-reduced-motion:reduce){.wfp-video-progress-bar{transition:none}}
`;
