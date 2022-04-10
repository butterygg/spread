// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StreamSwapMarket
/// @notice Base abstract contract for setting up a market
abstract contract StreamSwapMarket is Ownable, SuperAppBase, Initializable {
    // Structs
    struct ShareholderUpdate {
        address shareholder;
        int96 previousFlowRate;
        int96 currentFlowRate;
        ISuperToken token;
    }

    struct OutputPool {
        ISuperToken token;
        uint128 feeRate; // Fee taken by the DAO on each output distribution
        uint256 emissionRate; // Rate to emit tokens if there's a balance, used for subsidies
        uint128 shareScaler; // The amount to scale back IDA shares of this output pool
    }

    struct Market {
        ISuperToken inputToken;
        uint256 lastDistributionAt; // The last time a distribution was made
        uint256 rateTolerance; // The percentage to deviate from the oracle scaled to 1e6
        uint128 feeRate;
        bytes32 poolId;
        address owner; // The owner of the market (reciever of fees)
        mapping(uint32 => OutputPool) outputPools; // Maps IDA indexes to their distributed Supertokens
        mapping(ISuperToken => uint32) outputPoolIndicies; // Maps tokens to their IDA indexes in OutputPools
        uint8 numOutputPools; // Indexes outputPools and outputPoolFees
    }

    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address
    Market internal market;
    uint32 internal constant PRIMARY_OUTPUT_INDEX = 0;
    uint8 internal constant MAX_OUTPUT_POOLS = 5;

    /// @dev Distribution event. Emitted on each token distribution operation.
    /// @param totalAmount Total distributed amount
    /// @param feeCollected Fee amount collected during distribution
    /// @param token Distributed token address
    event Distribution(
        uint256 totalAmount,
        uint256 feeCollected,
        address token
    );

    /// @dev Constructor
    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey
    ) {
        host = _host;
        cfa = _cfa;
        ida = _ida;

        transferOwnership(_owner);

        uint256 _configWord = SuperAppDefinitions.APP_LEVEL_FINAL;

        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(_configWord, _registrationKey);
        } else {
            host.registerApp(_configWord);
        }
    }

    // Setters

    /// @dev Set rate tolerance
    /// @param _rate This is the new rate we need to set to
    function setRateTolerance(uint256 _rate) external onlyOwner {
        market.rateTolerance = _rate;
    }

    /// @dev Sets fee rate for a output pool/token
    /// @param _index IDA index for the output pool/token
    /// @param _feeRate Fee rate for the output pool/token
    function setFeeRate(uint32 _index, uint128 _feeRate) external onlyOwner {
        market.outputPools[_index].feeRate = _feeRate;
    }

    /// @dev Sets emission rate for a output pool/token
    /// @param _index IDA index for the output pool/token
    /// @param _emissionRate Emission rate for the output pool/token
    function setEmissionRate(uint32 _index, uint128 _emissionRate)
        external
        onlyOwner
    {
        market.outputPools[_index].emissionRate = _emissionRate;
    }

    // Getters

    /// @dev Get input token address
    /// @return input token address
    function getInputToken() external view returns (ISuperToken) {
        return market.inputToken;
    }

    /// @dev Get output token address
    /// @return output token address
    function getOutputPool(uint32 _index)
        external
        view
        returns (OutputPool memory)
    {
        return market.outputPools[_index];
    }

    /// @dev Get total input flow rate
    /// @return input flow rate
    function getTotalInflow() external view returns (int96) {
        return cfa.getNetFlow(market.inputToken, address(this));
    }

    /// @dev Get last distribution timestamp
    /// @return last distribution timestamp
    function getLastDistributionAt() external view returns (uint256) {
        return market.lastDistributionAt;
    }

    // Emergency Admin Methods

    /// @dev Is app jailed in SuperFluid protocol
    /// @return is app jailed in SuperFluid protocol
    function isAppJailed() external view returns (bool) {
        return host.isAppJailed(this);
    }

    /// @dev Get rate tolerance
    /// @return Rate tolerance scaled to 1e6
    function getRateTolerance() external view returns (uint256) {
        return market.rateTolerance;
    }

    /// @dev Get fee rate for a given output pool/token
    /// @param _index IDA index for the output pool/token
    /// @return Fee rate for the output pool
    function getFeeRate(uint32 _index) external view returns (uint128) {
        return market.outputPools[_index].feeRate;
    }

    /// @dev Get emission rate for a given output pool/token
    /// @param _index IDA index for the output pool/token
    /// @return Emission rate for the output pool
    function getEmissionRate(uint32 _index) external view returns (uint256) {
        return market.outputPools[_index].emissionRate;
    }

    // Custom functionality that needs to be overrided by contract extending the base

    // Converts input token to output token
    function distribute(bytes memory _ctx)
        public
        virtual
        returns (bytes memory _newCtx);

    /// @dev Initializes market
    /// @param _inputToken Superfluid input token
    /// @param _rateTolerance Tolerance on rate
    /// @param _feeRate Fee rate
    function initializeMarket(
        ISuperToken _inputToken,
        uint256 _rateTolerance,
        uint128 _feeRate
    ) public virtual onlyOwner {
        require(
            address(market.inputToken) == address(0),
            "Already initialized"
        );
        market.inputToken = _inputToken;
        market.rateTolerance = _rateTolerance;
        market.feeRate = _feeRate;
    }

    /// @dev Add an output pool
    /// @param _token Superfluid token
    /// @param _feeRate Fee rate
    /// @param _emissionRate Emission rate
    /// @param _shareScaler Scaler
    /// @param _poolId Balancer pool id
    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        uint128 _shareScaler,
        bytes32 _poolId
    ) public virtual onlyOwner {
        require(market.numOutputPools < MAX_OUTPUT_POOLS, "Too many pools");

        OutputPool memory _newPool = OutputPool(
            _token,
            _feeRate,
            _emissionRate,
            _shareScaler
        );
        market.outputPools[market.numOutputPools] = _newPool;
        market.outputPoolIndicies[_token] = market.numOutputPools;
        _createIndex(market.numOutputPools, _token);
        market.numOutputPools++;
        market.poolId = _poolId;
    }

    // Standardized functionality for all StreamSwap Markets

    /// @dev Get flow rate for `_streamer`
    /// @param _streamer is streamer address
    /// @return _requesterFlowRate `_streamer` flow rate
    function getStreamRate(address _streamer, ISuperToken _token)
        external
        view
        returns (int96 _requesterFlowRate)
    {
        (, _requesterFlowRate, , ) = cfa.getFlow(
            _token,
            _streamer,
            address(this)
        );
    }

    /// @dev Get `_streamer` IDA subscription info for token with index `_index`
    /// @param _index Token index in IDA
    /// @param _streamer Streamer address
    /// @return _exist Whether the subscription exists
    /// @return _approved Whether the subscription is approved
    /// @return _units Units of the suscription
    /// @return _pendingDistribution Pending amount of tokens to be distributed for unapproved subscription
    function getIDAShares(uint32 _index, address _streamer)
        public
        view
        returns (
            bool _exist,
            bool _approved,
            uint128 _units,
            uint256 _pendingDistribution
        )
    {
        (_exist, _approved, _units, _pendingDistribution) = ida.getSubscription(
            market.outputPools[_index].token,
            address(this),
            _index,
            _streamer
        );
    }

    /// @dev Update share holder
    /// @param _ctx Context
    /// @param _shareholderUpdate Shareholder update
    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal virtual returns (bytes memory _newCtx) {
        // We need to go through all the output tokens and update their IDA shares
        _newCtx = _ctx;

        (uint128 userShares, uint128 daoShares) = _getShareAllocations(
            _shareholderUpdate
        );

        // updateOutputPools
        for (uint32 _index = 0; _index < market.numOutputPools; _index++) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                _index,
                _shareholderUpdate.shareholder,
                // shareholder gets 98% of the units, DAO takes 0.02%
                userShares,
                market.outputPools[_index].token
            );
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                _index,
                owner(),
                // shareholder gets 98% of the units, DAO takes 2%
                daoShares,
                market.outputPools[_index].token
            );
        }
    }

    /// @dev Get share allocations
    /// @param _shareholderUpdate Shareholder update
    function _getShareAllocations(ShareholderUpdate memory _shareholderUpdate)
        internal
        view
        returns (uint128 userShares, uint128 daoShares)
    {
        (, , daoShares, ) = getIDAShares(
            market.outputPoolIndicies[_shareholderUpdate.token],
            owner()
        );
        daoShares *= market
            .outputPools[market.outputPoolIndicies[_shareholderUpdate.token]]
            .shareScaler;

        // Compute the change in flow rate, will be negative is slowing the flow rate
        int96 changeInFlowRate = _shareholderUpdate.currentFlowRate -
            _shareholderUpdate.previousFlowRate;
        uint128 feeShares;
        // if the change is positive value then DAO has some new shares,
        // which would be 2% of the increase in shares
        if (changeInFlowRate > 0) {
            // Add new shares to the DAO
            feeShares = uint128(
                (uint256(int256(changeInFlowRate)) * market.feeRate) / 1e6
            );
            daoShares += feeShares;
        } else {
            // Make the rate positive
            changeInFlowRate = -1 * changeInFlowRate;
            feeShares = uint128(
                (uint256(int256(changeInFlowRate)) * market.feeRate) / 1e6
            );
            daoShares -= (feeShares > daoShares) ? daoShares : feeShares;
        }
        userShares =
            (uint128(uint256(int256(_shareholderUpdate.currentFlowRate))) *
                (1e6 - market.feeRate)) /
            1e6;

        // Scale back shares
        daoShares /= market
            .outputPools[market.outputPoolIndicies[_shareholderUpdate.token]]
            .shareScaler;
        userShares /= market
            .outputPools[market.outputPoolIndicies[_shareholderUpdate.token]]
            .shareScaler;
    }

    /// @dev Get shareholder info
    /// @param _agreementData Agreement data
    /// @param _superToken Superfluid token
    function _getShareholderInfo(
        bytes calldata _agreementData,
        ISuperToken _superToken
    )
        internal
        view
        returns (
            address _shareholder,
            int96 _flowRate,
            uint256 _timestamp
        )
    {
        (_shareholder, ) = abi.decode(_agreementData, (address, address));
        (_timestamp, _flowRate, , ) = cfa.getFlow(
            _superToken,
            _shareholder,
            address(this)
        );
    }

    /// @dev Distributes `_distAmount` amount of `_distToken` token among all IDA index subscribers
    /// @param _index IDA index ID
    /// @param _distAmount Amount to distribute
    /// @param _distToken Distribute token address
    /// @param _ctx SuperFluid context data
    /// @return _newCtx Updated SuperFluid context data
    function _idaDistribute(
        uint32 _index,
        uint128 _distAmount,
        ISuperToken _distToken,
        bytes memory _ctx
    ) internal returns (bytes memory _newCtx) {
        _newCtx = _ctx;
        if (_newCtx.length == 0) {
            // No context provided
            host.callAgreement(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0) // user data
            );
        } else {
            (_newCtx, ) = host.callAgreementWithContext(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0), // user data
                _newCtx
            );
        }
    }

    // Superfluid Agreement Management Methods

    /// @dev Create index
    /// @param index IDA index ID
    /// @param distToken Distribution token address
    function _createIndex(uint256 index, ISuperToken distToken) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.createIndex.selector,
                distToken,
                index,
                new bytes(0) // placeholder ctx
            ),
            new bytes(0) // user data
        );
    }

    /// @dev Set new `shares` share for `subscriber` address in IDA with `index` index
    /// @param index IDA index ID
    /// @param subscriber Subscriber address
    /// @param shares Distribution shares count
    /// @param distToken Distribution token address
    function _updateSubscription(
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                shares,
                new bytes(0) // placeholder ctx
            ),
            new bytes(0) // user data
        );
    }

    /// @dev Same as _updateSubscription but uses provided SuperFluid context data
    /// @param ctx SuperFluid context data
    /// @param index IDA index ID
    /// @param subscriber Subscriber address
    /// @param shares Distribution shares count
    /// @param distToken Distribution token address
    /// @return newCtx Updated SuperFluid context data
    function _updateSubscriptionWithContext(
        bytes memory ctx,
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal returns (bytes memory newCtx) {
        newCtx = ctx;
        (newCtx, ) = host.callAgreementWithContext(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                shares,
                new bytes(0)
            ),
            new bytes(0), // user data
            newCtx
        );
    }

    /// @dev Get the amount that needs to be returned back to the user
    /// @param _prevUpdateTimestamp Previous update timestamp
    /// @param _flowRate Flow rate
    /// @param _lastDistributedAt Last distributed at
    function _calcUserUninvested(
        uint256 _prevUpdateTimestamp,
        uint256 _flowRate,
        uint256 _lastDistributedAt
    ) internal view returns (uint256 _uninvestedAmount) {
        _uninvestedAmount =
            _flowRate *
            (block.timestamp -
                (
                    (_prevUpdateTimestamp > _lastDistributedAt)
                        ? _prevUpdateTimestamp
                        : _lastDistributedAt
                ));
    }

    // Boolean Helpers

    /// @dev Whether SuperToken is market's input token
    /// @param _superToken Super token
    function _isInputToken(ISuperToken _superToken)
        internal
        view
        virtual
        returns (bool)
    {
        return address(_superToken) == address(market.inputToken);
    }

    /// @dev Whether SuperToken is market's output token
    /// @param _superToken Super token
    function _isOutputToken(ISuperToken _superToken)
        internal
        view
        returns (bool)
    {
        return
            market.outputPools[market.outputPoolIndicies[_superToken]].token ==
            _superToken;
    }

    /// @dev Whether agreement type is CFAv1
    /// @param _agreementClass Agreement class
    function _isCFAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
            );
    }

    /// @dev Whether agreement type is IDAv1
    /// @param _agreementClass Agreement class
    function _isIDAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.InstantDistributionAgreement.v1"
            );
    }

    /// @dev Restricts calls to only from SuperFluid host
    function _onlyHost() internal view {
        require(msg.sender == address(host), "!host");
    }

    /// @dev Whether should distribute
    function _shouldDistribute() internal virtual returns (bool) {
        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                market.outputPools[PRIMARY_OUTPUT_INDEX].token,
                address(this),
                PRIMARY_OUTPUT_INDEX
            );

        // Check balance and account for just 1 input token
        uint256 _balance = market.inputToken.balanceOf(address(this));

        return _totalUnitsApproved + _totalUnitsPending > 0 && _balance > 0;
    }

    /// @dev Restrictions on flow rate
    /// @param _superToken Super Token
    /// @param _flowRate Flow rate
    function _onlyScalable(ISuperToken _superToken, int96 _flowRate)
        internal
        virtual
    {
        // Enforce speed limit on flowRate
        require(
            uint128(uint256(int256(_flowRate))) %
                (market
                    .outputPools[market.outputPoolIndicies[_superToken]]
                    .shareScaler * 1e3) ==
                0,
            "notScalable"
        );
    }

    // Superfluid Functions - refer to their docs on callbacks

    function beforeAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata // _ctx
    ) external view virtual override returns (bytes memory _cbdata) {}

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;

        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx);
        }

        (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        _onlyScalable(_superToken, _flowRate);

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            0,
            _flowRate,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
    }

    function beforeAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        // Get the stakeholders current flow rate and save it in cbData
        (, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        _cbdata = abi.encode(_flowRate);
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        _onlyScalable(_superToken, _flowRate);

        int96 _beforeFlowRate = abi.decode(_cbdata, (int96));

        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx);
        }

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            _beforeFlowRate,
            _flowRate,
            _superToken
        );

        // TODO: Udpate shareholder needs before and after flow rate
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
    }

    // We need before agreement to get the uninvested amount using the flowRate before update
    function beforeAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        (, int96 _flowRateMain, uint256 _timestamp) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        uint256 _uinvestAmount = _calcUserUninvested(
            _timestamp,
            uint256(uint96(_flowRateMain)),
            market.lastDistributionAt
        );
        _cbdata = abi.encode(_uinvestAmount, _flowRateMain);
    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, ) = abi.decode(
            _agreementData,
            (address, address)
        );
        (uint256 _uninvestAmount, int96 _beforeFlowRate) = abi.decode(
            _cbdata,
            (uint256, int96)
        );

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            _beforeFlowRate,
            0,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
        // Refund the unswapped amount back to the person who started the stream
        try
            market.inputToken.transferFrom(
                address(this),
                _shareholder,
                _uninvestAmount
            )
        // solhint-disable-next-line no-empty-blocks
        {

        } catch {
            // Nothing to do, pass
        }
    }
}
