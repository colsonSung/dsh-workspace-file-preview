import { Fragment, createElement as h, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAbsolutePath, joinPath, pathBasename, pathDirname, pathParts, relativeToRoot, toPosixPath } from '../paths.js';
import { buildAttachmentParts, collectFiles, createAttachments, dropAttachment, isImageFile, revokeAttachments } from './attachments.js';
import { requestAnswer, requestDraft } from './assist.js';

// Optional host primitive; fall back to plain text when the module table lacks it.
let MarkdownText = null;
try {
  MarkdownText = require('@deepseek-ai/dsh-client-ui-primitives').MarkdownText ?? null;
} catch {
  MarkdownText = null;
}

const NS = 'markdownMermaidPreview';
const BODY_ID = '@local/markdown-mermaid-preview/markdown';

const zh = {
  'viewer.label': 'Markdown (Mermaid)',
  'code.copy': '复制',
  'code.copied': '已复制',
  'codeBlock.title': '代码',
  'codeBlock.wrap': '换行',
  'codeBlock.unwrap': '不换行',
  footnotes: '脚注',
  'mermaid.rendering': '正在渲染图表…',
  'mermaid.failed': 'Mermaid 图表渲染失败，已显示源码。',
  'mermaid.zoomIn': '放大',
  'mermaid.zoomOut': '缩小',
  'mermaid.fit': '自适应',
  'reveal.tooltip': '在文件树中定位',
  'reveal.label': '定位',
  'htmlAnnotate.label': 'HTML (AI 标注)',
  'imageAnnotate.label': '图片 (AI 标注)',
  'annotate.imageMessage': '请参考图片 `{path}` 上的标注区域（百分比坐标）：\n{list}',
  'annotate.region': '区域 {x}%–{x2}%，{y}%–{y2}%',
  'annotate.dragHint': '在图上拖拽框选要修改的区域',
  'annotate.toggle': 'AI 标注',
  'annotate.exit': '退出标注',
  'annotate.sendAll': '全部发送',
  'annotate.clear': '清空标注',
  'annotate.empty': '点击页面元素开始标注',
  'annotate.pickTitle': '标注这个元素',
  'annotate.placeholder': '这里要改成…',
  'annotate.count': '{count} 条标注',
  'annotate.countOne': '1 条标注',
  'annotate.failed': '无法读取这个 HTML 文件。',
  'annotate.loading': '正在加载 HTML…',
  'annotate.open': '标注',
  'annotate.openTitle': '打开 AI 标注视图（选择元素并写批注给 Agent）',
  'htmlAnnotate.tabTitle': 'HTML 标注',
  'annotate.message': '请修改文件 `{path}`，共有以下标注：\n{list}',
  'annotate.attach': '附件',
  'annotate.attachTitle': '添加附件或图片，也可以直接粘贴截图',
  'annotate.attachRemove': '移除附件',
  'annotate.attached': '{count} 个附件',
  'annotate.attachFailed': '附件添加失败：{message}',
  'annotate.sendFailed': '发送失败：{message}',
  'annotate.sending': '发送中…',
  'annotate.noSession': '当前会话不可用，附件未能随消息发送',
  'annotate.edit': '编辑',
  'annotate.editTitle': '编辑这条标注',
  'annotate.editHeading': '编辑标注',
  'annotate.save': '保存',
  'annotate.assist': 'AI 辅助',
  'annotate.assistTitle': '让 AI 起草这条标注',
  'annotate.assistNote': '补充要求（可选），例如「只改文案，不动交互」',
  'annotate.assistGenerate': '生成',
  'annotate.assistTemplate': '用模板',
  'annotate.assistBusy': '生成中…',
  'annotate.assistFailed': 'AI 没有返回可用内容，请重试',
  'annotate.assistDone': '已生成，可继续编辑',
  'annotate.assistTemplateDone': '已套用模板，可继续编辑',
  'annotate.intent.copy': '改文案',
  'annotate.intent.ux': '优化交互',
  'annotate.intent.issue': '指出问题',
  'annotate.intent.rule': '补充规则',
  'annotate.intent.translate': '翻译',
  'annotate.template.copy': '把「{text}」的文案改得更简洁明确，直接给出改后的文案。',
  'annotate.template.ux': '优化「{text}」所在区域的交互：说明点击后的反馈、状态变化，以及空态与异常态怎么处理。',
  'annotate.template.issue': '指出「{text}」在信息层级、状态语义和业务规则上的问题，并给出具体修改建议。',
  'annotate.template.rule': '补充「{text}」背后的业务规则与边界条件：空态、失败态、权限、限额与状态流转。',
  'annotate.template.translate': '把「{text}」翻译成英文，保持术语与界面语气一致。',
  'annotate.taskLabel': '任务',
  'annotate.task.change': '直接改',
  'annotate.task.plan': '先给方案',
  'annotate.task.review': '只提建议',
  'annotate.messagePlan': '请先给出修改方案，暂时不要改文件。目标文件 `{path}`，共有以下标注：\n{list}',
  'annotate.messageReview': '请只评审以下标注并给出你的意见，不要修改文件。目标文件 `{path}`：\n{list}',
  'annotate.imageMessagePlan': '请先给出修改方案，暂时不要改图片。目标图片 `{path}`，标注区域（百分比坐标）：\n{list}',
  'annotate.imageMessageReview': '请只评审以下标注并给出你的意见，不要修改图片。目标图片 `{path}`，标注区域（百分比坐标）：\n{list}',
  'filesTree.label': '文件树',
  'openWith.label': '打开',
  'aiChat.title': 'AI 对话',
  'aiChat.placeholder': '告诉 Agent 要改什么…',
  'aiChat.hint': '输入指令，Enter 发送给 Agent；Shift+Enter 换行',
  'aiChat.minimize': '最小化',
  'aiChat.attachHint': '打开文件树，用「加到对话」把文件加入输入框',
  'aiChat.permission': '权限',
  'aiChat.model': '模型',
  'aiChat.confirmDanger': '切换到该权限会放宽工具审批，确认继续？',
  'aiChat.add': '添加',
  'aiChat.addFile': '文件',
  'aiChat.commands': '命令',
  'aiChat.filePrompt': '输入要引用的文件路径（相对工作区）',
  'edit.toggle': '编辑',
  'edit.save': '保存',
  'edit.cancel': '取消',
  'edit.saving': '保存中…',
  'edit.saved': '已保存',
  'edit.partial': '文件尚未完整载入，滚动到底部后再编辑',
  'edit.hint': '直接编辑 Markdown 源码，保存后写回文件',
  'filesTree.open': '打开文件树',
  'chat.add': '加到对话',
  'chat.addTitle': '把这个文件加入对话',
  'chat.edit': '让 Agent 改',
  'chat.editTitle': '让 Agent 修改这个文件',
  'chat.editPlaceholder': '描述你要做的修改…',
  'chat.comment': '评论到对话',
  'chat.commentTitle': '把选中的内容发给 Agent',
  'chat.commentPlaceholder': '写下你的评论…',
  'chat.send': '发送',
  'chat.close': '关闭',
  'chat.addTemplate': '请参考文件 `{path}` ',
  'chat.editTemplate': '请修改文件 `{path}`：{instruction}',
  'chat.commentTemplate': '关于文件 `{path}` 中我选中的内容：\n\n{selection}\n\n{comment}',
  'chat.addSelection': '加入对话',
  'chat.copy': '复制',
  'chat.addSelectionTitle': '把选中的内容加入对话',
  'chat.askSide': '侧边提问',
  'chat.askSideTitle': '在侧边对话里问，不打断当前会话',
  'sideChat.title': '侧边对话',
  'sideChat.context': '引用',
  'sideChat.placeholder': '就这段内容提问…',
  'sideChat.empty': '问点什么吧。',
  'sideChat.ask': '提问',
  'sideChat.failed': '提问失败：{message}',
  'mdAnnotate.toggle': '标注',
  'mdAnnotate.hint': '点击文档里的段落开始标注',
  'mdAnnotate.pickTitle': '标注这段内容',
  'mdAnnotate.placeholder': '写下要改的地方…',
  'reveal.openTree': '打开文件树',
  'reveal.loading': '正在读取目录…',
  'reveal.failed': '目录读取失败。',
  'reveal.empty': '空目录。',
  'reveal.truncated': '条目太多，只显示了一部分。',
  'reveal.current': '当前文件',
  'files.typeLabel': '文件',
  'files.guideTitle': '工作区文件',
  'files.guideDescription': '浏览会话工作区的文件',
  'files.reload': '重新加载',
  'files.noCwd': '当前会话没有工作目录。',
  'files.noReveal': '在文件预览中点击「定位」以展开到对应文件。',
  'tree.newFile': '新建文件…',
  'tree.newFolder': '新建文件夹…',
  'tree.reveal': '在文件管理器中显示',
  'tree.addToChat': '加入对话',
  'tree.cut': '剪切',
  'tree.copy': '复制',
  'tree.paste': '粘贴',
  'tree.copyPath': '复制路径',
  'tree.copyRelativePath': '复制相对路径',
  'tree.rename': '重命名…',
  'tree.delete': '删除',
  'tree.namePrompt': '名称',
  'tree.renamePrompt': '新名称',
  'tree.deleteConfirm': '确认删除 {name}？',
  'tree.search': '搜索文件…',
  'tree.pinned': '置顶',
  'tree.pin': '置顶',
  'tree.unpin': '取消置顶',
  'tree.noResults': '没有匹配的文件',
  'tree.collapseAll': '全部折叠',
};
const en = {
  'viewer.label': 'Markdown (Mermaid)',
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'codeBlock.title': 'Code',
  'codeBlock.wrap': 'Wrap',
  'codeBlock.unwrap': 'No wrap',
  footnotes: 'Footnotes',
  'mermaid.rendering': 'Rendering diagram…',
  'mermaid.failed': 'Mermaid diagram failed to render; showing source.',
  'mermaid.zoomIn': 'Zoom in',
  'mermaid.zoomOut': 'Zoom out',
  'mermaid.fit': 'Fit',
  'reveal.tooltip': 'Reveal in file tree',
  'reveal.label': 'Locate',
  'htmlAnnotate.label': 'HTML (AI Annotate)',
  'imageAnnotate.label': 'Image (AI Annotate)',
  'annotate.imageMessage': 'Please check these annotated regions (percentage coordinates) on the image `{path}`:\n{list}',
  'annotate.region': 'Region {x}%–{x2}%, {y}%–{y2}%',
  'annotate.dragHint': 'Drag on the image to select a region',
  'annotate.toggle': 'AI Annotate',
  'annotate.exit': 'Exit Editing',
  'annotate.sendAll': 'Send all',
  'annotate.clear': 'Clear comments',
  'annotate.empty': 'Click an element to start annotating',
  'annotate.pickTitle': 'Annotate this element',
  'annotate.placeholder': 'Change this to…',
  'annotate.count': '{count} annotations',
  'annotate.countOne': '1 annotation',
  'annotate.failed': 'Could not read this HTML file.',
  'annotate.loading': 'Loading HTML…',
  'annotate.open': 'Annotate',
  'annotate.openTitle': 'Open the AI annotation view (pick elements and comment for the Agent)',
  'htmlAnnotate.tabTitle': 'Annotate HTML',
  'annotate.message': 'Please change the file `{path}` with these annotations:\n{list}',
  'annotate.attach': 'Attach',
  'annotate.attachTitle': 'Attach a file or image, or paste a screenshot',
  'annotate.attachRemove': 'Remove attachment',
  'annotate.attached': '{count} attachments',
  'annotate.attachFailed': 'Could not attach the file: {message}',
  'annotate.sendFailed': 'Could not send: {message}',
  'annotate.sending': 'Sending…',
  'annotate.noSession': 'This session is unavailable, so the attachments were not sent',
  'annotate.edit': 'Edit',
  'annotate.editTitle': 'Edit this annotation',
  'annotate.editHeading': 'Edit annotation',
  'annotate.save': 'Save',
  'annotate.assist': 'AI assist',
  'annotate.assistTitle': 'Let the AI draft this annotation',
  'annotate.assistNote': 'Extra requirement (optional), e.g. "copy only, keep the interaction"',
  'annotate.assistGenerate': 'Generate',
  'annotate.assistTemplate': 'Use template',
  'annotate.assistBusy': 'Generating…',
  'annotate.assistFailed': 'The AI returned nothing usable, please retry',
  'annotate.assistDone': 'Drafted — keep editing it',
  'annotate.assistTemplateDone': 'Template applied — keep editing it',
  'annotate.intent.copy': 'Copy',
  'annotate.intent.ux': 'Interaction',
  'annotate.intent.issue': 'Issues',
  'annotate.intent.rule': 'Rules',
  'annotate.intent.translate': 'Translate',
  'annotate.template.copy': 'Rewrite the copy of "{text}" so it is clearer and more direct, and give the final wording.',
  'annotate.template.ux': 'Improve the interaction around "{text}": state the feedback after the click, the state changes, and how the empty and error states are handled.',
  'annotate.template.issue': 'Flag the problems of "{text}" in information hierarchy, state semantics and business rules, and give concrete fixes.',
  'annotate.template.rule': 'Add the business rules behind "{text}": empty state, failure state, permissions, limits and state transitions.',
  'annotate.template.translate': 'Translate "{text}" into English, keeping the terminology and the tone of the interface.',
  'annotate.taskLabel': 'Task',
  'annotate.task.change': 'Edit now',
  'annotate.task.plan': 'Plan first',
  'annotate.task.review': 'Review only',
  'annotate.messagePlan': 'Please propose a plan for the following changes first; do not change the file yet. Target file `{path}`:\n{list}',
  'annotate.messageReview': 'Please review the following annotations and give your opinion; do not change the file. Target file `{path}`:\n{list}',
  'annotate.imageMessagePlan': 'Please propose a plan for the following changes first; do not change the image yet. Target image `{path}`:\n{list}',
  'annotate.imageMessageReview': 'Please review the following annotations and give your opinion; do not change the image. Target image `{path}`:\n{list}',
  'filesTree.label': 'Files',
  'openWith.label': 'Open',
  'aiChat.title': 'AI chat',
  'aiChat.placeholder': 'Tell the Agent what to change…',
  'aiChat.hint': 'Type an instruction; Enter sends it to the Agent, Shift+Enter adds a line',
  'aiChat.minimize': 'Minimize',
  'aiChat.attachHint': 'Open the file tree and use "Add to chat"',
  'aiChat.permission': 'Permission',
  'aiChat.model': 'Model',
  'aiChat.confirmDanger': 'This permission relaxes tool approval. Continue?',
  'aiChat.add': 'Add',
  'aiChat.addFile': 'File',
  'aiChat.commands': 'Commands',
  'aiChat.filePrompt': 'Path of the file to reference (relative to the workspace)',
  'edit.toggle': 'Edit',
  'edit.save': 'Save',
  'edit.cancel': 'Cancel',
  'edit.saving': 'Saving…',
  'edit.saved': 'Saved',
  'edit.partial': 'The file has not fully loaded; scroll to the end before editing',
  'edit.hint': 'Edit the Markdown source directly; saving writes the file back',
  'filesTree.open': 'Open file tree',
  'chat.add': 'Add to chat',
  'chat.addTitle': 'Add this file to the chat',
  'chat.edit': 'Ask Agent',
  'chat.editTitle': 'Ask the Agent to change this file',
  'chat.editPlaceholder': 'Describe the change…',
  'chat.comment': 'Comment to chat',
  'chat.commentTitle': 'Send the selected text to the Agent',
  'chat.commentPlaceholder': 'Write your comment…',
  'chat.send': 'Send',
  'chat.close': 'Close',
  'chat.addTemplate': 'Please refer to the file `{path}` ',
  'chat.editTemplate': 'Please change the file `{path}`: {instruction}',
  'chat.commentTemplate': 'About the text I selected in `{path}`:\n\n{selection}\n\n{comment}',
  'chat.addSelection': 'Add to chat',
  'chat.copy': 'Copy',
  'chat.addSelectionTitle': 'Add the selected text to the chat',
  'chat.askSide': 'Ask in side chat',
  'chat.askSideTitle': 'Ask about it in the side chat, without interrupting this conversation',
  'sideChat.title': 'Side chat',
  'sideChat.context': 'Cited',
  'sideChat.placeholder': 'Ask about this selection…',
  'sideChat.empty': 'Ask something about this file.',
  'sideChat.ask': 'Ask',
  'sideChat.failed': 'The question failed: {message}',
  'mdAnnotate.toggle': 'Annotate',
  'mdAnnotate.hint': 'Click a block to annotate',
  'mdAnnotate.pickTitle': 'Annotate this block',
  'mdAnnotate.placeholder': 'Write what has to change…',
  'reveal.openTree': 'Open file tree',
  'reveal.loading': 'Reading directory…',
  'reveal.failed': 'Failed to read the directory.',
  'reveal.empty': 'Empty directory.',
  'reveal.truncated': 'Too many entries, showing only some of them.',
  'reveal.current': 'Current file',
  'files.typeLabel': 'Files',
  'files.guideTitle': 'Workspace files',
  'files.guideDescription': 'Browse files in this session\'s workspace',
  'files.reload': 'Reload',
  'files.noCwd': 'This session has no working directory.',
  'files.noReveal': 'Click "Locate" in a file preview to expand to that file.',
  'tree.newFile': 'New File…',
  'tree.newFolder': 'New Folder…',
  'tree.reveal': 'Reveal in File Manager',
  'tree.addToChat': 'Add to Chat',
  'tree.cut': 'Cut',
  'tree.copy': 'Copy',
  'tree.paste': 'Paste',
  'tree.copyPath': 'Copy Path',
  'tree.copyRelativePath': 'Copy Relative Path',
  'tree.rename': 'Rename…',
  'tree.delete': 'Delete',
  'tree.namePrompt': 'Name',
  'tree.renamePrompt': 'New name',
  'tree.deleteConfirm': 'Delete {name}?',
  'tree.search': 'Search files…',
  'tree.pinned': 'Pinned',
  'tree.pin': 'Pin',
  'tree.unpin': 'Unpin',
  'tree.noResults': 'No matching files',
  'tree.collapseAll': 'Collapse all',
};

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u;
function splitFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (match === null) return undefined;
  return { source: match[1] ?? '', body: text.slice(match[0].length) };
}

