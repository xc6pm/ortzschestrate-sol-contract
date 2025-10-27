# NFT Marketplace Test Suite

This directory contains comprehensive unit tests for an NFT marketplace implementation following Test-Driven Development (TDD) principles.

## Overview

The test suite covers all required marketplace functionality:

1. ✅ Listing new items with metadata
2. ✅ Delisting items
3. ✅ Purchasing items from other addresses
4. ✅ Updating item information
5. ✅ Owner minting and listing NFTs
6. ✅ Emergency pause functionality

## Test Files

### 1. `NFTMarketplace.test.ts`

Main test suite covering core marketplace functionality and security.

**Test Categories:**

- **Deployment**: Initialization, owner setup, default configuration
- **NFT Approval Management**: Adding/removing approved NFT contracts
- **Listing Items**: Creating listings with validation
- **Delisting Items**: Removing listings with proper authorization
- **Purchasing Items**: Complete purchase flow with ownership transfer and fees
- **Updating Items**: Price and metadata updates
- **Owner Minting and Listing**: NFT contract minting capabilities
- **Pause Functionality**: Emergency stop mechanism
- **Fee Withdrawal**: Platform fee collection
- **Security Tests**: Reentrancy, access control, double-spending protection
- **Event Emission Tests**: Proper event logging

### 2. `SecurityTests.test.ts`

Advanced security testing focused on attack vectors and edge cases.

**Test Categories:**

- **Reentrancy Attack Tests**: Verification of nonReentrant modifiers and checks-effects-interactions pattern
- **Access Control Vulnerabilities**: Unauthorized access prevention
- **Token Approval and Transfer Vulnerabilities**: NFT transfer security
- **Payment Manipulation Tests**: Fee calculation, overpayment handling, integer overflow
- **Front-Running and MEV Protection**: Transaction ordering attacks
- **Denial of Service (DoS) Protection**: Gas limits and payment patterns
- **Edge Cases and Boundary Conditions**: Minimum prices, empty metadata, rapid operations
- **State Consistency Tests**: State integrity after failures and during pause

## Placeholder Contracts

The tests assume the following contract structure (to be implemented):

### NietzschessNFTMarketplace.sol

```solidity
contract NietzschessNFTMarketplace is Ownable, Pausable, ReentrancyGuard {
    // Platform fee: 250 basis points = 2.5%
    uint256 public platformFee; // 250

    struct Listing {
        address seller;
        uint256 price;
        string metadata;
    }

    // Functions to implement:
    function addApprovedNFT(address nftContract) external onlyOwner;
    function removeApprovedNFT(address nftContract) external onlyOwner;
    function isApprovedNFT(address nftContract) external view returns (bool);

    function listItem(address nftContract, uint256 tokenId, uint256 price, string metadata) external whenNotPaused;
    function delistItem(address nftContract, uint256 tokenId) external whenNotPaused;
    function purchaseItem(address nftContract, uint256 tokenId) external payable whenNotPaused nonReentrant;

    function updateItemPrice(address nftContract, uint256 tokenId, uint256 newPrice) external whenNotPaused;
    function updateItemMetadata(address nftContract, uint256 tokenId, string newMetadata) external whenNotPaused;
    function updateItem(address nftContract, uint256 tokenId, uint256 newPrice, string newMetadata) external whenNotPaused;

    function getListing(address nftContract, uint256 tokenId) external view returns (Listing);
    function isItemListed(address nftContract, uint256 tokenId) external view returns (bool);

    function withdrawFees() external onlyOwner nonReentrant;
    function pause() external onlyOwner;
    function unpause() external onlyOwner;
}
```

### NietzschessNFT.sol

```solidity
contract NietzschessNFT is ERC721, ERC721Pausable, Ownable, ERC721Burnable {
    function safeMint(address to, uint256 tokenId) external onlyOwner;
    function pause() external onlyOwner;
    function unpause() external onlyOwner;
}
```

## Key Features Tested

### Platform Fees

- 2.5% (250 basis points) fee on all sales
- Correct fee calculation and distribution
- Fee accumulation and withdrawal
- Integer overflow protection in fee calculations

### Security Validations

#### Access Control

- ✅ Only NFT owners can list their tokens
- ✅ Only sellers can modify/delist their listings
- ✅ Only owner can manage approved NFT contracts
- ✅ Only owner can pause/unpause marketplace
- ✅ Only owner can withdraw fees

#### Reentrancy Protection

- ✅ Protected purchase function (nonReentrant modifier required)
- ✅ Protected withdrawal function (nonReentrant modifier required)
- ✅ Checks-effects-interactions pattern verification
- ✅ State changes before external calls

