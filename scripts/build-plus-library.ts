import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const guideRoot = '../features/';
const recommended = [1, 6, 7, 19, 24, 36, 45, 53];
const clickGuide = new Set([1, 24, 53]);
const editGuide = new Set([10, 54]);
const labels = [
  '作品を開く', 'ブロックを書く', '仕組みを読む', '素材と拡張',
  '動作確認と保存', '履歴と共有', '教材と設定'
];

export async function readLibrary(storyRoot: string) {
  const source = await readFile(path.join(storyRoot, 'plus-library-chapters.txt'), 'utf8');
  const topics: {title: string; chapters: number[]}[] = [];
  const chapters = [];
  for (const row of source.split(/\r?\n/)) {
    if (!row || row.startsWith('#')) continue;
    if (row.startsWith('@')) {
      topics.push({title: row.slice(1), chapters: []});
      continue;
    }
    const fields = row.split('｜');
    assert.equal(fields.length, 7, row);
    assert.ok(fields.every(Boolean), row);
    const [title, references, question, entry, example, practice, result] = fields;
    const number = chapters.length + 1;
    const topic = topics.length;
    assert.ok(topic, row);
    const id = 'chapter_' + String(number).padStart(2, '0');
    const guide = clickGuide.has(number) ? 'click' : editGuide.has(number) ? 'event:workspace.changed' : null;
    const mode = guide ? 'Guideで体験' : number >= 29 && number <= 41 || number >= 43 && number <= 52 ? '操作例で確認' : '画面で試す';
    const dialogueSeconds = [question, entry, example, ...(guide ? [practice] : [])].reduce((total, line) =>
      total + Math.max(4.5, Math.round((Array.from(line).length / 6.2 + 1.4) * 10) / 10), 0);
    topics[topic - 1].chapters.push(number);
    chapters.push({number, id, topic, title, references: references.split(' '), question, entry, example, practice, result, guide, mode, dialogueSeconds});
  }
  assert.equal(topics.length, labels.length);
  assert.equal(chapters.length, 56);
  assert.ok(topics.every(topic => topic.chapters.length <= 10));
  return {topics, chapters, recommended};
}

type Action = Record<string, unknown>;
type Art = {file: string; kind: string; target?: string; center?: [number, number]};
interface Surface {
  actors: Record<string, string>;
  art: Record<string, Art>;
  svg(id: string, body: string, width?: number, height?: number, kind?: string, target?: string): Promise<void>;
  board(id: string, title: string, rows: readonly string[], label: string): Promise<void>;
  text(line: string, x: number, y: number, size?: number, color?: string, weight?: number): string;
  show(actor: string, x: number, y: number, scale?: number, skin?: string): Action;
  hide(actor: string): Action;
  cast(): Action[];
  say(lines: readonly (readonly string[])[], id: string): Action[];
  guide(id: string, spec: {actor: string; target: string; message: string; action: string}): Action;
}

