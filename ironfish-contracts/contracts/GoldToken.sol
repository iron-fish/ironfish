// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IIronfish {
    function shield(bytes32 ironfishAddress, uint tokenId, uint amount) external;
}

contract GoldToken is ERC20 {
    IIronfish public ironfishContract;

    constructor(uint256 initialSupply, address ironfishContractAddress) ERC20("GoldToken", "GTK") {
        _mint(msg.sender, initialSupply);
        ironfishContract = IIronfish(ironfishContractAddress);
    }

    function shield(bytes32 ironfishAddress, uint amount) public {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        _transfer(msg.sender, address(this), amount);
        ironfishContract.shield(ironfishAddress, 1, amount);
    }
}