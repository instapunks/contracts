// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.0 < 0.9.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./interfaces/IInstaPunksOffsetProvider.sol";

contract InstaPunksOffsetProvider is VRFConsumerBase, IInstaPunksOffsetProvider {

    bytes32 internal keyHash;
    uint256 internal fee;

    uint256 internal offset;

    constructor(address VRFCoordinator, address LINK, bytes32 _keyHash, uint256 _fee) VRFConsumerBase(VRFCoordinator, LINK) {
        keyHash = _keyHash;
        fee = _fee;
    }

    function initialize() public {
        require(offset == 0, "InstaPunks: offset has already been initialized");
        require(LINK.balanceOf(address(this)) >= fee, "InstaPunks: not enough LINK");
        requestRandomness(keyHash, fee);
    }

    function fulfillRandomness(bytes32 /*requestId*/, uint256 randomness) internal override {
        require(offset == 0, "InstaPunks: offset has already been initialized");
        offset = randomness;
    }

    function getOffset() external override view returns(uint256) {
        require(offset > 0, "InstaPunks: offset is not initialized yet");
        return offset;
    }
}