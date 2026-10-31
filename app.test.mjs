import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the actual event handlers without a browser dependency. Canvas drawing
// is stubbed; these tests check game controls and inspectable DOM state, not pixels.
async function loadApp({ configure } = {}) {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const modelSource = await readFile(new URL('./simulation.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const elements = new Map();
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient' ? () => gradient : key === 'measureText' ? text => ({ width: text.length * 6 }) : () => {} });

  class Element {
    constructor(id, tag = 'div', hidden = false) {
      this.id = id; this.tag = tag; this.hidden = hidden; this.checked = true;
      this.style = { setProperty(name, value) { this[name] = value; } }; this.dataset = {}; this.attributes = {}; this.listeners = new Map();
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.textContent = '';
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 570 }; }
    getContext() { return drawing; }
    closest(selector) { return selector.split(',').some(item => item.trim() === this.tag) ? this : null; }
    fire(name, event = {}) { this.listeners.get(name)?.({ target: this, ...event }); }
  }

  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[3], match[1], /\bhidden\b/.test(match[2]));
    element.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] ?? '';
    element.width = Number(match[2].match(/\bwidth="(\d+)"/)?.[1] ?? 300);
    element.height = Number(match[2].match(/\bheight="(\d+)"/)?.[1] ?? 150);
    elements.set(match[3], element);
  }
  elements.get('color-mode').value = 'random';
  elements.get('editor-tool').value = 'inspect';
  elements.get('spawn-species').value = 'blobby';
  const speeds = [...html.matchAll(/<button\b[^>]*data-speed="(\d+)"[^>]*>/g)].map(match => {
    const element = new Element(`speed-${match[1]}`, 'button');
    element.dataset.speed = match[1]; return element;
  });
  const document = new Element('document');
  document.hidden = false;
  document.getElementById = id => elements.get(id);
  document.createElement = tag => new Element('', tag);
  document.querySelectorAll = () => speeds;
  let nextFrame;
  let simulation;
  const sandbox = {
    document, window: { devicePixelRatio: 1 },
    matchMedia: () => ({ matches: false }), performance: { now: () => 0 },
    clearTimeout() {}, setTimeout() { return 1; },
    requestAnimationFrame(callback) { nextFrame = callback; },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
  };
  runInNewContext(modelSource, sandbox, { filename: 'simulation.js' });
  const model = sandbox.BlobbyLife;
  class TestSimulation extends model.Simulation {
    constructor() { super({ random: model.seededRandom(42) }); simulation = this; configure?.(this); }
  }
  sandbox.BlobbyLife = { ...model, Simulation: TestSimulation };
  runInNewContext(source, sandbox, { filename: 'app.js' });

  const get = id => elements.get(id);
  const key = (value, target = new Element('body', 'body'), extra = {}) => {
    let prevented = false;
    document.fire('keydown', { key: value, code: value === ' ' ? 'Space' : `Key${value.toUpperCase()}`, target, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  return { get, key, speeds, simulation, frame: time => nextFrame(time) };
}

test('details stay hidden until a Blobby is tapped and close on Escape', async () => {
  const app = await loadApp();
  assert.equal(app.get('selected-inspector').hidden, true);
  assert.equal(app.get('empty-inspector').hidden, false);
  app.get('world').fire('click', { clientX: 595 * 0.75, clientY: 414 * 0.75 });
  assert.equal(app.get('selected-inspector').hidden, false);
  assert.equal(app.get('empty-inspector').hidden, true);
  assert.equal(app.get('blobby-name').textContent, 'Blobby 01');
  assert.equal(app.get('hunger-value').textContent, '43%');
  assert.equal(app.get('thirst-value').textContent, '38%');
  app.key('Escape');
  assert.equal(app.get('selected-inspector').hidden, true);
});

test('B spawns at the pointer and tapping the new creature inspects its own needs', async () => {
  const app = await loadApp();
  app.get('world').fire('pointermove', { clientX: 400 * 0.75, clientY: 400 * 0.75 });
  assert.equal(app.key('b'), true);
  assert.equal(app.get('population').textContent, '2 Blobbies');
  assert.equal(app.get('selected-inspector').hidden, true);
  app.get('world').fire('click', { clientX: 400 * 0.75, clientY: 400 * 0.75 });
  assert.equal(app.get('blobby-name').textContent, 'Blobby 02');
  assert.equal(app.get('selected-inspector').hidden, false);
  app.get('spawn').fire('click');
  assert.equal(app.get('population').textContent, '3 Blobbies');
});

test('pause stops time, speed accelerates time, and reset clears selected details', async () => {
  const app = await loadApp();
  app.get('world').fire('click', { clientX: 595 * 0.75, clientY: 414 * 0.75 });
  app.key(' ');
  assert.equal(app.get('pause-overlay').hidden, false);
  for (let time = 100; time <= 3000; time += 100) app.frame(time);
  assert.equal(app.get('hunger-value').textContent, '43%');
  app.get('pause').fire('click');
  assert.equal(app.get('pause-overlay').hidden, true);
  app.speeds[2].fire('click');
  assert.equal(app.speeds[2].attributes['aria-pressed'], 'true');
  for (let time = 3100; time <= 3600; time += 100) app.frame(time);
  assert.ok(parseInt(app.get('hunger-value').textContent) > 44);
  app.key('b');
  app.get('reset').fire('click');
  assert.equal(app.get('population').textContent, '1 Blobby');
  assert.equal(app.get('selected-inspector').hidden, true);
});

test('held keys and shortcuts do not create accidental duplicate creatures', async () => {
  const app = await loadApp();
  app.key('b', undefined, { repeat: true });
  app.key('b', undefined, { ctrlKey: true });
  assert.equal(app.get('toast').textContent, '');
  app.key('B');
  assert.equal(app.get('population').textContent, '2 Blobbies');
});

test('death updates the count, closes the selected details, and allows a new Blobby', async () => {
  const app = await loadApp({ configure(simulation) { simulation.blobbies[0].hunger = 99.99; } });
  app.get('world').fire('click', { clientX: 595 * 0.75, clientY: 414 * 0.75 });
  assert.equal(app.get('hunger-value').textContent, '99%', 'A living Blobby must not show 100%');
  app.frame(100);
  assert.equal(app.get('population').textContent, '0 Blobbies');
  assert.equal(app.get('selected-inspector').hidden, true);
  assert.equal(app.get('empty-inspector').hidden, false);
  assert.equal(app.get('empty-title').textContent, 'A quiet little meadow.');
  assert.equal(app.get('toast').textContent, 'Blobby 01 died from hunger');
  app.key('b');
  assert.equal(app.get('population').textContent, '1 Blobby');
  assert.equal(app.get('empty-title').textContent, 'A curious little square.');
});

test('a paused Blobby cannot die until the simulation resumes', async () => {
  const app = await loadApp({ configure(simulation) { simulation.blobbies[0].thirst = 99.99; } });
  app.key(' ');
  app.frame(100); app.frame(200);
  assert.equal(app.get('population').textContent, '1 Blobby');
  assert.equal(app.get('toast').textContent, '');
  app.key(' ');
  app.frame(300);
  assert.equal(app.get('population').textContent, '0 Blobbies');
  assert.equal(app.get('toast').textContent, 'Blobby 01 died from thirst');
});

test('another Blobby dying does not close a healthy resident’s details', async () => {
  const app = await loadApp({ configure(simulation) {
    simulation.blobbies[0].hunger = 99.99;
    simulation.spawn(400, 400);
  } });
  app.get('world').fire('click', { clientX: 400 * 0.75, clientY: 400 * 0.75 });
  assert.equal(app.get('blobby-name').textContent, 'Blobby 02');
  app.frame(100);
  assert.equal(app.get('population').textContent, '1 Blobby');
  assert.equal(app.get('selected-inspector').hidden, false);
  assert.equal(app.get('blobby-name').textContent, 'Blobby 02');
});

test('the entry page boots with ordered local classic scripts and no module loader', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)src="([^"]+)"[^>]*>/g)];
  assert.deepEqual(scripts.map(match => match[2]), ['simulation.js', 'app.js']);
  for (const match of scripts) {
    assert.ok(/\bdefer\b/.test(match[1]), 'Both scripts must run after the page is parsed');
    assert.ok(!/\btype=["']module["']/.test(match[1]), 'Local files must not need the module loader');
    const script = await readFile(new URL(match[2], import.meta.url), 'utf8');
    assert.ok(!/^\s*(?:import|export)\s/m.test(script), 'Browser scripts must not import additional modules');
  }
  const app = await loadApp();
  assert.equal(app.get('population').textContent, '1 Blobby');
  app.key('b');
  assert.equal(app.get('population').textContent, '2 Blobbies');
});

