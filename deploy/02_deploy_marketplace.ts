import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import fs, { writeFile } from "fs"

const DEPLOYMENTS_DIR = "./deployments"

const deployNFTMarketplace: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const dev = hre.network.name === "localhost" ? "/dev" : ""
  const frontendExportPath = process.env.FRONTEND_EXPORT_PATH + dev
  const apiExportPath = process.env.API_EXPORT_PATH + dev
  const { deployer } = await hre.getNamedAccounts()
  const { deploy } = hre.deployments

  console.log("deployer: ", deployer)

  const deployResult = await deploy("NietzschessNFTMarketplace", {
    from: deployer,
    args: [],
    log: true,
  })

  console.log("Contract NietzschessNFTMarketplace.sol deployed.")

  // Needed for Nethereum code generation.
  writeFile(
    "./artifacts/contracts/NietzschessNFTMarketplace.sol/NietzschessNFTMarketplace.abi",
    JSON.stringify(deployResult.abi),
    (err) => {
      if (err) console.error(err)
      else console.log("Abi file saved")
    },
  )

  // Export for frontend
  if (!fs.existsSync(`${frontendExportPath}`)) {
    fs.mkdirSync(`${frontendExportPath}`)
  }
  fs.copyFileSync(
    `${DEPLOYMENTS_DIR}/${hre.network.name}/NietzschessNFTMarketplace.json`,
    `${frontendExportPath}/NietzschessNFTMarketplace.json`,
  )

  // Export for api
  if (!fs.existsSync(`${apiExportPath}`)) {
    fs.mkdirSync(`${apiExportPath}`)
  }
  fs.copyFileSync(
    `${DEPLOYMENTS_DIR}/${hre.network.name}/NietzschessNFTMarketplace.json`,
    `${apiExportPath}/NietzschessNFTMarketplace.json`,
  )

  console.log("Deployment artifacts copied.")

  const nietzschessNFTMarketplace = await hre.ethers.getContractAt(
    "NietzschessNFTMarketplace",
    deployResult.address,
  )

  console.log("transferring ownership...")
  const owner = "0xB1A5A3B36213889C29738bbe1f83b3983FfE46e5"
  await nietzschessNFTMarketplace.transferOwnership(owner)
  console.log("transferred ownership to " + owner)
}

export default deployNFTMarketplace

deployNFTMarketplace.tags = ["nietzschess-nft-marketplace", "marketplace"]
