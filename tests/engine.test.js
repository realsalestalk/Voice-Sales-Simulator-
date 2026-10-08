import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STEPS, CHAPTERS } from '../js/steps.js';
import { AGENTS, SQUADS } from '../js/data.js';

const market = E.simulateMarket();
const cl = E.clusters(E.correlationMatrix(market));
const claims = E.buildRegistry(market);
const sc = id => E.scenarios(market).find(s => s.id === id);

test('team: 17 agents — 5 researchers with exactly two bots each, 10 bots, Ava, Sam', () => {
  assert.equal(AGENTS.length, 17);
  assert.equal(AGENTS.filter(a => a.kind === 'researcher').length, 5);
  assert.equal(AGENTS.filter(a => a.kind === 'bot').length, 10);
  for (const s of SQUADS) assert.equal(s.bots.length, 2);
  const allBots = SQUADS.flatMap(s => s.bots);
  assert.equal(new Set(allBots).size, 10);
});

test('simulation is deterministic', () => {
  const a = E.simulateMarket(), b = E.simulateMarket();
  assert.deepEqual(a.series.BTC.close.slice(-5), b.series.BTC.close.slice(-5));
});

test('valid proposal is approved at full size', () => {
  const r = E.runScenario(sc('valid'), claims, cl);
  assert.equal(r.ava.verdict, 'sufficient');
  assert.equal(r.coach.decision, 'approved');
  assert.equal(r.record.final, 20);
});

test('missing required evidence blocks the proposal before the risk gate', () => {
  const r = E.runScenario(sc('missing'), claims, cl);
  assert.equal(r.ava.verdict, 'blocked');
  assert.deepEqual(r.ava.missing, ['VOLUME_CONFIRM']);
  assert.equal(r.risk.status, 'skipped');
  assert.equal(r.coach.decision, 'blocked');
  assert.equal(r.record.final, 0);
});

test('echoed copies of one claim count as one independent source', () => {
  const r = E.runScenario(sc('echo'), claims, cl);
  const cat = r.ava.checks.find(c => c.type === 'CATALYST');
  assert.equal(cat.status, 'echo');
  assert.equal(cat.independence.copies, 4);
  assert.equal(cat.independence.independent, 1);
  assert.equal(r.coach.decision, 'declined');
  assert.ok(r.ava.notes.some(n => /Agreement is not evidence/.test(n)));
});

test('two genuinely independent sources do confirm a catalyst', () => {
  const ind = E.independence(claims.filter(c => c.asset === 'AVAX' && c.type === 'CATALYST'));
  assert.equal(ind.independent, 2);
});

test('correlated bets are trimmed by the combined cluster cap; disagreement alone does not block', () => {
  const r = E.runScenario(sc('correlated'), claims, cl);
  assert.equal(r.ava.verdict, 'sufficient');
  const cc = r.risk.checks.find(c => c.scope === 'combined' && /Correlated cluster/.test(c.label));
  assert.equal(cc.status, 'trimmed');
  assert.equal(r.record.final, 10);
  assert.ok(r.ava.notes.some(n => /Disagreement alone does not invalidate/.test(n)));
});

test('individual limits trim size and loss at stop', () => {
  const r = E.runScenario(sc('risk'), claims, cl);
  assert.equal(r.risk.checks.find(c => c.label === 'Position size').status, 'trimmed');
  assert.equal(r.risk.checks.find(c => c.label === 'Loss at stop').status, 'trimmed');
  assert.ok(Math.abs(r.record.final * 0.08 - 1) < 0.01);
});

test('opinions from another squad are ignored by Ava', () => {
  const p = { ...sc('valid').proposal, evidence: [...sc('valid').proposal.evidence, 'n-tide-1'] };
  const ava = E.avaReview(p, claims);
  assert.ok(ava.notes.some(n => /another squad/.test(n)));
});

test('stale evidence is not counted as fresh', () => {
  const p = { ...sc('valid').proposal, evidence: ['c-btc-trend', 'c-btc-old', 'stop-generic'] };
  const ava = E.avaReview(p, claims);
  assert.equal(ava.verdict, 'insufficient');
  assert.equal(ava.checks.find(c => c.type === 'REGIME').status, 'stale');
});

test('combined limit blocks when room is below the minimum trade', () => {
  const s = sc('correlated');
  const book = [...s.portfolio, { bot: 'ryan', asset: 'ETH', usd: 8 }];
  const r = E.riskCheck(s.proposal, book, cl);
  assert.equal(r.status, 'blocked');
});

test('backtest keeps ten separate $50 accounts and every bot trades', () => {
  const bt = E.backtest(market);
  assert.equal(Object.keys(bt.accounts).length, 10);
  for (const a of Object.values(bt.accounts)) { assert.ok(a.equity.length > 0); assert.ok(a.buys > 0); }
});

test('walkthrough has 38 steps covering all required chapters', () => {
  assert.equal(STEPS.length, 38);
  assert.equal(CHAPTERS.length, 10);
  for (const s of STEPS) { assert.ok(s.target && s.text && s.route); }
});
