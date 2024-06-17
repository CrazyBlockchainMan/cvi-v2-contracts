// SPDX-License-Identifier: MIT

pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import './interfaces/ICurveFi.sol';

contract CVIStableSwap {
    
    using SafeERC20 for IERC20;
    using Address for address;
    
    address public curveFiTrader = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;  // CurveFi - 3Pool ( 0 : DAI, 1 : USDC, 2 : USDT )
    address public daiToken = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public usdcToken = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public usdtToken = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    
    constructor() {
    }
    
    function swapDAItoUSDC(uint256 amount) public {
        IERC20(daiToken).safeTransferFrom(msg.sender, address(this), amount);
        
        _executeCurveSwap(daiToken, 0, amount);
        
        uint256 balance = IERC20(usdcToken).balanceOf(address(this));
        require(balance > 0, "Swapped USDC balance should be greater than zero.");
        
        IERC20(usdcToken).safeTransfer(msg.sender, balance);
    }
    
    function swapUSDTtoUSDC(uint256 amount) public {
        IERC20(usdtToken).safeTransferFrom(msg.sender, address(this), amount);
        
        _executeCurveSwap(usdtToken, 2, amount);
        
        uint256 balance = IERC20(usdcToken).balanceOf(address(this));
        require(balance > 0, "Swapped USDC balance should be greater than zero.");
        
        IERC20(usdcToken).safeTransfer(msg.sender, balance);
    }
    
    // Performing Curve Swap on 3USD Pool
    function _executeCurveSwap(address token, int128 tokenIdx, uint256 amount) internal {
        IERC20(token).safeApprove(curveFiTrader, amount);
        
        bytes memory data = abi.encodeWithSelector(ICurveFi(curveFiTrader).exchange.selector, tokenIdx, 1, amount, 0);
        bytes memory returndata = curveFiTrader.functionCall(data, "CVIStableSwap: CurveFi Low-Level Call failed.");
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "CVIStableSwap: CurveFi StableSwap Operation did not succeed.");
        }
    }
}