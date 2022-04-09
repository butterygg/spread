import { ReactElement, useState, useEffect } from 'react'
import styled from 'styled-components'
import { Title } from '@gnosis.pm/safe-react-components'

import { PieChart } from 'react-minimal-pie-chart'

import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk'
import SafeAppsSDK from '@gnosis.pm/safe-apps-sdk/dist/src/sdk'

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

// const Link = styled.a`
//   margin-top: 8px;
// `

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
  const simpleBalances = ERC20Balances.map((token) => ({
    name: token.tokenInfo.name,
    symbol: token.tokenInfo.symbol,
    balance: parseFloat(token.balance),
    // ⚠️ Hardcoded GNT:USD
    fiatBalance:
      parseFloat(token.fiatConversion) === 0
        ? parseFloat(token.balance) / 1000000000000000000000000
        : parseFloat(token.fiatBalance),
  }))
  console.debug(simpleBalances)
  return simpleBalances
}

const colorOfToken = (symbol: string) => {
  switch (symbol) {
    case 'DAI':
      return 'yellow'
    case 'GNT':
      return '#DDDDE3'
    case 'ETH':
      return '#000AFF'
    default:
      return '#EF0000'
  }
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
      <Title size="md">Treasury Portfolio</Title>
      <PieChart data={pieChartData} paddingAngle={0.5} lineWidth={25} startAngle={-90} radius={20} animate={true} />
      <table>
        <tbody>
          {balances.map((token) => (
            <tr>
              <td>
                <Tag background={colorOfToken(token.symbol)}>$ {token.symbol}</Tag>
              </td>
              <td>{token.name}</td>
              <td>{Math.round((100 * token.fiatBalance) / totalFiat)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Container>
  )
}

export default SafeApp
