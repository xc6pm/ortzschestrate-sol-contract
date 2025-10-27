// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NietzschessNFTMarketplace is Ownable, Pausable, ReentrancyGuard {
    uint256 public platformFee = 250; // 2.5%
    uint256 public feesCollected;
    mapping(address => bool) approvedNFTs;
    mapping(address => mapping(uint256 => Listing)) listings;

    struct Listing {
        address seller;
        uint256 price;
        string metadata;
    }

    event ItemListed(
        address nftContract,
        uint256 tokenId,
        address seller,
        uint256 price,
        string metadata
    );
    event ItemDelisted(address nftContract, uint256 tokenId, address seller);
    event ItemSold(
        address nftContract,
        uint256 tokenId,
        address seller,
        address buyer,
        uint256 price
    );
    event ItemPriceUpdated(
        address nftContract,
        uint256 tokenId,
        uint256 oldPrice,
        uint256 newPrice
    );
    event ItemMetadataUpdated(
        address nftContract,
        uint256 tokenId,
        string oldMetadata,
        string newMetadata
    );
    event NFTApproved(address nftContract);
    event NFTRemoved(address nftContract);

    constructor() Ownable(msg.sender) {}

    // Functions to implement:
    function addApprovedNFT(address nftContract) external onlyOwner {
        approvedNFTs[nftContract] = true;
        emit NFTApproved(nftContract);
    }

    function removeApprovedNFT(address nftContract) external onlyOwner {
        delete approvedNFTs[nftContract];
        emit NFTRemoved(nftContract);
    }

    function isApprovedNFT(address nftContract) public view returns (bool) {
        return approvedNFTs[nftContract];
    }

    function listItem(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        string memory metadata
    ) external whenNotPaused {
        require(isApprovedNFT(nftContract), "NFT contract not approved");
        require(!isItemListed(nftContract, tokenId), "Item already listed");
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the owner of NFT"
        );
        require(price > 0, "Price must be greater than zero");
        require(
            IERC721(nftContract).getApproved(tokenId) == address(this) ||
                IERC721(nftContract).isApprovedForAll(
                    msg.sender,
                    address(this)
                ),
            "Marketplace not approved for NFT"
        );

        listings[nftContract][tokenId] = Listing(msg.sender, price, metadata);

        emit ItemListed(nftContract, tokenId, msg.sender, price, metadata);
    }

    function delistItem(
        address nftContract,
        uint256 tokenId
    ) external whenNotPaused itemListed(nftContract, tokenId) {
        require(
            listings[nftContract][tokenId].seller == msg.sender,
            "Not the seller"
        );
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the owner of NFT"
        );

        delete listings[nftContract][tokenId];

        emit ItemDelisted(nftContract, tokenId, msg.sender);
    }

    function purchaseItem(
        address nftContract,
        uint256 tokenId
    )
        external
        payable
        whenNotPaused
        nonReentrant
        itemListed(nftContract, tokenId)
        sellerStillOwnsItem(nftContract, tokenId)
    {
        require(
            msg.value == listings[nftContract][tokenId].price,
            "Incorrect payment amount"
        );
        require(
            IERC721(nftContract).getApproved(tokenId) == address(this) ||
                IERC721(nftContract).isApprovedForAll(
                    listings[nftContract][tokenId].seller,
                    address(this)
                ),
            "Marketplace not approved for NFT"
        );
        require(
            IERC721(nftContract).ownerOf(tokenId) != msg.sender,
            "Cannot purchase own item"
        );

        address seller = listings[nftContract][tokenId].seller;
        delete listings[nftContract][tokenId];

        // Transfer the NFT to the buyer
        IERC721(nftContract).safeTransferFrom(seller, msg.sender, tokenId);

        // Cut the fee and pay the seller
        uint256 fee = (msg.value * platformFee) / 10000;
        (bool sent, ) = payable(seller).call{value: msg.value - fee}("");
        require(sent, "Failed to send ETH");

        feesCollected += fee;

        emit ItemSold(nftContract, tokenId, seller, msg.sender, msg.value);
    }

    function updateItemPrice(
        address nftContract,
        uint256 tokenId,
        uint256 newPrice
    )
        public
        whenNotPaused
        itemListed(nftContract, tokenId)
        sellerStillOwnsItem(nftContract, tokenId)
    {
        require(
            listings[nftContract][tokenId].seller == msg.sender,
            "Not the seller"
        );
        require(newPrice > 0, "Price must be greater than zero");

        if (listings[nftContract][tokenId].price == newPrice) {
            return;
        }

        uint256 oldPrice = listings[nftContract][tokenId].price;
        listings[nftContract][tokenId].price = newPrice;

        emit ItemPriceUpdated(nftContract, tokenId, oldPrice, newPrice);
    }

    function updateItemMetadata(
        address nftContract,
        uint256 tokenId,
        string memory newMetadata
    )
        public
        whenNotPaused
        itemListed(nftContract, tokenId)
        sellerStillOwnsItem(nftContract, tokenId)
    {
        require(
            listings[nftContract][tokenId].seller == msg.sender,
            "Not the seller"
        );

        if (
            keccak256(
                abi.encodePacked(listings[nftContract][tokenId].metadata)
            ) == keccak256(abi.encodePacked(newMetadata))
        ) {
            return;
        }

        string memory oldMetadata = listings[nftContract][tokenId].metadata;
        listings[nftContract][tokenId].metadata = newMetadata;

        emit ItemMetadataUpdated(
            nftContract,
            tokenId,
            oldMetadata,
            newMetadata
        );
    }

    function updateItem(
        address nftContract,
        uint256 tokenId,
        uint256 newPrice,
        string memory newMetadata
    )
        external
        whenNotPaused
        itemListed(nftContract, tokenId)
        sellerStillOwnsItem(nftContract, tokenId)
    {
        updateItemPrice(nftContract, tokenId, newPrice);
        updateItemMetadata(nftContract, tokenId, newMetadata);
    }

    function getListing(
        address nftContract,
        uint256 tokenId
    ) external view returns (Listing memory) {
        return listings[nftContract][tokenId];
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = feesCollected;
        if (amount == 0) return;
        feesCollected = 0;
        payable(msg.sender).transfer(amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function isItemListed(
        address nftContract,
        uint256 tokenId
    ) public view returns (bool) {
        return listings[nftContract][tokenId].seller != address(0);
    }

    function calcFee(uint256 amount) public view returns (uint256) {
        return (amount * platformFee) / 10000;
    }

    modifier itemListed(address nftContract, uint256 tokenId) {
        require(isItemListed(nftContract, tokenId), "Item not listed");
        _;
    }

    // This ensures the item is still valid on this shop
    // (i.e. ownership not transferred by some other party).
    modifier sellerStillOwnsItem(address nftContract, uint256 tokenId) {
        if (
            IERC721(nftContract).ownerOf(tokenId) !=
            listings[nftContract][tokenId].seller
        ) {
            delete listings[nftContract][tokenId];
            revert SellerNoLongerOwnsItem(nftContract, tokenId);
        }
        _;
    }

    // Indicates the contract has detected that a listed item is no longer owned by its seller.
    // The item will be removed from the system following this error.
    error SellerNoLongerOwnsItem(address nftContract, uint256 tokenId);
}
