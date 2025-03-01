import "dotenv/config"
import { spawn } from "child_process"
import { config } from "hardhat"

/**
 * Unencrypts the private key and runs the hardhat deploy command
 */
async function main() {
  const networkIndex = process.argv.indexOf("--network")
  const networkName =
    networkIndex !== -1 ? process.argv[networkIndex + 1] : config.defaultNetwork

  if (networkName === "localhost" || networkName === "hardhat") {
    // Deploy command on the localhost network
    const hardhat = spawn("hardhat", ["deploy", ...process.argv.slice(2)], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    })

    hardhat.on("exit", (code) => {
      process.exit(code || 0)
    })
    return
  }
}

main().catch(console.error)
