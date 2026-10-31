// Node tests use the same classic script as the browser.
import './simulation.js';
export const {
  WORLD_WIDTH, WORLD_HEIGHT, NEED_THRESHOLD, BLOBBY_SIZE, WALK_SPEED_MIN, WALK_SPEED_MAX, DNA_LENGTH,
  MAX_LIVING_BLOBBIES, MAX_BATCH_SPAWN, MAX_BLOBBIES, MAX_SPAWN, DEFAULT_COLOR,
  BLUBBY_EYESIGHT_MULTIPLIER, BLUBBY_PREY_HUNGER_NUTRITION,
  randomDNA, dnaToProtein, proteinToColor, proteinToSpeed, proteinToEyesight, proteinToHungerRecognitionThreshold,
  FRUIT_REGROW_SECONDS, FRUIT_EAT_SECONDS, FRUIT_NUTRITION,
  RECENTLY_SATED_SECONDS, MATING_MIN_SECONDS, MATING_MAX_SECONDS,
  createBush, seededRandom, Simulation, BEHAVIOR_LABELS,
} = globalThis.BlobbyLife;
