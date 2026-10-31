(() => {
'use strict';
const { Simulation, BLOBBY_SIZE, BEHAVIOR_LABELS, seededRandom, MAX_BLOBBIES, MAX_SPAWN } = globalThis.BlobbyLife;

const $ = id => document.getElementById(id);
const canvas = $('world');
const context = canvas.getContext('2d');
const simulation = new Simulation();
let selectedId = null;
let hoveredId = null;
let pointer = null;
let paused = false;
let editing = false;
let speed = 1;
let view = { scale: 1, x: 0, y: 0, width: 1200, height: 760 };
let lastTime = performance.now();
let uiTimer = 0;
let toastTimer;
let spawnEffects = [];
let graphHistory = [];
let nextGraphSample = 60;
const speciesNames = { blobby: 'Blobby', blubby: 'Blubby', robby: 'Robby' };
const speciesPlurals = { blobby: 'Blobbies', blubby: 'Blubbys', robby: 'Robbys' };
const speciesOf = creature => creature.species || 'blobby';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A seeded, pre-rendered meadow keeps the canvas light and the scenery still.
const terrain = document.createElement('canvas');
const ground = terrain.getContext('2d');
function buildTerrain() {
const { width, height } = simulation;
terrain.width = width;
terrain.height = height;
const decorativeRandom = seededRandom(83);
ground.fillStyle = '#eaf0da';
ground.fillRect(0, 0, width, height);
const wash = ground.createRadialGradient(width * 0.46, height * 0.47, 80, width * 0.46, height * 0.47, Math.max(width, height) * 0.7);
wash.addColorStop(0, '#f0f3e0');
wash.addColorStop(1, '#e3ebcf');
ground.fillStyle = wash;
ground.fillRect(0, 0, width, height);
for (let y = 22; y < height; y += 28) {
  for (let x = 20; x < width; x += 28) {
    ground.fillStyle = '#8fa37215';
    ground.beginPath(); ground.arc(x, y, 0.85, 0, Math.PI * 2); ground.fill();
  }
}
for (let i = 0; i < 40; i++) {
  const x = decorativeRandom() * width;
  const y = decorativeRandom() * height;
  const patch = ground.createRadialGradient(x, y, 0, x, y, 40 + decorativeRandom() * 80);
  patch.addColorStop(0, i % 2 ? '#becd9613' : '#ffffec22');
  patch.addColorStop(1, '#becd9600');
  ground.fillStyle = patch; ground.fillRect(x - 130, y - 130, 260, 260);
}
for (let i = 0; i < 110; i++) {
  const x = 32 + decorativeRandom() * (width - 64);
  const y = 35 + decorativeRandom() * (height - 70);
  if (!simulation.isLand(x, y, 40)) continue;
  ground.strokeStyle = i % 3 === 0 ? '#a4b48960' : '#b2c09a70';
  ground.lineWidth = 1.3; ground.lineCap = 'round';
  ground.beginPath();
  ground.moveTo(x, y); ground.quadraticCurveTo(x - 1, y - 5, x - 5, y - 7);
  ground.moveTo(x + 3, y); ground.quadraticCurveTo(x + 3, y - 5, x + 5, y - 9);
  ground.moveTo(x + 1, y); ground.lineTo(x, y - 9); ground.stroke();
  if (i % 6 === 0) {
    ground.fillStyle = '#fcfcdf';
    for (let p = 0; p < 5; p++) {
      const angle = p * Math.PI * 2 / 5;
      ground.beginPath(); ground.arc(x + 13 + Math.cos(angle) * 2.5, y - 8 + Math.sin(angle) * 2.5, 2, 0, Math.PI * 2); ground.fill();
    }
    ground.fillStyle = '#d5c488'; ground.beginPath(); ground.arc(x + 13, y - 8, 1.6, 0, Math.PI * 2); ground.fill();
  }
}
}
buildTerrain();

function resize() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  const scale = Math.min(rect.width / simulation.width, rect.height / simulation.height);
  view = { scale, x: (rect.width - simulation.width * scale) / 2, y: (rect.height - simulation.height * scale) / 2, width: rect.width, height: rect.height, pixelRatio };
  draw();
}

function lakePath(lake, grow = 0) {
  context.beginPath();
  for (let index = 0; index <= 80; index++) {
    const angle = index / 80 * Math.PI * 2;
    const wobble = 1 + Math.sin(angle * 3 + lake.phase) * 0.035 + Math.cos(angle * 5 + lake.phase) * 0.015;
    const x = lake.x + Math.cos(angle) * (lake.rx + grow) * wobble;
    const y = lake.y + Math.sin(angle) * (lake.ry + grow) * wobble;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
}

function drawLake(lake) {
  context.fillStyle = '#cdd9b472'; lakePath(lake, 15); context.fill();
  context.fillStyle = '#dbe3c3'; lakePath(lake, 7); context.fill();
  const water = context.createLinearGradient(lake.x, lake.y - lake.ry, lake.x, lake.y + lake.ry);
  water.addColorStop(0, '#a4cbc7'); water.addColorStop(1, '#92bfbb');
  context.fillStyle = water; lakePath(lake); context.fill();
  context.strokeStyle = '#85b4ae'; context.lineWidth = 1.5; context.stroke();
  context.save(); lakePath(lake, -4); context.clip();
  context.fillStyle = '#c8e0d733'; lakePath({ ...lake, x: lake.x - 20, y: lake.y - 20, rx: lake.rx * 0.86, ry: lake.ry * 0.9 }); context.fill();
  context.strokeStyle = '#e2efe396'; context.lineWidth = 1.5; context.lineCap = 'round';
  const drift = reducedMotion ? 0 : Math.sin(simulation.elapsed * 0.5 + lake.phase) * 4;
  for (const [dx, dy, width] of [[-37, -16, 22], [19, 5, 29], [-9, 32, 16]]) {
    context.beginPath(); context.moveTo(lake.x + dx + drift, lake.y + dy); context.quadraticCurveTo(lake.x + dx + width / 2 + drift, lake.y + dy + 2, lake.x + dx + width + drift, lake.y + dy); context.stroke();
  }
  context.restore();
  // A few reeds and pebbles along the shore.
  context.strokeStyle = '#9caf78'; context.lineWidth = 2;
  for (const offset of [-8, 0, 8]) {
    const x = lake.x - lake.rx * 0.65 + offset;
    const y = lake.y + lake.ry * 0.85;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + offset * 0.3, y - 15 - Math.abs(offset) / 2); context.stroke();
    context.fillStyle = '#b2ad7f'; context.beginPath(); context.ellipse(x + offset * 0.3, y - 15 - Math.abs(offset) / 2, 2, 4, 0, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = '#c4cbb1';
  for (const [dx, dy, r] of [[0.76, 0.64, 5], [0.82, 0.57, 3]]) {
    context.beginPath(); context.ellipse(lake.x + lake.rx * dx, lake.y + lake.ry * dy, r, r * 0.7, -0.3, 0, Math.PI * 2); context.fill();
  }
}

function drawBush(bush) {
  const r = bush.radius;
  context.fillStyle = '#91a47127'; context.beginPath(); context.ellipse(bush.x + 3, bush.y + r * 0.62, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); context.fill();
  const clusters = [[-0.47, 0.08, 0.6, '#79975f'], [0.44, 0.02, 0.65, '#84a36b'], [0.06, -0.41, 0.65, '#91ae75'], [0, 0.22, 0.65, '#87a369']];
  for (const [dx, dy, size, color] of clusters) {
    context.fillStyle = color; context.beginPath(); context.arc(bush.x + dx * r, bush.y + dy * r, size * r, 0, Math.PI * 2); context.fill();
  }
  context.fillStyle = '#a8bf8555'; context.beginPath(); context.ellipse(bush.x - 4, bush.y - 13, 9, 5, -0.5, 0, Math.PI * 2); context.fill();
  for (const { dx, dy, regrowAt } of bush.fruits) {
    if (regrowAt > simulation.elapsed) continue;
    context.fillStyle = '#bb7b79'; context.beginPath(); context.arc(bush.x + dx * r, bush.y + dy * r, 3.3, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#dca19a'; context.beginPath(); context.arc(bush.x + dx * r - 0.7, bush.y + dy * r - 0.8, 1, 0, Math.PI * 2); context.fill();
  }
}

const colorCache = new Map();
function appearance(color) {
  if (colorCache.has(color)) return colorCache.get(color);
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const mix = (target, strength) => `rgb(${rgb.map(value => Math.round(value + (target - value) * strength)).join(',')})`;
  const result = { light: mix(255, 0.2), dark: mix(0, 0.2), face: rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 130 ? '#f7fff1' : '#273621' };
  colorCache.set(color, result);
  return result;
}

function drawBlobby(blobby) {
  const selected = selectedId === blobby.id;
  const active = blobby.state !== 'resting' && blobby.state !== 'eating' && blobby.state !== 'drinking';
  const bob = reducedMotion ? 0 : Math.sin(simulation.elapsed * (active ? 8 : 2) + blobby.phase) * (active ? 1.2 : 0.5);
  const size = blobby.species === 'blubby' ? 31 : blobby.species === 'robby' ? 22 : BLOBBY_SIZE;
  const x = blobby.x - size / 2;
  const y = blobby.y - size / 2 + bob;
  context.fillStyle = '#71814a24'; context.beginPath(); context.ellipse(blobby.x + 2, blobby.y + 14, 16, 5, 0, 0, Math.PI * 2); context.fill();
  if (selected || hoveredId === blobby.id) {
    context.strokeStyle = selected ? '#648c4580' : '#91b57880'; context.lineWidth = 1.8;
    context.beginPath(); context.ellipse(blobby.x, blobby.y + 12, 23, 10, 0, 0, Math.PI * 2); context.stroke();
  }
  const body = context.createLinearGradient(x, y, x, y + size);
  const colors = appearance(blobby.color);
  body.addColorStop(0, colors.light); body.addColorStop(1, blobby.color);
  context.fillStyle = body; context.strokeStyle = colors.dark; context.lineWidth = 1.5;
  context.beginPath(); context.roundRect(x, y, size, size, blobby.species === 'robby' ? size / 2 : blobby.species === 'blubby' ? 7 : 3); context.fill(); context.stroke();
  context.fillStyle = '#ffffff25'; context.beginPath(); context.roundRect(x + 2, y + 2, size - 4, 5, 2); context.fill();
  const eyeX = blobby.direction.x * 1.2;
  const eyeY = blobby.direction.y * 0.8;
  context.fillStyle = colors.face;
  for (const dx of [-4.9, 4.9]) {
    context.beginPath(); context.ellipse(blobby.x + dx + eyeX, blobby.y - 1.4 + eyeY + bob, 1.7, 2.2, 0, 0, Math.PI * 2); context.fill();
  }
  context.strokeStyle = colors.face; context.lineWidth = 1.1; context.beginPath();
  context.arc(blobby.x + eyeX, blobby.y + 4 + bob, 2.6, 0.12, Math.PI - 0.12); context.stroke();
  if (blobby.species === 'blubby') {
    context.fillStyle = colors.face;
    for (const offset of [-3, 3]) {
      context.beginPath(); context.moveTo(blobby.x + offset - 1.5, blobby.y + 5 + bob); context.lineTo(blobby.x + offset, blobby.y + 9 + bob); context.lineTo(blobby.x + offset + 1.5, blobby.y + 5 + bob); context.fill();
    }
  }
  if (blobby.species === 'robby') {
    context.fillStyle = '#fff6cbbf'; context.beginPath(); context.arc(blobby.x, blobby.y - 7 + bob, 2.3, 0, Math.PI * 2); context.fill();
  }
  if (blobby.state === 'mating' || blobby.state === 'seeking_mate' || blobby.state === 'eating_prey' || blobby.state === 'team_hunting') {
    context.fillStyle = '#fffaf1ee'; context.strokeStyle = '#dfcebd'; context.lineWidth = 1;
    context.beginPath(); context.roundRect(blobby.x - 12, blobby.y - 43 + bob, 24, 20, 6); context.fill(); context.stroke();
    context.fillStyle = '#be837e'; context.font = '13px "Segoe UI", sans-serif'; context.textAlign = 'center';
    context.fillText(blobby.state === 'mating' || blobby.state === 'seeking_mate' ? '♥' : blobby.state === 'team_hunting' ? '✦' : '•', blobby.x, blobby.y - 29 + bob);
  }
  if (blobby.state === 'eating' || blobby.state === 'drinking') {
    context.fillStyle = '#fbfdefe8'; context.strokeStyle = '#d5dfc3'; context.lineWidth = 1;
    context.beginPath(); context.roundRect(blobby.x - 11, blobby.y - 43 + bob, 22, 20, 6); context.fill(); context.stroke();
    if (blobby.state === 'drinking') {
      context.fillStyle = '#88b9b3'; context.beginPath(); context.moveTo(blobby.x, blobby.y - 39 + bob); context.bezierCurveTo(blobby.x - 9, blobby.y - 29 + bob, blobby.x + 9, blobby.y - 29 + bob, blobby.x, blobby.y - 39 + bob); context.fill();
    } else {
      context.fillStyle = '#bf807a'; context.beginPath(); context.arc(blobby.x - 2, blobby.y - 32 + bob, 3, 0, Math.PI * 2); context.arc(blobby.x + 3, blobby.y - 34 + bob, 3, 0, Math.PI * 2); context.fill();
    }
  }
  if (selected) {
    const label = `${speciesNames[speciesOf(blobby)].toUpperCase()} ${String(blobby.id).padStart(2, '0')}`;
    context.font = '600 10px "Segoe UI", sans-serif';
    const width = context.measureText(label).width + 15;
    const labelY = blobby.y + 32;
    context.fillStyle = '#fcfdf4e8'; context.beginPath(); context.roundRect(blobby.x - width / 2, labelY - 9, width, 19, 4); context.fill();
    context.fillStyle = '#72875c'; context.textAlign = 'center'; context.fillText(label, blobby.x, labelY + 4);
  }
}

function draw() {
  context.setTransform(view.pixelRatio || 1, 0, 0, view.pixelRatio || 1, 0, 0);
  context.fillStyle = '#e2e9d4'; context.fillRect(0, 0, view.width, view.height);
  context.translate(view.x, view.y); context.scale(view.scale, view.scale);
  context.save(); context.beginPath(); context.rect(0, 0, simulation.width, simulation.height); context.clip();
  context.drawImage(terrain, 0, 0);
  const selected = simulation.creatures.find(blobby => blobby.id === selectedId);
  if (selected && $('show-sight').checked) {
    context.fillStyle = '#fbffe51a'; context.strokeStyle = '#819f6380'; context.lineWidth = 1.2; context.setLineDash([5, 7]);
    context.beginPath(); context.arc(selected.x, selected.y, selected.eyesight, 0, Math.PI * 2); context.fill(); context.stroke(); context.setLineDash([]);
    if (selected.target) {
      context.strokeStyle = '#779b5555'; context.setLineDash([3, 6]); context.beginPath(); context.moveTo(selected.x, selected.y); context.lineTo(selected.target.x, selected.target.y); context.stroke(); context.setLineDash([]);
    }
  }
  simulation.lakes.forEach(drawLake);
  const inhabitants = [...simulation.bushes, ...simulation.creatures].sort((a, b) => a.y - b.y);
  inhabitants.forEach(item => item.kind === 'food' ? drawBush(item) : drawBlobby(item));
  const now = performance.now();
  spawnEffects = spawnEffects.filter(effect => now - effect.started < 750);
  if (!reducedMotion) for (const effect of spawnEffects) {
    const progress = (now - effect.started) / 750;
    context.strokeStyle = `rgba(113, 159, 71, ${0.5 * (1 - progress)})`; context.lineWidth = 2;
    context.beginPath(); context.arc(effect.x, effect.y, 16 + progress * 30, 0, Math.PI * 2); context.stroke();
  }
  if (editing) {
    context.strokeStyle = '#789b62'; context.lineWidth = 2; context.setLineDash([7, 7]);
    context.strokeRect(2, 2, simulation.width - 4, simulation.height - 4);
    const tool = $('editor-tool').value;
    const resource = pointer && tool === 'delete' ? simulation.resourceAt(pointer.x, pointer.y) : null;
    if (pointer && tool !== 'inspect') {
      context.strokeStyle = tool === 'delete' ? '#bb7975' : tool === 'lake' ? '#78aaa6' : '#719959';
      context.beginPath();
      if (resource?.kind === 'water') context.ellipse(resource.x, resource.y, resource.rx + 5, resource.ry + 5, 0, 0, Math.PI * 2);
      else if (tool === 'lake') {
        const size = Math.min(160, Math.max(30, Number($('lake-size').value) || 85));
        context.ellipse(pointer.x, pointer.y, size, size * 0.72, 0, 0, Math.PI * 2);
      } else context.arc(resource?.x ?? pointer.x, resource?.y ?? pointer.y, resource ? resource.radius + 8 : 25, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([]);
  }
  context.restore();
}

function updateInspector() {
  const blobby = simulation.creatures.find(item => item.id === selectedId);
  if (!blobby) selectedId = null;
  const hasResidents = simulation.livingCount > 0;
  $('empty-inspector').hidden = Boolean(blobby);
  $('selected-inspector').hidden = !blobby;
  $('world-tip').hidden = Boolean(blobby);
  $('world-tip-text').textContent = editing ? $('editor-help').textContent : hasResidents ? 'Click a Blobby to say hello' : 'Press B to bring the meadow to life';
  $('world-tip').hidden = editing ? false : Boolean(blobby);
  $('empty-title').textContent = hasResidents ? 'A curious little square.' : 'A quiet little meadow.';
  $('empty-description').textContent = hasResidents ? 'Every little life has its own needs and inherited traits. Tap a creature to get to know it.' : 'No creatures are left. Press B, P, or R to bring a new life to the meadow.';
  $('tap-hint-text').textContent = hasResidents ? 'Select a friend in the meadow' : 'A new little life is one tap away';
  if (!blobby) return;
  $('blobby-name').textContent = `${speciesNames[speciesOf(blobby)]} ${String(blobby.id).padStart(2, '0')}`;
  $('species-description').textContent = { blobby: 'Berry grazer · passes on its DNA', blubby: 'Predator · a longer view of the meadow', robby: 'Small grazer · strength in numbers' }[speciesOf(blobby)];
  $('walk-speed-value').textContent = blobby.speed.toFixed(1);
  $('eyesight-value').textContent = blobby.eyesight.toFixed(0);
  $('hunger-recognition-value').textContent = `${blobby.hungerRecognitionThreshold.toFixed(0)}%`;
  for (const gene of ['colortien', 'speedtien', 'eyetien']) {
    $(`${gene}-dna`).textContent = blobby.dna[gene];
    $(`${gene}-protein`).textContent = blobby.proteins[gene];
  }
  if ($('selected-color').value !== blobby.color) $('selected-color').value = blobby.color;
  $('selected-portrait').style.background = blobby.color;
  $('selected-portrait').style.borderRadius = blobby.species === 'robby' ? '50%' : blobby.species === 'blubby' ? '10px' : '6px';
  $('selected-portrait').style.borderColor = appearance(blobby.color).dark;
  $('selected-portrait').style.setProperty('--blobby-face', appearance(blobby.color).face);
  $('behavior').textContent = BEHAVIOR_LABELS[blobby.state];
  for (const key of ['hunger', 'thirst']) {
    const value = Math.floor(blobby[key]);
    $(`${key}-value`).textContent = `${value}%`;
    $(`${key}-fill`).style.width = `${value}%`;
    $(`${key}-meter`).setAttribute('aria-valuenow', value);
  }
}

function showToast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2300);
}

function collectGraphSample() {
  const living = simulation.creatures.filter(creature => creature.state !== 'dead');
  const population = living.length;
  graphHistory.push({ minute: Math.floor(simulation.elapsed / 60), population,
    averageSpeed: population ? living.reduce((sum, creature) => sum + creature.speed, 0) / population : 0,
    averageEyesight: population ? living.reduce((sum, creature) => sum + creature.eyesight, 0) / population : 0 });
  if (graphHistory.length > 60) graphHistory.shift();
  nextGraphSample = (Math.floor(simulation.elapsed / 60) + 1) * 60;
  const latest = graphHistory.at(-1);
  $('graph-time').textContent = `${latest.minute} min`;
  $('graph-population-value').textContent = latest.population.toLocaleString('en-US');
  $('graph-speed-value').textContent = latest.averageSpeed.toFixed(1);
  $('graph-eyesight-value').textContent = latest.averageEyesight.toFixed(0);
  drawGraphs();
}

function drawGraph(id, key, color) {
  const chart = $(id);
  const ctx = chart.getContext('2d');
  const width = chart.width;
  const height = chart.height;
  ctx.clearRect(0, 0, width, height);
  if (!graphHistory.length) return;
  const values = graphHistory.map(point => point[key]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const left = 14, top = 22, bottom = height - 22;
  ctx.strokeStyle = '#e5eadc'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = top + (bottom - top) * i / 2;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - left, y); ctx.stroke();
  }
  const points = graphHistory.map((point, i) => ({
    x: graphHistory.length === 1 ? width / 2 : left + i / (graphHistory.length - 1) * (width - left * 2),
    y: bottom - (point[key] - minimum) / range * (bottom - top),
  }));
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    if (i === 0) ctx.moveTo(points[i].x, points[i].y); else ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(points.at(-1).x, bottom); ctx.lineTo(points[0].x, bottom); ctx.closePath();
  ctx.fillStyle = `${color}13`; ctx.fill();
  ctx.fillStyle = color;
  for (const point of points) { ctx.beginPath(); ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#a1ad93'; ctx.font = '16px "Segoe UI", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(maximum.toFixed(key === 'averageSpeed' ? 1 : 0), left, 17);
}

function drawGraphs() {
  drawGraph('population-graph', 'population', '#88a96b');
  drawGraph('speed-graph', 'averageSpeed', '#b6a069');
  drawGraph('eyesight-graph', 'averageEyesight', '#80aaa6');
}

function resetGraphs() {
  graphHistory = []; nextGraphSample = 60; collectGraphSample();
}

function updatePopulation() {
  const count = simulation.livingCount;
  $('population').textContent = `${count.toLocaleString('en-US')} ${simulation.blubbys.length || simulation.robbys.length ? 'residents' : count === 1 ? 'Blobby' : 'Blobbies'}`;
  $('population-capacity').textContent = `${count.toLocaleString('en-US')} / ${MAX_BLOBBIES.toLocaleString('en-US')} living`;
  $('count-blobby').textContent = simulation.blobbies.length.toLocaleString('en-US');
  $('count-blubby').textContent = simulation.blubbys.length.toLocaleString('en-US');
  $('count-robby').textContent = simulation.robbys.length.toLocaleString('en-US');
  $('spawn').disabled = count >= MAX_BLOBBIES;
  $('spawn-note').textContent = `${MAX_SPAWN} per spawn · ${MAX_BLOBBIES.toLocaleString('en-US')} living creatures maximum.`;
}

function handleDeaths() {
  const deaths = simulation.deaths.splice(0);
  if (deaths.length === 0) return;
  if (deaths.some(death => death.id === selectedId)) selectedId = null;
  if (deaths.some(death => death.id === hoveredId)) {
    hoveredId = null;
    canvas.style.cursor = 'default';
  }
  updatePopulation();
  updateInspector();
  showToast(deaths.length === 1
    ? `${speciesNames[deaths[0].species || 'blobby']} ${String(deaths[0].id).padStart(2, '0')} died from ${deaths[0].cause}`
    : `${deaths.length} creatures died`);
}

function spawn(count = 1, species = 'blobby') {
  if (simulation.livingCount >= MAX_BLOBBIES) { showToast(`The meadow is full: ${MAX_BLOBBIES.toLocaleString('en-US')} living creatures maximum.`); return; }
  if (!Number.isInteger(count) || count < 1 || count > MAX_SPAWN) { showToast(`Enter a whole spawn amount from 1 to ${MAX_SPAWN}.`); return; }
  const color = $('color-mode').value === 'custom' ? $('spawn-color').value : null;
  const blobbies = simulation.spawnMany(count, { x: pointer?.x, y: pointer?.y, color, species });
  if (blobbies.length === 0) { showToast('No room on land for a new Blobby.'); return; }
  spawnEffects.push(...blobbies.slice(0, 20).map(blobby => ({ x: blobby.x, y: blobby.y, started: performance.now() })));
  updatePopulation(); updateInspector();
  showToast(blobbies.length === 1 ? `${speciesNames[species]} ${String(blobbies[0].id).padStart(2, '0')} joined the meadow` : `${blobbies.length} ${speciesPlurals[species]} joined the meadow${blobbies.length < count ? ' (population limit reached)' : ''}`);
  draw();
}

function togglePause() {
  if (editing) return;
  paused = !paused;
  updatePlayback();
}

function updatePlayback() {
  $('pause-overlay').hidden = editing || !paused;
  $('pause').disabled = editing;
  $('pause-icon').textContent = paused ? '▷' : 'Ⅱ';
  $('pause').setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
  $('pause').title = `${paused ? 'Resume' : 'Pause'} (Space)`;
  $('live-label').textContent = editing ? 'WORLD IN EDITOR' : paused ? 'WORLD IS PAUSED' : 'WORLD IS ALIVE';
}

function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const point = { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale };
  return point.x >= 0 && point.x <= simulation.width && point.y >= 0 && point.y <= simulation.height ? point : null;
}

function blobbyAt(point) {
  if (!point) return null;
  // Nearest hit wins; the extra touch area makes small squares easy to tap.
  const hitRadius = Math.max(22, 12 / view.scale);
  let nearest = null;
  let gap = hitRadius;
  for (const blobby of simulation.creatures) {
    const current = Math.hypot(blobby.x - point.x, blobby.y - point.y);
    if (current <= gap) { gap = current; nearest = blobby; }
  }
  return nearest;
}

canvas.addEventListener('pointermove', event => {
  pointer = worldPoint(event);
  hoveredId = blobbyAt(pointer)?.id ?? null;
  canvas.style.cursor = editing && $('editor-tool').value !== 'inspect' ? 'crosshair' : hoveredId ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { pointer = null; hoveredId = null; });
canvas.addEventListener('click', event => {
  const point = worldPoint(event);
  if (editing && $('editor-tool').value !== 'inspect') {
    if (!point) return;
    const tool = $('editor-tool').value;
    if (tool === 'bush') showToast(simulation.addBush(point.x, point.y) ? 'A berry bush planted.' : 'Place bushes on clear land, away from other resources.');
    if (tool === 'lake') showToast(simulation.addLake(point.x, point.y, Number($('lake-size').value)) ? 'A new lake added.' : 'Choose a clear spot and a lake size from 30 to 160.');
    if (tool === 'delete') showToast(simulation.removeResource(simulation.resourceAt(point.x, point.y)) ? 'Resource removed.' : 'Click a bush or lake to remove it.');
    buildTerrain(); updateInspector(); draw(); return;
  }
  selectedId = blobbyAt(point)?.id ?? null;
  updateInspector(); draw();
});
$('spawn').addEventListener('click', () => spawn(Number($('spawn-count').value), $('spawn-species').value));
function updateSpawnLabel() {
  const count = Number($('spawn-count').value);
  const species = $('spawn-species').value;
  $('spawn-label').textContent = Number.isInteger(count) && count > 1 && count <= MAX_SPAWN ? `Spawn ${count} ${speciesPlurals[species]}` : `Spawn ${speciesNames[species]}`;
  $('spawn-key').textContent = { blobby: 'B', blubby: 'P', robby: 'R' }[species];
  $('spawn').setAttribute('data-species', species);
}
$('spawn-count').addEventListener('input', updateSpawnLabel);
$('spawn-species').addEventListener('change', updateSpawnLabel);
$('color-mode').addEventListener('change', () => { $('spawn-color-label').hidden = $('color-mode').value !== 'custom'; });
$('selected-color').addEventListener('input', () => {
  const blobby = simulation.creatures.find(item => item.id === selectedId);
  if (blobby && /^#[0-9a-f]{6}$/i.test($('selected-color').value)) blobby.color = $('selected-color').value;
  updateInspector(); draw();
});
function updateEditorTool() {
  const tool = $('editor-tool').value;
  $('lake-size-label').hidden = tool !== 'lake';
  $('editor-help').textContent = { inspect: 'Click a Blobby to inspect or change its color.', bush: 'Click clear land to plant a berry bush.', lake: 'Click a clear spot to place a lake.', delete: 'Click a bush or lake to delete it.' }[tool];
  updateInspector(); draw();
}
function toggleEditor() {
  editing = !editing;
  pointer = null;
  $('editor-panel').hidden = !editing;
  $('edit-toggle').textContent = editing ? '✓ Done editing' : '✎ Edit meadow';
  $('edit-toggle').setAttribute('aria-pressed', editing);
  updatePlayback(); updateEditorTool();
}
$('edit-toggle').addEventListener('click', toggleEditor);
$('editor-tool').addEventListener('change', updateEditorTool);
$('resize-world').addEventListener('click', () => {
  if (!editing) return;
  if (!simulation.resizeWorld(Number($('world-width').value), Number($('world-height').value))) {
    showToast('Use whole sizes: width 400–2400, height 300–1600.'); return;
  }
  pointer = null; spawnEffects = [];
  $('canvas-wrap').style.aspectRatio = Math.max(0.8, Math.min(2.2, simulation.width / simulation.height));
  buildTerrain(); resize(); updateInspector(); showToast(`Meadow resized to ${simulation.width} × ${simulation.height}`);
});
$('pause').addEventListener('click', togglePause);
$('deselect').addEventListener('click', () => { selectedId = null; updateInspector(); draw(); });
$('show-sight').addEventListener('change', draw);
$('reset').addEventListener('click', () => {
  simulation.reset(); selectedId = null; hoveredId = null; spawnEffects = [];
  $('world-width').value = simulation.width; $('world-height').value = simulation.height;
  $('canvas-wrap').style.aspectRatio = '';
  buildTerrain(); resize();
  updatePopulation();
  paused = false; updatePlayback();
  resetGraphs(); updateInspector(); draw(); showToast('A fresh meadow. A new little adventure.');
});
document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => {
  speed = Number(button.dataset.speed);
  document.querySelectorAll('[data-speed]').forEach(item => {
    const active = Number(item.dataset.speed) === speed;
    item.classList.toggle('active', active); item.setAttribute('aria-pressed', active);
  });
}));
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key.toLowerCase() === 'b') { event.preventDefault(); spawn(); }
  if (event.key.toLowerCase() === 'p') { event.preventDefault(); spawn(1, 'blubby'); }
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); spawn(1, 'robby'); }
  // Buttons keep their native Space activation instead of firing both actions.
  if (event.code === 'Space' && !event.target.closest('button, a')) { event.preventDefault(); togglePause(); }
  if (event.key === 'Escape') { if (editing) toggleEditor(); selectedId = null; updateInspector(); draw(); }
});
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); });
new ResizeObserver(resize).observe($('canvas-wrap'));

function frame(time) {
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;
  if (!paused && !editing && !document.hidden) simulation.update(delta * speed);
  if (simulation.elapsed >= nextGraphSample) collectGraphSample();
  handleDeaths();
  uiTimer += delta;
  if (uiTimer >= 0.15) { updatePopulation(); updateInspector(); uiTimer = 0; }
  draw(); requestAnimationFrame(frame);
}
updateSpawnLabel(); updatePopulation(); updateInspector(); resetGraphs();
requestAnimationFrame(frame);
})();