test('spawn amount uses chosen colors, B adds one, and a full 500 batch can exceed 500 living', async () => {
  const app = await loadApp();
  app.get('spawn-count').value = '20';
  app.get('spawn-count').fire('input');
  assert.equal(app.get('spawn-label').textContent, 'Spawn 20 Blobbies');
  app.get('color-mode').value = 'custom'; app.get('color-mode').fire('change');
  app.get('spawn-color').value = '#fe1988';
  assert.equal(app.get('spawn-color-label').hidden, false);
  app.get('spawn').fire('click');
  assert.equal(app.get('population').textContent, '21 Blobbies');
  assert.ok(app.simulation.blobbies.slice(1).every(blobby => blobby.color === '#fe1988'));
  app.key('b');
  assert.equal(app.get('population').textContent, '22 Blobbies');
  app.get('spawn-count').value = '500'; app.get('spawn').fire('click');
  assert.equal(app.get('population').textContent, '522 Blobbies');
  assert.equal(app.get('spawn').disabled, false);
  app.key('b');
  assert.equal(app.simulation.blobbies.length, 523);
});

test('the UI caps total life at 10,000 and re-enables spawning when a Blobby dies', async () => {
  const app = await loadApp({ configure(simulation) {
    while (simulation.blobbies.length < 9998) simulation.spawnMany(Math.min(500, 9998 - simulation.blobbies.length));
  } });
  app.get('spawn-count').value = '500'; app.get('spawn').fire('click');
  assert.equal(app.get('population').textContent, '10,000 Blobbies');
  assert.equal(app.get('spawn').disabled, true);
  app.key('b');
  assert.equal(app.simulation.blobbies.length, 10000);
  assert.ok(app.get('toast').textContent.includes('10,000'));
  app.simulation.blobbies[0].hunger = 100;
  app.frame(100);
  assert.equal(app.get('population').textContent, '9,999 Blobbies');
  assert.equal(app.get('spawn').disabled, false);
  app.key('b');
  assert.equal(app.get('population').textContent, '10,000 Blobbies');
});

