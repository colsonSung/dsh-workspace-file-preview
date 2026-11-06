/**
 * Tests for the side chat channel: the Host answers a question about the
 * file that is open in the preview, and the answer never travels through the
 * main conversation.
 *
 * These tests drive a double that answers with a fixed text and records what
 * the model was asked, so both the answer and the context it was given are
 * checked.
 *
 * Run with `node --test test/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../host-ai.js';
import { requestAnswer } from '../src/assist.js';

/**
 * An `llm` service that answers with the given text and records every call.
 * @param {string} answer - the text the model returns.
 * @param {Array} calls - the recorded calls.
 * @returns {object} the service double.
 */
const llmDouble = (answer, calls) => ({
  prepareCall: async () => ({
    config: { provider: 'test', model: 'test-model', temperature: 0.3, maxTokens: 1200 },
    stream: (request) => {
      calls?.push(request);
      return (async function* stream() {
        yield { type: 'text-delta', text: answer };
        yield { type: 'finish', reason: null };
      })();
    },
  }),
});

/** The default model the Host would pick. */
const modelDouble = { currentSelection: () => ({ provider: 'test', model: 'test-model' }) };

/** The payload of one side chat question. */
const payload = {
  path: 'docs/PRD.md',
  selection: '请求头超过限制后，再次启动失败。',
  question: '这个限制是谁定的？',
  content: '# PRD\n\n请求头超过限制后，再次启动失败。',
  history: [],
};

test('the question is answered and the answer is returned', async () => {
  const result = await answerQuestion(payload, {
    llm: llmDouble('Node.js 默认的 16KB 请求头上限。', []),
    agentDefaultModel: modelDouble,
  });
  assert.equal(result.text, 'Node.js 默认的 16KB 请求头上限。');
});

test('the model is asked about the file, the selection and the question', async () => {
  const calls = [];
  await answerQuestion(payload, {
    llm: llmDouble('答案', calls),
    agentDefaultModel: modelDouble,
  });
  assert.equal(calls.length, 1);
  const user = calls[0].messages[0].content[0].text;
  assert.match(user, /docs\/PRD\.md/);
  assert.match(user, /请求头超过限制后/);
  assert.match(user, /这个限制是谁定的/);
});

test('the earlier turns travel with the question', async () => {
  const calls = [];
  await answerQuestion(
    { ...payload, history: [{ role: 'user', text: '这个问题在讲什么' }, { role: 'assistant', text: '在讲请求头' }] },
    { llm: llmDouble('答案', calls), agentDefaultModel: modelDouble },
  );
  const user = calls[0].messages[0].content[0].text;
  assert.match(user, /这个问题在讲什么/);
  assert.match(user, /在讲请求头/);
});

test('a turn without a role is dropped rather than guessed at', async () => {
  const calls = [];
  await answerQuestion(
    { ...payload, history: [{ text: '没有角色' }, { role: 'user', text: '有角色' }] },
    { llm: llmDouble('答案', calls), agentDefaultModel: modelDouble },
  );
  const user = calls[0].messages[0].content[0].text;
  assert.doesNotMatch(user, /没有角色/);
  assert.match(user, /有角色/);
});

test('an empty question is refused', async () => {
  await assert.rejects(
    () => answerQuestion({ ...payload, question: '   ' }, { llm: llmDouble('答案', []), agentDefaultModel: modelDouble }),
    /请先输入问题/,
  );
});

test('a Host without a model is refused with a readable message', async () => {
  await assert.rejects(
    () => answerQuestion(payload, { llm: undefined, agentDefaultModel: modelDouble }),
    /宿主未配置可用模型/,
  );
});

test('the client gets the answer text', async () => {
  const answer = await requestAnswer(payload, {
    fetch: async () => ({
      status: 200,
      json: async () => ({ ok: true, result: { text: '  答案  ' } }),
    }),
  });
  assert.equal(answer, '答案');
});

test('the client is told what the Host refused', async () => {
  await assert.rejects(
    () => requestAnswer(payload, {
      fetch: async () => ({
        status: 200,
        json: async () => ({ ok: false, error: { code: 'wfp-annotate/failed', message: '宿主未配置可用模型，AI 辅助不可用' } }),
      }),
    }),
    /宿主未配置可用模型/,
  );
});

test('a Host that does not know the route says so', async () => {
  await assert.rejects(
    () => requestAnswer(payload, { fetch: async () => ({ status: 404, json: async () => ({}) }) }),
    /宿主尚未提供 AI 辅助/,
  );
});
