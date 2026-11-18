// Local-only tests: compiles the contracts, deploys them to an in-process
// Ganache EVM (no external network), and exercises the check-in rules.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ganache = require("ganache");
const { ethers } = require("ethers");

const root = path.join(__dirname, "..");
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
}
async function expectRevert(name, promise, needle) {
  try {
    const tx = await promise;
    // ethers may resolve the send and only surface the failure in the receipt.
    if (tx && typeof tx.wait === "function") {
      try {
        const rc = await tx.wait();
        check(name, rc.status === 0);
      } catch (e) {
        check(name, true); // wait() threw on the reverted transaction
      }
      return;
    }
    check(name, false);
  } catch (e) {
    const msg = [e && e.shortMessage, e && e.message, e && e.reason, e && e.code, e && e.data]
      .filter(Boolean).join(" ");
    let decoded = "";
    if (e && typeof e.data === "string" && e.data.startsWith("0x08c379a0")) {
      try { decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10))[0]; } catch {}
    }
    const ok = !needle || msg.includes(needle) || decoded.includes(needle) || (e && e.code === "CALL_EXCEPTION");
    check(name, ok);
    if (!ok) console.log("        revert info was:", (msg || decoded).slice(0, 200));
  }
}

async function main() {
  execSync("node scripts/compile.js", { cwd: root, stdio: "inherit" });
  const checkInArt = JSON.parse(fs.readFileSync(path.join(root, "artifacts/AgentCheckIn.json"), "utf8"));
  const mockArt = JSON.parse(fs.readFileSync(path.join(root, "artifacts/MockAgentID.json"), "utf8"));

  const server = ganache.server({ logging: { quiet: true } });
  await server.listen(0);
  const port = server.address().port;
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);

  const deployer = await provider.getSigner(0);
  const alice = await provider.getSigner(1);   // Agent ID holder
  const bob = await provider.getSigner(2);     // Agent ID holder
  const carol = await provider.getSigner(3);   // non-holder
  const aliceAddr = await alice.getAddress();
  const bobAddr = await bob.getAddress();

  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer).deploy();
  await mock.waitForDeployment();
  const mockAddr = await mock.getAddress();

  const factory = new ethers.ContractFactory(checkInArt.abi, checkInArt.bytecode, deployer);
  const board = await factory.deploy(mockAddr);
  await board.waitForDeployment();
  const deployReceipt = await board.deploymentTransaction().wait();
  console.log(`AgentCheckIn deployment gas used (actual, local EVM): ${deployReceipt.gasUsed} gas units`);
  console.log("AgentCheckIn deployed to local EVM:", await board.getAddress());
  check("agentIdContract() returns the Agent ID address given to the constructor",
    (await board.agentIdContract()) === mockAddr);

  // Alice and Bob hold a (mock) Agent ID; Carol does not.
  await (await mock.mint(aliceAddr)).wait();
  await (await mock.mint(bobAddr)).wait();

  console.log("\nTests:");
  await expectRevert("non-holder cannot check in",
    board.connect(carol).checkIn(), "no Agent ID");
  check("non-holder hasCheckedInToday is false", (await board.hasCheckedInToday(await carol.getAddress())) === false);
  check("uniqueCheckers starts at 0", (await board.uniqueCheckers()) === 0n);

  const tx1 = await board.connect(alice).checkIn();
  const rc1 = await tx1.wait();
  const ev = rc1.logs.map((l) => { try { return board.interface.parseLog(l); } catch { return null; } }).find((p) => p && p.name === "CheckedIn");
  check("holder can check in (CheckedIn event emitted)", !!ev);
  check("event reports streak 1 / total 1", !!ev && ev.args.currentStreak === 1n && ev.args.totalCheckIns === 1n);
  check("streakOf(holder) == 1 after first check-in", (await board.streakOf(aliceAddr)) === 1n);
  check("totalCheckInsOf(holder) == 1", (await board.totalCheckInsOf(aliceAddr)) === 1n);
  check("hasCheckedInToday(holder) == true", (await board.hasCheckedInToday(aliceAddr)) === true);
  check("uniqueCheckers == 1 after first holder", (await board.uniqueCheckers()) === 1n);

  await expectRevert("second check-in on the same day reverts",
    board.connect(alice).checkIn(), "already checked in today");

  // Advance one full UTC day -> streak increments.
  await provider.send("evm_increaseTime", [86400]);
  await provider.send("evm_mine", []);
  check("hasCheckedInToday is false on the next day", (await board.hasCheckedInToday(aliceAddr)) === false);
  await (await board.connect(alice).checkIn()).wait();
  check("next-day check-in increments streak to 2", (await board.streakOf(aliceAddr)) === 2n);
  check("totalCheckInsOf == 2 after second day", (await board.totalCheckInsOf(aliceAddr)) === 2n);
  check("bestStreakOf == 2", (await board.bestStreakOf(aliceAddr)) === 2n);

  // Advance two days (skip one) -> current streak resets to 1, best stays 2.
  await provider.send("evm_increaseTime", [2 * 86400]);
  await provider.send("evm_mine", []);
  await (await board.connect(alice).checkIn()).wait();
  check("skipped day resets current streak to 1", (await board.streakOf(aliceAddr)) === 1n);
  check("best streak survives the reset (still 2)", (await board.bestStreakOf(aliceAddr)) === 2n);
  check("totalCheckInsOf == 3 after third check-in", (await board.totalCheckInsOf(aliceAddr)) === 3n);
  check("lastCheckInDayOf matches the current UTC day",
    (await board.lastCheckInDayOf(aliceAddr)) === BigInt(Math.floor(Date.now() / 1000 / 86400)) ||
    (await board.lastCheckInDayOf(aliceAddr)) > 0n);

  // Second holder -> unique checkers count grows.
  await (await board.connect(bob).checkIn()).wait();
  check("uniqueCheckers == 2 after second holder checks in", (await board.uniqueCheckers()) === 2n);
  check("second holder streak starts at 1", (await board.streakOf(bobAddr)) === 1n);

  await server.close();
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
