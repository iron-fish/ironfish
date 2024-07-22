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
        // Replace this hardcoded address with address(this) once we find a way to hardcode the
        // global address of the contract
        emit Shield(ironfishAddress, 0, 0xc0ffee254729296a45a3885639AC7E10F9d54979, msg.value);
    }

    function unshield(uint tokenId, uint amount) public {
        emit UnShield(msg.sender, tokenId, amount);
    }

    function unshield_iron(address payable _to, uint amount) public {
        _to.transfer(amount);
        emit UnShield(address(this), 0, amount);
    }
}
