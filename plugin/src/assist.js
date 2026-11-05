/**
 * Client half of the annotation assist channel.
 *
 * The reviewer writes the annotation, but the wording is the hard part: what
 * exactly has to change, in which state, for whom. This module asks the Host
 * for one draft of that sentence. The Host owns the model; the page only
 * speaks HTTP to it.
 *
 * The Host answers with the same envelope the English reader uses:
 *   `{ ok: true, result: { text } }` or
 *   `{ ok: false, error: { code, message } }`.
 *
 * A Host that has not loaded the plugin answers 404 (the SPA fallback) or 400
 * (the route exists but not the method). Both mean "this Host cannot help
 * yet", which is a different failure from "the model refused", so the two are
 * reported with different messages.
 */

/** The route the Host registers for the annotation draft. */
export const ROUTE = '/api/markdown-mermaid-preview';

/** The error codes that mean: this Host does not know the route (yet). */
const UNAVAILABLE_CODES = new Set(['mmd-annotate/unknown-method', 'mmd-annotate/unknown-action']);

/** The message a Host without the route gets. */
const UNAVAILABLE_MESSAGE = '宿主尚未提供 AI 辅助，请重启应用后重试';

/**
 * Build an error with a message the reviewer can read.
 * @param {string} message - the Chinese message.
 * @param {unknown} [cause] - what went wrong underneath.
 * @returns {Error} the error to throw.
 */
function makeError(message, cause) {
  const error = new Error(message);
  error.code = 'mmd-annotate/failed';
  if (cause !== undefined) error.cause = cause;
  return error;
}

/**
 * Ask the Host to draft one annotation.
 *
 * @param {object} payload - the context of the annotation: the file path, the
 *   picked element (or image region), the reviewer's own words, the intent
 *   and any extra requirement.
 * @param {object} [options] - the call options.
 * @param {Function} [options.fetch] - the fetch implementation; the page's own
 *   `fetch` by default.
 * @returns {Promise<string>} the drafted annotation.
 * @throws {Error} with a Chinese message when the Host cannot help.
 */
export async function requestDraft(payload, options = {}) {
  const doFetch = typeof options?.fetch === 'function' ? options.fetch : globalThis.fetch;
  if (typeof doFetch !== 'function') throw makeError('无法连接宿主服务，AI 辅助不可用');

  let response;
  try {
    response = await doFetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'annotate-draft', payload: payload ?? {} }),
    });
  } catch (error) {
    throw makeError('无法连接宿主服务，AI 辅助不可用', error);
  }

  if (response === null || typeof response !== 'object') throw makeError('宿主没有响应');
  if (response.status === 404 || response.status === 405 || response.status === 400) {
    throw makeError(UNAVAILABLE_MESSAGE);
  }

  let body;
  try {
    body = typeof response.json === 'function' ? await response.json() : null;
  } catch (error) {
    throw makeError('宿主返回了无法解析的响应', error);
  }

  if (body === null || typeof body !== 'object' || body.ok !== true) {
    const code = typeof body?.error?.code === 'string' ? body.error.code : '';
    const message = typeof body?.error?.message === 'string' ? body.error.message.trim() : '';
    if (UNAVAILABLE_CODES.has(code)) throw makeError(UNAVAILABLE_MESSAGE);
    throw makeError(message === '' ? 'AI 辅助生成失败，请重试' : message);
  }

  const text = typeof body.result?.text === 'string' ? body.result.text.trim() : '';
  if (text === '') throw makeError('AI 没有返回可用内容，请重试');
  return text;
}

/**
 * Ask the Host one question about the file that is open in the preview.
 *
 * This is the side chat channel: the answer comes from the Host's model, so
 * the question never reaches the main conversation and the conversation the
 * reader is having stays exactly where it was.
 *
 * @param {object} payload - the question and its context: the file path, the
 *   text the reader selected, the file content, the question itself and the
 *   turns that came before it.
 * @param {object} [options] - the call options.
 * @param {Function} [options.fetch] - the fetch implementation; the page's own
 *   `fetch` by default.
 * @returns {Promise<string>} the answer.
 * @throws {Error} with a Chinese message when the Host cannot help.
 */
export async function requestAnswer(payload, options = {}) {
  const doFetch = typeof options?.fetch === 'function' ? options.fetch : globalThis.fetch;
  if (typeof doFetch !== 'function') throw makeError('无法连接宿主服务，AI 辅助不可用');

  let response;
  try {
    response = await doFetch(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'ask', payload: payload ?? {} }),
    });
  } catch (error) {
    throw makeError('无法连接宿主服务，AI 辅助不可用', error);
  }

  if (response === null || typeof response !== 'object') throw makeError('宿主没有响应');
  if (response.status === 404 || response.status === 405 || response.status === 400) {
    throw makeError(UNAVAILABLE_MESSAGE);
  }

  let body;
  try {
    body = typeof response.json === 'function' ? await response.json() : null;
  } catch (error) {
    throw makeError('宿主返回了无法解析的响应', error);
  }

  if (body === null || typeof body !== 'object' || body.ok !== true) {
    const code = typeof body?.error?.code === 'string' ? body.error.code : '';
    const message = typeof body?.error?.message === 'string' ? body.error.message.trim() : '';
    if (UNAVAILABLE_CODES.has(code)) throw makeError(UNAVAILABLE_MESSAGE);
    throw makeError(message === '' ? 'AI 辅助生成失败，请重试' : message);
  }

  const text = typeof body.result?.text === 'string' ? body.result.text.trim() : '';
  if (text === '') throw makeError('AI 没有返回可用内容，请重试');
  return text;
}
