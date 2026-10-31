// Classic scripts can load from file:// as well as a local web server.
(() => {
'use strict';

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 760;
const NEED_THRESHOLD = 50;
const BLOBBY_SIZE = 25;
const FRUIT_REGROW_SECONDS = 18;
const FRUIT_EAT_SECONDS = 0.65;
const FRUIT_NUTRITION = 20;
const MARGIN = 35;
const MAX_LIVING_BLOBBIES = 10000;
const MAX_BATCH_SPAWN = 500;
const MAX_BLOBBIES = MAX_LIVING_BLOBBIES;
const MAX_SPAWN = MAX_BATCH_SPAWN;
const DEFAULT_COLOR = '#8bbf59';
const BLUBBY_EYESIGHT_MULTIPLIER = 1.5;
const BLUBBY_PREY_HUNGER_NUTRITION = 7.5;
const RECENTLY_SATED_SECONDS = 20;
const MATING_MIN_SECONDS = 10;
const MATING_MAX_SECONDS = 15;
const MATING_COOLDOWN_SECONDS = 20;
const WALK_SPEED_MIN = 20;
const WALK_SPEED_MAX = 60;
const NEED_SPEED_REFERENCE = 40;
const DNA_BASES = 'ABCD';
const DNA_LENGTH = 12;
const PROTEIN_LETTERS = 'ABCDE';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function createBush(properties) {
  return {
    kind: 'food', ...properties,
    fruits: [[-0.43, -0.09], [0.2, -0.43], [0.5, 0.05], [-0.03, 0.25], [0.31, 0.42]]
      .map(([dx, dy]) => ({ dx, dy, regrowAt: 0 })),
  };
}

function seededRandom(seed = 1) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}


function randomDNA(random = Math.random) {
  return Array.from({ length: DNA_LENGTH }, () => DNA_BASES[Math.floor(random() * DNA_BASES.length)]).join('');
}

function dnaToProtein(dna) {
  if (!/^[ABCD]{12}$/.test(dna)) throw new Error('DNA must contain exactly 12 A/B/C/D bases');
  const baseValue = { A: 0, B: 1, C: 2, D: 3 };
  const protein = [];
  for (let index = 0; index < DNA_LENGTH; index += 3) {
    const sum = dna.slice(index, index + 3).split('').reduce((total, base) => total + baseValue[base], 0);
    const letterIndex = sum === 0 ? 4 : sum <= 2 ? 3 : sum <= 4 ? 2 : sum <= 6 ? 1 : 0;
    protein.push(PROTEIN_LETTERS[letterIndex]);
  }
  return protein.join('');
}

function proteinToEyesight(protein) {
  const values = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const average = protein.split('').reduce((sum, letter) => sum + values[letter], 0) / 4;
  return 150 + ((average - 1) / 4) * 150;
}

function proteinToHungerRecognitionThreshold(protein) {
  const values = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const average = protein.split('').reduce((sum, letter) => sum + values[letter], 0) / 4;
  return 50 + ((average - 1) / 4) * 25;
}

function proteinToSpeed(protein) {
  const values = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const average = protein.split('').reduce((sum, letter) => sum + values[letter], 0) / 4;
  return WALK_SPEED_MIN + ((average - 1) / 4) * (WALK_SPEED_MAX - WALK_SPEED_MIN);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(value => Math.round(255 * value).toString(16).padStart(2, '0')).join('');
}

function proteinToColor(protein) {
  if (protein === 'EEEE') return '#ff0000';
  const values = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  const index = protein.split('').reduce((total, letter) => total * 5 + values[letter], 0);
  return hslToHex((index / 624) * 360, 72, 54);
}

class Simulation {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.width = WORLD_WIDTH;
    this.height = WORLD_HEIGHT;
    this.nextResourceId = 7;
    this.nextId = 1;
    this.blobbies = [];
    this.blubbys = [];
    this.robbys = [];
    this.deaths = [];
    this.lakes = [
      { id: 'lake-1', kind: 'water', x: 233, y: 246, rx: 120, ry: 79, phase: 0.3 },
      { id: 'lake-2', kind: 'water', x: 943, y: 234, rx: 111, ry: 88, phase: 1.9 },
      { id: 'lake-3', kind: 'water', x: 767, y: 593, rx: 93, ry: 66, phase: 3.4 },
    ];
    this.bushes = [
      { id: 'bush-1', kind: 'food', x: 454, y: 164, radius: 27 },
      { id: 'bush-2', kind: 'food', x: 676, y: 280, radius: 25 },
      { id: 'bush-3', kind: 'food', x: 224, y: 562, radius: 28 },
      { id: 'bush-4', kind: 'food', x: 475, y: 556, radius: 25 },
      { id: 'bush-5', kind: 'food', x: 1054, y: 548, radius: 27 },
      { id: 'bush-6', kind: 'food', x: 1014, y: 91, radius: 22 },
    ].map(createBush);
    const first = this.spawn(595, 414);
    first.hunger = 43;
    first.thirst = 38;
  }

  get creatures() { return [...this.blobbies, ...this.blubbys, ...this.robbys]; }

  get livingCount() { return this.blobbies.length + this.blubbys.length + this.robbys.length; }

  isLand(x, y, padding = BLOBBY_SIZE / 2 + 2) {
    return x >= MARGIN && x <= this.width - MARGIN && y >= MARGIN && y <= this.height - MARGIN &&
      !this.lakes.some(lake => ((x - lake.x) / (lake.rx + padding)) ** 2 + ((y - lake.y) / (lake.ry + padding)) ** 2 < 1);
  }

  landPoint(x, y) {
    let point = { x: clamp(x, MARGIN, this.width - MARGIN), y: clamp(y, MARGIN, this.height - MARGIN) };
    if (!this.isLand(point.x, point.y)) {
      const original = point;
      let found = false;
      for (let radius = 15; radius <= Math.hypot(this.width, this.height) && !found; radius += 15) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const candidate = { x: original.x + Math.cos(angle) * radius, y: original.y + Math.sin(angle) * radius };
          if (this.isLand(candidate.x, candidate.y)) { point = candidate; found = true; break; }
        }
      }
      if (!found) return null;
    }
    return point;
  }

  spawn(x, y, color = null, dna = null) {
    if (this.livingCount >= MAX_LIVING_BLOBBIES) return null;
    const point = this.landPoint(x ?? this.width / 3 + this.random() * this.width / 3, y ?? this.height * (290 + this.random() * 220) / WORLD_HEIGHT);
    if (!point) return null;
    const genes = dna || { colortien: randomDNA(this.random), speedtien: randomDNA(this.random), eyetien: randomDNA(this.random) };
    // Keep backwards compatibility with older saved/constructed DNA objects.
    genes.eyetien ||= randomDNA(this.random);
    const colortien = dnaToProtein(genes.colortien);
    const speedtien = dnaToProtein(genes.speedtien);
    const eyetien = dnaToProtein(genes.eyetien);
    const expressedColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : proteinToColor(colortien);
    const expressedSpeed = proteinToSpeed(speedtien);
    const expressedEyesight = proteinToEyesight(eyetien);
    const hungerRecognitionThreshold = proteinToHungerRecognitionThreshold(eyetien);
    const blobby = {
      id: this.nextId++, ...point,
      hunger: 18 + this.random() * 25, thirst: 20 + this.random() * 24,
      eyesight: expressedEyesight, speed: expressedSpeed,
      hungerRecognitionThreshold,
      dna: { colortien: genes.colortien, speedtien: genes.speedtien, eyetien: genes.eyetien },
      proteins: { colortien, speedtien, eyetien },
      state: 'wandering', target: null, destination: null,
      wait: 0, eatProgress: 0, direction: { x: 0.7, y: 0.2 },
      phase: this.random() * Math.PI * 2,
      avoidanceSide: this.random() < 0.5 ? -1 : 1,
      color: expressedColor,
      lastFedAt: -Infinity,
      lastDrankAt: -Infinity,
      lastMatedAt: -Infinity,
      mate: null,
      matingUntil: 0,
      birthPending: false,
    };
    this.blobbies.push(blobby);
    this.pickDirection(blobby);
    return blobby;
  }

  spawnBlubby(x, y, dna = null, color = null) {
    if (this.livingCount >= MAX_LIVING_BLOBBIES) return null;
    const point = this.landPoint(x ?? this.width / 3 + this.random() * this.width / 3, y ?? this.height * (290 + this.random() * 220) / WORLD_HEIGHT);
    if (!point) return null;
    const genes = dna || { colortien: randomDNA(this.random), speedtien: randomDNA(this.random), eyetien: randomDNA(this.random) };
    genes.eyetien ||= randomDNA(this.random);
    const colortien = dnaToProtein(genes.colortien);
    const speedtien = dnaToProtein(genes.speedtien);
    const eyetien = dnaToProtein(genes.eyetien);
    const blubby = {
      id: this.nextId++, species: 'blubby', ...point,
      hunger: 20 + this.random() * 25, thirst: 20 + this.random() * 24,
      eyesight: proteinToEyesight(eyetien) * BLUBBY_EYESIGHT_MULTIPLIER,
      speed: proteinToSpeed(speedtien),
      hungerRecognitionThreshold: proteinToHungerRecognitionThreshold(eyetien),
      dna: { colortien: genes.colortien, speedtien: genes.speedtien, eyetien: genes.eyetien },
      proteins: { colortien, speedtien, eyetien },
      state: 'hunting', target: null, destination: null, wait: 0, eatProgress: 0,
      direction: { x: 0.7, y: 0.2 }, phase: this.random() * Math.PI * 2, avoidanceSide: this.random() < 0.5 ? -1 : 1,
      color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : proteinToColor(colortien), lastFedAt: -Infinity, lastDrankAt: -Infinity, prey: null,
    };
    this.blubbys.push(blubby);
    this.pickDirection(blubby);
    return blubby;
  }

  spawnRobby(x, y, dna = null, color = null) {
    if (this.livingCount >= MAX_LIVING_BLOBBIES) return null;
    const genes = dna || { colortien: randomDNA(this.random), speedtien: randomDNA(this.random), eyetien: randomDNA(this.random) };
    const robby = this.spawn(x, y, color, { colortien: genes.colortien, speedtien: genes.speedtien, eyetien: genes.eyetien });
    if (!robby) return null;
    this.blobbies = this.blobbies.filter(item => item !== robby);
    robby.species = 'robby';
    robby.hunger = 25 + this.random() * 20;
    robby.teamAttackProgress = 0;
    this.robbys.push(robby);
    return robby;
  }

  spawnMany(count, { x, y, color = null, species = 'blobby' } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_SPAWN || !['blobby','blubby','robby'].includes(species)) return [];
    const amount = Math.min(count, MAX_BLOBBIES - this.livingCount);
    const spawned = [];
    for (let i = 0; i < amount; i++) {
      const angle = this.random() * Math.PI * 2;
      const spread = i === 0 ? 0 : Math.sqrt(this.random()) * 100;
      const px = x === undefined ? undefined : x + Math.cos(angle) * spread;
      const py = y === undefined ? undefined : y + Math.sin(angle) * spread;
      const creature = species === 'blubby' ? this.spawnBlubby(px, py, null, color)
        : species === 'robby' ? this.spawnRobby(px, py, null, color) : this.spawn(px, py, color);
      if (creature) spawned.push(creature);
    }
    return spawned;
  }

  resetJourneys() {
    for (const blobby of this.creatures) {
      const point = this.landPoint(blobby.x, blobby.y);
      if (point) Object.assign(blobby, point);
      const mating = blobby.state === 'mating' && blobby.mate && blobby.mate.state !== 'dead';
      if (!mating) { blobby.mate = null; blobby.matingUntil = 0; blobby.birthPending = false; }
      blobby.prey = null;
      blobby.target = null;
      blobby.state = mating ? 'mating' : 'wandering';
      blobby.eatProgress = 0;
      blobby.wait = 0;
      if (mating) blobby.destination = null; else this.pickDirection(blobby);
    }
  }

  resizeWorld(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 400 || width > 2400 || height < 300 || height > 1600) return false;
    const sx = width / this.width;
    const sy = height / this.height;
    this.width = width; this.height = height;
    for (const resource of [...this.bushes, ...this.lakes]) {
      resource.x *= sx; resource.y *= sy;
      if (resource.kind === 'water') { resource.rx *= sx; resource.ry *= sy; }
    }
    for (const blobby of this.creatures) { blobby.x *= sx; blobby.y *= sy; }
    this.resetJourneys();
    return true;
  }

  addBush(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const radius = 25;
    x = clamp(x, MARGIN + radius, this.width - MARGIN - radius);
    y = clamp(y, MARGIN + radius, this.height - MARGIN - radius);
    if (!this.isLand(x, y, radius + 12) || this.bushes.some(bush => Math.hypot(x - bush.x, y - bush.y) < radius + bush.radius + 8)) return null;
    const bush = createBush({ id: `bush-${this.nextResourceId++}`, x, y, radius });
    this.bushes.push(bush);
    return bush;
  }

  addLake(x, y, size = 85) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size < 30 || size > 160) return null;
    const rx = Math.min(size, (this.width - MARGIN * 2) / 2);
    const ry = Math.min(size * 0.72, (this.height - MARGIN * 2) / 2);
    x = clamp(x, MARGIN + rx, this.width - MARGIN - rx);
    y = clamp(y, MARGIN + ry, this.height - MARGIN - ry);
    if (this.lakes.some(lake => ((x - lake.x) / (rx + lake.rx + 20)) ** 2 + ((y - lake.y) / (ry + lake.ry + 20)) ** 2 < 1) ||
        this.bushes.some(bush => ((x - bush.x) / (rx + bush.radius + 12)) ** 2 + ((y - bush.y) / (ry + bush.radius + 12)) ** 2 < 1)) return null;
    const lake = { id: `lake-${this.nextResourceId++}`, kind: 'water', x, y, rx, ry, phase: this.random() * Math.PI * 2 };
    this.lakes.push(lake);
    this.resetJourneys();
    return lake;
  }

  resourceAt(x, y) {
    return [...this.bushes, ...this.lakes].find(resource => resource.kind === 'food'
      ? Math.hypot(x - resource.x, y - resource.y) <= resource.radius + 8
      : ((x - resource.x) / resource.rx) ** 2 + ((y - resource.y) / resource.ry) ** 2 <= 1) ?? null;
  }

  removeResource(resource) {
    const resources = resource?.kind === 'food' ? this.bushes : this.lakes;
    const index = resources.indexOf(resource);
    if (index === -1) return false;
    resources.splice(index, 1);
    for (const blobby of this.creatures) {
      if (blobby.target === resource) {
        blobby.target = null; blobby.state = 'wandering'; blobby.wait = 0; blobby.eatProgress = 0;
        this.pickDirection(blobby);
      }
    }
    return true;
  }

  resourceDistance(blobby, resource) {
    if (resource.kind === 'food') return Math.max(0, distance(blobby, resource) - resource.radius);
    const angle = Math.atan2((blobby.y - resource.y) / resource.ry, (blobby.x - resource.x) / resource.rx);
    return Math.max(0, distance(blobby, { x: resource.x + Math.cos(angle) * resource.rx, y: resource.y + Math.sin(angle) * resource.ry }));
  }

  findVisibleResource(blobby, need) {
    const resources = need === 'food' ? this.bushes : this.lakes;
    let nearest = null;
    let closest = blobby.eyesight;
    for (const resource of resources) {
      if (resource.kind === 'food' && !this.hasFruit(resource)) continue;
      const gap = this.resourceDistance(blobby, resource);
      if (gap <= closest) { nearest = resource; closest = gap; }
    }
    return nearest;
  }

  hasFruit(bush) {
    return bush.fruits.some(fruit => fruit.regrowAt <= this.elapsed);
  }

  pickDirection(blobby) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const length = 85 + this.random() * 125;
      const x = clamp(blobby.x + Math.cos(angle) * length, MARGIN, this.width - MARGIN);
      const y = clamp(blobby.y + Math.sin(angle) * length, MARGIN, this.height - MARGIN);
      if (this.isLand(x, y) && Math.hypot(x - blobby.x, y - blobby.y) > 25) {
        blobby.destination = { x, y };
        return;
      }
    }
    blobby.destination = this.landPoint(this.width / 2, this.height / 2) ?? { x: blobby.x, y: blobby.y };
  }

  shorePoint(blobby, resource) {
    const angle = Math.atan2((blobby.y - resource.y) / resource.ry, (blobby.x - resource.x) / resource.rx);
    const padding = BLOBBY_SIZE / 2 + 7;
    return { x: resource.x + Math.cos(angle) * (resource.rx + padding), y: resource.y + Math.sin(angle) * (resource.ry + padding) };
  }

  move(blobby, point, step, wandering = false) {
    const dx = point.x - blobby.x;
    const dy = point.y - blobby.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining < 3) return true;
    const length = Math.min(remaining, blobby.speed * (wandering ? 0.72 : 1) * step);
    const base = Math.atan2(dy, dx);
    const side = blobby.avoidanceSide;
    for (const offset of [0, side * 0.45, side * 0.9, side * 1.35, side * 1.75, -side * 0.9, -side * 1.35, Math.PI]) {
      const vx = Math.cos(base + offset);
      const vy = Math.sin(base + offset);
      const x = blobby.x + vx * length;
      const y = blobby.y + vy * length;
      if (this.isLand(x, y)) {
        blobby.x = x; blobby.y = y;
        blobby.direction = { x: vx, y: vy };
        return remaining <= length + 3;
      }
    }
    if (wandering) this.pickDirection(blobby);
    return false;
  }

  recentlySated(blobby) {
    return this.elapsed - blobby.lastFedAt <= RECENTLY_SATED_SECONDS &&
      this.elapsed - blobby.lastDrankAt <= RECENTLY_SATED_SECONDS;
  }

  findMate(blobby) {
    if (blobby.species === 'robby' || !this.recentlySated(blobby) || blobby.mate || this.elapsed - blobby.lastMatedAt < MATING_COOLDOWN_SECONDS) return null;
    let nearest = null;
    let closest = blobby.eyesight;
    for (const candidate of this.blobbies) {
      if (candidate.species === 'robby' || candidate === blobby || candidate.state === 'dead' || candidate.mate || !this.recentlySated(candidate) || this.elapsed - candidate.lastMatedAt < MATING_COOLDOWN_SECONDS) continue;
      const gap = distance(blobby, candidate);
      if (gap <= closest) { nearest = candidate; closest = gap; }
    }
    return nearest;
  }

  inheritDNA(first, second) {
    const mix = (a, b) => {
      const firstDNA = /^[ABCD]{12}$/.test(a || '') ? a : randomDNA(this.random);
      const secondDNA = /^[ABCD]{12}$/.test(b || '') ? b : randomDNA(this.random);
      return Array.from({ length: DNA_LENGTH }, (_, index) => this.random() < 0.5 ? firstDNA[index] : secondDNA[index]).join('');
    };
    return {
      colortien: mix(first.dna.colortien, second.dna.colortien),
      speedtien: mix(first.dna.speedtien, second.dna.speedtien),
      eyetien: mix(first.dna.eyetien, second.dna.eyetien),
    };
  }

  finishMating(first, second) {
    if (!first || !second || first.state === 'dead' || second.state === 'dead' || first.mate !== second || second.mate !== first) return;
    first.mate = null; second.mate = null;
    first.lastMatedAt = this.elapsed;
    second.lastMatedAt = this.elapsed;
    first.matingUntil = 0; second.matingUntil = 0;
    first.birthPending = false; second.birthPending = false;
    first.state = 'resting'; second.state = 'resting';
    first.wait = 1.5 + this.random() * 2; second.wait = 1.5 + this.random() * 2;
    const babyDNA = this.inheritDNA(first, second);
    const baby = this.spawn((first.x + second.x) / 2, (first.y + second.y) / 2, null, babyDNA);
    if (baby) {
      // Keep the existing inherited Walk Speed behavior: the phenotype is the average of both parents.
      // Speedtien DNA is still inherited independently and can be used for future genetic experiments.
      const firstGeneticSpeed = proteinToSpeed(first.proteins.speedtien);
      const secondGeneticSpeed = proteinToSpeed(second.proteins.speedtien);
      const parentsUseGeneticSpeed =
        first.proteins.speedtien === dnaToProtein(first.dna.speedtien) &&
        second.proteins.speedtien === dnaToProtein(second.dna.speedtien) &&
        Math.abs(first.speed - firstGeneticSpeed) < 0.001 &&
        Math.abs(second.speed - secondGeneticSpeed) < 0.001;
      baby.speed = parentsUseGeneticSpeed ? proteinToSpeed(baby.proteins.speedtien) : (first.speed + second.speed) / 2;
      baby.hunger = 15 + this.random() * 10;
      baby.thirst = 15 + this.random() * 10;
      baby.state = 'resting';
      baby.wait = 2 + this.random() * 2;
      baby.destination = null;
      baby.mate = null;
    }
  }

  startMating(first, second) {
    first.mate = second;
    second.mate = first;
    first.state = 'mating';
    second.state = 'mating';
    first.target = null; second.target = null;
    first.destination = null; second.destination = null;
    const delay = MATING_MIN_SECONDS + this.random() * (MATING_MAX_SECONDS - MATING_MIN_SECONDS);
    first.matingUntil = this.elapsed + delay;
    second.matingUntil = first.matingUntil;
    first.birthPending = true;
    second.birthPending = true;
  }

  update(delta) {
    // Small fixed-size substeps keep movement and needs consistent at every speed.
    let remaining = Math.max(0, Math.min(delta, 2));
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 0.05);
      this.elapsed += step;
      for (const blobby of this.blobbies) this.updateBlobby(blobby, step);
      for (const robby of this.robbys) this.updateRobby(robby, step);
      for (const blubby of this.blubbys) this.updateBlubbyPredator(blubby, step);
      this.blobbies = this.blobbies.filter(blobby => blobby.state !== 'dead');
      this.robbys = this.robbys.filter(robby => robby.state !== 'dead');
      this.blubbys = this.blubbys.filter(blubby => blubby.state !== 'dead');
      remaining -= step;
    }
  }

  findPrey(blubby) {
    let nearest = null;
    let closest = blubby.eyesight;
    for (const prey of this.blobbies) {
      if (prey.species === 'robby') continue;
      if (prey.state === 'dead') continue;
      const gap = distance(blubby, prey);
      if (gap <= closest) { nearest = prey; closest = gap; }
    }
    return nearest;
  }

  updateRobby(robby, step) {
    if (robby.state === 'dead') return;
    // Three nearby Robbys can overwhelm a Blubby together.
    const target = this.blubbys.filter(b => b.state !== 'dead')
      .map(b => ({ blubby: b, nearby: this.robbys.filter(r => r.state !== 'dead' && distance(r, b) <= 105) }))
      .filter(entry => entry.nearby.length >= 3)
      .sort((a, b) => distance(robby, a.blubby) - distance(robby, b.blubby))[0];
    if (target && distance(robby, target.blubby) <= robby.eyesight + 100) {
      const needRateMultiplier = robby.speed / NEED_SPEED_REFERENCE;
      robby.hunger = clamp(robby.hunger + step * 0.95 * needRateMultiplier, 0, 100);
      robby.thirst = clamp(robby.thirst + step * 1.2 * needRateMultiplier, 0, 100);
      if (robby.hunger >= 100 || robby.thirst >= 100) {
        robby.state = 'dead'; robby.deathCause = robby.hunger >= 100 ? 'hunger' : 'thirst';
        robby.target = null;
        this.deaths.push({ id: robby.id, cause: robby.deathCause, species: 'robby' });
        return;
      }
      robby.state = 'team_hunting';
      this.move(robby, target.blubby, step);
      target.blubby.teamAttackProgress = (target.blubby.teamAttackProgress || 0) + step;
      if (target.blubby.teamAttackProgress >= 2.0 && target.blubby.state !== 'dead') {
        target.blubby.state = 'dead'; target.blubby.deathCause = 'robby_team';
        this.deaths.push({ id: target.blubby.id, cause: 'devoured by three Robbys', species: 'blubby' });
        for (const teammate of target.nearby) teammate.hunger = Math.max(0, teammate.hunger - 15);
        target.blubby.teamAttackProgress = 0;
      }
      return;
    }
    // Robbys otherwise behave like small meadow residents.
    this.updateBlobby(robby, step);
  }

  updateBlubbyPredator(blubby, step) {
    if (blubby.state === 'dead') return;
    const needRateMultiplier = blubby.speed / NEED_SPEED_REFERENCE;
    blubby.hunger = clamp(blubby.hunger + step * 0.95 * needRateMultiplier, 0, 100);
    blubby.thirst = clamp(blubby.thirst + step * 1.2 * needRateMultiplier, 0, 100);
    if (blubby.hunger >= 100 || blubby.thirst >= 100) {
      blubby.state = 'dead';
      blubby.deathCause = blubby.hunger >= 100 ? 'hunger' : 'thirst';
      this.deaths.push({ id: blubby.id, cause: blubby.deathCause, species: 'blubby' });
      return;
    }
    if (blubby.state === 'eating_prey') {
      blubby.eatProgress += step;
      if (blubby.eatProgress >= FRUIT_EAT_SECONDS) {
        if (blubby.prey && blubby.prey.state !== 'dead') {
          blubby.prey.state = 'dead';
          blubby.prey.deathCause = 'predation';
          this.deaths.push({ id: blubby.prey.id, cause: 'predation', species: 'blobby' });
          blubby.hunger = Math.max(0, blubby.hunger - BLUBBY_PREY_HUNGER_NUTRITION);
          blubby.lastFedAt = this.elapsed;
        }
        blubby.prey = null; blubby.target = null; blubby.eatProgress = 0; blubby.state = 'hunting';
      }
      return;
    }
    if (blubby.state === 'drinking') {
      blubby.thirst = Math.max(0, blubby.thirst - step * 34);
      if (blubby.thirst <= 5) { blubby.target = null; blubby.state = 'hunting'; blubby.wait = 0.5; }
      return;
    }
    if (blubby.prey && blubby.prey.state !== 'dead') {
      const gap = distance(blubby, blubby.prey);
      if (gap <= BLOBBY_SIZE + 7) { blubby.state = 'eating_prey'; blubby.eatProgress = 0; return; }
      this.move(blubby, blubby.prey, step);
      return;
    }
    blubby.prey = null;
    const hungerThreshold = blubby.hungerRecognitionThreshold ?? NEED_THRESHOLD;
    const needsFood = blubby.hunger >= hungerThreshold;
    if (needsFood) {
      const prey = this.findPrey(blubby);
      if (prey) { blubby.prey = prey; blubby.target = prey; blubby.state = 'hunting'; this.move(blubby, prey, step); return; }
    }
    if (blubby.thirst >= NEED_THRESHOLD) {
      blubby.target = this.findVisibleResource(blubby, 'water');
      if (blubby.target) {
        const point = this.shorePoint(blubby, blubby.target);
        if (distance(blubby, point) <= 5) blubby.state = 'drinking'; else { blubby.state = 'seeking_water'; this.move(blubby, point, step); }
        return;
      }
    }
    blubby.state = blubby.wait > 0 ? 'resting' : 'hunting';
    if (blubby.wait > 0) { blubby.wait -= step; return; }
    if (!blubby.destination || this.move(blubby, blubby.destination, step, true)) { this.pickDirection(blubby); blubby.wait = 0.6 + this.random() * 2; }
  }

  updateBlobby(blobby, step) {
    if (blobby.state === 'dead') return;
    const needRateMultiplier = blobby.speed / NEED_SPEED_REFERENCE;
    blobby.hunger = clamp(blobby.hunger + step * 0.95 * needRateMultiplier, 0, 100);
    blobby.thirst = clamp(blobby.thirst + step * 1.2 * needRateMultiplier, 0, 100);

    // Reaching either limit is fatal, before movement or another bite/drink.
    if (blobby.hunger >= 100 || blobby.thirst >= 100) {
      blobby.state = 'dead';
      blobby.deathCause = blobby.hunger >= 100 ? 'hunger' : 'thirst';
      blobby.target = null;
      blobby.destination = null;
      this.deaths.push({ id: blobby.id, cause: blobby.deathCause, ...(blobby.species ? { species: blobby.species } : {}) });
      return;
    }

    // Fruit belongs to the bush, so multiple Blobbies share the same supply.
    if (blobby.target?.kind === 'food' && this.resourceDistance(blobby, blobby.target) <= blobby.eyesight && !this.hasFruit(blobby.target)) {
      blobby.target = null;
      blobby.eatProgress = 0;
      blobby.state = 'wandering';
      this.pickDirection(blobby);
    }

    if (blobby.state === 'eating' || blobby.state === 'drinking') {
      const key = blobby.state === 'eating' ? 'hunger' : 'thirst';
      if (key === 'hunger') {
        blobby.eatProgress += step;
        if (blobby.eatProgress >= FRUIT_EAT_SECONDS) {
          const fruit = blobby.target.fruits.find(item => item.regrowAt <= this.elapsed);
          if (fruit) {
            fruit.regrowAt = this.elapsed + FRUIT_REGROW_SECONDS;
            blobby.hunger = Math.max(0, blobby.hunger - FRUIT_NUTRITION);
            blobby.lastFedAt = this.elapsed;
          }
          blobby.eatProgress = 0;
        }
      } else {
        const before = blobby.thirst;
        blobby.thirst = Math.max(0, blobby.thirst - step * 34);
        if (blobby.thirst < before) blobby.lastDrankAt = this.elapsed;
      }
      if (blobby[key] <= 5) {
        blobby.target = null;
        blobby.eatProgress = 0;
        blobby.state = 'wandering';
        blobby.wait = 0.7 + this.random();
        this.pickDirection(blobby);
      }
      return;
    }

    if (blobby.state === 'mating') {
      if (!blobby.mate || blobby.mate.state === 'dead') {
        blobby.mate = null;
        blobby.birthPending = false;
        blobby.matingUntil = 0;
        blobby.state = 'wandering';
        this.pickDirection(blobby);
        return;
      }
      const mate = blobby.mate;
      const gap = distance(blobby, mate);
      if (gap > BLOBBY_SIZE + 5) {
        this.move(blobby, mate, step);
      }
      if (blobby === mate.mate && this.elapsed >= blobby.matingUntil) {
        this.finishMating(blobby, mate);
      }
      return;
    }

    if (blobby.mate) return;

    const mate = this.findMate(blobby);
    if (mate) {
      blobby.state = 'seeking_mate';
      blobby.target = mate;
      const gap = distance(blobby, mate);
      if (gap <= BLOBBY_SIZE + 7) this.startMating(blobby, mate);
      else this.move(blobby, mate, step);
      return;
    }

    if (blobby.target && blobby.state === 'seeking_mate') {
      if (blobby.target.state === 'dead' || !this.recentlySated(blobby.target)) {
        blobby.target = null;
        blobby.state = 'wandering';
        this.pickDirection(blobby);
        return;
      }
      const gap = distance(blobby, blobby.target);
      if (gap <= BLOBBY_SIZE + 7) this.startMating(blobby, blobby.target);
      else this.move(blobby, blobby.target, step);
      return;
    }

    if (blobby.target) {
      // Finish the current journey before choosing another need, avoiding indecision.
      const point = blobby.target.kind === 'water' ? this.shorePoint(blobby, blobby.target) : blobby.target;
      const gap = blobby.target.kind === 'water' ? distance(blobby, point) : distance(blobby, point) - blobby.target.radius;
      if (gap <= (blobby.target.kind === 'water' ? 5 : BLOBBY_SIZE / 2 + 4)) {
        blobby.state = blobby.target.kind === 'food' ? 'eating' : 'drinking';
        blobby.eatProgress = 0;
      } else this.move(blobby, point, step);
      return;
    }

    const hungerThreshold = blobby.hungerRecognitionThreshold ?? NEED_THRESHOLD;
    const need = blobby.thirst >= NEED_THRESHOLD && blobby.thirst >= blobby.hunger ? 'water' : blobby.hunger >= hungerThreshold ? 'food' : blobby.thirst >= NEED_THRESHOLD ? 'water' : null;
    if (need) {
      blobby.wait = 0;
      blobby.target = this.findVisibleResource(blobby, need);
      if (blobby.target) {
        blobby.state = need === 'food' ? 'seeking_food' : 'seeking_water';
        return;
      }
      blobby.state = need === 'food' ? 'searching_food' : 'searching_water';
    } else {
      blobby.state = blobby.wait > 0 ? 'resting' : 'wandering';
      if (blobby.wait > 0) { blobby.wait -= step; return; }
    }

    if (!blobby.destination || this.move(blobby, blobby.destination, step, !need)) {
      this.pickDirection(blobby);
      if (!need) blobby.wait = 0.6 + this.random() * 2;
    }
  }
}