test('invalid spawn amounts and typing B in controls do not create creatures', async () => {
  const app = await loadApp();
  for (const amount of ['', '0', '501', '2.5', 'nope']) {
    app.get('spawn-count').value = amount; app.get('spawn').fire('click');
    assert.equal(app.simulation.blobbies.length, 1);
  }
  app.key('b', app.get('spawn-count'));
  assert.equal(app.simulation.blobbies.length, 1);
});

test('a selected Blobby can be recolored without changing its needs', async () => {
  const app = await loadApp();
  app.get('world').fire('click', { clientX: 595 * 0.75, clientY: 414 * 0.75 });
  app.get('selected-color').value = '#000000'; app.get('selected-color').fire('input');
  assert.equal(app.simulation.blobbies[0].color, '#000000');
  assert.equal(app.get('selected-portrait').style.background, '#000000');
  assert.equal(app.get('hunger-value').textContent, '43%');
});

test('editor mode freezes life and can add/delete both types of resources by tapping', async () => {
  const app = await loadApp();
  app.get('edit-toggle').fire('click');
  assert.equal(app.get('editor-panel').hidden, false);
  assert.equal(app.get('pause').disabled, true);
  app.frame(100); app.frame(200);
  assert.equal(app.simulation.elapsed, 0);
  app.get('editor-tool').value = 'bush'; app.get('editor-tool').fire('change');
  app.get('world').fire('click', { clientX: 550 * 0.75, clientY: 95 * 0.75 });
  assert.equal(app.simulation.bushes.length, 7);
  app.get('editor-tool').value = 'lake'; app.get('editor-tool').fire('change');
  app.get('lake-size').value = '60';
  assert.equal(app.get('lake-size-label').hidden, false);
  app.get('world').fire('click', { clientX: 565 * 0.75, clientY: 385 * 0.75 });
  assert.equal(app.simulation.lakes.length, 4);
  app.get('editor-tool').value = 'delete'; app.get('editor-tool').fire('change');
  app.get('world').fire('click', { clientX: 550 * 0.75, clientY: 95 * 0.75 });
  app.get('world').fire('click', { clientX: 565 * 0.75, clientY: 385 * 0.75 });
  assert.equal(app.simulation.bushes.length, 6);
  assert.equal(app.simulation.lakes.length, 3);
  app.get('edit-toggle').fire('click'); app.frame(300);
  assert.ok(app.simulation.elapsed > 0);
  assert.equal(app.get('editor-panel').hidden, true);
});

