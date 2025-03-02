// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ORTBet is Ownable {
    mapping(address => uint256) public userBalances;
    mapping(address => uint256) public lockedStakes;
    mapping(bytes32 => Game) public games;
    uint256 public constant feeRate = 3;
    uint256 public feesCollected;

    event StakesDeposited(address indexed player, uint256 amount);
    event StakesWithdrawn(address indexed player, uint256 amount);
    event StakesLocked(address indexed player, uint256 amount);
    event StakesUnlocked(address indexed player, uint256 amount);
    event GameStarted(
        bytes32 indexed gameId,
        address indexed player1,
        address indexed player2,
        uint256 stakeAmount
    );
    event GameResolved(bytes32 indexed gameId, GameResult result);

    enum GameResult {
        Draw,
        Player1Won,
        Player2Won
    }

    struct Game {
        address player1;
        address player2;
        uint256 stakeAmount;
        bool active;
    }

    constructor() Ownable(msg.sender) {}

    function depositStakes() external payable {
        require(msg.value > 0, "Deposit amount must be greater than 0.");
        uint256 fee = calculateFee(msg.value);
        userBalances[msg.sender] += msg.value - fee;
        feesCollected += fee;
        emit StakesDeposited(msg.sender, msg.value);
    }

    function withdrawStakes(uint256 amount) external {
        require(amount > 0, "Withdrawal amount must be greater than 0.");
        require(
            userBalances[msg.sender] >= amount,
            "Insufficient funds to withdraw."
        );

        userBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit StakesWithdrawn(msg.sender, amount);
    }

    function startGame(
        string calldata _gameId,
        address _player1,
        address _player2,
        uint256 _stakeAmount
    ) external onlyOwner {
        bytes32 gameIdHash = keccak256(abi.encodePacked(_gameId));
        // Checking stakeAmount just to see if the struct was initiated before.
        require(games[gameIdHash].stakeAmount == 0, "Game ID already exists.");
        require(
            _player1 != address(0) && _player2 != address(0),
            "Invalid player address."
        );
        require(_stakeAmount > 0, "_stakeAmount must be greater than 0.");
        require(
            userBalances[_player1] >= _stakeAmount,
            "Player1 has insufficient funds."
        );
        require(
            userBalances[_player2] >= _stakeAmount,
            "Player2 has insufficient funds."
        );

        // Calculate game starting fee
        uint256 feeFromEachPlayer = calculateFee(_stakeAmount) / 2;
        uint256 stakeAfterFeeDeduction = _stakeAmount - feeFromEachPlayer;
        // Lock stakes
        userBalances[_player1] -= stakeAfterFeeDeduction;
        userBalances[_player2] -= stakeAfterFeeDeduction;
        lockedStakes[_player1] += stakeAfterFeeDeduction;
        lockedStakes[_player2] += stakeAfterFeeDeduction;
        feesCollected += feeFromEachPlayer * 2;

        games[gameIdHash] = Game({
            player1: _player1,
            player2: _player2,
            stakeAmount: stakeAfterFeeDeduction,
            active: true
        });

        emit StakesLocked(_player1, stakeAfterFeeDeduction);
        emit StakesLocked(_player2, stakeAfterFeeDeduction);
        emit GameStarted(gameIdHash, _player1, _player2, _stakeAmount);
    }

    function resolveGame(
        bytes32 _gameId,
        GameResult _result
    ) external onlyOwner {
        require(
            games[_gameId].active,
            "Game either not created or is already finished."
        );
        Game storage game = games[_gameId];

        lockedStakes[game.player1] -= game.stakeAmount;
        lockedStakes[game.player2] -= game.stakeAmount;

        if (_result == GameResult.Player1Won) {
            // Transfer stakes to player 1
            userBalances[game.player1] += game.stakeAmount * 2;
            emit StakesUnlocked(game.player1, game.stakeAmount * 2);
        } else if (_result == GameResult.Player2Won) {
            // Transfer stakes to player 2
            userBalances[game.player2] += game.stakeAmount * 2;
            emit StakesUnlocked(game.player2, game.stakeAmount * 2);
        } else if (_result == GameResult.Draw) {
            // Refund both players
            userBalances[game.player1] += game.stakeAmount;
            userBalances[game.player2] += game.stakeAmount;
            emit StakesUnlocked(game.player1, game.stakeAmount);
            emit StakesUnlocked(game.player2, game.stakeAmount);
        }

        game.active = false;

        // Emit the game resolved event
        emit GameResolved(_gameId, _result);
    }

    function calculateFee(uint256 _amount) public pure returns (uint256) {
        return (_amount / 10000) * feeRate;
    }

    receive() external payable {
        revert("Direct deposits not allowed.");
    }

    function getBalance(address _userAddress) external view returns (uint256) {
        return userBalances[_userAddress];
    }

    function getLockedStake(
        address _userAddress
    ) external view returns (uint256) {
        return lockedStakes[_userAddress];
    }

    function getGame(bytes32 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }
}
