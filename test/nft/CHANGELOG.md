# NFT Marketplace Test Suite - Changelog

## Recent Changes

### NFT Contract Uses safeMint with tokenId

**Date**: Current  
**Change**: Updated tests to use `safeMint(address to, uint256 tokenId)` instead of `mint(address to, string uri)`.

#### What Changed

**Before:**

- Tests called: `await nft.connect(owner).mint(seller.address, "ipfs://metadata")`
- Function returned tokenId and stored URI internally

**After:**

- Tests call: `await nft.connect(owner).safeMint(seller.address, tokenId)`
- tokenId is provided as parameter
- No URI parameter (contract uses base URI or external metadata)

#### Rationale

1. **Simpler NFT contract** - No need to manage token URI mapping in tests
2. **Standard pattern** - Matches common ERC721 implementations
3. **Flexibility** - Token URIs can be managed separately or computed from tokenId
4. **Gas savings** - No need to store individual URIs on-chain

#### Files Updated

1. **test/nft/NFTMarketplace.test.ts** - Updated all mint calls (~14 instances)
2. **test/nft/SecurityTests.test.ts** - Updated all mint calls (~10 instances)
3. **test/nft/README.md** - Updated NietzschessNFT contract interface documentation
4. **test/nft/IMPLEMENTATION_NOTES.md** - Updated implementation guidance

#### Contract Interface

```solidity
contract NietzschessNFT is ERC721, ERC721Pausable, Ownable, ERC721Burnable {
    function safeMint(address to, uint256 tokenId) external onlyOwner;
    function pause() external onlyOwner;
    function unpause() external onlyOwner;
}
```

---

### Exact Payment Requirement

**Date**: Current  
**Change**: Modified payment validation from "minimum payment" to "exact payment" requirement.

#### What Changed

**Before:**

- Buyers could send **more than** the listing price
- Contract would refund excess payment
- Error message: `"Insufficient payment"` for underpayment

**After:**

- Buyers must send **exactly** the listing price
- No overpayment allowed
- Error message: `"Incorrect payment amount"` for both over/underpayment

#### Rationale

1. **Simpler contract logic** - No need to handle refunds
2. **Gas savings** - No additional transaction for refund
3. **Clearer intent** - Exact amounts are less error-prone
4. **Frontend friendly** - Frontend can show exact amount to send
5. **No accidental overpayment** - Users protected from mistakes

#### Files Updated

1. **test/nft/NFTMarketplace.test.ts**
   - Removed `"Should refund excess payment"` test
   - Changed `"Should reject purchase with insufficient payment"` to two tests:
     - `"Should reject purchase with incorrect payment (less than price)"`
     - `"Should reject purchase with incorrect payment (more than price)"`
   - Updated error message in front-running test

2. **test/nft/SecurityTests.test.ts**
   - Changed `"Should prevent underpayment attacks"` to `"Should reject payment with incorrect amount (underpayment)"`
   - Changed `"Should correctly refund overpayment"` to `"Should reject payment with incorrect amount (overpayment)"`
   - Updated error messages in all payment-related tests

3. **test/nft/README.md**
   - Updated "Payment Security" section to reflect exact payment requirement
   - Changed error message documentation from `"Insufficient payment"` to `"Incorrect payment amount"`

4. **test/nft/IMPLEMENTATION_NOTES.md**
   - Updated code example to use `require(msg.value == listing.price, "Incorrect payment amount")`
   - Removed refund logic from example
   - Updated payment flow diagram

#### Implementation Impact

When implementing the NietzschessNFTMarketplace contract, use:

```solidity
// ✅ CORRECT - Exact payment required
require(msg.value == listing.price, "Incorrect payment amount");

// ❌ WRONG - Old implementation
require(msg.value >= listing.price, "Insufficient payment");
if (msg.value > listing.price) {
    payable(msg.sender).transfer(msg.value - listing.price);
}
```

#### Test Coverage

The test suite now verifies:

- ✅ Exact payment works
- ✅ Underpayment is rejected
- ✅ Overpayment is rejected
- ✅ Error message is correct
- ✅ State remains consistent after failed purchases
- ✅ Front-running with incorrect price fails

#### Breaking Changes

None - this is a new test suite for a not-yet-implemented contract.

#### Migration Notes

If you had started implementing the contract with refund logic, you'll need to:

1. Remove the refund logic from `purchaseItem`
2. Change `require(msg.value >= price)` to `require(msg.value == price)`
3. Update the error message to `"Incorrect payment amount"`
4. Remove any tests or code related to overpayment refunds
