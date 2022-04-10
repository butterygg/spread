![Butter_VI_Final_Full Logo_Light_2x2 5%](https://user-images.githubusercontent.com/1884912/162629474-1a630853-9b88-43db-b38b-08eaf3cfab9c.png)


# Butter

DAO treasuries comprise the entirety of the resources available to a DAO and carry **significant risk of downside exposure to prolonged bouts of market volatility.**

Often treasury value is concentrated in one or a few tokens, typically the governance token, creating an existential risk around the DAOs ability to achieve its mission and fund ongoing operations.

Butter helps DAOs to spread their treasury into other assets by curating the best and safest diversification strategies, while giving them fine-grained controls over how each strategy is executed

## How it's made

On the front end, we used Balancer V2's SDK to generate Balancer pools based on user inputs. We were also looking into Superfluid's core SDK to wrap the assets the user has in order to be able to stream those assets to our smart contract. On the contract side, we used a minimal forked version of Ricochet (which leverages Superfluid and SushiSwap) swapping out the Sushi logic for Balancer V2 logic. This contract helped in dealing with Superfluid streams and the unwrapping/wrapping process around Super Tokens and the Balancer V2 vault.
