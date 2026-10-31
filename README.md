# Blobby Life — Circle of Life

A small, dependency-free browser life simulator in the original soft green meadow style, with the Circle of Life update’s DNA, inherited traits, reproduction, predators, group defense, and history graphs.

## Play

Double-click **index.html** to open and play in your browser. Keep `index.html`, `styles.css`, `simulation.js`, and `app.js` together in this folder. No server or installation is required.

You can also run `npm start` with Node.js installed and open **http://localhost:3000**. No package installation is required.

- Press **B** for one **Blobby**, **P** for a **Blubby**, or **R** for a **Robby** at your pointer. To add a batch, choose a species and a **Spawn amount** from 1 to 500, then click the spawn button. The cap is **500 per batch** and **10,000 living creatures in total**, shared by all three species and newborns. If fewer spaces remain, only that many will spawn. Spawns inside water move onto land.
- Colors come **from DNA** by default. Choose **Choose a color** for a visible color override. This changes appearance without changing inherited genes. Existing creatures can be recolored in their details, too.
- **Click or tap any creature** to see its hunger, thirst, activity, speed, eyesight, hunger-recognition threshold, and DNA/proteins. The DNA section can be collapsed. Click empty ground or press Escape to close the details.
- Press **Space** or use the pause button to pause/resume. Choose **1×, 2×, or 4×** simulation speed.
- Click the **reset arrow** for a fresh meadow.

## DNA and the circle of life

Each creature carries three independent 12-base DNA sequences using A/B/C/D. Groups of three bases translate into four-letter proteins using A–E. For example, `AAAAAAAAAAAA` translates to `EEEE`.

- **Colortien** expresses a color. `EEEE` expresses pure red.
- **Speedtien** expresses walk speed, from 20 to 60 units per second. Faster creatures get hungry and thirsty faster.
- **Eyetien** expresses eyesight from 150 to 300 units and a hunger-recognition threshold from 50% to 75%. Better eyesight comes with noticing hunger later. Blubbys have 1.5 times the expressed eyesight.

**Blobbies** eat berries, drink at lakes, and wander when the resources they need are out of sight. Two Blobbies that have both eaten and drunk within the last 20 simulation seconds can find each other and mate. A baby arrives after 10–15 simulation seconds, inherits each DNA base from either parent, and expresses its own traits. Parents have a 20-second mating cooldown. Visible color overrides do not replace inherited DNA.

**Blubbys** are larger, rounded predators. They hunt Blobbies and drink from lakes; each prey reduces hunger by 7.5 points.

**Robbys** are small, round grazers. Three nearby Robbys can team up to take down a Blubby. They also need food and water, including while defending the group.

The three **history graphs** below the meadow record total population, average walk speed, and average eyesight every simulation minute. They retain the latest 60 snapshots. Pausing or editing freezes sampling along with the simulation; resetting starts a new history.

## Edit the meadow

Click **Edit meadow** to enter editor mode. Life and berry regrowth freeze while you edit; leaving the editor restores the previous play/pause state.

- Choose **Add bush**, then click or tap clear land to plant a bush with five berries.
- Choose **Add lake**, set a lake size from 30 to 160, then click or tap a clear spot. Resources cannot overlap. Creatures underneath a new lake are moved onto land.
- Choose **Delete bush / lake**, then click or tap the resource to remove it. Creatures targeting it start looking again.
- Set **Width** (400–2400) and **Height** (300–1600), then click **Resize meadow**. Resource positions scale with the meadow. All species keep their DNA, colors, needs, and pending births.
- Choose **Inspect Blobby** to inspect or recolor a resident while time is frozen.
- Click **Done editing** or press Escape to return to the simulation. You can spawn new Blobbies while editing.

Editor changes apply to the current session. Reloading the page or resetting returns to the original meadow.

Needs rise over time. Creatures recognize thirst at 50% and hunger at their inherited threshold. Only resources within eyesight can be discovered; otherwise they wander and look again. Each bush has five berries. Eating one takes 0.65 seconds, removes it from the bush, and reduces hunger by 20 points. Each eaten berry regrows in the same spot after 18 simulation seconds. Grazers skip empty bushes and look elsewhere when another creature finishes the last berry. Regrowth pauses with the simulation and follows the selected speed. Lakes provide unlimited water.

If either hunger or thirst reaches 100%, Blobby dies immediately and disappears from the meadow. The population count updates, its details close if selected, and a brief message gives the cause of death. Death also applies while travelling, eating, drinking, or resting. Pausing freezes needs, so Blobbies cannot die while paused. If everyone dies, press B or click Spawn Blobby to add a new friend.

The game runs locally, works with mouse or touch, and resets on page reload. No accounts, downloads, or external assets are needed.

## Verification

Run `npm test` to check all three species, DNA/proteins, inheritance, births, hunting, team defense, history sampling, fruit regrowth, death, editor actions, resizing, colors, the separate spawn and living limits, and a simulation with 10,000 Blobbies. Node.js is needed only for these tests or the optional local server.
