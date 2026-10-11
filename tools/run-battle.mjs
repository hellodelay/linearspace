// Runs the default scenario headless and prints the battle log.
// Usage: node tools/run-battle.mjs [--seed N] [--summary]
import { simulate } from '../src/sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup } from '../src/sim/battle.js';
import { formatLog } from '../src/sim/format.js';

const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : 481927;
const summary = args.includes('--summary');

const setup = buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment: DEFAULT_SCENARIO.defaultDeployment, seed });
const result = simulate(setup);
if (!summary) console.log(formatLog(result.log));
const alive = Object.entries(result.finalState).filter(([, u]) => u.alive).map(([id, u]) => `${id}:${u.hp}`);
console.log(`seed ${seed}  winner ${result.winner}  endTU ${result.endTU}  events ${result.log.length}  alive ${alive.join(' ')}`);
