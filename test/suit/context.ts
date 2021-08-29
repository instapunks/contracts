import { InstaPunks, InstaPunks__factory, MockOffsetProvider, MockOffsetProvider__factory } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers, ethers as e } from "hardhat";

export const amountOf = (value: number) =>
  ethers.utils.parseEther(String(value));

export const MINT_PRICE = amountOf(0.05);
export const MAX_SUPPLY = 10;
export const OFFSET = 1;

export class Context {
  instaPunks!: InstaPunks
  offsetProvider!: MockOffsetProvider
  owner!: SignerWithAddress;
  ethers!: typeof e;

  withdrawFeeShare = async (account: SignerWithAddress) => {
    const balanceBefore = await account.getBalance();
    const tx = await (await this.instaPunks.connect(account).withdrawFeeShare()).wait();
    const balanceAfter = await account.getBalance();
    return balanceAfter.sub(balanceBefore).add(tx.cumulativeGasUsed.mul(tx.effectiveGasPrice));
  };

  mint = async (account: SignerWithAddress, value = MINT_PRICE) => {
    return this.instaPunks.connect(account).mint({value});
  }

  waitBlocks = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await this.ethers.provider.send("evm_mine", []);
    }
  };

  sendFee = async (value: number, account = this.owner) =>
    account.sendTransaction({ to: this.instaPunks.address, value: amountOf(value) });

  transferToken = async (from: SignerWithAddress, to: SignerWithAddress, tokenId: number) =>
    await this.instaPunks.connect(from)["safeTransferFrom(address,address,uint256)"](from.address, to.address, tokenId);
}

export const deployContext = async (ethers: typeof e) => {
  const context = new Context()
  context.ethers = ethers
  context.owner = (await ethers.getSigners())[0]

  context.offsetProvider = await new MockOffsetProvider__factory(context.owner).deploy()
  await context.offsetProvider.initialize(OFFSET)

  context.instaPunks = await new InstaPunks__factory(context.owner).deploy();
  await context.instaPunks.initialize(MINT_PRICE, MAX_SUPPLY, context.offsetProvider.address)

  return context;
}