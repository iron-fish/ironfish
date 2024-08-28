pragma solidity ^0.8.18;

// SPDX-License-Identifier: MIT

contract Counter {
    uint public count = 1;
    
    function increment() external {
        count += 1;
    }
}