import { ethers } from "hardhat";

async function main() {
  console.log("Deploying AccessControl contract...");

  // Get the contract factory
  const AccessControl = await ethers.getContractFactory("AccessControl");

  // Deploy the contract
  const accessControl = await AccessControl.deploy();

  // Wait for the contract to be mined
  await accessControl.deployed();

  console.log("✅ AccessControl deployed to:", accessControl.address);
  console.log("🔗 Transaction hash:", accessControl.deployTransaction.hash);

  // Get deployment transaction details
  const deployTx = await accessControl.deployTransaction.wait();
  console.log("⛽ Gas used:", deployTx.gasUsed.toString());
  console.log("🏭 Block number:", deployTx.blockNumber);
}

// Execute the deployment script
main()
  .then(() => {
    console.log("🎉 Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