function markdownImageUrl(base, documentPath, destination) {
  const suffix = destination.search(/[?#]/u);
  let path;
  try {
    path = decodeURIComponent(suffix === -1 ? destination : destination.slice(0, suffix));
  } catch {
    return undefined;
  }
  if (path.length === 0) return undefined;
  if (!/^[a-z]:[/\\]/iu.test(path) && /^[a-z][a-z\d+.-]*:/iu.test(path)) return undefined;
  if (!isAbsolutePath(path)) {
    if (documentPath === undefined) return undefined;
    // Resolve against the document's own directory, in the document's separator.
    path = joinPath(pathDirname(documentPath), path);
  }
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^`]*)$/;

/**
 * Split Markdown into plain segments and closed mermaid fences.
 * Unterminated fences stay in the plain Markdown stream.
 */
function splitMermaid(text) {
  const lines = text.split('\n');
  const segments = [];
  let plain = [];
  let fence = null; // { char, len, mermaid, open, lines }
  const flushPlain = () => {
    if (plain.length) {
      segments.push({ type: 'md', text: plain.join('\n') });
      plain = [];
    }
  };
  for (const line of lines) {
    if (fence === null) {
      const match = FENCE_OPEN.exec(line);
      const lang = match ? match[3].trim().toLowerCase() : '';
      if (match) {
        fence = { char: match[2][0], len: match[2].length, mermaid: lang === 'mermaid', open: line, lines: [] };
      } else {
        plain.push(line);
      }
      continue;
    }
    const closer = FENCE_OPEN.exec(line);
    if (closer && closer[2][0] === fence.char && closer[2].length >= fence.len && closer[3].trim() === '') {
      if (fence.mermaid) {
        flushPlain();
        segments.push({ type: 'mermaid', code: fence.lines.join('\n') });
      } else {
        plain.push(fence.open, ...fence.lines, line);
      }
      fence = null;
    } else {
      fence.lines.push(line);
    }
  }
  if (fence !== null) plain.push(fence.open, ...fence.lines);
  flushPlain();
  return segments;
}

const BR_TEXT = /^(?:\s*<br\s*\/?>\s*)+$/i;

/**
 * MarkdownText escapes raw HTML into literal text nodes. Upgrade text nodes that
 * consist solely of <br> tags into real line-break elements inside our own DOM.
 */
function upgradeBreaks(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('.mmd-mermaid-scroll, pre, code') !== null) continue;
    if (BR_TEXT.test(node.textContent)) targets.push(node);
  }
  for (const node of targets) {
    const count = (node.textContent.match(/<br\s*\/?>/gi) ?? []).length;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) {
      fragment.appendChild(document.createElement('br'));
    }
    node.parentNode?.replaceChild(fragment, node);
  }
}

function isDarkMode() {
  try {
    const style = getComputedStyle(document.body);
    // Transparent backgrounds must not read as black; trust text color first.
    const text = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(style.color);
    if (text) {
      const lum = 0.299 * Number(text[1]) + 0.587 * Number(text[2]) + 0.114 * Number(text[3]);
      return lum > 140; // light text means a dark theme
    }
    const bg = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?/.exec(style.backgroundColor);
    if (bg && (bg[4] === undefined || Number(bg[4]) > 0.5)) {
      const lum = 0.299 * Number(bg[1]) + 0.587 * Number(bg[2]) + 0.114 * Number(bg[3]);
      return lum < 128;
    }
  } catch {}
  return false;
}

const MERMAID_THEMES = {
  light: {
    background: 'transparent',
    primaryColor: '#e6f1ff',
    primaryBorderColor: '#8fb8ec',
    primaryTextColor: '#1c56b8',
    secondaryColor: '#f2f7ff',
    secondaryBorderColor: '#bcd4f4',
    secondaryTextColor: '#2b5aa0',
    tertiaryColor: '#ffffff',
    lineColor: '#8faddd',
    textColor: '#334155',
    mainBkg: '#e6f1ff',
    nodeBorder: '#8fb8ec',
    clusterBkg: '#f7fafe',
    clusterBorder: '#d5e0f0',
    titleColor: '#64748b',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#e6f1ff',
    actorBorder: '#8fb8ec',
    actorTextColor: '#1c56b8',
    signalColor: '#8faddd',
    signalTextColor: '#334155',
    labelBoxBkgColor: '#e6f1ff',
    labelBoxBorderColor: '#8fb8ec',
    labelTextColor: '#1c56b8',
    noteBkgColor: '#fff7e0',
    noteBorderColor: '#ecd28f',
    noteTextColor: '#7a5b16',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  dark: {
    background: 'transparent',
    primaryColor: '#1e3a5c',
    primaryBorderColor: '#4d719c',
    primaryTextColor: '#bcd6ff',
    secondaryColor: '#22304a',
    secondaryBorderColor: '#3d5878',
    secondaryTextColor: '#a9c8f2',
    tertiaryColor: '#161c26',
    lineColor: '#54749f',
    textColor: '#cbd5e1',
    mainBkg: '#1e3a5c',
    nodeBorder: '#4d719c',
    clusterBkg: '#182030',
    clusterBorder: '#33404f',
    titleColor: '#93a1b3',
    edgeLabelBackground: '#1c2430',
    actorBkg: '#1e3a5c',
    actorBorder: '#4d719c',
    actorTextColor: '#bcd6ff',
    signalColor: '#54749f',
    signalTextColor: '#cbd5e1',
    labelBoxBkgColor: '#1e3a5c',
    labelBoxBorderColor: '#4d719c',
    labelTextColor: '#bcd6ff',
    noteBkgColor: '#3a2f16',
    noteBorderColor: '#8a743a',
    noteTextColor: '#ecd28f',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
};

let mermaidSerial = 0;

const MAX_FIT_HEIGHT = 640;
const ZOOM_FACTORS = [0.5, 0.7, 0.85, 1, 1.25, 1.6, 2, 2.5, 3.2, 4];

function MermaidView({ code, done, t }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState(null); // intrinsic diagram size from the viewBox
  const [factor, setFactor] = useState(1); // 1 = fit; other values zoom relative to fit
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    setNatural(null);
    setFactor(1);
    require
      .async('./client.mermaid.js')
      .then((chunk) => chunk.default ?? chunk)
      .then((mermaid) => {
        const dark = isDarkMode();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: dark ? MERMAID_THEMES.dark : MERMAID_THEMES.light,
          flowchart: { curve: 'bumpX', padding: 6 },
          sequence: { boxMargin: 10, messageMargin: 36 },
        });
        return mermaid.render(`mmd-preview-${++mermaidSerial}`, code);
      })
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, done]);

  useLayoutEffect(() => {
    if (svg === null || boxRef.current === null) return;
    const el = boxRef.current.querySelector('svg');
    if (el === null) return;
    const viewBox = (el.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
      setNatural({ w: viewBox[2], h: viewBox[3] });
    } else {
      setNatural({ w: el.scrollWidth || 800, h: el.scrollHeight || 600 });
    }
  }, [svg]);

  useEffect(() => {
    if (boxRef.current === null) return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBoxWidth(width);
    });
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [svg]);

  if (failed) {
    return h('div', { className: 'mmd-mermaid mmd-mermaid-failed' }, [
      h('div', { className: 'mmd-mermaid-note', key: 'note' }, t('mermaid.failed')),
      h('pre', { key: 'pre' }, h('code', null, code)),
    ]);
  }
  if (svg === null) {
    return h('div', { className: 'mmd-mermaid mmd-mermaid-pending' }, t('mermaid.rendering'));
  }

  const fitScale =
    natural !== null && boxWidth > 0 ? Math.min(1, boxWidth / natural.w, MAX_FIT_HEIGHT / natural.h) : 1;
  const scale = fitScale * factor;
  const stage =
    natural !== null
      ? {
          width: `${Math.max(1, Math.round(natural.w * scale))}px`,
          height: `${Math.max(1, Math.round(natural.h * scale))}px`,
        }
      : undefined;
  const step = (direction) => {
    const index = ZOOM_FACTORS.findIndex((value) => Math.abs(value - factor) < 0.001);
    const next = Math.min(ZOOM_FACTORS.length - 1, Math.max(0, (index === -1 ? 3 : index) + direction));
    setFactor(ZOOM_FACTORS[next]);
  };

  return h('div', { className: 'mmd-mermaid', ref: boxRef }, [
    h(
      'div',
      { className: 'mmd-mermaid-scroll', key: 'scroll' },
      h('div', { className: 'mmd-mermaid-stage', style: stage, dangerouslySetInnerHTML: { __html: svg } }),
    ),
    natural === null
      ? null
      : h('div', { className: 'mmd-mermaid-controls', key: 'controls' }, [
          h(
            'button',
            {
              type: 'button',
              key: 'out',
              title: t('mermaid.zoomOut'),
              'aria-label': t('mermaid.zoomOut'),
              disabled: factor <= ZOOM_FACTORS[0],
              onClick: () => step(-1),
            },
            '−',
          ),
          h(
            'button',
            {
              type: 'button',
              key: 'fit',
              className: factor === 1 ? 'mmd-mermaid-scale mmd-active' : 'mmd-mermaid-scale',
              title: t('mermaid.fit'),
              onClick: () => setFactor(1),
            },
            `${Math.round(scale * 100)}%`,
          ),
          h(
            'button',
            {
              type: 'button',
              key: 'in',
              title: t('mermaid.zoomIn'),
              'aria-label': t('mermaid.zoomIn'),
              disabled: factor >= ZOOM_FACTORS[ZOOM_FACTORS.length - 1],
              onClick: () => step(1),
            },
            '+',
          ),
        ]),
  ]);
}

const STYLE = `
.mmd-document{min-width:0;font-family:var(--dsw-font,inherit);white-space:normal;padding:14px max(20px,2.5%)}
.mmd-frontmatter{border:.5px solid var(--dsw-alias-border-l2,#e2e2e2);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-layer-1,transparent);font-size:12px;color:var(--dsw-alias-label-primary,inherit);white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 16px;padding:10px 12px}
.mmd-frontmatter:empty{display:none}
.mmd-frontmatter pre{margin:0;font-family:var(--ds-font-family-code,monospace);white-space:inherit}
.mmd-mermaid{position:relative;margin:12px 0}
.mmd-mermaid-scroll{overflow:auto;max-height:78vh;border:.5px solid var(--dsw-alias-border-l2,#e6e6e6);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,transparent);padding:16px 12px}
.mmd-mermaid-stage{margin:0 auto}
.mmd-mermaid-stage svg{display:block;width:100%!important;height:100%!important;max-width:none!important}
.mmd-mermaid-controls{position:absolute;top:8px;right:8px;display:flex;gap:2px;align-items:center;padding:2px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 4px rgba(0,0,0,.08)}
.mmd-mermaid-controls button{min-width:26px;height:22px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font-size:12px;line-height:1;cursor:pointer}
.mmd-mermaid-controls button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-mermaid-controls button:disabled{opacity:.35;cursor:default}
.mmd-mermaid-controls .mmd-mermaid-scale{font-variant-numeric:tabular-nums}
.mmd-mermaid-controls .mmd-active{color:#247bbf}
.mmd-mermaid-pending{font-size:12px;opacity:.6;padding:8px 0}
.mmd-mermaid-note{font-size:12px;color:#b0503c;margin:4px 0}
.mmd-mermaid-failed pre{background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));border-radius:6px;padding:10px 12px;overflow-x:auto;font-size:12px}
.mmd-plain{white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--ds-font-family-code,monospace);font-size:12px}
.mmd-reveal{position:relative;display:inline-flex}
.mmd-reveal-trigger{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);cursor:pointer}
.mmd-reveal-trigger:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,currentColor)}
.mmd-reveal-panel{position:fixed;z-index:1000;display:flex;flex-direction:column;width:320px;max-height:380px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 6px 24px rgba(0,0,0,.14);overflow:hidden;text-align:left;font-family:var(--dsw-font,inherit)}
.mmd-reveal-head{display:flex;align-items:center;gap:6px;padding:8px 8px 6px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-reveal-crumbs{display:flex;align-items:center;flex:1;min-width:0;overflow-x:auto;white-space:nowrap}
.mmd-reveal-crumb{border:0;background:transparent;padding:2px 6px;border-radius:5px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;white-space:nowrap}
.mmd-reveal-crumb:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-reveal-crumb.mmd-active{color:var(--dsw-alias-label-primary,#222);font-weight:600}
.mmd-reveal-tree{flex:none;border:.5px solid var(--dsw-alias-border-l2,#ddd);background:transparent;padding:3px 8px;border-radius:6px;font-size:12px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-reveal-tree:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-reveal-list{display:flex;flex-direction:column;overflow-y:auto;padding:4px}
.mmd-reveal-row{display:flex;align-items:center;gap:7px;border:0;background:transparent;padding:5px 8px;border-radius:6px;font-size:12.5px;color:var(--dsw-alias-label-primary,#333);cursor:pointer;text-align:left}
.mmd-reveal-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-reveal-row[data-kind="other"]{opacity:.5;cursor:default}
.mmd-reveal-row.mmd-current{background:rgba(36,123,191,.12);color:#247bbf}
.mmd-reveal-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary,#888)}
.mmd-reveal-row.mmd-current .mmd-reveal-icon{color:#247bbf}
.mmd-reveal-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-reveal-badge{flex:none;font-size:10.5px;padding:1px 6px;border-radius:99px;background:#247bbf;color:#fff}
.mmd-reveal-note{padding:10px 12px;font-size:12px;color:var(--dsw-alias-label-secondary,#888)}
.mmd-reveal-labeled{width:auto;padding:0 8px;gap:5px;font-size:12px}
.mmd-reveal-text{font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,currentColor)}
.mmd-reveal-labeled:hover .mmd-reveal-text{color:var(--dsw-alias-label-primary,currentColor)}
.mmd-locate{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font,inherit);color:var(--dsw-alias-label-primary,#333)}
.mmd-locate-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-files-chip{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:180px}
.mmd-files-chip-icon{display:inline-flex;align-items:center;flex:none;color:#3b6db4}
.mmd-files-chip-label{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-locate-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.mmd-locate-tree{flex:1;min-height:0;overflow:auto;padding:6px 4px}
.mmd-locate-row{display:flex;align-items:center;gap:5px;width:100%;border:0;background:transparent;padding:1px 8px 1px 0;border-radius:5px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#333);cursor:pointer;text-align:left}
.mmd-locate-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-locate-row[data-kind="other"]{opacity:.5;cursor:default}
.mmd-locate-row.mmd-current{background:rgba(36,123,191,.14);color:#247bbf}
.mmd-locate-row.mmd-current .mmd-reveal-icon{color:#247bbf}
.mmd-locate-chevron{flex:none;width:14px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#999)}
.mmd-locate-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-tree-head{display:flex;align-items:center;gap:8px;padding:4px 8px 6px}
.mmd-tree-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}
.mmd-tree-head-actions{flex:none;display:inline-flex;align-items:center;gap:2px}
.mmd-tree-tool{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#777);cursor:pointer}
.mmd-tree-tool:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.mmd-tree-search{display:flex;align-items:center;gap:4px;margin:2px 4px 6px;padding:0 8px;height:28px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}
.mmd-tree-search-input{flex:1;min-width:0;border:0;outline:none;background:transparent;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#333)}
.mmd-tree-search-input::placeholder{color:var(--dsw-alias-label-tertiary,#aaa)}
.mmd-tree-search-clear{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-size:14px;padding:0 2px;border-radius:4px}
.mmd-tree-search-clear:hover{color:var(--dsw-alias-label-primary,#333)}
.mmd-tree-section{margin:2px 4px 6px}
.mmd-tree-section-title{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);padding:2px 4px 4px;font-weight:600}
.mmd-tree-pinned-row{position:relative;display:flex;align-items:center;border-radius:5px}
.mmd-tree-pinned-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-tree-pinned-btn{flex:1;min-width:0;display:flex;align-items:center;gap:6px;border:0;background:transparent;padding:2px 6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#333);cursor:pointer;text-align:left}
.mmd-tree-pin{flex:none;font-size:11px;opacity:.8}
.mmd-tree-pinned-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-tree-pin-remove{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-size:13px;padding:0 4px;opacity:0;border-radius:4px}
.mmd-tree-pinned-row:hover .mmd-tree-pin-remove{opacity:1}
.mmd-tree-pin-remove:hover{color:#b0503c}
.mmd-tree-result{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;padding:3px 6px;border-radius:5px;font-size:13px;color:var(--dsw-alias-label-primary,#333);cursor:pointer;text-align:left}
.mmd-tree-result:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-tree-result-name{flex:none;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-tree-result-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999)}
.mmd-ctx-menu{position:fixed;z-index:1200;min-width:200px;padding:4px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 24px rgba(0,0,0,.16);display:flex;flex-direction:column}
.mmd-ctx-item{display:block;width:100%;text-align:left;border:0;background:transparent;padding:5px 10px;border-radius:5px;font-size:12.5px;color:var(--dsw-alias-label-primary,#333);cursor:pointer;white-space:nowrap}
.mmd-ctx-item:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-ctx-item:disabled{opacity:.4;cursor:default}
.mmd-ctx-sep{height:1px;background:var(--dsw-alias-border-l2,#eee);margin:4px 6px}
.mmd-locate-note{padding:8px 12px;font-size:13px;color:var(--dsw-alias-label-secondary,#888)}
.mmd-pop{position:fixed;z-index:1001;display:flex;flex-direction:column;width:340px;padding:10px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 28px rgba(0,0,0,.16);text-align:left;font-family:var(--dsw-font,inherit)}
.mmd-pop-title{position:relative;display:block;padding-right:20px;font-size:12px;color:var(--dsw-alias-label-secondary,#777);margin-bottom:6px}
.mmd-pop-close{position:absolute;top:-4px;right:-4px;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:14px;line-height:1;cursor:pointer}
.mmd-pop-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-text{width:100%;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-bg-layer-1,#fff);resize:vertical;outline:none}
.mmd-pop-text:focus{border-color:#247bbf}
.mmd-pop-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.mmd-pop-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#999)}
.mmd-pop-send{border:0;border-radius:6px;padding:5px 12px;font-size:12px;color:#fff;background:#247bbf;cursor:pointer}
.mmd-pop-send:disabled{opacity:.4;cursor:default}
.mmd-pop-left{display:inline-flex;align-items:center;gap:8px;min-width:0}
.mmd-pop-attach{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#777);cursor:pointer}
.mmd-pop-attach:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-files{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.mmd-pop-file{position:relative;display:inline-flex;align-items:center;gap:6px;max-width:150px;padding:4px 6px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06))}
.mmd-pop-file-img{width:22px;height:22px;border-radius:4px;object-fit:cover;background:var(--dsw-alias-bg-layer-3,#eee)}
.mmd-pop-file-ico{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#eee);font-size:11px;color:var(--dsw-alias-label-secondary,#777)}
.mmd-pop-file-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-error{display:block;margin-top:6px;font-size:11px;color:#c0392b}
.mmd-pop-assist{display:block;margin-top:8px;padding:8px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06))}
.mmd-pop-assist-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.mmd-pop-chip{border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:99px;padding:2px 9px;font-size:11px;color:var(--dsw-alias-label-secondary,#777);background:transparent;cursor:pointer}
.mmd-pop-chip:hover{color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-chip-on{border-color:#247bbf;color:#247bbf;background:rgba(36,123,191,.1)}
.mmd-pop-note{width:100%;box-sizing:border-box;margin-bottom:6px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;padding:4px 7px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#333);background:var(--dsw-alias-bg-layer-1,#fff);outline:none}
.mmd-pop-note:focus{border-color:#247bbf}
.mmd-pop-assist-foot{display:flex;align-items:center;gap:6px}
.mmd-pop-assist-btn{border:0;border-radius:6px;padding:3px 10px;font-size:11.5px;color:#fff;background:#247bbf;cursor:pointer}
.mmd-pop-assist-btn:disabled{opacity:.4;cursor:default}
.mmd-pop-assist-tpl{border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;padding:3px 10px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#777);background:transparent;cursor:pointer}
.mmd-pop-assist-tpl:hover{color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-assist-toggle{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#777);cursor:pointer}
.mmd-pop-assist-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#333)}
.mmd-pop-assist-toggle-on{color:#247bbf;background:rgba(36,123,191,.12)}
.mmd-pop-assist-hint{display:block;margin-top:6px;font-size:11px;color:#2e7d32}
.mmd-anno-files{display:inline-flex;align-items:center;gap:3px;margin-left:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#777)}
.mmd-anno-notice{margin:6px 0 0;padding:6px 8px;border-radius:6px;font-size:12px;color:#c0392b;background:rgba(192,57,43,.08)}
.mmd-comment-btn{position:fixed;z-index:1001;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:99px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 2px 10px rgba(0,0,0,.14);font-size:12px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-comment-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
/* Host "open in app" split button, restyled to a compact Codex-like control. */
[data-open-target] {
  display: inline-flex;
  align-items: center;
  height: 28px;
  border: .5px solid var(--dsw-alias-border-l2, #e2e2e2);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
  overflow: hidden;
  transition: background .12s, border-color .12s;
}
[data-open-target]:hover {
  border-color: var(--dsw-alias-border-l3, #d0d0d0);
}
[data-open-target] > button {
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #333);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
}
[data-open-target] > button:first-child {
  gap: 6px;
  padding: 0 10px;
  max-width: 180px;
  white-space: nowrap;
}
[data-open-target] > button:first-child:hover,
[data-open-target] > button:last-child:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, .1));
}
[data-open-target] > button:last-child:not(:first-child) {
  width: 24px;
  padding: 0;
  border-left: .5px solid var(--dsw-alias-border-l2, #e2e2e2);
  color: var(--dsw-alias-label-secondary, #666);
}
[data-open-target] img {
  border-radius: 4px;
}
[data-open-target][data-state="busy"] > button {
  opacity: .55;
  cursor: default;
}
[data-open-target][data-size="large"] {
  height: 32px;
  border-radius: 10px;
}
[data-open-target][data-size="large"] > button:first-child {
  padding: 0 12px;
  font-size: 13px;
}
.mmd-zoom{display:inline-flex;align-items:center;gap:2px;padding:2px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);flex:none}
.mmd-zoom-btn{width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:13px;line-height:1;cursor:pointer}
.mmd-zoom-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-zoom-btn:disabled{opacity:.35;cursor:default}
.mmd-zoom-value{min-width:44px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums}
.mmd-zoom-value:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-img-scroll{position:relative;flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:12px}
.mmd-img-stage{position:relative;display:inline-block;line-height:0;flex:none}
.mmd-img-stage.mmd-img-editing{cursor:crosshair}
.mmd-img{display:block;width:100%;height:auto;user-select:none;-webkit-user-drag:none}
.mmd-img-region{position:absolute;border:1.5px solid #247bbf;background:rgba(36,123,191,.12);border-radius:2px;pointer-events:none}
.mmd-img-region .mmd-anno-badge{position:absolute;top:-9px;left:-9px}
.mmd-img-dragging{border-style:dashed;background:rgba(36,123,191,.18)}
.mmd-anno{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font,inherit)}
.mmd-anno-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-anno-active{border-color:#247bbf!important;color:#247bbf!important}
.mmd-anno-toggle{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.mmd-document,.mmd-anno{position:relative}
.mmd-fab-wrap{position:absolute;right:14px;bottom:16px;z-index:40;display:inline-flex}
.mmd-fab-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 16px rgba(0,0,0,.14);color:var(--dsw-alias-label-secondary,#666);cursor:pointer;transition:background .12s,color .12s}
.mmd-fab-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-btn.mmd-fab-active{background:#247bbf;border-color:#247bbf;color:#fff}
.mmd-fab-card{position:fixed;z-index:1000;display:flex;flex-direction:column;border:1px solid rgba(0,0,0,.07);border-radius:20px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 16px 48px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.04);overflow:hidden;min-width:320px;min-height:220px;will-change:transform;transform:translateZ(0);contain:layout paint;cursor:grab}
.mmd-fab-min{position:absolute;top:10px;right:12px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:15px;line-height:1;cursor:pointer}
.mmd-fab-min:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-body{flex:1;min-height:0;overflow-y:auto;padding:40px 22px 6px;font-size:13.5px;line-height:1.6;color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-empty{color:var(--dsw-alias-label-tertiary,#aaa);font-size:13px}
.mmd-fab-msg{padding:8px 12px;margin:6px 0;border-radius:12px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.07));overflow-wrap:anywhere}
.mmd-fab-compose{flex:none;width:100%;box-sizing:border-box;min-height:64px;max-height:160px;resize:none;border:0;outline:none;background:transparent;padding:6px 22px 2px;font:inherit;font-size:15px;line-height:1.55;color:var(--dsw-alias-label-primary,#222)}
.mmd-fab-compose::placeholder{color:var(--dsw-alias-label-tertiary,#aaa)}
.mmd-fab-bar{flex:none;display:flex;align-items:center;gap:6px;padding:8px 16px 14px}
.mmd-fab-plus{width:30px;height:30px;border:0;border-radius:99px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:19px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.mmd-fab-plus:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-fab-perm{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:#c2410c;font-size:13px;cursor:pointer;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-fab-perm:hover{background:rgba(194,65,12,.08)}
.mmd-fab-perm.mmd-fab-perm-active{background:rgba(194,65,12,.12)}
.mmd-fab-spacer{flex:1}
.mmd-fab-model{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#333);font-size:13px;cursor:pointer;max-width:200px;overflow:hidden;white-space:nowrap}
.mmd-fab-model:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-fab-model.mmd-fab-model-active{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-fab-caret{font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.mmd-fab-send{flex:none;width:34px;height:34px;border-radius:99px;border:0;background:#a8c8f0;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.mmd-fab-send:disabled{opacity:.75;cursor:default}
.mmd-fab-send:not(:disabled){background:#247bbf}
.mmd-fab-send:not(:disabled):hover{background:#1e6aa6}
.mmd-fab-menu{position:absolute;left:16px;bottom:56px;z-index:20;min-width:220px;max-height:280px;overflow-y:auto;padding:6px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 10px 30px rgba(0,0,0,.16)}
.mmd-fab-menu-head{padding:8px 10px 4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);font-weight:600}
.mmd-fab-menu-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:transparent;padding:7px 10px;border-radius:8px;font-size:13px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-fab-menu-row:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-fab-menu-icon{width:18px;flex:none;text-align:center;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.mmd-fab-menu-desc{margin-left:auto;padding-left:16px;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#aaa);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-fab-perm-item{display:flex;align-items:center;gap:8px;padding:10px 10px;border-radius:10px}
.mmd-fab-perm-icon{width:18px;flex:none;text-align:center;color:var(--dsw-alias-label-secondary,#666)}
.mmd-fab-menu-label{flex:1;min-width:0;font-size:13.5px}
.mmd-fab-menu-check{flex:none;color:var(--dsw-alias-label-primary,#333);font-size:13px}
.mmd-fab-menu-item{display:block;width:100%;text-align:left;border:0;background:transparent;padding:6px 8px;border-radius:6px;font-size:12.5px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-fab-menu-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-fab-menu-item.mmd-active{color:#247bbf;font-weight:600}
.mmd-fab-menu-group{margin-bottom:4px}
.mmd-fab-menu-title{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);padding:4px 8px}
.mmd-fab-h{position:absolute;z-index:3}
.mmd-fab-h-n{top:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}
.mmd-fab-h-s{bottom:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}
.mmd-fab-h-e{right:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}
.mmd-fab-h-w{left:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}
.mmd-fab-h-ne{top:-4px;right:-4px;width:14px;height:14px;cursor:nesw-resize}
.mmd-fab-h-nw{top:-4px;left:-4px;width:14px;height:14px;cursor:nwse-resize}
.mmd-fab-h-se{bottom:-4px;right:-4px;width:16px;height:16px;cursor:nwse-resize}
.mmd-fab-h-sw{bottom:-4px;left:-4px;width:14px;height:14px;cursor:nesw-resize}
.mmd-fab-h-se::after{content:'';position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-right:1.5px solid var(--dsw-alias-border-l3,#ccc);border-bottom:1.5px solid var(--dsw-alias-border-l3,#ccc);border-bottom-right-radius:3px;opacity:.8}
.mmd-fab-busy{user-select:none;cursor:grabbing;will-change:transform,width,height;box-shadow:0 6px 18px rgba(0,0,0,.12)}
.mmd-fab-busy iframe,.mmd-fab-busy *{pointer-events:none}
.mmd-edit-actions{display:inline-flex;align-items:center;gap:6px}
.mmd-edit-save{height:26px;padding:0 12px;font-size:12px}
.mmd-editor{display:flex;flex-direction:column;gap:8px;min-height:60vh}
.mmd-editor-bar{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l2,#e2e2e2);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);position:sticky;top:0;z-index:5}
.mmd-editor-tool{min-width:28px;height:26px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,#333);font-size:12.5px;cursor:pointer}
.mmd-editor-tool:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-editor-spacer{flex:1}
.mmd-editor-note{font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.mmd-editor-select{height:26px;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#333);font-size:12.5px;cursor:pointer}
.mmd-editor-sep{width:1px;height:18px;background:var(--dsw-alias-border-l2,#e2e2e2);margin:0 4px;flex:none}
.mmd-editor-surface{min-height:60vh;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,#e2e2e2);border-radius:10px;padding:18px 22px;font-size:14px;line-height:1.7;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-bg-layer-1,#fff);outline:none}
.mmd-editor-surface:focus{border-color:#247bbf}
.mmd-editor-surface h1{font-size:1.6em;margin:.6em 0 .4em}
.mmd-editor-surface h2{font-size:1.35em;margin:.6em 0 .4em}
.mmd-editor-surface h3{font-size:1.15em;margin:.6em 0 .4em}
.mmd-editor-surface p{margin:.5em 0}
.mmd-editor-surface ul,.mmd-editor-surface ol{padding-left:1.6em;margin:.5em 0}
.mmd-editor-surface blockquote{border-left:3px solid var(--dsw-alias-border-l3,#ddd);margin:.6em 0;padding:.2em 0 .2em 12px;color:var(--dsw-alias-label-secondary,#666)}
.mmd-editor-surface pre,.mmd-editor-surface code{font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:.92em}
.mmd-editor-surface pre{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));border-radius:8px;padding:10px 12px;overflow-x:auto}
.mmd-editor-surface code{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));border-radius:4px;padding:.1em .35em}
.mmd-editor-surface table{border-collapse:collapse;margin:.6em 0}
.mmd-editor-surface th,.mmd-editor-surface td{border:1px solid var(--dsw-alias-border-l2,#ddd);padding:6px 10px}
.mmd-editor-surface hr{border:0;border-top:1px solid var(--dsw-alias-border-l2,#ddd);margin:1em 0}
.mmd-editor-surface img{max-width:100%}
.mmd-editor-text:focus{border-color:#247bbf}

.mmd-anno{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font,inherit)}
.mmd-anno-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-anno-active{border-color:#247bbf!important;color:#247bbf!important}
.mmd-anno-toggle{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.mmd-document,.mmd-anno{position:relative}
.mmd-fab{position:absolute;right:14px;bottom:16px;z-index:40;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.mmd-fab-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 16px rgba(0,0,0,.14);color:var(--dsw-alias-label-secondary,#666);cursor:pointer;transition:background .12s,color .12s}
.mmd-fab-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-btn.mmd-fab-active{background:#247bbf;border-color:#247bbf;color:#fff}
.mmd-fab-card{width:420px;max-width:calc(100vw - 48px);max-height:min(520px, 70vh);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#e6e6e6);border-radius:18px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 18px 48px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.06);overflow:hidden}
.mmd-fab-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
.mmd-fab-min{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:15px;line-height:1;cursor:pointer}
.mmd-fab-min:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-fab-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}
.mmd-fab-body{flex:1;min-height:64px;overflow-y:auto;padding:4px 16px 10px;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-empty{color:var(--dsw-alias-label-tertiary,#999);font-size:12.5px;padding:6px 0}
.mmd-fab-msg{padding:7px 10px;margin:6px 0;border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));overflow-wrap:anywhere}
.mmd-fab-input{display:flex;align-items:flex-end;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.mmd-fab-text{flex:1;min-height:34px;max-height:120px;resize:none;border:0;outline:none;background:transparent;font:inherit;font-size:13.5px;line-height:1.5;color:var(--dsw-alias-label-primary,#222);padding:6px 2px}
.mmd-fab-text::placeholder{color:var(--dsw-alias-label-tertiary,#aaa)}
.mmd-fab-send{flex:none;width:32px;height:32px;border-radius:99px;border:0;background:#247bbf;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.mmd-fab-send:disabled{opacity:.35;cursor:default}
.mmd-fab-send:not(:disabled):hover{background:#1e6aa6}
.mmd-anno{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--dsw-font,inherit)}
.mmd-anno-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-anno-active{border-color:#247bbf!important;color:#247bbf!important}
.mmd-anno-toggle{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.mmd-document,.mmd-anno{position:relative}
.mmd-fab{position:absolute;top:10px;right:12px;z-index:40;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.mmd-fab-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:99px;border:.5px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 2px 10px rgba(0,0,0,.12);color:var(--dsw-alias-label-secondary,#666);cursor:pointer;transition:background .12s,color .12s}
.mmd-fab-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#333)}
.mmd-fab-btn.mmd-fab-active{background:#247bbf;border-color:#247bbf;color:#fff}
.mmd-fab-panel{width:300px;padding:10px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 28px rgba(0,0,0,.16);display:flex;flex-direction:column}

.mmd-anno-count{font-size:12px;color:var(--dsw-alias-label-secondary,#777)}
.mmd-anno-stage{position:relative;flex:1;min-height:0}
.mmd-anno-frame{display:block;width:100%;height:100%;border:0;background:#fff}
.mmd-anno-hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:99px;background:rgba(36,123,191,.1);color:#247bbf;font-size:12px;pointer-events:none}
.mmd-anno-list{position:absolute;top:8px;right:8px;width:280px;max-height:60%;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding:6px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 16px rgba(0,0,0,.12)}
.mmd-anno-item{display:flex;align-items:flex-start;gap:7px;padding:5px 6px;border-radius:6px;font-size:12px;color:var(--dsw-alias-label-primary,#333)}
.mmd-anno-badge{flex:none;min-width:17px;height:17px;border-radius:9px;background:#247bbf;color:#fff;font-size:10.5px;font-weight:600;line-height:17px;text-align:center}
.mmd-anno-text{flex:1;min-width:0;overflow-wrap:anywhere}
.mmd-anno-del{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-size:13px;padding:0 3px;border-radius:4px}
.mmd-anno-del:hover{color:#b0503c}
.mmd-anno-edit{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-size:12px;padding:0 3px;border-radius:4px}
.mmd-anno-edit:hover{color:#247bbf;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.mmd-anno-task{height:24px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-locate-row-wrap{position:relative}
.mmd-locate-action{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#999);opacity:0;cursor:pointer}
.mmd-locate-row-wrap:hover .mmd-locate-action{opacity:1}
.mmd-locate-action:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#333)}

/* The bar a reviewer reads a Markdown document with. */
.mmd-md-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-1,#fff);border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-md-bar-spacer{flex:1}
.mmd-anno-pill{flex:none;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;white-space:nowrap;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:99px;background:var(--dsw-alias-bg-layer-1,#fff);font:inherit;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#222);cursor:pointer}
.mmd-anno-pill:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-md-bar button.mmd-anno-toggle{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-md-bar button.mmd-anno-toggle>span:last-child{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.mmd-md-bar .mmd-anno-pill,.mmd-md-bar .mmd-reveal-tree,.mmd-md-bar .mmd-anno-task,.mmd-md-bar .mmd-pop-send{flex:none}
.mmd-md-bar-spacer{flex:1 1 0;min-width:0}
.mmd-anno-pill-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary,#777)}
.mmd-md-layer{position:absolute;inset:0;z-index:20;pointer-events:none}
.mmd-md-mark{position:absolute;min-width:18px;height:18px;border-radius:9px;background:#247bbf;color:#fff;font:600 11px/18px ui-sans-serif,system-ui,sans-serif;text-align:center;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.25)}
.mmd-md-outline{position:absolute;border:1.5px solid #247bbf;border-radius:4px;background:rgba(36,123,191,.06)}
.mmd-md-hint{position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:4px 12px;border-radius:99px;background:rgba(36,123,191,.1);color:#247bbf;font-size:12px;pointer-events:none;z-index:21}
.mmd-picking{cursor:crosshair}

/* The bar that follows a text selection. */
.mmd-sel-actions{position:fixed;z-index:2147483000;display:flex;align-items:stretch;transform:translate(-50%,-100%);border:.5px solid var(--dsw-alias-border-l2,#dcdcdc);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 6px 20px rgba(0,0,0,.14);overflow:hidden}
.mmd-sel-actions.mmd-sel-below{transform:translate(-50%,0)}
.mmd-sel-btn{padding:7px 14px;border:0;background:transparent;font:inherit;font-size:13px;line-height:1.2;color:var(--dsw-alias-label-primary,#1f1f1f);cursor:pointer;white-space:nowrap}
.mmd-sel-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-sel-sep{width:1px;margin:6px 0;background:var(--dsw-alias-border-l2,#e6e6e6)}

/* The menu a right click opens inside the document. */
.mmd-menu{position:fixed;z-index:2147483001;min-width:172px;padding:4px;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 10px 28px rgba(0,0,0,.18);display:flex;flex-direction:column}
.mmd-menu-item{padding:7px 10px;border:0;border-radius:6px;background:transparent;font:inherit;font-size:13px;line-height:1.3;text-align:left;color:var(--dsw-alias-label-primary,#222);cursor:pointer;white-space:nowrap}
.mmd-menu-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.mmd-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l2,#eee)}

/* The side chat: questions about this file that stay out of the main chat. */
.mmd-md-overlay{position:fixed;z-index:45;pointer-events:none}
.mmd-md-overlay>*{pointer-events:auto}
.mmd-side-chat{position:absolute;left:8px;right:8px;bottom:8px;z-index:45;display:flex;flex-direction:column;max-height:min(420px,72%);border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden}
.mmd-side-chat-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-side-chat-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}
.mmd-side-chat-file{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#999);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmd-side-chat-close{margin-left:auto;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px}
.mmd-side-chat-close:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#333)}
.mmd-side-chat-ctx{flex:none;max-height:76px;overflow-y:auto;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2,#f0f0f0);font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-secondary,#666);white-space:pre-wrap}
.mmd-side-chat-body{flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.mmd-side-chat-empty{font-size:12px;color:var(--dsw-alias-label-tertiary,#999)}
.mmd-side-chat-turn{max-width:86%;padding:6px 9px;border-radius:9px;font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.mmd-side-chat-user{align-self:flex-end;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,#222)}
.mmd-side-chat-assistant{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l2,#eee);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222)}
.mmd-side-chat-error{flex:none;padding:6px 10px;font-size:11.5px;color:var(--dsw-alias-state-error-primary,#b0503c)}
.mmd-side-chat-input{flex:none;display:flex;align-items:flex-end;gap:8px;padding:8px 10px;border-top:.5px solid var(--dsw-alias-border-l2,#eee)}
.mmd-side-chat-text{flex:1;min-height:30px;max-height:110px;resize:none;border:0;outline:none;background:transparent;font:inherit;font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary,#222);padding:4px 2px}
.mmd-side-chat-text::placeholder{color:var(--dsw-alias-label-tertiary,#999)}
.mmd-side-chat-send{flex:none;width:28px;height:28px;border-radius:99px;border:0;background:#247bbf;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.mmd-side-chat-send:disabled{opacity:.35;cursor:default}

`;

function annotateToggleIcon(size = 14, key) {
  return h(
    'svg',
    { key, viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block', flex: 'none' } },
    h('path', {
      d: 'M1.6 5.2h4.1M1.6 8.6h2.9',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.25,
      strokeLinecap: 'round',
    }),
    h('path', {
      d: 'M8.4 11.4l4.9-4.9 1.6 1.6-4.9 4.9-2.1.5.5-2.1z',
      fill: 'currentColor',
      opacity: 0.9,
    }),
  );
}

function annotateIcon(size = 15) {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M2.4 2.8h11.2M2.4 2.8v10.4M13.6 2.8v10.4M2.4 13.2h11.2',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeDasharray: '2.2 1.8',
      strokeLinecap: 'round',
    }),
    h('path', {
      d: 'M5.6 9.9l4.4-4.4 1.9 1.9-4.4 4.4-2.3.4.4-2.3z',
      fill: 'currentColor',
      opacity: 0.85,
    }),
  );
}

/* Paperclip glyph for the annotation dialog's attachment button. */
function attachIcon(size = 14) {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M10.6 4.2L5.9 8.9a1.5 1.5 0 002.1 2.1l4.6-4.6a2.6 2.6 0 10-3.7-3.7L3.5 7.3a3.6 3.6 0 105.1 5.1l3.9-3.9',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

/* Sparkle glyph for the annotation dialog's AI assist button. */
function sparkIcon(size = 13) {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M8 1.6l1.35 3.55L12.9 6.5 9.35 7.85 8 11.4 6.65 7.85 3.1 6.5l3.55-1.35z',
      fill: 'currentColor',
    }),
    h('path', {
      d: 'M12.4 10.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
      fill: 'currentColor',
      opacity: 0.7,
    }),
  );
}

/* Take over document tab chips so file-type icons stay distinguishable. */
const FILES_TYPE_ID = '@local/markdown-mermaid-preview/files';
const DOCUMENT_TYPE_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview';

function DocumentTitleChip({ useTabInfo }) {
  const { tab } = useTabInfo();
  const title = typeof tab.title === 'string' ? tab.title : '';
  return h(Fragment, null, [
    h('span', { className: 'mmd-files-title-icon', key: 'icon', 'aria-hidden': true }, entryIcon('file', title)),
    title,
  ]);
}

function FilesTitleChip({ useTabInfo }) {
  const { tab } = useTabInfo();
  return h(Fragment, null, [
    h('style', { key: 'style' }, STYLE),
    h('span', { className: 'mmd-files-chip', key: 'chip' }, [
      h('span', { className: 'mmd-files-chip-icon', key: 'icon' }, h(FolderChipIcon, { size: 16 })),
      h('span', { className: 'mmd-files-chip-label', key: 'label', title: tab.title }, tab.title),
    ]),
  ]);
}

const treeScrollMemory = new Map();
const treeClipboard = { op: null, path: null };

function loadPinned(root) {
  try {
    if (root === undefined) return [];
    const raw = window.localStorage.getItem(`mmd-pinned::${root}`);
    const parsed = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (typeof value === 'string') return [{ path: value, isDir: false }];
      if (value !== null && typeof value === 'object' && typeof value.path === 'string') {
        return [{ path: value.path, isDir: value.isDir === true }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function savePinned(root, list) {
  try {
    if (root !== undefined) window.localStorage.setItem(`mmd-pinned::${root}`, JSON.stringify(list));
  } catch {}
}

export function FilesTreeBody(props) {
  const { ctx, useTabInfo, sessionId, useSessions, renderSlot, inputActions, t } = props;
  const { tab } = useTabInfo();
  const navigation = tab.navigation;
  const reveal = navigation?.params?.reveal ?? null;
  const revision = navigation?.revision ?? 0;
  const cwd = typeof useSessions === 'function' ? useSessions((state) => state.byId?.[sessionId]?.cwd) : undefined;
  const root = typeof cwd === 'string' ? cwd.replace(/[/\\]+$/, '') : undefined;
  const [levels, setLevels] = useState({});
  const [expanded, setExpanded] = useState({});
  const mountedRef = useRef(true);
  const targetRef = useRef(null);
  const treeRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [pinned, setPinned] = useState(() => loadPinned(root));

  useEffect(() => {
    setPinned(loadPinned(root));
  }, [root]);

  useEffect(() => {
    const value = query.trim();
    if (value === '') {
      setResults(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      ctx.remote.fileReferences.list(sessionId, value, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return;
          setResults(result.ok ? result.value ?? [] : []);
        },
        () => {
          if (!controller.signal.aborted) setResults([]);
        },
      );
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, sessionId]);

  const rootName = root === undefined ? '' : pathBasename(root);
  const createInRoot = async (kind) => {
    if (root === undefined) return;
    const name = await askText(t('tree.namePrompt'));
    if (name === null) return;
    await fsOp(kind === 'file' ? 'create' : 'mkdir', joinPath(root, name));
    refreshDir(root);
  };

  // Pin and unpin stay explicit instead of being one toggle: a context menu
  // can outlive the state it was built from, and an explicit action must
  // never flip the wrong way because the list changed underneath it.
  const applyPinned = (path, isDir, want) => {
    setPinned((prev) => {
      const exists = prev.some((item) => item.path === path);
      if (want === exists) return prev;
      const next = want
        ? [{ path, isDir: isDir === true }, ...prev]
        : prev.filter((item) => item.path !== path);
      savePinned(root, next);
      return next;
    });
  };

  // Expand every ancestor of one path so it becomes visible, then scroll to it.
  const expandChainTo = (targetPath) => {
    if (root === undefined) return;
    const dir = targetPath === root ? root : targetPath;
    const relative = relativeToRoot(dir, root) ?? '';
    const chain = [];
    let acc = root;
    for (const segment of relative.split('/').filter(Boolean)) {
      acc = joinPath(acc, segment);
      chain.push(acc);
    }
    setExpanded((prev) => {
      const next = { ...prev };
      for (const path of chain) next[path] = true;
      return next;
    });
    for (const path of chain) if (levels[path] === undefined) loadLevel(path);
    if (levels[root] === undefined) loadLevel(root);
    requestAnimationFrame(() => {
      const node = treeRef.current?.querySelector(`[data-path="${CSS.escape(targetPath)}"]`);
      node?.scrollIntoView({ block: 'center' });
    });
  };

  useEffect(() => tab.actions.bindCommands({ refresh }), [tab.actions, expanded, root]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLevel = (path, force = false) => {
    setLevels((prev) => {
      const current = prev[path];
      if (current?.kind === 'ready' && !force) return prev;
      return { ...prev, [path]: { kind: 'loading', entries: current?.entries ?? null, truncated: current?.truncated ?? false } };
    });
    const controller = new AbortController();
    ctx.remote.workspaceFiles.list(sessionId, path, controller.signal).then(
      (result) => {
        if (!mountedRef.current) return;
        if (!result.ok) setLevels((prev) => ({ ...prev, [path]: { kind: 'failed' } }));
        else setLevels((prev) => ({ ...prev, [path]: { kind: 'ready', entries: orderEntries(result.value.entries), truncated: result.value.truncated } }));
      },
      () => {
        if (mountedRef.current) setLevels((prev) => ({ ...prev, [path]: { kind: 'failed' } }));
      },
    );
  };

  const refresh = () => {
    if (root === undefined) return;
    loadLevel(root);
    for (const path of Object.keys(expanded)) if (expanded[path]) loadLevel(path);
  };

  // Expand the ancestor chain of the revealed file.
  useEffect(() => {
    if (root === undefined) return;
    if (levels[root] === undefined) loadLevel(root);
    if (reveal === null || relativeToRoot(reveal, root) === undefined) return;
    const dir = pathDirname(reveal);
    const rel = dir === root ? '' : (relativeToRoot(dir, root) ?? '');
    let acc = root;
    const chain = [];
    if (rel !== '') {
      for (const segment of rel.split('/').filter(Boolean)) {
        acc = joinPath(acc, segment);
        chain.push(acc);
      }
    }
    setExpanded((prev) => {
      const next = { ...prev };
      for (const path of chain) next[path] = true;
      return next;
    });
    for (const path of chain) if (levels[path] === undefined) loadLevel(path);
  }, [root, reveal, revision]);

  // Keep the user's scroll position across reloads and remounts.
  useLayoutEffect(() => {
    const container = treeRef.current;
    if (container === null || root === undefined) return;
    const remembered = treeScrollMemory.get(root);
    if (remembered !== undefined && Math.abs(container.scrollTop - remembered) > 2) {
      container.scrollTop = remembered;
    }
  });

  // Scroll the revealed row into view once per new reveal request, never on
  // ordinary expand/collapse, so the user keeps their scroll position.
  const revealedRef = useRef(null);
  useEffect(() => {
    if (reveal === null || targetRef.current === null) return;
    const token = `${reveal}:${revision}`;
    if (revealedRef.current === token) return;
    const parent = pathDirname(reveal);
    if (levels[parent]?.kind === 'ready') {
      targetRef.current.scrollIntoView({ block: 'center' });
      revealedRef.current = token;
    }
  }, [levels, reveal, revision, expanded]);

  const openFile = (path) => {
    ctx.sidebarRight.openResource(sessionFileAddress(sessionId, path));
  };
  const toggle = (path) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
    if (levels[path] === undefined) loadLevel(path);
  };

  const [menu, setMenu] = useState(null);

  const fsOp = async (op, target, extra) => {
    try {
      const result = await ctx.remote.commands.execute(
        sessionId,
        '/mmd-fs ' + JSON.stringify({ op, path: target, ...extra }),
        [],
      );
      if (result !== null && typeof result === 'object' && result.ok === false) return String(result.error?.message ?? 'failed');
      if (result?.value?.kind === 'error') return String(result.value.text ?? 'failed');
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const refreshDir = (path) => {
    loadLevel(path, true);
  };
  const menuTarget = (path, isDir) => ({ path, isDir });

  const runMenuAction = async (action) => {
    const target = menu;
    setMenu(null);
    if (target === null) return;
    const dirPath = target.isDir ? target.path : pathDirname(target.path);
    if (action === 'newFile' || action === 'newFolder') {
      const name = await askText(t('tree.namePrompt'));
      if (name === null) return;
      await fsOp(action === 'newFile' ? 'create' : 'mkdir', joinPath(dirPath, name));
      refreshDir(dirPath);
    } else if (action === 'reveal') {
      try {
        await ctx.remote.session.openWorkspacePath({ path: target.path, action: 'reveal' });
      } catch {}
    } else if (action === 'addToChat') {
      addToChat(inputActions, relativeToRoot(target.path, root) ?? target.path, t, { isDir: target.isDir });
    } else if (action === 'cut' || action === 'copy') {
      treeClipboard.op = action;
      treeClipboard.path = target.path;
    } else if (action === 'paste') {
      if (treeClipboard.path === null) return;
      const name = pathBasename(treeClipboard.path);
      const destination = joinPath(dirPath, name);
      await fsOp(treeClipboard.op === 'cut' ? 'move' : 'copy', treeClipboard.path, { target: destination });
      if (treeClipboard.op === 'cut') treeClipboard.path = null;
      refreshDir(dirPath);
    } else if (action === 'copyPath') {
      try { await navigator.clipboard.writeText(target.path); } catch {}
    } else if (action === 'copyRelativePath') {
      const relative = relativeToRoot(target.path, root) ?? target.path;
      try { await navigator.clipboard.writeText(relative); } catch {}
    } else if (action === 'rename') {
      const current = pathBasename(target.path);
      const name = await askText(t('tree.renamePrompt'), current);
      if (name === null || name === current) return;
      await fsOp('rename', target.path, { target: joinPath(dirPath, name) });
      refreshDir(dirPath);
    } else if (action === 'pin') {
      applyPinned(target.path, target.isDir, true);
    } else if (action === 'unpin') {
      applyPinned(target.path, target.isDir, false);
    } else if (action === 'delete') {
      const name = pathBasename(target.path);
      if (!(await askConfirm(t('tree.deleteConfirm', { name })))) return;
      await fsOp('delete', target.path);
      refreshDir(dirPath);
    }
  };

  const menuItems = (target) => {
    if (target === null) return [];
    const items = [];
    const isPinned = pinned.some((item) => item.path === target.path);
    // A pinned path leads with the action that undoes the pin, so a
    // right-click on a pinned row reaches "unpin" without hunting for it.
    if (isPinned) items.push(['unpin', t('tree.unpin')], ['sep']);
    if (target.isDir) {
      items.push(['newFile', t('tree.newFile')], ['newFolder', t('tree.newFolder')]);
    }
    items.push(['reveal', t('tree.reveal')]);
    if (target.isDir) items.push(['paste', t('tree.paste'), treeClipboard.path === null]);
    items.push(['addToChat', t('tree.addToChat')]);
    items.push(['sep']);
    items.push(['cut', t('tree.cut')], ['copy', t('tree.copy')]);
    items.push(['sep']);
    items.push(['copyPath', t('tree.copyPath')], ['copyRelativePath', t('tree.copyRelativePath')]);
    if (!isPinned) items.push(['sep'], ['pin', t('tree.pin')]);
    items.push(['sep']);
    items.push(['rename', t('tree.rename')], ['delete', t('tree.delete')]);
    return items;
  };

  const renderRows = (path, depth) => {
    const level = levels[path];
    if (level === undefined || (level.kind === 'loading' && (level.entries ?? null) === null)) {
      return [h('div', { className: 'mmd-locate-note', key: `${path}:loading`, style: { paddingLeft: `${12 + (depth + 1) * 16}px` } }, t('reveal.loading'))];
    }
    if (level.kind === 'failed') {
      return [h('div', { className: 'mmd-locate-note', key: `${path}:failed`, style: { paddingLeft: `${12 + (depth + 1) * 16}px` } }, t('reveal.failed'))];
    }
    const rows = [];
    for (const entry of level.entries) {
      const child = joinPath(path, entry.name);
      const isDir = entry.type === 'directory';
      const isCurrent = child === reveal;
      rows.push(
        h('div', { key: child, className: 'mmd-locate-row-wrap' }, [
          h(
          'button',
          {
            type: 'button',
            key: 'row',
            className: isCurrent ? 'mmd-locate-row mmd-current' : 'mmd-locate-row',
            'data-kind': entry.type,
            style: { paddingLeft: `${6 + depth * 14}px` },
            title: isCurrent ? t('reveal.current') : entry.name,
            ref: isCurrent ? targetRef : undefined,
            'data-path': child,
            onContextMenu: (event) => {
              event.preventDefault();
              setMenu({ path: child, isDir, x: event.clientX, y: event.clientY });
            },
            onClick: () => {
              if (isDir) toggle(child);
              else if (entry.type === 'file') openFile(child);
            },
          },
          [
            isDir ? chevron(!!expanded[child]) : h('span', { className: 'mmd-locate-chevron', key: 'pad' }),
            h('span', { className: 'mmd-reveal-icon', key: 'icon' }, entryIcon(entry.type, entry.name)),
            h('span', { className: 'mmd-locate-name', key: 'name' }, entry.name),
            isCurrent ? h('span', { className: 'mmd-reveal-badge', key: 'badge' }, t('reveal.current')) : null,
          ],
          ),
          entry.type === 'file'
            ? h(
                'button',
                {
                  type: 'button',
                  key: 'chat',
                  className: 'mmd-locate-action',
                  title: t('chat.addTitle'),
                  'aria-label': t('chat.addTitle'),
                  onClick: (event) => {
                    event.stopPropagation();
                    addToChat(inputActions, relativeToRoot(child, root) ?? child, t);
                  },
                },
                chatBubbleIcon(13),
              )
            : null,
        ]),
      );
      if (isDir && expanded[child]) rows.push(...renderRows(child, depth + 1));
    }
    if (level.entries.length === 0) {
      rows.push(h('div', { className: 'mmd-locate-note', key: `${path}:empty`, style: { paddingLeft: `${12 + (depth + 1) * 16}px` } }, t('reveal.empty')));
    }
    if (level.truncated) {
      rows.push(h('div', { className: 'mmd-locate-note', key: `${path}:truncated`, style: { paddingLeft: `${12 + (depth + 1) * 16}px` } }, t('reveal.truncated')));
    }
    return rows;
  };

  return h('div', { className: 'mmd-locate' }, [
    h('style', { key: 'style' }, STYLE),
    h('div', { className: 'mmd-locate-head', key: 'head' }, [
      h('span', { className: 'mmd-locate-path', key: 'path', title: root ?? '', 'data-files-path': true }, root ?? ''),
      h(
        'button',
        {
          type: 'button',
          key: 'refresh',
          className: 'mmd-reveal-trigger',
          onClick: refresh,
          title: t('files.reload'),
          'aria-label': t('files.reload'),
          'aria-keyshortcuts': tab.refreshShortcut?.aria,
          'data-files-reload': true,
        },
        refreshIcon(),
      ),
      typeof renderSlot === 'function' ? renderSlot('sidebar.right.tab.files.actions', { absolutePath: root }) : null,
    ]),
    h(
      'div',
      {
        className: 'mmd-locate-tree',
        key: 'tree',
        ref: treeRef,
        onScroll: (event) => {
          if (root !== undefined) treeScrollMemory.set(root, event.currentTarget.scrollTop);
        },
        onContextMenu: (event) => {
          if (root === undefined) return;
          // A row that owns its own menu handles the click itself; only the
          // empty space around the rows falls back to the workspace root.
          if (event.target instanceof Element && event.target.closest('.mmd-locate-row, .mmd-tree-pinned-row') !== null) return;
          event.preventDefault();
          setMenu({ path: root, isDir: true, x: event.clientX, y: event.clientY });
        },
      },
      root === undefined
        ? [h('div', { className: 'mmd-locate-note', key: 'nocwd' }, t('files.noCwd'))]
        : [
            h('div', { className: 'mmd-tree-search', key: 'search' }, [
              h('input', {
                key: 'input',
                className: 'mmd-tree-search-input',
                placeholder: t('tree.search'),
                value: query,
                onChange: (event) => setQuery(event.target.value),
              }),
              query === '' ? null : h('button', {
                type: 'button', key: 'clear', className: 'mmd-tree-search-clear',
                onClick: () => setQuery(''),
              }, '×'),
            ]),
            h('div', { className: 'mmd-tree-head', key: 'head' }, [
              h('span', { className: 'mmd-tree-title', key: 'title', title: root ?? '' }, rootName),
              h('span', { className: 'mmd-tree-head-actions', key: 'actions' }, [
                h('button', {
                  type: 'button', key: 'newfile', className: 'mmd-tree-tool',
                  title: t('tree.newFile'), 'aria-label': t('tree.newFile'),
                  onClick: () => createInRoot('file'),
                }, newFileIcon()),
                h('button', {
                  type: 'button', key: 'newfolder', className: 'mmd-tree-tool',
                  title: t('tree.newFolder'), 'aria-label': t('tree.newFolder'),
                  onClick: () => createInRoot('folder'),
                }, newFolderIcon()),
                h('button', {
                  type: 'button', key: 'refresh', className: 'mmd-tree-tool',
                  title: t('files.reload'), 'aria-label': t('files.reload'),
                  onClick: refresh,
                }, refreshIcon()),
                h('button', {
                  type: 'button', key: 'collapse', className: 'mmd-tree-tool',
                  title: t('tree.collapseAll'), 'aria-label': t('tree.collapseAll'),
                  onClick: () => setExpanded({}),
                }, collapseIcon()),
              ]),
            ]),
            results === null
              ? [
                  pinned.length === 0
                    ? null
                    : h('div', { className: 'mmd-tree-section', key: 'pinned' },
                        h('div', { className: 'mmd-tree-section-title', key: 'title' }, t('tree.pinned')),
                        pinned.map((item) => {
                          const path = item.path;
                          const name = pathBasename(path) || path;
                          return h('div', {
                            className: 'mmd-tree-pinned-row', key: path,
                            onContextMenu: (event) => {
                              // A pinned row is a target of its own. Without
                              // this the click fell through to the tree's
                              // fallback menu, which acts on the workspace
                              // root instead of the pinned path.
                              event.preventDefault();
                              event.stopPropagation();
                              setMenu({ path, isDir: item.isDir, x: event.clientX, y: event.clientY });
                            },
                          }, [
                            h('button', {
                              type: 'button', key: 'open',
                              className: 'mmd-tree-pinned-btn',
                              title: path,
                              onClick: () => (item.isDir ? expandChainTo(path) : openFile(path)),
                            }, [
                              h('span', { className: 'mmd-tree-pin', key: 'pin' }, '📌'),
                              h('span', { className: 'mmd-tree-pinned-name', key: 'name' }, name),
                            ]),
                            h('button', {
                              type: 'button', key: 'remove',
                              className: 'mmd-tree-pin-remove',
                              title: t('tree.unpin'),
                              'aria-label': t('tree.unpin'),
                              onClick: () => applyPinned(path, item.isDir, false),
                            }, '×'),
                          ]);
                        }),
                      ),
                  ...renderRows(root, 0),
                ]
              : (results.length === 0
                  ? [h('div', { className: 'mmd-locate-note', key: 'noresults' }, t('tree.noResults'))]
                  : results.map((candidate) => {
                      const relative = String(candidate.path ?? '');
                      const absolute = isAbsolutePath(relative) ? relative : joinPath(root, relative);
                      const parts = pathParts(relative);
                      const name = parts.name || relative;
                      const parent = parts.directory.replace(/[/\\]+$/, '');
                      const isDir = candidate.kind === 'directory';
                      return h('button', {
                        type: 'button', key: absolute,
                        className: 'mmd-tree-result',
                        title: absolute,
                        onClick: () => {
                          if (isDir) {
                            setQuery('');
                            expandChainTo(absolute);
                          } else {
                            openFile(absolute);
                          }
                        },
                      }, [
                        h('span', { className: 'mmd-reveal-icon', key: 'icon' }, entryIcon(isDir ? 'directory' : 'file', name)),
                        h('span', { className: 'mmd-tree-result-name', key: 'name' }, name),
                        parent === '' ? null : h('span', { className: 'mmd-tree-result-path', key: 'path' }, parent),
                      ]);
                    })),
          ],
    ),
    menu === null
      ? null
      : h('div', {
          key: 'ctx-menu',
          className: 'mmd-ctx-menu',
          style: {
            left: `${Math.min(menu.x, window.innerWidth - 240)}px`,
            top: `${Math.min(menu.y, window.innerHeight - 320)}px`,
          },
          onMouseLeave: () => setMenu(null),
        }, menuItems(menu).map((item, index) =>
          item[0] === 'sep'
            ? h('div', { className: 'mmd-ctx-sep', key: `sep:${index}` })
            : h('button', {
                type: 'button',
                key: `${item[0]}:${index}`,
                className: 'mmd-ctx-item',
                disabled: item[2] === true,
                onClick: () => runMenuAction(item[0]),
              }, item[1]),
        )),
  ]);
}


/* ------------------------------------------------------------------ */
/* Shared widgets and helpers.                                        */
/* ------------------------------------------------------------------ */

const FILE_BADGES = {
  md: ['#4a8cf0', 'M↓'], markdown: ['#4a8cf0', 'M↓'], mdx: ['#4a8cf0', 'M↓'],
  js: ['#c98a1b', 'J'], mjs: ['#c98a1b', 'J'], cjs: ['#c98a1b', 'J'], jsx: ['#c98a1b', 'J'],
  ts: ['#2f6fb2', 'T'], mts: ['#2f6fb2', 'T'], cts: ['#2f6fb2', 'T'], tsx: ['#2f6fb2', 'T'],
  json: ['#8a6d1d', '{}'], yaml: ['#7a6f9c', 'Y'], yml: ['#7a6f9c', 'Y'],
  toml: ['#7a6f9c', 'T'], ini: ['#7a6f9c', 'I'], py: ['#2f7d4f', 'Py'],
  rb: ['#a03a3a', 'R'], go: ['#1f8a9e', 'G'], rs: ['#9c5a2a', 'R'], java: ['#a05a1d', 'J'],
  sh: ['#4a6b3a', '$'], bash: ['#4a6b3a', '$'], zsh: ['#4a6b3a', '$'],
  html: ['#2f9e44', '<>'], htm: ['#2f9e44', '<>'], css: ['#5a4f9e', '#'],
  scss: ['#5a4f9e', '#'], less: ['#5a4f9e', '#'], svg: ['#8a5a9e', 'S'],
  png: ['#7a4f9e', 'P'], jpg: ['#7a4f9e', 'P'], jpeg: ['#7a4f9e', 'P'],
  gif: ['#7a4f9e', 'P'], webp: ['#7a4f9e', 'P'], pdf: ['#a03a3a', 'P'],
  zip: ['#6b6b6b', 'Z'], sql: ['#4f6f8e', 'Q'], vue: ['#2f8a5f', 'V'],
  docx: ['#2b579a', 'W'], doc: ['#2b579a', 'W'], xlsx: ['#217346', 'X'], xls: ['#217346', 'X'],
  pptx: ['#b7472a', 'P'], ppt: ['#b7472a', 'P'], csv: ['#217346', 'C'], tsv: ['#217346', 'C'],
  lock: ['#6b6b6b', 'L'], err: ['#8a8a8a', 'E'], log: ['#8a8a8a', 'L'], txt: ['#8a8a8a', 'T'],
};

function entryIcon(type, name = '') {
  if (type === 'directory') {
    return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
      h('path', {
        d: 'M1.7 3.1h4.2l1.5 1.7h7c.35 0 .6.28.6.62v7.1c0 .34-.25.6-.6.6H1.7c-.35 0-.6-.26-.6-.6V3.7c0-.34.25-.6.6-.6z',
        fill: 'currentColor',
        opacity: 0.5,
      }));
  }
  if (type !== 'file') {
    return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
      h('path', {
        d: 'M3.6 1.8h5.4l3.4 3.4v9H3.6V1.8z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round',
      }));
  }
  const lower = String(name).toLowerCase();
  if (/^readme(\.|$)/i.test(lower)) {
    return h(
      'svg',
      { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
      h('circle', { cx: 8, cy: 8, r: 6.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.25 }),
      h('text', {
        x: 8, y: 11.3, textAnchor: 'middle', fontSize: 8.5, fontWeight: 600,
        fill: 'currentColor', fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }, 'i'),
    );
  }
  let badge;
  if (lower.startsWith('.git')) badge = ['#d4552a', 'G'];
  else if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) badge = ['#2f6fb2', 'D'];
  else if (lower === 'makefile' || lower === 'gnumakefile') badge = ['#6b6b6b', 'M'];
  else {
    const dot = lower.lastIndexOf('.');
    const ext = dot > 0 ? lower.slice(dot + 1) : '';
    badge = FILE_BADGES[ext] ?? ['#8f9aa6', lower.slice(0, 1).toUpperCase() || '·'];
  }
  const [color, label] = badge;
  return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
    h('rect', { x: 0.5, y: 0.5, width: 15, height: 15, rx: 3.5, fill: color }),
    h('text', {
      x: 8, y: 11.9, textAnchor: 'middle', fontSize: label.length > 1 ? 7 : 8.5,
      fontWeight: 700, fill: '#ffffff', fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }, label));
}

function encodeAddressSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ':');
}

function sessionFileAddress(sessionId, path) {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  const encoded = normalized.split('/').map(encodeAddressSegment).join('/');
  return `dsh-resource://file/session/${encodeAddressSegment(sessionId)}/${encoded}`;
}

function orderEntries(entries) {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory');
    if (group !== 0) return group;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function chatBubbleIcon(size = 15) {
  return h('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M2.2 3.2h11.6c.44 0 .8.36.8.8v6.4c0 .44-.36.8-.8.8H7.6L4 14.2v-3H2.2c-.44 0-.8-.36-.8-.8V4c0-.44.36-.8.8-.8z',
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round',
    }));
}

function locateIcon() {
  return h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' } },
    h('circle', { cx: 8, cy: 8, r: 5.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor' }),
    h('path', { d: 'M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }));
}

function FolderChipIcon({ size = 16 }) {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M1.8 3.6c0-.5.4-.9.9-.9h3l1.3 1.5h6.1c.5 0 .9.4.9.9v6.3c0 .5-.4.9-.9.9H2.7c-.5 0-.9-.4-.9-.9V3.6z',
      fill: 'currentColor',
    }),
  );
}

function FolderGuideIcon({ size = 26, className }) {
  return h('svg', { viewBox: '0 0 16 16', width: size, height: size, className, 'aria-hidden': true },
    h('path', {
      d: 'M1.8 3.6c0-.5.4-.9.9-.9h3l1.3 1.5h6.1c.5 0 .9.4.9.9v6.3c0 .5-.4.9-.9.9H2.7c-.5 0-.9-.4-.9-.9V3.6z',
      fill: '#f5c154', stroke: '#d9a63a', strokeWidth: 0.8, strokeLinejoin: 'round',
    }));
}

function chevron(open) {
  return h('span', { className: 'mmd-locate-chevron', key: 'chevron', 'aria-hidden': true },
    h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' } },
      h('path', { d: 'M5.5 3.5l4.5 4.5-4.5 4.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })));
}

function refreshIcon() {
  return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, style: { display: 'block' } },
    h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.5-3.7M13.2 2.4v3h-3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
}

/* ------------------------------------------------------------------ */
/* Agent interaction helpers.                                          */
/* ------------------------------------------------------------------ */

/* Electron renderers do not implement window.prompt/confirm, so ask with our own overlay. */
const ASK_STYLE = `
.mmd-ask-back{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28)}
.mmd-ask-card{min-width:320px;max-width:420px;padding:16px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 16px 48px rgba(0,0,0,.24);font-family:var(--dsw-font,inherit)}
.mmd-ask-msg{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#222);margin-bottom:10px;word-break:break-word}
.mmd-ask-input{width:100%;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;padding:7px 9px;font:inherit;font-size:13px;outline:none;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222)}
.mmd-ask-input:focus{border-color:#247bbf}
.mmd-ask-row{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.mmd-ask-btn{border:.5px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:8px;padding:5px 14px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#333);cursor:pointer}
.mmd-ask-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.mmd-ask-btn.mmd-ask-ok{background:#247bbf;border-color:#247bbf;color:#fff}
.mmd-ask-btn.mmd-ask-ok:hover{background:#1e6aa6}
`;

/** Modal text/confirm prompt that works in Electron as well as in a browser. */
function mmdAsk({ message, defaultValue = '', confirmOnly = false, okLabel = 'OK', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'mmd-ask-back';
    const card = document.createElement('div');
    card.className = 'mmd-ask-card';
    const style = document.createElement('style');
    style.textContent = ASK_STYLE;
    const text = document.createElement('div');
    text.className = 'mmd-ask-msg';
    text.textContent = message;
    card.appendChild(text);
    let input = null;
    if (!confirmOnly) {
      input = document.createElement('input');
      input.className = 'mmd-ask-input';
      input.value = defaultValue;
      card.appendChild(input);
    }
    const row = document.createElement('div');
    row.className = 'mmd-ask-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mmd-ask-btn';
    cancel.textContent = cancelLabel;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'mmd-ask-btn mmd-ask-ok';
    ok.textContent = okLabel;
    row.appendChild(cancel);
    row.appendChild(ok);
    card.appendChild(row);
    back.appendChild(style);
    back.appendChild(card);
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey, true);
      back.remove();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      } else if (event.key === 'Enter') {
        event.stopPropagation();
        event.preventDefault();
        close(confirmOnly ? true : input.value);
      }
    };
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(confirmOnly ? true : input.value));
    back.addEventListener('mousedown', (event) => {
      if (event.target === back) close(null);
    });
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    input?.focus();
    input?.select();
    ok.focus?.();
  });
}

async function askText(message, defaultValue = '') {
  const value = await mmdAsk({ message, defaultValue });
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

async function askConfirm(message) {
  return (await mmdAsk({ message, confirmOnly: true })) === true;
}

/** Put a workspace file reference chip into the composer, like an @-mention. */
function addToChat(inputActions, path, t, options = {}) {
  if (inputActions === undefined || inputActions === null) return;
  const isDir = options.isDir === true;
  const clean = toPosixPath(path).replace(/\/+$/, '');
  const name = pathBasename(clean) || clean;
  const quoted = /\s/.test(clean);
  const mention = isDir
    ? quoted ? `@"${clean}` : `@${clean}/`
    : quoted ? `@"${clean}"` : `@${clean}`;
  const label = isDir ? `${name}/` : name;
  try {
    inputActions.setDraft({
      text: mention,
      references: [{
        source: 'reference',
        ref: mention,
        label,
        appearance: isDir ? 'folder' : 'file',
        clipboardText: mention,
        offset: 0,
        length: mention.length,
      }],
    });
    return;
  } catch {}
  try { inputActions.setDraft(mention + ' '); } catch {}
}

function sendToAgent(inputActions, message, readDraft) {
  if (inputActions === undefined || inputActions === null) return;
  try { inputActions.setDraft(message); } catch { return; }
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const current = typeof readDraft === 'function' ? readDraft() : undefined;
    if (current === message) {
      try { inputActions.submit(); } catch {}
      return;
    }
    if (attempts < 24) setTimeout(tick, 25);
  };
  setTimeout(tick, 0);
}

/**
 * The review angles the AI assist and the local templates can take.
 *
 * The id is what the Host understands; the label key is what the reviewer
 * reads. The order is the order the chips show in.
 */
const ASSIST_INTENTS = [
  { id: 'copy', label: 'annotate.intent.copy' },
  { id: 'ux', label: 'annotate.intent.ux' },
  { id: 'issue', label: 'annotate.intent.issue' },
  { id: 'rule', label: 'annotate.intent.rule' },
  { id: 'translate', label: 'annotate.intent.translate' },
];

/**
 * The tasks the sent prompt can ask the Agent for.
 *
 * The id picks the message template; the label key is what the toolbar shows.
 */
const ANNOTATE_TASKS = [
  { id: 'change', label: 'annotate.task.change', message: 'annotate.message', imageMessage: 'annotate.imageMessage' },
  { id: 'plan', label: 'annotate.task.plan', message: 'annotate.messagePlan', imageMessage: 'annotate.imageMessagePlan' },
  { id: 'review', label: 'annotate.task.review', message: 'annotate.messageReview', imageMessage: 'annotate.imageMessageReview' },
];

/**
 * The template of one intent, ready for the reviewer to finish.
 *
 * The template is the fallback for a Host that cannot answer: it says what
 * has to change, and the reviewer fills in the specifics.
 * @param {Function} t - the translator.
 * @param {string} intent - the intent id.
 * @param {string} subject - what the annotation is about.
 * @returns {string} the template sentence.
 */
function assistTemplate(t, intent, subject) {
  const known = ASSIST_INTENTS.some((item) => item.id === intent);
  const key = `annotate.template.${known ? intent : 'issue'}`;
  const target = subject.trim() === '' ? t('annotate.pickTitle') : subject.trim();
  return t(key, { text: target });
}

/**
 * Annotation dialog: comment box plus optional attachments and AI assist.
 *
 * The attachment row is opt-in: a caller that passes `onAttach` gets the
 * paperclip button, the chips and the paste handler; the other callers (the
 * Markdown comment box) keep their current behaviour.
 *
 * The AI assist row is opt-in too: a caller that passes `assist` gets the
 * sparkle button, the intent chips and the draft request. The draft lands in
 * the same text box, so the reviewer still owns the sentence before it is
 * sent.
 */
export function InstructionPopover({ anchor, title, placeholder, value, onChange, onSubmit, onClose, t, attachments = [], onAttach, onDetach, assist, submitLabel, allowEmpty = false }) {
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [intent, setIntent] = useState(ASSIST_INTENTS[0].id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);
  useEffect(() => { if (inputRef.current !== null) inputRef.current.focus(); }, []);
  const attachEnabled = typeof onAttach === 'function';
  const assistEnabled = assist !== undefined && assist !== null;
  const addFiles = (files) => {
    if (!attachEnabled) return;
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    try {
      setError(null);
      onAttach(list);
    } catch (failure) {
      setError(t('annotate.attachFailed', { message: failure instanceof Error ? failure.message : String(failure) }));
    }
  };
  const onPaste = (event) => {
    if (!attachEnabled) return;
    const items = event.clipboardData?.items;
    if (items === undefined) return;
    const files = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file !== null) files.push(file);
    }
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };
  const generate = async () => {
    if (!assistEnabled || busy) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const draft = await assist.onGenerate({ intent, note, current: value, ...(assist.context ?? {}) });
      if (typeof draft !== 'string' || draft.trim() === '') throw new Error(t('annotate.assistFailed'));
      onChange(draft.trim());
      setHint(t('annotate.assistDone'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const applyTemplate = () => {
    if (!assistEnabled) return;
    const template = assist.onTemplate(intent, assist.context ?? {});
    if (typeof template !== 'string' || template.trim() === '') return;
    onChange(template.trim());
    setHint(t('annotate.assistTemplateDone'));
  };
  return createPortal(
    h('span', { className: 'mmd-pop', style: { top: `${anchor.top}px`, left: `${anchor.left}px` } }, [
      h('span', { className: 'mmd-pop-title', key: 'title' }, [
        title,
        h('button', {
          type: 'button',
          key: 'close',
          className: 'mmd-pop-close',
          title: t('chat.close'),
          'aria-label': t('chat.close'),
          onClick: (event) => { event.stopPropagation(); onClose(); },
        }, '×'),
      ]),
      attachments.length > 0
        ? h('span', { className: 'mmd-pop-files', key: 'files' }, attachments.map((attachment) =>
            h('span', { className: 'mmd-pop-file', key: attachment.id, title: attachment.file.name }, [
              isImageFile(attachment.file) && attachment.url !== ''
                ? h('img', { key: 'img', className: 'mmd-pop-file-img', src: attachment.url, alt: '' })
                : h('span', { key: 'ico', className: 'mmd-pop-file-ico' }, attachIcon(12)),
              h('span', { key: 'name', className: 'mmd-pop-file-name' }, attachment.file.name),
              h('button', {
                type: 'button',
                key: 'del',
                className: 'mmd-anno-del',
                'aria-label': t('annotate.attachRemove'),
                title: t('annotate.attachRemove'),
                onClick: (event) => { event.stopPropagation(); onDetach?.(attachment.id); },
              }, '×'),
            ]),
          ))
        : null,
      h('textarea', {
        key: 'text', ref: inputRef, className: 'mmd-pop-text', placeholder, value, rows: 4,
        onChange: (event) => onChange(event.target.value),
        onPaste,
        onKeyDown: (event) => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSubmit(); }
        },
      }),
      assistEnabled && assistOpen
        ? h('span', { className: 'mmd-pop-assist', key: 'assist' }, [
            h('span', { className: 'mmd-pop-assist-row', key: 'intents' }, ASSIST_INTENTS.map((item) =>
              h('button', {
                type: 'button',
                key: item.id,
                className: item.id === intent ? 'mmd-pop-chip mmd-pop-chip-on' : 'mmd-pop-chip',
                onClick: (event) => { event.stopPropagation(); setIntent(item.id); },
              }, t(item.label)),
            )),
            h('input', {
              key: 'note',
              type: 'text',
              className: 'mmd-pop-note',
              placeholder: t('annotate.assistNote'),
              value: note,
              onChange: (event) => setNote(event.target.value),
            }),
            h('span', { className: 'mmd-pop-assist-foot', key: 'foot' }, [
              h('button', {
                type: 'button',
                key: 'generate',
                className: 'mmd-pop-assist-btn',
                disabled: busy,
                onClick: (event) => { event.stopPropagation(); generate(); },
              }, busy ? t('annotate.assistBusy') : t('annotate.assistGenerate')),
              h('button', {
                type: 'button',
                key: 'template',
                className: 'mmd-pop-assist-tpl',
                disabled: busy,
                onClick: (event) => { event.stopPropagation(); applyTemplate(); },
              }, t('annotate.assistTemplate')),
            ]),
          ])
        : null,
      error === null ? null : h('span', { className: 'mmd-pop-error', key: 'error' }, error),
      hint === null ? null : h('span', { className: 'mmd-pop-assist-hint', key: 'hint' }, hint),
      h('span', { className: 'mmd-pop-foot', key: 'foot' }, [
        h('span', { className: 'mmd-pop-left', key: 'left' }, [
          attachEnabled
            ? h('button', {
                type: 'button',
                key: 'attach',
                className: 'mmd-pop-attach',
                title: t('annotate.attachTitle'),
                'aria-label': t('annotate.attachTitle'),
                onClick: (event) => { event.stopPropagation(); fileRef.current?.click(); },
              }, attachIcon(14))
            : null,
          assistEnabled
            ? h('button', {
                type: 'button',
                key: 'assist',
                className: assistOpen ? 'mmd-pop-assist-toggle mmd-pop-assist-toggle-on' : 'mmd-pop-assist-toggle',
                title: t('annotate.assistTitle'),
                'aria-label': t('annotate.assistTitle'),
                onClick: (event) => { event.stopPropagation(); setAssistOpen((open) => !open); },
              }, sparkIcon(13))
            : null,
          h('span', { className: 'mmd-pop-hint', key: 'hint' }, '⌘↵ 发送'),
        ]),
        h('button', { type: 'button', key: 'send', className: 'mmd-pop-send', onClick: onSubmit, disabled: !allowEmpty && value.trim() === '' }, submitLabel ?? t('chat.send')),
      ]),
      attachEnabled
        ? h('input', {
            key: 'file',
            ref: fileRef,
            type: 'file',
            multiple: true,
            className: 'mmd-pop-file-input',
            style: { display: 'none' },
            onChange: (event) => {
              addFiles(event.target.files);
              event.target.value = '';
            },
          })
        : null,
    ]),
    document.body,
  );
}

/**
 * Send one annotation message, with its attachments when there are any.
 *
 * Text-only annotations keep the composer path (draft plus submit), so the
 * existing behaviour is untouched. An annotation with attachments cannot ride
 * that path, because the composer owns the attachment registry; it goes to
 * the session face directly with inline image parts and upload receipts.
 */
async function sendAnnotation(ctx, inputActions, sessionId, message, files, readDraft) {
  if (files.length === 0) {
    sendToAgent(inputActions, message, readDraft);
    return { sent: true, attachmentsDropped: false };
  }
  const binding = typeof ctx.sessions?.binding === 'function' ? ctx.sessions.binding(sessionId) : undefined;
  const session = binding?.session;
  if (session === undefined || typeof session.prompt !== 'function') {
    // No session face: the text still reaches the Agent through the composer,
    // and the caller reports that the attachments were dropped.
    sendToAgent(inputActions, message, readDraft);
    return { sent: true, attachmentsDropped: true };
  }
  const parts = await buildAttachmentParts(ctx, sessionId, files);
  const result = await session.prompt([...parts, { type: 'text', text: message }], 'queue');
  if (result === null || typeof result !== 'object' || result.ok !== true) {
    throw new Error(result?.error?.message ?? 'prompt refused');
  }
  return { sent: true, attachmentsDropped: false };
}

/** Add the localized "Open" label to the host's open-in-app button via CSS content. */
function openLabelStyle(t) {
  const label = String(t('openWith.label')).replace(/["\\]/g, '\\$&');
  return h(
    'style',
    { key: 'open-label' },
    '[data-open-target][data-size="compact"] > button:first-child::after{content:"' + label + '";font-size:12px;line-height:1;}' +
      '[data-open-target][data-size="compact"] > button:first-child{gap:6px;padding:0 10px;}',
  );
}

/** Preview-header button: jump to this file in the Files tab. */
function RevealAction(props) {
  const { ctx, absolutePath, t } = props;
  return h('span', { className: 'mmd-reveal' }, [
    h('style', { key: 'style' }, STYLE),
    openLabelStyle(t),
    h('button', {
      type: 'button', key: 'trigger',
      className: 'mmd-reveal-trigger mmd-reveal-labeled',
      title: t('reveal.tooltip'),
      'aria-label': t('reveal.tooltip'),
      onClick: () => ctx.sidebarRight.openTab('files', { params: { reveal: absolutePath } }),
    }, [locateIcon(), h('span', { className: 'mmd-reveal-text', key: 'text' }, t('reveal.label'))]),
  ]);
}

/**
 * One annotation card in the list.
 *
 * Both annotation flows show the same card: the number, the text, the files
 * and the two actions — rewrite the wording, or drop the annotation.
 */
export function AnnotationItem({ item, index, text, title, t, onEdit, onRemove }) {
  return h('div', { className: 'mmd-anno-item' }, [
    h('span', { className: 'mmd-anno-badge', key: 'n' }, String(index + 1)),
    h('span', { className: 'mmd-anno-text', key: 'text', title: title ?? '' }, text),
    (item.attachments ?? []).length > 0
      ? h('span', { className: 'mmd-anno-files', key: 'files', title: t('annotate.attached', { count: item.attachments.length }) },
          [attachIcon(11), h('span', { key: 'n' }, String(item.attachments.length))])
      : null,
    h('button', {
      type: 'button', key: 'edit', className: 'mmd-anno-edit', 'aria-label': t('annotate.edit'),
      title: t('annotate.editTitle'),
      onClick: () => onEdit(index),
    }, '✎'),
    h('button', {
      type: 'button', key: 'del', className: 'mmd-anno-del', 'aria-label': '删除',
      onClick: () => onRemove(index),
    }, '×'),
  ]);
}

/* ------------------------------------------------------------------ */
/* HTML annotation renderer: element picking inside a sandboxed frame. */
/* ------------------------------------------------------------------ */

const HTML_ANNOTATE_ID = '@local/markdown-mermaid-preview/html-annotate';

const PICKER_STYLE =
  '.mmd-pick-hover{position:fixed;pointer-events:none;border:2px solid #247bbf;border-radius:3px;z-index:2147483646;display:none;background:rgba(36,123,191,.06)}' +
  '.mmd-pick-badge{position:fixed;z-index:2147483646;min-width:18px;height:18px;border-radius:9px;background:#247bbf;color:#fff;font:600 11px/18px ui-sans-serif,system-ui,sans-serif;text-align:center;pointer-events:none;transform:translate(-50%,-50%)}';

/** Self-contained picker body; String()ed into the injected script tag. No closures. */
function mmdPickerMain() {
  let active = false;
  const picked = [];
  let hoverBox = null;
  let badgeItems = [];
  const badges = [];
  const onMove = (event) => {
    if (!active || hoverBox === null) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el === null || el === document.documentElement || el === document.body || el.classList.contains('mmd-pick-hover') || el.classList.contains('mmd-pick-badge')) {
      hoverBox.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    hoverBox.style.display = 'block';
    hoverBox.style.left = rect.left + 'px';
    hoverBox.style.top = rect.top + 'px';
    hoverBox.style.width = rect.width + 'px';
    hoverBox.style.height = rect.height + 'px';
  };
  const describe = (el) => {
    picked.push(el);
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 6) {
      let part = current.tagName.toLowerCase();
      if (current.id) part += '#' + current.id;
      else if (typeof current.className === 'string' && current.className.trim() !== '') {
        part += '.' + current.className.trim().split(/\s+/).slice(0, 2).join('.');
      }
      const parent = current.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return {
      idx: picked.length - 1,
      path: parts.join(' > '),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    };
  };
  const onClick = (event) => {
    if (!active) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el === null || el.classList.contains('mmd-pick-badge')) return;
    event.preventDefault();
    event.stopPropagation();
    parent.postMessage({ __mmd: true, type: 'pick', info: describe(el), x: event.clientX, y: event.clientY }, '*');
  };
  const placeBadges = () => {
    for (const badge of badges) badge.remove();
    badges.length = 0;
    for (const item of badgeItems) {
      const el = picked[item.idx];
      if (el === undefined || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      const badge = document.createElement('div');
      badge.className = 'mmd-pick-badge';
      badge.textContent = String(item.n);
      badge.style.left = rect.right + 'px';
      badge.style.top = rect.top + 'px';
      document.documentElement.appendChild(badge);
      badges.push(badge);
    }
  };
  const setActive = (value) => {
    active = value;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    if (hoverBox !== null) hoverBox.style.display = 'none';
    if (value) {
      if (hoverBox === null) {
        hoverBox = document.createElement('div');
        hoverBox.className = 'mmd-pick-hover';
        document.documentElement.appendChild(hoverBox);
      }
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      if (document.body) document.body.style.cursor = 'crosshair';
    } else if (document.body) {
      document.body.style.cursor = '';
    }
  };
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.__mmd !== true) return;
    if (data.type === 'activate') setActive(true);
    else if (data.type === 'deactivate') setActive(false);
    else if (data.type === 'badges') {
      badgeItems = data.items;
      placeBadges();
    } else if (data.type === 'zoom') {
      document.documentElement.style.zoom = String(data.value ?? 1);
      placeBadges();
    }
  });
  window.addEventListener('scroll', () => { if (badgeItems.length > 0) placeBadges(); }, true);
  window.addEventListener('resize', () => { if (badgeItems.length > 0) placeBadges(); });
}

function pickerPayload() {
  return '<style data-mmd-picker>' + PICKER_STYLE + '</style>' +
    '<scr' + 'ipt data-mmd-picker>(' + String(mmdPickerMain) + ')();</scr' + 'ipt>';
}

function injectPicker(html) {
  const payload = pickerPayload();
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, payload + '</body>');
  return html + payload;
}

/**
 * The prompt that carries the annotations to the Agent.
 *
 * The task picks the template: the reviewer can ask for the change itself, a
 * plan first, or an opinion only.
 * @param {Function} t - the translator.
 * @param {string} path - the reviewed file.
 * @param {object[]} annotations - the annotations.
 * @param {string} task - the task id.
 * @returns {string} the prompt.
 */
function annotateMessage(t, path, annotations, task) {
  const lines = annotations.map((item, index) => {
    const where = item.info.text !== '' ? `（${item.info.path}；文本「${item.info.text}」）` : `（${item.info.path}）`;
    return `${index + 1}. <${item.info.tag}> ${where}：${item.comment}`;
  });
  const template = ANNOTATE_TASKS.find((item) => item.id === task)?.message ?? 'annotate.message';
  return t(template, { path, list: lines.join('\n') });
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function ZoomControls({ zoom, onZoom, t }) {
  const index = ZOOM_STEPS.indexOf(zoom);
  const step = (direction) => {
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index === -1 ? 2 : index) + direction));
    onZoom(ZOOM_STEPS[next]);
  };
  return h('span', { className: 'mmd-zoom' }, [
    h('button', {
      type: 'button', key: 'out', className: 'mmd-zoom-btn', title: '缩小', 'aria-label': '缩小',
      disabled: index <= 0, onClick: () => step(-1),
    }, '−'),
    h('button', {
      type: 'button', key: 'fit', className: 'mmd-zoom-value', title: '适应宽度',
      onClick: () => onZoom(1),
    }, `${Math.round(zoom * 100)}%`),
    h('button', {
      type: 'button', key: 'in', className: 'mmd-zoom-btn', title: '放大', 'aria-label': '放大',
      disabled: index >= ZOOM_STEPS.length - 1, onClick: () => step(1),
    }, '+'),
  ]);
}

function HtmlAnnotateBody(props) {
  const { ctx, content, resourceAddress, useResource, inputActions, useInput, useSessions, sessionId, t } = props;
  const absolutePath = useResource(resourceAddress).value?.absolutePath;
  const iframeRef = useRef(null);
  const [srcdoc, setSrcdoc] = useState(null);
  const [editing, setEditing] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [pendingPick, setPendingPick] = useState(null);
  const [pickComment, setPickComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editFiles, setEditFiles] = useState([]);
  const [editRemoved, setEditRemoved] = useState([]);
  const [task, setTask] = useState('change');
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState(1);
  const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : '';
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const cwd = typeof useSessions === 'function' ? useSessions((state) => state.byId?.[sessionId]?.cwd) : undefined;
  const shownPath = useMemo(() => {
    if (absolutePath === undefined) return '';
    if (typeof cwd !== 'string' || cwd.length <= 1) return absolutePath;
    return relativeToRoot(absolutePath, cwd) ?? absolutePath;
  }, [cwd, absolutePath]);

  useEffect(() => {
    if (content.kind !== 'bytes') return undefined;
    let cancelled = false;
    try {
      const text = new TextDecoder('utf-8').decode(content.data);
      if (!cancelled) setSrcdoc(injectPicker(text));
    } catch {
      if (!cancelled) setSrcdoc(null);
    }
    return () => { cancelled = true; };
  }, [content]);

  const postToFrame = (message) => {
    iframeRef.current?.contentWindow?.postMessage({ __mmd: true, ...message }, '*');
  };
  useEffect(() => {
    postToFrame({ type: 'zoom', value: zoom });
  }, [zoom]);

  useEffect(() => {
    const onMessage = (event) => {
      const iframe = iframeRef.current;
      if (iframe === null || event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.__mmd !== true || data.type !== 'pick') return;
      const rect = iframe.getBoundingClientRect();
      setPickComment('');
      setPendingFiles((prev) => { revokeAttachments(prev); return []; });
      setEditIndex(null);
      setPendingPick({
        info: data.info,
        top: Math.round(rect.top + data.y + 10),
        left: Math.round(Math.min(Math.max(12, rect.left + data.x - 170), window.innerWidth - 360)),
      });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const pushBadges = (list) => {
    postToFrame({ type: 'badges', items: list.map((item, index) => ({ idx: item.info.idx, n: index + 1 })) });
  };

  const toggleEditing = () => {
    const next = !editing;
    setEditing(next);
    setPendingPick(null);
    postToFrame({ type: next ? 'activate' : 'deactivate' });
    if (next) pushBadges(annotations);
  };

  const confirmPick = () => {
    const text = pickComment.trim();
    if (text === '' || pendingPick === null) return;
    setAnnotations((prev) => {
      const next = [...prev, {
        info: pendingPick.info,
        comment: text,
        attachments: pendingFiles,
        anchor: { top: pendingPick.top, left: pendingPick.left },
      }];
      pushBadges(next);
      return next;
    });
    setPendingPick(null);
    setPickComment('');
    setPendingFiles([]);
  };

  const removeAnnotation = (index) => {
    setAnnotations((prev) => {
      const target = prev[index];
      if (target !== undefined) revokeAttachments(target.attachments);
      const next = prev.filter((_, i) => i !== index);
      pushBadges(next);
      return next;
    });
  };

  const clearAll = () => {
    setAnnotations((prev) => {
      revokeAttachments(prev.flatMap((item) => item.attachments ?? []));
      return [];
    });
    pushBadges([]);
  };

  /**
   * Re-open one annotation for editing.
   *
   * The annotation keeps its place in the list and its badge, so the numbers
   * the reviewer already refers to do not move.
   */
  const startEdit = (index) => {
    const target = annotations[index];
    if (target === undefined) return;
    setPendingPick(null);
    setEditIndex(index);
    setEditValue(target.comment);
    setEditFiles(target.attachments ?? []);
    setEditRemoved([]);
  };

  /** Save the annotation that is open for editing. */
  const confirmEdit = () => {
    const text = editValue.trim();
    if (text === '' || editIndex === null) return;
    setAnnotations((prev) => prev.map((item, index) => (
      index === editIndex ? { ...item, comment: text, attachments: editFiles } : item
    )));
    revokeAttachments(editRemoved);
    setEditRemoved([]);
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
  };

  /** Close the editor without touching the annotation. */
  const cancelEdit = () => {
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
    setEditRemoved([]);
  };

  /**
   * Detach a file from the annotation that is open for editing.
   *
   * The file is not released here: the annotation still points at it until
   * the edit is saved. Saving releases it.
   */
  const detachEditFile = (id) => {
    const removed = editFiles.find((attachment) => attachment.id === id);
    if (removed === undefined) return;
    setEditFiles((prev) => prev.filter((attachment) => attachment.id !== id));
    setEditRemoved((prev) => [...prev, removed]);
  };

  const sendAll = async () => {
    if (annotations.length === 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const outcome = await sendAnnotation(
        ctx, inputActions, sessionId,
        annotateMessage(t, shownPath, annotations, task),
        collectFiles(annotations),
        () => draftRef.current,
      );
      if (outcome.attachmentsDropped === true) setNotice(t('annotate.noSession'));
      clearAll();
      setEditing(false);
      postToFrame({ type: 'deactivate' });
    } catch (error) {
      setNotice(t('annotate.sendFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSending(false);
    }
  };

  /**
   * The AI assist of this annotation.
   *
   * The Host gets the element it has to talk about and the words the
   * reviewer already wrote; the local template is the fallback for a Host
   * that cannot answer.
   */
  const assistOptions = (info, comment) => ({
    context: {
      kind: 'element',
      path: shownPath,
      tag: info?.tag ?? '',
      selector: info?.path ?? '',
      subject: info?.text ?? '',
      comment: comment ?? '',
    },
    onGenerate: async ({ intent, note, current }) => requestDraft({
      kind: 'element',
      path: shownPath,
      tag: info?.tag ?? '',
      selector: info?.path ?? '',
      subject: info?.text ?? '',
      comment: current ?? comment ?? '',
      intent,
      note,
    }),
    onTemplate: (intent) => assistTemplate(t, intent, info?.text ?? ''),
  });

  if (content.kind !== 'bytes') return null;
  if (srcdoc === null) return h('div', { className: 'mmd-locate-note' }, t('annotate.failed'));

  return h('div', { className: 'mmd-anno' }, [
    h('style', { key: 'style' }, STYLE),
    h(AiChatFab, { key: 'fab', ctx, sessionId, inputActions, useInput, t }),
    h('div', { className: 'mmd-anno-bar', key: 'bar' }, [
      h('button', {
        type: 'button', key: 'toggle',
        className: editing ? 'mmd-reveal-tree mmd-anno-toggle mmd-anno-active' : 'mmd-reveal-tree mmd-anno-toggle',
        onClick: toggleEditing,
      }, [annotateToggleIcon(14, 'icon'), h('span', { key: 'label' }, editing ? t('annotate.exit') : t('annotate.toggle'))]),
      annotations.length > 0
        ? h('span', { className: 'mmd-anno-count', key: 'count' }, t('annotate.count', { count: annotations.length }))
        : null,
      annotations.length > 0
        ? h('button', { type: 'button', key: 'clear', className: 'mmd-reveal-tree', onClick: clearAll }, t('annotate.clear'))
        : null,
      annotations.length > 0
        ? h('select', {
            key: 'task',
            className: 'mmd-anno-task',
            value: task,
            title: t('annotate.taskLabel'),
            'aria-label': t('annotate.taskLabel'),
            onChange: (event) => setTask(event.target.value),
          }, ANNOTATE_TASKS.map((item) => h('option', { key: item.id, value: item.id }, t(item.label))))
        : null,
      annotations.length > 0
        ? h('button', {
            type: 'button', key: 'send', className: 'mmd-pop-send', onClick: sendAll, disabled: sending,
          }, sending ? t('annotate.sending') : t('annotate.sendAll'))
        : null,
      h('span', { className: 'mmd-editor-spacer', key: 'spacer' }),
      h(ZoomControls, { key: 'zoom', zoom, onZoom: setZoom, t }),
    ]),
    notice === null
      ? null
      : h('p', { className: 'mmd-anno-notice', key: 'notice' }, notice),
    h('div', { className: 'mmd-anno-stage', key: 'stage' }, [
      h('iframe', {
        key: 'frame', ref: iframeRef, className: 'mmd-anno-frame',
        sandbox: 'allow-scripts', srcDoc: srcdoc, title: shownPath,
        onLoad: () => {
          postToFrame({ type: 'zoom', value: zoom });
          if (editing) {
            postToFrame({ type: 'activate' });
            pushBadges(annotations);
          }
        },
      }),
      annotations.length === 0 && editing
        ? h('div', { className: 'mmd-anno-hint', key: 'hint' }, t('annotate.empty'))
        : null,
      annotations.length > 0
        ? h('div', { className: 'mmd-anno-list', key: 'list' }, annotations.map((item, index) =>
            h(AnnotationItem, {
              key: `${item.info.idx}:${index}`,
              item,
              index,
              title: item.info.path,
              text: `${item.info.tag}${item.info.text !== '' ? ' · ' + item.info.text : ''}：${item.comment}`,
              t,
              onEdit: startEdit,
              onRemove: removeAnnotation,
            }),
          ))
        : null,
    ]),
    editIndex !== null
      ? h(InstructionPopover, {
          key: 'edit-pop',
          anchor: annotations[editIndex]?.anchor ?? { top: 80, left: 80 },
          title: `${t('annotate.editHeading')}：<${annotations[editIndex]?.info.tag ?? 'div'}>${annotations[editIndex]?.info.text !== '' ? ' · ' + annotations[editIndex]?.info.text : ''}`,
          placeholder: t('annotate.placeholder'),
          value: editValue,
          onChange: setEditValue,
          onSubmit: confirmEdit,
          onClose: cancelEdit,
          attachments: editFiles,
          onAttach: (files) => setEditFiles((prev) => [...prev, ...createAttachments(files)]),
          onDetach: detachEditFile,
          submitLabel: t('annotate.save'),
          assist: assistOptions(annotations[editIndex]?.info, editValue),
          t,
        })
      : pendingPick === null
        ? null
        : h(InstructionPopover, {
            key: 'pick-pop',
            anchor: { top: pendingPick.top, left: pendingPick.left },
            title: `${t('annotate.pickTitle')}：<${pendingPick.info.tag}>${pendingPick.info.text !== '' ? ' · ' + pendingPick.info.text : ''}`,
            placeholder: t('annotate.placeholder'),
            value: pickComment,
            onChange: setPickComment,
            onSubmit: confirmPick,
            onClose: () => { revokeAttachments(pendingFiles); setPendingFiles([]); setPendingPick(null); },
            attachments: pendingFiles,
            onAttach: (files) => setPendingFiles((prev) => [...prev, ...createAttachments(files)]),
            onDetach: (id) => setPendingFiles((prev) => dropAttachment(prev, id)),
            assist: assistOptions(pendingPick.info, pickComment),
            t,
          }),
  ]);
}

/* ------------------------------------------------------------------ */
/* Markdown body with mermaid rendering and comment-to-chat.           */
/* ------------------------------------------------------------------ */

/** Floating "AI chat" card: draggable, resizable, anchored at the preview bottom by default. */
const chatCardMemory = { left: null, top: null, w: 420, h: 340 };

function AiChatFab({ ctx, sessionId, inputActions, useInput, t }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState([]);
  const [pos, setPos] = useState(null);
  const [size, setSize] = useState({ w: chatCardMemory.w, h: chatCardMemory.h });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const cardRef = useRef(null);
  const hostRef = useRef(null);
  const [inFullscreen, setInFullscreen] = useState(false);
  const [menu, setMenu] = useState(null); // 'permission' | 'model'
  const [permissionOptions, setPermissionOptions] = useState(null);
  const [modelGroups, setModelGroups] = useState(null);
  const [commands, setCommands] = useState(null);
  const [currentPermission, setCurrentPermission] = useState('—');
  const [currentModel, setCurrentModel] = useState(undefined);
  const modelLabel = currentModel === undefined ? '—' : String(currentModel.model);
  const permissionLabel = (permissionOptions ?? []).find((option) => option.value === currentPermission)?.name ?? currentPermission;

  // Load catalogs once so the chips show display names instead of raw ids.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ctx.remote.permissionPresets.catalog();
        if (!cancelled && result.ok) setPermissionOptions(result.value?.options ?? []);
      } catch {}
      try {
        const result = await ctx.remote.session.modelCatalog();
        if (!cancelled && result.ok) setModelGroups(result.value?.groups ?? []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, sessionId]);

  // Read the session projections imperatively: the document preview slot does not
  // expose the projection hook, and calling it here would blank the preview.
  useEffect(() => {
    const session = ctx?.sessions?.binding?.(sessionId)?.session;
    if (session === undefined) return undefined;
    const stops = [];
    const watch = (key, apply) => {
      try {
        const snapshot = session.projections?.faceOf?.(key);
        if (snapshot === undefined) return;
        const update = () => {
          try {
            apply(snapshot.getSnapshot());
          } catch {}
        };
        update();
        const stop = snapshot.subscribe?.(update);
        if (typeof stop === 'function') stops.push(stop);
      } catch {}
    };
    watch('permissions', (value) => setCurrentPermission(value?.currentValue ?? '—'));
    watch('modelSelection', (value) => setCurrentModel(value?.next ?? undefined));
    return () => {
      for (const stop of stops) stop();
    };
  }, [ctx, sessionId]);
  const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : '';
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Offer the floating chat whenever the preview reads as fullscreen: the panel is
  // in its fullscreen presentation, or the preview area spans most of the viewport.
  useEffect(() => {
    const host = hostRef.current?.closest('.mmd-document, .mmd-anno') ?? hostRef.current;
    if (host === null || host === undefined) return undefined;
    const panel = host.closest('[data-sidebar-right-panel]');
    const read = () => {
      try {
        const attribute = panel !== null && panel.getAttribute('data-sidebar-right-panel') === 'fullscreen';
        const wide = host.getBoundingClientRect().width >= window.innerWidth * 0.72;
        setInFullscreen(attribute || wide);
      } catch {
        setInFullscreen(false);
      }
    };
    read();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null;
    observer?.observe(host);
    window.addEventListener('resize', read);
    const mutation = panel === null ? null : new MutationObserver(read);
    mutation?.observe(panel, { attributes: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', read);
      mutation?.disconnect();
    };
  }, []);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

  const openCard = () => {
    const host = hostRef.current?.closest('.mmd-document, .mmd-anno') ?? hostRef.current ?? null;
    const rect = host === null ? null : host.getBoundingClientRect();
    const width = chatCardMemory.w;
    const height = chatCardMemory.h;
    const left = chatCardMemory.left !== null && host === null ? chatCardMemory.left
      : rect === null ? 40 : Math.round(rect.left + rect.width / 2 - width / 2);
    const top = chatCardMemory.top !== null && host === null ? chatCardMemory.top
      : rect === null ? 40 : Math.round(rect.bottom - height - 18);
    setSize({ w: width, h: height });
    setPos({
      left: clamp(left, 8, window.innerWidth - width - 8),
      top: clamp(top, 8, window.innerHeight - 120),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Drag with a rAF-throttled transform: compositor-only, no layout per frame.
  useEffect(() => {
    if (!dragging) return undefined;
    let frame = 0;
    let next = null;
    const apply = () => {
      frame = 0;
      const state = dragRef.current;
      const card = cardRef.current;
      if (state === null || card === null || next === null) return;
      card.style.transform = `translate3d(${next.dx}px, ${next.dy}px, 0)`;
      state.dx = next.dx;
      state.dy = next.dy;
    };
    const move = (event) => {
      const state = dragRef.current;
      if (state === null) return;
      next = {
        dx: clamp(event.clientX - state.px, 8 - state.left, window.innerWidth - cardRef.current.offsetWidth - 8 - state.left),
        dy: clamp(event.clientY - state.py, 8 - state.top, window.innerHeight - 60 - state.top),
      };
      if (frame === 0) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      const state = dragRef.current;
      if (state !== null) {
        const left = state.left + (state.dx ?? 0);
        const top = state.top + (state.dy ?? 0);
        if (cardRef.current !== null) cardRef.current.style.transform = '';
        setPos({ left, top });
        chatCardMemory.left = left;
        chatCardMemory.top = top;
      }
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [dragging]);

  // Resize from any edge or corner: rAF-throttled direct writes, commit on release.
  useEffect(() => {
    if (!resizing) return undefined;
    let frame = 0;
    let next = null;
    const apply = () => {
      frame = 0;
      const card = cardRef.current;
      const state = resizeRef.current;
      if (card === null || state === null || next === null) return;
      if (state.dir.includes('e') || state.dir.includes('w')) {
        card.style.width = `${next.width}px`;
        if (state.dir.includes('w')) card.style.left = `${next.left}px`;
      }
      if (state.dir.includes('n') || state.dir.includes('s')) {
        card.style.height = `${next.height}px`;
        if (state.dir.includes('n')) card.style.top = `${next.top}px`;
      }
      Object.assign(state, next);
    };
    const move = (event) => {
      const state = resizeRef.current;
      if (state === null) return;
      const dir = state.dir;
      const dx = event.clientX - state.sx;
      const dy = event.clientY - state.sy;
      const value = { left: state.left, top: state.top, width: state.w, height: state.h };
      if (dir.includes('e')) value.width = clamp(state.w + dx, 320, window.innerWidth - state.left - 8);
      if (dir.includes('s')) value.height = clamp(state.h + dy, 220, window.innerHeight - state.top - 8);
      if (dir.includes('w')) {
        value.left = clamp(state.left + dx, 8, state.left + state.w - 320);
        value.width = state.w + (state.left - value.left);
      }
      if (dir.includes('n')) {
        value.top = clamp(state.top + dy, 8, state.top + state.h - 220);
        value.height = state.h + (state.top - value.top);
      }
      next = value;
      if (frame === 0) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      const state = resizeRef.current;
      if (state !== null) {
        setPos({ left: state.left, top: state.top });
        setSize({ w: state.w, h: state.h });
        chatCardMemory.left = state.left;
        chatCardMemory.top = state.top;
        chatCardMemory.w = state.w;
        chatCardMemory.h = state.h;
      }
      resizeRef.current = null;
      setResizing(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [resizing]);

  const send = () => {
    const value = text.trim();
    if (value === '') return;
    sendToAgent(inputActions, value, () => draftRef.current);
    setSent((prev) => [...prev, value]);
    setText('');
  };

  const card =
    open && pos !== null
      ? createPortal(
          h('div', {
            ref: cardRef,
            className: dragging || resizing ? 'mmd-fab-card mmd-fab-busy' : 'mmd-fab-card',
            style: { left: `${pos.left}px`, top: `${pos.top}px`, width: `${size.w}px`, height: `${size.h}px` },
            onMouseDown: (event) => {
              const target = event.target instanceof Element ? event.target : null;
              if (target !== null && target.closest('button, textarea, select, input, a, .mmd-fab-menu, .mmd-fab-h, .mmd-fab-menu-item') !== null) return;
              if (cardRef.current !== null) cardRef.current.style.transform = '';
              dragRef.current = { px: event.clientX, py: event.clientY, left: pos.left, top: pos.top, dx: 0, dy: 0 };
              setDragging(true);
              event.preventDefault();
            },
          }, [
            h('button', {
              type: 'button', key: 'min',
              className: 'mmd-fab-min', title: t('aiChat.minimize'),
              'aria-label': t('aiChat.minimize'), onClick: () => setOpen(false),
            }, '—'),
            h('div', { className: 'mmd-fab-body', key: 'body' },
              sent.length === 0
                ? [h('div', { className: 'mmd-fab-empty', key: 'empty' }, t('aiChat.hint'))]
                : sent.map((message, index) => h('div', { className: 'mmd-fab-msg', key: `m:${index}` }, message))),
            h('textarea', {
              key: 'text',
              className: 'mmd-fab-compose',
              rows: 2,
              placeholder: t('aiChat.placeholder'),
              value: text,
              onChange: (event) => setText(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
              },
            }),
            h('div', { className: 'mmd-fab-bar', key: 'bar' }, [
              h('button', {
                type: 'button', key: 'attach', className: 'mmd-fab-plus',
                title: t('aiChat.attachHint'), 'aria-label': t('aiChat.attachHint'),
                onClick: async () => {
                  if (menu === 'add') { setMenu(null); return; }
                  setMenu('add');
                  if (commands === null) {
                    try {
                      const result = await ctx.remote.commands.list(sessionId);
                      if (result.ok) setCommands(result.value ?? []);
                    } catch {
                      setCommands([]);
                    }
                  }
                },
              }, '+'),
              h('button', {
                type: 'button', key: 'perm',
                className: menu === 'permission' ? 'mmd-fab-perm mmd-fab-perm-active' : 'mmd-fab-perm',
                title: t('aiChat.permission'),
                onClick: async () => {
                  if (menu === 'permission') { setMenu(null); return; }
                  setMenu('permission');
                  if (permissionOptions === null) {
                    try {
                      const result = await ctx.remote.permissionPresets.catalog();
                      if (result.ok) setPermissionOptions(result.value?.options ?? []);
                    } catch {}
                  }
                },
              }, [
                h('svg', { key: 'icon', viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
                  h('circle', { cx: 8, cy: 8, r: 6.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
                  h('path', { d: 'M8 4.6v4.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
                  h('circle', { cx: 8, cy: 11.4, r: 0.9, fill: 'currentColor' })),
                h('span', { key: 'label' }, permissionLabel),
              ]),
              h('span', { className: 'mmd-fab-spacer', key: 'spacer' }),
              h('button', {
                type: 'button', key: 'model',
                className: menu === 'model' ? 'mmd-fab-model mmd-fab-model-active' : 'mmd-fab-model',
                title: t('aiChat.model'),
                onClick: async () => {
                  if (menu === 'model') { setMenu(null); return; }
                  setMenu('model');
                  if (modelGroups === null) {
                    try {
                      const result = await ctx.remote.session.modelCatalog();
                      if (result.ok) setModelGroups(result.value?.groups ?? []);
                    } catch {}
                  }
                },
              }, [h('span', { key: 'label' }, modelLabel), h('span', { key: 'caret', className: 'mmd-fab-caret' }, '⌄')]),
              h('button', {
                type: 'button', key: 'send',
                className: 'mmd-fab-send',
                disabled: text.trim() === '',
                'aria-label': t('chat.send'),
                title: t('chat.send'),
                onClick: send,
              }, h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
                h('path', { d: 'M8 12.6V3.8M4.2 7.2L8 3.4l3.8 3.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
            ]),
            menu === null
              ? null
              : h('div', { className: 'mmd-fab-menu', key: 'menu' },
                  menu === 'add'
                    ? [
                        h('div', { className: 'mmd-fab-menu-head', key: 'add-head' }, t('aiChat.add')),
                        h('button', {
                          type: 'button', key: 'file',
                          className: 'mmd-fab-menu-row',
                          onClick: async () => {
                            setMenu(null);
                            const path = await askText(t('aiChat.filePrompt'));
                            if (path !== null) addToChat(inputActions, path, t);
                          },
                        }, [h('span', { className: 'mmd-fab-menu-icon', key: 'i' }, '📎'), h('span', { key: 'l' }, t('aiChat.addFile'))]),
                        commands === null || commands.length === 0
                          ? null
                          : h('div', { className: 'mmd-fab-menu-head', key: 'cmd-head' }, t('aiChat.commands')),
                        ...(commands ?? []).map((command) =>
                          h('button', {
                            type: 'button', key: `cmd:${command.name}`,
                            className: 'mmd-fab-menu-row',
                            onClick: () => {
                              setMenu(null);
                              setText(`/${command.name} `);
                            },
                          }, [
                            h('span', { className: 'mmd-fab-menu-icon', key: 'i' }, '/'),
                            h('span', { key: 'l' }, command.name),
                            command.description === undefined
                              ? null
                              : h('span', { className: 'mmd-fab-menu-desc', key: 'd' }, String(command.description)),
                          ]),
                        ),
                      ]
                    : menu === 'permission'
                      ? (permissionOptions ?? []).map((option) =>
                          h('button', {
                            type: 'button', key: option.value,
                            className: 'mmd-fab-menu-item mmd-fab-perm-item',
                            onClick: async () => {
                              setMenu(null);
                              if (option.value === currentPermission) return;
                              if ((option.value === 'danger-full-access' || option.value === 'auto') && !(await askConfirm(t('aiChat.confirmDanger')))) return;
                              try {
                                await ctx.sessions.binding(sessionId)?.session.command(`/permission ${option.value}`);
                              } catch {}
                            },
                          }, [
                            h('span', { className: 'mmd-fab-perm-icon', key: 'i' }, option.value === 'danger-full-access' ? '⚠' : option.value === 'workspace-write' ? '◐' : '✓'),
                            h('span', { className: 'mmd-fab-menu-label', key: 'l' }, option.name ?? option.value),
                            option.value === currentPermission ? h('span', { className: 'mmd-fab-menu-check', key: 'c' }, '✓') : null,
                          ]),
                        )
                      : (modelGroups ?? []).map((group) =>
                          h('div', { className: 'mmd-fab-menu-group', key: group.id },
                            h('div', { className: 'mmd-fab-menu-head', key: 'title' }, group.name ?? group.id),
                            ...group.models.map((model) =>
                              h('button', {
                                type: 'button', key: model.id,
                                className: currentModel?.provider === group.id && currentModel?.model === model.id ? 'mmd-fab-menu-item mmd-active' : 'mmd-fab-menu-item',
                                onClick: async () => {
                                  setMenu(null);
                                  try {
                                    await ctx.remote.session.selectModel({ sessionId, provider: group.id, model: model.id });
                                  } catch {}
                                },
                              }, [
                                h('span', { className: 'mmd-fab-menu-label', key: 'l' }, model.name ?? model.id),
                                currentModel?.provider === group.id && currentModel?.model === model.id
                                  ? h('span', { className: 'mmd-fab-menu-check', key: 'c' }, '✓')
                                  : null,
                              ]),
                            ),
                          )),
                ),
            ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) =>
              h('div', {
                key: `h:${dir}`,
                className: `mmd-fab-h mmd-fab-h-${dir}`,
                onMouseDown: (event) => {
                  resizeRef.current = {
                    dir,
                    sx: event.clientX,
                    sy: event.clientY,
                    left: pos.left,
                    top: pos.top,
                    w: size.w,
                    h: size.h,
                    width: size.w,
                    height: size.h,
                  };
                  setResizing(true);
                  event.preventDefault();
                  event.stopPropagation();
                },
              }),
            ),
          ]),
          document.body,
        )
      : null;

  if (!inFullscreen) return h('span', { className: 'mmd-fab-wrap', ref: hostRef });

  return h('span', { className: 'mmd-fab-wrap', ref: hostRef }, [
    card,
    h('button', {
      type: 'button', key: 'fab',
      className: open ? 'mmd-fab-btn mmd-fab-active' : 'mmd-fab-btn',
      title: t('aiChat.title'),
      'aria-label': t('aiChat.title'),
      'aria-expanded': open,
      onClick: () => (open ? setOpen(false) : openCard()),
    }, chatBubbleIcon(16)),
  ]);
}


function newFileIcon() {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M3.4 1.8h5l3 3v9.4H3.4V1.8z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinejoin: 'round',
    }),
    h('path', { d: 'M8.2 1.9V5h3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.15, strokeLinejoin: 'round' }),
    h('path', { d: 'M10.6 9.4v3.2M9 11h3.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
  );
}

function newFolderIcon() {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M1.7 3.2h4.1l1.3 1.5h6.2c.35 0 .6.28.6.62v6.2c0 .34-.25.6-.6.6H1.7c-.35 0-.6-.26-.6-.6V3.8c0-.34.25-.6.6-.6z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinejoin: 'round',
    }),
    h('path', { d: 'M10.6 9.2v3.4M8.9 10.9h3.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
  );
}

function collapseIcon() {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, style: { display: 'block' } },
    h('path', {
      d: 'M4.2 6.4L8 3l3.8 3.4M4.2 9.6L8 13l3.8-3.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}


/** Load a lazily bundled chunk; a missing chunk must not hang forever. */
function loadChunk(path, timeoutMs = 15000) {
  return Promise.race([
    require.async(path),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`chunk ${path} did not load`)), timeoutMs);
    }),
  ]);
}

/** Per-file edit-mode channel shared by the preview header button and the document body. */
const editChannels = new Map();
function editChannel(address) {
  const key = String(address ?? '');
  let channel = editChannels.get(key);
  if (channel === undefined) {
    channel = { open: false, listeners: new Set(), saveListeners: new Set() };
    editChannels.set(key, channel);
  }
  return {
    isOpen: () => channel.open,
    set(open) {
      channel.open = open;
      for (const listener of channel.listeners) listener(open);
    },
    subscribe(listener) {
      channel.listeners.add(listener);
      return () => channel.listeners.delete(listener);
    },
    requestSave() {
      for (const listener of channel.saveListeners) listener();
    },
    onSaveRequest(listener) {
      channel.saveListeners.add(listener);
      return () => channel.saveListeners.delete(listener);
    },
  };
}

/** Preview-header toggle that opens the Markdown editor for this file. */
function EditMarkdownAction({ absolutePath, t }) {
  if (typeof absolutePath !== 'string' || !/\.(md|markdown)$/i.test(absolutePath)) return null;
  const channel = editChannel(absolutePath);
  const [open, setOpen] = useState(channel.isOpen());
  useEffect(() => channel.subscribe(setOpen), [absolutePath]);
  return h('span', { className: 'mmd-reveal mmd-edit-actions' }, [
    h('style', { key: 'style' }, STYLE),
    h('button', {
      type: 'button',
      key: 'btn',
      className: open ? 'mmd-reveal-trigger mmd-reveal-labeled mmd-anno-active' : 'mmd-reveal-trigger mmd-reveal-labeled',
      title: t('edit.toggle'),
      'aria-label': t('edit.toggle'),
      'aria-pressed': open,
      onClick: () => channel.set(!open),
    }, [
      annotateIcon(14),
      h('span', { className: 'mmd-reveal-text', key: 'text' }, open ? t('edit.cancel') : t('edit.toggle')),
    ]),
    !open
      ? null
      : h('button', {
          type: 'button',
          key: 'save',
          className: 'mmd-pop-send mmd-edit-save',
          onClick: () => channel.requestSave(),
        }, t('edit.save')),
  ]);
}

/* ------------------------------------------------------------------ */
/* Reading actions: hand a selection to the chat, or ask about it.      */
/* ------------------------------------------------------------------ */

/**
 * Put the selected text into the main composer, with the file as a reference.
 *
 * The reviewer keeps the last word: the draft is seeded, never sent.
 * @param {any} inputActions - the Host's composer actions.
 * @param {string} path - the file the selection came from.
 * @param {string} selection - the selected text.
 * @returns {boolean} whether the draft could be seeded.
 */
export function addSelectionToChat(inputActions, path, selection) {
  if (inputActions === undefined || inputActions === null) return false;
  const clean = toPosixPath(path).replace(/\/+$/, '');
  const name = pathBasename(clean) || clean;
  const mention = /\s/.test(clean) ? `@"${clean}"` : `@${clean}`;
  const quoted = selection.split('\n').map((line) => `> ${line}`).join('\n');
  const draft = `${mention}\n\n${quoted}\n\n`;
  try {
    inputActions.setDraft({
      text: draft,
      references: [{
        source: 'reference',
        ref: mention,
        label: name,
        appearance: 'file',
        clipboardText: mention,
        offset: 0,
        length: mention.length,
      }],
    });
    return true;
  } catch {
    try {
      inputActions.setDraft(draft);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The bar that follows a text selection.
 *
 * Two things are worth doing with a passage: hand it to the conversation, or
 * ask about it without touching that conversation.
 * @param {object} props - the component props.
 * @param {object} props.anchor - where the selection is, in page coordinates.
 * @param {Function} props.onAdd - add the selection to the chat.
 * @param {Function} props.onAsk - ask about the selection in the side chat.
 * @param {Function} props.t - the translator.
 * @returns {object} the element.
 */
export function SelectionActions({ anchor, onAdd, onAsk, t }) {
  const className = anchor.below === true ? 'mmd-sel-actions mmd-sel-below' : 'mmd-sel-actions';
  return createPortal(
    h('div', { className, style: { top: `${anchor.top}px`, left: `${anchor.left}px` } }, [
      h('button', {
        type: 'button', key: 'add', className: 'mmd-sel-btn',
        title: t('chat.addSelectionTitle'), 'aria-label': t('chat.addSelection'),
        onMouseDown: (event) => event.preventDefault(),
        onClick: onAdd,
      }, t('chat.addSelection')),
      h('span', { className: 'mmd-sel-sep', key: 'sep', 'aria-hidden': true }),
      h('button', {
        type: 'button', key: 'ask', className: 'mmd-sel-btn',
        title: t('chat.askSideTitle'), 'aria-label': t('chat.askSide'),
        onMouseDown: (event) => event.preventDefault(),
        onClick: onAsk,
      }, t('chat.askSide')),
    ]),
    document.body,
  );
}

/**
 * The labels the Markdown renderer needs for its own chrome.
 * @param {Function} t - the translator.
 * @returns {object} the labels.
 */
function markdownLabels(t) {
  return {
    code: {
      copyLabel: t('code.copy'),
      copiedLabel: t('code.copied'),
      toolbarLabels: {
        codeLabel: t('codeBlock.title'),
        wrapLabel: t('codeBlock.wrap'),
        unwrapLabel: t('codeBlock.unwrap'),
      },
    },
    footnotes: t('footnotes'),
  };
}

/**
 * The menu a right click opens inside the document.
 *
 * The floating bar that follows a selection is easy to miss, and a right click
 * is what a reader reaches for anyway. The menu carries the same actions and
 * keeps the clipboard reachable, because replacing the native menu would
 * otherwise take Copy away.
 * @param {object} props - the component props.
 * @param {object} props.anchor - where the menu goes, in page coordinates.
 * @param {string} props.selection - the selected text.
 * @param {boolean} props.hasBlock - whether a block is under the pointer.
 * @param {Function} props.onCopy - copy the selection.
 * @param {Function} props.onAdd - add the selection to the chat.
 * @param {Function} props.onAsk - ask about the selection in the side chat.
 * @param {Function} props.onAnnotate - annotate the block under the pointer.
 * @param {Function} props.onClose - close the menu.
 * @param {Function} props.t - the translator.
 * @returns {object} the element.
 */
export function SelectionMenu({ anchor, selection, hasBlock, onCopy, onAdd, onAsk, onAnnotate, onClose, t }) {
  const items = [];
  if (selection !== '') {
    items.push(h('button', { type: 'button', key: 'copy', className: 'mmd-menu-item', onClick: onCopy }, t('chat.copy')));
    items.push(h('span', { className: 'mmd-menu-sep', key: 'sep1', 'aria-hidden': true }));
  }
  if (selection !== '') {
    items.push(h('button', { type: 'button', key: 'add', className: 'mmd-menu-item', onClick: onAdd }, t('chat.addSelection')));
    items.push(h('button', { type: 'button', key: 'ask', className: 'mmd-menu-item', onClick: onAsk }, t('chat.askSide')));
  }
  if (hasBlock) {
    items.push(h('span', { className: 'mmd-menu-sep', key: 'sep2', 'aria-hidden': true }));
    items.push(h('button', { type: 'button', key: 'anno', className: 'mmd-menu-item', onClick: onAnnotate }, t('mdAnnotate.pickTitle')));
  }
  return createPortal(
    h('div', {
      className: 'mmd-menu',
      style: { top: `${anchor.top}px`, left: `${anchor.left}px` },
      role: 'menu',
      onMouseDown: (event) => event.stopPropagation(),
    }, items),
    document.body,
  );
}

/**
 * The text the reader has selected inside the document.
 * @param {Element|null} root - the document body.
 * @returns {string} the selected text, or '' when there is none.
 */
function selectionTextIn(root) {
  const selection = document.getSelection();
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0 || root === null) return '';
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return '';
  return selection.toString().trim();
}

/**
 * Put text on the clipboard.
 *
 * The clipboard API needs a secure context; the desktop app serves the page
 * from a custom scheme, so the old command is kept as the fallback.
 * @param {string} text - the text to copy.
 * @returns {Promise<boolean>} whether the text was copied.
 */
async function copyText(text) {
  if (text === '') return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/**
 * The side chat: questions about this file that stay out of the main chat.
 *
 * The answer comes from the Host's model, so the conversation the reader is
 * having is never disturbed by the question.
 * @param {object} props - the component props.
 * @param {string} props.path - the file the questions are about.
 * @param {string} props.selection - the text the reader picked.
 * @param {Function} props.onClose - close the panel.
 * @param {Function} props.ask - the function that asks the Host.
 * @param {Function} props.t - the translator.
 * @returns {object} the element.
 */
export function SideChat({ path, selection, onClose, ask, t }) {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    const question = text.trim();
    if (question === '' || busy) return;
    const history = turns.map((turn) => ({ role: turn.role, text: turn.text }));
    setBusy(true);
    setError(null);
    setTurns((prev) => [...prev, { role: 'user', text: question }]);
    setText('');
    try {
      const answer = await ask({ path, selection, question, history });
      setTurns((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (failure) {
      setError(t('sideChat.failed', { message: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      setBusy(false);
    }
  };

  return h('div', { className: 'mmd-side-chat' }, [
    h('div', { className: 'mmd-side-chat-head', key: 'head' }, [
      h('span', { className: 'mmd-side-chat-title', key: 'title' }, t('sideChat.title')),
      h('span', { className: 'mmd-side-chat-file', key: 'file', title: path }, path),
      h('button', {
        type: 'button', key: 'close', className: 'mmd-side-chat-close',
        title: t('chat.close'), 'aria-label': t('chat.close'),
        onClick: onClose,
      }, '×'),
    ]),
    selection === '' ? null : h('div', { className: 'mmd-side-chat-ctx', key: 'ctx' }, selection),
    h('div', { className: 'mmd-side-chat-body', key: 'body' },
      turns.length === 0
        ? [h('div', { className: 'mmd-side-chat-empty', key: 'empty' }, t('sideChat.empty'))]
        : turns.map((turn, index) => h('div', {
            key: `t:${index}`,
            className: turn.role === 'user' ? 'mmd-side-chat-turn mmd-side-chat-user' : 'mmd-side-chat-turn mmd-side-chat-assistant',
          }, turn.role === 'user' || MarkdownText === null
            ? turn.text
            : h(MarkdownText, { text: turn.text, labels: markdownLabels(t) }))),
    ),
    error === null ? null : h('div', { className: 'mmd-side-chat-error', key: 'error' }, error),
    h('div', { className: 'mmd-side-chat-input', key: 'input' }, [
      h('textarea', {
        key: 'text', className: 'mmd-side-chat-text', rows: 2,
        placeholder: t('sideChat.placeholder'),
        value: text,
        onChange: (event) => setText(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
        },
      }),
      h('button', {
        type: 'button', key: 'send', className: 'mmd-side-chat-send',
        title: t('sideChat.ask'), 'aria-label': t('sideChat.ask'),
        disabled: text.trim() === '' || busy,
        onClick: submit,
      }, busy ? '…' : '↑'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/* Markdown review: annotate a block of the document.                   */
/* ------------------------------------------------------------------ */

/** The blocks a reviewer may annotate in a Markdown document. */
const ANNOTATABLE_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table,hr,figcaption';

/**
 * The block a click landed on.
 *
 * A table cell is a better unit of review than the whole table, so a click
 * inside a cell keeps the cell.
 * @param {EventTarget|null} target - what was clicked.
 * @param {Element|null} root - the document body.
 * @returns {Element|null} the block, or null when the click was not on one.
 */
export function pickBlock(target, root) {
  if (target === null || target === undefined || typeof target.closest !== 'function') return null;
  const element = target.closest(ANNOTATABLE_SELECTOR);
  if (element === null || root === null || !root.contains(element)) return null;
  if (element.tagName === 'TABLE') {
    const cell = target.closest('td,th');
    if (cell !== null && root.contains(cell)) return cell;
  }
  return element;
}

/**
 * Where a block sits in the document, in words.
 * @param {Element} element - the block.
 * @returns {string} the path.
 */
function describeBlock(element) {
  const parts = [];
  let current = element;
  while (current !== null && current.tagName !== 'BODY' && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent !== null) {
      const same = [...parent.children].filter((child) => child.tagName === current.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

/**
 * The text of a block, short enough to be quoted in a prompt.
 * @param {Element} element - the block.
 * @returns {string} the text.
 */
function blockText(element) {
  const raw = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

/**
 * The path from the document root to one element.
 *
 * The path survives a re-render of the Markdown, an element reference does
 * not: the numbers are the children of every parent, so the same block is
 * found again after the content is laid out again.
 * @param {Element} root - the document root.
 * @param {Element} element - the element to remember.
 * @returns {number[]|null} the path, or null when the element is not in the root.
 */
export function elementPath(root, element) {
  const path = [];
  let node = element;
  while (node !== null && node !== root) {
    const parent = node.parentElement;
    if (parent === null) return null;
    path.unshift([...parent.children].indexOf(node));
    node = parent;
  }
  return node === root ? path : null;
}

/**
 * The element a path points at.
 * @param {Element|null} root - the document root.
 * @param {number[]|null} path - the path.
 * @returns {Element|null} the element, or null when the path no longer fits.
 */
export function resolvePath(root, path) {
  if (root === null || !Array.isArray(path)) return null;
  let node = root;
  for (const index of path) {
    const children = node.children;
    if (children === undefined || index < 0 || index >= children.length) return null;
    node = children[index];
  }
  return node;
}

/**
 * Where an annotated block sits, in the coordinates of the document root.
 * @param {Element|null} root - the document root.
 * @param {number[]|null} path - the path of the block.
 * @returns {object|null} the box, or null when the block is gone.
 */
function measureBlock(root, path) {
  const element = resolvePath(root, path);
  if (element === null) return null;
  const base = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - base.top,
    left: rect.left - base.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * The prompt that carries the Markdown annotations to the Agent.
 *
 * A block the reviewer only marked has no words of its own, so the prompt
 * says so instead of pretending there is a request.
 * @param {Function} t - the translator.
 * @param {string} path - the file the annotations belong to.
 * @param {object[]} annotations - the annotations.
 * @param {string} task - the task id.
 * @returns {string} the prompt.
 */
export function markdownAnnotateMessage(t, path, annotations, task) {
  const lines = annotations.map((item, index) => {
    const where = item.info.text !== '' ? `（${item.info.path}；文本「${item.info.text}」）` : `（${item.info.path}）`;
    const comment = (item.comment ?? '').trim();
    return comment === ''
      ? `${index + 1}. <${item.info.tag}> ${where}（评审人只标记了这一段，没有写具体要求）`
      : `${index + 1}. <${item.info.tag}> ${where}：${comment}`;
  });
  const template = ANNOTATE_TASKS.find((item) => item.id === task)?.message ?? 'annotate.message';
  return t(template, { path, list: lines.join('\n') });
}

export function MarkdownMermaidBody({ ctx, content, resourceAddress, useResource, inputActions, useInput, useSessions, sessionId, t }) {
  const rootRef = useRef(null);
  const absolutePath = useResource(resourceAddress).value?.absolutePath;
  const [selected, setSelected] = useState(null);
  const [sideChat, setSideChat] = useState(null);
  const [annotating, setAnnotating] = useState(false);
  const [mdAnnotations, setMdAnnotations] = useState([]);
  const [pendingPick, setPendingPick] = useState(null);
  const [pickComment, setPickComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editFiles, setEditFiles] = useState([]);
  const [editRemoved, setEditRemoved] = useState([]);
  const [mdTask, setMdTask] = useState('change');
  const [mdNotice, setMdNotice] = useState(null);
  const [mdSending, setMdSending] = useState(false);
  const [showList, setShowList] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editorHtml, setEditorHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState(null);
  const editorRef = useRef(null);
  const kitRef = useRef(null);
  const frontmatterRef = useRef(null);
  const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : '';
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const cwd = typeof useSessions === 'function' ? useSessions((state) => state.byId?.[sessionId]?.cwd) : undefined;
  const shownPath = useMemo(() => {
    if (typeof cwd !== 'string' || cwd.length <= 1 || absolutePath === undefined) return absolutePath ?? '';
    return relativeToRoot(absolutePath, cwd) ?? absolutePath;
  }, [cwd, absolutePath]);
  const pathImages = useMemo(
    () => ({ resolve: (value) => markdownImageUrl(document.baseURI, absolutePath, value) }),
    [absolutePath],
  );

  // Track a text selection inside this document and offer the two things a
  // reader can do with it: hand it to the chat, or ask about it aside.
  useEffect(() => {
    const onSelection = () => {
      const selection = document.getSelection();
      const root = rootRef.current;
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0 || root === null) {
        setSelected(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelected(null);
        return;
      }
      const text = selection.toString().trim();
      if (text === '') {
        setSelected(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const next = { text, top: Math.round(rect.top), left: Math.round(rect.left + rect.width / 2) };
      setSelected((prev) => (prev !== null && prev.text === next.text && prev.top === next.top && prev.left === next.left ? prev : next));
    };
    const onScroll = () => setSelected(null);
    document.addEventListener('selectionchange', onSelection);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('selectionchange', onSelection);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  // A right click inside the document opens the same actions, and keeps Copy
  // in reach: replacing the native menu would otherwise take it away.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const onContextMenu = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target === null || !root.contains(target)) return;
      const selection = selectionTextIn(root);
      const block = pickBlock(target, root);
      if (selection === '' && block === null) return;
      event.preventDefault();
      setMenu({
        top: Math.round(event.clientY),
        left: Math.round(event.clientX),
        selection,
        block,
      });
    };
    root.addEventListener('contextmenu', onContextMenu);
    return () => root.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // The menu closes as soon as the reader looks away from it.
  useEffect(() => {
    if (menu === null) return undefined;
    const onPointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest('.mmd-menu') !== null) return;
      setMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  // The marks sit on the blocks they belong to, so they follow the layout.
  useEffect(() => {
    const bump = () => setLayoutTick((value) => value + 1);
    bump();
    window.addEventListener('resize', bump);
    // The side chat and the annotation list are pinned to the pane, so they
    // have to follow it when the document scrolls underneath them.
    window.addEventListener('scroll', bump, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(bump) : null;
    if (rootRef.current !== null) observer?.observe(rootRef.current);
    return () => {
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
      observer?.disconnect();
    };
  }, []);

  const text = content.kind === 'text' ? content.text : '';
  const split = useMemo(() => splitFrontmatter(text), [text]);
  const segments = useMemo(() => splitMermaid(split?.body ?? text), [split, text]);
  const labels = useMemo(() => markdownLabels(t), [t]);

  useLayoutEffect(() => {
    if (rootRef.current !== null) upgradeBreaks(rootRef.current);
  });

  if (content.kind !== 'text') return null;
  const children = [];
  if (split !== undefined) {
    children.push(h('div', { className: 'mmd-frontmatter', key: 'fm' }, h('pre', null, split.source)));
  }
  segments.forEach((segment, index) => {
    if (segment.type === 'mermaid') {
      children.push(h(MermaidView, { key: index, code: segment.code, done: content.eof, t }));
    } else if (segment.text.trim() !== '' || segments.length === 1) {
      children.push(
        MarkdownText === null
          ? h('pre', { key: index, className: 'mmd-plain' }, segment.text)
          : h(MarkdownText, {
              key: index,
              text: segment.text,
              streaming: !content.eof,
              labels,
              pathImages,
            }),
      );
    }
  });

  const sourceText = content.kind === 'text' ? content.text : '';
  const ensureKit = async () => {
    if (kitRef.current !== null) return kitRef.current;
    const chunk = await loadChunk('./client.editor.js');
    const kit = (chunk.createEditorKit ?? chunk.default?.createEditorKit)();
    kitRef.current = kit;
    return kit;
  };
  const startEditing = async () => {
    setSaveNote(null);
    try {
      const kit = await ensureKit();
      const split = splitFrontmatter(sourceText);
      frontmatterRef.current = split?.source ?? null;
      setEditorHtml(kit.toHtml(split?.body ?? sourceText));
      setEditing(true);
    } catch (error) {
      setSaveNote(error instanceof Error ? error.message : String(error));
    }
  };
  const exec = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };
  const insertHtml = (html) => exec('insertHTML', html);
  const askUrl = async (kind) => {
    const url = await askText(kind === 'link' ? t('edit.linkPrompt') : t('edit.imagePrompt'), 'https://');
    if (url === null || url.trim() === '') return;
    exec(kind === 'link' ? 'createLink' : 'insertImage', url.trim());
  };
  const saveEditing = async () => {
    if (saving) return;
    setSaving(true);
    setSaveNote(null);
    try {
      const kit = await ensureKit();
      const body = kit.toMarkdown(editorRef.current?.innerHTML ?? '');
      const frontmatter = frontmatterRef.current;
      const markdown = frontmatter === null ? body : `---\n${frontmatter}\n---\n\n${body}`;
      const result = await ctx.remote.commands.execute(
        sessionId,
        '/mmd-save ' + JSON.stringify({ path: absolutePath, content: markdown }),
        [],
      );
      if (result !== null && typeof result === 'object' && result.ok === false) {
        setSaveNote(String(result.error?.message ?? 'save failed'));
      } else if (result?.value?.kind === 'error') {
        setSaveNote(String(result.value.text ?? 'save failed'));
      } else {
        editChannel(absolutePath).set(false);
        setEditing(false);
      }
    } catch (error) {
      setSaveNote(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(null);
  useEffect(() => {
    const channel = editChannel(absolutePath);
    const stopMode = channel.subscribe((open) => {
      if (open) startEditing();
      else setEditing(false);
    });
    const stopSave = channel.onSaveRequest(() => {
      if (typeof saveRef.current === 'function') saveRef.current();
    });
    return () => {
      stopMode();
      stopSave();
    };
  }, [absolutePath]);

  saveRef.current = saveEditing;

  const editorTools = [
    { label: 'B', title: 'Bold', run: () => exec('bold') },
    { label: 'I', title: 'Italic', run: () => exec('italic') },
    { label: 'S', title: 'Strikethrough', run: () => exec('strikeThrough') },
    { label: '</>', title: 'Inline code', run: () => insertHtml('<code>code</code>&nbsp;') },
    { sep: true },
    { label: '•', title: 'Bullet list', run: () => exec('insertUnorderedList') },
    { label: '1.', title: 'Numbered list', run: () => exec('insertOrderedList') },
    { label: '☑', title: 'Checklist', run: () => insertHtml('<ul><li>☐ </li></ul>') },
    { sep: true },
    { label: '🔗', title: 'Link', run: () => askUrl('link') },
    { label: '🖼', title: 'Image', run: () => askUrl('image') },
    { label: '▦', title: 'Table', run: () => insertHtml('<table><thead><tr><th>列1</th><th>列2</th></tr></thead><tbody><tr><td> </td><td> </td></tr></tbody></table><p><br></p>') },
    { label: '▤', title: 'Code block', run: () => insertHtml('<pre><code>code</code></pre><p><br></p>') },
    { label: '❝', title: 'Quote', run: () => exec('formatBlock', 'blockquote') },
    { label: '—', title: 'Divider', run: () => exec('insertHorizontalRule') },
  ];
  const blockStyles = [
    ['p', t('edit.blockParagraph')],
    ['h1', 'H1'],
    ['h2', 'H2'],
    ['h3', 'H3'],
  ];
  const editButton = null;
  const editorView = !editing
    ? null
    : h('div', { className: 'mmd-editor', key: 'editor' }, [
        h('div', { className: 'mmd-editor-bar', key: 'bar' }, [
          h('select', {
            key: 'style',
            className: 'mmd-editor-select',
            defaultValue: 'p',
            onChange: (event) => exec('formatBlock', event.target.value),
          }, blockStyles.map(([value, label]) => h('option', { key: value, value }, label))),
          h('span', { className: 'mmd-editor-sep', key: 's0' }),
          ...editorTools.map((tool, index) =>
            tool.sep
              ? h('span', { className: 'mmd-editor-sep', key: `sep:${index}` })
              : h('button', {
                  type: 'button',
                  key: `t:${index}`,
                  className: 'mmd-editor-tool',
                  title: tool.title,
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: tool.run,
                }, tool.label),
          ),
          h('span', { className: 'mmd-editor-spacer', key: 'spacer' }),
          saveNote === null ? null : h('span', { className: 'mmd-editor-note', key: 'note' }, saveNote),
          saving ? h('span', { className: 'mmd-editor-note', key: 'saving' }, t('edit.saving')) : null,
        ]),
        frontmatterRef.current === null
          ? null
          : h('div', { className: 'mmd-editor-note', key: 'fm' }, t('edit.frontmatterKeep')),
        h('div', {
          key: 'surface',
          ref: editorRef,
          className: 'mmd-editor-surface',
          contentEditable: true,
          suppressContentEditableWarning: true,
          spellCheck: false,
          dangerouslySetInnerHTML: { __html: editorHtml },
        }),
      ]);

  // The reviewer annotates a block of the document: a paragraph, a heading, a
  // list item, a table cell. The mark keeps the number the reviewer already
  // refers to, so the list, the marks and the prompt always agree.
  const clearMdAnnotations = () => {
    setMdAnnotations((prev) => {
      revokeAttachments(prev.flatMap((item) => item.attachments ?? []));
      return [];
    });
    setShowList(false);
  };

  const removeMdAnnotation = (index) => {
    setMdAnnotations((prev) => {
      const target = prev[index];
      if (target !== undefined) revokeAttachments(target.attachments);
      return prev.filter((_, i) => i !== index);
    });
  };

  const startMdEdit = (index) => {
    const target = mdAnnotations[index];
    if (target === undefined) return;
    setPendingPick(null);
    setEditIndex(index);
    setEditValue(target.comment ?? '');
    setEditFiles(target.attachments ?? []);
    setEditRemoved([]);
  };

  const confirmMdEdit = () => {
    if (editIndex === null) return;
    setMdAnnotations((prev) => prev.map((item, index) => (
      index === editIndex ? { ...item, comment: editValue.trim(), attachments: editFiles } : item
    )));
    revokeAttachments(editRemoved);
    setEditRemoved([]);
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
  };

  const cancelMdEdit = () => {
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
    setEditRemoved([]);
  };

  const startPick = (block) => {
    if (block === null || block === undefined) return;
    const rect = block.getBoundingClientRect();
    setPickComment('');
    setPendingFiles((prev) => { revokeAttachments(prev); return []; });
    setEditIndex(null);
    setPendingPick({
      info: { tag: block.tagName.toLowerCase(), path: describeBlock(block), text: blockText(block) },
      path: elementPath(rootRef.current, block),
      anchor: {
        top: Math.round(rect.top + 10),
        left: Math.round(Math.min(Math.max(12, rect.left - 170), window.innerWidth - 360)),
      },
    });
  };

  const confirmPick = () => {
    if (pendingPick === null) return;
    setMdAnnotations((prev) => [...prev, {
      info: pendingPick.info,
      comment: pickComment.trim(),
      attachments: pendingFiles,
      path: pendingPick.path,
      anchor: pendingPick.anchor,
    }]);
    setPendingPick(null);
    setPickComment('');
    setPendingFiles([]);
  };

  const sendMdAnnotations = async () => {
    if (mdAnnotations.length === 0 || mdSending) return;
    setMdSending(true);
    setMdNotice(null);
    try {
      const outcome = await sendAnnotation(
        ctx, inputActions, sessionId,
        markdownAnnotateMessage(t, shownPath, mdAnnotations, mdTask),
        collectFiles(mdAnnotations),
        () => draftRef.current,
      );
      if (outcome.attachmentsDropped === true) setMdNotice(t('annotate.noSession'));
      clearMdAnnotations();
    } catch (error) {
      setMdNotice(t('annotate.sendFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setMdSending(false);
    }
  };

  /** The AI assist of a Markdown annotation. */
  const mdAssistOptions = (info, comment) => ({
    context: {
      kind: 'element',
      path: shownPath,
      tag: info?.tag ?? 'div',
      selector: info?.path ?? '',
      subject: info?.text ?? '',
      comment: comment ?? '',
    },
    onGenerate: async ({ intent, note, current }) => requestDraft({
      kind: 'element',
      path: shownPath,
      tag: info?.tag ?? 'div',
      selector: info?.path ?? '',
      subject: info?.text ?? '',
      comment: current ?? comment ?? '',
      intent,
      note,
    }),
    onTemplate: (intent) => assistTemplate(t, intent, info?.text ?? ''),
  });

  const badgeRects = useMemo(
    () => mdAnnotations.map((item) => measureBlock(rootRef.current, item.path)),
    [mdAnnotations, layoutTick, content],
  );

  // The box the preview occupies on the page. The side chat and the list of
  // annotations belong to the pane, not to the document: a long document
  // would otherwise carry them out of sight.
  const previewBox = useMemo(() => {
    const root = rootRef.current;
    if (root === null) return null;
    // The pane is the visible window onto the document; the document itself is
    // as tall as its content, and a panel pinned to its bottom would be out of
    // sight in a long file.
    const host = root.closest('[data-sidebar-right-panel]') ?? root;
    const rect = host.getBoundingClientRect();
    const top = Math.max(rect.top, 0);
    const height = Math.min(rect.bottom, window.innerHeight) - top;
    if (rect.width <= 0 || height <= 0) return null;
    return {
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(height)}px`,
    };
  }, [layoutTick, content, sideChat, showList]);

  const badgeLayer = mdAnnotations.length === 0
    ? null
    : h('div', { className: 'mmd-md-layer', key: 'layer' }, badgeRects.map((rect, index) => (
        rect === null
          ? null
          : h(Fragment, { key: `mark:${index}` }, [
              h('div', {
                className: 'mmd-md-outline', key: 'o',
                style: { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` },
              }),
              h('span', {
                className: 'mmd-md-mark', key: 'm',
                style: { top: `${rect.top}px`, left: `${rect.left}px` },
              }, String(index + 1)),
            ])
      )));

  const reviewBar = h('div', { className: 'mmd-md-bar', key: 'bar' }, [
    h('button', {
      type: 'button', key: 'toggle',
      className: annotating ? 'mmd-reveal-tree mmd-anno-toggle mmd-anno-active' : 'mmd-reveal-tree mmd-anno-toggle',
      onClick: () => { setAnnotating((on) => !on); setPendingPick(null); setShowList(false); },
    }, [annotateToggleIcon(14, 'icon'), h('span', { key: 'label' }, annotating ? t('mdAnnotate.hint') : t('mdAnnotate.toggle'))]),
    mdAnnotations.length > 0
      ? h('button', {
          type: 'button', key: 'count', className: 'mmd-anno-pill',
          title: t('annotate.count', { count: mdAnnotations.length }),
          onClick: () => setShowList((on) => !on),
        }, [
          h('span', { className: 'mmd-anno-pill-icon', key: 'i' }, chatBubbleIcon(13)),
          h('span', { key: 'n' }, mdAnnotations.length === 1 ? t('annotate.countOne') : t('annotate.count', { count: mdAnnotations.length })),
        ])
      : null,
    mdAnnotations.length > 0
      ? h('button', { type: 'button', key: 'clear', className: 'mmd-reveal-tree', onClick: clearMdAnnotations }, t('annotate.clear'))
      : null,
    mdAnnotations.length > 0
      ? h('select', {
          key: 'task', className: 'mmd-anno-task', value: mdTask,
          title: t('annotate.taskLabel'), 'aria-label': t('annotate.taskLabel'),
          onChange: (event) => setMdTask(event.target.value),
        }, ANNOTATE_TASKS.map((item) => h('option', { key: item.id, value: item.id }, t(item.label))))
      : null,
    mdAnnotations.length > 0
      ? h('button', {
          type: 'button', key: 'send', className: 'mmd-pop-send', disabled: mdSending, onClick: sendMdAnnotations,
        }, mdSending ? t('annotate.sending') : t('annotate.sendAll'))
      : null,
    h('span', { className: 'mmd-md-bar-spacer', key: 'spacer' }),
    mdNotice === null ? null : h('span', { className: 'mmd-anno-notice', key: 'notice' }, mdNotice),
  ]);

  const annotationList = showList && mdAnnotations.length > 0
    ? h('div', { className: 'mmd-anno-list', key: 'list' }, mdAnnotations.map((item, index) =>
        h(AnnotationItem, {
          key: `${index}:${item.info.path}`,
          item,
          index,
          title: item.info.path,
          text: `${item.info.tag}${item.info.text !== '' ? ' · ' + item.info.text : ''}${(item.comment ?? '') !== '' ? '：' + item.comment : ''}`,
          t,
          onEdit: startMdEdit,
          onRemove: removeMdAnnotation,
        })))
    : null;

  const selectionMenu = menu === null
    ? null
    : h(SelectionMenu, {
        key: 'menu',
        anchor: { top: menu.top, left: menu.left },
        selection: menu.selection,
        hasBlock: menu.block !== null,
        onCopy: () => { copyText(menu.selection); setMenu(null); },
        onAdd: () => { addSelectionToChat(inputActions, shownPath, menu.selection); setMenu(null); },
        onAsk: () => { setSideChat({ selection: menu.selection }); setMenu(null); },
        onAnnotate: () => { setAnnotating(true); startPick(menu.block); setMenu(null); },
        t,
      });

  const selectionActions = selected === null || annotating || menu !== null
    ? null
    : createPortal(
        h(SelectionActions, {
          key: 'sel-actions',
          anchor: {
            top: selected.top < 56 ? selected.top + 30 : selected.top - 8,
            left: selected.left,
            below: selected.top < 56,
          },
          onAdd: () => {
            addSelectionToChat(inputActions, shownPath, selected.text);
            setSelected(null);
            document.getSelection()?.removeAllRanges();
          },
          onAsk: () => {
            setSideChat({ selection: selected.text });
            setSelected(null);
            document.getSelection()?.removeAllRanges();
          },
          t,
        }),
        document.body,
        'sel-actions',
      );

  const sideChatPanel = sideChat === null
    ? null
    : h(SideChat, {
        key: 'side-chat',
        path: shownPath,
        selection: sideChat.selection ?? '',
        onClose: () => setSideChat(null),
        ask: (payload) => requestAnswer({ ...payload, path: shownPath, content: text }),
        t,
      });

  const overlay = previewBox === null || (annotationList === null && sideChatPanel === null)
    ? null
    : createPortal(
        h('div', { className: 'mmd-md-overlay', style: previewBox, key: 'overlay' }, [
          annotationList,
          sideChatPanel,
        ]),
        document.body,
        'md-overlay',
      );

  const pickPopover = pendingPick === null
    ? null
    : h(InstructionPopover, {
        key: 'pick-pop',
        anchor: pendingPick.anchor,
        title: `${t('mdAnnotate.pickTitle')}：<${pendingPick.info.tag}>${pendingPick.info.text !== '' ? ' · ' + pendingPick.info.text : ''}`,
        placeholder: t('mdAnnotate.placeholder'),
        value: pickComment,
        onChange: setPickComment,
        onSubmit: confirmPick,
        onClose: () => { revokeAttachments(pendingFiles); setPendingFiles([]); setPendingPick(null); },
        attachments: pendingFiles,
        onAttach: (files) => setPendingFiles((prev) => [...prev, ...createAttachments(files)]),
        onDetach: (id) => setPendingFiles((prev) => dropAttachment(prev, id)),
        assist: mdAssistOptions(pendingPick.info, pickComment),
        allowEmpty: true,
        t,
      });

  const editPopover = editIndex === null
    ? null
    : h(InstructionPopover, {
        key: 'edit-pop',
        anchor: mdAnnotations[editIndex]?.anchor ?? { top: 80, left: 80 },
        title: `${t('annotate.editHeading')}：<${mdAnnotations[editIndex]?.info.tag ?? 'div'}>${mdAnnotations[editIndex]?.info.text !== '' ? ' · ' + mdAnnotations[editIndex]?.info.text : ''}`,
        placeholder: t('mdAnnotate.placeholder'),
        value: editValue,
        onChange: setEditValue,
        onSubmit: confirmMdEdit,
        onClose: cancelMdEdit,
        attachments: editFiles,
        onAttach: (files) => setEditFiles((prev) => [...prev, ...createAttachments(files)]),
        onDetach: (id) => setEditFiles((prev) => dropAttachment(prev, id)),
        submitLabel: t('annotate.save'),
        assist: mdAssistOptions(mdAnnotations[editIndex]?.info, editValue),
        allowEmpty: true,
        t,
      });

  return h('div', {
    className: annotating ? 'mmd-document mmd-picking' : 'mmd-document',
    'data-document-markdown-mermaid': true,
    ref: rootRef,
    onMouseDown: annotating
      ? (event) => {
          if (pickBlock(event.target, rootRef.current) !== null) event.preventDefault();
        }
      : undefined,
    onClick: annotating
      ? (event) => startPick(pickBlock(event.target, rootRef.current))
      : undefined,
  }, [
    h('style', { key: 'style' }, STYLE),
    h(AiChatFab, { key: 'fab', ctx, sessionId, inputActions, useInput, t }),
    editButton,
    editorView,
    editing ? null : reviewBar,
    ...(editing ? [] : children),
    editing ? null : badgeLayer,
    editing ? null : overlay,
    editing ? null : selectionMenu,
    editing ? null : selectionActions,
    editing ? null : pickPopover,
    editing ? null : editPopover,
  ]);
}

/* ------------------------------------------------------------------ */
/* Image annotation renderer: drag-select regions on a raster image.   */
/* ------------------------------------------------------------------ */

const IMAGE_ANNOTATE_ID = '@local/markdown-mermaid-preview/image-annotate';

/**
 * The place an image region covers, in the words the prompt uses.
 * @param {Function} t - the translator.
 * @param {object} [region] - the region, with x, y, w and h in fractions.
 * @returns {string} the description, or an empty string without a region.
 */
function regionArea(t, region) {
  if (region === undefined || region === null) return '';
  const pct = (value) => Math.round(value * 100);
  return t('annotate.region', {
    x: pct(region.x), x2: pct(region.x + region.w), y: pct(region.y), y2: pct(region.y + region.h),
  });
}

function imageAnnotateMessage(t, path, regions, task) {
  const list = regions.map((item, index) => {
    const pct = (value) => Math.round(value * 100);
    const area = t('annotate.region', {
      x: pct(item.x), x2: pct(item.x + item.w), y: pct(item.y), y2: pct(item.y + item.h),
    });
    return `${index + 1}. ${area}：${item.comment}`;
  });
  const template = ANNOTATE_TASKS.find((item) => item.id === task)?.imageMessage ?? 'annotate.imageMessage';
  return t(template, { path, list: list.join('\n') });
}

function ImageAnnotateBody(props) {
  const { ctx, content, resourceAddress, useResource, inputActions, useInput, useSessions, sessionId, t } = props;
  const absolutePath = useResource(resourceAddress).value?.absolutePath;
  const [url, setUrl] = useState(null);
  const [editing, setEditing] = useState(false);
  const [regions, setRegions] = useState([]);
  const [drag, setDrag] = useState(null);
  const [pending, setPending] = useState(null);
  const [comment, setComment] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editFiles, setEditFiles] = useState([]);
  const [editRemoved, setEditRemoved] = useState([]);
  const [task, setTask] = useState('change');
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef(null);
  const draft = typeof useInput === 'function' ? useInput((state) => state.draft) : '';
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const cwd = typeof useSessions === 'function' ? useSessions((state) => state.byId?.[sessionId]?.cwd) : undefined;
  const shownPath = useMemo(() => {
    if (absolutePath === undefined) return '';
    if (typeof cwd !== 'string' || cwd.length <= 1) return absolutePath;
    return relativeToRoot(absolutePath, cwd) ?? absolutePath;
  }, [cwd, absolutePath]);

  useEffect(() => {
    if (content.kind !== 'bytes') return undefined;
    const blob = new Blob([content.data]);
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [content]);

  const pointOf = (event) => {
    const stage = stageRef.current;
    if (stage === null) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onDown = (event) => {
    if (!editing) return;
    const point = pointOf(event);
    if (point === null) return;
    event.preventDefault();
    setDrag({ from: point, to: point });
    setPending(null);
  };
  const onMove = (event) => {
    if (drag === null) return;
    const point = pointOf(event);
    if (point === null) return;
    setDrag({ from: drag.from, to: point });
  };
  const onUp = (event) => {
    if (drag === null) return;
    const point = pointOf(event) ?? drag.to;
    const x = Math.min(drag.from.x, point.x);
    const y = Math.min(drag.from.y, point.y);
    const w = Math.abs(point.x - drag.from.x);
    const h = Math.abs(point.y - drag.from.y);
    setDrag(null);
    if (w < 0.01 || h < 0.01) return;
    setComment('');
    setPendingFiles((prev) => { revokeAttachments(prev); return []; });
    setPending({
      region: { x, y, w, h },
      top: Math.min(Math.max(12, event.clientY + 12), window.innerHeight - 220),
      left: Math.min(Math.max(12, event.clientX - 170), window.innerWidth - 360),
    });
  };

  const confirmRegion = () => {
    const text = comment.trim();
    if (text === '' || pending === null) return;
    setRegions((prev) => [...prev, { ...pending.region, comment: text, attachments: pendingFiles, anchor: { top: pending.top, left: pending.left } }]);
    setPending(null);
    setComment('');
    setPendingFiles([]);
  };

  const removeRegion = (index) => setRegions((prev) => {
    const target = prev[index];
    if (target !== undefined) revokeAttachments(target.attachments);
    return prev.filter((_, i) => i !== index);
  });

  /**
   * Re-open one region for editing.
   *
   * The region keeps its place in the list and its badge, so the numbers the
   * reviewer already refers to do not move.
   */
  const startEdit = (index) => {
    const target = regions[index];
    if (target === undefined) return;
    setPending(null);
    setEditIndex(index);
    setEditValue(target.comment);
    setEditFiles(target.attachments ?? []);
    setEditRemoved([]);
  };

  /** Save the region that is open for editing. */
  const confirmEdit = () => {
    const text = editValue.trim();
    if (text === '' || editIndex === null) return;
    setRegions((prev) => prev.map((item, index) => (
      index === editIndex ? { ...item, comment: text, attachments: editFiles } : item
    )));
    revokeAttachments(editRemoved);
    setEditRemoved([]);
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
  };

  /** Close the editor without touching the region. */
  const cancelEdit = () => {
    setEditIndex(null);
    setEditValue('');
    setEditFiles([]);
    setEditRemoved([]);
  };

  /**
   * Detach a file from the region that is open for editing.
   *
   * The file is not released here: the region still points at it until the
   * edit is saved. Saving releases it.
   */
  const detachEditFile = (id) => {
    const removed = editFiles.find((attachment) => attachment.id === id);
    if (removed === undefined) return;
    setEditFiles((prev) => prev.filter((attachment) => attachment.id !== id));
    setEditRemoved((prev) => [...prev, removed]);
  };
  const clearAll = () => setRegions((prev) => {
    revokeAttachments(prev.flatMap((item) => item.attachments ?? []));
    return [];
  });
  const sendAll = async () => {
    if (regions.length === 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const outcome = await sendAnnotation(
        ctx, inputActions, sessionId,
        imageAnnotateMessage(t, shownPath, regions, task),
        collectFiles(regions),
        () => draftRef.current,
      );
      if (outcome.attachmentsDropped === true) setNotice(t('annotate.noSession'));
      clearAll();
      setEditing(false);
    } catch (error) {
      setNotice(t('annotate.sendFailed', { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSending(false);
    }
  };

  /**
   * The AI assist of this region.
   *
   * The Host gets the area it has to talk about and the words the reviewer
   * already wrote; the local template is the fallback for a Host that cannot
   * answer.
   */
  const assistOptions = (region, comment) => {
    const area = regionArea(t, region);
    return {
      context: {
        kind: 'region',
        path: shownPath,
        area,
        subject: '',
        comment: comment ?? '',
      },
      onGenerate: async ({ intent, note, current }) => requestDraft({
        kind: 'region',
        path: shownPath,
        area,
        subject: '',
        comment: current ?? comment ?? '',
        intent,
        note,
      }),
      onTemplate: (intent) => assistTemplate(t, intent, area),
    };
  };

  if (content.kind !== 'bytes') return null;
  if (url === null) return h('div', { className: 'mmd-locate-note' }, t('annotate.loading'));

  const dragRect =
    drag === null
      ? null
      : {
          x: Math.min(drag.from.x, drag.to.x),
          y: Math.min(drag.from.y, drag.to.y),
          w: Math.abs(drag.to.x - drag.from.x),
          h: Math.abs(drag.to.y - drag.from.y),
        };

  return h('div', { className: 'mmd-anno' }, [
    h('style', { key: 'style' }, STYLE),
    h('div', { className: 'mmd-anno-bar', key: 'bar' }, [
      h('button', {
        type: 'button', key: 'toggle',
        className: editing ? 'mmd-reveal-tree mmd-anno-toggle mmd-anno-active' : 'mmd-reveal-tree mmd-anno-toggle',
        onClick: () => { setEditing((value) => !value); setPending(null); },
      }, [annotateToggleIcon(14, 'icon'), h('span', { key: 'label' }, editing ? t('annotate.exit') : t('annotate.toggle'))]),
      editing && regions.length === 0 && dragRect === null && pending === null
        ? h('span', { className: 'mmd-anno-count', key: 'hint' }, t('annotate.dragHint'))
        : null,
      regions.length > 0
        ? h('span', { className: 'mmd-anno-count', key: 'count' }, t('annotate.count', { count: regions.length }))
        : null,
      regions.length > 0
        ? h('button', { type: 'button', key: 'clear', className: 'mmd-reveal-tree', onClick: clearAll }, t('annotate.clear'))
        : null,
      regions.length > 0
        ? h('select', {
            key: 'task',
            className: 'mmd-anno-task',
            value: task,
            title: t('annotate.taskLabel'),
            'aria-label': t('annotate.taskLabel'),
            onChange: (event) => setTask(event.target.value),
          }, ANNOTATE_TASKS.map((item) => h('option', { key: item.id, value: item.id }, t(item.label))))
        : null,
      regions.length > 0
        ? h('button', {
            type: 'button', key: 'send', className: 'mmd-pop-send', onClick: sendAll, disabled: sending,
          }, sending ? t('annotate.sending') : t('annotate.sendAll'))
        : null,
      h('span', { className: 'mmd-editor-spacer', key: 'spacer' }),
      h(ZoomControls, { key: 'zoom', zoom, onZoom: setZoom, t }),
    ]),
    notice === null
      ? null
      : h('p', { className: 'mmd-anno-notice', key: 'notice' }, notice),
    h('div', { className: 'mmd-img-scroll', key: 'stage' }, [
      h('div', {
        key: 'canvas',
        ref: stageRef,
        className: editing ? 'mmd-img-stage mmd-img-editing' : 'mmd-img-stage',
        style: { width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : '100%' },
        onMouseDown: onDown,
        onMouseMove: onMove,
        onMouseUp: onUp,
        onMouseLeave: () => setDrag(null),
      }, [
        h('img', { key: 'img', src: url, className: 'mmd-img', alt: shownPath, draggable: false }),
        ...regions.map((item, index) =>
          h('div', {
            key: `r:${index}`,
            className: 'mmd-img-region',
            style: {
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.w * 100}%`,
              height: `${item.h * 100}%`,
            },
          }, h('span', { className: 'mmd-anno-badge', key: 'n' }, String(index + 1))),
        ),
        dragRect === null
          ? null
          : h('div', {
              key: 'drag',
              className: 'mmd-img-region mmd-img-dragging',
              style: {
                left: `${dragRect.x * 100}%`,
                top: `${dragRect.y * 100}%`,
                width: `${dragRect.w * 100}%`,
                height: `${dragRect.h * 100}%`,
              },
            }),
      ]),
      regions.length > 0
        ? h('div', { className: 'mmd-anno-list', key: 'list' }, regions.map((item, index) =>
            h(AnnotationItem, {
              key: `a:${index}`,
              item,
              index,
              title: '',
              text: item.comment,
              t,
              onEdit: startEdit,
              onRemove: removeRegion,
            }),
          ))
        : null,
    ]),
    editIndex !== null
      ? h(InstructionPopover, {
          key: 'region-edit-pop',
          anchor: regions[editIndex]?.anchor ?? { top: 80, left: 80 },
          title: `${t('annotate.editHeading')}：${regionArea(t, regions[editIndex])}`,
          placeholder: t('annotate.placeholder'),
          value: editValue,
          onChange: setEditValue,
          onSubmit: confirmEdit,
          onClose: cancelEdit,
          attachments: editFiles,
          onAttach: (files) => setEditFiles((prev) => [...prev, ...createAttachments(files)]),
          onDetach: detachEditFile,
          submitLabel: t('annotate.save'),
          assist: assistOptions(regions[editIndex], editValue),
          t,
        })
      : pending === null
        ? null
        : h(InstructionPopover, {
            key: 'region-pop',
            anchor: { top: pending.top, left: pending.left },
            title: t('annotate.pickTitle'),
            placeholder: t('annotate.placeholder'),
            value: comment,
            onChange: setComment,
            onSubmit: confirmRegion,
            onClose: () => { revokeAttachments(pendingFiles); setPendingFiles([]); setPending(null); },
            attachments: pendingFiles,
            onAttach: (files) => setPendingFiles((prev) => [...prev, ...createAttachments(files)]),
            onDetach: (id) => setPendingFiles((prev) => dropAttachment(prev, id)),
            assist: assistOptions(pending.region, comment),
            t,
          }),
  ]);
}

export const inject = ['slots', 'locale', 'documentPreviews', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'remote', 'remote.commands', 'remote.workspaceFiles', 'remote.session', 'remote.permissionPresets', 'remote.fileReferences', 'remote.fileUploads'];

export function apply(ctx) {
  const t = ctx.locale.bind(NS);
  // One failed registration (e.g. a duplicate after an HMR reload) must not abort the rest.
  const rawEffect = ctx.effect.bind(ctx);
  const register = (build, label) =>
    rawEffect(() => {
      try {
        return build();
      } catch (error) {
        console.warn('[markdown-mermaid-preview] ' + label + ' failed: ' + (error instanceof Error ? error.message : String(error)));
        return undefined;
      }
    }, label);
  register(() => ctx.locale.register(NS, { zh, en }), 'markdown-mermaid: dictionaries');
  register(
    () =>
      ctx.documentPreviews.register({
        id: BODY_ID,
        extensions: ['md', 'markdown'],
        title: () => t('viewer.label'),
        loading: 'text-pages',
        wrap: false,
      }),
    'markdown-mermaid: metadata',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.tab.document', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document', key: BODY_ID, locale: NS },
          (props) => h(MarkdownMermaidBody, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: body',
  );
  register(
    () =>
      ctx.documentPreviews.register({
        id: HTML_ANNOTATE_ID,
        extensions: ['html', 'htm', 'svg', 'xhtml'],
        title: () => t('htmlAnnotate.label'),
        loading: 'bytes-complete',
        wrap: false,
      }),
    'markdown-mermaid: html-annotate metadata',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.tab.document', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document', key: HTML_ANNOTATE_ID, locale: NS },
          (props) => h(HtmlAnnotateBody, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: html-annotate body',
  );
  register(
    () =>
      ctx.documentPreviews.register({
        id: IMAGE_ANNOTATE_ID,
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
        title: () => t('imageAnnotate.label'),
        loading: 'bytes-complete',
        wrap: false,
      }),
    'markdown-mermaid: image-annotate metadata',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.tab.document', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document', key: IMAGE_ANNOTATE_ID, locale: NS },
          (props) => h(ImageAnnotateBody, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: image-annotate body',
  );

  register(
    () =>
      ctx.slots.inject('sidebar.right.tab.document.actions', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document.actions', id: 'edit-markdown', locale: NS, order: -1 },
          (props) => h(EditMarkdownAction, props),
        ),
      ),
    'markdown-mermaid: edit action',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.tab.document.actions', () =>
        ctx.slots.register(
          { name: 'sidebar.right.tab.document.actions', id: 'reveal-in-tree', locale: NS },
          (props) => h(RevealAction, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: reveal action',
  );
  register(
    () =>
      ctx.sidebarRightTabs.register({
        id: FILES_TYPE_ID,
        kind: 'files',
        keepMounted: true,
        title: () => t('files.typeLabel'),
        guide: [
          {
            id: 'workspace',
            commandId: 'workspace.files',
            order: 10,
            title: () => t('files.guideTitle'),
            description: () => t('files.guideDescription'),
            icon: FolderGuideIcon,
          },
        ],
      }),
    'markdown-mermaid: locate type',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: FILES_TYPE_ID, locale: NS },
          (props) => h(FilesTreeBody, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: locate body',
  );
  register(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: FILES_TYPE_ID, priority: -1 }, FilesTitleChip),
      ),
    'markdown-mermaid: files title',
  );
  for (const key of [
    DOCUMENT_TYPE_ID,
    '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
    '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/html',
    BODY_ID,
    HTML_ANNOTATE_ID,
  ]) {
    register(
      () =>
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key, priority: -1 }, DocumentTitleChip),
        ),
      'markdown-mermaid: document title ' + key,
    );
  }
  register(
    () =>
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: 'files-tree-open', locale: NS, order: 10 },
          (props) => h(FilesTreeOpenButton, { ctx, ...props }),
        ),
      ),
    'markdown-mermaid: files tree button',
  );
}

function FilesTreeOpenButton({ ctx, t }) {
  return h('span', { className: 'mmd-reveal' }, [
    h('style', { key: 'style' }, STYLE),
    h(
      'button',
      {
        type: 'button',
        key: 'open',
        className: 'mmd-reveal-trigger mmd-reveal-labeled',
        title: t('filesTree.open'),
        'aria-label': t('filesTree.open'),
        onClick: () => ctx.sidebarRight.openTab('files'),
      },
      [
        h(
          'svg',
          { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, key: 'icon', style: { display: 'block' } },
          h('path', {
            d: 'M1.8 3.2c0-.44.36-.8.8-.8h3.1l1.4 1.5h6.1c.44 0 .8.36.8.8v6.6c0 .44-.36.8-.8.8H2.6c-.44 0-.8-.36-.8-.8V3.2z',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.15,
            strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M5.2 7.6h3.2M5.2 9.8h5.4M5.2 7.6v4.4',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.05,
            strokeLinecap: 'round',
          }),
        ),
        h('span', { className: 'mmd-reveal-text', key: 'text' }, t('filesTree.label')),
      ],
    ),
  ]);
}
