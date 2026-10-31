import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, seededRandom, createBush, WORLD_WIDTH, WORLD_HEIGHT, FRUIT_EAT_SECONDS, FRUIT_REGROW_SECONDS, dnaToProtein, proteinToColor, proteinToSpeed, proteinToEyesight, proteinToHungerRecognitionThreshold } from './simulation.mjs';

function world() { return new Simulation({ random: seededRandom(42) }); }
function tick(simulation, seconds) {
  for (let time = 0; time < seconds; time += 0.05) simulation.update(0.05);
}

test('spawning creates independent green-square residents and keeps water spawns on land', () => {
  const simulation = world();
  const first = simulation.blobbies[0];
  const second = simulation.spawn(simulation.lakes[0].x, simulation.lakes[0].y);
  assert.equal(simulation.blobbies.length, 2);
  assert.notEqual(first.id, second.id);
  assert.ok(simulation.isLand(second.x, second.y));
  second.hunger = 99;
  assert.notEqual(first.hunger, second.hunger);
});

test('eyesight finds the nearest visible resource and excludes distant ones', () => {
  const simulation = world();
  simulation.bushes = [createBush({ x: 480, y: 400, radius: 20 }), createBush({ x: 900, y: 400, radius: 20 })];
  const blobby = simulation.blobbies[0];
  Object.assign(blobby, { x: 400, y: 400, eyesight: 100 });
  assert.equal(simulation.findVisibleResource(blobby, 'food'), simulation.bushes[0]);
  blobby.eyesight = 50;
  assert.equal(simulation.findVisibleResource(blobby, 'food'), null);
});

test('a hungry Blobby walks in a random direction when food is outside eyesight', () => {
  const simulation = world();
  simulation.bushes = [];
  const blobby = simulation.blobbies[0];
  Object.assign(blobby, { hunger: 70, thirst: 5 });
  const start = { x: blobby.x, y: blobby.y };
  const originalDestination = blobby.destination;
  tick(simulation, 8);
  assert.equal(blobby.state, 'searching_food');
  assert.equal(blobby.target, null);
  assert.ok(Math.hypot(blobby.x - start.x, blobby.y - start.y) > 10);
  assert.notEqual(blobby.destination, originalDestination);
});

test('a searching Blobby looks again and discovers food when it enters eyesight', () => {
  const simulation = world();
  simulation.bushes = [];
  const blobby = simulation.blobbies[0];
  Object.assign(blobby, { hunger: 70, thirst: 5 });
  simulation.update(0.05);
  assert.equal(blobby.state, 'searching_food');
  const bush = createBush({ x: blobby.x + 80, y: blobby.y, radius: 25 });
  simulation.bushes.push(bush);
  simulation.update(0.05);
  assert.equal(blobby.target, bush);
  assert.equal(blobby.state, 'seeking_food');
});

test('eating at a bush satisfies hunger', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  simulation.bushes = [createBush({ x: 640, y: 414, radius: 25 })];
  Object.assign(blobby, { hunger: 65, thirst: 5 });
  tick(simulation, 4);
  assert.ok(blobby.hunger < 10, `Hunger is ${blobby.hunger}`);
  assert.equal(blobby.target, null);
});

test('drinking satisfies thirst while keeping the Blobby on the shore', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  simulation.lakes = [{ kind: 'water', x: 700, y: 414, rx: 50, ry: 40 }];
  Object.assign(blobby, { hunger: 5, thirst: 65 });
  tick(simulation, 5);
  assert.ok(blobby.thirst < 10, `Thirst is ${blobby.thirst}`);
  assert.ok(simulation.isLand(blobby.x, blobby.y));
});

test('the more urgent need determines which resource is sought', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  simulation.bushes = [createBush({ x: 650, y: 414, radius: 25 })];
  simulation.lakes = [{ kind: 'water', x: 500, y: 414, rx: 30, ry: 30 }];
  Object.assign(blobby, { hunger: 70, thirst: 90 });
  simulation.update(0.05);
  assert.equal(blobby.target.kind, 'water');
});