export async function createPlusLibrary(storyRoot: string, surface: Surface) {
  const {chapters, topics} = await readLibrary(storyRoot);
  const examples: Record<number, {file: string; width: number; height: number}> =
    JSON.parse(await readFile(path.join(storyRoot,'plus-library-examples.json'),'utf8'));
  const {actors, art, svg, board, text, show, hide, cast, say, guide} = surface;
  const scenes: Record<string, Action[]> = {};
  const backdrop = (title: string, subtitle: string, note: string) =>
    '<rect width="480" height="360" fill="#edf3fb"/><rect width="480" height="78" fill="#28365d"/>' +
    text(title, 18, 34, 21, '#ffffff', 700) + text(subtitle, 18, 58, 12, '#e1e9ff') +
    text(note, 18, 343, 11, '#53617e');
  const slotName = (slot: number) => 'LibrarySlot' + (slot + 1);
  const chapter = (number: number) => chapters[number - 1].id;
  const chapterOption = (number: number): [string, string] => {
    const c = chapters[number - 1];
    return [String(number).padStart(2, '0') + '  ' + c.title, c.id];
  };
  const placement = (index: number, start: number) => [index % 2 ? 113 : -113, start - 45 * Math.floor(index / 2)] as const;

  const clearSlots = {broadcastMessageAndWait: 'library:clear'};
  const demoActor = 'LibraryExample';
  for (const [number, example] of Object.entries(examples)) {
    const skin = 'LibraryExample' + number;
    art[skin] = {kind: 'costume', file: example.file, target: demoActor, center: [example.width / 2, example.height / 2]};
    actors[demoActor] ??= skin;
  }
  for (let i = 0; i < 11; i++) {
    const slot = slotName(i);
    await svg(slot, '<rect x="2" y="2" width="210" height="36" rx="9" fill="#5156ba" fill-opacity="0.07"/>',
      214, 40, 'costume', slot);
    art[slot].center = [107, 20];
    actors[slot] = slot;
  }
  function options(id: string, values: [string, string][], start = 76) {
    const actions: Action[] = [];
    const routes: Record<string, string> = {};
    let artwork = '';
    for (const [i, [label, destination]] of values.entries()) {
      const actor = slotName(i);
      const [x, y] = placement(i, start);
      const left = x + 240 - 105;
      const top = 180 - y - 18;
      const color = destination === 'menu' || destination.startsWith('topic_') ? '#16846e' : '#5156ba';
      artwork += '<rect x="' + left + '" y="' + top + '" width="210" height="36" rx="9" fill="white" stroke="' + color + '" stroke-width="2"/>' +
        text(label, left + 9, top + 23, label.length > 16 ? 11.5 : 13, '#263454', 700);
      routes[actor] = destination;
      actions.push(show(actor, x, y));
    }
    return {artwork, actions: [...actions, {touchInputToChangeScene: routes}, {goto: id}]};
  }
  async function menu(id: string, title: string, subtitle: string, note: string, entries: [string, string][]) {
    const skin = 'Library_' + id;
    const {artwork, actions} = options(id, entries);
    await svg(skin, backdrop(title, subtitle, note) + artwork);
    scenes[id] = [clearSlots, {stage: skin}, hide('Pura'), hide('Moko'), ...actions];
  }
  await menu('menu', 'プラとモコのPlusエディター案内', '短い章を一つ選ぼう。途中の章から始められます。',
    '緑の旗で目次へ。各章はSpaceで先に進めます。', [
      ['第01章から順に見る', chapter(1)], ['はじめての8章', 'recommended'],
      ...topics.map((topic, i): [string, string] => [labels[i] + '（' + topic.chapters.length + '章）', 'topic_' + (i + 1)])
    ]);
  await menu('recommended', 'はじめての8章', '気になる章へ直接進めます。約15〜20分の目安。',
    '章末の「おすすめの次へ」で順に巡れます。', [
      ...recommended.map(chapterOption), ['全体の目次', 'menu']
    ]);
  for (const [i, topic] of topics.entries()) {
    await menu('topic_' + (i + 1), topic.title, 'クリックした章から練習できます。',
      '緑の旗で全体の目次へ。章末からも戻れます。', [
        ...topic.chapters.map(chapterOption), ['全体の目次', 'menu']
      ]);
  }

  for (const c of chapters) {
    const tag = String(c.number).padStart(2, '0') + ' / 56　' + topics[c.topic - 1].title;
    const learn = 'Library_' + c.id + '_learn';
    const tryIt = 'Library_' + c.id + '_try';
    const recap = 'Library_' + c.id + '_result';
    await board(learn, c.title, [c.entry, c.example], tag);
    const optionsForResult: [string, string][] = [
      [c.number < chapters.length ? '次の章へ' : '全体の目次へ', c.number < chapters.length ? chapter(c.number + 1) : 'menu'],
      ['この分野の章を選ぶ', 'topic_' + c.topic],
      ['もう一度見る', c.id], ['全体の目次', 'menu']
    ];
    const shortcut = recommended.indexOf(c.number);
    if (shortcut >= 0) optionsForResult.push(shortcut + 1 < recommended.length
      ? ['おすすめの次へ', chapter(recommended[shortcut + 1])] : ['おすすめ8章へ戻る', 'recommended']);

    const resultOptions = options(c.id + '_result', optionsForResult, -31);
    await svg(recap, backdrop('できるようになったこと', tag, '別の章からでも、いつでも練習できます。') +
      '<rect x="16" y="89" width="448" height="95" rx="12" fill="white"/>' +
      resultText(c.result, text) + resultOptions.artwork);
    const example = examples[c.number];
    const nextScene = c.id + (example ? '_example' : '_try');
    if (example) {
      const exampleScene = c.id + '_example';
      const exampleBoard = 'Library_' + exampleScene;
      const actions = options(exampleScene, [['練習へ進む', c.id + '_try'], ['この分野の章を選ぶ', 'topic_' + c.topic]], -125);
      await svg(exampleBoard, backdrop(c.title, c.number === 33 ? '対応拡張の画面例（開発版の図版）' : '機能ガイドの画面例',
        '画面の配置やボタン名は撮影時点のものです。') + actions.artwork);
      scenes[exampleScene] = [clearSlots, {stage: exampleBoard}, hide('Pura'), hide('Moko'),
        {broadcastMessageAndWait: 'library:example:' + c.number}, ...actions.actions];
    }
    scenes[c.id] = [clearSlots, {stage: learn}, ...cast(),
      ...say([['M', c.question], ['P', c.entry], ['P', c.example]], 'library_' + c.id),
      {goto: nextScene}];
    const practiceOptions = options(c.id + '_try', [['結果を見る', c.id + '_result'], ['この分野の章を選ぶ', 'topic_' + c.topic]], -40);
    const practiceNote = c.guide ? 'Guideを飛ばすには、ステージに戻ってSpace。' : '操作例や練習が終わったら「結果を見る」。';
    await svg(tryIt, backdrop(c.mode, tag, practiceNote) +
      '<rect x="16" y="89" width="448" height="95" rx="12" fill="white"/>' + resultText(c.practice, text) +
      (c.guide ? '' : practiceOptions.artwork));
    const task: Action[] = c.guide ? [
      ...cast(), ...say([['M', c.practice]], 'library_' + c.id + '_practice'),
      guide('library_' + c.id, {actor: 'Pura',
        target: c.guide === 'click' ? 'project.search' : 'code.workspace',
        message: c.guide === 'click' ? 'この検索欄をクリック。案内だけ省略するならステージを押してSpace。'
          : '「関数れんしゅう」で個数を一つ変えてみよう。コードが変わると続きに進みます。',
        action: c.guide}),
      {goto: c.id + '_result'}
    ] : [hide('Pura'), hide('Moko'), ...practiceOptions.actions];
    scenes[c.id + '_try'] = [clearSlots, {stage: tryIt}, ...task];
    scenes[c.id + '_result'] = [clearSlots, hide('Pura'), hide('Moko'), {stage: recap},
      ...resultOptions.actions];

  }
  // The first DSL scene is the start scene even when a chapter has a screenshot.
  return {scenes, backdrop: 'Library_menu'};
}

