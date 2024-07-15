// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract Ironfish {
    event Shield(string assetId, uint amount);

    constructor() {}

    function shield(string calldata assetId, uint amount) public {
        emit Shield(assetId, amount);
    }
}
