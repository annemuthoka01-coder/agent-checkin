// Compiles the contracts with solc-js and writes artifacts to ./artifacts
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const root = path.join(__dirname, "..");
const sources = {
  "contracts/AgentCheckIn.sol": {
    content: fs.readFileSync(path.join(root, "contracts/AgentCheckIn.sol"), "utf8"),
  },
  "contracts/mocks/MockAgentID.sol": {
    content: fs.readFileSync(path.join(root, "contracts/mocks/MockAgentID.sol"), "utf8"),
  },
};

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.gasEstimates"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const e of output.errors) {
    console.log(e.formattedMessage);
    if (e.severity === "error") process.exitCode = 1;
  }
}
if (process.exitCode) process.exit(1);

const outDir = path.join(root, "artifacts");
fs.mkdirSync(outDir, { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify(
        { contractName: name, source: file, abi: c.abi, bytecode: "0x" + c.evm.bytecode.object, gasEstimates: c.evm.gasEstimates },
        null,
        2
      )
    );
    console.log(`compiled ${name} (${file}) -> artifacts/${name}.json, bytecode ${c.evm.bytecode.object.length / 2} bytes`);
  }
}
console.log("solc version:", solc.version());