**Note:** The security tests verify that the contract uses proper patterns rather than deploying malicious contracts. The implementation MUST use OpenZeppelin's `ReentrancyGuard` and follow the checks-effects-interactions pattern.

#### Payment Security

- ✅ Exact price enforcement (must send exact amount)
- ✅ No overpayment allowed
- ✅ No underpayment allowed
- ✅ Correct fee deduction
- ✅ Payment distribution to sellers

#### NFT Transfer Security

- ✅ Approval validation before listing
- ✅ Ownership verification
- ✅ Transfer completion validation
- ✅ Approval revocation handling

#### State Integrity

- ✅ Double-listing prevention
- ✅ Double-purchase prevention
- ✅ Listing state consistency
- ✅ State preservation during pause
- ✅ State recovery after failures

### Event Emissions

All critical operations emit events:

- `ItemListed(address nftContract, uint256 tokenId, address seller, uint256 price, string metadata)`
- `ItemDelisted(address nftContract, uint256 tokenId, address seller)`
- `ItemSold(address nftContract, uint256 tokenId, address seller, address buyer, uint256 price)`
- `ItemPriceUpdated(address nftContract, uint256 tokenId, uint256 oldPrice, uint256 newPrice)`
- `ItemMetadataUpdated(address nftContract, uint256 tokenId, string oldMetadata, string newMetadata)`
- `NFTApproved(address nftContract)`
- `NFTRemoved(address nftContract)`
- `Paused(address account)`
- `Unpaused(address account)`

## Running the Tests

```bash
# Install dependencies
npm install

# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/nft/NFTMarketplace.test.ts

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run with coverage
npx hardhat coverage
```

## Test Coverage Goals

The test suite aims for:

- ✅ 100% function coverage
- ✅ 100% branch coverage
- ✅ All security vulnerabilities tested
- ✅ All event emissions verified
- ✅ All edge cases covered

## TDD Implementation Order

Recommended order for implementing the marketplace contracts:

1. **Basic Structure**
   - Deploy contracts with ownership
   - Platform fee initialization
   - Pausable functionality

2. **NFT Approval System**
   - Add/remove approved NFT contracts
   - Validation checks

3. **Listing Functionality**
   - Create listings
   - Ownership validation
   - Approval checks
   - Price validation

4. **Delisting Functionality**
   - Remove listings
   - Authorization checks
   - State updates

5. **Purchase Functionality**
   - Payment processing
   - Fee calculation
   - NFT transfer
   - Fund distribution
   - Reentrancy protection

6. **Update Functionality**
   - Price updates
   - Metadata updates
   - Authorization checks

7. **Fee Management**
   - Fee accumulation
   - Withdrawal function
   - Reentrancy protection

8. **Security Hardening**
   - Add all security checks
   - Test against attack vectors
   - Optimize gas usage

## Common Revert Messages

The contracts should use these error messages (or custom errors):

- `"NFT contract not approved"` - NFT not in approved list
- `"Not the owner of NFT"` - Caller doesn't own the NFT
- `"Price must be greater than zero"` - Invalid price
- `"Item already listed"` - Duplicate listing attempt
- `"Item not listed"` - Operating on non-existent listing
- `"Not the seller"` - Unauthorized modification attempt
- `"Cannot purchase own item"` - Self-purchase prevention
- `"Incorrect payment amount"` - Payment doesn't match listing price exactly
- `"Marketplace not approved for NFT"` - Missing NFT approval
- Custom errors: `OwnableUnauthorizedAccount`, `EnforcedPause`, `ReentrancyGuardReentrantCall`

## Dependencies

Required packages (should be in package.json):

```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "@nomicfoundation/hardhat-ethers": "^3.0.0",
    "@openzeppelin/contracts": "^5.0.0",
    "hardhat": "^2.19.0",
    "chai": "^4.3.10",
    "ethers": "^6.9.0"
  }
}
```

## Notes for Implementation

1. **Use OpenZeppelin Contracts**: Leverage battle-tested implementations
   - `Ownable` for ownership management
   - `Pausable` for emergency stops
   - `ReentrancyGuard` for reentrancy protection
   - `ERC721` for NFT standard

2. **Gas Optimization**: Consider using:
   - Efficient data structures
   - Minimal storage operations
   - Events for off-chain data
   - Batch operations where possible

3. **Frontend Integration**: Tests assume:
   - Metadata stored on IPFS
   - Events indexed for listing discovery (no on-chain query functions)
   - `getListing()` function for individual listing details

4. **Upgrade Considerations**:
   - Tests written for non-upgradeable contracts
   - For proxy patterns, additional tests needed
   - Consider migration strategies for listings

## License

MIT
