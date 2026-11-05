/**
 * Tests for the host half of the annotation draft channel.
 *
 * The Host owns the model, so these tests drive a double that answers with a
 * fixed text. The two behaviours that matter are checked here: a usable
 * answer is read out of the model's JSON, and an answer that was cut in the
 * middle is asked for once more instead of being handed to the reviewer.
 *
 * Run with `node --test test/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftAnnotation } from '../host-ai.js';

/** An `llm` service that answers with the given texts, one per call. */
const llmDouble = (answers) => {
  let index = 0;
  return {
    prepareCall: async () => ({
      config: { provider: 'test', model: 'test-model', temperature: 0.3, maxTokens: 400 },
      stream: () => (async function* stream() {
        const answer = answers[Math.min(index, answers.length - 1)];
        index += 1;
        yield { type: 'text-delta', text: answer };
        yield { type: 'finish', reason: null };
      })(),
    }),
  };
};

/** The default model the Host would pick. */
const modelDouble = { currentSelection: () => ({ provider: 'test', model: 'test-model' }) };

/** The payload of one element annotation. */
const payload = {
  kind: 'element',
  path: 'prototype.html',
  tag: 'p',
  selector: 'body > main > p',
  subject: '认证失败',
  intent: 'copy',
};

test('the drafted annotation is read out of the model answer', async () => {
  const result = await draftAnnotation(payload, {
    llm: llmDouble(['{"text":"将“认证失败”改为“核身未通过”。"}']),
    agentDefaultModel: modelDouble,
  });
  assert.equal(result.text, '将“认证失败”改为“核身未通过”。');
});

test('an answer with prose around the JSON is still usable', async () => {
  const result = await draftAnnotation(payload, {
    llm: llmDouble(['好的，这是建议：{"text":"把状态改成“核身未通过”。"}']),
    agentDefaultModel: modelDouble,
  });
  assert.equal(result.text, '把状态改成“核身未通过”。');
});

test('an answer that was cut in the middle is asked for once more', async () => {
  let calls = 0;
  const llm = llmDouble(['{"text":"将“认证失败”改']);
  const counting = {
    prepareCall: async () => {
      calls += 1;
      return {
        config: { provider: 'test', model: 'test-model' },
        stream: () => (async function* stream() {
          const answer = calls === 1 ? '{"text":"将“认证失败”改' : '{"text":"将“认证失败”改为“核身未通过”。"}';
          yield { type: 'text-delta', text: answer };
          yield { type: 'finish', reason: null };
        })(),
      };
    },
  };
  const result = await draftAnnotation(payload, { llm: counting, agentDefaultModel: modelDouble });
  assert.equal(result.text, '将“认证失败”改为“核身未通过”。');
  assert.equal(calls, 2);
  assert.ok(llm !== null);
});

test('a model that never answers leaves the reviewer with a readable error', async () => {
  await assert.rejects(
    () => draftAnnotation(payload, { llm: llmDouble(['没有任何内容']), agentDefaultModel: modelDouble }),
    /AI 没有返回可用内容/,
  );
});

test('a Host without a model refuses the request', async () => {
  await assert.rejects(
    () => draftAnnotation(payload, { llm: undefined, agentDefaultModel: modelDouble }),
    /未配置可用模型/,
  );
});
