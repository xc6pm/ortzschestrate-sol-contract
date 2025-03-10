import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import fs, { writeFile } from "fs"

const frontendExportPath = process.env.FRONTEND_EXPORT_PATH
const apiExportPath = process.env.API_EXPORT_PATH
const DEPLOYMENTS_DIR = "./deployments"

const deployORTBet: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await hre.getNamedAccounts()
  const { deploy } = hre.deployments

  console.log("deployer: ", deployer)

  const deployResult = await deploy("ORTBet", {
    from: deployer,
    args: [],
    log: true,
  })

  console.log("Contract ORTBet.sol deployed.")

  // Needed for Nethereum code generation.
  writeFile(
    "./artifacts/contracts/ORTBet.sol/ORTBet.abi",
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
    `${DEPLOYMENTS_DIR}/${hre.network.name}/ORTBet.json`,
    `${frontendExportPath}/ORTBet.json`,
  )

  // Export for api
  if (!fs.existsSync(`${apiExportPath}`)) {
    fs.mkdirSync(`${apiExportPath}`)
  }
  fs.copyFileSync(
    `${DEPLOYMENTS_DIR}/${hre.network.name}/ORTBet.json`,
    `${apiExportPath}/ORTBet.json`,
  )

  console.log("Deployment artifacts copied.")

  const ortBet = await hre.ethers.getContractAt("ORTBet", deployResult.address)

  console.log("transferring ownership...")
  const owner = "0xB1A5A3B36213889C29738bbe1f83b3983FfE46e5"
  await ortBet.transferOwnership(owner)
  console.log("transferred ownership to " + owner)
}

export default deployORTBet

deployORTBet.tags = ["ORTBet"]