test('a long multi-creature simulation stays finite, bounded, and able to satisfy needs', () => {
  const simulation = world();
  for (let i = 0; i < 14; i++) simulation.spawn();
  const initialPopulation = simulation.blobbies.length;
  const originalIds = new Set(simulation.blobbies.map(blobby => blobby.id));
  for (const blobby of simulation.blobbies) { blobby.lastFedAt = -Infinity; blobby.lastDrankAt = -Infinity; }
  const hasEaten = new Set();
  const hasDrunk = new Set();
  for (let time = 0; time < 600; time += 0.25) {
    for (const blobby of simulation.blobbies) { blobby.lastFedAt = -Infinity; blobby.lastDrankAt = -Infinity; }
    simulation.update(0.25);
    for (const blobby of simulation.blobbies) {
      if (blobby.state === 'eating') hasEaten.add(blobby.id);
      if (blobby.state === 'drinking') hasDrunk.add(blobby.id);
      assert.ok(Number.isFinite(blobby.x) && Number.isFinite(blobby.y));
      assert.ok(blobby.x >= 0 && blobby.x <= WORLD_WIDTH && blobby.y >= 0 && blobby.y <= WORLD_HEIGHT);
      assert.ok(simulation.isLand(blobby.x, blobby.y));
      assert.ok(blobby.hunger >= 0 && blobby.hunger < 100);
      assert.ok(blobby.thirst >= 0 && blobby.thirst < 100);
    }
  }
  assert.ok([...originalIds].every(id => hasEaten.has(id)), 'Every original Blobby should find food');
  assert.ok([...originalIds].every(id => hasDrunk.has(id)), 'Every original Blobby should find water');
  assert.ok(simulation.blobbies.length + simulation.deaths.length >= initialPopulation, 'Births may increase the population');
  assert.equal(new Set(simulation.deaths.map(death => death.id)).size, simulation.deaths.length, 'Each death is recorded once');
});

test('each Blobby gets a random walk speed in the allowed range', () => {
  const simulation = world();
  const speeds = Array.from({ length: 20 }, () => simulation.spawn().speed);
  assert.ok(speeds.every(speed => speed >= 20 && speed <= 60));
  assert.ok(new Set(speeds.map(speed => speed.toFixed(6))).size > 1);
});

test('higher walk speed makes hunger and thirst rise faster', () => {
  const slow = world().blobbies[0];
  const fastSimulation = world();
  const fast = fastSimulation.blobbies[0];
  slow.speed = 20;
  fast.speed = 60;
  slow.hunger = fast.hunger = 10;
  slow.thirst = fast.thirst = 10;
  slow.state = fast.state = 'resting';
  slow.wait = fast.wait = 999;
  const slowSimulation = new Simulation({ random: () => 0.5 });
  slowSimulation.blobbies = [slow];
  slowSimulation.elapsed = 0;
  fastSimulation.elapsed = 0;
  slowSimulation.update(1);
  fastSimulation.update(1);
  assert.ok(fast.hunger > slow.hunger);
  assert.ok(fast.thirst > slow.thirst);
});

test('a baby inherits the average walk speed of its parents', () => {
  const simulation = world();
  simulation.bushes = [];
  simulation.lakes = [];
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x + 8, first.y, '#204080');
  first.speed = 24;
  second.speed = 56;
  Object.assign(first, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  Object.assign(second, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  simulation.update(0.05);
  const birthTime = first.matingUntil;
  while (simulation.elapsed < birthTime + 0.05) simulation.update(Math.min(2, birthTime + 0.05 - simulation.elapsed));
  const baby = simulation.blobbies.at(-1);
  assert.equal(baby.speed, 40);
});

test('reset restores the initial population and clean state', () => {
  const simulation = world();
  simulation.spawn(); tick(simulation, 3); simulation.reset();
  assert.equal(simulation.blobbies.length, 1);
  assert.equal(simulation.blobbies[0].id, 1);
  assert.equal(simulation.elapsed, 0);
  assert.equal(simulation.deaths.length, 0);
  assert.ok(simulation.bushes.every(bush => bush.fruits.length === 5 && bush.fruits.every(fruit => fruit.regrowAt === 0)));
});

test('eating takes time and removes exactly one berry for each bite', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  const bush = createBush({ x: blobby.x, y: blobby.y, radius: 25 });
  simulation.bushes = [bush];
  Object.assign(blobby, { hunger: 70, thirst: 5, state: 'eating', target: bush });
  tick(simulation, FRUIT_EAT_SECONDS - 0.1);
  assert.equal(bush.fruits.filter(fruit => fruit.regrowAt > simulation.elapsed).length, 0);
  assert.ok(blobby.hunger >= 70, 'Hunger must not decrease before a berry is consumed');
  simulation.update(0.15);
  assert.equal(bush.fruits.filter(fruit => fruit.regrowAt > simulation.elapsed).length, 1);
  assert.ok(blobby.hunger > 50 && blobby.hunger < 52);
});

