// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IVault, IAsset} from "./interfaces/IVault.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./StreamSwapMarket.sol";
import "hardhat/console.sol";

/// @title StreamSwapOneWayMarket
/// @notice One way market (swaps input for output token) using Balancer V2
contract StreamSwapOneWayMarket is StreamSwapMarket {
    using SafeERC20 for ERC20;

    uint32 constant OUTPUT_INDEX = 0;
    IVault vault = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

    /// @dev Constructor
    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey
    ) public StreamSwapMarket(_owner, _host, _cfa, _ida, _registrationKey) {}

    /// @dev Initializes one-way market
    /// @param _inputToken Superfluid input token
    /// @param _rateTolerance Tolerance on rate
    /// @param _outputToken Superfluid output token
    /// @param _feeRate Fee rate
    /// @param _shareScaler Amount to scale back shares of pool
    /// @param _poolId Balancer pool id
    function initializeOneWayMarket(
        ISuperToken _inputToken,
        uint256 _rateTolerance,
        ISuperToken _outputToken,
        uint128 _feeRate,
        uint128 _shareScaler,
        bytes32 _poolId
    ) public onlyOwner initializer {
        StreamSwapMarket.initializeMarket(
            _inputToken,
            _rateTolerance,
            _feeRate
        );
        addOutputPool(_outputToken, _feeRate, 0, _shareScaler, _poolId);

        // Approvals
        // Unlimited approve for sushiswap
        ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(
            address(vault),
            2**256 - 1
        );

        ERC20(market.outputPools[0].token.getUnderlyingToken())
            .safeIncreaseAllowance(address(vault), 2**256 - 1);
        // and Supertoken upgrades

        ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(
            address(market.inputToken),
            2**256 - 1
        );

        ERC20(market.outputPools[OUTPUT_INDEX].token.getUnderlyingToken())
            .safeIncreaseAllowance(
                address(market.outputPools[OUTPUT_INDEX].token),
                2**256 - 1
            );
    }

    /// @dev Set vault
    /// @param _vault New vault
    function setVault(address _vault) public onlyOwner {
        vault = IVault(_vault);
    }

    /// @dev Conducts swap
    /// @param ctx Superfluid context
    function distribute(bytes memory ctx)
        public
        override
        returns (bytes memory newCtx)
    {
        newCtx = ctx;

        // No oracle requirement
        _swap(
            market.inputToken,
            market.outputPools[OUTPUT_INDEX].token,
            market.poolId,
            ISuperToken(market.inputToken).balanceOf(address(this)),
            block.timestamp + 3600
        );

        // market.outputPools[0] MUST be the output token of the swap
        uint256 outputBalance = market
            .outputPools[OUTPUT_INDEX]
            .token
            .balanceOf(address(this));
        (uint256 actualAmount, ) = ida.calculateDistribution(
            market.outputPools[0].token,
            address(this),
            0,
            outputBalance
        );
        // Return if there's not anything to actually distribute
        if (actualAmount == 0) {
            return newCtx;
        }

        // Calculate the fee for making the distribution
        uint256 feeCollected = (actualAmount * market.feeRate) / 1e6;
        uint256 distAmount = actualAmount - feeCollected;

        // Make the distribution for output pool 0
        newCtx = _idaDistribute(
            0,
            uint128(actualAmount),
            market.outputPools[OUTPUT_INDEX].token,
            newCtx
        );
        emit Distribution(
            actualAmount,
            feeCollected,
            address(market.outputPools[OUTPUT_INDEX].token)
        );

        // Go through the other OutputPools and trigger distributions
        for (uint32 index = 1; index < market.numOutputPools; index++) {
            outputBalance = market.outputPools[index].token.balanceOf(
                address(this)
            );
            if (outputBalance > 0) {
                if (market.feeRate != 0) {
                    newCtx = _idaDistribute(
                        index,
                        uint128(outputBalance),
                        market.outputPools[index].token,
                        newCtx
                    );
                    emit Distribution(
                        outputBalance,
                        feeCollected,
                        address(market.outputPools[index].token)
                    );
                } else {
                    actualAmount =
                        (block.timestamp - market.lastDistributionAt) *
                        market.outputPools[index].emissionRate;
                    if (actualAmount < outputBalance) {
                        newCtx = _idaDistribute(
                            index,
                            uint128(actualAmount),
                            market.outputPools[index].token,
                            newCtx
                        );
                        emit Distribution(
                            actualAmount,
                            0,
                            address(market.outputPools[index].token)
                        );
                    }
                }
            }
        }

        market.lastDistributionAt = block.timestamp;
    }

    /// @dev Swap via Balancer V2 vault
    /// @param input Superfluid input token
    /// @param output Superfluid output token
    /// @param poolId pool id
    /// @param amount Assumes outputToken.balanceOf(address(this))
    /// @param deadline Deadline for swap
    function _swap(
        ISuperToken input,
        ISuperToken output,
        bytes32 poolId,
        uint256 amount, // Assumes
        uint256 deadline
    ) internal returns (uint256) {
        address inputToken; // The underlying input token address
        address outputToken; // The underlying output token address
        uint256 outputAmount; // The balance before the swap

        inputToken = input.getUnderlyingToken();
        outputToken = output.getUnderlyingToken();

        // Downgrade and scale the input amount
        input.downgrade(amount);

        // Scale it to 1e18 for calculations
        amount =
            ERC20(inputToken).balanceOf(address(this)) *
            (10**(18 - ERC20(inputToken).decimals()));

        // Scale it back to inputToken decimals
        amount = amount / (10**(18 - ERC20(inputToken).decimals()));

        // Swap via Balancer
        IVault.SingleSwap memory singleSwap = IVault.SingleSwap(
            poolId,
            IVault.SwapKind.GIVEN_IN,
            IAsset(inputToken),
            IAsset(outputToken),
            amount,
            ""
        );
        IVault.FundManagement memory fundMgmt = IVault.FundManagement(
            address(this),
            false,
            payable(address(this)),
            false
        );
        vault.swap(singleSwap, fundMgmt, 1, deadline);

        // Assumes `amount` was outputToken.balanceOf(address(this))
        outputAmount = ERC20(outputToken).balanceOf(address(this));
        //require(outputAmount >= minOutput, "BAD_EXCHANGE_RATE: Try again later");

        // Convert the outputToken back to its supertoken version
        output.upgrade(
            outputAmount * (10**(18 - ERC20(outputToken).decimals()))
        );

        return outputAmount;
    }
}
