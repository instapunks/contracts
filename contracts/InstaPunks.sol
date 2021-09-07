// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.8.0 < 0.9.0;

import "hardhat/console.sol";

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
    uint256 public maxMintCount;

    uint256 internal offset;

    uint256 public feeIndex;
    mapping(address => uint256) public holderFeeIndices;
    mapping(address => uint256) public holderFees;

    uint256 undistributedFee;
    uint256 undistributedFeeTimestamp;
    uint256 dailyFeeDistribution;

    uint256 balance;
    uint256 devFund;

    string baseURI;
}

contract InstaPunks is InstaPunksState, ERC721Upgradeable, OwnableUpgradeable, IInstaPunks {
    using WadRayMath for uint256;
    using StringsUpgradeable for uint256;

    function initialize(uint256 _mintPrice, uint256 _maxSupply, uint256 _maxMintCount, address _offsetProvider) public initializer {
        //        __ERC721_init("INSTAPUNKS", "IP");
        __ERC721_init("Test NFT", "TNFT");
        // FIXME
        __Ownable_init_unchained();
        offset = IInstaPunksOffsetProvider(_offsetProvider).getOffset();
        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
        maxMintCount = _maxMintCount;
    }

    receive() external payable {
    }

    // Token
    function mint(uint256 count) external payable override {
        require(totalSupply < maxSupply, "InstaPunks: max token supply reached");
        require(count > 0, "InstaPunks: unable to mint 0 tokens");
        require(count <= maxMintCount, "InstaPunks: max mint count exceeded");
        require(msg.value >= mintPrice * count, "InstaPunks: insufficient value");

        for (uint256 i = 0; i < count; i++) {
            _mint(msg.sender, totalSupply + i);
        }

        totalSupply += count;
        devFund += msg.value;
        balance += msg.value;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 /*tokenId*/
    ) internal virtual override {
        _distributeFee();
        uint256 _feeIndex = feeIndex;
        // Mint
        if (from != address(0)) {
            holderFees[from] += _feeAmount(_feeIndex, from);
            holderFeeIndices[from] = _feeIndex;
        }
        // Burn
        if (to != address(0)) {
            holderFees[to] += _feeAmount(_feeIndex, to);
            holderFeeIndices[to] = _feeIndex;
        }
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, ((tokenId + offset) % maxSupply).toString())) : "";
    }

    function setBaseURI(string calldata _baseURI) public onlyOwner {
        baseURI = _baseURI;
    }

    // Fee
    function processFee() public onlyOwner {
        uint256 feeAmount = address(this).balance - balance;
        if (feeAmount == 0) {
            return;
        }

        _distributeFee();

        if (undistributedFeeTimestamp == 0 || (block.timestamp - undistributedFeeTimestamp) > 1 days) {
            undistributedFeeTimestamp = block.timestamp;
        }

        uint256 devFundShare = feeAmount / 2;

        devFund += devFundShare;
        balance += feeAmount;

        undistributedFee += feeAmount - devFundShare;
        dailyFeeDistribution = undistributedFee / 31;
    }

    function _accruedFeeAmount() internal view returns (uint256) {
        uint256 _undistributedFee = undistributedFee;
        if (_undistributedFee == 0) {
            return 0;
        }

        uint256 distributionPeriod = (block.timestamp - undistributedFeeTimestamp) / 1 days;
        if (distributionPeriod == 0) {
            return 0;
        }

        uint256 feeDistributionAmount = dailyFeeDistribution * distributionPeriod;
        return _undistributedFee < feeDistributionAmount ? undistributedFee : feeDistributionAmount;
    }

    function _distributeFee() internal {
        if (undistributedFee == 0) {
            return;
        }

        uint256 accruedFeeAmount = _accruedFeeAmount();
        if (accruedFeeAmount == 0) {
            return;
        }

        undistributedFee -= accruedFeeAmount;
        feeIndex += accruedFeeAmount.wadToRay() / totalSupply;
        undistributedFeeTimestamp = block.timestamp;
    }

    function calcFee() public view override returns (uint256) {
        return holderFees[msg.sender] + _feeAmount(feeIndex + _accruedFeeAmount().wadToRay() / totalSupply, msg.sender);
    }

    function claimFee() external override {
        _distributeFee();
        uint256 fee = holderFees[msg.sender] + _feeAmount(feeIndex, msg.sender);
        if (fee == 0) return;

        balance -= fee;
        holderFees[msg.sender] = 0;
        holderFeeIndices[msg.sender] = feeIndex;

        (bool sent,) = msg.sender.call{value : fee}("");
        require(sent, "InstaPunks: failed to send Ether");
    }

    function _feeAmount(uint256 feeIndex, address account) internal view returns (uint256) {
        return ((feeIndex - holderFeeIndices[account]) * balanceOf(account)).rayToWad();
    }

    // Dev Fund
    function withdrawDevFund(address to) public onlyOwner {
        uint256 amount = devFund;
        if (amount == 0) return;
        devFund = 0;
        balance -= amount;
        (bool sent,) = to.call{value : amount}("");
        require(sent, "InstaPunks: failed to send Ether");
    }
}