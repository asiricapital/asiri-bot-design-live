import assert from 'node:assert/strict';

await import('./plan-risk.js');
const { number, buildScenario, position, validatePortfolio, assessPortfolio } = globalThis.asiriPlanRisk;

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
const baseline = {
  equity: 10000, cash: 10000, openRisk: 0, exposure: 0,
  totalRiskPercent: 5, symbolPercent: 100
};
const scenario = buildScenario(100, 4, 'conservative');
assert.ok(scenario);
close(scenario.entryLow, 98.6, 'lower entry');
close(scenario.entryHigh, 99.8, 'upper entry');
close(scenario.stop, 93.6, 'stop');
close(scenario.perShareRisk, 6.2, 'upper-entry risk');

// Expected quantities are independent hand calculations from entry $99.80 and loss $6.20.
for (const fixture of [
  { name: 'trade budget', input: {}, quantity: 16, cost: 1596.8, loss: 99.2 },
  { name: 'free cash', input: { cash: 500 }, quantity: 5, cost: 499, loss: 31 },
  { name: 'aggregate risk', input: { cash: 9800, totalRiskPercent: 2, openRisk: 190 }, quantity: 1, cost: 99.8, loss: 6.2 },
  { name: 'symbol concentration', input: { cash: 8000, symbolPercent: 20, exposure: 1600 }, quantity: 4, cost: 399.2, loss: 24.8 },
  { name: 'concentration exhausted', input: { cash: 8000, symbolPercent: 20, exposure: 2000 }, quantity: 0, cost: 0, loss: 0 },
  { name: 'aggregate risk exceeded', input: { cash: 9700, totalRiskPercent: 2, openRisk: 201 }, quantity: 0, cost: 0, loss: 0 },
  { name: 'cash below one share', input: { cash: 99.79 }, quantity: 0, cost: 0, loss: 0 },
  { name: 'allocated capital remains distinct from equity', input: {}, capital: 2000, quantity: 3, cost: 299.4, loss: 18.6 }
]) {
  const result = assessPortfolio(scenario, fixture.capital ?? 10000, 1, { ...baseline, ...fixture.input });
  assert.equal(result.status, fixture.quantity ? 'passed' : 'blocked', fixture.name);
  assert.equal(result.quantity, fixture.quantity, fixture.name);
  close(result.cost, fixture.cost, `${fixture.name} cost`);
  close(result.estimatedLoss, fixture.loss, `${fixture.name} loss`);
  assert.ok(result.limitedBy.length > 0, `${fixture.name} must explain its binding constraint`);
}

// Unreported amounts are unknown, while an explicitly entered zero is valid.
for (const value of [null, undefined, '', ' ', '\n\t', true, false, NaN, Infinity, -Infinity, [], {}, 'Infinity', 'NaN', 'not a number']) {
  assert.equal(number(value), null, `number rejects ${String(value)}`);
  for (const field of Object.keys(baseline)) {
    const result = validatePortfolio({ ...baseline, [field]: value });
    assert.equal(result.ok, false, `${field} rejects ${String(value)}`);
    assert.ok(result.errors.some(error => error.field === field));
    assert.equal(assessPortfolio(scenario, 10000, 1, { ...baseline, [field]: value }).status, 'incomplete');
  }
}
assert.equal(number(' 0 '), 0);
assert.equal(number('12.50'), 12.5);
assert.equal(validatePortfolio({ ...baseline, cash: '0', openRisk: '0', exposure: '0' }).ok, true);
for (const value of [undefined, null, [], {}, false]) {
  assert.equal(validatePortfolio(value).ok, false);
}
for (const field of ['equity', 'cash', 'openRisk', 'exposure']) {
  assert.equal(validatePortfolio({ ...baseline, [field]: -0.01 }).ok, false, `${field} rejects negatives`);
  assert.equal(validatePortfolio({ ...baseline, [field]: 1e10 + 1 }).ok, false, `${field} rejects unsupported amounts`);
}
for (const field of ['totalRiskPercent', 'symbolPercent']) {
  for (const value of [0, -0.01, 100.01]) {
    assert.equal(validatePortfolio({ ...baseline, [field]: value }).ok, false, `${field} bounds`);
  }
  assert.equal(validatePortfolio({ ...baseline, [field]: 100 }).ok, true);
}
for (const input of [
  { equity: 0, cash: 0 },
  { cash: 10000.01 },
  { cash: 9000, exposure: 1000.01 },
  { cash: 9000, openRisk: 1000.01 }
]) {
  assert.equal(validatePortfolio({ ...baseline, ...input }).ok, false, 'cash-only accounting contradiction');
}
assert.equal(assessPortfolio(scenario, 10000.01, 1, baseline).status, 'incomplete', 'allocation cannot exceed equity');
assert.equal(assessPortfolio(scenario, 0.001, 1, { ...baseline, equity: 0.001, cash: 0, openRisk: 0, exposure: 0 }).status, 'incomplete', 'sub-cent equity is unavailable');

