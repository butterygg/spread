// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovernanceToken is ERC20 {
    uint256 constant _initial_supply = 1000000000 * (10**18);

    constructor() public ERC20("GovernanceToken", "GNT") {
        _mint(msg.sender, _initial_supply);
    }
}
