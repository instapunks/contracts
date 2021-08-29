//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.0 < 0.9.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IInstaPunksOffsetProvider {

    function getOffset() external view returns(uint256);

}