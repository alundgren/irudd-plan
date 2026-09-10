import { loadCompanionConfig } from "../src/companion/config.js";
import { initializeCompanion, runCompanion } from "../src/companion/run.js";
import { CompanionJournal, resolveAttempt } from "../src/companion/state.js";

const [command, configPath, operationId, outcome] = process.argv.slice(2);
if (!configPath || !["init", "run", "resolve"].includes(command ?? ""))
  throw new Error(
    "Usage: companion init|run <config.json>, or companion resolve <config.json> <operationId> queued|not-queued",
  );
const config = await loadCompanionConfig(configPath);
const journal = new CompanionJournal(config);
const unlock = await journal.lock();
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (command === "init") await initializeCompanion(config, journal);
  else if (command === "run")
    await runCompanion(config, journal, controller.signal);
  else {
    if (!operationId || (outcome !== "queued" && outcome !== "not-queued"))
      throw new Error(
        "Specify the uncertain operation and its verified outcome: queued or not-queued",
      );
    const state = await journal.read();
    if (!state) throw new Error("No companion state exists");
    await journal.write(resolveAttempt(state, operationId, outcome));
    console.log(
      "Recorded the operator's delivery decision. Run the companion to continue.",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Companion failed");
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await unlock();
}
