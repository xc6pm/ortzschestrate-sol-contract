# Implementation Notes for NFT Marketplace

## Simplified Testing Approach

The test suite has been designed to **NOT require malicious attack contracts**. Instead, we:

1. **Verify proper patterns are used** - Tests check that the contract behavior is correct
2. **Use OpenZeppelin's battle-tested libraries** - ReentrancyGuard, Ownable, Pausable
3. **Test state consistency** - Ensure operations either complete fully or revert completely
4. **Verify access controls** - Ensure only authorized users can perform actions

## Why No Malicious Contracts?

✅ **Simpler to maintain** - No need to create and maintain attack contracts  
✅ **Easier to understand** - Tests focus on correct behavior, not attack simulation  
✅ **OpenZeppelin does the heavy lifting** - Their security modules are already audited  
✅ **Tests contract interface** - We verify the public API behaves correctly

## Key Security Patterns to Implement

### 1. Reentrancy Protection

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NFTMarketplace is ReentrancyGuard {
    function purchaseItem(...) external payable nonReentrant {
        // Your code here
    }

    function withdrawFees() external onlyOwner nonReentrant {
        // Your code here
    }
}
```

### 2. Checks-Effects-Interactions Pattern

````solidity
```solidity
contract NietzschessNFTMarketplace is ReentrancyGuard {
    function purchaseItem(address nftContract, uint256 tokenId)
        external
        payable
        nonReentrant  // Prevents reentrancy attacks
    {
    // CHECKS - Validate inputs and requirements
    Listing storage listing = listings[nftContract][tokenId];
    require(listing.seller != address(0), "Item not listed");
    require(msg.value == listing.price, "Incorrect payment amount");
    require(msg.sender != listing.seller, "Cannot purchase own item");

    // EFFECTS - Update state BEFORE external calls
    address seller = listing.seller;
    uint256 price = listing.price;
    delete listings[nftContract][tokenId];  // Clear listing
    uint256 fee = (price * platformFee) / 10000;
    uint256 sellerAmount = price - fee;

    // INTERACTIONS - External calls LAST
    IERC721(nftContract).transferFrom(seller, msg.sender, tokenId);
    payable(seller).transfer(sellerAmount);

    emit ItemSold(nftContract, tokenId, seller, msg.sender, price);
}
````

### 3. Access Control

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract NietzschessNFTMarketplace is Ownable {
    function addApprovedNFT(address nftContract) external onlyOwner {
        // Only owner can call
    }

    function pause() external onlyOwner {
        _pause();
    }
}
```

### 4. Emergency Pause

```solidity
import "@openzeppelin/contracts/security/Pausable.sol";

contract NietzschessNFTMarketplace is Pausable {
    function listItem(...) external whenNotPaused {
        // Disabled when paused
    }

    function purchaseItem(...) external payable whenNotPaused nonReentrant {
        // Disabled when paused
    }
}
```

## Testing Philosophy

Our tests verify:

- ✅ **Happy paths work** - Normal operations succeed
- ✅ **Sad paths fail correctly** - Invalid operations revert with proper errors
- ✅ **State is consistent** - After any operation (success or failure), state is valid
- ✅ **Events are emitted** - All state changes emit events
- ✅ **Math is correct** - Fee calculations, transfers, etc.
- ✅ **Access is restricted** - Only authorized users can perform actions

We DON'T test:

- ❌ OpenZeppelin's code - They're already audited
- ❌ Solidity itself - The compiler is tested
- ❌ EVM behavior - That's tested by the Ethereum foundation

## What the Tests Expect

### Platform Fee

- **2.5%** (250 basis points) on all sales
- Stored in contract balance
- Withdrawable by owner only

### Approved NFT Contracts

- Owner maintains whitelist of allowed NFT contracts
- Only whitelisted NFTs can be listed
- Prevents listing of malicious/broken NFT contracts

### Listing Lifecycle

```
1. Owner adds NFT contract to approved list
2. User mints/receives NFT
3. User approves marketplace for their NFT
4. User lists item (price + metadata)
5. Item is active and visible
6. Buyer purchases OR seller delists
7. If purchased: NFT transfers, seller gets paid (minus fee)
8. If delisted: NFT stays with seller, listing removed
```

### Payment Flow

```
Purchase: 1 ETH listing price (must send exactly 1 ETH)
├─ Platform fee: 0.025 ETH (2.5%)
└─ Seller receives: 0.975 ETH
```

## Error Messages

Use these specific error messages (tests expect them):

```solidity
require(isApprovedNFT[nftContract], "NFT contract not approved");
require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not the owner of NFT");
require(price > 0, "Price must be greater than zero");
require(listings[nftContract][tokenId].seller == address(0), "Item already listed");
require(listings[nftContract][tokenId].seller != address(0), "Item not listed");
require(listings[nftContract][tokenId].seller == msg.sender, "Not the seller");
require(msg.sender != listings[nftContract][tokenId].seller, "Cannot purchase own item");
require(msg.value == listings[nftContract][tokenId].price, "Incorrect payment amount");
require(
    IERC721(nftContract).getApproved(tokenId) == address(this) ||
    IERC721(nftContract).isApprovedForAll(msg.sender, address(this)),
    "Marketplace not approved for NFT"
);
```

## Data Structures

### Listing Struct

```solidity
struct Listing {
    address seller;
    uint256 price;
    string metadata;  // IPFS URI
}

// Mapping: NFT contract => Token ID => Listing
mapping(address => mapping(uint256 => Listing)) public listings;

// Set of approved NFT contracts
mapping(address => bool) public isApprovedNFT;

// Platform fee (basis points)
uint256 public platformFee = 250; // 2.5%

// Helper function to check if an item is listed
function isItemListed(address nftContract, uint256 tokenId) public view returns (bool) {
    return listings[nftContract][tokenId].seller != address(0);
}
```

## Events

```solidity
event NFTApproved(address indexed nftContract);
event NFTRemoved(address indexed nftContract);
event ItemListed(address indexed nftContract, uint256 indexed tokenId, address indexed seller, uint256 price, string metadata);
event ItemDelisted(address indexed nftContract, uint256 indexed tokenId, address indexed seller);
event ItemSold(address indexed nftContract, uint256 indexed tokenId, address seller, address indexed buyer, uint256 price);
event ItemPriceUpdated(address indexed nftContract, uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
event ItemMetadataUpdated(address indexed nftContract, uint256 indexed tokenId, string oldMetadata, string newMetadata);
```

**Note on Events**: The marketplace does NOT implement `getActiveListings()` or `getListingsBySeller()` functions. The frontend should index these events to build its own database of listings. This approach:

- ✅ Saves significant gas (no on-chain arrays or complex queries)
- ✅ Allows flexible filtering and sorting on the frontend
- ✅ Prevents DoS attacks from gas-intensive loops
- ✅ Scales better as the number of listings grows

The `getListing(address nftContract, uint256 tokenId)` function is available for checking individual listing details.

## Gas Optimization Tips

1. **Pack struct variables** - Group smaller types together
2. **Use events for data** - Don't store everything on-chain
3. **Minimize storage writes** - Update storage once, not multiple times
4. **Use calldata for strings** - When possible, use calldata instead of memory
5. **Cache storage reads** - Read from storage once, use local variables

## Security Checklist

Before deploying:

- [ ] All functions use appropriate modifiers (onlyOwner, whenNotPaused, nonReentrant)
- [ ] Checks-effects-interactions pattern followed in all functions
- [ ] All state changes emit events
- [ ] All external calls are last in the function
- [ ] Integer overflow/underflow impossible (Solidity 0.8+ or SafeMath)
- [ ] Access controls tested and working
- [ ] Pause mechanism works correctly
- [ ] Fee calculation is accurate
- [ ] NFT transfers are validated
- [ ] No funds can get locked in contract (withdrawal mechanism exists)

## Next Steps

1. **Implement NietzschessNFTMarketplace.sol** following the patterns above
2. **Implement NietzschessNFT.sol** as a simple ERC721 with `safeMint(address to, uint256 tokenId)` function
3. **Run tests**: `npx hardhat test`
4. **Check coverage**: `npx hardhat coverage`
5. **Fix any failing tests**
6. **Add gas reporting**: `REPORT_GAS=true npx hardhat test`
7. **Optimize if needed**
8. **Get audited** before mainnet deployment

## Example Hardhat Config

```javascript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Default network for testing
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};

export default config;
```

Good luck with your implementation! 🚀
