import { expect } from "chai"
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import {
  NietzschessNFTMarketplace,
  NietzschessNFT,
} from "../../typechain-types"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"

describe("NietzschessNFTMarketplace", function () {
  // Fixtures for test setup
  async function deployMarketplaceFixture() {
    const [owner, seller, buyer, user1, user2] = await ethers.getSigners()

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

    return { marketplace, nft, owner, seller, buyer, user1, user2 }
  }

  async function deployWithListedItemFixture() {
    const { marketplace, nft, owner, seller, buyer, user1, user2 } =
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
      .listItem(
        await nft.getAddress(),
        tokenId,
        price,
        "ipfs://test-metadata-1",
      )

    return {
      marketplace,
      nft,
      owner,
      seller,
      buyer,
      user1,
      user2,
      tokenId,
      price,
    }
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { marketplace, owner } = await loadFixture(deployMarketplaceFixture)
      expect(await marketplace.owner()).to.equal(owner.address)
    })

    it("Should initialize with platform fee of 2.5%", async function () {
      const { marketplace } = await loadFixture(deployMarketplaceFixture)
      expect(await marketplace.platformFee()).to.equal(250) // 250 basis points = 2.5%
    })

    it("Should not be paused on deployment", async function () {
      const { marketplace } = await loadFixture(deployMarketplaceFixture)
      expect(await marketplace.paused()).to.equal(false)
    })
  })

  describe("NFT Approval Management", function () {
    it("Should allow owner to add approved NFT contracts", async function () {
      const { marketplace, nft, owner } = await loadFixture(
        deployMarketplaceFixture,
      )

      // Deploy another NFT
      const NietzschessNFTFactory =
        await ethers.getContractFactory("NietzschessNFT")
      const nft2 = await NietzschessNFTFactory.deploy()
      await nft2.waitForDeployment()

      await expect(
        marketplace.connect(owner).addApprovedNFT(await nft2.getAddress()),
      )
        .to.emit(marketplace, "NFTApproved")
        .withArgs(await nft2.getAddress())

      expect(await marketplace.isApprovedNFT(await nft2.getAddress())).to.equal(
        true,
      )
    })

    it("Should allow owner to remove approved NFT contracts", async function () {
      const { marketplace, nft, owner } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace.connect(owner).removeApprovedNFT(await nft.getAddress()),
      )
        .to.emit(marketplace, "NFTRemoved")
        .withArgs(await nft.getAddress())

      expect(await marketplace.isApprovedNFT(await nft.getAddress())).to.equal(
        false,
      )
    })

    it("Should reject non-owner from managing approved NFTs", async function () {
      const { marketplace, nft, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace.connect(seller).addApprovedNFT(await nft.getAddress()),
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
    })
  })

  describe("Listing Items", function () {
    it("Should allow users to list new items with metadata", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      // Mint NFT to seller (only owner can mint)
      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)

      // Approve marketplace
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      const price = ethers.parseEther("1.5")

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            price,
            "ipfs://metadata-1",
          ),
      )
        .to.emit(marketplace, "ItemListed")
        .withArgs(
          await nft.getAddress(),
          tokenId,
          seller.address,
          price,
          "ipfs://metadata-1",
        )

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.seller).to.equal(seller.address)
      expect(listing.price).to.equal(price)
      expect(listing.metadata).to.equal("ipfs://metadata-1")
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
    })

    it("Should reject listing from non-approved NFT contracts", async function () {
      const { marketplace, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      // Deploy unapproved NFT
      const NietzschessNFTFactory =
        await ethers.getContractFactory("NietzschessNFT")
      const unapprovedNFT = await NietzschessNFTFactory.deploy()
      await unapprovedNFT.waitForDeployment()

      const tokenId = 0
      await unapprovedNFT.connect(owner).safeMint(seller.address, tokenId)
      await unapprovedNFT
        .connect(seller)
        .approve(await marketplace.getAddress(), tokenId)

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await unapprovedNFT.getAddress(),
            0,
            ethers.parseEther("1.0"),
            "ipfs://metadata",
          ),
      ).to.be.revertedWith("NFT contract not approved")
    })

    it("Should reject listing if user is not the NFT owner", async function () {
      const { marketplace, nft, owner, seller, user1 } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)

      await expect(
        marketplace
          .connect(user1)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "ipfs://metadata",
          ),
      ).to.be.revertedWith("Not the owner of NFT")
    })

    it("Should reject listing with zero price", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      await expect(
        marketplace
          .connect(seller)
          .listItem(await nft.getAddress(), tokenId, 0, "ipfs://metadata"),
      ).to.be.revertedWith("Price must be greater than zero")
    })

    it("Should reject listing already listed item", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("2.0"),
            "ipfs://new-metadata",
          ),
      ).to.be.revertedWith("Item already listed")
    })

    it("Should reject listing when marketplace is paused", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      // Pause marketplace
      await marketplace.connect(owner).pause()

      await expect(
        marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("1.0"),
            "ipfs://metadata",
          ),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")
    })
  })

  describe("Delisting Items", function () {
    it("Should allow sellers to delist their items", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), tokenId),
      )
        .to.emit(marketplace, "ItemDelisted")
        .withArgs(await nft.getAddress(), tokenId, seller.address)

      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(false)
    })

    it("Should reject delisting from non-seller", async function () {
      const { marketplace, nft, user1, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace.connect(user1).delistItem(await nft.getAddress(), tokenId),
      ).to.be.revertedWith("Not the seller")
    })

    it("Should reject delisting non-listed item", async function () {
      const { marketplace, nft, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), 999),
      ).to.be.revertedWith("Item not listed")
    })

    it("Should reject delisting when marketplace is paused", async function () {
      const { marketplace, nft, owner, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await marketplace.connect(owner).pause()

      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), tokenId),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")
    })
  })

  describe("Purchasing Items", function () {
    it("Should allow users to purchase listed items", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      const platformFee = (price * 250n) / 10000n // 2.5%
      const sellerProceeds = price - platformFee

      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address,
      )

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      )
        .to.emit(marketplace, "ItemSold")
        .withArgs(
          await nft.getAddress(),
          tokenId,
          seller.address,
          buyer.address,
          price,
        )

      // Check NFT ownership transferred
      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address)

      // Check listing is no longer active
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(false)

      // Check seller received payment (minus fees)
      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address,
      )
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(sellerProceeds)
    })

    it("Should collect platform fees correctly", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      const platformFee = (price * 250n) / 10000n
      const marketplaceBalanceBefore = await ethers.provider.getBalance(
        await marketplace.getAddress(),
      )

      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      const marketplaceBalanceAfter = await ethers.provider.getBalance(
        await marketplace.getAddress(),
      )
      expect(marketplaceBalanceAfter - marketplaceBalanceBefore).to.equal(
        platformFee,
      )
    })

    it("Should reject purchase with incorrect payment (less than price)", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: price - ethers.parseEther("0.1"),
          }),
      ).to.be.revertedWith("Incorrect payment amount")
    })

    it("Should reject purchase with incorrect payment (more than price)", async function () {
      const { marketplace, nft, buyer, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: price + ethers.parseEther("0.1"),
          }),
      ).to.be.revertedWith("Incorrect payment amount")
    })

    it("Should reject purchase of non-listed item", async function () {
      const { marketplace, nft, buyer } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace.connect(buyer).purchaseItem(await nft.getAddress(), 999, {
          value: ethers.parseEther("1.0"),
        }),
      ).to.be.revertedWith("Item not listed")
    })

    it("Should reject seller purchasing their own item", async function () {
      const { marketplace, nft, seller, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(seller)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.revertedWith("Cannot purchase own item")
    })

    it("Should reject purchase when marketplace is paused", async function () {
      const { marketplace, nft, owner, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await marketplace.connect(owner).pause()

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")
    })
  })

  describe("Updating Items", function () {
    it("Should allow sellers to update item price", async function () {
      const { marketplace, nft, seller, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      const newPrice = ethers.parseEther("2.0")

      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(await nft.getAddress(), tokenId, newPrice),
      )
        .to.emit(marketplace, "ItemPriceUpdated")
        .withArgs(await nft.getAddress(), tokenId, price, newPrice)

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(newPrice)
    })

    it("Should allow sellers to update item metadata", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      const oldMetadata = "ipfs://test-metadata-1"
      const newMetadata = "ipfs://new-metadata-uri"

      await expect(
        marketplace
          .connect(seller)
          .updateItemMetadata(await nft.getAddress(), tokenId, newMetadata),
      )
        .to.emit(marketplace, "ItemMetadataUpdated")
        .withArgs(await nft.getAddress(), tokenId, oldMetadata, newMetadata)

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.metadata).to.equal(newMetadata)
    })

    it("Should allow sellers to update both price and metadata", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      const newPrice = ethers.parseEther("3.0")
      const newMetadata = "ipfs://updated-metadata"

      await marketplace
        .connect(seller)
        .updateItem(await nft.getAddress(), tokenId, newPrice, newMetadata)

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.price).to.equal(newPrice)
      expect(listing.metadata).to.equal(newMetadata)
    })

    it("Should reject update from non-seller", async function () {
      const { marketplace, nft, user1, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(user1)
          .updateItemPrice(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("2.0"),
          ),
      ).to.be.revertedWith("Not the seller")
    })

    it("Should reject price update to zero", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(await nft.getAddress(), tokenId, 0),
      ).to.be.revertedWith("Price must be greater than zero")
    })

    it("Should reject update of non-listed item", async function () {
      const { marketplace, nft, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(
            await nft.getAddress(),
            999,
            ethers.parseEther("1.0"),
          ),
      ).to.be.revertedWith("Item not listed")
    })

    it("Should reject update when marketplace is paused", async function () {
      const { marketplace, nft, owner, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await marketplace.connect(owner).pause()

      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("2.0"),
          ),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")
    })
  })

  describe("Owner Minting and Listing", function () {
    it("Should allow owner to mint NFT (via NFT contract)", async function () {
      const { nft, owner, user1 } = await loadFixture(deployMarketplaceFixture)

      const tokenId = 0
      await expect(nft.connect(owner).safeMint(user1.address, tokenId))
        .to.emit(nft, "Transfer")
        .withArgs(ethers.ZeroAddress, user1.address, tokenId)

      expect(await nft.ownerOf(tokenId)).to.equal(user1.address)
    })

    it("Should reject minting from non-owner (via NFT contract)", async function () {
      const { nft, user1, user2 } = await loadFixture(deployMarketplaceFixture)

      await expect(
        nft.connect(user1).safeMint(user2.address, 0),
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount")
    })

    it("Should allow owner to mint and immediately list on marketplace", async function () {
      const { marketplace, nft, owner, user1 } = await loadFixture(
        deployMarketplaceFixture,
      )

      // Mint to a user
      const tokenId = 0
      await nft.connect(owner).safeMint(user1.address, tokenId)

      // User approves and lists
      await nft.connect(user1).approve(await marketplace.getAddress(), tokenId)
      await marketplace
        .connect(user1)
        .listItem(
          await nft.getAddress(),
          tokenId,
          ethers.parseEther("5.0"),
          "ipfs://mint-and-list",
        )

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.seller).to.equal(user1.address)
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
    })

    it("Should allow owner to mint to themselves and list", async function () {
      const { marketplace, nft, owner } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(owner.address, tokenId)

      await nft.connect(owner).approve(await marketplace.getAddress(), tokenId)
      await marketplace
        .connect(owner)
        .listItem(
          await nft.getAddress(),
          tokenId,
          ethers.parseEther("10.0"),
          "ipfs://owner-listing",
        )

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )
      expect(listing.seller).to.equal(owner.address)
    })
  })

  describe("Pause Functionality", function () {
    it("Should allow owner to pause the marketplace", async function () {
      const { marketplace, owner } = await loadFixture(deployMarketplaceFixture)

      await expect(marketplace.connect(owner).pause())
        .to.emit(marketplace, "Paused")
        .withArgs(owner.address)

      expect(await marketplace.paused()).to.equal(true)
    })

    it("Should allow owner to unpause the marketplace", async function () {
      const { marketplace, owner } = await loadFixture(deployMarketplaceFixture)

      await marketplace.connect(owner).pause()

      await expect(marketplace.connect(owner).unpause())
        .to.emit(marketplace, "Unpaused")
        .withArgs(owner.address)

      expect(await marketplace.paused()).to.equal(false)
    })

    it("Should reject pause from non-owner", async function () {
      const { marketplace, user1 } = await loadFixture(deployMarketplaceFixture)

      await expect(
        marketplace.connect(user1).pause(),
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
    })

    it("Should reject unpause from non-owner", async function () {
      const { marketplace, owner, user1 } = await loadFixture(
        deployMarketplaceFixture,
      )

      await marketplace.connect(owner).pause()

      await expect(
        marketplace.connect(user1).unpause(),
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
    })

    it("Should block all marketplace operations when paused", async function () {
      const { marketplace, nft, owner, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await marketplace.connect(owner).pause()

      // Try to purchase - should fail
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")

      // Try to delist - should fail
      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), tokenId),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")

      // Try to update - should fail
      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(
            await nft.getAddress(),
            tokenId,
            ethers.parseEther("2.0"),
          ),
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause")
    })

    it("Should allow operations after unpausing", async function () {
      const { marketplace, nft, owner, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await marketplace.connect(owner).pause()
      await marketplace.connect(owner).unpause()

      // Should now work
      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      ).to.emit(marketplace, "ItemSold")
    })
  })

  describe("Fee Withdrawal", function () {
    it("Should allow owner to withdraw accumulated fees", async function () {
      const { marketplace, nft, owner, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      // Make a purchase to generate fees
      await marketplace
        .connect(buyer)
        .purchaseItem(await nft.getAddress(), tokenId, { value: price })

      const platformFee = (price * 250n) / 10000n
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address)

      const tx = await marketplace.connect(owner).withdrawFees()
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address)

      expect(ownerBalanceAfter - ownerBalanceBefore + gasUsed).to.equal(
        platformFee,
      )
      expect(
        await ethers.provider.getBalance(await marketplace.getAddress()),
      ).to.equal(0)
    })

    it("Should reject fee withdrawal from non-owner", async function () {
      const { marketplace, user1 } = await loadFixture(deployMarketplaceFixture)

      await expect(
        marketplace.connect(user1).withdrawFees(),
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
    })

    it("Should handle withdrawal when no fees accumulated", async function () {
      const { marketplace, owner } = await loadFixture(deployMarketplaceFixture)

      await expect(marketplace.connect(owner).withdrawFees()).to.not.be.reverted
    })
  })

  describe("Security Tests", function () {
    describe("Reentrancy Protection", function () {
      it("Should prevent reentrancy attacks on purchase", async function () {
        // This test would use a malicious contract that attempts reentrancy
        // Placeholder for implementation with actual malicious contract
        const { marketplace, nft, tokenId, price } = await loadFixture(
          deployWithListedItemFixture,
        )

        // Deploy malicious contract
        const MaliciousFactory =
          await ethers.getContractFactory("MaliciousBuyer")
        const malicious = await MaliciousFactory.deploy(
          await marketplace.getAddress(),
        )

        await expect(
          malicious.attack(await nft.getAddress(), tokenId, { value: price }),
        ).to.be.revertedWithCustomError(
          marketplace,
          "ReentrancyGuardReentrantCall",
        )
      })
    })

    describe("Access Control", function () {
      it("Should prevent unauthorized listing of NFTs user doesn't own", async function () {
        const { marketplace, nft, owner, seller, user1 } = await loadFixture(
          deployMarketplaceFixture,
        )

        const tokenId = 0
        await nft.connect(owner).safeMint(seller.address, tokenId)

        await expect(
          marketplace
            .connect(user1)
            .listItem(
              await nft.getAddress(),
              tokenId,
              ethers.parseEther("1.0"),
              "ipfs://metadata",
            ),
        ).to.be.revertedWith("Not the owner of NFT")
      })

      it("Should prevent manipulation of other users' listings", async function () {
        const { marketplace, nft, user1, tokenId } = await loadFixture(
          deployWithListedItemFixture,
        )

        await expect(
          marketplace
            .connect(user1)
            .delistItem(await nft.getAddress(), tokenId),
        ).to.be.revertedWith("Not the seller")

        await expect(
          marketplace
            .connect(user1)
            .updateItemPrice(
              await nft.getAddress(),
              tokenId,
              ethers.parseEther("0.1"),
            ),
        ).to.be.revertedWith("Not the seller")
      })
    })

    describe("Double-Spending Protection", function () {
      it("Should prevent listing same NFT twice", async function () {
        const { marketplace, nft, seller, tokenId } = await loadFixture(
          deployWithListedItemFixture,
        )

        await expect(
          marketplace
            .connect(seller)
            .listItem(
              await nft.getAddress(),
              tokenId,
              ethers.parseEther("2.0"),
              "ipfs://duplicate",
            ),
        ).to.be.revertedWith("Item already listed")
      })

      it("Should prevent purchase of already sold item", async function () {
        const { marketplace, nft, buyer, user1, tokenId, price } =
          await loadFixture(deployWithListedItemFixture)

        // First purchase
        await marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price })

        // Attempt second purchase
        await expect(
          marketplace
            .connect(user1)
            .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
        ).to.be.revertedWith("Item not listed")
      })
    })

    describe("Price Manipulation", function () {
      it("Should prevent zero price listings", async function () {
        const { marketplace, nft, owner, seller } = await loadFixture(
          deployMarketplaceFixture,
        )

        const tokenId = 0
        await nft.connect(owner).safeMint(seller.address, tokenId)
        await nft
          .connect(seller)
          .approve(await marketplace.getAddress(), tokenId)

        await expect(
          marketplace
            .connect(seller)
            .listItem(await nft.getAddress(), tokenId, 0, "ipfs://metadata"),
        ).to.be.revertedWith("Price must be greater than zero")
      })

      it("Should prevent updating to zero price", async function () {
        const { marketplace, nft, seller, tokenId } = await loadFixture(
          deployWithListedItemFixture,
        )

        await expect(
          marketplace
            .connect(seller)
            .updateItemPrice(await nft.getAddress(), tokenId, 0),
        ).to.be.revertedWith("Price must be greater than zero")
      })
    })

    describe("Integer Overflow/Underflow", function () {
      it("Should handle very large prices correctly", async function () {
        const { marketplace, nft, owner, seller, buyer } = await loadFixture(
          deployMarketplaceFixture,
        )

        const tokenId = 0
        await nft.connect(owner).safeMint(seller.address, tokenId)
        await nft
          .connect(seller)
          .approve(await marketplace.getAddress(), tokenId)

        // Use a very large but valid price (within test account balance of 10,000 ETH)
        const largePrice = ethers.parseEther("5000")

        await marketplace
          .connect(seller)
          .listItem(
            await nft.getAddress(),
            tokenId,
            largePrice,
            "ipfs://expensive",
          )

        // Calculate expected fee
        const expectedFee = (largePrice * 250n) / 10000n
        const expectedSellerAmount = largePrice - expectedFee

        const sellerBalanceBefore = await ethers.provider.getBalance(
          seller.address,
        )

        await marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, {
            value: largePrice,
          })

        const sellerBalanceAfter = await ethers.provider.getBalance(
          seller.address,
        )
        expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
          expectedSellerAmount,
        )
      })
    })

    describe("NFT Approval Validation", function () {
      it("Should fail purchase if NFT approval is revoked before purchase", async function () {
        const { marketplace, nft, seller, buyer, tokenId, price } =
          await loadFixture(deployWithListedItemFixture)

        // Revoke approval
        await nft.connect(seller).approve(ethers.ZeroAddress, tokenId)

        await expect(
          marketplace
            .connect(buyer)
            .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
        ).to.be.reverted // Will fail on transferFrom
      })

      it("Should require approval before listing", async function () {
        const { marketplace, nft, owner, seller } = await loadFixture(
          deployMarketplaceFixture,
        )

        const tokenId = 0
        await nft.connect(owner).safeMint(seller.address, tokenId)

        // Try to list without approval - should fail on transfer check
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
    })

    describe("Front-Running Protection", function () {
      it("Should handle price updates before purchase correctly", async function () {
        const { marketplace, nft, seller, buyer, tokenId, price } =
          await loadFixture(deployWithListedItemFixture)

        // Seller updates price
        const newPrice = ethers.parseEther("2.0")
        await marketplace
          .connect(seller)
          .updateItemPrice(await nft.getAddress(), tokenId, newPrice)

        // Buyer tries to purchase with old price - should fail
        await expect(
          marketplace
            .connect(buyer)
            .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
        ).to.be.revertedWith("Incorrect payment amount")

        // Purchase with new price should succeed
        await expect(
          marketplace
            .connect(buyer)
            .purchaseItem(await nft.getAddress(), tokenId, { value: newPrice }),
        ).to.emit(marketplace, "ItemSold")
      })
    })
  })

  describe("Event Emission Tests", function () {
    it("Should emit ItemListed event with correct parameters", async function () {
      const { marketplace, nft, owner, seller } = await loadFixture(
        deployMarketplaceFixture,
      )

      const tokenId = 0
      await nft.connect(owner).safeMint(seller.address, tokenId)
      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId)

      const price = ethers.parseEther("1.0")

      await expect(
        marketplace
          .connect(seller)
          .listItem(await nft.getAddress(), tokenId, price, "ipfs://metadata"),
      )
        .to.emit(marketplace, "ItemListed")
        .withArgs(
          await nft.getAddress(),
          tokenId,
          seller.address,
          price,
          "ipfs://metadata",
        )
    })

    it("Should emit ItemDelisted event with correct parameters", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      await expect(
        marketplace.connect(seller).delistItem(await nft.getAddress(), tokenId),
      )
        .to.emit(marketplace, "ItemDelisted")
        .withArgs(await nft.getAddress(), tokenId, seller.address)
    })

    it("Should emit ItemSold event with correct parameters", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      )
        .to.emit(marketplace, "ItemSold")
        .withArgs(
          await nft.getAddress(),
          tokenId,
          seller.address,
          buyer.address,
          price,
        )
    })

    it("Should emit ItemPriceUpdated event when price is updated", async function () {
      const { marketplace, nft, seller, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      const newPrice = ethers.parseEther("2.5")

      await expect(
        marketplace
          .connect(seller)
          .updateItemPrice(await nft.getAddress(), tokenId, newPrice),
      )
        .to.emit(marketplace, "ItemPriceUpdated")
        .withArgs(await nft.getAddress(), tokenId, price, newPrice)
    })

    it("Should emit ItemMetadataUpdated event when metadata is updated", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(
        deployWithListedItemFixture,
      )

      const oldMetadata = "ipfs://test-metadata-1"
      const newMetadata = "ipfs://updated-metadata"

      await expect(
        marketplace
          .connect(seller)
          .updateItemMetadata(await nft.getAddress(), tokenId, newMetadata),
      )
        .to.emit(marketplace, "ItemMetadataUpdated")
        .withArgs(await nft.getAddress(), tokenId, oldMetadata, newMetadata)
    })

    it("Should emit Transfer event on NFT purchase", async function () {
      const { marketplace, nft, seller, buyer, tokenId, price } =
        await loadFixture(deployWithListedItemFixture)

      await expect(
        marketplace
          .connect(buyer)
          .purchaseItem(await nft.getAddress(), tokenId, { value: price }),
      )
        .to.emit(nft, "Transfer")
        .withArgs(seller.address, buyer.address, tokenId)
    })
  })

  describe("Query Functions", function () {
    it("Should return correct listing information via getListing", async function () {
      const { marketplace, nft, seller, tokenId, price } = await loadFixture(
        deployWithListedItemFixture,
      )

      const listing = await marketplace.getListing(
        await nft.getAddress(),
        tokenId,
      )

      expect(listing.seller).to.equal(seller.address)
      expect(listing.price).to.equal(price)
      expect(listing.metadata).to.equal("ipfs://test-metadata-1")
      expect(
        await marketplace.isItemListed(await nft.getAddress(), tokenId),
      ).to.equal(true)
    })
  })
})
