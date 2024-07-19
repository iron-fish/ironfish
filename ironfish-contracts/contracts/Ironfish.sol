// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract Ironfish {
    event Shield(
        bytes32 ironfishAddress,
        uint tokenId,
        address contractAddress,
        uint amount
    );

    event UnShield(
        address contractAddress,
        uint tokenId,
        uint amount
    );

    constructor() {}

    function shield(
        bytes32 ironfishAddress,
        uint tokenId,
        uint amount
    ) public {
        // msg.sender is the contract address of the ERC20 token
        emit Shield(ironfishAddress, tokenId, msg.sender, amount);
    }

    function shield_iron(bytes32 ironfishAddress) public payable {
        emit Shield(ironfishAddress, 0, address(this), msg.value);
    }

    function unshield(uint tokenId, uint amount) public {
        emit UnShield(msg.sender, tokenId, amount);
    }

    function unshield_iron(address payable _to, uint amount) public {
        _to.transfer(amount);
        emit UnShield(address(this), 0, amount);
    }
}