test('resized maps use the correct click coordinates, and editing preserves a manual pause', async () => {
  const app = await loadApp({ configure(simulation) { simulation.bushes = []; simulation.lakes = []; } });
  app.key(' ');
  app.get('edit-toggle').fire('click');
  app.get('world-width').value = '800'; app.get('world-height').value = '500';
  app.get('resize-world').fire('click');
  assert.equal(app.simulation.width, 800); assert.equal(app.simulation.height, 500);
  app.get('editor-tool').value = 'bush'; app.get('editor-tool').fire('change');
  app.get('world').fire('click', { clientX: 500 * 1.125, clientY: 300 * 1.125 + 3.75 });
  assert.equal(app.simulation.bushes[0].x, 500); assert.equal(app.simulation.bushes[0].y, 300);
  app.key('Escape'); app.frame(100);
  assert.equal(app.get('editor-panel').hidden, true);
  assert.equal(app.get('pause-overlay').hidden, false);
  assert.equal(app.simulation.elapsed, 0);
});

test('predators and defenders keep their shortcuts and reveal all three DNA traits', async () => {
  const app = await loadApp();
  app.get('world').fire('pointermove', { clientX: 500 * 0.75, clientY: 400 * 0.75 });
  app.key('p');
  assert.equal(app.simulation.blubbys.length, 1);
  app.get('world').fire('click', { clientX: 500 * 0.75, clientY: 400 * 0.75 });
  assert.equal(app.get('blobby-name').textContent, 'Blubby 02');
  const predator = app.simulation.blubbys[0];
  for (const gene of ['colortien', 'speedtien', 'eyetien']) {
    assert.equal(app.get(`${gene}-dna`).textContent, predator.dna[gene]);
    assert.equal(app.get(`${gene}-protein`).textContent, predator.proteins[gene]);
  }
  assert.equal(app.get('eyesight-value').textContent, predator.eyesight.toFixed(0));
  app.key('r');
  assert.equal(app.simulation.robbys.length, 1);
  assert.equal(app.get('count-robby').textContent, '1');
  assert.equal(app.get('count-blubby').textContent, '1');
  assert.equal(app.get('population').textContent, '3 residents');
});

test('one consistent factory can batch-spawn each species with a visible color override', async () => {
  const app = await loadApp();
  app.get('spawn-species').value = 'robby'; app.get('spawn-species').fire('change');
  app.get('spawn-count').value = '3'; app.get('spawn-count').fire('input');
  assert.equal(app.get('spawn-label').textContent, 'Spawn 3 Robbys');
  assert.equal(app.get('spawn-key').textContent, 'R');
  app.get('color-mode').value = 'custom'; app.get('spawn-color').value = '#aabbcc';
  app.get('spawn').fire('click');
  assert.equal(app.simulation.robbys.length, 3);
  assert.ok(app.simulation.robbys.every(creature => creature.color === '#aabbcc'));
  app.get('spawn-species').value = 'blubby'; app.get('spawn-species').fire('change');
  app.get('spawn').fire('click');
  assert.equal(app.simulation.blubbys.length, 3);
  assert.ok(app.simulation.blubbys.every(creature => creature.color === '#aabbcc'));
  app.key('b');
  assert.equal(app.simulation.blobbies.length, 2, 'B always creates one Blobby');
});

test('recoloring keeps inherited DNA and proteins intact', async () => {
  const app = await loadApp();
  const creature = app.simulation.blobbies[0];
  const original = JSON.stringify({ dna: creature.dna, proteins: creature.proteins });
  app.get('world').fire('click', { clientX: creature.x * 0.75, clientY: creature.y * 0.75 });
  app.get('selected-color').value = '#abcdef'; app.get('selected-color').fire('input');
  assert.equal(creature.color, '#abcdef');
  assert.equal(JSON.stringify({ dna: creature.dna, proteins: creature.proteins }), original);
});

test('history samples simulation minutes, freezes in the editor, and resets with the meadow', async () => {
  const app = await loadApp({ configure(simulation) {
    const creature = simulation.blobbies[0];
    creature.speed = 0; creature.hunger = 5; creature.thirst = 5;
  } });
  assert.equal(app.get('graph-time').textContent, '0 min');
  for (let time = 100; time <= 61000; time += 100) app.frame(time);
  assert.equal(app.get('graph-time').textContent, '1 min');
  assert.equal(app.get('graph-population-value').textContent, '1');
  app.get('edit-toggle').fire('click');
  const elapsed = app.simulation.elapsed;
  for (let time = 61100; time <= 65000; time += 100) app.frame(time);
  assert.equal(app.simulation.elapsed, elapsed);
  assert.equal(app.get('graph-time').textContent, '1 min');
  app.get('reset').fire('click');
  assert.equal(app.get('graph-time').textContent, '0 min');
});
