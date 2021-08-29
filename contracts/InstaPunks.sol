// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.0 < 0.9.0;

import "./interfaces/IInstaPunks.sol";
import "./interfaces/IInstaPunksOffsetProvider.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./libraries/WadRayMath.sol";

abstract contract InstaPunksState {
    uint256 public mintPrice;
    uint256 public maxSupply;
    uint256 public totalSupply;

    uint256 internal offset;

    uint256 public feeIndex;
    mapping(address => uint256) public holderFeeIndices;
    mapping(address => uint256) public holderFees;

    uint256 devFund;
}

contract InstaPunks is InstaPunksState, ERC721Upgradeable, OwnableUpgradeable, IInstaPunks {
    using WadRayMath for uint256;

    function initialize(uint256 _mintPrice, uint256 _maxSupply, address _offsetProvider) public initializer {
        __ERC721_init("INSTAPUNKS", "IP");
        __Ownable_init_unchained();
        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
        offset = IInstaPunksOffsetProvider(_offsetProvider).getOffset() % _maxSupply;
    }

    receive() external payable {
        uint256 income = msg.value / 2;
        feeIndex += (msg.value - income).wadToRay() / totalSupply;
        devFund += income;
    }

    function mint() external payable override returns (uint256) {
        require(totalSupply < maxSupply, "InstaPunks: max token supply reached");
        require(msg.value >= mintPrice, "InstaPunks: insufficient value");

        uint256 tokenId = (offset + totalSupply++) % maxSupply;
        _mint(msg.sender, tokenId);

        devFund += msg.value;
        return tokenId;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 /*tokenId*/
    ) internal virtual override {
        // Mint
        if (from != address(0)) {
            holderFees[from] += _feeAmount(from);
            holderFeeIndices[from] = feeIndex;
        }
        // Burn
        if (to != address(0)) {
            holderFees[to] += _feeAmount(to);
            holderFeeIndices[to] = feeIndex;
        }
    }

    function _feeAmount(address account) internal view returns (uint256) {
        return ((feeIndex - holderFeeIndices[account]) * balanceOf(account)).rayToWad();
    }

    function calcFeeShare() public view override returns (uint256) {
        return holderFees[msg.sender] + _feeAmount(msg.sender);
    }

    function withdrawFeeShare() external override {
        uint256 feeShare = calcFeeShare();
        if (feeShare == 0) return;

        holderFees[msg.sender] = 0;
        holderFeeIndices[msg.sender] = feeIndex;

        (bool sent, ) = msg.sender.call{value: feeShare}("");
        require(sent, "InstaPunks: failed to send Ether");
    }

    function withdrawDevFund(address to) public onlyOwner {
        uint256 amount = devFund;
        if (amount == 0) return;
        devFund = 0;
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "InstaPunks: failed to send Ether");
    }
}