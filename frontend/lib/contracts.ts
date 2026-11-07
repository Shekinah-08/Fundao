export const TOKEN_ABI = [
  {type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'getVotes',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'delegate',stateMutability:'nonpayable',inputs:[{name:'delegatee',type:'address'}],outputs:[]},
  {type:'function',name:'claimTestTokens',stateMutability:'nonpayable',inputs:[],outputs:[]},
  {type:'function',name:'hasClaimedTestTokens',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'bool'}]},
  {type:'function',name:'mintMember',stateMutability:'nonpayable',inputs:[{name:'member',type:'address'},{name:'amount',type:'uint256'}],outputs:[]},
  {type:'function',name:'totalSupply',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},
  {type:'function',name:'owner',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}
] as const;

export const GOVERNOR_ABI = [
  {type:'function',name:'propose',stateMutability:'nonpayable',inputs:[{name:'targets',type:'address[]'},{name:'values',type:'uint256[]'},{name:'calldatas',type:'bytes[]'},{name:'description',type:'string'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'castVote',stateMutability:'nonpayable',inputs:[{name:'proposalId',type:'uint256'},{name:'support',type:'uint8'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'state',stateMutability:'view',inputs:[{name:'proposalId',type:'uint256'}],outputs:[{type:'uint8'}]},
  {type:'function',name:'proposalVotes',stateMutability:'view',inputs:[{name:'proposalId',type:'uint256'}],outputs:[{name:'againstVotes',type:'uint256'},{name:'forVotes',type:'uint256'},{name:'abstainVotes',type:'uint256'}]},
  {type:'function',name:'queue',stateMutability:'nonpayable',inputs:[{name:'targets',type:'address[]'},{name:'values',type:'uint256[]'},{name:'calldatas',type:'bytes[]'},{name:'descriptionHash',type:'bytes32'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'execute',stateMutability:'payable',inputs:[{name:'targets',type:'address[]'},{name:'values',type:'uint256[]'},{name:'calldatas',type:'bytes[]'},{name:'descriptionHash',type:'bytes32'}],outputs:[{type:'uint256'}]},
  {type:'function',name:'hashProposal',stateMutability:'pure',inputs:[{name:'targets',type:'address[]'},{name:'values',type:'uint256[]'},{name:'calldatas',type:'bytes[]'},{name:'descriptionHash',type:'bytes32'}],outputs:[{type:'uint256'}]},
  {type:'event',name:'ProposalCreated',anonymous:false,inputs:[{indexed:true,name:'proposalId',type:'uint256'},{indexed:true,name:'proposer',type:'address'},{indexed:false,name:'targets',type:'address[]'},{indexed:false,name:'values',type:'uint256[]'},{indexed:false,name:'signatures',type:'string[]'},{indexed:false,name:'calldatas',type:'bytes[]'},{indexed:false,name:'voteStart',type:'uint256'},{indexed:false,name:'voteEnd',type:'uint256'},{indexed:false,name:'description',type:'string'}]}
] as const;

export const TIMELOCK_ABI = [
  {type:'function',name:'getMinDelay',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]}
] as const;
