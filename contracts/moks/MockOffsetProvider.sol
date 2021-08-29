// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.0 < 0.9.0;

contract MockOffsetProvider {

    uint256 internal offset;

    function initialize(uint256 _offset) public {
        offset = _offset;
    }

    function getOffset() external returns(uint256) {
        require(offset > 0, "InstaPunks: offset is not initialized yet");
        return offset;
    }
}