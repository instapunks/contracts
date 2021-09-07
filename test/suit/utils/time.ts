import "@nomiclabs/hardhat-ethers"
import { ContractTransaction, ethers } from "ethers/lib/index"

const seconds = (n: number) => n
const minutes = (n: number) => seconds(60) * n
const hours = (n: number) => minutes(60) * n
const days = (n: number) => hours(24) * n
const weeks = (n: number) => days(7) * n
const months = (n: number) => days(30) * n
const years = (n: number) => days(365) * n

export const durations = {
  seconds,
  minutes,
  hours,
  days,
  weeks,
  months,
  years,
}

async function advanceTime(
  provider: ethers.providers.JsonRpcProvider,
  time: number
): Promise<number> {
  await provider.send("evm_increaseTime", [time])
  await provider.send("evm_mine", [])

  return now(provider)
}

async function now(provider: ethers.providers.JsonRpcProvider) {
  return provider.getBlock("latest").then((b) => b.timestamp)
}

async function getTxTime(
  provider: ethers.providers.JsonRpcProvider,
  tx: ContractTransaction
): Promise<number> {
  return provider.getBlock(tx.blockNumber!).then((b) => b.timestamp)
}

export const time = {
  advanceTime,
  getTxTime,
  now,
  nextHour: (provider: ethers.providers.JsonRpcProvider) => advanceTime(provider, hours(1)),
  nextMonth: (provider: ethers.providers.JsonRpcProvider) => advanceTime(provider, months(1)),
  nextYear: (provider: ethers.providers.JsonRpcProvider) => advanceTime(provider, years(1)),
}

export const timeout = async (provider: ethers.providers.JsonRpcProvider, seconds: number) =>
  (await time.now(provider)) + seconds
