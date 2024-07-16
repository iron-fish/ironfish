// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract Ironfish {
    event Shield(
        bytes32 ironfishAddress,
        bytes32 ironfishAssetId,
        address contractAddress,
        uint amount
    );

    constructor() {}

    function shield(
        bytes32 ironfishAddress,
        bytes32 ironfishAssetId,
        uint amount
    ) public {
        // msg.sender is the contract address of the ERC20 token
        emit Shield(ironfishAddress, ironfishAssetId, msg.sender, amount);
    }
}
