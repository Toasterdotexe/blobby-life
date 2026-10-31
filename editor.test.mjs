import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, seededRandom, MAX_BLOBBIES, MAX_SPAWN, proteinToColor } from './simulation.mjs';

function world() { return new Simulation({ random: seededRandom(42) }); }

test('batches allow 500 per spawn and respect 10,000 living residents', () => {
  const simulation = world();
  const batch = simulation.spawnMany(500);
  assert.equal(batch.length, 500);
  assert.equal(simulation.blobbies.length, 501);
  while (simulation.blobbies.length < MAX_BLOBBIES - 2) {
    simulation.spawnMany(Math.min(MAX_SPAWN, MAX_BLOBBIES - 2 - simulation.blobbies.length));
  }
  assert.equal(simulation.spawnMany(500).length, 2, 'The final batch uses only the remaining capacity');
  assert.equal(simulation.blobbies.length, MAX_BLOBBIES);
  assert.equal(simulation.spawn(), null);
  assert.deepEqual(simulation.spawnMany(1), []);
  simulation.blobbies[0].hunger = 100;
  simulation.update(0.05);
  assert.equal(simulation.blobbies.length, 9999);
  assert.ok(simulation.spawn(500, 400, '#ff8800'));
  assert.equal(simulation.blobbies.length, 10000);
});

