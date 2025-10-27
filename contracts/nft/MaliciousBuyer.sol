// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface INietzschessNFTMarketplace {
    function purchaseItem(
        address nftContract,
        uint256 tokenId
    ) external payable;
}

/**
 * @title MaliciousBuyer
 * @notice Test contract that attempts to perform reentrancy attack on marketplace
 * @dev This contract is ONLY for testing purposes to verify reentrancy protection
 */
contract MaliciousBuyer is IERC721Receiver {
    INietzschessNFTMarketplace public marketplace;
    address public nftContract;
    uint256 public tokenId;
    bool public attackInProgress;

    constructor(address _marketplace) {
        marketplace = INietzschessNFTMarketplace(_marketplace);
    }

    /**
     * @notice Initiates the attack by attempting to purchase an NFT
     * @dev Will trigger onERC721Received during the purchase, attempting reentrancy
     */
    function attack(address _nftContract, uint256 _tokenId) external payable {
        nftContract = _nftContract;
        tokenId = _tokenId;
        attackInProgress = true;

        // Initial purchase attempt
        marketplace.purchaseItem{value: msg.value}(_nftContract, _tokenId);

        attackInProgress = false;
    }

    /**
     * @notice ERC721 receiver hook that attempts reentrancy attack
     * @dev Called when marketplace transfers NFT via safeTransferFrom
     */
    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        // Attempt reentrancy if we're in the middle of an attack
        if (attackInProgress && address(marketplace).balance > 0) {
            // Try to purchase the same item again (reentrancy attempt)
            // This should fail due to ReentrancyGuard
            marketplace.purchaseItem{value: address(this).balance}(
                nftContract,
                _tokenId
            );
        }

        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @notice Fallback function that attempts reentrancy attack
     * @dev Called when marketplace sends ETH, tries to purchase again
     */
    receive() external payable {
        // Attempt reentrancy if we're in the middle of an attack
        if (attackInProgress && address(marketplace).balance > 0) {
            // Try to purchase the same item again (reentrancy attempt)
            marketplace.purchaseItem{value: msg.value}(nftContract, tokenId);
        }
    }

    /**
     * @notice Allows the attacker to withdraw any NFTs received
     */
    function withdrawNFT(
        address _nftContract,
        uint256 _tokenId,
        address to
    ) external {
        IERC721(_nftContract).transferFrom(address(this), to, _tokenId);
    }

    /**
     * @notice Allows the attacker to withdraw any ETH received
     */
    function withdrawETH() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
