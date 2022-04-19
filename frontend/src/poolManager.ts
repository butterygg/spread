import { ethers, BigNumber } from 'ethers'
import { Decimal } from 'decimal.js'

import WEIGHTED_POOL_FACTORY_ABI from './abi/weightedpoolfactory.json'
import ERC20_ABI from './abi/erc20.json'
import VAULT_ABI from './abi/balancervault.json'
import WEIGHTED_POOL_ABI from './abi/weightedpool.json'

// Contracts
const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const WEIGHTED_POOL_FACTORY = '0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Tokens -- MUST be sorted numerically
const GNT = '0x33c41eE5647c012f8CE9930EE05FC7aF86244921'
const DAI = '0x50c075b3Dc738D3E6372975F74101B0e5780f58f'

export type BigNumberish = string | number | BigNumber

function parseScientific(num: string): string {
  // If the number is not in scientific notation return it as it is
  if (!/\d+\.?\d*e[+-]*\d+/i.test(num)) return num

  // Remove the sign
  const numberSign = Math.sign(Number(num))
  num = Math.abs(Number(num)).toString()

  // Parse into coefficient and exponent
  const [coefficient, exponent] = num.toLowerCase().split('e')
  let zeros = Math.abs(Number(exponent))
  const exponentSign = Math.sign(Number(exponent))
  const [integer, decimals] = (coefficient.indexOf('.') != -1 ? coefficient : `${coefficient}.`).split('.')

  if (exponentSign === -1) {
    zeros -= integer.length
    num =
      zeros < 0
        ? integer.slice(0, zeros) + '.' + integer.slice(zeros) + decimals
        : '0.' + '0'.repeat(zeros) + integer + decimals
  } else {
    if (decimals) zeros -= decimals.length
    num =
      zeros < 0
        ? integer + decimals.slice(0, zeros) + '.' + decimals.slice(zeros)
        : integer + decimals + '0'.repeat(zeros)
  }

  return numberSign < 0 ? '-' + num : num
}

export const bn = (x: BigNumberish | Decimal): BigNumber => {
  if (BigNumber.isBigNumber(x)) return x
  const stringified = parseScientific(x.toString())
  const integer = stringified.split('.')[0]
  return BigNumber.from(integer)
}

export const maxUint = (e: number): BigNumber => bn(2).pow(e).sub(1)

export const MAX_UINT256: BigNumber = maxUint(256)

export const createWeightedPool = async (
  provider: ethers.providers.Web3Provider,
  tokens: string[],
): Promise<string> => {
  const NAME = 'GovernanceToken DAI pool'
  const SYMBOL = '10GNT-90DAI'
  const swapFeePercentage = BigInt(0.005e18) // 0.5%
  const weights = [BigInt(0.1e18), BigInt(0.9e18)]

  const factory = new ethers.Contract(WEIGHTED_POOL_FACTORY, WEIGHTED_POOL_FACTORY_ABI, provider.getSigner())

  const createTx = await factory.create(NAME, SYMBOL, tokens, weights, swapFeePercentage, ZERO_ADDRESS)
  const createTxReceipt = await createTx.wait()

  // We need to get the new pool address out of the PoolCreated event
  const events = createTxReceipt.events.filter((e: any) => e.event === 'PoolCreated')
  const poolAddress = events[0].args.pool
  console.log({ poolAddress })
  return poolAddress
}

export const allowTokens = async (provider: ethers.providers.Web3Provider, tokens: string[]): Promise<void> => {
  // Need to approve the Vault to transfer the tokens!
  // Can do through Etherscan, or programmatically
  for (const i in tokens) {
    const tokenContract = new ethers.Contract(tokens[i], ERC20_ABI, provider.getSigner())
    await tokenContract.approve(VAULT, MAX_UINT256)
  }

  console.log({ MAX_UINT256 })
}

export const getVault = async (provider: ethers.providers.Web3Provider): Promise<ethers.Contract> => {
  const vault = new ethers.Contract(VAULT, VAULT_ABI, provider.getSigner())
  console.log({ vault })
  return vault
}

export const join = async (
  provider: ethers.providers.Web3Provider,
  safeAddr: string,
  vault: ethers.Contract,
  poolId: string,
  initialBalances: bigint[],
  tokens: string[],
  maxAmountsIn: bigint[],
  fromInternalBalance: boolean,
): Promise<any> => {
  // Construct userData
  const JOIN_KIND_INIT = 0
  const initUserData = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256[]'], [JOIN_KIND_INIT, initialBalances])

  // joins are done on the Vault
  console.log({ safeAddr })
  const joinPoolRequest = {
    assets: tokens,
    maxAmountsIn: maxAmountsIn,
    userData: initUserData,
    fromInternalBalance: fromInternalBalance,
  }

  const joinTx = await vault.joinPool(poolId, safeAddr, safeAddr, joinPoolRequest)
  console.log({ joinTx })
  return joinTx
}

export const deployPool = async (provider: ethers.providers.Web3Provider, safeAddr: string) => {
  // Tokens -- MUST be sorted numerically
  const tokens = [GNT, DAI]

  // const poolAddress = await poolManager.createWeightedPool(provider, tokens)
  const poolAddress = '0xde620bb8be43ee54d7aa73f8e99a7409fe511084'

  // We're going to need the PoolId later, so ask the contract for it
  // const pool = await ethers.getContractAt('WeightedPool', poolAddress)
  const pool = new ethers.Contract(poolAddress, WEIGHTED_POOL_ABI, provider)
  const poolId: string = await pool.getPoolId()

  console.log({ poolId })

  const vault = await getVault(provider)

  // Tokens must be in the same order
  // Values must be decimal-normalized!
  const initialBalances = [BigInt(1e6), BigInt(1e6)]
  console.log({ initialBalances })

  await allowTokens(provider, tokens)

  const joinTx = await join(
    provider,
    safeAddr,
    vault,
    poolId,
    initialBalances,
    tokens,
    initialBalances, // [XXX] Rather use the js equiv to type(uint256).max;
    false,
  )

  // You can wait for it like this, or just print the tx hash and monitor
  const jointTxReceipt = await joinTx.wait()
  console.log({ jointTxReceipt })
}