for (const value of [null, undefined, false, '', NaN, Infinity, -1, 0, 1e10 + 1]) {
  assert.equal(buildScenario(value, 4, 'conservative'), null, 'invalid price');
  assert.equal(buildScenario(100, value, 'conservative'), null, 'invalid ATR');
  assert.equal(position(scenario, value, 1), null, 'invalid allocated capital');
}
for (const percent of [undefined, null, false, '1', NaN, Infinity, -1, 0, 0.1, 3, 100]) {
  assert.equal(position(scenario, 10000, percent), null, 'trade risk must be an allowed choice');
}
assert.equal(buildScenario(0.01, 1, 'conservative'), null, 'stop cannot collapse to the entry floor');
assert.equal(buildScenario(1, 1, 'conservative'), null, 'nonpositive stop is invalid');
for (const malformed of [
  null, {},
  { ...scenario, entryHigh: Infinity },
  { ...scenario, entryLow: NaN },
  { ...scenario, stop: undefined },
  { ...scenario, stop: scenario.entryLow },
  { ...scenario, entryLow: scenario.entryHigh + 1 },
  { ...scenario, perShareRisk: 0 },
  { ...scenario, perShareRisk: Infinity },
  { ...scenario, perShareRisk: -1 }
]) {
  assert.equal(position(malformed, 10000, 1), null, 'invalid scenario must not produce a position');
  assert.equal(assessPortfolio(malformed, 10000, 1, baseline).status, 'incomplete');
}

const centsScenario = buildScenario(10, 0.333, 'conservative');
assert.deepEqual([centsScenario.entryLow, centsScenario.entryHigh, centsScenario.stop, centsScenario.perShareRisk], [9.88, 9.99, 9.46, 0.53]);
assert.equal(position(centsScenario, 100, 0.5).quantity, 0, 'half-dollar budget cannot cover 53-cent risk');
assert.equal(position(centsScenario, 100, 1).quantity, 1);
const simpleScenario = { entryLow: 9.9, entryHigh: 10, stop: 9, perShareRisk: 1 };
const fractional = assessPortfolio(simpleScenario, 1000, 1, {
  equity: 1000.009, cash: 100.009, openRisk: 0.009, exposure: 0.009,
  totalRiskPercent: 1, symbolPercent: 10
});
assert.equal(fractional.quantity, 9, 'fractional-cent existing risk and exposure consume capacity');
assert.equal(fractional.cost, 90);
assert.equal(fractional.estimatedLoss, 9);
assert.equal(fractional.cashAfter, 10);
const boundary = position(simpleScenario, 1000, 1);
assert.equal(boundary.quantity, 10, 'exact budget can be used');
assert.equal(position(simpleScenario, 999.99, 1).quantity, 9, 'risk budget rounds down');

let invariantCases = 0;
for (const price of [1.25, 5.68, 37.19, 100, 2034.57]) {
  for (const volatility of [0.01, 0.05, 0.2, 0.8]) {
    for (const kind of ['conservative', 'balanced']) {
      const plan = buildScenario(price, price * volatility, kind);
      if (!plan) continue;
      assert.ok(plan.stop > 0 && plan.stop < plan.entryLow && plan.entryLow <= plan.entryHigh);
      close(plan.perShareRisk, plan.entryHigh - plan.stop, 'risk agrees with displayed bounds');
      for (const capital of [125, 1000, 10000]) {
        for (const tradeRisk of [0.5, 1, 2]) {
          for (const cashShare of [0, 0.2, 0.8, 1]) {
            const equity = capital * 2;
            const cash = equity * cashShare;
            const input = {
              equity, cash, exposure: (equity - cash) * 0.2,
              openRisk: (equity - cash) * 0.005,
              totalRiskPercent: 3, symbolPercent: 35
            };
            const result = assessPortfolio(plan, capital, tradeRisk, input);
            assert.ok(['passed', 'blocked'].includes(result.status));
            assert.ok(Number.isSafeInteger(result.quantity) && result.quantity >= 0);
            for (const key of ['estimatedLoss', 'cost', 'riskBudget', 'cashAfter', 'totalRiskPercent', 'symbolPercent']) {
              assert.ok(Number.isFinite(result[key]) && result[key] >= 0, `finite nonnegative ${key}`);
            }
            assert.ok(result.cost <= Math.min(capital, cash) + 1e-8, 'cash/allocation capacity');
            assert.ok(result.estimatedLoss <= capital * tradeRisk / 100 + 1e-8, 'trade risk capacity');
            assert.ok(input.openRisk + result.estimatedLoss <= equity * input.totalRiskPercent / 100 + 1e-8, 'aggregate risk capacity');
            assert.ok(input.exposure + result.cost <= equity * input.symbolPercent / 100 + 1e-8, 'symbol concentration capacity');
            assert.equal(result.status === 'passed', result.quantity > 0, 'zero quantity never passes');
            invariantCases++;
          }
        }
      }
    }
  }
}

console.log(`Plan risk arithmetic passed: independent fixtures, missing-data gates, cents, geometry and ${invariantCases} capacity cases.`);
