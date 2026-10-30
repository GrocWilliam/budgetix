import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixedShares, prorataShares, isAmount, isDay, currentMonth, sum, isDue } from './rules';

test('fixedShares: author gets the remainder', () => {
	const r = fixedShares('a', [{ userId: 'b', sharePercentage: '70' }]);
	assert.deepEqual(r, [
		{ userId: 'a', sharePercentage: '30.00' },
		{ userId: 'b', sharePercentage: '70' }
	]);
});

test('fixedShares: rejects > 100% and negative or blank shares', () => {
	assert.throws(() =>
		fixedShares('a', [
			{ userId: 'b', sharePercentage: '60' },
			{ userId: 'c', sharePercentage: '50' }
		])
	);
	assert.throws(() => fixedShares('a', [{ userId: 'b', sharePercentage: '-10' }]));
	assert.throws(() => fixedShares('a', [{ userId: 'b', sharePercentage: 'abc' }]));
});

test('prorataShares: by income, equal when nobody earns', () => {
	const r = prorataShares(
		['a', 'b'],
		new Map([
			['a', 3000],
			['b', 1000],
			['x', 9999]
		])
	);
	assert.equal(r.get('a'), 75);
	assert.equal(r.get('b'), 25);
	const eq = prorataShares(['a', 'b'], new Map());
	assert.equal(eq.get('a'), 50);
});

test('validators', () => {
	assert.ok(isAmount('12.50'));
	assert.ok(!isAmount(''));
	assert.ok(!isAmount('abc'));
	assert.ok(!isAmount(null));
	assert.ok(isDay(1) && isDay(31));
	assert.ok(!isDay(0) && !isDay(32) && !isDay(NaN));
});

test('currentMonth uses Paris time', () => {
	// 31 oct 23:30 UTC = 1er nov 00:30 à Paris
	assert.equal(currentMonth(new Date('2026-10-31T23:30:00Z')), '2026-11');
});

test('sum: exact cents, no float drift', () => {
	// En euros flottants : 100.30 - 50.10 - 50.20 = -0.0000000000000142 (affiché « -0,00 € »)
	assert.equal(10030 - sum([{ amount: '50.10' }, { amount: '50.20' }]), 0);
	assert.equal(sum([{ amount: '0.10' }, { amount: '0.20' }]), 30);
});

test('isDue: day passed this month, Paris time, short months', () => {
	const feb10 = new Date('2026-02-10T12:00:00Z');
	assert.ok(isDue(10, feb10) && !isDue(11, feb10));
	// le 31 tombe le dernier jour d'un mois plus court
	assert.ok(isDue(31, new Date('2026-02-28T12:00:00Z')));
	assert.ok(!isDue(31, new Date('2026-02-27T12:00:00Z')));
	// 31 mars 22:30 UTC = 1er avril 00:30 à Paris
	const apr1 = new Date('2026-03-31T22:30:00Z');
	assert.ok(isDue(1, apr1) && !isDue(2, apr1));
});
