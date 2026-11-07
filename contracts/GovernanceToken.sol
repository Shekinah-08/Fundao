// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @notice Jeton de gouvernance. Les membres doivent déléguer leurs voix (à eux-mêmes ou à un tiers).
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    mapping(address => bool) public hasClaimedTestTokens;
    uint256 public constant TEST_FAUCET_AMOUNT = 100 ether;

    constructor(address initialOwner)
        ERC20("Fonds Etudiant Governance", "FEG")
        ERC20Permit("Fonds Etudiant Governance")
        Ownable(initialOwner)
    {}

    /// @notice Faucet public réservé au réseau de test : chaque portefeuille peut réclamer 100 FEG une seule fois.
    /// @dev À désactiver/supprimer avant tout déploiement en production.
    function claimTestTokens() external {
        require(!hasClaimedTestTokens[msg.sender], "Already claimed");
        hasClaimedTestTokens[msg.sender] = true;
        _mint(msg.sender, TEST_FAUCET_AMOUNT);
        _delegate(msg.sender, msg.sender);
    }

    /// @notice Distribue les droits de vote aux membres approuvés par l'association.
    function mintMember(address member, uint256 amount) external onlyOwner {
        require(member != address(0), "Invalid member");
        require(amount > 0, "Amount is zero");
        _mint(member, amount);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
