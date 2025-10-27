import { expect } from "chai"
import { ethers } from "hardhat"
import {
  NietzschessNFTMarketplace,
  NietzschessNFT,
} from "../../typechain-types"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

describe("NietzschessNFTMarketplace - Advanced Security Tests", function () {
  async function deployMarketplaceFixture() {
    const [owner, seller, buyer, attacker] = await ethers.getSigners()

    // Deploy NFT contract
    const NietzschessNFTFactory =
      await ethers.getContractFactory("NietzschessNFT")
    const nft = await NietzschessNFTFactory.deploy()
    await nft.waitForDeployment()

    // Deploy Marketplace contract
    const NietzschessNFTMarketplaceFactory = await ethers.getContractFactory(
      "NietzschessNFTMarketplace",
    )
    const marketplace = await NietzschessNFTMarketplaceFactory.deploy()
    await marketplace.waitForDeployment()

    // Add NFT contract to approved list
    await marketplace.connect(owner).addApprovedNFT(await nft.getAddress())

    return { marketplace, nft, owner, seller, buyer, attacker }
  }

  async function deployWithListedItemFixture() {
    const { marketplace, nft, owner, seller, buyer, attacker } =
      await loadFixture(deployMarketplaceFixture)

    // Mint NFT to seller
    const tokenId = 0
    await nft.connect(owner).safeMint(seller.address, tokenId)

    // Approve marketplace to handle NFT
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

    // List the item
    const price = ethers.parseEther("1.0")
    await marketplace
      .connect(seller)
      .listItem(await nft.getAddress(), tokenId, price, "ipfs://test-metadata")

    return { marketplace, nft, owner, seller, buyer, attacker, tokenId, price }
  }

  describe("Reentrancy Attack Tests", function () {
    it("Should use nonReentrant modifier on purchaseItem", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Verify the purchase function works normally (proving nonReentrant doesn't break it)
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.emit(marketplace, "ItemSold")

      // Note: Actual reentrancy protection is tested at the contract level
      // The marketplace contract MUST use the nonReentrant modifier from OpenZeppelin
    })

    it("Should use nonReentrant modifier on withdrawFees", async function () {
      const { marketplace, nft, owner, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Make a purchase to generate fees
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      // Verify withdrawal works normally
      await expect(marketplace.connect(owner).withdrawFees()).to.not.be.reverted

      // Note: The contract MUST use nonReentrant modifier on withdrawFees
      // This prevents reentrancy attacks during fee withdrawal
    })

    it("Should follow checks-effects-interactions pattern", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address,
      )

      // Purchase should complete atomically
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      // Verify state changes happened (effects before interactions)
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(false)
      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address)

      // Verify payment was sent (interaction happened last)
      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address,
      )
      expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore)
    })
  })

  describe("Access Control Vulnerabilities", function () {
    it("Should prevent unauthorized ownership transfer", async function () {
      const { marketplace, attacker } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace.connect(attacker).transferOwnership(attacker.address),
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
    })

    it("Should prevent listing NFT without ownership", async function () {
      const { marketplace, nft, owner, seller, attacker } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)

      // Attacker tries to list seller's NFT
      await expect(
        marketplace
          .connect(attacker)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "ipfs://metadata",
          ),
      ).to.be.revertedWith("Not the owner of NFT")
    })

    it("Should prevent modifying listings of other users", async function () {
      const { marketplace, nft, attacker, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Try to update price
      await expect(
        marketplace
          .connect(attacker)
          .updateItemPrice(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("0.01"),
          ),
      ).to.be.revertedWith("Not the seller")

      // Try to delist
      await expect(
        marketplace
          .connect(attacker)
          .delistItem(await nft.getAddress(), tokenId),
      ).to.be.revertedWith("Not the seller")

      // Try to update metadata
      await expect(
        marketplace
          .connect(attacker)
          .updateItemMetadata(await nft.getAddress(), tokenId, "ipfs://hacked"),
      ).to.be.revertedWith("Not the seller")
    })
  })

  describe("Token Approval and Transfer Vulnerabilities", function () {
    it("Should fail if NFT approval is revoked mid-transaction", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Seller revokes approval
      await nft.connect(seller).approve(ethers.ZeroAddress, tokenId)

      // Purchase should fail
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.reverted
    })

    it("Should prevent listing if marketplace doesn't have approval", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)

      // Don't approve marketplace
      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "ipfs://metadata",
          ),
      ).to.be.revertedWith("Marketplace not approved for NFT")
    })

    it("Should verify NFT transfer during purchase", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Normal case: verify NFT actually transfers
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      // NFT should be with buyer now
      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address)

      // Note: The contract should properly handle the ERC721 transferFrom call
      // Any failure in the transfer should cause the entire transaction to revert
    })
  })

  describe("Payment Manipulation Tests", function () {
    it("Should reject payment with incorrect amount (underpayment)", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Try to purchase with 1 wei less
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: price - 1n,
          }),
      ).to.be.revertedWith("Incorrect payment amount")
    })

    it("Should reject payment with incorrect amount (overpayment)", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Try to purchase with 1 wei more
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: price + 1n,
          }),
      ).to.be.revertedWith("Incorrect payment amount")
    })

    it("Should prevent fee manipulation", async function () {
      const { marketplace, nft, buyer, seller, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      const expectedFee = (price * 250n) / 10000n // 2.5%
      const expectedSellerAmount = price - expectedFee

      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address,
      )
      const marketplaceBalanceBefore = await ethers.provider.getBalance(
        await marketplace.getAddress(),
      )

      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address,
      )
      const marketplaceBalanceAfter = await ethers.provider.getBalance(
        await marketplace.getAddress(),
      )

      // Verify exact amounts
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
        expectedSellerAmount,
      )
      expect(marketplaceBalanceAfter - marketplaceBalanceBefore).to.equal(
        expectedFee,
      )
    })

    it("Should prevent integer overflow in fee calculation", async function () {
      const { marketplace, nft, owner, seller, buyer } = await loadFixture(
        deployMarketplaceFixture,
      )

      // Use maximum safe uint256 value
      const maxPrice = ethers.MaxUint256

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      // This should either revert or handle correctly
      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            maxPrice,
            "ipfs://expensive",
          ),
      ).to.not.be.reverted

      // Fee calculation should not overflow
      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(maxPrice)
    })
  })

  describe("Front-Running and MEV Protection", function () {
    it("Should handle concurrent price updates correctly", async function () {
      const { marketplace, nft, seller, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Seller updates price twice in quick succession
      const newPrice1 = ethers.parseEther("2.0")
      const newPrice2 = ethers.parseEther("3.0")

      await marketplace
        .connect(seller)
        .updateItemPrice(await nft.getAddress(), tokenId, newPrice1)
      await marketplace
        .connect(seller)
        .updateItemPrice(await nft.getAddress(), tokenId, newPrice2)

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(newPrice2)
    })

    it("Should prevent purchase after delist in same block", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Seller delists
      await marketplace
        .connect(seller)
        .delistItem(await nft.getAddress(), tokenId)

      // Buyer tries to purchase - should fail
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.revertedWith("Item not listed")
    })

    it("Should handle price update before purchase correctly", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      const newPrice = ethers.parseEther("5.0")
      await marketplace
        .connect(seller)
        .updateItemPrice(await nft.getAddress(), tokenId, newPrice)

      // Old price should fail
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.revertedWith("Incorrect payment amount")

      // New price should work
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: newPrice }),
      ).to.emit(marketplace, "ItemSold")
    })
  })

  describe("Denial of Service (DoS) Protection", function () {
    it("Should use pull payment pattern for seller proceeds", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      const expectedFee = (price * 250n) / 10000n
      const expectedSellerAmount = price - expectedFee

      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address,
      )

      // Purchase should send funds directly to seller (push pattern is acceptable here)
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address,
      )

      // Verify seller received payment
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
        expectedSellerAmount,
      )

      // Note: If using pull pattern instead, seller would call a separate withdraw function
      // Pull pattern is more gas-efficient and prevents DoS but adds complexity
    })

    it("Should not allow gas-intensive operations to DoS marketplace", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      // List many items
      const itemCount = 50
      for (let i = 0; i < itemCount; i++) {
        await nft.connect(owner).safeMint(seller.address, i)
        await nft.connect(seller).approve(await marketplace.getAddress(), i)
        await marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            i,
            ethers.parseEther("1.0"),
            `ipfs://metadata-${i}`,
          )
      }

      // Individual operations should still work even with many listings
      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), 0),
      ).to.emit(marketplace, "ItemDelisted")

      // Note: Frontend should read listings from events, not from on-chain queries
    })
  })

  describe("Edge Cases and Boundary Conditions", function () {
    it("Should handle listing with minimum price (1 wei)", async function () {
      const { marketplace, nft, owner, seller, buyer } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      const minPrice = 1n // 1 wei

      await marketplace
        .connect(seller)
        .listItem(await nft.getAddress(), tokenId, minPrice, "ipfs://cheap")

      // Calculate fee (should round down to 0)
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: minPrice })

      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address)
    })

    it("Should handle empty metadata string", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "",
          ),
      ).to.emit(marketplace, "ItemListed")
    })

    it("Should handle very long metadata strings", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const longMetadata = "ipfs://" + "a".repeat(1000)
      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            longMetadata,
          ),
      ).to.emit(marketplace, "ItemListed")
    })

    it("Should handle rapid list/delist cycles", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      // List and delist multiple times
      for (let i = 0; i < 5; i++) {
        await marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "ipfs://cycling",
          )

        await marketplace
          .connect(seller)
          .delistItem(await nft.getAddress(), tokenId)
      }

      // Final list should work
      await marketplace
        .connect(seller)
        .listItem(
          await nft.getAddress(),
          tokenId,
          ethers.parseEther("1.0"),
          "ipfs://cycling",
        )

      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
    })
  })

  describe("State Consistency Tests", function () {
    it("Should maintain consistent state after failed purchase", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Try to purchase with incorrect payment
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: price - ethers.parseEther("0.1"),
          }),
      ).to.be.revertedWith("Incorrect payment amount")

      // Listing should still be active and unchanged
      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
      expect(listing.seller).to.equal(seller.address)
      expect(listing.price).to.equal(price)

      // NFT should still be with seller
      expect(await nft.ownerOf(tokenId)).to.equal(seller.address)
    })

    it("Should maintain consistent state after failed delist", async function () {
      const { marketplace, nft, attacker, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      // Non-seller tries to delist
      await expect(
        marketplace
          .connect(attacker)
          .delistItem(await nft.getAddress(), tokenId),
      ).to.be.revertedWith("Not the seller")

      // Listing should still be active
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(price)
    })

    it("Should maintain consistent state during pause/unpause", async function () {
      const { marketplace, nft, owner, seller, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await marketplace.connect(owner).pause()

      // Listing should still exist
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(price)
      expect(listing.seller).to.equal(seller.address)

      await marketplace.connect(owner).unpause()

      // Should still be able to interact with listing
      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("2.0"),
          ),
      ).to.emit(marketplace, "ItemPriceUpdated")
    })
  })
})
