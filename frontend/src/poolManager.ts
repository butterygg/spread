import { ethers } from 'ethers'

import WEIGHTED_POOL_FACTORY_ABI from './abi/weightedpoolfactory.json'
import ERC20_ABI from './abi/erc20.json'
import VAULT_ABI from './abi/balancervault.json'
import WEIGHTED_POOL_ABI from './abi/weightedpool.json'
import { JoinPoolRequest } from '@balancer-labs/sdk'

// Contracts
const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
const WEIGHTED_POOL_FACTORY = '0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Tokens -- MUST be sorted numerically
const GNT = '0x33c41eE5647c012f8CE9930EE05FC7aF86244921'
const DAI = '0xc7AD46e0b8a400Bb3C915120d284AafbA8fc4735'

export const createWeightedPool = async (
  provider: ethers.providers.Web3Provider,
  tokens: string[],
): Promise<string> => {
  console.log('Creating weighted pool…')
  const NAME = 'GovernanceToken DAI pool v2'
  const SYMBOL = 'xGNT-yDAI'
  const swapFeePercentage = BigInt(0.005e18) // 0.5%
  const weights = [BigInt(0.1e18), BigInt(0.9e18)]

  const factory = new ethers.Contract(WEIGHTED_POOL_FACTORY, WEIGHTED_POOL_FACTORY_ABI, provider.getSigner())

  const createTx = await factory.create(NAME, SYMBOL, tokens, weights, swapFeePercentage, ZERO_ADDRESS)
  const createTxReceipt = await createTx.wait()

  console.log({ createTxReceipt })

  // We need to get the new pool address out of the PoolCreated event
  const events = createTxReceipt.events.filter((e: ethers.Event) => e.event === 'PoolCreated')
  const poolAddress = events[0].args.pool
  console.log({ poolAddress })
  return poolAddress
}

export const allowTokens = async (
  provider: ethers.providers.Web3Provider,
  safeAddr: string,
  tokens: string[],
  allowances: BigInt[],
) => {
  console.log('Giving tokens allowances…')

  // Need to approve the Vault to transfer the tokens!
  // Can do through Etherscan, or programmatically
  return tokens.map(async (token, idx) => {
    const allowance = allowances[idx]
    const tokenContract = new ethers.Contract(token, ERC20_ABI, provider.getSigner())
    const existingAllowance = await tokenContract.allowance(safeAddr, VAULT)

    if (existingAllowance > allowance) {
      console.log({ [`token ${token} allowance of ${allowance} already exists`]: existingAllowance })
      return
    }

    const tx = (await tokenContract.approve(VAULT, allowance)) as ethers.ContractTransaction
    console.log({
      [`tx for token ${token} allowance ${allowance}`]: tx,
    })
    return tx
  })
}

export const getVault = async (provider: ethers.providers.Web3Provider): Promise<ethers.Contract> => {
  const vault = new ethers.Contract(VAULT, VAULT_ABI, provider.getSigner())
  console.log({ vault })
  return vault
}

export const join = async (
  vault: ethers.Contract,
  safeAddr: string,
  poolId: string,
  initialBalances: BigInt[],
  tokens: string[],
  maxAmountsIn: BigInt[],
  fromInternalBalance: boolean,
): Promise<ethers.ContractTransaction> => {
  console.log('Joining the pool…')

  // Construct userData
  const JOIN_KIND_INIT = 0
  const initUserData = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256[]'], [JOIN_KIND_INIT, initialBalances])
  console.log({ initUserData })

  // joins are done on the Vault
  const joinPoolRequest: JoinPoolRequest = {
    assets: tokens,
    maxAmountsIn: maxAmountsIn.map(ethers.BigNumber.from),
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

  // [TODO] Check if an equivalent pool already exists, if possible. Otherwise require a front-end input
  const poolAddress = await createWeightedPool(provider, tokens)
  // const poolAddress = '0x39cd55ff7e7d7c66d7d2736f1d5d4791cdab895b'

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

  await allowTokens(provider, safeAddr, tokens, initialBalances)

  console.log({
    provider,
    safeAddr,
    vault,
    poolId,
    initialBalances,
    tokens,
  })

  // [TODO] Must check if already joined. This might actually directly change the front-end.
  const joinTx = await join(vault, safeAddr, poolId, initialBalances, tokens, initialBalances, false)

  // You can wait for it like this, or just print the tx hash and monitor
  console.log({ joinTx })
  const jointTxReceipt = await joinTx.wait()
  console.log({ jointTxReceipt })
}
