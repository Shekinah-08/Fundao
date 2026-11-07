const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Déploiement avec:", deployer.address);

  const Token = await ethers.getContractFactory("GovernanceToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  console.log("GovernanceToken:", await token.getAddress());

  const minDelay = 3600; // 1 heure sur le réseau de test
  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(minDelay, [], [], deployer.address);
  await timelock.waitForDeployment();
  console.log("TimelockController:", await timelock.getAddress());

  const Governor = await ethers.getContractFactory("StudentGovernor");
  const governor = await Governor.deploy(await token.getAddress(), await timelock.getAddress());
  await governor.waitForDeployment();
  console.log("StudentGovernor:", await governor.getAddress());

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const cancellerRole = await timelock.CANCELLER_ROLE();
  await (await timelock.grantRole(proposerRole, await governor.getAddress())).wait();
  await (await timelock.grantRole(executorRole, ethers.ZeroAddress)).wait(); // exécution publique après délai
  await (await timelock.grantRole(cancellerRole, await governor.getAddress())).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();

  const result = {
    chainId: 11155111,
    network: "sepolia",
    deployer: deployer.address,
    token: await token.getAddress(),
    governor: await governor.getAddress(),
    timelock: await timelock.getAddress(),
    treasury: await timelock.getAddress(),
    deployedAt: new Date().toISOString()
  };
  const out = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "sepolia.json"), JSON.stringify(result, null, 2));
  console.log("\nAdresses enregistrées dans deployments/sepolia.json");
  console.log("IMPORTANT: envoyer les ETH de test à l'adresse treasury/timelock.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
