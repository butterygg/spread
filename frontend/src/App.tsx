import { ReactElement, useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import { PieChart } from 'react-minimal-pie-chart'
import { ethers } from 'ethers'
import { Button, Title, Card, Divider, GenericModal, Select } from '@gnosis.pm/safe-react-components'
import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk'
import SafeAppsSDK from '@gnosis.pm/safe-apps-sdk/dist/src/sdk'
import { SafeAppProvider } from '@gnosis.pm/safe-apps-provider'

// import WEIGHTED_POOL_FACTORY_ABI from './weightedpoolfactory.json'
import WEIGHTED_POOL_ABI from './weightedpool.json'
import VAULT_ABI from './balancervault.json'
// import ERC20_ABI from './erc20.json'

type AsyncReturnType<T extends (...args: any) => Promise<any>> = T extends (...args: any) => Promise<infer R> ? R : any

const Container = styled.div`
  padding: 1rem;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
`

const Table = styled.table`
  text-align: left;
`

type TagProps = {
  background: string
}
const Tag = styled.span<TagProps>`
  padding: 0.3em;
  border-radius: 1em;
  position: relative;
  background: ${(props) => props.background}40;
  text-align: center;
  line-height: 50px;
`

const getBalances = async (sdk: SafeAppsSDK) => {
  const safeBalanceResponse = await sdk.safe.experimental_getBalances()
  const ERC20Balances = safeBalanceResponse.items.filter(
    (token) => token.tokenInfo.type === 'ERC20' || token.tokenInfo.type === 'NATIVE_TOKEN',
  )
  console.log({ ERC20Balances })
  const simpleBalances = ERC20Balances.map((token) => ({
    name: token.tokenInfo.name,
    symbol: token.tokenInfo.symbol,
    balance: parseFloat(token.balance),
    // ⚠️ Hardcoded GNT:USD
    fiatBalance:
      parseFloat(token.fiatConversion) === 0
        ? parseFloat(token.balance) / 10000000000000000000000
        : parseFloat(token.fiatBalance),
  }))
  console.debug({ simpleBalances })
  return simpleBalances
}

const colorOfToken = (symbol: string) => {
  switch (symbol) {
    case 'DAI':
      return '#fff000'
    case 'GNT':
      return '#DDDDE3'
    case 'ETH':
      return '#000AFF'
    default:
      return '#EF0000'
  }
}

/////////////

const deployPool = async (provider: ethers.providers.Web3Provider, safeAddr: string) => {
  // Contracts
  const VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
  // const WEIGHTED_POOL_FACTORY = '0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9'
  // const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

  // Tokens -- MUST be sorted numerically
  const GNT = '0x33c41eE5647c012f8CE9930EE05FC7aF86244921'
  const DAI = '0x50c075b3Dc738D3E6372975F74101B0e5780f58f'
  const tokens = [GNT, DAI]

  // const NAME = 'GovernanceToken DAI pool'
  // const SYMBOL = '10GNT-90DAI'
  // const swapFeePercentage = BigInt(0.005e18) // 0.5%
  // const weights = [BigInt(0.1e18), BigInt(0.9e18)]

  // const factory = new ethers.Contract(WEIGHTED_POOL_FACTORY, WEIGHTED_POOL_FACTORY_ABI, provider.getSigner())

  // const tx = await factory.create(NAME, SYMBOL, tokens, weights, swapFeePercentage, ZERO_ADDRESS)
  // const receipt = await tx.wait()

  // // We need to get the new pool address out of the PoolCreated event
  // const events = receipt.events.filter((e: any) => e.event === 'PoolCreated')
  // const poolAddress = events[0].args.pool
  // console.log({ poolAddress })

  const poolAddress = '0xde620bb8be43ee54d7aa73f8e99a7409fe511084'

  // We're going to need the PoolId later, so ask the contract for it
  // const pool = await ethers.getContractAt('WeightedPool', poolAddress)
  const pool = new ethers.Contract(poolAddress, WEIGHTED_POOL_ABI, provider)
  const poolId = await pool.getPoolId()

  console.log({ poolId })

  const vault = new ethers.Contract(VAULT, VAULT_ABI, provider.getSigner())
  console.log({ vault })

  // Tokens must be in the same order
  // Values must be decimal-normalized!
  const initialBalances = [BigInt(1e6), BigInt(1e6)]
  console.log({ initialBalances })

  // // Need to approve the Vault to transfer the tokens!
  // // Can do through Etherscan, or programmatically
  // for (const i in tokens) {
  //   const tokenContract = new ethers.Contract(tokens[i], ERC20_ABI, provider.getSigner())
  //   await tokenContract.approve(VAULT, initialBalances[i])
  // }

  // Construct userData
  const JOIN_KIND_INIT = 0
  const initUserData = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256[]'], [JOIN_KIND_INIT, initialBalances])

  const joinPoolRequest = {
    assets: tokens,
    maxAmountsIn: initialBalances,
    userData: initUserData,
    fromInternalBalance: false,
  }

  // joins are done on the Vault
  const joinTx = await vault.joinPool(poolId, safeAddr, safeAddr, joinPoolRequest)
  console.log({ joinTx })

  // You can wait for it like this, or just print the tx hash and monitor
  const receipt = await joinTx.wait()
  console.log({ receipt })
}

const DeployPoolButton = (): ReactElement => {
  const { sdk, safe } = useSafeAppsSDK()
  const web3Provider = useMemo(() => new ethers.providers.Web3Provider(new SafeAppProvider(safe, sdk)), [sdk, safe])

  return (
    <Button
      onClick={() => {
        ;(async () => {
          const { safeAddress } = await sdk.safe.getInfo()
          await deployPool(web3Provider, safeAddress)
        })()
      }}
      size="lg"
    >
      Deploy
    </Button>
  )
}

/////////////

const ModalButton = (): ReactElement => {
  const [isOpen, setIsOpen] = useState(false)
  const [weightsItemId, setWeightsItemId] = useState('0')

  const [activeCommitmentItemId, setActiveCommitmentItemId] = useState('0')
  const [durationItemId, setDurationItemId] = useState('2')

  return (
    <>
      <Button size="md" color="primary" onClick={() => setIsOpen(!isOpen)}>
        View
      </Button>
      {isOpen && (
        <GenericModal
          onClose={() => setIsOpen(false)}
          title="Strategy setup"
          body={
            <div>
              <Select
                name="weights"
                label="Weights"
                activeItemId={weightsItemId}
                onItemClick={setWeightsItemId}
                items={[
                  { id: '0', label: '20% GNT / 80% DAI' },
                  { id: '1', label: '50% GNT / 50% DAI' },
                  { id: '2', label: '80% GNT / 20% DAI' },
                ]}
              />
              <p></p>
              <Select
                name="commitment"
                label="Treasury committed"
                activeItemId={activeCommitmentItemId}
                onItemClick={setActiveCommitmentItemId}
                items={[
                  { id: '0', label: '10%' },
                  { id: '1', label: '20%' },
                  { id: '2', label: '50%' },
                  { id: '3', label: '80%' },
                  { id: '4', label: '100%' },
                ]}
              />
              <p></p>

              <Select
                name="duration"
                label="Duration"
                activeItemId={durationItemId}
                onItemClick={setDurationItemId}
                items={[
                  { id: '0', label: '1 month' },
                  { id: '1', label: '3 months' },
                  { id: '2', label: '6 months' },
                  { id: '3', label: '1 year' },
                  { id: '4', label: '2 years' },
                ]}
              />
            </div>
          }
          footer={<DeployPoolButton />}
        />
      )}
    </>
  )
}

const SafeApp = (): ReactElement => {
  const { sdk } = useSafeAppsSDK()
  const [balances, setBalances] = useState<AsyncReturnType<typeof getBalances>>([])

  useEffect(() => {
    ;(async () => {
      setBalances(await getBalances(sdk))
    })()
  }, [sdk])

  const pieChartData = balances.map((token) => ({
    title: token.symbol,
    value: token.fiatBalance,
    color: colorOfToken(token.symbol),
  }))

  const totalFiat = balances.map((token) => token.fiatBalance).reduce((a, b) => a + b, 0)

  return (
    <Container>
      <img src="./applogo.png" alt="Logo" style={{ width: '30%', marginBottom: '50px' }} />
      <Table>
        <tbody>
          <tr>
            <td>
              <Title size="md">Treasury Portfolio</Title>

              <PieChart
                data={pieChartData}
                paddingAngle={0.5}
                lineWidth={25}
                startAngle={-90}
                radius={20}
                animate={true}
              />
              <Table>
                <tbody>
                  {balances.map((token) => (
                    <tr key={token.symbol}>
                      <td>
                        <Tag background={colorOfToken(token.symbol)}>$ {token.symbol}</Tag>
                      </td>
                      <td>{token.name}</td>
                      <td>{Math.round((100 * token.fiatBalance) / totalFiat)}%</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </td>
            <td>
              <Card style={{ height: '100%', textAlign: 'center' }}>
                <Title size="sm">Current templates</Title>
                <Title size="xs">Stables</Title>
                <p>Pair DAO governance tokens with DAI</p>
                <ModalButton />
                <Divider />
                <Title size="xs">ETH</Title>
                <p>Pair DAO governance tokens with ETH</p>
                <ModalButton />
                <Divider />
                <Title size="xs">Yield</Title>
                <p>Pair DAO governance tokens with Lido staked ETH</p>
                <ModalButton />
              </Card>
            </td>
          </tr>
        </tbody>
      </Table>
    </Container>
  )
}

export default SafeApp