test('berries regrow individually only after their own simulation-time delay', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  const bush = createBush({ x: blobby.x, y: blobby.y, radius: 25 });
  simulation.bushes = [bush];
  Object.assign(blobby, { hunger: 90, thirst: 5, state: 'eating', target: bush });
  tick(simulation, FRUIT_EAT_SECONDS * 2 + 0.1);
  const eaten = bush.fruits.filter(fruit => fruit.regrowAt > simulation.elapsed);
  assert.equal(eaten.length, 2);
  assert.ok(eaten[1].regrowAt > eaten[0].regrowAt);
  assert.ok(Math.abs(eaten[0].regrowAt - FRUIT_REGROW_SECONDS - FRUIT_EAT_SECONDS) < 0.06);
  simulation.blobbies = [];
  while (eaten[0].regrowAt - simulation.elapsed > 0.1) simulation.update(Math.min(1, eaten[0].regrowAt - simulation.elapsed - 0.05));
  assert.equal(bush.fruits.filter(fruit => fruit.regrowAt <= simulation.elapsed).length, 3);
  simulation.update(0.1);
  assert.equal(bush.fruits.filter(fruit => fruit.regrowAt <= simulation.elapsed).length, 4);
  simulation.update(FRUIT_EAT_SECONDS + 0.1);
  assert.equal(bush.fruits.filter(fruit => fruit.regrowAt <= simulation.elapsed).length, 5);
});

test('hungry Blobbies skip empty bushes and abandon a target that runs out', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  const empty = createBush({ x: 630, y: 414, radius: 25 });
  empty.fruits.forEach(fruit => { fruit.regrowAt = 1000; });
  const full = createBush({ x: 690, y: 414, radius: 25 });
  simulation.bushes = [empty, full];
  Object.assign(blobby, { hunger: 90, thirst: 5, target: empty, state: 'eating', eatProgress: 0.5 });
  assert.equal(simulation.findVisibleResource(blobby, 'food'), full);
  simulation.update(0.05);
  assert.equal(blobby.target, full);
  assert.equal(blobby.state, 'seeking_food');
  assert.ok(blobby.hunger >= 90, 'Empty bushes must not feed Blobby');
  full.fruits.forEach(fruit => { fruit.regrowAt = 1000; });
  simulation.update(0.05);
  assert.equal(blobby.target, null);
  assert.equal(blobby.state, 'searching_food');
});

test('two Blobbies cannot eat the same last berry', () => {
  const simulation = world();
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x, first.y);
  const bush = createBush({ x: first.x, y: first.y, radius: 25 });
  bush.fruits.slice(1).forEach(fruit => { fruit.regrowAt = 1000; });
  simulation.bushes = [bush];
  for (const blobby of [first, second]) {
    Object.assign(blobby, { hunger: 90, thirst: 5, state: 'eating', target: bush, eatProgress: FRUIT_EAT_SECONDS - 0.025 });
  }
  simulation.update(0.05);
  assert.ok(first.hunger < 71);
  assert.ok(second.hunger >= 90);
  assert.equal(simulation.hasFruit(bush), false);
  assert.equal(second.target, null);
  assert.equal(second.state, 'searching_food');
});


