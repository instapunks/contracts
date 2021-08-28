//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 < 0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IInstaPunks is IERC721Upgradeable {
    function mint() external payable returns (uint256);

    function calcFeeShare() external view returns (uint256);

    function withdrawFeeShare() external;
}