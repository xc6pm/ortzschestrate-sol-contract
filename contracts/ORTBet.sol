// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ORTBet is Ownable {
    mapping(address => uint256) public userBalances;
    mapping(address => uint256) public lockedStakes;
    mapping(bytes32 => Game) public games;
    mapping(address => address[]) public backupAddresses;
    uint256 public constant feePercentage = 3;
    uint256 public constant maxBackupAddresses = 3;
    uint256 public feesCollected;

    event StakesDeposited(
        address indexed player,
        address indexed depositAddress,
        uint256 amount
    );
    event StakesWithdrawn(
        address indexed player,
        address indexed withdrawalAddress,
        uint256 amount
    );
    event StakesLocked(address indexed player, uint256 amount);
    event StakesUnlocked(address indexed player, uint256 amount);
    event GameStarted(
        bytes32 indexed gameId,
        address indexed player1,
        address indexed player2,
        uint256 stakeAmount
    );
    event GameResolved(bytes32 indexed gameId, GameResult result);
    event BackupAddressAdded(
        address indexed backupAddress,
        address indexed owner
    );
    event BackupAddressRemoved(
        address indexed backupAddress,
        address indexed owner
    );
    event FeesWithdrawn(address indexed owner, uint256 amount);

    enum GameResult {
        Draw,
        Player1Won,
        Player2Won
    }

    struct Game {
        address player1;
        address player2;
        uint256 stakeAmount;
        bool ongoing;
    }

    constructor() Ownable(msg.sender) {}

    function depositStakes() external payable {
        require(msg.value > 0, "Deposit amount must be greater than 0.");
        userBalances[msg.sender] += msg.value;
        emit StakesDeposited(msg.sender, msg.sender, msg.value);
    }

    function depositStakes(
        address _mainAddress
    ) external payable onlyBackupAddress(_mainAddress) {
        require(msg.value > 0, "Deposit amount must be greater than 0.");

        userBalances[_mainAddress] += msg.value;
        emit StakesDeposited(_mainAddress, msg.sender, msg.value);
    }

    function withdrawStakes(uint256 _amount) external {
        require(_amount > 0, "Withdrawal amount must be greater than 0.");
        require(
            userBalances[msg.sender] >= _amount,
            "Insufficient funds to withdraw."
        );

        userBalances[msg.sender] -= _amount;
        payable(msg.sender).transfer(_amount);
        emit StakesWithdrawn(msg.sender, msg.sender, _amount);
    }

    function withdrawStakes(
        uint256 _amount,
        address _mainAddress
    ) external onlyBackupAddress(_mainAddress) {
        require(_amount > 0, "Withdrawal amount must be greater than 0.");
        require(
            userBalances[_mainAddress] >= _amount,
            "Insufficient funds to withdraw."
        );

        userBalances[_mainAddress] -= _amount;
        payable(msg.sender).transfer(_amount);
        emit StakesWithdrawn(_mainAddress, msg.sender, _amount);
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
            ongoing: true
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
            games[_gameId].ongoing,
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

        game.ongoing = false;

        // Emit the game resolved event
        emit GameResolved(_gameId, _result);
    }

    function addBackupAddress(address _backupAddress) external {
        require(
            backupAddresses[msg.sender].length < maxBackupAddresses,
            string(
                abi.encodePacked(
                    "Cannot add more than ",
                    Strings.toString(maxBackupAddresses),
                    " backup addresses."
                )
            )
        );
        require(
            _backupAddress != address(0),
            "Backup address cannot be zero address."
        );
        require(
            _backupAddress != msg.sender,
            "Cannot set self as backup address."
        );
        require(
            !contains(backupAddresses[msg.sender], _backupAddress),
            "Backup address already added."
        );

        backupAddresses[msg.sender].push(_backupAddress);
        emit BackupAddressAdded(_backupAddress, msg.sender);
    }

    function removeBackupAddress(address _backupAddress) external {
        require(
            contains(backupAddresses[msg.sender], _backupAddress),
            "Not authorized to remove this recovery address."
        );

        address[] storage backups = backupAddresses[msg.sender];
        for (uint i = 0; i < backups.length; i++) {
            if (backups[i] == _backupAddress) {
                backups[i] = backups[backups.length - 1];
                backups.pop();
                emit BackupAddressRemoved(_backupAddress, msg.sender);
                return;
            }
        }
    }

    function getBackupAddresses(
        address _mainAddress
    ) external view returns (address[] memory) {
        return backupAddresses[_mainAddress];
    }

    function withdrawFees(uint256 _amount) external onlyOwner {
        require(feesCollected >= _amount, "Insufficient fees collected.");

        feesCollected -= _amount;
        payable(msg.sender).transfer(_amount);
        emit FeesWithdrawn(msg.sender, _amount);
    }

    function calculateFee(uint256 _amount) public pure returns (uint256) {
        return (_amount * feePercentage) / 100;
    }

    receive() external payable {
        revert("Direct deposits not allowed.");
    }

    fallback() external payable {
        revert("Function does not exist.");
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

    function contains(
        address[] storage _list,
        address _target
    ) internal view returns (bool) {
        for (uint i = 0; i < _list.length; i++) {
            if (_list[i] == _target) {
                return true;
            }
        }
        return false;
    }

    modifier onlyBackupAddress(address _mainAddress) {
        require(
            contains(backupAddresses[_mainAddress], msg.sender),
            "Caller is not a registered backup address."
        );

        _;
    }
}
