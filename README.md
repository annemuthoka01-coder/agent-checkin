# Agent Check-In

A daily check-in board for **Binance Agent ID** holders, built for the
Binance Wallet × BNB Chain **Agent ID Hackathon**. One small contract on
BNB Chain (BSC): if your address holds an Agent ID, you can check in once
per UTC day and build a consecutive-day streak.

**Status: built and tested locally. Not yet deployed.** The frontend ships
with a placeholder contract address (see `app.js`).

## How Agent ID is core to this product

Agent ID is not decoration here — it *is* the access-control layer:

- The Agent ID contract on BSC is
  `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (SPACE ID Agent ID,
  ERC-721, non-transferable).
- `AgentCheckIn.checkIn()` calls `balanceOf(msg.sender)` on that contract
  and reverts unless the result is greater than zero. There is no other
  way in: no sign-ups, no allow-list maintained by us, no accounts.
- The use case is access control in its simplest form — an on-chain name
  that an agent wallet already owns decides who can participate.

## Contract design

`contracts/AgentCheckIn.sol` (Solidity ^0.8.20, no external dependencies —
the ERC-721 surface is a 3-line interface defined in the same file):

- Constructor takes the Agent ID contract address, stored as a public
  immutable (`agentIdContract`).
- `checkIn()` — gated as above; once per UTC day per address
  (`day = block.timestamp / 86400`). Updates:
  - `currentStreak` — +1 if yesterday was the last check-in day, else 1
  - `bestStreak`, `totalCheckIns`, `lastCheckInDay`
  - a unique-checkers counter and per-address counted flag
  - emits `CheckedIn(user, day, currentStreak, totalCheckIns)`
- Views: `streakOf`, `bestStreakOf`, `totalCheckInsOf`,
  `lastCheckInDayOf`, `uniqueCheckers`, `hasCheckedInToday`.
- There is **no owner, no admin, no payable function, no token handling,
  no transfer or approval logic** — nobody can move anything or edit
  anyone's record. The whole contract is ~130 lines including comments.

`contracts/mocks/MockAgentID.sol` is a test-only stand-in for the Agent ID
contract. **Never deploy it.**

## Build & test (local)

Requirements: Node.js 18+.

```bash
npm install
npm run compile   # solc-js -> artifacts/*.json
npm test          # compiles, deploys to a local Ganache EVM, runs the suite
```

The test suite covers: a non-holder cannot check in; a holder can; a
second check-in on the same day reverts; a next-day check-in increments
the streak; skipping a day resets the current streak to 1 while the best
streak survives; and the unique-checkers counter across two holders.
Everything runs on an in-process local EVM — no network, no real funds.

## Frontend

`index.html` + `app.js` (ethers v6 via CDN). It connects with
`window.ethereum` — a normal wallet connection the user approves in their
own wallet — shows the connected address, whether it holds an Agent ID,
its streak / best streak / total check-ins, and a Check In button that
sends the `checkIn()` transaction for the user to confirm in their wallet.

Before deployment, replace the clearly-marked `CONTRACT_ADDRESS`
placeholder at the top of `app.js`. While the placeholder is set, the
page runs in read-only demo mode with the Check In button disabled.

## Deployment (for later — not done yet)

1. Deploy `AgentCheckIn` to BSC (chain 56) with the constructor argument
   `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, using a wallet whose owner
   has explicitly approved the deployment and its gas cost.
2. Verify the contract on BscScan (flattened source or the standard JSON
   input from `scripts/compile.js`; compiler: solc 0.8.x with the
   optimizer at 200 runs, matching `artifacts/`).
3. Put the deployed address into `app.js` (`CONTRACT_ADDRESS`), and record
   it in this README.
4. Host `index.html` + `app.js` as static files.
5. Submit to the hackathon: project name, website, contract address, and
   a description of how Agent ID is used (access control via `balanceOf`).

## Hackathon safety-red-line compliance

- **No web QR / pairing-code login** — the only connection is a standard
  `window.ethereum` wallet connect. No pairing codes are shown, requested,
  or stored, and no session is kept on any server (there is no server).
- **No bypassing transaction confirmation** — every check-in is a
  transaction the user sees and confirms in their own wallet.
- **No asset movement** — the contract has no payable functions, performs
  no transfers, and requests no approvals. Users pay only the normal
  network gas for their own check-in transaction.
- **No credential collection** — nothing is collected: no seed phrases,
  private keys, API secrets, passwords, or personal data. The page reads
  only public on-chain state for the connected address.
- **No promised returns** — the product is a participation board. Page and
  README copy state plainly that there is nothing to buy, earn, or
  withdraw.
- **No wallet lookup by name** — the product never resolves an Agent ID
  name to someone else's wallet. It only checks the connected caller's
  own Agent ID balance.
- **Open source & verifiable** — contract source is in this repo and is
  written to be verified on BscScan at deployment time.
