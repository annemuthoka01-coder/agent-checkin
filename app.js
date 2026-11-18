// ============================================================
// PLACEHOLDER — replace with the deployed AgentCheckIn address
// after deployment on BNB Chain (see README "Deployment" steps).
// While this is the zero/placeholder address the page stays in
// read-only demo mode and the Check In button remains disabled.
// ============================================================
const CONTRACT_ADDRESS = "0x106D55F56122D45d9070F318D0aE2918EC1Ff6A7"; // AgentCheckIn on BSC mainnet, deployed 2026-11-18, tx 0x7ad142dd0616e68bb8ae27402cba8a070d8c161ee719b87d8fd25ee23aa84e38

// Agent ID contract on BSC (SPACE ID Agent ID, ERC-721) — public, fixed.
const AGENT_ID_ADDRESS = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const BSC_CHAIN_ID = 56n;

const ERC721_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const CHECKIN_ABI = [
  "function checkIn()",
  "function streakOf(address user) view returns (uint256)",
  "function bestStreakOf(address user) view returns (uint256)",
  "function totalCheckInsOf(address user) view returns (uint256)",
  "function uniqueCheckers() view returns (uint256)",
  "function hasCheckedInToday(address user) view returns (bool)",
];

const $ = (id) => document.getElementById(id);
const isPlaceholder =
  !CONTRACT_ADDRESS || /^0x0{40}$/i.test(CONTRACT_ADDRESS);

let provider, signer, account;

$("contractAddr").textContent = isPlaceholder
  ? "not deployed yet (placeholder)"
  : CONTRACT_ADDRESS;
if (isPlaceholder) $("deployNotice").hidden = false;

async function refresh() {
  const agentId = new ethers.Contract(AGENT_ID_ADDRESS, ERC721_ABI, provider);
  const holds = (await agentId.balanceOf(account)) > 0n;
  $("holds").textContent = holds ? "Yes" : "No";

  if (!isPlaceholder) {
    const board = new ethers.Contract(CONTRACT_ADDRESS, CHECKIN_ABI, provider);
    $("streak").textContent = (await board.streakOf(account)).toString();
    $("best").textContent = (await board.bestStreakOf(account)).toString();
    $("total").textContent = (await board.totalCheckInsOf(account)).toString();
    $("unique").textContent = (await board.uniqueCheckers()).toString();
    const today = await board.hasCheckedInToday(account);
    $("today").textContent = today ? "Yes" : "No";
    $("checkInBtn").disabled = !holds || today;
  } else {
    $("checkInBtn").disabled = true;
  }
}

$("connectBtn").addEventListener("click", async () => {
  if (!window.ethereum) {
    $("status").textContent = "No wallet found. Open this page in a browser with a wallet extension, or in your wallet app's browser.";
    return;
  }
  try {
    // Normal wallet connection only — the user approves in their own wallet.
    provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== BSC_CHAIN_ID) {
      $("status").textContent = "Please switch your wallet to BNB Chain (BSC) and try again.";
      return;
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    $("addr").textContent = account;
    $("panel").hidden = false;
    $("connectBtn").hidden = true;
    await refresh();
  } catch (e) {
    $("status").textContent = "Connection failed or was rejected.";
  }
});

$("checkInBtn").addEventListener("click", async () => {
  if (isPlaceholder || !signer) return;
  const board = new ethers.Contract(CONTRACT_ADDRESS, CHECKIN_ABI, signer);
  try {
    $("checkInBtn").disabled = true;
    $("status").textContent = "Waiting for you to confirm the transaction in your wallet…";
    const tx = await board.checkIn(); // user confirms in their own wallet
    $("status").textContent = "Transaction sent — waiting for confirmation…";
    await tx.wait();
    $("status").textContent = "Checked in. See you tomorrow to keep the streak going.";
    await refresh();
  } catch (e) {
    $("status").textContent = "Check-in failed or was rejected in the wallet.";
    await refresh().catch(() => {});
  }
});