function resultText(line: string, text: Surface['text']) {
  const glyphs = Array.from(line);
  let output = '';
  for (let i = 0; i < glyphs.length; i += 30) {
    output += text(glyphs.slice(i, i + 30).join(''), 29, 114 + Math.floor(i / 30) * 22, 13);
  }
  return output;
}

export async function writeLibraryIndex(storyRoot: string, output: string) {
  const {chapters, topics, recommended} = await readLibrary(storyRoot);
  const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const chapterNumber = (i: number) => String(i).padStart(2, '0');
  const body = topics.map((topic, n) =>
    '<section id="topic-' + (n + 1) + '"><h2>' + escape(topic.title) + '</h2>' +
    topic.chapters.map(number => {
      const c = chapters[number - 1];
      return '<article id="chapter-' + chapterNumber(number) + '"><h3>' + chapterNumber(number) + ' ' + escape(c.title) + '</h3><p>' +
        escape(c.practice) + '</p><p class="refs">' + c.references.map((link, i) =>
          '<a href="' + guideRoot + escape(link) + '">機能ガイド ' + (i + 1) + '</a>').join(' · ') + '</p></article>';
    }).join('\n') + '</section>').join('\n');
  await writeFile(path.join(output, 'plus-library-index.html'), `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Plusエディター案内の全56章</title>
<style>body{margin:0;background:#edf3fb;color:#263454;font:17px/1.7 system-ui,sans-serif}main{max-width:960px;padding:26px;margin:auto}a{color:#403caa}a:focus-visible{outline:3px solid}article{margin:12px 0;background:white;border-radius:12px;padding:12px 18px}article h3,article p{margin:5px 0}section{margin:36px 0}.refs{font-size:.9em}nav ul{display:flex;gap:8px 20px;flex-wrap:wrap;padding:0;list-style:none}nav li{margin:0}</style>
<main><p><a href="../features/">機能ガイドの目次へ</a></p><h1>Plusエディター案内の全56章</h1>
<p>紙芝居内の目次から章を選べます。1章1〜3分が目安です。章の練習と、詳しい機能ガイドをここから確認できます。</p>
<p><a href="plus-library-4.0.sb3" download>紙芝居SB3をダウンロード</a> · <a href="${guideRoot}feature-map/">アドオン・拡張の機能索引</a></p>
<nav aria-label="分野"><ul>${topics.map((topic,i)=>'<li><a href="#topic-'+(i+1)+'">'+escape(topic.title)+'</a></li>').join('')}</ul></nav>
<p>はじめての8章　${recommended.map(n=>'<a href="#chapter-'+chapterNumber(n)+'">'+chapterNumber(n)+'</a>').join(' → ')}</p>
${body}
</main></html>
`);
  return {chapters: chapters.length, topics: topics.length, recommended,
    totalDialogueSeconds: Math.round(chapters.reduce((total, c) => total + c.dialogueSeconds, 0)),
    coverage: chapters.map(c => ({chapter: c.number, title: c.title, references: c.references, mode: c.mode}))};
}
