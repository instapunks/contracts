//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 < 0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IInstaPunks is IERC721Upgradeable {
    function mint(uint256 count) external payable;

    function calcFee() external view returns (uint256);

    function claimFee() external;
}