test('recently fed and drank Blobbies can find each other and produce a baby', () => {
  const simulation = world();
  simulation.bushes = [];
  simulation.lakes = [];
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x + 8, first.y, '#204080');
  Object.assign(first, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  Object.assign(second, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  const originalCount = simulation.blobbies.length;

  simulation.update(0.05);
  assert.equal(first.mate, second);
  assert.equal(second.mate, first);
  assert.ok(['mating', 'seeking_mate'].includes(first.state));
  const birthTime = first.matingUntil;
  assert.ok(birthTime >= 10 && birthTime <= 15);

  while (simulation.elapsed < birthTime - 0.05) {
    simulation.update(Math.min(2, birthTime - simulation.elapsed - 0.05));
  }
  assert.equal(simulation.blobbies.length, originalCount);
  simulation.update(0.1);
  assert.equal(simulation.blobbies.length, originalCount + 1);
  const baby = simulation.blobbies.at(-1);
  assert.match(baby.dna.colortien, /^[ABCD]{12}$/);
  assert.match(baby.dna.speedtien, /^[ABCD]{12}$/);
  assert.equal(baby.proteins.colortien, dnaToProtein(baby.dna.colortien));
  assert.equal(baby.proteins.speedtien, dnaToProtein(baby.dna.speedtien));
  assert.equal(baby.color, proteinToColor(baby.proteins.colortien));
  assert.equal(baby.speed, proteinToSpeed(baby.proteins.speedtien));
  assert.equal(first.mate, null);
  assert.equal(second.mate, null);
});

test('Blobbies that were not recently fed and drank do not mate', () => {
  const simulation = world();
  simulation.bushes = [];
  simulation.lakes = [];
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x + 8, first.y, '#204080');
  Object.assign(first, { hunger: 5, thirst: 5, lastFedAt: -100, lastDrankAt: simulation.elapsed });
  Object.assign(second, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  simulation.update(0.05);
  assert.equal(first.mate, null);
  assert.equal(second.mate, null);
  assert.notEqual(first.state, 'mating');
});

test('mating respects the 10,000 living limit', () => {
  const simulation = world();
  while (simulation.blobbies.length < 10000) simulation.spawn();
  const first = simulation.blobbies[0];
  const second = simulation.blobbies[1];
  Object.assign(first, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  Object.assign(second, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  first.x = second.x = 595;
  first.y = second.y = 414;
  simulation.update(0.05);
  assert.equal(simulation.blobbies.length, 10000);
  assert.equal(first.mate, second);
});

for (const need of ['hunger', 'thirst']) {
  test(`a Blobby dies when ${need} reaches 100% and is removed only once`, () => {
    const simulation = world();
    const blobby = simulation.blobbies[0];
    Object.assign(blobby, { hunger: 5, thirst: 5, [need]: 99.99 });
    simulation.update(0.05);
    assert.equal(blobby[need], 100);
    assert.equal(blobby.state, 'dead');
    assert.equal(blobby.deathCause, need);
    assert.equal(blobby.target, null);
    assert.equal(simulation.blobbies.length, 0);
    assert.deepEqual(simulation.deaths, [{ id: blobby.id, cause: need }]);
    const position = { x: blobby.x, y: blobby.y };
    tick(simulation, 3);
    assert.equal(simulation.deaths.length, 1);
    assert.deepEqual({ x: blobby.x, y: blobby.y }, position);
  });
}

test('values below 100% are not fatal, and zero elapsed time freezes needs', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  Object.assign(blobby, { hunger: 99.9, thirst: 99.9 });
  simulation.update(0);
  assert.equal(blobby.hunger, 99.9);
  assert.equal(blobby.thirst, 99.9);
  assert.equal(simulation.blobbies.length, 1);
  simulation.update(0.05);
  assert.ok(blobby.hunger < 100 && blobby.thirst < 100);
  assert.equal(simulation.blobbies.length, 1);
  assert.equal(simulation.deaths.length, 0);
});

test('reaching the limit is fatal in every activity, even before the next bite or drink', () => {
  for (const state of ['wandering', 'resting', 'searching_food', 'searching_water', 'seeking_food', 'seeking_water', 'eating', 'drinking']) {
    const simulation = world();
    const blobby = simulation.blobbies[0];
    const bush = createBush({ x: blobby.x, y: blobby.y, radius: 25 });
    Object.assign(blobby, { hunger: 100, thirst: 100, state, target: state === 'drinking' ? simulation.lakes[0] : bush, eatProgress: FRUIT_EAT_SECONDS });
    simulation.update(0.05);
    assert.equal(blobby.state, 'dead', state);
    assert.equal(simulation.blobbies.length, 0, state);
    assert.equal(bush.fruits.filter(fruit => fruit.regrowAt > 0).length, 0, 'A dead Blobby cannot eat fruit');
  }
});

test('simultaneous deaths leave healthy residents alive and allow spawning after extinction', () => {
  const simulation = world();
  const first = simulation.blobbies[0];
  const second = simulation.spawn(400, 400);
  const healthy = simulation.spawn(550, 400);
  first.hunger = 99.99;
  second.thirst = 99.99;
  simulation.update(0.05);
  assert.deepEqual(simulation.blobbies.map(blobby => blobby.id), [healthy.id]);
  assert.equal(simulation.deaths.length, 2);
  healthy.hunger = 100;
  simulation.update(0.05);
  assert.equal(simulation.blobbies.length, 0);
  const newcomer = simulation.spawn();
  assert.equal(simulation.blobbies.length, 1);
  assert.ok(newcomer.id > healthy.id);
  simulation.reset();
  assert.equal(simulation.blobbies.length, 1);
  assert.equal(simulation.deaths.length, 0);
});


test('Blobby colors can be chosen and the living population is capped at 10,000', () => {
  const simulation = world();
  simulation.blobbies = [];
  for (let i = 0; i < 9999; i++) {
    const blobby = simulation.spawn(595, 414, '#ff55aa');
    assert.ok(blobby);
  }
  assert.equal(simulation.blobbies.length, 9999);
  assert.equal(simulation.spawn(595, 414, '#123456').color, '#123456');
  assert.equal(simulation.blobbies.length, 10000);
  assert.equal(simulation.spawn(595, 414, '#abcdef'), null);
  assert.equal(simulation.blobbies.length, 10000);
});


test('DNA translates 12 bases into four protein letters and AAAA... produces EEEE red', () => {
  assert.equal(dnaToProtein('AAAAAAAAAAAA'), 'EEEE');
  assert.equal(proteinToColor('EEEE'), '#ff0000');
  assert.equal(proteinToSpeed('EEEE'), 60);
  assert.equal(proteinToSpeed('AAAA'), 20);
});


test('Eyetien controls eyesight and hunger recognition threshold', () => {
  assert.equal(proteinToEyesight('AAAA'), 150);
  assert.equal(proteinToEyesight('EEEE'), 300);
  assert.equal(proteinToHungerRecognitionThreshold('AAAA'), 50);
  assert.equal(proteinToHungerRecognitionThreshold('EEEE'), 75);
  const simulation = world();
  const blobby = simulation.blobbies[0];
  assert.ok(blobby.eyesight >= 150 && blobby.eyesight <= 300);
  assert.ok(blobby.hungerRecognitionThreshold >= 50 && blobby.hungerRecognitionThreshold <= 75);
  assert.match(blobby.dna.eyetien, /^[ABCD]{12}$/);
  assert.equal(blobby.proteins.eyetien, dnaToProtein(blobby.dna.eyetien));
});

test('higher Eyetien makes a Blobby wait longer before recognizing hunger', () => {
  const simulation = world();
  const low = simulation.blobbies[0];
  const high = simulation.spawn(low.x + 50, low.y);
  low.hungerRecognitionThreshold = 50;
  high.hungerRecognitionThreshold = 75;
  low.hunger = 60;
  high.hunger = 60;
  low.thirst = 5;
  high.thirst = 5;
  low.target = null;
  high.target = null;
  simulation.update(0.01);
  assert.equal(low.state, 'seeking_food');
  assert.notEqual(high.state, 'seeking_food');
});

test('babies inherit DNA bases from both parents', () => {
  const simulation = world();
  simulation.bushes = [];
  simulation.lakes = [];
  const first = simulation.blobbies[0];
  const second = simulation.spawn(first.x + 8, first.y);
  first.dna = { colortien: 'AAAAAAAAAAAA', speedtien: 'AAAAAAAAAAAA' };
  second.dna = { colortien: 'DDDDDDDDDDDD', speedtien: 'DDDDDDDDDDDD' };
  first.proteins = { colortien: 'EEEE', speedtien: 'EEEE' };
  second.proteins = { colortien: 'AAAA', speedtien: 'AAAA' };
  first.color = '#ff0000'; second.color = '#000000';
  Object.assign(first, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  Object.assign(second, { hunger: 5, thirst: 5, lastFedAt: simulation.elapsed, lastDrankAt: simulation.elapsed });
  simulation.update(0.05);
  const birthTime = first.matingUntil;
  while (simulation.elapsed < birthTime + 0.05) simulation.update(Math.min(2, birthTime + 0.05 - simulation.elapsed));
  const baby = simulation.blobbies.at(-1);
  assert.match(baby.dna.colortien, /^[ABCD]{12}$/);
  assert.match(baby.dna.speedtien, /^[ABCD]{12}$/);
  for (let i = 0; i < 12; i++) assert.ok(baby.dna.colortien[i] === 'A' || baby.dna.colortien[i] === 'D');
  assert.equal(baby.color, proteinToColor(baby.proteins.colortien));
  assert.equal(baby.speed, (first.speed + second.speed) / 2);
  assert.match(baby.dna.eyetien, /^[ABCD]{12}$/);
  assert.equal(baby.proteins.eyetien, dnaToProtein(baby.dna.eyetien));
});

test('Blubbys use the same three DNA traits but have greater eyesight', () => {
  const simulation = world();
  const blobby = simulation.blobbies[0];
  const blubby = simulation.spawnBlubby(700, 400, {
    colortien: 'AAAAAAAAAAAA', speedtien: 'DDDDDDDDDDDD', eyetien: 'AAAAAAAAAAAA'
  });
  assert.equal(blubby.dna.colortien, 'AAAAAAAAAAAA');
  assert.equal(blubby.dna.speedtien, 'DDDDDDDDDDDD');
  assert.equal(blubby.dna.eyetien, 'AAAAAAAAAAAA');
  assert.equal(blubby.speed, proteinToSpeed('AAAA'));
  assert.ok(blubby.eyesight > proteinToEyesight(blobby.proteins.eyetien));
});

test('a Blubby needs two Blobbys to get the equivalent of 15% hunger nutrition', () => {
  const simulation = world();
  const blubby = simulation.spawnBlubby(600, 400, {
    colortien: 'AAAAAAAAAAAA', speedtien: 'BBBBBBBBBBBB', eyetien: 'AAAAAAAAAAAA'
  });
  const prey1 = simulation.spawn(620, 400);
  const prey2 = simulation.spawn(640, 400);
  blubby.hunger = 50;
  blubby.thirst = 0;
  blubby.speed = 0;
  blubby.prey = prey1;
  blubby.state = 'eating_prey';
  const startHunger = blubby.hunger;
  simulation.update(1);
  const afterFirst = blubby.hunger;
  assert.ok(Math.abs((startHunger - afterFirst) - 7.5) < 0.001, `first prey nutrition was ${startHunger - afterFirst}`);
  assert.equal(prey1.state, 'dead');
  blubby.prey = prey2;
  blubby.state = 'eating_prey';
  simulation.update(1);
  assert.ok(Math.abs((startHunger - blubby.hunger) - 15) < 0.001, `two prey nutrition was ${startHunger - blubby.hunger}`);
  assert.equal(prey2.state, 'dead');
});


test('Robbys can be spawned and three nearby Robbys team up to devour a Blubby', () => {
  const simulation = world();
  simulation.blobbies = [];
  simulation.blubbys = [];
  simulation.robbys = [];
  const blubby = simulation.spawnBlubby(600, 400);
  const first = simulation.spawnRobby(570, 400);
  const second = simulation.spawnRobby(600, 370);
  const third = simulation.spawnRobby(630, 400);
  assert.equal(simulation.robbys.length, 3);
  assert.equal(simulation.blobbies.length, 0);
  // Keep the team close and allow their coordinated attack timer to complete.
  for (const robby of simulation.robbys) Object.assign(robby, { x: 600, y: 400, hunger: 10, thirst: 10 });
  Object.assign(blubby, { x: 600, y: 400, hunger: 10, thirst: 10 });
  tick(simulation, 3);
  assert.equal(simulation.blubbys.length, 0);
  assert.ok(simulation.robbys.every(robby => robby.hunger < 100));
});