test('batch spawning validates counts and assigns custom or individual random colors', () => {
  const simulation = world();
  for (const count of [0, -1, 1.5, NaN, Infinity, 501]) assert.equal(simulation.spawnMany(count).length, 0);
  const custom = simulation.spawnMany(10, { color: '#1234ab' });
  assert.ok(custom.every(blobby => blobby.color === '#1234ab'));
  const random = simulation.spawnMany(100);
  assert.ok(random.every(blobby => /^#[0-9a-f]{6}$/i.test(blobby.color)));
  assert.ok(new Set(random.map(blobby => blobby.dna.colortien)).size > 90);
  assert.ok(random.every(blobby => blobby.color === proteinToColor(blobby.proteins.colortien)), 'Natural colors must be expressed from DNA');
  assert.ok(simulation.blobbies.every(blobby => simulation.isLand(blobby.x, blobby.y)));
});

test('resources can be placed, hit-tested, and deleted without leaving stale targets', () => {
  const simulation = world();
  const bush = simulation.addBush(550, 95);
  assert.ok(bush);
  assert.equal(bush.fruits.length, 5);
  assert.equal(simulation.resourceAt(550, 95), bush);
  const blobby = simulation.blobbies[0];
  blobby.target = bush; blobby.state = 'eating'; blobby.eatProgress = 0.5;
  assert.equal(simulation.removeResource(bush), true);
  assert.equal(simulation.removeResource(bush), false);
  assert.equal(blobby.target, null);
  assert.equal(blobby.state, 'wandering');
  const lake = simulation.addLake(565, 385, 60);
  assert.ok(lake);
  assert.equal(simulation.resourceAt(lake.x, lake.y), lake);
  assert.ok(simulation.isLand(blobby.x, blobby.y), 'Lake placement must relocate submerged residents');
  blobby.target = lake; blobby.state = 'drinking';
  simulation.removeResource(lake);
  assert.equal(blobby.target, null);
  simulation.update(0.5);
  assert.ok(simulation.isLand(blobby.x, blobby.y));
});

test('overlapping resources and invalid lake sizes are rejected', () => {
  const simulation = world();
  const bushes = simulation.bushes.length;
  const lakes = simulation.lakes.length;
  assert.equal(simulation.addBush(233, 246), null);
  assert.equal(simulation.addBush(454, 164), null);
  assert.equal(simulation.addLake(233, 246), null);
  assert.equal(simulation.addLake(550, 385, 500), null);
  assert.equal(simulation.addBush(NaN, 100), null);
  assert.equal(simulation.bushes.length, bushes);
  assert.equal(simulation.lakes.length, lakes);
});

test('resizing preserves needs, colors, and berry regrowth and keeps residents on land', () => {
  const simulation = world();
  simulation.spawnMany(50);
  const blobby = simulation.blobbies[0];
  const original = { hunger: blobby.hunger, thirst: blobby.thirst, color: blobby.color };
  const bush = simulation.bushes[0];
  bush.fruits[0].regrowAt = 12;
  blobby.target = bush; blobby.state = 'seeking_food';
  assert.equal(simulation.resizeWorld(400, 300), true);
  assert.equal(simulation.width, 400); assert.equal(simulation.height, 300);
  assert.deepEqual({ hunger: blobby.hunger, thirst: blobby.thirst, color: blobby.color }, original);
  assert.equal(bush.fruits[0].regrowAt, 12);
  assert.equal(blobby.target, null);
  for (let i = 0; i < 20; i++) simulation.update(0.1);
  assert.ok(simulation.blobbies.every(resident => simulation.isLand(resident.x, resident.y)));
  assert.equal(simulation.resizeWorld(2400, 1600), true);
  const added = simulation.spawnMany(10, { x: 2200, y: 1400 });
  assert.equal(added.length, 10);
  assert.ok(added.every(resident => resident.x > 1200 && resident.y > 760 && simulation.isLand(resident.x, resident.y)));
});

test('invalid dimensions leave the meadow intact and reset restores defaults', () => {
  const simulation = world();
  for (const [width, height] of [[399, 300], [2401, 500], [500, 299], [500, 1601], [500.5, 500], [NaN, 500]]) {
    assert.equal(simulation.resizeWorld(width, height), false);
    assert.equal(simulation.width, 1200); assert.equal(simulation.height, 760);
  }
  simulation.resizeWorld(1800, 1000);
  simulation.reset();
  assert.equal(simulation.width, 1200); assert.equal(simulation.height, 760);
  assert.equal(simulation.blobbies.length, 1);
});

test('10,000 Blobbies can run after editing without invalid positions or broken needs', () => {
  const simulation = world();
  simulation.resizeWorld(2000, 1200);
  while (simulation.blobbies.length < MAX_BLOBBIES) simulation.spawnMany(500);
  for (let i = 0; i < 100; i++) simulation.update(0.1);
  assert.equal(simulation.blobbies.length, 10000);
  for (const blobby of simulation.blobbies) {
    assert.ok(Number.isFinite(blobby.x) && Number.isFinite(blobby.y));
    assert.ok(simulation.isLand(blobby.x, blobby.y));
    assert.ok(blobby.hunger < 100 && blobby.thirst < 100);
  }
});

test('editor changes protect all species and preserve their inherited traits', () => {
  const simulation = world();
  simulation.spawnBlubby(600, 400);
  simulation.spawnRobby(610, 400);
  const original = simulation.creatures.map(creature => ({ id: creature.id, dna: JSON.stringify(creature.dna), proteins: JSON.stringify(creature.proteins), color: creature.color }));
  const lake = simulation.addLake(565, 385, 60);
  assert.ok(lake);
  assert.ok(simulation.creatures.every(creature => simulation.isLand(creature.x, creature.y)));
  for (const creature of simulation.creatures) { creature.target = lake; creature.state = 'drinking'; }
  simulation.removeResource(lake);
  assert.ok(simulation.creatures.every(creature => creature.target === null));
  simulation.resizeWorld(400, 300);
  for (const creature of simulation.creatures) {
    const before = original.find(item => item.id === creature.id);
    assert.equal(JSON.stringify(creature.dna), before.dna);
    assert.equal(JSON.stringify(creature.proteins), before.proteins);
    assert.equal(creature.color, before.color);
    assert.ok(simulation.isLand(creature.x, creature.y));
  }
});

test('all species share the 10,000 living limit and every batch is capped at 500', () => {
  const simulation = world();
  while (simulation.livingCount < 9998) simulation.spawnMany(Math.min(500, 9998 - simulation.livingCount));
  assert.equal(simulation.spawnMany(500, { species: 'blubby' }).length, 2);
  assert.equal(simulation.spawnRobby(), null);
  assert.equal(simulation.spawnBlubby(), null);
  assert.equal(simulation.livingCount, 10000);
  assert.equal(simulation.spawnMany(501, { species: 'robby' }).length, 0);
});

test('resizing while editing preserves a pending birth and its inherited DNA', () => {
  const simulation = world();
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x + 5, first.y);
  first.hunger = second.hunger = 5; first.thirst = second.thirst = 5;
  simulation.startMating(first, second);
  const birthTime = first.matingUntil;
  simulation.resizeWorld(1600, 1000);
  assert.equal(first.mate, second); assert.equal(second.mate, first);
  assert.equal(first.matingUntil, birthTime);
  while (simulation.elapsed <= birthTime + 0.1) simulation.update(0.1);
  assert.equal(simulation.blobbies.length, 3);
  const baby = simulation.blobbies.at(-1);
  for (const gene of ['colortien', 'speedtien', 'eyetien']) {
    for (let i = 0; i < 12; i++) assert.ok(baby.dna[gene][i] === first.dna[gene][i] || baby.dna[gene][i] === second.dna[gene][i]);
  }
});

test('team-hunting Robbys still consume energy and die at the need limits', () => {
  const simulation = world();
  simulation.blobbies = [];
  const predator = simulation.spawnBlubby(600, 400);
  const first = simulation.spawnRobby(600, 400);
  simulation.spawnRobby(605, 400); simulation.spawnRobby(610, 400);
  first.thirst = 100;
  simulation.update(0.05);
  assert.equal(first.state, 'dead');
  assert.equal(first.deathCause, 'thirst');
  assert.equal(simulation.robbys.length, 2);
  assert.notEqual(predator.state, 'dead');
  assert.ok(simulation.deaths.some(death => death.id === first.id && death.species === 'robby'));
});
