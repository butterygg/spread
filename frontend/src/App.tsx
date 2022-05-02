import { ReactElement, useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import { PieChart } from 'react-minimal-pie-chart'
import { ethers } from 'ethers'
import { Button, Title, Card, Divider, GenericModal, Select } from '@gnosis.pm/safe-react-components'
import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk'
import SafeAppsSDK from '@gnosis.pm/safe-apps-sdk/dist/src/sdk'
import { SafeAppProvider } from '@gnosis.pm/safe-apps-provider'

import * as poolManager from './poolManager'

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

type Balance = {
  name: string
  symbol: string
  balance: number
  fiatBalance: number
}

const getBalances = async (sdk: SafeAppsSDK): Promise<Balance[]> => {
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

const DeployPoolButton = (): ReactElement => {
  const { sdk, safe } = useSafeAppsSDK()
  const web3Provider = useMemo(() => new ethers.providers.Web3Provider(new SafeAppProvider(safe, sdk)), [sdk, safe])

  return (
    <Button
      onClick={() => {
        ;(async () => {
          const { safeAddress } = await sdk.safe.getInfo()
          await poolManager.deployPool(web3Provider, safeAddress)
        })()
      }}
      size="lg"
    >
      Deploy
    </Button>
  )
}

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
  const [balances, setBalances] = useState<Balance[]>([])

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
