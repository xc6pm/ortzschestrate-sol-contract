import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import fs, { writeFile } from "fs"

const DEPLOYMENTS_DIR = "./deployments"

const deployNFT: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const dev = hre.network.name === "localhost" ? "/dev" : ""
  const frontendExportPath = process.env.FRONTEND_EXPORT_PATH + dev
  const apiExportPath = process.env.API_EXPORT_PATH + dev
  const { deployer } = await hre.getNamedAccounts()
  const { deploy } = hre.deployments

  console.log("deployer: ", deployer)

  const deployResult = await deploy("NietzschessNFT", {
    from: deployer,
    args: [],
    log: true,
  })

  console.log("Contract NietzschessNFT.sol deployed.")

  // Needed for Nethereum code generation.
  writeFile(
    "./artifacts/contracts/NietzschessNFT.sol/NietzschessNFT.abi",
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
    `${DEPLOYMENTS_DIR}/${hre.network.name}/NietzschessNFT.json`,
    `${frontendExportPath}/NietzschessNFT.json`,
  )

  // Export for api
  if (!fs.existsSync(`${apiExportPath}`)) {
    fs.mkdirSync(`${apiExportPath}`)
  }
  fs.copyFileSync(
    `${DEPLOYMENTS_DIR}/${hre.network.name}/NietzschessNFT.json`,
    `${apiExportPath}/NietzschessNFT.json`,
  )

  console.log("Deployment artifacts copied.")

  const nietzschessNFT = await hre.ethers.getContractAt("NietzschessNFT", deployResult.address)

  console.log("transferring ownership...")
  const owner = "0xB1A5A3B36213889C29738bbe1f83b3983FfE46e5"
  await nietzschessNFT.transferOwnership(owner)
  console.log("transferred ownership to " + owner)
}

export default deployNFT

deployNFT.tags = ["nft", "nietzschess-nft"]
