require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Use the solc package from node_modules (solcjs) so compilation works offline.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    const compilerPath = require.resolve("solc/soljson.js");
    return { compilerPath, isSolcJs: true, version: "0.8.24", longVersion: "0.8.24" };
  }
  return runSuper();
});

/** Local development network only (Hardhat Network). No public networks are configured on purpose. */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  gasReporter: { enabled: true, currency: "USD", offline: true },
};