const BEHAVIOR_LABELS = {
  wandering: 'Exploring the meadow', resting: 'Enjoying a little moment',
  searching_food: 'Looking for a berry bush', searching_water: 'Looking for a lake',
  seeking_food: 'On the way to a snack', seeking_water: 'On the way to a drink',
  seeking_mate: 'Looking for a mate', mating: 'Making a new little Blobby',
  hunting: 'Hunting Blobbies', eating_prey: 'Eating a Blobby', team_hunting: 'Teaming up against a Blubby', seeking_robby: 'Looking for emergency food',
  eating: 'Munching on berries', drinking: 'Having a little drink',
};

globalThis.BlobbyLife = Object.freeze({
  WORLD_WIDTH, WORLD_HEIGHT, NEED_THRESHOLD, BLOBBY_SIZE, WALK_SPEED_MIN, WALK_SPEED_MAX, DNA_LENGTH, MAX_LIVING_BLOBBIES, MAX_BATCH_SPAWN, BLUBBY_EYESIGHT_MULTIPLIER, BLUBBY_PREY_HUNGER_NUTRITION,
  randomDNA, dnaToProtein, proteinToColor, proteinToSpeed, proteinToEyesight, proteinToHungerRecognitionThreshold,
  FRUIT_REGROW_SECONDS, FRUIT_EAT_SECONDS, FRUIT_NUTRITION,
  RECENTLY_SATED_SECONDS, MATING_MIN_SECONDS, MATING_MAX_SECONDS,
  MAX_BLOBBIES, MAX_SPAWN, DEFAULT_COLOR,
  createBush, seededRandom, Simulation, BEHAVIOR_LABELS,
});
})();
